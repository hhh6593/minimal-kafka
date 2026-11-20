// Special items and the item book (도감).
//
// Every hunting ground and every raid has three special pieces of its own — a weapon, an armor
// and a shield — that drop only there, and very rarely (about 0.03% from a plain monster, more
// from champions, leaders and bosses). A special looks like an ordinary piece of that ground's
// rank but carries the ground's name and one extra option, and counts a rank above it. They are
// what makes a conquered ground worth hunting again; the 도감 shows where each piece drops.

import { STAGES, RAIDS, CLASSES } from './data.js';
import { GEAR, plainTiers, plainList, gearPower, lookTier, raidTier, raidOwner, settleRaidPieces, settleLateRaids, RAID_GEAR } from './avatar.js';
import { SOURCE_GYEOK, CRAFT_GYEOK } from './gyeok.js';
import { ARMORY } from './armory.js';
export { MUSIN_SET, musinSetOf } from './armory.js';

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
  raid_gwoe: '괴력난신의', raid_varuna: '바루나의', raid_agni: '아그니의', raid_airavata: '아이라바타의',
  wolf: '만월의', reef: '암초의', wreck: '난파선의', greatwall: '장성의', qin: '토우의', gogyun: '고균도의', spidercave: '지주의',
  gareung: '가릉도의', pokyeom: '폭염도의', baekdu: '백두의', baekdu2: '요괴목의', baekdu3: '기룡의', baekdu4: '선인의',
  hanbing: '한빙의', geohae: '거해의', zud: '고원의', zud2: '주술사의', sandolim: '협곡의', fallforest: '몰락의', jagwi: '자귀의',
  oldaram: '섬망의', haya: '하야의', lobi: '세암의', aram: '황무지의', ancient: '도성의',
  hwatang: '화탕의', cheolsang: '철상의', abyss: '묘지의', abyss2: '고통의', abyss3: '혼돈의', abyss4: '세계석의', cow: '음매의',
  raid_hell: '대적의', raid_heaven: '선계의',
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
export const KIND_NAME = { weapon: '무기', armor: '갑옷', shield: '방패', helmet: '투구', cape: '망토' };

/** Every special: id, where it drops, its kind and option. */
export const SPECIALS = [];
// The 대격변 places (v2) come last, so the older specials keep the options they had.
// 연's own grounds (v3) after those, for the same reason.
const era = s => (s.v3 ? 2 : s.v2 ? 1 : 0);
const SOURCES = [...STAGES.map((s, i) => ({ id: s.id, name: s.name, i: s.level !== undefined ? s.level : i, raid: false, v2: s.v2, v3: s.v3 })),
  ...RAIDS.map(r => ({ id: r.id, name: r.name.replace(' 레이드', ''), i: r.level, raid: true, v2: r.v2, v3: r.v3 }))]
  .sort((a, b) => era(a) - era(b));
SOURCES.forEach((src, n) => KINDS.forEach((kind, k) => {
  // A boss's specials carry its nature (gyeok.js SOURCE_GYEOK): the weapon its 격, the armour
  // an answer in its status when struck, the shield a ward against that status.
  const sg = SOURCE_GYEOK[src.id];
  const gy = !sg ? null : kind === 'weapon' ? sg.weapon : kind === 'armor' ? 'ban_' + sg.st : null;
  SPECIALS.push({ id: `${src.id}:${kind}`, src: src.id, srcName: src.raid ? `${src.name} 레이드` : src.name, raid: src.raid,
    kind, opt: OPTIONS[(n * 3 + k) % OPTIONS.length], rank: src.i, gyeok: gy, ward: kind === 'shield' && sg ? sg.st : null });
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
    return raidTier(sp.src, cls, sp.kind); // -1: a raid's shield, for a class with none
  }
  // Its own look where the boss has one in this class's line (a fox's 칠지도, a skull's 참마도).
  const sg = SOURCE_GYEOK[sp.src];
  if (sg && sg.looks) {
    const name = sp.kind === 'weapon' ? sg.looks[['warrior', 'rogue', 'mage', 'poet'].indexOf(cls)] : sg.looks[sp.kind === 'armor' ? 4 : 5];
    const at = name ? GEAR[cls][sp.kind].indexOf(name) : -1;
    if (at >= 0) return at;
  }
  return rankBase(sp, cls);
}
/** The grounds' piece of a source's rank in a class's line. A class whose plain line of this kind
 *  is all crafted looks (the 주술사's shields) takes the line as it stands, so the special still has
 *  a base, a name and a picture. */
function rankBase(sp, cls) {
  let list = plainList(cls, sp.kind);
  if (!list.length) list = GEAR[cls][sp.kind].map((n, i) => i);
  return list[Math.min(list.length - 1, Math.floor(sp.rank / 3) + 1)];
}

export function specialName(sp, cls) {
  if (sp.craft) return typeof sp.craft.name === 'string' ? sp.craft.name : sp.craft.name[cls];
  if (sp.rarity) return abyssName(sp, cls);
  return `${PREFIX[sp.src]} ${GEAR[cls][sp.kind][specialBase(sp, cls)]}`;
}

// ---- special rank tuning (retune here; README "장비 티어") ----
// A boss's special is a find, not the end of the road. Its rank: its base piece's +1 (+0.5 with a 격
// or a ward), at most `cap` at ★1 and `top` with its stars. A weapon's 공격력 option (×1.15) is worth
// some three ranks at the top (1 + 0.12 × 13.5 = 2.62, ×1.15 = 3.01, rank 16.8's), so a weapon that
// carries one is capped `powerEdge` lower. Weapons: 14.5 (×2.74) at ★1, 16 (×2.92) at ★5, under the
// 사신수 (15, ★5 17) and the 용무기 제십 (17.2, ×3.06); with 공격력 11.5 (×2.74) / 13 (×2.94).
// (Before: 15 / 13.5 at ★1 with no top: 아이라바타's bow at ★5 struck ×3.29, over the 용무기 제십.)
// Armour, shields, helmets and capes: 15 / 17 (아이라바타's plain armour is 14 already).
export const SPECIAL_RANK = { weapon: { cap: 14.5, top: 16 }, other: { cap: 15, top: 17 }, powerEdge: 3 };
function specialCaps(sp) {
  const c = SPECIAL_RANK[sp.kind === 'weapon' ? 'weapon' : 'other'];
  const cut = sp.kind === 'weapon' && (sp.opts || [sp.opt && sp.opt.id]).includes('power') ? SPECIAL_RANK.powerEdge : 0;
  return { cap: c.cap - cut, top: c.top - cut };
}
/** A special counts a rank above its base, and half a rank more for a 격 or a ward. */
export function specialPower(sp, cls) {
  if (sp.craft) return sp.craft.pow + (sp.gyeok ? 0.5 : 0);
  if (sp.rarity) return abyssPower(sp.rank) + RARITY[sp.rarity].pow + (sp.taecho ? TAECHO_EDGE.pow : 0);
  // The base it counts on: its look's place when that is a grounds' piece or a raid's. A look that
  // is only a crafted piece's (해골갑옷, 거울방패 …, added to every line by the smith's recipes) has
  // no rank of its own: the grounds' piece of the source's rank counts. (By the look's raw place in
  // the line, a 원혼 armour of rank 7 counted 15, more than any armour, above the 현무불괴갑.)
  // A ground boss's look that is a raid's piece (원혼's 주술방패, 괴력난신's) counts no more than a raid
  // of the ground's own level gives (it counted the raid's: a rank-7 ground's shield 12.5).
  let t = specialBase(sp, cls);
  if (!sp.raid && t >= 0 && !plainList(cls, sp.kind).includes(t) && !raidOwner(cls, sp.kind, t)) t = rankBase(sp, cls);
  let base = gearPower(cls, sp.kind, t);
  if (!sp.raid && raidOwner(cls, sp.kind, t)) base = Math.min(base, Math.max(gearPower(cls, sp.kind, rankBase(sp, cls)), raidPowAt(sp.rank)));
  return Math.min(specialCaps(sp).cap, base + 1 + (sp.gyeok || sp.ward ? 0.5 : 0));
}
/** The set power of the strongest raid of a level or below (0 below the first). */
function raidPowAt(level) {
  return RAIDS.filter(r => r.level <= level && RAID_GEAR[r.id]).reduce((m, r) => Math.max(m, RAID_GEAR[r.id].pow), 0);
}
/** A piece's rank worn at a star: half a rank a star; a boss's find no further than its top. */
export function specialRank(sp, cls, star = 1) {
  // (the 사신수 지존's weapons a little a star: SINSU_STAR; a one-step piece has no stars: craft.stars)
  const step = sp.craft && sp.craft.sinsu && sp.kind === 'weapon' ? SINSU_STAR : 0.5;
  const r = specialPower(sp, cls) + step * (Math.min(Math.max(1, star), sp.craft && sp.craft.stars || 99) - 1);
  return sp.craft || sp.rarity ? r : Math.min(specialCaps(sp).top, r);
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
  const id = raidOwner(cls, kind, tier);
  return id ? RAIDS.find(r => r.id === id) : null;
}

// Materials for the smith's 조합: dropped by the grounds and raids of their kind.
// icon: the old client's item icon (or st:<name>, 연's own from the HUD); yeon: 연's own item whose
// inventory icon is shown instead where the build has it (tools/fetch_icons.py cuts and normalises
// it; game.js matIcon) — the very item where 연 has it (용의비늘, 여의주, 순수의 강철, 은나무가지),
// else 연's nearest of that name and nature (가죽, 해골의 뼈, 조화의 기운, 영혼의 파편, 표신궁
// 고문서, 불씨의 흔적 조각 for the 겁화, 은나무잎, 용천의 비늘 for the 청룡's, 빈 거북 등딱지 for
// the 현무's). 도깨비 탈, 불씨 단지, 백옥, 금린, 은나무 파편 keep the old icons, which already match.
export const MATS = {
  fur: { name: '짐승 가죽', icon: 'm_fur', yeon: 50000003, from: ['deer', 'bear', 'bearman', 'steppe', 'raid_boar', 'raid_tiger', 'hwagwa', 'wolf', 'baekdu', 'baekdu2', 'zud'] },
  horn: { name: '도깨비 탈', icon: 'm_horn', from: ['goblin', 'yogoe', 'raid_goblin', 'hwagwa'] },
  bone: { name: '해골 조각', icon: 'm_bone', yeon: 406062, from: ['haunt', 'skull', 'raid_sorcerer', 'tagye', 'reef', 'wreck', 'greatwall'] },
  ember: { name: '불씨 단지', icon: 'm_ember', from: ['volcano', 'raid_fire', 'raid_agni', 'pokyeom', 'hwatang'] },
  jade: { name: '백옥', icon: 'm_jade', from: ['island', 'palace', 'royal', 'kirin', 'raid_airavata', 'gogyun', 'gareung'] },
  scale: { name: '용의 비늘', icon: 'gem2', yeon: 50000962, from: ['bigsnake', 'sea', 'palace', 'raid_hydra', 'raid_sea', 'deepsea', 'raid_varuna', 'reef', 'wreck'] },
  pearl: { name: '여의주', icon: 'gem4', yeon: 50000719, from: ['raid_hydra', 'palace', 'deepsea', 'raid_varuna'] },
  // Today's client's materials, as its smith asks for them: 금린 for the 중국전설 set, 순수의 강철
  // for the 일본전설 set, 조화의 정수 for the 용 set, 거마족의 영혼석 for 고대마령, a 제작 고문서
  // for every legendary piece, 겁화의 파편 for their stars, and the 은나무 파편·조각·가지 that
  // raise the 용무기 from 제일 to 제십.
  gold: { name: '금린', icon: 'm_gold', from: ['palace', 'royal', 'raid_tiger', 'raid_goblin', 'hwagwa', 'kirin', 'raid_wukong', 'raid_airavata', 'greatwall', 'qin', 'haya'] },
  steel: { name: '순수의 강철', icon: 'm_steel', yeon: 50000606, from: ['volcano', 'japan', 'raid_sorcerer', 'raid_sea', 'raid_fire', 'musin', 'murim', 'raid_musin', 'raid_agni', 'wolf', 'ancient'] },
  essence: { name: '조화의 정수', icon: 'm_essence', yeon: 21119, from: ['raid_hydra', 'raid_sea', 'raid_fire', 'deepsea', 'kirin', 'raid_brit', 'raid_varuna', 'raid_agni', 'raid_airavata', 'baekdu4', 'hanbing', 'lobi', 'aram', 'ancient', 'cheolsang', 'abyss', 'abyss2', 'abyss3', 'abyss4', 'cow', 'raid_hell', 'raid_heaven'] },
  soul: { name: '거마족의 영혼석', icon: 'm_soul', yeon: 509043, from: ['skull', 'yogoe', 'raid_sorcerer', 'tagye', 'raid_brit', 'raid_gwoe', 'geohae', 'hanbing', 'oldaram', 'jagwi', 'hwatang', 'cheolsang', 'abyss', 'abyss2', 'abyss3', 'abyss4', 'raid_hell'] },
  scroll: { name: '제작 고문서', icon: 'm_scroll', yeon: 50000607, from: ['raid_boar', 'raid_tiger', 'raid_goblin', 'raid_hydra', 'raid_sorcerer', 'raid_sea', 'raid_fire', 'raid_wukong', 'raid_musin', 'raid_brit', 'raid_varuna', 'raid_agni', 'raid_airavata', 'raid_gwoe', 'raid_hell', 'raid_heaven'] },
  kalpa: { name: '겁화의 파편', icon: 'm_kalpa', yeon: 12005, from: ['volcano', 'palace', 'royal', 'raid_boar', 'raid_tiger', 'raid_goblin', 'raid_hydra', 'raid_sorcerer', 'raid_sea', 'raid_fire', 'hwagwa', 'murim', 'musin', 'deepsea', 'kirin', 'tagye', 'raid_wukong', 'raid_musin', 'raid_brit', 'raid_varuna', 'raid_agni', 'raid_airavata', 'raid_gwoe', 'wreck', 'greatwall', 'qin', 'gogyun', 'spidercave', 'gareung', 'pokyeom', 'baekdu', 'baekdu2', 'baekdu3', 'baekdu4', 'hanbing', 'geohae', 'zud', 'zud2', 'sandolim', 'fallforest', 'jagwi', 'oldaram', 'haya', 'lobi', 'aram', 'ancient', 'hwatang', 'cheolsang', 'abyss', 'abyss2', 'abyss3', 'abyss4', 'cow', 'raid_hell', 'raid_heaven'] },
  silver1: { name: '은나무 파편', icon: 'm_silver1', from: ['sea', 'island', 'volcano', 'palace', 'royal', 'raid_boar', 'raid_tiger', 'raid_goblin', 'raid_hydra', 'raid_sorcerer', 'raid_sea', 'raid_fire', 'hwagwa', 'murim', 'musin', 'deepsea', 'kirin', 'tagye', 'raid_wukong', 'raid_musin', 'raid_brit', 'raid_varuna', 'raid_agni', 'raid_airavata', 'raid_gwoe', 'wolf', 'reef', 'wreck', 'greatwall', 'qin', 'gogyun', 'spidercave', 'gareung', 'pokyeom', 'baekdu', 'baekdu2', 'baekdu3', 'baekdu4', 'hanbing', 'geohae', 'zud', 'zud2', 'sandolim', 'fallforest', 'jagwi', 'oldaram', 'haya', 'lobi', 'aram', 'ancient', 'hwatang', 'cheolsang', 'abyss', 'abyss2', 'abyss3', 'abyss4', 'cow', 'raid_hell', 'raid_heaven'] },
  silver2: { name: '은나무 조각', icon: 'm_silver2', yeon: 407099, from: ['raid_hydra', 'raid_sorcerer', 'raid_sea', 'raid_fire', 'kirin', 'tagye', 'raid_wukong', 'raid_musin', 'raid_brit', 'raid_varuna', 'raid_agni', 'raid_airavata', 'raid_gwoe', 'baekdu4', 'hanbing', 'geohae', 'zud', 'zud2', 'sandolim', 'fallforest', 'jagwi', 'oldaram', 'haya', 'lobi', 'aram', 'ancient', 'hwatang', 'cheolsang', 'abyss', 'abyss2', 'abyss3', 'abyss4', 'cow', 'raid_hell', 'raid_heaven'] },
  // The 사신수's 성물 (the original's 신수현신공성전: four of a 신수 make its 지존 piece; 연 keeps
  // 주작혈안 and 백호광안 among its items, whose icons these are). Each from its 신수's own raid at
  // the end of the 대격변 (SINSU_GATE: 청룡 바루나 L15, 현무 해왕 L11 and 바루나, 주작 아그니 L17,
  // 백호 아이라바타 L18); the earlier raids of the same nature (산군, 삼두룡, 화령) only a taste, one
  // now and then (sinsuCount), and the 길드대항전's only once the gate is down (war.js).
  sinsu_jujak: { name: '주작혈안', icon: 'st:mat_jujak', from: ['raid_fire', 'raid_agni'] },
  sinsu_baekho: { name: '백호광안', icon: 'st:mat_baekho', from: ['raid_tiger', 'raid_airavata'] },
  sinsu_cheong: { name: '청룡의 비늘', icon: 'gem1', yeon: 407101, from: ['raid_varuna', 'raid_hydra'] },
  sinsu_hyeonmu: { name: '현무의 등딱지', icon: 'gem3', yeon: 406243, from: ['raid_sea', 'raid_varuna'] },
  // 은나무 가지 (the 용무기's 제십): from the last raids and the 끝없는 지옥 only (was 삼두룡 L7 up).
  silver3: { name: '은나무 가지', icon: 'm_silver3', yeon: 407072, from: ['raid_agni', 'raid_airavata', 'abyss', 'abyss2', 'abyss3', 'abyss4', 'raid_hell', 'raid_heaven'] },
  // 지하국대적 레이드's own: 연's 회한옥'심 (the sinners' jade of regret 연 spends on 극'청룡
  // 심판의낫's awakening), what 군주 청룡 심판의낫 becomes 악마 심판의낫 with (JUDGE_CRAFTS).
  hoehan: { name: "회한옥'심", icon: 'm_soul', yeon: 50001035, from: ['raid_hell'] },
  // 선계 레이드's own: 연's 선계의 기운, the light the 용무기 제십 is dressed in (천상 각성: HEAVEN_DRESS).
  seongi: { name: '선계의 기운', icon: 'm_essence', yeon: 303, from: ['raid_heaven'] },
};
// The 사신수 성물's own raids (above); elsewhere a taste only (SINSU_TASTE a boss). 현무's 해왕 gives
// its full share only once 바루나 has fallen. A 사신수 recipe's gate (needs) is its 성물's raid.
export const SINSU_GATE = { sinsu_cheong: ['raid_varuna'], sinsu_jujak: ['raid_agni'], sinsu_baekho: ['raid_airavata'], sinsu_hyeonmu: ['raid_varuna', 'raid_sea'] };
export const SINSU_TASTE = 0.05;
/** How many of a 성물 a kill drops at a stage, with the raids already won (progress.raids). */
export function sinsuCount(id, stage, kind, raids) {
  const gate = SINSU_GATE[id] || [];
  const full = gate.includes(stage) && (stage !== 'raid_sea' || !!(raids || {}).raid_varuna);
  if (!full) return kind === 'boss' && Math.random() < SINSU_TASTE ? 1 : 0;
  return matCount(id, kind, true);
}
/** A recipe's gate (craft.needs): a raid won, or a ground conquered. Pieces already made keep. */
export function needsMet(needs, progress) {
  if (!needs) return true;
  return needs.startsWith('raid_') ? !!(progress.raids || {})[needs] : !!(progress.cleared || {})[needs];
}
/** The gate's name, for the smith's locked row. */
export function needsName(needs) {
  const r = RAIDS.find(x => x.id === needs) || STAGES.find(x => x.id === needs);
  return r ? r.name : needs;
}
/** How many of a material a kill drops: most fall from bosses (3-5), some from mini bosses. */
export function matCount(id, kind, raid) {
  const r = Math.random();
  if (id === 'pearl') return kind === 'boss' && r < (raid ? 0.6 : 0.12) ? 1 : 0;
  // 회한옥'심 and 선계의 기운: two or three from their raid's boss, every clear.
  if (id === 'hoehan' || id === 'seongi') return kind === 'boss' ? 2 + (r < 0.5 ? 1 : 0) : 0;
  // 은나무 가지: raid bosses 25%; the 끝없는 지옥's bosses (in its list) 10% — they gave none (raid only).
  if (id === 'silver3') return kind === 'boss' && r < (raid ? 0.25 : 0.1) ? 1 : 0;
  if (id === 'scroll') return kind === 'boss' ? 1 + (r < 0.3 ? 1 : 0) : 0;
  if (id === 'essence' || id === 'silver2') return kind === 'boss' ? 2 + Math.floor(r * 3) : kind === 'mini' && r < 0.3 ? 1 : 0;
  return kind === 'boss' ? 3 + Math.floor(r * 3) : kind === 'mini' ? (r < 0.5 ? 1 : 0)
    : kind === 'champ' ? (r < 0.15 ? 1 : 0) : (r < 0.004 ? 1 : 0);
}

// The smith's recipes beside the 용무기: sets by the material's grade, each piece with its own
// name, look, option and power (a hunting ground's best being about 4-5). look: a wardrobe
// name, or one per class. They are kept as specials ('sp:' + id) with craft set.
const OPT = id => OPTIONS.find(o => o.id === id);
// 청룡신검's and 현무불괴갑's recolours of their 연 stand-ins (game.js dressedSheet, by pal): the
// weapon's on its layers (with a faint blue light, no fire), the armour's on the outfit's (armor: true).
// tint: how far toward the original's colours (the hand and gold hilt are never touched). water: the
// strike frames' sweep turned to the original's swing, a crescent of blue water (game.js waterPixel).
export const SINSU_DRESS = {
  cheong: { pal: 'cheong', tint: 0.6, glow: 0.3, glowColor: '#3f9dff', flames: 0, fsc: 0, water: true, standIn: true },
  hyeonmu: { pal: 'hyeonmu', tint: 0.8, armor: true },
};
export const CRAFTS = [
  { id: 'cr_fur_armor', kind: 'armor', name: '산짐승 가죽옷', look: '태권도복', pow: 3, opt: 'life', mats: { fur: 6 }, gold: 300 },
  { id: 'cr_fur_shield', kind: 'shield', name: '범가죽 방패', look: '대나무방패', pow: 3, opt: 'guard', mats: { fur: 6 }, gold: 300 },
  { id: 'cr_fur_weapon', kind: 'weapon', name: { warrior: '짐승뼈 철검', rogue: '짐승뼈 단도', mage: '짐승뼈 지팡이', poet: '짐승뼈 붓', archer: '짐승뼈 활', lancer: '짐승뼈 창', monk: '짐승뼈 권갑', magus: '짐승뼈 단봉', celestial: '짐승뼈 호리병', dokkaebi: '짐승뼈 방망이', reaper: '짐승뼈 백도' },
    look: { warrior: '철검', rogue: '가시철단도', mage: '월광천봉', poet: '대붓', archer: '목궁', lancer: '나무창', monk: '가람권갑', magus: '하급떡갈나무단봉', celestial: '나무호리병', dokkaebi: '나무방망이', reaper: '나무백도' }, pow: 3, opt: 'boss', mats: { fur: 4, bone: 2 }, gold: 400 },
  { id: 'cr_horn_armor', kind: 'armor', name: '도깨비 가죽갑옷', look: '남자기모노', pow: 5, opt: 'speed', mats: { horn: 8, fur: 4 }, gold: 800 },
  { id: 'cr_horn_shield', kind: 'shield', name: '도깨비 탈 방패', look: '문신방패', pow: 5, opt: 'magnet', mats: { horn: 8 }, gold: 800 },
  { id: 'cr_horn_weapon', kind: 'weapon', name: { warrior: '뿔검', rogue: '뿔단도', mage: '뿔지팡이', poet: '뿔부채', archer: '뿔활', lancer: '뿔창', monk: '뿔권갑', magus: '뿔단봉', celestial: '뿔호리병', dokkaebi: '뿔방망이', reaper: '뿔백도' },
    look: { warrior: '환두대도', rogue: '진아광검', mage: '원혼의낫', poet: '하늘개비', archer: '녹각궁', lancer: '철창', monk: '라온조갑', magus: '강철단봉', celestial: '강철호리병', dokkaebi: '강철방망이', reaper: '강철백도' }, pow: 5, opt: 'power', mats: { horn: 10 }, gold: 1000 },
  { id: 'cr_bone_armor', kind: 'armor', name: '해골 갑주', look: '해골갑옷', pow: 6, opt: 'regen', mats: { bone: 10 }, gold: 1500 },
  { id: 'cr_bone_shield', kind: 'shield', name: '저승 방패', look: '팔세지도', pow: 6, opt: 'guard', mats: { bone: 10 }, gold: 1500 },
  { id: 'cr_bone_weapon', kind: 'weapon', name: { warrior: '망령검', rogue: '망령단도', mage: '망령의낫', poet: '망령초롱', archer: '망령궁', lancer: '망령창', monk: '망령권갑', magus: '망령단봉', celestial: '망령포', dokkaebi: '망령방망이', reaper: '망령명도' },
    look: { warrior: '참마도', rogue: '저주의단검', mage: '원혼의낫', poet: '자월초롱', archer: '대붕지옥궁', lancer: '촉루창', monk: '진목권갑', magus: '흑골단봉', celestial: '흑해염호리병', dokkaebi: '흑골방망이', reaper: '흑사백도' }, pow: 6, opt: 'haste', mats: { bone: 12, horn: 4 }, gold: 1800 },
  { id: 'cr_ember_armor', kind: 'armor', name: '화염 갑주', look: '불의갑주', pow: 8, opt: 'mana', mats: { ember: 10, bone: 4 }, gold: 3000 },
  { id: 'cr_ember_shield', kind: 'shield', name: '불꽃 방패', look: '일광방패', pow: 8, opt: 'boss', mats: { ember: 10 }, gold: 3000 },
  { id: 'cr_ember_weapon', kind: 'weapon', name: { warrior: '화염검', rogue: '화염단도', mage: '화염장', poet: '화염부채', archer: '화염궁', lancer: '화염창', monk: '화염권갑', magus: '화염단봉', celestial: '화염포', dokkaebi: '화염방망이', reaper: '화염명도' },
    look: { warrior: '주작의검', rogue: '횃불', mage: '흑단화염장', poet: '횃불', archer: '흑일멸화궁', lancer: '금홍비창', monk: '바람홍옥권갑', magus: '바람홍옥단봉', celestial: '바람홍옥포', dokkaebi: '바람홍옥퇴', reaper: '바람홍옥명도' }, pow: 8, opt: 'power', mats: { ember: 12, horn: 4 }, gold: 3500 },
  { id: 'cr_jade_armor', kind: 'armor', name: '옥룡 갑옷', look: '선녀의옷', pow: 9, opt: 'life', mats: { jade: 12, scale: 4 }, gold: 4500 },
  { id: 'cr_jade_shield', kind: 'shield', name: '백옥 방패', look: '정화의방패', pow: 9, opt: 'regen', mats: { jade: 12 }, gold: 4500 },
  { id: 'cr_dragon_armor', kind: 'armor', name: { warrior: '용마파천갑', rogue: '용천파천갑', mage: '용랑파천의', poet: '용겸파천의', archer: '용섬파천복', lancer: '용무파천갑', monk: '용비파천갑', magus: '용화파천의', celestial: '용주파천단', dokkaebi: '용린파천갑', reaper: '용라파천갑' }, look: '용왕의용포', pow: 10, opt: 'guard', /* worn as 연's own 치장용 of the class's piece (its icon's picture, wings and all: yeon_costume.py plays the outfit's prefab); the 격투가 wears 용비제칠남자대련복, 연's 용비 파천·멸아 having no frames for its walking rig */ base: { warrior: [7100675], rogue: [7100677], mage: [7100681], poet: [7100679], archer: [7100685], lancer: [7100687], monk: [7100552], magus: [342039], celestial: [7100689], dokkaebi: [7100691], reaper: [7100693] },
    mats: { scale: 20, pearl: 1 }, gold: 6000, pic: 'name', steps: [1, 3, 5, 7, 10] },
  { id: 'cr_dragon_shield', kind: 'shield', name: '용린방패', look: '백룡현갑', pow: 10, opt: 'power', mats: { scale: 15, pearl: 1 }, gold: 6000 },
  // Today's client's legendary gear (중국전설 금린, 일본전설 무신, 타계 고대마령, 용 멸아): drawn
  // with its own pictures (pic: the item's name, steps: the client's 성 shown at ★1-★5). The
  // walking figure wears the nearest old look. A piece with `from` is made out of another at
  // ★5, which goes into the making (구곡검 → 마곡검, 진일신검 → 극'진일신검, 파천갑 → 멸아갑).
  { id: 'cr_maryeong_armor', kind: 'armor', name: { warrior: '고대마령갑주', rogue: '고대마령갑주', mage: '고대마령의복', poet: '고대마령의복', archer: '고대마령갑주', lancer: '고대마령갑주', monk: '고대마령갑주', magus: '고대마령의복', celestial: '고대마령의복', dokkaebi: '고대마령갑주', reaper: '고대마령갑주' },
    look: { warrior: '황혼의갑주', rogue: '흑영협객도복', mage: '남자제사장의상', poet: '도포', archer: '파수꾼궁포', lancer: '감시자남자경갑', monk: '혈귀혼남자대련복', magus: '금고급현복', celestial: '파수꾼천의', dokkaebi: '혈귀혼귀의', reaper: '해태 흑의' }, pow: 10, opt: 'regen', mats: { soul: 12, scroll: 1 }, gold: 5000,
    pic: 'name', steps: [1, 3, 5, 7, 10], legend: true },
  { id: 'cr_maryeong_shield', kind: 'shield', name: '고대마령의방패', look: '주술방패', pow: 10, opt: 'guard',
    mats: { soul: 10, scroll: 1 }, gold: 5000, pic: 'name', steps: [1, 3, 5, 7, 10], legend: true },
  { id: 'cr_gold_weapon', kind: 'weapon', name: { warrior: '구곡검', rogue: '협가검', mage: '영후단봉', poet: '대모홍접선', archer: '흑월신궁', lancer: '화첨창', monk: '백운권갑', magus: '흑염곤봉', celestial: '녹옥방천극', dokkaebi: '화룡퇴', reaper: '신월태도' },
    look: { warrior: '청룡의검', rogue: '백화검', mage: '해룡의지팡이', poet: '흑단부채', archer: '파천비궁', lancer: '파천비창', monk: '파천권갑', magus: '파천비단봉', celestial: '파천비포', dokkaebi: '파천퇴', reaper: '파천비명도' }, pow: 11, opt: 'life', mats: { gold: 12, scroll: 1 }, gold: 6000,
    base: { archer: [7100112] }, /* 흑월신궁(치장용): the archer's own 흑월신궁 (the rest wear their 연 item by name already) */
    pic: 'name', steps: [1, 3, 5, 7, 9], legend: true },
  { id: 'cr_gold_armor', kind: 'armor', name: { warrior: '금린천화갑', rogue: '금린천화갑', mage: '금린천추갑', poet: '금린천추갑', archer: '금린천화갑', lancer: '금린천화갑', monk: '금린천화갑', magus: '금린천추갑', celestial: '금린천추갑', dokkaebi: '금린천화갑', reaper: '금린천화갑' },
    look: { warrior: '곤룡포', rogue: '곤룡포', mage: '남자신관복', poet: '남자신관복', archer: '혈귀혼궁포', lancer: '지박귀남자경갑', monk: '지박귀남자대련복', magus: '은현복', celestial: '금고급천의', dokkaebi: '지박귀귀의', reaper: '사저의복' }, pow: 11, opt: 'life', mats: { gold: 12, scroll: 1 }, gold: 6000,
    pic: 'name', steps: [1, 3, 5, 7, 10], legend: true },
  { id: 'cr_gold_shield', kind: 'shield', name: '금린방패', look: '여신의방패', pow: 11, opt: 'guard',
    mats: { gold: 10, scroll: 1 }, gold: 6000, pic: 'name', steps: [1, 3, 5, 7, 10], legend: true },
  { id: 'cr_steel_weapon', kind: 'weapon', name: { warrior: '진일신검', rogue: '청일기창', mage: '황염곤봉', poet: '적염곤봉', archer: '한별가온궁', lancer: '백일신창', monk: '섬월권갑', magus: '금홍단봉', celestial: '청월표창', dokkaebi: '백일퇴', reaper: '신일태도' },
    look: { warrior: '일월대도', rogue: '삼첨도', mage: '백운장', poet: '하늘개비', archer: '진아광궁', lancer: '진아광창', monk: '경원권갑', magus: '진아광단봉', celestial: '아광포', dokkaebi: '아광퇴', reaper: '진아광백도' }, pow: 12, opt: 'speed', mats: { steel: 14, scroll: 1 }, gold: 8000,
    base: { archer: [230007] }, /* 한별가온궁(치장용). 청일기창·황염곤봉 wear their 진' (연's own 치장용 copies have no strike frames for the rig) */
    pic: 'name', steps: [1, 3, 5, 7, 9], legend: true },
  { id: 'cr_steel_armor', kind: 'armor', name: { warrior: '태염무신장갑', rogue: '태염무신장갑', mage: '태광천신의복', poet: '태광천신의복', archer: '태염무신장갑', lancer: '태염무신장갑', monk: '태염무신장갑', magus: '태광천신의복', celestial: '태광천신의복', dokkaebi: '태염무신장갑', reaper: '태염무신장갑' },
    look: { warrior: '궁중무사갑주', rogue: '궁중무사갑주', mage: '여자성광법의', poet: '남자성광법의', archer: '숲의군주궁포', lancer: '금고급남자경갑', monk: '숲의군주남자대련복', magus: '상급마도현복', celestial: '숲의군주천의', dokkaebi: '숲의군주귀의', reaper: '지박귀흑의' }, pow: 12, opt: 'mana', mats: { steel: 14, scroll: 1 }, gold: 8000,
    pic: 'name', steps: [1, 3, 5, 7, 10], legend: true },
  { id: 'cr_steel_shield', kind: 'shield', name: '무신귀면방', look: '거울방패', pow: 12, opt: 'boss',
    mats: { steel: 12, scroll: 1 }, gold: 8000, pic: 'name', steps: [1, 3, 5, 7, 10], legend: true },
  // 투구·망토 (today's legendary sets): new slots, worn in the dress room's look.
  { id: 'cr_maryeong_helm', kind: 'helmet', name: { warrior: "고대마령투구", rogue: "고대마령투구", mage: "고대마령모자", poet: "고대마령모자", archer: '고대마령투구', lancer: '고대마령투구', monk: '고대마령투구', magus: '고대마령모자', celestial: '고대마령모자', dokkaebi: '고대마령투구', reaper: '고대마령투구' }, look: { warrior: "고대마령투구1성", rogue: "고대마령투구1성", mage: "고대마령모자1성", poet: "고대마령모자1성", archer: '고대마령투구1성', lancer: '고대마령투구1성', monk: '고대마령투구1성', magus: '고대마령모자1성', celestial: '고대마령모자1성', dokkaebi: '고대마령투구1성', reaper: '고대마령투구1성' }, pow: 10, opt: 'life', mats: { soul: 8, scroll: 1 }, gold: 4000,
    pic: 'name', steps: [1, 3, 5, 7, 10], legend: true },
  { id: 'cr_gold_helm', kind: 'helmet', name: { warrior: "금린화월관", rogue: "금린화월관", mage: "금린추월관", poet: "금린추월관", archer: '금린화월관', lancer: '금린화월관', monk: '금린화월관', magus: '금린추월관', celestial: '금린추월관', dokkaebi: '금린화월관', reaper: '금린화월관' }, look: { warrior: "금린화월관1성", rogue: "금린화월관1성", mage: "금린추월관1성", poet: "금린추월관1성", archer: '금린화월관1성', lancer: '금린화월관1성', monk: '금린화월관1성', magus: '금린추월관1성', celestial: '금린추월관1성', dokkaebi: '금린화월관1성', reaper: '금린화월관1성' }, pow: 11, opt: 'guard', mats: { gold: 10, scroll: 1 }, gold: 6000,
    pic: 'name', steps: [1, 3, 5, 7, 10], legend: true },
  { id: 'cr_gold_cape', kind: 'cape', name: { warrior: "금린화월", rogue: "금린화월", mage: "금린추월", poet: "금린추월", archer: '금린화월', lancer: '금린화월', monk: '금린화월', magus: '금린추월', celestial: '금린추월', dokkaebi: '금린화월', reaper: '금린화월' }, look: { warrior: "금린화월1성", rogue: "금린화월1성", mage: "금린추월1성", poet: "금린추월1성", archer: '금린화월1성', lancer: '금린화월1성', monk: '금린화월1성', magus: '금린추월1성', celestial: '금린추월1성', dokkaebi: '금린화월1성', reaper: '금린화월1성' }, pow: 11, opt: 'speed', mats: { gold: 10, scroll: 1 }, gold: 6000,
    pic: 'name', steps: [1, 3, 5, 7, 10], legend: true },
  { id: 'cr_steel_helm', kind: 'helmet', name: { warrior: "태염무신금잠", rogue: "태염무신금잠", mage: "태광천신금잠", poet: "태광천신금잠", archer: '태염무신금잠', lancer: '태염무신금잠', monk: '태염무신금잠', magus: '태광천신금잠', celestial: '태광천신금잠', dokkaebi: '태염무신금잠', reaper: '태염무신금잠' }, look: { warrior: "태염무신금잠1성", rogue: "태염무신금잠1성", mage: "태광천신금잠1성", poet: "태광천신금잠1성", archer: '태염무신금잠1성', lancer: '태염무신금잠1성', monk: '태염무신금잠1성', magus: '태광천신금잠1성', celestial: '태광천신금잠1성', dokkaebi: '태염무신금잠1성', reaper: '태염무신금잠1성' }, pow: 12, opt: 'mana', mats: { steel: 12, scroll: 1 }, gold: 8000,
    pic: 'name', steps: [1, 3, 5, 7, 10], legend: true },
  { id: 'cr_steel_cape', kind: 'cape', name: { warrior: "무신귀갑주", rogue: "무신귀갑주", mage: "천신부금장", poet: "천신부금장", archer: '무신귀갑주', lancer: '무신귀갑주', monk: '무신귀갑주', magus: '천신부금장', celestial: '천신부금장', dokkaebi: '무신귀갑주', reaper: '무신귀갑주' }, look: { warrior: "무신귀갑주1성", rogue: "무신귀갑주1성", mage: "천신부금장1성", poet: "천신부금장1성", archer: '무신귀갑주1성', lancer: '무신귀갑주1성', monk: '무신귀갑주1성', magus: '천신부금장1성', celestial: '천신부금장1성', dokkaebi: '무신귀갑주1성', reaper: '무신귀갑주1성' }, pow: 12, opt: 'boss', mats: { steel: 12, scroll: 1 }, gold: 8000,
    pic: 'name', steps: [1, 3, 5, 7, 10], legend: true },
  { id: 'cr_dragon_helm', kind: 'helmet', name: { warrior: "용아투구'마", rogue: "용아투구'천", mage: "용아천관'랑", poet: "용아천관'겸", archer: "용아투구'섬", lancer: "진용아투구'무", monk: "진용아투구'비", magus: "진용아천관'화", celestial: "진용아천관'주", dokkaebi: "진용아투구'린", reaper: "진용아투구'영" }, look: { warrior: "용아투구'마1성", rogue: "용아투구'천1성", mage: "용아천관'랑1성", poet: "용아천관'겸1성", archer: "용아투구'천1성", lancer: "용아투구'천1성", monk: "용아투구'천1성", magus: "용아천관'겸1성", celestial: "용아천관'겸1성", dokkaebi: "용아투구'천1성", reaper: "용아투구'천1성" }, pow: 13, opt: 'power', mats: { essence: 12, scale: 15, pearl: 1 }, gold: 15000,
    /* 연's own 진용아 helmets (치장용) of each class: 연 has no plain 용아 helmet, its line starts at 진 */
    base: { warrior: [7100628], rogue: [7100629], mage: [7100630], poet: [7100631], archer: [7100633], lancer: [7100634], monk: [7100632], magus: [341015], celestial: [7100635], dokkaebi: [7100636], reaper: [7100649] },
    pic: 'name', steps: [1, 3, 5, 7, 10], legend: true },
  { id: 'cr_gold_weapon2', kind: 'weapon', name: { warrior: '마곡검', rogue: '패협검', mage: '백선마봉', poet: '암혈홍접선', archer: '흑일신궁', lancer: "화첨창'청", monk: "진'백운권갑", magus: "진'흑염곤봉", celestial: '흑옥방천극', dokkaebi: '멸룡퇴', reaper: '사혼태도' },
    look: { warrior: '청룡의검', rogue: '백화검', mage: '해룡의지팡이', poet: '흑단부채', archer: '파천비궁', lancer: '파천비창', monk: '파천권갑', magus: '파천비단봉', celestial: '파천비포', dokkaebi: '파천퇴', reaper: '파천비명도' }, pow: 13, opt: 'guard', from: 'cr_gold_weapon',
    base: { warrior: [7100518], rogue: [7100519], poet: [7100521], archer: [7100299] }, /* 마곡검·패협검·암혈홍접선·흑일신궁(치장용) */
    mats: { gold: 20, kalpa: 15, scroll: 2 }, gold: 15000, pic: 'name', legend: true },
  { id: 'cr_dragon_armor2', kind: 'armor', name: { warrior: '용마멸아갑', rogue: '용천멸아갑', mage: '용랑멸아의', poet: '용겸멸아의', archer: '용섬멸아복', lancer: '용무멸아갑', monk: '용비멸아갑', magus: '용화멸아의', celestial: '용주멸아단', dokkaebi: '용린멸아갑', reaper: '용라멸아갑' },
    look: '용왕의용포', base: { warrior: [7100676], rogue: [7100678], mage: [7100682], poet: [7100680], archer: [7100686], lancer: [7100688], monk: [7100552], magus: [342043], celestial: [7100690], dokkaebi: [7100692], reaper: [7100694] }, pow: 13, opt: 'life', from: 'cr_dragon_armor', mats: { essence: 15, scale: 20, pearl: 2 }, gold: 20000,
    pic: 'name', steps: [1, 3, 5, 7, 10], legend: true },
  { id: 'cr_brit_shield', kind: 'shield', name: '브리트라한의방패', look: '천성대방패', pow: 13, opt: 'regen', from: 'cr_steel_shield',
    mats: { essence: 10, kalpa: 20, scroll: 2 }, gold: 20000, pic: 'name', steps: [1, 3, 5, 7, 9], legend: true },
  { id: 'cr_steel_weapon2', kind: 'weapon', name: { warrior: "극'진일신검", rogue: "극'청일기창", mage: "극'황염곤봉", poet: "극'적염곤봉", archer: "극'한별가온궁", lancer: "극'백일신창", monk: "섬월권갑'폭", magus: "금홍단봉'화", celestial: "극'청월표창", dokkaebi: "진'백일퇴", reaper: "극'신일태도" },
    look: { warrior: '일월대도', rogue: '삼첨도', mage: '백운장', poet: '하늘개비', archer: '진아광궁', lancer: '진아광창', monk: '경원권갑', magus: '진아광단봉', celestial: '아광포', dokkaebi: '아광퇴', reaper: '진아광백도' }, pow: 13, opt: 'haste', from: 'cr_steel_weapon',
    base: { warrior: [7100310] }, /* 극'진일신검(치장용) */
    mats: { steel: 24, kalpa: 20, scroll: 2 }, gold: 20000, pic: 'name', legend: true },
  // 원작의 무기 계열 (the original's own weapon lines the game lacked; tools/item_catalog.json has
  // every name). Each class's piece by the original's own name and picture (its official item
  // render, pic: 'name', normalised to 연's icons by tools/fetch_icons.py); worn as the class's 연
  // weapon nearest it (look: a name already in the class's line, so no place in a line moves).
  // noCoordi: not rendered in the dress room (the 연 heroes wear the look; fetch_gear.py skips them).
  // 백제 환두대도 (the 백제 event's ring-pommel swords, three steps: 단봉 ★1-★5 → 삼엽문 → 금동장,
  // each made out of the last at ★5). The 궁사 holds a 노 at 삼엽문, which has no 궁.
  { id: 'cr_baekje_weapon', kind: 'weapon', name: { warrior: '백제단봉환두대검', rogue: '백제단봉환두대도', mage: '백제단봉환두대장', poet: '백제단봉환두대봉', archer: '백제단봉환두대궁', lancer: '백제단봉환두대곤', monk: '백제단봉환두대구겸', magus: '백제단봉환두대마봉', celestial: '백제단봉환두대신장', dokkaebi: '백제단봉환두대화도', reaper: '백제단봉환두대명도' },
    look: { warrior: '환두대도', rogue: '진아광검', mage: '일월대도', poet: '백운장', archer: '대명궁', lancer: '은장철창', monk: '비조권갑', magus: '혼령단봉', celestial: '호표호리병', dokkaebi: '흑단방망이', reaper: '흑해백도' }, pow: 9, opt: 'boss', mats: { jade: 12, ember: 6 }, gold: 4500,
    pic: 'name', steps: [1, 2, 3, 4, 5], legend: true, noCoordi: true },
  { id: 'cr_baekje_weapon2', kind: 'weapon', name: { warrior: '백제삼엽문환두대검', rogue: '백제삼엽문환두대도', mage: '백제삼엽문환두대장', poet: '백제삼엽문환두대봉', archer: '백제삼엽문환두대노', lancer: '백제삼엽문환두대곤', monk: '백제삼엽문환두대구겸', magus: '백제삼엽문환두대마봉', celestial: '백제삼엽문환두대신장', dokkaebi: '백제삼엽문환두대화도', reaper: '백제삼엽문환두대명도' },
    look: { warrior: '칠지도', rogue: '현랑부', mage: '현랑부', poet: '나비채', archer: '금강비궁', lancer: '두억창', monk: '금강권갑', magus: '금단봉', celestial: '금강비포', dokkaebi: '금강퇴', reaper: '금강비명도' }, pow: 10, opt: 'haste', from: 'cr_baekje_weapon', mats: { scale: 12, pearl: 1, kalpa: 6 }, gold: 8000,
    pic: 'name', steps: [1, 3, 5, 7, 10], legend: true, noCoordi: true },
  { id: 'cr_baekje_weapon3', kind: 'weapon', name: { warrior: '백제금동장환두대검', rogue: '백제금동장환두대도', mage: '백제금동장환두대장', poet: '백제금동장환두대봉', archer: '백제금동장환두대궁', lancer: '백제금동장환두대곤', monk: '백제금동장환두대구겸', magus: '백제금동장환두대마봉', celestial: '백제금동장환두대신장', dokkaebi: '백제금동장환두대화도', reaper: '백제금동장환두대명도' },
    look: { warrior: '현무의검', rogue: '얼음칼', mage: '심판의낫', poet: '현무의검', archer: '나라강궁', lancer: '바람홍옥창', monk: '제화금홍권갑', magus: '금홍비단봉', celestial: '금홍비포', dokkaebi: '금홍퇴', reaper: '금홍비명도' }, pow: 12, opt: 'speed', from: 'cr_baekje_weapon2', mats: { gold: 15, steel: 10, kalpa: 15, scroll: 1 }, gold: 15000,
    pic: 'name', steps: [1, 3, 5, 7, 10], legend: true, noCoordi: true },
  // 고대마령의적혈 무기: the 타계 고대마령 set's weapon (its armour, helmet and shield are above), and
  // 브리트라한의 무기 made out of it at ★5, as 브리트라한의방패 is out of 무신귀면방. The original has
  // no 창 in either: the 창술사 has none.
  { id: 'cr_maryeong_weapon', kind: 'weapon', only: ['warrior', 'rogue', 'mage', 'poet', 'archer', 'monk', 'magus', 'celestial', 'dokkaebi', 'reaper'], name: { warrior: '고대마령의적혈검', rogue: '고대마령의적혈도', mage: '고대마령의적혈장', poet: '고대마령의적혈봉', archer: '고대마령의적혈궁', monk: '고대마령의적혈겸', magus: '고대마령의적혈단봉', celestial: '고대마령의적혈포', dokkaebi: '고대마령의적혈화도', reaper: '고대마령의적혈명도' },
    look: { warrior: '참마도', rogue: '저주의단검', mage: '원혼의낫', poet: '검정깃발', archer: '대붕지옥궁', lancer: '청룡의검', monk: '금홍권갑', magus: '독각단봉', celestial: '흑해염호리병', dokkaebi: '흑골방망이', reaper: '흑사백도' }, pow: 10, opt: 'boss', mats: { soul: 14, scroll: 1 }, gold: 5000,
    pic: 'name', steps: [1, 3, 5, 7, 10], legend: true, noCoordi: true },
  { id: 'cr_brit_weapon', kind: 'weapon', only: ['warrior', 'rogue', 'mage', 'poet', 'archer', 'monk', 'magus', 'celestial', 'dokkaebi', 'reaper'], name: { warrior: '브리트라한의신검', rogue: '브리트라한의패도', mage: '브리트라한의법장', poet: '브리트라한의신령', archer: '브리트라한의신궁', monk: '브리트라한의투겸', magus: '브리트라한의단봉', celestial: '브리트라한의성배', dokkaebi: '브리트라한의화도', reaper: '브리트라한의명도' },
    look: { warrior: '주작의검', rogue: '횃불', mage: '흑단화염장', poet: '횃불', archer: '천부연궁', lancer: '청룡의검', monk: '적풍권갑', magus: '바람홍옥단봉', celestial: '바람홍옥포', dokkaebi: '극염인화퇴', reaper: '혼령영명도' }, pow: 13, opt: 'regen', from: 'cr_maryeong_weapon', mats: { essence: 12, kalpa: 20, scroll: 2 }, gold: 20000,
    pic: 'name', steps: [1, 3, 5, 7, 9], legend: true, noCoordi: true },
  // 사신수 지존 장비 (the original: 청룡신검 the 전사's, 주작선장 the 주술사's, 백호환령부 — the
  // fastest mount, worn here as a mantle — and 현무불괴갑 anyone's). Each carries its 신수's 격.
  // 청룡신검 and 현무불괴갑 are not in 연. worn: the original's own pieces as its dress room renders
  // them worn, laid on 연's heroes (tools/sinsu_worn.py, layers "s_<piece>"): 청룡신검's blade in
  // the hand (its swing the original's blue water), 현무불괴갑's gold-and-teal wings on the back.
  // The icon stays the original's picture. Without those layers (a build without the renders):
  // 연's nearest piece recoloured to the original (SINSU_DRESS, game.js dressedSheet) —
  // 청룡신검 the 백사월도(치장용) (코디 309106, the same hooked blade), blued.
  { id: 'cr_sinsu_cheong', kind: 'weapon', only: ['warrior'], name: '청룡신검', look: '청룡의검', base: { warrior: [309106, '백사월도'] }, dress: SINSU_DRESS.cheong, worn: { warrior: 's_cheong' }, pow: 13, opt: 'life', pic: 'name', picTop: "진'청룡신검",
    mats: { sinsu_cheong: 8, essence: 10, scroll: 2 }, gold: 30000, sinsu: true },
  { id: 'cr_sinsu_jujak', kind: 'weapon', only: ['mage'], name: '주작선장', look: '흑단화염장', base: { mage: [309203, '주작선장'] }, /* 연's own 주작선장 look (코디 309203): the orb with the bird in it */ pow: 13, opt: 'mana', pic: 'name', picTop: "진'주작선장",
    mats: { sinsu_jujak: 8, ember: 20, scroll: 2 }, gold: 30000, sinsu: true },
  // 백호환령부: the original's mount, here a weapon that lives — the white tiger follows and pounces.
  { id: 'cr_sinsu_baekho', kind: 'cape', pet: true, name: '백호환령부', look: '얼음망토', pow: 13, opt: 'speed', pic: 'name',
    mats: { sinsu_baekho: 8, fur: 30, scroll: 2 }, gold: 30000, sinsu: true },
  // 현무불괴갑 (white robe and plates, gold winged shoulders, red gems, gold-and-teal wings): the body
  // 연's 빛의 전사 의복(남) (코디 803336: white, gold shoulders; drawn for every class's rig, as it is)
  // and the original's own wings on its back (wornBack, every class; the user's pick of the sheet).
  // (SINSU_DRESS.hyeonmu, the silver recolour of 얼음의경갑 7100492, stays for another look.)
  // (The look names: a build without 연's heroes.)
  { id: 'cr_sinsu_hyeonmu', kind: 'armor', name: '현무불괴갑', pic: 'name', picTop: "진'현무불괴갑",
    base: Object.fromEntries(CLASSES.map(k => [k.id, [803336, '빛의 전사 의복']])), wornBack: 's_hyeonmu',
    look: { warrior: '비늘남자갑주', rogue: '황혼의갑주', mage: '용왕의용포', poet: '여명의치마', archer: '황혼의갑주', lancer: '감시자남자경갑', monk: '혈귀혼남자대련복', magus: '금고급현복', celestial: '파수꾼천의', dokkaebi: '혈귀혼귀의', reaper: '해태 흑의' }, pow: 14, opt: 'life',
    mats: { sinsu_hyeonmu: 8, scale: 20, scroll: 2 }, gold: 30000, sinsu: true },
];
for (const c of CRAFTS) {
  const sp = { id: c.id, src: 'craft', srcName: '대장장이 조합', raid: false, craft: c, kind: c.kind, opt: OPT(c.opt), rank: 0,
    gyeok: CRAFT_GYEOK[c.id] || null, base: c.base, dress: c.dress, worn: c.worn, wornBack: c.wornBack };
  SPECIALS.push(sp);
  SPECIAL[c.id] = sp;
  // Put the look on every class's line now, so the loader fetches its sheets with the rest.
  for (const k of CLASSES) specialBase(sp, k.id);
}
// The raids' own places in the lines (avatar.js), after the crafted looks so no saved place moves.
settleRaidPieces();

// 심판의낫 (the original's 용궁 quest weapon, Lv 99, every class: 데미지·명중 +6, 체력·마력 +7000,
// 힘 +15·지력 +10 — even, no one thing; its line in 연: 심판의낫 → 청룡 심판의낫 → 진'·극'청룡 →
// 군주 청룡 심판의낫). Worn in 연's own 치장용 of the step by the 전사 and 도적 (its only figures),
// by the 주술사 in its own 심판의낫. Its way (WEAPON_FAMILY.judge): even damage on every foe. Made
// after the raids' places are settled, so its look, new to a line, moves no saved place.
// (Kept as an extra list, not in CRAFTS above: those lines carry the old saves' places.)
// The line's steps by the gate of the story (README "장비 티어"): 청룡 after the 용궁 (the 용궁 quest
// weapon), 군주 after 신아람's 황무지 ("신아람의 신비를 깨우치고"), and its last, 악마 심판의낫, out of the
// 지하국대적 레이드 (the hell under the 끝없는 지옥): its 회한옥'심, or now and then the scythe itself.
// lookSteps: 연's 치장용 of the 청룡 step by star (★1-2 청룡, ★3-4 진'청룡, ★5 극'청룡).
// 악마 심판의낫 (no 연 or original item of the name; made after the original's 악마사냥꾼의낫, 명품의4기
// 악마사냥꾼, a black-and-red reaper's scythe): worn as that scythe laid on 연's hero (tools/sinsu_worn.py
// layer s_akma), its icon the scythe's official picture (picName), both dressed as the 끝없는 지옥's
// weapons are (AKMA_DRESS: black, blood and embers, the abyss's strike effects). No stars: one step.
export const AKMA_DRESS = { tint: 0.85, glow: 0.7, glowColor: '#b0100a', core: '#ff6a2a', flames: 5, fsc: 1 };
export const JUDGE_CRAFTS = [
  { id: 'cr_judge_weapon', kind: 'weapon', only: ['warrior', 'rogue', 'mage'], name: '청룡 심판의낫', look: '심판의낫', needs: 'palace',
    base: { warrior: [7100334], rogue: [7100334] }, lookSteps: { 1: 7100334, 3: 7100335, 5: 7100336 },
    pow: 12, opt: 'life', mats: { scale: 12, essence: 6, scroll: 1 }, gold: 9000, legend: true, judge: true },
  { id: 'cr_judge_weapon2', kind: 'weapon', only: ['warrior', 'rogue', 'mage'], name: '군주 청룡 심판의낫', look: '심판의낫', needs: 'aram',
    base: { warrior: [7100443], rogue: [7100443] }, pow: 12.5, opt: 'life', from: 'cr_judge_weapon',
    mats: { essence: 15, kalpa: 15, pearl: 1, scroll: 2 }, gold: 22000, legend: true, judge: true },
  { id: 'cr_judge_weapon3', kind: 'weapon', only: ['warrior', 'rogue', 'mage'], name: '악마 심판의낫', look: '심판의낫', needs: 'raid_hell',
    base: { warrior: [7100443], rogue: [7100443] }, worn: { warrior: 's_akma', rogue: 's_akma', mage: 's_akma' }, dress: AKMA_DRESS, swing: true,
    pic: 'name', picName: '악마사냥꾼의낫', noCoordi: true, stars: 1, pow: 14.5, opt: 'life', from: 'cr_judge_weapon2',
    mats: { hoehan: 10, essence: 20, kalpa: 25, scroll: 3 }, gold: 40000, legend: true, judge: true },
];
// 악마 심판의낫 straight from the 지하국대적 (game.js clearStage), now and then, for a class that wields it.
export const AKMA_DROP = 0.04;
for (const c of JUDGE_CRAFTS) {
  CRAFTS.push(c);
  const sp = { id: c.id, src: 'craft', srcName: '대장장이 조합', raid: false, craft: c, kind: c.kind, opt: OPT(c.opt), rank: 0,
    gyeok: CRAFT_GYEOK[c.id] || null, base: c.base, dress: c.dress, worn: c.worn, lookSteps: c.lookSteps };
  SPECIALS.push(sp);
  SPECIAL[c.id] = sp;
  for (const k of c.only) specialBase(sp, k);
}
// The raids written after the crafted looks (지하국대적, 선계): their pieces' places in the lines now,
// at the ends, so no place a save holds moves (avatar.js LATE_RAIDS).
settleLateRaids();
// 방어구 추가 (armory.js): the 사신수 무신 set and more 투구·방패·망토, made last of all (their looks,
// where new to a line, at its end), so no place a save holds moves. Worn as 연's own items (base) or
// the original's laid on 연's heroes (worn: tools/musin_worn.py).
for (const c of ARMORY) {
  CRAFTS.push(c);
  const sp = { id: c.id, src: 'craft', srcName: '대장장이 조합', raid: false, craft: c, kind: c.kind, opt: OPT(c.opt), rank: 0,
    gyeok: null, base: c.base, worn: c.worn };
  SPECIALS.push(sp);
  SPECIAL[c.id] = sp;
  for (const k of c.only || CLASSES.map(x => x.id)) specialBase(sp, k);
}

// ---------------------------------------------------------------- 장비 티어 (README "장비 티어")
// The crafted pieces' ranks as the ladder sets them (over the recipes' own pow, kept above as they
// were written). A rank r strikes ×(1 + 0.12 r); 체력 20 a rank (갑옷), 12 (투구). The ladder, weapons
// (boss-equivalent rank of the warrior, ★1; README "장비 티어"):
//   용무기 제십 17.2 > 사신수 ★5 17.0 > 악마 심판의낫 16.9 > 태초 16.8 > 용무기 제구 16.4 = 사신수 ★1
//   16.4 (≈ 군주 ★5) > 용무기 제팔 15.6 > 제칠 14.8 > 심연 14.5 > 군주 14.3 > 아이라바타 14 > 2차 13.5
//   > 청룡 심판 13.3 > 1차 11.5~12.5.
// 사신수 지존 (청룡신검·주작선장): 15.9 + 격 0.5 = 16.4 at ★1, the 용무기 제구's, above the 제팔; its stars
// a little each (SINSU_STAR 0.15: ★5 17.0), so it never passes the 제십. 현무불괴갑 15 (멸아갑 13 위),
// 백호환령부 14.5 (망토의 꼭대기): their stars as any piece's.
export const TIER_POW = { cr_sinsu_cheong: 15.9, cr_sinsu_jujak: 15.9, cr_sinsu_baekho: 14.5, cr_sinsu_hyeonmu: 15 };
export const SINSU_STAR = 0.15;
for (const c of CRAFTS) if (TIER_POW[c.id] !== undefined) c.pow = TIER_POW[c.id];
// The 사신수's gates: its 성물's raid won (SINSU_GATE). A piece already made is kept whatever.
const CRAFT_NEEDS = { cr_sinsu_cheong: 'raid_varuna', cr_sinsu_hyeonmu: 'raid_varuna', cr_sinsu_jujak: 'raid_agni', cr_sinsu_baekho: 'raid_airavata' };
for (const c of CRAFTS) if (CRAFT_NEEDS[c.id]) c.needs = CRAFT_NEEDS[c.id];

// ---------------------------------------------------------------- 방어구 보조 옵션
// The pieces besides the weapon (갑옷·방패·투구·망토) of special grade and above carry a second
// option line besides their first, and the higher ones (a raid's, a deep ground's, the smith's
// 전설 and 사신수 pieces) a feature of their own besides (PROCS): not a weapon's 격, a way of the
// piece. Both follow from the piece's id (gearExtra), so a save holds nothing new and every old
// piece has them already. A line is a second line, not more power: the piece's rank, and so its
// health, guard and 전투력 base, stay as they were (combatPower counts the lines a little).
// ---- armor option tuning (retune here) ----
// Per line worn: crit +4%p chance (of 10%); critdmg +25% on a crit (×1.8 → ×2.05); final ×1.05;
// floor: the low end of the blow's roll (0.9..1.1) raised 8% (so 0.98..1.1); vamp: 0.5% of the
// hero's own blows back as health, at most vampCap of the most health a second; exp +8%.
export const GEAR_OPT = { crit: 0.04, critdmg: 0.25, final: 0.05, floor: 0.08, vamp: 0.005, vampCap: 0.015, exp: 0.08 };
export const EXTRA_OPTIONS = [
  { id: 'crit', text: '치명타 확률 +4%' },
  { id: 'critdmg', text: '치명타 피해 +25%' },
  { id: 'final', text: '최종 피해 +5%' },
  { id: 'floor', text: '최소 피해 +8%' },
  { id: 'vamp', text: '흡혈 0.5%' },
  { id: 'exp', text: '경험치 +8%' },
];
// The second line's pool by kind: low (an early ground's piece) and the more a high piece may draw.
// 갑옷 stays mostly with life; 방패 guard and the low end of a blow; 투구 the crit; 망토 speed and the rest.
const EXTRA_POOL = {
  armor: { low: ['life', 'regen', 'guard', 'exp'], high: ['vamp', 'final', 'crit'] },
  shield: { low: ['guard', 'regen', 'floor'], high: ['critdmg', 'boss', 'final'] },
  helmet: { low: ['crit', 'haste', 'mana'], high: ['floor', 'exp', 'critdmg'] },
  cape: { low: ['speed', 'magnet', 'regen'], high: ['critdmg', 'vamp', 'haste', 'final'] },
};
// The features (procs), by kind. cd: seconds between two.
//   barrier  호신강기 — every cd seconds a shield that takes k of the most health in blows.
//   killheal 흡정 — a kill heals k of the most health, chance a kill.
//   shock    진각 — struck, a shockwave round the hero (area tiles), dmg × the 격 power.
//   swift    질풍 — struck, speed +k for sec seconds.
// ---- armor proc tuning (retune here) ----
export const PROCS = {
  barrier: { name: '호신강기', cd: 18, k: 0.1, fx: 'k_p_protect', text: '18초마다 최대 체력 10%만큼 피해를 막는 보호막' },
  killheal: { name: '흡정', chance: 0.1, cd: 0.5, k: 0.02, fx: 'k_c_heal', text: '몬스터를 쓰러뜨리면 10% 확률로 체력 2% 회복' },
  shock: { name: '진각', cd: 4, area: 2, dmg: 1.5, fx: 'k_mk_quake', text: '맞으면 주변 2칸에 충격파(격 위력 ×1.5, 4초마다)' },
  swift: { name: '질풍', cd: 8, k: 0.35, sec: 2.5, fx: 'k_rp_walk', text: '맞으면 2.5초 동안 이동속도 +35%(8초마다)' },
};
const PROC_POOL = { armor: ['barrier', 'killheal'], shield: ['shock', 'barrier'], helmet: ['killheal', 'shock'], cape: ['swift', 'killheal'] };
const OPT_TEXT = Object.fromEntries([...OPTIONS, ...EXTRA_OPTIONS].map(o => [o.id, o.text]));
/** A piece's high grade: a raid's, a deep ground's (rank 15+), the smith's 전설·사신수 (rank 10+). */
function highPiece(sp) {
  return sp.craft ? sp.craft.pow >= 10 : sp.raid || sp.rank >= 15;
}
function idHash(id) {
  let h = 2166136261;
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h;
}
/** The second line and the feature of a piece besides the weapon, from its id: { extra, proc }. */
export function gearExtra(sp) {
  if (!sp || sp.kind === 'weapon' || sp.rarity || !EXTRA_POOL[sp.kind]) return { extra: null, proc: null };
  // A piece whose lines are written for it (armory.js: the 무신 set's, by its 신수).
  if (sp.craft && sp.craft.extra) return { extra: sp.craft.extra, proc: sp.craft.proc || null };
  const h = idHash(sp.id), high = highPiece(sp), pool = EXTRA_POOL[sp.kind];
  const first = sp.opt && sp.opt.id;
  const from = (high ? [...pool.low, ...pool.high] : pool.low).filter(o => o !== first && o !== 'power');
  // A high piece draws its line from the high half two times in three (an offensive line likelier).
  const pick = high && h % 3 ? pool.high.filter(o => o !== first) : from;
  const extra = pick[(h >>> 4) % pick.length];
  const procs = PROC_POOL[sp.kind];
  const proc = high ? procs[(h >>> 12) % procs.length] : null;
  return { extra, proc };
}
/** Every option id of a special (its first, then the rest). */
export function optIds(sp) {
  return sp.opts || (sp.opt ? [sp.opt.id] : []);
}
for (const sp of SPECIALS) {
  const { extra, proc } = gearExtra(sp);
  if (!extra && !proc) continue;
  const first = sp.opt.id;
  sp.opts = extra ? [first, extra] : [first];
  sp.extra = extra;
  sp.proc = proc;
  // A new object: OPTIONS' own entries are shared by many pieces.
  sp.opt = { id: first, text: [OPT_TEXT[first], extra && OPT_TEXT[extra], proc && PROCS[proc].name].filter(Boolean).join(' · ') };
  sp.optLines = [OPT_TEXT[first], extra && OPT_TEXT[extra]].filter(Boolean);
}

// Worn looks where 연's own item layer (yhero2's map) is missing or broken, as 연's 치장용 copy of
// the piece or its nearest kin (game.js yGearVariants; the icon follows the look, game.js wornIcon).
// The 용무기 by step, where the build's map repeats a lower step's sword (연's 칠~십 have no plain
// layer for these classes): {cls: {step: costume id}}.
export const DRAGON_LOOK = {
  warrior: { 7: 7100286, 8: 7100528, 9: 7100538, 10: 7100655 },
  rogue: { 7: 7100287, 8: 7100529, 9: 7100539, 10: 7100656 },
  mage: { 7: 7100288, 8: 7100530, 9: 7100540 },
  poet: { 7: 7100289, 8: 7100531, 9: 7100541, 10: 7100658 },
  archer: { 4: 7100283 },
  reaper: { 9: 7100640, 10: 7100664 },
};
// A slot's look by its variant (or the piece's name): {cls: {kind: {variant | name: costume id}}}.
// 용마제육투구 (202037) and 용천제사·제육투구 (202041, 202043) came out of the build drawn wrong (a
// flower, a straw hat): the 제사 as its 치장용, the 제육 (no 치장용) as the 제칠's. The 격투가's and
// 천인's 용왕의용포 has no outfit of its own in the build (the others wear their 멸아): the 멸아
// look their dragon armour wears.
export const LOOK_FIX = {
  warrior: { helmet: { 202037: 7100608 } },
  rogue: { helmet: { 202041: 7100381, 202043: 7100609 } },
  monk: { armor: { 용왕의용포: 7100552 } },
  celestial: { armor: { 용왕의용포: 7100690 } },
};

/**
 * What a crafted piece's next star costs. Old-style pieces: their recipe's first material.
 * Legendary pieces: 겁화의 파편, as in today's client. The 용무기 (sp null) climbs 제일 to 제십
 * like the client's: 은나무 파편 to 제오, 은나무 조각 (and 여의주) to 제구, and a 은나무 가지 for 제십.
 */
export function starMats(sp, star) {
  if (!sp) {
    if (star <= 4) return { mats: Object.assign({ silver1: 2 * star + 2 }, star === 4 ? { pearl: 1 } : {}), gold: 500 * star };
    if (star <= 8) return { mats: Object.assign({ silver2: star, scale: 5 }, star % 2 === 0 ? { pearl: 1 } : {}), gold: 1500 * star };
    // 제구 → 제십: three 은나무 가지 (was one), only from the last raids and the 끝없는 지옥 (MATS.silver3).
    return { mats: { silver3: 3, pearl: 2, essence: 10 }, gold: 50000 };
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
const DRAGON_LINE = { warrior: ['용마제', '검'], rogue: ['용천제', '검'], mage: ['용랑제', '봉'], poet: ['용겸제', '봉'], archer: ['용섬제', '궁'], lancer: ['용무제', '창'], monk: ['용비제', '권갑'], magus: ['용화제', '단봉'], celestial: ['용주제', '도'], dokkaebi: ['용린제', '퇴'], reaper: ['용라제', '명도'] };
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
  // A piece with a 진' form (the 사신수 지존 장비) shows it from ★5.
  if (c.picTop && star >= 5) return c.picTop;
  // A piece with no picture of its own name (악마 심판의낫): the original piece it is made after.
  if (c.picName) return c.picName;
  return c.steps ? name + c.steps[Math.max(1, Math.min(c.steps.length, star)) - 1] + '성' : name;
}

/** Every piece worn in today's look (its name at each star, kind), for the dress-room renders. */
export function coordiPieces() {
  const out = new Map();
  for (const cls of Object.keys(DRAGON_LINE)) for (let i = 1; i <= DRAGON_MAX; i++) out.set(dragonName(cls, i), 'weapon');
  for (const c of CRAFTS) {
    if (!c.pic || c.noCoordi) continue;
    for (const cls of craftClasses(c)) for (let st = 1; st <= 5; st++) out.set(craftPicture(SPECIAL[c.id], cls, st), c.kind);
  }
  return [...out].map(([name, kind]) => ({ name, kind }));
}

/** Every picture the gear can use, for tools/fetch_gear.py. */
export function gearPictures() {
  const out = new Set();
  for (const cls of Object.keys(DRAGON_LINE)) for (let i = 1; i <= DRAGON_MAX; i++) out.add(dragonName(cls, i));
  for (const c of CRAFTS) {
    if (!c.pic) continue;
    for (const cls of craftClasses(c)) for (let st = 1; st <= 5; st++) out.add(craftPicture(SPECIAL[c.id], cls, st));
  }
  return [...out];
}

/** The classes a crafted piece is made for (`only`, else every class). */
function craftClasses(c) {
  return Object.keys(DRAGON_LINE).filter(cls => !c.only || c.only.includes(cls));
}

// Pieces of the lines (avatar.js GEAR) whose 연 icon is another item's — 연 has no item of that
// name, so the build's map gave the piece a kin's layer and icon (철검 showed 바람홍옥검, the
// shields 수라방패, the later classes' 해골갑옷 a 용 outfit ...). These show the original's own icon
// by name instead (the official item render, tools/fetch_icons.py; game.js nameIcon); the hero
// still wears the 연 layer. Found by the icon audit: every 도감 row whose icon's item is not the
// piece, kept where the avatar server has the name (tools/item_catalog.json).
export const NAME_ICONS = new Set(['철검', '삼첨도', '일월대도', '흑단화염장', '남자기모노', '황혼의갑주', '해골갑옷',
  '대나무방패', '떡갈나무방패', '문신방패', '팔세지도', '일광방패', '월광방패', '주술방패', '거울방패', '청룡의검', '불의갑주',
  '저주의단검', '백화검', '무도가옷', '건곤권', '백운장', '백선마봉', '하늘개비', '초롱', '검정깃발', '여명의치마', '초록색궁포',
  // the legendary sets' looks as the lines hold them (★1 names)
  '고대마령투구1성', '금린화월관1성', '태염무신금잠1성', "용아투구'마1성", "용아투구'천1성", '고대마령모자1성', '금린추월관1성',
  '태광천신금잠1성', "용아천관'랑1성", "용아천관'겸1성", '금린화월1성', '무신귀갑주1성', '금린추월1성', '천신부금장1성']);

/** What tools/fetch_icons.py fetches: every crafted piece's pictures (gear), the lines' pieces
 *  shown by name (NAME_ICONS) and the materials' 연 item ids. */
export function iconPictures() {
  const gear = gearPictures();
  const mats = Object.fromEntries(Object.entries(MATS).filter(([, m]) => m.yeon).map(([id, m]) => [id, m.yeon]));
  return { gear, names: [...NAME_ICONS].filter(n => !gear.includes(n)), mats };
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

// ---------------------------------------------------------------- 끝없는 지옥's loot
// The 끝없는 지옥's weapons, only there: 고유 only (gold: a Diablo II name, fixed affixes and its own
// 격, a 연 effect), one of a kind and a real find. Each is kept in progress.abyssLoot
// ({ id: { kind, rarity: 'unique', rank, u } }) and registered as a special ('sp:ab…' in the bag,
// weaponSp when worn), so the bag, the equip window, the forge's stars and the 전투력 take it as
// they take any special. color: its beam and name in the dark, ui: its name on the parchment
// windows. Its power is its depth's (abyssPower), under the 용무기 제십's: ABYSS_HUNT is its edge. (An old save's 마법 and
// 희귀 pieces, from when there were three grades, load as 고유: loadAbyssLoot.)
export const RARITY = {
  unique: { name: '고유', color: '#d8a64a', ui: '#a0601a', pow: 2 },
};
// Their looks: one of 연's own high named weapons per class (its 코디 weapon layer, ABYSS_BASE: the
// 진일염화검 and its 염화 kin, the 진'청일기창 ...), "dressed" in the abyss's colours by the game:
// the weapon's pixels (and the swing trail its sheet carries) darkened to black and blood red, a
// red glow round it and 연's fire tongues (the archer's 화염벽) standing along the blade, following it
// cell by cell in every direction (game.js dressedSheet, bladePoints). ABYSS_DRESS sets how much by
// rarity. Where a build lacks the layer the plain line's iron or steel one is worn instead
// (ABYSS_LOOK_TIER, also its icon then). The look is only the look: the power is the abyss's rank's.
// ---- abyss weapon tuning (retune here) ----
export const ABYSS_BASE = {
  warrior: [7100495, '진일염화검'], rogue: [7100303, "진'청일기창"], mage: [7100498, '청염단강봉'],
  poet: [7100305, "진'적염곤봉"], archer: [7100500, '흑일멸화궁'], lancer: [7100524, '청염멸창'],
  monk: [7100499, '백운뇌권갑'], magus: [9988277, '적혼의 단봉'], celestial: [7100502, '청월염표창'],
  dokkaebi: [7100503, '적월염퇴'], reaper: [7100654, '선일태도'],
};
// tint: how far to black-red (0..1); glow: the red halo's strength; flames: tongues along the blade;
// fsc: their size.
export const ABYSS_DRESS = { tint: 1, glow: 0.65, flames: 5, fsc: 1 };
export const ABYSS_LOOK_TIER = {
  plain: { warrior: 1, rogue: 2, mage: 1, poet: 1, archer: 2, lancer: 2, monk: 2, magus: 2, celestial: 2, dokkaebi: 2, reaper: 2 },
  dark: { warrior: 1, rogue: 2, mage: 4, poet: 1, archer: 3, lancer: 4, monk: 3, magus: 4, celestial: 4, dokkaebi: 4, reaper: 4 },
};
// What the weapon does as it strikes, the same for every weapon of a kind: black and burning fire,
// 연's own pictures layered (tools/yeon_abyss_fx.json, fx k_ab_*: 연's 심연 weapon effects, the hell
// raid's 난무, 누라리횬's smoke and dark explosion, the boss fires). Each look is layers of
// [fx, scale, dy, delay s]: the dark first, the fire flaring over it a moment later. Two kinds: the
// close-in weapons (a dark-red slash and a spray of embers; a unique's heavier blow a dark burst
// with a molten fireball rising out of it) and the far ones, bows and casters' staves, fans and
// gourds (black smoke and embers where the blow lands; a unique's the hell raid's black smoke and
// fire). A caster's blow lands on its target as an arrow does, so they share the far set.
export const ABYSS_SWING = {
  melee: { hit: [['k_ab_slash', 1, 0, 0], ['k_ab_embers', 1.1, -6, 0.08]],
    heavy: [['k_ab_darkburst', 0.6, 0, 0], ['k_ab_molten', 0.45, -10, 0.15]] },
  ranged: { hit: [['k_ab_smoke', 0.6, 0, 0], ['k_ab_embers', 1.2, -6, 0.05]],
    heavy: [['k_ab_spree', 1, 0, 0]] },
};
// size (× the layers' own), seconds between strikes' effects, the heavy blow every hcd s.
export const SWING_OF = { scale: 1.05, cd: 0.45, heavy: 1, hcd: 2 };
// 악마 심판의낫 strikes with these too (it is dressed as the 끝없는 지옥's weapons are).
for (const c of JUDGE_CRAFTS) if (c.swing) SPECIAL[c.id].swing = SWING_OF;
// A far weapon's flying spells and arrows leave a trail: puffs of black smoke and embers behind
// them, every cd seconds while they fly.
// The strike effects' size against the hero (a blow of the weapon, not a spell of its own).
export const ABYSS_FX_K = 0.75;
export const ABYSS_TRAIL = { layers: [['k_ab_smoke', 0.24], ['k_ab_embers', 0.55]], scale: 1, cd: 0.05 };
export const MELEE_WEAPON = new Set(['warrior', 'rogue', 'lancer', 'monk', 'dokkaebi', 'reaper']);
// The uniques: names after Diablo II's, each with a dark look that fits it and a 격 out of
// gyeok.js (연's own effect, to match the look: poison for the fang, fire for the horn ...).
export const ABYSS_UNIQUES = [
  { u: 'raven', name: '피의 까마귀 발톱', opts: ['power', 'speed'], gyeok: 'ab_saseong' },
  { u: 'andariel', name: '안다리엘의 독니', opts: ['power', 'regen'], gyeok: 'ab_maengdok' },
  { u: 'mephisto', name: '메피스토의 증오', opts: ['haste', 'mana', 'power'], gyeok: 'ab_binggyeol' },
  { u: 'diablo', name: '공포의 군주의 뿔', opts: ['power', 'life'], gyeok: 'ab_yeomryeong' },
  { u: 'baal', name: '바알의 세계석 조각', opts: ['power', 'haste', 'guard'], gyeok: 'ab_jiok' },
  { u: 'tyrael', name: '티리엘의 맹세', opts: ['speed', 'regen', 'haste'], gyeok: 'ab_nakroe' },
  { u: 'cow', name: '소 왕의 뿔', opts: ['power', 'magnet'], gyeok: 'ab_gijeol' },
  // 태초의 무기: the 일본 1차 weapons of old, one per class and no 성, as they were at the beginning,
  // in a golden-white light (TAECHO_DRESS). Only the 세계석 요새's lord and the 소 왕 drop them.
  { u: 'taecho', name: 'TAECHO', opts: ['power', 'haste', 'life'], gyeok: 'taechogwang', taecho: true },
];
// 태초의 무기's look: an old 바람 weapon in 연's own drawing for the class (its plain id in the hero's
// layers), and its name. The first four: their 일본 1차 weapons. The classes old 바람 lacked: an old
// weapon 연 draws for them that suits them (금홍단봉, 청월표창, 신일태도 are old 바람's too; the
// 도깨비 the 청룡의검, the 창술사 the long 흑단화염장). The 궁사 and 권사 have no old weapon 연 draws:
// their 일본 line's (흑일 bow, 섬월권갑).
// The first four wear old 바람's own picture of the weapon (TAECHO_CLASSIC: its old item picture, one only),
// laid each frame along where 연's drawing of it is held (game.js classicSheet), so it swings as 연's.
// (Off: laid by machine the old pictures did not sit well in 연's hands, so 태초 wears 연's own
// drawing of the weapon. Fill this in to bring them back.)
export const TAECHO_CLASSIC = {};
// Each old picture's line, in its own pixels: [handle's end x, y, tip x, y, size, up] (they lie every
// way: the spear and staff flat, the sword and the rod aslant). size: against 연's weapon's length
// (진일신검's lightning blade spreads wide, so less); up: the tip turned upward where 연 holds the
// weapon pointing down (the 주술사's rod), so the old staff stands by the shoulder, not behind the body.
export const CLASSIC_AXIS = {
  '진일신검1성': [39, 28, 9, 0, 0.62, false], '청일기창1성': [105, 5, 0, 5, 1, false],
  '황염곤봉1성': [83, 9, 0, 9, 1, true], '적염곤봉1성': [2, 31, 21, 0, 1, false],
};
// The 태초 weapons are the original's 칠지천지환 line (its blades come out of a gauntlet), one of each
// class's kind, as the original draws them worn laid on 연's heroes (tools/sinsu_worn.py, layers
// "s_tc_<class>", the gauntlet on the fist), dressed in the same gold-white. The 격투가's, with no
// glove of the line, the 칠지천지환영검. TAECHO_BASE's ids: the look where a build lacks the layers.
export const TAECHO_WORN = Object.fromEntries(['warrior', 'rogue', 'mage', 'poet', 'archer', 'lancer', 'monk', 'magus', 'celestial', 'dokkaebi', 'reaper'].map(c => [c, 's_tc_' + c]));
export const TAECHO_BASE = {
  warrior: [1171, '칠지천지환검'], rogue: [1272, '칠지천지환도'], mage: [1372, '칠지천지환봉'], poet: [1471, '칠지천지환장'],
  archer: [220077, '칠지천지환궁'], lancer: [1324, '칠지천지환창'], monk: [70025, '칠지천지환영검'], magus: [330064, '칠지천지환단봉'],
  celestial: [260048, '칠지천지환구겸'], dokkaebi: [1020, '칠지천지환화도'], reaper: [310026, '칠지천지환명도'],
};
// The abyss uniques' looks beyond the 전사·도적: the original's black and red weapons laid on 연's
// heroes (layers "s_ab_<class>"; ABYSS_BASE where a build lacks them), dressed black, blood and fire:
// 주술사 고대마령의적혈장, 도사 할로윈천마적혈봉, 궁사 할로윈천마적혈궁, 격투가 주박권법혈천장갑,
// 마도사 할로윈천마암흑단봉, 천인 흑옥방천극, 도깨비 고대마령의적혈봉, 차사 사혼명도. The 창술사 wears
// 연's own 청염멸창 (ABYSS_BASE: drawn for 연's spear rig) instead; to lay an original's spear for it
// (tools/sinsu_worn.json ab_lancer, built as a long spear), put 'lancer' back in ABYSS_LAID.
const ABYSS_LAID = ['mage', 'poet', 'archer', 'monk', 'magus', 'celestial', 'dokkaebi', 'reaper'];
export const ABYSS_WORN = Object.fromEntries(ABYSS_LAID.map(c => [c, 's_ab_' + c]));
// 태초 and the abyss uniques are the top of the weapons: their 격 drawn this much larger again
// (the picture only; GYEOK_TIER's reach by rank is unchanged).
export const TOP_GYEOK_FX = { taecho: 1.6, abyss: 1.4 };
// pal: the recolour (pale gold, the weapon's own shading kept); glowColor and the white core; the
// sparks along the blade are 연's own fire tongues turned to gold-white light; fx: the strike's
// effects (the abyss ones) in gold-white.
// 태초의 무기's own way (WEAPON_FAMILY.taecho): the first blow. A foe struck at its full health takes
// fresh more (the crowd at every first blow, a boss once, never a war's fighter); the crowd mob more
// besides. "Every foe" is the 심판의낫's alone, and the abyss's dark burst its uniques' alone (태초's
// light bursts as its 격, 태초광명). It stands pow ranks above an abyss unique of the deepest floor
// (11.5 + 2 = 13.5; with its 공격력 option a boss ×3.01, rank 16.8, under the 용무기 제십's 17.2); a
// crowd ×3.46 (×4.85 its first blow), the most outside the abyss, where an abyss unique's own hunt
// (×3.78) is better still.
export const TAECHO_EDGE = { pow: 2, all: 0, mob: 0.15, fresh: 0.4 };
export const TAECHO_DRESS = { pal: 'gold', tint: 0.45, classicTint: 0.12, glow: 0.85, glowColor: '#ffcf5a', core: '#fff6dc', flames: 4, fsc: 0.75, fxTint: { default: 'grayscale(1) sepia(0.55) saturate(1.8) brightness(2.1)',
    // the dark ones (smoke, the dark burst) turned over first: their black becomes light
    k_ab_smoke: 'grayscale(1) invert(1) sepia(0.5) saturate(1.6) brightness(1.05)',
    k_ab_darkburst: 'grayscale(1) invert(1) sepia(0.5) saturate(1.6) brightness(1.05)' } };
// How rare: of the 세계석 요새 lord's own drops (ABYSS_DROP.boss, 20%) a quarter, about one hunt in
// twenty; the 소 왕, besides his horn, one hunt in eight (it was 30% a kill: three cow runs a 태초).
const TAECHO_DROP = { abyss4: 0.25, cow: 0.12 };
export function taechoChance(stage) { return TAECHO_DROP[stage] || 0; }
const OPT_BY = Object.fromEntries(OPTIONS.map(o => [o.id, o]));

function registerAbyss(id, d) {
  const un = ABYSS_UNIQUES.find(x => x.u === d.u) || ABYSS_UNIQUES[0];
  const opts = un.opts.filter(o => OPT_BY[o]);
  const T = un.taecho;
  SPECIAL[id] = { id, src: 'abyss', srcName: '끝없는 지옥', raid: false, kind: d.kind, rank: d.rank, rarity: d.rarity,
    opts, opt: { id: opts[0], text: opts.map(o => OPT_BY[o].text).join(' · ') }, gyeok: un.gyeok,
    ward: null, abName: T ? Object.fromEntries(Object.entries(TAECHO_BASE).map(([c, [, n]]) => [c, '태초의 ' + n])) : un.name,
    taecho: !!T, classic: T ? TAECHO_CLASSIC : null,
    // The look on the hero (a plain weapon's) and the strike's effect.
    lookTier: ABYSS_LOOK_TIER.dark, base: T ? TAECHO_BASE : ABYSS_BASE, dress: T ? TAECHO_DRESS : ABYSS_DRESS, swing: SWING_OF,
    worn: T ? TAECHO_WORN : ABYSS_WORN };
  return SPECIAL[id];
}

/** The abyss pieces already found (an old save has none). A 마법 or 희귀 piece from when there were
 *  three grades becomes a 고유, the same one for the same piece (by its id), and is kept so. */
export function loadAbyssLoot(loot) {
  for (const [id, d] of Object.entries(loot || {})) {
    if (d.rarity !== 'unique' || !ABYSS_UNIQUES.some(x => x.u === d.u)) {
      const pool = ABYSS_UNIQUES.filter(x => x.u !== 'cow' && x.u !== 'taecho');
      let h = 0;
      for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
      d.rarity = 'unique';
      d.u = pool[h % pool.length].u;
      delete d.opts;
      delete d.name;
    }
    registerAbyss(id, d);
  }
}

/** A new abyss weapon, kept; returns its special. One of the uniques (not the 소 왕's horn, which
 *  only he drops) unless named. */
export function rollAbyssItem(loot, rank, uniq = null) {
  const pool = ABYSS_UNIQUES.filter(x => x.u !== 'cow' && x.u !== 'taecho');
  const d = { kind: 'weapon', rarity: 'unique', rank, u: uniq || pool[Math.floor(Math.random() * pool.length)].u };
  let n = Object.keys(loot).length + 1;
  while (loot['ab' + n]) n++;
  loot['ab' + n] = d;
  return registerAbyss('ab' + n, d);
}

function abyssName(sp, cls) {
  return typeof sp.abName === 'object' ? sp.abName[cls] || sp.abName.warrior : sp.abName;
}

// ---------------------------------------------------------------- weapon families
// Each family has its place, none best at everything (README "무기 계열"):
//   용무기 — the growth line: the most raw power at its step, its 용X격, the core spell sooner at
//            제구·제십: the single target, a boss, a raid.
//   사신수 — each its 신수's way: 청룡 curse and control with a drain, 주작 fire round and an aura
//            that strengthens the allies near, 백호 the pouncing tiger, 현무 the shell: group play.
//   심연 고유 — less raw power, but the crowd: more to plain monsters, more in the abyss, kills
//            bursting in dark fire: hunts and the abyss.
//   전설 — 금린 paralyses (a war's fighters too), 무신 turns the spells faster with a bleed.
// ---- weapon family tuning (retune here) ----
// 용무기: each step 제일→제십 adds DRAGON_STEP of a rank (other pieces' stars add half a rank).
export const DRAGON_STEP = 0.8;
// The 끝없는 지옥's uniques: a rank by the depth they fell at (지하 묘지 23 … 세계석 요새 26),
// RARITY's +2 on top, the same for every class.
export const ABYSS_POW = { base: 8, perRank: 0.5 };
export function abyssPower(rank) {
  return ABYSS_POW.base + ABYSS_POW.perRank * Math.max(0, Math.min(3, (rank || 23) - 23));
}
// Their hunt: mob — more to plain monsters and champions (not bosses, leaders or a war's
// fighters); abyss — more again to all in the 끝없는 지옥; burst — a kill may burst in dark fire
// round the fallen (격 power dmg on the tiles within area; cd seconds).
export const ABYSS_HUNT = { mob: 0.2, abyss: 0.15, burst: { chance: 0.2, cd: 0.5, dmg: 2.5, area: 1, fx: 'k_ab_darkburst' } };
// 주작의 기운: allies (companions, raiders, the guild in a war) within r tiles of the wearer
// strike k harder, perStar more for each star above ★1; the 용무기 제십 that took the 주작, dragonK.
export const JUJAK_AURA = { r: 4, k: 0.12, perStar: 0.0075, dragonK: 0.06 };
// 심판의낫's way: the same edge on every foe (crowd, boss, leader, a war's fighter), no niche; more
// with each step of the line (청룡 4%, 군주 6%, 악마 8%).
export const JUDGE_EDGE = { cr_judge_weapon: 0.04, cr_judge_weapon2: 0.06, cr_judge_weapon3: 0.08 };
// A weapon's 격 grows with the weapon: from rank `at` its picture is drawn fxK times larger and a
// 격 that strikes round (area) reaches `area` tiles further (진청룡마령참 on a 13+ weapon, the
// 사신수's, the 용무기 제구·제십's). Single-target 격 stay single (the 용X격): only the picture grows.
// The rank is the weapon's as it strikes a boss (game.js weaponEff: its 공격력 options and its family's
// edge counted), so 태초 and 악마 심판의낫 are drawn as large as they strike. The top (신화: the 용무기
// 제십, 사신수 ★5, 악마 심판의낫, 태초) ×1.7, and the screen flashes in the family's colour (FAMILY_TINT).
// lv: the 격's way one step further (gyeok.js mech: a chain +1 leap a step, a ground +0.5 s, 태초's
// light one pillar more at 3); flash: a soft light round the struck (no longer the whole screen).
export const GYEOK_TIER = [{ at: 16.75, fxK: 1.7, area: 1, flash: true, lv: 3 }, { at: 16, fxK: 1.5, area: 1, lv: 2 }, { at: 14.5, fxK: 1.35, area: 1, lv: 1 }, { at: 13, fxK: 1.2, area: 0, lv: 1 },
  // and under: the lower a weapon, the smaller its 격's picture (a ground's or a material craft's).
  { at: 10, fxK: 1, area: 0 }, { at: 6, fxK: 0.85, area: 0 }, { at: -99, fxK: 0.7, area: 0 }];
// The flash's colour by the family (the 용무기 its 사신수's when it took one, else gold-white).
export const FAMILY_TINT = { dragon: '#fff2c0', taecho: '#ffcf5a', judge: '#c0201a', abyss: '#c0201a', cheong: '#3f9dff', jujak: '#ff6a2a', baekho: '#f4f4ff', hyeonmu: '#2ad0a0', heaven: '#fff6dc' };
export const SINSU_TINT = { cheong: '#3f9dff', jujak: '#ff6a2a', baekho: '#f4f4ff', hyeonmu: '#2ad0a0' };
// 천상 각성 (선계 레이드's 선계의 기운): the 용무기 제십 in a light of 선계 — gold-white, as 태초's but cooler,
// its strikes lit. A look only (no rank: the 제십 stays the top), HEAVEN_COST at the smith.
export const HEAVEN_DRESS = { pal: 'heaven', tint: 0.25, glow: 0.9, glowColor: '#fff2c0', core: '#ffffff', flames: 4, fsc: 0.7 };
export const HEAVEN_COST = { mats: { seongi: 12, essence: 20 }, gold: 60000 };
export function gyeokTier(rank) {
  return GYEOK_TIER.find(t => rank >= t.at) || null;
}

// The families as the equipment window tells them: name, role, where they are best, the trade.
export const WEAPON_FAMILY = {
  plain: { name: '일반 장비', role: '기본', best: '초반 사냥', text: '사냥터에서 나오는 기본 무기. 별마다 반 등급.' },
  raid: { name: '레이드 장비', role: '레이드 보상', best: '그 레이드 단계', text: '레이드 보상 상자의 무기. 격·옵션 없이 등급만.' },
  special: { name: '스페셜', role: '보스의 격', best: '격에 따라', text: '보스의 격 하나와 옵션 하나, 한 등급 반 위. 아주 드물게 떨어짐.' },
  craft: { name: '조합 장비', role: '재료 조합', best: '중반', text: '재료로 만드는 장비. 옵션과 격이 정해져 있음.' },
  dragon: { name: '용무기', role: '성장형 단일 화력', best: '보스·레이드 딜',
    text: '같은 단계 최고의 기본 공격력(제일 10 → 제십 17.2등급, 조합의 꼭대기). 용X제N격 고정 피해, 제구·제십은 핵심 기술 재사용 -35%/-50%, 제십은 사신수 하나(각인 격·신수 색 광채)와 선계의 기운으로 천상 각성(외형만). 광역·보조 효과는 없음.' },
  cheong: { name: '사신수 · 청룡', role: '제어·저주 + 흡혈', best: '레이드·길드전 (저주 걸린 적은 아군에게 더 아픔)',
    text: '청린수폭이 자주 터져 저주·둔화를 걸고 준 피해의 10%를 흡혈. 등급 16.4(용무기 제구와 같음, ★5 17). 성물은 바루나 레이드(L15)에서.' },
  jujak: { name: '사신수 · 주작', role: '화상 광역 + 아군 공격력 오라', best: '레이드·길드전·동료 사냥',
    text: '주작비상 격(넓은 화상, 내 공격 +30%)과 주작의 기운: 주변 4칸 안의 동료·공대원·길드원 공격력 +12%(★5 +15%). 혼자일 때는 오라가 쓸모없음.' },
  baekho: { name: '사신수 · 백호', role: '공격·백호 덮치기', best: '사냥·보스 폭딜',
    text: '망토 자리. 백호가 따라다니며 덮치고, 백호의 맹렬 격이 공격을 올림. 무기 자리를 쓰지 않음.' },
  hyeonmu: { name: '사신수 · 현무', role: '방어·보호막', best: '생존·탱커',
    text: '갑옷 자리. 맞을 때 현무의 철옹: 주변 기절과 받는 피해 -40%.' },
  abyss: { name: '심연 고유', role: '사냥 청소·어둠 폭발', best: '사냥·끝없는 지옥',
    text: '일반 몬스터·챔피언에게 피해 +20%, 끝없는 지옥에서 +15% 더, 처치 시 20% 어둠 폭발(주변 피해). 보스·우두머리·대인전에는 이 힘이 없고 등급도 낮음(최대 11.5, 공격력 옵션 ×1.15).' },
  taecho: { name: '태초의 무기', role: '무리 사냥의 왕·첫 일격', best: '사냥 (끝없는 지옥 밖), 보스는 제십 바로 아래',
    text: '처음 맞는 적(체력이 가득한 적)에게 피해 +40%, 일반 몬스터에게 +15%. 태초광명 격: 넓은 금빛 일격과 기절. 등급 13.5(공격력 옵션 포함 보스 16.8)로 용무기 제십(17.2) 바로 아래. 끝없는 지옥 밖 사냥에서는 가장 강함. 어둠 폭발은 없음. 세계석 요새 군주(약 5%)·소 왕(12%)만 떨어뜨림.' },
  gold: { name: '전설 · 금린', role: '제압(마비)·대인전', best: '길드전 PvP',
    text: '화륜옥쇄 격: 주변 큰 피해와 마비(길드전의 적도 묶임). 옵션은 생존(체력·방어)이라 딜은 용무기보다 낮음.' },
  steel: { name: '전설 · 무신', role: '기술 회전·출혈', best: '사냥·기술 난사',
    text: '사성격 출혈(일반 몬스터)과 이동·기술 재사용 옵션. 보스에게는 출혈이 듣지 않음.' },
  judge: { name: '심판의낫', role: '균형 딜·회복', best: '어디서나 (사냥·보스·레이드·길드전)',
    text: '모든 적에게 같은 피해 보너스(보스·길드전 상대 포함): 청룡 +4% → 군주 +6% → 악마 +8%. 격은 일격과 회복(청룡참 → 진청룡마령참 → 악마 심판 격). 청룡(용궁 뒤) 12.5 → 군주(황무지 뒤) 13 → 악마 심판의낫(지하국대적 레이드의 회한옥\'심) 15등급(보스 16.9). 어느 한 곳의 최고는 아니지만 빈 곳이 없음. 전사·도적·주술사.' },
};
const FAMILY_OF_CRAFT = { cr_sinsu_cheong: 'cheong', cr_sinsu_jujak: 'jujak', cr_sinsu_baekho: 'baekho', cr_sinsu_hyeonmu: 'hyeonmu',
  cr_gold_weapon: 'gold', cr_gold_weapon2: 'gold', cr_steel_weapon: 'steel', cr_steel_weapon2: 'steel', cr_judge_weapon: 'judge', cr_judge_weapon2: 'judge', cr_judge_weapon3: 'judge' };
/** A piece's family (a key of WEAPON_FAMILY): sp its special (or null); dragon: the 용무기; raid: a raid's piece. */
export function familyOf(sp, dragon = false, raid = false) {
  if (dragon) return 'dragon';
  if (!sp) return raid ? 'raid' : 'plain';
  if (sp.rarity) return sp.taecho ? 'taecho' : 'abyss';
  if (sp.craft) return FAMILY_OF_CRAFT[sp.id] || 'craft';
  return 'special';
}
/** One line for the equipment window: "[용무기] 성장형 단일 화력 — 강점: 보스·레이드 딜". */
export function familyLine(key) {
  const f = WEAPON_FAMILY[key];
  return f ? `[${f.name}] ${f.role} — 강점: ${f.best}` : '';
}
