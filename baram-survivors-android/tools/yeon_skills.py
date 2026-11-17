#!/usr/bin/env python3
"""바람의나라 연's own skill effects and icons, from its decrypted Skills bundle.

    yeon_skills.py SKILLS_BUNDLE[,FXS_BUNDLE] MAPPING_JSON OUT_DIR [ICON_OUT_DIR]

MAPPING_JSON: {ourSkillId: {"prefab": "Skill_Effect_0162", "icon": "skill_fighter_110401"}} ("add_own": true
when the prefab's own materials are additive, see render())
(made from the game's Skills_Player table and its Korean names; see yeon_skill_map.py).

Each effect prefab is a root (or nested) Animator driving child SpriteRenderers and ParticleSystems:
the clip swaps sprites (PPtr curves), shows and hides nodes (m_IsActive), fades, tints, moves, turns
and scales them, and animates their materials' colours and steps. The clip is decoded from Unity's
streamed (each key's segment polynomial, so stepped turns stay stepped) / dense / constant curve data
and sampled at up to 20 frames a second. Every renderer is drawn at its place with its node's full
2D transform (pivot, pixels per unit, rotation and tilt, scale): sprites through approximations of
the client's effect shaders (shade(): channel-recoloured, stepped-explosion, radial "pizza", twirl,
material-texture-on-a-quad), particle systems simulated (bursts / rates, shapes, start values,
lifetime size / colour / rotation, sprite-sheet frames, stretched billboards); additive ones added
on black, the rest alpha-blended.

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
            # (time, value, segment cubic): Unity's keys carry the segment's polynomial, so a
            # stepped curve (a turn snapped at the end) is not eased in by a straight line.
            keys.setdefault(idx, []).append((t, d, (a, b, c)))
    return keys


def curves_of(clip):
    """{curve index: [(time, value)]} over streamed, dense and constant data."""
    mc = clip.m_MuscleClip.m_Clip.data
    s = mc.m_StreamedClip
    keys = decode_streamed(s.data) if s.data else {}
    # curveCount can read 0 although the streamed data holds curves (UnityPy on these clips): the dense
    # and constant curves come after the highest streamed index, not over it.
    ns = max(s.curveCount, max(keys) + 1 if keys else 0)
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
        keys[k] = [kk for kk in keys[k] if kk[0] < 1e6]
    return keys


def binding_curves(b):
    if b.isPPtrCurve:
        return 1
    if b.typeID == 4:  # Transform: position 3, rotation 4, scale 3, euler 3
        return {1: 3, 2: 4, 3: 3, 4: 3}.get(b.attribute, 1)
    return 1


def step_at(keys, t, dflt=None):
    v = dflt
    for kk in keys:
        if kk[0] <= t + 1e-6:
            v = kk[1]
        else:
            break
    return v


def lerp_at(keys, t, dflt):
    if not keys:
        return dflt
    if t <= keys[0][0]:
        return keys[0][1]
    for k0, k1 in zip(keys, keys[1:]):
        t0, v0, t1, v1 = k0[0], k0[1], k1[0], k1[1]
        if t0 <= t <= t1:
            if len(k0) > 2 and t0 > -1e30:
                a, b, c = k0[2]
                x = t - t0
                v = ((a * x + b) * x + c) * x + v0
                if np.isfinite(v):
                    return v
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


ACTIVE = zlib.crc32(b'm_IsActive') & 0xffffffff
COLOR_ATTR = {zlib.crc32(f'm_Color.{c}'.encode()) & 0xffffffff: i for i, c in enumerate('rgba')}
W_CANVAS, H_CANVAS, OX, OY = 2000, 2000, 1000, 1150


def shader_name(mat):
    try:
        sh = mat.m_Shader.read() if mat.m_Shader.path_id else None
        return (sh.m_Name or sh.m_ParsedForm.m_Name) if sh else ''
    except Exception:
        return ''


def mat_info(r):
    """The renderer's first material: shader name, float / colour properties and textures."""
    for m in r.m_Materials:
        try:
            mat = m.read()
        except Exception:
            continue
        sp = mat.m_SavedProperties
        texs = {}
        for k, v in sp.m_TexEnvs:
            if v.m_Texture.path_id:
                texs[k] = v.m_Texture
        return {'name': mat.m_Name, 'shader': shader_name(mat), 'floats': dict(sp.m_Floats),
                'colors': {k: [c.r, c.g, c.b, c.a] for k, c in sp.m_Colors}, 'texs': texs}
    return {'name': '', 'shader': '', 'floats': {}, 'colors': {}, 'texs': {}}


def shader_additive(sh, matname=''):
    s = sh.lower()
    if 'premultiply' in s:
        return False
    return 'additive' in s or 'additve' in s or s.endswith('_add') or '/add' in s or 'add_' in s or s.endswith('add')


def tex_img(tp, cache):
    k = ('tex', tp.path_id)
    if k not in cache:
        try:
            cache[k] = np.asarray(tp.read().image.convert('RGBA')).astype(np.float32) / 255
        except Exception:
            cache[k] = None
    return cache[k]


def tex_name(tp, cache):
    k = ('name', tp.path_id)
    if k not in cache:
        try:
            cache[k] = tp.read().m_Name
        except Exception:
            cache[k] = ''
    return cache[k]


def resized(arr, w, h):
    if arr.shape[1] == w and arr.shape[0] == h:
        return arr
    im = Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8))
    return np.asarray(im.resize((max(1, w), max(1, h)), Image.BILINEAR)).astype(np.float32) / 255


def smooth(e0, e1, x):
    t = np.clip((x - e0) / max(1e-4, e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def layered(chans, cols):
    """Channel masks drawn over each other, the last on top: (rgb, alpha)."""
    h, w = chans[0].shape
    rgb = np.zeros((h, w, 3), np.float32)
    a = np.zeros((h, w), np.float32)
    for m, c in zip(chans, cols):
        ai = np.clip(m * c[3], 0, 1)
        rgb = rgb * (1 - ai[..., None]) + np.array(c[:3], np.float32) * ai[..., None]
        a = a + ai * (1 - a)
    return rgb, a


def shade(mi, props, sprite, cache):
    """Approximates 바람의나라 연's effect shaders (only their properties are in the bundle, not their
    programs): returns (RGBA float image laid over the sprite's quad, additive) or None to draw nothing.
    sprite: the sprite's RGBA float image, or None. A tiny sprite (a 4x4 square) only gives the quad:
    the shader draws its material's own texture over it."""
    sh = mi['shader']
    f = dict(mi['floats']); f.update({k: v for k, v in props.items() if not isinstance(v, list)})
    c = {k: list(v) for k, v in mi['colors'].items()}
    c.update({k: v for k, v in props.items() if isinstance(v, list)})
    add = shader_additive(sh)
    tint = c.get('_Color', [1, 1, 1, 1])

    def T(*names):
        for n in names:
            tp = mi['texs'].get(n)
            if tp is not None:
                im = tex_img(tp, cache)
                if im is not None:
                    return im
        return None
    base = sprite if sprite is not None and max(sprite.shape[:2]) > 16 else None
    if 'Channel_Color' in sh:
        src = base if base is not None else T('_Main')
        if src is None:
            return None
        on = [f.get('_Red', 0) > 0.5, f.get('_Green', 0) > 0.5, f.get('_Blue', 0) > 0.5]
        if not any(on):
            # No channel recoloured: the picture as it is, its black ground dropped (drawn as light).
            return np.dstack([src[..., :3] * np.array(tint[:3]), src[..., 3] * tint[3]]), True
        cols = [c.get('_BlurColor', [1, 1, 1, 1]), c.get('_GreenColor', [1, 1, 1, 1]), c.get('_RedColor', [1, 1, 1, 1])]
        rgb, a = layered([src[..., 2] * on[2], src[..., 1] * on[1], src[..., 0] * on[0]], cols)
        return np.dstack([rgb * np.array(tint[:3]), a * src[..., 3] * tint[3]]), '_Add' in sh
    if 'Ifrit_Raid/Explosion' in sh or 'Dissolve_Slash' in sh:
        src = base if base is not None and 'Dissolve_Slash' not in sh else T('_TextureSample2', '_Main')
        if src is None:
            return None
        chans, cols = [], []
        for ch, key, idx in (('Blue', 'B', 2), ('Green', 'G', 1), ('Red', 'R', 0)):
            colr = c.get(f'_{ch}_Color')
            if colr is None:
                continue
            x = src[..., idx]
            stp = f.get(f'_{ch}_Step')
            blur = f.get(f'_{ch}_Blur', f.get(f'_Blur_{ch}', 0.3))
            if stp is not None and (f.get(f'_{key}Step', 0) > 0.5 or 'Dissolve_Slash' in sh):
                x = smooth(stp, stp + max(0.02, blur), x)
            chans.append(x); cols.append(colr)
        if not chans:
            return None
        rgb, a = layered(chans, cols)
        return np.dstack([rgb * np.array(tint[:3]), a * src[..., 3] * tint[3]]), add
    if 'Pizza' in sh or 'Twirl' in sh:
        mask = T('_Mask')
        main = T('_TwirlTex') if 'Twirl' in sh else T('_Main')
        ref = mask if mask is not None else main
        if ref is None:
            return None
        hh, ww = ref.shape[:2]
        if 'Twirl' in sh:
            shape = mask[..., 3] * mask[..., :3].max(2) if mask is not None else np.ones((hh, ww), np.float32)
            mm = resized(main, ww, hh) if main is not None else np.ones((hh, ww, 4), np.float32)
            return np.dstack([mm[..., :3] * np.array(tint[:3]), np.clip(shape * mm[..., 3] * tint[3], 0, 1)]), add
        # "Pizza": a noise turning round a centre, cut by a dissolve step and a growing circle, inside a mask
        # (for Pizza_Fire the mask is the painted picture itself).
        n = resized(main, ww, hh)[..., :3].mean(2) if main is not None and mask is not None else np.full((hh, ww), 0.7, np.float32)
        yy, xx = np.mgrid[0:hh, 0:ww]
        d = np.hypot((xx + 0.5) / ww - 0.5, (yy + 0.5) / hh - 0.5)
        rng_ = f.get('_Circle_Range')
        circ = 1 - smooth(rng_ * 0.71 - 0.05, rng_ * 0.71 + 0.02, d) if rng_ is not None else 1.0
        st = f.get('_Dissolve', f.get('_MainStep', 0.0))
        bl = max(0.05, f.get('_MainBlur', 0.3))
        cut = smooth(st - bl * 0.5, st + bl * 0.5, n) if st > 0.01 else np.ones_like(n)
        if 'Pizza_Fire' in sh and mask is not None:
            rgb = mask[..., :3]
            a = mask[..., 3] * cut * circ
        else:
            shape = mask[..., 3] * mask[..., :3].max(2) if mask is not None else np.ones((hh, ww), np.float32)
            col = c.get('_BlurColor') or c.get('_SubColor') or [1, 1, 1, 1]
            rgb = np.ones((hh, ww, 3), np.float32) * np.array(col[:3], np.float32)
            a = shape * cut * circ * (0.35 + 0.65 * n)
        if f.get('_Subtract', 0) > 0.5:
            # subtracted from what is under it: a darkening
            return np.dstack([np.zeros((hh, ww, 3), np.float32), np.clip(a * 0.55 * tint[3], 0, 1)]), False
        return np.dstack([rgb * np.array(tint[:3]), np.clip(a * tint[3], 0, 1)]), add
    src = base
    on_quad = False
    if src is None and sh.startswith('Edit/'):
        # The shader's own picture over the quad: not a noise it only scrolls through (Noise_*).
        names = [n for n in ('_Main', '_TextureSample0', '_TextureSample2', '_MainTex') if n in mi['texs']]
        names = [n for n in names if not tex_name(mi['texs'][n], cache).lower().startswith('noise')]
        src = T(*names) if names else None
        on_quad = src is not None
    if src is None:
        src = sprite
    if src is None:
        return None
    if 'Meteo_Move' in sh and ('_MoveX' in f or '_MoveY' in f):
        # The picture slid across its quad by (_MoveX, _MoveY) parts of it, what leaves the quad
        # unseen: 평탄화's totems rise out of the ground as _MoveY goes from 1 to 0.
        hh, ww = src.shape[:2]
        dy, dx = int(round(f.get('_MoveY', 0) * hh)), int(round(-f.get('_MoveX', 0) * ww))
        out = np.zeros_like(src)
        ys0, ys1 = max(0, -dy), min(hh, hh - dy)
        xs0, xs1 = max(0, -dx), min(ww, ww - dx)
        if ys1 > ys0 and xs1 > xs0:
            out[ys0 + dy:ys1 + dy, xs0 + dx:xs1 + dx] = src[ys0:ys1, xs0:xs1]
        src = out
    if on_quad and src[..., 3].mean() > 0.9:
        # An opaque square (a fire or a glow the shader cuts round with masks we do not have): faded
        # out towards its edges, so it is a soft light and not a rectangle.
        hh, ww = src.shape[:2]
        yy, xx = np.mgrid[0:hh, 0:ww]
        d = np.hypot((xx + 0.5) / ww - 0.5, (yy + 0.5) / hh - 0.5) * 2
        src = src.copy()
        src[..., 3] *= np.clip(1 - d, 0, 1) ** 1.5
    tc = c.get('_TintColor')
    if tc and ('Legacy' in sh or 'Particles' in sh or 'ImageMove' in sh or 'Jjun' in sh):
        k = np.array(tint[:3]) * 2 * np.array(tc[:3]); al = tint[3] * 2 * tc[3]
    else:
        k = np.array(tint[:3]); al = tint[3]
    return np.dstack([np.clip(src[..., :3] * k, 0, 1), np.clip(src[..., 3] * al, 0, 1)]), add



def quat_m2(q):
    """Top-left 2x2 of a rotation (x, y, z, w): how a turned (or tilted) node lands on the screen plane."""
    x, y, z, w = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - w * z)],
                     [2 * (x * y + w * z), 1 - 2 * (x * x + z * z)]])


def euler_q(ex, ey, ez):
    """Unity's euler angles (degrees, applied z, x, y) as a quaternion (x, y, z, w)."""
    def q(ax, a):
        s, c_ = np.sin(np.radians(a) / 2), np.cos(np.radians(a) / 2)
        v = [0.0, 0.0, 0.0, c_]; v[ax] = s
        return v

    def mul(a, b):
        ax, ay, az, aw = a; bx, by, bz, bw = b
        return [aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx,
                aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz]
    return mul(mul(q(1, ey), q(0, ex)), q(2, ez))


def rot3(q):
    x, y, z, w = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
                     [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
                     [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)]])


class Canvas:
    def __init__(self):
        self.add = np.zeros((H_CANVAS, W_CANVAS, 3), np.float32)
        self.al = np.zeros((H_CANVAS, W_CANVAS, 4), np.float32)  # premultiplied
        self.drew = False

    def blit(self, img, A, add, alpha=1.0):
        """img: RGBA float (straight); A: 2x3, image pixel (u, v) -> canvas pixel."""
        h, w = img.shape[:2]
        corners = np.array([[0, 0, 1], [w, 0, 1], [0, h, 1], [w, h, 1]], float) @ A.T
        x0, y0 = np.floor(corners.min(0)).astype(int)
        x1, y1 = np.ceil(corners.max(0)).astype(int)
        x0, y0, x1, y1 = max(0, x0), max(0, y0), min(W_CANVAS, x1), min(H_CANVAS, y1)
        if x1 - x0 < 1 or y1 - y0 < 1 or alpha <= 0.004:
            return
        M = np.vstack([A, [0, 0, 1]])
        try:
            Mi = np.linalg.inv(M)
        except np.linalg.LinAlgError:
            return
        # canvas (x + x0, y + y0) -> image
        a, b, c = Mi[0]; d, e, f = Mi[1]
        coeffs = (a, b, a * x0 + b * y0 + c, d, e, d * x0 + e * y0 + f)
        pre = img.copy()
        pre[..., :3] *= pre[..., 3:4]
        chans = [Image.fromarray(np.ascontiguousarray(pre[..., i])).transform((x1 - x0, y1 - y0), Image.AFFINE, coeffs, Image.BILINEAR)
                 for i in range(4)]
        out = np.dstack([np.asarray(ch) for ch in chans]) * alpha
        if add:
            self.add[y0:y1, x0:x1] += out[..., :3]
        else:
            dst = self.al[y0:y1, x0:x1]
            dst *= (1 - out[..., 3:4])
            dst += out
        self.drew = True

    def frame(self):
        al = self.al
        a = al[..., 3:4]
        rgb = np.where(a > 1e-4, al[..., :3] / np.maximum(a, 1e-4), 0)
        layer_alpha = Image.fromarray((np.clip(np.dstack([rgb, a]), 0, 1) * 255).astype(np.uint8), 'RGBA')
        return layer_alpha, (np.clip(self.add, 0, 1) * 255).astype(np.uint8)


def minmax(mm, x=0.0, rnd=0.5):
    """A MinMaxCurve (typetree dict) at normalised time x with a random factor rnd."""
    st = mm.get('minMaxState', 0)
    s = mm.get('scalar', 0.0)
    if st == 0:
        return s
    if st == 3:
        return mm.get('minScalar', 0.0) + (s - mm.get('minScalar', 0.0)) * rnd
    hi = curve_at(mm.get('maxCurve', {}).get('m_Curve', []), x) * s
    if st == 2:
        lo = curve_at(mm.get('minCurve', {}).get('m_Curve', []), x) * s
        return lo + (hi - lo) * rnd
    return hi


def curve_at(keys, x):
    if not keys:
        return 1.0
    if x <= keys[0]['time']:
        return keys[0]['value']
    for k0, k1 in zip(keys, keys[1:]):
        if k0['time'] <= x <= k1['time']:
            dt = k1['time'] - k0['time']
            if dt <= 0:
                return k1['value']
            t = (x - k0['time']) / dt
            # Hermite with the keys' slopes, as Unity evaluates it.
            m0, m1 = k0.get('outSlope', 0) * dt, k1.get('inSlope', 0) * dt
            if not all(np.isfinite([m0, m1])):
                return k0['value']
            t2, t3 = t * t, t * t * t
            return (2 * t3 - 3 * t2 + 1) * k0['value'] + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * k1['value'] + (t3 - t2) * m1
    return keys[-1]['value']


def gradient_at(g, x):
    nc, na = g.get('m_NumColorKeys', 2), g.get('m_NumAlphaKeys', 2)
    ck = [(g[f'ctime{i}'] / 65535, g[f'key{i}']) for i in range(nc)]
    ak = [(g[f'atime{i}'] / 65535, g[f'key{i}']['a']) for i in range(na)]

    def lerp(keys, get):
        if x <= keys[0][0]:
            return get(keys[0][1])
        for (t0, v0), (t1, v1) in zip(keys, keys[1:]):
            if t0 <= x <= t1:
                u = 0 if t1 == t0 else (x - t0) / (t1 - t0)
                return get(v0) * (1 - u) + get(v1) * u
        return get(keys[-1][1])
    rgb = [lerp(ck, lambda v, ch=ch: v[ch]) for ch in 'rgb']
    return rgb + [lerp(ak, lambda v: v)]


def color_mm(cm, x, rnd):
    st = cm.get('minMaxState', 0)
    if st == 0:
        c_ = cm['maxColor']; return [c_['r'], c_['g'], c_['b'], c_['a']]
    if st == 2:
        a, b = cm['minColor'], cm['maxColor']
        return [a[k] + (b[k] - a[k]) * rnd for k in 'rgba']
    if st == 1:
        return gradient_at(cm['maxGradient'], x)
    if st == 3:
        a, b = gradient_at(cm['minGradient'], x), gradient_at(cm['maxGradient'], x)
        return [a[i] + (b[i] - a[i]) * rnd for i in range(4)]
    return gradient_at(cm['maxGradient'], rnd)


def particles(ps, t_rel, t_alive_end, seed):
    """The particles a ParticleSystem (typetree) shows t_rel seconds after it started:
    [(x, y, size_x, size_y, rot, rgba, frame, vx, vy)] in the system's local units."""
    rng = np.random.RandomState(seed & 0x7fffffff)
    im = ps['InitialModule']; em = ps['EmissionModule']
    dur = max(0.01, ps.get('lengthInSec', 1.0))
    loop = ps.get('looping', False)
    delay = minmax(ps.get('startDelay', {'scalar': 0}))
    end = t_alive_end if loop else dur
    times = []
    if em.get('enabled', True):
        cyc_n = int(np.ceil(end / dur)) if loop else 1
        for cyc in range(min(cyc_n, 20)):
            base = cyc * dur
            for b in em.get('m_Bursts', []):
                cnt = int(round(minmax(b['countCurve'], 0, rng.rand())))
                for k in range(max(1, b.get('cycleCount', 1))):
                    tb = base + b['time'] + k * b.get('repeatInterval', 0.01)
                    times += [tb] * min(cnt, 40)
            rate = minmax(em.get('rateOverTime', {'scalar': 0}), 0.5, 0.5)
            if rate > 0:
                n = int(rate * dur)
                times += [base + (i + 0.5) * dur / max(1, n) for i in range(min(n, 60))]
    times = [x + delay for x in times if x + delay <= t_rel and x <= end]
    maxn = min(int(im.get('maxNumParticles', 1000)), 80)
    out = []
    sh = ps.get('ShapeModule', {})
    uv = ps.get('UVModule', {})
    sz = ps.get('SizeModule', {}); col = ps.get('ColorModule', {}); vel = ps.get('VelocityModule', {})
    rot = ps.get('RotationModule', {})
    grav = minmax(im.get('gravityModifier', {'scalar': 0}))
    for i, t0 in enumerate(times[:maxn * 3]):
        r = [rng.rand() for _ in range(12)]
        xe = (t0 % dur) / dur
        life = max(0.01, minmax(im['startLifetime'], xe, r[0]))
        age = t_rel - t0
        if age < 0 or age > life:
            continue
        f = age / life
        size = minmax(im['startSize'], xe, r[1])
        sy = minmax(im['startSizeY'], xe, r[1]) if im.get('size3D') else size
        speed = minmax(im['startSpeed'], xe, r[2])
        ang = -minmax(im['startRotation'], xe, r[3]) if not im.get('rotation3D') else -minmax(im.get('startRotationZ', im['startRotation']), xe, r[3])
        colr = color_mm(im['startColor'], xe, r[4])
        # Where it starts and which way it goes.
        p = np.zeros(3); d = np.array([0.0, 0.0, 1.0])
        if sh.get('enabled'):
            ty = sh.get('type', 0)
            rad = sh.get('radius', {}).get('value', 1.0) if isinstance(sh.get('radius'), dict) else sh.get('radius', 1.0)
            thick = sh.get('radiusThickness', 1.0)
            arc = np.radians(sh.get('arc', {}).get('value', 360) if isinstance(sh.get('arc'), dict) else 360)
            if ty in (0, 1, 2, 3):
                v = rng.randn(3); v /= max(1e-6, np.linalg.norm(v))
                if ty in (2, 3):
                    v[2] = abs(v[2])
                p = v * rad * (1 - thick * (1 - r[5] ** (1 / 3))); d = v
            elif ty in (4, 7, 8, 9):
                a2 = r[5] * arc; rr = rad * np.sqrt(1 - thick * (1 - r[6]))
                p = np.array([np.cos(a2) * rr, np.sin(a2) * rr, 0])
                spread = np.radians(sh.get('angle', 0)) * (rr / max(1e-6, rad))
                d = np.array([np.cos(a2) * np.sin(spread), np.sin(a2) * np.sin(spread), np.cos(spread)])
            elif ty in (5, 15, 16):
                p = (np.array(r[5:8]) - 0.5); d = np.array([0.0, 0.0, 1.0])
            elif ty in (10, 17):
                a2 = r[5] * arc; rr = rad * (1 - thick * (1 - np.sqrt(r[6])))
                p = np.array([np.cos(a2) * rr, np.sin(a2) * rr, 0]); d = np.array([np.cos(a2), np.sin(a2), 0])
            elif ty == 12:
                p = np.array([(r[5] * 2 - 1) * rad, 0, 0]); d = np.array([0.0, 1.0, 0])
            sc = sh.get('m_Scale', {'x': 1, 'y': 1, 'z': 1})
            p = p * np.array([sc['x'], sc['y'], sc['z']]) if ty in (5, 15, 16) else p * np.array([sc['x'], sc['y'], sc['z']])
            rr_ = sh.get('m_Rotation', {'x': 0, 'y': 0, 'z': 0})
            R = rot3(euler_q(rr_['x'], rr_['y'], rr_['z']))
            p = R @ p; d = R @ d
            pp = sh.get('m_Position', {'x': 0, 'y': 0, 'z': 0})
            p = p + np.array([pp['x'], pp['y'], pp['z']])
            ra = sh.get('randomDirectionAmount', 0)
            if ra:
                v = rng.randn(3); v /= max(1e-6, np.linalg.norm(v)); d = d * (1 - ra) + v * ra
        v0 = d * speed
        pos = p + v0 * age
        vx_, vy_ = v0[0], v0[1]
        if vel.get('enabled'):
            ex = [minmax(vel[k], f, r[8]) for k in ('x', 'y', 'z')]
            pos = pos + np.array(ex) * age
            vx_ += ex[0]; vy_ += ex[1]
        pos[1] -= 0.5 * 9.81 * grav * age * age
        k = 1.0
        if sz.get('enabled'):
            k = minmax(sz['curve'], f, r[9])
        cl = list(colr)
        if col.get('enabled'):
            g = color_mm(col['gradient'], f, r[10])
            cl = [cl[j] * g[j] for j in range(4)]
        a_ = ang
        if rot.get('enabled'):
            a_ -= minmax(rot.get('curve', {'scalar': 0}), f, r[11]) * age
        frame = 0
        if uv.get('enabled'):
            nfr = max(1, uv.get('tilesX', 1) * (uv.get('tilesY', 1) if uv.get('animationType', 0) == 0 else 1))
            fo = minmax(uv['frameOverTime'], (f * uv.get('cycles', 1)) % 1.0, r[7])
            st0 = minmax(uv.get('startFrame', {'scalar': 0}), 0, r[7])
            frame = int(min(nfr - 1, max(0, np.floor(fo * nfr + st0))))
        out.append((pos[0], pos[1], pos[2], size * k, sy * k, a_, cl, frame, vx_, vy_))
    return out


def node_m2(tr, anim, t):
    """A node's local 2x3 (its turn, tilt and scale, then its place), animated at t."""
    lp = [tr.m_LocalPosition.x, tr.m_LocalPosition.y]
    ls = [tr.m_LocalScale.x, tr.m_LocalScale.y]
    q = [tr.m_LocalRotation.x, tr.m_LocalRotation.y, tr.m_LocalRotation.z, tr.m_LocalRotation.w]
    if anim:
        if 'pos' in anim:
            lp = [lerp_at(anim['pos'][0], t, lp[0]), lerp_at(anim['pos'][1], t, lp[1])]
        if 'scale' in anim:
            ls = [lerp_at(anim['scale'][0], t, ls[0]), lerp_at(anim['scale'][1], t, ls[1])]
        if 'euler' in anim:
            e = [lerp_at(anim['euler'][j], t, None) for j in range(3)]
            if all(v is not None for v in e):
                q = euler_q(*e)
        elif 'quat' in anim:
            v = [lerp_at(anim['quat'][j], t, q[j]) for j in range(4)]
            n = np.sqrt(sum(x * x for x in v)) or 1
            q = [x / n for x in v]
    R = quat_m2(q) @ np.diag(ls)
    return np.hstack([R, [[lp[0]], [lp[1]]]])


def render(go, add_own=False, alpha_only=False, add_all=False):
    """add_own: sprite renderers with a material of their own (not Sprites-Default) are additive
    (for materials whose shader says nothing); alpha_only: none is; add_all: every one is.
    Draws SpriteRenderers (through approximations of the client's effect shaders, see shade())
    and ParticleSystems (bursts and rates, shapes, lifetime size / colour / rotation, sprite-sheet
    frames), each node turned, tilted, scaled and shown or hidden as the Animators drive it."""
    root_tr = comp(go, 'Transform')
    nodes = [('', root_tr)] + child_paths(root_tr)
    info = {}
    for p, t in nodes:
        g = t.m_GameObject.read()
        info[p] = {'tr': t, 'go': g, 'active': g.m_IsActive is not False, 'anim': {}}
    parent_of = {p: (p.rsplit('/', 1)[0] if '/' in p else ('' if p else None)) for p, _ in nodes}
    rends = []
    for p, t in nodes:
        g = info[p]['go']
        r = comp(g, 'SpriteRenderer')
        if r is not None:
            mi = mat_info(r)
            custom = mi['shader'] not in ('', 'Sprites/Default') and mi['name'] != 'Sprites-Default'
            add = shader_additive(mi['shader']) if mi['shader'] else (is_additive(r) or add_own and custom)
            if alpha_only:
                add = False
            if add_all:
                add = True
            rends.append({'kind': 'sprite', 'path': p, 'r': r, 'mi': mi, 'sprite': r.m_Sprite if r.m_Sprite.path_id else None,
                          'color': [r.m_Color.r, r.m_Color.g, r.m_Color.b, r.m_Color.a], 'add': add, 'order': r.m_SortingOrder,
                          'flip': (r.m_FlipX, r.m_FlipY), 'props': {}})
        pr = comp(g, 'ParticleSystemRenderer')
        psc = next((c for c in g.m_Components if c.type.name == 'ParticleSystem'), None)
        if pr is not None and psc is not None and getattr(pr, 'm_Enabled', True):
            mi = mat_info(pr)
            if mi['texs'].get('_MainTex') is None:
                continue
            try:
                ps = psc.read_typetree()
            except Exception:
                continue
            add = shader_additive(mi['shader'])
            if add_all:
                add = True
            rends.append({'kind': 'ps', 'path': p, 'r': pr, 'mi': mi, 'ps': ps, 'add': add, 'order': pr.m_SortingOrder,
                          'mode': pr.m_RenderMode, 'props': {}, 'seed': zlib.crc32(p.encode())})
    if not rends:
        return None
    by_path = {rr['path']: rr for rr in rends}
    length = 0.5
    for p, t in nodes:
        an = comp(info[p]['go'], 'Animator')
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
        rel = {}
        for q, _ in nodes:
            if p == '' or q == p or q.startswith(p + '/'):
                rq = q[len(p) + 1:] if p and q != p else ('' if q == p else q)
                rel[zlib.crc32(rq.encode()) & 0xffffffff] = q
        ci = 0
        for b in bc.genericBindings:
            n = binding_curves(b)
            q = rel.get(b.path)
            if q is not None:
                A = info[q]['anim']
                rr = by_path.get(q)
                kv = keys.get(ci, [])
                if b.typeID == 1 and b.attribute == ACTIVE:
                    A['active'] = kv
                elif b.typeID == 4:
                    if b.attribute == 1:
                        A['pos'] = [keys.get(ci + j, []) for j in range(3)]
                    elif b.attribute == 3:
                        A['scale'] = [keys.get(ci + j, []) for j in range(3)]
                    elif b.attribute == 4:
                        A['euler'] = [keys.get(ci + j, []) for j in range(3)]
                    elif b.attribute == 2:
                        A['quat'] = [keys.get(ci + j, []) for j in range(4)]
                elif rr is not None and b.typeID == 212 and b.isPPtrCurve:
                    rr['anim_sprite'] = [(kk[0], pptr[int(kk[1])] if 0 <= int(kk[1]) < len(pptr) else None) for kk in kv]
                elif rr is not None and b.attribute in COLOR_ATTR and getattr(b, 'customType', 0) != 22:
                    rr.setdefault('anim_color', {})[COLOR_ATTR[b.attribute]] = kv
                elif rr is not None and getattr(b, 'customType', 0) == 22:
                    # A material property's binding: the low 28 bits are its name's crc32, the top four
                    # say what of it (8 a float; 4, 5, 6, 7 a colour's r, g, b, a). (Matching the whole
                    # crc plus an offset found a property only when its crc's top bits happened to fit,
                    # and put colour components in the wrong place: 도깨비폭풍 came out pink.)
                    nib = b.attribute >> 28
                    for nm in list(rr['mi']['floats']) + list(rr['mi']['colors']):
                        h = zlib.crc32(nm.encode()) & 0xffffffff
                        if (h ^ b.attribute) & 0x0fffffff == 0:
                            if nm in rr['mi']['colors'] and 4 <= nib <= 7:
                                rr['props'].setdefault(nm, {})[nib - 4] = kv
                            elif nm in rr['mi']['floats'] and nib == 8:
                                rr['props'].setdefault(nm, {})[0] = kv
                            break
            ci += n
    fps = min(20, max(8, MAX_FRAMES / max(length, 0.05)))
    nfr = max(1, min(MAX_FRAMES, int(round(length * fps))))
    cache = {}

    def active_at(p, t):
        while p is not None:
            I = info[p]
            a = I['active']
            if 'active' in I['anim'] and I['anim']['active']:
                a = step_at(I['anim']['active'], t, 1.0 if a else 0.0) > 0.5
            if not a:
                return False
            p = parent_of[p]
        return True

    def world(p, t):
        M = np.array([[1.0, 0, 0], [0, 1.0, 0]])
        chain = []
        q = p
        while q is not None and q != '':
            chain.append(q)
            q = parent_of[q]
        for q in reversed(chain):
            L = node_m2(info[q]['tr'], info[q]['anim'], t)
            M = np.vstack([M, [0, 0, 1]]) @ np.vstack([L, [0, 0, 1]])
            M = M[:2]
        return M

    # When each particle system starts: the first sampled moment it is shown.
    step = 1 / 60
    for rr in rends:
        if rr['kind'] == 'ps':
            rr['t_on'] = next((k * step for k in range(int(length / step) + 2) if active_at(rr['path'], k * step)), None)
    frames = []
    for k in range(nfr):
        t = k / fps
        cv = Canvas()
        for rr in sorted(rends, key=lambda r: r['order']):
            if not active_at(rr['path'], t):
                continue
            Mw = world(rr['path'], t)
            props = {}
            for nm, comps in rr['props'].items():
                if nm in rr['mi']['colors']:
                    v = list(rr['mi']['colors'][nm])
                    for j, kv in comps.items():
                        v[j] = lerp_at(kv, t, v[j])
                    props[nm] = v
                else:
                    props[nm] = lerp_at(comps.get(0, []), t, rr['mi']['floats'].get(nm, 0))
            if rr['kind'] == 'sprite':
                sp = rr['sprite']
                if 'anim_sprite' in rr:
                    sp = step_at(rr['anim_sprite'], t, sp)
                if sp is None or not getattr(sp, 'path_id', 0):
                    continue
                col = list(rr['color'])
                for j, kv in rr.get('anim_color', {}).items():
                    col[j] = lerp_at(kv, t, col[j])
                if col[3] <= 0.02:
                    continue
                im, ppu, pv = sprite_img(sp, cache)
                key = ('f', sp.path_id)
                if key not in cache:
                    cache[key] = np.asarray(im).astype(np.float32) / 255
                # A noise sprite under an effect shader is only what the shader scrolls through.
                nk = ('sname', sp.path_id)
                if nk not in cache:
                    cache[nk] = sp.read().m_Name.lower()
                if cache[nk].startswith('noise') and rr['mi']['shader'].startswith('Edit/'):
                    res = shade(rr['mi'], props, None, cache)
                else:
                    res = shade(rr['mi'], props, cache[key], cache)
                if res is None:
                    continue
                img, add = res
                add = rr['add'] if rr['mi']['shader'] in ('', 'Sprites/Default') else add
                if add_all:
                    add = True
                if alpha_only:
                    add = False
                img = img.copy()
                img[..., :3] *= np.array(col[:3], np.float32)
                fx = -1 if rr['flip'][0] else 1
                fy = -1 if rr['flip'][1] else 1
                h = im.height
                # image pixel (u, v) -> sprite local units -> world -> canvas
                S_ = np.array([[fx / ppu, 0, -fx * pv[0] / ppu], [0, -fy / ppu, fy * (h - pv[1]) / ppu]])
                # the shader's picture may be another size than the sprite (a texture over a 4x4 quad)
                Dg = np.diag([im.width / img.shape[1], im.height / img.shape[0], 1.0])
                A = np.vstack([Mw, [0, 0, 1]]) @ np.vstack([S_, [0, 0, 1]]) @ Dg
                A = np.array([[1, 0, OX], [0, -1, OY]]) @ A
                cv.blit(img, A, add, col[3])
            else:
                if rr['t_on'] is None:
                    continue
                ps = rr['ps']
                tex = tex_img(rr['mi']['texs']['_MainTex'], cache)
                if tex is None:
                    continue
                uv = ps.get('UVModule', {})
                tx, ty = (uv.get('tilesX', 1), uv.get('tilesY', 1)) if uv.get('enabled') else (1, 1)
                th, tw = tex.shape[0] // max(1, ty), tex.shape[1] // max(1, tx)
                mode = ps.get('scalingMode', 1)
                # The system's own turn (a cone tipped over to throw upwards) in 3D, and its scale.
                Rw = np.eye(3); wsc = 1.0; q_ = rr['path']
                while q_ is not None and q_ != '':
                    tr_ = info[q_]['tr']; lr = tr_.m_LocalRotation; ls_ = tr_.m_LocalScale
                    Rw = rot3([lr.x, lr.y, lr.z, lr.w]) @ np.diag([ls_.x, ls_.y, ls_.z]) @ Rw
                    wsc *= abs(ls_.x) or 1
                    q_ = parent_of[q_]
                lsc = abs(info[rr['path']]['tr'].m_LocalScale.x) or 1
                ssc = wsc if mode == 0 else (lsc if mode == 1 else 1.0)
                end_t = length - rr['t_on']
                mi = rr['mi']
                tc = mi['colors'].get('_TintColor')
                tcol = props.get('_TintColor', tc)
                k_rgb = np.array(tcol[:3]) * 2 if tcol and ('Legacy' in mi['shader'] or 'Particles' in mi['shader'] or 'Jjun' in mi['shader']) else np.array(tcol[:3]) if tcol else np.ones(3)
                k_a = (tcol[3] * 2 if tcol and ('Legacy' in mi['shader'] or 'Particles' in mi['shader']) else tcol[3] if tcol else 1.0)
                if '_Color' in mi['colors'] and not tcol:
                    cc = props.get('_Color', mi['colors']['_Color']); k_rgb = np.array(cc[:3]); k_a = cc[3]
                for (x, y, z, sx, sy, ang, cl, fr, vx, vy) in particles(ps, t - rr['t_on'], end_t, rr['seed']):
                    if cl[3] * k_a <= 0.01 or sx <= 0:
                        continue
                    if uv.get('enabled') and uv.get('animationType', 0) == 1:
                        row = uv.get('rowIndex', 0)
                        fx_, fy_ = fr % tx, row
                    else:
                        fx_, fy_ = fr % tx, fr // tx
                    cell = tex[fy_ * th:(fy_ + 1) * th, fx_ * tw:(fx_ + 1) * tw]
                    if cell.size == 0:
                        continue
                    img = cell.copy()
                    img[..., :3] = np.clip(img[..., :3] * np.array(cl[:3]) * k_rgb, 0, 1)
                    img[..., 3] = np.clip(img[..., 3] * cl[3] * k_a, 0, 1)
                    # a quad sx x sy (system units, times the scaling), turned by ang, at (x, y)
                    c_, s_ = np.cos(ang), np.sin(ang)
                    Q = np.array([[c_ * sx * ssc / tw, -s_ * -sy * ssc / th, 0], [s_ * sx * ssc / tw, c_ * -sy * ssc / th, 0]])
                    if rr['mode'] == 1:  # stretched along its way
                        sp_ = np.hypot(vx, vy)
                        L = sx * ssc * getattr(rr['r'], 'm_LengthScale', 2.0) + sp_ * getattr(rr['r'], 'm_VelocityScale', 0) * ssc
                        a2 = np.arctan2(vy, vx) if sp_ > 1e-6 else 0
                        c2, s2 = np.cos(a2), np.sin(a2)
                        Q = np.array([[c2 * L / tw, -s2 * -sx * ssc / th, 0], [s2 * L / tw, c2 * -sx * ssc / th, 0]])
                    Q[:, 2] = -(Q[:, 0] * tw / 2 + Q[:, 1] * th / 2)
                    # particle local -> system node -> world (positions follow the node; sizes use ssc above)
                    pw = Mw[:, 2] + (Rw @ np.array([x, y, z]))[:2]
                    Q[:, 2] += pw
                    A = np.array([[1, 0, OX], [0, -1, OY]]) @ np.vstack([Q, [0, 0, 1]])
                    cv.blit(img, A, rr['add'])
        frames.append(cv.frame())
    return frames, fps, OX, OY, any(r['add'] for r in rends)


def combine(layers, fps=20.0):
    """Several renders [(render() result, start seconds, tint)] played together on one canvas, the
    later ones drawn over the earlier: one render() result at `fps`."""
    end = max(at + len(r[0]) / r[1] for r, at, _ in layers)
    nfr = max(1, min(30, int(round(end * fps))))
    add = any(r[4] for r, _, _ in layers)
    frames = []
    for k in range(nfr):
        t = k / fps
        al = np.zeros((H_CANVAS, W_CANVAS, 4), np.float32)
        ad = np.zeros((H_CANVAS, W_CANVAS, 3), np.float32)
        for r, at, tint in layers:
            i = int((t - at) * r[1] + 1e-6)
            if not 0 <= i < len(r[0]):
                continue
            a_img, a_add = r[0][i]
            src = np.asarray(a_img).astype(np.float32) / 255
            tk = np.array(tint[:3], np.float32) if tint else np.ones(3, np.float32)
            sa = src[..., 3:4]
            al[..., :3] = al[..., :3] * (1 - sa) + src[..., :3] * tk * sa
            al[..., 3:4] = al[..., 3:4] * (1 - sa) + sa
            ad += a_add.astype(np.float32) / 255 * tk
        rgb = np.where(al[..., 3:4] > 1e-4, al[..., :3] / np.maximum(al[..., 3:4], 1e-4), 0)
        frames.append((Image.fromarray((np.clip(np.dstack([rgb, al[..., 3:4]]), 0, 1) * 255).astype(np.uint8), 'RGBA'),
                       (np.clip(ad, 0, 1) * 255).astype(np.uint8)))
    return frames, fps, layers[0][0][2], layers[0][0][3], add


def to_strip(frames, ox, oy, add):
    """Crops every frame to the union of what is drawn and lays them side by side.
    Additive effects are flattened onto black (the game adds them); the rest keep alpha."""
    outs = []
    for al, ad in frames:
        if add == 'mixed':
            # Mostly painted, lit by a few additive sparks (도깨비폭풍's tornado and its thunder): kept
            # as a painted picture, the light laid over it as cover as strong as it is bright, so it
            # is not washed out into light on a bright ground.
            a0 = np.asarray(al).astype(float) / 255
            lit = ad.astype(float) / 255
            pre = a0[..., :3] * a0[..., 3:4] + lit
            a = np.clip(np.maximum(a0[..., 3:4], lit.max(2, keepdims=True)), 0, 1)
            rgb = np.where(a > 1e-3, pre / np.maximum(a, 1e-3), 0)
            outs.append(Image.fromarray((np.clip(np.dstack([rgb, a]), 0, 1) * 255).astype(np.uint8), 'RGBA'))
        elif add:
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
    if add and add != 'mixed':
        strip = Image.fromarray(np.asarray(strip)[:, :, :3]).convert('RGB')
    return strip, (cw, ch), (ox - box[0], oy - box[1])


def main():
    bundle, mapping, out = sys.argv[1], sys.argv[2], sys.argv[3]
    icon_out = sys.argv[4] if len(sys.argv) > 4 else None
    os.makedirs(out, exist_ok=True)
    if icon_out:
        os.makedirs(icon_out, exist_ok=True)
    m = json.load(open(mapping))
    # Several mapping tables (one a class) render into the same OUT_DIR: what is already there stays.
    ipath = os.path.join(out, 'index.json')
    # SKILLS_BUNDLE may name more bundles, comma-separated (FXs.unity3d holds what some prefabs use).
    env = UnityPy.load(*bundle.split(','))
    cont = {k.rsplit('/', 1)[-1].rsplit('.', 1)[0].lower(): v for k, v in env.container.items()}
    index = json.load(open(ipath, encoding='utf-8')) if os.path.isfile(ipath) else {}
    for sid, spec in m.items():
        pf = spec.get('prefab')
        if pf and pf.lower() in cont:
            try:
                res = render(cont[pf.lower()].read(), bool(spec.get('add_own')), bool(spec.get('alpha_only')), bool(spec.get('add_all')))
            except Exception as e:
                import traceback; traceback.print_exc(); print(sid, pf, 'render failed', e)
                res = None
            if res and (spec.get('with') or spec.get('tint')):
                # "with": more of 연's prefabs played in the same picture ({"prefab", "at": seconds}),
                # as the client plays them together (광폭기대방출: the purple shaft, then the disc).
                # "tint": an [r, g, b] the layer is multiplied by (the client colours some white
                # pictures at run time, e.g. its 광폭 effects purple).
                layers = [(res, spec.get('at', 0.0), spec.get('tint'))]
                for w in spec.get('with', []):
                    try:
                        r2 = render(cont[w['prefab'].lower()].read(), bool(w.get('add_own')), bool(w.get('alpha_only')), bool(w.get('add_all')))
                    except Exception as e:
                        print(sid, w['prefab'], 'render failed', e)
                        r2 = None
                    if r2:
                        layers.append((r2, w.get('at', 0.0), w.get('tint')))
                res = combine(layers)
            if res:
                frames, fps, ox, oy, add = res
                # "mixed": an additive effect kept as a painted one (see to_strip).
                st = to_strip(frames, ox, oy, 'mixed' if add and spec.get('mixed') else add)
                if add and spec.get('mixed'):
                    add = False
                if st:
                    strip, cell, anchor = st
                    # "alpha_gain": an effect whose sprites the client fades in with particles we do not
                    # draw comes out nearly see-through; its alpha is raised (k times, at most opaque).
                    g = spec.get('alpha_gain')
                    if g and not add:
                        arr = np.asarray(strip).astype(float)
                        arr[:, :, 3] = np.clip(arr[:, :, 3] * g, 0, 255)
                        strip = Image.fromarray(arr.astype(np.uint8))
                    strip.save(os.path.join(out, sid + '.png'), optimize=True)
                    e = {'cell': list(cell), 'n': len(frames), 'ms': round(1000 / fps), 'add': add,
                         'anchor': [int(anchor[0]), int(anchor[1])], 'prefab': pf}
                    # "anchor": [x, y] as parts of the cell, where the target's feet are, for a prefab
                    # whose origin the client puts elsewhere (도깨비불'뇌격's bolt hangs from the wisp
                    # above; it strikes the ground at the picture's foot).
                    if spec.get('anchor'):
                        e['anchor'] = [int(round(spec['anchor'][0] * cell[0])), int(round(spec['anchor'][1] * cell[1]))]
                    # "scale": drawn that many times smaller than stored (a column of fire 967 high).
                    if spec.get('scale'):
                        e['scale'] = spec['scale']
                    # "keep_reach": a picture redrawn for a spell keeps what the old one reached
                    # (game.js seenReach): [old width, old height] as parts of the new one's. Drawn
                    # again, the reach stays the same in pixels however the picture's size changes.
                    old = index.get(sid)
                    if spec.get('keep_reach') and old:
                        o_s, n_s = old.get('scale', 1), e.get('scale', 1)
                        o_r = old.get('reach') or [1, 1]
                        e['reach'] = [round(o_r[0] * old['cell'][0] / o_s / (cell[0] / n_s), 4),
                                      round(o_r[1] * old['cell'][1] / o_s / (cell[1] / n_s), 4)]
                    index[sid] = e
                    print(sid, pf, cell, len(frames), 'add' if add else 'alpha')
        ic = spec.get('icon')
        if icon_out and ic and ic.lower() in cont:
            try:
                obj = cont[ic.lower()].read()
                im = obj.image
                im.convert('RGBA').save(os.path.join(icon_out, sid + '.png'))
            except Exception as e:
                print(sid, 'icon failed', e)
    json.dump(index, open(ipath, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
