#!/usr/bin/env python3
"""바람의나라 연's own sounds, out of its resource bundles, for the game.

    yeon_sounds.py RES_ZIP WORK_DIR
    yeon_sounds.py --js web/js/yeon_sounds.js      (rewrite the game's table from MAP only)

RES_ZIP is the zip of the game's downloaded resources (Android/data/com.nexon.baram/...: the
*.unity3d bundles). The bundles are stored XOR'd with a 20-byte key; the key is recovered from
the UnityFS header every bundle starts with (see dexor()). Then:

  WORK_DIR/sounds/<clip>.wav      every AudioClip of Sounds.unity3d, as the bundle has it
  WORK_DIR/tables/*.bin|txt       Skills_Player, Sounds and the Strings localisation (Commons)
  WORK_DIR/skills_sfx.json        연 skill (Korean name) -> the clips its record names
  WORK_DIR/sound_pick/<clip>.wav  the clips the game uses (MAP below), loudness-matched
  WORK_DIR/sound_pick/<bgm>.mp3   the background tunes the game uses, as 96k mp3
  WORK_DIR/sound_map.json         {"keys": {use: clip}, "skills": {skill: clip|[8 clips]}, "bgm": {use: clip},
                                   "stage_bgm": {stage: clip}, "raid_bgm": {raid: clip}}
  WORK_DIR/maps_music.json        every 연 map's name, file and music (map_music())

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
        # 차수별 고유 기술 (data.js TIER_SKILLS): the record's own clip where the build has it, else its line's.
        'w_lure': 'fx_skill_110401', 'w_will': 'fx_skill_330201', 'w_gale': 'fx_skill_110201', 'w_tarok': 'SFX_Warrior_3rd_01',
        'w_gwangya': 'SFX_Warrior_5th_1', 'w_hogi': 'SFX_Warrior_5th_2_1', 'r_chamgan': 'fx_skill_210302', 'r_hyeoldok': 'SFX_Thief_5th_3_1',
        'r_tudo': 'SFX_Thief_6th_1', 'm_chain': 'SFX_Magician_4th_02_2_1', 'm_instant': 'SFX_Magician_3rd_02_1', 'm_seonsim': 'fx_skill_42811',
        'p_honma': 'fx_skill_420101', 'p_saint': 'fx_skill_heal_05', 'p_seongi': 'SFX_Shaman_5th_3', 'a_cheong': 'SFX_Archer_WindArrow_Base',
        'a_cloud': 'SFX_Archer_WeeBo', 'a_rapid': 'SFX_Archer_Attack_Bow_1_1', 'a_rod': 'SFX_Archer_ThunderCharge', 'a_tuhyeol4': 'SFX_Archer_BloodStrikeR5_Hit',
        'a_unhwa': 'SFX_Archer_RainArrow', 'l_hoecheon': 'SFX_Lancer_1st_01', 'l_noegi': 'SFX_Lancer_T_04', 'l_noegichim': 'SFX_Lancer_T_05_2',
        'l_revenge': 'SFX_Lancer_S_01_1', 'l_weebo': 'SFX_Archer_WeeBo', 'l_ungi': 'fx_skill_230201', 'mk_whitepalm': 'fx_skill_deathfist',
        'mk_whirl': 'SFX_Dokkaebi_2nd_WhirlWind', 'mk_air': 'SFX_Fight_BodyCheck', 'mk_muhan': 'SFX_Fighter_5th_1', 'mk_stack': 'fx_skill_quake',
        'mk_yuk': 'SFX_Fighter_6th_1', 'md_fice': 'SFX_Warlock_OrbIce', 'md_flight': 'SFX_Warlock_OrbLight', 'md_ffire': 'SFX_Warlock_OrbFire',
        'cl_gray': 'SFX_Celestial_3rd_MindControl', 'cl_wedge': 'SFX_Celestial_AgoArmor_Alt', 'cl_shatter': 'SFX_Celestial_3rd_GroundSlam', 'dk_walk': 'SFX_Dokkaebi_DokkaebiHat',
        'dk_wisp1': 'SFX_Dokkaebi_WispFire', 'dk_mook': 'SFX_Dokkaebi_WispGet_2', 'dk_wisp2': 'SFX_Dokkaebi_5th_Jwibulnori_Cast', 'dk_maryu': 'SFX_Dokkaebi_Strength',
        'dk_wisp3': 'SFX_Dokkaebi_2nd_WispExplosion', 'rp_convert': 'SFX_Reaper_SoulShot', 'rp_nether': 'SFX_Reaper_Redemption', 'rp_resonate': 'SFX_Reaper_Resonate',
        'rp_guard': 'SFX_Reaper_Barrier', 'rp_bomb': 'SFX_Reaper_3rd_InfernoBlaze', 'rp_wraith': 'SFX_Reaper_3rd_SoulBuff',
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
        'p_baekho2': 'SFX_Shaman_3rd_03', 'w_frenzy': 'SFX_Warrior_5th_3',
        # By place in the class list (3차: 0700/0800/0900, 4차: 1000~1200).
        'w_chohon': 'SFX_Warrior_3rd_01', 'w_sword': 'SFX_Warrior_3rd_02', 'w_roar2': 'fx_skill_11901',
        'r_gimun': 'SFX_Thief_3rd_01', 'r_jiok': 'SFX_Thief_3rd_02',
        'm_nodo': 'SFX_Magician_3rd_01', 'm_magi': 'SFX_Magician_3rd_02_1', 'm_quake': 'SFX_Magician_3rd_03',
        'p_aegis': 'SFX_Shaman_3rd_01_1', 'p_wave': 'SFX_Shaman_3rd_02_1', 'p_break': 'fx_skill_420501',
        # The element spells by grade.
        'm_fire': grades(1), 'm_fire4': grades(1), 'm_ice': grades(2), 'r_bolt': grades(3), 'p_orb': grades(4),
        # 연's sound for the same kind of spell.
        'w_buff': 'fx_skill_330201', 'w_jin': 'fx_skill_330201', 'w_talm': 'SFX_Common_Fire_Whoosh_3',
        'r_stealth': 'fx_skill_220101', 'r_clone': 'fx_skill_210601', 'r_budong': 'fx_skill_230201',
        'r_storm': 'fx_skill_10105_3', 'm_curse': 'fx_skill_320101', 'm_hoche': 'fx_skill_42811',
        'm_talm': 'SFX_Common_Explosion_2', 'p_summon': 'fx_skill_420601', 'p_barrier': 'fx_skill_130301',
        'p_quake': 'fx_skill_410401', 'p_guard': 'fx_skill_420701', 'p_reflect': 'fx_skill_130201',
        'p_talm': 'SFX_Common_Water_Whoosh_2', 'p_ult': 'fx_skill_32001',
        'c_kick': 'sfx_bat_hit_normal_2', 'w_bless': 'fx_skill_420201', 'w_lion': 'SFX_Warrior_ChargeOrder',
        'r_muyoung': 'fx_skill_220201', 'r_nuri': 'fx_skill_230201', 'r_forget': 'fx_skill_320401',
        'r_gaehyeol': 'fx_skill_heal_01', 'm_gongryeok': 'fx_skill_430401', 'm_arm': 'fx_skill_130301',
        'm_toema': 'fx_skill_420101', 'm_poison': 'fx_skill_320301', 'm_manpa': 'fx_skill_21801',
        'm_despair': 'fx_skill_320101', 'm_chaos': 'fx_skill_320401', 'p_toema': 'fx_skill_420101',
        'p_protect': 'fx_skill_130301', 'p_pahon': 'fx_skill_420101', 'p_sky': 'fx_skill_heal_06',
        'p_weaken': 'fx_skill_320101',
        # 5차~9차: by the 연 effect each draws (YEON_FX), else by kind.
        'w_rush': 'fx_skill_110201', 'w_stone': 'SFX_Warrior_Impregnability', 'w_sentence': 'SFX_Thief_5th_1',
        'w_advance': 'SFX_Lancer_5th_1', 'w_swords': 'fx_skill_0088', 'w_dragon': 'SFX_Lancer_4th_02',
        'w_thunder': 'SFX_Shaman_ThunderCloud', 'w_flash': 'fx_skill_110302', 'w_blackdragon': 'SFX_Warrior_4th_03',
        'w_dawn': 'fx_skill_420201', 'w_myriad': 'SFX_Warrior_5th_2_4',
        'r_venom': 'SFX_Thief_5th_3_1', 'r_phantom': 'SFX_Thief_5th_2', 'r_chainstar': 'SFX_Thief_5th_3_3',
        'r_bloodslash': 'SFX_Thief_5th_3_4', 'r_flamesword': 'SFX_Common_Fire_Whoosh_1', 'r_hidden': 'SFX_Thief_6th_1',
        'r_shuriken': 'fx_skill_210401', 'r_kill': 'SFX_Celestial_6th_1', 'r_shadowstar': 'fx_skill_210402',
        'r_shadowclone': 'fx_skill_210601', 'r_gale': 'fx_skill_210302', 'r_bloom': 'SFX_Thief_5th_3_5',
        'm_shift': 'SFX_Magician_5th_3', 'm_coldveil': 'SFX_Magician_5th_2', 'm_desert': 'SFX_Common_Fire_Whoosh_2',
        'm_thunderball': 'SFX_Magician_4th_02_2_1', 'm_frost': 'SFX_Common_Ice_Whoosh_1', 'm_twin': 'SFX_Magician_4th_02_1',
        'm_inferno': 'SFX_Magician_6th_1', 'm_shards': 'SFX_Common_Ice_Break_L_1', 'm_wisdom': 'SFX_Magician_4th_01',
        'm_gale': 'SFX_Common_Cloth_Whoosh_3', 'm_kalpa': 'SFX_Magician_Meteor',
        'p_realm': 'SFX_Shaman_5th_3', 'p_bind': 'SFX_Shaman_5th_1', 'p_thunderbomb': 'SFX_Shaman_5th_2_1',
        'p_wargod': 'SFX_Fighter_5th_3', 'p_skyspirit': 'fx_skill_heal_11', 'p_bagua': 'SFX_Celestial_5th_Bagua',
        'p_judge': 'SFX_Shaman_ThunderCloud', 'p_burst': 'SFX_Common_Explosion_1', 'p_dragongod': 'SFX_Shaman_4th_03',
        'p_flash': 'fx_skill_420101', 'p_warmth': 'fx_skill_heal_10', 'p_taiji': 'SFX_Shaman_4th_03_1',
        # 궁사 (Job_6): each skill's own SFX_Archer_* clip (its record's sound, or its effect's).
        'a_shot': 'SFX_Archer_Attack_Bow_1_1', 'a_aim': 'SFX_Archer_Attack_Bow_3_1', 'a_firewall': 'SFX_Archer_FireWall_1', 'a_flame': 'SFX_Archer_FlameArrow',
        'a_spiral': 'SFX_Archer_WindArrow_Base', 'a_ice': 'SFX_Archer_CoverIce', 'a_bomb': 'SFX_Archer_BombArrow_Hit', 'a_freeze': 'SFX_Archer_FreezeArrow_Shot',
        'a_coverfire': 'SFX_Archer_CoverFire', 'a_storm': 'SFX_Archer_RainArrow', 'a_silence': 'SFX_Archer_Silence', 'a_breakair': 'SFX_Archer_BreakAir',
        'a_tempest': 'SFX_Archer_RainForceArrowTornado', 'a_thunder': 'SFX_Archer_ThunderCharge', 'a_whirl': 'SFX_Archer_Tornado', 'a_allwhirl': 'SFX_Archer_Tornado_All',
        'a_inferno': 'SFX_Archer_5th_1', 'a_fetter': 'SFX_Archer_5th_2', 'a_bloodsuck': 'SFX_Archer_5th_3', 'a_chase': 'SFX_Archer_6th_1',
        'a_chain': 'SFX_Archer_ChainBlast_Shot', 'a_shadow': 'SFX_Archer_ShadowShield_Cast', 'a_eagle': 'SFX_Archer_EagleAttack', 'a_weebo': 'SFX_Archer_WeeBo',
        'a_bless': 'SFX_Archer_BlessOfBow', 'a_air': 'SFX_Archer_AirArrow', 'a_blood5': 'SFX_Archer_BloodStrikeR5_Hit', 'a_ult': 'SFX_Archer_WhipShot',
        # 무사 (Job_7): each skill's own SFX_Lancer_* clip (its record's sound, or its effect's).
        'l_moon': 'SFX_Lancer_F_01', 'l_halfmoon': 'SFX_Lancer_F_03', 'l_phantom': 'SFX_Lancer_F_02', 'l_meteor': 'SFX_Lancer_F_02_T2',
        'l_wind': 'SFX_Lancer_T_01', 'l_rise': 'SFX_Lancer_F_05', 'l_spiral': 'SFX_Lancer_1st_01', 'l_illusion': 'SFX_Lancer_1st_02',
        'l_release': 'SFX_Lancer_T_05_2', 'l_extinct': 'SFX_Lancer_2nd_01', 'l_innate': 'SFX_Lancer_T_06', 'l_waves': 'SFX_Lancer_3rd_01',
        'l_rush': 'SFX_Lancer_3rd_02', 'l_burst': 'SFX_Lancer_3rd_03', 'l_unity': 'SFX_Lancer_T_04', 'l_firedragon': 'SFX_Lancer_4th_02',
        'l_genesis': 'SFX_Lancer_4th_03_3', 'l_extinct2': 'SFX_Lancer_5th_1', 'l_formless': 'SFX_Lancer_5th_2', 'l_guard': 'SFX_Lancer_5th_3',
        'l_annihil': 'SFX_Lancer_6th_1', 'l_dragon': 'SFX_Lancer_F_06', 'l_spirit': 'SFX_Lancer_T_02', 'l_javelin': 'SFX_Lancer_IntangibleJavelin',
        'l_thunder': 'SFX_Lancer_T_07', 'l_union': 'SFX_Lancer_T_03', 'l_reflect': 'SFX_Lancer_S_01_1', 'l_moonfull': 'SFX_Lancer_T_04_Super',
        'l_ult': 'SFX_Lancer_F_03_Super',
        # 격투가 (Job_5): its 승급 SFX_Fighter_* clips; its 일반 records carry none, so the fist sounds of 연's own fx_skill_* set.
        'mk_bung': 'fx_skill_deathfist', 'mk_sudden': 'fx_skill_thunderfist', 'mk_smash': 'SFX_Fighter_4th_03_1', 'mk_body': 'SFX_Fight_BodyCheck',
        'mk_quake': 'fx_skill_quake', 'mk_switch': 'fx_skill_fightspirit', 'mk_pointblue': 'fx_skill_thunderfist', 'mk_pointlight': 'SFX_Fighter_4th_03',
        'mk_uppercut': 'SFX_Fighter_4th_03_1', 'mk_endure': 'fx_skill_fightspirit', 'mk_spirit': 'fx_skill_fightspirit', 'mk_pointburst': 'fx_skill_quake',
        'mk_resonance': 'SFX_Fighter_5th_2', 'mk_rupture': 'fx_skill_quake', 'mk_diamond': 'SFX_Fighter_4th_03', 'mk_wolf': 'SFX_Fighter_4th_02',
        'mk_buddha': 'SFX_Fighter_4th_03_2', 'mk_combo': 'SFX_Fighter_5th_1', 'mk_technique': 'SFX_Fighter_5th_3', 'mk_advent': 'SFX_Fighter_4th_03_2',
        'mk_kyokushin': 'SFX_Fighter_6th_1', 'mk_focus': 'fx_skill_fightspirit', 'mk_feint': 'fx_skill_fightspirit', 'mk_point': 'fx_skill_deathfist',
        'mk_origin': 'fx_skill_fightspirit', 'mk_aventhit': 'SFX_Fighter_6th_1', 'mk_ult': 'SFX_Fighter_5th_1',
        # 마도사 (Job_11): each skill's own SFX_Warlock_* clip (광폭보호부 has none: its 광폭오행구슬's).
        'md_sphere': 'SFX_Warlock_MagicSphere', 'md_arrow': 'SFX_Warlock_MagicArrow', 'md_orbice': 'SFX_Warlock_OrbIce', 'md_orblight': 'SFX_Warlock_OrbLight',
        'md_orbfire': 'SFX_Warlock_OrbFire', 'md_enhance': 'SFX_Warlock_MagicEnhance', 'md_heal': 'SFX_Warlock_Heal', 'md_spirit': 'SFX_Warlock_SpiritRush',
        'md_amulet': 'SFX_Warlock_FrenzyOrbYinyang', 'md_frenzyexp': 'SFX_Warlock_FrenzyExplosion', 'md_cross': 'SFX_Warlock_CrossBeam', 'md_decay': 'SFX_Warlock_Decay',
        'md_recovery': 'SFX_Warlock_FrenzyRecovery', 'md_wave': 'SFX_Warlock_Wave', 'md_silence': 'SFX_Warlock_SilenceFlame', 'md_bust': 'SFX_Warlock_FrenzyBust',
        'md_ray': 'SFX_Warlock_FrenzyRay', 'md_absorb': 'SFX_Warlock_FrenzyAbsorb', 'md_exfrenzy': 'SFX_Warlock_ExFrenzy', 'md_bloodbat': 'SFX_Warlock_BloodBat',
        'md_crossfrenzy': 'SFX_Warlock_FrenzyCrossBeam', 'md_stormfrenzy': 'SFX_Warlock_FrenzyStorm', 'md_storm': 'SFX_Warlock_Storm', 'md_boundary': 'SFX_Warlock_BoundaryBreak',
        'md_yinyang': 'SFX_Warlock_OrbYinyang', 'md_resonance': 'SFX_Warlock_Resonance', 'md_frenetic': 'SFX_Warlock_Frenetic', 'md_manafill': 'SFX_Warlock_ManaFill',
        'md_wavefrenzy': 'SFX_Warlock_FrenzyWave', 'md_ult': 'SFX_Warlock_FrenzyMagicSphere',
        # 천인 (Job_8): each skill's own SFX_Celestial_* clip (삼족오, 여래의장 and 철옹벽 have none: their kin's).
        'cl_boom': 'SFX_Celestial_Boom', 'cl_crow': 'SFX_Celestial_5th_CrowFire', 'cl_ago': 'SFX_Celestial_AgoDestruction_Alt', 'cl_armor': 'SFX_Celestial_AgoArmor_Alt',
        'cl_moment': 'SFX_Celestial_Moment', 'cl_storm': 'SFX_Celestial_ImmortalityStorm', 'cl_blood': 'SFX_Celestial_BloodRobbery', 'cl_acumen': 'SFX_Celestial_1st_Acumen',
        'cl_yeorae': 'SFX_Celestial_CompleteDefense_Hit', 'cl_wall': 'SFX_Celestial_Acumen', 'cl_brilliant': 'SFX_Celestial_2nd_Brilliant', 'cl_blood2': 'SFX_Celestial_2nd_BloodRobbery',
        'cl_slam': 'SFX_Celestial_3rd_GroundSlam', 'cl_storm2': 'SFX_Celestial_3rd_ImmortalityStorm', 'cl_bind': 'SFX_Celestial_3rd_MindControl', 'cl_claw': 'SFX_Celestial_4th_DragonClaw_Alt',
        'cl_thunder': 'SFX_Celestial_4th_ThunderDragon', 'cl_tiger': 'SFX_Celestial_5th_TigerMaw_Alt', 'cl_crowfire': 'SFX_Celestial_5th_CrowFire', 'cl_bagua': 'SFX_Celestial_5th_Bagua',
        'cl_ego': 'SFX_Celestial_6th_1', 'cl_gumiho': 'SFX_Celestial_GuardianGumiho', 'cl_snake': 'SFX_Celestial_Snake', 'cl_intrep': 'SFX_Celestial_Intrepidity',
        'cl_defense': 'SFX_Celestial_CompleteDefense_Cast', 'cl_reindeer': 'SFX_Celestial_Reindeer', 'cl_ult': 'SFX_Celestial_LossFormer',
        # 도깨비 (Job_9): each skill's own SFX_Dokkaebi_* clip (금은보화로구나 and 귀체 take its 도깨비불 pickup sounds).
        'dk_repel': 'SFX_Dokkaebi_Repelling', 'dk_paddle': 'SFX_Dokkaebi_Paddling', 'dk_wisp': 'SFX_Dokkaebi_WispFire', 'dk_strength': 'SFX_Dokkaebi_Strength',
        'dk_punish': 'SFX_Dokkaebi_Punishment', 'dk_hat': 'SFX_Dokkaebi_DokkaebiHat', 'dk_roar': 'SFX_Dokkaebi_1st_RepellingReinForce', 'dk_throw': 'SFX_Dokkaebi_1st_ThrowUp',
        'dk_whirl': 'SFX_Dokkaebi_2nd_WhirlWind', 'dk_wispexp': 'SFX_Dokkaebi_2nd_WispExplosion', 'dk_judgment': 'SFX_Dokkaebi_3rd_Judgment', 'dk_shock': 'SFX_Dokkaebi_3rd_WispElectricShock',
        'dk_flatten': 'SFX_Dokkaebi_3rd_Equalizer', 'dk_fan': 'SFX_Dokkaebi_4th_DokkaebiFan', 'dk_super': 'SFX_Dokkaebi_4th_Supernatural_Cast', 'dk_hamstring': 'SFX_Dokkaebi_5th_HamstringHook',
        'dk_firebat': 'SFX_Dokkaebi_5th_Jwibulnori_Cast', 'dk_weight': 'SFX_Dokkaebi_5th_Weight_Attack', 'dk_storm': 'SFX_Dokkaebi_6th_DokkaebiStorm', 'dk_goldhit': 'SFX_Dokkaebi_WispGet_1',
        'dk_body': 'SFX_Dokkaebi_WispGet_2', 'dk_nemesis': 'SFX_Dokkaebi_Nemesis', 'dk_rage': 'SFX_Dokkaebi_3rd_Judgment_Alt', 'dk_ult': 'SFX_Dokkaebi_ComeOutGold',
        # 차사 (Job_10): each skill's own SFX_Reaper_* clip (영혼걸음 and 흡기공 have none: its 영혼공명 and 영혼족쇄 hit).
        'rp_cut': 'SFX_Reaper_Cutoff', 'rp_flash': 'SFX_Reaper_Flash', 'rp_shot': 'SFX_Reaper_SoulShot', 'rp_walk': 'SFX_Reaper_Resonate',
        'rp_spiral': 'SFX_Reaper_Spiral', 'rp_drain': 'SFX_Reaper_Redemption_Hit', 'rp_asura': 'SFX_Reaper_1st_AsuraBalde', 'rp_counter': 'SFX_Reaper_1st_Counter',
        'rp_wind': 'SFX_Reaper_2nd_WindSlash', 'rp_inferno': 'SFX_Reaper_3rd_InfernoBlaze', 'rp_arrow': 'SFX_Reaper_3rd_SoulArrow', 'rp_soulbuff': 'SFX_Reaper_3rd_SoulBuff',
        'rp_crush': 'SFX_Reaper_4th_Crush', 'rp_madness': 'SFX_Reaper_4th_Madness', 'rp_burst': 'SFX_Reaper_5th_SoulBurst', 'rp_resurrect': 'SFX_Reaper_5th_Resurrect',
        'rp_deadly': 'SFX_Reaper_6th_DeadlySlash', 'rp_chain': 'SFX_Reaper_Redemption', 'rp_barrier': 'SFX_Reaper_Barrier', 'rp_eye': 'SFX_Reaper_MindEye',
        'rp_gate': 'SFX_Reaper_4th_HellGate', 'rp_ult': 'SFX_Reaper_5th_Advent',
    },
    # Audit (each spell's icon, effect and sound out of the same 연 skill record): the record's own
    # sound field first, then the PlaySound event in its effect's animation (the 3차 sounds are
    # numbered one step round from their icons: 지폭지술's effect plays Magician_3rd_03,
    # 노도성황's 3rd_01, 마기지체's 3rd_02; 백호의희원'첨's Shaman_3rd_03), then the icon's number
    # (skill_x_320301 -> fx_skill_320301). A spell 연 lacks takes the sound of the 연 skill whose
    # effect it draws (YEON_FX): 극멸화참, 화룡멸진, 권신기법, 영혼방패'팔괘진, 자아파괴.
    'bgm': {
        'title': 'bgm_00000998_48', 'boss': 'bgm_boss01_48', 'boss2': 'bgm_boss03_48',
        'raid': 'BGM_Raid_China_1stBoss_48', 'raid_sea': 'BGM_Raid_YongGung_1stBoss_48',
        'raid_fire': 'BGM_Raid_FantasyIsland_3rdBoss', 'raid_hell': 'BGM_Raid_Hell_1stBoss',
        'sea': 'BGM_YongGung_Reef_48', 'island': 'BGM_FantasyIsland_AssemblyField_48',
        'japan': 'BGM_Raid_NewJapan_1stField', 'china': 'BGM_China_DryLand_48',
        'tower': 'BGM_YeonTower_Field',
    },
    # Each hunting ground's own music in 연: the Music of the 연 map of the same name (Commons Maps
    # table, see map_music()). Grounds 연 has no map for are left to the old soundtrack.
    'stage_bgm': {
        'novice': 'bgm_00000001_48', 'rat': 'bgm_00000005_48', 'snake': 'bgm_00000003_48',
        'deer': 'bgm_00000005_48', 'pig': 'bgm_00000003_48', 'bear': 'bgm_00000005_48',
        'fox': 'bgm_00000005_48', 'haunt': 'bgm_00000007_48', 'goblin': 'bgm_boss05_48',
        'bandit': 'bgm_00000114_64', 'japan': 'bgm_00000006_48', 'island': 'bgm_00000148_48',
        'rabbit': 'bgm_00000003_48', 'mantis': 'bgm_00000003_48', 'skull': 'bgm_00000004_48',
        'steppe': 'bgm_00000135_64', 'palace': 'bgm_00000121_48', 'royal': 'bgm_00000174_48',
        'deepsea': 'BGM_Raid_YongGung_1stField_48',
        # 연's own grounds (tools/yeon_grounds.json): their maps' music (하늘 아래's maps whose own
        # tunes the client does not carry take the 하늘 아래 raid's story-field tunes).
        'wolf': 'bgm_00000112_48', 'reef': 'BGM_YongGung_ScreamReef_48', 'wreck': 'BGM_YongGung_Wreck_48',
        'greatwall': 'BGM_China_GreatWallMine_48', 'qin': 'BGM_China_MysteriousRoyalTombMine_48',
        'gogyun': 'bgm_00000144_48', 'spidercave': 'bgm_00000154_48', 'gareung': 'bgm_00000145_48',
        'pokyeom': 'bgm_00000146_48', 'baekdu': 'bgm_00000156', 'baekdu2': 'bgm_00000105_48',
        'baekdu3': 'bgm_00000155', 'baekdu4': 'bgm_00000124_48', 'hwatang': 'bgm_00000128_48', 'hanbing': 'bgm_00000120',
        'geohae': 'bgm_00000119_48', 'cheolsang': 'bgm_00000124_48', 'abyss': 'BGM_Raid_Hell_StoryField', 'abyss2': 'bgm_jail_1_32', 'abyss3': 'BGM_Raid_Hell_2ndBoss', 'abyss4': 'BGM_Raid_Hell_3rdBoss', 'cow': 'bgm_00000002_48', 'zud': 'bgm_00000137_64', 'zud2': 'bgm_00000136_32',
        'sandolim': 'BGM_Raid_UnderSky_1stBoss', 'fallforest': 'BGM_Raid_UnderSky_1stStoryField',
        'jagwi': 'bgm_00000128_48', 'oldaram': 'bgm_00000166', 'haya': 'BGM_Raid_China_1stField_48',
        'lobi': 'BGM_Raid_UnderSky_2ndStoryField', 'aram': 'BGM_Raid_UnderSky_3rdStoryField',
        'ancient': 'BGM_Raid_UnderSky_4thStoryField',
    },
    # Raids 연 has no map for by name; two take the music of the 연 place they belong to
    # (도깨비굴 깊은 곳, 용궁 무한장).
    'raid_bgm': {'raid_goblin': 'bgm_boss05_48', 'raid_sea': 'BGM_Raid_YongGung_1stBoss_48'},
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


def map_music(maps_bin):
    """[{name, file, music}] for every map of 연's Maps table (Commons). The table is a name list
    (length-prefixed field names), then (field-name offset, value offset) int32 pairs, then a
    string pool at the offset the header's fourth word gives; a map starts at its Name."""
    import struct
    b = open(maps_bin, 'rb').read()
    _, start, _, pool = struct.unpack('<4I', b[:16])
    off, o, i = {}, 0, 16
    while i < start:
        n = b[i]
        off[b[i + 1:i + 1 + n].decode('ascii')] = o
        o += 1 + n
        i += 1 + n

    def pstr(v):
        p = pool + v
        if v <= 0 or p >= len(b):
            return None
        try:
            t = b[p + 1:p + 1 + b[p]].decode('utf-8')
        except UnicodeDecodeError:
            return None
        return t if t.isprintable() else None
    ints = struct.unpack_from('<%di' % ((pool - start) // 4), b, start)
    recs, cur = [], None
    for a, v in zip(ints, ints[1:]):
        if a == off['Name']:
            t = pstr(v)
            if t and not t.isdigit():
                cur = {'name': t}
                recs.append(cur)
        elif cur and a == off['File'] and 'file' not in cur and (pstr(v) or '').endswith('.bytes'):
            cur['file'] = pstr(v)
        elif cur and a == off['Music'] and 'music' not in cur and pstr(v):
            cur['music'] = pstr(v)
    return recs


def write_js(path):
    """web/js/yeon_sounds.js from MAP."""
    sounds = dict(MAP['keys'])
    sounds.update({'skill_' + k: v for k, v in MAP['skills'].items()})
    dump = lambda d: json.dumps(d, ensure_ascii=False, indent=1)
    open(path, 'w', encoding='utf-8').write(
        "// 바람의나라 연's own sounds (tools/yeon_sounds.py): for each game sound and spell, the clip the\n"
        "// game itself plays, out of the same 연 skill record as the spell's icon and effect (its sound\n"
        "// field, or its effect's PlaySound event). Used where the build has the clip; the old client's\n"
        "// numbered sounds stay the fallback.\n"
        f"export const YEON_SOUNDS = {dump(sounds)};\n\n"
        "// 연's music for the moments the old soundtrack has nothing for.\n"
        f"export const YEON_BGM = {dump(MAP['bgm'])};\n\n"
        "// Each hunting ground's music in 연 (its map of the same name), and two raids' by place.\n"
        f"export const YEON_STAGE_BGM = {dump(MAP['stage_bgm'])};\n\n"
        f"export const YEON_RAID_BGM = {dump(MAP['raid_bgm'])};\n")


def main():
    import UnityPy
    if sys.argv[1] == '--js':
        write_js(sys.argv[2])
        return
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

    maps_bin = None
    env = UnityPy.load(dexor(z.read(member['Commons.unity3d'])))
    for o in env.objects:
        if o.type.name not in ('MonoBehaviour', 'TextAsset'):
            continue
        d = o.read()
        if d.m_Name == 'Maps' and o.type.name == 'MonoBehaviour':
            maps_bin = bytes(o.read_typetree()['_buffer'])
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
    open(os.path.join(work, 'tables', 'Maps.bin'), 'wb').write(maps_bin) if maps_bin else None
    for c in list(MAP['bgm'].values()) + list(MAP['stage_bgm'].values()) + list(MAP['raid_bgm'].values()):
        src = os.path.join(work, 'sounds', c + '.wav')
        if os.path.exists(src):
            subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', src, '-af', 'loudnorm=I=-18:TP=-1.5',
                            '-ar', '44100', '-b:a', '96k', os.path.join(work, 'sound_pick', c + '.mp3')], check=True)
        else:
            print('missing bgm:', c)
    json.dump(MAP, open(os.path.join(work, 'sound_map.json'), 'w'), ensure_ascii=False, indent=1)
    if maps_bin:
        json.dump(map_music(os.path.join(work, 'tables', 'Maps.bin')), open(os.path.join(work, 'maps_music.json'), 'w'),
                  ensure_ascii=False, indent=0)
    size = sum(os.path.getsize(os.path.join(work, 'sound_pick', f)) for f in os.listdir(os.path.join(work, 'sound_pick')))
    print(f'{len(clips)} clips, {len(used) - len(missing)} picked sfx, {len(MAP["bgm"])} bgm, {size / 1e6:.1f} MB picked')


if __name__ == '__main__':
    main()
