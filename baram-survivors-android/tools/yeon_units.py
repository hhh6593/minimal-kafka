#!/usr/bin/env python3
"""Monster animations from 바람의나라 연's own resource bundles.

    yeon_units.py UNITS_BUNDLE MATCH_JSON OUT_DIR

UNITS_BUNDLE is Units.unity3d from the game's downloaded resources (Android/data/com.nexon.baram),
already un-XORed (the bundles are stored XORed with a 20-byte key that can be recovered from the
known UnityFS header: see ytools/dexor.py in the notes, or `dexor()` below).
MATCH_JSON maps our monster ids to 연 prefabs: {"1001": {"prefab": "Monster_0001", ...}, ...}
(built by matching the old game's monster names to 연's unit table, Units_Field / Strings).

For each prefab the GameObject's Animator gives its AnimatorController (or override controller),
whose clips name the sprites frame by frame (pptrCurveMapping). Each animation is drawn into a
row of equal cells with the sprite's own pivot (the feet) at one point of the cell, so frames
never jitter. Output: OUT_DIR/<our id>.png and OUT_DIR/index.json:

    {"<our id>": {"prefab": ..., "cell": [w, h], "foot": [x, y],
                  "anims": {"walk_down": {"row": 0, "n": 6, "ms": 83}, ...}}}

Animations kept (when the prefab has them): walk_down/up/side, idle_down/up/side,
atk_down/up/side, hit, dead. "side" faces left as drawn by 연 (mirror for right) unless
the clip is a _Right one.
"""
import json
import os
import re
import sys

import numpy as np
import UnityPy
from PIL import Image

KEY_PLAIN = b'UnityFS\x00\x00\x00\x00\x085.x.x\x00'


def dexor(src, dst):
    raw = np.fromfile(src, dtype=np.uint8)
    head = bytes(raw[:40])
    key = bytes([a ^ b for a, b in zip(head, KEY_PLAIN)] + [head[38], head[39]])
    k = np.frombuffer(key, dtype=np.uint8)
    (raw ^ np.tile(k, -(-len(raw) // 20))[:len(raw)]).tofile(dst)


# Our animation name -> clip name endings, best first.
WANT = {
    'walk_down': ['Walk_Down', 'Move_Down', 'Run_Down', 'Walk'],
    'walk_up': ['Walk_Up', 'Move_Up', 'Run_Up'],
    'walk_side': ['Walk_Side', 'Move_Side', 'Run_Side', 'Walk_Left', 'Walk_Side_L'],
    'idle_down': ['Idle_Down', 'Idle'],
    'idle_up': ['Idle_Up'],
    'idle_side': ['Idle_Side'],
    'atk_down': ['Atk_Down', 'Attack_Down', 'Atk'],
    'atk_up': ['Atk_Up', 'Attack_Up'],
    'atk_side': ['Atk_Side', 'Attack_Side'],
    'hit': ['Hit', 'getHit', 'Damage'],
    'dead': ['Dead', 'Dead_Down', 'Die'],
}


def controller_clips(anim):
    """name -> AnimationClip object of an Animator's controller (override clips win)."""
    ctrl = anim.m_Controller.read()
    clips = {}
    base = ctrl
    over = {}
    if ctrl.object_reader.type.name == 'AnimatorOverrideController':
        base = ctrl.m_Controller.read()
        for pair in ctrl.m_Clips:
            if pair.m_OverrideClip and pair.m_OverrideClip.path_id:
                over[pair.m_OriginalClip.path_id] = pair.m_OverrideClip
    for ref in base.m_AnimationClips:
        clip_ref = over.get(ref.path_id, ref)
        try:
            c = clip_ref.read()
        except Exception:
            continue
        clips[c.m_Name] = c
    return clips


def pick(clips, prefab):
    out = {}
    for key, ends in WANT.items():
        for end in ends:
            hit = [c for n, c in clips.items() if n.lower().endswith('_' + end.lower()) or n.lower() == end.lower()]
            hit.sort(key=lambda c: len(c.m_Name))
            if hit and hit[0].m_ClipBindingConstant.pptrCurveMapping:
                out[key] = hit[0]
                break
    return out


def frames_of(clip):
    sprites = []
    for p in clip.m_ClipBindingConstant.pptrCurveMapping:
        try:
            s = p.read()
        except Exception:
            continue
        if s.object_reader.type.name == 'Sprite':
            sprites.append(s)
    n = max(1, len(sprites))
    stop = getattr(clip.m_MuscleClip, 'm_StopTime', 0) or n / 12
    return sprites, max(40, int(round(stop * 1000 / n)))


def main():
    bundle, match_path, out = sys.argv[1:4]
    os.makedirs(out, exist_ok=True)
    match = json.load(open(match_path))
    wanted = {}
    for our, v in match.items():
        wanted.setdefault(v['prefab'], []).append(our)
    env = UnityPy.load(bundle)
    gos = {}
    for o in env.objects:
        if o.type.name == 'GameObject':
            n = o.peek_name()
            if n in wanted and n not in gos:
                gos[n] = o
    index = {}
    for prefab, ours in sorted(wanted.items()):
        go = gos.get(prefab)
        if not go:
            print('no prefab', prefab)
            continue
        go = go.read()
        anims = [c.read() for c in go.m_Components if c.type.name == 'Animator']
        if not anims:
            # The animator usually sits on a child (the body) of the prefab root.
            stack = [go]
            while stack and not anims:
                g = stack.pop()
                tr = [c.read() for c in g.m_Components if c.type.name in ('Transform', 'RectTransform')]
                for t in tr:
                    for ch in t.m_Children:
                        cg = ch.read().m_GameObject.read()
                        a = [c.read() for c in cg.m_Components if c.type.name == 'Animator']
                        if a:
                            anims = a
                            break
                        stack.append(cg)
        if not anims or not anims[0].m_Controller.path_id:
            print('no animator', prefab)
            continue
        try:
            clips = controller_clips(anims[0])
        except Exception as e:
            print('ctrl fail', prefab, e)
            continue
        chosen = pick(clips, prefab)
        if 'walk_down' not in chosen and 'idle_down' not in chosen:
            print('no walk', prefab, list(clips)[:6])
            continue
        rows = []
        for key, clip in chosen.items():
            sprites, ms = frames_of(clip)
            if not sprites:
                continue
            pics = []
            for s in sprites:
                im = s.image
                r = s.m_Rect
                px = s.m_Pivot.x * r.width
                py = (1 - s.m_Pivot.y) * r.height
                pics.append((im, px, py))
            rows.append((key, pics, ms))
        if not rows:
            continue
        left = max(px for _, ps, _ in rows for _, px, _ in ps)
        top = max(py for _, ps, _ in rows for _, _, py in ps)
        right = max(im.width - px for _, ps, _ in rows for im, px, _ in ps)
        bottom = max(im.height - py for _, ps, _ in rows for im, _, py in ps)
        cw, chh = int(np.ceil(left + right)), int(np.ceil(top + bottom))
        ncol = max(len(ps) for _, ps, _ in rows)
        sheet = Image.new('RGBA', (cw * ncol, chh * len(rows)))
        meta = {}
        for ri, (key, ps, ms) in enumerate(rows):
            for ci, (im, px, py) in enumerate(ps):
                sheet.paste(im, (ci * cw + int(round(left - px)), ri * chh + int(round(top - py))))
            meta[key] = {'row': ri, 'n': len(ps), 'ms': ms}
        # Trim the empty margin all cells share (keep the foot point consistent).
        for our in ours:
            sheet.save(os.path.join(out, our + '.png'), optimize=True)
            index[our] = {'prefab': prefab, 'cell': [cw, chh], 'foot': [int(round(left)), int(round(top))], 'anims': meta}
        print(prefab, ours[:4], [cw, chh], list(meta))
    json.dump(index, open(os.path.join(out, 'index.json'), 'w'), ensure_ascii=False, indent=0)
    print('done', len(index))


if __name__ == '__main__':
    main()
