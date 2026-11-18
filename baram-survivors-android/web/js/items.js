// Special items and the item book (도감).
//
// Every hunting ground and every raid has three special pieces of its own — a weapon, an armor
// and a shield — that drop only there, and very rarely (about 0.03% from a plain monster, more
// from champions, leaders and bosses). A special looks like an ordinary piece of that ground's
// rank but carries the ground's name and one extra option, and counts a rank above it. They are
// what makes a conquered ground worth hunting again; the 도감 shows where each piece drops.

import { STAGES, RAIDS, CLASSES } from './data.js';
import { GEAR, RAID_GEAR, raidSet, plainTiers, plainList, gearPower, lookTier } from './avatar.js';
import { SOURCE_GYEOK, CRAFT_GYEOK } from './gyeok.js';

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
  ...RAIDS.map(r => ({ id: r.id, name: r.name.replace(' 레이드', ''), i: r.level, raid: true, v2: r.v2 }))]
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
    const piece = raidSet(sp.src, cls).find(([k]) => k === sp.kind);
    return piece ? GEAR[cls][sp.kind].indexOf(piece[1]) : -1; // a raid's shield, for a class with none
  }
  // Its own look where the boss has one in this class's line (a fox's 칠지도, a skull's 참마도).
  const sg = SOURCE_GYEOK[sp.src];
  if (sg && sg.looks) {
    const name = sp.kind === 'weapon' ? sg.looks[['warrior', 'rogue', 'mage', 'poet'].indexOf(cls)] : sg.looks[sp.kind === 'armor' ? 4 : 5];
    const at = name ? GEAR[cls][sp.kind].indexOf(name) : -1;
    if (at >= 0) return at;
  }
  // A class whose plain line of this kind is all crafted looks (the 주술사's shields) takes the
  // line as it stands, so the special still has a base, a name and a picture.
  let list = plainList(cls, sp.kind);
  if (!list.length) list = GEAR[cls][sp.kind].map((n, i) => i);
  return list[Math.min(list.length - 1, Math.floor(sp.rank / 3) + 1)];
}

export function specialName(sp, cls) {
  if (sp.craft) return typeof sp.craft.name === 'string' ? sp.craft.name : sp.craft.name[cls];
  if (sp.rarity) return abyssName(sp);
  return `${PREFIX[sp.src]} ${GEAR[cls][sp.kind][specialBase(sp, cls)]}`;
}

/** A special counts a rank above its base, and half a rank more for a 격 or a ward. */
export function specialPower(sp, cls) {
  if (sp.craft) return sp.craft.pow + (sp.gyeok ? 0.5 : 0);
  if (sp.rarity) return gearPower(cls, sp.kind, specialBase(sp, cls)) + RARITY[sp.rarity].pow;
  return gearPower(cls, sp.kind, specialBase(sp, cls)) + 1 + (sp.gyeok || sp.ward ? 0.5 : 0);
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
  fur: { name: '짐승 가죽', icon: 'm_fur', from: ['deer', 'bear', 'bearman', 'steppe', 'raid_boar', 'raid_tiger', 'hwagwa', 'wolf', 'baekdu', 'baekdu2', 'zud'] },
  horn: { name: '도깨비 탈', icon: 'm_horn', from: ['goblin', 'yogoe', 'raid_goblin', 'hwagwa'] },
  bone: { name: '해골 조각', icon: 'm_bone', from: ['haunt', 'skull', 'raid_sorcerer', 'tagye', 'reef', 'wreck', 'greatwall'] },
  ember: { name: '불씨 단지', icon: 'm_ember', from: ['volcano', 'raid_fire', 'raid_agni', 'pokyeom', 'hwatang'] },
  jade: { name: '백옥', icon: 'm_jade', from: ['island', 'palace', 'royal', 'kirin', 'raid_airavata', 'gogyun', 'gareung'] },
  scale: { name: '용의 비늘', icon: 'gem2', from: ['bigsnake', 'sea', 'palace', 'raid_hydra', 'raid_sea', 'deepsea', 'raid_varuna', 'reef', 'wreck'] },
  pearl: { name: '여의주', icon: 'gem4', from: ['raid_hydra', 'palace', 'deepsea', 'raid_varuna'] },
  // Today's client's materials, as its smith asks for them: 금린 for the 중국전설 set, 순수의 강철
  // for the 일본전설 set, 조화의 정수 for the 용 set, 거마족의 영혼석 for 고대마령, a 제작 고문서
  // for every legendary piece, 겁화의 파편 for their stars, and the 은나무 파편·조각·가지 that
  // raise the 용무기 from 제일 to 제십.
  gold: { name: '금린', icon: 'm_gold', from: ['palace', 'royal', 'raid_tiger', 'raid_goblin', 'hwagwa', 'kirin', 'raid_wukong', 'raid_airavata', 'greatwall', 'qin', 'haya'] },
  steel: { name: '순수의 강철', icon: 'm_steel', from: ['volcano', 'japan', 'raid_sorcerer', 'raid_sea', 'raid_fire', 'musin', 'murim', 'raid_musin', 'raid_agni', 'wolf', 'ancient'] },
  essence: { name: '조화의 정수', icon: 'm_essence', from: ['raid_hydra', 'raid_sea', 'raid_fire', 'deepsea', 'kirin', 'raid_brit', 'raid_varuna', 'raid_agni', 'raid_airavata', 'baekdu4', 'hanbing', 'lobi', 'aram', 'ancient', 'cheolsang', 'abyss', 'abyss2', 'abyss3', 'abyss4', 'cow'] },
  soul: { name: '거마족의 영혼석', icon: 'm_soul', from: ['skull', 'yogoe', 'raid_sorcerer', 'tagye', 'raid_brit', 'raid_gwoe', 'geohae', 'hanbing', 'oldaram', 'jagwi', 'hwatang', 'cheolsang', 'abyss', 'abyss2', 'abyss3', 'abyss4'] },
  scroll: { name: '제작 고문서', icon: 'm_scroll', from: ['raid_boar', 'raid_tiger', 'raid_goblin', 'raid_hydra', 'raid_sorcerer', 'raid_sea', 'raid_fire', 'raid_wukong', 'raid_musin', 'raid_brit', 'raid_varuna', 'raid_agni', 'raid_airavata', 'raid_gwoe'] },
  kalpa: { name: '겁화의 파편', icon: 'm_kalpa', from: ['volcano', 'palace', 'royal', 'raid_boar', 'raid_tiger', 'raid_goblin', 'raid_hydra', 'raid_sorcerer', 'raid_sea', 'raid_fire', 'hwagwa', 'murim', 'musin', 'deepsea', 'kirin', 'tagye', 'raid_wukong', 'raid_musin', 'raid_brit', 'raid_varuna', 'raid_agni', 'raid_airavata', 'raid_gwoe', 'wreck', 'greatwall', 'qin', 'gogyun', 'spidercave', 'gareung', 'pokyeom', 'baekdu', 'baekdu2', 'baekdu3', 'baekdu4', 'hanbing', 'geohae', 'zud', 'zud2', 'sandolim', 'fallforest', 'jagwi', 'oldaram', 'haya', 'lobi', 'aram', 'ancient', 'hwatang', 'cheolsang', 'abyss', 'abyss2', 'abyss3', 'abyss4', 'cow'] },
  silver1: { name: '은나무 파편', icon: 'm_silver1', from: ['sea', 'island', 'volcano', 'palace', 'royal', 'raid_boar', 'raid_tiger', 'raid_goblin', 'raid_hydra', 'raid_sorcerer', 'raid_sea', 'raid_fire', 'hwagwa', 'murim', 'musin', 'deepsea', 'kirin', 'tagye', 'raid_wukong', 'raid_musin', 'raid_brit', 'raid_varuna', 'raid_agni', 'raid_airavata', 'raid_gwoe', 'wolf', 'reef', 'wreck', 'greatwall', 'qin', 'gogyun', 'spidercave', 'gareung', 'pokyeom', 'baekdu', 'baekdu2', 'baekdu3', 'baekdu4', 'hanbing', 'geohae', 'zud', 'zud2', 'sandolim', 'fallforest', 'jagwi', 'oldaram', 'haya', 'lobi', 'aram', 'ancient', 'hwatang', 'cheolsang', 'abyss', 'abyss2', 'abyss3', 'abyss4', 'cow'] },
  silver2: { name: '은나무 조각', icon: 'm_silver2', from: ['raid_hydra', 'raid_sorcerer', 'raid_sea', 'raid_fire', 'kirin', 'tagye', 'raid_wukong', 'raid_musin', 'raid_brit', 'raid_varuna', 'raid_agni', 'raid_airavata', 'raid_gwoe', 'baekdu4', 'hanbing', 'geohae', 'zud', 'zud2', 'sandolim', 'fallforest', 'jagwi', 'oldaram', 'haya', 'lobi', 'aram', 'ancient', 'hwatang', 'cheolsang', 'abyss', 'abyss2', 'abyss3', 'abyss4', 'cow'] },
  // The 사신수's 성물 (the original's 신수현신공성전: four of a 신수 make its 지존 piece; 연 keeps
  // 주작혈안 and 백호광안 among its items, whose icons these are). From the raids of the 신수's
  // nature, and the 길드대항전.
  sinsu_jujak: { name: '주작혈안', icon: 'st:mat_jujak', from: ['raid_fire', 'raid_agni'] },
  sinsu_baekho: { name: '백호광안', icon: 'st:mat_baekho', from: ['raid_tiger'] },
  sinsu_cheong: { name: '청룡의 비늘', icon: 'gem1', from: ['raid_varuna', 'raid_hydra'] },
  sinsu_hyeonmu: { name: '현무의 등딱지', icon: 'gem3', from: ['raid_sea'] },
  silver3: { name: '은나무 가지', icon: 'm_silver3', from: ['raid_hydra', 'raid_sea', 'raid_fire', 'raid_musin', 'raid_brit', 'raid_varuna', 'raid_agni', 'raid_airavata', 'abyss', 'abyss2', 'abyss3', 'abyss4'] },
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
  { id: 'cr_dragon_armor', kind: 'armor', name: { warrior: '용마파천갑', rogue: '용천파천갑', mage: '용랑파천의', poet: '용겸파천의', archer: '용섬파천복', lancer: '용무파천갑', monk: '용비파천갑', magus: '용화파천의', celestial: '용주파천단', dokkaebi: '용린파천갑', reaper: '용라파천갑' }, look: '용왕의용포', pow: 10, opt: 'guard',
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
    look: { warrior: '청룡의검', rogue: '백화검', mage: '해룡의지팡이', poet: '흑단부채', archer: '파천비궁', lancer: '파천비창', monk: '파천권갑', magus: '파천비단봉', celestial: '파천비포', dokkaebi: '파천퇴', reaper: '파천비명도' }, pow: 11, opt: 'power', mats: { gold: 12, scroll: 1 }, gold: 6000,
    pic: 'name', steps: [1, 3, 5, 7, 9], legend: true },
  { id: 'cr_gold_armor', kind: 'armor', name: { warrior: '금린천화갑', rogue: '금린천화갑', mage: '금린천추갑', poet: '금린천추갑', archer: '금린천화갑', lancer: '금린천화갑', monk: '금린천화갑', magus: '금린천추갑', celestial: '금린천추갑', dokkaebi: '금린천화갑', reaper: '금린천화갑' },
    look: { warrior: '곤룡포', rogue: '곤룡포', mage: '남자신관복', poet: '남자신관복', archer: '혈귀혼궁포', lancer: '지박귀남자경갑', monk: '지박귀남자대련복', magus: '은현복', celestial: '금고급천의', dokkaebi: '지박귀귀의', reaper: '사저의복' }, pow: 11, opt: 'life', mats: { gold: 12, scroll: 1 }, gold: 6000,
    pic: 'name', steps: [1, 3, 5, 7, 10], legend: true },
  { id: 'cr_gold_shield', kind: 'shield', name: '금린방패', look: '여신의방패', pow: 11, opt: 'guard',
    mats: { gold: 10, scroll: 1 }, gold: 6000, pic: 'name', steps: [1, 3, 5, 7, 10], legend: true },
  { id: 'cr_steel_weapon', kind: 'weapon', name: { warrior: '진일신검', rogue: '청일기창', mage: '황염곤봉', poet: '적염곤봉', archer: '한별가온궁', lancer: '백일신창', monk: '섬월권갑', magus: '금홍단봉', celestial: '청월표창', dokkaebi: '백일퇴', reaper: '신일태도' },
    look: { warrior: '일월대도', rogue: '삼첨도', mage: '백운장', poet: '하늘개비', archer: '진아광궁', lancer: '진아광창', monk: '경원권갑', magus: '진아광단봉', celestial: '아광포', dokkaebi: '아광퇴', reaper: '진아광백도' }, pow: 12, opt: 'haste', mats: { steel: 14, scroll: 1 }, gold: 8000,
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
    pic: 'name', steps: [1, 3, 5, 7, 10], legend: true },
  { id: 'cr_gold_weapon2', kind: 'weapon', name: { warrior: '마곡검', rogue: '패협검', mage: '백선마봉', poet: '암혈홍접선', archer: '흑일신궁', lancer: "화첨창'청", monk: "진'백운권갑", magus: "진'흑염곤봉", celestial: '흑옥방천극', dokkaebi: '멸룡퇴', reaper: '사혼태도' },
    look: { warrior: '청룡의검', rogue: '백화검', mage: '해룡의지팡이', poet: '흑단부채', archer: '파천비궁', lancer: '파천비창', monk: '파천권갑', magus: '파천비단봉', celestial: '파천비포', dokkaebi: '파천퇴', reaper: '파천비명도' }, pow: 13, opt: 'boss', from: 'cr_gold_weapon',
    mats: { gold: 20, kalpa: 15, scroll: 2 }, gold: 15000, pic: 'name', legend: true },
  { id: 'cr_dragon_armor2', kind: 'armor', name: { warrior: '용마멸아갑', rogue: '용천멸아갑', mage: '용랑멸아의', poet: '용겸멸아의', archer: '용섬멸아복', lancer: '용무멸아갑', monk: '용비멸아갑', magus: '용화멸아의', celestial: '용주멸아단', dokkaebi: '용린멸아갑', reaper: '용라멸아갑' },
    look: '용왕의용포', pow: 13, opt: 'life', from: 'cr_dragon_armor', mats: { essence: 15, scale: 20, pearl: 2 }, gold: 20000,
    pic: 'name', steps: [1, 3, 5, 7, 10], legend: true },
  { id: 'cr_brit_shield', kind: 'shield', name: '브리트라한의방패', look: '천성대방패', pow: 13, opt: 'regen', from: 'cr_steel_shield',
    mats: { essence: 10, kalpa: 20, scroll: 2 }, gold: 20000, pic: 'name', steps: [1, 3, 5, 7, 9], legend: true },
  { id: 'cr_steel_weapon2', kind: 'weapon', name: { warrior: "극'진일신검", rogue: "극'청일기창", mage: "극'황염곤봉", poet: "극'적염곤봉", archer: "극'한별가온궁", lancer: "극'백일신창", monk: "섬월권갑'폭", magus: "금홍단봉'화", celestial: "극'청월표창", dokkaebi: "진'백일퇴", reaper: "극'신일태도" },
    look: { warrior: '일월대도', rogue: '삼첨도', mage: '백운장', poet: '하늘개비', archer: '진아광궁', lancer: '진아광창', monk: '경원권갑', magus: '진아광단봉', celestial: '아광포', dokkaebi: '아광퇴', reaper: '진아광백도' }, pow: 14, opt: 'power', from: 'cr_steel_weapon',
    mats: { steel: 24, kalpa: 20, scroll: 2 }, gold: 20000, pic: 'name', legend: true },
  // 사신수 지존 장비 (the original: 청룡신검 the 전사's, 주작선장 the 주술사's, 백호환령부 — the
  // fastest mount, worn here as a mantle — and 현무불괴갑 anyone's). Each carries its 신수's 격.
  { id: 'cr_sinsu_cheong', kind: 'weapon', only: ['warrior'], name: '청룡신검', look: '청룡의검', pow: 14, opt: 'life', pic: 'name', picTop: "진'청룡신검",
    mats: { sinsu_cheong: 8, essence: 10, scroll: 2 }, gold: 30000, sinsu: true },
  { id: 'cr_sinsu_jujak', kind: 'weapon', only: ['mage'], name: '주작선장', look: '흑단화염장', pow: 14, opt: 'mana', pic: 'name', picTop: "진'주작선장",
    mats: { sinsu_jujak: 8, ember: 20, scroll: 2 }, gold: 30000, sinsu: true },
  // 백호환령부: the original's mount, here a weapon that lives — the white tiger follows and pounces.
  { id: 'cr_sinsu_baekho', kind: 'cape', pet: true, name: '백호환령부', look: '얼음망토', pow: 13, opt: 'speed', pic: 'name',
    mats: { sinsu_baekho: 8, fur: 30, scroll: 2 }, gold: 30000, sinsu: true },
  { id: 'cr_sinsu_hyeonmu', kind: 'armor', name: '현무불괴갑', pic: 'name', picTop: "진'현무불괴갑",
    look: { warrior: '비늘남자갑주', rogue: '황혼의갑주', mage: '용왕의용포', poet: '여명의치마', archer: '황혼의갑주', lancer: '감시자남자경갑', monk: '혈귀혼남자대련복', magus: '금고급현복', celestial: '파수꾼천의', dokkaebi: '혈귀혼귀의', reaper: '해태 흑의' }, pow: 14, opt: 'life',
    mats: { sinsu_hyeonmu: 8, scale: 20, scroll: 2 }, gold: 30000, sinsu: true },
];
for (const c of CRAFTS) {
  const sp = { id: c.id, src: 'craft', srcName: '대장장이 조합', raid: false, craft: c, kind: c.kind, opt: OPT(c.opt), rank: 0,
    gyeok: CRAFT_GYEOK[c.id] || null };
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
  return c.steps ? name + c.steps[Math.max(1, Math.min(c.steps.length, star)) - 1] + '성' : name;
}

/** Every piece worn in today's look (its name at each star, kind), for the dress-room renders. */
export function coordiPieces() {
  const out = new Map();
  for (const cls of Object.keys(DRAGON_LINE)) for (let i = 1; i <= DRAGON_MAX; i++) out.set(dragonName(cls, i), 'weapon');
  for (const c of CRAFTS) {
    if (!c.pic) continue;
    for (const cls of Object.keys(DRAGON_LINE)) for (let st = 1; st <= 5; st++) out.set(craftPicture(SPECIAL[c.id], cls, st), c.kind);
  }
  return [...out].map(([name, kind]) => ({ name, kind }));
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

// ---------------------------------------------------------------- 끝없는 지옥's loot
// The 끝없는 지옥's weapons, only there: 고유 only (gold: a Diablo II name, fixed affixes and its own
// 격, a 연 effect), one of a kind and a real find. Each is kept in progress.abyssLoot
// ({ id: { kind, rarity: 'unique', rank, u } }) and registered as a special ('sp:ab…' in the bag,
// weaponSp when worn), so the bag, the equip window, the forge's stars and the 전투력 take it as
// they take any special. color: its beam and name in the dark, ui: its name on the parchment
// windows. Its power stays under the raid sets: the plain top weapon + pow. (An old save's 마법 and
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
  poet: [7100305, "진'적염곤봉"], archer: [7100500, '흑일멸화궁'], lancer: [7100501, '백일신멸창'],
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
export const SWING_OF = { scale: 1.05, cd: 0.3, heavy: 1, hcd: 1.2 };
// A far weapon's flying spells and arrows leave a trail: puffs of black smoke and embers behind
// them, every cd seconds while they fly.
// The strike effects' size against the hero (a blow of the weapon, not a spell of its own).
export const ABYSS_FX_K = 0.75;
export const ABYSS_TRAIL = { layers: [['k_ab_smoke', 0.24], ['k_ab_embers', 0.55]], scale: 1, cd: 0.05 };
export const MELEE_WEAPON = new Set(['warrior', 'rogue', 'lancer', 'monk', 'dokkaebi', 'reaper']);
// The uniques: names after Diablo II's, each with a dark look that fits it and a 격 out of
// gyeok.js (연's own effect, to match the look: poison for the fang, fire for the horn ...).
export const ABYSS_UNIQUES = [
  { u: 'raven', name: '피의 까마귀 발톱', opts: ['power', 'speed'], gyeok: 'saseong' },
  { u: 'andariel', name: '안다리엘의 독니', opts: ['power', 'regen'], gyeok: 'maengdok' },
  { u: 'mephisto', name: '메피스토의 증오', opts: ['haste', 'mana', 'power'], gyeok: 'binggyeol' },
  { u: 'diablo', name: '공포의 군주의 뿔', opts: ['power', 'boss', 'life'], gyeok: 'yeomryeong' },
  { u: 'baal', name: '바알의 세계석 조각', opts: ['power', 'haste', 'guard'], gyeok: 'jiok' },
  { u: 'tyrael', name: '티리엘의 맹세', opts: ['boss', 'speed', 'regen'], gyeok: 'nakroe' },
  { u: 'cow', name: '소 왕의 뿔', opts: ['power', 'magnet'], gyeok: 'gijeol' },
];
const OPT_BY = Object.fromEntries(OPTIONS.map(o => [o.id, o]));

function registerAbyss(id, d) {
  const un = ABYSS_UNIQUES.find(x => x.u === d.u) || ABYSS_UNIQUES[0];
  const opts = un.opts.filter(o => OPT_BY[o]);
  SPECIAL[id] = { id, src: 'abyss', srcName: '끝없는 지옥', raid: false, kind: d.kind, rank: d.rank, rarity: d.rarity,
    opts, opt: { id: opts[0], text: opts.map(o => OPT_BY[o].text).join(' · ') }, gyeok: un.gyeok,
    ward: null, abName: un.name,
    // The look on the hero (a plain weapon's) and the strike's effect.
    lookTier: ABYSS_LOOK_TIER.dark, base: ABYSS_BASE, dress: ABYSS_DRESS, swing: SWING_OF };
  return SPECIAL[id];
}

/** The abyss pieces already found (an old save has none). A 마법 or 희귀 piece from when there were
 *  three grades becomes a 고유, the same one for the same piece (by its id), and is kept so. */
export function loadAbyssLoot(loot) {
  for (const [id, d] of Object.entries(loot || {})) {
    if (d.rarity !== 'unique' || !ABYSS_UNIQUES.some(x => x.u === d.u)) {
      const pool = ABYSS_UNIQUES.filter(x => x.u !== 'cow');
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
  const pool = ABYSS_UNIQUES.filter(x => x.u !== 'cow');
  const d = { kind: 'weapon', rarity: 'unique', rank, u: uniq || pool[Math.floor(Math.random() * pool.length)].u };
  let n = Object.keys(loot).length + 1;
  while (loot['ab' + n]) n++;
  loot['ab' + n] = d;
  return registerAbyss('ab' + n, d);
}

function abyssName(sp) {
  return sp.abName;
}
