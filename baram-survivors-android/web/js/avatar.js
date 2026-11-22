// The classes' gear lines (what each wears, tier by tier, and the raids' sets), and the old
// wardrobe's slot icons (tools/avatar_assets.py) for the few pieces 연 has no icon of.
// The wardrobe's figures themselves (a sheet per piece, the hero dressed from them) are gone: every
// hero is drawn from 연's own layers (game.js drawYhero2), and those sheets were 268 MB decoded.

// What each class wears, tier by tier: chests in the hunting grounds hand out the next one.
// Names are the wardrobe's.
export const GEAR = {
  warrior: { head: '17', armor: ['남자갑옷', '남자갑주', '비늘남자갑주', '궁중무사갑주', '남자무사옷', '불의갑주'],
    weapon: ['목검', '철검', '백화검', '환두대도', '칠지도', '용마제일검', '청룡의검', '참마도'],
    shield: ['나무방패', '사각방패', '철방패', '천성대방패'] },
  rogue: { head: '56', armor: ['호위무사옷', '흑영협객도복', '무도가옷', '해골갑옷', '중국풍남자옷', '황혼의갑주'],
    weapon: ['비늘단도', '가시철단도', '철도', '진아광검', '도룡보도', '용천제일검', '저주의단검'],
    shield: ['보라방패', '월광방패', '일광방패'] },
  mage: { head: '20', armor: ['남자신관복', '남자성광법의', '자개망토옷', '곤룡포', '용왕의용포'],
    weapon: ['해룡의지팡이', '월광천봉', '원혼의낫', '일월대도', '현랑부', '심판의낫', '흑단화염장'],
    shield: ['주술방패', '거울방패', '정화의방패'] },
  poet: { head: '19', armor: ['도포', '장삼', '남자도복', '남자제사장의상', '여명의치마'],
    weapon: ['흑단부채', '대붓', '백운장', '하늘개비', '자월초롱'],
    shield: ['신선비급', '호리병', '연등', '여신의방패', '백룡현갑'] },
  // 궁사: 바람의나라 연's own 궁포 and bows (worn as 연 draws them, tools/yeon_archer.py). The shield
  // 궁사 carries a quiver on its back in 연 (drawn with the bow), not a shield: it has no shield slot.
  archer: { head: '56', armor: ['초록색궁포', '가죽고급궁포', '청동고급궁포', '숲의군주궁포', '혈귀혼궁포', '파수꾼궁포'],
    weapon: ['목궁', '청동궁', '철태궁', '녹각궁', '대명궁', '진아광궁', '파천비궁'],
    shield: [] },
  // 무사: 연's own 경갑 and spears (tools/yeon_job.py). 연 gives the 무사 no shield beside its
  // spear: it has no shield slot (its armour carries the defence a shield would).
  lancer: { head: '17', armor: ['파란색남자경갑', '철고급남자경갑', '은남자경갑', '금고급남자경갑', '지박귀남자경갑', '감시자남자경갑'],
    weapon: ['나무창', '청동창', '철창', '은장철창', '흑영창', '진아광창', '파천비창'],
    shield: [] },
  // 격투가: 연's own 대련복 and 권갑 (tools/yeon_job.py), drawn on its own F_ body. 연 gives the
  // 격투가 no shield either: it has no shield slot (its armour carries the defence a shield would).
  monk: { head: '17', armor: ['가죽남자대련복', '구리남자대련복', '청동남자대련복', '숲의군주남자대련복', '지박귀남자대련복', '혈귀혼남자대련복'],
    weapon: ['가람권갑', '너울권갑', '라온조갑', '새나권갑', '비조권갑', '경원권갑', '파천권갑'],
    shield: [] },
  // 마도사: 연's own 현복 and 단봉 (tools/yeon_job.py). 연 gives the 마도사 no shield: the slot keeps
  // the old shields' names and stats and is not drawn.
  magus: { head: '20', armor: ['초급마도현복', '하급마도현복', '중급마도현복', '상급마도현복', '은현복', '금고급현복'],
    weapon: ['하급떡갈나무단봉', '청동단봉', '강철단봉', '은단봉', '혼령단봉', '진아광단봉', '파천비단봉'],
    shield: [] },
  // 천인: 연's own 천의 and 호리병·포 (tools/yeon_job.py), held behind it and thrown in its own frames.
  // 연 gives the 천인 no shield: it has no shield slot (its armour carries the defence a shield would).
  celestial: { head: '19', armor: ['보라색천의', '보라색고급천의', '은천의', '숲의군주천의', '금고급천의', '파수꾼천의'],
    weapon: ['나무호리병', '청동호리병', '강철호리병', '금호리병', '호표호리병', '아광포', '파천비포'],
    shield: [] },
  // 도깨비: 연's own 귀의 and 방망이·퇴 (tools/yeon_job.py), laid by the item's own prefab. 연 gives the
  // 도깨비 no shield: it has no shield slot (its armour carries the defence a shield would).
  dokkaebi: { head: '17', armor: ['구리귀의', '구리고급귀의', '청동고급귀의', '숲의군주귀의', '지박귀귀의', '혈귀혼귀의'],
    weapon: ['나무방망이', '청동방망이', '강철방망이', '금방망이', '흑단방망이', '아광퇴', '파천퇴'],
    shield: [] },
  // 차사: 연's own 흑의 and 백도·명도 (tools/yeon_job.py). 연 gives the 차사 no shield: the slot keeps
  // the old shields' names and stats and is not drawn.
  reaper: { head: '56', armor: ['감시자흑의', '파수꾼흑의', '혈귀혼흑의', '지박귀흑의', '사저의복', '해태 흑의'],
    weapon: ['나무백도', '청동백도', '강철백도', '금백도', '흑해백도', '진아광백도', '파천비명도'],
    shield: [] },
};
// 투구 and 망토: 바람의나라 연's own lines, weakest first (their worn sheets and icons come from
// 연's resources, tools/yeon_gear.py). Helmets end in the class's 제사 dragon helmet; the capes
// are shared. Today's crafted pieces (items.js) are added after these as crafted-only looks.
const HELMETS = ['연두색남자투구', '가죽남자투구', '구리남자투구', '청동남자투구', '금장남자투구', '북방의남자투구'];
const CAPES = ['남옥망토', '얼음망토', '숲의권속망토', '추방자망토', '몰락자망토', '밤의 인도자 날개(남)'];
const DRAGON_HELMET = { warrior: '용마제사투구', rogue: '용천제사투구', mage: '용랑제사투구', poet: '용겸제사투구', archer: '용섬제사투구', lancer: '용무제사투구', monk: '용비제사투구', magus: '용화제사투구', celestial: '용주제사투구', dokkaebi: '용린제사투구', reaper: '용라제사투구' };
for (const [cls, g] of Object.entries(GEAR)) {
  g.helmet = [...HELMETS, DRAGON_HELMET[cls]];
  g.cape = [...CAPES];
}

// Raid spoils: one piece a class a raid, beyond anything a hunting ground drops, after the boss
// it comes from — dragons' gear from 삼두룡, the judging and the cursed from 흑술사, fire from 화령.
export const RAID_GEAR = {
  // A set for each raid: an armor and a shield any class may wear, and a weapon for each
  // class. pow is the tier the set counts as (a hunting ground's best is about 4-5): a middling
  // raid gives middling pieces, the last raids the best.
  raid_boar: { pow: 3, armor: '원주민의옷', shield: '대나무방패',
    weapon: { warrior: '곤봉', rogue: '삼첨도', mage: '횃불', poet: '나비채', archer: '인각궁', lancer: '금장철창', monk: '면권갑', magus: '대나무단봉', celestial: '단호리병', dokkaebi: '단단한방망이', reaper: '단백도' } },
  raid_tiger: { pow: 4, armor: '여자무사옷', shield: '떡갈나무방패',
    weapon: { warrior: '백호의검', rogue: '얼음칼', mage: '건곤권', poet: '초롱', archer: '영월마궁', lancer: '촉루창', monk: '목권갑', magus: '철단봉', celestial: '철호리병', dokkaebi: '철방망이', reaper: '철백도' } },
  raid_goblin: { pow: 5, armor: '여자갑옷', shield: '문신방패',
    weapon: { warrior: '도깨비방망이', rogue: '현랑부', mage: '도깨비방망이', poet: '검정깃발', archer: '금강비궁', lancer: '두억창', monk: '진목권갑', magus: '흑골단봉', celestial: '은호리병', dokkaebi: '은방망이', reaper: '은백도' } },
  raid_hydra: { pow: 7, armor: '용왕의용포', shield: '백룡현갑',
    weapon: { warrior: '청룡의검', rogue: '도룡보도', mage: '일월대도', poet: '탁조', archer: '월천마궁', lancer: '벽사창', monk: '금강권갑', magus: '흑암단봉', celestial: '해염호리병', dokkaebi: '뼈방망이', reaper: '해백도' } },
  raid_sorcerer: { pow: 8, armor: '무녀복', shield: '팔세지도',
    weapon: { warrior: '참마도', rogue: '저주의단검', mage: '심판의낫', poet: '자월초롱', archer: '대붕지옥궁', lancer: '길달창', monk: '바람제일식권갑', magus: '독각단봉', celestial: '흑해염호리병', dokkaebi: '흑골방망이', reaper: '흑사백도' } },
  raid_sea: { pow: 8, armor: '선녀의옷', shield: '거문고',
    weapon: { warrior: '현무의검', rogue: '탁조', mage: '얼음칼', poet: '현무의검', archer: '월빙마궁', lancer: '아광창', monk: '금홍권갑', magus: '아광단봉', celestial: '이매포', dokkaebi: '인화퇴', reaper: '혼령명도' } },
  raid_fire: { pow: 9, armor: '불의갑주', shield: '일광방패',
    weapon: { warrior: '주작의검', rogue: '횃불', mage: '흑단화염장', poet: '건곤권', archer: '흑일멸화궁', lancer: '금홍비창', monk: '바람홍옥권갑', magus: '금단봉', celestial: '진아광포', dokkaebi: '진아광퇴', reaper: '아광백도' } },
  raid_wukong: { pow: 10, armor: '장삼', shield: '연등',
    weapon: { warrior: '삼첨도', rogue: '진아광검', mage: '백운장', poet: '하늘개비', archer: '명봉재수의궁', lancer: '경원비창', monk: '새나조갑', magus: '경원비단봉', celestial: '경원비포', dokkaebi: '경원퇴', reaper: '경원비명도' } },
  raid_musin: { pow: 11, armor: '남자기모노', shield: '월광방패',
    weapon: { warrior: '일월대도', rogue: '비늘단도', mage: '해룡의지팡이', poet: '흑단부채', archer: '심안강궁', lancer: '바람제일식창', monk: '진새나조갑', magus: '금강비단봉', celestial: '금강비포', dokkaebi: '금강퇴', reaper: '금강비명도' } },
  raid_brit: { pow: 12, armor: '황혼의갑주', shield: '천성대방패',
    weapon: { warrior: '현무의검', rogue: '저주의단검', mage: '심판의낫', poet: '자월초롱', archer: '나라강궁', lancer: '바람홍옥창', monk: '제화금홍권갑', magus: '바람제일식단봉', celestial: '바람제일식포', dokkaebi: '바람제일식퇴', reaper: '금홍비명도' } },
  raid_gwoe: { pow: 11, armor: '황혼의갑주', shield: '주술방패',
    weapon: { warrior: '참마도', rogue: '저주의단검', mage: '원혼의낫', poet: '자월초롱', archer: '목인석심의궁', lancer: '흑곡창', monk: '진비조권갑', magus: '독귀단봉', celestial: '망량포', dokkaebi: '청염퇴', reaper: '영명도' } },
  raid_varuna: { pow: 12, armor: '용왕의용포', shield: '거문고',
    weapon: { warrior: '청룡의검', rogue: '도룡보도', mage: '해룡의지팡이', poet: '하늘개비', archer: '천부연궁', lancer: '금강비창', monk: '권제철갑', magus: '금홍비단봉', celestial: '금홍비포', dokkaebi: '금홍퇴', reaper: '바람홍옥명도' } },
  raid_agni: { pow: 13, armor: '불의갑주', shield: '일광방패',
    weapon: { warrior: '주작의검', rogue: '진아광검', mage: '흑단화염장', poet: '자월초롱', archer: '흑일멸화궁', lancer: '극독지옥창', monk: '적풍권갑', magus: '바람홍옥단봉', celestial: '바람홍옥포', dokkaebi: '바람홍옥퇴', reaper: '혼령영명도' } },
  raid_airavata: { pow: 14, armor: '선녀의옷', shield: '천성대방패',
    weapon: { warrior: '백호의검', rogue: '저주의단검', mage: '심판의낫', poet: '백운장', archer: "극'흑일신궁", lancer: '천부연극', monk: '백운권갑', magus: '독각귀단봉', celestial: '이매망량포', dokkaebi: '극염인화퇴', reaper: '귀면진산명도' } },
  // The raids under the 끝없는 지옥 and over everything (LATE_RAIDS: placed after the crafted looks).
  // Their sets are not what they are for (회한옥'심, 선계의 기운): a little over 아이라바타's, under the
  // 사신수 and the 용무기 제팔.
  raid_hell: { pow: 14, armor: '황혼의갑주', shield: '주술방패',
    weapon: { warrior: '참마도', rogue: '저주의단검', mage: '원혼의낫', poet: '자월초롱', archer: '대붕지옥궁', lancer: '극독지옥창', monk: '적풍권갑', magus: '독각귀단봉', celestial: '이매망량포', dokkaebi: '극염인화퇴', reaper: '귀면진산명도' } },
  raid_heaven: { pow: 14.5, armor: '선녀의옷', shield: '천성대방패',
    weapon: { warrior: '청룡의검', rogue: '진아광검', mage: '해룡의지팡이', poet: '백운장', archer: "극'흑일신궁", lancer: '천부연극', monk: '백운권갑', magus: '금홍비단봉', celestial: '금홍비포', dokkaebi: '금홍퇴', reaper: '바람홍옥명도' } },
};
// Raids added after the crafted looks were laid in the lines: their pieces are placed by
// settleLateRaids (items.js, last of all), each at the end of its line, so no saved place moves.
const LATE_RAIDS = new Set(['raid_hell', 'raid_heaven']);
const EARLY_RAIDS = Object.keys(RAID_GEAR).filter(id => !LATE_RAIDS.has(id));

// 용무기: made only by the smith's 조합, never dropped (see items.js for the recipe).
export const CRAFT_GEAR = { warrior: '용마제일검', rogue: '용천제일검', mage: '용랑제일봉', poet: '용겸제일봉', archer: '용섬제일궁', lancer: '용무제일창', monk: '용비제일권갑', magus: '용화제일단봉', celestial: '용주제일도', dokkaebi: '용린제일퇴', reaper: '용라제일명도' };
export const CRAFT_POWER = 10;
for (const [cls, name] of Object.entries(CRAFT_GEAR)) if (!GEAR[cls].weapon.includes(name)) GEAR[cls].weapon.push(name);

/** Whether a class carries a shield: 연's 궁사, 무사, 격투가, 마도사, 천인, 도깨비 and 차사 do not. */
// (Read from the lines as written, before raids and crafts add pieces to them.)
const SHIELDED = Object.fromEntries(Object.keys(GEAR).map(c => [c, GEAR[c].shield.length > 0]));
export const hasShield = cls => !!SHIELDED[cls];

/** A raid's pieces for a class: [kind, name] (its shield only for a class that carries one). */
export function raidSet(id, cls) {
  const r = RAID_GEAR[id];
  return [['weapon', r.weapon[cls]], ['armor', r.armor], ['shield', r.shield]].filter(([k]) => k !== 'shield' || SHIELDED[cls]);
}

// The lines as written (before the 용무기, raids and crafts add pieces): what the hunting grounds
// hand out. The first five of a written line are always the grounds' own, even where a raid's set
// later reused the name (the 도적·주술사·도사's first weapons are 태염무신's, the 도사's 백운장
// 아이라바타's ...): by name alone those counted as the raid's piece, so a new 주술사 started with a
// power-11 weapon, and the grounds dropped only one or two weapon tiers for those classes.
const WRITTEN = Object.fromEntries(Object.entries(GEAR).map(([c, g]) => [c, Object.fromEntries(
  ['armor', 'weapon', 'shield', 'helmet', 'cape'].map(k => [k, (g[k] || []).slice()]))]));
const PLAIN_ZONE = 5;

// Every raid piece has a place in each class's line, after the hunting grounds' own.
for (const id of EARLY_RAIDS)
  for (const cls of Object.keys(GEAR))
    for (const [kind, name] of raidSet(id, cls)) if (!GEAR[cls][kind].includes(name)) GEAR[cls][kind].push(name);

// Each raid's own piece: RAID_TIER[raid][cls][kind] = its place in the line, OWNER[cls][kind][place]
// = the raid. A raid piece whose name is a grounds' piece (the first five) or another raid's
// piece (브리트라's 현무의검 is 해왕's) gets a place of its own at the end of the line (same look),
// so it counts as its own raid's power: before, 아이라바타 (14) gave a 전사 a 백호의검 worth 4.
// Those places are added by settleRaidPieces (items.js, after the crafted looks), so no place a
// save already holds moves.
const RAID_TIER = {}, OWNER = {}, PENDING = [];
for (const id of EARLY_RAIDS)
  for (const cls of Object.keys(GEAR))
    for (const [kind, name] of raidSet(id, cls)) {
      const i = GEAR[cls][kind].indexOf(name), own = (OWNER[cls] = OWNER[cls] || {})[kind] = OWNER[cls][kind] || {};
      const plain = i < PLAIN_ZONE && WRITTEN[cls][kind][i] === name;
      if (!plain && !own[i]) {
        own[i] = id;
        ((RAID_TIER[id] = RAID_TIER[id] || {})[cls] = RAID_TIER[id][cls] || {})[kind] = i;
      } else PENDING.push([id, cls, kind, name, plain ? i : -1]);
    }
// Old saves: a grounds' piece (past the first, which every class starts with) that counted as a
// raid's is the raid's piece moved to its own place: {cls: {kind: {old place: new place}}}.
export const MOVED_TIERS = {};
export function settleRaidPieces() {
  for (const [id, cls, kind, name, was] of PENDING.splice(0)) {
    const line = GEAR[cls][kind];
    line.push(name);
    const i = line.length - 1;
    OWNER[cls][kind][i] = id;
    ((RAID_TIER[id] = RAID_TIER[id] || {})[cls] = RAID_TIER[id][cls] || {})[kind] = i;
    const m = (MOVED_TIERS[cls] = MOVED_TIERS[cls] || {})[kind] = MOVED_TIERS[cls][kind] || {};
    if (was > 0 && m[was] === undefined) m[was] = i; // the first raid (in this order) to name it, as gearPower counted it
  }
}
/** The late raids' pieces (LATE_RAIDS): each a place of its own at the end of its line, wearing the
 *  look of the first place of its name (lookAt). Called once, after every crafted look is laid. */
export function settleLateRaids() {
  for (const id of LATE_RAIDS)
    for (const cls of Object.keys(GEAR))
      for (const [kind, name] of raidSet(id, cls)) {
        const line = GEAR[cls][kind];
        line.push(name);
        const i = line.length - 1;
        ((OWNER[cls] = OWNER[cls] || {})[kind] = OWNER[cls][kind] || {})[i] = id;
        ((RAID_TIER[id] = RAID_TIER[id] || {})[cls] = RAID_TIER[id][cls] || {})[kind] = i;
      }
}
/** A raid's own piece of a kind for a class: its place in the line (-1: none, a class with no shield). */
export function raidTier(id, cls, kind) {
  const t = ((RAID_TIER[id] || {})[cls] || {})[kind];
  return t === undefined ? -1 : t;
}
/** The first place in a line with the same look as this one: a raid's own place (settleRaidPieces)
 *  wears the look of the place its name was first given, for the maps the build keys by place. */
export function lookAt(cls, kind, t) {
  const l = GEAR[cls][kind];
  return t >= 0 && t < l.length ? l.indexOf(l[t]) : t;
}
/** The raid a place in a line belongs to, or undefined. */
export function raidOwner(cls, kind, tier) {
  return ((OWNER[cls] || {})[kind] || {})[tier];
}

/** The tier a worn piece counts as: its place in the line, or its raid set's power. */
export function gearPower(cls, kind, tier) {
  const name = GEAR[cls][kind][tier];
  if (kind === 'weapon' && name === CRAFT_GEAR[cls]) return CRAFT_POWER;
  const id = raidOwner(cls, kind, tier);
  return id ? RAID_GEAR[id].pow : tier;
}

// Looks added to a class's line only for crafted pieces: never dropped as they are.
export const EXTRA_LOOKS = new Set();

/** The place of a look in a class's line, adding it (as a crafted-only look) when missing. */
export function lookTier(cls, kind, name) {
  let i = GEAR[cls][kind].indexOf(name);
  if (i < 0) {
    GEAR[cls][kind].push(name);
    EXTRA_LOOKS.add(name);
    i = GEAR[cls][kind].length - 1;
  }
  return i;
}

/** The places in a line that the hunting grounds hand out, weakest first: the line as written,
 *  less its raid pieces and the 용무기. (By name, a crafted look added to another class's line
 *  used to take a grounds' piece of the same name out: the 주술사 dropped no shield at all.) */
export function plainList(cls, kind) {
  return (WRITTEN[cls] ? WRITTEN[cls][kind] : []).map((n, i) => (raidOwner(cls, kind, i) || (kind === 'weapon' && n === CRAFT_GEAR[cls]) ? -1 : i))
    .filter(i => i >= 0);
}

/** How many tiers of a kind the hunting grounds hand out: no raid or crafted-only piece. */
export function plainTiers(cls, kind) {
  return plainList(cls, kind).length;
}

let M;

export function initAvatars(manifest) {
  M = manifest.avatar;
}

/** Whether the build has the old wardrobe's icons. */
export function hasAvatars() {
  return !!M;
}

function index(kind, name) {
  return M[kind] ? M[kind].findIndex(x => x.name === name) : -1;
}

/** The name of a class's gear at a tier, or null when it has none there. */
export function gearName(cls, kind, tier) {
  const list = GEAR[cls][kind];
  return tier >= 0 && tier < list.length ? list[tier] : null;
}

/** The old wardrobe's icon of a piece (its path), or null. */
export function gearIcon(cls, kind, tier) {
  const n = gearName(cls, kind, tier);
  const i = n ? index(kind, n) : -1;
  return i >= 0 && M[kind][i].icon !== false ? `assets/avatar/${kind}/${i}_icon.png` : null;
}
