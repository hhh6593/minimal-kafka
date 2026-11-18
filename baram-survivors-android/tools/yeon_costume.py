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
    out = []
    for iid, it in table.items():
        ty = last(it, 'Type')
        kind = next((k for k, t in TYPES.items() if t == ty), None)
        if kind not in kinds or iid in skip:
            continue
        nm = names.get(iid, '')
        if not nm or fem.search(nm) or (drop and drop.search(nm)) or any(t in (it.get('Tag') or []) for t in cfg.get('skip_tags', [])):
            continue
        out.append((kind, iid))
    return sorted(out, key=lambda x: (x[0], int(x[1])))


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
    for cname in sorted({c for cls in index for c in class_anims(cls).values()}):
        frame_cache[cname] = [(t, {k: dict(v, sprite=keep(v['sprite'])) for k, v in st.items()})
                              for t, st in Y.frames(clips[cname], parts)[0]]
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
            return {'E': f.get('avatar_0001.png'), 'F': f.get('avatar_0001_f.png'), 'A': f.get('avatar_0001_a.png')}
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

    def template(s):
        if not s or not s['active'] or s['sprite'] is None or not s['sprite'].path_id:
            return None
        try:
            return s['sprite'].read()
        except Exception:
            return None

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
        if kind in ('weapon', 'wback') or (kind == 'shield' and tx.get('item')):
            if not tx.get('item'):
                return out_l
            for name, sp, pos, order in IC.at(tx['item'], cname, t):
                if FX_PART.search(name):
                    continue
                if kind == 'shield' or (name in YI.MAIN_PARTS) == (kind == 'weapon'):
                    out_l.append(place(pos, sp, sp, root))
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
            out_l.append(place(s['pos'], tmpl, alt, root if k != 0 else None))
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

    def render(kind, tx, gkey):
        """{(anim, i): [(img, x, y)]} of a layer in the clips of a group; None if a frame lacks."""
        rows = [k for k in index[groups[gkey][0]]['anims']]
        anims = class_anims(groups[gkey][0])
        drawn = {}
        for key in rows:
            cname = anims[key]
            for i, (t, st) in enumerate(frame_cache[cname]):
                d = layer_of(kind, tx, st, cname, t)
                if d is None:
                    return None
                cut = []
                for im, x, y in d:
                    bb = im.getbbox()
                    if bb:
                        cut.append((im.crop(bb), x + bb[0], y + bb[1]))
                drawn[(key, i)] = cut
        return drawn

    def save(kind, iid, gkey, drawn, fname):
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
        return {'file': fn, 'cols': ncol, 'cell': [W, Hh], 'foot': [FX, FY], 'hash': h}

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
        elif kind == 'shield':
            allowed = {c for c in index if index[c]['layers'].get('shield')}
        whole = kind == 'helmet' and 'WHOLE_HAT' in (it.get('Tag') or [])
        got = []
        if any(tx.values()):
            for gkey, cl in groups.items():
                cl = [c for c in cl if allowed is None or c in allowed]
                if not cl:
                    continue
                lk = ['weapon', 'wback'] if kind == 'weapon' else [kind]
                draws = {k: render(k, tx, gkey) for k in lk}
                d = draws[lk[0]]
                if kind == 'weapon' and d is not None and draws['wback']:
                    # A weapon held behind (the 천인's gourd, a bow at rest) shows in its second
                    # part: either part covers a frame.
                    d = {f: d[f] + draws['wback'].get(f, []) for f in d}
                if d is None or not any(d.values()):
                    if only:
                        print(iid, cl, 'no picture', d is None)
                    continue
                metas = {}
                for cls in cl:
                    need = {(k, i) for k, i in own[cls].get('head', ()) if k != 'dead'} if whole else own[cls].get(kind, set())
                    if kind == 'weapon':
                        need = need | own[cls].get('wback', set())
                    if only:
                        print(iid, cls, 'bare frames', sorted(f for f in need if not d.get(f))[:8])
                    if any(not d.get(f) for f in need):
                        continue
                    if not metas:
                        for k in lk:
                            if draws[k] and any(draws[k].values()):
                                metas[k] = save(k, iid, gkey, draws[k], f'{k}_{iid}_{gname[gkey]}')
                    for k, meta in metas.items():
                        result['layers'].setdefault(cls, {}).setdefault(k, {})[f'c{iid}'] = meta
                    got.append(cls)
        result['tried'][f'{kind}:{iid}'] = 1
        if got:
            nm = names.get(iid, '')
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


if __name__ == '__main__':
    main()
