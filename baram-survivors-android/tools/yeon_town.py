#!/usr/bin/env python3
"""The town from 바람의나라 연's own resources: 국내성's market (장터) and its people.

    yeon_town.py MAPS_1001_BUNDLE UNITS_BUNDLE OUT_DIR

Both bundles are the game's downloaded ones, un-XORed (tools/yeon_dexor.py). Writes:

  OUT_DIR/ytown/market.png    the market map (chip_kow_guknesung_marget) rendered from its own
                              32-pixel tiles, cropped to the walled square and its gate
  OUT_DIR/ytown/<role>.png    the townsfolk: 연's 국내성 NPCs (털보 the smith, 떼보 of the armour
                              stall, 왈숙 이모 of the inn, the palace lady, the notice board)
  OUT_DIR/ytown/index.json    {"map": {"w", "h", "tile", "cols", "rows", "walk": [row strings,
                              "." walkable, "#" not], "spawn": [x, y]},
                               "folk": {role: {"cell", "foot", "n", "ms"}}, "spots": {...}}

The market's own walk grid (its "movables") says where one may step. Its building objects
(the stall signs, flags) live in a pack 연 downloads elsewhere and are not drawn; the stalls,
roofs, walls and trees are tiles and are all there.
"""
import json
import os
import subprocess
import sys

import UnityPy
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import yeon_maps  # noqa: E402

MAP = 'chip_kow_guknesung_marget'
# The walled square (tiles) and a margin of its outside, as cropped.
CROP = (6, 6, 58, 55)
# Our townsfolk as 연's: prefab sheets (idle, from Units) or a still picture.
FOLK = {
    'smith': {'prefab': 'Baram_Unit_305', 'name': '털보'},
    'merchant': {'prefab': 'Baram_Unit_307', 'name': '떼보'},
    'inn': {'prefab': 'Baram_Unit_302', 'name': '왈숙 이모'},
}
STILL = {'guide': 'baram_Unit_328', 'clerk': 'baram_Unit_378'}
# Where each stands, in the map's pixels (feet): the smith and the armour seller at the two upper
# stalls' signs, the inn and the notice board at the lower ones, the guide by the gate where
# 연's 장돌뱅이 stands.
SPOTS = {'smith': (640, 640), 'merchant': (1376, 640), 'inn': (736, 1088), 'clerk': (1312, 1088),
         'guide': (928, 1328)}
SPAWN = (992, 1500)


def main():
    maps, units, out = sys.argv[1:4]
    d = os.path.join(out, 'ytown')
    os.makedirs(d, exist_ok=True)
    data, _ = yeon_maps.load_map(maps, MAP)
    W, H = data['width'], data['height']
    mv = data['movables']
    x0, y0, x1, y1 = CROP
    T = yeon_maps.T
    yeon_maps.render(maps, MAP).crop((x0 * T, y0 * T, x1 * T, y1 * T)).convert('RGB').save(
        os.path.join(d, 'market.png'), optimize=True)
    walk = [''.join('.' if mv[y * W + x] else '#' for x in range(x0, x1)) for y in range(y0, y1)]
    shift = lambda p: [p[0] - x0 * T, p[1] - y0 * T]

    # 연's NPC sheets through the monster tool (same rules: feet on one point, idle frames).
    match = os.path.join(d, 'folk_match.json')
    with open(match, 'w', encoding='utf-8') as f:
        json.dump(FOLK, f, ensure_ascii=False)
    subprocess.run([sys.executable, '-I', os.path.join(os.path.dirname(__file__), 'yeon_units.py'), units, match, d],
                   check=True, stdout=subprocess.DEVNULL)
    with open(os.path.join(d, 'index.json'), encoding='utf-8') as f:
        sheets = json.load(f)
    folk = {}
    for role, s in sheets.items():
        a = s['anims'].get('idle_down') or next(iter(s['anims'].values()))
        # An NPC's pivot is its middle, not its feet: stand it on the bottom of what is drawn.
        cw, ch = s['cell']
        sheet = Image.open(os.path.join(d, role + '.png'))
        box = sheet.crop((0, a['row'] * ch, cw, (a['row'] + 1) * ch)).getchannel('A').getbbox()
        foot = [cw // 2, box[3] - 1] if box else s['foot']
        folk[role] = {'cell': s['cell'], 'foot': foot, 'row': a['row'], 'n': a['n'], 'ms': a['ms']}
    env = UnityPy.load(units)
    want = {v.lower(): k for k, v in STILL.items()}
    for o in env.objects:
        if o.type.name != 'Texture2D':
            continue
        n = o.peek_name().lower()
        if n in want and want[n] not in folk:
            im = o.read().image.convert('RGBA')
            im = im.crop(im.getbbox())
            im.save(os.path.join(d, want[n] + '.png'))
            folk[want[n]] = {'cell': list(im.size), 'foot': [im.width // 2, im.height - 2], 'row': 0, 'n': 1, 'ms': 1000}
    index = {'map': {'w': (x1 - x0) * T, 'h': (y1 - y0) * T, 'tile': T, 'cols': x1 - x0, 'rows': y1 - y0,
                     'walk': walk, 'spawn': shift(SPAWN)},
             'folk': folk, 'spots': {k: shift(v) for k, v in SPOTS.items()}}
    with open(os.path.join(d, 'index.json'), 'w', encoding='utf-8') as f:
        json.dump(index, f, ensure_ascii=False)
    os.remove(match)
    print('town', index['map']['w'], index['map']['h'], sorted(folk))


if __name__ == '__main__':
    main()
