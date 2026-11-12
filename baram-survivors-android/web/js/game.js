import {
  CLASSES, SKILLS, PASSIVES, STAGES, MAX_SKILLS, MAX_SKILL_LEVEL, STAGE_SECONDS, BOSS_AT, MINI_AT, FX,
  skillStats, skillName, levelText,
} from './data.js';
import { Audio } from './audio.js';
import {
  initAvatars, hasAvatars, avatarPaths, dress, drawAvatar, facing, portrait, gearName, gearIcon, GEAR, WALK_MS,
} from './avatar.js';

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
  applySounds();
  audio.setBgm(settings.bgm);
  audio.setSfx(settings.sfx);
  const paths = [
    ...Object.keys(M.fx).map(id => `fx/${id}.png`),
    ...Object.keys(M.fx).map(id => `icon/${id}.png`),
    ...M.heroes.map(h => `hero/${h.id}.png`),
    ...Object.values(M.items).map(i => `item/${i.id}.png`),
    ...M.monsters.map(m => `mon/${m.id}.png`),
    ...avatarPaths(M),
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
  initAvatars(M, images);
  $('#version').textContent = M.version ? `빌드 ${M.version}` : '';
  $('#heroes').innerHTML = CLASSES.map(c => `<img src="${heroPicture(c)}" alt="${c.name}">`).join('');
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
      // Grass as the old maps drew it: an even ground with small tufts, not big soft patches.
      g.fillStyle = base;
      g.fillRect(0, 0, 256, 256);
      blot(a, 60, 2, 5, 0.7);
      blot(b, 40, 2, 4, 0.7);
      for (let i = 0; i < 140; i++) {
        const x = Math.floor(rnd() * 254), y = Math.floor(rnd() * 254);
        g.fillStyle = i % 2 ? '#4b6630' : '#3f5a28';
        g.fillRect(x, y + 1, 1, 2);
        g.fillRect(x + 2, y + 1, 1, 2);
        g.fillStyle = '#86a85a';
        g.fillRect(x + 1, y, 1, 3);
      }
      specks(['#7a9a4c', '#4b6630'], 200, 1, 1);
      specks(['#e8d36a', '#f2f2f2', '#d9604a'], 10, 1, 1);
      stones('#8b8a74', '#6b6a58', 5);
      break;
    }
    case 'cave':
      g.fillStyle = '#5a4632';
      g.fillRect(0, 0, 256, 256);
      blot('#4e3c2a', 70, 2, 6, 0.7);
      blot('#685140', 50, 2, 4, 0.7);
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
  // The side panel keeps the old client's 272 x 640 layout, scaled to the screen's height.
  const k = innerHeight / 640;
  document.documentElement.style.setProperty('--side', Math.round(272 * k) + 'px');
  const panel = document.getElementById('panel');
  if (panel) panel.style.transform = `scale(${k})`;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(canvas.clientWidth * dpr);
  canvas.height = Math.round(canvas.clientHeight * dpr);
  Z = Math.max(1, Math.round(canvas.height / 470));
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
  // In a hunt: the old client's screen, a framed view with the carved panel at its side.
  const hunting = name === null;
  document.body.classList.toggle('hunting', hunting);
  $('#side').hidden = $('#play-frame').hidden = !hunting;
  document.body.classList.toggle('panel-off', hunting && settings.panel === false);
  $('#unfold').hidden = $('#mini').hidden = !(hunting && settings.panel === false);
  resize();
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
    b.innerHTML = `<div class="slot"><img class="hero" src="${heroPicture(c)}" alt=""></div>
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
//
// As in the old game, monsters stand on a grid of 48-pixel tiles and move one tile at a time,
// up, down, left or right; a tile holds one monster, and they strike from the four tiles next
// to the hero. The hero also moves only up, down, left or right, but freely, without stopping
// on tiles, and is never blocked: being walled in by monsters was too harsh for this genre.

const TILE = 48;
const occ = new Map(); // "tx,ty" -> the body on that tile
const key = (x, y) => x + ',' + y;
const DIRS = [[0, 1], [-1, 0], [1, 0], [0, -1]];

function place(b, tx, ty) {
  b.tx = b.fx = tx;
  b.ty = b.fy = ty;
  b.mt = 0;
  b.moving = false;
  occ.set(key(tx, ty), b);
  locate(b);
}

/** Pixel position of a body's feet, between its last tile and the next while it steps. */
function locate(b) {
  const k = b.moving ? Math.min(1, b.mt / b.dur) : 1;
  b.x = (b.fx + (b.tx - b.fx) * k) * TILE + TILE / 2;
  b.y = (b.fy + (b.ty - b.fy) * k) * TILE + TILE - 6;
}

function free(tx, ty) {
  const p = G.player;
  return !occ.has(key(tx, ty)) && !(p.tx === tx && p.ty === ty);
}

/** The tile under the hero's feet. */
function heroTile() {
  const p = G.player;
  p.tx = Math.floor(p.x / TILE);
  p.ty = Math.floor((p.y - TILE / 2 + 6) / TILE);
}

/** Starts a one-tile step; false when the tile is taken. */
function step(b, dx, dy, dur) {
  const nx = b.tx + dx, ny = b.ty + dy;
  if (!free(nx, ny)) return false;
  occ.delete(key(b.tx, b.ty));
  occ.set(key(nx, ny), b);
  b.fx = b.tx;
  b.fy = b.ty;
  b.tx = nx;
  b.ty = ny;
  b.mt = 0;
  b.dur = dur;
  b.moving = true;
  if (dx) b.face = dx > 0 ? 1 : -1;
  return true;
}

function advance(b, dt) {
  if (b.moving) {
    b.mt += dt;
    b.phase += (dt / b.dur) * 2 * Math.PI;
    if (b.mt >= b.dur) {
      b.moving = false;
      b.fx = b.tx;
      b.fy = b.ty;
    }
  }
  locate(b);
}

function tdist(a, b) {
  return Math.hypot(a.tx - b.tx, a.ty - b.ty);
}

function startRun(cls, stage) {
  const hero = M.heroes.find(h => h.id === cls.hero);
  const gear = savedGear(cls);
  const mons = stageMonsters(stage);
  occ.clear();
  G = {
    cls, stage, ...mons, level: STAGES.indexOf(stage), ground: makeGround(stage.terrain),
    t: 0, kills: 0, gold: 0, over: false, dead: false, paused: false, choosing: false, cleared: false, revived: false,
    player: {
      hp: cls.hp, maxHp: cls.hp, mp: cls.mp * 0.5, maxMp: cls.mp, speed: cls.speed, armor: cls.armor,
      face: 1, fdx: 0, fdy: 1, phase: 0, lvl: 1, xp: 0, next: xpFor(1), inv: 0,
      img: images[`hero/${hero.id}.png`], hero: true, gear, av: hasAvatars() ? dress(cls.id, gear) : null,
      pose: null, poseT: 0, walkT: 0,
    },
    skills: [], passives: Object.fromEntries(Object.keys(PASSIVES).map(k => [k, 0])),
    buffs: { power: 0, stealth: 0, guard: 0, shield: 0 },
    enemies: [], dying: [], allies: [], fxs: [], drops: [], texts: [], log: [],
    bubble: null, spawnT: 0, waveT: 50, minis: MINI_AT.slice(), bossDue: true, pendingLevels: 0, shake: 0,
  };
  G.player.x = TILE / 2;
  G.player.y = TILE - 6;
  heroTile();
  applyGear();
  addSkill(cls.start);
  showScreen(null);
  audio.bgm(huntMusic());
  $('#chat').innerHTML = '';
  $('#vert').innerHTML = '';
  say(`${stage.name}에 들어왔습니다.`, 'sys');
  say(stage.intro);
}

// ---------------------------------------------------------------- gear
//
// Each class wears its own line of gear (avatar.js GEAR). Chests from middle bosses and bosses
// hand out the next piece; what a class has found stays for its later hunts, as in the game.

function savedGear(cls) {
  progress.gear = progress.gear || {};
  return Object.assign({ armor: 0, weapon: 0, shield: -1 }, progress.gear[cls.id]);
}

/** Stats from the gear worn: weapons hit harder, armor gives health, shields guard. */
function applyGear() {
  const p = G.player, g = p.gear;
  const hp = G.cls.hp + g.armor * 20;
  p.hp += hp - (p.gearHp || G.cls.hp);
  p.maxHp += hp - (p.gearHp || G.cls.hp);
  p.gearHp = hp;
  p.armor = G.cls.armor + Math.max(0, g.shield + 1);
  p.gearPower = 1 + 0.12 * g.weapon;
}

/** The next piece of gear from a chest, if any is left; true when one was given. */
function nextGear() {
  const p = G.player, g = p.gear, line = GEAR[G.cls.id];
  // The piece furthest behind along its line comes first, so all three move up together.
  const order = ['weapon', 'armor', 'shield'].sort((a, b) => (g[a] + 1) / line[a].length - (g[b] + 1) / line[b].length);
  for (const kind of order) {
    if (g[kind] + 1 >= line[kind].length) continue;
    g[kind]++;
    progress.gear[G.cls.id] = { ...g };
    saveJson('bs_progress', progress);
    if (hasAvatars()) p.av = dress(G.cls.id, g);
    applyGear();
    const name = gearName(G.cls.id, kind, g[kind]);
    say(`${josa(name, '을', '를')} 얻었습니다!`, 'sys');
    note(`${name} 착용`);
    return true;
  }
  return false;
}

/** A class's figure in the gear it has found, for the menus. */
function heroPicture(cls) {
  if (!hasAvatars()) return `assets/hero/${cls.hero}.png`;
  return portrait(dress(cls.id, savedGear(cls)));
}

/** Shows an attack or casting pose for a moment. */
function strikePose(kind) {
  const p = G.player;
  p.pose = kind;
  p.poseT = kind === 'attack' ? 0.22 : 0.3;
}

/** The music key of the ground being hunted. */
function huntMusic() {
  return 'stage_' + G.stage.id;
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
  let k = G.player.gearPower || 1;
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

/** Pixels a second the hero walks. */
function heroSpeed() {
  return (TILE / 0.24) * (G.player.speed / 70) * (1 + 0.08 * G.passives.speed);
}

function update(dt) {
  G.t += dt;
  const p = G.player;

  if (!G.dead) {
    const [dx, dy] = input();
    p.moving = !!(dx || dy);
    if (p.moving) {
      p.fdx = dx;
      p.fdy = dy;
      if (dx) p.face = dx;
      p.x += dx * heroSpeed() * dt;
      p.y += dy * heroSpeed() * dt;
      p.walkT += dt * 1000;
      p.phase += (heroSpeed() * dt / (TILE / 2)) * Math.PI;
      heroTile();
    }
    p.inv = Math.max(0, p.inv - dt);
    p.poseT = Math.max(0, p.poseT - dt);
    p.mp = Math.min(p.maxMp, p.mp + (p.maxMp / 45) * (1 + 0.25 * G.passives.mana) * dt);
  }
  G.shake = Math.max(0, G.shake - dt);

  spawn(dt);
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
  updateAllies(dt);
  if (!G.dead) updatePickups(dt);
  for (const f of G.fxs) f.t += dt;
  G.fxs = G.fxs.filter(f => f.t < f.life);
  for (const d of G.dying) d.t += dt;
  G.dying = G.dying.filter(d => d.t < 1.2);
  for (const t of G.texts) {
    t.t += dt;
    if (t.t < 0.15) t.y -= 40 * dt;
  }
  G.texts = G.texts.filter(t => t.t < 1.1);
  if (G.bubble && G.t - G.bubble.t > 1.3) G.bubble = null;
}

// ---------------------------------------------------------------- monsters

/** Tiles from the hero to the edge of the screen, and a little beyond. */
function viewTiles() {
  return { w: Math.ceil(VW / TILE / 2) + 1, h: Math.ceil(VH / TILE / 2) + 1 };
}

/** A free tile just outside the screen. */
function ringTile() {
  const p = G.player, v = viewTiles();
  for (let tries = 0; tries < 40; tries++) {
    let tx, ty;
    if (Math.random() < 0.5) {
      tx = p.tx + Math.floor(rand(-v.w, v.w + 1));
      ty = p.ty + (Math.random() < 0.5 ? -v.h : v.h);
    } else {
      tx = p.tx + (Math.random() < 0.5 ? -v.w : v.w);
      ty = p.ty + Math.floor(rand(-v.h, v.h + 1));
    }
    if (free(tx, ty)) return [tx, ty];
  }
  return null;
}

function spawn(dt) {
  const t = G.t;
  const want = Math.min(130, 5 + t * 0.13 + (t > 300 ? 15 : 0) + (G.cleared ? 30 : 0));
  G.spawnT -= dt;
  if (G.spawnT <= 0 && G.enemies.length < want) {
    G.spawnT = Math.max(0.15, 1.1 - t / 400);
    const n = 1 + Math.floor(t / 150);
    for (let i = 0; i < n && G.enemies.length < want; i++) addEnemy(pickMonster());
  }
  G.waveT -= dt;
  if (G.waveT <= 0) {
    // A pack of one kind from one side.
    G.waveT = 60;
    const m = pickMonster();
    for (let i = 0; i < 6 + Math.floor(t / 60); i++) addEnemy(m);
  }
  if (G.minis.length && t >= G.minis[0]) {
    G.minis.shift();
    addEnemy(G.mini.m, 'mini', G.mini);
    say(`${josa(G.mini.name, '이', '가')} 나타났습니다!`, 'warn');
    banner(`${G.mini.name} 등장`);
  }
  if (G.bossDue && t >= BOSS_AT) {
    G.bossDue = false;
    addEnemy(G.boss.m, 'boss', G.boss);
    audio.play('boss');
    audio.bgm('boss');
    G.shake = 0.6;
    say(`${josa(G.boss.name, '이', '가')} 나타났습니다!`, 'warn');
    banner(`보스 ${G.boss.name} 등장!`);
  }
}

function pickMonster() {
  const c = Math.min(1, G.t / (STAGE_SECONDS * 0.8));
  const r = Math.min(1, Math.max(0, c + (Math.random() - 0.7) * 0.5));
  return G.pool[Math.round(r * (G.pool.length - 1))];
}

function addEnemy(m, kind = null, named = null) {
  const at = ringTile();
  if (!at) return;
  const t = G.t;
  const tough = (1 + G.level * 0.15) * (1 + t / 150) * (G.cleared ? 1.5 : 1);
  const rank = kind ? 1 : m.rank;
  let hp = (6 + m.area / 70) * tough;
  if (kind === 'mini') hp = (70 + m.area / 10) * tough * 2;
  if (kind === 'boss') hp = (180 + m.area / 5) * tough * 4;
  const e = {
    m, hp, maxHp: hp, kind, name: named && named.name, scale: named ? named.scale : 1,
    // Seconds per tile: small monsters scurry, big ones lumber.
    stepTime: kind ? 0.7 : 0.75 - 0.35 * (1 - rank) - Math.min(0.15, t / 3000),
    dmg: (kind === 'boss' ? 13 : kind === 'mini' ? 8 : 2 + rank * 3.5) + t / 180 + G.level * 0.5,
    xp: kind === 'boss' ? 60 : kind === 'mini' ? 20 : 1 + Math.floor(rank * 4 + t / 300),
    face: 1, phase: Math.random() * 6, flash: 0, slow: 0, stun: 0, curse: 0, cd: Math.random() * 0.5, atk: 0.6,
    lunge: 0, hits: new Map(),
  };
  place(e, at[0], at[1]);
  G.enemies.push(e);
}

/** Directions toward a tile, best first: the longer way, then the shorter, then around. */
function towards(b, tx, ty) {
  const dx = Math.sign(tx - b.tx), dy = Math.sign(ty - b.ty);
  const horiz = Math.abs(tx - b.tx) >= Math.abs(ty - b.ty);
  const first = horiz ? [dx, 0] : [0, dy], second = horiz ? [0, dy] : [dx, 0];
  const out = [];
  if (first[0] || first[1]) out.push(first);
  if (second[0] || second[1]) out.push(second);
  return out;
}

function moveEnemies(dt) {
  const p = G.player;
  const v = viewTiles();
  const hidden = G.buffs.stealth > G.t || G.dead;
  for (const e of G.enemies) {
    advance(e, dt);
    e.flash = Math.max(0, e.flash - dt);
    e.lunge = Math.max(0, e.lunge - dt);
    e.slow = Math.max(0, e.slow - dt);
    e.stun = Math.max(0, e.stun - dt);
    e.curse = Math.max(0, e.curse - dt);
    if (e.moving || e.stun > 0) continue;
    if (!e.kind && (Math.abs(e.tx - p.tx) > v.w + 4 || Math.abs(e.ty - p.ty) > v.h + 4)) {
      // Left far behind: come back from the edge of the screen.
      const at = ringTile();
      if (at) {
        occ.delete(key(e.tx, e.ty));
        place(e, at[0], at[1]);
      }
      continue;
    }
    e.cd -= dt;
    e.atk -= dt;
    const next = Math.abs(e.tx - p.tx) + Math.abs(e.ty - p.ty) <= 1; // beside, or under the hero
    if (next && !hidden) {
      // Beside the hero: strike, as monsters do, from the next tile.
      e.face = p.tx >= e.tx ? 1 : -1;
      if (e.atk <= 0 && !barred(e)) {
        e.atk = 1.6;
        e.lunge = 0.15;
        hurtPlayer(e.dmg);
      }
      continue;
    }
    if (e.cd > 0) continue;
    const st = e.stepTime * (e.slow > 0 ? 2 : 1);
    e.cd = st;
    if (hidden) {
      const [dx, dy] = DIRS[Math.floor(Math.random() * 4)];
      step(e, dx, dy, st);
      continue;
    }
    let moved = false;
    for (const [dx, dy] of towards(e, p.tx, p.ty)) {
      if (step(e, dx, dy, st)) {
        moved = true;
        break;
      }
    }
    if (!moved && Math.random() < 0.3) {
      // Blocked: sidestep, so a crowd flows around instead of jamming.
      const [dx, dy] = DIRS[Math.floor(Math.random() * 4)];
      step(e, dx, dy, st);
    }
  }
}

/** 차폐: monsters next to the hero cannot touch them while it holds. */
function barred(e) {
  return G.skills.some(s => SKILLS[s.id].kind === 'aura');
}

function hurtPlayer(dmg) {
  const p = G.player;
  if (G.buffs.guard > G.t || p.inv > 0) return;
  let taken = Math.max(1, dmg - p.armor - G.passives.armor);
  if (G.buffs.shield > G.t) taken = Math.max(1, taken / 2);
  p.hp -= taken;
  p.inv = 0.25;
  audio.play('hurt');
  floatText(p.x, p.y - 64, '-' + Math.round(taken), '#ff6060');
  if (p.hp <= 0) die();
}

function hurtEnemy(e, dmg) {
  if (e.hp <= 0) return 0;
  dmg *= (0.9 + Math.random() * 0.2) * might() * (e.curse > 0 ? 1.4 : 1);
  e.hp -= dmg;
  e.flash = 0.12;
  e.shown = G.t;
  if (settings.numbers) floatText(e.x, e.y - e.m.h * e.scale - 8, Math.round(dmg), '#ffffff', true);
  if (e.hp <= 0) killEnemy(e);
  else audio.play('hit');
  return dmg;
}

function killEnemy(e) {
  G.kills++;
  G.enemies.splice(G.enemies.indexOf(e), 1);
  occ.delete(key(e.tx, e.ty));
  G.dying.push({ e, t: 0 });
  audio.play('kill');
  const p = G.player;
  p.mp = Math.min(p.maxMp, p.mp + 0.6);
  // Experience comes at the kill, as in the game: nothing to pick up.
  gainXp(e.xp);
  const roll = Math.random();
  if (e.kind) {
    G.drops.push({ x: e.x, y: e.y, kind: 'chest' });
    say(`${josa(e.name, '을', '를')} 쓰러뜨렸습니다!`);
    if (e.kind === 'boss') clearStage();
    else if (!G.enemies.some(o => o.kind === 'boss')) audio.bgm(huntMusic());
  } else if (roll < 0.006) G.drops.push({ x: e.x, y: e.y, kind: 'heal' });
  else if (roll < 0.04) G.drops.push({ x: e.x, y: e.y, kind: 'coin' });
}

function clearStage() {
  audio.bgm(huntMusic());
  if (G.cleared) return;
  G.cleared = true;
  audio.play('win');
  progress.cleared[G.stage.id] = true;
  saveJson('bs_progress', progress);
  record();
  const next = STAGES[STAGES.indexOf(G.stage) + 1];
  say(`${josa(G.stage.name, '을', '를')} 정복했습니다!`, 'sys');
  if (next) say(`이제 ${next.name}에 들어갈 수 있습니다.`);
  banner(`${G.stage.name} 정복!`);
}

// ---------------------------------------------------------------- skills
//
// Spells land on their target at once, as in the game: no flying bolts. Sizes are in tiles.

function nearestEnemies(n, range, from = G.player) {
  return G.enemies
    .map(e => [e, tdist(e, from)])
    .filter(([, d]) => d <= range)
    .sort((a, b) => a[1] - b[1])
    .slice(0, n)
    .map(([e]) => e);
}

/** Monsters within a square of tiles around a tile (radius 1 = the eight around it). */
function around(tx, ty, r) {
  const out = [];
  for (let x = tx - r; x <= tx + r; x++) {
    for (let y = ty - r; y <= ty + r; y++) {
      const b = occ.get(key(x, y));
      if (b && b.m && b.hp > 0 && !b.ally) out.push(b);
    }
  }
  return out;
}

/** Where an effect sits on a body: tall pillars stand on its feet, the rest on its middle. */
function fxOn(id, b, o = {}) {
  const f = M.fx[id];
  const tall = f.h > f.w * 1.4;
  const h = b.m ? b.m.h * b.scale : b.img.height;
  return addFx(id, b.x, tall ? b.y + 4 : b.y - h / 2, { anchor: tall ? 'bottom' : 'center', ...o });
}

function cast(skill, st) {
  const def = SKILLS[skill.id];
  const p = G.player;
  let used = true;
  const retry = t => {
    used = false;
    skill.timer = t;
  };
  switch (def.kind) {
    case 'slash': {
      // 기본 공격: the tile ahead; 후면/측면 공격 add the tiles behind and beside; n중공격 hits again.
      const lv = skill.lv;
      const hits = 1 + (lv >= 2) + (lv >= 4) + (lv >= 6) + (lv >= 8);
      const under = occ.get(key(p.tx, p.ty));
      if (under && under.m && !under.ally) {
        if (def.fx) fxOn(def.fx, under);
        hurtEnemy(under, st.dmg);
      }
      const near = DIRS.filter(([dx, dy]) => { const b = occ.get(key(p.tx + dx, p.ty + dy)); return b && b.m && !b.ally; });
      if (!near.length) return under ? undefined : retry(0.12);
      // Turn to face a monster beside the hero, as a player would before swinging.
      if (!near.some(([dx, dy]) => dx === p.fdx && dy === p.fdy)) {
        [p.fdx, p.fdy] = near[0];
        if (p.fdx) p.face = p.fdx;
      }
      const dirs = [[p.fdx, p.fdy]];
      if (lv >= 3) dirs.push([-p.fdx, -p.fdy]);
      if (lv >= 5) dirs.push([p.fdy, p.fdx], [-p.fdy, -p.fdx]);
      const dmg = st.dmg * (lv >= 7 ? 1.3 : 1) / Math.sqrt(hits);
      for (let h = 0; h < hits; h++) {
        later(h * 0.14, () => {
          for (const [dx, dy] of dirs) {
            const b = occ.get(key(p.tx + dx, p.ty + dy));
            if (!b || !b.m || b.ally) continue;
            if (def.fx) fxOn(def.fx, b, { rot: (h % 2) * 0.6 });
            hurtEnemy(b, dmg);
          }
        });
      }
      break;
    }
    case 'blink': {
      // 비영승보: to the tile behind the nearest monster, striking it.
      const e = nearestEnemies(1, st.range)[0];
      if (!e) return retry(0.25);
      const dx = Math.sign(e.tx - p.tx), dy = Math.sign(e.ty - p.ty);
      const [bx, by] = Math.abs(e.tx - p.tx) >= Math.abs(e.ty - p.ty) ? [e.tx + dx, e.ty] : [e.tx, e.ty + dy];
      // Not into the middle of a pack: 비영승보 is for getting behind one, not into many.
      if (!occ.has(key(bx, by)) && around(bx, by, 1).length < 3) {
        addFx(def.fx, p.x, p.y - 26, { scale: 0.7 });
        p.x = bx * TILE + TILE / 2;
        p.y = by * TILE + TILE - 6;
        heroTile();
        p.fdx = -Math.sign(bx - e.tx);
        p.fdy = -Math.sign(by - e.ty);
        if (p.fdx) p.face = p.fdx;
      }
      for (let i = 0; i < st.count; i++) {
        later(i * 0.12, () => {
          if (e.hp <= 0) return;
          fxOn(def.fx, e);
          hurtEnemy(e, st.dmg);
        });
      }
      break;
    }
    case 'spell': {
      let targets = nearestEnemies(st.count * 3, st.range);
      if (def.weakest) targets.sort((a, b) => a.hp - b.hp);
      targets = targets.slice(0, st.count);
      if (!targets.length) return retry(0.25);
      targets.forEach((e, i) => later(i * 0.1, () => {
        if (e.hp <= 0) return;
        const life = fxOn(def.fx, e);
        later(life * 0.3, () => {
          const dealt = hurtEnemy(e, st.dmg + (def.scaleHp ? p.maxHp * def.scaleHp : 0));
          if (def.drain && dealt) heal(dealt * def.drain, false, true);
        });
      }));
      break;
    }
    case 'spell4': {
      // The 첨 spells: the first monster up, down, left and right of the hero.
      let any = false;
      for (const [dx, dy] of DIRS) {
        for (let k = 1; k <= st.range; k++) {
          const b = occ.get(key(p.tx + dx * k, p.ty + dy * k));
          if (b && b.m && !b.ally) {
            any = true;
            fxOn(def.fx, b);
            hurtEnemy(b, st.dmg);
            break;
          }
        }
      }
      if (!any) return retry(0.3);
      break;
    }
    case 'strike': {
      // On a monster near the hero, and the tiles around it as the spell grows.
      const targets = nearestEnemies(st.count * 3, st.range).sort(() => Math.random() - 0.5).slice(0, st.count);
      if (!targets.length) return retry(0.3);
      targets.forEach((e, i) => {
        const tx = e.tx, ty = e.ty;
        const life = fxOn(def.fx, e, { delay: i * 0.12 });
        later(i * 0.12 + life * (def.hitAt || 0.3), () => {
          G.shake = Math.max(G.shake, 0.08);
          for (const o of around(tx, ty, st.radius)) {
            if (def.slow) o.slow = def.slow;
            if (def.stun) o.stun = def.stun;
            if (def.curse) o.curse = def.curse;
            hurtEnemy(o, st.dmg);
          }
        });
      });
      break;
    }
    case 'nova': {
      if (def.hpCost) p.hp = Math.max(1, p.hp * (1 - def.hpCost));
      addFx(def.fx, 0, -26, { follow: true });
      later(0.1, () => {
        for (const e of around(p.tx, p.ty, st.radius)) {
          if (def.stun) e.stun = def.stun;
          hurtEnemy(e, st.dmg);
        }
      });
      break;
    }
    case 'aura': {
      // 차폐: the monsters beside the hero cannot strike, and are worn down.
      let h = G.fxs.find(f => f.aura === skill);
      if (!h) {
        h = { id: def.fx, x: 0, y: -30, t: 0, life: Infinity, scale: 1, rot: 0, follow: true, anchor: 'center',
          aura: skill, loop: true, alpha: 0.7 };
        G.fxs.push(h);
      }
      for (const e of around(p.tx, p.ty, 1)) hurtEnemy(e, st.dmg);
      used = false;
      break;
    }
    case 'summon': {
      for (let i = 0; i < st.count; i++) {
        const m = monsterById[def.allies[(skill.lv + i) % def.allies.length]];
        const spot = DIRS.map(([dx, dy]) => [p.tx + dx, p.ty + dy]).find(([x, y]) => free(x, y));
        if (!m || !spot) continue;
        const a = { m, ally: true, scale: 1, t: 0, life: st.duration, dmg: st.dmg, face: 1, phase: 0, cd: 0, atk: 0,
          hp: 1, flash: 0 };
        place(a, spot[0], spot[1]);
        addFx(def.fx, a.x, a.y - 20, { scale: 0.8 });
        G.allies.push(a);
      }
      break;
    }
    case 'heal': {
      if (p.hp >= p.maxHp) return retry(1);
      heal(st.heal, false);
      audio.play('skill_' + skill.id, def.kind, skill.lv);
      note(`${skillName(skill.id, skill.lv)}의 효과를 받습니다.`);
      used = false;
      break;
    }
    case 'buff': {
      G.buffs[def.buff] = G.t + st.duration;
      if (def.buff === 'power') G.buffs.powerK = def.power;
      note(`${skillName(skill.id, skill.lv)}의 효과를 받습니다.`);
      addFx(def.fx, 0, -26, { follow: true });
      break;
    }
  }
  if (used) {
    audio.play('skill_' + skill.id, def.kind, skill.lv);
    const melee = def.kind === 'slash' || def.kind === 'blink' || (def.kind === 'spell' && G.cls.id === 'warrior');
    strikePose(melee ? 'attack' : 'magic');
  }
}

/** The class's finishing spell: costs all mana (and some health for the fighters). */
function castUlt() {
  if (!G || G.over || G.dead || G.paused || G.choosing) return;
  const p = G.player;
  if (p.mp < p.maxMp) return;
  const def = SKILLS[G.cls.ult];
  p.mp = 0;
  if (def.hpCost) p.hp = Math.max(1, p.hp * (1 - def.hpCost));
  G.bubble = { text: `${def.name}!`, t: G.t };
  strikePose(G.cls.id === 'warrior' || G.cls.id === 'rogue' ? 'attack' : 'magic');
  say(`${def.name}!`);
  audio.play('skill_' + G.cls.ult, 'ult');
  G.shake = 0.5;
  const lvl = p.lvl, pw = 1 + 0.1 * G.passives.power;
  const v = viewTiles();
  const onScreen = () => G.enemies.filter(e => Math.abs(e.tx - p.tx) <= v.w && Math.abs(e.ty - p.ty) <= v.h);
  switch (G.cls.ult) {
    case 'w_ult': {
      // 건곤대나이: "spends health to strike the enemies in front" — four tiles ahead, three wide,
      // with strength from the warrior's health.
      const fdx = p.fdx || p.face, fdy = p.fdx ? 0 : p.fdy;
      addFx(def.fx, fdx * TILE * 2, fdy * TILE * 2 - 26, { follow: true, scale: 1.3 });
      later(0.15, () => G.enemies.slice().forEach(e => {
        const ahead = (e.tx - p.tx) * fdx + (e.ty - p.ty) * fdy;
        const side = Math.abs((e.tx - p.tx) * fdy - (e.ty - p.ty) * fdx);
        if (ahead >= 0 && ahead <= 4 && side <= 1) hurtEnemy(e, p.maxHp * 2.6 * pw);
      }));
      break;
    }
    case 'r_ult': {
      const list = around(p.tx, p.ty, 4);
      for (let k = 0; k < 3; k++) {
        later(k * 0.2, () => list.forEach((e, i) => {
          if (e.hp <= 0) return;
          if (i < 30) fxOn(def.fx, e, { rot: k });
          hurtEnemy(e, (40 + lvl * 9) * pw);
        }));
      }
      break;
    }
    case 'm_ult': {
      const list = onScreen();
      list.slice(0, 12).forEach((e, i) => fxOn(def.fx, e, { delay: i * 0.05 }));
      later(0.5, () => list.forEach(e => hurtEnemy(e, (70 + lvl * 14) * pw)));
      G.buffs.shield = G.t + def.shield;
      addFx(FX.shield, 0, -26, { follow: true, scale: 0.6 });
      break;
    }
    case 'p_ult': {
      heal(p.maxHp, true);
      G.buffs.guard = G.t + def.guard;
      addFx(def.fx, 0, -26, { follow: true, scale: 1.3 });
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

/** Summoned helpers walk the grid like monsters and bite what stands beside them. */
function updateAllies(dt) {
  for (const a of G.allies) {
    a.t += dt;
    advance(a, dt);
    if (a.moving) continue;
    a.cd -= dt;
    a.atk -= dt;
    const beside = DIRS.map(([dx, dy]) => occ.get(key(a.tx + dx, a.ty + dy))).find(b => b && b.m && !b.ally && b.hp > 0);
    if (beside) {
      a.face = beside.tx >= a.tx ? 1 : -1;
      if (a.atk <= 0) {
        a.atk = 0.6;
        hurtEnemy(beside, a.dmg);
      }
      continue;
    }
    if (a.cd > 0) continue;
    a.cd = 0.3;
    const tgt = nearestEnemies(1, 8, a)[0] || G.player;
    for (const [dx, dy] of towards(a, tgt.tx, tgt.ty)) if (step(a, dx, dy, 0.28)) break;
  }
  for (const a of G.allies) if (a.t >= a.life) occ.delete(key(a.tx, a.ty));
  G.allies = G.allies.filter(a => a.t < a.life);
}

// ---------------------------------------------------------------- pickups and levels

function updatePickups(dt) {
  const p = G.player;
  // 노획 reaches for dropped things from further away.
  const reach = TILE * (0.7 + 0.5 * G.passives.magnet);
  for (const d of G.drops) {
    if (Math.hypot(d.x - p.x, d.y - p.y) < reach) {
      d.taken = true;
      if (d.kind === 'heal') heal(30, true);
      else if (d.kind === 'coin') {
        const n = 5 + Math.floor(Math.random() * 10 * (1 + G.level));
        G.gold += n;
        note(`${n}전을 주웠습니다.`);
        audio.play('pickup');
      } else if (d.kind === 'chest') {
        G.gold += 100 * (1 + G.level);
        heal(p.maxHp * 0.3, false);
        audio.play('chest');
        note('보물 상자를 열었습니다.');
        nextGear();
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
  floatText(p.x, p.y - 64, '+' + Math.round(n), '#7dff8a');
  if (!quiet) addFx(FX.heal, 0, -26, { follow: true });
  if (sound) audio.play('heal');
}

function gainXp(v) {
  const p = G.player;
  p.xp += v;
  p.total = (p.total || 0) + v;
  while (p.xp >= p.next) {
    p.xp -= p.next;
    p.lvl++;
    p.next = xpFor(p.lvl);
    G.pendingLevels++;
    say(`레벨이 올랐습니다. (Lv ${p.lvl})`, 'sys');
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
  addFx(FX.levelup, 0, -26, { follow: true });
  $('#lv-title').textContent = `레벨 ${G.player.lvl}`;
  const box = $('#choices');
  box.innerHTML = '';
  for (const o of picks) {
    const b = document.createElement('button');
    b.className = 'choice';
    let icon, name, text, tag;
    if (o.type === 'skill') {
      const def = SKILLS[o.id];
      icon = !def.fx ? itemIcon('p_power') : def.fx === 'hero' ? heroIcon() : fxIcon(def.fx);
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
  if (!G.choosing) return; // a second tap on the same card
  if (o.type === 'skill') {
    addSkill(o.id);
    say(`${josa(skillName(o.id, o.lv), '을', '를')} 익혔습니다.`);
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
    say('부활 마법으로 다시 일어났습니다.');
    addFx(FX.levelup, 0, -26, { follow: true, scale: 1.4 });
    audio.play('revive');
    return;
  }
  G.dead = true;
  p.hp = 0;
  audio.play('lose');
  audio.stopBgm();
  say('유령이 되었습니다…', 'warn');
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
/** A line in the side panel's message window: effects received, things picked up. */
function note(text) {
  const box = $('#vert');
  const p = document.createElement('p');
  p.textContent = text;
  box.append(p);
  while (box.children.length > 8) box.firstChild.remove();
}

/** A line in the chat window. kind 'sys' is the blue system line, 'warn' red. */
function say(text, kind = '') {
  const chat = $('#chat');
  const p = document.createElement('p');
  p.textContent = text;
  if (kind) p.className = kind;
  chat.append(p);
  while (chat.children.length > 4) chat.firstChild.remove();
}

/** The right particle after a Korean word: josa('서생원', '이', '가') -> '서생원이'. */
function josa(word, withFinal, without) {
  const c = word.charCodeAt(word.length - 1);
  const has = c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0;
  return word + (has ? withFinal : without);
}

/** Big numbers with a heavy dark edge, as the game shows damage and healing. */
function thick(text, x, y, color) {
  x = Math.round(x);
  y = Math.round(y);
  ctx.fillStyle = '#1a1a1a';
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 2; dy++) if (dx || dy) ctx.fillText(text, x + dx, y + dy);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function floatText(x, y, text, color, box = false) {
  if (G.texts.length > 50) G.texts.shift();
  G.texts.push({ x: x + rand(-4, 4), y, text: String(text), color, t: 0, box });
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

/** One of the four directions, or none: the grid has no diagonals. */
function input() {
  let x = 0, y = 0;
  if (window.__botInput) [x, y] = window.__botInput(G);
  else if (joy.id !== null) {
    x = joy.x - joy.ox;
    y = joy.y - joy.oy;
    if (Math.hypot(x, y) < 10) x = y = 0;
  } else {
    // The key held down last wins, so turning a corner feels right.
    for (const k of keys) {
      if (k === 'KeyA' || k === 'ArrowLeft') [x, y] = [-1, 0];
      if (k === 'KeyD' || k === 'ArrowRight') [x, y] = [1, 0];
      if (k === 'KeyW' || k === 'ArrowUp') [x, y] = [0, -1];
      if (k === 'KeyS' || k === 'ArrowDown') [x, y] = [0, 1];
    }
  }
  if (!x && !y) return [0, 0];
  return Math.abs(x) >= Math.abs(y) ? [Math.sign(x), 0] : [0, Math.sign(y)];
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

function silhouette(img) {
  let c = shadowCache.get(img);
  if (!c) {
    c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = '#000';
    g.fillRect(0, 0, c.width, c.height);
    shadowCache.set(img, c);
  }
  return c;
}
const shadowCache = new Map();

/**
 * A still sprite on the move. The old game's characters do not sway or tilt as they walk:
 * the body stays upright and only the steps show. With one picture per body, a step is a
 * one-pixel rise on alternate footfalls; the shadow, cast up and to the right as in the
 * game, carries the sense of weight.
 */
function drawWalker(img, x, y, face, phase, moving, flash, scale = 1, alpha = 1) {
  const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
  const lift = moving && Math.floor(phase / Math.PI) % 2 === 0 ? 1 : 0;
  x = Math.round(x);
  y = Math.round(y);
  // Shadow: the silhouette laid on the floor, sheared to the upper right.
  ctx.save();
  ctx.globalAlpha = 0.32 * alpha;
  ctx.transform(1, 0, -0.75, 0.42, x, y);
  ctx.scale(face, 1);
  ctx.drawImage(silhouette(img), -w / 2, -h, w, h);
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y - lift);
  ctx.scale(face, 1);
  ctx.drawImage(img, -w / 2, -h, w, h);
  if (flash > 0) {
    ctx.globalAlpha = alpha;
    ctx.drawImage(white(img), -w / 2, -h, w, h);
  }
  ctx.restore();
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
  let camX = Math.round(p.x - VW / 2), camY = Math.round(p.y - 30 - VH / 2);
  if (G.shake > 0) {
    camX += Math.round(rand(-2, 2));
    camY += Math.round(rand(-2, 2));
  }
  ctx.setTransform(Z, 0, 0, Z, -camX * Z, -camY * Z);
  ctx.fillStyle = G.ground;
  ctx.fillRect(camX, camY, VW, VH);

  // On the ground: experience, money, boxes.
  for (const d of G.drops) {
    const im = images[`item/${M.items[d.kind].id}.png`];
    ctx.drawImage(im, Math.round(d.x - im.width / 2), Math.round(d.y - im.height - 2 + Math.sin(now * 4) * 1.5));
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
    if (b.ally) {
      drawWalker(b.m.img, b.x, b.y, b.face, b.phase, b.moving, 0, 1, Math.min(1, (b.life - b.t) * 2) * 0.85);
      continue;
    }
    const s = b.scale;
    // A monster leans in as it strikes.
    const lx = b.lunge > 0 ? Math.sign(p.x - b.x) * 3 : 0, ly = b.lunge > 0 ? Math.sign(p.y - b.y) * 3 : 0;
    drawWalker(b.m.img, b.x + lx, b.y + ly, b.face, b.phase, b.moving, b.flash, s);
    if (!b.kind && b.shown && G.t - b.shown < 3) {
      // A struck monster shows its health over its head for a while.
      const bx = Math.round(b.x - 12), by = Math.round(b.y - b.m.h * s - 5);
      ctx.fillStyle = '#000';
      ctx.fillRect(bx - 1, by - 1, 26, 4);
      const k = Math.max(0, b.hp / b.maxHp);
      ctx.fillStyle = k > 0.5 ? '#4ad82a' : k > 0.25 ? '#e8d020' : '#e83a1a';
      ctx.fillRect(bx, by, Math.round(24 * k), 2);
    }
    if (b.kind) {
      bar(b.x - 22, b.y + 3, 44, 3, b.hp / b.maxHp, '#d33');
      ctx.font = '10px G9';
      ctx.textAlign = 'center';
      outline(b.name, b.x, b.y - b.m.h * s - 4, b.kind === 'boss' ? '#ff8a6a' : '#ffe070');
    }
  }
  for (const d of G.dying) {
    // The body falls on its side, darkens and fades, as slain monsters did.
    const e = d.e, im = e.m.img, k = Math.min(1, d.t / 0.15);
    const w = im.width * e.scale, h = im.height * e.scale;
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - Math.max(0, d.t - 0.6) / 0.6);
    ctx.translate(Math.round(e.x), Math.round(e.y));
    ctx.rotate((Math.PI / 2) * k * e.face);
    ctx.filter = 'brightness(0.7)';
    ctx.drawImage(im, -w / 2, -h, w, h);
    ctx.restore();
  }

  // Spell effects over everything, at their own size.
  for (const f of G.fxs) {
    if (f.t < 0) continue;
    const x = f.follow ? p.x + f.x : f.x, y = f.follow ? p.y + f.y : f.y;
    if (f.alpha) ctx.globalAlpha = f.alpha;
    drawFx(f.id, x, y, f.loop ? now : f.t, f.scale, f.rot, f.anchor, f.loop);
    ctx.globalAlpha = 1;
  }
  ctx.font = '8px G7';
  ctx.textAlign = 'center';
  ctx.font = '10px G9';
  for (const t of G.texts) {
    ctx.globalAlpha = t.t < 0.7 ? 1 : 1 - (t.t - 0.7) / 0.4;
    if (t.box) {
      const w = Math.ceil(ctx.measureText(t.text).width) + 6, x = Math.round(t.x - w / 2), y = Math.round(t.y - 10);
      ctx.fillStyle = 'rgba(34,30,92,0.9)';
      ctx.fillRect(x, y, w, 12);
      ctx.fillStyle = '#a8a0f0';
      ctx.fillRect(x, y, w, 1);
      ctx.fillRect(x, y + 11, w, 1);
      ctx.fillRect(x, y, 1, 12);
      ctx.fillRect(x + w - 1, y, 1, 12);
      ctx.fillStyle = '#fff';
      ctx.fillText(t.text, Math.round(t.x), y + 9);
    } else thick(t.text, t.x, t.y, t.color);
  }
  ctx.globalAlpha = 1;
  if (!G.dead) {
    const bx = Math.round(p.x - 14), by = Math.round(p.y - heroHeight() - 6);
    ctx.fillStyle = '#000';
    ctx.fillRect(bx - 1, by - 1, 30, 5);
    ctx.fillStyle = '#1e4a10';
    ctx.fillRect(bx, by, 28, 3);
    ctx.fillStyle = '#4ad82a';
    ctx.fillRect(bx, by, Math.round(28 * Math.max(0, p.hp / p.maxHp)), 2);
    ctx.fillStyle = '#2a9a14';
    ctx.fillRect(bx, by + 2, Math.round(28 * Math.max(0, p.hp / p.maxHp)), 1);
  }
  if (G.bubble) drawBubble(G.bubble.text, p.x, p.y - heroHeight() - 12, G.t - G.bubble.t);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const dark = DARK[G.stage.terrain];
  if (dark) {
    // Caves and houses are dim away from the hero, as in the old game's dungeons.
    const cx = canvas.width / 2, cy = canvas.height / 2;
    const gr = ctx.createRadialGradient(cx, cy, canvas.height * 0.35, cx, cy, Math.hypot(cx, cy));
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(1, `rgba(0,0,0,${dark})`);
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  drawJoystick();
}

function heroHeight() {
  const p = G.player;
  return p.av ? p.av.top : p.img.height;
}

function drawHero(now, hidden) {
  const p = G.player;
  if (G.dead) {
    // The ghost the dead become.
    ctx.globalAlpha = 0.85;
    drawFx(FX.ghost, p.x, p.y - Math.sin(now * 2) * 3, now, 1, 0, 'bottom', true);
    ctx.globalAlpha = 1;
    return;
  }
  const blink = p.inv > 0 && Math.floor(p.inv * 30) % 2 === 0;
  if (blink) return;
  if (!p.av) {
    drawWalker(p.img, p.x, p.y, p.face, p.phase, p.moving, 0, 1, hidden ? 0.35 : 1);
    return;
  }
  // The wardrobe figure: four directions, four walking frames, attack and casting poses.
  const dir = facing(p.fdx, p.fdy);
  const pose = p.poseT > 0 ? p.pose : p.moving ? 'walk' : 'idle';
  drawAvatar(ctx, p.av, p.x, p.y, dir, pose, Math.floor(p.walkT / WALK_MS), hidden ? 0.35 : 1);
}

// The colour a class shouts its spells in.
// Kept for reference: the newer game colours shouts by class; the old client does not.

function drawBubble(text, x, y, age = 0) {
  // A spell shouted aloud: the name in the class's colour in a grey box with a rim of the
  // same colour, fading away after a second, as in the game's spell clips.
  ctx.save();
  ctx.globalAlpha = age < 0.9 ? 1 : Math.max(0, 1 - (age - 0.9) / 0.4);
  ctx.font = 'bold 12px G11';
  ctx.textAlign = 'center';
  const c = '#a8a0f0';
  const w = Math.ceil(ctx.measureText(text).width) + 24;
  x = Math.round(x);
  y = Math.round(y);
  const l = x - Math.round(w / 2), t = y - 20;
  ctx.fillStyle = 'rgba(34,30,92,0.9)';
  ctx.fillRect(l + 1, t + 1, w - 2, 16);
  ctx.fillStyle = c;
  ctx.fillRect(l + 2, t, w - 4, 1);
  ctx.fillRect(l + 2, t + 17, w - 4, 1);
  ctx.fillRect(l, t + 2, 1, 14);
  ctx.fillRect(l + w - 1, t + 2, 1, 14);
  ctx.fillRect(l + 1, t + 1, 1, 1);
  ctx.fillRect(l + w - 2, t + 1, 1, 1);
  ctx.fillRect(l + 1, t + 16, 1, 1);
  ctx.fillRect(l + w - 2, t + 16, 1, 1);
  ctx.fillStyle = 'rgba(34,30,92,0.9)';
  ctx.fillRect(x - 2, t + 18, 5, 1);
  ctx.fillRect(x - 1, t + 19, 3, 1);
  ctx.fillRect(x, t + 20, 1, 1);
  ctx.fillStyle = '#fff';
  ctx.fillText(text, x, t + 13);
  ctx.restore();
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
    drawWalker(m.img, x, y, 1, now * 6 + i, true, 0);
  });
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// ---------------------------------------------------------------- menus

const ultBtn = $('#ult');

const shown = {};

/** Sets an element's text only when it changed (the panel is refreshed every frame). */
function put(id, text) {
  if (shown[id] === text) return;
  shown[id] = text;
  $(id).textContent = text;
}

function gauge(sel, k, text) {
  const w = (Math.max(0, Math.min(1, k)) * 100).toFixed(1) + '%';
  if (shown[sel] !== w) {
    shown[sel] = w;
    $(sel + ' i').style.width = w;
  }
  put(sel + ' span', text);
}

// Gear slots around the figure, as on the old panel: two on each side, one above, two below.
// The gear slots as placed on the old panel: two on the left, the helmet above the figure,
// two at its feet, three darker ones down the right.
const SLOT_AT = [[117, 160], [35, 164], [35, 208], [80, 234], [156, 234], [203, 160, 1], [203, 196, 1], [203, 232, 1]];
const BASE_STATS = { warrior: [30, 8, 14], rogue: [18, 10, 26], mage: [8, 30, 12], poet: [10, 26, 12] };
const TITLES = ['초보 사냥꾼', '사냥꾼', '숙련된 사냥꾼', '용사', '영웅', '전설'];

/** The side panel and the map tab, kept in step with the hunt. */
function syncUlt() {
  if (!G) return;
  const p = G.player;
  put('#map-name', G.stage.name + (G.cleared ? ' (정복)' : ''));
  put('#boss-clock', G.bossDue ? `${G.boss.name}까지 ${clock(BOSS_AT - G.t)}` : '');
  if (document.body.classList.contains('panel-off')) {
    put('#mini', `체 ${Math.ceil(Math.max(0, p.hp))}/${p.maxHp}   마 ${Math.floor(p.mp)}/${p.maxMp}   Lv ${p.lvl}`);
    return;
  }
  const cleared = Object.keys(progress.cleared).length;
  put('#sd-clan', G.stage.map === 'world_4' ? '환상의 섬' : '고구려');
  put('#sd-ct', G.stage.name);
  put('#sd-title', TITLES[Math.min(TITLES.length - 1, Math.floor(cleared / 3))]);
  put('#sd-class', G.cls.name);
  put('#sd-name', '나');
  put('#sd-land', G.stage.map === 'world_4' ? '환상' : '고구려');
  put('#sd-me', '나');
  put('#sd-cls1', G.cls.name[0]);
  put('#sd-lv', String(p.lvl));
  const [bs, bi, bd] = BASE_STATS[G.cls.id];
  put('#sd-str', String(bs + p.lvl + G.passives.power * 3));
  put('#sd-int', String(bi + p.lvl + G.passives.haste * 3));
  put('#sd-dex', String(bd + p.lvl + G.passives.speed * 3));
  gauge('#g-hp', p.hp / p.maxHp, String(Math.ceil(Math.max(0, p.hp))));
  gauge('#g-mp', p.mp / p.maxMp, String(Math.floor(p.mp)));
  put('#sd-exp', String(p.total || 0));
  put('#sd-gold', String(G.gold));
  put('#sd-pos', `${String(p.tx + 500).padStart(4, '0')} ${String(p.ty + 500).padStart(4, '0')}`);
  const look = JSON.stringify(p.gear);
  if (shown.hero !== look) {
    shown.hero = look;
    $('#side-hero').src = $('#sd-face').src = p.av ? portrait(p.av) : `assets/hero/${G.cls.hero}.png`;
  }
  // The lettered list holds the learned spells, as the magic window lettered them.
  // The scroll's list: effects on the hero with the seconds left, as the client listed them,
  // then the spells learned.
  const effects = [['power', '공격력증가'], ['stealth', '투명'], ['guard', '금강불체'], ['shield', '보호막']]
    .filter(([k]) => G.buffs[k] > G.t).map(([k, n]) => `<span>${n} <b>${Math.ceil(G.buffs[k] - G.t)}초</b></span>`);
  const magic = effects.join('') + G.skills.map(s => `<span>${skillName(s.id, s.lv)} <b>${s.lv}단</b></span>`).join('');
  if (shown.magic !== magic) {
    shown.magic = magic;
    $('#magic').innerHTML = magic;
  }
  // Worn gear in the slots by the figure (weapon and shield at the left), the
  // trained stats in the others, highest first.
  const g = p.gear || {};
  // The top slot is the helmet's, and no helmet is worn; the armor shows on the figure itself.
  const worn = [null, ...['weapon', 'shield'].map(k => (p.av ? gearIcon(G.cls.id, k, g[k]) : null))];
  const trained = Object.entries(G.passives).filter(([, lv]) => lv).sort((a, b) => b[1] - a[1]);
  const slots = SLOT_AT.map(([x, y, dark], i) => {
    let inner = '';
    if (i < 3) {
      if (worn[i]) inner = `<img src="${worn[i]}" alt="">`;
    } else if (trained[i - 3]) {
      const [id, lv] = trained[i - 3];
      inner = `<img src="assets/item/${M.items[PASSIVES[id].item].id}.png" alt=""><b>${lv}</b>`;
    }
    return `<i class="slot${dark ? ' dark' : ''}" style="left:${x}px;top:${y}px">${inner}</i>`;
  }).join('');
  if (shown.slots !== slots) {
    shown.slots = slots;
    $('#side-slots').innerHTML = slots;
  }
  const ready = p.mp >= p.maxMp && !G.dead;
  put('#ult span', SKILLS[G.cls.ult].name);
  put('#ult small', ready ? '준비됨' : `마력 ${Math.floor(p.mp)}/${p.maxMp}`);
  ultBtn.classList.toggle('ready', ready);
}

/** Folds the side panel away for a wider view, or brings it back; remembered between runs. */
function setPanel(on) {
  settings.panel = on;
  saveJson('bs_settings', settings);
  document.body.classList.toggle('panel-off', !on);
  $('#unfold').hidden = on;
  $('#mini').hidden = on;
  for (const k of Object.keys(shown)) delete shown[k];
  resize();
}
$('#fold').onclick = () => setPanel(false);
$('#unfold').onclick = () => setPanel(true);

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
// Every button clicks, as the client's did (408).
document.addEventListener('click', e => {
  if (audio && e.target.closest('button')) audio.play('click');
}, { capture: true });

// ---------------------------------------------------------------- sound picker
//
// The game's sound files are numbered with no list of what each is for, so each game event
// gets a number here: spells start on the number of their effect picture (화염주 is effect
// 92, so 092.wav), the rest start silent or on a made-up sound, and the player listens and
// picks. Choices are saved with the other settings.

const EVENTS = [['hit', '타격'], ['kill', '몬스터 쓰러짐'], ['hurt', '맞음'], ['levelup', '레벨업'], ['pickup', '줍기'],
  ['heal', '회복'], ['chest', '보물 상자'], ['boss', '보스 등장'], ['win', '정복'], ['lose', '유령이 됨'], ['revive', '부활'], ['click', '버튼 누름']];
const MUSIC = [['title', '처음 화면'], ['boss', '보스'], ...STAGES.map(s => ['stage_' + s.id, s.name])];

// Sound kinds the player sorts the numbered sounds into, and which game sounds draw on each.
const SOUND_KINDS = [
  ['heal', '회복'], ['fire', '불'], ['ice', '얼음·물'], ['thunder', '번개'], ['slash', '베기·타격'],
  ['boom', '폭발·큰 마법'], ['light', '빛·신비'], ['monster', '몬스터'], ['ui', '알림'], ['none', '모름·안 씀'],
];
const KIND_USES = {
  heal: ['skill_c_heal', 'heal', 'skill_p_ult'],
  fire: ['skill_m_fire', 'skill_m_fire4'],
  ice: ['skill_m_ice'],
  thunder: ['skill_r_bolt'],
  slash: ['hit', 'skill_w_slash', 'skill_r_blink', 'skill_r_drain'],
  boom: ['skill_w_ult', 'skill_w_tiger', 'skill_w_roar', 'skill_r_ult', 'skill_m_ult', 'skill_p_quake'],
  light: ['skill_p_orb', 'skill_p_barrier', 'skill_p_guard', 'skill_w_buff', 'skill_r_stealth', 'skill_r_clone',
    'skill_m_para', 'skill_m_curse', 'skill_p_summon'],
  monster: ['kill', 'hurt', 'boss'],
  ui: ['levelup', 'chest', 'pickup', 'win', 'lose'],
};
function soundKinds() {
  return Object.assign({}, settings.kinds || {});
}

// The game's own sound for each spell and event, by its number (from the community list of
// spell sound numbers that came with the files; RTK-Server's use for the rest). A list is one
// sound per level of the spell, following its names (화염주 → 화영열주 → … use the 화염주 set
// 040-044). Numbers missing from the build fall back to the sorting below.
const GAME_SOUNDS = {
  skill_c_heal: ['003', '005', '010', '010', '034', '034', '066', '076'], // 누리·대지·바다·…·천공·구름·태양의 기원
  skill_w_slash: ['331', '004', '007', '009', '007', '013', '013', '017'], // 타격음, 이중·후면·삼중·측면·사중·오중공격
  skill_w_tiger: '087', skill_w_roar: '018', skill_w_ult: '014', // 백호참, 동귀어진, 건곤대나이
  skill_w_buff: ['012', '012', '012', '012', '089', '089', '089', '089'], // 백호령, 진백호령
  skill_r_blink: '030', skill_r_stealth: '028', skill_r_drain: '038', skill_r_clone: '039', skill_r_ult: '035',
  skill_r_bolt: ['055', '055', '056', '056', '057', '057', '058', '059'], // 뢰진주 계열
  skill_m_fire: ['040', '040', '041', '041', '042', '042', '043', '044'], // 화염주 계열
  skill_m_fire4: ['040', '040', '041', '041', '042', '042', '043', '044'],
  skill_m_ice: ['050', '050', '051', '051', '052', '052', '053', '054'], // 백열주 계열
  skill_m_para: '070', skill_m_curse: '069', skill_m_ult: '073', // 마비, 저주, 헬파이어
  skill_p_orb: ['045', '045', '046', '046', '047', '047', '048', '049'], // 자무주 계열
  skill_p_quake: '082', skill_p_barrier: '094', skill_p_summon: '081', skill_p_guard: '084', skill_p_ult: '095',
  hit: '331', kill: '353', hurt: '116', levelup: '123', pickup: '406', heal: '074', chest: '503', boss: '509',
  win: '401', lose: '402', revive: '112', click: '408',
};

/** Each game sound: the game's own where known, else one from the player's sorting. */
function soundDefaults() {
  const kinds = soundKinds();
  const d = {};
  const bank = new Set(audio.bank());
  for (const [kind, uses] of Object.entries(KIND_USES)) {
    const list = audio.bank().filter(n => kinds[n] === kind);
    if (!list.length) continue;
    uses.forEach((use, i) => {
      d[use] = use === 'skill_c_heal' ? list.slice(0, 8) : list[i % list.length];
    });
  }
  for (const [use, n] of Object.entries(GAME_SOUNDS)) {
    if ((Array.isArray(n) ? n : [n]).every(x => bank.has(x))) d[use] = n;
  }
  const mids = M.audio.bgm.map(b => b.key).filter(k => k.startsWith('mid'));
  if (mids.length) {
    const has = k => mids.includes(k);
    // 08 is the one tune scored for Korean instruments (가야금, 거문고, 대금, 아쟁, 꽹과리): the
    // game's own theme. 04 is the fastest, with drums: for bosses.
    d.bgm_title = has('mid08') ? 'mid08' : mids[0];
    d.bgm_boss = has('mid04') ? 'mid04' : mids[mids.length - 1];
    for (const st of STAGES) {
      const k = 'mid' + st.bgm;
      d['bgm_stage_' + st.id] = has(k) ? k : mids[0];
    }
  }
  return d;
}

function applySounds() {
  // Picks made before the sounds had names were guesses: start again from the game's own.
  if (settings.soundsVer !== 2) {
    delete settings.sounds;
    delete settings.kinds;
    settings.soundsVer = 2;
    saveJson('bs_settings', settings);
  }
  audio.map = Object.assign(soundDefaults(), settings.sounds || {});
}

// ---- quick sort: play each unsorted sound once, one tap files it under a kind

let sortQueue = [];

function startSort() {
  const kinds = soundKinds();
  sortQueue = audio.bank().filter(n => !kinds[n]);
  $('#sound-rows').hidden = true;
  $('#start-sort').hidden = true;
  $('#sort').hidden = false;
  nextSort();
}

function nextSort() {
  const left = sortQueue.length;
  if (!left) {
    $('#sort-num').textContent = '다 나눴습니다';
    $('#sort-left').textContent = '';
    return;
  }
  const n = sortQueue[0];
  $('#sort-num').textContent = n + '번';
  $('#sort-left').textContent = `남은 소리 ${left}개 · 전체 ${audio.bank().length}개`;
  audio.preview(n);
}

function fileSort(kind) {
  const n = sortQueue.shift();
  if (!n) return;
  settings.kinds = Object.assign(settings.kinds || {}, { [n]: kind });
  // A choice by kind replaces earlier one-by-one picks for what it now feeds.
  for (const use of KIND_USES[kind] || []) if (settings.sounds) delete settings.sounds[use];
  saveJson('bs_settings', settings);
  applySounds();
  nextSort();
}

function buildSort() {
  const box = $('#sort-kinds');
  box.innerHTML = '';
  for (const [kind, label] of SOUND_KINDS) {
    const b = document.createElement('button');
    b.className = 'btn';
    b.textContent = label;
    b.onclick = () => fileSort(kind);
    box.append(b);
  }
}

function buildSounds() {
  const box = $('#sound-rows');
  box.innerHTML = '';
  const bank = ['-', ...audio.bank()];
  const music = ['-', ...M.audio.bgm.map(b => b.key)];
  const row = (key, label, options, music) => {
    const name = document.createElement('span');
    name.textContent = label;
    const pick = document.createElement('div');
    pick.className = 'pick';
    const val = document.createElement('b');
    const show = () => {
      const v = audio.map[key];
      val.textContent = Array.isArray(v) ? `${v[0]}~${v[v.length - 1]}` : v || '-';
      const nm = !Array.isArray(v) && (M.audio.names || {})[v];
      val.title = nm || '';
      name.textContent = nm ? `${label} · ${nm}` : label;
    };
    const move = d => {
      const cur = audio.map[key];
      const i = Math.max(0, options.indexOf(Array.isArray(cur) ? cur[0] : cur || '-'));
      const v = options[(i + d + options.length) % options.length];
      settings.sounds = Object.assign(settings.sounds || {}, { [key]: v });
      saveJson('bs_settings', settings);
      applySounds();
      show();
      play();
    };
    const play = () => {
      let v = audio.map[key];
      if (Array.isArray(v)) v = v[0];
      if (!v || v === '-') return;
      if (music) {
        audio.stopBgm();
        audio.bgm(key.slice(4));
      } else audio.preview(v);
    };
    for (const [text, fn] of [['◀', () => move(-1)], ['▶', () => move(1)], ['♪', play]]) {
      const b = document.createElement('button');
      b.textContent = text;
      b.onclick = fn;
      if (text === '▶') pick.append(val);
      pick.append(b);
    }
    show();
    box.append(name, pick);
  };
  const head = text => {
    const h = document.createElement('h4');
    h.textContent = text;
    box.append(h);
  };
  if (bank.length > 1) {
    head('게임 소리');
    for (const [k, label] of EVENTS) row(k, label, bank);
    for (const c of CLASSES) {
      head(c.name + ' 마법');
      for (const [id, def] of Object.entries(SKILLS)) {
        if (def.cls === c.id || (def.cls === 'all' && c.id === 'warrior')) row('skill_' + id, def.name, bank);
      }
    }
  } else {
    head('효과음 파일이 없습니다. README의 "효과음·배경음 넣기"를 보세요.');
  }
  if (music.length > 1) {
    head('배경음');
    for (const [k, label] of MUSIC) row('bgm_' + k, label, music, true);
  }
}

$('#open-sounds').onclick = () => {
  audio.unlock();
  buildSounds();
  buildSort();
  $('#sort').hidden = true;
  $('#start-sort').hidden = false;
  $('#sound-rows').hidden = false;
  $('#sounds').hidden = false;
};
$('#start-sort').onclick = startSort;
$('#sort-again').onclick = () => audio.preview(sortQueue[0]);
$('#sort-done').onclick = () => {
  $('#sort').hidden = true;
  $('#start-sort').hidden = false;
  buildSounds();
  $('#sound-rows').hidden = false;
};
$('#close-sounds').onclick = () => {
  $('#sounds').hidden = true;
  audio.bgm(G ? (G.enemies.some(e => e.kind === 'boss') ? 'boss' : huntMusic()) : 'title');
};

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
