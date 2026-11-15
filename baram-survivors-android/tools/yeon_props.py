#!/usr/bin/env python3
"""Props (trees, rocks, walls, jars) cut from real maps: old 바람's town render and 바람의나라 연's
hunting-ground screenshots. The floor around the prop is taken off by flooding in from the
crop's edge over pixels close to the floor's own colours; what is left is saved, trimmed, to
GEAR_DIR/prop/<terrain>_<name>.png at the game's scale.

    yeon_props.py OUT_DIR SRC:BOX:SCALE:NAME[:TOL[:top]] ...      BOX = x0,y0,x1,y1 in the source
"""
import sys, os
from collections import deque
import numpy as np
from PIL import Image


def cut(a, tol, top=False):
    h, w = a.shape[:2]
    f = a.astype(int)
    # top: the prop runs off the crop's other sides (a wall), so only the top edge is floor.
    edge = f[0] if top else np.concatenate([f[0], f[-1], f[:, 0], f[:, -1]])
    # A few floor colours from the border, so mottled ground still counts as floor.
    pal = edge[np.random.default_rng(1).choice(len(edge), min(64, len(edge)), replace=False)]
    near = np.min(np.abs(f[:, :, None, :] - pal[None, None]).sum(3), axis=2) <= tol
    floor = np.zeros((h, w), bool)
    q = deque((0, x) for x in range(w) if near[0, x])
    if not top:
        q.extend((y, x) for y in range(h) for x in (0, w - 1) if near[y, x])
        q.extend((h - 1, x) for x in range(w) if near[h - 1, x])
    for y, x in q:
        floor[y, x] = True
    while q:
        y, x = q.popleft()
        for yy, xx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
            if 0 <= yy < h and 0 <= xx < w and not floor[yy, xx] and near[yy, xx]:
                floor[yy, xx] = True
                q.append((yy, xx))
    # Specks of floor left enclosed by the prop's outline stay; lone prop pixels go.
    keep = ~floor
    n = sum(np.roll(np.roll(keep, dy, 0), dx, 1) for dy in (-1, 0, 1) for dx in (-1, 0, 1))
    keep &= n >= 4
    # Bits of a neighbouring roof or tree caught in the crop: only the prop's own body stays.
    lab = np.zeros((h, w), int)
    sizes = [0]
    for y0 in range(h):
        for x0 in range(w):
            if keep[y0, x0] and not lab[y0, x0]:
                sizes.append(0)
                lab[y0, x0] = len(sizes) - 1
                q = deque([(y0, x0)])
                while q:
                    y, x = q.popleft()
                    sizes[-1] += 1
                    for yy in (y - 1, y, y + 1):
                        for xx in (x - 1, x, x + 1):
                            if 0 <= yy < h and 0 <= xx < w and keep[yy, xx] and not lab[yy, xx]:
                                lab[yy, xx] = len(sizes) - 1
                                q.append((yy, xx))
    big = max(sizes)
    return np.isin(lab, [i for i, n in enumerate(sizes) if i and n >= big * 0.15])


def main():
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    for spec in sys.argv[2:]:
        parts = spec.split(':')
        src, box, scale, name = parts[:4]
        tol = int(parts[4]) if len(parts) > 4 else 22
        top = len(parts) > 5 and parts[5] == 'top'
        x0, y0, x1, y1 = map(int, box.split(','))
        im = Image.open(src).convert('RGB').crop((x0, y0, x1, y1))
        k = float(scale)
        if k != 1:
            im = im.resize((round(im.width * k), round(im.height * k)), Image.NEAREST if k > 1 else Image.LANCZOS)
        a = np.asarray(im)
        keep = cut(a, tol, top)
        rgba = np.dstack([a, np.where(keep, 255, 0).astype(np.uint8)])
        img = Image.fromarray(rgba, 'RGBA')
        img = img.crop(img.getbbox())
        img.save(os.path.join(out, name + '.png'))
        print(name, img.size)


if __name__ == '__main__':
    main()
