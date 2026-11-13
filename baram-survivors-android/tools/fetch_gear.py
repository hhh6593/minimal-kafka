#!/usr/bin/env python3
"""Downloads today's client item pictures the gear uses (용무기 제일~제십, the legendary sets).

    fetch_gear.py OUT_DIR

The names come from web/js/items.js (gearPictures, run with node). Each picture is the official
avatar site's item render, https://avatar.baram.nexon.com/Item/Render/<item name> (the address
the xoxd.tistory.com gear guides use), saved as OUT_DIR/<item name>.png. Pass OUT_DIR to
build.sh as GEAR_DIR. Pictures already there are kept.
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


def main():
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    with cf.ThreadPoolExecutor(6) as ex:
        results = list(ex.map(lambda n: fetch(out, n), names()))
    for name, how in results:
        if how not in ("kept", "saved"):
            print(name, how)
    print(f"{sum(h in ('kept', 'saved') for _, h in results)}/{len(results)} pictures in {out}")


if __name__ == "__main__":
    main()
