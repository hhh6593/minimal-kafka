#!/usr/bin/env python3
"""Notes the drawn box of every frame of the build's effect sheets, for the game to draw just that.

    fx_trim.py ASSETS_DIR

An effect's frames are cells of one size, and most of a cell is empty: a burst's first and last
frames are a spark in the middle of a wide square, a slash a thin band. Drawing the empty part
costs as much as the rest (every pixel of a cell is blended), and with forty effects up in a
crowded fight that was a good part of a slow phone's frame. Each sheet's entry in manifest.json
gets "bb": per cell, the box [x, y, w, h] of its pixels that show (alpha 3 and up; w 0 for an
empty cell), when the boxes leave out a tenth of the sheet or more. game.js drawFx draws that box.
Run after webp_fx.py (it reads the sheets as the game loads them).
"""
import json
import os
import sys

from PIL import Image

ALPHA_MIN = 3  # alpha 1-2 of 255 shows nothing (a lossy sheet's faint noise round its glow)


def main():
    assets = sys.argv[1]
    man_path = os.path.join(assets, 'manifest.json')
    man = json.load(open(man_path, encoding='utf-8'))
    webp = set(man.get('fxWebp') or [])
    fx = man.get('fx') or {}
    kept = total = 0
    sheets = 0
    for fid, f in fx.items():
        if f.get('src') or not f.get('w') or not f.get('h'):
            continue
        path = os.path.join(assets, 'fx', fid + ('.webp' if fid in webp else '.png'))
        if not os.path.exists(path):
            continue
        with Image.open(path) as im:
            alpha = im.convert('RGBA').getchannel('A').point(lambda a: 255 if a >= ALPHA_MIN else 0)
        w, h = f['w'], f['h']
        cols = min(f.get('cols') or 10 ** 9, alpha.width // w)
        rows = alpha.height // h
        if cols <= 0 or rows <= 0:
            continue
        bb, area = [], 0
        for r in range(rows):
            for c in range(cols):
                box = alpha.crop((c * w, r * h, c * w + w, r * h + h)).getbbox()
                if box:
                    x0, y0, x1, y1 = box
                    bb += [x0, y0, x1 - x0, y1 - y0]
                    area += (x1 - x0) * (y1 - y0)
                else:
                    bb += [0, 0, 0, 0]
        full = w * h * rows * cols
        total += full
        if area <= full * 0.9:
            f['bb'] = bb
            kept += full - area
            sheets += 1
        else:
            f.pop('bb', None)
            kept += 0
    tmp = man_path + '.tmp'
    json.dump(man, open(tmp, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    os.replace(tmp, man_path)
    print(f'fx trim: {sheets} sheets, {100 * kept / max(1, total):.0f}% of the effect pixels left undrawn')


if __name__ == '__main__':
    main()
