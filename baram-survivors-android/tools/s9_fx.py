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
                  "blue" — a blue-violet effect over a grey or brown floor: alpha by how far blue stands over red and
                           green ("bt" [lo, hi]);
                  "fire" — mode "key"'s gate (a fiery effect over a red-and-tan floor);
                  "dark" — a dark red effect (흑룡검풍's wind) over a light floor in a still camera: alpha by how
                           far the pixel moved from the field ("bg": a clean frame; t0/t1), kept only where it
                           went darker and redder ("red": least red over blue);
                  "diff" — mode "diff" with the part's own "bg";
                  "teal" — a teal-green wind (회선격풍) over a sandy floor: green over red, not a number's blue ("gt"
                           [lo, hi]; "white": its white heart kept where the green is near).
                  "gold" — a golden light over a grey floor: red and green over blue ("gb" [lo, hi]; "white" as teal).
                  "bluediff" — a blue effect over a still field: moved from "bg" and blue over red ("bt").
                A part's "unnum" [[x0, y0, x1, y1] …] (relative to "at"): the damage numbers there painted over from
                the frame round them before keying.
  mode "cinema" also takes "stars" (the hit stars' orange taken out with the numbers) and "vignette" [rx, ry, soft] (shares of the half width/height): the art faded out towards an
                ellipse's edge, for a cinematic drawn smaller than the screen (no hard rectangle of art on the field).
Each entry: src, mode, frames [start, end, step] (default all; "skip" [frame …] left out), box [x0, y0, x1, y1], bg (frame
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


def unnum(a, boxes, at):
    """The damage numbers (blue digits, their white and orange stars) in the given boxes (relative to `at`) painted
    over from the frame round them (a normalised blur of what is not a number), before keying."""
    from PIL import ImageFilter
    H, W = a.shape[:2]
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    num = ((b > 140) & (b - r > 70) & (b - g > 25)) | (a.min(axis=2) > 205) | ((r > 200) & (g > 90) & (g < 215) & (b < 140) & (r - b > 90)) \
        | ((b - r > 25) & (b - g > 10) & (a.max(axis=2) < 130))  # (the digits' dark blue rims)
    inb = np.zeros((H, W), bool)
    for bx in boxes:
        x0, y0, x1, y1 = max(0, at[0] + bx[0]), max(0, at[1] + bx[1]), min(W, at[0] + bx[2]), min(H, at[1] + bx[3])
        inb[y0:y1, x0:x1] = True
    hole = num & inb
    hole = np.asarray(Image.fromarray((hole * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(7))) > 0
    hole &= inb
    keep = (~hole).astype(np.float32)
    blur = lambda x: np.asarray(Image.fromarray(np.clip(x, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(16))).astype(np.float32)
    bk = blur(keep * 255) / 255
    out = a.copy()
    for c in range(3):
        f = blur(a[..., c] * keep) / np.maximum(bk, 0.05)
        out[..., c] = np.where(hole, f, a[..., c])
    return out


def keyed(frames, i, e, part=None):
    part = part or {}
    a = np.asarray(frames[i].convert("RGB")).astype(np.float32)
    if part.get("unnum"):
        a = unnum(a, part["unnum"], part["at"])
    key = part.get("key", e.get("key", "cool"))
    if key == "teal":
        # a teal-green wind (회선격풍) over a sandy floor and a red grid: green over red, and not the blue of a number
        r, g, b = a[..., 0], a[..., 1], a[..., 2]
        lo, hi = part.get("gt", e.get("gt", [30, 90]))
        al = np.clip((g - r - lo) / max(1.0, hi - lo), 0, 1) * np.clip((g - b + 40) / 30, 0, 1) * np.clip((b - r - 10) / 30, 0, 1)
        # its white heart (a flash inside the wind): kept where the green round it is
        wt = e.get("white")
        if wt:
            from PIL import ImageFilter
            near = np.asarray(Image.fromarray((al * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(9))).astype(np.float32) / 255
            al = np.maximum(al, np.clip((a.min(axis=2) - wt) / 25, 0, 1) * near)
        return np.dstack([a, al * 255]).astype(np.uint8)
    if key == "cool":
        return key_cool(a, e)
    if key == "fire":
        return key_fire(a, e)
    if key == "blue":
        # a blue-violet effect (묵혈독's flame) over a grey or brown floor: alpha by how far blue stands over red and green
        t0, t1 = part.get("bt", e.get("bt", [30, 70]))
        al = np.clip((a[..., 2] - np.maximum(a[..., 0], a[..., 1]) - t0) / max(1.0, t1 - t0), 0, 1)
        return np.dstack([a, al * 255]).astype(np.uint8)
    if key == "gold":
        # a golden light (천선의영역's seal, 천신의기운's rings) over a grey floor: alpha by how far red and green stand
        # over blue ("gb" [lo, hi]); its white-hot heart kept where gold is near ("white": the floor of the min channel)
        r, g, b = a[..., 0], a[..., 1], a[..., 2]
        lo, hi = part.get("gb", e.get("gb", [25, 80]))
        al = np.clip(((r + g) / 2 - b - lo) / max(1.0, hi - lo), 0, 1) * np.clip((g - b + 10) / 30, 0, 1) * np.clip((r - 0.75 * g) / 25, 0, 1) * np.clip((g - part.get("gmin", e.get("gmin", 0))) / 40, 0, 1)
        if e.get("noorange"):
            al = al * np.clip((g - 0.72 * r) / 18, 0, 1)  # (the hit stars' orange rims out: gold keeps green near red)
        wt = e.get("white")
        if wt:
            from PIL import ImageFilter
            near = np.asarray(Image.fromarray((al * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(11))).astype(np.float32) / 255
            al = np.maximum(al, np.clip((a.min(axis=2) - wt) / 25, 0, 1) * near)
        return np.dstack([a, al * 255]).astype(np.uint8)
    bg = np.asarray(frames[part.get("bg", e.get("bg", 0))].convert("RGB")).astype(np.float32)
    for fi, x0, y0, x1, y1 in part.get("bgpatch", e.get("bgpatch", [])):
        # (the clean field put together: a box of it from another frame of the same still camera, where someone stood
        # in "bg" — 순보선풍's caster before the leap)
        bg = bg.copy()
        bg[y0:y1, x0:x1] = np.asarray(frames[fi].convert("RGB")).astype(np.float32)[y0:y1, x0:x1]
    if key == "sub":
        # a glow over a still field (천선의영역's seal, 천신의기운's rings, 폭렬천뢰탄's sphere): the light it adds, what is
        # brighter than the clean field ("bg") — drawn added (the entry's "add": true). The bodies standing still drop out
        # whole (no silhouettes, no faces); "noblue" leaves the damage numbers' blue out, "noorange" the hit stars' rims.
        d = np.clip(a - bg, 0, 255)
        if e.get("noblue"):
            d[(a[..., 2] > (a[..., 0] + a[..., 1]) / 2 + 25)] = 0
        if e.get("noorange"):
            d[(a[..., 1] < 0.72 * a[..., 0]) & (a[..., 0] > 150)] = 0
        spin = np.zeros(d.shape[:2], bool)
        if e.get("nogreen"):
            # (only the bars' green and their dark frame — for a blue effect, whose blue "nobars" would take for numbers)
            from PIL import ImageFilter
            gr = (a[..., 1] > a[..., 0] + 50) & (a[..., 1] > a[..., 2] + 50)
            spin |= np.asarray(Image.fromarray((gr * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5))) > 0
        for x0, y0, x1, y1 in e.get("zero", []):
            spin[y0:y1, x0:x1] = True  # (a dummy flashing white where it is struck: a still place in the frame)
        if spin.any():
            # what lay there is not ours: the ball's own light from the same distance a turn on round its middle ("at")
            ax_, ay_ = part["at"]
            yy_, xx_ = np.mgrid[0:d.shape[0], 0:d.shape[1]].astype(np.float32)
            dx_, dy_ = xx_ - ax_, yy_ - ay_
            todo = spin.copy()
            H_, W_ = spin.shape
            for ang in (40, -40, 70, -70, 100, -100, 140, -140, 180):
                if not todo.any():
                    break
                c_, s_ = np.cos(np.radians(ang)), np.sin(np.radians(ang))
                sx = np.rint(ax_ + dx_ * c_ - dy_ * s_).astype(int).clip(0, W_ - 1)
                sy = np.rint(ay_ + dx_ * s_ + dy_ * c_).astype(int).clip(0, H_ - 1)
                ok = todo & ~spin[sy, sx]
                d[ok] = d[sy[ok], sx[ok]]
                todo &= ~ok
            d[todo] = 0
        if e.get("radial"):
            # (its light gone round it: a ball of light, not a lit box)
            r0, r1 = e["radial"]
            ax_, ay_ = part["at"]
            yy_, xx_ = np.mgrid[0:d.shape[0], 0:d.shape[1]]
            d = (d * np.clip((r1 - np.hypot(xx_ - ax_, yy_ - ay_)) / (r1 - r0), 0, 1)[..., None]).astype(d.dtype)
        lo = part.get("floor", e.get("floor", 14))
        d[d.max(axis=2) < lo] = 0
        # The bodies standing in front of it (the dummies, the hero, their bars) hide its light: where it lies under one
        # ("fill": [[cx, cy, rx, ry] …] ellipses in the frame, or "fillzone" [cx, cy, rx, ry]: every unlit pixel inside that
        # ellipse), the light round it flows in (a few hundred steps of averaging the neighbours): no hole, no silhouette.
        h, w = d.shape[:2]
        yy, xx = np.mgrid[0:h, 0:w]
        hole = np.zeros((h, w), bool)
        fz = part.get("fillzone", e.get("fillzone"))
        if fz:
            cx, cy, rx, ry = fz
            inz = ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2 <= 1
            hole |= inz & (d.max(axis=2) < part.get("fzlo", e.get("fzlo", lo)))
        for cx, cy, rx, ry in part.get("fill", e.get("fill", [])):
            hole |= ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2 <= 1
        # (the bars and numbers that came with the cast: their green, blue and white text)
        g_ = a[..., 1]; r_ = a[..., 0]; b_ = a[..., 2]
        bars = ((g_ > r_ + 50) & (g_ > b_ + 50)) | ((b_ > r_ + 60) & (b_ > g_ + 30))
        if e.get("nobars"):
            from PIL import ImageFilter
            bars = np.asarray(Image.fromarray((bars * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3))) > 0
            hole |= bars
        if hole.any():
            if e.get("fillmode") == "nearest":
                # (the neighbours' own dots carried inward ring by ring: the art's colours continued, no blur — 사용자: 깨진
                # 곳은 같은 색 도트로 보수)
                known = ~hole
                out = d.copy()
                for _ in range(200):
                    if known.all():
                        break
                    kp = np.pad(known, 1)
                    op = np.pad(out, ((1, 1), (1, 1), (0, 0)))
                    cnt = np.zeros(known.shape, np.float32)
                    acc = np.zeros(out.shape, np.float32)
                    for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (1, 1), (-1, 1), (1, -1)):
                        k = kp[1 + dy:1 + dy + known.shape[0], 1 + dx:1 + dx + known.shape[1]]
                        acc += op[1 + dy:1 + dy + known.shape[0], 1 + dx:1 + dx + known.shape[1]] * k[..., None]
                        cnt += k
                    front = (~known) & (cnt > 0)
                    if not front.any():
                        break
                    # the brightest-leaning neighbour mix, quantized back to the art's own dots
                    out[front] = np.round(acc[front] / cnt[front][:, None] / 8) * 8
                    known = known | front
                d = out
                hole = np.zeros_like(hole)
            # (normalized convolution at growing radii: each hole pixel the weighted mean of the known light round it)
            from PIL import ImageFilter
            d[hole] = 0
            known = (~hole).astype(np.float32)
            out = d.copy()
            todo = hole.copy()
            for rad in (6, 14, 30, 60):
                if not todo.any():
                    break
                m = np.asarray(Image.fromarray((known * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(rad))).astype(np.float32) / 255
                ch = [np.asarray(Image.fromarray(np.clip(d[..., c] * known, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(rad))).astype(np.float32) for c in range(3)]
                ok = todo & (m > 0.15)
                for c in range(3):
                    out[..., c][ok] = (ch[c] / np.maximum(m, 1e-3))[ok]
                todo &= ~ok
            d = out
        sec = part.get("sector", e.get("sector"))
        if sec:
            # a ring round the hero, bodies standing all round it: one clean slice of it (angles a0..a1, in the ellipse
            # squashed by "ys" vertically) carried round the circle — the original's own dots, turned copies, no fill
            cx, cy, ys, a0, a1 = sec[:5]
            yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
            dx, dy = xx - cx, (yy - cy) * ys
            r = np.hypot(dx, dy)
            ang = np.degrees(np.arctan2(dy, dx)) % 360
            span = a1 - a0
            src = np.radians(a0 + ((ang - a0) % span))
            sx = np.clip(np.round(cx + r * np.cos(src)).astype(int), 0, w - 1)
            sy = np.clip(np.round(cy + r * np.sin(src) / ys).astype(int), 0, h - 1)
            d = d[sy, sx]
            if len(sec) > 5:
                d[r < sec[5]] = 0  # (the hero's own spot: our hero stands there)
        return np.dstack([d, np.where(d.max(axis=2) > 0, 255, 0)]).astype(np.uint8)
    if key == "golddiff":
        # "gold", and only what moved from the clean field ("bg"): the bodies standing in a still camera (the hero, the
        # dummies, their bars) stay out though their colours are warm
        g0 = keyed(frames, i, {**part, "key": "gold"})
        d = np.abs(a - bg).max(axis=2)
        t0, t1 = part.get("t0", e.get("t0", 20)), part.get("t1", e.get("t1", 60))
        m = np.clip((d - t0) / max(1.0, t1 - t0), 0, 1)
        g0 = g0.astype(np.float32)
        g0[..., 3] *= m
        return g0.astype(np.uint8)
    if key == "bluediff":
        # a blue effect (서리파편's ice) over a still field: what moved from the clean field ("bg"), and only where it is
        # blue ("bt" [lo, hi] of blue over red) — the dummies, their stakes and bars stay out
        d = np.abs(a - bg).max(axis=2)
        t0, t1 = part.get("t0", e.get("t0", 18)), part.get("t1", e.get("t1", 60))
        lo, hi = part.get("bt", e.get("bt", [5, 35]))
        al = np.clip((d - t0) / max(1.0, t1 - t0), 0, 1) * np.clip((a[..., 2] - a[..., 0] - lo) / max(1.0, hi - lo), 0, 1)
        wt = e.get("white")
        if wt:
            # its white-hot heart (폭렬천뢰탄's core): kept where it moved and blue is near
            from PIL import ImageFilter
            near = np.asarray(Image.fromarray((al * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(15))).astype(np.float32) / 255
            al = np.maximum(al, np.clip((a.min(axis=2) - wt) / 25, 0, 1) * near * np.clip((d - t0) / max(1.0, t1 - t0), 0, 1))
        return np.dstack([a, al * 255]).astype(np.uint8)
    if key == "unmix":
        # a see-through fog over a clean field (환영안개's purple over the carpet): how opaque it is from how far each pixel
        # moved from the clean frame ("bg"; "k" the move that counts as solid), its own colour taken back out of the mix
        # (O = a·F + (1−a)·B). Whoever stands still under it is in both and drops out — no silhouette, no carpet pattern
        k = part.get("k", e.get("k", 110))
        lo = part.get("floor", e.get("floor", 12))
        if e.get("align"):
            # (the client shakes the screen on the cast: the clean frame moved the few pixels that fit it best)
            best = None
            for sy in range(-4, 5):
                for sx in range(-4, 5):
                    sh = np.roll(np.roll(bg, sy, 0), sx, 1)
                    sc = np.median(np.abs(a - sh).max(axis=2)[8:-8:3, 8:-8:3])
                    if best is None or sc < best[0]:
                        best = (sc, sh)
            bg = best[1]
        D = a - bg
        m = np.abs(D).max(axis=2)
        al = np.clip((m - lo) / max(1.0, k - lo), 0, 1)
        F = np.clip(bg + D / np.maximum(al, 1e-3)[..., None], 0, 255)
        if part.get("rot", e.get("rot")) or part.get("shiftfill", e.get("shiftfill")):
            # a whirl turning round its middle (순보선풍's gale, 천신의권역's vortex) over bodies, numbers, bars and a caster
            # standing in it: what lies over it ("badbox" boxes, "fill" ellipses [cx, cy, rx, ry] and "holeexpr" colours,
            # all in the frame) is taken from the whirl's own pixels at the same place a turn on round its middle — "rot"
            # [ys, r_min] (the ellipse squashed by ys vertically; the middle is the part's "at") — the nearest turn whose
            # pixel is clean; inside r_min (every turn of it covered) from a little farther out. Its own dots, no blur.
            from scipy import ndimage
            ys_, rmin = (part.get("rot", e.get("rot")) or [1, 0])[:2]
            cx, cy = part["at"]
            H_, W_ = al.shape
            yy_, xx_ = np.mgrid[0:H_, 0:W_].astype(np.float32)
            hole = np.zeros((H_, W_), bool)
            for x0, y0, x1, y1 in part.get("badbox", e.get("badbox", [])):
                hole[max(0, y0):y1, max(0, x0):x1] = True
            for ex_, ey_, rx_, ry_ in part.get("fill", e.get("fill", [])):
                hole |= ((xx_ - ex_) / rx_) ** 2 + ((yy_ - ey_) / ry_) ** 2 <= 1
            hx = part.get("holeexpr", e.get("holeexpr"))
            if hx:
                r_, g_, b_ = a[..., 0], a[..., 1], a[..., 2]
                env = {"r": r_, "g": g_, "b": b_, "d": m, "mn": a.min(axis=2), "mx": a.max(axis=2), "np": np, "x": xx_, "y": yy_}
                hm = np.zeros(al.shape, bool)
                for ex in hx:
                    hm |= eval(ex, {}, env)
                for ex, px in part.get("holenear", e.get("holenear", [])):
                    hm |= eval(ex, {}, env) & ndimage.binary_dilation(hm, iterations=px)
                hole |= ndimage.binary_fill_holes(ndimage.binary_dilation(hm, iterations=part.get("holegrow", e.get("holegrow", 3))))
            sf = part.get("shiftfill", e.get("shiftfill"))
            if sf:
                # (a sheet of water over the field — 해일강타's wave — whose caustics run on to every side: a covered pixel
                # from the same frame "shiftfill" [[dx, dy] …] away, the first that is clean; its own dots, no blur)
                todo = hole.copy()
                src_al, src_F = al.copy(), F.copy()
                # (each covered patch first moved over whole from one place beside it — a copy, not a smear — the
                # nearest of the shifts, or of their multiples, that finds it all clean)
                lab_, nl_ = ndimage.label(hole)
                cands = sorted({(sdx * k, sdy * k) for sdx, sdy in sf for k in (1, 2, 3, 4, 6, 8)}, key=lambda v: abs(v[0]) + abs(v[1]))
                if part.get("shiftexact", e.get("shiftexact")):
                    # (the field's own period: bodies standing in a grid — the dummies two tiles apart — a patch from the
                    # same place in the gap beside it, in the order given)
                    cands = [tuple(v) for v in sf]
                need_ = part.get("shiftmin", e.get("shiftmin", 0.98))
                for li, sl in enumerate(ndimage.find_objects(lab_)):
                    comp = np.zeros_like(hole)
                    comp[sl] = lab_[sl] == li + 1
                    n_ = comp.sum()
                    for sdx, sdy in cands:
                        sx = (xx_ + sdx).astype(int)
                        sy = (yy_ + sdy).astype(int)
                        inside = (sx >= 0) & (sx < W_) & (sy >= 0) & (sy < H_)
                        sxc, syc = sx.clip(0, W_ - 1), sy.clip(0, H_ - 1)
                        ok = comp & inside & ~hole[syc, sxc]
                        if ok.sum() >= need_ * n_:
                            al[ok] = src_al[syc[ok], sxc[ok]]
                            F[ok] = src_F[syc[ok], sxc[ok]]
                            todo &= ~ok
                            break
                for _ in range(1 if part.get("shiftexact", e.get("shiftexact")) else 3):
                    for sdx, sdy in (cands if part.get("shiftexact", e.get("shiftexact")) else sf):
                        if not todo.any():
                            break
                        sx = (xx_ + sdx).astype(int)
                        sy = (yy_ + sdy).astype(int)
                        inside = (sx >= 0) & (sx < W_) & (sy >= 0) & (sy < H_)
                        sxc, syc = sx.clip(0, W_ - 1), sy.clip(0, H_ - 1)
                        ok = todo & inside & ~todo[syc, sxc]
                        al[ok] = src_al[syc[ok], sxc[ok]]
                        F[ok] = src_F[syc[ok], sxc[ok]]
                        src_al[ok], src_F[ok] = al[ok], F[ok]
                        todo &= ~ok
                al[todo] = 0
                F[al <= 0] = 0
                return np.dstack([F, al * 255]).astype(np.uint8)
            dx_, dy_ = xx_ - cx, (yy_ - cy) * ys_
            rr = np.hypot(dx_, dy_)
            ang = np.arctan2(dy_, dx_)
            rsec = part.get("rotsector", e.get("rotsector"))
            if rsec:
                # (or the whole of it from one clean slice, angles a0..a1, carried round: its rings go on, no patchwork;
                # "rotsector" [a0, a1] in degrees, 0 to the right, 90 down)
                a0, a1 = rsec[:2]
                bl = rsec[2] if len(rsec) > 2 else 0
                span = a1 - a0
                dd = np.degrees(ang) % 360
                o = (dd - a0) % span

                def take(deg):
                    # (a covered pixel of the slice — a spark's ray — from the same ring a few degrees on in it)
                    oa, oF, need = np.zeros_like(al), np.zeros_like(F), np.ones_like(hole)
                    for sh in (0, 5, -5, 10, -10, 15, -15):
                        t = np.radians(np.clip(deg + sh, a0, a1 + bl))
                        sx = np.clip(np.rint(cx + rr * np.cos(t)).astype(int), 0, W_ - 1)
                        sy = np.clip(np.rint(cy + rr * np.sin(t) / ys_).astype(int), 0, H_ - 1)
                        ok = need & ~hole[sy, sx]
                        oa[ok] = al[sy[ok], sx[ok]]
                        oF[ok] = F[sy[ok], sx[ok]]
                        need &= ~ok
                    return oa, oF
                al1, F1 = take(a0 + o)
                if bl:
                    # (where one copy meets the next, the next fades in over `bl` degrees from the slice's own
                    # continuation past a1 — the slice is taken that much clean beyond it — no step at the seam)
                    al2, F2 = take(a1 + o)
                    w = np.clip(o / bl, 0, 1)
                    A = al1 * w + al2 * (1 - w)
                    F1 = (F1 * (al1 * w)[..., None] + F2 * (al2 * (1 - w))[..., None]) / np.maximum(A, 1e-3)[..., None]
                    al1 = A
                al, F = al1, F1
                hole = np.zeros_like(hole)
            todo = hole.copy()
            src_al, src_F = al.copy(), F.copy()
            DEGS = part.get("rotdeg", e.get("rotdeg", (35, -35, 70, -70, 105, -105, 140, -140, 180)))

            def turned(deg, rs):
                t = ang + np.radians(deg)
                sx = np.rint(cx + rs * np.cos(t)).astype(int)
                sy = np.rint(cy + rs * np.sin(t) / ys_).astype(int)
                inside = (sx >= 0) & (sx < W_) & (sy >= 0) & (sy < H_)
                return sx.clip(0, W_ - 1), sy.clip(0, H_ - 1), inside
            # (each covered patch first taken whole from one turn — no seams of a patchwork — where nearly all of it is clean)
            lab_, nl_ = ndimage.label(hole)
            for li, sl in enumerate(ndimage.find_objects(lab_)):
                comp = np.zeros_like(hole)
                comp[sl] = lab_[sl] == li + 1
                for deg in DEGS:
                    sx, sy, inside = turned(deg, rr)
                    ok = comp & inside & ~hole[sy, sx]
                    if ok.sum() >= 0.97 * comp.sum():
                        al[ok] = src_al[sy[ok], sx[ok]]
                        F[ok] = src_F[sy[ok], sx[ok]]
                        todo &= ~ok
                        break
            for grow in (1.0, 1.15, 1.3, 1.5, 1.75, 2.0):
                for deg in DEGS:
                    if not todo.any():
                        break
                    rs = np.where(rr < rmin * 1.6, np.maximum(rr, 2.0) * grow, rr) if grow > 1 else rr
                    t = ang + np.radians(deg)
                    sx = np.rint(cx + rs * np.cos(t)).astype(int)
                    sy = np.rint(cy + rs * np.sin(t) / ys_).astype(int)
                    inside = (sx >= 0) & (sx < W_) & (sy >= 0) & (sy < H_)
                    sxc, syc = sx.clip(0, W_ - 1), sy.clip(0, H_ - 1)
                    ok = todo & inside & ~hole[syc, sxc]
                    al[ok] = src_al[syc[ok], sxc[ok]]
                    F[ok] = src_F[syc[ok], sxc[ok]]
                    todo &= ~ok
            al[todo] = 0
            rd = part.get("radial", e.get("radial"))
            if rd:
                # (its own round edge: what lies past it in the frame is not the whirl's)
                al = al * np.clip((rd[1] - rr) / max(1.0, rd[1] - rd[0]), 0, 1)
            eye = part.get("eye", e.get("eye"))
            if eye:
                # (its eye: what stood and struck in its middle — the caster, its bars, the numbers, the hit sparks — is
                # not the whirl's; the whirl's own see-through middle is let fade to nothing there, no fill)
                al = al * np.clip((rr - eye[0]) / max(1.0, eye[1] - eye[0]), 0, 1)
            F[al <= 0] = 0
            return np.dstack([F, al * 255]).astype(np.uint8)
        sm = part.get("smooth", e.get("smooth"))
        if sm:
            al_raw, F_raw = al.copy(), F.copy()
            # the fog's colour changes slowly: that colour field (each pixel the mean of its neighbours' colours, weighted
            # by how solid they are), and how much of it lies over the floor by projecting the move onto it — the
            # carpet's pattern stays in the floor, out of the fog
            from scipy import ndimage
            hole = np.zeros(al.shape, bool)
            for x0, y0, x1, y1 in part.get("badbox", e.get("badbox", [])):
                hole[y0:y1, x0:x1] = True  # (a body tinted by it, a bar changing: the fog round it carried in)
            hx = part.get("holeexpr", e.get("holeexpr"))
            if hx:
                # (what passes over it by colour — the damage numbers' blue digits, the hit stars' orange rims and the
                # white inside them — grown by "holegrow" and filled the same way)
                r_, g_, b_ = a[..., 0], a[..., 1], a[..., 2]
                yy_, xx_ = np.mgrid[0:al.shape[0], 0:al.shape[1]]
                env = {"r": r_, "g": g_, "b": b_, "d": m, "mn": a.min(axis=2), "mx": a.max(axis=2), "np": np, "x": xx_, "y": yy_}
                hm = np.zeros(al.shape, bool)
                for ex in hx:
                    hm |= eval(ex, {}, env)
                for ex, px in part.get("holenear", e.get("holenear", [])):
                    # (the white faces of the digits and the stars' hearts: white only beside what was found)
                    hm |= eval(ex, {}, env) & ndimage.binary_dilation(hm, iterations=px)
                hm = ndimage.binary_fill_holes(ndimage.binary_dilation(hm, iterations=part.get("holegrow", e.get("holegrow", 3))))
                hole |= hm
            sb = part.get("starbox", e.get("starbox"))
            if sb:
                # (a hit star found by its orange rim, and the box from it over the number written beside it:
                # [expression, [left, top, right, bottom] margins])
                r_, g_, b_ = a[..., 0], a[..., 1], a[..., 2]
                env = {"r": r_, "g": g_, "b": b_, "d": m, "mn": a.min(axis=2), "mx": a.max(axis=2), "np": np}
                st = ndimage.binary_opening(eval(sb[0], {}, env), iterations=1)
                lab, n = ndimage.label(ndimage.binary_dilation(st, iterations=4))
                L, T, R, B = sb[1]
                for sl in ndimage.find_objects(lab):
                    if (sl[0].stop - sl[0].start) * (sl[1].stop - sl[1].start) < 60:
                        continue
                    hole[max(0, sl[0].start - T):sl[0].stop + B, max(0, sl[1].start - L):sl[1].stop + R] = True
            w = np.where(hole, 0, al ** 2)
            num = np.stack([ndimage.gaussian_filter(F[..., c] * w, sm) for c in range(3)], -1)
            den = ndimage.gaussian_filter(w, sm)[..., None]
            Fs = num / np.maximum(den, 1e-4)
            # (deep in a box, or far from any fog, the near neighbours are none: the colour from farther round)
            big = sm * 6
            numb = np.stack([ndimage.gaussian_filter(F[..., c] * w, big) for c in range(3)], -1)
            denb = ndimage.gaussian_filter(w, big)[..., None]
            Fs = np.where(den > 0.03, Fs, numb / np.maximum(denb, 1e-6))
            if hole.any():
                # inside a box the colour grown in from its edge, ring by ring (the gradient round it carried on)
                known = ~hole
                Fh = Fs.copy()
                for rad in (2, 4, 8, 16, 32, 64, 128):
                    kf = known.astype(np.float32)
                    num2 = np.stack([ndimage.gaussian_filter(Fh[..., c] * kf, rad) for c in range(3)], -1)
                    den2 = ndimage.gaussian_filter(kf, rad)
                    new_ = ~known & (den2 > 0.05)
                    Fh[new_] = num2[new_] / den2[new_][:, None]
                    known |= new_
                Fs = np.where(hole[..., None], Fh, Fs)
            V = Fs - bg
            vv = (V ** 2).sum(-1)
            ap = np.clip((D * V).sum(-1) / np.maximum(vv, 1.0), 0, 1)
            ap = np.where(vv > 900, ap, al)  # (where the fog is the floor's own colour the projection says nothing)
            ap[m < lo] = 0
            if hole.any():
                # (its opacity grown in from the edge ring by ring, as the colour is)
                known = ~hole
                fill = ap.copy()
                for rad in (2, 4, 8, 16, 32, 64, 128):
                    kf = known.astype(np.float32)
                    num2 = ndimage.gaussian_filter(fill * kf, rad)
                    den2 = ndimage.gaussian_filter(kf, rad)
                    new_ = ~known & (den2 > 0.05)
                    fill[new_] = num2[new_] / den2[new_]
                    known |= new_
                # its grain (the fine dither of the fog) from beside the box, so the patch is not smoother than round it
                grain = ap - ndimage.gaussian_filter(ap, 2)
                for x0, y0, x1, y1 in (part.get("badbox", e.get("badbox", [])) if e.get("grain", True) else []):
                    wdt = x1 - x0
                    sx0 = x0 - wdt if x0 - wdt >= 0 else x1
                    g = grain[y0:y1, sx0:sx0 + wdt]
                    if g.shape == fill[y0:y1, x0:x1].shape:
                        fill[y0:y1, x0:x1] += g
                # and its edge blended over 10 px into what lies round it (no straight line)
                dist = ndimage.distance_transform_edt(hole)
                # ("edgeblend" 0: a hole found by its colour is all contaminant, to its very edge)
                t = np.clip(dist / max(1e-3, part.get("edgeblend", e.get("edgeblend", 10))), 0, 1)
                ap = np.clip(np.where(hole, fill * t + ap * (1 - t), ap), 0, 1)
            al, F = ap, np.clip(Fs, 0, 255)
            if part.get("keepraw", e.get("keepraw")):
                # (the smoothed colour field only inside the covered places: elsewhere the frame's own unmixed pixels —
                # the water's sharp caustic lines, not a milky blur of them)
                from scipy import ndimage as _nd
                out_ = ~_nd.binary_dilation(hole, iterations=2)
                inh = ~out_ & (al > 0.05)
                ref = out_ & (al_raw > 0.5)
                if inh.any() and ref.sum() > 50:
                    # (the fill's colour, an average over bright caustics and dark water, comes out milky: brought to
                    # the water's own typical colour, channel by channel)
                    k_ = np.median(F_raw[ref], axis=0) / np.maximum(np.median(F[inh], axis=0), 1)
                    F = np.where(inh[..., None], np.clip(F * k_, 0, 255), F)
                    # (and as solid as the water round it: a covered place deep in the sheet is no thinner than the sheet)
                    near_ = _nd.gaussian_filter(np.where(ref, al_raw, 0), 12) / np.maximum(_nd.gaussian_filter(ref.astype(np.float32), 12), 1e-3)
                    al = np.where(inh, np.maximum(al, np.minimum(near_, np.median(al_raw[ref])) * np.clip((al - 0.25) * 4, 0, 1)), al)
                al = np.where(out_, al_raw, al)
                F = np.where(out_[..., None], F_raw, F)
        F[al <= 0] = 0
        return np.dstack([F, al * 255]).astype(np.uint8)
    if key == "pal":
        # an opaque drawing over a patterned floor whose colours come close (묵혈파광참's seal 斬: its cream is the floor's
        # light grey but warmer, its outline blacker than any of the floor's dark lines): the pixels its own colours name
        # ("pal": numpy expressions over r, g, b, mn, mx), and the outline ("near": [expression, px]) only next to them;
        # what that leaves as pinholes inside closed in the nearest kept colour
        from scipy import ndimage
        r, g, b = a[..., 0], a[..., 1], a[..., 2]
        mn, mx = a.min(axis=2), a.max(axis=2)
        env = {"r": r, "g": g, "b": b, "mn": mn, "mx": mx, "np": np}
        core = np.zeros(a.shape[:2], bool)
        for ex in part.get("pal", e.get("pal")):
            core |= eval(ex, {}, env)
        near = part.get("near", e.get("near"))
        keep = core.copy()
        if near:
            keep |= eval(near[0], {}, env) & ndimage.binary_dilation(core, iterations=near[1])
        keep = ndimage.binary_opening(keep, iterations=1) | core  # (lone dots of the floor that matched: gone)
        lab, n = ndimage.label(keep)
        if n:
            sizes = ndimage.sum(keep, lab, range(1, n + 1))
            keep &= np.isin(lab, 1 + np.nonzero(sizes >= part.get("minpx", e.get("minpx", 12)))[0])
        gap = ndimage.binary_fill_holes(ndimage.binary_closing(keep, iterations=1)) & ~keep
        gl, gn = ndimage.label(gap)
        if gn:
            # (only pinholes: the seal's own counters and the inside of its ring are open, the floor seen through them)
            gs = ndimage.sum(gap, gl, range(1, gn + 1))
            gap &= np.isin(gl, 1 + np.nonzero(gs <= 30)[0])
        rgb = a.copy()
        if gap.any():
            _, (iy, ix) = ndimage.distance_transform_edt(~keep, return_indices=True)
            rgb[gap] = a[iy[gap], ix[gap]]
        out = np.dstack([rgb, (keep | gap) * 255]).astype(np.uint8)
        layers = part.get("layers", e.get("layers"))
        if layers:
            # the same drawing shown more than once in the frame, in step (the three seals 斬): where this one is cut by
            # the capture's edge or has someone standing over it (neither its colours nor the clean floor of "bg"), the
            # same place on the next copy ("layers": [[dx, dy] …] from this one to it); the canvas grown by "pad" below
            pad = part.get("pad", e.get("pad", 0))
            H, W = a.shape[:2]
            floor = np.abs(a - bg).max(axis=2) < 20
            valid = (keep | gap | floor)
            for x0, y0, x1, y1 in part.get("badbox", e.get("badbox", [])):
                valid[y0:y1, x0:x1] = False  # (where a bystander stands over that copy: never taken from it)
            res = np.zeros((H + pad, W, 4), np.uint8)
            done = np.zeros((H + pad, W), bool)
            yy, xx = np.mgrid[0:H + pad, 0:W]
            for dx, dy in [[0, 0]] + layers:
                sy, sx = yy + dy, xx + dx
                inside = (sy >= 0) & (sy < H) & (sx >= 0) & (sx < W)
                syc, sxc = sy.clip(0, H - 1), sx.clip(0, W - 1)
                ok = ~done & inside & valid[syc, sxc]
                res[ok] = out[syc[ok], sxc[ok]]
                done |= ok
            return res
        return out
    if key == "orb":
        # a solid sphere over the hero, a number and a bar (폭렬천뢰탄): inside the circle "orb" [cx, cy, R] the frame's
        # own pixels, but those that are not the sphere's — warm (the hero, the dummy's marker), green (a bar) or in
        # "boxes" (the number, the bar) — taken again from the same radius a quarter, three quarters or half a turn on;
        # outside it the lightning as bluediff (with "boxes" cleared and nothing left of the sphere: another lies there)
        cx, cy, R = part["orb"]
        H, W = a.shape[:2]
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        dx, dy = xx - cx, yy - cy
        r = np.hypot(dx, dy)
        inside = r <= R
        bad = (a[..., 0] > a[..., 2] + 10) | ((a[..., 1] > a[..., 2] + 20) & (a[..., 1] > a[..., 0] + 20))
        for b in part.get("boxes", []):
            bad[max(0, b[1]):b[3], max(0, b[0]):b[2]] = True
        # their dark outlines too (the marker's, the number's)
        from PIL import ImageFilter
        bad = np.asarray(Image.fromarray(bad.astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(5))) > 0
        rgb = a.copy()
        fix = inside & bad
        todo = fix.copy()
        for ang in (30, -30, 45, -45, 60, -60, 90, -90, 120, -120, 150, -150, 180):
            if not todo.any():
                break
            c, s = np.cos(np.radians(ang)), np.sin(np.radians(ang))
            sx = np.rint(cx + dx * c - dy * s).astype(int).clip(0, W - 1)
            sy = np.rint(cy + dx * s + dy * c).astype(int).clip(0, H - 1)
            ok = todo & ~bad[sy, sx] & inside[sy, sx]
            rgb[ok] = a[sy[ok], sx[ok]]
            todo &= ~ok
        out = {**part, "key": "bluediff"}
        lt = keyed(frames, i, e, out)
        al = lt[..., 3].astype(np.float32)
        for b in part.get("boxes", []):
            al[max(0, b[1]):b[3], max(0, b[0]):b[2]] = 0
        # the lightning leaves to the right and below; on the left and above lie the hero, another sphere, the number
        al[(dx < 0) & (dy < R * 0.6)] = 0
        edge = np.clip(R + 1.5 - r, 0, 1.5) / 1.5
        al = np.where(inside, 255 * edge, al * (1 - edge))
        al[inside & todo] = 0
        return np.dstack([np.where(inside[..., None], rgb, a), al]).astype(np.uint8)
    if key == "dark":
        return key_dark(a, bg, e)
    return diffed(frames[i], frames[part.get("bg", e.get("bg", 0))], part.get("t0", e.get("t0", 18)), part.get("t1", e.get("t1", 70)))


def parts_cells(frames, e):
    """mode "parts": each frame's cell put together from parts of the capture (see the module's notes)."""
    cw, ch = e["cell"]
    ox, oy = e["origin"]
    cache = {}
    out = []
    for ci, parts in enumerate(e["cells"]):
        cell = np.zeros((ch, cw, 4), dtype=np.uint8)
        for part in parts:
            ck = (part["f"], part.get("key"), part.get("bg"), part.get("t0"), part.get("t1"), json.dumps(part.get("unnum")), tuple(part.get("at", ())) if part.get("unnum") else None)
            if ck not in cache:
                cache[ck] = keyed(frames, part["f"], e, part)
            a = cache[ck].copy()
            H, W = a.shape[:2]
            ax, ay = part["at"]
            if part.get("flipv"):
                # (the same piece upside down round its own line: another bolt of the same drawing)
                a = a[::-1].copy()
                ay = H - 1 - ay
            box = lambda b: (max(0, ax + b[0]), max(0, ay + b[1]), min(W, ax + b[2]), min(H, ay + b[3]))
            # the fills, one after another, each reading what those before left (a number filled first, then that side
            # mirrored): "ops" [{"shift": …} | {"mirror": …} | {"clear": [box]} …], or the three lists in that order
            ops = part.get("ops") or ([{"shift": m} for m in part.get("shift", [])] + [{"mirror": m} for m in part.get("mirror", [])]
                                      + [{"clear": b} for b in part.get("clear", [])])
            for op in ops:
                if "rot" in op:
                    # (a round burst with a number, a star or a body over part of it: those boxes (relative to "at") taken
                    # again from the burst itself at the same distance from its middle ("rc" [dx, dy] from "at", default
                    # 0), turned the least that finds a clean place — the original's own dots, a round burst's own turn)
                    rcx, rcy = ax + op.get("rc", [0, 0])[0], ay + op.get("rc", [0, 0])[1]
                    bad_ = np.zeros((H, W), bool)
                    # (more than one kind of thing over it, each its own boxes and expressions: "also" [{rot, where, grow} …],
                    # all filled together — none taken from another's place)
                    for sub_ in [op] + op.get("also", []):
                        m_ = np.zeros((H, W), bool)
                        for b in sub_["rot"]:
                            x0, y0, x1, y1 = box(b)
                            m_[y0:y1, x0:x1] = True
                        if sub_.get("where"):
                            # (in those boxes only what the expression over the capture's own frame names — the digits'
                            # blue, the star's white — grown by "grow": the burst round them kept, no square seam)
                            from scipy import ndimage
                            o_ = np.asarray(frames[part["f"]].convert("RGB")).astype(np.float32)
                            b_ = np.asarray(frames[part.get("bg", e.get("bg", 0))].convert("RGB")).astype(np.float32)
                            # ("d": how far it moved from the clean frame — a marker drawn over the effect has not moved)
                            env_ = {"r": o_[..., 0], "g": o_[..., 1], "b": o_[..., 2], "mn": o_.min(axis=2), "mx": o_.max(axis=2), "np": np,
                                    "d": np.abs(o_ - b_).max(axis=2)}
                            hit_ = np.zeros((H, W), bool)
                            for ex_ in sub_["where"]:
                                hit_ |= eval(ex_, {}, env_)
                            hit_ = ndimage.binary_dilation(hit_, iterations=sub_.get("grow", 3))
                            m_ &= ndimage.binary_fill_holes(hit_)
                        bad_ |= m_
                    yy_, xx_ = np.mgrid[0:H, 0:W].astype(np.float32)
                    dx_, dy_ = xx_ - rcx, yy_ - rcy
                    todo_ = bad_.copy()
                    src_ = a.copy()
                    for ang in op.get("angles", (35, -35, 60, -60, 90, -90, 120, -120, 150, -150, 180)):
                        if not todo_.any():
                            break
                        c_, s_ = np.cos(np.radians(ang)), np.sin(np.radians(ang))
                        sx_ = np.rint(rcx + dx_ * c_ - dy_ * s_).astype(int)
                        sy_ = np.rint(rcy + dx_ * s_ + dy_ * c_).astype(int)
                        inb_ = (sx_ >= 0) & (sx_ < W) & (sy_ >= 0) & (sy_ < H)
                        sxc_, syc_ = sx_.clip(0, W - 1), sy_.clip(0, H - 1)
                        ok_ = todo_ & inb_ & ~bad_[syc_, sxc_]
                        a[ok_] = src_[syc_[ok_], sxc_[ok_]]
                        todo_ &= ~ok_
                    if todo_.any():
                        # (what no turn finds clean: the nearest clean pixel's own colour and alpha — a broken dot repaired)
                        from scipy import ndimage
                        _, (iy_, ix_) = ndimage.distance_transform_edt(todo_ | bad_, return_indices=True)
                        a[todo_] = src_[iy_[todo_], ix_[todo_]]
                    continue
                if "radial" in op:
                    # (only the burst's own round: what lies past r1 from its middle is not its — faded from r0)
                    r0_, r1_ = op["radial"]
                    rcx, rcy = ax + op.get("rc", [0, 0])[0], ay + op.get("rc", [0, 0])[1]
                    yy_, xx_ = np.mgrid[0:H, 0:W]
                    ry_ = op.get("ry", 1.0)
                    rr_ = np.hypot(xx_ - rcx, (yy_ - rcy) / ry_)
                    a[..., 3] = (a[..., 3] * np.clip((r1_ - rr_) / max(1.0, r1_ - r0_), 0, 1)).astype(np.uint8)
                    continue
                if "vmirror" in op:
                    # (a box filled from the rows on the other side of y = ay: a sheaf of vertical streaks — 해일강타's
                    # pillar — goes on unbroken over the line, no seam)
                    m = op["vmirror"]
                    x0, y0, x1, y1 = box(m["box"])
                    axis = ay + m["ay"]
                    src = a.copy()
                    for y in range(y0, y1):
                        sy = int(round(2 * axis - y))
                        if 0 <= sy < H:
                            a[y, x0:x1] = src[sy, x0:x1]
                        else:
                            a[y, x0:x1, 3] = 0
                elif "mirror" in op:
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
                elif "hinterp" in op:
                    # (a still post's faint edge the light crossed: its columns re-drawn as the blend of either side)
                    x0, x1 = ax + op["hinterp"][0], ax + op["hinterp"][1]
                    if 0 < x0 < x1 < W:
                        L, R = a[:, x0 - 1].astype(np.float32), a[:, x1].astype(np.float32)
                        for j, x in enumerate(range(x0, x1)):
                            t = (j + 1) / (x1 - x0 + 1)
                            a[:, x] = (L * (1 - t) + R * t).astype(a.dtype)
                elif "shift" in op:
                    m = op["shift"]
                    x0, y0, x1, y1 = box(m["box"])
                    dx, dy = m["d"]
                    if x1 > x0 and y1 > y0 and 0 <= y0 + dy and y1 + dy <= H and 0 <= x0 + dx and x1 + dx <= W:
                        if m.get("where"):
                            # (only the pixels the expressions name over the capture's own frame — a number's — grown by
                            # "grow": the rest of the box keeps its own dots, no square seam)
                            from scipy import ndimage
                            o_ = np.asarray(frames[part["f"]].convert("RGB")).astype(np.float32)
                            yy_, xx_ = np.mgrid[0:H, 0:W]
                            env_ = {"r": o_[..., 0], "g": o_[..., 1], "b": o_[..., 2], "mn": o_.min(axis=2), "mx": o_.max(axis=2), "np": np,
                                    "x": xx_, "y": yy_}
                            hit_ = np.zeros((H, W), bool)
                            for ex_ in m["where"]:
                                hit_ |= eval(ex_, {}, env_)
                            hit_ = ndimage.binary_fill_holes(ndimage.binary_dilation(hit_, iterations=m.get("grow", 2)))[y0:y1, x0:x1]
                            a[y0:y1, x0:x1][hit_] = a[y0 + dy:y1 + dy, x0 + dx:x1 + dx][hit_].copy()
                        else:
                            a[y0:y1, x0:x1] = a[y0 + dy:y1 + dy, x0 + dx:x1 + dx].copy()
                else:
                    x0, y0, x1, y1 = box(op["clear"])
                    if x1 > x0 and y1 > y0:
                        a[y0:y1, x0:x1, 3] = 0
            if part.get("flipx"):
                # (the same part mirrored about its own point: the half of a round thing the capture's edge cut, from the
                # half it shows — the original's own pixels, mirrored)
                a = a[:, ::-1].copy()
                ax = W - 1 - ax
                box = lambda b: (max(0, ax + b[0]), max(0, ay + b[1]), min(W, ax + b[2]), min(H, ay + b[3]))
            clip = part.get("clip", [-ox, -oy, cw - ox, ch - oy])
            # the part's kept box, in the frame and in the cell
            fx0, fy0 = max(0, ax + max(clip[0], -ox)), max(0, ay + max(clip[1], -oy))
            fx1, fy1 = min(W, ax + min(clip[2], cw - ox)), min(H, ay + min(clip[3], ch - oy))
            if fx1 <= fx0 or fy1 <= fy0:
                continue
            src = a[fy0:fy1, fx0:fx1]
            fe = part.get("feather", e.get("feather"))
            if fe:
                # (the part's own cut edges faded over fe px — a clip line inside the cell, not on its edge, ends softly)
                src = src.copy()
                hh, ww = src.shape[:2]
                rx = np.minimum(np.arange(ww), np.arange(ww)[::-1]).clip(0, fe) / fe
                ry = np.minimum(np.arange(hh), np.arange(hh)[::-1]).clip(0, fe) / fe
                src[..., 3] = (src[..., 3] * np.minimum(rx[None, :], ry[:, None])).astype(src.dtype)
            cx0, cy0 = fx0 - ax + ox, fy0 - ay + oy
            dst = cell[cy0:cy0 + src.shape[0], cx0:cx0 + src.shape[1]]
            # under what is there already (the first part on top)
            da = dst[..., 3:4].astype(np.float32) / 255
            sa = src[..., 3:4].astype(np.float32) / 255
            oa = da + sa * (1 - da)
            rgb = (dst[..., :3] * da + src[..., :3] * sa * (1 - da)) / np.maximum(oa, 1e-3)
            dst[..., :3] = np.clip(rgb, 0, 255).astype(np.uint8)
            dst[..., 3:4] = np.clip(oa * 255, 0, 255).astype(np.uint8)
        if ci in e.get("dedither", []):
            # (the original's see-through drawn as a checker of dots — 호기어검's fading ghost sword: the checker made the
            # even half-light it stands for, each pixel the mean of its 2×2, colour weighted by opacity)
            from scipy import ndimage
            f_ = cell.astype(np.float32)
            f_[..., 3] *= (f_[..., :3].min(axis=2) > 185)  # (only the light dots: the floor's dots between them are not it)
            al_ = ndimage.uniform_filter(f_[..., 3], 2)
            rgb_ = np.stack([ndimage.uniform_filter(f_[..., c] * f_[..., 3], 2) for c in range(3)], -1) / np.maximum(al_, 1)[..., None]
            cell = np.dstack([rgb_, al_]).clip(0, 255).astype(np.uint8)
        if e.get("nogray"):
            # (a grey blade or post left in a coloured effect: dark and without colour — the effect's own pixels have it)
            mx_, mn_ = cell[..., :3].max(axis=2).astype(int), cell[..., :3].min(axis=2).astype(int)
            cell[(mx_ < e["nogray"]) & (mx_ - mn_ < 45), 3] = 0
        for x0, y0, x1, y1 in e.get("clearcell", []):
            cell[y0:y1, x0:x1, 3] = 0  # (a speck of a bystander, in the cell's own pixels)
        if e.get("opaque"):
            # (a see-through effect taken off the original's light grey floor reads as strong as it did there only over a
            # floor as light; over our dark ground the same alpha shows the ground through and the effect looks pale: its
            # own colour kept, its opacity raised, 1 − (1 − a)^opaque — what is clear stays clear, the solid stays solid)
            a_ = cell[..., 3].astype(np.float32) / 255
            cell[..., 3] = np.clip((1 - (1 - a_) ** e["opaque"]) * 255, 0, 255).astype(np.uint8)
        if e.get("despeck"):
            # (specks standing alone, a few pixels of a bystander's star: gone)
            from scipy import ndimage
            lab, n = ndimage.label(cell[..., 3] > 40)
            if n:
                sz = ndimage.sum(np.ones(lab.shape), lab, range(1, n + 1))
                cell[np.isin(lab, 1 + np.nonzero(sz < e["despeck"])[0]), 3] = 0
        if e.get("disc"):
            # (only what lies in the drawing's own round — 묵혈파광참's ring — the bystanders' markers and stars outside it)
            yy, xx = np.mgrid[0:ch, 0:cw]
            rr = np.hypot(xx - ox, yy - oy)
            cell[..., 3] = (cell[..., 3] * np.clip((e["disc"] + 1.5 - rr) / 2.5, 0, 1)).astype(np.uint8)
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
        pick = [i for i in range(s, min(t, len(frames)), st) if i not in e.get("skip", [])]
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
                digit = (bl > 170) & (r < 120) & (bl - r > 90)
                if e.get("cyan"):
                    # (천변지이's cyan lightning is as blue as the digits' highlights: out of the columns of numbers — the
                    # "cyan" box [x0, y0, x1, y1] they stand in — a green-blue is the lightning, not a number)
                    cx0, cy0, cx1, cy1 = e["cyan"]
                    yy0, xx0 = np.mgrid[0:a.shape[0], 0:a.shape[1]]
                    cols = (xx0 >= cx0) & (xx0 < cx1) & (yy0 >= cy0) & (yy0 < cy1)
                    digit &= ~((g >= bl - 50) & ~cols)
                hole = digit | (a.min(axis=2) > e.get("white", 225))
                if e.get("bars"):  # the life bars' green and the DEAD labels' red over the field
                    hole |= ((g > 140) & (r < 110) & (bl < 110)) | ((r > 150) & (g < 40) & (bl < 40))
                if e.get("stars"):  # the hit stars' orange round the damage numbers (질풍난무: not the bamboo's yellow)
                    hole |= (r > 190) & (g < 170) & (bl < 100) & (r - g > 60)
                    if e.get("stars") == 2 and e.get("field"):
                        # (and their darker rims, where the dummies stood: the golden bolts there are greener)
                        fcx, fcy, frx, fry = e["field"]
                        yy0, xx0 = np.mgrid[0:a.shape[0], 0:a.shape[1]]
                        infield = ((xx0 - fcx) / frx) ** 2 + ((yy0 - fcy) / fry) ** 2 <= 1
                        if e.get("cyan"):
                            infield = infield | cols
                        hole |= (r > 90) & (g < 160) & (r - g > 35) & (bl < 120) & infield
                if e.get("cyan"):
                    # (the numbers, stars and bars stand only in their columns: the waves' white crests and the lightning
                    # outside them are the art's own — filled with grey they made the art pale); "holebox": UI text
                    hole &= cols
                    for x0_, y0_, x1_, y1_ in e.get("holebox", []):
                        hole[y0_:y1_, x0_:x1_] |= a[y0_:y1_, x0_:x1_].min(axis=2) > 150
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
                    if e.get("fieldbright"):
                        # (and the art's own pale light — wind lines, a rain of arrows — bright and cool, not a body's brown)
                        lo_ = e["fieldbright"]
                        vivid = np.maximum(vivid, np.clip((a.min(axis=2) - lo_) / 40, 0, 1) * np.clip((bl - r + 10) / 20, 0, 1))
                    if e.get("fieldcool"):
                        # (an art of greens, teals, whites and yellows — 만시창공's scroll: in the middle all of it is kept but what
                        # is warmer than it — the dummies' wood, the hero's armour, the brown the numbers were filled with, the
                        # stars' orange — red standing over green)
                        vivid = np.clip((g - r + e["fieldcool"]) / 10, 0, 1)
                    if e.get("nored"):
                        # (the hit stars' and the dummies' markers' red and orange left after the fill: not the art's — out)
                        vivid = vivid * np.clip((e["nored"] - (r - np.maximum(g, bl))) / 20, 0, 1)
                    al = al * (1 - inside + inside * vivid)
                if e.get("vignette"):
                    rx, ry, soft = e["vignette"]
                    bx = e.get("box") or [0, 0, a.shape[1], a.shape[0]]
                    cx, cy = (bx[0] + bx[2]) / 2, (bx[1] + bx[3]) / 2
                    yy, xx = np.mgrid[0:a.shape[0], 0:a.shape[1]]
                    rr = np.sqrt(((xx - cx) / ((bx[2] - bx[0]) / 2 * rx)) ** 2 + ((yy - cy) / ((bx[3] - bx[1]) / 2 * ry)) ** 2)
                    al = al * np.clip((1 - rr) / soft, 0, 1)
                if e.get("edge"):
                    # (a frame of art round the screen — 만시창공's scroll: kept to the box's edge, faded over its last `edge`
                    # pixels, so it ends softly, not on the capture's straight edge)
                    n_ = e["edge"]
                    bx = e.get("box") or [0, 0, a.shape[1], a.shape[0]]
                    yy, xx = np.mgrid[0:a.shape[0], 0:a.shape[1]]
                    dd = np.minimum(np.minimum(xx - bx[0], bx[2] - 1 - xx), np.minimum(yy - bx[1], bx[3] - 1 - yy))
                    al = al * np.clip(dd / n_, 0, 1)
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
