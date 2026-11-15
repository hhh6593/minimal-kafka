#!/usr/bin/env python3
"""Floors and props from 바람의나라 연's own hunting-ground maps (decrypted Maps_* bundles).

Each map is a MonoBehaviour (container name <map>.bytes: width, height, tileLayers[5] of
{aioTileID} row-major from the top) and an atlas <map>.png of 32-pixel tiles, its ids
row-major in the atlas. Layer 0 is the ground; the upper layers hold edges, cliffs, rocks,
grass and the rest. Native scale: one tile is 32 pixels.

    yeon_maps.py render BUNDLE MAP OUT.png            the whole map, every layer
    yeon_maps.py build SPEC.json OUT_DIR              floors + props for every terrain

See build() for SPEC.json (tools/yeon_maps_spec.json is the one used). Writes
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


def build(spec_path, out):
    """SPEC: {"objects": MapObjects bundle, "terrains": {terrain: {"floor": {bundle, map,
    tiles: [[id, weight]]}, "props": [{name, kind, bundle, map, box: [x, y, w, h] px,
    layers} | {name, kind, obj: "0120"}]}}}"""
    spec = json.load(open(spec_path))
    fdir, pdir = os.path.join(out, 'floor_y'), os.path.join(out, 'prop_y')
    os.makedirs(fdir, exist_ok=True)
    os.makedirs(pdir, exist_ok=True)
    index = {'tile': T, 'floors': {}, 'props': {}}
    for terrain, s in spec['terrains'].items():
        f = s.get('floor')
        if f:
            fl = floor_mix(f['bundle'], f['map'], f['tiles'])
            fl.convert('RGB').save(os.path.join(fdir, terrain + '.png'), optimize=True)
            index['floors'][terrain] = {'size': [fl.width, fl.height], 'map': f['map']}
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
    json.dump(index, open(os.path.join(pdir, 'index.json'), 'w'), ensure_ascii=False, indent=1)


def main():
    if sys.argv[1] == 'render':
        layers = [int(x) for x in sys.argv[5].split(',')] if len(sys.argv) > 5 else None
        render(sys.argv[2], sys.argv[3], layers).save(sys.argv[4])
    else:
        build(sys.argv[2], sys.argv[3])


if __name__ == '__main__':
    main()
