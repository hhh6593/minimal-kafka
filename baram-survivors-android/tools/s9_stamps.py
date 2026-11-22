#!/usr/bin/env python3
"""9차 effects built from single pieces cut from the original capture, where the capture's whole field cannot be lifted clean.

    python3 s9_stamps.py SRC_DIR OUT_DIR [id,…]

서리파편 (m_seori): in 2662 IMG23 the field of ice lies over the dummies, their bars and the damage numbers, and the
capture's right edge cuts it — cut whole, it came out with square seams, number scraps and the dummies' holes. Here only
the crystals that stand clear of all of that (frame 35) are taken, each whole: its body (bright blue, what moved from the
clean frame 0, with the white heart inside it kept), its glow around it as far as the blue goes. They are set over the
skill's own hit box (data.js m_shards half [85, 105] game px = ±137 × ±169 capture px at k 0.62) and rise out of the
ground one after another — revealed from the base up, held, faded — on a 12-frame loop: the original's "얼음 결정이 거듭
솟아". No pixel is drawn that the original does not have; pieces are only moved and mirrored.

Writes OUT_DIR/<id>.png and merges its entry into OUT_DIR/index.json (the s9_fx.py format).
"""
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage


def frames_of(path):
    im = Image.open(path)
    out = []
    for i in range(im.n_frames):
        im.seek(i)
        out.append(np.asarray(im.convert("RGB")).astype(np.int16))
    return out


def crystals(fr, bg, f, keep=None):
    """the clear crystals of frame f: [(rgba image, base x in it, base y in it)]"""
    a = fr[f]
    d = np.abs(a - bg).max(2)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    core = (d > 40) & (b > 150) & (b - r > 35)
    # what is not ice: the numbers' warm bursts and the bars' green, and a margin round them (the digits' outlines)
    bad = ndimage.binary_dilation(((r > b + 5) & (d > 30)) | ((g > b + 20) & (g > r + 20)), iterations=3)
    lab, n = ndimage.label(core)
    out = []
    for k, sl in enumerate(ndimage.find_objects(lab)):
        h, w = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
        if h < 28 or w < 14:
            continue  # (wisps of mist, not crystals)
        comp = lab == k + 1
        reg = ndimage.binary_dilation(comp, iterations=3)
        if (bad & reg).any() or sl[1].stop >= a.shape[1] - 4 or sl[0].stop >= a.shape[0] - 4:
            continue
        # a crystal has its deep violet-blue facets (mist is pale and grey-blue)
        if ((b > 190) & (b - r > 80) & comp).sum() < 40:
            continue
        # the body: the blue, the white-hot heart between it, the gaps closed and filled
        white = (a.min(2) > 150) & (d > 40) & ndimage.binary_dilation(comp, iterations=2)
        body = ndimage.binary_fill_holes(ndimage.binary_closing(comp | white, iterations=4)) & reg
        soft = np.clip((d - 25) / 40, 0, 1) * np.clip((b - r - 15) / 30, 0, 1)
        al = np.where(body, 1.0, np.where(reg, soft, 0.0))
        # broken dots inside it (a stray dark or warm pixel of the floor showing through): the nearest ice pixel's colour
        a = a.copy()
        brk = body & ((r > b - 10) | ((a.max(2) < 110) & ndimage.binary_erosion(body, iterations=2)))
        if brk.any():
            good = body & ~brk
            _, (iy, ix) = ndimage.distance_transform_edt(~good, return_indices=True)
            a[brk] = a[iy[brk], ix[brk]]
        y0, y1, x0, x1 = sl[0].start - 4, sl[0].stop + 4, sl[1].start - 4, sl[1].stop + 4
        rgba = np.dstack([a, al * 255]).astype(np.uint8)[y0:y1, x0:x1].copy()
        # last, any pinhole or notch left in the solid part (the floor showing through as a dot): closed, in the colour
        # of the nearest solid pixel
        solid = rgba[..., 3] > 128
        gap = ndimage.binary_fill_holes(ndimage.binary_closing(solid, iterations=2, border_value=0)) & ~solid
        if gap.any():
            _, (iy, ix) = ndimage.distance_transform_edt(~solid, return_indices=True)
            rgba[gap, :3] = rgba[iy[gap], ix[gap], :3]
            rgba[gap, 3] = 255
        ys, xs = np.nonzero(body[y0:y1, x0:x1])
        out.append((Image.fromarray(rgba), int(np.median(xs)), int(ys.max())))
    return out if keep is None else [out[i] for i in keep]


def seori(src_dir):
    fr = frames_of(os.path.join(src_dir, "gif2662/IMG23.gif"))
    st = [c for f in (35, 36, 38) for c in crystals(fr, fr[0], f)]
    st.sort(key=lambda s: -s[0].height)
    cw, ch, ox, oy, hx, hy = 330, 420, 165, 245, 137, 169  # (room above the top row for the tallest crystal)
    # 16 spots, a staggered grid over the hit box; the big clusters on the inner ones
    spots = []
    rows = 5
    for j in range(rows):
        y = oy - hy + 40 + j * (2 * hy - 50) / (rows - 1)
        cols = 4 if j % 2 == 0 else 3
        for i in range(cols):
            x = ox - hx + 22 + (i + (0.5 if cols == 3 else 0)) * (2 * hx - 44) / 3
            spots.append((x, y))
    rng = np.random.RandomState(23)
    order = rng.permutation(len(spots))
    N = 12
    cells = [Image.new("RGBA", (cw, ch)) for _ in range(N)]
    for si, (x, y) in enumerate(spots):
        inner = abs(x - ox) < hx * 0.6 and abs(y - oy) < hy * 0.6
        img, bx, by = st[0] if inner and si % 3 == 0 else st[1 + (si % (len(st) - 1))]
        if si % 3 == 1:
            img = img.transpose(Image.FLIP_LEFT_RIGHT)
            bx = img.width - 1 - bx
        ph = int(order[si] * N / len(spots))
        for t in range(N):
            loc = (t - ph) % N
            show = {0: 0.35, 1: 0.7}.get(loc, 1.0)
            alpha = {8: 0.6, 9: 0.3}.get(loc, 1.0)
            if loc >= 10:
                continue
            # risen this far: the crystal pushed down under its base line and cut there
            hgt = max(1, int(round((by + 1) * show)))
            piece = img.crop((0, 0, img.width, hgt))  # (its tip first)
            arr = np.asarray(piece).copy().astype(np.float32)
            arr[..., 3] *= alpha
            if show < 1:
                # (it comes out of the ground: no hard cut at the ground line)
                n = min(4, hgt)
                arr[hgt - n:, :, 3] *= np.linspace(1, 0.25, n)[:, None]
            piece = Image.fromarray(arr.astype(np.uint8))
            cells[t].alpha_composite(piece, (int(round(x - bx)), int(round(y + 1 - hgt))))
    return cells, {"cell": [cw, ch], "n": N, "ms": 80, "add": False, "cap": 420, "anchor": [ox, oy], "src": "gif2662/IMG23.gif", "k": 0.62}


def white_pieces(fr, bg, frames, x_max=682):
    """the clear white pieces (arrow streaks, dust) of 2662 IMG44's 화살비폭격, frames `frames`: [(kind, rgba, foot x, foot y)].
    A piece is kept only when nothing round it is a number's blue, a hit star's orange, a bar's green or a digit's dark rim
    (6 px clear); its opacity and colour from how far it moved from the clean frame (O = a·F + (1−a)·B)."""
    out = []
    for f in frames:
        a = fr[f].astype(np.float32)
        r, g, b = a[..., 0], a[..., 1], a[..., 2]
        D = a - bg
        d = np.abs(D).max(2)
        white = (d > 35) & (a.min(2) > 150) & (a.max(2) - a.min(2) < 45)
        bad = ((r > 190) & (r - b > 70)) | ((b - r > 60) & (b > 120)) | ((g > r + 40) & (g > b + 40)) | ((b - r > 25) & (a.max(2) < 140))
        bad = ndimage.binary_dilation(bad, iterations=6)
        lab, n = ndimage.label(ndimage.binary_dilation(white, iterations=2))
        for k, sl in enumerate(ndimage.find_objects(lab)):
            comp = lab[sl] == k + 1
            h, w = comp.shape
            if comp.sum() < 30 or (bad[sl] & comp).any() or sl[1].start < 4 or sl[1].stop > x_max or sl[0].start < 2:
                continue
            kind = 'streak' if h > 2.5 * w and h > 30 else ('puff' if comp.sum() > 120 and h < 2 * w + 10 else None)
            if not kind:
                continue
            y0, y1, x0, x1 = sl[0].start - 3, sl[0].stop + 3, sl[1].start - 3, sl[1].stop + 3
            reg = ndimage.binary_dilation(lab == k + 1, iterations=2)[y0:y1, x0:x1]
            al = np.clip((d[y0:y1, x0:x1] - 14) / 70, 0, 1) ** 0.7 * reg  # (the rain bright: its faint glow lifted)
            F = np.clip(bg[y0:y1, x0:x1] + D[y0:y1, x0:x1] / np.maximum(al, 0.05)[..., None], 0, 255)
            # (white: the ground's own tint taken out of what is left — no brown or grey haze round a white piece)
            F = np.where((al > 0)[..., None], np.maximum(F, F.max(2, keepdims=True) - 12), 0)
            rgba = np.dstack([F, al * 255]).astype(np.uint8)
            ys, xs = np.nonzero(reg)
            out.append((kind, Image.fromarray(rgba), int(np.median(xs)), int(ys.max())))
    return out


def hwasalbi(src_dir):
    """화살비폭격 (궁사 9차 패시브; 2662 IMG44 frames 10-22, after 응축뇌전시): white arrows streak down out of the sky onto the
    ground ahead and burst into white dust. The capture's field is thick with numbers and stars over the dummies, so only the
    streaks and the dust standing clear of all of them are taken, each whole, and set over the rain's own ground (cell
    ±130 × ±80 capture px round its middle = ±81 × ±50 game px at k 0.62): each streak falls on its spot over two frames and
    leaves its dust there, which fades — 14 spots in turn on a 12-frame loop. Pieces only moved, never drawn."""
    fr = frames_of(os.path.join(src_dir, "gif2662/IMG44.gif"))
    ps = white_pieces(fr, fr[0].astype(np.float32), range(10, 23))
    seen, uniq = set(), []
    for p in ps:
        key = (p[0], p[1].size, p[2], p[3])
        if key not in seen:
            seen.add(key)
            uniq.append(p)
    streaks = sorted([p for p in uniq if p[0] == 'streak'], key=lambda p: -p[1].height)
    puffs = sorted([p for p in uniq if p[0] == 'puff'], key=lambda p: -(p[1].width * p[1].height))
    cw, ch, ox, oy, hx, hy = 330, 300, 165, 190, 130, 80  # (room above for the streaks coming down)
    spots = []
    for j in range(4):
        cols = 6 if j % 2 == 0 else 5
        for i in range(cols):
            x = ox - hx + 12 + (i + (0.5 if cols == 5 else 0)) * (2 * hx - 24) / 5
            spots.append((x, oy - hy + 12 + j * (2 * hy - 24) / 3))
    rng = np.random.RandomState(44)
    order = rng.permutation(len(spots))
    N = 12
    cells = [Image.new("RGBA", (cw, ch)) for _ in range(N)]
    for si, (x, y) in enumerate(spots):
        sk = streaks[si % len(streaks)]
        pf = puffs[si % min(len(puffs), 6)]
        ph = int(order[si] * N / len(spots))
        for t in range(N):
            loc = (t - ph) % N
            if loc < 3:
                # the streak falling onto its spot (its foot 56, 30, then 8 px above it)
                img, bx, by = sk[1], sk[2], sk[3]
                fy = y - {0: 56, 1: 30, 2: 8}[loc]
                cells[t].alpha_composite(img, (int(round(x - bx)), int(round(fy - by))))
            if 3 <= loc <= 6:
                img, bx, by = pf[1], pf[2], pf[3]
                arr = np.asarray(img).astype(np.float32).copy()
                arr[..., 3] *= {3: 1.0, 4: 1.0, 5: 0.65, 6: 0.3}[loc]
                cells[t].alpha_composite(Image.fromarray(arr.astype(np.uint8)), (int(round(x - bx)), int(round(y + 6 - by))))
                if loc == 3:
                    # (the streak still standing in the dust as it lands)
                    img, bx, by = sk[1], sk[2], sk[3]
                    cells[t].alpha_composite(img, (int(round(x - bx)), int(round(y - by))))
    return cells, {"cell": [cw, ch], "n": N, "ms": 80, "add": False, "cap": 420, "anchor": [ox, oy], "src": "gif2662/IMG44.gif", "k": 0.62}


def rain_pieces(fr, frames, box):
    """만시창공's rain (2662 IMG47): the clear pieces of its light in `frames` inside `box` — the falling arrows (blue heads,
    pale shafts) and the long light streaks — each whole, kept only when no hit star's number box (the star and 80 px to
    its right, where the number is written), no bar, no label and no skull lies on or beside it: [(kind, rgba, x, y)] with
    (x, y) its top-left in the capture. Its own pixels on the black of the darkened screen: alpha by brightness."""
    out = []
    x0b, y0b, x1b, y1b = box
    for f in frames:
        a = fr[f].astype(np.float32)
        r, g, b = a[..., 0], a[..., 1], a[..., 2]
        mn, mx = a.min(2), a.max(2)
        star = (r > 170) & (r - g > 45) & (b < 140)
        bad = ndimage.binary_dilation(star | ((g > r + 40) & (g > b + 40)) | ((r > 150) & (g < 70)), iterations=5)
        lab, n = ndimage.label(ndimage.binary_dilation(star, iterations=2))
        for sl in ndimage.find_objects(lab):
            if (sl[0].stop - sl[0].start) * (sl[1].stop - sl[1].start) >= 30:
                bad[max(0, sl[0].start - 10):sl[0].stop + 14, max(0, sl[1].start - 10):sl[1].stop + 82] = True
        # (a fallen one's skull: white, dark-eyed, beside the ground — and the hero's own warm body: kept out by colour)
        light = np.maximum(np.clip((mn - 120) / 60, 0, 1), np.clip((b - 150) / 50, 0, 1) * np.clip((b - r - 40) / 30, 0, 1)) \
            * np.clip((b - r + 15) / 20, 0, 1)
        lab, n = ndimage.label(ndimage.binary_dilation(light > 0.08, iterations=1))
        for k, sl in enumerate(ndimage.find_objects(lab)):
            comp = lab[sl] == k + 1
            h, w = comp.shape
            if sl[1].start < x0b or sl[1].stop > x1b or sl[0].start < y0b or sl[0].stop > y1b:
                continue
            reg = ndimage.binary_dilation(lab == k + 1, iterations=3)
            if (reg & bad).any() or comp.sum() < 40:
                continue
            if h >= 24 and h <= 80 and w <= 40:
                kind = "arrow"
            elif h > 80 and w <= 30:
                kind = "streak"
            else:
                continue
            y0, y1, x0, x1 = sl[0].start - 2, sl[0].stop + 2, sl[1].start - 2, sl[1].stop + 2
            m = ndimage.binary_dilation(lab == k + 1, iterations=1)[y0:y1, x0:x1]
            al = np.clip((mx[y0:y1, x0:x1] - 25) / 70, 0, 1) * m
            out.append((kind, Image.fromarray(np.dstack([a[y0:y1, x0:x1], al * 255]).astype(np.uint8)), x0, y0))
    return out


def ult9rain(src_dir, out_dir):
    """만시창공 (궁사 9차 필살기): the rain of arrows is the heart of it (2662 IMG47 frames 29-44), but in the middle of the
    capture it falls through columns of damage numbers. s9_fx.py's a_ult9 (the scroll round the screen, the middle left
    out where it was not clean) gets it back here from clean pieces: the light streaks (frames 27-35) and the falling arrows
    (frames 36-42), each whole, laid over the middle window — the streaks standing in its first cells, the arrows falling
    (each moved down a stretch a cell along its own slant) after — at the capture's scale × the sheet's. Runs after s9_fx.py."""
    fr = frames_of(os.path.join(src_dir, "gif2662/IMG47.gif"))
    ps = rain_pieces(fr, range(27, 43), (60, 40, 740, 600))
    arrows = [p for p in ps if p[0] == "arrow"]
    streaks = [p for p in ps if p[0] == "streak"]
    idx = json.load(open(os.path.join(out_dir, "index.json"), encoding="utf-8"))
    e = idx["a_ult9"]
    cw, ch = e["cell"]
    n = e["n"]
    sheet = Image.open(os.path.join(out_dir, "a_ult9.png")).convert("RGBA")
    cells = [sheet.crop((i * cw, 0, (i + 1) * cw, ch)) for i in range(n)]
    z = cw / 796.0
    rng = np.random.RandomState(47)
    # the window (capture px): the ellipse the scroll leaves open round the hero
    cx, cy, rx, ry = 388, 262, 250, 220
    def spots(k):
        pts = []
        while len(pts) < k:
            x, y = rng.uniform(-1, 1, 2)
            if x * x + y * y <= 1:
                pts.append((cx + x * rx, cy + y * ry))
        return pts
    # cells: frames 14, 17, … 44 — streaks from frame 29 (cell 5), arrows from frame 35 (cell 7) to the end, fading in the last
    plan = {5: (20, 0, 1.0), 6: (24, 14, 1.0), 7: (14, 30, 1.0), 8: (6, 36, 1.0), 9: (0, 36, 1.0), 10: (0, 22, 0.55)}
    arrow_spots = spots(36)
    for ci, (ns, na, fade) in plan.items():
        if ci >= n:
            continue
        layer = Image.new("RGBA", (796, 644))
        for j, (x, y) in enumerate(spots(ns) if streaks else []):
            kind, img, _, _ = streaks[(j + ci * 3) % len(streaks)]
            layer.alpha_composite(img, (int(x - img.width / 2), int(y - img.height / 2)))
        for j in range(min(na, len(arrow_spots))):
            if not arrows:
                break
            kind, img, _, _ = arrows[j % len(arrows)]
            x, y = arrow_spots[j]
            y = y - 60 + (ci - 7) * 40  # (falling: each a stretch lower a cell)
            layer.alpha_composite(img, (int(x - img.width / 2), int(y - img.height / 2)))
        arr = np.asarray(layer).astype(np.float32)
        yy, xx = np.mgrid[0:644, 0:796]
        rr = np.sqrt(((xx - cx) / (rx + 30)) ** 2 + ((yy - cy) / (ry + 30)) ** 2)
        arr[..., 3] *= np.clip((1.15 - rr) / 0.25, 0, 1) * fade  # (the rain's own round, soft at its edge: no straight cut)
        layer = Image.fromarray(arr.astype(np.uint8)).resize((cw, ch), Image.LANCZOS)
        cells[ci] = Image.alpha_composite(cells[ci], layer)
    print("rain pieces: %d arrows, %d streaks" % (len(arrows), len(streaks)))
    return cells, e


# ---------------------------------------------------------------------------------------------------------------------
# 장승영역 (영술사 9차 → 도깨비, 2662 IMG75; PVP 기술 → 몬스터 상대로, 모습 그대로). The capture's camera is still from frame
# 1 to the end, but its palette changes twice (frames 0-17, 18-20, 21-162: the floor's dots differ by ~15 between them), so
# each part is taken against a clean frame of its own stretch:
#  - the seal (the golden square of glyphs and the 태극, frames 5-17) against frame 2 (the 장승 and the green ring already
#    there, no seal): unmix; where the caster (and its bar and flag) stands over it, the seal's own pixels half a turn (or a
#    quarter turn) round its middle — the seal is the same turned (its square of glyphs four ways, its 태극 half a turn);
#    where a 장승 stands over its lower edge, left clear (the 장승 are drawn over it).
#  - the 장승 (frame 30, against frame 150 — the same stretch, the 장승 gone): every 장승 has its life bar written over its
#    hat (and, down the two side columns, over the 장승 behind it). So none of the ring is lifted whole: the three kinds of
#    장승 (A the round-faced one in the narrow 갓, B the grimacing one in the tall hat, C the tall laughing one in the
#    broad-brimmed hat) are each cut once, clean, from the bottom row (only their own bar above them, taken off; the hat's
#    top row under it carried up from the row below), and set back where each 장승 of the capture stands — found by its
#    bar (bars are on a 48 px grid, x = 115 + 48k; the kind by the hat under the bar); the three B of the top row, whose
#    bars are above the capture's edge, at their places in that row. Drawn top to bottom, as the capture overlaps them.
#  - the green ring under them (the zone's own square, one tile wide): unmixed, its colour and opacity the median of its
#    clear pixels, laid over the ring's own square (its straight edges are its own shape).
#  (the end, frames 138-142 — the 장승 breaking into chunks — is not taken: the bars still float over the chunks there, and
#  cut out they left straight gaps through them; the ring fades out instead.)
# Two sheets: o_dk_jangseal (the seal: appearing 5-7, then 8-17 a loop) and o_dk_jangpole (the ring of 장승 standing on the
# green ring). Both at the original's own size (0.62) with the same pivot: the seal's middle (the caster's place).
JS_C = (329, 297)        # the seal's middle in the capture (the zone's middle)
JS_REF = 30             # the frame the 장승 are cut from (set by js_ref: the seal glowing as in frame 150)
JS_CAM = 48             # frames 1-17 (the seal): the camera that far left of frames 21-162 (the 장승, the end)
JS_GRID = 115            # bars' left edge x = JS_GRID + 48k


def _js_unmix(a, bg, k=90, lo=16):
    D = a - bg
    m = np.abs(D).max(2)
    al = np.clip((m - lo) / (k - lo), 0, 1)
    F = np.clip(bg + D / np.maximum(al, 1e-3)[..., None], 0, 255)
    return F, al


def _js_bars(a):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    gr = (g > r + 50) & (g > b + 50)
    lab, n = ndimage.label(gr)
    out = []
    for sl in ndimage.find_objects(lab):
        w, h = sl[1].stop - sl[1].start, sl[0].stop - sl[0].start
        if w >= 40 and 4 <= h <= 8:
            out.append((sl[1].start, sl[0].start))
    return out


def js_seal(fr, f, polemask):
    """the seal of frame f, as rgba over the whole capture (where a 장승 stands over it: clear — the 장승 are drawn over it)"""
    a, bg = fr[f].astype(np.float32), fr[2].astype(np.float32)
    # (k 80: the seal as solid gold over our darker ground as over the original's grey — at 110 it read orange and pale)
    F, al = _js_unmix(a, bg, 80, 18)
    H, W = al.shape
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    # (frames 1-17: the camera 48 px to the left of where it is from frame 21 on — these coordinates are that camera's)
    cx, cy = JS_C[0] - JS_CAM, JS_C[1]
    # (its own square, rounded at the corners, a little glow round it)
    sq = np.clip((np.minimum(np.minimum(xx - 128, 434 - xx), np.minimum(yy - 142, 452 - yy))) / 8, 0, 1)
    al = al * sq
    # the caster over its middle: its body, its bars, its flag; the mouse pointer (a grey sword) and the ground's own grey
    # specks round the 태극 (the seal has no grey but in the 태극's white)
    # (the caster in the clean frame 2 too — its wings of light wider than in these: what either covers)
    hole = (((xx - 262) / 92) ** 2 + ((yy - 236) / 106) ** 2 <= 1) | ((xx >= 248) & (xx < 312) & (yy >= 326) & (yy < 352))
    hole |= (xx >= 258) & (xx < 304) & (yy >= 136) & (yy < 192)
    # (the 장승's life bars over its lower edge: in both frames, so unmix reads them as clear — the seal's own pixels there)
    for bx, by in _js_bars(a):
        hole[max(0, by - 2):by + 9, max(0, bx - 2):bx + 49] = True
    grey = (a.max(2) - a.min(2) < 40) & (np.hypot(xx - cx, yy - cy) > 120) & (al > 0.2)
    hole |= ndimage.binary_dilation(grey, iterations=2)
    out_F, out_al = F.copy(), al.copy()
    todo = hole.copy()
    dx, dy = xx - cx, yy - cy
    # (half a turn first — the 태극 and the square both; then the square's own mirror and quarter turns)
    for kind, ang in (("rot", 180), ("mir", 0), ("rot", 90), ("rot", -90)):
        if not todo.any():
            break
        if kind == "mir":
            sx, sy = np.rint(2 * cx - xx).astype(int).clip(0, W - 1), yy.astype(int)
        else:
            c, s = np.cos(np.radians(ang)), np.sin(np.radians(ang))
            sx = np.rint(cx + dx * c - dy * s).astype(int).clip(0, W - 1)
            sy = np.rint(cy + dx * s + dy * c).astype(int).clip(0, H - 1)
        ok = todo & ~hole[sy, sx] & ~polemask[sy, sx]
        out_F[ok], out_al[ok] = F[sy[ok], sx[ok]], al[sy[ok], sx[ok]]
        todo &= ~ok
    out_al[todo] = 0
    # (what no turn gives — the 태극's middle, under the caster in every frame: our hero stands there — ends softly)
    out_al *= np.clip(ndimage.distance_transform_edt(~todo) / 6, 0, 1)
    return np.dstack([np.where(out_al[..., None] > 0, out_F, 0), out_al * 255]).astype(np.uint8)


def js_kinds(fr):
    """the three 장승, clean, from the bottom row of frame 30: {kind: (rgba, bar x, bar y)} (bar = its top left)"""
    a, bg = fr[JS_REF].astype(np.float32), fr[150].astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    d = np.abs(a - bg).max(2)
    mx, mn = a.max(2), a.min(2)
    # (only its own colours: the wood's brown and the hat's black — not the green ring under it, nor the seal's gold glow
    # behind it)
    # (each 장승 casts a grey shadow on the floor — the floor darkened, its own hue: not taken; a neighbour's bar end on a
    # brim, green, out; the black only the hat's, at the top)
    hat = (mx < 95) & (mx - mn < 34)
    green = ndimage.binary_dilation((g > r + 30) & (g > b + 20), iterations=1)
    sa, sb = a.sum(2) + 1, bg.sum(2) + 1
    shadow = (sa < 0.92 * sb) & (np.abs(a / sa[..., None] - bg / sb[..., None]).max(2) < 0.035)
    wood = ~shadow & ~hat & (r > b + 25)
    body = (d > 24) & (wood | hat) & ~green
    out = {}
    for kind, bx, by in (("A", 163, 394), ("B", 259, 376), ("C", 355, 366)):
        x0, x1, y0, y1 = bx - 10, bx + 56, by + 6, 512
        m = body[y0:y1, x0:x1].copy()
        hr = {"A": 22, "B": 30, "C": 34}[kind]
        m[hr:] &= ~hat[y0 + hr:y1, x0:x1] | wood[y0 + hr:y1, x0:x1]
        m = ndimage.binary_opening(m, iterations=1)
        m = ndimage.binary_closing(m, iterations=2)
        lab, n = ndimage.label(m)
        # (the 장승 itself: the piece under the bar's middle; a neighbour's brim at the side left out)
        mid = lab[:, 33]
        ids = [v for v in np.unique(mid) if v]
        m = np.isin(lab, ids)
        m = ndimage.binary_fill_holes(m)
        m &= ~green[y0:y1, x0:x1]
        rgba = np.dstack([a[y0:y1, x0:x1], m * 255]).astype(np.uint8)
        # (the hat's top row lay under the bar's lower rim: the row below carried up one)
        top = np.nonzero(m.any(1))[0][0]
        if top == 0:
            rgba = np.vstack([rgba[1:2], rgba])
            by -= 1
        out[kind] = (Image.fromarray(rgba), bx - x0, 6)
    return out


def js_kind_of(by):
    """which of the three stands under a bar: their feet are on the 48 px grid (the bar of A 10 px below a whole step, of B
    18 px above that, of C 28 px above it — the taller hat's bar higher)"""
    for k, lift in (("A", 0), ("B", 18), ("C", 28)):
        if (by + lift - 10) % 48 == 0:
            return k
    raise ValueError("bar off the grid at y %d" % by)


def dk_jang(src_dir, out_dir=None):
    fr = frames_of(os.path.join(src_dir, "gif2662/IMG75.gif"))
    # the box round the zone in the capture, room above for the top row's hats
    X0, Y0, X1, Y1 = 100, -24, 560, 522
    cw, ch = X1 - X0, Y1 - Y0
    ox, oy = JS_C[0] - X0, JS_C[1] - Y0

    def put(cell, rgba, x, y):
        cell.alpha_composite(rgba if isinstance(rgba, Image.Image) else Image.fromarray(rgba), (int(x - X0), int(y - Y0)))

    # --- the 장승 ring
    global JS_REF
    # (the seal pulses gold and red: the 장승 are cut from the frame whose seal glows as in frame 150, so its glow behind
    # them cancels out)
    reg = (slice(300, 372), slice(330, 470))
    JS_REF = min(range(21, 136), key=lambda f: np.median(np.abs(fr[f][reg] - fr[150][reg]).max(2)))
    print("장승 from frame", JS_REF)
    kinds = js_kinds(fr)
    a30 = fr[30].astype(np.float32)
    spots = []
    for bx, by in _js_bars(a30):
        if bx < 110 or (bx - JS_GRID) % 48:
            continue  # (the bystander's bar at the left)
        spots.append((js_kind_of(by), bx, by))
    # the top row's three B, their bars above the capture's edge: in the row with the A beside them (A's bar 10 → B's −8)
    for bx in (163, 259, 307):
        spots.append(("B", bx, -8))
    lift = {"A": 0, "B": 18, "C": 28}  # (same feet: the taller hat's bar higher)
    spots.sort(key=lambda s: s[2] + lift[s[0]])
    print("장승:", " ".join("%s@%d,%d" % s for s in spots))
    poles = Image.new("RGBA", (cw, ch))
    # the green ring: its colour and opacity (the median of its clear pixels against the field without it)
    F, al = _js_unmix(a30, fr[150].astype(np.float32), 90, 12)
    r, g, b = a30[..., 0], a30[..., 1], a30[..., 2]
    band = (g > r + 5) & (np.abs(a30 - fr[150]).max(2) > 20) & ~((g > r + 50) & (g > b + 50))
    col = np.median(F[band & (al > 0.6)], axis=0)
    alb = float(np.median(al[band]))
    print("ring colour", col, "alpha", alb)
    ring = np.zeros((ch, cw, 4), np.uint8)
    yy, xx = np.mgrid[0:ch, 0:cw]
    gx, gy = xx + X0, yy + Y0
    outer = (gx >= 113) & (gx < 545) & (gy >= 82) & (gy < 514)
    inner = (gx >= 161) & (gx < 497) & (gy >= 130) & (gy < 466)
    rm = outer & ~inner
    ring[rm, :3] = col.astype(np.uint8)
    ring[rm, 3] = int(alb * 255)
    poles.alpha_composite(Image.fromarray(ring))
    for kind, bx, by in spots:
        img, kx, ky = kinds[kind]
        put(poles, img, bx - kx, by + ky)
    # --- the seal (where a 장승 stands over it, clear: the ring is drawn over it)
    pa = np.asarray(poles)[..., 3]
    polemask = np.zeros(fr[0].shape[:2], bool)
    polemask[0:Y1, X0 - JS_CAM:X1 - JS_CAM] = ndimage.binary_dilation(pa[-Y0:, :] > 200, iterations=1)
    polemask[:, :162 - JS_CAM] = True
    polemask[:, 497 - JS_CAM:] = True
    seals = []
    for f in range(5, 18):
        sl = js_seal(fr, f, polemask)
        cell = Image.new("RGBA", (cw, ch))
        put(cell, sl[0:540, 160 - JS_CAM:500 - JS_CAM], 160, 0)
        seals.append(cell)
    base = {"cell": [cw, ch], "ms": 100, "add": False, "anchor": [ox, oy], "src": "gif2662/IMG75.gif", "k": 0.62, "cap": 420}
    return {"dk_jangseal": (seals, {**base, "n": len(seals)}), "dk_jangpole": ([poles], {**base, "n": 1})}


BUILDERS = {"m_seori": seori, "a_hwasalbi": hwasalbi, "dk_jang": dk_jang}  # (dk_jang: two sheets, dk_jangseal and dk_jangpole)
POST = {"a_ult9": ult9rain}  # (re-drawing an s9_fx.py sheet: run after it)


def main():
    src_dir, out_dir = sys.argv[1], sys.argv[2]
    only = sys.argv[3].split(",") if len(sys.argv) > 3 else list(BUILDERS)
    os.makedirs(out_dir, exist_ok=True)
    ipath = os.path.join(out_dir, "index.json")
    index = json.load(open(ipath, encoding="utf-8")) if os.path.isfile(ipath) else {}
    for sid in only:
        got = POST[sid](src_dir, out_dir) if sid in POST else BUILDERS[sid](src_dir)
        for sid2, (cells, entry) in (got.items() if isinstance(got, dict) else [(sid, got)]):
            cw, ch = entry["cell"]
            sheet = Image.new("RGBA", (cw * len(cells), ch))
            for i, c in enumerate(cells):
                sheet.paste(c, (i * cw, 0))
            sheet.save(os.path.join(out_dir, sid2 + ".png"), optimize=True)
            index[sid2] = entry
            print(sid2, cw, ch, len(cells))
    json.dump(index, open(ipath, "w", encoding="utf-8"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
