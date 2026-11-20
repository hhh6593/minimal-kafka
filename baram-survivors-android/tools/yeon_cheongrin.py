#!/usr/bin/env python3
"""연's 청룡 pictures for 진'청룡신검's 격 청린수폭 (gyeok.js cheongrin, game.js crDraw):

  cr_storm  Skill_Effect_Transform_Chungryong_A_0..7: the storm cloud and the blue-lightning 청룡
            coiling down out of it (연's 청룡 변신, its clip's 8 cells at its own 0.117 s);
  cr_bolt   Skill_Effect_Transform_Chungryong_B_0..1: the same lightning dragon's body alone (the
            second and third strikes);
  cr_brush  Yong-gung_BlueDragon_Line_3,4,6,5,7: the brush-stroke dragon shapes 진청룡마령참's clip
            swaps through (its Position/Black/Line_d). 연 ships them as a white mask (the alpha is
            all opaque, the white is the stroke) for its shader to colour: here the white becomes the
            alpha and the stroke takes the 청룡's blues, deep at its thin hairs, cyan toward its
            thick middle (how far into the stroke a pixel is, from the mask blurred), over a faint
            halo of the mask blurred wider.

    python3 tools/yeon_cheongrin.py SKILLS_BUNDLE GEAR_DIR

SKILLS_BUNDLE: Skills.unity3d from 연's resources, un-XORed (tools/yeon_dexor.py). Each sprite is
cut from its atlas by its rect and centred in a common cell (their pivots are all the middle).
Writes GEAR_DIR/ygyeok/cr_<storm|bolt|brush>.png and their entries in its index.json (fx g_cr_*,
"cap": kept at their own size (up to 300 pixels), not shrunk to the other 격's 170).
"""
import json
import os
import sys

import numpy as np
import UnityPy
from PIL import Image, ImageFilter

SETS = {
    'storm': ([f'Skill_Effect_Transform_Chungryong_A_{i}' for i in range(8)], 117),
    'bolt': ([f'Skill_Effect_Transform_Chungryong_B_{i}' for i in range(2)], 100),
    'brush': ([f'Yong-gung_BlueDragon_Line_{i}' for i in (3, 4, 6, 5, 7)], 120),
}
DEEP = np.array([22, 78, 205], float)    # the 청룡's deep blue (its lightning's shadow)
CYAN = np.array([64, 186, 255], float)   # its cyan
CORE = np.array([150, 226, 255], float)  # the near-white of its lightning's heart


def tint_brush(im):
    """A white-on-black mask: the white as alpha, coloured by how deep into the stroke."""
    a = np.asarray(im.convert('L'), float) / 255
    m = Image.fromarray((a * 255).astype(np.uint8))
    near = np.asarray(m.filter(ImageFilter.GaussianBlur(4)), float) / 255
    halo = np.asarray(m.filter(ImageFilter.GaussianBlur(7)), float) / 255
    d = np.clip((near - 0.45) / 0.55, 0, 1)[..., None] ** 1.6
    rgb = np.where(d < 0.8, DEEP + (CYAN - DEEP) * (d / 0.8), CYAN + (CORE - CYAN) * ((d - 0.8) / 0.2))
    # the halo under the stroke: the deep blue, faint
    ha = np.clip(halo * 0.6, 0, 1)
    out_a = a + ha * (1 - a)
    col = (rgb * a[..., None] + DEEP * (ha * (1 - a))[..., None]) / np.maximum(out_a, 1e-6)[..., None]
    arr = np.dstack([np.clip(col, 0, 255), out_a * 255]).astype(np.uint8)
    return Image.fromarray(arr, 'RGBA')


def main():
    bundle, gear = sys.argv[1], sys.argv[2]
    gdir = os.path.join(gear, 'ygyeok')
    os.makedirs(gdir, exist_ok=True)
    ipath = os.path.join(gdir, 'index.json')
    index = json.load(open(ipath, encoding='utf-8')) if os.path.isfile(ipath) else {}
    env = UnityPy.load(bundle)
    want = {n for names, _ in SETS.values() for n in names}
    sprites = {}
    for o in env.objects:
        if o.type.name != 'Sprite':
            continue
        if o.peek_name() not in want:
            continue
        sp = o.read()
        tex = sp.m_RD.texture.read()
        img = tex.image.convert('RGBA')
        r = sp.m_Rect
        x, y, w, h = round(r.x), round(r.y), round(r.width), round(r.height)
        # Unity's rects count from the texture's bottom.
        sprites[sp.m_Name] = img.crop((x, img.height - y - h, x + w, img.height - y))
    for name, (names, ms) in SETS.items():
        missing = [n for n in names if n not in sprites]
        if missing:
            sys.exit(f'missing sprites: {missing}')
        pics = [sprites[n] for n in names]
        if name == 'brush':
            pics = [tint_brush(p) for p in pics]
        pad = 8 if name == 'brush' else 0
        cw = max(p.width for p in pics) + 2 * pad
        ch = max(p.height for p in pics) + 2 * pad
        sheet = Image.new('RGBA', (cw * len(pics), ch))
        for i, p in enumerate(pics):
            sheet.alpha_composite(p, (i * cw + (cw - p.width) // 2, (ch - p.height) // 2))
        sheet.save(os.path.join(gdir, f'cr_{name}.png'), optimize=True)
        # The pivot: the cell's middle (연's), but the storm and bolt stand on the struck with the
        # lightning's foot (its lowest drawn row over all frames) on the target's feet.
        al = np.asarray(sheet, np.uint8)[..., 3]
        rows = np.nonzero(al.max(axis=1) > 40)[0]
        ay = int(rows[-1]) - 6 if name in ('storm', 'bolt') and len(rows) else ch // 2
        index[f'cr_{name}'] = {'cell': [cw, ch], 'n': len(pics), 'ms': ms, 'add': False, 'anchor': [cw // 2, ay],
                               'cap': 300, 'src': ','.join(names)}
        print(name, cw, ch, len(pics), 'anchor', cw // 2, ay)
    with open(ipath, 'w', encoding='utf-8') as f:
        json.dump(index, f, ensure_ascii=False)


if __name__ == '__main__':
    main()
