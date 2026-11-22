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


BUILDERS = {"m_seori": seori, "a_hwasalbi": hwasalbi, "mk_yeonok": yeonok}
POST = {"a_ult9": ult9rain}  # (re-drawing an s9_fx.py sheet: run after it)


def main():
    src_dir, out_dir = sys.argv[1], sys.argv[2]
    only = sys.argv[3].split(",") if len(sys.argv) > 3 else list(BUILDERS)
    os.makedirs(out_dir, exist_ok=True)
    ipath = os.path.join(out_dir, "index.json")
    index = json.load(open(ipath, encoding="utf-8")) if os.path.isfile(ipath) else {}
    for sid in only:
        cells, entry = POST[sid](src_dir, out_dir) if sid in POST else BUILDERS[sid](src_dir)
        cw, ch = entry["cell"]
        sheet = Image.new("RGBA", (cw * len(cells), ch))
        for i, c in enumerate(cells):
            sheet.paste(c, (i * cw, 0))
        sheet.save(os.path.join(out_dir, sid + ".png"), optimize=True)
        index[sid] = entry
        print(sid, cw, ch, len(cells))
    json.dump(index, open(ipath, "w", encoding="utf-8"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
