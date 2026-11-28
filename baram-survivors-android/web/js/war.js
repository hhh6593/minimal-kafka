// 사신수 문파대항전: two guilds of twenty, a war for each 사신수 (청룡전 거점 점령, 백호전 대장전,
// 주작전 호위, 현무전 수성/공성), fought on 바람의나라 연's own 사신수 공성전 castles and the 길림 field.
//
// The hunt runs as it always does — the hero, its skills, cards, 필살기, 격 and statuses — and this
// file adds the war around it (game.js calls in where marked "대항전"):
//   - the enemy guild's fighters stand in G.enemies, so every spell of the hero strikes them as it
//     would a monster; the hero's guild stands in G.party. Both are this file's fighters: each a
//     real player's figure of its class (drawYhero2) in its own random gear, with its class's spells.
//   - every AI fighter thinks about eight times a second (staggered across frames): its role
//     (탱커 front line, taunts and peels; 힐러 keeps the lowest ally up and backs off when dived;
//     딜러 focuses its squad leader's target and kites; 서포터 buffs, curses, captures and carries),
//     falls back when low, and follows its squad's order; each guild's commander gives the four
//     squads their orders from the score and the field, not from the player.
//   - contribution is counted for everyone (damage, healing, damage taken, objectives, kills,
//     assists, revives), weighed by role, and paid out as the war's 사신수 성물 and gold.
//   - 전장 보정: the field is matched to the hero (a fighter's life and blows are in units of the
//     hero's own blow, gear counting at its square root), and the start level is floored.
//   - 레이드 (공대): a raid is fought on the same fighters — the hero and twenty-four raiders against
//     the raid's boss and servants, which stay game.js's monsters (see the 레이드 section).

import { frameBox, drawLayers, dyeImage, dropCostume, aiCostume, loadCostumes } from './costume.js';
import { gwoeWeek, isMend, MEND_FX, RAID_TASKS, RAID_TASK_DEF, WAR_COMMANDS, WAR_COMMAND_EVERY, WAR_COMMAND_PICK } from './data.js';
import { SPECIAL, specialBase, specialName, DRAGON_LOOK, ABYSS_BASE, STAR_MAX } from './items.js';
import { GEAR as GEAR_LINES, RAID_GEAR, raidTier, hasShield, gearName } from './avatar.js';
import { LEAGUE_TIERS, TIER_REWARD, leagueOf, leagueTier, leagueApply, seasonOf, seasonDaysLeft, warRule, GUILD_SKILLS, GUILD_MAX, GUILD_COST, guildOf, guildCan, guildBuy, guildReset, guildEarn, guildK, leagueGoals, leagueGoalDef, leagueGoalBump, leagueGoalsReady, leagueGoalClaim, leagueGoalReward } from './league.js';

let A = null; // game.js internals (initWar)
const TILE = 48;
const k2 = (x, y) => x + ',' + y;
const DIR4 = [[0, 1], [-1, 0], [1, 0], [0, -1]];
// Twenty-five a side: five squads of five (the squads are only how the AI is organised; the
// commanders send most of them to the same place, so the guild fights as one crowd).
const SQUADS = 5;
// 대규모 전투 (the menu's switch, settings.bigBattle): seven squads a side in a war (35, against 25)
// and seven parties in a raid (35) unless turned off (false); with 'all' also four squads a guild in
// a 「쟁」 (16, against 12). Measured at a quarter of a desktop's speed (4x CPU throttle), a war and a
// raid of 35 keep nine frames in ten at 16.7 ms even where the crowd is thickest; a 「쟁」 of 48 and a
// boss did not (p90 33 ms in three runs of four), so it stays at 12 unless asked for.
// crowdK: how much more the crowd strikes (the boss's life and the PK points are matched to it).
const BIG = { war: 7, raid: 7, jaeng: 4 }, SMALL = { war: SQUADS, raid: SQUADS, jaeng: 3 };
const bigOn = mode => { const b = A.settings().bigBattle; return mode === 'jaeng' ? b === 'all' : b !== false; };
const squadsOf = mode => (bigOn(mode) ? BIG : SMALL)[mode];
// 전장 보정 on the enemy guild (W.foeK), by the hero's 전투력 against the field's middle (FIELD_CP, the mean of the
// guilds' makes, SIDE_MAKES): FOE_HERO of strength for each field's worth over it, within FOE_MIN … FOE_MAX.
// (It was by 승급: +2.4% a 승급 to 5차, the same 1.12 for a hero of 1.7만 as for one of 7.5만 — the first lost
// two wars in three, the second won 9 of 10 청룡전 and its guild took 5 of 6 in every mode: balance runs.)
// By mode (FOE_MODE, on the part over 1): where the war is won on the ground — a 거점 held, the cart's ring — a hero
// that seldom falls counts for most; in the 대장전's race of kills it is one blade among seventy, and a few percent
// decide it (a hero of 7.5만: 청룡전 won 6 of 6 at 1.29 and 1 of 6 at 1.39; 대장전 6 of 6 at 1, 0 of 6 at 1.15: balance runs).
// (FOE_MAX 1.32 → 1.16, 2026-11-28: a strong hero now falls in a war — heroHurtK, heroHealK, the shorter blink — and won
// 2 of 12 at 7.7만 with the old ceiling, 2 of 12 at 1.2 and 12 of 16 at 1.12 with the floor below at 0.9; its own deaths are now the price of its strength, balance runs.)
const FIELD_CP = 34500, FOE_HERO = 0.25, FOE_MIN = 1.06, FOE_MAX = 1.16;
// (escort 1.35 → 1.2, 2026-11-28: the strong hero now falls — heroHurtK, heroHealK, the shorter blink — and the cart is
// lost while it lies: 0 of 3 주작전 at 7.7만, balance runs.)
const FOE_MODE = { capture: 1.1, escort: 1.2, commander: 0.25, siege: 1, bosspk: 1 };
const foeKOf = (cp, mode) => 1 + (clamp(1 + FOE_HERO * (cp / FIELD_CP - 1), FOE_MIN, FOE_MAX) - 1) * (FOE_MODE[mode] ?? 1);
const ROLES = {
  tank: { name: '탱커', desc: '앞줄에서 적을 붙잡고 도발한다. 받은 피해와 막아 낸 공격이 기여도가 된다.', bonus: '체력 +35% · 받는 피해 -20% · 6초마다 주변 적 도발' },
  healer: { name: '힐러', desc: '가장 위태로운 아군을 살린다. 회복량과 부활이 기여도가 된다.', bonus: '회복 +60% · 4초마다 주변 아군 기원 · 쓰러진 아군 위에 서면 부활' },
  dps: { name: '딜러', desc: '분대장이 찍은 적을 함께 친다. 피해와 처치가 기여도가 된다.', bonus: '주는 피해 +15% · 처치 경험치 +50%' },
  support: { name: '서포터', desc: '거점·보급·정찰을 맡고 아군을 보호, 적을 저주한다. 목표 기여가 기여도가 된다.', bonus: '점령 속도 ×2 · 보급 운반 감속 없음 · 8초마다 보호/저주' },
};
// Which 격 suit a role (gyeok.js GYEOK): tank — struck-procs, wards, drain, holds; healer — the
// 격 that heal or strengthen the party; dps — the heavy blows; support — the statuses that spread.
function gyeokRoles(g) {
  const r = new Set();
  if (!g) return r;
  if (g.on === 'hurt' || g.drain || (g.self && g.self[0] === 'ward')) r.add('tank');
  if (g.heal || g.party) r.add('healer');
  if ((g.dmg >= 3 && !g.st) || (g.self && (g.self[0] === 'power' || g.self[0] === 'pierce')) || g.targets) r.add('dps');
  if (g.st && ['curse', 'despair', 'para', 'stun', 'freeze', 'slow', 'mark', 'poison', 'venom', 'burn'].includes(g.st[0])) r.add('support');
  if (g.st && (g.st[0] === 'stun' || g.st[0] === 'para') && g.on === 'hurt') r.add('tank');
  return r;
}
const REC_GYEOK = {
  tank: ['hyeoncheorong', 'heupyeol', 'ban_stun', 'gijeol'],
  healer: ['maryeongcham', 'jujakbisang', 'cheongsinsok'],
  dps: ['baekmaeng', 'nakroe', 'jiok', 'cheonja', 'yeomryeong'],
  support: ['jeoju', 'jeolmang', 'cheongrin', 'jujakbul', 'mabi', 'honma'],
};

// The four wars. Points are on the battlefield's 48-pixel tiles (tools/yeon_war.py crops).
export const WARS = {
  cheong: {
    id: 'cheong', name: '청룡전', mode: 'capture', title: '거점 점령', mat: 'sinsu_cheong', sinsu: '청룡', art: 'ui_sinsu_castlebattle_04', pic: 'ui_img_sinsu_4',
    desc: '길림 들판의 세 거점(청·중·적)을 차지해 버틴다. 거점 하나당 초마다 1점, 먼저 450점이거나 시간이 끝날 때 많은 쪽이 이긴다.',
    time: 300, target: 450, spawns: [[16, 62], [64, 6]], cmds: [[10, 66], [70, 2]],
    flags: [[24, 44], [40, 34], [56, 24]], crates: [[40, 50], [40, 18], [30, 28], [50, 40]], scouts: [[26, 18], [54, 50]],
  },
  baekho: {
    id: 'baekho', name: '백호전', mode: 'commander', title: '대장전', mat: 'sinsu_baekho', sinsu: '백호', art: 'ui_sinsu_castlebattle_02', pic: 'ui_img_sinsu_1',
    desc: '백호성 안뜰. 적 진영대장을 쓰러뜨리면 그 자리에서 승리. 시간이 끝나면 처치 점수와 대장의 남은 체력으로 가른다.',
    time: 300, spawns: [[4, 22], [69, 22]], cmds: [[9, 14], [64, 14]], mid: [37, 23],
    crates: [[37, 26], [37, 18], [24, 22], [50, 22], [20, 48], [54, 48]], scouts: [[20, 30], [54, 30], [8, 44], [66, 44]],
  },
  jujak: {
    id: 'jujak', name: '주작전', mode: 'escort', title: '호위', mat: 'sinsu_jujak', sinsu: '주작', art: 'ui_sinsu_castlebattle_01', pic: 'ui_img_sinsu_3',
    desc: '주작성 남문에서 본당까지 주작 불씨 수레를 호위한다. 2분씩 공수를 바꿔, 더 멀리 민 문파가 이긴다.',
    time: 240, half: 120, path: [[27, 75], [27, 23]], spawnStart: [27, 76], spawnEnd: [27, 13], cmdStart: [20, 76], cmdEnd: [27, 6],
    crates: [[16, 66], [38, 66], [16, 43], [38, 25], [5, 58], [49, 58]], scouts: [[6, 52], [48, 52]],
  },
  hyeonmu: {
    id: 'hyeonmu', name: '현무전', mode: 'siege', title: '수성 · 공성', mat: 'sinsu_hyeonmu', sinsu: '현무', art: 'ui_sinsu_castlebattle_03', pic: 'ui_img_sinsu_2',
    desc: '현무성 남문. 공성은 5분 안에 성문을 부수고 수성대장을 쓰러뜨려야 하고, 수성은 끝까지 버티면 이긴다.',
    time: 300, gate: { x0: 38, x1: 41, y0: 22, y1: 25 }, inside: [40, 1], outside: [40, 44], cmdIn: [40, 7], cmdOut: [40, 46],
    // 쪽문: the defence's own way out through the castle's wall (rows 24~25), under the inner wall's gaps (x 28~29, 50~51; the field cut wider 2026-11-28: everything 14 tiles east).
    posterns: [[29, 24], [29, 25], [50, 24], [50, 25]],
    cratesOut: [[22, 33], [58, 33], [10, 40], [70, 40]], cratesIn: [[22, 17], [58, 18]], scouts: [[8, 30], [72, 30]],
  },
  // 백호 난투 (엔드게임 2026-11-28): a short war for a short sitting — ten a side (the hero's squad and two more) for three
  // minutes; first to 70 kill points (40 ended it at 1:00~1:50, 60 at 1:25~2:30), or the 진영대장 felled. Its pay and its league
  // points are 0.6 / 0.7 of a war's (league.js leagueGain short).
  // (엔드게임 2차: its own field, tools/yeon_war.py 'nanjeon' — 연's 백호성 정전 마당, 32x36 tiles, the two camps either side of
  // the stone yard, the 신단 on the 백호 statue's dais (up its stairs, a narrow way in) or in the hall's two side rooms; it was
  // fought on the whole 74x52 castle with its camps drawn in.)
  nanjeon: {
    id: 'nanjeon', name: '백호 난투', mode: 'commander', title: '3분 난투', mat: 'sinsu_baekho', sinsu: '백호', art: 'ui_sinsu_castlebattle_02', pic: 'ui_img_sinsu_1', short: true,
    desc: '백호성 정전 마당에서 10 대 10으로 3분. 처치 점수 70점을 먼저 따거나 적 진영대장을 쓰러뜨리면 승리. 백호 석상의 단 위와 양쪽 곁방의 신단을 두고 다툰다.',
    time: 180, squads: 2, kills: 70, spawns: [[4, 25], [26, 25]], cmds: [[3, 29], [27, 29]], mid: [15, 24],
    crates: [[15, 19], [15, 30]], scouts: [],
  },
};
const GUILDS = [['청운', '#7cf08a'], ['흑월', '#ff7a6a']];
const NAMES = ['바람', '달빛', '청운', '흑풍', '은월', '화랑', '검성', '설화', '무영', '천둥', '소나기', '별빛', '유성', '태양', '한울', '가람',
  '누리', '도담', '라온', '미르', '새벽', '아라', '온새', '하늘', '해솔', '초롱', '다온', '구름', '이슬', '바다', '청풍', '백야',
  '흑룡', '적토', '청솔', '단비', '보라', '나래', '여울', '하람', '서리', '모래', '돌개', '불꽃', '매화', '노을'];
// 바람의나라 같은 이름: 순우리말 이름이거나 한 글자씩 짝지은 무협 이름(청룡·흑풍·설검 …); 기호 없이.
const NAME_PRE = ['청', '흑', '백', '적', '은', '금', '설', '월', '풍', '화', '뇌', '현', '비', '천', '무', '혈', '야', '광', '운', '진'];
const NAME_SUF = ['룡', '호', '풍', '월', '검', '랑', '령', '운', '영', '혼', '객', '협', '선', '도', '랑', '봉', '성', '휘'];
const TAGS = ['', '', '', '', '', '', '이', '아', '2', '7'];
const baseName = () => Math.random() < 0.55 ? pick(NAMES) + pick(TAGS) : pick(NAME_PRE) + pick(NAME_SUF) + (Math.random() < 0.25 ? pick(['', '이', '아']) : '');

// What each class does on the field: its plain blow, its spread spell, its great one; ranged or not.
// Classes another session adds fall back to their own spells by kind (kitFor).
const KITS = {
  warrior: { range: 1, basic: [null, 1.0, 1.1], aoe: ['w_tiger', 1.7, 6], ult: ['w_roar', 4.2, 17], buff: 'w_buff' },
  rogue: { range: 1, basic: ['r_blink', 1.05, 1.0], aoe: ['r_dance', 1.5, 6], ult: ['r_ult', 4.5, 18], stealth: 'r_stealth' },
  mage: { range: 5, basic: ['m_fire', 1.0, 1.25], aoe: ['m_para', 0.8, 8], ult: ['m_ult', 4.0, 18], curse: 'm_curse' },
  poet: { range: 5, basic: ['p_orb', 0.55, 1.4], aoe: ['m_curse', 0.4, 8], ult: ['p_ult', 0, 22], heal: 'c_heal', group: 'p_sky' },
  archer: { range: 5, basic: ['a_shot', 1.0, 1.0], aoe: ['a_bomb', 1.5, 6.5], ult: ['a_aim', 4.0, 14] },
};

let SK = null; // SKILLS
/** The 전사's class (a commander, classless, sweeps with its 백호참). */
const WARRIOR = () => A.CLASSES.find(c => c.id === 'warrior');
const CLOSE_KIT = new Set(['lancer', 'monk', 'dokkaebi', 'reaper', 'celestial']);
// The classes whose blows are their weapon's (blade, spear, fist, bow): the attack clip, not the cast.
const STRIKERS = new Set(['warrior', 'rogue', 'lancer', 'monk', 'dokkaebi', 'reaper', 'archer']);
/** The pose of a fighter's blow: its weapon's swing, a caster's cast (the 천인's plain blow a strike, its spells cast). */
const blowPose = (b, spell) => (STRIKERS.has(b.cls.id) || (!spell && b.cls.id === 'celestial') ? 'attack' : 'cast');
/** A war 궁사's flying arrow: 연's own, else the old site's (53, 활쏘기). */
const ARROW = () => (A.M().fx.k_a_shot ? 'k_a_shot' : '53');
function kitFor(cls) {
  if (KITS[cls.id]) return KITS[cls.id];
  const mine = Object.entries(SK).filter(([, d]) => d.cls === cls.id && d.fx);
  // Its blows: damage spells only (a 기원 is never a blow, whatever numbers it carries).
  const hit = mine.filter(([, d]) => d.dmg && !isMend(d) && d.kind !== 'ult').sort((a, b) => (a[1].req || 1) - (b[1].req || 1));
  const heal = mine.find(([, d]) => d.kind === 'heal');
  // A close-in class fights close whatever reach its later spells have (each has one of four
  // tiles or more: the 무사, 격투가, 도깨비 and 차사 stood off and threw their blows as a caster's
  // shots, in the casting pose). The 천인 too, its spells thrown from among the blades (hybrid).
  const ranged = !CLOSE_KIT.has(cls.id) && hit.some(([, d]) => (d.range || 0) >= 4);
  return {
    range: ranged ? 5 : 1, basic: [hit[0] ? hit[0][0] : null, 1.0, 1.1], aoe: [hit[1] ? hit[1][0] : null, 1.6, 6.5],
    ult: [cls.ult && SK[cls.ult] ? cls.ult : null, 4.0, 18], heal: heal ? heal[0] : null,
  };
}
function rolesFor(cls) {
  const r = ['dps'];
  if (cls.id === 'warrior' || cls.hp >= 160 || cls.armor >= 3) r.push('tank');
  // The blades (STRIKERS) are dealers and tanks: every class has some 기원 of its own, and the 무사,
  // 격투가, 도깨비 and 차사 were drawn as healers and supporters, casting all fight long.
  const blade = STRIKERS.has(cls.id) && cls.id !== 'archer';
  if (cls.id === 'poet' || (!blade && (KITS[cls.id] ? KITS[cls.id].heal : kitFor(cls).heal))) r.push('healer');
  if (cls.id === 'mage' || cls.id === 'poet' || cls.id === 'archer' || (!KITS[cls.id] && !blade)) r.push('support');
  return r;
}

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const d2 = (a, b) => Math.hypot(a.tx - b.tx, a.ty - b.ty);

// ------------------------------------------------ sides
// A war has two guilds (0 is the hero's) and a raid one side against the boss's monsters; 「쟁」 has
// three guilds and a boss whose servants strike them all. These ask the war, so the two-side modes
// run exactly as they did (the same lists, in the same order).
const TWO = [0, 1];
/** The war's guilds, by number. */
function teamsOf(W) { return W.teamIds || TWO; }
/** The fighters a team fights (the living of every other guild; a war's gate among them): the other
 * side's list itself in a war of two, the frame's own list in 「쟁」 (made in update). The boss's
 * monsters are apart (W.mobs), looked at by the look-arounds that may strike them. */
function foesOf(W, team) { return W.foes ? W.foes[team] : W.alive[1 - team]; }
/** The hunt's list a body of the team stands in: the hero's guild with the hero (G.party), every
 * other in G.enemies (the hero's spells strike them). */
function listOf(team) { const G = A.G(); return team === 0 ? G.party : G.enemies; }
/** A guild's colours (bars, names, the feed): ours green, the first foe red, 「쟁」's third violet. */
const TEAM_COL = { bar: ['#3ad04a', '#e8402a', '#b05aff'], name: ['#9ff08a', '#ff9a8a', '#d8a8ff'], lead: ['#d8ff7a', '#ffb07a', '#e8c8ff'] };
function teamCol(kind, team) { return TEAM_COL[kind][team === 0 ? 0 : team === 2 ? 2 : 1]; }
/** 「쟁」, each frame: every guild's foes (the living of the other two) and the boss's living monsters. */
function jaengLists(W) {
  const G = A.G(), ids = W.teamIds;
  // (Each guild's foes in turn after it — 1, 2 for 0; 2, 0 for 1; 0, 1 for 2: a look-around's ties
  // fall on each guild alike, not on the first.)
  W.foes = ids.map(t => { const out = []; for (let k = 1; k < ids.length; k++) for (const b of W.alive[ids[(t + k) % ids.length]]) out.push(b); return out; });
  W.mobs = G.enemies.filter(e => !e.war && e.hp > 0);
  W.boss = W.mobs.find(e => e.kind === 'boss') || null;
}

export function initWar(api) {
  A = api;
  SK = api.SKILLS;
  injectUi();
  window.__war = (id, cls, role, opts = {}) => startWar(id, typeof cls === 'number' ? A.CLASSES[cls] : cls, role, opts);
  window.__warState = () => warState();
  // Test: what each fighter cast (casts a minute) and every fighter's persona and spec.
  window.__tallies = () => { const W = A.G() && A.G().war; return W ? W.bodies.filter(b => b.cls).map(b => ({ team: b.team, role: b.role, cls: b.cls.id, tier: b.tier, play: b.play, alive: b.aliveT || 0, t: b.tally || {} })).concat([{ W: W.t, fx: A.G().fxs.length }]) : null; };
  window.__aiPersonas = () => aiPersonas();
  // Test (screenshots): fighters of each 급 of our side in a row just below the hero.
  window.__aiLineup = (tiers = ['server', 'server', 'high', 'mid', 'low', 'newbie']) => {
    const G = A.G(), W = G && G.war;
    if (!W) return null;
    const used = new Set(), out = [];
    tiers.forEach((t, i) => {
      const b = W.bodies.find(x => x.cls && x.team === 0 && x.tier === t && !used.has(x) && !x.dead) || W.bodies.find(x => x.cls && x.team === 0 && x.tier === t && !x.dead);
      if (!b || used.has(b)) return;
      used.add(b);
      placeBody(W, b, [G.player.tx + 2 * (i - Math.floor(tiers.length / 2)), G.player.ty + 2]);
      b.dest = null; b.fdx = 0; b.fdy = 1;
      out.push(`${b.name} ${AI_TIERS[t].name} ${b.cls.name} ${b.gearDesc}`);
    });
    return out;
  };
  window.__warBoard = () => openBoard();
  // 「쟁」: window.__jaeng(classIndex | class, role, { map, raid, week, idle, practice })
  window.__jaeng = (cls, role, opts = {}) => startJaeng(typeof cls === 'number' ? A.CLASSES[cls] : cls, role, opts);
  window.__jaengCmd = kind => heroCommand(kind);
  window.__warCmd = kind => warCommand(kind);
  window.__warPlace = (b, x, y) => { A.leave(b); A.place(b, x, y); moved(b, 'place'); }; // test: a body set down on a tile
  window.__warTac = kind => warTactic(kind);
  window.__warTacState = () => tacState();
  // Test: how many composited fighter frames are kept, and how many were made (cache churn).
  window.__warFrames = () => {
    const box = {};
    for (const [k, e] of frames) {
      const m = k.match(/^[a-z]+/);
      if (!m) continue;
      const c = m[0], b = box[c] = box[c] || [1e9, 1e9, -1, -1, 0, 0];
      b[0] = Math.min(b[0], e.ox); b[1] = Math.min(b[1], e.oy); b[2] = Math.max(b[2], e.ox + e.w); b[3] = Math.max(b[3], e.oy + e.h);
      b[4] += e.w * e.h; b[5]++;
    }
    for (const c in box) box[c][4] = Math.round(box[c][4] / box[c][5]);
    return { kept: frames.size, made: framesMade, looks: new Set([...frames.keys()].map(k => k.split('|')[0])).size, warmLeft: warming.size, box };
  };
  // Test: the hero's next step toward a tile along the field's paths (for a bot's input).
  window.__warStep = (x, y) => {
    const G = A.G(), W = G && G.war, p = G && G.player;
    if (!W) return [0, 0];
    const f = flowTo(W, x, y, 0), c = W.map.cols, here = f[p.ty * c + p.tx];
    let best = null, bv = here < 0 ? 1e9 : here;
    for (const [dx, dy] of DIR4) {
      const nx = p.tx + dx, ny = p.ty + dy;
      if (nx < 0 || ny < 0 || nx >= c || ny >= W.map.rows) continue;
      const v = f[ny * c + nx];
      if (v >= 0 && v < bv) { bv = v; best = [dx, dy]; }
    }
    return best || [0, 0];
  };
  War.release = releaseWar;
  window.__memBoard = () => toggleBoard(); // test (memory): the war's 현황 (문파원 목록, their portraits)
  window.__warMem = () => ({ frames: frames.size, maps: mapBms.size, labels: labels.size, plates: plates.size, portraits: portraits.size, hud: hudPics.size, glow: glowPics.size });
  return War;
}
/** The war is left (game.js enterTown; a hunt started): its field's pieces are closed, and its small
 *  made pictures (names, plates, glows) let go; with `all` (the town, a hunt) the fighters' frames
 *  too (some 3000 cropped pictures: the next war makes its own again in its opening count). */
function releaseWar(all) {
  warmGen++;
  warming.clear();
  warmQueue.length = 0;
  for (const [path, bm] of mapBms) { if (bm && bm.close) bm.close(); mapBms.delete(path); }
  for (const m of [labels, plates, hudPics, glowPics]) { for (const v of m.values()) { const pic = v && (v.pic || v.c || v); if (pic && pic.close) pic.close(); } m.clear(); }
  portraits.clear();
  if (all) {
    for (const e of frames.values()) freePic(e && e.pic);
    frames.clear();
    lookAny.clear();
  }
}

// ---------------------------------------------------------------- the war board (town)

let pickWar = 'cheong', pickRole = 'dps', pickSide = 'atk';
function injectUi() {
  const st = document.createElement('style');
  st.textContent = `
  #war-board, #war-result { background: rgba(8,6,4,0.92); overflow-y: auto; justify-content: flex-start; padding: 10px 12px; }
  #war-board .wb-cards { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }
  #war-board .wb-card { width: 128px; min-height: 140px; border: 2px solid #5a4630; background: #1d140c; color: #efe3c2; cursor: pointer; padding: 6px; font: 12px G11, sans-serif; text-align: center; }
  #war-board .wb-card.on { border-color: #ffd040; background: #2b1e10; }
  #war-board .wb-card img { height: 62px; max-width: 120px; object-fit: contain; display: block; margin: 0 auto 4px; }
  #war-board .wb-card b { display: block; font-size: 14px; color: #ffd27a; }
  #war-board .wb-row { display: flex; gap: 6px; justify-content: center; flex-wrap: wrap; margin: 8px 0 4px; }
  #war-board .wb-role { min-width: 110px; }
  #war-board .wb-actions { align-self: stretch; z-index: 2; position: sticky; bottom: -10px; margin: 6px -12px -10px; padding: 6px 0 8px; background: rgba(8,6,4,0.96); border-top: 1px solid #5a4630; } /* 출전 always on screen */
  #war-board .wb-role.on, #war-board .wb-side.on { border-color: #ffd040; color: #ffd040; }
  #war-board .wb-info { max-width: 820px; margin: 0 auto; color: #e8dcc0; font: 12px G11, sans-serif; line-height: 1.5; }
  #war-board .wb-load { max-width: 820px; margin: 6px auto; border: 1px solid #5a4630; padding: 6px 8px; color: #e8dcc0; font: 12px G11, sans-serif; }
  #war-board .wb-load .fit { color: #8cf08a; } #war-board .wb-load .nofit { color: #aa9a80; }
  #war-board .wb-league { max-width: 820px; margin: 4px auto 6px; border: 1px solid #7a6040; background: rgba(40,28,16,0.6); padding: 5px 8px; color: #e8dcc0; font: 12px G11, sans-serif; line-height: 1.5; }
  .lg-bar { height: 5px; background: #2a2016; margin: 2px 0; } .lg-bar i { display: block; height: 100%; }
  #war-board .wb-guild { max-width: 820px; margin: 0 auto 6px; border: 1px solid #5a4630; padding: 5px 8px; color: #e8dcc0; font: 12px G11, sans-serif; line-height: 1.45; }
  #war-board .wb-guild summary { cursor: pointer; color: #ffd27a; }
  #war-board .gt-rows { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 4px 8px; margin-top: 4px; }
  #war-board .gt-sk { border: 1px solid #4a3a28; padding: 3px 6px; background: rgba(20,14,8,0.5); }
  #war-board .gt-sk b { color: #ffd27a; } #war-board .gt-sk.lock { opacity: 0.55; } #war-board .gt-sk small { display: block; color: #cbbd9e; }
  #war-board .gt-pip { color: #ffd040; letter-spacing: 1px; } #war-board .wb-guild button { font-size: 11px; padding: 1px 8px; margin-left: 4px; }
  #war-board .gt-goal { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; } #war-board .gt-goal .lg-bar { flex: 0 0 80px; } #war-board .gt-goal.done { color: #9ff08a; }
  .lg-plus { color: #9ff08a; } .lg-minus { color: #ff9a8a; } .lg-pend { color: #ffd27a; } .lg-pend button { font-size: 11px; padding: 1px 8px; }
  #war-result .lg-line { max-width: 520px; margin: 3px auto; } #war-result .lg-up { color: #ffd040; }
  #war-result .mo-list span { display: inline-block; margin: 0 5px; } #war-result .mo-hero { color: #ffd040; } #war-result .mo-ours { color: #9ff08a; } #war-result .mo-foe { color: #ff9a8a; }
  #war-board .wb-load button { font-size: 11px; padding: 1px 6px; margin-left: 6px; }
  #war-board h2, #war-result h2 { color: #ffd27a; text-align: center; margin: 4px 0; }
  #war-result .wr-head { display: flex; align-items: center; justify-content: center; gap: 14px; color: #efe3c2; font: 13px G11, sans-serif; }
  #war-result .wr-head img { height: 96px; }
  #war-result .wr-title { margin: 4px auto 0; width: 220px; height: 54px; background: center/100% 100% no-repeat; color: #fff; font: bold 28px G11, serif;
      text-align: center; line-height: 54px; text-shadow: 0 2px 0 #000; }
  #war-result .wr-stage { display: flex; align-items: flex-end; justify-content: center; gap: 18px; min-height: 120px; flex: none; margin: 0 auto;
      background: center 70%/220px 150px no-repeat; }
  #war-result .wr-hero { height: 96px; image-rendering: pixelated; flex: none; }
  #war-result .wr-flag { height: 84px; flex: none; }
  #war-result > * { flex: none; }
  #war-result .wr-sub { text-align: center; color: #efe3c2; font: 12px G11, sans-serif; margin: 2px 0; }
  #war-result .wr-medals { display: flex; justify-content: center; gap: 14px; margin: 4px 0; }
  #war-result .wr-medal { position: relative; width: 74px; height: 86px; text-align: center; color: #fff; font: 11px G11, sans-serif; }
  #war-result .wr-mbg { position: absolute; left: 4px; top: 0; width: 66px; height: 66px; }
  #war-result .wr-mic { position: absolute; left: 25px; top: 20px; width: 24px; height: 24px; image-rendering: pixelated; }
  #war-result .wr-medal b { position: absolute; left: 0; right: 0; top: 50px; text-shadow: 0 1px 0 #000; }
  #war-result .wr-medal span { position: absolute; left: 0; right: 0; top: 66px; color: #8cf08a; font-weight: bold; }
  #war-result .wr-tier { font: bold 18px G11, serif; color: #ffd040; }
  #war-result table, #war-sb table { border-collapse: collapse; margin: 6px auto; font: 11px G9, sans-serif; color: #e8dcc0; }
  #war-result td, #war-result th, #war-sb td, #war-sb th { padding: 1px 6px; border-bottom: 1px solid #3a2c1c; text-align: right; white-space: nowrap; }
  #war-result td:nth-child(2), #war-sb td:nth-child(2) { text-align: left; }
  #war-result tr.me td, #war-sb tr.me td { color: #ffd040; }
  #war-result .t0 td:first-child, #war-sb .t0 td:first-child { color: #7cf08a; } #war-result .t1 td:first-child, #war-sb .t1 td:first-child { color: #ff7a6a; }
  #war-result .t2 td:first-child, #war-sb .t2 td:first-child { color: #c88aff; }
  #war-result .wr-cols { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
  #war-sb { position: fixed; inset: 6% 8%; background: rgba(10,8,6,0.93); border: 2px solid #5a4630; z-index: 40; overflow: auto; padding: 6px; }
  #war-sb .wr-cols { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
  #war-sb .sb-head { display: flex; gap: 6px; align-items: center; position: sticky; top: -6px; background: rgba(10,8,6,0.97); padding: 2px 0 4px; z-index: 1; }
  #war-sb .sb-head b { flex: 1; text-align: center; color: #ffd27a; font: 700 13px G11, sans-serif; }
  #war-sb .sb-head button, #war-sb .sb-teams button, #war-sb .sb-stat button { font: 700 11px G11, monospace; padding: 2px 10px; color: #f4e2c0; background: #2a1606; border: 2px solid #5a4630; }
  #war-sb .sb-head button.on, #war-sb .sb-teams button.on { border-color: #ffd040; color: #ffd040; }
  #war-sb .sb-teams { display: flex; gap: 6px; justify-content: center; margin: 4px 0; }
  #war-sb .sb-cards { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; }
  #war-sb .sb-card { width: 112px; border: 1px solid #5a4630; background: #1d140c; color: #e8dcc0; font: 10px G9, sans-serif; text-align: center; padding: 3px; cursor: pointer; }
  #war-sb .sb-card.me { border-color: #ffd040; }
  #war-sb .sb-card.dead { opacity: 0.5; }
  #war-sb .sb-card img, #war-sb .sb-card i { display: block; height: 60px; margin: 0 auto; image-rendering: pixelated; object-fit: contain; max-width: 100px; }
  #war-sb .sb-card .nm { font: 700 11px G11, sans-serif; color: #efe3c2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  #war-sb .sb-card .hp { height: 3px; background: #000; margin: 2px 4px; } #war-sb .sb-card .hp span { display: block; height: 3px; background: #6ad86a; }
  #war-sb .sb-card .st { color: #ffb070; min-height: 10px; }
  #war-sb .sb-star { margin-left: 3px; text-shadow: 0 0 2px #000; }
  #war-sb .sb-tip { text-align: center; color: #9a8a70; font: 10px G9, sans-serif; margin: 4px; }
  #war-sb .sb-stat { display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; color: #e8dcc0; font: 12px G11, sans-serif; margin-top: 6px; }
  #war-sb .sb-stat .pic { text-align: center; } #war-sb .sb-stat .pic img { height: 150px; image-rendering: pixelated; display: block; margin: 0 auto; }
  #war-sb .sb-stat .pic .nm { font: 700 14px G11, sans-serif; color: #ffd27a; }
  #war-sb .sb-stat .info { max-width: 420px; } #war-sb .sb-stat th { color: #c8b48a; text-align: left; padding-right: 10px; } #war-sb .sb-stat td { text-align: left; }
  #war-sb .sb-stat .kit { margin: 6px 0; } #war-sb .sb-stat .kit b, #war-sb .sb-stat .rec b { color: #c8b48a; margin-right: 6px; }
  #war-sb .sb-stat .sk { display: inline-block; border: 1px solid #5a4630; padding: 1px 5px; margin: 2px; } #war-sb .sb-stat .sk small { color: #9a8a70; margin-left: 3px; }
  #war-sb .sb-stat .rec { margin: 6px 0; font-size: 11px; }
  body.war #map-tab { display: none; }
  #jaeng-share { position: relative; height: 5px; margin-top: 2px; display: flex; background: rgba(0,0,0,0.6); }
  #jaeng-share i { display: block; height: 100%; }
  #jaeng-share span { position: absolute; left: 0; right: 0; top: 5px; text-align: center; font: 9px G9, sans-serif; color: #f4e2c0; text-shadow: 0 1px 0 #000; white-space: nowrap; }
  #war-result .jr-guilds td:first-child { color: #ffd040; }
  #war-sb-btn { font: 700 11px G11, monospace; padding: 2px 6px; color: #f4e2c0; background: #2a1606; border: 2px solid rgb(148,48,219); }
  #war-call-btn { font: 700 11px G11, monospace; padding: 2px 6px; color: #f4e2c0; background: #1a2a10; border: 2px solid rgb(88,168,60); }
  body:not(.war) #war-call-btn { display: none; }
  .jaeng-cmd { font: 700 11px G11, monospace; padding: 2px 5px; color: #f4e2c0; background: #2a1030; border: 2px solid rgb(176,90,255); }
  .jaeng-cmd.cool { opacity: 0.45; }
  #jaeng-cmds { position: fixed; right: calc(env(safe-area-inset-right) + 4px); top: 34%; z-index: 30; display: flex; flex-direction: column; gap: 3px; }
  body:not(.jaeng) #jaeng-cmds { display: none; }
  #war-tac { position: fixed; right: calc(env(safe-area-inset-right) + 4px); top: 44%; z-index: 30; display: flex; flex-direction: column; gap: 3px; }
  body.jaeng #war-tac { top: 34%; right: calc(env(safe-area-inset-right) + 62px); }
  #war-tac[hidden], body:not(.war) #war-tac { display: none; }
  /* (UI 점검 2026-11-28) On a low phone the column stays above 현황·모여 (at 44% of 360px its 후퇴 sat on 모여);
     over the result and the 현황 board the tactics and the 쟁 commands step aside (they stood over the medals). */
  body:not(.jaeng) #war-tac { top: min(44%, calc(100% - 240px)); }
  body.jaeng #war-tac, #jaeng-cmds { top: min(34%, calc(100% - 240px)); }
  body:has(#war-result:not([hidden])) #war-tac, body:has(#war-result:not([hidden])) #jaeng-cmds,
  body:has(#war-result:not([hidden])) #war-cmd { display: none; }
  #war-tac button { font: 700 11px G11, monospace; padding: 2px 5px; color: #f4e2c0; background: #301a0a; border: 2px solid rgb(230,120,60); min-width: 52px; }
  #war-tac button.cool { opacity: 0.45; }
  #war-tac button.on { background: #6a2a10; color: #ffe0a0; }
  #war-cmd { position: fixed; left: 50%; top: 21%; transform: translateX(-50%); z-index: 31; display: flex; flex-direction: column; align-items: center; gap: 3px;
    padding: 4px 6px; background: rgba(20,14,6,0.82); border: 2px solid #c08a10; border-radius: 4px; max-width: 96vw; }
  #war-cmd[hidden], body:not(.war) #war-cmd { display: none; }
  #war-cmd .wc-h { font: 700 11px G11, monospace; color: #ffd27a; }
  #war-cmd .wc-row { display: flex; gap: 4px; flex-wrap: wrap; justify-content: center; }
  #war-cmd button { font: 700 12px G11, monospace; padding: 3px 8px; color: #f4e2c0; background: #2a1606; border: 2px solid rgb(192,138,16); min-width: 64px; }
  #war-cmd button small { display: block; font: 9px G9, sans-serif; color: #e8d8b0; max-width: 120px; white-space: normal; }
  `;
  document.head.append(st);
  const board = document.createElement('div');
  board.id = 'war-board';
  board.className = 'screen';
  board.hidden = true;
  document.body.append(board);
  const res = document.createElement('div');
  res.id = 'war-result';
  res.className = 'screen';
  res.hidden = true;
  document.body.append(res);
  const sb = document.createElement('div');
  sb.id = 'war-sb';
  sb.hidden = true;
  // (Closed by its 닫기 key or a tap on its empty space; the tabs and cards inside keep it open.)
  sb.onclick = e => { if (e.target === sb) sb.hidden = true; };
  document.body.append(sb);
  const keys = document.getElementById('keys');
  if (keys) {
    const b = document.createElement('button');
    b.id = 'war-sb-btn';
    b.hidden = true;
    b.textContent = '현황';
    b.onclick = () => toggleBoard();
    keys.prepend(b);
    // 집결: the hero calls the allies near to follow it (대항전·레이드; shown with the war's keys).
    const c = document.createElement('button');
    c.id = 'war-call-btn';
    c.textContent = '모여';
    c.title = '주변 아군을 불러 따라오게 한다';
    c.onclick = () => heroCall();
    b.after(c);
    // 「쟁」: the hero's command to its squad and the first (20 s, every 10 s), a small column of
    // its own at the right edge (in the keys' grid it fell under the 질주 key).
    const col = document.createElement('div');
    col.id = 'jaeng-cmds';
    document.body.append(col);
    // 전술 (대항전·「쟁」): the hero's own keys — 집중 · 총공격 · 후퇴 (warTactic), each with its seconds.
    const tc = document.createElement('div');
    tc.id = 'war-tac';
    tc.hidden = true;
    document.body.append(tc);
    for (const [kind, def] of Object.entries(TACTICS)) {
      const k = document.createElement('button');
      k.dataset.tac = kind;
      k.textContent = def.name;
      k.title = def.tip;
      k.onclick = e => { e.stopPropagation(); warTactic(kind); };
      tc.append(k);
    }
    // 대항전 지휘 선택: once a minute, four choices for the guild's squads (warCommands).
    const wc = document.createElement('div');
    wc.id = 'war-cmd';
    wc.hidden = true;
    document.body.append(wc);
    for (const [kind, label, tip] of [['boss', '보스', '보스 집중: 내 분대와 1분대가 20초 동안 보스를 친다'], ['pk', '견제', '견제: 보스를 가장 많이 치는 다른 문파의 딜러·힐러를 끊는다'], ['seal', '봉인', '봉인: 우리 것이 아닌 가장 가까운 봉인석을 차지한다']]) {
      const k = document.createElement('button');
      k.className = 'jaeng-cmd';
      k.dataset.cmd = kind;
      k.textContent = label;
      k.title = tip;
      k.onclick = () => heroCommand(kind);
      col.append(k);
    }
  }
}

function img(name) {
  const im = A.images[`hud/${name}.png`];
  return im && im.width ? im : null;
}

export function openBoard() {
  const cls = A.chosenClass();
  if (!cls) return;
  const box = document.getElementById('war-board');
  const roles = rolesFor(cls);
  const pr = A.progress();
  const w = WARS[pickWar] || jaengCard(cls, pr);
  const mats = pr.mats || {};
  const cards = Object.values(WARS).map(x => {
    const pic = img(x.art) ? `assets/hud/${x.art}.png` : '';
    const gate = (A.SINSU_GATE[x.mat] || [])[0], open = !gate || (pr.raids || {})[gate];
    return `<button class="wb-card${x.id === pickWar ? ' on' : ''}" data-war="${x.id}">${pic ? `<img src="${pic}" alt="">` : ''}<b>${x.name}</b>${x.title}<br><small>보상: ${open ? `${A.MATS[x.mat].name} (보유 ${mats[x.mat] || 0})` : `겁화의 파편 (${A.raidName(gate)}을 깨면 ${A.MATS[x.mat].name})`}</small></button>`;
  }).join('') + jaengCardHtml(cls, pr);
  const roleBtns = Object.entries(ROLES).map(([id, r]) => {
    const fit = roles.includes(id);
    return `<button class="btn wb-role${id === pickRole ? ' on' : ''}" data-role="${id}" title="${r.desc}">${r.name}${fit ? '' : ' (비주력)'}</button>`;
  }).join('');
  const side = w.mode === 'siege' ? `<div class="wb-row"><button class="btn wb-side${pickSide === 'atk' ? ' on' : ''}" data-side="atk">공성 (성문을 부순다)</button><button class="btn wb-side${pickSide === 'def' ? ' on' : ''}" data-side="def">수성 (성문을 지킨다)</button></div>` : '';
  box.innerHTML = `<h2>사신수 문파대항전 · 쟁</h2>
    ${leagueBoardHtml(pr)}
    ${guildBoardHtml(pr)}
    <div class="wb-cards">${cards}</div>
    <div class="wb-info"><b>${w.name} · ${w.title}</b> — ${w.desc}<br>
    ${w.jaeng ? w.more : `양 문파 ${w.short ? '10명씩 · 3분 · 보상과 리그 점수는 대항전의 0.6·0.7배' : '25명씩'} · 혼자 입장해도 인원이 채워집니다 · 양 진영 전력은 자동 보정됩니다.`}</div>
    ${side}
    <div class="wb-row">${roleBtns}</div>
    <div class="wb-info"><b>${ROLES[pickRole].name}</b> — ${ROLES[pickRole].desc}<br>역할 보너스: ${ROLES[pickRole].bonus}</div>
    ${loadoutHtml(cls, pickRole)}
    <div class="wb-row wb-actions"><button class="btn" id="wb-back">마을로</button><button class="btn" id="wb-go"${w.locked ? ' disabled' : ''}>${w.jaeng && w.practice ? '연습 출전' : '출전'}</button></div>`;
  box.querySelectorAll('[data-war]').forEach(b => { b.onclick = () => { pickWar = b.dataset.war; openBoard(); }; });
  box.querySelectorAll('[data-role]').forEach(b => { b.onclick = () => { pickRole = b.dataset.role; openBoard(); }; });
  box.querySelectorAll('[data-side]').forEach(b => { b.onclick = () => { pickSide = b.dataset.side; openBoard(); }; });
  box.querySelectorAll('[data-wear]').forEach(b => {
    b.onclick = () => { const [kind, tier, sp] = b.dataset.wear.split('|'); A.wear(kind, +tier, sp || null); openBoard(); };
  });
  document.getElementById('wb-back').onclick = () => A.enterTown(cls);
  const lc = document.getElementById('lg-claim');
  if (lc) lc.onclick = () => { leagueClaim(); openBoard(); };
  box.querySelectorAll('[data-gsk]').forEach(b => { b.onclick = () => { if (guildBuy(pr, b.dataset.gsk)) { A.saveProgress(); A.audio().play('levelup'); } guildOpen = true; openBoard(); }; });
  box.querySelectorAll('[data-lgc]').forEach(b => { b.onclick = () => { const g = leagueGoalClaim(pr, b.dataset.lgc); if (g) { A.saveProgress(); A.audio().play('chest'); A.say(`[리그 주간 목표] ${g.text} — ${leagueGoalReward(g)}`, 'sys'); } guildOpen = true; openBoard(); }; });
  const gr = document.getElementById('gt-undo');
  if (gr) gr.onclick = () => { guildReset(pr); A.saveProgress(); guildOpen = true; openBoard(); };
  const gd = box.querySelector('.wb-guild');
  if (gd) gd.ontoggle = () => { guildOpen = gd.open; };
  document.getElementById('wb-go').onclick = () => (w.jaeng ? !w.locked && startJaeng(cls, pickRole, {}) : startWar(pickWar, cls, pickRole, { side: pickSide }));
  A.showScreen('war-board');
}

/** The 격 worn and in the bag, marked by how they suit the role; a bag piece can be put on here. */
function loadoutHtml(cls, role) {
  const g = A.savedGear(cls);
  const worn = wornGyeoks(cls, g);
  const fitN = worn.filter(x => gyeokRoles(x).has(role)).length;
  const rec = REC_GYEOK[role].filter(id => A.GYEOK[id]).map(id => A.GYEOK[id].name).join(', ');
  const lines = worn.length ? worn.map(x => `<div class="${gyeokRoles(x).has(role) ? 'fit' : 'nofit'}">${gyeokRoles(x).has(role) ? '✓' : '·'} ${A.gyeokText(x.id) || x.name}</div>`).join('')
    : '<div class="nofit">착용한 장비에 격이 없습니다.</div>';
  const bag = [];
  for (const kind of ['weapon', 'armor', 'shield', 'helmet', 'cape']) {
    for (const [tier, sp] of A.bagPieces(cls, kind)) {
      if (!sp) continue;
      const def = A.SPECIAL[sp];
      const gy = def && def.gyeok && A.GYEOK[def.gyeok];
      if (!gy || !gyeokRoles(gy).has(role) || g[kind + 'Sp'] === sp) continue;
      bag.push(`<div class="fit">✓ ${def ? A.specialName(def, cls.id) : sp} — ${gy.name}<button class="btn" data-wear="${kind}|${tier}|${sp}">착용</button></div>`);
    }
  }
  return `<div class="wb-load"><b>장비 격</b> — 역할에 맞는 격 ${fitN}개 (격 하나당 역할 효과 +8%, 최대 +24%)<br>
    <small>추천 격: ${rec}</small>${lines}${bag.length ? '<b>가방에서 교체</b>' + bag.slice(0, 6).join('') : ''}</div>`;
}

function wornGyeoks(cls, g) {
  const out = [];
  for (const k of ['weapon', 'armor', 'shield', 'helmet', 'cape']) {
    const sp = g[k + 'Sp'] && A.SPECIAL[g[k + 'Sp']];
    if (sp && sp.gyeok && A.GYEOK[sp.gyeok]) out.push({ id: sp.gyeok, ...A.GYEOK[sp.gyeok] });
  }
  return out;
}

// ---------------------------------------------------------------- starting a war

async function startWar(id, cls, role, opts = {}) {
  const def = WARS[id];
  const map = A.M().ywar && def && A.M().ywar[def.map || id];
  if (!def || !map) return false;
  id = def.map || id; // (the field's pieces: 백호 난투 is fought on 백호성's)
  A.setChosenClass(cls);
  // The battlefield's pieces, before the field is shown.
  const loads = [];
  // The field's pieces (1024 pixels square) as decoded bitmaps, kept for the war: drawn from their
  // <img> each was decoded on the spot the first time it came into view (and again once the
  // browser had let it go) — a long frame each time the fight moved across the field.
  for (const [path, bm] of mapBms) if (!path.startsWith(`ywar/${id}_`)) { if (bm && bm.close) bm.close(); mapBms.delete(path); }
  for (let cy = 0; cy * map.chunk < map.h; cy++)
    for (let cx = 0; cx * map.chunk < map.w; cx++) {
      const p = `ywar/${id}_${cx}_${cy}.${map.ext || 'png'}`; // (ext: webp for the fields cut since, repack_from_apk.py)
      if (!mapBms.has(p)) loads.push(sheetBitmap(p).then(bm => { if (bm) mapBms.set(p, bm); }));
    }
  // The fighters' looks (aiLooks), kept for the session: a later war's frames are made already (see warmLooks).
  await aiLooksReady();
  const looks = sessionLooks;
  // The effects of the hero's own spells, the hits, kills and revives decoded now (off the main
  // thread). The fighters' spells are not: every class's kit at once was some 245 MB decoded at the
  // war's start, most of it never drawn — they are loaded as fighters come near the screen
  // (nearKitFx), each sheet past the effects' budget let go again (game.js fxTrim).
  const fxIds = new Set(['h_hit_tiger', 'h_kill', 'k_revive', A.FX.revive, A.FX.shield, A.FX.heal]);
  const skFx = id => { const d = id && SK[id]; if (!d) return; if (d.fx) fxIds.add(d.fx); if (d.fxs) for (const f of d.fxs) fxIds.add(f); };
  for (const [id, d] of Object.entries(SK)) if (d.cls === cls.id) skFx(id);
  for (const col of Object.values(A.SHOT_FX || {})) fxIds.add(col);
  // (loaded too: an effect sheet is loaded as a run needs it, game.js fxWarm)
  loads.push(A.fxWarm(fxIds));
  await Promise.all(loads);
  const stage = {
    id: 'war_' + id, name: def.name, war: def, terrain: 'war', level: 10, monsters: [], intro: def.desc, pages: [],
  };
  pendingWar = { def, role: ROLES[role] ? role : 'dps', side: opts.side === 'def' ? 'def' : 'atk', idle: !!opts.idle, looks };
  A.startRun(cls, stage);
  return true;
}
let pendingWar = null, sessionLooks = null;
// The fighters' looks: four a class for the session, one for each step of a fighter's strength
// (aiLook), each in plain gear of its step and 연's own 코디 pieces (costume.js aiCostume) — a
// crowd of fifty in some forty looks rather than two a class. Fighters of a look share its
// composited frames (warmLooks), so the frames made stay about one look's worth (~0.5 MB) a look.
const LOOK_STEPS = 4;
async function aiLooksReady() {
  if (sessionLooks) return;
  await Promise.race([loadCostumes(), new Promise(r => setTimeout(r, 1500))]).catch(() => {});
  sessionLooks = Object.fromEntries(A.CLASSES.map(c => [c.id, Array.from({ length: LOOK_STEPS }, (_, i) => aiLook(c, i))]));
}
function aiLook(cls, step) {
  const gear = randGear(cls, 16 + step * 9 + rnd(0, 6));
  const cos = aiCostume(cls.id, step);
  if (cos) gear.cos = cos;
  return gear;
}
const mapBms = new Map();

/** Called from startRun when the stage is a war: the field, both guilds, the hero's place. */
function setup() {
  if (pendingWar.jaeng) return jaengSetup();
  const G = A.G();
  const { def, role, side } = pendingWar;
  const M = A.M(), mp = M.ywar[def.map || def.id];
  const W = G.war = {
    def, mode: def.mode, role, side, t: 0, left: def.time, over: false, score: [0, 0], feed: [], ghosts: [], crates: [], zones: [],
    bodies: [], squads: [], nextId: 1, flow: new Map(), sndT: 0, shoutT: 0, fxN: 0, round: 1, gateDown: false,
    map: { cols: mp.cols, rows: mp.rows, w: mp.w, h: mp.h, chunk: mp.chunk, ext: mp.ext, walk: Uint8Array.from(mp.walk.join(''), c => (c === '.' ? 1 : 0)) },
    heroDmgK: 1, roleK: 1, thinkIdx: 0, lastCmd: [0, 0], cmdSaid: 0, events: [],
    // Counters for the tests (__warState().diag): whom the enemy's blows fall on, whom the
    // healers mend, how long the guild's fighters stand about their camp.
    diag: { atk: { hero: 0, tank: 0, other: 0 }, heal: { tank: 0, hero: 0, other: 0 }, campIdle: 0, stuck: {} },
    looks: pendingWar.looks || {},
  };
  G.bossDue = false;
  // 연's PvP opening: an ink blot with 3, 2, 1, 시작 — nobody moves until it is done.
  W.countdown = 4;
  G.events = [];
  // The hero's level and spells: its best build, floored to the battlefield (전장 보정).
  const p = G.player, best = A.best()[G.cls.id];
  const start = Math.max(A.raidStart(best), 22);
  p.lvl = start;
  W.startLvl = start;
  p.next = A.xpFor(start);
  G.pendingLevels = 0;
  G.firstCard = false;
  A.applyBuild(start);
  // 격 that suit the role strengthen it (+8% each, three at most).
  const fit = (p.gyeoks || []).filter(g => gyeokRoles(g).has(role)).length;
  W.roleK = 1 + 0.08 * Math.min(3, fit);
  W.fit = fit;
  if (role === 'tank') { p.maxHp = Math.round(p.maxHp * 1.35 * W.roleK); p.hp = p.maxHp; }
  if (role === 'dps') W.heroDmgK = 1.15 * W.roleK;
  // The field's unit: the hero's own blow at its level, its gear counting at the square root.
  W.U = (6 + 1.2 * p.lvl) * Math.sqrt(Math.max(1, p.gearPower || 1));
  W.refHp = W.U * 22;
  // 전장 보정 by the hero's standing: the field's unit follows the hero's level and gear, but a
  // strong hero brings more than its blows (its spells' reach and holds, its 격, its armour, its
  // life given back — it holds a 거점 or the gate's mouth where a fighter falls). The enemy's
  // fighters and guards strike harder and last longer by the hero's 전투력 over the field's (foeKOf;
  // its 진영대장 strikes harder, its life, the war's objective, is left as it was): measured with the
  // test bots, a hero that stands about loses most wars, one that fights and plays the objective
  // wins most, not all.
  W.tier = A.promo ? A.promo(G.cls.id) : 0;
  W.foeK = window.__warFoeK || foeKOf(Math.max(1500, A.combatPower ? A.combatPower(G.cls) : 3000), W.mode);
  // The hero's armour counts at its square root against the guild's blows (as its gear does in
  // the unit): a well-armoured hero took as little as a third of what an AI fighter took.
  W.heroArmorK = Math.sqrt((20 + Math.min(46.7, Math.max(0, (p.armor || 0) + 2 * ((G.passives && G.passives.armor) || 0)))) / 20);
  // Teams: 0 is the hero's guild.
  W.teams = [0, 1].map(i => ({ id: i, name: GUILDS[i][0], color: GUILDS[i][1], cmd: null, squads: [], spawn: [0, 0], kills: 0 }));
  layout(W);
  // The hero, as one of its guild.
  W.hero = {
    id: 0, hero: true, team: 0, name: `${G.cls.name}(나)`, role, cls: G.cls, tx: 0, ty: 0, x: 0, y: 0, hp: 1, maxHp: 1, dead: false,
    stats: blankStats(), hitBy: new Map(), m: { h: 46 }, scale: 1,
  };
  const sp = W.teams[0].spawn;
  heroTo(sp[0], sp[1]);
  // Both guilds: four squads of five (the hero's squad has four besides the hero).
  for (const team of [0, 1]) {
    for (let s = 0; s < (W.def.squads || squadsOf('war')); s++) {
      const sq = { id: s, team, name: `${s + 1}분대`, members: [], leader: null, order: null, target: null, said: -9, focusT: 0 };
      W.squads.push(sq);
      W.teams[team].squads.push(sq);
      const plan = ['tank', 'healer', 'dps', 'dps', 'support'];
      // The hero fights in the second squad, the guild's main body (the first keeps the home
      // 거점 or the 진영대장, a post with little fighting).
      if (team === 0 && s === 1) plan.splice(plan.indexOf(role), 1);
      for (const r of plan) {
        const f = mkFighter(W, team, r, sq);
        sq.members.push(f);
      }
      sq.leader = sq.members.find(m => m.role === 'tank') || sq.members[0];
      sq.leader.leader = true;
    }
    W.teams[team].troops = [];
  }
  W.squads[1].members.push(W.hero);
  W.hero.squad = W.squads[1];
  // A 딜러 or 서포터 hero has its squad's healer to itself (전담 힐러): it follows the hero, not the
  // tank, and mends the hero first. Without one the hero roamed out of every healer's reach.
  const pocket = (role === 'dps' || role === 'support') && W.squads[1].members.find(m => m.role === 'healer');
  if (pocket) pocket.pocket = true;
  applyPersonas(W);
  mkCommanders(W);
  mkTroops(W);
  // The escort's camps are set by its road (and the troops' posts by the camps), before anyone stands.
  if (W.mode === 'escort') resetEscort(W);
  heroTo(...W.teams[0].spawn);
  for (const b of W.bodies) {
    placeBody(W, b, b.home || W.teams[b.team].spawn);
    listOf(b.team).push(b);
  }
  // The enemy's gate can be struck by the hero's spells like any foe.
  if (W.gate && W.gate.team === 1) G.enemies.push(W.gate);
  W.alive = [0, 1].map(t => W.bodies.filter(b => b.team === t));
  orders(W, 0, true);
  orders(W, 1, true);
  endgameSetup(W);
  A.say(`[${def.name}] ${W.teams[0].name} 문파 대 ${W.teams[1].name} 문파 — ${def.title}. 역할: ${ROLES[role].name}`, 'sys');
  if (fit) A.say(`역할에 맞는 격 ${fit}개: ${ROLES[role].name} 효과 +${Math.round((W.roleK - 1) * 100)}%`, 'sys');
  if (pocket) A.say(`${pocket.name}(${pocket.cls.name})이(가) 당신을 전담 치유합니다`, 'sys');
  A.banner(`${def.name} · ${def.title}`);
  const btn = document.getElementById('war-sb-btn');
  if (btn) btn.hidden = false;
  document.body.classList.add('war');
  W.idle = pendingWar.idle;
  warmLooks(W);
}

function blankStats() {
  return { dmg: 0, heal: 0, taken: 0, obj: 0, kills: 0, deaths: 0, assists: 0, revives: 0, boss: 0 };
}

/** Where everything stands for the war's mode. */
function layout(W) {
  const d = W.def;
  if (W.mode === 'capture') {
    W.teams[0].spawn = d.spawns[0]; W.teams[1].spawn = d.spawns[1];
    W.flags = d.flags.map((at, i) => ({ x: at[0], y: at[1], owner: i === 0 ? 0 : i === 2 ? 1 : -1, prog: i === 1 ? 0 : (i === 0 ? -1 : 1), name: ['청', '중', '적'][i] }));
    for (const f of W.flags) { const s = snap(W, f.x, f.y); f.x = s[0]; f.y = s[1]; }
  } else if (W.mode === 'commander') {
    W.teams[0].spawn = d.spawns[0]; W.teams[1].spawn = d.spawns[1];
  } else if (W.mode === 'escort') {
    W.attacker = 0;
    W.path = pathCells(W, snap(W, ...d.path[0]), snap(W, ...d.path[1]));
    // (the cart's pace: 0.8 tiles a second took it 15 tiles before the defence came down the road and to the end in
    // 1:00~1:30 of a two-minute half, the second half a race to pass it: balance runs. At 0.5 a half is fought out.)
    W.cart = { i: 0, x: 0, y: 0, best: [0, 0], speed: 0.5, boost: 0 };
  } else if (W.mode === 'siege') {
    W.attacker = W.side === 'atk' ? 0 : 1;
    W.teams[W.attacker].spawn = d.outside;
    W.teams[1 - W.attacker].spawn = d.inside;
    const g = d.gate;
    W.gate = {
      war: true, gate: true, team: 1 - W.attacker, name: '현무 성문', hp: W.refHp * 18, maxHp: W.refHp * 18, x0: g.x0, x1: g.x1, y0: g.y0, y1: g.y1,
      tx: Math.round((g.x0 + g.x1) / 2), ty: g.y1, m: { h: 90 }, scale: 1, stats: blankStats(), hitBy: new Map(), flash: 0, prop: null,
    };
    W.gate.x = W.gate.tx * TILE + TILE / 2; W.gate.y = (g.y1 + 1) * TILE - 6;
    // 쪽문 (gate rule, 2026-11-28): the shut gate passes no one, its own side neither (it walked through its own gate
    // and the defence spilled out of it at will); the defence goes out and in by the 쪽문, on foot only.
    W.postern = new Set((d.posterns || []).map(([x, y]) => y * W.map.cols + x));
  }
  for (const t of W.teams) t.spawn = snap(W, t.spawn[0], t.spawn[1]);
  W.zones = (d.scouts || []).map(([x, y]) => { const s = snap(W, x, y); return { x: s[0], y: s[1], owner: -1, prog: 0, kind: 'scout', until: 0 }; });
}

function mkFighter(W, team, role, squad) {
  const classes = A.CLASSES.filter(c => rolesFor(c).includes(role));
  // A healer is a 도사 more often than not (연's healer); the 마도사 and 천인 the rest.
  const poet = role === 'healer' && Math.random() < 0.6 && classes.find(c => c.id === 'poet');
  const cls = poet || pick(classes.length ? classes : A.CLASSES);
  const lv = Math.round(rnd(18, 42));
  // Its look by its strength (aiLooks): the step of its level, now and then one either side; the
  // same looks on every side (the ▼ over the head tells the sides apart).
  const pool = (W.looks = W.looks || {})[cls.id] = W.looks[cls.id] || Array.from({ length: LOOK_STEPS }, (_, i) => aiLook(cls, i));
  const step = clamp(Math.floor((lv - 18) / 6.01) + (Math.random() < 0.3 ? pick([-1, 1]) : 0), 0, pool.length - 1);
  const gear = pool[step];
  // 전장 보정: a fighter's own strength (level and gear) counts, but pulled toward the field's.
  const own = Math.sqrt(lv / 30) * (0.85 + 0.3 * Math.random());
  const pw = (1 + (own - 1) * 0.35) * (team !== 0 && !W.raid ? W.foeK || 1 : 1);
  const hpK = fighterHpK(role, cls);
  const name = baseName();
  const f = {
    war: true, id: W.nextId++, team, role, cls, kit: kitFor(cls), lv, gear, name, pw, squad,
    maxHp: W.refHp * hpK * pw, hp: 0, x: 0, y: 0, tx: 0, ty: 0, fx: 0, fy: 0, mt: 0, dur: 0.25, moving: false, phase: 0,
    face: 1, mdx: 0, mdy: 1, fdx: 0, fdy: 1, walkT: 0, pose: null, poseT: 0, flash: 0, stun: 0, slow: 0, curse: 0, st: null,
    m: { h: 46, area: 2000, id: 'f' }, scale: 1, kind: undefined, cd: { a: rnd(0, 1), b: rnd(2, 6), c: rnd(4, 10), d: rnd(8, 16), e: rnd(2, 5), r: 0 },
    thinkT: Math.random() * 0.125, target: null, dest: null, state: 'go', stats: blankStats(), hitBy: new Map(), dmgIn: [], shield: 0,
    speed: cls.speed || 70, dead: false, respawnAt: 0, carry: null, said: -9, bubble: null, aliveT: 0,
    // How well it reads a red floor: some step off at once, some late, some not at all.
    dodge: rnd(0.65, 0.97), react: rnd(0.1, 0.35),
  };
  f.hp = f.maxHp;
  persona(f);
  f.style = warStyle(W, f);
  f.timid = timidOf(W, f);
  W.bodies.push(f);
  return f;
}

function fighterHpK(role, cls) {
  return { tank: 1.7, healer: 0.9, dps: 1.0, support: 1.05 }[role] * Math.sqrt(cls.hp / 140);
}

function randGear(cls, lv) {
  const line = A.GEAR[cls.id];
  const g = { armor: 0, weapon: 0, shield: -1, helmet: -1, cape: -1 };
  if (!line) return g;
  for (const kind of ['armor', 'weapon', 'shield', 'helmet', 'cape']) {
    const list = (A.plainList ? A.plainList(cls.id, kind) : null) || (line[kind] || []).map((_, i) => i);
    if (!list.length) continue;
    if ((kind === 'helmet' || kind === 'cape' || kind === 'shield') && Math.random() < 0.35) continue;
    const at = clamp(Math.round((lv / 45) * (list.length - 1) + rnd(-1.4, 1.4)), 0, list.length - 1);
    g[kind] = list[at];
  }
  return g;
}

function mkCommanders(W) {
  const d = W.def;
  let at;
  if (W.mode === 'escort') at = [d.cmdStart, d.cmdEnd];
  else if (W.mode === 'siege') at = W.attacker === 0 ? [d.cmdOut, d.cmdIn] : [d.cmdIn, d.cmdOut];
  else at = d.cmds;
  const units = ['3079', '9023'];
  for (const team of [0, 1]) {
    const unit = A.M().yunit && A.M().yunit[units[team]] ? units[team] : null;
    const c = {
      war: true, cmdr: true, id: W.nextId++, team, role: 'tank', cls: null, unit, name: `${W.teams[team].name} 진영대장`, lv: 50, pw: team === 1 ? W.foeK : 1,
      maxHp: W.refHp * (W.mode === 'commander' ? 10 : W.mode === 'siege' ? 28 : 20), hp: 0, x: 0, y: 0, tx: 0, ty: 0, fx: 0, fy: 0, mt: 0, dur: 0.4, moving: false, phase: 0,
      face: 1, mdx: 0, mdy: 1, fdx: 0, fdy: 1, walkT: 0, pose: null, poseT: 0, flash: 0, stun: 0, slow: 0, curse: 0, st: null,
      m: { h: 96, area: 9000, id: unit || 'c' }, scale: 1.25, cd: { a: 1, b: 3, c: 6, d: 9, e: 4, r: 0 }, thinkT: 0, target: null, dest: null,
      stats: blankStats(), hitBy: new Map(), dmgIn: [], shield: 0, speed: 55, dead: false, respawnAt: 0, home: snap(W, ...at[team]), quietT: 0,
    };
    c.hp = c.maxHp;
    W.teams[team].cmd = c;
    W.bodies.push(c);
  }
}

/** Helmeted guards of each side (연's 평양성 and 동부여성 경비병) about the camp or the gate. */
function mkTroops(W) {
  const units = [['war_g1', 'war_g2', 'war_cap1'], ['war_g3', 'war_g4', 'war_cap2']];
  for (const team of [0, 1]) {
    const c = W.teams[team].cmd;
    let post = c.home;
    if (W.mode === 'siege' && team !== W.attacker) post = [W.gate.tx, W.gate.y0 - 3];
    if (W.mode === 'escort') post = team === W.attacker ? W.teams[team].spawn : snap(W, W.def.path[1][0], W.def.path[1][1] + 6);
    for (let i = 0; i < 6; i++) {
      const u = units[team][i === 0 ? 2 : i % 2];
      const ok = A.M().yunit && A.M().yunit[u];
      const t = {
        war: true, troop: true, id: W.nextId++, team, role: 'dps', cls: null, unit: ok ? u : null, name: i === 0 ? '경비대장' : '경비병', lv: 30, pw: (i === 0 ? 1.3 : 1) * (team === 1 ? W.foeK : 1),
        maxHp: W.refHp * (i === 0 ? 1.1 : 0.55) * (team === 1 ? W.foeK : 1), hp: 0, x: 0, y: 0, tx: 0, ty: 0, fx: 0, fy: 0, mt: 0, dur: 0.3, moving: false, phase: 0,
        face: 1, mdx: 0, mdy: 1, fdx: 0, fdy: 1, walkT: 0, pose: null, poseT: 0, flash: 0, stun: 0, slow: 0, curse: 0, st: null,
        m: { h: 52, area: 3000, id: u }, scale: 1, cd: { a: rnd(0, 1.2), b: 3, c: 6, d: 9, e: 4, r: 0 }, thinkT: Math.random() * 0.2, target: null, dest: null,
        stats: blankStats(), hitBy: new Map(), dmgIn: [], shield: 0, speed: 58, dead: false, respawnAt: 0,
        home: snap(W, post[0] + (i % 3 - 1) * 2, post[1] + (i < 3 ? -1 : 1) * 2),
      };
      t.hp = t.maxHp;
      W.teams[team].troops.push(t);
      W.bodies.push(t);
    }
  }
}

// ---------------------------------------------------------------- the field

function open(W, x, y, team = -1) {
  const m = W.map;
  if (x < 0 || y < 0 || x >= m.cols || y >= m.rows) return false;
  // 쪽문: open to the gate's own side, on foot (pass: never to a leap, a dash or a blink).
  if (W.postern && W.postern.has(y * m.cols + x)) return team === W.gate.team;
  if (!m.walk[y * m.cols + x]) return false;
  return !shutGate(W, x, y);
}
/** A tile of the standing gate: shut to everyone (its own side goes by the 쪽문). */
function shutGate(W, x, y) {
  const g = W.gate;
  return !!(g && !W.gateDown && x >= g.x0 && x <= g.x1 && y >= g.y0 && y <= g.y1);
}
/** The hero's sight for a blow (not a move): walls stop it, the shut gate only the side it shuts out (its own casters
 *  strike over it, as the AI's do). */
function seeOver(W, x0, y0, x1, y1) {
  const m = W.map, n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 3, g = W.gate;
  for (let i = 1; i <= n; i++) {
    const x = Math.round(x0 + (x1 - x0) * i / n), y = Math.round(y0 + (y1 - y0) * i / n);
    if (x < 0 || y < 0 || x >= m.cols || y >= m.rows) return false;
    if (shutGate(W, x, y)) { if (g.team !== 0) return false; continue; }
    if (!m.walk[y * m.cols + x] && !(W.postern && W.postern.has(y * m.cols + x))) return false;
  }
  return true;
}
/** A leap refused: counted (W.gateBlock, the tests) when it was the gate or a 쪽문 on its way that refused it. Always false. */
function gateBlocked(W, x0, y0, x1, y1) {
  if (!W.gate) return false;
  const n = Math.max(1, Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 3);
  for (let i = 0; i <= n; i++) {
    const x = Math.round(x0 + (x1 - x0) * i / n), y = Math.round(y0 + (y1 - y0) * i / n);
    if (shutGate(W, x, y) || (W.postern && W.postern.has(y * W.map.cols + x))) { W.gateBlock = (W.gateBlock || 0) + 1; break; }
  }
  return false;
}
/** A tile a body may be carried over in one move (a leap, a dash, a blink): open, and neither the shut gate nor a 쪽문. */
function pass(W, x, y, team) {
  if (W.postern && W.postern.has(y * W.map.cols + x)) return false;
  return open(W, x, y, team);
}

/** The open tile nearest a point (spirals out). */
function snap(W, x, y) {
  x = clamp(Math.round(x), 0, W.map.cols - 1);
  y = clamp(Math.round(y), 0, W.map.rows - 1);
  for (let r = 0; r < 12; r++)
    for (let dx = -r; dx <= r; dx++)
      for (let dy = -r; dy <= r; dy++)
        if (Math.max(Math.abs(dx), Math.abs(dy)) === r && open(W, x + dx, y + dy)) return [x + dx, y + dy];
  return [x, y];
}

/** Steps from every open tile to (x, y): a breadth-first field, kept for reuse. */
function flowTo(W, x, y, team) {
  const key = x + ',' + y + ',' + (W.gate && (!W.gateDown || W.postern) ? (team === W.gate.team ? 'g' : 'n') + (W.gateDown ? 'd' : '') : '');
  let f = W.flow.get(key);
  if (f) return f;
  const { cols, rows } = W.map, n = cols * rows;
  f = new Int16Array(n).fill(-1);
  const q = new Int32Array(n);
  let h = 0, t = 0;
  if (!open(W, x, y, team)) [x, y] = snap(W, x, y);
  f[y * cols + x] = 0;
  q[t++] = y * cols + x;
  while (h < t) {
    const c = q[h++], cx = c % cols, cy = (c - cx) / cols, dv = f[c] + 1;
    for (const [dx, dy] of DIR4) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const ni = ny * cols + nx;
      if (f[ni] >= 0 || !open(W, nx, ny, team)) continue;
      f[ni] = dv;
      q[t++] = ni;
    }
  }
  if (W.flow.size > 96) W.flow.delete(W.flow.keys().next().value);
  W.flow.set(key, f);
  return f;
}

function pathCells(W, a, b) {
  const f = flowTo(W, b[0], b[1], -1), cols = W.map.cols, out = [a.slice()];
  let [x, y] = a;
  for (let i = 0; i < 400 && f[y * cols + x] > 0; i++) {
    const here = f[y * cols + x];
    let best = null;
    for (const [dx, dy] of DIR4) {
      const nx = x + dx, ny = y + dy, v = (nx >= 0 && ny >= 0 && nx < cols && ny < W.map.rows) ? f[ny * cols + nx] : -1;
      if (v >= 0 && v < here && (!best || Math.abs(nx - b[0]) < Math.abs(best[0] - b[0]))) best = [nx, ny];
    }
    if (!best) break;
    [x, y] = best;
    out.push([x, y]);
  }
  return out;
}

function placeBody(W, b, at) {
  const [x, y] = freeNear(W, at[0], at[1], b.team);
  A.leave(b);
  A.place(b, x, y);
  moved(b, 'place');
}
/** Who last moved a body, for the wall test (__wallCheck): war.js's own steps, or else game.js's. */
function moved(b, how) { b.mv = how; b.mvX = b.tx; b.mvY = b.ty; }
function freeNear(W, x, y, team) {
  for (let r = 0; r < 10; r++)
    for (let dx = -r; dx <= r; dx++)
      for (let dy = -r; dy <= r; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const nx = x + dx, ny = y + dy;
        if (open(W, nx, ny, team) && A.free(nx, ny)) return [nx, ny];
      }
  return snap(W, x, y);
}

function heroTo(x, y) {
  const G = A.G(), p = G.player, W = G.war;
  const [nx, ny] = freeNear(W, x, y, 0);
  p.tx = nx; p.ty = ny;
  p.x = nx * TILE + TILE / 2;
  p.y = ny * TILE + TILE - 6;
  p.stepping = false;
  if (W.hero) W.hero.__wc = null; // (set down, not carried: the wall test)
  p.moving = false;
}

// ---------------------------------------------------------------- per frame

export const War = {
  setup: () => setup(),
  update: dt => update(dt),
  open: (x, y) => { const G = A.G(); return open(G.war, x, y, 0); },
  /** May body b stand on (x, y) (its own side's 쪽문, never the other's)? */
  openTo: (b, x, y) => { const W = A.G().war; return open(W, x, y, b.team === undefined ? 1 : b.team); },
  /** May fighter b step onto (x, y), taken already (game.js step)? Its own side's tile, yes. */
  share: (b, x, y) => share(b, x, y),
  /** Whether a body can be carried from (x0, y0) to (x1, y1) in one move (a leap, a dash, a pull):
   * the tile is open and no wall or shut gate stands on the straight line between. */
  clear: (x0, y0, x1, y1, sight = false) => {
    const W = A.G().war;
    if (W.raid) return true;
    if (sight) return seeOver(W, x0, y0, x1, y1);
    // (The shut gate and the 쪽문 stop every leap, its own side's too: the defence's hero leapt out through its own
    // gate and back, and a 돌진 at a foe beyond the wall carried it over — gate rule, 2026-11-28.)
    if (!pass(W, x1, y1, 0)) return gateBlocked(W, x0, y0, x1, y1);
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 3;
    for (let i = 1; i < n; i++) if (!pass(W, Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), 0)) return gateBlocked(W, x0, y0, x1, y1);
    return true;
  },
  /** A tile the hero may be carried onto or over (a dash's steps, a blink's): not the shut gate nor a 쪽문. */
  pass: (x, y) => { const W = A.G().war; return W.raid ? open(W, x, y, 0) : pass(W, x, y, 0) || gateBlocked(W, x, y, x, y); },
  down: e => kill(A.G().war, e, A.G().war.hero),
  credit: (e, dmg) => heroHit(e, dmg),
  /** 전장 보정 for the hero's own blows: past about four fighters' blows a second (more for a
   * 딜러, and growing with the levels gained in the war) they are scaled down, so the war is the
   * guilds' and not one hero's, whatever its gear. */
  scale: (dmg, e) => {
    const G = A.G(), W = G.war;
    if (!W || !(dmg > 0)) return dmg;
    // 「쟁」: no blow into or out of a camp.
    if (W.jaeng && e && e.war && (e.team === 0 || inCamp(W, e) || inCamp(W, W.hero))) return 0; // (nor on its own guild: a status ticking on one)
    const win = W.rawWin || (W.rawWin = []);
    win.push([G.t, dmg]);
    W.rawSum = (W.rawSum || 0) + dmg;
    while (win.length && G.t - win[0][0] > 8) W.rawSum -= win.shift()[1];
    const span = Math.max(3, Math.min(8, G.t - win[0][0]));
    const rate = W.rawSum / span;
    // (By its 전투력 as one of its guild (W.heroPw, applyPersonas): it was a fighter's worth whatever its 전투력 — a hero
    // of 1.5만 struck as hard as one of 7.5만 against the same guilds.)
    const target = W.U * 2.6 * clamp(W.heroPw || 1, 0.4, 2.4) * (1 + 0.03 * Math.max(0, G.player.lvl - W.startLvl)) * (W.role === 'dps' ? W.heroDmgK : 1) * (W.jaeng ? JAENG.heroK : 1);
    const out = (rate > target ? dmg * target / rate : dmg) * (W.sbuff ? shrineK(W, W.hero, e) : 1);
    if (!W.jaeng) return out;
    // 「쟁」: the guild's 역습 and the seals' gift count for the hero too; a hero away barely scratches.
    return out * (e && e.kind === 'boss' ? jaengBossK(W, 0) : W.comeback[0]) * (afk() ? JAENG.afkK : 1);
  },
  heroDown: () => heroDown(),
  /**
   * The ground the hero is holding, if it stands on one: a 거점's circle, the cart's ring (pushing
   * or stopping it), a watch post not yet ours. game.js keeps the hero's leaps inside it (warHold).
   */
  anchor: () => {
    const G = A.G(), W = G.war;
    if (!W || W.raid || W.over || G.dead) return null;
    const p = G.player;
    if (W.flags) for (const f of W.flags) if (Math.hypot(p.tx - f.x, p.ty - f.y) <= 2.2) return { x: f.x, y: f.y, r: 2.2 };
    if (W.seals) for (const f of W.seals) if (f.owner !== 0 && Math.hypot(p.tx - f.x, p.ty - f.y) <= 2.2) return { x: f.x, y: f.y, r: 2.2 };
    if (W.mode === 'escort' && W.cart && Math.hypot(p.tx - W.cart.tx, p.ty - W.cart.ty) <= 3) return { x: W.cart.tx, y: W.cart.ty, r: 3 };
    for (const z of W.zones) if (z.owner !== 0 && Math.hypot(p.tx - z.x, p.ty - z.y) <= 1.5) return { x: z.x, y: z.y, r: 1.5 };
    return null;
  },
  /** The player moved the hero (game.js input): not away. */
  moved: () => { const G = A.G(); if (G.war) G.war.movedT = G.t; },
  neediest: () => neediest(),
  heroHeal: (n, fx) => heroHeal(n, fx),
  healed: (m, n) => credit(A.G().war.hero, 'heal', n),
  drawBody: b => drawBody(b),
  drawMap: (cx, cy) => drawMap(cx, cy),
  drawGround: () => drawGround(),
  hud: () => hud(),
  /** True while the opening count runs: the field waits. */
  hold: dt => {
    const W = A.G().war;
    if (!W || W.countdown <= 0) return false;
    const before = Math.ceil(W.countdown - 1);
    W.countdown -= dt;
    const now = Math.ceil(W.countdown - 1);
    if (now !== before && now >= 0) A.audio().play(now === 0 ? 'levelup' : 'click');
    return W.countdown > 1;
  },
  props: () => [],
  // 「쟁」 (game.js's hunt, calling in where marked 「쟁」)
  bossTick: dt => bossTick(dt),
  mobAct: (e, dt) => mobAct(e, dt),
  mobDown: e => mobDown(e),
  mobSpot: () => mobSpot(),
  jaengBodies: () => jaengBodies(),
  cam: (cx, cy) => {
    const G = A.G(), m = G.war.map, VW = A.VW(), VH = A.VH();
    if (G.war.raid) return [cx, cy];
    // Test (__warCam = [x, y]): the camera on a spot of the field instead of the hero.
    if (window.__warCam) { cx = Math.round(window.__warCam[0] - VW / 2); cy = Math.round(window.__warCam[1] - VH / 2); }
    return [m.w > VW ? clamp(cx, 0, m.w - VW) : Math.round((m.w - VW) / 2), m.h > VH ? clamp(cy, 0, m.h - VH) : Math.round((m.h - VH) / 2)];
  },
  openBoard: () => openBoard(),
  // 레이드 (the raid of twenty-five on this file's fighters; game.js calls in where marked "공대")
  raidSetup: () => raidSetup(),
  raidAggro: () => raidAggro(),
  /** Whom the boss's floor and bolts aim at: the one it has turned on, else the nearest to it. */
  raidTarget: () => {
    const G = A.G(), W = G.war, ag = G.aggro;
    if (ag && (ag === G.player ? !G.dead : !ag.down)) return ag;
    let best = null, bd = 1e9;
    // (「쟁」: the guilds looked at from a turning first, so a tie falls on none in particular.)
    const off = W.jaeng ? (W.aimOff = ((W.aimOff || 0) + 1) % 3) : 0;
    for (const k of W.jaeng ? W.teamIds : [0]) for (const m of W.alive[(k + off) % (W.jaeng ? 3 : 1)]) { const d = W.boss ? d2(m, W.boss) : 0; if (d < bd) { bd = d; best = m; } }
    return best ? (best.hero ? G.player : best) : G.player;
  },
  raidSpot: () => raidSpot(),
  raidLair: () => { const W = A.G().war; return freeNear(W, W.lair[0], W.lair[1], 1); },
  raidBossHp: () => raidBossHp(),
  hurt: (m, dmg, from) => raidHurt(m, dmg, from),
  raidScale: (dmg, e) => raidScale(dmg, e),
  raidCredit: (e, dmg, killed) => raidCredit(e, dmg, killed),
  raidCut: () => raidHeroCut(),
  get RAGE() { return RAID_RAGE; },
  rageBlast: bl => rageBlast(bl),
  rageBlastK: (x, bl) => rageBlastK(x, bl),
  raidHeroHurt: () => raidHeroHurtK(),
  /** 대항전·「쟁」: what mends the hero, at this share (game.js heal, its health coming back, 흡혈 buff): by its 전투력
   * over its guild's middle — a hero at or under it mends as before, a strong one at down to 0.55. A hero of 7.7만 lost
   * fourteen lives' worth of health in a war and mended it all as it came: 0 deaths in every war (balance runs). */
  heroHealK: () => {
    const W = A.G().war;
    if (!W || W.raid) return 1;
    const rel = (W.heroPw || 1) / Math.max(0.5, W.heroSideK || 1);
    return 1 - 0.45 * clamp((rel - 0.7) / 0.8, 0, 1);
  },
  /** A hero's life at the raid's own level, for the servants' bites on a raider. */
  raidHeroHp: () => { const G = A.G(), W = G.war; return (150 + 20 * Math.floor(W.lvRec / 4)) * (1 + 0.08 * G.level); },
  /** The hero struck in a raid: its share of life, counted as a raider's. */
  // (Struck, as a fighter struck in hit() is: the healers' "being struck" — the tank first while
  // it is, the 보호 at the brink — saw the hero struck only by the guilds, never by the boss or its
  // servants, whose blows come here; a hero holding the 「쟁」 boss stood last in their eyes.)
  heroTaken: n => { const G = A.G(), W = G.war; if (n > 0) W.hero.lastHitT = G.t; credit(W.hero, 'taken', n / G.player.maxHp * W.refHp * (W.role === 'tank' ? 1.7 : 1)); },
  raidEnd: (win, title) => raidEnd(win, title),
  raidShow: () => showResult(A.G().war),
  raidRoles: cls => rolesFor(cls),
  raidRoleOf: cls => raidRoleOf(cls),
  ROLES,
};

function update(dt) {
  const G = A.G(), W = G.war;
  if (!W || W.over) return;
  nearKitFx(W);
  if (W.raid) return updateRaid(dt);
  W.t += dt;
  W.left -= dt;
  const p = G.player, h = W.hero;
  h.tx = p.tx; h.ty = p.ty; h.x = p.x; h.y = p.y; h.hp = p.hp; h.maxHp = p.maxHp; h.dead = G.dead;
  // Lists of the living, by team, for every look-around this frame.
  const teams = teamsOf(W);
  W.alive = teams.map(() => []);
  for (const b of W.bodies) if (!b.dead) W.alive[b.team].push(b);
  if (!h.dead) W.alive[0].push(h);
  if (W.gate && !W.gateDown) W.alive[W.gate.team].push(W.gate);
  if (W.teamIds) { jaengLists(W); dangerMap(W, G); }
  // How many foes have each one as their target (pickFoe spreads the blows by it).
  for (const t of teams) for (const b of W.alive[t]) b.engaged = 0;
  for (const t of teams) for (const b of W.alive[t]) if (b.target && b.target.engaged !== undefined && !b.target.dead) b.target.engaged++;
  // Bodies: steps, statuses, timers every frame; thinking ~8 times a second, staggered.
  // (「쟁」: from a turning first body, so no guild steps first into the free tiles every frame.)
  const nb = W.bodies.length, off = W.jaeng ? (W.tickOff = ((W.tickOff || 0) + 7) % nb) : 0;
  for (let i = 0; i < nb; i++) {
    const b = W.bodies[(i + off) % nb];
    if (b.dead) {
      if (G.t >= b.respawnAt && b.respawnAt > 0) respawn(W, b);
      continue;
    }
    b.aliveT = (b.aliveT || 0) + dt;
    tickBody(W, b, dt);
  }
  if (!G.dead) h.aliveT = (h.aliveT || 0) + dt;
  if (afk()) W.afkT = (W.afkT || 0) + dt;
  heroRole(W, dt);
  if (G.dead && W.heroBack && G.t >= W.heroBack) heroUp(W);
  if (W.jaeng) jaengTick(W, dt);
  else objectives(W, dt);
  W.cmdT = (W.cmdT || 0) - dt;
  if (W.cmdT <= 0) {
    W.cmdT = 1;
    if (W.jaeng) { for (const t of W.teamIds) jaengPlan(W, t); jshrineOrders(W); }
    else {
      warPhase(W);
      orders(W, 0);
      orders(W, 1);
      commandOrders(W);
      shrineOrders(W);
      ramOrders(W);
    }
    for (const t of teamsOf(W)) squadTactics(W, t);
    heroLead(W);
  }
  if (!W.jaeng) warCommands(W, dt);
  endgameTick(W, dt);
  tacTick(W, dt);
  W.ghosts = W.ghosts.filter(g => !g.b.dead ? false : G.t < g.until);
  W.feed = W.feed.filter(f => G.t - f.t < 6);
  // Budgets for a field of fifty: numbers (each is several glyph pictures) and effects.
  if (G.texts.length > 30) G.texts.splice(0, G.texts.length - 30);
  if (G.fxs.length > 45) G.fxs.splice(0, G.fxs.length - 45);
  if (window.__dbgWar && window.__dbgWar.notext) G.texts.length = 0;
  if (window.__dbgWar && window.__dbgWar.nofx) G.fxs.length = 0;
  if (window.__wallCheck) wallCheck(W);
  if (W.jaeng) jaengShares(W);
  else checkEnd(W);
}

function tickBody(W, b, dt) {
  const G = A.G();
  if (!b.dead) stackOff(W, b, dt);
  A.advance(b, dt);
  if (b.moving) b.walkT += dt * 1000;
  b.flash = Math.max(0, b.flash - dt);
  b.stun = Math.max(0, b.stun - dt);
  b.slow = Math.max(0, b.slow - dt);
  b.curse = Math.max(0, b.curse - dt);
  b.poseT = Math.max(0, b.poseT - dt);
  if (b.st) A.tickStatus(b);
  if (b.dead) return;
  for (const k in b.cd) b.cd[k] -= dt;
  // Health back slowly; quickly at the camp.
  const home = W.teams[b.team].spawn, atBase = Math.abs(b.tx - home[0]) + Math.abs(b.ty - home[1]) <= 4;
  b.hp = Math.min(b.maxHp, b.hp + b.maxHp * (atBase ? 0.08 : 0.006) * dt);
  // (A raid's healers mend all the while: their mana comes back faster, or the raid's healing fell short.)
  if (b.mp < 1) b.mp = Math.min(1, b.mp + (atBase ? 0.1 : W.raid ? 0.06 : 0.022) * dt);
  if (W.diag && !W.raid && b.team === 0 && !b.troop && !b.cmdr) {
    // Standing about the camp more than five seconds after rising there, with no foe near and not
    // mending (the 1분대 that keeps a 거점 or the 진영대장 by the camp is at its post, not idle).
    const near = Math.abs(b.tx - home[0]) + Math.abs(b.ty - home[1]) <= 5;
    const post = b.squad && b.squad.order && Math.abs(b.squad.order.x - home[0]) + Math.abs(b.squad.order.y - home[1]) <= 6;
    if (near && !post && W.t - (b.upT || 0) > 5 && b.state !== 'retreat' && !nearest(W, b, 7)) {
      W.diag.campIdle += dt;
      const k = b.squad.id + ':' + b.role + ':' + b.cls.id;
      W.diag.stuck[k] = (W.diag.stuck[k] || 0) + dt;
      if (window.__warWhy) (W.diag.why = W.diag.why || {})[k] = [b.tx, b.ty, b.dest, b.state, b.moving, b.blocked, b.target && b.target.name, Math.round(hpk(b) * 100), b.squad.order && [b.squad.order.x, b.squad.order.y], b.carry ? 'carry' : '', b.kit.range];
    }
  }
  b.thinkT -= dt;
  if (b.thinkT <= 0) {
    b.thinkT += 0.125;
    if (b.thinkT < 0) b.thinkT = 0.125;
    // (Stepping apart from a spread spell's wind-up: that step is taken before the next thought;
    // it still strikes what is in reach.)
    if (b.scatterT > G.t && b.dest) { const t = b.target; if (t && t.team !== b.team && b.role !== 'healer' && alive(t) && d2(b, t) <= (b.kit.range > 1 ? b.kit.range + 0.5 : 1.5)) act(W, b, t); }
    else if (b.stun <= 0 && !trollThink(W, b)) (W.jaeng ? thinkJaeng : W.raid && !b.cmdr && !b.troop ? thinkRaid : think)(W, b);
    // Its own words now and then (its 급 and way: the server's best, a 뉴비, a 힐 집착 …).
    if (b.play && b.team === 0 && Math.random() < 0.006) personaTalk(W, b);
  }
  if (!b.moving && b.stun <= 0 && !b.dest && !b.troop && !b.cmdr) spread(W, b);
  if (!b.moving && b.stun <= 0 && b.dest) walk(W, b);
}

/** One tile toward the body's destination along the field's paths; through its own side, round a foe. */
function walk(W, b) {
  const [dx0, dy0] = b.dest;
  if (b.tx === dx0 && b.ty === dy0) { b.dest = null; return; }
  const near = Math.abs(dx0 - b.tx) + Math.abs(dy0 - b.ty);
  const cols = W.map.cols;
  let opts;
  if (W.raid) {
    // A raid's field is open: straight on, the other way round when the first is taken.
    opts = A.towards(b, dx0, dy0);
    if (opts.length === 1) opts.push(opts[0][0] ? [0, pick([-1, 1])] : [pick([-1, 1]), 0]);
  } else if (near <= 3 && (opts = A.towards(b, dx0, dy0)).some(([dx, dy]) => open(W, b.tx + dx, b.ty + dy, b.team))) {
    // (Close by, straight on; round by the paths when a wall stands in the straight way.)
  } else {
    // (a far destination by a shared point on a 3-tile grid: a crowd marching to forty spots made forty fields a second)
    const [fx0, fy0] = near > 9 ? snap(W, Math.round(dx0 / 3) * 3, Math.round(dy0 / 3) * 3) : [dx0, dy0];
    let f = flowTo(W, fx0, fy0, b.team);
    if (f[b.ty * cols + b.tx] < 0 && (fx0 !== dx0 || fy0 !== dy0)) f = flowTo(W, dx0, dy0, b.team);
    // A destination it cannot reach (behind the shut gate, in the castle's wall walk, across water): it stood on the spot
    // for good (엔드게임 점검 2026-11-28: the siege's fighters sent to roam or hunt inside the castle stood still before it,
    // 6~40 of them a war). Now to the nearest tile it can reach.
    if (f[b.ty * cols + b.tx] < 0) {
      const alt = reachNear(W, b, dx0, dy0);
      b.dest = alt && (alt[0] !== b.tx || alt[1] !== b.ty) ? alt : null;
      if (W.diag) W.diag.unreach = (W.diag.unreach || 0) + 1;
      return;
    }
    const here = f[b.ty * cols + b.tx];
    opts = [];
    for (const [dx, dy] of DIR4) {
      const nx = b.tx + dx, ny = b.ty + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= W.map.rows) continue;
      const v = f[ny * cols + nx];
      if (v >= 0 && (here < 0 || v < here)) opts.push([dx, dy, v]);
    }
    opts.sort((a, c) => a[2] - c[2]);
  }
  const dur = 0.25 * 70 / b.speed * (b.slow > 0 ? 1.6 : 1) * (surging(W, b) ? 1 / TACTICS.surge.speed : 1) * (b.carry && b.role !== 'support' ? 1.25 : 1) * (b.cmdr ? 1.3 : 1) / (1 + (W.sbuff ? shrineOn(W, b.team, 'speed') : 0));
  const safe = (W.raid || W.jaeng) && W.danger.size && !W.danger.has(dk(b.tx, b.ty));
  // A free tile first; else through one of its own side (연's players pass through each other and
  // stand on one another: the crowd at a gate or round a boss no longer jams). A foe's tile stays shut.
  for (let pass = 0; pass < 2; pass++)
    for (const [dx, dy] of opts) {
      const nx = b.tx + dx, ny = b.ty + dy;
      if (!open(W, nx, ny, b.team)) continue;
      // Not onto a red tile it has seen (a careless one walks in anyway).
      if (safe && W.danger.has(dk(nx, ny)) && b.dodge > 0.6) continue;
      if (pass === 0 && !A.free(nx, ny)) continue;
      if (A.step(b, dx, dy, dur)) { b.fdx = dx; b.fdy = dy; b.blocked = 0; b.side = 0; moved(b, 'walk'); return; }
    }
  // A tile full of its own side (three on it already): one standing there changes places (both step).
  if (opts.length) {
    const [dx, dy] = opts[0], o = A.occ.get(k2(b.tx + dx, b.ty + dy));
    if (o && o.war && o.team === b.team && !o.moving && !o.dead && !o.cmdr && !o.gate && !o.wprop && open(W, b.tx + dx, b.ty + dy, b.team) && open(W, b.tx, b.ty, o.team)) {
      A.leave(o);
      A.leave(b);
      const ox = o.tx, oy = o.ty;
      startStep(o, b.tx, b.ty, dur);
      startStep(b, ox, oy, dur);
      moved(o, 'swap'); moved(b, 'swap');
      b.fdx = dx; b.fdy = dy; b.blocked = 0;
      return;
    }
  }
  // Blocked by a foe: round it, to one side (kept, not a random step each time: the back and forth
  // of a jam), the side toward its goal first.
  b.blocked = (b.blocked || 0) + 1;
  if (b.blocked > 2 && opts.length) {
    const [fx] = opts[0];
    if (!b.side) { const along = fx ? Math.sign(dy0 - b.ty) : Math.sign(dx0 - b.tx); b.side = along || pick([-1, 1]); }
    for (const sgn of [b.side, -b.side]) {
      const dx = fx ? 0 : sgn, dy = fx ? sgn : 0;
      if (open(W, b.tx + dx, b.ty + dy, b.team) && A.step(b, dx, dy, dur)) { b.fdx = dx; b.fdy = dy; b.side = sgn; moved(b, 'side'); break; }
    }
    b.blocked = 0;
  }
}

/** The tile nearest (x, y) that body b can walk to from where it stands (by its side's open tiles), or null. */
function reachNear(W, b, x, y) {
  // (kept for the body while its destination and the gate stand as they were: no new field a step)
  x = clamp(Math.round(x), 0, W.map.cols - 1); y = clamp(Math.round(y), 0, W.map.rows - 1);
  const key = x + ',' + y + ',' + (W.gateDown ? 1 : 0);
  if (b.rnKey === key) return b.rnAt;
  const { cols, rows } = W.map, n = cols * rows, f = new Int16Array(n).fill(-1), q = new Int32Array(n);
  let h = 0, t = 0;
  f[b.ty * cols + b.tx] = 0; q[t++] = b.ty * cols + b.tx;
  while (h < t) {
    const c = q[h++], cx = c % cols, cy = (c - cx) / cols;
    for (const [dx, dy] of DIR4) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const ni = ny * cols + nx;
      if (f[ni] >= 0 || !open(W, nx, ny, b.team)) continue;
      f[ni] = f[c] + 1; q[t++] = ni;
    }
  }
  b.rnKey = key;
  b.rnAt = null;
  for (let r = 0; r < 16 && !b.rnAt; r++) {
    let bd = 1e9;
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || f[ny * cols + nx] < 0) continue;
      if (f[ny * cols + nx] < bd) { bd = f[ny * cols + nx]; b.rnAt = [nx, ny]; }
    }
  }
  return b.rnAt;
}
/** A step to a tile already cleared for it (a swap in a crowd): as game.js's step, without the check. */
function startStep(b, nx, ny, dur) {
  b.fx = b.tx; b.fy = b.ty;
  b.tx = nx; b.ty = ny;
  b.mt = 0;
  b.dur = dur;
  b.moving = true;
  const dx = nx - b.fx, dy = ny - b.fy;
  if (dx) b.face = dx > 0 ? 1 : -1;
  b.mdx = dx; b.mdy = dy;
  enter(b, nx, ny);
}
/** Onto a tile in game.js's books: its holder when none holds it, else one sharing it. */
function enter(b, x, y) {
  const k = k2(x, y);
  if (!A.occ.has(k) && !A.crowd.has(k)) { A.occ.set(k, b); return; }
  const c = A.crowd.get(k);
  if (c) c.push(b); else A.crowd.set(k, [b]);
}

// ---------------------------------------------------------------- the crowd
//
// 바람의나라 연: players pass through each other and heap on a spot (its client sets unit collision
// apart for friends and for foes, by mode: COLLIDE_FRIENDLY_BY_MODE / COLLIDE_ENEMY_BY_MODE). Here a fighter may
// step onto a tile of its own side (up to SHARE_CAP on one, the hero counted), never onto a foe's,
// so a gate, a line of tanks or a boss's ring still holds against the other side. Bodies sharing a
// tile stand a little apart on it (stackOff), spread to a free tile beside when they have stood a
// while (spread), and are drawn see-through over the hero and over each other (overAlpha).
// A blade does not run at its target's own tile any more (taken, it left the blade circling): it
// takes a place round the target (meleeSlot: the nearest with room, kept a while, a tile another
// is bound for counted as taken), or turns to a foe with room round it, or waits in the second ring.
const SHARE_CAP = 3;

function share(b, x, y) {
  const G = A.G(), W = G.war;
  if (!W || !b.war || b.gate || b.wprop || b.cmdr) return false;
  const k = k2(x, y), h = A.occ.get(k), c = A.crowd.get(k), p = G.player;
  const hero = !G.dead && ((p.tx === x && p.ty === y) || (p.stepping && p.sfx === x && p.sfy === y));
  if (h && (!h.war || h.gate || h.wprop || h.cmdr || h.team !== b.team)) return false;
  if (hero && b.team !== 0) return false;
  if (!h && !hero && !(c && c.length)) return false;
  let n = (h ? 1 : 0) + (hero ? 1 : 0);
  if (c) for (const o of c) { if (o.team !== b.team) return false; n++; }
  return n < SHARE_CAP;
}

/** How many of b's side stand on (or are bound for) a tile; 99 when a foe holds it. */
function slotLoad(W, b, x, y) {
  const G = A.G(), k = k2(x, y), h = A.occ.get(k), c = A.crowd.get(k), p = G.player;
  let n = 0;
  if (h && h !== b) { if (!h.war || h.gate || h.wprop || h.team !== b.team) return 99; n++; }
  if (c) for (const o of c) if (o !== b) { if (o.team !== b.team) return 99; n++; }
  if (!G.dead && p.tx === x && p.ty === y) { if (b.team !== 0) return 99; n++; }
  const cl = W.claims && W.claims.get(k);
  if (cl) for (const o of cl) {
    if (o === b) continue;
    if (o.dead || !o.slot || o.slot[0] !== x || o.slot[1] !== y || !alive(o.slotFor)) { cl.delete(o); continue; }
    if (!(o.tx === x && o.ty === y)) n++;
  }
  return n;
}
function claim(W, b, at, t) {
  const G = A.G(), claims = W.claims || (W.claims = new Map());
  if (b.slot) { const old = claims.get(k2(b.slot[0], b.slot[1])); if (old) old.delete(b); }
  b.slot = at; b.slotFor = t; b.slotT = G.t + rnd(1.2, 2);
  if (at) { const k = k2(at[0], at[1]); let set = claims.get(k); if (!set) claims.set(k, set = new Set()); set.add(b); }
}
/** The tiles from which b reaches t (a gate: the row before it; a body: the ring round it). */
function slotTiles(W, b, t, reach) {
  const out = [];
  if (t.gate) {
    const y = b.team !== t.team ? t.y1 + 1 : t.y0 - 1;
    for (let x = t.x0 - 1; x <= t.x1 + 1; x++) { const d = gateDist(t, { tx: x, ty: y }); if (d <= reach) out.push([x, y, d]); }
    return out;
  }
  const R = Math.ceil(reach);
  for (let dx = -R; dx <= R; dx++)
    for (let dy = -R; dy <= R; dy++) {
      const d = Math.hypot(dx, dy);
      if (d >= 0.9 && d <= reach) out.push([t.tx + dx, t.ty + dy, d]);
    }
  return out;
}
/** A place round t within reach for a blade (kept a while once taken), or null when none has room. */
function meleeSlot(W, b, t, reach, keep = true) {
  const G = A.G(), cur = b.slot;
  if (keep && cur && b.slotFor === t && G.t < b.slotT) {
    const d = t.gate ? gateDist(t, { tx: cur[0], ty: cur[1] }) : Math.hypot(cur[0] - t.tx, cur[1] - t.ty);
    if (d <= reach && slotLoad(W, b, cur[0], cur[1]) < SHARE_CAP) return cur;
  }
  let best = null, bc = 1e9;
  for (const [x, y, d] of slotTiles(W, b, t, reach)) {
    if (!open(W, x, y, b.team) || (W.danger && W.danger.size && W.danger.has(dk(x, y)))) continue;
    const load = slotLoad(W, b, x, y);
    if (load >= SHARE_CAP) continue;
    const c = Math.abs(x - b.tx) + Math.abs(y - b.ty) + load * 2.2 + d * 0.15;
    if (c < bc) { bc = c; best = [x, y]; }
  }
  if (keep) claim(W, b, best, t);
  return best;
}
/** A foe near with room round it, for a blade whose own target is ringed full. */
function roomyFoe(W, b, r, not) {
  let best = null, bs = 1e9;
  for (const e of foesOf(W, b.team)) {
    if (e === not || e.gate || unseenHid(e) || (W.jaeng && inCamp(W, e)) || (b.only !== undefined && e.team !== b.only)) continue;
    const d = d2(b, e);
    if (d > r || unseen(W, b, e, d)) continue;
    const s = d + 0.8 * Math.min(4, e.engaged || 0) + (e.troop || e.cmdr ? 1 : 0);
    if (s < bs && meleeSlot(W, b, e, 1.5, false)) { bs = s; best = e; }
  }
  return best;
}
/** Where a blade goes for t: its place round t, else a place in the second ring (waiting a step
 * back for room rather than pushing round the first), else t's tile as before. */
function bladeDest(W, b, t, reach) {
  return meleeSlot(W, b, t, reach) || meleeSlot(W, b, t, reach + 1.3, false) || [t.tx, t.ty];
}

/** Standing on a shared tile a while: to a free tile beside (still in reach of its target). */
function spread(W, b, now = false) {
  const G = A.G();
  if (!now && G.t < (b.spreadT || 0)) return;
  b.spreadT = G.t + rnd(0.7, 1.3);
  const k = k2(b.tx, b.ty);
  const p = G.player, hero = !G.dead && p.tx === b.tx && p.ty === b.ty;
  if (!A.crowd.has(k) && !hero) return;
  const t = b.target && alive(b.target) ? b.target : null;
  const reach = t ? (W.raid || W.jaeng ? reachOf(b, t) : b.kit.range > 1 ? b.kit.range + 0.5 : 1.5) : 0;
  for (const [dx, dy] of [...DIR4].sort(() => Math.random() - 0.5)) {
    const x = b.tx + dx, y = b.ty + dy;
    if (!open(W, x, y, b.team) || !A.free(x, y) || (W.danger && W.danger.size && W.danger.has(dk(x, y)))) continue;
    if (t && (t.gate ? gateDist(t, { tx: x, ty: y }) : Math.hypot(x - t.tx, y - t.ty)) > reach) continue;
    b.dest = [x, y];
    return;
  }
}

/** Where on its tile a body stands: apart from the others sharing it (and off the hero's middle). */
function stackOff(W, b, dt) {
  const G = A.G(), k = k2(b.tx, b.ty), h = A.occ.get(k), c = A.crowd.get(k), p = G.player;
  const hero = !G.dead && p.tx === b.tx && p.ty === b.ty;
  const n = (h ? 1 : 0) + (c ? c.length : 0) + (hero ? 1 : 0);
  let tx = 0, ty = 0;
  if (n > 1) {
    const i = (hero ? 1 : 0) + (h === b ? 0 : c ? c.indexOf(b) + (h ? 1 : 0) : 0);
    const a = (b.team === 0 ? 0.4 : 3.5) + (i / n) * Math.PI * 2;
    tx = Math.cos(a) * 13;
    ty = Math.sin(a) * 6;
  }
  const r = Math.min(1, dt * 8);
  b.jx = (b.jx || 0) + (tx - (b.jx || 0)) * r;
  b.jy = (b.jy || 0) + (ty - (b.jy || 0)) * r;
}

/** How solid a body is drawn (메뉴 「겹친 캐릭터 투명도」): see-through over the hero, or on a tile it
 * shares and does not hold; the hero itself never. */
function overAlpha(W, b) {
  const G = A.G(), p = G.player;
  const v = A.settings().overlapAlpha, k = typeof v === 'number' && v > 0 && v <= 1 ? v : 0.5;
  if (k >= 1) return 1;
  if (!G.dead && Math.abs(b.x - p.x) < 26 && b.y >= p.y - 4 && b.y - p.y < 44) return k;
  const key = k2(b.tx, b.ty);
  if (A.crowd.has(key) && A.occ.get(key) !== b) return k;
  return 1;
}

// ---------------------------------------------------------------- thinking

function enemiesNear(W, b, r) {
  const out = [];
  for (const e of foesOf(W, b.team)) {
    if (e.gate) continue;
    if (W.jaeng && inCamp(W, e)) continue;
    const d = d2(b, e);
    if (d <= r && !(e.lurk > A.G().t && d > AMBUSH_SEE)) out.push([e, d]);
  }
  if (W.mobs) for (const e of W.mobs) { const d = d2(b, e); if (d <= r) out.push([e, d]); }
  return out;
}
/** The bodies of t's own side near t (a spread spell's victims round its target). A raid's
 * monsters have no team: they are side 1. Before, this asked for t's foes — the caster's own
 * side — and every spread spell of the war struck the caster's friends round its target. */
function packNear(W, t, r) {
  const out = [];
  for (const e of t.team !== undefined ? W.alive[t.team] : W.mobs || W.alive[1]) {
    if (e.gate) continue;
    const d = d2(t, e);
    if (d <= r) out.push([e, d]);
  }
  return out;
}
/**
 * A spread spell's blow, as 연's area spells strike: the struck and AOE_CAP-1 others' worth. Since a side's
 * fighters may share a tile (three to one), the same 1.5-tile spell found two and three times the bodies it
 * did and a side's deaths in a 현무전 rose from 4~25 to 36~67 a war (crowd A/B): the crowding's gain (more
 * of the crowd fighting) is kept, its price in one spell is not. 이펙트=판정: every one inside the drawn area is
 * struck (aoeAll), the others' worth shared among them (it was the nearest two struck, the rest left untouched).
 */
const AOE_CAP = 3;
// (a fighter's spell cast by the hero's code in a war or 「쟁」, aiCast: each other struck SPLASH of a blow, the
// whole cast AOE_BUDGET blows at most — the meant one and AOE_CAP-1 others' worth, as above)
const SPLASH = 0.6, AOE_BUDGET = 1 + SPLASH * (AOE_CAP - 1), RAID_CAST = 1.5;
/** Every foe within r of t (the whole drawn area), the struck first. */
function aoeAll(W, t, r) {
  if (t.team === undefined) return packNear(W, t, r);
  return packNear(W, t, r).sort((a, b) => (a[0] === t ? -1 : b[0] === t ? 1 : a[1] - b[1]));
}
/**
 * A spread spell seen coming (a 필살기's wind-up, a 광역 drawn on a crowd): those of t's side sharing
 * a tile round it step apart, each by its own knack (b.dodge, as for a raid's red floor), and the
 * healers near hear of the burst (W.burst) and mend the group sooner.
 */
function scatterFrom(W, t, r) {
  const G = A.G();
  if (t.team === undefined || t.hero) return;
  for (const [e] of packNear(W, t, r + 0.5)) {
    if (e.hero || e.cmdr || e.troop || e.dead) continue;
    const k = k2(e.tx, e.ty);
    if (!A.crowd.has(k) && !(A.occ.get(k) === e && A.crowd.has(k))) continue;
    if (Math.random() > (e.dodge || 0.6)) continue;
    e.spreadT = 0;
    e.scatterT = G.t + 0.8;
    spread(W, e, true);
  }
}
function burstAt(W, t) {
  if (t.team === undefined) return;
  const B = W.burst || (W.burst = []);
  B[t.team] = { t: A.G().t, x: t.tx, y: t.ty };
}
function nearest(W, b, r) {
  let best = null, bd = r;
  for (const e of foesOf(W, b.team)) {
    if (e.gate) continue;
    if (unseenHid(e)) continue;
    if (W.jaeng && inCamp(W, e)) continue;
    const d = d2(b, e);
    if (d <= bd && !unseen(W, b, e, d)) { bd = d; best = e; }
  }
  if (W.mobs) for (const e of W.mobs) { const d = d2(b, e); if (d <= bd && !(e.guardT > A.G().t)) { bd = d; best = e; } }
  return best;
}
/**
 * Whom a fighter of the war turns on: the near first, but a tank draws the blows (it stands to be
 * struck), one that many already strike is passed over for another, and the hero is one of its
 * guild, not the one the whole field runs at. Before, every foe took the nearest, and a foe the
 * hero's spells touched turned on the hero (one in seven of its hits, and a hero's spells hit
 * many times a second): the whole enemy guild ended up on the hero.
 */
function pickFoe(W, b, r) {
  const G = A.G();
  let best = null, bs = 1e9;
  for (const e of foesOf(W, b.team)) {
    if (e.gate) continue;
    if (unseenHid(e)) continue;
    if (b.only !== undefined && e.team !== b.only) continue; // 「쟁」: a squad sent on one guild
    if (W.jaeng && inCamp(W, e)) continue; // (none is struck in its own camp)
    const d = d2(b, e);
    if (d > r || unseen(W, b, e, d)) continue;
    const s = d - (e.role === 'tank' ? 1.6 : 0) + 0.8 * Math.min(4, e.engaged || 0) + (e.hero ? 0.8 - 0.8 * heroMark(W) - (W.jaeng && b.only === 0 ? 2 : 0) : 0) + (e.troop || e.cmdr ? 1 : 0) + (inDuel(W, b, e) ? 6 : 0);
    if (s < bs) { bs = s; best = e; }
  }
  // 「쟁」: a servant in the way is struck too (the boss is the 보스 order's, not a passing blow's).
  if (W.mobs && b.only === undefined) for (const e of W.mobs) {
    if (e.kind === 'boss') continue;
    const d = d2(b, e);
    if (d > r) continue;
    const s = d + 1.5;
    if (s < bs) { bs = s; best = e; }
  }
  return best;
}
/**
 * How much the other guilds go for the hero (대항전·「쟁」): by its 전투력 over its guild's middle (W.heroPw against the
 * guild's, applyPersonas) — a hero at the middle as before (0 → still a little after the others), one well over it a
 * mark everyone goes for (up to 2.5), as a server's 랭커 is. A strong hero stood among the fighters struck as one of
 * them and never fell (0 deaths in every war at 7.7만, balance runs).
 */
function heroMark(W) {
  if (W.markK === undefined) W.markK = clamp(2.2 * ((W.heroPw || 1) / Math.max(0.5, W.heroSideK || 1) - 1), 0, 2.5);
  if (!W.jaeng) return W.markK;
  // 「쟁」 (2026-11-28): the hero is its guild's caller (the 보스·견제·봉인 keys), its name over its head — the other guilds'
  // blades go for it whatever its 전투력 (a floor, JAENG.heroMark), the more while its guild leads. By 전투력 alone the mark
  // was 0 for any hero at its guild's middle, and the hero fell 0~1 times a 「쟁」 (balance runs).
  const lead = W.score && W.score[0] >= Math.max(...W.score.filter((x, i) => i !== 0)) && W.t > JAENG.bossAt ? JAENG.heroLead : 0;
  return Math.max(W.markK, JAENG.heroMark) + lead;
}
function hpk(b) { return b.hp / b.maxHp; }
function alive(t) { return t && !t.dead && t.hp > 0 && !(t.gate && A.G().war.gateDown); }
/** Gone 투명: the hero under its buff, or a fighter of the 도적 in its 잠행 — not to be chosen. */
function unseenHid(e) { const G = A.G(); return e.hidden > G.t || (e.hero && G.buffs.stealth > G.t); }

function think(W, b) {
  const G = A.G();
  if (b.cmdr) return thinkCmdr(W, b);
  if (b.troop) return thinkTroop(W, b);
  const sq = b.squad, order = myOrder(W, b);
  const k = hpk(b);
  // Taunted: the taunter is the target for a while.
  if (b.taunt && b.taunt.until > G.t && alive(b.taunt.by)) b.target = b.taunt.by;
  // 전술 후퇴: falling back with the hero's call.
  if (b.team === 0 && tacThink(W, b)) return;
  // The timid: tucked behind a wall or in a corner while the odds are bad (hideThink).
  if (hideThink(W, b, order)) return;
  // Low: back to a healer or the camp; back in once mended.
  if (b.state !== 'retreat' && k < retreatAt(b, 0.2, 0.3) && !b.carry) {
    b.state = 'retreat';
    chat(W, b, 'low', ['피 없어요 빠질게요!', '힐 좀요!!', '잠깐 빠짐', '저 죽어요!'], { every: 10, p: 0.5, emo: Math.random() < 0.3 ? 'dizzy' : null });
  }
  if (b.state === 'retreat') {
    if (k > 0.75) { b.state = 'go'; b.retreatTo = undefined; }
    else {
      // To a healer near (the same one until mended) or the camp: chosen once, not anew each
      // thought (the two in turns kept a hurt fighter stepping on the spot).
      if (b.retreatTo === undefined || (b.retreatTo && !alive(b.retreatTo))) {
        const healer = W.alive[b.team].find(m => m.role === 'healer' && !m.hero && !m.troop && d2(m, b) < 10 && m !== b);
        b.retreatTo = healer && Math.random() < 0.7 ? healer : null;
      }
      const sp = W.teams[b.team].spawn;
      b.dest = b.retreatTo ? [b.retreatTo.tx, b.retreatTo.ty] : sp;
      const t = nearest(W, b, b.kit.range + 0.5);
      if (t) act(W, b, t);
      return;
    }
  }
  // 분대 전술: lying in wait (ambushThink), or falling back to gather (재집결: only what is in reach is struck).
  if (order.kind === 'ambush' && sq.tac && sq.tac.kind === 'ambush' && !sq.tac.sprung && ambushThink(W, b, order)) return;
  if (order.kind === 'rally') {
    if (b.role === 'healer') return thinkHealer(W, b, order);
    const t = nearest(W, b, b.kit.range + 0.5);
    if (t) act(W, b, t);
    b.dest = formation(W, b, order);
    return;
  }
  // The squad's focus: the leader picks, the members follow.
  if (b.leader) leaderPick(W, b, order);
  if (b.role === 'healer') return thinkHealer(W, b, order);
  // Following the hero and well behind it: on to it, striking only what is in reach on the way.
  if (order.kind === 'follow' && Math.abs(b.tx - order.x) + Math.abs(b.ty - order.y) > 5 && !b.carry) {
    const t = nearest(W, b, b.kit.range + 0.5);
    if (t) act(W, b, t);
    b.dest = [order.x, order.y];
    return;
  }
  if (b.role === 'support') supportBuffs(W, b);
  // Jobs: a free supporter (or any idle one near) carries a crate; the scout zones are taken.
  if (b.carry) { b.dest = dropPoint(W, b.team); const t = nearest(W, b, b.kit.range + 0.5); if (t) act(W, b, t); return; }
  if (b.role === 'support' && !sq.target) {
    const c = W.crates.find(c => !c.by && Math.abs(c.x - b.tx) + Math.abs(c.y - b.ty) < 14);
    if (c && !nearest(W, b, 4)) { b.dest = [c.x, c.y]; return; }
  }
  // Its own play over the field: a hunter's prey, a diver's healer, the cautious one's retreat.
  if (soloThink(W, b, order)) { gateHold(W, b, order); return; }
  // A target: a peel for the healers first (tanks), the squad's focus, else the nearest.
  let t = null;
  if (b.role === 'tank') {
    const mate = sq.members.find(m => m.role === 'healer' && !m.dead && m.lastHitBy && G.t - m.lastHitT < 2 && alive(m.lastHitBy));
    if (mate && d2(mate.lastHitBy, b) < 8) {
      t = mate.lastHitBy;
      if (b.cd.c <= 0) { taunt(W, b); if (Math.random() < 0.5) talk(W, b, ['힐러 건드리지 마라!', '이리 와!', '내가 막는다!']); }
    }
  }
  // An assault: the objective first once it is near (the 진영대장 does not wait its turn).
  let why = t ? 'peel' : '';
  if (!t && order.kind === 'assault' && alive(order.obj) && d2(b, order.obj) < 12 && (b.role !== 'tank' || !nearest(W, b, 2))) { t = order.obj; why = 'obj'; }
  // 공성: the squads sent to the gate strike it once they stand before it (their blades and casters; the tank and the
  // healer keep the defenders off them). Struck only when it was the one meant (aiCast), it was left standing while
  // the crowd before it fought on: the gate held to the end in every war (balance runs).
  if (!t && order.kind === 'gate' && (b.role === 'dps' || b.role === 'support') && alive(order.obj) && order.obj.gate && gateDist(order.obj, b) <= Math.max(2, b.kit.range) + 2) { t = order.obj; why = 'obj'; }
  // 전술 집중: the hero's called foe, while the call lasts.
  if (!t) { const f = tacFocus(W, b); if (f) { t = f; why = 'focus'; } }
  // Taunted: the taunter, while the taunt lasts.
  if (!t && b.taunt && b.taunt.until > G.t && alive(b.taunt.by) && d2(b, b.taunt.by) < 9) { t = b.taunt.by; why = 'taunt'; }
  // A target is held a few seconds, then looked at again.
  if (!t && b.target && alive(b.target) && !unseenHid(b.target) && d2(b, b.target) < 9 && G.t < (b.retargetT || 0)) { t = b.target; why = b.tWhy || 'held'; }
  if (!t && sq.target && alive(sq.target) && !unseenHid(sq.target) && d2(b, sq.target) < 9) { t = sq.target; why = 'squad'; }
  if (!t) { t = pickFoe(W, b, b.role === 'tank' ? 6 : 7); why = 'pick'; }
  // The objective's own target: the gate, the commander, the cart's defenders.
  if (!t && order.obj && alive(order.obj) && order.obj.team !== b.team) { t = order.obj; why = 'order'; }
  b.tWhy = why;
  if (t !== b.target) b.retargetT = G.t + rnd(2, 3.5);
  b.target = t;
  if (t) {
    const dist = t.gate ? gateDist(t, b) : d2(b, t);
    const range = b.kit.range;
    if (b.role === 'tank' && b.cd.c <= 0 && enemiesNear(W, b, 2).length >= 2) taunt(W, b);
    if (range > 1) {
      // Casters keep three to four tiles off, and back away from a blade that comes close.
      if (dist < 2.2 && !t.gate && !t.cmdr) {
        const ax = Math.sign(b.tx - t.tx) || pick([-1, 1]), ay = Math.sign(b.ty - t.ty) || pick([-1, 1]);
        b.dest = [clamp(b.tx + ax * 3, 0, W.map.cols - 1), clamp(b.ty + ay * 2, 0, W.map.rows - 1)];
      } else if (dist > range) b.dest = [t.tx, t.ty];
      else b.dest = null;
    } else if (dist <= 1.5) b.dest = null; // (in reach, the corners too: it stepped on for the side tile while it struck)
    else if (t.gate) b.dest = meleeSlot(W, b, t, 1.5) || gateFront(W, b);
    else {
      // A place round the target; ringed full, a foe near with room (not a peel, a taunt, an objective).
      let s = meleeSlot(W, b, t, 1.5);
      if (!s && (why === 'pick' || why === 'held' || why === 'squad')) {
        const alt = roomyFoe(W, b, b.role === 'tank' ? 6 : 7, t);
        if (alt) { t = b.target = alt; b.tWhy = 'room'; b.retargetT = G.t + rnd(2, 3.5); s = meleeSlot(W, b, t, 1.5); }
      }
      b.dest = s || bladeDest(W, b, t, 1.5);
    }
    // The timid keep to the edge of a fight: a blade goes in only on a foe its friends are on
    // already (else it waits a few tiles back), a caster strikes from its full reach.
    if (b.timid && !t.gate && !t.cmdr && W.phase !== 'final' && b.role !== 'healer') {
      const ax = Math.sign(b.tx - t.tx), ay = Math.sign(b.ty - t.ty);
      if (range <= 1 && !(t.engaged > 0) && dist > 1.5 && t.target !== b) b.dest = dist > 4 ? [t.tx + ax * 3, t.ty + ay * 3] : null;
      else if (range > 1 && dist < range - 1 && !t.gate) b.dest = [clamp(b.tx + (ax || pick([-1, 1])) * 2, 0, W.map.cols - 1), b.ty + ay];
    }
    if (dist <= range + 0.5) act(W, b, t);
    // A fighter does not chase far from its order.
    // (One that chases a kill goes further, and lags behind its squad.)
    if (Math.abs(b.tx - order.x) + Math.abs(b.ty - order.y) > (b.greedy && hpk(t) < 0.4 ? 20 : 14) && !t.gate && !t.cmdr) b.dest = [order.x, order.y];
    gateHold(W, b, order);
    return;
  }
  // Nothing to fight: to the order's spot, in a loose formation by role.
  b.dest = formation(W, b, order);
  gateHold(W, b, order);
}
/**
 * 현무전, the defence while its gate stands. Out on the field it came one by one from its camp far behind into the whole
 * attack (1 kill to 300 in a war); in the gate's own passage one side or the other was cut down in the crowd there
 * (125 : 0 one war, 19 : 86 the next): balance runs. So (gate rule, 2026-11-28) each by its part, as 연's 수성:
 * - the close-in (탱커, 근접 딜러) go out by the 쪽문 and meet the siege before the gate, kept within a few tiles of it;
 * - the casters and archers stay behind the gate and strike over it;
 * - the healer goes with the close-in (the nearest of them outside), else stays in with the casters.
 * The hero's 지휘: 돌격 (출격) takes everyone out, 수비 keeps everyone in, 우회 (양옆) is the close-in's way as above.
 */
function gatePart(b) {
  if (b.role === 'healer') return 'healer';
  return b.role === 'tank' || (b.kit && b.kit.range <= 1) ? 'melee' : 'ranged';
}
function gateHold(W, b, order) {
  if (W.mode !== 'siege' || W.gateDown || b.team === W.attacker || b.cmdr || b.troop) return;
  const cmd = b.team === 0 && W.cmds && W.cmds.cur ? W.cmds.cur.kind : null;
  if (cmd === 'charge' || (order && order.kind === 'follow')) return; // (out with the hero or the 출격, by the 쪽문)
  if (order && order.kind !== 'hold' && order.kind !== 'defend' && order.kind !== 'patrol') return;
  const g = W.gate, part = gatePart(b);
  let out = part === 'melee' && cmd !== 'hold';
  let with_ = null;
  if (part === 'healer' && cmd !== 'hold') {
    // The nearest of its side's close-in outside the gate (its own squad's first).
    let bd = 1e9;
    for (const m of W.alive[b.team]) {
      if (m === b || m.hero || m.gate || m.cmdr || m.troop || gatePart(m) !== 'melee' || m.ty <= g.y1) continue;
      const d = d2(m, b) - (m.squad === b.squad ? 6 : 0);
      if (d < bd) { bd = d; with_ = m; }
    }
    out = !!with_;
  }
  b.gatePart = out ? 'out' : 'in';
  if (!out) {
    if (b.dest && b.dest[1] >= g.y0) b.dest = [b.dest[0], g.y0 - 1];
    return;
  }
  if (with_) {
    // The healer a step behind the one it follows (toward the wall), unless it is mending or fleeing in reach already.
    if ((b.dest && b.dest[1] <= g.y1) || b.ty <= g.y1 || d2(b, with_) > 3) b.dest = snap(W, with_.tx + (b.id % 3 - 1), Math.max(g.y1 + 1, with_.ty - 1));
    return;
  }
  // The close-in: out together, not one by one. Inside, it waits at its 쪽문's mouth until two more of its side's close-in
  // stand there or are out already (alone through the 쪽문 each met the whole siege: 14 kills to 310 in a war).
  // Out, it holds the ground before the gate, within the casters' reach over it, never far off.
  if (!b.dest && b.ty > g.y1) return;
  const ps = W.def.posterns || [], side = b.id % 2 ? 0 : ps.length - 1, px = ps.length ? ps[side][0] : g.tx;
  if (b.ty <= g.y1) {
    const outN = W.alive[b.team].filter(m => m.ty > g.y1 && !m.hero && !m.cmdr && !m.troop && gatePart(m) === 'melee').length;
    const atMouth = W.alive[b.team].filter(m => m !== b && !m.hero && gatePart(m) === 'melee' && Math.abs(m.tx - px) <= 2 && m.ty <= g.y1 && m.ty >= g.y0 - 2).length;
    if (outN < 2 && atMouth < 2 && b.state !== 'retreat') { b.dest = snap(W, px + (b.id % 3 - 1), g.y0 + (b.id % 2)); b.gatePart = 'wait'; return; }
  }
  if (!b.dest || b.dest[1] < g.y0) {
    const k = b.id % 3;
    b.dest = snap(W, px < g.tx ? g.x0 - 1 - k : g.x1 + 1 + k, g.y1 + 1 + (b.id % 2));
  } else b.dest = [clamp(b.dest[0], g.x0 - 7, g.x1 + 7), clamp(b.dest[1], g.y1 + 1, g.y1 + 4)];
}

function gateDist(g, b) {
  const dx = b.tx < g.x0 ? g.x0 - b.tx : b.tx > g.x1 ? b.tx - g.x1 : 0;
  const dy = b.ty < g.y0 ? g.y0 - b.ty : b.ty > g.y1 ? b.ty - g.y1 : 0;
  return Math.hypot(dx, dy);
}
function gateFront(W, b) {
  const g = W.gate, out = b.team !== g.team;
  const x = clamp(b.tx, g.x0, g.x1);
  return [x, out ? g.y1 + 1 : g.y0 - 1];
}

function formation(W, b, order) {
  // A crowd, not a file: each fighter keeps its own spot in a loose blob round the order, the
  // tanks at its front, the healers at its back.
  if (b.fjx === undefined) { const a = Math.random() * Math.PI * 2, r = 0.8 + Math.random() * 2.6; b.fjx = Math.round(Math.cos(a) * r); b.fjy = Math.round(Math.sin(a) * r * 0.8); }
  // 분대 이동 (2026-11-28): on the way to a far order the squad goes as one — its members a couple of steps behind its
  // leader, the leader waiting a moment (2 s in 6 at most) for two or more left behind. (On the wider fields each went
  // its own way there and came in one by one.)
  const ld = b.squad && b.squad.leader;
  if (ld && !ld.hero && !ld.dead && !b.troop && !b.cmdr && order.kind !== 'follow' && order.kind !== 'ambush') {
    const G = A.G(), farL = Math.abs(ld.tx - order.x) + Math.abs(ld.ty - order.y);
    if (ld !== b && farL > 9 && d2(b, ld) < 14) {
      const sx = Math.sign(b.tx - ld.tx) || Math.sign(b.fjx) || 1, sy = Math.sign(b.ty - ld.ty) || Math.sign(b.fjy);
      return snap(W, ld.tx + sx * 2 + Math.round(b.fjx / 2), ld.ty + sy * 2 + Math.round(b.fjy / 2));
    }
    if (ld === b && farL > 9) {
      if (G.t > (b.waitUntil || 0) + 4 && b.squad.members.filter(m => m !== b && !m.hero && !m.dead && d2(m, b) > 7 && d2(m, b) < 30).length >= 2) { b.waitUntil = G.t + 2; beh(W, 'wait'); }
      if (G.t < (b.waitUntil || 0)) return [b.tx, b.ty];
    }
  }
  const toward = order.face || [0, 0];
  let ox = 0, oy = 0;
  if (b.role === 'tank') { ox = toward[0] * 2; oy = toward[1] * 2; }
  else if (b.role === 'healer') { ox = -toward[0] * 2; oy = -toward[1] * 2; }
  return snap(W, order.x + ox + b.fjx, order.y + oy + b.fjy);
}

function leaderPick(W, b, order) {
  const G = A.G(), sq = b.squad;
  if (G.t < sq.focusT) return;
  sq.focusT = G.t + 1.5;
  const near = enemiesNear(W, b, 8);
  if (!near.length) { sq.target = null; return; }
  // Healers and casters first, the weakest first, the near first.
  let best = null, bs = -1e9;
  for (const [e, d] of near) {
    if (b.only !== undefined && e.team !== b.only) continue;
    const s = (e.role === 'healer' ? 3 : e.cls && (e.cls.id === 'mage' || e.cls.id === 'archer') ? 1.5 : 0) + (1 - hpk(e)) * 4 - d * 0.6
      + (e.carry ? 3 : 0) + (e.hero ? heroMark(W) - 1 + (W.jaeng && b.only === 0 ? 2 : 0) : 0) - (e.cmdr ? 2 : 0) - (e.troop ? 1.5 : 0) - 0.4 * Math.min(5, e.engaged || 0);
    if (s > bs) { bs = s; best = e; }
  }
  if (best !== sq.target) {
    sq.target = best;
    // Called in the chat by a leader near the hero, now and then (five squads calling every focus
    // filled the four lines of the chat).
    if (best && b.team === 0 && G.t - sq.said > 7 && Math.random() < 0.6 && d2(b, W.hero) < 14 && G.t - (W.chatT || -99) >= 4 && G.t - ((W.chatK || {}).focus || -99) >= 10) {
      sq.said = G.t;
      W.chatT = G.t;
      (W.chatK = W.chatK || {}).focus = G.t;
      const who = best.role === 'healer' ? '적 힐러' : best.carry ? '보급 든 놈' : best.hero ? best.name : best.cls ? `${best.cls.name} ${best.name}` : best.name;
      A.say(`[분대장] ${b.name}: ${who}부터 잡아요!`, 'party');
    }
  }
}

function thinkHealer(W, b, order) {
  const G = A.G(), sq = b.squad;
  // Dived: back off from what strikes it, and call for a peel.
  const recent = b.dmgIn.filter(x => G.t - x[0] < 2).reduce((a, x) => a + x[1], 0);
  const close = nearest(W, b, 2);
  if (close || recent > b.maxHp * 0.2) {
    const from = close || b.lastHitBy || nearest(W, b, 6);
    if (from) {
      const ax = Math.sign(b.tx - from.tx) || pick([-1, 1]), ay = Math.sign(b.ty - from.ty) || pick([-1, 1]);
      b.dest = snap(W, b.tx + ax * 3, b.ty + ay * 2);
    }
    if (G.t - (b.calledT || -9) > 6) { b.calledT = G.t; talk(W, b, ['힐러 물렸어요!', '탱님 저 좀요!', '뒤에 붙었어요!']); }
  }
  // Revive a fallen mate close by.
  const ghost = b.cd.r <= 0 && W.ghosts.find(g => g.b.team === b.team && !g.b.cmdr && !g.b.hero && d2(g, b) < (W.raid ? 7 : 5) && A.G().t - g.t < (W.raid ? 12 : 6));
  if (ghost) { revive(W, b, ghost); return; }
  // The hero raised, a buff on a mate, mana (see partyCasts).
  if (!close && partyCasts(W, b)) return;
  // Whom to mend: the most in need near, the tank first while it is being struck (the hero too,
  // as any of the guild). Before, the tank only came first by a twentieth of its life, and the
  // healers stood by their squad's leader — in the hero's squad, with the hero as its tank, the
  // healer itself: it walked out, saw a foe, stepped back three tiles from it, again and again,
  // at the camp, and the hero-tank was never in its reach.
  let low = null, lk = b.play === 'healbot' ? 0.97 : 0.92;
  for (const m of W.alive[b.team]) {
    if (m.gate || m.cmdr) continue;
    const d = d2(m, b);
    if (d > 9) continue;
    const struck = G.t - (m.lastHitT || -9) < 2.5;
    const k = hpk(m) - (m.squad === sq ? 0.04 : 0) - (m.role === 'tank' ? (struck ? 0.2 : 0.06) : 0) - (struck ? 0.04 : 0) + (m.troop ? 0.15 : 0) + (d > 7 ? 0.05 : 0) - (m.hero ? (b.pocket ? 0.25 : 0.04) : 0);
    if (k < lk) { lk = k; low = m; }
  }
  const hurt = W.alive[b.team].filter(m => !m.gate && d2(m, b) < 5 && hpk(m) < 0.7).length;
  // A spread spell just fell on the crowd near (W.burst): the group's mend comes at two hurt, and
  // sooner again (a crowd that stands closer is struck together, so it is mended together).
  const bu = W.burst && W.burst[b.team], burst = bu && G.t - bu.t < 1.8 && Math.hypot(bu.x - b.tx, bu.y - b.ty) < 6;
  if ((hurt >= 3 || (burst && hurt >= 2)) && b.cd.d <= 0 && b.mp >= 0.1) {
    b.cd.d = burst ? 8 : 12;
    tally(b, 'heal');
    b.mp -= 0.12;
    const gid = b.kit.group || b.kit.heal;
    // A field of light on the ground under the squad (연's 선인의영역), the heal falling on all in it.
    castFx(W, b, SK.p_realm ? 'p_realm' : gid, b);
    shout(W, b, gid ? SK[gid].name : '천공의희원');
    for (const m of W.alive[b.team]) if (!m.gate && !m.cmdr && d2(m, b) < 5) healBody(W, b, m, m.maxHp * 0.12);
    pose(b, 'cast');
  } else if (low && b.cd.a <= 0 && d2(low, b) <= 7) {
    const hcd = healWait(b);
    b.cd.a = b.mp < 0.1 ? hcd * 1.4 : hcd;
    tally(b, 'heal');
    b.mp = Math.max(0, b.mp - 0.05 * hcd / 3.2);
    // Its class's own 기원 (누리의 기원's grade by its level, a poet's 천공·생명의 기원 …).
    const hid = b.party && b.party.heals.length ? pick(b.party.heals) : b.kit.heal || 'c_heal';
    const n = low.maxHp * (0.08 + 0.02 * b.pw) * hcd / 3.2;
    A.addShot(b, low, { color: '#58e868', glow: '#b8ffb0', size: 4, speed: 420, onHit: () => { healBody(W, b, low, n); if (low.hero && b.team === 0 && !A.G().dead) heroMended(W, b, hid); } });
    if (onScreen(b)) {
      const d = SK[hid];
      const fx = d && d.fxs ? d.fxs[Math.min(7, Math.floor(b.lv / 6))] : d && d.fx;
      if (fx && !low.hero && healFxOk() && aiCast(W, b, SK[hid] ? hid : 'c_heal', { by: low, on: low, lv: Math.min(8, 1 + Math.floor(b.lv / 6)) })) cue(b, 0.6);
      if (Math.random() < 0.25) shout(W, b, d ? (d.names ? d.names[Math.min(7, Math.floor(b.lv / 6))] : d.name) : '기원');
      sound(W, b, 'skill_c_heal', 'heal');
    }
    pose(b, 'cast');
  } else if (b.cd.b <= 0) {
    // 보호: the squad near takes less for a while.
    b.cd.b = 14;
    tally(b, 'buff');
    for (const m of W.alive[b.team]) if (!m.gate && d2(m, b) < 4) guard(W, m, 5);
    shout(W, b, '보호');
    pose(b, 'cast');
  } else {
    const t = nearest(W, b, 5);
    if (t && b.cd.e <= 0) act(W, b, t);
  }
  // Stand two tiles behind the tank it keeps (its squad's, the hero when the hero is that tank),
  // on the far side from the tank's nearest foe; walk up to one it must mend but cannot reach.
  if (!close) {
    const anchor = healerAnchor(W, b, sq, order);
    let at;
    if (low && d2(low, b) > 7) at = [low.tx, low.ty];
    else if (anchor) {
      const foe = nearest(W, anchor, 8);
      if (foe) {
        const dx = anchor.tx - foe.tx, dy = anchor.ty - foe.ty, n = Math.hypot(dx, dy) || 1;
        at = [Math.round(anchor.tx + dx / n * 2.2), Math.round(anchor.ty + dy / n * 2.2)];
      } else at = d2(anchor, order) < 6 ? formation(W, b, order) : [anchor.tx + (b.fjx || 0), anchor.ty + 1];
    } else at = formation(W, b, order);
    const [sx, sy] = snap(W, at[0], at[1]);
    b.dest = Math.abs(sx - b.tx) + Math.abs(sy - b.ty) <= 1 ? null : [sx, sy];
    // 현무전's defence: with the close-in outside the gate, or behind it with the casters (gateHold).
    gateHold(W, b, order);
  }
}

/** The fighter a healer keeps: its squad's tank (the hero, when the hero is that tank), else the
 * guild's tank nearest its squad's order, else a mate of its squad. */
function healerAnchor(W, b, sq, order) {
  const G = A.G();
  if ((b.pocket || order.kind === 'follow') && !G.dead) return W.hero;
  let best = null, bd = 1e9;
  for (const m of W.alive[b.team]) {
    if (m.role !== 'tank' || m.cmdr || m.troop || m.gate || m === b) continue;
    if (m.squad === sq) return m;
    const d = Math.hypot(m.tx - order.x, m.ty - order.y);
    if (d < bd && d < 10) { bd = d; best = m; }
  }
  return best || sq.members.find(m => m !== b && m.role !== 'healer' && (m.hero ? !G.dead : !m.dead)) || null;
}

/** A raid's healer, as it was before the war's healers were changed (the raids keep their own tuning). */
function thinkHealerRaid(W, b, order) {
  const G = A.G(), sq = b.squad;
  // Dived: back off from what strikes it, and call for a peel.
  const recent = b.dmgIn.filter(x => G.t - x[0] < 2).reduce((a, x) => a + x[1], 0);
  const close = nearest(W, b, 2);
  if (close || recent > b.maxHp * 0.2) {
    const from = close || b.lastHitBy || nearest(W, b, 6);
    if (from) {
      const ax = Math.sign(b.tx - from.tx) || pick([-1, 1]), ay = Math.sign(b.ty - from.ty) || pick([-1, 1]);
      b.dest = snap(W, b.tx + ax * 3, b.ty + ay * 2);
    }
    if (G.t - (b.calledT || -9) > 6) { b.calledT = G.t; talk(W, b, ['힐러 물렸어요!', '탱님 저 좀요!', '뒤에 붙었어요!']); }
  }
  // Revive a fallen mate close by.
  const ghost = b.cd.r <= 0 && W.ghosts.find(g => g.b.team === b.team && !g.b.cmdr && !g.b.hero && d2(g, b) < (W.raid ? 7 : 5) && A.G().t - g.t < (W.raid ? 12 : 6));
  if (ghost) { revive(W, b, ghost); return; }
  // The hero raised, a buff on a mate, mana (see partyCasts).
  if (!close && partyCasts(W, b)) return;
  // The lowest of the near allies (the hero too).
  let low = null, lk = b.play === 'healbot' ? 0.93 : 0.85;
  for (const m of W.alive[b.team]) {
    if (m.gate || m.cmdr || d2(m, b) > (m.hero ? 8.5 : 7)) continue;
    const k = hpk(m) - (m.squad === sq ? 0.05 : 0) - (m.role === 'tank' ? 0.05 : 0);
    if (k < lk) { lk = k; low = m; }
  }
  const hurt = W.alive[b.team].filter(m => !m.gate && d2(m, b) < 5 && hpk(m) < 0.7).length;
  // A spread spell just fell on the crowd near (W.burst): the group's mend comes at two hurt, and
  // sooner again (a crowd that stands closer is struck together, so it is mended together).
  const bu = W.burst && W.burst[b.team], burst = bu && G.t - bu.t < 1.8 && Math.hypot(bu.x - b.tx, bu.y - b.ty) < 6;
  if ((hurt >= 3 || (burst && hurt >= 2)) && b.cd.d <= 0 && b.mp >= 0.1) {
    b.cd.d = burst ? 8 : 12;
    tally(b, 'heal');
    b.mp -= 0.12;
    const gid = b.kit.group || b.kit.heal;
    // A field of light on the ground under the squad (연's 선인의영역), the heal falling on all in it.
    castFx(W, b, SK.p_realm ? 'p_realm' : gid, b);
    shout(W, b, gid ? SK[gid].name : '천공의희원');
    for (const m of W.alive[b.team]) if (!m.gate && !m.cmdr && d2(m, b) < 5) healBody(W, b, m, m.maxHp * 0.12);
    pose(b, 'cast');
  } else if (low && b.cd.a <= 0) {
    const hcd = healWait(b);
    b.cd.a = b.mp < 0.1 ? hcd * 1.4 : hcd;
    tally(b, 'heal');
    b.mp = Math.max(0, b.mp - 0.05 * hcd / 3.2);
    // Its class's own 기원 (누리의 기원's grade by its level, a poet's 천공·생명의 기원 …).
    const hid = b.party && b.party.heals.length ? pick(b.party.heals) : b.kit.heal || 'c_heal';
    const n = low.maxHp * (0.08 + 0.02 * b.pw) * hcd / 3.2;
    A.addShot(b, low, { color: '#58e868', glow: '#b8ffb0', size: 4, speed: 420, onHit: () => { healBody(W, b, low, n); if (low.hero && b.team === 0 && !A.G().dead) heroMended(W, b, hid); } });
    if (onScreen(b)) {
      const d = SK[hid];
      const fx = d && d.fxs ? d.fxs[Math.min(7, Math.floor(b.lv / 6))] : d && d.fx;
      if (fx && !low.hero && healFxOk() && aiCast(W, b, SK[hid] ? hid : 'c_heal', { by: low, on: low, lv: Math.min(8, 1 + Math.floor(b.lv / 6)) })) cue(b, 0.6);
      if (Math.random() < 0.25) shout(W, b, d ? (d.names ? d.names[Math.min(7, Math.floor(b.lv / 6))] : d.name) : '기원');
      sound(W, b, 'skill_c_heal', 'heal');
    }
    pose(b, 'cast');
  } else if (b.cd.b <= 0) {
    // 보호: the squad near takes less for a while.
    b.cd.b = 14;
    tally(b, 'buff');
    for (const m of W.alive[b.team]) if (!m.gate && d2(m, b) < 4) guard(W, m, 5);
    shout(W, b, '보호');
    pose(b, 'cast');
  } else {
    const t = nearest(W, b, 5);
    if (t && b.cd.e <= 0) act(W, b, t);
  }
  // Stand behind the squad's front, three tiles back from the nearest foe (behind the hero when
  // it follows the hero).
  if (!b.dest || Math.random() < 0.3) {
    const front = order.kind === 'follow' && !G.dead ? W.hero : sq.members.find(m => m.role === 'tank' && !m.dead) || sq.leader;
    const foe = nearest(W, b, 9);
    let at = front && !front.dead ? [front.tx, front.ty] : [order.x, order.y];
    if (foe) {
      const ax = Math.sign(at[0] - foe.tx), ay = Math.sign(at[1] - foe.ty);
      at = [at[0] + ax * 3, at[1] + ay * 3];
    } else at = formation(W, b, order);
    if (!close) b.dest = snap(W, at[0], at[1]);
  }
}

function supportBuffs(W, b) {
  const G = A.G();
  if (partyCasts(W, b)) return;
  if (b.cd.b <= 0) {
    const mates = W.alive[b.team].filter(m => !m.gate && d2(m, b) < 4);
    if (mates.length >= 2 && nearest(W, b, 7)) {
      b.cd.b = 13;
      tally(b, 'buff');
      for (const m of mates) guard(W, m, 5);
      shout(W, b, pick(['보호', '무장', '의지의 외침']));
      // 차폐's ground ward round the supporter: the squad within takes less.
      castFx(W, b, SK.p_barrier ? 'p_barrier' : null, b);
      credit(b, 'obj', 4);
      pose(b, 'cast');
    }
  }
  if (b.cd.c <= 0) {
    const t = nearest(W, b, 6);
    if (t) {
      b.cd.c = 9;
      tally(b, 'aoe');
      const ids = b.kit.curse || 'm_curse';
      for (const [e] of packNear(W, t, 1.5)) { e.curse = Math.max(e.curse, 4); if (Math.random() < 0.35) e.slow = Math.max(e.slow, 2); }
      castFx(W, b, ids, t, [t]);
      shout(W, b, pick(['저주', '타락공포', '혼마술']));
      credit(b, 'obj', 3);
      pose(b, 'cast');
    }
  }
}

function thinkTroop(W, b) {
  const post = b.home;
  const t = nearest(W, b, 4.5);
  if (t && Math.abs(t.tx - post[0]) + Math.abs(t.ty - post[1]) < 9) {
    b.target = t;
    b.dest = d2(b, t) > 1.5 ? bladeDest(W, b, t, 1.5) : null;
    if (d2(b, t) <= 1.5) act(W, b, t);
  } else {
    b.target = null;
    b.dest = Math.abs(b.tx - post[0]) + Math.abs(b.ty - post[1]) > 1 ? post : null;
  }
}

function thinkCmdr(W, b) {
  const G = A.G();
  const near = enemiesNear(W, b, 2.5);
  if (near.length) {
    b.quietT = G.t;
    if (b.cd.a <= 0) {
      // A sweep of the great blade over everything beside it.
      b.cd.a = 1.6;
      b.atkAt = G.t;
      A.faceTo(b, near[0][0].tx, near[0][0].ty);
      for (const [e] of near) hit(W, b, e, W.U * 1.6 * (b.pw || 1));
      if (onScreen(b) && fxOk(true)) aiCast(W, b, 'w_tiger', { at: near[0][0], foes: near.map(x => x[0]), lv: 8, cls: WARRIOR() });
    }
    if (b.cd.d <= 0 && near.length >= 3 && !b.wind) {
      // The great one is wound up first: the floor round it flashes red (연's danger telegraph)
      // for a second, and whoever is still on it then is struck and stunned.
      b.cd.d = 12;
      b.wind = { at: G.t + 1.1, x: b.tx, y: b.ty, r: 3 };
      shout(W, b, '진영대장의 일갈');
    }
    if (b.wind && G.t >= b.wind.at) {
      const w = b.wind;
      b.wind = null;
      for (const e of foesOf(W, b.team)) {
        if (e.gate || Math.hypot(e.tx - w.x, e.ty - w.y) > w.r) continue;
        hit(W, b, e, W.U * 3.5 * (b.pw || 1));
        if (!e.hero) e.stun = Math.max(e.stun, 1);
      }
      // (its own call, not a skill: drawn over the seven tiles across it strikes)
      if (onScreen(b) && fxOk(true)) A.fxOnArea(A.fxSquare(SK.w_roar.fx, w.r * 2 + 1, 'cmd'), b, { alpha: aiAlpha() });
      if (onScreen(b)) G.shake = Math.max(G.shake, 0.25);
    }
    b.dest = null;
  } else {
    const t = nearest(W, b, 5);
    b.dest = t && Math.abs(t.tx - b.home[0]) + Math.abs(t.ty - b.home[1]) < 4 ? [t.tx, t.ty]
      : (Math.abs(b.tx - b.home[0]) + Math.abs(b.ty - b.home[1]) > 0 ? b.home : null);
    if (G.t - b.quietT > 5 && G.t - (b.lastHitT || -9) > 6) b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.0015);
  }
}

/** A fighter's blow or spell at its target, by its class's kit. */
function act(W, b, t) {
  const G = A.G(), kit = b.kit || KITS.warrior;
  if (b.troop) {
    if (b.cd.a > 0) return;
    b.cd.a = 1.3;
    b.atkAt = G.t;
    A.faceTo(b, t.tx, t.ty);
    hit(W, b, t, W.U * 0.75 * b.pw);
    return;
  }
  if (b.play === 'afk' && W.t >= b.afkAt && W.t < b.afkUntil) return;
  face(b, t);
  // The 도적's 투명 and 암습 (game.js AMBUSH): it fades (foes pass it over), closes in a moment, and
  // its first blow out of hiding lands three times as hard, with 연's 암살 on the struck.
  if (kit.stealth && !t.gate) {
    if (b.hidden > G.t) {
      if (G.t < b.stalk) return;
      b.hidden = 0;
      b.cd.a = kit.basic[2] * rnd(0.9, 1.1);
      tally(b, 'single');
      hit(W, b, t, kit.basic[1] * W.U * 2.2 * b.pw * 3);
      if (onScreen(t) && fxOk(true) && SK.r_amsal) aiCast(W, b, 'r_amsal', { at: t, foes: [t] });
      if (Math.random() < 0.5) shout(W, b, '암습');
      sound(W, b, 'skill_r_amsal', 'strike');
      pose(b, 'attack');
      return;
    }
    if (G.t > (b.stealthAt || 0) && !t.cmdr) {
      b.stealthAt = G.t + rnd(12, 16);
      b.hidden = G.t + 4;
      b.stalk = G.t + 1.2;
      if (onScreen(b) && fxOk() && SK[kit.stealth]) aiCast(W, b, kit.stealth);
      sound(W, b, 'skill_' + kit.stealth, 'buff');
      return;
    }
  }
  const many = t.gate ? 0 : packNear(W, t, 1.5).length;
  const big = t.cmdr || t.gate || t.hero || t.kind === 'boss' || many >= 3;
  if (b.cd.d <= 0 && kit.ult[0] && (big || hpk(t) < 0.5 || (b.play === 'greedy' && b.role !== 'healer'))) {
    b.cd.d = (b.ultCd || kit.ult[2]) * rnd(0.9, 1.2);
    tally(b, 'ult');
    const id = kit.ult[0];
    if (b.cls.id === 'poet') {
      // 태양의희원 / its like: everyone near is mended and guarded.
      for (const m of W.alive[b.team]) if (!m.gate && !m.cmdr && d2(m, b) < 5) { healBody(W, b, m, m.maxHp * 0.3); guard(W, m, 4); }
      if (SK[id] && SK[id].kind === 'ult') ultFx(W, b, id, b, 2.5); else castFx(W, b, id, b);
    } else if (SK[id] && SK[id].kind !== 'ult') {
      // a skill (동귀어진, 조준 활쏘기): the hero's cast of it, its blow on what that strikes
      const fall = kit.ult[1] * W.U * b.pw, seen = (onScreen(b) || onScreen(t)) && fxOk(true);
      if (!W.raid) scatterFrom(W, t, 1.5);
      if (aiCast(W, b, id, { at: t, n: fall, draw: seen, onHit: (e, k) => { if (k === 1) burstAt(W, t); } }) && seen) cue(b, 1);
    } else {
      const cf = ultFx(W, b, id, t, 1.5);
      const fall = kit.ult[1] * W.U * b.pw;
      if (!W.raid) scatterFrom(W, t, 1.5);
      // (이펙트=판정: all in its drawn area struck, the two-others' half shared among them; spread over the picture)
      for (const [dt, k] of aiBeats(cf.life - 0.3)) A.later(0.3 + dt, () => {
        if (W.over) return;
        const vs = aoeAll(W, t, cf.r), m = Math.max(1, vs.length - 1);
        for (const [e] of vs) hit(W, b, e, (e === t ? fall : fall * Math.min(0.5, 1 / m)) * k);
        if (!dt) burstAt(W, t);
      });
    }
    shout(W, b, SK[id] ? SK[id].name : '필살');
    sound(W, b, 'skill_' + id, 'ult');
    pose(b, b.cls.id === 'poet' ? 'cast' : blowPose(b, true));
    return;
  }
  // The class's skills in turn (castSkills); the old spread spell only for a fighter with none.
  if (castSkills(W, b, t, many, big)) return;
  if (!(b.skills && b.skills.length) && b.cd.c <= 0 && kit.aoe[0] && (many >= 2 || t.gate || t.cmdr || t.kind === 'boss')) {
    b.cd.c = kit.aoe[2] * rnd(0.9, 1.15);
    tally(b, 'aoe');
    const id = kit.aoe[0];
    const n = kit.aoe[1] * W.U * 2 * b.pw, seen = (onScreen(b) || onScreen(t)) && fxOk(true);
    // the hero's cast of it (its area, its holds), the blow of three shared among what it strikes
    const went = aiCast(W, b, id, { at: t, n: n * (t.gate ? 1.2 : 1), draw: seen, onHit: (e, k) => { if (k === 3 && !W.raid) { scatterFrom(W, t, 1.5); burstAt(W, t); } } });
    if (!went) b.cd.c = 0.6;
    else if (seen) cue(b, 0.75);
    if (Math.random() < 0.5) shout(W, b, SK[id] ? SK[id].name : '광역');
    sound(W, b, 'skill_' + id, 'spell');
    pose(b, blowPose(b, true));
    return;
  }
  if (b.cd.a > 0) return;
  b.cd.a = kit.basic[2] * rnd(0.9, 1.1);
  tally(b, 'basic');
  const id = kit.basic[0], n = kit.basic[1] * W.U * 2.2 * b.pw * (t.gate ? 1.3 : 1) * (b.skills && b.skills.length ? BASIC_K : 1);
  if (kit.range > 1) {
    if ((onScreen(b) || onScreen(t)) && G.shots.length < 14) {
      // (A 궁사's shot was gold, game.js's 신령의기원 ring (131): a 기원 flying at the foe. An arrow now.)
      A.addShot(b, t, { color: b.cls.id === 'poet' ? '#5aa8ff' : b.cls.id === 'archer' ? '#e8c060' : '#ff8a20', fx: b.cls.id === 'archer' ? ARROW() : undefined, size: 3, speed: 460,
        onHit: () => { if (!W.over) { hit(W, b, t, n); if (fxOk() && onScreen(t)) A.plainLook(b.cls, t, aiAlpha()); } } });
    } else A.later(0.25, () => { if (!W.over) hit(W, b, t, n); });
    if (id) sound(W, b, 'skill_' + id, 'spell');
    pose(b, blowPose(b)); // a 궁사's shot is its bow's draw
  } else {
    hit(W, b, t, n);
    // (the hero's own plain blow's look: its class's slash on the struck, or the spark; not a skill's picture)
    if (onScreen(t) && hitFxOk()) A.plainLook(b.cls, t, aiAlpha(), b);
    sound(W, b, 'hit', null);
    pose(b, 'attack');
  }
}

function face(b, t) {
  b.fdx = Math.abs(t.x - b.x) > Math.abs(t.y - b.y) ? Math.sign(t.x - b.x) : 0;
  b.fdy = b.fdx ? 0 : Math.sign(t.y - b.y) || 1;
  if (b.fdx) b.face = b.fdx;
}
function pose(b, kind) { b.pose = kind; b.poseT = kind === 'attack' ? 0.22 : 0.3; }

function taunt(W, b) {
  const G = A.G();
  b.cd.c = b.aggro ? 5.5 : 9;
  for (const [e] of enemiesNear(W, b, 3)) if (!e.hero && !e.cmdr) e.taunt = { by: b, until: G.t + 3 };
  shout(W, b, pick(['도발', '이리 와라', '어그로']));
  tauntFx(b);
  credit(b, 'obj', 2);
}
/** A tank's 도발 seen: 연's roar (w_roar) round it, small, and the swing of its weapon. */
function tauntFx(b) {
  const W = A.G().war;
  if (W && onScreen(b) && SK.w_roar && fxOk(true)) { const t = nearest(W, b, 2); if (t) aiCast(W, b, 'w_roar', { at: t, foes: [t] }); }
  pose(b, 'attack');
}
function guard(W, m, sec) {
  const G = A.G();
  if (m.hero) supCount(W, 'buff');
  if (m.hero) G.buffs.shield = Math.max(G.buffs.shield, G.t + sec);
  else m.shield = G.t + sec;
}

function onScreen(b) {
  const G = A.G(), c = window.__warCam, x = c ? c[0] : G.player.x, y = c ? c[1] : G.player.y;
  return Math.abs(b.x - x) < A.VW() / 2 + 60 && Math.abs(b.y - y) < A.VH() / 2 + 80;
}
// The fighters' skills are drawn by the hero's own cast (aiCast → game.js castAs): the same pictures at the same size
// as the hero's cast of the skill at the fighter's 단 (사용자 피드백: "같은 기술인데 왜 다르냐" — they had sizes of
// their own: aiFx 1.05~1.2, AI_FX_AREA, fitArea, the old routines' raw pictures × 1.1~1.4). What is an AI's own is
// only how many are drawn (the budgets below: the great ones (광역기·필살기) from a budget of their own so the blows of
// fifty never crowd them out), their see-through, and the caster lit under its feet as it casts (cue).
// The fighters' pictures see-through (메뉴 「AI 이펙트 투명도」, settings.aiFxAlpha: 0.8 opaque by default): every
// blow of the field can be drawn and still the field shows through; the hero's own stay solid.
// The budgets were 14 small and 9 great a 0.6 s for the whole field (in a fight they were spent
// all the time, most blows showed nothing): now 18 and 10 (more cost a phone a frame in two at
// CPU x4), and the 기원 a budget of their own.
const AI_ALPHA = 0.8;
function aiAlpha() { const v = A.settings().aiFxAlpha; return typeof v === 'number' && v > 0 && v <= 1 ? v : AI_ALPHA; }
/** An AI picture's options (what is not a skill's: a kill's mark, a stage's): its scale and the see-through. */
const aiO = (scale, o) => ({ scale, alpha: aiAlpha(), ...o });
function fxOk(big) { const r = A.G().war && A.G().war.raid ? 1 : 0; return !(window.__dbgWar && window.__dbgWar.nofx) && (big ? A.fxBudget('warBig', AI_FX_BIG[r]) : A.fxBudget('war', AI_FX[r])); }
/** A plain blow's spark (a budget of its own, so the skills' pictures show first). */
function hitFxOk() { return !(window.__dbgWar && window.__dbgWar.nofx) && A.fxBudget('warHit', A.G().war && A.G().war.raid ? 3 : 4); }
// (2차 피드백: the skills cast together round the boss — 18 and 10 the 0.6 s before, the sparks among them.)
// [war, raid]: a raid's thirty-five on one boss, all on the screen at once, fewer (measured at CPU x4).
const AI_FX = [16, 14], AI_FX_BIG = [10, 8];
/** A 기원 on a fighter: never crowded out by the blows. */
function healFxOk() { return !(window.__dbgWar && window.__dbgWar.nofx) && A.fxBudget('warHeal', 10); }
/** A fighter's spell seen, its picture only (the fighter's own logic strikes): the hero's cast of it, drawn only
 *  (aiCast). A 기원 is drawn on the one it mends (at). foes: what it may land on (default the fighter's foes). */
function castFx(W, b, id, at, foes) {
  if (!id || !SK[id] || !(onScreen(b) || onScreen(at)) || !(SK[id].kind === 'heal' ? healFxOk() : fxOk(true))) return false;
  const mend = SK[id].kind === 'heal' || SK[id].kind === 'buff';
  if (!aiCast(W, b, id, mend && at ? { by: at, on: at } : { at, foes })) return false;
  cue(b, 1);
  return true;
}
/**
 * 같은 기술은 같은 그림: a fighter's skill cast by the hero's own code (game.js castAs) — the same pictures, size, anchor
 * and area struck as the hero's cast of it at the fighter's 단 (b.skl, or o.lv). n: its blow in the field's units for
 * one whole blow of the skill (none: drawn only, nothing struck) — the first AOE_CAP struck in full, more sharing;
 * draw: false strikes unseen (out of sight, over the budget); by: where it is cast from (a 기원 or buff: the one it
 * goes on), on: the body a picture over "the hero" goes on; foes; at (the one meant: it turns to it); cls (a
 * commander's: no class). Returns true when it went off (false: nothing in the hero's reach of it).
 */
function aiCast(W, b, id, o = {}) {
  const G = A.G(), pos = o.by || b, struck = new Set(), n = o.n;
  // (「쟁」: every guild's spells reach the boss and its monsters too, as ours do through the hunt's own list. The other
  // guilds' were cast at the other guilds only — on the boss, nothing in reach — and the hero's guild took
  // 41~71% of the boss and first place in 6 of 7 「쟁」 of the balance runs.)
  const foes = o.foes || (W.jaeng ? foesOf(W, b.team || 0).filter(e => alive(e)).concat(W.mobs || []) : b.team ? foesOf(W, b.team).filter(e => alive(e)) : null);
  // 대항전·「쟁」: one cast's blow as the fighters' own spells struck before they were cast by the hero's code — the
  // meant one a whole blow, each other struck SPLASH of one, the cast AOE_BUDGET blows at most, a body never more than
  // its part however many beats or hits the hero's version has, the gate only when it is the one meant. Cast by the
  // hero's code with AOE_CAP struck in full, every spell of the crowd struck three bodies and the gate behind them:
  // twice the deaths of a war, 현무 성문 down and 수성대장 felled in 0:30~1:40 of five minutes (balance runs).
  const field = !W.raid, got = new Map();
  let spent = 0, lead = o.at && o.at !== b ? o.at : null;
  return A.castAs(pos, id, o.lv || b.skl || 1, {
    cls: o.cls || b.cls || pos.cls, foes: foes || undefined, team: b.team || 0, at: o.at, on: o.on || pos, alpha: aiAlpha(), draw: o.draw !== false,
    hit: n === undefined ? null : (e, share) => {
      if (W.over || !alive(e)) return 0;
      if (field) {
        if (e.gate && e !== o.at) return 0;
        if (!lead || !alive(lead)) lead = e;
        const room = Math.min((e === lead ? 1 : SPLASH) - (got.get(e) || 0), AOE_BUDGET - spent), s = Math.min(share, room);
        if (!(s > 0)) return 0;
        got.set(e, (got.get(e) || 0) + s);
        spent += s;
        struck.add(e);
        hit(W, b, e, n * s);
      } else {
        // (A raid: a body takes at most RAID_CAST of one blow from one cast, however many beats the hero's version of
        // it has — a 탱커's eight-beat spell on the boss struck eight whole blows, and the kit, not the 전투력, said who
        // led the boss's board: a 이류 탱커 at nine times the 딜러's middle, balance runs.)
        const room = RAID_CAST - (got.get(e) || 0), s = Math.min(share, room);
        if (!(s > 0)) return 0;
        got.set(e, (got.get(e) || 0) + s);
        struck.add(e);
        hit(W, b, e, n * s * (struck.size <= AOE_CAP ? 1 : AOE_CAP / struck.size));
      }
      if (o.onHit) o.onHit(e, struck.size);
      return 0;
    },
  });
}
/** A 필살기 (kind ult: the hero's is a scene of its own, castUlt, not played by a fighter): its picture over the square it
 *  strikes, 2r tiles across (보이는 범위 = 맞는 범위). { life, r }. */
function ultFx(W, b, id, at, r) {
  const fx = id && SK[id] && SK[id].fx, out = { life: 0, r };
  if (!fx || !A.M().fx[fx] || !(onScreen(b) || onScreen(at)) || !fxOk(true)) return out;
  cue(b, 1);
  out.life = A.fxOnArea(A.fxSquare(fx, r * 2, 'ult'), at, { alpha: aiAlpha() });
  return out;
}
/** The caster's cue: a glow of its side's colour under its feet for a moment. */
function cue(b, k = 1) { b.cue = { t: A.G().t, k }; }
function sound(W, b, name, kind) {
  const G = A.G();
  if (!onScreen(b) || G.t < W.sndT) return;
  W.sndT = G.t + 0.09;
  A.audio().play(name, kind);
}
/** A spell's name over the caster, in 연's boxed callout; a few at a time on the screen. */
function shout(W, b, text) {
  const G = A.G();
  if (!onScreen(b) || G.t - (b.said || -9) < 2.5 || G.t < W.shoutT) return;
  b.said = G.t;
  W.shoutT = G.t + 0.25;
  A.floatText(b.x, b.y - (b.cmdr ? 110 : 62), text.endsWith('!') ? text : text + '!', '#fff', true);
}
function talk(W, b, lines) {
  const G = A.G();
  if (G.t - (b.talked || -99) < 8) return;
  b.talked = G.t;
  const text = pick(lines);
  b.bubble = { text, t: G.t };
  // In the chat when near the hero and the guild's last line is a few seconds old (it keeps four).
  if (b.team === 0 && d2(b, W.hero) < 14 && G.t - (W.chatT || -99) >= 3) { W.chatT = G.t; A.say(`${b.name}: ${text}`, 'party'); }
}

// ---------------------------------------------------------------- blows and deaths

/** An AI blow (in the field's units). On the hero it is turned into the hero's own life. */
function hit(W, src, t, dmg) {
  const G = A.G();
  if (!alive(t) || W.over) return;
  // 「쟁」: no blow on one's own guild, none into or out of a camp; a guild behind strikes harder.
  if (W.jaeng && src.team !== undefined && t.team !== undefined) {
    if (src.team === t.team) { if (W.diag) W.diag.friendly++; return; }
    if (inCamp(W, t) || inCamp(W, src)) return;
    dmg *= (W.comeback[src.team] || 1) * JAENG.pkK;
    if (src.team === 0) dmg *= jaengMorale(W);
    else if (t.team === 0 && jaengMorale(W) > 1) dmg *= JAENG.moraleTaken;
    W.pkHeat[src.team][t.team] += dmg;
  }
  if (src.team === 0 && !src.hero && A.auraK) dmg *= A.auraK(src); // 주작의 기운 (game.js auraK): the hero's aura on its side
  if (W.cmds && W.cmds.cur && !W.raid && !W.jaeng) dmg *= commandK(W, src, t);
  if (W.tac && !W.raid) dmg *= tacK(W, src, t); // (전술: 집중 · 총공격 · 후퇴)
  if (W.sbuff && !W.raid) dmg *= shrineK(W, src, t); // (신단 · 역전의 기세)
  if (src.starLean) dmg *= 1 + src.starLean;
  if (src.ambushT > G.t) dmg *= AMBUSH_K; // (기습: a sprung 매복's first seconds) // (강화: the weapon's ★ over the armour's, aiStars)
  if ((W.raid || W.mobs) && !t.war && !t.hero) return raidHit(W, src, t, dmg);
  if (src.dead && !src.cmdr) dmg *= 0.5;
  if (W.diag && src.team >= 1 && !t.gate) {
    W.diag.atk[t.hero ? 'hero' : t.role === 'tank' && !t.cmdr ? 'tank' : 'other']++;
    if (t.hero) { const w = W.diag.heroWhy = W.diag.heroWhy || {}, k = src.target === t ? src.tWhy || (src.troop ? 'troop' : src.cmdr ? 'cmdr' : '?') : 'splash'; w[k] = (w[k] || 0) + 1; }
  }
  dmg *= rnd(0.9, 1.1);
  if (src.powT > G.t) dmg *= src.powK || 1.15;
  if (t.curse > 0) dmg *= 1.25;
  if (t.shield > G.t) dmg *= 0.75;
  if (t.role === 'tank' && !t.hero) dmg *= 0.7;
  if (src.team === 0 && W.scoutBuff && W.scoutBuff[0] > G.t) dmg *= 1.1;
  if (src.team === 1 && W.scoutBuff && W.scoutBuff[1] > G.t) dmg *= 1.1;
  if (t.hero) {
    if (G.dead) return;
    // (heroHurtK, 대항전·「쟁」: a hero well over its guild's middle is struck harder, as its 전투력 says it is the one
    // to bring down — its own mends, shields and 격 kept a hero of 7.7만 up through every war, 0 deaths, balance runs.)
    let d = dmg / W.refHp * G.player.maxHp * 0.85 * (W.heroArmorK || 1) * (W.raid ? 1 : heroHurtK(W) * heroGearK(W));
    if (W.role === 'tank') d *= 0.8 / W.roleK;
    W.hero.lastHitBy = src;
    W.hero.lastHitT = G.t;
    t.hitBy.set(src, G.t);
    const before = G.player.hp;
    A.hurtPlayer(d, src);
    const took = Math.max(0, before - Math.max(0, G.player.hp));
    credit(W.hero, 'taken', took / G.player.maxHp * W.refHp);
    credit(src, 'dmg', took / G.player.maxHp * W.refHp);
    return;
  }
  if (t.gate) {
    // A gate gives way to a crowd only so fast (GATE_SEC: its life in no less than that many seconds of the
    // guild's blows; the hero's own, the 공성 화약 apart): a whole guild on it broke it in 0:20~0:50.
    const sec = Math.floor(G.t);
    if (t.capSec !== sec) { t.capSec = sec; t.capUsed = 0; }
    dmg = Math.min(dmg, t.maxHp / GATE_SEC - t.capUsed);
    if (!(dmg > 0)) return;
    t.capUsed += dmg;
    t.hp -= dmg;
    t.flash = 0.1;
    credit(src, 'dmg', dmg);
    credit(src, 'obj', dmg / W.refHp * 6);
    num(W, t, dmg, false);
    if (t.hp <= 0) gateBreak(W, src);
    return;
  }
  t.hp -= dmg;
  struck(G, W, t, src);
  t.lastHitBy = src;
  t.lastHitT = G.t;
  t.hitBy.set(src, G.t);
  (t.dmgBy || (t.dmgBy = new Map())).set(src, (t.dmgBy.get(src) || 0) + dmg);
  t.dmgIn.push([G.t, dmg]);
  if (t.dmgIn.length > 12) t.dmgIn.shift();
  credit(src, 'dmg', dmg);
  if (!src.floor) credit(t, 'taken', dmg);
  num(W, t, dmg, false);
  if (t.hp <= 0) kill(W, t, src);
}

// 피격 연출 (타격감 점검 2026-11-28): a fighter struck showed nothing but its bar (its flash was set and never drawn).
// Now a blink (a foe's white, ours red: drawFighter / drawUnit) no more than three times a second, a jolt of a few pixels
// away from the blow, and on the hero's screen 연's blow sound, soft (audio 'war_hit': no more than five a second, quieter
// as it repeats — audio.js).

function struck(G, W, t, src) {
  if (G.t - (t.flashAt ?? -9) < 0.34) return;
  t.flashAt = G.t;
  t.flash = 0.12;
  t.kickAt = G.t;
  const dx = src && src.x !== undefined ? t.x - src.x : 0, dy = src && src.y !== undefined ? t.y - src.y : 0, d = Math.hypot(dx, dy);
  t.kdx = d ? dx / d : 0;
  t.kdy = d ? dy / d : 0;
  const p = G.player;
  if (Math.abs(t.x - p.x) < A.VW() / 2 && Math.abs(t.y - p.y) < A.VH() / 2) A.audio().play('war_hit');
}
/** The jolt of a struck body (pixels, x and y), easing back over a tenth of a second. */
function kick(b) {
  const kt = b.kickAt !== undefined ? A.G().t - b.kickAt : 9;
  if (kt >= 0.12) return [0, 0];
  const k = 3 * (1 - kt / 0.12);
  return [(b.kdx || 0) * k, (b.kdy || 0) * k * 0.6];
}
/** A frame's tint for a blink (kept with the frame entry). */
function flashPic(e, color) {
  const key = color === '#ffffff' ? 'wh' : 'rd';
  if (!e[key]) {
    const c = document.createElement('canvas');
    c.width = e.w;
    c.height = e.h;
    const g = c.getContext('2d');
    g.drawImage(e.pic, e.sx, e.sy, e.w, e.h, 0, 0, e.w, e.h);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = color;
    g.fillRect(0, 0, e.w, e.h);
    e[key] = c;
  }
  return e[key];
}
function blitFlash(ctx, b, e, x, y, alpha) {
  if (!(b.flash > 0) || b.dead) return;
  ctx.globalAlpha = alpha * Math.min(1, b.flash / 0.12) * (A.settings().calmFx ? 0.25 : 0.45);
  ctx.drawImage(flashPic(e, b.team === 0 ? '#ff3a24' : '#ffffff'), x + e.ox, y + e.oy);
}

function num(W, t, n, healing) {
  const G = A.G(), p = G.player;
  // Numbers for the fight round the hero only: a whole battlefield of them hid it and cost frames.
  if (G.texts.length > 45 || !A.settings().numbers || Math.abs(t.x - p.x) > 200 || Math.abs(t.y - p.y) > 130) return;
  t.numN = G.t - (t.numT || -9) < 0.7 ? ((t.numN || 0) + 1) % 5 : 0;
  t.numT = G.t;
  const y = t.y - (t.m ? t.m.h * (t.scale || 1) : 46) - 6 - t.numN * 12;
  if (healing) G.texts.push({ x: t.x + rnd(-3, 3), y, text: '+' + A.shownNum(n), t: 0, heal: true, color: '#58e868' });
  else G.texts.push({ x: t.x + rnd(-3, 3), y, text: A.shownNum(n), t: 0, num: true, ally: true, color: '#d8d8d8' });
}

function healBody(W, src, m, n) {
  const G = A.G();
  if (!alive(m)) return;
  if (m.hero) {
    // A healer's mend is a share of the mended one's life (m.maxHp, the hero's own life for the
    // hero): in a war it is the hero's share as it is. (It was turned from the field's units as
    // well, so the hero got its share times its life over a fighter's — about half a mend.)
    const hn = W.raid ? n / W.refHp * G.player.maxHp : n;
    const before = G.player.hp;
    A.heal(hn, false, true);
    const got = (G.player.hp - before) / G.player.maxHp * W.refHp;
    if (!src.hero) supCount(W, 'heal', (G.player.hp - before) / G.player.maxHp);
    credit(src, 'heal', got);
    if (W.diag && !src.hero && m.team === 0 && !W.raid) W.diag.heal.hero += got / W.refHp;
    return;
  }
  // (The raider marked for the hero healer's 집중 치유 is mended by the others at a quarter.)
  if (m.mark && !src.hero) n *= 0.25;
  n = Math.min(n, m.maxHp - m.hp);
  if (n <= 0) return;
  if (W.diag && !src.hero && m.team === 0 && !W.raid) W.diag.heal[m.role === 'tank' && !m.cmdr ? 'tank' : 'other'] += n / W.refHp;
  m.hp += n;
  credit(src, 'heal', n);
  num(W, m, n, true);
}

/** Test counters (__warState().sup): what the allies cast on the hero — heals (and how much of
 * its life), buffs, revives. */
function supOf(W) { return W.sup || (W.sup = { heal: 0, healAmt: 0, buff: 0, revive: 0, names: {} }); }
function supCount(W, kind, n = 0) {
  const s = supOf(W);
  s[kind]++;
  if (kind === 'heal') s.healAmt += n;
}
function credit(b, what, n) {
  if (!b || !b.stats || !(n > 0)) return;
  if (b.hero) {
    // In a war the hero's objectives (crates, circles, the cart) count as they come.
    if (A.G().war.raid ? CAPPED.has(what) : CAPPED.has(what) && what !== 'obj') n = heroCap(what, n);
    if (afk()) n *= AFK_K;
  }
  b.stats[what] += n;
}
/**
 * The hero's contribution, kept within reach of the AI's: in each kind (blows, the boss's share,
 * healing, blows taken, objectives) past half again what an AI fighter of its role does a second
 * on average — measured in this very war or raid — a share of a quarter counts. A hero's spells
 * fire all the time and reach far (its 기원 mends everyone near, its sweeps touch every foe), so
 * without this a hero topped every board whatever its player did; with it the player's own part
 * (staying in the fight and alive, the red floor stepped off, the blasts cut, the role's work)
 * decides between S and B, and the AI's best are real rivals.
 */
function heroHurtK(W) {
  return 1 + 0.35 * clamp((W.heroPw || 1) / Math.max(0.5, W.heroSideK || 1) - 1, 0, 1);
}
// 장비의 몫 (게임성 점검 2026-11-28): a blow on the hero is a share of its own life, so the life its gear gives never
// counted — a 9차 격투가 with no gear (전투력 1.4만, rel 0.47) fell 4~5 times a 청룡·주작전, one in the best gear (7.2만,
// rel 1.76) 4~8 times. The share now follows the hero's 전투력 against its guild's (rel^-GEAR_HURT, mostly its gear):
// ×1.6 for the bare one, ×0.71 for the best (with heroHurtK's ×1.26, 0.9 in all: the strong still fall). Four wars each:
// the bare one now falls 7~11 times, the best 1~3.
const GEAR_HURT = 0.6;
function heroGearK(W) {
  return Math.pow(clamp((W.heroPw || 1) / Math.max(0.5, W.heroSideK || 1), 0.3, 3), -GEAR_HURT);
}
const CAPPED = new Set(['dmg', 'boss', 'heal', 'taken', 'obj', 'assists']);
const CAP_OVER = 1.3, CAP_SHARE = 0.25, CAP_WIN = 15;
function heroCap(what, n) {
  const G = A.G(), W = G.war;
  if (W.t < 20) return n;
  // The AI's rates, by role and overall, refreshed every two seconds.
  if (!W.rates || G.t - W.rates.at > 2) {
    const r = { at: G.t, role: {}, all: {} };
    const peers = W.bodies.filter(b => !b.troop && !b.cmdr && !b.hero);
    const mine = peers.filter(b => b.role === W.role);
    const ours = peers.filter(b => b.team === 0), oursRole = ours.filter(b => b.role === W.role);
    // The hero against its peers by the same rule of 전투력 (W.heroPw against their mean pw): its credit kept to what
    // a fighter of its 전투력 earns, CAP_OVER over it. (Without, any hero showed 1.6 times its role's middle — a hero of
    // 5천 second of thirty-five on a raid's boss, over the 절정 in the 최종 무기.)
    const pwOf = l => l.reduce((a, b) => a + (b.pw || 1), 0) / Math.max(1, l.length);
    r.rel = clamp((W.heroPw || 1) / Math.max(0.1, pwOf(oursRole.length ? oursRole : ours)), 0.25, 3);
    for (const k of CAPPED) {
      r.role[k] = mine.reduce((a, b) => a + b.stats[k], 0) / Math.max(1, mine.length) / W.t;
      r.all[k] = peers.reduce((a, b) => a + b.stats[k], 0) / Math.max(1, peers.length) / W.t;
    }
    W.rates = r;
  }
  const win = (W.capWin = W.capWin || {})[what] = W.capWin[what] || { q: [], sum: 0 };
  win.q.push([G.t, n]);
  win.sum += n;
  while (win.q.length && G.t - win.q[0][0] > CAP_WIN) win.sum -= win.q.shift()[1];
  // Over the whole window, so a single big blow is not taken for a rate.
  const span = CAP_WIN;
  // (레이드: the blows' credit by the hero's 직업 효율 too, raidEff — the cap on its blows moved by it, its credit did not:
  // the results showed the same contribution whatever the class, gear or play.)
  const effK = W.raid && (what === 'dmg' || what === 'boss') ? W.capEff || 1 : 1;
  const target = CAP_OVER * (W.rates.rel || 1) * Math.max(W.rates.role[what], 0.3 * W.rates.all[what]) * effK;
  const rate = win.sum / span;
  if (!(target > 0) || rate <= target) return n;
  // Past it, a little more for much more: at ten times the AI's rate, about 1.6 times its credit.
  const k = target / rate;
  return n * k * (1 + CAP_SHARE * Math.log(1 / k));
}
/**
 * 자리비움: a hero whose player has not moved it for twenty seconds is away, as a battleground
 * marks it; while away its contribution counts at a fifth (its spells fire by themselves, so an
 * idle hero next to the fight would otherwise earn as if it played). Holding a 거점's circle or
 * walking by the cart is not being away. Shown on the screen.
 */
const AFK_AFTER = 20, AFK_K = 0.2;
function afk() {
  const G = A.G(), W = G.war;
  if (G.dead || W.t <= AFK_AFTER || G.t - (W.movedT || 0) <= AFK_AFTER) return false;
  if (W.flags && W.flags.some(f => heroIn(W, f.x, f.y, 2.2))) return false;
  if (W.seals && W.seals.some(f => heroIn(W, f.x, f.y, 2.2))) return false;
  if (W.cart && heroIn(W, W.cart.tx, W.cart.ty, 3)) return false;
  return true;
}

/** The hero's own blow on a fighter (hurtEnemy has dealt it): counted, and turns the struck. */
function heroHit(e, dmg) {
  const G = A.G(), W = G.war;
  if (!W || (W.jaeng && e.team === 0)) return;
  e.hitBy && e.hitBy.set(W.hero, G.t);
  if (e.hitBy) (e.dmgBy || (e.dmgBy = new Map())).set(W.hero, (e.dmgBy.get(W.hero) || 0) + dmg);
  e.lastHitBy = W.hero;
  e.lastHitT = G.t;
  if (e.dmgIn) { e.dmgIn.push([G.t, dmg]); if (e.dmgIn.length > 12) e.dmgIn.shift(); }
  credit(W.hero, 'dmg', dmg);
  credit(e, 'taken', dmg);
  if (e.gate) {
    credit(W.hero, 'obj', dmg / W.refHp * 6);
    if (e.hp <= 0) gateBreak(W, W.hero);
  }
  // The struck turns on the hero now and then (tanks keep their own fight): when it has no one in
  // reach, or once in a while (a hero's spells strike many times a second; one in seven of its
  // hits used to turn every foe they touched).
  if (!e.cmdr && !e.gate && e.role !== 'tank' && e.target !== W.hero && G.t >= (e.retargetT || 0) && (!alive(e.target) || Math.random() < 0.03)) {
    e.target = W.hero;
    e.tWhy = 'struck';
    e.retargetT = G.t + rnd(2, 3);
  }
}

function kill(W, f, killer) {
  const G = A.G();
  if (f.dead || f.gate) { if (f.gate && f.hp <= 0) gateBreak(W, killer); return; }
  f.dead = true;
  f.hp = 0;
  f.down = true;
  f.stats.deaths++;
  A.leave(f);
  const list = listOf(f.team);
  const at = list.indexOf(f);
  if (at >= 0) list.splice(at, 1);
  // A raider lies longer (a healer can raise it meanwhile) and longer still once the boss rages.
  const respawnK = W.jaeng ? jaengRise(W, f.team, f.stats.deaths) : W.raid ? 14 + Math.min(8, W.t / 40) + (G.enraged ? 12 : 0)
    : (f.cmdr ? 40 : f.troop ? 25 : 7 + Math.min(6, W.t / 60)) + (W.slowRise === f.team ? 5 : 0)
      // 대장전 is scored in kills: a guild well ahead rises a little slower, one well behind a little
      // sooner (a lead fed itself — fewer foes up, more kills — to 180 : 90 either way).
      + (W.mode === 'commander' && !f.cmdr && !f.troop ? clamp((W.score[f.team] - W.score[1 - f.team]) / 12, -3, 3) : 0);
  f.respawnAt = W.mode === 'commander' && f.cmdr ? 0 : G.t + Math.max(3, respawnK - (f.team === 0 && !W.raid && !f.cmdr ? gk(W, 'rise') : 0));
  f.dest = null;
  f.target = null;
  W.ghosts.push({ b: f, tx: f.tx, ty: f.ty, x: f.x, y: f.y, t: G.t, until: f.respawnAt || G.t + 3 });
  if (f.carry) dropCrate(W, f);
  if (f.hide) endHide(W, f, 'died');
  // The killer and those who struck it within six seconds (for a tenth of its life at least, so
  // a sweep that grazed it does not count): kills and assists.
  const by = killer && killer.team !== f.team ? killer : f.lastHitBy;
  if (by && by.stats) { credit(by, 'kills', 1); W.teams[by.team].kills++; }
  if (W.diag && by) { const k = by.style === 'hunter' ? 'hunterKills' : by.style === 'diver' && f.role === 'healer' ? 'diverKills' : null; if (k) W.diag[k] = (W.diag[k] || 0) + 1; if (f.duel && f.duel.with === by && f.duel.until > G.t) W.diag.duelKills = (W.diag.duelKills || 0) + 1; }
  const dealt = f.dmgBy || new Map();
  for (const [who, t] of f.hitBy) if (who !== by && who.team !== f.team && G.t - t < 6 && (dealt.get(who) || 0) >= f.maxHp * 0.1) credit(who, 'assists', 1);
  if (W.jaeng) { jaengPk(W, f, by); if (G.aggro === f) G.aggro = raidAggro(); }
  f.hitBy.clear();
  dealt.clear();
  if (W.raid) raidDown(W, f, by);
  if (f.play === 'suicide' && f.team === 0 && Math.random() < 0.6) A.later(rnd(0.8, 1.6), () => { if (!W.over) { f.talked = -99; chat(W, f, 'p' + f.id, ['아 또 죽었네 ㅋㅋ', '혼자 들어갔다가 ㅠ', '부활 좀요 ㅋㅋ'], { every: 10, must: true, emo: 'gone' }); } });
  if (f.cmdr) credit(by, 'obj', 60);
  else if (f.carry) credit(by, 'obj', 10);
  // The hero gains as from a kill.
  const heroIn = by === W.hero || (f.lastHitBy === W.hero);
  if (heroIn || (W.hero.stats && [...f.hitBy.keys()].includes(W.hero))) A.gainXp(Math.max(3, A.xpFor(G.player.lvl) / (W.role === 'dps' ? 6 : 9)));
  if (onScreen(f) && A.M().fx.h_kill && A.fxBudget('kill', 6)) A.fxOn('h_kill', f, { scale: f.cmdr ? 1.2 : 0.7 });
  if (!f.troop) W.feed.push({ t: G.t, a: by ? by.name || (by.m && by.m.name) || '몬스터' : '?', at: by && by.team !== undefined ? by.team : W.teamIds ? -1 : 1 - f.team, b: f.name, bt: f.team, big: !!f.cmdr });
  if (W.mode === 'commander' && !f.troop && by) W.score[by.team] += f.cmdr ? 0 : ((W.rule && W.rule.killPts) || 1);
  // 혈풍 (주간 규칙): the one who felled it gets back a part of its life.
  if (W.rule && W.rule.killHeal && by && !W.raid) {
    if (by === W.hero) { if (!G.dead) G.player.hp = Math.min(G.player.maxHp, G.player.hp + G.player.maxHp * W.rule.killHeal * War.heroHealK()); }
    else if (by.war && !by.dead && !by.gate) by.hp = Math.min(by.maxHp, by.hp + by.maxHp * W.rule.killHeal);
  }
  // A streak of the hero's (three within six seconds) is one of the war's moments.
  if (by === W.hero && W.moments) {
    const ks = W.heroKs = (W.heroKs || []).filter(t => G.t - t < 6);
    ks.push(G.t);
    if (ks.length === 3) moment(W, `내 연속 처치 ×3`, 0, { hero: true, kind: 'streak' });
  }
  if (f.cmdr) {
    A.say(`${f.name}${f.team === 0 ? '이 쓰러졌습니다!' : '을 쓰러뜨렸습니다!'}`, f.team === 0 ? 'warn' : 'sys');
    A.banner(`${f.name} 격파!`);
    if (!W.raid && W.moments) moment(W, `${f.name} 격파`, 1 - f.team, { hero: by === W.hero, big: true, kind: 'cmdr' });
    if (W.mode === 'capture') W.score[1 - f.team] += 40;
    if (W.mode === 'escort' && W.cart && f.team !== W.attacker) W.cart.boost = G.t + 15;
  } else if (by && by.team === 0 && by.stats && by !== W.hero && Math.random() < 0.12) talk(W, by, ['하나 잡았다!', '처치!', 'ㅋㅋ 잡음', '나이스!']);
  else if (f.team === 0 && f.squad && f.squad.leader === f && Math.random() < 0.5 && (f.squad === W.hero.squad || d2(f, W.hero) < 14) && G.t - (W.chatT || -99) >= 3) { W.chatT = G.t; A.say(`${f.name}(${W.raid ? '파티장' : '분대장'}) 쓰러짐! 다시 모여요!`, 'warn'); }
}

function respawn(W, b) {
  const G = A.G();
  b.dead = false;
  b.down = false;
  b.hp = b.maxHp;
  b.respawnAt = 0;
  b.stun = b.slow = b.curse = 0;
  b.st = null;
  b.state = 'go';
  b.taunt = null;
  b.upT = W.t;
  const at = b.home || W.teams[b.team].spawn;
  placeBody(W, b, at);
  listOf(b.team).push(b);
  if (onScreen(b) && A.M().fx.k_revive) A.addFx('k_revive', b.x, b.y + 2, { anchor: 'bottom', scale: 0.7 });
}

function revive(W, healer, g) {
  const G = A.G(), b = g.b;
  if (!b.dead) return;
  if (healer.cd) healer.cd.r = 18;
  b.respawnAt = 0;
  b.dead = false;
  b.down = false;
  b.hp = b.maxHp * 0.4;
  placeBody(W, b, [g.tx, g.ty]);
  listOf(b.team).push(b);
  W.ghosts = W.ghosts.filter(x => x !== g);
  credit(healer, 'revives', 1);
  shout(W, healer, '부활');
  if (onScreen(b)) A.addFx(A.FX.revive, b.x, b.y + 2, { anchor: 'bottom' });
  if (healer.team === 0) chat(W, healer, 'revive', ['부활 갑니다!', '일어나요!', '부활!'], { every: 10, p: 0.6 });
  thanks(W, b, healer);
}

// ---------------------------------------------------------------- the hero in the war

function heroDown() {
  const G = A.G(), W = G.war, p = G.player;
  if (G.dead) return;
  // The class's own revive (and 성황령) first, as on any ground.
  if (G.extraLives > 0 || (G.cls.revive && !G.revived)) return false;
  G.dead = true;
  p.hp = 0;
  W.hero.stats.deaths++;
  const by = W.hero.lastHitBy;
  if (by && by.team >= 1) { credit(by, 'kills', 1); W.teams[by.team].kills++; if (W.mode === 'commander') W.score[1]++; }
  for (const [who, t] of W.hero.hitBy) if (who !== by && G.t - t < 6) credit(who, 'assists', 1);
  if (W.jaeng) jaengPk(W, W.hero, by);
  W.hero.hitBy.clear();
  if ((W.raid || W.jaeng) && G.aggro === p) G.aggro = raidAggro();
  if (W.raid && W.role === 'tank') rageDelay(G); // (the hero main tank down: as a raider tank's fall)
  W.feed.push({ t: G.t, a: by ? by.name : '?', at: by && by.team >= 1 ? by.team : 1, b: W.hero.name, bt: 0 });
  // 레이드: the hero gets up a few times only (raidRevives); then it lies till the raid is over
  // and the raiders fight on (the result, rewards and the way back to town as always).
  if (W.raid && W.revivesLeft !== undefined) {
    if (W.revivesLeft <= 0) {
      W.heroOut = true;
      W.heroBack = 0;
      W.ghosts.push({ b: W.hero, tx: p.tx, ty: p.ty, x: p.x, y: p.y, t: G.t, until: G.t + 1e6 });
      A.say('부활 횟수를 모두 썼습니다. 레이드가 끝날 때까지 다시 일어날 수 없습니다 — 공대원들이 싸움을 이어갑니다.', 'warn');
      A.banner('부활 횟수 소진');
      A.audio().play('lose');
      return true;
    }
    W.revivesLeft--;
  }
  W.heroBack = G.t + (W.jaeng ? jaengRise(W, 0, W.hero.stats.deaths) : W.raid ? 9 + Math.min(8, W.t / 45) : 7 + Math.min(6, W.t / 60)) - (W.raid ? 0 : gk(W, 'rise'));
  W.ghosts.push({ b: W.hero, tx: p.tx, ty: p.ty, x: p.x, y: p.y, t: G.t, until: W.heroBack });
  A.say(`쓰러졌습니다… ${Math.ceil(W.heroBack - G.t)}초 뒤 진영에서 다시 일어납니다.${W.raid && W.revivesLeft !== undefined ? ` (남은 부활 ${W.revivesLeft}회)` : ''}`, 'warn');
  A.audio().play('lose');
  return true;
}
function heroUp(W) {
  const G = A.G(), p = G.player;
  G.dead = false;
  W.heroBack = 0;
  p.hp = p.maxHp;
  p.mp = Math.max(p.mp, p.maxMp * 0.5);
  G.buffs.guard = G.t + 3;
  const sp = W.teams[0].spawn;
  heroTo(sp[0], sp[1]);
  A.addFx(A.FX.revive, 0, 2, { follow: true, anchor: 'bottom' });
  A.say('진영에서 다시 일어났습니다.', 'sys');
}

/** The role's own work for the hero: a taunt, a 기원 now and then, a guard and a curse. */
function heroRole(W, dt) {
  const G = A.G(), p = G.player, h = W.hero;
  if (G.dead) return;
  W.roleT = (W.roleT || 0) - dt;
  // A fallen mate under the hero's feet is raised (anyone can, the healer quicker).
  const g = W.ghosts.find(x => x.b !== h && x.b.team === 0 && !x.b.cmdr && Math.abs(x.tx - p.tx) + Math.abs(x.ty - p.ty) <= 1);
  if (g) {
    g.raise = (g.raise || 0) + dt * (W.role === 'healer' ? 2 : 1);
    if (g.raise > 2) { revive(W, h, g); A.banner(`${g.b.name} 부활!`); }
  }
  if (W.roleT > 0) return;
  if (W.role === 'tank') {
    W.roleT = 6;
    // A raid's boss beside the hero is pulled onto it.
    const ag = G.aggro, held = ag && ag !== p && !ag.down && ag.role === 'tank';
    if ((W.raid || W.jaeng) && W.boss && d2(W.boss, h) < 4 && !held && G.t - (W.heroTauntT || -99) >= 10) {
      W.heroTauntT = G.t;
      W.taunted = { by: h, until: G.t + 6 };
      G.aggro = p;
      credit(h, 'obj', 4);
    }
    const near = enemiesNear(W, h, 3);
    if (near.length) {
      for (const [e] of near) if (!e.cmdr) e.taunt = { by: h, until: G.t + 3 };
      A.floatText(p.x, p.y - 80, '도발!', '#ffd27a', true);
      credit(h, 'obj', 2 + Math.min(2, near.length)); // as an AI tank's taunt counts
    }
  } else if (W.role === 'healer') {
    W.roleT = 4;
    let low = null, lk = 0.8;
    for (const m of W.alive[0]) if (!m.hero && !m.gate && d2(m, h) < 5 && hpk(m) < lk) { lk = hpk(m); low = m; }
    if (low) {
      const fx = SK.c_heal.fxs ? SK.c_heal.fxs[Math.min(7, Math.floor(p.lvl / 5))] : SK.c_heal.fx;
      if (fx) A.addFx(fx, 0, -26, { scale: 0.9, self: true, on: low });
      healBody(W, h, low, low.maxHp * 0.08 * W.roleK);
      A.floatText(low.x, low.y - 70, '기원', '#fff', true);
      if (lk < 0.45) chat(W, low, 'thxHeal', ['힐 감사요!', '감사합니다 ㅎㅎ', '살았다 ㄳ'], { every: 25, p: 0.5, emo: Math.random() < 0.4 ? 'cute' : null });
    }
  } else if (W.role === 'support') {
    W.roleT = 8;
    const mates = W.alive[0].filter(m => !m.gate && d2(m, h) < 4);
    for (const m of mates) guard(W, m, 5);
    const foes = enemiesNear(W, h, 3);
    for (const [e] of foes) e.curse = Math.max(e.curse, 4);
    if (mates.length > 1 || foes.length) {
      A.addFx(A.FX.shield, 0, -26, { follow: true, self: true, scale: 0.8 });
      credit(h, 'obj', (mates.length > 1 ? 4 : 0) + (foes.length ? 3 : 0)); // as an AI supporter's 보호 and 저주 count
    }
  } else W.roleT = 5;
}

/** Whom the hero's 기원 goes to in a war: the hero if hurt, else the lowest ally near. */
function neediest() {
  const G = A.G(), W = G.war, p = G.player, hk = p.hp / p.maxHp;
  if (hk < 0.7) return [p, hk];
  let best = null, k = 0.75;
  for (const m of G.party) {
    if (m.dead || Math.abs(m.tx - p.tx) + Math.abs(m.ty - p.ty) > 6) continue;
    const r = m.hp / m.maxHp;
    if (r < k) { k = r; best = m; }
  }
  return [best || p, best ? k : hk];
}

/**
 * The hero's 기원 in a war, a raid or a 「쟁」 also mends the allies close by (a healer's or a 도사's
 * more, and five tiles round, not four). Its picture on each one it mends, solid (the hero's own
 * spell): it was drawn only for a hero in the healer role and from the blows' budget, so a 도사's
 * 기원 showed over the hero alone. (`skip`: the one game.js's cast() mended already, picture and all.)
 */
function heroHeal(n, fx, poet = false, skip = null) {
  const G = A.G(), W = G.war, p = G.player, healer = W.role === 'healer' || poet;
  const k = Math.min(healer ? 0.08 * W.roleK : 0.04, (healer ? 1.6 * W.roleK : 0.6) * n / p.maxHp);
  let shown = 0;
  for (const m of G.party) {
    if (m.dead || m === skip || d2(m, W.hero) > (healer ? 5 : 4)) continue;
    const hurt = m.hp < m.maxHp;
    healBody(W, W.hero, m, m.maxHp * k);
    if (fx && hurt && shown < 8 && onScreen(m)) { shown++; A.addFx(fx, 0, -26, { scale: 1.1, self: true, on: m }); }
  }
}

// ---------------------------------------------------------------- objectives

function objectives(W, dt) {
  const G = A.G();
  // Supply crates: a few at a time at their spots; carried home, they help the guild.
  W.crateT = (W.crateT || 6) - dt;
  const spots = W.mode === 'siege' ? W.def.cratesOut.concat(W.def.cratesIn) : W.def.crates;
  const crK = (W.rule && W.rule.crateK) || 1;
  if (W.crateT <= 0 && W.crates.length < 3 * crK) {
    W.crateT = 18 / crK;
    const s = snap(W, ...pick(spots));
    if (!W.crates.some(c => c.x === s[0] && c.y === s[1])) {
      W.crates.push({ x: s[0], y: s[1], by: null, t: G.t });
      if (Math.random() < 0.5) A.say('보급 상자가 나타났습니다. 목표 지점으로 운반하면 문파에 도움이 됩니다.', 'sys');
    }
  }
  for (const c of W.crates) {
    if (c.by) {
      if (c.by.dead || (c.by.hero && G.dead)) { c.by.carry = null; c.by = null; continue; }
      const cx = c.by.hero ? G.player.tx : c.by.tx, cy = c.by.hero ? G.player.ty : c.by.ty;
      c.x = cx; c.y = cy;
      const [dx, dy] = dropPoint(W, c.by.team);
      if (Math.abs(cx - dx) + Math.abs(cy - dy) <= 2) deliver(W, c);
      continue;
    }
    // Picked up by whoever steps on it (the hero too).
    const p = G.player;
    if (!G.dead && p.tx === c.x && p.ty === c.y && !W.hero.carry) { c.by = W.hero; W.hero.carry = c; A.banner('보급 상자를 들었다! 목표 지점으로'); continue; }
    const b = A.occ.get(k2(c.x, c.y));
    if (b && b.war && !b.troop && !b.cmdr && !b.carry && !b.dead) { c.by = b; b.carry = c; }
  }
  W.crates = W.crates.filter(c => !c.done);
  // 정찰: holding a watch post a few seconds shows the enemy to the guild (+10% blows, 30 s).
  for (const z of W.zones) {
    const [n0, n1] = countAt(W, z.x, z.y, 1.5);
    const who = n0 && !n1 ? 0 : n1 && !n0 ? 1 : -1;
    if (who < 0) { z.prog = Math.max(0, z.prog - dt); continue; }
    if (z.owner === who && G.t < z.until) continue;
    z.prog += dt * (1 + (who === 0 && W.role === 'support' && heroIn(W, z.x, z.y, 1.5) ? 1 : 0));
    if (z.prog >= 3) {
      z.prog = 0;
      z.owner = who;
      z.until = G.t + 40;
      W.scoutBuff = W.scoutBuff || [0, 0];
      W.scoutBuff[who] = G.t + 30;
      for (const b of W.alive[who]) if (Math.abs(b.tx - z.x) + Math.abs(b.ty - z.y) <= 2) credit(b, 'obj', 20);
      if (who === 0) A.say('정찰 성공! 적의 위치가 드러났습니다. (30초간 피해 +10%)', 'sys');
    }
  }
  if (W.mode === 'capture') capture(W, dt);
  else if (W.mode === 'escort') escort(W, dt);
  else if (W.mode === 'siege') siege(W, dt);
  else if (W.mode === 'commander') { /* kills and the commanders: counted where they fall */ }
}

function heroIn(W, x, y, r) {
  const G = A.G(), p = G.player;
  return !G.dead && Math.hypot(p.tx - x, p.ty - y) <= r;
}
function countAt(W, x, y, r) {
  const n = teamsOf(W).map(() => 0);
  for (const t of teamsOf(W)) for (const b of W.alive[t]) if (!b.gate && !b.troop && Math.hypot(b.tx - x, b.ty - y) <= r) n[t]++;
  return n;
}

function dropPoint(W, team) {
  if (W.mode === 'capture') {
    const mine = W.flags.filter(f => f.owner === team);
    const f = (mine.length ? mine : W.flags).reduce((a, c) => (Math.abs(c.x - W.teams[team].spawn[0]) < Math.abs(a.x - W.teams[team].spawn[0]) ? c : a));
    return [f.x, f.y];
  }
  if (W.mode === 'escort') return [W.cart.tx, W.cart.ty]; // tiles (its x, y are pixels: carriers walked off the map)
  if (W.mode === 'siege') return team === W.attacker ? [W.gate.tx, W.gate.y1 + 1] : [W.gate.tx, W.gate.y0 - 1];
  return W.teams[team].cmd.home;
}

function deliver(W, c) {
  const G = A.G(), b = c.by, team = b.team;
  c.done = true;
  b.carry = null;
  credit(b, 'obj', 40);
  let what = '';
  const dk = ((W.rule && W.rule.deliverK) || 1) * (team === 0 ? 1 + gk(W, 'supply') : 1);
  if (W.mode === 'capture') { W.score[team] += Math.round(15 * dk); what = `거점 점수 +${Math.round(15 * dk)}`; }
  else if (W.mode === 'escort') { if (team === W.attacker) { W.cart.boost = G.t + 8 * dk; what = '수레 가속'; } else { W.cart.jam = G.t + 6 * dk; what = '수레 정지'; } }
  else if (W.mode === 'siege') {
    if (team === W.attacker && !W.gateDown) { W.gate.hp -= W.gate.maxHp * 0.07 * dk; what = `공성 화약: 성문 -${Math.round(7 * dk)}%`; if (W.gate.hp <= 0) gateBreak(W, b); }
    else if (!W.gateDown) { W.gate.hp = Math.min(W.gate.maxHp, W.gate.hp + W.gate.maxHp * 0.05 * dk); what = `성문 수리 +${Math.round(5 * dk)}%`; }
    else { const c2 = W.teams[team].cmd; healBody(W, b, c2, c2.maxHp * 0.08); what = '진영대장 회복'; }
  } else { const c2 = W.teams[team].cmd; healBody(W, b, c2, c2.maxHp * 0.1 * dk); W.score[team] += 2; what = `진영대장 회복 +${Math.round(10 * dk)}%`; }
  if (team === 0) A.say(`${b.name}: 보급 완료! (${what})`, b.hero ? 'sys' : 'party');
  if (b.hero) A.banner(`보급 완료! ${what}`);
}
function dropCrate(W, f) {
  const c = f.carry;
  f.carry = null;
  if (!c) return;
  c.by = null;
  c.x = f.tx; c.y = f.ty;
}

// 청룡전's pace: a 거점 turns at FLAG_TURN a second for each one in its circle (a crowd of five took a held 거점 in
// 3 s and a free one in 2 s), and the race is to 450 points (def.target): the three 거점 give three points a
// second between the guilds, so 300 came at 2:20~2:55 of five minutes even in an even war (balance runs) — now an
// even war runs to the time, one that holds two 거점 ends at about four minutes.
const FLAG_TURN = 0.07;
function capture(W, dt) {
  const G = A.G();
  for (const f of W.flags) {
    const [n0, n1] = countAt(W, f.x, f.y, 2.2);
    const sup0 = W.alive[0].filter(b => b.role === 'support' && Math.hypot(b.tx - f.x, b.ty - f.y) <= 2.2).length;
    const sup1 = W.alive[1].filter(b => b.role === 'support' && Math.hypot(b.tx - f.x, b.ty - f.y) <= 2.2).length;
    const heroSup = W.role === 'support' && heroIn(W, f.x, f.y, 2.2) ? W.roleK : 0;
    let push = (n0 + sup0 + heroSup) - (n1 + sup1);
    // Both guilds in the circle: it holds while they are about even; one two or more ahead turns it, slowly (by its
    // lead past one). (Any one body held it against a crowd: a hero that seldom falls kept a 거점 alone against
    // five and its guild won 9 of 10 청룡전 by the 거점 though behind in kills: balance runs.)
    f.contest = !!(n0 && n1);
    if (f.contest) { if (Math.abs(push) < 2) continue; push -= Math.sign(push); }
    if (!push) continue;
    const before = f.owner;
    // prog runs -1 (ours) .. 1 (theirs); a flag turns neutral at 0.
    f.prog = clamp(f.prog - push * dt * FLAG_TURN * (push > 0 ? 1 + gk(W, 'banner') : 1), -1, 1);
    if (f.prog <= -1 && f.owner !== 0) f.owner = 0;
    else if (f.prog >= 1 && f.owner !== 1) f.owner = 1;
    else if (Math.abs(f.prog) < 0.05 && f.owner !== -1 && Math.sign(-push) !== (f.owner === 0 ? -1 : 1)) f.owner = -1;
    // Standing in the circle is work: points for whoever holds it there.
    const who = push > 0 ? 0 : 1;
    for (const b of W.alive[who]) if (!b.gate && Math.hypot(b.tx - f.x, b.ty - f.y) <= 2.2) credit(b, 'obj', dt * 2.5);
    if (before !== f.owner && f.owner >= 0) {
      A.say(`${W.teams[f.owner].name} 문파가 ${f.name} 거점을 점령했습니다!`, f.owner === 0 ? 'sys' : 'warn');
      if (f.owner === 0) A.banner(`${f.name} 거점 점령!`);
      moment(W, `${W.teams[f.owner].name} · ${f.name} 거점 점령${heroIn(W, f.x, f.y, 2.5) && f.owner === 0 ? ' (내가 함께)' : ''}`, f.owner, { hero: f.owner === 0 && heroIn(W, f.x, f.y, 2.5), kind: 'flag' });
      for (const b of W.alive[f.owner]) if (Math.hypot(b.tx - f.x, b.ty - f.y) <= 2.5) credit(b, 'obj', 25);
    }
  }
  W.tickT = (W.tickT || 0) + dt;
  if (W.tickT >= 1) {
    W.tickT -= 1;
    for (const f of W.flags) if (f.owner >= 0) W.score[f.owner] += 1;
  }
}

function resetEscort(W) {
  const d = W.def, att = W.attacker;
  W.cart.i = 0;
  W.cart.boost = W.cart.jam = 0;
  W.teams[att].spawn = snap(W, ...d.spawnStart);
  W.teams[1 - att].spawn = snap(W, ...d.spawnEnd);
  const cs = [snap(W, ...d.cmdStart), snap(W, ...d.cmdEnd)];
  W.teams[att].cmd.home = cs[0];
  W.teams[1 - att].cmd.home = cs[1];
  for (const t of [0, 1]) for (const tr of W.teams[t].troops) tr.home = snap(W, W.teams[t].spawn[0] + (tr.id % 3 - 1) * 2, W.teams[t].spawn[1] + (t === att ? -2 : 2));
  cartPos(W);
}
function cartPos(W) {
  const c = W.cart, i = Math.floor(c.i), f = c.i - i, a = W.path[i], b = W.path[Math.min(W.path.length - 1, i + 1)];
  c.tx = Math.round(a[0] + (b[0] - a[0]) * f);
  c.ty = Math.round(a[1] + (b[1] - a[1]) * f);
  c.x = (a[0] + (b[0] - a[0]) * f) * TILE + TILE / 2;
  c.y = (a[1] + (b[1] - a[1]) * f) * TILE + TILE - 6;
  c.tx = c.x / TILE | 0; c.ty = (c.y - TILE / 2 + 6) / TILE | 0;
}
function escort(W, dt) {
  const G = A.G(), c = W.cart, att = W.attacker;
  const [n0, n1] = countAt(W, c.tx, c.ty, 3);
  const na = att === 0 ? n0 : n1, nd = att === 0 ? n1 : n0;
  c.moving = false;
  // (Moved by the attack alone in its ring, or two or more ahead of the defence there, as a 거점 turns: one
  // defender that seldom falls held it against the whole attack.)
  const lead = nd ? na - nd - 1 : na;
  if (lead > 0 && !(c.jam > G.t)) {
    const v = c.speed * (c.boost > G.t ? 1.6 : 1) * (1 + 0.1 * Math.min(4, lead - 1)) * (nd ? 0.6 : 1);
    c.i = Math.min(W.path.length - 1, c.i + v * dt);
    c.moving = true;
    for (const b of W.alive[att]) if (!b.gate && Math.hypot(b.tx - c.tx, b.ty - c.ty) <= 3) credit(b, 'obj', dt * 2);
  } else if (nd) {
    for (const b of W.alive[1 - att]) if (!b.gate && Math.hypot(b.tx - c.tx, b.ty - c.ty) <= 3) credit(b, 'obj', dt * 1.5);
  }
  cartPos(W);
  // (the half's seconds when its furthest was reached: two carts held at the same spot — 75% : 75%, the 본당's steps — went
  // to the first half's side; now to the one that got there sooner)
  if (c.i > c.best[att] + 0.01) (c.bestAt = c.bestAt || [0, 0])[att] = (W.round === 1 ? W.def.time : W.def.half) - Math.max(0, W.left);
  c.best[att] = Math.max(c.best[att], c.i);
  // (the time each took to the end: two carts both at the 본당 went to the first half's side whatever the pace)
  // (엔드게임 2차: the first half's clock is the whole war's — W.left runs from time, not half — so its side's time came out
  // negative, "-20초 : 105초", and the first half's side won every race to the 본당: now the seconds of its own half.)
  if (c.i >= W.path.length - 1 && !(c.endAt = c.endAt || [null, null])[att]) c.endAt[att] = (W.round === 1 ? W.def.time : W.def.half) - Math.max(0, W.left);
  // Half time (or the end reached): the guilds change sides.
  const done = c.i >= W.path.length - 1;
  if (W.round === 1 && (W.left <= W.def.time - W.def.half || done)) {
    W.round = 2;
    W.left = W.def.half;
    A.say(`전반 종료: ${W.teams[att].name} 문파가 ${Math.round(c.best[att] / (W.path.length - 1) * 100)}%까지 밀었습니다. 공수 교대!`, 'sys');
    A.banner('공수 교대!');
    W.attacker = 1 - att;
    // (the squads' 매복 · 우회 · 재집결 were the half's: the field turns round)
    for (const q of W.squads) { q.tac = null; q.route = null; q.routeKey = null; for (const m of q.members) m.lurk = 0; }
    resetEscort(W);
    for (const b of W.bodies) if (!b.dead) placeBody(W, b, b.home || W.teams[b.team].spawn);
    if (!G.dead) heroTo(...W.teams[0].spawn);
    W.flow.clear();
    orders(W, 0, true);
    orders(W, 1, true);
  }
}

// 현무전: the gate gives way to the guild's blows in no less than GATE_SEC seconds (hit) — about three and a half
// minutes of a whole attack on it with the 공성 화약 carried in, longer when the defence holds them off it, a minute
// and a half left for the 수성대장 (at 160 the gate fell at 2:40~2:55 and the attack won 9 of 12 wars; at 200, at
// 3:15~3:30 and the attack won 17 of 24).
// (240 → 215, 2026-11-28: with the defence's close-in out by the 쪽문 on the siege's crowd the gate fell at 3:50~4:45 against
// 3:30~4:25 before, once not at all; 215 gives back the gate's old time.)
// (215 → 240, 2026-11-28 대규모 전투 맵 확장: the siege's squads now come to the gate as one (분대 이동) and fall back to gather
// rather than feed (재집결): the gate fell at its floor, 3:30, and the defence that only fought lost 4 of 4 — balance runs.)
// (240 → 300, 엔드게임 2026-11-28: the 충차 and the shrines' gifts came on top of the guild's blows — the gate fell at 2:50~3:20
// and the defence that fought lost 2 of 2; the guild's own blows alone now take five minutes, the ram and the 화약 make the rest.)
const GATE_SEC = 300;
function siege(W, dt) {
  // The commander of the defence can be reached only once the gate is down.
  const def = 1 - W.attacker, c = W.teams[def].cmd;
  c.guardT = W.gateDown ? 0 : 1;
}
function gateBreak(W, by) {
  const G = A.G();
  if (W.gateDown) return;
  W.gateDown = true;
  W.gate.hp = 0;
  W.flow.clear();
  // The attackers' camp moves up to the broken gate; the defence, cut off, rises slower.
  W.teams[W.attacker].spawn = snap(W, W.gate.tx, W.gate.y1 + 4);
  W.slowRise = 1 - W.attacker;
  const at = G.enemies.indexOf(W.gate);
  if (at >= 0) G.enemies.splice(at, 1);
  const pt = G.party.indexOf(W.gate);
  if (pt >= 0) G.party.splice(pt, 1);
  credit(by, 'obj', 80);
  A.banner('현무 성문이 무너졌다!');
  moment(W, `현무 성문 붕괴${by === W.hero ? ' (내 일격)' : !by && W.ram ? ' (충차)' : ''}`, W.attacker, { hero: by === W.hero, big: true, kind: 'gate' });
  A.say(`${by ? by.name + '의 일격' : '충차의 마지막 일격'}에 성문이 무너졌습니다! ${W.teams[W.attacker].name} 문파가 성 안으로 들어갑니다.`, W.attacker === 0 ? 'sys' : 'warn');
  if (A.M().fx.h_kill) A.addFx('h_kill', W.gate.x, W.gate.y - 40, { scale: 2 });
  A.audio().play('kill');
  G.shake = 0.4;
  orders(W, 0, true);
  orders(W, 1, true);
}

// ---------------------------------------------------------------- commanders: orders to the squads

function orders(W, team, loud = false) {
  ordersMode(W, team, loud);
  // The war's pace over the plan: patrols over the field early, everyone on one point at the end.
  const set = (sq, x, y, kind, obj = null) => {
    const theirs = W.teams[1 - team].spawn, [sx, sy] = snap(W, x, y);
    sq.order = { x: sx, y: sy, kind, obj, face: [Math.sign(theirs[0] - sx), Math.sign(theirs[1] - sy)] };
  };
  if (W.phase === 'spread') spreadOrders(W, team, set, W.teams[team].squads);
  else if (W.phase === 'final') finalOrders(W, team, set, W.teams[team].squads);
}
function ordersMode(W, team, loud = false) {
  const G = A.G(), T = W.teams[team], foe = W.teams[1 - team];
  const squads = T.squads;
  const mine = T.spawn, theirs = foe.spawn;
  const set = (sq, x, y, kind, obj = null, say = null) => {
    const [sx, sy] = snap(W, x, y);
    const face = [Math.sign(theirs[0] - sx), Math.sign(theirs[1] - sy)];
    const changed = !sq.order || sq.order.kind !== kind || Math.abs(sq.order.x - sx) + Math.abs(sq.order.y - sy) > 3;
    sq.order = { x: sx, y: sy, kind, obj, face };
    if (changed && say && team === 0 && (loud || G.t - W.cmdSaid > 9)) {
      W.cmdSaid = G.t;
      W.chatT = G.t;
      A.say(`[${T.name} 지휘] ${say}`, 'party');
    }
  };
  const ahead = W.alive ? W.alive[team].length - W.alive[1 - team].length : 0;
  // The main body: every squad but the first goes where the guild's weight is needed.
  const blob = (x, y, kind, obj, text) => { for (let i = 1; i < squads.length; i++) set(squads[i], x + ((i % 3) - 1) * 1.5, y + (i > 2 ? 1 : -1), kind, obj, i === 1 ? text : null); };
  if (W.mode === 'capture') {
    // The guild's plan (capturePlan): keepers on our points, the rest gather and push a point.
    capturePlan(W, team, set, squads);
  } else if (W.mode === 'commander') {
    commanderPlan(W, team, set, squads, blob);
  } else if (W.mode === 'escort') {
    const c = W.cart, attack = team === W.attacker;
    const at = k => W.path[Math.min(W.path.length - 1, Math.floor(c.i) + k)];
    if (attack) {
      for (let i = 0; i < squads.length; i++) {
        const q = at(i < 2 ? 3 : 0);
        set(squads[i], q[0] + (i % 2 ? 1 : -1), q[1], 'escort', null, i === 0 ? '수레 붙어요, 다 같이 밀어요!' : null);
      }
    } else {
      for (let i = 0; i < squads.length; i++) {
        const q = i === squads.length - 1 ? at(6) : at(1);
        set(squads[i], q[0] + (i % 2 ? 1 : -1), q[1], i === squads.length - 1 ? 'hold' : 'intercept', null, i === 0 ? '수레 막아요! 전원 수레로!' : null);
      }
    }
  } else if (W.mode === 'siege') {
    const g = W.gate, attack = team === W.attacker, dc = W.teams[1 - W.attacker].cmd;
    if (attack) {
      if (!W.gateDown) {
        for (let i = 0; i < squads.length; i++) {
          set(squads[i], g.tx + (i % 3 - 1) * 1.5, g.y1 + 1 + (i > 2 ? 2 : 0), i < 3 ? 'gate' : 'hold', i < 3 ? g : null, i === 0 ? '성문에 다 붙어요! 부숴!' : null);
        }
      } else for (const sq of squads) set(sq, dc.tx, dc.ty, 'assault', dc, sq === squads[0] ? '성문 뚫렸다! 수성대장 잡으러!' : null);
    } else if (!W.gateDown) {
      // The defence holds behind its gate (gateHold): sent out before it (three of seven squads) it met the whole attack
      // in the open and lost it, 1 : 3 in kills, the gate after (balance runs). The hero's 돌격 still takes the guild out.
      for (let i = 0; i < squads.length; i++) set(squads[i], g.tx + (i % 3 - 1) * 1.5, g.y0 - 2 - (i > 2 ? 1 : 0) - (i > 4 ? 1 : 0), 'hold', null, i === 0 ? '성문 지켜요! 문 안에서 막아요!' : null);
    } else for (const sq of squads) set(sq, dc.home[0], dc.home[1] + 2, 'defend', null, sq === squads[0] ? '대장 지켜요! 전원 본진!' : null);
  }
}

// ---------------------------------------------------------------- the guild's people
// What makes the AI fighters play like people: each its own hand (quick or slow to follow an
// order, keen or not to follow the hero, one that chases a kill), the guild's plans that change
// over a war (capture: some squads push a point after gathering, some keep ours, more push when
// behind), the hero followed when it heads somewhere with purpose (or calls), the 기원 and
// buffs of the healers and supporters cast on the hero, and a few words in the chat at the
// moments that matter (rate-limited, the speech bubbles by the 말풍선 setting).

/** A fighter's own hand: set once when it is made. */
function persona(f) {
  f.skill = rnd(0.6, 1.15);
  f.heed = Math.random();                  // how readily it follows the hero
  f.lagK = rnd(0.2, 2.6) / f.skill;        // seconds it takes to act on a new order
  f.chatty = rnd(0.15, 1);
  f.greedy = Math.random() < 0.18;          // chases a kill further than it should
  f.mp = 1;                                 // a caster's mana (healers and supporters spend it)
  f.party = partyKit(f.cls, f.lv);
  // A good hand reads the red floor better and sooner, a poor one worse (on the whole as before).
  f.dodge = clamp(f.dodge + (f.skill - 0.875) * 0.3, 0.5, 0.98);
  f.react = clamp(f.react * 0.875 / f.skill, 0.08, 0.45);
}

// The buffs a class casts on others (바람's 보호·무장, the poet's 가호, the magus's 보호부 …):
// kind 'buff' spells of its class that make sense on another. 공력증강 gives its caster mana back.
const PARTY_BUFFS = {
  poet: ['p_protect', 'p_wargod', 'p_aegis', 'p_reflect', 'p_dragongod', 'p_guard'],
  mage: ['m_arm', 'm_hoche'],
  magus: ['md_enhance', 'md_amulet'],
  celestial: ['cl_yeorae'],
  reaper: ['rp_barrier'],
};
function partyKit(cls, lv) {
  if (!cls || !SK) return { heals: [], buffs: [] };
  // Its class's 기원 that are cast on another (누리의 기원 for anyone who has none: a 운공체식 or
  // 귀체 is the caster's own), the best few it knows by its level.
  const heals = Object.entries(SK).filter(([, d]) => d.kind === 'heal' && d.cls === cls.id && (d.req || 1) <= lv && !d.evolved && /기원|희원/.test(d.name))
    .sort((a, b) => (b[1].req || 1) - (a[1].req || 1)).slice(0, 2).map(([id]) => id);
  if (!heals.length || cls.id === 'poet') heals.push('c_heal');
  const buffs = (PARTY_BUFFS[cls.id] || []).filter(id => SK[id] && (SK[id].req || 1) <= lv + 6);
  return { heals, buffs, mana: cls.id === 'mage' && SK.m_gongryeok ? 'm_gongryeok' : null };
}
/** A spell's name as the caster knows it (누리의 기원's grades by level). */
function spellName(id, lv) {
  const d = SK[id];
  if (!d) return '기원';
  return d.names ? d.names[Math.min(d.names.length - 1, Math.floor((lv || 1) / 6))] : d.name;
}
function spellFx(id, lv) {
  const d = SK[id];
  if (!d) return null;
  const fx = d.fxs ? d.fxs[Math.min(d.fxs.length - 1, Math.floor((lv || 1) / 6))] : d.fx;
  return fx && A.M().fx[fx] ? fx : null;
}

// ================================================================ AI 동료: 급 · 성격 · 기술 (2차 피드백)
// Each fighter is a player of its own. Its 급 (절정고수 · 일류고수 · 이류고수 · 삼류무사 · 하수 · 입문자) is drawn round the
// hero's own 전투력 — one or two of the server's best on every side, some above the hero, most about
// it, some below — and sets its level, 승급, skill 단, life and blows, and the gear it wears from the
// game's own ladders (plain pieces for a 뉴비, raid sets and 전설 for the 상위, the 용무기·사신수·태초·
// 심연 with the 무신 갑옷·기운 or wings for the 서버급, drawn in their layers with a glow round them).
// Its 성격 sets how it plays (돌격형, 후방형, 힐 집착, 딜 욕심, 어그로 탱커), and a few a match play
// badly (잠수, 엉뚱한 곳, 혼자 돌격, 늦게 합류, 채팅만). Its kit is its class's own skills up to its
// 승급, read from SKILLS as they stand, cast in turn on their own waits (a little slower than the
// hero's) with plain blows between: everyone round a boss throws its spells together.
// cp: the least 전투력 of the 급; lv, promo, sl (skill 단), g (its gear's rank) drawn in the ranges;
// gcd: the wait after any skill; n: skills in its kit; ult: its 필살기's wait; heal: a healer's 기원 wait;
// dodge: how much better it reads a red floor; edge: its hand (how fast it acts on an order).
// The most 전투력 a class can have (game.js __maxPower at Lv 60): a fighter is never above its class's.
// (2026-11-28: 7.8만 with a shield, 7.22만 without, the 최종 무기 in — was 7.55만·6.88만.)
const AI_MAX_CP = { shield: 78000, other: 72200 };
const aiMaxCp = cls => (cls && hasShield(cls.id || cls) ? AI_MAX_CP.shield : AI_MAX_CP.other) * rnd(0.97, 1);
const AI_TIERS = {
  // 여섯 급, 무림식 이름. 상향평준화: 맨 아래(입문자)도 1만1천5백 이상, 맨 위(절정)와 4~6배.
  // The bands against the game's own ceiling, measured (game.js __maxPower: each slot's best piece at
  // full stars, every 승급, the card sets full, a Lv 60 record): 7.55만 for a class with a shield,
  // 6.88만 without (AI_MAX_CP; no fighter above its class's). Their levels likewise to the game's top,
  // Lv 60 (no cap: a whole hunt with every 승급 ends about Lv 55~58), the 절정 Lv 56~60. A hero half way through (청룡신검,
  // 4.7만) was the first of every 문파 against the old 4.2만 top.
  server: { name: '절정고수', short: '절정', col: '#ffd040', cp: 56000, top: 78000, lv: [56, 60], promo: [8, 9], sl: [8, 8], g: [14.5, 17], gcd: 0.62, n: 6, ult: 13, heal: 2.3, dodge: 0.12, edge: 0.25, step: 3, star: 4.3 },
  high: { name: '일류고수', short: '일류', col: '#ff9a5a', cp: 43000, top: 56000, lv: [50, 57], promo: [6, 8], sl: [7, 8], g: [11, 14], gcd: 0.7, n: 5, ult: 15, heal: 2.6, dodge: 0.08, edge: 0.16, step: 2, star: 3.8 },
  upper: { name: '이류고수', short: '이류', col: '#f0d080', cp: 34500, top: 43000, lv: [44, 51], promo: [4, 6], sl: [6, 7], g: [9, 11.5], gcd: 0.78, n: 5, ult: 17, heal: 2.85, dodge: 0.04, edge: 0.08, step: 2, star: 3.3 },
  mid: { name: '삼류무사', short: '삼류', col: '#a8d8ff', cp: 27000, top: 34500, lv: [37, 45], promo: [3, 5], sl: [5, 6], g: [6, 9], gcd: 0.86, n: 4, ult: 19, heal: 3.1, dodge: 0, edge: 0, step: 1, star: 2.8 },
  low: { name: '하수', short: '하수', col: '#c0c0c0', cp: 19500, top: 27000, lv: [30, 38], promo: [2, 3], sl: [3, 5], g: [4, 6.5], gcd: 0.96, n: 4, ult: 21, heal: 3.4, dodge: -0.03, edge: -0.06, step: 1, star: 2.3 },
  newbie: { name: '입문자', short: '입문', col: '#9fe08a', cp: 0, bot: 12500, top: 19500, lv: [22, 31], promo: [1, 2], sl: [2, 4], g: [2, 4.5], gcd: 1.08, n: 3, ult: 24, heal: 3.8, dodge: -0.06, edge: -0.12, step: 0, star: 1.8 },
};
const TIER_ORDER = ['server', 'high', 'upper', 'mid', 'low', 'newbie'];
// The 전투력 of the best gear and 승급 there is (about a hero's at 9차 in the 용무기 제십 and the 사신수).
const CP_TOP = 60000;
// Its 전투력 as the game reckons a hero's (combatPower: the gear's ranks, the 승급, the level).
const cpOf = (g, promo, lv) => Math.round((g * 1440 + promo * 800 + lv * 60) * (1 + 0.04 * promo));
const tierByCp = cp => TIER_ORDER.find(k => cp >= AI_TIERS[k].cp) || 'newbie';
const rint = ([a, b]) => a + Math.floor(Math.random() * (b - a + 1));
// Ways of playing. retreat: the share of its life at which it backs off (its role's own when unset).
const PLAYS = {
  steady: { name: '무난형' },
  charger: { name: '공격적 돌격형', retreat: 0.15, greedy: true, timid: false },
  careful: { name: '신중한 후방형', retreat: 0.45, timid: true },
  healbot: { name: '힐 집착', retreat: 0.35 },
  greedy: { name: '딜 욕심', greedy: true },
  aggro: { name: '어그로 탱커', retreat: 0.12, timid: false },
  afk: { name: '잠수', troll: true },
  wander: { name: '엉뚱한 곳 공격', troll: true },
  suicide: { name: '혼자 돌격', troll: true, retreat: 0, timid: false },
  late: { name: '늦게 합류', troll: true },
  chatter: { name: '채팅만 함', troll: true },
};
const TROLLS = ['afk', 'wander', 'suicide', 'late', 'chatter'];
// Their words (the party chat and bubbles, our guild's only) and the emoticon that goes with them.
const P_LINES = {
  server: ['뒤로 빠져요 제가 잡음', '필살 들어갑니다', '딜 미터기 보세요 ㅋ', '이 정도야 뭐', '제 대상 같이 쳐요', '장비빨 ㅋㅋ', '쫄지 말고 들어와요'],
  high: ['광역 들어가요', '집중 공격!', '스킬 쿨 돌았다', '좋아 밀어요', '힐러님 감사요'],
  newbie: ['이거 어떻게 해요?', '스킬 뭐 눌러요?', '처음 와봤어요 ㅎㅎ', '저 죽으면 살려주세요 ㅠ', '와 다들 세다…', '저 따라가면 돼요?'],
  charger: ['돌격!!', '들어가요!', '앞으로!', '밀어붙여!'],
  careful: ['뒤에서 칠게요', '무리하지 마요', '피 조심요', '천천히 가요'],
  healbot: ['힐 걱정 마세요', '피 빠지면 말해요', '제 근처로 오세요!', '힐 들어갑니다~'],
  greedy: ['딜 1등 가즈아', '막타는 내꺼', '딜량 보셈 ㅋ', '내 딜 어때?'],
  aggro: ['다 나한테 와!', '어그로 제가 끕니다', '탱 믿고 딜해요', '내 뒤로!'],
  afk: ['ㅈㅅ 잠수였음', '아 밥 먹고 옴', '어 벌써 시작함?', '잠깐 자리 비움'],
  wander: ['어 보스 어딨음?', '이쪽 아님?', '이거 맞나?', '여기 몹 많은데요'],
  suicide: ['나만 믿어!!', '혼자 쓸어버림', '돌격!!!', '아 또 죽었네 ㅋㅋ'],
  late: ['늦었습니다!', '지금 갑니다 ㅈㅅ', '어디로 가요?'],
  chatter: ['ㅋㅋㅋㅋㅋ', '오늘 뭐 먹지', '길마님 저 옷 샀어요', '다들 레벨 몇?', '이번 주 이벤트 뭐임?', '아 졸리다', '이따 사냥 갈 사람?', 'ㅎㅇㅎㅇ', '방금 렉 걸림 ㅋㅋ'],
};
const P_EMO = { server: 'gains', high: 'ready', newbie: 'what', chatter: 'hehe', afk: 'gone', wander: 'look', suicide: 'rage', healbot: 'cute', greedy: 'godgame', aggro: 'rage', late: 'really', charger: 'ready', careful: 'look' };
/** A name in its 급's style (the server's best wear theirs as a title; a 뉴비 a number). */
function styledName(tier, base) {
  // 절정고수: 무림의 이름 (천하·무림 앞에, 검신·대협·천존·마제 뒤에); 고수: 검객·무사·협객이 붙기도.
  if (tier === 'server') return pick([`${base}검신`, `천하${base}`, `${base}대협`, `무림${base}`, `${base}천존`, `${base}마제`, `${base}`]);
  if (tier === 'high') return Math.random() < 0.5 ? pick([`${base}검객`, `${base}무사`, `${base}협객`, `${base}대장`]) : base;
  // 입문자: 초보·꼬마·아기, 또는 뒤에 숫자 (이름이 먼저 잡혀 있던 새내기).
  if (tier === 'newbie') return pick([`초보${base}`, `꼬마${base}`, `아기${base}`, `${base}${10 + Math.floor(Math.random() * 90)}`]);
  return base;
}
/** The 전투력 of every fighter: each 문파 (or the 공격대) drawn by a make-up of its own, as a server's
 *  문파 differ: one with a lone 절정 over a crowd of 삼류, one strong all through its top, one whose
 *  1위 탱커 and 2위 딜러 stand close, one of steady middles. Each fighter's 전투력 lies within its 급's
 *  band (AI_TIERS cp … top), so the gaps stay those of six 급 a few thousand apart. team → its list. */
const SIDE_MAKES = [
  // w: the share of each 급 (절정, 일류, 이류, 삼류, 하수, 입문); lead: fixed heads (급 and how close).
  // top: the 절정 at the ceiling (AI_MAX_CP, 최종 무기 at full stars) — one or two of the server's very best.
  { name: '절정 하나', w: [0, 0.16, 0.22, 0.27, 0.21, 0.14], lead: [['server', 'top']] },
  { name: '상위권 탄탄', w: [0.2, 0.28, 0.22, 0.16, 0.09, 0.05], lead: [['server', 'top']] },
  { name: '쌍두마차', w: [0.04, 0.14, 0.24, 0.28, 0.18, 0.12], lead: [['server', 'pair'], ['server', 'pair']] },
  { name: '고른 문파', w: [0.1, 0.18, 0.24, 0.24, 0.14, 0.1] },
  { name: '삼류 중심', w: [0, 0.1, 0.24, 0.38, 0.18, 0.1], lead: [['high']] },
  { name: '절정 군단', w: [0.3, 0.26, 0.18, 0.12, 0.08, 0.06], lead: [['server', 'top'], ['server', 'top']] },
];
// How much a guild's make (SIDE_MAKES) shows in its strength: its mean 전투력 over the field's, to this power.
const FLAVOUR = 0.12;
// 전투력 → strength, one rule for the hero and every AI fighter: (전투력 / the side's middle) to CP_EXP. At the square
// root a 절정 of 7.8만 struck only 1.5 times a 삼류 of 3.4만 and the spread of the kits (a 마도사's spread spell, a
// 무사's lone blade) hid it; at 0.75 it is 1.85 times.
const CP_EXP = 0.75;
// A raid: every raider by its 전투력 against the raid's own (RAID_CP: its rung, 멧돼지왕 1.2만 … 백두선인 6.4만), the hero
// alike (W.heroPw) — not against the hero's: a weak hero's raid was carried by raiders made stronger for it (×1.35) and
// its own blows were lifted to a hero's measure whatever its gear (a hero of 5천 was second of thirty-five on the boss
// of 선계). The raiders are the same crowd whatever the raid (their 급 sets how often they cast as well — gcd, kit —
// so raiders pulled toward a hard raid's rung made up for it: 선계 fell as fast as 멧돼지왕, balance runs).
const RAID_CP = level => 8000 + 2000 * level, RAID_EXP = 0.75;
const raidPwOf = (W, cp) => clamp(Math.pow(cp / W.raidCp, RAID_EXP), 0.3, 2.2);
const bandCp = t => { const T = AI_TIERS[t], lo = T.bot || T.cp, hi = T.top; return Math.exp(rnd(Math.log(lo), Math.log(hi))); };
function sidePlan(n, make) {
  const out = [];
  let pairCp = 0;
  for (const [t, how] of make.lead || []) {
    if (out.length >= n) break;
    // 쌍두마차: the second head within a few percent of the first.
    const cp = how === 'pair' && pairCp ? clamp(pairCp * rnd(0.93, 1.05), AI_TIERS[t].cp, AI_TIERS[t].top)
      : how === 'top' ? AI_TIERS[t].top * rnd(0.93, 1) : bandCp(t);
    if (how === 'pair') pairCp = pairCp || cp;
    out.push({ cp });
  }
  const left = n - out.length, sum = make.w.reduce((x, y) => x + y, 0);
  // The rest by the shares, rounded so they add up (the largest remainders first).
  const raw = make.w.map(w => w / sum * left), cnt = raw.map(Math.floor);
  const order = raw.map((r, i) => [r - cnt[i], i]).sort((x, y) => y[0] - x[0]);
  for (let k = 0; cnt.reduce((x, y) => x + y, 0) < left; k++) cnt[order[k % order.length][1]]++;
  TIER_ORDER.forEach((t, i) => { for (let j = 0; j < cnt[i]; j++) out.push({ cp: bandCp(t) }); });
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}
function fieldPlan(W, sizes) {
  const out = {};
  W.makes = {};
  for (const t of Object.keys(sizes).map(Number)) {
    const make = pick(SIDE_MAKES);
    W.makes[t] = make.name;
    out[t] = sidePlan(sizes[t], make);
  }
  return out;
}
/** Every fighter of the war, raid or 「쟁」 its 급, gear, kit and way (called once its squads are made). */
function applyPersonas(W) {
  const G = A.G();
  W.heroCp = Math.max(1500, A.combatPower ? A.combatPower(G.cls) : 3000);
  // As many play badly on every side (two or three in a field of twenty and more, one in a small guild).
  const per = W.raid ? W.bodies.length : W.bodies.filter(b => b.cls && b.team === 0).length + 1;
  if (W.nTroll === undefined) W.nTroll = per >= 20 ? 2 + (Math.random() < 0.35 ? 1 : 0) : 1;
  const sideOf = team => W.bodies.filter(b => b.team === team && b.cls && !b.cmdr && !b.troop);
  const sides = W.raid ? [0] : teamsOf(W);
  const plans = fieldPlan(W, Object.fromEntries(sides.map(t => [t, sideOf(t).filter(b => !b.alt).length])));
  // The field's middle: the mean 전투력 of the guilds' own means (each guild's strength is taken from it, below).
  const means = sides.map(t => plans[t].length ? plans[t].reduce((x, q) => x + q.cp, 0) / plans[t].length : 0).filter(x => x > 0);
  const fieldCp = means.length ? means.reduce((x, y) => x + y, 0) / means.length : W.heroCp;
  for (const team of sides) {
    const list = sideOf(team);
    const own = list.filter(b => !b.alt);
    const plan = plans[team];
    own.forEach((b, i) => setPersona(W, b, plan[i]));
    for (const b of list) if (b.alt) setPersona(W, b, { alt: true });
    // Strength: each by its 전투력 against its side's middle (to CP_EXP: 1.5만 against 3만 is 0.6×),
    // the side as a whole a little toward the hero's (a weak hero's 문파 carries it, a top hero's
    // leans on it; ×0.8 … ×1.35), as before the field's own balance (전장 보정) on the foe.
    if (own.length && W.raid) {
      // (A raid: each by its own 전투력 against the raid's, the hero the same way — raidPwOf.)
      for (const b of list) { b.pw = raidPwOf(W, b.cp); b.maxHp = b.hp = W.refHp * fighterHpK(b.role, b.cls) * b.pw * (1 - (b.starLean || 0)); }
      W.heroPw = raidPwOf(W, W.heroCp);
    } else if (own.length) {
      const meanCp = own.reduce((x, b) => x + b.cp, 0) / own.length;
      const ind = own.map(b => Math.pow(b.cp / meanCp, CP_EXP)), mi = ind.reduce((x, y) => x + y, 0) / ind.length;
      // (The field as a whole toward the hero, as before; a guild's own make — 상위권 탄탄, 삼류 중심 … — only a
      // little over or under the field (FLAVOUR): each guild by its own mean against the hero, 상위권 탄탄
      // (4.1만) met 삼류 중심 (3.1만) 10% stronger in blows and life alike, the same make winning most wars.)
      // (Its floor 0.8 → 0.85 with the strong hero falling now: its guild no longer leaned on an untouchable hero.)
      const sideK = clamp(Math.pow(fieldCp / W.heroCp, 0.35), 0.85, 1.35) * Math.pow(meanCp / fieldCp, FLAVOUR) * (team !== 0 && !W.raid ? W.foeK || 1 : 1);
      own.forEach((b, i) => { b.pw = ind[i] / mi * sideK; b.maxHp = b.hp = W.refHp * fighterHpK(b.role, b.cls) * b.pw * (1 - (b.starLean || 0)); });
      // The hero by the same rule, as one of its guild (heroCap: its credit kept to what a fighter of its 전투력 earns);
      // the player's other classes too.
      if (team === 0) {
        W.heroPw = Math.pow(W.heroCp / meanCp, CP_EXP) / mi * sideK;
        W.heroSideK = sideK;
        for (const b of list) if (b.alt && b.cp) { b.pw = Math.pow(b.cp / meanCp, CP_EXP) / mi * sideK; b.maxHp = b.hp = W.refHp * fighterHpK(b.role, b.cls) * b.pw; }
      }
    }
    warmKitFx(W);
    for (const b of own) setPlay(W, b, defaultPlay(b));
    // The ones who play badly: not a squad's leader nor the hero's own healer.
    const cand = own.filter(b => !b.leader && !b.pocket && b.role !== 'tank');
    for (let i = cand.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [cand[i], cand[j]] = [cand[j], cand[i]]; }
    const kinds = TROLLS.slice().sort(() => Math.random() - 0.5);
    for (let i = 0; i < Math.min(W.nTroll, cand.length); i++) setPlay(W, cand[i], kinds[i]);
  }
  rankTitles(W);
}
// 칭호: each guild's five strongest by 전투력 (the hero among them) wear a star by the name, coloured
// by rank (1 금, 2 은, 3 동, 4 보라, 5 하늘). In a raid the whole 공격대 is ranked as one.
const RANK_COL = ['#ffd040', '#e8eef8', '#e0904a', '#d08aff', '#7fd0ff'];
function rankTitles(W) {
  for (const team of W.raid ? [0] : teamsOf(W)) {
    const list = W.bodies.filter(b => b.team === team && b.cls && !b.cmdr && !b.troop && b.cp);
    if (team === 0 && W.hero) list.push(W.hero);
    const cpOfB = b => (b.hero ? W.heroCp : b.cp) || 0;
    list.sort((a, b) => cpOfB(b) - cpOfB(a));
    for (const b of list) b.rank = 0;
    list.slice(0, 5).forEach((b, i) => { b.rank = i + 1; });
  }
  const r = W.hero && W.hero.rank;
  if (r) A.say(`칭호: ${W.raid ? '공격대' : '문파'} 전투력 ${r}위 ★`, 'sys');
}
/**
 * 강화: each fighter's weapon and armour at a ★ of its own (1 … STAR_MAX, as the hero's pieces), drawn about its
 * 급's middle (AI_TIERS.star) and wide, so a 급 holds both a ★2 sword on a ★5 coat and the other way round, and the
 * 급 overlap. Its 전투력 moves with them inside its 급's band (STAR_CP for each ★ over or under the middle), which its
 * strength follows (applyPersonas: by 전투력 against its guild's mean, so a guild's strength stays as it was and only
 * the spread grows); the weapon's ★ over the armour's leans it to the blow, the other way to life (STAR_LEAN a ★).
 */
const STAR_CP = 0.045, STAR_LEAN = 0.04;
function aiStars(b, T) {
  const draw = () => clamp(Math.round(T.star + (Math.random() + Math.random() + Math.random() - 1.5) * 2.2), 1, STAR_MAX);
  const st = b.stars = { weapon: draw(), armor: draw() };
  const off = st.weapon + st.armor - 2 * T.star;
  b.cp = Math.round(clamp(b.cp * (1 + STAR_CP * off), T.bot || T.cp || 1, Math.min(T.top, aiMaxCp(b.cls))));
  b.starLean = (st.weapon - st.armor) * STAR_LEAN;
}
function setPersona(W, b, slot) {
  const heroCp = W.heroCp;
  let tier, promo, lv, g;
  if (slot.alt) {
    // The player's own other class: its own level and 승급, its own gear as it is.
    promo = A.promo ? A.promo(b.cls.id) : 0;
    lv = b.lv;
    g = clamp(lv / 6, 1, 9);
    tier = tierByCp(cpOf(g, promo, lv));
  } else {
    const want = slot.cp;
    tier = tierByCp(want);
    const T = AI_TIERS[tier];
    promo = rint(T.promo);
    lv = rint(T.lv);
    g = clamp((want / (1 + 0.04 * promo) - promo * 800 - lv * 60) / 1440, T.g[0], T.g[1]);
  }
  const T = AI_TIERS[tier];
  // (Its 전투력 is the curve's own (fieldPlan), not its gear's sum: the 급's gear and 승급 ranges stepped at
  // each 급's edge and opened gaps; the gear and 승급 still show its 급.)
  // (The player's other class: the 전투력 the game shows for it, its gear and 승급 as they are.)
  const altCp = slot.alt && A.combatPower ? A.combatPower(b.cls) : 0;
  Object.assign(b, { tier, promo, lv, skl: rint(T.sl), cp: altCp || Math.min(aiMaxCp(b.cls), slot.cp ? Math.round(slot.cp) : cpOf(g, promo, lv)), gcd: T.gcd, ultCd: T.ult, healCd: T.heal });
  if (!slot.alt) {
    b.gear = aiGear(W, b.cls, tier, g);
    b.name = styledName(tier, b.name);
    aiStars(b, T);
    // Its strength against the hero's (전장 보정 keeps a little of the pull toward the field).
    const rel = clamp(Math.pow(b.cp / heroCp, CP_EXP), 0.45, 2.2);
    b.pw = (1 + (rel - 1) * 0.85) * (b.team !== 0 && !W.raid ? W.foeK || 1 : 1);
    b.maxHp = b.hp = W.refHp * fighterHpK(b.role, b.cls) * b.pw;
  }
  b.gearDesc = b.stars ? `${b.gear.wName} ★${b.stars.weapon} · ${b.gear.aName} ★${b.stars.armor}` : b.gearDesc || (b.gear && b.gear.desc) || (slot.alt ? '내 장비' : '일반 장비');
  b.yvKey = null;
  b.dodge = clamp(b.dodge + T.dodge, 0.3, 0.98);
  b.skill = clamp(b.skill + T.edge, 0.45, 1.4);
  b.lagK = rnd(0.2, 2.6) / b.skill;
  b.party = partyKit(b.cls, lv);
  b.skills = aiKit(b.cls, promo, lv, b.skl, T.n);
  b.style = warStyle(W, b);
  b.timid = timidOf(W, b);
}
function defaultPlay(b) {
  const r = Math.random(), ranged = b.kit.range > 1;
  if (b.role === 'tank') return r < 0.45 ? 'aggro' : r < 0.65 ? 'charger' : 'steady';
  if (b.role === 'healer') return r < 0.45 ? 'healbot' : r < 0.7 ? 'careful' : 'steady';
  if (b.role === 'support') return r < 0.35 ? 'careful' : r < 0.55 ? 'greedy' : 'steady';
  if (ranged) return r < 0.35 ? 'greedy' : r < 0.6 ? 'careful' : r < 0.72 ? 'charger' : 'steady';
  return r < 0.4 ? 'charger' : r < 0.6 ? 'greedy' : r < 0.7 ? 'careful' : 'steady';
}
function setPlay(W, b, play) {
  const P = PLAYS[play];
  b.play = play;
  b.greedy = P.greedy !== undefined ? P.greedy : b.greedy;
  if (P.timid !== undefined) b.timid = P.timid;
  b.retreatK = P.retreat;
  b.aggro = play === 'aggro';
  if (play === 'suicide') { b.dodge = 0.3; b.style = W.raid ? 'obj' : 'diver'; }
  if (play === 'late') b.lateT = rnd(35, 65);
  if (play === 'afk') { b.afkAt = rnd(8, 30); b.afkUntil = b.afkAt + rnd(25, 45); }
  if (play === 'chatter') b.chatty = 1;
}
/** The share of its life at which a fighter backs off (its way's, else its role's as before). */
function retreatAt(b, tank, other) { return b.retreatK !== undefined ? b.retreatK : b.role === 'tank' ? tank : other; }
/** A healer's 기원 wait: its 급's (3.2 s before), a 힐 집착 sooner. Each mends as much less, so the mending a minute holds. */
function healWait(b) { return (b.healCd || 3.2) * (b.play === 'healbot' ? 0.85 : 1); }

/** Its gear by its 급 and rank (g, 0-17): pieces of the game's ladders, worn in their own looks. */
function aiGear(W, cls, tier, g) {
  const c = cls.id, H = A.M().yhero2 && A.M().yhero2[c];
  const pool = (W.looks = W.looks || {})[c + ':' + tier] = W.looks[c + ':' + tier] || [];
  // A look shared by a few of a 급 (their frames made once): two a class and 급, three for the best.
  if (pool.length >= (tier === 'server' || tier === 'high' || tier === 'upper' ? 3 : 2) && Math.random() < 0.8) return pick(pool);
  const gear = { armor: 0, weapon: 0, shield: -1, helmet: -1, cape: -1 };
  const desc = [];
  const sp = (id, why) => {
    const s = SPECIAL[id];
    if (!s || (s.craft && s.craft.only && !s.craft.only.includes(c)) || (s.kind === 'shield' && !hasShield(c))) return false;
    const t = specialBase(s, c);
    if (t === undefined || t < 0) return false;
    gear[s.kind] = t;
    gear[s.kind + 'Sp'] = id;
    if (why) desc.push(why);
    return true;
  };
  const line = kind => (A.plainList ? A.plainList(c, kind) : null) || [];
  const plain = (kind, k) => { const l = line(kind); return l.length ? l[clamp(Math.round(k * (l.length - 1)), 0, l.length - 1)] : -1; };
  const top = H && H.layers && H.layers.weapon;
  if (tier === 'newbie' || tier === 'low' || tier === 'mid') {
    const k = clamp(g / 8.5, 0, 1);
    for (const kind of ['weapon', 'armor', 'shield', 'helmet', 'cape']) {
      if (kind === 'shield' && !hasShield(c)) continue;
      if ((kind === 'helmet' || kind === 'cape') && Math.random() < (tier === 'newbie' ? 0.75 : 0.4)) continue;
      gear[kind] = plain(kind, clamp(k + rnd(-0.12, 0.12), 0, 1));
    }
    desc.push(tier === 'newbie' ? '초보 장비' : '사냥터 장비');
    if (tier === 'mid' && Math.random() < 0.5) sp(pick(['cr_horn_weapon', 'cr_bone_weapon', 'cr_ember_weapon']), '조합 무기');
    if (tier === 'mid' && Math.random() < 0.35) sp(pick(['cr_bone_armor', 'cr_ember_armor', 'cr_jade_armor']), '조합 갑옷');
  } else {
    // A raid's set of about its rank (the 상위: 삼두룡 … 아이라바타; the server's best under the rest).
    const ids = Object.keys(RAID_GEAR).filter(id => Math.abs(RAID_GEAR[id].pow - Math.min(g, 14)) <= 2);
    const rid = ids.length ? pick(ids) : 'raid_hydra';
    for (const kind of ['weapon', 'armor', 'shield']) { const t = raidTier(rid, c, kind); if (t >= 0) gear[kind] = t; }
    desc.push(`${(A.raidName ? A.raidName(rid) : rid)} 세트`);
    gear.helmet = GEAR_LINES[c] && GEAR_LINES[c].helmet ? GEAR_LINES[c].helmet.length - 1 : -1; // the 용 투구
    gear.cape = plain('cape', rnd(0.6, 1));
    if (tier !== 'server') {
      // 일류: half in 전설; 이류: now and then.
      const lk = tier === 'high' ? 1 : 0.4;
      if (Math.random() < 0.45 * lk) sp(pick(['cr_gold_weapon', 'cr_steel_weapon']), '전설 무기');
      if (Math.random() < 0.45 * lk) sp(pick(['cr_gold_armor', 'cr_maryeong_armor', 'cr_steel_armor', 'cr_dragon_armor']), '전설 갑옷');
      if (Math.random() < 0.35 * lk) sp(pick(['cr_cape_bukdu', 'cr_cape_sari']), null);
    } else {
      // 서버 최강급: the top of the weapon ladder, worn and glowing.
      const fams = ['dragon', 'taecho', 'abyss', 'dragon'];
      if (c === 'warrior') fams.push('cheong');
      if (c === 'mage') fams.push('jujak');
      if (['warrior', 'rogue', 'mage'].includes(c)) fams.push('akma');
      const fam = pick(fams);
      const layer = v => (top && top[v] ? ((gear.aiLayer = { weapon: v }), true) : false);
      if (fam === 'dragon') {
        const step = 8 + Math.floor(Math.random() * 3), dl = DRAGON_LOOK[c] && DRAGON_LOOK[c][step];
        const v = dl && top && top['c' + dl] ? 'c' + dl : H && H.map && H.map.weapon ? H.map.weapon['dragon' + step] : null;
        if (v && layer(v)) { gear.glow = '#7fe8ff'; desc.unshift(`용무기 제${'일이삼사오육칠팔구십'[step - 1]}`); }
      } else if (fam === 'taecho' && layer('s_tc_' + c)) { gear.glow = '#ffd75a'; desc.unshift('태초의 무기'); }
      else if (fam === 'abyss' && (layer('s_ab_' + c) || (ABYSS_BASE[c] && layer('c' + ABYSS_BASE[c][0])))) { gear.glow = '#ff3a1a'; desc.unshift('심연 고유 무기'); }
      else if (fam === 'cheong' && sp('cr_sinsu_cheong', null)) { gear.glow = '#3f9dff'; desc.unshift('청룡신검'); }
      else if (fam === 'jujak' && sp('cr_sinsu_jujak', null)) { gear.glow = '#ff7a2a'; desc.unshift('주작선장'); }
      else if (fam === 'akma' && sp('cr_judge_weapon3', null)) { gear.glow = '#d0101a'; desc.unshift('악마 심판의낫'); }
      if (!gear.glow && layer('s_tc_' + c)) { gear.glow = '#ffd75a'; desc.unshift('태초의 무기'); }
      if (gear.glow) gear.wLabel = desc[0];
      // Its armour: 현무불괴갑 (wings), a 무신 set with its 기운, or the 용 파천갑.
      const r = Math.random(), s = pick(['cheong', 'baekho', 'jujak', 'hyeonmu']);
      if (r < 0.35 && sp('cr_sinsu_hyeonmu', '현무불괴갑')) gear.cape = plain('cape', 1);
      else if (r < 0.75 && sp(`cr_musin_armor_${s}`, '무신 세트')) sp(`cr_musin_cape_${s}`, '무신의 기운');
      else { sp('cr_dragon_armor', '용 파천갑'); gear.cape = plain('cape', 1); }
      if (hasShield(c)) sp(pick(['cr_shield_jibae', 'cr_shield_sura']), null);
    }
  }
  // 연's 코디 over it: a hair and a face, finer pieces higher up (never over the top weapon or armour).
  const cos = aiCostume(c, AI_TIERS[tier].step);
  if (cos) {
    if (tier === 'server' || tier === 'high' || tier === 'upper') delete cos.weapon;
    if (tier === 'server') { delete cos.armor; delete cos.cape; }
    if (Object.keys(cos).length) gear.cos = cos;
  }
  gear.desc = desc.join(' · ');
  // The weapon and the armour by their names (살펴보기, 명단: each with its wearer's own ★, aiStars).
  const nm = kind => (gear[kind + 'Sp'] && SPECIAL[gear[kind + 'Sp']] ? specialName(SPECIAL[gear[kind + 'Sp']], c) : gearName(c, kind, gear[kind])) || (kind === 'weapon' ? '무기' : '갑옷');
  gear.wName = gear.wLabel || nm('weapon');
  gear.aName = nm('armor');
  pool.push(gear);
  return gear;
}
/** A fighter's layers: its gear's as the hero's are worn (yGearVariants), the top weapons' own laid over. */
function aiVariants(cls, gear) {
  const yv = A.yGearVariants(cls, gear || {});
  const L = gear && gear.aiLayer, H = A.M().yhero2 && A.M().yhero2[cls.id];
  if (!yv || !L || !H) return yv;
  for (const [kind, v] of Object.entries(L)) {
    if (!H.layers[kind] || !H.layers[kind][v]) continue;
    yv[kind] = v;
    if (kind === 'weapon') { if (H.layers.wback && H.layers.wback[v]) yv.wback = v; else delete yv.wback; }
  }
  return yv;
}

// The skills a fighter casts: its class's attacks up to its 승급 (the strongest few, of different
// kinds where it can), its power or haste and its guard. Each on its own wait (the hero's at its 단,
// AI_CD slower), AI_GCD between any two; plain blows between.
const AI_ATK = new Set(['spell', 'strike', 'spell4', 'nova', 'cleave', 'line', 'screen', 'slash', 'blink']);
const AOE_KINDS = new Set(['screen', 'nova', 'cleave', 'line', 'spell4']);
const AI_CD = 1.25;
// A skill's blow in the field's units: SK_K × its wait^0.7 (a long wait a heavy blow), less on
// each of a spread's victims; the plain blows between at BASIC_K of what they were (the skills
// take their place: the AI's damage a minute stays about as it was, measured).
const SK_K = 1.75, SK_AOE = 0.62, BASIC_K = 0.6;
function aiKit(cls, promo, lv, sl, n) {
  const def = id => (A.tierDef ? A.tierDef(id) : SK[id]);
  const mine = [];
  for (const id of Object.keys(SK)) {
    const d = def(id);
    if (!d || d.cls !== cls.id || (d.promo || 0) > promo || (d.req || 1) > lv + 4 || d.hpCost || d.kind === 'ult' || d.kind === 'none') continue;
    if (d.evolved && sl < 8) continue;
    mine.push([id, d]);
  }
  const atk = mine.filter(([, d]) => AI_ATK.has(d.kind) && !isMend(d) && (d.dmg || 0) > 0)
    .sort((a, b) => (b[1].promo || 0) - (a[1].promo || 0) || (b[1].dmg || 0) - (a[1].dmg || 0));
  const pickd = [], kinds = new Set();
  const nAtk = Math.max(1, n - 1);
  for (const e of atk) if (pickd.length < nAtk && !kinds.has(e[1].kind)) { kinds.add(e[1].kind); pickd.push(e); }
  for (const e of atk) if (pickd.length < nAtk && !pickd.includes(e)) pickd.push(e);
  const out = pickd.map(([id, d]) => {
    const aoe = AOE_KINDS.has(d.kind) || (d.radius || 0) >= 1 || (d.count || 1) >= 2;
    const cd = Math.max(1.3, (d.cd || 3) * Math.pow(0.93, sl - 1) * AI_CD);
    return { id, kind: aoe ? 'aoe' : 'single', cd, k: Math.pow(clamp(d.cd || 2, 1, 8), 0.7) * (aoe ? SK_AOE : 1), r: d.kind === 'screen' ? 2.2 : 1.5, d };
  });
  // Its own power (or haste), then its guard, if it has room.
  const buff = mine.filter(([, d]) => d.kind === 'buff' && (d.buff === 'power' || d.buff === 'haste')).sort((a, b) => (b[1].promo || 0) - (a[1].promo || 0))[0];
  if (buff && out.length < n) out.push({ id: buff[0], kind: 'buff', cd: Math.max(10, (buff[1].cd || 12) * AI_CD), d: buff[1] });
  const shield = mine.filter(([, d]) => d.kind === 'buff' && (d.buff === 'shield' || d.buff === 'guard'))[0];
  if (shield && out.length < n + 1) out.push({ id: shield[0], kind: 'shield', cd: Math.max(12, (shield[1].cd || 14) * AI_CD), d: shield[1] });
  return out;
}
/** The sheets a fighter's skill draws from (the hero's cast of it at the fighter's 단: game.js skillSheets). */
function aiSkillFx(b, id) {
  return SK[id] ? A.skillSheets(id, b.skl || 1) : [];
}
/** How many sheets the field's kits draw from (a test's count: they load as fighters come near, nearKitFx). */
function warmKitFx(W) {
  const seen = new Set();
  for (const b of W.bodies) for (const s of b.skills || []) for (const fx of aiSkillFx(b, s.id)) seen.add(A.M().fx[fx].src || fx);
  W.kitFx = seen.size;
  W.kitFxAt = 0;
}
/** Twice a second: the kits' pictures of the fighters in view or about to be loaded ahead (off
 *  the main thread) while the effects' budget has room — what is about to be cast in view is in when
 *  it is cast; one cast before it is in shows the caster's cue and its blow without the picture. */
function nearKitFx(W) {
  const G = A.G();
  if (G.t < (W.kitFxAt || 0)) return;
  W.kitFxAt = G.t + 0.5;
  const c = window.__warCam, x = c ? c[0] : G.player.x, y = c ? c[1] : G.player.y, mx = A.VW() / 2 + 120, my = A.VH() / 2 + 120;
  const ids = new Set();
  for (const b of W.bodies) {
    if (b.dead || !b.skills || Math.abs(b.x - x) > mx || Math.abs(b.y - y) > my) continue;
    for (const s of b.skills) for (const fx of aiSkillFx(b, s.id)) ids.add(fx);
  }
  if (ids.size && A.fxRoom()) A.fxWarm(ids);
}
/** One skill of the fighter's turn, if one is ready and it suits; true when it cast. */
function castSkills(W, b, t, many, big) {
  const G = A.G();
  if (!b.skills || !b.skills.length || G.t < (b.gcdT || 0)) return false;
  if (b.role === 'healer' && (b.play === 'healbot' || (t && t.kind === 'boss' && Math.random() < 0.4))) return false;
  const sk = b.sk || (b.sk = {});
  const haste = b.hasteT > G.t ? 0.65 : 1;
  for (const s of b.skills) {
    if (G.t < (sk[s.id] || 0)) continue;
    if (s.kind === 'shield' && hpk(b) > 0.6) continue;
    if (s.kind === 'buff' && (b.powT > G.t || b.hasteT > G.t)) continue;
    // A spread spell where it spreads (a crowd, the gate, a boss), else the single blows.
    if (s.kind === 'aoe' && !(many >= 2 || big) && b.skills.some(x => x.kind === 'single' && G.t >= (sk[x.id] || 0))) continue;
    sk[s.id] = G.t + s.cd * rnd(0.9, 1.15) * haste;
    b.gcdT = G.t + b.gcd * (b.role === 'healer' ? 1.7 : 1) * (b.play === 'chatter' ? 2 : 1) * rnd(0.85, 1.2) * haste;
    // (nothing in the hero's reach of it — a blink with no foe ahead —: not cast, the next one tried)
    if (castSkill(W, b, t, s)) return true;
    sk[s.id] = G.t + 0.5;
    b.gcdT = G.t;
  }
  return false;
}
function castSkill(W, b, t, s) {
  const G = A.G(), d = s.d, name = spellName(s.id, b.lv);
  const CS = W.castStat || (W.castStat = { cast: 0, vis: 0, shown: 0, nofx: 0 });
  if (s.kind === 'buff' || s.kind === 'shield') {
    if (s.kind === 'shield') b.shield = Math.max(b.shield || 0, G.t + 3);
    else if (d.buff === 'haste') b.hasteT = G.t + Math.min(5, d.duration || 4);
    else { b.powT = G.t + Math.min(5, d.duration || 4); b.powK = 1 + Math.min(0.3, (d.power || 0.4) * 0.4); }
    if (onScreen(b) && fxOk() && aiCast(W, b, s.id, { at: t })) { cue(b, 0.75); CS.shown++; }
    tally(b, s.kind === 'shield' ? 'buff' : s.kind);
    CS.cast++;
    if (Math.random() < 0.4) shout(W, b, name);
    sound(W, b, 'skill_' + s.id, 'buff');
    pose(b, 'cast');
    return true;
  }
  const n = W.U * b.pw * SK_K * s.k * (t.gate ? (s.kind === 'aoe' ? 1.6 : 1.1) : 1);
  // 같은 기술은 같은 그림 · 이펙트=판정: the hero's own cast of the skill at the fighter's 단 (aiCast) — its pictures, their
  // size and place, and what it strikes (a spread one: the first three struck in full, more sharing their blow).
  // (On a boss the pictures of a whole raid land on the same few tiles: a few at a time there, the
  // rest struck unseen with the caster's cue; drawn over each other they were most of a phone's frame.)
  const seen = (onScreen(b) || onScreen(t)) && (t.kind !== 'boss' || A.fxBudget('aiBoss', 8)) && fxOk(s.kind === 'aoe');
  const went = aiCast(W, b, s.id, { at: t, n, draw: seen, onHit: (e, k) => { if (k === 3 && !W.raid && Math.random() < 0.5) { scatterFrom(W, t, s.r); burstAt(W, t); } } });
  if (!went) return false;
  tally(b, s.kind);
  CS.cast++;
  if (onScreen(b) || onScreen(t)) CS.vis++;
  if (seen) { cue(b, s.kind === 'aoe' ? 1 : 0.75); CS.shown++; } else CS.nofx++;
  if (window.__aiProbe) window.__aiProbe({ id: s.id, kind: s.kind, by: b, seen }); // test
  if (Math.random() < (b.tier === 'server' ? 0.5 : 0.3)) shout(W, b, name);
  sound(W, b, 'skill_' + s.id, 'spell');
  pose(b, blowPose(b, true));
  return true;
}
/** A blow under an AI picture that stays `life` s: [[delay, share], …] — at once when it is soon gone, else half at
 *  once and the rest in beats about every 0.4 s while it stays (a phone's worth: never more than four). */
function aiBeats(life) {
  const span = life - 0.25;
  if (!(span > 0.9)) return [[0, 1]];
  const m = Math.min(4, Math.max(2, Math.round(span / 0.4))), out = [[0, 0.5]];
  for (let i = 1; i <= m; i++) out.push([(i * span) / m, 0.5 / m]);
  return out;
}
/** Test counters: what each fighter cast (kinds as the 'before' build counted them). */
function tally(b, k) { const T = b.tally || (b.tally = {}); T[k] = (T[k] || 0) + 1; }

/** The ones who play badly, before they think as the rest: true when this thought was theirs. */
function trollThink(W, b) {
  const pl = b.play;
  if (!pl || !PLAYS[pl].troll) return false;
  const G = A.G();
  if (pl === 'late') {
    if (W.t < b.lateT) { b.dest = W.raid ? W.camp : W.teams[b.team].spawn; b.target = null; return true; }
    if (!b.joined) { b.joined = true; personaTalk(W, b, true); }
    return false;
  }
  if (pl === 'afk') {
    if (W.t >= b.afkAt && W.t < b.afkUntil && b.state !== 'retreat') {
      b.dest = null;
      b.target = null;
      if (!b.afkSaid) { b.afkSaid = true; emo(b, 'gone'); }
      return true;
    }
    if (W.t >= b.afkUntil) {
      b.afkAt = W.t + rnd(30, 60);
      b.afkUntil = b.afkAt + rnd(20, 40);
      b.afkSaid = false;
      personaTalk(W, b, true);
    }
    return false;
  }
  if (pl === 'chatter') {
    if (Math.random() < 0.04) personaTalk(W, b);
    return Math.random() < 0.4;
  }
  if (pl === 'wander') {
    if (W.t > (b.wanderUntil || 0)) {
      b.wanderUntil = W.t + rnd(6, 11);
      b.wanderTo = Math.random() < 0.55 ? snap(W, rnd(2, W.map.cols - 3), rnd(2, W.map.rows - 3)) : null;
      if (b.wanderTo && Math.random() < 0.3) personaTalk(W, b);
    }
    if (!b.wanderTo) return false;
    b.dest = Math.abs(b.wanderTo[0] - b.tx) + Math.abs(b.wanderTo[1] - b.ty) > 1 ? b.wanderTo : null;
    const t = nearest(W, b, b.kit.range + 0.5);
    if (t) act(W, b, t);
    else if (!b.dest && Math.random() < 0.15) pose(b, blowPose(b, true)); // swinging at the air
    return true;
  }
  if (pl === 'suicide') {
    b.state = 'go';
    if (W.raid) return false; // (it stands in front of the boss and never steps back)
    const foes = teamsOf(W).filter(x => x !== b.team), ft = W.teams[b.goTeam !== undefined ? b.goTeam : (b.goTeam = pick(foes))];
    const goal = ft.cmd && !ft.cmd.dead ? ft.cmd : { tx: ft.spawn[0], ty: ft.spawn[1] };
    if (Math.abs(goal.tx - b.tx) + Math.abs(goal.ty - b.ty) > 3) {
      b.dest = [goal.tx, goal.ty];
      const t = nearest(W, b, b.kit.range + 0.5);
      if (t) act(W, b, t);
      return true;
    }
    return false;
  }
  return false;
}
/** A fighter's own words by its 급 and way (our guild's only; bubbles near the hero, a line in the chat). */
function personaTalk(W, b, must = false) {
  if (!b.play || b.team !== 0) return;
  const P = PLAYS[b.play];
  const pool = P.troll ? P_LINES[b.play] : (b.tier === 'server' || b.tier === 'newbie' || b.tier === 'high') && Math.random() < 0.6 ? P_LINES[b.tier] : P_LINES[b.play];
  if (!pool) return;
  const key = P.troll ? b.play : b.tier;
  chat(W, b, 'p' + b.id, pool, { every: b.play === 'chatter' ? 7 : 26, p: must ? 1 : 0.7, must, gap: 6, emo: Math.random() < 0.45 ? P_EMO[b.play] || P_EMO[key] : null });
}
/** A glow round the best weapons (태초 gold, 심연 red, 사신수 blue/fire, 용무기 cyan): one kept picture a colour. */
const glowPics = new Map();
function drawGlow(ctx, b, col) {
  let pic = glowPics.get(col);
  if (!pic) {
    pic = document.createElement('canvas');
    pic.width = pic.height = 64;
    const g = pic.getContext('2d'), gr = g.createRadialGradient(32, 32, 3, 32, 32, 32);
    gr.addColorStop(0, col + 'cc');
    gr.addColorStop(0.5, col + '55');
    gr.addColorStop(1, col + '00');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    glowPics.set(col, pic);
  }
  const G = A.G(), a = 0.7 + 0.25 * Math.sin(G.t * 4 + b.id);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = a;
  ctx.drawImage(pic, Math.round(b.x - 34), Math.round(b.y - 62), 68, 68);
  ctx.restore();
}
/** The 급 and spec of a body for the boards (the hero's from its own 전투력 and 승급). */
function specOf(W, b) {
  if (b.hero) {
    const cp = W.heroCp || (A.combatPower ? A.combatPower(A.G().cls) : 0), tier = tierByCp(cp);
    return { tier, cp, promo: W.tier !== undefined ? W.tier : A.promo ? A.promo(A.G().cls.id) : 0, lv: A.G().player.lvl, play: '나', gear: '내 장비' };
  }
  if (!b.tier) return null;
  return { tier: b.tier, cp: b.cp, promo: b.promo, lv: b.lv, sl: b.skl, play: PLAYS[b.play] ? PLAYS[b.play].name : '', gear: b.gearDesc || '' };
}
/** Test: every fighter's persona and spec (and, at the end, what it did). */
function aiPersonas() {
  const G = A.G(), W = G && G.war;
  if (!W) return null;
  return W.bodies.filter(b => b.cls).map(b => ({
    name: b.name, team: b.team, cls: b.cls.name, role: b.role, tier: b.tier, play: b.play, lv: b.lv, promo: b.promo, sl: b.skl, cp: b.cp, pw: +(b.pw || 1).toFixed(2),
    hp: Math.round(b.maxHp / W.refHp * 100) / 100, kit: (b.skills || []).map(s => SK[s.id] ? SK[s.id].name : s.id), gear: b.gearDesc, glow: b.gear && b.gear.glow || null,
    dmg: Math.round(b.stats.dmg / (W.refHp / 22)), heal: Math.round(b.stats.heal / (W.refHp / 22)), deaths: b.stats.deaths, alive: Math.round(b.aliveT || 0), tally: b.tally || {},
  })).concat([{ hero: true, cp: W.heroCp, t: W.t, refU: W.refHp / 22, heroDmg: Math.round(W.hero.stats.dmg / (W.refHp / 22)), heroBoss: Math.round((W.hero.stats.boss || 0) / (W.refHp / 22)) }]);
}

// ------------------------------------------------ words: the chat and the bubbles

/**
 * A fighter speaks: a bubble over its head (drawn near the hero, by the 말풍선 setting) and, when
 * it is near the hero or in its squad and the chat is not busy, a line in the party chat. Each
 * kind of line has its own wait, the guild's lines are a few seconds apart, and a quiet one
 * speaks less.
 */
function chat(W, b, kind, lines, o = {}) {
  const G = A.G();
  if (!b || b.dead || b.team !== 0 || !lines.length) return false;
  const kinds = W.chatK || (W.chatK = {});
  if (G.t - (kinds[kind] || -99) < (o.every || 14)) return false;
  if (!o.must && Math.random() > (o.p === undefined ? 1 : o.p) * (0.4 + 0.6 * (b.chatty || 0.5))) return false;
  if (G.t - (b.talked || -99) < 6) return false;
  kinds[kind] = G.t;
  b.talked = G.t;
  const text = typeof lines === 'string' ? lines : pick(lines);
  b.bubble = { text: text.length > 14 ? text.slice(0, 13) + '…' : text, t: G.t };
  if (o.emo) emo(b, o.emo);
  const near = d2(b, W.hero) < 14 || b.squad === W.hero.squad;
  if (near && G.t - (W.chatT || -99) >= (o.gap || 3.5)) {
    W.chatT = G.t;
    A.say(`${b.name}: ${text}`, 'party');
    if (W.diag) W.diag.lines = (W.diag.lines || 0) + 1;
  }
  return true;
}
/** One of the official emoticons over a fighter (the 말풍선 setting hides them). */
function emo(b, key) {
  const G = A.G();
  if (!A.settings().bubbles || !A.M().emote || !A.M().emote[key]) return;
  if (b.emo && G.t - b.emo.t < 2.2) return;
  b.emo = { key, t: G.t };
}
function drawEmo(b, y) {
  const G = A.G(), e = b.emo;
  if (!e || !A.settings().bubbles) return;
  const age = G.t - e.t, def = A.M().emote && A.M().emote[e.key], im = A.images[`emote/${e.key}.png`];
  if (age > 2.2 || !def || !im || !im.width) return;
  const ctx = A.ctx, f = Math.floor((age * 1000) / def.dur) % def.n, s = 40 * (0.6 + 0.4 * Math.min(1, age / 0.12));
  ctx.save();
  ctx.globalAlpha = age < 1.9 ? 1 : Math.max(0, 1 - (age - 1.9) / 0.3);
  ctx.drawImage(im, f * 64, 0, 64, 64, Math.round(b.x - s / 2), Math.round(y - s), Math.round(s), Math.round(s));
  ctx.restore();
}
/** A few of the guild answer the hero's call, one after another. */
function answers(W, who, lines, n) {
  const G = A.G();
  const pool = who.filter(b => !b.dead).sort(() => Math.random() - 0.5).slice(0, n);
  pool.forEach((b, i) => A.later(rnd(0.5, 1.2) + i * rnd(0.6, 1.4), () => {
    if (W.over || b.dead) return;
    b.talked = -99;
    const text = pick(lines);
    b.bubble = { text, t: A.G().t };
    if (i === 0 || Math.random() < 0.5) { W.chatT = A.G().t; A.say(`${b.name}: ${text}`, 'party'); }
    if (Math.random() < 0.4) emo(b, pick(['ready', 'bros', 'gains']));
  }));
}

// ------------------------------------------------ orders as each one hears them

/**
 * The order a fighter acts on: its squad's, or the hero's lead when it follows the hero; a new
 * one heard after its own moment (some at once, some seconds late), so a squad does not turn in
 * lockstep.
 */
function myOrder(W, b) {
  const G = A.G(), sq = b.squad;
  let o = sq.order || { x: W.teams[b.team].spawn[0], y: W.teams[b.team].spawn[1], kind: 'hold' };
  if (b.team === 0 && following(W, b)) o = W.lead.order;
  if (!b.ord) { b.ord = o; return o; }
  // (Once it follows the hero, it keeps up with it.)
  const far = b.ord.kind !== o.kind || (o.kind !== 'follow' && Math.abs(b.ord.x - o.x) + Math.abs(b.ord.y - o.y) > 6);
  if (far) {
    const p = b.pend;
    if (!p || p.kind !== o.kind || Math.abs(p.x - o.x) + Math.abs(p.y - o.y) > 6) { b.pend = o; b.ordAt = G.t + (b.lagK || 0.5) * rnd(0.4, 1) * (o.kind === 'follow' ? 0.6 : 1); }
    // A call of the hero's is heard sooner.
    if (G.t < b.ordAt && !(o.kind === 'follow' && W.callUntil > G.t && G.t > b.ordAt - 1.2)) return b.ord;
  }
  b.pend = null;
  b.ord = o;
  return o;
}
function following(W, b) {
  const G = A.G(), L = W.lead;
  if (!L || !L.on || !L.order) return false;
  if (b.squad === W.hero.squad) return b.heed > 0.12 || W.callUntil > G.t;
  return b.followT > G.t;
}

// ------------------------------------------------ the hero leads

/** Where the hero is heading with purpose: a point not ours, the cart, the enemy's 진영대장 or gate, the boss. */
function heroObjective(W) {
  const G = A.G(), p = G.player;
  const near = (x, y, r) => Math.hypot(p.tx - x, p.ty - y) <= r;
  if (W.raid || W.jaeng) {
    const bs = W.boss;
    if (bs && near(bs.tx, bs.ty, 7)) return { x: bs.tx, y: bs.ty, kind: 'boss' };
    if (W.seals) for (const f of W.seals) if (f.owner !== 0 && near(f.x, f.y, 4)) return { x: f.x, y: f.y, kind: 'flag', f };
    return null;
  }
  if (W.flags) for (const f of W.flags) if (f.owner !== 0 && near(f.x, f.y, 4)) return { x: f.x, y: f.y, kind: 'flag', f };
  if (W.mode === 'escort' && W.cart && near(W.cart.tx, W.cart.ty, 4)) return { x: W.cart.tx, y: W.cart.ty, kind: 'cart' };
  const ec = W.teams[1].cmd;
  if (ec && !ec.dead && near(ec.tx, ec.ty, 7)) return { x: ec.tx, y: ec.ty, kind: 'cmdr' };
  if (W.gate && !W.gateDown && W.gate.team === 1 && near(W.gate.tx, W.gate.y1 + 1, 4)) return { x: W.gate.tx, y: W.gate.y1 + 1, kind: 'gate' };
  const es = W.teams[1].spawn;
  if (near(es[0], es[1], 12)) return { x: p.tx, y: p.ty, kind: 'deep' };
  return null;
}

/**
 * Once a second: is the hero leading? It is when it calls (집결), when it stands on an objective
 * of the enemy's or walks off with purpose away from where its squad was sent (not when it walks
 * home). Its squad follows (bar one now and then), allies near join in by their own will; a
 * squad keeping a point stays unless called.
 */
function heroLead(W) {
  const G = A.G(), p = G.player, h = W.hero, sq = h.squad;
  const L = W.lead || (W.lead = { on: false, trail: [], order: null, onT: 0, pend: 0, stillT: 0, lastWant: 0, n: 0 });
  L.trail.push([p.tx, p.ty]);
  if (L.trail.length > 5) L.trail.shift();
  // The hero fallen on the way: those following go on to where it was heading a while.
  if (G.dead && L.on && !W.over) {
    if (!L.deadT) L.deadT = G.t + (L.objKind === 'move' ? 4 : 10);
    if (G.t < L.deadT) return;
  }
  L.deadT = 0;
  if (G.dead || W.over || (W.countdown || 0) > 0) { if (L.on) { L.on = false; L.off = 'dead'; } L.pend = 0; return; }
  const called = W.callUntil > G.t;
  const base = sq.order;
  const sp = W.teams[0].spawn;
  const dBase = base ? Math.abs(p.tx - base.x) + Math.abs(p.ty - base.y) : 0;
  const dHome = Math.abs(p.tx - sp[0]) + Math.abs(p.ty - sp[1]);
  const t0 = L.trail[0];
  const moved = Math.abs(p.tx - t0[0]) + Math.abs(p.ty - t0[1]);
  const homeward = dHome < Math.abs(t0[0] - sp[0]) + Math.abs(t0[1] - sp[1]) - 2;
  const obj = heroObjective(W);
  if (moved > 0) L.stillT = G.t;
  const lazy = G.t - L.stillT > 25 && !obj;     // stood about long, nowhere in particular
  const want = called || (!W.raid && dHome > 7 && !homeward && !lazy && (obj ? dBase > 3 : dBase > 7 && (moved >= 4 || (L.on && dBase > 5))))
    || (W.raid && !homeward && !lazy && dBase > 6 && (moved >= 4 || (L.on && dBase > 4)) && (!W.boss || d2(h, W.boss) > 5));
  if (want) { L.lastWant = G.t; if (!L.pend) L.pend = G.t; } else L.pend = 0;
  const go = want && (called || obj || G.t - L.pend >= 1);
  const face = [Math.sign(W.teams[1].spawn[0] - p.tx), Math.sign(W.teams[1].spawn[1] - p.ty)];
  if (L.on && !go && (homeward || dBase <= 3 || lazy || G.t - L.lastWant > 4)) { L.on = false; L.off = homeward ? 'home' : dBase <= 3 ? 'base' : lazy ? 'lazy' : 'want'; }
  if (go || L.on) {
    if (L.on && obj) L.objKind = obj.kind;
    const at = obj && obj.kind === 'flag' ? [obj.x, obj.y] : [p.tx, p.ty];
    const prev = L.order;
    // Kept still while the hero is within a few tiles of it (a new spot each step was a new
    // path for every follower).
    if (!prev || !L.on || Math.abs(prev.x - at[0]) + Math.abs(prev.y - at[1]) > 2) L.order = { x: at[0], y: at[1], kind: 'follow', obj: null, face };
  }
  if (go) {
    if (!L.on) {
      L.on = true;
      L.onT = G.t;
      L.n++;
      L.objKind = obj ? obj.kind : called ? 'call' : 'move';
      const mates = sq.members.filter(m => !m.hero && !m.dead);
      const lines = W.raid ? ['같이 가요!', '따라갈게요', 'ㄱㄱ'] : !obj ? ['어디 가요? 따라감', '같이 가요!', 'ㄱㄱ 따라갑니다'] : obj.kind === 'flag' ? ['거점 먹으러 가요!', '같이 먹어요 ㄱㄱ', '따라갈게요!']
        : obj.kind === 'cmdr' ? ['대장 잡으러 가요?', '따라갑니다!'] : obj.kind === 'cart' ? ['수레 붙어요!', '같이 밀어요'] : ['같이 가요!', '따라갈게요'];
      if (!called && mates.length) chat(W, pick(mates), 'follow', lines, { every: 20, p: 0.8, emo: Math.random() < 0.5 ? 'ready' : null });
    }
    // Allies near (not those keeping a point) join by their own will, each asked once a lead.
    const r = called ? 14 : obj ? 9 : 6;
    for (const b of W.alive[0]) {
      const ask = L.n * 1000 + Math.floor(G.t / 10) + (called ? 0.5 : 0);
      if (b.hero || b.troop || b.cmdr || b.gate || b.squad === sq || b.leadAsk === ask || b.followT > G.t) continue;
      if (Math.abs(b.tx - p.tx) + Math.abs(b.ty - p.ty) > r) continue;
      if (b.squad.keep && !called) continue;
      b.leadAsk = ask;
      if (Math.random() < b.heed * (called ? 1.2 : obj ? 0.8 : 0.5)) b.followT = G.t + rnd(14, 26);
    }
  }
  if (W.diag) W.diag.leadT = (W.diag.leadT || 0) + (L.on ? 1 : 0);
}

/** The 집결 key (대항전·레이드): the hero calls those near to follow it. */
function heroCall() {
  const G = A.G(), W = G && G.war;
  if (!W || W.over || G.dead || (W.countdown || 0) > 1) return;
  if (G.t - (W.callT || -99) < 6) return;
  W.callT = G.t;
  W.callUntil = G.t + 22;
  const p = G.player;
  const text = pick(W.raid ? ['다들 이쪽으로 모여요!', '모여요!'] : ['따라와요!', '모여요! 같이 가요', '여기로 모여요!']);
  G.bubble = { text, t: G.t };
  A.say(`${W.hero.name}: ${text}`, 'party');
  W.chatT = G.t;
  heroLead(W);
  const near = W.alive[0].filter(b => !b.hero && !b.troop && !b.cmdr && !b.gate && Math.abs(b.tx - p.tx) + Math.abs(b.ty - p.ty) <= 14);
  answers(W, near.filter(b => following(W, b)), ['ㅇㅋ', '갑니다!', '넵 따라감', '가요 가요', 'ㄱㄱ'], 2);
  if (W.diag) W.diag.calls = (W.diag.calls || 0) + 1;
}

// ------------------------------------------------ 대항전 지휘 선택 (data.js WAR_COMMANDS)
// Once a minute (from 0:20) the hero is asked how the guild fights the next minute: 돌격 (every
// squad on the enemy's objective), 수비 (half of them on ours), 우회 (two squads round the side) or
// 집결 (everyone to the hero). The panel does not stop the war; left unanswered for twelve seconds
// the guild's commander goes on as it was. What the minute brought (kills and the score) is told in
// the chat and shown on the results.

/** What a command means in this war's mode (the panel's small line). */
function cmdDesc(W, kind) {
  const att = W.mode === 'siege' ? W.attacker === 0 : W.mode === 'escort' ? W.attacker === 0 : true;
  const m = {
    capture: { charge: '내 곁(12칸)의 적 거점에 전원', hold: '우리 거점 지키기 · 한 분대 길목 매복', flank: '두 분대가 옆길로 돌아 다른 거점', rally: '나를 따라' },
    commander: { charge: '적 진영대장 돌격', hold: '우리 대장 곁 수비 · 한 분대 매복', flank: '옆길로 돌아 대장 기습', rally: '나를 따라' },
    escort: att ? { charge: '수레 앞으로 밀기', hold: '수레 곁 지키기', flank: '앞길 미리 정리', rally: '나를 따라' } : { charge: '수레로 요격', hold: '길목에서 막기', flank: '앞길 매복', rally: '나를 따라' },
    siege: att ? { charge: '성문 총공격', hold: '물러나 정비', flank: '성문 양옆 공격', rally: '나를 따라' } : { charge: '쪽문으로 전원 출격', hold: '전원 성문 안 수비', flank: '근접만 쪽문 출격·양옆 막기', rally: '나를 따라' },
  }[W.mode] || {};
  return m[kind] || WAR_COMMANDS[kind].desc;
}
function warCommands(W, dt) {
  const G = A.G();
  const C = W.cmds || (W.cmds = { next: 20, ask: null, cur: null, log: [] });
  if ((W.countdown || 0) > 0 || W.over) return;
  if (C.cur && W.t >= C.cur.until) cmdEnd(W, C);
  if (C.ask && W.t >= C.ask.until) { C.ask = null; cmdPanel(W); A.say('[지휘] 선택이 없어 문파 지휘관이 판단합니다', 'sys'); }
  if (!C.ask && !C.cur && W.t >= C.next && W.left > 25) {
    C.ask = { at: W.t, until: W.t + WAR_COMMAND_PICK };
    C.next = W.t + WAR_COMMAND_EVERY;
    cmdPanel(W);
    A.say('[지휘] 다음 1분, 문파를 어떻게 움직일까요? (돌격 · 수비 · 우회 · 집결)', 'sys');
  }
  if (C.ask) {
    const el = document.getElementById('wc-left');
    const n = Math.max(0, Math.ceil(C.ask.until - W.t));
    if (el && el.textContent !== String(n)) el.textContent = n;
  }
}
function cmdPanel(W) {
  const el = document.getElementById('war-cmd'), C = W.cmds;
  if (!el) return;
  if (!C || !C.ask || W.over) { el.hidden = true; el.innerHTML = ''; return; }
  el.innerHTML = `<div class="wc-h">지휘 선택 · 다음 1분 (<span id="wc-left">${WAR_COMMAND_PICK}</span>초)</div><div class="wc-row">${Object.entries(WAR_COMMANDS)
    .map(([k, c]) => `<button data-wcmd="${k}" title="${c.desc}">${c.name}<small>${cmdDesc(W, k)}</small></button>`).join('')}</div>`;
  el.querySelectorAll('[data-wcmd]').forEach(b => { b.onclick = e => { e.stopPropagation(); warCommand(b.dataset.wcmd); }; });
  el.hidden = false;
}
/** The hero's choice (the panel's keys, or window.__warCmd(kind)). */
function warCommand(kind) {
  const G = A.G(), W = G && G.war;
  if (!W || W.raid || W.jaeng || W.over || !WAR_COMMANDS[kind]) return false;
  const C = W.cmds || (W.cmds = { next: 20, ask: null, cur: null, log: [] });
  if (C.cur) cmdEnd(W, C);
  C.ask = null;
  cmdPanel(W);
  const def = WAR_COMMANDS[kind];
  C.cur = { kind, at: W.t, until: W.t + WAR_COMMAND_EVERY - 6, kills: W.teams.map(t => t.kills), score: W.score.slice(), prog: progressNow(W) };
  C.next = C.cur.until + 4;
  const sq = W.teams[0].squads;
  // 우회: the last two squads (not the hero's) go round; 집결: all follow the hero.
  for (const q of sq) q.flank = false;
  if (kind === 'flank') sq.filter(q => q !== W.hero.squad).slice(-2).forEach(q => { q.flank = true; });
  // 수비 (2026-11-28): one of the squads kept back lies in wait on the enemy's way in (squadTactics' 매복, asked at once).
  for (const q of sq) q.ambushAsk = false;
  if (kind === 'hold' && W.mode !== 'siege') {
    const a = sq.filter((q, i) => q !== W.hero.squad && i % 2 === 0).pop();
    if (a) { a.ambushAsk = true; if (W.sqs && W.sqs[0]) W.sqs[0].ambushT = 0; }
  }
  // (주작전 수비의 우회 '앞길 매복': the first flanker lies in wait on the road ahead of the cart.)
  if (kind === 'flank' && W.mode === 'escort' && W.attacker !== 0) {
    const a = sq.find(q => q.flank);
    if (a) { a.ambushAsk = true; if (W.sqs && W.sqs[0]) W.sqs[0].ambushT = 0; }
  }
  if (kind === 'rally') {
    W.callUntil = G.t + (C.cur.until - W.t);
    W.callT = G.t;
    for (const b of W.alive[0]) if (!b.hero && !b.troop && !b.cmdr && !b.gate && !b.carry) b.followT = G.t + (C.cur.until - W.t);
    heroLead(W);
  }
  commandOrders(W);
  const text = { charge: '전원 돌격! 밀어붙여요!', hold: '수비! 우리 쪽 지켜요!', flank: '두 분대 옆으로 돌아요! 기습!', rally: '전원 나한테 모여요!' }[kind];
  G.bubble = { text, t: G.t };
  A.say(`[지휘] ${def.name} — ${cmdDesc(W, kind)} · ${def.desc}`, 'party');
  A.banner(`지휘 · ${def.name}`);
  const near = W.alive[0].filter(b => !b.hero && b.squad && b.squad.leader === b);
  answers(W, near, ['ㅇㅋ 갑니다!', '넵 지휘 따라요', '알겠어요!', 'ㄱㄱ'], 2);
  return true;
}
// ------------------------------------------------ 전술: the hero's own keys in a war (집중 · 총공격 · 후퇴)
// (2026-11-28) A war fought by itself was won or lost by the dice whatever the player did: the minute's command was
// worth a tenth either way and nothing else the hero did reached its guild. Three keys of the hero's own, each with its
// cooldown, each worth something only when used at the right moment:
// - 집중: the foe the hero picks (its healer, the weakest, the 진영대장 near it) is the target of every ally near it for
//   8 s, struck 50% harder — a fight's numbers turned by a kill made at once rather than blows spread over five;
// - 총공격: the allies about the hero strike 35% harder, take 25% less and walk a fifth quicker for 12 s — wasted on an
//   empty field, decisive when both sides are in;
// - 후퇴: the allies about the hero fall back (toward our camp) for 8 s, taking 35% less and mending 4% a second —
//   a lost fight left alive rather than fed one by one.
// Shown: the keys' seconds, the focus ring over the foe, a ring under each ally in a 총공격 or 후퇴, the HUD's line;
// and the results (what each brought: kills for and against while it lasted).
const TACTICS = {
  focus: { name: '집중', cd: 8, sec: 8, k: 1.5, r: 12, tip: '내 곁의 적 하나(힐러·약한 적·대장 우선)를 주변 12칸 아군 모두가 8초 동안 노린다 (그 적에게 피해 +50%)' },
  surge: { name: '총공격', cd: 30, sec: 12, k: 1.35, taken: 0.75, speed: 1.2, r: 12, tip: '내 주변 12칸 아군: 12초 동안 공격 +35% · 받는 피해 −25% · 이동 +20%' },
  regroup: { name: '후퇴', cd: 40, sec: 8, taken: 0.65, mend: 0.04, r: 14, tip: '내 주변 14칸 아군이 우리 쪽으로 물러나 8초 동안 받는 피해 −35% · 초당 체력 4% 회복' },
};
function tacOf(W) { return W.tac || (W.tac = { at: {}, focus: null, surge: null, regroup: null, log: [], uiT: 0 }); }
function tacWait(W, kind) { const T = tacOf(W), at = T.at[kind]; return at === undefined ? 0 : Math.max(0, TACTICS[kind].cd * (1 - gk(W, 'tactic')) - (A.G().t - at)); }
/** Our guild's 문파 기술 (league.js guildK, read at the war's start: W.gk). */
function gk(W, id) { return (W.gk && W.gk[id]) || 0; }
function foeKills(W) { return W.teams.reduce((a, t, i) => a + (i === 0 ? 0 : t.kills), 0); }
/** The foe the hero would call: near it, its healer and the weakest and a 대장 first. */
function tacPick(W) {
  const G = A.G(), p = G.player;
  let best = null, bs = 1e9;
  for (const e of foesOf(W, 0)) {
    if (e.gate || e.dead || !(e.hp > 0) || unseenHid(e) || e.troop || (W.jaeng && inCamp(W, e))) continue;
    const d = Math.hypot(e.tx - p.tx, e.ty - p.ty);
    if (d > 7) continue;
    const s = d - (e.role === 'healer' ? 2.5 : 0) - (1 - hpk(e)) * 4 - (e.cmdr ? 4 : 0) - (e.carry ? 2 : 0) - (e.hero ? 1 : 0);
    if (s < bs) { bs = s; best = e; }
  }
  return best;
}
/** The hero's tactic (the keys, or window.__warTac(kind)); false when it cannot be used now. */
function warTactic(kind) {
  const G = A.G(), W = G && G.war;
  const def = TACTICS[kind];
  if (!W || W.raid || W.over || !def || G.dead || (W.countdown || 0) > 1 || W.aiOnly) return false;
  if (tacWait(W, kind) > 0) return false;
  const T = tacOf(W), p = G.player, now = G.t;
  const who = new Set(W.alive[0].filter(b => !b.troop && !b.gate && !b.cmdr && !b.dead && Math.hypot(b.tx - p.tx, b.ty - p.ty) <= def.r));
  let text, what;
  if (kind === 'focus') {
    const e = tacPick(W);
    if (!e) { A.say('[전술] 집중: 7칸 안에 노릴 적이 없습니다', 'warn'); return false; }
    T.focus = { e, until: now + def.sec, k0: W.teams[0].kills, k1: foeKills(W) };
    for (const b of W.alive[0]) if (!b.hero && !b.troop && !b.gate && b.role !== 'healer' && d2(b, e) <= def.r) { b.target = e; b.tWhy = 'focus'; b.retargetT = now + def.sec; }
    what = e.cmdr ? e.name : e.cls ? `${e.cls.name} ${e.name}` : e.name;
    text = pick([`${what} 집중!`, `${what}부터 잡아요!`, `${what} 다 같이 쳐요!`]);
  } else if (kind === 'surge') {
    if (who.size < 3) { A.say('[전술] 총공격: 주변에 아군이 너무 적습니다', 'warn'); return false; }
    T.surge = { who, until: now + def.sec, k0: W.teams[0].kills, k1: foeKills(W) };
    text = pick(['총공격! 지금 밀어요!', '전원 돌격!! 지금이에요!', '다 같이 들어가요!']);
  } else {
    if (who.size < 2) { A.say('[전술] 후퇴: 주변에 아군이 없습니다', 'warn'); return false; }
    const sp = W.teams[0].spawn, dx = sp[0] - p.tx, dy = sp[1] - p.ty, n = Math.hypot(dx, dy) || 1;
    const at = snap(W, p.tx + dx / n * Math.min(7, n), p.ty + dy / n * Math.min(7, n));
    T.regroup = { who, at, until: now + def.sec, k0: W.teams[0].kills, k1: foeKills(W) };
    text = pick(['다들 빠져요! 뒤에서 정비!', '후퇴! 모여서 다시 가요!', '빠져요 빠져! 정비하고 다시!']);
  }
  T.at[kind] = now;
  G.bubble = { text, t: now };
  A.say(`[전술] ${def.name} — ${text}`, 'party');
  A.banner(`전술 · ${def.name}${kind === 'focus' ? ` → ${what}` : ` (${who.size}명)`}`);
  W.chatT = now;
  if (kind !== 'focus') answers(W, [...who].filter(b => !b.hero), kind === 'surge' ? ['가즈아!', 'ㄱㄱㄱ', '돌격!!'] : ['빠짐!', 'ㅇㅋ 빠져요', '정비!'], 2);
  if (W.diag) (W.diag.tac = W.diag.tac || {})[kind] = (W.diag.tac[kind] || 0) + 1;
  tacKeys(W, true);
  return true;
}
/** Per frame: the ends (what each brought, told and logged), the mending of a 후퇴, the keys' seconds. */
function tacTick(W, dt) {
  const T = tacOf(W), G = A.G();
  for (const kind of ['focus', 'surge', 'regroup']) {
    const c = T[kind];
    if (!c) continue;
    if (kind === 'focus' && !alive(c.e) && !c.killedT) c.killedT = G.t;
    if (kind === 'regroup') for (const b of c.who) if (!b.hero && !b.dead && b.hp > 0) b.hp = Math.min(b.maxHp, b.hp + b.maxHp * TACTICS.regroup.mend * dt);
    if (G.t >= c.until || (kind === 'focus' && c.killedT && G.t - c.killedT > 0.5)) {
      T[kind] = null;
      const k0 = W.teams[0].kills - c.k0, k1 = foeKills(W) - c.k1;
      T.log.push({ kind, t: Math.round(W.t), kills: [k0, k1], got: kind === 'focus' ? !!c.killedT : undefined });
      const ok = kind === 'focus' ? !!c.killedT : k0 >= k1;
      if (kind === 'focus' && c.killedT && c.e && (c.e.cmdr || c.e.role === 'healer')) moment(W, `집중으로 ${c.e.name} 처치`, 0, { hero: true, kind: 'focus' });
      else if (kind !== 'focus' && k0 - k1 >= 4) moment(W, `${TACTICS[kind].name} — 처치 ${k0} : ${k1}`, 0, { hero: true, kind: 'tac' });
      A.say(kind === 'focus' ? `[전술] 집중 ${c.killedT ? '성공 — 처치!' : '실패 — 놓쳤습니다'} (그동안 처치 ${k0} : ${k1})` : `[전술] ${TACTICS[kind].name} 끝 — 그동안 처치 ${k0} : ${k1}`, ok ? 'sys' : 'warn');
    }
  }
  T.uiT -= dt;
  if (T.uiT <= 0) { T.uiT = 0.25; tacKeys(W); }
}
function tacKeys(W, now = false) {
  const col = document.getElementById('war-tac');
  if (!col) return;
  if (col.hidden) col.hidden = false;
  for (const k of col.querySelectorAll('[data-tac]')) {
    const kind = k.dataset.tac, w = Math.ceil(tacWait(W, kind)), on = !!tacOf(W)[kind];
    const label = TACTICS[kind].name + (on ? ' ●' : w > 0 ? ` ${w}` : '');
    if (k.textContent !== label || now) { k.textContent = label; k.classList.toggle('cool', w > 0 && !on); k.classList.toggle('on', on); }
  }
}
/** In a 후퇴: back to the spot, striking only what is in reach on the way. True when it took the fighter's thought. */
function tacThink(W, b) {
  const c = W.tac && W.tac.regroup;
  if (!c || !c.who.has(b) || A.G().t >= c.until) return false;
  b.dest = snap(W, c.at[0] + (b.id % 5) - 2, c.at[1] + ((b.id >> 2) % 3) - 1);
  const t = nearest(W, b, b.kit.range + 0.5);
  if (t) act(W, b, t);
  return true;
}
/** The foe a 집중 has this fighter on (alive, near enough), else null. */
function tacFocus(W, b) {
  const c = W.tac && W.tac.focus;
  if (!c || b.team !== 0 || A.G().t >= c.until || !alive(c.e) || unseenHid(c.e) || d2(b, c.e) > TACTICS.focus.r) return null;
  return c.e;
}
/** The tactics' weight on a blow (hit). */
function tacK(W, src, t) {
  const T = W.tac, now = A.G().t;
  let k = 1;
  if (src.team === 0) {
    if (T.focus && T.focus.e === t && now < T.focus.until) k *= TACTICS.focus.k + 0.5 * gk(W, 'tactic');
    if (T.surge && now < T.surge.until && T.surge.who.has(src)) k *= TACTICS.surge.k;
  }
  if (t.team === 0) {
    if (T.surge && now < T.surge.until && T.surge.who.has(t)) k *= TACTICS.surge.taken;
    if (T.regroup && now < T.regroup.until && T.regroup.who.has(t)) k *= TACTICS.regroup.taken;
  }
  return k;
}
function surging(W, b) { const c = W.tac && W.tac.surge; return !!(c && A.G().t < c.until && c.who.has(b)); }
/** The HUD's line for a tactic under way. */
function drawTacHud(G, W, ctx, cw, ch, u, y) {
  const T = W.tac;
  if (!T) return;
  const parts = [];
  if (T.focus && G.t < T.focus.until) parts.push(`집중: ${T.focus.e.name}${alive(T.focus.e) ? ` ${Math.round(hpk(T.focus.e) * 100)}%` : ' 처치!'} · ${Math.ceil(T.focus.until - G.t)}초`);
  if (T.surge && G.t < T.surge.until) parts.push(`총공격 ${[...T.surge.who].filter(b => !b.dead).length}명 · ${Math.ceil(T.surge.until - G.t)}초`);
  if (T.regroup && G.t < T.regroup.until) parts.push(`후퇴·정비 ${[...T.regroup.who].filter(b => !b.dead).length}명 · ${Math.ceil(T.regroup.until - G.t)}초`);
  if (!parts.length) return;
  ctx.textAlign = 'center';
  ctx.font = `bold ${Math.round(10 * u)}px G11`;
  hudText(`전술 — ${parts.join(' / ')}`, cw / 2, y, '#ff9a6a');
}
/** Under a body: the 집중's ring on its foe, a 총공격's under each ally in it, a 후퇴's under each falling back. */
function drawTacMark(W, b) {
  const T = W.tac, G = A.G(), ctx = A.ctx;
  if (!T || b.dead) return;
  let col = null, label = null;
  if (T.focus && T.focus.e === b && G.t < T.focus.until) { col = '#ff3a2a'; label = '집중'; }
  else if (b.team === 0 && T.surge && G.t < T.surge.until && T.surge.who.has(b)) col = '#ffc040';
  else if (b.team === 0 && T.regroup && G.t < T.regroup.until && T.regroup.who.has(b)) col = '#7ad8ff';
  if (!col) return;
  ctx.save();
  ctx.strokeStyle = col;
  ctx.lineWidth = label ? 3 : 2;
  ctx.globalAlpha = label ? 0.75 + 0.25 * Math.sin(G.t * 8) : 0.7;
  ctx.beginPath();
  ctx.ellipse(b.x, b.y - 2, TILE * (label ? 0.62 : 0.45), TILE * (label ? 0.34 : 0.24), 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  if (label) drawLabel(label, b.x, b.y - 72, '#ff8a7a', 'bold 10px G11');
}
/** Test: what the keys offer now, and where the hero's objective is (a directing bot's eye). */
function tacState() {
  const G = A.G(), W = G && G.war;
  if (!W || W.raid) return null;
  const p = G.player, foes = foesOf(W, 0).filter(e => !e.gate && !e.dead && !(W.jaeng && inCamp(W, e)) && Math.hypot(e.tx - p.tx, e.ty - p.ty) <= 8);
  const mates = W.alive[0].filter(b => !b.hero && !b.troop && !b.gate && Math.hypot(b.tx - p.tx, b.ty - p.ty) <= 8);
  return {
    ready: Object.fromEntries(Object.keys(TACTICS).map(k => [k, tacWait(W, k) <= 0 && !G.dead])),
    near: { foes: foes.length, mates: mates.length, hurt: mates.filter(b => hpk(b) < 0.5).length },
    goal: heroGoal(W), log: tacOf(W).log,
  };
}
/** Where the guild's objective is for the hero (a bot's way): the point to take, the cart, the gate, the 대장, the boss. */
function heroGoal(W) {
  const G = A.G(), p = G.player;
  const nearOf = l => l.slice().sort((a, b) => Math.hypot(a.x - p.tx, a.y - p.ty) - Math.hypot(b.x - p.tx, b.y - p.ty))[0];
  if (W.jaeng) {
    if (W.boss && W.boss.hp > 0) return [W.boss.tx, W.boss.ty + 2];
    const s = W.seals && nearOf(W.seals.filter(f => f.owner !== 0));
    return s ? [s.x, s.y] : null;
  }
  if (W.mode === 'capture') {
    const P = W.plans && W.plans[0], t = P && P.target && P.target.owner !== 0 ? P.target : nearOf(W.flags.filter(f => f.owner !== 0));
    return t ? [t.x, t.y] : null;
  }
  if (W.mode === 'commander') return null; // (with its squad: the 대장 is the 돌격's, not one hero's)
  if (W.mode === 'escort') return W.cart ? [W.cart.tx, W.cart.ty] : null;
  if (W.mode === 'siege') {
    const g = W.gate;
    if (W.gateDown) { const c = W.teams[1 - W.attacker].cmd; return [c.tx, c.ty + 1]; }
    // (the defence: a close-in hero out before the gate by the 쪽문, a caster behind it)
    return W.attacker === 0 ? [g.tx, g.y1 + 1] : ['warrior', 'rogue', 'lancer', 'monk', 'dokkaebi', 'reaper', 'celestial'].includes(G.cls.id) ? [g.tx, g.y1 + 2] : [g.tx, g.y0 - 1];
  }
  return null;
}

/** A measure of how the war stands for us (for what a minute's command brought). */
function progressNow(W) {
  const p = sideProgress(W);
  return Math.round((p[0].k - p[1].k) * 100);
}
function cmdEnd(W, C) {
  const c = C.cur;
  if (!c) return;
  C.cur = null;
  for (const q of W.teams[0].squads) q.flank = false;
  const k0 = W.teams[0].kills - c.kills[0], k1 = W.teams[1].kills - c.kills[1];
  const dp = progressNow(W) - c.prog;
  const gain = k0 - k1 + Math.round(dp / 5);
  C.log.push({ kind: c.kind, t: Math.round(c.at), kills: [k0, k1], prog: dp, gain });
  A.say(`[지휘] ${WAR_COMMANDS[c.kind].name} 결과 — 처치 ${k0} : ${k1} · 전황 ${dp >= 0 ? '+' : ''}${dp}`, gain >= 0 ? 'sys' : 'warn');
}
/** The command's weight on a blow (hit): the side's attack and guard, the flankers', the hero's crowd. */
function commandK(W, src, t) {
  const c = W.cmds.cur, def = WAR_COMMANDS[c.kind];
  // (지휘 사기, 2026-11-28: a guild under its hero's call — any of the four — fights as one: +8% · −5% taken. Left to its
  // commander, none: the minute's choice was worth a tenth either way and a war left alone was the dice's.)
  let k = 1;
  if (src.team === 0) {
    k *= (def.dmg || 1) * 1.08;
    if (def.flankDmg && src.squad && src.squad.flank) k *= def.flankDmg;
    if (def.nearDmg && !src.hero && d2(src, W.hero) <= 5 && !A.G().dead) k *= def.nearDmg;
  }
  if (t.team === 0) {
    k *= (def.taken || 1) * 0.95;
    if (c.kind === 'rally' && !t.hero && d2(t, W.hero) <= 5 && !A.G().dead) k *= 0.9;
  }
  return k;
}
/** The squads' orders under the hero's command (after the commander's: ordersMode). */
function commandOrders(W) {
  const C = W.cmds, c = C && C.cur;
  if (!c || W.over || c.kind === 'rally') return;
  const G = A.G(), T = W.teams[0], squads = T.squads, theirs = W.teams[1].spawn, mine = T.spawn;
  const set = (sq, x, y, kind, obj = null) => {
    const [sx, sy] = snap(W, x, y);
    sq.order = { x: sx, y: sy, kind, obj, face: [Math.sign(theirs[0] - sx), Math.sign(theirs[1] - sy)] };
  };
  const spreadOn = (qs, x, y, kind, obj) => qs.forEach((q, i) => set(q, x + ((i % 3) - 1) * 1.4, y + (i > 2 ? 1 : -1) * 0.8, kind, obj));
  const all = squads.slice(), half = squads.filter((q, i) => i % 2 === 0), flankers = squads.filter(q => q.flank), rest = squads.filter(q => !q.flank);
  if (W.mode === 'capture') {
    const P = W.plans && W.plans[0], byNear = W.flags.slice().sort((a, b) => Math.hypot(a.x - mine[0], a.y - mine[1]) - Math.hypot(b.x - mine[0], b.y - mine[1]));
    // 돌격's point is the hero's to choose (2026-11-28): the one not ours it stands nearest (within 12 tiles), else the plan's.
    const hp = A.G().player, heroAt = !A.G().dead && W.flags.filter(f => f.owner !== 0 && Math.hypot(f.x - hp.tx, f.y - hp.ty) <= 12)
      .sort((a, b) => Math.hypot(a.x - hp.tx, a.y - hp.ty) - Math.hypot(b.x - hp.tx, b.y - hp.ty))[0];
    const target = heroAt || (P && P.target && P.target.owner !== 0 && P.target) || byNear.find(f => f.owner !== 0) || byNear[byNear.length - 1];
    const owned = byNear.filter(f => f.owner === 0);
    if (c.kind === 'charge') spreadOn(all, target.x, target.y, 'capture');
    else if (c.kind === 'hold') {
      const keep = owned.length ? owned : [byNear[0]];
      half.forEach((q, i) => { q.keep = true; const f = keep[i % keep.length]; set(q, f.x, f.y, 'capture'); });
    } else if (c.kind === 'flank') {
      const other = byNear.filter(f => f.owner !== 0 && f !== target)[0];
      const f = other || target;
      flankers.forEach((q, i) => set(q, f.x + (other ? 0 : (i ? 3 : -3)), f.y + (other ? 0 : 2), 'capture'));
    }
  } else if (W.mode === 'commander') {
    const myC = T.cmd, thC = W.teams[1].cmd;
    if (c.kind === 'charge' && !thC.dead) spreadOn(all.filter(q => q !== squads[0]), thC.tx, thC.ty, 'assault', thC);
    else if (c.kind === 'hold') spreadOn(half, myC.home[0] + Math.sign(W.def.mid[0] - myC.home[0]) * 3, myC.home[1], 'defend');
    else if (c.kind === 'flank' && !thC.dead) {
      // Round the side: a point five tiles off the line from the middle to their 대장, then in.
      const mx = W.def.mid[0], my = W.def.mid[1], dx = thC.tx - mx, dy = thC.ty - my, L = Math.hypot(dx, dy) || 1;
      flankers.forEach((q, i) => {
        const near = Math.hypot(q.leader ? q.leader.tx - thC.tx : 99, q.leader ? q.leader.ty - thC.ty : 99) < 7;
        const s = i % 2 ? 1 : -1;
        if (near) set(q, thC.tx, thC.ty, 'assault', thC);
        else set(q, thC.tx - dx / L * 3 + (-dy / L) * 5 * s, thC.ty - dy / L * 3 + (dx / L) * 5 * s, 'assault', thC);
      });
    }
  } else if (W.mode === 'escort') {
    const att = W.attacker === 0, at = k => W.path[Math.min(W.path.length - 1, Math.max(0, Math.floor(W.cart.i) + k))];
    if (c.kind === 'charge') { const q = at(att ? 2 : 1); spreadOn(all, q[0], q[1], att ? 'escort' : 'intercept'); }
    else if (c.kind === 'hold') { const q = at(att ? 0 : 4); spreadOn(half, q[0], q[1], att ? 'escort' : 'hold'); }
    else if (c.kind === 'flank') { const q = at(7); flankers.forEach((s, i) => set(s, q[0] + (i ? 2 : -2), q[1], att ? 'escort' : 'intercept')); }
  } else if (W.mode === 'siege') {
    const g = W.gate, att = W.attacker === 0, dc = W.teams[1 - W.attacker].cmd;
    if (W.gateDown) {
      if (att && c.kind !== 'hold') spreadOn(c.kind === 'flank' ? flankers : all, dc.tx, dc.ty, 'assault', dc);
      else if (!att) spreadOn(c.kind === 'charge' ? all : half, dc.home[0], dc.home[1] + 2, 'defend');
      return;
    }
    if (att) {
      if (c.kind === 'charge') spreadOn(all, g.tx, g.y1 + 1, 'gate', g);
      else if (c.kind === 'hold') spreadOn(half, g.tx, g.y1 + 6, 'hold');
      else if (c.kind === 'flank') flankers.forEach((q, i) => set(q, i ? g.x1 + 1 : g.x0 - 1, g.y1 + 1, 'gate', g));
    } else {
      if (c.kind === 'charge') spreadOn(all, g.tx, g.y1 + 3, 'hold');
      else if (c.kind === 'hold') spreadOn(half, g.tx, g.y0 - 2, 'hold');
      else if (c.kind === 'flank') flankers.forEach((q, i) => set(q, i ? g.x1 + 1 : g.x0 - 1, g.y1 + 2, 'hold'));
    }
  }
}
/** The command at the top: what the guild does this minute, and its seconds; the objective line. */
function drawCmdHud(G, W, ctx, cw, ch, u) {
  const C = W.cmds;
  const goal = warGoal(W);
  ctx.textAlign = 'center';
  ctx.font = `${Math.round(9 * u)}px G9`;
  let y = 45 * u;
  if (goal) { hudText(goal, cw / 2, y, '#fff4c8'); y += 12 * u; }
  if (C && C.cur) {
    ctx.font = `bold ${Math.round(10 * u)}px G11`;
    hudText(`지휘: ${WAR_COMMANDS[C.cur.kind].name} — ${cmdDesc(W, C.cur.kind)} · ${Math.max(0, Math.ceil(C.cur.until - W.t))}초`, cw / 2, y, '#ffd040');
  } else if (C && !C.ask && C.next > W.t && W.left > 25) {
    ctx.font = `${Math.round(9 * u)}px G9`;
    hudText(`다음 지휘 선택 ${Math.ceil(C.next - W.t)}초`, cw / 2, y, '#d8c8a0');
  }
}
/** The war's objective now, for the HUD (what to do, not only the score). */
function warGoal(W) {
  const G = A.G();
  if (W.mode === 'capture') {
    const P = W.plans && W.plans[0], t = P && P.target;
    const mine = W.flags.filter(f => f.owner === 0).length;
    return `목표: 거점 ${mine}/${W.flags.length} — ${t && t.owner !== 0 ? `${t.name} 거점 점령` : '거점 지키기'} · ${W.def.target}점 먼저`;
  }
  if (W.mode === 'commander') {
    const c0 = W.teams[0].cmd, c1 = W.teams[1].cmd;
    return `목표: 적 진영대장(${Math.round(hpk(c1) * 100)}%) 쓰러뜨리기 · 우리 대장 ${Math.round(hpk(c0) * 100)}% 지키기`;
  }
  if (W.mode === 'escort') {
    const pct = Math.round(W.cart.i / (W.path.length - 1) * 100);
    return W.attacker === 0 ? `목표: 수레 곁에 서서 밀기 (${pct}%) · 수레 곁에 적이 많으면 멈춘다` : `목표: 수레 곁의 적을 쓰러뜨려 멈추기 (${pct}%) · 우리 차례에 더 멀리`;
  }
  if (W.mode === 'siege') {
    const att = W.attacker === 0, dc = W.teams[1 - W.attacker].cmd;
    if (W.gateDown) return att ? `목표: 수성대장(${Math.round(hpk(dc) * 100)}%) 쓰러뜨리기` : `목표: 수성대장(${Math.round(hpk(dc) * 100)}%) 지키기 — 본진으로`;
    return att ? `목표: 현무 성문 부수기 (${Math.ceil(W.gate.hp / W.gate.maxHp * 100)}%)` : `목표: 성문(${Math.ceil(W.gate.hp / W.gate.maxHp * 100)}%) 지키기 · 근접은 쪽문으로 나가 막고 원거리는 문 안에서`;
  }
  return '';
}

// ------------------------------------------------ the guild's plans (wars)

/** How hard a guild pushes: more when behind, less when well ahead (0.15 .. 0.95). */
function aggression(W, team) {
  const lead = W.score[team] - W.score[1 - team];
  const scale = W.mode === 'capture' ? 70 : 8;
  let a = 0.55 - lead / scale;
  if (W.left < 90 && lead < 0) a += 0.25;
  if (W.left < 60 && lead > (W.mode === 'capture' ? 25 : 4)) a -= 0.2;
  return clamp(a, 0.15, 0.95);
}

/**
 * 거점 점령: the guild's plan, made again every twenty seconds or so and when its point falls:
 * how many squads keep our points (none when far behind, two when well ahead), which point the
 * rest take (the neutral or the weakly held first), gathered first a few tiles short of it and
 * then pushed together, a squad sometimes sent round to another; a push that is broken falls
 * back to gather again.
 */
function capturePlan(W, team, set, squads) {
  const G = A.G(), T = W.teams[team], mine = T.spawn, them = 1 - team;
  const P = (W.plans = W.plans || [null, null])[team] || (W.plans[team] = { t: 0, target: null, flank: null, pushing: false, stagedAt: 0, nDef: 1, brokeT: 0, a: 0.5 });
  const a = P.a = aggression(W, team);
  const byNear = W.flags.slice().sort((x, y) => Math.hypot(x.x - mine[0], x.y - mine[1]) - Math.hypot(y.x - mine[0], y.y - mine[1]));
  const owned = byNear.filter(f => f.owner === team), notMine = byNear.filter(f => f.owner !== team);
  const foesAt = (f, r = 5) => countAt(W, f.x, f.y, r)[them];
  const friendsAt = (f, r = 5) => countAt(W, f.x, f.y, r)[team];
  if (G.t >= P.t || !P.target || P.target.owner === team || (P.flank && P.flank.owner === team)) {
    P.t = G.t + rnd(16, 26);
    P.nDef = !owned.length ? 0 : a > 0.75 ? 0 : a > 0.42 ? 1 : 2;
    let best = null, bs = 1e9;
    for (const f of notMine) {
      const s = Math.hypot(f.x - mine[0], f.y - mine[1]) * 0.25 + foesAt(f, 6) * 1.5 - (f.owner === -1 ? 4 : 0) + (f === P.target ? -1 : 0);
      if (s < bs) { bs = s; best = f; }
    }
    if (!best) best = byNear.slice().sort((x, y) => foesAt(y, 7) - foesAt(x, 7))[0] || byNear[byNear.length - 1];
    if (best !== P.target) { P.target = best; P.pushing = false; P.stagedAt = G.t; P.called = false; }
    const other = notMine.filter(f => f !== best);
    P.flank = other.length && a > 0.5 && Math.random() < 0.35 ? other[0] : null;
  }
  // The hero on a point not ours with its squad behind it: the guild makes it its target (most
  // of the time; a guild far ahead may keep to its own plan).
  const L = W.lead;
  if (team === 0 && L && L.on && L.objKind === 'flag' && !A.G().dead) {
    const hf = W.flags.find(f => f.owner !== 0 && Math.hypot(f.x - G.player.tx, f.y - G.player.ty) <= 4);
    if (hf && hf !== P.target && G.t - (P.heroT || -99) > 15 && Math.random() < 0.4 + 0.6 * a) {
      P.heroT = G.t;
      P.target = hf;
      P.flank = null;
      P.pushing = true;
      P.pushT = G.t;
      P.t = G.t + rnd(20, 30);
      const ld = squads.map(q => q.leader).find(l => l && !l.dead && !l.hero && l.squad !== W.hero.squad);
      chat(W, ld, 'heroPoint', [`${W.hero.name.replace('(나)', '')}님 ${hf.name} 거점 갔어요! 다 같이 가요!`, `${hf.name} 거점 지원 갑니다!`, `${hf.name} 쪽으로 다 붙어요!`], { every: 15, must: true, gap: 1.5, emo: 'ready' });
    }
  }
  const target = P.target;
  // Squads: those keeping a point (the first, then the last ones), and the rest pushing. The
  // hero's squad (team 0's second) pushes with the main body unless the hero leads it elsewhere.
  // Our points by need: under attack first, then nearest the enemy; the point by our own camp
  // only when it is our last or foes are about it (a squad kept there idle was the guild
  // "standing about its camp").
  const es = W.teams[them].spawn;
  const guard = owned.filter(f => f !== byNear[0] || owned.length === 1 || foesAt(f, 9) > 0)
    .sort((x, y) => (foesAt(y, 6) - foesAt(x, 6)) || (Math.hypot(x.x - es[0], x.y - es[1]) - Math.hypot(y.x - es[0], y.y - es[1])));
  const order = [0, 4, 3, 2, 1].map(i => squads[i]).filter(Boolean);
  const keepers = order.slice(0, Math.min(P.nDef, guard.length));
  const pushers = squads.filter(q => !keepers.includes(q));
  keepers.forEach((q, i) => { q.keep = true; const f = guard[i]; set(q, f.x, f.y, 'capture', null, null); });
  for (const q of pushers) q.keep = false;
  // A point of ours falling with nobody on it: the nearest pushers turn back when we cannot spare it.
  const falling = owned.find(f => foesAt(f, 3) >= 2 && friendsAt(f, 4) < foesAt(f, 3));
  if (falling && (a < 0.6 || owned.length === 1) && pushers.length > 1) {
    const back = pushers.filter(q => q !== W.hero.squad).slice(0, 2);
    back.forEach((q, i) => set(q, falling.x, falling.y, 'capture', null, i === 0 ? `${falling.name} 거점 뺏겨요! 돌아가서 막아요!` : null));
    pushers.splice(0, pushers.length, ...pushers.filter(q => !back.includes(q)));
  }
  // Gather a few tiles short of the target, then go in together.
  const [sx, sy] = stagePoint(W, target, pushers, mine);
  const alivePush = pushers.flatMap(q => q.members.filter(m => (m.hero ? !G.dead : !m.dead)));
  const close = alivePush.filter(m => Math.hypot(m.tx - target.x, m.ty - target.y) < 7).length;
  if (!P.pushing) {
    const gathered = alivePush.filter(m => Math.hypot(m.tx - sx, m.ty - sy) <= 4.5 || Math.hypot(m.tx - target.x, m.ty - target.y) <= 5).length;
    if (gathered >= Math.max(3, alivePush.length * (0.75 - 0.25 * a)) || G.t - P.stagedAt > 6 + 6 * (1 - a) || close >= alivePush.length * 0.6) {
      P.pushing = true;
      P.pushT = G.t;
      if (team === 0) pushCall(W, pushers, target, P);
    }
  } else if (G.t - P.pushT > 8) {
    // Broken: few of ours left by the point, many of theirs: back to gather.
    const foes = foesAt(target, 5), ours = alivePush.filter(m => Math.hypot(m.tx - target.x, m.ty - target.y) <= 5).length;
    if (ours <= 2 && foes >= 5 && target.owner !== team) {
      if (!P.brokeT) P.brokeT = G.t;
      if (G.t - P.brokeT > 3) {
        P.pushing = false;
        P.stagedAt = G.t;
        P.brokeT = 0;
        if (team === 0) {
          const ld = pushers.map(q => q.leader).find(l => l && !l.dead && !l.hero);
          chat(W, ld, 'fallback', ['밀려요! 뒤로 빠져서 다시 모여요!', '한 번 빠졌다가 다시 가요!', '많아요 빠져요 빠져!'], { every: 25, must: true, emo: 'gone' });
        }
      }
    } else P.brokeT = 0;
  }
  const flank = P.flank && pushers.length >= 3 ? pushers[pushers.length - 1] : null;
  pushers.forEach((q, i) => {
    if (q === flank) { set(q, P.flank.x, P.flank.y, 'capture', null, null); return; }
    if (P.pushing) set(q, target.x + ((i % 3) - 1) * 1.2, target.y + (i > 2 ? 1 : -1) * 0.8, 'capture', null, null);
    else set(q, sx + ((i % 3) - 1) * 1.5, sy + (i > 2 ? 1 : -1), 'stage', null, null);
  });
}
/** A spot about six tiles short of a point, on the side the pushers come from. */
function stagePoint(W, f, pushers, mine) {
  const G = A.G();
  let cx = 0, cy = 0, n = 0;
  for (const q of pushers) for (const m of q.members) if (m.hero ? !G.dead : !m.dead) { cx += m.tx; cy += m.ty; n++; }
  if (!n) { cx = mine[0]; cy = mine[1]; n = 1; }
  cx /= n; cy /= n;
  const dx = cx - f.x, dy = cy - f.y, L = Math.hypot(dx, dy) || 1, r = Math.min(6, L);
  return snap(W, f.x + dx / L * r, f.y + dy / L * r);
}
function pushCall(W, pushers, target, P) {
  const G = A.G(), ld = pushers.map(q => q.leader).find(l => l && !l.dead && !l.hero) || pushers.flatMap(q => q.members).find(m => !m.dead && !m.hero);
  if (!ld || G.t - (W.cmdSaid || -99) < 6) return;
  const lines = target.owner === -1 ? [`${target.name} 거점 비었어요! 먹어요!`, `다 모였죠? ${target.name} 갑니다!`] : [`다 모였죠? ${target.name} 거점 칩니다!`, `${target.name} 거점 들어가요! 붙어요!`, `하나 둘 셋 ${target.name} 가요!`];
  if (chat(W, ld, 'push', lines, { every: 12, must: true, gap: 1.5, emo: 'ready' })) W.cmdSaid = G.t;
}

/**
 * 대장전: gather at the middle, then go for the enemy's 진영대장 together; a broken assault falls
 * back to the middle; more stay by our own 대장 when ahead, all come back when it is struck.
 */
function commanderPlan(W, team, set, squads, blob) {
  const G = A.G(), T = W.teams[team], foe = W.teams[1 - team], myC = T.cmd, theirC = foe.cmd, mid = W.def.mid;
  const P = (W.plans = W.plans || [null, null])[team] || (W.plans[team] = { phase: 'gather', at: 0, t: 0 });
  const a = P.a = aggression(W, team);
  const underAttack = W.alive[1 - team].filter(e => d2(e, myC) < 7).length >= 3;
  // (백호 난투: ten a side, no one kept back by the 대장 — its camp is at the court's edge)
  if (!W.def.short) {
  squads[0].keep = true;
  set(squads[0], myC.home[0] + Math.sign(mid[0] - myC.home[0]) * 3, myC.home[1], 'defend', null, '대장 곁을 지킵니다');
  } else squads[0].keep = false;
  if (a < 0.3 && squads[4]) { squads[4].keep = true; set(squads[4], myC.home[0] + Math.sign(mid[0] - myC.home[0]) * 5, myC.home[1] + 2, 'defend'); }
  else if (squads[4]) squads[4].keep = false;
  const main = squads.filter(q => !q.keep);
  const blobOn = (x, y, kind, obj, text) => main.forEach((q, i) => set(q, x + ((i % 3) - 1) * 1.5, y + (i > 1 ? 1 : -1), kind, obj, i === 0 ? text : null));
  if (underAttack) { P.phase = 'gather'; P.at = G.t; return blobOn(myC.tx, myC.ty, 'defend', null, '대장이 공격받아요! 전원 복귀!'); }
  if (theirC.dead) return blobOn(mid[0], mid[1], 'hold', null, null);
  const alive = main.flatMap(q => q.members.filter(m => (m.hero ? !G.dead : !m.dead)));
  const L = W.lead;
  if (team === 0 && P.phase === 'gather' && L && L.on && L.objKind === 'cmdr' && !G.dead && Math.random() < 0.4 + 0.6 * a) {
    P.phase = 'assault';
    P.at = G.t;
    const ld = main.map(q => q.leader).find(l => l && !l.dead && !l.hero && l.squad !== W.hero.squad);
    chat(W, ld, 'heroPoint', ['대장 쪽으로 갔어요! 다 같이 들어가요!', '지원 갑니다! 대장 점사!'], { every: 15, must: true, gap: 1.5, emo: 'ready' });
  }
  if (P.phase === 'gather') {
    const there = alive.filter(m => Math.hypot(m.tx - mid[0], m.ty - mid[1]) < 6).length;
    // Into their court only with the numbers or once the clock runs (a guild that went in
    // short-handed fed the other its kills).
    const up = W.alive[team].length - W.alive[1 - team].length;
    const ready = W.t > 25 + 25 * (1 - a) && (there >= alive.length * (0.7 - 0.2 * a) || G.t - P.at > 14) && (up >= 2 || W.left < 200);
    if (ready) {
      P.phase = 'assault';
      P.at = G.t;
      const ld = main.map(q => q.leader).find(l => l && !l.dead && !l.hero);
      if (team === 0) chat(W, ld, 'push', ['다 모였죠? 적 대장 갑니다!', '대장 잡으러 들어가요! 붙어요!', '지금 들어가요! 대장 점사!'], { every: 15, must: true, gap: 1.5, emo: 'ready' });
    }
    return blobOn(mid[0], mid[1], 'hold', null, '중앙에 모여요');
  }
  // The assault: broken (few of ours near their 대장, many of theirs) or too long: back to the middle.
  const near = alive.filter(m => d2(m, theirC) < 8).length, foes = W.alive[1 - team].filter(e => d2(e, theirC) < 8).length;
  if ((G.t - P.at > 12 && near <= 2 && foes >= 5) || G.t - P.at > 50) {
    P.phase = 'gather';
    P.at = G.t;
    const ld = main.map(q => q.leader).find(l => l && !l.dead && !l.hero);
    if (team === 0) chat(W, ld, 'fallback', ['밀려요! 중앙으로 빠져서 다시!', '빠져요 빠져! 중앙 집결!'], { every: 25, must: true, emo: 'gone' });
    return blobOn(mid[0], mid[1], 'hold', null, null);
  }
  blobOn(theirC.tx, theirC.ty, 'assault', theirC, '적 진영대장 돌격! 다 같이!');
}

// ------------------------------------------------ 분대 전술 (대규모 전투 맵 확장, 2026-11-28)
// On the wider fields the plans' squads went each straight at its point, one stream of fighters a war: no squad went
// round, none lay in wait, a squad cut down to one or two fed itself in one by one. Now, over every plan (both sides, the
// 대항전 and 「쟁」 alike; the hero's own squad is the hero's):
// - 분대 이동: a squad far from its order goes as one — its members a few steps behind its leader, the leader waiting for
//   stragglers (formation);
// - 우회: a squad sent far (18+ tiles) goes round now and then — by a point off the straight way on the field's own paths,
//   no more than 1.7 times as long (flankVia), then in on its point from the side (the hero's 우회 sends its flankers always);
// - 매복: a squad keeping a point (a 거점, a seal, its 대장, the cart's road) lies in wait a few tiles off the way the enemy
//   comes, half seen (foes beyond 3.5 tiles pass it over), and springs on the first that comes near: 4 s of +30% (기습);
// - 재집결: a squad down to two of five (or worse, outnumbered) falls back toward its camp, fights only what is in reach,
//   and goes in again once its risen and mended are back (the guild's 후퇴·재집결 as a squad's).
// Shown: the tag over a squad leader's head (ours always, theirs once seen), the minimap's squads, the 매복 half seen.
const SQ_TAC = {
  flank: { name: '우회', col: '#9ad8ff' }, ambush: { name: '매복', col: '#c8ff8a' }, sprung: { name: '기습!', col: '#ffd040' },
  rally: { name: '재집결', col: '#ffb07a' },
};
const AMBUSH_K = 1.3, AMBUSH_SEE = 3.5, FLANK_FAR = 18, FLANK_FAR_CALLED = 11;
function beh(W, k) { if (W.diag) { const B = W.diag.beh || (W.diag.beh = {}); B[k] = (B[k] || 0) + 1; } }
function livingOf(q) { const G = A.G(); return q.members.filter(m => (m.hero ? !G.dead : !m.dead)); }
function squadCentre(W, q) {
  let x = 0, y = 0, n = 0;
  for (const m of livingOf(q)) { if (m.hero) { x += A.G().player.tx; y += A.G().player.ty; } else { x += m.tx; y += m.ty; } n++; }
  return n ? [x / n, y / n, n] : null;
}
/** The tag over a squad (its 전술), or null. */
function sqTag(q) {
  const T = q && q.tac;
  if (!T) return q && q.route && !q.route.done ? SQ_TAC.flank : null;
  return T.kind === 'ambush' ? (T.sprung ? SQ_TAC.sprung : SQ_TAC.ambush) : SQ_TAC[T.kind] || null;
}

/** A way round from a to b: a point off the straight line, on the field's paths no more than 1.7 times the straight way. */
function flankVia(W, a, b, team, side = 0) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
  if (L < 12) return null;
  const cols = W.map.cols, fb = flowTo(W, b[0], b[1], team), ai = Math.round(a[1]) * cols + Math.round(a[0]), direct = fb[ai];
  if (!(direct > 0)) return null;
  let best = null, bs = 1e9;
  for (const s of side ? [side] : (Math.random() < 0.5 ? [-1, 1] : [1, -1]))
    for (const off of [0.42, 0.3]) {
      const p = snap(W, a[0] + dx * 0.55 - dy / L * s * L * off, a[1] + dy * 0.55 + dx / L * s * L * off);
      const perp = Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / L;
      const toB = fb[p[1] * cols + p[0]];
      if (perp < 4 || !(toB > 0)) continue;
      const fromA = flowTo(W, p[0], p[1], team)[ai];
      if (!(fromA > 0) || fromA + toB > direct * 1.7) continue;
      const sc = Math.abs((fromA + toB) / direct - 1.3) - perp * 0.02;
      if (sc < bs) { bs = sc; best = { via: p, side: s, len: fromA + toB, direct }; }
    }
  return best;
}

/**
 * Where to lie in wait for the foe coming at `at` from `from`: a few tiles short of it, beside the way it comes (not on it),
 * by a wall if there is one (cover); null when the way is too short.
 */
function ambushSpot(W, from, at, team) {
  const path = pathCells(W, snap(W, from[0], from[1]), snap(W, at[0], at[1]));
  if (path.length < 12) return null;
  const on = new Set(path.map(([x, y]) => y * W.map.cols + x));
  const k = Math.max(0, path.length - 1 - Math.round(rnd(6, 9)));
  const [cx, cy] = path[k], [nx, ny] = path[Math.min(path.length - 1, k + 2)];
  const dx = nx - cx, dy = ny - cy, L = Math.hypot(dx, dy) || 1;
  let best = null, bs = -1e9;
  for (const s of [-1, 1]) for (const r of [2, 3, 4]) {
    const x = Math.round(cx - dy / L * s * r), y = Math.round(cy + dx / L * s * r);
    if (!open(W, x, y, team) || on.has(y * W.map.cols + x)) continue;
    let cover = 0;
    for (let ox = -2; ox <= 2; ox++) for (let oy = -2; oy <= 2; oy++) if (!open(W, x + ox, y + oy)) cover++;
    const sc = cover - Math.abs(r - 3) * 0.5 + Math.random();
    if (sc > bs) { bs = sc; best = [x, y]; }
  }
  return best && { x: best[0], y: best[1], from: path[Math.max(0, k - 6)] };
}

/** Every second, after the plans: each squad's way there and its 전술 (both sides). */
function squadTactics(W, team) {
  const G = A.G(), T = W.teams[team], squads = T.squads, sp = T.spawn;
  if (!squads || (W.countdown || 0) > 0) return;
  const heroSq = team === 0 ? W.hero.squad : null;
  const S = (W.sqs = W.sqs || [])[team] || (W.sqs[team] = { ambushT: 30 + rnd(0, 20) });
  const foeTeams = teamsOf(W).filter(t => t !== team);
  const foeSpawn = () => { const t = pick(foeTeams); return W.teams[t].spawn; };
  for (const q of squads) {
    // (the true order back from under a way round's point: 「쟁」's plan keeps its orders between plans)
    if (q.order && q.order.via) q.order = { ...q.order, x: q.order.to[0], y: q.order.to[1], via: false, to: null };
    const live = livingOf(q), n = q.members.length;
    const c = squadCentre(W, q);
    const tac = q.tac;
    // ---- 재집결: ended once back to strength and mended about its point, or after half a minute
    if (tac && tac.kind === 'rally') {
      const back = live.filter(m => !m.hero && Math.hypot(m.tx - tac.x, m.ty - tac.y) <= 5);
      const hp = back.length ? back.reduce((a, m) => a + hpk(m), 0) / back.length : 0;
      if ((back.length >= Math.ceil(n * 0.75) && hp >= 0.65) || G.t > tac.until) {
        q.tac = null;
        S.rallyT = G.t;
        q.rallyCd = G.t + 25;
        if (W.jaeng && W.plans && W.plans[team]) W.plans[team].t = 0;
        beh(W, G.t > tac.until ? 'rallyTimeout' : 'rallyDone');
        if (team === 0 && q.leader && !q.leader.dead) chat(W, q.leader, 'rallied', ['다 모였어요! 다시 갑니다!', '정비 끝! 들어가요!', '재집결 완료, 갑시다!'], { every: 12, must: true, emo: 'ready' });
      } else { q.order = { ...(q.order || {}), x: tac.x, y: tac.y, kind: 'rally', obj: null }; continue; }
    }
    if (q === heroSq) { q.tac = null; q.route = null; continue; }
    // ---- 재집결: begun when the squad is cut down (two of five), or three of five with more foes about it
    const foesBy = () => foeTeams.reduce((a, t) => a + countNear(W, t, Math.round(c[0]), Math.round(c[1]), 6), 0);
    // (not a siege's defence behind its standing gate: its casters strike over the gate from where they stand, and a
    // defence that fell back to gather left the gate to the siege half a minute sooner — balance runs)
    const behindGate = W.mode === 'siege' && team !== W.attacker && !W.gateDown;
    if (!q.tac && c && !behindGate && W.t > 25 && W.phase !== 'final' && G.t >= (q.rallyCd || 0) && (live.length <= 1 ||
      (live.length <= Math.floor(n * 0.4) && foesBy() >= live.length + 1) || (live.length <= Math.ceil(n * 0.6) && foesBy() >= live.length + 3))) {
      const L = Math.hypot(sp[0] - c[0], sp[1] - c[1]);
      if (L > 12) {
        const k = Math.min(10, L - 6) / L, at = snap(W, c[0] + (sp[0] - c[0]) * k, c[1] + (sp[1] - c[1]) * k);
        q.tac = { kind: 'rally', x: at[0], y: at[1], at: G.t, until: G.t + 30 };
        q.route = null;
        beh(W, 'rally');
        if (team === 0 && q.leader) chat(W, q.leader.dead ? live[0] : q.leader, 'rally', [`${q.name} 많이 누웠어요! 뒤로 빠져서 모여요!`, '빠져요! 모였다가 다시!', '둘 남았어요, 재집결!'], { every: 15, must: true, emo: 'gone' });
        q.order = { ...(q.order || {}), x: at[0], y: at[1], kind: 'rally', obj: null };
        continue;
      }
    }
    // ---- 매복: sprung or lapsed
    if (q.tac && q.tac.kind === 'ambush') {
      const A2 = q.tac;
      if ((A2.sprung && G.t > A2.sprung + 8) || (!A2.sprung && G.t > A2.until) || (q.order && q.order.kind === 'rally')) {
        q.tac = null;
        S.ambushT = G.t + rnd(20, 35);
        if (W.jaeng && W.plans && W.plans[team]) W.plans[team].t = 0;
        for (const m of q.members) m.lurk = 0;
        if (!A2.sprung) beh(W, 'ambushLapsed');
      } else { q.order = { ...(q.order || {}), x: A2.x, y: A2.y, kind: 'ambush', obj: null, face: A2.face }; continue; }
    }
    const o = q.order;
    if (!o || !c) { q.route = null; continue; }
    // ---- 우회: a far order is gone to round the side now and then (the hero's 우회: always)
    const far = Math.hypot(o.x - c[0], o.y - c[1]);
    const key = o.kind + ':' + (o.kind === 'pk' ? 't' + o.team : o.kind === 'boss' ? 'boss' : Math.round(o.x / 4) + ',' + Math.round(o.y / 4));
    if (q.route && (q.route.key !== key || G.t > q.route.until)) q.route = null;
    if (!q.route && far >= (q.flank === true ? FLANK_FAR_CALLED : FLANK_FAR) && q.routeKey !== key && o.kind !== 'follow' && o.kind !== 'defend' && !(W.mode === 'siege' && o.kind === 'gate')) {
      q.routeKey = key;
      const want = q.flank || (W.jaeng ? 0.4 : 0.3) * (team === 0 && W.cmds && W.cmds.cur && W.cmds.cur.kind === 'rally' ? 0 : 1);
      const ld = q.leader && !q.leader.dead ? [q.leader.tx, q.leader.ty] : [Math.round(c[0]), Math.round(c[1])];
      if (q.flank === true || Math.random() < want) {
        const r = flankVia(W, ld, [o.x, o.y], team);
        if (r) {
          q.route = { key, via: r.via, done: false, until: G.t + 40, side: r.side };
          beh(W, 'flank');
          if (team === 0 && q.leader && !q.leader.dead && d2(q.leader, W.hero) < 16) chat(W, q.leader, 'flank', [`${q.name} 옆으로 돌아서 갑니다!`, '우회해서 칠게요!', '뒤로 돌아 들어가요!'], { every: 20, p: 0.7 });
        }
      }
    }
    if (q.route && !q.route.done) {
      const R = q.route, ld = q.leader && !q.leader.dead ? q.leader : null;
      const at = ld ? [ld.tx, ld.ty] : c;
      if (Math.hypot(at[0] - R.via[0], at[1] - R.via[1]) <= 3.5) { R.done = true; beh(W, 'flankIn'); }
      else q.order = { ...o, x: R.via[0], y: R.via[1], via: true, to: [o.x, o.y], face: [Math.sign(o.x - R.via[0]), Math.sign(o.y - R.via[1])] };
    }
  }
  // ---- 매복: one squad of the keepers at a time, now and then
  if (G.t >= S.ambushT && W.phase !== 'final' && W.t > 35) {
    S.ambushT = G.t + rnd(8, 14);
    const cand = squads.filter(q => q !== heroSq && !q.tac && q.order && livingOf(q).length >= Math.min(3, q.members.length) &&
      (q.ambushAsk || q.keep || (W.jaeng && q.order.kind === 'seal' && W.seals[q.order.seal] && W.seals[q.order.seal].owner === team) ||
        (W.mode === 'escort' && team !== W.attacker && q.order.kind === 'hold') || (W.mode === 'commander' && q.order.kind === 'defend')));
    const q = cand.find(x => x.ambushAsk) || (Math.random() < (team === 0 && W.cmds && W.cmds.cur && W.cmds.cur.kind === 'hold' ? 0.9 : 0.45) ? pick(cand) : null);
    if (q) {
      // From where the foe comes: its nearest group of fighters about, else its camp.
      const o = q.order, guard = [o.x, o.y];
      let from = foeSpawn();
      let bd = 1e9;
      for (const t of foeTeams) { const cc = centroid(W, t, null); if (cc) { const d = Math.hypot(cc[0] - guard[0], cc[1] - guard[1]); if (d > 8 && d < bd) { bd = d; from = cc; } } }
      const s = ambushSpot(W, from, guard, team);
      if (s) {
        q.tac = { kind: 'ambush', x: s.x, y: s.y, guard, at: G.t, until: G.t + 32, sprung: 0, face: [Math.sign(s.from[0] - s.x), Math.sign(s.from[1] - s.y)] };
        q.route = null;
        q.ambushAsk = false;
        beh(W, 'ambush');
        if (team === 0 && q.leader && !q.leader.dead) chat(W, q.leader, 'ambush', [`${q.name} 길목에 숨어 있을게요`, '여기서 매복합니다, 오면 덮쳐요', '숨어서 기다려요 쉿'], { every: 20, must: true, emo: 'look' });
      }
    }
  }
}

/** A squad lying in wait: still, half seen; sprung on the first foe that comes within reach or a blow that finds it. */
function ambushThink(W, b, order) {
  const G = A.G(), q = b.squad, T = q.tac;
  b.lurk = G.t + 0.5;
  const f = nearest(W, b, AMBUSH_SEE + 0.5);
  if (f || (b.lastHitT && G.t - b.lastHitT < 0.6)) { springAmbush(W, q, f || (alive(b.lastHitBy) ? b.lastHitBy : null)); return false; }
  b.target = null;
  // Close about the spot (a step or two), still.
  if (b.amb === undefined) b.amb = [b.id % 3 - 1, (b.id >> 1) % 3 - 1];
  const at = snap(W, T.x + b.amb[0], T.y + b.amb[1]);
  b.dest = b.tx === at[0] && b.ty === at[1] ? null : at;
  if (!b.dest && T.face) { b.fdx = T.face[0]; b.fdy = T.face[1]; }
  return true;
}
function springAmbush(W, q, f) {
  const G = A.G(), T = q.tac;
  if (!T || T.sprung) return;
  T.sprung = G.t;
  beh(W, 'sprung');
  for (const m of q.members) {
    if (m.dead || m.hero) continue;
    m.lurk = 0;
    m.ambushT = G.t + 4;
    if (f && alive(f) && m.role !== 'healer') { m.target = f; m.tWhy = 'ambush'; m.retargetT = G.t + 2.5; }
  }
  const ld = q.leader && !q.leader.dead ? q.leader : q.members.find(m => !m.dead && !m.hero);
  if (ld) shout(W, ld, '기습');
  if (q.team === 0) { if (ld) chat(W, ld, 'sprung', ['지금이에요! 덮쳐요!', '매복 성공! 쳐요 쳐!', '걸렸다! 다 나와요!'], { every: 8, must: true, emo: 'rage' }); }
  else if (f && (f.hero || f.team === 0) && d2(f, W.hero) < 10) { A.banner('적 매복!'); A.say(`[${W.teams[q.team].name}] ${q.name}이(가) 숨어 있다 덮칩니다!`, 'warn'); }
}

// ------------------------------------------------ support casts: 기원, buffs, revives

/**
 * A healer's or supporter's casts besides its mends: a buff of its class on a mate near that
 * lacks it (the hero first, as one would for the party one sees), its mana back with
 * 공력증강, the fallen hero raised where it lies. True when it cast (its turn is spent).
 */
function partyCasts(W, b) {
  const G = A.G(), pk = b.party;
  if (!pk) return false;
  // The hero lying near: raised where it fell (a healer only, after a moment's notice).
  // (Not a raid hero whose revives are spent: it lies till the raid is over.)
  if (b.team === 0 && b.role === 'healer' && G.dead && b.cd.r <= 0 && !W.heroOut) {
    const g = W.ghosts.find(x => x.b === W.hero);
    if (g && Math.hypot(g.tx - b.tx, g.ty - b.ty) < (W.raid ? 7 : 6) && G.t - g.t > 1 + (b.lagK || 1) * 0.6 && (!W.raid || !G.over)) {
      if (Math.hypot(g.tx - b.tx, g.ty - b.ty) > 3) { b.dest = snap(W, g.tx, g.ty); return true; }
      reviveHero(W, b, g);
      return true;
    }
  }
  // Mana: low, it says so (now and then) and takes its time; 공력증강 brings it back.
  if (b.mp < 0.22) {
    chat(W, b, 'mana', ['마나 없어요 ㅠ', '엠 없어요 잠깐만요', '마나가 바닥…', '공증 좀 할게요'], { every: 35, p: 0.6, emo: Math.random() < 0.4 ? 'dizzy' : null });
    if (pk.mana && b.cd.m === undefined) b.cd.m = 0;
    if (pk.mana && b.cd.m <= 0) {
      b.cd.m = 30;
      b.mp = Math.min(1, b.mp + 0.5);
      shout(W, b, spellName(pk.mana, b.lv));
      pose(b, 'cast');
      return true;
    }
  }
  if (!pk.buffs.length || b.mp < 0.15) return false;
  if (b.cd.f === undefined) b.cd.f = rnd(3, 8);
  if (b.cd.f > 0) return false;
  // A mate near that lacks it; the hero first while it is in reach.
  const id = pick(pk.buffs), d = SK[id], kind = d.buff;
  if (kind === 'guard' && (b.team !== 0 || !(G.player.hp / G.player.maxHp < 0.35 && G.t - (W.hero.lastHitT || -9) < 2))) return false;
  let to = null;
  const has = m => m.hero ? G.buffs[kind === 'guard' ? 'guard' : kind] > G.t + 1 : (kind === 'power' ? m.powT > G.t + 1 : m.shield > G.t + 1);
  if (b.team === 0 && !G.dead && d2(W.hero, b) <= 6 && !has(W.hero) && (Math.random() < 0.7 || W.raid)) to = W.hero;
  // The enemy guild's buffs go first to its own leaders, as ours go to the hero.
  // (「쟁」: every guild's alike, ours too while the hero sits out.)
  else if ((b.team === 1 || (W.jaeng && (b.team === 2 || G.dead))) && Math.random() < 0.7) { for (const m of W.alive[b.team]) if (m.leader && !m.cmdr && m !== b && d2(m, b) <= 6 && !has(m)) { to = m; break; } }
  if (!to) for (const m of W.alive[b.team]) if (!m.gate && !m.cmdr && !m.troop && !m.hero && d2(m, b) <= 5 && !has(m) && (!to || (m.lastHitT || 0) > (to.lastHitT || 0))) to = m;
  if (!to) { b.cd.f = 2; return false; }
  b.cd.f = rnd(9, 15) / Math.max(0.7, b.skill || 1);
  b.mp -= 0.07;
  castBuff(W, b, to, id);
  return true;
}

/** A buff of the caster's class on a mate: its real effect (the hero's own buffs), its picture, its name. */
function castBuff(W, b, to, id) {
  const G = A.G(), d = SK[id], name = spellName(id, b.lv), fx = spellFx(id, b.lv);
  const dur = Math.min(6, d.duration || 4);
  tally(b, 'buff');
  if (to.hero) {
    const p = G.player;
    if (d.buff === 'power') {
      // Not over a stronger one of the hero's own.
      if (!(G.buffs.power > G.t) || (G.buffs.powerK || 0) <= (d.power || 0.4)) G.buffs.powerK = Math.min(0.6, d.power || 0.4);
      G.buffs.power = Math.max(G.buffs.power, G.t + dur);
    } else if (d.buff === 'guard') G.buffs.guard = Math.max(G.buffs.guard, G.t + Math.min(1.5, d.duration || 1.5));
    else G.buffs[d.buff] = Math.max(G.buffs[d.buff] || 0, G.t + dur);
    if (fx && healFxOk()) aiCast(W, b, id, { by: p, on: p, lv: Math.min(8, 1 + Math.floor(b.lv / 6)) });
    A.floatText(p.x, p.y - 84, name, '#bfe8ff', true);
    supCount(W, 'buff');
    (W.sup.names[name] = (W.sup.names[name] || 0) + 1);
    chat(W, b, 'buffHero', [`${name} 걸어드림`, `${name} 드려요~`, `${name}!`, '버프 받으세요'], { every: 18, p: 0.7 });
  } else {
    if (d.buff === 'power') { to.powT = G.t + dur; to.powK = 1.15; }
    else to.shield = Math.max(to.shield || 0, G.t + dur);
    if (fx && fxOk() && onScreen(to)) aiCast(W, b, id, { by: to, on: to, lv: Math.min(8, 1 + Math.floor(b.lv / 6)) });
  }
  shout(W, b, name);
  pose(b, 'cast');
  face(b, to);
}

/** A healer's mend has reached the hero: the 기원's picture over it, its name, a word now and then. */
function heroMended(W, b, hid) {
  const G = A.G(), p = G.player, name = spellName(hid, b.lv), fx = spellFx(hid, b.lv);
  if (fx && healFxOk()) aiCast(W, b, SK[hid] ? hid : 'c_heal', { by: p, on: p, lv: Math.min(8, 1 + Math.floor(b.lv / 6)) });
  if (G.t - (W.mendSaidT || -99) > 2.5) { W.mendSaidT = G.t; A.floatText(p.x, p.y - 84, name, '#c8ffc0', true); }
  const names = supOf(W).names;
  names[name] = (names[name] || 0) + 1;
  const low = p.hp / p.maxHp < 0.45;
  chat(W, b, low ? 'mendLow' : 'mendHero', low ? ['힐 갑니다! 버텨요!', '피 채워 드릴게요!', `${name}!`] : [`${name} 들어가요`, '힐 갑니다~', `${name} 드림`, '기원 걸어드림'], { every: low ? 12 : 20, p: low ? 0.8 : 0.45 });
}

/** The hero raised by a healer where it fell. */
function reviveHero(W, healer, g) {
  const G = A.G(), p = G.player;
  healer.cd.r = 18;
  G.dead = false;
  W.heroBack = 0;
  W.hero.dead = false;
  p.hp = Math.max(1, p.maxHp * 0.4);
  G.buffs.guard = Math.max(G.buffs.guard, G.t + 1.5);
  W.ghosts = W.ghosts.filter(x => x !== g);
  credit(healer, 'revives', 1);
  if (W.raid && W.stat) W.stat.revives++;
  supCount(W, 'revive');
  shout(W, healer, '부활');
  A.addFx(A.FX.revive, 0, 2, { follow: true, anchor: 'bottom' });
  A.say(`${healer.name}님이 부활시켜 주었습니다.`, 'sys');
  chat(W, healer, 'reviveHero', ['부활 갑니다!', '일어나세요!', '부활! 정신 차려요'], { every: 6, must: true });
  G.bubble = { text: pick(['감사합니다!', '고마워요!', '살았다 ㅠ']), t: G.t + 0.6 };
}

/** A fighter raised by an ally: thanks, now and then. */
function thanks(W, b, by) {
  if (b.team !== 0 || !by) return;
  const G = A.G();
  A.later(rnd(0.6, 1.4), () => {
    if (W.over || b.dead) return;
    b.talked = -99;
    chat(W, b, 'thanks', by.hero ? ['감사합니다!', '부활 감사요 ㅠ', '고마워요!!'] : ['감사요!', '살았다 ㅋㅋ', '고마워요'], { every: by.hero ? 4 : 16, p: by.hero ? 1 : 0.5, emo: Math.random() < 0.5 ? 'cute' : 'gains', must: !!by.hero });
  });
}


/**
 * 레이드: the raiders' own words between the raid leader's calls — the boss turned on the hero,
 * the floor under the hero's party, healers lying, the boss's great blow coming.
 */
function raidBanter(W) {
  const G = A.G(), boss = W.boss;
  if (!boss || G.over) return;
  const near = W.alive[0].filter(m => !m.hero && d2(m, W.hero) < 9);
  if (!near.length) return;
  const by = role => near.filter(m => m.role === role)[0] || pick(near);
  if (G.aggro === G.player && W.role !== 'tank' && W.lastAggro !== G.player) chat(W, by('tank'), 'aggroHero', ['보스 그쪽 봐요! 도발 갑니다', '어그로 튀었어요! 잡을게요', '딜 조금만 쉬어요 어그로!'], { every: 20, p: 0.8 });
  W.lastAggro = G.aggro;
  const last = G.marks.length ? G.marks[G.marks.length - 1] : null;
  if (last && last !== W.lastMark && !last.done) {
    W.lastMark = last;
    if (last.tiles.some(([x, y]) => Math.abs(x - G.player.tx) + Math.abs(y - G.player.ty) <= 2)) chat(W, pick(near), 'markHero', ['발밑 장판!', '피해요 피해!', '빨간 데 나와요!'], { every: 12, p: 0.5, gap: 2 });
  }
  if (G.blast && W.lastBlast !== G.blast) { W.lastBlast = G.blast; chat(W, pick(near), 'blastBanter', ['광역 온다! 뭉쳐서 힐 받아요', '힐러님 광역 대비요!', '마비 누가 좀!'], { every: 25, p: 0.6, emo: Math.random() < 0.4 ? 'surprise' : null }); }
  const downH = W.bodies.filter(b => b.role === 'healer' && b.dead).length;
  if (downH >= 3) chat(W, pick(near), 'healersDown', ['힐러 다 누웠어요!! 부활 좀!', '힐러가 없어요 ㅠㅠ', '힐 없음 버텨요!'], { every: 30, p: 0.8, emo: 'gone' });
}

// ---------------------------------------------------------------- the war across the field (쟁)
// A guild war is not one blob round the points: early on the guilds spread over the field —
// patrols to the side paths, crates and watch posts, a squad or two on the points — and the
// players play by their own kind: hunters (자객·사신 and the strong) seek out the strong or the
// lone and kill them, divers go for the enemy's healers, the weak keep to their friends and run
// from bad odds, two who meet alone fight it out while the rest let them be. Toward the end the
// guilds gather on one decisive point (결전), called in the chat and on the screen.

/** A fighter's way of playing the war, from its class, its strength and chance. */
function warStyle(W, f) {
  if (W.raid || f.role === 'tank' || f.role === 'healer') return 'obj';
  const burst = ['rogue', 'reaper', 'dokkaebi', 'monk'].includes(f.cls.id);
  const strong = f.pw > 1.04 || f.lv >= 36;
  const weak = f.pw < 0.94 || f.lv <= 22;
  const r = Math.random();
  if (f.role === 'dps' && (burst ? r < 0.6 : strong && r < 0.3)) return 'hunter';
  if (weak && r < 0.6) return 'cautious';
  if (f.role === 'dps' && r < 0.5) return 'diver';
  if (f.role === 'support' && r < 0.3) return 'diver';
  return r < 0.75 ? 'skirm' : 'obj';
}

/** Spots over the whole field for patrols and flanks: points, crates, watch posts, and open ground between. */
function roamSpots(W) {
  if (W.roam) return W.roam;
  const d = W.def, out = [];
  const add = p => { if (p) out.push(snap(W, p[0], p[1])); };
  for (const p of (d.flags || []).concat(d.crates || [], d.cratesOut || [], d.scouts || [])) add(p);
  if (d.mid) add(d.mid);
  // Open ground on a coarse grid, away from both camps.
  const { cols, rows } = W.map, step = Math.max(6, Math.round(Math.min(cols, rows) / 5));
  for (let y = 3; y < rows - 2; y += step)
    for (let x = 3; x < cols - 2; x += step) {
      if (!open(W, x, y)) continue;
      if (W.teams.some(t => Math.abs(t.spawn[0] - x) + Math.abs(t.spawn[1] - y) < 8)) continue;
      out.push([x, y]);
    }
  return (W.roam = out);
}

/** The war's pace: spread (skirmishes), then the guilds' plans, then the 결전 on one point. */
function warPhase(W) {
  const G = A.G(), T = W.def.time || 300, k = W.t / T;
  let ph = k < 0.28 ? 'spread' : 'plan';
  if (W.mode === 'capture' && (k >= 0.62 || Math.max(...W.score) >= W.def.target * 0.72)) ph = 'final';
  else if (W.mode === 'commander' && k >= 0.62) ph = 'final';
  else if (W.mode === 'escort' && W.cart && (W.cart.i >= (W.path.length - 1) * 0.65 || (W.round === 2 && W.left < 45))) ph = 'final';
  else if (W.mode === 'siege') ph = W.gateDown ? 'final' : k < 0.2 ? 'spread' : 'plan';
  if (W.phase === 'final' && ph !== 'final' && W.mode === 'escort' && W.finalRound === W.round) ph = 'final';
  if (ph !== W.phase) {
    W.phase = ph;
    (W.phaseLog = W.phaseLog || []).push([Math.round(W.t), ph]);
    if (ph === 'final') {
      W.finalRound = W.round;
      const at = finalPoint(W);
      W.final = at;
      const where = at.name || '';
      if (W.mode !== 'siege') A.banner(`결전! ${where}`);
      A.say(`[결전] ${where} — 양 문파가 모두 모입니다!`, 'warn');
      const ld = W.teams[0].squads.map(q => q.leader).find(l => l && !l.dead);
      if (ld) A.later(1.2, () => chat(W, ld, 'final', [`결전입니다! 전원 ${where}로!`, `다 모여요! ${where} 총력전!`], { every: 5, must: true, gap: 0, emo: 'ready' }));
    }
  }
  if (ph === 'final') W.final = finalPoint(W, W.final);
}
/** The decisive point: capture — the point the guilds fight over (the middle one, else the most fought); commander — the leading side's 대장; escort — the cart; siege — the 수성대장. */
function finalPoint(W, prev) {
  if (W.mode === 'capture') {
    if (prev && prev.f) return prev;
    const mid = W.flags.slice().sort((a, b) => Math.hypot(a.x - (W.teams[0].spawn[0] + W.teams[1].spawn[0]) / 2, a.y - (W.teams[0].spawn[1] + W.teams[1].spawn[1]) / 2)
      - Math.hypot(b.x - (W.teams[0].spawn[0] + W.teams[1].spawn[0]) / 2, b.y - (W.teams[0].spawn[1] + W.teams[1].spawn[1]) / 2))[0];
    return { x: mid.x, y: mid.y, f: mid, name: `${mid.name} 거점` };
  }
  // 대장전: the middle of the court (at the leading side's 대장 the trailing guild ran into its
  // camp, its guards and its risen, and fed it kills: 180 : 90 either way).
  if (W.mode === 'commander') return { x: W.def.mid[0], y: W.def.mid[1], name: '백호성 안뜰 중앙' };
  if (W.mode === 'escort') return { x: W.cart.tx, y: W.cart.ty, name: '수레 마지막 길목' };
  const c = W.teams[1 - W.attacker].cmd;
  return { x: c.tx, y: c.ty, name: '수성대장' };
}

/**
 * Squads' orders while the field is spread: a squad or two on the war's objective as planned,
 * the others on patrols to spots over the field (a new one every twenty seconds or so, the side
 * paths among them). Called after the plan, so the plan's keepers stay.
 */
function spreadOrders(W, team, set, squads) {
  const G = A.G(), spots = roamSpots(W);
  if (!spots.length) return;
  const T = W.teams[team], es = W.teams[1 - team].spawn, ms = T.spawn;
  const L = Math.hypot(es[0] - ms[0], es[1] - ms[1]) || 1;
  // Spots on our half and the middle, more forward for the bold.
  const fwd = s => ((s[0] - ms[0]) * (es[0] - ms[0]) + (s[1] - ms[1]) * (es[1] - ms[1])) / L / L;
  const ok = spots.filter(s => fwd(s) > 0.1 && fwd(s) < 0.75);
  squads.forEach((q, i) => {
    if (q.keep || i === 1 && team === 0 && W.lead && W.lead.on) return;
    // Half the squads keep to the plan (in an escort or a siege all but the last).
    if ((W.mode === 'escort' || W.mode === 'siege') ? i !== squads.length - 1 : i % 2 === 0) return;
    if (!q.patrol || G.t > q.patrolT || Math.abs(q.patrol[0] - (q.order ? q.order.x : 0)) > 99) {
      q.patrol = pick(ok.length ? ok : spots);
      q.patrolT = G.t + rnd(16, 28);
    }
    set(q, q.patrol[0], q.patrol[1], 'patrol', null, null);
  });
}

/** The 결전: every squad (keepers too, all but one) onto the decisive point. */
function finalOrders(W, team, set, squads) {
  const f = W.final;
  if (!f) return;
  squads.forEach((q, i) => {
    q.keep = false;
    let x = f.x, y = f.y, kind = 'capture', obj = null;
    if (W.mode === 'commander') kind = 'hold';
    else if (W.mode === 'escort') kind = team === W.attacker ? 'escort' : 'intercept';
    else if (W.mode === 'siege') { kind = team === W.attacker ? 'assault' : 'defend'; obj = team === W.attacker ? W.teams[1 - W.attacker].cmd : null; }
    set(q, x + ((i % 3) - 1) * 1.3, y + (i > 2 ? 1 : -1) * 0.9, kind, obj, null);
  });
}

/**
 * A fighter's own play, by its style, when it is not following the hero or carrying: true when
 * it acted (its target and its way chosen). Hunters roam for the strong and the lone, divers for
 * the healers, the cautious keep to friends and run from bad odds; in the 결전 they all fight
 * at the point.
 */
function soloThink(W, b, order) {
  const G = A.G(), st = b.style;
  if (!st || st === 'obj' || order.kind === 'follow' || W.phase === 'final' || (W.jaeng && order.kind !== 'pk')) return false;
  const foes = foesOf(W, b.team), mates = W.alive[b.team];
  const around = (who, list, r) => { let n = 0; for (const o of list) if (o !== who && !o.gate && Math.abs(o.tx - who.tx) + Math.abs(o.ty - who.ty) <= r) n++; return n; };
  // The cautious: outnumbered near, back to the nearest group of friends.
  if (st === 'cautious') {
    const nf = around(b, foes, 5), nm = around(b, mates, 5);
    if (nf >= 2 && nf > nm + 1) {
      let best = null, bd = 1e9;
      for (const m of mates) { if (m === b || m.gate || m.troop) continue; const d = d2(m, b); if (d > 3 && d < bd && around(m, mates, 3) >= 2) { bd = d; best = m; } }
      const t = nearest(W, b, b.kit.range + 0.5);
      if (t) act(W, b, t);
      b.dest = best ? [best.tx, best.ty] : [W.teams[b.team].spawn[0], W.teams[b.team].spawn[1]];
      b.hiding = G.t;
      return true;
    }
    return false;
  }
  if (st !== 'hunter' && st !== 'diver') return false;
  // Its prey, looked for every few seconds.
  if (!b.prey || !alive(b.prey) || G.t > (b.preyT || 0) || (b.prey.hero && G.buffs.stealth > G.t)) {
    b.preyT = G.t + rnd(3, 5);
    let best = null, bs = -1e9;
    const R = st === 'hunter' ? 22 : 18;
    for (const e of foes) {
      // The hero too: the strongest of its guild, hunted when it walks alone or is hurt (the enemy's
      // hunters passed it over, and the hero's side alone had a star its guild rallied round).
      if (e.gate || e.troop || e.cmdr || (b.only !== undefined && e.team !== b.only) || (e.hero && (G.buffs.stealth > G.t || (G.player.hp / G.player.maxHp > 0.6 && around(e, W.alive[0], 4) > 1)))) continue;
      const d = d2(b, e);
      if (d > R) continue;
      let s = -d * 0.25;
      if (st === 'diver') s += e.role === 'healer' ? 6 : e.role === 'support' ? 1 : -4;
      else s += (around(e, W.alive[e.team], 4) === 0 ? 4 : 0) + (e.pw > 1.04 || e.leader || e.hero ? 2 : 0) + (1 - hpk(e)) * 3 + (e.role === 'healer' ? 1.5 : 0) - (e.role === 'tank' ? 2 : 0)
        // One seen running off to hide (or hiding where it was seen go): easy prey, sought out.
        + (e.hide ? (e.hide.seenBy === b.team ? 6 : d < 10 ? 3 : 0) : 0);
      // Not into a crowd of theirs.
      s -= Math.max(0, around(e, W.alive[e.team], 4) - 1) * 1.5;
      if (s > bs) { bs = s; best = e; }
    }
    if (best && bs < (st === 'diver' ? 0 : -2)) best = null;
    if (best !== b.prey) {
      b.prey = best;
      if (best && st === 'diver' && best.role === 'healer') {
        if (b.team === 1 && best.team === 0) {
          const near = W.alive[0].filter(m => !m.hero && !m.troop && !m.cmdr && d2(m, best) < 8);
          if (near.length) chat(W, pick(near), 'dive', [`${b.name}가 우리 힐러 노리는 중!`, `힐러 쪽에 ${b.cls.name} 붙었어요!`, '힐러 지켜요!!'], { every: 25, p: 0.7, emo: Math.random() < 0.4 ? 'surprise' : null });
        } else if (b.team === 0) chat(W, b, 'diveGo', ['적 힐러 끊으러 갑니다', `${best.name} 힐러 잡으러 감`], { every: 30, p: 0.35 });
      }
      if (best && st === 'hunter' && b.team === 0) chat(W, b, 'hunt', [`${best.name} 혼자 있네 ㅋㅋ 잡으러 감`, '사냥 갑니다', `${best.cls ? best.cls.name : ''} 하나 따러 감`], { every: 30, p: 0.3 });
    }
  }
  const t = b.prey;
  if (!t) return false;
  // Bad odds where the prey stands: give it up for now.
  if (d2(b, t) < 7 && around(t, W.alive[t.team], 4) >= 3 + (st === 'hunter' && b.pw > 1.04 ? 1 : 0)) { b.prey = null; b.preyT = G.t + rnd(4, 7); return false; }
  b.target = t;
  b.tWhy = st;
  const dist = d2(b, t), range = b.kit.range;
  // A hider found in its corner.
  if (t.hide && t.hide.phase === 'wait' && dist <= 2.5 && !t.hide.found) found(W, t, b);
  if (range > 1) b.dest = dist > range ? [t.tx, t.ty] : dist < 2 ? [clamp(b.tx + (Math.sign(b.tx - t.tx) || 1) * 2, 0, W.map.cols - 1), b.ty] : null;
  else b.dest = dist > 1.5 ? bladeDest(W, b, t, 1.5) : null;
  if (dist <= range + 0.5) {
    act(W, b, t);
    duelCheck(W, b, t);
    // A dive that reached its healer (counted once a dive).
    if (st === 'diver' && t.role === 'healer' && b.diveOn !== t) { b.diveOn = t; if (W.diag) W.diag.dives = (W.diag.dives || 0) + 1; }
  }
  return true;
}

/**
 * Two who meet alone (no friend of either within four tiles) fight it out: the others near let
 * them be a few seconds (pickFoe passes a duellist over), and someone calls it now and then.
 */
function duelCheck(W, b, t) {
  const G = A.G();
  if (b.duel && b.duel.until > G.t) return;
  if (t.gate || t.cmdr || t.troop || (t.duel && t.duel.until > G.t)) return;
  const alone = (x, list) => !list.some(o => o !== x && !o.gate && !o.troop && Math.abs(o.tx - x.tx) + Math.abs(o.ty - x.ty) <= 4);
  if (!alone(b, W.alive[b.team]) || !alone(t, W.alive[t.team])) return;
  const until = G.t + rnd(6, 10);
  b.duel = { with: t, until };
  t.duel = { with: b, until };
  if (W.diag) W.diag.duels = (W.diag.duels || 0) + 1;
  const ours = b.team === 0 ? b : t.team === 0 ? t : null;
  if (ours) {
    const near = W.alive[0].filter(m => m !== ours && !m.troop && !m.cmdr && !m.hero && d2(m, ours) < 12);
    if (ours.hero) chat(W, pick(near.length ? near : [ours]), 'duel', ['1:1 붙었다! 구경 ㄱㄱ', '오 1:1 ㅋㅋ', '이겨라!!'], { every: 30, p: 0.8 });
    else if (near.length) chat(W, pick(near), 'duel', [`${ours.name} 1:1 붙었다!`, '1:1 떴다 ㅋㅋ', '저기 1:1 중'], { every: 25, p: 0.6, emo: Math.random() < 0.5 ? 'popcorn' : null });
    else if (d2(ours, W.hero) < 14) chat(W, ours, 'duel', ['1:1 하자 ㅋ', '덤벼!'], { every: 25, p: 0.5 });
  }
}
/** A duellist the fighter should pass over (another's fight), true when so. */
function inDuel(W, b, e) {
  const d = e.duel;
  return !!(d && d.until > A.G().t && d.with !== b && alive(d.with));
}

// ------------------------------------------------ the weak hide (숨기)
// A weak player in a guild war does not stand in the middle of it: it keeps to the edge, and when
// the odds turn (outnumbered, its life low, a healer jumped with no tank by) it runs behind a
// wall or into a corner out of the enemy's sight, waits there, peeks out, and comes back in when
// its friends are winning; caught there, it runs to them shouting for help. A few of each guild
// at most, and never the one carrying a crate: the objectives go on. Hunters look in the corners.

const HIDE_MAX = 3;

/** Whether a fighter is one of the timid: the cautious, some weak healers, a few other weak ones. */
function timidOf(W, f) {
  if (W.raid || f.role === 'tank') return false;
  const weak = f.pw < 0.94 || f.lv <= 22;
  if (f.style === 'cautious') return true;
  if (f.role === 'healer') return weak && Math.random() < 0.5;
  return weak && Math.random() < 0.15;
}

/** Whether the walk grid lets one see from (ax, ay) to (bx, by): no closed tile on the line between. */
function los(W, ax, ay, bx, by) {
  const m = W.map, n = Math.max(Math.abs(bx - ax), Math.abs(by - ay)) * 2;
  for (let i = 1; i < n; i++) {
    const x = Math.round(ax + (bx - ax) * i / n), y = Math.round(ay + (by - ay) * i / n);
    if ((x !== ax || y !== ay) && (x !== bx || y !== by) && !m.walk[y * m.cols + x]) return false;
  }
  return true;
}

/** A hider in its corner, out of b's sight: passed over (the war's look-arounds) unless right by it. */
function unseen(W, b, e, d) {
  if (e.lurk > A.G().t && d > AMBUSH_SEE) return true; // (매복: half seen, passed over beyond 3.5 tiles)
  return !!(e.hide && e.hide.phase === 'wait' && d > 2.5 && !los(W, b.tx, b.ty, e.tx, e.ty));
}

/**
 * A place to hide from the foes near (walking distance up to nine): out of their sight lines (a
 * wall between), tucked against walls (a corner, a nook, a side yard), away from them and not
 * through them. Null when there is none worth it.
 */
function hideSpot(W, b, foes) {
  const m = W.map, cols = m.cols, rows = m.rows, seen = new Set();
  const q = [[b.tx, b.ty, 0]];
  foes = foes.filter(e => Math.abs(e.tx - b.tx) + Math.abs(e.ty - b.ty) <= 18);
  seen.add(b.ty * cols + b.tx);
  let best = null, bs = -1e9;
  const fx = foes.reduce((a, e) => a + e.tx, 0) / foes.length, fy = foes.reduce((a, e) => a + e.ty, 0) / foes.length;
  for (let h = 0; h < q.length; h++) {
    const [x, y, st] = q[h];
    if (st >= 2) {
      let near = 1e9, sees = 0;
      for (const e of foes) {
        const d = Math.abs(e.tx - x) + Math.abs(e.ty - y);
        near = Math.min(near, d);
        if (d <= 16 && los(W, e.tx, e.ty, x, y)) { sees++; break; }
      }
      if (!sees && near >= 4) {
        let wall = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if ((dx || dy) && (nx < 0 || ny < 0 || nx >= cols || ny >= rows || !m.walk[ny * cols + nx])) wall++;
        }
        if (wall >= 2) {
          // Away from the foes (not round them to the far side of the fight).
          const away = (Math.abs(x - fx) + Math.abs(y - fy)) - (Math.abs(b.tx - fx) + Math.abs(b.ty - fy));
          // (A corner or a nook, three sides walled or more, well before a wall's foot.)
          const sc = (wall >= 3 ? 3 : 0) + Math.min(5, wall) * 1.2 + Math.min(near, 9) * 0.5 + clamp(away, -4, 4) * 0.6 - st * 0.3 - (A.occ.has(k2(x, y)) ? 4 : 0);
          if (sc > bs) { bs = sc; best = [x, y]; }
        }
      }
    }
    if (st >= 9) continue;
    for (const [dx, dy] of DIR4) {
      const nx = x + dx, ny = y + dy, ni = ny * cols + nx;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || seen.has(ni) || !open(W, nx, ny, b.team)) continue;
      // Not past a foe to get there.
      if (foes.some(e => Math.abs(e.tx - nx) + Math.abs(e.ty - ny) <= 1)) continue;
      seen.add(ni);
      q.push([nx, ny, st + 1]);
    }
  }
  return best;
}

/** Test counters (__warState().diag.hide): how often the timid hide, why, how it ends, for how long. */
function hideDiag(W) {
  return W.diag && (W.diag.hide = W.diag.hide || { starts: 0, team: [0, 0], why: {}, found: 0, fled: 0, peeks: 0, back: 0, timeout: 0, time: 0, n: 0, max: 0 });
}

/** The hider stops hiding (how: back in, fled, …); its time hidden counted. */
function endHide(W, b, how) {
  const G = A.G(), h = b.hide;
  if (!h) return;
  b.hide = null;
  b.hideCd = G.t + rnd(10, 20);
  const D = hideDiag(W);
  if (D) {
    const t = G.t - h.at0;
    D.time += t; D.n++; D.max = Math.max(D.max, t);
    D[how] = (D[how] || 0) + 1;
  }
}

/** A hider come upon in its corner. */
function found(W, t, by) {
  t.hide.found = true;
  t.hide.by = by;
  const D = hideDiag(W);
  if (D) {
    D.found++;
    if (by.style === 'hunter') D.byHunter = (D.byHunter || 0) + 1;
    (D.log = D.log || []).length < 12 && D.log.push([Math.round(W.t), t.team, t.name, t.tx, t.ty, by.name, by.style || '']);
  }
  if (t.team === 0) chat(W, t, 'found', ['살려줘요!!', '들켰다 ㅠㅠ', '저 좀 살려줘요!', '헉 찾아왔어'], { every: 8, p: 0.9, emo: Math.random() < 0.5 ? 'surprise' : null });
  else if (by.team === 0) chat(W, by, 'found', ['숨어 있는 거 찾았다 ㅋㅋ', '거기 숨어 있었네?', '구석에 하나 있다 ㅋ'], { every: 12, p: 0.8 });
}

/**
 * The timid's play: true when it acted. Out of a fight going badly into a hiding place, there a
 * while, a peek, back in when the odds are good; caught, away to its friends.
 */
function hideThink(W, b, order) {
  const G = A.G();
  if (!b.timid || b.carry || W.raid) return false;
  const h = b.hide;
  const foes = foesOf(W, b.team), mates = W.alive[b.team];
  const count = (list, x, y, r) => { let n = 0; for (const o of list) if (o !== b && !o.gate && Math.abs(o.tx - x) + Math.abs(o.ty - y) <= r) n++; return n; };
  const k = hpk(b);
  if (!h) {
    if (G.t < (b.hideCd || 0)) return false;
    const near = foes.filter(e => !e.gate && !e.troop && Math.abs(e.tx - b.tx) + Math.abs(e.ty - b.ty) <= 6);
    if (!near.length) return false;
    const nf = near.length, nm = count(mates, b.tx, b.ty, 5);
    const struck = G.t - (b.lastHitT || -9) < 1.5;
    // In the 결전 only the hurt hide: the rest come to the point.
    let why = null;
    if (k < 0.4) why = 'low';
    else if (W.phase !== 'final' && b.role === 'healer' && struck && !mates.some(m => m.role === 'tank' && d2(m, b) < 3)) why = 'healer';
    else if (W.phase !== 'final' && nf >= 2 && nf > nm + 1) why = 'odds';
    if (!why) return false;
    let n = 0;
    for (const m of mates) if (m.hide) n++;
    if (n >= HIDE_MAX) return false;
    b.hideCd = G.t + 2; // (looked, and found no place: not again at once)
    const spot = hideSpot(W, b, foes.filter(e => !e.gate));
    if (!spot) return false;
    // Seen going: the hunters of the other side know where to look.
    const seer = Math.random() < 0.8 ? near.find(e => los(W, e.tx, e.ty, b.tx, b.ty)) : null;
    const seenBy = seer ? seer.team : -1;
    b.hide = { spot, phase: 'go', at0: G.t, until: G.t + rnd(8, 16), why, seenBy, found: false, fight: [b.tx, b.ty] };
    b.state = 'go';
    b.retreatTo = undefined;
    const D = hideDiag(W);
    if (D) { D.starts++; D.team[b.team]++; D.why[why] = (D.why[why] || 0) + 1; }
    chat(W, b, 'hide', why === 'low' ? ['피 없어서 숨을게요', '잠깐 숨어요 ㅠ', '저 숨어 있을게요'] : why === 'healer' ? ['힐러 물려서 숨어요!', '살려줘요 저 숨을게요', '탱님 저 좀요 ㅠ'] : ['저 숨어 있을게요', '쪽수 밀려서 빠짐', '잠깐 숨을게요'], { every: 12, p: 0.55, emo: Math.random() < 0.3 ? 'sweat' : null });
    b.dest = spot;
    b.target = null;
    return true;
  }
  const D = hideDiag(W);
  // Not for ever: half a minute at most, then back to the war whatever the odds.
  if (G.t - h.at0 > 30) { endHide(W, b, 'timeout'); return false; }
  const closest = nearest(W, b, 4);
  // Caught (a foe on it, or at it with a clear line): away to its friends, calling for help.
  if (h.phase !== 'flee' && closest && (d2(closest, b) <= 2 || (h.phase === 'wait' && los(W, closest.tx, closest.ty, b.tx, b.ty)))) {
    if (h.phase === 'wait' && !h.found) found(W, b, closest);
    h.phase = 'flee';
    h.fleeT = G.t + rnd(3, 5);
    if (b.team === 0) chat(W, b, 'help', ['살려줘요!!', '저 쫓기고 있어요 ㅠㅠ', '도와줘요!!'], { every: 6, p: 0.8, emo: Math.random() < 0.4 ? 'dizzy' : null });
  }
  if (h.phase === 'flee') {
    let best = null, bd = 1e9;
    for (const m of mates) { if (m === b || m.gate || m.hide) continue; const d = d2(m, b); if (d > 2 && d < bd && count(mates, m.tx, m.ty, 3) >= 2) { bd = d; best = m; } }
    const sp = W.teams[b.team].spawn;
    b.dest = best ? [best.tx, best.ty] : [sp[0], sp[1]];
    const t = nearest(W, b, b.kit.range + 0.5);
    if (t) act(W, b, t);
    if (G.t > h.fleeT || (best && bd <= 3) || !nearest(W, b, 6)) endHide(W, b, 'fled');
    return true;
  }
  if (h.phase === 'go') {
    if (b.tx !== h.spot[0] || b.ty !== h.spot[1]) {
      b.dest = h.spot;
      if (G.t - h.at0 > 9 && !h.waitAt) endHide(W, b, 'timeout');
      return true;
    }
    h.phase = 'wait';
    h.waitAt = h.waitAt || G.t;
    h.peekT = G.t + rnd(3, 6);
  }
  if (h.phase === 'wait') {
    b.dest = null;
    b.target = null;
    // A potion or two while it waits (thinking eight times a second).
    b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.025 * 0.125);
    if (G.t > h.peekT || (G.t > h.until && k > 0.5)) {
      h.phase = 'peek';
      h.peekUntil = G.t + rnd(1.2, 2.2);
      // A step or two out of the corner, toward where the fight was.
      const dx = Math.sign(h.fight[0] - b.tx), dy = Math.sign(h.fight[1] - b.ty);
      h.peekAt = dx && open(W, b.tx + dx * 2, b.ty, b.team) ? [b.tx + dx * 2, b.ty] : dy && open(W, b.tx, b.ty + dy * 2, b.team) ? [b.tx, b.ty + dy * 2] : [b.tx + dx, b.ty + dy];
      if (D) D.peeks++;
    }
    return true;
  }
  if (h.phase === 'peek') {
    b.dest = open(W, h.peekAt[0], h.peekAt[1], b.team) ? h.peekAt : null;
    // A caster pokes from the corner.
    const t = nearest(W, b, b.kit.range + 0.5);
    if (t && b.kit.range > 1) act(W, b, t);
    if (G.t < h.peekUntil) return true;
    const near = foes.filter(e => !e.gate && Math.abs(e.tx - b.tx) + Math.abs(e.ty - b.ty) <= 9);
    const good = k > 0.65 && (near.length === 0 || count(mates, b.tx, b.ty, 8) >= near.length + 1);
    if (good || G.t > h.until + 10 || W.phase === 'final' && k > 0.5) {
      chat(W, b, 'back', ['지금 들어갈게요!', '이제 갑니다', '나도 갈게요 ㅋ'], { every: 14, p: 0.5 });
      endHide(W, b, 'back');
      return false;
    }
    h.phase = 'go';
    b.dest = h.spot;
    return true;
  }
  return false;
}

// ---------------------------------------------------------------- the end

function checkEnd(W) {
  const G = A.G();
  let win = -1, why = '';
  const left = W.left <= 0;
  if (W.mode === 'capture') {
    if (W.score[0] >= W.def.target || W.score[1] >= W.def.target) { win = W.score[0] >= W.score[1] ? 0 : 1; why = `${W.def.target}점 선취`; }
    else if (left) {
      // (a tie went to our guild: score[0] >= score[1]. Now the 거점 held at the end, then the kills, then the defender's luck
      // of the first-taken centre is not ours by default)
      const held = t => W.flags.filter(f => f.owner === t).length;
      win = W.score[0] !== W.score[1] ? (W.score[0] > W.score[1] ? 0 : 1) : held(0) !== held(1) ? (held(0) > held(1) ? 0 : 1) : W.teams[0].kills !== W.teams[1].kills ? (W.teams[0].kills > W.teams[1].kills ? 0 : 1) : (Math.random() < 0.5 ? 0 : 1);
      why = `시간 종료 ${W.score[0]} : ${W.score[1]}${W.score[0] === W.score[1] ? ' (동점 — 쥔 거점·처치로)' : ''}`;
    }
  } else if (W.mode === 'commander') {
    for (const t of [0, 1]) if (W.teams[t].cmd.dead) { win = 1 - t; why = `${W.teams[t].name} 진영대장 격파`; }
    if (win < 0 && W.def.kills) for (const t of [0, 1]) if (W.score[t] >= W.def.kills) { win = t; why = `${W.def.kills}점 선취 ${Math.floor(W.score[0])} : ${Math.floor(W.score[1])}`; }
    if (win < 0 && left) {
      const s = t => W.score[t] + 30 * hpk(W.teams[t].cmd);
      win = s(0) !== s(1) ? (s(0) > s(1) ? 0 : 1) : W.teams[0].kills !== W.teams[1].kills ? (W.teams[0].kills > W.teams[1].kills ? 0 : 1) : (Math.random() < 0.5 ? 0 : 1); // (a tie was ours)
      why = `시간 종료 · 처치 ${Math.floor(W.score[0])} : ${Math.floor(W.score[1])}`;
    }
  } else if (W.mode === 'escort') {
    const c = W.cart;
    if (W.round === 2) {
      const first = 1 - W.attacker;
      if (c.best[W.attacker] > c.best[first] + 0.01) { win = W.attacker; why = '더 멀리 호위'; }
      else if (left || c.i >= W.path.length - 1) {
        const e = c.endAt || [];
        // both to the end: the quicker (it went to the first half's side whatever the pace)
        if (c.best[W.attacker] >= c.best[first] - 0.01 && e[W.attacker] != null && e[first] != null) { win = e[W.attacker] < e[first] ? W.attacker : first; why = `둘 다 본당 — 더 빨리 (${Math.round(e[0] ?? 0)}초 : ${Math.round(e[1] ?? 0)}초)`; }
        else if (Math.abs(c.best[W.attacker] - c.best[first]) <= 0.01 && c.bestAt) { const b = c.bestAt; win = b[W.attacker] < b[first] ? W.attacker : first; why = `같은 곳까지 — 먼저 닿은 쪽 (${Math.round(b[0])}초 : ${Math.round(b[1])}초)`; }
        else { win = c.best[W.attacker] > c.best[first] ? W.attacker : first; why = '더 멀리 호위'; }
      }
    }
    if (win >= 0) {
      const pct = t => Math.round(c.best[t] / (W.path.length - 1) * 100);
      why += ` (${W.teams[0].name} ${pct(0)}% : ${W.teams[1].name} ${pct(1)}%)`;
    }
  } else if (W.mode === 'siege') {
    const dc = W.teams[1 - W.attacker].cmd;
    if (dc.dead) { win = W.attacker; why = '수성대장 격파'; }
    else if (left) { win = 1 - W.attacker; why = W.gateDown ? '수성대장 생존' : '성문 사수'; }
  }
  if (win >= 0) finish(W, win, why);
}

/**
 * Contribution, normalized by role (a healer or a tank can top the board). It is counted per
 * time on one's feet (half of it: a death still costs), so a fighter is not behind only for the
 * seconds it lay dead, and a kill or an assist weighs less than the blows that made it (a hero's
 * sweep used to collect an assist from every fall around it). In a raid the boss's damage
 * counts in full, its servants' at 0.6, and a servant felled is not counted apart (a hero's sweep
 * fells them by the hundred).
 */
function scoreOf(W, b) {
  const U = W.refHp / 22, s = b.stats;
  const w = { tank: [0.5, 0.3, 1.0], healer: [0.4, 1.2, 0.3], dps: [1.0, 0.4, 0.3], support: [0.6, 0.8, 0.5] }[b.role] || [1, 1, 0.5];
  const dmg = W.raid || W.jaeng ? s.boss + 0.6 * (s.dmg - s.boss) : s.dmg;
  const raw = (dmg / U) * w[0] + (s.heal / U) * w[1] + (s.taken / U) * w[2] + s.obj * 1.2 + (W.raid ? 0 : s.kills * 8 + s.assists * 3) + s.revives * 12;
  const up = clamp((b.aliveT || 0) / Math.max(1, W.t), 0, 1);
  return { raw: raw / (0.5 + 0.5 * up), s, up };
}
/** The hero's tier: its contribution against the middle of the AI of its role (all the AI when
 * there are few of the role) — S 1.3×, A 1.1×, B 0.75× and over, else C. */
const TIERS = { S: 1.3, A: 1.1, B: 0.75 };
function tierOf(W, rows) {
  const mine = rows.filter(x => x.b.team === 0), me = mine.find(x => x.b === W.hero);
  const peers = mine.filter(x => x.b !== W.hero && x.b.role === W.role);
  const pool = (peers.length >= 3 ? peers : mine.filter(x => x.b !== W.hero)).map(x => x.score).sort((a, b) => a - b);
  const mid = pool.length ? (pool[(pool.length - 1) >> 1] + pool[pool.length >> 1]) / 2 : 1;
  const k = me ? me.score / Math.max(1, mid) : 0;
  return { tier: k >= TIERS.S ? 'S' : k >= TIERS.A ? 'A' : k >= TIERS.B ? 'B' : 'C', k };
}
function board(W) {
  const rows = (W.raid ? W.bodies : W.bodies.filter(b => !b.troop && !b.cmdr)).concat([W.hero]).map(b => ({ b, ...scoreOf(W, b) }));
  const mean = {};
  for (const r of ['tank', 'healer', 'dps', 'support']) {
    const xs = rows.filter(x => x.b.role === r);
    mean[r] = xs.length ? Math.max(1, xs.reduce((a, x) => a + x.raw, 0) / xs.length) : 1;
  }
  const all = Math.max(1, rows.reduce((a, x) => a + x.raw, 0) / rows.length);
  for (const x of rows) x.score = Math.round(500 * x.raw / mean[x.b.role] + 500 * x.raw / all);
  rows.sort((a, b) => b.score - a.score);
  return rows;
}

function finish(W, win, why) {
  const G = A.G();
  if (W.over) return;
  W.over = true;
  W.win = win;
  W.why = why;
  if (W.cmds) { if (W.cmds.cur) cmdEnd(W, W.cmds); W.cmds.ask = null; cmdPanel(W); }
  const rows = board(W);
  const mine = rows.filter(x => x.b.team === 0);
  const rank = mine.findIndex(x => x.b === W.hero);
  const { tier, k: tierK } = tierOf(W, rows);
  const won = win === 0;
  const tierN = { S: 4, A: 3, B: 2, C: 1 }[tier];
  const shortK = W.def.short ? 0.6 : 1; // (백호 난투: three minutes, 0.6 of a war's pay)
  const mats = Math.max(1, Math.round((2 + (won ? 3 : 0) + tierN) * shortK));
  const gold = Math.round((1500 + (won ? 2500 : 0) + tierN * 700) * shortK);
  const pr = A.progress();
  pr.mats = pr.mats || {};
  // The 신수's 성물 only once its own raid has fallen (items.js SINSU_GATE: 바루나, 아그니,
  // 아이라바타): before, the war pays 겁화의 파편 instead, so the 사신수 waits for the 대격변's end.
  const gate = (A.SINSU_GATE[W.def.mat] || [])[0];
  const matId = !gate || (pr.raids || {})[gate] ? W.def.mat : 'kalpa';
  pr.mats[matId] = (pr.mats[matId] || 0) + mats;
  pr.gold = (pr.gold || 0) + gold;
  pr.war = pr.war || { played: 0, won: 0, best: {} };
  pr.war.played++;
  if (won) pr.war.won++;
  const bt = pr.war.best[W.def.id];
  if (!bt || 'SABC'.indexOf(tier) < 'SABC'.indexOf(bt)) pr.war.best[W.def.id] = tier;
  // 코디: a war won gives a costume (S and A tiers a rarer one).
  if (won) dropCostume(tierN >= 3 ? [1, 2] : [0, 1, 2], '대항전 승리');
  A.saveProgress();
  // 주간 규칙으로 이긴 판: 성물 +1 (league.js WAR_RULES).
  if (won && W.rule) { pr.mats[matId] = (pr.mats[matId] || 0) + 1; }
  W.result = { win, why, tier, tierK, mats: mats + (won && W.rule ? 1 : 0), matId, gold, rank: rank + 1, rows };
  W.result.league = leagueAfter(W, { win: won, tier, short: !!W.def.short });
  G.over = true;
  document.getElementById('levelup').hidden = true;
  G.choosing = false;
  A.audio().play(won ? 'levelup' : 'lose');
  A.say(`${W.def.name} ${won ? '승리' : '패배'}! ${why}`, won ? 'sys' : 'warn');
  setTimeout(() => showResult(W), 1400);
}

function rowHtml(W, x, i) {
  const s = x.s, me = x.b === W.hero, sp = specOf(W, x.b), T = sp && AI_TIERS[sp.tier];
  // Its 급 as a badge; the spec on hover (전투력, level, 승급, 단, way, gear).
  const tip = sp ? `${T.name} · 전투력 ${sp.cp.toLocaleString()} · Lv${sp.lv} · ${sp.promo}차 승급${sp.sl ? ` · 기술 ${sp.sl}단` : ''}${sp.play ? ` · ${sp.play}` : ''}${sp.gear ? ` · ${sp.gear}` : ''}` : '';
  const badge = sp ? `<span class="ai-tier" style="color:${T.col};font-weight:bold" title="${tip}">${T.short}</span>` : '';
  return `<tr class="t${x.b.team}${me ? ' me' : ''}"><td>${i + 1}</td><td title="${tip}" data-who="${me ? -1 : x.b.id}" style="cursor:pointer">${x.b.name}${x.b.rank ? `<b style="color:${RANK_COL[x.b.rank - 1]};text-shadow:0 0 2px #000" title="${W.raid ? '공격대' : '문파'} 전투력 ${x.b.rank}위">★${x.b.rank}</b>` : ''}${x.b.leader ? ' <small>(분대장)</small>' : ''}${x.b.alt ? ' <small>(부캐)</small>' : ''}</td><td>${badge}</td><td>${sp ? sp.cp.toLocaleString() : ''}</td><td>${sp ? sp.promo + '차' : ''}</td><td>${x.b.cls ? x.b.cls.name : ''}</td><td>${ROLES[x.b.role].name}</td>
    <td>${x.score}</td><td>${A.shownNum(s.dmg)}</td><td>${A.shownNum(s.heal)}</td><td>${A.shownNum(s.taken)}</td><td>${Math.round(s.obj)}</td><td>${Math.round(s.kills)}/${s.deaths}/${Math.round(s.assists)}</td><td>${s.revives}</td></tr>`;
}
function tables(W, rows) {
  const head = '<tr><th>#</th><th>이름</th><th>급</th><th>전투력</th><th>승급</th><th>직업</th><th>역할</th><th>기여</th><th>피해</th><th>회복</th><th>받은</th><th>목표</th><th>K/D/A</th><th>부활</th></tr>';
  return `<div class="wr-cols">${(W.raid ? [0] : teamsOf(W)).map(t => `<table><caption style="color:${W.teams[t].color}">${W.teams[t].name}${W.raid ? '' : ' 문파'}${W.over ? (W.win === t ? ' · 승리' : ' · 패배') : ''}</caption>${head}${rows.filter(x => x.b.team === t).map((x, i) => rowHtml(W, x, i)).join('')}</table>`).join('')}</div>`;
}

/** The hero as it stood in the war, in 연's layers and its own gear, for the result's spotlight. */
function heroShot(G) {
  const b = { cls: G.cls, gear: G.player.gear, fdx: 0, fdy: 1, walkT: 0, poseT: 0 };
  if (!drawFighterKey(b, 'idle')) return '';
  const e = frames.get(b.lastKey);
  if (!e) return '';
  const c = document.createElement('canvas');
  c.width = e.w;
  c.height = e.h;
  c.getContext('2d').drawImage(e.pic, e.sx, e.sy, e.w, e.h, 0, 0, e.w, e.h);
  try { return c.toDataURL(); } catch (err) { return ''; }
}
/** (사용자 2026-11-24: 레이드 결과 창의 캐릭터가 장비·코디 없는 모습) The result's figure as play draws the hero
 *  (game.js heroShotPic: its pieces, 코디, a weapon's dress), put in once made; the quick shot above until then. */
function heroLookShot(G, box) {
  if (!A.heroShotPic || !G.player) return;
  const gear = G.player.gear || {};
  A.heroShotPic(G.cls, gear).then(url => { const el = url && box.querySelector('.wr-hero'); if (el) el.src = url; });
}

function showResult(W) {
  const G = A.G();
  if (!G || G.war !== W) return;
  if (W.jaeng) return showJaengResult(W);
  const r = W.result, won = r.win === 0, box = document.getElementById('war-result');
  const art = img(won ? 'ui_attack_result_win' : 'ui_attack_result_lose');
  const mat = W.raid ? { name: '레이드주화' } : A.MATS[r.matId || W.def.mat];
  // 연's duel result: the word on a brush stroke, the hero in a spotlight, the rewards as medallions.
  const hud = n => (img(n) ? `assets/hud/${n}.png` : '');
  const medal = (label, value, icon) => `<div class="wr-medal">${hud('ui_icon_medal01') ? `<img class="wr-mbg" src="${hud('ui_icon_medal01')}" alt="">` : ''}
    ${icon ? `<img class="wr-mic" src="${icon}" alt="">` : ''}<b>${label}</b><span>${value}</span></div>`;
  const matIcon = W.raid ? '' : A.matPicture ? A.matPicture(r.matId || W.def.mat) : '';
  const tierLine = W.raid
    ? `레이드주화 ${10 * G.level + (G.stage.gwoe ? 30 : 0)} × 등급 (S 1.5 · A 1.25 · B 1 · C 0.7)${won ? '' : ' × 실패 0.3'} · 전 ${won ? 60 : 30}×${G.level}×등급`
    : `참여 2 + ${won ? '승리 3 + 주간 규칙 1 + ' : ''}등급 보너스 ${{ S: 4, A: 3, B: 2, C: 1 }[r.tier]}`;
  box.innerHTML = `<div class="wr-title" style="${hud('ui_ink_nine') ? `background-image:url(${hud('ui_ink_nine')})` : ''}">${W.raid ? (won ? '레이드 성공' : '레이드 실패') : won ? '승리' : '패배'}</div>
    <div class="wr-stage" style="${hud('ui_light02') ? `background-image:url(${hud('ui_light02')})` : ''}">
      <img class="wr-hero" src="${heroShot(G) || A.heroPicture(G.cls)}" alt="">
      ${art ? `<img class="wr-flag" src="${hud(won ? 'ui_attack_result_win' : 'ui_attack_result_lose')}" alt="">` : ''}</div>
    <div class="wr-sub">${W.def.name} · ${W.def.title} — ${r.why}<br>내 기여: ${W.raid ? '공격대' : '문파'} ${r.rank}위 · ${ROLES[W.role].name} · 등급 <b class="wr-tier">${r.tier}</b> <small>(같은 역할 중간의 ×${r.tierK.toFixed(2)}${W.afkT > 1 ? ` · 자리비움 ${Math.round(W.afkT)}초` : ''})</small></div>
    ${W.raid && r.tasks && r.tasks.n ? `<div class="wr-sub">역할 임무 <b>${r.tasks.ok}/${r.tasks.n}</b> 성공${(W.tasks.log || []).length ? ` <small>(${W.tasks.log.map(([k, ok]) => `${RAID_TASK_DEF[k].name} ${ok ? '○' : '×'}`).join(' · ')})</small>` : ''}</div>` : ''}
    ${!W.raid && W.cmds && W.cmds.log.length ? `<div class="wr-sub">지휘 선택 <b>${W.cmds.log.length}번</b> <small>(${W.cmds.log.map(c => `${WAR_COMMANDS[c.kind].name} ${c.gain >= 0 ? '+' : ''}${c.gain}`).join(' · ')})</small></div>` : ''}
    ${W.raid ? '' : momentsHtml(W) + leagueHtml(r.league)}
    <div class="wr-medals">${medal(mat.name, '+' + (W.raid ? r.coins : r.mats), matIcon)}${medal('전', '+' + r.gold.toLocaleString(), '')}${medal('등급', r.tier, '')}</div>
    <div class="wr-sub"><small>${tierLine} · 기여는 역할별로, 쓰러져 있던 시간은 절반만 뺍니다 (힐러·탱커도 1위가 될 수 있습니다)</small></div>
    ${tables(W, r.rows)}
    <div class="row" style="justify-content:center;display:flex;gap:8px"><button class="btn" id="wr-again">${W.raid ? '다시 도전' : '다시 출전'}</button><button class="btn" id="wr-town">마을로</button></div>`;
  heroLookShot(G, box);
  document.getElementById('wr-town').onclick = () => leaveWar(false);
  document.getElementById('wr-again').onclick = () => leaveWar(true);
  A.showScreen('war-result');
}

function leaveWar(again) {
  const G = A.G();
  const cls = G ? G.cls : A.chosenClass(), raid = G && G.war && G.war.raid ? G.stage : null;
  const btn = document.getElementById('war-sb-btn');
  if (btn) btn.hidden = true;
  document.getElementById('war-sb').hidden = true;
  const wc = document.getElementById('war-cmd');
  if (wc) wc.hidden = true;
  const tc = document.getElementById('war-tac');
  if (tc) tc.hidden = true;
  document.body.classList.remove('war', 'jaeng');
  const share = document.getElementById('jaeng-share');
  if (share) share.hidden = true;
  A.setG(null);
  if (raid && again) A.startRun(cls, raid);
  else if (again) openBoard();
  else A.enterTown(cls);
}

// 현황 overlay: 현황 (the score tables), 문파원 (each guild's members as cards) and a member's 상태창.
let sbTab = 'board', sbTeam = 0, sbWho = null;
function toggleBoard() {
  const G = A.G(), sb = document.getElementById('war-sb');
  if (!G || !G.war) return;
  if (!sb.hidden) { sb.hidden = true; return; }
  sbTab = 'board'; sbTeam = 0; sbWho = null;
  renderBoard();
  sb.hidden = false;
}
function renderBoard() {
  const G = A.G(), W = G && G.war, sb = document.getElementById('war-sb');
  if (!W) return;
  const mem = W.raid ? '공격대원' : '문파원';
  const tab = (id, label) => `<button class="sb-tab${sbTab === id ? ' on' : ''}" data-tab="${id}">${label}</button>`;
  let body;
  if (sbWho) body = statusHtml(W, sbWho);
  else if (sbTab === 'members') body = membersHtml(W);
  else body = tables(W, board(W));
  sb.innerHTML = `<div class="sb-head">${tab('board', '현황')}${tab('members', mem)}<b>${W.def.name}</b><button class="sb-x" data-x="1">닫기</button></div>${body}`;
  sb.querySelectorAll('[data-tab]').forEach(b => { b.onclick = e => { e.stopPropagation(); sbTab = b.dataset.tab; sbWho = null; renderBoard(); }; });
  sb.querySelectorAll('[data-team]').forEach(b => { b.onclick = e => { e.stopPropagation(); sbTeam = +b.dataset.team; renderBoard(); }; });
  sb.querySelectorAll('[data-who]').forEach(b => {
    b.onclick = e => { e.stopPropagation(); const id = +b.dataset.who; sbWho = id < 0 ? W.hero : W.bodies.find(x => x.id === id) || null; renderBoard(); };
  });
  sb.querySelectorAll('[data-back]').forEach(b => { b.onclick = e => { e.stopPropagation(); sbWho = null; renderBoard(); }; });
  const x = sb.querySelector('[data-x]');
  if (x) x.onclick = e => { e.stopPropagation(); sb.hidden = true; };
}
/** A member's picture: its first standing frame (the same picture the field draws), as a data URL. */
const portraits = new Map();
function portraitOf(W, b) {
  const H = A.M().yhero2 && A.M().yhero2[b.cls.id];
  if (!H) return '';
  const body = b.hero ? { cls: b.cls, gear: A.savedGear(b.cls) } : b;
  if (!body.yvKey) { body.yv2 = aiVariants(body.cls, body.gear || {}); if (!body.yv2) return ''; body.yvKey = body.cls.id + JSON.stringify(body.yv2); }
  if (portraits.has(body.yvKey)) return portraits.get(body.yvKey);
  const a = H.anims.idle_down || H.anims.walk_down;
  const c = a && composeFrame(H, body, a, 0, false, true);
  if (!c) return '';
  // (A kept frame may be an ImageBitmap: copied onto a canvas for its picture.)
  // (A kept frame is { pic, sx, sy, w, h }: its drawn box out of a canvas or bitmap.)
  const cv = document.createElement('canvas');
  const sw = c.w || c.width, sh = c.h || c.height;
  cv.width = sw; cv.height = sh;
  cv.getContext('2d').drawImage(c.pic || c, c.sx || 0, c.sy || 0, sw, sh, 0, 0, sw, sh);
  const url = cv.toDataURL();
  if (portraits.size > 200) portraits.clear();
  portraits.set(body.yvKey, url);
  return url;
}
function membersOf(W, team) {
  const list = (W.raid ? W.bodies : W.bodies.filter(b => b.team === team && !b.troop && !b.cmdr)).filter(b => b.cls);
  if (team === 0) list.push(W.hero);
  const cp = b => { const sp = specOf(W, b); return sp ? sp.cp : 0; };
  return list.sort((a, b) => (b.rank ? 6 - b.rank : 0) - (a.rank ? 6 - a.rank : 0) || cp(b) - cp(a));
}
function starHtml(W, b) {
  return b.rank ? `<b class="sb-star" style="color:${RANK_COL[b.rank - 1]}" title="${W.raid ? '공격대' : '문파'} 전투력 ${b.rank}위">★${b.rank}</b>` : '';
}
function membersHtml(W) {
  const teams = W.raid ? [0] : teamsOf(W);
  if (!teams.includes(sbTeam)) sbTeam = 0;
  const pick = teams.length > 1 ? `<div class="sb-teams">${teams.map(t => `<button data-team="${t}" class="${t === sbTeam ? 'on' : ''}" style="color:${W.teams[t].color}">${W.teams[t].name}${W.raid ? '' : ' 문파'}${t === 0 ? ' (우리)' : ''}</button>`).join('')}</div>` : '';
  const cards = membersOf(W, sbTeam).map(b => {
    const sp = specOf(W, b), T = sp && AI_TIERS[sp.tier], dead = b.hero ? A.G().dead : b.dead;
    const hp = b.hero ? A.G().player.hp / A.G().player.maxHp : b.hp / b.maxHp;
    const src = portraitOf(W, b);
    return `<div class="sb-card${b.hero ? ' me' : ''}${dead ? ' dead' : ''}" data-who="${b.hero ? -1 : b.id}">
      ${src ? `<img src="${src}">` : '<i></i>'}
      <div class="nm">${b.name}${starHtml(W, b)}</div>
      <div>${T ? `<span style="color:${T.col}">${T.short}</span> · ` : ''}${b.cls.name} · ${ROLES[b.role] ? ROLES[b.role].name : ''}</div>
      <div>Lv${sp ? sp.lv : '?'} · ${sp ? sp.promo : 0}차 · ${sp ? sp.cp.toLocaleString() : ''}</div>
      ${b.stars ? `<div title="${b.gearDesc}">무기 ★${b.stars.weapon} · 갑옷 ★${b.stars.armor}</div>` : ''}
      <div class="hp"><span style="width:${Math.round(clamp(hp, 0, 1) * 100)}%"></span></div>
      <div class="st">${dead ? '전사' : b.leader ? '분대장' : ''}</div>
    </div>`;
  }).join('');
  const make = W.makes && W.makes[sbTeam] ? `<div class="sb-tip">${W.raid ? '공격대' : '문파'} 구성: ${W.makes[sbTeam]}</div>` : '';
  return `${pick}${make}<div class="sb-cards">${cards}</div><div class="sb-tip">카드를 누르면 상태창이 열립니다.</div>`;
}
function statusHtml(W, b) {
  const G = A.G(), sp = specOf(W, b), T = sp && AI_TIERS[sp.tier], s = scoreOf(W, b).s || {};
  const hp = b.hero ? [G.player.hp, G.player.maxHp] : [b.hp, b.maxHp];
  const dead = b.hero ? G.dead : b.dead;
  const src = portraitOf(W, b);
  const rows = [
    ['등급', T ? `<span style="color:${T.col}">${T.name}</span>` : '-'],
    ['칭호', b.rank ? `${W.raid ? '공격대' : (W.teams[b.team] ? W.teams[b.team].name + ' 문파' : '문파')} 전투력 ${b.rank}위 ${starHtml(W, b)}` : '-'],
    ['직업', `${b.cls.name} · ${ROLES[b.role] ? ROLES[b.role].name : ''}${b.leader ? ' · 분대장' : ''}`],
    ['레벨', `Lv${sp ? sp.lv : '?'} · ${sp ? sp.promo : 0}차 승급${sp && sp.sl ? ` · 기술 ${sp.sl}단` : ''}`],
    ['전투력', sp ? sp.cp.toLocaleString() : '-'],
    ['체력', dead ? '<span style="color:#ff7a6a">전사</span>' : `${A.shownNum(Math.max(0, hp[0]))} / ${A.shownNum(hp[1])}`],
    ['성향', sp && sp.play ? sp.play : '-'],
    ['장비', sp && sp.gear ? sp.gear : '-'],
  ];
  const kit = (b.hero ? [] : b.skills || []).map(k => {
    const d = k.d || SKILLS[k.id] || {};
    const kind = { aoe: '광역', single: '단일', buff: '강화', shield: '보호' }[k.kind] || '';
    return `<span class="sk">${d.name || k.id}<small>${kind}</small></span>`;
  }).join('');
  const rec = `피해 ${A.shownNum(s.dmg || 0)} · 회복 ${A.shownNum(s.heal || 0)} · 받은 피해 ${A.shownNum(s.taken || 0)} · 처치/사망/도움 ${Math.round(s.kills || 0)}/${s.deaths || 0}/${Math.round(s.assists || 0)}`;
  return `<div class="sb-stat">
    <div class="pic">${src ? `<img src="${src}">` : ''}<div class="nm">${b.name}${starHtml(W, b)}</div></div>
    <div class="info"><table>${rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}</table>
      ${kit ? `<div class="kit"><b>쓰는 기술</b>${kit}</div>` : ''}
      <div class="rec"><b>이번 전투</b> ${rec}</div>
      <button data-back="1">← 목록</button></div>
  </div>`;
}

/**
 * Test (window.__wallCheck = { truth?: { <war>: walk rows } }): every update, every body's tile
 * (fighters, guards, commanders, the hero, its summons, the cart) against the walk grid (or a
 * given one), and each move of more than one tile checked along its line for a wall crossed.
 * Counts by kind and cause (the last mover: walk, swap, side, place; the hero's step or leap; a
 * pull) in __wallCheck.v; the first few in __wallCheck.log.
 */
function wallCheck(W) {
  const wc = window.__wallCheck, G = A.G(), m = W.map, truth = wc.truth && wc.truth[W.def.map || W.def.id];
  // (a 쪽문 is open to the gate's own side only; the standing gate to no one)
  const closed = (x, y, team = 0) => x < 0 || y < 0 || x >= m.cols || y >= m.rows || shutGate(W, x, y)
    || (W.postern && W.postern.has(y * m.cols + x) ? team !== W.gate.team : (truth ? truth[y][x] !== '.' : !m.walk[y * m.cols + x]));
  const v = wc.v = wc.v || {};
  wc.frames = (wc.frames || 0) + 1;
  const p = G.player;
  const look = (b, kind, x, y, cause) => {
    wc.samples = (wc.samples || 0) + 1;
    const prev = b.__wc;
    b.__wc = [x, y];
    const grid = truth && x >= 0 && y >= 0 && x < m.cols && y < m.rows && m.walk[y * m.cols + x] ? 'grid:' : '';
    const add = what => {
      const k = kind + ' ' + what;
      // Frames on a closed tile (wc.f), and the times one came onto one (v).
      wc.f = (wc.f || 0) + 1;
      const at = what[0] + x + ',' + y;
      if (b.__wcBad === at) return;
      b.__wcBad = at;
      v[k] = (v[k] || 0) + 1;
      if ((wc.log = wc.log || []).length < 40) wc.log.push([W.def.id, Math.round(W.t * 10) / 10, k, b.name, x, y, prev]);
    };
    if (closed(x, y, b.team)) add('on:' + grid + cause);
    else b.__wcBad = null;
    // (A body set down at its camp or by a revive is not carried through what lies between.)
    if (prev && cause !== 'place' && Math.abs(prev[0] - x) + Math.abs(prev[1] - y) > 1) {
      const n = Math.max(Math.abs(prev[0] - x), Math.abs(prev[1] - y)) * 3;
      for (let i = 1; i < n; i++) {
        const cx = Math.round(prev[0] + (x - prev[0]) * i / n), cy = Math.round(prev[1] + (y - prev[1]) * i / n);
        if (closed(cx, cy, b.team) && !(b.team === (W.gate && W.gate.team) && W.postern && W.postern.has(cy * m.cols + cx) && cause === 'walk')) { add('cross:' + cause); break; }
      }
    }
  };
  for (const b of W.bodies) if (b.dead) b.__wc = null; else look(b, b.cmdr ? 'cmdr' : b.troop ? 'troop' : 'fighter', b.tx, b.ty, b.mvX === b.tx && b.mvY === b.ty ? b.mv : 'pull');
  if (!G.dead) look(W.hero, 'hero', p.tx, p.ty, p.slide && G.t - p.slide.t < 0.3 ? 'leap' : 'step');
  else W.hero.__wc = null;
  for (const a of G.allies) look(a, 'summon', a.tx, a.ty, 'summon');
  if (W.cart) look(W.cart, 'cart', W.cart.tx, W.cart.ty, 'cart');
}

function warState() {
  const G = A.G();
  if (!G || !G.war) return null;
  const W = G.war;
  if (W.jaeng) {
    const b = W.boss, all = W.bossMax || 1;
    return {
      id: W.def.id, mode: 'bosspk', t: W.t, gt: G.t, left: W.left, over: W.over, win: W.win, why: W.why, role: W.role, phase: W.jphase, raid: W.raidId,
      score: W.score.map(x => Math.round(x)), pts: W.pts.map(q => Object.fromEntries(Object.entries(q).map(([k, v]) => [k, Math.round(v)]))),
      share: W.bossDmg.map(x => Math.round(x / all * 1000) / 10), boss: b ? { hp: Math.round(hpk(b) * 1000) / 10, phase: G.phase, enraged: !!G.enraged } : null,
      bossDead: !!W.bossDead, fled: !!W.bossFled, killT: W.killT, last: W.lastTeam, seals: W.seals.map(s => s.owner), rank: W.rank, comeback: W.comeback.slice(),
      alive: W.alive ? W.alive.map(a => a.length) : null, mobs: W.mobs ? W.mobs.length : 0, kills: W.teams.map(t => t.kills), dead: W.bodies.filter(x => x.dead).length,
      hero: { ...W.hero.stats, role: W.role, dead: G.dead, afk: W.afkT || 0 }, aggro: G.aggro ? (G.aggro === G.player ? 'hero' : G.aggro.team + ':' + G.aggro.role) : null,
      orders: W.teams.map(t => t.squads.map(q => q.order && (q.order.kind + (q.order.team !== undefined ? q.order.team : '')))),
      result: W.result && { tier: W.result.tier, k: W.result.tierK, rank: W.result.rank, place: W.result.place, rewards: W.result.rewards },
      bodies: W.bodies.length, diag: W.diag, stat: W.stat, sup: W.sup, week: W.week,
    };
  }
  if (W.raid) {
    const b = W.boss;
    return {
      id: W.def.id, mode: 'raid', t: W.t, gt: G.t, left: W.left, over: W.over, win: W.win, why: W.why, role: W.role,
      boss: b ? { hp: Math.round(hpk(b) * 1000) / 10, phase: G.phase, enraged: !!G.enraged } : null, cleared: !!G.cleared,
      alive: W.alive ? W.alive.map(a => a.length) : null, dead: W.bodies.filter(x => x.dead).length, adds: W.alive ? W.alive[1].length - (b ? 1 : 0) : 0,
      hero: { ...W.hero.stats, dead: G.dead, up: W.hero.aliveT / Math.max(1, W.t), afk: W.afkT || 0 }, stat: { ...W.stat }, U: W.U, Uh: W.Uh,
      heroRate: W.rawAll ? W.rawAll / Math.max(1, W.t) / W.Uh : 0, aggro: G.aggro ? (G.aggro === G.player ? 'hero' : G.aggro.role + ':' + G.aggro.name) : null,
      result: W.result && { tier: W.result.tier, k: W.result.tierK, coins: W.result.coins, gold: W.result.gold, rank: W.result.rank },
      bodies: W.bodies.length, sup: W.sup, shield: W.shield ? Math.round(W.shield.hp / W.shield.max * 100) : null,
      tasks: W.tasks ? { ok: W.tasks.ok, fail: W.tasks.fail, log: W.tasks.log, cur: W.tasks.cur && { kind: W.tasks.cur.kind, left: Math.round((W.tasks.cur.until - G.t) * 10) / 10, prog: W.tasks.cur.prog,
        at: W.tasks.cur.at || null, on: W.tasks.cur.on ? [W.tasks.cur.on.tx, W.tasks.cur.on.ty] : null,
        list: W.tasks.cur.list.filter(m => (m.curseMark || m.hp > 0)).map(m => [m.tx, m.ty]) } } : null,
    };
  }
  return {
    id: W.def.id, mode: W.mode, t: W.t, left: W.left, score: W.score.slice(), over: W.over, win: W.win, why: W.why, round: W.round,
    flags: W.flags && W.flags.map(f => f.owner), cart: W.cart && { i: W.cart.i, best: W.cart.best.slice(), len: W.path.length, attacker: W.attacker },
    gate: W.gate && { hp: Math.round(W.gate.hp / W.gate.maxHp * 100), down: W.gateDown },
    cmd: W.teams.map(t => Math.round(hpk(t.cmd) * 100)), alive: W.alive ? W.alive.map(a => a.length) : null,
    kills: W.teams.map(t => t.kills), hero: { ...W.hero.stats, role: W.role, dead: G.dead, afk: W.afkT || 0 }, result: W.result && { tier: W.result.tier, mats: W.result.mats, gold: W.result.gold, rank: W.result.rank },
    bodies: W.bodies.length, dead: W.bodies.filter(b => b.dead).length, diag: W.diag, sup: W.sup, hlvl: G.player.lvl, startLvl: W.startLvl, tier: W.tier, foeK: W.foeK,
    cmds: W.cmds ? { log: W.cmds.log, cur: W.cmds.cur && W.cmds.cur.kind, ask: !!W.cmds.ask } : null,
  };
}

// ---------------------------------------------------------------- 레이드: a raid of twenty-five
// A raid is fought on the war's framework: the hero and twenty-four raiders of every class (the
// player's own other grown classes among them) against the raid's boss and its servants, which
// stay game.js's monsters (its phases, lines, red tiles, waves, enrage and spoils as before). The
// same fighters, roles, squads, kept frames, contribution, ink countdown and spotlight result as
// the guild war. The raid stands in an arena on the raid's own floor; the camp, where the fallen
// get up, is at its south end and the boss's lair at its north.

// heroK: the hero's blows a second, in its own measure, before they are scaled down (an AI
// raider deals about 2.8 of its blows a second while it fights: a hero at the raid's own level
// and gear deals about three or four raiders' worth — an eighth of the raid's blows, the
// difference between beating the boss's rage and not; what it counts for in the contribution is
// capped apart, see heroCap). hurtLo/Hi: the boss's blows on
// a raider (see raidHurt). cut: how often a raider with a hold cuts the boss's blast.
// heroU: (2026-11-28) the hero's blows a second in the raid's unit at its own strength (W.heroPw: its 전투력 against the
// raid's, as every raider's) — an AI raider of pw 1 deals about 2.9, so a hero that fights is worth about three raiders
// of its own 전투력: a hero of 5천 on 선계 a third of one, one of 7.7만 there four. (It was heroK × the hero's own unit —
// about ten raiders' worth whatever the hero's 전투력 against the raid's.)
const RAID = { cols: 64, rows: 46, camp: [32, 37], lair: [32, 16], heroU: 8.0, hurtLo: 1.3, hurtHi: 1.35, cut: 0.25 };
/** The hero's blows a second in a raid (its unit at its 전투력, see RAID.heroU). */
const raidHeroRate = W => W.U * RAID.heroU * (W.heroPw || 1);
/** How many times the hero gets up in a raid of this rung (멧돼지왕 2 … 아이라바타 18). */
/**
 * The raid role of a class (settings.raidRoles, by class). One choice for every class (settings.raidRole) carried a 전사's
 * 탱커 over to the 무사 and the 차사 that never chose it: a light tank at the boss, down at once, the raid after it
 * (엔드게임 점검 2026-11-28). The old single choice still counts for a class whose own roles hold it.
 */
function raidRoleOf(cls) {
  const set = A.settings(), own = set.raidRoles && set.raidRoles[cls.id];
  if (ROLES[own]) return own;
  if (ROLES[set.raidRole] && rolesFor(cls).includes(set.raidRole) && (set.raidRole !== 'tank' || cls.id === 'warrior')) return set.raidRole;
  return cls.id === 'poet' ? 'healer' : cls.id === 'warrior' ? 'tank' : 'dps';
}
export function raidRevives(level) {
  return level <= 7 ? 5 : level <= 13 ? 4 : 3;
}
// Red-floor tiles by a number key (tiles of a raid can lie a little outside the arena).
const dk = (x, y) => (x + 1000) * 10000 + (y + 1000);

function raidSetup() {
  const G = A.G(), st = G.stage, p = G.player, set = A.settings();
  const roles = rolesFor(G.cls);
  const role = raidRoleOf(G.cls);
  const { cols, rows } = RAID;
  const W = G.war = {
    raid: true, def: { id: st.id, name: st.name, title: st.title || '레이드' }, mode: 'raid', role, side: 'atk', t: 0, left: A.RAID_LIMIT, over: false,
    score: [0, 0], feed: [], ghosts: [], crates: [], zones: [], bodies: [], squads: [], nextId: 1, flow: new Map(), sndT: 0, shoutT: 0, fxN: 0,
    round: 1, gateDown: false, heroDmgK: 1, roleK: 1, thinkIdx: 0, lastCmd: [0, 0], cmdSaid: -99, events: [], danger: new Map(), dangerSig: '',
    calls: {}, stat: { markHits: 0, dodges: 0, cuts: 0, heroCuts: 0, deaths: 0, revives: 0 }, fit: 0,
    map: { cols, rows, w: cols * TILE, h: rows * TILE, chunk: 1024, walk: new Uint8Array(cols * rows).fill(1) },
  };
  W.countdown = 4;
  // The hero's revives: five in the first raids, four in the middle ones, three in the hardest
  // (아그니, 아이라바타 …). Before, it got up as often as it fell.
  W.revivesLeft = W.reviveMax = raidRevives(G.level);
  W.camp = RAID.camp.slice();
  W.lair = RAID.lair.slice();
  // 격 that suit the role, and the role's own bonus, as in the war.
  const fit = (p.gyeoks || []).filter(g => gyeokRoles(g).has(role)).length;
  W.roleK = 1 + 0.08 * Math.min(3, fit);
  W.fit = fit;
  if (role === 'tank') { p.maxHp = Math.round(p.maxHp * 1.35 * W.roleK); p.hp = p.maxHp; }
  if (role === 'dps') W.heroDmgK = 1.15 * W.roleK;
  // The hero's own measure (its blow at its level and gear), and the raid's: the crowd is as
  // strong as the raid asks, so a hero under the raid's power is a small part of it, a strong
  // one a big part (its blows past about two raiders' worth are scaled down).
  W.startLvl = p.lvl;
  W.Uh = (6 + 1.2 * p.lvl) * Math.sqrt(Math.max(1, p.gearPower || 1));
  const lvRec = W.lvRec = clamp(Math.round(12 + 1.4 * G.level), 14, 33);
  W.U = (6 + 1.2 * lvRec) * Math.sqrt(1 + 0.12 * Math.max(0, A.raidPow(st.id) - 2));
  W.refHp = W.U * 22;
  // The raid's rung as a 전투력 (RAID_CP): every raider's strength and the hero's are taken against it (applyPersonas).
  W.raidCp = RAID_CP(G.level);
  W.teams = [
    { id: 0, name: '공격대', color: '#7cf08a', cmd: null, squads: [], spawn: W.camp.slice(), kills: 0, troops: [] },
    { id: 1, name: (G.boss && G.boss.name) || (st.boss && st.boss.name) || '보스', color: '#ff7a6a', cmd: null, squads: [], spawn: W.lair.slice(), kills: 0, troops: [] }, // (신 용궁 탑: the floor's guardian first)
  ];
  W.hero = {
    id: 0, hero: true, team: 0, name: `${G.cls.name}(나)`, role, cls: G.cls, tx: 0, ty: 0, x: 0, y: 0, hp: 1, maxHp: 1, dead: false,
    stats: blankStats(), hitBy: new Map(), m: { h: 46 }, scale: 1, aliveT: 0,
  };
  heroTo(...W.camp);
  // Five parties of five, as a 연 raid is gathered (the hero's party has four besides it).
  for (let s = 0; s < squadsOf('raid'); s++) {
    const sq = { id: s, team: 0, name: `${s + 1}파티`, members: [], leader: null, order: null, target: null, said: -9, focusT: 0 };
    W.squads.push(sq);
    W.teams[0].squads.push(sq);
    // Five tanks and five healers whatever the hero is: the hero takes a 딜러's place, so a
    // hero 힐러 is a sixth healer, not the raid's only fifth.
    const plan = ['tank', 'healer', 'dps', 'dps', s % 2 ? 'support' : 'dps'];
    if (s === 0) plan.splice(plan.lastIndexOf('dps'), 1);
    for (const r of plan) sq.members.push(mkFighter(W, 0, r, sq));
    sq.leader = sq.members.find(m => m.role === 'tank') || sq.members[0];
    sq.leader.leader = true;
  }
  W.squads[0].members.push(W.hero);
  W.hero.squad = W.squads[0];
  // The boss's life by the raid's size (the hero counts about three raiders: RAID.heroU).
  W.crowdK = (W.bodies.length + 2.8) / (24 + 2.8);
  // The player's own other grown classes come along, by their names and gear, among the crowd.
  const best = A.best();
  const alts = A.CLASSES.filter(c => c.id !== G.cls.id && best[c.id] && best[c.id].lvl >= 8).sort(() => Math.random() - 0.5).slice(0, 4);
  const altNames = [];
  for (const c of alts) {
    const fits = rolesFor(c);
    const f = W.bodies.find(b => !b.alt && b.cls.id !== c.id && fits.includes(b.role) && !b.leader);
    if (!f) continue;
    const lv = best[c.id].lvl;
    f.cls = c; f.kit = kitFor(c); f.gear = A.savedGear(c); f.yvKey = null; f.speed = c.speed || 70; f.alt = true;
    f.name = A.altName(c); f.lv = lv; f.pw = 0.9 + 0.22 * Math.min(1, lv / 36);
    f.party = partyKit(c, lv);
    f.maxHp = f.hp = W.refHp * fighterHpK(f.role, c) * f.pw;
    altNames.push(`${f.name}(${c.name})`);
  }
  applyPersonas(W);
  W.leaderBody = W.squads[1].leader;
  for (const b of W.bodies) {
    placeBody(W, b, W.camp);
    G.party.push(b);
  }
  W.alive = [W.bodies.slice(), []];
  raidOrders(W, true);
  A.say(`[${st.name}] 공격대 25명이 모였습니다. 역할: ${ROLES[role].name}`, 'sys');
  if (altNames.length) A.say(`내 다른 직업도 함께합니다: ${altNames.join(', ')}`, 'party');
  if (fit) A.say(`역할에 맞는 격 ${fit}개: ${ROLES[role].name} 효과 +${Math.round((W.roleK - 1) * 100)}%`, 'sys');
  // Spells keep to their reach: a caster fighting the adds at the edge never touches the boss.
  if (['mage', 'poet', 'magus', 'celestial'].includes(G.cls.id)) A.say('마법은 사거리 안에만 닿습니다. 보스 가까이(4~5칸)에서 싸우세요.', 'sys');
  const btn = document.getElementById('war-sb-btn');
  if (btn) btn.hidden = false;
  document.body.classList.add('war');
  warmLooks(W);
}

function updateRaid(dt) {
  const G = A.G(), W = G.war;
  W.t += dt;
  W.left = A.RAID_LIMIT - G.t;
  const p = G.player, h = W.hero;
  h.tx = p.tx; h.ty = p.ty; h.x = p.x; h.y = p.y; h.hp = p.hp; h.maxHp = p.maxHp; h.dead = G.dead;
  W.boss = null;
  W.alive = [[], []];
  for (const e of G.enemies) {
    if (!(e.hp > 0)) continue;
    W.alive[1].push(e);
    if (e.kind === 'boss') W.boss = e;
  }
  if (W.boss) W.teams[1].spawn = [W.boss.tx, W.boss.ty];
  if (G.cleared && !W.killT) W.killT = G.t;
  for (const b of W.bodies) if (!b.dead) W.alive[0].push(b);
  if (!h.dead) W.alive[0].push(h);
  dangerMap(W, G);
  for (const b of W.bodies) {
    if (b.dead) {
      if (G.t >= b.respawnAt && b.respawnAt > 0) respawn(W, b);
      continue;
    }
    b.aliveT += dt;
    tickBody(W, b, dt);
  }
  if (!G.dead) h.aliveT += dt;
  if (!G.dead && W.boss && !W.boss.dying) W.capInt = (W.capInt || 0) + dt; // 직업 효율 (raidEff): the seconds of the boss fight
  if (afk()) W.afkT = (W.afkT || 0) + dt;
  // 공대: the time the hero was in the fight (moved in the last three seconds, or by the boss,
  // where its spells reach), for its tier. Standing back at the camp is not.
  const pl = G.player, bs = W.boss;
  if (!G.dead && (G.t - (W.movedT || 0) < 3 || (bs && !bs.dying && Math.hypot(bs.tx - pl.tx, bs.ty - pl.ty) <= 7))) W.activeT = (W.activeT || 0) + dt;
  heroRole(W, dt);
  if (G.dead && W.heroBack && G.t >= W.heroBack) heroUp(W);
  W.cmdT = (W.cmdT || 0) - dt;
  if (W.cmdT <= 0) {
    W.cmdT = 1;
    raidOrders(W);
    heroLead(W);
  }
  raidCalls(W, dt);
  raidTasks(W, dt);
  raidBanter(W);
  W.ghosts = W.ghosts.filter(g => !g.b.dead ? false : G.t < g.until);
  W.feed = W.feed.filter(f => G.t - f.t < 6);
  if (G.texts.length > 40) G.texts.splice(0, G.texts.length - 40);
  if (G.fxs.length > 45) G.fxs.splice(0, G.fxs.length - 45);
  if (window.__dbgWar && window.__dbgWar.notext) G.texts.length = 0;
  if (window.__dbgWar && window.__dbgWar.nofx) G.fxs.length = 0;
  // Everyone down at once while the boss stands: the raid is wiped.
  if (W.boss && !W.alive[0].length) {
    W.wipeT = (W.wipeT || 0) + dt;
    if (W.wipeT > 2 && !G.over) { W.wiped = true; A.say('공격대가 전멸했습니다…', 'warn'); A.raidFail(`${W.def.name} 실패 · 전멸`); }
  } else W.wipeT = 0;
}

/** The boss's red tiles as a lookup, rebuilt when they change. */
function dangerMap(W, G) {
  const last = G.marks.length ? G.marks[G.marks.length - 1] : null;
  const sig = G.marks.length + ':' + (last ? last.made : 0) + ':' + G.marks.filter(m => m.done).length;
  if (sig === W.dangerSig) return;
  W.dangerSig = sig;
  W.danger.clear();
  for (const mk of G.marks) {
    if (mk.done) continue;
    for (const [x, y] of mk.tiles) { const k = dk(x, y); if (!W.danger.has(k)) W.danger.set(k, mk); }
  }
}

/** How close a fighter must stand to strike: a big boss can be struck from two tiles. */
function reachOf(b, t) {
  if (b.kit.range > 1) return b.kit.range + (t.kind === 'boss' ? 0.5 : 0);
  return t.kind === 'boss' ? 1.3 + 0.6 * (t.baseScale || t.scale || 1) : 1.5;
}

/** The nearest tile off the red floor (a melee fighter keeps within reach of its foe if it can). */
function safeNear(W, b) {
  const t = b.target && alive(b.target) ? b.target : null, reach = t ? reachOf(b, t) : 0;
  for (let r = 1; r <= 6; r++) {
    let best = null, bs = 1e9;
    for (let dx = -r; dx <= r; dx++)
      for (let dy = -r; dy <= r; dy++) {
        if (Math.abs(dx) + Math.abs(dy) !== r) continue;
        const x = b.tx + dx, y = b.ty + dy;
        if (!open(W, x, y) || W.danger.has(dk(x, y)) || !A.free(x, y)) continue;
        const s = t ? Math.abs(Math.hypot(x - t.tx, y - t.ty) - reach * 0.8) : 0;
        if (s < bs) { bs = s; best = [x, y]; }
      }
    if (best) return best;
  }
  return null;
}

/**
 * The red floor under a raider: it steps off — once it has seen it (a quarter to half a second),
 * and only if it reads this one right (its own knack, half to nine in ten). Busy dodging, it
 * still strikes what is in reach.
 */
function dodge(W, b) {
  const G = A.G();
  if (!W.danger.size) return false;
  const mk = W.danger.get(dk(b.tx, b.ty));
  if (!mk) return false;
  if (G.t - mk.made < b.react) return false;
  if (b.dodgeFor !== mk) {
    b.dodgeFor = mk;
    b.dodgeOk = Math.random() < b.dodge;
    if (b.dodgeOk) W.stat.dodges++;
  }
  if (!b.dodgeOk) return false;
  const spot = safeNear(W, b);
  if (spot) b.dest = spot;
  const t = b.target;
  if (t && alive(t) && b.role !== 'healer' && d2(b, t) <= reachOf(b, t) + 0.5) act(W, b, t);
  if (Math.random() < 0.04) talk(W, b, ['바닥 피해요!', '빨간 데 빠져!', '으악 바닥!', '장판 장판!']);
  return true;
}

function thinkRaid(W, b) {
  const G = A.G(), sq = b.squad, boss = W.boss;
  const order = myOrder(W, b);
  if (dodge(W, b)) return;
  // A task's own step (to the soak, off the hero's bomb): taken, striking what is in reach.
  if (b.taskGo && b.taskGo.until > G.t) {
    b.dest = Math.abs(b.taskGo.at[0] - b.tx) + Math.abs(b.taskGo.at[1] - b.ty) ? b.taskGo.at : null;
    const t = b.target;
    if (t && alive(t) && b.role !== 'healer' && d2(b, t) <= reachOf(b, t) + 0.5) act(W, b, t);
    return;
  }
  const k = hpk(b);
  // Low: back to the healers (to the camp when none is near); in again once mended.
  if (b.state !== 'retreat' && b.role !== 'healer' && k < retreatAt(b, 0.18, 0.28)) {
    b.state = 'retreat';
    if (Math.random() < 0.4) talk(W, b, ['피 없어요 빠질게요!', '힐 좀요!!', '잠깐 빠짐', '저 죽어요!']);
  }
  if (b.state === 'retreat') {
    if (k > 0.65) b.state = 'go';
    else {
      let healer = null, hd = 14;
      for (const m of W.alive[0]) if (m.role === 'healer' && m !== b && !m.hero && d2(m, b) < hd) { hd = d2(m, b); healer = m; }
      b.dest = healer ? snap(W, healer.tx + (healer.tx - (boss ? boss.tx : healer.tx) > 0 ? 1 : -1), healer.ty + 1) : W.camp;
      const t = nearest(W, b, b.kit.range + 0.5);
      if (t) act(W, b, t);
      return;
    }
  }
  if (b.role === 'healer') return thinkHealerRaid(W, b, order);
  if (b.role === 'support') supportBuffs(W, b);
  let t = null;
  // Tanks hold the boss: when it turns from the tanks one of them pulls it back.
  if (b.role === 'tank' && boss && order.kind !== 'adds') {
    const ag = G.aggro;
    const held = ag && (ag === G.player ? W.role === 'tank' && !G.dead : !ag.down && ag.role === 'tank');
    // (Not while the hero tank's task is to take it back from a healer: that is the hero's.)
    const heroJob = W.tasks && W.tasks.cur && W.tasks.cur.kind === 'hold';
    if (!held && !heroJob && b.cd.c <= 0 && d2(b, boss) < 6) raidTaunt(W, b);
    t = boss;
  }
  if (!t && order.kind === 'adds') {
    let best = null, bd = 1e9;
    for (const e of W.alive[1]) {
      if (e.kind === 'boss') continue;
      const d = Math.hypot(e.tx - order.x, e.ty - order.y) * 0.6 + d2(b, e);
      if (d < bd) { bd = d; best = e; }
    }
    t = best;
  }
  if (!t && b.target && b.target.kind !== 'boss' && alive(b.target) && d2(b, b.target) < 3) t = b.target;
  if (!t && boss && order.kind === 'assault') {
    // A servant biting at it is swatted first; the boss otherwise.
    const close = nearest(W, b, 1.5);
    t = close && close !== boss && Math.random() < 0.7 ? close : boss;
  }
  if (!t) t = nearest(W, b, 8);
  b.target = t;
  if (!t) { b.dest = formation(W, b, order); return; }
  const dist = d2(b, t), reach = reachOf(b, t);
  if (b.kit.range > 1) {
    // Casters keep off the boss's swing and away from a blade that comes close.
    if (dist < (t.kind === 'boss' ? 2.8 : 2)) {
      const ax = Math.sign(b.tx - t.tx) || pick([-1, 1]), ay = Math.sign(b.ty - t.ty) || pick([-1, 1]);
      b.dest = snap(W, b.tx + ax * 3, b.ty + ay * 2);
    } else if (dist > reach) b.dest = snap(W, t.tx + Math.round((b.tx - t.tx) / dist * (reach - 1)), t.ty + Math.round((b.ty - t.ty) / dist * (reach - 1)));
    else b.dest = null;
  } else if (dist > reach) b.dest = bladeDest(W, b, t, reach);
  else b.dest = null;
  if (dist <= reach + 0.5) act(W, b, t);
}

function raidTaunt(W, b) {
  const G = A.G();
  b.cd.c = b.aggro ? 6.5 : 10;
  W.taunted = { by: b, until: G.t + 6 };
  G.aggro = b;
  shout(W, b, pick(['도발', '이리 와라', '어그로']));
  tauntFx(b);
  credit(b, 'obj', 4);
  if (Math.random() < 0.3) talk(W, b, ['어그로 잡았어요!', '보스 제가 잡아요!', '탱 갑니다!']);
}

/** Whom the boss turns on (every six seconds, game.js): a taunt holds; else the tanks mostly. */
function raidAggro() {
  const G = A.G(), W = G.war;
  if (W.jaeng) return bossAggro(W);
  if (W.taunted && W.taunted.until > G.t) {
    const by = W.taunted.by;
    if (by.hero ? !G.dead : alive(by)) return by.hero ? G.player : by;
  }
  const pool = [];
  for (const m of W.alive[0]) {
    if (m.hero) continue;
    for (let i = 0; i < (m.role === 'tank' ? 6 : 1); i++) pool.push(m);
  }
  if (!G.dead && !(G.buffs.stealth > G.t)) for (let i = 0; i < (W.role === 'tank' ? 6 : 1); i++) pool.push(G.player);
  return pool.length ? pick(pool) : null;
}

/** An AI raider's blow on a monster: it takes it as from a companion (not with the hero's might). */
function raidHit(W, src, t, dmg) {
  const before = t.hp;
  if (W.jaeng) {
    // 「쟁」: whose blow it was (the last blow's guild), the boss's share by guild.
    t.lastTeam = src.team;
    t.lastHero = false;
    if (t.kind === 'boss') dmg *= jaengBossK(W, src.team);
  }
  if (W.raid) {
    // A task's foe is the hero's to break: the raiders chip at a totem or the 광전사.
    if (t.totem || t.berserk) dmg *= 0.2;
    if (t.kind === 'boss') dmg = raidGuarded(W, dmg, 0.25);
    // 자리비움: a raid whose hero is away (its spells still firing by themselves) is a raid short of its leader's part —
    // the raiders' blows on the boss at half. With the hero now worth about three raiders of its 전투력 (RAID.heroU), the
    // raiders alone took 바루나 at 4:52 while the hero stood idle (balance runs); the raid stays the player's to win.
    if (t.kind === 'boss' && afk()) dmg *= 0.5;
  }
  if (!(dmg > 0)) return;
  const n = A.strike(t, dmg, onScreen(t));
  if (!(n > 0)) return;
  credit(src, 'dmg', n);
  if (t.kind === 'boss') credit(src, 'boss', n);
  if (W.jaeng && t.kind === 'boss') bossShare(W, src, src.team, n);
  if (before > 0 && t.hp <= 0) credit(src, t.kind === 'boss' ? 'obj' : 'kills', t.kind === 'boss' ? 30 : 1);
}

/** A raider struck by the boss or a servant (game.js's hurtMember): its share of life. */
function raidHurt(m, dmg, from) {
  const W = A.G().war;
  if (!W || m.dead) return;
  // The boss's own blows (its swing, bolts, blasts, red tiles) come in shares of the raider's life
  // already weighed by the raid's rung (raidK); a raid of twenty-five with five healers takes
  // them 1.6 times (the first raid) to 2 times (화령 and up) as hard as the old party did.
  // (A raider under the raid's rung takes its blows harder, one over it less: RAID_CP — the boss's blows came as the
  // same share of every raider's life, so a raid of 선계 was as safe as one of 멧돼지왕.)
  const boss = !from || from.kind === 'boss';
  hit(W, from || { name: W.teams[1].name }, m, dmg * (boss ? raidHurtK() * clamp(Math.pow(m.pw || 1, -0.8), 0.6, 1.8) : 1));
}
/** The boss's blows on the hero, as on a raider of its 전투력 (the hero's own life, its 전투력 against the raid's). */
function raidHeroHurtK() {
  const W = A.G().war;
  return 0.75 * raidHurtK() * clamp(Math.pow(W.heroPw || 1, -0.8), 0.6, 2.2);
}
function raidHurtK() {
  const k = A.raidK();
  return (RAID.hurtLo + (RAID.hurtHi - RAID.hurtLo) * clamp((k - 0.58) / 0.42, 0, 1)) / k;
}

/** The hero's blows in a raid: past about two raiders' worth a second they are scaled down. */
/**
 * The boss's guard against a blow (its tasks): the totems standing — 30% gets through; its shield —
 * the blow goes into it (the raiders' at `ai` of their weight); the shield broken — +30% a while.
 */
function raidGuarded(W, dmg, ai = 1) {
  const G = A.G();
  if (W.tasks && W.tasks.cur && W.tasks.cur.kind === 'totem' && W.tasks.cur.list.some(e => e.hp > 0)) dmg *= 0.6;
  const sh = W.shield;
  if (sh && sh.hp > 0) {
    const take = Math.min(sh.hp, dmg * ai);
    sh.hp -= take;
    return 0;
  }
  if (W.exposed > G.t) dmg *= 1.3;
  return dmg;
}
function raidScale(dmg, e = null) {
  const G = A.G(), W = G.war;
  if (!(dmg > 0)) return dmg;
  if (e && e.kind === 'boss') {
    dmg = raidGuarded(W, raidScaleRaw(dmg, true));
    W.heroBoss = (W.heroBoss || 0) + dmg; // (the hero's blows on the boss as they land, for the balance runs)
    return dmg;
  }
  return raidScaleRaw(dmg);
}
function raidScaleRaw(dmg, onBoss = false) {
  const G = A.G(), W = G.war;
  // 자리비움: a hero away from the controls (its spells still fire by themselves) barely scratches
  // the boss, so the raid is the player's to win: the raiders alone run out of time. At 0.15 an
  // idle 전사 (tough, its swings landing whenever the boss walked up) still won 멧돼지왕 at 7:13.
  if (afk()) dmg *= 0.05;
  const win = W.rawWin || (W.rawWin = []);
  win.push([G.t, dmg]);
  W.rawSum = (W.rawSum || 0) + dmg;
  W.rawAll = (W.rawAll || 0) + dmg;
  if (onBoss) W.rawBoss = (W.rawBoss || 0) + dmg;
  while (win.length && G.t - win[0][0] > 8) W.rawSum -= win.shift()[1];
  const span = Math.max(3, Math.min(8, G.t - win[0][0]));
  const rate = W.rawSum / span;
  const target = raidHeroRate(W) * (1 + 0.03 * Math.max(0, G.player.lvl - W.startLvl)) * (W.role === 'dps' ? W.heroDmgK : 1) * raidEff(W);
  if (rate > target) return dmg * target / rate;
  // Below it (a caster's spells, which keep to their own reach, reached about 40% of a 도적's capped
  // blows at the boss and its raids ran out of time): lifted toward it, at most 1.6 times.
  return afk() ? dmg : dmg * Math.min(1.6, Math.sqrt(target / Math.max(rate, 1)));
}
/**
 * 직업 효율 (엔드게임 2차, 2026-11-28): the cap above is the hero's 전투력 against the raid's, and its own blows were 24 to 81
 * times it — 96~99% thrown away, so a class's knack, its gear past 전투력 and how it was played never showed in a raid.
 * Now the cap is lifted or lowered by what the hero has dealt the boss so far in its own measure (W.Uh: its level and gear)
 * a second of the boss fight (W.capInt: the seconds it stood alive with the boss up), against its role's middle (ref: the
 * classes' middle on 신 용궁 탑 with the gear of its ground, raidbot — 딜러 25~314, the middle about 85), on a gentle log:
 * half of it → about 0.86, twice → about 1.14, at most 0.78~1.3 (a 30% stronger class: about +5% of the cap). The boss only:
 * blows on the servants (a 전사's sweep over twenty adds) said little of the raid. It comes in over the first 20 s of the fight;
 * a hero away from the controls (its blows at 0.05) falls to the floor.
 */
const RAID_EFF = { ref: { dps: 85, tank: 300, healer: 30, support: 60 }, k: 0.2, lo: 0.78, hi: 1.3, warm: 20 };
function raidEff(W) {
  const tt = W.capInt || 0;
  if (tt < 3 || !(W.rawBoss > 0)) return W.capEff || 1;
  const rh = W.rawBoss / tt / (W.Uh || 1);
  const e = clamp(1 + RAID_EFF.k * Math.log(rh / (RAID_EFF.ref[W.role] || RAID_EFF.ref.dps)), RAID_EFF.lo, RAID_EFF.hi);
  return (W.capEff = 1 + (e - 1) * Math.min(1, tt / RAID_EFF.warm));
}
function raidCredit(e, dmg, killed) {
  const W = A.G().war, h = W.hero;
  if (W.jaeng) {
    e.lastTeam = 0;
    e.lastHero = true;
    if (e.kind === 'boss') bossShare(W, h, 0, dmg);
  }
  credit(h, 'dmg', dmg);
  if (e.kind === 'boss') credit(h, 'boss', dmg);
  if (killed) credit(h, e.kind === 'boss' ? 'obj' : 'kills', e.kind === 'boss' ? 30 : 1);
}

/** A raider down: the boss gloats now and then; the raid leader calls a tank's fall. */
function raidDown(W, f, by) {
  const G = A.G();
  W.stat.deaths++;
  if (G.aggro === f) G.aggro = raidAggro();
  if (W.boss && Math.random() < 0.35) A.bossSay(f.role === 'healer' && !G.saidHealer && G.stage.lines && G.stage.lines.killHealer ? (G.saidHealer = 'killHealer') : 'kill');
  if (f.role === 'tank' && W.boss) call(W, 'tankdown', 10, ['탱 누웠어요! 다른 탱 어그로 잡아요!', '메인탱 사망! 서브탱 도발!']);
  if (f.role === 'tank' && W.raid) rageDelay(G);
}
/** A tank down while the boss rages: its next blast (or the one gathering, once) two seconds later. */
function rageDelay(G) {
  if (!G.enraged) return;
  if (G.blast && !G.blast.delayed) { G.blast.delayed = true; G.blast.at += RAID_RAGE.tankDelay; G.blast.warn = (G.blast.warn || 1.6) + RAID_RAGE.tankDelay; }
  else if (!G.blast) G.blastT = Math.max(G.blastT || 0, RAID_RAGE.tankDelay + 1);
}

/** The raid leader's word in the party chat, each kind not too often. */
function call(W, kind, every, lines) {
  const G = A.G();
  if (G.t - (W.calls[kind] || -99) < every) return false;
  W.calls[kind] = G.t;
  const who = W.leaderBody && !W.leaderBody.dead ? W.leaderBody : W.bodies.find(b => b.leader && !b.dead) || W.leaderBody;
  const text = pick(lines);
  A.say(`[공대장] ${who.name}: ${text}`, 'party');
  if (who && !who.dead) who.bubble = { text: text.length > 14 ? text.slice(0, 13) + '…' : text, t: G.t };
  return true;
}

/** Orders to the parties: before the boss, the servants together; then the boss, a party on the
 * servants when many come (the one nearest them). */
function raidOrders(W, loud = false) {
  const G = A.G(), sqs = W.teams[0].squads, boss = W.boss;
  const adds = W.alive[1].filter(e => e.kind !== 'boss');
  const set = (sq, x, y, kind, obj = null) => {
    const [sx, sy] = snap(W, x, y);
    const at = boss || { tx: W.lair[0], ty: W.lair[1] };
    sq.order = { x: sx, y: sy, kind, obj, face: [Math.sign(at.tx - sx), Math.sign(at.ty - sy)] };
  };
  // The servants' heart: the five of them nearest the camp's side of the raid.
  const heart = () => {
    const near = adds.slice().sort((a, b) => (Math.abs(a.tx - W.camp[0]) + Math.abs(a.ty - W.camp[1])) - (Math.abs(b.tx - W.camp[0]) + Math.abs(b.ty - W.camp[1]))).slice(0, 5);
    return [near.reduce((a, e) => a + e.tx, 0) / near.length, near.reduce((a, e) => a + e.ty, 0) / near.length];
  };
  if (!boss) {
    const [x, y] = adds.length ? heart() : [(W.camp[0] + W.lair[0]) / 2, (W.camp[1] + W.lair[1]) / 2 + 3];
    sqs.forEach((sq, i) => set(sq, x + (i % 3 - 1) * 2, y + (i > 2 ? 1 : -1), adds.length ? 'adds' : 'hold'));
    if (loud || adds.length > 6) call(W, 'open', 60, ['쫄 먼저 정리해요! 보스 곧 나옵니다', '보스 나오기 전에 잡몹 정리!']);
    return;
  }
  const many = adds.length >= 6, lots = adds.length >= 14;
  sqs.forEach((sq, i) => {
    if ((i === sqs.length - 1 && many) || (i === sqs.length - 2 && lots)) {
      const [x, y] = heart();
      set(sq, x, y, 'adds');
      call(W, 'adds' + i, 20, [`쫄 몰려와요! ${i + 1}파티 쫄 정리!`, `${i + 1}파티는 쫄 잡아 주세요!`]);
    } else set(sq, boss.tx, boss.ty, 'assault', boss);
  });
}

/** The raid's moments: the boss's coming, a blast to cut, the phases, the last of its life. */
function raidCalls(W, dt) {
  const G = A.G(), boss = W.boss;
  if (!boss) return;
  if (!W.calls.boss) { W.calls.boss = G.t; call(W, 'b0', 0, ['탱커 앞으로! 딜러는 옆이랑 뒤에서, 힐러는 뒤에서 힐!', '자 들어갑니다! 탱 먼저 어그로 잡고 딜 시작!']); }
  const k = hpk(boss);
  for (const [at, line] of [[0.5, '반피! 이대로만 가요!'], [0.2, '20%! 조금만 더!'], [0.08, '보스 피 얼마 없어요!!! 다 쏟아요!']])
    if (k < at && !W.calls['hp' + at]) { W.calls['hp' + at] = G.t; call(W, 'hp', 0, [line]); }
  if (G.phase && W.calls.phase !== G.phase) { W.calls.phase = G.phase; call(W, 'ph', 0, [`${G.phase + 1}페이즈! 쫄 나옵니다, 힐러 정신 차려요!`]); }
  if (G.enraged && !W.calls.rage) { W.calls.rage = G.t; call(W, 'rg', 0, ['광폭화!!! 1분 안에 못 잡으면 전멸이에요! 딜 몰아요!']); }
  if (G.marks.length) call(W, 'floor', 14, ['바닥 빨간 칸 보이면 바로 빠져요!', '장판 피하세요!', '빨간 바닥 밟지 마요!']);
  // A blast gathering: someone with a hold (주술사·마도사의 마비, a 서포터) may cut it — not always.
  if (G.blast && !W.blastPlan) {
    call(W, 'blast', 0, ['광역기 온다!! 마비 있는 분 끊어요!', '광역 기 모은다! 마비! 마비!']);
    const cutters = W.alive[0].filter(m => !m.hero && (m.role === 'support' || m.cls.id === 'mage' || m.cls.id === 'magus') && d2(m, boss) < 7);
    W.blastPlan = { at: G.t + rnd(0.6, 1.4), by: cutters.length && !G.enraged && Math.random() < RAID.cut ? pick(cutters) : null };
  }
  if (!G.blast) W.blastPlan = null;
  else if (W.blastPlan.by && G.t >= W.blastPlan.at) {
    const c = W.blastPlan.by;
    W.blastPlan.by = null;
    if (alive(c) && d2(c, boss) < 8) {
      G.blast = null;
      boss.stun = Math.max(boss.stun || 0, 1.2);
      castFx(W, c, SK.m_para ? 'm_para' : null, boss, [boss]);
      shout(W, c, '마비');
      credit(c, 'obj', 8);
      W.stat.cuts++;
      A.say(`${c.name}: 마비! 광역기 끊었어요!`, 'party');
      A.banner(`${c.name}의 마비! 광역기를 끊었다`);
    }
  }
}

// ------------------------------------------------ 레이드 역할 임무 (data.js RAID_TASKS)
// In each of the boss's three phases the hero has one task of its role, at the top of the screen
// with its seconds and a mark on what it is about (탱커: the boss turned on a healer — come and
// taunt it; a 광전사 at the back — hold it; 힐러: the marked raider — mend it, the cursed — cleanse
// them; 딜러: the totems — break them, the shield — break it; 서포터: the big blast — stand by four
// and guard them). From the second phase the boss's 「모여라」 and 「흩어져」 marks come between them
// for all. The raid's AI helps (it walks to a soak, steps off the bomb, chips at a totem) but the
// hero's own part decides them: an idle hero fails them all and its raid runs out of time.

/** A free tile about (x, y), r0..r1 away, off the red floor. */
function spotAbout(W, x, y, r0, r1) {
  for (let i = 0; i < 40; i++) {
    const a = Math.random() * Math.PI * 2, r = rnd(r0, r1);
    const tx = Math.round(x + Math.cos(a) * r), ty = Math.round(y + Math.sin(a) * r * 0.8);
    if (open(W, tx, ty) && A.free(tx, ty) && !W.danger.has(dk(tx, ty))) return [tx, ty];
  }
  return null;
}
/** The boss's blow on the whole raid (a failed task): k of each one's life (the hero's a little less). */
function raidPulse(W, k, only = null) {
  const G = A.G(), boss = W.boss || { name: W.teams[1].name };
  let shown = 0;
  for (const m of only || W.alive[0]) {
    if (m.hero) { if (!G.dead) A.hurtPlayer(G.player.maxHp * k * 0.8, W.boss, true); continue; }
    if (m.dead) continue;
    hit(W, boss, m, m.maxHp * k);
    if (shown < 6 && onScreen(m) && fxOk()) { shown++; A.addFx(A.G().stage.fx, m.x, m.y - 20, { scale: 0.5 }); }
  }
  G.shake = Math.max(G.shake || 0, 0.3);
}
function raidTasks(W, dt) {
  const G = A.G(), boss = W.boss;
  const T = W.tasks || (W.tasks = { ok: 0, fail: 0, n: 0, log: [], next: 0, cur: null, alt: 0, phaseSeen: -1 });
  if (!boss || boss.dying || W.over) { if (T.cur) taskClear(W, T); return; }
  const role = RAID_TASKS[W.role] ? W.role : 'dps';
  if (G.phase !== T.phaseSeen) {
    T.phaseSeen = G.phase;
    T.alt = 0;
    const kind = RAID_TASKS[role][Math.min(2, G.phase || 0)];
    A.say(`[${(G.phase || 0) + 1}페이즈] ${ROLES[role].name}의 임무: ${RAID_TASK_DEF[kind].name} — ${RAID_TASK_DEF[kind].how}${G.phase ? ' · 보스의 「모여라」「흩어져」도 함께 옵니다' : ''}`, 'sys');
    if (!T.cur) T.next = G.t + (T.n ? 2.5 : 4);
  }
  if (T.cur) return taskTick(W, T, dt);
  if (G.t < T.next) return;
  if (G.dead) { T.next = G.t + 1; return; }
  let kind = RAID_TASKS[role][Math.min(2, G.phase || 0)];
  if (G.phase >= 1 && T.alt % 2 === 1) kind = (T.alt >> 1) % 2 ? 'spread' : 'soak';
  T.alt++;
  taskStart(W, T, kind);
}
function taskStart(W, T, kind) {
  const G = A.G(), boss = W.boss, def = RAID_TASK_DEF[kind], h = W.hero, p = G.player;
  const c = { kind, def, t0: G.t, until: G.t + def.sec, prog: 0, need: 1, list: [], tick: 0 };
  const raiders = W.alive[0].filter(m => !m.hero && !m.dead);
  if (kind === 'hold') {
    const heal = raiders.filter(m => m.role === 'healer').sort((a, b) => d2(b, boss) - d2(a, boss))[0] || raiders[0];
    if (!heal) return;
    c.on = heal;
    G.aggro = heal;
    W.taunted = { by: heal, until: c.until };
    boss.bubble = { text: `${heal.name}!`, t: G.t };
  } else if (kind === 'berserk') {
    const hs = raiders.filter(m => m.role === 'healer');
    const cx = hs.length ? hs.reduce((a, m) => a + m.tx, 0) / hs.length : W.camp[0], cy = hs.length ? hs.reduce((a, m) => a + m.ty, 0) / hs.length : W.camp[1];
    const at = spotAbout(W, cx, cy, 2, 4) || raidSpot(3, 6);
    const e = at && A.addEnemy(A.pickMonster(true), 'champ', { name: '광전사', scale: 1.3 }, 0, at);
    if (!e) return;
    e.hp = e.maxHp = W.U * 30;
    e.dmg *= 1.6;
    e.berserk = true;
    c.on = e;
  } else if (kind === 'focus') {
    // (One the hero must go to: the farthest of the raid within ten tiles, not a tank.)
    const far = raiders.filter(x => x.role !== 'tank' && d2(x, h) <= 10).sort((a, b) => d2(b, h) - d2(a, h));
    const m = far[0] || pick(raiders);
    if (!m) return;
    m.hp = Math.min(m.hp, m.maxHp * 0.35);
    m.mark = c;
    c.on = m;
  } else if (kind === 'cleanse') {
    const pool = raiders.filter(x => x.role !== 'tank').sort(() => Math.random() - 0.5).slice(0, 2);
    if (!pool.length) return;
    for (const m of pool) { m.curseMark = c; c.list.push(m); }
    c.need = pool.length;
    c.stand = new Map();
  } else if (kind === 'totem') {
    // (A totem stands and strikes nobody; the raiders chip at it, the hero breaks it.)
    for (let i = 0; i < 3; i++) {
      const at = raidSpot(2, 4);
      const e = at && A.addEnemy(A.pickMonster(true), 'champ', { name: '토템', scale: 1.1 }, 0, at);
      if (!e) continue;
      e.hp = e.maxHp = raidHeroRate(W) * 1.3;
      e.stun = 1e9;
      e.dmg = 0;
      e.totem = true;
      c.list.push(e);
    }
    if (!c.list.length) return;
    c.need = c.list.length;
  } else if (kind === 'shield') {
    c.hp = c.max = raidHeroRate(W) * 5.5;
    W.shield = c;
    boss.bubble = { text: '보호막!', t: G.t };
  } else if (kind === 'guard') {
    boss.bubble = { text: '모두 쓸어 주마!', t: G.t };
    c.need = 4;
  } else if (kind === 'soak') {
    const at = spotAbout(W, boss.tx, boss.ty, 4, 6) || spotAbout(W, p.tx, p.ty, 2, 4);
    if (!at) return;
    c.at = at;
    c.need = 4;
    // Five of the raid go to it (three must make it; the hero is the fourth).
    const go = raiders.filter(m => m.role !== 'tank').sort((a, b) => Math.hypot(a.tx - at[0], a.ty - at[1]) - Math.hypot(b.tx - at[0], b.ty - at[1])).slice(0, 5);
    for (const m of go) m.taskGo = { at: snap(W, at[0] + pick([-1, 0, 1]), at[1] + pick([-1, 0, 1])), until: c.until };
  } else if (kind === 'spread') {
    c.need = 1;
  }
  T.cur = c;
  T.n++;
  // (The box at the top is its announcement: a banner there covered it for its first seconds.)
  A.floatText(G.player.x, G.player.y - 96, `임무: ${def.name}`, def.all ? '#ffe08a' : '#ffd040', true);
  A.say(`[임무] ${def.name} — ${def.how} (${def.sec}초)`, 'sys');
  if (W.diag) W.diag.tasks = (W.diag.tasks || 0) + 1;
}
function taskTick(W, T, dt) {
  const G = A.G(), c = T.cur, boss = W.boss, h = W.hero, p = G.player, up = !G.dead;
  const left = c.until - G.t;
  const k = c.kind;
  if (k === 'hold') {
    // (It walks off after the healer: kept close for two seconds and a half, the taunt holds it.)
    if (up && d2(h, boss) <= 3.2) c.prog += dt;
    if (c.prog >= 2.5) {
      G.aggro = p;
      W.taunted = { by: h, until: G.t + 6 };
      W.heroTauntT = G.t;
      A.floatText(p.x, p.y - 80, '도발!', '#ffd27a', true);
      tauntFx(h);
      return taskEnd(W, T, true);
    }
    if (left <= 0) {
      const m = c.on;
      if (alive(m)) hit(W, boss, m, m.maxHp * 0.6);
      raidPulse(W, 0.08, W.alive[0].filter(x => !x.hero && x.role === 'healer'));
      W.taunted = null;
      return taskEnd(W, T, false);
    }
  } else if (k === 'berserk') {
    const e = c.on;
    if (!(e.hp > 0)) return taskEnd(W, T, true);
    if (up && Math.hypot(e.tx - p.tx, e.ty - p.ty) <= 2.2) {
      c.prog += dt;
      if (c.prog >= 2) {
        e.stun = Math.max(e.stun, 3);
        e.dmg *= 0.4;
        A.floatText(p.x, p.y - 80, '도발!', '#ffd27a', true);
        tauntFx(h);
        return taskEnd(W, T, true);
      }
    }
    if (left <= 0) {
      raidPulse(W, 0.3, W.alive[0].filter(x => !x.hero && x.role === 'healer' && Math.hypot(x.tx - e.tx, x.ty - e.ty) <= 4));
      return taskEnd(W, T, false);
    }
  } else if (k === 'focus') {
    const m = c.on;
    if (!alive(m)) return taskEnd(W, T, false);
    m.hp -= m.maxHp * 0.03 * dt;
    if (up && d2(h, m) <= 4) {
      c.tick -= dt;
      if (c.tick <= 0) {
        c.tick = 0.5;
        healBody(W, h, m, m.maxHp * 0.045 * W.roleK);
        const fx = SK.c_heal && (SK.c_heal.fxs ? SK.c_heal.fxs[Math.min(7, Math.floor(p.lvl / 5))] : SK.c_heal.fx);
        if (fx && healFxOk()) A.addFx(fx, 0, -26, { scale: 0.9, self: true, on: m });
      }
    }
    c.prog = hpk(m);
    if (hpk(m) >= 0.8) { m.mark = null; return taskEnd(W, T, true); }
    if (m.hp <= 0 || left <= 0) { m.mark = null; m.hp = Math.max(1, m.hp); kill(W, m, boss); return taskEnd(W, T, false); }
  } else if (k === 'cleanse') {
    let done = 0;
    for (const m of c.list) {
      if (!m.curseMark) { done++; continue; }
      if (!alive(m)) { m.curseMark = null; continue; }
      m.hp = Math.max(1, m.hp - m.maxHp * 0.02 * dt);
      if (up && d2(h, m) <= 2.2) {
        const n = (c.stand.get(m) || 0) + dt;
        c.stand.set(m, n);
        if (n >= 1) {
          m.curseMark = null;
          done++;
          if (SK.c_heal && healFxOk()) A.addFx(A.FX.shield, 0, -26, { scale: 0.8, self: true, on: m });
          A.floatText(m.x, m.y - 70, '정화', '#c8f0ff', true);
        }
      }
    }
    c.prog = done;
    if (done >= c.need) return taskEnd(W, T, true);
    if (left <= 0) {
      for (const m of c.list) if (m.curseMark && alive(m)) {
        m.curseMark = null;
        raidPulse(W, 0.25, W.alive[0].filter(x => !x.hero && d2(x, m) <= 2));
      }
      return taskEnd(W, T, false);
    }
  } else if (k === 'totem') {
    const live = c.list.filter(e => e.hp > 0);
    c.prog = c.need - live.length;
    if (!live.length) return taskEnd(W, T, true);
    if (left <= 0) {
      for (const e of live) A.strike(e, e.hp * 2 + 1, false);
      boss.hp = Math.min(boss.maxHp, boss.hp + boss.maxHp * 0.04);
      raidPulse(W, 0.15);
      return taskEnd(W, T, false);
    }
  } else if (k === 'shield') {
    c.prog = 1 - c.hp / c.max;
    if (c.hp <= 0) {
      W.shield = null;
      W.exposed = G.t + 6;
      boss.stun = Math.max(boss.stun || 0, 2);
      A.banner(`보호막 파괴! ${W.teams[1].name} 휘청인다 — 6초간 피해 +30%`);
      return taskEnd(W, T, true);
    }
    if (left <= 0) { W.shield = null; raidPulse(W, 0.2); return taskEnd(W, T, false); }
  } else if (k === 'guard') {
    const near = up ? W.alive[0].filter(m => !m.hero && d2(m, h) <= 3) : [];
    c.prog = near.length;
    if (left <= 0) {
      const ok = near.length >= c.need;
      if (ok) { for (const m of near) guard(W, m, 4); A.addFx(A.FX.shield, 0, -26, { follow: true, self: true, scale: 1 }); }
      raidPulse(W, ok ? 0.08 : 0.22);
      return taskEnd(W, T, ok);
    }
  } else if (k === 'soak') {
    const [x, y] = c.at, inside = m => Math.hypot(m.tx - x, m.ty - y) <= 1.6;
    const heroIn = up && inside(p);
    const n = W.alive[0].filter(m => !m.hero && inside(m)).length + (heroIn ? 1 : 0);
    c.prog = n;
    c.heroIn = heroIn;
    if (left <= 0) {
      const ok = n >= (up ? c.need : c.need - 1) && (heroIn || !up);
      if (!ok) raidPulse(W, 0.18);
      return taskEnd(W, T, ok);
    }
  } else if (k === 'spread') {
    const close = up ? W.alive[0].filter(m => !m.hero && d2(m, h) <= 2.5) : [];
    c.prog = close.length;
    // The raiders step off the hero's bomb (by their own knack).
    c.tick -= dt;
    if (c.tick <= 0 && up) {
      c.tick = 0.5;
      for (const m of W.alive[0]) {
        if (m.hero || d2(m, h) > 3.5 || (m.taskGo && m.taskGo.until > G.t) || Math.random() > m.dodge) continue;
        const dx = Math.sign(m.tx - p.tx) || pick([-1, 1]), dy = Math.sign(m.ty - p.ty) || pick([-1, 1]);
        m.taskGo = { at: snap(W, m.tx + dx * 3, m.ty + dy * 3), until: Math.min(c.until + 0.5, G.t + 2) };
      }
    }
    if (left <= 0) {
      const ok = close.length <= 1;
      if (!ok) { raidPulse(W, 0.25, close); if (up) A.hurtPlayer(p.maxHp * 0.15, boss, true); }
      return taskEnd(W, T, ok);
    }
  }
}
function taskClear(W, T) {
  const c = T.cur;
  if (!c) return;
  for (const m of c.list) { m.curseMark = null; }
  if (c.on) c.on.mark = null;
  if (W.shield === c) W.shield = null;
  if (c.kind === 'hold' && W.taunted && W.taunted.by === c.on) W.taunted = null;
  T.cur = null;
}
function taskEnd(W, T, ok) {
  const G = A.G(), c = T.cur, p = G.player;
  taskClear(W, T);
  T.next = G.t + rnd(9, 13);
  T.log.push([c.kind, ok ? 1 : 0, Math.round((G.t - c.t0) * 10) / 10, G.phase || 0]);
  if (ok) {
    T.ok++;
    // (Its own share, past the cap on the hero's objectives: the task is the player's.)
    W.hero.stats.obj += c.def.obj * (afk() ? AFK_K : 1);
    A.banner(`임무 성공 · ${c.def.name}`);
    A.floatText(p.x, p.y - 96, '임무 성공!', '#ffd040', true);
    if (Math.random() < 0.5) call(W, 'taskOk', 12, ['나이스!! 그거죠!', '좋아요 잘 막았어요!', '굿굿 그대로 가요!']);
  } else {
    T.fail++;
    A.banner(`임무 실패 · ${c.def.name}`);
    if (Math.random() < 0.6) call(W, 'taskFail', 12, ['아 그거 놓쳤다ㅠ', '다음엔 챙겨요!', '괜찮아요 다시!']);
  }
  A.say(`[임무] ${c.def.name} ${ok ? '성공' : '실패'} (성공 ${T.ok}/${T.ok + T.fail})`, ok ? 'sys' : 'warn');
}
/** The task's world marks under the bodies (drawRaidGround): its target ringed, the soak, the bomb. */
function drawTaskMarks(G, W, ctx) {
  const c = W.tasks && W.tasks.cur;
  if (!c) return;
  const pulse = 0.55 + 0.35 * Math.sin(G.t * 8);
  const ring = (b, r, col, fill) => {
    const x = (b.x !== undefined ? b.x : b[0] * TILE + TILE / 2), y = (b.y !== undefined ? b.y : b[1] * TILE + TILE / 2);
    ctx.beginPath();
    ctx.ellipse(x, y, r * TILE, r * TILE * 0.62, 0, 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    ctx.strokeStyle = col;
    ctx.stroke();
  };
  ctx.save();
  ctx.lineWidth = 3;
  ctx.globalAlpha = pulse;
  const k = c.kind;
  if (k === 'hold' && W.boss) ring(W.boss, 3.2, '#ffd040', 'rgba(255,208,64,0.10)');
  else if (k === 'berserk' && c.on.hp > 0) ring(c.on, 2.2, '#ff8a3a', 'rgba(255,138,58,0.12)');
  else if (k === 'focus' && alive(c.on)) { ring(c.on, 4, '#7cf08a', 'rgba(124,240,138,0.08)'); ring(c.on, 0.6, '#7cf08a'); }
  else if (k === 'cleanse') for (const m of c.list) { if (m.curseMark && alive(m)) { ring(m, 2.2, '#c88aff', 'rgba(200,138,255,0.12)'); ring(m, 0.6, '#c88aff'); } }
  else if (k === 'totem') for (const e of c.list) { if (e.hp > 0) ring(e, 0.9, '#ff4a3a', 'rgba(255,74,58,0.15)'); }
  else if (k === 'shield' && W.boss) { ctx.globalAlpha = 0.35 + 0.4 * (c.hp / c.max); ring(W.boss, 1.8, '#7ad0ff', 'rgba(122,208,255,0.18)'); }
  else if (k === 'guard') ring(G.player, 3, '#9ad8ff', 'rgba(154,216,255,0.08)');
  else if (k === 'soak') ring(c.at, 1.6, '#ffd040', `rgba(255,208,64,${0.18 + 0.12 * pulse})`);
  else if (k === 'spread' && !G.dead) ring(G.player, 2.5, '#ff4a3a', 'rgba(255,60,40,0.12)');
  ctx.restore();
}
/** The task at the top of the screen: role, name, seconds, how, its progress; an arrow to its mark. */
function drawTaskHud(G, W, ctx, cw, ch, u) {
  const T = W.tasks, c = T && T.cur;
  if (!c) return;
  const left = Math.max(0, Math.ceil(c.until - G.t));
  const prog = { hold: `${Math.min(2.5, c.prog).toFixed(1)}/2.5초`, berserk: `${Math.min(2, c.prog).toFixed(1)}/2초`, focus: `${Math.round(c.prog * 100)}%/80%`, cleanse: `${c.prog}/${c.need}`, totem: `${c.prog}/${c.need}`,
    shield: `${Math.round(c.prog * 100)}%`, guard: `${c.prog}/${c.need}명`, soak: `${c.prog}/${c.need}${c.heroIn ? '' : ' (나 밖)'}`, spread: `곁에 ${c.prog}명` }[c.kind];
  // (Under the boss's bar, #bossbar: 44 CSS px from the top and some 42 tall, and under the
  // banners, #banner at 22% of the height.)
  const d = cw / (A.boxOf(A.canvas).width || cw);
  const w = Math.min(cw - 16 * u, 330 * u), x = cw / 2 - w / 2, y = (W.boss ? Math.max(118, 0.29 * ch / d) : 44) * d, hgt = 30 * u;
  ctx.fillStyle = c.def.all ? 'rgba(60,40,0,0.72)' : 'rgba(20,24,40,0.72)';
  ctx.fillRect(x, y, w, hgt);
  ctx.fillStyle = left <= 2 ? '#ff6a4a' : '#ffd040';
  ctx.fillRect(x, y + hgt - 3 * u, w * Math.max(0, (c.until - G.t) / c.def.sec), 3 * u);
  ctx.textAlign = 'center';
  ctx.font = `bold ${Math.round(11 * u)}px G11`;
  hudText(`${c.def.all ? '공대' : ROLES[W.role] ? ROLES[W.role].name : ''} 임무 · ${c.def.name}  ${left}초${prog ? '  ' + prog : ''}`, cw / 2, y + 12 * u, c.def.all ? '#ffe08a' : '#ffd040');
  ctx.font = `${Math.round(9 * u)}px G9`;
  hudText(c.def.how, cw / 2, y + 24 * u, '#fff');
  // Off screen: an arrow at the edge toward the task's mark.
  const tg = c.kind === 'hold' || c.kind === 'shield' ? W.boss : c.kind === 'focus' || c.kind === 'berserk' ? c.on
    : c.kind === 'cleanse' ? c.list.find(m => m.curseMark) : c.kind === 'totem' ? c.list.find(e => e.hp > 0) : c.kind === 'soak' ? { x: c.at[0] * TILE + TILE / 2, y: c.at[1] * TILE + TILE / 2 } : null;
  const p = G.player;
  if (tg && !G.dead) {
    const ox = tg.x - p.x, oy = tg.y - p.y;
    if (Math.abs(ox) > A.VW() / 2 - 20 || Math.abs(oy) > A.VH() / 2 - 20) {
      const ang = Math.atan2(oy, ox), r = Math.min(cw, ch) * 0.34;
      const ax = cw / 2 + Math.cos(ang) * r, ay = ch / 2 + Math.sin(ang) * r * 0.8;
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(ang);
      ctx.fillStyle = 'rgba(255,208,64,0.95)';
      ctx.beginPath();
      ctx.moveTo(12 * u, 0);
      ctx.lineTo(-7 * u, -8 * u);
      ctx.lineTo(-7 * u, 8 * u);
      ctx.fill();
      ctx.restore();
      hudText('임무', ax, ay - 11 * u, '#ffd040');
    }
  }
}

/** The hero's own stun cut the blast (game.js cutBlast). */
function raidHeroCut() {
  const W = A.G().war;
  credit(W.hero, 'obj', 8);
  W.stat.heroCuts++;
  if (W.jaeng) jaengHeroCut(W);
}

// ------------------------------------------------ 광폭화 광역기 (엔드게임 2차, 2026-11-28)
// After 4:00 the boss's blast came every five seconds, uncut (the raiders no longer cut it enraged) and over everyone:
// 17 raiders fell at once at 4:11 (raidbot, 신 용궁 탑) — a cliff, not pressure. Now enraged it comes every eight seconds
// (every: of its phase's 15/12/10), 2.8 seconds' warning, and four rings of shelter lie on the floor about the boss
// (반지름 2.4칸, the drawn ellipse is what counts): inside, a fifth of the blow; outside, the blow at 0.85. The raiders run to
// the nearest by their own knack (b.dodge); the hero must walk in (or cut it with a stun). A tank's fall puts the next
// blast off two seconds (the boss turns while another tank takes it up), once a blast.
const RAID_RAGE = { every: 0.8, warn: 2.8, r: 2.4, inside: 0.2, outside: 0.85, tankDelay: 2 };
function rageBlast(bl) {
  const G = A.G(), W = G.war, boss = W && W.boss;
  if (!W || !boss) return;
  const spots = [];
  for (const [ax, ay] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    let at = null;
    for (let i = 0; i < 30 && !at; i++) {
      const r = rnd(3.5, 5.5), a = Math.atan2(ay, ax) + rnd(-0.5, 0.5);
      const tx = Math.round(boss.tx + Math.cos(a) * r), ty = Math.round(boss.ty + Math.sin(a) * r * 0.8);
      if (open(W, tx, ty) && !spots.some(q => Math.abs(q[0] - tx) + Math.abs(q[1] - ty) < 4)) at = [tx, ty];
    }
    if (at) spots.push(at);
  }
  if (!spots.length) return;
  bl.safe = spots;
  W.rageBlasts = (W.rageBlasts || 0) + 1;
  const near = m => spots.reduce((b, q) => (Math.hypot(q[0] - m.tx, q[1] - m.ty) < Math.hypot(b[0] - m.tx, b[1] - m.ty) ? q : b), spots[0]);
  for (const m of W.alive[0]) {
    if (m.hero || m.dead || Math.random() > Math.min(0.95, (m.dodge || 0.6) + 0.15)) continue;
    const q = near(m);
    m.taskGo = { at: snap(W, q[0] + pick([-1, 0, 0, 1]), q[1]), until: bl.at + 0.3 };
  }
  A.say(`${W.teams[1].name}이(가) 힘을 모읍니다! (광폭 광역기) — 바닥의 흰 원 안으로!`, 'warn');
  A.banner('광폭 광역기! 흰 원 안으로 피하라');
  call(W, 'rageBlast', 12, ['원 안으로!! 다 원으로 모여요!', '광역 온다 원 들어가요!', '흰 원! 흰 원!']);
}
/** The share of the enraged blast on one body: in a ring of shelter (as drawn: its ellipse) a fifth. */
function rageBlastK(x, bl) {
  const W = A.G().war;
  const inside = bl.safe.some(([tx, ty]) => {
    const dx = (x.x - (tx * TILE + TILE / 2)) / (RAID_RAGE.r * TILE), dy = (x.y - (ty * TILE + TILE / 2)) / (RAID_RAGE.r * TILE * 0.62);
    return dx * dx + dy * dy <= 1;
  });
  if (W) { if (inside) W.rageSafe = (W.rageSafe || 0) + 1; else W.rageHit = (W.rageHit || 0) + 1; }
  return inside ? RAID_RAGE.inside : RAID_RAGE.outside;
}
function drawRageRings(G, ctx) {
  const bl = G.blast;
  if (!bl || !bl.safe) return;
  const k = Math.max(0, 1 - (bl.at - G.t) / (bl.warn || 1.6));
  ctx.save();
  ctx.lineWidth = 3;
  for (const [tx, ty] of bl.safe) {
    const x = tx * TILE + TILE / 2, y = ty * TILE + TILE / 2, R = RAID_RAGE.r * TILE;
    ctx.beginPath();
    ctx.ellipse(x, y, R, R * 0.62, 0, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,250,230,${(0.16 + 0.1 * k).toFixed(3)})`;
    ctx.fill();
    ctx.globalAlpha = 0.65 + 0.35 * Math.sin(G.t * 6);
    ctx.strokeStyle = '#fff6d8';
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

/** A spot for a servant: about the boss (the lair before it comes), inside the arena. */
function raidSpot(r0 = 4, r1 = 9) {
  const G = A.G(), W = G.war, c = W.boss ? [W.boss.tx, W.boss.ty] : W.lair;
  for (let i = 0; i < 40; i++) {
    const a = Math.random() * Math.PI * 2, r = rnd(r0, r1);
    const x = Math.round(c[0] + Math.cos(a) * r), y = Math.round(c[1] + Math.sin(a) * r * 0.8);
    if (open(W, x, y) && A.free(x, y)) return [x, y];
  }
  return null;
}
/** The boss's life, in the raid's own measure: a fight of several minutes for twenty-five. */
function raidBossHp() {
  const G = A.G(), W = G.war;
  return W.U * RAID_BOSS_U * (W.crowdK || 1);
}
// (3~4 minutes now, 5 at most: at 23500 the raids of an active hero fell at 4:50~6:40.)
const RAID_BOSS_U = 12000; // with the hero's larger share (heroK): the raiders alone no longer finish an easy raid in time (at 21500 they did at 7:19 now and then)

/** The raid's end (game.js showResults): the tier, the coins and gold by it, the spotlight. */
function raidEnd(win, title) {
  const G = A.G(), W = G.war;
  if (!W || W.result) return W && W.result;
  W.over = true;
  W.win = win ? 0 : 1;
  W.why = win ? `${W.teams[1].name} 처치 · ${clock(W.killT || G.t)}` : W.wiped ? '공격대 전멸' : '시간 초과';
  const rows = board(W);
  const rank = rows.findIndex(x => x.b === W.hero);
  // A hero's spells fire by themselves, so one left standing at the camp still earned a share:
  // the tier also weighs how much of the raid the hero spent in the fight.
  const raw = tierOf(W, rows), act = Math.min(1, (W.activeT || 0) / Math.max(1, W.hero.aliveT * 0.9));
  const k = Math.min(raw.k, 1.6) * Math.pow(act, 1.3);
  const tier = k >= TIERS.S ? 'S' : k >= TIERS.A ? 'A' : k >= TIERS.B ? 'B' : 'C';
  W.act = act;
  const tierN = { S: 4, A: 3, B: 2, C: 1 }[tier], tierK = { S: 1.5, A: 1.25, B: 1, C: 0.7 }[tier];
  const base = 10 * G.level + (G.stage.gwoe ? 30 : 0);
  const coins = Math.max(1, Math.round(base * tierK * (win ? 1 : 0.3)));
  const gold = (win ? 60 : 30) * G.level * tierN;
  const pr = A.progress();
  pr.coins = (pr.coins || 0) + coins;
  G.gold += gold;
  pr.raidTier = pr.raidTier || {};
  const bt = pr.raidTier[G.stage.id];
  if (win && (!bt || 'SABC'.indexOf(tier) < 'SABC'.indexOf(bt))) pr.raidTier[G.stage.id] = tier;
  const T = W.tasks || { ok: 0, fail: 0, n: 0, log: [] };
  W.result = { win: W.win, why: W.why, title, tier, tierK: k, coins, gold, rank: rank + 1, rows, tasks: { ok: T.ok, n: T.ok + T.fail } };
  A.say(`${W.def.name} ${win ? '성공' : '실패'}! 기여 ${rank + 1}위 · 등급 ${tier} · 레이드주화 ${coins}개`, win ? 'sys' : 'warn');
  return W.result;
}
/** 70 → '1분 10초', 360 → '6분'. */
function clockWords(t) {
  const m = Math.floor(t / 60), s = Math.round(t % 60);
  return m ? `${m}분${s ? ` ${s}초` : ''}` : `${s}초`;
}
function clock(t) {
  t = Math.max(0, Math.floor(t));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

// ---------------------------------------------------------------- 「쟁」: three guilds and a world boss
// 월드 보스 쟁탈전: three guilds of twelve on one of 연's world-boss arenas, fighting the week's raid
// boss (its phases, red floor, blasts and servants, as in a raid — game.js bossBrain) and each other.
// The boss is sealed for the first two minutes (the 봉인전: three 봉인석 to hold, the servants
// about the field); then it wakes, strikes whoever is near whatever their guild, and the guild
// that dealt the most of its life (a thousand points between them), struck its last blow (+100),
// held the seals and won the fights in between comes first. It flees at nine minutes.
// Everything else is the war's: the fighters, roles, squads, the hero, the countdown and results.

// The three arenas (tools/yeon_war.py bosspk_*): the boss's altar, the three camps (each guild draws
// one at random), the three 봉인석 (each between two camps).
// (2026-11-28 대규모 전투 맵 확장: 연's world-boss arenas — 28x20 tiles of ground for three guilds — gave way to 연's own
// PK fields of the same lands, 88x44 · 60x48 · 90x60 tiles: the camps 40~50 steps from the boss, a seal by each pair of
// camps, side ways round between them. tools/yeon_war.py WARS.)
export const JAENG_MAPS = {
  bosspk_jp: { id: 'bosspk_jp', name: '왜국 성 앞 들판', lair: [46, 21], camps: [[8, 26], [84, 32], [76, 6]], seals: [[24, 8], [80, 20], [44, 36]] },
  bosspk_sea: { id: 'bosspk_sea', name: '용궁 바닷속 성터', lair: [31, 22], camps: [[4, 28], [56, 22], [36, 45]], seals: [[30, 5], [8, 42], [50, 38]] },
  bosspk_sky: { id: 'bosspk_sky', name: '하늘 아래 집결지', lair: [45, 14], camps: [[9, 14], [80, 14], [45, 51]], seals: [[9, 46], [79, 47], [62, 14]] },
};
// 쟁 신단 (엔드게임 2차): side ways between two camps, 9+ tiles from every seal, camp and the boss's altar (on the walk grids):
// 왜국 the north road between the first and third camps, the south field, the east's lower road; 용궁 the north hall, the
// west's middle, the east's south; 하늘 아래 the east corridor, the west and east stairs down to the seals.
const JSHRINE_SPOTS = { bosspk_jp: [[39, 5], [30, 38], [68, 29]], bosspk_sea: [[44, 7], [20, 30], [46, 30]], bosspk_sky: [[63, 28], [12, 30], [80, 31]] };
// first: its first waking (after the seals have begun, before the boss); every: then; buff: its gift (the war's shrine kinds);
// pts: its points to the guild that takes it (a seal held is 1 a second).
const JSHRINE = { first: 50, every: 70, warn: 8, take: 5, r: 1.8, buff: 25, pts: 25 };
const JAENG_GUILDS = [['청운', '#7cf08a'], ['흑월', '#ff7a6a'], ['백야', '#c88aff']];
// gather: the count and the first orders; bossAt: the seals break; rage: 광폭화; time: it flees.
// bossU: its life in the field's units (the design's 21000 left a boss that fled nine times in ten:
// a third of the crowd is always at a seal or another guild; 7000 falls at 6~7 minutes).
// Points: the boss's life 1000 between the guilds, the last blow 100, a cut blast 15 (a guild once
// in 25 s), a seal 1 a second (0.5 once the boss is up), a kill 3, an assist 1, a servant 0.2 (60
// at most). The design's 150 / 30 / 8 / 3 made the last blow decide 89% of the 「쟁」 and the PK
// outweigh the boss (balance runs, README); pkK: the guilds' blows on each other at 0.45 of a war's
// (the arena is small and every fight is close: at 1, 220 kills a 「쟁」 against 40~90 wanted).
// heroK: the hero's blows' cap (War.scale) at 0.85 of a war's; afkK: a hero away barely scratches.
const JAENG = {
  // (9 minutes was long for a phone's sitting, and its last two or three dragged: the boss fell at
  // 6~7 minutes. Now 6: the seals from 0:20, the boss at 1:10, its rage at 5:00; its life about half: it falls at 4~5 minutes.)
  // (bossU 3900 → 6600: with every guild's spells on the boss — only ours reached it — and the fighters' spells cast
  // by the hero's code, it fell at 2:25~2:55, the seals' and the PK's part of the 「쟁」 cut short: balance runs.)
  gather: 20, bossAt: 70, rage: 300, time: 360, bossU: 6600, campR: 3, pkK: 0.45,
  // (지휘가 승패에, 2026-11-28: the boss's share decided the 「쟁」 — 1000 of some 1700 points — whatever the hero called: a bot
  // that only fought and one that called and used its keys won 3 of 8 alike. Now the field counts more and the hero's call
  // has its own weight: the boss 750 / the last blow 80; a seal held through the boss fight 1 a second (was 0.5) and its
  // guild's blows on the boss +6% for each held (sealHold, on top of the waking's +15% for 30 s); while the hero's call
  // (보스 · 견제 · 봉인) stands, its guild fights as one — +8% blows (the boss's too), −5% taken (morale).)
  pts: { boss: 750, last: 80, cut: 15, seal: 1, sealBoss: 1, kill: 3, assist: 1, mob: 0.2, mobCap: 60 },
  sealBuff: 0.15, sealBuffT: 30, sealHold: 0.06, morale: 1.08, moraleTaken: 0.95, heroK: 0.85, afkK: 0.05, bossPw: 1.3,
  // The other guilds' mark on the hero (heroMark): its floor, and more while our guild leads the scores.
  heroMark: 1.6, heroLead: 0.4, hunters: 3,
};
/** The week's 「쟁」: its boss by the hero's 승급 (하급 ~6차, 중급 7~8차, 상급 9차), its arena by the boss. */
export function jaengWeek(tier, week = gwoeWeek()) {
  const pools = [['raid_sea', 'raid_fire', 'raid_wukong'], ['raid_varuna', 'raid_brit', 'raid_musin'], ['raid_agni', 'raid_airavata']];
  const rung = tier >= 9 ? 2 : tier >= 7 ? 1 : 0;
  let pool = pools[rung];
  // 상급: the week's 괴력난신 every other week.
  if (rung === 2 && week % 2) pool = ['raid_gwoe'];
  const raid = pool[week % pool.length];
  const map = ['raid_sea', 'raid_varuna'].includes(raid) ? 'bosspk_sea' : ['raid_wukong', 'raid_airavata'].includes(raid) ? 'bosspk_sky' : 'bosspk_jp';
  const sinsu = ['sinsu_jujak', 'sinsu_hyeonmu', 'sinsu_cheong', 'sinsu_baekho'][week % 4];
  return { raid, map, rung, sinsu, week };
}

/** Into a 「쟁」 (the board's 출전, or window.__jaeng): the arena's pieces, then the run. */
async function startJaeng(cls, role, opts = {}) {
  const tier = A.promo ? A.promo(cls.id) : 0;
  const wk = jaengWeek(tier, opts.week);
  const raid = A.RAIDS.find(r => r.id === (opts.raid || wk.raid));
  const def = JAENG_MAPS[opts.map || wk.map];
  const map = A.M().ywar && A.M().ywar[def.id];
  if (!raid || !map) return false;
  A.setChosenClass(cls);
  const loads = [];
  for (const [path, bm] of mapBms) if (!path.startsWith(`ywar/${def.id}_`)) { if (bm && bm.close) bm.close(); mapBms.delete(path); }
  for (let cy = 0; cy * map.chunk < map.h; cy++)
    for (let cx = 0; cx * map.chunk < map.w; cx++) {
      const p = `ywar/${def.id}_${cx}_${cy}.${map.ext || 'png'}`;
      if (!mapBms.has(p)) loads.push(sheetBitmap(p).then(bm => { if (bm) mapBms.set(p, bm); }));
    }
  for (const n of ['war_sealstone1', 'war_sealstone2', 'war_sealstone3', 'war_sealring', 'war_bossmark', 'war_bossaltar', 'war_totem', 'war_totem_r', 'war_brazier'])
    if (!A.images[`prop/${n}.png`] && (A.M().prop || {})[n]) loads.push(A.loadImage(`prop/${n}.png`));
  await aiLooksReady();
  await Promise.all(loads);
  const boss = raid.boss || {};
  const stage = {
    ...raid, raid: false, jaeng: true, id: 'jaeng_' + raid.id, raidId: raid.id, name: `쟁 · ${boss.name || raid.name}`, war: def, terrain: 'war',
    music: 'raid_' + raid.id, intro: `${def.name}에 ${boss.name || raid.name}이(가) 봉인되어 있다. 세 문파가 보스를 두고 다툰다.`, pages: raid.pages || [],
  };
  pendingWar = { def, role: ROLES[role] ? role : 'dps', side: 'atk', idle: !!opts.idle, looks: sessionLooks, jaeng: { wk, raid, practice: !!opts.practice, aiOnly: !!opts.aiOnly } };
  A.startRun(cls, stage);
  return true;
}

function jaengSetup() {
  const G = A.G();
  const { def, role, jaeng } = pendingWar;
  const M = A.M(), mp = M.ywar[def.id];
  const W = G.war = {
    def: { ...def, name: '쟁', title: G.stage.name.replace('쟁 · ', '') + ' 쟁탈전', time: JAENG.time },
    mode: 'bosspk', jaeng: true, teamIds: [0, 1, 2], role, side: 'atk', t: 0, left: JAENG.time, over: false,
    score: [0, 0, 0], pts: [0, 1, 2].map(() => ({ boss: 0, last: 0, cut: 0, seal: 0, pk: 0, mob: 0, shrine: 0 })), mobKills: [0, 0, 0],
    bossDmg: [0, 0, 0], bossWin: [[], [], []], pkHeat: [[0, 0, 0], [0, 0, 0], [0, 0, 0]], comeback: [1, 1, 1], sealN: [0, 0, 0], sealUntil: 0,
    feed: [], ghosts: [], crates: [], zones: [], bodies: [], squads: [], nextId: 1, flow: new Map(), sndT: 0, shoutT: 0, fxN: 0, round: 1, gateDown: false,
    map: { cols: mp.cols, rows: mp.rows, w: mp.w, h: mp.h, chunk: mp.chunk, ext: mp.ext, walk: Uint8Array.from(mp.walk.join(''), c => (c === '.' ? 1 : 0)) },
    heroDmgK: 1, roleK: 1, thinkIdx: 0, lastCmd: [0, 0, 0], cmdSaid: 0, events: [], danger: new Map(), dangerSig: '', calls: {},
    stat: { markHits: 0, dodges: 0, cuts: 0, heroCuts: 0, deaths: 0, revives: 0 }, jphase: 'gather', week: jaeng.wk, raidId: jaeng.raid.id, practice: jaeng.practice,
    diag: { atk: { hero: 0, tank: 0, other: 0 }, heal: { tank: 0, hero: 0, other: 0 }, campIdle: 0, stuck: {}, friendly: 0, mobHits: [0, 0, 0], pkKills: 0, check: 0, vulture: 0, regroup: 0, orders: {} },
    looks: pendingWar.looks || {},
  };
  G.bossDue = false;
  // (hunt.js's 토벌도 is set up before the war is: not a hunt's here.)
  G.hunt = null;
  const dash = document.getElementById('dash-btn');
  if (dash) dash.hidden = true;
  G.phase = 0;
  G.raidT = 4;
  W.countdown = 4;
  G.events = [];
  const p = G.player, best = A.best()[G.cls.id];
  const start = Math.max(A.raidStart(best), 22);
  p.lvl = start;
  W.startLvl = start;
  p.next = A.xpFor(start);
  G.pendingLevels = 0;
  G.firstCard = false;
  A.applyBuild(start);
  const fit = (p.gyeoks || []).filter(g => gyeokRoles(g).has(role)).length;
  W.roleK = 1 + 0.08 * Math.min(3, fit);
  W.fit = fit;
  if (role === 'tank') { p.maxHp = Math.round(p.maxHp * 1.35 * W.roleK); p.hp = p.maxHp; }
  if (role === 'dps') W.heroDmgK = 1.15 * W.roleK;
  // 전장 보정 as in a war: the field's unit is the hero's own blow; all three guilds alike.
  W.U = (6 + 1.2 * p.lvl) * Math.sqrt(Math.max(1, p.gearPower || 1));
  W.Uh = W.U;
  W.refHp = W.U * 22;
  W.tier = A.promo ? A.promo(G.cls.id) : 0;
  // The other two guilds by the hero's 전투력 as a war's enemy (foeKOf; not while the hero sits out): at 1 the guild of
  // a hero of 7.5만 took the most points in 4 of 6 「쟁」, by 1.8~2.8 times the next (balance runs).
  W.foeK = jaeng.aiOnly ? 1 : window.__warFoeK || foeKOf(Math.max(1500, A.combatPower ? A.combatPower(G.cls) : 3000), 'bosspk');
  W.lvRec = clamp(Math.round(12 + 1.4 * G.level), 14, 33);
  W.heroArmorK = Math.sqrt((20 + Math.min(46.7, Math.max(0, (p.armor || 0) + 2 * ((G.passives && G.passives.armor) || 0)))) / 20);
  // The camps drawn by lot: no guild has the near seal or the short way every time.
  const camps = def.camps.slice();
  for (let i = camps.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [camps[i], camps[j]] = [camps[j], camps[i]]; } // (a fair shuffle: sort by chance is not)
  W.teams = [0, 1, 2].map(i => ({ id: i, name: JAENG_GUILDS[i][0], color: JAENG_GUILDS[i][1], cmd: null, squads: [], spawn: snap(W, ...camps[i]), kills: 0, troops: [] }));
  W.lair = snap(W, ...def.lair);
  W.seals = def.seals.map((at, i) => { const s = snap(W, at[0], at[1]); return { x: s[0], y: s[1], owner: -1, cap: -1, prog: 0, name: ['비석', '구슬', '돌무지'][i], stone: `war_sealstone${i + 1}`, i }; });
  W.hero = {
    id: 0, hero: true, team: 0, name: `${G.cls.name}(나)`, role, cls: G.cls, tx: 0, ty: 0, x: 0, y: 0, hp: 1, maxHp: 1, dead: false,
    stats: blankStats(), hitBy: new Map(), m: { h: 46 }, scale: 1, aliveT: 0, bthr: 0,
  };
  heroTo(...W.teams[0].spawn);
  // Three squads of four a guild (the hero's in the second, with every role: it takes one's place).
  for (const team of [0, 1, 2]) {
    for (let s = 0; s < squadsOf('jaeng'); s++) {
      const sq = { id: s, team, name: `${s + 1}분대`, members: [], leader: null, order: null, target: null, said: -9, focusT: 0 };
      W.squads.push(sq);
      W.teams[team].squads.push(sq);
      const plan = s === 1 ? ['tank', 'healer', 'dps', 'support'] : ['tank', 'healer', 'dps', s === 0 ? 'support' : 'dps'];
      if (team === 0 && s === 1 && !jaeng.aiOnly) plan.splice(plan.indexOf(role), 1);
      for (const r of plan) sq.members.push(mkFighter(W, team, r, sq));
      sq.leader = sq.members.find(m => m.role === 'tank') || sq.members[0];
      sq.leader.leader = true;
    }
  }
  // Test (opts.aiOnly): the hero's place an AI fighter's; the hero sits it out (the balance runs).
  // (Off the field: standing in its camp's mouth it held its own guild's way out.)
  if (jaeng.aiOnly) { G.dead = true; W.heroOut = true; W.heroBack = 0; W.aiOnly = true; const p = G.player; p.tx = p.ty = -20; p.x = p.y = -20 * TILE; }
  W.squads[1].members.push(W.hero);
  W.hero.squad = W.squads[1];
  // The boss's life and a kill's points by the crowd's size (35 fighters and the hero at the design's).
  W.crowdK = (W.bodies.length + 1) / 36;
  const pocket = (role === 'dps' || role === 'support') && W.squads[1].members.find(m => m.role === 'healer');
  if (pocket) pocket.pocket = true;
  applyPersonas(W);
  for (const b of W.bodies) {
    b.bthr = 0;
    placeBody(W, b, W.teams[b.team].spawn);
    listOf(b.team).push(b);
  }
  W.alive = [0, 1, 2].map(t => W.bodies.filter(b => b.team === t));
  jaengLists(W);
  for (const t of [0, 1, 2]) jaengPlan(W, t, true);
  endgameSetup(W);
  A.say(`[쟁] ${W.teams[0].name} · ${W.teams[1].name} · ${W.teams[2].name} — ${G.stage.name}. ${clockWords(JAENG.bossAt)} 뒤 봉인이 풀립니다. 역할: ${ROLES[role].name}`, 'sys');
  if (W.practice) A.say('이번 주 보상 횟수를 모두 사용했습니다 · 연습전(보상 없음)', 'warn');
  if (fit) A.say(`역할에 맞는 격 ${fit}개: ${ROLES[role].name} 효과 +${Math.round((W.roleK - 1) * 100)}%`, 'sys');
  if (pocket) A.say(`${pocket.name}(${pocket.cls.name})이(가) 당신을 전담 치유합니다`, 'sys');
  A.banner(`쟁 · ${G.stage.name.replace('쟁 · ', '')}`);
  const btn = document.getElementById('war-sb-btn');
  if (btn) btn.hidden = false;
  document.body.classList.add('war', 'jaeng');
  W.idle = pendingWar.idle;
  warmLooks(W);
}

/** In a body's own camp (three tiles): no PK there, either way. */
function inCamp(W, b) {
  const sp = W.teams[b.team] && W.teams[b.team].spawn;
  return !!sp && Math.abs(b.tx - sp[0]) + Math.abs(b.ty - sp[1]) <= JAENG.campR;
}
/** Every guild's fighters standing (not the hero): the boss's floor and blasts fall on them. */
function jaengBodies() {
  const W = A.G().war, out = [];
  for (const b of W.bodies) if (!b.dead) out.push(b);
  return out;
}
/** A guild's share of the boss's life struck in the last fifteen seconds (0..1). */
function share15(W, team) {
  let all = 0, mine = 0;
  for (const t of W.teamIds) for (const [, n] of W.bossWin[t]) { all += n; if (t === team) mine += n; }
  return all > 0 ? mine / all : 1 / 3;
}
/** The boss's life struck by a guild, counted for its points and for whom the boss turns on. */
function bossShare(W, src, team, n) {
  const G = A.G();
  if (!(team >= 0) || !(n > 0)) return;
  W.bossDmg[team] += n;
  W.bossWin[team].push([G.t, n]);
  if (src) src.bthr = (src.bthr || 0) + n;
}
/** What a guild's blow on the boss is worth: behind, a little more (역습); the seals' gift at its waking. */
function jaengBossK(W, team) {
  let held = 0;
  for (const s of W.seals || []) if (s.owner === team) held++;
  return (W.comeback[team] || 1) * (W.t < W.sealUntil ? 1 + JAENG.sealBuff * (W.sealN[team] || 0) : 1) * (1 + JAENG.sealHold * held) * (team === 0 ? jaengMorale(W) : 1);
}
/** The hero's call standing (W.heroCmd, not while away): its guild's blows +8%. */
function jaengMorale(W) {
  const G = A.G();
  return W.heroCmd && W.heroCmd.until > G.t && !afk() ? JAENG.morale : 1;
}

/** The hunt's update (spawn, game.js) in 「쟁」: the servants, the boss's coming, its fight and floor. */
function bossTick(dt) {
  const G = A.G(), W = G.war;
  if (!W || !W.jaeng || W.over || W.countdown > 1) return;
  const b = W.boss;
  W.spawnT = (W.spawnT || 2) - dt;
  if (W.t >= JAENG.gather && W.spawnT <= 0 && !W.bossDead) {
    W.spawnT = 1.6;
    const cap = b ? 6 + 3 * (G.phase || 0) : 12;
    if (W.mobs.length - (b ? 1 : 0) < cap) {
      const at = mobSpot();
      if (at) A.addEnemy(A.pickMonster(false), null, null, 0, at);
    }
  }
  if (!b && !W.bossDead && !W.bossFled && W.t >= JAENG.bossAt) bossEnter(W);
  if (b && b.hp > 0) {
    A.bossBrain(b, dt, { rageAt: G.t - W.t + JAENG.rage, bodies: () => [G.player].concat(jaengBodies()) });
    if (G.blast && !W.blastPlan) jaengBlastPlan(W, b);
    if (!G.blast) W.blastPlan = null;
    else if (W.blastPlan && W.blastPlan.by && G.t >= W.blastPlan.at) jaengCut(W, b);
    if (W.t >= JAENG.time && !W.over) bossFlee(W, b);
  }
  A.raidMarks();
}

/** A spot for a servant: about the boss's altar, on open ground, away from the camps. */
function mobSpot() {
  const G = A.G(), W = G.war;
  for (let i = 0; i < 30; i++) {
    const a = Math.random() * Math.PI * 2, r = rnd(3, 9);
    const x = Math.round(W.lair[0] + Math.cos(a) * r), y = Math.round(W.lair[1] + Math.sin(a) * r * 0.8);
    if (!open(W, x, y) || !A.free(x, y)) continue;
    if (W.teams.some(t => Math.abs(t.spawn[0] - x) + Math.abs(t.spawn[1] - y) < 6)) continue;
    return [x, y];
  }
  return null;
}

function bossEnter(W) {
  const G = A.G(), p = G.player;
  const at = freeNear(W, W.lair[0], W.lair[1], -1);
  const e = A.addEnemy(G.boss.m, 'boss', G.boss, 0, at);
  if (!e) return;
  // (a larger crowd fells it faster than by its size: more of it reaches the boss while the seals
  // and the other guilds hold the same few; at 16 a guild its life x1.5 keeps the fall at 6~7 minutes)
  // (and by the field's strength against the hero's unit, JAENG.bossPw at the field of a hero of about half its
  // 전투력: a top hero's field, at 0.8 of its unit, let it flee at 6:00 where a middling hero's felled it at 4:15)
  const fieldPw = W.bodies.reduce((a, b) => a + (b.pw || 1), 0) / Math.max(1, W.bodies.length);
  e.hp = e.maxHp = W.U * JAENG.bossU * (W.crowdK || 1) ** 1.4 * clamp(fieldPw / JAENG.bossPw, 0.55, 1.2);
  const yu = A.M().yunit && A.M().yunit[e.m.id], tall = (yu ? yu.foot[1] - 4 : e.m.h) * e.scale;
  e.baseScale = e.scale;
  e.scale *= clamp(150 / Math.max(1, tall), 1, 2.2);
  e.dmg = p.maxHp * 0.16 * A.raidK();
  e.guardT = G.t + 2.5;
  G.aggroT = 0;
  G.bossT = G.t;
  G.raidT = 4;
  G.waveT = G.t + 30;
  G.phase = 0;
  W.bossMax = e.maxHp;
  // The seals' gift: each held 봉인석 strikes the waking boss 15% harder for half a minute.
  for (const t of W.teamIds) W.sealN[t] = W.seals.filter(s => s.owner === t).length;
  W.sealUntil = W.t + JAENG.sealBuffT;
  W.jphase = 'boss';
  W.boss = e;
  A.bossSay('enter');
  A.audio().play('boss');
  G.shake = 0.6;
  const held = W.teamIds.filter(t => W.sealN[t]).map(t => `${W.teams[t].name} ${W.sealN[t]}`).join(', ');
  A.say(`봉인이 풀렸습니다! ${G.boss.name}이(가) 깨어났습니다.${held ? ` 봉인석 해제권: ${held} (30초간 보스 피해 +15%씩)` : ''}`, 'warn');
  A.banner(`${G.boss.name} 각성!`);
  for (const t of W.teamIds) jaengPlan(W, t, true);
}

function bossFlee(W, b) {
  const G = A.G();
  const at = G.enemies.indexOf(b);
  if (at >= 0) G.enemies.splice(at, 1);
  A.leave(b);
  W.bossFled = true;
  W.boss = null;
  G.marks.length = 0;
  G.blast = null;
  A.say(`${G.boss.name}이(가) 달아났습니다… 보스 상자는 없습니다.`, 'warn');
  A.banner(`${G.boss.name} 도주`);
  jaengEnd(W, '보스 도주');
}

/** A servant or the boss falls (game.js killEnemy): no spoils; the boss's fall ends the 「쟁」. */
function mobDown(e) {
  const G = A.G(), W = G.war;
  const at = G.enemies.indexOf(e);
  if (at < 0) return;
  G.enemies.splice(at, 1);
  A.leave(e);
  e.hp = 0;
  if (A.M().fx.h_kill && onScreen(e) && A.fxBudget('kill', 6)) A.fxOn('h_kill', e, { scale: e.kind ? 0.8 : 0.55 });
  G.dying.push({ e, t: 0, kx: 0, ky: 0, fly: false });
  const team = e.lastTeam;
  if (e.kind === 'boss') return bossDown(W, e, team);
  if (team >= 0) {
    W.mobKills[team]++;
    W.pts[team].mob = Math.min(JAENG.pts.mobCap, W.mobKills[team]) * JAENG.pts.mob;
  }
  if (team === 0 && e.lastHero) A.gainXp(e.xp || 2);
}

function bossDown(W, e, team) {
  const G = A.G();
  W.bossDead = true;
  W.boss = null;
  W.killT = W.t;
  W.lastTeam = team;
  if (team >= 0) W.pts[team].last += JAENG.pts.last;
  G.marks.length = 0;
  G.blast = null;
  G.slowmo = 1.2;
  G.shake = 0.8;
  A.bossSay('death');
  A.audio().play('kill');
  const who = team >= 0 ? W.teams[team].name : '?';
  W.feed.push({ t: G.t, a: who + ' 문파', at: team, b: G.boss.name, bt: -1, big: true, gold: true });
  A.banner(`${who} 문파 막타! ${G.boss.name} 처치`);
  A.say(`${who} 문파가 ${G.boss.name}에게 마지막 일격을 넣었습니다! (+${JAENG.pts.last})`, team === 0 ? 'sys' : 'warn');
  // The rest of the field falls with it.
  for (const o of G.enemies.slice()) if (!o.war && o.hp > 0) { o.hp = 0; mobDown(o); }
  A.later(2.4, () => jaengEnd(W, `${G.boss.name} 처치 · ${clock(W.killT)}`));
}

/** A servant's or the boss's turn (game.js moveEnemies): the nearest of any guild, round the walls. */
const MOB_ATK = { timid: 2.4, normal: 1.6, fierce: 1.1 };
function mobAct(e, dt) {
  const G = A.G(), W = G.war, p = G.player;
  e.cd -= dt;
  e.atk -= dt;
  if (W.over || e.guardT > G.t) return;
  let tgt = null;
  if (e.kind === 'boss') {
    const ag = G.aggro;
    if (ag && (ag === p ? !G.dead : !ag.dead && !ag.down)) tgt = ag;
  }
  if (!tgt) {
    const ok = x => x && (x === p ? !G.dead && !(G.buffs.stealth > G.t) : !x.dead && !(x.hidden > G.t));
    if (!ok(e.mt) || G.t > (e.mtT || 0)) {
      e.mtT = G.t + 0.6;
      let best = null, bd = e.kind === 'boss' ? 30 : 8;
      if (e.toff === undefined) e.toff = Math.floor(Math.random() * 3); // (ties on no guild in particular)
      for (let k = 0; k < 3; k++) for (const b of W.alive[(k + e.toff) % 3]) {
        const x = b.hero ? p : b;
        if (!ok(x) || inCamp(W, b)) continue;
        const d = Math.abs(b.tx - e.tx) + Math.abs(b.ty - e.ty);
        if (d < bd) { bd = d; best = x; }
      }
      e.mt = best;
    }
    tgt = e.mt;
  }
  if (!tgt) return;
  const d = Math.abs(tgt.tx - e.tx) + Math.abs(tgt.ty - e.ty);
  if (d <= 1) {
    A.faceTo(e, tgt.tx, tgt.ty);
    if (e.atk <= 0) {
      e.atk = MOB_ATK[e.temper] || 1.6;
      e.lunge = 0.15;
      e.atkAt = G.t;
      const boss = e.kind === 'boss';
      if (tgt === p) A.hurtPlayer(boss ? e.dmg : e.dmg * 0.6, e, boss);
      else {
        if (W.diag) W.diag.mobHits[tgt.team]++;
        raidHurt(tgt, boss ? tgt.maxHp * 0.16 * A.raidK() : tgt.maxHp * e.dmg * 0.6 * 0.8 / heroHpRef(W), e);
      }
    }
    return;
  }
  if (e.cd > 0 || e.stun > 0) return;
  const st = e.stepTime * (e.slow > 0 ? 2 : 1);
  e.cd = st * (0.85 + Math.random() * 0.35);
  const f = flowTo(W, tgt.tx, tgt.ty, -1), cols = W.map.cols, here = f[e.ty * cols + e.tx];
  const opts = [];
  for (const [dx, dy] of DIR4) {
    const nx = e.tx + dx, ny = e.ty + dy;
    if (nx < 0 || ny < 0 || nx >= cols || ny >= W.map.rows) continue;
    const v = f[ny * cols + nx];
    if (v >= 0 && (here < 0 || v < here)) opts.push([dx, dy, v]);
  }
  opts.sort((a, c) => a[2] - c[2]);
  for (const [dx, dy] of opts) if (open(W, e.tx + dx, e.ty + dy) && A.step(e, dx, dy, st)) return;
  if (opts.length && Math.random() < 0.3) { const [dx, dy] = pick(DIR4); if (open(W, e.tx + dx, e.ty + dy)) A.step(e, dx, dy, st); }
}
/** A hero's life at the field's level, for a servant's bite on a fighter (as a raid's). */
function heroHpRef(W) { return (150 + 20 * Math.floor(W.lvRec / 4)) * (1 + 0.08 * A.G().level); }

/**
 * Whom the boss turns on (every six seconds): threat, whatever the guild — a tank six times as
 * likely, more for who struck it lately (×(1 + 3·share)), half again for the guild ahead on it in
 * the last fifteen seconds (the leader draws the boss), a fifth beyond seven tiles. A taunt holds.
 */
function bossAggro(W) {
  const G = A.G(), boss = W.boss;
  if (W.taunted && W.taunted.until > G.t) {
    const by = W.taunted.by;
    if (by.hero ? !G.dead : alive(by)) return by.hero ? G.player : by;
  }
  const top = W.teamIds.reduce((a, t) => (share15(W, t) > share15(W, a) ? t : a), 0);
  const cand = [];
  let sum = 0, thr = 0;
  for (const t of W.teamIds) for (const b of W.alive[t]) thr += b.bthr || 0;
  for (const t of W.teamIds) for (const b of W.alive[t]) {
    if (b.hero && (G.dead || G.buffs.stealth > G.t)) continue;
    if (inCamp(W, b)) continue;
    const role = b.hero ? W.role : b.role;
    let w = (role === 'tank' ? 6 : 1) * (1 + 3 * (thr > 0 ? (b.bthr || 0) / thr : 0)) * (t === top && share15(W, t) > 0.4 ? 1.5 : 1);
    if (boss && d2(b, boss) > 7) w *= 0.2;
    cand.push([b, w]);
    sum += w;
  }
  let r = Math.random() * sum;
  for (const [b, w] of cand) { r -= w; if (r <= 0) return b.hero ? G.player : b; }
  return cand.length ? (cand[0][0].hero ? G.player : cand[0][0]) : null;
}

/** A blast gathering: a guild's supporter or caster with a hold near may cut it (+30 for its guild). */
function jaengBlastPlan(W, b) {
  const G = A.G();
  const cutters = jaengBodies().filter(m => (m.role === 'support' || m.cls.id === 'mage' || m.cls.id === 'magus') && d2(m, b) < 7);
  W.blastPlan = { at: G.t + rnd(0.6, 1.4), by: cutters.length && !G.enraged && Math.random() < 0.3 ? pick(cutters) : null };
  if (W.blastPlan.by) jaengCall(W, W.blastPlan.by.team, 'blast', ['광역기 온다!! 마비!', '광역 모은다! 끊어요!']);
}
function jaengCut(W, b) {
  const G = A.G(), c = W.blastPlan.by;
  W.blastPlan.by = null;
  if (!alive(c) || d2(c, b) >= 8) return;
  G.blast = null;
  b.stun = Math.max(b.stun || 0, 1.2);
  castFx(W, c, SK.m_para ? 'm_para' : null, b, [b]);
  shout(W, c, '마비');
  credit(c, 'obj', 8);
  W.stat.cuts++;
  if (cutOk(W, c.team)) W.pts[c.team].cut += JAENG.pts.cut;
  W.feed.push({ t: G.t, a: c.name, at: c.team, b: '광역기 끊기', bt: -1, gold: true });
  if (c.team === 0) A.say(`${c.name}: 마비! 광역기 끊었어요! (+${JAENG.pts.cut})`, 'party');
}
/** A guild's cut scores once in 25 seconds at most (a hero's holds cut nearly every blast). */
function cutOk(W, team) {
  const at = (W.cutAt = W.cutAt || [-99, -99, -99]);
  if (W.t - at[team] < 25) return false;
  at[team] = W.t;
  return true;
}
/** The hero's own hold cut the blast (game.js cutBlast → raidCut). */
function jaengHeroCut(W) {
  const G = A.G();
  if (afk()) return; // (a hero away cut it by its spells alone: no points)
  if (!cutOk(W, 0)) return;
  W.pts[0].cut += JAENG.pts.cut;
  W.feed.push({ t: G.t, a: W.hero.name, at: 0, b: '광역기 끊기', bt: -1, gold: true });
}

/** A guild leader's word in the guild chat (the hero's guild only, each kind not too often). */
function jaengCall(W, team, kind, lines) {
  if (team !== 0) return false;
  const G = A.G();
  if (G.t - (W.calls[kind] || -99) < 12) return false;
  W.calls[kind] = G.t;
  const who = W.teams[0].squads.map(q => q.leader).find(l => l && !l.dead && !l.hero);
  if (!who) return false;
  const text = pick(lines);
  A.say(`[${W.teams[0].name} 지휘] ${who.name}: ${text}`, 'party');
  who.bubble = { text: text.length > 14 ? text.slice(0, 13) + '…' : text, t: G.t };
  W.chatT = G.t;
  return true;
}

/** Every second: the phases, the seals, the points, the comeback, the boss's threat cooling. */
function jaengTick(W, dt) {
  const G = A.G();
  const old = W.jphase;
  if (W.jphase === 'gather' && W.t >= JAENG.gather) W.jphase = 'seal';
  if (W.jphase === 'boss' && W.t >= JAENG.rage) W.jphase = 'rage';
  if (old !== W.jphase) {
    if (W.jphase === 'seal') { A.banner('봉인전! 봉인석을 차지하라'); A.say('[쟁] 봉인전: 봉인석 셋을 차지하면 점수와, 보스가 깨어날 때 피해 +15%(봉인석마다, 30초), 쥐고 있는 동안 보스 피해 +6%(봉인석마다)를 얻습니다. 내 명령(보스·견제·봉인)이 서 있는 동안 문파 사기 +8%.', 'sys'); }
    if (W.jphase === 'rage') { A.banner('광폭화!'); A.say('[쟁] 광폭화: 보스가 더 세게, 더 자주 광역기를 씁니다. 부활이 10초 늦어집니다.', 'warn'); }
    for (const t of W.teamIds) jaengPlan(W, t, true);
  }
  // The seals: one guild alone in the ring turns it (two at once hold it as it is); a supporter
  // turns it twice as fast.
  if (W.jphase !== 'gather') for (const s of W.seals) {
    const n = W.teamIds.map(() => 0);
    for (const t of W.teamIds) for (const b of W.alive[t]) if (Math.hypot(b.tx - s.x, b.ty - s.y) <= 2.2) n[t] += (b.hero ? W.role : b.role) === 'support' ? 2 : 1;
    const here = W.teamIds.filter(t => n[t] > 0);
    s.contest = here.length > 1;
    if (here.length !== 1) continue;
    const t = here[0];
    if (s.owner === t) { s.prog = 1; s.cap = t; continue; }
    if (s.cap !== t) { s.prog = Math.max(0, s.prog - dt * 0.25 * n[t]); if (s.prog <= 0) { s.cap = t; if (s.owner >= 0) { s.owner = -1; } } continue; }
    s.prog = Math.min(1, s.prog + dt * 0.12 * n[t]);
    for (const b of W.alive[t]) if (Math.hypot(b.tx - s.x, b.ty - s.y) <= 2.2) credit(b.hero ? W.hero : b, 'obj', dt * 2.5);
    if (s.prog >= 1) {
      const lost = s.owner;
      s.owner = t;
      for (const b of W.alive[t]) if (Math.hypot(b.tx - s.x, b.ty - s.y) <= 2.5) credit(b, 'obj', 25);
      W.feed.push({ t: G.t, a: W.teams[t].name, at: t, b: `봉인석(${s.name}) 점령`, bt: -1, gold: true });
      if (t === 0) A.banner(`봉인석(${s.name}) 점령!`);
      if (lost === 0) jaengCall(W, 0, 'sealLost', ['봉인 뺏겼어요ㅠ', `${s.name} 뺏김! 다시 가요`]);
    }
  }
  jshrineTick(W, dt);
  W.tickT = (W.tickT || 0) + dt;
  if (W.tickT >= 1) {
    W.tickT -= 1;
    const per = W.jphase === 'seal' ? JAENG.pts.seal : W.jphase === 'gather' ? 0 : JAENG.pts.sealBoss;
    for (const s of W.seals) if (s.owner >= 0) W.pts[s.owner].seal += per;
    // 역습: a guild behind by a tenth of the leader's points strikes 5% harder, up to 15%.
    const lead = Math.max(...W.score);
    for (const t of W.teamIds) W.comeback[t] = lead > 50 ? 1 + 0.05 * Math.min(3, Math.floor((lead - W.score[t]) / lead * 10)) : 1;
    for (const t of W.teamIds) { const q = W.bossWin[t]; while (q.length && G.t - q[0][0] > 15) q.shift(); }
    // The guilds' blows on each other, cooling over about ten seconds (어부지리).
    for (const r of W.pkHeat) for (let i = 0; i < r.length; i++) r[i] *= 0.9;
  }
  const k = Math.exp(-dt / 4);
  for (const b of W.bodies) b.bthr = (b.bthr || 0) * k;
  W.hero.bthr = (W.hero.bthr || 0) * k;
  const all = W.bossMax || 1;
  for (const t of W.teamIds) {
    W.pts[t].boss = Math.min(JAENG.pts.boss, W.bossDmg[t] / all * JAENG.pts.boss);
    const q = W.pts[t];
    W.score[t] = q.boss + q.last + q.cut + q.seal + q.pk + q.mob + (q.shrine || 0);
  }
}

/** The PK points of a fall: the killer's guild 8, each other guild that helped 3. */
function jaengPk(W, f, by) {
  const G = A.G();
  if (!by || !(by.team >= 0) || by.team === f.team) return;
  W.pts[by.team].pk += JAENG.pts.kill * ((W.rule && W.rule.killPts) || 1) / (W.crowdK || 1);
  if (W.diag) W.diag.pkKills++;
  const dealt = f.dmgBy || new Map(), seen = new Set([by.team]);
  for (const [who, t] of f.hitBy) if (who.team >= 0 && who.team !== f.team && !seen.has(who.team) && G.t - t < 6 && (dealt.get(who) || 0) >= f.maxHp * 0.1) { seen.add(who.team); W.pts[who.team].pk += JAENG.pts.assist / (W.crowdK || 1); }
}
/** How long a fallen one lies: ten seconds and two a fall (five at most), ten more in the rage; a
 * guild ahead a little longer, one behind a little sooner. */
function jaengRise(W, team, deaths) {
  const G = A.G(), others = W.teamIds.filter(t => t !== team), mean = others.reduce((a, t) => a + W.score[t], 0) / others.length;
  return 10 + 2 * Math.min(5, deaths) + (G.enraged ? 10 : 0) + clamp((W.score[team] - mean) / 60, -3, 3);
}

// ------------------------------------------------ 쟁 신단 (엔드게임 2차, 2026-11-28)
// The 「쟁」 had one middle aim, the seals (and the boss): a fourth now wakes on a side way between two camps every 70 seconds
// from 0:50 (8 s warned in the chat, the banner, a white ◆ on the minimap and its ring blinking), the war's 신단 for three:
// one guild alone in its ring takes it in five seconds (more of it faster, the hero ×1.4 — its 서포터 ×1.8; two guilds in it
// hold it as it is; a guild that steps in on another's progress first wears it down), and the guild that takes it has
// 25 points and its gift (투신·금강·청풍, the war's kinds) for 25 seconds. Each guild's commander sends the squad nearest it
// (not the hero's, not those the hero's call holds) from its warning; the hero decides whether its own goes.
function jshrineTick(W, dt) {
  const G = A.G(), s = W.jshrine;
  if (!s || W.over) return;
  for (const t of W.teamIds) {
    const rg = shrineOn(W, t, 'regen');
    if (rg) for (const b of W.alive[t]) if (!b.hero && b.hp < b.maxHp) b.hp = Math.min(b.maxHp, b.hp + b.maxHp * rg * dt);
  }
  const rg0 = shrineOn(W, 0, 'regen');
  if (rg0 && !G.dead) G.player.hp = Math.min(G.player.maxHp, G.player.hp + G.player.maxHp * rg0 * dt * War.heroHealK());
  if (s.state === 'wait' && W.t >= s.at - JSHRINE.warn) {
    if (W.left < 30 || W.jphase === 'gather') return;
    const pool = s.spots.filter(q => !(s.last && q[0] === s.last[0] && q[1] === s.last[1]));
    [s.x, s.y] = pick(pool.length ? pool : s.spots);
    s.kind = pick(Object.keys(SHRINE_KINDS));
    s.state = 'soon';
    s.prog = 0;
    s.capT = -1;
    const K = SHRINE_KINDS[s.kind];
    A.say(`[쟁 신단] ${JSHRINE.warn}초 뒤 ${K.name}이 깨어납니다 — 차지한 문파는 ${JSHRINE.pts}점과 ${JSHRINE.buff}초 동안 ${K.desc} (지도의 ◆)`, 'sys');
    A.banner(`쟁 신단 · ${K.name} · ${JSHRINE.warn}초 뒤`);
  }
  if (s.state === 'soon' && W.t >= s.at) { s.state = 'up'; moment(W, `${SHRINE_KINDS[s.kind].name} 깨어남`, -1, { kind: 'shrineUp' }); }
  if (s.state !== 'up') return;
  if (W.left < 5) { s.state = 'gone'; return; }
  const n = W.teamIds.map(() => 0);
  for (const t of W.teamIds) for (const b of W.alive[t]) if (Math.hypot(b.tx - s.x, b.ty - s.y) <= JSHRINE.r) n[t] += 1;
  const here = W.teamIds.filter(t => n[t] > 0);
  s.contest = here.length > 1;
  if (s.contest) return;
  if (!here.length) { s.prog *= Math.max(0, 1 - dt * 0.5); return; }
  const t = here[0];
  if (s.capT !== t) { s.prog -= dt * 0.5; if (s.prog <= 0) { s.prog = 0; s.capT = t; } return; }
  const heroK = t === 0 && heroIn(W, s.x, s.y, JSHRINE.r) ? (W.role === 'support' ? 1.8 : 1.4) : 1;
  s.prog += dt / JSHRINE.take * (1 + 0.15 * Math.min(4, n[t] - 1)) * heroK * (t === 0 ? 1 + gk(W, 'banner') : 1);
  if (s.prog >= 1) jshrineTaken(W, t);
}
function jshrineTaken(W, team) {
  const G = A.G(), s = W.jshrine, K = SHRINE_KINDS[s.kind], k = W.rule.shrineK || 1;
  W.sbuff[team] = { kind: s.kind, until: G.t + JSHRINE.buff * k + (team === 0 ? gk(W, 'shrine') : 0), k };
  W.pts[team].shrine = (W.pts[team].shrine || 0) + JSHRINE.pts;
  s.state = 'wait';
  s.last = [s.x, s.y];
  s.n++;
  s.at = W.t + s.every;
  s.taken[team]++;
  const heroThere = team === 0 && heroIn(W, s.x, s.y, JSHRINE.r + 0.5);
  for (const b of W.alive[team]) if (Math.hypot(b.tx - s.x, b.ty - s.y) <= JSHRINE.r + 0.5) credit(b.hero ? W.hero : b, 'obj', 25);
  W.feed.push({ t: G.t, a: W.teams[team].name, at: team, b: `${K.short} 신단 차지`, bt: -1, gold: true });
  A.say(`${W.teams[team].name} 문파가 ${K.name}을 차지했습니다! (+${JSHRINE.pts}점 · ${Math.round(JSHRINE.buff * k)}초 ${K.desc})`, team === 0 ? 'sys' : 'warn');
  if (team === 0) A.banner(`${K.name} 획득! +${JSHRINE.pts}점 · ${K.desc}`);
  A.audio().play(team === 0 ? 'levelup' : 'click');
  moment(W, `${W.teams[team].name} · ${K.short} 신단${heroThere ? ' (내가 차지)' : ''}`, team, { hero: heroThere, kind: 'shrine' });
}
/** Each guild's nearest free squad to the 쟁 신단 from its warning (not the hero's, not one the hero's call holds). */
function jshrineOrders(W) {
  const G = A.G(), s = W.jshrine;
  if (!s || (s.state !== 'up' && s.state !== 'soon') || !W.plans) return;
  for (const team of W.teamIds) {
    const P = W.plans[team];
    if (P && P.regroup) continue;
    const T = W.teams[team], hc = team === 0 && W.heroCmd && W.heroCmd.until > G.t;
    const held = hc ? [T.squads[1], T.squads[0]] : [];
    const pool = T.squads.filter(q => q !== W.hero.squad && !held.includes(q) && livingOf(q).length >= 2 && !(q.order && q.order.kind === 'regroup'));
    if (!pool.length) continue;
    const at = q => squadCentre(W, q) || T.spawn;
    pool.sort((a, b) => Math.hypot(at(a)[0] - s.x, at(a)[1] - s.y) - Math.hypot(at(b)[0] - s.x, at(b)[1] - s.y));
    jaengSet(W, team, pool[0], s.x, s.y, 'jshrine', {}, team === 0 && s.state === 'soon' ? `${pool[0].name || '한 분대'} 신단 먹으러 가요!` : null);
  }
}

/** The guilds' orders (B2: the plain plan; jaengPlan is the commander). */
function jaengEnd(W, why) {
  if (W.over) return;
  // (a tie in points went to our guild, the first in teamIds: now the boss's share, then the kills)
  const order = W.teamIds.slice().sort((a, b) => (Math.round(W.score[b]) - Math.round(W.score[a])) || (W.bossDmg[b] - W.bossDmg[a]) || (W.teams[b].kills - W.teams[a].kills));
  W.rank = order;
  finishJaeng(W, order[0], why);
}

/** A squad's order in 「쟁」 (kind: seal, hunt, boss, pk, regroup), said in the chat when ours changes. */
function jaengSet(W, team, sq, x, y, kind, extra = {}, say = null, loud = false) {
  const G = A.G(), [sx, sy] = snap(W, x, y);
  const changed = !sq.order || sq.order.kind !== kind || sq.order.team !== extra.team || Math.abs(sq.order.x - sx) + Math.abs(sq.order.y - sy) > 3;
  const at = W.boss || { tx: W.lair[0], ty: W.lair[1] };
  sq.order = { x: sx, y: sy, kind, obj: extra.obj || null, team: extra.team, seal: extra.seal, face: [Math.sign(at.tx - sx), Math.sign(at.ty - sy)] };
  if (W.diag) W.diag.orders[kind] = (W.diag.orders[kind] || 0) + 1;
  if (changed && say && team === 0 && (loud || G.t - W.cmdSaid > 8)) {
    W.cmdSaid = G.t;
    W.chatT = G.t;
    A.say(`[${W.teams[0].name} 지휘] ${say}`, 'party');
  }
}

/**
 * A guild's commander (design §6.1): once a second the squads on the boss follow it; every ten
 * seconds (and at each turn of the fight) a plan from the boss, the guilds' last fifteen seconds
 * on it, the points, the seals and its own living:
 *   봉인전 — two squads to the nearest seals, one on the servants; a squad sent at a guild on our seal;
 *   보스전 — two on the boss, one keeping a seal; 견제: a guild with 45% of the boss lately while we
 *   are not first — a squad on its dealers and healers; 어부지리: the other two fighting each other
 *   — everyone on the boss; the boss below 8% — everyone on it (the last blow); four or fewer
 *   standing — back to the camp to gather; 광폭화 — the first guild keeps one squad on the boss and
 *   sends the others at the second, the rest go all in.
 * The hero's command (보스 집중 / 견제 / 봉인, W.heroCmd) holds the hero's squad and the first for 20 s.
 */
function jaengPlan(W, team, loud = false) {
  const G = A.G(), T = W.teams[team], sqs = T.squads, sp = T.spawn;
  const P = (W.plans = W.plans || [])[team] || (W.plans[team] = { t: 0, regroup: false });
  const boss = W.boss;
  // Between plans: squads on the boss follow it, squads on a guild follow that guild.
  if (!loud && G.t < P.t) {
    for (const q of sqs) {
      const o = q.order;
      if (!o) continue;
      if (o.kind === 'boss' && boss) q.order = { ...o, x: boss.tx, y: boss.ty, obj: boss, via: false };
      else if (o.kind === 'pk') { const c = centroid(W, o.team, boss); if (c) q.order = { ...o, x: c[0], y: c[1], via: false }; }
    }
    return;
  }
  P.t = G.t + rnd(8, 12);
  const set = (q, x, y, kind, extra, say) => jaengSet(W, team, q, x, y, kind, extra, say, loud);
  const toBoss = (q, say) => set(q, boss.tx, boss.ty, 'boss', { obj: boss }, say);
  const toSeal = (q, s, say) => set(q, s.x, s.y, 'seal', { seal: s.i }, say);
  const toPk = (q, t, say) => { const c = centroid(W, t, boss) || W.teams[t].spawn; set(q, c[0], c[1], 'pk', { team: t }, say); };
  const others = W.teamIds.filter(t => t !== team);
  const name = t => W.teams[t].name;
  const nearSeals = W.seals.slice().sort((a, b) => Math.hypot(a.x - sp[0], a.y - sp[1]) - Math.hypot(b.x - sp[0], b.y - sp[1]));
  const standing = W.alive[team].length;
  // The hero's own call holds its squad (and the first) while it lasts.
  const hc = team === 0 && W.heroCmd && W.heroCmd.until > G.t ? W.heroCmd : null;
  const held = hc ? [sqs[1], sqs[0]] : [];
  const free = sqs.filter(q => !held.includes(q));
  if (hc) {
    for (const q of held) {
      if (hc.kind === 'boss' && boss) toBoss(q);
      else if (hc.kind === 'pk') toPk(q, hc.team);
      else if (hc.kind === 'seal') toSeal(q, hc.seal ? W.seals[hc.seal.i] : nearSeals.find(s => s.owner !== 0) || nearSeals[0]);
      else if (hc.kind === 'boss') toSeal(q, nearSeals[0]);
    }
  }
  // Few left standing: back to the camp, gather, go again.
  if (P.regroup ? standing < 8 : standing <= 4 && W.t > JAENG.gather) {
    if (!P.regroup && W.diag) W.diag.regroup++;
    P.regroup = true;
    for (const q of free) set(q, sp[0], sp[1], 'regroup', {}, q === free[0] ? '다 누웠어요, 진영에서 모였다 다시 가요!' : null);
    P.t = G.t + 4;
    return;
  }
  P.regroup = false;
  if (!boss) {
    // 봉인전: two seals, the servants; a guild come for a seal we hold is driven off.
    const raid = W.seals.find(s => s.owner === team && W.teamIds.some(t => t !== team && countNear(W, t, s.x, s.y, 4) >= 2));
    const slots = free.slice();
    if (raid) {
      const by = others.reduce((a, t) => (countNear(W, t, raid.x, raid.y, 4) > countNear(W, a, raid.x, raid.y, 4) ? t : a));
      toPk(slots.shift(), by, `${name(by)}이(가) ${raid.name} 노려요! 막아요!`);
    }
    const want = nearSeals.filter(s => s.owner !== team).concat(nearSeals.filter(s => s.owner === team));
    for (const s of want.slice(0, Math.max(0, slots.length - 1))) toSeal(slots.shift(), s, s === want[0] ? `${s.name} 봉인석 먹어요!` : null);
    for (const q of slots) set(q, (W.lair[0] + sp[0]) / 2, (W.lair[1] + sp[1]) / 2, 'hunt', {}, null);
    return;
  }
  const bk = hpk(boss);
  const order = W.teamIds.slice().sort((a, b) => W.score[b] - W.score[a]);
  const first = order[0] === team, second = order[1];
  // The last of its life: everyone on it.
  if (bk <= 0.08) {
    for (const q of free) toBoss(q, q === free[0] ? '보스 딸피! 다 모여요!' : null);
    return;
  }
  // 광폭화: ahead, keep the lead (one on the boss, the rest at the second guild); behind, all in.
  if (G.enraged) {
    if (first && W.score[team] - W.score[second] > 60) {
      free.forEach((q, i) => (i === 0 ? toBoss(q) : toPk(q, second, i === 1 ? `1등 지켜요! ${name(second)} 막아요!` : null)));
    } else for (const q of free) toBoss(q, q === free[0] ? '광폭화! 끝까지 딜 넣어요!' : null);
    return;
  }
  // 어부지리: the other two at each other — all on the boss.
  const [o1, o2] = others;
  const feud = (W.pkHeat[o1][o2] || 0) + (W.pkHeat[o2][o1] || 0);
  if (feud > W.refHp * 5) {
    if (W.diag) W.diag.vulture++;
    for (const q of free) toBoss(q, q === free[0] ? `${name(o1)}·${name(o2)} 싸운다! 그 틈에 보스 몰아요!` : null);
    return;
  }
  // 견제: one guild taking the boss (45% of it lately) while we are not first — a squad on it.
  const hog = others.find(t => share15(W, t) >= 0.5);
  const slots = free.slice();
  if (hog !== undefined && !first) {
    if (W.diag) W.diag.check++;
    toPk(slots.pop(), hog, `${name(hog)} 딜러 끊어요!`);
  } else if (slots.length > 2 || (slots.length === 2 && !hc)) {
    // A seal kept (its points and next waking's gift): the nearest not ours, or ours.
    const s = nearSeals.find(x => x.owner !== team) || nearSeals[0];
    toSeal(slots.pop(), s, null);
  }
  for (const q of slots) toBoss(q, q === slots[0] ? '보스 잡아요! 탱 먼저!' : null);
}

/** Where a guild's fighters stand (those about the boss first), or null. */
function centroid(W, t, boss) {
  let n = 0, x = 0, y = 0;
  const list = W.alive[t].filter(b => !boss || d2(b, boss) < 8);
  for (const b of (list.length >= 2 ? list : W.alive[t])) { if (inCamp(W, b)) continue; x += b.tx; y += b.ty; n++; }
  return n ? [Math.round(x / n), Math.round(y / n)] : null;
}
function countNear(W, t, x, y, r) {
  let n = 0;
  for (const b of W.alive[t]) if (Math.abs(b.tx - x) + Math.abs(b.ty - y) <= r) n++;
  return n;
}

/**
 * A fighter's thought in 「쟁」 (§6.2): the red floor first; then by its squad's order — at the boss
 * as a raider (thinkJaengBoss), striking back only at one of another guild that is on it; sent at a
 * guild, the war's fight limited to that guild (its dealers dive the healers); on a seal or the
 * servants, the war's fight about the spot.
 */
function thinkJaeng(W, b) {
  const order = myOrder(W, b);
  if (dodge(W, b)) return;
  b.only = order.kind === 'pk' ? order.team : undefined;
  // (전술: a 후퇴 or a 집중 of the hero's takes its fighters off the boss — think.)
  const tac = b.team === 0 && W.tac && ((W.tac.regroup && W.tac.regroup.who.has(b)) || tacFocus(W, b));
  // The hero hunted: a few of each other guild's blades go for it wherever it is out of its camp (think holds the target).
  if (heroHunt(W, b)) { think(W, b); b.only = undefined; return; }
  if (b.role !== 'healer' && order.kind === 'boss' && W.boss && W.boss.hp > 0 && b.state !== 'retreat' && !tac) {
    // At the boss: one of another guild on it (or on its healer, for a tank) is struck first;
    // the rest of the crowd is left be, or the boss is never struck.
    let close = nearestFighter(W, b, 2);
    let onMe = close && (close.target === b || (b.role === 'tank' && close.target && close.target.team === b.team && close.target.role === 'healer'));
    // A strong hero (heroMark) by the boss is gone for by the other guilds' blades near it, now and then — as a server's
    // 랭커 is (it stood among them at the boss untouched: 0 deaths in every 「쟁」, balance runs).
    const G = A.G(), hm = heroMark(W);
    if (!onMe && hm > 0 && b.team !== 0 && !G.dead && !unseenHid(W.hero) && !inCamp(W, W.hero) && d2(b, W.hero) <= 6 && G.t >= (b.markT || 0)) {
      b.markT = G.t + 2.5;
      if (Math.random() < 0.45 * hm) { close = W.hero; onMe = true; b.tWhy = 'mark'; }
    }
    if (!onMe) { thinkJaengBoss(W, b, order); b.only = undefined; return; }
    b.target = close;
    b.retargetT = A.G().t + 2;
  }
  think(W, b);
  b.only = undefined;
}
/**
 * 「쟁」's hunters (2026-11-28): each other guild keeps JAENG.hunters of its blades (one more while our guild leads, more
 * by heroMark) on the hero while it is out of its camp within 10 tiles of them, for six seconds at a time. The mark alone
 * turned a blade near the boss now and then: the hero was struck 0~400 times in a 「쟁」 against the others' 2~3천
 * and fell 0~1 times, hiding among the boss's crowd (balance runs).
 */
function heroHunt(W, b) {
  const G = A.G(), h = W.hero;
  if (b.team === 0 || b.role === 'healer' || b.state === 'retreat' || G.dead || W.aiOnly || W.t < JAENG.gather || inCamp(W, h) || unseenHid(h)) return false;
  if (b.target === h && b.tWhy === 'hunt' && G.t < (b.retargetT || 0) && d2(b, h) <= 12) return true;
  if (d2(b, h) > 10 || G.t < (b.huntAskT || 0)) return false;
  b.huntAskT = G.t + 1.5;
  const lead = W.score[0] >= Math.max(...W.score.filter((x, i) => i !== 0)) && W.t > JAENG.bossAt;
  const want = JAENG.hunters + (lead ? 1 : 0) + Math.floor(Math.max(0, heroMark(W) - JAENG.heroMark - (lead ? JAENG.heroLead : 0)));
  const n = W.alive[b.team].filter(m => m.target === h && m.tWhy === 'hunt' && G.t < (m.retargetT || 0)).length;
  if (n >= want) return false;
  b.target = h;
  b.tWhy = 'hunt';
  b.retargetT = G.t + 6;
  if (W.diag) W.diag.hunt = (W.diag.hunt || 0) + 1;
  return true;
}
function nearestFighter(W, b, r) {
  let best = null, bd = r;
  for (const e of foesOf(W, b.team)) {
    if (unseenHid(e)) continue;
    const d = d2(b, e);
    if (d <= bd && !inCamp(W, e)) { bd = d; best = e; }
  }
  return best;
}

/** At the boss (as a raider: thinkRaid), its tanks taking the boss from another guild's. */
function thinkJaengBoss(W, b, order) {
  const G = A.G(), boss = W.boss;
  const k = hpk(b);
  if (b.state !== 'retreat' && k < retreatAt(b, 0.2, 0.3)) {
    b.state = 'retreat';
    chat(W, b, 'low', ['피 없어요 빠질게요!', '힐 좀요!!', '잠깐 빠짐'], { every: 10, p: 0.5 });
  }
  if (b.state === 'retreat') {
    if (k > 0.7) b.state = 'go';
    else {
      let healer = null, hd = 12;
      for (const m of W.alive[b.team]) if (m.role === 'healer' && m !== b && !m.hero && d2(m, b) < hd) { hd = d2(m, b); healer = m; }
      b.dest = healer ? snap(W, healer.tx, healer.ty + 1) : W.teams[b.team].spawn;
      const t = nearest(W, b, b.kit.range + 0.5);
      if (t) act(W, b, t);
      return;
    }
  }
  if (b.role === 'support') supportBuffs(W, b);
  let t = boss;
  if (b.role === 'tank') {
    // The boss on another guild's tank (or on no tank of ours): ours takes it back.
    const ag = G.aggro;
    const ours = ag && (ag === G.player ? b.team === 0 && W.role === 'tank' && !G.dead : !ag.dead && ag.team === b.team && ag.role === 'tank');
    if (!ours && b.cd.c <= 0 && d2(b, boss) < 6) raidTaunt(W, b);
  }
  const close = nearest(W, b, 1.5);
  if (close && close !== boss && !close.war && Math.random() < 0.7) t = close;
  b.target = t;
  // 막타: below an eighth of its life a dealer holds its great blow for the last of it.
  if (b.role === 'dps' && t === boss && hpk(boss) < 0.12 && hpk(boss) > 0.05 && b.cd.d < 1) b.cd.d = 1;
  const dist = d2(b, t), reach = reachOf(b, t);
  if (b.kit.range > 1) {
    if (dist < (t.kind === 'boss' ? 2.8 : 2)) {
      const ax = Math.sign(b.tx - t.tx) || pick([-1, 1]), ay = Math.sign(b.ty - t.ty) || pick([-1, 1]);
      b.dest = snap(W, b.tx + ax * 3, b.ty + ay * 2);
    } else if (dist > reach) b.dest = snap(W, t.tx + Math.round((b.tx - t.tx) / dist * (reach - 1)), t.ty + Math.round((b.ty - t.ty) / dist * (reach - 1)));
    else b.dest = null;
  } else if (dist > reach) b.dest = bladeDest(W, b, t, reach);
  else b.dest = null;
  if (dist <= reach + 0.5) act(W, b, t);
}

/** The end of a 「쟁」: the guilds ranked; rewards (finishJaeng). */
function finishJaeng(W, win, why) {
  const G = A.G();
  if (W.over) return;
  W.over = true;
  W.win = win;
  W.why = why;
  if (W.cmds) { if (W.cmds.cur) cmdEnd(W, W.cmds); W.cmds.ask = null; cmdPanel(W); }
  const rows = board(W);
  const mine = rows.filter(x => x.b.team === 0);
  const rank = mine.findIndex(x => x.b === W.hero);
  const { tier, k: tierK } = tierOf(W, rows);
  const place = W.rank.indexOf(0);
  W.result = { win, why, tier, tierK, rank: rank + 1, rows, place, rewards: jaengRewards(W, place, tier) };
  W.result.league = leagueAfter(W, { place: place + 1, tier });
  G.over = true;
  document.getElementById('levelup').hidden = true;
  G.choosing = false;
  A.audio().play(place === 0 ? 'levelup' : 'lose');
  A.say(`쟁 종료 — ${W.teams[win].name} 문파 1위 (${why}). 우리 문파 ${place + 1}위`, place === 0 ? 'sys' : 'warn');
  setTimeout(() => showResult(W), 1400);
}

// ------------------------------------------------ 「쟁」 on the screen

/** The seals' rings and 연's blue progress ring, the camps' rings (under the bodies). */
function drawJaengGround(G, W, ctx) {
  const ring = (x, y, r, color, a = 0.85) => {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.globalAlpha = a;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x * TILE + TILE / 2, y * TILE + TILE / 2, r * TILE, r * TILE * 0.62, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  };
  for (const t of W.teams) ring(t.spawn[0], t.spawn[1], JAENG.campR, t.color, 0.5);
  const js = W.jshrine;
  if (js && (js.state === 'up' || js.state === 'soon')) {
    const K = SHRINE_KINDS[js.kind];
    ring(js.x, js.y, JSHRINE.r, js.state === 'soon' ? '#ffffff' : js.contest ? (Math.floor(G.t * 6) % 2 ? '#ffd040' : K.col) : K.col, js.state === 'soon' ? 0.4 + 0.3 * Math.sin(G.t * 8) : 0.85);
  }
  const ringPic = A.pic('prop/war_sealring.png');
  for (const s of W.seals) {
    const col = s.owner >= 0 ? W.teams[s.owner].color : '#d8d8d8';
    ring(s.x, s.y, 2.2, s.contest ? (Math.floor(G.t * 6) % 2 ? '#ffd040' : col) : col);
    // 연's own ring round what is being taken, swept as far as it has turned.
    if (s.cap >= 0 && s.prog > 0 && s.prog < 1 && ringPic && ringPic.width) {
      const cx = s.x * TILE + TILE / 2, cy = s.y * TILE + TILE / 2 + 4, R = 30;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, R + 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * s.prog);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(ringPic, cx - R, cy - R, R * 2, R * 2);
      ctx.restore();
    }
  }
}

/** The props of a 「쟁」: the boss's altar, its seal and chained totems while it sleeps, the 봉인석. */
function jaengProps(W, out) {
  const L = W.lair, x = L[0] * TILE + TILE / 2, y = L[1] * TILE + TILE - 6;
  out.push({ war: true, wprop: 'jp', name: 'war_bossaltar', x, y: y - 8, flat: true });
  if (!W.boss && !W.bossDead && !W.bossFled) {
    out.push({ war: true, wprop: 'jp', name: 'war_bossmark', x, y: y - 6, flat: true, k: 0.8 });
    out.push({ war: true, wprop: 'jp', name: 'war_totem', x: x - TILE * 1.6, y });
    out.push({ war: true, wprop: 'jp', name: 'war_totem_r', x: x + TILE * 1.6, y });
  }
  for (const s of W.seals) out.push({ war: true, wprop: 'jp', name: s.stone, x: s.x * TILE + TILE / 2, y: s.y * TILE + TILE - 6, label: `봉인석 · ${s.name}`, s });
  for (const t of W.teams) out.push({ war: true, wprop: 'jp', name: 'war_brazier', x: t.spawn[0] * TILE + TILE / 2 + TILE * 1.5, y: t.spawn[1] * TILE + TILE - 10, k: 0.7, label: `${t.name} 진영`, team: t.id });
}
function drawJaengProp(W, b) {
  const ctx = A.ctx, im = A.pic(`prop/${b.name}.png`);
  if (im && im.width) {
    const k = b.k || 1, w = Math.round(im.width * k), h = Math.round(im.height * k);
    ctx.drawImage(im, Math.round(b.x - w / 2), Math.round(b.flat ? b.y - h / 2 : b.y - h), w, h);
  }
  if (b.label) drawLabel(b.label, b.x, b.y + 12, b.s ? (b.s.owner >= 0 ? teamCol('name', b.s.owner) : '#efe3c2') : teamCol('name', b.team), '10px G9');
}

/** The top of the screen in 「쟁」: three guilds' points in one bar, the clock and the phase under it. */
function jaengHud(G, W, ctx, cw, ch, u, d) {
  const left = Math.max(0, Math.ceil(W.left));
  const boxW = 54 * u, boxH = 18 * u, bx = cw / 2 - boxW / 2, by0 = 4 * u;
  const room = cw / 2 - 27 * u - 4 * u - 196 * d;
  const barW = Math.min(190 * u, cw / 2 - boxW / 2 - 12 * u, Math.max(room, 60 * d));
  // The three guilds side by side on both sides of the clock: ours on the left, the two others on
  // the right, each a third of the bar by its share of the points.
  const tot = Math.max(1, W.score.reduce((a, s) => a + s, 0));
  const xL = bx - 4 * u - barW, xR = bx + boxW + 4 * u;
  const bar = (x, w, t) => {
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(x - u, by0 - u, w + 2 * u, 16 * u);
    ctx.fillStyle = 'rgba(60,60,60,0.8)';
    ctx.fillRect(x, by0, w, 7 * u);
    ctx.fillStyle = teamCol('bar', t);
    ctx.fillRect(x, by0, w * clamp(W.score[t] / Math.max(tot, 300), 0, 1), 7 * u);
  };
  bar(xL, barW, 0);
  const half = (barW - 3 * u) / 2;
  bar(xR, half, 1);
  bar(xR + half + 3 * u, half, 2);
  ctx.font = `${Math.round(9 * u)}px G9`;
  const lead = W.score.indexOf(Math.max(...W.score));
  const tag = t => `${lead === t && W.score[t] > 0 ? '♛' : ''}${W.teams[t].name} ${Math.round(W.score[t])}`;
  ctx.textAlign = 'left';
  hudText(tag(0), xL + 2 * u, by0 + 14 * u, teamCol('name', 0));
  hudText(tag(1), xR + 2 * u, by0 + 14 * u, teamCol('name', 1));
  hudText(tag(2), xR + half + 5 * u, by0 + 14 * u, teamCol('name', 2));
  ctx.fillStyle = '#e8dcc0';
  ctx.fillRect(bx, by0 - 2 * u, boxW, boxH);
  ctx.fillStyle = '#3a2a18';
  ctx.fillRect(bx + u, by0 - u, boxW - 2 * u, boxH - 2 * u);
  ctx.fillStyle = '#f4ead2';
  ctx.fillRect(bx + 2 * u, by0, boxW - 4 * u, boxH - 4 * u);
  ctx.font = `bold ${Math.round(12 * u)}px G11`;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#2a1a0a';
  ctx.fillText(`${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`, cw / 2, by0 + 11 * u);
  const ph = { gather: '집결', seal: `봉인전 · 각성까지 ${Math.max(0, Math.ceil(JAENG.bossAt - W.t))}초`, boss: '보스전', rage: '광폭화' }[W.jphase] || '';
  const seals = W.seals.map(s => (s.owner >= 0 ? ['●', '◆', '▲'][s.owner] : '◌') + s.name).join(' ');
  ctx.font = `${Math.round(10 * u)}px G9`;
  const lowY = W.boss ? ch - 10 * u : 32 * u;
  const js = W.jshrine, jb = W.sbuff && W.sbuff[0];
  const jsl = js && js.state === 'soon' ? ` · ◆ 신단 ${Math.max(0, Math.ceil(js.at - W.t))}초 뒤` : js && js.state === 'up' ? ` · ◆ ${SHRINE_KINDS[js.kind].short} 신단${js.contest ? ' 다툼!' : js.capT >= 0 && js.prog > 0.02 ? ` ${js.capT === 0 ? '우리' : W.teams[js.capT].name} ${Math.round(js.prog * 100)}%` : ''}` : '';
  const jbl = jb && jb.until > G.t ? ` · 우리 ${SHRINE_KINDS[jb.kind].short} ${Math.ceil(jb.until - G.t)}초` : '';
  hudText(`${ph} · 봉인석 ${seals}${jsl}${jbl}${W.comeback[0] > 1 ? ` · 역습 +${Math.round((W.comeback[0] - 1) * 100)}%` : ''}${W.heroCmd && W.heroCmd.until > G.t ? ` · 명령: ${W.heroCmd.label} ${Math.ceil(W.heroCmd.until - G.t)}초${jaengMorale(W) > 1 ? ` (사기 +${Math.round((JAENG.morale - 1) * 100)}%)` : ''}` : ''}`, cw / 2, lowY, '#ffd27a');
  // What to do now, one line (the phase's objective and what it is worth): the seals before the
  // boss wakes, then the boss's share and the PK on the guild ahead.
  const goal = jaengGoal(W);
  if (goal) { ctx.font = `${Math.round(9 * u)}px G9`; hudText(goal, cw / 2, W.boss ? lowY - 13 * u : lowY + 13 * u, '#fff4c8'); }
}

/** The 「쟁」's objective now, for the HUD. */
function jaengGoal(W) {
  const mine = W.seals.filter(s => s.owner === 0).length, lead = W.teamIds.filter(t => t !== 0).reduce((a, t) => (W.score[t] > W.score[a] ? t : a), 1);
  const pk = `PK ${Math.round(W.pts[0].pk)}점`;
  if (W.jphase === 'gather') return `목표: ${clockWords(Math.max(0, Math.ceil(JAENG.gather - W.t)))} 뒤 봉인석으로 · 봉인석 하나마다 보스 피해 +${Math.round(JAENG.sealBuff * 100)}%`;
  if (W.jphase === 'seal') return `목표: 봉인석 차지 (우리 ${mine}/3, 초당 ${JAENG.pts.seal}점) · 다른 문파를 끊으면 처치 +${JAENG.pts.kill} · ${pk}`;
  const share = Math.round(W.bossDmg[0] / (W.bossMax || 1) * 100);
  const ahead = W.score[lead] > W.score[0];
  return `목표: 보스 딜 몫 ${share}% (합 ${JAENG.pts.boss}점) · 봉인석 ${mine}/3(+${Math.round(mine * JAENG.sealHold * 100)}%) · 막타 +${JAENG.pts.last}${ahead ? ` · ${W.teams[lead].name} 견제(앞섬 +${Math.round(W.score[lead] - W.score[0])})` : ''} · ${pk}`;
}

/** Under the boss's bar (game.js #bossbar): each guild's share of its life struck, in its colour. */
function jaengShares(W) {
  const G = A.G();
  let el = document.getElementById('jaeng-share');
  const bar = document.getElementById('bossbar');
  if (!bar) return;
  if (!el) {
    el = document.createElement('div');
    el.id = 'jaeng-share';
    bar.append(el);
  }
  if (!W || !W.jaeng || !W.boss) { el.hidden = true; return; }
  el.hidden = false;
  const all = W.bossMax || 1;
  if (G.t - (W.shareT || -9) < 0.25) return;
  W.shareT = G.t;
  el.innerHTML = W.teamIds.map(t => `<i style="width:${(W.bossDmg[t] / all * 100).toFixed(1)}%;background:${teamCol('bar', t)}"></i>`).join('')
    + `<span>${W.teamIds.map(t => `${W.teams[t].name} ${Math.round(W.bossDmg[t] / all * 100)}%`).join(' · ')}</span>`;
}


// ------------------------------------------------ 「쟁」 from the board, the hero's commands

/** The board's 「쟁」 card: this week's boss and arena, the paid ones left, what opens it. */
function jaengCard(cls, pr) {
  const tier = A.promo ? A.promo(cls.id) : 0, wk = jaengWeek(tier);
  const raid = A.RAIDS.find(r => r.id === wk.raid) || {}, boss = (raid.boss || {}).name || raid.name;
  const st = jaengState(pr), left = Math.max(0, JAENG_PAID - st.paid);
  const all = new URLSearchParams(location.search).has('all');
  const locked = !all && !((pr.cleared || {}).royal && (pr.war || {}).won >= 1);
  const gate = (A.SINSU_GATE[wk.sinsu] || [])[0], open = !gate || (pr.raids || {})[gate];
  return {
    jaeng: true, id: 'jaeng', name: '쟁', title: `월드 보스 · ${boss}`, locked, practice: !left, wk,
    desc: `${JAENG_MAPS[wk.map].name}에 봉인된 ${boss}을(를) 세 문파(${bigOn('jaeng') ? 16 : 12}명씩)가 다툰다. ${clockWords(JAENG.bossAt)} 봉인전(봉인석 셋) 뒤 보스가 깨어나고, 보스에 넣은 피해 몫(합 ${JAENG.pts.boss}점)·막타(+${JAENG.pts.last})·봉인석·PK(처치 ${JAENG.pts.kill}, 도움 ${JAENG.pts.assist})·광역기 끊기(+${JAENG.pts.cut})로 순위를 가린다. ${clockWords(JAENG.time)}이면 보스가 달아난다.`,
    more: `이번 주 보상 ${left}/${JAENG_PAID}회 남음 (월요일 초기화) · 보상: 레이드주화 · ${open ? A.MATS[wk.sinsu].name : `겁화의 파편 (${A.raidName(gate)}을 깨면 ${A.MATS[wk.sinsu].name})`} · 전 · 1위 보스 상자(${boss} 세트 한 부위 50%, 코디 30%) · 막타 상자`
      + (locked ? '<br><b style="color:#ff9a8a">왕궁 정복 + 문파대항전 1승 시 해금</b>' : ''),
  };
}
function jaengCardHtml(cls, pr) {
  const c = jaengCard(cls, pr), pic = img('ui_img_sinsu_4') ? 'assets/hud/ui_img_sinsu_4.png' : '';
  return `<button class="wb-card${pickWar === 'jaeng' ? ' on' : ''}" data-war="jaeng">${pic ? `<img src="${pic}" alt="" style="filter:hue-rotate(250deg)">` : ''}<b>쟁 · 월드 보스</b>${c.title.replace('월드 보스 · ', '')}<br><small>${c.locked ? '잠김 · 왕궁 정복 + 대항전 1승' : `이번 주 보상 ${Math.max(0, JAENG_PAID - jaengState(pr).paid)}/${JAENG_PAID}회`}</small></button>`;
}

/** The hero's command (the 보스 / 견제 / 봉인 keys): its squad and the first follow it for 20 seconds. */
function heroCommand(kind) {
  const G = A.G(), W = G && G.war;
  if (!W || !W.jaeng || W.over || G.dead || (W.countdown || 0) > 1) return;
  if (G.t - (W.heroCmdT || -99) < 10) return;
  W.heroCmdT = G.t;
  const others = W.teamIds.filter(t => t !== 0);
  const target = others.reduce((a, t) => (share15(W, t) + W.score[t] / 5000 > share15(W, a) + W.score[a] / 5000 ? t : a));
  const p = G.player;
  const seal = W.seals.filter(s => s.owner !== 0).sort((a, b) => Math.hypot(a.x - p.tx, a.y - p.ty) - Math.hypot(b.x - p.tx, b.y - p.ty))[0];
  const label = { boss: '보스 집중', pk: `견제(${W.teams[target].name})`, seal: '봉인' }[kind];
  W.heroCmd = { kind: kind === 'boss' && !W.boss ? 'seal' : kind, team: target, seal, until: G.t + 20, label };
  if (W.diag) W.diag.heroCmds = (W.diag.heroCmds || 0) + 1;
  const text = { boss: '다들 보스 쳐요!', pk: `${W.teams[target].name} 딜러 끊으러 가요!`, seal: `${seal ? seal.name : ''} 봉인석 먹으러 가요!` }[kind];
  G.bubble = { text, t: G.t };
  A.say(`${W.hero.name}: ${text}`, 'party');
  W.chatT = G.t;
  jaengPlan(W, 0, true);
  const near = W.alive[0].filter(b => !b.hero && (b.squad === W.squads[1] || b.squad === W.squads[0]));
  answers(W, near, ['ㅇㅋ', '갑니다!', '넵', 'ㄱㄱ'], 2);
  document.querySelectorAll('.jaeng-cmd').forEach(k => { k.classList.add('cool'); setTimeout(() => k.classList.remove('cool'), 10000 / Math.max(1, A.settings().speed || 1)); });
}

// ------------------------------------------------ 「쟁」's spoils

/** This week's 「쟁」 for the progress: three paid a week (from Monday, as the 괴력난신), then practice. */
export function jaengState(pr, week = gwoeWeek()) {
  const s = pr.bosspk = pr.bosspk || { week, played: 0, paid: 0, won: 0, last: 0, best: null, total: 0 };
  if (s.week !== week) { s.week = week; s.paid = 0; }
  return s;
}
export const JAENG_PAID = 3;

/**
 * The spoils (design §8), by the guild's place and the hero's own tier (S..C, its contribution
 * against its role's middle, whatever the place): 레이드주화 10 × the boss's rung × 1 / 0.6 / 0.4, the
 * week's 사신수 성물 3 / 2 / 1 + tier (겁화의 파편 until its own raid is won, as the 대항전), gold
 * 2500 / 1500 / 1000 + 700 a tier; the first guild's boss chest (a piece of the boss's raid set
 * half the time, a costume a third) when the boss fell; the last blow's chest (+20 coins and a
 * 성물). Practice past three a week pays nothing.
 */
function jaengRewards(W, place, tier) {
  const G = A.G(), pr = A.progress();
  const st = jaengState(pr);
  st.played = (st.played || 0) + 1;
  st.total = (st.total || 0) + 1;
  if (place === 0) st.won = (st.won || 0) + 1;
  if (W.lastTeam === 0) st.last = (st.last || 0) + 1;
  if (!st.best || 'SABC'.indexOf(tier) < 'SABC'.indexOf(st.best)) st.best = tier;
  if (W.practice || st.paid >= JAENG_PAID) { A.saveProgress(); return { practice: true }; }
  st.paid++;
  const tierN = { S: 4, A: 3, B: 2, C: 1 }[tier];
  const lv = G.level;
  const out = { coins: Math.round(10 * lv * [1, 0.6, 0.4][place]), gold: [2500, 1500, 1000][place] + tierN * 700, items: [] };
  const sinsu = W.week.sinsu, gate = (A.SINSU_GATE[sinsu] || [])[0];
  out.matId = !gate || (pr.raids || {})[gate] ? sinsu : 'kalpa';
  out.mats = [3, 2, 1][place] + tierN;
  if (W.lastTeam === 0) { out.coins += 20; out.mats += 1; out.lastChest = true; }
  pr.coins = (pr.coins || 0) + out.coins;
  pr.gold = (pr.gold || 0) + out.gold;
  pr.mats = pr.mats || {};
  pr.mats[out.matId] = (pr.mats[out.matId] || 0) + out.mats;
  if (place === 0 && W.bossDead) {
    out.chest = true;
    // A piece of the raid's set the hero lacks (any when it has all), half the time.
    if (Math.random() < 0.5) {
      const b = A.bag(G.cls);
      const set = A.raidSet(W.raidId, G.cls.id).map(([kind, name]) => ({ kind, name, tier: A.raidTier(W.raidId, G.cls.id, kind) }));
      const missing = set.filter(g => !b.includes(`${g.kind}:${g.tier}`));
      const pool = missing.length ? missing : set;
      if (pool.length) {
        const g = pick(pool);
        A.pickGear({ kind: g.kind, tier: g.tier });
        out.items.push(g.name);
      }
    }
    if (Math.random() < 0.3) { dropCostume([1, 2], '쟁 보스 상자'); out.items.push('코디'); }
  }
  A.saveProgress();
  return out;
}

function showJaengResult(W) {
  const G = A.G(), r = W.result, box = document.getElementById('war-result');
  document.body.classList.remove('jaeng'); // (the command keys go with the fight)
  const won = r.place === 0;
  const hud = n => (img(n) ? `assets/hud/${n}.png` : '');
  const medal = (label, value, icon) => `<div class="wr-medal">${hud('ui_icon_medal01') ? `<img class="wr-mbg" src="${hud('ui_icon_medal01')}" alt="">` : ''}
    ${icon ? `<img class="wr-mic" src="${icon}" alt="">` : ''}<b>${label}</b><span>${value}</span></div>`;
  const rw = r.rewards || {};
  const all = W.bossMax || 1;
  const rows = W.rank.map((t, i) => {
    const q = W.pts[t];
    return `<tr class="t${t}${t === 0 ? ' me' : ''}"><td>${i + 1}위</td><td>${W.teams[t].name}${W.lastTeam === t ? ' ⚔막타' : ''}</td><td>${Math.round(W.score[t])}</td>
      <td>${Math.round(W.bossDmg[t] / all * 100)}%</td><td>${Math.round(q.boss)}</td><td>${Math.round(q.last)}</td><td>${Math.round(q.seal)}</td><td>${Math.round(q.pk)}</td><td>${Math.round(q.cut)}</td><td>${Math.round(q.mob)}</td></tr>`;
  }).join('');
  const medals = rw.practice ? '<div class="wr-sub">연습전 — 이번 주 보상 3회를 모두 받았습니다 (월요일에 초기화)</div>'
    : `<div class="wr-medals">${medal('레이드주화', '+' + rw.coins, '')}${medal(A.MATS[rw.matId] ? A.MATS[rw.matId].name : '성물', '+' + rw.mats, A.matPicture ? A.matPicture(rw.matId) : '')}${medal('전', '+' + (rw.gold || 0).toLocaleString(), '')}${medal('등급', r.tier, '')}</div>
      <div class="wr-sub">${rw.chest ? `보스 상자: ${rw.items.length ? rw.items.join(', ') : '꽝 (다음 기회에)'} · ` : ''}${rw.lastChest ? '막타 상자: 레이드주화 +20, 성물 +1 · ' : ''}<small>주화 10×${G.level}×${[1, 0.6, 0.4][r.place]} · 성물 ${[3, 2, 1][r.place]}+등급 · 전 ${[2500, 1500, 1000][r.place]}+등급×700</small></div>`;
  box.innerHTML = `<div class="wr-title" style="${hud('ui_ink_nine') ? `background-image:url(${hud('ui_ink_nine')})` : ''}">${won ? '쟁탈 1위' : `${r.place + 1}위`}</div>
    <div class="wr-stage" style="${hud('ui_light02') ? `background-image:url(${hud('ui_light02')})` : ''}">
      <img class="wr-hero" src="${heroShot(G) || A.heroPicture(G.cls)}" alt="">
      ${hud(won ? 'ui_attack_result_win' : 'ui_attack_result_lose') ? `<img class="wr-flag" src="${hud(won ? 'ui_attack_result_win' : 'ui_attack_result_lose')}" alt="">` : ''}</div>
    <div class="wr-sub">${W.def.title} — ${r.why}<br>내 기여: 문파 ${r.rank}위 · ${ROLES[W.role].name} · 등급 <b class="wr-tier">${r.tier}</b> <small>(같은 역할 중간의 ×${r.tierK.toFixed(2)}${W.afkT > 1 ? ` · 자리비움 ${Math.round(W.afkT)}초` : ''})</small></div>
    <table class="jr-guilds"><tr><th>순위</th><th>문파</th><th>점수</th><th>보스 몫</th><th>보스</th><th>막타</th><th>봉인</th><th>PK</th><th>끊기</th><th>부하</th></tr>${rows}</table>
    ${momentsHtml(W)}${leagueHtml(r.league)}
    ${medals}
    ${tables(W, r.rows)}
    <div class="row" style="justify-content:center;display:flex;gap:8px"><button class="btn" id="wr-again">다시 출전</button><button class="btn" id="wr-town">마을로</button></div>`;
  heroLookShot(G, box);
  document.getElementById('wr-town').onclick = () => leaveWar(false);
  document.getElementById('wr-again').onclick = () => leaveWar(true);
  A.showScreen('war-result');
}

// ---------------------------------------------------------------- drawing

function drawMap(camX, camY) {
  const G = A.G(), W = G.war, m = W.map, ctx = A.ctx, VW = A.VW(), VH = A.VH();
  if (window.__dbgWar && window.__dbgWar.nomap) {
    ctx.fillStyle = '#000';
    ctx.fillRect(camX, camY, VW, VH);
    return;
  }
  const c = m.chunk;
  // Into the ground's buffer (game.js drawGroundCached): painted again only as the view leaves it.
  A.drawGroundCached(`war:${W.def.map || W.def.id}`, camX, camY, (g, x0, y0, w, h) => {
    let ok = true;
    for (let cy = Math.max(0, Math.floor(y0 / c)); cy * c < Math.min(m.h, y0 + h); cy++)
      for (let cx = Math.max(0, Math.floor(x0 / c)); cx * c < Math.min(m.w, x0 + w); cx++) {
        const path = `ywar/${W.def.map || W.def.id}_${cx}_${cy}.${m.ext || 'png'}`, im = mapBms.get(path) || A.images[path];
        if (!im || !im.width) { ok = false; continue; }
        const sx = Math.max(0, Math.floor(x0 - cx * c)), sy = Math.max(0, Math.floor(y0 - cy * c));
        const sw = Math.min(im.width - sx, Math.ceil(x0 + w - cx * c - sx) + 1), sh = Math.min(im.height - sy, Math.ceil(y0 + h - cy * c - sy) + 1);
        if (sw > 0 && sh > 0) g.drawImage(im, sx, sy, sw, sh, cx * c + sx, cy * c + sy, sw, sh);
      }
    return ok;
  });
  // Test (__dbgWar.walls): the walk grid's closed tiles over the map, to hold against its walls.
  if (window.__dbgWar && window.__dbgWar.walls) {
    ctx.save();
    ctx.fillStyle = 'rgba(255,0,0,0.3)';
    ctx.strokeStyle = 'rgba(255,0,0,0.6)';
    for (let y = Math.max(0, Math.floor(camY / TILE)); y * TILE < camY + VH && y < m.rows; y++)
      for (let x = Math.max(0, Math.floor(camX / TILE)); x * TILE < camX + VW && x < m.cols; x++)
        if (!m.walk[y * m.cols + x]) { ctx.fillRect(x * TILE, y * TILE, TILE, TILE); ctx.strokeRect(x * TILE + 0.5, y * TILE + 0.5, TILE - 1, TILE - 1); }
    ctx.restore();
  }
}

/** Under the bodies: the flags' circles, the cart, the gate's doors, the crates, the posts. */
function drawGround() {
  const G = A.G(), W = G.war, ctx = A.ctx;
  composeTick();
  if (W.raid) return drawRaidGround(G, W, ctx);
  const ring = (x, y, r, color, k = 1) => {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x * TILE + TILE / 2, y * TILE + TILE / 2, r * TILE, r * TILE * 0.62, 0, 0, Math.PI * 2 * k);
    ctx.stroke();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  };
  // 신단 · 충차: the ring that counts, as a 거점's (what is seen is what counts).
  const sh = W.shrine;
  if (sh && (sh.state === 'up' || sh.state === 'soon')) {
    const col = SHRINE_KINDS[sh.kind].col;
    ring(sh.x, sh.y, SHRINE.r, sh.contest ? (Math.floor(G.t * 6) % 2 ? '#ffd040' : col) : sh.state === 'soon' && Math.floor(G.t * 3) % 2 ? '#ffffff' : col);
    if (Math.abs(sh.prog) > 0.01) {
      ctx.save();
      ctx.strokeStyle = sh.prog < 0 ? '#58e868' : '#ff4a3a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(sh.x * TILE + TILE / 2, sh.y * TILE + TILE / 2, SHRINE.r * TILE + 3, SHRINE.r * TILE * 0.62 + 3, 0, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, Math.abs(sh.prog)));
      ctx.stroke();
      ctx.restore();
    }
  }
  if (W.ram && W.ram.state === 'up') ring(W.ram.x / TILE - 0.5, (W.ram.y + 6) / TILE - 1, 2.5, W.attacker === 0 ? '#58e868' : '#ff4a3a');
  if (W.flags) for (const f of W.flags) {
    const col = f.owner === 0 ? '#58e868' : f.owner === 1 ? '#ff4a3a' : '#d8d8d8';
    ring(f.x, f.y, 2.2, f.contest ? (Math.floor(G.t * 6) % 2 ? '#ffd040' : col) : col);
    // The progress round the ring.
    if (f.prog > -1 && f.prog < 1) {
      ctx.save();
      ctx.strokeStyle = f.prog < 0 ? '#58e868' : '#ff4a3a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(f.x * TILE + TILE / 2, f.y * TILE + TILE / 2, 2.2 * TILE + 3, 2.2 * TILE * 0.62 + 3, 0, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.abs(f.prog));
      ctx.stroke();
      ctx.restore();
    }
  }
  for (const z of W.zones) ring(z.x, z.y, 1.5, z.owner === 0 && G.t < z.until ? '#58e868' : z.owner === 1 && G.t < z.until ? '#ff4a3a' : '#9ad8ff');
  // A 진영대장 winding up: the floor under its reach flashes red (연's danger telegraph).
  if (W.jaeng) drawJaengGround(G, W, ctx);
  for (const t of W.teams) {
    const w = t.cmd && t.cmd.wind;
    if (!w) continue;
    const blink = Math.floor(G.t * 10) % 2;
    ctx.save();
    ctx.fillStyle = blink ? 'rgba(230,30,20,0.45)' : 'rgba(230,30,20,0.25)';
    for (let x = w.x - w.r; x <= w.x + w.r; x++)
      for (let y = w.y - w.r; y <= w.y + w.r; y++)
        if (Math.hypot(x - w.x, y - w.y) <= w.r) ctx.fillRect(x * TILE + 1, y * TILE + 1, TILE - 2, TILE - 2);
    ctx.restore();
  }
  if (W.cart) {
    // The road ahead, a dotted line to the end.
    ctx.save();
    ctx.fillStyle = 'rgba(255,200,80,0.35)';
    for (let i = Math.ceil(W.cart.i); i < W.path.length; i += 2) {
      const [x, y] = W.path[i];
      ctx.fillRect(x * TILE + TILE / 2 - 2, y * TILE + TILE / 2 - 2, 4, 4);
    }
    ctx.restore();
    ring(W.cart.tx, W.cart.ty, 3, W.attacker === 0 ? '#58e868' : '#ff4a3a');
  }
}

/** A raid's arena: the floor beyond its edge darkened, a ring where the fallen get up. */
function drawRaidGround(G, W, ctx) {
  const p = G.player, VW = A.VW(), VH = A.VH(), x0 = p.x - VW, y0 = p.y - VH, x1 = p.x + VW, y1 = p.y + VH;
  const aw = W.map.w, ah = W.map.h;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  if (x0 < 0) ctx.fillRect(x0, y0, -x0, y1 - y0);
  if (x1 > aw) ctx.fillRect(aw, y0, x1 - aw, y1 - y0);
  if (y0 < 0) ctx.fillRect(Math.max(0, x0), y0, Math.min(aw, x1) - Math.max(0, x0), -y0);
  if (y1 > ah) ctx.fillRect(Math.max(0, x0), ah, Math.min(aw, x1) - Math.max(0, x0), y1 - ah);
  const [cx, cy] = W.camp;
  ctx.save();
  ctx.strokeStyle = '#9ad8ff';
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(cx * TILE + TILE / 2, cy * TILE + TILE / 2, 3 * TILE, 3 * TILE * 0.62, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  drawTaskMarks(G, W, ctx);
  drawRageRings(G, ctx);
}

/** Every war body drawn in the field's order: fighters as their class, units in 연's sheets. */
function drawBody(b) {
  const G = A.G(), W = G.war, ctx = A.ctx;
  if (b.gate || !onScreen(b) || (window.__dbgWar && window.__dbgWar.nobody)) return;
  const dbg = window.__dbgWar || {};
  if (b.wprop) return dbg.noprop ? null : drawWarProp(W, b);
  if (W.tac && !W.raid) drawTacMark(W, b);
  const alpha = (b.hidden > G.t ? 0.4 : b.lurk > G.t ? (b.team === 0 ? 0.6 : 0.45) : 1) * overAlpha(W, b);
  const pose = b.poseT > 0 ? b.pose : b.moving ? 'walk' : 'idle';
  let top = 50;
  if (dbg.noframe) top = 50;
  else if (b.cls) {
    if (b.cue && G.t - b.cue.t < 0.5 && !dbg.nocue) drawCue(ctx, b, G.t - b.cue.t);
    if (b.gear && b.gear.glow && !b.dead && !dbg.noglow) drawGlow(ctx, b, b.gear.glow);
    drawFighter(b, b.x, b.y, pose, alpha) || A.drawYhero2(b.cls, b.gear, b, b.x, b.y, pose, alpha) || A.drawYhero(b.cls.id, b.gear ? b.gear.armor : 0, b, b.x, b.y, pose, alpha);
    top = 50;
  } else {
    const yu = b.unit && A.yunit({ id: b.unit });
    if (yu) {
      const an = A.yunitAnim(yu.u, b);
      if (an) drawUnit(yu, b, an.a.row, an.f, an.dx > 0, alpha);
      top = Math.min(110, (yu.u.foot[1] - 8) * b.scale);
    }
  }
  if (dbg.nooverlay) return;
  // Bar and team marker (연's ▼, green for us, red for them) in one kept picture by step of
  // health; the name under the feet.
  // The ▼ from one shared picture per side, the bar in plain rectangles.
  const mk = markerPic(b.team), bw = b.cmdr ? 44 : 24, k = Math.max(0, b.hp / b.maxHp);
  const bx = Math.round(b.x - bw / 2), by = Math.round(b.y - top - 2);
  // A raid has no sides to tell apart: no ▼ over its raiders.
  if (mk && !W.raid) { const s = b.cmdr ? 1.4 : 1; ctx.drawImage(mk, Math.round(b.x - mk.width * s / 2), by - Math.round(mk.height * s) - 1, Math.round(mk.width * s), Math.round(mk.height * s)); }
  ctx.fillStyle = '#000';
  ctx.fillRect(bx - 1, by, bw + 2, 4);
  ctx.fillStyle = teamCol('bar', b.team);
  ctx.fillRect(bx, by + 1, Math.round(bw * k), 2);
  if (b.shield > G.t) { ctx.fillStyle = '#9ad8ff'; ctx.fillRect(bx, by + 3, bw, 1); }
  ctx.font = '8px G7';
  ctx.textAlign = 'center';
  const nameCol = b.cmdr ? '#ffd040' : b.leader ? teamCol('lead', b.team) : teamCol('name', b.team);
  // Level of detail: names near the hero (and the leaders' and 진영대장's) only.
  const dh = d2(b, W.hero);
  if (b.troop ? dh < 4 : (dh < 8 || b.leader || b.cmdr)) {
    // The name, outlined once into a small picture and kept (four fillTexts a name a frame added up).
    const key = b.name + nameCol + (b.rank || '');
    let lab = labels.get(key);
    if (!lab) {
      lab = document.createElement('canvas');
      const g = lab.getContext('2d');
      g.font = '8px G7';
      // 칭호: the rank's star after the name (★ in the rank's colour, its number small beside it).
      const tw = Math.ceil(g.measureText(b.name).width), sw = b.rank ? 17 : 0;
      const w = tw + sw + 4;
      lab.width = w;
      lab.height = 12;
      g.font = '8px G7';
      g.textAlign = 'left';
      g.fillStyle = '#000';
      for (const [dx, dy] of [[1, 0], [0, 1], [1, 1]]) g.fillText(b.name, 2 + dx, 9 + dy);
      g.fillStyle = nameCol;
      g.fillText(b.name, 2, 9);
      if (b.rank) {
        const x0 = 2 + tw + 2;
        g.font = 'bold 10px G9';
        g.fillStyle = '#000';
        for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [-1, 0]]) g.fillText('★', x0 + dx, 10 + dy);
        g.fillStyle = RANK_COL[b.rank - 1];
        g.fillText('★', x0, 10);
        g.font = 'bold 7px G7';
        g.fillStyle = '#000';
        g.fillText(String(b.rank), x0 + 11, 11);
        g.fillStyle = RANK_COL[b.rank - 1];
        g.fillText(String(b.rank), x0 + 10, 10);
      }
      if (labels.size > 400) labels.clear();
      keep(labels, key, lab);
    }
    ctx.drawImage(lab, Math.round(b.x - lab.width / 2), Math.round(b.y + 9 - 9));
  }
  if (b.carry) {
    const im = A.pic('prop/war_cart3.png');
    drawLabel('보급', b.x, b.y - top - 18, '#ffd27a');
  }
  // 분대 전술 over its leader (ours always; another's 매복 only once it springs).
  if (b.leader && b.squad && !W.raid && !b.carry) {
    const tg = sqTag(b.squad);
    if (tg && (b.team === 0 || tg !== SQ_TAC.ambush)) drawLabel(`${b.squad.name} · ${tg.name}`, b.x, b.y - top - 18, tg.col);
  }
  if (b.bubble && dh < 8 && G.t - b.bubble.t < 1.4 && G.t >= b.bubble.t) A.drawBubble(b.bubble.text, b.x, b.y - top - 14, G.t - b.bubble.t);
  if (b.emo && dh < 9) drawEmo(b, b.y - top - (b.bubble && G.t - b.bubble.t < 1.4 ? 38 : 10));
  // Held: 연's own stun icon over the head (a word over every held fighter of a crowd was a wall of text).
  if (b.stun > 0.3) {
    const im = A.images['hud/st_icon_stun.png'];
    if (im && im.width) ctx.drawImage(im, Math.round(b.x - 5), Math.round(b.y - top - 26), 10, 10);
  }
}

// The caster's cue (castFx): a soft glow of its side's colour, flat on the ground under it, swelling
// and fading over half a second; one small kept picture a side, laid on additively.
const cuePics = [null, null, null];
function drawCue(ctx, b, t) {
  const team = b.team === 0 ? 0 : b.team === 2 ? 2 : 1;
  let pic = cuePics[team];
  if (!pic) {
    pic = cuePics[team] = document.createElement('canvas');
    pic.width = 64;
    pic.height = 64;
    const g = pic.getContext('2d'), col = ['90,255,120', '255,90,60', '200,120,255'][team];
    const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    gr.addColorStop(0, `rgba(${col},0.95)`);
    gr.addColorStop(0.45, `rgba(${col},0.55)`);
    gr.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
  }
  const k = b.cue.k, grow = 0.6 + 0.8 * Math.min(1, t / 0.18), w = 58 * k * grow, h = w * 0.42;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = (t < 0.1 ? 1 : 1 - (t - 0.1) / 0.4) * 0.9;
  ctx.drawImage(pic, Math.round(b.x - w / 2), Math.round(b.y - 2 - h / 2), Math.round(w), Math.round(h));
  // and a column of light rising over it for a great one
  if (k >= 1) {
    const ch = 70 * Math.min(1, t / 0.12);
    ctx.globalAlpha *= 0.55;
    ctx.drawImage(pic, Math.round(b.x - 9), Math.round(b.y - ch), 18, Math.round(ch));
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

/**
 * Keeps a composited picture, and swaps it for an ImageBitmap once one is made: a bitmap stays on
 * the GPU, while a plain canvas drawn into the field is uploaded again at every draw — with fifty
 * fighters that upload was most of a frame.
 */
function keep(map, key, c) {
  map.set(key, c);
  if (window.createImageBitmap) createImageBitmap(c).then(bm => { if (map.get(key) === c) map.set(key, bm); }).catch(() => {});
}
/** A body's frame kept cropped to what is drawn (most of a cell is empty): { pic, ox, oy }.
 *  `c` is the one canvas every frame is drawn on (composeCanvas): only the drawn box is copied out,
 *  into a canvas of its own size, then into a bitmap of it (that canvas emptied at once). A war makes
 *  some 3000 frames in its opening count: a canvas of the whole cell each (and the box first drawn
 *  from it) was some 300 MB of canvases left for the collector — a phone's WebView was killed there. */
function keepFrame(key, c) {
  const g = c.getContext('2d', { willReadFrequently: true }), W = c.width, H = c.height;
  const d = new Uint32Array(g.getImageData(0, 0, W, H).data.buffer);
  // The drawn box: rows from the top and bottom, then columns only within those rows.
  const AM = 0xff000000; // alpha, little-endian
  let y0 = 0, y1 = H - 1, x0 = W, x1 = -1;
  const rowEmpty = y => { for (let i = y * W, e = i + W; i < e; i++) if (d[i] & AM) return false; return true; };
  while (y0 < H && rowEmpty(y0)) y0++;
  while (y1 > y0 && rowEmpty(y1)) y1--;
  if (y0 < H) {
    for (let y = y0; y <= y1; y++) {
      const r = y * W;
      for (let x = 0; x < x0; x++) if (d[r + x] & AM) { x0 = x; break; }
      for (let x = W - 1; x > x1; x--) if (d[r + x] & AM) { x1 = x; break; }
    }
  }
  const box = x1 >= x0 ? { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } : { x: 0, y: 0, w: 1, h: 1 };
  const crop = document.createElement('canvas');
  crop.width = box.w;
  crop.height = box.h;
  crop.getContext('2d').drawImage(c, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
  const e = { pic: crop, sx: 0, sy: 0, w: box.w, h: box.h, ox: box.x, oy: box.y };
  framesMade++;
  if (frames.size > FRAMES_MAX) dropFrame(frames.keys().next().value);
  frames.set(key, e);
  lookAny.set(key.slice(0, key.indexOf('|')), key);
  if (window.createImageBitmap) {
    createImageBitmap(crop).then(bm => {
      if (e.pic === crop && frames.get(key) === e) e.pic = bm; else bm.close();
      crop.width = crop.height = 0;
    }).catch(() => {});
  }
  return e;
}
/** A kept frame let go (the oldest, past FRAMES_MAX; a war left): its bitmap or canvas emptied now. */
function dropFrame(key) {
  const e = frames.get(key);
  frames.delete(key);
  freePic(e && e.pic);
}
function freePic(pic) {
  if (!pic) return;
  if (pic.close) pic.close();
  else if (pic.getContext) pic.width = pic.height = 0;
}
/** A kept frame drawn with its top left at (x, y) of the cell. */
function blit(ctx, e, x, y) {
  ctx.drawImage(e.pic, e.sx, e.sy, e.w, e.h, x + e.ox, y + e.oy, e.w, e.h);
}
const markers = [null, null, null];
// The ▼'s tint for each guild: ours green (hue turned), the first foe as 연 draws it (red), the third
// violet — 연's own arrow under a colour filter, as the 5차 icons are tinted (no new picture).
const MARK_TINT = ['hue-rotate(115deg) saturate(1.3) brightness(1.15)', null, 'hue-rotate(275deg) saturate(1.2) brightness(1.2)'];
function markerPic(team) {
  team = team === 2 ? 2 : team === 0 ? 0 : 1;
  if (markers[team]) return markers[team];
  const im = img('ui_event_red_arrow');
  if (!im) return null;
  const c = document.createElement('canvas');
  c.width = 9;
  c.height = 13;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = true;
  g.drawImage(MARK_TINT[team] ? A.tinted(im, MARK_TINT[team]) : im, 0, 0, 9, 13);
  markers[team] = c;
  if (window.createImageBitmap) createImageBitmap(c).then(bm => { markers[team] = bm; }).catch(() => {});
  return c;
}
/** Outlined words kept as pictures (four fillTexts a word a frame added up over a field). */
function drawLabel(text, x, y, color, font = '8px G7') {
  const key = text + color + font;
  let lab = labels.get(key);
  if (!lab) {
    lab = document.createElement('canvas');
    const g = lab.getContext('2d');
    g.font = font;
    const w = Math.ceil(g.measureText(text).width) + 4, h = parseInt(font.match(/(\d+)px/)[1], 10) + 4;
    lab.width = w;
    lab.height = h;
    g.font = font;
    g.textAlign = 'center';
    g.fillStyle = '#000';
    for (const [dx, dy] of [[1, 0], [0, 1], [1, 1]]) g.fillText(text, w / 2 + dx, h - 3 + dy);
    g.fillStyle = color;
    g.fillText(text, w / 2, h - 3);
    if (labels.size > 400) labels.clear();
    keep(labels, key, lab);
    lab = labels.get(key);
  }
  A.ctx.drawImage(lab, Math.round(x - lab.width / 2), Math.round(y - lab.height + 3));
}
const plates = new Map();
function plateFor(team, step, shield, big) {
  const key = team + '|' + step + '|' + shield + '|' + big;
  let c = plates.get(key);
  if (c) return c;
  const im = img('ui_event_red_arrow');
  const k = big ? 1.8 : 1.3, mw = Math.round(7 * k), mh = Math.round(10 * k), bw = big ? 44 : 24;
  c = document.createElement('canvas');
  c.width = bw + 2;
  c.height = mh + 6;
  const g = c.getContext('2d');
  const tint = MARK_TINT[team === 2 ? 2 : team === 0 ? 0 : 1];
  if (im) g.drawImage(tint ? A.tinted(im, tint) : im, Math.round((bw + 2 - mw) / 2), 0, mw, mh);
  g.fillStyle = '#000';
  g.fillRect(0, mh + 1, bw + 2, 4);
  g.fillStyle = teamCol('bar', team);
  g.fillRect(1, mh + 2, Math.round(bw * step / 12), 2);
  if (shield) { g.fillStyle = '#9ad8ff'; g.fillRect(1, mh + 4, bw, 1); }
  keep(plates, key, c);
  return c;
}

/** A 연 unit's frame (guards, the 진영대장), with its shadow, kept the same way. */
function drawUnit(yu, b, row, f, mirror, alpha) {
  const { u, im } = yu, [cw, ch] = u.cell, [fx, fy] = u.foot, s = b.scale || 1;
  const key = b.unit + '|' + row + '|' + f + (mirror ? 'm' : '');
  let c = frames.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = Math.ceil(cw * s);
    c.height = Math.ceil(ch * s);
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.globalAlpha = 0.3;
    g.fillStyle = '#000';
    g.beginPath();
    g.ellipse(mirror ? (cw - fx) * s : fx * s, fy * s - 1, Math.max(6, (u.foot_w || 16) * s * 0.6), 3.5 * s, 0, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
    if (mirror) { g.translate(cw * s, 0); g.scale(-1, 1); }
    const cols = u.cols || 1e9;
    g.drawImage(im, (f % cols) * cw, (row + Math.floor(f / cols)) * ch, cw, ch, 0, 0, cw * s, ch * s);
    c = keepFrame(key, c);
  }
  const ctx = A.ctx, [kx, ky] = kick(b);
  ctx.globalAlpha = alpha;
  const bx = Math.round(b.x + kx - (mirror ? cw - fx : fx) * s), by = Math.round(b.y + ky - fy * s);
  blit(ctx, c, bx, by);
  blitFlash(ctx, b, c, bx, by, alpha);
  ctx.globalAlpha = 1;
}

// A fighter's frame with all its layers composited once (per class, outfit, row and frame) and
// kept: one drawImage a fighter instead of six, and the shadow from one small picture.
const frames = new Map(), labels = new Map(), lookAny = new Map();
let framesMade = 0;
let shadowPic = null;
const drawFighterKey = (b, pose) => drawFighter(b, 0, 0, pose, 1, true);
/**
 * Composited frames cost: a war's fifty fighters wear some twenty looks of about fifty frames
 * each, every look drawn from five to seven sheets of 642x1339. Drawn from their <img>, the sheets
 * were decoded on the spot, and with a hundred of them the browser's cache of decoded pictures
 * could not keep them: each new frame decoded its sheets again - the first seconds of a war were
 * seconds of decoding (a stutter of a second and more on a phone).
 * Now each look's frames are made ahead, as soon as the war is set (warmLooks): its sheets are
 * decoded once, off the main thread, into bitmaps (fetch + createImageBitmap), all its frames made
 * from them a few milliseconds a frame, the bitmaps let go; the canvases are made in their own
 * memory (willReadFrequently: the crop's read back is a copy, not a wait on the GPU). Meanwhile,
 * and whenever a frame is still missing, a fighter shows a frame it has (the last it showed), and
 * a frame of play makes new ones for a few milliseconds at most.
 */
const COMPOSE_MS = 3, WARM_MS = 20, FRAMES_MAX = 3600;
let composeMs = 0, warmGen = 0;
const warming = new Set();
const nowMs = () => performance.now();
/** Called once a drawn frame (drawGround): the budget of frames made in play starts again. */
function composeTick() { composeMs = 0; }
function lookOf(cls, gear) {
  const H = A.M().yhero2 && A.M().yhero2[cls.id];
  const yv2 = H && aiVariants(cls, gear || {});
  return yv2 ? { cls, yv2, yvKey: cls.id + JSON.stringify(yv2), H } : null;
}
function lookFrames(H) {
  const out = [];
  for (const order of ['idle', 'walk', 'atk', 'cast', 'dead'])
    for (const [name, a] of Object.entries(H.anims)) {
      if (!name.startsWith(order)) continue;
      for (let f = 0; f < a.n; f++) for (const m of name.endsWith('_side') ? [false, true] : [false]) out.push([a, f, m]);
    }
  return out;
}
const nextFrame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
/** A sheet decoded off the main thread (its <img> drawn into a canvas decodes it on the spot). */
function sheetBitmap(path) {
  if (!window.createImageBitmap || !window.fetch) return Promise.resolve(null);
  return fetch('assets/' + path).then(r => (r.ok ? r.blob() : null)).then(bl => (bl ? createImageBitmap(bl) : null)).catch(() => null);
}
/** The looks of the war's fighters made ahead (warmLooks), nearest the hero first. */
function warmLooks(W) {
  const G = A.G(), seen = new Map();
  for (const b of W.bodies) {
    if (!b.cls) continue;
    const L = lookOf(b.cls, b.gear);
    if (!L) continue;
    b.yv2 = L.yv2; b.yvKey = L.yvKey;
    const d = Math.abs(b.tx - G.player.tx) + Math.abs(b.ty - G.player.ty);
    const had = seen.get(L.yvKey);
    if (!had) seen.set(L.yvKey, Object.assign(L, { d }));
    else had.d = Math.min(had.d, d);
  }
  warmGen++;
  warming.clear();
  warmQueue.length = 0;
  // A class's looks one after another (they share their body, head and many a piece: each sheet
  // decoded once and closed when the next look does not draw from it), the class nearest the hero first.
  const near = new Map();
  for (const L of seen.values()) near.set(L.cls.id, Math.min(near.has(L.cls.id) ? near.get(L.cls.id) : 1e9, L.d));
  for (const L of [...seen.values()].sort((x, y) => near.get(x.cls.id) - near.get(y.cls.id) || (x.cls.id < y.cls.id ? -1 : x.cls.id > y.cls.id ? 1 : 0) || x.d - y.d)) wantLook(L);
}
/** A look queued to be made (any of its frames missing): the fighter shows nothing, or the frame it
 *  showed last, until it is. A frame wanted in play is never made there from sheets loaded for it:
 *  each look's sheets (five to seven of 1200x1800) held at once for the field's forty looks were
 *  over a gigabyte decoded. */
const warmQueue = [];
let warmRunning = false;
function wantLook(L) {
  if (warming.has(L.yvKey)) return;
  if (!lookFrames(L.H).some(([a, f, m]) => !frames.has(L.yvKey + '|' + a.row + '|' + f + (m ? 'm' : '')))) return;
  warming.add(L.yvKey);
  warmQueue.push(L);
  if (!warmRunning) runWarm();
}
async function runWarm() {
  warmRunning = true;
  const gen = warmGen, G = A.G();
  const paths = L => Object.entries(L.yv2).map(([kind, v]) => [kind, L.H.layers[kind] && L.H.layers[kind][v]]).filter(x => x[1]).map(([kind, meta]) => [kind, 'yhero2/' + meta.file]);
  const bms = new Map();
  const want = L => { for (const [, p] of paths(L)) if (!bms.has(p)) bms.set(p, sheetBitmap(p)); };
  // (one look's sheets at a time, and only those the next look draws from kept on: a sheet a later
  // look draws from is decoded again then — kept for every look still queued, and the next look's
  // decoded meanwhile, the sheets held were 150 to 320 MB at a war's start)
  const still = p => !!warmQueue[0] && paths(warmQueue[0]).some(([, q]) => q === p);
  try {
    while (warmQueue.length) {
      // (the hero's own look first: its sheets and these together were the war's highest moment)
      for (let n = 0; n < 40 && A.heroBusy && A.heroBusy(); n++) { await nextFrame(); if (gen !== warmGen || A.G() !== G) return; }
      const L = warmQueue.shift();
      want(L);
      const src = {};
      for (const [kind, p] of paths(L)) src[kind] = await bms.get(p);
      if (gen !== warmGen || A.G() !== G) return;
      const list = lookFrames(L.H);
      for (let j = 0; j < list.length;) {
        // Most of it in the opening count (the field stands still: a slower frame there is not
        // seen), the rest a little a frame.
        const t0 = nowMs(), budget = G.war && G.war.countdown > 0 ? WARM_MS : COMPOSE_MS * 0.7;
        while (j < list.length && nowMs() - t0 < budget) { const [a, f, m] = list[j++]; composeFrame(L.H, L, a, f, m, true, src); }
        if (j < list.length) { await nextFrame(); if (gen !== warmGen || A.G() !== G) return; }
      }
      warming.delete(L.yvKey);
      // The sheets the next look does not draw from: closed now.
      for (const [p, pr] of [...bms]) if (!still(p)) { bms.delete(p); const bm = await pr; if (bm && bm.close) bm.close(); }
      await nextFrame();
    }
  } finally {
    warmRunning = false;
    for (const [, pr] of bms) pr.then(bm => bm && bm.close && bm.close());
    if (gen !== warmGen) { if (warmQueue.length) runWarm(); } else { warming.clear(); warmQueue.length = 0; }
  }
}
/** The one canvas every frame is composed on (keepFrame copies its drawn box out). */
let composeCv = null;
function composeCanvas(w, h) {
  if (!composeCv) composeCv = document.createElement('canvas');
  if (composeCv.width !== w || composeCv.height !== h) { composeCv.width = w; composeCv.height = h; }
  const g = composeCv.getContext('2d', { willReadFrequently: true });
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, w, h);
  return composeCv;
}
function composeFrame(H, b, a, f, mirror, force, src) {
  const k = b.yvKey + '|' + a.row + '|' + f + (mirror ? 'm' : '');
  let c = frames.get(k);
  if (c) return c;
  // While its look is being made ahead, or past this frame's time, a frame is not made in play.
  if (!force && (composeMs > COMPOSE_MS || warming.has(b.yvKey))) return null;
  // In play (not a one-off picture: a portrait, the result's hero): its look queued to be made.
  if (!force && !src) { wantLook({ cls: b.cls, yv2: b.yv2, yvKey: b.yvKey, H }); return null; }
  const t0 = nowMs();
  const sheets = {};
  for (const [kind, v] of Object.entries(b.yv2)) {
    const meta = H.layers[kind] && H.layers[kind][v];
    if (!meta) continue;
    let im = src && src[kind];
    if (!im) {
      const path = 'yhero2/' + meta.file;
      if (!(path in A.images)) A.loadImage(path);
      im = A.images[path];
      if (!im || !im.complete || !im.width) return src ? null : false;
    }
    sheets[kind] = { im: dyeImage(im, meta), meta };
  }
  // The class's cell, grown where a 코디 reaches past it (costume.js).
  const box = frameBox(H, Object.values(sheets).map(s => s.meta)), { cw, ch, fx, fy } = box;
  const cv = composeCanvas(cw, ch);
  const g = cv.getContext('2d', { willReadFrequently: true });
  // The shadow under the feet, in the same picture.
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.beginPath();
  g.ellipse(mirror ? cw - fx : fx, fy - 1, 10, 3.5, 0, 0, Math.PI * 2);
  g.fill();
  if (mirror) { g.translate(cw, 0); g.scale(-1, 1); }
  drawLayers(g, H, sheets, a, f, box);
  c = keepFrame(k, cv);
  c.m = mirror;
  c.box = box;
  composeMs += nowMs() - t0;
  return c;
}
function drawFighter(b, x, y, pose, alpha, noDraw = false) {
  const M = A.M(), H = M.yhero2 && M.yhero2[b.cls.id];
  if (!H) return false;
  if (!b.yvKey) {
    b.yv2 = aiVariants(b.cls, b.gear || {});
    if (!b.yv2) return false;
    b.yvKey = b.cls.id + JSON.stringify(b.yv2);
  }
  const fdx = b.fdx || 0, fdy = b.fdy === undefined ? 1 : b.fdy;
  const dir = fdx ? 'side' : fdy < 0 ? 'up' : 'down';
  const name = { walk: 'walk', attack: 'atk', cast: 'cast', idle: 'idle', dead: 'dead' }[pose] || 'idle';
  const a = name === 'dead' && H.anims.dead ? H.anims.dead : H.anims[`${name}_${dir}`] || H.anims[`idle_${dir}`] || H.anims.walk_down;
  let f = 0;
  if (name === 'walk') f = Math.floor((b.walkT || 0) / a.ms) % a.n;
  else if (name === 'atk' || name === 'cast') f = Math.min(a.n - 1, Math.floor((1 - Math.max(0, b.poseT) / (name === 'atk' ? 0.22 : 0.3)) * a.n));
  let mirror = name !== 'dead' && dir === 'side' && fdx > 0;
  let k = b.yvKey + '|' + a.row + '|' + f + (mirror ? 'm' : '');
  const last = b.lastKey && frames.has(b.lastKey) ? b.lastKey : lookAny.get(b.yvKey);
  // A frame missing in play: its look queued to be made (wantLook); meanwhile the last it showed.
  let c = composeFrame(H, b, a, f, mirror, noDraw);
  if (c === false) return false;
  if (!c) {
    // Out of this frame's making time: the frame it showed last (made already), as it was.
    c = frames.get(last);
    if (!c) return true;
    k = last;
    mirror = !!c.m;
  }
  // (kept the longest of all: the frames drawn lately; FRAMES_MAX lets go of the least lately drawn)
  else if (!noDraw) { frames.delete(k); frames.set(k, c); }
  b.lastKey = k;
  if (noDraw) return true;
  const ctx = A.ctx;
  if (!shadowPic) {
    shadowPic = document.createElement('canvas');
    shadowPic.width = 22;
    shadowPic.height = 8;
    const g = shadowPic.getContext('2d');
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.beginPath();
    g.ellipse(11, 4, 10, 3.5, 0, 0, Math.PI * 2);
    g.fill();
  }
  ctx.globalAlpha = alpha;
  const { cw, fx, fy } = c.box || { cw: H.cell[0], fx: H.foot[0], fy: H.foot[1] };
  const [kx, ky] = kick(b), bx = Math.round(x + kx) - (mirror ? cw - fx : fx), by = Math.round(y + ky) - fy;
  blit(ctx, c, bx, by);
  blitFlash(ctx, b, c, bx, by, alpha);
  ctx.globalAlpha = 1;
  return true;
}

function marker(team, x, y, k = 1) {
  const ctx = A.ctx, im = img('ui_event_red_arrow');
  const w = 7 * k, h = 10 * k;
  if (im) {
    const pic = team === 0 ? A.tinted(im, 'hue-rotate(115deg) saturate(1.3) brightness(1.15)') : im;
    ctx.drawImage(pic, Math.round(x - w / 2), Math.round(y - h), Math.round(w), Math.round(h));
  } else {
    ctx.fillStyle = team === 0 ? '#3ad04a' : '#e8402a';
    ctx.beginPath();
    ctx.moveTo(x - w / 2, y - h);
    ctx.lineTo(x + w / 2, y - h);
    ctx.lineTo(x, y);
    ctx.fill();
  }
}

/** The war's own props: the gate's doors, the cart, the flags, the crates, the ghosts. */
function warProps() {
  const G = A.G(), W = G.war, out = [];
  if (W.flags) for (const f of W.flags) out.push({ war: true, wprop: 'flag', f, x: f.x * TILE + TILE / 2, y: f.y * TILE + TILE - 4 });
  if (W.cart) out.push({ war: true, wprop: 'cart', x: W.cart.x, y: W.cart.y + 4 });
  if (W.gate && !W.gateDown) out.push({ war: true, wprop: 'gate', x: (W.gate.x0 + W.gate.x1 + 1) / 2 * TILE, y: (W.gate.y1 + 1) * TILE });
  // 쪽문: the defence's way out (open to it on foot only; the gate's own door picture, small).
  if (W.postern) for (const [x, y] of (W.def.posterns || []).filter(([, y]) => y === W.gate.y1)) out.push({ war: true, wprop: 'postern', x: (x + 0.5) * TILE, y: (y + 1) * TILE });
  for (const c of W.crates) if (!c.by) out.push({ war: true, wprop: 'crate', x: c.x * TILE + TILE / 2, y: c.y * TILE + TILE - 6 });
  for (const z of W.zones) out.push({ war: true, wprop: 'post', z, x: z.x * TILE + TILE / 2, y: z.y * TILE + TILE - 8 });
  for (const g of W.ghosts) out.push({ war: true, wprop: 'ghost', g, x: g.x, y: g.y });
  if (W.jaeng) { jaengProps(W, out); const js = W.jshrine; if (js && (js.state === 'up' || js.state === 'soon')) out.push({ war: true, wprop: 'shrine', s: js, x: js.x * TILE + TILE / 2, y: js.y * TILE + TILE - 4 }); }
  else endgameProps(W, out);
  return out;
}
War.props = () => warProps();

function drawWarProp(W, b) {
  const G = A.G(), ctx = A.ctx;
  const prop = (name, x, y, k = 1, alpha = 1) => {
    const im = A.pic(`prop/${name}.png`);
    if (!im || !im.width) return false;
    ctx.globalAlpha = alpha;
    ctx.drawImage(im, Math.round(x - im.width * k / 2), Math.round(y - im.height * k), Math.round(im.width * k), Math.round(im.height * k));
    ctx.globalAlpha = 1;
    return true;
  };
  if (b.wprop === 'jp') return drawJaengProp(W, b);
  if (b.wprop === 'shrine') return drawShrine(W, b);
  if (b.wprop === 'ram') return drawRam(W, b);
  if (b.wprop === 'flag') {
    const f = b.f, im = img(f.owner === 1 ? 'ui_flag_red_win_0' : 'ui_flag_black_fall_0');
    if (im) {
      const pic = f.owner === 0 ? A.tinted(im, 'hue-rotate(110deg) saturate(1.4) brightness(1.6)') : im;
      ctx.drawImage(pic, Math.round(b.x - 22), Math.round(b.y - 52), 44, 46);
    }
    ctx.font = 'bold 12px G11';
    ctx.textAlign = 'center';
    drawLabel(`${f.name} 거점`, b.x, b.y + 12, f.owner === 0 ? '#9ff08a' : f.owner === 1 ? '#ff9a8a' : '#efe3c2', 'bold 12px G11');
  } else if (b.wprop === 'cart') {
    prop('war_cart', b.x, b.y, 1);
    ctx.font = 'bold 10px G9';
    ctx.textAlign = 'center';
    drawLabel('주작 불씨 수레', b.x, b.y + 12, '#ffd27a', '10px G9');
    if (W.cart.moving && A.M().fx.k_m_sammae && Math.random() < 0.05 && fxOk()) A.addFx('k_m_sammae', b.x, b.y - 30, { scale: 0.4 });
  } else if (b.wprop === 'gate') {
    prop('war_door', b.x, b.y - 6, 1);
    const g = W.gate;
    A.bar(b.x - 40, b.y - 132, 80, 4, g.hp / g.maxHp, g.team === 0 ? '#3ad04a' : '#e8402a');
    ctx.font = 'bold 10px G9';
    ctx.textAlign = 'center';
    drawLabel(`현무 성문 ${Math.ceil(g.hp / g.maxHp * 100)}%`, b.x, b.y - 136, '#efe3c2', '10px G9');
    if (g.flash > 0) g.flash -= 0.016;
  } else if (b.wprop === 'postern') {
    prop('war_door', b.x, b.y - 2, 0.3);
    ctx.font = '8px G7';
    ctx.textAlign = 'center';
    drawLabel(W.gate.team === 0 ? '쪽문 (우리 출입구)' : '쪽문', b.x, b.y + 8, W.gate.team === 0 ? '#9ff08a' : '#ff9a8a');
  } else if (b.wprop === 'crate') {
    prop('war_cart3', b.x, b.y, 0.45) || prop('field_barrel', b.x, b.y, 0.5);
    ctx.font = '8px G7';
    ctx.textAlign = 'center';
    drawLabel('보급', b.x, b.y + 8, '#ffd27a');
  } else if (b.wprop === 'post') {
    prop('war_totem', b.x, b.y, 0.55);
    ctx.font = '8px G7';
    ctx.textAlign = 'center';
    drawLabel('정찰', b.x, b.y + 8, '#9ad8ff');
  } else if (b.wprop === 'ghost') {
    const g = b.g, f = g.b;
    if (f.hero) return;
    const a = 0.35 + 0.15 * Math.sin(G.t * 3);
    if (f.cls) drawFighter(f, g.x, g.y - 4, 'dead', a) || A.drawYhero2(f.cls, f.gear, f, g.x, g.y - 4, 'dead', a);
    else {
      const yu = f.unit && A.yunit({ id: f.unit });
      if (yu && yu.u.anims.dead) { const d = yu.u.anims.dead; A.drawYunit(yu, f, g.x, g.y, f.scale, a, d.row, d.n - 1, false); }
    }
  }
}

/** The war's screen: time and score at the top, kill feed, 진영대장 bar at the bottom. */
// ------------------------------------------------ the war's minimap (대규모 전투 맵 확장, 2026-11-28)
// On fields of 60~90 tiles a side the screen shows a fifth of the field: where the points, the seals, the boss, our squads
// and what they do were out of sight. 연's own field art made small (its chunks, once loaded), under the hero's HP panel:
// the objectives in their owners' colours, our fighters, the foes our side can see (within 9 tiles of one of ours — a
// 매복 not until it springs), each of our squads' way (a line to its order; 우회 · 매복 · 재집결 by its tag's colour), the
// screen's own frame. A tap on it makes it larger or smaller; in 크게 it zooms and moves (game.js mmFrame / mmChrome:
// 미니맵 확대·이동 2026-11-28), and it folds away to a tab.
function mmRect(W) {
  const cw = A.canvas.width, d = cw / (A.boxOf(A.canvas).width || cw), m = W.map, big = A.mmView('war').mode === 'big';
  // (크게: its keys stay above the chat at the bottom left, on a low phone too)
  const room = big ? A.mmRoom('left').floor - 64 * d - (A.MM_KEY_H + 10) * d : 0;
  const maxW = (big ? 300 : 132) * d, maxH = big ? Math.max(80 * d, Math.min(230 * d, room)) : 104 * d;
  const k = Math.min(maxW / m.w, maxH / m.h);
  return { x: 8 * d, y: 64 * d, w: m.w * k, h: m.h * k, d };
}
function mmBack(W) {
  const m = W.map;
  return A.mmBackOf('war:' + (W.def.map || W.def.id), m.w, m.h, (g, s) => {
    let ok = true;
    for (let cy = 0; cy * m.chunk < m.h; cy++)
      for (let cx = 0; cx * m.chunk < m.w; cx++) {
        const path = `ywar/${W.def.map || W.def.id}_${cx}_${cy}.${m.ext || 'png'}`, im = mapBms.get(path) || A.images[path];
        if (!im || !im.width) { ok = false; continue; }
        g.drawImage(im, cx * m.chunk * s, cy * m.chunk * s, im.width * s, im.height * s);
      }
    // The closed ground a shade darker: the ways read at a glance.
    g.fillStyle = 'rgba(0,0,0,0.35)';
    const ts = TILE * s;
    for (let y = 0; y < m.rows; y++) for (let x = 0; x < m.cols; x++) if (!m.walk[y * m.cols + x]) g.fillRect(x * ts, y * ts, ts + 0.5, ts + 0.5);
    return ok;
  });
}
function drawWarMinimap(G, W, ctx) {
  if (W.raid || (window.__dbgWar && window.__dbgWar.nomm)) return;
  if (A.mmView('war').mode === 'fold') { A.mmFoldTab('war', 8 * (A.canvas.width / (A.boxOf(A.canvas).width || A.canvas.width)), 64 * (A.canvas.width / (A.boxOf(A.canvas).width || A.canvas.width))); return; }
  const r = mmRect(W), d = r.d, p0 = G.player, T = A.mmFrame('war', r, W.map.w, W.map.h, p0.x, p0.y), ts = TILE * T.k;
  const X = tx => T.X((tx + 0.5) * TILE), Y = ty => T.Y((ty + 0.5) * TILE);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  A.mmBackDraw(T, mmBack(W));
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();
  const dot = (tx, ty, col, s, shape) => {
    const px = X(tx), py = Y(ty);
    ctx.fillStyle = '#000';
    if (shape === 'diamond') {
      ctx.beginPath(); ctx.moveTo(px, py - s - d); ctx.lineTo(px + s + d, py); ctx.lineTo(px, py + s + d); ctx.lineTo(px - s - d, py); ctx.fill();
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(px, py - s); ctx.lineTo(px + s, py); ctx.lineTo(px, py + s); ctx.lineTo(px - s, py); ctx.fill();
      return;
    }
    ctx.fillRect(px - s / 2 - d * 0.5, py - s / 2 - d * 0.5, s + d, s + d);
    ctx.fillStyle = col;
    ctx.fillRect(px - s / 2, py - s / 2, s, s);
  };
  const ownCol = o => (o >= 0 ? teamCol('bar', o) : '#d8d8d8');
  // Camps and the objectives.
  for (const t of W.teams) dot(t.spawn[0], t.spawn[1], teamCol('name', t.id), 5 * d);
  if (W.flags) for (const f of W.flags) dot(f.x, f.y, f.contest && Math.floor(G.t * 4) % 2 ? '#ffd040' : ownCol(f.owner), 4 * d, 'diamond');
  if (W.seals) for (const s of W.seals) dot(s.x, s.y, s.contest && Math.floor(G.t * 4) % 2 ? '#ffd040' : ownCol(s.owner), 4 * d, 'diamond');
  if (W.lair) { const bs = W.boss && W.boss.hp > 0 ? W.boss : null; dot(bs ? bs.tx : W.lair[0], bs ? bs.ty : W.lair[1], bs ? '#e060ff' : '#7a4a8a', (bs ? 7 : 5) * d, 'diamond'); }
  if (W.gate && !W.gateDown) { ctx.fillStyle = '#c86a3a'; ctx.fillRect(X(W.gate.x0) - ts / 2, Y(W.gate.y0) - ts / 2, (W.gate.x1 - W.gate.x0 + 1) * ts, (W.gate.y1 - W.gate.y0 + 1) * ts); }
  if (W.cart) dot(W.cart.tx, W.cart.ty, '#ffb040', 5 * d, 'diamond');
  endgameMinimap(W, dot, d);
  for (const c of W.crates || []) if (!c.by) dot(c.x, c.y, '#ffd27a', 2.5 * d);
  for (const z of W.zones || []) dot(z.x, z.y, z.owner >= 0 && G.t < z.until ? ownCol(z.owner) : '#9ad8ff', 2.5 * d);
  for (const t of W.teams) if (t.cmd && !t.cmd.dead) dot(t.cmd.tx, t.cmd.ty, '#ffd040', 4 * d);
  // Our squads' ways: a line from the squad to its order, in its tag's colour.
  ctx.lineWidth = d;
  for (const q of W.teams[0].squads || []) {
    const c = squadCentre(W, q), o = q.order;
    if (!c || !o || q === W.hero.squad) continue;
    const tg = sqTag(q);
    ctx.strokeStyle = tg ? tg.col : 'rgba(255,255,255,0.45)';
    ctx.setLineDash(tg ? [] : [2 * d, 2 * d]);
    ctx.beginPath(); ctx.moveTo(X(c[0]), Y(c[1]));
    if (q.route && !q.route.done && o.to) { ctx.lineTo(X(q.route.via[0]), Y(q.route.via[1])); ctx.lineTo(X(o.to[0]), Y(o.to[1])); }
    else ctx.lineTo(X(o.x), Y(o.y));
    ctx.stroke();
  }
  ctx.setLineDash([]);
  // Who: ours all; theirs where ours can see them (refreshed four times a second).
  if (!W.mmSeen || G.t - W.mmSeen.t > 0.25) {
    const seen = [], mine = W.alive[0];
    for (const t of teamsOf(W)) if (t !== 0) for (const e of W.alive[t]) {
      if (e.gate || unseenHid(e) || e.lurk > G.t) continue;
      let ok = W.scoutBuff && W.scoutBuff[0] > G.t;
      for (let i = 0; !ok && i < mine.length; i++) ok = Math.abs(mine[i].tx - e.tx) + Math.abs(mine[i].ty - e.ty) <= 10;
      if (ok) seen.push(e);
    }
    W.mmSeen = { t: G.t, seen };
  }
  for (const b of W.alive[0]) if (!b.hero && !b.gate && !b.troop) dot(b.tx, b.ty, b.lurk > G.t ? '#c8ff8a' : '#58e868', 2 * d);
  for (const e of W.mmSeen.seen) if (!e.dead) dot(e.tx, e.ty, teamCol('bar', e.team), 2 * d);
  // The screen's frame and the hero.
  const VW = A.VW(), VH = A.VH(), p = G.player, [cx0, cy0] = G.camAt || [p.x - VW / 2, p.y - VH / 2];
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.strokeRect(T.X(cx0), T.Y(cy0), VW * T.k, VH * T.k);
  if (!G.dead && (Math.floor(performance.now() / 400) % 2 === 0 || T.v.mode === 'big')) dot(p.tx, p.ty, '#fff', 4 * d);
  ctx.restore();
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  A.mmChrome(T);
  ctx.restore();
}

function hud() {
  const G = A.G(), W = G.war, ctx = A.ctx, cw = A.canvas.width, ch = A.canvas.height;
  const u = Math.max(1, ch / 400);
  ctx.save();
  ctx.textAlign = 'center';
  // Top, as 연's duels show it: each guild's bar either side of the timer box.
  const left = Math.max(0, Math.ceil(W.left));
  const prog = W.jaeng ? null : sideProgress(W);
  // The bars stop short of 연's HP/MP panel at the top left (it ends 189 CSS px in, drawYeonStatus),
  // which on a narrow phone they ran under.
  const d = cw / (A.boxOf(A.canvas).width || cw);
  const room = cw / 2 - 27 * u - 4 * u - 196 * d;
  const boxW = 54 * u, boxH = 18 * u, bx = cw / 2 - boxW / 2, by0 = 4 * u,
    barW = Math.min(190 * u, cw / 2 - boxW / 2 - 12 * u, Math.max(room, 60 * d));
  if (W.jaeng) jaengHud(G, W, ctx, cw, ch, u, d);
  else for (const t of [0, 1]) {
    const x = t === 0 ? bx - 4 * u - barW : bx + boxW + 4 * u;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(x - u, by0 - u, barW + 2 * u, 16 * u);
    ctx.fillStyle = t === 0 ? '#1d3a6a' : '#5a1a14';
    ctx.fillRect(x, by0, barW, 7 * u);
    ctx.fillStyle = t === 0 ? '#4aa0ff' : '#ff4a3a';
    const k = clamp(prog[t].k, 0, 1);
    if (t === 0) ctx.fillRect(x, by0, barW * k, 7 * u);
    else ctx.fillRect(x + barW * (1 - k), by0, barW * k, 7 * u);
    ctx.font = `${Math.round(9 * u)}px G9`;
    ctx.textAlign = t === 0 ? 'left' : 'right';
    hudText(prog[t].text, t === 0 ? x + 2 * u : x + barW - 2 * u, by0 + 14 * u, t === 0 ? '#bfe0ff' : '#ffc0b0');
  }
  if (!W.jaeng) {
  ctx.fillStyle = '#e8dcc0';
  ctx.fillRect(bx, by0 - 2 * u, boxW, boxH);
  ctx.fillStyle = '#3a2a18';
  ctx.fillRect(bx + u, by0 - u, boxW - 2 * u, boxH - 2 * u);
  ctx.fillStyle = '#f4ead2';
  ctx.fillRect(bx + 2 * u, by0, boxW - 4 * u, boxH - 4 * u);
  ctx.font = `bold ${Math.round(12 * u)}px G11`;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#2a1a0a';
  ctx.fillText(`${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`, cw / 2, by0 + 11 * u);
  }
  // The mode's own line.
  let line = W.jaeng ? '' : `${W.def.name} · ${W.def.title}`;
  if (W.raid) {
    const rv = W.revivesLeft === undefined ? '' : W.heroOut ? '부활 소진' : `남은 부활 ${W.revivesLeft}회`;
    line = W.boss ? rv : `${W.def.name} · 쓰러진 공대원 ${W.bodies.filter(b => b.dead).length}${rv ? ' · ' + rv : ''}`;
  }
  if (W.mode === 'capture') line += ` · ${W.flags.map(f => (f.owner === 0 ? '●' : f.owner === 1 ? '○' : '◌') + f.name).join(' ')} (목표 ${W.def.target}점)`;
  else if (W.mode === 'commander') line += ` · 처치 ${Math.floor(W.score[0])} : ${Math.floor(W.score[1])}${W.def.kills ? ` (목표 ${W.def.kills})` : ''}`;
  else if (W.mode === 'escort') {
    const pct = i => Math.round(i / (W.path.length - 1) * 100);
    line += ` · ${W.round === 1 ? '전반' : '후반'} ${W.attacker === 0 ? '우리 호위' : '적 호위'} ${pct(W.cart.i)}%${W.cart.moving ? ' ▶' : ''}`;
  } else if (W.mode === 'siege') line += W.gateDown ? ` · 성문 붕괴 · 수성대장 ${Math.round(hpk(W.teams[1 - W.attacker].cmd) * 100)}%` : ` · 현무 성문 ${Math.ceil(W.gate.hp / W.gate.maxHp * 100)}% · ${W.attacker === 0 ? '우리가 공성' : '우리가 수성'}`;
  ctx.font = `${Math.round(10 * u)}px G9`;
  if (line) hudText(line, cw / 2, 32 * u, '#ffd27a');
  if (W.raid) drawTaskHud(G, W, ctx, cw, ch, u);
  else if (!W.jaeng) drawCmdHud(G, W, ctx, cw, ch, u);
  if (!W.raid) drawTacHud(G, W, ctx, cw, ch, u, (W.jaeng ? 58 : 81) * u);
  if (!W.raid && !W.jaeng) drawEndHud(G, W, ctx, cw, u, 69 * u);
  // Kill feed, top right.
  ctx.textAlign = 'right';
  const icon = img('ui_Icon_KillLog');
  // Under the 연속 처치 count (drawn at 64 / 860 of the width, top right), not across it.
  let y = Math.max(46 * u, 104 * cw / 860);
  // (UI 점검 2026-11-28: lines that reach down to the 전술·쟁 지휘 keys at the right edge stand left of them, not under them)
  const cb = A.boxOf(A.canvas), dpx = cw / (cb.width || cw);
  let keyL = Infinity, keyT = Infinity;
  for (const id of ['war-tac', 'jaeng-cmds']) {
    const e = document.getElementById(id), r = e && A.boxOf(e);
    if (r && r.width > 0) { keyL = Math.min(keyL, (r.left - cb.left) * dpx); keyT = Math.min(keyT, (r.top - cb.top) * dpx); }
  }
  for (const f of W.feed.slice(-5)) {
    const a = Math.min(1, (6 - (G.t - f.t)) * 2);
    ctx.globalAlpha = a;
    const x = y + 4 * u > keyT ? Math.min(cw - 8 * u, keyL - 6 * dpx) : cw - 8 * u;
    hudText(f.b, x, y, f.gold ? '#ffd040' : f.bt < 0 ? '#ffd27a' : teamCol('name', f.bt));
    const wb = ctx.measureText(f.b).width;
    if (icon) ctx.drawImage(icon, x - wb - 16 * u, y - 10 * u, 12 * u, 12 * u);
    hudText(f.a, x - wb - 20 * u, y, f.at < 0 ? '#ffd27a' : teamCol('name', f.at));
    y += 13 * u;
  }
  ctx.globalAlpha = 1;
  // Where the feed ends (canvas pixels): the pickup list (game.js drawLootFeed) goes under it.
  W.feedBottom = W.feed.length ? y - 6 * u : 0;
  // Bottom: each side's 진영대장 (as the reference: 북 100% · 진영대장 · 남 100%).
  const bh = 8 * u, by = ch - bh - 2 * u, half = cw / 2 - 40 * u;
  if (!W.raid && !W.jaeng) {
  const c0 = W.teams[0].cmd, c1 = W.teams[1].cmd;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, by - 2 * u, cw, bh + 4 * u);
  ctx.fillStyle = '#1a4a12';
  ctx.fillRect(4 * u, by, half, bh);
  ctx.fillStyle = '#3ad04a';
  ctx.fillRect(4 * u, by, half * hpk(c0), bh);
  ctx.fillStyle = '#4a1a12';
  ctx.fillRect(cw - 4 * u - half, by, half, bh);
  ctx.fillStyle = '#e8402a';
  ctx.fillRect(cw - 4 * u - half * hpk(c1), by, half * hpk(c1), bh);
  ctx.font = `${Math.round(9 * u)}px G9`;
  ctx.textAlign = 'left';
  hudText(`${W.teams[0].name} ${Math.round(hpk(c0) * 100)}%`, 8 * u, by + bh - 1 * u, '#fff');
  ctx.textAlign = 'right';
  hudText(`${W.teams[1].name} ${Math.round(hpk(c1) * 100)}%`, cw - 8 * u, by + bh - 1 * u, '#fff');
  ctx.textAlign = 'center';
  hudText('진영대장', cw / 2, by + bh - 1 * u, '#ffd040');
  }
  // The squad's order: an arrow at the screen's edge toward it when off screen.
  const sq = W.hero.squad, o = sq && sq.order;
  if (o && !G.dead) {
    const p = G.player, ox = o.x * TILE + TILE / 2 - p.x, oy = o.y * TILE + TILE / 2 - p.y;
    const Z = A.Z();
    if (Math.abs(ox) > A.VW() / 2 - 20 || Math.abs(oy) > A.VH() / 2 - 20) {
      const ang = Math.atan2(oy, ox), r = Math.min(cw, ch) * 0.38;
      const ax = cw / 2 + Math.cos(ang) * r, ay = ch / 2 + Math.sin(ang) * r * 0.8;
      ctx.translate(ax, ay);
      ctx.rotate(ang);
      ctx.fillStyle = 'rgba(255,208,64,0.85)';
      ctx.beginPath();
      ctx.moveTo(10 * u, 0);
      ctx.lineTo(-6 * u, -7 * u);
      ctx.lineTo(-6 * u, 7 * u);
      ctx.fill();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.font = `${Math.round(9 * u)}px G9`;
      hudText(`목표`, ax, ay - 10 * u, '#ffd040');
    }
  }
  // (UI 점검 2026-11-28: a middle line that would run under the minimap at the left moves right of it — the minimap is
  // drawn over the HUD, and 자리비움's line was half hidden under it on a phone)
  const midX = (t, y) => {
    if (W.raid || A.mmView('war').mode === 'fold') return cw / 2;
    const r = mmRect(W), wt = ctx.measureText(t).width;
    if (y < r.y - 4 * u || y - 16 * u > r.y + r.h + (A.MM_KEY_H + 6) * r.d || cw / 2 - wt / 2 > r.x + r.w + 6 * r.d) return cw / 2;
    return Math.max(cw / 2, Math.min(cw - 8 * u - wt / 2, r.x + r.w + 10 * r.d + wt / 2));
  };
  ctx.textAlign = 'center';
  if (afk()) {
    ctx.font = `${Math.round(12 * u)}px G11`;
    const t = '자리비움 — 움직이지 않는 동안 기여가 거의 쌓이지 않습니다', y = ch / 2 - 56 * u;
    hudText(t, midX(t, y), y, '#ff9a8a');
  }
  if (G.dead && W.heroBack) {
    ctx.font = `${Math.round(14 * u)}px G11`;
    const t = `부활까지 ${Math.ceil(W.heroBack - G.t)}초`, y = ch / 2 - 40 * u;
    hudText(t, midX(t, y), y, '#ff9a8a');
  } else if (G.dead && W.heroOut) {
    ctx.font = `${Math.round(13 * u)}px G11`;
    const t = '부활 횟수 소진 · 공대원들이 싸움을 이어갑니다', y = ch / 2 - 40 * u;
    hudText(t, midX(t, y), y, '#ff9a8a');
  }
  if (W.hero.carry) {
    ctx.font = `${Math.round(11 * u)}px G11`;
    hudText('보급 운반 중 — 목표 지점으로!', cw / 2, 46 * u, '#ffd27a');
  }
  // A 진영대장 winding up near the hero: the screen's edge throbs red too.
  const near = !W.raid && W.teams.find(t => t.cmd && t.cmd.wind && d2(t.cmd, W.hero) < 8);
  if (near) {
    const k = 0.25 + 0.2 * Math.sin(G.t * 20);
    const gr = ctx.createRadialGradient(cw / 2, ch / 2, ch * 0.3, cw / 2, ch / 2, Math.hypot(cw, ch) / 2);
    gr.addColorStop(0, 'rgba(160,0,0,0)');
    gr.addColorStop(1, `rgba(220,20,10,${k})`);
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, cw, ch);
  }
  ctx.restore();
  drawWarMinimap(G, W, ctx);
  drawCountdown(W);
}
/** Each guild's standing for the top bars, by the war's mode. */
function sideProgress(W) {
  const name = t => W.teams[t].name;
  if (W.raid) {
    const n = W.alive ? W.alive[0].length : 0, all = W.bodies.length + 1, b = W.boss, G = A.G();
    const bk = b ? hpk(b) : G.cleared ? 0 : 1;
    return [{ k: n / all, text: `공격대 ${n}/${all}` },
      { k: bk, text: b ? `${name(1)} ${Math.ceil(bk * 100)}% · ${(G.phase || 0) + 1}/3페이즈${G.enraged ? ' · 광폭화' : ''}${W.shield ? ' · 보호막' : ''}` : G.cleared ? `${name(1)} 처치!` : `${name(1)} 등장 ${Math.max(0, Math.ceil(A.RAID_BOSS_AT - G.t))}초` }];
  }
  if (W.mode === 'capture') return [0, 1].map(t => ({ k: W.score[t] / W.def.target, text: `${name(t)} ${W.score[t]}점` }));
  if (W.mode === 'commander') return [0, 1].map(t => ({ k: hpk(W.teams[t].cmd), text: `${name(t)} 대장 ${Math.round(hpk(W.teams[t].cmd) * 100)}% · 처치 ${Math.floor(W.score[t])}` }));
  if (W.mode === 'escort') {
    const n = W.path.length - 1;
    return [0, 1].map(t => {
      const v = t === W.attacker ? W.cart.i : W.cart.best[t];
      return { k: v / n, text: `${name(t)} ${Math.round(v / n * 100)}%${t === W.attacker ? ' 호위 중' : ''}` };
    });
  }
  const att = W.attacker, dc = W.teams[1 - att].cmd;
  const gk = W.gateDown ? 0 : W.gate.hp / W.gate.maxHp;
  const pa = W.gateDown ? 0.5 + 0.5 * (1 - hpk(dc)) : 0.5 * (1 - gk);
  return [0, 1].map(t => (t === att ? { k: pa, text: `${name(t)} 공성 ${Math.round(pa * 100)}%` } : { k: 1 - pa, text: `${name(t)} 수성 · 성문 ${Math.round(gk * 100)}%` }));
}

/** 3, 2, 1, 시작: white brush strokes on 연's ink blot. */
function drawCountdown(W) {
  const ctx = A.ctx, cw = A.canvas.width, ch = A.canvas.height, u = Math.max(1, ch / 400);
  const c = W.countdown;
  if (!(c > 0)) return;
  const n = Math.ceil(c - 1), frac = c - Math.floor(c);
  const text = n > 0 ? String(n) : '시작';
  const pop = 1 + Math.max(0, frac - 0.75) * 2;
  const blot = img('ui_bg_brush_05');
  ctx.save();
  ctx.globalAlpha = n > 0 ? 1 : Math.min(1, c * 1.5);
  ctx.translate(cw / 2, ch * 0.38);
  ctx.scale(pop, pop);
  const w = (n > 0 ? 130 : 210) * u, h = (n > 0 ? 120 : 110) * u;
  if (blot) ctx.drawImage(blot, -w / 2, -h / 2, w, h);
  else { ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.font = `bold ${Math.round((n > 0 ? 64 : 48) * u)}px G11`;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#000';
  ctx.fillText(text, 2 * u, 22 * u);
  ctx.fillStyle = '#fff';
  ctx.fillText(text, 0, 20 * u);
  ctx.restore();
}

/** Screen text with a dark edge, kept as a picture per wording (the HUD's lines change seldom). */
const hudPics = new Map();
function hudText(t, x, y, color) {
  const ctx = A.ctx, font = ctx.font, key = t + '|' + color + '|' + font;
  let e = hudPics.get(key);
  if (!e) {
    const c = document.createElement('canvas'), g = c.getContext('2d');
    g.font = font;
    const m = g.measureText(t), size = parseInt((font.match(/(\d+)px/) || [0, 12])[1], 10);
    c.width = Math.ceil(m.width) + 4;
    c.height = Math.ceil(size * 1.4) + 3;
    g.font = font;
    g.textBaseline = 'alphabetic';
    const base = Math.ceil(size * 1.1) + 1;
    g.fillStyle = '#000';
    g.fillText(t, 3, base + 1);
    g.fillText(t, 1, base);
    g.fillStyle = color;
    g.fillText(t, 2, base);
    e = { c, base, w: c.width };
    if (hudPics.size > 300) hudPics.clear();
    hudPics.set(key, e);
    if (window.createImageBitmap) createImageBitmap(c).then(bm => { e.c = bm; }).catch(() => {});
  }
  const al = ctx.textAlign, x0 = al === 'center' ? x - e.w / 2 : al === 'right' ? x - e.w + 2 : x - 2;
  ctx.drawImage(e.c, Math.round(x0), Math.round(y - e.base));
}

// ================================================================ 엔드게임 (2026-11-28): 신단 · 충차 · 주간 규칙 · 하이라이트 · 리그
// (docs/9cha_rules.md "엔드게임 심층 분석·설계") Every 사냥터 cleared, the wars are the game: a war fought by itself was the
// dice's after its first minutes, and the hero's choices were the minute's command and three keys. Added, for every 대항전:
// - 전장 신단: a shrine wakes at a side spot every 75 s (told 8 s ahead, on the minimap), each guild sends a squad, and
//   whoever holds its ring 4 s alone gets its gift for 30 s (투신 +15% blows, 금강 −15% taken, 청풍 +20% pace and mending).
//   The hero's choice: the shrine (its presence tips it) or the objective — the shrine is never where the main fight is.
// - 충차 (현무전): the siege's ram rolls from the attack's camp to the gate when the attack outnumbers the defence round it
//   and strikes the gate every 4 s (2%); every defender beside it burns it (the hero counts twice) — the defence must
//   sortie by the 쪽문, the attack must escort it.
// - 주간 전장 규칙 (league.js WAR_RULES), the war's moments (the results' 결정적 순간, and the measurements), MVP of each side,
//   the 문파 리그 on the board and the results.
const SHRINE = { first: 55, every: 75, warn: 8, take: 4, r: 1.8, buff: 30 };
const SHRINE_KINDS = {
  fury: { name: '투신의 신단', short: '투신', desc: '공격 +15%', dmg: 0.15, col: '#ff8a5a', tint: 'hue-rotate(-100deg) saturate(1.6)' },
  ward: { name: '금강의 신단', short: '금강', desc: '받는 피해 −15%', taken: 0.15, col: '#8ac8ff', tint: 'hue-rotate(80deg) saturate(1.2)' },
  wind: { name: '청풍의 신단', short: '청풍', desc: '이동 +20% · 초당 체력 1.5%', speed: 0.2, regen: 0.015, col: '#9ff08a', tint: null },
};
// Side spots of each field, away from the objectives (the shrine draws a squad off the main fight), on the walk grids
// ($S/r_end/maps.txt): 청룡 off the 거점's diagonal, 백호 the north court and the south garden, 주작 the road's flanks (the
// two nearest the cart), 현무 just outside the walls either side of the gate.
const SHRINE_SPOTS = {
  cheong: [[30, 16], [46, 58], [12, 40], [64, 30]], baekho: [[37, 14], [37, 48]],
  jujak: [[8, 52], [46, 52], [10, 24], [44, 24], [10, 66], [44, 66], [8, 40], [46, 34]], hyeonmu: [[33, 29], [47, 29]], // (by the walls either side of the gate, where the 쪽문 sortie can contest it: out in the field only the siege took it, 4 : 0)
  nanjeon: [[15, 12], [5, 10], [25, 10]], // (난투: the statue's dais — up its stairs — and the hall's side rooms)
};
function moment(W, text, team = 0, o = {}) {
  (W.moments = W.moments || []).push({ t: Math.round(W.t), text, team, hero: !!o.hero, big: !!o.big, kind: o.kind || '' });
  if (W.moments.length > 80) W.moments.splice(0, W.moments.length - 80);
}
function endgameSetup(W) {
  W.rule = warRule();
  // 문파 기술 (league.js GUILD_SKILLS): our guild's, read once at the start.
  const pr = A.progress();
  W.gk = Object.fromEntries(GUILD_SKILLS.map(s => [s.id, guildK(pr, s.id)]));
  W.moments = [];
  W.sbuff = [null, null, null];
  W.cbK = [1, 1, 1];
  if (W.jaeng) {
    const sp = JSHRINE_SPOTS[W.def.id];
    if (sp) W.jshrine = { state: 'wait', at: JSHRINE.first, every: W.rule.shrineEvery ? Math.round(JSHRINE.every * 0.7) : JSHRINE.every, n: 0, x: 0, y: 0, prog: 0, capT: -1, kind: null, taken: [0, 0, 0], spots: sp.map(([x, y]) => snap(W, x, y)) };
    A.say(`[이번 주 전장 규칙] ${W.rule.name} — ${W.rule.desc}`, 'sys');
    return;
  }
  W.shrine = { state: 'wait', at: SHRINE.first, every: W.rule.shrineEvery || SHRINE.every, n: 0, x: 0, y: 0, prog: 0, kind: null, taken: [0, 0] };
  // 공성 병기: the commanders stand longer (not the 수성대장: the siege's own end).
  if (W.rule.cmdHpK && W.mode !== 'siege') for (const t of W.teams) { t.cmd.maxHp *= W.rule.cmdHpK; t.cmd.hp = t.cmd.maxHp; }
  if (W.mode === 'siege') {
    const g = W.gate, from = snap(W, W.def.outside[0], W.def.outside[1] - 2), to = snap(W, g.tx, g.y1 + 2);
    W.ram = { path: pathCells(W, from, to), i: 0, hp: 0, maxHp: 1, state: 'wait', at: 45, beat: 0, tx: from[0], ty: from[1], x: 0, y: 0, moving: false, hits: 0, k: W.rule.ramK || 1, downs: 0, gateDmg: 0 };
    ramPos(W);
  }
  A.say(`[이번 주 전장 규칙] ${W.rule.name} — ${W.rule.desc}`, 'sys');
}
/** The gift of a guild's shrine on a blow (src's side strikes harder, t's side takes less), and the 역전의 기세. */
function shrineK(W, src, t) {
  const G = A.G();
  let k = 1;
  const a = src && src.team !== undefined && W.sbuff[src.team], b = t && t.team !== undefined && W.sbuff[t.team];
  if (a && a.until > G.t && SHRINE_KINDS[a.kind].dmg) k *= 1 + SHRINE_KINDS[a.kind].dmg * a.k;
  if (b && b.until > G.t && SHRINE_KINDS[b.kind].taken) k *= 1 - SHRINE_KINDS[b.kind].taken * Math.min(1.4, b.k);
  if (src && src.team !== undefined && W.cbK[src.team] > 1) k *= W.cbK[src.team];
  return k;
}
function shrineOn(W, team, what) {
  const s = W.sbuff && W.sbuff[team];
  return s && s.until > A.G().t && SHRINE_KINDS[s.kind][what] ? SHRINE_KINDS[s.kind][what] * s.k : 0;
}
/** Every frame: the shrine's clock and ring, the ram, the 역전의 기세, 청풍's mending. */
function endgameTick(W, dt) {
  const G = A.G();
  if (W.jaeng || !W.shrine || W.over || (W.countdown || 0) > 0) return;
  for (const t of [0, 1]) {
    const rg = shrineOn(W, t, 'regen');
    if (rg) for (const b of W.alive[t]) if (!b.gate && !b.hero && b.hp < b.maxHp) b.hp = Math.min(b.maxHp, b.hp + b.maxHp * rg * dt);
  }
  const rg0 = shrineOn(W, 0, 'regen');
  if (rg0 && !G.dead) G.player.hp = Math.min(G.player.maxHp, G.player.hp + G.player.maxHp * rg0 * dt * War.heroHealK());
  // 역전의 기세: the side behind (by the top bars) strikes up to +15% harder.
  if (W.rule.comeback) {
    const gap = progressNow(W) / 100;
    W.cbK = [1 + W.rule.comeback * clamp(-gap / 0.4, 0, 1), 1 + W.rule.comeback * clamp(gap / 0.4, 0, 1)];
  }
  shrineTick(W, dt);
  if (W.ram) ramTick(W, dt);
  // The lead turning over (by the top bars, past 5 points either way) is one of the war's moments.
  W.leadT = (W.leadT || 0) - dt;
  if (W.leadT <= 0) {
    W.leadT = 1;
    const g = progressNow(W), who = g > 5 ? 0 : g < -5 ? 1 : -1;
    if (who >= 0 && W.leader >= 0 && who !== W.leader) moment(W, `${W.teams[who].name} 역전`, who, { kind: 'lead', big: W.t > 120 });
    if (who >= 0) W.leader = who;
    (W.leadLog = W.leadLog || []).push(g);
  }
}
function shrineSpot(W) {
  const list = SHRINE_SPOTS[W.def.map || W.def.id] || [W.def.mid || W.teams[0].spawn];
  let spots = list;
  if (W.mode === 'escort' && W.cart) spots = list.slice().sort((a, b) => Math.hypot(a[0] - W.cart.tx, a[1] - W.cart.ty) - Math.hypot(b[0] - W.cart.tx, b[1] - W.cart.ty)).slice(0, 2);
  const s = W.shrine, pool = spots.filter(p => !(s.last && Math.abs(p[0] - s.last[0]) + Math.abs(p[1] - s.last[1]) < 3));
  return snap(W, ...pick(pool.length ? pool : spots));
}
function shrineTick(W, dt) {
  const s = W.shrine;
  if (s.state === 'wait' && W.t >= s.at - SHRINE.warn) {
    if (W.left < 25) return;
    [s.x, s.y] = shrineSpot(W);
    s.kind = pick(Object.keys(SHRINE_KINDS));
    s.state = 'soon';
    s.prog = 0;
    const K = SHRINE_KINDS[s.kind];
    A.say(`[신단] ${SHRINE.warn}초 뒤 ${K.name}이 깨어납니다 — 차지한 문파는 ${Math.round(SHRINE.buff * (W.rule.shrineK || 1))}초 동안 ${K.desc}${W.rule.shrineK ? ' ×1.5' : ''} (지도의 ◆)`, 'sys');
    A.banner(`${K.name} · ${SHRINE.warn}초 뒤`);
  }
  if (s.state === 'soon' && W.t >= s.at) { s.state = 'up'; moment(W, `${SHRINE_KINDS[s.kind].name} 깨어남`, -1, { kind: 'shrineUp' }); }
  if (s.state !== 'up') return;
  const [n0, n1] = countAt(W, s.x, s.y, SHRINE.r);
  s.contest = !!(n0 && n1);
  if (n0 && n1) return;
  const who = n0 ? 0 : n1 ? 1 : -1;
  if (who < 0) { s.prog *= Math.max(0, 1 - dt * 0.5); return; }
  const n = who === 0 ? n0 : n1;
  // The hero's own hand on it counts most (its 서포터 more): the gift is the hero's to go and take.
  const heroK = who === 0 && heroIn(W, s.x, s.y, SHRINE.r) ? (W.role === 'support' ? 1.8 : 1.4) : 1;
  const sgn = who === 0 ? -1 : 1;
  if (Math.sign(s.prog) === -sgn) s.prog = 0;
  s.prog += sgn * dt / SHRINE.take * (1 + 0.15 * Math.min(4, n - 1)) * heroK * (who === 0 ? 1 + gk(W, 'banner') : 1);
  if (Math.abs(s.prog) >= 1) shrineTaken(W, who);
}
function shrineTaken(W, team) {
  const G = A.G(), s = W.shrine, K = SHRINE_KINDS[s.kind], k = W.rule.shrineK || 1;
  W.sbuff[team] = { kind: s.kind, until: G.t + SHRINE.buff * k + (team === 0 ? gk(W, 'shrine') : 0), k };
  s.state = 'wait';
  s.last = [s.x, s.y];
  s.n++;
  s.at = W.t + s.every;
  s.taken[team]++;
  const heroThere = team === 0 && heroIn(W, s.x, s.y, SHRINE.r + 0.5);
  for (const b of W.alive[team]) if (!b.gate && Math.hypot(b.tx - s.x, b.ty - s.y) <= SHRINE.r + 0.5) credit(b, 'obj', 30);
  A.say(`${W.teams[team].name} 문파가 ${K.name}을 차지했습니다! (${Math.round(SHRINE.buff * k)}초 ${K.desc})`, team === 0 ? 'sys' : 'warn');
  if (team === 0) A.banner(`${K.name} 획득! ${K.desc}`);
  A.audio().play(team === 0 ? 'levelup' : 'click');
  if (A.M().fx.k_revive && A.fxBudget('kill', 6)) A.addFx('k_revive', s.x * TILE + TILE / 2, s.y * TILE + TILE - 6, { anchor: 'bottom', scale: 1 });
  moment(W, `${W.teams[team].name} · ${K.short} 신단${heroThere ? ' (내가 차지)' : ''}`, team, { hero: heroThere, kind: 'shrine' });
}
/** Each guild sends one squad (not the hero's) to the shrine from its warning on; a guild well behind, two. */
function shrineOrders(W) {
  const s = W.shrine;
  if (!s || (s.state !== 'up' && s.state !== 'soon')) return;
  for (const team of [0, 1]) {
    const T = W.teams[team], foe = W.teams[1 - team];
    // (the siege's defence keeps its gate: only its close-in go, by the 쪽문 — gateHold)
    const pool = T.squads.filter(q => q !== W.hero.squad && livingOf(q).length >= 2 && !(q.tac && q.tac.kind === 'rally'));
    if (!pool.length) continue;
    const at = q => squadCentre(W, q) || T.spawn;
    pool.sort((a, b) => Math.hypot(at(a)[0] - s.x, at(a)[1] - s.y) - Math.hypot(at(b)[0] - s.x, at(b)[1] - s.y));
    const gap = progressNow(W) * (team === 0 ? 1 : -1);
    pool.slice(0, gap < -25 ? 2 : 1).forEach((q, i) => {
      q.order = { x: s.x + (i ? 1 : 0), y: s.y, kind: 'shrine', obj: null, face: [Math.sign(foe.spawn[0] - s.x), Math.sign(foe.spawn[1] - s.y)] };
    });
  }
}

// 충차 (현무전): its road from the attack's camp to the gate's mouth.
function ramPos(W) {
  const r = W.ram, i = Math.min(r.path.length - 1, Math.floor(r.i)), f = r.i - i, a = r.path[i], b = r.path[Math.min(r.path.length - 1, i + 1)];
  r.x = (a[0] + (b[0] - a[0]) * f) * TILE + TILE / 2;
  r.y = (a[1] + (b[1] - a[1]) * f) * TILE + TILE - 6;
  r.tx = Math.round(a[0] + (b[0] - a[0]) * f);
  r.ty = Math.round(a[1] + (b[1] - a[1]) * f);
}
function ramTick(W, dt) {
  const G = A.G(), r = W.ram, att = W.attacker, def = 1 - att;
  if (W.gateDown) { r.state = 'done'; return; }
  if (r.state === 'wait' && W.t >= r.at && W.left > 20) {
    r.state = 'up'; r.i = 0; r.hits = 0; r.beat = 0; r.maxHp = r.hp = 100 * (r.k > 1 ? 1.4 : 1) * (att === 0 ? 1 + gk(W, 'ram') : 1); ramPos(W);
    A.say(att === 0 ? '[충차] 우리 충차 출격! 충차 곁(2칸)에 적보다 많이 서면 성문으로 굴러갑니다' : '[충차] 적 충차가 옵니다! 쪽문으로 나가 충차 곁에 서면 불태웁니다', att === 0 ? 'sys' : 'warn');
    A.banner(att === 0 ? '충차 출격 — 성문까지 호위!' : '적 충차 접근 — 나가서 불태워라!');
    moment(W, `${W.teams[att].name} 충차 출격`, att, { kind: 'ram' });
  }
  if (r.state !== 'up') return;
  const R = 2.5;
  const [n0, n1] = countAt(W, r.tx, r.ty, R);
  const na = att === 0 ? n0 : n1, nd = att === 0 ? n1 : n0;
  // Burnt by every defender beside it (the hero counts twice): 4% a second each, five at most.
  const heroDef = def === 0 && heroIn(W, r.tx, r.ty, R) ? 1 : 0;
  // (and the defence's archers and casters on the wall, once it is at the gate: 1.5% a second each, three at most — the
  // close-in seldom came out to it, and a ram at the gate went unburnt to the end, 11~18 blows: balance runs)
  const atGate = r.i >= r.path.length - 3;
  const wall = atGate ? Math.min(3, W.alive[def].filter(b => !b.gate && !b.troop && !b.hero && b.kit && b.kit.range > 1 && Math.hypot(b.tx - r.tx, b.ty - r.ty) <= 7).length) : 0;
  const burn = (Math.min(5, nd + heroDef) * 4 + wall * 1.5) * dt / (r.k > 1 ? 1.2 : 1) * (def === 0 ? 1 + gk(W, 'ram') : 1);
  if (burn > 0) { r.hp -= burn; r.flash = 0.1; for (const b of W.alive[def]) if (!b.gate && Math.hypot(b.tx - r.tx, b.ty - r.ty) <= R) credit(b, 'obj', dt * 2); }
  if (r.hp <= 0) {
    r.state = 'wait'; r.at = W.t + Math.round(50 / r.k); r.i = 0; r.downs++; ramPos(W);
    A.say(`${W.teams[def].name} 문파가 충차를 불태웠습니다! (${Math.round(50 / r.k)}초 뒤 다시)`, def === 0 ? 'sys' : 'warn');
    if (def === 0) A.banner('충차 파괴!');
    moment(W, `${W.teams[def].name} · 충차 파괴${heroDef ? ' (내가 앞장)' : ''}`, def, { hero: !!heroDef, kind: 'ramDown', big: true });
    if (A.M().fx.h_kill) A.addFx('h_kill', r.x, r.y - 30, { scale: 1.2 });
    A.audio().play('kill');
    return;
  }
  r.moving = false;
  if (r.i < r.path.length - 1) {
    const lead = na - nd;
    if (lead > 0) {
      r.i = Math.min(r.path.length - 1, r.i + 0.55 * (1 + 0.1 * Math.min(3, lead - 1)) * dt);
      r.moving = true;
      for (const b of W.alive[att]) if (!b.gate && Math.hypot(b.tx - r.tx, b.ty - r.ty) <= R) credit(b, 'obj', dt * 1.5);
    }
    ramPos(W);
    return;
  }
  // At the gate: a blow every four seconds.
  r.beat += dt;
  if (r.beat >= 4) {
    r.beat = 0;
    r.hits++;
    const d = W.gate.maxHp * 0.02 * r.k;
    W.gate.hp -= d;
    r.gateDmg += d / W.gate.maxHp;
    W.gate.flash = 0.15;
    if (Math.hypot(G.player.tx - r.tx, G.player.ty - r.ty) < 10) G.shake = Math.max(G.shake || 0, 0.15);
    A.audio().play('war_hit');
    if (r.hits === 1) r.reached = (r.reached || 0) + 1; // (리그 주간 목표 '충차를 성문에 붙이기')
    if (r.hits === 1) { A.say(`충차가 성문을 들이받습니다! (4초마다 성문 −${(2 * r.k).toFixed(1)}%)`, att === 0 ? 'sys' : 'warn'); moment(W, '충차가 성문을 들이받음', att, { kind: 'ramGate' }); }
    if (W.gate.hp <= 0) gateBreak(W, null);
  }
}
/** The ram's squads: one of the attack's goes with it; the defence's first goes out to burn it once it is near. */
function ramOrders(W) {
  const r = W.ram;
  if (!r || r.state !== 'up' || W.gateDown) return;
  const att = W.attacker, A0 = W.teams[att].squads.filter(q => q !== W.hero.squad), D0 = W.teams[1 - att].squads.filter(q => q !== W.hero.squad);
  const at = r.path[Math.min(r.path.length - 1, Math.floor(r.i) + 1)];
  if (A0.length) A0[A0.length - 1].order = { x: at[0], y: at[1], kind: 'escort', obj: null, face: [0, -1] };
  if (r.path.length - r.i < 12 && D0.length) D0[0].order = { x: r.tx, y: r.ty, kind: 'intercept', obj: null, face: [0, 1] };
}
function drawRam(W, b) {
  const ctx = A.ctx, r = W.ram, im = A.pic('prop/war_cart2.png'), h = im && im.width ? im.height : 60;
  if (im && im.width) {
    if (r.flash > 0) { r.flash -= 0.016; ctx.globalAlpha = 0.7; }
    ctx.drawImage(im, Math.round(b.x - im.width / 2), Math.round(b.y - im.height + 6));
    ctx.globalAlpha = 1;
  }
  A.bar(b.x - 28, b.y - h - 2, 56, 4, r.hp / r.maxHp, W.attacker === 0 ? '#3ad04a' : '#e8402a');
  ctx.font = 'bold 10px G9';
  ctx.textAlign = 'center';
  drawLabel(`충차 ${Math.ceil(r.hp / r.maxHp * 100)}%`, b.x, b.y + 12, W.attacker === 0 ? '#9ff08a' : '#ff9a8a', '10px G9');
}
function drawShrine(W, b) {
  const G = A.G(), ctx = A.ctx, s = b.s || W.shrine, K = SHRINE_KINDS[s.kind];
  const alt = A.pic('prop/war_lantern.png');
  const soon = s.state === 'soon', a = soon ? 0.5 + 0.25 * Math.sin(G.t * 8) : 1;
  ctx.globalAlpha = a;
  if (alt && alt.width) ctx.drawImage(alt, Math.round(b.x - alt.width / 2), Math.round(b.y - alt.height));
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center';
  drawLabel(soon ? `${K.name} · ${Math.max(0, Math.ceil(s.at - W.t))}초` : K.name, b.x, b.y + 14, K.col, 'bold 11px G11');
  if (s.state === 'up' && Math.abs(s.prog) > 0.02) A.bar(b.x - 26, b.y - (alt && alt.width ? alt.height : 60) - 6, 52, 4, Math.abs(s.prog), b.s ? (s.capT >= 0 ? W.teams[s.capT].color : '#d8d8d8') : s.prog < 0 ? '#3ad04a' : '#e8402a');
}
/** The HUD's line for the shrine, the gifts held, the ram and the 역전의 기세 (under the command line). */
function drawEndHud(G, W, ctx, cw, u, y) {
  if (W.jaeng || !W.shrine) return;
  const s = W.shrine, bits = [];
  if (s.state === 'soon') bits.push(`◆ ${SHRINE_KINDS[s.kind].short} 신단 ${Math.max(0, Math.ceil(s.at - W.t))}초 뒤`);
  else if (s.state === 'up') bits.push(`◆ ${SHRINE_KINDS[s.kind].short} 신단${s.contest ? ' 다툼!' : Math.abs(s.prog) > 0.02 ? ` ${s.prog < 0 ? '우리' : '적'} ${Math.round(Math.abs(s.prog) * 100)}%` : ' 비어 있음'}`);
  for (const t of [0, 1]) { const b = W.sbuff[t]; if (b && b.until > G.t) bits.push(`${t === 0 ? '우리' : '적'} ${SHRINE_KINDS[b.kind].short} ${Math.ceil(b.until - G.t)}초`); }
  if (W.ram && W.ram.state === 'up') bits.push(`충차 ${Math.ceil(W.ram.hp / W.ram.maxHp * 100)}% · 성문까지 ${Math.max(0, Math.round(W.ram.path.length - 1 - W.ram.i))}칸`);
  else if (W.ram && W.ram.state === 'wait' && !W.gateDown && W.left > 20) bits.push(`충차 ${Math.max(0, Math.ceil(W.ram.at - W.t))}초 뒤`);
  if (W.rule.comeback && Math.max(W.cbK[0], W.cbK[1]) > 1.01) bits.push(`역전의 기세 ${W.cbK[0] > 1 ? '우리' : '적'} +${Math.round((Math.max(W.cbK[0], W.cbK[1]) - 1) * 100)}%`);
  if (!bits.length) return;
  ctx.font = `${Math.round(9 * u)}px G9`;
  ctx.textAlign = 'center';
  hudText(bits.join('  ·  '), cw / 2, y, '#bfe8ff');
}
function endgameProps(W, out) {
  if (W.shrine && (W.shrine.state === 'up' || W.shrine.state === 'soon')) out.push({ war: true, wprop: 'shrine', x: W.shrine.x * TILE + TILE / 2, y: W.shrine.y * TILE + TILE - 4 });
  if (W.ram && W.ram.state === 'up') out.push({ war: true, wprop: 'ram', x: W.ram.x, y: W.ram.y + 4 });
}
function endgameMinimap(W, dot, d) {
  const G = A.G(), s = W.jaeng ? W.jshrine : W.shrine;
  if (s && (s.state === 'up' || s.state === 'soon')) dot(s.x, s.y, s.state === 'soon' || (s.contest && Math.floor(G.t * 4) % 2) ? '#ffffff' : SHRINE_KINDS[s.kind].col, 4.5 * d, 'diamond');
  if (W.ram && W.ram.state === 'up') dot(W.ram.tx, W.ram.ty, '#ffb040', 4 * d, 'diamond');
}

// ------------------------------------------------ the results: 결정적 순간, MVP, the league
/** The war's best moments for the results: the hero's own first, then the big ones, then ours; five at most, in time. */
function highlights(W) {
  const ms = (W.moments || []).filter(m => m.kind !== 'shrineUp'); // (a shrine waking is the clock's, not a moment of the war)
  const ordered = ms.filter(m => m.hero).concat(ms.filter(m => !m.hero && m.big), ms.filter(m => !m.hero && !m.big && m.team === 0), ms.filter(m => !m.hero && !m.big && m.team !== 0));
  const out = [];
  for (const m of ordered) if (!out.includes(m) && out.length < 5) out.push(m);
  return out.sort((a, b) => a.t - b.t);
}
function mvpOf(W, rows, team) {
  const r = rows.filter(x => x.b.team === team)[0];
  if (!r) return null;
  const s = r.b.stats, why = s.kills >= 6 ? `처치 ${s.kills}` : s.heal > s.dmg ? '치유' : s.obj > 60 ? '목표' : s.taken > s.dmg ? '버팀' : '피해';
  return { name: r.b.name, role: ROLES[r.b.role] ? ROLES[r.b.role].name : '', why, hero: r.b === W.hero };
}
function payReward(pr, rw, why) {
  if (!rw) return;
  pr.gold = (pr.gold || 0) + (rw.gold || 0);
  pr.coins = (pr.coins || 0) + (rw.coins || 0);
  pr.mats = pr.mats || {};
  for (const [k, n] of Object.entries(rw.mats || {})) if (A.MATS[k]) pr.mats[k] = (pr.mats[k] || 0) + n;
  if (rw.cos) dropCostume([1, 2], why);
}
const rewardText = rw => [rw.gold ? `전 ${rw.gold.toLocaleString()}` : '', rw.coins ? `레이드주화 ${rw.coins}` : '',
  ...Object.entries(rw.mats || {}).filter(([k]) => A.MATS[k]).map(([k, n]) => `${A.MATS[k].name} ${n}`), rw.cos ? '희귀 코디' : ''].filter(Boolean).join(' · ');
/** The war's end in the league (finish, finishJaeng): points, the 경지 reached and its reward. */
function leagueAfter(W, o) {
  const pr = A.progress();
  const day = new Date().toISOString().slice(0, 10);
  const lg = leagueApply(pr, { ...o, day, rule: W.rule ? W.rule.name : null, what: W.def.name || W.def.title });
  lg.paid = [];
  for (const i of lg.ups) { const rw = TIER_REWARD[i]; if (rw) { payReward(pr, rw, `리그 ${LEAGUE_TIERS[i].name}`); lg.paid.push([i, rw]); } }
  // 문파 공훈 and the week's league goals (league.js): what this war counts for.
  const won = o.place ? o.place === 1 : !!o.win;
  lg.gh = guildEarn(pr, { won, delta: lg.delta, short: o.short });
  const ours = W.jaeng ? 0 : (W.shrine && W.shrine.taken[0]) || 0;
  lg.goals = leagueGoalBump(pr, {
    shrine: ours, jshrine: W.jaeng && W.jshrine ? W.jshrine.taken[0] : 0,
    ram: W.ram && W.attacker !== 0 ? W.ram.downs : 0, gate: W.ram && W.attacker === 0 ? W.ram.reached || 0 : 0,
    nan: W.def.short && won ? 1 : 0, win: !W.jaeng && !W.def.short && won ? 1 : 0,
    pts: Math.max(0, lg.delta), sgrade: o.tier === 'S' ? 1 : 0,
  });
  for (const g of lg.goals) A.say(`[리그 주간 목표] ${g.text} 달성! 의뢰판·대항전 게시판에서 받으세요 (${leagueGoalReward(g)})`, 'sys');
  A.saveProgress();
  if (lg.ups.length) A.say(`[문파 리그] ${LEAGUE_TIERS[lg.tAfter].name} 경지에 올랐습니다!`, 'sys');
  return lg;
}
function leagueHtml(lg) {
  if (!lg) return '';
  const T = LEAGUE_TIERS[lg.tAfter], nx = lg.next;
  const bar = nx ? Math.round((lg.after - T.at) / (nx.at - T.at) * 100) : 100;
  const parts = lg.parts.map(([k, n]) => `${k} ${n >= 0 ? '+' : ''}${n}`).join(' · ');
  const ups = lg.paid.map(([i, rw]) => `<div class="wr-sub lg-up">경지 상승! <b style="color:${LEAGUE_TIERS[i].col}">${LEAGUE_TIERS[i].name}</b> — ${rewardText(rw)}</div>`).join('');
  return `<div class="wr-sub lg-line">문파 리그 <b style="color:${T.col}">${T.name}</b> ${lg.after}점 <b class="${lg.delta >= 0 ? 'lg-plus' : 'lg-minus'}">(${lg.delta >= 0 ? '+' : ''}${lg.delta})</b>${lg.streak >= 2 ? ` · ${lg.streak}연승` : ''}
    <div class="lg-bar"><i style="width:${bar}%;background:${T.col}"></i></div><small>${parts}${nx ? ` · 다음 경지 ${nx.name}까지 ${nx.at - lg.after}점` : ' · 최고 경지'}${lg.gh ? ` · 문파 공훈 +${lg.gh}` : ''}</small></div>${ups}
    ${(lg.goals || []).map(g => `<div class="wr-sub lg-up">주간 목표 달성! <b>${g.text}</b> — ${leagueGoalReward(g)} (게시판에서 받기)</div>`).join('')}`;
}
function momentsHtml(W) {
  const hs = highlights(W), rows = W.result && W.result.rows;
  const foe = W.jaeng ? (W.rank || []).find(t => t !== 0) : 1;
  const m0 = rows && mvpOf(W, rows, 0), m1 = rows && foe !== undefined && mvpOf(W, rows, foe);
  const mv = [m0 && `우리 MVP <b>${m0.name}</b> (${m0.role} · ${m0.why})${m0.hero ? ' ★' : ''}`, m1 && `상대 MVP ${m1.name} (${m1.role} · ${m1.why})`].filter(Boolean).join(' · ');
  const ms = hs.map(m => `<span class="${m.hero ? 'mo-hero' : m.team === 0 ? 'mo-ours' : m.team > 0 ? 'mo-foe' : ''}">${clockWords(m.t)} ${m.text}</span>`).join(' ');
  return (mv ? `<div class="wr-sub">${mv}</div>` : '') + (ms ? `<div class="wr-sub mo-list"><b>결정적 순간</b> ${ms}</div>` : '');
}
/** The war board's league panel (openBoard): the 경지, the season, the week's rule, a season's end to claim. */
function leagueBoardHtml(pr) {
  const L = leagueOf(pr), i = leagueTier(L.pts), T = LEAGUE_TIERS[i], nx = LEAGUE_TIERS[i + 1];
  const bar = nx ? Math.round((L.pts - T.at) / (nx.at - T.at) * 100) : 100, R = warRule();
  const day = new Date().toISOString().slice(0, 10);
  const pend = L.pending ? `<div class="lg-pend">지난 시즌 최고 경지 <b style="color:${LEAGUE_TIERS[L.pending.tier].col}">${LEAGUE_TIERS[L.pending.tier].name}</b> 보상: ${rewardText(L.pending.reward)} <button class="btn" id="lg-claim">받기</button></div>` : '';
  return `<div class="wb-league"><div><b>문파 리그 시즌 ${L.season - (L.first ?? L.season) + 1}</b> · <b style="color:${T.col}">${T.name}</b> ${L.pts}점${nx ? ` <small>(${nx.name}까지 ${nx.at - L.pts})</small>` : ''} · ${L.won}승 ${L.played - L.won}패${L.streak >= 2 ? ` · ${L.streak}연승` : ''} · 시즌 끝까지 ${seasonDaysLeft()}일
    <div class="lg-bar"><i style="width:${bar}%;background:${T.col}"></i></div></div>
    <div><b>이번 주 전장 규칙 · ${R.name}</b> — ${R.desc}${L.day !== day ? ' · <span class="lg-plus">오늘 첫 승 +25점</span>' : ''}</div>
    <small>${LEAGUE_TIERS.map((t, j) => `<span style="color:${j <= i ? t.col : '#8a7a68'}">${t.name}</span>`).join(' › ')} — 처음 오른 경지마다 보상, 시즌(4주) 끝에 최고 경지 보상</small>${pend}</div>`;
}
/** 문파 기술 (the growth tree) and this week's league goals, on the war board (folded unless opened or a goal is ready). */
let guildOpen = false;
function guildBoardHtml(pr) {
  const g = guildOf(pr), w = leagueGoals(pr), ready = leagueGoalsReady(pr).length;
  const spent = Object.values(g.sk).reduce((a, n) => a + n, 0);
  const rows = GUILD_SKILLS.map(sk => {
    const lv = g.sk[sk.id] || 0, c = guildCan(pr, sk.id), now = lv ? sk.desc(sk.per * lv) : '아직 배우지 않음', next = lv < GUILD_MAX ? sk.desc(sk.per * (lv + 1)) : '';
    return `<div class="gt-sk${c.ok || lv ? '' : ' lock'}"><b>${sk.name}</b> <span class="gt-pip">${'●'.repeat(lv)}${'○'.repeat(GUILD_MAX - lv)}</span>${lv < GUILD_MAX ? `<button class="btn" data-gsk="${sk.id}"${c.ok ? '' : ' disabled'} title="${c.ok ? '' : c.why}">배우기 ${GUILD_COST[lv]}</button>` : ''}
      <small>${now}${next ? ` → 다음: ${next}` : ''}${!c.ok && lv < GUILD_MAX ? ` · ${c.why}` : ''}</small></div>`;
  }).join('');
  const goals = w.list.map(leagueGoalDef).map(q => {
    const have = Math.min(q.need, w.c[q.id] || 0), got = w.claimed.includes(q.id), can = !got && have >= q.need;
    return `<div class="gt-goal${got ? ' done' : ''}">${q.text} <span class="lg-bar"><i style="width:${Math.round(have / q.need * 100)}%;background:#ffd040"></i></span> ${have}/${q.need} · ${leagueGoalReward(q)}${got ? ' ✓' : can ? ` <button class="btn" data-lgc="${q.id}">받기</button>` : ''}</div>`;
  }).join('');
  return `<details class="wb-guild"${guildOpen || ready ? ' open' : ''}><summary><b>문파 기술 · 리그 주간 목표</b> — 문파 공훈 ${g.gh}${ready ? ` · <span class="lg-plus">받을 목표 ${ready}</span>` : ''}</summary>
    <div><b>이번 주 리그 목표</b> (월요일 갱신)</div>${goals}
    <div style="margin-top:4px"><b>문파 기술</b> <small>공훈은 판마다(승 10 · 패 4 + 얻은 리그 점수의 1/5, 난투 ×0.7)와 주간 목표로 쌓이고 시즌이 바뀌어도 남습니다. 둘째 줄은 윗줄 3단계, 셋째 줄은 7단계부터.</small>${spent ? ' <button class="btn" id="gt-undo">초기화 (공훈 모두 돌려받기)</button>' : ''}</div>
    <div class="gt-rows">${rows}</div></details>`;
}
function leagueClaim() {
  const pr = A.progress(), L = leagueOf(pr);
  if (!L.pending) return;
  payReward(pr, L.pending.reward, '리그 시즌 보상');
  A.say(`[문파 리그] 지난 시즌 보상: ${rewardText(L.pending.reward)}`, 'sys');
  L.pending = null;
  A.saveProgress();
}
