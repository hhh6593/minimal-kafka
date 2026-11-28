// 방어구 추가 (README "사신수 무신 방어구 · 투구·방패·망토 추가"): the smith's recipes for the
// 사신수 무신 set (갑옷·기운) and more 투구, 방패 and 망토 along the whole ladder. Data only:
// items.js makes them specials ('sp:' + id) after every older piece, so no saved place moves.
//
// Every piece but the 무신 set is 바람의나라 연's own item, worn as 연 draws it on each class (its
// 코디 layer "c<id>", base) with 연's own icon. The 무신 set is the original's (연 has none): its
// armour 연's plate 천상남자무갑 in the 신수's colours with the original's flares, its 기운 the
// original's aura (tools/musin_worn.py, layers "s_musin_*"), the icon the original's picture.
//
// Fields as items.js CRAFTS, and:
//   group     the smith's heading the recipe sits under (game.js)
//   dropFrom  grounds and raids whose boss and leaders now and then drop the piece itself (as a
//             special of that place: game.js rollSpecial)
//   set       the 사신수 of a 무신 piece (MUSIN_SET: 갑옷 and 기운 of one 신수 worn together)

import { CLASSES } from './data.js';

const ALL = CLASSES.map(c => c.id);
const SHIELDED = ['warrior', 'rogue', 'mage', 'poet'];
const each = id => Object.fromEntries(ALL.map(c => [c, [id]]));
// 연's per-class helmets of a set (its 투구 / 두건 / 모자 / 머리띠 … one per class's own headgear).
const byClass = m => Object.fromEntries(Object.entries(m).map(([c, id]) => [c, [id]]));

const G_HELM = '조합 · 투구 (연의 투구, 레이드마다 하나)';
const G_SHIELD = '조합 · 방패 (연의 방패)';
const G_CAPE = '조합 · 망토 (연의 망토)';
const G_MUSIN = '조합 · 사신수 무신 방어구 (갑옷 + 기운 = 세트 효과)';

export const MUSIN_SETS = { cheong: '청룡', baekho: '백호', jujak: '주작', hyeonmu: '현무' };
// The 성물 and the raid of each 신수 (items.js SINSU_GATE: the raid where it falls in full).
const SINSU_RAID = { cheong: 'raid_varuna', baekho: 'raid_airavata', jujak: 'raid_agni', hyeonmu: 'raid_varuna' };
const ARMOR_OPT = { cheong: 'mana', baekho: 'life', jujak: 'regen', hyeonmu: 'guard' };
const CAPE_OPT = { cheong: 'haste', baekho: 'speed', jujak: 'boss', hyeonmu: 'life' };
// Their second lines and features (items.js gearExtra), by 신수 too.
const ARMOR_EXTRA = { cheong: ['final', 'killheal'], baekho: ['crit', 'killheal'], jujak: ['vamp', 'killheal'], hyeonmu: ['regen', 'killheal'] };
const CAPE_EXTRA = { cheong: ['critdmg', 'swift'], baekho: ['critdmg', 'swift'], jujak: ['final', 'swift'], hyeonmu: ['regen', 'swift'] };

// ---- 무신 세트 효과 (retune here) ----
// 갑옷 and 기운 of the same 신수 worn together: more option lines (counted as the pieces' own) and,
// for 현무, its 호신강기. Each fits its 신수: 청룡 the water that runs (skills), 백호 the tiger's
// fang (crits), 주작 the fire (every blow), 현무 the shell (guard).
export const MUSIN_SET = {
  cheong: { name: '청룡의 비호', lines: ['haste', 'haste', 'mana'], text: '기술 재사용 -16% · 마력 회복 +30%' },
  baekho: { name: '백호의 송곳니', lines: ['crit', 'crit', 'critdmg'], text: '치명타 확률 +8% · 치명타 피해 +25%' },
  jujak: { name: '주작의 업화', lines: ['final', 'final', 'vamp'], text: '최종 피해 +10% · 흡혈 0.5%' },
  hyeonmu: { name: '현무의 껍질', lines: ['guard', 'guard', 'life'], proc: 'barrier', text: '방어 +6 · 체력 +40 · 호신강기' },
};

export const ARMORY = [
  // ---------------- 투구 (every class)
  { id: 'cr_helm_sumun', group: G_HELM, kind: 'helmet', name: '수문장투구', look: '가죽남자투구', base: each(7100261), pow: 3, opt: 'life', mats: { fur: 6 }, gold: 300, dropFrom: ['raid_boar'] },
  { id: 'cr_helm_wind', group: G_HELM, kind: 'helmet', name: '바람의두건', look: '구리남자투구', base: each(7100163), pow: 4.5, opt: 'speed', mats: { fur: 10 }, gold: 600, needs: 'raid_tiger', dropFrom: ['raid_tiger'] },
  { id: 'cr_helm_jeokrang', group: G_HELM, kind: 'helmet', name: '적랑투구', look: '청동남자투구', base: each(7100276), pow: 5.5, opt: 'haste', mats: { horn: 10 }, gold: 900, needs: 'raid_goblin', dropFrom: ['raid_goblin'] },
  { id: 'cr_helm_yongwang', group: G_HELM, kind: 'helmet', name: '용왕의투구', look: '금장남자투구', base: each(7100200), pow: 6.5, opt: 'regen', mats: { jade: 8, scale: 4 }, gold: 1800, needs: 'palace', dropFrom: ['palace'] },
  { id: 'cr_helm_ice', group: G_HELM, kind: 'helmet', name: '얼음의투구', look: '금장남자투구', base: each(7100169), pow: 7.5, opt: 'guard', mats: { scale: 10 }, gold: 2000, needs: 'raid_hydra', dropFrom: ['raid_hydra'] },
  { id: 'cr_helm_thunder', group: G_HELM, kind: 'helmet', name: '번개의두건', look: '북방의남자투구', base: each(7100165), pow: 8.5, opt: 'haste', mats: { bone: 12 }, gold: 2500, needs: 'raid_sorcerer', dropFrom: ['raid_sorcerer'] },
  { id: 'cr_helm_water', group: G_HELM, kind: 'helmet', name: '물의머리띠', look: '북방의남자투구', base: each(7100167), pow: 8.5, opt: 'mana', mats: { scale: 12 }, gold: 2500, needs: 'raid_sea', dropFrom: ['raid_sea'] },
  { id: 'cr_helm_fire', group: G_HELM, kind: 'helmet', name: '불의투구', look: '북방의남자투구', base: each(7100164), pow: 9.5, opt: 'boss', mats: { ember: 12 }, gold: 3500, needs: 'raid_fire', dropFrom: ['raid_fire'] },
  // 천부연 (연's late set: its bows, spears … are the 바루나 raid's) and 비천 (the flying heavens: 선계):
  // each class its own headgear of the set, as 연 gives it.
  { id: 'cr_helm_cheonbu', group: G_HELM, kind: 'helmet', legend: true,
    name: { warrior: '천부연투구', rogue: '천부연의두건', mage: '천부연모자', poet: '천부연의머리띠', archer: '천부연각건', lancer: '천부연무사투구', monk: '천부연머리보호대', magus: '천부연마관', celestial: '천부연천관', dokkaebi: '천부연탕건', reaper: '천부연갓' },
    base: byClass({ warrior: 7100409, rogue: 7100410, mage: 7100411, poet: 7100412, archer: 7100414, lancer: 7100415, monk: 7100413, magus: 341004, celestial: 7100416, dokkaebi: 291003, reaper: 321004 }),
    look: '북방의남자투구', pow: 12.5, opt: 'life', mats: { essence: 10, kalpa: 10, scroll: 1 }, gold: 12000, needs: 'raid_varuna' },
  { id: 'cr_helm_bicheon', group: G_HELM, kind: 'helmet', legend: true,
    name: { warrior: '비천투구', rogue: '비천의두건', mage: '비천의모자', poet: '비천의머리띠', archer: '비천각건', lancer: '비천무사투구', monk: '비천의머리보호대', magus: '비천마관', celestial: '비천천관', dokkaebi: '비천탕건', reaper: '비천지모' },
    base: byClass({ warrior: 7100472, rogue: 7100473, mage: 7100474, poet: 7100475, archer: 7100477, lancer: 7100478, monk: 7100476, magus: 341017, celestial: 7100479, dokkaebi: 7100480, reaper: 7100652 }),
    look: '북방의남자투구', pow: 14, opt: 'boss', mats: { seongi: 4, essence: 15, kalpa: 20, scroll: 2 }, gold: 30000, needs: 'raid_heaven' },

  // ---------------- 방패 (the classes that carry one)
  { id: 'cr_shield_geumjang', group: G_SHIELD, kind: 'shield', only: SHIELDED, name: '금장방패', look: '거울방패', base: each(307189), pow: 4, opt: 'guard', mats: { fur: 6, horn: 2 }, gold: 500, dropFrom: ['raid_boar'] },
  { id: 'cr_shield_nanga', group: G_SHIELD, kind: 'shield', only: SHIELDED, name: '낭아방패', look: '거울방패', base: each(309342), pow: 5.5, opt: 'speed', mats: { fur: 12 }, gold: 900, needs: 'raid_tiger', dropFrom: ['raid_tiger', 'wolf'] },
  { id: 'cr_shield_chilheuk', group: G_SHIELD, kind: 'shield', only: SHIELDED, name: '칠흑방패', look: '거울방패', base: each(7100270), pow: 8.5, opt: 'regen', mats: { bone: 12 }, gold: 2500, needs: 'raid_sorcerer', dropFrom: ['raid_sorcerer'] },
  { id: 'cr_shield_obsidian', group: G_SHIELD, kind: 'shield', only: SHIELDED, name: '바다 흑요석 방패', look: '거울방패', base: each(307158), pow: 8.5, opt: 'guard', mats: { scale: 12 }, gold: 2500, needs: 'raid_sea', dropFrom: ['raid_sea'] },
  { id: 'cr_shield_hongok', group: G_SHIELD, kind: 'shield', only: SHIELDED, name: '바람홍옥방패', look: '여신의방패', base: each(7100194), pow: 9.5, opt: 'boss', mats: { ember: 12 }, gold: 3500, needs: 'raid_fire', dropFrom: ['raid_fire'] },
  { id: 'cr_shield_coral', group: G_SHIELD, kind: 'shield', only: SHIELDED, legend: true, name: '산호의 방패', look: '여신의방패', base: each(450525), pow: 12.5, opt: 'life', mats: { essence: 10, scale: 15, scroll: 1 }, gold: 12000, needs: 'raid_varuna', dropFrom: ['raid_varuna'] },
  { id: 'cr_shield_yeosin2', group: G_SHIELD, kind: 'shield', only: SHIELDED, legend: true, name: "진'여신의방패", look: '여신의방패', base: each(7100392), pow: 13.5, opt: 'regen', mats: { jade: 20, gold: 10, scroll: 2 }, gold: 18000, needs: 'raid_airavata' },
  { id: 'cr_shield_sura', group: G_SHIELD, kind: 'shield', only: SHIELDED, legend: true, name: '수라방패', look: '천성대방패', base: each(309356), pow: 14, opt: 'boss', mats: { hoehan: 6, soul: 15, kalpa: 15, scroll: 2 }, gold: 28000, needs: 'raid_hell' },
  { id: 'cr_shield_jibae', group: G_SHIELD, kind: 'shield', only: SHIELDED, legend: true, name: '지배자방패', look: '천성대방패', base: each(309357), pow: 14.5, opt: 'guard', mats: { seongi: 4, essence: 15, kalpa: 20, scroll: 2 }, gold: 30000, needs: 'raid_heaven' },

  // ---------------- 망토 (every class)
  { id: 'cr_cape_hohae', group: G_CAPE, kind: 'cape', name: '호해의 망토', look: '남옥망토', base: each(510006), pow: 4, opt: 'speed', mats: { fur: 8 }, gold: 500, dropFrom: ['raid_tiger'] },
  { id: 'cr_cape_jibae', group: G_CAPE, kind: 'cape', name: '지배자망토', look: '숲의권속망토', base: each(309234), pow: 7, opt: 'regen', mats: { bone: 10, horn: 4 }, gold: 1800, needs: 'skull', dropFrom: ['skull'] },
  { id: 'cr_cape_gwimun', group: G_CAPE, kind: 'cape', name: '귀문진산등갑', look: '추방자망토', base: each(85005), pow: 9.5, opt: 'guard', mats: { soul: 10, bone: 6 }, gold: 4000, needs: 'raid_sorcerer', dropFrom: ['raid_sorcerer'] },
  { id: 'cr_cape_bukdu', group: G_CAPE, kind: 'cape', legend: true, name: '북두칠성 문지기의 망토', look: '몰락자망토', base: each(803700), pow: 11.5, opt: 'haste', mats: { steel: 10, kalpa: 6, scroll: 1 }, gold: 9000, needs: 'raid_musin' },
  { id: 'cr_cape_sari', group: G_CAPE, kind: 'cape', legend: true, name: '사리의 망토', look: '몰락자망토', base: each(450511), pow: 13, opt: 'life', mats: { soul: 15, essence: 8, scroll: 2 }, gold: 16000, needs: 'raid_gwoe' },
  { id: 'cr_cape_heukryong', group: G_CAPE, kind: 'cape', legend: true, name: '흑룡의 망토', look: '몰락자망토', base: each(803713), pow: 14.5, opt: 'boss', mats: { hoehan: 8, kalpa: 20, scroll: 2 }, gold: 30000, needs: 'raid_hell' },
  // 신 용궁 탑 레이드 (2026-11-28): its 기묘한 진주 → 연's 해군 제독 망토 (803689, every class's 코디), now and then from the tower itself.
  { id: 'cr_cape_jedok', group: G_CAPE, kind: 'cape', legend: true, name: '해군 제독 망토', look: '몰락자망토', base: each(803689), pow: 14, opt: 'regen', mats: { jinju: 6, essence: 12, kalpa: 15, scroll: 2 }, gold: 26000, needs: 'raid_yonggung', dropFrom: ['raid_yonggung'] },
];

// ---------------- 사신수 무신 방어구 (after the 신수's own raid, out of its 성물)
for (const [s, n] of Object.entries(MUSIN_SETS)) {
  ARMORY.push({ id: `cr_musin_armor_${s}`, group: G_MUSIN, kind: 'armor', set: s, legend: true, musin: true, noCoordi: true,
    name: `${n}무신의갑옷`, pic: 'name', picName: `${n}무신의갑옷(남)`, worn: Object.fromEntries(ALL.map(c => [c, `s_musin_armor_${s}`])),
    look: '황혼의갑주', pow: 14, opt: ARMOR_OPT[s], extra: ARMOR_EXTRA[s][0], proc: ARMOR_EXTRA[s][1], mats: { [`sinsu_${s}`]: 6, essence: 12, kalpa: 10, scroll: 2 }, gold: 25000, needs: SINSU_RAID[s] });
  ARMORY.push({ id: `cr_musin_cape_${s}`, group: G_MUSIN, kind: 'cape', set: s, legend: true, musin: true, noCoordi: true,
    name: `${n}무신의기운`, pic: 'name', worn: Object.fromEntries(ALL.map(c => [c, `s_musin_aura_${s}`])),
    look: '몰락자망토', pow: 14, opt: CAPE_OPT[s], extra: CAPE_EXTRA[s][0], proc: CAPE_EXTRA[s][1], mats: { [`sinsu_${s}`]: 4, kalpa: 15, scroll: 1 }, gold: 20000, needs: SINSU_RAID[s] });
}

/** The 무신 set worn ({armorSp, capeSp}): its MUSIN_SET entry, or null. */
export function musinSetOf(g) {
  const a = g && /^cr_musin_armor_(\w+)$/.exec(g.armorSp || ''), c = g && /^cr_musin_cape_(\w+)$/.exec(g.capeSp || '');
  return a && c && a[1] === c[1] ? { id: a[1], ...MUSIN_SET[a[1]] } : null;
}
