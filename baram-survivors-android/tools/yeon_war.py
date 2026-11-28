#!/usr/bin/env python3
"""The 사신수 길드대항전's battlefields, from 바람의나라 연's own maps (decrypted Maps_* bundles):
연's 사신수 공성전 castles (kow_zodiac_*_siege) and the 길림 쟁탈 field (kow_jilin_pk_castle).

    yeon_war.py DEC_DIR OUT_DIR [--preview] [--assets | --props] [--only=war,war]

DEC_DIR holds the decrypted Maps_*.unity3d. Writes OUT_DIR/ywar/<war>_<cx>_<cy>.png (1024-pixel
chunks of the crop, every tile layer, at the map's own scale: one 연 tile is 32 pixels, as the
town is drawn) and OUT_DIR/ywar/index.json:

    {"<war>": {"w", "h", "chunk": 1024, "cols", "rows", "walk": ["..#.", ...], "map", "crop"}}

walk is the map's own movables on the game's 48-pixel tiles (walk_grid: a tile is open when 연's
32-pixel tiles under its middle and under a body's feet are, no wall of 연's runs between it and an
open neighbour, and it is not under a roof's eaves). With --walk only index.json is rewritten (the
pieces kept). With --preview also OUT_DIR/ywar_preview/<war>.png: the crop at a
third, with the 48-pixel grid every 5 tiles, for placing the objectives.

Also (OUT_DIR is the GEAR_DIR the build reads):
  - the war's props from MapObjects.unity3d: OUT_DIR/prop_y/war_<name>.png + index.json entries
    (the gate's red doors, the 주작 수레 — its body is drawn in the additive pass, kept alone —
    the totem post, braziers, a row of the rock ring as a wall);
  - each side's helmeted guards from Units.unity3d (연's 평양성 / 동부여성 경비병 and 경비대장):
    OUT_DIR/yunit/war_*.png + index.json entries, through tools/yeon_units.py.
The UI art (the ▼ marker, the flags, 勝/敗, the ink blots, the medallions) comes with
tools/yeon_hud.py's UI_SPRITES.
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
    # (대규모 전투 맵 확장, 2026-11-28: each field cut wider from the same 연 map, its origin moved by whole steps of
    # three 연 tiles — two of the game's 48-pixel tiles — so the walk grid is the same cells and war.js's spots only shift.)
    'cheong': ('Maps_1311.unity3d', 'kow_jilin_pk_castle', (25, 15, 140, 126)),
    'baekho': ('Maps_5200.unity3d', 'kow_zodiac_whitetiger_siege_00_00_castle', (26, 28, 138, 106)),
    'jujak': ('Maps_5100.unity3d', 'kow_zodiac_redbird_siege_00_00_castle', (40, 24, 121, 142)),
    'hyeonmu': ('Maps_5200.unity3d', 'kow_zodiac_whitetiger_siege_00_00_castle', (21, 76, 141, 151)),
    # 월드 보스 쟁탈전 「쟁」: 연's world-boss arenas were 28x20 tiles of ground, too small for three guilds' squads to go
    # round one another; now 연's own PK fields of the same lands, the boss's altar and the seal stones stood on them as props.
    'bosspk_jp': ('Maps_405500.unity3d', 'kow_japan_35_01_pyo_pk_palace', (9, 42, 141, 108)),
    'bosspk_sea': ('Maps_509001.unity3d', 'kow_dragonpalace_pk_00_00_castle', (36, 66, 126, 138)),
    'bosspk_sky': ('Maps_515701.unity3d', 'kow_map_assembly_skybelow', (12, 58, 148, 148)),
    # 백호 난투 (엔드게임 2차, 2026-11-28): its own small field — 연's 백호성 정전 마당 (the 백호 statue's hall of the same siege),
    # 32x36 tiles inside its walls, left and right alike (the fight was on the whole 74x52 castle, its camps drawn in).
    'nanjeon': ('Maps_5200.unity3d', 'kow_zodiac_whitetiger_siege_01_01_place1', (6, 6, 54, 60)),
}
# The world-boss arenas used before (FLOOR_OPEN's rule is theirs).
OLD_ARENAS = {
    'bosspk_jp': ('Maps_416001.unity3d', 'kow_japan2_worldboss_01', (9, 9, 52, 40)),
    'bosspk_sea': ('Maps_416501.unity3d', 'kow_younggung2_worldboss_01', (8, 8, 53, 41)),
    'bosspk_sky': ('Maps_415501.unity3d', 'kow_map_worldboss_undersky_wave1', (8, 8, 49, 44)),
}
# 연 lets one walk only on a square in the middle of its world-boss arenas (the screen it fights
# on); round it lies the same ground, painted. On these the ground the square is laid with (its
# tiles found eight times or more in it) counts as open wherever nothing stands on it.
FLOOR_OPEN = {'kow_japan2_worldboss_01', 'kow_younggung2_worldboss_01', 'kow_map_worldboss_undersky_wave1'}
# 「쟁」's PK fields: 연's own movables only (blocked32's unseen-blocker rule opened 왜국's lake — its water is the
# ground layer the shore's movable tiles also use — and 하늘 아래's dark pits round the bridges: 300~430 tiles walked on
# that the eye reads as water or chasm).
SEEN_ONLY = {'kow_japan_35_01_pyo_pk_palace', 'kow_dragonpalace_pk_00_00_castle', 'kow_map_assembly_skybelow'}


PROPS = {'gate': ('1070', 'wall'), 'door': ('1054', 'wall'), 'wall': ('1034', 'wall'), 'brazier': ('1052', 'torch'),
         'totem': ('0058_totem_l', 'statue'), 'altar': ('1092', 'statue'), 'lock': ('0212_a', 'wall'), 'seal': ('0228', 'decal'),
         'stonewall': ('20004', 'wall'), 'lantern': ('1053', 'torch'),
         # 「쟁」: the boss's chained totems, its seal on the ground and the stone altar it rises from.
         # (glow: its additive part kept under the rest, its brightness as its cover.)
         'totem_r': ('0058_totem_r', 'statue'), 'bossmark': ('1023', 'decal', 'glow'), 'bossaltar': ('0086', 'decal')}
# Objects whose renderer the effect pipeline draws empty (an additive-named shader on a plain
# sprite, a node the animator shows): their sprites as they are. name -> (object, node, kind).
SPRITES = {'sealstone1': ('0003', 'Sprite', 'statue'), 'sealstone2': ('0004', 'Sprite', 'statue'), 'sealstone3': ('0007', 'Sprite', 'statue'),
           'sealring': ('0003', 'Select/Sprite', 'decal')}
CARTS = {'cart': '0146', 'cart2': '0147', 'cart3': '0145'}
UNITS = {'war_g1': ('Monster_0515', '평양성 경비병(검)'), 'war_g2': ('Monster_0517', '평양성 경비병(창)'),
         'war_g3': ('Monster_0518', '동부여성 경비병(검)'), 'war_g4': ('Monster_0520', '동부여성 경비병(창)'),
         'war_cap1': ('Monster_0516', '평양성 경비대장'), 'war_cap2': ('Monster_0519', '동부여성 경비대장')}


def props(dec, out):
    import numpy as np
    import UnityPy
    import yeon_skills as K
    pdir = os.path.join(out, 'prop_y')
    os.makedirs(pdir, exist_ok=True)
    ip = os.path.join(pdir, 'index.json')
    idx = json.load(open(ip)) if os.path.isfile(ip) else {'props': {}}
    env = UnityPy.load(os.path.join(dec, 'MapObjects.unity3d'))
    found = {}
    for k, v in env.container.items():
        found[k.rsplit('/', 1)[-1]] = v
    def put(name, im, ox, oy, box, kind, obj):
        im.save(os.path.join(pdir, 'war_' + name + '.png'))
        idx['props']['war_' + name] = {'size': list(im.size), 'terrain': 'war', 'kind': kind, 'foot': [ox - box[0], oy - box[1]], 'src': 'object_' + obj}
    for name, (obj, kind, *opt) in PROPS.items():
        frames, _, ox, oy, _ = K.render(found['object_' + obj + '.prefab'].read())
        # (The first frame that shows something: an orb's opens empty and grows.)
        fi = next((i for i, f in enumerate(frames) if f[0].getbbox() or np.asarray(f[1]).max() > 3), 0) if 'glow' in opt else 0
        al = frames[fi][0]
        if 'glow' in opt:
            ad = np.clip(frames[fi][1], 0, 255)
            a = ad.max(2)
            rgb = np.where(a[..., None] > 0, ad * 255.0 / np.maximum(a, 1)[..., None], 0)
            glow = Image.fromarray(np.dstack([rgb, a]).astype(np.uint8), 'RGBA')
            glow.alpha_composite(al)
            al = glow
        box = al.getbbox()
        im = al.crop(box)
        if name == 'wall':
            # Its black top band made clear (the build skips a fully opaque square as a floor piece).
            a = np.asarray(im).copy()
            a[:, :, 3] = np.where(a[:, :, :3].max(2) < 12, 0, 255)
            im = Image.fromarray(a)
        put(name, im, ox, oy, box, kind, obj)
        if name == 'stonewall':
            top = im.crop((0, 0, im.width, 26))
            top = top.crop(top.getbbox())
            top.save(os.path.join(pdir, 'war_rocks.png'))
            idx['props']['war_rocks'] = {'size': list(top.size), 'terrain': 'war', 'kind': 'wall', 'foot': [top.width // 2, top.height - 2], 'src': 'object_' + obj}
    for name, (obj, node, kind) in SPRITES.items():
        go = found['object_' + obj + '.prefab'].read()
        tr = K.comp(go, 'Transform')
        r = next(K.comp(t.m_GameObject.read(), 'SpriteRenderer') for p, t in [('', tr)] + K.child_paths(tr) if p == node)
        im = r.m_Sprite.read().image.convert('RGBA')
        box = im.getbbox()
        im = im.crop(box)
        foot = [im.width // 2, im.height // 2] if kind == 'decal' else [im.width // 2, im.height - 2]
        im.save(os.path.join(pdir, 'war_' + name + '.png'))
        idx['props']['war_' + name] = {'size': list(im.size), 'terrain': 'war', 'kind': kind, 'foot': foot, 'src': 'object_' + obj + '/' + node}
    for name, obj in CARTS.items():
        frames, _, ox, oy, _ = K.render(found['object_' + obj + '.prefab'].read())
        ad = np.clip(frames[0][1], 0, 255)
        im = Image.fromarray(np.dstack([ad, np.where(ad.max(2) > 3, 255, 0)]).astype(np.uint8), 'RGBA')
        box = im.getbbox()
        if box is None:
            print('war_' + name, 'drawn empty: kept as it was', file=sys.stderr)
            continue
        put(name, im.crop(box), ox, oy, box, 'wood', obj)
    json.dump(idx, open(ip, 'w'), indent=1)


def units(dec, out):
    import subprocess
    import tempfile
    udir = os.path.join(out, 'yunit')
    os.makedirs(udir, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        match = os.path.join(tmp, 'match.json')
        json.dump({k: {'prefab': p, 'name': n, 'yeon': n, 'tier': 0} for k, (p, n) in UNITS.items()}, open(match, 'w'), ensure_ascii=False)
        subprocess.run([sys.executable, '-I', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'yeon_units.py'),
                        os.path.join(dec, 'Units.unity3d'), match, tmp], check=True, stdout=subprocess.DEVNULL)
        got = json.load(open(os.path.join(tmp, 'index.json')))
        ip = os.path.join(udir, 'index.json')
        idx = json.load(open(ip)) if os.path.isfile(ip) else {}
        for k, u in got.items():
            os.replace(os.path.join(tmp, k + '.png'), os.path.join(udir, k + '.png'))
            u.update({'tier': 0, 'name': UNITS[k][1], 'yeon': UNITS[k][1]})
            idx[k] = u
        json.dump(idx, open(ip, 'w'), ensure_ascii=False)


ROOF = 2  # 연's tile layer drawn over the walkers: roofs, the caps of walls, a gate's lintel


FLOOR_PATCH = 25  # 「쟁」: a patch of other ground (nothing standing on it) smaller than this is walked over
FLOOR_BIT = 2     # 「쟁」: a group of drawn things this small (a pebble, a sprout, a starfish) is walked over


def floor_open(data, crop):
    """FLOOR_OPEN's rule: 연's own movables, and its square's ground tiles wherever no upper layer is drawn.

    Round 연's square the ground is painted, not built: what this rule shut there beyond the
    arena's own borders (a sea's deep water, a cliff's rim, a reef, a thicket's corner) was bits
    the eye reads as ground — a patch of brambles or a pool's rim (other ground tiles, nothing on
    them), a lone pebble, a sprout, a starfish (one or two drawn tiles). On the 48-pixel grid each
    shut a cell or two with nothing to see there, by the camps where the fights are: the hero was
    stopped by thin air and leapt short. Those are open now; a patch of other ground of
    FLOOR_PATCH tiles or more, and a group of drawn things of more than FLOOR_BIT, still shut.
    """
    from collections import Counter
    W, H = data['width'], data['height']
    x0, y0, x1, y1 = crop
    mv = data['movables']
    L = data['tileLayers']
    gid = lambda x, y: L[0]['tiles'][y * W + x]['aioTileID']
    floor = Counter(gid(x, y) for y in range(H) for x in range(W) if mv[y * W + x])
    keep = {k for k, v in floor.items() if v >= 8}
    up = lambda x, y: any(L[i]['tiles'][y * W + x]['aioTileID'] >= 0 for i in (1, 2, 3))
    shut = {(x, y) for y in range(y0, y1) for x in range(x0, x1) if not (mv[y * W + x] or (gid(x, y) in keep and not up(x, y)))}
    ground = {c for c in shut if not up(*c)}
    drawn = shut - ground
    for cells, small in ((ground, lambda n: n < FLOOR_PATCH), (drawn, lambda n: n <= FLOOR_BIT)):
        seen = set()
        for c in cells:
            if c in seen:
                continue
            part, st = [c], [c]
            seen.add(c)
            while st:
                x, y = st.pop()
                for n in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if n in cells and n not in seen:
                        seen.add(n)
                        part.append(n)
                        st.append(n)
            if small(len(part)):
                shut.difference_update(part)
    return [[(x, y) in shut for x in range(x0, x1)] for y in range(y0, y1)]


def blocked32(data, crop, unseen=True):
    """연's 32-pixel tiles in the crop a body may not stand on: not movable, or under the eaves.

    The eaves: 연 draws its roof layer over the walkers, so a movable tile under a roof's edge is
    one a walker passes behind. This game draws the whole field under its bodies, and one there
    stood on the roof or the top of the wall. Such a tile is closed when the roof over it ends on a
    wall or a house below (the tiles under it, roofed and movable, run into an unmovable one within
    four): a gate's passage under its lintel runs on into open ground (or on under a deep roof) and
    stays open.
    """
    W = data['width']
    x0, y0, x1, y1 = crop
    mv = data['movables']
    roof = data['tileLayers'][ROOF]['tiles']
    w, h = x1 - x0, y1 - y0
    blk = [[not mv[(y0 + y) * W + x0 + x] for x in range(w)] for y in range(h)]
    under = [[mv[(y0 + y) * W + x0 + x] and roof[(y0 + y) * W + x0 + x]['aioTileID'] >= 0 for x in range(w)] for y in range(h)]
    # 연's unseen blockers: unmovable tiles with nothing drawn over a floor the walkers walk on
    # elsewhere (a bar of three in the 길림 meadow, the 백호 statue's square on the court), where 연
    # stands a map object (a tree, a lantern, a statue) this field does not draw. An unseen wall
    # held the bodies back for no reason the player could see, and the timid hid behind thin air:
    # such a tile is opened.
    # (unseen=False: not on a map whose void, chasms and cliff faces are that same bare ground —
    # 연's hell maps, 화탕지옥: there the rule opened some 1900 tiles of void past the cliffs, and the
    # hero and the monsters walked off the map.)
    ground = data['tileLayers'][0]['tiles']
    gid = lambda x, y: ground[(y0 + y) * W + x0 + x]['aioTileID']
    on_floor = {}
    for y in range(h):
        for x in range(w):
            if not blk[y][x]:
                on_floor[gid(x, y)] = on_floor.get(gid(x, y), 0) + 1
    for y in range(h):
        for x in range(w):
            if unseen and blk[y][x] and on_floor.get(gid(x, y), 0) >= 8 and not any(
                    L['tiles'][(y0 + y) * W + x0 + x]['aioTileID'] >= 0 for L in data['tileLayers'][1:]):
                blk[y][x] = False
    out = [row[:] for row in blk]
    for y in range(h):
        for x in range(w):
            if not under[y][x]:
                continue
            yy = y
            while yy < h and yy - y <= 4 and under[yy][x]:
                yy += 1
            if yy - y <= 4 and (yy >= h or blk[yy][x]):
                out[y][x] = True
    return out


def walk_grid(blk, cols, rows):
    """The game's 48-pixel walk grid from 연's 32-pixel blocked tiles.

    A cell is closed when the 연 tile under its middle or under a body's feet (6 pixels above its
    bottom) is. Sampling the middle alone missed 연's thin walls (one tile thick, a cliff's edge, a
    fence) on every third 연 row and column, the ones split between two cells: bodies walked
    through them. So a pair of open neighbours with a closed 연 tile on the line between their
    middles (or their feet) has one of them closed: the one with more wall in it.
    """
    h, w = len(blk), len(blk[0])

    def b(px, py):
        x, y = int(px) // T, int(py) // T
        return x < 0 or y < 0 or x >= w or y >= h or blk[y][x]

    def wall(gx, gy):
        n = 0
        for py in range(gy * G, gy * G + G, 8):
            for px in range(gx * G, gx * G + G, 8):
                n += b(px + 4, py + 4)
        return n

    cells = [[not (b(gx * G + G // 2, gy * G + G // 2) or b(gx * G + G // 2, gy * G + G - 6)) for gx in range(cols)] for gy in range(rows)]
    for _ in range(4):
        changed = 0
        for gy in range(rows):
            for gx in range(cols):
                if not cells[gy][gx]:
                    continue
                for nx, ny in ((gx + 1, gy), (gx, gy + 1)):
                    if nx >= cols or ny >= rows or not cells[ny][nx]:
                        continue
                    ax, ay, bx, by = gx * G + G // 2, gy * G + G // 2, nx * G + G // 2, ny * G + G // 2
                    cut = False
                    for k in range(0, G + 1, 4):
                        if nx != gx:
                            cut = cut or b(ax + k, ay) or b(ax + k, ay + G // 2 - 6)
                        else:
                            cut = cut or b(ax, ay + k) or b(ax, ay + k + G // 2 - 6)
                    if cut:
                        if wall(nx, ny) > wall(gx, gy):
                            cells[ny][nx] = False
                        else:
                            cells[gy][gx] = False
                        changed += 1
                        if not cells[gy][gx]:
                            break
        if not changed:
            break
    # Pockets cut off from the field (a yard walled round, a corner behind a roof): closed too, so
    # no one is placed where it can never walk out of.
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


# Doorways out of a field cut from a room (game tiles x0, y0, x1, y1 inclusive), shut: 백호 난투's hall's north stair and south
# gate led two tiles out to the crop's edge — dead ends a leap or a shove could land in (wallscan, 2026-11-28).
SHUT = {'nanjeon': [(15, 3, 16, 3), (15, 32, 16, 34)]}


def shut(war, walk):
    rows = [list(r) for r in walk]
    for x0, y0, x1, y1 in SHUT.get(war, []):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                rows[y][x] = '#'
    return [''.join(r) for r in rows]


def main():
    dec, out = sys.argv[1], sys.argv[2]
    if '--assets' in sys.argv:
        props(dec, out)
        units(dec, out)
    elif '--props' in sys.argv:
        props(dec, out)
    only = [a[len('--only='):].split(',') for a in sys.argv if a.startswith('--only=')]
    preview = '--preview' in sys.argv
    walk_only = '--walk' in sys.argv
    d = os.path.join(out, 'ywar')
    os.makedirs(d, exist_ok=True)
    index = {}
    if walk_only:
        with open(os.path.join(d, 'index.json'), encoding='utf-8') as f:
            index = json.load(f)
    full_cache = {}
    if only:
        # Some wars only (--only=a,b): the others' pieces and index entries are kept.
        ip = os.path.join(d, 'index.json')
        if os.path.isfile(ip) and not walk_only:
            with open(ip, encoding='utf-8') as f:
                index = json.load(f)
    for war, (bundle, name, (x0, y0, x1, y1)) in WARS.items():
        if only and war not in only[0]:
            continue
        b = os.path.join(dec, bundle)
        data, _ = yeon_maps.load_map(b, name)
        if walk_only:
            v = index[war]
            v['walk'] = shut(war, walk_grid((floor_open(data, (x0, y0, x1, y1)) if name in FLOOR_OPEN else blocked32(data, (x0, y0, x1, y1), unseen=name not in SEEN_ONLY)), v['cols'], v['rows']))
            print(war, 'walk', sum(r.count('#') for r in v['walk']), 'closed of', v['cols'] * v['rows'])
            continue
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
        cols, rows = w // G, h // G
        walk = walk_grid((floor_open(data, (x0, y0, x1, y1)) if name in FLOOR_OPEN else blocked32(data, (x0, y0, x1, y1), unseen=name not in SEEN_ONLY)), cols, rows)
        walk = shut(war, walk)
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
