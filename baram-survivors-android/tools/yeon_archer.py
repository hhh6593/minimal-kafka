#!/usr/bin/env python3
"""The 궁사 (바람의나라 연 Job_6) in layers, as tools/yeon_gear.py draws the other classes.

    yeon_archer.py UNITS ITEMS CATALOG_JSON GEAR_JSON YHERO2_DIR YITEMICON_DIR [HAIR_TEX_ID]

UNITS/ITEMS: Units.unity3d and Items.unity3d from 연's resources, un-XORed (tools/yeon_dexor.py).
CATALOG_JSON: the Items texture catalog yeon_gear.py reads (helmets and capes are found by it).
GEAR_JSON: {"archer": ...} as dumped from avatar.js/items.js (the same format as yeon_gear.py's).
The 궁사's sheets go to YHERO2_DIR/archer/ and its entry is merged into YHERO2_DIR/index.json;
its item icons go to YITEMICON_DIR/archer/ and YITEMICON_DIR/index.json.

How 연 draws a 궁사: the same Avatar_0001 rig and clips as every class, except the attack, which
is its own bow-draw clip (Avatar_0001_A_Atk_<dir>): a body of its own (Avatar_A_0001), the
armour's "_A" sheet (each 연 armour folder carries one: avatar_0001_a / item_803338_a), the
bow in the Weapon slot (Archer_Guide_Weapon_<n> -> the bow's Item_bow_E_<n>; frame 10 is the
arrow on the string, in Weapon_back) and the quiver in the Sheild slot (Quiver_0001_<n>). Out
of the attack the bow is held as any weapon (Item_0001_E_<n> -> Item_bow_E_<n>) and the quiver
rides on the back like a cape (its 56 cape_E frames, by the body frame - 21, in the Cape slot's
place and order). Item sheets are found by the item's folder in the bundle's container
(assets/patchresources/items/item_<id>/...), since their textures share names.

Variants: armour a<id>, bow <id>, quiver q<folder>, helmet and cape <id>; our tiers map to them
by name (연's own 궁포 and bows by the same name), else by the piece's power.
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
import yeon_gear as YG  # noqa: E402

CLS = 'archer'
ANIMS = dict(Y.ANIMS, atk_down='Avatar_0001_A_Atk_Down', atk_up='Avatar_0001_A_Atk_Up', atk_side='Avatar_0001_A_Atk_Side')
LAYERS = {
    'back': ['Hair_b'], 'body': ['Sprite'], 'armor': ['Skin'], 'head': ['Head', 'Hair'],
    'helmet': ['Hat', 'Hat_color'], 'shield': ['Sheild'], 'weapon': ['Weapon', 'Weapon_color', 'Weapon_back'],
    'cape': ['Cape'],
}
# 연's 궁포 by power (for the pieces without a 궁포 of their name), weakest first.
ARMOR_POOL = [(3, 221010), (5, 221017), (8, 221021), (10, 221023), (12, 221027), (14, 221052), (99, 221056)]
# The 용섬제N궁 line, 제일 to 제십 (a step without a worn sheet wears the one below).
DRAGON = [220022, 220028, 220033, 220048, 220049, 220050, 220080, 220083, 220085, 220086]
BOW_POOL = [220900, 220902, 220904, 220003, 220004, 220008, 220011, 220013, 220073, 220079, 220082, 220077]
HELMET_TIERS = {0: 2001, 1: 2005, 2: 2006, 3: 2007, 4: 2008, 5: 2014, 6: 223014}
HELMET_POOL = [223003, 223005, 223013, 223011]
CAPE_TIERS = {0: 85002, 1: 4055, 2: 504001, 3: 504007, 4: 504021, 5: 803626}
CAPE_CRAFT = {'cr_gold_cape': 504021, 'cr_steel_cape': 234000}
HAIR_TEX = -7544038107747158637
CAPE_OFFSET = 21


def main():
    units, items, cat_path, gear_path, out, icon_out = sys.argv[1:7]
    htex = int(sys.argv[7]) if len(sys.argv) > 7 else HAIR_TEX
    remap = {'0': '2', '2': '0'}
    catalog = json.load(open(cat_path))
    g = json.load(open(gear_path))[CLS]
    names_of = {c['id']: c['name'] for c in catalog if c['id'] and c['name']}
    env = UnityPy.load(units, items)
    parts, clips = Y.build(env)
    crc = {v['name']: k for k, v in parts.items()}

    # Item folders: item id -> {file: texture path id}.
    folders = {}
    for path, obj in env.container.items():
        m = re.search(r'/items/item_([^/]+)/([^/]+)$', path)
        if not m or obj.type.name != 'Sprite':
            continue
        folders.setdefault(m.group(1), {})[m.group(2)] = obj.read().m_RD.texture.path_id

    def ftex(iid, kind):
        f = folders.get(str(iid), {})
        if kind == 'armor':
            return f.get('avatar_0001.png'), next((t for n, t in f.items() if n.endswith('_a.png') and '_a_b' not in n), None)
        if kind == 'weapon':
            return f.get('item_bow_e.png'), None
        if kind == 'shield':
            return f.get('item_quiver_ex_e.png'), None
        if kind == 'cape':
            e = next((t for n, t in f.items() if n.endswith('_e.png')), None)
            a = next((t for n, t in f.items() if n.endswith('_a.png') and '_b_' not in n), None)
            if e is None:
                c = YG.tex_for(catalog, iid, 'cape')
                e = c and c['tid']
            if a is None:
                a = next((c['tid'] for c in catalog if c['id'] == str(iid) and c['tex'].lower() == f'item_{iid}_a'), None)
            return e, a
        if kind == 'helmet':
            c = YG.tex_for(catalog, iid, 'helmet')
            return (c and c['tid']), None
        return None, None

    variants = {}  # (kind, v) -> (E tex, A tex, item id, name)
    m = {k: {} for k in ('armor', 'weapon', 'shield', 'helmet', 'cape')}

    def add(kind, iid, v=None):
        e, a = ftex(iid, kind)
        if not e:
            return None
        v = v or ({'armor': 'a', 'shield': 'q'}.get(kind, '') + str(iid))
        variants[(kind, v)] = (e, a, iid, names_of.get(str(iid), ''))
        return v

    # Item names (Strings) -> ids, for 연's pieces of our names.
    by_name = {}
    for c in catalog:
        if c['id'] and c['name']:
            by_name.setdefault(c['name'], int(c['id']))
    for iid in list(folders):
        if iid.isdigit() and int(iid) not in by_name.values():
            pass
    strings = json.load(open(os.path.join(os.path.dirname(cat_path), 'item_names.json'))) \
        if os.path.exists(os.path.join(os.path.dirname(cat_path), 'item_names.json')) else {}
    for i, n in strings.items():
        by_name.setdefault(n, int(i))

    def pick_pool(pool, p):
        for lim, iid in pool:
            if p <= lim:
                return iid
        return pool[-1][1]

    # armour
    for x in g['armor']:
        v = None
        if x['name'] in by_name:
            v = add('armor', by_name[x['name']])
        v = v or add('armor', pick_pool(ARMOR_POOL, x['pow']))
        m['armor'][f"t{x['t']}"] = v
    # bows
    bows = [b for b in (add('weapon', i) for i in BOW_POOL) if b]
    for x in g['weapon']:
        if x['t'] == g['dragon']['tier']:
            continue
        v = add('weapon', by_name[x['name']]) if x['name'] in by_name else None
        m['weapon'][f"t{x['t']}"] = v or bows[min(len(bows) - 1, int(x['pow'] / 14.5 * len(bows)))]
    last = None
    for step, iid in enumerate(DRAGON, 1):
        v = add('weapon', iid) or last
        last = v
        m['weapon'][f'dragon{step}'] = v
    m['weapon'][f"t{g['dragon']['tier']}"] = m['weapon']['dragon1']
    # quivers, by power over every quiver sheet
    qs = sorted(k for k, f in folders.items() if 'item_quiver_ex_e.png' in f and k.isdigit())
    quivers = [add('shield', int(k), 'q' + k) for k in qs]
    for x in g['shield']:
        m['shield'][f"t{x['t']}"] = quivers[min(len(quivers) - 1, int(x['pow'] / 17 * len(quivers)))]
    # helmets and capes
    hpool = [h for h in (add('helmet', i) for i in HELMET_POOL) if h]
    for x in g['helmet']:
        v = add('helmet', HELMET_TIERS[x['t']]) if x['t'] in HELMET_TIERS else None
        m['helmet'][f"t{x['t']}"] = v or hpool[min(len(hpool) - 1, max(0, x['pow'] - 7))]
    for x in g['cape']:
        v = add('cape', CAPE_TIERS[x['t']]) if x['t'] in CAPE_TIERS else None
        m['cape'][f"t{x['t']}"] = v or add('cape', 803626)
    # crafted pieces: their own name, then their look's tier, then by power
    for c in g['crafts']:
        kind, v = c['kind'], None
        if kind == 'cape':
            v = add('cape', CAPE_CRAFT.get(c['id'], 803626))
        elif kind == 'helmet':
            v = hpool[min(len(hpool) - 1, max(0, c['pow'] - 10))]
        elif c['name'] in by_name:
            v = add(kind, by_name[c['name']])
        if not v:
            look = [x for x in g[kind] if x['name'] == c['look']]
            v = m[kind].get(f"t{look[0]['t']}") if look else None
        if not v and kind == 'armor':
            v = add('armor', pick_pool(ARMOR_POOL, c['pow']))
        if v:
            m[kind][c['id']] = v
            for x in g[kind]:
                if x['name'] == c['look'] and not x['plain']:
                    m[kind][f"t{x['t']}"] = v
    print('variants', len(variants))

    # Sprites of every texture used, by frame number (hair by name).
    tids = {e for e, a, _, _ in variants.values()} | {a for e, a, _, _ in variants.values() if a} | {htex}
    bytex = {}
    for o in env.objects:
        if o.type.name != 'Sprite':
            continue
        n = o.peek_name()
        mm = re.fullmatch(r'(.+?)_(\d+)', n)
        if not mm:
            continue
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
            if key not in bytex or '_color' not in n.lower():
                bytex[key] = sp

    anim_frames = {}
    for key, cname in ANIMS.items():
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

    def place(s, tmpl, alt, root):
        sp = alt or tmpl
        geo = tmpl if alt is not None and (int(alt.m_Rect.width), int(alt.m_Rect.height)) == (int(tmpl.m_Rect.width), int(tmpl.m_Rect.height)) else sp
        im = pic(sp)
        r = geo.m_Rect
        px, py = geo.m_Pivot.x * r.width, (1 - geo.m_Pivot.y) * r.height
        off = sp.m_RD.textureRectOffset
        px -= off.x
        py -= sp.m_Rect.height - off.y - im.height
        x, y = s['pos']
        if root is not None:
            x += root[0]
            y += root[1]
        return (im, x - px, -y - py)

    def body_frame(st):
        b = st[0]['sprite']
        if b is None or not b.path_id:
            return None, None
        n = b.read().m_Name
        i = n.rsplit('_', 1)[1]
        if not i.isdigit():
            return None, None  # the ghost (Avatar_0001_Dead)
        return ('A' if n.startswith('Avatar_A_') else 'E'), int(i)

    def slot(st, name):
        k = crc.get(name)
        s = st.get(k) if k is not None else None
        return k, s

    def template(s):
        if not s or not s['active'] or s['sprite'] is None or not s['sprite'].path_id:
            return None
        try:
            return s['sprite'].read()
        except Exception:
            return None

    def layer_of(kind, variant, st):
        out_l, orders = [], []
        root = st[0]['pos']
        bk, bi = body_frame(st)
        e_tex, a_tex = (variants[(kind, variant)][:2]) if (kind, variant) in variants else (None, None)
        if kind == 'shield':
            k, s = slot(st, 'Sheild')
            t = template(s)
            if t is not None and t.m_Name.startswith('Quiver_'):
                alt = bytex.get((e_tex, t.m_Name.rsplit('_', 1)[1]))
                if alt is not None:
                    out_l.append(place(s, t, alt, root))
                    orders.append(s['order'])
            elif bk == 'E' and bi is not None:
                k, s = slot(st, 'Cape')
                alt = bytex.get((e_tex, str(bi - CAPE_OFFSET)))
                if s and s['active'] and alt is not None:
                    out_l.append(place(s, alt, alt, root))
                    orders.append(s['order'])
            return out_l, orders
        if kind == 'cape':
            k, s = slot(st, 'Cape')
            if not s or not s['active'] or bi is None:
                return out_l, orders
            if bk == 'A':
                if a_tex is None:
                    return out_l, orders
                n = sum(1 for (t, _) in bytex if t == a_tex)
                alt = bytex.get((a_tex, str(bi if n >= 6 else bi // 2)))
            else:
                alt = bytex.get((e_tex, str(bi - CAPE_OFFSET)))
            if alt is not None:
                out_l.append(place(s, alt, alt, root))
                orders.append(s['order'])
            return out_l, orders
        for name in LAYERS[kind]:
            k, s = slot(st, name)
            tmpl = template(s)
            if tmpl is None:
                continue
            n = tmpl.m_Name
            idx = n.rsplit('_', 1)[1]
            alt = None
            if kind == 'body':
                alt = None
            elif kind in ('back', 'head') and name in ('Hair_b', 'Hair'):
                alt = bytex.get((htex, 'Hair_' + remap.get(idx, idx))) if name == 'Hair' else bytex.get((htex, 'Hair_b_' + idx))
                if alt is None:
                    continue
            elif kind == 'armor':
                alt = bytex.get(((a_tex if '_A_' in n else e_tex), idx))
                if alt is None:
                    continue
            elif kind in ('helmet', 'weapon'):
                alt = bytex.get((e_tex, idx))
                if alt is None:
                    continue
            # A bow keeps its own pivot (its grip): the sword template it stands in for has the
            # same 64-pixel rect but a pivot at the blade's hilt, which would throw the bow off.
            geo = alt if kind == 'weapon' and alt is not None else tmpl
            out_l.append(place(s, geo, alt, root if k != 0 else None))
            orders.append(s['order'])
        return out_l, orders

    lv = [('back', 'base'), ('body', 'base'), ('head', 'base')] + sorted(variants)
    drawn, z = {}, {}
    for key, (fr, ms) in anim_frames.items():
        z[key] = []
        for fi, (t, st) in enumerate(fr):
            orders = {}
            for kind, variant in lv:
                pics, os_ = layer_of(kind, variant, st)
                drawn[(kind, variant, key, fi)] = pics
                if os_:
                    orders[kind] = min(os_ + [orders.get(kind, 1e9)])
            # A kind no variant draws in this frame still gets its place from its slot.
            for kind in ('shield', 'cape', 'weapon', 'helmet', 'armor'):
                if kind not in orders:
                    for name in LAYERS[kind] + (['Cape'] if kind == 'shield' else []):
                        k, s = slot(st, name)
                        if s and s['active']:
                            orders[kind] = s['order']
                            break
            z[key].append([k for k, _ in sorted(orders.items(), key=lambda kv: (kv[1], list(LAYERS).index(kv[0])))])
    allp = [p for v in drawn.values() for p in v]
    left = math.ceil(-min(x for _, x, _ in allp))
    top = math.ceil(-min(y for _, _, y in allp))
    cw = math.ceil(left + max(x + im.width for im, x, _ in allp))
    ch = math.ceil(top + max(y + im.height for im, _, y in allp))
    rows = list(anim_frames)
    ncol = max(len(anim_frames[k][0]) for k in rows)
    cdir = os.path.join(out, CLS)
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
        nm = 'base' if variant == 'base' else variants[(kind, variant)][3]
        layers.setdefault(kind, {})[variant] = {'file': f'{CLS}/{fn}', 'cols': ncol, 'name': nm}
    # Every map entry must name a drawn layer.
    for kind in m:
        m[kind] = {k: v for k, v in m[kind].items() if v and v in layers.get(kind, {})}
    # The class card's picture: the front idle frame in the first armour and bow.
    row = rows.index('idle_down')
    portrait = Image.new('RGBA', (cw, ch))
    want = {'back': 'base', 'body': 'base', 'head': 'base', 'armor': m['armor']['t0'], 'weapon': m['weapon']['t0']}
    for kind in z['idle_down'][0]:
        v = want.get(kind)
        if v and v in layers.get(kind, {}):
            sh = Image.open(os.path.join(out, layers[kind][v]['file']))
            portrait.alpha_composite(sh.crop((0, row * ch, cw, (row + 1) * ch)))
    if 'back' in want and 'back' not in z['idle_down'][0] and 'back' in layers:
        pass
    portrait = portrait.crop(portrait.getbbox())
    portrait.save(os.path.join(cdir, 'portrait.png'), optimize=True)
    entry = {
        'cell': [cw, ch], 'foot': [left, top],
        'anims': {k: {'row': i, 'n': len(anim_frames[k][0]), 'ms': anim_frames[k][1], 'z': z[k]} for i, k in enumerate(rows)},
        'layers': layers, 'map': m, 'portrait': f'{CLS}/portrait.png',
    }
    ip = os.path.join(out, 'index.json')
    index = json.load(open(ip)) if os.path.exists(ip) else {}
    index[CLS] = entry
    json.dump(index, open(ip, 'w'), ensure_ascii=False, indent=0)
    print(CLS, [cw, ch], {k: len(v) for k, v in layers.items()})

    # 연's own icons of the pieces: the single sprite of the texture "Item_<id>".
    want_icons = {variants[(k, v)][2] for k in m for v in m[k].values() if (k, v) in variants and k != 'shield'}
    icons = {}
    for o in env.objects:
        if o.type.name != 'Sprite':
            continue
        n = o.peek_name()
        mm = re.fullmatch(r'[Ii]tem_(\d+)', n)
        if not mm or int(mm.group(1)) not in want_icons:
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
        old = icons.get(int(mm.group(1)))
        if old is None or im.width * im.height > old.width * old.height:
            icons[int(mm.group(1))] = im
    os.makedirs(os.path.join(icon_out, CLS), exist_ok=True)
    iidx = {}
    missing = set()
    for kind, mm_ in m.items():
        if kind == 'shield':
            continue
        for key, v in mm_.items():
            iid = variants[(kind, v)][2]
            im = icons.get(iid)
            back = iid
            while im is None and key.startswith('dragon') and back > DRAGON[0]:
                back = max(d for d in DRAGON if d < back)
                im = icons.get(back)
            if im is None:
                missing.add(iid)
                continue
            fn = f'{CLS}/{kind}_{key}.png'
            im.save(os.path.join(icon_out, fn), optimize=True)
            iidx.setdefault(kind, {})[key] = fn
    jp = os.path.join(icon_out, 'index.json')
    ji = json.load(open(jp)) if os.path.exists(jp) else {}
    ji[CLS] = iidx
    json.dump(ji, open(jp, 'w'), indent=0)
    print('icons', sum(len(v) for v in iidx.values()), 'missing', sorted(missing))


if __name__ == '__main__':
    main()
