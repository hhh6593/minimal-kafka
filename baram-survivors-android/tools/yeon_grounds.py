#!/usr/bin/env python3
"""Hunting grounds out of 바람의나라 연's own maps: the survey of its hunting maps, and every
asset a ground of tools/yeon_grounds.json needs.

    yeon_grounds.py survey DEC_DIR OUT.json         every 연 hunting map and what it holds
    yeon_grounds.py build SPEC DEC_DIR GEAR_DIR AUDIO_DIR [ID ...]   (only those grounds / raids)
    yeon_grounds.py arena DEC_DIR GEAR_DIR [ID ...]      bounded fields from 연's maps (yhunt/)
    yeon_grounds.py ambient DEC_DIR GEAR_DIR             weather particles from 연's FXs (yamb/)
    yeon_grounds.py bosses SPEC DEC_DIR GEAR_DIR         SPEC "bosses": old-picture bosses as 연 units

DEC_DIR holds the decrypted bundles (tools/yeon_dexor.py): Commons, Units, Image, Sounds and the
Maps_* bundles.

연's tables (Commons: Maps, Units_Field, Units_FieldBoss; MonoBehaviours with a `_buffer`) share
one binary layout: a list of field names, (field, value) leaf pairs, a string pool, and at the end
a run of 24-byte nodes (name, value, child offset, child count, leaf offset, leaf count). A map is
a `Map` node: its ID, name and group name (Strings keys), file (the map's bytes in a Maps_*
bundle), music, proper level, and its Spawn lines (UnitID, Count, At; At=BOSS marks the field
boss). A unit's prefab (Units/Characters/Monster_xxxx) and name (Unit_<id>_Name) are in the unit
tables. read_table() turns a table into dicts.

survey writes, for each hunting map (Mode FIELD with spawns) grouped by its group name: level,
music, monsters (name, unit, prefab, and whether the prefab is in Units.unity3d, which is what
tools/yeon_units.py draws), the field boss, and the bundle that holds the map.

build, for each ground of SPEC ({"tabs": {...}, "grounds": [...]}, see tools/yeon_grounds.json):
  - its monsters, leader and boss: tools/yeon_units.py sheets into GEAR_DIR/yunit/y<unit>.png,
    merged into its index.json with "own": true (prepare_assets.py gives them a monster entry
    of their own: they have no old picture), 연's name, unit id and MoveSpeed;
  - its floor and props: tools/yeon_maps.py (auto floor tiles, auto props) for terrain y_<id>
    into GEAR_DIR/floor_y and prop_y;
  - its music: the map's own clip out of Sounds.unity3d as AUDIO_DIR/bgm/<clip>.mp3 (96k,
    loudness-matched; the build makes it OGG);
  - its pin: GEAR_DIR/ymap/index.json (the stage-select tabs), with a new tab's 연 map picture
    (a Texture2D of Image.unity3d) where SPEC names one.
SPEC "raids": raids out of 연's own (data.js RAIDS with a terrain y_<id>): the same units (from
Units_RaidBoss too), floor, props and music, no pin (the raid list is the game's own).
SPEC "bosses": the bosses and leaders that wore the old client's few-frame pictures, each as the
연 unit of its name (or the nearest by name and kind): their sheets only (bosses mode).
With IDs, only those grounds and raids are built (the indexes keep everything else).
"""
import json
import os
import re
import struct
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)


def read_table(buf, rec_name):
    """연's binary table as a list of records (dicts; repeated fields become lists)."""
    _, nend, _, pool = struct.unpack('<4I', buf[:16])
    names, i = {}, 16
    while i < nend and buf[i]:
        names[i - 16] = buf[i + 1:i + 1 + buf[i]].decode()
        i += 1 + buf[i]

    def s(o):
        if pool + o >= len(buf):
            return ''
        return buf[pool + o + 1:pool + o + 1 + buf[pool + o]].decode('utf-8', 'replace')
    w = struct.unpack('<%dI' % ((pool - nend) // 4), buf[nend:nend + (pool - nend) // 4 * 4])
    # The nodes are the tail: walk back while the words still read as nodes.
    base = len(w)
    while base >= 6 and w[base - 6] in names and w[base - 6] != 0:
        base -= 6

    def node(t):
        return w[base + 6 * t:base + 6 * t + 6]

    def leaf(off, cnt):
        d = {}
        for t in range(cnt):
            a, b = w[off // 4 + 2 * t], w[off // 4 + 2 * t + 1]
            d.setdefault(names.get(a, '?'), []).append(s(b))
        return {k: v[0] if len(v) == 1 else v for k, v in d.items()}

    def obj(n):
        rec = leaf(n[4], n[5]) if n[4] else {}
        for c in range(n[2] // 24, n[2] // 24 + n[3]) if n[3] else ():
            m = node(c)
            key = names[m[0]]
            val = obj(m) if (m[3] or m[4]) else s(m[1])
            if key in rec:
                if not isinstance(rec[key], list):
                    rec[key] = [rec[key]]
                rec[key].append(val)
            else:
                rec[key] = val
        return rec
    return [obj(node(t)) for t in range((len(w) - base) // 6)
            if names[node(t)[0]] == rec_name and (node(t)[3] or node(t)[4])]


def one(v):
    return v[0] if isinstance(v, list) else v


class Res:
    """The tables and names of the decrypted bundles."""

    def __init__(self, dec):
        import UnityPy
        self.dec = dec
        env = UnityPy.load(os.path.join(dec, 'Commons.unity3d'))
        bufs, strings = {}, ''
        for o in env.objects:
            if o.type.name == 'MonoBehaviour':
                n = o.peek_name()
                if n in ('Maps', 'Units_Field', 'Units_FieldBoss', 'Units_RaidBoss'):
                    bufs[n] = bytes(o.read_typetree()['_buffer'])
            elif o.type.name == 'TextAsset' and o.peek_name() == 'Strings':
                sc = o.read().m_Script
                strings = sc.decode('utf-8', 'replace') if isinstance(sc, bytes) else sc
        self.str = dict(re.findall(r'<String Key="([^"]+)"><!\[CDATA\[(.*?)\]\]></String>', strings, re.S))
        self.maps = read_table(bufs['Maps'], 'Map')
        self.units = {}
        for t in ('Units_Field', 'Units_FieldBoss', 'Units_RaidBoss'):
            for r in read_table(bufs[t], 'Unit'):
                if t == 'Units_RaidBoss' and one(r['ID']) in self.units:
                    continue  # (the field tables' entry first: the raid table repeats some ids)
                p = one(r.get('Prefab')) or ''
                tags = r.get('Tag') or []
                self.units[one(r['ID'])] = {
                    'prefab': p.split('/')[-1].replace('.prefab', ''), 'table': t,
                    'boss': 'BOSS' in (tags if isinstance(tags, list) else [tags]) or t != 'Units_Field',
                    'move': one(r.get('MoveSpeed')), 'atk': one(r.get('AttackTime'))}

    def name(self, key):
        key = one(key) or ''
        return self.str.get(key, key)

    def unit_name(self, uid):
        return self.str.get(f'Unit_{uid}_Name', '')


def unit_prefabs(dec):
    import UnityPy
    env = UnityPy.load(os.path.join(dec, 'Units.unity3d'))
    return {o.peek_name() for o in env.objects if o.type.name == 'GameObject'}


def map_bundles(dec):
    """map file name (lower case) -> the Maps_* bundle that holds it."""
    import UnityPy
    out = {}
    for b in sorted(os.listdir(dec)):
        if not b.startswith('Maps') or not b.endswith('.unity3d'):
            continue
        env = UnityPy.load(os.path.join(dec, b))
        for k in env.container:
            base = k.rsplit('/', 1)[-1]
            if base.endswith('.bytes'):
                out.setdefault(base[:-6].lower(), b)
    return out


def survey(dec, out):
    R = Res(dec)
    pref = unit_prefabs(dec)
    where = map_bundles(dec)
    groups = {}
    for m in R.maps:
        if one(m.get('Mode')) != 'FIELD' or not m.get('Spawn'):
            continue
        f = (one(m.get('File')) or '').replace('.bytes', '')
        g = re.sub(r'\s*\d+$', '', R.name(m.get('GroupName')) or R.name(m.get('Name')))
        if not g or g.startswith('폭:') or g.startswith('Map_'):
            continue
        G = groups.setdefault(g, {'group': g, 'maps': [], 'bundle': where.get(f.lower()), 'lv': [],
                                  'music': {}, 'monsters': {}, 'boss': {}})
        G['maps'].append(f)
        G['lv'].append(int(one(m.get('ProperLevel')) or 0))
        G['music'][one(m.get('Music'))] = G['music'].get(one(m.get('Music')), 0) + 1
        spawns = m['Spawn'] if isinstance(m['Spawn'], list) else [m['Spawn']]
        for x in spawns:
            uid = one(x.get('UnitID'))
            u = R.units.get(uid)
            if not u:
                continue
            row = {'unit': uid, 'name': R.unit_name(uid), 'prefab': u['prefab'], 'drawable': u['prefab'] in pref}
            if one(x.get('At')) == 'BOSS' or u['boss']:
                G['boss'][uid] = row
            else:
                G['monsters'].setdefault(uid, row)
    rows = []
    for G in groups.values():
        G['lv'] = [min(G['lv']), max(G['lv'])]
        G['music'] = max(G['music'], key=G['music'].get)
        G['monsters'] = list(G['monsters'].values())
        G['boss'] = list(G['boss'].values())
        G['drawable'] = sum(1 for r in G['monsters'] if r['drawable'])
        rows.append(G)
    rows.sort(key=lambda g: g['lv'][0])
    json.dump(rows, open(out, 'w'), ensure_ascii=False, indent=0)
    for G in rows:
        print(f"{G['group'][:16]:16} Lv{G['lv'][0]:>4} {G['music'] or '-':32} {G['bundle'] or '-':22} "
              f"{G['drawable']}/{len(G['monsters'])} drawable :: "
              + ', '.join(r['name'] for r in G['monsters'][:6])
              + (' || ' + ', '.join(r['name'] for r in G['boss'][:2]) if G['boss'] else ''))


def draw_units(R, dec, gear, uids):
    """연 units as tools/yeon_units.py sheets: GEAR_DIR/yunit/y<unit>.png, merged into its
    index.json with "own": true (prepare_assets.py gives them a monster entry of their own),
    연's name, unit id and MoveSpeed."""
    match = {}
    for uid in uids:
        u = R.units[str(uid)]
        match['y%s' % uid] = {'prefab': u['prefab'], 'name': R.unit_name(str(uid)), 'yeon': R.unit_name(str(uid)),
                              'unit': str(uid), 'tier': 0, 'own': True, 'move': u['move'], 'atk': u['atk']}
    udir = os.path.join(gear, 'yunit')
    os.makedirs(udir, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        mp = os.path.join(tmp, 'match.json')
        json.dump(match, open(mp, 'w'), ensure_ascii=False)
        subprocess.run([sys.executable, '-I', os.path.join(HERE, 'yeon_units.py'), os.path.join(dec, 'Units.unity3d'), mp, tmp],
                       check=True, stdout=subprocess.DEVNULL)
        got = json.load(open(os.path.join(tmp, 'index.json')))
        ip = os.path.join(udir, 'index.json')
        idx = json.load(open(ip)) if os.path.isfile(ip) else {}
        for k, u in got.items():
            os.replace(os.path.join(tmp, k + '.png'), os.path.join(udir, k + '.png'))
            u.update({kk: match[k][kk] for kk in ('tier', 'name', 'yeon', 'unit', 'own', 'move', 'atk')})
            idx[k] = u
        missing = sorted(set(match) - set(got))
        if missing:
            raise SystemExit(f'units not drawn: {missing}')
        json.dump(idx, open(ip, 'w'), ensure_ascii=False)
    print(len(got), 'units')


def bosses(spec_path, dec, gear):
    """SPEC "bosses": the old-picture bosses and leaders of data.js (grounds, raids) worn as 연
    units: only their sheets into GEAR_DIR/yunit/ (no floor, props or music)."""
    spec = json.load(open(spec_path, encoding='utf-8'))
    draw_units(Res(dec), dec, gear, sorted({b['unit'] for b in spec['bosses']}))


def build(spec_path, dec, gear, audio, *only):
    import yeon_maps
    spec = json.load(open(spec_path, encoding='utf-8'))
    R = Res(dec)
    grounds = [g for g in spec['grounds'] if not only or g['id'] in only]
    raids = [g for g in spec.get('raids', []) if not only or g['id'] in only]
    # Monsters, leaders and bosses.
    draw_units(R, dec, gear, [uid for g in grounds + raids for uid in g['units'] + [g['mini'], g['boss']]])
    # Floors and props, a terrain of its own for each ground.
    terr = {}
    for g in grounds + raids:
        b = os.path.join(dec, g['bundle'])
        # floor_tiles: the map's tiles named outright where its walkable cells are too few to read.
        terr['y_' + g['id']] = {'floor': {'bundle': b, 'map': g['map'], 'auto': True, 'tiles': g.get('floor_tiles')},
                                # props_extra: 연's MapObjects pieces (a torch: the abyss's light sources)
                                'props': g.get('props_extra', []),
                                'props_auto': {'bundle': os.path.join(dec, g.get('props_bundle', g['bundle'])), 'map': g.get('props_map', g['map']), 'n': g.get('props', 6)}}
    yeon_maps.build(None, gear, {'objects': os.path.join(dec, 'MapObjects.unity3d'), 'terrains': terr})
    # Music.
    bdir = os.path.join(audio, 'bgm')
    os.makedirs(bdir, exist_ok=True)
    want = {g['music'] for g in grounds + raids} - {f[:-4] for f in os.listdir(bdir)}
    if want:
        import UnityPy
        env = UnityPy.load(os.path.join(dec, 'Sounds.unity3d'))
        for o in env.objects:
            if o.type.name == 'AudioClip' and o.peek_name() in want:
                c = o.read()
                with tempfile.TemporaryDirectory() as tmp:
                    for nm, data in c.samples.items():
                        wav = os.path.join(tmp, 'a.wav')
                        open(wav, 'wb').write(data)
                        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-af', 'loudnorm=I=-18:TP=-1.5',
                                        '-ar', '44100', '-b:a', '96k', os.path.join(bdir, c.m_Name + '.mp3')], check=True)
                        break
                want.discard(c.m_Name)
        if want:
            raise SystemExit(f'music not found: {sorted(want)}')
    # Pins on the stage-select tabs.
    ydir = os.path.join(gear, 'ymap')
    os.makedirs(ydir, exist_ok=True)
    ip = os.path.join(ydir, 'index.json')
    yidx = json.load(open(ip)) if os.path.isfile(ip) else {}
    for tab, t in spec.get('tabs', {}).items():
        if tab not in yidx and (not only or any(g['tab'] == tab for g in grounds)):
            if t.get('render'):
                # A region with no world-map picture: its 연 hub map itself, every layer, scaled down.
                from PIL import Image
                im = yeon_maps.render(os.path.join(dec, t['bundle']), t['render']).convert('RGB')
                im.thumbnail((t.get('size', 1024), t.get('size', 1024)), Image.LANCZOS)
                src = f"{t['bundle']} {t['render']} (the map, rendered)"
            else:
                import UnityPy
                env = UnityPy.load(os.path.join(dec, t['bundle']))
                tex = next(o.read() for o in env.objects if o.type.name == 'Texture2D' and o.peek_name() == t['image'])
                im = tex.image.convert('RGB')
                src = f"{t['bundle']} {t['image']}"
            im.save(os.path.join(ydir, tab + '.png'), optimize=True)
            yidx[tab] = {'file': tab + '.png', 'w': im.width, 'h': im.height, 'src': src, 'stages': {}}
    for g in grounds:
        # A ground that moved to another tab leaves its old pin.
        for t in yidx.values():
            t['stages'].pop(g['id'], None)
        if g['tab'] in yidx:
            yidx[g['tab']]['stages'][g['id']] = g['at']
    json.dump(yidx, open(ip, 'w'), ensure_ascii=False, indent=1)
    print('grounds', len(grounds))


# 사냥 대개편 P4: grounds fought on 연's own map, a bounded field (walls, bridges, cliffs, lava).
# ground id -> bundle, map, crop in 연 tiles (x0, y0, x1, y1): the walkable body of the map, the
# blurred rim and the far pockets left out (a crop by hand, as the wars' are).
ARENAS = {
    'baekdu': ('Maps_412001.unity3d', 'kow_baekdusan_01_baekduvillage_02_01_daegakbong1', (8, 6, 64, 76)),
    'hwatang': ('Maps_414001.unity3d', 'kow_hell_01_underworld_02_02_hwatangjiok3', (6, 6, 74, 98)),
    'wreck': ('Maps_409180.unity3d', 'kow_ship_dragonpalace_07_04_shipgraveyard_01', (9, 6, 52, 50)),
    'sandolim': ('Maps_415501.unity3d', 'kow_skybelow_01_first_01_01_sandolim_canyon_01', (14, 10, 78, 64)),
}
# 9차 사냥터 지형 (2026-11-28): every other 연 ground of tools/yeon_grounds.json on its own map too
# (before, a plain field of its floor tiles with a few props). Crop None: the box round the map's
# movable tiles, ARENA_RIM tiles wider (the cliffs and shores that close it, not the blurred
# rim). Left out: the ones too small to hunt on (늑대인간의 굴 163 movable tiles, the hidden 철상
# 지옥 178, 소굴 336: a few rooms' worth, the horde had nowhere to come from) and the endless
# hell's suwoo cave (its torches, fog and rooms are a mode of their own).
ARENA_AUTO = ['reef', 'greatwall', 'qin', 'gogyun', 'spidercave', 'gareung', 'pokyeom', 'baekdu2', 'baekdu3',
              'baekdu4', 'hanbing', 'geohae', 'cheolsang', 'zud', 'zud2', 'fallforest', 'jagwi', 'oldaram',
              'haya', 'lobi', 'aram', 'ancient', 'abyss2', 'abyss4']
ARENA_RIM = 2
# Arenas whose void, chasms and cliff faces are bare floor ground (연's hell): yeon_war.blocked32's
# unseen-blocker rule would open them (화탕지옥: the hero and the monsters walked off the cliffs).
NO_UNSEEN = {'hwatang', 'hanbing', 'geohae', 'cheolsang', 'abyss4'}
# The closed ground is drawn dimmer (shade_closed; not on the void-and-island hell maps, NO_SHADE: there the void
# and the cliff faces down to it are the edge already, and the dimmed snow / stone lip round the
# walkable ground made a grey band on 한빙지옥), so what holds the bodies back is what the eye
# sees as out of bounds (보이는 것 = 맞는 것): the factor of light kept, the feather of its edge, and
# how far into an open / closed cell its core is held to the walk grid (the rest follows 연's tiles).
SHADE = 0.62
NO_SHADE = {'hanbing', 'geohae', 'cheolsang'}
FEATHER = 6
CORE_OPEN, CORE_SHUT = 8, 16
BARE = 0.2      # a closed cell under a fifth covered by the upper layers: bare
OPEN_BIT = 4    # a patch of bare closed cells this small, inside the field: opened


def arena_crop(data):
    """The movable tiles' box, ARENA_RIM wider, inside the map."""
    W, H, mv = data['width'], data['height'], data['movables']
    xs = [i % W for i in range(W * H) if mv[i]]
    ys = [i // W for i in range(W * H) if mv[i]]
    return (max(0, min(xs) - ARENA_RIM), max(0, min(ys) - ARENA_RIM),
            min(W, max(xs) + 1 + ARENA_RIM), min(H, max(ys) + 1 + ARENA_RIM))


def bare_cells(up, walk):
    """The closed cells with (almost) nothing drawn over the ground in them: up is the crop's
    upper tile layers (1..4) rendered, a cell is bare when under a fifth of it is covered."""
    G = 48
    a = up.getchannel('A').point(lambda v: 255 if v > 40 else 0)
    rows, cols = len(walk), len(walk[0])
    out = set()
    for gy in range(rows):
        for gx in range(cols):
            if walk[gy][gx] != '.':
                hist = a.crop((gx * G, gy * G, gx * G + G, gy * G + G)).histogram()
                if hist[255] < G * G * BARE:
                    out.add((gx, gy))
    return out


def open_bits(walk, bare):
    """Small patches of bare closed cells (OPEN_BIT cells or fewer, off the picture's edge) opened:
    연 stood a tree, a rock or a tent there (its map objects, which this field does not draw), and
    such a cell held the bodies back over a meadow that showed nothing. The walk grid's pocket
    rule again after (a patch walled round by drawn things stays shut)."""
    rows, cols = len(walk), len(walk[0])
    cells = [[c == '.' for c in row] for row in walk]
    seen = set()
    for c in sorted(bare):
        if c in seen:
            continue
        part, st = [c], [c]
        seen.add(c)
        while st:
            x, y = st.pop()
            for n in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if n in bare and n not in seen:
                    seen.add(n)
                    part.append(n)
                    st.append(n)
        if len(part) <= OPEN_BIT and not any(x in (0, cols - 1) or y in (0, rows - 1) for x, y in part):
            for x, y in part:
                cells[y][x] = True
    # the field: the part the most open cells are in; the rest shut
    comp, best = {}, None
    for gy in range(rows):
        for gx in range(cols):
            if not cells[gy][gx] or (gx, gy) in comp:
                continue
            part, st = [(gx, gy)], [(gx, gy)]
            comp[(gx, gy)] = part
            while st:
                x, y = st.pop()
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < cols and 0 <= ny < rows and cells[ny][nx] and (nx, ny) not in comp:
                        comp[(nx, ny)] = part
                        part.append((nx, ny))
                        st.append((nx, ny))
            if best is None or len(part) > len(best):
                best = part
    for (x, y), part in comp.items():
        if part is not best:
            cells[y][x] = False
    return [''.join('.' if c else '#' for c in row) for row in cells]


def shade_closed(img, walk, blk):
    """Dim the whole closed ground (walls, cliffs, water, a fort's yard, a meadow's rim — what holds
    the bodies back), so the field the bodies walk on stands lit and its edge is seen where it is.

    The edge follows 연's own 32-pixel tiles (blk: yeon_war.blocked32, the line the art draws: a
    cliff's rim, a shore), not the 48-pixel walk cells: a cell's core is held to the walk grid
    (an open cell lit, a closed one dim), the band between follows the tiles, and the whole is
    feathered (FEATHER px). Dimmed alike, a closed area reads as one (by closed cells, bare ones
    only, it was a patchwork of grey squares on 한빙지옥's snow and 로비해변's cliff tops)."""
    import numpy as np
    from PIL import Image, ImageFilter
    T, G = 32, 48
    w, h = img.size
    m = np.kron(np.array(blk, dtype=np.uint8), np.ones((T, T), dtype=np.uint8))[:h, :w] * 255
    rows, cols = len(walk), len(walk[0])
    for gy in range(rows):
        for gx in range(cols):
            if walk[gy][gx] == '.':
                m[gy * G + CORE_OPEN:gy * G + G - CORE_OPEN, gx * G + CORE_OPEN:gx * G + G - CORE_OPEN] = 0
            elif all(not (0 <= gx + dx < cols and 0 <= gy + dy < rows) or walk[gy + dy][gx + dx] != '.'
                     for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                # a closed cell with no open one beside it (a pocket on a cliff top, the far side of
                # a wall): dim whole, whatever 연's tiles say (its few movable tiles made pale squares)
                m[gy * G:gy * G + G, gx * G:gx * G + G] = 255
            else:
                m[gy * G + CORE_SHUT:gy * G + G - CORE_SHUT, gx * G + CORE_SHUT:gx * G + G - CORE_SHUT] = 255
    # the strip past the last whole cell: as the cells beside it
    m[rows * G:, :] = m[rows * G - 1:rows * G, :]
    m[:, cols * G:] = m[:, cols * G - 1:cols * G]
    mask = Image.fromarray(m, 'L').filter(ImageFilter.GaussianBlur(FEATHER))
    dark = img.point(lambda v: int(v * SHADE))
    return Image.composite(dark, img, mask)


def arena(dec, gear, only=None):
    """GEAR_DIR/yhunt/<id>_<cx>_<cy>.png (1024-pixel pieces of the crop, every tile layer) and
    GEAR_DIR/yhunt/index.json: {"<id>": {"w", "h", "chunk", "cols", "rows", "walk", "start", "map",
    "crop"}} - walk is the 48-pixel walk grid (tools/yeon_war.py walk_grid, the wars' rules), start
    the open cell nearest the middle, where the hero comes in.
    (env YHUNT_OUT: another folder than GEAR_DIR/yhunt, e.g. GEAR_DIR/yhunt_add, which
    tools/repack_from_apk.py lays over an earlier APK's.)"""
    import yeon_maps
    import yeon_war
    from PIL import Image
    T, G, CH = 32, 48, 1024
    d = os.environ.get('YHUNT_OUT') or os.path.join(gear, 'yhunt')
    os.makedirs(d, exist_ok=True)
    ip = os.path.join(d, 'index.json')
    index = json.load(open(ip, encoding='utf-8')) if os.path.isfile(ip) else {}
    spec = {g['id']: g for g in json.load(open(os.path.join(HERE, 'yeon_grounds.json'), encoding='utf-8'))['grounds']}
    todo = dict(ARENAS)
    for gid in ARENA_AUTO:
        todo[gid] = (spec[gid]['bundle'], spec[gid]['map'], None)
    for gid, (bundle, name, crop) in todo.items():
        if only and gid not in only:
            continue
        b = os.path.join(dec, bundle)
        data, _ = yeon_maps.load_map(b, name)
        x0, y0, x1, y1 = crop or arena_crop(data)
        full = yeon_maps.render(b, name)
        img = Image.new('RGBA', ((x1 - x0) * T, (y1 - y0) * T), (0, 0, 0, 255))
        img.alpha_composite(full.crop((x0 * T, y0 * T, x1 * T, y1 * T)))
        img = img.convert('RGB')
        w, h = img.size
        cols, rows = w // G, h // G
        blk = yeon_war.blocked32(data, (x0, y0, x1, y1), gid not in NO_UNSEEN)
        walk = yeon_war.walk_grid(blk, cols, rows)
        if gid in ARENA_AUTO:
            up = Image.new('RGBA', (w, h))
            up.alpha_composite(yeon_maps.render(b, name, layers={1, 2, 3, 4}).crop((x0 * T, y0 * T, x1 * T, y1 * T)))
            walk = open_bits(walk, bare_cells(up, walk))
            if gid not in NO_SHADE:
                img = shade_closed(img, walk, blk)
        for cy in range(-(-h // CH)):
            for cx in range(-(-w // CH)):
                img.crop((cx * CH, cy * CH, min(w, (cx + 1) * CH), min(h, (cy + 1) * CH))).save(
                    os.path.join(d, f'{gid}_{cx}_{cy}.png'), optimize=True)
        cells = [(x, y) for y in range(rows) for x in range(cols) if walk[y][x] == '.']
        start = min(cells, key=lambda c: (c[0] - cols / 2) ** 2 + (c[1] - rows / 2) ** 2)
        index[gid] = {'w': w, 'h': h, 'chunk': CH, 'cols': cols, 'rows': rows, 'walk': walk, 'start': list(start),
                      'map': name, 'crop': [x0, y0, x1, y1]}
        print(gid, name, (w, h), (cols, rows), 'open', len(cells))
    with open(ip, 'w', encoding='utf-8') as f:
        json.dump(index, f, ensure_ascii=False, separators=(',', ':'))


# 사냥 대개편 P5: 연's own weather particles (FXs.unity3d textures) for the hunting grounds' groups.
AMBIENT = ['weather_snow', 'csg04_rain', 'bubble_blue', 'csg04_leaf', 'weather_tachukbo', 'fog3']


def ambient(dec, gear):
    """GEAR_DIR/yamb/<name>.png: the snow, rain, bubble, leaf, dust and fog textures of 연's FXs."""
    import UnityPy
    d = os.path.join(gear, 'yamb')
    os.makedirs(d, exist_ok=True)
    env = UnityPy.load(os.path.join(dec, 'FXs.unity3d'))
    for k, v in env.container.items():
        base = k.rsplit('/', 1)[-1]
        if base.endswith('.png') and base[:-4] in AMBIENT:
            o = v.read()
            if type(o).__name__ == 'Texture2D':
                o.image.save(os.path.join(d, base))
                print('ambient', base, o.image.size)


def main():
    if sys.argv[1] == 'survey':
        survey(sys.argv[2], sys.argv[3])
    elif sys.argv[1] == 'build':
        build(*sys.argv[2:])
    elif sys.argv[1] == 'bosses':
        bosses(sys.argv[2], sys.argv[3], sys.argv[4])
    elif sys.argv[1] == 'ambient':
        ambient(sys.argv[2], sys.argv[3])
    elif sys.argv[1] == 'arena':
        arena(sys.argv[2], sys.argv[3], sys.argv[4:] or None)
    else:
        raise SystemExit(__doc__)


if __name__ == '__main__':
    main()
