#!/usr/bin/env python3
"""바람의나라 연's hunting presentation, from its decrypted bundles: the sprite fonts it draws
numbers with, and the generic hit / level-up / drop effects.

    yeon_hud.py FXS_BUNDLE SKILLS_BUNDLE OUT_DIR [EXTERN_BUNDLE]

With EXTERN_BUNDLE (ExternResources; its Atlas.unity3d beside it), also the kill-streak UI art:
ui_<sprite>.png.

Fonts (FXs bundle, Unity bitmap fonts):
  font_damage.png + font_damage.json  "Damage_01" on texture "Damage_Fonts": white pixel digits
                                      with a black outline, 22 px tall. The game tints the white
                                      by the hit's kind (vertex colour), so one sheet serves all.
  font_gold.png + font_gold.json      "font_num": gold serif digits and the comma, 16 px tall,
                                      already coloured (money, rewards).
  json: {"height": h, "glyphs": {"0": [x, y, w, h, advance], ...}}  (x, y from the top left)

Effects (strips like yeon_skills.py: equal cells side by side) + index.json
  {name: {cell: [w, h], n, ms, add, anchor: [x, y], prefab}}; anchor = the prefab origin.
"""
import json
import os
import sys

import UnityPy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from yeon_skills import render, to_strip  # noqa: E402

# Ours → 연 prefab. Hits are the generic sparks its skills share (Skill_Common_30xx) and the
# plain-attack hit; the rest are the level-up burst, the drop glows by grade and the kill mark.
EFFECTS = {
    'hit_1': 'Skill_Common_3014', 'hit_2': 'Skill_Common_3015', 'hit_3': 'Skill_Common_3016',
    'hit_4': 'Skill_Common_3017', 'hit_5': 'Skill_Common_3018', 'hit_6': 'Skill_Common_3019',
    'hit_attack': '120400_Attack_Hit', 'hit_fire': 'Skill_Effect_Warlock_Orb_Fire_Hit',
    'hit_light': 'Skill_Effect_Warlock_Orb_Light_Hit', 'hit_tiger': 'Skill_Effect_Transform_Backho_Hit',
    'levelup': 'FX_LevelUp', 'levelup_force': 'Fx_Force_Levelup',
    'drop': 'Drop_Effect_01', 'drop_2': 'Drop_Light_Class2', 'drop_3': 'Drop_Light_Class3',
    'drop_4': 'Drop_Light_Class4', 'drop_5': 'Drop_Light_Class5', 'kill': 'Sinsu_War_Kill',
    # The close-in fighters' blows (game.js MELEE_LOOK): white slash arcs and hit flashes out of 연's
    # own melee skills — 전사's 북천 slash and body-check burst, the 도적's back-attack cross, the
    # 무사's thrust, the 격투가's punch and uppercut, the 차사's wind slashes, a small break spark.
    'ml_slash': 'Skill_Effect_Bookchun_Slash', 'ml_burst': 'Skill_Effect_Fighter_BodyCheck_Hit_Up',
    'ml_cross': 'Skill_Effect_Thief_BackAttack_Hit', 'ml_thrust': 'Skill_Effect_Lancer_F_02_Hit',
    'ml_punch': 'Skill_Effect_Monk_ConsecutivePunch', 'ml_upper': 'Skill_Effect_Monk_BurstUppercut_Hit',
    'ml_wind': 'Skill_Effect_Reaper_WindSlash_Hit3_Left', 'ml_spark': 'Skill_Effect_0026_Break_Hit',
}


def font(env, font_name, tex_name, chars, out, key):
    """A Unity bitmap font: its glyph rects (uv in the texture) in ascending uv order → chars."""
    fnt = tex = None
    for o in env.objects:
        if o.type.name == 'Font' and o.peek_name() == font_name:
            fnt = o.read_typetree()
        if o.type.name == 'Texture2D' and o.peek_name() == tex_name:
            tex = o.read().image.convert('RGBA')
    if not fnt or tex is None:
        print('font missing', font_name)
        return None
    W, H = tex.size
    rects = sorted(fnt['m_CharacterRects'], key=lambda c: (c['uv']['x'], -c['uv']['y']))
    glyphs = {}
    for ch, c in zip(chars, rects):
        uv = c['uv']
        x, w = round(uv['x'] * W), round(uv['width'] * W)
        h = round(uv['height'] * H)
        y = H - round(uv['y'] * H) - h
        # The advance is in the font's own units (its vert rect), not the texture's pixels.
        vw = abs(c['vert']['width']) or w
        glyphs[ch] = [x, y, w, h, round(c['advance'] * w / vw, 2)]
    tex.save(os.path.join(out, key + '.png'))
    meta = {'height': max(g[3] for g in glyphs.values()), 'glyphs': glyphs, 'font': font_name}
    json.dump(meta, open(os.path.join(out, key + '.json'), 'w'), indent=1)
    print(key, tex.size, len(glyphs))
    return meta


def effects(envs, out):
    cont = {}
    for env in envs:
        for k, v in env.container.items():
            # A prefab and its texture can share a name: only the prefab is wanted.
            if v.type.name == 'GameObject':
                cont.setdefault(k.rsplit('/', 1)[-1].rsplit('.', 1)[0].lower(), v)
    index = {}
    for name, pf in EFFECTS.items():
        obj = cont.get(pf.lower())
        if obj is None:
            print(name, pf, 'not in containers')
            continue
        try:
            res = render(obj.read())
        except Exception as e:  # a prefab the renderer cannot draw (particles only, …)
            print(name, pf, 'render failed', e)
            continue
        if not res:
            print(name, pf, 'nothing drawn')
            continue
        frames, fps, ox, oy, add = res
        if name.startswith('ml_'):
            # A blow's mark is quick: the near-empty fading tail is left off.
            mass = [sum(f[0].getchannel('A').getdata()) for f in frames]
            while len(frames) > 4 and mass[len(frames) - 1] < max(mass) * 0.06:
                frames = frames[:-1]
        st = to_strip(frames, ox, oy, add)
        if not st:
            continue
        strip, cell, anchor = st
        strip.save(os.path.join(out, name + '.png'), optimize=True)
        index[name] = {'cell': list(cell), 'n': len(frames), 'ms': round(1000 / fps), 'add': add,
                       'anchor': [int(anchor[0]), int(anchor[1])], 'prefab': pf}
        print(name, pf, cell, len(frames), 'add' if add else 'alpha')
    json.dump(index, open(os.path.join(out, 'index.json'), 'w'), indent=1)


UI_SPRITES = ['Img_KillCombo_Base', 'Img_Kill', 'Img_KillLog', 'Icon_KillLog', 'Img_Dead_Killername',
              # 길드대항전 (game.js war.js): the ▼ over each fighter, the flags, the 사신수 공성전 art,
              # 勝/敗 and the team tags.
              'event_red_arrow', 'flag_red_win_0', 'flag_black_fall_0', 'sinsu_castlebattle_01', 'sinsu_castlebattle_02',
              'sinsu_castlebattle_03', 'sinsu_castlebattle_04', 'img_sinsu_1', 'img_sinsu_2', 'img_sinsu_3', 'img_sinsu_4',
              'attack_result_win', 'attack_result_lose', 'tag_blue_team', 'tag_red_team', 'vs', 'icon_target',
              'icon_castle_war', 'attack_arrow_blue', 'attack_arrow_red',
              # the ink countdown and the result: 연's brush blots, the spotlight, reward medallions.
              'bg_brush_05', 'ink_nine', 'Muhan_regult_ink_2', 'light02', 'Light', 'icon_medal01', 'Icon_Medal_Gold_01', 'ink_ff_04', 'ink_ff_06',
              # the hunt's "N전 획득" pickup lines at the right: 연's coin (엽전) icon.
              'icon_gold2']


def ui(env, out):
    got = []
    for o in env.objects:
        if o.type.name == 'Sprite' and o.peek_name() in UI_SPRITES and o.peek_name() not in got:
            try:
                o.read().image.save(os.path.join(out, 'ui_' + o.peek_name() + '.png'))
                got.append(o.peek_name())
            except Exception as e:  # its texture in a bundle not given
                print('ui', o.peek_name(), 'failed', e)
    print('ui', got)


def main():
    fxs, skills, out = sys.argv[1], sys.argv[2], sys.argv[3]
    os.makedirs(out, exist_ok=True)
    # Loaded together: some skill prefabs (the 도적's back-attack hit) take textures from FXs.
    env = UnityPy.load(fxs, skills)
    font(env, 'Damage_01', 'Damage_Fonts', '1234567890', out, 'font_damage')
    font(env, 'font_num', 'font_num', '1234567890,', out, 'font_gold')
    effects([env], out)
    if len(sys.argv) > 4:
        # The sprites' textures live in the Atlas bundle beside it: load the two together.
        ext = sys.argv[4]
        atlas = os.path.join(os.path.dirname(ext), 'Atlas.unity3d')
        ui(UnityPy.load(ext, atlas) if os.path.exists(atlas) else UnityPy.load(ext), out)


if __name__ == '__main__':
    main()
