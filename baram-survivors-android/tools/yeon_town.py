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
  <area>.png        each area rendered from its own 32-pixel tiles (market, smithy, armor, jumak;
                    named apart from the folk's pictures)
  <role>.png        the townsfolk: 연's 국내성 NPCs (털보, 떼보, 왈숙 이모, the palace lady, the board)
  sign.png, statue.png    a 장승 for the ways out, 연's guardian statue for the raids
  mm_<area>.png     each area's minimap (연's own for the market)
  index.json        {"areas": {area: {"w", "h", "tile", "cols", "rows", "walk": [rows, "." walkable],
                     "spawn": [x, y]}}, "folk": {role: {"cell", "foot", "row", "n", "ms"}},
                     "spots": {role: {"area", "x", "y"}},
                     "doors": [{"area", "x", "y", "to", "label"}],      warp floors between areas
                     "exits": {area: {"x", "y"}},                       each house's way out
                     "portals": [{"x", "y", "r", "tab", "label", "art", "sign"}]}   the ways out
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
    'jumak': ('chip_kow_guknesung_jumakwalsuk', None),
}
FOLK = {
    'smith': {'prefab': 'Baram_Unit_305', 'name': '털보'},
    'merchant': {'prefab': 'Baram_Unit_307', 'name': '떼보'},
    'inn': {'prefab': 'Baram_Unit_302', 'name': '왈숙 이모'},
}
STILL = {'guide': 'baram_Unit_328', 'clerk': 'baram_Unit_378'}
# Where each stands, in its map's own pixels: the house-keepers where 연 puts them (their NPC
# spawns), the board and the palace lady in the market (by the lower stall and the gate).
SPOTS = {'smith': ('smithy', 400, 300), 'merchant': ('armor', 384, 262), 'inn': ('jumak', 416, 424),
         'clerk': ('market', 1312, 1088), 'guide': ('market', 928, 1328)}
# Doors from the market (at the stalls' signboards) into the houses; a house's way out is its
# own @WARP object.
DOORS = [('market', 640, 640, 'smithy', '대장간'), ('market', 1376, 640, 'armor', '갑옷점'),
         ('market', 736, 1088, 'jumak', '주막')]
# The ways out of town, in the market's own pixels: walking into the 남문's opening, up through
# the hall to the north road, out along the hall's east end towards the 포구 — each with a 장승
# (연's wooden totem post) and its name beside it — and the stone guardian statue on the square,
# 연's own, whose base opens the raids. tab: the hunting-ground map each opens.
PORTALS = [
    {'x': 1008, 'y': 1592, 'r': 40, 'tab': 'gungnae', 'label': '남문 · 국내성 사냥터', 'art': 'gate', 'sign': (912, 1568)},
    {'x': 1024, 'y': 280, 'r': 40, 'tab': 'world_1', 'label': '북쪽 길 · 대륙', 'art': 'gate', 'sign': (944, 576)},
    {'x': 1760, 'y': 384, 'r': 40, 'tab': 'world_4', 'label': '포구 가는 길 · 환상의 섬', 'art': 'gate', 'sign': (1712, 470)},
    {'x': 352, 'y': 1188, 'r': 26, 'tab': 'raid', 'label': '영웅의 석상 · 레이드', 'art': 'statue', 'sign': None},
]
# The minimap of each area: 연's own (Minimaps bundle, the whole map at a quarter) for the market.
MINIMAP = {'market': ('chip_kow_guknesung_marget_m', 0.25)}
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

    # 연's minimap of each area (its own where 연 has one, else the area drawn small), cropped to
    # the area, at most 180 pixels across.
    mmaps = os.path.join(os.path.dirname(maps), 'Minimaps_1001.unity3d')
    own = {}
    if os.path.isfile(mmaps):
        names = {v[0]: k for k, v in MINIMAP.items()}
        for o in UnityPy.load(mmaps).objects:
            if o.type.name == 'Texture2D' and o.peek_name() in names:
                own[names[o.peek_name()]] = o.read().image.convert('RGB')
    for key in areas:
        if key in own:
            k = MINIMAP[key][1]
            ox, oy = shift[key]
            mm = own[key].crop((round(ox * k), round(oy * k), round((ox + areas[key]['w']) * k), round((oy + areas[key]['h']) * k)))
        else:
            mm = Image.open(os.path.join(d, key + '.png'))
        z = 180 / max(mm.size)
        mm = mm.resize((round(mm.width * z), round(mm.height * z)), Image.LANCZOS)
        mm.save(os.path.join(d, 'mm_' + key + '.png'))
        areas[key]['mm'] = [mm.width, mm.height]

    # The 장승 by each way out (one post of 연's totem row) and the guardian statue.
    for o in UnityPy.load(objects).objects:
        if o.type.name != 'Texture2D':
            continue
        n = o.peek_name()
        if n == 'Totem':
            im = o.read().image.convert('RGBA')
            post = im.crop((0, 0, im.width // 6, im.height))
            post.crop(post.getbbox()).save(os.path.join(d, 'sign.png'))
        elif n == 'Object_1066':
            im = o.read().image.convert('RGBA')
            im.crop(im.getbbox()).save(os.path.join(d, 'statue.png'))

    index = {'areas': areas, 'folk': folk,
             'spots': {k: dict(zip(('area', 'x', 'y'), [a] + at(a, x, y))) for k, (a, x, y) in SPOTS.items()},
             'doors': [dict(zip(('area', 'x', 'y', 'to', 'label'), [a] + at(a, x, y) + [to, label])) for a, x, y, to, label in DOORS],
             'exits': exits,
             'portals': [{**{k: v for k, v in pt.items() if k not in ('x', 'y', 'sign')},
                          'x': at('market', pt['x'], pt['y'])[0], 'y': at('market', pt['x'], pt['y'])[1],
                          'sign': at('market', *pt['sign']) if pt['sign'] else None} for pt in PORTALS]}
    with open(os.path.join(d, 'index.json'), 'w', encoding='utf-8') as f:
        json.dump(index, f, ensure_ascii=False)
    print('town', {k: (v['w'], v['h']) for k, v in areas.items()}, sorted(folk), exits)


if __name__ == '__main__':
    main()
