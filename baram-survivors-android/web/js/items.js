// Special items and the item book (도감).
//
// Every hunting ground and every raid has three special pieces of its own — a weapon, an armor
// and a shield — that drop only there, and very rarely (about 0.03% from a plain monster, more
// from champions, leaders and bosses). A special looks like an ordinary piece of that ground's
// rank but carries the ground's name and one extra option, and counts a rank above it. They are
// what makes a conquered ground worth hunting again; the 도감 shows where each piece drops.

import { STAGES, RAIDS } from './data.js';
import { GEAR, RAID_GEAR, raidSet, plainTiers, plainList, gearPower } from './avatar.js';

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
  if (sp.raid) {
    const name = raidSet(sp.src, cls).find(([k]) => k === sp.kind)[1];
    return GEAR[cls][sp.kind].indexOf(name);
  }
  const list = plainList(cls, sp.kind);
  return list[Math.min(list.length - 1, Math.floor(sp.rank / 3) + 1)];
}

export function specialName(sp, cls) {
  return `${PREFIX[sp.src]} ${GEAR[cls][sp.kind][specialBase(sp, cls)]}`;
}

/** A special counts a rank above its base. */
export function specialPower(sp, cls) {
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
  scale: { name: '용의 비늘', icon: 'gem2', from: ['bigsnake', 'sea', 'palace', 'raid_hydra', 'raid_sea'] },
  pearl: { name: '여의주', icon: 'gem4', from: ['raid_hydra', 'palace'] },
};

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
