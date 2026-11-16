#!/usr/bin/env python3
"""The 사신수 길드대항전's battlefields, from 바람의나라 연's own maps (decrypted Maps_* bundles):
연's 사신수 공성전 castles (kow_zodiac_*_siege) and the 길림 쟁탈 field (kow_jilin_pk_castle).

    yeon_war.py DEC_DIR OUT_DIR [--preview]

DEC_DIR holds the decrypted Maps_*.unity3d. Writes OUT_DIR/ywar/<war>_<cx>_<cy>.png (1024-pixel
chunks of the crop, every tile layer, at the map's own scale: one 연 tile is 32 pixels, as the
town is drawn) and OUT_DIR/ywar/index.json:

    {"<war>": {"w", "h", "chunk": 1024, "cols", "rows", "walk": ["..#.", ...], "map", "crop"}}

walk is the map's own movables on the game's 48-pixel tiles (a tile is open when 연's 32-pixel
tile under its middle is). With --preview also OUT_DIR/ywar_preview/<war>.png: the crop at a
third, with the 48-pixel grid every 5 tiles, for placing the objectives.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import yeon_maps  # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402

T, G, CH = 32, 48, 1024
# war id -> bundle, map, crop in 연 tiles (x0, y0, x1, y1)
WARS = {
    'cheong': ('Maps_1311.unity3d', 'kow_jilin_pk_castle', (40, 30, 140, 96)),
    'baekho': ('Maps_5200.unity3d', 'kow_zodiac_whitetiger_siege_00_00_castle', (26, 28, 138, 76)),
    'jujak': ('Maps_5100.unity3d', 'kow_zodiac_redbird_siege_00_00_castle', (58, 24, 104, 142)),
    'hyeonmu': ('Maps_5200.unity3d', 'kow_zodiac_whitetiger_siege_00_00_castle', (42, 76, 120, 142)),
}


def main():
    dec, out = sys.argv[1], sys.argv[2]
    preview = '--preview' in sys.argv
    d = os.path.join(out, 'ywar')
    os.makedirs(d, exist_ok=True)
    index = {}
    full_cache = {}
    for war, (bundle, name, (x0, y0, x1, y1)) in WARS.items():
        b = os.path.join(dec, bundle)
        data, _ = yeon_maps.load_map(b, name)
        W = data['width']
        if (b, name) not in full_cache:
            full_cache[(b, name)] = yeon_maps.render(b, name)
        full = full_cache[(b, name)]
        crop = full.crop((x0 * T, y0 * T, x1 * T, y1 * T))
        img = Image.new('RGBA', crop.size, (0, 0, 0, 255))
        img.alpha_composite(crop)
        img = img.convert('RGB')
        w, h = img.size
        for cy in range(0, -(-h // CH)):
            for cx in range(0, -(-w // CH)):
                img.crop((cx * CH, cy * CH, min(w, (cx + 1) * CH), min(h, (cy + 1) * CH))).save(
                    os.path.join(d, f'{war}_{cx}_{cy}.png'), optimize=True)
        mv = data['movables']
        cols, rows = w // G, h // G
        walk = []
        for gy in range(rows):
            row = ''
            for gx in range(cols):
                mx, my = x0 + (gx * G + G // 2) // T, y0 + (gy * G + G // 2) // T
                row += '.' if mv[my * W + mx] else '#'
            walk.append(row)
        index[war] = {'w': w, 'h': h, 'chunk': CH, 'cols': cols, 'rows': rows, 'walk': walk, 'map': name, 'crop': [x0, y0, x1, y1]}
        print(war, name, (w, h), (cols, rows))
        if preview:
            pd = os.path.join(out, 'ywar_preview')
            os.makedirs(pd, exist_ok=True)
            p = img.resize((w // 3, h // 3)).convert('RGBA')
            ov = Image.new('RGBA', p.size)
            dr = ImageDraw.Draw(ov)
            for gy in range(rows):
                for gx in range(cols):
                    if walk[gy][gx] == '#':
                        dr.rectangle((gx * 16, gy * 16, gx * 16 + 15, gy * 16 + 15), fill=(255, 0, 0, 70))
            for gx in range(0, cols, 5):
                dr.line((gx * 16, 0, gx * 16, p.height), fill=(255, 255, 0, 120))
                dr.text((gx * 16 + 2, 2), str(gx), fill=(255, 255, 0, 255))
            for gy in range(0, rows, 5):
                dr.line((0, gy * 16, p.width, gy * 16), fill=(255, 255, 0, 120))
                dr.text((2, gy * 16 + 2), str(gy), fill=(255, 255, 0, 255))
            p.alpha_composite(ov)
            p.save(os.path.join(pd, war + '.png'))
    with open(os.path.join(d, 'index.json'), 'w', encoding='utf-8') as f:
        json.dump(index, f, ensure_ascii=False, separators=(',', ':'))


if __name__ == '__main__':
    main()
