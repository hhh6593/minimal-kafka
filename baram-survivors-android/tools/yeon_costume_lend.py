"""yeon_costume_lend.py WWW ADD_DIR CLS[,CLS..] ID[,ID..]: a 공용 무기 look drawn on the warrior's rig (ADD_DIR/index.json layers.warrior
weapon/wback "c<id>") laid on another rig's frames by the pose's name: frame f of the class's anim takes the warrior's
frame of the same anim at the same share of its length (the 격투가's cast and attack rows are swapped against the
warrior's, its attack and the 궁사's have 4 frames to the warrior's 3). Sheets written to ADD_DIR/s, layers added to
ADD_DIR/index.json, the item's classes extended. Only cuts and copies 연's own drawn frames. SRC (env): the class whose
layer is lent (default warrior; 주작선장 309203 has it on the 마도사, the same rig)."""
import json
import os
import sys
from PIL import Image

www, add, clss, ids = sys.argv[1], sys.argv[2], sys.argv[3].split(','), sys.argv[4].split(',')
man = json.load(open(os.path.join(www, 'assets', 'manifest.json')))
ip = os.path.join(add, 'index.json')
ad = json.load(open(ip))
WA = man['yhero2']['warrior']['anims']
done = {}
for iid in ids:
    for kind in ('weapon', 'wback'):
        src = ad['layers'].get(os.environ.get('SRC', 'warrior'), {}).get(kind, {}).get('c' + iid)
        if not src:
            continue
        im = Image.open(os.path.join(add, src['file'])).convert('RGBA')
        cw, ch = src['cell']
        scol = src['cols']
        for cls in clss:
            CA = man['yhero2'][cls]['anims']
            nrow = max(a['row'] for a in CA.values()) + 1
            ncol = max(a['n'] for a in CA.values())
            out = Image.new('RGBA', (cw * ncol, ch * nrow))
            side = [''] * nrow
            for name, a in CA.items():
                w = WA.get(name)
                if not w:
                    continue
                s = ''
                for f in range(a['n']):
                    g = min(w['n'] - 1, f * w['n'] // a['n'])
                    x, y = (g % scol) * cw, (w['row'] + g // scol) * ch
                    out.alpha_composite(im.crop((x, y, x + cw, y + ch)), (f * cw, a['row'] * ch))
                    ss = (src.get('side') or [''] * 99)[w['row']] if src.get('side') else ''
                    s += ss[g] if g < len(ss) else '.'
                side[a['row']] = s
            fn = f's/{kind}_{iid}_lend_{cls}.webp'
            out.save(os.path.join(add, fn), 'WEBP', lossless=True)
            meta = {'file': fn, 'cols': ncol, 'cell': [cw, ch], 'foot': src['foot']}
            if src.get('side'):
                meta['side'] = side
            ad['layers'].setdefault(cls, {}).setdefault(kind, {})['c' + iid] = meta
            if kind == 'weapon':
                it = ad['items'][iid]
                if cls not in it['classes']:
                    it['classes'].append(cls)
                done.setdefault(cls, 0)
                done[cls] += 1
json.dump(ad, open(ip, 'w'), ensure_ascii=False)
print('lent', done)
