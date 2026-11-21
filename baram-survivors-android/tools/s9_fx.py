#!/usr/bin/env python3
"""The original 바람의나라's 9차 skill effects, as strips the build reads (GEAR_DIR/s9fx/).

    s9_fx.py SPEC_JSON SRC_DIR OUT_DIR

SPEC_JSON (tools/s9_fx.json): {id: {...}} for each effect, from the community blog's captures of the
official client (xoxd.tistory.com 1320: the effect sprites alone, drawn on white; 2662: the 9차 skills
in play, drawn over the field). SRC_DIR holds those GIFs as the spec names them. Nothing is drawn
here: each frame is the client's own pixels, taken off their backdrop:
  mode "white": the sprite on white — the white taken back out (alpha = 1 - darkest channel, colour
                restored), as prepare_assets.unwhite does for the modern captures;
  mode "diff":  the effect over the field in a still camera — each pixel's alpha is how far it moved
                from the field (`bg`: a frame before the cast), its colour the frame's own; `mask`
                boxes (damage numbers, the hero) are cleared. `box` crops the capture.
Each entry: src, mode, frames [start, end, step] (default all), box [x0, y0, x1, y1], bg (frame
index, diff), t0/t1 (diff ramp), mask [[x0, y0, x1, y1] ...], half (halve the size: the client draws
at about twice the old one's pixel size), anchor [fx, fy] (where the target's feet fall, as a share
of the cell; default the middle), ms (per frame), add (drawn added), max (cell's longest side, 360),
k (how large the game draws it; prepare_assets' default 0.75: today's client draws its pixels larger).
"_icons": {skill id: tooltip PNG} — each 9차 skill's own icon, cut from its tooltip in the 2662 post (the
40-pixel square at its top left), written OUT_DIR/icons/<skill id>.png (prepare_assets: skillicon/<id>.png).

Writes OUT_DIR/<id>.png (a strip of equal cells) and OUT_DIR/index.json in the yskill format
({id: {cell: [w, h], n, ms, add, anchor: [x, y]}}); prepare_assets.py makes them fx "o_<id>".
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageSequence


ICON_BOX = (11, 9, 51, 49)


def frames_of(path):
    im = Image.open(path)
    out, durs = [], []
    for f in ImageSequence.Iterator(im):
        out.append(f.convert("RGBA"))
        durs.append(f.info.get("duration", 80) or 80)
    return out, durs


def unwhite(f):
    a = np.asarray(f.convert("RGB")).astype(np.int32)
    al = 255 - a.min(axis=2)
    k = (255 - al)[..., None]
    safe = np.maximum(al, 1)[..., None]
    rgb = np.clip((a - k) * 255 // safe, 0, 255)
    al = np.where(al < 12, 0, al)
    return np.dstack([rgb, al]).astype(np.uint8)


def diffed(f, bg, t0, t1):
    a = np.asarray(f.convert("RGB")).astype(np.float32)
    b = np.asarray(bg.convert("RGB")).astype(np.float32)
    d = np.abs(a - b).max(axis=2)
    al = np.clip((d - t0) / max(1.0, t1 - t0), 0, 1) * 255
    return np.dstack([a, al]).astype(np.uint8)


def build(spec, src_dir, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    index = {}
    ipath = os.path.join(out_dir, "index.json")
    if os.path.isfile(ipath):
        index = {k: v for k, v in json.load(open(ipath, encoding="utf-8")).items() if k in spec}
    for sid, e in spec.items():
        if sid.startswith("_"):
            continue
        frames, durs = frames_of(os.path.join(src_dir, e["src"]))
        s, t, st = (e.get("frames") or [0, len(frames), 1])
        pick = list(range(s, min(t, len(frames)), st))
        box = e.get("box")
        mode = e.get("mode", "white")
        bg = frames[e.get("bg", 0)] if mode == "diff" else None
        arrs = []
        for i in pick:
            f = frames[i]
            if mode == "white":
                a = unwhite(f)
            elif mode == "cutin":
                # an 궁극's full-screen art: its black (the client's own darkening) taken out, so the
                # game's own dark shows through; the field in the middle is cleared by the masks
                a = np.asarray(f.convert("RGB")).astype(np.float32)
                al = np.clip((a.max(axis=2) - e.get("t0", 16)) / max(1.0, e.get("t1", 60) - e.get("t0", 16)), 0, 1) * 255
                a = np.dstack([a, al]).astype(np.uint8)
            else:
                a = diffed(f, bg, e.get("t0", 18), e.get("t1", 70))
            for m in e.get("mask", []):
                # a box cleared, or filled from the same frame's own pixels: "from" [dx, dy] (the
                # water beside a damage number), "rot" [cx, cy] (the vortex's far side, turned 180°).
                if isinstance(m, dict):
                    x0, y0, x1, y1 = m["box"]
                    if "from" in m:
                        dx, dy = m["from"]
                        a[y0:y1, x0:x1] = a[y0 + dy:y1 + dy, x0 + dx:x1 + dx]
                    elif "ellipse" in m:
                        # a soft hole where the hero stood (the hero stands there in the game too)
                        cx, cy, rx, ry, fw = m["ellipse"]
                        yy, xx = np.mgrid[0:a.shape[0], 0:a.shape[1]]
                        r = np.sqrt(((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2)
                        a[..., 3] = (a[..., 3] * np.clip((r - 1) / fw, 0, 1)).astype(np.uint8)
                    else:
                        a[y0:y1, x0:x1, 3] = 0
                else:
                    a[m[1]:m[3], m[0]:m[2], 3] = 0
            if box:
                a = a[box[1]:box[3], box[0]:box[2]]
            arrs.append(a)
        # crop to what ever shows, over all frames
        al = np.max(np.stack([a[..., 3] for a in arrs]), axis=0)
        ys, xs = np.nonzero(al > 8)
        if not len(xs):
            print("empty", sid)
            continue
        x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
        anc = e.get("anchor", [0.5, 0.5])
        full_h, full_w = arrs[0].shape[:2]
        ax, ay = anc[0] * full_w - x0, anc[1] * full_h - y0
        pics = [Image.fromarray(a[y0:y1, x0:x1]) for a in arrs]
        w, h = pics[0].size
        z = 0.5 if e.get("half") else 1.0
        z = min(z, e.get("max", 360) / max(w * z, h * z) * z)
        if z != 1.0:
            pics = [p.resize((max(1, round(w * z)), max(1, round(h * z))), Image.LANCZOS) for p in pics]
            ax, ay = ax * z, ay * z
        cw, ch = pics[0].size
        # at most 24 frames
        if len(pics) > 24:
            step = -(-len(pics) // 24)
            pics = pics[::step]
        sheet = Image.new("RGBA", (cw * len(pics), ch))
        for i, p in enumerate(pics):
            sheet.paste(p, (i * cw, 0))
        sheet.save(os.path.join(out_dir, sid + ".png"), optimize=True)
        ms = e.get("ms") or int(round(sum(durs[i] for i in pick) / len(pick) * len(pick) / len(pics)))
        index[sid] = {"cell": [cw, ch], "n": len(pics), "ms": ms, "add": bool(e.get("add")),
                      "anchor": [round(float(ax), 1), round(float(ay), 1)], "src": e["src"]}
        if e.get("reach"):
            index[sid]["reach"] = e["reach"]
        if e.get("k"):
            index[sid]["k"] = e["k"]
        print(sid, cw, ch, len(pics), ms)
    if spec.get("_icons"):
        os.makedirs(os.path.join(out_dir, "icons"), exist_ok=True)
        for k, tip in spec["_icons"].items():
            Image.open(os.path.join(src_dir, tip)).convert("RGBA").crop(ICON_BOX).save(os.path.join(out_dir, "icons", k + ".png"))
    json.dump(index, open(ipath, "w", encoding="utf-8"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    spec = json.load(open(sys.argv[1], encoding="utf-8"))
    build(spec, sys.argv[2], sys.argv[3])
