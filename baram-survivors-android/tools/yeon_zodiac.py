#!/usr/bin/env python3
"""연's 신수 creatures for the 사신수 지존 장비's 격: the 청룡, 주작 and 현무 as 연 draws them when a
신수 각인 is cast (FXs.unity3d textures zodiac_dragon_fx_ani, zodiac_phoenix_Fx_ani,
zodiac_tortoise_fx_ani: 16 cells each, 4x4, the creature coming out of a white flash into its
colours — the dragon coiled, the phoenix spreading its wings, the tortoise and its snakes).

    python3 tools/yeon_zodiac.py FXS_BUNDLE GEAR_DIR

FXS_BUNDLE: FXs.unity3d from 연's resources, un-XORed (tools/yeon_dexor.py). Each sheet is cut in
play order, doubled (nearest: 연's own pixel art kept sharp), its last cell held a while and then
faded out (the same pixels, only their alpha lowered), so it reads as a 격 that comes and goes.
Writes GEAR_DIR/ygyeok/zodiac_<dragon|phoenix|turtle>.png and their entries in its index.json
(fx g_zodiac_*, pivot at the cell's foot: the creature stands on the struck).
"""
import json
import os
import sys

import UnityPy
from PIL import Image

SHEETS = {'zodiac_dragon_fx_ani': 'dragon', 'zodiac_phoenix_fx_ani': 'phoenix', 'zodiac_tortoise_fx_ani': 'turtle'}
GRID = 4
HOLD = 5   # cells the finished creature is held
FADE = 5   # cells it fades out over
MS = 70


def main():
    bundle, gear = sys.argv[1], sys.argv[2]
    gdir = os.path.join(gear, 'ygyeok')
    os.makedirs(gdir, exist_ok=True)
    ipath = os.path.join(gdir, 'index.json')
    index = json.load(open(ipath, encoding='utf-8')) if os.path.isfile(ipath) else {}
    env = UnityPy.load(bundle)
    for o in env.objects:
        if o.type.name != 'Texture2D':
            continue
        name = (o.peek_name() or '').lower()
        if name not in SHEETS:
            continue
        tex = o.read().image.convert('RGBA')
        cw, ch = tex.width // GRID, tex.height // GRID
        cells = [tex.crop((c * cw, r * ch, (c + 1) * cw, (r + 1) * ch)) for r in range(GRID) for c in range(GRID)]
        cells = [c.resize((cw * 2, ch * 2), Image.NEAREST) for c in cells]
        last = cells[-1]
        cells += [last] * HOLD
        for k in range(FADE):
            f = last.copy()
            f.putalpha(f.getchannel('A').point(lambda a, m=1 - (k + 1) / (FADE + 1): int(a * m)))
            cells.append(f)
        w, h = cells[0].size
        strip = Image.new('RGBA', (w * len(cells), h), (0, 0, 0, 0))
        for i, c in enumerate(cells):
            strip.paste(c, (i * w, 0))
        key = 'zodiac_' + SHEETS[name]
        strip.save(os.path.join(gdir, key + '.png'), optimize=True)
        index[key] = {'cell': [w, h], 'n': len(cells), 'ms': MS, 'add': False, 'anchor': [w // 2, h - 4], 'prefab': name}
        print(key, len(cells), 'cells', w, 'x', h)
    json.dump(index, open(ipath, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
