import re, sys, os, urllib.request, urllib.error, urllib.parse, concurrent.futures as cf
BASE = "https://d2survivors.lol/"
OUT = sys.argv[1]
SKIP = ("/d2/", "/download/", "/api/", "/next/", "/cdn-cgi/")
seeds = ["", "play/", "play/setup.html", "faq/", "legal/", "privacy/", "leaderboards/",
         "sw.js", "manifest.json", "favicon-32.png", "favicon-48.png", "icon-512.png",
         "apple-touch-icon.png", "favicon.ico", "robots.txt", "site.json", "changelog.json"]
REF = re.compile(r'''(?:src|href|content)=["']([^"'#]+)["']|url\(\s*["']?([^"')]+)["']?\s*\)|["'`]((?:\.{0,2}/)?(?:[\w@~.-]+/)*[\w@~.-]+\.(?:js|mjs|css|json|wasm|png|webp|jpg|svg|woff2?|ttf|otf|m4a|wav|txt|html|ico|webmanifest))(?:\?[^"'`]*)?["'`]''')
def local(u):
    p = urllib.parse.unquote(urllib.parse.urlparse(u).path)
    if p.endswith("/"): p += "index.html"
    return os.path.join(OUT, p.lstrip("/"))
def get(u):
    err = None
    for attempt in range(3):
        try:
            r = urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"}), timeout=60)
            return u, r.read(), r.headers.get("content-type", ""), None
        except urllib.error.HTTPError as e:
            return u, None, "", str(e)  # a guessed path that isn't there
        except Exception as e:
            err = str(e)  # dropped connection: try again
    return u, None, "", err
seen, missing, ok = set(), [], []
frontier = [BASE + s for s in seeds]
with cf.ThreadPoolExecutor(32) as ex:
    while frontier:
        batch = []
        for u in frontier:
            u = urllib.parse.urldefrag(u)[0].split("?")[0]
            if u in seen or not u.startswith(BASE): continue
            if any(urllib.parse.urlparse(u).path.startswith(s) for s in SKIP): continue
            seen.add(u); batch.append(u)
        frontier = []
        for u, data, ct, err in ex.map(get, batch):
            if err:
                missing.append((u, err)); continue
            ok.append(u)
            f = local(u); os.makedirs(os.path.dirname(f), exist_ok=True); open(f, "wb").write(data)
            if any(t in ct for t in ("html", "javascript", "css", "json")) or f.endswith((".js", ".css", ".html", ".json", ".mjs")):
                text = data.decode("utf-8", "replace")
                for m in REF.finditer(text):
                    ref = next(g for g in m.groups() if g)
                    if ref.startswith(("data:", "mailto:", "blob:", "javascript:")): continue
                    frontier.append(urllib.parse.urljoin(u, ref))
                    if f.endswith((".js", ".mjs")) and not ref.startswith(("/", ".", "http")):
                        frontier += [BASE + ref, BASE + "assets/" + ref, BASE + "play/" + ref]
        print("round:", len(batch), "fetched so far", len(ok), flush=True)
print("fetched", len(ok))
for m in missing:
    if "404" not in m[1]: print("ERR", m)
print("404s:", sum("404" in m[1] for m in missing))
failed = [m for m in missing if "HTTP Error" not in m[1] and "control characters" not in m[1]]
if failed:
    sys.exit(f"{len(failed)} files failed to download; run again")
open(os.path.join(os.path.dirname(OUT), "mirror-404s.txt"), "w").write("\n".join(m[0] for m in missing))
