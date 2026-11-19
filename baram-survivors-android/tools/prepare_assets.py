#!/usr/bin/env python3
"""Turns the downloaded old-Baram images (and optional sound files) into the game's assets.

    prepare_assets.py IMAGES_DIR OUT_DIR [AUDIO_DIR] [AVATAR_DIR] [TOWN_DIR] [SKILL_FX_DIR] [MODERN_DIR] [GEAR_DIR]

MODERN_DIR holds today's client effects for the last spells of each tree, named
new_<skill id>.gif (for example new_m_fire3.gif), captured on a white background.

IMAGES_DIR is the unpacked old_images zip (the folder holding image/, magics/,
itemImage/, _pages.json, ...). OUT_DIR becomes www/assets in the APK.

What it writes:
  fx/<id>.png      every magic effect as one horizontal strip of its frames
  mon/<id>.png     every distinct monster image (the zip's duplicates left out)
  item/<id>.png    the item icons the game uses
  hero/<id>.png    the four class portraits
  icon/<id>.png    each effect's fullest frame, cropped, for spell slots
  skillicon/<id>.png  the 8·9차 spells' own icons (GEAR_DIR/skillicon/)
  prop/<name>.png     trees, palisade, jars, stones from the original map (GEAR_DIR/prop/)
  yunit/<id>.png      연's monster sheets: walk/idle/attack/death by direction (GEAR_DIR/yunit/)
  floor/<terrain>.png 연's own floors, one seamless tile per terrain (GEAR_DIR/floor/)
  ui/...           the world maps for the hunting-ground picker
  audio/...        whatever sound files AUDIO_DIR holds (see README)
  manifest.json    sizes, frame timings and blending of all of the above

Effects drawn on a black background are marked "add": the game draws them with
additive blending, the way the original client did, so the black disappears.
"""
import json
import os
import re
import shutil
import sys

import numpy as np
from PIL import Image

# Item icons the game uses, by role (file names in itemImage/).
ITEMS = {
    "gem1": "1034", "gem2": "1036", "gem3": "1035", "gem4": "1082",
    "coin": "1022", "heal": "11", "potion": "1125", "magnet": "1161",
    "p_armor": "1165", "p_power": "1116", "p_haste": "1208", "p_speed": "1215",
    "p_life": "1304", "p_area": "1141", "chest": "16",
    # Dropped armor lies on the ground as a folded armor, not as a figure wearing it.
    "armor": "203",
    # Crafting materials.
    "m_fur": "230", "m_bone": "33", "m_horn": "229", "m_ember": "63", "m_jade": "36",
    # Today's client's materials, in old pictures of the like.
    "m_gold": "1149", "m_steel": "1155", "m_essence": "1161", "m_soul": "1040", "m_scroll": "1163",
    "m_kalpa": "1016", "m_silver1": "1148", "m_silver2": "1145", "m_silver3": "1146",
}
HEROES = ["1001", "1002", "1003", "1004"]
HERO_HEIGHT = 56
AUDIO_EXT = (".ogg", ".mp3", ".m4a", ".wav")


def frames_of(path):
    im = Image.open(path)
    n = getattr(im, "n_frames", 1)
    frames, durs = [], []
    for i in range(n):
        im.seek(i)
        frames.append(im.convert("RGBA").copy())
        durs.append(int(im.info.get("duration", 100) or 100))
    return frames, durs


def unwhite(frames):
    """Effects captured on white: take the white back out, so each pixel keeps its own colour
    with the coverage it had (a = 1 - darkest channel), cropped to what ever shows."""
    out = []
    for f in frames:
        px = f.convert("RGB").load()
        w, h = f.size
        im = Image.new("RGBA", (w, h))
        o = im.load()
        for y in range(h):
            for x in range(w):
                r, g, b = px[x, y]
                a = 255 - min(r, g, b)
                if a < 12:
                    continue
                k = 255 - a
                o[x, y] = (min(255, (r - k) * 255 // a), min(255, (g - k) * 255 // a), min(255, (b - k) * 255 // a), a)
        out.append(im)
    box = None
    for im in out:
        b = im.getbbox()
        if b:
            box = b if not box else (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
    if box:
        out = [im.crop(box) for im in out]
    # Today's client draws at about twice the old one's pixel size.
    return [im.resize((max(1, im.width // 2), max(1, im.height // 2)), Image.LANCZOS) for im in out]


def unshade(frames):
    """A capture on white whose picture is mostly a black blot (귀염추혼소's cloud of bats: near-black
    over 64% of a frame): the client's dark aura is a shade over the field, but a GIF has no
    partial cover, so it came out solid black (with a dithered rim), and drawn screen-wide it hid the field under a black blot. Where near-black
    covers 40% or more of some frame, the near-black is laid down as a shade (at most ~55% cover);
    coloured pixels (the bats' red) keep theirs. Captures with dark outlines only (at most a
    quarter of a frame: 화무십일홍, 탈명사식) are left alone."""
    arrs = [np.asarray(f.convert("RGBA")).astype(np.float32) for f in frames]
    blot = max(float(((a[..., 3] >= 128) & (a[..., :3].max(2) < 40)).mean()) for a in arrs)
    if blot < 0.4:
        return frames
    out = []
    for a in arrs:
        a = a.copy()
        # 0 for a coloured pixel, 1 for a black one (brightness under 24), a ramp between.
        k = np.clip((60 - a[..., :3].max(2)) / 36, 0, 1)
        a[..., 3] = np.minimum(a[..., 3], 255 - k * (255 - 140))
        out.append(Image.fromarray(a.astype(np.uint8), "RGBA"))
    return out


def unframe(frames):
    """Some of the site's GIFs were saved with a 1-pixel black box around the picture (투명, 저주,
    지진, ...): drawn in the game it showed as a square. Clear any ring that is all opaque black."""
    out = []
    for f in frames:
        f = f.copy()
        px = f.load()
        w, h = f.size
        for r in range(3):
            if w - 2 * r < 4 or h - 2 * r < 4:
                break
            ring = [(x, r) for x in range(r, w - r)] + [(x, h - 1 - r) for x in range(r, w - r)] \
                + [(r, y) for y in range(r, h - r)] + [(w - 1 - r, y) for y in range(r, h - r)]
            if not all(px[q][3] > 200 and sum(px[q][:3]) < 60 for q in ring):
                break
            for q in ring:
                px[q] = (0, 0, 0, 0)
        out.append(f)
    return out


def is_additive(frames):
    """True when the effect sits on an opaque, mostly black background."""
    px = black = 0
    for f in frames:
        if f.getextrema()[3][0] < 255:
            return False  # has real transparency
        data = f.convert("RGB").resize((16, 16)).tobytes()
        for i in range(0, len(data), 3):
            px += 1
            black += data[i] + data[i + 1] + data[i + 2] < 40
    return px > 0 and black / px > 0.4


# 연 units the name match got wrong (호랑이 → a small yellow creature).
YUNIT_WRONG = {"Monster_0164"}
# Our monsters whose 연 namesake is plainly another creature, by eye (은여우 → a jellyfish; the
# old 삼두룡 10014, named 반고 in the old table, → 연's 반고, a green giant). Audited pair by pair:
# a wrong one keeps the old picture, so the raid list and the field show the same monster.
YUNIT_WRONG_IDS = {
    "10001", "10003", "10004", "10005", "10006", "10007", "10008", "10009", "10010", "10011", "10012", "10013",
    "10014", "1014", "1022", "1025", "1040", "1041", "11001", "11002", "11018", "11024", "12001", "12008",
    "12011", "12013", "12018", "12019", "12023", "12025", "12026", "12027", "12029", "12033", "12034", "12036",
    "12038", "12039", "12041", "12042", "12045", "12046", "12050", "12053", "12056", "12059", "12060", "12070",
    "12097", "12099", "12106", "12107", "14003", "2001", "2002", "2003", "2004", "3010", "3011", "3016",
    "3019", "3020", "3022", "3023", "3026", "3027", "3034", "3035", "3036", "3042", "3043", "3044",
    "3045", "3051", "3052", "3053", "3055", "3070", "3071", "3078", "6001", "6002", "6004", "6006",
    "6007", "6017", "6018", "6019", "6027", "6028", "6030", "6031", "6033", "6034", "6036", "6046",
    "6053", "6054", "6055", "6056", "6057", "6058", "6059", "7002", "7005", "7006", "7007", "7009",
    "7012", "8011", "8015", "8023", "8024", "8026", "8027", "8049", "8050", "8051", "8055", "8056",
    "9011", "9021", "9022", "6005",
}
# The old table's names run one off in places (10013's picture is 반고, not 순제): 연's sheet for
# one id is the right monster for another. Our id → the 연 unit whose sheet it wears.
YUNIT_REMAP = {"10013": "10014", "10012": "10013", "10003": "10006", "7012": "7009", "10006": "10009", "10004": "10005", "10005": "10007", "10007": "10008", "10008": "10010", "10010": "10011", "2001": "2002", "2002": "2001"}



def yunit_sure(u):
    """A sure name match: exact or by suffix, or 연's name holding the old one (맹오 → 맹오(환))."""
    t = u.get("tier", 9)
    return t <= 1 or (t == 2 and u.get("name", "@") in u.get("yeon", ""))


def icon(frames, add):
    """The fullest frame of an effect, cropped to what is drawn, for the spell slots."""
    def mask(f):
        if add:
            return f.convert("L").point(lambda v: 255 if v > 40 else 0)
        return f.getchannel("A").point(lambda v: 255 if v > 40 else 0)
    # The fullest frame that is still a picture: frames that flash the whole square white
    # (기원's burst, for one) would make the icon a blank tile.
    # So take the frame with the most different colours among its drawn pixels.
    def richness(f):
        m = mask(f)
        px = [c for c, on in zip(f.convert("RGB").getdata(), m.getdata()) if on]
        return len(set((r >> 3, g >> 3, b >> 3) for r, g, b in px))
    # Weighed by how much is drawn too: a faint spell (퇴마주's specks) would else pick a frame of
    # a few dots, and its slot would look empty.
    def worth(f):
        lit = sum(1 for v in mask(f).getdata() if v)
        return richness(f) * (lit ** 0.5)
    best = max(frames, key=worth)
    box = mask(best).getbbox() or (0, 0, best.width, best.height)
    out = best.crop(box)
    if add:
        # Black stands for nothing in these: make it see-through so the slot shows behind.
        px = out.load()
        for y in range(out.height):
            for x in range(out.width):
                r, g, b, a = px[x, y]
                m = max(r, g, b)
                px[x, y] = (r, g, b, 0) if m < 24 else (r, g, b, min(255, m * 2))
    # A dim spell (중독's and 절망's faint glyphs) is stretched so its brightest strokes read in
    # the slot: the same picture, only its levels raised.
    px = out.load()
    lit = sorted(max(px[x, y][:3]) for y in range(out.height) for x in range(out.width) if px[x, y][3] > 0)
    if lit:
        top = lit[int(len(lit) * 0.95)]
        if 0 < top < 200:
            k = 230 / top
            for y in range(out.height):
                for x in range(out.width):
                    r, g, b, a = px[x, y]
                    if a:
                        px[x, y] = (min(255, int(r * k)), min(255, int(g * k)), min(255, int(b * k)), min(255, int(a * k)) if add else a)
    return out



def unblot(frames):
    """Drops solid white blobs from an effect's frames: some old effects carry their shadows
    (or a whole flash frame) in pure white, which the client never showed. Thin white strokes
    (lightning, sword glints) stay: only a white patch of 150 pixels or more that fills most of
    its box goes."""
    import numpy as np
    from collections import deque
    out = []
    for f in frames:
        a = np.array(f.convert("RGBA"))
        white = (a[:, :, 0] >= 248) & (a[:, :, 1] >= 248) & (a[:, :, 2] >= 248) & (a[:, :, 3] > 200)
        seen = np.zeros(white.shape, bool)
        H, W = white.shape
        for y0, x0 in zip(*np.nonzero(white)):
            if seen[y0, x0]:
                continue
            q = deque([(y0, x0)]); seen[y0, x0] = True; pts = []
            while q:
                y, x = q.popleft(); pts.append((y, x))
                for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                    if 0 <= ny < H and 0 <= nx < W and white[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True; q.append((ny, nx))
            if len(pts) < 150:
                continue
            ys = [p[0] for p in pts]; xs = [p[1] for p in pts]
            box = (max(ys) - min(ys) + 1) * (max(xs) - min(xs) + 1)
            if len(pts) / box > 0.6:
                for y, x in pts:
                    a[y, x, 3] = 0
        out.append(Image.fromarray(a, "RGBA"))
    return out

def strip(frames):
    w, h = frames[0].size
    out = Image.new("RGBA", (w * len(frames), h))
    for i, f in enumerate(frames):
        out.paste(f, (i * w, 0))
    return out


# 연's sheets as extracted keep every frame of every motion in cells wide enough for the widest
# attack slash: some monsters came to 3000×2000 pixels, and a hunt loading a dozen of them
# overflowed a phone's graphics memory (the game crawled). Only the motions the game draws are
# kept, at most a few frames each, in cells cut round the body (an attack may reach half as
# far again), and no sheet is wider than 2048 pixels.
UNIT_KEEP = {"walk": 8, "idle": 1, "atk": 5, "cast": 4, "dead": 4}


def repack_unit(path, u):
    sheet = Image.open(path).convert("RGBA")
    cw, ch = u["cell"]
    fx0, fy0 = u["foot"]
    keep = {}
    for name, a in u["anims"].items():
        kind = name.split("_")[0]
        if kind not in UNIT_KEEP:
            continue
        cap = UNIT_KEEP[kind]
        idx = [round(i * (a["n"] - 1) / max(1, cap - 1)) for i in range(cap)] if a["n"] > cap else list(range(a["n"]))
        idx = sorted(set(idx))
        frames = [sheet.crop((i * cw, a["row"] * ch, (i + 1) * cw, (a["row"] + 1) * ch)) for i in idx]
        keep[name] = (frames, round(a["ms"] * a["n"] / len(idx)))
    if not keep:
        return None, None
    def box_of(names):
        b = None
        for nm in names:
            for f in keep[nm][0]:
                bb = f.getchannel("A").getbbox()
                if bb:
                    b = bb if b is None else (min(b[0], bb[0]), min(b[1], bb[1]), max(b[2], bb[2]), max(b[3], bb[3]))
        return b
    body = box_of([n for n in keep if n.startswith(("walk", "idle"))]) or box_of(list(keep)) or (0, 0, cw, ch)
    allb = box_of(list(keep)) or body
    bw, bh = body[2] - body[0], body[3] - body[1]
    lim = (body[0] - bw // 2, body[1] - bh // 2, body[2] + bw // 2, body[3] + bh // 2)
    x0, y0 = max(allb[0], lim[0], 0), max(allb[1], lim[1], 0)
    x1, y1 = min(allb[2], lim[2], cw), min(allb[3], lim[3], ch)
    ncw, nch = x1 - x0, y1 - y0
    cols = max(1, min(max(len(v[0]) for v in keep.values()), 2048 // max(1, ncw)))
    rows_needed = sum(-(-len(v[0]) // cols) for v in keep.values())
    out = Image.new("RGBA", (cols * ncw, rows_needed * nch))
    anims, row = {}, 0
    for name, (frames, ms) in keep.items():
        for i, f in enumerate(frames):
            out.paste(f.crop((x0, y0, x1, y1)), ((i % cols) * ncw, (row + i // cols) * nch))
        anims[name] = {"row": row, "n": len(frames), "ms": ms}
        row += -(-len(frames) // cols)
    return out, {"cell": [ncw, nch], "foot": [fx0 - x0, fy0 - y0], "anims": anims, "cols": cols}


def trim(im):
    box = im.getbbox()
    return im.crop(box) if box else im


def dehalo(im):
    """Drops the dotted yellow selection halo around a class portrait: flood the halo in from
    the edges, then keep only the biggest connected shape (the figure)."""
    im = im.convert('RGBA'); W, H = im.size; px = im.load()
    def halo(c):
        r, g, b, a = c
        return a == 0 or (r, g, b) == (24, 24, 24) or (r >= 190 and 150 <= g <= 210 and 75 <= b <= 130 and r > b + 60)
    seen = set(); st = [(x, y) for x in range(W) for y in (0, H - 1)] + [(x, y) for y in range(H) for x in (0, W - 1)]
    while st:
        x, y = st.pop()
        if (x, y) in seen or not (0 <= x < W and 0 <= y < H) or not halo(px[x, y]): continue
        seen.add((x, y)); px[x, y] = (0, 0, 0, 0); st += [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
    comp = {}; best = None
    for sx in range(W):
        for sy in range(H):
            if px[sx, sy][3] == 0 or (sx, sy) in comp: continue
            members = []; st = [(sx, sy)]; comp[(sx, sy)] = len(members)
            while st:
                x, y = st.pop(); members.append((x, y))
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        n = (x + dx, y + dy)
                        if 0 <= n[0] < W and 0 <= n[1] < H and n not in comp and px[n][3] > 0:
                            comp[n] = 1; st.append(n)
            if best is None or len(members) > len(best): best = members
    keep = set(best or [])
    for x in range(W):
        for y in range(H):
            if (x, y) not in keep: px[x, y] = (0, 0, 0, 0)
    return im.crop(im.getbbox())


def render_midi(audio_src, out, manifest):
    """Old Baram's music is MIDI, which a WebView cannot play: render each tune to OGG with
    fluidsynth and a General MIDI soundfont, trimming the silence at its end."""
    import glob
    import subprocess
    mids = sorted(glob.glob(os.path.join(audio_src, "**", "*.mid"), recursive=True))
    if not mids:
        return
    sf = next((f for f in ("/usr/share/sounds/sf2/FluidR3_GM.sf2", "/usr/share/sounds/sf2/default-GM.sf2")
               if os.path.isfile(f)), None)
    if not sf or not shutil.which("fluidsynth") or not shutil.which("ffmpeg"):
        print("skipping MIDI music: needs fluidsynth, a GM soundfont and ffmpeg", file=sys.stderr)
        return
    os.makedirs(os.path.join(out, "audio", "bgm"), exist_ok=True)
    for mid in mids:
        key = os.path.splitext(os.path.basename(mid))[0]
        wav = os.path.join(out, "audio", "bgm", key + ".wav")
        ogg = os.path.join(out, "audio", "bgm", "mid" + key + ".ogg")
        subprocess.run(["fluidsynth", "-ni", "-g", "0.8", "-r", "44100", "-F", wav, sf, mid],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", wav, "-af",
                        "areverse,silenceremove=start_periods=1:start_threshold=-60dB,areverse",
                        "-ac", "1", "-ar", "22050", "-c:a", "libvorbis", "-q:a", "1", ogg], check=True)
        os.remove(wav)
        manifest["audio"]["bgm"].append({"key": "mid" + key, "file": "audio/bgm/mid" + key + ".ogg"})


def main():
    src, out = sys.argv[1], sys.argv[2]
    audio_src = sys.argv[3] if len(sys.argv) > 3 else None
    avatar_src = sys.argv[4] if len(sys.argv) > 4 else None
    town_src = sys.argv[5] if len(sys.argv) > 5 else None
    skill_fx = sys.argv[6] if len(sys.argv) > 6 else None
    modern = sys.argv[7] if len(sys.argv) > 7 else None
    gear_src = sys.argv[8] if len(sys.argv) > 8 else None
    pages = json.load(open(os.path.join(src, "_pages.json"), encoding="utf-8"))
    dups = json.load(open(os.path.join(src, "_duplicates.json"), encoding="utf-8"))
    for d in ("fx", "icon", "mon", "item", "hero", "ui", "gear", "emote", "beast"):
        os.makedirs(os.path.join(out, d), exist_ok=True)
    manifest = {"fx": {}, "monsters": [], "items": {}, "gear": {}, "emote": {}, "beast": {}, "heroes": [], "ui": {}, "audio": {"bgm": [], "sfx": {}}}

    # Effects, with the class page each one was listed on.
    owner = {}
    for page in ("/magic/warrior", "/magic/rogue", "/magic/mage", "/magic/poet", "/magic"):
        for f in pages.get(page, []):
            if f.startswith("magics/"):
                owner.setdefault(f, page.rsplit("/", 1)[-1])
    # Effects: the image download's magics/, and the skill-icon download's numbered files
    # (SKILL_FX_DIR: the site's own effect numbers, matched to skill names in its list).
    fx_files = {os.path.splitext(n)[0]: os.path.join(src, "magics", n) for n in os.listdir(os.path.join(src, "magics"))}
    if skill_fx and os.path.isdir(skill_fx):
        for n in os.listdir(skill_fx):
            if n.endswith(".gif") and n != "default.gif":
                fx_files[os.path.splitext(n)[0]] = os.path.join(skill_fx, n)
    for fid in sorted(fx_files, key=lambda k: (len(k), k)):
        name = fid + ".gif"
        if fid in HEROES:
            continue
        frames, durs = frames_of(fx_files[fid])
        add = is_additive(frames)
        if not add:
            frames = unblot(unframe(frames))
        strip(frames).save(os.path.join(out, "fx", fid + ".png"), optimize=True)
        icon(frames, add).save(os.path.join(out, "icon", fid + ".png"))
        manifest["fx"][fid] = {"w": frames[0].width, "h": frames[0].height, "n": len(frames),
                               "durs": durs, "add": add, "cls": owner.get("magics/" + name, "magic")}

    # The last spell of each tree has today's effect as well, a nod to the game as it is now.
    if modern and os.path.isdir(modern):
        for n in sorted(os.listdir(modern)):
            if not (n.startswith("new_") and n.endswith(".gif")):
                continue
            fid = n[:-4]
            frames, durs = frames_of(os.path.join(modern, n))
            frames = unshade(unwhite(frames))
            strip(frames).save(os.path.join(out, "fx", fid + ".png"), optimize=True)
            manifest["fx"][fid] = {"w": frames[0].width, "h": frames[0].height, "n": len(frames),
                                   "durs": [90] * len(frames), "add": False, "cls": "modern"}

    # 바람의나라 연's own skill effects, from the official patch notes' skill previews
    # (GEAR_DIR/yeonfx/<name>.gif, drawn on black): cropped to what is drawn over all frames,
    # shrunk to the old effects' scale and thinned to 24 frames at most. Drawn added, so the
    # black is nothing.
    ydir = os.path.join(gear_src, "yeonfx") if gear_src else None
    if ydir and os.path.isdir(ydir):
        for n in sorted(x for x in os.listdir(ydir) if x.endswith(".gif")):
            fid = "y_" + n[:-4]
            frames, durs = frames_of(os.path.join(ydir, n))
            rgb = [f.convert("RGB") for f in frames]
            box = None
            for f in rgb:
                b = f.point(lambda v: 255 if v > 24 else 0).getbbox()
                if b:
                    box = b if box is None else (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
            if not box:
                continue
            step = max(1, -(-len(rgb) // 24))
            keep = list(range(0, len(rgb), step))
            d2 = [sum(durs[i:i + step]) for i in keep]
            w, h = box[2] - box[0], box[3] - box[1]
            # Stored at up to 320 pixels, so that drawn at 연's size (two to three times the old
            # effects') it is not a blur; "k" draws it back at the old 150-pixel scale, where what
            # the spell strikes is measured (game.js grows the picture, not the reach).
            k = min(1.0, 320 / max(w, h))
            k150 = min(1.0, 150 / max(w, h))
            pics = [rgb[i].crop(box).resize((max(1, round(w * k)), max(1, round(h * k))), Image.LANCZOS).convert("RGBA") for i in keep]
            strip(pics).save(os.path.join(out, "fx", fid + ".png"), optimize=True)
            icon(pics, True).save(os.path.join(out, "icon", fid + ".png"))
            manifest["fx"][fid] = {"w": pics[0].width, "h": pics[0].height, "n": len(pics), "durs": d2, "add": True, "cls": "yeon"}
            if k150 < k:
                manifest["fx"][fid]["k"] = round(k150 / k, 4)

    # 연's own spell effects (GEAR_DIR/yskill/<skill id>.png strips + index.json, from
    # tools/yeon_skills.py): fx "k_<skill id>", drawn with their own pivot on the target's feet.
    # The screen-wide ones are stored at most 360 pixels ("scale" in the index says by how much)
    # and drawn back at their size.
    kdir = os.path.join(gear_src, "yskill") if gear_src else None
    if kdir and os.path.isfile(os.path.join(kdir, "index.json")):
        with open(os.path.join(kdir, "index.json"), encoding="utf-8") as f:
            kindex = json.load(f)
        for sid, k in kindex.items():
            ksrc = os.path.join(kdir, sid + ".png")
            if not os.path.isfile(ksrc):
                continue
            (cw, ch), n = k["cell"], k["n"]
            sheet = Image.open(ksrc).convert("RGBA")
            pics = [sheet.crop((i * cw, 0, (i + 1) * cw, ch)) for i in range(n)]
            z = min(1.0, 360 / max(cw, ch))
            if z < 1:
                pics = [p.resize((max(1, round(cw * z)), max(1, round(ch * z))), Image.LANCZOS) for p in pics]
            fid = "k_" + sid
            strip(pics).save(os.path.join(out, "fx", fid + ".png"), optimize=True)
            icon(pics, k.get("add", False)).save(os.path.join(out, "icon", fid + ".png"))
            manifest["fx"][fid] = {"w": pics[0].width, "h": pics[0].height, "n": n, "durs": [k["ms"]] * n,
                                   "add": bool(k.get("add")), "cls": "yeon", "k": round(1 / (z * k.get("scale", 1)), 3),
                                   "ax": round(k["anchor"][0] * z, 1), "ay": round(k["anchor"][1] * z, 1)}
            # A spell whose picture was redrawn larger keeps the old picture's reach (seenReach in game.js).
            if k.get("reach"):
                manifest["fx"][fid]["reach"] = k["reach"]

    # 연's 격 and status effects (GEAR_DIR/ygyeok/: strips rendered by tools/yeon_skills.py from
    # the 격·debuff prefabs, two assembled from their own atlases in play order, + index.json):
    # fx "g_<name>", pivot on the target's feet like the k_ spells; status icons (icons/*.png)
    # copied to hud/st_<name>.png and listed in manifest["status_icons"].
    gdir = os.path.join(gear_src, "ygyeok") if gear_src else None
    manifest["status_icons"] = []
    if gdir and os.path.isfile(os.path.join(gdir, "index.json")):
        with open(os.path.join(gdir, "index.json"), encoding="utf-8") as f:
            gindex = json.load(f)
        for name, k in gindex.items():
            gsrc = os.path.join(gdir, name + ".png")
            if not os.path.isfile(gsrc):
                continue
            (cw, ch), n = k["cell"], k["n"]
            sheet = Image.open(gsrc).convert("RGBA")
            pics = [sheet.crop((i * cw, 0, (i + 1) * cw, ch)) for i in range(n)]
            z = min(1.0, 170 / max(cw, ch))
            if z < 1:
                pics = [p.resize((max(1, round(cw * z)), max(1, round(ch * z))), Image.LANCZOS) for p in pics]
            fid = "g_" + name
            strip(pics).save(os.path.join(out, "fx", fid + ".png"), optimize=True)
            manifest["fx"][fid] = {"w": pics[0].width, "h": pics[0].height, "n": n, "durs": [k["ms"]] * n,
                                   "add": bool(k.get("add")), "cls": "yeon", "k": round(1 / z, 3),
                                   "ax": round(k["anchor"][0] * z, 1), "ay": round(k["anchor"][1] * z, 1)}
        idir = os.path.join(gdir, "icons")
        if os.path.isdir(idir):
            os.makedirs(os.path.join(out, "hud"), exist_ok=True)
            for n in sorted(x for x in os.listdir(idir) if x.endswith(".png")):
                shutil.copyfile(os.path.join(idir, n), os.path.join(out, "hud", "st_" + n))
                manifest["status_icons"].append(n[:-4])

    # 연's hunt presentation (GEAR_DIR/yhud/, tools/yeon_hud.py): hit sparks and the level-up
    # burst as fx "h_<name>" (sparks drawn on the body's middle, the level-up on the feet), the
    # damage-number bitmap font (white digits in black, tinted per kind of hit) and the
    # kill-streak art.
    hdir = os.path.join(gear_src, "yhud") if gear_src else None
    manifest["hud"] = {}
    if hdir and os.path.isfile(os.path.join(hdir, "index.json")):
        with open(os.path.join(hdir, "index.json"), encoding="utf-8") as f:
            hindex = json.load(f)
        for name, k in hindex.items():
            hsrc = os.path.join(hdir, name + ".png")
            if not os.path.isfile(hsrc):
                continue
            (cw, ch), n = k["cell"], k["n"]
            sheet = Image.open(hsrc).convert("RGBA")
            pics = [sheet.crop((i * cw, 0, (i + 1) * cw, ch)) for i in range(n)]
            # 연's kill burst opens on two plain discs: start after them.
            if name == "kill":
                pics = pics[2:]
            fid = "h_" + name
            strip(pics).save(os.path.join(out, "fx", fid + ".png"), optimize=True)
            entry = {"w": cw, "h": ch, "n": len(pics), "durs": [k["ms"]] * len(pics), "add": bool(k.get("add")), "cls": "yeon"}
            if name.startswith("levelup") or name == "kill":
                entry.update({"ax": k["anchor"][0], "ay": k["anchor"][1]})
            manifest["fx"][fid] = entry
        os.makedirs(os.path.join(out, "hud"), exist_ok=True)
        for font in ("font_damage", "font_gold", "font_dmgk_o", "font_dmgk_r", "font_dmgk_w", "font_dmgk_g", "font_dmgk_b"):
            if os.path.isfile(os.path.join(hdir, font + ".png")):
                shutil.copyfile(os.path.join(hdir, font + ".png"), os.path.join(out, "hud", font + ".png"))
                with open(os.path.join(hdir, font + ".json"), encoding="utf-8") as f:
                    manifest["hud"][font] = json.load(f)
        manifest["hud"]["ui"] = []
        for n in sorted(x for x in os.listdir(hdir) if x.startswith("ui_") and x.endswith(".png")):
            shutil.copyfile(os.path.join(hdir, n), os.path.join(out, "hud", n))
            manifest["hud"]["ui"].append(n[:-4])

    for fid in HEROES:
        im = Image.open(os.path.join(src, "magics", fid + ".gif"))
        im = dehalo(im) if fid == "1001" else trim(im.convert("RGBA"))
        # These portraits are drawn larger than characters stand in the game: in captures of
        # the old client a character is about an eighth of the view's height (56 of ~470
        # pixels here). Shrink smoothly, then make the edge hard again so it stays pixel art.
        k = HERO_HEIGHT / im.height
        im = im.resize((round(im.width * k), HERO_HEIGHT), Image.LANCZOS)
        im.putalpha(im.getchannel("A").point(lambda v: 255 if v > 110 else 0))
        im.save(os.path.join(out, "hero", fid + ".png"))
        manifest["heroes"].append({"id": fid, "w": im.width, "h": im.height})

    # Monsters: every image on a monster page. Each page is one hunting ground; the game's
    # stages (web/js/data.js) pick their monsters by these page numbers.
    seen = {}
    for page, files in pages.items():
        m = re.fullmatch(r"/monster/(\d+)", page)
        if not m:
            continue
        for f in files:
            if not f.startswith("image/"):
                continue
            f = dups.get(f, f)
            seen.setdefault(f, set()).add(int(m.group(1)))
    for f in sorted(seen):
        p = os.path.join(src, f)
        if not os.path.isfile(p):
            continue
        im = trim(Image.open(p).convert("RGBA"))
        if im.width < 8 or im.height < 8:
            continue
        mid = os.path.splitext(os.path.basename(f))[0].split(".")[0]
        if any(x["id"] == mid for x in manifest["monsters"]):
            continue
        im.save(os.path.join(out, "mon", mid + ".png"), optimize=True)
        manifest["monsters"].append({"id": mid, "w": im.width, "h": im.height, "pages": sorted(seen[f])})

    for role, iid in ITEMS.items():
        p = os.path.join(src, "itemImage", iid + ".png")
        if os.path.isfile(p):
            im = trim(Image.open(p).convert("RGBA"))
            im.save(os.path.join(out, "item", iid + ".png"))
            manifest["items"][role] = {"id": iid, "w": im.width, "h": im.height}

    # Today's client item pictures (GEAR_DIR, <item name>.png from the client's item render),
    # kept under ASCII names: the manifest maps each item name to its file.
    if gear_src and os.path.isdir(gear_src):
        for i, n in enumerate(sorted(x for x in os.listdir(gear_src) if x.endswith(".png"))):
            im = trim(Image.open(os.path.join(gear_src, n)).convert("RGBA"))
            im.save(os.path.join(out, "gear", f"g{i}.png"), optimize=True)
            manifest["gear"][n[:-4]] = {"id": f"g{i}", "w": im.width, "h": im.height}

    # 바람의나라 연's own spell icons (GEAR_DIR/skillicon/<id>.png): the 8·9차 ones cut from its skill
    # window (tools/skill_icons.py), the 1~4차 ones from the official patch notes' skill tables.
    sdir = os.path.join(gear_src, "skillicon") if gear_src else None
    manifest["skillicon"] = []
    if sdir and os.path.isdir(sdir):
        os.makedirs(os.path.join(out, "skillicon"), exist_ok=True)
        for n in sorted(x for x in os.listdir(sdir) if x.endswith(".png")):
            Image.open(os.path.join(sdir, n)).convert("RGBA").save(os.path.join(out, "skillicon", n), optimize=True)
            manifest["skillicon"].append(n[:-4])
    # 연's official skill icons from its own atlas (GEAR_DIR/skillicon_y/, tools/yeon_skills.py).
    sydir = os.path.join(gear_src, "skillicon_y") if gear_src else None
    if sydir and os.path.isdir(sydir):
        os.makedirs(os.path.join(out, "skillicon"), exist_ok=True)
        for n in sorted(x for x in os.listdir(sydir) if x.endswith(".png")):
            Image.open(os.path.join(sydir, n)).convert("RGBA").save(os.path.join(out, "skillicon", n), optimize=True)
            if n[:-4] not in manifest["skillicon"]:
                manifest["skillicon"].append(n[:-4])

    # Floors from 바람의나라 연's own hunting grounds (GEAR_DIR/floor/<terrain>.png, made seamless
    # by tools/yeon_floor.py); the game falls back to its plain pattern for a terrain without one.
    # The maps' own ground tiles (GEAR_DIR/floor_y/, tools/yeon_maps.py) win over the crops.
    manifest["floor"] = []
    for sub in ("floor", "floor_y"):
        fdir = os.path.join(gear_src, sub) if gear_src else None
        if not (fdir and os.path.isdir(fdir)):
            continue
        os.makedirs(os.path.join(out, "floor"), exist_ok=True)
        for n in sorted(x for x in os.listdir(fdir) if x.endswith(".png")):
            Image.open(os.path.join(fdir, n)).convert("RGB").save(os.path.join(out, "floor", n), optimize=True)
            if n[:-4] not in manifest["floor"]:
                manifest["floor"].append(n[:-4])

    # Props from the original maps (GEAR_DIR/prop/<name>.png, cut by tools/yeon_props.py):
    # trees, the wooden palisade, jars and stones the hunting grounds are dotted with.
    pdir = os.path.join(gear_src, "prop") if gear_src else None
    manifest["prop"] = {}
    if pdir and os.path.isdir(pdir):
        os.makedirs(os.path.join(out, "prop"), exist_ok=True)
        for n in sorted(x for x in os.listdir(pdir) if x.endswith(".png")):
            im = Image.open(os.path.join(pdir, n)).convert("RGBA")
            im.save(os.path.join(out, "prop", n), optimize=True)
            manifest["prop"][n[:-4]] = [im.width, im.height]
    # 연's map objects (GEAR_DIR/prop_y/<terrain>_<name>.png + index.json, tools/yeon_maps.py):
    # each with the ground it stands on and what it is (rock, wall, plant, ...).
    pydir = os.path.join(gear_src, "prop_y") if gear_src else None
    if pydir and os.path.isfile(os.path.join(pydir, "index.json")):
        os.makedirs(os.path.join(out, "prop"), exist_ok=True)
        with open(os.path.join(pydir, "index.json"), encoding="utf-8") as f:
            pindex = json.load(f)["props"]
        for name, meta in pindex.items():
            psrc = os.path.join(pydir, name + ".png")
            if not os.path.isfile(psrc):
                continue
            im = Image.open(psrc).convert("RGBA")
            # Whole squares of ground (a lava pool, a kelp bed) are map pieces, not objects.
            if im.getchannel("A").getextrema()[0] == 255:
                continue
            im.save(os.path.join(out, "prop", name + ".png"), optimize=True)
            manifest["prop"][name] = [im.width, im.height, meta.get("terrain"), meta.get("kind")]

    # 바람의나라 연's own monsters (GEAR_DIR/yunit/<monster id>.png + index.json, from
    # tools/yeon_units.py): walk, idle, attack and death in three directions. Only the sure
    # matches (by name, tiers 0-2) replace the old pictures; the loose ones keep the old.
    udir = os.path.join(gear_src, "yunit") if gear_src else None
    manifest["yunit"] = {}
    old_h = {m["id"]: m["h"] for m in manifest["monsters"]}
    if udir and os.path.isfile(os.path.join(udir, "index.json")):
        os.makedirs(os.path.join(out, "yunit"), exist_ok=True)
        with open(os.path.join(udir, "index.json"), encoding="utf-8") as f:
            index = json.load(f)
        pairs = [(mid, u, mid) for mid, u in index.items() if mid not in YUNIT_REMAP]
        pairs += [(mid, index[src], src) for mid, src in YUNIT_REMAP.items() if src in index]
        for mid, u, src in pairs:
            usrc = os.path.join(udir, src + ".png")
            # 연's own monsters (tools/yeon_grounds.py: the grounds out of 연's maps) have no old
            # picture: their sheet is the monster, and its first standing frame its picture.
            if u.get("own") and os.path.isfile(usrc):
                sheet, nu = repack_unit(usrc, u)
                if sheet is None:
                    continue
                first = nu["anims"].get("idle_down") or nu["anims"].get("walk_down") or next(iter(nu["anims"].values()))
                cw, ch = nu["cell"]
                pic = sheet.crop((0, first["row"] * ch, cw, (first["row"] + 1) * ch))
                pic = pic.crop(pic.getbbox() or (0, 0, cw, ch))
                pic.save(os.path.join(out, "mon", mid + ".png"), optimize=True)
                sheet.save(os.path.join(out, "yunit", mid + ".png"), optimize=True)
                nu["foot_w"] = max(10, pic.width // 2)
                manifest["yunit"][mid] = nu
                # quick: 연's MoveSpeed (40 for most; 128 and up for the darting ones).
                manifest["monsters"].append({"id": mid, "w": pic.width, "h": pic.height, "pages": [], "name": u.get("name", ""),
                                             "quick": int(float(u.get("move") or 0)) >= 96})
                continue
            remapped = mid in YUNIT_REMAP
            if not remapped and (not yunit_sure(u) or u.get("prefab") in YUNIT_WRONG or mid in YUNIT_WRONG_IDS) or not os.path.isfile(usrc):
                continue
            # A namesake can be another creature altogether (연's 흑다람쥐 is a wrestler): a
            # picture far taller or shorter than the old one is not the same monster.
            first = u["anims"].get("walk_down") or next(iter(u["anims"].values()))
            cw, ch = u["cell"]
            box = Image.open(usrc).crop((0, first["row"] * ch, cw, (first["row"] + 1) * ch)).getchannel("A").getbbox()
            vh = (box[3] - box[1]) if box else 0
            oh = old_h.get(mid)
            if not vh or (oh and not 0.45 <= vh / oh <= 2.2):
                continue
            sheet, nu = repack_unit(usrc, u)
            if sheet is None:
                continue
            sheet.save(os.path.join(out, "yunit", mid + ".png"), optimize=True)
            manifest["yunit"][mid] = nu

    # 바람의나라 연's own heroes (GEAR_DIR/yhero/<class>[_<a|b|c>].png + index.json, from
    # tools/yeon_avatar.py): each class in 연's parts, an outfit per armour tier.
    hydir = os.path.join(gear_src, "yhero") if gear_src else None
    manifest["yhero"] = {}
    if hydir and os.path.isfile(os.path.join(hydir, "index.json")):
        os.makedirs(os.path.join(out, "yhero"), exist_ok=True)
        with open(os.path.join(hydir, "index.json"), encoding="utf-8") as f:
            yindex = json.load(f)
        for key, u in yindex.items():
            ysrc = os.path.join(hydir, key + ".png")
            if os.path.isfile(ysrc) and "anims" in u:
                sheet, nu = repack_unit(ysrc, u)
                if sheet is not None:
                    sheet.save(os.path.join(out, "yhero", key + ".png"), optimize=True)
                    manifest["yhero"][key] = nu

    # 바람의나라 연's heroes in layers (GEAR_DIR/yhero2/<class>/<layer>_<variant>.png + index.json,
    # from tools/yeon_gear.py): body, head, armour, helmet, shield and weapon drawn one over
    # another in 연's own order for each frame, so every piece worn shows.
    h2 = os.path.join(gear_src, "yhero2") if gear_src else None
    manifest["yhero2"] = {}
    if h2 and os.path.isfile(os.path.join(h2, "index.json")):
        with open(os.path.join(h2, "index.json"), encoding="utf-8") as f:
            h2index = json.load(f)
        for cls_id, c in h2index.items():
            os.makedirs(os.path.join(out, "yhero2", cls_id), exist_ok=True)
            for kind, variants in c["layers"].items():
                for v, meta in variants.items():
                    shutil.copyfile(os.path.join(h2, meta["file"]), os.path.join(out, "yhero2", meta["file"]))
            # A class no wardrobe sheet dresses (the 궁사) has its card picture made from its layers.
            if c.get("portrait") and os.path.isfile(os.path.join(h2, c["portrait"])):
                shutil.copyfile(os.path.join(h2, c["portrait"]), os.path.join(out, "yhero2", c["portrait"]))
            manifest["yhero2"][cls_id] = c

    # 바람의나라 연's 외형 (코디) items as more layers of the same heroes (GEAR_DIR/ycostume/: s/*.webp,
    # icons/, index.json, from tools/yeon_costume.py) and 연's pets (GEAR_DIR/ypet/, from
    # tools/yeon_pets.py). Some 1400 looks and 360 pets: their list goes to ycostume/index.json, read
    # by the game after the title shows, never into the manifest the game waits for:
    #   {"files": [[path, cols, cw, ch, fx, fy, side?]], "items": {id: [kind, name, grade, set, whole, icon]},
    #    "layers": {cls: {kind: {variant: file index}}},
    #    "pets": {id: [name, grade, file, cols, cw, ch, fx, fy, {anim: [row, n, ms]}, icon]}}
    cdir = os.path.join(gear_src, "ycostume") if gear_src else None
    pdir = os.path.join(gear_src, "ypet") if gear_src else None
    manifest["ycostume"] = {}
    if cdir and os.path.isfile(os.path.join(cdir, "index.json")) and manifest["yhero2"]:
        with open(os.path.join(cdir, "index.json"), encoding="utf-8") as f:
            cindex = json.load(f)
        co = os.path.join(out, "ycostume")
        # The sheets sit with the heroes' own (yhero2/c/), so the game loads them as any layer.
        os.makedirs(os.path.join(out, "yhero2", "c"), exist_ok=True)
        os.makedirs(os.path.join(co, "i"), exist_ok=True)
        files, fidx, layers = [], {}, {}
        for cls_id, kinds in cindex["layers"].items():
            if cls_id not in manifest["yhero2"]:
                continue
            for kind, variants in kinds.items():
                for v, meta in variants.items():
                    if meta["file"] not in fidx:
                        fidx[meta["file"]] = len(files)
                        fn = "c/" + os.path.basename(meta["file"])
                        shutil.copyfile(os.path.join(cdir, meta["file"]), os.path.join(out, "yhero2", fn))
                        files.append([fn, meta["cols"]] + meta["cell"] + meta["foot"] + ([meta["side"]] if meta.get("side") else []))
                    layers.setdefault(cls_id, {}).setdefault(kind, {})[v] = fidx[meta["file"]]
        items = {}
        for iid, it in cindex["items"].items():
            has_icon = 0
            if it.get("icon"):
                shutil.copyfile(os.path.join(cdir, it["icon"]), os.path.join(co, "i", f"{iid}.png"))
                has_icon = 1
            items[iid] = [it["kind"], it["name"], it.get("grade", 1), it.get("set") or "", it.get("whole", 0), has_icon]
        pets = {}
        if pdir and os.path.isfile(os.path.join(pdir, "index.json")):
            with open(os.path.join(pdir, "index.json"), encoding="utf-8") as f:
                pindex = json.load(f)
            os.makedirs(os.path.join(co, "p"), exist_ok=True)
            for pid, pe in pindex.items():
                shutil.copyfile(os.path.join(pdir, pe["file"]), os.path.join(co, "p", pe["file"]))
                has_icon = 0
                if pe.get("icon"):
                    shutil.copyfile(os.path.join(pdir, pe["icon"]), os.path.join(co, "i", f"p{pid}.png"))
                    has_icon = 1
                anims = {k: [a["row"], a["n"], a["ms"]] for k, a in pe["anims"].items()}
                pets[pid] = [pe["name"], pe["grade"], "p/" + pe["file"], pe["cols"]] + pe["cell"] + pe["foot"] + [anims, has_icon]
        with open(os.path.join(co, "index.json"), "w", encoding="utf-8") as f:
            json.dump({"files": files, "items": items, "layers": layers, "pets": pets}, f, ensure_ascii=False, separators=(",", ":"))
        manifest["ycostume"] = {"index": "ycostume/index.json", "items": len(items), "pets": len(pets)}

    # 바람의나라 연's own item icons for the pieces (GEAR_DIR/yitemicon/<class>/<kind>_<key>.png +
    # index.json, from tools/yeon_itemicons.py), keyed as the 연 looks are.
    ii = os.path.join(gear_src, "yitemicon") if gear_src else None
    manifest["yitemicon"] = {}
    if ii and os.path.isfile(os.path.join(ii, "index.json")):
        with open(os.path.join(ii, "index.json"), encoding="utf-8") as f:
            iidx = json.load(f)
        for cls_id, kinds in iidx.items():
            os.makedirs(os.path.join(out, "yitemicon", cls_id), exist_ok=True)
            for kind, keys in kinds.items():
                for key, rel in keys.items():
                    shutil.copyfile(os.path.join(ii, rel), os.path.join(out, "yitemicon", rel))
        manifest["yitemicon"] = iidx

    # 바람의나라 연's own maps for the ground-select tabs (GEAR_DIR/ymap/<tab>.png + index.json:
    # the image, each ground's place on it as fractions, and the town's).
    ym = os.path.join(gear_src, "ymap") if gear_src else None
    manifest["ymap"] = {}
    if ym and os.path.isfile(os.path.join(ym, "index.json")):
        os.makedirs(os.path.join(out, "ymap"), exist_ok=True)
        with open(os.path.join(ym, "index.json"), encoding="utf-8") as f:
            yidx = json.load(f)
        for tab, t in yidx.items():
            shutil.copyfile(os.path.join(ym, t["file"]), os.path.join(out, "ymap", os.path.basename(t["file"])))
            manifest["ymap"][tab] = {"file": os.path.basename(t["file"]), "stages": t["stages"], "town": t.get("town")}

    # The official 2024 emoticons (baram.nexon.com/MultiMedia, GEAR_DIR/emote/<key>.gif): each
    # one a strip of its frames at 64 pixels, for the companions' reaction bubbles.
    edir = os.path.join(gear_src, "emote") if gear_src else None
    if edir and os.path.isdir(edir):
        for n in sorted(x for x in os.listdir(edir) if x.endswith(".gif")):
            frames, durs = frames_of(os.path.join(edir, n))
            frames = [f.resize((64, 64), Image.LANCZOS) for f in frames]
            row = Image.new("RGBA", (64 * len(frames), 64))
            for i, f in enumerate(frames):
                row.paste(f, (64 * i, 0))
            row.save(os.path.join(out, "emote", n[:-4] + ".png"), optimize=True)
            manifest["emote"][n[:-4]] = {"n": len(frames), "dur": durs[0] or 150}

    # 괴수의상 from the dress room (GEAR_DIR/beast/<key>.png: 4 rows front, right, back, left by
    # walk 0-3 and strike 0-1): cropped to one box for all frames, at the wardrobe's 0.64.
    bdir = os.path.join(gear_src, "beast") if gear_src else None
    if bdir and os.path.isdir(bdir):
        for n in sorted(x for x in os.listdir(bdir) if x.endswith(".png")):
            meta = json.load(open(os.path.join(bdir, n[:-4] + ".json"), encoding="utf-8"))
            sheet = Image.open(os.path.join(bdir, n)).convert("RGBA")
            cw, ch = meta["cell"]
            cols, rows = sheet.width // cw, sheet.height // ch
            cells = [[sheet.crop((c * cw, r * ch, (c + 1) * cw, (r + 1) * ch)) for c in range(cols)] for r in range(rows)]
            box = None
            for row in cells:
                for c in row:
                    b = c.getbbox()
                    if b:
                        box = b if box is None else (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
            k = 0.64
            w, h = round((box[2] - box[0]) * k), round((box[3] - box[1]) * k)
            outs = Image.new("RGBA", (w * cols, h * rows))
            for r, row in enumerate(cells):
                for c, cell in enumerate(row):
                    outs.paste(cell.crop(box).resize((w, h), Image.LANCZOS), (c * w, r * h))
            outs.save(os.path.join(out, "beast", n), optimize=True)
            fx, fy = meta["feet"]
            manifest["beast"][n[:-4]] = {"name": meta["name"], "cell": [w, h], "cols": cols,
                                        "feet": [round((fx - box[0]) * k), round((fy - box[1]) * k)]}

    # The wardrobe's backdrop (the island seen from the sea), behind the class figures.
    p = os.path.join(src, "wardrobeB", "wback3.png")
    if os.path.isfile(p):
        Image.open(p).convert("RGB").save(os.path.join(out, "ui", "wback.png"), optimize=True)

    # Townsfolk, shrunk like the wardrobe figures to the monsters' scale (see avatar_assets).
    npc_dir = os.path.join(src, "npc")
    if os.path.isdir(npc_dir):
        os.makedirs(os.path.join(out, "npc"), exist_ok=True)
        manifest["npc"] = []
        for name in sorted(os.listdir(npc_dir)):
            if not name.endswith(".png"):
                continue
            im = Image.open(os.path.join(npc_dir, name)).convert("RGBA")
            im = im.crop(im.getbbox())
            w, h = round(im.width * 0.64), round(im.height * 0.64)
            im = im.resize((w, h), Image.LANCZOS)
            im.putalpha(im.getchannel("A").point(lambda v: 255 if v > 110 else 0))
            key = os.path.splitext(name)[0]
            im.save(os.path.join(out, "npc", key + ".png"))
            manifest["npc"].append(key)

    # The town: a map from the 1996 client (TOWN_DIR/town.png, 48-pixel tiles) and the smithy's
    # inside for its window.
    if town_src and os.path.isdir(town_src):
        for key in ("town", "smithy"):
            p = os.path.join(town_src, key + ".png")
            if os.path.isfile(p):
                im = Image.open(p).convert("RGB")
                im.save(os.path.join(out, "ui", key + ".png"), optimize=True)
                manifest["ui"][key] = {"w": im.width, "h": im.height}

    # 바람의나라 연's town and title (GEAR_DIR/ytown/ from tools/yeon_town.py: 국내성's market map,
    # its walk grid and 연's NPCs; GEAR_DIR/ytitle/: the logo over the snowy peaks from 연's
    # ending film and its login-wait picture). Where present they replace the 1996 town and
    # the drawn title.
    ydir = os.path.join(gear_src, "ytown") if gear_src else None
    if ydir and os.path.isfile(os.path.join(ydir, "index.json")):
        os.makedirs(os.path.join(out, "ytown"), exist_ok=True)
        for n in os.listdir(ydir):
            if n.endswith(".png"):
                shutil.copyfile(os.path.join(ydir, n), os.path.join(out, "ytown", n))
        with open(os.path.join(ydir, "index.json"), encoding="utf-8") as f:
            manifest["ui"]["ytown"] = json.load(f)
    # The 사신수 길드대항전's battlefields (GEAR_DIR/ywar/ from tools/yeon_war.py: 연's 사신수 공성전
    # castles and the 길림 field, in 1024-pixel pieces, and their walk grids). Loaded when a war starts.
    wdir = os.path.join(gear_src, "ywar") if gear_src else None
    if wdir and os.path.isfile(os.path.join(wdir, "index.json")):
        os.makedirs(os.path.join(out, "ywar"), exist_ok=True)
        for n in os.listdir(wdir):
            if n.endswith(".png"):
                shutil.copyfile(os.path.join(wdir, n), os.path.join(out, "ywar", n))
        with open(os.path.join(wdir, "index.json"), encoding="utf-8") as f:
            manifest["ywar"] = json.load(f)
    tdir = os.path.join(gear_src, "ytitle") if gear_src else None
    if tdir and os.path.isfile(os.path.join(tdir, "title_bg.jpg")):
        shutil.copyfile(os.path.join(tdir, "title_bg.jpg"), os.path.join(out, "ui", "title_bg.jpg"))
        manifest["ui"]["ytitle"] = True

    # 국내성 seen whole (TOWN_DIR/gungnae.png, a labelled overview): the hunting-ground picker's
    # first map, its caves where the city has them.
    if town_src and os.path.isfile(os.path.join(town_src, "gungnae.png")):
        im = Image.open(os.path.join(town_src, "gungnae.png")).convert("RGB")
        im.save(os.path.join(out, "ui", "gungnae.webp"), quality=90)

    # The world maps, for the hunting-ground picker.
    for name in ("world_1", "world_4"):
        p = os.path.join(src, "maps", "world", name + ".bmp")
        if os.path.isfile(p):
            im = Image.open(p).convert("RGB")
            im.save(os.path.join(out, "ui", name + ".webp"), quality=82)
            manifest["ui"][name] = {"w": im.width, "h": im.height}

    if avatar_src and os.path.isdir(avatar_src):
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        import avatar_assets
        coordi = os.path.join(gear_src, "coordi") if gear_src else None
        print("avatar", avatar_assets.build(avatar_src, out, manifest, coordi if coordi and os.path.isdir(coordi) else None))

    if audio_src and os.path.isdir(audio_src):
        # Names of the numbered sounds, when the sound files come with a list of them.
        names = os.path.join(audio_src, "names.json")
        if os.path.isfile(names):
            manifest["audio"]["names"] = json.load(open(names, encoding="utf-8"))
        render_midi(audio_src, out, manifest)
        for kind in ("bgm", "sfx"):
            d = os.path.join(audio_src, kind)
            if not os.path.isdir(d):
                continue
            os.makedirs(os.path.join(out, "audio", kind), exist_ok=True)
            for name in sorted(os.listdir(d)):
                if not name.lower().endswith(AUDIO_EXT):
                    continue
                key = os.path.splitext(name)[0]
                src_file = os.path.join(d, name)
                if shutil.which("ffmpeg") and (name.lower().endswith(".wav") or kind == "bgm"):
                    # Small in an APK: sounds as OGG at their own rate; music as mono 22 kHz OGG.
                    name = key + ".ogg"
                    import subprocess
                    # Music to one loudness (the OST and the MIDI renders differ by 7 dB and more), so a
                    # change of ground does not jump in volume; sounds keep their own levels.
                    extra = (["-af", "loudnorm=I=-18:TP=-1.5:LRA=11", "-ac", "1", "-ar", "22050", "-q:a", "1"]
                             if kind == "bgm" else ["-q:a", "3"])
                    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", src_file, *extra, "-c:a", "libvorbis",
                                    os.path.join(out, "audio", kind, name)], check=True)
                else:
                    shutil.copyfile(src_file, os.path.join(out, "audio", kind, name))
                if kind == "bgm":
                    manifest["audio"]["bgm"].append({"key": key, "file": "audio/bgm/" + name})
                else:
                    manifest["audio"]["sfx"][key] = "audio/sfx/" + name

    # A strip wider than 4096 pixels is more than a phone's graphics can hold as one picture:
    # such effects are folded into rows ("cols" frames to a row).
    for fid, f in manifest["fx"].items():
        if f.get("src") or f["w"] * f["n"] <= 4096:
            continue
        fp = os.path.join(out, "fx", fid + ".png")
        im = Image.open(fp)
        cols = max(1, 4096 // f["w"])
        rows = -(-f["n"] // cols)
        g = Image.new("RGBA", (cols * f["w"], rows * f["h"]))
        for k in range(f["n"]):
            g.paste(im.crop((k * f["w"], 0, (k + 1) * f["w"], f["h"])), ((k % cols) * f["w"], (k // cols) * f["h"]))
        g.save(fp, optimize=True)
        f["cols"] = cols

    with open(os.path.join(out, "manifest.json"), "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, ensure_ascii=False, separators=(",", ":"))
    a = manifest["audio"]
    print(f"fx {len(manifest['fx'])}, monsters {len(manifest['monsters'])}, items {len(manifest['items'])}, "
          f"bgm {len(a['bgm'])}, sfx {len(a['sfx'])}")


if __name__ == "__main__":
    main()
