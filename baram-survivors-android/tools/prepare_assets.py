#!/usr/bin/env python3
"""Turns the downloaded old-Baram images (and optional sound files) into the game's assets.

    prepare_assets.py IMAGES_DIR OUT_DIR [AUDIO_DIR] [AVATAR_DIR] [TOWN_DIR] [SKILL_FX_DIR] [MODERN_DIR]

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
    best = max(frames, key=richness)
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
    return out


def strip(frames):
    w, h = frames[0].size
    out = Image.new("RGBA", (w * len(frames), h))
    for i, f in enumerate(frames):
        out.paste(f, (i * w, 0))
    return out


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
    pages = json.load(open(os.path.join(src, "_pages.json"), encoding="utf-8"))
    dups = json.load(open(os.path.join(src, "_duplicates.json"), encoding="utf-8"))
    for d in ("fx", "icon", "mon", "item", "hero", "ui"):
        os.makedirs(os.path.join(out, d), exist_ok=True)
    manifest = {"fx": {}, "monsters": [], "items": {}, "heroes": [], "ui": {}, "audio": {"bgm": [], "sfx": {}}}

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
            frames = unframe(frames)
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
            frames = unwhite(frames)
            strip(frames).save(os.path.join(out, "fx", fid + ".png"), optimize=True)
            manifest["fx"][fid] = {"w": frames[0].width, "h": frames[0].height, "n": len(frames),
                                   "durs": [90] * len(frames), "add": False, "cls": "modern"}

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
        print("avatar", avatar_assets.build(avatar_src, out, manifest))

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
                    extra = ["-ac", "1", "-ar", "22050", "-q:a", "1"] if kind == "bgm" else ["-q:a", "3"]
                    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", src_file, *extra, "-c:a", "libvorbis",
                                    os.path.join(out, "audio", kind, name)], check=True)
                else:
                    shutil.copyfile(src_file, os.path.join(out, "audio", kind, name))
                if kind == "bgm":
                    manifest["audio"]["bgm"].append({"key": key, "file": "audio/bgm/" + name})
                else:
                    manifest["audio"]["sfx"][key] = "audio/sfx/" + name

    with open(os.path.join(out, "manifest.json"), "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, ensure_ascii=False, separators=(",", ":"))
    a = manifest["audio"]
    print(f"fx {len(manifest['fx'])}, monsters {len(manifest['monsters'])}, items {len(manifest['items'])}, "
          f"bgm {len(a['bgm'])}, sfx {len(a['sfx'])}")


if __name__ == "__main__":
    main()
