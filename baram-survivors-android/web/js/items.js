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
  hwagwa: '화과산의', murim: '무림의', musin: '무신의', deepsea: '심해의', kirin: '기린의', tagye: '타계의',
  raid_wukong: '제천대성의', raid_musin: '태염무신의', raid_brit: '브리트라의',
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
// The 대격변 places (v2) come last, so the older specials keep the options they had.
const SOURCES = [...STAGES.map((s, i) => ({ id: s.id, name: s.name, i: s.level !== undefined ? s.level : i, raid: false, v2: s.v2 })),
  ...RAIDS.map(r => ({ id: r.id, name: r.name.replace(' 레이드', ''), i: r.level, raid: true, v2: r.v2 }))]
  .sort((a, b) => !!a.v2 - !!b.v2);
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
  fur: { name: '짐승 가죽', icon: 'm_fur', from: ['deer', 'bear', 'bearman', 'steppe', 'raid_boar', 'raid_tiger', 'hwagwa'] },
  horn: { name: '도깨비 탈', icon: 'm_horn', from: ['goblin', 'yogoe', 'raid_goblin', 'hwagwa'] },
  bone: { name: '해골 조각', icon: 'm_bone', from: ['haunt', 'skull', 'raid_sorcerer', 'tagye'] },
  ember: { name: '불씨 단지', icon: 'm_ember', from: ['volcano', 'raid_fire'] },
  jade: { name: '백옥', icon: 'm_jade', from: ['island', 'palace', 'royal', 'kirin'] },
  scale: { name: '용의 비늘', icon: 'gem2', from: ['bigsnake', 'sea', 'palace', 'raid_hydra', 'raid_sea', 'deepsea'] },
  pearl: { name: '여의주', icon: 'gem4', from: ['raid_hydra', 'palace', 'deepsea'] },
  // Today's client's materials, as its smith asks for them: 금린 for the 중국전설 set, 순수의 강철
  // for the 일본전설 set, 조화의 정수 for the 용 set, 거마족의 영혼석 for 고대마령, a 제작 고문서
  // for every legendary piece, 겁화의 파편 for their stars, and the 은나무 파편·조각·가지 that
  // raise the 용무기 from 제일 to 제십.
  gold: { name: '금린', icon: 'm_gold', from: ['palace', 'royal', 'raid_tiger', 'raid_goblin', 'hwagwa', 'kirin', 'raid_wukong'] },
  steel: { name: '순수의 강철', icon: 'm_steel', from: ['volcano', 'japan', 'raid_sorcerer', 'raid_sea', 'raid_fire', 'musin', 'murim', 'raid_musin'] },
  essence: { name: '조화의 정수', icon: 'm_essence', from: ['raid_hydra', 'raid_sea', 'raid_fire', 'deepsea', 'kirin', 'raid_brit'] },
  soul: { name: '거마족의 영혼석', icon: 'm_soul', from: ['skull', 'yogoe', 'raid_sorcerer', 'tagye', 'raid_brit'] },
  scroll: { name: '제작 고문서', icon: 'm_scroll', from: ['raid_boar', 'raid_tiger', 'raid_goblin', 'raid_hydra', 'raid_sorcerer', 'raid_sea', 'raid_fire', 'raid_wukong', 'raid_musin', 'raid_brit'] },
  kalpa: { name: '겁화의 파편', icon: 'm_kalpa', from: ['volcano', 'palace', 'royal', 'raid_boar', 'raid_tiger', 'raid_goblin', 'raid_hydra', 'raid_sorcerer', 'raid_sea', 'raid_fire', 'hwagwa', 'murim', 'musin', 'deepsea', 'kirin', 'tagye', 'raid_wukong', 'raid_musin', 'raid_brit'] },
  silver1: { name: '은나무 파편', icon: 'm_silver1', from: ['sea', 'island', 'volcano', 'palace', 'royal', 'raid_boar', 'raid_tiger', 'raid_goblin', 'raid_hydra', 'raid_sorcerer', 'raid_sea', 'raid_fire', 'hwagwa', 'murim', 'musin', 'deepsea', 'kirin', 'tagye', 'raid_wukong', 'raid_musin', 'raid_brit'] },
  silver2: { name: '은나무 조각', icon: 'm_silver2', from: ['raid_hydra', 'raid_sorcerer', 'raid_sea', 'raid_fire', 'kirin', 'tagye', 'raid_wukong', 'raid_musin', 'raid_brit'] },
  silver3: { name: '은나무 가지', icon: 'm_silver3', from: ['raid_hydra', 'raid_sea', 'raid_fire', 'raid_musin', 'raid_brit'] },
};
/** How many of a material a kill drops: most fall from bosses (3-5), some from mini bosses. */
export function matCount(id, kind, raid) {
  const r = Math.random();
  if (id === 'pearl') return kind === 'boss' && r < (raid ? 0.6 : 0.12) ? 1 : 0;
  if (id === 'silver3') return kind === 'boss' && raid && r < 0.25 ? 1 : 0;
  if (id === 'scroll') return kind === 'boss' ? 1 + (r < 0.3 ? 1 : 0) : 0;
  if (id === 'essence' || id === 'silver2') return kind === 'boss' ? 2 + Math.floor(r * 3) : kind === 'mini' && r < 0.3 ? 1 : 0;
  return kind === 'boss' ? 3 + Math.floor(r * 3) : kind === 'mini' ? (r < 0.5 ? 1 : 0)
    : kind === 'champ' ? (r < 0.15 ? 1 : 0) : (r < 0.004 ? 1 : 0);
}

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
  { id: 'cr_dragon_armor', kind: 'armor', name: { warrior: '용천파천갑', rogue: '용마파천갑', mage: '용겸파천의', poet: '용랑파천의' }, look: '용왕의용포', pow: 10, opt: 'guard',
    mats: { scale: 20, pearl: 1 }, gold: 6000, pic: 'name', steps: [1, 3, 5, 7, 10] },
  { id: 'cr_dragon_shield', kind: 'shield', name: '용린방패', look: '백룡현갑', pow: 10, opt: 'power', mats: { scale: 15, pearl: 1 }, gold: 6000 },
  // Today's client's legendary gear (중국전설 금린, 일본전설 무신, 타계 고대마령, 용 멸아): drawn
  // with its own pictures (pic: the item's name, steps: the client's 성 shown at ★1-★5). The
  // walking figure wears the nearest old look. A piece with `from` is made out of another at
  // ★5, which goes into the making (구곡검 → 마곡검, 진일신검 → 극'진일신검, 파천갑 → 멸아갑).
  { id: 'cr_maryeong_armor', kind: 'armor', name: { warrior: '고대마령갑주', rogue: '고대마령갑주', mage: '고대마령의복', poet: '고대마령의복' },
    look: { warrior: '황혼의갑주', rogue: '흑영협객도복', mage: '남자제사장의상', poet: '도포' }, pow: 10, opt: 'regen', mats: { soul: 12, scroll: 1 }, gold: 5000,
    pic: 'name', steps: [1, 3, 5, 7, 10], legend: true },
  { id: 'cr_maryeong_shield', kind: 'shield', name: '고대마령의방패', look: '주술방패', pow: 10, opt: 'guard',
    mats: { soul: 10, scroll: 1 }, gold: 5000, pic: 'name', steps: [1, 3, 5, 7, 10], legend: true },
  { id: 'cr_gold_weapon', kind: 'weapon', name: { warrior: '구곡검', rogue: '협가검', mage: '영후단봉', poet: '대모홍접선' },
    look: { warrior: '청룡의검', rogue: '백화검', mage: '해룡의지팡이', poet: '흑단부채' }, pow: 11, opt: 'power', mats: { gold: 12, scroll: 1 }, gold: 6000,
    pic: 'name', steps: [1, 3, 5, 7, 9], legend: true },
  { id: 'cr_gold_armor', kind: 'armor', name: { warrior: '금린천화갑', rogue: '금린천화갑', mage: '금린천추갑', poet: '금린천추갑' },
    look: { warrior: '곤룡포', rogue: '곤룡포', mage: '남자신관복', poet: '남자신관복' }, pow: 11, opt: 'life', mats: { gold: 12, scroll: 1 }, gold: 6000,
    pic: 'name', steps: [1, 3, 5, 7, 10], legend: true },
  { id: 'cr_gold_shield', kind: 'shield', name: '금린방패', look: '여신의방패', pow: 11, opt: 'guard',
    mats: { gold: 10, scroll: 1 }, gold: 6000, pic: 'name', steps: [1, 3, 5, 7, 10], legend: true },
  { id: 'cr_steel_weapon', kind: 'weapon', name: { warrior: '진일신검', rogue: '청일기창', mage: '황염곤봉', poet: '적염곤봉' },
    look: { warrior: '일월대도', rogue: '삼첨도', mage: '백운장', poet: '하늘개비' }, pow: 12, opt: 'haste', mats: { steel: 14, scroll: 1 }, gold: 8000,
    pic: 'name', steps: [1, 3, 5, 7, 9], legend: true },
  { id: 'cr_steel_armor', kind: 'armor', name: { warrior: '태염무신장갑', rogue: '태염무신장갑', mage: '태광천신의복', poet: '태광천신의복' },
    look: { warrior: '궁중무사갑주', rogue: '궁중무사갑주', mage: '여자성광법의', poet: '남자성광법의' }, pow: 12, opt: 'mana', mats: { steel: 14, scroll: 1 }, gold: 8000,
    pic: 'name', steps: [1, 3, 5, 7, 10], legend: true },
  { id: 'cr_steel_shield', kind: 'shield', name: '무신귀면방', look: '거울방패', pow: 12, opt: 'boss',
    mats: { steel: 12, scroll: 1 }, gold: 8000, pic: 'name', steps: [1, 3, 5, 7, 10], legend: true },
  { id: 'cr_gold_weapon2', kind: 'weapon', name: { warrior: '마곡검', rogue: '패협검', mage: '백선마봉', poet: '암혈홍접선' },
    look: { warrior: '청룡의검', rogue: '백화검', mage: '해룡의지팡이', poet: '흑단부채' }, pow: 13, opt: 'boss', from: 'cr_gold_weapon',
    mats: { gold: 20, kalpa: 15, scroll: 2 }, gold: 15000, pic: 'name', legend: true },
  { id: 'cr_dragon_armor2', kind: 'armor', name: { warrior: '용천멸아갑', rogue: '용마멸아갑', mage: '용겸멸아의', poet: '용랑멸아의' },
    look: '용왕의용포', pow: 13, opt: 'life', from: 'cr_dragon_armor', mats: { essence: 15, scale: 20, pearl: 2 }, gold: 20000,
    pic: 'name', steps: [1, 3, 5, 7, 10], legend: true },
  { id: 'cr_brit_shield', kind: 'shield', name: '브리트라한의방패', look: '천성대방패', pow: 13, opt: 'regen', from: 'cr_steel_shield',
    mats: { essence: 10, kalpa: 20, scroll: 2 }, gold: 20000, pic: 'name', steps: [1, 3, 5, 7, 9], legend: true },
  { id: 'cr_steel_weapon2', kind: 'weapon', name: { warrior: "극'진일신검", rogue: "극'청일기창", mage: "극'황염곤봉", poet: "극'적염곤봉" },
    look: { warrior: '일월대도', rogue: '삼첨도', mage: '백운장', poet: '하늘개비' }, pow: 14, opt: 'power', from: 'cr_steel_weapon',
    mats: { steel: 24, kalpa: 20, scroll: 2 }, gold: 20000, pic: 'name', legend: true },
];
for (const c of CRAFTS) {
  const sp = { id: c.id, src: 'craft', srcName: '대장장이 조합', raid: false, craft: c, kind: c.kind, opt: OPT(c.opt), rank: 0 };
  SPECIALS.push(sp);
  SPECIAL[c.id] = sp;
  // Put the look on every class's line now, so the loader fetches its sheets with the rest.
  for (const k of CLASSES) specialBase(sp, k.id);
}

/**
 * What a crafted piece's next star costs. Old-style pieces: their recipe's first material.
 * Legendary pieces: 겁화의 파편, as in today's client. The 용무기 (sp null) climbs 제일 to 제십
 * like the client's: 은나무 파편 to 제오, 은나무 조각 (and 여의주) to 제구, and a 은나무 가지 for 제십.
 */
export function starMats(sp, star) {
  if (!sp) {
    if (star <= 4) return { mats: Object.assign({ silver1: 2 * star + 2 }, star === 4 ? { pearl: 1 } : {}), gold: 500 * star };
    if (star <= 8) return { mats: Object.assign({ silver2: star, scale: 5 }, star % 2 === 0 ? { pearl: 1 } : {}), gold: 1500 * star };
    return { mats: { silver3: 1, pearl: 2, essence: 10 }, gold: 30000 };
  }
  if (sp.craft.legend) {
    const need = { kalpa: (sp.craft.from ? 3 : 2) * star + 2 };
    if (star === 4) need.scroll = 1;
    return { mats: need, gold: 1000 * star * (sp.craft.from ? 2 : 1) };
  }
  const first = Object.keys(sp.craft.mats)[0];
  const need = { [first]: 2 * star + 2 };
  if (star === 4 && first === 'scale') need.pearl = 1;
  return { mats: need, gold: 300 * star };
}

/** The 용무기 line of each class, 제일 to 제십 (today's client's names). */
const NUM = ['일', '이', '삼', '사', '오', '육', '칠', '팔', '구', '십'];
const DRAGON_LINE = { warrior: ['용천제', '검'], rogue: ['용마제', '검'], mage: ['용겸제', '봉'], poet: ['용랑제', '봉'] };
export const DRAGON_MAX = 10;
export function dragonName(cls, step) {
  const [a, b] = DRAGON_LINE[cls];
  return a + NUM[Math.max(1, Math.min(DRAGON_MAX, step)) - 1] + b;
}

/** The picture name (today's client's item render) of a crafted piece at a star, or null. */
export function craftPicture(sp, cls, star = 1) {
  const c = sp && sp.craft;
  if (!c || !c.pic) return null;
  const name = typeof c.name === 'string' ? c.name : c.name[cls];
  return c.steps ? name + c.steps[Math.max(1, Math.min(c.steps.length, star)) - 1] + '성' : name;
}

/** Every picture the gear can use, for tools/fetch_gear.py. */
export function gearPictures() {
  const out = new Set();
  for (const cls of Object.keys(DRAGON_LINE)) for (let i = 1; i <= DRAGON_MAX; i++) out.add(dragonName(cls, i));
  for (const c of CRAFTS) {
    if (!c.pic) continue;
    for (const cls of Object.keys(DRAGON_LINE)) for (let st = 1; st <= 5; st++) out.add(craftPicture(SPECIAL[c.id], cls, st));
  }
  return [...out];
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
