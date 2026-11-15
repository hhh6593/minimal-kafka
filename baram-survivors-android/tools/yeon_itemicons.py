#!/usr/bin/env python3
"""연's own inventory icons for the gear the hero wears (tools/yeon_gear.py's mapping).

    yeon_itemicons.py ITEMS YHERO2_INDEX OUT_DIR

Each 연 item's icon is the single sprite of its texture "Item_<id>" (or "item_<id>") in
Items.unity3d. For every key of yhero2's map (t<n>, dragon<n>, special ids) the icon of the 연
item its look comes from is saved trimmed and at most 64 px as OUT_DIR/<cls>/<kind>_<key>.png;
OUT_DIR/index.json = {cls: {kind: {key: file}}}.
"""
import json
import os
import re
import sys

import UnityPy
from PIL import Image

ARMOR = {  # yeon_gear.POOL armor variants -> item id
    'warrior': {'a': 3004, 'c': 3226, 'b': 3227, 'd': 3228, 'l': 503221},
    'rogue': {'a': 62998, 'c': 3426, 'b': 3427, 'd': 3428, 'l': 503421},
    'mage': {'a': 3832, 'c': 3627, 'b': 3628, 'd': 3629, 'l': 503621},
    'poet': {'a': 3006, 'c': 3826, 'b': 3827, 'd': 3828, 'l': 503821},
}


def main():
    items, idx_path, out = sys.argv[1:4]
    ix = json.load(open(idx_path))
    want = set()
    for cls, v in ix.items():
        for kind, mm in v['map'].items():
            for key, var in mm.items():
                if var:
                    i = ARMOR[cls][var] if kind == 'armor' else int(var)
                    want.update(range(i - 9, i + 1) if key.startswith('dragon') else [i])
    env = UnityPy.load(items)
    icons = {}
    for o in env.objects:
        if o.type.name != 'Sprite':
            continue
        n = o.peek_name()
        m = re.fullmatch(r'[Ii]tem_(\d+)', n)
        if not m or int(m.group(1)) not in want:
            continue
        sp = o.read()
        if sp.m_RD.texture.read().m_Name.lower() != n.lower():
            continue
        im = sp.image.convert('RGBA')
        box = im.getbbox()
        if box:
            im = im.crop(box)
        if max(im.size) > 64:
            k = 64 / max(im.size)
            im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
        old = icons.get(int(m.group(1)))
        if old is None or im.width * im.height > old.width * old.height:
            icons[int(m.group(1))] = im
    index = {}
    missing = []
    for cls, v in ix.items():
        os.makedirs(os.path.join(out, cls), exist_ok=True)
        for kind, mm in v['map'].items():
            for key, var in mm.items():
                if not var:
                    continue
                iid = ARMOR[cls][var] if kind == 'armor' else int(var)
                im = icons.get(iid)
                # A 용무기 step the client ships no icon for shows the step below it.
                back = iid
                while im is None and key.startswith('dragon') and back > iid - 9:
                    back -= 1
                    im = icons.get(back)
                if im is None:
                    missing.append((cls, kind, key, iid))
                    continue
                fn = f'{cls}/{kind}_{key}.png'
                im.save(os.path.join(out, fn), optimize=True)
                index.setdefault(cls, {}).setdefault(kind, {})[key] = fn
    json.dump(index, open(os.path.join(out, 'index.json'), 'w'), indent=0)
    print('icons', len(icons), 'of', len(want), 'missing', sorted({m[3] for m in missing}))


if __name__ == '__main__':
    main()
