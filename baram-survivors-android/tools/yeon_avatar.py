#!/usr/bin/env python3
"""Player-character sheets from 바람의나라 연's own avatar: yeon_avatar.py UNITS ITEMS OUT_DIR [CLASSES_JSON]

UNITS and ITEMS are Units.unity3d and Items.unity3d from the game's downloaded resources, un-XORed
(see tools/yeon_units.py, dexor()). They must be loaded together: the player clips of the
Avatar_0001 prefab (Units) name their sprites in Items.

How 연 draws a player: the prefab Avatar_0001 has a child "Sprite" with the Animator and one
SpriteRenderer child per part (Skin, Head, Face, Hair, Hair_b, Hat, Weapon, Weapon_back, Sheild,
Cape, ...). Each clip keys, per part, the sprite (pptr curve), the part's local position
(Transform curves) and its sorting (SkinSlot / renderer curves). Bindings name parts by the CRC32
of their path under "Sprite". This tool evaluates the clips frame by frame (stepped, as sprite
swaps are), lays every part with its pivot at its local position (1 unit = 1 pixel), draws them
by sorting order, and packs the frames like the monster sheets:

    OUT_DIR/<cls>.png, OUT_DIR/index.json
    {"warrior": {"cell": [w, h], "foot": [x, y], "anims": {"walk_down": {"row", "n", "ms"}, ...}}}

A class look swaps parts by sprite-name prefix (CLASSES_JSON: {"warrior": {"Item_0001_E": "Weapon_..."}}).
"side" faces left as 연 draws it.
"""
import json
import os
import re
import struct
import sys
import zlib

import numpy as np
import UnityPy
from PIL import Image

ANIMS = {
    'walk_down': 'Avatar_0001_Walk_Down', 'walk_up': 'Avatar_0001_Walk_Up', 'walk_side': 'Avatar_0001_Walk_Side',
    'idle_down': 'Avatar_0001_Idle_Down', 'idle_up': 'Avatar_0001_Idle_Up', 'idle_side': 'Avatar_0001_Idle_Side',
    'atk_down': 'Avatar_0001_Attack_Down', 'atk_up': 'Avatar_0001_Attack_Up', 'atk_side': 'Avatar_0001_Attack_Side',
    'cast_down': 'Avatar_0001_Spell_Down', 'cast_up': 'Avatar_0001_Spell_Up', 'cast_side': 'Avatar_0001_Spell_Side',
    'dead': 'Avatar_0001_Dead',
}
# Curves a binding takes: Transform position / rotation (quaternion) / scale / euler.
TRANSFORM_CURVES = {1: 3, 2: 4, 3: 3, 4: 3}


def streamed_keys(clip, total=None):
    """{curve: [(time, value), ...]} from the streamed, dense and constant parts of a clip."""
    data = clip.m_MuscleClip.m_Clip.data
    keys = {}
    sc = data.m_StreamedClip
    buf = struct.pack(f'<{len(sc.data)}I', *sc.data)
    i = 0
    while i < len(buf):
        t, cnt = struct.unpack_from('<fI', buf, i)
        i += 8
        for _ in range(cnt):
            ci = struct.unpack_from('<i', buf, i)[0]
            co = struct.unpack_from('<4f', buf, i + 4)
            i += 20
            if t < 1e30:
                # A key at -infinity is the curve's opening value.
                keys.setdefault(ci, []).append((max(t, 0.0), co[3]))
    n_stream = sc.curveCount
    dc = data.m_DenseClip
    for f in range(dc.m_FrameCount):
        t = dc.m_BeginTime + f / dc.m_SampleRate
        for c in range(dc.m_CurveCount):
            keys.setdefault(n_stream + c, []).append((t, dc.m_SampleArray[f * dc.m_CurveCount + c]))
    # Sprite (pptr) curves are stored in the streamed data but not counted in its curveCount:
    # the constant curves are the last ones of all.
    base = (total - len(data.m_ConstantClip.data)) if total is not None else n_stream + dc.m_CurveCount
    for c, v in enumerate(data.m_ConstantClip.data):
        keys.setdefault(base + c, []).append((0.0, v))
    return keys


def value_at(ks, t):
    v = ks[0][1]
    for kt, kv in ks:
        if kt <= t + 1e-4:
            v = kv
        else:
            break
    return v


def build(env):
    go = None
    for o in env.objects:
        if o.type.name == 'GameObject' and o.peek_name() == 'Avatar_0001':
            go = o.read()
            break
    sprite_go = go.m_Components[0].read().m_Children[0].read().m_GameObject.read()
    parts = {}  # crc -> dict(name, pos, order, renderer)

    def walk(g, path):
        comps = [c.read() for c in g.m_Components]
        tr = [c for c in comps if c.object_reader.type.name in ('Transform', 'RectTransform')][0]
        ren = [c for c in comps if c.object_reader.type.name == 'SpriteRenderer']
        p = tr.m_LocalPosition
        parts[zlib.crc32(path.encode()) if path else 0] = {
            'name': path or 'Sprite', 'pos': [p.x, p.y], 'order': ren[0].m_SortingOrder if ren else 0,
            'sprite': ren[0].m_Sprite if ren else None, 'active': g.m_IsActive}
        for ch in tr.m_Children:
            cg = ch.read().m_GameObject.read()
            walk(cg, (path + '/' if path else '') + cg.m_Name)

    walk(sprite_go, '')
    anim = [c.read() for c in sprite_go.m_Components if c.type.name == 'Animator'][0]
    ctrl = anim.m_Controller.read()
    clips = {r.read().m_Name: r.read() for r in ctrl.m_AnimationClips}
    return parts, clips


def frames(clip, parts):
    """[(time, {crc: {'sprite', 'pos', 'order', 'active'}})] for each key time of the clip.

    Curves are numbered over the bindings in order (a Transform position, rotation or scale
    takes 3 or 4, anything else 1); a sprite curve's value is an index into pptrCurveMapping."""
    cb = clip.m_ClipBindingConstant
    mapping = cb.pptrCurveMapping
    curve = 0
    plan = []
    for b in cb.genericBindings:
        n = TRANSFORM_CURVES.get(b.attribute, 1) if (b.typeID == 4 and not b.isPPtrCurve) else 1
        plan.append((b, list(range(curve, curve + n))))
        curve += n
    keys = streamed_keys(clip, curve)
    stop = clip.m_MuscleClip.m_StopTime
    times = sorted({round(t, 4) for ks in keys.values() for t, _ in ks if t < stop - 1e-4}) or [0.0]
    out = []
    for t in times:
        # Only the parts this clip gives a sprite are drawn: the prefab's own renderers hold
        # placeholder frames (whole bodies) that the game replaces.
        st = {k: {'sprite': None, 'pos': list(v['pos']), 'order': v['order'], 'active': v['active']} for k, v in parts.items()}
        for b, cs in plan:
            s = st.get(b.path)
            if s is None or any(c not in keys for c in cs):
                continue
            vals = [value_at(keys[c], t) for c in cs]
            if b.isPPtrCurve:
                if b.typeID == 212:
                    i = int(round(vals[0]))
                    s['sprite'] = mapping[i] if 0 <= i < len(mapping) else None
            elif b.typeID == 4 and b.attribute == 1:
                s['pos'] = [vals[0], vals[1]]
            elif b.typeID == 1:
                s['active'] = vals[0] > 0.5
            elif b.typeID == 114:
                s['order'] = vals[0]
        out.append((t, st))
    # One loop: the walk clips repeat their cycle; keep the frames where the body changes,
    # up to its first return to the opening frame.
    def sig(st):
        r = st[0]['sprite']
        return (r.path_id if r is not None else 0, tuple(round(v, 1) for v in st[0]['pos']))
    if len(out) > 4:
        kept = [out[0]]
        for t, st in out[1:]:
            if sig(st) != sig(kept[-1][1]):
                if sig(st) == sig(out[0][1]) and len(kept) >= 2:
                    stop = t
                    break
                kept.append((t, st))
        out = kept
    return out, stop


def render(state, swap, cache):
    """Image layers of one frame: [(img, x, y)] with (x, y) where the image's top-left goes,
    in pixels with y down, origin at the avatar's feet."""
    layers = []
    for k, s in state.items():
        ref = s['sprite']
        if not s['active'] or ref is None or not ref.path_id:
            continue
        try:
            sp = ref.read()
        except Exception:
            continue
        name = sp.m_Name
        geo = None
        drop = False
        for a, b in swap.items():
            if name.startswith(a):
                if not b:
                    drop = True  # an empty swap takes the part off (the template's helmet, beard...)
                    break
                alt = cache['byname'].get(b + name[len(a):])
                if alt is not None:
                    # The slot keeps its geometry: a worn piece is drawn where the template
                    # piece was (armor sheets carry a corner pivot of their own).
                    if (int(alt.m_Rect.width), int(alt.m_Rect.height)) == (int(sp.m_Rect.width), int(sp.m_Rect.height)):
                        geo = sp
                    sp = alt
                    name = sp.m_Name
                break
        if drop:
            continue
        key = (name, sp.object_reader.path_id)
        if key not in cache['img']:
            cache['img'][key] = sp.image
        im = cache['img'][key]
        g = geo or sp
        r = g.m_Rect
        px, py = g.m_Pivot.x * r.width, (1 - g.m_Pivot.y) * r.height
        # Tightly packed sprites come back trimmed: put the picture where it sits in its rect.
        off = sp.m_RD.textureRectOffset
        px -= off.x
        py -= sp.m_Rect.height - off.y - im.height
        x, y = s['pos']
        # Parts sit under "Sprite", whose own position is the root of the drawing.
        if k != 0:
            x += state[0]['pos'][0]
            y += state[0]['pos'][1]
        layers.append((s['order'], k, im, x - px, -y - py))
    layers.sort(key=lambda l: (l[0], l[1]))
    return [(im, x, y) for _, _, im, x, y in layers]


def main():
    units, items, out = sys.argv[1:4]
    classes = json.load(open(sys.argv[4])) if len(sys.argv) > 4 else {'default': {}}
    os.makedirs(out, exist_ok=True)
    env = UnityPy.load(units, items)
    parts, clips = build(env)
    byname = {}
    prefixes = {b for sw in classes.values() for b in sw.values() if b}
    for o in env.objects:
        if o.type.name == 'Sprite':
            n = o.peek_name()
            for p in prefixes:
                if n.startswith(p):
                    sp = o.read()
                    # Names repeat across sheets: keep the one cut from the item's own texture.
                    # The texture is the item's own sheet: "item_1000" for Item_1000_E_*, or "Item_3226_E".
                    stem = p.rstrip('_').lower()
                    tname = sp.m_RD.texture.read().m_Name.lower()
                    own = tname == stem or tname == re.sub(r'_[es]$', '', stem)
                    if n not in byname or own:
                        byname[n] = sp
                    break
    cache = {'img': {}, 'byname': byname}
    index = {}
    for cls, swap in classes.items():
        rows = []
        for key, cname in ANIMS.items():
            clip = clips.get(cname)
            if clip is None:
                continue
            fr, stop = frames(clip, parts)
            pics = [render(st, swap, cache) for _, st in fr]
            ts = [t for t, _ in fr] + [stop]
            ms = [max(40, int(round((ts[i + 1] - ts[i]) * 1000))) for i in range(len(fr))]
            rows.append((key, pics, int(round(sum(ms) / len(ms)))))
        allp = [l for _, ps, _ in rows for p in ps for l in p]
        left = -min(x for _, x, _ in allp)
        top = -min(y for _, _, y in allp)
        right = max(x + im.width for im, x, _ in allp)
        bottom = max(y + im.height for im, _, y in allp)
        cw, ch = int(np.ceil(left + right)), int(np.ceil(top + bottom))
        ncol = max(len(ps) for _, ps, _ in rows)
        sheet = Image.new('RGBA', (cw * ncol, ch * len(rows)))
        meta = {}
        for ri, (key, ps, ms) in enumerate(rows):
            for ci, layers in enumerate(ps):
                cell = Image.new('RGBA', (cw, ch))
                for im, x, y in layers:
                    cell.alpha_composite(im.convert('RGBA'), (int(round(left + x)), int(round(top + y))))
                sheet.paste(cell, (ci * cw, ri * ch))
            meta[key] = {'row': ri, 'n': len(ps), 'ms': ms}
        sheet.save(os.path.join(out, cls + '.png'), optimize=True)
        index[cls] = {'cell': [cw, ch], 'foot': [int(round(left)), int(round(top))], 'anims': meta}
        print(cls, [cw, ch], {k: v['n'] for k, v in meta.items()})
    json.dump(index, open(os.path.join(out, 'index.json'), 'w'), indent=0)


if __name__ == '__main__':
    main()
