#!/usr/bin/env python3
"""Layered 연 hero sheets, so the game can dress the hero in whatever it wears.

    yeon_gear.py UNITS ITEMS CATALOG_JSON GEAR_JSON HAIR_JSON OUT_DIR MAP_MD

UNITS/ITEMS: Units.unity3d and Items.unity3d from 바람의나라 연's resources, un-XORed
(tools/yeon_units.py, dexor()). CATALOG_JSON: every texture of Items with its sprites' stem and
count and the item name from Strings (made by the catalog step in the notes). GEAR_JSON: our
gear per class (tiers, raid pieces, crafted specials, 용무기 line), dumped from avatar.js/items.js.
HAIR_JSON: per class the hair texture id and its index remap (classes3.json of yeon_avatar.py).

The player's clips (Avatar_0001, see tools/yeon_avatar.py) are evaluated once per class; each
frame is drawn as separate layers on one common cell:

    back (Hair_b) · body (Sprite) · armor (Skin) · head (Head + Hair) · helmet (Hat) ·
    shield (Sheild) · weapon (Weapon, its swing included)

with, per frame, the layers' draw order taken from 연's own sorting values (the weapon goes
behind the body when facing up, and so on). A gear variant replaces a slot's template sprite by
the frame of the same number in the variant's own texture (sprite names repeat across sheets,
so textures are named by id, never by sprite name).

Output: OUT_DIR/<cls>/<layer>_<variant>.png (rows = animations, columns = frames) and
OUT_DIR/index.json:
    {cls: {cell, foot, anims: {name: {row, n, ms, z: [[layer, ...] per frame, back to front]}},
           layers: {kind: {variant: {file, cols, name}}},
           map: {kind: {our tier "t<n>" or special id: variant}}}}
"""
import json
import math
import os
import re
import sys

import UnityPy
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import yeon_avatar as Y  # noqa: E402

LAYERS = {
    'back': ['Hair_b'], 'body': ['Sprite'], 'armor': ['Skin'], 'head': ['Head', 'Hair'],
    'helmet': ['Hat', 'Hat_color'], 'shield': ['Sheild', 'Sheild_color'],
    'weapon': ['Weapon', 'Weapon_color', 'Weapon_back'],
}
# Slots drawn from the template as they are (the beard of the template's face is left off).
DROP = {'Face', 'Cape', 'Cape_color', 'Emotion'}

# 연 items per class, ascending, for our tiers without a same-named 연 piece.
POOL = {
    'armor': {
        'warrior': [('a', 3004), ('c', 3226), ('b', 3227), ('d', 3228), ('l', 503221)],
        'rogue': [('a', 62998), ('c', 3426), ('b', 3427), ('d', 3428), ('l', 503421)],
        'mage': [('a', 3832), ('c', 3627), ('b', 3628), ('d', 3629), ('l', 503621)],
        'poet': [('a', 3006), ('c', 3826), ('b', 3827), ('d', 3828), ('l', 503821)],
    },
    'weapon': {
        'warrior': [1000, 1133, 1135, 1170, 1172],
        'rogue': [1046, 1227, 1232, 1234, 1256, 1272],
        'mage': [1301, 1302, 1305, 1306, 1327, 1372],
        'poet': [1089, 1098, 1917, 1926, 1472],
    },
    'shield': [7201, 7202, 7203, 7204, 7006, 7008, 507001, 507023],
    'helmet': {'warrior': [2006, 202037], 'rogue': [2006, 202043], 'mage': [2006, 202055], 'poet': [2006, 202049]},
}
DRAGON = {'mage': [(1, 1409), (4, 1412)], 'poet': [(1, 1307), (4, 1310), (10, 1316)],
          'warrior': [(1, 1170), (7, 1172)], 'rogue': [(1, 1256), (7, 1272)]}


def tex_for(catalog, iid, kind):
    """The texture of item iid's worn sheet, by texture name (the sprite names repeat)."""
    want = {f'item_{iid}_e', f'item_{iid}'}
    best = None
    for c in catalog:
        # Some sheets sit in textures named after their batch (_new_item_03_E): their sprites'
        # stem still names the item.
        if c['tex'].lower() in want or c['stem'].lower() == f'item_{iid}_e' \
                or (kind == 'shield' and c['id'] == str(iid) and c['stem'] == 'Shield_0001'):
            # A worn sheet, not the item's icon: as many frames as the slot uses.
            if c['n'] < {'armor': 77, 'weapon': 4, 'shield': 3, 'helmet': 9}.get(kind, 1) or (kind == 'armor' and c['n'] != 77):
                continue
            if best is None or c['n'] > best['n']:
                best = c
    return best


def main():
    units, items, cat_path, gear_path, hair_path, out, map_md = sys.argv[1:8]
    catalog = json.load(open(cat_path))
    ours = json.load(open(gear_path))
    hair = json.load(open(hair_path))
    names = {c['id']: c['name'] for c in catalog if c['id'] and c['name']}
    env = UnityPy.load(units, items)
    parts, clips = Y.build(env)
    crc = {v['name']: k for k, v in parts.items()}

    # Every variant needed: (kind, variant) -> (texture id, item id, name).
    variants = {}
    review = []
    for cls in ours:
        variants[cls] = {}
        pool = {k: (POOL[k][cls] if isinstance(POOL[k], dict) else POOL[k]) for k in POOL}

        def add(kind, iid):
            c = tex_for(catalog, iid, kind)
            if not c:
                return None
            v = f'{kind[0]}{iid}'
            variants[cls][(kind, v)] = (c['tid'], iid, names.get(str(iid), c['tex']))
            return v

    # Mapping our gear -> variant.
    maps = {}
    for cls, g in ours.items():
        m = maps[cls] = {'armor': {}, 'weapon': {}, 'shield': {}, 'helmet': {}, 'cape': {}}
        av = {v: iid for v, iid in POOL['armor'][cls]}
        for v, iid in POOL['armor'][cls]:
            c = tex_for(catalog, iid, 'armor')
            if c:
                variants[cls][('armor', v)] = (c['tid'], iid, names.get(str(iid), '') or c['tex'])

        def wadd(iid, kind='weapon'):
            c = tex_for(catalog, iid, kind)
            if not c:
                return None
            v = f'{iid}'
            variants[cls][(kind, v)] = (c['tid'], iid, names.get(str(iid), '') or c['tex'])
            return v

        def by_name(kind, name):
            for c in catalog:
                if c['name'] == name and tex_for(catalog, int(c['id']), kind):
                    return wadd(int(c['id']), kind)
            return None

        def pow_of(x, n):
            return x['raidPow'] if x['raidPow'] else (x['t'] + 1) * 12 / max(1, n)

        # armor: by power into a / c / b / d, crafted legends to l
        arm = g['armor']
        for x in arm:
            p = pow_of(x, len([y for y in arm if y['plain']]))
            v = 'a' if p <= 3 else 'c' if p <= 7 else 'b' if p <= 10 else 'd'
            m['armor'][f"t{x['t']}"] = v
            review.append((cls, 'armor', f"t{x['t']} {x['name']}", v, variants[cls].get(('armor', v), (0, 0, '-'))[2]))
        for kind in ('weapon', 'shield', 'helmet'):
            lst = g.get(kind, [])
            pl = [wadd(i, kind) for i in (POOL[kind][cls] if isinstance(POOL[kind], dict) else POOL[kind])]
            pl = [v for v in pl if v]
            for x in lst:
                v = by_name(kind, x['name'])
                if kind == 'weapon' and x['t'] == g['dragon']['tier']:
                    v = None
                if not v and pl:
                    p = pow_of(x, len([y for y in lst if y['plain']]))
                    v = pl[min(len(pl) - 1, int(p / 14.5 * len(pl)))]
                if v:
                    m[kind][f"t{x['t']}"] = v
                    review.append((cls, kind, f"t{x['t']} {x['name']}", v, variants[cls][(kind, v)][2]))
        # 용무기 by step
        for step in range(1, 11):
            iid = [i for s, i in DRAGON[cls] if s <= step][-1]
            v = wadd(iid)
            if v:
                m['weapon'][f'dragon{step}'] = v
                review.append((cls, 'weapon', g['dragon']['names'][step - 1], v, variants[cls][('weapon', v)][2]))
        # crafted specials
        for c in g['crafts']:
            kind = c['kind']
            v = None
            if kind == 'armor':
                v = 'l' if c['legend'] else ('d' if 'dragon' in c['id'] else None)
                if not v:
                    look = [x for x in arm if x['name'] == c['look']]
                    v = m['armor'].get(f"t{look[0]['t']}") if look else 'c'
            elif kind in ('weapon', 'shield'):
                # 연's own piece of that name (극' and 진' grades share a sheet), then the piece
                # it is forged from (…2 pieces from their first stage), then its look.
                bare = c['name'].replace("극'", '')
                v = by_name(kind, c['name']) or by_name(kind, bare) or by_name(kind, "진'" + bare)
                if not v and c['id'].endswith('2'):
                    v = m[kind].get(c['id'][:-1])
                v = v or by_name(kind, c['look'])
                if not v:
                    pl = [wadd(i, kind) for i in (POOL[kind][cls] if isinstance(POOL[kind], dict) else POOL[kind])]
                    pl = [x for x in pl if x]
                    v = pl[-1] if c['legend'] else pl[len(pl) // 2]
            elif kind == 'helmet':
                v = wadd(POOL['helmet'][cls][-1], 'helmet')
            if v:
                m[kind][c['id']] = v
            review.append((cls, kind, f"{c['id']} {c['name']}", v or '(none)',
                           variants[cls][(kind, v)][2] if v and (kind, v) in variants[cls] else '-'))

    os.makedirs(out, exist_ok=True)
    index = {}
    for cls in ours:
        hx = hair[f'{cls}_c']
        htex = int(hx['Hair_1000_'].split(':')[1])
        remap = dict(x.split('=') for x in hx['Hair_1000_'].split(':')[3].split(','))
        # Sprites of every texture this class uses, by frame number (hair by name).
        tids = {t for (_, _), (t, _, _) in variants[cls].items()} | {htex}
        bytex = {}
        for o in env.objects:
            if o.type.name != 'Sprite':
                continue
            n = o.peek_name()
            mm = re.fullmatch(r'(.+?)_(\d+)', n)
            if not mm:
                continue
            sp = None
            try:
                sp = o.read()
                tid = sp.m_RD.texture.path_id
            except Exception:
                continue
            if tid not in tids:
                continue
            if tid == htex:
                bytex[(tid, re.sub(r'^Hair_\d{4}', 'Hair', n))] = sp
            else:
                key = (tid, mm.group(2))
                if key not in bytex or mm.group(1).lower().endswith('_e'):
                    bytex[key] = sp
        # Evaluate the clips once.
        anim_frames = {}
        for key, cname in Y.ANIMS.items():
            fr, stop = Y.frames(clips[cname], parts)
            ts = [t for t, _ in fr] + [stop]
            ms = [max(40, int(round((ts[i + 1] - ts[i]) * 1000))) for i in range(len(fr))]
            anim_frames[key] = (fr, int(round(sum(ms) / len(ms))))
        imgs = {}

        def pic(sp):
            k = sp.object_reader.path_id
            if k not in imgs:
                imgs[k] = sp.image.convert('RGBA')
            return imgs[k]

        def place(slot_state, tmpl, alt, root):
            sp = alt or tmpl
            geo = tmpl if alt is not None and (int(alt.m_Rect.width), int(alt.m_Rect.height)) == (int(tmpl.m_Rect.width), int(tmpl.m_Rect.height)) else sp
            im = pic(sp)
            r = geo.m_Rect
            px, py = geo.m_Pivot.x * r.width, (1 - geo.m_Pivot.y) * r.height
            off = sp.m_RD.textureRectOffset
            px -= off.x
            py -= sp.m_Rect.height - off.y - im.height
            x, y = slot_state['pos']
            if root is not None:
                x += root[0]
                y += root[1]
            return (im, x - px, -y - py)

        def layer_of(kind, variant, st):
            """[(img, x, y)] of one layer in one frame state, or [] when the frame has none."""
            out_l = []
            root = st[0]['pos']
            for slot in LAYERS[kind]:
                k = crc.get(slot)
                s = st.get(k) if k is not None else None
                if not s or not s['active'] or s['sprite'] is None or not s['sprite'].path_id:
                    continue
                try:
                    tmpl = s['sprite'].read()
                except Exception:
                    continue
                n = tmpl.m_Name
                idx = n.rsplit('_', 1)[1]
                alt = None
                if kind in ('body',):
                    alt = None
                elif kind in ('back', 'head') and slot in ('Hair_b', 'Hair'):
                    if slot == 'Hair':
                        alt = bytex.get((htex, 'Hair_' + remap.get(idx, idx)))
                    else:
                        alt = bytex.get((htex, 'Hair_b_' + idx))
                    if alt is None:
                        continue
                elif kind in ('armor', 'helmet', 'shield', 'weapon'):
                    tid = variants[cls][(kind, variant)][0]
                    alt = bytex.get((tid, idx))
                    if alt is None:
                        continue
                out_l.append(place(s, tmpl, alt, root if k != 0 else None))
            return out_l

        # Every layer variant, every frame.
        lv = [('back', 'base'), ('body', 'base'), ('head', 'base')] + sorted(variants[cls])
        drawn = {}
        z = {}
        for key, (fr, ms) in anim_frames.items():
            z[key] = []
            for fi, (t, st) in enumerate(fr):
                orders = {}
                for kind, slots in LAYERS.items():
                    os_ = [st[crc[s]]['order'] for s in slots if s in crc and crc[s] in st
                           and st[crc[s]]['sprite'] is not None and st[crc[s]]['sprite'].path_id and st[crc[s]]['active']]
                    if os_:
                        orders[kind] = min(os_)
                z[key].append([k for k, _ in sorted(orders.items(), key=lambda kv: (kv[1], list(LAYERS).index(kv[0])))])
                for kind, variant in lv:
                    drawn[(kind, variant, key, fi)] = layer_of(kind, variant, st)
        # Common cell: everything drawn, all variants.
        allp = [p for v in drawn.values() for p in v]
        left = math.ceil(-min(x for _, x, _ in allp))
        top = math.ceil(-min(y for _, _, y in allp))
        cw = math.ceil(left + max(x + im.width for im, x, _ in allp))
        ch = math.ceil(top + max(y + im.height for im, _, y in allp))
        rows = list(anim_frames)
        ncol = max(len(anim_frames[k][0]) for k in rows)
        cdir = os.path.join(out, cls)
        os.makedirs(cdir, exist_ok=True)
        layers = {}
        for kind, variant in lv:
            sheet = Image.new('RGBA', (cw * ncol, ch * len(rows)))
            any_px = False
            for ri, key in enumerate(rows):
                for fi in range(len(anim_frames[key][0])):
                    for im, x, y in drawn[(kind, variant, key, fi)]:
                        sheet.alpha_composite(im, (fi * cw + int(round(left + x)), ri * ch + int(round(top + y))))
                        any_px = True
            if not any_px:
                continue
            fn = f'{kind}_{variant}.png'
            sheet.save(os.path.join(cdir, fn), optimize=True)
            nm = 'base' if variant == 'base' else variants[cls][(kind, variant)][2]
            layers.setdefault(kind, {})[variant] = {'file': f'{cls}/{fn}', 'cols': ncol, 'name': nm}
        index[cls] = {
            'cell': [cw, ch], 'foot': [left, top],
            'anims': {k: {'row': i, 'n': len(anim_frames[k][0]), 'ms': anim_frames[k][1], 'z': z[k]} for i, k in enumerate(rows)},
            'layers': layers, 'map': maps[cls],
        }
        print(cls, [cw, ch], {k: len(v) for k, v in layers.items()})
    json.dump(index, open(os.path.join(out, 'index.json'), 'w'), ensure_ascii=False, indent=0)
    with open(map_md, 'w') as f:
        f.write('# Our gear -> 바람의나라 연 look\n\n| class | kind | ours | variant | 연 item |\n|---|---|---|---|---|\n')
        for r in review:
            f.write('| ' + ' | '.join(str(x) for x in r) + ' |\n')


if __name__ == '__main__':
    main()
