import {
  CLASSES, SKILLS, PASSIVES, STAGES, MAX_SKILLS, MAX_SKILL_LEVEL, STAGE_SECONDS, BOSS_AT, MINI_AT, FX,
  skillStats, skillName, levelText,
} from './data.js';
import { Audio } from './audio.js';

const $ = s => document.querySelector(s);
const canvas = $('#game');
const ctx = canvas.getContext('2d');

let M; // assets/manifest.json
let audio;
const images = {};
const whiteCache = new Map();
let Z = 3; // screen pixels per game pixel
let VW = 320, VH = 180; // view size in game pixels
let G = null; // the hunt being played
let chosenClass = null;
let settings = loadJson('bs_settings', { bgm: true, sfx: true, numbers: true });
let best = loadJson('bs_best', {});
let progress = loadJson('bs_progress', { cleared: {} });
// ?speed=N runs the game N times as fast, ?all opens every hunting ground (for trying things out).
const QUERY = new URLSearchParams(location.search);
const TEST_SPEED = Math.max(1, Math.min(16, Number(QUERY.get('speed')) || 1));

// ---------------------------------------------------------------- loading

function loadJson(key, dflt) {
  try {
    return Object.assign(dflt, JSON.parse(localStorage.getItem(key) || '{}'));
  } catch (e) {
    return dflt;
  }
}

function saveJson(key, v) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch (e) { /* private mode: records just are not kept */ }
}

function loadImage(path) {
  return new Promise(resolve => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => resolve(null);
    im.src = 'assets/' + path;
    images[path] = im;
  });
}

const monsterById = {};

async function boot() {
  M = await (await fetch('assets/manifest.json')).json();
  // The pixel fonts, before anything is written on the canvas with them.
  await Promise.all(['12px G11', 'bold 12px G11', '10px G9', '8px G7'].map(f => document.fonts.load(f).catch(() => {})));
  audio = new Audio(M.audio);
  audio.setBgm(settings.bgm);
  audio.setSfx(settings.sfx);
  const paths = [
    ...Object.keys(M.fx).map(id => `fx/${id}.png`),
    ...Object.keys(M.fx).map(id => `icon/${id}.png`),
    ...M.heroes.map(h => `hero/${h.id}.png`),
    ...Object.values(M.items).map(i => `item/${i.id}.png`),
    ...M.monsters.map(m => `mon/${m.id}.png`),
  ];
  let done = 0;
  const bar = $('#load-bar');
  await Promise.all(paths.map(p => loadImage(p).then(() => {
    bar.style.width = (100 * ++done / paths.length) + '%';
  })));
  for (const m of M.monsters) {
    const img = images[`mon/${m.id}.png`];
    if (img && img.width) monsterById[m.id] = { ...m, area: m.w * m.h, img };
  }
  $('#loading').hidden = true;
  resize();
  menuGround = makeGround('field');
  $('#heroes').innerHTML = CLASSES.map(c => `<img src="assets/hero/${c.hero}.png" alt="${c.name}">`).join('');
  showScreen('title');
  requestAnimationFrame(frame);
}

/** The monsters of a hunting ground, weakest first, with its boss and middle boss. */
function stageMonsters(stage) {
  let list;
  if (stage.monsters) list = stage.monsters.map(id => monsterById[id]).filter(Boolean);
  else list = Object.values(monsterById).filter(m => m.pages.some(p => stage.pages.includes(p)));
  list = list.slice().sort((a, b) => a.area - b.area);
  let boss, mini;
  if (stage.boss) boss = { m: monsterById[stage.boss.id], name: stage.boss.name, scale: stage.boss.scale || 1.4 };
  if (stage.mini) mini = { m: monsterById[stage.mini.id], name: stage.mini.name, scale: stage.mini.scale || 1.2 };
  // Grounds known only by their page: the biggest monsters lead.
  if (!boss) boss = { m: list[list.length - 1], name: stage.name + '의 주인', scale: 1.3 };
  if (!mini) mini = { m: list[Math.max(0, list.length - 2)], name: stage.name + ' 우두머리', scale: 1.2 };
  let pool = list.filter(m => m.area <= 5200 && m.h <= 100 && m !== boss.m);
  if (pool.length < 3) pool = list.filter(m => m !== boss.m);
  if (!pool.length) pool = list;
  pool.forEach((m, i) => { m.rank = i / Math.max(1, pool.length - 1); });
  return { pool, boss, mini };
}

// ---------------------------------------------------------------- ground

let menuGround;

/** A ground pattern for a terrain kind, drawn once per hunt. */
function makeGround(kind) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const blot = (color, n, rmin, rmax, flat = 0.6) => {
    g.fillStyle = color;
    for (let i = 0; i < n; i++) {
      const x = rnd() * 256, y = rnd() * 256, r = rmin + rnd() * (rmax - rmin);
      for (const [dx, dy] of [[0, 0], [256, 0], [0, 256], [256, 256], [-256, 0], [0, -256], [-256, -256]]) {
        g.beginPath();
        g.ellipse(x + dx, y + dy, r, r * flat, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
  };
  const specks = (colors, n, w = 1, h = 2) => {
    for (let i = 0; i < n; i++) {
      g.fillStyle = colors[i % colors.length];
      g.fillRect(Math.floor(rnd() * 256), Math.floor(rnd() * 256), w, h);
    }
  };
  const stones = (light, dark, n) => {
    for (let i = 0; i < n; i++) {
      const x = Math.floor(rnd() * 248), y = Math.floor(rnd() * 248), w = 2 + Math.floor(rnd() * 4);
      g.fillStyle = light;
      g.fillRect(x, y, w, 2);
      g.fillStyle = dark;
      g.fillRect(x, y + 2, w, 1);
    }
  };
  switch (kind) {
    case 'field':
    case 'field2': {
      const [base, a, b] = kind === 'field' ? ['#5d7a3a', '#557236', '#668443'] : ['#7f8a4c', '#747f44', '#8a9656'];
      g.fillStyle = base;
      g.fillRect(0, 0, 256, 256);
      blot(a, 35, 6, 22);
      blot(b, 35, 6, 18);
      specks(['#7a9a4c', '#4b6630', '#86a85a'], 280);
      specks(['#e8d36a', '#f2f2f2', '#d9604a'], 18, 1, 1);
      stones('#8b8a74', '#6b6a58', 8);
      break;
    }
    case 'cave':
      g.fillStyle = '#5a4632';
      g.fillRect(0, 0, 256, 256);
      blot('#4e3c2a', 40, 6, 24);
      blot('#685140', 30, 4, 14);
      specks(['#3e2f20', '#7a6148'], 260);
      stones('#8d7b66', '#3a2c1e', 22);
      g.strokeStyle = 'rgba(40,28,18,0.7)';
      for (let i = 0; i < 8; i++) {
        let x = rnd() * 256, y = rnd() * 256;
        g.beginPath();
        g.moveTo(x, y);
        for (let k = 0; k < 4; k++) g.lineTo(x += rnd() * 16 - 8, y += rnd() * 10);
        g.stroke();
      }
      break;
    case 'house':
      for (let y = 0; y < 256; y += 16) {
        g.fillStyle = (y / 16) % 2 ? '#5b3d24' : '#634329';
        g.fillRect(0, y, 256, 16);
        g.fillStyle = '#3b2615';
        g.fillRect(0, y + 15, 256, 1);
        const off = ((y / 16) % 2) * 40;
        for (let x = off; x < 256 + 80; x += 80) {
          g.fillRect(x % 256, y, 1, 15);
          g.fillStyle = '#2c1c10';
          g.fillRect((x + 4) % 256, y + 7, 1, 1);
          g.fillStyle = '#3b2615';
        }
      }
      specks(['#4a3020', '#70503a'], 200, 2, 1);
      blot('rgba(20,10,5,0.25)', 12, 10, 30);
      break;
    case 'sea':
      g.fillStyle = '#2f5560';
      g.fillRect(0, 0, 256, 256);
      blot('#3d6a6a', 30, 8, 26);
      blot('#284a54', 25, 6, 18);
      specks(['#4f8a6a', '#2f6a4a'], 90, 1, 3);
      specks(['#9fd0d8'], 30, 1, 1);
      stones('#6a8a8a', '#203a40', 12);
      break;
    case 'island':
      g.fillStyle = '#d8c48a';
      g.fillRect(0, 0, 256, 256);
      blot('#cdb87c', 30, 6, 20);
      blot('#7aa04a', 16, 10, 28);
      blot('#6a9040', 12, 6, 16);
      specks(['#b8a46a', '#e8d8a0'], 200);
      stones('#a0a090', '#706a5a', 10);
      break;
    case 'lava':
      g.fillStyle = '#3a2a24';
      g.fillRect(0, 0, 256, 256);
      blot('#2e201b', 40, 6, 22);
      g.strokeStyle = '#d24a1a';
      g.lineWidth = 1.5;
      for (let i = 0; i < 10; i++) {
        let x = rnd() * 256, y = rnd() * 256;
        g.beginPath();
        g.moveTo(x, y);
        for (let k = 0; k < 5; k++) g.lineTo(x += rnd() * 20 - 10, y += rnd() * 14 - 4);
        g.stroke();
      }
      specks(['#ff8a2a', '#5a3a30'], 80, 1, 1);
      stones('#5a4a44', '#1e1410', 14);
      break;
  }
  return ctx.createPattern(c, 'repeat');
}

const DARK = { cave: 0.55, house: 0.6, sea: 0.45, lava: 0.35 };

function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(innerHeight * dpr);
  Z = Math.max(1, Math.round(canvas.height / 300));
  VW = canvas.width / Z;
  VH = canvas.height / Z;
}
addEventListener('resize', () => {
  resize();
  if (G) G.ground = makeGround(G.stage.terrain);
  menuGround = makeGround('field');
});

// ---------------------------------------------------------------- screens

function showScreen(name) {
  for (const el of document.querySelectorAll('.screen')) el.hidden = el.id !== name;
  $('#pause-btn').hidden = name !== null;
  $('#ult').hidden = name !== null;
  if (name === 'title') audio.bgm('title');
  if (name === 'select') buildSelect();
  if (name === 'stages') buildStages();
}

function buildSelect() {
  const box = $('#classes');
  box.innerHTML = '';
  for (const c of CLASSES) {
    const b = document.createElement('button');
    b.className = 'card';
    const rec = best[c.id];
    b.innerHTML = `<div class="slot"><img class="hero" src="assets/hero/${c.hero}.png" alt=""></div>
      <b>${c.name}</b><span>${c.desc}</span>
      <em>${SKILLS[c.start].name} · 필살기 ${SKILLS[c.ult].name}</em>
      <small>${rec ? `최고 Lv ${rec.lvl} · ${rec.kills}마리` : '기록 없음'}</small>`;
    b.onclick = () => {
      chosenClass = c;
      showScreen('stages');
    };
    box.append(b);
  }
}

function unlocked(i) {
  return QUERY.has('all') || i === 0 || !!progress.cleared[STAGES[i - 1].id];
}

let mapTab = 'world_1';
let pickedStage = null;

function buildStages() {
  if (!pickedStage) {
    // The furthest open ground.
    let i = 0;
    while (i + 1 < STAGES.length && unlocked(i + 1)) i++;
    pickedStage = STAGES[i];
    mapTab = pickedStage.map;
  }
  for (const b of document.querySelectorAll('#map-tabs button')) b.classList.toggle('on', b.dataset.map === mapTab);
  const map = $('#map');
  map.innerHTML = `<img src="assets/ui/${mapTab}.webp" alt="">`;
  STAGES.forEach((s, i) => {
    if (s.map !== mapTab) return;
    const b = document.createElement('button');
    b.className = 'pin' + (unlocked(i) ? '' : ' locked') + (progress.cleared[s.id] ? ' cleared' : '')
      + (s === pickedStage ? ' on' : '');
    b.style.left = s.at[0] * 100 + '%';
    b.style.top = s.at[1] * 100 + '%';
    b.innerHTML = `<i></i><span>${s.name}</span>`;
    b.onclick = () => {
      pickedStage = s;
      buildStages();
    };
    map.append(b);
  });
  const s = pickedStage, i = STAGES.indexOf(s), open = unlocked(i);
  const { pool, boss } = stageMonsters(s);
  const show = [pool[0], pool[Math.floor(pool.length / 2)], pool[pool.length - 1]].filter((m, k, a) => m && a.indexOf(m) === k);
  $('#stage-info').innerHTML = `<h3>${s.name}</h3><div class="lv">적정 레벨 ${s.lv}</div>
    <p>${s.intro}</p>
    <div class="mons">${show.map(m => `<img src="assets/mon/${m.id}.png" alt="">`).join('')}</div>
    <div class="boss">보스: <b>${boss.name}</b></div>
    <div class="state${progress.cleared[s.id] ? ' done' : ''}">${progress.cleared[s.id] ? '정복한 사냥터'
      : open ? '아직 정복하지 못한 사냥터' : '앞 사냥터의 보스를 쓰러뜨리면 열린다'}</div>`;
  $('#go').disabled = !open;
  $('#go').textContent = `${josa(chosenClass.name, '으로', '로')} 입장`;
}

for (const b of document.querySelectorAll('#map-tabs button')) {
  b.onclick = () => {
    mapTab = b.dataset.map;
    pickedStage = STAGES.find((s, i) => s.map === mapTab && unlocked(i) && !progress.cleared[s.id])
      || STAGES.find(s => s.map === mapTab);
    buildStages();
  };
}

// ---------------------------------------------------------------- the hunt

function startRun(cls, stage) {
  const hero = M.heroes.find(h => h.id === cls.hero);
  const mons = stageMonsters(stage);
  G = {
    cls, stage, ...mons, level: STAGES.indexOf(stage), ground: makeGround(stage.terrain),
    t: 0, kills: 0, gold: 0, over: false, dead: false, paused: false, choosing: false, cleared: false, revived: false,
    player: {
      x: 0, y: 0, hp: cls.hp, maxHp: cls.hp, mp: cls.mp * 0.5, maxMp: cls.mp, speed: cls.speed, armor: cls.armor,
      face: 1, mx: 1, my: 0, moving: false, inv: 0, lvl: 1, xp: 0, next: xpFor(1), walk: 0,
      img: images[`hero/${hero.id}.png`], r: 7,
    },
    skills: [], passives: Object.fromEntries(Object.keys(PASSIVES).map(k => [k, 0])),
    buffs: { power: 0, stealth: 0, guard: 0, shield: 0 },
    enemies: [], dying: [], projs: [], hazards: [], allies: [], fxs: [], gems: [], drops: [], texts: [], log: [],
    bubble: null, spawnT: 0, waveT: 50, minis: MINI_AT.slice(), bossDue: true, pendingLevels: 0, shake: 0,
  };
  addSkill(cls.start);
  showScreen(null);
  audio.bgm('battle');
  say(`${stage.name}에 들어왔습니다.`, '#fff4d6');
  say(stage.intro, '#c8e0ff');
}

function xpFor(lvl) {
  return Math.floor(3 + lvl * 2.5 + Math.pow(lvl, 1.55));
}

function addSkill(id) {
  const have = G.skills.find(s => s.id === id);
  if (have) have.lv++;
  else G.skills.push({ id, lv: 1, timer: 0.3 });
}

function stats(skill) {
  return skillStats(skill.id, skill.lv, G.passives);
}

/** The hero's damage multiplier right now. */
function might() {
  let k = 1;
  if (G.buffs.power > G.t) k *= 1 + (G.buffs.powerK || 0.5);
  if (G.buffs.stealth > G.t) k *= 3;
  return k;
}

function frame(now) {
  const dt = Math.min(0.05, (now - (frame.last || now)) / 1000);
  frame.last = now;
  for (let i = 0; i < TEST_SPEED; i++) if (G && !G.paused && !G.choosing && !G.over) update(dt);
  render(now / 1000);
  syncUlt();
  requestAnimationFrame(frame);
}

function update(dt) {
  G.t += dt;
  const p = G.player;

  if (!G.dead) {
    const [ix, iy] = input();
    p.moving = ix !== 0 || iy !== 0;
    const spd = p.speed * (1 + 0.08 * G.passives.speed);
    p.x += ix * spd * dt;
    p.y += iy * spd * dt;
    if (ix) p.face = ix > 0 ? 1 : -1;
    if (p.moving) {
      const l = Math.hypot(ix, iy);
      p.mx = ix / l;
      p.my = iy / l;
      p.walk += dt * 9;
    }
    p.inv = Math.max(0, p.inv - dt);
    p.mp = Math.min(p.maxMp, p.mp + (p.maxMp / 45) * (1 + 0.25 * G.passives.mana) * dt);
  }
  G.shake = Math.max(0, G.shake - dt);

  spawn(dt);
  buildGrid();
  moveEnemies(dt);
  if (!G.dead) {
    for (const s of G.skills) {
      s.timer -= dt;
      if (s.timer <= 0) {
        const st = stats(s);
        s.timer += st.cd;
        if (s.timer < 0) s.timer = st.cd;
        cast(s, st);
      }
    }
  }
  runTimers();
  updateProjectiles(dt);
  updateHazards(dt);
  updateAllies(dt);
  if (!G.dead) updatePickups(dt);
  for (const f of G.fxs) f.t += dt;
  G.fxs = G.fxs.filter(f => f.t < f.life);
  for (const d of G.dying) d.t += dt;
  G.dying = G.dying.filter(d => d.t < 0.4);
  for (const t of G.texts) {
    t.t += dt;
    t.y -= 18 * dt;
  }
  G.texts = G.texts.filter(t => t.t < 0.6);
  if (G.bubble && G.t - G.bubble.t > 1.8) G.bubble = null;
}

// ---------------------------------------------------------------- monsters

function spawn(dt) {
  const t = G.t;
  const want = Math.min(230, 8 + t * 0.26 + (t > 300 ? 30 : 0) + (G.cleared ? 40 : 0));
  G.spawnT -= dt;
  if (G.spawnT <= 0 && G.enemies.length < want) {
    G.spawnT = Math.max(0.08, 0.9 - t / 400);
    const n = 1 + Math.floor(t / 120);
    for (let i = 0; i < n && G.enemies.length < want; i++) addEnemy(pickMonster(), ringPoint());
  }
  G.waveT -= dt;
  if (G.waveT <= 0) {
    // A pack of one kind closing in from all sides.
    G.waveT = 60;
    const m = pickMonster();
    const k = 14 + Math.floor(t / 40);
    for (let i = 0; i < k; i++) {
      const a = (i / k) * Math.PI * 2;
      const r = Math.hypot(VW, VH) / 2 + 20;
      addEnemy(m, { x: G.player.x + Math.cos(a) * r, y: G.player.y + Math.sin(a) * r });
    }
  }
  if (G.minis.length && t >= G.minis[0]) {
    G.minis.shift();
    addEnemy(G.mini.m, ringPoint(), 'mini', G.mini);
    say(`${josa(G.mini.name, '이', '가')} 나타났습니다!`, '#ffb060');
    banner(`${G.mini.name} 등장`);
  }
  if (G.bossDue && t >= BOSS_AT) {
    G.bossDue = false;
    addEnemy(G.boss.m, ringPoint(), 'boss', G.boss);
    audio.play('boss');
    audio.bgm('boss');
    G.shake = 0.6;
    say(`${josa(G.boss.name, '이', '가')} 나타났습니다!`, '#ff7070');
    banner(`보스 ${G.boss.name} 등장!`);
  }
}

function pickMonster() {
  const c = Math.min(1, G.t / (STAGE_SECONDS * 0.8));
  const r = Math.min(1, Math.max(0, c + (Math.random() - 0.7) * 0.5));
  return G.pool[Math.round(r * (G.pool.length - 1))];
}

function ringPoint() {
  const a = Math.random() * Math.PI * 2;
  const r = Math.hypot(VW, VH) / 2 + 16 + Math.random() * 40;
  return { x: G.player.x + Math.cos(a) * r, y: G.player.y + Math.sin(a) * r };
}

function addEnemy(m, at, kind = null, named = null) {
  const t = G.t;
  const tough = (1 + G.level * 0.15) * (1 + t / 150) * (G.cleared ? 1.5 : 1);
  const rank = kind ? 1 : m.rank;
  const scale = named ? named.scale : 1;
  let hp = (6 + m.area / 45) * tough;
  if (kind === 'mini') hp = (60 + m.area / 12) * tough * 2;
  if (kind === 'boss') hp = (150 + m.area / 6) * tough * 4;
  G.enemies.push({
    m, x: at.x, y: at.y, hp, maxHp: hp, kind, name: named && named.name, scale,
    spd: kind ? 30 : 24 + 30 * (1 - rank) + t / 60,
    dmg: (kind === 'boss' ? 14 : kind === 'mini' ? 10 : 3 + rank * 6) + t / 120 + G.level * 0.8,
    r: Math.max(5, Math.min(m.w, m.h) * scale * 0.32),
    xp: kind === 'boss' ? 60 : kind === 'mini' ? 20 : 1 + Math.floor(rank * 4 + t / 300),
    face: 1, flash: 0, slow: 0, stun: 0, curse: 0, kx: 0, ky: 0, phase: Math.random() * 6, hits: new Map(),
  });
}

let grid = new Map();
const CELL = 32;
function buildGrid() {
  grid = new Map();
  for (const e of G.enemies) {
    const k = ((e.x / CELL) | 0) * 73856093 ^ ((e.y / CELL) | 0) * 19349663;
    let a = grid.get(k);
    if (!a) grid.set(k, a = []);
    a.push(e);
  }
}

function near(x, y, r, fn) {
  const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL);
  const y0 = Math.floor((y - r) / CELL), y1 = Math.floor((y + r) / CELL);
  for (let cx = x0; cx <= x1; cx++) {
    for (let cy = y0; cy <= y1; cy++) {
      const a = grid.get((cx * 73856093) ^ (cy * 19349663));
      if (a) for (const e of a) if (e.hp > 0) fn(e);
    }
  }
}

function moveEnemies(dt) {
  const p = G.player;
  const far = Math.hypot(VW, VH) * 0.9;
  const hidden = G.buffs.stealth > G.t || G.dead;
  for (const e of G.enemies) {
    let dx = p.x - e.x, dy = p.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d > far && !e.kind) {
      // Left far behind: come back from ahead of the hero.
      const at = ringPoint();
      e.x = at.x;
      e.y = at.y;
      continue;
    }
    dx /= d;
    dy /= d;
    if (hidden) {
      // The hero cannot be seen: wander.
      dx = Math.cos(e.phase * 0.3);
      dy = Math.sin(e.phase * 0.23);
    }
    let sx = 0, sy = 0;
    near(e.x, e.y, e.r * 2, o => {
      if (o === e) return;
      const ox = e.x - o.x, oy = e.y - o.y, od = Math.hypot(ox, oy);
      const min = e.r + o.r;
      if (od > 0 && od < min) {
        sx += (ox / od) * (min - od);
        sy += (oy / od) * (min - od);
      }
    });
    e.slow = Math.max(0, e.slow - dt);
    e.stun = Math.max(0, e.stun - dt);
    e.curse = Math.max(0, e.curse - dt);
    const spd = e.stun > 0 ? 0 : e.spd * (e.slow > 0 ? 0.5 : 1) * (hidden ? 0.4 : 1);
    e.x += (dx * spd + e.kx) * dt + sx * 0.3;
    e.y += (dy * spd + e.ky) * dt + sy * 0.3;
    e.kx *= 0.85;
    e.ky *= 0.85;
    if (spd) e.face = dx >= 0 ? 1 : -1;
    if (spd) e.phase += dt * (4 + spd / 12);
    e.flash = Math.max(0, e.flash - dt);
    if (!hidden && d < e.r + p.r && p.inv <= 0 && e.stun <= 0) hurtPlayer(e.dmg);
  }
}

function hurtPlayer(dmg) {
  const p = G.player;
  if (G.buffs.guard > G.t) return;
  let taken = Math.max(1, dmg - p.armor - G.passives.armor);
  if (G.buffs.shield > G.t) taken = Math.max(1, taken / 2);
  p.hp -= taken;
  p.inv = 0.5;
  audio.play('hurt');
  floatText(p.x, p.y - 30, '-' + Math.round(taken), '#ff6060');
  if (p.hp <= 0) die();
}

function hurtEnemy(e, dmg, kx = 0, ky = 0) {
  if (e.hp <= 0) return 0;
  dmg *= (0.9 + Math.random() * 0.2) * might() * (e.curse > 0 ? 1.4 : 1);
  e.hp -= dmg;
  e.flash = 0.12;
  if (!e.kind) {
    e.kx += kx;
    e.ky += ky;
  }
  if (settings.numbers) floatText(e.x, e.y - e.m.h * e.scale, Math.round(dmg), '#fff');
  if (e.hp <= 0) killEnemy(e);
  else audio.play('hit');
  return dmg;
}

function killEnemy(e) {
  G.kills++;
  G.enemies.splice(G.enemies.indexOf(e), 1);
  G.dying.push({ e, t: 0 });
  addFx(FX.death, e.x, e.y - (e.m.h * e.scale) / 2, { scale: Math.min(1, e.m.w / 50) + 0.3 });
  audio.play('kill');
  const p = G.player;
  p.mp = Math.min(p.maxMp, p.mp + 0.6);
  G.gems.push({ x: e.x, y: e.y - 3, v: e.xp, fly: false });
  const roll = Math.random();
  if (e.kind) {
    G.drops.push({ x: e.x, y: e.y, kind: 'chest' });
    say(`${josa(e.name, '을', '를')} 쓰러뜨렸습니다!`, '#ffe08a');
    if (e.kind === 'boss') clearStage();
    else if (!G.enemies.some(o => o.kind === 'boss')) audio.bgm('battle');
  } else if (roll < 0.006) G.drops.push({ x: e.x, y: e.y, kind: 'heal' });
  else if (roll < 0.009) G.drops.push({ x: e.x, y: e.y, kind: 'magnet' });
  else if (roll < 0.04) G.drops.push({ x: e.x, y: e.y, kind: 'coin' });
  if (G.gems.length > 400) {
    // Too many on the ground: fold the oldest into the newest.
    const old = G.gems.shift();
    G.gems[G.gems.length - 1].v += old.v;
  }
}

function clearStage() {
  audio.bgm('battle');
  if (G.cleared) return;
  G.cleared = true;
  audio.play('win');
  progress.cleared[G.stage.id] = true;
  saveJson('bs_progress', progress);
  record();
  const next = STAGES[STAGES.indexOf(G.stage) + 1];
  say(`${josa(G.stage.name, '을', '를')} 정복했습니다!`, '#ffe08a');
  if (next) say(`이제 ${next.name}에 들어갈 수 있습니다.`, '#c8e0ff');
  banner(`${G.stage.name} 정복!`);
}

// ---------------------------------------------------------------- skills

function nearestEnemies(n, range = 260, from = G.player) {
  return G.enemies
    .map(e => [e, Math.hypot(e.x - from.x, e.y - from.y)])
    .filter(([, d]) => d < range)
    .sort((a, b) => a[1] - b[1])
    .slice(0, n)
    .map(([e]) => e);
}

function cast(skill, st) {
  const def = SKILLS[skill.id];
  const p = G.player;
  const fx = M.fx[def.fx];
  let used = true;
  switch (def.kind) {
    case 'slash': {
      // 기본 공격: n중공격 = hits, 후면/측면 공격 = more directions.
      const lv = skill.lv;
      const hits = 1 + (lv >= 2) + (lv >= 4) + (lv >= 6) + (lv >= 8);
      const dirs = [0];
      if (lv >= 3) dirs.push(Math.PI);
      if (lv >= 5) dirs.push(Math.PI / 2, -Math.PI / 2);
      const dmg = st.dmg * (lv >= 7 ? 1.3 : 1) / Math.sqrt(hits);
      const tgt = nearestEnemies(1, st.area * 2.5)[0];
      const base = tgt ? Math.atan2(tgt.y - p.y, tgt.x - p.x) : Math.atan2(p.my, p.mx);
      for (let h = 0; h < hits; h++) {
        for (const off of dirs) {
          const a = base + off;
          later(h * 0.12, () => {
            const cx = p.x + Math.cos(a) * st.area * 0.8, cy = p.y - 10 + Math.sin(a) * st.area * 0.8;
            addFx(def.fx, cx, cy, { scale: (st.area * 2) / fx.w, rot: a + (h % 2) * 0.6 });
            near(cx, cy + 10, st.area + 20, e => {
              if (Math.hypot(e.x - cx, e.y - cy - 10) < st.area * 0.9 + e.r) hurtEnemy(e, dmg, Math.cos(a) * 50, Math.sin(a) * 50);
            });
          });
        }
      }
      break;
    }
    case 'blink': {
      const targets = nearestEnemies(st.count, st.area);
      if (!targets.length) {
        used = false;
        skill.timer = 0.2;
        break;
      }
      targets.forEach((e, i) => later(i * 0.1, () => {
        if (e.hp <= 0) return;
        const a = Math.atan2(e.y - p.y, e.x - p.x);
        addFx(def.fx, e.x + Math.cos(a) * 6, e.y - (e.m.h * e.scale) / 2, { scale: 0.9, rot: a });
        hurtEnemy(e, st.dmg, Math.cos(a) * 40, Math.sin(a) * 40);
      }));
      break;
    }
    case 'bolt': {
      const targets = nearestEnemies(st.count);
      if (!targets.length) {
        used = false;
        skill.timer = 0.2;
        break;
      }
      for (let i = 0; i < st.count; i++) {
        const tgt = targets[i % targets.length];
        later(i * 0.09, () => {
          const a = Math.atan2(tgt.y - (tgt.m.h * tgt.scale) / 2 - (p.y - 12), tgt.x - p.x);
          shoot(def, st, a);
        });
      }
      break;
    }
    case 'bolt4': {
      if (def.castFx) addFx(def.castFx, 0, -12, { follow: true, scale: 0.8 });
      const n = st.count >= 3 ? 8 : 4;
      for (let i = 0; i < n; i++) shoot(def, st, (i / n) * Math.PI * 2);
      break;
    }
    case 'strike': {
      let targets = nearestEnemies(st.count * 3, 220);
      if (def.weakest) targets.sort((a, b) => a.hp - b.hp);
      else targets.sort(() => Math.random() - 0.5);
      targets = targets.slice(0, st.count);
      if (!targets.length) {
        used = false;
        skill.timer = 0.3;
        break;
      }
      const dmg = st.dmg + (def.scaleHp ? p.maxHp * def.scaleHp : 0);
      targets.forEach((e, i) => {
        const x = e.x, y = e.y;
        const tall = fx.h > fx.w * 1.4;
        const scale = Math.max(0.7, Math.min(2.4, (st.area * 2.6) / fx.w));
        const life = addFx(def.fx, x, tall ? y + 4 : y - 8, { scale, anchor: tall ? 'bottom' : 'center', delay: i * 0.12 });
        later(i * 0.12 + life * (def.hitAt || 0.3), () => {
          G.shake = Math.max(G.shake, 0.08);
          let dealt = 0;
          near(x, y, st.area + 30, o => {
            if (Math.hypot(o.x - x, o.y - y) < st.area + o.r) {
              if (def.slow) o.slow = def.slow;
              if (def.stun) o.stun = def.stun;
              if (def.curse) o.curse = def.curse;
              dealt += hurtEnemy(o, dmg);
            }
          });
          if (def.drain && dealt) heal(dealt * def.drain, false, true);
        });
      });
      break;
    }
    case 'nova': {
      if (def.hpCost) p.hp = Math.max(1, p.hp * (1 - def.hpCost));
      addFx(def.fx, 0, -10, { scale: (st.area * 2.2) / fx.w, follow: true });
      later(0.1, () => near(p.x, p.y, st.area + 20, e => {
        const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1;
        if (d < st.area + e.r) {
          if (def.stun) e.stun = def.stun;
          hurtEnemy(e, st.dmg, (dx / d) * 160, (dy / d) * 160);
        }
      }));
      break;
    }
    case 'orbit': {
      G.hazards = G.hazards.filter(h => h.skill !== skill);
      for (let i = 0; i < st.count; i++) {
        G.hazards.push({ kind: 'orbit', skill, def, st, t: 0, life: st.duration, a: (i / st.count) * Math.PI * 2 });
      }
      break;
    }
    case 'aura': {
      let h = G.hazards.find(x => x.skill === skill);
      if (!h) G.hazards.push(h = { kind: 'aura', skill, def, st, t: 0, life: Infinity });
      h.st = st;
      near(p.x, p.y, st.area + 20, e => {
        const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1;
        if (d < st.area + e.r) hurtEnemy(e, st.dmg, (dx / d) * 120, (dy / d) * 120);
      });
      used = false; // quiet: it ticks all the time
      break;
    }
    case 'summon': {
      for (let i = 0; i < st.count; i++) {
        const id = def.allies[(skill.lv + i) % def.allies.length];
        const m = monsterById[id];
        if (!m) continue;
        const a = Math.random() * Math.PI * 2;
        const x = p.x + Math.cos(a) * 20, y = p.y + Math.sin(a) * 14;
        addFx(def.fx, x, y - 10, { scale: 0.7 });
        G.allies.push({ m, x, y, t: 0, life: st.duration, dmg: st.dmg, face: 1, phase: 0, hits: new Map() });
      }
      break;
    }
    case 'heal': {
      if (p.hp >= p.maxHp) {
        skill.timer = 1;
        used = false;
        break;
      }
      heal(st.heal, true);
      say(`${skillName(skill.id, skill.lv)}!`, '#9fffa8');
      used = false;
      break;
    }
    case 'buff': {
      const until = G.t + st.duration;
      G.buffs[def.buff] = until;
      if (def.buff === 'power') G.buffs.powerK = def.power;
      if (def.buff === 'stealth') say('모습을 감췄습니다.', '#c8c8ff');
      if (def.buff === 'guard') say('금강불체!', '#ffe08a');
      addFx(def.fx, 0, -14, { follow: true });
      break;
    }
  }
  if (used) audio.play('skill_' + skill.id, def.kind);
}

function shoot(def, st, a) {
  const p = G.player;
  const fx = M.fx[def.fx];
  G.projs.push({
    def, x: p.x, y: p.y - 12, vx: Math.cos(a) * def.speed, vy: Math.sin(a) * def.speed,
    dmg: st.dmg, pierce: st.pierce, life: 1.6, t: 0, scale: def.area, hit: new Set(),
    r: 4 + fx.w * def.area * 0.2,
  });
}

/** The class's finishing spell: costs all mana (and some health for the fighters). */
function castUlt() {
  if (!G || G.over || G.dead || G.paused || G.choosing) return;
  const p = G.player;
  if (p.mp < p.maxMp) return;
  const def = SKILLS[G.cls.ult];
  p.mp = 0;
  if (def.hpCost) p.hp = Math.max(1, p.hp * (1 - def.hpCost));
  G.bubble = { text: def.name + '!', t: G.t };
  say(`${def.name}!`, '#ffe08a');
  audio.play('skill_' + G.cls.ult, 'nova');
  G.shake = 0.5;
  const lvl = p.lvl, pw = 1 + 0.1 * G.passives.power;
  const onScreen = () => G.enemies.filter(e => Math.abs(e.x - p.x) < VW / 2 + 20 && Math.abs(e.y - p.y) < VH / 2 + 30);
  switch (G.cls.ult) {
    case 'w_ult': {
      // 건곤대나이: strength from the warrior's health.
      addFx(def.fx, 0, -10, { follow: true, scale: 300 / M.fx[def.fx].w });
      addFx('24', 0, -10, { follow: true, scale: 200 / M.fx['24'].w });
      later(0.15, () => near(p.x, p.y, 160, e => {
        const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1;
        if (d < 150 + e.r) hurtEnemy(e, p.maxHp * 2.2 * pw, (dx / d) * 220, (dy / d) * 220);
      }));
      break;
    }
    case 'r_ult': {
      const list = onScreen().sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
      for (let k = 0; k < 3; k++) {
        later(k * 0.2, () => list.forEach((e, i) => {
          if (e.hp <= 0) return;
          if (i < 30) addFx(def.fx, e.x, e.y - (e.m.h * e.scale) / 2, { scale: 0.7, rot: k });
          hurtEnemy(e, (40 + lvl * 9) * pw);
        }));
      }
      break;
    }
    case 'm_ult': {
      const list = onScreen();
      for (let i = 0; i < 7; i++) {
        const e = list[Math.floor(Math.random() * list.length)];
        const x = e ? e.x : p.x + rand(-120, 120), y = e ? e.y : p.y + rand(-80, 80);
        addFx(def.fx, x, y - 20, { scale: 1.6, delay: i * 0.08 });
      }
      later(0.5, () => list.forEach(e => hurtEnemy(e, (70 + lvl * 14) * pw)));
      G.buffs.shield = G.t + def.shield;
      addFx(FX.shield, 0, -10, { follow: true, scale: 0.6 });
      break;
    }
    case 'p_ult': {
      heal(p.maxHp, true);
      G.buffs.guard = G.t + def.guard;
      addFx(def.fx, 0, -12, { follow: true, scale: 1.6 });
      break;
    }
  }
}

const timers = [];
function later(delay, fn) {
  if (delay <= 0) fn();
  else timers.push({ at: G.t + delay, fn, run: G });
}

function runTimers() {
  for (let i = timers.length - 1; i >= 0; i--) {
    const t = timers[i];
    if (t.run !== G) timers.splice(i, 1);
    else if (G.t >= t.at) {
      timers.splice(i, 1);
      t.fn();
    }
  }
}

function updateProjectiles(dt) {
  for (const b of G.projs) {
    b.t += dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    near(b.x, b.y + 8, b.r + 30, e => {
      if (b.pierce < 0 || b.hit.has(e)) return;
      if (Math.hypot(e.x - b.x, e.y - (e.m.h * e.scale) / 2 - b.y) < b.r + e.r) {
        b.hit.add(e);
        hurtEnemy(e, b.dmg, b.vx * 0.3, b.vy * 0.3);
        if (Math.random() < 0.5) addFx(FX.hit, e.x, e.y - (e.m.h * e.scale) / 2, { scale: 0.6 });
        b.pierce--;
      }
    });
  }
  G.projs = G.projs.filter(b => b.t < b.life && b.pierce >= 0);
}

function updateHazards(dt) {
  const p = G.player;
  for (const h of G.hazards) {
    h.t += dt;
    if (h.kind === 'orbit') {
      h.a += dt * 3.2;
      h.x = p.x + Math.cos(h.a) * h.st.area;
      h.y = p.y - 10 + Math.sin(h.a) * h.st.area * 0.8;
      contact(h, h.x, h.y + 10, 12, 0.45, h.st.dmg);
    }
  }
  G.hazards = G.hazards.filter(h => h.t < h.life);
}

function updateAllies(dt) {
  for (const a of G.allies) {
    a.t += dt;
    const tgt = nearestEnemies(1, 200, a)[0];
    let tx = G.player.x + 20, ty = G.player.y;
    if (tgt) {
      tx = tgt.x;
      ty = tgt.y;
    }
    const dx = tx - a.x, dy = ty - a.y, d = Math.hypot(dx, dy) || 1;
    if (d > 6) {
      a.x += (dx / d) * 110 * dt;
      a.y += (dy / d) * 110 * dt;
      a.face = dx >= 0 ? 1 : -1;
      a.phase += dt * 12;
    }
    contact(a, a.x, a.y, 10, 0.5, a.dmg);
  }
  G.allies = G.allies.filter(a => a.t < a.life);
}

function contact(h, x, y, r, every, dmg) {
  near(x, y, r + 20, e => {
    if (Math.hypot(e.x - x, e.y - y) > r + e.r) return;
    const last = e.hits.get(h) || -9;
    if (G.t - last < every) return;
    e.hits.set(h, G.t);
    hurtEnemy(e, dmg);
  });
}

// ---------------------------------------------------------------- pickups and levels

function updatePickups(dt) {
  const p = G.player;
  const reach = 46 * (1 + 0.3 * G.passives.magnet);
  for (const g of G.gems) {
    const d = Math.hypot(g.x - p.x, g.y - (p.y - 6));
    if (d < reach) g.fly = true;
    if (g.fly) {
      const s = Math.max(120, 260 - d) * dt;
      g.x += ((p.x - g.x) / d) * s;
      g.y += ((p.y - 6 - g.y) / d) * s;
      if (d < 8) {
        g.taken = true;
        gainXp(g.v);
      }
    }
  }
  G.gems = G.gems.filter(g => !g.taken);
  for (const d of G.drops) {
    if (Math.hypot(d.x - p.x, d.y - p.y) < 16) {
      d.taken = true;
      if (d.kind === 'heal') heal(30, true);
      else if (d.kind === 'coin') {
        const n = 5 + Math.floor(Math.random() * 10 * (1 + G.level));
        G.gold += n;
        audio.play('pickup');
      } else if (d.kind === 'magnet') {
        for (const g of G.gems) g.fly = true;
        audio.play('pickup');
      } else if (d.kind === 'chest') {
        G.gold += 100 * (1 + G.level);
        heal(p.maxHp * 0.3, false);
        audio.play('chest');
        say('보물 상자를 열었습니다.', '#ffe08a');
        G.pendingLevels++;
        nextChoice();
      }
    }
  }
  G.drops = G.drops.filter(d => !d.taken);
}

function heal(n, sound, quiet = false) {
  const p = G.player;
  n = Math.min(n, p.maxHp - p.hp);
  if (n <= 0) return;
  p.hp += n;
  floatText(p.x, p.y - 34, '+' + Math.round(n), '#7dff8a');
  if (!quiet) addFx(FX.heal, 0, -14, { scale: 0.8, follow: true });
  if (sound) audio.play('heal');
}

function gainXp(v) {
  const p = G.player;
  p.xp += v;
  audio.play('pickup');
  while (p.xp >= p.next) {
    p.xp -= p.next;
    p.lvl++;
    p.next = xpFor(p.lvl);
    G.pendingLevels++;
    say(`레벨이 올랐습니다. (Lv ${p.lvl})`, '#9fd0ff');
  }
  if (G.pendingLevels && !G.choosing) nextChoice();
}

function nextChoice() {
  if (!G.pendingLevels || G.over || G.dead) return;
  G.pendingLevels--;
  const opts = [];
  for (const s of G.skills) if (s.lv < MAX_SKILL_LEVEL) opts.push({ type: 'skill', id: s.id, lv: s.lv + 1, w: 3 });
  if (G.skills.length < MAX_SKILLS) {
    for (const [id, s] of Object.entries(SKILLS)) {
      if ((s.cls === G.cls.id || s.cls === 'all') && s.kind !== 'ult' && !G.skills.some(x => x.id === id)) {
        opts.push({ type: 'skill', id, lv: 1, w: 2.5 });
      }
    }
  }
  for (const [id, ps] of Object.entries(PASSIVES)) {
    if (G.passives[id] < ps.max) opts.push({ type: 'passive', id, lv: G.passives[id] + 1, w: 1.3 });
  }
  const picks = [];
  while (picks.length < 3 && opts.length) {
    const total = opts.reduce((a, o) => a + o.w, 0);
    let r = Math.random() * total;
    const i = opts.findIndex(o => (r -= o.w) <= 0);
    picks.push(opts.splice(i < 0 ? 0 : i, 1)[0]);
  }
  if (!picks.length) picks.push({ type: 'heal' }, { type: 'gold' });
  G.choosing = true;
  audio.play('levelup');
  addFx(FX.levelup, 0, -14, { follow: true });
  $('#lv-title').textContent = `레벨 ${G.player.lvl}`;
  const box = $('#choices');
  box.innerHTML = '';
  for (const o of picks) {
    const b = document.createElement('button');
    b.className = 'choice';
    let icon, name, text, tag;
    if (o.type === 'skill') {
      const def = SKILLS[o.id];
      icon = def.fx === 'hero' ? heroIcon() : fxIcon(def.fx);
      name = skillName(o.id, o.lv);
      text = levelText(o.id, o.lv);
      tag = o.lv === 1 ? '새 마법' : `Lv ${o.lv}`;
    } else if (o.type === 'passive') {
      const ps = PASSIVES[o.id];
      icon = itemIcon(ps.item);
      name = ps.name;
      text = ps.desc;
      tag = `Lv ${o.lv}`;
    } else if (o.type === 'heal') {
      icon = itemIcon('heal');
      name = '회복';
      text = '체력 50 회복';
      tag = '';
    } else {
      icon = itemIcon('coin');
      name = '전';
      text = '돈 100전';
      tag = '';
    }
    b.append(icon);
    const t = document.createElement('div');
    t.innerHTML = `<b>${name}</b> <i>${tag}</i><span>${text}</span>`;
    b.append(t);
    b.onclick = () => choose(o);
    box.append(b);
  }
  $('#levelup').hidden = false;
}

function choose(o) {
  if (o.type === 'skill') {
    addSkill(o.id);
    say(`${josa(skillName(o.id, o.lv), '을', '를')} 익혔습니다.`, '#c8e0ff');
  } else if (o.type === 'passive') {
    G.passives[o.id]++;
    if (o.id === 'life') {
      G.player.maxHp += 20;
      G.player.hp += 20;
    }
  } else if (o.type === 'heal') heal(50, true);
  else G.gold += 100;
  $('#levelup').hidden = true;
  G.choosing = false;
  if (G.pendingLevels) nextChoice();
}

function fxIcon(id) {
  const im = document.createElement('img');
  im.src = `assets/icon/${id}.png`;
  im.className = 'item';
  return im;
}

function heroIcon() {
  const im = document.createElement('img');
  im.src = `assets/hero/${G.cls.hero}.png`;
  im.className = 'item';
  return im;
}

function itemIcon(role) {
  const im = document.createElement('img');
  im.src = `assets/item/${M.items[role].id}.png`;
  im.className = 'item';
  return im;
}

/** Death: a 도사 rises once; anyone else becomes a ghost, as in the game. */
function die() {
  const p = G.player;
  if (G.cls.revive && !G.revived) {
    G.revived = true;
    p.hp = p.maxHp * 0.5;
    G.buffs.guard = G.t + 3;
    G.bubble = { text: '부활!', t: G.t };
    say('부활 마법으로 다시 일어났습니다.', '#ffe08a');
    addFx(FX.levelup, 0, -14, { follow: true, scale: 1.4 });
    audio.play('heal');
    return;
  }
  G.dead = true;
  p.hp = 0;
  audio.play('lose');
  audio.stopBgm();
  say('유령이 되었습니다…', '#b0b0ff');
  record();
  setTimeout(() => {
    if (!G) return;
    G.over = true;
    $('#over-title').textContent = G.cleared ? `${G.stage.name} 정복!` : '유령이 되었습니다';
    $('#over-stats').innerHTML = `${G.cls.name} · Lv ${G.player.lvl} · ${G.stage.name}<br>버틴 시간 ${clock(G.t)}<br>`
      + `쓰러뜨린 몬스터 ${G.kills}마리 · ${G.gold}전<br>`
      + G.skills.map(s => `${skillName(s.id, s.lv)}`).join(' · ');
    showScreen('over');
  }, 1800);
}

function leaveHunt() {
  if (G) record();
  G = null;
  audio.bgm('title');
  showScreen('stages');
}

function record() {
  const r = best[G.cls.id];
  if (!r || G.player.lvl > r.lvl || (G.player.lvl === r.lvl && G.kills > r.kills)) {
    best[G.cls.id] = { lvl: G.player.lvl, kills: G.kills };
    saveJson('bs_best', best);
  }
}

function banner(text) {
  const b = $('#banner');
  b.textContent = text;
  b.hidden = false;
  clearTimeout(banner.t);
  banner.t = setTimeout(() => { b.hidden = true; }, 2600);
}

/** A line in the message window, like the game's system messages. */
function say(text, color = '#fff') {
  G.log.push({ text, color, t: G.t });
  if (G.log.length > 5) G.log.shift();
}

/** The right particle after a Korean word: josa('서생원', '이', '가') -> '서생원이'. */
function josa(word, withFinal, without) {
  const c = word.charCodeAt(word.length - 1);
  const has = c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0;
  return word + (has ? withFinal : without);
}

function floatText(x, y, text, color) {
  if (G.texts.length > 70) G.texts.shift();
  G.texts.push({ x: x + rand(-4, 4), y, text: String(text), color, t: 0 });
}

function rand(a, b) {
  return a + Math.random() * (b - a);
}

function clock(s) {
  s = Math.floor(s);
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

// ---------------------------------------------------------------- effects

const fxDurs = {};
function durs(id) {
  // Game pace: the GIFs hold some frames for half a second.
  return fxDurs[id] || (fxDurs[id] = M.fx[id].durs.map(d => Math.min(d, 110) / 1000));
}

/** Starts an effect; returns how long it plays. */
function addFx(id, x, y, o = {}) {
  if (!M.fx[id]) return 0;
  const life = durs(id).reduce((a, b) => a + b, 0);
  G.fxs.push({ id, x, y, t: -(o.delay || 0), life, scale: o.scale || 1, rot: o.rot || 0,
    follow: o.follow, anchor: o.anchor || 'center' });
  return life;
}

function fxFrame(d, t, loop) {
  if (loop) t %= d.reduce((a, b) => a + b, 0);
  for (let i = 0; i < d.length; i++) {
    t -= d[i];
    if (t < 0) return i;
  }
  return d.length - 1;
}

function drawFx(id, x, y, t, scale, rot, anchor, loop) {
  const f = M.fx[id];
  const im = images[`fx/${id}.png`];
  const i = fxFrame(durs(id), t, loop);
  const w = f.w * scale, h = f.h * scale;
  ctx.save();
  if (f.add) ctx.globalCompositeOperation = 'lighter';
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  ctx.drawImage(im, i * f.w, 0, f.w, f.h, -w / 2, anchor === 'bottom' ? -h : -h / 2, w, h);
  ctx.restore();
}

// ---------------------------------------------------------------- input

const keys = new Set();
addEventListener('keydown', e => {
  keys.add(e.code);
  if (e.code === 'Escape' || e.code === 'KeyP') togglePause();
  if (e.code === 'Space') castUlt();
});
addEventListener('keyup', e => keys.delete(e.code));
const joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
const JOY_R = 44;

canvas.addEventListener('pointerdown', e => {
  audio && audio.unlock();
  if (joy.id !== null) return;
  joy.id = e.pointerId;
  joy.ox = joy.x = e.clientX;
  joy.oy = joy.y = e.clientY;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', e => {
  if (e.pointerId !== joy.id) return;
  joy.x = e.clientX;
  joy.y = e.clientY;
});
for (const t of ['pointerup', 'pointercancel']) {
  canvas.addEventListener(t, e => {
    if (e.pointerId === joy.id) joy.id = null;
  });
}
addEventListener('contextmenu', e => e.preventDefault());

function input() {
  if (window.__botInput) return window.__botInput(G);
  let x = 0, y = 0;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) x--;
  if (keys.has('KeyD') || keys.has('ArrowRight')) x++;
  if (keys.has('KeyW') || keys.has('ArrowUp')) y--;
  if (keys.has('KeyS') || keys.has('ArrowDown')) y++;
  if (joy.id !== null) {
    const dx = joy.x - joy.ox, dy = joy.y - joy.oy, d = Math.hypot(dx, dy);
    if (d > 6) {
      const m = Math.min(1, d / JOY_R);
      return [(dx / d) * m, (dy / d) * m];
    }
  }
  const l = Math.hypot(x, y);
  return l ? [x / l, y / l] : [0, 0];
}

// ---------------------------------------------------------------- drawing

function white(img) {
  let c = whiteCache.get(img);
  if (!c) {
    c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = '#fff';
    g.fillRect(0, 0, c.width, c.height);
    whiteCache.set(img, c);
  }
  return c;
}

/** A still sprite made to walk: it bobs and leans as it goes, faces where it heads. */
function drawWalker(img, x, y, face, phase, moving, flash, scale = 1, alpha = 1) {
  const w = img.width * scale, h = img.height * scale;
  const bob = moving ? Math.abs(Math.sin(phase)) : 0;
  const breathe = Math.sin(phase * 0.5) * 0.015;
  const sy = 1 + breathe - bob * 0.04, sx = 1 - breathe + bob * 0.03;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(Math.round(x), Math.round(y - bob * 2));
  ctx.rotate(moving ? Math.sin(phase) * 0.05 * face : 0);
  ctx.scale(face * sx, sy);
  ctx.drawImage(img, -w / 2, -h, w, h);
  if (flash > 0) {
    ctx.globalAlpha = alpha * Math.min(1, flash * 8) * 0.8;
    ctx.drawImage(white(img), -w / 2, -h, w, h);
  }
  ctx.restore();
}

function shadow(x, y, r) {
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(x, y, r, r * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
}

function render(now) {
  ctx.imageSmoothingEnabled = false;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (!G) {
    drawMenuBackdrop(now);
    return;
  }
  const p = G.player;
  let camX = p.x - VW / 2, camY = p.y - VH / 2;
  if (G.shake > 0) {
    camX += rand(-2, 2);
    camY += rand(-2, 2);
  }
  ctx.setTransform(Z, 0, 0, Z, -camX * Z, -camY * Z);
  ctx.fillStyle = G.ground;
  ctx.fillRect(camX, camY, VW, VH);

  // Ground-level things first.
  for (const h of G.hazards) {
    if (h.kind === 'aura') {
      const f = M.fx[h.def.fx];
      ctx.globalAlpha = 0.85;
      drawFx(h.def.fx, p.x, p.y - 8, now, (h.st.area * 2.1) / f.w, 0, 'center', true);
      ctx.globalAlpha = 1;
    }
  }
  for (const g of G.gems) {
    const role = g.v >= 10 ? 'gem4' : g.v >= 4 ? 'gem3' : g.v >= 2 ? 'gem2' : 'gem1';
    const im = images[`item/${M.items[role].id}.png`];
    ctx.drawImage(im, Math.round(g.x - im.width / 4), Math.round(g.y - im.height / 4), im.width / 2, im.height / 2);
  }
  for (const d of G.drops) {
    const im = images[`item/${M.items[d.kind].id}.png`];
    const bob = Math.sin(now * 4) * 1.5;
    shadow(d.x, d.y, 6);
    ctx.drawImage(im, Math.round(d.x - im.width / 2), Math.round(d.y - im.height - 2 + bob));
  }

  // Bodies, back to front.
  const bodies = G.enemies.concat(G.allies);
  bodies.push(p);
  bodies.sort((a, b) => a.y - b.y);
  const hidden = G.buffs.stealth > G.t;
  for (const b of bodies) {
    if (b === p) {
      drawHero(now, hidden);
      continue;
    }
    if (b.life) {
      // A summoned helper: tinted, fading as its time runs out.
      shadow(b.x, b.y, 6);
      drawWalker(b.m.img, b.x, b.y, b.face, b.phase, true, 0, 1, Math.min(1, (b.life - b.t) * 2) * 0.9);
      continue;
    }
    const s = b.scale;
    shadow(b.x, b.y, b.r * 1.2);
    drawWalker(b.m.img, b.x, b.y, b.face, b.phase, b.stun <= 0, b.flash, s);
    if (b.slow > 0 || b.stun > 0) {
      ctx.fillStyle = b.stun > 0 ? 'rgba(255,240,120,0.3)' : 'rgba(120,180,255,0.35)';
      ctx.fillRect(b.x - (b.m.w * s) / 2, b.y - b.m.h * s, b.m.w * s, b.m.h * s);
    }
    if (b.curse > 0) {
      ctx.fillStyle = 'rgba(160,60,200,0.25)';
      ctx.fillRect(b.x - (b.m.w * s) / 2, b.y - b.m.h * s, b.m.w * s, b.m.h * s);
    }
    if (b.kind) {
      bar(b.x - 22, b.y + 4, 44, 3, b.hp / b.maxHp, '#d33');
      ctx.font = '8px G7';
      ctx.textAlign = 'center';
      outline(b.name, b.x, b.y - b.m.h * s - 3, b.kind === 'boss' ? '#ff8a6a' : '#ffe070');
    }
  }
  for (const d of G.dying) {
    const k = d.t / 0.4;
    drawWalker(d.e.m.img, d.e.x, d.e.y, d.e.face, 0, false, 0.12, d.e.scale * (1 - k * 0.3), 1 - k);
  }

  // Flying and sky-level things.
  for (const b of G.projs) drawFx(b.def.fx, b.x, b.y, b.t, b.scale, 0, 'center', true);
  for (const h of G.hazards) {
    if (h.kind !== 'orbit') continue;
    if (h.def.fx === 'hero') drawWalker(p.img, h.x, h.y + 12, p.face, now * 8, true, 0, 0.8, 0.55);
    else drawFx(h.def.fx, h.x, h.y, h.t, Math.min(1.2, 26 / M.fx[h.def.fx].w), 0, 'center', true);
  }
  for (const f of G.fxs) {
    if (f.t < 0) continue;
    const x = f.follow ? p.x + f.x : f.x, y = f.follow ? p.y + f.y : f.y;
    drawFx(f.id, x, y, f.t, f.scale, f.rot, f.anchor, false);
  }
  ctx.font = '8px G7';
  ctx.textAlign = 'center';
  for (const t of G.texts) {
    ctx.globalAlpha = 1 - t.t / 0.6;
    outline(t.text, t.x, t.y, t.color);
  }
  ctx.globalAlpha = 1;
  if (!G.dead) bar(p.x - 12, p.y + 3, 24, 2.5, p.hp / p.maxHp, '#e33');
  if (G.bubble) drawBubble(G.bubble.text, p.x, p.y - p.img.height - 6);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const dark = DARK[G.stage.terrain];
  if (dark) {
    // Caves and houses are dim away from the hero, as in the old game's dungeons.
    const cx = canvas.width / 2, cy = canvas.height / 2;
    const gr = ctx.createRadialGradient(cx, cy, canvas.height * 0.3, cx, cy, Math.hypot(cx, cy));
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(1, `rgba(0,0,0,${dark})`);
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  drawHud();
  drawJoystick();
}

function drawHero(now, hidden) {
  const p = G.player;
  if (G.dead) {
    // The ghost the dead become.
    const f = M.fx[FX.ghost];
    ctx.globalAlpha = 0.85;
    drawFx(FX.ghost, p.x, p.y - Math.sin(now * 2) * 3, now, 1, 0, 'bottom', true);
    ctx.globalAlpha = 1;
    return f;
  }
  shadow(p.x, p.y, 7);
  if (G.buffs.guard > G.t) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(255,220,120,0.18)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y - 14, 14, 20, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  if (G.buffs.shield > G.t) {
    ctx.strokeStyle = 'rgba(140,200,255,0.6)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y - 14, 15, 21, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  const blink = p.inv > 0 && Math.floor(p.inv * 20) % 2 === 0;
  if (!blink) drawWalker(p.img, p.x, p.y, p.face, p.walk, p.moving, 0, 1, hidden ? 0.35 : 1);
}

function drawBubble(text, x, y) {
  // A speech balloon, as players shout their spells.
  ctx.font = '8px G7';
  ctx.textAlign = 'center';
  const w = Math.ceil(ctx.measureText(text).width) + 8;
  x = Math.round(x);
  y = Math.round(y);
  ctx.fillStyle = '#000';
  ctx.fillRect(x - w / 2 - 1, y - 12, w + 2, 12);
  ctx.fillStyle = '#fbf8ec';
  ctx.fillRect(x - w / 2, y - 11, w, 10);
  ctx.fillRect(x - 1, y - 1, 3, 2);
  ctx.fillStyle = '#000';
  ctx.fillRect(x - 2, y - 1, 1, 2);
  ctx.fillRect(x + 2, y - 1, 1, 2);
  ctx.fillRect(x - 1, y + 1, 3, 1);
  ctx.fillText(text, x, y - 3);
}

/** A gauge in steps, as the old client drew them. */
function bar(x, y, w, h, k, color, back = 'rgba(0,0,0,0.65)') {
  x = Math.round(x);
  y = Math.round(y);
  w = Math.round(w);
  ctx.fillStyle = '#000';
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = back;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, Math.round(w * Math.max(0, Math.min(1, k))), h);
}

/** A gauge of separate blocks, filled from the left. */
function blocks(x, y, n, h, k, on, off) {
  const lit = Math.round(Math.max(0, Math.min(1, k)) * n);
  ctx.fillStyle = '#000';
  ctx.fillRect(x - 1, y - 1, n * 6 + 1, h + 2);
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = i < lit ? on : off;
    ctx.fillRect(x + i * 6, y, 5, h);
  }
}

/** A bevelled wooden panel: light edges top-left, dark bottom-right. */
function panel(x, y, w, h, sunken = false) {
  const hi = '#a07a46', lo = '#0d0703';
  ctx.fillStyle = sunken ? 'rgba(20,12,6,0.85)' : 'rgba(43,29,18,0.92)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = sunken ? lo : hi;
  ctx.fillRect(x, y, w, 1);
  ctx.fillRect(x, y, 1, h);
  ctx.fillStyle = sunken ? '#5c4228' : lo;
  ctx.fillRect(x, y + h - 1, w, 1);
  ctx.fillRect(x + w - 1, y, 1, h);
}

function drawHud() {
  const p = G.player;
  // The HUD has its own pixel scale, a little finer than the world's.
  const H = Math.max(1, Math.round(canvas.height / 340));
  const HW = Math.floor(canvas.width / H), HH = Math.floor(canvas.height / H);
  const right = HW - Math.ceil((64 * (window.devicePixelRatio || 1)) / H);
  ctx.setTransform(H, 0, 0, H, 0, 0);

  // Top: the ground, the clock, the tally.
  ctx.font = 'bold 12px G11';
  ctx.textAlign = 'left';
  outline(`${G.stage.name}${G.cleared ? ' [정복]' : ''}`, 6, 15, G.cleared ? '#b8f0a0' : '#ffe070');
  ctx.textAlign = 'center';
  outline(clock(G.t), Math.round(HW / 2), 15);
  ctx.font = '10px G9';
  if (G.bossDue) outline(`보스 ${G.boss.name}까지 ${clock(BOSS_AT - G.t)}`, Math.round(HW / 2), 27, '#ff8a6a');
  ctx.textAlign = 'right';
  outline(`처치 ${G.kills}`, right, 14);
  outline(`${G.gold}전`, right, 26, '#ffe070');

  // Learned spells in sunken slots, then the trained stats.
  let x = 6;
  const y = 21;
  ctx.font = '8px G7';
  for (const s of G.skills) {
    const def = SKILLS[s.id];
    panel(x, y, 18, 18, true);
    if (def.fx === 'hero') {
      const im = p.img, sc = Math.min(16 / im.width, 16 / im.height);
      ctx.drawImage(im, x + 9 - (im.width * sc) / 2, y + 9 - (im.height * sc) / 2, im.width * sc, im.height * sc);
    } else {
      const im = images[`icon/${def.fx}.png`], sc = Math.min(16 / im.width, 16 / im.height);
      ctx.drawImage(im, x + 9 - (im.width * sc) / 2, y + 9 - (im.height * sc) / 2, im.width * sc, im.height * sc);
    }
    ctx.textAlign = 'right';
    outline(String(s.lv), x + 18, y + 18);
    x += 20;
  }
  x += 4;
  for (const [id, lv] of Object.entries(G.passives)) {
    if (!lv) continue;
    const im = images[`item/${M.items[PASSIVES[id].item].id}.png`];
    const sc = Math.min(1, 14 / im.width, 14 / im.height);
    ctx.drawImage(im, Math.round(x), y + 2, Math.round(im.width * sc), Math.round(im.height * sc));
    ctx.textAlign = 'right';
    outline(String(lv), x + 16, y + 18);
    x += 17;
  }

  // Bottom: the status window of the old client — numbers first, in sunken fields, with
  // block gauges beside them rather than smooth bars.
  const pw = 236, ph = 44, px = Math.round((HW - pw) / 2), py = HH - ph - 3;
  panel(px, py, pw, ph);
  const row = (label, color, y, cur, max, on, off) => {
    ctx.font = '10px G9';
    ctx.textAlign = 'left';
    outline(label, px + 6, y + 9, color);
    panel(px + 32, y, 58, 12, true);
    ctx.font = '10px G9';
    ctx.textAlign = 'right';
    outline(`${cur}/${max}`, px + 87, y + 9);
    blocks(px + 96, y + 2, 20, 8, cur / max, on, off);
  };
  row('체력', '#ff8a6a', py + 4, Math.ceil(Math.max(0, p.hp)), p.maxHp, '#d0382c', '#3a120c');
  row('마력', '#a8d0ff', py + 17, Math.floor(p.mp), p.maxMp, '#3a68d8', '#101a40');
  ctx.font = '10px G9';
  ctx.textAlign = 'left';
  outline('레벨', px + 6, py + 39, '#ffe070');
  outline(String(p.lvl), px + 32, py + 39);
  outline('경험치', px + 56, py + 39, '#ffe070');
  blocks(px + 96, py + 32, 20, 6, p.xp / p.next, '#d8b030', '#2a2208');

  // The message window.
  ctx.font = '10px G9';
  ctx.textAlign = 'left';
  const lines = G.log.filter(l => G.t - l.t < 10);
  if (lines.length) {
    const lw = Math.min(px - 10, 200);
    let ly = HH - 6 - lines.length * 12;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(4, ly, lw, lines.length * 12 + 3);
    for (const l of lines) {
      ctx.globalAlpha = Math.min(1, (10 - (G.t - l.t)) / 2);
      ly += 12;
      ctx.fillStyle = '#000';
      ctx.fillText(l.text, 8, ly);
      ctx.fillStyle = l.color;
      ctx.fillText(l.text, 7, ly - 1);
    }
    ctx.globalAlpha = 1;
  }
}

/** Text with a one-pixel dark edge, crisp at any whole scale. */
function outline(text, x, y, color = '#efe3c2') {
  x = Math.round(x);
  y = Math.round(y);
  ctx.fillStyle = '#000';
  ctx.fillText(text, x + 1, y);
  ctx.fillText(text, x, y + 1);
  ctx.fillText(text, x + 1, y + 1);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function drawJoystick() {
  if (joy.id === null) return;
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.strokeStyle = 'rgba(255,244,214,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(joy.ox, joy.oy, JOY_R, 0, Math.PI * 2);
  ctx.stroke();
  const dx = joy.x - joy.ox, dy = joy.y - joy.oy, d = Math.hypot(dx, dy), m = Math.min(d, JOY_R);
  ctx.fillStyle = 'rgba(255,244,214,0.45)';
  ctx.beginPath();
  ctx.arc(joy.ox + (d ? (dx / d) * m : 0), joy.oy + (d ? (dy / d) * m : 0), 16, 0, Math.PI * 2);
  ctx.fill();
}

function drawMenuBackdrop(now) {
  // Behind the menus: the beginners' field with a slow parade of its animals.
  if (!menuGround) return;
  ctx.setTransform(Z, 0, 0, Z, 0, 0);
  ctx.fillStyle = menuGround;
  ctx.save();
  ctx.translate(-(now * 8) % 256, 0);
  ctx.fillRect(0, 0, VW + 256, VH);
  ctx.restore();
  const parade = ['1001', '1002', '1003', '1005', '1022', '1028', '1023', '3013', '12020'];
  parade.forEach((id, i) => {
    const m = monsterById[id];
    if (!m) return;
    const x = ((i * 70 + now * 14) % (VW + 80)) - 40;
    const y = VH * 0.86 + (i % 3) * 8;
    shadow(x, y, 6);
    drawWalker(m.img, x, y, 1, now * 6 + i, true, 0);
  });
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// ---------------------------------------------------------------- menus

const ultBtn = $('#ult');
const ULT_STEPS = 10;
ultBtn.querySelector('.gauge').innerHTML = '<i></i>'.repeat(ULT_STEPS);
function syncUlt() {
  if (!G || ultBtn.hidden) return;
  const p = G.player;
  const k = Math.max(0, Math.min(1, p.mp / p.maxMp));
  const on = Math.floor(k * ULT_STEPS + 1e-6), ready = k >= 1 && !G.dead;
  const key = `${G.cls.ult}|${on}|${ready}|${Math.floor(p.mp)}`;
  if (ultBtn.dataset.key === key) return;
  ultBtn.dataset.key = key;
  ultBtn.querySelector('b').textContent = SKILLS[G.cls.ult].name;
  ultBtn.querySelectorAll('.gauge i').forEach((el, i) => el.classList.toggle('on', i < on));
  ultBtn.querySelector('small').textContent = ready ? '준비됨' : `마력 ${Math.floor(p.mp)}/${p.maxMp}`;
  ultBtn.classList.toggle('ready', ready);
}
ultBtn.addEventListener('pointerdown', e => {
  e.preventDefault();
  e.stopPropagation();
  castUlt();
});

function togglePause(force) {
  if (!G || G.over || G.choosing || G.dead) return false;
  G.paused = force ?? !G.paused;
  $('#pause').hidden = !G.paused;
  if (G.paused) syncSettings();
  return true;
}

function syncSettings() {
  $('#opt-bgm').textContent = '배경음: ' + (settings.bgm ? '켬' : '끔');
  $('#opt-sfx').textContent = '효과음: ' + (settings.sfx ? '켬' : '끔');
  $('#opt-num').textContent = '피해 숫자: ' + (settings.numbers ? '켬' : '끔');
}

$('#start-btn').onclick = () => {
  audio.unlock();
  showScreen('select');
};
$('#back-title').onclick = () => showScreen('title');
$('#back-select').onclick = () => showScreen('select');
$('#go').onclick = () => startRun(chosenClass, pickedStage);
$('#pause-btn').onclick = () => togglePause();
$('#resume').onclick = () => togglePause(false);
$('#quit').onclick = () => {
  $('#pause').hidden = true;
  leaveHunt();
};
$('#again').onclick = () => startRun(G.cls, G.stage);
$('#to-select').onclick = () => leaveHunt();
$('#opt-bgm').onclick = () => {
  settings.bgm = !settings.bgm;
  audio.setBgm(settings.bgm);
  saveJson('bs_settings', settings);
  syncSettings();
};
$('#opt-sfx').onclick = () => {
  settings.sfx = !settings.sfx;
  audio.setSfx(settings.sfx);
  saveJson('bs_settings', settings);
  syncSettings();
};
$('#opt-num').onclick = () => {
  settings.numbers = !settings.numbers;
  saveJson('bs_settings', settings);
  syncSettings();
};
document.addEventListener('pointerdown', () => audio && audio.unlock(), { capture: true });

// Hooks for the Android app (MainActivity).
window.__appPause = on => {
  if (!audio) return;
  audio.halt(on);
  if (on) togglePause(true);
};
// Back: opens or closes the pause menu, or steps back through the menus; false when there is
// nothing left to go back to (the app then exits on a second press).
window.__appBack = () => {
  if (G && !G.over) {
    if (!G.choosing) togglePause();
    return true;
  }
  if (!$('#stages').hidden) {
    showScreen('select');
    return true;
  }
  if (!$('#select').hidden || !$('#over').hidden) {
    G = null;
    showScreen('title');
    return true;
  }
  return false;
};
// For testing in a browser console.
window.__game = () => G;
window.__start = (c, s) => startRun(CLASSES[c], STAGES[s]);

boot();
