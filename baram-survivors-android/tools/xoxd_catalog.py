#!/usr/bin/env python3
"""Parses the community dress room's item catalog into names by category.

    xoxd_catalog.py PAGE.html [OUT.json]

PAGE.html: a saved copy of https://xoxd.tistory.com/2083 (the style room). Its script holds the
avatar server's whole item list as JS objects (itemData, newItems, luxuryItems,
luxuryCollectionItems: {category: [item name, ...]}). Only the names are kept, merged by category
(weapon, armor, cape, shield, shoes, helmet, accessories ...), sorted and de-duplicated, written to
OUT.json (default tools/item_catalog.json). The names are what
https://avatar.baram.nexon.com/Item/Render/<name> renders (tools/fetch_icons.py looks names up here).
"""
import json
import os
import re
import sys

OBJECTS = ("itemData", "newItems", "luxuryItems", "luxuryCollectionItems")


def object_text(src, name):
    """The `{...}` literal after `const name =`, by brace matching (strings respected)."""
    m = re.search(r"const\s+" + name + r"\s*=\s*\{", src)
    if not m:
        return None
    i, depth, q, esc = m.end() - 1, 0, None, False
    for j in range(i, len(src)):
        ch = src[j]
        if q:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == q:
                q = None
        elif ch in "\"'`":
            q = ch
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return src[i:j + 1]
    return None


def tokens(text):
    """The literal's tokens: ('s', string), ('w', bare word), or a punctuation character."""
    i, n = 0, len(text)
    while i < n:
        ch = text[i]
        if ch in "\"'`":
            j, buf = i + 1, []
            while j < n and text[j] != ch:
                if text[j] == "\\" and j + 1 < n:
                    j += 1
                buf.append(text[j])
                j += 1
            yield ("s", "".join(buf))
            i = j + 1
        elif ch == "/" and text[i:i + 2] == "//":
            i = text.find("\n", i)
            i = n if i < 0 else i
        elif ch == "/" and text[i:i + 2] == "/*":
            i = text.find("*/", i)
            i = n if i < 0 else i + 2
        elif ch.isalnum() or ch in "_$":
            j = i
            while j < n and (text[j].isalnum() or text[j] in "_$"):
                j += 1
            yield ("w", text[i:j])
            i = j
        elif ch.isspace():
            i += 1
        else:
            yield ch
            i += 1


def parse(text):
    """{key: [strings]}: every string in an array, under the nearest object key above it
    (the outermost category key, so a nested group's items land in its category)."""
    out, stack, key, top = {}, [], None, None
    toks = list(tokens(text))
    for t, nxt in zip(toks, toks[1:] + [None]):
        if t == "{" or t == "[":
            stack.append((t, top))
        elif t == "}" or t == "]":
            if stack:
                _, top = stack.pop()
        elif isinstance(t, tuple):
            if nxt == ":":
                key = t[1]
                if sum(1 for s, _ in stack if s == "{") == 1:
                    top = key
            elif t[0] == "s" and any(s == "[" for s, _ in stack):
                out.setdefault(top or key, []).append(t[1])
    return out


def main():
    src = open(sys.argv[1], encoding="utf-8").read()
    dst = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "item_catalog.json")
    cats = {}
    for name in OBJECTS:
        t = object_text(src, name)
        if not t:
            print("missing:", name)
            continue
        for k, v in parse(t).items():
            cats.setdefault(k, set()).update(n.strip() for n in v if n.strip())
    data = {k: sorted(v) for k, v in sorted(cats.items())}
    with open(dst, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=0)
    print({k: len(v) for k, v in data.items()})


if __name__ == "__main__":
    main()
