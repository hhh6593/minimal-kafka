// Special items and the item book (도감).
//
// Every hunting ground and every raid has three special pieces of its own — a weapon, an armor
// and a shield — that drop only there, and very rarely (about 0.03% from a plain monster, more
// from champions, leaders and bosses). A special looks like an ordinary piece of that ground's
// rank but carries the ground's name and one extra option, and counts a rank above it. They are
// what makes a conquered ground worth hunting again; the 도감 shows where each piece drops.

import { STAGES, RAIDS, CLASSES } from './data.js';
import { GEAR, RAID_GEAR, raidSet, plainTiers, plainList, gearPower, lookTier } from './avatar.js';

// The name each source gives its specials.
const PREFIX = {
  novice: '다람쥐의', rat: '서생원의', snake: '구렁이의', deer: '광록의', pig: '홍돼지의', bear: '진웅의',
  fox: '구미호의', haunt: '원혼의', goblin: '도깨비의', bandit: '산적왕의', japan: '왜구의', sea: '용궁의',
  island: '환상의', volcano: '불꽃의', rabbit: '토끼 대왕의', bigsnake: '이무기의', bearman: '곰인의', mantis: '사마귀의',
  skull: '해골왕의', steppe: '초원의', yogoe: '요괴왕의', palace: '용왕의', royal: '왕궁의',
  raid_boar: '멧돼지왕의', raid_tiger: '산군의', raid_goblin: '대장의', raid_hydra: '삼두룡의',
  raid_sorcerer: '흑술사의', raid_sea: '해왕의', raid_fire: '화령의',
};

// The extra options, in turn. Each special has one.
export const OPTIONS = [
  { id: 'power', text: '공격력 +15%' },
  { id: 'life', text: '체력 +40' },
  { id: 'speed', text: '이동 속도 +10%' },
  { id: 'haste', text: '기술 재사용 -8%' },
  { id: 'regen', text: '체력 회복 +0.5%/초' },
  { id: 'mana', text: '마력 회복 +30%' },
  { id: 'magnet', text: '줍는 거리 +1칸' },
  { id: 'guard', text: '방어 +3' },
  { id: 'boss', text: '보스·우두머리에게 피해 +25%' },
];

const KINDS = ['weapon', 'armor', 'shield'];
export const KIND_NAME = { weapon: '무기', armor: '갑옷', shield: '방패' };

/** Every special: id, where it drops, its kind and option. */
export const SPECIALS = [];
const SOURCES = [...STAGES.map((s, i) => ({ id: s.id, name: s.name, i: s.level !== undefined ? s.level : i, raid: false })),
  ...RAIDS.map(r => ({ id: r.id, name: r.name.replace(' 레이드', ''), i: r.level, raid: true }))];
SOURCES.forEach((src, n) => KINDS.forEach((kind, k) => {
  SPECIALS.push({ id: `${src.id}:${kind}`, src: src.id, srcName: src.raid ? `${src.name} 레이드` : src.name, raid: src.raid,
    kind, opt: OPTIONS[(n * 3 + k) % OPTIONS.length], rank: src.i });
}));
export const SPECIAL = Object.fromEntries(SPECIALS.map(s => [s.id, s]));

/** The ordinary piece a special is made on, for a class: the raid's own piece, or the line's
 *  piece of the ground's rank. */
export function specialBase(sp, cls) {
  if (sp.craft) {
    const look = typeof sp.craft.look === 'string' ? sp.craft.look : sp.craft.look[cls];
    return lookTier(cls, sp.kind, look);
  }
  if (sp.raid) {
    const name = raidSet(sp.src, cls).find(([k]) => k === sp.kind)[1];
    return GEAR[cls][sp.kind].indexOf(name);
  }
  const list = plainList(cls, sp.kind);
  return list[Math.min(list.length - 1, Math.floor(sp.rank / 3) + 1)];
}

export function specialName(sp, cls) {
  if (sp.craft) return typeof sp.craft.name === 'string' ? sp.craft.name : sp.craft.name[cls];
  return `${PREFIX[sp.src]} ${GEAR[cls][sp.kind][specialBase(sp, cls)]}`;
}

/** A special counts a rank above its base. */
export function specialPower(sp, cls) {
  if (sp.craft) return sp.craft.pow;
  return gearPower(cls, sp.kind, specialBase(sp, cls)) + 1;
}

/** Where an ordinary tier drops: the grounds whose rank (with luck and a boss's +1) reach it. */
export function tierSources(cls, kind, tier) {
  const list = plainList(cls, kind), top = list.length - 1;
  tier = list.indexOf(tier);
  if (tier < 0) return [];
  return STAGES.filter((s, i) => {
    const lv = s.level !== undefined ? s.level : i;
    const lo = Math.min(top, Math.floor(lv / 3)), hi = Math.min(top, Math.floor(lv / 3) + 2);
    return tier >= lo && tier <= hi;
  }).map(s => s.name);
}

/** The raid an ordinary-looking piece belongs to, if any. */
export function raidOf(cls, kind, tier) {
  const name = GEAR[cls][kind][tier];
  const id = Object.keys(RAID_GEAR).find(r => raidSet(r, cls).some(([k, n]) => k === kind && n === name));
  return id ? RAIDS.find(r => r.id === id) : null;
}

// Materials for the smith's 조합: dropped by the grounds and raids of their kind.
export const MATS = {
  fur: { name: '짐승 가죽', icon: 'm_fur', from: ['deer', 'bear', 'bearman', 'steppe', 'raid_boar', 'raid_tiger'] },
  horn: { name: '도깨비 탈', icon: 'm_horn', from: ['goblin', 'yogoe', 'raid_goblin'] },
  bone: { name: '해골 조각', icon: 'm_bone', from: ['haunt', 'skull', 'raid_sorcerer'] },
  ember: { name: '불씨 단지', icon: 'm_ember', from: ['volcano', 'raid_fire'] },
  jade: { name: '백옥', icon: 'm_jade', from: ['island', 'palace', 'royal'] },
  scale: { name: '용의 비늘', icon: 'gem2', from: ['bigsnake', 'sea', 'palace', 'raid_hydra', 'raid_sea'] },
  pearl: { name: '여의주', icon: 'gem4', from: ['raid_hydra', 'palace'] },
};

// The smith's recipes beside the 용무기: sets by the material's grade, each piece with its own
// name, look, option and power (a hunting ground's best being about 4-5). look: a wardrobe
// name, or one per class. They are kept as specials ('sp:' + id) with craft set.
const OPT = id => OPTIONS.find(o => o.id === id);
export const CRAFTS = [
  { id: 'cr_fur_armor', kind: 'armor', name: '산짐승 가죽옷', look: '태권도복', pow: 3, opt: 'life', mats: { fur: 6 }, gold: 300 },
  { id: 'cr_fur_shield', kind: 'shield', name: '범가죽 방패', look: '대나무방패', pow: 3, opt: 'guard', mats: { fur: 6 }, gold: 300 },
  { id: 'cr_fur_weapon', kind: 'weapon', name: { warrior: '짐승뼈 철검', rogue: '짐승뼈 단도', mage: '짐승뼈 지팡이', poet: '짐승뼈 붓' },
    look: { warrior: '철검', rogue: '가시철단도', mage: '월광천봉', poet: '대붓' }, pow: 3, opt: 'boss', mats: { fur: 4, bone: 2 }, gold: 400 },
  { id: 'cr_horn_armor', kind: 'armor', name: '도깨비 가죽갑옷', look: '남자기모노', pow: 5, opt: 'speed', mats: { horn: 8, fur: 4 }, gold: 800 },
  { id: 'cr_horn_shield', kind: 'shield', name: '도깨비 탈 방패', look: '문신방패', pow: 5, opt: 'magnet', mats: { horn: 8 }, gold: 800 },
  { id: 'cr_horn_weapon', kind: 'weapon', name: { warrior: '뿔검', rogue: '뿔단도', mage: '뿔지팡이', poet: '뿔부채' },
    look: { warrior: '환두대도', rogue: '진아광검', mage: '원혼의낫', poet: '하늘개비' }, pow: 5, opt: 'power', mats: { horn: 10 }, gold: 1000 },
  { id: 'cr_bone_armor', kind: 'armor', name: '해골 갑주', look: '해골갑옷', pow: 6, opt: 'regen', mats: { bone: 10 }, gold: 1500 },
  { id: 'cr_bone_shield', kind: 'shield', name: '저승 방패', look: '팔세지도', pow: 6, opt: 'guard', mats: { bone: 10 }, gold: 1500 },
  { id: 'cr_bone_weapon', kind: 'weapon', name: { warrior: '망령검', rogue: '망령단도', mage: '망령의낫', poet: '망령초롱' },
    look: { warrior: '참마도', rogue: '저주의단검', mage: '원혼의낫', poet: '자월초롱' }, pow: 6, opt: 'haste', mats: { bone: 12, horn: 4 }, gold: 1800 },
  { id: 'cr_ember_armor', kind: 'armor', name: '화염 갑주', look: '불의갑주', pow: 8, opt: 'mana', mats: { ember: 10, bone: 4 }, gold: 3000 },
  { id: 'cr_ember_shield', kind: 'shield', name: '불꽃 방패', look: '일광방패', pow: 8, opt: 'boss', mats: { ember: 10 }, gold: 3000 },
  { id: 'cr_ember_weapon', kind: 'weapon', name: { warrior: '화염검', rogue: '화염단도', mage: '화염장', poet: '화염부채' },
    look: { warrior: '주작의검', rogue: '횃불', mage: '흑단화염장', poet: '횃불' }, pow: 8, opt: 'power', mats: { ember: 12, horn: 4 }, gold: 3500 },
  { id: 'cr_jade_armor', kind: 'armor', name: '옥룡 갑옷', look: '선녀의옷', pow: 9, opt: 'life', mats: { jade: 12, scale: 4 }, gold: 4500 },
  { id: 'cr_jade_shield', kind: 'shield', name: '백옥 방패', look: '정화의방패', pow: 9, opt: 'regen', mats: { jade: 12 }, gold: 4500 },
  { id: 'cr_dragon_armor', kind: 'armor', name: '용린갑', look: '용왕의용포', pow: 10, opt: 'guard', mats: { scale: 20, pearl: 1 }, gold: 6000 },
  { id: 'cr_dragon_shield', kind: 'shield', name: '용린방패', look: '백룡현갑', pow: 10, opt: 'power', mats: { scale: 15, pearl: 1 }, gold: 6000 },
];
for (const c of CRAFTS) {
  const sp = { id: c.id, src: 'craft', srcName: '대장장이 조합', raid: false, craft: c, kind: c.kind, opt: OPT(c.opt), rank: 0 };
  SPECIALS.push(sp);
  SPECIAL[c.id] = sp;
  // Put the look on every class's line now, so the loader fetches its sheets with the rest.
  for (const k of CLASSES) specialBase(sp, k.id);
}

/** The material a crafted piece's stars are paid in: its recipe's first, or scales for 용무기. */
export function starMats(sp, star) {
  const first = sp ? Object.keys(sp.craft.mats)[0] : 'scale';
  const need = { [first]: 2 * star + 2 };
  if (star === 4 && (first === 'scale' || !sp)) need.pearl = 1;
  return { mats: need, gold: 300 * star };
}

/** The 용무기 recipe: the class's best hunting-ground weapon at ★3, scales, a pearl and gold. */
export function craftRecipe(cls) {
  const list = plainList(cls, 'weapon');
  return { base: list[list.length - 1], star: 3, mats: { scale: 15, pearl: 1 }, gold: 3000 };
}

/** Copies needed to raise a piece from a star to the next (★1→★2 two, … ★4→★5 five). */
export const STAR_MAX = 5;
export function starCost(star) {
  return { copies: star + 1, gold: 150 * star * star };
}
