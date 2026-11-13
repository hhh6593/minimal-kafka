import {
  CLASSES, SKILLS, PASSIVES, STAGES, MAX_SKILLS, MAX_PASSIVES, MAX_SKILL_LEVEL, MAX_PASSIVE_LEVEL, BOSS_AT, MINI_AT,
  CHAMPIONS_AT, FX, ELEMENTS, PROMOS, RAIDS, RAID_BOSS_AT, RAID_LIMIT,
  skillStats, skillName, levelText,
} from './data.js';
import { Audio } from './audio.js';
import {
  SPECIALS, SPECIAL, OPTIONS, KIND_NAME, specialBase, specialName, specialPower, tierSources, raidOf,
  MATS, craftRecipe, STAR_MAX, starCost, CRAFTS, starMats, matCount, DRAGON_MAX, dragonName, craftPicture,
} from './items.js';
import {
  initAvatars, hasAvatars, avatarPaths, dress, hasLook, loadLooks, drawAvatar, facing, portrait, gearName, gearIcon, GEAR, WALK_MS, heads,
  RAID_GEAR, plainTiers, plainList, gearPower, raidSet, CRAFT_GEAR, CRAFT_POWER,
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
let settings = loadJson('bs_settings', { bgm: true, sfx: true, numbers: true, bubbles: true });
// Tile movement (one tile a step, as the client moved) is the default from this version on;
// the menu switches back to free walking.
if (settings.tiles === undefined) settings.tiles = true;
let best = loadJson('bs_best', {});
let progress = loadJson('bs_progress', { cleared: {} });
// Which grounds each class has conquered: its 승급 come from these. Grounds conquered before
// classes were told apart count for every class.
if (!progress.byClass) {
  progress.byClass = {};
  for (const c of ['warrior', 'rogue', 'mage', 'poet']) progress.byClass[c] = Object.assign({}, progress.cleared);
}
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
    ...Object.keys(M.fx).filter(id => !id.startsWith('new_')).map(id => `icon/${id}.png`),
    ...M.heroes.map(h => `hero/${h.id}.png`),
    ...Object.values(M.items).map(i => `item/${i.id}.png`),
    ...M.monsters.map(m => `mon/${m.id}.png`),
    ...avatarPaths(M),
    ...(M.npc || []).map(n => `npc/${n}.png`),
    ...(M.ui.town ? ['ui/town.png'] : []),
    ...Object.keys(M.emote || {}).map(k => `emote/${k}.png`),
    ...Object.keys(M.beast || {}).map(k => `beast/${k}.png`),
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
  // On a short phone screen the whole panel would shrink past reading: keep it at 0.7 or more
  // and let its top (the CLAN / C.T. / TITLE fields) go past the screen's top edge instead,
  // so the figure, the spells and the status block stay in sight.
  const k = Math.max(0.7, Math.min(1.25, innerHeight / 640));
  document.documentElement.style.setProperty('--side', Math.round(272 * k) + 'px');
  const panel = document.getElementById('panel');
  if (panel) {
    panel.style.transform = `translateY(${Math.min(0, innerHeight - 640 * k)}px) scale(${k})`;
    // What goes past the top: the parchment's top edge moves down by as much, so its frame stays
    // whole, and the name rows that no longer fit are left out rather than cut in half.
    const cut = Math.max(0, (640 * k - innerHeight) / k);
    panel.style.setProperty('--cut', cut + 'px');
    for (const el of panel.querySelectorAll('.lbl, .fld')) {
      const top = parseFloat(el.style.top);
      if (top < 160) el.style.visibility = top < cut + 22 ? 'hidden' : '';
    }
  }
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
  if (name !== 'town' && name !== null && !['equip', 'trade'].includes(name)) $('#talk').hidden = true;
  if (name === 'select' || name === 'stages') audio.bgm(audio.pickBgm('select') ? 'select' : 'title');
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
      <em>필살기 ${SKILLS[c.ult].name}</em>
      <small>${rec ? `최고 Lv ${rec.lvl} · ${rec.kills}마리` : '기록 없음'}${promoOf(c.id) ? ` · ${promoOf(c.id)}차 승급` : ''}</small>`;
    b.onclick = () => {
      chosenClass = c;
      enterTown(c);
    };
    box.append(b);
  }
}

function unlocked(i) {
  // The first fourteen open one after another; an added ground when its own is conquered.
  const s = STAGES[i];
  if (s.open) return QUERY.has('all') || !!progress.cleared[s.open];
  return QUERY.has('all') || i === 0 || !!progress.cleared[STAGES[i - 1].id];
}

let mapTab = 'world_1';
let pickedStage = null;

function buildStages() {
  if (!pickedStage) {
    // The furthest open ground.
    let i = 0;
    while (i + 1 < 14 && unlocked(i + 1)) i++;
    pickedStage = STAGES[i];
    mapTab = pickedStage.map;
  }
  for (const b of document.querySelectorAll('#map-tabs button')) b.classList.toggle('on', b.dataset.map === mapTab);
  const map = $('#map');
  map.classList.toggle('gungnae', mapTab === 'gungnae');
  map.classList.toggle('raids', mapTab === 'raid');
  if (mapTab === 'raid') {
    if (!pickedStage.raid) pickedStage = RAIDS[0];
    map.innerHTML = '';
    for (const r of RAIDS) {
      const b = document.createElement('button');
      b.className = 'raid' + (raidOpen(r) ? '' : ' locked') + (r === pickedStage ? ' on' : '');
      const done = (progress.raids || {})[r.id];
      b.innerHTML = `<img src="assets/mon/${r.boss.id}.png" alt=""><div><b>${r.name} <small>${raidStars(r)}</small></b><span>${r.intro}</span>`
        + `<span>${raidOpen(r) ? (done ? `${done}번 처치` : '아직 잡지 못함') : `${STAGES.find(x => x.id === r.open).name}을(를) 정복하면 열린다`}</span></div>`;
      b.onclick = () => { pickedStage = r; buildStages(); };
      map.append(b);
    }
    raidInfo(pickedStage);
    return;
  }
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

function raidOpen(r) {
  return QUERY.has('all') || !!progress.cleared[r.open];
}

/** The raid's card: its boss, and the party that will gather, from each class's best. */
function raidInfo(r) {
  const party = CLASSES.filter(c => c !== chosenClass).map(c => {
    const rec = best[c.id];
    return `${c.name} ${rec ? `Lv ${rec.lvl}` : '기록 없음'}`;
  });
  const rec = best[chosenClass.id], start = Math.max(1, Math.min(20, Math.floor((rec ? rec.lvl : 1) * 0.6)));
  $('#stage-info').innerHTML = `<h3>${r.name}</h3><div class="lv">보스 ${r.boss.name} · ${RAID_BOSS_AT}초에 등장 · 8분 안에</div>
    <p>${r.intro}. 바닥이 붉게 깜빡이는 칸은 곧 내리친다: 한 칸씩 걸어 피하라.</p>
    <div class="mons"><img src="assets/mon/${r.boss.id}.png" alt=""></div>
    <div class="party">${chosenClass.name}(나) Lv ${start}부터 · 함께: ${party.join(' · ')}</div>
    <div class="boss">난이도 ${raidStars(r)} · 보상 ${RAID_GEAR[r.id].pow}등급 세트 · ${120 * r.level}전</div>
    <div class="party">${raidSet(r.id, chosenClass.id).map(([k, n]) => {
      const owned = bag(chosenClass).includes(`${k}:${GEAR[chosenClass.id][k].indexOf(n)}`);
      return `${{ weapon: '무기', armor: '갑옷', shield: '방패' }[k]} ${n}${owned ? '(있음)' : ''}`;
    }).join(' · ')}</div>
    <div class="state">${raidOpen(r) ? '키운 직업이 모두 모인다' : `${STAGES.find(x => x.id === r.open).name}을(를) 정복하면 열린다`}</div>`;
  // How the hero starts: its recorded build, or picking cards as on a hunting ground.
  const built = (progress.builds || {})[chosenClass.id];
  const sw = document.createElement('button');
  sw.className = 'btn';
  sw.style.marginTop = '4px';
  sw.textContent = settings.raidManual ? '시작 기술: 직접 고르기' : `시작 기술: ${built ? '지난 빌드' : '자동 빌드'}`;
  sw.onclick = () => { settings.raidManual = !settings.raidManual; saveJson('bs_settings', settings); raidInfo(r); };
  $('#stage-info').append(sw);
  $('#go').disabled = !raidOpen(r);
  $('#go').textContent = `${josa(chosenClass.name, '으로', '로')} 레이드`;
}

for (const b of document.querySelectorAll('#map-tabs button')) {
  b.onclick = () => {
    mapTab = b.dataset.map;
    if (mapTab === 'raid') {
      pickedStage = RAIDS.find(raidOpen) || RAIDS[0];
      buildStages();
      return;
    }
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
  return !occ.has(key(tx, ty)) && !(p.tx === tx && p.ty === ty)
    && !(p.stepping && p.sfx === tx && p.sfy === ty);
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
  b.mdx = dx;
  b.mdy = dy;
  return true;
}

/** A monster turns to whoever it strikes: the longer way between them. */
function faceTo(e, tx, ty) {
  const dx = tx - e.tx, dy = ty - e.ty;
  if (Math.abs(dx) >= Math.abs(dy)) { e.mdx = Math.sign(dx) || 1; e.mdy = 0; } else { e.mdx = 0; e.mdy = Math.sign(dy); }
  if (e.mdx) e.face = e.mdx;
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
    cls, stage, ...mons, level: stage.level !== undefined ? stage.level : STAGES.indexOf(stage), ground: makeGround(stage.terrain), marks: [],
    t: 0, kills: 0, gold: 0, over: false, dead: false, paused: false, choosing: false, cleared: false, revived: false,
    player: {
      hp: Math.round(cls.hp * (1 + 0.1 * up('life'))), maxHp: Math.round(cls.hp * (1 + 0.1 * up('life'))), mp: cls.mp * 0.5, maxMp: cls.mp, speed: cls.speed, armor: cls.armor,
      face: 1, fdx: 0, fdy: 1, phase: 0, lvl: 1, xp: 0, next: xpFor(1), inv: 0,
      img: images[`hero/${hero.id}.png`], hero: true, gear, av: hasAvatars() ? dressed(cls, gear) : null,
      pose: null, poseT: 0, walkT: 0,
    },
    skills: [], passives: Object.fromEntries(Object.keys(PASSIVES).map(k => [k, 0])),
    buffs: { power: 0, stealth: 0, guard: 0, shield: 0, haste: 0, reflect: 0 },
    enemies: [], dying: [], allies: [], party: [], fxs: [], drops: [], texts: [], log: [],
    bubble: null, spawnT: 0, minis: MINI_AT.slice(), champs: CHAMPIONS_AT.slice(), packs: 0, bossDue: true, events: eventPlan(),
    pendingLevels: 0, shake: 0, plainDropAt: 0,
    rerolls: 2 + up('reroll'), skips: 2 + up('skip'), banishes: 2 + up('banish'), banished: new Set(),
    banishing: false, extraLives: up('revive'),
  };
  G.player.x = TILE / 2;
  G.player.y = TILE - 6;
  heroTile();
  applyGear();
  // A run starts with the weapon's plain attack only; the first card comes at once.
  G.pendingLevels = 1;
  G.firstCard = true;
  showScreen(null);
  audio.bgm(huntMusic());
  $('#chat').innerHTML = '';
  $('#vert').innerHTML = '';
  say(`${stage.name}에 들어왔습니다.`, 'sys');
  say(stage.intro);
  if (stage.raid) raidSetup();
  G.wasCleared = stage.raid ? !!(progress.raids || {})[stage.id] : !!progress.cleared[stage.id];
  syncSpeed();
  nextChoice();
}

/** The 속도 key: shown only on a ground (or raid) conquered before. */
function syncSpeed() {
  const b = $('#speed-btn');
  b.hidden = !(G && G.wasCleared);
  b.textContent = `속도 ×${settings.speed || 1}`;
}
$('#speed-btn').onclick = () => {
  settings.speed = (settings.speed || 1) % 3 + 1;
  saveJson('bs_settings', settings);
  syncSpeed();
};

// ---------------------------------------------------------------- gear
//
// Each class wears its own line of gear (avatar.js GEAR). Chests from middle bosses and bosses
// hand out the next piece; what a class has found stays for its later hunts, as in the game.

function savedGear(cls) {
  progress.gear = progress.gear || {};
  return Object.assign({ armor: 0, weapon: 0, shield: -1, helmet: -1, cape: -1 }, progress.gear[cls.id]);
}

/** Stats from the gear worn: weapons hit harder, armor gives health, shields guard. */
function applyGear() {
  const p = G.player, g = p.gear, c = G.cls.id;
  // A special worn counts a rank above its look, and adds its option.
  // Each star above ★1 adds half a rank.
  const pow = k => (g[k + 'Sp'] && SPECIAL[g[k + 'Sp']] ? specialPower(SPECIAL[g[k + 'Sp']], c) + 0.5 * (starOf(G.cls, 'sp:' + g[k + 'Sp']) - 1)
    : g[k] < 0 ? -1 : gearPower(c, k, g[k]) + 0.5 * (starOf(G.cls, `${k}:${g[k]}`) - 1));
  const bonus = p.bonus = {};
  for (const k of ['weapon', 'armor', 'shield', 'helmet', 'cape']) {
    const sp = g[k + 'Sp'] && SPECIAL[g[k + 'Sp']];
    if (sp) bonus[sp.opt.id] = (bonus[sp.opt.id] || 0) + 1;
  }
  // 투구 adds health, 망토 guards (both only from today's crafted sets).
  const extra = k => (g[k] >= 0 || g[k + 'Sp'] ? Math.max(0, pow(k)) : 0);
  const hp = G.cls.hp + pow('armor') * 20 + extra('helmet') * 12 + 40 * (bonus.life || 0);
  p.hp += hp - (p.gearHp || G.cls.hp);
  p.maxHp += hp - (p.gearHp || G.cls.hp);
  p.gearHp = hp;
  p.armor = G.cls.armor + Math.max(0, pow('shield') + 1) + Math.round(extra('cape') / 3) + 3 * (bonus.guard || 0);
  p.gearPower = (1 + 0.12 * pow('weapon')) * (1 + 0.15 * (bonus.power || 0));
}

/** A special option's count on the hero (0 when none is worn). */
function opt(id) {
  return (G && G.player.bonus && G.player.bonus[id]) || 0;
}

// The bag: every piece found is kept for the class (as in D2 Survivors, gear stays even after
// death), and the player chooses what to wear from the menu's 장비 window.

/** A piece's star (★1 to ★5) and spare copies, kept per class; key 'kind:tier' or 'sp:id'. */
function starOf(cls, key) {
  return ((progress.stars || {})[cls.id] || {})[key] || 1;
}
function copiesOf(cls, key) {
  return ((progress.copies || {})[cls.id] || {})[key] || 0;
}
function addCopy(cls, key) {
  progress.copies = progress.copies || {};
  const c = progress.copies[cls.id] = progress.copies[cls.id] || {};
  c[key] = (c[key] || 0) + 1;
}

function bag(cls) {
  progress.inv = progress.inv || {};
  const b = progress.inv[cls.id] = progress.inv[cls.id] || ['armor:0', 'weapon:0'];
  return b;
}

/** The 용무기's place in a class's weapon line, and whether a bag key is it. */
function dragonTier(cls) {
  return GEAR[cls.id].weapon.indexOf(CRAFT_GEAR[cls.id]);
}
function isDragonKey(cls, key) {
  return key === `weapon:${dragonTier(cls)}`;
}
/** The top star of a piece: the 용무기 climbs 제일 to 제십, the rest ★1 to ★5. */
function starMaxOf(cls, key) {
  return isDragonKey(cls, key) ? DRAGON_MAX : STAR_MAX;
}
/** A today's-client item picture by the item's name, or null when the build has none. */
function picture(name) {
  const g = name && M && M.gear && M.gear[name];
  return g ? `assets/gear/${g.id}.png` : null;
}
/** A bag piece's name: the 용무기 by its step (용천제삼검), the rest by their line. */
function pieceName(cls, kind, t) {
  return kind === 'weapon' && t === dragonTier(cls) ? dragonName(cls.id, starOf(cls, `weapon:${t}`)) : gearName(cls.id, kind, t);
}
/** A piece's icon: today's picture for the 용무기 and legendary pieces (by star), else the wardrobe's. */
function pieceIcon(cls, kind, t, spId) {
  if (spId && SPECIAL[spId]) {
    const sp = SPECIAL[spId];
    return picture(craftPicture(sp, cls.id, starOf(cls, 'sp:' + spId))) || (hasAvatars() ? gearIcon(cls.id, kind, specialBase(sp, cls.id)) : null);
  }
  if (kind === 'weapon' && t === dragonTier(cls)) {
    const pic = picture(dragonName(cls.id, starOf(cls, `weapon:${t}`)));
    if (pic) return pic;
  }
  return t >= 0 && hasAvatars() ? gearIcon(cls.id, kind, t) : null;
}

/**
 * Today's dress-room look of each worn piece, when the build has it: a crafted legendary piece at
 * its star (금린천화갑5성), the 용무기 at its step (용천제삼검). The rest wear their old look.
 */
function wornLooks(cls, gear) {
  const looks = {};
  for (const kind of ['armor', 'weapon', 'shield', 'helmet', 'cape']) {
    const id = gear[kind + 'Sp'], sp = id && SPECIAL[id];
    const name = sp ? craftPicture(sp, cls.id, starOf(cls, 'sp:' + id))
      : kind === 'weapon' && gear.weapon === dragonTier(cls) ? dragonName(cls.id, starOf(cls, `weapon:${gear.weapon}`)) : null;
    if (name && hasLook(kind, name)) looks[kind] = name;
  }
  return looks;
}

/** A hero dressed in its gear, today's looks loaded on first wear (the old look until then). */
function dressed(cls, gear) {
  const looks = wornLooks(cls, gear);
  loadLooks(looks, refreshAvatars);
  return dress(cls.id, { ...gear, looks });
}

/** Dress again everyone on screen, once a look has loaded. */
function refreshAvatars() {
  if (!hasAvatars()) return;
  if (G) {
    G.player.av = dressed(G.cls, G.player.gear);
    for (const m of G.party) if (m.gear) m.av = dressed(m.cls, m.gear);
  }
  if (T) T.av = dressed(T.cls, savedGear(T.cls));
  if (!$('#equip').hidden) buildEquip();
}

function gearImage(g) {
  // The wardrobe's armor icon is a whole figure wearing it: on the ground that looked like a
  // stranger standing in the hunt. Armor lies there as an item, as the client showed drops.
  if (g.kind === 'armor' && M.items.armor) return images[`item/${M.items.armor.id}.png`];
  const path = hasAvatars() && gearIcon(G.cls.id, g.kind, g.tier);
  return path ? images[path.slice('assets/'.length)] : images[`item/${M.items.chest.id}.png`];
}

function pickGear(g) {
  if (g.sp) {
    // A special: kept by its own id; a second one sells well.
    const b = bag(G.cls), id = 'sp:' + g.sp, sp = SPECIAL[g.sp], name = specialName(sp, G.cls.id);
    audio.play('chest');
    if (b.includes(id)) {
      addCopy(G.cls, id);
      saveJson('bs_progress', progress);
      note(`${name}: 강화 재료(사본) +1`);
      return;
    }
    b.push(id);
    (G.gained = G.gained || []).push('★' + name);
    saveJson('bs_progress', progress);
    say(`스페셜 아이템 ${josa(name, '을', '를')} 얻었습니다! (${sp.opt.text})`, 'sys');
    banner(`★ 스페셜: ${name}`);
    return;
  }
  const b = bag(G.cls), id = `${g.kind}:${g.tier}`;
  const name = gearName(G.cls.id, g.kind, g.tier) || '장비';
  audio.play('pickup');
  if (b.includes(id)) {
    // A second one is no longer sold: it is a copy for raising the piece's star at the smith.
    addCopy(G.cls, id);
    saveJson('bs_progress', progress);
    note(`${name}: 강화 재료(사본) +1`);
    return;
  }
  b.push(id);
  (G.gained = G.gained || []).push(name);
  saveJson('bs_progress', progress);
  say(`${josa(name, '을', '를')} 주웠습니다. (메뉴 → 장비)`, 'sys');
  note(`${name} 획득`);
}

/** Puts on a piece from the bag (or takes off a shield with tier -1); sp: a special's id. */
function wear(kind, tier, sp = null) {
  const cls = G ? G.cls : chosenClass;
  progress.gear = progress.gear || {};
  const g = Object.assign(savedGear(cls), { [kind]: tier, [kind + 'Sp']: sp });
  progress.gear[cls.id] = g;
  saveJson('bs_progress', progress);
  if (G) {
    G.player.gear = { ...g };
    if (hasAvatars()) G.player.av = dressed(cls, g);
    applyGear();
  } else if (T && T.cls === cls && hasAvatars()) T.av = dressed(cls, g);
}

function buildEquip() {
  const cls = G ? G.cls : chosenClass, g = savedGear(cls), b = bag(cls);
  const box = $('#equip-rows');
  box.innerHTML = '';
  if (hasAvatars()) {
    // 머리 모양: any of the wardrobe's hair, kept per class, as the 미용실 did.
    const h = document.createElement('h4');
    h.textContent = '머리';
    box.append(h);
    const row = document.createElement('div');
    row.className = 'equip-row';
    const now = g.head || GEAR[cls.id].head;
    heads().forEach((hd, i) => {
      const btn = document.createElement('button');
      btn.className = 'equip' + (hd.name === now ? ' on' : '');
      btn.innerHTML = `<img src="${hd.icon}" alt=""><span>${hd.name === GEAR[cls.id].head ? '기본' : `모양 ${i + 1}`}</span>`;
      btn.onclick = () => {
        wear('head', hd.name);
        buildEquip();
      };
      row.append(btn);
    });
    box.append(row);
  }
  for (const [kind, label] of [['weapon', '무기'], ['armor', '갑옷'], ['shield', '방패'], ['helmet', '투구'], ['cape', '망토']]) {
    // 투구·망토 rows only once one is owned.
    if ((kind === 'helmet' || kind === 'cape') && !b.some(x => x.startsWith('sp:') && SPECIAL[x.slice(3)] && SPECIAL[x.slice(3)].kind === kind)) continue;
    const h = document.createElement('h4');
    h.textContent = label;
    box.append(h);
    const row = document.createElement('div');
    row.className = 'equip-row';
    const tiers = b.filter(x => x.startsWith(kind + ':')).map(x => +x.split(':')[1]).sort((x, y) => x - y);
    if (kind === 'shield' || kind === 'helmet' || kind === 'cape') tiers.unshift(-1);
    for (const t of tiers) {
      const btn = document.createElement('button');
      btn.className = 'equip' + (g[kind] === t && !g[kind + 'Sp'] ? ' on' : '');
      const icon = pieceIcon(cls, kind, t);
      const star = t < 0 ? 1 : starOf(cls, `${kind}:${t}`), dragon = kind === 'weapon' && t === dragonTier(cls);
      btn.innerHTML = (icon ? `<img src="${icon}" alt="">` : '') + `<span>${t < 0 ? '없음' : pieceName(cls, kind, t)}${star > 1 && !dragon ? ` ★${star}` : ''}</span>`;
      btn.onclick = () => {
        wear(kind, t);
        buildEquip();
      };
      row.append(btn);
    }
    // The specials found of this kind: gold-framed, with their option.
    for (const id of b.filter(x => x.startsWith('sp:')).map(x => x.slice(3))) {
      const sp = SPECIAL[id];
      if (!sp || sp.kind !== kind) continue;
      const t = specialBase(sp, cls.id), btn = document.createElement('button');
      btn.className = 'equip special' + (g[kind + 'Sp'] === id ? ' on' : '');
      const icon = pieceIcon(cls, kind, t, id), st = starOf(cls, 'sp:' + id);
      btn.innerHTML = (icon ? `<img src="${icon}" alt="">` : '') + `<span>${sp.craft ? '◆' : '★'}${specialName(sp, cls.id)}${st > 1 ? ` ★${st}` : ''}</span><small>${sp.opt.text}</small>`;
      btn.onclick = () => {
        wear(kind, t, id);
        buildEquip();
      };
      row.append(btn);
    }
    box.append(row);
  }
  const pw = k => (g[k + 'Sp'] && SPECIAL[g[k + 'Sp']] ? specialPower(SPECIAL[g[k + 'Sp']], cls.id) + 0.5 * (starOf(cls, 'sp:' + g[k + 'Sp']) - 1)
    : g[k] < 0 ? -1 : gearPower(cls.id, k, g[k]) + 0.5 * (starOf(cls, `${k}:${g[k]}`) - 1));
  const opts = ['weapon', 'armor', 'shield', 'helmet', 'cape'].map(k => g[k + 'Sp'] && SPECIAL[g[k + 'Sp']]).filter(Boolean).map(sp => sp.opt.text);
  const ex = k => (g[k + 'Sp'] ? Math.max(0, pw(k)) : 0);
  $('#equip-stats').textContent = `공격력 +${Math.round(12 * pw('weapon'))}% · 체력 +${pw('armor') * 20 + ex('helmet') * 12}`
    + ` · 방어 +${Math.max(0, pw('shield') + 1) + Math.round(ex('cape') / 3)}`
    + (opts.length ? ` · ${opts.join(' · ')}` : '');
}

// ---------------------------------------------------------------- 도감
//
// Every piece a class can have: the hunting grounds' line, the raids' sets and the specials,
// with where each drops and whether it is found. Searchable, filtered by grade.

let codexCls = null, codexGrade = 'all', codexOwned = false;

function codexItems(cls) {
  const b = bag(cls), out = [];
  for (const kind of ['weapon', 'armor', 'shield']) {
    GEAR[cls.id][kind].forEach((name, t) => {
      const raid = raidOf(cls.id, kind, t), craft = kind === 'weapon' && name === CRAFT_GEAR[cls.id];
      const rc = craft && craftRecipe(cls.id);
      out.push({ grade: craft ? 'craft' : raid ? 'raid' : 'plain', kind, name: craft ? `${dragonName(cls.id, 1)} ~ ${dragonName(cls.id, DRAGON_MAX)}` : name,
        icon: (craft && picture(dragonName(cls.id, b.includes(`${kind}:${t}`) ? starOf(cls, `${kind}:${t}`) : 1))) || gearIcon(cls.id, kind, t), pow: gearPower(cls.id, kind, t),
        owned: b.includes(`${kind}:${t}`),
        from: craft ? `대장장이 조합: ${GEAR[cls.id].weapon[rc.base]} ★${rc.star} + 용의 비늘 ${rc.mats.scale} + 여의주 ${rc.mats.pearl}`
          : raid ? raid.name : tierSources(cls.id, kind, t) });
    });
  }
  for (const sp of SPECIALS) {
    const t = specialBase(sp, cls.id);
    const from = sp.craft ? `대장장이 조합: ${sp.craft.from ? specialName(SPECIAL[sp.craft.from], cls.id) + ' ★5 + ' : ''}${Object.entries(sp.craft.mats).map(([id, n]) => `${MATS[id].name} ${n}`).join(' + ')} + ${sp.craft.gold}전`
      : sp.srcName;
    out.push({ grade: sp.craft ? 'craft' : 'special', kind: sp.kind, name: specialName(sp, cls.id),
      icon: picture(craftPicture(sp, cls.id, b.includes('sp:' + sp.id) ? starOf(cls, 'sp:' + sp.id) : 1)) || gearIcon(cls.id, sp.kind, t),
      pow: specialPower(sp, cls.id), owned: b.includes('sp:' + sp.id), from, opt: sp.opt.text });
  }
  return out;
}

function buildCodex() {
  const cls = codexCls || (G ? G.cls : chosenClass) || CLASSES[0];
  codexCls = cls;
  $('#codex-cls').innerHTML = '';
  for (const c of CLASSES) {
    const btn = document.createElement('button');
    btn.textContent = c.name;
    btn.className = c === cls ? 'on' : '';
    btn.onclick = () => { codexCls = c; buildCodex(); };
    $('#codex-cls').append(btn);
  }
  const grades = $('#codex-grades');
  grades.innerHTML = '';
  for (const [g, label] of [['all', '전체'], ['plain', '일반'], ['raid', '레이드'], ['craft', '조합'], ['special', '★ 스페셜']]) {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.className = codexGrade === g ? 'on' : '';
    btn.onclick = () => { codexGrade = g; buildCodex(); };
    grades.append(btn);
  }
  const own = document.createElement('button');
  own.textContent = '가진 것만';
  own.className = codexOwned ? 'on' : '';
  own.onclick = () => { codexOwned = !codexOwned; buildCodex(); };
  grades.append(own);
  const q = $('#codex-search').value.trim();
  const all = codexItems(cls);
  const list = all.filter(it => (codexGrade === 'all' || it.grade === codexGrade) && (!codexOwned || it.owned)
    && (!q || [it.name, KIND_NAME[it.kind], it.opt || '', ...[].concat(it.from)].some(x => x.includes(q))));
  $('#codex-count').textContent = `${cls.name} · 모은 것 ${all.filter(x => x.owned).length}/${all.length}`;
  const box = $('#codex-rows');
  box.innerHTML = '';
  for (const it of list) {
    const row = document.createElement('div');
    row.className = 'codex-item ' + it.grade + (it.owned ? '' : ' missing');
    const from = Array.isArray(it.from) ? (it.from.length ? (it.from.length > 2 ? `${it.from[0]} ~ ${it.from[it.from.length - 1]}` : it.from.join(', ')) : '나오지 않음') : it.from;
    const grade = { plain: '일반', raid: '레이드', craft: '조합', special: '스페셜' }[it.grade];
    row.innerHTML = (it.icon ? `<img src="${it.icon}" alt="">` : '<span></span>')
      + `<div><b>${it.grade === 'special' ? '★' : it.grade === 'craft' ? '◆' : ''}${it.name}</b><i>${grade}</i><i>${KIND_NAME[it.kind]} ${it.pow}등급</i>`
      + `<span>${it.owned ? '✓ 가짐 · ' : ''}${it.grade === 'special' ? '아주 드묾 · ' : ''}${from}${it.opt ? ` · ${it.opt}` : ''}</span></div>`;
    box.append(row);
  }
  if (!list.length) box.innerHTML = '<div class="note">찾는 장비가 없습니다.</div>';
}

$('#codex-search').oninput = () => buildCodex();
$('#open-codex').onclick = () => { codexCls = null; buildCodex(); $('#codex').hidden = false; };
$('#equip-codex').onclick = () => { codexCls = null; buildCodex(); $('#codex').hidden = false; };
$('#close-codex').onclick = () => { $('#codex').hidden = true; };

// ---------------------------------------------------------------- 강화 · 조합 (the smith)
//
// 강화: a piece's spare copies (a second drop of it) and gold raise its star, ★1 to ★5, half a
// rank each. 조합: the 용무기, made only here, from the best hunting-ground weapon at ★3, dragon
// scales, a pearl and gold.

function openCraft() {
  const cls = G ? G.cls : chosenClass, b = bag(cls), box = $('#trade-rows');
  box.innerHTML = '';
  $('#trade-title').textContent = '대장장이 · 강화·조합';
  const mats = progress.mats || {};
  $('#trade-gold').textContent = `가진 돈 ${progress.gold || 0}전 · `
    + Object.entries(MATS).map(([id, m]) => `${m.name} ${mats[id] || 0}`).join(' · ');
  let icon = null;
  const row = (name, desc, label, can, act) => {
    const r = document.createElement('div');
    r.className = 'trade-row';
    r.innerHTML = `<div><b>${name}</b><span>${desc}</span></div>`;
    if (icon) r.insertAdjacentHTML('afterbegin', `<img class="trade-pic" src="${icon}" alt="">`);
    icon = null;
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.textContent = label;
    btn.disabled = !can;
    btn.onclick = () => {
      act();
      saveJson('bs_progress', progress);
      if ($('#town-gold')) $('#town-gold').textContent = `${progress.gold || 0}전`;
      if (G) applyGear();
      refreshAvatars();
      openCraft();
    };
    r.append(btn);
    box.append(r);
  };
  const head = text => { const h = document.createElement('h4'); h.textContent = text; h.style.margin = '6px 0 2px'; box.append(h); };
  head(`조합 · ${cls.name}의 용무기`);
  const rc = craftRecipe(cls.id), dragon = CRAFT_GEAR[cls.id], dt = GEAR[cls.id].weapon.indexOf(dragon);
  const baseKey = `weapon:${rc.base}`, baseName = GEAR[cls.id].weapon[rc.base];
  const has = b.includes(`weapon:${dt}`);
  const ok = !has && b.includes(baseKey) && starOf(cls, baseKey) >= rc.star && (progress.gold || 0) >= rc.gold
    && Object.entries(rc.mats).every(([id, n]) => (mats[id] || 0) >= n);
  icon = picture(dragonName(cls.id, 1));
  row(`${dragonName(cls.id, 1)} (${CRAFT_POWER}등급 · 제십까지 ${CRAFT_POWER + (DRAGON_MAX - 1) / 2}등급)`, `${baseName} ★${rc.star} (지금 ${b.includes(baseKey) ? '★' + starOf(cls, baseKey) : '없음'}) + `
    + Object.entries(rc.mats).map(([id, n]) => `${MATS[id].name} ${mats[id] || 0}/${n}`).join(' + ') + ` + ${rc.gold}전`,
    has ? '가짐' : '조합', ok, () => {
      progress.gold -= rc.gold;
      for (const [id, n] of Object.entries(rc.mats)) mats[id] -= n;
      progress.mats = mats;
      // The base weapon goes into the making.
      b.splice(b.indexOf(baseKey), 1);
      b.push(`weapon:${dt}`);
      if (progress.stars && progress.stars[cls.id]) delete progress.stars[cls.id][baseKey];
      if (savedGear(cls).weapon === rc.base) wear('weapon', dt);
      say(`${josa(dragon, '을', '를')} 조합했습니다!`, 'sys');
      banner(`조합 성공 · ${dragon}`);
    });
  head('조합 · 재료 장비');
  const have = m => Object.entries(m).every(([id, n]) => (mats[id] || 0) >= n);
  const matText = m => Object.entries(m).map(([id, n]) => `${MATS[id].name} ${mats[id] || 0}/${n}`).join(' + ');
  for (const c of CRAFTS) {
    const sp = SPECIAL[c.id], key = 'sp:' + c.id, got = b.includes(key);
    if (c.legend && c === CRAFTS.find(x => x.legend)) head('조합 · 전설 장비 (현대 바람의나라)');
    // An evolution is made out of its base piece at ★5, which goes into the making.
    const baseKey = c.from && 'sp:' + c.from, base = c.from && SPECIAL[c.from];
    const baseOk = !c.from || (b.includes(baseKey) && starOf(cls, baseKey) >= 5);
    const baseText = c.from ? `${specialName(base, cls.id)} ★5 (지금 ${b.includes(baseKey) ? '★' + starOf(cls, baseKey) : '없음'}) + ` : '';
    icon = picture(craftPicture(sp, cls.id, got ? starOf(cls, key) : 1));
    row(`${specialName(sp, cls.id)} (${KIND_NAME[c.kind]} ${c.pow}등급)`, `${baseText}${matText(c.mats)} + ${c.gold}전 · ${sp.opt.text}`,
      got ? '가짐' : '조합', !got && baseOk && have(c.mats) && (progress.gold || 0) >= c.gold, () => {
        progress.gold -= c.gold;
        for (const [id, n] of Object.entries(c.mats)) mats[id] -= n;
        progress.mats = mats;
        if (c.from) {
          b.splice(b.indexOf(baseKey), 1);
          if (progress.stars && progress.stars[cls.id]) delete progress.stars[cls.id][baseKey];
          if (savedGear(cls)[c.kind + 'Sp'] === c.from) wear(c.kind, specialBase(sp, cls.id), c.id);
        }
        b.push(key);
        say(`${josa(specialName(sp, cls.id), '을', '를')} 조합했습니다!`, 'sys');
        if (c.legend) banner(`조합 성공 · ${specialName(sp, cls.id)}`);
      });
  }
  head('강화 · 사본(조합 장비는 재료)으로 별을 올린다');
  const owned = b.filter(k => !k.startsWith('sp:') || SPECIAL[k.slice(3)]);
  let any = false;
  for (const key of owned) {
    const star = starOf(cls, key), copies = copiesOf(cls, key);
    if (star >= STAR_MAX && !copies && !key.startsWith('sp:cr_') && !isDragonKey(cls, key)) continue;
    const [kind, t] = key.split(':');
    const sp0 = key.startsWith('sp:') ? SPECIAL[key.slice(3)] : null;
    const name = sp0 ? (sp0.craft ? '◆' : '★') + specialName(sp0, cls.id) : pieceName(cls, kind, +t);
    const top = starMaxOf(cls, key), dragon = isDragonKey(cls, key);
    // Crafted pieces (and the 용무기) never drop twice: their stars are paid in materials.
    const csp = key.startsWith('sp:') && SPECIAL[key.slice(3)] && SPECIAL[key.slice(3)].craft ? SPECIAL[key.slice(3)] : null;
    const crafted = !!csp || key === `weapon:${GEAR[cls.id].weapon.indexOf(CRAFT_GEAR[cls.id])}`;
    if (crafted) {
      any = true;
      const sc = starMats(csp, star);
      icon = pieceIcon(cls, kind, +t, csp && csp.id);
      const next = dragon ? dragonName(cls.id, star + 1) : `★${star + 1}`;
      row(dragon ? name : `${name} ★${star}`, star >= top ? (dragon ? '최고 단계 (제십)' : '최고 별') : `${next}: ${matText(sc.mats)} + ${sc.gold}전 · 반 등급 오름`,
        star >= top ? '최고' : (dragon ? '승급' : '강화'), star < top && have(sc.mats) && (progress.gold || 0) >= sc.gold, () => {
          progress.gold -= sc.gold;
          for (const [id, n] of Object.entries(sc.mats)) mats[id] -= n;
          progress.mats = mats;
          progress.stars = progress.stars || {};
          const st = progress.stars[cls.id] = progress.stars[cls.id] || {};
          st[key] = star + 1;
          say(dragon ? `${dragonName(cls.id, star + 1)} 승급!` : `${name} ★${star + 1} 강화!`, 'sys');
          if (dragon || (csp && csp.craft.legend)) banner(dragon ? `승급 성공 · ${dragonName(cls.id, star + 1)}` : `강화 성공 · ${name} ★${star + 1}`);
        });
      continue;
    }
    const cost = starCost(star);
    if (!copies && star === 1) continue;
    any = true;
    const can = star < STAR_MAX && copies >= cost.copies && (progress.gold || 0) >= cost.gold;
    row(`${name} ★${star}`, star >= STAR_MAX ? '최고 별' : `★${star + 1}: 사본 ${copies}/${cost.copies} + ${cost.gold}전 · 별마다 반 등급`,
      star >= STAR_MAX ? '최고' : '강화', can, () => {
        progress.gold -= cost.gold;
        progress.copies[cls.id][key] -= cost.copies;
        progress.stars = progress.stars || {};
        const st = progress.stars[cls.id] = progress.stars[cls.id] || {};
        st[key] = star + 1;
        say(`${name} ★${star + 1} 강화!`, 'sys');
      });
  }
  if (!any) row('강화할 장비가 없습니다', '같은 장비를 한 번 더 주우면 사본이 되어 강화 재료가 됩니다', '-', false, () => {});
  $('#trade').hidden = false;
}

$('#equip-craft').onclick = () => openCraft();

$('#open-equip').onclick = () => {
  buildEquip();
  $('#equip').hidden = false;
};
$('#close-equip').onclick = () => { $('#equip').hidden = true; };

// ---------------------------------------------------------------- spell tree
//
// Each class's spells as chains: a spell at 8단 with its passive becomes the last spell of the
// tree at the next chest. Shown from the menu, and from the level-up cards with the chains of
// the offered cards marked.

function treeSpell(id, opts = {}) {
  const def = SKILLS[id];
  const el = document.createElement('div');
  const fx = def.fxs ? def.fxs[def.fxs.length - 1] : def.fx;
  const mine = G && G.skills.find(x => x.id === id);
  el.className = 'spell' + (def.evolved ? ' final' : '') + (mine ? ' have' : '')
    + (G && !mine && (def.req || 1) > G.player.lvl ? ' lock' : '');
  el.append(fx ? fxIcon(fx) : itemIcon('p_power'));
  const t = document.createElement('div');
  const grown = !mine && G && G.skills.some(x => x.from === id || x.from2 === id);
  // A 승급 spell not yet opened: which conquest opens it.
  const cls = def.cls === 'all' ? null : def.cls;
  if (def.promo && cls && promoOf(cls) < def.promo) {
    const at = STAGES.find(x => x.id === PROMOS[cls][def.promo - 1].at);
    opts.note = `${def.promo}차 승급 · ${at.name} 정복`;
    el.classList.add('lock');
  }
  if (grown) el.classList.add('have');
  const lv = grown ? '완성됨' : mine ? (def.evolved ? '완성' : `${mine.lv}/${MAX_SKILL_LEVEL}단`) : `Lv ${def.req || 1}부터`;
  t.innerHTML = `<b>${def.name}</b><span>${opts.note || lv}</span>`;
  el.append(t);
  el.title = def.desc || '';
  return el;
}

function treePassive(id) {
  const ps = PASSIVES[id], have = G ? G.passives[id] || 0 : 0;
  const el = document.createElement('div');
  el.className = 'spell' + (have ? ' have' : '');
  el.append(itemIcon(ps.item));
  const t = document.createElement('div');
  t.innerHTML = `<b>${ps.name}</b><span>${have ? `${have}/${MAX_PASSIVE_LEVEL}` : '보조 능력'}</span>`;
  el.append(t);
  return el;
}

function buildTree(cls, hot = new Set()) {
  // Where the class stands: its 승급, and what the next one needs.
  const tier = promoOf(cls.id), nextP = PROMOS[cls.id][tier];
  $('#tree-cls').textContent = `${cls.name} · ${tier ? `${tier}차 승급` : '승급 전'}`
    + (nextP ? ` · 다음: ${josa(STAGES.find(x => x.id === nextP.at).name, '을', '를')} ${josa(cls.name, '으로', '로')} 정복`
      : ' · 모든 승급 완료');
  const box = $('#tree-rows');
  box.innerHTML = '';
  const mine = Object.entries(SKILLS).filter(([, d]) => d.cls === cls.id || d.cls === 'all');
  // One row per 승급, as the old game listed its spells: 일반, then 1차 to 4차.
  for (let t = 0; t <= 4; t++) {
    const row = mine.filter(([, d]) => (d.promo || 0) === t);
    if (!row.length) continue;
    const h = document.createElement('h4');
    const at = t ? STAGES.find(x => x.id === PROMOS[cls.id][t - 1].at) : null;
    h.textContent = t ? `${t}차 승급 · ${at.name} 정복${tier >= t ? '' : ' (아직)'}` : '일반 · 처음부터';
    if (t && tier < t) h.style.opacity = 0.6;
    box.append(h);
    const grid = document.createElement('div');
    grid.className = 'others';
    for (const [id, d] of row) {
      let note;
      if (d.kind === 'ult') note = '마력이 차면 · 필살';
      else if (d.evolved) {
        const from = mine.find(([, x]) => x.up === id);
        note = `${from ? from[1].name : ''} 8단에서 각성`;
      } else if (d.up) note = `8단 → ${SKILLS[d.up].name}(${SKILLS[d.up].promo}차)`;
      if (!note && mastered(cls.id).includes(id)) note = '숙련 · 첫 카드에 나옴';
      const el = treeSpell(id, note ? { note } : {});
      if (hot.has(id)) el.style.outline = '2px solid #7a1800';
      grid.append(el);
    }
    box.append(grid);
  }
  $('#tree').hidden = false;
}

$('#open-tree').onclick = () => buildTree(G ? G.cls : CLASSES[0]);
$('#lv-tree').onclick = () => {
  if (!G) return;
  const hot = new Set([...$('#choices').children].map(b => b.dataset.id).filter(Boolean));
  buildTree(G.cls, hot);
};
$('#close-tree').onclick = () => { $('#tree').hidden = true; };

/** A class's figure in the gear it has found, for the menus. */
function heroPicture(cls) {
  if (!hasAvatars()) return `assets/hero/${cls.hero}.png`;
  return portrait(dressed(cls, savedGear(cls)));
}

/** The hero calls out a spell, as players typed it: a bubble over the head. */
function shout(name, plain = false) {
  if (plain) return;
  if (G.bubble && G.t - G.bubble.t < 0.8) return; // one at a time, so they can be read
  G.bubble = { text: `${name}!`, t: G.t };
}

/** Shows an attack or casting pose for a moment. */
function strikePose(kind) {
  const p = G.player;
  p.pose = kind;
  p.poseT = kind === 'attack' ? 0.22 : 0.3;
}

/** The music key of the ground being hunted. */
function huntMusic() {
  // Each raid its own grand track, from the start to the end of the fight.
  if (G.stage.raid) return 'raid_' + G.stage.id;
  return 'stage_' + G.stage.id;
}

/** Experience to the next level, on D2 Survivors' curve: 5 at level 1, 83 at 10, 297 at 25. */
function xpFor(lvl) {
  const l = lvl - 1;
  return Math.floor(5 + 6 * l + 0.25 * l * l + (lvl > 25 ? 0.05 * Math.pow(lvl - 25, 3) : 0));
}

function addSkill(id) {
  const have = G.skills.find(s => s.id === id);
  if (have) have.lv++;
  else G.skills.push({ id, lv: 1, timer: 0.3 });
  // 숙련: a spell once raised to 8단 is the class's for good (it may open later runs).
  if (have && have.lv >= MAX_SKILL_LEVEL) {
    progress.mastered = progress.mastered || {};
    const m = progress.mastered[G.cls.id] = progress.mastered[G.cls.id] || [];
    if (!m.includes(id)) {
      m.push(id);
      saveJson('bs_progress', progress);
      say(`${josa(SKILLS[id].name, '을', '를')} 숙련했습니다. 다음 사냥부터 첫 카드에 나올 수 있습니다.`, 'sys');
    }
  }
}

/** The spells a class has mastered (8단 once), still open to it by 승급. */
function mastered(cls) {
  return ((progress.mastered || {})[cls] || []).filter(id => SKILLS[id] && promoOf(cls) >= (SKILLS[id].promo || 0));
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
  // A ground already conquered may be hunted at x2 or x3 (the 속도 key): farming goes quicker.
  const fast = G && G.wasCleared ? settings.speed || 1 : 1;
  for (let i = 0; i < TEST_SPEED * fast; i++) {
    if (!G || G.paused || G.choosing || G.over) continue;
    if (G.hitstop > 0) G.hitstop -= dt;
    else if (G.slowmo > 0) {
      G.slowmo -= dt;
      update(dt * 0.35);
    } else update(dt);
  }
  if (T && !G && !$('#town').hidden) updateTown(dt);
  render(now / 1000);
  syncUlt();
  requestAnimationFrame(frame);
}

/**
 * The hero on the tiles, as the client moved: one tile a step in four directions. A new
 * direction first turns the hero in place (so a spell can be aimed without stepping), then it
 * walks. Monsters block the way; pushing into one for half a second squeezes past it.
 */
function stepHero(dx, dy, dt) {
  const p = G.player;
  if (p.stepping) {
    p.st += dt;
    const k = Math.min(1, p.st / p.sdur);
    p.x = (p.sfx + (p.tx - p.sfx) * k) * TILE + TILE / 2;
    p.y = (p.sfy + (p.ty - p.sfy) * k) * TILE + TILE - 6;
    p.walkT += dt * 1000;
    p.phase += (dt / p.sdur) * Math.PI;
    if (k < 1) return;
    p.stepping = false;
  }
  p.moving = false;
  if (!dx && !dy) {
    p.pushT = 0;
    p.turnT = 0;
    return;
  }
  if (p.fdx !== dx || p.fdy !== dy) {
    p.fdx = dx;
    p.fdy = dy;
    if (dx) p.face = dx;
    p.turnT = 0.1;
    p.pushT = 0;
    return;
  }
  if (p.turnT > 0) {
    p.turnT -= dt;
    return;
  }
  const nx = p.tx + dx, ny = p.ty + dy, there = occ.get(key(nx, ny));
  if (there && there.hp > 0) {
    p.pushT = (p.pushT || 0) + dt;
    if (p.pushT < 0.5 || there.moving || there.kind === 'boss') return;
    // Pushed long enough, the hero and the monster trade places: never two on one tile.
    occ.delete(key(nx, ny));
    place(there, p.tx, p.ty);
    // It slides across as the hero does, rather than jumping.
    there.fx = nx;
    there.fy = ny;
    there.mt = 0;
    there.dur = TILE / heroSpeed();
    there.moving = true;
  }
  p.pushT = 0;
  p.sfx = p.tx;
  p.sfy = p.ty;
  p.tx = nx;
  p.ty = ny;
  p.st = 0;
  p.sdur = TILE / heroSpeed();
  p.stepping = p.moving = true;
}

/** Pixels a second the hero walks. */
function heroSpeed() {
  return (TILE / 0.24) * (G.player.speed / 70) * (1 + 0.08 * G.passives.speed) * (1 + 0.1 * opt('speed'));
}

function update(dt) {
  G.t += dt;
  const p = G.player;

  if (!G.dead) {
    const [dx, dy] = input();
    if (settings.tiles) stepHero(dx, dy, dt);
    else {
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
    }
    p.inv = Math.max(0, p.inv - dt);
    p.poseT = Math.max(0, p.poseT - dt);
    p.mp = Math.min(p.maxMp, p.mp + (p.maxMp / 45) * (1 + 0.25 * G.passives.mana) * (1 + 0.3 * opt('mana')) * dt);
    // Health comes back slowly by itself, as it did in the old game.
    p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.005 * (1 + opt('regen')) * dt);
  }
  G.shake = Math.max(0, G.shake - dt);

  spawn(dt);
  moveEnemies(dt);
  if (!G.dead) {
    for (const s of G.skills) {
      // 마기지체: every spell turns 1.6 times as fast for a while.
      s.timer -= dt * (G.buffs.haste > G.t ? 1.6 : 1) * (1 + 0.08 * opt('haste'));
      if (s.timer <= 0) {
        const st = stats(s);
        s.timer += st.cd;
        if (s.timer < 0) s.timer = st.cd;
        cast(s, st);
      }
    }
    plainAttack(dt);
  }
  runTimers();
  updateAllies(dt);
  updateParty(dt);
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
function ringTile(must = false) {
  const p = G.player, v = viewTiles();
  for (let tries = 0; tries < (must ? 200 : 40); tries++) {
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
  if (must) {
    // A boss comes even when the edge of the view is all rock: the nearest open tile 4 away.
    for (let r = 4; r < 20; r++)
      for (let i = -r; i <= r; i++)
        for (const [tx, ty] of [[p.tx + i, p.ty - r], [p.tx + i, p.ty + r], [p.tx - r, p.ty + i], [p.tx + r, p.ty + i]])
          if (free(tx, ty)) return [tx, ty];
  }
  return null;
}

// Monster numbers follow D2 Survivors' acts: a floor that rises from the act's opening count
// to its 5:00 count, about one more each second from 1:00 and two from 3:00, a pack of
// champions every 90 seconds and a named leader with followers twice a ground. At 6:00 the
// boss comes and the field calms to 25; the boss weakens after 1:30 and is surely down by
// 2:50. The grounds map onto the five acts in order.
// A hero hunting alone: the first act opens lighter (6 rising to 60) than D2 Survivors' party-sized one.
const FLOOR_OPEN = [6, 40, 55, 65, 75], FLOOR_FIVE = [60, 85, 105, 110, 120];
const FIELD_MAX = 220;

function floorCount(t) {
  // The grounds' strength runs 0 to 13, mapped onto D2 Survivors' five acts.
  const a = Math.min(4, Math.round((G.level / 13) * 4));
  return Math.round(FLOOR_OPEN[a] + (FLOOR_FIVE[a] - FLOOR_OPEN[a]) * Math.min(1, t / 300));
}

// ---------------------------------------------------------------- raids

/** The class's skills fitted to a level: its recorded build, or one made from its open spells. */
function applyBuild(start) {
  const cls = G.cls.id, rec = (progress.builds || {})[cls];
  const fits = (id, d) => d && (d.cls === cls || d.cls === 'all') && d.kind !== 'ult' && promoOf(cls) >= (d.promo || 0)
    && (d.req || 1) <= start;
  let list = rec ? rec.skills.filter(([id]) => fits(id, SKILLS[id])) : [];
  if (!list.length) {
    // No record yet: the class's open spells, attacks first, each as high as the level allows.
    list = Object.entries(SKILLS).filter(([id, d]) => fits(id, d) && !d.evolved && d.cls === cls)
      .sort((a, b) => (a[1].req || 1) - (b[1].req || 1)).slice(0, 5).map(([id, d]) => [id, 8]);
    list.push(['c_heal', 8]);
  }
  G.skills = list.slice(0, MAX_SKILLS).map(([id, lv]) => {
    const d = SKILLS[id];
    return { id, lv: d.evolved ? 1 : Math.max(1, Math.min(lv, start - (d.req || 1) + 1, MAX_SKILL_LEVEL)), timer: 0.5 };
  });
  const cap = Math.max(1, Math.floor(start / 4));
  for (const k of Object.keys(G.passives)) G.passives[k] = Math.min(cap, rec ? rec.passives[k] || 0 : (k === 'life' || k === 'power' ? cap : 0));
  // 체력 단련 gives its health as when picked on a card.
  G.player.maxHp += 20 * G.passives.life;
  G.player.hp = G.player.maxHp;
  say(`${rec ? '지난 빌드' : '자동 빌드'}로 시작: ${G.skills.map(s => skillName(s.id, s.lv)).join(', ')}`, 'sys');
}

/** A hunt's build, kept for the class when it went well (its raids start from it). */
function keepBuild() {
  if (!G || G.stage.raid || G.player.lvl < 8) return;
  progress.builds = progress.builds || {};
  const old = progress.builds[G.cls.id];
  if (old && !G.cleared && old.lvl > G.player.lvl) return;
  progress.builds[G.cls.id] = { lvl: G.player.lvl, skills: G.skills.map(s => [s.id, s.lv]), passives: { ...G.passives } };
}

/** How hard a raid's boss strikes, by its rung: 0.58 for the first, 1 for 화령. */
function raidK() {
  return Math.min(1, 0.5 + G.level / 24);
}

/** Difficulty as stars, for the raid list. */
function raidStars(r) {
  const n = Math.max(1, Math.min(5, Math.round(r.level / 2.4)));
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

/** A raid: the hero starts grown (cards for each level), and every other class joins at once. */
function raidSetup() {
  const p = G.player, rec = best[G.cls.id];
  const start = Math.max(1, Math.min(20, Math.floor((rec ? rec.lvl : 1) * 0.6)));
  p.lvl = start;
  p.next = xpFor(start);
  // The hero's own route: the build of its best hunt (or one made from its open spells),
  // fitted to the raid's level; no cards to pick unless the player asks for them.
  if (settings.raidManual) G.pendingLevels = start;
  else {
    G.pendingLevels = 0;
    G.firstCard = false;
    applyBuild(start);
  }
  G.raidT = 3;
  G.phase = 0;
  const names = [];
  for (const c of CLASSES) {
    if (c.id === G.cls.id) continue;
    joinParty(c);
    const m = G.party[G.party.length - 1], r = best[c.id], g = savedGear(c);
    // As strong as that class has grown: its best level and the weapon it has found.
    m.baseLv = Math.min(6, 1 + Math.floor((r ? r.lvl : 1) / 6));
    m.power = 1 + 0.03 * (r ? r.lvl : 1) + 0.08 * Math.max(0, gearPower(c.id, 'weapon', g.weapon) + 1);
    names.push(`${m.name}(${c.name} Lv${r ? r.lvl : 1})`);
  }
  say(`레이드에 모였습니다: ${names.join(', ')}`, 'party');
}

/**
 * The boss speaks: a box with its face, name and line over the chat, as an NPC's talk in the
 * client, and the line in the chat. kind: enter, p1, p2, summon, kill, low, enrage, death.
 */
function bossSay(kind) {
  const L = G.stage.lines;
  if (!L || !L[kind]) return;
  if (kind === 'kill' || kind === 'summon' || kind === 'killHealer') {
    if (G.t - (G.saidAt || -99) < 8) return; // the taunts not too often
  }
  G.saidAt = G.t;
  const text = Array.isArray(L[kind]) ? L[kind][Math.floor(Math.random() * L[kind].length)] : L[kind];
  const b = G.enemies.find(e => e.kind === 'boss');
  if (b) b.bubble = { text: text.length > 14 ? text.slice(0, 13) + '…' : text, t: G.t };
  say(`${G.boss.name}: ${text}`, 'warn');
  const box = $('#dialog');
  $('#dlg-name').textContent = G.boss.name;
  $('#dlg-text').textContent = text;
  // The face: the top of the boss's picture, squared.
  const c = $('#dlg-face'), g = c.getContext('2d'), im = G.boss.m.img;
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, c.width, c.height);
  const side = Math.min(im.width, im.height);
  g.drawImage(im, (im.width - side) / 2, 0, side, side, 0, 0, c.width, c.height);
  box.hidden = false;
  box.classList.remove('show');
  void box.offsetWidth;
  box.classList.add('show');
  clearTimeout(bossSay.t);
  bossSay.t = setTimeout(() => { box.hidden = true; }, kind === 'enter' || kind === 'death' ? 4200 : 3200);
}

/** A crowd of the raid's monsters around the boss: on its call, and at a phase. */
function raidWave(b, n) {
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2, r = 3 + (i % 2);
    const tx = b.tx + Math.round(Math.cos(a) * r), ty = b.ty + Math.round(Math.sin(a) * r);
    if (free(tx, ty)) addEnemy(pickMonster(i % 4 === 0), null, null, 0, [tx, ty]);
  }
  addFx(G.stage.fx, b.x, b.y - 30, { scale: 1.2 });
}

function raidSpawn(dt) {
  const t = G.t, p = G.player;
  const b = G.enemies.find(e => e.kind === 'boss');
  if (G.bossT !== undefined && !b && !G.cleared) {
    clearStage();
    return;
  }
  if (t > RAID_LIMIT && !G.cleared) {
    say('시간이 다 되었습니다. 레이드에 실패했습니다.', 'warn');
    showResults(`${G.stage.name} 실패`);
    return;
  }
  // A steady field, thinner once the boss is out.
  const floor = G.bossT === undefined ? 30 : 12 + 6 * G.phase;
  G.spawnT -= dt;
  if (G.spawnT <= 0) {
    G.spawnT = 1;
    for (let i = 0; i < 2 && G.enemies.length < floor; i++) addEnemy(pickMonster());
  }
  if (G.bossDue && t >= RAID_BOSS_AT) {
    const e = addEnemy(G.boss.m, 'boss', G.boss);
    if (!e) return;
    // Built for a whole party: about four minutes for a party of grown heroes.
    e.hp = e.maxHp = 11000 * G.level;
    // Its bite takes a sixth of the hero's health.
    e.dmg = G.player.maxHp * 0.16 * raidK() + G.player.armor + G.passives.armor;
    G.aggroT = 0;
    G.bossDue = false;
    G.bossT = t;
    // The entrance: it speaks, untouchable a moment, before the first blow.
    e.guardT = t + 2.5;
    G.raidT = 4;
    G.waveT = t + 30;
    bossSay('enter');
    audio.play('boss');
    // The raid's own music plays on: no switch to the hunting grounds' boss track.
    G.shake = 0.6;
    say(`${josa(G.boss.name, '이', '가')} 나타났습니다! 붉은 칸을 피하세요.`, 'warn');
    // Its name card: the name and what it is called.
    banner(`${G.boss.name} · ${G.stage.title || '레이드 보스'}`);
  }
  if (!b) return;
  // Phases at 70% and 40%; a frenzy below 25% (quicker strikes).
  const phase = b.hp < b.maxHp * 0.4 ? 2 : b.hp < b.maxHp * 0.7 ? 1 : 0;
  if (!G.frenzy && b.hp < b.maxHp * 0.25) {
    G.frenzy = true;
    banner(`${josa(G.boss.name, '이', '가')} 날뛴다!`);
  }
  if (phase > G.phase) {
    // A phase: it speaks, stands untouchable a moment, and calls a big wave (champions too).
    G.phase = phase;
    banner(`${josa(G.boss.name, '이', '가')} 사나워진다!`);
    bossSay(phase === 1 ? 'p1' : 'p2');
    b.guardT = t + 2;
    G.raidT = Math.max(G.raidT, 2.5);
    raidWave(b, 8 + phase * 2);
    const m = pickMonster(true), pack = ++G.packs;
    for (let i = 0; i < 1 + phase; i++) addEnemy(m, 'champ', { name: '챔피언', scale: 1.15 }, pack);
  }
  // Every half minute it calls its own.
  if (t >= G.waveT) {
    G.waveT = t + 30;
    bossSay('summon');
    raidWave(b, 5 + G.phase * 2);
  }
  if (!G.saidLow && b.hp < b.maxHp * 0.1) {
    G.saidLow = true;
    bossSay('low');
  }
  // The last minute before the time runs out: enraged, it strikes harder and faster.
  if (!G.enraged && t > RAID_LIMIT - 60) {
    G.enraged = true;
    bossSay('enrage');
    emote('rage');
    banner(`${G.boss.name} 광폭화!`);
    b.dmg *= 1.3;
  }
  // Every six seconds the boss turns on someone: the warrior most, the hero next.
  G.aggroT -= dt;
  if (G.aggroT <= 0) {
    G.aggroT = 6;
    const pool = [];
    for (const m of G.party) if (!m.down) pool.push(...Array(m.cls.id === 'warrior' ? 3 : 1).fill(m));
    pool.push(p, p);
    const prev = G.aggro;
    G.aggro = pool[Math.floor(Math.random() * pool.length)];
    if (G.aggro !== prev) b.bubble = { text: `${G.aggro === p ? '너' : G.aggro.name}!`, t: G.t };
    if (G.aggro === p) G.aggro = null;
  }
  G.raidT -= dt;
  if (G.raidT <= 0) {
    G.raidT = [4, 3.2, 2.4][G.phase] * (G.enraged ? 0.7 : 1) * (G.frenzy ? 0.85 : 1);
    const pats = G.stage.patterns;
    raidPattern(b, pats[Math.floor(Math.random() * pats.length)]);
  }
}

/** The boss marks tiles in red; a moment later they are struck. Step off them. */
const PATTERN_NAMES = { cross: '십자 화염', breath: '화염 숨결', rain: '저주의 비', ring: '혼의 고리', meteor: '유성 낙하', plus: '불기둥' };

function raidPattern(b, kind) {
  // Aimed at whoever the boss has turned on.
  const p = G.aggro && !G.aggro.down ? G.aggro : G.player, tiles = [];
  b.bubble = { text: PATTERN_NAMES[kind] + '!', t: G.t };
  const add = (x, y) => tiles.push([x, y]);
  if (kind === 'cross') {
    for (let k = -7; k <= 7; k++) { add(p.tx + k, p.ty); if (k) add(p.tx, p.ty + k); }
  } else if (kind === 'breath') {
    const dx = Math.abs(p.tx - b.tx) >= Math.abs(p.ty - b.ty) ? Math.sign(p.tx - b.tx) || 1 : 0;
    const dy = dx ? 0 : Math.sign(p.ty - b.ty) || 1;
    tiles.push(...triTiles(b.tx, b.ty, dx, dy, 6));
  } else if (kind === 'rain') {
    add(p.tx, p.ty);
    for (let i = 0; i < 7; i++) {
      const x = p.tx + Math.floor(rand(-4, 5)), y = p.ty + Math.floor(rand(-3, 4));
      add(x, y); add(x + 1, y); add(x, y + 1); add(x + 1, y + 1);
    }
  } else if (kind === 'ring') {
    for (let x = -3; x <= 3; x++) for (let y = -3; y <= 3; y++) if (Math.max(Math.abs(x), Math.abs(y)) >= 1) add(b.tx + x, b.ty + y);
    for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) add(p.tx + x, p.ty + y);
  } else if (kind === 'meteor') {
    for (const [cx, cy] of [[p.tx, p.ty], [p.tx + 4, p.ty - 2], [p.tx - 4, p.ty + 2]])
      for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) add(cx + x, cy + y);
  } else {
    tiles.push(...plusTiles(b.tx, b.ty, 9));
    for (const [dx, dy] of DIRS) add(p.tx + dx, p.ty + dy);
  }
  const warn = [1.4, 1.2, 1][G.phase];
  // A share of the hero's health, so a robed caster and an armoured warrior fear it alike.
  const share = [0.3, 0.35, 0.4][G.phase] * raidK();
  G.marks.push({ tiles, at: G.t + warn, made: G.t, dmg: G.player.maxHp * share, share });
  b.lunge = 0.3;
}

/** Marked tiles fall due: the hero standing on one is struck. */
function raidMarks() {
  const p = G.player;
  for (const mk of G.marks) {
    if (mk.done || G.t < mk.at) continue;
    mk.done = true;
    G.shake = Math.max(G.shake, 0.2);
    const fx = M.fx['new_' + G.stage.id] ? 'new_' + G.stage.id : G.stage.fx;
    mk.tiles.filter((_, i) => i % Math.max(1, Math.floor(mk.tiles.length / 10)) === 0).forEach(([x, y]) =>
      addFx(fx, x * TILE + TILE / 2, y * TILE + TILE / 2, { scale: 0.7 }));
    for (const m of G.party) if (mk.tiles.some(([x, y]) => x === m.tx && y === m.ty)) hurtMember(m, m.maxHp * mk.share);
    if (!G.dead && mk.tiles.some(([x, y]) => x === p.tx && y === p.ty)) {
      p.inv = 0;
      hurtPlayer(mk.dmg + p.armor + G.passives.armor);
      say('붉은 칸에 맞았습니다!', 'warn');
    }
  }
  G.marks = G.marks.filter(mk => !mk.done);
}

/** 계속 사냥: the field keeps growing (40 and half a monster more each second, to 220), a
 *  champion pack every minute; monsters already grow tougher with time. */
function endlessSpawn(dt) {
  const t = G.t, floor = Math.min(FIELD_MAX, 40 + (t - G.clearT) * 0.5);
  G.spawnT -= dt;
  if (G.spawnT <= 0) {
    G.spawnT = 0.5;
    for (let i = 0; i < 3 && G.enemies.length < floor; i++) addEnemy(pickMonster(Math.random() < 0.3));
  }
  if (t >= G.endlessChamp) {
    G.endlessChamp = t + 60;
    const m = pickMonster(true), pack = ++G.packs;
    for (let i = 0; i < 3; i++) addEnemy(m, 'champ', { name: '챔피언', scale: 1.15 }, pack);
    say('챔피언 무리가 나타났습니다!', 'warn');
  }
}

function spawn(dt) {
  if (G.endless) {
    endlessSpawn(dt);
    return;
  }
  if (G.stage.raid) {
    raidSpawn(dt);
    raidMarks();
    return;
  }
  const t = G.t, boss = G.bossT !== undefined;
  const floor = boss ? 25 : floorCount(t);
  // Up to the floor at once, a few a frame.
  for (let i = 0; i < 4 && G.enemies.length < floor; i++) addEnemy(pickMonster());
  if (!boss) {
    // And on top of the floor, one a second from 1:00, two from 3:00.
    G.spawnT -= dt;
    if (G.spawnT <= 0) {
      G.spawnT = 1;
      const extra = t >= 180 ? 2 : t >= 60 ? 1 : 0;
      // Never far past the floor: a field that is not being thinned does not keep swelling.
      const cap = Math.min(FIELD_MAX, floor + 70);
      for (let i = 0; i < extra && G.enemies.length < cap; i++) addEnemy(pickMonster());
    }
    if (G.champs.length && t >= G.champs[0]) {
      G.champs.shift();
      const m = pickMonster(true), pack = ++G.packs;
      for (let i = 0; i < 3; i++) addEnemy(m, 'champ', { name: '챔피언', scale: 1.15 }, pack);
      say(`챔피언 무리가 나타났습니다!`, 'warn');
      if (Math.random() < 0.6) emote('surprise');
    }
    if (G.minis.length && t >= G.minis[0] && addEnemy(G.mini.m, 'mini', G.mini)) {
      G.minis.shift();
      for (let i = 0; i < 3; i++) addEnemy(pickMonster(), 'minion');
      say(`${josa(G.mini.name, '이', '가')} 나타났습니다!`, 'warn');
      banner(`${G.mini.name} 등장`);
    }
    if (G.events.length && t >= G.events[0].at) huntEvent(G.events.shift().kind);
  }
  if (G.bossDue && t >= BOSS_AT) {
    // The field calms for the boss.
    while (G.enemies.length > 25) {
      const e = G.enemies.find(x => !x.kind);
      if (!e) break;
      G.enemies.splice(G.enemies.indexOf(e), 1);
      occ.delete(key(e.tx, e.ty));
    }
    // Near a wall the ring can be full of rock: try again next frame rather than lose the boss,
    // but not for ever: after half a minute the ground is simply conquered.
    if (!addEnemy(G.boss.m, 'boss', G.boss)) {
      if (t > BOSS_AT + 30) {
        G.bossDue = false;
        G.bossT = t;
        clearStage();
      }
      return;
    }
    G.bossDue = false;
    G.bossT = t;
    audio.play('boss');
    audio.bgm('boss');
    G.shake = 0.6;
    say(`${josa(G.boss.name, '이', '가')} 나타났습니다!`, 'warn');
    banner(`보스 ${G.boss.name} 등장!`);
    emote(Math.random() < 0.5 ? 'ready' : 'popcorn');
  }
  if (boss) {
    // After 1:30 the boss loses life on its own, and from 2:50 takes twice the damage every
    // 10 seconds: no build gets stuck on it.
    const since = t - G.bossT, b = G.enemies.find(e => e.kind === 'boss');
    // A boss gone without falling (it should not happen): the ground counts as conquered.
    if (!b && !G.cleared) {
      clearStage();
      return;
    }
    // Never a ground without end: five minutes after it came, the boss falls.
    if (b && (since > 300 || !(b.hp > -Infinity))) {
      b.hp = 0;
      killEnemy(b);
      return;
    }
    if (b && since > 90) {
      b.hp -= b.maxHp * 0.004 * dt * 60 / 60;
      b.weak = since > 170 ? Math.pow(2, (since - 170) / 10) : 1;
      if (b.hp <= 0) killEnemy(b);
    }
  }
}

// ---------------------------------------------------------------- hunting-ground events
//
// Between the champions and the leaders, something happens: a drive of monsters marching across
// in one line, a ring closing round the hero, or a golden monster carrying treasure that runs.

function eventPlan() {
  const kinds = ['march', 'ring', 'treasure'].sort(() => Math.random() - 0.5);
  kinds.push(['march', 'ring'][Math.floor(Math.random() * 2)]);
  return [60, 160, 230, 320].map((at, i) => ({ at: at + Math.floor(Math.random() * 10), kind: kinds[i] }));
}

function huntEvent(kind) {
  const p = G.player, v = viewTiles();
  if (kind === 'march') {
    // From one side, a row of thirteen, walking straight across and on out of sight.
    const [dx, dy] = DIRS[Math.floor(Math.random() * 4)];
    const m = pickMonster();
    let n = 0;
    for (let k = -6; k <= 6; k++) {
      const tx = dx ? p.tx - dx * v.w : p.tx + k, ty = dy ? p.ty - dy * v.h : p.ty + k;
      if (!free(tx, ty)) continue;
      const e = addEnemy(m, null, null, 0, [tx, ty]);
      if (e) { e.march = [dx, dy]; n++; }
    }
    const from = { '1,0': '서쪽', '-1,0': '동쪽', '0,1': '북쪽', '0,-1': '남쪽' }[dx + ',' + dy];
    say(`${from}에서 몬스터 무리가 몰려옵니다!`, 'warn');
    banner('몰이: 한 줄로 몰려온다!');
  } else if (kind === 'ring') {
    // A ring five tiles out, all at once: break through it.
    const m = pickMonster();
    for (let a = 0; a < 24; a++) {
      const tx = p.tx + Math.round(Math.cos(a / 24 * Math.PI * 2) * 5), ty = p.ty + Math.round(Math.sin(a / 24 * Math.PI * 2) * 5);
      if (free(tx, ty)) addEnemy(m, null, null, 0, [tx, ty]);
    }
    say('몬스터들이 사방을 에워쌌습니다!', 'warn');
    banner('포위: 뚫고 나가라!');
  } else {
    // A golden one with treasure, running from the hero; gone in twenty seconds.
    // Four tiles from the hero, in sight, so the chase can start.
    let spot = null;
    for (let tries = 0; tries < 30 && !spot; tries++) {
      const a = Math.random() * Math.PI * 2, tx = p.tx + Math.round(Math.cos(a) * 4), ty = p.ty + Math.round(Math.sin(a) * 3);
      if (free(tx, ty)) spot = [tx, ty];
    }
    const e = addEnemy(pickMonster(true), 'treasure', { name: '보물', scale: 1.1 }, 0, spot);
    if (!e) return;
    e.flee = G.t + 20;
    e.hp = e.maxHp = e.maxHp * 0.6;
    e.stepTime = Math.min(e.stepTime, 0.3);
    say('보물을 지닌 몬스터가 나타났습니다! 달아나기 전에 잡으세요.', 'warn');
    banner('보물 도깨비 출현!');
  }
}

function pickMonster(strong = false) {
  if (strong) return G.pool[Math.max(0, G.pool.length - 1 - Math.floor(Math.random() * 3))];
  const c = Math.min(1, G.t / (BOSS_AT * 0.9));
  const r = Math.min(1, Math.max(0, c + (Math.random() - 0.7) * 0.5));
  return G.pool[Math.round(r * (G.pool.length - 1))];
}

function addEnemy(m, kind = null, named = null, pack = 0, spot = null) {
  const at = spot || ringTile(kind === 'boss' || kind === 'mini');
  if (!at) return null;
  const t = G.t;
  // Monsters toughen with time: x2.5 by 5:00 (matched to spells growing 15% a 단).
  const tough = (1 + G.level * 0.15) * (1 + t / 200) * (G.cleared ? 1.5 : 1);
  const rank = kind ? 1 : m.rank;
  let hp = (6 + m.area / 70) * tough;
  // Elites as in D2 Survivors: champions ×8 life, ×1.5 damage, ×3 experience; a named leader
  // ×12, ×1.25, ×5; followers ×2 life.
  const base = hp;
  if (kind === 'champ') hp = base * 8;
  if (kind === 'minion') hp = base * 2;
  if (kind === 'mini') hp = Math.max(base * 12, (70 + m.area / 10) * tough * 2);
  if (kind === 'boss') hp = (180 + m.area / 5) * tough * 4;
  const e = {
    m, hp, maxHp: hp, kind, pack, name: named && named.name, scale: named ? named.scale : 1, weak: 1,
    // Seconds per tile: small monsters scurry, big ones lumber.
    stepTime: kind ? 0.7 : 0.75 - 0.35 * (1 - rank) - Math.min(0.15, t / 3000),
    dmg: ((kind === 'boss' ? 13 : kind === 'mini' ? 8 : 1.5 + rank * 3) + t / 180 + G.level * 0.5)
      * (kind === 'champ' ? 1.5 : kind === 'mini' ? 1.25 : 1)
      // In a raid the boss's red tiles are the danger: the crowd around it strikes softer.
      * (G.stage.raid && kind !== 'boss' ? 0.6 : 1),
    xp: kind === 'boss' ? 60 : (1 + Math.floor(rank * 4 + t / 300)) * (kind === 'champ' ? 3 : kind === 'mini' ? 5 : 1),
    face: 1, phase: Math.random() * 6, flash: 0, slow: 0, stun: 0, curse: 0, cd: Math.random() * 0.5, atk: 0.6,
    lunge: 0, hits: new Map(), temper: kind && kind !== 'minion' ? (kind === 'champ' ? 'fierce' : 'normal') : temperOf(m),
  };
  const tp = TEMPERS[e.temper];
  e.stepTime *= tp.step;
  place(e, at[0], at[1]);
  G.enemies.push(e);
  return e;
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

// How each kind of monster carries itself, after the original server's monster table (RTK-Server
// Mobs: MobMoveTime 3000 ms a step for rabbits, squirrels and deer, 2000 for most, 1250 for dogs;
// MobAttackTime 1000-3000) and its AI (mob_ai_basic): a monster with no target turns to a random
// side most of the time and steps only when it already faced that way, else walks on; a passive
// one (MobBehavior 0) leaves people alone until struck.
const TEMPERS = {
  timid: { step: 1.45, atk: 2.4, sight: 3 },    // 겁 많은: wanders, fights back when struck or crowded
  normal: { step: 1, atk: 1.6, sight: 99 },
  fierce: { step: 0.8, atk: 1.1, sight: 99 },   // 사나운: quicker steps and blows
};
/** A kind's temper, fixed by its picture: small, low monsters on the early grounds are often timid. */
function temperOf(m) {
  const h = [...String(m.id)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 9973, 7) % 10;
  if (!G.stage.raid && G.level <= 9 && h < (m.rank < 0.5 ? 4 : 2)) return 'timid';
  return h >= 8 ? 'fierce' : 'normal';
}
/** The original wander: turn to a random side (and step only if already facing it), or walk on. */
function wander(e, st) {
  if (Math.random() < 0.6) {
    const [dx, dy] = DIRS[Math.floor(Math.random() * 4)];
    if (dx === e.mdx && dy === e.mdy) step(e, dx, dy, st);
    else { e.mdx = dx; e.mdy = dy; if (dx) e.face = dx; }
  } else if (!step(e, e.mdx || 0, e.mdy || (e.mdx ? 0 : 1), st)) {
    e.mdx = -(e.mdx || 0); e.mdy = -(e.mdy || 0);
  }
}

function moveEnemies(dt) {
  const p = G.player;
  const v = viewTiles();
  const hidden = G.buffs.stealth > G.t || G.dead;
  const gone = [];
  for (const e of G.enemies) {
    advance(e, dt);
    e.flash = Math.max(0, e.flash - dt);
    e.lunge = Math.max(0, e.lunge - dt);
    e.slow = Math.max(0, e.slow - dt);
    e.stun = Math.max(0, e.stun - dt);
    e.curse = Math.max(0, e.curse - dt);
    if (e.moving || e.stun > 0) continue;
    if (e.march || e.flee) {
      // Event monsters: the drive walks on in its line; the treasure runs from the hero.
      const far = Math.abs(e.tx - p.tx) > v.w + 3 || Math.abs(e.ty - p.ty) > v.h + 3;
      if ((e.march && far) || (e.flee && G.t > e.flee)) {
        gone.push(e);
        continue;
      }
      e.cd -= dt;
      e.atk -= dt;
      if (e.march && Math.abs(e.tx - p.tx) + Math.abs(e.ty - p.ty) <= 1 && !hidden && e.atk <= 0) {
        e.atk = TEMPERS[e.temper || 'normal'].atk;
        e.lunge = 0.15;
        hurtPlayer(e.dmg, e);
      }
      if (e.cd > 0) continue;
      e.cd = e.stepTime * (e.slow > 0 ? 2 : 1);
      if (e.march) step(e, e.march[0], e.march[1], e.cd);
      else {
        const away = towards(e, p.tx, p.ty).map(([dx, dy]) => [-dx, -dy]);
        for (const [dx, dy] of away.concat(DIRS)) if (step(e, dx, dy, e.cd)) break;
      }
      continue;
    }
    if (Math.abs(e.tx - p.tx) > v.w + 4 || Math.abs(e.ty - p.ty) > v.h + 4) {
      // Left far behind: come back from the edge of the screen. Champions, leaders and the
      // boss too: they hunt the hero rather than wait somewhere off the map.
      const at = ringTile(e.kind === 'boss' || e.kind === 'mini');
      if (at) {
        occ.delete(key(e.tx, e.ty));
        place(e, at[0], at[1]);
      }
      continue;
    }
    e.cd -= dt;
    e.atk -= dt;
    // A party fight: each monster goes for the nearest of the party (the hero a little first);
    // a raid boss for whoever it has turned on.
    let tgt = hidden ? null : p;
    if (G.party.length && !G.stage.raid && !hidden) {
      // On a hunting ground the crowd hunts the hero; a companion standing in the way is struck
      // in passing.
      const by = G.party.find(m => !m.down && Math.abs(e.tx - m.tx) + Math.abs(e.ty - m.ty) <= 1);
      if (by && Math.abs(e.tx - p.tx) + Math.abs(e.ty - p.ty) > 1 && e.atk <= 0) {
        e.atk = TEMPERS[e.temper || 'normal'].atk;
        e.lunge = 0.15;
        faceTo(e, by.tx, by.ty);
        hurtMember(by, e.dmg * 0.8);
      }
    } else if (G.party.length) {
      if (e.kind === 'boss' && G.aggro && !G.aggro.down) tgt = G.aggro;
      else {
        let bd = hidden ? 1e9 : Math.abs(e.tx - p.tx) + Math.abs(e.ty - p.ty) - 0.5;
        for (const m of G.party) {
          if (m.down) continue;
          const d = Math.abs(e.tx - m.tx) + Math.abs(e.ty - m.ty);
          if (d < bd) { bd = d; tgt = m; }
        }
      }
    }
    if (tgt && tgt !== p) {
      if (Math.abs(e.tx - tgt.tx) + Math.abs(e.ty - tgt.ty) <= 1) {
        faceTo(e, tgt.tx, tgt.ty);
        if (e.atk <= 0) {
          e.atk = TEMPERS[e.temper || 'normal'].atk;
          e.lunge = 0.15;
          hurtMember(tgt, e.kind === 'boss' && G.stage.raid ? tgt.maxHp * 0.16 * raidK() : e.dmg * 0.8);
        }
        continue;
      }
      if (e.cd > 0) continue;
      const st = e.stepTime * (e.slow > 0 ? 2 : 1);
      e.cd = st * (0.85 + Math.random() * 0.35);
      for (const [dx, dy] of towards(e, tgt.tx, tgt.ty)) if (step(e, dx, dy, st)) break;
      continue;
    }
    const next = Math.abs(e.tx - p.tx) + Math.abs(e.ty - p.ty) <= 1; // beside, or under the hero
    if (next && !hidden) {
      // Beside the hero: strike, as monsters do, from the next tile.
      faceTo(e, p.tx, p.ty);
      if (e.atk <= 0 && !barred(e)) {
        e.atk = TEMPERS[e.temper || 'normal'].atk;
        e.lunge = 0.15;
        hurtPlayer(e.dmg, e);
      }
      continue;
    }
    if (e.cd > 0) continue;
    const st = e.stepTime * (e.slow > 0 ? 2 : 1);
    // Not in step with each other: a crowd that moves like one block looks stiff.
    e.cd = st * (0.85 + Math.random() * 0.35);
    const calm = e.temper === 'timid' && !e.provoked && Math.abs(e.tx - p.tx) + Math.abs(e.ty - p.ty) > TEMPERS.timid.sight;
    if (hidden || calm) {
      wander(e, st);
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
  for (const e of gone) {
    G.enemies.splice(G.enemies.indexOf(e), 1);
    occ.delete(key(e.tx, e.ty));
    if (e.flee) say('보물을 지닌 몬스터가 달아났습니다.');
  }
}

/** 차폐: monsters next to the hero cannot touch them while it holds. */
function barred(e) {
  return G.skills.some(s => SKILLS[s.id].kind === 'aura');
}

function hurtPlayer(dmg, from = null) {
  const p = G.player;
  if (G.buffs.guard > G.t || p.inv > 0) return;
  let taken = Math.max(1, dmg - p.armor - G.passives.armor);
  if (G.buffs.shield > G.t) taken = Math.max(1, taken / 2);
  // 반탄공: the blow comes back threefold.
  if (from && from.m && G.buffs.reflect > G.t) later(0.05, () => hurtEnemy(from, taken * 3));
  p.hp -= taken;
  p.inv = 0.25;
  audio.play('hurt');
  floatText(p.x, p.y - 64, '-' + Math.round(taken), '#ff6060');
  if (p.hp <= 0) die();
}

function hurtEnemy(e, dmg, push = null) {
  e.provoked = true;
  if (e.hp <= 0) return 0;
  if (e.guardT > G.t) return 0; // a boss speaking at its entrance or a phase
  // A heavy blow on a big one stops the world for a blink.
  // Not in a raid, where the party's blows fall all the time, and not more than once in 0.6 s.
  if (e.kind && dmg > 40 && !G.stage.raid && G.t - (G.hitstopAt || -9) > 0.6) {
    G.hitstop = 0.05;
    G.hitstopAt = G.t;
  }
  // A struck monster jerks back a little, away from the blow: each hit of a 오중공격 shows.
  const p = G.player;
  e.kickAt = G.t;
  e.kdx = push ? push[0] : Math.sign(e.tx - p.tx);
  e.kdy = push ? push[1] : (e.tx === p.tx ? Math.sign(e.ty - p.ty) : 0);
  dmg *= (0.9 + Math.random() * 0.2) * might() * (e.curse > 0 ? 1.4 : 1) * (e.weak || 1)
    * (e.kind === 'boss' || e.kind === 'mini' ? 1 + 0.25 * opt('boss') : 1);
  if (!(dmg > 0)) return 0; // never NaN: a monster with NaN life could not die
  e.hp -= dmg;
  e.flash = 0.12;
  e.shown = G.t;
  if (settings.numbers) floatText(e.x, e.y - e.m.h * e.scale - 8, Math.round(dmg), '#ffffff');
  if (e.hp <= 0) killEnemy(e);
  else audio.play('hit');
  return dmg;
}

/** The very rare special of this ground or raid: a little likelier from the strong ones. */
function rollSpecial(e) {
  const chance = { boss: 0.03, mini: 0.02, champ: 0.005, treasure: 0.05 }[e.kind] || 0.0003;
  if (Math.random() >= chance) return;
  const mine = SPECIALS.filter(s => s.src === G.stage.id);
  if (!mine.length) return;
  const sp = mine[Math.floor(Math.random() * mine.length)];
  G.drops.push({ x: e.x, y: e.y, kind: 'gear', gear: { kind: sp.kind, tier: specialBase(sp, G.cls.id), sp: sp.id } });
  say('어디선가 빛나는 물건이 떨어졌습니다!', 'warn');
  emote(Math.random() < 0.5 ? 'really' : 'hehe', G.player);
}

/** Materials of the ground's kind: a few from bosses, sometimes from the strong ones. */
function rollMats(e) {
  for (const [id, m] of Object.entries(MATS)) {
    if (!m.from.includes(G.stage.id)) continue;
    const n = matCount(id, e.kind, !!G.stage.raid);
    for (let i = 0; i < n; i++) G.drops.push({ x: e.x + (i - n / 2) * 14, y: e.y + 6, kind: 'mat', mat: id });
  }
}

function killEnemy(e) {
  G.kills++;
  rollSpecial(e);
  rollMats(e);
  // For the 의뢰: every kill counts, by ground, and bosses by ground.
  const st = qstats();
  st.kills++;
  st.stageKills[G.stage.id] = (st.stageKills[G.stage.id] || 0) + 1;
  if (e.kind === 'boss') st.bosses[G.stage.id] = (st.bosses[G.stage.id] || 0) + 1;
  G.enemies.splice(G.enemies.indexOf(e), 1);
  occ.delete(key(e.tx, e.ty));
  G.dying.push({ e, t: 0 });
  audio.play('kill');
  const p = G.player;
  p.mp = Math.min(p.maxMp, p.mp + 0.6);
  // Experience comes at the kill, as in the game: nothing to pick up.
  gainXp(e.xp);
  const roll = Math.random();
  // Gear drops as in D2 Survivors: a plain monster at most one piece every three minutes,
  // a champion one time in three, a named leader one in two, a boss two.
  if (e.kind === 'champ') {
    if (!G.enemies.some(o => o.pack === e.pack)) {
      G.drops.push({ x: e.x, y: e.y, kind: 'chest' });
      say('챔피언 무리를 물리쳤습니다!');
    }
    if (Math.random() < 0.33) dropGear(e);
  } else if (e.kind === 'mini') {
    G.drops.push({ x: e.x, y: e.y, kind: 'chest' });
    say(`${josa(e.name, '을', '를')} 쓰러뜨렸습니다!`);
    if (Math.random() < 0.5) dropGear(e);
  } else if (e.kind === 'treasure') {
    G.drops.push({ x: e.x, y: e.y, kind: 'chest' });
    for (let i = 0; i < 6; i++) G.drops.push({ x: e.x + (i % 3 - 1) * 20, y: e.y + (i < 3 ? -14 : 14), kind: 'coin' });
    say('보물을 지닌 몬스터를 잡았습니다!');
  } else if (e.kind === 'boss') {
    G.drops.push({ x: e.x, y: e.y, kind: 'chest' });
    dropGear(e, -12);
    dropGear(e, 12);
    say(`${josa(e.name, '을', '를')} 쓰러뜨렸습니다!`);
    fieldFalls();
    clearStage();
  } else if (G.t >= G.plainDropAt && roll < 0.02) {
    G.plainDropAt = G.t + 180;
    dropGear(e);
  } else if (roll < 0.035) G.drops.push({ x: e.x, y: e.y, kind: 'heal' });
  else if (roll < 0.07) G.drops.push({ x: e.x, y: e.y, kind: 'coin' });
}

/** With the boss, the whole field falls (over two seconds), giving its experience. */
function fieldFalls() {
  const rest = G.enemies.slice();
  rest.forEach((o, i) => later(0.02 * i % 2, () => { if (o.hp > 0) killEnemy(o); }));
}

/** A piece of the class's gear on the ground, about as good as the ground is deep. */
function dropGear(e, dx = 0) {
  const line = GEAR[G.cls.id], kinds = ['weapon', 'armor', 'shield'];
  const kind = kinds[Math.floor(Math.random() * 3)];
  // Hunting grounds never drop a raid's or a crafted piece.
  const list = plainList(G.cls.id, kind), top = list.length - 1;
  const tier = list[Math.max(0, Math.min(top, Math.floor(G.level / 3) + (Math.random() < 0.35 ? 1 : 0)
    + (e.kind === 'boss' ? 1 : 0)))];
  G.drops.push({ x: e.x + dx, y: e.y, kind: 'gear', gear: { kind, tier } });
}

function clearStage() {
  audio.bgm(huntMusic());
  if (G.cleared) return;
  G.cleared = true;
  audio.play('win');
  emote(G.stage.raid ? 'godgame' : ['godgame', 'gains', 'cute'][Math.floor(Math.random() * 3)]);
  const st = qstats();
  if (G.stage.raid) st.raids[G.stage.id] = (st.raids[G.stage.id] || 0) + 1;
  else st.clears[G.stage.id] = (st.clears[G.stage.id] || 0) + 1;
  if (G.stage.raid) {
    bossSay('death');
    // The kill: a moment in slow motion before the spoils.
    G.slowmo = 1.2;
    progress.raids = progress.raids || {};
    progress.raids[G.stage.id] = (progress.raids[G.stage.id] || 0) + 1;
    // A raid's spoils: pieces of its set (weapon, armor, shield) the hero does not have yet —
    // two from 삼두룡 up — beside the boss's own drops. With the set complete, any piece (a
    // second one sells, as always).
    const p = G.player, b = bag(G.cls);
    const set = raidSet(G.stage.id, G.cls.id).map(([kind, name]) => ({ kind, name, tier: GEAR[G.cls.id][kind].indexOf(name) }));
    const missing = set.filter(g => !b.includes(`${g.kind}:${g.tier}`)).sort(() => Math.random() - 0.5);
    const pool = missing.length ? missing : set.slice().sort(() => Math.random() - 0.5);
    const got = pool.slice(0, G.level >= 7 ? 2 : 1);
    got.forEach((g, i) => G.drops.push({ x: p.x + (i ? 40 : -40), y: p.y + 24, kind: 'gear', gear: { kind: g.kind, tier: g.tier } }));
    const names = got.map(g => g.name).join(', ');
    say(`레이드 전용 장비가 떨어졌습니다: ${names}`, 'sys');
    later(1.2, () => banner(`레이드 전용 · ${names}`));
    G.drops.push({ x: p.x, y: p.y + 30, kind: 'chest' });
    G.gold += 120 * G.level;
  } else {
    progress.cleared[G.stage.id] = true;
    promote();
  }
  saveJson('bs_progress', progress);
  record();
  // What the conquest opens: the next of the first fourteen, and the grounds and raids that
  // wait on this one.
  const idx = STAGES.indexOf(G.stage);
  const opened = G.stage.raid ? [] : [...(idx >= 0 && idx < 13 && !STAGES[idx + 1].open ? [STAGES[idx + 1]] : []),
    ...STAGES.filter(x => x.open === G.stage.id), ...RAIDS.filter(r => r.open === G.stage.id)];
  say(`${josa(G.stage.name, '을', '를')} 정복했습니다!`, 'sys');
  if (opened.length) say(`이제 ${opened.map(x => x.name).join(', ')}에 들어갈 수 있습니다.`);
  banner(`${G.stage.name} 정복!`);
  // A moment to pick up what the boss left, then the results.
  const run = G;
  // Not over a level-up still being chosen: the card first, then the results.
  const end = () => {
    if (G !== run || G.dead || G.over) return;
    if (G.choosing || G.pendingLevels) setTimeout(end, 500);
    else showResults(`${G.stage.name} 정복!`);
  };
  setTimeout(end, 6000);
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
/** Monsters on a list of tiles. */
function onTiles(tiles) {
  const out = [];
  for (const [x, y] of tiles) {
    const b = occ.get(key(x, y));
    if (b && b.m && b.hp > 0 && !b.ally && !out.includes(b)) out.push(b);
  }
  return out;
}

/** The inverted triangle ahead (백호참, 극백호참, 어검술): row i is 2i-1 tiles wide. */
function triTiles(tx, ty, dx, dy, depth) {
  const out = [];
  for (let i = 1; i <= depth; i++)
    for (let j = -(i - 1); j <= i - 1; j++) out.push([tx + dx * i + dy * j, ty + dy * i + dx * j]);
  return out;
}

/** A tile and arms of r tiles up, down, left and right (지진, 탈명사식). */
function plusTiles(tx, ty, r) {
  const out = [[tx, ty]];
  for (let k = 1; k <= r; k++) for (const [dx, dy] of DIRS) out.push([tx + dx * k, ty + dy * k]);
  return out;
}

/** Every monster on the screen (지폭지술, 폭류유성, 귀염추혼소). */
function onScreen() {
  const p = G.player, v = viewTiles();
  return G.enemies.filter(e => e.hp > 0 && Math.abs(e.tx - p.tx) <= v.w && Math.abs(e.ty - p.ty) <= v.h);
}

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
  if (!f) return 0.3;
  const tall = f.h > f.w * 1.4;
  const h = b.m ? b.m.h * b.scale : b.img.height;
  return addFx(id, b.x, tall ? b.y + 4 : b.y - h / 2, { anchor: tall ? 'bottom' : 'center', ...o });
}

function cast(skill, st) {
  const def = SKILLS[skill.id];
  // The spell's picture at this level (the site draws each grade of 신수마법 and 기원 differently).
  // 4차 승급 spells, the last of the tree, show today's client effect when the build has it.
  const fxid = def.promo === 4 && M.fx['new_' + skill.id] ? 'new_' + skill.id
    : def.fxs ? def.fxs[Math.min(skill.lv, def.fxs.length) - 1] : def.fx;
  const p = G.player;
  let used = true;
  const retry = t => {
    used = false;
    skill.timer = t;
  };
  switch (def.kind) {
    case 'slash': {
      // 기본 공격: the tile ahead; 후면/측면 공격 add the tiles behind and beside; n중공격 hits again.
      const lv = def.evolved ? 8 : skill.lv;
      // 이중공격 strikes twice; 삼중 (4단), 사중 (6단), 오중 (8단) once more each.
      const hits = Math.min(def.hitsMax || 5, 2 + (lv >= 4) + (lv >= 6) + (lv >= 8));
      const under = occ.get(key(p.tx, p.ty));
      if (under && under.m && !under.ally) {
        if (fxid) fxOn(fxid, under);
        hurtEnemy(under, st.dmg);
      }
      const foeAt = (dx, dy) => { const b = occ.get(key(p.tx + dx, p.ty + dy)); return b && b.m && !b.ally; };
      const fx0 = p.fdx || 0, fy0 = fx0 ? 0 : p.fdy || 1;
      let near = DIRS.filter(([dx, dy]) => foeAt(dx, dy));
      if (!near.length && def.dash) {
        // 쇄혼비무: only the way the hero faces, to the first monster up to four tiles off.
        let k = 2;
        while (k <= def.dash && !occ.get(key(p.tx + fx0 * k, p.ty + fy0 * k))) k++;
        const b = occ.get(key(p.tx + fx0 * k, p.ty + fy0 * k));
        if (k <= def.dash && b && b.m && !b.ally && !occ.has(key(p.tx + fx0 * (k - 1), p.ty + fy0 * (k - 1)))) {
          addFx(fxid, p.x, p.y - 26, { scale: 0.6 });
          p.tx += fx0 * (k - 1);
          p.ty += fy0 * (k - 1);
          p.x = p.tx * TILE + TILE / 2;
          p.y = p.ty * TILE + TILE - 6;
          p.stepping = false;
          near = [[fx0, fy0]];
        }
      }
      if (!near.length) return under ? undefined : retry(0.12);
      // The blow goes the way the hero faces when a monster is there, else to the one beside;
      // the hero's own facing is left alone, so walking stays the player's.
      const [ax, ay] = near.find(([dx, dy]) => dx === fx0 && dy === fy0) || near[0];
      const dirs = [[ax, ay]];
      if (lv >= 3) dirs.push([-ax, -ay]);
      if (lv >= 5) dirs.push([ay, ax], [-ay, -ax]);
      // The blows share one strike's worth (and a half): more blows, not more of everything.
      const dmg = st.dmg * (lv >= 7 ? 1.3 : 1) * 1.6 / hits;
      for (let h = 0; h < hits; h++) {
        later(h * 0.14, () => {
          for (const [dx, dy] of dirs) {
            const b = occ.get(key(p.tx + dx, p.ty + dy));
            if (!b || !b.m || b.ally) continue;
            if (fxid) fxOn(fxid, b, { rot: (h % 2) * 0.6 });
            hurtEnemy(b, dmg, [dx, dy]);
          }
        });
      }
      break;
    }
    case 'blink': {
      // 비영승보 and its kind: to a monster in front (the facing way, a lane three tiles wide),
      // landing at its back, still facing on. Nothing ahead, nothing happens: no jumping off
      // somewhere the player did not mean to go.
      const fx0 = p.fdx || 0, fy0 = fx0 ? 0 : p.fdy || 1;
      const ahead = G.enemies.filter(e => {
        const f = (e.tx - p.tx) * fx0 + (e.ty - p.ty) * fy0, side = Math.abs((e.tx - p.tx) * fy0 + (e.ty - p.ty) * fx0);
        return e.hp > 0 && f >= 1 && f <= st.range && side <= 1;
      }).sort((a, b) => tdist(a, p) - tdist(b, p));
      // Nothing ahead: strike one beside the hero where it stands, without moving.
      const e = ahead[0] || DIRS.map(([dx, dy]) => occ.get(key(p.tx + dx, p.ty + dy))).find(b => b && b.m && !b.ally && b.hp > 0);
      if (!e) return retry(0.25);
      const bx = e.tx + fx0, by = e.ty + fy0;
      if (ahead[0] && !occ.has(key(bx, by))) {
        addFx(fxid, p.x, p.y - 26, { scale: 0.7 });
        p.x = bx * TILE + TILE / 2;
        p.y = by * TILE + TILE - 6;
        heroTile();
        p.stepping = false;
      }
      for (let i = 0; i < st.count; i++) {
        later(i * 0.12, () => {
          if (e.hp <= 0) return;
          fxOn(fxid, e);
          if (def.curse) e.curse = def.curse;
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
        const life = fxOn(fxid, e);
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
            fxOn(fxid, b);
            hurtEnemy(b, st.dmg);
            if (!def.pierce) break; // 삼매진화 burns the whole row
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
        const life = fxOn(fxid, e, { delay: i * 0.12 });
        later(i * 0.12 + life * (def.hitAt || 0.3), () => {
          G.shake = Math.max(G.shake, 0.08);
          const hit = def.shape === 'plus' ? onTiles(plusTiles(tx, ty, Math.max(1, st.radius))) : around(tx, ty, st.radius);
          for (const o of hit) {
            if (def.slow) o.slow = def.slow;
            if (def.stun) o.stun = def.stun;
            if (def.curse) o.curse = def.curse;
            hurtEnemy(o, st.dmg);
          }
        });
      });
      break;
    }
    case 'cleave': {
      // Ahead of the hero in an inverted triangle, turning first to where most monsters stand.
      // The triangle deepens a row at 4단 and 8단 (1 → 4 → 9 tiles); grown spells count as 8단.
      const depth = def.depth || 1 + Math.floor((def.evolved ? 8 : skill.lv) / 4);
      let best = null, most = 0;
      for (const [dx, dy] of [[p.fdx, p.fdy], ...DIRS]) {
        if (!dx && !dy) continue;
        const hit = onTiles(triTiles(p.tx, p.ty, dx, dy, depth));
        if (hit.length > most) { most = hit.length; best = [dx, dy, hit]; }
      }
      if (!best) return retry(0.2);
      const [dx, dy, hit] = best;
      if (def.hpCost) p.hp = Math.max(1, p.hp * (1 - def.hpCost));
      // The picture stands in the middle of the triangle.
      const mid = (depth + 1) / 2;
      addFx(fxid, p.x + dx * mid * TILE, p.y - 20 + dy * mid * TILE, { scale: Math.min(1.6, 0.7 + depth * 0.25) });
      later(0.12, () => {
        G.shake = Math.max(G.shake, 0.1);
        for (const e of hit.slice(0, def.max || 99)) {
          if (def.stun) e.stun = def.stun;
          hurtEnemy(e, st.dmg + (def.scaleHp ? p.maxHp * def.scaleHp : 0), [dx, dy]);
        }
      });
      break;
    }
    case 'line': {
      // 무형검, 파천검무: a row of tiles ahead, turning to the row with most monsters.
      // A row that carries the hero (파천검무) goes only the way it faces; one that does not
      // (무형검) may strike the row with most monsters. The hero is not turned either way.
      let best = null, most = 0;
      const ways = def.dash ? [[p.fdx || 0, p.fdx ? 0 : p.fdy || 1]] : [[p.fdx, p.fdy], ...DIRS];
      for (const [dx, dy] of ways) {
        if (!dx && !dy) continue;
        const tiles = [];
        for (let k = 1; k <= def.depth; k++) tiles.push([p.tx + dx * k, p.ty + dy * k]);
        const hit = onTiles(tiles);
        if (hit.length > most) { most = hit.length; best = [dx, dy, hit]; }
      }
      if (!best) return retry(0.25);
      const [dx, dy, hit] = best;
      hit.forEach((e, i) => fxOn(fxid, e, { delay: i * 0.05 }));
      later(0.1, () => { for (const e of hit) hurtEnemy(e, st.dmg, [dx, dy]); });
      if (def.dash) {
        // Through the row to the farthest open tile along it.
        for (let k = def.depth + 1; k >= 1; k--) {
          const tx = p.tx + dx * k, ty = p.ty + dy * k;
          if (occ.has(key(tx, ty))) continue;
          p.tx = tx;
          p.ty = ty;
          p.x = tx * TILE + TILE / 2;
          p.y = ty * TILE + TILE - 6;
          p.stepping = false;
          break;
        }
      }
      break;
    }
    case 'screen': {
      // The whole screen, as 지폭지술 and its kind struck.
      const all = onScreen();
      if (!all.length) return retry(0.5);
      addFx(fxid, 0, -26, { follow: true, scale: 1.4 });
      all.slice(0, 10).forEach((e, i) => fxOn(fxid, e, { delay: 0.05 * i, scale: 0.6 }));
      later(0.35, () => {
        G.shake = Math.max(G.shake, 0.25);
        for (const e of all) {
          if (e.hp <= 0) continue;
          if (def.slow) e.slow = def.slow;
          if (def.curse) e.curse = def.curse;
          if (def.stun) e.stun = def.stun;
          // 포효검황: weaker with every tile away.
          const far = def.falloff ? Math.max(0.2, 1 - def.falloff * tdist(e, p)) : 1;
          hurtEnemy(e, st.dmg * far);
        }
      });
      break;
    }
    case 'nova': {
      if (def.hpCost) p.hp = Math.max(1, p.hp * (1 - def.hpCost));
      addFx(fxid, 0, -26, { follow: true });
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
        h = { id: fxid, x: 0, y: -30, t: 0, life: Infinity, scale: 1, rot: 0, follow: true, anchor: 'center',
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
          hp: 1, flash: 0, mdx: 0, mdy: 1 };
        // From 3단 the call brings one of the client's 괴수 (the dress room's 괴수의상), stronger by 단.
        const bk = def.beasts && def.beasts[skill.lv - 1];
        if (bk && M.beast && M.beast[bk] && images[`beast/${bk}.png`]) {
          a.beast = bk;
          a.dmg = st.dmg * 1.3;
          if (i === 0) say(`${josa(M.beast[bk].name, '이', '가')} 나타났습니다!`, 'party');
        }
        place(a, spot[0], spot[1]);
        addFx(fxid, a.x, a.y - 20, { scale: 0.8 });
        G.allies.push(a);
      }
      break;
    }
    case 'heal': {
      // The 기원 goes to the hero and, in a party, to the one most hurt beside it.
      const [low] = G.party.length ? neediest() : [p];
      if (p.hp >= p.maxHp && (!low || low === p)) return retry(1);
      heal(st.heal, false);
      if (low && low !== p) healMember(low, st.heal, fxid);
      if (def.shieldT) G.buffs.shield = Math.max(G.buffs.shield, G.t + def.shieldT);
      if (def.mana) p.mp = Math.min(p.maxMp, p.mp + p.maxMp * def.mana);
      if (def.guard) G.buffs.guard = Math.max(G.buffs.guard, G.t + def.guard);
      // The 기원's own picture for its grade (누리, 대지, 바다 …), over the hero.
      if (fxid) addFx(fxid, 0, -26, { follow: true });
      audio.play('skill_' + skill.id, def.kind, skill.lv);
      note(`${skillName(skill.id, skill.lv)}의 효과를 받습니다.`);
      used = false;
      break;
    }
    case 'buff': {
      G.buffs[def.buff] = G.t + st.duration;
      if (def.buff === 'power') G.buffs.powerK = def.power;
      note(`${skillName(skill.id, skill.lv)}의 효과를 받습니다.`);
      addFx(fxid, 0, -26, { follow: true });
      break;
    }
  }
  if (used || def.kind === 'heal') shout(skillName(skill.id, skill.lv), def.kind === 'slash');
  if (used && (def.dmg || def.kind === 'nova')) G.lastHit = G.t;
  if (used) {
    audio.play('skill_' + skill.id, def.kind, skill.lv);
    const melee = def.kind === 'slash' || def.kind === 'blink' || (def.kind === 'spell' && G.cls.id === 'warrior');
    strikePose(melee ? 'attack' : 'magic');
  }
}

/**
 * The weapon's plain attack: a swing at a monster on a tile beside the hero, only while no
 * damaging spell has gone off for 1.5 seconds (as in D2 Survivors). Weak; the weapon worn
 * makes it stronger.
 */
function plainAttack(dt) {
  const p = G.player;
  p.atkT = (p.atkT || 0) - dt;
  if (p.atkT > 0 || G.t - (G.lastHit || -9) < 1.5) return;
  const t = [[p.tx, p.ty], ...DIRS.map(([dx, dy]) => [p.tx + dx, p.ty + dy])]
    .map(([x, y]) => occ.get(key(x, y))).find(b => b && b.m && !b.ally && b.hp > 0);
  if (!t) return;
  p.atkT = 0.75;
  const dx = t.tx - p.tx, dy = t.ty - p.ty;
  // Walking a tile at a time, the facing is the player's: a swing does not turn the hero.
  if ((dx || dy) && !settings.tiles) {
    p.fdx = Math.sign(dx);
    p.fdy = dx ? 0 : Math.sign(dy);
    if (p.fdx) p.face = p.fdx;
  }
  hurtEnemy(t, 7 * (1 + 0.1 * G.passives.power));
  audio.play('hit');
  strikePose('attack');
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
      faceTo(a, beside.tx, beside.ty);
      if (a.atk <= 0) {
        a.atk = 0.6;
        a.hitT = G.t;
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

// ---------------------------------------------------------------- town
//
// Between hunts the hero stands in 국내성, as D2 Survivors' heroes return to camp: a village map
// from the 1996 client, walked in four directions. Its people: the smith (the bag and what to
// wear), the merchant (gear for gold), the innkeeper (lasting training for gold) and the guide,
// who sends the hero to a hunting ground.

let T = null;
const TOWN_TILE = 48;
// Tiles of the village map that cannot be walked: the three houses, the fences, the tables.
const TOWN_WALLS = new Set();
for (let x = 0; x < 16; x++) {
  TOWN_WALLS.add(`${x},0`);
  if (x !== 8 && x !== 2) TOWN_WALLS.add(`${x},9`);
}
for (const [x0, y0, x1, y1] of [[1, 1, 5, 3], [9, 1, 13, 3], [1, 5, 5, 7], [11, 5, 14, 5], [9, 7, 10, 7], [11, 7, 14, 7],
  [14, 1, 15, 2]]) {
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) TOWN_WALLS.add(`${x},${y}`);
}
const TOWNSFOLK = [
  { id: 'smith', name: '대장장이', img: '3', tx: 3, ty: 4, line: '쓸 만한 걸 주워 왔나? 골라 입게.' },
  { id: 'merchant', name: '상인', img: '5', tx: 11, ty: 4, line: '좋은 물건 있소. 전만 있으면 되오.' },
  { id: 'inn', name: '주모', img: 'hwahwa', tx: 4, ty: 8, line: '몸을 단련하고 가시구려.' },
  { id: 'guide', name: '길잡이', img: '도우미', tx: 8, ty: 8, line: '어느 사냥터로 모실까요?' },
  { id: 'clerk', name: '관원', img: '계산기1', tx: 12, ty: 8, line: '나라에서 내린 의뢰가 있소. 해내면 칭호를 내리리다.' },
];

function enterTown(cls) {
  chosenClass = cls;
  if (!M.ui.town) {
    showScreen('stages');
    return;
  }
  const gear = savedGear(cls);
  T = { cls, av: hasAvatars() ? dressed(cls, gear) : null, x: 7.5 * TOWN_TILE, y: 5 * TOWN_TILE - 6,
    fdx: 0, fdy: 1, moving: false, walkT: 0, near: null };
  showScreen('town');
  audio.bgm('town');
  $('#town-gold').textContent = `${progress.gold || 0}전`;
  $('#town-name').textContent = `국내성 · ${cls.name}`;
}

function townBlocked(x, y) {
  const tx = Math.floor(x / TOWN_TILE), ty = Math.floor((y - 4) / TOWN_TILE);
  if (tx < 0 || ty < 0 || tx > 15 || ty > 9) return true;
  return TOWN_WALLS.has(`${tx},${ty}`) || TOWNSFOLK.some(n => n.tx === tx && n.ty === ty);
}

function updateTown(dt) {
  const [dx, dy] = input();
  T.moving = !!(dx || dy);
  if (T.moving) {
    T.fdx = dx;
    T.fdy = dy;
    const sp = (TILE / 0.24) * (T.cls.speed / 70) * dt;
    const nx = T.x + dx * sp, ny = T.y + dy * sp;
    // Test a little ahead of the feet, so the hero does not clip into walls.
    if (!townBlocked(nx + dx * 10, ny + dy * 4)) {
      T.x = nx;
      T.y = ny;
    }
    T.walkT += dt * 1000;
  }
  const tx = Math.floor(T.x / TOWN_TILE), ty = Math.floor((T.y - 4) / TOWN_TILE);
  const near = TOWNSFOLK.find(n => Math.abs(n.tx - tx) + Math.abs(n.ty - ty) <= 1) || null;
  if (near !== T.near) {
    T.near = near;
    $('#talk').hidden = !near;
    if (near) $('#talk').textContent = `${near.name}에게 말 걸기`;
  }
}

function drawTown(now) {
  const map = images['ui/town.png'];
  const mw = M.ui.town.w, mh = M.ui.town.h;
  let camX = Math.round(T.x - VW / 2), camY = Math.round(T.y - 30 - VH / 2);
  camX = VW >= mw ? Math.round((mw - VW) / 2) : Math.max(0, Math.min(mw - VW, camX));
  camY = VH >= mh ? Math.round((mh - VH) / 2) : Math.max(0, Math.min(mh - VH, camY));
  ctx.setTransform(Z, 0, 0, Z, -camX * Z, -camY * Z);
  ctx.fillStyle = '#2a1a0e';
  ctx.fillRect(camX, camY, VW, VH);
  if (map && map.width) ctx.drawImage(map, 0, 0);
  const bodies = TOWNSFOLK.map(n => ({ n, y: n.ty * TOWN_TILE + TOWN_TILE - 6 })).concat([{ hero: true, y: T.y }]);
  bodies.sort((a, b) => a.y - b.y);
  for (const b of bodies) {
    if (b.hero) {
      if (T.av) drawAvatar(ctx, T.av, T.x, T.y, facing(T.fdx, T.fdy), T.moving ? 'walk' : 'idle', Math.floor(T.walkT / WALK_MS));
      continue;
    }
    const im = images[`npc/${b.n.img}.png`], x = b.n.tx * TOWN_TILE + TOWN_TILE / 2;
    if (im && im.width) drawWalker(im, x, b.y, 1, now * 2, false, 0);
    ctx.font = '8px G7';
    ctx.textAlign = 'center';
    outline(b.n.name, x, b.y + 10, b.n === T.near ? '#ffe070' : '#efe3c2');
  }
  if (T.near) drawBubble(T.near.line, T.near.tx * TOWN_TILE + TOWN_TILE / 2, T.near.ty * TOWN_TILE - 22, 0);
}

function talk() {
  const n = T && T.near;
  if (!n) return;
  if (n.id === 'guide') showScreen('stages');
  else if (n.id === 'clerk') openQuests();
  else if (n.id === 'smith') {
    buildEquip();
    $('#equip').hidden = false;
  } else openTrade(n.id);
}

// ---------------------------------------------------------------- 의뢰 and 칭호
//
// The 관원 in town keeps a board of 의뢰: lasting ones that give gold and a 칭호 (shown in the
// panel's TITLE), and three of the day that send the hunter back to grounds already opened.
// Progress counts across classes, from progress.stats.

function qstats() {
  return progress.stats = Object.assign({ kills: 0, stageKills: {}, bosses: {}, clears: {}, raids: {}, endless: 0 }, progress.stats);
}

function specialsOwned() {
  return Object.values(progress.inv || {}).reduce((n, b) => n + b.filter(x => x.startsWith('sp:') && !x.startsWith('sp:cr_')).length, 0);
}

function codexShare() {
  // Pieces found over all pieces there are, for every class.
  let have = 0, all = 0;
  for (const c of CLASSES) { const items = codexItems(c); all += items.length; have += items.filter(x => x.owned).length; }
  return have / Math.max(1, all);
}

const QUESTS = [
  { id: 'q_novice', title: '초보 사냥꾼', text: '왕초보사냥터 정복', gold: 50, need: 1, have: s => s.clears.novice || 0 },
  { id: 'q_rat', title: '쥐잡이', text: '쥐굴의 서생원 3번 쓰러뜨리기', gold: 300, need: 3, have: s => s.bosses.rat || 0 },
  { id: 'q_snake', title: '땅꾼', text: '뱀굴에서 몬스터 500마리', gold: 400, need: 500, have: s => s.stageKills.snake || 0 },
  { id: 'q_deer', title: '사슴 사냥꾼', text: '사슴굴 3번 정복', gold: 500, need: 3, have: s => s.clears.deer || 0 },
  { id: 'q_haunt', title: '퇴마사', text: '흉가 정복', gold: 800, need: 1, have: s => s.clears.haunt || 0 },
  { id: 'q_goblin', title: '도깨비 잡이', text: '도깨비굴 정복', gold: 1000, need: 1, have: s => s.clears.goblin || 0 },
  { id: 'q_promo1', title: '승급자', text: '아무 직업이나 1차 승급', gold: 300, need: 1, have: () => Math.max(...CLASSES.map(c => promoOf(c.id))) },
  { id: 'q_promo4', title: '탈명의 경지', text: '아무 직업이나 4차 승급', gold: 3000, need: 4, have: () => Math.max(...CLASSES.map(c => promoOf(c.id))) },
  { id: 'q_raid1', title: '레이드 대원', text: '레이드 한 번 이기기', gold: 500, need: 1, have: s => Object.values(s.raids).reduce((a, b) => a + b, 0) },
  { id: 'q_raid7', title: '전설의 용사', text: '레이드 일곱 곳 모두 이기기', gold: 5000, need: RAIDS.length, have: s => RAIDS.filter(r => s.raids[r.id]).length },
  { id: 'q_sp1', title: '빛을 본 자', text: '스페셜 아이템 1개 얻기', gold: 500, need: 1, have: () => specialsOwned() },
  { id: 'q_sp10', title: '수집가', text: '스페셜 아이템 10개 얻기', gold: 3000, need: 10, have: () => specialsOwned() },
  { id: 'q_kills', title: '백전노장', text: '몬스터 누적 10000마리', gold: 2000, need: 10000, have: s => s.kills },
  { id: 'q_endless', title: '불굴', text: '정복 뒤 계속 사냥에서 10분 버티기', gold: 1500, need: 10, have: s => Math.floor(s.endless / 60) },
  { id: 'q_allclass', title: '팔방미인', text: '네 직업 모두 Lv 20 기록', gold: 2000, need: 4, have: () => CLASSES.filter(c => (best[c.id] || {}).lvl >= 20).length },
  { id: 'q_codex', title: '장비 수집가', text: '도감 장비 절반 모으기', gold: 2000, need: 50, have: () => Math.floor(codexShare() * 100) },
];

/** Today's three 의뢰: drawn from the grounds already open, the same all day. */
function dailyQuests() {
  const day = new Date().toISOString().slice(0, 10);
  const d = progress.daily;
  if (d && d.day === day) return d.list;
  let seed = [...day].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0;
  const rnd = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296;
  const open = STAGES.filter((s, i) => unlocked(i));
  const pick = () => open[Math.floor(rnd() * open.length)];
  const s = qstats();
  const a = pick(), b = pick();
  const list = [
    { id: 'd_kill', text: `${a.name}에서 몬스터 300마리`, gold: 300 + 60 * (a.level !== undefined ? a.level : STAGES.indexOf(a)), key: ['stageKills', a.id], need: 300 },
    { id: 'd_clear', text: `${josa(b.name, '을', '를')} 정복`, gold: 400 + 80 * (b.level !== undefined ? b.level : STAGES.indexOf(b)), key: ['clears', b.id], need: 1 },
    { id: 'd_any', text: '아무 사냥터에서 몬스터 800마리', gold: 500, key: ['kills'], need: 800 },
  ].map(q => ({ ...q, base: q.key.length > 1 ? (s[q.key[0]][q.key[1]] || 0) : s[q.key[0]] }));
  progress.daily = { day, list, claimed: [] };
  saveJson('bs_progress', progress);
  return list;
}

function dailyHave(q) {
  const s = qstats();
  const now = q.key.length > 1 ? (s[q.key[0]][q.key[1]] || 0) : s[q.key[0]];
  return now - q.base;
}

/** The chosen 칭호, or the one the conquests give. */
function heroTitle(cleared) {
  return progress.title || TITLES[Math.min(TITLES.length - 1, Math.floor(cleared / 3))];
}

function openQuests() {
  const box = $('#trade-rows'), s = qstats();
  box.innerHTML = '';
  $('#trade-title').textContent = '관원 · 의뢰';
  $('#trade-gold').textContent = `가진 돈 ${progress.gold || 0}전`;
  const done = progress.quests = progress.quests || {};
  const row = (name, desc, label, can, act) => {
    const r = document.createElement('div');
    r.className = 'trade-row';
    r.innerHTML = `<div><b>${name}</b><span>${desc}</span></div>`;
    const b = document.createElement('button');
    b.className = 'btn';
    b.textContent = label;
    b.disabled = !can;
    b.onclick = () => { act(); saveJson('bs_progress', progress); $('#town-gold').textContent = `${progress.gold}전`; openQuests(); };
    r.append(b);
    box.append(r);
  };
  const head = text => { const h = document.createElement('h4'); h.textContent = text; h.style.margin = '6px 0 2px'; box.append(h); };
  head('오늘의 의뢰');
  const daily = dailyQuests();
  for (const q of daily) {
    const have = Math.min(q.need, dailyHave(q)), got = progress.daily.claimed.includes(q.id);
    row(q.text, `${have}/${q.need} · ${q.gold}전`, got ? '받음' : '받기', !got && have >= q.need, () => {
      progress.daily.claimed.push(q.id);
      progress.gold = (progress.gold || 0) + q.gold;
    });
  }
  head('의뢰 · 칭호');
  for (const q of QUESTS) {
    const have = Math.min(q.need, q.have(s)), got = done[q.id];
    row(`${q.text}`, `${have}/${q.need} · ${q.gold}전 · 칭호 「${q.title}」`, got ? '받음' : '받기', !got && have >= q.need, () => {
      done[q.id] = true;
      progress.gold = (progress.gold || 0) + q.gold;
    });
  }
  head('칭호 고르기');
  const titles = QUESTS.filter(q => done[q.id]).map(q => q.title);
  if (!titles.length) row('아직 받은 칭호가 없습니다', '의뢰를 마치고 받기를 누르면 칭호가 생깁니다', '-', false, () => {});
  for (const t of titles)
    row(`「${t}」`, progress.title === t ? '지금 쓰는 칭호' : '상태창 TITLE에 보입니다', progress.title === t ? '쓰는 중' : '쓰기', progress.title !== t, () => {
      progress.title = t;
    });
  $('#trade').hidden = false;
}

// Lasting training sold by the innkeeper, as Charsi's ranks in D2 Survivors.
const TRAINING = [
  { id: 'reroll', name: '다시 뽑기 +1', max: 3, cost: l => 200 * (l + 1), desc: '사냥마다 다시 뽑기를 한 번 더' },
  { id: 'skip', name: '넘기기 +1', max: 3, cost: l => 150 * (l + 1), desc: '사냥마다 넘기기를 한 번 더' },
  { id: 'banish', name: '빼기 +1', max: 3, cost: l => 200 * (l + 1), desc: '사냥마다 빼기를 한 번 더' },
  { id: 'life', name: '체력 단련', max: 5, cost: l => 150 * (l + 1), desc: '최대 체력 +10%' },
  { id: 'revive', name: '성황령', max: 1, cost: () => 1200, desc: '사냥마다 한 번, 쓰러져도 체력 절반으로 일어난다' },
];

function up(id) {
  return ((progress.up || {})[id]) || 0;
}

function openTrade(who) {
  const cls = chosenClass, box = $('#trade-rows');
  box.innerHTML = '';
  $('#trade-title').textContent = who === 'inn' ? '주모 · 단련' : '상인 · 장비';
  $('#trade-gold').textContent = `가진 돈 ${progress.gold || 0}전`;
  const row = (name, desc, cost, done, buy) => {
    const r = document.createElement('div');
    r.className = 'trade-row';
    r.innerHTML = `<div><b>${name}</b><span>${desc}</span></div>`;
    const b = document.createElement('button');
    b.className = 'btn';
    b.textContent = done ? '다 배움' : `${cost}전`;
    b.disabled = done || (progress.gold || 0) < cost;
    b.onclick = () => {
      progress.gold -= cost;
      buy();
      saveJson('bs_progress', progress);
      $('#town-gold').textContent = `${progress.gold}전`;
      openTrade(who);
    };
    r.append(b);
    box.append(r);
  };
  if (who === 'inn') {
    for (const t of TRAINING) {
      const l = up(t.id);
      row(`${t.name}${t.max > 1 ? ` (${l}/${t.max})` : ''}`, t.desc, t.cost(l), l >= t.max, () => {
        progress.up = progress.up || {};
        progress.up[t.id] = l + 1;
      });
    }
  } else {
    // The first piece of each kind the bag lacks, priced by its tier.
    const b = bag(cls);
    for (const kind of ['weapon', 'armor', 'shield']) {
      const tier = GEAR[cls.id][kind].findIndex((_, i) => !b.includes(`${kind}:${i}`));
      if (tier < 0) continue;
      row(gearName(cls.id, kind, tier), `${{ weapon: '무기', armor: '갑옷', shield: '방패' }[kind]} · ${tier + 1}단계`,
        250 * (tier + 1) * (tier + 1), false, () => b.push(`${kind}:${tier}`));
    }
    if (!box.children.length) box.textContent = '더 팔 물건이 없소.';
  }
  $('#trade').hidden = false;
}

$('#talk').onclick = talk;
$('#close-trade').onclick = () => { $('#trade').hidden = true; };
$('#town-back').onclick = () => showScreen('select');
addEventListener('keydown', e => {
  if ((e.code === 'Enter' || e.code === 'Space') && T && !G && !$('#town').hidden) talk();
});

// ---------------------------------------------------------------- party
//
// Hunting in a party, as players did: other classes join from the level-up choices and keep
// with the hero. Each does its class's work and shouts its spells, which show in the chat as
// party talk: the 도사 heals with the 기원, guards with 보호 and curses the crowd; the 주술사
// burns with 화염주 and freezes with 마비; the 전사 cuts down what comes close; the 도적 slips
// in with 비영승보. Party members cannot be hurt.

const PARTY = {
  poet: { names: ['소소', '달빛', '청운'], role: '회복 · 보호 · 저주로 돕는다' },
  mage: { names: ['홍염', '백야', '흑풍'], role: '화염주와 마비로 무리를 친다' },
  warrior: { names: ['철우', '백호', '무쇠'], role: '가까이 온 적을 베어 막는다' },
  rogue: { names: ['그림자', '바람', '야월'], role: '적 뒤로 파고들어 벤다' },
};

function joinParty(cls) {
  const p = G.player;
  const def = PARTY[cls.id];
  const name = def.names[Math.floor(Math.random() * def.names.length)];
  const gear = savedGear(cls);
  const slot = G.party.length;
  const m = {
    cls, name, lv: 1, gear, av: hasAvatars() ? dressed(cls, gear) : null, img: images[`hero/${cls.hero}.png`],
    // Walks in from the edge of the view, as another player would.
    x: p.x + (slot % 2 ? 1 : -1) * 220, y: p.y + 30, fdx: 0, fdy: 1, moving: false, walkT: 0, pose: null, poseT: 0,
    cd: { a: 1, b: 3, c: 6, d: 9, r: 0 }, bubble: null, slot, hp: 1, maxHp: 1, down: 0, flash: 0,
  };
  m.maxHp = memberMaxHp(m);
  m.hp = m.maxHp;
  m.tx = Math.floor(m.x / TILE);
  m.ty = Math.floor((m.y - TILE / 2 + 6) / TILE);
  m.x = m.tx * TILE + TILE / 2;
  m.y = m.ty * TILE + TILE - 6;
  G.party.push(m);
  say(`${josa(name, '이', '가')} 파티에 들어왔습니다. (${cls.name})`, 'party');
}

/** A companion's health: its class's, growing with its level; sturdier in a raid. */
function memberMaxHp(m) {
  return Math.round(m.cls.hp * (1 + 0.15 * (m.lv - 1)) * (G.stage.raid ? 2.2 : 1.4));
}

function partySay(m, spell) {
  m.bubble = { text: `${spell}!`, t: G.t };
  // In the chat at most once every few seconds per member, so the party does not drown it.
  if (G.t - (m.said || -9) > 4) {
    m.said = G.t;
    say(`${m.name}: ${spell}!`, 'party');
  }
}

/** Everyone in the fight who can be struck or healed: the hero and the companions standing. */
function partyBodies() {
  return [G.player, ...G.party.filter(m => !m.down)];
}

/** A companion struck. At nothing left it falls, a ghost, until 부활 or ten seconds pass. */
function hurtMember(m, dmg) {
  if (m.down || G.dead || m.hidden > G.t) return;
  if (G.buffs.shield > G.t) dmg /= 2;
  if (G.buffs.guard > G.t) return;
  m.hp -= dmg;
  m.flash = 0.12;
  floatText(m.x, m.y - 58, '-' + Math.round(dmg), '#ff8060');
  if (m.hp > 0) return;
  m.hp = 0;
  m.down = G.t + 10;
  m.bubble = { text: '으윽…', t: G.t };
  const mate = G.party.find(o => o !== m && !o.down);
  emote(Math.random() < 0.5 ? 'annoyed' : 'gone', mate || G.player);
  say(`${josa(m.name, '이', '가')} 쓰러졌습니다!`, 'warn');
  if (G.aggro === m) G.aggro = null;
  // The particular line first: downing the healer has its own.
  if (G.stage.raid && G.enemies.some(e => e.kind === 'boss')) bossSay(m.cls.id === 'poet' && G.stage.lines.killHealer && !G.saidHealer ? (G.saidHealer = 'killHealer') : 'kill');
}

/** Healing a companion: its 기원's picture over its head. */
function healMember(m, n, fx = null) {
  if (m.down) return;
  n = Math.min(n, m.maxHp - m.hp);
  if (n <= 0) return;
  m.hp += n;
  floatText(m.x, m.y - 58, '+' + Math.round(n), '#7dff8a');
  if (fx) addFx(fx, m.x, m.y - 26, { scale: 0.8 });
}

/**
 * Who a heal should go to: the hero below 80% (85% in a raid) first, else the companion lowest
 * below 60% (75%). Nobody when all are well enough, so the heal is ready when it is needed.
 */
function neediest() {
  const p = G.player, raid = G.stage.raid;
  const hk = p.hp / p.maxHp;
  if (hk < (raid ? 0.85 : 0.8)) return [p, hk];
  let best = null, k = raid ? 0.75 : 0.6;
  for (const m of G.party) {
    if (m.down) continue;
    const r = m.hp / m.maxHp;
    if (r < k) { k = r; best = m; }
  }
  return [best, k];
}

/**
 * Where a companion stands, as each class fought in the old game: the warrior in the front line
 * between the hero and the foe; the rogue at the foe's back; the mage four tiles off, to the
 * side; the poet well behind the fight (three tiles back from the hero), backing away from any
 * monster that comes within two tiles, and supporting from there.
 */
function memberAnchor(m) {
  const p = G.player, cls = m.cls.id;
  const boss = G.enemies.find(e => (e.kind === 'boss' || e.kind === 'mini') && tdist(e, p) < 10);
  const foe = boss || nearestEnemies(1, 5)[0];
  const side = m.slot % 2 ? 1 : -1;
  let at;
  if (!foe) {
    // Nothing near: a loose group around the hero, the casters a little apart.
    at = cls === 'poet' ? [p.tx - 2 * side, p.ty + 2] : cls === 'mage' ? [p.tx + 2 * side, p.ty + 1] : [p.tx + side, p.ty];
  } else {
    // From the foe toward the hero: the side the party fights from.
    let ax = Math.sign(p.tx - foe.tx), ay = Math.sign(p.ty - foe.ty);
    if (!ax && !ay) ax = 1;
    if (cls === 'warrior') at = ax ? [foe.tx + ax, foe.ty] : [foe.tx, foe.ty + ay];
    else if (cls === 'rogue') at = ax ? [foe.tx - ax, foe.ty] : [foe.tx, foe.ty - ay];
    else if (cls === 'mage') at = ax ? [foe.tx + ax * 3, foe.ty + 2 * side] : [foe.tx + 2 * side, foe.ty + ay * 3];
    else at = [p.tx + ax * 3, p.ty + ay * 3 + (ax ? side : 0)];
  }
  if (cls === 'poet' || cls === 'mage') {
    // Casters keep their distance: a monster within two tiles pushes the spot further off.
    for (let i = 0; i < 3; i++) {
      const close = nearestEnemies(1, 2, { tx: at[0], ty: at[1] })[0];
      if (!close) break;
      at = [at[0] + (Math.sign(at[0] - close.tx) || side) * 2, at[1] + (Math.sign(at[1] - close.ty) || 1)];
    }
  }
  // Never out of reach of the hero: four tiles at most.
  at = [Math.max(p.tx - 4, Math.min(p.tx + 4, at[0])), Math.max(p.ty - 4, Math.min(p.ty + 4, at[1]))];
  // Off a red tile before it falls.
  if (G.marks.some(mk => mk.tiles.some(([x, y]) => x === at[0] && y === at[1]))) {
    const free2 = [[2, 0], [-2, 0], [0, 2], [0, -2], [3, 1], [-3, -1]].map(([dx, dy]) => [at[0] + dx, at[1] + dy])
      .find(([x, y]) => !G.marks.some(mk => mk.tiles.some(([a, b]) => a === x && b === y)));
    if (free2) at = free2;
  }
  return at;
}

function updateParty(dt) {
  if (G.joining && G.joining.length && !G.choosing && !G.paused) {
    G.joinWait = (G.joinWait || 0) + dt;
    if (G.joinWait > 0.8) {
      G.joinWait = 0;
      const c = G.joining.shift();
      joinParty(c);
      banner(`동료 ${G.party[G.party.length - 1].name}(${c.name}) 합류`);
    }
  }
  const p = G.player;
  for (const m of G.party) {
    // Party members grow with the hero, as D2 Survivors' mercenaries share its level.
    const lv = Math.max(m.baseLv || 0, Math.min(6, 1 + Math.floor(p.lvl / 6)));
    if (lv !== m.lv) {
      const k = m.hp / m.maxHp;
      m.lv = lv;
      m.maxHp = memberMaxHp(m);
      m.hp = m.maxHp * k;
    }
    m.flash = Math.max(0, m.flash - dt);
    if (m.down) {
      if (G.t >= m.down) {
        m.down = 0;
        m.hp = m.maxHp * 0.5;
        m.bubble = { text: '다시 간다!', t: G.t };
      }
    } else m.hp = Math.min(m.maxHp, m.hp + m.maxHp * 0.01 * dt);
    stepMember(m, dt);
    m.poseT = Math.max(0, m.poseT - dt);
    if (m.bubble && G.t - m.bubble.t > 1.3) m.bubble = null;
    if (G.dead || m.down) continue;
    // In a raid everyone casts faster: the skills fly.
    const tick = dt * (G.stage.raid ? 1.4 : 1);
    for (const k of Object.keys(m.cd)) m.cd[k] -= tick;
    partyAct(m);
  }
}

/**
 * A companion walks as everyone does: a tile a step, four ways. Where it means to stand is
 * chosen every 0.6 s and kept unless the new spot is two tiles off or a red tile falls on it,
 * so it does not jitter between spots. Only when it is beyond the view does it come at once.
 */
function stepMember(m, dt) {
  const p = G.player;
  const red = a => G.marks.some(mk => mk.tiles.some(([x, y]) => x === a[0] && y === a[1]));
  m.anchorT = (m.anchorT || 0) - dt;
  if (!m.anchor || m.anchorT <= 0 || red(m.anchor)) {
    m.anchorT = 0.6;
    const a = memberAnchor(m);
    if (!m.anchor || red(m.anchor) || Math.abs(a[0] - m.anchor[0]) + Math.abs(a[1] - m.anchor[1]) >= 2) m.anchor = a;
  }
  if (m.stepping) {
    m.st += dt;
    const k = Math.min(1, m.st / m.sdur);
    m.x = (m.sfx + (m.tx - m.sfx) * k) * TILE + TILE / 2;
    m.y = (m.sfy + (m.ty - m.sfy) * k) * TILE + TILE - 6;
    m.walkT += dt * 1000;
    if (k >= 1) m.stepping = false;
  }
  if (!m.stepping) {
    if (Math.abs(m.tx - p.tx) > 14 || Math.abs(m.ty - p.ty) > 10) {
      [m.tx, m.ty] = m.anchor;
    }
    const ddx = m.anchor[0] - m.tx, ddy = m.anchor[1] - m.ty;
    if (ddx || ddy) {
      const [sx, sy] = Math.abs(ddx) >= Math.abs(ddy) ? [Math.sign(ddx), 0] : [0, Math.sign(ddy)];
      m.sfx = m.tx;
      m.sfy = m.ty;
      m.tx += sx;
      m.ty += sy;
      m.st = 0;
      // A little quicker when far behind, so it keeps up without leaping.
      m.sdur = TILE / heroSpeed() * (Math.abs(ddx) + Math.abs(ddy) > 4 ? 0.75 : 1);
      m.stepping = true;
      m.fdx = sx;
      m.fdy = sy;
    } else {
      m.x = m.tx * TILE + TILE / 2;
      m.y = m.ty * TILE + TILE - 6;
    }
  }
  m.moving = !!m.stepping;
}

const KIWON = ['누리의기원', '대지의기원', '바다의기원', '동해의기원', '하늘의기원', '천공의기원', '구름의기원', '태양의기원'];

function partyAct(m) {
  // Companions help; the hero carries the hunt, so each hits about as hard as a starting spell.
  const p = G.player, pw = (1 + 0.15 * (m.lv - 1)) * (1 + p.lvl * 0.04) * (m.power || 1);
  const pose = kind => { m.pose = kind; m.poseT = 0.3; };
  const near = n => nearestEnemies(n, 7, { tx: m.tx, ty: m.ty });
  const face = t => {
    m.fdx = Math.abs(t.x - m.x) > Math.abs(t.y - m.y) ? Math.sign(t.x - m.x) : 0;
    m.fdy = m.fdx ? 0 : Math.sign(t.y - m.y);
  };
  const boss = G.enemies.find(e => e.kind === 'boss' && tdist(e, m) < 9);
  switch (m.cls.id) {
    case 'poet': {
      const [low, k] = neediest();
      const downed = G.party.find(o => o.down);
      if (downed && m.cd.r <= 0) {
        // 부활: the fallen get up at half health.
        m.cd.r = 12;
        downed.down = 0;
        downed.hp = downed.maxHp * 0.5;
        addFx(FX.revive, downed.x, downed.y - 26);
        audio.play('revive');
        partySay(m, '부활');
        downed.bubble = { text: '고마워!', t: G.t + 0.3 };
        pose('magic');
      } else if (m.cd.a <= 0 && low) {
        m.cd.a = G.stage.raid ? 3.2 : 5;
        const tier = Math.min(7, m.lv + 1), fx = SKILLS.c_heal.fxs[tier];
        const n = low.maxHp * (0.14 + 0.04 * m.lv);
        if (low === p) {
          heal(n, false);
          addFx(fx, 0, -26, { follow: true });
        } else healMember(low, n, fx);
        audio.play('skill_c_heal', 'heal', tier + 1);
        partySay(m, KIWON[tier]);
        pose('magic');
      } else if (m.cd.b <= 0) {
        m.cd.b = 14;
        G.buffs.shield = Math.max(G.buffs.shield, G.t + 4 + m.lv);
        for (const b of partyBodies()) addFx(FX.shield, b === p ? 0 : b.x, -26 + (b === p ? 0 : b.y), { follow: b === p, scale: 0.6 });
        audio.play('party_guard');
        partySay(m, '보호');
        note('보호의 효과를 받습니다.');
        pose('magic');
      } else if (m.cd.c <= 0) {
        const t = boss || near(1)[0];
        if (!t) break;
        m.cd.c = 7;
        for (const e of around(t.tx, t.ty, 1 + (m.lv >= 3))) e.curse = 4;
        fxOn(SKILLS.m_curse.fx, t);
        audio.play('skill_m_curse', 'strike');
        partySay(m, '저주');
        face(t);
        pose('magic');
      }
      break;
    }
    case 'mage': {
      const t = boss || near(1)[0];
      if (!t) break;
      face(t);
      if (boss && m.cd.d <= 0) {
        // 헬파이어 on the boss: the big one.
        m.cd.d = 16;
        fxOn(SKILLS.m_ult.fx, t);
        later(0.3, () => hurtEnemy(t, 70 * pw));
        audio.play('skill_m_ult', 'ult');
        partySay(m, '헬파이어');
        pose('magic');
      } else if (m.cd.a <= 0) {
        m.cd.a = 1.3;
        fxOn(SKILLS.m_fire.fxs[Math.min(7, m.lv)], t);
        later(0.15, () => hurtEnemy(t, 8 * pw));
        audio.play('skill_m_fire', 'spell', Math.min(8, m.lv * 2));
        if (Math.random() < 0.3) partySay(m, ['화염주', '화영열주', '화열참주'][Math.min(2, m.lv - 1)]);
        pose('magic');
      } else if (m.cd.b <= 0) {
        m.cd.b = 8;
        for (const e of around(t.tx, t.ty, 1)) e.stun = e.kind === 'boss' ? 0.6 : 2;
        fxOn(SKILLS.m_para.fx, t);
        audio.play('skill_m_para', 'strike');
        partySay(m, '마비');
        pose('magic');
      }
      break;
    }
    case 'warrior': {
      // 도발: the boss turned on someone else comes back to the warrior.
      if (boss && G.aggro && G.aggro !== m && m.cd.c <= 0) {
        m.cd.c = 10;
        G.aggro = m;
        partySay(m, '이리 와라');
        audio.play('skill_w_roar', 'nova');
        pose('attack');
        break;
      }
      const t = near(1)[0];
      if (!t || Math.hypot(t.x - m.x, t.y - m.y) > TILE * 1.6) break;
      face(t);
      if (boss && t === boss && m.cd.d <= 0) {
        m.cd.d = 18;
        fxOn(SKILLS.w_roar.fx, t);
        later(0.2, () => hurtEnemy(t, 60 * pw));
        audio.play('skill_w_roar', 'nova');
        partySay(m, '동귀어진');
        G.shake = Math.max(G.shake, 0.2);
        pose('attack');
      } else if (m.cd.a <= 0) {
        m.cd.a = 0.8;
        hurtEnemy(t, 9 * pw);
        audio.play('hit');
        pose('attack');
        if (m.cd.b <= 0) {
          m.cd.b = 10;
          for (const e of around(t.tx, t.ty, 1)) hurtEnemy(e, 15 * pw);
          fxOn(SKILLS.w_tiger.fx, t);
          audio.play('skill_w_tiger', 'spell');
          partySay(m, '백호참');
        }
      }
      break;
    }
    case 'rogue': {
      const t = boss || near(1)[0];
      if (!t) break;
      face(t);
      if (m.cd.c <= 0) {
        // 투명: gone from sight a moment; nothing strikes it, and its next blows land harder.
        m.cd.c = 12;
        m.hidden = G.t + 2.5;
        addFx(SKILLS.r_stealth.fx, m.x, m.y - 26, { scale: 0.7 });
        audio.play('skill_r_stealth', 'buff');
        partySay(m, '투명');
      }
      if (boss && m.cd.d <= 0) {
        m.cd.d = 15;
        fxOn(SKILLS.r_ult.fx, t);
        later(0.25, () => hurtEnemy(t, 55 * pw));
        audio.play('skill_r_ult', 'ult');
        partySay(m, '필살검무');
        pose('attack');
      } else if (m.cd.a <= 0) {
        m.cd.a = 1.6;
        fxOn(SKILLS.r_blink.fx, t);
        hurtEnemy(t, 12 * pw * (m.hidden > G.t ? 2 : 1));
        audio.play('skill_r_blink', 'blink');
        if (Math.random() < 0.25) partySay(m, '비영승보');
        pose('attack');
      }
      break;
    }
  }
}

function drawParty(m) {
  const dir = facing(m.fdx, m.fdy);
  const alpha = m.down ? 0.4 : m.hidden > G.t ? 0.35 : 1, y = m.down ? m.y - 4 - Math.sin(G.t * 2) * 3 : m.y;
  if (m.av) {
    const pose = m.down ? 'idle' : m.poseT > 0 ? m.pose : m.moving ? 'walk' : 'idle';
    drawAvatar(ctx, m.av, m.x, y, dir, pose, Math.floor(m.walkT / WALK_MS), alpha);
  } else drawWalker(m.img, m.x, y, m.fdx < 0 ? -1 : 1, m.walkT / 100, m.moving, m.flash, 1, alpha);
  if (!m.down) {
    // A small bar over the head, as the client showed for a party.
    const top = m.y - (m.av ? m.av.top : 50) - 4, k = m.hp / m.maxHp;
    ctx.fillStyle = '#1e4a10';
    ctx.fillRect(Math.round(m.x - 12), Math.round(top), 24, 2);
    ctx.fillStyle = k > 0.5 ? '#4ad82a' : k > 0.25 ? '#e8d020' : '#e83a1a';
    ctx.fillRect(Math.round(m.x - 12), Math.round(top), Math.round(24 * k), 2);
  }
  // Name under the feet, in the party's green, as the client named players.
  ctx.font = '8px G7';
  ctx.textAlign = 'center';
  outline(m.name, m.x, m.y + 9, '#9ff08a');
}

// ---------------------------------------------------------------- pickups and levels

function updatePickups(dt) {
  const p = G.player;
  // 노획 reaches for dropped things from further away.
  const reach = TILE * (0.7 + 0.5 * G.passives.magnet + opt('magnet'));
  for (const d of G.drops) {
    if (Math.hypot(d.x - p.x, d.y - p.y) < reach) {
      d.taken = true;
      if (d.kind === 'gear') pickGear(d.gear);
      else if (d.kind === 'mat') {
        progress.mats = progress.mats || {};
        progress.mats[d.mat] = (progress.mats[d.mat] || 0) + 1;
        (G.gained = G.gained || []).push(MATS[d.mat].name);
        note(`${MATS[d.mat].name} +1`);
        audio.play('pickup');
      }
      else if (d.kind === 'heal') heal(30, true);
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
        // A spell ready to evolve does so, and the chest holds only gold; else a level-up.
        if (!evolve()) {
          G.pendingLevels++;
          nextChoice();
        }
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
  // Alone, the hero grows a little faster: more cards, sooner.
  v *= 1.4;
  p.xp += v;
  p.total = (p.total || 0) + v;
  while (p.xp >= p.next) {
    p.xp -= p.next;
    p.lvl++;
    p.next = xpFor(p.lvl);
    G.pendingLevels++;
    say(`레벨이 올랐습니다. (Lv ${p.lvl})`, 'sys');
    if (p.lvl % 10 === 0) emote('grind', p);
    // Party members join at levels 3, 9 and 15, as D2 Survivors' mercenaries do.
    const joinAt = [3, 9, 15].indexOf(p.lvl);
    if (joinAt >= 0) {
      const order = ['poet', 'warrior', 'mage', 'rogue'].filter(c => c !== G.cls.id);
      const c = CLASSES.find(x => x.id === order[joinAt]);
      // Only in 동료 모드 (the menu): a hunting ground is the hero's alone otherwise.
      // They come once the card is picked, announced, so no card seems to have called them.
      if (c && settings.party && !G.party.some(m => m.cls.id === c.id)) (G.joining = G.joining || []).push(c);
    }
  }
  if (G.pendingLevels && !G.choosing) nextChoice();
}

/** The highest level a spell may have now: never past (character level − its req + 1). */
function levelCap(id) {
  return Math.min(MAX_SKILL_LEVEL, G.player.lvl - (SKILLS[id].req || 1) + 1);
}

/** Evolves the first spell that is ready: level 8, its catalyst passive, its form's level. */
function evolve() {
  // 각성: a spell at 8단 grows into the higher 승급's spell of its line, once the class has
  // that 승급 (백호참 → 극백호참 at 4차). No passive is needed: the 승급 is the key.
  for (const s of G.skills) {
    const d = SKILLS[s.id];
    if (!d.up || s.lv < MAX_SKILL_LEVEL) continue;
    const into = SKILLS[d.up];
    if (G.player.lvl < into.req) continue;
    if (promoOf(G.cls.id) < into.promo) {
      // Ready but not yet allowed: say once what is missing.
      G.told = G.told || {};
      if (!G.told[into.name]) {
        G.told[into.name] = true;
        const at = STAGES.find(x => x.id === PROMOS[G.cls.id][into.promo - 1].at);
        say(`${josa(into.name, '으로', '로')} 거듭나려면 ${into.promo}차 승급이 필요합니다. (${josa(at.name, '을', '를')} ${josa(G.cls.name, '으로', '로')} 정복)`, 'sys');
      }
      continue;
    }
    const from = d.names ? d.names[7] : d.name;
    s.from = s.id;
    s.id = d.up;
    s.lv = 1;
    s.timer = 0.2;
    G.shake = 0.4;
    audio.play('levelup');
    shout(into.name);
    say(`${josa(from, '이', '가')} ${josa(into.name, '으로', '로')} 거듭났습니다!`, 'sys');
    banner(`${into.name} 각성!`);
    return true;
  }
  return false;
}

/** Three cards, as D2 Survivors deals them. */
function drawCards() {
  const lvl = G.player.lvl, mine = id => SKILLS[id].cls === G.cls.id || SKILLS[id].cls === 'all';
  const have = id => G.skills.some(x => x.id === id || x.from === id || x.from2 === id);
  const banned = o => G.banished.has(o.type + ':' + o.id);
  if (G.firstCard) {
    // The first card: the class's first-tier attacks, and a mastered spell or two (숙련),
    // whatever level it usually opens at; the 기원 comes with the next.
    G.firstCard = false;
    const first = Object.entries(SKILLS).filter(([id, d]) => mine(id) && d.req === 1 && !d.evolved && d.kind !== 'ult' && d.kind !== 'heal')
      .map(([id]) => ({ type: 'skill', id, lv: 1 }));
    const known = mastered(G.cls.id).filter(id => SKILLS[id].req > 1 && SKILLS[id].kind !== 'heal')
      .sort(() => Math.random() - 0.5).slice(0, 1).map(id => ({ type: 'skill', id, lv: 1, mastered: true }));
    return known.concat(first).slice(0, 3);
  }
  const opts = [];
  // Spells and passives that lead to an evolution the hero is working toward weigh more.
  const wanted = new Set();
  for (const s of G.skills) {
    if (SKILLS[s.id].evolved || s.lv >= levelCap(s.id)) continue;
    // A spell that grows (up) with the 승급 already won weighs a little more.
    const d = SKILLS[s.id], ready = d.up && promoOf(G.cls.id) >= SKILLS[d.up].promo;
    opts.push({ type: 'skill', id: s.id, lv: s.lv + 1, w: ready ? 4 : 3 });
  }
  if (G.skills.length < MAX_SKILLS) {
    for (const [id, d] of Object.entries(SKILLS)) {
      if (!mine(id) || d.evolved || d.kind === 'ult' || (d.req || 1) > lvl || have(id)) continue;
      if (d.promo && promoOf(G.cls.id) < d.promo) continue;
      opts.push({ type: 'skill', id, lv: 1, w: 2.5 });
    }
  }
  const owned = Object.values(G.passives).filter(v => v > 0).length;
  for (const [id] of Object.entries(PASSIVES)) {
    const lv = G.passives[id];
    if (lv >= MAX_PASSIVE_LEVEL || (!lv && owned >= MAX_PASSIVES)) continue;
    opts.push({ type: 'passive', id, lv: lv + 1, w: wanted.has(id) ? 3 : 1.3 });
  }
  const pool = opts.filter(o => !banned(o));
  const picks = [];
  while (picks.length < 3 && pool.length) {
    const total = pool.reduce((a, o) => a + o.w, 0);
    let r = Math.random() * total;
    const i = pool.findIndex(o => (r -= o.w) <= 0);
    picks.push(pool.splice(i < 0 ? 0 : i, 1)[0]);
  }
  return picks;
}

function nextChoice() {
  if (!G.pendingLevels || G.over || G.dead) return;
  G.pendingLevels--;
  const picks = drawCards();
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
      const lvFx = def.fxs ? def.fxs[Math.min(o.lv, def.fxs.length) - 1] : def.fx;
      icon = !lvFx ? itemIcon('p_power') : fxIcon(lvFx);
      name = skillName(o.id, o.lv);
      text = levelText(o.id, o.lv);
      tag = (o.mastered ? '숙련' : o.lv === 1 ? '새 마법' : `Lv ${o.lv}`)
        + (def.elem ? ` <u style="background:${ELEMENTS[def.elem][1]}">${ELEMENTS[def.elem][0]}</u>` : '');
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
    b.dataset.id = o.id;
    box.append(b);
  }
  $('#lv-reroll').textContent = `다시 뽑기 ${G.rerolls}`;
  $('#lv-skip').textContent = `넘기기 ${G.skips}`;
  $('#lv-banish').textContent = G.banishing ? '뺄 카드를 고르세요' : `빼기 ${G.banishes}`;
  $('#lv-reroll').disabled = !G.rerolls;
  $('#lv-skip').disabled = !G.skips;
  $('#lv-banish').disabled = !G.banishes;
  $('#levelup').hidden = false;
}

// Two of each per run, as in D2 Survivors: deal again, pass, or strike a card out for the run.
$('#lv-reroll').onclick = () => {
  if (!G || !G.choosing || !G.rerolls) return;
  G.rerolls--;
  G.pendingLevels++;
  G.choosing = false;
  nextChoice();
};
$('#lv-skip').onclick = () => {
  if (!G || !G.choosing || !G.skips) return;
  G.skips--;
  $('#levelup').hidden = true;
  G.choosing = false;
  if (G.pendingLevels) nextChoice();
};
$('#lv-banish').onclick = () => {
  if (!G || !G.choosing || !G.banishes) return;
  G.banishing = !G.banishing;
  $('#lv-banish').textContent = G.banishing ? '뺄 카드를 고르세요' : `빼기 ${G.banishes}`;
};

function choose(o) {
  if (!G.choosing) return; // a second tap on the same card
  if (G.banishing && (o.type === 'skill' || o.type === 'passive')) {
    G.banishing = false;
    G.banishes--;
    G.banished.add(o.type + ':' + o.id);
    const n = o.type === 'skill' ? SKILLS[o.id].name : PASSIVES[o.id].name;
    say(`${josa(n, '은', '는')} 이번 사냥에서 나오지 않습니다.`);
    G.pendingLevels++;
    G.choosing = false;
    nextChoice();
    return;
  }
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
  if (G.extraLives > 0) {
    // 성황령, bought in town: back on one's feet at half health.
    G.extraLives--;
    p.hp = p.maxHp * 0.5;
    G.buffs.guard = G.t + 3;
    say('성황령의 힘으로 다시 일어났습니다.', 'sys');
    addFx(FX.revive, 0, -26, { follow: true });
    audio.play('revive');
    return;
  }
  if (G.cls.revive && !G.revived) {
    G.revived = true;
    p.hp = p.maxHp * 0.5;
    G.buffs.guard = G.t + 3;
    G.bubble = { text: '부활!', t: G.t };
    say('부활 마법으로 다시 일어났습니다.');
    addFx(FX.revive, 0, -26, { follow: true });
    audio.play('revive');
    return;
  }
  G.dead = true;
  p.hp = 0;
  audio.play('lose');
  audio.stopBgm();
  say('유령이 되었습니다…', 'warn');
  record();
  setTimeout(() => showResults('유령이 되었습니다'), 1800);
}

/** Gear still lying on the ground when a hunt ends goes to the bag: no spoils are lost. */
function gatherGear() {
  for (const d of G.drops) {
    if (d.taken || (d.kind !== 'gear' && d.kind !== 'mat')) continue;
    d.taken = true;
    if (d.kind === 'gear') pickGear(d.gear);
    else {
      progress.mats = progress.mats || {};
      progress.mats[d.mat] = (progress.mats[d.mat] || 0) + 1;
    }
  }
}

function showResults(title) {
  if (!G || G.over) return;
  gatherGear();
  G.over = true;
  // Whatever was open goes: the results are on top of nothing.
  $('#levelup').hidden = true;
  G.choosing = false;
  G.pendingLevels = 0;
  bankGold();
  keepBuild();
  if (G.endless) {
    const st = qstats();
    st.endless = Math.max(st.endless, G.t - G.clearT);
  }
  saveJson('bs_progress', progress);
  $('#over-title').textContent = title;
  $('#over-stats').innerHTML = `${G.cls.name} · Lv ${G.player.lvl} · ${G.stage.name}<br>버틴 시간 ${clock(G.t)}`
    + (G.endless ? ` (계속 사냥 ${clock(G.t - G.clearT)})` : '') + '<br>'
    + `쓰러뜨린 몬스터 ${G.kills}마리 · ${G.gold}전<br>`
    + G.skills.map(s => `${skillName(s.id, s.lv)}`).join(' · ')
    + (G.gained && G.gained.length ? `<br><b class="promo">얻은 장비: ${G.gained.join(', ')}</b>` : '')
    + (G.promoted ? `<br><b class="promo">${G.promoted.join('<br>')}</b>` : '');
  // A conquered ground can be hunted on, harder and harder, for its specials.
  $('#keep').hidden = !(G.cleared && !G.dead && !G.stage.raid);
  showScreen('over');
}

function leaveHunt() {
  if (G) {
    if (!G.over) gatherGear();
    record();
    bankGold();
  }
  const cls = G ? G.cls : chosenClass;
  G = null;
  enterTown(cls);
}

/** The gold of a hunt goes to the purse once, whether it ends in death, victory or leaving. */
function bankGold() {
  if (!G || G.banked) return;
  G.banked = true;
  progress.gold = (progress.gold || 0) + G.gold;
  saveJson('bs_progress', progress);
}

function record() {
  const r = best[G.cls.id];
  if (!r || G.player.lvl > r.lvl || (G.player.lvl === r.lvl && G.kills > r.kills)) {
    best[G.cls.id] = { lvl: G.player.lvl, kills: G.kills };
    saveJson('bs_best', best);
  }
}

/** How many 승급 a class has: each tier needs its ground conquered by that class, in order. */
function promoOf(cls) {
  const done = progress.byClass[cls] || {};
  let n = 0;
  while (n < PROMOS[cls].length && done[PROMOS[cls][n].at]) n++;
  return n;
}

/** On a conquest: the class's record, and a 승급 when the ground was the next one it needed. */
function promote() {
  const cls = G.cls.id, before = promoOf(cls);
  (progress.byClass[cls] = progress.byClass[cls] || {})[G.stage.id] = true;
  const after = promoOf(cls);
  for (let n = before; n < after; n++) {
    // What the 승급 opens: its spells on the cards, and the spells that can now grow into it.
    const tierSpells = Object.values(SKILLS).filter(d => d.cls === cls && d.promo === n + 1);
    const cards = tierSpells.filter(d => !d.evolved).map(d => d.name);
    const grown = tierSpells.filter(d => d.evolved).map(d => d.name + ' 각성');
    const what = cards.concat(grown).join(', ');
    say(`${n + 1}차 승급! 이제 ${what}.`, 'sys');
    G.promoted = (G.promoted || []).concat(`${n + 1}차 승급: ${what}`);
    later(1.5, () => banner(`${G.cls.name} ${n + 1}차 승급!`));
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
  // The client wrote a repeated message once.
  if (box.lastChild && box.lastChild.dataset.t === text) return;
  const p = document.createElement('p');
  p.textContent = text;
  p.dataset.t = text;
  box.append(p);
  while (box.children.length > 6) box.firstChild.remove();
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
  if (window.__botInput && G) [x, y] = window.__botInput(G);
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
// Monster pictures all face the viewer (south). Those drawn from above — rats, boars, tigers,
// bears, pigs, lizards with the head at the bottom, and snakes with the head at the top — turn
// so the head leads, in all four directions. The upright ones (deer, rabbits, goblins, people)
// cannot show a back or a side: they lean into the way they walk.
const TOP_DOWN = new Set(['1005', '1007', '1012', '1013', '1022', '1023', '1025', '1027', '3034', '3035', '3036', '3037',
  '6008', '8011', '8015', '8023', '8024', '11015', '12020', '12021', '12022', '12023', '12024']);
const SNAKES = new Set(['1016', '1018', '1019', '1020', '1021', '5015', '5016', '5055', '12013', '12014', '12016', '12017', '8027']);

/** A monster as it moves: turned (top-down kinds), or leaning (upright kinds). */
/** A summoned 괴수: its own four ways, walking or striking, from the dress-room sheet. */
function drawBeast(b, alpha) {
  const d = M.beast[b.beast], im = images[`beast/${b.beast}.png`];
  const [cw, ch] = d.cell, k = 0.62;
  const row = b.mdy > 0 ? 0 : b.mdx > 0 ? 1 : b.mdy < 0 ? 2 : b.mdx < 0 ? 3 : 0;
  const col = b.hitT !== undefined && G.t - b.hitT < 0.3 ? 4 + (G.t - b.hitT < 0.15 ? 0 : 1)
    : b.moving ? Math.floor(b.phase / (Math.PI / 2)) % 4 : Math.floor(G.t * 2.5) % 4;
  ctx.save();
  ctx.globalAlpha = Math.max(0, alpha);
  ctx.drawImage(im, col * cw, row * ch, cw, ch, Math.round(b.x - d.feet[0] * k), Math.round(b.y - d.feet[1] * k),
    Math.round(cw * k), Math.round(ch * k));
  ctx.restore();
}

function drawMonster(b, x, y, s, alpha = 1) {
  const img = b.m.img, id = b.m.id, dx = b.mdx || 0, dy = b.mdy === undefined ? 1 : b.mdy;
  const turn = TOP_DOWN.has(id) ? 0 : SNAKES.has(id) ? Math.PI : null;
  if (turn === null) {
    drawWalker(img, x, y, b.face, b.phase, b.moving, b.flash, s, alpha, b.moving ? dx : 0);
    return;
  }
  // The head at the bottom (top-down) or the top (snakes): rotate so it points the way it goes.
  const ang = (dx > 0 ? -Math.PI / 2 : dx < 0 ? Math.PI / 2 : dy < 0 ? Math.PI : 0) + turn;
  const w = Math.round(img.width * s), h = Math.round(img.height * s);
  const side = dx !== 0, cy = y - (side ? w / 2 + 2 : h / 2);
  const lift = b.moving && Math.floor(b.phase / Math.PI) % 2 === 0 ? 1 : 0;
  ctx.save();
  ctx.globalAlpha = 0.28 * alpha;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(Math.round(x), Math.round(y - 2), (side ? h : w) * 0.45, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(Math.round(x), Math.round(cy - lift));
  ctx.rotate(ang);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  if (b.flash > 0) ctx.drawImage(white(img), -w / 2, -h / 2, w, h);
  ctx.restore();
}

function drawWalker(img, x, y, face, phase, moving, flash, scale = 1, alpha = 1, lean = 0) {
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
  // Leaning into the walk: the top a little ahead of the feet.
  if (lean) ctx.transform(1, 0, -lean * 0.12, 1, 0, 0);
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
    if (T && !$('#town').hidden) drawTown(now);
    else drawMenuBackdrop(now);
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
    const im = d.kind === 'gear' ? gearImage(d.gear) : d.kind === 'mat' ? images[`item/${M.items[MATS[d.mat].icon].id}.png`]
      : images[`item/${M.items[d.kind].id}.png`];
    if (!im) continue;
    if (d.gear && d.gear.sp) {
      // A special shimmers gold where it lies.
      ctx.save();
      ctx.globalAlpha = 0.35 + 0.25 * Math.sin(now * 6);
      ctx.fillStyle = '#ffd040';
      ctx.beginPath();
      ctx.ellipse(Math.round(d.x), Math.round(d.y - im.height / 2), im.width * 0.9, im.height * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.drawImage(im, Math.round(d.x - im.width / 2), Math.round(d.y - im.height - 2 + Math.sin(now * 4) * 1.5));
  }

  // A raid boss's marked tiles, blinking red until they are struck.
  for (const mk of G.marks) {
    const blink = Math.floor((G.t - mk.made) * 8) % 2;
    ctx.fillStyle = blink ? 'rgba(220, 30, 20, 0.45)' : 'rgba(220, 30, 20, 0.28)';
    for (const [x, y] of mk.tiles) ctx.fillRect(x * TILE + 1, y * TILE + 1, TILE - 2, TILE - 2);
  }

  // Bodies, back to front.
  const bodies = G.enemies.concat(G.allies, G.party);
  bodies.push(p);
  bodies.sort((a, b) => a.y - b.y);
  const hidden = G.buffs.stealth > G.t;
  for (const b of bodies) {
    if (b === p) {
      drawHero(now, hidden);
      continue;
    }
    if (b.cls) {
      drawParty(b);
      continue;
    }
    if (b.ally && b.beast) {
      drawBeast(b, Math.min(1, (b.life - b.t) * 2, b.t * 4));
      continue;
    }
    if (b.ally) {
      drawMonster(b, b.x, b.y, 1, Math.min(1, (b.life - b.t) * 2) * 0.85);
      continue;
    }
    const s = b.scale;
    // A monster leans in as it strikes.
    const kick = b.kickAt !== undefined && G.t - b.kickAt < 0.1 ? 4 : 0;
    const lx = (b.lunge > 0 ? Math.sign(p.x - b.x) * 3 : 0) + (b.kdx || 0) * kick;
    const ly = (b.lunge > 0 ? Math.sign(p.y - b.y) * 3 : 0) + (b.kdy || 0) * kick;
    if (b.flee) ctx.filter = 'sepia(1) saturate(5) hue-rotate(-12deg) brightness(1.25)';
    drawMonster(b, b.x + lx, b.y + ly, s);
    if (b.flee) ctx.filter = 'none';
    if (!b.kind && b.shown && G.t - b.shown < 3) {
      // A struck monster shows its health over its head for a while.
      const bx = Math.round(b.x - 12), by = Math.round(b.y - b.m.h * s - 5);
      ctx.fillStyle = '#000';
      ctx.fillRect(bx - 1, by - 1, 26, 4);
      const k = Math.max(0, b.hp / b.maxHp);
      ctx.fillStyle = k > 0.5 ? '#4ad82a' : k > 0.25 ? '#e8d020' : '#e83a1a';
      ctx.fillRect(bx, by, Math.round(24 * k), 2);
    }
    if (b.kind && b.kind !== 'minion') {
      bar(b.x - 22, b.y + 3, 44, 3, b.hp / b.maxHp, '#d33');
      ctx.font = '10px G9';
      ctx.textAlign = 'center';
      if (b.name) outline(b.name, b.x, b.y - b.m.h * s - 4, b.kind === 'boss' ? '#ff8a6a' : '#ffe070');
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
  drawEmote(p, p.x, p.y - heroHeight() - (G.bubble ? 36 : 10));
  for (const m of G.party) {
    if (m.bubble) drawBubble(m.bubble.text, m.x, m.y - (m.av ? m.av.top : 50) - 12, G.t - m.bubble.t);
    drawEmote(m, m.x, m.y - (m.av ? m.av.top : 50) - (m.bubble ? 36 : 10));
  }
  for (const e of G.enemies) {
    if (e.bubble && G.t - e.bubble.t < 1.6) drawBubble(e.bubble.text, e.x, e.y - e.m.h * e.scale - 16, G.t - e.bubble.t);
  }

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
    // The ghost the dead become: the hero, pale and see-through, floating.
    const y = p.y - 4 - Math.sin(now * 2) * 3;
    if (p.av) drawAvatar(ctx, p.av, p.x, y, facing(p.fdx, p.fdy), 'idle', 0, 0.45);
    else drawWalker(p.img, p.x, y, p.face, 0, false, 0, 1, 0.45);
    return;
  }
  // Struck, the hero does not flicker: the client showed a blow only in the health bar.
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

/**
 * A reaction from the official emoticons over someone's head (who: the hero or a companion;
 * without a party the hero reacts). Each lasts two seconds, one at a time.
 */
function emote(key, who = null) {
  if (!G || !M.emote || !M.emote[key] || !settings.bubbles) return;
  if (!who) {
    const up = G.party.filter(m => !m.down);
    who = up.length && Math.random() < 0.75 ? up[Math.floor(Math.random() * up.length)] : G.player;
  }
  if (who.emo && G.t - who.emo.t < 2.2) return;
  who.emo = { key, t: G.t };
}
function drawEmote(who, x, y) {
  const e = who.emo;
  if (!e || !settings.bubbles) return;
  const age = G.t - e.t, def = M.emote[e.key], im = images[`emote/${e.key}.png`];
  if (age > 2.2 || !def || !im) return;
  const f = Math.floor((age * 1000) / def.dur) % def.n, size = 44;
  ctx.save();
  ctx.globalAlpha = age < 1.9 ? 1 : Math.max(0, 1 - (age - 1.9) / 0.3);
  const pop = Math.min(1, age / 0.12);
  const s = size * (0.6 + 0.4 * pop);
  ctx.drawImage(im, f * 64, 0, 64, 64, Math.round(x - s / 2), Math.round(y - s), Math.round(s), Math.round(s));
  ctx.restore();
}

function drawBubble(text, x, y, age = 0) {
  // A shout over a character's head, drawn as the old client drew them (see the 노획 capture):
  // a pill of near-black maroon with a violet rim and violet letters, a small tail below.
  if (!settings.bubbles) return;
  const RIM = '#5c58d7', EDGE = '#1c0d3a', FILL = '#251117';
  ctx.save();
  ctx.globalAlpha = age < 1 ? 1 : Math.max(0, 1 - (age - 1) / 0.3);
  ctx.font = 'bold 12px G11';
  ctx.textAlign = 'center';
  const h = 20, r = h / 2;
  const w = Math.max(h + 8, Math.ceil(ctx.measureText(text).width) + 18);
  x = Math.round(x);
  const l = x - Math.round(w / 2), t = Math.round(y) - h - 4;
  // Row by row, so the rounded ends stay pixel-sharp.
  for (let row = 0; row < h; row++) {
    const dy = row + 0.5 - r;
    const inset = Math.round(r - Math.sqrt(Math.max(0, r * r - dy * dy)));
    const yy = t + row;
    ctx.fillStyle = EDGE;
    ctx.fillRect(l + inset, yy, w - inset * 2, 1);
    if (row === 0 || row === h - 1) continue;
    const dy2 = row + 0.5 - r, r2 = r - 1;
    const in2 = Math.round(r - Math.sqrt(Math.max(0, r2 * r2 - dy2 * dy2)));
    ctx.fillStyle = RIM;
    ctx.fillRect(l + in2, yy, w - in2 * 2, 1);
    if (row === 1 || row === h - 2) continue;
    const r3 = r - 2.5, in3 = Math.round(r - Math.sqrt(Math.max(0, r3 * r3 - dy2 * dy2)));
    ctx.fillStyle = FILL;
    ctx.fillRect(l + in3, yy, w - in3 * 2, 1);
  }
  // The tail.
  ctx.fillStyle = RIM;
  ctx.fillRect(x - 2, t + h - 1, 5, 1);
  ctx.fillRect(x - 1, t + h, 3, 1);
  ctx.fillStyle = EDGE;
  ctx.fillRect(x, t + h + 1, 1, 1);
  ctx.fillStyle = RIM;
  ctx.fillText(text, x, t + 14);
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
  put('#boss-clock', G.bossDue ? `${G.boss.name}까지 ${clock((G.stage.raid ? RAID_BOSS_AT : BOSS_AT) - G.t)}`
    : G.stage.raid && !G.cleared ? `남은 시간 ${clock(Math.max(0, RAID_LIMIT - G.t))}` : '');
  // The boss's bar across the top, as a raid shows it: also for leaders on any ground.
  const big = G.enemies.find(e => e.kind === 'boss') || G.enemies.find(e => e.kind === 'mini');
  $('#bossbar').hidden = !big;
  if (big) {
    put('#bb-name', big.name + (G.stage.raid ? ['', ' · 분노', ' · 광폭'][G.phase || 0] : ''));
    $('#bb-fill').style.width = Math.max(0, big.hp / big.maxHp * 100).toFixed(1) + '%';
    put('#bb-num', `${Math.max(0, Math.ceil(big.hp))} / ${Math.ceil(big.maxHp)}`);
  }
  if (document.body.classList.contains('panel-off')) {
    put('#mini', `체 ${Math.ceil(Math.max(0, p.hp))}/${p.maxHp}   마 ${Math.floor(p.mp)}/${p.maxMp}   Lv ${p.lvl}`);
    return;
  }
  const cleared = Object.keys(progress.cleared).length;
  put('#sd-clan', G.stage.map === 'world_4' ? '환상의 섬' : '고구려');
  put('#sd-ct', G.stage.name);
  put('#sd-title', heroTitle(cleared));
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
  put('#sd-exp', String(Math.floor(p.total || 0)));
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
  // The top slot is the helmet's; the armor shows on the figure itself.
  const worn = ['helmet', 'weapon', 'shield'].map(k => (p.av && (g[k] >= 0 || g[k + 'Sp']) ? pieceIcon(G.cls, k, g[k], g[k + 'Sp']) : null));
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
  $('#opt-bubble').textContent = '말풍선: ' + (settings.bubbles ? '켬' : '끔');
  $('#opt-tiles').textContent = '이동: ' + (settings.tiles ? '한 칸씩' : '자유');
  $('#opt-party').textContent = '동료 모드: ' + (settings.party ? '켬' : '끔');
}

// ---------------------------------------------------------------- backup
//
// Everything the game keeps (records, gold, gear, hair, 승급, raids, settings) as one line of
// text: copied out, it comes back even after the app was removed and installed again.

const SAVE_KEYS = ['bs_progress', 'bs_best', 'bs_settings'];

$('#backup-btn').onclick = () => {
  const data = {};
  for (const k of SAVE_KEYS) data[k] = localStorage.getItem(k);
  $('#backup-text').value = 'BARAM1:' + btoa(unescape(encodeURIComponent(JSON.stringify(data))));
  $('#backup-note').textContent = '이 글 전체를 복사해 메모장 같은 곳에 두세요. 불러올 때는 붙여 넣고 불러오기.';
  $('#backup').hidden = false;
};
$('#backup-copy').onclick = () => {
  const ta = $('#backup-text');
  ta.select();
  const done = () => { $('#backup-note').textContent = '복사했습니다.'; };
  if (navigator.clipboard) navigator.clipboard.writeText(ta.value).then(done, () => { document.execCommand('copy'); done(); });
  else { document.execCommand('copy'); done(); }
};
$('#backup-load').onclick = () => {
  const text = $('#backup-text').value.trim();
  try {
    if (!text.startsWith('BARAM1:')) throw new Error();
    const data = JSON.parse(decodeURIComponent(escape(atob(text.slice(7)))));
    for (const k of SAVE_KEYS) if (typeof data[k] === 'string') localStorage.setItem(k, data[k]);
    $('#backup-note').textContent = '불러왔습니다. 다시 시작합니다…';
    setTimeout(() => location.reload(), 800);
  } catch (e) {
    $('#backup-note').textContent = '기록 백업 글이 아닙니다. 처음부터 끝까지 그대로 붙여 넣으세요.';
  }
};
$('#backup-close').onclick = () => { $('#backup').hidden = true; };

$('#start-btn').onclick = () => {
  audio.unlock();
  showScreen('select');
};
$('#back-title').onclick = () => showScreen('title');
$('#back-select').onclick = () => enterTown(chosenClass);
$('#go').onclick = () => startRun(chosenClass, pickedStage);
$('#pause-btn').onclick = () => togglePause();
$('#resume').onclick = () => togglePause(false);
$('#quit').onclick = () => {
  $('#pause').hidden = true;
  leaveHunt();
};
$('#again').onclick = () => startRun(G.cls, G.stage);
// 계속 사냥: back into the conquered ground; the field grows until the hero falls.
$('#keep').onclick = () => {
  if (!G || !G.cleared || G.dead) return;
  G.over = false;
  G.banked = false;
  G.gold = 0;
  G.endless = true;
  G.clearT = G.t;
  G.endlessChamp = G.t + 60;
  showScreen(null);
  audio.bgm(huntMusic());
  say('계속 사냥합니다. 갈수록 몬스터가 늘고 강해집니다.', 'sys');
  banner('계속 사냥');
};
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
$('#opt-party').onclick = () => {
  settings.party = !settings.party;
  saveJson('bs_settings', settings);
  syncSettings();
};
$('#opt-tiles').onclick = () => {
  settings.tiles = !settings.tiles;
  saveJson('bs_settings', settings);
  syncSettings();
  if (G && G.player && !G.player.stepping) {
    // Stand on the tile's middle when switching.
    const p = G.player;
    p.x = p.tx * TILE + TILE / 2;
    p.y = p.ty * TILE + TILE - 6;
  }
};
$('#opt-bubble').onclick = () => {
  settings.bubbles = !settings.bubbles;
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
const MUSIC = [['title', '처음 화면'], ['select', '직업·사냥터 선택'], ['town', '국내성'], ['boss', '보스'], ...STAGES.map(s => ['stage_' + s.id, s.name]),
  ...RAIDS.map(r => ['raid_' + r.id, r.name])];

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
  // 이중공격 and its line are plain blows in the client: no sound of their own, only the
  // weapon striking (the 'hit' each blow plays).
  skill_w_slash: '-',
  skill_w_tiger: '087', skill_w_roar: '018', skill_w_ult: '014', // 백호참, 동귀어진, 건곤대나이
  skill_w_buff: ['012', '012', '012', '012', '089', '089', '089', '089'], // 백호령, 진백호령
  skill_r_blink: '030', skill_r_stealth: '028', skill_r_drain: '038', skill_r_clone: '039', skill_r_ult: '035',
  skill_r_bolt: ['055', '055', '056', '056', '057', '057', '058', '059'], // 뢰진주 계열
  // The last spell of each tree, to go with today's effect: 쇄혼비무 (a blue sword arc),
  // 포효검황 for 극백호참's tiger claws, 백호검무's blade, 혈겁만파 for 탈명사식'뇌's dark-red burst,
  // a blast for 폭류유성's fire vortex, 지폭지술's stones, 파력무참's golden ring, 파혼술 for 귀염추혼소.
  skill_w_sword: '100', skill_w_roar2: '087', skill_r_dance: '090', skill_r_storm: '059', skill_w_jin: '089',
  skill_w_chohon: '102', skill_w_talm: '700', skill_r_budong: '092', skill_r_bunhon: '064', skill_m_sun: '076',
  skill_m_hoche: '094', skill_m_talm: '701', skill_p_baekho: '095', skill_p_aegis: '108', skill_p_talm: '702',
  // 승급 기술: each its own number from the list (반탄공 has none: 부동력's).
  skill_w_fly: '088', skill_w_howl: '101', skill_w_blood: '060', skill_r_flysword: '091', skill_r_formless: '103',
  skill_r_heaven: '096', skill_m_magi: '105', skill_m_nodo: '106', skill_m_sammae: '093', skill_p_reflect: '099',
  skill_p_spirit: '097', skill_p_phoenix: '111', skill_p_ult: '076',
  skill_m_fire3: '104', skill_m_quake: '107', skill_p_wave: '109', skill_p_break: '077',
  skill_m_fire: ['040', '040', '041', '041', '042', '042', '043', '044'], // 화염주 계열
  skill_m_fire4: ['040', '040', '041', '041', '042', '042', '043', '044'],
  skill_m_ice: ['050', '050', '051', '051', '052', '052', '053', '054'], // 백열주 계열
  skill_m_para: '070', skill_m_curse: '069', skill_m_ult: '073', // 마비, 저주, 헬파이어
  skill_p_orb: ['045', '045', '046', '046', '047', '047', '048', '049'], // 자무주 계열
  skill_p_quake: '082', skill_p_barrier: '094', skill_p_summon: '081', skill_p_guard: '084',
  // 대격변 skills, by the sound list's names.
  skill_c_kick: '331', skill_w_bless: '006', skill_w_lion: '020', skill_w_ungong: '063', skill_r_muyoung: '024',
  skill_r_nuri: '021', skill_r_forget: '032', skill_r_jiok: '103', skill_r_gimun: '096', skill_r_gaehyeol: '063',
  skill_m_gongryeok: '065', skill_m_arm: '008', skill_m_toema: '067', skill_m_poison: '068', skill_m_despair: '071',
  skill_m_chaos: '020', skill_m_manpa: '068', skill_m_sage: '098', skill_p_toema: '067', skill_p_protect: '008',
  skill_p_pahon: '077', skill_p_sky: '034', skill_p_weaken: '085', skill_p_life: '098', skill_p_baekho2: '110',
  // 116 and 353 were only guessed (from an English server's scripts) and are a long hiss:
  // played on every hit they drowned the hunt. The hero being struck and monsters falling are
  // silent until a real sound for them is known; plain hits use the weapon sound, softly.
  hit: '331', kill: '-', hurt: '-', levelup: '123', pickup: '406', heal: '074', chest: '503', boss: '509',
  win: '401', lose: '402', revive: '112', click: '408', party_guard: '008',
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
    // '-' is a choice too: no sound at all.
    if ((Array.isArray(n) ? n : [n]).every(x => x === '-' || bank.has(x))) d[use] = n;
  }
  const mids = M.audio.bgm.map(b => b.key).filter(k => k.startsWith('mid'));
  if (mids.length) {
    const has = k => mids.includes(k);
    d.bgm_title = has('mid08') ? 'mid08' : mids[0];
    d.bgm_town = d.bgm_title;
    d.bgm_boss = has('mid04') ? 'mid04' : mids[mids.length - 1];
  }
  // The official OST, when it is in the build: the old login/title theme, 국내성 for the town,
  // 공성전 for bosses, and each ground's own track.
  const all = M.audio.bgm.map(b => b.key), has = k => all.includes(k);
  if (has('nx_04_Winds_take2')) d.bgm_title = 'nx_04_Winds_take2';
  if (has('bs_login')) d.bgm_title = 'bs_login';
  if (has('bs_charcreate')) d.bgm_select = 'bs_charcreate';
  if (has('nx_08_2_Goguryeo')) d.bgm_town = 'nx_08_2_Goguryeo';
  if (has('nx_10_4way_battle')) d.bgm_boss = 'nx_10_4way_battle';
  for (const st of STAGES) if (has(st.bgm)) d['bgm_stage_' + st.id] = st.bgm;
  for (const r of RAIDS) if (has(r.bgm)) d['bgm_raid_' + r.id] = r.bgm;
  return d;
}

function migrateSettings() {
  if (settings.numbersVer !== 1) {
    settings.numbers = false;
    settings.numbersVer = 1;
    saveJson('bs_settings', settings);
  }
}

function applySounds() {
  migrateSettings();
  // Picks made before the sounds had names were guesses: start again from the game's own.
  if (settings.soundsVer !== 4) {
    delete settings.sounds;
    delete settings.kinds;
    settings.soundsVer = 4;
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
  audio.bgm(G ? (G.enemies.some(e => e.kind === 'boss') && !G.stage.raid ? 'boss' : huntMusic()) : 'title');
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
  if (!$('#codex').hidden) {
    $('#codex').hidden = true;
    return true;
  }
  if (!$('#backup').hidden) {
    $('#backup').hidden = true;
    return true;
  }
  if (!$('#tree').hidden) {
    $('#tree').hidden = true;
    return true;
  }
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
window.__raid = (c, r) => startRun(CLASSES[c], RAIDS[r]);
window.__quests = () => openQuests();

boot();
