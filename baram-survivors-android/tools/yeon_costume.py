#!/usr/bin/env python3
"""바람의나라 연's 외형 (코디) items as layers over our 연 heroes.

    yeon_costume.py UNITS ITEMS ITEMS_AVATAR_BIN ITEM_NAMES_JSON LIST_JSON YHERO2_DIR OUT_DIR

UNITS/ITEMS: Units.unity3d and Items.unity3d from 연's resources, un-XORed (tools/yeon_dexor.py).
ITEMS_AVATAR_BIN: 연's Items_Avatar table (a TextAsset of Commons, tools/yeon_sounds.py saves the
tables), read for each item's slot (Type), its prefab or worn sheet and its tags (WHOLE_HAT: the
hat holds the hair, so the hero's own hair is not drawn under it).
ITEM_NAMES_JSON: item id -> Korean name (Strings). LIST_JSON: tools/yeon_costumes.json, the items
taken, by our slot: {"armor": [ids], "helmet": [ids], "cape": [ids], "face": [ids]}.
YHERO2_DIR: the classes' layered sheets and index.json (tools/yeon_gear.py, yeon_archer.py,
yeon_job.py): each class's clips, cell and foot are read from it, so the costume layers fall on the
same frames and the same feet as the hero's own.

연 draws a costume the way it draws a worn piece: the avatar's template slot (Skin for the outfit,
Hat for a hat, Cape behind, Face over the face) takes the frame of the same number in the item's
own sheet (avatar_0001 / _f / _a for the warrior-like, the 격투가's and the 궁사's bodies; capes by
the body frame, 21 below it). Every class of ours is evaluated in its own clips; a costume is kept
for a class only when it covers every frame the class's own piece of that slot covers (no bare
frames). A costume that reaches past the class's cell (wings, tall hats) gets a bigger cell of its
own, given in its layer's "cell"/"foot".

Output: OUT_DIR/<cls>/<kind>_c<id>.webp (lossless; rows and columns as the class's sheets),
OUT_DIR/<cls>/head_nohair.webp (the head without hair, under a whole hat), OUT_DIR/icons/<id>.png
and OUT_DIR/index.json:
    {"items": {id: {"kind", "name", "whole", "icon", "classes": [cls, ...]}},
     "layers": {cls: {kind: {"c<id>" | "nohair": {"file", "cols", "cell"?, "foot"?}}}}}
"""
import gc
import json
import math
import os
import re
import struct
import sys

import UnityPy
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import yeon_avatar as Y  # noqa: E402
import yeon_archer as YA  # noqa: E402
import yeon_job as YJ  # noqa: E402

CAPE_OFFSET = 21
# Our slot -> 연's Items_Avatar Type.
TYPES = {'armor': 'AVATAR_SHIRT', 'helmet': 'AVATAR_HAT', 'cape': 'AVATAR_CAPE', 'face': 'AVATAR_FACE_DECORATION'}
SLOTS = {'armor': ['Skin'], 'helmet': ['Hat', 'Hat_color'], 'face': ['Face']}


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


def main():
    units, items, av_bin, names_path, list_path, yh2, out = sys.argv[1:8]
    table = read_table(av_bin)
    names = json.load(open(names_path))
    want = json.load(open(list_path))
    index = json.load(open(os.path.join(yh2, 'index.json')))
    # The clips first, from Units alone, their sprites kept as ids: Units and Items loaded together
    # take some 9 GB; one at a time, half that.
    env = UnityPy.load(units)
    parts, clips = Y.build(env)
    crc = {v['name']: k for k, v in parts.items()}
    frame_cache = {}
    # A sprite the clips key may be in Units (the body, the head, the slots' stand-ins) or in
    # Items: those of Units are kept as copies of what is used of them (Head sprites with their
    # picture, for the head without hair).
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
    env = UnityPy.load(items)
    by_pid = {o.path_id: o for o in env.objects if o.type.name == 'Sprite'}

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
    # Every sprite's texture and name, light (the sprites themselves are read again when needed).
    tex_n, lite = {}, []
    for o in env.objects:
        if o.type.name != 'Sprite':
            continue
        try:
            sp = o.read()
            t = sp.m_RD.texture.path_id
        except Exception:
            continue
        lite.append((o, sp.m_Name, t, int(sp.m_Rect.width * sp.m_Rect.height)))
        if sp.m_Name.rsplit('_', 1)[-1].isdigit():
            tex_n[t] = tex_n.get(t, 0) + 1
        del sp

    def textures(iid, kind):
        it = table[str(iid)]
        last = lambda k: (it.get(k) or [None])[-1]  # noqa: E731
        pf, es = last('Prefab'), last('EquipSprite')
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
        e = next((t for n, t in f.items() if n.endswith('_e.png')), None)
        if e is None and es:
            e = flat.get(es.split('/')[-1].lower())
        return {'E': e}

    variants = {}
    for kind, ids in want.items():
        for iid in ids:
            iid = str(iid)
            if iid not in table or (table[iid].get('Type') or [''])[-1] != TYPES[kind]:
                print('not a', kind, iid)
                continue
            variants[(kind, iid)] = textures(iid, kind)
    tids = {t for tx in variants.values() for t in tx.values() if t}
    bytex = {}
    for o, n, tid, _ in lite:
        if tid in tids:
            idx = n.rsplit('_', 1)[-1]
            if idx.isdigit() and ((tid, idx) not in bytex or '_color' not in n.lower()):
                bytex[(tid, idx)] = o.read()
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

    def layer_of(kind, tx, st):
        """[(img, x, y)] of one layer in one frame; None when the item lacks a frame it needs."""
        out_l = []
        root = st[0]['pos']
        if kind == 'cape':
            s = st.get(crc.get('Cape'))
            bk, bi = body_frame(st)
            if not s or not s['active'] or bi is None:
                return out_l
            if bk == 'F':
                alt = bytex.get((tx.get('F'), str(bi)))
            elif bk == 'A':
                n = sum(1 for (t, _) in bytex if t == tx.get('A'))
                alt = bytex.get((tx.get('A'), str(bi if n >= 6 else bi // 2)))
            else:
                alt = bytex.get((tx.get('E'), str(bi - CAPE_OFFSET)))
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
            alt = bytex.get((tx.get(letter), idx))
            if alt is None:
                if name.endswith('_color'):
                    continue
                return None
            out_l.append(place(s['pos'], tmpl, alt, root if k != 0 else None))
        return out_l

    def anim_frames(cname):
        return frame_cache[cname]

    os.makedirs(os.path.join(out, 'icons'), exist_ok=True)
    # A run cut short goes on where it stopped: the classes done are kept (the index is written
    # after each class).
    ip = os.path.join(out, 'index.json')
    result = json.load(open(ip)) if os.path.exists(ip) else {'items': {}, 'layers': {}}
    for cls, H in index.items():
        if cls in result['layers'] and result.get('list') == want:
            print(cls, 'done before', flush=True)
            continue
        anims = class_anims(cls)
        cw, ch = H['cell']
        fx, fy = H['foot']
        rows = sorted(H['anims'], key=lambda k: H['anims'][k]['row'])
        ncol = max(H['anims'][k]['n'] for k in rows)
        nrow = max(H['anims'][k]['row'] for k in rows) + 1
        fr = {}
        for key in rows:
            f = anim_frames(anims[key])
            if len(f) != H['anims'][key]['n']:
                raise SystemExit(f'{cls} {key}: {len(f)} frames, the sheets have {H["anims"][key]["n"]}')
            fr[key] = f
        # Which frames the class's own pieces cover, by slot: a costume must cover them too.
        own = {}
        for kind in ('armor', 'helmet', 'cape', 'head'):
            lay = H['layers'].get(kind)
            if not lay:
                continue
            v = sorted(lay)[0]
            sh = Image.open(os.path.join(yh2, lay[v]['file']))
            cols = lay[v]['cols']
            own[kind] = {(key, i) for key in rows for i in range(H['anims'][key]['n'])
                         if sh.crop(((i % cols) * cw, (H['anims'][key]['row'] + i // cols) * ch,
                                     (i % cols + 1) * cw, (H['anims'][key]['row'] + i // cols + 1) * ch)).getbbox()}
        jobs = [(k, iid, tx) for (k, iid), tx in sorted(variants.items())] + [('nohair', 'nohair', {})]
        cdir = os.path.join(out, cls)
        os.makedirs(cdir, exist_ok=True)
        L = result['layers'].setdefault(cls, {})
        # A hat that holds the hair (WHOLE_HAT) must be there wherever the head is: a frame
        # without it would show the head bald.
        whole_need = {(k, i) for k, i in own.get('head', ()) if k != 'dead'}
        for kind, iid, tx in jobs:
            need = whole_need if kind == 'helmet' and 'WHOLE_HAT' in (table[iid].get('Tag') or []) else own.get(kind, ())
            drawn, ok = {}, True
            for key in rows:
                for i, (t, st) in enumerate(fr[key]):
                    d = layer_of(kind, tx, st)
                    # (a sheet's frame may be there and blank: as good as missing)
                    if d is None or ((key, i) in need and not any(im.getbbox() for im, _, _ in d)):
                        ok = False
                        break
                    drawn[(key, i)] = d
                if not ok:
                    break
            if not ok or not any(drawn.values()):
                continue
            allp = [p for v in drawn.values() for p in v]
            # The costume's own cell when it reaches past the class's.
            x0 = min([-fx] + [math.floor(x) for _, x, _ in allp])
            y0 = min([-fy] + [math.floor(y) for _, _, y in allp])
            x1 = max([cw - fx] + [math.ceil(x + im.width) for im, x, _ in allp])
            y1 = max([ch - fy] + [math.ceil(y + im.height) for im, _, y in allp])
            W, Hh, FX, FY = x1 - x0, y1 - y0, -x0, -y0
            sheet = Image.new('RGBA', (W * ncol, Hh * nrow))
            for key in rows:
                r = H['anims'][key]['row']
                for i in range(H['anims'][key]['n']):
                    for im, x, y in drawn[(key, i)]:
                        sheet.alpha_composite(im, ((i % ncol) * W + int(round(FX + x)), (r + i // ncol) * Hh + int(round(FY + y))))
            v = 'nohair' if kind == 'nohair' else f'c{iid}'
            k2 = 'head' if kind == 'nohair' else kind
            fn = f'{k2}_{v}.webp'
            sheet.save(os.path.join(cdir, fn), 'WEBP', lossless=True, quality=100, method=4)
            meta = {'file': f'{cls}/{fn}', 'cols': ncol}
            if (W, Hh, FX, FY) != (cw, ch, fx, fy):
                meta.update(cell=[W, Hh], foot=[FX, FY])
            L.setdefault(k2, {})[v] = meta
            if kind != 'nohair':
                it = result['items'].setdefault(iid, {'kind': kind, 'classes': []})
                if cls not in it['classes']:
                    it['classes'].append(cls)
        result['list'] = want
        json.dump(result, open(ip, 'w'), ensure_ascii=False, indent=0)
        print(cls, {k: len(v) for k, v in L.items()}, flush=True)

    # The items' own icons (their Sprite), and names.
    icon_tex = {}
    for (kind, iid) in variants:
        sp = (table[iid].get('Sprite') or [''])[-1]
        icon_tex[iid] = sp.split('/')[-1].lower()
    by_name = {}
    want_icons = set(icon_tex.values())
    for o, n, _, area in lite:
        n = n.lower() + '.png'
        if n in want_icons and (n not in by_name or area > by_name[n][1]):
            by_name[n] = (o, area)
    by_name = {n: o.read() for n, (o, _) in by_name.items()}
    for iid, it in result['items'].items():
        tags = table[iid].get('Tag') or []
        it['name'] = names.get(iid, '')
        it['whole'] = it['kind'] == 'helmet' and 'WHOLE_HAT' in tags
        sp = by_name.get(icon_tex.get(iid))
        if sp is not None:
            im = sp.image.convert('RGBA')
            box = im.getbbox()
            if box:
                im = im.crop(box)
            if max(im.size) > 64:
                k = 64 / max(im.size)
                im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
            im.save(os.path.join(out, 'icons', f'{iid}.png'), optimize=True)
            it['icon'] = f'icons/{iid}.png'
    missing = [f'{k}:{i}' for (k, i) in variants if i not in result['items']]
    print('items', len(result['items']), 'not drawn for any class', missing)
    result.pop('list', None)
    json.dump(result, open(ip, 'w'), ensure_ascii=False, indent=0)


if __name__ == '__main__':
    main()
