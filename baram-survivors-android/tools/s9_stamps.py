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
        # (the glow as strong as it reads over the original's grey floor: lifted, it was dim over our dark ground)
        soft = (np.clip((d - 25) / 40, 0, 1) * np.clip((b - r - 15) / 30, 0, 1)) ** 0.8
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
    # 21 spots, a staggered grid over the hit box; the big clusters on the inner ones (16 read about a fifth sparser and dimmer than the
    # original's field, packed crystal against crystal)
    spots = []
    rows = 6
    for j in range(rows):
        y = oy - hy + 36 + j * (2 * hy - 46) / (rows - 1)
        cols = 4 if j % 2 == 0 else 3
        for i in range(cols):
            x = ox - hx + 18 + (i + (0.5 if cols == 3 else 0)) * (2 * hx - 36) / 3
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


def clean_streak(img):
    """a streak piece of 화살비폭격, or None: one straight stroke only — a piece with a hit marker's dark bars across it
    (the "‖" written on a dummy it fell past) or two strokes joined in an "×" is left out; what lies off its own line
    (a marker's or a digit's end beside it) taken off."""
    a = np.asarray(img).astype(np.float32)
    al = a[..., 3] / 255
    if ((al > 0.4) & (a[..., :3].max(2) < 120)).sum() > 3:
        return None  # (dark bars across it: a marker)
    ys, xs = np.nonzero(al > 0.5)
    if len(xs) < 12:
        return None
    w = al[ys, xs]
    mx_, my_ = np.average(xs, weights=w), np.average(ys, weights=w)
    cov = np.cov(np.vstack([xs - mx_, ys - my_]), aweights=w)
    ev, evec = np.linalg.eigh(cov)
    nx, ny = evec[:, 0]  # (the axis across the stroke)
    if np.sqrt(ev[0]) > 1.1:
        return None  # (thick across for its glow: a marker's bars written across it, as on the one at frame 12's dummy)
    yy, xx = np.mgrid[0:a.shape[0], 0:a.shape[1]]
    dist = np.abs((xx - mx_) * nx + (yy - my_) * ny)
    if (al * (dist > 4.5)).sum() > 0.12 * al.sum():
        return None  # (not one straight stroke: an "×")
    a[..., 3] *= np.clip((6.5 - dist) / 2, 0, 1)
    return Image.fromarray(a.astype(np.uint8))


def solid_puff(img):
    """a dust piece of 화살비폭격 made whole: the capture's floor shows through its grey shading as dark dots and holes
    (unmix reads a grey near the floor's as see-through) — closed, inside its own outline, in the colour of the nearest
    solid dust pixel; its edge kept as it is."""
    a = np.asarray(img).astype(np.float32).copy()
    al = a[..., 3] / 255
    solid = (al > 0.45) & (a[..., :3].max(2) > 150)
    body = ndimage.binary_fill_holes(ndimage.binary_closing(solid, iterations=3, border_value=0))
    body = ndimage.binary_erosion(body, iterations=1) | solid
    gap = body & ~solid
    if gap.any() and solid.any():
        _, (iy, ix) = ndimage.distance_transform_edt(~solid, return_indices=True)
        a[gap, :3] = a[iy[gap], ix[gap], :3]
        a[gap, 3] = 255
    a[solid, 3] = np.maximum(a[solid, 3], 235)
    return Image.fromarray(a.astype(np.uint8))


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
    # (the streaks: one straight stroke each, no marker on it; the dust: a filled round piece — a slanted streak passes the
    # puff test by its box, not by its fill — made whole)
    streaks = sorted([(k, c, x, y) for k, i, x, y in uniq if k == 'streak' for c in [clean_streak(i)] if c is not None], key=lambda p: -p[1].height)
    def fill_of(img):
        al = np.asarray(img)[..., 3] > 100
        return al.sum() / float(al.size)
    puffs = sorted([(k, solid_puff(i), x, y) for k, i, x, y in uniq if k == 'puff' and fill_of(i) > 0.3], key=lambda p: -(p[1].width * p[1].height))
    print("화살비폭격: %d streaks, %d dust" % (len(streaks), len(puffs)))
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


def igibolt(src_dir):
    """이기뇌멸시 (궁사 9차; 2662 IMG40 frame 1): one 뇌전시 striking, whole. The bolt at x 414 runs from y 108 down to its
    arrowhead at 312, but a hit marker and a "10" are written over it at y 168-208. Cut there, it came out half as tall as the
    original's (its lower part only). Here its two clean parts, unmixed off the clean frame 0 (O = a·F + (1−a)·B), are joined
    where the zigzag turns — the upper (y 106-168: its zigzag and a diamond of the lattice) straight onto the lower (y 210-324:
    the next diamond, the arrowhead, its fan of light), crossfaded over 6 rows: the covered 42 rows left out, nothing drawn.
    Its top fades in; the left bolt's strip and its number's red beside the fan taken out. Pivot: the arrowhead's point."""
    fr = frames_of(os.path.join(src_dir, "gif2662/IMG40.gif"))
    a, bg = fr[1].astype(np.float32), fr[0].astype(np.float32)
    D = a - bg
    al = np.clip((np.abs(D).max(2) - 12) / 98.0, 0, 1)
    F = np.clip(bg + D / np.maximum(al, 1e-3)[..., None], 0, 255)
    rgba = np.dstack([F, al * 255])
    X0, X1 = 380, 446
    up, lw = rgba[106:169, X0:X1].copy(), rgba[210:325, X0:X1].copy()
    lw[:82, :10, 3] = 0  # (the left bolt, above the fan)
    r, g = lw[..., 0], lw[..., 1]
    lw[..., 3] *= np.clip(1 - (r - g - 20) / 30, 0, 1)  # (its number's red)
    n = 6
    up[-n:, :, 3] *= np.linspace(1, 0, n)[:, None]
    lw[:n, :, 3] *= np.linspace(0, 1, n)[:, None]
    o = up.shape[0] - n
    out = np.zeros((o + lw.shape[0], X1 - X0, 4), np.float32)
    out[:up.shape[0]] = up
    A, B = out[o:], lw
    ab, aa_ = B[..., 3:] / 255, A[..., 3:] / 255
    al2 = ab + aa_ * (1 - ab)
    out[o:] = np.dstack([(B[..., :3] * ab + A[..., :3] * aa_ * (1 - ab)) / np.maximum(al2, 1e-3), al2 * 255])
    out[:14, :, 3] *= np.linspace(0, 1, 14)[:, None]
    cell = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))
    return [cell], {"cell": [cell.width, cell.height], "n": 1, "ms": 200, "add": False, "anchor": [414 - X0, o + 312 - 210],
                    "src": "gif2662/IMG40.gif", "k": 0.62}


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
    # (the rain the heart of it — 사용자: kept strong: from cell 5 to the end, thickest over cells 7-9)
    plan = {5: (20, 10, 1.0), 6: (24, 24, 1.0), 7: (14, 40, 1.0), 8: (8, 46, 1.0), 9: (4, 46, 1.0), 10: (0, 34, 0.75)}
    arrow_spots = spots(46)
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


def haeil9(src_dir, out_dir):
    """해일강타 (천인 9차; 2662 IMG51): s9_fx.py's cl_haeil (frames 4-14) and cl_haeilhit made clean.
      - cl_haeil: in frames 4-7 an ice pillar, a hit star and a number stand over every dummy in the water; filled from the
        water's smoothed colour they came out as pale bands with straight seams. Those four cells are frame 9's clean water
        (its cell 5) opened from the caster's side (the right, its pivot) towards the left over them — 55, 70, 85, 100 % of
        its length, a soft 40 px edge — the water the original sends out ahead; nothing drawn, only cut. In every cell what is
        warmer than the water (the caster's and the bystanders' brown and red streaks: red over blue) is taken out; the white
        foam (as blue as red) kept.
      - cl_haeilhit: the ice pillar is cut under the hit star over it — its top a straight line; faded instead into a dome
        over its own middle, like a crystal's own crown."""
    idx = json.load(open(os.path.join(out_dir, "index.json"), encoding="utf-8"))
    out = {}
    e = idx["cl_haeil"]
    cw, ch = e["cell"]
    n = e["n"]
    sheet = Image.open(os.path.join(out_dir, "cl_haeil.png")).convert("RGBA")
    cells = [np.asarray(sheet.crop((i * cw, 0, (i + 1) * cw, ch))).astype(np.float32) for i in range(n)]
    for c in cells:
        r, b = c[..., 0], c[..., 2]
        c[..., 3] *= np.clip((b - r + 25) / 25, 0, 1)
    src = cells[5]
    al = src[..., 3]
    xs = np.nonzero(al.max(0) > 20)[0]
    x0, x1 = xs.min(), xs.max()
    xx = np.arange(cw, dtype=np.float32)[None, :]
    for i, frac in enumerate((0.55, 0.7, 0.85, 1.0)):
        edge = x1 - frac * (x1 - x0)
        m = np.clip((xx - edge) / 40 + 0.5, 0, 1)
        c = src.copy()
        c[..., 3] = c[..., 3] * m
        cells[i] = c
    out["cl_haeil"] = ([Image.fromarray(c.astype(np.uint8)) for c in cells], e)
    e2 = idx["cl_haeilhit"]
    cw2, ch2 = e2["cell"]
    sh2 = Image.open(os.path.join(out_dir, "cl_haeilhit.png")).convert("RGBA")
    yy, xx2 = np.mgrid[0:ch2, 0:cw2].astype(np.float32)
    cx = e2["anchor"][0]
    rr = np.sqrt(((xx2 - cx) / (cw2 / 2 + 2)) ** 2 + ((yy - ch2) / ch2) ** 2)
    dome = np.clip((1.02 - rr) / 0.3, 0, 1)
    cells2 = []
    for i in range(e2["n"]):
        c = np.asarray(sh2.crop((i * cw2, 0, (i + 1) * cw2, ch2))).astype(np.float32)
        c[..., 3] *= dome
        cells2.append(Image.fromarray(c.astype(np.uint8)))
    out["cl_haeilhit"] = (cells2, e2)
    return out


def cheongung9(src_dir, out_dir):
    """천궁난사 (궁사 9차; 2662 IMG42 frames 21-27): s9_fx.py's a_cheongung made clean. Its first cell (the white sphere) had a
    bite out of its upper right and a seam across it where the number and star over it were taken out: its upper half
    is its own clean lower half, mirrored (the sphere is round). Its last two (the embers dying, frames 26-27) were mostly what the number
    columns' fill left — smooth orange marks: they are the fifth cell (frame 25, clean) fading out (60 %, 30 %) instead."""
    idx = json.load(open(os.path.join(out_dir, "index.json"), encoding="utf-8"))
    e = idx["a_cheongung"]
    cw, ch = e["cell"]
    n = e["n"]
    sheet = Image.open(os.path.join(out_dir, "a_cheongung.png")).convert("RGBA")
    cells = [np.asarray(sheet.crop((i * cw, 0, (i + 1) * cw, ch))).astype(np.float32) for i in range(n)]
    c0 = cells[0]
    ay = int(round(e["anchor"][1]))
    h = min(ay, ch - ay)
    c0[ay - h:ay] = c0[ay:ay + h][::-1]
    cells[0] = c0
    for i, k in ((5, 0.6), (6, 0.3)):
        if i < n and n > 4:
            c = cells[4].copy()
            c[..., 3] *= k
            cells[i] = c
    return [Image.fromarray(c.astype(np.uint8)) for c in cells], e


def mdult9edge(src_dir, out_dir):
    """비전방진 (마도사 9차 필살기; 2662 IMG64): s9_fx.py's md_ult9 keeps the art to the capture's own box, and the tomes, gears
    and bursts that run to its edge ended there on a straight line. Faded out instead towards a rounded box (a
    super-ellipse of power 6: the corners' tomes mostly kept) over its last 10 % — the art's own pixels, only faded."""
    idx = json.load(open(os.path.join(out_dir, "index.json"), encoding="utf-8"))
    e = idx["md_ult9"]
    cw, ch = e["cell"]
    sheet = Image.open(os.path.join(out_dir, "md_ult9.png")).convert("RGBA")
    yy, xx = np.mgrid[0:ch, 0:cw].astype(np.float32)
    rr = (np.abs((xx - (cw - 1) / 2) / (cw / 2)) ** 6 + np.abs((yy - (ch - 1) / 2) / (ch / 2)) ** 6) ** (1 / 6)
    fade = np.clip((1 - rr) / 0.1, 0, 1)
    cells = []
    for i in range(e["n"]):
        c = np.asarray(sheet.crop((i * cw, 0, (i + 1) * cw, ch))).astype(np.float32)
        c[..., 3] *= fade
        cells.append(Image.fromarray(c.astype(np.uint8)))
    return cells, e


def clult9orb(src_dir, out_dir):
    """천변지이 (천인 9차 필살기; 2662 IMG56): s9_fx.py's cl_ult9 keeps the storm round the screen but its middle, where the
    numbers' columns stand, only by its vivid colour — the white orb round the hero and the cyan lightning whirling round it
    were lost with the numbers. Here they are laid back over each cell from the cell's own frame (8, 11, … 38):
      - the orb: its ring (r 50-106 round (408, 354)) where it is the orb's own cream, white and pale blue — not a digit's
        blue, a hit star's orange, a bar or the hero's red armour; what of the ring those cover is the ring's own pixel a turn
        on round its middle (the nearest clean turn: the orb is a whirl); inside it, where the hero stands, faded out;
      - the lightning: the frame's cyan (green as high as blue, far over red), each stroke whole when no digit, star or bar
        lies on or beside it, strokes of under 40 px left out (a digit's light edge).
    Its black see-through (alpha by brightness), at the cell's scale, under the cell's own vignette. Runs after s9_fx.py."""
    fr = frames_of(os.path.join(src_dir, "gif2662/IMG56.gif"))
    idx = json.load(open(os.path.join(out_dir, "index.json"), encoding="utf-8"))
    e = idx["cl_ult9"]
    cw, ch = e["cell"]
    n = e["n"]
    sheet = Image.open(os.path.join(out_dir, "cl_ult9.png")).convert("RGBA")
    cells = [sheet.crop((i * cw, 0, (i + 1) * cw, ch)) for i in range(n)]
    bx0, by0, bx1, by1 = 4, 4, 808, 632
    H, W = fr[0].shape[:2]
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    ocx, ocy = 408, 354
    dx, dy = xx - ocx, yy - ocy
    rr, ang = np.hypot(dx, dy), np.arctan2(dy, dx)
    ring = (rr >= 50) & (rr <= 106)
    vr = np.sqrt(((xx - (bx0 + bx1) / 2) / ((bx1 - bx0) / 2)) ** 2 + ((yy - (by0 + by1) / 2) / ((by1 - by0) / 2 * 0.99)) ** 2)
    vig = np.clip((1 - vr) / 0.12, 0, 1)
    for ci in range(n):
        f = 8 + 3 * ci
        a = fr[f].astype(np.float32)
        r, g, b = a[..., 0], a[..., 1], a[..., 2]
        mn, mx = a.min(2), a.max(2)
        digit = (b > 150) & (b - r > 70) & (b - g > 40)
        star = (r > 170) & (r - g > 80) & (b < 120)  # (the hit stars' orange rim: not the orb's cream gold)
        bar = ((g > r + 50) & (g > b + 50)) | ((b > 180) & (r < 110) & (b - g > 60))
        armour = (r - g > 70) & (r - b > 80) & (r > 90)
        bad = ndimage.binary_dilation(digit | star | bar, iterations=4) | ndimage.binary_dilation(armour, iterations=2)
        # (each number written right of its hit star: the box over it)
        lab, _ = ndimage.label(ndimage.binary_dilation(star, iterations=2))
        for sl in ndimage.find_objects(lab):
            if (sl[0].stop - sl[0].start) * (sl[1].stop - sl[1].start) >= 30:
                bad[max(0, sl[0].start - 8):sl[0].stop + 12, max(0, sl[1].start - 8):sl[1].stop + 80] = True
        layer = np.zeros((H, W, 4), np.float32)
        # the orb: is it there (its pale ring bright enough round its clean part)?
        orbpx = ring & ~bad & (mn > 120) & (r >= b - 40)
        if orbpx.sum() > 600:
            src = a.copy()
            ok = ring & ~bad
            todo = ring & bad
            for deg in (30, -30, 60, -60, 90, -90, 120, -120, 150, -150, 180):
                if not todo.any():
                    break
                t = ang + np.radians(deg)
                sx = np.rint(ocx + rr * np.cos(t)).astype(int).clip(0, W - 1)
                sy = np.rint(ocy + rr * np.sin(t)).astype(int).clip(0, H - 1)
                take = todo & ok[sy, sx]
                src[take] = a[sy[take], sx[take]]
                todo &= ~take
            al = np.clip((src.max(2) - 14) / 30, 0, 1) * (ring & ~todo)
            al *= np.clip((rr - 50) / 12, 0, 1) * np.clip((106 - rr) / 6, 0, 1)
            layer[..., :3] = src
            layer[..., 3] = al
        # the lightning
        cyan = (g > 150) & (b > 160) & (r < g - 30) & (np.abs(b - g) < 60)
        lab, nl = ndimage.label(ndimage.binary_dilation(cyan, iterations=1))
        if nl:
            sz = ndimage.sum(np.ones_like(lab), lab, range(1, nl + 1))
            keep = (lab > 0) & np.isin(lab, 1 + np.nonzero(sz >= 40)[0])
            # (a stroke crossing a column of numbers: not dropped whole — the middle went bare so — but faded out over
            # 8 px as it comes near a digit, a star or a bar, like a stroke's own end)
            near = np.clip((ndimage.distance_transform_edt(~bad) - 2) / 8, 0, 1)
            # (its glow: the dark blue round each stroke, as far as 3 px)
            glow = ndimage.binary_dilation(keep, iterations=3)
            alc = np.where(keep, np.clip((np.minimum(g, b) - 60) / 80, 0, 1), np.where(glow, np.clip((b - 30) / 120, 0, 1) * 0.8, 0)) * near
            put = alc > layer[..., 3]
            layer[put, :3] = a[put]
            layer[..., 3] = np.maximum(layer[..., 3], alc)
        layer[..., 3] *= vig
        L = Image.fromarray(np.dstack([layer[..., :3], layer[..., 3:] * 255]).astype(np.uint8)).crop((bx0, by0, bx1, by1)).resize((cw, ch), Image.LANCZOS)
        cells[ci] = Image.alpha_composite(cells[ci], L)
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


JS_TJ = (283, 300, 66)  # the 태극's round: middle and radius (frames 1-17's camera)
JS_INNER = (176, 190, 386, 404)  # the seal's plain middle inside its band of glyphs (frames 1-17's camera)


def js_caster(a):
    """where the caster (its body, wings, dark streaks, bar, flag) lies over the seal in a frame (frames 1-17's camera): in
    the seal's plain middle, what is not the seal's own colour — its gold, olive, cream and their outlines (red over green
    over blue, not dark); above it, in the band of glyphs, the caster's old round and its flag's box"""
    H, W = a.shape[:2]
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx = a.max(2)
    seal = (r >= g - 6) & (g >= 0.42 * r) & (b < g - 10) & (r - b > 45) & (mx > 95) & ((b < 0.85 * g) | (g > 0.9 * r))
    x0, y0, x1, y1 = JS_INNER
    inner = (xx >= x0) & (xx < x1) & (yy >= y0) & (yy < y1) & (np.hypot((xx - 275) / 150, (yy - 225) / 150) < 1)
    m = ~seal & inner
    m |= (((xx - 262) / 92) ** 2 + ((yy - 236) / 106) ** 2 <= 1) & (yy < y0)
    m |= (xx >= 258) & (xx < 304) & (yy >= 136) & (yy < 192)
    for bx, by in _js_bars(a):
        m[max(0, by - 2):by + 9, max(0, bx - 2):bx + 49] = True
    return ndimage.binary_dilation(m, iterations=2)


def js_seals(fr, frames, polemask):
    """the seal of each of `frames` (1-17), as rgba over the whole capture (frames 1-17's camera). Unmixed against frame 2
    (no seal; where the caster stands in it too, against the floor's mean colour). Where the caster lies over it in that
    frame: the same pixel of the frame nearest in time where it does not (frames 5-17, then 21-135 — the camera 48 px to
    the right there), its brightness and opacity scaled by the two frames' seal round it (the seal pulses gold and red) — the
    태극 and the plain middle are the seal's own, unmoved; what the caster covers in every frame (the middle of its body):
    the seal's own pixels half a turn (or a quarter turn) round its middle, else clear, ending softly — our hero stands
    there. Where a 장승 stands over it, left clear (the 장승 are drawn over it)."""
    bg = fr[2].astype(np.float32)
    H, W = bg.shape[:2]
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    cx, cy = JS_C[0] - JS_CAM, JS_C[1]
    # (the caster in the clean frame 2: unmixing against it would read the caster's colours as the seal's)
    mx2, mn2 = bg.max(2), bg.min(2)
    c2 = ndimage.binary_dilation(((mx2 - mn2 > 55) | (mx2 < 60) | (mn2 > 190)) & (np.hypot((xx - 275) / 160, (yy - 225) / 170) < 1), iterations=3)
    floor = bg[(np.hypot(xx - cx, yy - cy) < 220) & ~c2].mean(0)
    sq = np.clip((np.minimum(np.minimum(xx - 128, 434 - xx), np.minimum(yy - 142, 452 - yy))) / 8, 0, 1)
    pool = list(range(5, 18)) + list(range(21, 136, 2))
    got = {}
    for f in pool:
        a = fr[f].astype(np.float32)
        if f >= 21:
            a = np.roll(a, -JS_CAM, axis=1)
        # (k 80: the seal as solid gold over our darker ground as over the original's grey — at 110 it read orange and pale)
        F, al = _js_unmix(a, bg, 80, 18)
        F2, al2 = _js_unmix(a, np.broadcast_to(floor, a.shape), 80, 18)
        al2 = np.where(al2 < 0.3, 0, al2)  # (the floor's own grain read as a faint seal: not taken)
        F[c2], al[c2] = F2[c2], al2[c2]
        hole = js_caster(a)
        # (the ground's own grey specks round the 태극 — the seal has no grey but in the 태극's white)
        grey = (a.max(2) - a.min(2) < 40) & (np.hypot(xx - cx, yy - cy) > 120) & (al > 0.2)
        hole |= ndimage.binary_dilation(grey, iterations=2)
        got[f] = (F, al * sq, hole)
    ring = (np.hypot(xx - cx, yy - cy) > 40) & (np.hypot(xx - cx, yy - cy) < 150)
    out = []
    for f in frames:
        F, al, hole = got[f]
        oF, oal, todo = F.copy(), al.copy(), hole.copy()
        # (the seal rising, 5-7: its 태극 a plain disk not yet drawn — the held seal's is another light; turned and mended below)
        for g in sorted((g for g in pool if g != f and f > 7 and g > 7), key=lambda g: (g >= 21, abs(g - f))):
            if not todo.any():
                break
            Fg, alg, hg = got[g]
            ok = todo & ~hg
            if not ok.any():
                continue
            both = ring & ~hole & ~hg & (al > 0.3) & (alg > 0.3)
            # (one brightness for all three channels: a per-channel ratio from the gold round it turned the 태극's white pink)
            kF = float(np.clip(F[both].mean() / max(Fg[both].mean(), 1), 0.8, 1.25)) if both.sum() > 200 else 1.0
            kA = al[both].mean() / max(alg[both].mean(), 1e-3) if both.sum() > 200 else 1.0
            oF[ok] = np.clip(Fg[ok] * kF, 0, 255)
            oal[ok] = np.clip(alg[ok] * kA, 0, 1)
            todo &= ~ok
        dx, dy = xx - cx, yy - cy
        src_F, src_al, bad = oF.copy(), oal.copy(), todo.copy()
        # (half a turn first — the 태극 and the square both; then the square's own mirror and quarter turns)
        for kind, ang in (("rot", 180), ("mir", 0), ("rot", 90), ("rot", -90)):
            if not todo.any():
                break
            if kind == "mir":
                sx, sy = np.rint(2 * cx - xx).astype(int).clip(0, W - 1), yy.astype(int)
            else:
                c, s_ = np.cos(np.radians(ang)), np.sin(np.radians(ang))
                sx = np.rint(cx + dx * c - dy * s_).astype(int).clip(0, W - 1)
                sy = np.rint(cy + dx * s_ + dy * c).astype(int).clip(0, H - 1)
            ok = todo & ~bad[sy, sx] & ~polemask[sy, sx]
            oF[ok], oal[ok] = src_F[sy[ok], sx[ok]], src_al[sy[ok], sx[ok]]
            todo &= ~ok
        # (inside the 태극's round, what nothing gives — the middle of the caster's body — from the nearest dot of the 태극 round
        # it, colour and opacity: a broken dot filled with the same colour beside it)
        tj = todo & (np.hypot(xx - JS_TJ[0], yy - JS_TJ[1]) < JS_TJ[2])
        if tj.any():
            _, (iy, ix) = ndimage.distance_transform_edt(todo, return_indices=True)
            oF[tj], oal[tj] = oF[iy[tj], ix[tj]], oal[iy[tj], ix[tj]]
            todo &= ~tj
        oal[todo] = 0
        # (what nothing gives ends softly, round — no ragged rim)
        soft = ndimage.binary_closing(ndimage.binary_opening(todo, iterations=3), iterations=3)
        oal *= np.clip(ndimage.distance_transform_edt(~(soft | todo)) / 6, 0, 1)
        out.append(np.dstack([np.where(oal[..., None] > 0, oF, 0), oal * 255]).astype(np.uint8))
    return out


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
    for sl in js_seals(fr, range(5, 18), polemask):
        cell = Image.new("RGBA", (cw, ch))
        put(cell, sl[0:540, 160 - JS_CAM:500 - JS_CAM], 160, 0)
        seals.append(cell)
    base = {"cell": [cw, ch], "ms": 100, "add": False, "anchor": [ox, oy], "src": "gif2662/IMG75.gif", "k": 0.62, "cap": 420}
    return {"dk_jangseal": (seals, {**base, "n": len(seals)}), "dk_jangpole": ([poles], {**base, "n": 1})}



def yeonok(src_dir):
    """연옥'만월 (흑화랑 9차, 2662 IMG98): the red moon of the sword dance over the 5×5 round the caster. In the capture its
    upper half and the four dummies' columns lie under stacks of damage numbers, hit stars and bars in every frame (some
    60% of it), the caster's own numbers in its middle. Cut whole with a turn-fill it came out as shards. So two layers:
      the moon itself (its red disc, the swirling seal, its dark rim) stands still while the crescents of the slashes move
      over it: each pixel the median, over the held frames 22-31, of the frames where that place was clear (unmix over the
      clean frame 0) — the crescents, in few frames at a place, drop out of it; what no frame shows clear is taken from the
      same place mirrored top↔bottom (the seal is drawn so), then left↔right, then from the nearest clear turn round the
      middle at the same radius;
      each frame then its own pixels wherever they are clear (the crescents, the moon as it was), the still moon under
      the numbers, blended over 3 px. Its own round edge; its middle (where our hero stands) let fade.
    Frames 22-30, held (looped by the game; it fades in and out)."""
    fr = frames_of(os.path.join(src_dir, "gif2662/IMG98.gif"))
    bg = fr[0].astype(np.float32)
    CX, CY, R0, R1, E0, E1, K, LO = 282, 270, 138, 162, 26, 46, 80.0, 14
    H, W = bg.shape[:2]
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    rr = np.hypot(xx - CX, yy - CY)

    def unmix(f):
        a = fr[f].astype(np.float32)
        D = a - bg
        m = np.abs(D).max(2)
        al = np.clip((m - LO) / (K - LO), 0, 1)
        F = np.clip(bg + D / np.maximum(al, 1e-3)[..., None], 0, 255)
        r, g, b, mn, mx = a[..., 0], a[..., 1], a[..., 2], a.min(2), a.max(2)
        bad = ((b > 150) & (b - r > 80) & (r < 140))  # the digits' blue
        bad |= (r > 190) & (g > 95) & (g < 225) & (b < 160) & (r - b > 70)  # the hit stars' orange rims, the markers
        bad |= (g > r + 45) & (g > b + 25)  # life bars' green
        bad |= (b > 120) & (r < 80) & (g < 110) & (b - g > 50)  # the blue bar, the digits' dark blue
        bad |= (np.abs(r - g) < 28) & (g >= b - 4) & (r > 55) & (r < 215) & (r - b < 75) & (rr < 150)  # the dummies' wood
        bad |= (m < 16) & (rr < 135)  # what stands unchanged over the solid moon (the stakes, their dark lines)
        bad = ndimage.binary_dilation(bad, iterations=3)
        # (the stars' white hearts and the digits' white faces: white only next to what was found)
        bad |= (mn > 175) & ndimage.binary_dilation(bad, iterations=12)
        bad = ndimage.binary_dilation(bad, iterations=1)
        bad |= ((xx - 282) / 68) ** 2 + ((yy - 228) / 44) ** 2 <= 1  # (the caster's own numbers over its middle: 12만3천, 119만4천)
        return al, F, bad

    PL = list(range(22, 32))
    U = {f: unmix(f) for f in [21] + PL}
    import warnings
    ok = np.stack([~U[f][2] for f in PL])
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        bal = np.nanmedian(np.where(ok, np.stack([U[f][0] for f in PL]), np.nan), axis=0)
        bF = np.nanmedian(np.where(ok[..., None], np.stack([U[f][1] for f in PL]), np.nan), axis=0)
    hole = ok.sum(0) < 2
    filled = hole.copy()
    bal, bF = np.nan_to_num(bal), np.nan_to_num(bF)
    # what no frame shows clear: mirrored about the middle, then the nearest clear turn at the same radius
    for mx_, my_ in ((False, True), (True, False), (True, True)):
        sx = np.rint(2 * CX - xx if mx_ else xx).astype(int).clip(0, W - 1)
        sy = np.rint(2 * CY - yy if my_ else yy).astype(int).clip(0, H - 1)
        o = hole & ~hole[sy, sx]
        bal[o], bF[o] = bal[sy[o], sx[o]], bF[sy[o], sx[o]]
        hole &= ~o
    ang = np.arctan2(yy - CY, xx - CX)
    for deg in (10, -10, 20, -20, 35, -35, 50, -50, 70, -70, 90, -90, 120, -120, 150, -150, 180):
        if not hole.any():
            break
        t = ang + np.radians(deg)
        sx = np.rint(CX + rr * np.cos(t)).astype(int).clip(0, W - 1)
        sy = np.rint(CY + rr * np.sin(t)).astype(int).clip(0, H - 1)
        o = hole & ~hole[sy, sx]
        bal[o], bF[o] = bal[sy[o], sx[o]], bF[sy[o], sx[o]]
        hole &= ~o
    bal[hole] = 0
    # (the seams where a mirrored or turned piece meets the moon round it: blended over a few px on both sides)
    seam = ndimage.binary_dilation(filled, iterations=3) & ~ndimage.binary_erosion(filled, iterations=3)
    sm_a = ndimage.gaussian_filter(bal, 1.6)
    sm_F = np.stack([ndimage.gaussian_filter(bF[..., c] * bal, 1.6) for c in range(3)], -1) / np.maximum(sm_a, 1e-3)[..., None]
    bal = np.where(seam, sm_a, bal)
    bF = np.where(seam[..., None], sm_F, bF)
    edge = np.clip((R1 - rr) / (R1 - R0), 0, 1) * np.clip((rr - E0) / (E1 - E0), 0, 1)
    half = int(R1) + 2
    cells = []
    for f in PL[:-1]:
        al, F, bad = U[f]
        # each frame's own pixels only where they are not the still moon — its crescents, its lightning, where clear —
        # over the still moon everywhere else (no seam round the numbers' places), blended over 3 px at their edge
        mv = (np.abs(F * al[..., None] - bF * bal[..., None]).max(2) > 45) | (np.abs(al - bal) > 0.35)
        mv = ndimage.binary_dilation(ndimage.binary_opening(mv & ~bad, iterations=1), iterations=2) & ~bad
        w = np.clip(ndimage.distance_transform_edt(mv) / 3.0, 0, 1)
        if f == 21:
            w = np.clip(ndimage.distance_transform_edt(~bad) / 3.0, 0, 1)
            # (the moon rising, see-through: the still moon under its numbers at its own strength there)
            s = np.median(al[~bad & (rr < 120)]) / max(1e-3, np.median(bal[~bad & (rr < 120)]))
            A, C = w * al + (1 - w) * bal * min(1.0, s), w[..., None] * F + (1 - w[..., None]) * bF
        else:
            A, C = w * al + (1 - w) * bal, w[..., None] * F + (1 - w[..., None]) * bF
        A = A * edge
        C[A <= 0] = 0
        cell = np.dstack([C, A * 255]).clip(0, 255).astype(np.uint8)[CY - half:CY + half, CX - half:CX + half]
        cells.append(Image.fromarray(cell))
    return cells, {"cell": [2 * half, 2 * half], "n": len(cells), "ms": 90, "add": False, "anchor": [half, half],
                   "src": "gif2662/IMG98.gif", "k": 0.62}


def heukgwang(src_dir):
    """흑룡광참 (전사 8차; 사용자 결정 2026-11-23): 1320 #18, the dark red whirl (2662's 흑룡참파 ring — see s9_fx.json
    w_heukryong.why), in place of 연's grey one. Unmixed off its white ground (254: O = a·F + (1−a)·254, a from the darkest
    channel), cut to the box all its frames draw. Two sheets:
      w_heukgwang — its eight frames played backwards (사용자: 작은 회오리에서 큰 회오리로), while it runs ahead;
      w_heukgwangloop — the whole whirl (its frames 0-3, as played backwards), turning on the spot where it caught a foe.
    Pivot: the box's middle (drawn by fxTiles to the 3 tiles it strikes)."""
    im = Image.open(os.path.join(src_dir, "dl1320/18.gif"))
    cells = []
    for i in range(im.n_frames):
        im.seek(i)
        a = np.asarray(im.convert("RGB")).astype(np.float32)
        al = np.clip((254 - a.min(2)) / 254 * 1.2, 0, 1)
        al[al < 0.05] = 0
        F = np.where(al[..., None] > 0, (a - 254 * (1 - al[..., None])) / np.maximum(al[..., None], 1e-3), 0)
        cells.append(np.dstack([np.clip(F, 0, 255), al * 255]).astype(np.uint8))
    on = np.zeros(cells[0].shape[:2], bool)
    for c in cells:
        on |= c[..., 3] > 20
    ys, xs = np.nonzero(on)
    y0, y1, x0, x1 = int(ys.min()), int(ys.max()) + 1, int(xs.min()), int(xs.max()) + 1
    pics = [Image.fromarray(c[y0:y1, x0:x1]) for c in cells]
    w, h = x1 - x0, y1 - y0
    base = {"cell": [w, h], "add": False, "anchor": [w // 2, h // 2], "src": "dl1320/18.gif"}
    run = pics[::-1]
    loop = [pics[i] for i in (3, 2, 1, 0)]
    return {"w_heukgwang": (run, dict(base, n=len(run), ms=150)), "w_heukgwangloop": (loop, dict(base, n=len(loop), ms=90))}


def white_sheet(src_dir, path):
    """a 1320 sprite (official effect frames on a white ground, 254) unmixed off it and cut to the box all its frames draw"""
    im = Image.open(os.path.join(src_dir, path))
    cells = []
    for i in range(im.n_frames):
        im.seek(i)
        a = np.asarray(im.convert("RGB")).astype(np.float32)
        al = np.clip((254 - a.min(2)) / 254 * 1.2, 0, 1)
        al[al < 0.05] = 0
        F = np.where(al[..., None] > 0, (a - 254 * (1 - al[..., None])) / np.maximum(al[..., None], 1e-3), 0)
        cells.append(np.dstack([np.clip(F, 0, 255), al * 255]).astype(np.uint8))
    on = np.zeros(cells[0].shape[:2], bool)
    for c in cells:
        on |= c[..., 3] > 20
    ys, xs = np.nonzero(on)
    y0, y1, x0, x1 = int(ys.min()), int(ys.max()) + 1, int(xs.min()), int(xs.max()) + 1
    return [Image.fromarray(c[y0:y1, x0:x1]) for c in cells], x1 - x0, y1 - y0


def chohonbind(src_dir):
    """초혼진무 (전사 6차; 사용자 2026-11-23: 몬스터를 묶는 기술인데 영웅 둘레에 크게 떴다): 1320 #20, teal chains coiling round a
    body and fading — laid on each foe it binds, as large as that body (game.js nova def.bind). Its frames 1-18: the first, a
    wider burst of the coil, made every foe of a crowd one teal mass the moment it struck."""
    pics, w, h = white_sheet(src_dir, "dl1320/20.gif")
    pics = pics[1:]
    return pics, {"cell": [w, h], "n": len(pics), "ms": 70, "add": False, "anchor": [w // 2, h // 2], "src": "dl1320/20.gif"}


def heukaura(src_dir):
    """흑룡검풍 (전사 9차 패시브; 사용자 결정 2026-11-23): 연's own grey whirl of 흑룡광참 (Skill_Effect_Warrior_5th_03, as the
    earlier APK holds it: SRC_DIR/yeon/k_w_blackdragon.webp + .json, its manifest entry) made 흑적색 — its brightness laid on
    black → dark blood red → red, its opacity as it was — and worn round the hero as an aura (사용자: 옆에서 도는 것이 아니라
    캐릭터의 오라처럼). Its middle frames 5-17, where the whirl is whole, loop. Pivot: the cell's middle."""
    m = json.load(open(os.path.join(src_dir, "yeon/k_w_blackdragon.json"), encoding="utf-8"))
    sh = Image.open(os.path.join(src_dir, "yeon/k_w_blackdragon.webp")).convert("RGBA")
    c1, c2, c3 = np.array([8, 0, 2.]), np.array([62, 2, 6.]), np.array([140, 14, 18.])
    pics = []
    for i in range(5, 18):
        x, y, w, h = m["at"][i * 4:i * 4 + 4]
        bx, by = m["bb"][i * 4:i * 4 + 2]
        t = Image.new("RGBA", (m["w"], m["h"]))
        t.alpha_composite(sh.crop((x, y, x + w, y + h)), (int(bx), int(by)))
        a = np.asarray(t).astype(np.float32)
        L = a[..., :3].mean(2) / 255
        t2 = np.clip((L - 0.25) / 0.35, 0, 1)[..., None]
        t3 = np.clip((L - 0.6) / 0.4, 0, 1)[..., None]
        col = c1 + (c2 - c1) * t2
        col = col + (c3 - col) * t3
        pics.append(Image.fromarray(np.dstack([col, a[..., 3]]).astype(np.uint8)))
    return pics, {"cell": [m["w"], m["h"]], "n": len(pics), "ms": 70, "add": False, "anchor": [m["w"] // 2, m["h"] // 2],
                  "src": "yeon/k_w_blackdragon.webp"}


BUILDERS = {"w_heukgwang": heukgwang, "w_chohonbind": chohonbind, "w_heukaura": heukaura, "m_seori": seori,"a_hwasalbi": hwasalbi, "a_igibolt": igibolt, "mk_yeonok": yeonok, "dk_jang": dk_jang}  # (dk_jang: two sheets, dk_jangseal and dk_jangpole)
POST = {"a_ult9": ult9rain, "cl_ult9": clult9orb, "cl_haeil": haeil9, "a_cheongung": cheongung9, "md_ult9": mdult9edge}  # (re-drawing an s9_fx.py sheet: run after it)


def main():
    src_dir, out_dir = sys.argv[1], sys.argv[2]
    # (with no ids: every builder, then every post-pass whose s9_fx.py sheet is in the index and not yet re-drawn — a
    # post-pass marks the entry "post"; s9_fx.py writes it afresh, without the mark, when it rebuilds that sheet. So a
    # second run never lays the rain, the orb or a fade over twice)
    only = sys.argv[3].split(",") if len(sys.argv) > 3 else list(BUILDERS) + list(POST)
    os.makedirs(out_dir, exist_ok=True)
    ipath = os.path.join(out_dir, "index.json")
    index = json.load(open(ipath, encoding="utf-8")) if os.path.isfile(ipath) else {}
    for sid in only:
        if sid in POST:
            if sid not in index or index[sid].get("post"):
                print(sid, "(post-pass: %s)" % ("already done" if sid in index else "no sheet"))
                continue
            json.dump(index, open(ipath, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        got = POST[sid](src_dir, out_dir) if sid in POST else BUILDERS[sid](src_dir)
        for sid2, (cells, entry) in (got.items() if isinstance(got, dict) else [(sid, got)]):
            if sid in POST:
                entry["post"] = 1
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
