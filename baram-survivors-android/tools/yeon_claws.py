"""백호환령부's strike without the tiger: keeps only the golden claw marks of 연's
skill_effect_transform_backho strip (GEAR_DIR/ygyeok/tf_backho.png), by their colour.

The strike is a leaping white tiger, three golden claw marks, then a roaring tiger's head;
the tiger and its head were bigger than the hero and hid the fight. The claws are the only
orange-gold pixels in it, so a hue mask (grown a few pixels to take in each mark's pale core)
lifts them out with 연's own pixels; the frames after the marks fade (the head) are dropped.
Writes GEAR_DIR/ygyeok/tf_backho_claw.png and its index.json entry (fx g_tf_backho_claw).

    python3 tools/yeon_claws.py GEAR_DIR
"""
import colorsys, json, os, sys
from PIL import Image, ImageFilter

gdir = os.path.join(sys.argv[1], "ygyeok")
idx_path = os.path.join(gdir, "index.json")
idx = json.load(open(idx_path, encoding="utf-8"))
k = idx["tf_backho"]
(w, h), n = k["cell"], k["n"]
src = Image.open(os.path.join(gdir, "tf_backho.png")).convert("RGBA")
KEEP = 12  # frames 0-11: the claws; from 12 on, the roaring head alone
out = Image.new("RGBA", (w * KEEP, h), (0, 0, 0, 0))
for i in range(KEEP):
    f = src.crop((i * w, 0, i * w + w, h))
    px = f.load()
    m = Image.new("L", f.size, 0)
    mp = m.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 20:
                continue
            hh, ss, vv = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if 0.02 < hh < 0.17 and ss > 0.3 and vv > 0.45:
                mp[x, y] = 255
    m = m.filter(ImageFilter.MaxFilter(9))
    alpha = Image.composite(f.split()[3], Image.new("L", f.size, 0), m)
    f.putalpha(alpha)
    out.paste(f, (i * w, 0))
out.save(os.path.join(gdir, "tf_backho_claw.png"), optimize=True)
idx["tf_backho_claw"] = dict(k, n=KEEP, prefab=k.get("prefab", "") + " (claws only)")
json.dump(idx, open(idx_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("tf_backho_claw", KEEP, "frames")
