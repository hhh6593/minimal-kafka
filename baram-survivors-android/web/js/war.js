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

let A = null; // game.js internals (initWar)
const TILE = 48;
const k2 = (x, y) => x + ',' + y;
const DIR4 = [[0, 1], [-1, 0], [1, 0], [0, -1]];
// Twenty-five a side: five squads of five (the squads are only how the AI is organised; the
// commanders send most of them to the same place, so the guild fights as one crowd).
const SQUADS = 5;
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

export function initWar(api) {
  A = api;
  SK = api.SKILLS;
  injectUi();
  window.__war = (id, cls, role, opts = {}) => startWar(id, typeof cls === 'number' ? A.CLASSES[cls] : cls, role, opts);
  window.__warState = () => warState();
  window.__warBoard = () => openBoard();
  // Test: how many composited fighter frames are kept, and how many were made (cache churn).
  window.__warFrames = () => ({ kept: frames.size, made: framesMade, looks: new Set([...frames.keys()].map(k => k.split('|')[0])).size });
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
  #war-board .wb-actions { position: sticky; bottom: -10px; margin: 6px -12px -10px; padding: 6px 0 8px; background: rgba(8,6,4,0.96); border-top: 1px solid #5a4630; } /* 출전 always on screen */
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
  #war-result .wr-cols { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
  #war-sb { position: fixed; inset: 6% 8%; background: rgba(10,8,6,0.93); border: 2px solid #5a4630; z-index: 40; overflow: auto; padding: 6px; }
  #war-sb .wr-cols { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
  body.war #map-tab { display: none; }
  #war-sb-btn { font: 700 11px G11, monospace; padding: 2px 6px; color: #f4e2c0; background: #2a1606; border: 2px solid rgb(148,48,219); }
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
  const w = WARS[pickWar];
  const pr = A.progress();
  const mats = pr.mats || {};
  const cards = Object.values(WARS).map(x => {
    const pic = img(x.art) ? `assets/hud/${x.art}.png` : '';
    return `<button class="wb-card${x.id === pickWar ? ' on' : ''}" data-war="${x.id}">${pic ? `<img src="${pic}" alt="">` : ''}<b>${x.name}</b>${x.title}<br><small>보상: ${A.MATS[x.mat].name} (보유 ${mats[x.mat] || 0})</small></button>`;
  }).join('');
  const roleBtns = Object.entries(ROLES).map(([id, r]) => {
    const fit = roles.includes(id);
    return `<button class="btn wb-role${id === pickRole ? ' on' : ''}" data-role="${id}" title="${r.desc}">${r.name}${fit ? '' : ' (비주력)'}</button>`;
  }).join('');
  const side = w.mode === 'siege' ? `<div class="wb-row"><button class="btn wb-side${pickSide === 'atk' ? ' on' : ''}" data-side="atk">공성 (성문을 부순다)</button><button class="btn wb-side${pickSide === 'def' ? ' on' : ''}" data-side="def">수성 (성문을 지킨다)</button></div>` : '';
  box.innerHTML = `<h2>사신수 길드대항전</h2>
    <div class="wb-cards">${cards}</div>
    <div class="wb-info"><b>${w.name} · ${w.title}</b> — ${w.desc}<br>
    양 길드 25명씩 · 혼자 들어가도 전장이 꽉 찹니다 · 양 진영의 전력은 자동으로 맞춰집니다(전장 보정).</div>
    ${side}
    <div class="wb-row">${roleBtns}</div>
    <div class="wb-info"><b>${ROLES[pickRole].name}</b> — ${ROLES[pickRole].desc}<br>역할 보너스: ${ROLES[pickRole].bonus}</div>
    ${loadoutHtml(cls, pickRole)}
    <div class="wb-row wb-actions"><button class="btn" id="wb-back">마을로</button><button class="btn" id="wb-go">출전</button></div>`;
  box.querySelectorAll('[data-war]').forEach(b => { b.onclick = () => { pickWar = b.dataset.war; openBoard(); }; });
  box.querySelectorAll('[data-role]').forEach(b => { b.onclick = () => { pickRole = b.dataset.role; openBoard(); }; });
  box.querySelectorAll('[data-side]').forEach(b => { b.onclick = () => { pickSide = b.dataset.side; openBoard(); }; });
  box.querySelectorAll('[data-wear]').forEach(b => {
    b.onclick = () => { const [kind, tier, sp] = b.dataset.wear.split('|'); A.wear(kind, +tier, sp || null); openBoard(); };
  });
  document.getElementById('wb-back').onclick = () => A.enterTown(cls);
  document.getElementById('wb-go').onclick = () => startWar(pickWar, cls, pickRole, { side: pickSide });
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
      bag.push(`<div class="fit">✓ ${def.name || sp} — ${gy.name}<button class="btn" data-wear="${kind}|${tier}|${sp}">착용</button></div>`);
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
  for (let cy = 0; cy * map.chunk < map.h; cy++)
    for (let cx = 0; cx * map.chunk < map.w; cx++) {
      const p = `ywar/${id}_${cx}_${cy}.png`;
      if (!A.images[p]) loads.push(A.loadImage(p));
    }
  await Promise.all(loads);
  const stage = {
    id: 'war_' + id, name: def.name, war: def, terrain: 'war', level: 10, monsters: [], intro: def.desc, pages: [],
  };
  pendingWar = { def, role: ROLES[role] ? role : 'dps', side: opts.side === 'def' ? 'def' : 'atk', idle: !!opts.idle };
  A.startRun(cls, stage);
  return true;
}
let pendingWar = null;

/** Called from startRun when the stage is a war: the field, both guilds, the hero's place. */
function setup() {
  const G = A.G();
  const { def, role, side } = pendingWar;
  const M = A.M(), mp = M.ywar[def.id];
  const W = G.war = {
    def, mode: def.mode, role, side, t: 0, left: def.time, over: false, score: [0, 0], feed: [], ghosts: [], crates: [], zones: [],
    bodies: [], squads: [], nextId: 1, flow: new Map(), sndT: 0, shoutT: 0, fxN: 0, round: 1, gateDown: false,
    map: { cols: mp.cols, rows: mp.rows, w: mp.w, h: mp.h, chunk: mp.chunk, walk: Uint8Array.from(mp.walk.join(''), c => (c === '.' ? 1 : 0)) },
    heroDmgK: 1, roleK: 1, thinkIdx: 0, lastCmd: [0, 0], cmdSaid: 0, events: [],
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
    for (let s = 0; s < SQUADS; s++) {
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
  mkCommanders(W);
  mkTroops(W);
  // The escort's camps are set by its road (and the troops' posts by the camps), before anyone stands.
  if (W.mode === 'escort') resetEscort(W);
  heroTo(...W.teams[0].spawn);
  for (const b of W.bodies) {
    placeBody(W, b, b.home || W.teams[b.team].spawn);
    (b.team === 1 ? G.enemies : G.party).push(b);
  }
  // The enemy's gate can be struck by the hero's spells like any foe.
  if (W.gate && W.gate.team === 1) G.enemies.push(W.gate);
  W.alive = [0, 1].map(t => W.bodies.filter(b => b.team === t));
  orders(W, 0, true);
  orders(W, 1, true);
  A.say(`[${def.name}] ${W.teams[0].name} 길드 대 ${W.teams[1].name} 길드 — ${def.title}. 역할: ${ROLES[role].name}`, 'sys');
  if (fit) A.say(`역할에 맞는 격 ${fit}개: ${ROLES[role].name} 효과 +${Math.round((W.roleK - 1) * 100)}%`, 'sys');
  A.banner(`${def.name} · ${def.title}`);
  const btn = document.getElementById('war-sb-btn');
  if (btn) btn.hidden = false;
  document.body.classList.add('war');
  W.idle = pendingWar.idle;
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
  // Two outfits per class, worn on both sides (the ▼ over the head tells the sides apart): with
  // eleven classes, three a side made 66 looks whose frames never stopped being composited.
  const pool = (W.looks = W.looks || {})[cls.id] = W.looks[cls.id] || [0, 1].map(() => randGear(cls, rnd(18, 44)));
  const gear = pick(pool);
  // 전장 보정: a fighter's own strength (level and gear) counts, but pulled toward the field's.
  const own = Math.sqrt(lv / 30) * (0.85 + 0.3 * Math.random());
  const pw = 1 + (own - 1) * 0.35;
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
      war: true, cmdr: true, id: W.nextId++, team, role: 'tank', cls: null, unit, name: `${W.teams[team].name} 진영대장`, lv: 50, pw: 1,
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
        war: true, troop: true, id: W.nextId++, team, role: 'dps', cls: null, unit: ok ? u : null, name: i === 0 ? '경비대장' : '경비병', lv: 30, pw: i === 0 ? 1.3 : 1,
        maxHp: W.refHp * (i === 0 ? 1.1 : 0.55), hp: 0, x: 0, y: 0, tx: 0, ty: 0, fx: 0, fy: 0, mt: 0, dur: 0.3, moving: false, phase: 0,
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
}
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
  p.moving = false;
}

// ---------------------------------------------------------------- per frame

export const War = {
  setup: () => setup(),
  update: dt => update(dt),
  open: (x, y) => { const G = A.G(); return open(G.war, x, y, 0); },
  down: e => kill(A.G().war, e, A.G().war.hero),
  credit: (e, dmg) => heroHit(e, dmg),
  /** 전장 보정 for the hero's own blows: past about four fighters' blows a second (more for a
   * 딜러, and growing with the levels gained in the war) they are scaled down, so the war is the
   * guilds' and not one hero's, whatever its gear. */
  scale: dmg => {
    const G = A.G(), W = G.war;
    if (!W || !(dmg > 0)) return dmg;
    const win = W.rawWin || (W.rawWin = []);
    win.push([G.t, dmg]);
    W.rawSum = (W.rawSum || 0) + dmg;
    while (win.length && G.t - win[0][0] > 8) W.rawSum -= win.shift()[1];
    const span = Math.max(3, Math.min(8, G.t - win[0][0]));
    const rate = W.rawSum / span;
    const target = W.U * 2.6 * (1 + 0.03 * Math.max(0, G.player.lvl - W.startLvl)) * (W.role === 'dps' ? W.heroDmgK : 1);
    return rate > target ? dmg * target / rate : dmg;
  },
  heroDown: () => heroDown(),
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
  cam: (cx, cy) => {
    const G = A.G(), m = G.war.map, VW = A.VW(), VH = A.VH();
    if (G.war.raid) return [cx, cy];
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
    for (const m of W.alive[0]) { const d = W.boss ? d2(m, W.boss) : 0; if (d < bd) { bd = d; best = m; } }
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
  heroTaken: n => { const G = A.G(), W = G.war; credit(W.hero, 'taken', n / G.player.maxHp * W.refHp * (W.role === 'tank' ? 1.7 : 1)); },
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
  W.alive = [[], []];
  for (const b of W.bodies) if (!b.dead) W.alive[b.team].push(b);
  if (!h.dead) W.alive[0].push(h);
  if (W.gate && !W.gateDown) W.alive[W.gate.team].push(W.gate);
  // Bodies: steps, statuses, timers every frame; thinking ~8 times a second, staggered.
  for (const b of W.bodies) {
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
  objectives(W, dt);
  W.cmdT = (W.cmdT || 0) - dt;
  if (W.cmdT <= 0) {
    W.cmdT = 1;
    orders(W, 0);
    orders(W, 1);
  }
  W.ghosts = W.ghosts.filter(g => !g.b.dead ? false : G.t < g.until);
  W.feed = W.feed.filter(f => G.t - f.t < 6);
  // Budgets for a field of fifty: numbers (each is several glyph pictures) and effects.
  if (G.texts.length > 30) G.texts.splice(0, G.texts.length - 30);
  if (G.fxs.length > 45) G.fxs.splice(0, G.fxs.length - 45);
  if (window.__dbgWar && window.__dbgWar.notext) G.texts.length = 0;
  if (window.__dbgWar && window.__dbgWar.nofx) G.fxs.length = 0;
  checkEnd(W);
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
  b.thinkT -= dt;
  if (b.thinkT <= 0) {
    b.thinkT += 0.125;
    if (b.thinkT < 0) b.thinkT = 0.125;
    if (b.stun <= 0) (W.raid && !b.cmdr && !b.troop ? thinkRaid : think)(W, b);
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
  } else if (near <= 3) {
    opts = A.towards(b, dx0, dy0);
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
  const safe = W.raid && W.danger.size && !W.danger.has(dk(b.tx, b.ty));
  for (const [dx, dy] of opts) {
    const nx = b.tx + dx, ny = b.ty + dy;
    if (!open(W, nx, ny, b.team)) continue;
    // Not onto a red tile it has seen (a careless one walks in anyway).
    if (safe && W.danger.has(dk(nx, ny)) && b.dodge > 0.6) continue;
    if (A.step(b, dx, dy, dur)) { b.fdx = dx; b.fdy = dy; b.blocked = 0; return; }
  }
  // A raid's fighters are players: one standing in the way changes places (both step).
  if (W.raid && opts.length) {
    const [dx, dy] = opts[0], o = A.occ.get(k2(b.tx + dx, b.ty + dy));
    if (o && o.war && o.team === b.team && !o.moving && !o.dead && open(W, b.tx + dx, b.ty + dy)) {
      A.occ.delete(k2(o.tx, o.ty));
      A.occ.delete(k2(b.tx, b.ty));
      const ox = o.tx, oy = o.ty;
      startStep(o, b.tx, b.ty, dur);
      startStep(b, ox, oy, dur);
      b.fdx = dx; b.fdy = dy; b.blocked = 0;
      return;
    }
  }
  // Blocked: a sidestep now and then, so a crowd flows round instead of jamming.
  b.blocked = (b.blocked || 0) + 1;
  if (b.blocked > 2) {
    const [dx, dy] = pick(DIR4);
    if (open(W, b.tx + dx, b.ty + dy, b.team) && A.step(b, dx, dy, dur)) { b.fdx = dx; b.fdy = dy; }
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
  for (const e of W.alive[1 - b.team]) {
    if (e.gate) continue;
    const d = d2(b, e);
    if (d <= r) out.push([e, d]);
  }
  return out;
}
/** The bodies of t's own side near t (a spread spell's victims round its target). A raid's
 * monsters have no team: they are side 1. Before, this asked for t's foes — the caster's own
 * side — and every spread spell of the war struck the caster's friends round its target. */
function packNear(W, t, r) {
  const out = [];
  for (const e of W.alive[t.team === 0 ? 0 : 1]) {
    if (e.gate) continue;
    const d = d2(t, e);
    if (d <= r) out.push([e, d]);
  }
  return out;
}
function nearest(W, b, r) {
  let best = null, bd = r;
  for (const e of W.alive[1 - b.team]) {
    if (e.gate) continue;
    if (e.hero && A.G().buffs.stealth > A.G().t) continue;
    const d = d2(b, e);
    if (d <= bd) { bd = d; best = e; }
  }
  return best;
}
function hpk(b) { return b.hp / b.maxHp; }
function alive(t) { return t && !t.dead && t.hp > 0 && !(t.gate && A.G().war.gateDown); }

function think(W, b) {
  const G = A.G();
  if (b.cmdr) return thinkCmdr(W, b);
  if (b.troop) return thinkTroop(W, b);
  const sq = b.squad, order = sq.order || { x: W.teams[b.team].spawn[0], y: W.teams[b.team].spawn[1], kind: 'hold' };
  const k = hpk(b);
  // Taunted: the taunter is the target for a while.
  if (b.taunt && b.taunt.until > G.t && alive(b.taunt.by)) b.target = b.taunt.by;
  // Low: back to a healer or the camp; back in once mended.
  if (b.state !== 'retreat' && (k < (b.role === 'tank' ? 0.2 : 0.3)) && !b.carry) {
    b.state = 'retreat';
    if (Math.random() < 0.4) talk(W, b, ['피 없어요 빠질게요!', '힐 좀요!!', '잠깐 빠짐', '저 죽어요!']);
  }
  if (b.state === 'retreat') {
    if (k > 0.75) b.state = 'go';
    else {
      const healer = W.alive[b.team].find(m => m.role === 'healer' && !m.hero && !m.troop && d2(m, b) < 10 && m !== b);
      const sp = W.teams[b.team].spawn;
      b.dest = healer && Math.random() < 0.7 ? [healer.tx, healer.ty] : sp;
      const t = nearest(W, b, b.kit.range + 0.5);
      if (t) act(W, b, t);
      return;
    }
  }
  // The squad's focus: the leader picks, the members follow.
  if (b.leader) leaderPick(W, b, order);
  if (b.role === 'healer') return thinkHealer(W, b, order);
  if (b.role === 'support') supportBuffs(W, b);
  // Jobs: a free supporter (or any idle one near) carries a crate; the scout zones are taken.
  if (b.carry) { b.dest = dropPoint(W, b.team); const t = nearest(W, b, b.kit.range + 0.5); if (t) act(W, b, t); return; }
  if (b.role === 'support' && !sq.target) {
    const c = W.crates.find(c => !c.by && Math.abs(c.x - b.tx) + Math.abs(c.y - b.ty) < 14);
    if (c && !nearest(W, b, 4)) { b.dest = [c.x, c.y]; return; }
  }
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
  if (!t && order.kind === 'assault' && alive(order.obj) && d2(b, order.obj) < 12 && (b.role !== 'tank' || !nearest(W, b, 2))) t = order.obj;
  if (!t && b.target && alive(b.target) && d2(b, b.target) < 9) t = b.target;
  if (!t && sq.target && alive(sq.target) && d2(b, sq.target) < 9) t = sq.target;
  if (!t) t = nearest(W, b, b.role === 'tank' ? 6 : 7);
  // The objective's own target: the gate, the commander, the cart's defenders.
  if (!t && order.obj && alive(order.obj) && order.obj.team !== b.team) t = order.obj;
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
    if (dist <= range + 0.5) act(W, b, t);
    // A fighter does not chase far from its order.
    if (Math.abs(b.tx - order.x) + Math.abs(b.ty - order.y) > 14 && !t.gate && !t.cmdr) b.dest = [order.x, order.y];
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
    const s = (e.role === 'healer' ? 3 : e.cls && (e.cls.id === 'mage' || e.cls.id === 'archer') ? 1.5 : 0) + (1 - hpk(e)) * 4 - d * 0.6
      + (e.carry ? 3 : 0) + (e.hero ? 0.5 : 0) - (e.cmdr ? 2 : 0) - (e.troop ? 1.5 : 0);
    if (s > bs) { bs = s; best = e; }
  }
  if (best !== sq.target) {
    sq.target = best;
    if (b.team === 0 && G.t - sq.said > 7 && Math.random() < 0.6) {
      sq.said = G.t;
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
  // The lowest of the near allies (the hero too).
  let low = null, lk = 0.85;
  for (const m of W.alive[b.team]) {
    if (m.gate || m.cmdr || d2(m, b) > 7) continue;
    const k = hpk(m) - (m.squad === sq ? 0.05 : 0) - (m.role === 'tank' ? 0.05 : 0);
    if (k < lk) { lk = k; low = m; }
  }
  const hurt = W.alive[b.team].filter(m => !m.gate && d2(m, b) < 5 && hpk(m) < 0.7).length;
  if (hurt >= 3 && b.cd.d <= 0) {
    b.cd.d = 12;
    const gid = b.kit.group || b.kit.heal;
    // A field of light on the ground under the squad (연's 선인의영역), the heal falling on all in it.
    castFx(W, b, SK.p_realm ? 'p_realm' : gid, b, 1.2);
    shout(W, b, gid ? SK[gid].name : '천공의희원');
    for (const m of W.alive[b.team]) if (!m.gate && !m.cmdr && d2(m, b) < 5) healBody(W, b, m, m.maxHp * 0.12);
    pose(b, 'cast');
  } else if (low && b.cd.a <= 0) {
    b.cd.a = 3.2;
    const hid = b.kit.heal || 'c_heal';
    const n = low.maxHp * (0.08 + 0.02 * b.pw);
    A.addShot(b, low, { color: '#58e868', glow: '#b8ffb0', size: 4, speed: 420, onHit: () => healBody(W, b, low, n) });
    if (onScreen(b)) {
      const d = SK[hid];
      const fx = d && d.fxs ? d.fxs[Math.min(7, Math.floor(b.lv / 6))] : d && d.fx;
      if (fx && fxOk()) A.addFx(fx, low.x, low.y - 26, { scale: 0.8 });
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
  // Stand behind the squad's front, three tiles back from the nearest foe.
  if (!b.dest || Math.random() < 0.3) {
    const front = sq.members.find(m => m.role === 'tank' && !m.dead) || sq.leader;
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
      for (const [e] of near) hit(W, b, e, W.U * 1.6);
      if (onScreen(b) && fxOk()) A.fxOn(SK.w_tiger.fx, near[0][0], { scale: 1.1 });
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
      for (const e of W.alive[1 - b.team]) {
        if (e.gate || Math.hypot(e.tx - w.x, e.ty - w.y) > w.r) continue;
        hit(W, b, e, W.U * 3.5);
        if (!e.hero) e.stun = Math.max(e.stun, 1);
      }
      if (onScreen(b) && fxOk()) A.addFx(SK.w_roar.fx, b.x, b.y - 30, { scale: 1.4 });
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
        onHit: () => { if (!W.over) { hit(W, b, t, n); if (fx && fxOk() && onScreen(t)) A.fxOn(fx, t, { scale: 0.7 }); } } });
    } else A.later(0.25, () => { if (!W.over) hit(W, b, t, n); });
    if (id) sound(W, b, 'skill_' + id, 'spell');
    pose(b, 'cast');
  } else {
    hit(W, b, t, n);
    if (onScreen(t) && fxOk()) {
      const fx = id && SK[id] && SK[id].fx;
      if (fx && Math.random() < 0.5) A.fxOn(fx, t, { scale: 0.6 });
      else if (A.M().fx.h_hit_tiger) A.fxOn('h_hit_tiger', t, { scale: 0.45 });
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
  if (m.hero) G.buffs.shield = Math.max(G.buffs.shield, G.t + sec);
  else m.shield = G.t + sec;
}

function onScreen(b) {
  const G = A.G(), p = G.player;
  return Math.abs(b.x - p.x) < A.VW() / 2 + 60 && Math.abs(b.y - p.y) < A.VH() / 2 + 80;
}
function fxOk() { return !(window.__dbgWar && window.__dbgWar.nofx) && A.fxBudget('war', 12); }
function castFx(W, b, id, at, scale) {
  if (!id || !SK[id] || !(onScreen(b) || onScreen(at)) || !fxOk()) return;
  const fx = SK[id].fx;
  if (fx && A.M().fx[fx]) A.fxOn(fx, at, { scale });
}
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
  if (b.team === 0 && d2(b, W.hero) < 14) A.say(`${b.name}: ${text}`, 'party');
}

// ---------------------------------------------------------------- blows and deaths

/** An AI blow (in the field's units). On the hero it is turned into the hero's own life. */
function hit(W, src, t, dmg) {
  const G = A.G();
  if (!alive(t) || W.over) return;
  if (W.raid && !t.war && !t.hero) return raidHit(W, src, t, dmg);
  if (src.dead && !src.cmdr) dmg *= 0.5;
  dmg *= rnd(0.9, 1.1);
  if (t.curse > 0) dmg *= 1.25;
  if (t.shield > G.t) dmg *= 0.75;
  if (t.role === 'tank' && !t.hero) dmg *= 0.7;
  if (src.team === 0 && W.scoutBuff && W.scoutBuff[0] > G.t) dmg *= 1.1;
  if (src.team === 1 && W.scoutBuff && W.scoutBuff[1] > G.t) dmg *= 1.1;
  if (t.hero) {
    if (G.dead) return;
    let d = dmg / W.refHp * G.player.maxHp * 0.85;
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
    const hn = n / W.refHp * G.player.maxHp;
    const before = G.player.hp;
    A.heal(hn, false, true);
    credit(src, 'heal', (G.player.hp - before) / G.player.maxHp * W.refHp);
    return;
  }
  n = Math.min(n, m.maxHp - m.hp);
  if (n <= 0) return;
  m.hp += n;
  credit(src, 'heal', n);
  num(W, m, n, true);
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
  if (W.cart && heroIn(W, W.cart.tx, W.cart.ty, 3)) return false;
  return true;
}

/** The hero's own blow on a fighter (hurtEnemy has dealt it): counted, and turns the struck. */
function heroHit(e, dmg) {
  const G = A.G(), W = G.war;
  if (!W) return;
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
  // The struck turns on the hero now and then (tanks keep their own fight).
  if (!e.cmdr && !e.gate && e.role !== 'tank' && Math.random() < 0.15) e.target = W.hero;
}

function kill(W, f, killer) {
  const G = A.G();
  if (f.dead || f.gate) { if (f.gate && f.hp <= 0) gateBreak(W, killer); return; }
  f.dead = true;
  f.hp = 0;
  f.down = true;
  f.stats.deaths++;
  A.occ.delete(k2(f.tx, f.ty));
  const list = f.team === 1 ? G.enemies : G.party;
  const at = list.indexOf(f);
  if (at >= 0) list.splice(at, 1);
  // A raider lies longer (a healer can raise it meanwhile) and longer still once the boss rages.
  const respawnK = W.raid ? 14 + Math.min(8, W.t / 40) + (G.enraged ? 12 : 0)
    : (f.cmdr ? 40 : f.troop ? 25 : 7 + Math.min(6, W.t / 60)) + (W.slowRise === f.team ? 5 : 0);
  f.respawnAt = W.mode === 'commander' && f.cmdr ? 0 : G.t + respawnK;
  f.dest = null;
  f.target = null;
  W.ghosts.push({ b: f, tx: f.tx, ty: f.ty, x: f.x, y: f.y, t: G.t, until: f.respawnAt || G.t + 3 });
  if (f.carry) dropCrate(W, f);
  // The killer and those who struck it within six seconds (for a tenth of its life at least, so
  // a sweep that grazed it does not count): kills and assists.
  const by = killer && killer.team !== f.team ? killer : f.lastHitBy;
  if (by && by.stats) { credit(by, 'kills', 1); W.teams[by.team].kills++; }
  const dealt = f.dmgBy || new Map();
  for (const [who, t] of f.hitBy) if (who !== by && who.team !== f.team && G.t - t < 6 && (dealt.get(who) || 0) >= f.maxHp * 0.1) credit(who, 'assists', 1);
  f.hitBy.clear();
  dealt.clear();
  if (W.raid) raidDown(W, f, by);
  if (f.cmdr) credit(by, 'obj', 60);
  else if (f.carry) credit(by, 'obj', 10);
  // The hero gains as from a kill.
  const heroIn = by === W.hero || (f.lastHitBy === W.hero);
  if (heroIn || (W.hero.stats && [...f.hitBy.keys()].includes(W.hero))) A.gainXp(Math.max(3, A.xpFor(G.player.lvl) / (W.role === 'dps' ? 6 : 9)));
  if (onScreen(f) && A.M().fx.h_kill && A.fxBudget('kill', 6)) A.fxOn('h_kill', f, { scale: f.cmdr ? 1.2 : 0.7 });
  if (!f.troop) W.feed.push({ t: G.t, a: by ? by.name || (by.m && by.m.name) || '몬스터' : '?', at: by && by.team !== undefined ? by.team : 1 - f.team, b: f.name, bt: f.team, big: !!f.cmdr });
  if (W.mode === 'commander' && !f.troop && by) W.score[by.team] += f.cmdr ? 0 : 1;
  if (f.cmdr) {
    A.say(`${f.name}${f.team === 0 ? '이 쓰러졌습니다!' : '을 쓰러뜨렸습니다!'}`, f.team === 0 ? 'warn' : 'sys');
    A.banner(`${f.name} 격파!`);
    if (W.mode === 'capture') W.score[1 - f.team] += 40;
    if (W.mode === 'escort' && W.cart && f.team !== W.attacker) W.cart.boost = G.t + 15;
  } else if (by && by.team === 0 && by.stats && by !== W.hero && Math.random() < 0.12) talk(W, by, ['하나 잡았다!', '처치!', 'ㅋㅋ 잡음', '나이스!']);
  else if (f.team === 0 && f.squad && f.squad.leader === f && Math.random() < 0.5) A.say(`★${f.name}(공대장) 쓰러짐! 다시 모여요!`, 'warn');
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
  const at = b.home || W.teams[b.team].spawn;
  placeBody(W, b, at);
  (b.team === 1 ? G.enemies : G.party).push(b);
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
  (b.team === 1 ? G.enemies : G.party).push(b);
  W.ghosts = W.ghosts.filter(x => x !== g);
  credit(healer, 'revives', 1);
  shout(W, healer, '부활');
  if (onScreen(b)) A.addFx(A.FX.revive, b.x, b.y + 2, { anchor: 'bottom' });
  if (healer.team === 0 && Math.random() < 0.5) talk(W, healer, ['부활 갑니다!', '일어나요!']);
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
  if (by && by.team === 1) { credit(by, 'kills', 1); W.teams[1].kills++; if (W.mode === 'commander') W.score[1]++; }
  for (const [who, t] of W.hero.hitBy) if (who !== by && G.t - t < 6) credit(who, 'assists', 1);
  W.hero.hitBy.clear();
  if (W.raid && G.aggro === p) G.aggro = raidAggro();
  W.feed.push({ t: G.t, a: by ? by.name : '?', at: 1, b: W.hero.name, bt: 0 });
  W.heroBack = G.t + (W.raid ? 9 + Math.min(8, W.t / 45) : 7 + Math.min(6, W.t / 60));
  W.ghosts.push({ b: W.hero, tx: p.tx, ty: p.ty, x: p.x, y: p.y, t: G.t, until: W.heroBack });
  A.say(`쓰러졌습니다… ${Math.ceil(W.heroBack - G.t)}초 뒤 진영에서 다시 일어납니다.`, 'warn');
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
    if (W.raid && W.boss && d2(W.boss, h) < 4 && !held && G.t - (W.heroTauntT || -99) >= 10) {
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
      const fx = SK.c_heal.fxs[Math.min(7, Math.floor(p.lvl / 5))];
      if (fx) A.addFx(fx, low.x, low.y - 26, { scale: 0.9 });
      healBody(W, h, low, low.maxHp * 0.08 * W.roleK);
      A.floatText(low.x, low.y - 70, '기원', '#fff', true);
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
    if (fx && fxOk() && W.role === 'healer') A.addFx(fx, m.x, m.y - 26, { scale: 0.6 });
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
  const n = [0, 0];
  for (const t of [0, 1]) for (const b of W.alive[t]) if (!b.gate && !b.troop && Math.hypot(b.tx - x, b.ty - y) <= r) n[t]++;
  return n;
}

function dropPoint(W, team) {
  if (W.mode === 'capture') {
    const mine = W.flags.filter(f => f.owner === team);
    const f = (mine.length ? mine : W.flags).reduce((a, c) => (Math.abs(c.x - W.teams[team].spawn[0]) < Math.abs(a.x - W.teams[team].spawn[0]) ? c : a));
    return [f.x, f.y];
  }
  if (W.mode === 'escort') return [W.cart.x, W.cart.y];
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
      A.say(`[${T.name} 지휘] ${say}`, 'party');
    }
  };
  const ahead = W.alive ? W.alive[team].length - W.alive[1 - team].length : 0;
  // The main body: every squad but the first goes where the guild's weight is needed.
  const blob = (x, y, kind, obj, text) => { for (let i = 1; i < squads.length; i++) set(squads[i], x + ((i % 3) - 1) * 1.5, y + (i > 2 ? 1 : -1), kind, obj, i === 1 ? text : null); };
  if (W.mode === 'capture') {
    const fl = W.flags.slice().sort((a, b) => Math.hypot(a.x - mine[0], a.y - mine[1]) - Math.hypot(b.x - mine[0], b.y - mine[1]));
    const [near, mid, far] = fl;
    const threat = fl.find(f => f.owner === team && countAt(W, f.x, f.y, 4)[1 - team] >= 2);
    const behind = W.score[team] < W.score[1 - team] - 15;
    set(squads[0], near.x, near.y, 'capture', null, `${near.name} 거점 지켜요`);
    if (threat && threat !== mid) blob(threat.x, threat.y, 'capture', null, `${threat.name} 거점이 공격받아요! 다 같이!`);
    else if (mid.owner === team && (ahead >= -2 || behind)) {
      blob(far.x, far.y, 'capture', null, `${far.name} 거점 다 같이 칩니다!`);
      set(squads[squads.length - 1], mid.x, mid.y, 'capture', null, null);
    } else blob(mid.x, mid.y, 'capture', null, `${mid.name} 거점으로 다 모여요!`);
  } else if (W.mode === 'commander') {
    const myC = T.cmd, theirC = foe.cmd;
    const mid = W.def.mid;
    const underAttack = W.alive[1 - team].filter(e => d2(e, myC) < 7).length >= 3;
    const push = ahead >= 2 || W.left < 200 || W.score[team] < W.score[1 - team] - 5;
    set(squads[0], myC.home[0] + Math.sign(mid[0] - myC.home[0]) * 3, myC.home[1], 'defend', null, '대장 곁을 지킵니다');
    if (underAttack) blob(myC.tx, myC.ty, 'defend', null, '대장이 공격받아요! 전원 복귀!');
    else if (push && !theirC.dead) blob(theirC.tx, theirC.ty, 'assault', theirC, '적 진영대장 돌격! 다 같이!');
    else blob(mid[0], mid[1], 'hold', null, '중앙에 모여 밀어요');
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
  const dmg = W.raid ? s.boss + 0.6 * (s.dmg - s.boss) : s.dmg;
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
  pr.mats[W.def.mat] = (pr.mats[W.def.mat] || 0) + mats;
  pr.gold = (pr.gold || 0) + gold;
  pr.war = pr.war || { played: 0, won: 0, best: {} };
  pr.war.played++;
  if (won) pr.war.won++;
  const bt = pr.war.best[W.def.id];
  if (!bt || 'SABC'.indexOf(tier) < 'SABC'.indexOf(bt)) pr.war.best[W.def.id] = tier;
  A.saveProgress();
  W.result = { win, why, tier, tierK, mats, gold, rank: rank + 1, rows };
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
  return `<div class="wr-cols">${(W.raid ? [0] : [0, 1]).map(t => `<table><caption style="color:${W.teams[t].color}">${W.teams[t].name}${W.raid ? '' : ' 길드'}${W.over ? (W.win === t ? ' · 승리' : ' · 패배') : ''}</caption>${head}${rows.filter(x => x.b.team === t).map((x, i) => rowHtml(W, x, i)).join('')}</table>`).join('')}</div>`;
}

/** The hero as it stood in the war, in 연's layers and its own gear, for the result's spotlight. */
function heroShot(G) {
  const b = { cls: G.cls, gear: G.player.gear, fdx: 0, fdy: 1, walkT: 0, poseT: 0 };
  if (!drawFighterKey(b, 'idle')) return '';
  const e = frames.get(b.lastKey);
  if (!e) return '';
  const c = document.createElement('canvas');
  c.width = e.pic.width;
  c.height = e.pic.height;
  c.getContext('2d').drawImage(e.pic, 0, 0);
  try { return c.toDataURL(); } catch (err) { return ''; }
}

function showResult(W) {
  const G = A.G();
  if (!G || G.war !== W) return;
  const r = W.result, won = r.win === 0, box = document.getElementById('war-result');
  const art = img(won ? 'ui_attack_result_win' : 'ui_attack_result_lose');
  const mat = W.raid ? { name: '레이드주화' } : A.MATS[W.def.mat];
  // 연's duel result: the word on a brush stroke, the hero in a spotlight, the rewards as medallions.
  const hud = n => (img(n) ? `assets/hud/${n}.png` : '');
  const medal = (label, value, icon) => `<div class="wr-medal">${hud('ui_icon_medal01') ? `<img class="wr-mbg" src="${hud('ui_icon_medal01')}" alt="">` : ''}
    ${icon ? `<img class="wr-mic" src="${icon}" alt="">` : ''}<b>${label}</b><span>${value}</span></div>`;
  const matIcon = W.raid ? '' : A.matPicture ? A.matPicture(W.def.mat) : '';
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
  document.body.classList.remove('war');
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

function warState() {
  const G = A.G();
  if (!G || !G.war) return null;
  const W = G.war;
  if (W.raid) {
    const b = W.boss;
    return {
      id: W.def.id, mode: 'raid', t: W.t, gt: G.t, left: W.left, over: W.over, win: W.win, why: W.why, role: W.role,
      boss: b ? { hp: Math.round(hpk(b) * 1000) / 10, phase: G.phase, enraged: !!G.enraged } : null, cleared: !!G.cleared,
      alive: W.alive ? W.alive.map(a => a.length) : null, dead: W.bodies.filter(x => x.dead).length, adds: W.alive ? W.alive[1].length - (b ? 1 : 0) : 0,
      hero: { ...W.hero.stats, dead: G.dead, up: W.hero.aliveT / Math.max(1, W.t), afk: W.afkT || 0 }, stat: { ...W.stat }, U: W.U, Uh: W.Uh,
      heroRate: W.rawAll ? W.rawAll / Math.max(1, W.t) / W.Uh : 0, aggro: G.aggro ? (G.aggro === G.player ? 'hero' : G.aggro.role + ':' + G.aggro.name) : null,
      result: W.result && { tier: W.result.tier, k: W.result.tierK, coins: W.result.coins, gold: W.result.gold, rank: W.result.rank },
      bodies: W.bodies.length,
    };
  }
  return {
    id: W.def.id, mode: W.mode, t: W.t, left: W.left, score: W.score.slice(), over: W.over, win: W.win, why: W.why, round: W.round,
    flags: W.flags && W.flags.map(f => f.owner), cart: W.cart && { i: W.cart.i, best: W.cart.best.slice(), len: W.path.length, attacker: W.attacker },
    gate: W.gate && { hp: Math.round(W.gate.hp / W.gate.maxHp * 100), down: W.gateDown },
    cmd: W.teams.map(t => Math.round(hpk(t.cmd) * 100)), alive: W.alive ? W.alive.map(a => a.length) : null,
    kills: W.teams.map(t => t.kills), hero: { ...W.hero.stats, role: W.role, dead: G.dead, afk: W.afkT || 0 }, result: W.result && { tier: W.result.tier, mats: W.result.mats, gold: W.result.gold, rank: W.result.rank },
    bodies: W.bodies.length, dead: W.bodies.filter(b => b.dead).length,
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
  for (let s = 0; s < SQUADS; s++) {
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
  const btn = document.getElementById('war-sb-btn');
  if (btn) btn.hidden = false;
  document.body.classList.add('war');
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
  }
  raidCalls(W, dt);
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
  return t.kind === 'boss' ? 1.3 + 0.6 * (t.scale || 1) : 1.5;
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
  const order = sq.order || { x: W.camp[0], y: W.camp[1], kind: 'hold' };
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
  if (b.role === 'healer') return thinkHealer(W, b, order);
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
  if (W.taunted && W.taunted.until > G.t) {
    const by = W.taunted.by;
    if (by.hero ? !G.dead : alive(by)) return by.hero ? G.player : by;
  }
  const pool = [];
  for (const m of W.alive[0]) {
    if (m.hero) continue;
    for (let i = 0; i < (m.role === 'tank' ? 6 : 1); i++) pool.push(m);
  }
  if (!G.dead) for (let i = 0; i < (W.role === 'tank' ? 6 : 1); i++) pool.push(G.player);
  return pool.length ? pick(pool) : null;
}

/** An AI raider's blow on a monster: it takes it as from a companion (not with the hero's might). */
function raidHit(W, src, t, dmg) {
  const before = t.hp;
  const n = A.strike(t, dmg, onScreen(t));
  if (!(n > 0)) return;
  credit(src, 'dmg', n);
  if (t.kind === 'boss') credit(src, 'boss', n);
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
  return rate > target ? dmg * target / rate : dmg;
}
function raidCredit(e, dmg, killed) {
  const W = A.G().war, h = W.hero;
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
  return W.U * RAID_BOSS_U;
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

// ---------------------------------------------------------------- drawing

function drawMap(camX, camY) {
  const G = A.G(), W = G.war, m = W.map, ctx = A.ctx, VW = A.VW(), VH = A.VH();
  ctx.fillStyle = '#000';
  ctx.fillRect(camX, camY, VW, VH);
  if (window.__dbgWar && window.__dbgWar.nomap) return;
  const c = m.chunk;
  // Only the part of each piece in view (a whole 1024-pixel piece per frame was most of the cost).
  for (let cy = Math.max(0, Math.floor(camY / c)); cy * c < Math.min(m.h, camY + VH); cy++)
    for (let cx = Math.max(0, Math.floor(camX / c)); cx * c < Math.min(m.w, camX + VW); cx++) {
      const im = A.images[`ywar/${W.def.id}_${cx}_${cy}.png`];
      if (!im || !im.width) continue;
      const sx = Math.max(0, Math.floor(camX - cx * c)), sy = Math.max(0, Math.floor(camY - cy * c));
      const sw = Math.min(im.width - sx, Math.ceil(camX + VW - cx * c - sx) + 1), sh = Math.min(im.height - sy, Math.ceil(camY + VH - cy * c - sy) + 1);
      if (sw > 0 && sh > 0) ctx.drawImage(im, sx, sy, sw, sh, cx * c + sx, cy * c + sy, sw, sh);
    }
}

/** Under the bodies: the flags' circles, the cart, the gate's doors, the crates, the posts. */
function drawGround() {
  const G = A.G(), W = G.war, ctx = A.ctx;
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
  for (const t of W.teams) {
    const w = t.cmd.wind;
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
  ctx.fillStyle = b.team === 0 ? '#3ad04a' : '#e8402a';
  ctx.fillRect(bx, by + 1, Math.round(bw * k), 2);
  if (b.shield > G.t) { ctx.fillStyle = '#9ad8ff'; ctx.fillRect(bx, by + 3, bw, 1); }
  ctx.font = '8px G7';
  ctx.textAlign = 'center';
  const nameCol = b.cmdr ? '#ffd040' : b.leader ? (b.team === 0 ? '#d8ff7a' : '#ffb07a') : b.team === 0 ? '#9ff08a' : '#ff9a8a';
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
  if (b.bubble && dh < 8 && G.t - b.bubble.t < 1.4) A.drawBubble(b.bubble.text, b.x, b.y - top - 14, G.t - b.bubble.t);
  // Held: 연's own stun icon over the head (a word over every held fighter of a crowd was a wall of text).
  if (b.stun > 0.3) {
    const im = A.images['hud/st_icon_stun.png'];
    if (im && im.width) ctx.drawImage(im, Math.round(b.x - 5), Math.round(b.y - top - 26), 10, 10);
  }
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
  const g = c.getContext('2d'), W = c.width, H = c.height;
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
  const e = { pic: c, ox: 0, oy: 0 };
  if (x1 >= x0) {
    const t = document.createElement('canvas');
    t.width = x1 - x0 + 1;
    t.height = y1 - y0 + 1;
    t.getContext('2d').drawImage(c, -x0, -y0);
    e.pic = t;
    e.ox = x0;
    e.oy = y0;
  }
  framesMade++;
  if (frames.size > 2400) { const old = frames.keys().next().value, v = frames.get(old); frames.delete(old); if (v && v.pic && v.pic.close) v.pic.close(); }
  frames.set(key, e);
  if (window.createImageBitmap) { const src = e.pic; createImageBitmap(src).then(bm => { if (e.pic === src) e.pic = bm; }).catch(() => {}); }
  return e;
}
const markers = [null, null];
function markerPic(team) {
  if (markers[team]) return markers[team];
  const im = img('ui_event_red_arrow');
  if (!im) return null;
  const c = document.createElement('canvas');
  c.width = 9;
  c.height = 13;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = true;
  g.drawImage(team === 0 ? A.tinted(im, 'hue-rotate(115deg) saturate(1.3) brightness(1.15)') : im, 0, 0, 9, 13);
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
  if (im) g.drawImage(team === 0 ? A.tinted(im, 'hue-rotate(115deg) saturate(1.3) brightness(1.15)') : im, Math.round((bw + 2 - mw) / 2), 0, mw, mh);
  g.fillStyle = '#000';
  g.fillRect(0, mh + 1, bw + 2, 4);
  g.fillStyle = team === 0 ? '#3ad04a' : '#e8402a';
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
  ctx.drawImage(c.pic, Math.round(b.x - (mirror ? cw - fx : fx) * s) + c.ox, Math.round(b.y - fy * s) + c.oy);
  ctx.globalAlpha = 1;
}

// A fighter's frame with all its layers composited once (per class, outfit, row and frame) and
// kept: one drawImage a fighter instead of six, and the shadow from one small picture.
const frames = new Map(), labels = new Map();
let framesMade = 0;
let shadowPic = null;
const drawFighterKey = (b, pose) => drawFighter(b, 0, 0, pose, 1, true);
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
  const [cw, ch] = H.cell, [fx, fy] = H.foot, mirror = name !== 'dead' && dir === 'side' && fdx > 0;
  const k = b.yvKey + '|' + a.row + '|' + f + (mirror ? 'm' : '');
  let c = frames.get(k);
  if (!c) {
    const sheets = {};
    for (const [kind, v] of Object.entries(b.yv2)) {
      const meta = H.layers[kind] && H.layers[kind][v];
      if (!meta) continue;
      const path = 'yhero2/' + meta.file;
      if (!(path in A.images)) A.loadImage(path);
      const im = A.images[path];
      if (!im || !im.complete || !im.width) return false;
      sheets[kind] = { im, cols: meta.cols || 1e9 };
    }
    c = document.createElement('canvas');
    c.width = cw;
    c.height = ch;
    const g = c.getContext('2d');
    // The shadow under the feet, in the same picture.
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.beginPath();
    g.ellipse(mirror ? cw - fx : fx, fy - 1, 10, 3.5, 0, 0, Math.PI * 2);
    g.fill();
    if (mirror) { g.translate(cw, 0); g.scale(-1, 1); }
    for (const kind of (a.z && a.z[f]) || ['body', 'armor', 'head', 'helmet', 'shield', 'weapon']) {
      const sh = sheets[kind];
      if (sh) g.drawImage(sh.im, (f % sh.cols) * cw, (a.row + Math.floor(f / sh.cols)) * ch, cw, ch, 0, 0, cw, ch);
    }
    c = keepFrame(k, c);
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
  ctx.drawImage(c.pic, Math.round(x) - (mirror ? cw - fx : fx) + c.ox, Math.round(y) - fy + c.oy);
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
  const prog = sideProgress(W);
  const boxW = 54 * u, boxH = 18 * u, bx = cw / 2 - boxW / 2, by0 = 4 * u, barW = Math.min(190 * u, cw / 2 - boxW / 2 - 12 * u);
  for (const t of [0, 1]) {
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
  // The mode's own line.
  let line = `${W.def.name} · ${W.def.title}`;
  if (W.raid) line = W.boss ? '' : `${W.def.name} · 쓰러진 공대원 ${W.bodies.filter(b => b.dead).length}`;
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
  let y = 46 * u;
  for (const f of W.feed.slice(-5)) {
    const a = Math.min(1, (6 - (G.t - f.t)) * 2);
    ctx.globalAlpha = a;
    const x = cw - 8 * u;
    hudText(f.b, x, y, f.bt === 0 ? '#9ff08a' : '#ff9a8a');
    const wb = ctx.measureText(f.b).width;
    if (icon) ctx.drawImage(icon, x - wb - 16 * u, y - 10 * u, 12 * u, 12 * u);
    hudText(f.a, x - wb - 20 * u, y, f.at === 0 ? '#9ff08a' : '#ff9a8a');
    y += 13 * u;
  }
  ctx.globalAlpha = 1;
  // Bottom: each side's 진영대장 (as the reference: 북 100% · 진영대장 · 남 100%).
  const bh = 8 * u, by = ch - bh - 2 * u, half = cw / 2 - 40 * u;
  if (!W.raid) {
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
  }
  if (W.hero.carry) {
    ctx.font = `${Math.round(11 * u)}px G11`;
    hudText('보급 운반 중 — 목표 지점으로!', cw / 2, 46 * u, '#ffd27a');
  }
  // A 진영대장 winding up near the hero: the screen's edge throbs red too.
  const near = !W.raid && W.teams.find(t => t.cmd.wind && d2(t.cmd, W.hero) < 8);
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
