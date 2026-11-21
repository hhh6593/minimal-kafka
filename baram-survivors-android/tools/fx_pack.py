#!/usr/bin/env python3
"""Packs the build's effect sheets tight, and shrinks the ones never drawn as large as their frames.

    fx_pack.py ASSETS_DIR [DRAWSCALE_JSON]

An effect sheet is a grid of cells of one size, and most of a cell is empty (a burst's first and
last frames are a spark in a wide square, a slash a thin band); a 24-frame strip of 360-pixel cells
was 16 MB decoded, the empty part as costly to hold as the rest. Every sheet the game loads is
decoded whole, and on a phone the WebView's renderer was killed a few seconds into a hunt.

Each frame's part that shows (alpha 3 and up) is cut out and the parts are packed in rows on a
sheet no wider or taller than 4096 (a phone holds no larger picture). manifest.json's entry keeps
its cell size (w, h), scale (k), pivot (ax, ay) and reach as they were, so everything the game
measures on an effect is unchanged, and gets per frame:
  at: [x, y, w, h] of the part on the packed sheet (w 0: an empty frame);
  bb: [x, y, w, h] of the part in the cell, in the cell's own pixels (as tools/fx_trim.py writes).
game.js fxBlit draws `at` of the sheet into `bb` of the cell: the same size and place as before.

DRAWSCALE_JSON (tools/fx_drawscale.json) gives, per sheet, the largest scale the game draws it at
in canvas pixels per cell pixel on a phone (about 620 canvas pixels high, one per game pixel),
measured by playing each class's kit, 필살기 bands, raids and wars (see that file's "how"). A sheet
whose largest use is smaller than its own pixels is stored at FIT times that scale (ds in the
manifest; a little over one sheet pixel a drawn pixel); sheets not in the table keep every pixel.

Run before webp_fx.py (it reads and writes the PNGs; webp_fx.py then converts them), and before
fx_trim.py, which leaves packed sheets alone. Sheets read as WebP (a build already converted) are
written back as WebP.
"""
import json
import math
import os
import sys

from PIL import Image

ALPHA_MIN = 3     # as fx_trim.py: alpha 1-2 of 255 shows nothing
PAD = 2           # clear pixels round each part (a smoothed draw samples a pixel past its edge)
MAX_SIDE = 4096   # a phone's largest picture
FIT = 1.15        # sheet pixels per drawn canvas pixel kept at an effect's largest use
MIN_DS = 0.25     # never shrunk past this
MIN_SAVE = 250_000  # bytes decoded a shrink must save (a small old sheet keeps its pixels)
GAIN = 0.85       # packed only when the sheet comes out at most this part of its old size (or shrunk)
# Drawn by code of their own from the grid (a frame's thirds, a whole cell turned): kept as they are.
NO_PACK = {'k_a_firewall', 'k_rp_gate', 'g_pet_baekho'}


def shelf(boxes, width):
    """Rows of parts (tallest first) on a sheet `width` wide: (positions, height) or None."""
    order = sorted(range(len(boxes)), key=lambda i: (-boxes[i][1], -boxes[i][0]))
    pos = [None] * len(boxes)
    x = y = row = 0
    for i in order:
        w, h = boxes[i]
        if w == 0:
            pos[i] = (0, 0)
            continue
        if x + w + PAD > width:
            x, y, row = 0, y + row, 0
        pos[i] = (x + PAD, y + PAD)
        x += w + PAD
        row = max(row, h + PAD)
    height = y + row + PAD
    return pos, height


def pack(boxes):
    """The packing of the parts with the least area that fits MAX_SIDE: (positions, w, h)."""
    widest = max((w for w, _ in boxes), default=0) + 2 * PAD
    area = sum((w + PAD) * (h + PAD) for w, h in boxes if w)
    best = None
    for f in (0.9, 1.0, 1.1, 1.25, 1.4, 1.6, 2.0, 2.5, 3.0, 4.0):
        width = min(MAX_SIDE, max(widest, int(math.sqrt(area) * f) + PAD))
        pos, height = shelf(boxes, width)
        if height > MAX_SIDE:
            continue
        used = max([p[0] + b[0] for p, b in zip(pos, boxes) if b[0]] or [0]) + PAD
        if best is None or used * height < best[1] * best[2]:
            best = (pos, used, height)
    return best


def main():
    assets = sys.argv[1]
    table = {}
    if len(sys.argv) > 2 and os.path.exists(sys.argv[2]):
        table = json.load(open(sys.argv[2], encoding='utf-8')).get('scale', {})
    man_path = os.path.join(assets, 'manifest.json')
    man = json.load(open(man_path, encoding='utf-8'))
    webp = set(man.get('fxWebp') or [])
    fx = man.get('fx') or {}
    before = after = packed = shrunk = 0
    for fid, f in fx.items():
        if f.get('src') or f.get('at') or not f.get('w') or not f.get('h') or fid in NO_PACK:
            continue
        is_webp = fid in webp
        path = os.path.join(assets, 'fx', fid + ('.webp' if is_webp else '.png'))
        if not os.path.exists(path):
            continue
        with Image.open(path) as im0:
            im = im0.convert('RGBA')
        w, h = f['w'], f['h']
        cols = min(f.get('cols') or 10 ** 9, im.width // w)
        rows = im.height // h
        n = min(f.get('n') or len(f.get('durs') or []) or cols * rows, cols * rows)
        if n <= 0:
            continue
        # How small it may be kept: FIT sheet pixels a drawn pixel at its largest use, measured.
        ds = 1.0
        if fid in table:
            ds = max(MIN_DS, min(1.0, table[fid] * FIT))
            if ds > 0.9 or w * h * n * 4 * (1 - ds * ds) < MIN_SAVE:
                ds = 1.0
        cw, ch = (max(1, round(w * ds)), max(1, round(h * ds))) if ds < 1 else (w, h)
        sx, sy = cw / w, ch / h
        parts, boxes, bbs = [], [], []
        for i in range(n):
            c, r = i % cols, i // cols
            cell = im.crop((c * w, r * h, c * w + w, r * h + h))
            if ds < 1:
                # (premultiplied, so a glow's dark clear pixels do not bleed into its edge)
                cell = cell.convert('RGBa').resize((cw, ch), Image.LANCZOS).convert('RGBA')
            box = cell.getchannel('A').point(lambda a: 255 if a >= ALPHA_MIN else 0).getbbox()
            if not box:
                parts.append(None)
                boxes.append((0, 0))
                bbs.append([0, 0, 0, 0])
                continue
            x0, y0, x1, y1 = box
            parts.append(cell.crop(box))
            boxes.append((x1 - x0, y1 - y0))
            bbs.append([round(x0 / sx, 2), round(y0 / sy, 2), round((x1 - x0) / sx, 2), round((y1 - y0) / sy, 2)])
        res = pack(boxes)
        if not res:
            continue
        pos, aw, ah = res
        old = im.width * im.height
        # (a strip wider than a phone's largest picture is packed whatever it gains: 9차 궁극 cinemas)
        if ds >= 1 and aw * ah > old * GAIN and im.width <= MAX_SIDE and im.height <= MAX_SIDE:
            continue
        sheet = Image.new('RGBA', (max(1, aw), max(1, ah)), (0, 0, 0, 0))
        at = []
        for part, (x, y), (bw, bh) in zip(parts, pos, boxes):
            if part is None:
                at += [0, 0, 0, 0]
                continue
            sheet.paste(part, (x, y))
            at += [x, y, bw, bh]
        tmp = path + '.tmp'
        if is_webp:
            sheet.save(tmp, 'WEBP', quality=90, alpha_quality=90, method=4)
        else:
            sheet.save(tmp, 'PNG')
        os.replace(tmp, path)  # (a new file: never written through a link to another tree's copy)
        f['at'] = at
        f['bb'] = [v for b in bbs for v in b]
        f.pop('cols', None)
        if ds < 1:
            f['ds'] = round(ds, 3)
            shrunk += 1
        else:
            f.pop('ds', None)
        before += old
        after += aw * ah
        packed += 1
    tmp = man_path + '.tmp'
    json.dump(man, open(tmp, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    os.replace(tmp, man_path)
    print(f'fx pack: {packed} sheets ({shrunk} shrunk), {before * 4 / 1e6:.0f} MB -> {after * 4 / 1e6:.0f} MB decoded')


if __name__ == '__main__':
    main()
