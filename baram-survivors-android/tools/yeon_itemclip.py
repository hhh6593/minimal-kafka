"""A worn item's own animation in 바람의나라 연, as the game plays it beside the avatar.

Every weapon of 연 is a prefab of its own (assets/patchresources/items/item_<id>.prefab): a
"Sprite" node with an Animator and the item's parts under it (Weapon, Weapon_back, Weapon_Left,
Weapon_Spear, Weapon_Spear_Back, ...). Its controller is an AnimatorOverrideController of
Avatar_0001: each avatar state (Avatar_0001_Idle_Down, ...) plays the item's own clip of that
name, or another one (a bow's Attack_Down plays Avatar_0001_A_Atk_Down, a staff's Dead plays
All_Comp_Off, which hides it). The clips key, per part, the sprite (from the item's own sheets,
or a shared one: the 마도사's spellbook), the part's place and its sorting order, in step with the
avatar's clip of the same state. The parts sit on the avatar's "Sprite" node, as its own slots do.

The avatar's own Weapon slot only holds a stand-in (Item_0001_E_<n>, Archer_Guide_Weapon_<n>,
Fighter_Guide_Weapon_<n>): drawing an item's sheet there by frame number puts bows, gourds and
fists where a sword's hilt would be. ItemClips gives the parts as the item's own clip lays them.
"""
import math
import re
import zlib

from PIL import Image

import yeon_avatar as Y

# Renderer properties a clip may key (bindings name them by CRC32).
FLIP_X, FLIP_Y, SORT = zlib.crc32(b'm_FlipX'), zlib.crc32(b'm_FlipY'), zlib.crc32(b'm_SortingOrder')


class ItemClips:
    def __init__(self, env):
        self.pref = {}
        for path, obj in env.container.items():
            m = re.search(r'/items/item_(\d+)\.prefab$', path)
            if m:
                self.pref[int(m.group(1))] = obj
        self.cache = {}

    def _item(self, iid):
        if iid in self.cache:
            return self.cache[iid]
        it = None
        obj = self.pref.get(int(iid))
        if obj is not None:
            try:
                it = self._load(obj.read())
            except Exception as e:  # a prefab without the rig (an old item): no clips
                print('item', iid, 'has no clips:', e)
                it = None
        self.cache[iid] = it
        return it

    @staticmethod
    def _load(go):
        sprite_go = go.m_Components[0].read().m_Children[0].read().m_GameObject.read()
        parts = {}

        def walk(g, path, parent):
            comps = [c.read() for c in g.m_Components]
            tr = [c for c in comps if c.object_reader.type.name in ('Transform', 'RectTransform')][0]
            ren = [c for c in comps if c.object_reader.type.name == 'SpriteRenderer']
            p, q, sc = tr.m_LocalPosition, tr.m_LocalRotation, tr.m_LocalScale
            parts[zlib.crc32(path.encode()) if path else 0] = {
                'name': path or 'Sprite', 'pos': [p.x, p.y], 'order': ren[0].m_SortingOrder if ren else 0,
                'sprite': ren[0].m_Sprite if ren else None, 'active': g.m_IsActive,
                'rot': quat_m(q.x, q.y, q.z, q.w), 'scale': [sc.x, sc.y],
                'flip': [bool(ren[0].m_FlipX), bool(ren[0].m_FlipY)] if ren else [False, False],
                'parent': parent}
            me = zlib.crc32(path.encode()) if path else 0
            for ch in tr.m_Children:
                cg = ch.read().m_GameObject.read()
                walk(cg, (path + '/' if path else '') + cg.m_Name, me)

        walk(sprite_go, '', None)
        an = [c.read() for c in sprite_go.m_Components if c.type.name == 'Animator']
        if not an:
            return None
        ctrl = an[0].m_Controller.read()
        by_orig, by_name = {}, {}
        if ctrl.object_reader.type.name == 'AnimatorOverrideController':
            base = {r.read().m_Name: r.read() for r in ctrl.m_Controller.read().m_AnimationClips}
            for cl in ctrl.m_Clips:
                o = cl.m_OriginalClip.read().m_Name
                c = cl.m_OverrideClip.read() if cl.m_OverrideClip.path_id else base.get(o)
                if c is not None:
                    by_orig[o] = c
                    by_name.setdefault(c.m_Name, c)
            for n, c in base.items():
                by_orig.setdefault(n, c)
        else:
            for r in ctrl.m_AnimationClips:
                c = r.read()
                by_orig[c.m_Name] = c
        return {'parts': parts, 'orig': by_orig, 'name': by_name, 'states': {}}

    def has(self, iid):
        return self._item(iid) is not None

    def clip(self, iid, avatar_clip):
        """The item's clip played beside the avatar's clip of that name (None: the item has none)."""
        it = self._item(iid)
        if it is None:
            return None
        # The state of that name, else the state whose override is that clip (the 궁사's
        # A_Atk clips stand in for Attack_<dir>).
        return it['orig'].get(avatar_clip) or it['name'].get(avatar_clip)

    def at(self, iid, avatar_clip, t):
        """[(part name, Sprite, (x, y), order)] of the item at time t of the avatar's clip."""
        it = self._item(iid)
        c = self.clip(iid, avatar_clip)
        if c is None:
            return []
        key = (avatar_clip, round(t, 4))
        if key in it['states']:
            return it['states'][key]
        st = Y.state_at(c, it['parts'], t)
        out = []
        for k, s in st.items():
            name = it['parts'][k]['name']
            if k == 0 or '/' in name or not s['active']:
                continue
            ref = s['sprite']
            if ref is None or not ref.path_id:
                continue
            try:
                sp = ref.read()
            except Exception:
                continue
            out.append((name, sp, tuple(s['pos']), s['order']))
        it['states'][key] = out
        return out

    def posed(self, iid, avatar_clip, t):
        """[(part name, Sprite, (x, y), order, M)] of the item at time t of the avatar's clip, as
        연 shows it: nested parts too (a blade drawn over the hand while the shaft is behind the
        body, Weapon/Weapon_F), each part where its parents put it, and M the 2x2 matrix (y up)
        of its rotation, scale and sprite flip: 연 turns a weapon round (180 degrees about y, or
        a scale of -1) to show it from behind, and some swing it about z."""
        it = self._item(iid)
        c = self.clip(iid, avatar_clip)
        if c is None:
            return []
        key = ('posed', avatar_clip, round(t, 4))
        if key in it['states']:
            return it['states'][key]
        st = full_state(c, it['parts'], t)
        world = {}

        def place(k):
            if k in world:
                return world[k]
            s, pt = st[k], it['parts'][k]
            m = mat_mul(s['rot'], [[s['scale'][0], 0], [0, s['scale'][1]]])
            pos, act = list(s['pos']), s['active']
            par = pt['parent']
            if par is not None and par != 0:
                ppos, pm, pact = place(par)
                pos = [ppos[0] + pm[0][0] * pos[0] + pm[0][1] * pos[1], ppos[1] + pm[1][0] * pos[0] + pm[1][1] * pos[1]]
                m = mat_mul(pm, m)
                act = act and pact
            world[k] = (pos, m, act)
            return world[k]
        out = []
        for k, s in st.items():
            if k == 0:
                continue
            pos, m, act = place(k)
            if not act:
                continue
            ref = s['sprite']
            if ref is None or not ref.path_id:
                continue
            try:
                sp = ref.read()
            except Exception:
                continue
            m = mat_mul(m, [[-1 if s['flip'][0] else 1, 0], [0, -1 if s['flip'][1] else 1]])
            out.append((it['parts'][k]['name'], sp, tuple(pos), s['order'], m))
        it['states'][key] = out
        return out


def turned(im, px, py, x, y, m):
    """The picture turned by m (2x2, y up) about its pivot (px, py in the picture), the pivot
    landing on (x, y) (y down): a mirror (연 shows a weapon from behind by turning it 180
    degrees about y, or a scale of -1) exactly, any other turn by nearest pixels."""
    a, b, c, d = m[0][0], -m[0][1], -m[1][0], m[1][1]  # the same in picture space (y down)
    if abs(b) < 1e-3 and abs(c) < 1e-3 and abs(abs(a) - 1) < 1e-3 and abs(abs(d) - 1) < 1e-3:
        if a < 0:
            im = im.transpose(Image.FLIP_LEFT_RIGHT)
            px = im.width - px
        if d < 0:
            im = im.transpose(Image.FLIP_TOP_BOTTOM)
            py = im.height - py
        return (im, x - px, y - py)
    det = a * d - b * c
    if abs(det) < 1e-6:
        return (im.crop((0, 0, 1, 1)).point(lambda v: 0), x, y)
    cs = [(a * (u - px) + b * (v - py), c * (u - px) + d * (v - py)) for u, v in ((0, 0), (im.width, 0), (0, im.height), (im.width, im.height))]
    x0, y0 = math.floor(min(p[0] for p in cs)), math.floor(min(p[1] for p in cs))
    x1, y1 = math.ceil(max(p[0] for p in cs)), math.ceil(max(p[1] for p in cs))
    ia, ib, ic, idd = d / det, -b / det, -c / det, a / det
    # output (X, Y) -> offset (X + x0, Y + y0) -> source pivot + inverse(offset)
    out = im.transform((max(1, x1 - x0), max(1, y1 - y0)), Image.AFFINE,
                       (ia, ib, ia * x0 + ib * y0 + px, ic, idd, ic * x0 + idd * y0 + py), resample=Image.NEAREST)
    return (out, x + x0, y + y0)


def quat_m(x, y, z, w):
    """The x-y block of a quaternion's rotation matrix (sprites lie flat: what turns them about x
    or y shows as a flip or a squeeze)."""
    n = math.sqrt(x * x + y * y + z * z + w * w) or 1
    x, y, z, w = x / n, y / n, z / n, w / n
    return [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w)], [2 * (x * y + z * w), 1 - 2 * (x * x + z * z)]]


def euler_m(ex, ey, ez):
    """Unity's euler angles (degrees, applied z, then x, then y) as quat_m does."""
    a, b, c = (math.radians(v) / 2 for v in (ex, ey, ez))
    qx = (math.sin(a), 0, 0, math.cos(a))
    qy = (0, math.sin(b), 0, math.cos(b))
    qz = (0, 0, math.sin(c), math.cos(c))

    def mul(p, q):
        x1, y1, z1, w1 = p
        x2, y2, z2, w2 = q
        return (w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2, w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2,
                w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2, w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2)
    return quat_m(*mul(mul(qy, qx), qz))


def state_m(s):
    """The 2x2 matrix (y up) of a part's state from full_state: its rotation, scale and sprite flip."""
    m = mat_mul(s['rot'], [[s['scale'][0], 0], [0, s['scale'][1]]])
    return mat_mul(m, [[-1 if s['flip'][0] else 1, 0], [0, -1 if s['flip'][1] else 1]])


def is_identity(m):
    return abs(m[0][0] - 1) < 1e-3 and abs(m[1][1] - 1) < 1e-3 and abs(m[0][1]) < 1e-3 and abs(m[1][0]) < 1e-3


# The avatar's own slots that 연's clips turn (a scale of -1 or 180 degrees about y in the
# directions seen from behind, so the weapon and shield stay in the right and left hands).
TURNED_SLOTS = ('Weapon', 'Weapon_color', 'Weapon_back', 'Sheild', 'Sheild_color')


def mat_mul(a, b):
    return [[a[0][0] * b[0][0] + a[0][1] * b[1][0], a[0][0] * b[0][1] + a[0][1] * b[1][1]],
            [a[1][0] * b[0][0] + a[1][1] * b[1][0], a[1][0] * b[0][1] + a[1][1] * b[1][1]]]


def full_state(clip, parts, t):
    """As yeon_avatar.state_at, with each part's rotation (quaternion or euler curves), scale,
    sprite flips and the renderer's own sorting order."""
    cb = clip.m_ClipBindingConstant
    mapping = cb.pptrCurveMapping
    curve = 0
    plan = []
    for b in cb.genericBindings:
        n = Y.TRANSFORM_CURVES.get(b.attribute, 1) if (b.typeID == 4 and not b.isPPtrCurve) else 1
        plan.append((b, list(range(curve, curve + n))))
        curve += n
    keys = Y.streamed_keys(clip, curve)
    st = {k: {'sprite': None, 'pos': list(v['pos']), 'order': v['order'], 'active': v['active'],
              'rot': v.get('rot', [[1, 0], [0, 1]]), 'scale': list(v.get('scale', [1, 1])), 'flip': list(v.get('flip', [False, False]))}
          for k, v in parts.items()}
    for b, cs in plan:
        s = st.get(b.path)
        if s is None or any(c not in keys for c in cs):
            continue
        vals = [Y.value_at(keys[c], t) for c in cs]
        if b.isPPtrCurve:
            if b.typeID == 212:
                i = int(round(vals[0]))
                s['sprite'] = mapping[i] if 0 <= i < len(mapping) else None
        elif b.typeID == 4 and b.attribute == 1:
            s['pos'] = [vals[0], vals[1]]
        elif b.typeID == 4 and b.attribute == 2:
            s['rot'] = quat_m(*vals)
        elif b.typeID == 4 and b.attribute == 4:
            s['rot'] = euler_m(*vals)
        elif b.typeID == 4 and b.attribute == 3:
            s['scale'] = [vals[0], vals[1]]
        elif b.typeID == 1:
            s['active'] = vals[0] > 0.5
        elif b.typeID == 114:
            s['order'] = vals[0]
        elif b.typeID == 212 and b.attribute == SORT:
            s['order'] = vals[0]
        elif b.typeID == 212 and b.attribute in (FLIP_X, FLIP_Y):
            s['flip'][0 if b.attribute == FLIP_X else 1] = vals[0] > 0.5
    return st


# The part of an item that is "the weapon" (in front, the hand's); the rest go in the second layer.
MAIN_PARTS = ('Weapon', 'Weapon_Spear')
