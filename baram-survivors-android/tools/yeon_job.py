#!/usr/bin/env python3
"""바람의나라 연's other jobs in layers, as tools/yeon_archer.py draws the 궁사.

    yeon_job.py CLASS UNITS ITEMS CATALOG_JSON GEAR_JSON YHERO2_DIR YITEMICON_DIR

CLASS: a key of JOBS below (lancer = 무사, fighter = 격투가, ...).
UNITS/ITEMS: Units.unity3d and Items.unity3d from 연's resources, un-XORed (tools/yeon_dexor.py).
CATALOG_JSON: the Items texture catalog yeon_gear.py reads (helmets and capes are found by it);
an item_names.json (id -> Strings name) beside it lets our pieces find 연's by name.
GEAR_JSON: {CLASS: ...} as dumped from avatar.js/items.js (the format yeon_archer.py reads).
The sheets go to YHERO2_DIR/<CLASS>/ and the class's entry is merged into YHERO2_DIR/index.json
(the other classes' entries are kept as they are); item icons to YITEMICON_DIR/<CLASS>/.

Every job wears the same Avatar_0001 rig as the 궁사 (body, head, hair, armour "Skin", helmet,
cape); what differs is the weapon and the clips:

  weapon "spear" (무사): the spear is not keyed by any clip. 연 lays an item prefab of its own
    (Weapon_Spear, sorting 16, in front; Weapon_Spear_Back, -4, behind) at the weapon slot's
    place (-8, -6) and picks its frame in code. The spear sheets (spear_0001_f / _b, every frame
    the same 114x100 rect, its position baked in) run, by direction down, side, up: the held
    spear (k frames each: 1, or 6 for the shimmering ones), the thrust (m each), the sweep (s
    each). The attack is Avatar_0001_Attack_Spear_<dir> (bodies 69-74) with the thrust.
  weapon "template" (격투가): the clips key guide sprites (Fighter_Guide_Weapon_A/B_<n>) in the
    Weapon and Weapon_back slots; the worn item has the same frames by number
    (fighter_weapon_0001_a / _b). The 격투가 walks, stands, strikes and casts with its own F_
    clips, body (Avatar_F_0001) and the armour's "_f" sheet.
  weapon "standard": the warrior's way, Item_0001_E_<n> -> the item's E sheet.

Layers: back, body, armor, head, helmet, wback (what of the weapon goes behind the body),
cape, shield, weapon. Pieces of our lines map to 연's by name, else by power (pools below).
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

HAIR_TEX = -7544038107747158637
CAPE_OFFSET = 21
# Shared by every class (as the 궁사 wears them): 연's helmet and cape lines by our tiers.
HELMET_TIERS = {0: 2001, 1: 2005, 2: 2006, 3: 2007, 4: 2008, 5: 2014}
CAPE_TIERS = {0: 85002, 1: 4055, 2: 504001, 3: 504007, 4: 504021, 5: 803626}
CAPE_CRAFT = {'cr_gold_cape': 504021}

JOBS = {
    # 무사 (Job_7): 경갑 (241xxx), 창 (240xxx), 용무제N창, 용무 helmets (243xxx), 신창의망토 (254xxx).
    'lancer': {
        'anims': dict(Y.ANIMS, atk_down='Avatar_0001_Attack_Spear_Down', atk_up='Avatar_0001_Attack_Spear_Up',
                      atk_side='Avatar_0001_Attack_Spear_Side'),
        'weapon': 'spear',
        'armor_pool': [(3, 241000), (5, 241004), (8, 241007), (10, 241010), (12, 241013), (99, 241017)],
        'dragon': [240029, 240035, 240040, 240051, 240052, 240075, 240084, 240087, 240089, 240090],
        'weapon_pool': [240000, 240001, 240002, 240003, 240004, 240005, 240006, 240007, 240008, 240010, 240011,
                        240013, 240015, 240016, 240018, 240020, 240022, 240024, 240025, 240073],
        'dragon_helmet': 243024,
        'helmet_pool': [243030, 243031, 243000, 243034],
        'cape_craft': {'cr_steel_cape': 254000},
    },
    # 격투가 (Job_5): its own F_ clips and body, 대련복 (61xxx, their "_f" sheets), 권갑 (60xxx:
    # fighter_weapon_0001_a in the Weapon slot, _b in Weapon_back), 용비제N권갑, 용비 helmets, 권신의망토.
    'monk': {
        'anims': {**{f'{a}_{d}': f'Avatar_0001_F_{c}_{d.capitalize()}' for a, c in (('walk', 'Walk'), ('idle', 'Idle'), ('cast', 'Spell'))
                     for d in ('down', 'up', 'side')},
                  **{f'atk_{d}': f'Avatar_0001_F_Attack_{d.capitalize()}_A' for d in ('down', 'up', 'side')},
                  'dead': 'Avatar_0001_Dead'},
        'weapon': 'template', 'weapon_files': ('fighter_weapon_0001_a.png', 'fighter_weapon_0001_b.png'),
        'body': 'F',
        'armor_pool': [(3, 61001), (5, 61005), (8, 61008), (10, 61010), (12, 61013), (99, 61017)],
        'dragon': [60022, 60028, 60033, 60048, 60049, 60050, 60078, 60081, 60083, 60084],
        'weapon_pool': [60900, 60901, 60000, 60001, 60003, 60004, 60006, 60008, 60009, 60011, 60013, 60015,
                        60017, 60018, 60019, 60021, 60040, 60045, 60065],
        'dragon_helmet': 63024,
        'helmet_pool': [63022, 63029, 63030],
        'cape_craft': {'cr_steel_cape': 66000},
    },
    # 마도사 (Job_11): the warrior's clips; 현복 (331xxx); 단봉 (330xxx, weapon_0001: its frames are
    # picked in code, read here from the pictures, see wand_table), 용화제N단봉, 용화 helmets, 마선사의망토.
    'magus': {
        'anims': dict(Y.ANIMS),
        'weapon': 'wand', 'weapon_file': 'weapon_0001.png',
        'armor_pool': [(3, 331001), (5, 331005), (8, 331008), (10, 331010), (12, 331014), (99, 331013)],
        'dragon': [330030, 330036, 330041, 330052, 330053, 330077, 330088, 330100, 330101, 330102],
        'weapon_pool': [330001, 330002, 330003, 330004, 330005, 330006, 330007, 330008, 330009, 330011, 330012,
                        330014, 330016, 330017, 330019, 330021, 330023, 330025, 330026, 330027, 330029],
        'dragon_helmet': 333025,
        'helmet_pool': [333031, 333032, 333035, 333036],
        'cape_craft': {'cr_steel_cape': 344001},
    },
    # 천인 (Job_8): the warrior's clips; 천의 (261xxx); 호리병·포 (260xxx): the item's own prefab lays
    # Weapon (22) and Weapon_back (-12) at the root, held from item_0001_i, striking from
    # item_0001_atk_f/_b, each in thirds by direction. 용주제N도, 용주 helmets.
    'celestial': {
        'anims': dict(Y.ANIMS),
        'weapon': 'gourd', 'weapon_files': ('item_0001_i.png', 'item_0001_atk_f.png', 'item_0001_atk_b.png'), 'orders': (22, -12),
        'armor_pool': [(3, 261000), (5, 261004), (8, 261007), (10, 261010), (12, 261013), (99, 261017)],
        'dragon': [260029, 260035, 260040, 260051, 260052, 260075, 260086, 260089, 260091, 260092],
        'weapon_pool': [260000, 260001, 260002, 260003, 260004, 260005, 260006, 260007, 260008, 260010, 260011,
                        260013, 260015, 260016, 260018, 260020, 260022, 260024, 260025, 260026, 260028],
        'dragon_helmet': 263024,
        'helmet_pool': [263030, 263031, 263000],
    },
    # 도깨비 (Job_9): the warrior's clips; 귀의 (281xxx); 방망이·퇴 (280xxx) laid as the 천인's are, by its own
    # prefab (Weapon 18, Weapon_back -8), held from item_0001_idle or else the strike's first frame.
    # 용린제N퇴, 용린 helmets, 신각의인화.
    'dokkaebi': {
        'anims': dict(Y.ANIMS),
        'weapon': 'gourd', 'weapon_files': ('item_0001_idle.png', 'item_0001_atk_f.png', 'item_0001_atk_b.png'), 'orders': (18, -8),
        'armor_pool': [(3, 281000), (5, 281004), (8, 281007), (10, 281010), (12, 281013), (99, 281017)],
        'dragon': [280029, 280035, 280040, 280051, 280052, 280075, 280086, 280089, 280091, 280092],
        'weapon_pool': [280000, 280001, 280002, 280003, 280004, 280005, 280006, 280007, 280008, 280010, 280011,
                        280013, 280015, 280016, 280018, 280020, 280022, 280024, 280025, 280026, 280028],
        'dragon_helmet': 283024,
        'helmet_pool': [283030, 283031, 283000],
        'cape_craft': {'cr_steel_cape': 294000},
    },
    # 차사 (Job_10): the warrior's clips; 흑의 (311xxx); 백도·명도 (310xxx, weapon_0001_e in the Weapon slot,
    # frames read as the 마도사's 단봉 are); 용라제N명도 (연 has no 제십, and its 제구 sheet has no sweeps
    # to read: both wear the 제팔), 용라 helmets,
    # 월직의망토.
    'reaper': {
        'anims': dict(Y.ANIMS),
        'weapon': 'wand', 'weapon_file': 'weapon_0001_e.png',
        'armor_pool': [(3, 311001), (5, 311005), (8, 311008), (10, 311011), (12, 311014), (99, 311013)],
        'dragon': [310045, 310050, 310055, 310060, 310065, 310070, 310075, 310076, 310076, 310076],
        'weapon_pool': [310001, 310002, 310003, 310004, 310005, 310006, 310007, 310008, 310009, 310010, 310011,
                        310013, 310014, 310015, 310016, 310017, 310019, 310020, 310021, 310022, 310024],
        'dragon_helmet': 313023,
        'helmet_pool': [313026, 313027, 313001],
        'cape_craft': {'cr_steel_cape': 324001},
    },
}


def spear_layout(n):
    """(k, m, s): held, thrust and sweep frames per direction of an n-frame spear sheet."""
    for k, m, s in ((1, 2, 3), (1, 3, 3), (6, 3, 3), (6, 3, 4)):
        if 3 * (k + m + s) == n:
            return k, m, s
    return None


def main():
    cls, units, items, cat_path, gear_path, out, icon_out = sys.argv[1:8]
    J = JOBS[cls]
    htex = HAIR_TEX
    remap = {'0': '2', '2': '0'}
    catalog = json.load(open(cat_path))
    g = json.load(open(gear_path))[cls]
    names_of = {c['id']: c['name'] for c in catalog if c['id'] and c['name']}
    env = UnityPy.load(units, items)
    parts, clips = Y.build(env)
    crc = {v['name']: k for k, v in parts.items()}
    anims = J['anims']

    # Item folders: item id -> {file: texture path id}.
    folders = {}
    for path, obj in env.container.items():
        m = re.search(r'/items/item_([^/]+)/([^/]+)$', path)
        if not m or obj.type.name != 'Sprite':
            continue
        folders.setdefault(m.group(1), {})[m.group(2)] = obj.read().m_RD.texture.path_id
    # Frames per texture (the spear sheets' layout is read from their count).
    tex_n = {}
    for o in env.objects:
        if o.type.name == 'Sprite':
            try:
                sp = o.read()
            except Exception:
                continue
            if sp.m_Name.rsplit('_', 1)[-1].isdigit():
                t = sp.m_RD.texture.path_id
                tex_n[t] = tex_n.get(t, 0) + 1

    def ftex(iid, kind):
        """{letter: texture} of the item's worn sheets for a kind."""
        f = folders.get(str(iid), {})
        if kind == 'armor':
            return {'E': f.get('avatar_0001.png'), 'F': f.get('avatar_0001_f.png'),
                    'A': next((t for n, t in f.items() if n.endswith('_a.png') and '_a_b' not in n), None)}
        if kind == 'weapon':
            if J['weapon'] == 'spear':
                fr, bk = f.get('spear_0001_f.png'), f.get('spear_0001_b.png')
                if not fr or not bk or not spear_layout(tex_n.get(fr, 0)) or tex_n.get(fr) != tex_n.get(bk):
                    return {}
                return {'F': fr, 'B': bk}
            if J['weapon'] == 'template':
                fr, bk = (f.get(n) for n in J['weapon_files'])
                return {'E': fr, 'B': bk} if fr and bk else {}
            if J['weapon'] == 'wand':
                return {'E': f.get(J['weapon_file'])}
            if J['weapon'] == 'gourd':
                i, fr, bk = (f.get(n) for n in J['weapon_files'])
                if not (fr and bk) or (i and tex_n.get(i, 0) % 3) or tex_n.get(fr, 0) % 3 or tex_n.get(fr) != tex_n.get(bk):
                    return {}
                return {'I': i, 'F': fr, 'B': bk}
            return {}
        if kind == 'cape':
            e = next((t for n, t in f.items() if n.endswith('_e.png') and 'cape' in n), None) \
                or next((t for n, t in f.items() if n.endswith('_e.png')), None)
            a = next((t for n, t in f.items() if n.endswith('_a.png') and '_b_' not in n), None)
            if e is None:
                c = YG.tex_for(catalog, iid, 'cape')
                e = c and c['tid']
            if a is None:
                a = next((c['tid'] for c in catalog if c['id'] == str(iid) and c['tex'].lower() == f'item_{iid}_a'), None)
            # The 격투가's own body frames (51) have a sheet of their own, by the same numbers.
            fs = next((t for n, t in f.items() if n.endswith('_f.png') and tex_n.get(t) == 51), None) \
                or next((c['tid'] for c in catalog if c['id'] == str(iid) and c['tex'].lower() == f'item_{iid}_f' and c['n'] == 51), None)
            return {'E': e, 'A': a, 'F': fs}
        if kind == 'helmet':
            c = YG.tex_for(catalog, iid, 'helmet')
            if c is None:
                t = f.get('item_hat_e.png') or next((t for n, t in f.items() if n.endswith('_e.png')), None)
                return {'E': t}
            return {'E': c['tid']}
        return {}

    variants = {}  # (kind, v) -> ({letter: tex}, item id, name)
    m = {k: {} for k in ('armor', 'weapon', 'shield', 'helmet', 'cape')}

    def add(kind, iid, v=None):
        tx = ftex(iid, kind)
        if not any(tx.values()):
            return None
        # A piece without the sheet the class's body needs would leave the figure bare.
        if kind in ('armor', 'cape') and J.get('body') and not tx.get(J['body']):
            return None
        v = v or ({'armor': 'a'}.get(kind, '') + str(iid))
        variants[(kind, v)] = (tx, iid, names_of.get(str(iid), ''))
        return v

    by_name = {}
    for c in catalog:
        if c['id'] and c['name']:
            by_name.setdefault(c['name'], int(c['id']))
    np_ = os.path.join(os.path.dirname(cat_path), 'item_names.json')
    strings = json.load(open(np_)) if os.path.exists(np_) else {}
    for i, n in strings.items():
        if i.isdigit():
            by_name.setdefault(n, int(i))

    def pick_pool(pool, p):
        for lim, iid in pool:
            if p <= lim:
                return iid
        return pool[-1][1]

    for x in g['armor']:
        v = add('armor', by_name[x['name']]) if x['name'] in by_name else None
        m['armor'][f"t{x['t']}"] = v or add('armor', pick_pool(J['armor_pool'], x['pow']))
    wpool = [w for w in (add('weapon', i) for i in J['weapon_pool']) if w]
    for x in g['weapon']:
        if x['t'] == g['dragon']['tier']:
            continue
        v = add('weapon', by_name[x['name']]) if x['name'] in by_name else None
        m['weapon'][f"t{x['t']}"] = v or wpool[min(len(wpool) - 1, int(x['pow'] / 14.5 * len(wpool)))]
    last = None
    for step, iid in enumerate(J['dragon'], 1):
        v = add('weapon', iid) or last
        last = v
        m['weapon'][f'dragon{step}'] = v
    m['weapon'][f"t{g['dragon']['tier']}"] = m['weapon']['dragon1']
    hpool = [h for h in (add('helmet', i) for i in J['helmet_pool']) if h]
    for x in g['helmet']:
        iid = HELMET_TIERS.get(x['t'], J['dragon_helmet'] if x['t'] == len(HELMET_TIERS) else None)
        v = add('helmet', iid) if iid else None
        m['helmet'][f"t{x['t']}"] = v or hpool[min(len(hpool) - 1, max(0, x['pow'] - 7))]
    for x in g['cape']:
        v = add('cape', CAPE_TIERS[x['t']]) if x['t'] in CAPE_TIERS else None
        m['cape'][f"t{x['t']}"] = v or add('cape', 803626)
    cape_craft = dict(CAPE_CRAFT, **J.get('cape_craft', {}))
    for c in g['crafts']:
        kind, v = c['kind'], None
        if kind == 'shield' and not J.get('shield'):
            continue
        if kind == 'cape':
            v = add('cape', cape_craft.get(c['id'], 803626))
        elif kind == 'helmet':
            v = hpool[min(len(hpool) - 1, max(0, c['pow'] - 10))]
        elif c['name'] in by_name:
            v = add(kind, by_name[c['name']])
        if not v:
            look = [x for x in g[kind] if x['name'] == c['look']]
            v = m[kind].get(f"t{look[0]['t']}") if look else None
        if not v and kind == 'armor':
            v = add('armor', pick_pool(J['armor_pool'], c['pow']))
        if v:
            m[kind][c['id']] = v
            for x in g[kind]:
                if x['name'] == c['look'] and not x['plain']:
                    m[kind][f"t{x['t']}"] = v
    print('variants', len(variants))

    # Sprites of every texture used, by frame number (hair by name).
    tids = {t for tx, _, _ in variants.values() for t in tx.values() if t} | {htex}
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
    for key, cname in anims.items():
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

    def place(pos, tmpl, alt, root):
        sp = alt or tmpl
        geo = tmpl if alt is not None and (int(alt.m_Rect.width), int(alt.m_Rect.height)) == (int(tmpl.m_Rect.width), int(tmpl.m_Rect.height)) else sp
        im = pic(sp)
        r = geo.m_Rect
        px, py = geo.m_Pivot.x * r.width, (1 - geo.m_Pivot.y) * r.height
        off = sp.m_RD.textureRectOffset
        px -= off.x
        py -= sp.m_Rect.height - off.y - im.height
        x, y = pos
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
            return None, None
        return ('A' if n.startswith('Avatar_A_') else 'F' if n.startswith('Avatar_F_') else 'E'), int(i)

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

    LAYERS = {'back': ['Hair_b'], 'body': ['Sprite'], 'armor': ['Skin'], 'head': ['Head', 'Hair'],
              'helmet': ['Hat', 'Hat_color'], 'wback': ['Weapon_back'], 'cape': ['Cape'], 'shield': ['Sheild'],
              'weapon': ['Weapon', 'Weapon_color']}
    WEAPON_POS = parts[crc['Weapon']]['pos']

    def spear_frame(key, fi, n_tex):
        k, mm_, s = spear_layout(n_tex)
        d = {'down': 0, 'side': 1, 'up': 2}[key.rsplit('_', 1)[1]] if '_' in key else 0
        if key.startswith('atk_'):
            return 3 * k + d * mm_ + min(fi, mm_ - 1)
        # Held: the shimmering spears run their six frames as the hero walks.
        return d * k + (fi % k)

    wand_cache = {}

    def wand_table(t):
        """A 단봉 sheet's frames by use, read from the pictures: the sweeps are the frames far larger than
        the rest, in three runs (down, side, up); the frame before each run is the wand held that way."""
        if t in wand_cache:
            return wand_cache[t]
        idx = sorted(int(i) for (tt, i) in bytex if tt == t and i.isdigit())
        area = {}
        for i in idx:
            b = pic(bytex[(t, str(i))]).getbbox()
            area[i] = (b[2] - b[0]) * (b[3] - b[1]) if b else 0
        small = sorted(a for a in area.values() if a)[:max(1, len(idx) // 2)]
        med = small[len(small) // 2] if small else 1
        runs, cur = [], []
        for i in idx:
            if area[i] > 2.5 * med:
                cur.append(i)
            elif cur:
                runs.append(cur)
                cur = []
        if cur:
            runs.append(cur)
        runs = [r for r in runs if r[0] - 1 in area and area[r[0] - 1] <= 2.5 * med]
        wand_cache[t] = [(r[0] - 1, r) for r in runs[:3]] if len(runs) >= 3 else None
        return wand_cache[t]

    def layer_of(kind, variant, st, key, fi):
        out_l, orders = [], []
        root = st[0]['pos']
        bk, bi = body_frame(st)
        tx = variants[(kind, variant)][0] if (kind, variant) in variants else {}
        if kind in ('weapon', 'wback') and J['weapon'] == 'spear':
            if key == 'dead' or not tx:
                return out_l, orders
            t = tx['F' if kind == 'weapon' else 'B']
            alt = bytex.get((t, str(spear_frame(key, fi, tex_n[t]))))
            if alt is not None:
                out_l.append(place(WEAPON_POS, alt, alt, root))
                orders.append(16 if kind == 'weapon' else -4)
            return out_l, orders
        if kind in ('weapon', 'wback') and J['weapon'] == 'gourd':
            # The item's own prefab: Weapon (sorting 22) and Weapon_back (-12) at the root, each sheet in
            # thirds by direction (down, side, up). Held, the idle sheet behind; striking, the attack's.
            if key == 'dead' or not tx:
                return out_l, orders
            d = {'down': 0, 'side': 1, 'up': 2}[key.rsplit('_', 1)[1]]
            if key.startswith('atk_'):
                t = tx['F' if kind == 'weapon' else 'B']
                k, nf = tex_n[t] // 3, len(anim_frames[key][0])
                f = d * k + round(fi * (k - 1) / max(1, nf - 1))
            elif kind == 'wback':
                # Held: the idle sheet, or, for an item without one (the 도깨비's plain 방망이), the first
                # frame of its strike, as its prefab's Weapon_back shows (Item_0001_Atk_b_0).
                t = tx['I'] or tx['B']
                k = tex_n[t] // 3
                f = d * k + (fi % k if tx['I'] else 0)
            else:
                return out_l, orders
            alt = bytex.get((t, str(f)))
            if alt is not None:
                out_l.append(place((0, 0), alt, alt, root))
                orders.append(J['orders'][0 if kind == 'weapon' else 1])
            return out_l, orders
        if kind == 'weapon' and J['weapon'] == 'wand':
            # The Weapon slot as the clip keys it (its place and order), the 단봉's own frame in it.
            k, s = slot(st, 'Weapon')
            tmpl = template(s)
            tab = wand_table(tx.get('E')) if tx.get('E') else None
            if tmpl is None or not tab:
                return out_l, orders
            d = {'down': 0, 'side': 1, 'up': 2}[key.rsplit('_', 1)[1]]
            held, sweep = tab[d]
            n = int(tmpl.m_Name.rsplit('_', 1)[1])
            f = held if not key.startswith('atk_') or n == 0 else sweep[0] if fi == 1 else sweep[-1]
            alt = bytex.get((tx['E'], str(f)))
            if alt is not None:
                out_l.append(place(s['pos'], alt, alt, root))
                orders.append(s['order'])
            return out_l, orders
        if kind == 'cape':
            k, s = slot(st, 'Cape')
            if not s or not s['active'] or bi is None:
                return out_l, orders
            if bk == 'F':
                alt = bytex.get((tx.get('F'), str(bi)))
            elif bk == 'A':
                if not tx.get('A'):
                    return out_l, orders
                n = sum(1 for (t, _) in bytex if t == tx['A'])
                alt = bytex.get((tx['A'], str(bi if n >= 6 else bi // 2)))
            else:
                alt = bytex.get((tx['E'], str(bi - CAPE_OFFSET)))
            if alt is not None:
                out_l.append(place(s['pos'], alt, alt, root))
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
                letter = 'A' if '_A_' in n else 'F' if n.startswith('Item_0000_F_') else 'E'
                alt = bytex.get((tx.get(letter), idx))
                if alt is None:
                    continue
            elif kind in ('helmet', 'weapon', 'wback', 'shield'):
                alt = bytex.get((tx.get('B' if kind == 'wback' else 'E'), idx))
                if alt is None:
                    continue
            out_l.append(place(s['pos'], tmpl, alt, root if k != 0 else None))
            orders.append(s['order'])
        return out_l, orders

    if J['weapon'] == 'wand':
        # A 단봉 whose sheet cannot be read (no three sweeps) gives way to the nearest readable one.
        good = [v for v in wpool if wand_table(variants[('weapon', v)][0].get('E'))]
        bad = {v for (k, v), val in variants.items() if k == 'weapon' and not wand_table(val[0].get('E'))}
        for key, v in list(m['weapon'].items()):
            if v in bad:
                i = wpool.index(v) if v in wpool else len(wpool) - 1
                m['weapon'][key] = min(good, key=lambda g: abs(wpool.index(g) - i))
        for v in bad:
            variants.pop(('weapon', v))
        print('unreadable wands', sorted(bad))
    lv = [('back', 'base'), ('body', 'base'), ('head', 'base')] + sorted(variants)
    if J['weapon'] in ('spear', 'template', 'gourd'):
        lv += [('wback', v) for (k, v) in sorted(variants) if k == 'weapon']
        for (k, v), val in list(variants.items()):
            if k == 'weapon':
                variants[('wback', v)] = val
    drawn, z = {}, {}
    KINDS = list(LAYERS)
    for key, (fr, ms) in anim_frames.items():
        z[key] = []
        for fi, (t, st) in enumerate(fr):
            orders = {}
            for kind, variant in lv:
                pics, os_ = layer_of(kind, variant, st, key, fi)
                drawn[(kind, variant, key, fi)] = pics
                if os_:
                    orders[kind] = min(os_ + [orders.get(kind, 1e9)])
            for kind in ('cape', 'weapon', 'helmet', 'armor'):
                if kind not in orders:
                    for name in LAYERS[kind]:
                        k, s = slot(st, name)
                        if s and s['active']:
                            orders[kind] = s['order']
                            break
            if J['weapon'] in ('spear', 'gourd'):
                orders.setdefault('weapon', 16 if J['weapon'] == 'spear' else J['orders'][0])
                orders.setdefault('wback', -4 if J['weapon'] == 'spear' else J['orders'][1])
            z[key].append([k for k, _ in sorted(orders.items(), key=lambda kv: (kv[1], KINDS.index(kv[0])))])
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
        nm = 'base' if variant == 'base' else variants[(kind, variant)][2]
        layers.setdefault(kind, {})[variant] = {'file': f'{cls}/{fn}', 'cols': ncol, 'name': nm}
    for kind in m:
        m[kind] = {k: v for k, v in m[kind].items() if v and v in layers.get(kind, {})}
    # The class card's picture: the front idle frame in the first armour and weapon.
    row = rows.index('idle_down')
    portrait = Image.new('RGBA', (cw, ch))
    want = {'back': 'base', 'body': 'base', 'head': 'base', 'armor': m['armor']['t0'], 'weapon': m['weapon']['t0'],
            'wback': m['weapon']['t0']}
    for kind in z['idle_down'][0]:
        v = want.get(kind)
        if v and v in layers.get(kind, {}):
            sh = Image.open(os.path.join(out, layers[kind][v]['file']))
            portrait.alpha_composite(sh.crop((0, row * ch, cw, (row + 1) * ch)))
    portrait = portrait.crop(portrait.getbbox())
    portrait.save(os.path.join(cdir, 'portrait.png'), optimize=True)
    entry = {
        'cell': [cw, ch], 'foot': [left, top],
        'anims': {k: {'row': i, 'n': len(anim_frames[k][0]), 'ms': anim_frames[k][1], 'z': z[k]} for i, k in enumerate(rows)},
        'layers': layers, 'map': m, 'portrait': f'{cls}/portrait.png',
    }
    ip = os.path.join(out, 'index.json')
    index = json.load(open(ip)) if os.path.exists(ip) else {}
    index[cls] = entry
    json.dump(index, open(ip, 'w'), ensure_ascii=False, indent=0)
    print(cls, [cw, ch], {k: len(v) for k, v in layers.items()})

    # 연's own icons of the pieces: the single sprite of the texture "Item_<id>".
    want_icons = {variants[(k, v)][1] for k in m for v in m[k].values() if (k, v) in variants}
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
    os.makedirs(os.path.join(icon_out, cls), exist_ok=True)
    iidx = {}
    missing = set()
    dragon = J['dragon']
    for kind, mm_ in m.items():
        for key, v in mm_.items():
            iid = variants[(kind, v)][1]
            im = icons.get(iid)
            back = iid
            while im is None and key.startswith('dragon') and back > dragon[0]:
                back = max(d for d in dragon if d < back)
                im = icons.get(back)
            if im is None:
                missing.add(iid)
                continue
            fn = f'{cls}/{kind}_{key}.png'
            im.save(os.path.join(icon_out, fn), optimize=True)
            iidx.setdefault(kind, {})[key] = fn
    jp = os.path.join(icon_out, 'index.json')
    ji = json.load(open(jp)) if os.path.exists(jp) else {}
    ji[cls] = iidx
    json.dump(ji, open(jp, 'w'), indent=0)
    print('icons', sum(len(v) for v in iidx.values()), 'missing', sorted(missing))


if __name__ == '__main__':
    main()
