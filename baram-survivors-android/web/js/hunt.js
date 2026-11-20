// 사냥 대개편 (design/hunt_overhaul.md): the hunting grounds' own rules, kept apart from game.js
// as war.js is. game.js calls in where marked "사냥 기믹".
//
//   - 계측 (P0): window.__pace — each game second's kills, level, field and boss life, and the
//     moments something new happens, so a run's tempo can be measured (tools/pace.js).
//   - 템포 (P1): no fixed clock. 토벌도 (G.hunt.prog, 0~1) rises with kills, champions, leaders,
//     treasure and (P3) the ground's objective; at 100% (or by 3:30 at the latest) the boss is
//     called. Three acts: 돌입 (a full field at the gate, quick levels, a 갈림길 at 0:40), 목표
//     (beats tied to the gauge, the gaps filled), 보스 (red-tile patterns, phases, 그로기, 광폭화).
//
// settings.legacyPace keeps the old four-minute script, for comparison. Raids, 대항전, 수련장 and
// 계속 사냥 never take these rules.

let A = null; // game.js internals (initHunt)

// ------------------------------------------------------------------ tuning
export const PACE = {
  introAt: 14, act1End: 50, maxBoss: 210, warn: 2,
  gap: 15,                   // seconds with nothing new before a filler beat
  killK: 0.0004, killCap: 0.002,  // per plain kill, and at most this much a second from kills
  champ: 0.02, mini: 0.12, treasure: 0.05,
  champsAt: [0.12, 0.5, 0.82], minisAt: [0.32, 0.68],
  open: 1.6, openHp: 0.6,    // 1막: the field at the gate ×1.6, each weaker
  // The gauge's ceiling: (t - 20) / (110 × k), k by the hero's strength (개편 A, P0-2): the strong
  // (k 0.55) may meet the boss at 1:20, the weak (k 1.35) at about 2:50, 3:30 at the latest.
  floorT: [20, 110], strength: { lo: 0.55, hi: 1.6, pow: 0.9, mid: 0.7, from: 62 },
  boss: {
    cap: 0.03, decayAt: 75, decay: 0.006, enrageAt: 90, killAt: 150, fight: 40, life: 26, lo: 0.4, hi: 1.8,
    // The field stays full while the boss stands (개편 A, P0-1): 0.45 of the field's floor, and
    // a few called every 8 s about the boss; each of the crowd felled fills its 그로기 a little.
    floorK: 0.45, floorMin: 50, floorMax: 90, every: 8, call: [4, 6], gro: 0.008,
  },
  groggy: { fill: 0.25, stun: 3, take: 1.5 },
  share: 0.5,                // a red tile in a hunt takes half a raid's share
  // 몰이 파도 (개편 A, P1-2): every 45 s from 0:35 — a warning (5 s) from one side, a big crowd
  // from there in three rows, quick (13 s at most), then 수확 (the drops pulled in, a chest for a
  // clean drive) and 5 s of breath (the field ×0.6).
  // The drive's size: about 7 s of the hero's own kills of late (no fewer than 16, no more than the
  // field's floor), in rows a beat apart on a band of the side 11 tiles wide, so they come in a heap.
  wave: { first: 38, every: 45, warn: 5, len: 15, rest: 5, k: 1, secs: 6, min: 16, max: 140, hp: 0.2, step: 0.6, done: 0.75, restK: 0.6, warnK: 0.6, span: 5, rowEvery: 0.4, rows: 8 },
  // 판 중 선택 (개편 A, P1-3): a two-way pick on a strip that does not stop the hunt; after 5 s
  // the one picked last time (or the first) is taken.
  choice: { first: 55, second: 35, wait: 5 },
  stopMax: 6,
  // 필드 보스 (개편 A, P2-4, 연): on a ground conquered before, three runs in ten a roaming one of the
  // ground's boss comes past 60% of the gauge, with its blows; 레이드주화, a special's chance.
  field: { chance: 0.3, at: 0.6, life: 0.35, every: 5 },                // cards that stop the hunt (자동 선택 off), the 정비 among them
};

// 판 중 선택: two of these at a time, as 연's 의뢰 (위험 감수 only on a ground conquered before).
export const PATHS = {
  elite: { name: '정예 토벌', desc: '챔피언 무리 ×2 · 재료 ×1.5' },
  treasure: { name: '보물 사냥', desc: '보물 도깨비 3회 · 돈 ×1.6' },
  swift: { name: '속공', desc: '토벌도 ×1.3 · 몬스터 걸음 +15%' },
  pact: { name: '위험 감수', desc: '규약 하나를 켬 · 그 보상' },
  jar: { name: '회복 항아리', desc: '체력 가득 · 회복약 셋' },
  tune: { name: '정비', desc: '보스 전 카드 한 장 고르기' },
  rage: { name: '광폭 도전', desc: '보스 광폭화 상태로 · 보상 ×1.3' },
};
const CHOICES = [
  { id: 'c1', title: '어느 쪽을 노릴까?', opts: () => ['elite', 'treasure'] },
  { id: 'c2', title: '속도를 낼까, 숨을 고를까?', opts: G => ['swift', G.wasCleared ? 'pact' : 'jar'] },
  { id: 'c3', title: '보스를 어떻게 맞을까?', opts: () => ['tune', 'rage'] },
];

// The boss's own blows on a hunting ground (the raid patterns' names), by ground; by its group
// when the ground has none of its own (design §4.5).
const BOSS_PATTERNS = {
  novice: ['charge'], rabbit: ['pounce'], rat: ['stampede', 'charge'], snake: ['breath', 'rain'], bigsnake: ['whirl', 'breath'],
  deer: ['charge', 'trample'], pig: ['charge', 'quake'], bear: ['claw', 'stomp'], bearman: ['claw', 'stomp'], fox: ['clones', 'hunt'],
  mantis: ['xslash', 'claw'], skull: ['hunt', 'ring'], haunt: ['hunt', 'safe'], goblin: ['quake', 'sparks'], bandit: ['iai', 'charge'],
  japan: ['iai', 'xslash'], steppe: ['charge', 'stampede'], zud: ['charge', 'stampede'], zud2: ['hunt', 'ring'], hwagwa: ['staff', 'clones', 'cloud'],
  kirin: ['thunder', 'meteor'], wolf: ['pounce', 'claw'], greatwall: ['quake', 'stomp'], qin: ['seal', 'pillars'], baekdu: ['pounce', 'trample'],
  baekdu2: ['whirl', 'ring'], baekdu3: ['meteor', 'breath'], baekdu4: ['tide', 'whirl'],
  sea: ['whirl', 'tide'], palace: ['sweep', 'tide'], deepsea: ['whirl', 'ring'], reef: ['hunt', 'rain'], wreck: ['charge', 'ring'],
  island: ['rain', 'claw'], gogyun: ['rain', 'claw'], volcano: ['lava', 'pillars', 'flare'], spidercave: ['pounce', 'ring'], gareung: ['hunt', 'seal'], pokyeom: ['flare', 'charge'],
  yogoe: ['hunt', 'clones'], royal: ['safe', 'ring'], murim: ['xslash', 'stomp'], musin: ['iai', 'xslash'], tagye: ['seal', 'sweep'],
  hwatang: ['lava', 'pillars'], hanbing: ['breath', 'ring'], geohae: ['quake', 'stomp'], cheolsang: ['pillars', 'seal'],
  sandolim: ['charge', 'quake'], fallforest: ['hunt', 'whirl'], jagwi: ['rain', 'drought'], oldaram: ['seal', 'sweep'], haya: ['breath', 'flare'],
  lobi: ['tide', 'whirl'], aram: ['sweep', 'ring'], ancient: ['seal', 'xslash'],
  abyss: ['hunt', 'ring'], abyss2: ['hunt', 'rain'], abyss3: ['pillars', 'seal'], abyss4: ['quake', 'meteor'], cow: ['stampede', 'charge'],
};

// ------------------------------------------------------------------ state

/** The new rules apply: a hunting ground (not a raid, war, 수련장 or 계속 사냥), legacyPace off. */
function on(G = A.G()) {
  return !!(G && G.hunt && !G.endless);
}

function start(G) {
  G.pace = { s: [], ev: [], cards: 0, manual: 0, last: -1 };
  // G.war is set after this (War.setup runs later): the 대항전·쟁 known by their stage too.
  if (A.settings().legacyPace || G.stage.raid || G.stage.war || G.war || G.training) return;
  choiceHide();
  G.hunt = {
    prog: 0, act: 1, lastNew: 0, killSec: -1, killGot: 0, intro: false, path: null, paths: {},
    champsAt: PACE.champsAt.slice(), minisAt: PACE.minisAt.slice(), treasures: 0, warnAt: null,
    bigDmg: 0, bigTime: 0, bonusLv: 0, beat: 0, k: 1, str: 0,
    wv: { n: 0, state: 'idle', next: PACE.wave.first, ok: 0, clean: 0 },
    asked: 0, choice: null,
  };
  G.phase = 0;
  arenaStart(G);
  ambientLoad(G);
  modeStart(G);
  // The old clock's leaders and champions are the gauge's now.
  G.minis = [];
  G.champs = [];
  G.events = [];
}

/** A moment something new happened (champions, a leader, an event, the boss …). */
const NEW = /^(champ|mini|event|boss|press|clear|cross|goal|stage|hazard|phase|groggy|elite|act|intro|pat)/;
function note(kind) {
  const G = A.G();
  if (!G || !G.pace) return;
  G.pace.ev.push([Math.round(G.t * 10) / 10, kind]);
  if (G.hunt && NEW.test(kind)) G.hunt.lastNew = G.t;
}

/** Once a game second: kills, level, field, boss life (%), hero life (%), 토벌도 (%). */
function sample() {
  const G = A.G();
  if (!G || !G.pace) return;
  const sec = Math.floor(G.t);
  if (sec === G.pace.last) return;
  G.pace.last = sec;
  const b = G.enemies.find(e => e.kind === 'boss'), p = G.player;
  G.pace.s.push([sec, G.kills, p.lvl, G.enemies.length, b ? Math.round(100 * b.hp / b.maxHp) : -1, Math.round(100 * p.hp / p.maxHp),
    G.hunt ? Math.round(G.hunt.prog * 100) : -1]);
}

/** 토벌도 up (by k of the whole). */
function gain(k) {
  const G = A.G(), H = G.hunt;
  if (!H || H.act >= 3) return;
  if (H.paths.swift) k *= 1.3;
  k *= surgeK(); // 폭주, 일망타진, 몰이 파도
  // However strong the hero, the gauge cannot run ahead of the run's own time (full at 2:10 at the
  // soonest): what comes in over that is kept and paid out as the time allows.
  H.bank = (H.bank || 0) + k;
  release();
}

function release() {
  const G = A.G(), H = G.hunt;
  if (!H || !H.bank) return;
  const room = Math.max(0, Math.min(1, (G.t - (H.floor0 ?? PACE.floorT[0])) / (PACE.floorT[1] * H.k)) - H.prog);
  const k = Math.min(room, H.bank);
  H.prog = Math.min(1, H.prog + k);
  H.bank -= k;
}

/** The boss's life as callBoss would make it before matching it to the hero (addEnemy's boss at
 *  the third act: tough() = 2.3, then the level's and 승급's growth). */
function bossLifeOld() {
  const G = A.G(), m = G.boss.m, area = G.stage.big ? Math.min(m.area, 5200) : m.area;
  const tough = (1 + G.level * 0.1) * 2.3 * (G.cleared ? 1.5 : 1) * (G.stage.ease || 1);
  const grow = 1 + 0.04 * Math.max(0, G.player.lvl - 15) + 0.1 * A.promoOf(G.cls.id);
  return (180 + area / 5) * tough * 4 * (A.pactOn('hp') ? 1.4 : 1) * grow;
}

/** 힘지수 (개편 A, P0-2), once a second from the second act: the hero's blow on one foe against
 *  what the boss's fight of 40 s asks. k (the gauge's ceiling stretched or shortened) follows. */
function strengthTick() {
  const G = A.G(), H = G.hunt, S = PACE.strength;
  if (H.act !== 2 || H.mode === 'rush' || G.t < S.from || G.t - (H.strT || 0) < 1) return;
  H.strT = G.t;
  const dps = dpsEstimate();
  if (!dps) return;
  H.str = dps * PACE.boss.fight / Math.max(1, bossLifeOld());
  H.k = Math.max(S.lo, Math.min(S.hi, Math.pow(H.str / S.mid, -S.pow))) * (H.paths.swift ? 0.85 : 1);
  G.pace.str = Math.round(H.str * 100) / 100;
  G.pace.k = Math.round(H.k * 100) / 100;
}

/** The time on the old clock this run stands at: the field and the monsters grow with the gauge. */
function clock() {
  const G = A.G(), H = G.hunt;
  if (!H) return G.t;
  return H.act >= 3 ? 240 : Math.min(235, Math.max(G.t * 0.55, 235 * H.prog));
}

/** Monsters' toughness: by act and 토벌도, not the clock (×2.3 at the boss, against the old ×2.8 at 4:00). */
function tough() {
  const H = A.G().hunt;
  return 1 + 0.9 * (H.act >= 3 ? 1 : H.prog) + 0.2 * (H.act - 1);
}

const XP = { act2: 0.65, act3: 0.6, k20: 0.15, k25: 0.25 };

/** Experience by act: the first 15 seconds ×2.5, easing to ×1.5 by 0:50; ×1.3 in the second act. */
function xpK() {
  const G = A.G(), H = G.hunt;
  if (!H) return 1;
  if (H.mode === 'rush') return 0; // 보스 직행: no experience (the build comes made)
  const t = G.t, act = H.act === 1 ? (t < 15 ? 2.5 : 2.5 - (Math.min(t, PACE.act1End) - 15) / (PACE.act1End - 15)) : H.act === 2 ? XP.act2 : XP.act3;
  // A steeper climb past 20, steeper again past 25: the run ends about Lv 32~38 (개편 A, P1-4).
  const l = G.player.lvl;
  return act * surgeK() / (1 + XP.k20 * Math.max(0, l - 20) + XP.k25 * Math.max(0, l - 25));
}

// ------------------------------------------------------------------ the field

function spawn(dt) {
  const G = A.G(), H = G.hunt, t = G.t;
  const boss = G.bossT !== undefined;
  const ct = clock();
  const B = PACE.boss, rest = H.wv.state === 'rest';
  const base = boss ? Math.max(B.floorMin, Math.min(B.floorMax, A.floorCount(ct) * B.floorK))
    : A.floorCount(ct) * (H.act === 1 ? PACE.open : 1) * (rest ? PACE.wave.restK : H.wv.state === 'warn' ? PACE.wave.warnK : 1);
  const floor = Math.round(base * (A.pactOn('horde') ? 1.35 : 1) * (G.arena ? 0.8 : 1));
  H.floor = floor;
  for (let i = 0; i < 4 && G.enemies.length < floor; i++) {
    const e = A.addEnemy(A.pickMonster());
    if (e && H.act === 1) { e.hp *= PACE.openHp; e.maxHp *= PACE.openHp; }
  }
  if (!boss && (rest || H.wv.state === 'run')) beats(dt); // a drive, or the breath after it: no trickle on top
  else if (!boss) {
    G.spawnT -= dt;
    if (G.spawnT <= 0) {
      G.spawnT = 1;
      // 압박, as before: a hero who stays well is pressed harder.
      const p = G.player, well = p.hp / p.maxHp > 0.75 && t >= 60;
      G.calm = well ? (G.calm || 0) + 1 : Math.max(0, (G.calm || 0) - 3);
      const press = Math.min(3, Math.floor(G.calm / 20));
      if (press > (G.press || 0)) {
        A.say(press === 3 ? '몬스터들이 사방에서 몰려듭니다!' : '몬스터들이 더 몰려듭니다!', 'warn');
        if (press >= 2) A.banner(press === 3 ? '압박 최고조!' : '몬스터가 몰려든다!');
        note('press' + press);
      }
      G.press = press;
      const extra = (ct >= 180 ? 4 : ct >= 120 ? 3 : ct >= 60 ? 2 : t >= 8 ? 1 : 0) + press;
      const cap = Math.min(420, floor + 120);
      for (let i = 0; i < extra && G.enemies.length < cap; i++) A.addEnemy(A.pickMonster());
    }
    beats(dt);
  } else bossFight(dt);
  if (H.act >= 3 && H.goal && !H.goal.over) goalDone(H.goal.step >= goalSteps(H.goal));
  if (G.marks.length) A.raidMarks();
}

function champs(n = 1, aff = null) {
  const G = A.G();
  const H = G.hunt, k = H.paths.elite && !aff ? 2 : 1;
  let pack = 0, named = '';
  for (let j = 0; j < n * k; j++) {
    const m = A.pickMonster(true), a = aff || affixOf(G);
    // Later in the run (or on 정예 토벌) a pack may carry a second affix of the ground's or the common ones.
    const a2 = !aff && (H.prog >= 0.5 || H.paths.elite) && Math.random() < 0.35 ? affixOf(G, a) : null;
    pack = ++G.packs;
    for (let i = 0; i < 3; i++) { const e = A.addEnemy(m, 'champ', { name: '챔피언', scale: 1.15 }, pack); if (e) { affix(e, a); affix(e, a2); named = e.name; } }
  }
  A.say(`${named || '챔피언'} 무리가 나타났습니다!`, 'warn');
  if (Math.random() < 0.6) A.emote('surprise');
  note('champ');
  return pack;
}

function leader() {
  const G = A.G();
  if (!A.addEnemy(G.mini.m, 'mini', G.mini)) return false;
  for (let i = 0; i < 3; i++) A.addEnemy(A.pickMonster(), 'minion');
  A.say(`${A.josa(G.mini.name, '이', '가')} 나타났습니다!`, 'warn');
  A.banner(`${G.mini.name} 등장`);
  note('mini');
  return true;
}

/** The acts' beats: the intro, the 몰이 파도 every 45 s, the two-way picks, champions and leaders
 *  on the gauge, a 보물 도깨비 or a pack in the gaps, the boss. */
function beats(dt) {
  const G = A.G(), H = G.hunt, t = G.t;
  if (!H.intro && t >= PACE.introAt) {
    H.intro = true;
    A.banner(`${G.stage.name} · ${G.stage.intro || ''}`.slice(0, 40));
    A.huntEvent(Math.random() < 0.5 ? 'march' : 'ring');
    note('intro');
  }
  if (H.act === 1 && t >= PACE.act1End && H.mode !== 'rush') {
    H.act = 2;
    note('act2');
    goalStart();
  }
  if (H.rushGoal && t >= H.rushGoal) { H.rushGoal = 0; goalStart(); }
  if (H.act === 2) { goalTick(dt); hazardTick(); strengthTick(); }
  affixTick();
  breakTick();
  waveTick();
  choiceTick();
  if (H.warnAt === null && !H.choice) {
    // 판 중 선택: the first in the second act, the second half a minute on with the gauge past half.
    if (H.asked === 0 && t >= PACE.choice.first && H.act >= 2) ask(CHOICES[0]);
    else if (H.asked === 1 && t >= H.askedAt + PACE.choice.second && H.prog >= 0.45 && H.wv.state !== 'run') ask(CHOICES[1]);
  }
  if (H.act >= 2) fieldTick();
  if (H.act >= 2) {
    if (H.champsAt.length && H.prog >= H.champsAt[0]) { H.champsAt.shift(); champs(); }
    if (H.minisAt.length && H.prog >= H.minisAt[0] && G.mini && leader()) H.minisAt.shift();
    else if (H.minisAt.length && H.prog >= H.minisAt[0] && !G.mini) { H.minisAt.shift(); champs(); }
    // 보물 사냥: three treasure goblins, one at once and then every 35 s.
    if (H.paths.treasure && H.treasures < 3 && t >= H.treasureAt && H.warnAt === null) { H.treasures++; H.treasureAt = t + 35; goblin(); }
  }
  // Nothing new for a while (between the drives): a champion pack, a 보물 도깨비, a pack again.
  if (t >= PACE.introAt && t - H.lastNew >= PACE.gap && H.warnAt === null && H.wv.state === 'idle') {
    const kinds = ['champ', H.treasures < 1 ? 'treasure' : 'champ', 'champ', 'treasure'];
    const k = kinds[H.beat++ % kinds.length];
    if (k === 'treasure' && H.treasures < 4) { H.treasures++; goblin(); } else champs();
  }
  // The boss is called: at 100%, or at the latest by 3:30 (a weak hero still gets there).
  if (H.warnAt === null && H.act >= 2 && (H.prog >= 1 || t >= (H.maxBoss || PACE.maxBoss))) {
    H.warnAt = t;
    H.warn = PACE.warn;
    A.banner(`${G.boss.name}의 기운이 다가온다!`);
    A.say(`토벌도가 가득 찼습니다. ${A.josa(G.boss.name, '이', '가')} 나타납니다!`, 'warn');
    A.audio() && A.audio().play('boss');
    note('act3');
    if (H.wv.state === 'run') harvest(); // the drive's spoils in before the fight
    H.wv.state = 'done';
    // 정비 or 광폭 도전: the last pick, while the boss's air gathers.
    if (H.choice) choicePick(H.choice.def);
    ask(CHOICES[2]);
    H.warn = Math.max(H.warn, PACE.choice.wait + 0.3);
  }
  if (H.warnAt !== null && t >= H.warnAt + H.warn) callBoss();
}

// ------------------------------------------------------------------ 몰이 파도 (개편 A, P1-2)

const SIDE = { '1,0': '동', '-1,0': '서', '0,1': '남', '0,-1': '북' };

/** The view's half size, in tiles. */
function halfView() {
  return [Math.ceil(A.VW() / A.TILE / 2), Math.ceil(A.VH() / A.TILE / 2)];
}

/** Open tiles on a row k tiles past the screen's edge on side d, across the side (or a band of it). */
function edgeRow(d, k, band = 99) {
  const G = A.G(), p = G.player, [w, h] = halfView(), out = [];
  const span = Math.min(band, d[0] ? h + 1 : w + 1);
  for (let j = -span; j <= span; j++) {
    const tx = d[0] ? p.tx + d[0] * (w + k) : p.tx + j, ty = d[0] ? p.ty + j : p.ty + d[1] * (h + k);
    if (A.free(tx, ty) && (!G.arena || reach(tx, ty))) out.push([tx, ty]);
  }
  return out;
}

/** The side a drive comes from: the one with most room (on a bounded map). */
function waveSide() {
  const sides = [[1, 0], [-1, 0], [0, 1], [0, -1]].sort(() => Math.random() - 0.5);
  if (!A.G().arena) return sides[0];
  let best = sides[0], n = -1;
  for (const d of sides) { const k = edgeRow(d, 1).length; if (k > n) { n = k; best = d; } }
  return best;
}

function waveTick() {
  const G = A.G(), H = G.hunt, W = H.wv, P = PACE.wave, t = G.t;
  if (H.act >= 3 || H.warnAt !== null || W.state === 'done') return;
  if (W.state === 'idle' && t >= W.next && H.prog < 0.92) {
    W.state = 'warn';
    W.n++;
    W.warnedAt = t;
    W.side = waveSide();
    W.until = t + P.warn;
    W.elite = W.n % 3 === 0;
    // the hero's kills a second over the last ten (before the field thins for the warning)
    const s = G.pace.s, back = s[Math.max(0, s.length - 11)];
    W.rate = back && s.length > 1 ? (s[s.length - 1][1] - back[1]) / Math.max(1, s[s.length - 1][0] - back[0]) : 3;
    const side = SIDE[W.side.join(',')];
    A.banner(`${side}쪽에서 ${W.elite ? '정예가 이끄는 ' : ''}무리가 몰려온다!`);
    A.say(`몰이 파도: ${side}쪽에서 몬스터 무리가 몰려옵니다! 모아서 쓸어 버리세요.`, 'warn');
    const au = A.audio();
    if (au) au.play('skill_nova');
    note('event:wavewarn');
  } else if (W.state === 'warn' && t >= W.until) {
    W.state = 'run';
    W.id = (W.id || 0) + 1;
    W.at = t;
    W.until = t + P.len;
    W.killed = 0;
    W.left = 0;
    W.total = 0;
    W.taken = H.taken || 0;
    const want = Math.round(Math.max(P.min, Math.min(P.max, A.floorCount(clock()) * P.k, W.rate * P.secs)));
    // Rows a beat apart, from just past the screen's edge, on a band of that side: they come as one heap.
    const R = Math.max(2, Math.min(P.rows, Math.ceil(want / Math.max(4, edgeRow(W.side, 1, P.span).length))));
    for (let r = 0; r < R; r++) A.later(r * P.rowEvery, () => { if (A.G() === G && W.state === 'run') waveRow(W, r, Math.ceil(want / R)); });
    W.want = want;
    W.spawnEnd = t + R * P.rowEvery + 0.3;
    if (W.elite) champs(1);
    G.shake = Math.max(G.shake || 0, 0.25);
    note('event:wave');
  } else if (W.state === 'run') {
    if (t - (W.cntT || 0) >= 0.5) {
      W.cntT = t;
      W.left = 0;
      for (const e of G.enemies) if (e.wave === W.id && e.hp > 0) W.left++;
    }
    const spawned = t >= W.spawnEnd;
    if ((spawned && W.total && W.left <= W.total * (1 - P.done)) || t >= W.until) harvest();
  } else if (W.state === 'rest' && t >= W.until) {
    W.state = 'idle';
    W.next = Math.max(W.warnedAt + P.every, t + 8);
  }
}

function waveRow(W, r, n) {
  const G = A.G(), m = A.pickMonster();
  // On the band, a row in and the next behind it; not enough room there (a wall): a row further
  // out, then the whole side; what finds no room there (a walled map) comes in from wherever the field may.
  const P = PACE.wave, sh = a => a.sort(() => Math.random() - 0.5);
  const spots = [...sh(edgeRow(W.side, 1 + (r & 1), P.span)), ...sh(edgeRow(W.side, 3, P.span)), ...sh(edgeRow(W.side, 2 - (r & 1)))];
  for (let i = 0; i < n && G.enemies.length < 420; i++) {
    const at = spots[i] && A.free(spots[i][0], spots[i][1]) ? spots[i] : null;
    const e = A.addEnemy(i % 5 === 4 ? A.pickMonster() : m, null, null, 0, at);
    if (!e) continue;
    e.wave = W.id;
    e.stepTime *= PACE.wave.step;
    e.hp = e.maxHp = e.maxHp * PACE.wave.hp; // a drive falls in heaps
    W.total++;
  }
}

/** 수확: what the drive left flies to the hero; a clean drive leaves a chest too. */
function harvest() {
  const G = A.G(), H = G.hunt, W = H.wv, t = G.t;
  const ok = W.total > 0 && W.killed >= W.total * PACE.wave.done;
  if (G.pace) (G.pace.waves = G.pace.waves || []).push([Math.round(W.at), Math.round(t - W.at), W.want, W.total, W.killed, Math.round(W.rate || 0)]);
  W.state = 'rest';
  W.until = t + PACE.wave.rest;
  G.vacuumAt = t;
  G.vacuumEnd = t + 1.6;
  G.vacuumSaid = false;
  if (ok) {
    W.ok++;
    const clean = (H.taken || 0) - W.taken < 0.15;
    if (clean) W.clean++;
    G.drops.push({ x: G.player.x, y: G.player.y + 14, kind: 'chest' });
    for (let i = 0; i < 4; i++) G.drops.push({ x: G.player.x + (i - 1.5) * 18, y: G.player.y - 12, kind: 'coin' });
    gain(0.04);
    A.banner(clean ? '몰이 완수 · 무피해 수확!' : '몰이 완수 · 수확!');
    G.shake = Math.max(G.shake || 0, 0.2);
    note('event:harvest');
  } else {
    A.lootFeed(`몰이 파도 ${W.killed}/${W.total}`);
    note('event:harvest0');
  }
}

// ------------------------------------------------------------------ 필드 보스 (P2-4)

function fieldTick() {
  const G = A.G(), H = G.hunt, F = PACE.field, t = G.t;
  // (decided here: G.wasCleared is known only after start())
  if (H.fieldBoss === undefined) H.fieldBoss = !!(G.wasCleared && (Math.random() < F.chance || (window.__dbgHunt && window.__dbgHunt.field)));
  const f = H.fieldBoss;
  if (f === true) {
    if (H.mode !== 'conquer' || H.prog < F.at || H.warnAt !== null || H.wv.state !== 'idle') return;
    const e = A.addEnemy(G.boss.m, 'mini', { name: `떠도는 ${G.boss.name}`, scale: (G.boss.scale || 1.6) * 0.8 });
    if (!e) return;
    e.field = true;
    e.hp = e.maxHp = bossLifeOld() * F.life;
    e.patT = t + 3;
    H.fieldBoss = e;
    A.banner(`필드 보스 · 떠도는 ${G.boss.name}!`);
    A.say(`떠도는 ${A.josa(G.boss.name, '이', '가')} 나타났습니다! 붉은 칸을 피하며 잡으면 레이드주화를 얻습니다.`, 'warn');
    const au = A.audio();
    if (au) au.play('boss');
    note('mini:field');
  } else if (f && f.hp > 0 && G.enemies.includes(f) && t >= f.patT && !(f.stun > 0)) {
    f.patT = t + F.every;
    const pool = BOSS_PATTERNS[G.stage.id] || ['charge', 'ring'];
    const k = pool[Math.floor(Math.random() * pool.length)];
    A.raidPattern(f, k);
    note('pat:field');
  }
}

/** The roaming boss fell: 레이드주화 and a special's chance. */
function fieldDeath(e) {
  const G = A.G(), pr = A.progress(), n = 5 + Math.round(G.level / 2);
  pr.coins = (pr.coins || 0) + n;
  A.say(`필드 보스를 쓰러뜨렸습니다! 레이드주화 ${n}개를 받았습니다.`, 'sys');
  A.lootFeed(`레이드주화 ${n}개`);
  if (Math.random() < 0.5) A.rollSpecial(e);
  A.rollMats(e);
  gain(0.08);
  G.vacuumAt = G.t + 0.3;
  G.vacuumEnd = G.t + 1.8;
  G.vacuumSaid = false;
}

// ------------------------------------------------------------------ 보물 도깨비 추격

/** A 보물 도깨비: runs from the hero, scattering coins as it is struck, gone in 15 s unless struck. */
function goblin() {
  const G = A.G(), p = G.player;
  let spot = null;
  for (let i = 0; i < 30 && !spot; i++) {
    const a = Math.random() * Math.PI * 2, tx = p.tx + Math.round(Math.cos(a) * 4), ty = p.ty + Math.round(Math.sin(a) * 3);
    if (A.free(tx, ty) && (!G.arena || reach(tx, ty))) spot = [tx, ty];
  }
  const e = A.addEnemy(A.pickMonster(true), 'treasure', { name: '보물 도깨비', scale: 1.1 }, 0, spot);
  if (!e) return;
  e.flee = G.t + 15;
  e.fleeMax = G.t + 24;
  e.hp = e.maxHp = e.maxHp * 0.6;
  e.stepTime = Math.min(e.stepTime, 0.3);
  e.coinAt = 0.85;
  A.say('보물 도깨비가 나타났습니다! 때릴수록 엽전을 흘립니다. 달아나기 전에 잡으세요.', 'warn');
  A.banner('보물 도깨비 출현! 쫓아라');
  note('event:treasure');
}

/** The goblin struck: coins on the ground behind it, and a little longer before it gets away. */
function goblinHurt(e) {
  const G = A.G();
  while (e.coinAt > 0.1 && e.hp < e.maxHp * e.coinAt) {
    e.coinAt -= 0.15;
    G.drops.push({ x: e.x + (Math.random() - 0.5) * 20, y: e.y + 8, kind: 'coin' });
    e.flee = Math.min(e.fleeMax, e.flee + 1.5);
  }
}

// ------------------------------------------------------------------ 판 중 선택 (개편 A, P1-3)

let bar = null;

function choiceHide() {
  if (bar) bar.hidden = true;
}

/** A pick on the strip over the chat: two buttons, the hunt going on. */
function ask(c) {
  const G = A.G(), H = G.hunt, S = A.settings();
  const opts = c.opts(G), pref = (S.huntPicks || {})[c.id];
  const def = opts.includes(pref) ? pref : opts[0];
  H.asked++;
  H.askedAt = G.t;
  H.choice = { id: c.id, opts, def, until: G.t + PACE.choice.wait };
  note('cross:ask');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'hunt-pick';
    bar.style.cssText = 'position:fixed;z-index:9;bottom:66px;left:calc((100% - var(--side, 0px)) / 2);transform:translateX(-50%);'
      + 'display:flex;flex-direction:column;align-items:center;gap:3px;padding:4px 6px 5px;background:rgba(0,0,0,.72);'
      + 'border:2px solid #c8a050;border-radius:3px;font:11px G9,monospace;color:#f0e0c0;pointer-events:auto;user-select:none;';
    document.body.append(bar);
  }
  bar.innerHTML = '';
  const head = document.createElement('div');
  head.textContent = c.title;
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:6px;';
  for (const k of opts) {
    const b = document.createElement('button');
    b.dataset.pick = k;
    b.style.cssText = 'min-height:34px;min-width:120px;padding:2px 8px;font:11px G9,monospace;color:#fff;background:#1a1208;'
      + `border:1px solid ${k === def ? '#ffd84a' : '#806040'};border-radius:2px;line-height:13px;`;
    b.innerHTML = `<b style="color:#ffd84a">${PATHS[k].name}</b><br><small>${PATHS[k].desc}</small>`;
    b.addEventListener('pointerdown', ev => { ev.preventDefault(); ev.stopPropagation(); choicePick(k, true); });
    row.append(b);
  }
  const time = document.createElement('div');
  time.style.cssText = 'height:3px;width:100%;background:#ffd84a;transform-origin:left;';
  bar.append(head, row, time);
  bar._time = time;
  bar.hidden = false;
}

function choiceTick() {
  const G = A.G(), H = G.hunt, c = H.choice;
  if (!c) return;
  if (G.t >= c.until) { choicePick(c.def); return; }
  if (bar && bar._time) bar._time.style.transform = `scaleX(${Math.max(0, (c.until - G.t) / PACE.choice.wait).toFixed(2)})`;
}

function choicePick(k, byHand = false) {
  const G = A.G(), H = G && G.hunt, c = H && H.choice;
  if (!c || !c.opts.includes(k)) return;
  H.choice = null;
  choiceHide();
  if (byHand) {
    const S = A.settings();
    S.huntPicks = { ...(S.huntPicks || {}), [c.id]: k };
    A.saveSettings();
  }
  takePath(k);
  A.lootFeed(`${byHand ? '선택' : '기본 선택'} · ${PATHS[k].name}`);
}

/** A pick of three before a big moment (the 갈림길, the boss): it stops even with few cards. */
function tune() {
  const G = A.G();
  G.tuneCard = true;
  G.pendingLevels++;
  if (!G.choosing) A.nextChoice();
}

// ------------------------------------------------------------------ the boss

/** The hero's blow on one target a second, from what fell on champions and leaders. */
function dpsEstimate() {
  const H = A.G().hunt;
  return H.bigTime >= 4 ? H.bigDmg / H.bigTime : 0;
}

function callBoss() {
  const G = A.G(), H = G.hunt, t = G.t;
  const bo = A.addEnemy(G.boss.m, 'boss', G.boss);
  if (!bo) {
    if (t > H.warnAt + 30) { G.bossDue = false; G.bossT = t; A.clearStage(); }
    return;
  }
  G.bossDue = false;
  G.bossT = t;
  H.act = 3;
  // Its life: as before (grows with the hero's level and 승급), then matched to how hard this hero
  // strikes one foe, so the fight is about forty to seventy seconds for the weak and the strong.
  const grow = 1 + 0.04 * Math.max(0, G.player.lvl - 15) + 0.1 * A.promoOf(G.cls.id);
  const old = bo.maxHp * grow, dps = dpsEstimate(), B = PACE.boss;
  // (the fight's own crowd takes some of the blows: a little less than the 40 s the measure asks)
  const want = dps ? dps * B.life : old;
  bo.hp = bo.maxHp = Math.max(old * B.lo, Math.min(old * B.hi, want));
  bo.guardT = t + 2;
  bo.capPerSec = B.cap;
  bo.gro = 0;
  bo.groNeed = 1;
  G.raidT = 3;
  G.waveT = t + PACE.boss.every;
  H.bossE = bo;
  // 광폭 도전: it comes in its rage (its blows ×1.3, its patterns quicker); the spoils ×1.3.
  if (H.paths.rage) {
    G.enraged = true;
    bo.dmg *= 1.3;
    A.banner(`${G.boss.name} 광폭화! 도전을 받아들였다`);
  }
  H.boss = { old: Math.round(old), dps: Math.round(dps), hp: Math.round(bo.maxHp), k: H.k, str: Math.round(H.str * 100) / 100 };
  G.pace.boss = H.boss;
  note('boss');
  const au = A.audio();
  if (au) { au.play('boss'); au.bgm('boss'); }
  G.shake = 0.6;
  A.say(`${A.josa(G.boss.name, '이', '가')} 나타났습니다! 붉은 칸을 피하세요.`, 'warn');
  A.emote(Math.random() < 0.5 ? 'ready' : 'popcorn');
}

function pickPattern() {
  const G = A.G(), pool = BOSS_PATTERNS[G.stage.id] || ['charge', 'ring'];
  const list = pool.length > 1 ? pool.filter(k => k !== G.lastPattern) : pool;
  // From the second phase a common blow joins in now and then.
  if (G.phase >= 1 && Math.random() < 0.3) list.push(['cross', 'ring', 'meteor'][G.phase - 1] || 'rain');
  return G.lastPattern = list[Math.floor(Math.random() * list.length)];
}

function bossFight(dt) {
  const G = A.G(), H = G.hunt, t = G.t, B = PACE.boss;
  const since = t - G.bossT, b = G.enemies.find(e => e.kind === 'boss');
  if (!b) {
    if (!G.cleared) A.clearStage();
    return;
  }
  if (since > B.killAt || !(b.hp > -Infinity)) {
    b.hp = 0;
    A.killEnemy(b);
    return;
  }
  // From 1:15 it wears down by itself (0.6% a second), never the most of its life.
  if (since > B.decayAt) {
    b.hp -= b.maxHp * B.decay * dt;
    if (b.hp <= 0) { A.killEnemy(b); return; }
  }
  if (!G.enraged && since > B.enrageAt) {
    G.enraged = true;
    b.dmg *= 1.3;
    A.banner(`${G.boss.name} 광폭화!`);
    A.emote('rage');
    note('phase:enrage');
  }
  const phase = b.hp < b.maxHp * 0.4 ? 2 : b.hp < b.maxHp * 0.7 ? 1 : 0;
  if (phase > G.phase) {
    G.phase = phase;
    b.guardT = t + 2;
    A.banner(`${A.josa(G.boss.name, '이', '가')} 사나워진다!`);
    A.raidWave(b, 6 + 2 * phase);
    G.raidT = Math.max(G.raidT, 2.5);
    note('phase' + phase);
  }
  const groggy = b.groggyT > t;
  if (groggy) return; // 그로기: no blows, no calls
  if (t >= G.waveT) {
    // A few of the crowd called about the boss every 8 s, more as it grows fierce (not past the floor
    // and half a hundred: the field stays full, not swollen).
    G.waveT = t + B.every;
    if (G.enemies.length < (H.floor || 60) + 50) {
      A.raidWave(b, B.call[0] + Math.floor(Math.random() * (B.call[1] - B.call[0] + 1)) + 2 * G.phase);
      note('pat:summon');
    }
  }
  G.raidT -= dt;
  if (G.raidT <= 0 && !(t < (G.seqTill || 0))) {
    G.raidT = [4.5, 3.8, 3.2][G.phase] * (G.enraged ? 0.7 : 1);
    const k = pickPattern();
    A.raidPattern(b, k);
    note('pat:' + k);
  }
}

/** A blow landed (after the boss's cap): the boss's 그로기 fills; the single-target measure. */
function hurt(e, dmg) {
  const G = A.G(), H = G.hunt;
  if (!H || !(dmg > 0)) return;
  if (e.kind === 'treasure' && e.coinAt) goblinHurt(e);
  if (e.kind === 'boss' && e.gro !== undefined && !(e.groggyT > G.t)) {
    const heavy = G.castCd >= 2.5 || G.heavyHit;
    e.gro += dmg / (e.maxHp * PACE.groggy.fill) * (heavy ? 2 : 1) / e.groNeed;
    if (e.gro >= 1) groggy(e);
  } else if (e.kind === 'champ' || e.kind === 'mini') H.bigDmg += dmg;
}

/** 그로기: three seconds stunned, taking half again as much; it calls no one meanwhile. */
function groggy(e, sec = PACE.groggy.stun) {
  const G = A.G();
  e.gro = 0;
  e.groNeed *= 1.25;
  e.groggyT = G.t + sec;
  e.stun = Math.max(e.stun || 0, sec);
  G.slowmo = Math.max(G.slowmo || 0, 0.25);
  G.shake = Math.max(G.shake, 0.35);
  A.banner(`${G.boss.name} 그로기!`);
  A.floatText(e.x, e.y - e.m.h * e.scale - 20, '그로기!', '#ffd84a', true);
  note('groggy');
}

/** The damage a struck foe takes on top (그로기). */
function takeK(e) {
  const t = A.G().t;
  return (e.groggyT > t ? PACE.groggy.take : 1) * (e.ward > t ? 0.5 : 1) * mightK();
}

/** Each frame: the time near champions and leaders counted, for the boss's measure. */
function tick(dt) {
  sample();
  const G = A.G(), H = G.hunt;
  if (H) { momentumTick(); release(); unstick(); }
  if (bar && !bar.hidden && (!H || !H.choice || G.over || G.dead)) choiceHide();
  if (!H || H.act >= 3 || !dt) return;
  const p = G.player;
  let n = 0;
  for (const e of G.enemies) if ((e.kind === 'champ' || e.kind === 'mini') && Math.abs(e.tx - p.tx) + Math.abs(e.ty - p.ty) <= 5) n++;
  if (n) H.bigTime += dt * Math.pow(n, 0.8); // (a crowd-striker hits the whole pack at once)
}

/** A monster fell: the gauge. */
function kill(e) {
  const G = A.G(), H = G.hunt;
  if (!H) return;
  momentumKill(e);
  if (e.affix) affixDeath(e);
  if (e.wave && H.wv.id === e.wave) H.wv.killed++;
  if (e.field) fieldDeath(e);
  // During the boss: each of the crowd felled fills its 그로기 a little (개편 A, P0-1).
  const b = H.bossE;
  if (H.act >= 3 && b && b !== e && b.hp > 0 && b.gro !== undefined && !(b.groggyT > G.t) && e.kind !== 'boss') {
    b.gro += PACE.boss.gro * (e.kind ? 3 : 1) / b.groNeed;
    if (b.gro >= 1) groggy(b);
  }
  if (!e.kind || e.kind === 'minion') {
    const sec = Math.floor(G.t);
    if (H.killSec !== sec) { H.killSec = sec; H.killGot = 0; }
    const k = Math.min(PACE.killK, PACE.killCap - H.killGot);
    if (k > 0) { H.killGot += k; gain(k); }
  } else if (e.kind === 'champ') gain(PACE.champ);
  else if (e.kind === 'mini') gain(PACE.mini);
  else if (e.kind === 'treasure') gain(PACE.treasure);
  // 정예 토벌: the champions' spoils half again.
  if (H.paths.elite && e.kind === 'champ' && Math.random() < 0.5) A.rollMats(e);
}

/** The conquest: the 갈림길's own spoils. */
function cleared() {
  const G = A.G(), H = G.hunt;
  if (!H) return;
  G.slowmo = Math.max(G.slowmo || 0, 0.8);
  G.marks = [];
  choiceHide();
  if (H.paths.treasure) G.gold = Math.round(G.gold * 1.6);
  if (H.paths.rage) G.gold = Math.round(G.gold * 1.3);
  if (H.paths.elite) { const b = { x: G.player.x, y: G.player.y + 20, kind: 'boss' }; A.dropGear(b, 30); }
}

// ------------------------------------------------------------------ cards

/** A pick that stops the hunt (without 자동 선택): a new spell, a 계승, a 숙련, a 정비 pick. */
function stops(picks) {
  const G = A.G();
  if (!G.hunt) return true;
  // (a new spell only while the build is still being chosen: the first three; and no more than
  // six stops a run, one kept for the 정비 — 개편 A, P1-4)
  if (G.pace && G.pace.manual >= PACE.stopMax - (G.hunt.paths.tune || G.hunt.warnAt !== null ? 0 : 1)) return false;
  return picks.some(o => o.type === 'skill' && (o.from || o.mastered || (o.lv === 1 && G.skills.length < 3)));
}

/** Past Lv 20 a card weighs two steps: the extra one, if the spell or skill may take it. */
function cardBonus(o) {
  const G = A.G();
  if (!G.hunt || G.player.lvl <= 20) return 0;
  if (o.type === 'skill' && o.lv > 1 && !o.from) {
    const s = G.skills.find(x => x.id === o.id);
    if (s && s.lv < A.levelCap(o.id)) { s.lv++; G.hunt.bonusLv++; return 1; }
  } else if (o.type === 'passive' && G.passives[o.id] < A.MAX_PASSIVE_LEVEL) {
    G.passives[o.id]++;
    if (o.id === 'life') { G.player.maxHp += 20; G.player.hp += 20; }
    G.hunt.bonusLv++;
    return 1;
  }
  return 0;
}

// ------------------------------------------------------------------ 수련장 → 첫 카드 (개편 A, P1-10)

/** A spell tried in the 수련장: the class's last three tried are its preset (kept with the progress). */
function trainTried(cls, id) {
  const pr = A.progress();
  pr.trainPreset = pr.trainPreset || {};
  pr.trainPreset[cls] = [id, ...(pr.trainPreset[cls] || []).filter(x => x !== id)].slice(0, 3);
  if (A.saveProgress) A.saveProgress();
}

/** The first card of a 정복/소탕 on a ground conquered before: the preset's spells this first card may
 *  hold (ok: a first-tier attack or a 숙련 one), the rest of the deal after; null when none fit. */
function firstPicks(cls, ok, rest) {
  const G = A.G(), H = G && G.hunt;
  if (!H || H.mode === 'rush' || !G.wasCleared) return null;
  const pre = ((A.progress().trainPreset || {})[cls] || []).filter(ok);
  if (!pre.length) return null;
  note('cross:preset');
  const cards = pre.map(id => ({ type: 'skill', id, lv: 1, preset: true }));
  for (const o of rest) if (cards.length < 3 && !cards.some(c => c.id === o.id)) cards.push(o);
  return cards;
}

// ------------------------------------------------------------------ the picks' effects

function takePath(k) {
  const G = A.G(), H = G.hunt;
  H.path = k;
  H.paths[k] = true;
  note('cross:' + k);
  A.say(`선택: ${PATHS[k].name} — ${PATHS[k].desc}`, 'sys');
  if (k !== 'tune') A.banner(PATHS[k].name);
  if (k === 'elite') champs(1);
  if (k === 'treasure') H.treasureAt = G.t + 1;
  if (k === 'jar') {
    const p = G.player;
    p.hp = p.maxHp;
    for (let i = 0; i < 3; i++) G.drops.push({ x: p.x + (i - 1) * 40, y: p.y + 30, kind: 'heal' });
  }
  if (k === 'tune') tune();
  if (k === 'swift') H.k *= 0.85;
  if (k === 'pact') {
    const off = Object.keys(A.PACTS).filter(id => !A.pactOn(id));
    const id = off[Math.floor(Math.random() * off.length)];
    if (id) { G.pacts = { ...(G.pacts || {}), [id]: true }; A.say(`규약 ${A.PACTS[id].name}: ${A.PACTS[id].desc}`, 'warn'); }
  }
  if (k === 'swift') for (const e of G.enemies) e.stepTime *= 0.87;
}

/** A monster's step on the 속공 path. */
function stepK() {
  const H = A.G().hunt;
  return H && H.paths.swift ? 0.87 : 1;
}

// ------------------------------------------------------------------ the screen

function clockText() {
  const G = A.G(), H = G.hunt;
  if (!H) return null;
  if (G.endless) return G.endEnd ? `소탕 · 남은 시간 ${Math.max(0, Math.ceil(G.endEnd - G.t))}초` : '계속 사냥';
  if (G.bossT !== undefined) return G.cleared ? '' : `${G.boss.name}${G.enraged ? ' · 광폭화' : ''}`;
  return `토벌도 ${Math.floor(H.prog * 100)}% · ${['', '돌입', '목표', '보스'][H.act]}`;
}

/** Where the gauge stands: under the map's name, or under the leader's bar while it shows. */
function hudTop(cv) {
  const s = cv.width / 860, bb = document.querySelector('#bossbar');
  return (bb && !bb.hidden ? 90 : 46) * s;
}

/** The gauge across the top, and the boss's warning on the screen's edge. */
function hud(ctx, cv) {
  const G = A.G(), H = G.hunt;
  if (!H) return;
  const s = cv.width / 860;
  if (G.endless) return;
  if (G.bossT === undefined) {
    const w = 200 * s, h = 6 * s, x = (cv.width - w) / 2, y = hudTop(cv);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x - s, y - s, w + 2 * s, h + 2 * s);
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, '#a03018');
    g.addColorStop(1, H.prog >= 1 ? '#ffd84a' : '#e86a2a');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w * H.prog, h);
    ctx.fillStyle = 'rgba(255,240,200,0.7)';
    for (const k of PACE.minisAt.concat(PACE.champsAt)) ctx.fillRect(x + w * k, y, Math.max(1, s), h);
    ctx.font = `${Math.round(10 * s)}px G9`;
    ctx.textAlign = 'center';
    A.outline(`토벌도 ${Math.floor(H.prog * 100)}%`, cv.width / 2, y + h + 11 * s, '#f0e0c0');
  } else {
    // The boss's 그로기 bar, thin, under its life bar.
    const b = G.enemies.find(e => e.kind === 'boss');
    if (b && b.gro !== undefined) {
      const w = 160 * s, h = 4 * s, x = (cv.width - w) / 2, y = 90 * s;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(x - s, y - s, w + 2 * s, h + 2 * s);
      ctx.fillStyle = b.groggyT > G.t ? '#ffffff' : '#ffd84a';
      ctx.fillRect(x, y, w * (b.groggyT > G.t ? (b.groggyT - G.t) / PACE.groggy.stun : Math.min(1, b.gro)), h);
      ctx.font = `${Math.round(9 * s)}px G9`;
      ctx.textAlign = 'center';
      A.outline(b.groggyT > G.t ? '그로기!' : '그로기', cv.width / 2, y + h + 10 * s, '#ffe9a0');
    }
  }
  if (H.warnAt !== null && G.t < H.warnAt + PACE.warn + 0.3) {
    const k = 0.3 + 0.25 * Math.sin(G.t * 16);
    const gr = ctx.createRadialGradient(cv.width / 2, cv.height / 2, cv.height * 0.3, cv.width / 2, cv.height / 2, Math.hypot(cv.width, cv.height) / 2);
    gr.addColorStop(0, 'rgba(160,0,0,0)');
    gr.addColorStop(1, `rgba(220,20,10,${k})`);
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, cv.width, cv.height);
  }
}

// ------------------------------------------------------------------ 손맛 (P2)
//
// 기세: the kill streak (G.combo) in four steps (10/40/100/200); a broken streak loses one step
// every three seconds, not all. 1 걸음 +8%, 2 기술 재사용 -8%, 3 처치마다 마력 +0.4, 4 폭주 6초
// (피해 +25%, 경험치·토벌도 ×1.5). 처형: a champion or leader under 15% falls at once to the 질주,
// a 필살기 or a chain's blow (and to a heavy blow), in slow motion. 질주: Shift or the button, three
// tiles, a quarter second untouchable, striking what it passes; sooner after a kill; it cancels a
// cast's stance and readies the plain swing. 일망타진: a chain started on twenty or more strikes
// harder. 속성 반응 between a status and a spell's element. 스타일 등급 at the end.

const MOMENTUM_AT = [10, 40, 100, 200];
const MOMENTUM_NAME = ['', '기세 1단', '기세 2단', '기세 3단', '폭주'];
const EXEC_AT = 0.15;
const DASH = { tiles: 3, inv: 0.25, cd: 2.2, quick: 0.9, cancel: 0.3, dmg: 0.6 }; // (B: 질주 손맛 — cd 3 → 2.2, after a kill 1.2 → 0.9)

function mo() {
  const G = A.G();
  return G.momentum || (G.momentum = { tier: 0, best: 0, frenzy: 0, dropAt: 0, execs: 0, sweeps: 0, reactions: 0, multi: [] });
}

function speedK() {
  const G = A.G();
  if (!G.hunt) return 1;
  return mo().tier >= 1 ? 1.08 : 1;
}

function cdK() {
  const G = A.G();
  if (!G.hunt) return 1;
  return mo().tier >= 2 ? 1 / 0.92 : 1;
}

/** On each kill: the streak's step, 폭주, the multi-kill call. */
function momentumKill() {
  const G = A.G(), m = mo(), c = G.combo;
  let want = 0;
  for (let i = 0; i < MOMENTUM_AT.length; i++) if (c.n >= MOMENTUM_AT[i]) want = i + 1;
  // 폭주 again only after another 250 of the same streak.
  if (want === 4 && c.n < (m.nextFrenzy || 0)) want = 3;
  if (want > m.tier) {
    m.tier = want;
    m.best = Math.max(m.best, want);
    m.dropAt = G.t;
    if (want === 4) {
      m.frenzy = G.t + 6;
      m.nextFrenzy = c.n + 250;
      A.banner('폭주! 피해 +25% · 경험치·토벌도 ×1.5');
      G.flash = G.t;
      note('elite:frenzy');
    } else A.floatText(G.player.x, G.player.y - 70, MOMENTUM_NAME[want], '#ffd84a', true);
  }
  if (m.tier >= 3 && G.player.mp < G.player.maxMp) G.player.mp = Math.min(G.player.maxMp, G.player.mp + 0.4);
  // 오연살 · 십연살 · 이십연살: kills within 0.4 s.
  m.multi.push(G.t);
  while (m.multi.length && G.t - m.multi[0] > 0.4) m.multi.shift();
  const n = m.multi.length;
  const call = n === 20 ? '이십연살!' : n === 10 ? '십연살!' : n === 5 ? '오연살!' : null;
  if (call) A.floatText(G.player.x, G.player.y - 86, call, n >= 20 ? '#ff7a3a' : '#ffe070', true);
}

function momentumTick() {
  const G = A.G(), m = mo();
  if (m.frenzy && G.t >= m.frenzy) { m.frenzy = 0; m.tier = Math.min(m.tier, 3); m.dropAt = G.t; }
  if (m.tier > 0 && !(m.frenzy > G.t) && G.t - G.combo.t > 3 && G.t - m.dropAt > 3) { m.tier--; m.dropAt = G.t; }
}

/** A champion or leader low enough to be finished. */
function executable(e) {
  return (e.kind === 'champ' || e.kind === 'mini') && e.hp > 0 && e.hp < e.maxHp * EXEC_AT;
}

/** The blow now landing may finish (the 질주, a 필살기's moment, a chain's first, a heavy blow). */
function finisher() {
  const G = A.G();
  return G.dashHit || (G.ultAt !== undefined && G.t - G.ultAt < 1) || (G.chainRun && G.chainRun.done <= 1) || G.castCd >= 2.5;
}

/** Before a blow lands: 처형 (true: it was finished here). */
function tryExecute(e) {
  const G = A.G();
  if (!G.hunt || G.allyHitting || !executable(e) || !finisher()) return false;
  const m = mo();
  m.execs++;
  e.executed = true;
  G.slowmo = Math.max(G.slowmo || 0, 0.35);
  G.shake = Math.max(G.shake, 0.3);
  A.floatText(e.x, e.y - e.m.h * e.scale - 18, '처형!', '#ff5a3a', true);
  if (A.M().fx.h_kill) A.addFx('h_kill', e.x, e.y - 20, { scale: 1.3 });
  if (e.curse > 0) for (const o of A.around(e.tx, e.ty, 2)) if (o !== e) { o.curse = Math.max(o.curse || 0, 4); A.applyStatus(o, 'curse', 4); }
  note('elite:exec');
  e.hp = 0;
  A.killEnemy(e);
  // A coin or two more for the clean finish.
  for (let i = 0; i < 3; i++) G.drops.push({ x: e.x + (i - 1) * 16, y: e.y + 10, kind: 'coin' });
  return true;
}

// 속성 반응: the element of the spell landing (its own, else read from its name).
const ELEM_RX = [['thunder', /뢰|뇌|천둥|번개|섬광|풍/], ['fire', /화|염|불|열|폭/], ['water', /빙|수|파도|물|해|한/], ['earth', /지|땅|진|암|석|산|토/]];
function elemOf(def) {
  if (!def) return null;
  if (def.elem) return def.elem;
  for (const [k, rx] of ELEM_RX) if (rx.test(def.name || '')) return k;
  return null;
}
const REACT = { shatter: ['파쇄', '#c8a050'], spread: ['확산', '#b08aff'], blast: ['폭발', '#ff7a3a'], purge: ['정화 폭발', '#6ab0ff'] };

/** A reaction on the struck: the blow's extra weight (×). */
function react(e) {
  const G = A.G();
  if (!G.hunt || G.allyHitting || G.procHitting || !G.castElem) return 1;
  if (G.t - (e.reactAt || -9) < 0.6) return 1;
  const live = k => e.st && e.st[k] && e.st[k].until > G.t;
  const el = G.castElem;
  let r = null, k = 1;
  if (el === 'earth' && (e.slow > 0 || live('freeze'))) { r = 'shatter'; k = 1.8; if (e.gro !== undefined && !(e.groggyT > G.t)) e.gro += 0.08; }
  else if (el === 'thunder' && live('burn')) {
    r = 'spread';
    let n = 0;
    for (const o of A.around(e.tx, e.ty, 2)) if (o !== e && n++ < 6) A.applyStatus(o, 'burn', 4, e.st.burn.k);
  } else if (el === 'fire' && (e.stun > 0 || live('para'))) {
    r = 'blast';
    const near = A.around(e.tx, e.ty, 1).filter(o => o !== e).slice(0, 8), base = G.castDmg || 0;
    if (base > 0) A.later(0.06, () => { for (const o of near) if (o.hp > 0) A.hurtEnemy(o, base * 0.5); });
    if (A.M().fx.h_hit_fire) A.addFx('h_hit_fire', e.x, e.y - 16, { scale: 0.8 });
  } else if (el === 'water' && (live('poison') || live('venom'))) {
    r = 'purge';
    const s = live('venom') ? e.st.venom : e.st.poison;
    k = 1 + Math.min(2, (s.until - G.t) * 0.15 * (s.k || 1));
    s.until = G.t;
  }
  if (!r) return 1;
  e.reactAt = G.t;
  mo().reactions++;
  if (A.fxBudget('react', 3)) A.floatText(e.x, e.y - e.m.h * e.scale - 30, REACT[r][0], REACT[r][1], true);
  return k;
}

/** 질주 (Shift / the button). True when it went. */
function dash() {
  const G = A.G();
  if (!G || !G.hunt || G.dead || G.choosing || G.paused || G.over) return false;
  if (G.t < (G.dashReady || 0)) return false;
  const p = G.player, melee = A.MELEE.has(G.cls.id);
  let dx = p.fdx || 0, dy = p.fdy || 0;
  if (!dx && !dy) dy = 1;
  if (!melee) { dx = -dx; dy = -dy; } // 후퇴 보법: the caster steps back
  const bx = p.tx, by = p.ty;
  let land = null;
  const passed = [];
  for (let k = 1; k <= DASH.tiles; k++) {
    const tx = bx + dx * k, ty = by + dy * k;
    if (A.walled(tx, ty)) break;
    const b = A.occ.get(tx + ',' + ty);
    if (b && b.hp > 0 && !b.ally) passed.push(...(A.bodiesAt(tx, ty) || [b]));
    if (A.free(tx, ty)) land = [tx, ty];
  }
  if (!land) return false;
  const quick = G.t - G.combo.t < 0.6;
  G.dashReady = G.t + (quick ? DASH.quick : DASH.cd);
  G.dashBtnAt = G.t;
  G.dashUsed = true;
  p.stepping = false;
  p.moving = false;
  p.inv = Math.max(p.inv, DASH.inv);
  p.poseT = 0; // 캔슬: the cast's stance is cut
  const x0 = p.x, y0 = p.y;
  p.x = land[0] * A.TILE + A.TILE / 2;
  p.y = land[1] * A.TILE + A.TILE - 6;
  A.heroTile();
  A.dashFrom(x0, y0);
  p.atkT = 0;
  // What it passes takes the strongest spell's blow, less.
  const top = Math.max(0, ...G.skills.map(s => (A.stats(s).dmg || 0)));
  const hit = top * DASH.dmg;
  G.dashHit = true;
  for (const o of passed) if (o.hp > 0 && hit > 0) A.hurtEnemy(o, hit, [dx, dy]);
  G.dashHit = false;
  // The caster's next spell goes at once.
  if (!melee) {
    const s = G.skills.filter(x => x.timer > 0).sort((a, b) => a.timer - b.timer)[0];
    if (s) s.timer = 0;
  }
  G.dashes = (G.dashes || 0) + 1;
  return true;
}

/** Just after a 질주: the plain swing does not wait. */
function cancel() {
  const G = A.G();
  return !!(G.hunt && G.t - (G.dashBtnAt || -9) < DASH.cancel);
}

/** 일망타진: a chain started with twenty or more within three tiles. */
function chainPower(base) {
  const G = A.G();
  if (!G.hunt || !chainReady()) return base;
  const m = mo();
  m.sweeps++;
  G.sweepAt = G.t;
  G.slowmo = Math.max(G.slowmo || 0, 0.3);
  A.banner('일망타진!');
  note('elite:sweep');
  return 1.6;
}

/** Ready for a 일망타진 (the chain's glow). */
function chainReady() {
  const G = A.G();
  if (!G.hunt) return false;
  const p = G.player;
  let n = 0;
  for (const e of G.enemies) if (Math.abs(e.tx - p.tx) <= 3 && Math.abs(e.ty - p.ty) <= 3 && ++n >= 20) return true;
  return false;
}

/** The hero's blows: 폭주 +25%. */
function mightK() {
  const G = A.G();
  return G.hunt && G.momentum && G.momentum.frenzy > G.t && !G.allyHitting ? 1.25 : 1;
}

/** Experience and 토벌도 on top: 폭주, and the kills of a 일망타진. */
function surgeK() {
  const G = A.G();
  return (G.momentum && G.momentum.frenzy > G.t ? 1.5 : 1) * (G.t - (G.sweepAt || -9) < 2 ? 1.5 : 1)
    * (G.hunt && G.hunt.wv && G.hunt.wv.state === 'run' ? 1.3 : 1);
}

function hurtTaken(dmg) {
  const G = A.G();
  if (G.hunt && G.player.maxHp) G.hunt.taken = (G.hunt.taken || 0) + dmg / G.player.maxHp;
}

/** 스타일 등급: S 10~20%, A 35%, B 35%, C 15% of runs (개편 A, P1-5). */
const GRADE = { S: 63, A: 54, B: 44 }; // (set from 32 bot runs: S 12% · A 31% · B 41% · C 16%)

/** 스타일 등급: time, the best 기세, 처형, 일망타진, the drives, health lost, the objective, the risks. */
function grade() {
  const G = A.G(), H = G.hunt, m = mo();
  if (!H) return null;
  if (H.grade) return H.grade;
  const run = G.clearT || G.t, W = H.wv || { ok: 0, clean: 0 };
  // 개편 A (P1-5): the time weighs half what it did; the hunt's own moments the rest — the
  // drives taken whole, 처형, 일망타진, the 몰이기's crowd (B's G.mainStats, when there).
  const ms = G.mainStats, mainAvg = ms && ms.casts ? ms.hits / ms.casts : 0;
  const part = {
    quick: Math.max(0, Math.min(15, (260 - run) / 8)),               // quick: up to 15
    best: [0, 4, 8, 12, 16][m.best],                                 // 기세: up to 16
    execs: Math.min(12, m.execs * 2),                                // 처형
    sweeps: Math.min(12, m.sweeps * 3),                              // 일망타진
    waves: Math.min(16, W.ok * 4 + W.clean * 2),                     // 몰이 파도 완수, 무피해
    taken: Math.max(0, 12 - (H.taken || 0) * 3),                     // 받은 피해
    goal: H.goalBonus ? 10 : H.goalDone ? 5 : 0,                     // 목표
    risk: (H.paths.rage ? 5 : 0) + (H.paths.swift ? 3 : 0) + (H.paths.pact ? 3 : 0), // 위험 선택
    main: Math.min(8, mainAvg / 2.5),                                // 몰이기 평균 맞은 수
  };
  const sc = Object.values(part).reduce((a, b) => a + b, 0);
  const g = sc >= GRADE.S ? 'S' : sc >= GRADE.A ? 'A' : sc >= GRADE.B ? 'B' : 'C';
  H.grade = { g, sc: Math.round(sc), k: { S: 1.3, A: 1.2, B: 1.1, C: 1 }[g], best: m.best, execs: m.execs, sweeps: m.sweeps, reactions: m.reactions, waves: W.ok };
  // The results screen (C) lists these.
  const LABEL = { quick: '빠르기', best: '기세', execs: '처형', sweeps: '일망타진', waves: '몰이 파도', taken: '무피해', goal: '목표', risk: '위험 선택', main: '몰이기' };
  H.grade.parts = Object.entries(part).filter(([k, v]) => v > 0 || k === 'quick' || k === 'waves').map(([k, v]) => [LABEL[k], Math.round(v)]);
  if (G.pace) G.pace.grade ={ g, sc: Math.round(sc), part: Object.fromEntries(Object.entries(part).map(([k, v]) => [k, Math.round(v)])) };
  G.style = { grade: g };
  // 숙련 ★ (정복 or 숙련 도전): ★1 the conquest, ★2 the objective without a slip, ★3 an S.
  if (H.mode !== 'rush' && G.cleared) {
    const pr = A.progress(), id = G.stage.id;
    pr.mastery = pr.mastery || {};
    const stars = 1 + (H.goalBonus ? 1 : 0) + (g === 'S' ? 1 : 0);
    H.grade.stars = stars;
    H.grade.newStar = stars > (pr.mastery[id] || 0);
    pr.mastery[id] = Math.max(pr.mastery[id] || 0, stars);
  }
  // The ★ of every ground together: a little more money from every hunt (0.5% a ★, to 25%).
  H.grade.starK = 1 + Math.min(0.25, 0.005 * starTotal());
  H.grade.k = Math.round(H.grade.k * H.grade.starK * 100) / 100;
  return H.grade;
}

/** Over the field (world space): the 처형 mark over those that may be finished. */
function world(ctx) {
  const G = A.G();
  if (!G.hunt) return;
  const im = A.images['hud/st_debuff_dead_1.png'];
  for (const e of G.enemies) {
    if (!executable(e)) continue;
    const y = e.y - e.m.h * e.scale - 14 + Math.sin(G.t * 8) * 2;
    if (im && im.width) ctx.drawImage(im, Math.round(e.x - 8), Math.round(y - 16), 16, 16);
    else { ctx.font = 'bold 10px G9'; ctx.textAlign = 'center'; A.outline('처형', e.x, y, '#ff5a3a'); }
  }
}

/** The 기세 ticks under the 殺 strip, the 폭주 glow, the 질주 button's wait. */
function hud2(ctx, cv) {
  const G = A.G(), m = mo(), s = cv.width / 860;
  const x = cv.width - 126 * s, y = 86 * s;
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = i < m.tier ? (i === 3 ? '#ff6a2a' : '#ffd84a') : 'rgba(0,0,0,0.5)';
    ctx.fillRect(x + i * 14 * s, y, 11 * s, 4 * s);
  }
  if (m.tier) {
    ctx.font = `${Math.round(9 * s)}px G9`;
    ctx.textAlign = 'left';
    A.outline(MOMENTUM_NAME[m.tier], x, y + 13 * s, m.tier === 4 ? '#ff8a4a' : '#ffe9a0');
  }
  if (m.frenzy > G.t) {
    const k = 0.25 + 0.12 * Math.sin(G.t * 10);
    const gr = ctx.createRadialGradient(cv.width / 2, cv.height / 2, cv.height * 0.35, cv.width / 2, cv.height / 2, Math.hypot(cv.width, cv.height) / 2);
    gr.addColorStop(0, 'rgba(255,200,40,0)');
    gr.addColorStop(1, `rgba(255,190,40,${k})`);
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, cv.width, cv.height);
  }
  const b = document.querySelector('#dash-btn');
  if (b) {
    if (b.hidden) b.hidden = false;
    const w = Math.max(0, (G.dashReady || 0) - G.t);
    const txt = w > 0 ? `${w.toFixed(1)}` : '질주';
    if (b._t !== txt) { b._t = txt; b.textContent = txt; }
    b.classList.toggle('ready', w <= 0);
    b.classList.toggle('glow', chainReady());
  }
}

// ------------------------------------------------------------------ 사냥터마다의 정체성 (P3)
//
// Each ground belongs to a group (군) and has, in its second act, one objective (목표) of its own,
// its hazards (위험: red tiles that strike monsters too) and its champions' affixes (정예 속성).
// The objective's steps raise the 토벌도 and call champions and leaders. Its pieces are the
// build's own official pictures (prop/: war_totem, war_cart, war_seal, war_brazier …).

export const GROUPS = {
  cave: { name: '국내성 굴', light: 0.8 },
  plain: { name: '대륙 들판', light: 0.95, tint: 'rgba(255,170,90,0.10)' },
  snow: { name: '백두산', light: 1, tint: 'rgba(230,240,255,0.12)' },
  sea: { name: '바다', light: 0.85, tint: 'rgba(40,160,170,0.14)' },
  isle: { name: '환상의 섬', light: 0.9, tint: 'rgba(90,200,80,0.08)' },
  house: { name: '집·탑', light: 0.75 },
  hell: { name: '지옥', light: 0.75, tint: 'rgba(230,50,20,0.16)' },
  sky: { name: '하늘 아래', light: 0.9, tint: 'rgba(255,140,40,0.12)' },
  abyss: { name: '끝없는 지옥', light: 1 },
};

// id: [group, goal, hazards, elites]. goal: [kind, n (steps or seconds), label, prop].
const G_ = (group, goal, hazard = [], elite = []) => ({ group, goal: goal && { kind: goal[0], n: goal[1], label: goal[2], prop: goal[3], mode: goal[4] }, hazard, elite });
export const GROUNDS = {
  novice: G_('cave', ['chase', 3, '사슴왕 추격'], [], []),
  rabbit: G_('cave', ['collect', 3, '황금 토끼털 줍기', 'island_shells'], [], ['swift']),
  rat: G_('cave', ['destroy', 3, '쥐구멍 부수기', 'war_lock'], [], ['swift']),
  snake: G_('cave', ['survive', 50, '독 웅덩이 버티기', null, 'bog'], ['bog'], ['vampiric']),
  bigsnake: G_('cave', ['chase', 3, '이무기 추격'], ['bog'], ['vampiric']),
  deer: G_('cave', ['defend', 70, '성황당 토템 지키기', 'war_totem'], ['stampede'], ['swift']),
  pig: G_('cave', ['collect', 5, '도토리 자루 줍기', 'field_barrel'], [], ['splitting']),
  bear: G_('cave', ['chase', 3, '이름 붙은 호랑이 사냥'], [], ['swift']),
  bearman: G_('cave', ['destroy', 3, '곰인 토템 부수기', 'war_totem'], [], ['swift']),
  fox: G_('cave', ['chase', 3, '불구미호 분신 쫓기'], [], ['cursed']),
  mantis: G_('cave', ['destroy', 4, '사마귀 알 부수기', 'war_rocks'], [], ['swift']),
  skull: G_('cave', ['purify', 3, '비석 정화', 'war_seal'], [], ['shaman']),
  haunt: G_('house', ['purify', 4, '등롱 밝히기', 'house_lantern'], [], ['cursed']),
  goblin: G_('cave', ['collect', 4, '도깨비 보물 줍기', 'jar2'], ['sparks'], ['swift']),
  bandit: G_('cave', ['escort', 26, '빼앗긴 짐수레 되찾기', 'war_cart'], [], ['swift']),
  japan: G_('plain', ['destroy', 3, '왜군 진영 깃발 부수기', 'war_gate'], ['cannon'], ['swift']),
  steppe: G_('plain', ['drive', 3, '사냥대회: 몰이 셋'], ['stampede'], ['swift']),
  zud: G_('plain', ['drive', 3, '사냥대회: 기마 몰이'], ['stampede'], ['swift']),
  zud2: G_('plain', ['destroy', 3, '주술 토템 부수기', 'war_totem'], ['stampede'], ['shaman']),
  hwagwa: G_('plain', ['chase', 3, '원숭이 장수 추격'], [], ['swift']),
  kirin: G_('plain', ['purify', 3, '하늘 제단 정화', 'war_altar'], ['sparks'], ['warding']),
  wolf: G_('plain', ['survive', 45, '만월: 등불 곁에서 버티기', 'cave_torch', 'moon'], [], ['vampiric', 'swift']),
  greatwall: G_('plain', ['destroy', 3, '혼령석 부수기', 'war_rocks'], ['rockfall'], ['warding']),
  qin: G_('plain', ['defend', 70, '봉인진 지키기', 'war_seal'], ['pillars'], ['warding']),
  baekdu: G_('snow', ['chase', 3, '설담비 추격'], ['stampede'], ['swift']),
  baekdu2: G_('snow', ['destroy', 3, '요괴거목 베기', 'war_totem'], [], ['warding']),
  baekdu3: G_('snow', ['purify', 3, '봉우리 제단 정화', 'war_altar'], ['icefall'], ['frozen']),
  baekdu4: G_('snow', ['defend', 70, '백두선인의 결계 지키기', 'war_totem'], ['tide'], ['frozen']),
  sea: G_('sea', ['collect', 5, '진주 줍기', 'sea_shells'], ['tide'], ['frozen']),
  palace: G_('sea', ['escort', 24, '거북 사신 호위', 'war_cart2'], ['tide'], ['warding']),
  deepsea: G_('sea', ['destroy', 3, '대왕오징어 촉수 끊기', 'sea_kelp2'], [], ['frozen']),
  reef: G_('sea', ['purify', 3, '해골 제단 정화', 'war_altar'], ['tide'], ['shaman']),
  wreck: G_('sea', ['survive', 50, '포격 속 갑판 버티기', null, 'cannon'], ['cannon'], ['swift']),
  island: G_('isle', ['collect', 4, '인성초 뿌리 줍기', 'island_plant'], ['bog'], ['frozen']),
  gogyun: G_('isle', ['collect', 4, '인성초 뿌리 줍기', 'island_plant'], ['bog'], ['frozen']),
  volcano: G_('isle', ['survive', 50, '차오르는 용암 버티기', null, 'lava'], ['eruption'], ['burning']),
  spidercave: G_('isle', ['destroy', 3, '지주 알집 부수기', 'war_rocks'], [], ['frozen']),
  gareung: G_('isle', ['collect', 3, '유물 운반', 'war_lock'], [], ['cursed']),
  pokyeom: G_('isle', ['defend', 70, '절벽 위 봉화 지키기', 'war_brazier'], ['rockfall'], ['burning']),
  yogoe: G_('house', ['destroy', 3, '요괴 문 부수기', 'war_door'], [], ['shaman']),
  royal: G_('house', ['escort', 24, '궁녀 호위', 'war_cart3'], [], ['warding']),
  murim: G_('house', ['duel', 3, '대련: 사범 셋'], [], []),
  musin: G_('house', ['floors', 3, '탑 오르기'], [], ['swift', 'warding', 'burning']),
  tagye: G_('house', ['purify', 4, '마령 구멍 봉인', 'war_seal'], [], ['shaman', 'cursed']),
  hwatang: G_('hell', ['purify', 4, '업화로 정화', 'war_brazier'], ['eruption'], ['burning']),
  hanbing: G_('hell', ['survive', 50, '화로 곁에서 버티기', 'war_brazier', 'warm'], ['icefall'], ['frozen']),
  geohae: G_('hell', ['destroy', 3, '거해 둥지 부수기', 'war_rocks'], ['quake'], ['warding']),
  cheolsang: G_('hell', ['purify', 5, '다섯 돌 밝히기', 'war_seal'], ['pillars'], ['warding']),
  sandolim: G_('sky', ['escort', 28, '협곡 전진', 'war_cart'], ['rockfall'], ['swift']),
  fallforest: G_('sky', ['defend', 70, '귀장승 지키기', 'war_totem'], [], ['cursed']),
  jagwi: G_('sky', ['survive', 50, '번지는 늪 버티기', null, 'bog'], ['bog'], ['vampiric']),
  oldaram: G_('sky', ['destroy', 3, '귀병문 부수기', 'war_door'], [], ['shaman']),
  haya: G_('sky', ['survive', 50, '번지는 불길 버티기', null, 'fire'], ['eruption'], ['burning', 'swift']),
  lobi: G_('sky', ['chase', 3, '파도뱀 추격'], ['tide'], ['frozen']),
  aram: G_('sky', ['survive', 50, '모래폭풍 버티기', null, 'storm'], [], ['swift']),
  ancient: G_('sky', ['purify', 3, '성문 점령', 'war_gate'], [], ['warding']),
  abyss: G_('abyss', ['purify', 5, '무덤 횃불 밝히기', 'cave_torch'], [], ['cursed']),
  abyss2: G_('abyss', ['chase', 3, '울부짖는 달걀귀신 추격'], [], ['cursed']),
  abyss3: G_('abyss', ['purify', 3, '봉인 셋 깨기', 'war_seal'], ['pillars'], ['shaman']),
  abyss4: G_('abyss', ['destroy', 3, '세계석 조각 부수기', 'war_rocks'], ['quake'], ['warding']),
  cow: G_('abyss', ['drive', 3, '소 떼 몰이'], ['stampede'], ['swift']),
};

const AFFIX = {
  burning: '불타는', frozen: '얼어붙은', vampiric: '흡혈하는', splitting: '쪼개지는', warding: '수호하는', cursed: '저주받은', swift: '날랜', shaman: '주술사',
};

function ground(G = A.G()) {
  return GROUNDS[G.stage.id] || G_('cave', ['chase', 3, '우두머리 추격'], [], ['swift']);
}

/** Tiles at distance about r from the hero, open. */
function spotNear(r0, r1) {
  const G = A.G(), p = G.player;
  for (let i = 0; i < 40; i++) {
    const a = Math.random() * Math.PI * 2, r = r0 + Math.random() * (r1 - r0);
    const tx = p.tx + Math.round(Math.cos(a) * r), ty = p.ty + Math.round(Math.sin(a) * r * 0.75);
    if (A.free(tx, ty) && !(A.walled(tx, ty))) return [tx, ty];
  }
  return [p.tx + r0, p.ty];
}

// ---------------- the objective

function goalStart() {
  const G = A.G(), H = G.hunt, gd = ground().goal;
  if (!gd) return;
  const g = H.goal = { kind: gd.kind, n: gd.n, label: gd.label, prop: gd.prop, mode: gd.mode, step: 0, at: G.t, items: [], ok: true };
  A.banner(`목표 · ${g.label}`);
  A.say(`목표: ${g.label}`, 'sys');
  note('goal:start');
  const k = g.kind;
  if (k === 'collect') for (let i = 0; i < g.n; i++) g.items.push({ at: spotNear(5 + i * 2, 9 + i * 2), done: false });
  else if (k === 'purify') { g.items.push({ at: spotNear(6, 9), fill: 0 }); }
  else if (k === 'destroy') for (let i = 0; i < g.n; i++) nest(g, spotNear(5 + i * 2, 8 + i * 2));
  else if (k === 'defend') { g.items.push({ at: spotNear(3, 4), hp: 1 }); g.end = G.t + g.n; g.waveT = G.t + 4; }
  else if (k === 'escort') { const [x, y] = spotNear(2, 3); g.cart = { x: x + 0.5, y: y + 0.5, hp: 1, done: 0, dx: Math.random() < 0.5 ? 1 : -1, path: cartPath(x, y, g.n) }; }
  else if (k === 'survive') { g.end = G.t + g.n; survivePrep(g); }
  else if (k === 'chase') chaseSpawn(g);
  else if (k === 'duel') g.next = G.t + 1;
  else if (k === 'floors') g.next = G.t + 1;
  else if (k === 'drive') g.next = G.t + 2;
}

/** A step of the objective done: the gauge, and a beat on it. */
function goalStep(text) {
  const G = A.G(), H = G.hunt, g = H.goal;
  g.step++;
  const share = 0.5 / Math.max(1, typeof g.n === 'number' && g.n <= 6 ? g.n : 3);
  gain(share);
  note('goal:' + g.step);
  A.floatText(G.player.x, G.player.y - 90, `${g.label} ${Math.min(g.step, goalSteps(g))}/${goalSteps(g)}`, '#9ad8ff', true);
  if (text) A.say(text, 'sys');
  // The steps call the elite: a pack after the first, a leader after the second.
  if (g.step === 1) champs();
  else if (g.step === 2 && G.mini) leader();
  if (g.step >= goalSteps(g)) goalDone(true);
}

function goalSteps(g) {
  if (A.G().hunt.mode === 'rush') return 1;
  return g.kind === 'defend' || g.kind === 'survive' || g.kind === 'escort' ? 3 : g.n;
}

function goalDone(ok) {
  const G = A.G(), H = G.hunt, g = H.goal;
  if (!g || g.over) return;
  g.over = true;
  H.goalDone = ok;
  H.goalBonus = ok && g.ok;
  for (const e of G.enemies) if (e.goal && e.hp > 0 && e.kind !== 'mini') { e.hp = 0; A.killEnemy(e); }
  if (ok) {
    A.banner(`목표 달성 · ${g.label}`);
    gain(0.1);
    A.G().drops.push({ x: G.player.x, y: G.player.y + 26, kind: 'chest' });
  } else A.banner(`목표 실패 · ${g.label}`);
  note(ok ? 'goal:done' : 'goal:fail');
}

/** A spawning nest (파괴): a still body among the monsters, struck like one. */
function nest(g, at) {
  const G = A.G();
  const e = A.addEnemy(A.pickMonster(true), 'champ', { name: g.label.split(' ')[0], scale: 1 }, 0, at);
  if (!e) return;
  e.goal = 'nest';
  e.hunt = { prop: g.prop };
  e.hp = e.maxHp = e.maxHp * 1.6;
  e.dmg = 0;
  e.spawnT = G.t + 3;
}

function chaseSpawn(g) {
  const G = A.G();
  const who = G.mini || G.boss;
  const at = spotNear(4, 6);
  const e = A.addEnemy(who.m, 'mini', { name: who.name, scale: (who.scale || 1.3) * 0.9 }, 0, at);
  if (!e) { g.retry = G.t + 1; return; }
  e.goal = 'chase';
  e.hp = e.maxHp = e.maxHp * 0.7;
  e.flee = Infinity;
  e.stepTime = Math.max(0.42, e.stepTime * 0.75);
  g.target = e;
}

function survivePrep(g) {
  const G = A.G();
  if (g.mode === 'warm' || g.mode === 'moon') for (let i = 0; i < 3; i++) g.items.push({ at: spotNear(3 + i * 3, 5 + i * 3), r: 2.5 });
  if (g.mode === 'moon') { A.banner('만월이 뜬다! 늑대인간들이 날뛴다'); for (const e of G.enemies) e.stepTime *= 0.77; }
  if (g.mode === 'storm') A.banner('모래폭풍이 몰려온다! 시야가 좁아진다');
}

function goalTick(dt) {
  const G = A.G(), H = G.hunt, g = H.goal, p = G.player, t = G.t;
  if (!g || g.over) return;
  const near = (at, r) => Math.abs(at[0] - p.tx) <= r && Math.abs(at[1] - p.ty) <= r;
  if (g.kind === 'collect') {
    for (const it of g.items) if (!it.done && near(it.at, 0.5)) { it.done = true; A.addFx && A.M().fx.h_kill && A.addFx('h_kill', it.at[0] * A.TILE + 24, it.at[1] * A.TILE + 24, { scale: 0.6 }); goalStep(); }
  } else if (g.kind === 'purify') {
    const it = g.items[0];
    if (it) {
      const foes = G.enemies.filter(e => !e.goal && Math.abs(e.tx - it.at[0]) <= 1 && Math.abs(e.ty - it.at[1]) <= 1).length;
      if (near(it.at, 1)) it.fill = Math.min(1, it.fill + dt / 5 / (1 + foes * 0.3));
      else it.fill = Math.max(0, it.fill - dt / 20);
      if (it.fill >= 1) {
        g.items.shift();
        (g.lit = g.lit || []).push(it.at);
        if (g.step + 1 < g.n) g.items.push({ at: spotNear(6, 10), fill: 0 });
        goalStep();
      }
    }
  } else if (g.kind === 'destroy') {
    for (const e of G.enemies) if (e.goal === 'nest' && e.hp > 0 && t >= e.spawnT) {
      e.spawnT = t + Math.max(2.5, 5 - 0.6 * (g.n - G.enemies.filter(o => o.goal === 'nest').length));
      for (let i = 0; i < 2; i++) { const s = [e.tx + (i ? 1 : -1), e.ty]; if (A.free(s[0], s[1])) A.addEnemy(A.pickMonster(), null, null, 0, s); }
    }
  } else if (g.kind === 'defend') {
    const it = g.items[0];
    let bite = 0;
    for (const e of G.enemies) if (!e.kind && Math.abs(e.tx - it.at[0]) + Math.abs(e.ty - it.at[1]) <= 1) bite++;
    it.hp -= bite * dt * 0.006;
    if (it.hp < 0.5) g.ok = false;
    if (t >= g.waveT) {
      g.waveT = t + 9;
      for (let i = 0; i < 6; i++) {
        const a = Math.random() * Math.PI * 2, s = [it.at[0] + Math.round(Math.cos(a) * 6), it.at[1] + Math.round(Math.sin(a) * 4)];
        const e = A.free(s[0], s[1]) && A.addEnemy(A.pickMonster(), null, null, 0, s);
        if (e) e.hunt = { to: it.at };
      }
    }
    const left = g.end - t, part = Math.floor((g.n - left) / (g.n / 3));
    while (g.step < Math.min(3, part)) goalStep();
    if (it.hp <= 0) goalDone(false);
  } else if (g.kind === 'escort') {
    const c = g.cart;
    const by = Math.abs(c.x - p.tx - 0.5) <= 3 && Math.abs(c.y - p.ty - 0.5) <= 3;
    let bite = 0;
    for (const e of G.enemies) if (!e.kind && Math.abs(e.tx + 0.5 - c.x) <= 1.5 && Math.abs(e.ty + 0.5 - c.y) <= 1.5) bite++;
    c.hp -= bite * dt * 0.004;
    if (c.hp < 0.5) g.ok = false;
    if (by && bite < 3) {
      c.done += dt * 0.9;
      if (c.path) {
        const i = Math.min(c.path.length - 1, Math.floor(c.done)), j = Math.min(c.path.length - 1, i + 1), f = c.done - Math.floor(c.done);
        const nx = c.path[i][0] + (c.path[j][0] - c.path[i][0]) * f + 0.5, ny = c.path[i][1] + (c.path[j][1] - c.path[i][1]) * f + 0.5;
        if (nx !== c.x) c.dx = nx > c.x ? 1 : -1;
        c.x = nx; c.y = ny;
      } else c.x += c.dx * dt * 0.9;
    }
    c.moving = by && bite < 3;
    const part = Math.floor(c.done / (g.n / 3));
    while (g.step < Math.min(3, part)) goalStep();
    if (c.hp <= 0) goalDone(false);
  } else if (g.kind === 'survive') {
    survivTick(g, dt);
    const left = g.end - t, part = Math.floor((g.n - left) / (g.n / 3));
    while (g.step < Math.min(3, part)) goalStep();
  } else if (g.kind === 'chase') {
    if (g.retry && t >= g.retry) { g.retry = 0; chaseSpawn(g); }
    const e = g.target;
    if (e && e.hp > 0 && G.enemies.includes(e)) {
      const caught = e.hp < e.maxHp * (1 - (g.step + 1) / g.n) && t > (g.grace || 0);
      if (e.hp < e.maxHp * (1 - (g.step + 1) / g.n) && t <= (g.grace || 0)) e.hp = e.maxHp * (1 - (g.step + 1) / g.n) + 1;
      if (caught && g.step + 1 < g.n) {
        // Caught: it shakes free, leaves its followers and runs off again.
        for (let i = 0; i < 3; i++) A.addEnemy(A.pickMonster(), 'minion', null, 0, null);
        const at = spotNear(7, 10);
        A.relocate(e, at);
        e.guardT = t + 1.5;
        g.grace = t + 6;
        A.floatText(e.x, e.y - 40, '놓쳤다!', '#ffd84a', true);
        goalStep(`${e.name}을(를) 붙잡았지만 달아났습니다!`);
      }
    } else if (e && !G.enemies.includes(e)) {
      g.target = null;
      while (g.step < g.n) goalStep();
    }
  } else if (g.kind === 'duel') {
    if (!g.master && t >= g.next && g.step < g.n) {
      const who = G.mini || G.boss;
      const e = A.addEnemy(who.m, 'mini', { name: `사범 ${g.step + 1}`, scale: 1.3 }, 0, spotNear(2, 3));
      if (e) { e.goal = 'duel'; g.master = e; A.banner(`대련 · 사범 ${g.step + 1}`); }
    }
    if (g.master) {
      // The crowd holds back while the master fights.
      for (const e of G.enemies) if (!e.kind) e.stun = Math.max(e.stun, 0.3);
      if (!G.enemies.includes(g.master)) { g.master = null; g.next = t + 2; goalStep(); }
    }
  } else if (g.kind === 'floors') {
    if (!g.wave && t >= g.next && g.step < g.n) {
      const aff = ground().elite[g.step % ground().elite.length] || 'swift';
      g.wave = champs(1, aff);
      A.banner(`무신의 탑 ${g.step + 1}층`);
    }
    if (g.wave && !G.enemies.some(e => e.pack === g.wave)) { g.wave = 0; g.next = t + 2; goalStep(); }
  } else if (g.kind === 'drive') {
    if (!g.line && t >= g.next && g.step < g.n) {
      g.line = A.huntEvent('march') || -1;
      g.lineAt = t;
    }
    if (g.line && (t - g.lineAt > 14 || !G.enemies.some(e => e.march))) { g.line = 0; g.next = t + 4; goalStep(); }
  }
}

/** The cart's way on a bounded map: the open tiles of a walk n long, away from where it starts. */
function cartPath(x, y, n) {
  const G = A.G();
  if (!G.arena) return null;
  const m = G.arena.map, prev = new Map(), q = [[x, y]], k = (a, b) => a * 4096 + b;
  prev.set(k(x, y), null);
  let far = [x, y], fd = 0;
  const dist = new Map([[k(x, y), 0]]);
  while (q.length) {
    const [cx, cy] = q.shift(), d = dist.get(k(cx, cy));
    if (d > fd) { fd = d; far = [cx, cy]; }
    if (d >= n) continue;
    for (const [dx, dy] of DIR4) {
      const nx = cx + dx, ny = cy + dy;
      if (!open(nx, ny) || dist.has(k(nx, ny))) continue;
      dist.set(k(nx, ny), d + 1);
      prev.set(k(nx, ny), [cx, cy]);
      q.push([nx, ny]);
    }
  }
  const path = [];
  for (let c = far; c; c = prev.get(k(c[0], c[1]))) path.unshift(c);
  return path.length > 4 ? path : null;
}

/** 생존: the ground's own pressure while the objective lasts. */
function survivTick(g, dt) {
  const G = A.G(), p = G.player, t = G.t;
  if (g.mode === 'warm' || g.mode === 'moon') {
    const warm = g.items.some(it => Math.hypot(it.at[0] - p.tx, it.at[1] - p.ty) <= it.r);
    if (g.mode === 'warm' && !warm && t - (g.coldT || 0) > 1.5) { g.coldT = t; A.heroStatus('slow'); g.cold = (g.cold || 0) + 1; if (g.cold % 4 === 0) A.heroStatus('freeze'); g.ok = g.ok && g.cold < 12; }
    if (warm) g.cold = Math.max(0, (g.cold || 0) - dt);
    if (g.mode === 'moon') for (const e of G.enemies) if (!e.kind) e.dmg = e.baseDmg ? e.baseDmg * (warm ? 0.8 : 1.3) : (e.baseDmg = e.dmg, e.dmg);
  } else if (g.mode === 'bog' && t - (g.bogT || 0) > 3) {
    g.bogT = t;
    bog(spotNear(1, 4), 2);
  } else if (g.mode === 'lava' && t - (g.lavaT || 0) > 3.5) {
    g.lavaT = t;
    hazard('eruption', true);
  } else if (g.mode === 'fire' && t - (g.fireT || 0) > 3) {
    g.fireT = t;
    hazard('eruption', true);
  } else if (g.mode === 'cannon' && t - (g.canT || 0) > 3.2) {
    g.canT = t;
    hazard('cannon', true);
  }
}

// ---------------- 위험 (hazards): red tiles that strike the hero and the monsters alike

function hazardMark(tiles, warn, onFall) {
  const G = A.G();
  const H = G.hunt;
  if (G.marks.length > 8) return;
  const share = 0.08 * Math.min(1, 0.5 + G.level / 24);
  const mk = { tiles, at: G.t + warn, made: G.t, dmg: G.player.maxHp * share, share, hazard: true };
  mk.onFall = () => {
    // The monsters on the tiles are struck as hard (a plain one falls, an elite feels it).
    const set = new Set(tiles.map(([x, y]) => x + ',' + y));
    let n = 0;
    for (const e of G.enemies.slice()) {
      if (e.hp <= 0 || e.kind === 'boss' || e.goal || !set.has(e.tx + ',' + e.ty)) continue;
      const d = e.kind ? e.maxHp * 0.12 : e.maxHp * 0.7;
      G.allyHitting = true;
      A.hurtEnemy(e, d / Math.max(0.2, A.might ? A.might() : 1));
      G.allyHitting = false;
      if (e.hp <= 0) n++;
    }
    if (n >= 10) { A.banner('지형 활용!'); gain(0.03); H.terrain = (H.terrain || 0) + 1; note('hazard:terrain'); }
    if (onFall) onFall();
  };
  G.marks.push(mk);
}

function hazard(kind, quiet) {
  const G = A.G(), p = G.player, v = { w: 8, h: 4 };
  const T = [];
  const sq = (cx, cy, r) => { for (let x = -r; x <= r; x++) for (let y = -r; y <= r; y++) T.push([cx + x, cy + y]); };
  if (kind === 'eruption') { for (let i = 0; i < 3; i++) { const [x, y] = spotNear(1, 6); sq(x, y, 1); } hazardMark(T, 1.3); }
  else if (kind === 'icefall') { const dx = Math.random() < 0.5 ? 1 : 0, o = Math.round(Math.random() * 2 - 1); for (let k = -2; k <= 2; k++) T.push(dx ? [p.tx + k, p.ty + o] : [p.tx + o, p.ty + k]); hazardMark(T, 1.1); }
  else if (kind === 'rockfall') { const y = p.ty + Math.round(Math.random() * 4 - 2), gap = p.tx + Math.round(Math.random() * 10 - 5); for (let x = p.tx - v.w; x <= p.tx + v.w; x++) if (Math.abs(x - gap) > 1) T.push([x, y]); hazardMark(T, 1.4); }
  else if (kind === 'cannon') {
    if (Math.random() < 0.5) { const y = p.ty + Math.round(Math.random() * 4 - 2); for (let x = p.tx - v.w; x <= p.tx + v.w; x++) T.push([x, y]); }
    else { const x = p.tx + Math.round(Math.random() * 6 - 3); for (let y = p.ty - v.h - 1; y <= p.ty + v.h + 1; y++) T.push([x, y]); }
    hazardMark(T, 1.3);
  } else if (kind === 'tide') {
    const dir = Math.random() < 0.5 ? 1 : -1;
    for (let w = 0; w < 3; w++) A.later(w * 0.9, () => { const L = []; const x0 = p.tx - dir * (v.w - w * 4); for (let x = x0; x !== x0 + dir * 3; x += dir) for (let y = p.ty - v.h; y <= p.ty + v.h; y++) L.push([x, y]); hazardMark(L, 1.2); });
  } else if (kind === 'bog') bog(spotNear(2, 6), 1);
  else if (kind === 'stampede') {
    const y = p.ty + Math.round(Math.random() * 4 - 2);
    for (let x = p.tx - v.w; x <= p.tx + v.w; x++) T.push([x, y]);
    hazardMark(T, 1.6, () => A.huntEvent('march'));
  } else if (kind === 'quake') { for (let a = 0; a < 16; a++) T.push([p.tx + Math.round(Math.cos(a / 16 * Math.PI * 2) * 3), p.ty + Math.round(Math.sin(a / 16 * Math.PI * 2) * 3)]); hazardMark(T, 1.3); }
  else if (kind === 'sparks') { for (let i = 0; i < 6; i++) T.push(spotNear(0, 5)); hazardMark(T, 1.1); }
  else if (kind === 'pillars') { const [dx, dy] = [[1, 0], [0, 1]][Math.floor(Math.random() * 2)]; const [x0, y0] = spotNear(2, 4); for (let k = 0; k < 4; k++) sq(x0 + dx * k * 2, y0 + dy * k * 2, 0); hazardMark(T, 1.1); }
  if (!quiet) note('hazard:' + kind);
}

/** 늪: tiles that stay a while; the hero on them is poisoned, the monsters slowed. */
function bog(at, r) {
  const G = A.G(), H = G.hunt;
  H.bogs = (H.bogs || []).filter(b => b.until > G.t).slice(-10);
  H.bogs.push({ x: at[0], y: at[1], r, until: G.t + 9 });
}

function hazardTick() {
  const G = A.G(), H = G.hunt, t = G.t, list = ground().hazard;
  if (H.act === 2 && list.length && t >= (H.hazT || 25)) {
    H.hazT = t + 5.5 + Math.random() * 2;
    hazard(list[Math.floor(Math.random() * list.length)]);
  }
  if (H.bogs && H.bogs.length) {
    const p = G.player;
    if (H.bogs.some(b => b.until > t && Math.abs(b.x - p.tx) <= b.r && Math.abs(b.y - p.ty) <= b.r) && t - (H.bogHit || 0) > 1) { H.bogHit = t; A.heroStatus('poison'); }
    for (const b of H.bogs) if (b.until > t) for (const e of G.enemies) if (!e.kind && Math.abs(b.x - e.tx) <= b.r && Math.abs(b.y - e.ty) <= b.r) e.slow = Math.max(e.slow, 0.5);
  }
}

// ---------------- 정예 속성 (champion affixes)

/** An affix of the ground's (a second one: another, of the ground's or the common ones). */
function affixOf(G, not = null) {
  let list = ground(G).elite;
  if (not) list = list.concat(['swift', 'vampiric', 'warding', 'burning']).filter(a => a !== not);
  return list.length ? list[Math.floor(Math.random() * list.length)] : null;
}

/** The champion has this affix (its first or its second). */
function has(e, a) {
  return e.affix === a || e.affix2 === a;
}

function affix(e, a) {
  if (!a || has(e, a)) return;
  if (e.affix) e.affix2 = a;
  else e.affix = a;
  e.name = `${AFFIX[a]} ${e.name || '챔피언'}`;
  if (a === 'swift') e.stepTime *= 0.67;
}

function affixTick() {
  const G = A.G(), t = G.t;
  if (t - (G.hunt.affT || 0) < 0.5) return;
  G.hunt.affT = t;
  for (const e of G.enemies) {
    if (!e.affix || e.hp <= 0) continue;
    if (has(e, 'burning') && t - (e.burnT || 0) > 2) { e.burnT = t; hazardMark([[e.tx, e.ty], [e.tx + 1, e.ty], [e.tx - 1, e.ty]], 0.9); }
    if (has(e, 'warding')) for (const o of G.enemies) if (o !== e && o.pack === e.pack) o.ward = t + 0.7;
  }
}

/** A champion struck the hero: its affix. */
function hurtBy(from) {
  const G = A.G();
  if (!G.hunt || !from || !from.affix) return;
  if (has(from, 'frozen')) A.heroStatus('slow');
  if (has(from, 'vampiric')) from.hp = Math.min(from.maxHp, from.hp + from.maxHp * 0.06);
}

/** A champion fell: its affix. */
function affixDeath(e) {
  const G = A.G();
  if (has(e, 'splitting') && !e.split) {
    for (let i = 0; i < 2; i++) {
      const s = A.addEnemy(e.m, null, null, 0, [e.tx + (i ? 1 : -1), e.ty]);
      if (s) { s.split = true; s.scale = 0.8; }
    }
  }
  if (has(e, 'cursed')) {
    const T = [];
    for (let a = 0; a < 12; a++) T.push([e.tx + Math.round(Math.cos(a / 12 * Math.PI * 2) * 2), e.ty + Math.round(Math.sin(a / 12 * Math.PI * 2) * 2)]);
    hazardMark(T, 1);
  }
  // 주술사: the first of its pack to fall gets up again, once.
  const sh = G.enemies.find(o => has(o, 'shaman') && o.pack === e.pack && o !== e && o.hp > 0 && !o.raised);
  if (sh && e.kind === 'champ') {
    sh.raised = true;
    A.later(1.2, () => {
      if (A.G() !== G) return;
      const r = A.addEnemy(e.m, 'champ', { name: e.name, scale: e.scale }, e.pack, A.free(e.tx, e.ty) ? [e.tx, e.ty] : null);
      if (r) { r.hp = r.maxHp * 0.5; if (A.M().fx.k_revive) A.addFx('k_revive', r.x, r.y - 20, { scale: 0.8 }); A.floatText(r.x, r.y - 40, '부활!', '#c8a0ff', true); }
    });
  }
}

/** The monster moves of the objective (true: handled). */
function move(e) {
  const G = A.G();
  if (e.goal === 'nest') return true; // still
  if (e.hunt && e.hunt.to) {
    const [tx, ty] = e.hunt.to;
    if (Math.abs(e.tx - tx) + Math.abs(e.ty - ty) <= 1) return true; // at the totem: it gnaws (goalTick)
    if (Math.abs(e.tx - G.player.tx) + Math.abs(e.ty - G.player.ty) <= 2) { e.hunt = null; return false; } // the hero is in the way
    e.cd -= 1 / 60;
    if (e.moving || e.cd > 0) return true;
    e.cd = e.stepTime;
    for (const [dx, dy] of A.towards(e, tx, ty)) if (A.step(e, dx, dy, e.stepTime)) break;
    return true;
  }
  return false;
}

/** Where the bot (tools/pace.js) heads for the objective. */
function goalSpot() {
  const G = A.G(), H = G && G.hunt, g = H && H.goal;
  if (!g || g.over) return null;
  if (g.kind === 'collect') { const it = g.items.find(i => !i.done); return it && it.at; }
  if (g.kind === 'purify') return g.items[0] && g.items[0].at;
  if (g.kind === 'destroy') { const e = G.enemies.find(o => o.goal === 'nest'); return e && [e.tx, e.ty]; }
  if (g.kind === 'defend') return g.items[0] && g.items[0].at;
  if (g.kind === 'escort') return [Math.floor(g.cart.x), Math.floor(g.cart.y)];
  if (g.kind === 'chase') { const e = g.target; return e && [e.tx, e.ty]; }
  if (g.kind === 'survive' && g.items.length) { const p = G.player; const it = g.items.slice().sort((a, b) => Math.hypot(a.at[0] - p.tx, a.at[1] - p.ty) - Math.hypot(b.at[0] - p.tx, b.at[1] - p.ty))[0]; return it.at; }
  return null;
}

// ---------------- drawing

function propImg(name) {
  const im = name && A.images[`prop/${name}.png`];
  return im && im.width ? im : null;
}

function drawGoal(ctx) {
  const G = A.G(), H = G.hunt, g = H && H.goal, T = A.TILE;
  if (H && H.bogs) for (const b of H.bogs) if (b.until > G.t) {
    ctx.fillStyle = `rgba(70,120,40,${0.28 * Math.min(1, (b.until - G.t) / 2)})`;
    ctx.fillRect((b.x - b.r) * T, (b.y - b.r) * T, (2 * b.r + 1) * T, (2 * b.r + 1) * T);
  }
  if (!g) return;
  const at = (x, y) => [x * T + T / 2, y * T + T - 6];
  const pic = (name, x, y, alpha = 1) => {
    const im = propImg(name);
    if (!im) return;
    const s = Math.min(1, 72 / Math.max(im.width, im.height));
    ctx.globalAlpha = alpha;
    ctx.drawImage(im, Math.round(x - im.width * s / 2), Math.round(y - im.height * s), Math.round(im.width * s), Math.round(im.height * s));
    ctx.globalAlpha = 1;
  };
  const ring = (x, y, r, k, color) => {
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); ctx.stroke();
  };
  if (g.kind === 'collect') for (const it of g.items) { if (it.done) continue; const [x, y] = at(...it.at); pic(g.prop, x, y + Math.sin(G.t * 4) * 2); ring(x, y - 8, 16, 1, 'rgba(120,200,255,0.6)'); }
  if (g.kind === 'purify') {
    for (const l of g.lit || []) { const [x, y] = at(...l); pic(g.prop, x, y); }
    for (const it of g.items) { const [x, y] = at(...it.at); pic(g.prop, x, y, 0.7); ring(x, y - 10, 30, it.fill, '#7ad0ff'); }
  }
  if (g.kind === 'defend' && g.items[0]) {
    const it = g.items[0], [x, y] = at(...it.at);
    pic(g.prop, x, y);
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - 21, y + 4, 42, 5);
    ctx.fillStyle = it.hp > 0.5 ? '#6ad04a' : '#e05a3a'; ctx.fillRect(x - 20, y + 5, 40 * Math.max(0, it.hp), 3);
  }
  if (g.kind === 'survive') for (const it of g.items) { const [x, y] = at(...it.at); pic(g.prop, x, y); ring(x, y - 6, it.r * T, 1, 'rgba(255,190,80,0.35)'); }
  if (g.kind === 'escort' && g.cart) {
    const c = g.cart, x = c.x * T, y = c.y * T + T / 2 - 6;
    const im = propImg(g.prop);
    if (im) { ctx.save(); ctx.translate(x, y); if (c.dx < 0) ctx.scale(-1, 1); const s = Math.min(1, 80 / im.width); ctx.drawImage(im, -im.width * s / 2, -im.height * s, im.width * s, im.height * s); ctx.restore(); }
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - 21, y + 4, 42, 5);
    ctx.fillStyle = c.hp > 0.5 ? '#6ad04a' : '#e05a3a'; ctx.fillRect(x - 20, y + 5, 40 * Math.max(0, c.hp), 3);
    ring(x, y - 10, 3 * T, 1, c.moving ? 'rgba(120,220,120,0.35)' : 'rgba(255,255,255,0.15)');
  }
  // Nests: their prop over the monster's place.
  for (const e of G.enemies) if (e.goal === 'nest' && e.hunt) pic(e.hunt.prop, e.x, e.y + 4);
}

/** 몰이 파도 on the screen: arrows on the edge it comes from, and how much of it is left. */
function drawWave(ctx, cv) {
  const G = A.G(), H = G.hunt, W = H && H.wv;
  if (!W || (W.state !== 'warn' && W.state !== 'run') || G.bossT !== undefined) return;
  const s = cv.width / 860, [dx, dy] = W.side, t = G.t;
  const warn = W.state === 'warn', pulse = 0.55 + 0.45 * Math.sin(t * (warn ? 12 : 6));
  const cx = cv.width / 2 + dx * (cv.width / 2 - 22 * s), cy = cv.height / 2 + dy * (cv.height / 2 - 22 * s);
  const a = Math.atan2(-dy, -dx); // pointing inward: the way they come
  ctx.save();
  ctx.globalAlpha = warn ? pulse : 0.5;
  ctx.fillStyle = warn ? '#ff5a3a' : '#ffb040';
  ctx.strokeStyle = '#200800';
  ctx.lineWidth = 2 * s;
  for (let i = -1; i <= 1; i++) {
    const ox = dy ? i * 70 * s : 0, oy = dx ? i * 60 * s : 0;
    ctx.save();
    ctx.translate(cx + ox, cy + oy);
    ctx.rotate(a);
    for (let j = 0; j < 2; j++) {
      ctx.beginPath();
      const x = j * 9 * s;
      ctx.moveTo(x + 9 * s, 0); ctx.lineTo(x - 5 * s, -9 * s); ctx.lineTo(x - 1 * s, 0); ctx.lineTo(x - 5 * s, 9 * s); ctx.closePath();
      ctx.stroke(); ctx.fill();
    }
    ctx.restore();
  }
  ctx.restore();
  ctx.font = `${Math.round(10 * s)}px G9`;
  ctx.textAlign = 'center';
  const txt = warn ? `몰이 파도 ${Math.max(0, Math.ceil(W.until - t))}초 전` : `몰이 파도 · 남은 ${W.left || 0}/${W.total || 0}`;
  A.outline(txt, cv.width / 2, hudTop(cv) + 40 * s, warn ? '#ff9a6a' : '#ffd84a');
}

/** The objective's line under the 토벌도, and an arrow to it when off screen. */
function drawGoalHud(ctx, cv) {
  const G = A.G(), H = G.hunt, g = H && H.goal, s = cv.width / 860;
  if (!g || G.bossT !== undefined) return;
  const n = goalSteps(g);
  let txt = `${g.label} ${Math.min(g.step, n)}/${n}`;
  if (g.end && !g.over) txt += ` · ${Math.max(0, Math.ceil(g.end - G.t))}초`;
  if (g.over) txt = `${g.label} · ${H.goalDone ? '달성' : '실패'}`;
  ctx.font = `${Math.round(10 * s)}px G9`;
  ctx.textAlign = 'center';
  A.outline(txt, cv.width / 2, hudTop(cv) + 28 * s, g.over ? (H.goalDone ? '#9ae07a' : '#ff8a6a') : '#9ad8ff');
  const at = goalSpot();
  if (!at) return;
  const p = G.player, dx = at[0] - p.tx, dy = at[1] - p.ty;
  const sw = A.VW() / A.TILE / 2, sh = A.VH() / A.TILE / 2;
  if (Math.abs(dx) < sw - 0.5 && Math.abs(dy) < sh - 0.5) return;
  const a = Math.atan2(dy, dx), cx = cv.width / 2, cy = cv.height / 2;
  const r = Math.min(cx / Math.abs(Math.cos(a) || 1e-6), cy / Math.abs(Math.sin(a) || 1e-6)) - 26 * s;
  const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.fillStyle = '#9ad8ff';
  ctx.strokeStyle = '#0a2030';
  ctx.lineWidth = 2 * s;
  ctx.beginPath(); ctx.moveTo(12 * s, 0); ctx.lineTo(-8 * s, -8 * s); ctx.lineTo(-4 * s, 0); ctx.lineTo(-8 * s, 8 * s); ctx.closePath();
  ctx.stroke(); ctx.fill();
  ctx.restore();
}

/** 모래폭풍 (아람 황무지): the light closes in and opens again while it lasts. */
function drawStorm(ctx, cv) {
  const G = A.G(), g = G.hunt && G.hunt.goal;
  if (!g || g.mode !== 'storm' || g.over) return;
  const k = 0.35 + 0.15 * Math.sin(G.t * 0.9);
  const gr = ctx.createRadialGradient(cv.width / 2, cv.height / 2, cv.height * k * 0.6, cv.width / 2, cv.height / 2, cv.height * (k + 0.35));
  gr.addColorStop(0, 'rgba(150,110,50,0)');
  gr.addColorStop(1, 'rgba(150,110,50,0.88)');
  ctx.fillStyle = gr;
  ctx.fillRect(0, 0, cv.width, cv.height);
}

// ---------------- 부서지는 소품 (jars, barrels): broken by walking into them

function breakTick() {
  const G = A.G(), H = G.hunt, p = G.player;
  if (G.t - (H.brkT || 0) < 0.25) return;
  H.brkT = G.t;
  G.broken = G.broken || new Set();
  const list = A.propsNear(p.x, p.y);
  for (const b of list) {
    if (!/^(jar\d|field_barrel|house_barrel)$/.test(b.prop)) continue;
    const k = b.x + ',' + b.y;
    if (G.broken.has(k) || Math.hypot(b.x - p.x, b.y - p.y) > 30) continue;
    G.broken.add(k);
    const r = Math.random();
    const more = H.paths.treasure ? 2 : 1;
    for (let i = 0; i < more; i++) G.drops.push({ x: b.x + i * 12, y: b.y, kind: r < 0.25 ? 'heal' : 'coin' });
    if (A.M().fx.h_kill) A.addFx('h_kill', b.x, b.y - 12, { scale: 0.5 });
    note('break');
  }
}

// ------------------------------------------------------------------ 실제 지도 전장 (P4)
//
// A ground with an arena (tools/yeon_grounds.py arena → assets/yhunt/, manifest yhunt) is fought on
// 연's own map of it, bounded: its walls, cliffs, bridges and lava hold the hero and the monsters
// (the wars' walk grid). The monsters find the hero by a flow field (a breadth-first search from
// the hero's tile, again only when that tile changes), are born on open tiles the hero can reach,
// and the camera stops at the map's edge.

const arenaBms = new Map();
function arenaStart(G) {
  const M = A.M(), map = M.yhunt && M.yhunt[G.stage.id];
  if (!map || A.settings().arena === false || (window.__dbgHunt && window.__dbgHunt.noarena)) return;
  const walk = new Uint8Array(map.cols * map.rows);
  map.walk.forEach((row, y) => { for (let x = 0; x < map.cols; x++) walk[y * map.cols + x] = row[x] === '.' ? 1 : 0; });
  G.arena = { id: G.stage.id, map, walk, flow: new Int16Array(map.cols * map.rows), at: -1 };
  // The pieces as decoded bitmaps, kept for the hunt (drawn from an <img> a piece was decoded
  // again whenever the browser had let it go: a long frame on a slow phone, as the wars found).
  for (const [k, bm] of arenaBms) if (!k.startsWith(`yhunt/${G.stage.id}_`)) { if (bm.close) bm.close(); arenaBms.delete(k); }
  for (let cy = 0; cy * map.chunk < map.h; cy++)
    for (let cx = 0; cx * map.chunk < map.w; cx++) {
      const path = `yhunt/${G.stage.id}_${cx}_${cy}.png`;
      if (arenaBms.has(path)) continue;
      Promise.resolve(A.images[path] || A.loadImage(path)).then(im => (im && im.width && window.createImageBitmap ? createImageBitmap(im) : null))
        .then(bm => { if (bm) arenaBms.set(path, bm); }).catch(() => {});
    }
  const p = G.player, [sx, sy] = map.start;
  p.x = sx * A.TILE + A.TILE / 2;
  p.y = sy * A.TILE + A.TILE - 6;
  A.heroTile();
}

function open(tx, ty) {
  const R = A.G().arena;
  if (!R) return true;
  const m = R.map;
  return tx >= 0 && ty >= 0 && tx < m.cols && ty < m.rows && R.walk[ty * m.cols + tx] === 1;
}

/** The flow field to the hero, made again when the hero's tile changes. */
function flowFresh() {
  const G = A.G(), R = G.arena, m = R.map, p = G.player;
  const k = p.ty * m.cols + p.tx;
  if (R.at === k) return R.flow;
  R.at = k;
  const f = R.flow;
  f.fill(-1);
  // (A hero pressed onto a closed tile: the search starts from the open ones round it.)
  const q = new Int32Array(m.cols * m.rows);
  let h = 0, n = 0;
  for (let r = 0; r <= 3 && !n; r++)
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || !open(p.tx + dx, p.ty + dy)) continue;
      const c = (p.ty + dy) * m.cols + p.tx + dx;
      if (f[c] < 0) { f[c] = r; q[n++] = c; }
    }
  while (h < n) {
    const c = q[h++], x = c % m.cols, y = (c - x) / m.cols, d = f[c] + 1;
    if (x > 0 && f[c - 1] < 0 && R.walk[c - 1]) { f[c - 1] = d; q[n++] = c - 1; }
    if (x < m.cols - 1 && f[c + 1] < 0 && R.walk[c + 1]) { f[c + 1] = d; q[n++] = c + 1; }
    if (y > 0 && f[c - m.cols] < 0 && R.walk[c - m.cols]) { f[c - m.cols] = d; q[n++] = c - m.cols; }
    if (y < m.rows - 1 && f[c + m.cols] < 0 && R.walk[c + m.cols]) { f[c + m.cols] = d; q[n++] = c + m.cols; }
  }
  return f;
}

function flowAt(tx, ty) {
  const R = A.G().arena;
  if (!open(tx, ty)) return -1;
  return flowFresh()[ty * R.map.cols + tx];
}

/** Toward the hero by the flow: the neighbours nearer, best first (null: not toward the hero). */
const DIR4 = [[0, 1], [-1, 0], [1, 0], [0, -1]];
function flowDirs(b, tx, ty) {
  const G = A.G();
  if (!G.arena || tx !== G.player.tx || ty !== G.player.ty) return null;
  const here = flowAt(b.tx, b.ty);
  if (here < 0) return null;
  const out = [];
  for (const [dx, dy] of DIR4) {
    const d = flowAt(b.tx + dx, b.ty + dy);
    if (d >= 0 && d < here) out.push([dx, dy, d]);
  }
  out.sort((a, c) => a[2] - c[2]);
  return out.map(([dx, dy]) => [dx, dy]);
}

/** A tile a monster may be born on: open, and within 25 steps of the hero. */
function reach(tx, ty) {
  const d = flowAt(tx, ty);
  return d >= 0 && d <= 25;
}

/** When the screen's rim is all wall: an open tile 7 to 18 steps away. */
function spawnTile() {
  const G = A.G(), R = G.arena, m = R.map, f = flowFresh();
  const at = c => { const x = c % m.cols; return [x, (c - x) / m.cols]; };
  for (let i = 0; i < 60; i++) {
    const c = Math.floor(Math.random() * m.cols * m.rows);
    if (f[c] >= 7 && f[c] <= 18 && A.free(...at(c))) return at(c);
  }
  // Few such tiles (a small deck): any free one the hero can reach, nearest past three steps.
  let best = -1;
  for (let c = 0; c < f.length; c++) if (f[c] >= 3 && (best < 0 || Math.abs(f[c] - 9) < Math.abs(f[best] - 9)) && A.free(...at(c))) best = c;
  return best >= 0 ? at(best) : null;
}

/** The camera held inside the map. */
function cam(camX, camY) {
  const G = A.G(), R = G.arena, VW = A.VW(), VH = A.VH();
  if (!R) return [camX, camY];
  const m = R.map;
  return [m.w <= VW ? Math.round((m.w - VW) / 2) : Math.max(0, Math.min(m.w - VW, camX)),
    m.h <= VH ? Math.round((m.h - VH) / 2) : Math.max(0, Math.min(m.h - VH, camY))];
}

function drawMap(ctx, camX, camY) {
  const G = A.G(), R = G.arena, m = R.map, c = m.chunk;
  // Into the ground's buffer (game.js drawGroundCached): painted again only as the view leaves it.
  A.drawGroundCached(`hunt:${R.id}`, camX, camY, (g, x0, y0, VW, VH) => {
    let ok = true;
    for (let cy = Math.max(0, Math.floor(y0 / c)); cy * c < Math.min(m.h, y0 + VH); cy++)
      for (let cx = Math.max(0, Math.floor(x0 / c)); cx * c < Math.min(m.w, x0 + VW); cx++) {
        const path = `yhunt/${R.id}_${cx}_${cy}.png`, im = arenaBms.get(path) || A.images[path];
        if (!im || !im.width) { ok = false; continue; }
        const sx = Math.max(0, Math.floor(x0 - cx * c)), sy = Math.max(0, Math.floor(y0 - cy * c));
        const sw = Math.min(im.width - sx, Math.ceil(x0 + VW - cx * c - sx) + 1), sh = Math.min(im.height - sy, Math.ceil(y0 + VH - cy * c - sy) + 1);
        if (sw > 0 && sh > 0) g.drawImage(im, sx, sy, sw, sh, cx * c + sx, cy * c + sy, sw, sh);
      }
    return ok;
  });
  if (window.__dbgHunt && window.__dbgHunt.walls) {
    const VW = A.VW(), VH = A.VH();
    ctx.fillStyle = 'rgba(255,0,0,0.3)';
    for (let y = Math.max(0, Math.floor(camY / A.TILE)); y * A.TILE < camY + VH && y < m.rows; y++)
      for (let x = Math.max(0, Math.floor(camX / A.TILE)); x * A.TILE < camX + VW && x < m.cols; x++)
        if (!R.walk[y * m.cols + x]) ctx.fillRect(x * A.TILE, y * A.TILE, A.TILE, A.TILE);
  }
}

/** Monsters stuck in place five seconds (walled off): moved to an open tile near the hero. */
function unstick() {
  const G = A.G(), R = G.arena;
  if (!R || G.t - (R.stuckT || 0) < 1) return;
  R.stuckT = G.t;
  let stuck = 0;
  for (const e of G.enemies) {
    if (e.kind === 'boss' || e.goal) continue;
    const k = e.tx * 4096 + e.ty;
    if (e.lastK !== k) { e.lastK = k; e.lastKt = G.t; continue; }
    if (G.t - e.lastKt < 5 || flowAt(e.tx, e.ty) <= 1) continue;
    stuck++;
    const at = spawnTile();
    if (at) { A.relocate(e, at); e.lastKt = G.t; }
  }
  R.stuck = (R.stuck || 0) + stuck;
}

// ------------------------------------------------------------------ 조명·분위기 (P5)
//
// Each group's light (the dark round the hero, with holes of light at the lit objectives and the
// hero), its colour, and its weather: 연's own particle pictures (FXs.unity3d: weather_snow,
// csg04_rain, bubble_blue, csg04_leaf, weather_tachukbo, fog3 → assets/yamb/, tools/yeon_grounds.py
// ambient) drifting over the field, or the abyss's embers (k_ab_embers). The dark is drawn at a
// fifth of the screen every third frame and stretched, as the abyss's is.

const AMBIENT = {
  cave: { light: 0.8 }, house: { light: 0.7 }, abyss: { light: 1 },
  plain: { light: 1, tint: 'rgba(255,170,90,0.07)', fx: 'dust' },
  snow: { light: 1, tint: 'rgba(225,238,255,0.10)', fx: 'snow' },
  sea: { light: 0.85, tint: 'rgba(30,150,170,0.12)', fx: 'bubble' },
  isle: { light: 0.95, tint: 'rgba(90,200,80,0.06)', fx: 'leaf' },
  hell: { light: 0.75, tint: 'rgba(230,50,20,0.12)', fx: 'embers', edge: 'rgba(200,30,0,0.35)' },
  sky: { light: 0.9, tint: 'rgba(255,140,40,0.10)', fx: 'leaf' },
};
const AMBIENT_GROUND = {
  haunt: { light: 0.6 }, skull: { light: 0.6 }, fox: { light: 0.6 }, volcano: { fx: 'embers', light: 0.8, tint: 'rgba(230,70,20,0.10)' },
  haya: { fx: 'embers' }, hanbing: { fx: 'snow', tint: 'rgba(200,225,255,0.14)' }, jagwi: { fx: 'rain', light: 0.8 }, lobi: { fx: 'rain' },
  aram: { fx: 'dust' }, wolf: { light: 0.65, fx: null }, deepsea: { light: 0.7 }, tagye: { light: 0.65 }, yogoe: { light: 0.7 },
  musin: { light: 0.85 }, royal: { light: 0.9 }, murim: { light: 0.95 }, novice: { light: 1 }, japan: { fx: 'leaf' },
};
const AMB_PIC = { snow: 'weather_snow', rain: 'csg04_rain', dust: 'weather_tachukbo', bubble: 'bubble_blue', leaf: 'csg04_leaf' };

function ambientOf(G) {
  const gr = ground(G).group;
  return { ...(AMBIENT[gr] || { light: 1 }), ...(AMBIENT_GROUND[G.stage.id] || {}) };
}

let shade = null, shadeN = 0, shadeBig = null;
const patterns = {};

function ambPic(name) {
  const im = A.images[`yamb/${name}.png`];
  return im && im.width ? im : null;
}

/** The light and the weather, over the field and under the screen's own marks. */
function ambient(ctx, cv, camX, camY) {
  const G = A.G();
  if (!G.hunt || G.stage.abyss || (window.__dbgHunt && window.__dbgHunt.noamb)) return;
  const am = G.hunt.amb || (G.hunt.amb = ambientOf(G));
  const Z = A.Z(), p = G.player, t = G.t;
  // The weather layer: a tile of 연's particles scrolled over the screen.
  const name = AMB_PIC[am.fx];
  if (name && (am.fx === 'snow' || am.fx === 'rain' || am.fx === 'dust')) {
    const im = ambPic(name);
    if (im) {
      const pat = patterns[name] || (patterns[name] = ctx.createPattern(im, 'repeat'));
      const v = am.fx === 'rain' ? [-40, 520] : am.fx === 'snow' ? [18, 46] : [70, 8];
      const ox = ((camX * Z * 0.6 + t * v[0]) % im.width + im.width) % im.width, oy = ((camY * Z * 0.6 + t * v[1]) % im.height + im.height) % im.height;
      ctx.save();
      ctx.globalAlpha = am.fx === 'dust' ? 0.55 : am.fx === 'rain' ? 0.5 : 0.75;
      ctx.globalCompositeOperation = 'lighter';
      ctx.translate(-ox, -oy);
      ctx.fillStyle = pat;
      ctx.fillRect(0, 0, cv.width + im.width, cv.height + im.height);
      ctx.restore();
    }
  } else if (am.fx === 'bubble' || am.fx === 'leaf') {
    // A few drifting pieces: bubbles rising, leaves falling across.
    const im = ambPic(name);
    if (im) {
      const n = 9;
      ctx.save();
      ctx.globalAlpha = 0.7;
      for (let i = 0; i < n; i++) {
        const seed = i * 97.3, sp = am.fx === 'bubble' ? -28 - (i % 3) * 9 : 26 + (i % 4) * 7;
        const x = ((seed * 37 + t * (am.fx === 'leaf' ? 22 : 4) + Math.sin(t * 0.8 + i) * 18) % cv.width + cv.width) % cv.width;
        const y = ((seed * 53 + t * sp * Z / 3) % cv.height + cv.height) % cv.height;
        if (am.fx === 'bubble') { const s = (10 + (i % 3) * 5) * Z / 3; ctx.drawImage(im, x, y, s, s); }
        else { const f = i % 8, fx = (f % 4) * 32, fy = Math.floor(f / 4) * 32, s = 14 * Z / 3; ctx.drawImage(im, fx, fy, 32, 32, x, y, s, s); }
      }
      ctx.restore();
    }
  } else if (am.fx === 'embers' && A.M().fx.k_ab_embers && t - (G.hunt.embT || 0) > 0.35 && A.fxBudget('amb', 4)) {
    G.hunt.embT = t;
    A.addFx('k_ab_embers', p.x + (Math.random() - 0.5) * A.VW(), p.y + (Math.random() - 0.5) * A.VH(), { scale: 0.8 });
  }
  // The colour, the dark with its holes of light and the edge: drawn together at a fifth of the
  // screen every third frame, one stretched picture a frame (each full-screen fill costs a phone).
  const dark = 1 - (am.light ?? 1);
  if (dark <= 0.02 && !am.tint && !am.edge) return;
  const q = 5, w = Math.ceil(cv.width / q), h = Math.ceil(cv.height / q);
  if (!shade || shade.width !== w || shade.height !== h) { shade = document.createElement('canvas'); shade.width = w; shade.height = h; shadeN = 0; }
  const D = window.__dbgHunt || {};
  if (!shadeBig || shadeBig.width !== cv.width || shadeBig.height !== cv.height) {
    shadeBig = document.createElement('canvas');
    shadeBig.width = cv.width;
    shadeBig.height = cv.height;
    shadeN = 0;
  }
  if (shadeN++ % 3 === 0) {
    const g = shade.getContext('2d');
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, w, h);
    if (dark > 0.02) {
      g.fillStyle = `rgba(0,0,0,${Math.min(0.85, dark * 1.6)})`;
      g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = 'destination-out';
      const hole = (x, y, r) => {
        const gr = g.createRadialGradient(x, y, r * 0.25, x, y, r);
        gr.addColorStop(0, 'rgba(0,0,0,1)');
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr;
        g.fillRect(x - r, y - r, 2 * r, 2 * r);
      };
      const sx = x => (x - camX) * Z / q, sy = y => (y - camY) * Z / q;
      hole(sx(p.x), sy(p.y - 22), h * 0.62);
      const gl = G.hunt.goal, T = A.TILE;
      for (const l of (gl && gl.lit) || []) hole(sx(l[0] * T + T / 2), sy(l[1] * T + T / 2), h * 0.3);
      if (gl && (gl.kind === 'survive' || gl.kind === 'defend')) for (const it of gl.items) hole(sx(it.at[0] * T + T / 2), sy(it.at[1] * T + T / 2), h * 0.28);
      g.globalCompositeOperation = 'source-over';
    }
    if (am.tint) { g.fillStyle = am.tint; g.fillRect(0, 0, w, h); }
    if (am.edge) {
      const gr = g.createRadialGradient(w / 2, h / 2, h * 0.45, w / 2, h / 2, Math.hypot(w, h) / 2);
      gr.addColorStop(0, 'rgba(0,0,0,0)');
      gr.addColorStop(1, am.edge);
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
    }
    // Stretched to the screen's size here, once in three frames; each frame copies it as it is
    // (a stretch with smoothing over the whole screen every frame cost as much as the ground).
    const b = shadeBig.getContext('2d');
    b.clearRect(0, 0, cv.width, cv.height);
    b.imageSmoothingEnabled = !D.shadeNN;
    b.imageSmoothingQuality = 'low';
    b.drawImage(shade, 0, 0, cv.width, cv.height);
  }
  if (D.noshade) return;
  ctx.drawImage(shadeBig, 0, 0);
}

/** The weather's pictures, asked for at the start of a hunt. */
function ambientLoad(G) {
  const am = ambientOf(G), name = AMB_PIC[am.fx];
  if (name && (A.M().yamb || []).includes(name) && !A.images[`yamb/${name}.png`]) A.loadImage(`yamb/${name}.png`);
}

// ------------------------------------------------------------------ 반복 판 (P6)
//
// A ground conquered before can be entered three ways (the stage card's buttons): 정복 (the three
// acts; 숙련 ★ counted), 보스 직행 (the class's recorded build, as a raid starts; the gauge at 70%,
// one step of the objective; no experience: 90~120 s), 소탕 (no boss: two and a half minutes of
// the fullest field, champions every half minute, materials ×1.5 and specials ×1.3).

export const MODES = {
  conquer: { name: '정복', desc: '세 막 · 숙련 ★' },
  rush: { name: '보스 직행', desc: '기록 빌드로 · 토벌도 70%에서' },
  sweep: { name: '소탕', desc: '보스 없이 2:30 · 재료 ×1.5' },
};

function starTotal() {
  return Object.values(A.progress().mastery || {}).reduce((a, n) => a + n, 0);
}

function modeStart(G) {
  const H = G.hunt, mode = (A.mode && A.mode()) || 'conquer';
  const done = !!A.progress().cleared[G.stage.id];
  H.mode = done ? mode : 'conquer';
  if (H.mode === 'rush') {
    const p = G.player, start = A.raidStart(A.best()[G.cls.id]);
    p.lvl = start;
    p.next = A.xpFor(start);
    G.pendingLevels = 0;
    G.firstCard = false;
    A.applyBuild(start);
    H.prog = 0.7;
    H.act = 2;
    H.intro = true;
    H.asked = 2;
    H.floor0 = -64;
    H.maxBoss = 75;
    H.rushGoal = 3;
    G.plainDropAt = Infinity;
  }
}

/** 소탕: the run as 계속 사냥 runs, for two and a half minutes. */
function sweep(G, from = G.t) {
  G.endless = true;
  G.clearT = from;
  G.endEnd = from + 150;
  G.endlessChamp = from + 30;
  if (G.hunt) G.hunt.mode = 'sweep';
}

/** 소탕's richer spoils, on a kill. */
function sweepKill(e) {
  const G = A.G();
  if (!G.endEnd) return;
  if (e.kind && Math.random() < 0.5) A.rollMats(e);
  if (Math.random() < 0.3) A.rollSpecial(e);
}

// ------------------------------------------------------------------

export function initHunt(api) {
  A = api;
  const H = {
    start, note, on, clock, tough, xpK, spawn, kill, hurt, takeK, cleared, stops, cardBonus, stepK, clockText,
    hud(ctx, cv) { drawStorm(ctx, cv); hud(ctx, cv); hud2(ctx, cv); drawGoalHud(ctx, cv); drawWave(ctx, cv); },
    ground: drawGoal, move, hurtBy, GROUNDS, GROUPS, groundOf: ground,
    open, cam, drawMap, flowDirs, reach, spawnTile, ambient, sweep, sweepKill, MODES, starTotal,
    world, speedK, cdK, tryExecute, react, elemOf, dash, cancel, chainPower, hurtTaken, grade, trainTried, firstPicks,
    tick(dt) { tick(dt); },
    PACE, PATHS,
  };
  window.__pace = () => { const G = A.G(); return G && G.pace; };
  window.__hunt = () => { const G = A.G(); return G && G.hunt; };
  window.__dash = () => dash();
  window.__huntGoal = () => goalSpot();
  window.__huntPick = k => choicePick(k, true);
  window.__hazard = k => hazard(k);
  window.__arena = () => { const G = A.G(); return G && G.arena && { id: G.arena.id, stuck: G.arena.stuck || 0, cols: G.arena.map.cols, rows: G.arena.map.rows }; };
  window.__momentum = () => { const G = A.G(); return G && G.momentum; };
  return H;
}
