#!/usr/bin/env python3
"""청룡신검 and 현무불괴갑 as the original draws them worn, laid on 연's heroes.

    sinsu_worn.py fetch GEAR_DIR
    sinsu_worn.py build GEAR_DIR

연 has neither piece. The official dress room renders the original worn
(https://avatar.baram.nexon.com/Coordi/RenderAvatar/M?pi=<item>&cd=<dir>&mt=<motion>, the address
tools/fetch_gear.py uses: an animated GIF on a 332x304 canvas, the feet at (167, 231); cd 2 front,
1 right, 0 back, 3 left; mt 1 stand, 2 walk, 3 attack, 4 magic).

fetch: every direction and motion of each piece and of the plain figure (no pi) into
GEAR_DIR/sinsu_worn/raw/<key>_<cd>_<mt>.gif (kept when already there).

build: the piece's own pixels, frame by frame (where its render differs from the plain figure's),
laid on 연's heroes as layers in the heroes' own sheet layout (GEAR_DIR/yhero2/index.json: each
class's clips, cell and feet), scaled from the original figure to 연's (their heights, feet to the
top of the head):
  - 청룡신검 (the 전사): the blade as the original holds it in that pose (stand, walk, attack,
    magic; front, back, side), put where 연's hand is in that frame (the hand drawn with 연's own
    weapon layer of the class's 구곡검 look, its skin pixels), 연's fist drawn over the grip. 연's down /
    up / side rows take the original's front / back / left. The layer is in front of the body
    except where the original draws the blade behind it (facing away).
  - 현무불괴갑 (every class): the wings and the flaring gold of the shoulders (the piece's pixels off
    the plain figure's body), set on 연's shoulders; behind the body from the front and the side,
    over it from behind. The body itself stays 연's outfit (items.js).
Writes GEAR_DIR/sinsu_worn/<piece>_<class>.png and GEAR_DIR/sinsu_worn/index.json:
    {cls: {piece: {"kind", "file", "cols", "cell", "foot", "side"}}}
(prepare_assets.py copies them to yhero2/sinsu/ and adds them to the heroes' layers as "s_<piece>").
Each laid piece is touched up for 연: scaled to 연's figure, specks dropped, a dark outline round its
solid parts (touch_up). Any other original piece can be laid the same way (PIECES / MODE: its name,
'weapon' or 'wings', its classes); 진일신검 is made for the warrior as the 태초 weapons' test.

"""
import io
import json
import os
import sys
import time
import urllib.parse
import urllib.request

import numpy as np
from PIL import Image

COORDI = "https://avatar.baram.nexon.com/Coordi/RenderAvatar/M"
FEET = (167, 231)
# key: (item name, how it is laid: 'weapon' on the hand / 'wings' on the shoulders, the classes
# or None for all). More can be added the same way (the 태초 weapons: tools/sinsu_worn.py is generic).
PIECES = {'cheong': '청룡신검', 'hyeonmu': '현무불괴갑', 'jinil': '진일신검'}
MODE = {'cheong': ('weapon', ['warrior']), 'hyeonmu': ('wings', None), 'jinil': ('weapon', ['warrior'])}
DIRS = {'down': 2, 'up': 0, 'side': 3}
MOTIONS = {'idle': 1, 'walk': 2, 'atk': 3, 'cast': 4}


def fetch(gear):
    raw = os.path.join(gear, 'sinsu_worn', 'raw')
    os.makedirs(raw, exist_ok=True)
    for key, item in [('base', None)] + list(PIECES.items()):
        for cd in range(4):
            for mt in (1, 2, 3, 4):
                path = os.path.join(raw, f'{key}_{cd}_{mt}.gif')
                if os.path.exists(path):
                    continue
                q = f'?cd={cd}&mt={mt}&ha=1&bt=0' + (f'&pi={urllib.parse.quote(item)}' if item else '')
                for attempt in range(3):
                    try:
                        with urllib.request.urlopen(COORDI + q, timeout=40) as r:
                            data = r.read()
                        break
                    except Exception as e:  # noqa: BLE001 - retried
                        if attempt == 2:
                            raise
                        time.sleep(2)
                open(path, 'wb').write(data)
                print(path, len(data))


def frames(path):
    im = Image.open(path)
    out = []
    for i in range(getattr(im, 'n_frames', 1)):
        im.seek(i)
        out.append(np.asarray(im.convert('RGBA')).copy())
    return out


def opaque(a):
    """The drawn pixels of a render (its background is transparent or plain white)."""
    al = a[..., 3] > 0
    white = (a[..., 0] > 250) & (a[..., 1] > 250) & (a[..., 2] > 250)
    return al & ~white


def piece_pixels(item, base):
    """The piece's own pixels: drawn in its render where the plain figure has nothing or other colours."""
    oi, ob = opaque(item), opaque(base)
    diff = np.abs(item[..., :3].astype(int) - base[..., :3].astype(int)).sum(-1) > 24
    keep = oi & (~ob | diff)
    out = item.copy()
    out[..., 3] = np.where(keep, 255, 0)
    return out, ob


def skin(a):
    r, g, b = a[..., 0].astype(int), a[..., 1].astype(int), a[..., 2].astype(int)
    return (r > 170) & (g > 115) & (g < 228) & (b < 175) & (r - b > 45)


def bbox(mask):
    ys, xs = np.nonzero(mask)
    if not len(xs):
        return None
    return xs.min(), ys.min(), xs.max(), ys.max()


def scaled(rgba, k):
    """A cut-out piece scaled k times (nearest past 1, area under: 연's heroes are smaller)."""
    im = Image.fromarray(rgba)
    w, h = max(1, round(im.width * k)), max(1, round(im.height * k))
    if k >= 1:
        return np.asarray(im.resize((w, h), Image.NEAREST))
    # premultiplied area resize, then the edge kept hard (pixel art)
    a = np.asarray(im).astype(float)
    pm = a.copy()
    pm[..., :3] *= a[..., 3:4] / 255
    r = np.asarray(Image.fromarray(pm.astype(np.uint8)).resize((w, h), Image.BOX)).astype(float)
    al = np.asarray(im.getchannel('A').resize((w, h), Image.BOX)).astype(float)
    outp = np.zeros((h, w, 4), np.uint8)
    m = al > 100
    outp[..., :3] = np.where(al[..., None] > 0, np.clip(r[..., :3] * 255 / np.maximum(al[..., None], 1), 0, 255), 0).astype(np.uint8)
    outp[..., 3] = np.where(m, 255, 0)
    return outp


def touch_up(a, mode):
    """The scaled piece set in 연's manner: specks under 3 pixels dropped, and a dark outline round
    the solid parts (연's heroes are drawn outlined; the original's blade edge is not). The swing's
    water and other glowing colours (bright and saturated) get no outline."""
    from scipy.ndimage import binary_dilation, label
    m = a[..., 3] > 0
    lab, n = label(m)
    if n:
        sizes = np.bincount(lab.ravel())
        m = np.isin(lab, [i for i in range(1, n + 1) if sizes[i] >= 3])
    out = a.copy()
    out[..., 3] = np.where(m, 255, 0)
    rgb = a[..., :3].astype(int)
    mx, mn = rgb.max(-1), rgb.min(-1)
    glow = (mx > 150) & ((mx - mn) > 0.55 * mx)
    solid = m & ~glow
    pad = np.zeros((a.shape[0] + 2, a.shape[1] + 2, 4), np.uint8)
    pad[1:-1, 1:-1] = out
    ring = binary_dilation(np.pad(solid, 1), iterations=1) & ~np.pad(m, 1)
    pad[ring] = (22, 18, 26, 255)
    return pad


def build(gear):
    root = os.path.join(gear, 'sinsu_worn')
    raw = os.path.join(root, 'raw')
    h2 = os.path.join(gear, 'yhero2')
    index = json.load(open(os.path.join(h2, 'index.json'), encoding='utf-8'))
    R = {}

    def render(key, cd, mt):
        k = (key, cd, mt)
        if k not in R:
            R[k] = frames(os.path.join(raw, f'{key}_{cd}_{mt}.gif'))
        return R[k]

    # The original figure's height (feet to the top of the head), standing, front.
    b0 = bbox(opaque(render('base', 2, 1)[0]))
    pc_h = FEET[1] - b0[1]
    out = {}
    for cls, H in index.items():
        if not isinstance(H, dict) or 'anims' not in H:
            continue
        cw, ch = H['cell']
        fx, fy = H['foot']
        body = H['layers'].get('body', {}).get('base')
        if not body:
            continue
        bim = np.asarray(Image.open(os.path.join(h2, body['file'])).convert('RGBA'))
        bcw, bch = body.get('cell', [cw, ch])
        bfx, bfy = body.get('foot', [fx, fy])
        # 연's figure: feet to the top of the head, standing facing down (its head layer on).
        hd = H['layers'].get('head', {}).get('base')
        ia = H['anims']['idle_down']
        top = None
        for meta in [body, hd] if hd else [body]:
            im = np.asarray(Image.open(os.path.join(h2, meta['file'])).convert('RGBA'))
            mcw, mch = meta.get('cell', [cw, ch])
            mfx, mfy = meta.get('foot', [fx, fy])
            cell = im[ia['row'] * mch:(ia['row'] + 1) * mch, 0:mcw]
            bb = bbox(cell[..., 3] > 30)
            if bb:
                t = bb[1] - mfy
                top = t if top is None else min(top, t)
        k = (-top) / pc_h
        rows = max(a['row'] for a in H['anims'].values()) + 1
        cols = max(a['n'] for a in H['anims'].values())
        for piece in PIECES:
            mode, only = MODE[piece]
            if only and cls not in only:
                continue
            # the 연 hand per frame: skin pixels of the class's own weapon layer
            wl = None
            if mode == 'weapon':
                wmeta = H['layers']['weapon'].get('70019') or next(iter(H['layers']['weapon'].values()))
                wl = (np.asarray(Image.open(os.path.join(h2, wmeta['file'])).convert('RGBA')), wmeta)
            PAD = 70
            ocw, och = cw + 2 * PAD, ch + 2 * PAD
            ofx, ofy = fx + PAD, fy + PAD
            sheet = np.zeros((rows * och, cols * ocw, 4), np.uint8)
            side = {}
            for name, a in H['anims'].items():
                if name == 'dead':
                    continue
                motion, d = name.split('_')
                cd = DIRS[d]
                # (a cast shows the stand: the original's magic pose puts the weapon away and
                # draws a spell circle on the ground)
                mt = MOTIONS['idle'] if motion == 'cast' else MOTIONS[motion]
                its = render(piece, cd, mt)
                bas = render('base', cd, mt)
                side[a['row']] = ''
                for f in range(a['n']):
                    # the original frame for 연's frame f (the original walks in 4, strikes in its own count)
                    j = min(len(its) - 1, f * len(its) // a['n'])
                    if motion == 'atk':
                        j = min(len(its) - 1, f)  # wind-up, then the blow (held over 연's last frame)
                    pp, ob = piece_pixels(its[j], bas[min(j, len(bas) - 1)])
                    if mode == 'wings':
                        # off the plain figure's body (grown a little): wings and shoulder flares
                        from scipy.ndimage import binary_dilation, label
                        far = ~binary_dilation(ob, iterations=2)
                        m = (pp[..., 3] > 0) & far
                        lab, n = label(m)
                        if n:
                            sizes = np.bincount(lab.ravel())
                            # kept: the big pieces, and those that start above the waist (stray bits of
                            # the sleeves and the robe's hem round the hands and feet are dropped)
                            waist = FEET[1] - 0.5 * pc_h
                            tops = {i: np.nonzero(lab == i)[0].min() for i in range(1, n + 1)}
                            keep = np.isin(lab, [i for i in range(1, n + 1) if sizes[i] >= 200 or (sizes[i] >= 25 and tops[i] < waist)])
                            m = keep
                        pp[..., 3] = np.where(m, 255, 0)
                    bb = bbox(pp[..., 3] > 0)
                    if not bb:
                        side[a['row']] += '.'
                        continue
                    x0, y0, x1, y1 = bb
                    cut = pp[y0:y1 + 1, x0:x1 + 1]
                    sc = touch_up(scaled(cut, k), mode)
                    if mode == 'weapon':
                        # anchor: the original hand (plain figure's skin touching the blade) on 연's hand
                        from scipy.ndimage import binary_dilation
                        near = binary_dilation(pp[..., 3] > 0, iterations=2) & skin(bas[min(j, len(bas) - 1)]) & ob
                        hb = bbox(near)
                        if hb is None:
                            ohx, ohy = (x0 + x1) / 2, y1
                        else:
                            ohx, ohy = (hb[0] + hb[2]) / 2, (hb[1] + hb[3]) / 2
                        wim, wm = wl
                        wcw, wch = wm.get('cell', [cw, ch])
                        wfx, wfy = wm.get('foot', [fx, fy])
                        wc = wim[a['row'] * wch:(a['row'] + 1) * wch, f * wcw:(f + 1) * wcw]
                        sb = bbox(skin(wc) & (wc[..., 3] > 100))
                        if sb is None:
                            sb = bbox(wc[..., 3] > 100)
                        if sb is None:
                            hx, hy = fx, fy - 20
                        else:
                            hx, hy = (sb[0] + sb[2]) / 2 - wfx + fx, (sb[1] + sb[3]) / 2 - wfy + fy
                        px = round(hx - (ohx - x0) * k)
                        py = round(hy - (ohy - y0) * k)
                        # in front unless the original draws it behind the figure (facing away)
                        cover = (pp[..., 3] > 0) & ob
                        side[a['row']] += 'b' if d == 'up' and not cover.any() else 'f'
                    else:
                        # from the original feet, scaled; raised a little (연's shoulders sit lower
                        # under its bigger head than the scale alone puts them)
                        px = round(fx + (x0 - FEET[0]) * k)
                        py = round(fy + (y0 - FEET[1]) * k) + 2
                        side[a['row']] += 'f' if d == 'up' else 'b'
                    px, py = px - 1, py - 1  # touch_up's one-pixel margin for the outline
                    ox, oy = f * ocw + PAD + px, a['row'] * och + PAD + py
                    h, w = sc.shape[:2]
                    y_0, x_0 = max(oy, a['row'] * och), max(ox, f * ocw)
                    y_1, x_1 = min(oy + h, (a['row'] + 1) * och), min(ox + w, (f + 1) * ocw)
                    if y_1 <= y_0 or x_1 <= x_0:
                        continue
                    src = sc[y_0 - oy:y_1 - oy, x_0 - ox:x_1 - ox]
                    dst = sheet[y_0:y_1, x_0:x_1]
                    m = src[..., 3:4] > 0
                    sheet[y_0:y_1, x_0:x_1] = np.where(m, src, dst)
                    if mode == 'weapon':
                        # 연's own fist over the grip (the skin of the class's weapon layer, and the
                        # dark outline round it), so the hand holds the original blade
                        from scipy.ndimage import binary_dilation
                        sk = skin(wc) & (wc[..., 3] > 100)
                        hand = binary_dilation(sk, iterations=1) & (wc[..., 3] > 100) & (sk | (wc[..., :3].max(-1) < 70))
                        ys, xs = np.nonzero(hand)
                        for yy, xx in zip(ys, xs):
                            ty, tx = a['row'] * och + PAD + yy - wfy + fy, f * ocw + PAD + xx - wfx + fx
                            if 0 <= ty < sheet.shape[0] and 0 <= tx < sheet.shape[1]:
                                sheet[ty, tx] = wc[yy, xx]
            fname = f'{piece}_{cls}.png'
            Image.fromarray(sheet).save(os.path.join(root, fname), optimize=True)
            out.setdefault(cls, {})[piece] = {'kind': 'weapon' if mode == 'weapon' else 'aback', 'file': 'sinsu/' + fname,
                                               'cols': cols, 'cell': [ocw, och], 'foot': [ofx, ofy],
                                               'side': [side.get(r, '') for r in range(rows)], 'k': round(k, 3)}
            print(cls, piece, 'k', round(k, 3))
    json.dump(out, open(os.path.join(root, 'index.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    {'fetch': fetch, 'build': build}[sys.argv[1]](sys.argv[2])
