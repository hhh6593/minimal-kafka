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


def streamed_keys(clip):
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
            if t > -1e30 and t < 1e30:
                keys.setdefault(ci, []).append((t, co[3]))
    n_stream = sc.curveCount
    dc = data.m_DenseClip
    for f in range(dc.m_FrameCount):
        t = dc.m_BeginTime + f / dc.m_SampleRate
        for c in range(dc.m_CurveCount):
            keys.setdefault(n_stream + c, []).append((t, dc.m_SampleArray[f * dc.m_CurveCount + c]))
    base = n_stream + dc.m_CurveCount
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


def family(ref):
    """What kind of part a mapped sprite is, to tell where one binding's keys end."""
    if ref is None or not ref.path_id:
        return 'none'
    try:
        n = ref.read().m_Name
    except Exception:
        return 'none'
    return re.sub(r'_\d+$', '', n)


def pptr_groups(mapping, nbind):
    """Splits pptrCurveMapping into one run of keys per sprite binding (in binding order):
    runs of the same part family; a run shared by two bindings (a part and its _color twin,
    or two empty parts) is split evenly."""
    fams = [family(r) for r in mapping]
    runs = []
    for i, f in enumerate(fams):
        if runs and runs[-1][0] == f:
            runs[-1][1].append(i)
        else:
            runs.append([f, [i]])
    # Split runs until there is one per binding: a run whose length is a multiple of a
    # neighbour-sized group is cut in halves first.
    while len(runs) < nbind:
        cand = [r for r in runs if len(r[1]) > 1]
        if not cand:
            break
        best = max(cand, key=lambda r: (len(r[1]) % 2 == 0, len(r[1])))
        i = runs.index(best)
        h = len(best[1]) // 2
        runs[i:i + 1] = [[best[0], best[1][:h]], [best[0], best[1][h:]]]
    return [[mapping[j] for j in r[1]] for r in runs]


def frames(clip, parts):
    """[(time, {crc: {'sprite', 'pos', 'order', 'active'}})] for each key time of the clip."""
    cb = clip.m_ClipBindingConstant
    mapping = cb.pptrCurveMapping
    keys = streamed_keys(clip)
    curve = 0
    plan = []
    pbind = []
    # Float curves are numbered over the non-sprite bindings only; sprite keys live in
    # pptrCurveMapping, one run per sprite binding, spread evenly over the clip.
    for b in cb.genericBindings:
        if b.isPPtrCurve:
            pbind.append(b)
            continue
        n = TRANSFORM_CURVES.get(b.attribute, 1) if b.typeID == 4 else 1
        plan.append((b, list(range(curve, curve + n))))
        curve += n
    groups = pptr_groups(mapping, len(pbind))
    stop = clip.m_MuscleClip.m_StopTime
    times = sorted({round(t, 4) for ks in keys.values() for t, _ in ks})
    for g in groups:
        if len(g) > 1:
            times += [round(i * stop / (len(g) - 1), 4) for i in range(len(g))]
    times = sorted({t for t in times if t < stop - 1e-4}) or [0.0]
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
            if b.typeID == 4 and b.attribute == 1:
                s['pos'] = [vals[0], vals[1]]
            elif b.typeID == 1:
                s['active'] = vals[0] > 0.5
            elif b.typeID == 114:
                s['order'] = vals[0]
        for b, g in zip(pbind, groups):
            s = st.get(b.path)
            if s is None or not g:
                continue
            i = 0 if len(g) == 1 else min(len(g) - 1, int(t / (stop / (len(g) - 1)) + 1e-4))
            s['sprite'] = g[i]
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
        for a, b in swap.items():
            if name.startswith(a):
                alt = cache['byname'].get(b + name[len(a):])
                if alt is not None:
                    sp = alt
                    name = sp.m_Name
                break
        if name not in cache['img']:
            cache['img'][name] = sp.image
        im = cache['img'][name]
        r = sp.m_Rect
        px, py = sp.m_Pivot.x * r.width, (1 - sp.m_Pivot.y) * r.height
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
    prefixes = {b for sw in classes.values() for b in sw.values()}
    for o in env.objects:
        if o.type.name == 'Sprite':
            n = o.peek_name()
            if any(n.startswith(p) for p in prefixes):
                byname[n] = o.read()
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
