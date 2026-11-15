#!/usr/bin/env python3
"""The town from 바람의나라 연's own resources: 국내성's market (장터), the houses off it, its people
and its gates.

    yeon_town.py MAPS_1001_BUNDLE UNITS_BUNDLE MAPOBJECTS_BUNDLE OUT_DIR

The bundles are the game's downloaded ones, un-XORed (tools/yeon_dexor.py). 연's 국내성 is one
great map whose houses and trees are objects from a pack it downloads apart (not in the files we
have); its market square and its houses' insides are whole in tiles. So the town is built as 연
joins its maps: the market is the hub, and walking onto a door's warp floor takes the hero
inside 털보's smithy, 떼보's armour shop or 왈숙 이모's inn (each its own 연 map, left again by its
own exit warp); the market's gates are portals to the hunting grounds.

Writes OUT_DIR/ytown/:
  <area>.png        each area rendered from its own 32-pixel tiles (market, smithy, armor, inn)
  <role>.png        the townsfolk: 연's 국내성 NPCs (털보, 떼보, 왈숙 이모, the palace lady, the board)
  warp.png, warp_light.png, illusion.png   연's warp floor, its glow, the phantom portal (4 frames)
  index.json        {"areas": {area: {"w", "h", "tile", "cols", "rows", "walk": [rows, "." walkable],
                     "spawn": [x, y]}}, "folk": {role: {"cell", "foot", "row", "n", "ms"}},
                     "spots": {role: {"area", "x", "y"}},
                     "doors": [{"area", "x", "y", "to", "label"}],      warp floors between areas
                     "exits": {area: {"x", "y"}},                       each house's way out
                     "portals": [{"x", "y", "tab", "label", "art"}]}    the market's gates
"""
import json
import os
import subprocess
import sys

import UnityPy
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import yeon_maps  # noqa: E402

T = yeon_maps.T
# Each area: its 연 map and the square of tiles kept (None: all that is drawn).
AREAS = {
    'market': ('chip_kow_guknesung_marget', (6, 6, 58, 55)),
    'smithy': ('chip_kow_guknesung_smithy', None),
    'armor': ('chip_kow_guknesung_armor', None),
    'inn': ('chip_kow_guknesung_jumakwalsuk', None),
}
FOLK = {
    'smith': {'prefab': 'Baram_Unit_305', 'name': '털보'},
    'merchant': {'prefab': 'Baram_Unit_307', 'name': '떼보'},
    'inn': {'prefab': 'Baram_Unit_302', 'name': '왈숙 이모'},
}
STILL = {'guide': 'baram_Unit_328', 'clerk': 'baram_Unit_378'}
# Where each stands, in its map's own pixels: the house-keepers where 연 puts them (their NPC
# spawns), the board and the palace lady in the market (by the lower stall and the gate).
SPOTS = {'smith': ('smithy', 400, 300), 'merchant': ('armor', 384, 262), 'inn': ('inn', 416, 424),
         'clerk': ('market', 1312, 1088), 'guide': ('market', 928, 1328)}
# Doors from the market (at the stalls' signboards) into the houses; a house's way out is its
# own @WARP object.
DOORS = [('market', 640, 640, 'smithy', '대장간'), ('market', 1376, 640, 'armor', '갑옷점'),
         ('market', 736, 1088, 'inn', '주막')]
# The market's gates as portals: its lower gate and its upper warp (연's own), and the two
# sides. tab: the hunting-ground map they open.
PORTALS = [(992, 1600, 'gungnae', '남문 · 국내성 사냥터', 'warp'), (560, 352, 'world_1', '북문 · 대륙', 'warp'),
           (1728, 992, 'world_4', '포구 · 환상의 섬', 'warp'), (288, 992, 'raid', '환영의 문 · 레이드', 'illusion')]
SPAWN = (992, 1500)


def area(maps, name, crop):
    data, _ = yeon_maps.load_map(maps, name)
    W, H = data['width'], data['height']
    full = yeon_maps.render(maps, name)
    if crop is None:
        b = full.getchannel('A').getbbox()
        crop = (b[0] // T, b[1] // T, -(-b[2] // T), -(-b[3] // T))
    x0, y0, x1, y1 = crop
    img = full.crop((x0 * T, y0 * T, x1 * T, y1 * T)).convert('RGB')
    mv = data['movables']
    walk = [''.join('.' if mv[y * W + x] else '#' for x in range(x0, x1)) for y in range(y0, y1)]
    warps = [(m['x'] - x0 * T, m['y'] - y0 * T) for m in data['mapObjects'] if m['name'].startswith('@WARP')]
    homes = [(m['x'] - x0 * T, m['y'] - y0 * T) for m in data['mapObjects'] if m['name'] == 'HOME']
    return img, walk, (x0 * T, y0 * T), warps, homes


def main():
    maps, units, objects, out = sys.argv[1:5]
    d = os.path.join(out, 'ytown')
    os.makedirs(d, exist_ok=True)
    areas, shift, exits = {}, {}, {}
    for key, (name, crop) in AREAS.items():
        img, walk, off, warps, homes = area(maps, name, crop)
        img.save(os.path.join(d, key + '.png'), optimize=True)
        shift[key] = off
        spawn = [SPAWN[0] - off[0], SPAWN[1] - off[1]] if key == 'market' else list(homes[-1] if homes else (img.width // 2, img.height // 2))
        areas[key] = {'w': img.width, 'h': img.height, 'tile': T, 'cols': len(walk[0]), 'rows': len(walk), 'walk': walk,
                      'spawn': spawn}
        if key != 'market' and warps:
            # The way out: the lowest warp (the door at the bottom of the room).
            x, y = max(warps, key=lambda w: w[1])
            exits[key] = {'x': x, 'y': y}
    at = lambda a, x, y: [x - shift[a][0], y - shift[a][1]]

    match = os.path.join(d, 'folk_match.json')
    with open(match, 'w', encoding='utf-8') as f:
        json.dump(FOLK, f, ensure_ascii=False)
    subprocess.run([sys.executable, '-I', os.path.join(os.path.dirname(__file__), 'yeon_units.py'), units, match, d],
                   check=True, stdout=subprocess.DEVNULL)
    with open(os.path.join(d, 'index.json'), encoding='utf-8') as f:
        sheets = json.load(f)
    os.remove(match)
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

    # 연's warp floor and its glow, and the phantom portal (a 2x2 sheet of frames, halved).
    art = {'Warp_Floor': 'warp', 'Warp_Floor_light': 'warp_light', 'Phantom_Guknesung_Illusion_Portal_A': 'illusion'}
    for o in UnityPy.load(objects).objects:
        if o.type.name == 'Texture2D' and o.peek_name() in art:
            im = o.read().image.convert('RGBA')
            if art[o.peek_name()] == 'illusion':
                im = im.resize((im.width // 2, im.height // 2), Image.LANCZOS)
            im.save(os.path.join(d, art[o.peek_name()] + '.png'))

    index = {'areas': areas, 'folk': folk,
             'spots': {k: dict(zip(('area', 'x', 'y'), [a] + at(a, x, y))) for k, (a, x, y) in SPOTS.items()},
             'doors': [dict(zip(('area', 'x', 'y', 'to', 'label'), [a] + at(a, x, y) + [to, label])) for a, x, y, to, label in DOORS],
             'exits': exits,
             'portals': [dict(zip(('x', 'y', 'tab', 'label', 'art'), at('market', x, y) + [tab, label, art]))
                         for x, y, tab, label, art in PORTALS]}
    with open(os.path.join(d, 'index.json'), 'w', encoding='utf-8') as f:
        json.dump(index, f, ensure_ascii=False)
    print('town', {k: (v['w'], v['h']) for k, v in areas.items()}, sorted(folk), exits)


if __name__ == '__main__':
    main()
