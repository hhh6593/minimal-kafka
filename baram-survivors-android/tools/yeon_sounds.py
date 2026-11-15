#!/usr/bin/env python3
"""바람의나라 연's own sounds, out of its resource bundles, for the game.

    yeon_sounds.py RES_ZIP WORK_DIR

RES_ZIP is the zip of the game's downloaded resources (Android/data/com.nexon.baram/...: the
*.unity3d bundles). The bundles are stored XOR'd with a 20-byte key; the key is recovered from
the UnityFS header every bundle starts with (see dexor()). Then:

  WORK_DIR/sounds/<clip>.wav      every AudioClip of Sounds.unity3d, as the bundle has it
  WORK_DIR/tables/*.bin|txt       Skills_Player, Sounds and the Strings localisation (Commons)
  WORK_DIR/skills_sfx.json        연 skill (Korean name) -> the clips its record names
  WORK_DIR/sound_pick/<clip>.wav  the clips the game uses (MAP below), loudness-matched
  WORK_DIR/sound_pick/<bgm>.mp3   the background tunes the game uses, as 96k mp3
  WORK_DIR/sound_map.json         {"keys": {use: clip}, "skills": {skill: clip|[8 clips]}, "bgm": {use: clip}}

The skill <-> clip link: 연's skill table names each skill's sound (SoundFileName/CastSound);
our skills are matched to 연's by Korean name, the 3차/4차 ones by their place in the class's
list (2xx20700/0800/0900 -> SFX_<Class>_3rd_01/02/03, 1000/1100/1200 -> 4th_01/02/03), the
5차~9차 ones (today's PC skills, which 연 lacks) by the 연 effect they already draw (YEON_FX in
data.js) and else by what they are (ice, fire, thunder, a dash...).
"""
import json
import os
import re
import subprocess
import sys
import zipfile

import numpy as np

KEY_PLAIN = b'UnityFS\x00\x00\x00\x00\x085.x.x\x00'

# The bars of 화열/백열/뇌격/자천: one clip per grade, 일반 -> 진 -> 극진 (the 8 levels).
def grades(e):
    return [f'fx_skill_{n}_{e}' for n in (10101, 10101, 10102, 10102, 10103, 10103, 10104, 10105)]

MAP = {
    'keys': {
        'hit': 'sfx_bat_hit_normal', 'crit': 'sfx_bat_critical', 'kill': 'sfx_unit_dead_grass1',
        'swing': 'sfx_bat_swing_normal_1', 'levelup': 'sfx_fx_levelup', 'pickup': 'sfx_ui_get_coin',
        'heal': 'fx_skill_heal_01', 'chest': 'SFX_UI_GlobalCloset_BoxOpen_1', 'boss': 'sfx_ui_tower_boss',
        'win': 'sfx_ui_muhan_win', 'lose': 'sfx_ui_muhan_defeat', 'revive': 'sfx_ui_resurrection_normal',
        'click': 'sfx_ui_roulette_click', 'promote': 'sfx_fx_promotion', 'enter': 'sfx_fx_warp',
        'drop': 'sfx_fx_dropItem_0', 'quest': 'sfx_ui_quest_done', 'skillup': 'sfx_ui_skillup',
        'party_guard': 'fx_skill_130301', 'mon_dead': 'sfx_unit_dead_grass1', 'boss_dead': 'SFX_Boss_Bango_Die',
        # 연's kill-streak announcer, by streak.
        'combo': ['SFX_VOX_UI_KillLog_1', 'SFX_VOX_UI_KillLog_2', 'SFX_VOX_UI_KillLog_3', 'SFX_VOX_UI_KillLog_4',
                  'SFX_VOX_UI_KillLog_5', 'SFX_VOX_UI_KillLog_6', 'SFX_VOX_UI_KillLog_7', 'SFX_VOX_UI_KillLog_8_1'],
    },
    'skills': {
        # The 기원 line: 누리·대지·바다·…·천공·구름·태양.
        'c_heal': ['fx_skill_heal_02', 'fx_skill_heal_02', 'fx_skill_heal_03', 'fx_skill_heal_03',
                   'fx_skill_heal_04', 'fx_skill_heal_06', 'fx_skill_heal_07', 'fx_skill_heal_08'],
        'w_slash': '-',
        # Same name in 연.
        'w_roar': 'fx_skill_110401', 'w_tiger': 'fx_skill_11901', 'w_fly': 'fx_skill_0088', 'w_howl': 'SFX_Warrior_3rd_03',
        'w_blood': 'SFX_Warrior_4th_03_2', 'w_ult': 'fx_skill_110101', 'r_blink': 'fx_skill_210101',
        'r_drain': 'fx_skill_220501', 'r_dance': 'fx_skill_21701', 'r_flysword': 'fx_skill_0091',
        'r_formless': 'SFX_Thief_3rd_03_1', 'r_heaven': 'SFX_Thief_4th_02', 'r_bunhon': 'SFX_Thief_4th_03_2',
        'r_ult': 'fx_skill_210501', 'm_para': 'fx_skill_320401', 'm_sun': 'fx_skill_32001', 'm_sammae': 'fx_skill_0093',
        'm_fire3': 'SFX_Magician_4th_03_2', 'm_ult': 'fx_skill_310501', 'p_baekho': 'fx_skill_41801',
        'p_spirit': 'fx_skill_0097', 'p_phoenix': 'SFX_Shaman_4th_01', 'm_cross': 'SFX_Magician_5th_1',
        'w_ungong': 'fx_skill_heal_01', 'm_sage': 'SFX_Magician_4th_01', 'p_life': 'fx_skill_heal_09',
        'p_baekho2': 'fx_skill_41801', 'w_frenzy': 'SFX_Warrior_5th_3',
        # By place in the class list (3차: 0700/0800/0900, 4차: 1000~1200).
        'w_chohon': 'SFX_Warrior_3rd_01', 'w_sword': 'SFX_Warrior_3rd_02', 'w_roar2': 'fx_skill_11901',
        'r_gimun': 'SFX_Thief_3rd_01', 'r_jiok': 'SFX_Thief_3rd_02',
        'm_nodo': 'SFX_Magician_3rd_01', 'm_magi': 'SFX_Magician_3rd_02_1', 'm_quake': 'SFX_Magician_3rd_03',
        'p_aegis': 'SFX_Shaman_3rd_01_1', 'p_wave': 'SFX_Shaman_3rd_02_1', 'p_break': 'SFX_Shaman_3rd_03',
        # The element spells by grade.
        'm_fire': grades(1), 'm_fire4': grades(1), 'm_ice': grades(2), 'r_bolt': grades(3), 'p_orb': grades(4),
        # 연's sound for the same kind of spell.
        'w_buff': 'fx_skill_330201', 'w_jin': 'fx_skill_330201', 'w_talm': 'SFX_Common_Fire_Whoosh_3',
        'r_stealth': 'fx_skill_220101', 'r_clone': 'fx_skill_210601', 'r_budong': 'fx_skill_230201',
        'r_storm': 'fx_skill_10105_3', 'm_curse': 'fx_skill_320101', 'm_hoche': 'fx_skill_320301',
        'm_talm': 'SFX_Common_Explosion_2', 'p_summon': 'fx_skill_420601', 'p_barrier': 'fx_skill_130301',
        'p_quake': 'fx_skill_410401', 'p_guard': 'fx_skill_420701', 'p_reflect': 'fx_skill_130201',
        'p_talm': 'SFX_Common_Water_Whoosh_2', 'p_ult': 'fx_skill_32001',
        'c_kick': 'sfx_bat_hit_normal_2', 'w_bless': 'fx_skill_420201', 'w_lion': 'SFX_Warrior_ChargeOrder',
        'r_muyoung': 'fx_skill_210101', 'r_nuri': 'fx_skill_230201', 'r_forget': 'fx_skill_320401',
        'r_gaehyeol': 'fx_skill_heal_01', 'm_gongryeok': 'fx_skill_430401', 'm_arm': 'fx_skill_130301',
        'm_toema': 'fx_skill_420101', 'm_poison': 'fx_skill_21801', 'm_manpa': 'fx_skill_21801',
        'm_despair': 'fx_skill_320101', 'm_chaos': 'fx_skill_320401', 'p_toema': 'fx_skill_420101',
        'p_protect': 'fx_skill_130301', 'p_pahon': 'fx_skill_420101', 'p_sky': 'fx_skill_heal_06',
        'p_weaken': 'fx_skill_320101',
        # 5차~9차: by the 연 effect each draws (YEON_FX), else by kind.
        'w_rush': 'SFX_Warrior_5th_1', 'w_stone': 'SFX_Warrior_Impregnability', 'w_sentence': 'SFX_Thief_5th_1',
        'w_advance': 'SFX_Warrior_ChargeOrder', 'w_swords': 'fx_skill_0088', 'w_dragon': 'SFX_Warrior_5th_2_1',
        'w_thunder': 'SFX_Shaman_ThunderCloud', 'w_flash': 'fx_skill_110302', 'w_blackdragon': 'SFX_Warrior_4th_03',
        'w_dawn': 'fx_skill_420201', 'w_myriad': 'SFX_Warrior_5th_2_4',
        'r_venom': 'SFX_Thief_5th_3_1', 'r_phantom': 'SFX_Thief_5th_2', 'r_chainstar': 'SFX_Thief_5th_3_3',
        'r_bloodslash': 'SFX_Thief_5th_3_4', 'r_flamesword': 'SFX_Common_Fire_Whoosh_1', 'r_hidden': 'SFX_Thief_6th_1',
        'r_shuriken': 'fx_skill_210401', 'r_kill': 'fx_skill_deadlystrike', 'r_shadowstar': 'fx_skill_210402',
        'r_shadowclone': 'fx_skill_210601', 'r_gale': 'fx_skill_210302', 'r_bloom': 'SFX_Thief_5th_3_5',
        'm_shift': 'SFX_Magician_5th_3', 'm_coldveil': 'SFX_Magician_5th_2', 'm_desert': 'SFX_Common_Fire_Whoosh_2',
        'm_thunderball': 'SFX_Magician_4th_02_2_1', 'm_frost': 'SFX_Common_Ice_Whoosh_1', 'm_twin': 'SFX_Magician_4th_02_1',
        'm_inferno': 'SFX_Magician_6th_1', 'm_shards': 'SFX_Common_Ice_Break_L_1', 'm_wisdom': 'SFX_Magician_4th_01',
        'm_gale': 'SFX_Common_Cloth_Whoosh_3', 'm_kalpa': 'SFX_Magician_Meteor',
        'p_realm': 'SFX_Shaman_5th_3', 'p_bind': 'SFX_Shaman_5th_1', 'p_thunderbomb': 'SFX_Shaman_5th_2_1',
        'p_wargod': 'SFX_Shaman_5th_2_2', 'p_skyspirit': 'fx_skill_heal_11', 'p_bagua': 'SFX_Shaman_6th_1',
        'p_judge': 'SFX_Shaman_ThunderCloud', 'p_burst': 'SFX_Common_Explosion_1', 'p_dragongod': 'SFX_Shaman_4th_03',
        'p_flash': 'fx_skill_420101', 'p_warmth': 'fx_skill_heal_10', 'p_taiji': 'SFX_Shaman_4th_03_1',
    },
    'bgm': {
        'title': 'bgm_00000998_48', 'boss': 'bgm_boss01_48', 'boss2': 'bgm_boss03_48',
        'raid': 'BGM_Raid_China_1stBoss_48', 'raid_sea': 'BGM_Raid_YongGung_1stBoss_48',
        'raid_fire': 'BGM_Raid_FantasyIsland_3rdBoss', 'raid_hell': 'BGM_Raid_Hell_1stBoss',
        'sea': 'BGM_YongGung_Reef_48', 'island': 'BGM_FantasyIsland_AssemblyField_48',
        'japan': 'BGM_Raid_NewJapan_1stField', 'china': 'BGM_China_DryLand_48',
        'tower': 'BGM_YeonTower_Field',
    },
}


def dexor(raw):
    head = raw[:40]
    key = bytes([a ^ b for a, b in zip(head, KEY_PLAIN)] + [head[38], head[39]])
    a = np.frombuffer(raw, dtype=np.uint8)
    k = np.tile(np.frombuffer(key, dtype=np.uint8), -(-len(a) // 20))[:len(a)]
    return (a ^ k).tobytes()


def tokens(b):
    """The table blobs' strings: each a length byte and its UTF-8, in record order."""
    i, out = 0, []
    while i < len(b):
        n = b[i]
        if n >= 1 and i + 1 + n <= len(b):
            try:
                t = b[i + 1:i + 1 + n].decode('utf-8')
                if t.strip() and all(c.isprintable() for c in t):
                    out.append(t)
                    i += 1 + n
                    continue
            except UnicodeDecodeError:
                pass
        i += 1
    return out


def norm(path_in, path_out, peak_db=-1.0, rms_db=-16.0):
    import wave
    w = wave.open(path_in)
    ch, rate, n = w.getnchannels(), w.getframerate(), w.getnframes()
    x = np.frombuffer(w.readframes(n), dtype=np.int16).astype(np.float32) / 32768
    w.close()
    rms = float(np.sqrt(np.mean(x * x))) or 1e-9
    g = min(10 ** (rms_db / 20) / rms, 10 ** (peak_db / 20) / (float(np.abs(x).max()) or 1e-9))
    y = np.clip(x * g, -1, 1)
    o = wave.open(path_out, 'wb')
    o.setnchannels(ch)
    o.setsampwidth(2)
    o.setframerate(rate)
    o.writeframes((y * 32767).astype(np.int16).tobytes())
    o.close()


def main():
    import UnityPy
    res, work = sys.argv[1], sys.argv[2]
    for d in ('sounds', 'tables', 'sound_pick'):
        os.makedirs(os.path.join(work, d), exist_ok=True)
    z = zipfile.ZipFile(res)
    member = {n.split('/')[-1]: n for n in z.namelist()}

    env = UnityPy.load(dexor(z.read(member['Sounds.unity3d'])))
    for o in env.objects:
        if o.type.name == 'AudioClip':
            c = o.read()
            for name, data in c.samples.items():
                open(os.path.join(work, 'sounds', c.m_Name + '.wav'), 'wb').write(data)

    env = UnityPy.load(dexor(z.read(member['Commons.unity3d'])))
    for o in env.objects:
        if o.type.name not in ('MonoBehaviour', 'TextAsset'):
            continue
        d = o.read()
        if d.m_Name in ('Skills_Player', 'Sounds') and o.type.name == 'MonoBehaviour':
            open(os.path.join(work, 'tables', d.m_Name + '.bin'), 'wb').write(bytes(o.read_typetree()['_buffer']))
        elif d.m_Name == 'Strings' and o.type.name == 'TextAsset':
            s = d.m_Script
            open(os.path.join(work, 'tables', 'Strings.txt'), 'wb').write(s if isinstance(s, bytes) else s.encode('utf-8', 'surrogateescape'))

    clips = {f[:-4] for f in os.listdir(os.path.join(work, 'sounds'))}
    names = dict(re.findall(r'<String Key="(Skill_\d+_Name(?:_\d+)?)"><!\[CDATA\[(.*?)\]\]>',
                            open(os.path.join(work, 'tables', 'Strings.txt'), encoding='utf-8').read()))
    cur, rec = None, {}
    for t in tokens(open(os.path.join(work, 'tables', 'Skills_Player.bin'), 'rb').read()):
        if re.match(r'Skill_\d+_Name(_\d+)?$', t):
            cur = t
            rec.setdefault(cur, {'name': names.get(cur, ''), 'sfx': []})
        elif cur and t in clips:
            rec[cur]['sfx'].append(t)
    json.dump(rec, open(os.path.join(work, 'skills_sfx.json'), 'w'), ensure_ascii=False, indent=0)

    used = set()
    for group in ('keys', 'skills'):
        for v in MAP[group].values():
            used.update([v] if isinstance(v, str) else v)
    used.discard('-')
    missing = sorted(c for c in used if c not in clips)
    if missing:
        print('missing clips:', missing)
    for c in sorted(used - set(missing)):
        norm(os.path.join(work, 'sounds', c + '.wav'), os.path.join(work, 'sound_pick', c + '.wav'))
    for c in MAP['bgm'].values():
        src = os.path.join(work, 'sounds', c + '.wav')
        if os.path.exists(src):
            subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', src, '-af', 'loudnorm=I=-18:TP=-1.5',
                            '-ar', '44100', '-b:a', '96k', os.path.join(work, 'sound_pick', c + '.mp3')], check=True)
        else:
            print('missing bgm:', c)
    json.dump(MAP, open(os.path.join(work, 'sound_map.json'), 'w'), ensure_ascii=False, indent=1)
    size = sum(os.path.getsize(os.path.join(work, 'sound_pick', f)) for f in os.listdir(os.path.join(work, 'sound_pick')))
    print(f'{len(clips)} clips, {len(used) - len(missing)} picked sfx, {len(MAP["bgm"])} bgm, {size / 1e6:.1f} MB picked')


if __name__ == '__main__':
    main()
