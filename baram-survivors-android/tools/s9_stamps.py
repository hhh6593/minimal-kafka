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
            al = np.clip((d[y0:y1, x0:x1] - 14) / 90, 0, 1) * reg
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
    for j in range(3):
        cols = 5 if j % 2 == 0 else 4
        for i in range(cols):
            x = ox - hx + 14 + (i + (0.5 if cols == 4 else 0)) * (2 * hx - 28) / 4
            spots.append((x, oy - hy + 16 + j * (2 * hy - 32) / 2))
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
            if loc < 2:
                # the streak falling onto its spot (its foot 40, then 12 px above it)
                img, bx, by = sk[1], sk[2], sk[3]
                fy = y - (40 if loc == 0 else 12)
                cells[t].alpha_composite(img, (int(round(x - bx)), int(round(fy - by))))
            if 2 <= loc <= 5:
                img, bx, by = pf[1], pf[2], pf[3]
                arr = np.asarray(img).astype(np.float32).copy()
                arr[..., 3] *= {2: 1.0, 3: 1.0, 4: 0.65, 5: 0.3}[loc]
                cells[t].alpha_composite(Image.fromarray(arr.astype(np.uint8)), (int(round(x - bx)), int(round(y + 6 - by))))
                if loc == 2:
                    # (the streak still standing in the dust as it lands)
                    img, bx, by = sk[1], sk[2], sk[3]
                    cells[t].alpha_composite(img, (int(round(x - bx)), int(round(y - by))))
    return cells, {"cell": [cw, ch], "n": N, "ms": 80, "add": False, "cap": 420, "anchor": [ox, oy], "src": "gif2662/IMG44.gif", "k": 0.62}


BUILDERS = {"m_seori": seori, "a_hwasalbi": hwasalbi}


def main():
    src_dir, out_dir = sys.argv[1], sys.argv[2]
    only = sys.argv[3].split(",") if len(sys.argv) > 3 else list(BUILDERS)
    os.makedirs(out_dir, exist_ok=True)
    ipath = os.path.join(out_dir, "index.json")
    index = json.load(open(ipath, encoding="utf-8")) if os.path.isfile(ipath) else {}
    for sid in only:
        cells, entry = BUILDERS[sid](src_dir)
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
