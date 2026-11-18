#!/usr/bin/env python3
"""Cuts today's client's 신발 icons (web/js/boots.js) out of its decrypted Items bundle.

    yeon_boots.py ITEMS_UNITY3D GEAR_DIR

ITEMS_UNITY3D is the client's Items.unity3d (decrypted, as tools/yeon_*.py read the other
bundles); each pair's 32x32 icon texture (Item_<id>) is saved as GEAR_DIR/<item name>.png, where
build.sh picks it up with the legendary gear's pictures (manifest gear, by name). Needs UnityPy.
"""
import os
import sys

import UnityPy

# The client's item ids of the pairs boots.js uses, in its order.
BOOTS = {
    '206014': '수행의신발', '206001': '선풍신발', '206002': '경원신발', '206003': '파천신발', '206004': '금강신발',
    '206005': '바람제일식신발', '206006': '바람태사신발', '206007': '바람홍옥신발', '206015': '열반의신발', '206027': "극'열반의신발",
}


def main():
    src, out = sys.argv[1], sys.argv[2]
    want = {f'Item_{k}': v for k, v in BOOTS.items()}
    os.makedirs(out, exist_ok=True)
    done = set()
    for obj in UnityPy.load(src).objects:
        if obj.type.name != 'Texture2D':
            continue
        d = obj.read()
        name = getattr(d, 'm_Name', None) or getattr(d, 'name', '')
        if name in want and name not in done:
            d.image.save(os.path.join(out, want[name] + '.png'))
            done.add(name)
    missing = set(want) - done
    print(f'{len(done)} saved' + (f', missing {sorted(missing)}' if missing else ''))


if __name__ == '__main__':
    main()
