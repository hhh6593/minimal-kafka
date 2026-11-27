#!/usr/bin/env python3
"""최종 방패 다섯 종의 외형: 바람의나라(클래식) 공식 아바타 서버가 그린 '방패를 든 모습'에서 방패만 떼어
연 몸틀(전사 몸틀: 전사·도적·주술사·도사)의 손에 옮겨 단 코디 방패 레이어.

    baram_shield_worn.py WWW BASE_ADD OUT_ADD DL_DIR [--no-fetch]

WWW: 게임 www(assets/manifest.json의 yhero2, assets/yhero2/, assets/ycostume/index.json).
BASE_ADD: 지금의 GEAR_DIR/ycostume_add (tools/yeon_costume.py 출력 형식) — 통째로 OUT_ADD에 복사한 뒤 다섯 방패를 더한다
(잃는 것 없음). DL_DIR: 받은 그림을 두는 곳(그림은 git에 넣지 않는다; 없으면 받는다).

받는 그림 (넥슨 공식, avatar.baram.nexon.com):
  Coordi/RenderAvatar/M?sc=&mt=0&bt=0&ha=0&cd=<0 뒤|2 앞|3 왼쪽>&pi=<이름>  — 그 방패를 든 맨몸 아바타, 서기
  같은 주소에 pi 없이                                                      — 맨몸 (차이 = 방패 픽셀, 몸에 가린 곳 포함)
  같은 주소에 pi=사각방패                                                  — 손 위치의 기준 (연에도 같은 사각방패 7202가 있다)
  Item/Render/<이름>                                                       — 아이템 그림 (아이콘)

옮기는 법 (그리기 없음: 자르기·옮기기·크기 맞춤만):
  1. 방향마다(연 _down=앞 cd2, _up=뒤 cd0, _side=왼쪽 cd3 — 연 옆 줄은 왼쪽을 보고, 오른쪽은 게임이 좌우로 뒤집음)
     방패 든 그림 − 맨몸 그림 = 방패 조각, 사각방패 든 그림 − 맨몸 = 기준 사각방패 조각.
  2. 크기: 클래식 몸·사각방패와 연 몸·사각방패의 비 SCALE(0.55: 사각방패 높이 40→22, 몸 82→46).
  3. 자리: 연 사각방패(전사 shield 7202)의 그 프레임 상자 가운데 + SCALE × (클래식 방패 가운데 − 클래식 사각방패 가운데).
     즉 클래식에서 손(사각방패)에 대해 방패가 있는 자리를 그대로, 연의 손이 프레임마다 움직이는 대로 따라간다.
     (연 사각방패가 안 그려지는 프레임 — 뒤로 서기 — 는 같은 방향 걷기 첫 프레임의 손.)
  4. 몸 앞/뒤(side): 바꾸기 전 연 코디 방패(PAIR)가 그 프레임에 쓰던 그대로. 기술 시전·쓰러짐 줄은 그리지 않는다(PAIR와 같음).

출력: OUT_ADD/s/shield_<id>_warrior.webp, OUT_ADD/icons/<id>.png, OUT_ADD/index.json (items·layers에 더함).
"""
import hashlib
import io
import json
import os
import shutil
import subprocess
import sys
import urllib.parse

from PIL import Image

# (새 코디 id, 게임 안 이름, 공식 아이템 이름, 바꾸기 전 연 코디 방패 id — 몸 앞/뒤를 빌림)
SHIELDS = [
    (9991063, '브리트라한의방패', '브리트라한의방패9성', 803916),
    (9991034, '금린방패', '금린방패10성', 9988242),
    (9991102, '환인방패', "환인방패'1성", 804054),
    (9991031, '고대마령의방패', '고대마령의방패10성', 309353),
    (9991101, '환웅의방패', "환웅의방패'9성", 309360),
]
CLASSES = ['warrior', 'rogue', 'mage', 'poet']  # 방패를 드는 직업 (모두 전사 몸틀)
REF = '사각방패'  # 두 게임에 다 있는 방패: 손 위치의 기준
YEON_REF = '7202'  # 연 전사의 사각방패 레이어
SCALE = 0.55
CD = {'down': 2, 'up': 0, 'side': 3}
HOST = 'https://avatar.baram.nexon.com'


def q(name):
    return urllib.parse.quote(name.replace(':', '＃').replace('?', '？').replace('.', '′'))


def fetch(url, out):
    if os.path.exists(out) and os.path.getsize(out) > 0:
        return
    r = subprocess.run(['curl', '-s', '-f', '-o', out, url])
    if r.returncode:
        raise SystemExit(f'받기 실패: {url}')


def worn(dl, key, cd):
    return Image.open(os.path.join(dl, f'{key}_{cd}.png')).convert('RGBA')


def cut(a, bare):
    """a에서 맨몸과 다른 픽셀만 (방패 조각)."""
    out = Image.new('RGBA', a.size)
    pa, pb, po = a.load(), bare.load(), out.load()
    for y in range(a.height):
        for x in range(a.width):
            if pa[x, y] != pb[x, y] and pa[x, y][3]:
                po[x, y] = pa[x, y]
    return out


def center(bb):
    return ((bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2)


def shrink(im):
    w, h = max(1, round(im.width * SCALE)), max(1, round(im.height * SCALE))
    s = im.convert('RGBa').resize((w, h), Image.LANCZOS).convert('RGBA')
    px = s.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            # 도트 그림처럼 가장자리를 또렷하게 (반투명 번짐이 몸 위에서 비쳐 보이지 않게)
            px[x, y] = (r, g, b, 255) if a >= 100 else (0, 0, 0, 0)
    return s


def main():
    www, base, out, dl = sys.argv[1:5]
    do_fetch = '--no-fetch' not in sys.argv
    A = os.path.join(www, 'assets')
    man = json.load(open(os.path.join(A, 'manifest.json'), encoding='utf-8'))
    ci = json.load(open(os.path.join(A, 'ycostume', 'index.json'), encoding='utf-8'))
    H = man['yhero2']['warrior']
    cw, ch = H['cell']
    fx, fy = H['foot']
    os.makedirs(dl, exist_ok=True)
    keys = {'bare': '', 'ref': REF}
    keys.update({str(i): n for i, _, n, _ in SHIELDS})
    if do_fetch:
        for key, name in keys.items():
            for cd in sorted(set(CD.values())):
                fetch(f'{HOST}/Coordi/RenderAvatar/M?sc=&mt=0&bt=0&ha=0&cd={cd}&pi={q(name)}', os.path.join(dl, f'{key}_{cd}.png'))
        for i, _, name, _ in SHIELDS:
            fetch(f'{HOST}/Item/Render/{q(name)}', os.path.join(dl, f'icon_{i}.png'))

    # the base, whole
    if os.path.exists(out):
        shutil.rmtree(out)
    shutil.copytree(base, out)
    ip = os.path.join(out, 'index.json')
    ad = json.load(open(ip, encoding='utf-8'))

    # 연's hand: the 사각방패's box centre per frame (cell coords)
    rim = Image.open(os.path.join(A, 'yhero2', H['layers']['shield'][YEON_REF]['file'])).convert('RGBA')
    hand = {}
    for name, a in H['anims'].items():
        for f in range(a['n']):
            bb = rim.crop((f * cw, a['row'] * ch, (f + 1) * cw, (a['row'] + 1) * ch)).getbbox()
            if bb:
                hand[(name, f)] = center(bb)
    for name, a in H['anims'].items():
        d = name.split('_')[-1]
        for f in range(a['n']):
            if (name, f) not in hand and f'walk_{d}' in H['anims']:
                hand[(name, f)] = hand.get((f'walk_{d}', 0))

    # 클래식: 방향마다 기준 사각방패 가운데
    ref_c = {}
    for cd in set(CD.values()):
        bare = worn(dl, 'bare', cd)
        ref_c[cd] = center(cut(worn(dl, 'ref', cd), bare).getbbox())

    rows = sorted(H['anims'], key=lambda k: H['anims'][k]['row'])
    nrow = max(H['anims'][k]['row'] for k in rows) + 1
    ncol = max(H['anims'][k]['n'] for k in rows)
    for iid, gname, oname, pair in SHIELDS:
        pmeta = ci['files'][ci['layers']['warrior']['shield']['c%d' % pair]]
        pside = pmeta[6]
        piece = {}
        for d, cd in CD.items():
            bare = worn(dl, 'bare', cd)
            c = cut(worn(dl, str(iid), cd), bare)
            bb = c.getbbox()
            cx, cy = center(bb)
            rx, ry = ref_c[cd]
            piece[d] = (shrink(c.crop(bb)), (cx - rx) * SCALE, (cy - ry) * SCALE)
        placed, side = {}, [''] * nrow
        for name in rows:
            a = H['anims'][name]
            d = name.split('_')[-1]
            s = ''
            for f in range(a['n']):
                code = pside[a['row']][f] if a['row'] < len(pside) and f < len(pside[a['row']]) else '.'
                if code not in 'fb' or d not in piece or not hand.get((name, f)):
                    s += '.'
                    continue
                im, ox, oy = piece[d]
                hx, hy = hand[(name, f)]
                x = round(hx + ox - im.width / 2 - fx)
                y = round(hy + oy - im.height / 2 - fy)
                placed[(name, f)] = (im, x, y)
                s += code
            side[a['row']] = s
        allp = list(placed.values())
        x0 = min(x for _, x, _ in allp)
        y0 = min(y for _, _, y in allp)
        x1 = max(x + im.width for im, x, _ in allp)
        y1 = max(y + im.height for im, _, y in allp)
        W, Hh, FX, FY = x1 - x0, y1 - y0, -x0, -y0
        sheet = Image.new('RGBA', (W * ncol, Hh * nrow))
        for (name, f), (im, x, y) in placed.items():
            r = H['anims'][name]['row']
            sheet.alpha_composite(im, (f * W + FX + x, r * Hh + FY + y))
        buf = io.BytesIO()
        sheet.save(buf, 'WEBP', lossless=True, quality=80, method=4)
        data = buf.getvalue()
        fn = f's/shield_{iid}_warrior.webp'
        with open(os.path.join(out, fn), 'wb') as fp:
            fp.write(data)
        meta = {'file': fn, 'cols': ncol, 'cell': [W, Hh], 'foot': [FX, FY], 'hash': hashlib.sha1(data).hexdigest()[:16], 'side': side}
        for cls in CLASSES:
            ad['layers'].setdefault(cls, {}).setdefault('shield', {})['c%d' % iid] = meta
        os.makedirs(os.path.join(out, 'icons'), exist_ok=True)
        icon = Image.open(os.path.join(dl, f'icon_{iid}.png')).convert('RGBA')
        icon.crop(icon.getbbox()).save(os.path.join(out, 'icons', f'{iid}.png'))
        ad['items'][str(iid)] = {'kind': 'shield', 'name': gname, 'grade': 4, 'set': '', 'icon': f'icons/{iid}.png', 'classes': list(CLASSES)}
        ad.setdefault('tried', {})[f'shield:{iid}'] = 1
        print(gname, 'cell', W, Hh, 'foot', FX, FY, {d: p[0].size for d, p in piece.items()})
    json.dump(ad, open(ip, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print('items', len(ad['items']))


if __name__ == '__main__':
    main()
