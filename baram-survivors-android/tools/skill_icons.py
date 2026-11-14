#!/usr/bin/env python3
"""Real skill icons for the 8·9차 spells, cut from the official tooltip screenshots.

    skill_icons.py OUT_DIR TOOLTIP_FILE=skill_id ...

Each tooltip (the in-game skill window, as posted in the class guides) carries the skill's
icon in its top-left corner, a framed square of about 40 pixels, saved as OUT_DIR/<id>.png
(GEAR_DIR/skillicon/, which prepare_assets.py copies into assets/skillicon/).
"""
import os
import sys

from PIL import Image


def cut(path):
    # The window draws the icon at the same place in every tooltip: a framed square from
    # about (10, 10) to (50, 50). Cut that, then trim the black left around the frame.
    im = Image.open(path).convert("RGB").crop((6, 6, 54, 54))
    lit = im.convert("L").point(lambda v: 255 if v > 24 else 0)
    box = lit.getbbox()
    if not box or box[2] - box[0] < 30:
        raise SystemExit(f"{path}: no icon found")
    return im.crop(box)


def main():
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    for arg in sys.argv[2:]:
        path, sid = arg.rsplit("=", 1)
        ic = cut(path)
        ic.save(os.path.join(out, sid + ".png"))
        print(sid, ic.size)


if __name__ == "__main__":
    main()
