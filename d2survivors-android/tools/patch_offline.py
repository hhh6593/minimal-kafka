"""Adapt a mirror of d2survivors.lol for the offline Android wrapper.

The site streams the game's Diablo II files from its own server ("hosted
files"); the wrapper's LocalServer keeps the ones the player loads online
(GameFileCache) so they play offline later. The site's other mode, the
player's own files, extracts a Diablo II install into the origin's private
storage. The game gates that mode off on touch-only devices because a phone
browser cannot pick a folder; the wrapper supplies a folder picker, so the
gate is lifted.

The same patches are applied on the device by Updater.java when the app
refreshes its copy of the site; keep the two in step.
"""
import glob
import os
import re
import sys

root = sys.argv[1]


def patch(pattern, regex, repl, done):
    """Applies regex -> repl to the files matching pattern; done matches a patched file."""
    hits = 0
    for path in glob.glob(os.path.join(root, pattern)):
        with open(path, encoding="utf-8") as f:
            text = f.read()
        new, n = re.subn(regex, repl, text)
        if n:
            with open(path, "w", encoding="utf-8") as f:
                f.write(new)
            print(f"patched {os.path.relpath(path, root)}")
        if n or re.search(done, text):
            hits += 1
    if not hits:
        sys.exit(f"pattern not found in {pattern}: {regex}")


# 1. Touch-only devices may use their own files too (the app has a file picker).
patch("assets/game-*.js",
      r"function ([\w$]+)\(\)\{return matchMedia\(`\(pointer: coarse\)`\)\.matches&&!matchMedia\(`\(pointer: fine\)`\)\.matches\}",
      r"function \1(){return!1}",
      r"function [\w$]+\(\)\{return!1\}async function")

# 2. Android WebView exposes showDirectoryPicker but rejects every call, which
#    the setup page reads as the player cancelling: use the file input instead.
patch("assets/setup-*.js",
      r"var ([\w$]+)=\(\)=>window\.showDirectoryPicker;",
      r"var \1=()=>void 0;",
      r"var [\w$]+=\(\)=>void 0;function")

# 3. Android WebView cannot pick a folder: ask for the .mpq files themselves.
#    The setup code already accepts bare file names (no relative paths).
patch("assets/setup-*.js",
      r"([\w$]+)\.webkitdirectory=!0",
      r"\1.webkitdirectory=!1",
      r"\.webkitdirectory=!1")

# 4. A stick whose finger has already lifted (its pointerup came late or never)
#    made the game ignore the next touch. /__app/touch.js tracks the fingers on
#    the screen; a new touch replaces a stick whose finger is gone.
patch("assets/Game-*.js",
      r"if\(([\w$]+)\.pointerType===`touch`\)\{if\(this\.stick\)return;",
      r"if(\1.pointerType===`touch`){if(this.stick){if(window.__d2sTouch?.has(this.stick.id))return;this.dropStick()}",
      r"window\.__d2sTouch\?\.has\(this\.stick\.id\)")

# 5. Drop the Cloudflare analytics beacon; it cannot load offline anyway.
for path in glob.glob(os.path.join(root, "**", "*.html"), recursive=True):
    with open(path, encoding="utf-8") as f:
        text = f.read()
    new = re.sub(r"<script[^>]*cloudflareinsights[^>]*></script>", "", text)
    new = re.sub(r'<script[^>]*src="/cdn-cgi/[^"]*"[^>]*></script>', "", new)
    if new != text:
        with open(path, "w", encoding="utf-8") as f:
            f.write(new)
        print(f"stripped beacon from {os.path.relpath(path, root)}")
