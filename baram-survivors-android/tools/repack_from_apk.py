#!/usr/bin/env python3
"""Rebuild the game's www from an earlier APK's processed assets plus today's code and 9차 sheets.

    repack_from_apk.py OLD_APK_ASSETS_WWW GEAR_DIR OUT_WWW

When the build's inputs (the image download, 연's decrypted bundles and everything cut from them) are
not at hand — e.g. a fresh machine — an earlier APK already holds them all, processed. This takes its
assets/www (unzipped), puts today's web/ (js, index.html, fonts) over it, and replaces the 9차 sheets
(fx "o_*" and their icons) with the ones in GEAR_DIR/s9fx (tools/s9_fx.py, then tools/s9_stamps.py),
exactly as prepare_assets.py add_s9 would. Then build.sh's packaging steps make the APK
(tools/repack_apk.sh).
"""
import json
import os
import shutil
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import prepare_assets as pa  # noqa: E402


def main():
    old, gear, out = sys.argv[1:4]
    web = os.path.join(os.path.dirname(HERE), "web")
    if os.path.exists(out):
        shutil.rmtree(out)
    shutil.copytree(old, out)
    for name in os.listdir(web):
        src, dst = os.path.join(web, name), os.path.join(out, name)
        if os.path.isdir(src):
            shutil.rmtree(dst, ignore_errors=True)
            shutil.copytree(src, dst)
        else:
            shutil.copyfile(src, dst)
    assets = os.path.join(out, "assets")
    mpath = os.path.join(assets, "manifest.json")
    man = json.load(open(mpath, encoding="utf-8"))
    # the old 9차 sheets out
    old_o = [k for k in man["fx"] if k.startswith("o_")]
    for k in old_o:
        man["fx"].pop(k)
        for d, ext in (("fx", ".png"), ("fx", ".webp"), ("icon", ".png")):
            p = os.path.join(assets, d, k + ext)
            if os.path.exists(p):
                os.remove(p)
    man["fxWebp"] = [x for x in man.get("fxWebp", []) if not x.startswith("o_")]
    # today's, as add_s9 makes them (only s9fx: s9yfx stays as it was)
    tmp = tempfile.mkdtemp()
    os.makedirs(os.path.join(tmp, "s9fx"))
    for n in os.listdir(os.path.join(gear, "s9fx")):
        s = os.path.join(gear, "s9fx", n)
        (shutil.copytree if os.path.isdir(s) else shutil.copyfile)(s, os.path.join(tmp, "s9fx", n))
    otmp = tempfile.mkdtemp()
    for d in ("fx", "icon", "skillicon"):
        os.makedirs(os.path.join(otmp, d))
    m = {"fx": {}}
    icon_dirs = pa.add_s9(tmp, otmp, m)
    for fid, v in m["fx"].items():
        man["fx"][fid] = v
        shutil.copyfile(os.path.join(otmp, "fx", fid + ".png"), os.path.join(assets, "fx", fid + ".png"))
        shutil.copyfile(os.path.join(otmp, "icon", fid + ".png"), os.path.join(assets, "icon", fid + ".png"))
    man.setdefault("skillicon", [])
    for idir in icon_dirs:
        for n in sorted(x for x in os.listdir(idir) if x.endswith(".png")):
            shutil.copyfile(os.path.join(idir, n), os.path.join(assets, "skillicon", n))
            if n[:-4] not in man["skillicon"]:
                man["skillicon"].append(n[:-4])
    # Hunting-ground walk grids made again since that APK (tools/yhunt_walk.json, from
    # tools/yeon_grounds.py arena: 화탕지옥's void and cliffs closed), over the old ones.
    fix = json.load(open(os.path.join(HERE, "yhunt_walk.json"), encoding="utf-8"))
    for gid, v in fix.items():
        old_g = man.get("yhunt", {}).get(gid)
        if old_g and (old_g["cols"], old_g["rows"]) == (v["cols"], v["rows"]):
            old_g["walk"], old_g["start"] = v["walk"], v["start"]
            print(f"walk grid of {gid} replaced")
    # Looks made since that APK (GEAR_DIR/ycostume_add/: tools/yeon_costume.py's output for a few items, e.g. the
    # 청룡·군주 청룡 심판의낫 치장용 on every class — COSTUME_ALL_CLASSES=1 COSTUME_CAST_BARE=1 COSTUME_IDS=…), merged into
    # the www's ycostume/index.json as prepare_assets.py does (sheets under yhero2/c/).
    add = os.path.join(gear, "ycostume_add")
    cip = os.path.join(assets, "ycostume", "index.json")
    if os.path.isfile(os.path.join(add, "index.json")) and os.path.isfile(cip):
        ci, ad = json.load(open(cip, encoding="utf-8")), json.load(open(os.path.join(add, "index.json"), encoding="utf-8"))
        fidx = {f[0]: n for n, f in enumerate(ci["files"])}
        for cls_id, kinds in ad["layers"].items():
            for kind, variants in kinds.items():
                for v, meta in variants.items():
                    fn = "c/" + os.path.basename(meta["file"])
                    if fn not in fidx:
                        shutil.copyfile(os.path.join(add, meta["file"]), os.path.join(assets, "yhero2", fn))
                        fidx[fn] = len(ci["files"])
                        ci["files"].append([fn, meta["cols"]] + meta["cell"] + meta["foot"] + ([meta["side"]] if meta.get("side") else []))
                    ci["layers"].setdefault(cls_id, {}).setdefault(kind, {})[v] = fidx[fn]
        for iid, it in ad["items"].items():
            ci["items"][iid] = [it["kind"], it["name"], it.get("grade", 1), it.get("set") or "", it.get("whole", 0), 0]
        json.dump(ci, open(cip, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
        print(f"merged {len(ad['items'])} looks from ycostume_add")
    json.dump(man, open(mpath, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"replaced {len(old_o)} old 9차 sheets with {len(m['fx'])}")


if __name__ == "__main__":
    main()
