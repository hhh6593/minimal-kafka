#!/usr/bin/env python3
"""연's 격 pictures again at their own size (the build shrank every 격 strip to 170 pixels, and the top weapons'
격 are drawn 4–8 tiles: blurred), and 진청룡마령참's dragon played as long as 연 plays it (about 3 s).

    yeon_skills.py Skills.unity3d,FXs.unity3d tools/yeon_gyeok_hd.json RENDER_DIR
    yeon_gyeok_hd.py RENDER_DIR GEAR_DIR

tools/yeon_gyeok_hd.json names the prefabs (skill_effect_kyeog_*). This keeps the frames HD names (a:b), trims
the cells to what any kept frame draws, shrinks to `cap` pixels at most (phone memory: 420), and writes
GEAR_DIR/ygyeok_hd/<name>.png + index.json in the ygyeok form ({cell, n, ms, add, anchor, cap}, plus "durs": each
frame's ms when they differ). prepare_assets.py / repack_from_apk.py put them over fx g_<name>.
An additive render (on black) is turned into a painted one — alpha the brightest channel, the colour divided by it,
so it looks the same over black and is not washed out over the dark ground; the near-black of the prefab's unlit
helper quads (max channel < 16: its guide lines) drops out as the empty it is drawn as.
"""
import json
import os
import sys

import numpy as np
from PIL import Image

HD = {
    # 진청룡마령참·청룡참·악마 심판 격 (사용자 2026-11-28: 연은 청룡 포효까지 약 3초 — 너무 빨리 지나감): the clip's
    # empty lead dropped (frames 0-5); the dragon coiling up 110 ms a frame (1 s), its roar in its ring 225 ms (2 s).
    'roaring_dragon': {'frames': [6, 24], 'durs': [110] * 9 + [225] * 9, 'cap': 420},
    # 화신축융 격 (소 왕의 뿔's 심연 격), 천자의분노 격 (태초광명 격): as they were, at their own pixels
    'god_of_fire': {'cap': 420},
    'anger_son': {'cap': 420},
}


def main():
    src, gear = sys.argv[1], sys.argv[2]
    out = os.path.join(gear, 'ygyeok_hd')
    os.makedirs(out, exist_ok=True)
    index = json.load(open(os.path.join(src, 'index.json'), encoding='utf-8'))
    res = {}
    for name, o in HD.items():
        k = index.get(name)
        if not k:
            print(name, 'not rendered')
            continue
        (cw, ch), n = k['cell'], k['n']
        sheet = Image.open(os.path.join(src, name + '.png')).convert('RGBA')
        a, b = o.get('frames', [0, n])
        cells = []
        for i in range(a, b):
            c = np.asarray(sheet.crop((i * cw, 0, (i + 1) * cw, ch))).astype(np.float64)
            if k.get('add'):
                m = c[..., :3].max(axis=2)
                al = np.where(m < 16, 0, m)
                rgb = np.where(al[..., None] > 0, c[..., :3] * 255 / np.maximum(al, 1)[..., None], 0)
                c = np.dstack([np.clip(rgb, 0, 255), al])
            cells.append(c.astype(np.uint8))
        # the box any kept frame draws (alpha > 8), all cells cropped alike
        al = np.max([c[..., 3] for c in cells], axis=0)
        ys, xs = np.nonzero(al > 8)
        x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
        w, h = x1 - x0, y1 - y0
        z = min(1.0, o.get('cap', 420) / max(w, h))
        pics = [Image.fromarray(c[y0:y1, x0:x1]) for c in cells]
        if z < 1:
            pics = [p.resize((max(1, round(w * z)), max(1, round(h * z))), Image.LANCZOS) for p in pics]
        pw, ph = pics[0].size
        strip = Image.new('RGBA', (pw * len(pics), ph))
        for j, p in enumerate(pics):
            strip.paste(p, (j * pw, 0))
        strip.save(os.path.join(out, name + '.png'), optimize=True)
        e = {'cell': [pw, ph], 'n': len(pics), 'ms': k['ms'], 'add': False, 'cap': max(pw, ph),
             'anchor': [round((k['anchor'][0] - x0) * z), round((k['anchor'][1] - y0) * z)], 'prefab': k.get('prefab')}
        if o.get('durs'):
            e['durs'] = o['durs']
        res[name] = e
        print(name, e['cell'], e['n'], 'from', k['cell'], 'frames', a, b)
    json.dump(res, open(os.path.join(out, 'index.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
