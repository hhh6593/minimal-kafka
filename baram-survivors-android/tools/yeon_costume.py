#!/usr/bin/env python3
"""바람의나라 연's 외형 (코디) items as layers over our 연 heroes: outfits, hats, back pieces, face
pieces, weapon looks and shield looks.

    yeon_costume.py UNITS ITEMS ITEMS_AVATAR_BIN ITEM_NAMES_JSON CONFIG_JSON YHERO2_DIR OUT_DIR [KIND ...]

UNITS/ITEMS: Units.unity3d and Items.unity3d from 연's resources, un-XORed (tools/yeon_dexor.py).
ITEMS_AVATAR_BIN: 연's Items_Avatar table (a TextAsset of Commons, tools/yeon_sounds.py saves the
tables), read for each item's slot (Type), its prefab or worn sheet, its grade (MinGrade) and its
tags (WHOLE_HAT: the hat holds the hair, so the hero's own hair is not drawn under it).
ITEM_NAMES_JSON: item id -> Korean name (Strings). CONFIG_JSON: tools/yeon_costumes.json, which
items are tried: every item of the slots it names, less the female-only ones (by name or tag) and
those it excludes by id. YHERO2_DIR: the classes' layered sheets and index.json (tools/yeon_gear.py,
yeon_archer.py, yeon_job.py): each class's clips, cell and foot are read from it, so the costume
layers fall on the same frames and the same feet as the hero's own. KIND: only these slots (a run
per slot keeps the memory down; the index is merged).

연 draws a costume the way it draws a worn piece: the avatar's template slot (Skin for the outfit,
Hat for a hat, Cape behind, Face over the face) takes the frame of the same number in the item's
own sheet (avatar_0001 / _f / _a for the warrior-like, the 격투가's and the 궁사's bodies; capes by
the body frame, 21 below it). A weapon or shield look is its own prefab played beside the avatar
(tools/yeon_itemclip.py), as the jobs' own weapons are (yeon_job.py): its main part (Weapon,
Weapon_Spear) is the weapon layer, the rest (behind the body, the off hand) the wback layer; its
glows, trails and spell flashes are left off. Which classes may wear a weapon look: the class whose
own weapons the look's prefab is (the 치장용 copies reuse them), else by the prefab's parts and the
item's name (a 창 for the 무사, a 활 for the 궁사, a 권갑 for the 격투가 ...).

Every class of ours is evaluated in its own clips; a costume is kept for a class only when it
covers every frame the class's own piece of that slot covers (no bare frames; a whole hat every
frame the head shows). Classes with the same clips (the eight on the warrior's rig) get the very
same pictures, so a layer is drawn once per set of clips and its sheet is shared; each layer gets
the cell its pixels need ("cell"/"foot"), so wings and tall hats reach past the class's cell and
small pieces take little room.

Output: OUT_DIR/s/<kind>_<id>_<group>.webp (lossless; rows and columns as the classes' sheets),
OUT_DIR/s/head_nohair_<cls>.webp, OUT_DIR/icons/<id>.png and OUT_DIR/index.json:
    {"items": {id: {"kind", "name", "grade", "whole"?, "set"?, "icon", "classes": [cls, ...]}},
     "layers": {cls: {kind: {"c<id>" | "nohair": {"file", "cols", "cell", "foot"}}}}}
"""
import gc
import hashlib
import io
import json
import math
import os
import re
import struct
import sys
import time

import UnityPy
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import yeon_avatar as Y  # noqa: E402
import yeon_archer as YA  # noqa: E402
import yeon_itemclip as YI  # noqa: E402
import yeon_job as YJ  # noqa: E402

CAPE_OFFSET = 21
# Our slot -> 연's Items_Avatar Type.
TYPES = {'armor': 'AVATAR_SHIRT', 'helmet': 'AVATAR_HAT', 'cape': 'AVATAR_CAPE', 'face': 'AVATAR_FACE_DECORATION',
         'weapon': 'AVATAR_WEAPON', 'shield': 'AVATAR_SHIELD'}
SLOTS = {'armor': ['Skin'], 'helmet': ['Hat', 'Hat_color'], 'face': ['Face'], 'shield': ['Sheild', 'Sheild_color']}
# A shield look prefab's own part (the rest, a strap or a far half, goes in the sback layer).
SHIELD_MAIN = ('Sheild',)
# The two layers of a look of each kind (one picture: the first is the look's own slot).
LOOK_LAYERS = {'weapon': ['weapon', 'wback'], 'shield': ['shield', 'sback'], 'armor': ['armor', 'aback']}
SIDED = ('weapon', 'wback', 'shield', 'sback', 'aback')
# Parts of an item prefab that are light, not the item: glows, trails, spell flashes.
FX_PART = re.compile(r'(?i)spell|fx|light|trail|effect|stain|point|position|drop|wheel|follow')
# Our classes' own weapons, by the prefab's item id (a 치장용 look reuses its weapon's prefab).
WEAPON_RANGES = [(1000, 1200, 'warrior'), (1200, 1300, 'rogue'), (1300, 1400, 'mage'), (1400, 1500, 'poet'),
                 (60000, 61000, 'monk'), (220000, 221000, 'archer'), (240000, 241000, 'lancer'),
                 (260000, 261000, 'celestial'), (270000, 271000, 'celestial'), (280000, 281000, 'dokkaebi'),
                 (310000, 311000, 'reaper'), (330000, 331000, 'magus'), (340000, 341000, 'magus')]
# By the name, where the prefab is the look's own.
WEAPON_WORDS = [
    (r'궁|활|보우|애로우|대포|물총|총$', ['archer']),
    (r'창|극$|폴암|언월|삼지|당파|모$', ['lancer']),
    (r'권갑|장갑|주먹|손톱|너클|조$|철갑', ['monk']),
    (r'단봉|서$|책', ['magus']),
    (r'호리병|병$|포$|포\(', ['celestial']),
    (r'퇴$|퇴\(|방망이|몽둥이|곤봉', ['dokkaebi']),
    (r'명도|백도', ['reaper']),
    (r'부채|선$|선\(|파초선|채$', ['poet']),
    (r'봉|장$|장\(|지팡이|석장|깃발|기$', ['mage', 'poet']),
    (r'검|도$|도\(|칼|낫|낭아|부$', ['warrior', 'rogue']),
]
JOB_NAMES = {'전사': 'warrior', '도적': 'rogue', '주술사': 'mage', '도사': 'poet', '궁사': 'archer', '무사': 'lancer',
             '격투가': 'monk', '마도사': 'magus', '천인': 'celestial', '도깨비': 'dokkaebi', '차사': 'reaper'}
# By the parts, failing the name.
WEAPON_PARTS = {
    'spear': ['lancer'], 'left': ['monk', 'magus'], 'back': ['dokkaebi'],
    'single': ['warrior', 'rogue'],
}


def class_anims(cls):
    if cls == 'archer':
        return YA.ANIMS
    if cls in YJ.JOBS:
        return YJ.JOBS[cls]['anims']
    return Y.ANIMS


def read_table(path):
    """연's item tables: a list of field names, (field, value) pairs and a string pool. Each
    item's pairs begin with Type=SUN (its sun/moon default); values are offsets into the pool."""
    b = open(path, 'rb').read()
    _, nend, _, pool = struct.unpack('<4I', b[:16])
    names, i = {}, 16
    while i < nend and b[i]:
        names[i - 16] = b[i + 1:i + 1 + b[i]].decode()
        i += 1 + b[i]

    def s(o):
        if pool + o >= len(b):
            return ''
        return b[pool + o + 1:pool + o + 1 + b[pool + o]].decode('utf-8', 'replace')
    w = struct.unpack('<%dI' % ((pool - nend) // 4), b[nend:nend + (pool - nend) // 4 * 4])
    i = 2
    while i < len(w) - 1 and w[i] in names:
        i += 2
    items, cur = [], None
    while i < len(w) - 1:
        if w[i] and w[i] in names:
            k, v = names[w[i]], s(w[i + 1])
            if k == 'Type' and v == 'SUN':
                cur = {}
                items.append(cur)
            if cur is not None:
                cur.setdefault(k, []).append(v)
            i += 2
            continue
        i += 1
    out = {}
    for it in items:
        m = re.match(r'Item_(\d+)_Name', (it.get('Name') or [''])[0])
        if m:
            out[m.group(1)] = it
    return out


def last(it, k):
    return (it.get(k) or [None])[-1]


def candidates(table, names, cfg, kinds):
    """(kind, id) of every item tried: the slots' items less the female-only and the excluded."""
    fem = re.compile(cfg.get('female', r'\(여\)|여자|여성'))
    skip = {str(x) for x in cfg.get('exclude', [])}
    drop = re.compile(cfg['drop_names']) if cfg.get('drop_names') else None
    # A rental copy ("[기간제] 은익섬광 의상(남)") is tried only when 연 has no lasting item of that name: the
    # 은익섬광 set (전설) exists only as [기간제], and dropping every rental left it out altogether.
    rent = re.compile(cfg['rental']) if cfg.get('rental') else None
    lasting = {names.get(i, '').strip() for i in table if not (rent and rent.search(names.get(i, '')))}
    out = []
    for iid, it in table.items():
        ty = last(it, 'Type')
        kind = next((k for k, t in TYPES.items() if t == ty), None)
        if kind not in kinds or iid in skip:
            continue
        nm = names.get(iid, '')
        if not nm or fem.search(nm) or (drop and drop.search(nm)) or any(t in (it.get('Tag') or []) for t in cfg.get('skip_tags', [])):
            continue
        if rent and rent.search(nm) and rent_name(nm, rent) in lasting:
            continue
        out.append((kind, iid))
    return sorted(out, key=lambda x: (x[0], int(x[1])))


def rent_name(nm, rent):
    """A rental copy's name without its rental mark ("[기간제] 은익섬광 망토" -> "은익섬광 망토")."""
    return re.sub(r'\s+', ' ', rent.sub('', nm)).strip()


def set_name(nm):
    """The set an item belongs to, as 연 names its sets: the words before the last ("열혈강호 매유진
    현무파천검" -> "열혈강호 매유진"); a name of one word has none."""
    nm = re.sub(r'\s*\(치장용\)|\[[^\]]*\]\s*', '', nm).strip()
    w = nm.split()
    return ' '.join(w[:-1]) if len(w) > 1 else None


def main():
    units, items, av_bin, names_path, cfg_path, yh2, out = sys.argv[1:8]
    kinds = sys.argv[8:] or list(TYPES)
    t0 = time.time()
    table = read_table(av_bin)
    names = json.load(open(names_path))
    cfg = json.load(open(cfg_path))
    index = json.load(open(os.path.join(yh2, 'index.json')))
    if set(kinds) <= set(HF_TYPES):
        return hair_face(units, table, names, cfg, index, yh2, out, kinds, t0)
    want = candidates(table, names, cfg, kinds)
    lim = int(os.environ.get('COSTUME_LIMIT', 0))
    only = os.environ.get('COSTUME_IDS')
    if only:  # these items alone, saying why a class misses (to look into one)
        want = [w for w in want if w[1] in only.split(',')]
        lim = len(want)
    if lim:  # a sample of each slot (to time a run)
        want = [x for k in kinds for x in [w for w in want if w[0] == k][::max(1, sum(1 for w in want if w[0] == k) // lim)][:lim]]
    print('candidates', {k: sum(1 for x in want if x[0] == k) for k in kinds}, flush=True)
    # The clips first, from Units alone, their sprites kept as ids: Units and Items loaded together
    # take some 9 GB; one at a time, half that.
    env = UnityPy.load(units)
    parts, clips = Y.build(env)
    crc = {v['name']: k for k, v in parts.items()}
    frame_cache = {}
    units_sp = {}

    class Copy:
        pass

    def copy(sp, pid):
        c = Copy()
        c.m_Name = sp.m_Name
        c.m_Rect, c.m_Pivot, c.m_RD = Copy(), Copy(), Copy()
        c.m_Rect.width, c.m_Rect.height = sp.m_Rect.width, sp.m_Rect.height
        c.m_Pivot.x, c.m_Pivot.y = sp.m_Pivot.x, sp.m_Pivot.y
        c.m_RD.textureRectOffset = Copy()
        c.m_RD.textureRectOffset.x, c.m_RD.textureRectOffset.y = sp.m_RD.textureRectOffset.x, sp.m_RD.textureRectOffset.y
        c.object_reader = Copy()
        c.object_reader.path_id = ('u', pid)
        c.image = sp.image.convert('RGBA') if sp.m_Name.startswith('Head') else None
        return c

    def keep(pp):
        if pp is None or not pp.path_id:
            return 0
        if pp.path_id not in units_sp:
            try:
                units_sp[pp.path_id] = copy(pp.read(), pp.path_id)
            except Exception:
                units_sp[pp.path_id] = None
        return pp.path_id
    turn_k = {crc[n] for n in YI.TURNED_SLOTS if n in crc}
    for cname in sorted({c for cls in index for c in class_anims(cls).values()}):
        # The shield slot's turn too (연 mirrors it in the directions seen from behind): a shield
        # look worn by its sheet's frame numbers is placed as the slot is.
        frame_cache[cname] = [(t, {k: dict(v, sprite=keep(v['sprite']), **({'m': YI.state_m(full[k])} if k in turn_k else {}))
                                   for k, v in st.items()})
                              for t, st in Y.frames(clips[cname], parts)[0]
                              for full in [YI.full_state(clips[cname], parts, t)]]
    del env, clips
    gc.collect()
    print('clips', round(time.time() - t0), flush=True)
    env = UnityPy.load(items)
    by_pid = {o.path_id: o for o in env.objects if o.type.name == 'Sprite'}
    assets_files = {o.assets_file for o in by_pid.values() if hasattr(o.assets_file, '_cache')}
    IC = YI.ItemClips(env)
    for path, obj in env.container.items():
        m = re.search(r'/items/item_(\d+)\.prefab$', path, re.I)
        if m:
            IC.pref.setdefault(int(m.group(1)), obj)

    class Ref:
        def __init__(self, pid):
            self.u = units_sp.get(pid)
            self.path_id = pid if (self.u is not None or pid in by_pid) else 0

        def read(self):
            return self.u if self.u is not None else by_pid[self.path_id].read()
    refs = {}
    for fr in frame_cache.values():
        for _, st in fr:
            for v in st.values():
                pid = v['sprite']
                v['sprite'] = refs.setdefault(pid, Ref(pid)) if pid else None

    # Textures by container path: the items' own folders and the loose worn sheets.
    folders, flat = {}, {}
    for path, obj in env.container.items():
        if obj.type.name != 'Texture2D':
            continue
        m = re.search(r'/items/item_([^/]+)/([^/]+)$', path)
        if m:
            folders.setdefault(m.group(1).lower(), {})[m.group(2)] = obj.path_id
            continue
        m = re.search(r'/items/([^/]+\.png)$', path)
        if m:
            flat[m.group(1)] = obj.path_id
    # Every numbered sprite by (texture, number), kept unread; the icons by name.
    tex_n, by_tex, icon_o = {}, {}, {}
    for o in env.objects:
        if o.type.name != 'Sprite':
            continue
        try:
            sp = o.read()
            t = sp.m_RD.texture.path_id
        except Exception:
            continue
        n = sp.m_Name
        idx = n.rsplit('_', 1)[-1]
        if idx.isdigit():
            tex_n[t] = tex_n.get(t, 0) + 1
            if (t, idx) not in by_tex or '_color' not in n.lower():
                by_tex[(t, idx)] = o
        area = int(sp.m_Rect.width * sp.m_Rect.height)
        k = n.lower() + '.png'
        if k not in icon_o or area > icon_o[k][1]:
            icon_o[k] = (o, area)
        del sp
    print('items read', len(by_tex), round(time.time() - t0), flush=True)
    sp_cache = {}

    def sprite(tid, idx):
        if tid is None:
            return None
        k = (tid, str(idx))
        if k not in sp_cache:
            o = by_tex.get(k)
            sp_cache[k] = o.read() if o is not None else None
        return sp_cache[k]

    def nframes(tid):
        return tex_n.get(tid, 0)

    def prefab_id(iid):
        pf = last(table[iid], 'Prefab')
        m = re.search(r'item_(\d+)\.prefab', pf or '', re.I)
        return int(m.group(1)) if m else None

    def textures(iid, kind):
        it = table[iid]
        pf, es = last(it, 'Prefab'), last(it, 'EquipSprite')
        key = None
        if pf:
            m = re.search(r'item_([^/.]+)\.prefab', pf, re.I)
            key = m.group(1).lower() if m else None
        f = folders.get(key or '', {})
        if kind == 'armor':
            # The body sheet is avatar_0001 or avatar_0001_e (용랑·용주 파천/멸아); a "_f" sheet is the
            # 격투가's walking body (51 frames) only in older outfits: newer ones hold its attack poses
            # alone (18-28), which by frame number would put attack frames on its walk.
            fs = f.get('avatar_0001_f.png')
            tx = {'E': f.get('avatar_0001.png') or f.get('avatar_0001_e.png'), 'F': fs if tex_n.get(fs, 0) >= 51 else None,
                  'A': f.get('avatar_0001_a.png')}
            p = prefab_id(iid)
            if p is not None and IC.has(p):
                tx['item'] = p
            return tx
        if kind == 'cape':
            e = next((t for n, t in f.items() if n.endswith('_e.png') and 'cape' in n), None) \
                or next((t for n, t in f.items() if n.endswith('_e.png')), None)
            a = next((t for n, t in f.items() if n.endswith('_a.png') and '_b_' not in n), None)
            fs = next((t for n, t in f.items() if n.endswith('_f.png') and tex_n.get(t) == 51), None)
            return {'E': e, 'A': a, 'F': fs}
        if kind in ('weapon', 'shield'):
            p = prefab_id(iid)
            tx = {'item': p} if p is not None and IC.has(p) else {}
            if kind == 'shield':
                e = next((t for n, t in f.items() if n.endswith('_e.png')), None)
                if e is None and es:
                    e = flat.get(es.split('/')[-1].lower())
                tx['E'] = e
            return tx
        e = next((t for n, t in f.items() if n.endswith('_e.png')), None)
        if e is None and es:
            e = flat.get(es.split('/')[-1].lower())
        return {'E': e}

    def weapon_classes(iid):
        """The classes a weapon look is for (its weapon type)."""
        p = prefab_id(iid)
        for a, b, c in WEAPON_RANGES:
            if p is not None and a <= p < b:
                return [c]
        nm = re.sub(r'\s*\(치장용\)|\[[^\]]*\]\s*', '', names.get(iid, '')).strip()
        # A collab look made once per job says whose it is: "…현무파천궁(궁사)".
        m = re.search(r'\((전사|도적|주술사|도사|궁사|무사|격투가|마도사|천인|도깨비|차사)\)', nm)
        if m:
            return [JOB_NAMES[m.group(1)]]
        for pat, cl in WEAPON_WORDS:
            if re.search(pat, nm):
                return cl
        it = IC._item(p) if p is not None else None
        if it is None:
            return []
        pn = {v['name'].split('/')[-1] for v in it['parts'].values()}
        if 'Weapon_Spear' in pn:
            return WEAPON_PARTS['spear']
        if 'Weapon_Left' in pn:
            return WEAPON_PARTS['left']
        if any(n.lower() == 'weapon_back' for n in pn):
            return WEAPON_PARTS['back']
        return WEAPON_PARTS['single']

    imgs = {}

    def pic(sp):
        k = sp.object_reader.path_id
        if k not in imgs:
            imgs[k] = sp.image.convert('RGBA')
        return imgs[k]

    def place(pos, tmpl, alt, root, m=None):
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
        if m is not None:
            return YI.turned(im, px, py, x, -y, m)
        return (im, x - px, -y - py)

    def template(s):
        if not s or not s['active'] or s['sprite'] is None or not s['sprite'].path_id:
            return None
        try:
            return s['sprite'].read()
        except Exception:
            return None

    def weapon_split(tx, st, cname, t):
        """The item's parts at this moment of the avatar's clip, in two layers, as 연 sorts them:
        the main part (Weapon, Weapon_Spear) and its children the weapon layer, the rest (behind,
        the off hand) wback; but a child on the other side of the body from its main part goes to
        wback too. Each layer gets its side ('f' in front of the body, 'b' behind, '' both or
        none). 청룡 심판의낫 holds its shaft behind the body and its blade in front (a nested
        Weapon/Weapon_F): drawn as one layer the shaft crossed the chest."""
        return item_split(tx, st, cname, t, YI.MAIN_PARTS, 'weapon', 'wback')

    def item_split(tx, st, cname, t, mains, front, second):
        """weapon_split for any item prefab: its main parts (and their children on the same side
        of the body) in the layer `front`, the rest in `second`, each with its side. A prefab
        without such a part (a few shield looks hold a Face part) has its first part as main."""
        it = IC._item(tx['item'])
        tops = [p['name'] for p in it['parts'].values() if p['name'] != 'Sprite' and '/' not in p['name']]
        if tops and not any(n in mains for n in tops):
            mains = (tops[0],)
        body = st[0]['order']
        got = []
        for name, sp, pos, order, m in IC.posed(tx['item'], cname, t):
            if FX_PART.search(name):
                continue
            got.append((name, sp, pos, order, m, 'f' if order >= body else 'b'))
        main = {g[0]: g[5] for g in got if g[0] in mains}
        out = {front: ([], set()), second: ([], set())}
        for name, sp, pos, order, m, side in got:
            top = name.split('/')[0]
            k = front if top in mains else second
            if k == front and name != top and top in main and main[top] != side:
                k = second
            out[k][0].append((order, place(pos, sp, sp, st[0]['pos'], m)))
            out[k][1].add(side)
        res = {}
        for k, (lst, sides) in out.items():
            lst.sort(key=lambda o: o[0])
            res[k] = ([p for _, p in lst], next(iter(sides)) if len(sides) == 1 else '')
        return res

    def armor_root(tx, st, cname, t):
        """The outfit prefab's own root sprite at this moment of the avatar's clip, placed as the
        body is; None when the prefab keys none (the avatar's Skin slot draws it)."""
        it = IC._item(tx['item'])
        c = IC.clip(tx['item'], cname)
        if it is None or c is None:
            return None
        key = ('root', cname, round(t, 4))
        if key not in it['states']:
            s0 = YI.full_state(c, it['parts'], t)[0]
            ref = s0['sprite']
            sp = None
            if s0['active'] and ref is not None and ref.path_id:
                try:
                    sp = ref.read()
                except Exception:
                    sp = None
            it['states'][key] = (sp, YI.state_m(s0))
        sp, m = it['states'][key]
        if sp is None:
            return None
        return place(st[0]['pos'], sp, sp, None, None if YI.is_identity(m) else m)

    def armor_back(tx, st, cname, t):
        """The outfit prefab's other parts (wings, a cape, a tail: Sprite_b, Sprite_b2 ...; the
        용주 serpent is drawn from its "_fx" sheet), in one layer with its side of the body."""
        body = st[0]['order']
        got = []
        for name, sp, pos, order, m in IC.posed(tx['item'], cname, t):
            if FX_PART.search(name):
                continue
            got.append((order, place(pos, sp, sp, st[0]['pos'], m), 'f' if order >= body else 'b'))
        got.sort(key=lambda g: g[0])
        sides = {g[2] for g in got}
        return [g[1] for g in got], (next(iter(sides)) if len(sides) == 1 else '')

    def body_frame(st):
        b = st[0]['sprite']
        if b is None or not b.path_id:
            return None, None
        n = b.read().m_Name
        i = n.rsplit('_', 1)[1]
        if not i.isdigit():
            return None, None
        return ('A' if n.startswith('Avatar_A_') else 'F' if n.startswith('Avatar_F_') else 'E'), int(i)

    def layer_of(kind, tx, st, cname, t):
        """[(img, x, y)] of one layer in one frame; None when the item lacks a frame it needs."""
        out_l = []
        root = st[0]['pos']
        if kind in ('weapon', 'wback'):
            if not tx.get('item'):
                return out_l
            lst, side = weapon_split(tx, st, cname, t)[kind]
            cur_side[0] = side if lst else ''
            return lst
        # A shield look's prefab as 연 plays it, in two layers like a weapon's: the shield itself
        # (Sheild and its children on its side of the body) and the rest (sback), each on the side
        # of the body 연 sorts it to in that frame. Most are held in the left hand, in front of the
        # body or behind it as the class's own shield; a sheath, a quiver or a board is carried
        # behind the back (연's sorting order under the body's from the front): drawn at the class's
        # shield place it lay across the chest.
        if kind in ('shield', 'sback') and tx.get('item'):
            lst, side = item_split(tx, st, cname, t, SHIELD_MAIN, 'shield', 'sback')[kind]
            cur_side[0] = side if lst else ''
            return lst
        if kind == 'sback':
            return out_l
        if kind == 'cape':
            s = st.get(crc.get('Cape'))
            bk, bi = body_frame(st)
            if not s or not s['active'] or bi is None:
                return out_l
            if bk == 'F':
                alt = sprite(tx.get('F'), bi)
            elif bk == 'A':
                n = nframes(tx.get('A'))
                alt = sprite(tx.get('A'), bi if n >= 6 else bi // 2)
            else:
                alt = sprite(tx.get('E'), bi - CAPE_OFFSET)
            if alt is None:
                return None
            out_l.append(place(s['pos'], alt, alt, root))
            return out_l
        if kind == 'nohair':
            k = crc.get('Head')
            tmpl = template(st.get(k))
            if tmpl is not None:
                out_l.append(place(st[k]['pos'], tmpl, None, root if k != 0 else None))
            return out_l
        # An outfit with a prefab of its own (연's newer ones: the 용 파천·멸아 lines ...) plays it
        # beside the avatar, as a weapon: its root sprite is the outfit in that frame (an idle of
        # its own, the 궁사's draw, the 격투가's strikes), and its other parts (Sprite_b: wings,
        # a cape, a tail) the aback layer, on the side of the body 연 sorts them to. A frame the
        # prefab leaves to the avatar (All_Comp_Off, no sprite) takes the Skin slot's frame.
        if kind == 'aback':
            if not tx.get('item'):
                return out_l
            lst, side = armor_back(tx, st, cname, t)
            cur_side[0] = side if lst else ''
            return lst
        if kind == 'armor' and tx.get('item'):
            p = armor_root(tx, st, cname, t)
            if p is not None:
                return [p]
        for name in SLOTS[kind]:
            k = crc.get(name)
            s = st.get(k) if k is not None else None
            tmpl = template(s)
            if tmpl is None:
                continue
            n = tmpl.m_Name
            idx = n.rsplit('_', 1)[1]
            letter = 'E'
            if kind == 'armor':
                letter = 'A' if '_A_' in n else 'F' if n.startswith('Item_0000_F_') else 'E'
            alt = sprite(tx.get(letter), idx)
            if alt is None:
                if name.endswith('_color'):
                    continue
                return None
            out_l.append(place(s['pos'], tmpl, alt, root if k != 0 else None, s.get('m') if kind == 'shield' else None))
        return out_l

    # The classes by their clips: the same clips, the same pictures.
    groups = {}
    for cls, H in index.items():
        anims = class_anims(cls)
        rows = sorted(H['anims'], key=lambda k: H['anims'][k]['row'])
        groups.setdefault(tuple(anims[k] for k in rows), []).append(cls)
    gname = {g: cl[0] for g, cl in groups.items()}
    # Which frames each class's own pieces cover, by slot: a costume must cover them too.
    own = {}
    for cls, H in index.items():
        cw, ch = H['cell']
        rows = sorted(H['anims'], key=lambda k: H['anims'][k]['row'])
        own[cls] = {}
        for kind in ('armor', 'helmet', 'cape', 'head', 'weapon', 'wback', 'shield'):
            lay = H['layers'].get(kind)
            if not lay:
                continue
            v = sorted(lay)[0]
            sh = Image.open(os.path.join(yh2, lay[v]['file']))
            cols = lay[v]['cols']
            own[cls][kind] = {(key, i) for key in rows for i in range(H['anims'][key]['n'])
                              if sh.crop(((i % cols) * cw, (H['anims'][key]['row'] + i // cols) * ch,
                                          (i % cols + 1) * cw, (H['anims'][key]['row'] + i // cols + 1) * ch)).getbbox()}

    os.makedirs(os.path.join(out, 's'), exist_ok=True)
    os.makedirs(os.path.join(out, 'icons'), exist_ok=True)
    ip = os.path.join(out, 'index.json')
    result = json.load(open(ip)) if os.path.exists(ip) else {'items': {}, 'layers': {}, 'tried': {}}
    result.setdefault('tried', {})
    by_hash = {}
    for cls_l in result['layers'].values():
        for kv in cls_l.values():
            for meta in kv.values():
                if meta.get('hash'):
                    by_hash[meta['hash']] = meta['file']

    cur_side = ['']
    side_of = {}

    def render(kind, tx, gkey):
        """{(anim, i): [(img, x, y)]} of a layer in the clips of a group; None if a frame lacks.
        A weapon layer's side_of[kind]: {(anim, i): 'f' | 'b' | ''}, the side of the body it is
        drawn on in each frame."""
        sides = {}
        rows = [k for k in index[groups[gkey][0]]['anims']]
        anims = class_anims(groups[gkey][0])
        drawn = {}
        for key in rows:
            cname = anims[key]
            for i, (t, st) in enumerate(frame_cache[cname]):
                cur_side[0] = ''
                d = layer_of(kind, tx, st, cname, t)
                if d is None:
                    return None
                cut = []
                for im, x, y in d:
                    bb = im.getbbox()
                    if bb:
                        cut.append((im.crop(bb), x + bb[0], y + bb[1]))
                drawn[(key, i)] = cut
                if kind in SIDED:
                    sides[(key, i)] = cur_side[0] if cut else ''
        if kind in SIDED:
            side_of[kind] = sides
        return drawn

    def save(kind, iid, gkey, drawn, fname, sides=None):
        H = index[groups[gkey][0]]
        rows = sorted(H['anims'], key=lambda k: H['anims'][k]['row'])
        ncol = max(H['anims'][k]['n'] for k in rows)
        nrow = max(H['anims'][k]['row'] for k in rows) + 1
        allp = [p for v in drawn.values() for p in v]
        x0 = min(math.floor(x) for _, x, _ in allp)
        y0 = min(math.floor(y) for _, _, y in allp)
        x1 = max(math.ceil(x + im.width) for im, x, _ in allp)
        y1 = max(math.ceil(y + im.height) for im, _, y in allp)
        W, Hh, FX, FY = x1 - x0, y1 - y0, -x0, -y0
        sheet = Image.new('RGBA', (W * ncol, Hh * nrow))
        for key in rows:
            r = H['anims'][key]['row']
            for i in range(H['anims'][key]['n']):
                for im, x, y in drawn[(key, i)]:
                    sheet.alpha_composite(im, ((i % ncol) * W + int(round(FX + x)), (r + i // ncol) * Hh + int(round(FY + y))))
        buf = io.BytesIO()
        sheet.save(buf, 'WEBP', lossless=True, quality=80, method=4)
        data = buf.getvalue()
        h = hashlib.sha1(data).hexdigest()[:16]
        if h in by_hash:
            fn = by_hash[h]
        else:
            fn = f's/{fname}.webp'
            with open(os.path.join(out, fn), 'wb') as f:
                f.write(data)
            by_hash[h] = fn
        meta = {'file': fn, 'cols': ncol, 'cell': [W, Hh], 'foot': [FX, FY], 'hash': h}
        if sides:
            # Per frame, the side of the body the layer is drawn on (f in front, b behind, . none):
            # a string per sheet row, a letter per frame. costume.js puts the layer there (layerOrder).
            side = [''] * nrow
            for key in rows:
                side[H['anims'][key]['row']] = ''.join(sides.get((key, i)) or '.' for i in range(H['anims'][key]['n']))
            meta['side'] = side
        return meta

    def flush():
        json.dump(result, open(ip + '.tmp', 'w'), ensure_ascii=False, separators=(',', ':'))
        os.replace(ip + '.tmp', ip)

    # The head without hair, under a whole hat (one per class: the heads differ).
    if 'helmet' in kinds:
        for gkey, cl in groups.items():
            for cls in cl:
                if 'nohair' in result['layers'].get(cls, {}).get('head', {}):
                    continue
                drawn = render('nohair', {}, gkey)
                result['layers'].setdefault(cls, {}).setdefault('head', {})['nohair'] = save('head', 'nohair', gkey, drawn, f'head_nohair_{gname[gkey]}')
        flush()

    done = 0
    for kind, iid in want:
        if result['tried'].get(f'{kind}:{iid}'):
            continue
        it = table[iid]
        tx = textures(iid, kind)
        allowed = None
        if kind == 'weapon':
            allowed = set(weapon_classes(iid))
            # (COSTUME_ALL_CLASSES=1: a 공용 무기's look on every class — 심판의낫, whose swing is the same for all)
            if os.environ.get('COSTUME_ALL_CLASSES'):
                allowed = set(index)
        elif kind == 'shield':
            allowed = {c for c in index if index[c]['layers'].get('shield')}
        whole = kind == 'helmet' and 'WHOLE_HAT' in (it.get('Tag') or [])
        got = []
        if any(tx.values()):
            for gkey, cl in groups.items():
                cl = [c for c in cl if allowed is None or c in allowed]
                if not cl:
                    continue
                lk = LOOK_LAYERS[kind] if kind == 'weapon' or (kind in ('shield', 'armor') and tx.get('item')) else [kind]
                draws = {k: render(k, tx, gkey) for k in lk}
                sides = {k: dict(side_of.get(k, {})) for k in lk if k in SIDED}
                d = draws[lk[0]]
                if len(lk) > 1 and kind != 'armor' and d is not None and draws[lk[1]]:
                    # A weapon held behind (the 천인's gourd, a bow at rest) shows in its second
                    # part: either part covers a frame.
                    d = {f: d[f] + draws[lk[1]].get(f, []) for f in d}
                if d is None or not any(d.values()):
                    if only:
                        print(iid, cl, 'no picture', d is None)
                    continue
                # A few looks the game must have (주작선장, the 사신수 staff) draw no frame of an
                # attack clip: those frames take the same direction's nearest drawn frame of
                # another clip (cast, then stand, then any), so the staff stays in hand.
                if iid in (cfg.get('fill_bare') or []):
                    def donor(f):
                        dirn = f[0].split('_')[-1]
                        for pre in ('cast', 'magic', 'stand', 'idle', 'walk', ''):
                            for k in sorted(d):
                                if k[0].endswith(dirn) and k[0].startswith(pre) and d.get(k):
                                    return d[k]
                        return None
                    need_all = set().union(*[own[c].get(kind, set()) | own[c].get('wback', set()) for c in cl])
                    for f in need_all:
                        if not d.get(f):
                            g = donor(f)
                            if g:
                                d[f] = g
                                for k in lk:
                                    if draws[k] is not None and not draws[k].get(f):
                                        dk = [kk for kk in sorted(draws[k]) if kk[0].endswith(f[0].split('_')[-1]) and draws[k].get(kk)]
                                        if dk:
                                            draws[k][f] = draws[k][dk[0]]
                                            if k in sides:
                                                sides[k][f] = sides[k].get(dk[0], '')
                metas = {}
                for cls in cl:
                    need = {(k, i) for k, i in own[cls].get('head', ()) if k != 'dead'} if whole else own[cls].get(kind, set())
                    if kind == 'weapon':
                        need = need | own[cls].get('wback', set())
                    if only:
                        print(iid, cls, 'bare frames', sorted(f for f in need if not d.get(f))[:8])
                    # (COSTUME_CAST_BARE=1: a look that misses only the cast poses — 천인·도깨비 holding 심판의낫 — is kept;
                    # the hand is raised there, the weapon a moment unseen)
                    bare = [f for f in need if not d.get(f)]
                    if bare and not (os.environ.get('COSTUME_CAST_BARE') and all(f[0].startswith('cast') for f in bare)):
                        continue
                    if not metas:
                        for k in lk:
                            if draws[k] and any(draws[k].values()):
                                metas[k] = save(k, iid, gkey, draws[k], f'{k}_{iid}_{gname[gkey]}', sides.get(k))
                    for k, meta in metas.items():
                        result['layers'].setdefault(cls, {}).setdefault(k, {})[f'c{iid}'] = meta
                    got.append(cls)
        result['tried'][f'{kind}:{iid}'] = 1
        if got:
            nm = names.get(iid, '')
            if cfg.get('rental'):
                nm = rent_name(nm, re.compile(cfg['rental']))  # (owned for good here: no rental mark)
            e = {'kind': kind, 'name': nm, 'grade': int(last(it, 'MinGrade') or 1), 'classes': got}
            if whole:
                e['whole'] = 1
            sn = set_name(nm)
            if sn:
                e['set'] = sn
            # The item's own icon (its Sprite).
            ic = (last(it, 'Sprite') or '').split('/')[-1].lower()
            o = icon_o.get(ic)
            if o is not None:
                try:
                    im = o[0].read().image.convert('RGBA')
                    box = im.getbbox()
                    if box:
                        im = im.crop(box)
                    if max(im.size) > 64:
                        k = 64 / max(im.size)
                        im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
                    im.save(os.path.join(out, 'icons', f'{iid}.png'), optimize=True)
                    e['icon'] = f'icons/{iid}.png'
                except Exception:
                    pass
            result['items'][iid] = e
        # Let go of this item's pictures (the textures UnityPy keeps decoded, the sprites read).
        imgs.clear()
        sp_cache.clear()
        for af in assets_files:
            af._cache.clear()
        IC.cache.clear()
        done += 1
        if done % 25 == 0:
            flush()
            print(kind, iid, done, '/', len(want), 'items', len(result['items']), round(time.time() - t0), flush=True)
    # Items no longer tried (the config changed since they were drawn) leave the index.
    if not lim:
        keep = {iid for _, iid in want}
        for iid in [i for i, e in result['items'].items() if e['kind'] in kinds and i not in keep]:
            del result['items'][iid]
            for cls_l in result['layers'].values():
                for kv in cls_l.values():
                    kv.pop(f'c{iid}', None)
    flush()
    print('items', {k: sum(1 for v in result['items'].values() if v['kind'] == k) for k in TYPES}, round(time.time() - t0))


# ---------------------------------------------------------------- 헤어 · 얼굴 (the character's own hair and face)

# Our item kinds -> 연's Items_Avatar Type: the character's hair style and face (in 연 picked at the
# 미용실 and 성형외과), not costumes: their pictures are in Units, beside the avatar's own.
HF_TYPES = {'hair': 'HAIR', 'head': 'HEAD'}
# Each class's own hair (the texture of its Hair_0000 sheet, as tools/yeon_gear.py, yeon_archer.py
# and yeon_job.py draw it) and how its frames map onto the avatar's stand-ins.
OWN_HAIR = {'warrior': -2261347332773257848, 'rogue': 2370381450423049812, 'mage': -3198846463903518966,
            'poet': 297653128484753130, 'archer': YA.HAIR_TEX}
OWN_HAIR.update({c: J['hair'] for c, J in YJ.JOBS.items()})
# 연's hair sheets hold the front hair down, side, up (0-2) and again (4-6, with 3 and 7 a tail seen
# from behind), then what hangs behind the body: down and side (8-9: a braid, long hair, a tail;
# empty for short styles) and again (10-11). The avatar's stand-ins count the front hair up, side,
# down (and 3, the spear's thrust upward) and the hair behind side (Hair_1000_b_0), down (_b_1).
# (yeon_job.py read the hair behind from 3-4, which holds the tail seen from behind and the second
# front: it never showed, the game drawing no hair behind until a 헤어 is picked.)
REMAP = {'0': '2', '2': '0', '3': '2'}
REMAP_B = {'1': '8', '0': '9'}
# The warrior's rig (yeon_gear.py) never drew the hair behind, and kept the stand-in's 3 as it is.
OLD_RIG = {'warrior', 'rogue', 'mage', 'poet'}


def hair_face(units, table, names, cfg, index, yh2, out, kinds, t0):
    """The hair styles and faces of 연's 미용실 as layers: a face is the Head part from the face's
    own sheet (Head_<n>, same frame numbers as the avatar's), a hair style its A sheet (the B sheet
    is the same hair pressed flat, for under a hat) in the Hair part, and its tail or braid in the
    Hair_b part. Kept for a class when every frame its head shows has the face and the hair."""
    fem = re.compile(cfg.get('female', r'\(여\)|여자|여성'))
    drop = re.compile(cfg['hf_drop_names']) if cfg.get('hf_drop_names') else None
    skip = {str(x) for x in cfg.get('hf_exclude', [])}
    env = UnityPy.load(units)
    parts, clips = Y.build(env)
    crc = {v['name']: k for k, v in parts.items()}
    # Textures by container path, sprites by texture and frame number, icons by name.
    tex_at, icon_at = {}, {}
    for path, obj in env.container.items():
        lp = path.lower()
        if obj.type.name == 'Texture2D' and '/characters/avatar/' in lp:
            tex_at[lp] = obj.path_id
        elif obj.type.name == 'Sprite' and ('_icon' in lp or '_thumb' in lp):
            icon_at[lp.rsplit('/', 1)[-1]] = obj
    by_tex = {}
    for o in env.objects:
        if o.type.name != 'Sprite':
            continue
        n = o.peek_name()
        if not (n.startswith('Hair_') or n.lower().startswith('head_')):
            continue
        idx = n.rsplit('_', 1)[-1]
        if not idx.isdigit():
            continue
        try:
            sp = o.read()
        except Exception:
            continue
        by_tex.setdefault(sp.m_RD.texture.path_id, {})[idx] = sp
    print('hair/face sheets', len(by_tex), round(time.time() - t0), flush=True)

    def hair_tex(it):
        pf = (last(it, 'Prefab') or '').lower()
        if not pf.endswith('.prefab'):
            return None
        folder = 'assets/patchresources/' + pf[:-len('.prefab')] + '/'
        return next((t for p, t in tex_at.items() if p.startswith(folder)), None)

    def face_tex(it):
        es = (last(it, 'EquipSprite') or '').lower()
        return tex_at.get('assets/patchresources/' + es) if es.startswith('units/') else None

    # The items tried: 연's men's styles (the women's are numbered Hair_1xxx: 금화도사 머리(남) is
    # Hair_0145, (여) Hair_1081), less those named for women.
    want = []
    for iid, it in table.items():
        kind = next((k for k, t in HF_TYPES.items() if t == last(it, 'Type')), None)
        if kind not in kinds or iid in skip:
            continue
        nm = names.get(iid, '')
        if not nm or fem.search(nm) or (drop and drop.search(nm)):
            continue
        if kind == 'hair' and re.search(r'/hair_1\d{3}_a\.prefab$', (last(it, 'Prefab') or '').lower()):
            continue
        want.append((kind, iid))
    want.sort(key=lambda x: (x[0], int(x[1])))
    print('candidates', {k: sum(1 for x in want if x[0] == k) for k in kinds}, flush=True)

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

    tmpl_cache = {}

    def template(s):
        if not s or not s['active'] or s['sprite'] is None or not s['sprite'].path_id:
            return None
        pid = s['sprite'].path_id
        if pid not in tmpl_cache:
            try:
                tmpl_cache[pid] = s['sprite'].read()
            except Exception:
                tmpl_cache[pid] = None
        return tmpl_cache[pid]

    frame_cache = {}

    def clip_frames(cname):
        if cname not in frame_cache:
            frame_cache[cname] = [st for _, st in Y.frames(clips[cname], parts)[0]]
        return frame_cache[cname]

    def layer(kind, tid, st, old):
        """[(img, x, y)] of the face (head), the hair (hair) or the hair behind (back) in a frame;
        None when the sheet lacks a frame the avatar shows."""
        slot = {'head': 'Head', 'hair': 'Hair', 'back': 'Hair_b'}[kind]
        k = crc.get(slot)
        s = st.get(k) if k is not None else None
        tmpl = template(s)
        if tmpl is None:
            return []
        idx = tmpl.m_Name.rsplit('_', 1)[1]
        sheet = by_tex.get(tid, {})
        if kind == 'head':
            alt = sheet.get(idx)
        elif kind == 'hair':
            alt = sheet.get({'0': '2', '2': '0'}.get(idx, idx) if old else REMAP.get(idx, idx))
        else:
            alt = sheet.get(REMAP_B.get(idx, '-'))
            if alt is None:
                return []  # nothing behind: a short style
        if alt is None:
            return None
        return [place(s['pos'], tmpl, alt, st[0]['pos'] if k != 0 else None)]

    def render(cls, kind, tid, old=None):
        H = index[cls]
        anims = class_anims(cls)
        drawn = {}
        for key in H['anims']:
            for i, st in enumerate(clip_frames(anims[key])):
                d = layer(kind, tid, st, old)
                if d is None:
                    return None
                cut = []
                for im, x, y in d:
                    bb = im.getbbox()
                    if bb:
                        cut.append((im.crop(bb), x + bb[0], y + bb[1]))
                drawn[(key, i)] = cut
        return drawn

    os.makedirs(os.path.join(out, 's'), exist_ok=True)
    os.makedirs(os.path.join(out, 'icons'), exist_ok=True)
    ip = os.path.join(out, 'index.json')
    result = json.load(open(ip)) if os.path.exists(ip) else {'items': {}, 'layers': {}, 'tried': {}}
    by_hash = {}
    for cls_l in result['layers'].values():
        for kv in cls_l.values():
            for meta in kv.values():
                if meta.get('hash'):
                    by_hash[meta['hash']] = meta['file']

    def save(cls, drawn, fname):
        H = index[cls]
        rows = sorted(H['anims'], key=lambda k: H['anims'][k]['row'])
        ncol = max(H['anims'][k]['n'] for k in rows)
        nrow = max(H['anims'][k]['row'] for k in rows) + 1
        allp = [p for v in drawn.values() for p in v]
        x0 = min(math.floor(x) for _, x, _ in allp)
        y0 = min(math.floor(y) for _, _, y in allp)
        x1 = max(math.ceil(x + im.width) for im, x, _ in allp)
        y1 = max(math.ceil(y + im.height) for im, _, y in allp)
        W, Hh, FX, FY = x1 - x0, y1 - y0, -x0, -y0
        sheet = Image.new('RGBA', (W * ncol, Hh * nrow))
        for key in rows:
            r = H['anims'][key]['row']
            for i in range(H['anims'][key]['n']):
                for im, x, y in drawn.get((key, i), []):
                    sheet.alpha_composite(im, ((i % ncol) * W + int(round(FX + x)), (r + i // ncol) * Hh + int(round(FY + y))))
        buf = io.BytesIO()
        sheet.save(buf, 'WEBP', lossless=True, quality=80, method=4)
        data = buf.getvalue()
        h = hashlib.sha1(data).hexdigest()[:16]
        if h in by_hash:
            fn = by_hash[h]
        else:
            fn = f's/{fname}.webp'
            with open(os.path.join(out, fn), 'wb') as f:
                f.write(data)
            by_hash[h] = fn
        return {'file': fn, 'cols': ncol, 'cell': [W, Hh], 'foot': [FX, FY], 'hash': h}

    # The frames each class shows its head in (dead included: 연's ghost is a head too).
    need = {}
    for cls, H in index.items():
        anims = class_anims(cls)
        for kind, slot in (('head', 'Head'), ('hair', 'Hair')):
            need[(cls, kind)] = {(key, i) for key in H['anims'] for i, st in enumerate(clip_frames(anims[key]))
                                 if template(st.get(crc[slot])) is not None}
    # The class's own hair as a layer of its own, for a new face under the class's hair: drawn
    # over the hairless head it gives back the head the class always had.
    if 'hair' in kinds:
        for cls in index:
            d = render(cls, 'hair', OWN_HAIR[cls], cls if cls in OLD_RIG else None)
            if d is None or not any(d.values()):
                print('no own hair', cls)
                continue
            result['layers'].setdefault(cls, {}).setdefault('hair', {})['own'] = save(cls, d, f'hair_own_{cls}')
    skipped = []
    for kind, iid in want:
        it = table[iid]
        tid = hair_tex(it) if kind == 'hair' else face_tex(it)
        bald = kind == 'hair' and not last(it, 'Prefab')
        if tid is None and not bald:
            skipped.append((iid, names.get(iid), 'no picture in Units'))
            continue
        got, why = [], []
        for cls in index:
            if bald:
                got.append(cls)
                continue
            d = render(cls, kind, tid)
            if d is None:
                why.append(cls + ': lacks a frame')
                continue
            bare = [f for f in need[(cls, kind)] if not d.get(f)]
            # A hair style may leave the ghost (dead) bare; a face may not.
            if kind == 'hair':
                bare = [f for f in bare if f[0] != 'dead']
            if bare:
                why.append(f'{cls}: bare {bare[:3]}')
                continue
            L = result['layers'].setdefault(cls, {})
            L.setdefault(kind, {})[f'c{iid}'] = save(cls, d, f'{kind}_{iid}_{cls}')
            if kind == 'hair':
                b = render(cls, 'back', tid)
                if b and any(b.values()):
                    L.setdefault('back', {})[f'c{iid}'] = save(cls, b, f'back_{iid}_{cls}')
            got.append(cls)
        if not got:
            skipped.append((iid, names.get(iid), '; '.join(why[:2])))
            continue
        e = {'kind': kind, 'name': names.get(iid, ''), 'grade': 0, 'classes': got}
        if bald:
            e['whole'] = 1  # a hair style of no hair: the head drawn bare
        ic = (last(it, 'Sprite') or '').split('/')[-1].lower()
        o = icon_at.get(ic)
        if o is not None:
            try:
                im = o.read().image.convert('RGBA')
                box = im.getbbox()
                if box:
                    im = im.crop(box)
                if max(im.size) > 64:
                    k = 64 / max(im.size)
                    im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
                im.save(os.path.join(out, 'icons', f'{iid}.png'), optimize=True)
                e['icon'] = f'icons/{iid}.png'
            except Exception:
                pass
        result['items'][iid] = e
        imgs.clear()
    # Items no longer tried leave the index.
    keep = {iid for _, iid in want}
    for iid in [i for i, e in result['items'].items() if e['kind'] in kinds and (i not in keep or any(i == s[0] for s in skipped))]:
        del result['items'][iid]
        for cls_l in result['layers'].values():
            for k in ('hair', 'back', 'head'):
                if k in cls_l:
                    cls_l[k].pop(f'c{iid}', None)
    json.dump(result, open(ip + '.tmp', 'w'), ensure_ascii=False, separators=(',', ':'))
    os.replace(ip + '.tmp', ip)
    for s in skipped:
        print('skipped', *s)
    print('items', {k: sum(1 for v in result['items'].values() if v['kind'] == k) for k in kinds}, round(time.time() - t0))


if __name__ == '__main__':
    main()
