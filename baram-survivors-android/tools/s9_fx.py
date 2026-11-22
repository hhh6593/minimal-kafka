#!/usr/bin/env python3
"""The original 바람의나라's 9차 skill effects, as strips the build reads (GEAR_DIR/s9fx/).

    s9_fx.py SPEC_JSON SRC_DIR OUT_DIR [ID,ID…]   (only those ids: the others' sheets and index entries stay)

SPEC_JSON (tools/s9_fx.json): {id: {...}} for each effect, from the community blog's captures of the
official client (xoxd.tistory.com 1320: the effect sprites alone, drawn on white; 2662: the 9차 skills
in play, drawn over the field). SRC_DIR holds those GIFs as the spec names them. Nothing is drawn
here: each frame is the client's own pixels, taken off their backdrop:
  mode "white": the sprite on white — the white taken back out (alpha = 1 - darkest channel, colour
                restored), as prepare_assets.unwhite does for the modern captures;
  mode "diff":  the effect over the field in a still camera — each pixel's alpha is how far it moved
                from the field (`bg`: a frame before the cast), its colour the frame's own; `mask`
                boxes (damage numbers, the hero) are cleared. `box` crops the capture.
  mode "parts": the effect put together per frame from parts of the capture, for a scene whose camera scrolls
                (camshift.py gives each frame's shift), whose effect is cut by the capture's edge in one
                showing and whole in another, or has a damage number over it. "cell" [w, h] and "origin" [x, y]
                (where the effect's own point — the struck one's feet, the hero — falls in the cell); "cells":
                one list of parts per frame, the first on top, a later one seen only where those before are clear.
                A part: "f" (the capture's frame), "at" [x, y] (the effect's point in that frame), "clip"
                [x0, y0, x1, y1] (kept; relative to "at"), "clear" [[x0, y0, x1, y1] …] (taken out: the hero, a
                label), "shift" [{"box", "d": [dx, dy]}] (a box filled from the same frame's own keyed pixels
                (dx, dy) away: a blade's stripes under a damage number), "mirror" [{"box", "ax"}] (a box filled
                from the frame's own pixels on the other side of the effect's axis x = ax, for a symmetric burst).
                Each part's pixels are taken off the field by "key":
                  "cool" — a blue-white effect over a warm (brown, tan, red) floor: alpha by how far red stands
                           over blue ("warm" [lo, hi]: opaque up to lo, clear from hi), green bars out; with
                           "floor" [r, g, b] the floor's colour is taken back out of the half-clear pixels;
                  "fire" — mode "key"'s gate (a fiery effect over a red-and-tan floor);
                  "dark" — a dark red effect (흑룡검풍's wind) over a light floor in a still camera: alpha by how
                           far the pixel moved from the field ("bg": a clean frame; t0/t1), kept only where it
                           went darker and redder ("red": least red over blue);
                  "diff" — mode "diff" with the part's own "bg".
  mode "cinema" also takes "vignette" [rx, ry, soft] (shares of the half width/height): the art faded out towards an
                ellipse's edge, for a cinematic drawn smaller than the screen (no hard rectangle of art on the field).
Each entry: src, mode, frames [start, end, step] (default all), box [x0, y0, x1, y1], bg (frame
index, diff), t0/t1 (diff ramp), mask [[x0, y0, x1, y1] ...], half (halve the size: the client draws
at about twice the old one's pixel size), anchor [fx, fy] (where the target's feet fall, as a share
of the cell; default the middle), ms (per frame), add (drawn added), max (cell's longest side, 360),
k (how large the game draws it; prepare_assets' default 0.75: today's client draws its pixels larger),
scale (instead of k: game pixels a pixel of the capture, kept whatever "max" shrinks the cell by — 원작과 같은 크기:
0.62 = our hero's 47 pixels over the original hero's 76 in the 2662 captures).
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


def key_cool(a, e):
    """A blue-white effect over a warm floor: RGBA from an RGB float array."""
    r, g, bl = a[..., 0], a[..., 1], a[..., 2]
    lo, hi = e.get("warm", [10, 55])
    al = np.clip((hi - (r - bl)) / max(1.0, hi - lo), 0, 1)
    al = al * (1 - np.clip((g - np.maximum(r, bl) - 40) / 30, 0, 1))  # the green of a life bar
    if e.get("gray"):
        # a flat grey (a skull, a dead one's ghost, a button of the screen) is not the effect's: only blue-tinted or bright
        lo2, hi2 = e["gray"]
        cool = np.clip((bl - r - lo2) / 12, 0, 1)
        bright = np.clip((a.min(axis=2) - hi2) / 20, 0, 1)
        al = al * np.maximum(cool, bright)
    rgb = a
    if e.get("floor"):
        fl = np.array(e["floor"], dtype=np.float32)
        safe = np.maximum(al, 0.15)[..., None]
        rgb = np.clip((a - (1 - al[..., None]) * fl) / safe, 0, 255)
    return np.dstack([rgb, al * 255]).astype(np.uint8)


def key_fire(a, e):
    r, g, bl = a[..., 0], a[..., 1], a[..., 2]
    al = np.clip((r - 215) / 25, 0, 1) * np.clip((g - 110) / 40, 0, 1) * np.clip((150 - bl) / 50 + (g > 235), 0, 1)
    return np.dstack([a, al * 255]).astype(np.uint8)


def key_dark(a, b, e):
    """A dark red effect over a lighter floor (still camera): where the frame moved from the field, darker and red."""
    d = np.abs(a - b).max(axis=2)
    t0, t1 = e.get("t0", 18), e.get("t1", 60)
    al = np.clip((d - t0) / max(1.0, t1 - t0), 0, 1)
    darker = np.clip((b.sum(axis=2) - a.sum(axis=2)) / 30, 0, 1)
    rd = e.get("red", 8)
    red = np.clip((a[..., 0] - a[..., 2] - rd) / 12, 0, 1) * np.clip((a[..., 0] - a[..., 1] - rd) / 12, 0, 1)
    al = al * darker * red
    if e.get("stripes"):
        # the floor's own dark lines (as dark as the effect: nothing moved there) take the alpha of what lies
        # to their left and right ("stripes" [how dark the floor's line is, how wide a line at most])
        dark, wide = e["stripes"]
        line = b.max(axis=2) < dark
        pad = np.pad(al, ((0, 0), (wide, wide)), mode="edge")
        win = np.stack([pad[:, k:k + al.shape[1]] for k in range(2 * wide + 1)])
        closed = np.minimum(win[:wide + 1].max(axis=0), win[wide:].max(axis=0))
        al = np.where(line, np.maximum(al, closed), al)
    return np.dstack([a, al * 255]).astype(np.uint8)


def keyed(frames, i, e, part=None):
    part = part or {}
    a = np.asarray(frames[i].convert("RGB")).astype(np.float32)
    key = part.get("key", e.get("key", "cool"))
    if key == "cool":
        return key_cool(a, e)
    if key == "fire":
        return key_fire(a, e)
    bg = np.asarray(frames[part.get("bg", e.get("bg", 0))].convert("RGB")).astype(np.float32)
    if key == "dark":
        return key_dark(a, bg, e)
    return diffed(frames[i], frames[part.get("bg", e.get("bg", 0))], e.get("t0", 18), e.get("t1", 70))


def parts_cells(frames, e):
    """mode "parts": each frame's cell put together from parts of the capture (see the module's notes)."""
    cw, ch = e["cell"]
    ox, oy = e["origin"]
    cache = {}
    out = []
    for parts in e["cells"]:
        cell = np.zeros((ch, cw, 4), dtype=np.uint8)
        for part in parts:
            ck = (part["f"], part.get("key"), part.get("bg"))
            if ck not in cache:
                cache[ck] = keyed(frames, part["f"], e, part)
            a = cache[ck].copy()
            H, W = a.shape[:2]
            ax, ay = part["at"]
            box = lambda b: (max(0, ax + b[0]), max(0, ay + b[1]), min(W, ax + b[2]), min(H, ay + b[3]))
            # the fills, one after another, each reading what those before left (a number filled first, then that side
            # mirrored): "ops" [{"shift": …} | {"mirror": …} | {"clear": [box]} …], or the three lists in that order
            ops = part.get("ops") or ([{"shift": m} for m in part.get("shift", [])] + [{"mirror": m} for m in part.get("mirror", [])]
                                      + [{"clear": b} for b in part.get("clear", [])])
            for op in ops:
                if "mirror" in op:
                    m = op["mirror"]
                    x0, y0, x1, y1 = box(m["box"])
                    axis = ax + m["ax"]
                    src = a.copy()
                    for x in range(x0, x1):
                        sx = int(round(2 * axis - x))
                        if 0 <= sx < W:
                            a[y0:y1, x] = src[y0:y1, sx]
                        else:
                            a[y0:y1, x, 3] = 0
                elif "shift" in op:
                    m = op["shift"]
                    x0, y0, x1, y1 = box(m["box"])
                    dx, dy = m["d"]
                    if x1 > x0 and y1 > y0 and 0 <= y0 + dy and y1 + dy <= H and 0 <= x0 + dx and x1 + dx <= W:
                        a[y0:y1, x0:x1] = a[y0 + dy:y1 + dy, x0 + dx:x1 + dx].copy()
                else:
                    x0, y0, x1, y1 = box(op["clear"])
                    if x1 > x0 and y1 > y0:
                        a[y0:y1, x0:x1, 3] = 0
            clip = part.get("clip", [-ox, -oy, cw - ox, ch - oy])
            # the part's kept box, in the frame and in the cell
            fx0, fy0 = max(0, ax + max(clip[0], -ox)), max(0, ay + max(clip[1], -oy))
            fx1, fy1 = min(W, ax + min(clip[2], cw - ox)), min(H, ay + min(clip[3], ch - oy))
            if fx1 <= fx0 or fy1 <= fy0:
                continue
            src = a[fy0:fy1, fx0:fx1]
            cx0, cy0 = fx0 - ax + ox, fy0 - ay + oy
            dst = cell[cy0:cy0 + src.shape[0], cx0:cx0 + src.shape[1]]
            # under what is there already (the first part on top)
            da = dst[..., 3:4].astype(np.float32) / 255
            sa = src[..., 3:4].astype(np.float32) / 255
            oa = da + sa * (1 - da)
            rgb = (dst[..., :3] * da + src[..., :3] * sa * (1 - da)) / np.maximum(oa, 1e-3)
            dst[..., :3] = np.clip(rgb, 0, 255).astype(np.uint8)
            dst[..., 3:4] = np.clip(oa * 255, 0, 255).astype(np.uint8)
        if e.get("soft"):
            # the cell's own edge faded (a part cut by the capture's edge ends softly, not on a line)
            n = e["soft"]
            ramp = np.minimum(np.arange(cw), np.arange(cw)[::-1]).clip(0, n) / n
            rampy = np.minimum(np.arange(ch), np.arange(ch)[::-1]).clip(0, n) / n
            cell[..., 3] = (cell[..., 3] * np.minimum(ramp[None, :], rampy[:, None])).astype(np.uint8)
        out.append(cell)
    return out


def build(spec, src_dir, out_dir, only=None):
    os.makedirs(out_dir, exist_ok=True)
    index = {}
    ipath = os.path.join(out_dir, "index.json")
    if os.path.isfile(ipath):
        index = {k: v for k, v in json.load(open(ipath, encoding="utf-8")).items() if k in spec}
    for sid, e in spec.items():
        if sid.startswith("_") or (only and sid not in only):
            continue
        frames, durs = frames_of(os.path.join(src_dir, e["src"]))
        s, t, st = (e.get("frames") or [0, len(frames), 1])
        pick = list(range(s, min(t, len(frames)), st))
        box = e.get("box")
        mode = e.get("mode", "white")
        bg = frames[e.get("bg", 0)] if mode == "diff" else None
        arrs = []
        if mode == "parts":
            arrs = parts_cells(frames, e)
            pick = [c[0]["f"] for c in e["cells"]]
        for i in ([] if mode == "parts" else pick):
            f = frames[i]
            if mode == "white":
                a = unwhite(f)
            elif mode == "key":
                # a fiery effect over a red-and-tan floor (압도적진격's rings): its own colours keyed —
                # bright red with green in it and little blue (the floor's tan is darker, the carpet has no green)
                a = np.asarray(f.convert("RGB")).astype(np.float32)
                r, g, bl = a[..., 0], a[..., 1], a[..., 2]
                al = np.clip((r - 215) / 25, 0, 1) * np.clip((g - 110) / 40, 0, 1) * np.clip((150 - bl) / 50 + (g > 235), 0, 1)
                a = np.dstack([a, al * 255]).astype(np.uint8)
            elif mode == "cinema":
                # an 궁극's whole-screen cinematic (만검귀종's vortex and its sword graveyard): the frame kept whole,
                # its black (the client's darkening) see-through; the damage numbers (blue digits) and the hero in
                # the middle filled from the art round them (a normalised blur), not drawn over
                from PIL import ImageFilter
                a = np.asarray(f.convert("RGB")).astype(np.float32)
                if e.get("turn"):
                    # a vortex round the hero is the same turned half round: the part the damage numbers cover
                    # ("box") is the frame's own art from the other side of the hero ("at"), turned 180°
                    cx, cy = e["turn"]["at"]
                    x0, y0, x1, y1 = e["turn"]["box"]
                    a = a.copy()
                    a[y0:y1, x0:x1] = a[2 * cy - y1 + 1:2 * cy - y0 + 1, 2 * cx - x1 + 1:2 * cx - x0 + 1][::-1, ::-1]
                r, g, bl = a[..., 0], a[..., 1], a[..., 2]
                hole = ((bl > 170) & (r < 120) & (bl - r > 90)) | (a.min(axis=2) > e.get("white", 225))
                if e.get("bars"):  # the life bars' green and the DEAD labels' red over the field
                    hole |= ((g > 140) & (r < 110) & (bl < 110)) | ((r > 150) & (g < 40) & (bl < 40))
                hole = np.asarray(Image.fromarray((hole * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(e.get("grow", 15)))) > 0
                if e.get("hero"):
                    cx, cy, rx, ry = e["hero"]
                    yy, xx = np.mgrid[0:a.shape[0], 0:a.shape[1]]
                    hole |= ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2 <= 1
                keep = (~hole).astype(np.float32)
                num = np.dstack([a[..., c] * keep for c in range(3)])
                rad = e.get("blur", 14)
                bnum = np.dstack([np.asarray(Image.fromarray(num[..., c].astype(np.uint8)).filter(ImageFilter.GaussianBlur(rad))).astype(np.float32) for c in range(3)])
                bk = np.asarray(Image.fromarray((keep * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(rad))).astype(np.float32) / 255
                fill = bnum / np.maximum(bk, 0.05)[..., None]
                a = np.where(hole[..., None], np.clip(fill, 0, 255), a)
                al = np.clip((a.max(axis=2) - e.get("t0", 16)) / max(1.0, e.get("t1", 60) - e.get("t0", 16)), 0, 1) * 255
                # in the middle, where the field's monsters stood in the capture, only the art's vivid colour stays
                # (the vortex, the waves); the grey-brown of what was filled and the hit stars' white fade out
                if e.get("field"):
                    cx, cy, rx, ry = e["field"]
                    yy, xx = np.mgrid[0:a.shape[0], 0:a.shape[1]]
                    inside = np.clip(1.6 - np.sqrt(((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2), 0, 1)
                    sat = a.max(axis=2) - a.min(axis=2)
                    vivid = np.clip((sat - 120) / 60, 0, 1) * np.clip((a.max(axis=2) - 120) / 60, 0, 1)
                    al = al * (1 - inside + inside * vivid)
                if e.get("vignette"):
                    rx, ry, soft = e["vignette"]
                    bx = e.get("box") or [0, 0, a.shape[1], a.shape[0]]
                    cx, cy = (bx[0] + bx[2]) / 2, (bx[1] + bx[3]) / 2
                    yy, xx = np.mgrid[0:a.shape[0], 0:a.shape[1]]
                    rr = np.sqrt(((xx - cx) / ((bx[2] - bx[0]) / 2 * rx)) ** 2 + ((yy - cy) / ((bx[3] - bx[1]) / 2 * ry)) ** 2)
                    al = al * np.clip((1 - rr) / soft, 0, 1)
                a = np.dstack([a, al]).astype(np.uint8)
            elif mode == "cutin":
                # an 궁극's full-screen art: its black (the client's own darkening) taken out, so the
                # game's own dark shows through; the field in the middle is cleared by the masks
                a = np.asarray(f.convert("RGB")).astype(np.float32)
                al = np.clip((a.max(axis=2) - e.get("t0", 16)) / max(1.0, e.get("t1", 60) - e.get("t0", 16)), 0, 1) * 255
                a = np.dstack([a, al]).astype(np.uint8)
            else:
                a = diffed(f, bg, e.get("t0", 18), e.get("t1", 70))
                if e.get("gold"):
                    # only the bright gold of the art (장승영역's glyphs and 태극), not the flat floor it lies on
                    c = a[..., :3].astype(np.float32)
                    lo, hi = e["gold"]
                    k = np.clip((c[..., 0] - lo) / 30, 0, 1) * np.clip((c[..., 1] - lo * 0.7) / 30, 0, 1) * np.clip((c[..., 0] - c[..., 2] - 80) / 40, 0, 1)
                    k *= np.clip((c.max(axis=2) - hi) / 25, 0, 1) if hi else 1
                    a[..., 3] = (a[..., 3] * k).astype(np.uint8)
                if e.get("digits"):
                    # the damage numbers (blue digits, their white-orange stars) cleared out of the capture
                    from PIL import ImageFilter
                    c = a[..., :3].astype(np.float32)
                    hole = ((c[..., 2] > 170) & (c[..., 0] < 120) & (c[..., 2] - c[..., 0] > 90))
                    hole = np.asarray(Image.fromarray((hole * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(e.get("grow", 13)))) > 0
                    a[..., 3] = np.where(hole, 0, a[..., 3])
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
        if mode == "parts" and not e.get("anchor"):
            anc = [e["origin"][0] / full_w, e["origin"][1] / full_h]
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
        if e.get("scale"):
            # game pixels a pixel of the capture, whatever the cell was shrunk by to fit (원작과 같은 크기: the
            # capture's pixels × our hero's height / the original hero's)
            index[sid]["k"] = round(e["scale"] / z, 4)
        if e.get("cap"):
            index[sid]["cap"] = e["cap"]
        print(sid, cw, ch, len(pics), ms)
    if spec.get("_icons"):
        os.makedirs(os.path.join(out_dir, "icons"), exist_ok=True)
        for k, tip in spec["_icons"].items():
            Image.open(os.path.join(src_dir, tip)).convert("RGBA").crop(ICON_BOX).save(os.path.join(out_dir, "icons", k + ".png"))
    json.dump(index, open(ipath, "w", encoding="utf-8"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    spec = json.load(open(sys.argv[1], encoding="utf-8"))
    build(spec, sys.argv[2], sys.argv[3], set(sys.argv[4].split(",")) if len(sys.argv) > 4 else None)
