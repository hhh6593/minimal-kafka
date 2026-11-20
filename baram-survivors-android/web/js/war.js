// 사신수 길드대항전: two guilds of twenty, a war for each 사신수 (청룡전 거점 점령, 백호전 대장전,
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
import { gwoeWeek } from './data.js';

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
// 전장 보정 per 승급 of the hero (W.foeK): to 5차, and from 5차 to 9차.
const FOE_K5 = 0.024, FOE_K9 = 0;
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
    desc: '길림 들판의 세 거점(청·중·적)을 차지해 버틴다. 거점 하나당 초마다 1점, 먼저 300점이거나 시간이 끝날 때 많은 쪽이 이긴다.',
    time: 300, target: 300, spawns: [[10, 33], [58, 12]], cmds: [[3, 41], [63, 7]],
    flags: [[18, 30], [34, 23], [49, 10]], crates: [[33, 33], [27, 12], [44, 30]], scouts: [[27, 42], [44, 3]],
  },
  baekho: {
    id: 'baekho', name: '백호전', mode: 'commander', title: '대장전', mat: 'sinsu_baekho', sinsu: '백호', art: 'ui_sinsu_castlebattle_02', pic: 'ui_img_sinsu_1',
    desc: '백호성 안뜰. 적 진영대장을 쓰러뜨리면 그 자리에서 승리. 시간이 끝나면 처치 점수와 대장의 남은 체력으로 가른다.',
    time: 300, spawns: [[4, 22], [69, 22]], cmds: [[9, 14], [64, 14]], mid: [37, 23],
    crates: [[37, 26], [37, 18], [24, 22], [50, 22]], scouts: [[20, 30], [54, 30]],
  },
  jujak: {
    id: 'jujak', name: '주작전', mode: 'escort', title: '호위', mat: 'sinsu_jujak', sinsu: '주작', art: 'ui_sinsu_castlebattle_01', pic: 'ui_img_sinsu_3',
    desc: '주작성 남문에서 본당까지 주작 불씨 수레를 호위한다. 2분씩 공수를 바꿔, 더 멀리 민 길드가 이긴다.',
    time: 240, half: 120, path: [[15, 75], [15, 23]], spawnStart: [15, 76], spawnEnd: [15, 13], cmdStart: [8, 76], cmdEnd: [15, 6],
    crates: [[4, 66], [26, 66], [4, 43], [26, 25]], scouts: [[2, 52], [28, 52]],
  },
  hyeonmu: {
    id: 'hyeonmu', name: '현무전', mode: 'siege', title: '수성 · 공성', mat: 'sinsu_hyeonmu', sinsu: '현무', art: 'ui_sinsu_castlebattle_03', pic: 'ui_img_sinsu_2',
    desc: '현무성 남문. 공성은 5분 안에 성문을 부수고 수성대장을 쓰러뜨려야 하고, 수성은 끝까지 버티면 이긴다.',
    time: 300, gate: { x0: 24, x1: 27, y0: 22, y1: 25 }, inside: [26, 1], outside: [26, 41], cmdIn: [26, 7], cmdOut: [26, 43],
    cratesOut: [[8, 33], [44, 33]], cratesIn: [[8, 17], [44, 18]], scouts: [[4, 28], [48, 28]],
  },
};
const GUILDS = [['청운', '#7cf08a'], ['흑월', '#ff7a6a']];
const NAMES = ['바람', '달빛', '청운', '흑풍', '은월', '화랑', '검성', '설화', '무영', '천둥', '소나기', '별빛', '유성', '태양', '한울', '가람',
  '누리', '도담', '라온', '미르', '새벽', '아라', '온새', '하늘', '해솔', '초롱', '다온', '구름', '이슬', '바다', '청풍', '백야',
  '흑룡', '적토', '청솔', '단비', '보라', '나래', '여울', '하람', '서리', '모래', '돌개', '불꽃', '매화', '노을'];
const TAGS = ['', '', '', '7', '01', '왕', '님', 'ㅇ', '짱', '99', '_', '군'];

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
function kitFor(cls) {
  if (KITS[cls.id]) return KITS[cls.id];
  const mine = Object.entries(SK).filter(([, d]) => d.cls === cls.id && d.fx);
  const hit = mine.filter(([, d]) => d.dmg).sort((a, b) => (a[1].req || 1) - (b[1].req || 1));
  const heal = mine.find(([, d]) => d.kind === 'heal');
  const ranged = hit.some(([, d]) => (d.range || 0) >= 4);
  return {
    range: ranged ? 5 : 1, basic: [hit[0] ? hit[0][0] : null, 1.0, 1.1], aoe: [hit[1] ? hit[1][0] : null, 1.6, 6.5],
    ult: [cls.ult && SK[cls.ult] ? cls.ult : null, 4.0, 18], heal: heal ? heal[0] : null,
  };
}
function rolesFor(cls) {
  const r = ['dps'];
  if (cls.id === 'warrior' || cls.hp >= 160 || cls.armor >= 3) r.push('tank');
  if (cls.id === 'poet' || (KITS[cls.id] ? KITS[cls.id].heal : kitFor(cls).heal)) r.push('healer');
  if (cls.id === 'mage' || cls.id === 'poet' || cls.id === 'archer' || !KITS[cls.id]) r.push('support');
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
  window.__warBoard = () => openBoard();
  // 「쟁」: window.__jaeng(classIndex | class, role, { map, raid, week, idle, practice })
  window.__jaeng = (cls, role, opts = {}) => startJaeng(typeof cls === 'number' ? A.CLASSES[cls] : cls, role, opts);
  window.__jaengCmd = kind => heroCommand(kind);
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
  return War;
}

// ---------------------------------------------------------------- the war board (town)

let pickWar = 'cheong', pickRole = 'dps', pickSide = 'atk';
function injectUi() {
  const st = document.createElement('style');
  st.textContent = `
  #war-board, #war-result { background: rgba(8,6,4,0.92); overflow-y: auto; justify-content: flex-start; padding: 10px 12px; }
  #war-board .wb-cards { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }
  #war-board .wb-card { width: 150px; min-height: 150px; border: 2px solid #5a4630; background: #1d140c; color: #efe3c2; cursor: pointer; padding: 6px; font: 12px G11, sans-serif; text-align: center; }
  #war-board .wb-card.on { border-color: #ffd040; background: #2b1e10; }
  #war-board .wb-card img { height: 72px; max-width: 140px; object-fit: contain; display: block; margin: 0 auto 4px; }
  #war-board .wb-card b { display: block; font-size: 14px; color: #ffd27a; }
  #war-board .wb-row { display: flex; gap: 6px; justify-content: center; flex-wrap: wrap; margin: 8px 0 4px; }
  #war-board .wb-role { min-width: 110px; }
  #war-board .wb-actions { align-self: stretch; z-index: 2; position: sticky; bottom: -10px; margin: 6px -12px -10px; padding: 6px 0 8px; background: rgba(8,6,4,0.96); border-top: 1px solid #5a4630; } /* 출전 always on screen */
  #war-board .wb-role.on, #war-board .wb-side.on { border-color: #ffd040; color: #ffd040; }
  #war-board .wb-info { max-width: 820px; margin: 0 auto; color: #e8dcc0; font: 12px G11, sans-serif; line-height: 1.5; }
  #war-board .wb-load { max-width: 820px; margin: 6px auto; border: 1px solid #5a4630; padding: 6px 8px; color: #e8dcc0; font: 12px G11, sans-serif; }
  #war-board .wb-load .fit { color: #8cf08a; } #war-board .wb-load .nofit { color: #aa9a80; }
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
  #war-result td, #war-result th, #war-sb td, #war-sb th { padding: 1px 6px; border-bottom: 1px solid #3a2c1c; text-align: right; }
  #war-result td:nth-child(2), #war-sb td:nth-child(2) { text-align: left; }
  #war-result tr.me td, #war-sb tr.me td { color: #ffd040; }
  #war-result .t0 td:first-child, #war-sb .t0 td:first-child { color: #7cf08a; } #war-result .t1 td:first-child, #war-sb .t1 td:first-child { color: #ff7a6a; }
  #war-result .t2 td:first-child, #war-sb .t2 td:first-child { color: #c88aff; }
  #war-result .wr-cols { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
  #war-sb { position: fixed; inset: 6% 8%; background: rgba(10,8,6,0.93); border: 2px solid #5a4630; z-index: 40; overflow: auto; padding: 6px; }
  #war-sb .wr-cols { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
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
  sb.onclick = () => { sb.hidden = true; };
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
    for (const [kind, label, tip] of [['boss', '보스', '보스 집중: 내 분대와 1분대가 20초 동안 보스를 친다'], ['pk', '견제', '견제: 보스를 가장 많이 치는 다른 길드의 딜러·힐러를 끊는다'], ['seal', '봉인', '봉인: 우리 것이 아닌 가장 가까운 봉인석을 차지한다']]) {
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
  box.innerHTML = `<h2>사신수 길드대항전 · 쟁</h2>
    <div class="wb-cards">${cards}</div>
    <div class="wb-info"><b>${w.name} · ${w.title}</b> — ${w.desc}<br>
    ${w.jaeng ? w.more : '양 길드 25명씩 · 혼자 들어가도 전장이 꽉 찹니다 · 양 진영의 전력은 자동으로 맞춰집니다(전장 보정).'}</div>
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
    <small>추천 격: ${rec}</small>${lines}${bag.length ? '<b>가방에서 바꿔 입기</b>' + bag.slice(0, 6).join('') : ''}</div>`;
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
  const map = A.M().ywar && A.M().ywar[id];
  if (!def || !map) return false;
  A.setChosenClass(cls);
  // The battlefield's pieces, before the field is shown.
  const loads = [];
  // The field's pieces (1024 pixels square) as decoded bitmaps, kept for the war: drawn from their
  // <img> each was decoded on the spot the first time it came into view (and again once the
  // browser had let it go) — a long frame each time the fight moved across the field.
  for (const [path, bm] of mapBms) if (!path.startsWith(`ywar/${id}_`)) { if (bm && bm.close) bm.close(); mapBms.delete(path); }
  for (let cy = 0; cy * map.chunk < map.h; cy++)
    for (let cx = 0; cx * map.chunk < map.w; cx++) {
      const p = `ywar/${id}_${cx}_${cy}.png`;
      if (!A.images[p]) loads.push(A.loadImage(p));
      if (!mapBms.has(p)) loads.push(sheetBitmap(p).then(bm => { if (bm) mapBms.set(p, bm); }));
    }
  // The fighters' looks (aiLooks), kept for the session: a later war's frames are made already (see warmLooks).
  await aiLooksReady();
  const looks = sessionLooks;
  // The effects of the war's spells (every class's kit, the hero's own, the hits, kills and
  // revives) decoded now: a strip is decoded the first time it is drawn, and the first clash of
  // a war drew forty of them at once (a 4000-pixel strip is a long frame on its own).
  const fxIds = new Set(['h_hit_tiger', 'h_kill', 'k_revive', A.FX.revive, A.FX.shield, A.FX.heal]);
  const skFx = id => { const d = id && SK[id]; if (!d) return; if (d.fx) fxIds.add(d.fx); if (d.fxs) for (const f of d.fxs) fxIds.add(f); };
  for (const c of A.CLASSES) { const kit = kitFor(c); for (const id of [kit.basic[0], kit.aoe[0], kit.ult[0], kit.heal, kit.group, kit.curse]) skFx(id); }
  for (const id of ['c_heal', 'p_realm', 'p_barrier', 'w_tiger', 'w_roar', 'm_curse', 'p_sky']) skFx(id);
  for (const [id, d] of Object.entries(SK)) if (d.cls === cls.id) skFx(id);
  for (const col of Object.values(A.SHOT_FX || {})) fxIds.add(col);
  for (const id of fxIds) {
    const f = id && A.M().fx[id];
    const im = f && A.images[`fx/${f.src || id}.png`];
    if (im && im.decode && !im.__decoded) loads.push(im.decode().then(() => { im.__decoded = true; }).catch(() => {}));
  }
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
  const M = A.M(), mp = M.ywar[def.id];
  const W = G.war = {
    def, mode: def.mode, role, side, t: 0, left: def.time, over: false, score: [0, 0], feed: [], ghosts: [], crates: [], zones: [],
    bodies: [], squads: [], nextId: 1, flow: new Map(), sndT: 0, shoutT: 0, fxN: 0, round: 1, gateDown: false,
    map: { cols: mp.cols, rows: mp.rows, w: mp.w, h: mp.h, chunk: mp.chunk, walk: Uint8Array.from(mp.walk.join(''), c => (c === '.' ? 1 : 0)) },
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
  // hero of 승급 brings more than its blows (its spells' reach and holds, its 격, its armour, its
  // life given back): a 5차 hero that played won every war, most by far (300 : 130). The
  // enemy's fighters and guards strike harder and last longer by the hero's 승급 (its 진영대장
  // strikes harder; its life, the war's objective, is left as it was), up to
  // 5차 (+8.5%; past it the hero's blows are capped by War.scale anyway, and more made a 9차 hero
  // lose most wars): measured with the test bots, a hero that stands about loses most wars, one
  // that fights and plays the objective wins most, not all.
  W.tier = A.promo ? A.promo(G.cls.id) : 0;
  // Past 5차 the enemy keeps growing a little (toward an even war at 9차 on the hard modes).
  W.foeK = window.__warFoeK || 1 + FOE_K5 * Math.min(5, W.tier) + FOE_K9 * clamp(W.tier - 5, 0, 4);
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
    for (let s = 0; s < squadsOf('war'); s++) {
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
  A.say(`[${def.name}] ${W.teams[0].name} 길드 대 ${W.teams[1].name} 길드 — ${def.title}. 역할: ${ROLES[role].name}`, 'sys');
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
    W.cart = { i: 0, x: 0, y: 0, best: [0, 0], speed: 0.8, boost: 0 };
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
  }
  for (const t of W.teams) t.spawn = snap(W, t.spawn[0], t.spawn[1]);
  W.zones = (d.scouts || []).map(([x, y]) => { const s = snap(W, x, y); return { x: s[0], y: s[1], owner: -1, prog: 0, kind: 'scout', until: 0 }; });
}

function mkFighter(W, team, role, squad) {
  const classes = A.CLASSES.filter(c => rolesFor(c).includes(role));
  const cls = pick(classes.length ? classes : A.CLASSES);
  const lv = Math.round(rnd(18, 42));
  // Its look by its strength (aiLooks): the step of its level, now and then one either side; the
  // same looks on every side (the ▼ over the head tells the sides apart).
  const pool = (W.looks = W.looks || {})[cls.id] = W.looks[cls.id] || Array.from({ length: LOOK_STEPS }, (_, i) => aiLook(cls, i));
  const step = clamp(Math.floor((lv - 18) / 6.01) + (Math.random() < 0.3 ? pick([-1, 1]) : 0), 0, pool.length - 1);
  const gear = pool[step];
  // 전장 보정: a fighter's own strength (level and gear) counts, but pulled toward the field's.
  const own = Math.sqrt(lv / 30) * (0.85 + 0.3 * Math.random());
  const pw = (1 + (own - 1) * 0.35) * (team === 1 && !W.raid ? W.foeK || 1 : 1);
  const hpK = fighterHpK(role, cls);
  const name = pick(NAMES) + pick(TAGS);
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
      maxHp: W.refHp * (W.mode === 'commander' ? 10 : W.mode === 'siege' ? 14 : 20), hp: 0, x: 0, y: 0, tx: 0, ty: 0, fx: 0, fy: 0, mt: 0, dur: 0.4, moving: false, phase: 0,
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
  if (x < 0 || y < 0 || x >= m.cols || y >= m.rows || !m.walk[y * m.cols + x]) return false;
  const g = W.gate;
  if (g && !W.gateDown && x >= g.x0 && x <= g.x1 && y >= g.y0 && y <= g.y1 && team !== g.team) return false;
  return true;
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
  const key = x + ',' + y + ',' + (W.gate && !W.gateDown ? team === W.gate.team ? 'g' : 'n' : '');
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
  if (W.flow.size > 48) W.flow.delete(W.flow.keys().next().value);
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
  A.occ.delete(k2(b.tx, b.ty));
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
  /** Whether a body can be carried from (x0, y0) to (x1, y1) in one move (a leap, a dash, a pull):
   * the tile is open and no wall or shut gate stands on the straight line between. */
  clear: (x0, y0, x1, y1) => {
    const W = A.G().war;
    if (W.raid) return true;
    if (!open(W, x1, y1, 0)) return false;
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 3;
    for (let i = 1; i < n; i++) if (!open(W, Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), 0)) return false;
    return true;
  },
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
    const target = W.U * 2.6 * (1 + 0.03 * Math.max(0, G.player.lvl - W.startLvl)) * (W.role === 'dps' ? W.heroDmgK : 1) * (W.jaeng ? JAENG.heroK : 1);
    const out = rate > target ? dmg * target / rate : dmg;
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
  raidScale: dmg => raidScale(dmg),
  raidCredit: (e, dmg, killed) => raidCredit(e, dmg, killed),
  raidCut: () => raidHeroCut(),
  raidHeroHurt: () => 0.75 * raidHurtK(),
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
  ROLES,
};

function update(dt) {
  const G = A.G(), W = G.war;
  if (!W || W.over) return;
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
    if (W.jaeng) for (const t of W.teamIds) jaengPlan(W, t);
    else {
      warPhase(W);
      orders(W, 0);
      orders(W, 1);
    }
    heroLead(W);
  }
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
    if (b.stun <= 0) (W.jaeng ? thinkJaeng : W.raid && !b.cmdr && !b.troop ? thinkRaid : think)(W, b);
  }
  if (!b.moving && b.stun <= 0 && b.dest) walk(W, b);
}

/** One tile toward the body's destination along the field's paths; around a body in the way. */
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
    const f = flowTo(W, dx0, dy0, b.team), here = f[b.ty * cols + b.tx];
    opts = [];
    for (const [dx, dy] of DIR4) {
      const nx = b.tx + dx, ny = b.ty + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= W.map.rows) continue;
      const v = f[ny * cols + nx];
      if (v >= 0 && (here < 0 || v < here)) opts.push([dx, dy, v]);
    }
    opts.sort((a, c) => a[2] - c[2]);
  }
  const dur = 0.25 * 70 / b.speed * (b.slow > 0 ? 1.6 : 1) * (b.carry && b.role !== 'support' ? 1.25 : 1) * (b.cmdr ? 1.3 : 1);
  const safe = (W.raid || W.jaeng) && W.danger.size && !W.danger.has(dk(b.tx, b.ty));
  for (const [dx, dy] of opts) {
    const nx = b.tx + dx, ny = b.ty + dy;
    if (!open(W, nx, ny, b.team)) continue;
    // Not onto a red tile it has seen (a careless one walks in anyway).
    if (safe && W.danger.has(dk(nx, ny)) && b.dodge > 0.6) continue;
    if (A.step(b, dx, dy, dur)) { b.fdx = dx; b.fdy = dy; b.blocked = 0; moved(b, 'walk'); return; }
  }
  // Fighters are players: one of its own side standing in the way changes places (both step).
  // In a war too: a crowd at the camp (its guards, the risen) boxed a fighter in for good.
  if (opts.length) {
    const [dx, dy] = opts[0], o = A.occ.get(k2(b.tx + dx, b.ty + dy));
    if (o && o.war && o.team === b.team && !o.moving && !o.dead && !o.cmdr && open(W, b.tx + dx, b.ty + dy, b.team) && open(W, b.tx, b.ty, o.team)) {
      A.occ.delete(k2(o.tx, o.ty));
      A.occ.delete(k2(b.tx, b.ty));
      const ox = o.tx, oy = o.ty;
      startStep(o, b.tx, b.ty, dur);
      startStep(b, ox, oy, dur);
      moved(o, 'swap'); moved(b, 'swap');
      b.fdx = dx; b.fdy = dy; b.blocked = 0;
      return;
    }
  }
  // Blocked: a sidestep now and then, so a crowd flows round instead of jamming.
  b.blocked = (b.blocked || 0) + 1;
  if (b.blocked > 2) {
    const [dx, dy] = pick(DIR4);
    if (open(W, b.tx + dx, b.ty + dy, b.team) && A.step(b, dx, dy, dur)) { b.fdx = dx; b.fdy = dy; moved(b, 'side'); }
    b.blocked = 0;
  }
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
  A.occ.set(k2(nx, ny), b);
}

// ---------------------------------------------------------------- thinking

function enemiesNear(W, b, r) {
  const out = [];
  for (const e of foesOf(W, b.team)) {
    if (e.gate) continue;
    if (W.jaeng && inCamp(W, e)) continue;
    const d = d2(b, e);
    if (d <= r) out.push([e, d]);
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
    const s = d - (e.role === 'tank' ? 1.6 : 0) + 0.8 * Math.min(4, e.engaged || 0) + (e.hero ? 0.8 : 0) + (e.troop || e.cmdr ? 1 : 0) + (inDuel(W, b, e) ? 6 : 0);
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
  // The timid: tucked behind a wall or in a corner while the odds are bad (hideThink).
  if (hideThink(W, b, order)) return;
  // Low: back to a healer or the camp; back in once mended.
  if (b.state !== 'retreat' && (k < (b.role === 'tank' ? 0.2 : 0.3)) && !b.carry) {
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
  if (soloThink(W, b, order)) return;
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
    } else if (t.gate) {
      b.dest = gateFront(W, b);
    } else if (dist > 1.1) b.dest = [t.tx, t.ty];
    else b.dest = null;
    // The timid keep to the edge of a fight: a blade goes in only on a foe its friends are on
    // already (else it waits a few tiles back), a caster strikes from its full reach.
    if (b.timid && !t.gate && !t.cmdr && W.phase !== 'final' && b.role !== 'healer') {
      const ax = Math.sign(b.tx - t.tx), ay = Math.sign(b.ty - t.ty);
      if (range <= 1 && !(t.engaged > 0) && dist > 1.1 && t.target !== b) b.dest = dist > 4 ? [t.tx + ax * 3, t.ty + ay * 3] : null;
      else if (range > 1 && dist < range - 1 && !t.gate) b.dest = [clamp(b.tx + (ax || pick([-1, 1])) * 2, 0, W.map.cols - 1), b.ty + ay];
    }
    if (dist <= range + 0.5) act(W, b, t);
    // A fighter does not chase far from its order.
    // (One that chases a kill goes further, and lags behind its squad.)
    if (Math.abs(b.tx - order.x) + Math.abs(b.ty - order.y) > (b.greedy && hpk(t) < 0.4 ? 20 : 14) && !t.gate && !t.cmdr) b.dest = [order.x, order.y];
    return;
  }
  // Nothing to fight: to the order's spot, in a loose formation by role.
  b.dest = formation(W, b, order);
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
  if (b.jx === undefined) { const a = Math.random() * Math.PI * 2, r = 0.8 + Math.random() * 2.6; b.jx = Math.round(Math.cos(a) * r); b.jy = Math.round(Math.sin(a) * r * 0.8); }
  const toward = order.face || [0, 0];
  let ox = 0, oy = 0;
  if (b.role === 'tank') { ox = toward[0] * 2; oy = toward[1] * 2; }
  else if (b.role === 'healer') { ox = -toward[0] * 2; oy = -toward[1] * 2; }
  return snap(W, order.x + ox + b.jx, order.y + oy + b.jy);
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
      + (e.carry ? 3 : 0) - (e.hero ? 1 : 0) - (e.cmdr ? 2 : 0) - (e.troop ? 1.5 : 0) - 0.4 * Math.min(5, e.engaged || 0);
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
      A.say(`★${b.name}: ${who}부터 잡아요!`, 'party');
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
  let low = null, lk = 0.92;
  for (const m of W.alive[b.team]) {
    if (m.gate || m.cmdr) continue;
    const d = d2(m, b);
    if (d > 9) continue;
    const struck = G.t - (m.lastHitT || -9) < 2.5;
    const k = hpk(m) - (m.squad === sq ? 0.04 : 0) - (m.role === 'tank' ? (struck ? 0.2 : 0.06) : 0) - (struck ? 0.04 : 0) + (m.troop ? 0.15 : 0) + (d > 7 ? 0.05 : 0) - (m.hero ? (b.pocket ? 0.25 : 0.04) : 0);
    if (k < lk) { lk = k; low = m; }
  }
  const hurt = W.alive[b.team].filter(m => !m.gate && d2(m, b) < 5 && hpk(m) < 0.7).length;
  if (hurt >= 3 && b.cd.d <= 0 && b.mp >= 0.1) {
    b.cd.d = 12;
    b.mp -= 0.12;
    const gid = b.kit.group || b.kit.heal;
    // A field of light on the ground under the squad (연's 선인의영역), the heal falling on all in it.
    castFx(W, b, SK.p_realm ? 'p_realm' : gid, b, 1.2);
    shout(W, b, gid ? SK[gid].name : '천공의희원');
    for (const m of W.alive[b.team]) if (!m.gate && !m.cmdr && d2(m, b) < 5) healBody(W, b, m, m.maxHp * 0.12);
    pose(b, 'cast');
  } else if (low && b.cd.a <= 0 && d2(low, b) <= 7) {
    b.cd.a = b.mp < 0.1 ? 4.4 : 3.2;
    b.mp = Math.max(0, b.mp - 0.05);
    // Its class's own 기원 (누리의 기원's grade by its level, a poet's 천공·생명의 기원 …).
    const hid = b.party && b.party.heals.length ? pick(b.party.heals) : b.kit.heal || 'c_heal';
    const n = low.maxHp * (0.08 + 0.02 * b.pw);
    A.addShot(b, low, { color: '#58e868', glow: '#b8ffb0', size: 4, speed: 420, onHit: () => { healBody(W, b, low, n); if (low.hero && b.team === 0 && !A.G().dead) heroMended(W, b, hid); } });
    if (onScreen(b)) {
      const d = SK[hid];
      const fx = d && d.fxs ? d.fxs[Math.min(7, Math.floor(b.lv / 6))] : d && d.fx;
      if (fx && fxOk() && !low.hero) { A.addFx(fx, low.x, low.y - 26, { scale: 0.8 * aiFx() }); cue(b, 0.6); }
      if (Math.random() < 0.25) shout(W, b, d ? (d.names ? d.names[Math.min(7, Math.floor(b.lv / 6))] : d.name) : '기원');
      sound(W, b, 'skill_c_heal', 'heal');
    }
    pose(b, 'cast');
  } else if (b.cd.b <= 0) {
    // 보호: the squad near takes less for a while.
    b.cd.b = 14;
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
      } else at = d2(anchor, order) < 6 ? formation(W, b, order) : [anchor.tx + (b.jx || 0), anchor.ty + 1];
    } else at = formation(W, b, order);
    const [sx, sy] = snap(W, at[0], at[1]);
    b.dest = Math.abs(sx - b.tx) + Math.abs(sy - b.ty) <= 1 ? null : [sx, sy];
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
  let low = null, lk = 0.85;
  for (const m of W.alive[b.team]) {
    if (m.gate || m.cmdr || d2(m, b) > (m.hero ? 8.5 : 7)) continue;
    const k = hpk(m) - (m.squad === sq ? 0.05 : 0) - (m.role === 'tank' ? 0.05 : 0);
    if (k < lk) { lk = k; low = m; }
  }
  const hurt = W.alive[b.team].filter(m => !m.gate && d2(m, b) < 5 && hpk(m) < 0.7).length;
  if (hurt >= 3 && b.cd.d <= 0 && b.mp >= 0.1) {
    b.cd.d = 12;
    b.mp -= 0.12;
    const gid = b.kit.group || b.kit.heal;
    // A field of light on the ground under the squad (연's 선인의영역), the heal falling on all in it.
    castFx(W, b, SK.p_realm ? 'p_realm' : gid, b, 1.2);
    shout(W, b, gid ? SK[gid].name : '천공의희원');
    for (const m of W.alive[b.team]) if (!m.gate && !m.cmdr && d2(m, b) < 5) healBody(W, b, m, m.maxHp * 0.12);
    pose(b, 'cast');
  } else if (low && b.cd.a <= 0) {
    b.cd.a = b.mp < 0.1 ? 4.4 : 3.2;
    b.mp = Math.max(0, b.mp - 0.05);
    // Its class's own 기원 (누리의 기원's grade by its level, a poet's 천공·생명의 기원 …).
    const hid = b.party && b.party.heals.length ? pick(b.party.heals) : b.kit.heal || 'c_heal';
    const n = low.maxHp * (0.08 + 0.02 * b.pw);
    A.addShot(b, low, { color: '#58e868', glow: '#b8ffb0', size: 4, speed: 420, onHit: () => { healBody(W, b, low, n); if (low.hero && b.team === 0 && !A.G().dead) heroMended(W, b, hid); } });
    if (onScreen(b)) {
      const d = SK[hid];
      const fx = d && d.fxs ? d.fxs[Math.min(7, Math.floor(b.lv / 6))] : d && d.fx;
      if (fx && fxOk() && !low.hero) { A.addFx(fx, low.x, low.y - 26, { scale: 0.8 * aiFx() }); cue(b, 0.6); }
      if (Math.random() < 0.25) shout(W, b, d ? (d.names ? d.names[Math.min(7, Math.floor(b.lv / 6))] : d.name) : '기원');
      sound(W, b, 'skill_c_heal', 'heal');
    }
    pose(b, 'cast');
  } else if (b.cd.b <= 0) {
    // 보호: the squad near takes less for a while.
    b.cd.b = 14;
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
      for (const m of mates) guard(W, m, 5);
      shout(W, b, pick(['보호', '무장', '의지의 외침']));
      // 차폐's ground ward round the supporter: the squad within takes less.
      castFx(W, b, SK.p_barrier ? 'p_barrier' : null, b, 1.2);
      credit(b, 'obj', 4);
      pose(b, 'cast');
    }
  }
  if (b.cd.c <= 0) {
    const t = nearest(W, b, 6);
    if (t) {
      b.cd.c = 9;
      const ids = b.kit.curse || 'm_curse';
      for (const [e] of packNear(W, t, 1.5)) { e.curse = Math.max(e.curse, 4); if (Math.random() < 0.35) e.slow = Math.max(e.slow, 2); }
      castFx(W, b, ids, t, 0.9);
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
    b.dest = d2(b, t) > 1.1 ? [t.tx, t.ty] : null;
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
      if (onScreen(b) && fxOk(true)) A.fxOn(SK.w_tiger.fx, near[0][0], { scale: 1.1 * aiFx() });
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
      if (onScreen(b) && fxOk(true)) A.addFx(SK.w_roar.fx, b.x, b.y - 30, { scale: 1.4 * aiFx() });
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
  face(b, t);
  // The 도적's 투명 and 암습 (game.js AMBUSH): it fades (foes pass it over), closes in a moment, and
  // its first blow out of hiding lands three times as hard, with 연's 암살 on the struck.
  if (kit.stealth && !t.gate) {
    if (b.hidden > G.t) {
      if (G.t < b.stalk) return;
      b.hidden = 0;
      b.cd.a = kit.basic[2] * rnd(0.9, 1.1);
      hit(W, b, t, kit.basic[1] * W.U * 2.2 * b.pw * 3);
      if (onScreen(t) && fxOk(true) && SK.r_amsal) A.fxOn(SK.r_amsal.fx, t, { scale: 0.6 * aiFx() });
      if (Math.random() < 0.5) shout(W, b, '암습');
      sound(W, b, 'skill_r_amsal', 'strike');
      pose(b, 'attack');
      return;
    }
    if (G.t > (b.stealthAt || 0) && !t.cmdr) {
      b.stealthAt = G.t + rnd(12, 16);
      b.hidden = G.t + 4;
      b.stalk = G.t + 1.2;
      if (onScreen(b) && fxOk() && SK[kit.stealth]) A.addFx(SK[kit.stealth].fx, b.x, b.y - 26, { scale: 0.7 * aiFx() });
      sound(W, b, 'skill_' + kit.stealth, 'buff');
      return;
    }
  }
  const many = t.gate ? 0 : packNear(W, t, 1.5).length;
  const big = t.cmdr || t.gate || t.hero || t.kind === 'boss' || many >= 3;
  if (b.cd.d <= 0 && kit.ult[0] && (big || hpk(t) < 0.5)) {
    b.cd.d = kit.ult[2] * rnd(0.9, 1.2);
    const id = kit.ult[0];
    if (b.cls.id === 'poet') {
      // 태양의희원 / its like: everyone near is mended and guarded.
      for (const m of W.alive[b.team]) if (!m.gate && !m.cmdr && d2(m, b) < 5) { healBody(W, b, m, m.maxHp * 0.3); guard(W, m, 4); }
      castFx(W, b, id, b, 1.0);
    } else {
      castFx(W, b, id, t, 1.0);
      const fall = kit.ult[1] * W.U * b.pw;
      A.later(0.3, () => {
        if (W.over) return;
        hit(W, b, t, fall);
        for (const [e] of packNear(W, t, 1.5)) if (e !== t) hit(W, b, e, fall * 0.5);
      });
    }
    shout(W, b, SK[id] ? SK[id].name : '필살');
    sound(W, b, 'skill_' + id, 'ult');
    pose(b, kit.range > 1 ? 'cast' : 'attack');
    return;
  }
  if (b.cd.c <= 0 && kit.aoe[0] && (many >= 2 || t.gate || t.cmdr || t.kind === 'boss')) {
    b.cd.c = kit.aoe[2] * rnd(0.9, 1.15);
    const id = kit.aoe[0];
    castFx(W, b, id, t, 0.9);
    const n = kit.aoe[1] * W.U * 2 * b.pw;
    if (t.gate) hit(W, b, t, n * 1.2);
    else for (const [e] of packNear(W, t, 1.5)) {
      hit(W, b, e, n);
      if (id === 'm_para' || id === 'w_roar') e.stun = Math.max(e.stun, 1);
      if (id === 'm_curse') e.curse = Math.max(e.curse, 4);
    }
    if (Math.random() < 0.5) shout(W, b, SK[id] ? SK[id].name : '광역');
    sound(W, b, 'skill_' + id, 'spell');
    pose(b, kit.range > 1 ? 'cast' : 'attack');
    return;
  }
  if (b.cd.a > 0) return;
  b.cd.a = kit.basic[2] * rnd(0.9, 1.1);
  const id = kit.basic[0], n = kit.basic[1] * W.U * 2.2 * b.pw * (t.gate ? 1.3 : 1);
  if (kit.range > 1) {
    const d = id && SK[id];
    const fx = d ? (d.fxs ? d.fxs[Math.min(7, Math.floor(b.lv / 6))] : d.fx) : null;
    if ((onScreen(b) || onScreen(t)) && G.shots.length < 14) {
      A.addShot(b, t, { color: b.cls.id === 'poet' ? '#5aa8ff' : b.cls.id === 'archer' ? '#ffe680' : '#ff8a20', size: 3, speed: 460,
        onHit: () => { if (!W.over) { hit(W, b, t, n); if (fx && fxOk() && onScreen(t)) A.fxOn(fx, t, { scale: 0.7 * aiFx() }); } } });
    } else A.later(0.25, () => { if (!W.over) hit(W, b, t, n); });
    if (id) sound(W, b, 'skill_' + id, 'spell');
    pose(b, 'cast');
  } else {
    hit(W, b, t, n);
    if (onScreen(t) && fxOk()) {
      const fx = id && SK[id] && SK[id].fx;
      if (fx && Math.random() < 0.5) A.fxOn(fx, t, { scale: 0.6 * aiFx() });
      else if (A.M().fx.h_hit_tiger) A.fxOn('h_hit_tiger', t, { scale: 0.45 * aiFx() });
    }
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
  b.cd.c = 9;
  for (const [e] of enemiesNear(W, b, 3)) if (!e.hero && !e.cmdr) e.taunt = { by: b, until: G.t + 3 };
  shout(W, b, pick(['도발', '이리 와라', '어그로']));
  credit(b, 'obj', 2);
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
// The fighters' spells were drawn small (half the hero's size) and a dozen at most in 0.6 s for the
// whole field: in a crowd hardly one in four showed, and those as specks. Now they are drawn near
// the hero's own size (aiFx), the great ones (광역기·필살기) from a budget of their own so the
// blows of fifty never crowd them out, and the caster lights up under its feet as it casts (cue),
// so who cast what reads at a glance.
// (a raid's twenty-four strike one boss: a little smaller there, or they hide it)
const aiFx = () => (A.G().war && A.G().war.raid ? 1.05 : 1.2);
function fxOk(big) { return !(window.__dbgWar && window.__dbgWar.nofx) && (big ? A.fxBudget('warBig', 9) : A.fxBudget('war', 14)); }
function castFx(W, b, id, at, scale) {
  if (!id || !SK[id] || !(onScreen(b) || onScreen(at)) || !fxOk(true)) return;
  const fx = SK[id].fx;
  cue(b, scale >= 1 ? 1 : 0.75);
  if (fx && A.M().fx[fx]) A.fxOn(fx, at, { scale: scale * aiFx() });
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
    W.pkHeat[src.team][t.team] += dmg;
  }
  if (src.team === 0 && !src.hero && A.auraK) dmg *= A.auraK(src); // 주작의 기운 (game.js auraK): the hero's aura on its side
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
    let d = dmg / W.refHp * G.player.maxHp * 0.85 * (W.heroArmorK || 1);
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
    t.hp -= dmg;
    t.flash = 0.1;
    credit(src, 'dmg', dmg);
    credit(src, 'obj', dmg / W.refHp * 6);
    num(W, t, dmg, false);
    if (t.hp <= 0) gateBreak(W, src);
    return;
  }
  t.hp -= dmg;
  t.flash = 0.12;
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
  const target = CAP_OVER * Math.max(W.rates.role[what], 0.3 * W.rates.all[what]);
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
  A.occ.delete(k2(f.tx, f.ty));
  const list = listOf(f.team);
  const at = list.indexOf(f);
  if (at >= 0) list.splice(at, 1);
  // A raider lies longer (a healer can raise it meanwhile) and longer still once the boss rages.
  const respawnK = W.jaeng ? jaengRise(W, f.team, f.stats.deaths) : W.raid ? 14 + Math.min(8, W.t / 40) + (G.enraged ? 12 : 0)
    : (f.cmdr ? 40 : f.troop ? 25 : 7 + Math.min(6, W.t / 60)) + (W.slowRise === f.team ? 5 : 0)
      // 대장전 is scored in kills: a guild well ahead rises a little slower, one well behind a little
      // sooner (a lead fed itself — fewer foes up, more kills — to 180 : 90 either way).
      + (W.mode === 'commander' && !f.cmdr && !f.troop ? clamp((W.score[f.team] - W.score[1 - f.team]) / 12, -3, 3) : 0);
  f.respawnAt = W.mode === 'commander' && f.cmdr ? 0 : G.t + respawnK;
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
  if (f.cmdr) credit(by, 'obj', 60);
  else if (f.carry) credit(by, 'obj', 10);
  // The hero gains as from a kill.
  const heroIn = by === W.hero || (f.lastHitBy === W.hero);
  if (heroIn || (W.hero.stats && [...f.hitBy.keys()].includes(W.hero))) A.gainXp(Math.max(3, A.xpFor(G.player.lvl) / (W.role === 'dps' ? 6 : 9)));
  if (onScreen(f) && A.M().fx.h_kill && A.fxBudget('kill', 6)) A.fxOn('h_kill', f, { scale: f.cmdr ? 1.2 : 0.7 });
  if (!f.troop) W.feed.push({ t: G.t, a: by ? by.name || (by.m && by.m.name) || '몬스터' : '?', at: by && by.team !== undefined ? by.team : W.teamIds ? -1 : 1 - f.team, b: f.name, bt: f.team, big: !!f.cmdr });
  if (W.mode === 'commander' && !f.troop && by) W.score[by.team] += f.cmdr ? 0 : 1;
  if (f.cmdr) {
    A.say(`${f.name}${f.team === 0 ? '이 쓰러졌습니다!' : '을 쓰러뜨렸습니다!'}`, f.team === 0 ? 'warn' : 'sys');
    A.banner(`${f.name} 격파!`);
    if (W.mode === 'capture') W.score[1 - f.team] += 40;
    if (W.mode === 'escort' && W.cart && f.team !== W.attacker) W.cart.boost = G.t + 15;
  } else if (by && by.team === 0 && by.stats && by !== W.hero && Math.random() < 0.12) talk(W, by, ['하나 잡았다!', '처치!', 'ㅋㅋ 잡음', '나이스!']);
  else if (f.team === 0 && f.squad && f.squad.leader === f && Math.random() < 0.5 && (f.squad === W.hero.squad || d2(f, W.hero) < 14) && G.t - (W.chatT || -99) >= 3) { W.chatT = G.t; A.say(`★${f.name}(${W.raid ? '파티장' : '분대장'}) 쓰러짐! 다시 모여요!`, 'warn'); }
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
  W.heroBack = G.t + (W.jaeng ? jaengRise(W, 0, W.hero.stats.deaths) : W.raid ? 9 + Math.min(8, W.t / 45) : 7 + Math.min(6, W.t / 60));
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
      if (fx) A.addFx(fx, low.x, low.y - 26, { scale: 0.9 });
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
      A.addFx(A.FX.shield, 0, -26, { follow: true, scale: 0.8 });
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

/** The hero's 기원 in a war also mends the allies close by (a healer's more). */
function heroHeal(n, fx) {
  const G = A.G(), W = G.war, p = G.player;
  const k = Math.min(W.role === 'healer' ? 0.08 * W.roleK : 0.04, (W.role === 'healer' ? 1.6 * W.roleK : 0.6) * n / p.maxHp);
  for (const m of G.party) {
    if (m.dead || d2(m, W.hero) > 4) continue;
    healBody(W, W.hero, m, m.maxHp * k);
    if (fx && fxOk() && W.role === 'healer') A.addFx(fx, m.x, m.y - 26, { scale: 0.6 * aiFx() });
  }
}

// ---------------------------------------------------------------- objectives

function objectives(W, dt) {
  const G = A.G();
  // Supply crates: a few at a time at their spots; carried home, they help the guild.
  W.crateT = (W.crateT || 6) - dt;
  const spots = W.mode === 'siege' ? W.def.cratesOut.concat(W.def.cratesIn) : W.def.crates;
  if (W.crateT <= 0 && W.crates.length < 3) {
    W.crateT = 18;
    const s = snap(W, ...pick(spots));
    if (!W.crates.some(c => c.x === s[0] && c.y === s[1])) {
      W.crates.push({ x: s[0], y: s[1], by: null, t: G.t });
      if (Math.random() < 0.5) A.say('보급 상자가 놓였습니다. 진영(목표)으로 나르면 길드에 도움이 됩니다.', 'sys');
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
  if (W.mode === 'capture') { W.score[team] += 15; what = '거점 점수 +15'; }
  else if (W.mode === 'escort') { if (team === W.attacker) { W.cart.boost = G.t + 8; what = '수레 가속'; } else { W.cart.jam = G.t + 6; what = '수레 정지'; } }
  else if (W.mode === 'siege') {
    if (team === W.attacker && !W.gateDown) { W.gate.hp -= W.gate.maxHp * 0.07; what = '공성 화약: 성문 -7%'; if (W.gate.hp <= 0) gateBreak(W, b); }
    else if (!W.gateDown) { W.gate.hp = Math.min(W.gate.maxHp, W.gate.hp + W.gate.maxHp * 0.05); what = '성문 수리 +5%'; }
    else { const c2 = W.teams[team].cmd; healBody(W, b, c2, c2.maxHp * 0.08); what = '진영대장 회복'; }
  } else { const c2 = W.teams[team].cmd; healBody(W, b, c2, c2.maxHp * 0.1); W.score[team] += 2; what = '진영대장 회복 +10%'; }
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

function capture(W, dt) {
  const G = A.G();
  for (const f of W.flags) {
    const [n0, n1] = countAt(W, f.x, f.y, 2.2);
    const sup0 = W.alive[0].filter(b => b.role === 'support' && Math.hypot(b.tx - f.x, b.ty - f.y) <= 2.2).length;
    const sup1 = W.alive[1].filter(b => b.role === 'support' && Math.hypot(b.tx - f.x, b.ty - f.y) <= 2.2).length;
    const heroSup = W.role === 'support' && heroIn(W, f.x, f.y, 2.2) ? W.roleK : 0;
    const push = (n0 + sup0 + heroSup) - (n1 + sup1);
    if (n0 && n1) { f.contest = true; continue; }
    f.contest = false;
    if (!push) continue;
    const before = f.owner;
    // prog runs -1 (ours) .. 1 (theirs); a flag turns neutral at 0.
    f.prog = clamp(f.prog - push * dt * 0.12, -1, 1);
    if (f.prog <= -1 && f.owner !== 0) f.owner = 0;
    else if (f.prog >= 1 && f.owner !== 1) f.owner = 1;
    else if (Math.abs(f.prog) < 0.05 && f.owner !== -1 && Math.sign(-push) !== (f.owner === 0 ? -1 : 1)) f.owner = -1;
    // Standing in the circle is work: points for whoever holds it there.
    const who = push > 0 ? 0 : 1;
    for (const b of W.alive[who]) if (!b.gate && Math.hypot(b.tx - f.x, b.ty - f.y) <= 2.2) credit(b, 'obj', dt * 2.5);
    if (before !== f.owner && f.owner >= 0) {
      A.say(`${W.teams[f.owner].name} 길드가 ${f.name} 거점을 점령했습니다!`, f.owner === 0 ? 'sys' : 'warn');
      if (f.owner === 0) A.banner(`${f.name} 거점 점령!`);
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
  if (na && !nd && !(c.jam > G.t)) {
    const v = c.speed * (c.boost > G.t ? 1.6 : 1) * (1 + 0.1 * Math.min(4, na - 1));
    c.i = Math.min(W.path.length - 1, c.i + v * dt);
    c.moving = true;
    for (const b of W.alive[att]) if (!b.gate && Math.hypot(b.tx - c.tx, b.ty - c.ty) <= 3) credit(b, 'obj', dt * 2);
  } else if (nd && !na) {
    for (const b of W.alive[1 - att]) if (!b.gate && Math.hypot(b.tx - c.tx, b.ty - c.ty) <= 3) credit(b, 'obj', dt * 1.5);
  }
  cartPos(W);
  c.best[att] = Math.max(c.best[att], c.i);
  // Half time (or the end reached): the guilds change sides.
  const done = c.i >= W.path.length - 1;
  if (W.round === 1 && (W.left <= W.def.time - W.def.half || done)) {
    W.round = 2;
    W.left = W.def.half;
    A.say(`전반 종료: ${W.teams[att].name} 길드가 ${Math.round(c.best[att] / (W.path.length - 1) * 100)}%까지 밀었습니다. 공수 교대!`, 'sys');
    A.banner('공수 교대!');
    W.attacker = 1 - att;
    resetEscort(W);
    for (const b of W.bodies) if (!b.dead) placeBody(W, b, b.home || W.teams[b.team].spawn);
    if (!G.dead) heroTo(...W.teams[0].spawn);
    W.flow.clear();
    orders(W, 0, true);
    orders(W, 1, true);
  }
}

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
  A.say(`${by ? by.name : '?'}의 일격에 성문이 무너졌습니다! ${W.teams[W.attacker].name} 길드가 성 안으로 들어갑니다.`, W.attacker === 0 ? 'sys' : 'warn');
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
      for (let i = 0; i < squads.length; i++) set(squads[i], g.tx + (i % 3 - 1) * 1.5, i < 3 ? g.y1 + 2 : g.y0 - 2, 'hold', null, i === 0 ? '성문 앞으로 나가 막아요!' : null);
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
  squads[0].keep = true;
  set(squads[0], myC.home[0] + Math.sign(mid[0] - myC.home[0]) * 3, myC.home[1], 'defend', null, '대장 곁을 지킵니다');
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
  if (to.hero) {
    const p = G.player;
    if (d.buff === 'power') {
      // Not over a stronger one of the hero's own.
      if (!(G.buffs.power > G.t) || (G.buffs.powerK || 0) <= (d.power || 0.4)) G.buffs.powerK = Math.min(0.6, d.power || 0.4);
      G.buffs.power = Math.max(G.buffs.power, G.t + dur);
    } else if (d.buff === 'guard') G.buffs.guard = Math.max(G.buffs.guard, G.t + Math.min(1.5, d.duration || 1.5));
    else G.buffs[d.buff] = Math.max(G.buffs[d.buff] || 0, G.t + dur);
    if (fx && fxOk()) A.addFx(fx, 0, -26, { follow: true, scale: 0.8 });
    A.floatText(p.x, p.y - 84, name, '#bfe8ff', true);
    supCount(W, 'buff');
    (W.sup.names[name] = (W.sup.names[name] || 0) + 1);
    chat(W, b, 'buffHero', [`${name} 걸어드림`, `${name} 드려요~`, `${name}!`, '버프 받으세요'], { every: 18, p: 0.7 });
  } else {
    if (d.buff === 'power') { to.powT = G.t + dur; to.powK = 1.15; }
    else to.shield = Math.max(to.shield || 0, G.t + dur);
    if (fx && fxOk() && onScreen(to)) A.fxOn(fx, to, { scale: 0.6 });
  }
  shout(W, b, name);
  pose(b, 'cast');
  face(b, to);
}

/** A healer's mend has reached the hero: the 기원's picture over it, its name, a word now and then. */
function heroMended(W, b, hid) {
  const G = A.G(), p = G.player, name = spellName(hid, b.lv), fx = spellFx(hid, b.lv);
  if (fx && fxOk()) A.addFx(fx, 0, -26, { follow: true, scale: 0.85 });
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
      A.say(`[결전] ${where} — 양 길드가 모두 모입니다!`, 'warn');
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
  else b.dest = dist > 1.1 ? [t.tx, t.ty] : null;
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
    else if (left) { win = W.score[0] >= W.score[1] ? 0 : 1; why = `시간 종료 ${W.score[0]} : ${W.score[1]}`; }
  } else if (W.mode === 'commander') {
    for (const t of [0, 1]) if (W.teams[t].cmd.dead) { win = 1 - t; why = `${W.teams[t].name} 진영대장 격파`; }
    if (win < 0 && left) {
      const s = t => W.score[t] + 30 * hpk(W.teams[t].cmd);
      win = s(0) >= s(1) ? 0 : 1;
      why = `시간 종료 · 처치 ${W.score[0]} : ${W.score[1]}`;
    }
  } else if (W.mode === 'escort') {
    const c = W.cart;
    if (W.round === 2) {
      const first = 1 - W.attacker;
      if (c.best[W.attacker] > c.best[first] + 0.01) { win = W.attacker; why = '더 멀리 호위'; }
      else if (left || c.i >= W.path.length - 1) { win = c.best[W.attacker] > c.best[first] ? W.attacker : first; why = '더 멀리 호위'; }
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
  const rows = board(W);
  const mine = rows.filter(x => x.b.team === 0);
  const rank = mine.findIndex(x => x.b === W.hero);
  const { tier, k: tierK } = tierOf(W, rows);
  const won = win === 0;
  const tierN = { S: 4, A: 3, B: 2, C: 1 }[tier];
  const mats = 2 + (won ? 3 : 0) + tierN;
  const gold = 1500 + (won ? 2500 : 0) + tierN * 700;
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
  W.result = { win, why, tier, tierK, mats, matId, gold, rank: rank + 1, rows };
  G.over = true;
  document.getElementById('levelup').hidden = true;
  G.choosing = false;
  A.audio().play(won ? 'levelup' : 'lose');
  A.say(`${W.def.name} ${won ? '승리' : '패배'}! ${why}`, won ? 'sys' : 'warn');
  setTimeout(() => showResult(W), 1400);
}

function rowHtml(W, x, i) {
  const s = x.s, me = x.b === W.hero;
  return `<tr class="t${x.b.team}${me ? ' me' : ''}"><td>${i + 1}</td><td>${x.b.name}${x.b.leader ? '★' : ''}${x.b.alt ? ' <small>(부캐)</small>' : ''}</td><td>${x.b.cls ? x.b.cls.name : ''}</td><td>${ROLES[x.b.role].name}</td>
    <td>${x.score}</td><td>${A.shownNum(s.dmg)}</td><td>${A.shownNum(s.heal)}</td><td>${A.shownNum(s.taken)}</td><td>${Math.round(s.obj)}</td><td>${s.kills}/${s.deaths}/${s.assists}</td><td>${s.revives}</td></tr>`;
}
function tables(W, rows) {
  const head = '<tr><th>#</th><th>이름</th><th>직업</th><th>역할</th><th>기여</th><th>피해</th><th>회복</th><th>받은</th><th>목표</th><th>K/D/A</th><th>부활</th></tr>';
  return `<div class="wr-cols">${(W.raid ? [0] : teamsOf(W)).map(t => `<table><caption style="color:${W.teams[t].color}">${W.teams[t].name}${W.raid ? '' : ' 길드'}${W.over ? (W.win === t ? ' · 승리' : ' · 패배') : ''}</caption>${head}${rows.filter(x => x.b.team === t).map((x, i) => rowHtml(W, x, i)).join('')}</table>`).join('')}</div>`;
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
    : `참여 2 + ${won ? '승리 3 + ' : ''}등급 보너스 ${{ S: 4, A: 3, B: 2, C: 1 }[r.tier]}`;
  box.innerHTML = `<div class="wr-title" style="${hud('ui_ink_nine') ? `background-image:url(${hud('ui_ink_nine')})` : ''}">${W.raid ? (won ? '레이드 성공' : '레이드 실패') : won ? '승리' : '패배'}</div>
    <div class="wr-stage" style="${hud('ui_light02') ? `background-image:url(${hud('ui_light02')})` : ''}">
      <img class="wr-hero" src="${heroShot(G) || A.heroPicture(G.cls)}" alt="">
      ${art ? `<img class="wr-flag" src="${hud(won ? 'ui_attack_result_win' : 'ui_attack_result_lose')}" alt="">` : ''}</div>
    <div class="wr-sub">${W.def.name} · ${W.def.title} — ${r.why}<br>내 기여: ${W.raid ? '공격대' : '길드'} ${r.rank}위 · ${ROLES[W.role].name} · 등급 <b class="wr-tier">${r.tier}</b> <small>(같은 역할 중간의 ×${r.tierK.toFixed(2)}${W.afkT > 1 ? ` · 자리비움 ${Math.round(W.afkT)}초` : ''})</small></div>
    <div class="wr-medals">${medal(mat.name, '+' + (W.raid ? r.coins : r.mats), matIcon)}${medal('전', '+' + r.gold.toLocaleString(), '')}${medal('등급', r.tier, '')}</div>
    <div class="wr-sub"><small>${tierLine} · 기여는 역할별로, 쓰러져 있던 시간은 절반만 뺍니다 (힐러·탱커도 1위가 될 수 있습니다)</small></div>
    ${tables(W, r.rows)}
    <div class="row" style="justify-content:center;display:flex;gap:8px"><button class="btn" id="wr-again">${W.raid ? '다시 도전' : '다시 출전'}</button><button class="btn" id="wr-town">마을로</button></div>`;
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
  document.body.classList.remove('war', 'jaeng');
  const share = document.getElementById('jaeng-share');
  if (share) share.hidden = true;
  A.setG(null);
  if (raid && again) A.startRun(cls, raid);
  else if (again) openBoard();
  else A.enterTown(cls);
}

function toggleBoard() {
  const G = A.G(), sb = document.getElementById('war-sb');
  if (!G || !G.war) return;
  if (!sb.hidden) { sb.hidden = true; return; }
  sb.innerHTML = `<h2 style="color:#ffd27a;text-align:center;margin:2px">현황 · ${G.war.def.name} <small>(누르면 닫힘)</small></h2>${tables(G.war, board(G.war))}`;
  sb.hidden = false;
}

/**
 * Test (window.__wallCheck = { truth?: { <war>: walk rows } }): every update, every body's tile
 * (fighters, guards, commanders, the hero, its summons, the cart) against the walk grid (or a
 * given one), and each move of more than one tile checked along its line for a wall crossed.
 * Counts by kind and cause (the last mover: walk, swap, side, place; the hero's step or leap; a
 * pull) in __wallCheck.v; the first few in __wallCheck.log.
 */
function wallCheck(W) {
  const wc = window.__wallCheck, G = A.G(), m = W.map, truth = wc.truth && wc.truth[W.def.id];
  const closed = (x, y) => x < 0 || y < 0 || x >= m.cols || y >= m.rows || (truth ? truth[y][x] !== '.' : !m.walk[y * m.cols + x]);
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
    if (closed(x, y)) add('on:' + grid + cause);
    else b.__wcBad = null;
    // (A body set down at its camp or by a revive is not carried through what lies between.)
    if (prev && cause !== 'place' && Math.abs(prev[0] - x) + Math.abs(prev[1] - y) > 1) {
      const n = Math.max(Math.abs(prev[0] - x), Math.abs(prev[1] - y)) * 3;
      for (let i = 1; i < n; i++) {
        const cx = Math.round(prev[0] + (x - prev[0]) * i / n), cy = Math.round(prev[1] + (y - prev[1]) * i / n);
        if (closed(cx, cy)) { add('cross:' + cause); break; }
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
      bodies: W.bodies.length, sup: W.sup,
    };
  }
  return {
    id: W.def.id, mode: W.mode, t: W.t, left: W.left, score: W.score.slice(), over: W.over, win: W.win, why: W.why, round: W.round,
    flags: W.flags && W.flags.map(f => f.owner), cart: W.cart && { i: W.cart.i, best: W.cart.best.slice(), len: W.path.length, attacker: W.attacker },
    gate: W.gate && { hp: Math.round(W.gate.hp / W.gate.maxHp * 100), down: W.gateDown },
    cmd: W.teams.map(t => Math.round(hpk(t.cmd) * 100)), alive: W.alive ? W.alive.map(a => a.length) : null,
    kills: W.teams.map(t => t.kills), hero: { ...W.hero.stats, role: W.role, dead: G.dead, afk: W.afkT || 0 }, result: W.result && { tier: W.result.tier, mats: W.result.mats, gold: W.result.gold, rank: W.result.rank },
    bodies: W.bodies.length, dead: W.bodies.filter(b => b.dead).length, diag: W.diag, sup: W.sup, hlvl: G.player.lvl, startLvl: W.startLvl, tier: W.tier, foeK: W.foeK,
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
const RAID = { cols: 64, rows: 46, camp: [32, 37], lair: [32, 16], heroK: 24.0, hurtLo: 1.3, hurtHi: 1.35, cut: 0.25 };
/** How many times the hero gets up in a raid of this rung (멧돼지왕 2 … 아이라바타 18). */
export function raidRevives(level) {
  return level <= 7 ? 5 : level <= 13 ? 4 : 3;
}
// Red-floor tiles by a number key (tiles of a raid can lie a little outside the arena).
const dk = (x, y) => (x + 1000) * 10000 + (y + 1000);

function raidSetup() {
  const G = A.G(), st = G.stage, p = G.player, set = A.settings();
  const roles = rolesFor(G.cls);
  const role = ROLES[set.raidRole] ? set.raidRole : G.cls.id === 'poet' ? 'healer' : G.cls.id === 'warrior' ? 'tank' : 'dps';
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
  W.teams = [
    { id: 0, name: '공격대', color: '#7cf08a', cmd: null, squads: [], spawn: W.camp.slice(), kills: 0, troops: [] },
    { id: 1, name: (st.boss && st.boss.name) || '보스', color: '#ff7a6a', cmd: null, squads: [], spawn: W.lair.slice(), kills: 0, troops: [] },
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
  // The boss's life by the raid's size (the hero counts about three raiders and a half).
  W.crowdK = (W.bodies.length + 3.5) / (24 + 3.5);
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
  if (['mage', 'poet', 'magus', 'celestial'].includes(G.cls.id)) A.say('주문은 닿는 곳까지만 갑니다. 보스 가까이(4~5칸)에서 싸우세요.', 'sys');
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

/** A free tile beside the target, within reach, off the red floor, nearest the fighter. */
function ringSpot(W, b, t, reach) {
  let best = null, bd = 1e9;
  const R = Math.ceil(reach);
  for (let dx = -R; dx <= R; dx++)
    for (let dy = -R; dy <= R; dy++) {
      const d = Math.hypot(dx, dy);
      if (d < 1 || d > reach) continue;
      const x = t.tx + dx, y = t.ty + dy;
      if (!open(W, x, y) || W.danger.has(dk(x, y))) continue;
      if (!(x === b.tx && y === b.ty) && !A.free(x, y)) continue;
      const c = Math.abs(x - b.tx) + Math.abs(y - b.ty) + d * 0.1;
      if (c < bd) { bd = c; best = [x, y]; }
    }
  return best;
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
  const k = hpk(b);
  // Low: back to the healers (to the camp when none is near); in again once mended.
  if (b.state !== 'retreat' && b.role !== 'healer' && k < (b.role === 'tank' ? 0.18 : 0.28)) {
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
    if (!held && b.cd.c <= 0 && d2(b, boss) < 6) raidTaunt(W, b);
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
  } else if (dist > reach) b.dest = ringSpot(W, b, t, reach) || [t.tx, t.ty];
  else b.dest = null;
  if (dist <= reach + 0.5) act(W, b, t);
}

function raidTaunt(W, b) {
  const G = A.G();
  b.cd.c = 10;
  W.taunted = { by: b, until: G.t + 6 };
  G.aggro = b;
  shout(W, b, pick(['도발', '이리 와라', '어그로']));
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
  hit(W, from || { name: W.teams[1].name }, m, dmg * (!from || from.kind === 'boss' ? raidHurtK() : 1));
}
function raidHurtK() {
  const k = A.raidK();
  return (RAID.hurtLo + (RAID.hurtHi - RAID.hurtLo) * clamp((k - 0.58) / 0.42, 0, 1)) / k;
}

/** The hero's blows in a raid: past about two raiders' worth a second they are scaled down. */
function raidScale(dmg) {
  const G = A.G(), W = G.war;
  if (!(dmg > 0)) return dmg;
  // 자리비움: a hero away from the controls (its spells still fire by themselves) barely scratches
  // the boss, so the raid is the player's to win: the raiders alone run out of time. At 0.15 an
  // idle 전사 (tough, its swings landing whenever the boss walked up) still won 멧돼지왕 at 7:13.
  if (afk()) dmg *= 0.05;
  const win = W.rawWin || (W.rawWin = []);
  win.push([G.t, dmg]);
  W.rawSum = (W.rawSum || 0) + dmg;
  W.rawAll = (W.rawAll || 0) + dmg;
  while (win.length && G.t - win[0][0] > 8) W.rawSum -= win.shift()[1];
  const span = Math.max(3, Math.min(8, G.t - win[0][0]));
  const rate = W.rawSum / span;
  const target = W.Uh * RAID.heroK * (1 + 0.03 * Math.max(0, G.player.lvl - W.startLvl)) * (W.role === 'dps' ? W.heroDmgK : 1);
  if (rate > target) return dmg * target / rate;
  // Below it (a caster's spells, which keep to their own reach, reached about 40% of a 도적's capped
  // blows at the boss and its raids ran out of time): lifted toward it, at most 1.6 times.
  return afk() ? dmg : dmg * Math.min(1.6, Math.sqrt(target / Math.max(rate, 1)));
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
      castFx(W, c, SK.m_para ? 'm_para' : null, boss, 1);
      shout(W, c, '마비');
      credit(c, 'obj', 8);
      W.stat.cuts++;
      A.say(`${c.name}: 마비! 광역기 끊었어요!`, 'party');
      A.banner(`${c.name}의 마비! 광역기를 끊었다`);
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
const RAID_BOSS_U = 23500; // with the hero's larger share (heroK): the raiders alone no longer finish an easy raid in time (at 21500 they did at 7:19 now and then)

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
  W.result = { win: W.win, why: W.why, title, tier, tierK: k, coins, gold, rank: rank + 1, rows };
  A.say(`${W.def.name} ${win ? '성공' : '실패'}! 기여 ${rank + 1}위 · 등급 ${tier} · 레이드주화 ${coins}개`, win ? 'sys' : 'warn');
  return W.result;
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
export const JAENG_MAPS = {
  bosspk_jp: { id: 'bosspk_jp', name: '왜국 붉은 광장', lair: [14, 9], camps: [[3, 10], [24, 10], [14, 17]], seals: [[14, 4], [7, 15], [21, 15]] },
  bosspk_sea: { id: 'bosspk_sea', name: '용궁 산호 광장', lair: [14, 8], camps: [[4, 11], [26, 11], [14, 1]], seals: [[8, 5], [21, 5], [14, 15]] },
  bosspk_sky: { id: 'bosspk_sky', name: '하늘 아래 돌 제단', lair: [12, 11], camps: [[1, 15], [25, 12], [13, 22]], seals: [[13, 4], [6, 19], [20, 19]] },
};
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
  gather: 30, bossAt: 120, rage: 450, time: 540, bossU: 7000, campR: 3, pkK: 0.45,
  pts: { boss: 1000, last: 100, cut: 15, seal: 1, sealBoss: 0.5, kill: 3, assist: 1, mob: 0.2, mobCap: 60 },
  sealBuff: 0.15, sealBuffT: 30, heroK: 0.85, afkK: 0.05,
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
      const p = `ywar/${def.id}_${cx}_${cy}.png`;
      if (!A.images[p]) loads.push(A.loadImage(p));
      if (!mapBms.has(p)) loads.push(sheetBitmap(p).then(bm => { if (bm) mapBms.set(p, bm); }));
    }
  for (const n of ['war_sealstone1', 'war_sealstone2', 'war_sealstone3', 'war_sealring', 'war_bossmark', 'war_bossaltar', 'war_totem', 'war_totem_r', 'war_brazier'])
    if (!A.images[`prop/${n}.png`] && (A.M().prop || {})[n]) loads.push(A.loadImage(`prop/${n}.png`));
  await aiLooksReady();
  await Promise.all(loads);
  const boss = raid.boss || {};
  const stage = {
    ...raid, raid: false, jaeng: true, id: 'jaeng_' + raid.id, raidId: raid.id, name: `쟁 · ${boss.name || raid.name}`, war: def, terrain: 'war',
    music: 'raid_' + raid.id, intro: `${def.name}에 ${boss.name || raid.name}이(가) 봉인되어 있다. 세 길드가 보스를 두고 다툰다.`, pages: raid.pages || [],
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
    score: [0, 0, 0], pts: [0, 1, 2].map(() => ({ boss: 0, last: 0, cut: 0, seal: 0, pk: 0, mob: 0 })), mobKills: [0, 0, 0],
    bossDmg: [0, 0, 0], bossWin: [[], [], []], pkHeat: [[0, 0, 0], [0, 0, 0], [0, 0, 0]], comeback: [1, 1, 1], sealN: [0, 0, 0], sealUntil: 0,
    feed: [], ghosts: [], crates: [], zones: [], bodies: [], squads: [], nextId: 1, flow: new Map(), sndT: 0, shoutT: 0, fxN: 0, round: 1, gateDown: false,
    map: { cols: mp.cols, rows: mp.rows, w: mp.w, h: mp.h, chunk: mp.chunk, walk: Uint8Array.from(mp.walk.join(''), c => (c === '.' ? 1 : 0)) },
    heroDmgK: 1, roleK: 1, thinkIdx: 0, lastCmd: [0, 0, 0], cmdSaid: 0, events: [], foeK: 1, danger: new Map(), dangerSig: '', calls: {},
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
  for (const b of W.bodies) {
    b.bthr = 0;
    placeBody(W, b, W.teams[b.team].spawn);
    listOf(b.team).push(b);
  }
  W.alive = [0, 1, 2].map(t => W.bodies.filter(b => b.team === t));
  jaengLists(W);
  for (const t of [0, 1, 2]) jaengPlan(W, t, true);
  A.say(`[쟁] ${W.teams[0].name} · ${W.teams[1].name} · ${W.teams[2].name} — ${G.stage.name}. 2분 뒤 봉인이 풀립니다. 역할: ${ROLES[role].name}`, 'sys');
  if (W.practice) A.say('이번 주 보상 횟수를 다 썼습니다: 연습전(보상 없음)', 'warn');
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
  return (W.comeback[team] || 1) * (W.t < W.sealUntil ? 1 + JAENG.sealBuff * (W.sealN[team] || 0) : 1);
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
  e.hp = e.maxHp = W.U * JAENG.bossU * (W.crowdK || 1) ** 1.4;
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
  W.feed.push({ t: G.t, a: who + ' 길드', at: team, b: G.boss.name, bt: -1, big: true, gold: true });
  A.banner(`${who} 길드 막타! ${G.boss.name} 처치`);
  A.say(`${who} 길드가 ${G.boss.name}에게 마지막 일격을 넣었습니다! (+${JAENG.pts.last})`, team === 0 ? 'sys' : 'warn');
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
  castFx(W, c, SK.m_para ? 'm_para' : null, b, 1);
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
    if (W.jphase === 'seal') { A.banner('봉인전! 봉인석을 차지하라'); A.say('[쟁] 봉인전: 봉인석 셋을 차지하면 점수와, 보스가 깨어날 때 피해 +15%(봉인석마다)를 얻습니다.', 'sys'); }
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
    W.score[t] = q.boss + q.last + q.cut + q.seal + q.pk + q.mob;
  }
}

/** The PK points of a fall: the killer's guild 8, each other guild that helped 3. */
function jaengPk(W, f, by) {
  const G = A.G();
  if (!by || !(by.team >= 0) || by.team === f.team) return;
  W.pts[by.team].pk += JAENG.pts.kill / (W.crowdK || 1);
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

/** The guilds' orders (B2: the plain plan; jaengPlan is the commander). */
function jaengEnd(W, why) {
  if (W.over) return;
  const order = W.teamIds.slice().sort((a, b) => W.score[b] - W.score[a]);
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
      if (o.kind === 'boss' && boss) q.order = { ...o, x: boss.tx, y: boss.ty, obj: boss };
      else if (o.kind === 'pk') { const c = centroid(W, o.team, boss); if (c) q.order = { ...o, x: c[0], y: c[1] }; }
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
  if (b.role !== 'healer' && order.kind === 'boss' && W.boss && W.boss.hp > 0 && b.state !== 'retreat') {
    // At the boss: one of another guild on it (or on its healer, for a tank) is struck first;
    // the rest of the crowd is left be, or the boss is never struck.
    const close = nearestFighter(W, b, 2);
    const onMe = close && (close.target === b || (b.role === 'tank' && close.target && close.target.team === b.team && close.target.role === 'healer'));
    if (!onMe) { thinkJaengBoss(W, b, order); b.only = undefined; return; }
    b.target = close;
    b.retargetT = A.G().t + 2;
  }
  think(W, b);
  b.only = undefined;
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
  if (b.state !== 'retreat' && k < (b.role === 'tank' ? 0.2 : 0.3)) {
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
  } else if (dist > reach) b.dest = ringSpot(W, b, t, reach) || [t.tx, t.ty];
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
  const rows = board(W);
  const mine = rows.filter(x => x.b.team === 0);
  const rank = mine.findIndex(x => x.b === W.hero);
  const { tier, k: tierK } = tierOf(W, rows);
  const place = W.rank.indexOf(0);
  W.result = { win, why, tier, tierK, rank: rank + 1, rows, place, rewards: jaengRewards(W, place, tier) };
  G.over = true;
  document.getElementById('levelup').hidden = true;
  G.choosing = false;
  A.audio().play(place === 0 ? 'levelup' : 'lose');
  A.say(`쟁 종료 — ${W.teams[win].name} 길드 1위 (${why}). 우리 길드 ${place + 1}위`, place === 0 ? 'sys' : 'warn');
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
  const ringPic = A.images['prop/war_sealring.png'];
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
  const ctx = A.ctx, im = A.images[`prop/${b.name}.png`];
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
  hudText(`${ph} · 봉인석 ${seals}${W.comeback[0] > 1 ? ` · 역습 +${Math.round((W.comeback[0] - 1) * 100)}%` : ''}${W.heroCmd && W.heroCmd.until > G.t ? ` · 명령: ${W.heroCmd.label} ${Math.ceil(W.heroCmd.until - G.t)}초` : ''}`, cw / 2, W.boss ? ch - 10 * u : 32 * u, '#ffd27a');
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
    desc: `${JAENG_MAPS[wk.map].name}에 봉인된 ${boss}을(를) 세 길드(${bigOn('jaeng') ? 16 : 12}명씩)가 다툰다. 2분 봉인전(봉인석 셋) 뒤 보스가 깨어나고, 보스에 넣은 피해 몫(합 ${JAENG.pts.boss}점)·막타(+${JAENG.pts.last})·봉인석·PK(처치 ${JAENG.pts.kill}, 도움 ${JAENG.pts.assist})·광역기 끊기(+${JAENG.pts.cut})로 순위를 가린다. 9분이면 보스가 달아난다.`,
    more: `이번 주 보상 ${left}/${JAENG_PAID}회 남음 (월요일 초기화) · 보상: 레이드주화 · ${open ? A.MATS[wk.sinsu].name : `겁화의 파편 (${A.raidName(gate)}을 깨면 ${A.MATS[wk.sinsu].name})`} · 전 · 1위 보스 상자(${boss} 세트 한 부위 50%, 코디 30%) · 막타 상자`
      + (locked ? '<br><b style="color:#ff9a8a">왕궁을 정복하고 길드대항전에서 한 번 이기면 열린다</b>' : ''),
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
    <div class="wr-sub">${W.def.title} — ${r.why}<br>내 기여: 길드 ${r.rank}위 · ${ROLES[W.role].name} · 등급 <b class="wr-tier">${r.tier}</b> <small>(같은 역할 중간의 ×${r.tierK.toFixed(2)}${W.afkT > 1 ? ` · 자리비움 ${Math.round(W.afkT)}초` : ''})</small></div>
    <table class="jr-guilds"><tr><th>순위</th><th>길드</th><th>점수</th><th>보스 몫</th><th>보스</th><th>막타</th><th>봉인</th><th>PK</th><th>끊기</th><th>부하</th></tr>${rows}</table>
    ${medals}
    ${tables(W, r.rows)}
    <div class="row" style="justify-content:center;display:flex;gap:8px"><button class="btn" id="wr-again">다시 출전</button><button class="btn" id="wr-town">마을로</button></div>`;
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
  A.drawGroundCached(`war:${W.def.id}`, camX, camY, (g, x0, y0, w, h) => {
    let ok = true;
    for (let cy = Math.max(0, Math.floor(y0 / c)); cy * c < Math.min(m.h, y0 + h); cy++)
      for (let cx = Math.max(0, Math.floor(x0 / c)); cx * c < Math.min(m.w, x0 + w); cx++) {
        const path = `ywar/${W.def.id}_${cx}_${cy}.png`, im = mapBms.get(path) || A.images[path];
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
}

/** Every war body drawn in the field's order: fighters as their class, units in 연's sheets. */
function drawBody(b) {
  const G = A.G(), W = G.war, ctx = A.ctx;
  if (b.gate || !onScreen(b) || (window.__dbgWar && window.__dbgWar.nobody)) return;
  const dbg = window.__dbgWar || {};
  if (b.wprop) return dbg.noprop ? null : drawWarProp(W, b);
  const alpha = b.hidden > G.t ? 0.4 : 1;
  const pose = b.poseT > 0 ? b.pose : b.moving ? 'walk' : 'idle';
  let top = 50;
  if (dbg.noframe) top = 50;
  else if (b.cls) {
    if (b.cue && G.t - b.cue.t < 0.5 && !dbg.nocue) drawCue(ctx, b, G.t - b.cue.t);
    drawFighter(b, b.x, b.y, pose, alpha) || A.drawYhero2(b.cls, b.gear, b, b.x, b.y, pose, alpha) || A.drawYhero(b.cls.id, b.gear ? b.gear.armor : 0, b, b.x, b.y, pose, alpha);
    if (b.flash > 0) { /* a struck fighter shows it in its bar */ }
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
    const key = b.name + nameCol;
    let lab = labels.get(key);
    if (!lab) {
      lab = document.createElement('canvas');
      const g = lab.getContext('2d');
      g.font = '8px G7';
      const w = Math.ceil(g.measureText(b.name).width) + 4;
      lab.width = w;
      lab.height = 12;
      g.font = '8px G7';
      g.textAlign = 'center';
      g.fillStyle = '#000';
      for (const [dx, dy] of [[1, 0], [0, 1], [1, 1]]) g.fillText(b.name, w / 2 + dx, 9 + dy);
      g.fillStyle = nameCol;
      g.fillText(b.name, w / 2, 9);
      if (labels.size > 400) labels.clear();
      keep(labels, key, lab);
    }
    ctx.drawImage(lab, Math.round(b.x - lab.width / 2), Math.round(b.y + 9 - 9));
  }
  if (b.carry) {
    const im = A.images['prop/war_cart3.png'];
    drawLabel('보급', b.x, b.y - top - 18, '#ffd27a');
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
/** A body's frame kept cropped to what is drawn (most of a cell is empty): { pic, ox, oy }. */
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
  // The drawn box of the picture: drawn from the canvas by its box until the bitmap of just that
  // box is made (a second, cropped canvas cost as much again).
  const e = x1 >= x0 ? { pic: c, sx: x0, sy: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, ox: x0, oy: y0 } : { pic: c, sx: 0, sy: 0, w: W, h: H, ox: 0, oy: 0 };
  framesMade++;
  if (frames.size > 3600) { const old = frames.keys().next().value, v = frames.get(old); frames.delete(old); if (v && v.pic && v.pic.close) v.pic.close(); }
  frames.set(key, e);
  lookAny.set(key.slice(0, key.indexOf('|')), key);
  if (window.createImageBitmap) { const src = e.pic; createImageBitmap(src, e.sx, e.sy, e.w, e.h).then(bm => { if (e.pic === src) { e.pic = bm; e.sx = e.sy = 0; } }).catch(() => {}); }
  return e;
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
  const ctx = A.ctx;
  ctx.globalAlpha = alpha;
  blit(ctx, c, Math.round(b.x - (mirror ? cw - fx : fx) * s), Math.round(b.y - fy * s));
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
const COMPOSE_MS = 3, WARM_MS = 20;
let composeMs = 0, warmGen = 0;
const warming = new Set();
const nowMs = () => performance.now();
/** Called once a drawn frame (drawGround): the budget of frames made in play starts again. */
function composeTick() { composeMs = 0; }
function lookOf(cls, gear) {
  const H = A.M().yhero2 && A.M().yhero2[cls.id];
  const yv2 = H && A.yGearVariants(cls, gear || {});
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
async function warmLooks(W) {
  const gen = ++warmGen, G = A.G();
  const seen = new Map();
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
  // The looks round the hero first; the ones already made (an earlier war's) not again.
  const looks = [...seen.values()].filter(L => lookFrames(L.H).some(([a, f, m]) => !frames.has(L.yvKey + '|' + a.row + '|' + f + (m ? 'm' : '')))).sort((x, y) => x.d - y.d);
  warming.clear();
  for (const L of looks) warming.add(L.yvKey);
  const paths = L => Object.entries(L.yv2).map(([kind, v]) => [kind, L.H.layers[kind] && L.H.layers[kind][v]]).filter(x => x[1]).map(([kind, meta]) => [kind, 'yhero2/' + meta.file]);
  const uses = new Map(), bms = new Map();
  for (const L of looks) for (const [, p] of paths(L)) uses.set(p, (uses.get(p) || 0) + 1);
  const want = L => { for (const [, p] of paths(L)) if (!bms.has(p)) bms.set(p, sheetBitmap(p)); };
  try {
    for (let i = 0; i < looks.length; i++) {
      const L = looks[i];
      want(L);
      if (looks[i + 1]) want(looks[i + 1]); // the next look's sheets decode while this one's frames are made
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
      for (const [, p] of paths(L)) {
        const n = uses.get(p) - 1;
        uses.set(p, n);
        if (n <= 0) { const bm = await bms.get(p); if (bm && bm.close) bm.close(); bms.delete(p); }
      }
      await nextFrame();
    }
  } finally {
    if (gen === warmGen) warming.clear();
    for (const [, pr] of bms) pr.then(bm => bm && bm.close && bm.close());
  }
}
function composeFrame(H, b, a, f, mirror, force, src) {
  const k = b.yvKey + '|' + a.row + '|' + f + (mirror ? 'm' : '');
  let c = frames.get(k);
  if (c) return c;
  // While its look is being made ahead, or past this frame's time, a frame is not made in play.
  if (!force && (composeMs > COMPOSE_MS || warming.has(b.yvKey))) return null;
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
  c = document.createElement('canvas');
  c.width = cw;
  c.height = ch;
  const g = c.getContext('2d', { willReadFrequently: true });
  // The shadow under the feet, in the same picture.
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.beginPath();
  g.ellipse(mirror ? cw - fx : fx, fy - 1, 10, 3.5, 0, 0, Math.PI * 2);
  g.fill();
  if (mirror) { g.translate(cw, 0); g.scale(-1, 1); }
  drawLayers(g, H, sheets, a, f, box);
  c = keepFrame(k, c);
  c.m = mirror;
  c.box = box;
  composeMs += nowMs() - t0;
  return c;
}
function drawFighter(b, x, y, pose, alpha, noDraw = false) {
  const M = A.M(), H = M.yhero2 && M.yhero2[b.cls.id];
  if (!H) return false;
  if (!b.yvKey) {
    b.yv2 = A.yGearVariants(b.cls, b.gear || {});
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
  // A fighter with no frame at all yet is made one now, unless its look is being made ahead (it
  // shows within the opening count).
  let c = composeFrame(H, b, a, f, mirror, noDraw || (!(last && frames.has(last)) && !warming.has(b.yvKey)));
  if (c === false) return false;
  if (!c) {
    // Out of this frame's making time: the frame it showed last (made already), as it was.
    c = frames.get(last);
    if (!c) return true;
    k = last;
    mirror = !!c.m;
  }
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
  blit(ctx, c, Math.round(x) - (mirror ? cw - fx : fx), Math.round(y) - fy);
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
  for (const c of W.crates) if (!c.by) out.push({ war: true, wprop: 'crate', x: c.x * TILE + TILE / 2, y: c.y * TILE + TILE - 6 });
  for (const z of W.zones) out.push({ war: true, wprop: 'post', z, x: z.x * TILE + TILE / 2, y: z.y * TILE + TILE - 8 });
  for (const g of W.ghosts) out.push({ war: true, wprop: 'ghost', g, x: g.x, y: g.y });
  if (W.jaeng) jaengProps(W, out);
  return out;
}
War.props = () => warProps();

function drawWarProp(W, b) {
  const G = A.G(), ctx = A.ctx;
  const prop = (name, x, y, k = 1, alpha = 1) => {
    const im = A.images[`prop/${name}.png`];
    if (!im || !im.width) return false;
    ctx.globalAlpha = alpha;
    ctx.drawImage(im, Math.round(x - im.width * k / 2), Math.round(y - im.height * k), Math.round(im.width * k), Math.round(im.height * k));
    ctx.globalAlpha = 1;
    return true;
  };
  if (b.wprop === 'jp') return drawJaengProp(W, b);
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
  else if (W.mode === 'commander') line += ` · 처치 ${W.score[0]} : ${W.score[1]}`;
  else if (W.mode === 'escort') {
    const pct = i => Math.round(i / (W.path.length - 1) * 100);
    line += ` · ${W.round === 1 ? '전반' : '후반'} ${W.attacker === 0 ? '우리 호위' : '적 호위'} ${pct(W.cart.i)}%${W.cart.moving ? ' ▶' : ''}`;
  } else if (W.mode === 'siege') line += W.gateDown ? ` · 성문 붕괴 · 수성대장 ${Math.round(hpk(W.teams[1 - W.attacker].cmd) * 100)}%` : ` · 현무 성문 ${Math.ceil(W.gate.hp / W.gate.maxHp * 100)}% · ${W.attacker === 0 ? '우리가 공성' : '우리가 수성'}`;
  ctx.font = `${Math.round(10 * u)}px G9`;
  if (line) hudText(line, cw / 2, 32 * u, '#ffd27a');
  // Kill feed, top right.
  ctx.textAlign = 'right';
  const icon = img('ui_Icon_KillLog');
  // Under the 연속 처치 count (drawn at 64 / 860 of the width, top right), not across it.
  let y = Math.max(46 * u, 104 * cw / 860);
  for (const f of W.feed.slice(-5)) {
    const a = Math.min(1, (6 - (G.t - f.t)) * 2);
    ctx.globalAlpha = a;
    const x = cw - 8 * u;
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
  if (afk()) {
    ctx.font = `${Math.round(12 * u)}px G11`;
    hudText('자리비움 — 움직이지 않는 동안 기여가 거의 쌓이지 않습니다', cw / 2, ch / 2 - 56 * u, '#ff9a8a');
  }
  if (G.dead && W.heroBack) {
    ctx.font = `${Math.round(14 * u)}px G11`;
    hudText(`부활까지 ${Math.ceil(W.heroBack - G.t)}초`, cw / 2, ch / 2 - 40 * u, '#ff9a8a');
  } else if (G.dead && W.heroOut) {
    ctx.font = `${Math.round(13 * u)}px G11`;
    hudText('부활 횟수 소진 · 공대원들이 싸움을 이어갑니다', cw / 2, ch / 2 - 40 * u, '#ff9a8a');
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
  drawCountdown(W);
}
/** Each guild's standing for the top bars, by the war's mode. */
function sideProgress(W) {
  const name = t => W.teams[t].name;
  if (W.raid) {
    const n = W.alive ? W.alive[0].length : 0, all = W.bodies.length + 1, b = W.boss, G = A.G();
    const bk = b ? hpk(b) : G.cleared ? 0 : 1;
    return [{ k: n / all, text: `공격대 ${n}/${all}` },
      { k: bk, text: b ? `${name(1)} ${Math.ceil(bk * 100)}%${['', ' · 분노', ' · 광폭'][G.phase || 0] || ''}${G.enraged ? ' · 광폭화' : ''}` : G.cleared ? `${name(1)} 처치!` : `${name(1)} 등장 ${Math.max(0, Math.ceil(A.RAID_BOSS_AT - G.t))}초` }];
  }
  if (W.mode === 'capture') return [0, 1].map(t => ({ k: W.score[t] / W.def.target, text: `${name(t)} ${W.score[t]}점` }));
  if (W.mode === 'commander') return [0, 1].map(t => ({ k: hpk(W.teams[t].cmd), text: `${name(t)} 대장 ${Math.round(hpk(W.teams[t].cmd) * 100)}% · 처치 ${W.score[t]}` }));
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
