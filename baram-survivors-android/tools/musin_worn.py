#!/usr/bin/env python3
"""사신수 무신 방어구 (청룡·백호·주작·현무무신의갑옷, 무신의기운) worn on 연's heroes.

    musin_worn.py fetch GEAR_DIR
    musin_worn.py build GEAR_DIR

연 has no 무신 piece. The original's armour is one design in four colours: dark plate, its spiked
shoulder and arm flares off the body, in the 신수's colour. Here:
  - the body: 연's own plate 천상남자무갑(치장용) (코디 309367, drawn for every class's rig, its frames
    all 연's), its blue plate recoloured to each 신수's (PALS, measured off the original's renders:
    청룡 navy with pale-blue light, 백호 silver-white, 주작 crimson, 현무 black-navy with cyan) — skin,
    outline and gold left alone;
  - the original's own flares (its pixels off the plain figure's body, tools/sinsu_worn.py 'wings'):
    layer aback, the same variant as the outfit, so the outfit brings them (game.js yGearVariants);
  - 무신의기운 (the 망토 slot): the original's aura (its two 신수 heads beside the figure), 'wings' too,
    as a cape layer (behind the body from the front and the side, over the back from behind: 연's
    cape order), AURA_W times the hero across, its dark mass lifted toward the 신수's colour (fit_aura).
Out: GEAR_DIR/musin_worn/<piece>_<class>.png and index.json in sinsu_worn's form
({cls: {piece: {kind, file, cols, cell, foot, side, variant?}}}); prepare_assets.py adds them to the
heroes' layers as "s_<piece>" (or their variant). Uses sinsu_worn.py's fetch and cutting; the
renders are cached in GEAR_DIR/sinsu_worn/raw (shared, kept). Only official pixels: 연's outfit
recoloured, the original's flares and aura scaled and outlined.
"""
import colorsys
import json
import os
import sys
import tempfile
import urllib.parse
import urllib.request

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import sinsu_worn  # noqa: E402

SETS = {'cheong': '청룡', 'baekho': '백호', 'jujak': '주작', 'hyeonmu': '현무'}
OUTFIT = 309367
# 무신의기운: AURA_W times the hero across at its widest (the original's spans four figures and hid
# 연's small heroes in a hunt), scaled about the chest (AURA_CHEST of the hero's height above the
# feet), drawn AURA_ALPHA of solid, its dark mass lifted toward the 신수's colour (AURA_TINT: h, s, v).
# (AURA_W is of the bare body and head, about 21 px; dressed, a hero is some 26: 2.3 is about 1.9 of it.)
AURA_W, AURA_CHEST, AURA_ALPHA = 2.3, 0.6, 215
AURA_TINT = {'cheong': (0.62, 0.65, 0.62), 'baekho': (0.62, 0.08, 0.8), 'jujak': (0.985, 0.8, 0.7), 'hyeonmu': (0.5, 0.7, 0.55)}
# 연's heroes stand about 46 px feet to crown; the flares are kept from 40% of that up (the hips).
HERO_H, CUT_LOW = 46, 0.4


def items():
    out = {}
    for s, n in SETS.items():
        out[f'musin_flare_{s}'] = {'item': f'{n}무신의갑옷(남)', 'mode': 'wings'}
        out[f'musin_aura_{s}'] = {'item': f'{n}무신의기운', 'mode': 'wings'}
    return out


def fetch(gear):
    cfg = os.path.join(tempfile.mkdtemp(), 'musin.json')
    json.dump(items(), open(cfg, 'w', encoding='utf-8'), ensure_ascii=False)
    sinsu_worn.fetch(gear, cfg)
    # the pieces' official pictures (GEAR_DIR/<name>.png, as fetch_gear.py keeps them)
    for c in items().values():
        path = os.path.join(gear, c['item'] + '.png')
        if os.path.exists(path):
            continue
        with urllib.request.urlopen(sinsu_worn.RENDER + urllib.parse.quote(c['item']), timeout=40) as r:
            data = r.read()
        if data.startswith(b'\x89PNG'):
            open(path, 'wb').write(data)
            print(path, len(data))


def pal_pixel(s, h, sa, v):
    """A blue plate pixel (hue, sat, value) in the 신수's colours."""
    if s == 'cheong':  # navy plate, pale blue light
        return 0.66 - 0.06 * v, min(1, sa * 1.25), v * (0.75 + 0.3 * v)
    if s == 'baekho':  # silver-white
        return 0.62, sa * 0.18, min(1, 0.3 + 0.75 * v ** 0.8)
    if s == 'jujak':  # crimson
        return 0.985, min(1, 0.55 + sa * 1.2), min(1, v * 1.05)
    if s == 'hyeonmu':  # black-navy, cyan light
        return 0.70 - 0.15 * v ** 2, min(1, sa * 1.3 + 0.1 * v), v * (0.6 + 0.45 * v)
    raise KeyError(s)


def recolour(a, s):
    out = a.copy()
    m = a[..., 3] > 0
    ys, xs = np.nonzero(m)
    for y, x in zip(ys, xs):
        r, g, b = (a[y, x, :3] / 255.0)
        h, sa, v = colorsys.rgb_to_hsv(r, g, b)
        if 0.55 <= h <= 0.80 and sa > 0.12:
            nh, ns, nv = pal_pixel(s, h, sa, v)
            out[y, x, :3] = [round(c * 255) for c in colorsys.hsv_to_rgb(nh % 1, max(0, ns), max(0, min(1, nv)))]
    return out


def hero_width(gear, H):
    """연's hero across, standing facing down: its body and head layers together."""
    a = H['anims']['idle_down']
    x0 = x1 = None
    for kind in ('body', 'head'):
        meta = H['layers'].get(kind, {}).get('base')
        if not meta:
            continue
        im = Image.open(os.path.join(gear, 'yhero2', meta['file'])).convert('RGBA')
        cw, ch = meta.get('cell', H['cell'])
        fx = meta.get('foot', H['foot'])[0]
        bb = im.crop((0, a['row'] * ch, cw, (a['row'] + 1) * ch)).getbbox()
        if bb:
            x0 = bb[0] - fx if x0 is None else min(x0, bb[0] - fx)
            x1 = bb[2] - fx if x1 is None else max(x1, bb[2] - fx)
    return (x1 - x0) if x0 is not None else 26


def aura_pixel(s, r, g, b):
    """The aura's dark mass lifted toward its 신수's colour (a 기운, not a black blot)."""
    h, sa, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
    th, ts, tv = AURA_TINT[s]
    if s == 'baekho':  # silver mist: the original's black and grey lifted to pale grey
        return colorsys.hsv_to_rgb(th, min(sa, 0.12) + 0.06, 0.38 + 0.6 * v)
    lift = max(0.0, 1 - v / 0.55)  # the darker, the more of the 신수's colour
    nh = th if sa < 0.25 else h
    return colorsys.hsv_to_rgb(nh, max(sa, ts * lift + sa * (1 - lift)), max(v, tv * lift + v * (1 - lift)))


def fit_aura(path, meta, s, hero_w):
    """The aura drawn AURA_W times the hero across, about its chest (behind the shoulders, not
    round the feet), lifted toward the 신수's colour and a little see-through. Returns its scale."""
    im = Image.open(path).convert('RGBA')
    cw, ch = meta['cell']
    fx, fy = meta['foot']
    cy = fy - AURA_CHEST * HERO_H
    widths = []
    for y0 in range(0, im.height, ch):
        bb = im.crop((0, y0, cw, y0 + ch)).getbbox()
        if bb:
            widths.append(bb[2] - bb[0])
    k = min(1.0, AURA_W * hero_w / max(widths)) if widths else 1.0
    out = Image.new('RGBA', im.size)
    for y0 in range(0, im.height, ch):
        for x0 in range(0, im.width, cw):
            c = np.asarray(im.crop((x0, y0, x0 + cw, y0 + ch)))
            if not (c[..., 3] > 0).any():
                continue
            sc = np.asarray(sinsu_worn.touch_up(sinsu_worn.scaled(c, k), 'wings')).copy()
            m = sc[..., 3] > 0
            outline = m & (sc[..., :3].astype(int).sum(-1) <= 22 + 18 + 26)
            ys, xs = np.nonzero(m & ~outline)
            for y, x in zip(ys, xs):
                sc[y, x, :3] = [round(255 * v) for v in aura_pixel(s, *(int(q) for q in sc[y, x, :3]))]
            sc[..., 3] = np.where(m, AURA_ALPHA, 0)
            # scaled about the chest (touch_up added a one-pixel margin)
            ox, oy = round(fx - fx * k) - 1, round(cy - cy * k) - 1
            out.alpha_composite(Image.fromarray(sc), (x0 + ox, y0 + oy))
    out.save(path, optimize=True)
    return k


def cut_low(path, meta):
    """The flares above the hips only: the original's forearm spikes swing down past 연's short legs
    in a walk and would hang by the feet (CUT_LOW of the hero's height above the feet stays clear)."""
    im = np.asarray(Image.open(path).convert('RGBA')).copy()
    cw, ch = meta['cell']
    fx, fy = meta['foot']
    low = round(CUT_LOW * HERO_H)
    for y0 in range(0, im.shape[0], ch):
        im[y0 + fy - low:y0 + ch, :, 3] = 0
    Image.fromarray(im).save(path, optimize=True)


def build(gear):
    root = os.path.join(gear, 'musin_worn')
    os.makedirs(root, exist_ok=True)
    cfg = os.path.join(tempfile.mkdtemp(), 'musin.json')
    json.dump(items(), open(cfg, 'w', encoding='utf-8'), ensure_ascii=False)
    sinsu_worn.build(gear, cfg, root)
    ip = os.path.join(root, 'index.json')
    index = json.load(open(ip, encoding='utf-8'))
    ci = json.load(open(os.path.join(gear, 'ycostume', 'index.json'), encoding='utf-8'))
    done = {}
    H2 = json.load(open(os.path.join(gear, 'yhero2', 'index.json'), encoding='utf-8'))
    widths = {}

    def hero_w(cls):
        if cls not in widths:
            widths[cls] = hero_width(gear, H2[cls])
        return widths[cls]
    for cls, ps in index.items():
        for s in SETS:
            fl = ps.get(f'musin_flare_{s}')
            if fl:  # the original's flares come with the outfit (same variant)
                fl['kind'] = 'aback'
                fl['variant'] = f's_musin_armor_{s}'
                cut_low(os.path.join(root, os.path.basename(fl['file'])), fl)
            au = ps.get(f'musin_aura_{s}')
            if au:
                au['kind'] = 'cape'
                au['side'] = []  # 연's own cape order (the class's z)
                au['k'] = round(fit_aura(os.path.join(root, os.path.basename(au['file'])), au, s, hero_w(cls)), 3)
            om = ci['layers'].get(cls, {}).get('armor', {}).get(f'c{OUTFIT}')
            if not om:
                continue
            src = os.path.join(gear, 'ycostume', om['file'])
            fname = f'musin_armor_{s}_' + os.path.splitext(os.path.basename(om['file']))[0].replace('armor_', '') + '.png'
            if (src, s) not in done:
                a = np.asarray(Image.open(src).convert('RGBA'))
                Image.fromarray(recolour(a, s)).save(os.path.join(root, fname), optimize=True)
                done[(src, s)] = fname
            ps[f'musin_armor_{s}'] = {'kind': 'armor', 'file': 'sinsu/' + done[(src, s)], 'cols': om['cols'],
                                      'cell': om['cell'], 'foot': om['foot'], 'side': om.get('side') or []}
            print(cls, s, done[(src, s)])
    json.dump(index, open(ip, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    {'fetch': fetch, 'build': build}[sys.argv[1]](*sys.argv[2:])
