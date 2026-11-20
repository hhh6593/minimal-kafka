#!/usr/bin/env python3
"""Pieces 연 lacks, as the original draws them worn, laid on 연's heroes (청룡신검, 현무불괴갑, ...).

    sinsu_worn.py fetch GEAR_DIR [CONFIG_JSON] [--quick]
    sinsu_worn.py build GEAR_DIR [CONFIG_JSON] [OUT_DIR]

CONFIG_JSON (default tools/sinsu_worn.json): {key: {"item": name, "mode": "weapon" | "wings" | "hair",
"classes": [cls, ...] (absent: all), and for a weapon: "gauntlet": true (a blade out of a glove: the
glove on the fist, no 연 fist over it), "size" (from the hand to the tip against the hero's height,
default SIZE), "scale": "figure" (a glove with no blade: the original's size against its figure),
"src": [cd, mt, frame] (the render its picture is cut from, where the standing front hides part of
it), "grip" / "tip": [x, y] (in that render's pixels, where found wrong), "mirror": true}, and
"_pose": {cls: corrections of 연's hand and weapon line, class_poses}}. --quick fetches only standing
and striking (front, back, left): enough for candidate sheets; build then shows the stand where a
walk or a cast is missing.
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
  - weapons (청룡신검, 악마 심판의낫, the 태초 칠지천지환 line, the abyss uniques): the original's
    weapon held as 연 holds the class's own (weapon_layers): its picture from one clean render
    (canon), its grip put in 연's hand and its blade along 연's weapon line frame by frame (where the
    class's many weapon layers meet and lie: class_poses), about as long as a weapon of 연's (SIZE),
    in 연's own layer order (the weapon layer, and "wback" for what 연 draws of it behind the body).
    연's fist is drawn back over a held grip; a gauntlet sits on the fist. No weapon in a frame 연
    draws none in (a cast's hands).
  - 현무불괴갑 (every class): the wings and the flaring gold of the shoulders (the piece's pixels off
    the plain figure's body), set on 연's shoulders; behind the body from the front and the side,
    over it from behind. The body itself stays 연's outfit (items.js).
Writes GEAR_DIR/sinsu_worn/<piece>_<class>.png and GEAR_DIR/sinsu_worn/index.json:
    {cls: {piece: {"kind", "file", "cols", "cell", "foot", "side"}}} (a weapon's part behind the body:
    "<piece>_wb", kind "wback", variant "s_<piece>")
  - 사신수 무신의 헤어 (mode 'hair', every class, 남 and 여): the hair off the plain figure, on 연's
    hairless head (hair_layers): layers "hair" and "back" with the variant "c<piece>", worn as a
    코디 hair (costume.js MUSIN_HAIR); fetch also takes the item's official render (Item/Render) as
    its picture (raw/icon_<hex>.png). build --pieces=a,b rebuilds those only.
(prepare_assets.py copies them to yhero2/sinsu/ and adds them to the heroes' layers as "s_<piece>").
Each laid piece is touched up for 연: scaled to 연's figure, specks dropped, a dark outline round its
solid parts (touch_up). Any other original piece can be laid the same way (a CONFIG_JSON entry: its
name, 'weapon' or 'wings', its classes). 'wings' takes what of a piece is off the plain body (wings,
flaring shoulders) for a 연 outfit to wear with: an armour mixed of 연's body and the original's own parts.

"""
import io
import json
import math
import os
import sys
import time
import urllib.parse
import urllib.request

import numpy as np
from PIL import Image

COORDI = "https://avatar.baram.nexon.com/Coordi/RenderAvatar/M"
RENDER = "https://avatar.baram.nexon.com/Item/Render/"
FEET = (167, 231)
HERE = os.path.dirname(os.path.abspath(__file__))
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
    items = [None] + sorted({c['item'] for k, c in config(argv).items() if not k.startswith('_')})
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
    # A hair's picture for the 코디 list: the item's official render (the site's escape for ':').
    for k, c in config(argv).items():
        if k.startswith('_'):
            continue
        path = os.path.join(raw, f"icon_{rawkey(c['item'])}.png")
        if c['mode'] != 'hair' or os.path.exists(path):
            continue
        with urllib.request.urlopen(RENDER + urllib.parse.quote(c['item'].replace(':', '＃')), timeout=40) as r:
            data = r.read()
        if data.startswith(b'\x89PNG'):
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


def scaled(rgba, k, keep=100):
    """A cut-out piece scaled k times (nearest past 1, area under: 연's heroes are smaller). keep: the
    covered part (of 255) a pixel needs to stay (lower keeps a thin shaft scaled far down)."""
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
    m = al > keep
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


def scaled2(rgba, kx, ky):
    """scaled() with its own factor across and down."""
    if abs(kx - ky) < 1e-6:
        return scaled(rgba, kx)
    im = Image.fromarray(rgba)
    w, h = max(1, round(im.width * kx)), max(1, round(im.height * ky))
    a = np.asarray(im).astype(float)
    pm = a.copy()
    pm[..., :3] *= a[..., 3:4] / 255
    r = np.asarray(Image.fromarray(pm.astype(np.uint8)).resize((w, h), Image.BOX)).astype(float)
    al = np.asarray(im.getchannel('A').resize((w, h), Image.BOX)).astype(float)
    outp = np.zeros((h, w, 4), np.uint8)
    outp[..., :3] = np.where(al[..., None] > 0, np.clip(r[..., :3] * 255 / np.maximum(al[..., None], 1), 0, 255), 0).astype(np.uint8)
    outp[..., 3] = np.where(al > 100, 255, 0)
    return outp


# The original figure's head, from the top of the plain figure's hair (its first drawn row): the
# top of its eyes (their black rims), its chin, and its face's width (skin, ears included).
O_EYE, O_CHIN, O_FACE_W = 18, 29, 24
# Fitting the original's hair to 연's own (its long hairs, e.g. 은익섬광·고대 무사·땋은 머리): 연's hairs
# hug the head (a crown a few pixels over the skull, the sides just past the face), hang to the hips
# or knees at most, about as wide as the body, drawn with dark shading and a dark outline.
#   HAIR_HEAD_K: the head part's scale against the face's (smaller than the face's own: the
#     original's hair is far bigger round its head than 연's);
#   HAIR_END: where what hangs ends, as a part of 연's chin-to-feet (1: the feet);
#   HAIR_HALF: how far it reaches either side of the head's centre, in 연's head widths;
#   HAIR_WISP: loose locks smaller than this part of the hair's biggest piece are dropped;
#   HAIR_TONE: the colours darkened (gamma, then a multiple) towards 연's shading.
HAIR_HEAD_K, HAIR_END, HAIR_HALF, HAIR_WISP, HAIR_TONE = 0.84, 0.72, 1.05, 0.12, (1.3, 0.92)


def hair_layers(gear, root, H, cls, piece, item, render, icon=None):
    """A hair of the original (사신수 무신의 헤어) on 연's hero, frame by frame: the hair's own pixels
    (its render against the plain figure's, the figure's own face left out), set on 연's hairless
    head (ycostume's head "nohair", which 연 draws under a hair look: costume.js headParts):
      - the head part scaled so the original's face is as wide as 연's, its eye line on 연's;
      - what hangs below the chin shortened to 연's shorter body (the original's feet on 연's),
        narrowed a little less (연's body is broad);
      - 연's face (its skin, eyes and mouth, from the eyes down) left clear of the hair, facing
        down or aside, so the hero keeps its face as with 연's own hairs.
    Two layers, as 연's own hairs (and the hair layer again, "c<piece>_h", cut at the top of
    연's skull, worn under a hat or helmet): "hair" (over the head: all of it from behind; from the front and
    the side what the original draws over the figure and the top of the head) and "back" (the
    rest, behind the body, where the class's clips draw 연's long hairs). Each is touched up for 연
    (a dark outline round the whole hair, then split). icon: the item's official render
    (Item/Render), the 코디 list's picture."""
    from scipy.ndimage import binary_closing, binary_fill_holes, distance_transform_edt
    ci = json.load(open(os.path.join(gear, 'ycostume', 'index.json'), encoding='utf-8'))
    nh = ci['layers'].get(cls, {}).get('head', {}).get('nohair')
    if not nh:
        print(cls, piece, 'no nohair head: skipped')
        return None
    nim = np.asarray(Image.open(os.path.join(gear, 'ycostume', nh['file'])).convert('RGBA'))
    ncw, nch = nh['cell']
    nfx, nfy = nh['foot']

    def yhead(row, f):
        """연's hairless head in a frame, from the feet: (centre x, top y, chin y, width, its face
        mask (skin with the eyes and mouth inside) and where that mask sits)."""
        c = nim[row * nch:(row + 1) * nch, f * ncw:(f + 1) * ncw]
        if c.shape[0] != nch or c.shape[1] != ncw:
            return None
        bb = bbox(c[..., 3] > 30)
        if not bb:
            return None
        x0, y0, x1, y1 = bb
        sk = skin_yeon(c) & (c[..., 3] > 100)
        face = binary_fill_holes(sk) | sk
        return ((x0 + x1 + 1) / 2 - nfx, y0 - nfy, y1 + 1 - nfy, x1 - x0 + 1, face, (-nfx, -nfy))

    i0 = H['anims']['idle_down']
    h0 = yhead(i0['row'], 0)
    if not h0:
        return None
    k_head = h0[3] / O_FACE_W * HAIR_HEAD_K
    half = HAIR_HALF * h0[3]
    # 연's eye line: two fifths down its head (its brows and eyes; the original's are under the fringe)
    eye_of = lambda yh: yh[1] + 0.4 * (yh[2] - yh[1])

    def hair_frame(it, ba, front_all, side=False):
        """The hair's own pixels in a frame, and which of them go over the figure (from the side,
        over the head only: what hangs down the original's narrow back would hide 연's broader
        body, and goes behind it)."""
        oi, ob = opaque(it), opaque(ba)
        diff = np.abs(it[..., :3].astype(int) - ba[..., :3].astype(int)).sum(-1) > 24
        own = in_palette(it, skin_palette(ba))
        # the figure's face as the hair leaves it (its eyes and mouth inside the skin): not the hair's
        top = np.nonzero(ob)[0].min()
        head = np.arange(it.shape[0])[:, None] < top + O_CHIN + 2
        own |= binary_fill_holes(own & head) & head
        keep = oi & (~ob | diff) & ~own
        keep |= binary_closing(keep, iterations=1) & oi & ~own  # (pixels the two happen to share)
        if front_all:
            front = keep.copy()
        else:
            # over the figure in the original, or the top of the head (down to the eyes)
            front = keep & (ob | (np.arange(it.shape[0])[:, None] < top + O_EYE))
            if side:
                front &= np.arange(it.shape[0])[:, None] < top + O_CHIN
        return keep, front

    def ohead(ba):
        """The original's head in a frame: (centre x, top y, feet y) of the plain figure."""
        m = opaque(ba)
        ys, xs = np.nonzero(m)
        top = ys.min()
        bx = np.nonzero(m[top:top + O_CHIN].any(0))[0]
        return (bx.min() + bx.max() + 1) / 2, top, ys.max() + 1

    pieces = {}
    PAD = 2
    for name, a in H['anims'].items():
        motion, d = name.split('_') if name != 'dead' else ('dead', 'down')
        cd = DIRS[d]
        mt = {'idle': 1, 'walk': 2, 'atk': 3, 'cast': 4, 'dead': 1}[motion]
        its, bas = render(item, cd, mt), render(None, cd, mt)
        for f in range(a['n']):
            yh = yhead(a['row'], f if motion != 'dead' else 0)
            carve = yh is not None and d != 'up'
            if not yh:
                # (연 draws no face from behind, the hair over all of it: the head where the same
                # frame facing down has it)
                dn = H['anims'].get(motion + '_down')
                yh = dn and yhead(dn['row'], min(f, dn['n'] - 1))
            if not yh:
                continue
            if motion == 'atk':
                j = min(len(its) - 1, f)
            elif motion == 'dead':
                j = 0
            else:
                j = min(len(its) - 1, f * len(its) // a['n'])
            it, ba = its[j], bas[min(j, len(bas) - 1)]
            keep, front = hair_frame(it, ba, d == 'up', d == 'side')
            ohx, otop, ofeet = ohead(ba)
            oeye, ochin = otop + O_EYE, otop + O_CHIN
            if motion == 'dead':  # 연's ghost is a head: the hair's head part only
                keep &= np.arange(it.shape[0])[:, None] < ochin + 2
                front = keep.copy()
            bb = bbox(keep)
            if not bb:
                continue
            x0, y0, x1, y1 = bb
            rgba = it.copy()
            rgba[..., 3] = np.where(keep, 255, 0)
            fm = np.zeros_like(rgba)
            fm[..., 3] = np.where(front, 255, 0)
            # 연's knots: the eye line, and where the original's chin falls at the head's scale
            yeye = eye_of(yh)
            ychin = yeye + (ochin - oeye) * k_head
            k_low = max(0.2, min(k_head, -ychin * HAIR_END / max(1, ofeet - ochin)))
            k_lx = (k_head + 2 * k_low) / 3
            bands = []
            if y0 < ochin:
                bands.append((y0, min(y1 + 1, ochin), k_head, k_head, yeye + (y0 - oeye) * k_head))
            if y1 + 1 > ochin:
                ya = max(y0, ochin)
                bands.append((ya, y1 + 1, k_lx, k_low, ychin + (ya - ochin) * k_low))
            parts = []
            for ya, yb, kx, ky, yo in bands:
                p = scaled2(rgba[ya:yb, x0:x1 + 1], kx, ky)
                fp = scaled2(fm[ya:yb, x0:x1 + 1], kx, ky)[..., 3] > 0
                parts.append((p, fp, round((x0 - ohx) * kx), round(yo)))
            # stacked without a gap: each band from where the one above ends
            for i in range(1, len(parts)):
                p, fp, xx, _ = parts[i]
                pp = parts[i - 1]
                parts[i] = (p, fp, xx, pp[3] + pp[0].shape[0])
            gx0 = min(xx for _, _, xx, _ in parts)
            gy0 = parts[0][3]
            gx1 = max(xx + p.shape[1] for p, _, xx, _ in parts)
            gy1 = parts[-1][3] + parts[-1][0].shape[0]
            can = np.zeros((gy1 - gy0, gx1 - gx0, 4), np.uint8)
            fcan = np.zeros(can.shape[:2], bool)
            for p, fp, xx, y_ in parts:
                sl = (slice(y_ - gy0, y_ - gy0 + p.shape[0]), slice(xx - gx0, xx - gx0 + p.shape[1]))
                m = p[..., 3] > 0
                can[sl] = np.where(m[..., None], p, can[sl])
                fcan[sl] |= fp & m
            # 연's measure: no wider than its hairs (either side of the head's centre), no loose locks,
            # its darker shading
            from scipy.ndimage import label
            xs_ = np.arange(can.shape[1]) + gx0
            can[:, np.abs(xs_ + 0.5) > half] = 0
            lab, n = label(can[..., 3] > 0)
            if n > 1:
                sizes = np.bincount(lab.ravel())[1:]
                small = [i + 1 for i in range(n) if sizes[i] < HAIR_WISP * sizes.max()]
                can[np.isin(lab, small)] = 0
            g_, m_ = HAIR_TONE
            rgb = can[..., :3].astype(float) / 255
            can[..., :3] = np.clip(255 * m_ * rgb ** g_, 0, 255).astype(np.uint8)
            fcan &= can[..., 3] > 0
            tu = touch_up(can, 'hair')
            solid = np.pad(can[..., 3] > 0, 1)
            fpad = np.pad(fcan, 1)
            # an outline pixel goes with the hair it rings (the nearest drawn pixel's layer)
            _, (iy, ix) = distance_transform_edt(~solid, return_indices=True)
            fr_ = np.where(solid, fpad, fpad[iy, ix]) & (tu[..., 3] > 0)
            bk_ = (tu[..., 3] > 0) & ~fr_
            # the canvas's origin from the feet: 연's head centre, the touch-up's margin of one pixel
            ox = round(yh[0]) + gx0 - 1
            oy = gy0 - 1
            if carve:
                # 연's face from its eyes down stays clear of what goes over it
                face, (fx0, fy0) = yh[4], yh[5]
                ys_, xs_ = np.nonzero(face)
                for y_, x_ in zip(ys_, xs_):
                    if y_ + fy0 < yeye - 0.5:
                        continue
                    cy, cx = y_ + fy0 - oy, x_ + fx0 - ox
                    if 0 <= cy < tu.shape[0] and 0 <= cx < tu.shape[1]:
                        fr_[cy, cx] = False
            for kind, m in (('hair', fr_), ('back', bk_)):
                if not m.any():
                    continue
                lay = tu.copy()
                lay[~m] = 0
                pieces.setdefault(kind, {})[(a['row'], f)] = (lay, ox, oy)
                if kind == 'hair':
                    # under a hat or helmet ("hat"): nothing over the top of 연's skull (the
                    # original's crown, its 신수 ornament), the hat sitting on the hair as on 연's
                    # own; the rest as it is
                    hat = lay.copy()
                    hat[:max(0, min(hat.shape[0], round(yh[1]) - oy))] = 0
                    if hat[..., 3].any():
                        pieces.setdefault('hat', {})[(a['row'], f)] = (hat, ox, oy)
    if 'hair' not in pieces:
        return None
    rows = max(a['row'] for a in H['anims'].values()) + 1
    cols = max(a['n'] for a in H['anims'].values())
    got = {}
    for kind, fr in pieces.items():
        bx0 = min(ox for _, ox, _ in fr.values()) - PAD
        by0 = min(oy for _, _, oy in fr.values()) - PAD
        bx1 = max(ox + l.shape[1] for l, ox, _ in fr.values()) + PAD
        by1 = max(oy + l.shape[0] for l, _, oy in fr.values()) + PAD
        cw, ch = bx1 - bx0, by1 - by0
        sheet = np.zeros((rows * ch, cols * cw, 4), np.uint8)
        for (r, f), (l, ox, oy) in fr.items():
            y_, x_ = r * ch + oy - by0, f * cw + ox - bx0
            sl = sheet[y_:y_ + l.shape[0], x_:x_ + l.shape[1]]
            sheet[y_:y_ + l.shape[0], x_:x_ + l.shape[1]] = np.where(l[..., 3:4] > 0, l, sl)
        key = piece + {'hair': '', 'back': '_b', 'hat': '_h'}[kind]
        fname = f'{key}_{cls}.png'
        Image.fromarray(sheet).save(os.path.join(root, fname), optimize=True)
        # variant "c<piece>": the 코디 hair's own layers (costume.js headParts: hair and back "c<id>");
        # under a hat its hair layer is "c<piece>_h"
        got[key] = {'kind': 'hair' if kind == 'hat' else kind, 'variant': 'c' + piece + ('_h' if kind == 'hat' else ''),
                    'file': 'sinsu/' + fname, 'cols': cols,
                    'cell': [cw, ch], 'foot': [-bx0, -by0], 'side': [], 'k': round(k_head, 3)}
    # the 코디 list's picture: the official item render, as fetched (its own pixels, cropped)
    ic = os.path.join(root, f'{piece}_icon.png')
    if icon and os.path.exists(icon):
        im = Image.open(icon).convert('RGBA')
        im = im.crop(im.getbbox() or (0, 0, im.width, im.height))
        im.save(ic, optimize=True)
        got[piece]['icon'] = f'sinsu/{piece}_icon.png'
    return got


# ---------------------------------------------------------------- weapons held as 연 holds its own
#
# A weapon is not laid as the original draws it (its huge blade from the original's own pose: held by
# the blade's middle, floating over the head, out of the hand when 연 swings another way). 연's heroes
# hold every weapon of a class on one rig: in each frame its many weapon layers share the hand and
# lie along one line. That line, frame by frame (class_poses), is where the original's weapon goes:
# its picture (one clean frame of its render, canon), turned and sized so its grip is in 연's hand and
# its blade lies along 연's, about as long as 연's own (SIZE: from the hand to the tip, against the
# hero's height; a sword of 연's is about 0.35 of it, a legendary one larger), in 연's
# own layer order (weapon, and wback where 연 draws part of it behind the body).
SIZE = 0.48
# A thin shaft or chain scaled far down stays where it covers this much of a pixel (of 255).
KEEP = 55
# The canvas the per-frame line is found on, from the feet.
PW, PH, POX, POY = 240, 240, 120, 170


def weapon_cells(h2, H):
    """{(row, f): {variant: [front mask, back mask]}}: every weapon layer of the class, frame by frame,
    on the PW x PH canvas (feet at POX, POY); 'wback' is what 연 draws of it behind the body."""
    cw, ch = H['cell']
    fx, fy = H['foot']
    masks = {}
    for kind in ('weapon', 'wback'):
        for v, m in H['layers'].get(kind, {}).items():
            im = np.asarray(Image.open(os.path.join(h2, m['file'])).convert('RGBA'))
            w, h = m.get('cell', [cw, ch])
            mx, my = m.get('foot', [fx, fy])
            cols = m.get('cols', 10 ** 9)
            for name, a in H['anims'].items():
                if name == 'dead':
                    continue
                for f in range(a['n']):
                    r0, c0 = (a['row'] + f // cols) * h, (f % cols) * w
                    c = im[r0:r0 + h, c0:c0 + w]
                    if c.shape[:2] != (h, w):
                        continue
                    ys, xs = np.nonzero(c[..., 3] > 100)
                    if not len(xs):
                        continue
                    X, Y = xs - mx + POX, ys - my + POY
                    ok = (X >= 0) & (X < PW) & (Y >= 0) & (Y < PH)
                    d = masks.setdefault((a['row'], f), {}).setdefault(v, [np.zeros((PH, PW), bool), np.zeros((PH, PW), bool)])
                    d[kind == 'wback'][Y[ok], X[ok]] = True
    return masks


def layer_cell(h2, H, meta, row, f):
    """A layer's cell on the PW x PH canvas (feet at POX, POY)."""
    cw, ch = meta.get('cell', H['cell'])
    mx, my = meta.get('foot', H['foot'])
    im = np.asarray(Image.open(os.path.join(h2, meta['file'])).convert('RGBA'))
    c = im[row * ch:(row + 1) * ch, f * cw:(f + 1) * cw]
    out = np.zeros((PH, PW, 4), np.uint8)
    y0, x0 = POY - my, POX - mx
    h, w = c.shape[:2]
    ya, xa = max(0, -y0), max(0, -x0)
    yb, xb = min(h, PH - y0), min(w, PW - x0)
    out[y0 + ya:y0 + yb, x0 + xa:x0 + xb] = c[ya:yb, xa:xb]
    return out


def class_poses(h2, H, height, fix=None):
    """연's hand and weapon line in each frame of a class: {(row, f): {gx, gy (from the feet), ang
    (radians, y down: the blade's way from the hand), front (bool mask on the canvas: where 연 draws
    its weapons in front of the body, else behind)}} and the class's usual length (idle and walk:
    from the hand to the tip). The hand: where most of the class's weapon layers meet (they share
    it, their blades differ in length); in a swing (the layers' trails make no line) the end of 연's
    arm (the body's skin) by them. The line: from the hand towards the pixels most layers share
    within a weapon's length. fix: the config's corrections ({"anim:f" | "anim" | "motion" | "*": {"ang": degrees
    added, "set": degrees, "dx", "dy", "off": true, "keep": true (not turned off the head)}, "hand":
    "left" | "right" (a weapon in each hand: which), "ref": [variants] (only these layers followed)}).
    A clear line (its layers elongated) is taken along its own axis; in a swing or for a short weapon
    the hand is the end of 연's arm by the weapons, and a hand the strike's lights pull off the body
    takes the nearest frame's line. A line through 연's head is turned away from it.
    Frames no weapon is drawn in (a cast's hands) get none."""
    from scipy.ndimage import binary_dilation, gaussian_filter, label
    cells = weapon_cells(h2, H)
    body = H['layers']['body']['base']
    head = H['layers'].get('head', {}).get('base')
    raw = {}
    for key, per in cells.items():
        vs = [v for v, (a_, b_) in per.items() if (a_ | b_).sum() >= 6]
        ref = (fix or {}).get('ref')
        if ref:
            # the config's own weapons of the class to follow (the 도깨비's clubs ride on its back;
            # its sword, 청룡의검, is held as a blade is)
            vs = [v for v in vs if v in ref]
        if len(vs) < (1 if ref else 3):
            continue
        cnt = sum((per[v][0] | per[v][1]).astype(float) for v in vs)
        cb = sum(per[v][1].astype(float) for v in vs)
        cf = sum(per[v][0].astype(float) for v in vs)
        N = len(vs)
        core = cnt >= 0.5 * N
        if core.sum() < 6:
            core = cnt >= 0.3 * N
        if core.sum() < 6:
            continue
        # a class with a weapon in each hand (the 격투가's claws, the 마도사's rod and orb, the 천인's
        # sickles): one hand's, the config's "hand" ("left" / "right" on the screen), else the
        # weightiest
        lab, nl = label(binary_dilation(core, iterations=1))
        if nl > 1:
            wt = np.bincount(lab.ravel(), weights=cnt.ravel())[1:]
            cand = [i + 1 for i in range(nl) if wt[i] >= 0.25 * wt.max()]
            hand = (fix or {}).get('hand')
            if len(cand) > 1 and hand in ('left', 'right'):
                cx_ = {i: np.average(np.nonzero(lab == i)[1], weights=cnt[lab == i]) for i in cand}
                pick = (min if hand == 'left' else max)(cand, key=cx_.get)
            else:
                pick = int(np.argmax(wt)) + 1
            keep = binary_dilation(lab == pick, iterations=3)
            cnt, cf, cb = cnt * keep, cf * keep, cb * keep
            core &= keep
        sm = gaussian_filter(cnt, 1.2)
        gy, gx = np.unravel_index(np.argmax(sm * core), sm.shape)
        ys, xs = np.nonzero(core)
        wts = cnt[ys, xs]
        mx_, my_ = np.average(xs, weights=wts), np.average(ys, weights=wts)
        ev = np.linalg.eigvalsh(np.cov(np.vstack([xs - mx_, ys - my_]), aweights=wts))
        elong = ev[1] / max(ev[0], 1e-6)
        u = np.linalg.eigh(np.cov(np.vstack([xs - mx_, ys - my_]), aweights=wts))[1][:, 1]
        pr = (xs - gx) * u[0] + (ys - gy) * u[1]
        if np.percentile(pr, 95) < -np.percentile(pr, 5):
            pr, u = -pr, -u
        L = float(np.percentile(pr[pr > 0], 95)) if (pr > 0).any() else 0.0
        raw[key] = (gx, gy, elong, L, cnt, N, cf, cb, math.atan2(u[1], u[0]))
    names = {(a['row'], f): (n, f) for n, a in H['anims'].items() for f in range(a['n'])}
    Ls = [r[3] for k, r in raw.items() if names[k][0].split('_')[0] in ('idle', 'walk')]
    Lc = float(np.median(Ls)) if Ls else 0.35 * height
    out = {}
    yy, xx = np.mgrid[0:PH, 0:PW]
    from scipy.ndimage import distance_transform_edt
    got = {}
    for key, (gx, gy, elong, L, cnt, N, cf, cb, ua) in raw.items():
        b = layer_cell(h2, H, body, *key)
        skin_b = skin_yeon(b) & (b[..., 3] > 100) & (yy > POY - 0.68 * height)
        if elong < 6:
            # a swing (or a short weapon): the end of 연's arm by the weapons, below the head
            sk = skin_b & binary_dilation(cnt >= 0.3 * N, iterations=2)
            if sk.sum() >= 3:
                ys, xs = np.nonzero(sk)
                dd = np.hypot(xs - POX, ys - (POY - 0.45 * height))
                far = dd >= np.quantile(dd, 0.6)
                gx, gy = xs[far].mean(), ys[far].mean()
        d = np.hypot(xx - gx, yy - gy)
        sel = (cnt >= 0.4 * N) & (d <= Lc) & (d >= 2)
        if sel.sum() < 4:
            sel = (cnt >= 0.25 * N) & (d <= Lc) & (d >= 1)
        ys, xs = np.nonzero(sel)
        ang = None
        if len(xs) >= 3:
            w = cnt[ys, xs]
            ang = math.atan2(np.average(ys - gy, weights=w), np.average(xs - gx, weights=w))
        if elong >= 6 and not (fix or {}).get('near'):
            # a clear line: its own axis, the way it reaches farther from the hand (the pixels near
            # the hand pull towards a scabbard or the other hand's piece)
            ang = ua
        # held: the hand on 연's body (a strike's trails and lights can pull the line off it)
        # (where the layers make a clear line their shared hand stands, fists drawn with them)
        near = elong >= 6 or distance_transform_edt(~(b[..., 3] > 100))[int(round(gy)), int(round(gx))] <= 3
        front = gaussian_filter(cf, 1.5) >= gaussian_filter(cb, 1.5)
        got[key] = [gx, gy, ang if near else None, front, cb.sum() > 0, skin_b]
    for key, (gx, gy, ang, front, back, skin_b) in got.items():
        n, f = names[key]
        if ang is None:
            # off the body: the hand is the end of 연's arm on the side the class holds it (the
            # nearest frame's of the same pose), the line that frame's
            a_ = H['anims'][n]
            near = [(abs(g - f), (a_['row'], g)) for g in range(a_['n']) if g != f and got.get((a_['row'], g), [0, 0, None])[2] is not None]
            if not near:
                d0 = n.split('_')[1]
                k2 = (H['anims'][f'idle_{d0}']['row'], 0) if f'idle_{d0}' in H['anims'] else None
                if not k2 or got.get(k2, [0, 0, None])[2] is None:
                    continue
            else:
                k2 = min(near)[1]
            rx, ry, ang = got[k2][:3]
            ys, xs = np.nonzero(skin_b)
            if len(xs) < 3:
                continue
            side = np.sign(rx - POX) or 1
            m = np.sign(xs - POX) == side
            if m.sum() >= 3:
                xs, ys = xs[m], ys[m]
            dd = np.hypot(xs - POX, ys - (POY - 0.45 * height))
            far = dd >= np.quantile(dd, 0.8)
            gx, gy = xs[far].mean(), ys[far].mean()
        fx_ = fix or {}
        fx_ = fx_.get(f'{n}:{f}') or fx_.get(n) or fx_.get(n.split('_')[0]) or fx_.get('*') or {}
        if fx_.get('off'):
            continue
        if 'set' in fx_:
            ang = math.radians(fx_['set'])
        ang += math.radians(fx_.get('ang', 0))
        gx += fx_.get('dx', 0)
        gy += fx_.get('dy', 0)
        # not through 연's face or head (a line the class's mixed weapons pull across it): turned
        # away from it, towards the hand's side, until the blade clears it
        if head and not fx_.get('keep'):
            hm = layer_cell(h2, H, head, *key)[..., 3] > 100
            ts = np.linspace(3, 0.45 * height, 24)

            def hits(a_):
                xs_ = np.round(gx + np.cos(a_) * ts).astype(int)
                ys_ = np.round(gy + np.sin(a_) * ts).astype(int)
                ok_ = (xs_ >= 0) & (xs_ < PW) & (ys_ >= 0) & (ys_ < PH)
                return hm[ys_[ok_], xs_[ok_]].sum()
            if hits(ang) > 2:
                hx = np.nonzero(hm)[1].mean()
                for d in range(5, 95, 5):
                    ok = [a_ for a_ in (ang + math.radians(d), ang - math.radians(d)) if hits(a_) <= 2]
                    if ok:
                        ang = max(ok, key=lambda a_: abs(gx + math.cos(a_) * 0.45 * height - hx))
                        break
        # where 연 draws its weapons in front of the body here (the rest behind: wback)
        out[key] = dict(gx=float(gx) - POX, gy=float(gy) - POY, ang=ang, front=front, back=back)
    return out, Lc


def canon(item, render, conf):
    """The weapon's picture as the original draws it in one clean frame (conf "src": [cd, mt, frame],
    else standing facing down): (its pixels cut out, the grip and the tip in them, gauntlet). The grip:
    the figure's skin closed round the hilt (a gauntlet's: the covered fist), else conf "grip" [x, y] in
    the render's own pixels; the tip: the blade's end farthest from the grip (conf "tip")."""
    from scipy.ndimage import binary_closing, label
    cd, mt, j = conf.get('src', [2, 1, 0])
    its, bas = render(item, cd, mt), render(None, cd, mt)
    it, ba = its[min(j, len(its) - 1)], bas[min(j, len(bas) - 1)]
    pp, ob = piece_pixels(it, ba)
    own = in_palette(it, skin_palette(ba)) & (it[..., 3] > 0)
    pp[..., 3] = np.where(own, 0, pp[..., 3])
    solid = pp[..., 3] > 0
    # a thin shaft across the figure's dark hair or outline (the same colours: no difference there)
    # stays whole: the gaps closed with the render's own pixels
    gap = binary_closing(solid, iterations=2) & ~solid & (it[..., 3] > 0) & ~own
    pp[gap] = it[gap]
    pp[..., 3] = np.where(solid | gap, 255, 0)
    solid |= gap
    # specks and the plain figure's stray differences dropped: the weapon's big pieces
    lab, n = label(binary_closing(solid, iterations=2))
    if n > 1:
        sizes = np.bincount(lab.ravel())[1:]
        keep = np.isin(lab, [i + 1 for i in range(n) if sizes[i] >= 0.08 * sizes.max()])
        solid &= keep
        pp[..., 3] = np.where(solid, pp[..., 3], 0)
    gauntlet = bool(conf.get('gauntlet'))
    if 'grip' in conf:
        g = tuple(conf['grip'])
    else:
        grip = own & binary_closing(solid, iterations=4) & ~solid
        if grip.sum() < 6:
            grip = own & binary_closing(solid, iterations=7) & ~solid
        cov = skin(ba) & ob & solid
        m = cov if gauntlet and cov.sum() >= 6 else grip
        if m.sum() < 3:
            m = cov if cov.sum() >= 3 else grip
        if m.sum() >= 3:
            ys, xs = np.nonzero(m)
            g = (xs.mean(), ys.mean())
        else:
            bb = bbox(solid)
            g = ((bb[0] + bb[2]) / 2, bb[3])
    if 'tip' in conf:
        t = tuple(conf['tip'])
    else:
        ys, xs = np.nonzero(solid)
        dd = np.hypot(xs - g[0], ys - g[1])
        far = dd >= np.quantile(dd, 0.985)
        t = (xs[far].mean(), ys[far].mean())
    return pp, g, t, gauntlet


def held(pp, g, t, ang, length, mirror):
    """The weapon's picture turned and sized: its grip g to its tip t along ang (radians, y down),
    length pixels long; mirrored first where it is held the other way across. Returns the touched-up
    picture and where its grip is in it."""
    bb = bbox(pp[..., 3] > 0)
    x0, y0, x1, y1 = bb
    cut = pp[y0:y1 + 1, x0:x1 + 1]
    gx, gy, tx, ty = g[0] - x0, g[1] - y0, t[0] - x0, t[1] - y0
    if mirror:
        cut = cut[:, ::-1]
        gx, tx = cut.shape[1] - 1 - gx, cut.shape[1] - 1 - tx
    # on a square canvas round the grip, turned about it
    R = int(np.ceil(max(np.hypot(*(np.array([[0, 0], [cut.shape[1], 0], [0, cut.shape[0]], [cut.shape[1], cut.shape[0]]]) - [gx, gy]).T)))) + 2
    can = np.zeros((2 * R + 1, 2 * R + 1, 4), np.uint8)
    ox, oy = R - int(round(gx)), R - int(round(gy))
    can[oy:oy + cut.shape[0], ox:ox + cut.shape[1]] = cut
    a0 = math.atan2(ty - gy, tx - gx)
    im = Image.fromarray(can).rotate(math.degrees(a0 - ang), resample=Image.NEAREST, center=(R, R))
    k = length / max(1.0, math.hypot(tx - gx, ty - gy))
    sc = scaled(np.asarray(im), k, KEEP)
    cy, cx = R * sc.shape[0] / can.shape[0], R * sc.shape[1] / can.shape[1]
    bb = bbox(sc[..., 3] > 0)
    if not bb:
        return None, None
    x0, y0, x1, y1 = bb
    sc = sc[y0:y1 + 1, x0:x1 + 1]
    return touch_up(sc, 'weapon'), (cx - x0 + 1, cy - y0 + 1)


def weapon_layers(h2, H, cls, piece, conf, render, poses, Lc, root, rows, cols, height, kfig):
    """The weapon held in 연's hand frame by frame (class_poses): its sheet, and the part 연 draws
    behind the body (wback) where the class's own weapons have one. 연's fist (the body's skin and
    its outline round the hand) drawn back over the grip of a held weapon; a gauntlet (the 칠지천지환
    line: the blade out of a glove) sits on the fist instead. conf: "size" (SIZE's), "scale": "figure" (a
    glove with no blade: as big as the original's against its figure), "mirror" (turned over)."""
    from scipy.ndimage import binary_dilation
    pp, g, t, gauntlet = canon(conf['item'], render, conf)
    a0 = math.atan2(t[1] - g[1], t[0] - g[0])
    length = height * conf.get('size', SIZE)
    if conf.get('scale') == 'figure':
        length = kfig * math.hypot(t[0] - g[0], t[1] - g[1])
    cw, ch = H['cell']
    fx, fy = H['foot']
    PAD = 40
    ocw, och = cw + 2 * PAD, ch + 2 * PAD
    ofx, ofy = fx + PAD, fy + PAD
    sheets = [np.zeros((rows * och, cols * ocw, 4), np.uint8) for _ in range(2)]
    body = H['layers']['body']['base']
    for name, a in H['anims'].items():
        if name == 'dead':
            continue
        for f in range(a['n']):
            p = poses.get((a['row'], f))
            # where 연 draws no weapon (its frame's layers have neither part: a cast's hands), none
            z = (a.get('z') or [None] * a['n'])[f] or ['weapon']
            has_w, has_b = 'weapon' in z, 'wback' in z
            if not p or not (has_w or has_b):
                continue
            # held the other way across from the picture: mirrored, so it is not turned upside down
            mirror = (math.cos(p['ang']) * math.cos(a0) < 0) and abs(math.cos(p['ang'])) > 0.2
            if conf.get('mirror') is not None:
                mirror = mirror != bool(conf['mirror'])
            sc, gp = held(pp, g, t, p['ang'], length, mirror)
            if sc is None:
                continue
            gcx, gcy = gp
            # on the class's canvas: the grip on 연's hand
            lay = np.zeros((PH, PW, 4), np.uint8)
            px, py = int(round(POX + p['gx'] - gcx)), int(round(POY + p['gy'] - gcy))
            h, w = sc.shape[:2]
            ya, xa = max(0, -py), max(0, -px)
            yb, xb = min(h, PH - py), min(w, PW - px)
            if yb <= ya or xb <= xa:
                continue
            sub = sc[ya:yb, xa:xb]
            dst = lay[py + ya:py + yb, px + xa:px + xb]
            lay[py + ya:py + yb, px + xa:px + xb] = np.where(sub[..., 3:4] > 0, sub, dst)
            if not gauntlet:
                # 연's fist over the grip: the body's skin by the hand, and its outline
                b = layer_cell(h2, H, body, a['row'], f)
                yy, xx = np.mgrid[0:PH, 0:PW]
                near = np.hypot(xx - (POX + p['gx']), yy - (POY + p['gy'])) <= 3.2
                sk = skin_yeon(b) & (b[..., 3] > 100) & near
                ring = binary_dilation(sk, iterations=1) & (b[..., 3] > 100) & (b[..., :3].max(-1) < 70) & near
                m = (sk | ring) & (lay[..., 3] > 0)
                lay[m] = b[m]
            # split: in front of the body where 연 draws its weapons so, else behind (wback)
            solid = lay[..., 3] > 0
            fr = p['front']
            parts = [solid & fr, solid & ~fr] if p['back'] else [solid, np.zeros_like(solid)]
            if not has_w:
                parts = [np.zeros_like(solid), solid]
            for i, m in enumerate(parts):
                if not m.any():
                    continue
                ys, xs = np.nonzero(m)
                ty_, tx_ = a['row'] * och + ofy + ys - POY, f * ocw + ofx + xs - POX
                ok = (ty_ >= a['row'] * och) & (ty_ < (a['row'] + 1) * och) & (tx_ >= f * ocw) & (tx_ < (f + 1) * ocw)
                sheets[i][ty_[ok], tx_[ok]] = lay[ys[ok], xs[ok]]
    got = {}
    for i, sh in enumerate(sheets):
        if not sh[..., 3].any():
            continue
        key = piece if i == 0 else piece + '_wb'
        fname = f'{key}_{cls}.png'
        Image.fromarray(sh).save(os.path.join(root, fname), optimize=True)
        got[key] = {'kind': 'weapon' if i == 0 else 'wback', 'file': 'sinsu/' + fname, 'cols': cols, 'cell': [ocw, och],
                    'foot': [ofx, ofy], 'side': [], 'k': round(float(length / max(1.0, math.hypot(t[0] - g[0], t[1] - g[1]))), 3)}
        if i:
            got[key]['variant'] = 's_' + piece
    return got


def build(gear, *argv):
    pieces = {k: v for k, v in config(argv).items() if not k.startswith('_')}
    fixes = config(argv).get('_pose', {})
    raw = os.path.join(gear, 'sinsu_worn', 'raw')
    root = next((a for a in argv if not a.endswith('.json') and not a.startswith('--')), os.path.join(gear, 'sinsu_worn'))
    os.makedirs(root, exist_ok=True)
    h2 = os.path.join(gear, 'yhero2')
    index = json.load(open(os.path.join(h2, 'index.json'), encoding='utf-8'))
    # --pieces=a,b: only those rebuilt (the index keeps the others' entries)
    want = next((set(a.split('=', 1)[1].split(',')) for a in argv if a.startswith('--pieces=')), None)
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
            if want and piece not in want:
                continue
            if mode == 'hair':
                got = hair_layers(gear, root, H, cls, piece, item, render, os.path.join(raw, f'icon_{rawkey(item)}.png'))
                if got:
                    out.setdefault(cls, {}).update(got)
                    print(cls, piece, 'hair', got[piece]['k'])
                continue
            if mode == 'weapon':
                # held as 연 holds the class's own weapons (class_poses)
                if cls not in hands:
                    hands[cls] = class_poses(h2, H, -top, fixes.get(cls))
                got = weapon_layers(h2, H, cls, piece, conf, render, *hands[cls], root, rows, cols, -top, k)
                out.setdefault(cls, {}).update(got)
                print(cls, piece, {k: v['k'] for k, v in got.items()})
                continue
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
                    pp, ob = piece_pixels(it, ba)
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
            fname = f'{piece}_{cls}.png'
            Image.fromarray(sheet).save(os.path.join(root, fname), optimize=True)
            out.setdefault(cls, {})[piece] = {'kind': 'aback', 'file': 'sinsu/' + fname,
                                               'cols': cols, 'cell': [ocw, och], 'foot': [ofx, ofy],
                                               'side': [side.get(r, '') for r in range(rows)], 'k': round(k, 3)}
            print(cls, piece, 'k', round(k, 3))
    ip = os.path.join(root, 'index.json')
    if want and os.path.exists(ip):
        old = json.load(open(ip, encoding='utf-8'))
        for cls, ps in old.items():
            for p in want:  # (a rebuilt weapon's part behind the body, gone now)
                ps.pop(p + '_wb', None)
        for cls, ps in out.items():
            old.setdefault(cls, {}).update(ps)
        out = old
    json.dump(out, open(ip, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    {'fetch': fetch, 'build': build}[sys.argv[1]](*sys.argv[2:])
