#!/usr/bin/env python3
"""연's damage numbers with their Korean units (만·억·조), as a bitmap font.

    yeon_dmgfont.py FXS OUT_DIR

FXS: FXs.unity3d of 바람의나라 연, un-XORed. 연 writes big damage as "640억2262만" in its
morris9 TextMesh Pro font (morris9_SDF, a signed-distance atlas) with an orange material and a
dark outline. This cuts the glyphs 0-9 만 억 조 out of that atlas (glyph rects from the font
asset's own glyph table), hardens the distance field at its edge, and paints each sheet the way
the material does: a vertical gradient and a two-pixel dark outline.

Output, in OUT_DIR (the yhud folder):
    font_dmgk_o.png / .json   orange (an ordinary blow)
    font_dmgk_r.png / .json   red-gold (a 치명타)
    font_dmgk_w.png / .json   white (the instant a number appears, as 연 pops it before it turns)
    json: {"height": h, "glyphs": {char: [x, y, w, h, advance]}}
"""
import json
import os
import sys

import UnityPy
from PIL import Image, ImageFilter

CHARS = '0123456789만억조'
STYLES = {
    'o': ((255, 236, 120), (255, 132, 24), (60, 18, 0)),   # top, bottom, outline
    'r': ((255, 214, 90), (232, 40, 20), (50, 0, 0)),
    'w': ((255, 255, 255), (214, 222, 236), (30, 24, 40)),   # the blow's first instant, before it turns orange
    'g': ((200, 255, 150), (60, 200, 60), (0, 40, 0)),       # life restored
    'b': ((170, 220, 255), (50, 120, 240), (0, 20, 60)),     # mana restored
}


def main():
    fxs, out = sys.argv[1], sys.argv[2]
    env = UnityPy.load(fxs)
    asset = atlas = None
    for o in env.objects:
        n = o.peek_name()
        if o.type.name == 'MonoBehaviour' and n == 'morris9_SDF':
            asset = o.read_typetree()
        elif o.type.name == 'Texture2D' and n == 'morris9_SDF Atlas':
            atlas = o.read().image.convert('RGBA')
    if not asset or not atlas:
        sys.exit('morris9_SDF not found')
    glyphs = {g['m_Index']: g for g in asset['m_GlyphTable']}
    chars = {c['m_Unicode']: c['m_GlyphIndex'] for c in asset['m_CharacterTable']}
    alpha = atlas.split()[3]
    H = atlas.height
    pieces = []
    for ch in CHARS:
        g = glyphs[chars[ord(ch)]]
        r, m = g['m_GlyphRect'], g['m_Metrics']
        # Unity's rect is from the bottom left; PIL's from the top left.
        box = (r['m_X'], H - (r['m_Y'] + r['m_Height']), r['m_X'] + r['m_Width'], H - r['m_Y'])
        a = alpha.crop(box).point(lambda v: 255 if v >= 128 else 0)
        pieces.append((ch, a, m))
    asc = max(m['m_HorizontalBearingY'] for _, _, m in pieces)
    desc = max(m['m_Height'] - m['m_HorizontalBearingY'] for _, _, m in pieces)
    pad = 2
    cell_h = int(asc + desc) + 2 * pad
    for key, (top, bot, edge) in STYLES.items():
        x = 0
        sheet = Image.new('RGBA', (sum(a.width + 2 * pad + 1 for _, a, _ in pieces), cell_h), (0, 0, 0, 0))
        meta = {}
        for ch, a, m in pieces:
            w = a.width + 2 * pad
            cell = Image.new('L', (w, cell_h), 0)
            y0 = int(asc - m['m_HorizontalBearingY']) + pad
            cell.paste(a, (pad, y0))
            # The outline: the glyph grown by two pixels, in the dark edge colour.
            grown = cell.filter(ImageFilter.MaxFilter(5))
            out_img = Image.new('RGBA', (w, cell_h), edge + (0,))
            out_img.putalpha(grown)
            # The fill: a vertical gradient over the glyph's own height.
            grad = Image.new('RGBA', (w, cell_h))
            for yy in range(cell_h):
                k = min(1, max(0, (yy - y0) / max(1, a.height)))
                grad.paste(tuple(int(top[i] + (bot[i] - top[i]) * k) for i in range(3)) + (255,), (0, yy, w, yy + 1))
            grad.putalpha(cell)
            out_img.alpha_composite(grad)
            sheet.alpha_composite(out_img, (x, 0))
            meta[ch] = [x, 0, w, cell_h, round(m['m_HorizontalAdvance'] + 1, 1)]
            x += w + 1
        sheet.save(os.path.join(out, f'font_dmgk_{key}.png'), optimize=True)
        json.dump({'height': cell_h, 'glyphs': meta, 'font': 'morris9_SDF'},
                  open(os.path.join(out, f'font_dmgk_{key}.json'), 'w'), ensure_ascii=False)
    print('font_dmgk', cell_h, len(CHARS))


if __name__ == '__main__':
    main()
