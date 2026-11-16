#!/usr/bin/env python3
"""바람의나라 연's own skill effects and icons, from its decrypted Skills bundle.

    yeon_skills.py SKILLS_BUNDLE[,FXS_BUNDLE] MAPPING_JSON OUT_DIR [ICON_OUT_DIR]

MAPPING_JSON: {ourSkillId: {"prefab": "Skill_Effect_0162", "icon": "skill_fighter_110401"}} ("add_own": true
when the prefab's own materials are additive, see render())
(made from the game's Skills_Player table and its Korean names; see yeon_skill_map.py).

Each effect prefab is a root (or nested) Animator driving child SpriteRenderers: the clip swaps
their sprites (PPtr curves) and fades / moves / scales them (float curves). The clip is decoded
from Unity's streamed / dense / constant curve data and sampled at up to 20 frames a second;
every renderer is drawn at its place (sprite pivot, pixels per unit), additive renderers added
on black, the rest alpha-blended. Particle systems are not drawn.

Writes OUT_DIR/<id>.png (a horizontal strip of equal cells) and OUT_DIR/index.json:
{id: {cell: [w, h], n, ms, add, anchor: [x, y]}} — anchor is where the effect's origin (the
target's feet) falls in a cell. Icons go to ICON_OUT_DIR/<id>.png.
"""
import json
import os
import struct
import sys
import zlib

import numpy as np
import UnityPy
from PIL import Image

MAX_FRAMES = 24


def child_paths(tr, prefix=''):
    """(path, transform) for every node below a transform, paths as the Animator binds them."""
    out = []
    for ch in tr.m_Children:
        t = ch.read()
        name = t.m_GameObject.read().m_Name
        p = prefix + name
        out.append((p, t))
        out.extend(child_paths(t, p + '/'))
    return out


def comp(go, kind):
    kinds = ('Transform', 'RectTransform') if kind == 'Transform' else (kind,)
    for c in go.m_Components:
        if c.type.name in kinds:
            return c.read()
    return None


def pid(o):
    r = getattr(o, 'object_reader', None)
    return r.path_id if r is not None else getattr(o, 'path_id', None)


def decode_streamed(data):
    """Unity's streamed clip: frames of (time, keys[(curve, coeffs a b c d)])."""
    raw = struct.pack(f'<{len(data)}I', *data)
    keys = {}
    p = 0
    while p + 8 <= len(raw):
        t, n = struct.unpack_from('<fI', raw, p)
        p += 8
        for _ in range(n):
            idx, a, b, c, d = struct.unpack_from('<I4f', raw, p)
            p += 20
            keys.setdefault(idx, []).append((t, d))
    return keys


def curves_of(clip):
    """{curve index: [(time, value)]} over streamed, dense and constant data."""
    mc = clip.m_MuscleClip.m_Clip.data
    s = mc.m_StreamedClip
    keys = decode_streamed(s.data) if s.data else {}
    ns = s.curveCount
    d = mc.m_DenseClip
    if d.m_FrameCount and d.m_CurveCount:
        arr = np.array(d.m_SampleArray, dtype=float).reshape(d.m_FrameCount, d.m_CurveCount)
        for j in range(d.m_CurveCount):
            keys[ns + j] = [(d.m_BeginTime + i / d.m_SampleRate, arr[i, j]) for i in range(d.m_FrameCount)]
    nd = d.m_CurveCount
    for j, v in enumerate(mc.m_ConstantClip.data):
        keys[ns + nd + j] = [(0.0, v)]
    # Unity stores a streamed curve's last key at +inf; drop those.
    for k in keys:
        keys[k] = [(t, v) for t, v in keys[k] if t < 1e6]
    return keys


def binding_curves(b):
    if b.isPPtrCurve:
        return 1
    if b.typeID == 4:  # Transform: position 3, rotation 4, scale 3, euler 3
        return {1: 3, 2: 4, 3: 3, 4: 3}.get(b.attribute, 1)
    return 1


def step_at(keys, t, dflt=None):
    v = dflt
    for kt, kv in keys:
        if kt <= t + 1e-6:
            v = kv
        else:
            break
    return v


def lerp_at(keys, t, dflt):
    if not keys:
        return dflt
    if t <= keys[0][0]:
        return keys[0][1]
    for (t0, v0), (t1, v1) in zip(keys, keys[1:]):
        if t0 <= t <= t1:
            return v0 if t1 == t0 else v0 + (v1 - v0) * (t - t0) / (t1 - t0)
    return keys[-1][1]


def sprite_img(sp, cache):
    if sp.path_id in cache:
        return cache[sp.path_id]
    s = sp.read() if hasattr(sp, 'read') else sp
    im = s.image.convert('RGBA')
    ppu = s.m_PixelsToUnits or 100
    # Pivot in pixels from the sprite's bottom-left (Unity's m_Pivot is 0..1 of the rect).
    pv = (s.m_Pivot.x * s.m_Rect.width, s.m_Pivot.y * s.m_Rect.height)
    cache[sp.path_id] = (im, ppu, pv)
    return cache[sp.path_id]


def is_additive(r):
    for m in r.m_Materials:
        try:
            mat = m.read()
            sh = mat.m_Shader.read().m_Name.lower() if mat.m_Shader.path_id else ''
            nm = mat.m_Name.lower()
            if 'add' in sh or 'add' in nm or 'additive' in sh or nm.endswith('_a'):
                return True
        except Exception:
            pass
    return False


def material_names(r):
    out = []
    for m in r.m_Materials:
        try:
            out.append(m.read().m_Name)
        except Exception:
            pass
    return out


def render(go, add_own=False, alpha_only=False):
    """add_own: renderers with a material of their own (not Sprites-Default) are additive. Their
    shaders live in another bundle, so the name test above cannot tell; the mapping says so.
    alpha_only: none is (a material whose name merely ends in _a, as the 도깨비's Totem_A)."""
    root_tr = comp(go, 'Transform')
    nodes = [('', root_tr)] + child_paths(root_tr)
    by_hash = {zlib.crc32(p.encode()) & 0xffffffff: (p, t) for p, t in nodes}
    rends = []
    for p, t in nodes:
        g = t.m_GameObject.read()
        r = comp(g, 'SpriteRenderer')
        if r is not None and g.m_IsActive is not False:
            rends.append({'path': p, 'tr': t, 'r': r, 'sprite': r.m_Sprite if r.m_Sprite.path_id else None,
                          'alpha': r.m_Color.a, 'add': not alpha_only and (is_additive(r) or add_own) and (is_additive(r) or any(
                              n != 'Sprites-Default' for n in material_names(r))), 'order': r.m_SortingOrder,
                          'flip': (r.m_FlipX, r.m_FlipY), 'anim': {}})
    if not rends:
        return None
    # Animators anywhere in the tree drive the paths below them.
    length = 0.5
    for p, t in nodes:
        g = t.m_GameObject.read()
        an = comp(g, 'Animator')
        if an is None or not an.m_Controller.path_id:
            continue
        ctrl = an.m_Controller.read()
        clips = getattr(ctrl, 'm_AnimationClips', None) or []
        if not clips:
            continue
        clip = clips[0].read()
        length = max(length, clip.m_MuscleClip.m_StopTime)
        bc = clip.m_ClipBindingConstant
        keys = curves_of(clip)
        pptr = list(bc.pptrCurveMapping)
        ci = 0
        for b in bc.genericBindings:
            n = binding_curves(b)
            full = (p + '/' if p else '')
            target = None
            for rr in rends:
                rel = rr['path'][len(full):] if rr['path'].startswith(full) or not full else None
                if rel is not None and (zlib.crc32(rel.encode()) & 0xffffffff) == b.path:
                    target = rr
            if target is None and b.path == 0:
                target = next((rr for rr in rends if rr['path'] == p), None)
            if target is not None:
                if b.isPPtrCurve and b.typeID == 212:
                    target['anim']['sprite'] = [(t_, pptr[int(v)] if 0 <= int(v) < len(pptr) else None) for t_, v in keys.get(ci, [])]
                elif b.typeID == 212 and n == 1:
                    target['anim'].setdefault('alpha', keys.get(ci, []))
                elif b.typeID == 4 and b.attribute == 1:
                    target['anim']['pos'] = [keys.get(ci + j, []) for j in range(3)]
                elif b.typeID == 4 and b.attribute == 3:
                    target['anim']['scale'] = [keys.get(ci + j, []) for j in range(3)]
            ci += n
    fps = min(20, max(8, MAX_FRAMES / max(length, 0.05)))
    nfr = max(1, min(MAX_FRAMES, int(round(length * fps))))
    cache = {}
    W = H = 1400
    ox, oy = W // 2, H // 2
    frames, adds = [], []
    for k in range(nfr):
        t = k / fps
        layer_add = np.zeros((H, W, 3), float)
        layer_alpha = Image.new('RGBA', (W, H))
        drew = False
        for rr in sorted(rends, key=lambda r: r['order']):
            sp = rr['sprite']
            if 'sprite' in rr['anim']:
                sp = step_at(rr['anim']['sprite'], t, sp)
            if sp is None or not getattr(sp, 'path_id', 0):
                continue
            a = rr['alpha']
            if 'alpha' in rr['anim']:
                a = lerp_at(rr['anim']['alpha'], t, a)
            if a <= 0.02:
                continue
            im, ppu, pv = sprite_img(sp, cache)
            # World place of the renderer: its transforms' positions and scales up to the root.
            tr = rr['tr']
            px = py = 0.0
            sx = sy = 1.0
            chain = []
            node = tr
            while node is not None:
                chain.append(node)
                node = node.m_Father.read() if node.m_Father.path_id else None
            for node in reversed(chain[:-1] if len(chain) > 1 else []):
                pass
            # Apply from the renderer up: local pos scaled by parents' scales.
            lp = [tr.m_LocalPosition.x, tr.m_LocalPosition.y]
            ls = [tr.m_LocalScale.x, tr.m_LocalScale.y]
            if 'pos' in rr['anim']:
                lp = [lerp_at(rr['anim']['pos'][0], t, lp[0]), lerp_at(rr['anim']['pos'][1], t, lp[1])]
            if 'scale' in rr['anim']:
                ls = [lerp_at(rr['anim']['scale'][0], t, ls[0]), lerp_at(rr['anim']['scale'][1], t, ls[1])]
            px, py, sx, sy = lp[0], lp[1], ls[0], ls[1]
            node = tr.m_Father.read() if tr.m_Father.path_id else None
            while node is not None and pid(node) != pid(root_tr):
                psx, psy = node.m_LocalScale.x, node.m_LocalScale.y
                px, py = px * psx + node.m_LocalPosition.x, py * psy + node.m_LocalPosition.y
                sx, sy = sx * psx, sy * psy
                node = node.m_Father.read() if node.m_Father.path_id else None
            w = max(1, int(round(im.width * abs(sx))))
            h = max(1, int(round(im.height * abs(sy))))
            img = im.resize((w, h), Image.BILINEAR) if (w, h) != im.size else im
            if sx < 0 or rr['flip'][0]:
                img = img.transpose(Image.FLIP_LEFT_RIGHT)
            if sy < 0 or rr['flip'][1]:
                img = img.transpose(Image.FLIP_TOP_BOTTOM)
            cx = ox + px * ppu - pv[0] * abs(sx)
            cy = oy - py * ppu - (im.height - pv[1]) * abs(sy)
            x0, y0 = int(round(cx)), int(round(cy))
            if x0 < 0 or y0 < 0 or x0 + w > W or y0 + h > H:
                continue
            arr = np.asarray(img).astype(float)
            if rr['add']:
                layer_add[y0:y0 + h, x0:x0 + w] += arr[:, :, :3] * (arr[:, :, 3:4] / 255) * a
            else:
                if a < 1:
                    arr[:, :, 3] *= a
                    img = Image.fromarray(arr.astype(np.uint8))
                layer_alpha.alpha_composite(img, (x0, y0))
            drew = True
        frames.append((layer_alpha, layer_add))
        adds.append(drew)
    return frames, fps, ox, oy, any(r['add'] for r in rends)


def to_strip(frames, ox, oy, add):
    """Crops every frame to the union of what is drawn and lays them side by side.
    Additive effects are flattened onto black (the game adds them); the rest keep alpha."""
    outs = []
    for al, ad in frames:
        if add:
            base = np.asarray(al.convert('RGB')).astype(float) * (np.asarray(al)[:, :, 3:4] / 255)
            rgb = np.clip(base + ad, 0, 255).astype(np.uint8)
            m = rgb.max(2)
            outs.append(Image.fromarray(np.dstack([rgb, np.where(m > 6, 255, 0).astype(np.uint8)])))
        else:
            outs.append(al)
    box = None
    for o in outs:
        b = o.getbbox()
        if b:
            box = b if box is None else (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
    if box is None:
        return None
    cw, ch = box[2] - box[0], box[3] - box[1]
    strip = Image.new('RGBA', (cw * len(outs), ch))
    for i, o in enumerate(outs):
        strip.paste(o.crop(box), (i * cw, 0))
    if add:
        strip = Image.fromarray(np.asarray(strip)[:, :, :3]).convert('RGB')
    return strip, (cw, ch), (ox - box[0], oy - box[1])


def main():
    bundle, mapping, out = sys.argv[1], sys.argv[2], sys.argv[3]
    icon_out = sys.argv[4] if len(sys.argv) > 4 else None
    os.makedirs(out, exist_ok=True)
    if icon_out:
        os.makedirs(icon_out, exist_ok=True)
    m = json.load(open(mapping))
    # SKILLS_BUNDLE may name more bundles, comma-separated (FXs.unity3d holds what some prefabs use).
    env = UnityPy.load(*bundle.split(','))
    cont = {k.rsplit('/', 1)[-1].rsplit('.', 1)[0].lower(): v for k, v in env.container.items()}
    index = {}
    for sid, spec in m.items():
        pf = spec.get('prefab')
        if pf and pf.lower() in cont:
            try:
                res = render(cont[pf.lower()].read(), bool(spec.get('add_own')), bool(spec.get('alpha_only')))
            except Exception as e:
                print(sid, pf, 'render failed', e)
                res = None
            if res:
                frames, fps, ox, oy, add = res
                st = to_strip(frames, ox, oy, add)
                if st:
                    strip, cell, anchor = st
                    strip.save(os.path.join(out, sid + '.png'), optimize=True)
                    index[sid] = {'cell': list(cell), 'n': len(frames), 'ms': round(1000 / fps), 'add': add,
                                  'anchor': [int(anchor[0]), int(anchor[1])], 'prefab': pf}
                    print(sid, pf, cell, len(frames), 'add' if add else 'alpha')
        ic = spec.get('icon')
        if icon_out and ic and ic.lower() in cont:
            try:
                obj = cont[ic.lower()].read()
                im = obj.image
                im.convert('RGBA').save(os.path.join(icon_out, sid + '.png'))
            except Exception as e:
                print(sid, 'icon failed', e)
    json.dump(index, open(os.path.join(out, 'index.json'), 'w'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
