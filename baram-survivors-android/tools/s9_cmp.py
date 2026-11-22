"""mkcmp.py SKILL — the comparison sheet and GIF of one 9차 skill: plan9/cmp/<class>_<skill>.png (top: 8 frames of
the 2662 scene cropped round the hero; bottom: 8 of our game at the same times after the cast, at the same scale
relative to the hero — the original hero is 76 px tall, ours 47 game px: 0.62 game px a capture px) and .gif (ours).
A reusable recipe: one CFG entry a skill (scene, crop, frames, the frame the cast starts at, how ours is cast); a
class's entries carry cls (its id; its index for the shot is CLS_IDX) and warm (its pictures decoded before the cast)."""
import json, os, subprocess, sys, glob
from PIL import Image, ImageDraw, ImageFont
S = '/tmp/claude-0/-home-user-minimal-kafka/b169fcd6-4910-5b2f-bac5-ebc1ca794116/scratchpad'
P = S + '/plan9'
FONT = ImageFont.truetype(S + '/font/package/dist/Galmuri11.ttf', 12)
BIG = ImageFont.truetype(S + '/font/package/dist/Galmuri11.ttf', 24)
K = 0.62
CFG = {
    # crop: [cx, cy, w, h] in the capture, centred on the hero's body; frames: the capture's; start: the frame the cast
    # is counted from; ours: skill id, offset (our time of the same moment), env
    'hogi': dict(name='호기어검', img='02', crop=[292, 230, 440, 400], frames=[53, 54, 56, 57, 58, 60, 63, 66], start=53, skill='w_swords', off=0.9, gif=4.5,
                 note='원작: 대검이 떨어질 때마다 화면이 따라가므로 영웅이 가운데. 우리: 시전 0.9초 뒤 첫 검'),
    'heuk': dict(name='흑룡검풍 (패시브)', img='05', crop=[400, 365, 440, 330], frames=[77, 80, 84, 90, 96, 102, 108, 112], start=77, skill='w_blackdragon', off=0.0, gif=5,
                 env={'PRE': 'window.__windAlways=true'}, note='원작: 흑룡참파(붉은 고리) 뒤 검풍이 일어 주위를 돈다. 우리: 흑룡광참 시 발동(시험은 100%)'),
    'apdo': dict(name='압도적진격', img='07', crop=[292, 290, 560, 400], frames=[5, 6, 7, 8, 9, 10, 12, 16], start=5, skill='w_advance', off=0.05, gif=1.6,
                 env={'GATHER': '5'}, note='원작: 돌진 → 불고리 벽 0.3초 → 적이 밀려나 기절. 우리: 바라보는 쪽 4칸 돌진, 벽이 0.3초 동안 그 길 4칸을 덮음(밀치지 않고 2초 기절)'),
    'mcheon': dict(name='명천검파', img=None, tip='03', skill='w_mcheon', times=[0.08, 0.2, 0.32, 0.45, 0.6, 0.75, 0.95, 1.2], gif=1.8,
                   note='2662 IMG05에는 명천검파가 나오지 않음(161컷 전부 확인). 위: 설명창 / 아래: 우리(연 검기 그림, 사용자 확인 대상)'),
    'ult': dict(name='만검귀종 (필살기)', img='09', crop=[396, 320, 793, 640], frames=[5, 12, 17, 20, 24, 30, 40, 48], start=3, skill='ult', off=0.0, gif=2.2, zoom=0.5, ours=[0.05, 0.2, 0.33, 0.47, 0.62, 0.85, 1.1, 1.4],
                note='원작: 어둠 → 베기 → 칼날 소용돌이 → 불 소용돌이(검 무덤) 2.6초. 우리: 영웅 중심 화면 높이 75%, 어둠 0.15초 + 연출 1.1초(사용자 결정: 빠르게), 타격 2박자'),
}
CLS_IDX = {'warrior': 0, 'rogue': 1, 'mage': 2, 'poet': 3, 'archer': 4, 'lancer': 5, 'monk': 6, 'magus': 7, 'celestial': 8, 'dokkaebi': 9, 'reaper': 10}
CLS_KO = {'warrior': '전사', 'rogue': '도적', 'mage': '주술사', 'poet': '도사', 'archer': '궁사', 'lancer': '창술사', 'monk': '격투가', 'magus': '마도사',
          'celestial': '천인', 'dokkaebi': '도깨비', 'reaper': '차사'}
R_WARM = 'o_r_swaestar,o_r_swaefly,o_r_swaeend,o_r_zan,o_r_mukdok,o_r_mukdokcast,o_r_ult9'
CFG.update({
    'swae': dict(cls='rogue', warm=R_WARM, name="묵마수리검'쇄", img='13', crop=[285, 322, 620, 580], zoom=0.75, frames=[3, 4, 5, 7, 20, 60, 79, 82], start=1, skill='r_chainstar',
                 ours=[0.04, 0.1, 0.17, 0.35, 1.4, 4.0, 5.24, 5.42], gif=5.8,
                 note="원작: 수리검 여덟을 던져(흰 줄기) 3칸 남짓 밖에 세우고 5.5초, 끝에 흰 섬광·푸른 불꽃. 우리: 같은 그림·같은 크기, 고리 안 0.5초마다 분쇄, 5초 뒤 터짐"),
    'zan': dict(cls='rogue', warm=R_WARM, name='묵혈파광참', img='11', crop=[560, 300, 760, 580], zoom=0.75, frames=[1, 4, 5, 6, 7, 8, 9, 10], start=0, skill='r_bloodslash',
                ours=[0.03, 0.1, 0.18, 0.26, 0.34, 0.42, 0.5, 0.58], gif=1.2,
                note='원작: 그림자가 앞의 적에게 붉은 斬, 좌우로 갈라져 斬 둘 (0.8초). 우리: 앞 4칸 안의 적에 斬, 좌우 1.2칸 밖에 斬 둘 — 인장이 덮는 곳만 맞음'),
    'dok': dict(cls='rogue', warm=R_WARM, name='묵혈독바르기', img='17', crop=[330, 280, 400, 340], frames=[2, 3, 4, 5, 79, 81, 83, 85], start=1, skill='r_mukdok',
                ours=[0.03, 0.1, 0.18, 0.26, 0.72, 0.8, 0.88, 0.96], gif=2.0, env={'ALSO': 'r_kill:0.6'},
                note='원작: 독을 바름(보라 기운) → 공격 기술로 친 적 위에 푸른 보라 불꽃. 우리: 바른 뒤 0.6초에 대살격 — 맞은 적마다 같은 불꽃(감염)'),
    'rult': dict(cls='rogue', warm=R_WARM, name='질풍난무 (필살기)', img='19', crop=[398, 300, 796, 627], frames=[4, 10, 14, 20, 26, 29, 36, 42], start=2, skill='ult', off=0.0, gif=2.2, zoom=0.5,
                 ours=[0.05, 0.2, 0.33, 0.47, 0.62, 0.85, 1.1, 1.4],
                 note='원작: 어둠 → 대숲·큰 쿠나이 → 초록 바람이 조여듦 2.6초. 우리: 영웅 중심 화면 높이 75%, 어둠 0.15초 + 연출 1.1초, 타격 2박자'),
})
def times_of(img):
    return [int(x) / 1000 for x in open(f'{P}/w/f{img}/times.txt').read().split()]
def label(im, text, color='yellow'):
    d = ImageDraw.Draw(im)
    w = d.textlength(text, font=FONT)
    d.rectangle((0, 0, w + 6, 16), fill=(0, 0, 0))
    d.text((3, 2), text, font=FONT, fill=color)
def run(key, size=None, tag=''):
    c = CFG[key]
    out = f'{P}/shots'
    zoom = c.get('zoom', 1)
    if c['img']:
        tt = times_of(c['img'])
        rel = [round(tt[f] - tt[c['start']], 3) for f in c['frames']]
        ours_t = c.get('ours') or [max(0.02, round(r + c['off'], 3)) for r in rel]
        cx, cy, w, h = c['crop']
    else:
        rel = ours_t = c['times']
        w, h = 440, 400
    cls = c.get('cls', 'warrior')
    env = dict(os.environ, **c.get('env', {}), CLS=str(CLS_IDX[cls]))
    if c.get('warm'): env['WARM'] = c['warm']
    if size: env['SIZE'] = str(size)
    name = 'c_' + key + tag
    args = ['node', f'{P}/tools/shoot.js', out, name, c['skill'], ','.join(str(t) for t in ours_t)]
    if c.get('gif') and not tag: args.append(str(c['gif']))
    subprocess.check_call(args, env=env, cwd=f'{P}/tools')
    info = json.load(open(f'{out}/{name}.json'))
    sc = info['scale']
    cw, ch = int(w * zoom), int(h * zoom)
    sheet = Image.new('RGB', (cw * 8 + 2, ch * 2 + 60), (24, 24, 28))
    d = ImageDraw.Draw(sheet)
    d.text((6, 4), f"{CLS_KO[cls]} 9차 · {c['name']}{tag and ' · 크기 ' + tag}", font=BIG, fill='white')
    d.text((6, 36), c.get('note', ''), font=FONT, fill=(220, 220, 160))
    for i in range(8):
        if c['img']:
            f = Image.open(f"{P}/w/f{c['img']}/{c['frames'][i]:03d}.png").convert('RGB')
            pad = Image.new('RGB', (w, h), (0, 0, 0))
            pad.paste(f, (w // 2 - cx, h // 2 - cy))
            top = pad.resize((cw, ch), Image.LANCZOS)
            label(top, f"원작 #{c['frames'][i]}  {rel[i]:+.2f}s")
            sheet.paste(top, (i * cw, 60))
        im = Image.open(f'{out}/{name}_{i}.png').convert('RGB')
        W, H = im.size
        # the hero's body middle: the screen's middle, 22 game pixels over its feet
        gw, gh = w * K * sc, h * K * sc
        hx, hy = W / 2, H / 2 - 4 * sc
        crop = im.crop((int(hx - gw / 2), int(hy - gh / 2), int(hx + gw / 2), int(hy + gh / 2))).resize((cw, ch), Image.LANCZOS)
        label(crop, f"우리  {ours_t[i]:.2f}s", (140, 255, 140))
        sheet.paste(crop, (i * cw, 60 + ch))
    if not c['img']:
        tip = Image.open(f"{S}/s9/tips/IMG{c['tip']}.png").convert('RGB')
        sheet.paste(tip, (4, 60 + (ch - tip.height) // 2 if tip.height < ch else 60))
        d.text((300, 80), '원작 설명창: 십자 방향 최대 5칸 · 폭 3칸 · 3회 발사 · 쿨타임 5초 · 2회 충전\n원작 장면 없음 → 그림은 연의 전사 검기(k_u_w_wave). 1320 #09는 벚꽃잎이 날리는 다른 기술 그림이라 쓰지 않음',
               font=FONT, fill='white', spacing=6)
    os.makedirs(f'{P}/cmp', exist_ok=True)
    dst = f"{P}/cmp/{cls}_{key}{tag and '_' + tag}.png"
    sheet.save(dst)
    print(dst, sheet.size)
    if c.get('gif') and not tag:
        fr = sorted(glob.glob(f'{out}/{name}_g*.jpg'))
        ts = info['gif']
        ims = [Image.open(f).convert('RGB').resize((480, 382), Image.LANCZOS) for f in fr]
        durs = [max(20, int(round((ts[i + 1] - ts[i]) * 1000))) if i + 1 < len(ts) else 80 for i in range(len(ims))]
        pal = ims[len(ims) // 2].quantize(colors=160, method=Image.Quantize.MEDIANCUT)
        q = [f.quantize(palette=pal, dither=Image.Dither.NONE) for f in ims]
        g = f'{P}/cmp/{cls}_{key}.gif'
        q[0].save(g, save_all=True, append_images=q[1:], duration=durs, loop=0, optimize=True)
        print(g, len(q), os.path.getsize(g) // 1024, 'KB')
        for f in fr: os.remove(f)
if __name__ == '__main__':
    run(sys.argv[1], *(sys.argv[2:4]))
