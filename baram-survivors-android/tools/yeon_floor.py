#!/usr/bin/env python3
"""Floor tiles from 바람의나라 연's own hunting grounds (its screenshots and update GIFs):
a clean patch of floor, scaled so its figures match ours, made seamless by blending each
edge into the opposite one, saved as GEAR_DIR/floor/<terrain>.png.

    yeon_floor.py OUT_DIR SRC:BOX:SCALE:NAME ...      BOX = x0,y0,x1,y1 in the source
"""
import sys, os
import numpy as np
from PIL import Image, ImageFilter


def seamless(a, o):
    """Wrap the patch onto itself: across an o-pixel band each pixel comes from one side or the
    other at random (weighted by distance), so the texture keeps its contrast instead of blurring."""
    h, w = a.shape[:2]
    W, H = w - o, h - o
    rng = np.random.default_rng(7)
    out = a[:, :W].copy()
    for x in range(o):
        pick = rng.random(h) > x / o
        out[pick, x] = a[pick, x + W]
    res = out[:H].copy()
    for y in range(o):
        pick = rng.random(W) > y / o
        res[y, pick] = out[y + H, pick]
    return res


def flatten(im):
    """Even out the screenshot's lighting (vignettes, glows) so the tile shows no stripes."""
    a = np.asarray(im).astype(float)
    r = max(4, min(im.size) // 6)
    low = np.asarray(im.filter(ImageFilter.GaussianBlur(r))).astype(float) + 1
    return np.clip(a / low * low.reshape(-1, 3).mean(0), 0, 255).astype(np.uint8)


def main():
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    for spec in sys.argv[2:]:
        src, box, scale, name = spec.split(':')
        x0, y0, x1, y1 = map(int, box.split(','))
        im = Image.open(src).convert('RGB').crop((x0, y0, x1, y1))
        k = float(scale)
        im = im.resize((max(8, round(im.width * k)), max(8, round(im.height * k))), Image.LANCZOS)
        a = flatten(im)
        o = max(4, min(a.shape[0], a.shape[1]) // 4)
        Image.fromarray(seamless(a, o)).save(os.path.join(out, name + '.png'))
        print(name, im.size)


if __name__ == '__main__':
    main()
