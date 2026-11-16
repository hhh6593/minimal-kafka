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
import re
import zlib

import yeon_avatar as Y


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


# The part of an item that is "the weapon" (in front, the hand's); the rest go in the second layer.
MAIN_PARTS = ('Weapon', 'Weapon_Spear')
