#!/usr/bin/env python3
"""바람의나라 연's pets (환수), walking and standing in four directions, for the 코디 pet slot.

    yeon_pets.py PETS_BUNDLE ITEMS_PET_BIN ITEM_NAMES_JSON OUT_DIR

PETS_BUNDLE: Pets.unity3d from 연's resources, un-XORed (tools/yeon_dexor.py). ITEMS_PET_BIN: 연's
Items_Pet table (read as tools/yeon_costume.py reads Items_Avatar). Of its kinds (PET, RIDE,
TRANSFORM, DOSAKSAN) the PET ones walk beside their owner, as ours will: each is a prefab
(pets/pet_prefab_<n>, n as its icon Pet_Icon_<n>) of one sprite with an Animator whose override
controller plays the pet's own Walk/Idle clips in Down, Up and Side (the side faces left; mirrored
for right), as 연's monsters do (tools/yeon_units.py draws them the same way).

Output: OUT_DIR/<id>.webp (lossless; a row per clip, the feet at one point of every cell),
OUT_DIR/icons/<id>.png and OUT_DIR/index.json:
    {id: {"name", "grade", "cell", "foot", "anims": {name: {"row", "n", "ms"}}, "file", "icon"}}
Pets whose sheets are the same picture share one file.
"""
import hashlib
import io
import json
import os
import re
import sys

import UnityPy
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import yeon_costume as C  # noqa: E402
import yeon_units as U  # noqa: E402

KEEP = ['walk_down', 'walk_up', 'walk_side', 'idle_down', 'idle_up', 'idle_side']


def animator(go):
    stack = [go]
    while stack:
        g = stack.pop()
        for c in g.m_Components:
            if c.type.name == 'Animator':
                return c.read()
        for c in g.m_Components:
            if c.type.name in ('Transform', 'RectTransform'):
                for ch in c.read().m_Children:
                    stack.append(ch.read().m_GameObject.read())
    return None


def main():
    bundle, table_path, names_path, out = sys.argv[1:5]
    os.makedirs(os.path.join(out, 'icons'), exist_ok=True)
    table = C.read_table(table_path)
    names = json.load(open(names_path))
    fem = re.compile(r'\(여\)')
    env = UnityPy.load(bundle)
    pref, icons = {}, {}
    for path, obj in env.container.items():
        m = re.search(r'/pets/(pet_prefab_[^/]+)\.prefab$', path)
        if m:
            pref[m.group(1)] = obj
        m = re.search(r'/pets/icon/(pet_icon_[^/]+)\.png$', path)
        if m and obj.type.name == 'Sprite':
            icons[m.group(1)] = obj
    index, by_hash, skipped = {}, {}, []
    for iid, it in sorted(table.items(), key=lambda kv: int(kv[0])):
        if C.last(it, 'PetType') != 'PET':
            continue
        nm = names.get(iid, '')
        if not nm or fem.search(nm):
            continue
        icon = (C.last(it, 'Sprite') or '').split('/')[-1].lower().replace('.png', '')
        o = pref.get(icon.replace('pet_icon_', 'pet_prefab_'))
        if o is None:
            skipped.append((iid, nm, 'no prefab'))
            continue
        an = animator(o.read())
        if an is None or not an.m_Controller.path_id:
            skipped.append((iid, nm, 'no animator'))
            continue
        try:
            chosen = U.pick(U.controller_clips(an), icon)
        except Exception as e:
            skipped.append((iid, nm, str(e)))
            continue
        if any(k not in chosen for k in KEEP):
            skipped.append((iid, nm, 'clips ' + ','.join(sorted(chosen))))
            continue
        rows = []
        for key in KEEP:
            sprites, ms = U.frames_of(chosen[key])
            pics = []
            for s in sprites:
                im = s.image.convert('RGBA')
                r = s.m_Rect
                pics.append((im, s.m_Pivot.x * r.width, (1 - s.m_Pivot.y) * r.height))
            if not pics:
                break
            rows.append((key, pics, ms))
        if len(rows) != len(KEEP):
            skipped.append((iid, nm, 'empty clip'))
            continue
        # Tight: the pixels' own bounds round the feet.
        x0 = min(-px + (im.getbbox() or (0, 0, 0, 0))[0] for _, ps, _ in rows for im, px, _ in ps)
        y0 = min(-py + (im.getbbox() or (0, 0, 0, 0))[1] for _, ps, _ in rows for im, _, py in ps)
        x1 = max(-px + (im.getbbox() or (0, 0, 0, 0))[2] for _, ps, _ in rows for im, px, _ in ps)
        y1 = max(-py + (im.getbbox() or (0, 0, 0, 0))[3] for _, ps, _ in rows for im, _, py in ps)
        fx, fy = int(round(-x0)), int(round(-y0))
        cw, ch = int(round(x1 - x0)) + 1, int(round(y1 - y0)) + 1
        if cw < 4 or ch < 4 or cw > 400 or ch > 400:
            skipped.append((iid, nm, f'size {cw}x{ch}'))
            continue
        ncol = max(len(ps) for _, ps, _ in rows)
        sheet = Image.new('RGBA', (cw * ncol, ch * len(rows)))
        meta = {}
        for ri, (key, ps, ms) in enumerate(rows):
            for ci, (im, px, py) in enumerate(ps):
                sheet.alpha_composite(im, (ci * cw + int(round(fx - px)), ri * ch + int(round(fy - py))))
            meta[key] = {'row': ri, 'n': len(ps), 'ms': ms}
        buf = io.BytesIO()
        sheet.save(buf, 'WEBP', lossless=True, quality=80, method=4)
        h = hashlib.sha1(buf.getvalue()).hexdigest()
        if h not in by_hash:
            by_hash[h] = f'{iid}.webp'
            with open(os.path.join(out, by_hash[h]), 'wb') as f:
                f.write(buf.getvalue())
        e = {'name': nm, 'grade': int(C.last(it, 'MinGrade') or 0), 'cell': [cw, ch], 'foot': [fx, fy],
             'cols': ncol, 'anims': meta, 'file': by_hash[h]}
        io_ = icons.get(icon)
        if io_ is not None:
            im = io_.read().image.convert('RGBA')
            box = im.getbbox()
            if box:
                im = im.crop(box)
            if max(im.size) > 64:
                k = 64 / max(im.size)
                im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
            im.save(os.path.join(out, 'icons', f'{iid}.png'), optimize=True)
            e['icon'] = f'icons/{iid}.png'
        index[iid] = e
        if len(index) % 50 == 0:
            print(len(index), iid, nm, [cw, ch], flush=True)
    json.dump(index, open(os.path.join(out, 'index.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
    print('pets', len(index), 'files', len(by_hash), 'skipped', len(skipped))
    for s in skipped:
        print('  skip', *s)


if __name__ == '__main__':
    main()
