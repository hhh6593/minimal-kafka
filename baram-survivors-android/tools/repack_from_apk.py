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
    # 연's 격 made again at their own pixels since that APK (GEAR_DIR/ygyeok_hd/, tools/yeon_gyeok_hd.py), over the old
    # (as .png: out of the webp list)
    hd = os.path.join(gear, "ygyeok_hd")
    if os.path.isfile(os.path.join(hd, "index.json")):
        htmp = tempfile.mkdtemp()
        os.makedirs(os.path.join(htmp, "fx"))
        hm = {"fx": {}}
        pa.add_ygyeok(hd, json.load(open(os.path.join(hd, "index.json"), encoding="utf-8")), htmp, hm)
        for fid, v in hm["fx"].items():
            man["fx"][fid] = v
            for ext in (".png", ".webp"):
                if os.path.exists(os.path.join(assets, "fx", fid + ext)):
                    os.remove(os.path.join(assets, "fx", fid + ext))
            shutil.copyfile(os.path.join(htmp, "fx", fid + ".png"), os.path.join(assets, "fx", fid + ".png"))
        man["fxWebp"] = [x for x in man.get("fxWebp", []) if x not in hm["fx"]]
        print(f"replaced {len(hm['fx'])} 격 pictures from ygyeok_hd")
    # 연's spell sheets made again since that APK (GEAR_DIR/yskill_add/: tools/yeon_skills.py with
    # tools/yeon_skill_add.json — 무형지창's was cut before the renderer knew its shader), over the old k_<id> (as .png)
    ya = os.path.join(gear, "yskill_add")
    if os.path.isfile(os.path.join(ya, "index.json")):
        ytmp = tempfile.mkdtemp()
        for d in ("fx", "icon"):
            os.makedirs(os.path.join(ytmp, d))
        ym = {"fx": {}}
        for fid in pa.add_yskill(ya, ytmp, ym):
            man["fx"][fid] = ym["fx"][fid]
            for ext in (".png", ".webp"):
                if os.path.exists(os.path.join(assets, "fx", fid + ext)):
                    os.remove(os.path.join(assets, "fx", fid + ext))
            shutil.copyfile(os.path.join(ytmp, "fx", fid + ".png"), os.path.join(assets, "fx", fid + ".png"))
            shutil.copyfile(os.path.join(ytmp, "icon", fid + ".png"), os.path.join(assets, "icon", fid + ".png"))
        man["fxWebp"] = [x for x in man.get("fxWebp", []) if x not in ym["fx"]]
        print(f"replaced {len(ym['fx'])} 연 spell sheets from yskill_add")
    # Hunting grounds fought on 연's own map made since that APK (GEAR_DIR/yhunt_add/: tools/yeon_grounds.py
    # arena with YHUNT_OUT=GEAR_DIR/yhunt_add — the 9차 사냥터 지형, every 연 ground but the few too small):
    # their pieces into assets/yhunt and their entries over the manifest's.
    ha = os.path.join(gear, "yhunt_add")
    if os.path.isfile(os.path.join(ha, "index.json")):
        os.makedirs(os.path.join(assets, "yhunt"), exist_ok=True)
        add = json.load(open(os.path.join(ha, "index.json"), encoding="utf-8"))
        for gid in add:
            for n in os.listdir(os.path.join(assets, "yhunt")):
                if n.startswith(gid + "_"):
                    os.remove(os.path.join(assets, "yhunt", n))
        # As webp (q 72): the 24 grounds' pieces as png took the APK past what can be sent (429MB, 2026-11-28).
        # The manifest's ext tells hunt.js which.
        from PIL import Image
        for n in sorted(os.listdir(ha)):
            if n.endswith(".png") and n.rsplit("_", 2)[0] in add:
                Image.open(os.path.join(ha, n)).save(os.path.join(assets, "yhunt", n[:-4] + ".webp"), "WEBP", quality=72, method=6)
        for v in add.values():
            v["ext"] = "webp"
        man.setdefault("yhunt", {}).update(add)
        print(f"{len(add)} hunting-ground maps from yhunt_add")
    # Hunting-ground walk grids made again since that APK (tools/yhunt_walk.json, from
    # tools/yeon_grounds.py arena: 화탕지옥's void and cliffs closed, and every ground's since), over the old ones.
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
            # Its icon (연's item icon, tools/yeon_costume.py icons/<id>.png) with it: merged with no icon the
            # 청룡·군주 청룡 심판의낫 showed an old sprite's cut-out in the smith's window (사용자 2026-11-24).
            ic = os.path.join(assets, "ycostume", "i", f"{iid}.png")
            src = os.path.join(add, it["icon"]) if it.get("icon") else None
            if src and os.path.isfile(src):
                os.makedirs(os.path.dirname(ic), exist_ok=True)
                shutil.copyfile(src, ic)
            ci["items"][iid] = [it["kind"], it["name"], it.get("grade", 1), it.get("set") or "", it.get("whole", 0), 1 if os.path.isfile(ic) else 0]
        json.dump(ci, open(cip, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
        print(f"merged {len(ad['items'])} looks from ycostume_add")
    # The battlefields cut again since that APK (GEAR_DIR/ywar_add/: tools/yeon_war.py's ywar/ output — the wider fields
    # of 2026-11-28): each war's chunks and its index entry (size, walk grid) over the old.
    wa = os.path.join(gear, "ywar_add")
    if os.path.isfile(os.path.join(wa, "index.json")):
        wi = json.load(open(os.path.join(wa, "index.json"), encoding="utf-8"))
        wdir = os.path.join(assets, "ywar")
        os.makedirs(wdir, exist_ok=True)
        for war, v in wi.items():
            for n in os.listdir(wdir):
                if n.startswith(war + "_") and n.rsplit(".", 1)[0][len(war) + 1:].replace("_", "").isdigit():
                    os.remove(os.path.join(wdir, n))
            for n in os.listdir(wa):
                if n.startswith(war + "_") and n.endswith(".png") and n[len(war) + 1:-4].replace("_", "").isdigit():
                    # as webp (q 72), as the hunting grounds' above: the APK's size (war.js reads the ext)
                    from PIL import Image
                    Image.open(os.path.join(wa, n)).save(os.path.join(wdir, n[:-4] + ".webp"), "WEBP", quality=72, method=6)
            v["ext"] = "webp"
            man.setdefault("ywar", {})[war] = v
        print(f"replaced {len(wi)} battlefields from ywar_add")
    yzone_add(gear, assets, man)
    json.dump(man, open(mpath, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"replaced {len(old_o)} old 9차 sheets with {len(m['fx'])}")
    # The sheets put in here as png (today's 9차, 격 HD) shrunk as the build does (tools/webp_fx.py): the APK past the
    # 400MB that can be sent otherwise (2026-11-28).
    import subprocess
    subprocess.run([sys.executable, os.path.join(HERE, "webp_fx.py"), assets], check=True)


def yzone_add(gear, assets, man):
    """Grounds and a raid made from 연's maps since that APK (GEAR_DIR/yzone_add/: tools/yeon_grounds.py build
    into it, then arena with YHUNT_OUT=GEAR_DIR/yzone_add/yhunt — 2026-11-28 하월·사휘도 and 신 용궁 탑 레이드):
    its 연 units (as prepare_assets.py gives "own" units: a sheet, a picture and a monster entry), floors,
    props, the grounds' fields (as webp q72, as yhunt_add) and music (as OGG, as prepare_assets.py)."""
    za = os.path.join(gear, "yzone_add")
    if not os.path.isdir(za):
        return
    from PIL import Image
    ud = os.path.join(za, "yunit")
    if os.path.isfile(os.path.join(ud, "index.json")):
        idx = json.load(open(os.path.join(ud, "index.json"), encoding="utf-8"))
        man.setdefault("yunit", {})
        have = {x["id"] for x in man["monsters"]}
        for mid, u in idx.items():
            sheet, nu = pa.repack_unit(os.path.join(ud, mid + ".png"), u)
            if sheet is None:
                continue
            first = nu["anims"].get("idle_down") or nu["anims"].get("walk_down") or next(iter(nu["anims"].values()))
            cw, ch = nu["cell"]
            pic = sheet.crop((0, first["row"] * ch, cw, (first["row"] + 1) * ch))
            pic = pic.crop(pic.getbbox() or (0, 0, cw, ch))
            pic.save(os.path.join(assets, "mon", mid + ".png"), optimize=True)
            sheet.save(os.path.join(assets, "yunit", mid + ".png"), optimize=True)
            nu["foot_w"] = max(10, pic.width // 2)
            man["yunit"][mid] = nu
            if mid not in have:
                man["monsters"].append({"id": mid, "w": pic.width, "h": pic.height, "pages": [], "name": u.get("name", ""),
                                        "quick": int(float(u.get("move") or 0)) >= 96})
        print(f"{len(idx)} 연 units from yzone_add")
    fd = os.path.join(za, "floor_y")
    if os.path.isdir(fd):
        for n in sorted(x for x in os.listdir(fd) if x.endswith(".png")):
            Image.open(os.path.join(fd, n)).convert("RGB").save(os.path.join(assets, "floor", n), optimize=True)
            if n[:-4] not in man.setdefault("floor", []):
                man["floor"].append(n[:-4])
    pd = os.path.join(za, "prop_y")
    if os.path.isfile(os.path.join(pd, "index.json")):
        for name, meta in json.load(open(os.path.join(pd, "index.json"), encoding="utf-8"))["props"].items():
            src = os.path.join(pd, name + ".png")
            if not os.path.isfile(src):
                continue
            im = Image.open(src).convert("RGBA")
            if im.getchannel("A").getextrema()[0] == 255:
                continue  # (a whole square of ground: a map piece, as prepare_assets.py)
            im.save(os.path.join(assets, "prop", name + ".png"), optimize=True)
            man.setdefault("prop", {})[name] = [im.width, im.height, meta.get("terrain"), meta.get("kind")]
    hd = os.path.join(za, "yhunt")
    if os.path.isfile(os.path.join(hd, "index.json")):
        add = json.load(open(os.path.join(hd, "index.json"), encoding="utf-8"))
        os.makedirs(os.path.join(assets, "yhunt"), exist_ok=True)
        for n in sorted(os.listdir(hd)):
            if n.endswith(".png") and n.rsplit("_", 2)[0] in add:
                Image.open(os.path.join(hd, n)).save(os.path.join(assets, "yhunt", n[:-4] + ".webp"), "WEBP", quality=72, method=6)
        for v in add.values():
            v["ext"] = "webp"
        man.setdefault("yhunt", {}).update(add)
        print(f"{len(add)} hunting-ground maps from yzone_add")
    # A new material's icon (연's item sprite, tools/fetch_icons.py yeon_mats + normalise): gicon/ "mat:<id>".
    gd = os.path.join(za, "gicon")
    if os.path.isfile(os.path.join(gd, "index.json")):
        os.makedirs(os.path.join(assets, "gicon"), exist_ok=True)
        for key, fn in json.load(open(os.path.join(gd, "index.json"), encoding="utf-8")).items():
            shutil.copyfile(os.path.join(gd, fn), os.path.join(assets, "gicon", fn))
            man.setdefault("gicon", {})[key] = fn
    bd = os.path.join(za, "audio", "bgm")
    if os.path.isdir(bd):
        import subprocess
        os.makedirs(os.path.join(assets, "audio", "bgm"), exist_ok=True)
        keys = {b["key"] for b in man["audio"]["bgm"]}
        for n in sorted(os.listdir(bd)):
            key = os.path.splitext(n)[0]
            dst = os.path.join(assets, "audio", "bgm", key + ".ogg")
            subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", os.path.join(bd, n), "-af", "loudnorm=I=-18:TP=-1.5:LRA=11",
                            "-ac", "1", "-ar", "22050", "-q:a", "1", "-c:a", "libvorbis", dst], check=True)
            if key not in keys:
                man["audio"]["bgm"].append({"key": key, "file": "audio/bgm/" + key + ".ogg"})


if __name__ == "__main__":
    main()
