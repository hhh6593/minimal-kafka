"""camshift.py FRAMES_DIR [R] — the camera's shift between each frame and the one before it, in a capture whose
field scrolls under a centred hero (2662's scenes): the integer (dx, dy) within ±R that best lays frame i-1's floor on
frame i's (the median of |difference| over a sample of pixels: what moves over the floor — effects, monsters, numbers —
is the smaller part and does not count). Prints, and writes FRAMES_DIR/cam.json: the field's place under each frame,
cum[i] = [x, y] (a point of the field seen at (px, py) in frame 0 is at (px + x, py + y) in frame i).
"""
import json, os, sys
import numpy as np
from PIL import Image

d = sys.argv[1]
R = int(sys.argv[2]) if len(sys.argv) > 2 else 28
names = sorted(n for n in os.listdir(d) if n.endswith('.png'))
fr = [np.asarray(Image.open(os.path.join(d, n)).convert('L')).astype(np.int16) for n in names]
H, W = fr[0].shape
cum = [[0, 0]]
rng = np.random.default_rng(1)
ys = rng.integers(R + 2, H - R - 2, 6000)
xs = rng.integers(R + 2, W - R - 2, 6000)
for i in range(1, len(fr)):
    a, b = fr[i - 1], fr[i]
    best = None
    for dy in range(-R, R + 1):
        for dx in range(-R, R + 1):
            # the field point at (x, y) in a is at (x + dx, y + dy) in b
            v = np.median(np.abs(b[ys + dy, xs + dx] - a[ys, xs]))
            # (ties: the smaller move)
            key = (v, abs(dx) + abs(dy))
            if best is None or key < best[0]:
                best = (key, dx, dy)
    cum.append([cum[-1][0] + best[1], cum[-1][1] + best[2]])
    print(i, best[1], best[2], best[0][0], cum[-1])
json.dump(cum, open(os.path.join(d, 'cam.json'), 'w'))
