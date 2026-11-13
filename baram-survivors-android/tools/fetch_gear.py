#!/usr/bin/env python3
"""Downloads today's client item pictures the gear uses (용무기 제일~제십, the legendary sets).

    fetch_gear.py OUT_DIR

The names come from web/js/items.js (gearPictures, run with node). Each picture is the official
avatar site's item render, https://avatar.baram.nexon.com/Item/Render/<item name> (the address
the xoxd.tistory.com gear guides use), saved as OUT_DIR/<item name>.png. Pass OUT_DIR to
build.sh as GEAR_DIR. Pictures already there are kept.

It also fetches how each piece looks worn, from the official dress room (baram.nexon.com
/Coordi/DressRoom): https://avatar.baram.nexon.com/Coordi/RenderAvatar/M?pi=<item>&cd=<dir>&mt=<motion>
renders the plain male figure wearing the item, as an animated GIF on a fixed 332x304 canvas,
facing cd (2 front, 1 right, 0 back, 3 left) in motion mt (1 stand, 2 walk, 3 attack, 4 magic,
6 pick up). Those are put together like the wardrobe captures (tools/avatar_assets.py):
OUT_DIR/coordi/<kind>s/sheets/<n>.png + .json, 8 columns (idle, attack, magic, sit, walk 0-3)
by 4 rows (front, right, back, left), and coordi/base.png for the plain figure.
"""
import concurrent.futures as cf
import json
import os
import subprocess
import sys
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RENDER = "https://avatar.baram.nexon.com/Item/Render/"


def names():
    js = "import('./web/js/items.js').then(m => console.log(JSON.stringify(m.gearPictures())))"
    return json.loads(subprocess.check_output(["node", "-e", js], cwd=HERE))


def address(name):
    # The site's own escapes for characters a path cannot hold.
    return RENDER + urllib.parse.quote(name.replace("?", "？").replace(".", "′").replace(":", "＃"))


def fetch(out, name):
    path = os.path.join(out, name + ".png")
    if os.path.exists(path):
        return name, "kept"
    try:
        with urllib.request.urlopen(address(name), timeout=30) as r:
            data = r.read()
    except Exception as e:  # noqa: BLE001 - reported per picture
        return name, f"failed: {e}"
    if not data.startswith(b"\x89PNG"):
        return name, "no picture"
    with open(path, "wb") as f:
        f.write(data)
    return name, "saved"


COORDI = "https://avatar.baram.nexon.com/Coordi/RenderAvatar/M"
CANVAS, FEET = (332, 304), (167, 231)
ROWS = [2, 1, 0, 3]                       # cd for front, right, back, left
# (motion, frame) for idle, attack, magic, sit, then the four walk frames.
COLS = [(1, 0), (3, 0), (4, 2), (6, -1), (2, 0), (2, 1), (2, 2), (2, 3)]


def render(item, cd, mt):
    q = f"?cd={cd}&mt={mt}" + (f"&pi={urllib.parse.quote(item)}" if item else "")
    for attempt in range(3):
        try:
            with urllib.request.urlopen(COORDI + q, timeout=40) as r:
                return r.read()
        except Exception:  # noqa: BLE001 - retried, then the piece is skipped
            if attempt == 2:
                raise
    return None


def coordi_sheet(item):
    """One capture sheet of the plain figure wearing item (None: the plain figure)."""
    from io import BytesIO
    from PIL import Image
    w, h = CANVAS
    sheet = Image.new("RGBA", (w * 8, h * 4))
    cache = {}
    for r, cd in enumerate(ROWS):
        for c, (mt, f) in enumerate(COLS):
            if (cd, mt) not in cache:
                cache[(cd, mt)] = Image.open(BytesIO(render(item, cd, mt)))
            im = cache[(cd, mt)]
            im.seek(f % im.n_frames)
            sheet.paste(im.convert("RGBA"), (c * w, r * h))
    return sheet


def fetch_coordi(out):
    root = os.path.join(out, "coordi")
    meta = lambda name: {"meta": {"name": name, "cell": {"w": CANVAS[0], "h": CANVAS[1]},
                                  "anchorFeet": {"x": FEET[0], "y": FEET[1]}, "source": COORDI}}
    os.makedirs(root, exist_ok=True)
    if not os.path.exists(os.path.join(root, "base.png")):
        coordi_sheet(None).save(os.path.join(root, "base.png"))
        json.dump(meta(""), open(os.path.join(root, "base.json"), "w", encoding="utf-8"), ensure_ascii=False)
    js = "import('./web/js/items.js').then(m => console.log(JSON.stringify(m.coordiPieces())))"
    pieces = json.loads(subprocess.check_output(["node", "-e", js], cwd=HERE))
    counts = {}

    def one(p):
        d = os.path.join(root, p["kind"] + "s", "sheets")
        os.makedirs(d, exist_ok=True)
        stem = os.path.join(d, "".join(f"{ord(ch):x}" for ch in p["name"]))
        if os.path.exists(stem + ".png"):
            return p, "kept"
        try:
            coordi_sheet(p["name"]).save(stem + ".png", optimize=True)
        except Exception as e:  # noqa: BLE001
            return p, f"failed: {e}"
        json.dump(meta(p["name"]), open(stem + ".json", "w", encoding="utf-8"), ensure_ascii=False)
        return p, "saved"

    with cf.ThreadPoolExecutor(3) as ex:
        for p, how in ex.map(one, pieces):
            counts[how.split(":")[0]] = counts.get(how.split(":")[0], 0) + 1
            if how.startswith("failed"):
                print(p["name"], how)
    print("dress-room sheets:", counts)


def main():
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    with cf.ThreadPoolExecutor(6) as ex:
        results = list(ex.map(lambda n: fetch(out, n), names()))
    for name, how in results:
        if how not in ("kept", "saved"):
            print(name, how)
    print(f"{sum(h in ('kept', 'saved') for _, h in results)}/{len(results)} pictures in {out}")
    if "--no-coordi" not in sys.argv:
        fetch_coordi(out)


if __name__ == "__main__":
    main()
