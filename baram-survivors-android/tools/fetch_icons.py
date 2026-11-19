#!/usr/bin/env python3
"""Official item icons for the pieces and materials whose own picture the game lacked, made to sit
with 바람의나라 연's icons around them.

    fetch_icons.py GEAR_DIR [--yeon-items ITEMS_UNITY3D] [--compare OUT.png]

What it takes comes from web/js/items.js iconPictures() (run with node):
  gear   the crafted pieces' pictures by name at each star (the legendary sets, the original's
         weapon lines): each the official avatar server's item render,
         https://avatar.baram.nexon.com/Item/Render/<name> (tools/fetch_gear.py address()), cached
         as GEAR_DIR/<name>.png (the same files fetch_gear.py keeps: nothing is fetched twice).
  names  the lines' pieces shown by name (items.js NAME_ICONS): the same renders, cached in
         GEAR_DIR/gicon/raw/<name>.png (only their icons go into the game).
         The names are the server's own (tools/item_catalog.json, from tools/xoxd_catalog.py).
  mats   the materials' 연 item ids (items.js MATS[].yeon): their inventory icon, the sprite
         "Item_<id>" of 연's decrypted Items.unity3d (as tools/yeon_itemicons.py cuts the gear's),
         cached as GEAR_DIR/gicon/raw/mat_<id>.png. Skipped without --yeon-items (needs UnityPy).

Every picture then goes through normalise(), so it matches the 연 icons the inventory, the forge
and the 도감 show beside it (GEAR_DIR/yitemicon, measured when there): cropped to what is drawn,
fitted into the frame 연's icons have in the build (trimmed, at most 64 px: FRAME; left pixel for
pixel when it already fits, else scaled down smoothly and its edge made hard again, as 연's pixel
icons are), given 연's dark one-pixel outline
where its rim has none (the colour beside it, darkened), and its brightness brought half way toward
the 연 icons' own. Out: GEAR_DIR/gicon/<hex>.png and
GEAR_DIR/gicon/index.json {name | "mat:<id>": file}; tools/prepare_assets.py copies them to
assets/gicon/ (manifest gicon) and the game shows them by name (game.js nameIcon).

Be gentle with the server: at most 4 requests at a time, and a picture already kept is never asked
for again.
"""
import concurrent.futures as cf
import glob
import json
import os
import re
import subprocess
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fetch_gear  # noqa: E402  (address() and fetch(): the same cache, the same escapes)

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# 연's item sprites are drawn on 32x32, and the build keeps its icons trimmed and at most 64 px
# (tools/yeon_itemicons.py); the windows show them in a 32-pixel box. A fetched picture is kept to
# the same: at most 64 (shown at 32 like 연's 32, so a newer item drawn at twice 연's size keeps
# its detail on the phone's screen instead of being squeezed into 32 pixels).
FRAME = 64


def wanted():
    js = "import('./web/js/items.js').then(m => console.log(JSON.stringify(m.iconPictures())))"
    return json.loads(subprocess.check_output(["node", "-e", js], cwd=HERE))


def luma(px):
    return 0.299 * px[0] + 0.587 * px[1] + 0.114 * px[2]


def opaque(data, w, h, x, y):
    return 0 <= x < w and 0 <= y < h and data[x, y][3] >= 128


def stats(im):
    """Mean brightness of what is drawn inside its rim, and how much of the rim is dark (an outline)."""
    data, w, h = im.load(), im.width, im.height
    tot = n = rim = dark = 0
    for y in range(h):
        for x in range(w):
            p = data[x, y]
            if p[3] < 128:
                continue
            if all(opaque(data, w, h, x + dx, y + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                tot += luma(p)
                n += 1
            else:
                rim += 1
                dark += luma(p) < 80
    return (tot / n if n else 128), (dark / rim if rim else 1)


def reference(gear_dir):
    """The 연 icons' median brightness and outline share (fixed values when the build has none)."""
    files = sorted(glob.glob(os.path.join(gear_dir, "yitemicon", "*", "*.png")))[::7]
    if not files:
        return 118.0, 0.8
    ls, os_ = [], []
    for f in files:
        l, o = stats(Image.open(f).convert("RGBA"))
        ls.append(l)
        os_.append(o)
    ls.sort()
    os_.sort()
    return ls[len(ls) // 2], os_[len(os_) // 2]


def key_out_backdrop(im):
    """An opaque picture (no alpha at all): its corner colour, flood-filled from the edges, made clear."""
    if im.getchannel("A").getextrema()[0] < 255:
        return im
    px, w, h = im.load(), im.width, im.height
    bg = px[0, 0]
    close = lambda p: sum(abs(p[i] - bg[i]) for i in range(3)) < 24
    stack = [(x, y) for x in range(w) for y in (0, h - 1)] + [(x, y) for y in range(h) for x in (0, w - 1)]
    seen = set()
    while stack:
        x, y = stack.pop()
        if (x, y) in seen or not (0 <= x < w and 0 <= y < h) or not close(px[x, y]):
            continue
        seen.add((x, y))
        px[x, y] = (0, 0, 0, 0)
        stack += [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
    return im


def outline(im):
    """연's one-pixel outline round what is drawn: each new rim pixel the colour of the drawing
    beside it, darkened to a line (so a blue blade gets a dark blue line, as 연's do)."""
    c = Image.new("RGBA", (im.width + 2, im.height + 2))
    c.paste(im, (1, 1))
    src, w, h = c.load(), c.width, c.height
    out = c.copy()
    dst = out.load()
    for y in range(h):
        for x in range(w):
            if src[x, y][3] >= 128:
                continue
            near = [src[x + dx, y + dy] for dx in (-1, 0, 1) for dy in (-1, 0, 1)
                    if (dx or dy) and opaque(src, w, h, x + dx, y + dy)]
            if near:
                dst[x, y] = tuple(round(sum(p[i] for p in near) / len(near) * 0.3) for i in range(3)) + (255,)
    return out


def normalise(im, ref):
    """One fetched picture made to sit with 연's icons (see the module's note)."""
    ref_luma, ref_outline = ref
    im = key_out_backdrop(im.convert("RGBA"))
    box = im.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    if not box:
        return None
    im = im.crop(box)
    # Into the frame: a picture already within it stays pixel for pixel; a bigger one (the newest
    # items are drawn larger still) comes down smoothly, leaving a pixel each side for the
    # outline, and its edge is made hard again as 연's are.
    if max(im.size) > FRAME:
        k = (FRAME - 2) / max(im.size)
        size = (max(1, round(im.width * k)), max(1, round(im.height * k)))
        twice = im.width % 2 == 0 and im.height % 2 == 0 and im.resize((im.width // 2, im.height // 2), Image.NEAREST) \
            .resize(im.size, Image.NEAREST).tobytes() == im.tobytes()
        im = im.resize(size, Image.NEAREST if twice and abs(k - 0.5) < 0.01 else Image.LANCZOS)
        im.putalpha(im.getchannel("A").point(lambda v: 255 if v >= 72 else 0))
        b = im.getbbox()
        im = im.crop(b) if b else im
    else:
        im.putalpha(im.getchannel("A").point(lambda v: 255 if v >= 72 else 0))
    _, outlined = stats(im)
    if outlined < min(0.5, ref_outline * 0.7) and max(im.size) <= FRAME - 2:
        im = outline(im)
    # Brightness: half way toward the 연 icons' (inside the outline), never more than -15%/+20%.
    l1, _ = stats(im)
    if l1 > 1:
        k = max(0.85, min(1.2, 1 + 0.5 * (ref_luma / l1 - 1)))
        if abs(k - 1) > 0.04:
            r, g, b, a = im.split()
            r, g, b = (ch.point(lambda v: min(255, round(v * k))) for ch in (r, g, b))
            im = Image.merge("RGBA", (r, g, b, a))
    return im


def yeon_mats(items_path, ids, raw_dir):
    """연's own icons of the materials (Item_<id> sprites), cached in raw_dir."""
    want = {int(i) for i in ids if not os.path.exists(os.path.join(raw_dir, f"mat_{i}.png"))}
    if not want:
        return
    import UnityPy
    best = {}
    for o in UnityPy.load(items_path).objects:
        if o.type.name != "Sprite":
            continue
        m = re.fullmatch(r"[Ii]tem_(\d+)", o.peek_name())
        if not m or int(m.group(1)) not in want:
            continue
        im = o.read().image.convert("RGBA")
        k = int(m.group(1))
        if k not in best or im.width * im.height > best[k].width * best[k].height:
            best[k] = im
    for k, im in best.items():
        im.save(os.path.join(raw_dir, f"mat_{k}.png"))
    if want - set(best):
        print("materials without a sprite:", sorted(want - set(best)))


def stem(name):
    return "".join(f"{ord(ch):x}" for ch in name)


def main():
    gear_dir = sys.argv[1]
    out = os.path.join(gear_dir, "gicon")
    raw = os.path.join(out, "raw")
    os.makedirs(raw, exist_ok=True)
    want = wanted()
    # Names the server has no picture for (연's own later classes' 용 lines ...), remembered so
    # they are not asked for again; --retry asks anyway.
    miss_path = os.path.join(out, "missing.json")
    known_missing = set() if "--retry" in sys.argv or not os.path.exists(miss_path) else set(json.load(open(miss_path, encoding="utf-8")))
    # The crafted pieces' pictures live in GEAR_DIR itself (fetch_gear.py's, the game's picture());
    # the rest only as icons, their renders kept in gicon/raw.
    gear = set(want["gear"])
    where = lambda n: gear_dir if n in gear else raw
    names = list(dict.fromkeys(want["gear"] + want["names"]))
    ask = [n for n in names if n not in known_missing]
    with cf.ThreadPoolExecutor(4) as ex:
        res = list(ex.map(lambda n: fetch_gear.fetch(where(n), n), ask))
    bad = [(n, h) for n, h in res if h not in ("kept", "saved")]
    print(f"item renders: {sum(h == 'saved' for _, h in res)} saved, {sum(h == 'kept' for _, h in res)} kept, "
          f"{len(bad)} missing, {len(names) - len(ask)} known missing")
    for n, h in bad:
        if not h.startswith("failed"):
            known_missing.add(n)
    with open(miss_path, "w", encoding="utf-8") as f:
        json.dump(sorted(known_missing), f, ensure_ascii=False, indent=0)
    for n, h in bad:
        if h.startswith("failed"):
            print("  ", n, h)
    if "--yeon-items" in sys.argv:
        yeon_mats(sys.argv[sys.argv.index("--yeon-items") + 1], want["mats"].values(), raw)
    ref = reference(gear_dir)
    print("연 icons: median brightness %.0f, outlined rim %.2f" % ref)
    index, pairs = {}, []
    for name in names:
        src = os.path.join(where(name), name + ".png")
        if os.path.exists(src):
            pairs.append((name, src))
    for mid, iid in want["mats"].items():
        src = os.path.join(raw, f"mat_{iid}.png")
        if os.path.exists(src):
            pairs.append((f"mat:{mid}", src))
    for key, src in pairs:
        im = normalise(Image.open(src), ref)
        if im is None:
            continue
        fn = (key.replace(":", "_") if key.startswith("mat:") else stem(key)) + ".png"
        im.save(os.path.join(out, fn), optimize=True)
        index[key] = fn
    with open(os.path.join(out, "index.json"), "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=0)
    print(f"{len(index)} icons in {out}")
    if "--compare" in sys.argv:
        compare([(k, s, os.path.join(out, index[k])) for k, s in pairs if k in index], sys.argv[sys.argv.index("--compare") + 1])


def compare(rows, path):
    """Before (as fetched, cropped) and after (normalised) side by side at 3x, nearest."""
    cell, cols = 104, 8
    sheet = Image.new("RGB", (cell * 2 * cols, cell * ((len(rows) + cols - 1) // cols)), (92, 80, 60))
    for i, (_, before, after) in enumerate(rows):
        x0, y0 = (i % cols) * cell * 2, (i // cols) * cell
        for j, p in enumerate((before, after)):
            im = Image.open(p).convert("RGBA")
            if j == 0:
                b = im.getbbox()
                im = im.crop(b) if b else im
            k = max(1, min(3, (cell - 8) // max(im.size)))
            im = im.resize((max(1, im.width * k if max(im.size) * k <= cell - 8 else round(im.width * (cell - 8) / max(im.size))),
                            max(1, im.height * k if max(im.size) * k <= cell - 8 else round(im.height * (cell - 8) / max(im.size)))), Image.NEAREST)
            bg = Image.new("RGBA", (cell - 4, cell - 4), (196, 170, 120, 255) if j else (150, 130, 100, 255))
            bg.alpha_composite(im, ((bg.width - im.width) // 2, (bg.height - im.height) // 2))
            sheet.paste(bg.convert("RGB"), (x0 + j * cell + 2, y0 + 2))
    sheet.save(path)


if __name__ == "__main__":
    main()
