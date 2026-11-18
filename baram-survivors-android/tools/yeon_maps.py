#!/usr/bin/env python3
"""Floors and props from 바람의나라 연's own hunting-ground maps (decrypted Maps_* bundles).

Each map is a MonoBehaviour (container name <map>.bytes: width, height, tileLayers[5] of
{aioTileID} row-major from the top) and an atlas <map>.png of 32-pixel tiles, its ids
row-major in the atlas. Layer 0 is the ground; the upper layers hold edges, cliffs, rocks,
grass and the rest. Native scale: one tile is 32 pixels.

    yeon_maps.py render BUNDLE MAP OUT.png            the whole map, every layer
    yeon_maps.py build SPEC.json OUT_DIR              floors + props for every terrain

See build() for SPEC.json (tools/yeon_maps_spec.json is the one used; tools/yeon_grounds.py
passes its own, with the floor tiles and props read off the map: auto_floor_tiles, auto_props). Writes
OUT_DIR/floor_y/<terrain>.png (8 x 8 tiles of the map's own ground, 256 px, seamless) and
OUT_DIR/prop_y/<terrain>_<name>.png + index.json (size, kind, foot = bottom centre).
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np
import UnityPy
from PIL import Image

T = 32
_cache = {}


def load_map(bundle, name):
    key = (bundle, name)
    if key in _cache:
        return _cache[key]
    env = _cache.get(bundle) or UnityPy.load(bundle)
    _cache[bundle] = env
    data = atlas = None
    for k, v in env.container.items():
        base = k.rsplit('/', 1)[-1]
        if base == name + '.bytes':
            data = v.read_typetree()
        elif base == name + '.png' and atlas is None:
            o = v.read()
            if type(o).__name__ == 'Texture2D':
                atlas = o.image.convert('RGBA')
    if data is None or atlas is None:
        raise SystemExit(f'{name}: not in {bundle}')
    _cache[key] = (data, atlas)
    return data, atlas


def tile(atlas, tid):
    cols = atlas.width // T
    x, y = (tid % cols) * T, (tid // cols) * T
    return atlas.crop((x, y, x + T, y + T))


def render(bundle, name, layers=None):
    data, atlas = load_map(bundle, name)
    W, H = data['width'], data['height']
    out = Image.new('RGBA', (W * T, H * T))
    for li, L in enumerate(data['tileLayers']):
        if layers is not None and li not in layers:
            continue
        for i, c in enumerate(L['tiles']):
            tid = c['aioTileID']
            if tid >= 0:
                out.alpha_composite(tile(atlas, tid), ((i % W) * T, (i // W) * T))
    return out


def trim(im):
    box = im.getbbox()
    return im.crop(box) if box else im


def floor_mix(bundle, name, weights, n=8, seed=7):
    """An n x n block of the map's own ground tiles, mixed by weight: the variants the map
    lays side by side, so any arrangement of them meets seamlessly."""
    import random
    _, atlas = load_map(bundle, name)
    rnd = random.Random(seed)
    ids = [i for i, _ in weights]
    ws = [w for _, w in weights]
    out = Image.new('RGBA', (n * T, n * T))
    for y in range(n):
        for x in range(n):
            out.alpha_composite(tile(atlas, rnd.choices(ids, ws)[0]), (x * T, y * T))
    return out


def tile_stats(atlas, tid):
    a = np.asarray(tile(atlas, tid)).astype(float)
    return a[:, :, :3].mean((0, 1)), a[:, :, 3].min()


def auto_floor_tiles(bundle, name, keep=0.2, near=36):
    """The map's own walking ground, read off it: the ground-layer tiles of the cells the map
    lets one walk on (its `movables`, 1 = walkable; else the cells with nothing on the upper
    layers), most common first, without the near-black void around floating maps or
    see-through pieces, and only those close in colour to the commonest one (its variants,
    which the map lays side by side). [[id, count], ...] for floor_mix."""
    from collections import Counter
    data, atlas = load_map(bundle, name)
    tiles = data['tileLayers'][0]['tiles']
    mv = data.get('movables') or []
    if len(mv) == len(tiles) and sum(1 for v in mv if v == 1) >= 50:
        walk = {i for i, v in enumerate(mv) if v == 1}
    else:
        covered = set()
        for L in data['tileLayers'][1:]:
            covered.update(i for i, c in enumerate(L['tiles']) if c['aioTileID'] >= 0)
        walk = set(range(len(tiles))) - covered
    cnt = Counter(c['aioTileID'] for i, c in enumerate(tiles) if c['aioTileID'] >= 0 and i in walk)
    stats = {t: tile_stats(atlas, t) for t in cnt}
    ok = [t for t, _ in cnt.most_common() if stats[t][1] == 255 and stats[t][0].mean() >= 28]
    if not ok:
        raise SystemExit(f'{name}: no ground tiles')
    main = ok[0]
    top = cnt[main]
    out = [[t, cnt[t]] for t in ok
           if cnt[t] >= keep * top and np.abs(stats[t][0] - stats[main][0]).sum() <= near]
    return out


def label(mask):
    """Connected parts of a boolean mask (8 neighbours): (labels, count)."""
    try:
        from scipy import ndimage
        return ndimage.label(mask, structure=np.ones((3, 3), int))
    except ImportError:
        from collections import deque
        lab = np.zeros(mask.shape, int)
        n = 0
        for y, x in zip(*np.nonzero(mask)):
            if lab[y, x]:
                continue
            n += 1
            q = deque([(y, x)])
            lab[y, x] = n
            while q:
                cy, cx = q.popleft()
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        ny, nx = cy + dy, cx + dx
                        if 0 <= ny < mask.shape[0] and 0 <= nx < mask.shape[1] and mask[ny, nx] and not lab[ny, nx]:
                            lab[ny, nx] = n
                            q.append((ny, nx))
        return lab, n


def prop_kind(im):
    """What a cut map piece is, by its shape and colour (game.js PROP_WEIGHT)."""
    w, h = im.size
    a = np.asarray(im).astype(float)
    on = a[:, :, 3] > 0
    r, g, b = (a[:, :, k][on].mean() for k in range(3))
    if max(w, h) >= 110:
        return 'statue' if h >= w else 'wall'
    if h >= 1.35 * w and h >= 36:
        return 'plant'
    if w >= 2.2 * h:
        return 'decal'
    if g > r + 8 and g > b:
        return 'grass'
    return 'rock'


def auto_props(bundle, name, n=6, layers=(1, 2, 3, 4), lo=16, hi=180):
    """The map's own small pieces off its upper tile layers (rocks, tufts, plants, bones,
    crystals ...): every connected piece between lo and hi pixels a side that the map does not
    cut off along a tile edge (a straight opaque side is a piece of a cliff or a wall), grouped
    by look; the n most repeated looks, most repeated first. [(image, kind, count)]."""
    full = render(bundle, name, layers=list(layers))
    a = np.asarray(full)
    mask = a[:, :, 3] > 0
    lab, k = label(mask)
    try:
        from scipy import ndimage
        boxes = ndimage.find_objects(lab)
    except ImportError:
        boxes = []
        for i in range(1, k + 1):
            ys, xs = np.nonzero(lab == i)
            boxes.append((slice(ys.min(), ys.max() + 1), slice(xs.min(), xs.max() + 1)))
    H, W = mask.shape
    groups = {}
    for i, sl in enumerate(boxes, 1):
        if sl is None:
            continue
        y0, y1, x0, x1 = sl[0].start, sl[0].stop, sl[1].start, sl[1].stop
        h, w = y1 - y0, x1 - x0
        if not (lo <= w <= hi and lo <= h <= hi) or x0 == 0 or y0 == 0 or x1 == W or y1 == H:
            continue
        m = lab[y0:y1, x0:x1] == i
        if m.sum() < 0.25 * w * h or m.sum() < 140:
            continue
        # Cut along a tile edge: a side that is opaque most of its length.
        if max(m[0].mean(), m[-1].mean(), m[:, 0].mean(), m[:, -1].mean()) > 0.6:
            continue
        piece = a[y0:y1, x0:x1].copy()
        piece[:, :, 3] = np.where(m, piece[:, :, 3], 0)
        # Same look: same size and the same coarse picture.
        small = np.asarray(Image.fromarray(piece).resize((6, 6), Image.BILINEAR)).astype(int) // 48
        key = (w // 4, h // 4, small.tobytes())
        g = groups.setdefault(key, [Image.fromarray(piece), 0])
        g[1] += 1
    best = sorted(groups.values(), key=lambda g: -g[1])
    out, seen = [], []
    for im, c in best:
        # Variety: not two looks of nearly one size and colour.
        sig = (im.width, im.height, tuple(np.asarray(im)[:, :, :3][np.asarray(im)[:, :, 3] > 0].mean(0) // 24))
        if any(abs(s[0] - sig[0]) < 4 and abs(s[1] - sig[1]) < 4 and s[2] == sig[2] for s in seen):
            continue
        seen.append(sig)
        out.append((im, prop_kind(im), c))
        if len(out) >= n:
            break
    return out


def object_picture(objects_bundle, name):
    """First frame of a MapObjects prefab (trees, lanterns, kelp...), drawn by yeon_skills."""
    import yeon_skills as K
    env = _cache.get(objects_bundle) or UnityPy.load(objects_bundle)
    _cache[objects_bundle] = env
    for k, v in env.container.items():
        if k.endswith('/object_' + name + '.prefab'):
            frames, fps, ox, oy, add = K.render(v.read())
            strip, cell, anchor = K.to_strip(frames[:1], ox, oy, add)
            return trim(strip.convert('RGBA')), anchor
    raise SystemExit(f'object_{name} not found')


def build(spec_path, out, spec=None):
    """SPEC: {"objects": MapObjects bundle, "terrains": {terrain: {"floor": {bundle, map,
    tiles: [[id, weight]] | auto: true}, "props": [{name, kind, bundle, map, box: [x, y, w, h] px,
    layers} | {name, kind, obj: "0120"}], "props_auto": {bundle, map, n}}}}

    The index is merged: terrains not in SPEC (another tool's, or an earlier run's) are kept."""
    spec = spec or json.load(open(spec_path))
    fdir, pdir = os.path.join(out, 'floor_y'), os.path.join(out, 'prop_y')
    os.makedirs(fdir, exist_ok=True)
    os.makedirs(pdir, exist_ok=True)
    ip = os.path.join(pdir, 'index.json')
    index = json.load(open(ip)) if os.path.isfile(ip) else {}
    index.setdefault('tile', T)
    index.setdefault('floors', {})
    index.setdefault('props', {})
    for terrain, s in spec['terrains'].items():
        index['props'] = {k: v for k, v in index['props'].items() if v.get('terrain') != terrain}
        f = s.get('floor')
        if f:
            tiles = f.get('tiles') or auto_floor_tiles(f['bundle'], f['map'])
            fl = floor_mix(f['bundle'], f['map'], tiles)
            fl.convert('RGB').save(os.path.join(fdir, terrain + '.png'), optimize=True)
            index['floors'][terrain] = {'size': [fl.width, fl.height], 'map': f['map'], 'tiles': tiles}
        pa = s.get('props_auto')
        if pa:
            for i, (im, kind, c) in enumerate(auto_props(pa['bundle'], pa['map'], pa.get('n', 6))):
                fn = f'{terrain}_a{i}'
                im.save(os.path.join(pdir, fn + '.png'), optimize=True)
                index['props'][fn] = {'size': [im.width, im.height], 'terrain': terrain, 'kind': kind,
                                      'foot': [im.width // 2, im.height - 2], 'src': pa['map'], 'seen': c}
                print(fn, im.size, kind, c)
        for pr in s.get('props', []):
            if 'obj' in pr:
                im, _ = object_picture(spec['objects'], pr['obj'])
                src = 'object_' + pr['obj']
            else:
                x, y, w, h = pr['box']
                im = trim(render(pr['bundle'], pr['map'], layers=pr.get('layers', [1, 2, 3, 4])).crop((x, y, x + w, y + h)))
                src = pr['map']
            fn = f"{terrain}_{pr['name']}"
            im.save(os.path.join(pdir, fn + '.png'), optimize=True)
            index['props'][fn] = {'size': [im.width, im.height], 'terrain': terrain, 'kind': pr['kind'],
                                  'foot': [im.width // 2, im.height - 2], 'src': src}
            print(fn, im.size)
    json.dump(index, open(ip, 'w'), ensure_ascii=False, indent=1)


def main():
    if sys.argv[1] == 'render':
        layers = [int(x) for x in sys.argv[5].split(',')] if len(sys.argv) > 5 else None
        render(sys.argv[2], sys.argv[3], layers).save(sys.argv[4])
    else:
        build(sys.argv[2], sys.argv[3])


if __name__ == '__main__':
    main()
