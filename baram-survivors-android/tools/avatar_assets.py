"""Turns the wardrobe captures (oldbaram_avatar_sprites) into layers the game can dress a hero in.

Each capture is a whole character: head 0 in the plain outfit plus one item. The plain
character on its own is heads/head_0. So an item's layer is what differs from that plain
character, pose for pose. The captures' walking frames start at different points of the
step, so each sheet's frames are first matched to the plain character's: walk frame j of
every output is the same step. Armors keep the whole figure (they carry the body); heads,
weapons and shields become layers drawn over it. A head layer also marks, with alpha 1,
pixels of head 0's hair that its own hair does not cover, to be cleared.

Output, per item: avatar/<kind>/<n>.png, a sheet of 8 columns (idle, attack, magic, sit,
walk 0-3) by 4 rows (front, right, back, left), all in one cell size with the feet at one
point; avatar/<kind>/<n>_icon.png for the gear slots; and the list in the manifest.
"""
import glob
import json
import os

import numpy as np
from PIL import Image

# A cell big enough for the largest captures: the old wardrobe's weapons, and today's dress-room
# pieces (wings, big blades), with the feet at (AX, AY).
W, H, AX, AY = 260, 230, 130, 165
# The wardrobe draws characters larger than the game's monster pictures: in captures of the old
# client a character stands about as tall as a 처녀귀신 (52 pixels here), the wardrobe's 82.
SCALE = 0.64
WALK = [4, 5, 6, 7]


def load(path):
    meta = json.load(open(os.path.splitext(path)[0] + ".json", encoding="utf-8"))["meta"]
    cw, ch = meta["cell"]["w"], meta["cell"]["h"]
    ax, ay = meta["anchorFeet"]["x"], meta["anchorFeet"]["y"]
    im = Image.open(path).convert("RGBA")
    out = np.zeros((4, 8, H, W, 4), np.uint8)
    for r in range(4):
        for c in range(8):
            cell = Image.new("RGBA", (W, H))
            cell.paste(im.crop((c * cw, r * ch, (c + 1) * cw, (r + 1) * ch)), (AX - ax, AY - ay))
            out[r, c] = np.asarray(cell)
    return out, meta


def differs(a, b):
    return np.any(a != b, axis=-1)


def align(x, base, score):
    """x with its walk frames put in the base's step order."""
    y = x.copy()
    for r in range(4):
        for j in WALK:
            k = min(WALK, key=lambda k: score(x[r, k], base[r, j]))
            y[r, j] = x[r, k]
    return y


def layer(x, base, erase=False):
    x = align(x, base, lambda a, b: differs(a, b).sum())
    d = differs(x, base)
    out = np.zeros_like(x)
    out[d] = x[d]
    if erase:
        gone = d & (x[..., 3] == 0) & (base[..., 3] > 0)
        out[gone] = (0, 0, 0, 1)
    return out


def shrink(cell, w, h):
    """Smaller, smoothly, then hard-edged again so it stays pixel art. Alpha 1 (clear the
    plain head's hair) is carried over by nearest pixel."""
    erase = Image.fromarray(((cell[..., 3] == 1) * 255).astype(np.uint8)).resize((w, h), Image.NEAREST)
    a = cell.astype(np.float32)
    a[..., 3][a[..., 3] == 1] = 0
    pm = a.copy()
    pm[..., :3] *= pm[..., 3:4] / 255
    small = np.stack([np.asarray(Image.fromarray(pm[..., k]).resize((w, h), Image.LANCZOS)) for k in range(4)], -1)
    alpha = small[..., 3]
    rgb = np.where(alpha[..., None] > 1, small[..., :3] * 255 / np.maximum(alpha[..., None], 1), 0)
    out = np.zeros((h, w, 4), np.uint8)
    keep = alpha > 110
    out[..., :3] = np.clip(rgb, 0, 255)
    out[..., 3] = np.where(keep, 255, 0)
    e = np.asarray(erase) > 0
    out[e & ~keep] = (0, 0, 0, 1)
    return out


def silhouette_score(a, b):
    return np.logical_xor(a[..., 3] > 0, b[..., 3] > 0).sum()


def build(src, out, manifest, modern=None):
    """modern: today's dress-room captures (tools/fetch_gear.py's coordi folder), drawn on their
    own plain figure: armors keep the whole figure, weapons and shields become layers."""
    base, _ = load(os.path.join(src, "heads", "sheets", "head_0.png"))
    items = {"armor": [], "head": [], "weapon": [], "shield": []}
    sheets = {}
    for kind, folder in (("armor", "armors"), ("head", "heads"), ("weapon", "weapons"), ("shield", "shields")):
        for path in sorted(glob.glob(os.path.join(src, folder, "sheets", "*.png"))):
            x, meta = load(path)
            stem = os.path.splitext(os.path.basename(path))[0]
            name = meta.get("name") or stem.split("_", 2)[-1]
            if kind == "armor":
                s = align(x, base, silhouette_score)
            elif kind == "head":
                s = base.copy() if stem == "head_0" else layer(x, base, erase=True)
                name = stem.split("_")[1]
            else:
                s = layer(x, base)
            sheets[(kind, len(items[kind]))] = s
            items[kind].append({"name": name, "src": stem})
    if modern and os.path.exists(os.path.join(modern, "base.png")):
        # Today's plain figure, its walk put in the old figure's step order; each piece is then
        # matched to it, so every layer steps with every armor.
        mbase = align(load(os.path.join(modern, "base.png"))[0], base, silhouette_score)
        for kind, folder in (("armor", "armors"), ("weapon", "weapons"), ("shield", "shields")):
            for path in sorted(glob.glob(os.path.join(modern, folder, "sheets", "*.png"))):
                x, meta = load(path)
                s = align(x, mbase, silhouette_score) if kind == "armor" else layer(x, mbase)
                sheets[(kind, len(items[kind]))] = s
                items[kind].append({"name": meta["name"], "src": "coordi", "modern": True})
    # One crop for all, so every layer lines up with every armor.
    mask = np.zeros((H, W), bool)
    for s in sheets.values():
        mask |= (s[..., 3] > 0).any(axis=(0, 1))
    ys, xs = np.where(mask)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    cw, ch = round((x1 - x0) * SCALE), round((y1 - y0) * SCALE)
    for (kind, i), s in sheets.items():
        d = os.path.join(out, "avatar", kind)
        os.makedirs(d, exist_ok=True)
        c = np.stack([np.stack([shrink(s[r, k, y0:y1, x0:x1], cw, ch) for k in range(8)]) for r in range(4)])
        img = np.concatenate([np.concatenate(list(c[r]), axis=1) for r in range(4)], axis=0)
        Image.fromarray(img).save(os.path.join(d, f"{i}.png"), optimize=True)
        icon = Image.fromarray(np.where(c[0, 0, ..., 3:] > 1, c[0, 0], 0).astype(np.uint8))
        box = icon.getbbox()
        if box:
            icon.crop(box).save(os.path.join(d, f"{i}_icon.png"))
    manifest["avatar"] = {"cell": [cw, ch], "feet": [round((AX - x0) * SCALE), round((AY - y0) * SCALE)],
                          "cols": ["idle", "attack", "magic", "sit", "walk0", "walk1", "walk2", "walk3"],
                          "rows": ["front", "right", "back", "left"], **items}
    return {k: len(v) for k, v in items.items()}
