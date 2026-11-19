#!/usr/bin/env python3
"""Pieces 연 lacks, as the original draws them worn, laid on 연's heroes (청룡신검, 현무불괴갑, ...).

    sinsu_worn.py fetch GEAR_DIR [CONFIG_JSON] [--quick]
    sinsu_worn.py build GEAR_DIR [CONFIG_JSON] [OUT_DIR]

CONFIG_JSON (default tools/sinsu_worn.json): {key: {"item": name, "mode": "weapon" | "wings",
"classes": [cls, ...] (absent: all), "gauntlet": true (a hilt worn as a glove: always on the fist)}}. --quick fetches only standing and striking (front, back,
left): enough for candidate sheets; build then shows the stand where a walk or a cast is missing.
OUT_DIR (default GEAR_DIR/sinsu_worn) takes the layers and index.json.

연 has neither 사신수 piece. The official dress room renders the original worn
(https://avatar.baram.nexon.com/Coordi/RenderAvatar/M?pi=<item>&cd=<dir>&mt=<motion>, the address
tools/fetch_gear.py uses: an animated GIF on a 332x304 canvas, the feet at (167, 231); cd 2 front,
1 right, 0 back, 3 left; mt 1 stand, 2 walk, 3 attack, 4 magic).

fetch: every direction and motion of each piece and of the plain figure (no pi) into
GEAR_DIR/sinsu_worn/raw/<item name in hex | base>_<cd>_<mt>.gif (kept when already there).

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
solid parts (touch_up). Any other original piece can be laid the same way (a CONFIG_JSON entry: its
name, 'weapon' or 'wings', its classes). 'wings' takes what of a piece is off the plain body (wings,
flaring shoulders) for a 연 outfit to wear with: an armour mixed of 연's body and the original's own parts.

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
HERE = os.path.dirname(os.path.abspath(__file__))
# The 연 weapon layer whose hand (its skin pixels) a class's laid weapon is held by, frame by frame:
# the class's plain weapon of the 태초 line (items.js TAECHO_BASE), else its first weapon layer.
HAND = {'warrior': '70019', 'rogue': '1272', 'mage': '1372', 'poet': '1471', 'archer': '220077', 'lancer': '1324',
        'monk': '70025', 'magus': '330064', 'celestial': '260048', 'dokkaebi': '1020', 'reaper': '310026'}
DIRS = {'down': 2, 'up': 0, 'side': 3}
MOTIONS = {'idle': 1, 'walk': 2, 'atk': 3, 'cast': 4}


def config(argv):
    path = argv[0] if argv and argv[0].endswith('.json') else os.path.join(HERE, 'sinsu_worn.json')
    return json.load(open(path, encoding='utf-8'))


def rawkey(item):
    return 'base' if not item else ''.join(f'{ord(c):x}' for c in item)


def fetch(gear, *argv):
    raw = os.path.join(gear, 'sinsu_worn', 'raw')
    os.makedirs(raw, exist_ok=True)
    quick = '--quick' in argv
    items = [None] + sorted({c['item'] for c in config(argv).values()})
    for item in items:
        key = rawkey(item)
        for cd in ((2, 0, 3) if quick else range(4)):
            for mt in ((1, 3) if quick else (1, 2, 3, 4)):
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
    """The drawn pixels of a render (the dress room's GIFs have a transparent background; white is
    the blades' and flames' own brightest colour, kept)."""
    return a[..., 3] > 0


def piece_pixels(item, base):
    """The piece's own pixels: drawn in its render where the plain figure has nothing or other colours."""
    oi, ob = opaque(item), opaque(base)
    diff = np.abs(item[..., :3].astype(int) - base[..., :3].astype(int)).sum(-1) > 24
    keep = oi & (~ob | diff)
    out = item.copy()
    out[..., 3] = np.where(keep, 255, 0)
    return out, ob


def skin_palette(base):
    """The plain figure's skin colours in a frame (its few exact shades)."""
    m = skin(base) & (base[..., 3] > 0)
    return {tuple(c) for c in base[m][:, :3].tolist()}


def in_palette(a, pal):
    if not pal:
        return np.zeros(a.shape[:2], bool)
    key = (a[..., 0].astype(np.int64) << 16) | (a[..., 1].astype(np.int64) << 8) | a[..., 2]
    return np.isin(key, [(r << 16) | (g << 8) | b for r, g, b in pal])


def skin_yeon(a):
    """연's heroes' skin (pink: (247,208,185), (251,167,138), (197,120,99)), not a gold hilt."""
    r, g, b = (a[..., i].astype(float) for i in range(3))
    rr = np.maximum(r, 1)
    return (r > 150) & (g / rr > 0.55) & (g / rr < 0.9) & (b / rr > 0.42) & (b / rr < 0.82) & (r - b > 40)


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


def hand_layer(h2, H, cls):
    """The class's weapon layer to take 연's hand from: HAND's if its fist (연's pink skin) shows in
    most frames, else the weapon layer whose fist shows in the most (a spear or a bow may be drawn
    without one)."""
    def score(meta):
        im = np.asarray(Image.open(os.path.join(h2, meta['file'])).convert('RGBA'))
        cw, ch = meta.get('cell', H['cell'])
        n = t = 0
        for name, a in H['anims'].items():
            if name == 'dead':
                continue
            for f in range(a['n']):
                c = im[a['row'] * ch:(a['row'] + 1) * ch, f * cw:(f + 1) * cw]
                t += 1
                n += (skin_yeon(c) & (c[..., 3] > 100)).sum() >= 4
        return n / max(1, t), im
    layers = H['layers']['weapon']
    order = ([HAND[cls]] if HAND.get(cls) in layers else []) + [k for k in layers if k != HAND.get(cls)][:12]
    best = None
    for k in order:
        sc, im = score(layers[k])
        if sc >= 0.9:
            return im, layers[k]
        if not best or sc > best[0]:
            best = (sc, im, layers[k])
    return best[1], best[2]


def build(gear, *argv):
    pieces = config(argv)
    raw = os.path.join(gear, 'sinsu_worn', 'raw')
    root = next((a for a in argv if not a.endswith('.json') and not a.startswith('--')), os.path.join(gear, 'sinsu_worn'))
    os.makedirs(root, exist_ok=True)
    h2 = os.path.join(gear, 'yhero2')
    index = json.load(open(os.path.join(h2, 'index.json'), encoding='utf-8'))
    R = {}

    def render(item, cd, mt):
        k = (item, cd, mt)
        if k not in R:
            path = os.path.join(raw, f'{rawkey(item)}_{cd}_{mt}.gif')
            if not os.path.exists(path):  # (a quick fetch: the stand stands in)
                path = os.path.join(raw, f'{rawkey(item)}_{cd}_1.gif')
            R[k] = frames(path)
        return R[k]

    # The original figure's height (feet to the top of the head), standing, front.
    b0 = bbox(opaque(render(None, 2, 1)[0]))
    pc_h = FEET[1] - b0[1]
    out, hands = {}, {}
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
        for piece, conf in pieces.items():
            mode, only, item = conf['mode'], conf.get('classes'), conf['item']
            if only and cls not in only:
                continue
            # the 연 hand per frame: skin pixels of the class's own weapon layer
            wl = None
            if mode == 'weapon':
                if cls not in hands:
                    hands[cls] = hand_layer(h2, H, cls)
                wl = hands[cls]
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
                its = render(item, cd, mt)
                bas = render(None, cd, mt)
                side[a['row']] = ''
                for f in range(a['n']):
                    # the original frame for 연's frame f (the original walks in 4, strikes in its own count)
                    j = min(len(its) - 1, f * len(its) // a['n'])
                    if motion == 'atk':
                        j = min(len(its) - 1, f)  # wind-up, then the blow (held over 연's last frame)
                    ba = bas[min(j, len(bas) - 1)]
                    it = its[j]
                    if mode == 'weapon' and motion != 'idle':
                        # A weapon the original swings in a pose of its own (a staff's thrust): its
                        # figure is not the plain one's, and the difference would carry the body. Such a
                        # frame (the skin of the two figures far apart) shows the weapon as it stands.
                        si, sb_ = in_palette(it, skin_palette(ba)) & (it[..., 3] > 0), skin(ba) & (ba[..., 3] > 0)
                        # (skin where the plain figure has none: a body moved, not one a blade covers)
                        if (si & ~sb_).sum() > 0.2 * max(1, si.sum()):
                            it, ba = render(item, cd, 1)[0], render(None, cd, 1)[0]
                    pp, ob = piece_pixels(it, ba)
                    gauntlet = False
                    if mode == 'weapon':
                        # The original figure's own skin is not the piece (its hand closed round a
                        # grip, an arm in another pose): the plain figure's skin colours are dropped.
                        from scipy.ndimage import binary_dilation
                        pal = skin_palette(ba)
                        own = in_palette(it, pal) & (it[..., 3] > 0)
                        pp[..., 3] = np.where(own, 0, pp[..., 3])
                        solid = pp[..., 3] > 0
                        # Where the hand is: the figure's skin closed round the grip — drawn over the
                        # hilt, so inside the piece's outline once its gaps are closed (not a face or
                        # an arm the blade only passes beside)...
                        from scipy.ndimage import binary_closing
                        grip = own & binary_closing(solid, iterations=4) & ~solid
                        if grip.sum() < 6:
                            grip = own & binary_closing(solid, iterations=7) & ~solid
                        cx, cy = FEET[0], FEET[1] - 0.55 * pc_h  # the original figure's chest

                        def fist(m):
                            # the end of the arm: what of it is farthest from the chest
                            ys, xs = np.nonzero(m)
                            dd = np.hypot(xs - cx, ys - cy)
                            far = dd >= np.quantile(dd, 0.7)
                            return xs[far].mean(), ys[far].mean()
                        cov = skin(ba) & ob & solid
                        if conf.get('gauntlet'):
                            # A weapon whose hilt is a gauntlet (the 칠지천지환 line: the blade comes out
                            # of a glove): it sits on the hand and wrist in every frame, never held —
                            # its fist on 연's fist, and no 연 fist drawn over it.
                            gauntlet = True
                            m = cov if cov.sum() >= 6 else grip
                            if m.sum() >= 3:
                                ohx, ohy = fist(m)
                            else:
                                bbw = bbox(solid)
                                ohx, ohy = ((bbw[0] + bbw[2]) / 2, bbw[3]) if bbw else FEET
                        elif grip.sum() >= 6:
                            ohx, ohy = fist(grip)
                        else:
                            # ...or none: a gauntlet (칠지천지환검's blade comes out of a glove) covers the
                            # hand and forearm. The fist is the end of the covered arm farthest from the
                            # body; the gauntlet takes its place (no 연 fist drawn over it).
                            if cov.sum() >= 6:
                                gauntlet = True
                                ohx, ohy = fist(cov)
                            else:
                                bbw = bbox(solid)
                                ohx, ohy = ((bbw[0] + bbw[2]) / 2, bbw[3]) if bbw else FEET
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
                        # anchor: the original hand (above) on 연's hand
                        wim, wm = wl
                        wcw, wch = wm.get('cell', [cw, ch])
                        wfx, wfy = wm.get('foot', [fx, fy])
                        wc = wim[a['row'] * wch:(a['row'] + 1) * wch, f * wcw:(f + 1) * wcw]
                        # 연's hand in this frame: the body's skin where it meets the class's weapon
                        # (the arm's end at the grip; the end farthest from the chest is the fist),
                        # else the weapon layer's own pink fist near the body, else the weapon's middle.
                        from scipy.ndimage import binary_dilation, shift as nd_shift
                        bc = bim[a['row'] * bch:(a['row'] + 1) * bch, f * bcw:(f + 1) * bcw]
                        wa = np.zeros((bch, bcw), bool)  # the weapon's pixels in the body's cell
                        ys_, xs_ = np.nonzero(wc[..., 3] > 100)
                        ys_, xs_ = ys_ - wfy + bfy, xs_ - wfx + bfx
                        ok = (ys_ >= 0) & (ys_ < bch) & (xs_ >= 0) & (xs_ < bcw)
                        wa[ys_[ok], xs_[ok]] = True
                        yy, xx = np.mgrid[0:bch, 0:bcw]
                        chx, chy, rad = bfx, bfy - 0.4 * (-top), 0.65 * (-top)
                        near = np.hypot(xx - chx, yy - chy) < rad
                        hs = skin_yeon(bc) & (bc[..., 3] > 100) & binary_dilation(wa, iterations=2) & near
                        if hs.sum() >= 3:
                            ys, xs = np.nonzero(hs)
                            dd = np.hypot(xs - chx, ys - chy)
                            far = dd >= np.quantile(dd, 0.6)
                            hx, hy = xs[far].mean() - bfx + fx, ys[far].mean() - bfy + fy
                        else:
                            ws = skin_yeon(wc) & (wc[..., 3] > 100)
                            wy, wx = np.mgrid[0:wch, 0:wcw]
                            ws &= np.hypot(wx - wfx, wy - (wfy - 0.4 * (-top))) < rad
                            if ws.sum() < 3:
                                ws = wc[..., 3] > 100
                            if not ws.any():
                                hx, hy = fx, fy - 20
                            else:
                                ys, xs = np.nonzero(ws)
                                hx, hy = xs.mean() - wfx + fx, ys.mean() - wfy + fy
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
                    if mode == 'weapon' and not gauntlet:
                        # 연's own fist over the grip (the skin of the class's weapon layer, and the
                        # dark outline round it), so the hand holds the original blade
                        from scipy.ndimage import binary_dilation
                        sk = skin_yeon(wc) & (wc[..., 3] > 100)
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
    {'fetch': fetch, 'build': build}[sys.argv[1]](*sys.argv[2:])
