#!/usr/bin/env python3
"""Shrinks the build's effect sheets: each large fx/<id>.png becomes fx/<id>.webp (lossy, quality 90; the original
바람의나라 captures "o_<id>" lossless).

    webp_fx.py ASSETS_DIR

Effects are soft glows and flashes, where WebP's loss does not show, and they were a third of the
APK. Sprites (heroes, monsters, maps) keep their lossless PNGs: their single pixels would smear.
The ids converted are listed in manifest.json as "fxWebp"; the game loads those as .webp under
the same image key (fx/<id>.png).

The 9차 effects cut from the original's captures ("o_…", tools/s9_fx.py) are pixel art: lossy WebP broke them into
8×8 blocks and smeared their single dots (사용자: 추출한 도트들에 깨지는 부분) — they go lossless.
"""
import json
import os
import sys

from PIL import Image

MIN_BYTES = 30_000  # smaller sheets gain little


def main():
    assets = sys.argv[1]
    fxdir = os.path.join(assets, 'fx')
    man_path = os.path.join(assets, 'manifest.json')
    man = json.load(open(man_path))
    done, before, after = [], 0, 0
    for name in sorted(os.listdir(fxdir)):
        if not name.endswith('.png'):
            continue
        src = os.path.join(fxdir, name)
        size = os.path.getsize(src)
        if size < MIN_BYTES:
            continue
        dst = src[:-4] + '.webp'
        with Image.open(src) as im:
            im = im.convert('RGBA')
            if max(im.size) > 16383:  # WebP's limit: keep the PNG
                continue
            if name.startswith('o_'):
                im.save(dst, 'WEBP', lossless=True, method=4)
            else:
                im.save(dst, 'WEBP', quality=90, alpha_quality=90, method=4)
        if os.path.getsize(dst) >= size:
            os.remove(dst)
            continue
        before += size
        after += os.path.getsize(dst)
        os.remove(src)
        done.append(name[:-4])
    # (with those already shrunk: run over a www that had some, it must not forget them — 2026-11-28 404s)
    man['fxWebp'] = sorted(set(man.get('fxWebp', [])) | set(done))
    json.dump(man, open(man_path, 'w'), ensure_ascii=False, separators=(',', ':'))
    print(f'fx webp {len(done)}: {before / 1e6:.1f} MB -> {after / 1e6:.1f} MB')


if __name__ == '__main__':
    main()
