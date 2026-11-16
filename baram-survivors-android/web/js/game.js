import {
  CLASSES, SKILLS, PASSIVES, STAGES, MAX_SKILLS, MAX_PASSIVES, MAX_SKILL_LEVEL, MAX_PASSIVE_LEVEL, BOSS_AT, MINI_AT,
  CHAMPIONS_AT, FX, ELEMENTS, PROMOS, PROMO_NAMES, RAIDS, YEON_FX, RAID_BOSS_AT, RAID_LIMIT, GWOE_BEASTS, gwoeWeek, BRANCHES, PROMO_BONUS,
  skillStats, skillName, levelText,
} from './data.js';
import { Audio } from './audio.js';
import { GYEOK, STATUS, gyeokText, dragonGyeok, DRAGON_CORE, SINSU, SOURCE_GYEOK } from './gyeok.js';
import { YEON_SOUNDS, YEON_BGM, YEON_STAGE_BGM, YEON_RAID_BGM } from './yeon_sounds.js';
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
    // Hit sparks and the level-up burst are never in a spell slot: no icon of their own.
    ...Object.keys(M.fx).filter(id => !id.startsWith('new_') && !id.startsWith('h_')).map(id => `icon/${id}.png`),
    ...M.heroes.map(h => `hero/${h.id}.png`),
    ...Object.values(M.items).map(i => `item/${i.id}.png`),
    ...M.monsters.map(m => `mon/${m.id}.png`),
    ...avatarPaths(M),
    ...(M.npc || []).map(n => `npc/${n}.png`),
    ...(M.ui.town ? ['ui/town.png'] : []),
    ...(M.ui.ytown ? [...Object.keys(M.ui.ytown.areas).map(k => `ytown/${k}.png`), ...Object.keys(M.ui.ytown.folk).map(k => `ytown/${k}.png`),
      ...Object.keys(M.ui.ytown.areas).map(k => `ytown/mm_${k}.png`), 'ytown/sign.png', 'ytown/statue.png'] : []),
    ...(M.ui.ytitle ? ['ui/title_bg.jpg'] : []),
    ...Object.keys(M.emote || {}).map(k => `emote/${k}.png`),
    ...Object.keys(M.beast || {}).map(k => `beast/${k}.png`),
    ...(M.floor || []).map(k => `floor/${k}.png`),
    ...Object.keys(M.prop || {}).map(k => `prop/${k}.png`),
    ...(M.hud && M.hud.font_damage ? ['hud/font_damage.png'] : []),
    ...(M.hud && M.hud.font_gold ? ['hud/font_gold.png'] : []),
    ...(M.hud && M.hud.ui ? M.hud.ui.map(k => `hud/${k}.png`) : []),
    ...(M.status_icons || []).map(k => `hud/st_${k}.png`),
  ];
  let done = 0;
  const bar = $('#load-bar');
  await Promise.all(paths.map(p => loadImage(p).then(() => {
    bar.style.width = (100 * ++done / paths.length) + '%';
  })));
  // 연's own effects where the build has them: the spell's picture as it is, no tint.
  for (const [id, fx] of Object.entries(YEON_FX)) {
    if (M.fx[fx]) Object.assign(SKILLS[id], { fx, fxs: null, tint: null, fxk: 1, modern: null, yeon: true });
  }
  // Every getting-up (성황령, the class's own 부활, a companion raised) shows 연's revive.
  if (M.fx.k_revive) FX.revive = 'k_revive';
  // Better still, the spell's own effect out of 연's client, where it has one by that name.
  for (const id of Object.keys(SKILLS)) {
    const fx = 'k_' + id;
    if (M.fx[fx]) Object.assign(SKILLS[id], { fx, fxs: null, tint: null, fxk: 1, modern: null, yeon: true });
  }
  // Each 5차+ spell's effect in its own colour and size: a second name for the same picture.
  for (const [id, def] of Object.entries(SKILLS)) {
    if (def.tint && M.fx[def.fx]) M.fx['s_' + id] = { ...M.fx[def.fx], src: def.fx, tint: def.tint, k: def.fxk };
  }
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
  // 연's own title art carries the name: the drawn title and figures make way for it.
  if (M.ui.ytitle) document.body.classList.add('ytitle');
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
  if (stage.boss) boss = { m: monsterById[stage.boss.id], name: stage.boss.name, scale: stage.boss.scale || 1.4,
    beast: stage.boss.beast && M.beast && M.beast[stage.boss.beast] ? stage.boss.beast : null };
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

// Props on each kind of ground: 연's own map objects for the terrain (prop/<terrain>_<name>,
// with what each is), and the old town's fruit trees on the open fields. [name, weight].
const OLD_TREES = { field: ['tree1', 'tree2', 'tree3'], field2: ['tree1', 'tree2', 'tree3'] };
const PROP_WEIGHT = { rock: 4, grass: 4, plant: 4, wall: 2, wood: 2, jar: 2, decal: 2, torch: 1, statue: 1, pit: 1 };
const propCache = {};
function propKinds(terrain) {
  if (propCache[terrain]) return propCache[terrain];
  const list = [];
  for (const [name, meta] of Object.entries(M.prop || {})) {
    if (meta[2] === terrain) list.push([name, PROP_WEIGHT[meta[3]] || 1]);
  }
  for (const t of OLD_TREES[terrain] || []) if (M.prop && M.prop[t]) list.push([t, 3]);
  return (propCache[terrain] = list);
}
const PROP_CELL = 160;

/** The props standing in view: one cell of the endless ground at a time, the same every visit. */
function propsInView(camX, camY) {
  const kinds = propKinds(G.stage.terrain);
  if (!kinds.length) return [];
  const list = kinds.filter(([n]) => M.prop[n] && images[`prop/${n}.png`] && images[`prop/${n}.png`].width);
  const total = list.reduce((a, [, w]) => a + w, 0);
  if (!total) return [];
  const out = [];
  const x0 = Math.floor((camX - 220) / PROP_CELL), x1 = Math.floor((camX + VW + 220) / PROP_CELL);
  const y0 = Math.floor((camY - 60) / PROP_CELL), y1 = Math.floor((camY + VH + 120) / PROP_CELL);
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      let h = (Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663) ^ G.stage.id.length * 83492791) >>> 0;
      const r = () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0) % 10000) / 10000;
      if (r() > 0.55) continue;
      // The start stays clear.
      if (Math.abs(cx * PROP_CELL) < 260 && Math.abs(cy * PROP_CELL) < 200) continue;
      let pick = r() * total, name = list[0][0];
      for (const [n, w] of list) if ((pick -= w) < 0) { name = n; break; }
      const x = cx * PROP_CELL + Math.floor(r() * (PROP_CELL - 40)) + 20, y = cy * PROP_CELL + Math.floor(r() * (PROP_CELL - 30)) + 20;
      out.push({ prop: name, x, y });
      // Rocks, grass and jars come in little groups.
      const kind = M.prop[name][3];
      if (kind === 'rock' || kind === 'grass' || kind === 'plant' || kind === 'jar') {
        const more = Math.floor(r() * 3);
        for (let i = 0; i < more; i++) out.push({ prop: name, x: x + 18 + i * 20, y: y + Math.floor(r() * 14) - 7 });
      }
    }
  }
  return out;
}

/** A prop with its foot at (x, y); a tree goes see-through while the hero is behind it. */
function drawProp(b, p) {
  const im = images[`prop/${b.prop}.png`];
  const left = Math.round(b.x - im.width / 2), top = Math.round(b.y - im.height);
  const behind = b.prop.startsWith('tree') && p.x > left && p.x < left + im.width && p.y < b.y - 4 && p.y > top + 10;
  if (behind) ctx.globalAlpha = 0.5;
  ctx.drawImage(im, left, top);
  ctx.globalAlpha = 1;
}

/** A ground pattern for a terrain kind, drawn once per hunt. */
function makeGround(kind) {
  // 연's own floor for the terrain, one game pixel per picture pixel.
  const tile = images[`floor/${kind}.png`];
  if (tile && tile.width) return ctx.createPattern(tile, 'repeat');
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
  // The field is pixel art: it is drawn at one canvas pixel per game pixel (or the screen's
  // own pixels where that is finer) and the screen scales it up, rather than filling every one
  // of a phone's three-per-point pixels each frame (the game crawled on a phone). The framing
  // is the same either way: in 연's full-screen hunt a hero is about a sixth of the height.
  const full = window.devicePixelRatio || 1;
  const zFull = Math.max(1, Math.round(canvas.clientHeight * full / (document.body.classList.contains('yeon') ? 600 : 470) * 2) / 2);
  const r = Math.max(1, full / zFull);
  canvas.width = Math.round(canvas.clientWidth * r);
  canvas.height = Math.round(canvas.clientHeight * r);
  Z = zFull * r / full;
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
  document.body.classList.toggle('yeon', hunting && settings.panel === false);
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
      <em>필살기 ${ultLook(c.id).name}</em>
      <small>${rec ? `최고 Lv ${rec.lvl} · ${rec.kills}마리` : '기록 없음'}${promoOf(c.id) ? ` · ${promoOf(c.id)}차 승급${(PROMO_NAMES[c.id] || [])[promoOf(c.id) - 1] ? ` (${PROMO_NAMES[c.id][promoOf(c.id) - 1]})` : ''}` : ''}</small>`;
    b.onclick = () => {
      chosenClass = c;
      enterTown(c);
    };
    box.append(b);
  }
}

/** What opens a closed ground: the boss of the ground before it (or of the ground it hangs on). */
function lockReason(i) {
  const s = STAGES[i], need = s.open ? STAGES.find(x => x.id === s.open) : STAGES[i - 1];
  return need ? `${need.name}의 보스를 쓰러뜨리면 열립니다` : '앞 사냥터를 정복하면 열립니다';
}

/** The hardest ground open to the hero: by its level (the order it is hunted in). */
function bestOpenStage() {
  let best = STAGES[0], bl = -1;
  STAGES.forEach((s, i) => {
    const lvl = s.level !== undefined ? s.level : i;
    if (unlocked(i) && lvl > bl) { best = s; bl = lvl; }
  });
  return best;
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
    // The hardest ground the hero may enter now, picked and shown on its own map.
    pickedStage = bestOpenStage();
    mapTab = pickedStage.map;
  }
  for (const b of document.querySelectorAll('#map-tabs button')) b.classList.toggle('on', b.dataset.map === mapTab);
  const map = $('#map');
  map.classList.toggle('gungnae', mapTab === 'gungnae');
  map.classList.toggle('raids', mapTab === 'raid');
  if (mapTab === 'list') {
    // Every ground as a card, in the order they are hunted: its boss, its level, and plainly
    // whether it is conquered, open to try, or closed (and what opens it).
    if (pickedStage.raid) pickedStage = bestOpenStage();
    map.classList.add('raids');
    map.innerHTML = '';
    const order = STAGES.map((s, i) => [s, i, s.level !== undefined ? s.level : i]).sort((a, b) => a[2] - b[2]);
    for (const [s, i] of order) {
      const open = unlocked(i), done = !!progress.cleared[s.id];
      const b = document.createElement('button');
      b.className = 'raid stagecard' + (open ? '' : ' locked') + (s === pickedStage ? ' on' : '');
      const { pool, boss } = stageMonsters(s);
      // The boss's picture where the build has one, else the ground's strongest monster.
      const face = monsterById[boss.id] ? boss.id : (pool[pool.length - 1] || {}).id;
      b.innerHTML = `<img src="assets/mon/${face}.png" alt=""><div><b>${s.name} <small>Lv ${s.lv}</small></b>`
        + `<span class="st ${done ? 'done' : open ? 'open' : 'shut'}">${done ? '정복' : open ? '도전 가능' : '잠김'}</span>`
        + `<span>${open ? s.intro : lockReason(i)}</span></div>`;
      b.onclick = () => { pickedStage = s; buildStages(); };
      map.append(b);
    }
    const on = map.querySelector('.on');
    if (on) on.scrollIntoView({ block: 'center' });
    stageInfo();
    return;
  }
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
  // 연's own map for the tab where the build has it (the 대륙, 환상의 섬); the old one else.
  const ym = M.ymap && M.ymap[mapTab];
  map.innerHTML = ym ? `<img src="assets/ymap/${ym.file}" alt="">` : `<img src="assets/ui/${mapTab}.webp" alt="">`;
  map.classList.toggle('ymap', !!ym);
  // The goal: the first ground open and not yet conquered, named over the map wherever it is.
  const nextI = STAGES.findIndex((s, i) => unlocked(i) && !progress.cleared[s.id]);
  const goal = document.createElement('div');
  goal.id = 'map-goal';
  goal.textContent = nextI >= 0 ? `다음 목표: ${STAGES[nextI].name}` : '모든 사냥터를 정복했습니다';
  map.append(goal);
  // The town on its own map: straight back to it from here, as through the guide.
  const townAt = (M.ymap && M.ymap[mapTab] && M.ymap[mapTab].town) || (mapTab === 'gungnae' ? [0.07, 0.06] : null);
  if (townAt) {
    const t = document.createElement('button');
    t.className = 'pin town';
    t.style.left = townAt[0] * 100 + '%';
    t.style.top = townAt[1] * 100 + '%';
    t.innerHTML = '<b>마을</b><i></i><span>국내성</span>';
    t.onclick = () => enterTown(chosenClass);
    map.append(t);
  }
  STAGES.forEach((s, i) => {
    if (s.map !== mapTab) return;
    const b = document.createElement('button');
    const open = unlocked(i), done = !!progress.cleared[s.id];
    b.className = 'pin' + (open ? '' : ' locked') + (done ? ' cleared' : open ? ' next' : '')
      + (s === pickedStage ? ' on' : '');
    const at = (ym && ym.stages[s.id]) || s.at;
    b.style.left = at[0] * 100 + '%';
    b.style.top = at[1] * 100 + '%';
    b.innerHTML = `<b>${done ? '정복' : open ? '도전' : '잠김'}</b><i></i><span>${s.name}</span>`;
    b.onclick = () => {
      pickedStage = s;
      buildStages();
    };
    map.append(b);
  });
  stageInfo();
}

/** The picked ground's card beside the map or list, and the way in. */
function stageInfo() {
  const s = pickedStage, i = STAGES.indexOf(s), open = unlocked(i);
  const { pool, boss } = stageMonsters(s);
  const show = [pool[0], pool[Math.floor(pool.length / 2)], pool[pool.length - 1]].filter((m, k, a) => m && a.indexOf(m) === k);
  $('#stage-info').innerHTML = `<h3>${s.name}</h3><div class="lv">난이도 ${'★'.repeat(Math.min(5, 1 + Math.floor(i / 3)))} · 원작 적정 Lv ${s.lv}</div>
    <p>${s.intro}</p>
    <div class="mons">${show.map(m => `<img src="assets/mon/${m.id}.png" alt="">`).join('')}</div>
    <div class="boss">보스: <b>${boss.name}</b></div>
    <div class="state${progress.cleared[s.id] ? ' done' : ''}">${progress.cleared[s.id] ? '정복한 사냥터'
      : open ? '도전할 수 있는 사냥터' : `잠김: ${lockReason(i)}`}</div>`;
  pactRow(buildStages);
  $('#go').disabled = !open;
  $('#go').textContent = open ? `${josa(chosenClass.name, '으로', '로')} 입장` : '잠긴 사냥터';
}

/** The 규약 toggles under a ground's or raid's card: harder monsters for richer spoils. */
function pactRow(redraw) {
  const box = document.createElement('div');
  box.className = 'pacts';
  const k = Math.round((pactReward() - 1) * 100);
  box.innerHTML = `<small>규약 (보상 +${k}%)</small>`;
  for (const [id, pc] of Object.entries(PACTS)) {
    const b = document.createElement('button');
    b.className = 'pact' + (pactOn(id) ? ' on' : '');
    b.textContent = pc.name;
    b.title = `${pc.desc} · 보상 +${Math.round(pc.reward * 100)}%`;
    b.onclick = () => {
      settings.pacts = settings.pacts || {};
      settings.pacts[id] = !settings.pacts[id];
      saveJson('bs_settings', settings);
      redraw();
    };
    box.append(b);
  }
  $('#stage-info').append(box);
}

/** 괴력난신 spoils: two ★ cards of this week's 괴수, three clears a week. */
function gwoeCards() {
  const wk = gwoeWeek();
  if (!progress.gwoe || progress.gwoe.week !== wk) progress.gwoe = { week: wk, n: 0 };
  if (progress.gwoe.n >= 3) { say('이번 주 괴력난신 보상은 모두 받았습니다.', 'sys'); return; }
  progress.gwoe.n++;
  const key = G.boss.beast || G.stage.boss.beast;
  progress.cards = progress.cards || {};
  const mine = progress.cards[key] = progress.cards[key] || {};
  const got = [];
  for (let i = 0; i < 2; i++) {
    const slot = CARD_SLOTS[Math.floor(Math.random() * CARD_SLOTS.length)], r = Math.random();
    const star = r < 0.1 ? 3 : r < 0.4 ? 2 : 1;
    mine[slot] = Math.max(mine[slot] || 0, star);
    got.push(`[★${star}]${G.boss.name}의광기:${slot}`);
  }
  say(`괴력난신 효과: ${got.join(', ')}`, 'sys');
  const cs = cardSet();
  later(1.6, () => banner(`★ 효과 ${cs.stars}개 · 피해 +${Math.round(cs.dmg * 100)}%`));
}

/** The ★ cards: by 괴수, slot by slot, and the set they add up to. */
function openCards() {
  const box = $('#trade-rows'), cs = cardSet();
  const wk = gwoeWeek(), [, wname] = GWOE_BEASTS[wk % GWOE_BEASTS.length];
  const left = 3 - (progress.gwoe && progress.gwoe.week === wk ? progress.gwoe.n : 0);
  $('#trade-gold').textContent = `이번 주 괴수 ${wname} · 남은 보상 ${left}/3번 · 한 번에 카드 2장`;
  $('#trade-title').textContent = `괴력난신 ★ 효과 · ★${cs.stars}` + (cs.next ? ` · 다음 ★${cs.next[0]}` : ' · 모두 열림');
  box.innerHTML = '';
  const row = (name, desc) => {
    const r = document.createElement('div');
    r.className = 'trade-row';
    r.innerHTML = `<div><b>${name}</b><span>${desc}</span></div>`;
    box.append(r);
  };
  row('신력개방', CARD_SETS.map(([n, d, a, h]) => `${cs.stars >= n ? '●' : '○'}★${n} 피해 +${Math.round(d * 100)}%${a ? ` 방어 +${a}` : ''}${h ? ` 체력 +${h}` : ''}`).join(' · '));
  for (const [key, name] of GWOE_BEASTS) {
    const mine = (progress.cards || {})[key] || {};
    row(`${name}의광기`, CARD_SLOTS.map(sl => `${sl} ${mine[sl] ? '★'.repeat(mine[sl]) : '-'}`).join(' · '));
  }
  $('#trade').hidden = false;
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
  const rec = best[chosenClass.id], start = raidStart(rec);
  $('#stage-info').innerHTML = `<h3>${r.name}</h3><div class="lv">보스 ${r.boss.name} · ${RAID_BOSS_AT}초에 등장 · 8분 안에</div>
    <p>${r.intro}. 바닥이 붉게 깜빡이는 칸은 곧 내리친다: 한 칸씩 걸어 피하라.</p>
    <div class="mons"><img src="assets/mon/${r.boss.id}.png" alt=""></div>
    <div class="party">${chosenClass.name}(나) Lv ${start}부터 · 함께: ${party.join(' · ')}</div>
    <div class="boss">난이도 ${raidStars(r)} · 보상 ${RAID_GEAR[r.id].pow}등급 세트 · ${120 * r.level}전 · 레이드주화 ${10 * r.level + (r.gwoe ? 30 : 0)}</div>
    <div class="party" style="color:${combatPower(chosenClass) >= raidPower(r) ? '#1e6a10' : '#9a1800'}">권장 전투력 ${raidPower(r).toLocaleString()} · 내 전투력 ${combatPower(chosenClass).toLocaleString()}</div>
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
  pactRow(() => raidInfo(r));
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
    // The list of every ground: on the hardest one open (no map of its own to pick from).
    if (mapTab === 'list') {
      pickedStage = bestOpenStage();
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
    enemies: [], dying: [], allies: [], party: [], fxs: [], drops: [], texts: [], log: [], shots: [], sparks: [], feed: [],
    combo: { n: 0, t: 0, best: 0, pop: 0 },
    chainRun: null,
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
  if (audio) audio.play('enter'); // 연's own 'into the world' sting
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

// 괴력난신 ★ 효과: cards by 괴수 and slot (★1-★3, the best kept), all classes share them; the
// stars summed open set effects at ★12/18/27/36/40/45, as today's 신력개방.
const CARD_SLOTS = ['무기', '갑옷', '투구', '방패', '망토', '반지'];
const CARD_SETS = [[12, 0.05, 0, 0], [18, 0.1, 1, 0], [27, 0.15, 2, 0], [36, 0.2, 3, 30], [40, 0.25, 3, 40], [45, 0.3, 5, 60]];
function cardStars() {
  let n = 0;
  for (const b of Object.values(progress.cards || {})) for (const v of Object.values(b)) n += v;
  return n;
}
function cardSet() {
  const n = cardStars();
  let at = null;
  for (const c of CARD_SETS) if (n >= c[0]) at = c;
  return { stars: n, dmg: at ? at[1] : 0, armor: at ? at[2] : 0, hp: at ? at[3] : 0, next: CARD_SETS.find(c => n < c[0]) };
}
/** 전투력, as today's client shows it: the gear's ranks and stars, the 승급, the best level, the cards. */
function combatPower(cls) {
  const g = savedGear(cls), c = cls.id;
  const pw = k => (g[k + 'Sp'] && SPECIAL[g[k + 'Sp']] ? specialPower(SPECIAL[g[k + 'Sp']], c) + 0.5 * (starOf(cls, 'sp:' + g[k + 'Sp']) - 1)
    : g[k] < 0 || g[k] === undefined ? 0 : gearPower(c, k, g[k]) + 0.5 * (starOf(cls, `${k}:${g[k]}`) - 1));
  const gear = pw('weapon') * 3 + pw('armor') * 2 + pw('shield') + pw('helmet') + pw('cape');
  const set = cardSet(), rec = best[c];
  return Math.round((gear * 200 + promoOf(c) * 800 + (rec ? rec.lvl : 1) * 60) * (1 + set.dmg) * (1 + PROMO_BONUS.dmg * promoOf(c)) + set.hp * 20);
}
function raidPower(r) {
  return 1200 * r.level + 3000;
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
  const cs = cardSet(), promo = promoOf(c);
  const hp = G.cls.hp + pow('armor') * 20 + extra('helmet') * 12 + 40 * (bonus.life || 0) + cs.hp + PROMO_BONUS.hp * promo;
  p.hp += hp - (p.gearHp || G.cls.hp);
  p.maxHp += hp - (p.gearHp || G.cls.hp);
  p.gearHp = hp;
  p.armor = G.cls.armor + Math.max(0, pow('shield') + 1) + Math.round(extra('cape') / 3) + 3 * (bonus.guard || 0) + cs.armor;
  p.gearPower = (1 + 0.12 * pow('weapon')) * (1 + 0.15 * (bonus.power || 0)) * (1 + cs.dmg) * (1 + PROMO_BONUS.dmg * promo);
  // 격: what the worn pieces loose by themselves (gyeok.js), and the statuses the shields ward off.
  const gy = [];
  p.wards = new Set();
  for (const k of ['weapon', 'armor', 'shield', 'helmet', 'cape']) {
    const sp = g[k + 'Sp'] && SPECIAL[g[k + 'Sp']];
    if (!sp) continue;
    if (sp.gyeok && GYEOK[sp.gyeok]) gy.push({ id: sp.gyeok, ...GYEOK[sp.gyeok] });
    if (sp.ward) p.wards.add(sp.ward);
  }
  p.dragonCut = 0;
  if (!g.weaponSp && g.weapon === dragonTier(G.cls)) {
    const step = starOf(G.cls, `weapon:${g.weapon}`), dg = dragonGyeok(c, step);
    gy.push({ id: 'dragon', ...dg });
    p.dragonCut = dg.cdCut;
    const ss = (progress.dragonSinsu || {})[c];
    if (ss && SINSU[ss] && step >= 10) gy.push({ id: SINSU[ss].gyeok, ...GYEOK[SINSU[ss].gyeok] });
  }
  p.gyeoks = gy;
}

/** A 격's weight: the hero's own blow at their level (the 격 power multiplies it; might() is
 * added by hurtEnemy as for any blow). */
function gyeokBase() {
  return 6 + 1.2 * G.player.lvl;
}

// 격 cooldowns are 연's, a little shorter (×0.6) for a hunt of minutes.
const GYEOK_CD_K = 0.6;

/** The wearer struck ('hit') or was struck ('hurt'): each worn 격 may go off. */
function gyeokProc(on, t) {
  const p = G.player;
  if (!p.gyeoks || !p.gyeoks.length || !t || !t.m) return;
  G.gyeokCd = G.gyeokCd || {};
  for (const g of p.gyeoks) {
    if (g.on !== on || G.t < (G.gyeokCd[g.id] || 0) || Math.random() >= g.chance) continue;
    G.gyeokCd[g.id] = G.t + (g.cd || 0) * GYEOK_CD_K;
    fireGyeok(g, t);
  }
}

function fireGyeok(g, t) {
  const p = G.player, base = gyeokBase();
  const hits = g.area ? G.enemies.filter(e => Math.abs(e.tx - t.tx) <= g.area && Math.abs(e.ty - t.ty) <= g.area)
    : g.targets ? [t, ...nearestEnemies(g.targets, 5, t).filter(e => e !== t).slice(0, g.targets - 1)] : [t];
  if (g.fx && M.fx[g.fx] && fxBudget('gyeok', 3)) fxOn(g.fx, t, { scale: g.area ? 0.9 : 0.7 });
  G.procHitting = true;
  let dealt = 0;
  for (const e of hits) {
    if (e.hp <= 0) continue;
    if (g.dmg) dealt += hurtEnemy(e, base * g.dmg) || 0;
    if (g.st) applyStatus(e, ...g.st);
    if (g.st2) applyStatus(e, ...g.st2);
  }
  G.procHitting = false;
  if (g.heal) {
    heal(p.maxHp * g.heal, true);
    p.mp = Math.min(p.maxMp, p.mp + p.maxMp * g.heal);
  }
  if (g.drain && dealt) heal(dealt * g.drain * 0.25, false, true);
  if (g.self) {
    const [kind, sec, k] = g.self;
    G.buffs['g_' + kind] = G.t + sec;
    G.buffs['g_' + kind + 'K'] = k;
  }
  G.gyeokShown = { name: g.name, t: G.t };
  floatText(p.x, p.y - 78, g.name, '#ffd27a', true);
  (G.gyeokCount = G.gyeokCount || {})[g.id] = (G.gyeokCount[g.id] || 0) + 1;
  audio.play('crit');
}

/** A 상태이상 on a monster (gyeok.js STATUS): bosses shake off holds sooner and do not bleed. */
function applyStatus(e, kind, sec, k = 1) {
  if (!e || e.hp <= 0 || !STATUS[kind]) return;
  const big = e.kind === 'boss' || e.kind === 'mini';
  if (kind === 'stun' || kind === 'para' || kind === 'freeze') {
    if (big) sec *= 0.4;
    e.stun = Math.max(e.stun || 0, sec);
    cutBlast(e);
  } else if (kind === 'slow') e.slow = Math.max(e.slow || 0, sec);
  else if (kind === 'curse') e.curse = Math.max(e.curse || 0, sec);
  if (kind === 'bleed' && big) return;
  e.st = e.st || {};
  const cur = e.st[kind], live = cur && cur.until > G.t;
  e.st[kind] = { until: G.t + sec, k: Math.max(k, live ? cur.k : 0), n: kind === 'bleed' ? Math.min(10, (live ? cur.n : 0) + 1) : 1, tick: live ? cur.tick : G.t };
  if (STATUS[kind].icon) e.stIcon = kind;
}

/** Damage over time and the end of statuses, every half second. */
function tickStatus(e) {
  let any = false;
  for (const [kind, s] of Object.entries(e.st)) {
    if (s.until <= G.t) { delete e.st[kind]; continue; }
    any = true;
    if (G.t - s.tick < 0.5) continue;
    s.tick = G.t;
    const base = gyeokBase() * might(), big = e.kind === 'boss' || e.kind === 'mini';
    let d = 0;
    if (kind === 'poison') d = Math.min(e.maxHp * 0.012, base * 0.6) * s.k;
    else if (kind === 'venom') d = Math.min(e.maxHp * 0.025, base * 1.1) * s.k;
    else if (kind === 'bleed') d = e.maxHp * 0.005 * s.n;
    else if (kind === 'burn') d = base * 0.5 * s.k;
    if (big) d = Math.min(d, base * 0.8);
    if (d > 0) dotHit(e, d, STATUS[kind].color);
  }
  if (!any) { e.st = null; e.stIcon = null; }
  else if (e.stIcon && !e.st[e.stIcon]) e.stIcon = Object.keys(e.st).find(k => STATUS[k].icon) || null;
}

function dotHit(e, d, color) {
  if (e.hp <= 0) return;
  if (e.capPerSec) {
    const sec = Math.floor(G.t);
    if (e.capSec !== sec) { e.capSec = sec; e.capUsed = 0; }
    d = Math.min(d, e.maxHp * e.capPerSec - e.capUsed);
    if (!(d > 0)) return;
    e.capUsed += d;
  }
  e.hp -= d;
  e.shown = G.t;
  if (settings.numbers && G.texts.length < 70) G.texts.push({ x: e.x + rand(-6, 6), y: e.y - e.m.h * e.scale - 4, text: String(Math.round(d)), t: 0, num: true, crit: false, color });
  if (e.hp <= 0) killEnemy(e);
}

/** A boss's nature on the hero: its blows may put its status on them, unless a shield wards it. */
function heroStatus(kind, from) {
  const p = G.player;
  if (p.wards && p.wards.has(kind)) {
    if (G.t - (G.wardSaid || -9) > 3) { G.wardSaid = G.t; floatText(p.x, p.y - 78, `${STATUS[kind].name} 막음`, '#9ad8ff'); }
    return;
  }
  const sec = { poison: 4, venom: 4, bleed: 4, burn: 4, stun: 0.8, para: 0.8, freeze: 1.2, slow: 2.5, curse: 5, despair: 5, silence: 3, mark: 4 }[kind] || 3;
  p.sts = p.sts || {};
  p.sts[kind] = { until: G.t + sec, tick: G.t };
  if (G.t - (G.stSaid || -9) > 2) { G.stSaid = G.t; floatText(p.x, p.y - 78, STATUS[kind].name, '#ff9a6a'); }
}
function heroStatusOn(kind) {
  const s = G.player.sts && G.player.sts[kind];
  return !!s && s.until > G.t;
}
function tickHeroStatus() {
  const p = G.player;
  if (!p.sts) return;
  for (const [kind, s] of Object.entries(p.sts)) {
    if (s.until <= G.t) { delete p.sts[kind]; continue; }
    if (G.t - s.tick < 0.5) continue;
    s.tick = G.t;
    const d = { poison: 0.006, venom: 0.012, bleed: 0.008, burn: 0.008 }[kind];
    if (d && !G.dead) {
      p.hp -= Math.max(1, p.maxHp * d);
      if (p.hp <= 0) die();
    }
  }
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
/** 연's own icon of a piece, keyed as its 연 look is (a special by id, the 용무기 by step, else tier). */
function yItemIcon(cls, kind, t, spId) {
  const idx = M.yitemicon && M.yitemicon[cls.id] && M.yitemicon[cls.id][kind];
  if (!idx) return null;
  const key = spId ? (idx[spId] ? spId : SPECIAL[spId] ? 't' + specialBase(SPECIAL[spId], cls.id) : null)
    : kind === 'weapon' && t === dragonTier(cls) ? 'dragon' + starOf(cls, `weapon:${t}`) : 't' + t;
  const f = key && idx[key];
  return f ? 'assets/yitemicon/' + f : null;
}
function pieceIcon(cls, kind, t, spId) {
  const y = yItemIcon(cls, kind, t, spId);
  if (y) return y;
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
  // 연's own icon for the piece where the build has it.
  const y = G && yItemIcon(G.cls, g.kind, g.tier, g.sp);
  if (y) {
    const k = y.slice('assets/'.length);
    if (!(k in images)) loadImage(k);
    if (images[k] && images[k].complete && images[k].width) return images[k];
  }
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

/** The 격 and wards of a set of gear, as lines for the equipment window. */
function wornGyeok(cls, g) {
  const lines = [];
  for (const k of ['weapon', 'armor', 'shield', 'helmet', 'cape']) {
    const sp = g[k + 'Sp'] && SPECIAL[g[k + 'Sp']];
    if (!sp) continue;
    if (sp.gyeok && GYEOK[sp.gyeok]) lines.push(gyeokText(sp.gyeok));
    if (sp.ward) lines.push(`${STATUS[sp.ward].name} 막기: ${STATUS[sp.ward].name}에 걸리지 않는다`);
  }
  if (!g.weaponSp && g.weapon === dragonTier(cls)) {
    const step = starOf(cls, `weapon:${g.weapon}`), dg = dragonGyeok(cls.id, step);
    lines.push(`${dg.name}: 타격 시 ${Math.round(dg.chance * 100)}% · 고정 피해${dg.st ? ' · 저주' : ''}${dg.cdCut ? ` · 핵심 기술 재사용 -${dg.cdCut * 100}%` : ''}`);
    const ss = (progress.dragonSinsu || {})[cls.id];
    if (ss && SINSU[ss] && step >= 10) lines.push(gyeokText(SINSU[ss].gyeok));
  }
  return { lines };
}

/** 전투력 were this piece worn in place of what is worn now (the rest as it is). */
function powerWith(cls, kind, tier, sp = null) {
  progress.gear = progress.gear || {};
  const keep = progress.gear[cls.id];
  progress.gear[cls.id] = Object.assign(savedGear(cls), { [kind]: tier, [kind + 'Sp']: sp });
  const v = combatPower(cls);
  progress.gear[cls.id] = keep;
  return v;
}

/** The pieces of a kind the bag holds, as [tier, special id or null]. */
function bagPieces(cls, kind) {
  const b = bag(cls);
  const out = b.filter(x => x.startsWith(kind + ':')).map(x => [+x.split(':')[1], null]);
  if (kind === 'shield' || kind === 'helmet' || kind === 'cape') out.unshift([-1, null]);
  for (const id of b.filter(x => x.startsWith('sp:')).map(x => x.slice(3))) {
    const sp = SPECIAL[id];
    if (sp && sp.kind === kind) out.push([specialBase(sp, cls.id), id]);
  }
  return out;
}

/** Wears the strongest piece of every kind. */
function wearBest(cls) {
  for (const kind of ['weapon', 'armor', 'shield', 'helmet', 'cape']) {
    const ps = bagPieces(cls, kind);
    if (!ps.length) continue;
    const top = ps.reduce((a, q) => (powerWith(cls, kind, q[0], q[1]) > powerWith(cls, kind, a[0], a[1]) ? q : a), ps[0]);
    wear(kind, top[0], top[1]);
  }
}

/** A piece's button gets its 전투력 change against what is worn, and 추천 on the row's best. */
function markCompare(btn, cls, kind, tier, sp, now, top) {
  const d = powerWith(cls, kind, tier, sp) - now;
  const em = document.createElement('em');
  em.className = 'cmp ' + (btn.classList.contains('on') ? 'worn' : d > 0 ? 'up' : d < 0 ? 'down' : 'same');
  em.textContent = btn.classList.contains('on') ? '착용 중' : d > 0 ? `▲${d.toLocaleString()}` : d < 0 ? `▼${(-d).toLocaleString()}` : '같음';
  btn.append(em);
  if (top && !btn.classList.contains('on')) btn.classList.add('best');
}

function buildEquip() {
  const cls = G ? G.cls : chosenClass, g = savedGear(cls), b = bag(cls);
  const box = $('#equip-rows');
  box.innerHTML = '';
  const now = combatPower(cls);
  // One tap to the strongest set, where something stronger lies in the bag.
  const better = ['weapon', 'armor', 'shield', 'helmet', 'cape'].some(k => bagPieces(cls, k).some(q => powerWith(cls, k, q[0], q[1]) > now));
  if (better) {
    const bb = document.createElement('button');
    bb.className = 'btn wear-best';
    bb.textContent = '가장 강한 장비로 갈아입기';
    bb.onclick = () => { wearBest(cls); buildEquip(); };
    box.append(bb);
  }
  // The old wardrobe's hair picks do not reach a hero drawn in 연's own figure: no row for them.
  if (hasAvatars() && !(M.yhero2 && M.yhero2[cls.id])) {
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
    if ((kind === 'helmet' || kind === 'cape') && !(GEAR[cls.id][kind] || []).length
      && !b.some(x => x.startsWith('sp:') && SPECIAL[x.slice(3)] && SPECIAL[x.slice(3)].kind === kind)) continue;
    const h = document.createElement('h4');
    h.textContent = label;
    box.append(h);
    const row = document.createElement('div');
    row.className = 'equip-row';
    const tiers = b.filter(x => x.startsWith(kind + ':')).map(x => +x.split(':')[1]).sort((x, y) => x - y);
    const ps = bagPieces(cls, kind);
    const rowTop = ps.length ? ps.reduce((a, q) => (powerWith(cls, kind, q[0], q[1]) > powerWith(cls, kind, a[0], a[1]) ? q : a), ps[0]) : [];
    if (kind === 'shield' || kind === 'helmet' || kind === 'cape') tiers.unshift(-1);
    for (const t of tiers) {
      const btn = document.createElement('button');
      btn.className = 'equip' + (g[kind] === t && !g[kind + 'Sp'] ? ' on' : '');
      const icon = pieceIcon(cls, kind, t);
      const star = t < 0 ? 1 : starOf(cls, `${kind}:${t}`), dragon = kind === 'weapon' && t === dragonTier(cls);
      btn.innerHTML = (icon ? `<img src="${icon}" alt="">` : '') + `<span>${t < 0 ? '없음' : pieceName(cls, kind, t)}${star > 1 && !dragon ? ` ★${star}` : ''}</span>`;
      if (dragon) {
        const dg = dragonGyeok(cls.id, starOf(cls, `weapon:${t}`));
        const sm = document.createElement('small');
        sm.textContent = dg.name;
        btn.append(sm);
      }
      markCompare(btn, cls, kind, t, null, now, rowTop[0] === t && rowTop[1] === null);
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
      btn.innerHTML = (icon ? `<img src="${icon}" alt="">` : '') + `<span>${sp.craft ? '◆' : '★'}${specialName(sp, cls.id)}${st > 1 ? ` ★${st}` : ''}</span><small>${sp.gyeok && GYEOK[sp.gyeok] ? `${GYEOK[sp.gyeok].name}` : sp.ward ? `${STATUS[sp.ward].name} 막기` : sp.opt.text}</small>`;
      btn.title = [sp.opt.text, sp.gyeok ? gyeokText(sp.gyeok) : '', sp.ward ? `${STATUS[sp.ward].name}에 걸리지 않는다` : ''].filter(Boolean).join('\n');
      markCompare(btn, cls, kind, t, id, now, rowTop[1] === id);
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
    + ` · 방어 +${Math.max(0, pw('shield') + 1) + Math.round(ex('cape') / 3)} · 전투력 ${combatPower(cls).toLocaleString()}`
    + (opts.length ? ` · ${opts.join(' · ')}` : '');
  // The 격 worn, each with its rule (gyeok.js), and the statuses warded.
  const gys = wornGyeok(cls, g);
  let gl = $('#equip-gyeok');
  if (!gl) {
    gl = document.createElement('div');
    gl.id = 'equip-gyeok';
    $('#equip-stats').after(gl);
  }
  gl.innerHTML = gys.lines.length ? gys.lines.map(t => `<div>${t}</div>`).join('') : '<div class="none">격 없음 — 보스의 스페셜 무기·갑옷, 용무기, 전설 조합 장비에 격이 붙습니다.</div>';
}

// ---------------------------------------------------------------- 도감
//
// Every piece a class can have: the hunting grounds' line, the raids' sets and the specials,
// with where each drops and whether it is found. Searchable, filtered by grade.

let codexCls = null, codexGrade = 'all', codexOwned = false;

function codexItems(cls) {
  const b = bag(cls), out = [];
  for (const kind of ['weapon', 'armor', 'shield', 'helmet', 'cape']) {
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
    if (sp.craft && sp.craft.only && !sp.craft.only.includes(cls.id)) continue;
    const t = specialBase(sp, cls.id);
    const from = sp.craft ? `대장장이 조합: ${sp.craft.from ? specialName(SPECIAL[sp.craft.from], cls.id) + ' ★5 + ' : ''}${Object.entries(sp.craft.mats).map(([id, n]) => `${MATS[id].name} ${n}`).join(' + ')} + ${sp.craft.gold}전`
      : sp.srcName;
    out.push({ grade: sp.craft ? 'craft' : 'special', kind: sp.kind, name: specialName(sp, cls.id),
      icon: picture(craftPicture(sp, cls.id, b.includes('sp:' + sp.id) ? starOf(cls, 'sp:' + sp.id) : 1)) || gearIcon(cls.id, sp.kind, t),
      pow: specialPower(sp, cls.id), owned: b.includes('sp:' + sp.id), from,
      opt: [sp.opt.text, sp.gyeok && GYEOK[sp.gyeok] ? GYEOK[sp.gyeok].name : '', sp.ward ? `${STATUS[sp.ward].name} 막기` : ''].filter(Boolean).join(' · ') });
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
  // 레이드 상점: 레이드주화 for today's makers' goods, as the client's raid shop.
  head(`레이드 상점 · 레이드주화 ${progress.coins || 0}개`);
  const SHOP = [['scroll', 1, 5], ['kalpa', 5, 8], ['silver1', 5, 6], ['silver2', 2, 15], ['essence', 3, 20], ['silver3', 1, 120], ['pearl', 1, 60]];
  for (const [id, n, price] of SHOP) {
    row(`${MATS[id].name} ${n}개`, `레이드주화 ${price}개`, '교환', (progress.coins || 0) >= price, () => {
      progress.coins -= price;
      mats[id] = (mats[id] || 0) + n;
      progress.mats = mats;
      say(`${MATS[id].name} ${n}개로 바꿨습니다.`, 'sys');
    });
  }
  head('조합 · 재료 장비');
  const have = m => Object.entries(m).every(([id, n]) => (mats[id] || 0) >= n);
  const matText = m => Object.entries(m).map(([id, n]) => `${MATS[id].name} ${mats[id] || 0}/${n}`).join(' + ');
  for (const c of CRAFTS) {
    if (c.only && !c.only.includes(cls.id)) continue;
    const sp = SPECIAL[c.id], key = 'sp:' + c.id, got = b.includes(key);
    if (c.legend && c === CRAFTS.find(x => x.legend)) head('조합 · 전설 장비 (현대 바람의나라)');
    if (c.sinsu && c === CRAFTS.find(x => x.sinsu && (!x.only || x.only.includes(cls.id)))) head('조합 · 사신수 지존 장비 (성물 4종 → 신수의 격)');
    // An evolution is made out of its base piece at ★5, which goes into the making.
    const baseKey = c.from && 'sp:' + c.from, base = c.from && SPECIAL[c.from];
    const baseOk = !c.from || (b.includes(baseKey) && starOf(cls, baseKey) >= 5);
    const baseText = c.from ? `${specialName(base, cls.id)} ★5 (지금 ${b.includes(baseKey) ? '★' + starOf(cls, baseKey) : '없음'}) + ` : '';
    icon = picture(craftPicture(sp, cls.id, got ? starOf(cls, key) : 1));
    row(`${specialName(sp, cls.id)} (${KIND_NAME[c.kind]} ${c.pow}등급)`, `${baseText}${matText(c.mats)} + ${c.gold}전 · ${sp.opt.text}${sp.gyeok && GYEOK[sp.gyeok] ? ' · ' + GYEOK[sp.gyeok].name : ''}`,
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
  // 사신수 각인: the 용무기 at 제십 takes one 신수's nature (연's 주작의/청룡의/백호의/현무의 용X제십검).
  const dKey = `weapon:${dragonTier(cls)}`;
  if (b.includes(dKey) && starOf(cls, dKey) >= DRAGON_MAX) {
    head('사신수 각인 · 제십 용무기에 신수의 격을 새긴다');
    progress.dragonSinsu = progress.dragonSinsu || {};
    for (const [sid, sn] of Object.entries(SINSU)) {
      const now = progress.dragonSinsu[cls.id] === sid, need = { [sn.mat]: 4, essence: 5 };
      icon = picture(dragonName(cls.id, DRAGON_MAX));
      row(`${sn.name}의 ${dragonName(cls.id, DRAGON_MAX)}`, `${matText(need)} + 20000전 · ${gyeokText(sn.gyeok)}`,
        now ? '새김' : '각인', !now && have(need) && (progress.gold || 0) >= 20000, () => {
          progress.gold -= 20000;
          for (const [id, n] of Object.entries(need)) mats[id] -= n;
          progress.mats = mats;
          progress.dragonSinsu[cls.id] = sid;
          say(`${dragonName(cls.id, DRAGON_MAX)}에 ${sn.name}의 격을 새겼습니다!`, 'sys');
          banner(`${sn.name}의 ${dragonName(cls.id, DRAGON_MAX)}`);
        });
    }
  }
  head('강화 · 사본(조합 장비는 재료)으로 별을 올린다');
  // 확률 강화 (today's way, optional): half the materials, but it can fail — 손상 (spent for
  // nothing) or 부식 (a star back) — at 90% … 10% from 제일 to 제구.
  row(`확률 강화 ${settings.chanceUp ? '켜짐' : '꺼짐'}`, settings.chanceUp ? '재료 절반 · 성공 90%→10% · 실패 시 손상(재료만 잃음) 또는 부식(별 -1)'
    : '켜면 조합 장비·용무기 별을 절반 재료로, 대신 확률로 올린다', settings.chanceUp ? '끄기' : '켜기', true, () => {
    settings.chanceUp = !settings.chanceUp;
    saveJson('bs_settings', settings);
  });
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
      const sc0 = starMats(csp, star), chance = settings.chanceUp ? Math.max(0.1, 0.9 - 0.1 * (star - 1)) : 1;
      const sc = settings.chanceUp ? { mats: Object.fromEntries(Object.entries(sc0.mats).map(([k, v]) => [k, Math.max(1, Math.ceil(v / 2))])), gold: Math.ceil(sc0.gold / 2) } : sc0;
      icon = pieceIcon(cls, csp ? csp.kind : kind, csp ? specialBase(csp, cls.id) : +t, csp && csp.id);
      const next = dragon ? dragonName(cls.id, star + 1) : `★${star + 1}`;
      row(dragon ? name : `${name} ★${star}`, star >= top ? (dragon ? '최고 단계 (제십)' : '최고 별') : `${next}: ${matText(sc.mats)} + ${sc.gold}전`
        + (settings.chanceUp ? ` · 성공 ${Math.round(chance * 100)}%` : ' · 반 등급 오름'),
        star >= top ? '최고' : (dragon ? '승급' : '강화'), star < top && have(sc.mats) && (progress.gold || 0) >= sc.gold, () => {
          progress.gold -= sc.gold;
          for (const [id, n] of Object.entries(sc.mats)) mats[id] -= n;
          progress.mats = mats;
          progress.stars = progress.stars || {};
          const st = progress.stars[cls.id] = progress.stars[cls.id] || {};
          if (Math.random() >= chance) {
            // 손상 or 부식, as today's 강화 fails.
            const rust = Math.random() < 0.3 && star > 1;
            if (rust) st[key] = star - 1;
            say(rust ? `강화 실패 — 부식! ${name} 별이 하나 내려갔습니다.` : `강화 실패 — 손상. 재료만 사라졌습니다.`, 'warn');
            banner(rust ? '강화 실패 · 부식' : '강화 실패 · 손상');
            return;
          }
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
$('#equip-cards').onclick = () => openCards();

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
  el.append(skillIcon(id, fx));
  const t = document.createElement('div');
  const grown = !mine && G && G.skills.some(x => x.from === id || x.from2 === id);
  // A 승급 spell not yet opened: which conquest opens it.
  const cls = def.cls === 'all' ? null : def.cls;
  if (def.promo && cls && promoOf(cls) < def.promo) {
    const at = STAGES.find(x => x.id === PROMOS[cls][def.promo - 1].at);
    // What still closes it, all of it: the 승급 first, then the spell before it in the line.
    opts.note = `${def.promo}차 승급 · ${at.name} 정복` + (opts.note ? ` · ${opts.note}` : '');
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
  // 승급의 길: the nine steps, the ground each needs, done or not, and what they have given.
  const path = document.createElement('div');
  path.className = 'promo-path';
  path.innerHTML = `<b>승급</b> ` + PROMOS[cls.id].map((pr, i) => {
    const g = STAGES.find(x => x.id === pr.at);
    return `<span class="${tier > i ? 'done' : tier === i ? 'next' : ''}">${i + 1}차 ${g.name}</span>`;
  }).join(' › ') + `<small>승급 효과: 피해 +${Math.round(PROMO_BONUS.dmg * tier * 100)}% · 체력 +${PROMO_BONUS.hp * tier}`
    + ` (한 단계마다 +${PROMO_BONUS.dmg * 100}% · +${PROMO_BONUS.hp})</small>`;
  box.append(path);
  // 계열: the three lines of the class, spell by spell, the 승급 each needs.
  const lines = document.createElement('div');
  lines.className = 'branches';
  for (const br of BRANCHES[cls.id]) {
    const el = document.createElement('div');
    el.innerHTML = `<b>${br.name}</b> <small>${br.note}</small><span>` + br.ids.map(id => {
      const d = SKILLS[id];
      return `<i class="${(d.promo || 0) <= tier ? 'open' : ''}">${d.name}${d.promo ? `<sup>${d.promo}차</sup>` : ''}${d.evolved ? '★' : ''}</i>`;
    }).join(' → ') + '</span>';
    lines.append(el);
  }
  box.append(lines);
  // One row per 승급: 일반, the old game's 1차 to 4차, and today's 5차 to 9차.
  for (let t = 0; t <= 9; t++) {
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
      if (d.pre) {
        const q = SKILLS[d.pre[0]];
        note = (note ? note + ' · ' : '') + `${q.name}(${q.promo ? q.promo + '차' : '일반'}) 배우면 열림`;
      }
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
  if (M.yhero2 && M.yhero2[cls.id] && M.yhero2[cls.id].portrait) return `assets/yhero2/${M.yhero2[cls.id].portrait}`;
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
  if (G.buffs.g_power > G.t) k *= 1 + (G.buffs.g_powerK || 0);
  if (G.buffs.g_pierce > G.t) k *= 1 + (G.buffs.g_pierceK || 0);
  if (G.player.sts && heroStatusOn('despair')) k *= 0.8;
  if (G.buffs.power > G.t) k *= 1 + (G.buffs.powerK || 0.5);
  if (G.buffs.stealth > G.t) k *= 3;
  return k;
}

function frame(now) {
  // A slow frame now and then is caught up (up to a tenth of a second) rather than played as
  // slow motion.
  const dt = Math.min(0.1, (now - (frame.last || now)) / 1000);
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
  let rest = dt;
  if (p.stepping) {
    p.st += dt;
    const k = Math.min(1, p.st / p.sdur);
    p.x = (p.sfx + (p.tx - p.sfx) * k) * TILE + TILE / 2;
    p.y = (p.sfy + (p.ty - p.sfy) * k) * TILE + TILE - 6;
    p.walkT += dt * 1000;
    p.phase += (dt / p.sdur) * Math.PI;
    if (k < 1) return;
    p.stepping = false;
    // The time past the tile goes on into the next step: a held direction walks on without a
    // stop at every tile.
    rest = p.st - p.sdur;
  }
  if (!dx && !dy) {
    p.moving = false;
    p.pushT = 0;
    p.turnT = 0;
    return;
  }
  const walking = p.moving;
  if (p.fdx !== dx || p.fdy !== dy) {
    p.fdx = dx;
    p.fdy = dy;
    if (dx) p.face = dx;
    p.pushT = 0;
    // Standing, a new direction first turns the hero (to aim a spell); walking, it turns as it goes.
    if (!walking) {
      p.turnT = 0.1;
      return;
    }
  }
  if (p.turnT > 0) {
    p.turnT -= dt;
    return;
  }
  const nx = p.tx + dx, ny = p.ty + dy, there = occ.get(key(nx, ny));
  if (there && there.hp > 0) {
    p.moving = false;
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
  if (rest > 0 && rest < p.sdur) stepHero(dx, dy, rest);
}

/** Pixels a second the hero walks. */
function heroSpeed() {
  const p = G.player;
  const held = p.sts && (heroStatusOn('stun') || heroStatusOn('para') || heroStatusOn('freeze')) ? 0.3 : p.sts && heroStatusOn('slow') ? 0.65 : 1;
  return (TILE / 0.24) * (p.speed / 70) * (1 + 0.08 * G.passives.speed) * (1 + 0.1 * opt('speed'))
    * (G.buffs.g_speed > G.t ? 1 + (G.buffs.g_speedK || 0) : 1) * held;
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
    p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.01 * (1 + opt('regen')) * dt);
  }
  G.shake = Math.max(0, G.shake - dt);

  spawn(dt);
  moveEnemies(dt);
  if (!G.dead) {
    const chain = chainSkills();
    for (const s of G.skills) {
      // 마기지체: every spell turns 1.6 times as fast for a while.
      s.timer -= dt * (G.buffs.haste > G.t ? 1.6 : 1) * (1 + 0.08 * opt('haste'));
      // A spell in the 기술 연계 waits, ready, for the others of the chain.
      if (chain.includes(s)) {
        s.timer = Math.max(0, s.timer);
        continue;
      }
      if (s.timer <= 0) fireSkill(s, 1);
    }
    if (chain.length && !G.chainRun && chain.every(s => s.timer <= 0) && nearestEnemies(1, 7).length) startChain(chain);
    plainAttack(dt);
  }
  runTimers();
  G.allyHitting = true;
  updateAllies(dt);
  G.allyHitting = false;
  tickHeroStatus();
  updateParty(dt);
  updateShots(dt);
  updateStyle(dt);
  if (!G.dead) updatePickups(dt);
  for (const f of G.fxs) f.t += dt;
  G.fxs = G.fxs.filter(f => f.t < f.life);
  for (const d of G.dying) d.t += dt;
  G.dying = G.dying.filter(d => d.t < 1.2);
  for (const t of G.texts) {
    t.t += dt;
    if (t.t < 0.15 && !t.sum) t.y -= 40 * dt;
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
// A survivors game is a horde: the field opens full (24 even on the first ground) and swells to
// 130~190 by 5:00, the monsters in it weaker one by one (see HORDE) so they fall in a blow or two.
const FLOOR_OPEN = [24, 30, 36, 44, 52], FLOOR_FIVE = [130, 150, 170, 180, 190];
const FIELD_MAX = 420;
// The crowd of a hunt, each one: life and bite against the old one-by-one counts.
const HORDE = { hp: 1, dmg: 0.85 };

/** How many times the 860 x 400 view the field shows (1 to 2): more monsters, each worth less. */
function viewCrowd() {
  return Math.min(1.5, Math.max(1, (VW * VH) / (860 * 400)));
}

function floorCount(t) {
  // The grounds' strength runs 0 to 13, mapped onto D2 Survivors' five acts.
  const a = Math.min(4, Math.round((G.level / 13) * 4));
  // The counts were set for a view of 860 x 400; a wider view (the 연 layout, a big phone)
  // holds as many monsters a screen, not fewer.
  // The wider view's extra monsters come in over the first two minutes, not at the gate.
  const view = 1 + (viewCrowd() - 1) * Math.min(1, t / 120);
  return Math.round((FLOOR_OPEN[a] + (FLOOR_FIVE[a] - FLOOR_OPEN[a]) * Math.min(1, t / 200)) * view);
}

// ---------------------------------------------------------------- raids

/** The class's skills fitted to a level: its recorded build, or one made from its open spells. */
function applyBuild(start) {
  const cls = G.cls.id, rec = (progress.builds || {})[cls];
  const fits = (id, d) => d && (d.cls === cls || d.cls === 'all') && d.kind !== 'ult' && promoOf(cls) >= (d.promo || 0)
    && (d.req || 1) <= start;
  let list = rec ? rec.skills.filter(([id]) => fits(id, SKILLS[id])) : [];
  if (!list.length) {
    // No record yet: the class's open spells, the ones that strike first (a raid boss is not
    // felled by buffs), the newest of them, each as high as the level allows.
    // A 도사 keeps two of its heals: in a raid it is the party's healer.
    const hits = d => (d.dmg ? 0 : 1);
    const open = Object.entries(SKILLS).filter(([id, d]) => fits(id, d) && !d.evolved && d.cls === cls);
    const heals = cls === 'poet' ? open.filter(([, d]) => d.kind === 'heal').sort((a, b) => (b[1].req || 1) - (a[1].req || 1)).slice(0, 2) : [];
    list = heals.concat(open.filter(e => !heals.includes(e))
      .sort((a, b) => hits(a[1]) - hits(b[1]) || (b[1].req || 1) - (a[1].req || 1))).slice(0, 5).map(([id]) => [id, 8]);
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
/**
 * The level a hero starts a raid at: three quarters of its best, up to 33 (the 9차's spells), so
 * the 승급 spells it has earned are in its build from the start.
 */
function raidStart(rec) {
  return Math.max(1, Math.min(33, Math.floor((rec ? rec.lvl : 1) * 0.75)));
}

function raidSetup() {
  const p = G.player, rec = best[G.cls.id];
  const start = raidStart(rec);
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
  if (G.boss.beast) {
    // A 괴수: the top of its front-facing walk frame.
    const d = M.beast[G.boss.beast], bi = images[`beast/${G.boss.beast}.png`], side = Math.min(d.cell[0], d.cell[1]);
    g.drawImage(bi, (d.cell[0] - side) / 2, 0, side, side, 0, 0, c.width, c.height);
  } else {
    const side = Math.min(im.width, im.height);
    g.drawImage(im, (im.width - side) / 2, 0, side, side, 0, 0, c.width, c.height);
  }
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
    // Tougher for a party that comes in stronger (a start above Lv 20: +6% a level).
    e.hp = e.maxHp = 11000 * G.level * (1 + 0.06 * Math.max(0, G.player.lvl - 20));
    // Its bite takes a sixth of the hero's health.
    e.dmg = G.player.maxHp * 0.16 * raidK();
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
  // Its own blows at range: a dark bolt at someone other than the one it faces, so the whole
  // party takes hits and the healer has work, and every so often a blast over everyone that a
  // 마비 from the 주술사 can cut short.
  G.volleyT = (G.volleyT === undefined ? 3 : G.volleyT) - dt;
  if (G.volleyT <= 0 && !G.blast) {
    G.volleyT = [2.8, 2.2, 1.7][G.phase] * (G.enraged ? 0.7 : 1);
    const face = G.aggro && !G.aggro.down ? G.aggro : p;
    const pool = partyBodies().filter(x => x !== face);
    const tgt = pool.length ? pool[Math.floor(Math.random() * pool.length)] : face;
    b.lunge = 0.2;
    addShot(b, tgt, { color: '#c02838', glow: '#ff6a5a', size: 5, speed: 300, onHit: () => {
      const k = 0.12 * raidK() * (G.enraged ? 1.3 : 1);
      if (tgt === p) hurtPlayer(p.maxHp * k, b, true); else if (!tgt.down) hurtMember(tgt, tgt.maxHp * k);
      addFx(G.stage.fx, tgt.x, tgt.y - 20, { scale: 0.45 });
    } });
  }
  G.blastT = (G.blastT === undefined ? 12 : G.blastT) - dt;
  if (G.blastT <= 0 && !G.blast) {
    G.blastT = [15, 12, 10][G.phase];
    G.blast = { at: G.t + 1.6 };
    b.bubble = { text: '모두 쓸어 주마!', t: G.t };
    say(`${G.boss.name}이(가) 힘을 모읍니다! (광역기)`, 'warn');
    banner('광역기 준비! 마비로 끊어라');
  }
  if (G.blast && G.t >= G.blast.at) {
    G.blast = null;
    G.shake = Math.max(G.shake, 0.35);
    audio.play('boss');
    for (const x of partyBodies()) {
      const k = 0.26 * raidK() * (G.enraged ? 1.3 : 1);
      addFx(G.stage.fx, x.x, x.y - 20, { scale: 0.6 });
      if (x === p) hurtPlayer(p.maxHp * k, b, true); else hurtMember(x, x.maxHp * k);
    }
    G.groupHeal = G.t;
    say('광역기가 파티를 덮쳤습니다!', 'warn');
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
      hurtPlayer(mk.dmg, null, true);
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
  const floor = Math.round((boss ? 25 : floorCount(t)) * (pactOn('horde') ? 1.35 : 1));
  // Up to the floor at once, a few a frame.
  for (let i = 0; i < 4 && G.enemies.length < floor; i++) addEnemy(pickMonster());
  if (!boss) {
    // And on top of the floor, one a second from 0:15, two from 1:00, three from 2:00, four from 3:00.
    G.spawnT -= dt;
    if (G.spawnT <= 0) {
      G.spawnT = 1;
      // 압박: a hero who stays well (over 3/4 of its life) for 25 seconds is pressed harder, a step
      // at a time up to three (one more monster a second and 12% harder blows each); being hurt
      // eases it again. The strong are kept busy; the struggling are not piled on.
      const p = G.player, well = p.hp / p.maxHp > 0.75 && t >= 90;
      G.calm = well ? (G.calm || 0) + 1 : Math.max(0, (G.calm || 0) - 3);
      const press = Math.min(3, Math.floor(G.calm / 20));
      if (press > (G.press || 0)) {
        say(press === 3 ? '몬스터들이 사방에서 몰려듭니다!' : '몬스터들이 더 몰려듭니다!', 'warn');
        if (press >= 2) banner(press === 3 ? '압박 최고조!' : '몬스터가 몰려든다!');
      }
      G.press = press;
      const extra = (t >= 180 ? 4 : t >= 120 ? 3 : t >= 60 ? 2 : t >= 15 ? 1 : 0) + press;
      // Never far past the floor: a field that is not being thinned does not keep swelling.
      const cap = Math.min(FIELD_MAX, floor + 120);
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
    const bo = addEnemy(G.boss.m, 'boss', G.boss);
    if (!bo) {
      if (t > BOSS_AT + 30) {
        G.bossDue = false;
        G.bossT = t;
        clearStage();
      }
      return;
    }
    G.bossDue = false;
    G.bossT = t;
    // A ground's boss is a fight, however strong the hero has grown (승급, cards, gear): its life
    // grows with the hero's level and 승급, it is untouchable for its two-second entrance, and it
    // loses at most 8% of its life a second (see hurtEnemy), so it is seen and fought, never
    // gone the moment it comes.
    const grow = 1 + 0.04 * Math.max(0, G.player.lvl - 15) + 0.1 * promoOf(G.cls.id);
    bo.hp = bo.maxHp = bo.maxHp * grow;
    bo.guardT = t + 2;
    bo.capPerSec = 0.08;
    audio.play('boss');
    audio.bgm('boss');
    G.shake = 0.6;
    say(`${josa(G.boss.name, '이', '가')} 나타났습니다!`, 'warn');

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
    if (b && (since > 200 || !(b.hp > -Infinity))) {
      b.hp = 0;
      killEnemy(b);
      return;
    }
    if (b && since > 60) {
      b.hp -= b.maxHp * 0.004 * dt * 60 / 60;
      b.weak = since > 115 ? Math.pow(2, (since - 115) / 10) : 1;
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
  return [40, 105, 155, 210].map((at, i) => ({ at: at + Math.floor(Math.random() * 10), kind: kinds[i] }));
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
  // A ground may be eased a little (stage.ease, e.g. 흉가: its 99-level monsters were a wall).
  const ease = G.stage.ease || 1;
  const tough = (1 + G.level * 0.1) * (1 + t / 133) * (G.cleared ? 1.5 : 1) * ease;
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
    m, hp, maxHp: hp, kind, pack, name: named && named.name, scale: named ? named.scale : 1, weak: 1, beast: named && named.beast,
    // Seconds per tile: small monsters scurry, big ones lumber.
    stepTime: kind ? 0.7 : 0.75 - 0.35 * (1 - rank) - Math.min(0.15, t / 2000),
    // Deeper grounds bite harder: +15% a step (흉가, the 7th, twice the first).
    dmg: ((kind === 'boss' ? 13 : kind === 'mini' ? 8 : 1.5 + rank * 3) + t / 120 + G.level * 0.5) * (1 + 0.1 * G.level) * ease
      * (kind === 'champ' ? 1.5 : kind === 'mini' ? 1.25 : 1)
      // In a raid the boss's red tiles are the danger: the crowd around it strikes softer.
      * (G.stage.raid && kind !== 'boss' ? 0.6 : 1),
    xp: kind === 'boss' ? 60 : (1 + Math.floor(rank * 4 + t / 200)) * (kind === 'champ' ? 3 : kind === 'mini' ? 5 : 1),
    face: 1, phase: Math.random() * 6, flash: 0, slow: 0, stun: 0, curse: 0, cd: Math.random() * 0.5, atk: 0.6,
    lunge: 0, hits: new Map(), temper: kind && kind !== 'minion' ? (kind === 'champ' ? 'fierce' : 'normal') : temperOf(m),
  };
  const tp = TEMPERS[e.temper];
  e.stepTime *= tp.step * (pactOn('swift') ? 0.83 : 1);
  if (!kind && !G.stage.raid && !G.endless) {
    e.hp = e.maxHp = e.hp * HORDE.hp;
    e.dmg *= HORDE.dmg * (1 + 0.12 * (G.press || 0));
  }
  if (pactOn('hp')) { e.hp *= 1.4; e.maxHp *= 1.4; }
  if (pactOn('fang')) e.dmg *= 1.35;
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

// 규약, as today's 환상의시련 rules (강인한육체 …): harder monsters for richer spoils (돈·경험치·재료).
const PACTS = {
  hp: { name: '강인한육체', desc: '몬스터 체력 +40%', reward: 0.2 },
  swift: { name: '광폭한무리', desc: '몬스터 걸음 +20%', reward: 0.15 },
  horde: { name: '탐욕의무리', desc: '몬스터 수 +35%', reward: 0.25 },
  fang: { name: '날카로운이빨', desc: '몬스터 피해 +35%', reward: 0.2 },
};
function pactOn(id) {
  return !!(settings.pacts && settings.pacts[id]);
}
function pactReward() {
  return 1 + Object.keys(PACTS).filter(pactOn).reduce((a, id) => a + PACTS[id].reward, 0);
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
/**
 * A monster's temper. The original table gives it by kind, but a ground here has few kinds, so
 * each monster rolls its own: the first grounds have many timid ones, the deep ones more fierce.
 */
function temperOf(m) {
  const lv = G.stage.raid ? 12 : G.level, r = Math.random();
  const timid = Math.max(0, 0.35 - lv * 0.035) * (m.rank < 0.5 ? 1.2 : 0.8);
  const fierce = Math.min(0.3, 0.05 + lv * 0.02);
  return r < timid ? 'timid' : r > 1 - fierce ? 'fierce' : 'normal';
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
    if (e.st) tickStatus(e);
    if (e.hp <= 0) continue;
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
        e.atkAt = G.t;
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
        e.atkAt = G.t;
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
          e.atkAt = G.t;
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
        e.atkAt = G.t;
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
    const at = G.enemies.indexOf(e);
    if (at < 0) continue;
    G.enemies.splice(at, 1);
    occ.delete(key(e.tx, e.ty));
    if (e.flee) say('보물을 지닌 몬스터가 달아났습니다.');
  }
}

/** 차폐: monsters next to the hero cannot touch them while it holds. */
function barred(e) {
  return G.skills.some(s => SKILLS[s.id].kind === 'aura');
}

function hurtPlayer(dmg, from = null, pierce = false) {
  const p = G.player;
  if (G.buffs.guard > G.t || p.inv > 0) return;
  // 방어: a share of each blow, not a flat amount (taken off flat, a good shield turned every
  // monster's bite into 1): 10 cuts a third, 20 half, never more than 70%.
  // A raid boss's blows are measured on the hero's life and go through armor.
  const ac = pierce || (from && from.kind === 'boss' && G.stage.raid) ? 0 : Math.max(0, p.armor + 2 * G.passives.armor);
  let taken = Math.max(1, dmg * Math.max(0.3, 20 / (20 + ac)));
  if (G.buffs.shield > G.t) taken = Math.max(1, taken / 2);
  // 절망 on the attacker weakens its blow; 저주 on the hero lets more through; 현무의 철옹's ward.
  if (from && from.st && from.st.despair && from.st.despair.until > G.t) taken *= 0.7;
  if (p.sts && heroStatusOn('curse')) taken *= 1.25;
  if (G.buffs.g_ward > G.t) taken *= 1 - (G.buffs.g_wardK || 0);
  // A boss, its lieutenant or a champion strikes in its own nature (gyeok.js SOURCE_GYEOK).
  if (from && from.m && (from.kind === 'boss' || from.kind === 'mini' || from.kind === 'champ')) {
    // Not on the first ground, where a new hero learns the hunt; rarer from champions.
    const sg = G.stage.id !== 'novice' && SOURCE_GYEOK[G.stage.id];
    if (sg && Math.random() < (from.kind === 'champ' ? 0.1 : 0.2)) heroStatus(sg.st, from);
  }
  if (from && from.m) gyeokProc('hurt', from);
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
    * (e.st && e.st.mark && e.st.mark.until > G.t ? 1 + e.st.mark.k : 1)
    * (e.kind === 'boss' || e.kind === 'mini' ? 1 + 0.25 * opt('boss') : 1);
  if (!(dmg > 0)) return 0; // never NaN: a monster with NaN life could not die
  // 치명타: one blow in ten lands at 1.8 times, its number large and golden.
  const crit = Math.random() < 0.1;
  if (crit) { dmg *= 1.8; audio.play('crit'); }
  if (e.capPerSec) {
    // A hunt's boss: no more than its share of life a second, whatever lands on it.
    const sec = Math.floor(G.t);
    if (e.capSec !== sec) { e.capSec = sec; e.capUsed = 0; }
    dmg = Math.min(dmg, e.maxHp * e.capPerSec - e.capUsed);
    if (!(dmg > 0)) return 0;
    e.capUsed += dmg;
  }
  e.hp -= dmg;
  e.flash = 0.12;
  e.shown = G.t;
  // Numbers as 바람의나라 연 shows them: stacked over the struck, red and large for a crit,
  // orange for a heavy blow, grey for a light one.
  if (crit || settings.numbers) {
    // A burst of blows on one body (오중공격, a chain, a screen spell's ticks): the first two
    // stand alone, then one gold sum counts on above them, popping at each blow.
    const bu = e.burst && G.t - e.burst.at < 0.4 ? e.burst : (e.burst = { at: G.t, n: 0, sum: 0, txt: null });
    bu.at = G.t;
    bu.n++;
    bu.sum += dmg;
    if (bu.n >= 3 && settings.numbers) {
      if (!bu.txt || !G.texts.includes(bu.txt)) {
        bu.txt = { x: e.x, y: e.y - e.m.h * e.scale - 34, text: '', t: 0, num: true, sum: true, crit: false, color: '#ffb43a' };
        G.texts.push(bu.txt);
      }
      bu.txt.text = String(Math.round(bu.sum));
      bu.txt.t = 0;
      bu.txt.x = e.x;
    } else {
      e.numN = G.t - (e.numT || -9) < 0.6 ? Math.min(3, (e.numN || 0) + 1) : 0;
      e.numT = G.t;
      if (G.texts.length > 70) G.texts.shift();
      const heavy = dmg >= e.maxHp * 0.35;
      G.texts.push({ x: e.x + rand(-3, 3), y: e.y - e.m.h * e.scale - 10 - e.numN * 7, text: String(Math.round(dmg)), t: 0, num: true,
        crit, color: crit ? '#ff3a2a' : heavy ? '#ffb43a' : '#d8d8d8' });
    }
  }
  // 연's strike marks on the struck: a claw slash for blade classes, a burst of fire for a
  // 주술사's heavy blow; a crit stops the world for a blink. Budgeted, not on a whole crowd.
  const mark = G.cls.id === 'mage' ? ((crit || dmg >= e.maxHp * 0.35) && 'h_hit_fire')
    : G.cls.id === 'poet' ? null : 'h_hit_tiger';
  if (mark && M.fx[mark] && G.t - (e.markT || -9) > 0.3 && fxBudget('hit', 10)) {
    e.markT = G.t;
    fxOn(mark, e, { scale: mark === 'h_hit_fire' ? 0.38 : crit ? 0.6 : 0.45 });
  }
  // The hero's own blow (not a party member's, a summon's, or a 격's own) may loose a 격.
  if (!G.allyHitting && !G.procHitting) gyeokProc('hit', e);
  if (crit && !G.stage.raid && G.t - (G.hitstopAt || -9) > 0.4) {
    G.hitstop = 0.03;
    G.hitstopAt = G.t;
    G.shake = Math.max(G.shake, 0.08);
  }
  if (e.hp <= 0) killEnemy(e);
  else audio.play('hit');
  return dmg;
}

/** At most n of a kind of small flourish alive at once (each lives about 0.6 s). */
function fxBudget(kind, n) {
  const b = (G.fxBudget = G.fxBudget || {});
  const live = (b[kind] || []).filter(t => t > G.t);
  if (live.length >= n) { b[kind] = live; return false; }
  live.push(G.t + 0.6);
  b[kind] = live;
  return true;
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
    let n = matCount(id, e.kind, !!G.stage.raid);
    if (n && Math.random() < pactReward() - 1) n++; // 규약: richer spoils
    for (let i = 0; i < n; i++) G.drops.push({ x: e.x + (i - n / 2) * 14, y: e.y + 6, kind: 'mat', mat: id });
  }
}

const COMBO_AT = [50, 100, 200, 300, 500, 800, 1200];

function killEnemy(e) {
  // Each monster dies once: a second call (two blows landing in the same instant) must not
  // count it again, nor — through indexOf -1 — take the last monster in the list (often the
  // boss, the newest) off the field with it.
  const at = G.enemies.indexOf(e);
  if (at < 0) return;
  G.kills++;
  // 이동기 한방컷 (연's 차사): a foe felled just after a dash brings the next dash sooner.
  if (G.dashAt !== undefined && G.t - G.dashAt < 0.6) G.dashAt -= 0.35;
  // 연속 처치: kills within three seconds of each other chain; the round numbers are called out.
  const c = G.combo;
  c.n = G.t - c.t < 3 ? c.n + 1 : 1;
  c.t = G.t;
  c.pop = G.t;
  c.best = Math.max(c.best, c.n);
  if (COMBO_AT.includes(c.n)) {
    // The closing sweep counts on, but the 정복 banner stays up.
    if (!(G.sweepUntil && G.t < G.sweepUntil + 3)) banner(`연속 처치 ${c.n}!`);
    // 연's kill-streak voice, one step louder at each mark.
    audio.play('combo', null, COMBO_AT.indexOf(c.n) + 1);
    G.flash = G.t;
    G.shake = Math.max(G.shake, 0.15);
    audio.play('levelup');
    if (c.n >= 100) emote(c.n >= 300 ? 'godgame' : 'gains', G.player);
  }
  rollSpecial(e);
  rollMats(e);
  // For the 의뢰: every kill counts, by ground, and bosses by ground.
  const st = qstats();
  st.kills++;
  st.stageKills[G.stage.id] = (st.stageKills[G.stage.id] || 0) + 1;
  if (e.kind === 'boss') st.bosses[G.stage.id] = (st.bosses[G.stage.id] || 0) + 1;
  G.enemies.splice(at, 1);
  occ.delete(key(e.tx, e.ty));
  // The body is thrown a little away from the hero as it falls.
  const kp = G.player, kl = Math.hypot(e.x - kp.x, e.y - kp.y) || 1;
  const dy = { e, t: 0, kx: (e.x - kp.x) / kl, ky: (e.y - kp.y) / kl };
  // 연's kill burst on the fallen, a few at a time.
  if (M.fx.h_kill && fxBudget('kill', 6)) {
    dy.popped = true;
    fxOn('h_kill', e, { scale: e.kind ? 0.8 : 0.55 });
  }
  G.dying.push(dy);
  // 몰이: a kill stirs the shy ones nearby, so the pack gathers on the hero.
  for (const o of G.enemies) if (!o.provoked && Math.abs(o.tx - e.tx) + Math.abs(o.ty - e.ty) <= 3) o.provoked = true;
  audio.play('kill');
  const p = G.player;
  // A kill gives a little mana, but not the kills of a 필살기 itself (a screen of them refilled it
  // at once, and it could be thrown again and again).
  if (G.t - (G.ultAt === undefined ? -99 : G.ultAt) > 3) p.mp = Math.min(p.maxMp, p.mp + 0.6);
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
  // 투구 and 망토 drop too (a little rarer than the weapon, armour and shield), from their own lines.
  const line = GEAR[G.cls.id];
  const kinds = ['weapon', 'armor', 'shield', 'weapon', 'armor', 'shield', 'helmet', 'cape']
    .filter(k => (line[k] || []).length && plainList(G.cls.id, k).length);
  const kind = kinds[Math.floor(Math.random() * kinds.length)];
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
    // 레이드주화 for the raid shop (in the smith's window).
    const coins = 10 * G.level + (G.stage.gwoe ? 30 : 0);
    progress.coins = (progress.coins || 0) + coins;
    say(`레이드주화 ${coins}개를 받았습니다.`, 'sys');
    if (G.stage.gwoe) gwoeCards();
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
  sweepField();
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

/**
 * The end of a hunt, as survivors-likes close one: the monsters still on screen fall in a wave
 * running out from the hero (their experience counts, their drops fall), then everything lying
 * on the field flies to the hero at once.
 */
function sweepField() {
  const p = G.player, run = G;
  const reach = Math.hypot(VW, VH) * 0.6;
  for (const e of G.enemies.slice()) {
    if (e.kind === 'boss') continue;
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (d > reach) continue;
    later(0.15 + d / 700, () => { if (G === run && !G.dead) killEnemy(e); });
  }
  G.shake = Math.max(G.shake, 0.25);
  G.vacuumAt = G.t + 0.15 + reach / 700 + 0.2;
  G.vacuumEnd = G.vacuumAt + 4;
  G.sweepUntil = G.vacuumAt + 1.2;
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

/** One spell going off: its wait starts again and it is cast, k times as strong. */
function fireSkill(s, k) {
  const p = G.player;
  const st = stats(s);
  // 용무기 제구·제십: the class's core spell comes sooner (the original's 광폭, 파천검무, 헬파이어·삼매, 백호의희원).
  if (G.player.dragonCut && (DRAGON_CORE[G.cls.id] || []).includes(s.id)) st.cd *= 1 - G.player.dragonCut;
  s.cdMax = st.cd;
  s.timer += st.cd;
  if (s.timer < 0) s.timer = st.cd;
  if (st.dmg) st.dmg *= k;
  // A 도사 alone has no one to keep alive: its strikes are what it has (+35% without a party).
  if (G.cls.id === 'poet' && !G.party.length && st.dmg) st.dmg *= 1.35;
  // In a raid the 전사 is the party's main blade: its strikes cut the boss more than twice as deep
  // (its spells hit one or a few; the others' sweep the room, so a boss fight would drag).
  if (G.cls.id === 'warrior' && G.stage.raid && st.dmg) st.dmg *= 1.8;
  cast(s, st);
  // 전사의 보스 집중: in a raid every strike of the 전사 also lands on the boss beside it
  // (its sweeps would otherwise go into the boss's servants, and the fight would drag).
  if (G.cls.id === 'warrior' && G.stage.raid && st.dmg) {
    const bo = G.enemies.find(e => e.kind === 'boss' && e.hp > 0 && tdist(e, p) <= 5);
    if (bo) later(0.2, () => { if (bo.hp > 0) hurtEnemy(bo, st.dmg * 0.8); });
  }
}

// ---------------------------------------------------------------- 기술 연계 (바람의나라 연)
// 연's skill chain: the spells set in a chain wait until all of them are ready, then go off one
// after another ahead of everything else, while a little window shows the chain running. Here
// the chain is the hero's slowest strikes (two or three, each 2.5 seconds or more); the rest
// keep firing alone.
// Before a chain the 전사 and 도적 use 유인, drawing the foes around them into one heap first.

const CHAIN_GAP = 0.2, CHAIN_POWER = 1.25;

/** The spells of the chain: the three with the longest wait among those that strike. */
function chainSkills() {
  if (G.stage.raid && G.party.length) return [];
  // Only the big, slow strikes: a quick blow (이중공격) held back for them would lose its hits.
  const strikes = G.skills.filter(s => {
    const def = SKILLS[s.id];
    return def && !['ult', 'buff', 'aura', 'passive', 'heal'].includes(def.kind) && stats(s).dmg > 0 && stats(s).cd >= 2.5;
  });
  if (strikes.length < 2) return [];
  return strikes.map(s => [s, stats(s).cd]).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([s]) => s);
}

function startChain(chain) {
  const melee = MELEE.has(G.cls.id);
  const lead = melee ? lure() : 0;
  G.chainRun = { ids: chain.map(s => s.id), at: G.t + lead, done: 0, end: G.t + lead + chain.length * CHAIN_GAP + 1 };
  chain.forEach((s, i) => later(lead + i * CHAIN_GAP, () => {
    if (G.dead || !G.skills.includes(s)) return;
    fireSkill(s, CHAIN_POWER);
    if (G.chainRun) G.chainRun.done = i + 1;
  }));
  later(lead + chain.length * CHAIN_GAP + 1, () => { G.chainRun = null; });
}

/** 유인: the foes within five tiles slide in to the tiles around the hero; the time it takes. */
function lure() {
  const p = G.player;
  const foes = G.enemies.filter(e => !e.kind && e.hp > 0 && tdist(e, p) <= 5 && tdist(e, p) > 1)
    .sort((a, b) => tdist(a, p) - tdist(b, p)).slice(0, 14);
  if (!foes.length) return 0;
  const ring = [];
  for (let r = 1; r <= 3; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) === r) ring.push([p.tx + dx, p.ty + dy]);
    }
  }
  for (const e of foes) {
    const spot = ring.filter(([x, y]) => free(x, y) && Math.hypot(x - p.tx, y - p.ty) < tdist(e, p))
      .sort((a, b) => Math.hypot(a[0] - e.tx, a[1] - e.ty) - Math.hypot(b[0] - e.tx, b[1] - e.ty))[0];
    if (!spot) continue;
    occ.delete(key(e.tx, e.ty));
    e.fx = e.tx;
    e.fy = e.ty;
    e.tx = spot[0];
    e.ty = spot[1];
    occ.set(key(e.tx, e.ty), e);
    e.mt = 0;
    e.dur = 0.22;
    e.moving = true;
  }
  shout('유인');
  return 0.28;
}

/** 연's 기술 연계 window while a chain runs: its spells' icons in order, lit as each goes off. */
function drawChain() {
  const c = G.chainRun;
  if (!c || G.dead) return;
  const cr = canvas.getBoundingClientRect(), d = canvas.width / cr.width;
  const sz = 26 * d, gap = 4 * d, n = c.ids.length;
  const w = n * sz + (n - 1) * gap + 12 * d, h = sz + 24 * d;
  const x = 8 * d, y = 64 * d;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgb(148,48,219)';
  ctx.lineWidth = d;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.font = `bold ${Math.round(10 * d)}px G9`;
  ctx.textAlign = 'left';
  outline('기술 연계', x + 6 * d, y + 13 * d, '#ffe070');
  c.ids.forEach((id, i) => {
    const ix = x + 6 * d + i * (sz + gap), iy = y + 18 * d;
    const im = skillIconImage(id);
    if (im && im.width) ctx.drawImage(im, ix, iy, sz, sz);
    if (i >= c.done) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(ix, iy, sz, sz);
    }
    ctx.strokeStyle = i === c.done - 1 ? '#ffe070' : '#000';
    ctx.lineWidth = (i === c.done - 1 ? 2 : 1) * d;
    ctx.strokeRect(ix, iy, sz, sz);
  });
  ctx.restore();
}

/** How far, in tiles, a picture reaches from its centre as drawn (most of its half-width): a
 *  spell strikes as far as it is seen to (연's great effects are far wider than the old reach). */
function seenReach(fxid, scale = 1) {
  const f = M.fx[fxid];
  if (!f) return 0;
  return (Math.min(f.w, f.h * 1.6) * (f.k || 1) * scale) / 2 / TILE * 0.85;
}

function cast(skill, st) {
  const def = SKILLS[skill.id];
  // The spell's picture at this level (the site draws each grade of 신수마법 and 기원 differently).
  // 4차 승급 spells, the last of the tree, show today's client effect when the build has it.
  // 5차+ spells draw their effect in their own colour (s_<id>, made at boot from def.tint).
  const fxBase = def.yeon ? def.fx : def.modern && M.fx[def.modern] ? def.modern : def.promo === 4 && M.fx['new_' + skill.id] ? 'new_' + skill.id
    : def.fxs ? def.fxs[Math.min(skill.lv, def.fxs.length) - 1] : M.fx['s_' + skill.id] ? 's_' + skill.id : def.fx;
  // A spell grows with its 단, as a survivors weapon does: its picture 6% larger a step.
  const fxid = grownFx(fxBase, skill.lv);
  classFlourish(def, skill, st);
  const p = G.player;
  // A boss close by and the hero standing: it turns to the boss for the spells that go ahead of it
  // (in a raid the boss is the fight; a warrior's 백호참 or 동귀어진 should not cut the air).
  if (['cleave', 'line', 'slash', 'blink'].includes(def.kind) && !p.stepping) {
    const bo = G.enemies.find(e => e.kind === 'boss' && tdist(e, p) <= 4);
    if (bo) {
      const dx = bo.tx - p.tx, dy = bo.ty - p.ty;
      if (Math.abs(dx) >= Math.abs(dy)) { p.fdx = Math.sign(dx) || 1; p.fdy = 0; p.face = p.fdx; } else { p.fdx = 0; p.fdy = Math.sign(dy); }
    }
  }
  let used = true;
  // No target yet: try again shortly. The spell is ready, only waiting, so its slot is not
  // darkened (it flickered dark and light while the field was empty).
  const retry = t => {
    used = false;
    skill.timer = t;
    skill.waiting = true;
  };
  skill.waiting = false;
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
      // Its own blows (def.count) on the one it lands by; the targets the 단 add go to others
      // beside it, not again on the same (on a lone boss that tripled the blow).
      for (let i = 0; i < (def.count || 1); i++) {
        later(i * 0.12, () => {
          if (e.hp <= 0) return;
          fxOn(fxid, e);
          if (def.curse) e.curse = def.curse;
          hurtEnemy(e, st.dmg);
        });
      }
      const others = around(e.tx, e.ty, 1).filter(o => o !== e && o.hp > 0).slice(0, Math.max(0, st.count - (def.count || 1)));
      others.forEach((o, i) => later(0.1 + i * 0.1, () => { if (o.hp > 0) { fxOn(fxid, o); hurtEnemy(o, st.dmg); } }));
      break;
    }
    case 'spell': {
      let targets = nearestEnemies(st.count * 3, st.range);
      if (def.weakest) targets.sort((a, b) => a.hp - b.hp);
      targets = targets.slice(0, st.count);
      if (!targets.length) return retry(0.25);
      targets.forEach((e, i) => later(i * 0.08, () => {
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
      // 탈명 and its kind take the strongest in reach (a boss before its followers); the rest fall
      // where they will.
      const targets = nearestEnemies(st.count * 3, st.range)
        .sort(def.strongest ? (a, b) => b.maxHp - a.maxHp : () => Math.random() - 0.5).slice(0, st.count);
      if (!targets.length) return retry(0.3);
      targets.forEach((e, i) => {
        const tx = e.tx, ty = e.ty;
        const life = fxOn(fxid, e, { delay: i * 0.12 });
        later(i * 0.12 + life * (def.hitAt || 0.3), () => {
          G.shake = Math.max(G.shake, 0.08);
          const hit = def.shape === 'plus' ? onTiles(plusTiles(tx, ty, Math.max(1, st.radius))) : around(tx, ty, st.radius);
          for (const o of hit) {
            if (def.slow) o.slow = def.slow;
            if (def.stun) { o.stun = def.stun; cutBlast(o); }
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
      // As far as the picture is seen to reach round its middle, too.
      const reach = seenReach(fxid, Math.min(1.6, 0.7 + depth * 0.25));
      if (reach > depth) {
        const cx = p.tx + Math.round(dx * mid), cy = p.ty + Math.round(dy * mid);
        for (const e of around(cx, cy, reach)) if (!hit.includes(e)) hit.push(e);
      }
      later(0.12, () => {
        G.shake = Math.max(G.shake, 0.1);
        for (const e of hit.slice(0, def.max || 99)) {
          if (def.stun) { e.stun = def.stun; cutBlast(e); }
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
      // As 바람의나라 연 draws its great spells: the picture rains all over the screen in waves.
      scatterFx(fxid, 14, 1.3);
      all.slice(0, M.fx[fxid] && M.fx[fxid].cls === 'yeon' ? 3 : 10).forEach((e, i) => fxOn(fxid, e, { delay: 0.05 * i, scale: M.fx[fxid] && M.fx[fxid].cls === 'yeon' ? 0.6 : 0.9 }));
      later(0.35, () => {
        G.shake = Math.max(G.shake, 0.25);
        for (const e of all) {
          if (e.hp <= 0) continue;
          if (def.slow) e.slow = def.slow;
          if (def.curse) e.curse = def.curse;
          if (def.stun) { e.stun = def.stun; cutBlast(e); }
          // 포효검황: weaker with every tile away.
          const far = def.falloff ? Math.max(0.2, 1 - def.falloff * tdist(e, p)) : 1;
          hurtEnemy(e, st.dmg * far);
        }
      });
      break;
    }
    case 'nova': {
      if (def.hpCost) p.hp = Math.max(1, p.hp * (1 - def.hpCost));
      const nf = M.fx[fxid];
      addFx(fxid, 0, -26, { follow: true, scale: nf && nf.cls === 'yeon' ? 1 : nf && nf.add ? 2.2 : 1.4 });
      // A ring of the picture round the hero, out to the spell's reach (light pictures only).
      for (let k = 0; k < (nf && nf.add && nf.cls !== 'yeon' ? 8 : 0); k++) {
        const a = (k / 8) * Math.PI * 2, r = (st.radius || 2) * TILE;
        addFx(fxid, p.x + Math.cos(a) * r, p.y - 20 + Math.sin(a) * r * 0.7, { delay: 0.04 * k, scale: 1.3 });
      }
      // It strikes as far as its picture is seen to spread, if that is past its own reach.
      const novaScale = nf && nf.cls === 'yeon' ? 1 : nf && nf.add ? 2.2 : 1.4;
      const reach = Math.max(st.radius || 0, nf && nf.cls === 'yeon' ? seenReach(fxid, novaScale) : 0);
      later(0.1, () => {
        for (const e of around(p.tx, p.ty, reach)) {
          if (def.stun) { e.stun = def.stun; cutBlast(e); }
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
      // A 도사 hero in a raid is the party's healer: its 기원 reach everyone standing.
      if (G.stage.raid && G.cls.id === 'poet') for (const m of G.party) if (m !== low && !m.down) healMember(m, m.maxHp * st.heal / p.maxHp * 0.6);
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
    const melee = def.kind === 'slash' || def.kind === 'blink' || (def.kind === 'spell' && G.cls.id === 'warrior')
      || (WEAPON_POSE.has(G.cls.id) && !['buff', 'heal'].includes(def.kind));
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
/** The 필살기 grows with 승급: the class's great spell of its highest tier, by its own name and
 * picture (건곤대나이 → 혈겁만파 → 광야건곤 → 흑룡광참 → 만검귀종 for the 전사), stronger a tier. */
const ULT_PATH = {
  warrior: [[0, 'w_ult'], [4, 'w_blood'], [5, 'w_rush'], [8, 'w_blackdragon'], [9, 'w_myriad']],
  rogue: [[0, 'r_ult'], [4, 'r_heaven'], [6, 'r_shuriken'], [7, 'r_kill'], [9, 'r_gale']],
  mage: [[0, 'm_ult'], [4, 'm_fire3'], [6, 'm_twin'], [7, 'm_inferno'], [9, 'm_kalpa']],
  poet: [[0, 'p_ult'], [4, 'p_phoenix'], [6, 'p_burst'], [7, 'p_bagua'], [9, 'p_taiji']],
  archer: [[0, 'a_ult'], [4, 'a_allwhirl'], [5, 'a_inferno'], [9, 'a_blood5']],
  lancer: [[0, 'l_ult'], [4, 'l_genesis'], [6, 'l_annihil'], [9, 'l_moonfull']],
  monk: [[0, 'mk_ult'], [4, 'mk_buddha'], [5, 'mk_combo'], [9, 'mk_aventhit']],
  magus: [[0, 'md_ult'], [4, 'md_exfrenzy'], [5, 'md_bloodbat'], [9, 'md_wavefrenzy']],
};
function ultLook(cls) {
  const base = SKILLS[CLASSES.find(c => c.id === cls).ult], promo = promoOf(cls);
  let id = null;
  for (const [at, sid] of ULT_PATH[cls] || []) if (promo >= at && SKILLS[sid]) id = sid;
  const d = SKILLS[id] || base;
  const fx = d.yeon ? d.fx : d.modern && M.fx[d.modern] ? d.modern : d.fxs ? d.fxs[d.fxs.length - 1] : d.fx;
  return { ...base, id: id || CLASSES.find(c => c.id === cls).ult, name: d.name, fx: M.fx[fx] ? fx : base.fx };
}
function ultIcon(cls) {
  const l = ultLook(cls);
  if (M.skillicon && M.skillicon.includes(l.id)) return `assets/skillicon/${l.id}.png`;
  const d = SKILLS[l.id];
  const fx = d.fxs ? d.fxs[d.fxs.length - 1] : d.fx;
  return `assets/icon/${fx}.png`;
}

/** The way the class's 필살기 strikes: 'hunt' (the whole screen) or 'boss' (one, eight times as hard). */
function ultMode(cls) {
  return (settings.ultMode && settings.ultMode[cls]) || 'hunt';
}
function toggleUltMode() {
  if (!G) return;
  settings.ultMode = settings.ultMode || {};
  settings.ultMode[G.cls.id] = ultMode(G.cls.id) === 'hunt' ? 'boss' : 'hunt';
  saveJson('bs_settings', settings);
  syncUltMode();
  say(`필살기: ${ultMode(G.cls.id) === 'hunt' ? '사냥용 (화면 전체)' : '보스용 (가장 강한 적 하나에 8배)'}`, 'sys');
}
function syncUltMode() {
  const b = $('#ult-mode');
  if (b && G) b.textContent = ultMode(G.cls.id) === 'hunt' ? '사냥' : '보스';
}

/** Seconds until the 필살기 may be thrown again (at least 25 between two, whatever the mana). */
const ULT_REST = 25;
// Each class's 필살기 against a boss: a single-target technique of its own (from 연's skills).
// The close-in classes: they leap to the foe (돌진, the 필살기's boss blows) and lure before a chain.
const MELEE = new Set(['warrior', 'rogue', 'lancer', 'monk']);
// Classes whose every damaging technique is their weapon's own attack clip (연's bow draw, spear thrust).
const WEAPON_POSE = new Set(['archer', 'lancer', 'monk']);
const BOSS_ULT = { warrior: 'w_jinseom', rogue: 'r_amsal', mage: 'm_seongryeo', poet: 'p_jiroe', archer: 'a_aim', lancer: 'l_meteor', monk: 'mk_sudden', magus: 'md_arrow' };
function ultWait() {
  return G && G.ultAt !== undefined ? Math.max(0, ULT_REST - (G.t - G.ultAt)) : 0;
}

/** What the 필살기 button shows: the 보스 technique in 보스 mode, the hunting 필살기 else. */
function ultShown(cls) {
  if (ultMode(cls) === 'boss' && SKILLS[BOSS_ULT[cls]]) {
    const id = BOSS_ULT[cls];
    const icon = M.skillicon && M.skillicon.includes(id) ? `assets/skillicon/${id}.png` : ultIcon(cls);
    return { name: SKILLS[id].name, icon };
  }
  return { name: ultLook(cls).name, icon: ultIcon(cls) };
}

function castUlt() {
  if (!G || G.over || G.dead || G.paused || G.choosing) return;
  const p = G.player;
  if (p.mp < p.maxMp || ultWait() > 0) return;
  G.ultAt = G.t;
  const def = ultLook(G.cls.id);
  p.mp = 0;
  if (def.hpCost) p.hp = Math.max(1, p.hp * (1 - def.hpCost));
  const shownName = ultShown(G.cls.id).name;
  G.bubble = { text: `${shownName}!`, t: G.t };
  strikePose(MELEE.has(G.cls.id) || WEAPON_POSE.has(G.cls.id) ? 'attack' : 'magic');
  say(`${shownName}!`);
  audio.play('skill_' + def.id, 'ult');
  G.shake = 0.5;
  // The 필살기 fills the screen, as 연's great spells do: its picture huge over the hero, a flash.
  if (ultMode(G.cls.id) === 'hunt') {
    addFx(grownFx(def.fx, 8), 0, -26, { follow: true, scale: 2.4 });
    scatterFx(grownFx(def.fx, 8), 10, 1.5);
  }
  const lvl = p.lvl, pw = (1 + 0.1 * G.passives.power) * (1 + 0.15 * promoOf(G.cls.id));
  const v = viewTiles();
  const onScreen = () => G.enemies.filter(e => Math.abs(e.tx - p.tx) <= v.w && Math.abs(e.ty - p.ty) <= v.h);
  // The 필살기's two ways, switched by the player at the button: 사냥 strikes everything on the
  // screen, 보스 puts eight times the blow into the strongest foe in sight (and a little around it).
  const mode = ultMode(G.cls.id);
  const base = (G.cls.id === 'warrior' ? p.maxHp * 0.9 : 60 + lvl * 12) * pw;
  const seen = onScreen();
  if (mode === 'boss') {
    // A technique of its own against the strongest foe: 진섬격, 암살, 성려멸주 or 지뢰진 — five
    // quick blows on it, each with that spell's 연 effect, the 전사 and 도적 leaping to it first.
    const rank = e => (e.kind === 'boss' ? 4 : e.kind === 'mini' ? 3 : e.kind === 'champ' ? 2 : 1) * 1e9 + e.hp;
    const target = seen.slice().sort((a, b) => rank(b) - rank(a))[0];
    const tech = BOSS_ULT[G.cls.id], tfx = M.fx['k_' + tech] ? 'k_' + tech : def.fx;
    G.bubble = { text: `${SKILLS[tech] ? SKILLS[tech].name : def.name}!`, t: G.t };
    if (target) {
      if (MELEE.has(G.cls.id)) {
        const spot = DIRS.map(([dx, dy]) => [target.tx + dx, target.ty + dy]).filter(([x, y]) => free(x, y))
          .sort((a, b) => Math.hypot(a[0] - p.tx, a[1] - p.ty) - Math.hypot(b[0] - p.tx, b[1] - p.ty))[0];
        if (spot) {
          p.x = spot[0] * TILE + TILE / 2;
          p.y = spot[1] * TILE + TILE - 6;
          heroTile();
          p.inv = Math.max(p.inv, 1.2);
        }
      }
      for (let k = 0; k < 5; k++) {
        later(0.15 + k * 0.22, () => {
          if (target.hp <= 0) return;
          fxOn(tfx, target, { scale: 1.2 });
          hurtEnemy(target, base * 1.6);
          G.shake = Math.max(G.shake, 0.12);
          if (k === 4) around(target.tx, target.ty, 1.5).forEach(e => { if (e !== target && e.hp > 0) hurtEnemy(e, base); });
        });
      }
    }
  } else {
    seen.slice(0, 14).forEach((e, i) => fxOn(def.fx, e, { delay: i * 0.04 }));
    later(0.4, () => seen.forEach(e => { if (e.hp > 0) hurtEnemy(e, base); }));
  }
  // What each class's 필살기 brings besides the blow.
  switch (G.cls.ult) {
    case 'm_ult': {
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

// 바람의나라 연's town (tools/yeon_town.py), where the build has it: 국내성's market square at
// its own 32-pixel tiles, walked by its own walk grid, its people 연's 국내성 NPCs — 털보 the smith,
// 떼보 of the armour stall, 왈숙 이모 of the inn, the palace lady who points the way to the
// hunting grounds and the notice board of the town's 의뢰.
const YTOWN_LOOK = { smith: 'smith', merchant: 'merchant', inn: 'inn', guide: 'guide', clerk: 'clerk' };
const YTOWN_NAME = { smith: '털보', merchant: '떼보', inn: '왈숙 이모', guide: '궁인', clerk: '알림판' };
// 국내성 as 연 joins its maps: the market square is the hub, its doors' warp floors lead into
// 털보's smithy, 떼보's armour shop and 왈숙 이모's inn (each 연's own map, left by its own exit
// warp), and its gates are portals to the hunting grounds — each opens the grounds of its region.
const WARP_R = 18;

/** The town's people of the area the hero is in, where they stand (feet). */
function townFolk(area) {
  const yt = M.ui.ytown;
  return TOWNSFOLK.map(n => {
    if (yt && yt.spots[n.id]) {
      const sp = yt.spots[n.id];
      return { ...n, x: sp.x, y: sp.y, area: sp.area, look: YTOWN_LOOK[n.id], label: YTOWN_NAME[n.id] || n.name };
    }
    return { ...n, x: n.tx * TOWN_TILE + TOWN_TILE / 2, y: n.ty * TOWN_TILE + TOWN_TILE - 6, label: n.name };
  }).filter(n => !yt || n.area === area);
}

/** The area of 연's town the hero stands in (null: the old town). */
function townArea() {
  return M.ui.ytown ? M.ui.ytown.areas[T.area] : null;
}

/** Moves the hero to another area of the town, standing at (x, y). */
function goArea(area, x, y, fdy) {
  T.area = area;
  T.x = x;
  T.y = y;
  T.fdx = 0;
  T.fdy = fdy;
  T.folk = townFolk(area);
  T.near = null;
  $('#talk').hidden = true;
  // Arrived on a warp floor: it takes the hero nowhere until stepped off.
  T.warpLock = true;
  audio && audio.play('enter');
}

function enterTown(cls) {
  chosenClass = cls;
  if (!M.ui.town && !M.ui.ytown) {
    showScreen('stages');
    return;
  }
  const gear = savedGear(cls);
  const yt = M.ui.ytown;
  const sp = yt ? yt.areas.market.spawn : [7.5 * TOWN_TILE, 5 * TOWN_TILE - 6];
  T = { cls, av: hasAvatars() ? dressed(cls, gear) : null, x: sp[0], y: sp[1], fdx: 0, fdy: yt ? -1 : 1, moving: false,
    walkT: 0, near: null, area: 'market' };
  T.folk = townFolk('market');
  showScreen('town');
  audio.bgm('town');
  $('#town-gold').textContent = `${progress.gold || 0}전`;
  $('#town-name').textContent = `국내성 · ${cls.name}`;
}

function townBlocked(x, y) {
  const m = townArea();
  if (m) {
    const tx = Math.floor(x / m.tile), ty = Math.floor((y - 2) / m.tile);
    if (tx < 0 || ty < 0 || tx >= m.cols || ty >= m.rows || m.walk[ty][tx] !== '.') return true;
    // The guardian statue stands on its base: the hero walks up to it, not through it.
    if (T.area === 'market' && M.ui.ytown.portals.some(pt => pt.art === 'statue' && Math.abs(pt.x - x) < 16 && y < pt.y - 12 && y > pt.y - 40)) return true;
    return T.folk.some(n => Math.abs(n.x - x) < 14 && y > n.y - 14 && y < n.y + 6);
  }
  const tx = Math.floor(x / TOWN_TILE), ty = Math.floor((y - 4) / TOWN_TILE);
  if (tx < 0 || ty < 0 || tx > 15 || ty > 9) return true;
  return TOWN_WALLS.has(`${tx},${ty}`) || TOWNSFOLK.some(n => n.tx === tx && n.ty === ty);
}

/** A portal's gate opens the hunting grounds of its region, its tab chosen. */
function openPortal(tab) {
  showScreen('stages');
  const b = document.querySelector(`#map-tabs button[data-map="${tab}"]`);
  if (b) b.click();
}

/** The warp floors under the hero's feet: doors between areas, the gates out of town. */
function townWarps() {
  const yt = M.ui.ytown;
  if (!yt) return;
  const on = (x, y) => Math.hypot(x - T.x, y - T.y) < WARP_R;
  let hit = null;
  if (T.area === 'market') {
    for (const pt of yt.portals) if (Math.hypot(pt.x - T.x, pt.y - T.y) < (pt.r || WARP_R)) hit = () => openPortal(pt.tab);
    for (const d of yt.doors) {
      if (d.area === T.area && on(d.x, d.y)) {
        const ex = yt.exits[d.to] || { x: yt.areas[d.to].spawn[0], y: yt.areas[d.to].spawn[1] + 40 };
        hit = () => goArea(d.to, ex.x, ex.y - 40, -1);
      }
    }
  } else {
    const ex = yt.exits[T.area];
    if (ex && on(ex.x, ex.y)) {
      const d = yt.doors.find(dd => dd.to === T.area);
      hit = () => goArea('market', d.x, d.y + 40, 1);
    }
  }
  if (!hit) {
    T.warpLock = false;
    return;
  }
  if (T.warpLock) return;
  T.warpLock = true;
  hit();
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
  townWarps();
  // Who is close enough to talk to: the nearest within reach (across a shop's counter in a house).
  const reach = M.ui.ytown ? (T.area === 'market' ? 52 : 84) : TOWN_TILE * 1.6;
  const near = T.folk.map(n => [n, Math.hypot(n.x - T.x, n.y - T.y)]).filter(([, d]) => d < reach)
    .sort((a, b) => a[1] - b[1]).map(([n]) => n)[0] || null;
  if ((near && near.id) !== (T.near && T.near.id)) {
    T.near = near;
    $('#talk').hidden = !near;
    if (near) $('#talk').textContent = near.id === 'clerk' && M.ui.ytown ? '알림판 보기' : `${near.label}에게 말 걸기`;
  }
}

/** A way out of town as 연 marks one: a 장승 by the road with the place's name, or the guardian
 * statue on its base; a door or a house's way out shows only its name. */
function drawWayOut(pt, now) {
  ctx.font = '8px G7';
  ctx.textAlign = 'center';
  if (pt.art === 'statue') {
    const im = images['ytown/statue.png'];
    const fy = pt.y - 12;
    if (im && im.width) {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(pt.x, fy - 1, im.width * 0.45, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.drawImage(im, Math.round(pt.x - im.width / 2), Math.round(fy - im.height));
    }
    outline(pt.label, pt.x, fy + 10, '#ffd27a');
    return;
  }
  const sign = images['ytown/sign.png'];
  if (pt.sign && sign && sign.width) {
    const [sx, sy] = pt.sign;
    ctx.drawImage(sign, Math.round(sx - sign.width / 2), Math.round(sy - sign.height));
    outline(pt.label, sx, sy + 10, '#ffd27a');
  } else outline(pt.label, pt.x, pt.y - 14, '#ffd27a');
}

// 연's minimap at the top right: the area small, the hero, its people and the ways out on it.
// A tap on it makes it larger or smaller.
let townMapBig = false;
function townMinimapRect() {
  const a = townArea();
  if (!a || !a.mm) return null;
  const cr = canvas.getBoundingClientRect(), d = canvas.width / cr.width;
  const k = (townMapBig ? 1.6 : 0.82) * d;
  const w = a.mm[0] * k, h = a.mm[1] * k;
  return { x: canvas.width - w - 10 * d, y: 34 * d, w, h, d };
}
function drawTownMinimap() {
  const a = townArea(), r = townMinimapRect(), im = a && images[`ytown/mm_${T.area}.png`];
  if (!r || !im || !im.width) return;
  const yt = M.ui.ytown, { x, y, w, h, d } = r, sx = w / a.w, sy = h / a.h;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(x - 3 * d, y - 3 * d, w + 6 * d, h + 6 * d);
  ctx.strokeStyle = 'rgb(201,162,74)';
  ctx.lineWidth = d;
  ctx.strokeRect(x - 2.5 * d, y - 2.5 * d, w + 5 * d, h + 5 * d);
  ctx.globalAlpha = 0.85;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(im, x, y, w, h);
  ctx.globalAlpha = 1;
  const dot = (px, py, color, size, label) => {
    const X = x + px * sx, Y = y + py * sy;
    ctx.fillStyle = '#000';
    ctx.fillRect(X - size / 2 - d, Y - size / 2 - d, size + 2 * d, size + 2 * d);
    ctx.fillStyle = color;
    ctx.fillRect(X - size / 2, Y - size / 2, size, size);
    if (label && townMapBig) {
      ctx.font = `${Math.round(8 * d)}px G7`;
      ctx.textAlign = 'center';
      outline(label, X, Y - size, '#fff');
    }
  };
  if (T.area === 'market') {
    for (const pt of yt.portals) dot(pt.x, pt.y, '#ffb43a', 4 * d, pt.label.split(' · ')[0]);
    for (const dr of yt.doors) dot(dr.x, dr.y, '#7ad0ff', 3 * d, dr.label);
  } else if (yt.exits[T.area]) dot(yt.exits[T.area].x, yt.exits[T.area].y, '#7ad0ff', 3 * d, '장터');
  for (const n of T.folk) dot(n.x, n.y, '#ffe070', 3 * d, n.label);
  if (Math.floor(performance.now() / 400) % 2 === 0 || townMapBig) dot(T.x, T.y, '#ff3a2a', 4 * d, null);
  ctx.font = `${Math.round(9 * d)}px G9`;
  ctx.textAlign = 'center';
  const names = { market: '국내성 장터', smithy: '대장간', armor: '갑옷점', jumak: '주막' };
  outline(names[T.area] || '국내성', x + w / 2, y + h + 11 * d, '#f4e2b0');
  ctx.restore();
}

function drawTown(now) {
  const yt = M.ui.ytown, area = townArea();
  const map = images[yt ? `ytown/${T.area}.png` : 'ui/town.png'];
  const mw = yt ? area.w : M.ui.town.w, mh = yt ? area.h : M.ui.town.h;
  let camX = Math.round(T.x - VW / 2), camY = Math.round(T.y - 30 - VH / 2);
  camX = VW >= mw ? Math.round((mw - VW) / 2) : Math.max(0, Math.min(mw - VW, camX));
  camY = VH >= mh ? Math.round((mh - VH) / 2) : Math.max(0, Math.min(mh - VH, camY));
  // Kept for a tap on someone (tapTown).
  T.camX = camX;
  T.camY = camY;
  ctx.setTransform(Z, 0, 0, Z, -camX * Z, -camY * Z);
  ctx.fillStyle = yt ? '#000' : '#2a1a0e';
  ctx.fillRect(camX, camY, VW, VH);
  if (map && map.width) ctx.drawImage(map, 0, 0);
  if (yt) {
    if (T.area === 'market') {
      for (const pt of yt.portals) if (pt.art !== 'statue') drawWayOut(pt, now);
      for (const d of yt.doors) drawWayOut({ x: d.x, y: d.y + 4, label: d.label }, now);
    } else if (yt.exits[T.area]) drawWayOut({ x: yt.exits[T.area].x, y: yt.exits[T.area].y + 4, label: '장터로' }, now);
  }
  const bodies = T.folk.map(n => ({ n, y: n.y })).concat([{ hero: true, y: T.y }]);
  if (yt && T.area === 'market') for (const pt of yt.portals) if (pt.art === 'statue') bodies.push({ statue: pt, y: pt.y - 12 });
  bodies.sort((a, b) => a.y - b.y);
  for (const b of bodies) {
    if (b.statue) {
      drawWayOut(b.statue, now);
      continue;
    }
    if (b.hero) {
      // In town too, the hero in 연's own figure, in the gear it has on.
      if (drawYhero2(T.cls, savedGear(T.cls), T, T.x, T.y, T.moving ? 'walk' : 'idle', 1)) continue;
      if (T.av) drawAvatar(ctx, T.av, T.x, T.y, facing(T.fdx, T.fdy), T.moving ? 'walk' : 'idle', Math.floor(T.walkT / WALK_MS));
      continue;
    }
    const n = b.n;
    const f = yt && n.look && yt.folk[n.look], fim = f && images[`ytown/${n.look}.png`];
    if (fim && fim.width) {
      // 연's NPC, its idle frames in turn, standing on its feet; a soft round shadow under it.
      const [cw, ch] = f.cell, [fx, fy] = f.foot, i = Math.floor(now * 1000 / f.ms) % f.n;
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath();
      ctx.ellipse(Math.round(n.x), Math.round(n.y) - 1, n.id === 'clerk' ? 22 : 9, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.drawImage(fim, i * cw, f.row * ch, cw, ch, Math.round(n.x - fx), Math.round(n.y - fy), cw, ch);
    } else {
      const im = images[`npc/${n.img}.png`];
      if (im && im.width) drawWalker(im, n.x, n.y, 1, now * 2, false, 0);
    }
    ctx.font = '8px G7';
    ctx.textAlign = 'center';
    outline(n.label, n.x, n.y + 10, n === T.near || (T.near && T.near.id === n.id) ? '#ffe070' : '#efe3c2');
  }
  if (T.near) {
    const top = yt && yt.folk[T.near.look] ? yt.folk[T.near.look].foot[1] + 6 : 28;
    drawBubble(T.near.line, T.near.x, T.near.y - top, 0);
  }
  if (yt) drawTownMinimap();
}

// Test: the town as it stands (the hero, the folk, who is near), and whether a spot is walkable.
window.__town = () => T;
window.__townWalk = (x, y) => !townBlocked(x, y);

/** The town's shortcut buttons: an errand by the NPC's id, or the raid list. */
function townErrand(id) {
  if (id === 'raid') {
    mapTab = 'raid';
    showScreen('stages');
    return;
  }
  const n = (T && T.folk || []).find(f => f.id === id) || TOWNSFOLK.find(f => f.id === id);
  if (T) T.near = n;
  talk();
}
document.querySelectorAll('#town-quick button').forEach(b => { b.onclick = () => townErrand(b.dataset.go); });

function talk() {
  const n = T && T.near;
  if (!n) return;
  if (n.id === 'guide') {
    // Through the guide: the list of grounds as cards, on the hardest one the hero can enter.
    pickedStage = bestOpenStage();
    mapTab = 'list';
    showScreen('stages');
  }
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
  { id: 'q_promo9', title: '천하의 지존', text: '아무 직업이나 9차 승급', gold: 20000, need: 9, have: () => Math.max(...CLASSES.map(c => promoOf(c.id))) },
  { id: 'q_promo7', title: '현세의 고수', text: '아무 직업이나 7차 승급', gold: 9000, need: 7, have: () => Math.max(...CLASSES.map(c => promoOf(c.id))) },
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
    for (const kind of ['weapon', 'armor', 'shield', 'helmet', 'cape']) {
      const tier = (GEAR[cls.id][kind] || []).findIndex((_, i) => !b.includes(`${kind}:${i}`));
      if (tier < 0) continue;
      row(gearName(cls.id, kind, tier), `${{ weapon: '무기', armor: '갑옷', shield: '방패', helmet: '투구', cape: '망토' }[kind]} · ${tier + 1}단계`,
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

// Companions that keep their distance from the fight.
const RANGED = new Set(['poet', 'mage', 'archer', 'magus']);
const PARTY = {
  poet: { names: ['소소', '달빛', '청운'], role: '회복 · 보호 · 저주로 돕는다' },
  mage: { names: ['홍염', '백야', '흑풍'], role: '화염주와 마비로 무리를 친다' },
  warrior: { names: ['철우', '백호', '무쇠'], role: '가까이 온 적을 베어 막는다' },
  rogue: { names: ['그림자', '바람', '야월'], role: '적 뒤로 파고들어 벤다' },
  archer: { names: ['매유진', '솔개', '화살비'], role: '멀리서 화살로 보스와 무리를 쏜다' },
  lancer: { names: ['창랑', '월하', '유성'], role: '창으로 앞을 막고 꿰찌른다' },
  monk: { names: ['철권', '비연', '권풍'], role: '맨주먹으로 파고들어 두들긴다' },
  magus: { names: ['나형', '흑마', '현월'], role: '멀리서 기공구슬로 얼리고 마비시킨다' },
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
    cd: { a: 1, b: 3, c: 6, d: 9, r: 0, e: 5, g: 0 }, bubble: null, slot, hp: 1, maxHp: 1, down: 0, flash: 0,
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
    if (cls === 'warrior' || cls === 'lancer') at = ax ? [foe.tx + ax, foe.ty] : [foe.tx, foe.ty + ay];
    else if (cls === 'rogue' || cls === 'monk') at = ax ? [foe.tx - ax, foe.ty] : [foe.tx, foe.ty - ay];
    else if (cls === 'mage' || cls === 'magus') at = ax ? [foe.tx + ax * 3, foe.ty + 2 * side] : [foe.tx + 2 * side, foe.ty + ay * 3];
    else if (cls === 'archer') at = ax ? [foe.tx + ax * 4, foe.ty - 2 * side] : [foe.tx - 2 * side, foe.ty + ay * 4];
    else at = [p.tx + ax * 3, p.ty + ay * 3 + (ax ? side : 0)];
  }
  if (RANGED.has(cls)) {
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
    if (G.stage.raid && m.hp < m.maxHp * 0.3 && m.cls.id !== 'poet') partyTalk(m, ['힐 좀요!!', '피 없어요!', '저 죽어요!']);
    G.allyHitting = true;
    partyAct(m);
    G.allyHitting = false;
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

/**
 * Spells in flight between the party and the foe: a glowing ball that follows its target and
 * does its work on arrival (a heal, a buff, a blow), so the skills are seen crossing the field.
 */
function addShot(from, to, o) {
  G.shots.push({ x: from.x, y: from.y - 26, to, t: 0, trail: [], ...o });
}
function updateShots(dt) {
  for (const sh of G.shots) {
    const tx = sh.to.x, ty = sh.to.y - 26, dx = tx - sh.x, dy = ty - sh.y, d = Math.hypot(dx, dy);
    sh.t += dt;
    sh.trail.unshift([sh.x, sh.y]);
    if (sh.trail.length > 6) sh.trail.pop();
    const stepLen = (sh.speed || 360) * dt;
    if (d <= stepLen + 6 || sh.t > 2.5 || (sh.to.hp !== undefined && sh.to.hp <= 0 && !sh.to.cls)) {
      sh.done = true;
      if (sh.onHit && !(sh.to.down)) sh.onHit();
      continue;
    }
    sh.x += (dx / d) * stepLen;
    sh.y += (dy / d) * stepLen;
  }
  G.shots = G.shots.filter(sh => !sh.done);
}
/** What flies between bodies is the game's own spell picture, small, by the colour it was given. */
const SHOT_FX = { '#c02838': '148', '#ffe680': '131', '#58e868': '3', '#9a68ff': '98', '#5aa8ff': '96', '#ff8a20': '40', '#b040d0': '98' };
function drawShots() {
  for (const sh of G.shots) {
    const id = sh.fx || SHOT_FX[sh.color] || '131';
    if (!M.fx[id]) continue;
    drawFx(id, sh.x, sh.y, sh.t, 0.45, 0, 'center', true);
  }
}

// ---------------------------------------------------------------- style: today's 바람 over the old art
// The old pictures stay as they were; on them, the staging of today's game: a cut-in for the
// boss: letterbox bars and a name plate, souls streaming to the hero, motes in the air of each
// ground, light when a spell is cast.

/** The glow of a class's flying spells: [halo, core]. */
const CLASS_GLOW = { warrior: ['#6fb8ff', '#e8f4ff'], rogue: ['#c9b2ff', '#f4eeff'], mage: ['#ff8a3a', '#fff0c0'], poet: ['#ffd84a', '#fffbe0'], archer: ['#9adf6a', '#f0ffe0'], lancer: ['#7fd0ff', '#eaf8ff'], monk: ['#ffb35a', '#fff1d8'], magus: ['#c27bff', '#f6e8ff'] };

/** The effect picture of a spell at its 단: a second name for the same frames, 6% larger a step. */
function grownFx(id, lv) {
  if (!id || !M.fx[id]) return id;
  lv = Math.max(1, lv || 1);
  const key = id + '@' + lv;
  if (!M.fx[key]) {
    // 연's spells are drawn large over the field: a quarter larger to begin, 6% more a 단.
    const f = M.fx[id];
    M.fx[key] = { ...f, src: f.src || id, k: (f.k || 1) * (1 + 0.04 * (lv - 1)) };
  }
  return key;
}

function updateStyle(dt) {}


/** A spell's picture rained over the visible field: n copies in waves, large. */
function scatterFx(id, n, scale) {
  const p = G.player, w = VW / 2 - 20, h = VH / 2 - 20;
  // Light (drawn added) copies well; a solid picture repeated large reads as blocks: fewer, smaller.
  const f = M.fx[id];
  if (f && f.cls === 'modern') return; // today's pictures are already large, and dark-backed
  if (f && f.cls === 'yeon') { n = Math.min(n, 3); scale = Math.min(scale, 0.6); } // 연's are large already
  if (f && !f.add) { n = Math.ceil(n / 3); scale = Math.min(scale, 1); }
  for (let i = 0; i < n; i++) addFx(id, p.x + rand(-w, w), p.y - 20 + rand(-h, h), { delay: (i % 4) * 0.09 + rand(0, 0.05), scale: scale * rand(0.8, 1.2) });
}


/** The spells in hand, as 연's skill row: each icon in a frame of its 승급 tier, the time
 * to its next cast sweeping round it, its 단 in the corner. Bottom left, above the chat. */
const iconCache = {};
function skillIconImage(id) {
  if (iconCache[id] !== undefined) return iconCache[id];
  const def = SKILLS[id];
  if (M.skillicon && M.skillicon.includes(id)) {
    const im = new Image();
    im.src = `assets/skillicon/${id}.png`;
    return (iconCache[id] = im);
  }
  const fx = def.fxs ? def.fxs[def.fxs.length - 1] : def.fx;
  // A plain weapon strike (이중공격) has no spell picture: its slot shows the weapon itself.
  if (!fx && def.kind === 'slash') return G ? (iconCache[id] = gearImage({ kind: 'weapon', tier: 1 }) || null) : null;
  return (iconCache[id] = fx ? images[`icon/${fx}.png`] || null : null);
}
function drawSkillBar() {
  if (!G.skills.length || G.dead) return;
  const W = canvas.width, u = W / 860;
  const cr = canvas.getBoundingClientRect(), dl = $('#chat') && $('#chat').getBoundingClientRect();
  const H = dl && dl.top > cr.top ? Math.min(canvas.height, (dl.top - cr.top) * (canvas.height / cr.height)) : canvas.height;
  const yeon = document.body.classList.contains('yeon'), dpr = canvas.width / cr.width;
  const sz = Math.round((yeon ? 38 : 30) * u), gap = Math.round(5 * u);
  // 연: two rows of four at the bottom right, left of the 필살기 button; else a row at the bottom left.
  const x0 = yeon ? W - (100 * dpr) - 4 * (sz + gap) : Math.round(12 * u), y0 = yeon ? canvas.height - 12 * dpr - 2 * sz - gap : Math.round(H - sz - 10 * u);
  G.skills.slice(0, 8).forEach((s, i) => {
    const def = SKILLS[s.id], x = x0 + (yeon ? i % 4 : i) * (sz + gap), y = y0 + (yeon && i >= 4 ? sz + gap : 0);
    // 연's slot: a purple frame in a black line.
    ctx.fillStyle = '#000';
    ctx.fillRect(x - 4, y - 4, sz + 8, sz + 8);
    ctx.fillStyle = 'rgb(148,48,219)';
    ctx.fillRect(x - 3, y - 3, sz + 6, sz + 6);
    ctx.fillStyle = '#000';
    ctx.fillRect(x - 1, y - 1, sz + 2, sz + 2);
    const im = skillIconImage(s.id);
    if (im && im.width) {
      ctx.save();
      const ic = def.tint && !(M.skillicon && M.skillicon.includes(s.id)) ? tinted(im, def.tint) : im;
      const k = Math.min(sz / im.width, sz / im.height);
      ctx.drawImage(ic, x + (sz - im.width * k) / 2, y + (sz - im.height * k) / 2, im.width * k, im.height * k);
      ctx.restore();
    }
    // The wait, as 연 shows it: the icon darkened, the seconds over it.
    const left = s.cdMax && !s.waiting ? Math.max(0, Math.min(1, s.timer / s.cdMax)) : 0;
    if (left > 0.02) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(x, y, sz, sz);
      if (s.timer >= 1) {
        ctx.font = `bold ${Math.round(10 * u)}px G9`;
        ctx.textAlign = 'center';
        outline(`${Math.ceil(s.timer)}초`, x + sz / 2, y + sz / 2 + 4 * u, '#ffffff');
      }
    }
    ctx.font = `bold ${Math.round(9 * u)}px G9`;
    ctx.textAlign = 'right';
    outline(String(s.lv), x + sz - 1, y + sz - 2, '#fff');
  });
  ctx.textAlign = 'left';
}


// ---------------------------------------------------------------- class flourishes (바람의나라 연)
// From 연's hunts: the 전사 and 도적 close in (a dash to the foe, afterimages behind), and the
// 주술사 and 도사 fill the field from afar with the game's own spell pictures on many foes.

const THUNDER = /뢰|뇌|천둥|번개|섬광/;
function classFlourish(def, skill, st) {
  const p = G.player, cls = G.cls.id;
  if (!def || def.kind === 'ult' || def.kind === 'buff' || def.kind === 'aura') return;
  const near = nearestEnemies(1, 6)[0];
  if (MELEE.has(cls)) {
    // 돌진: to the nearest foe out of reach, once a second and a half, when no blow lands by the hero.
    const beside = DIRS.some(([dx, dy]) => { const b = occ.get(key(p.tx + dx, p.ty + dy)); return b && b.m && !b.ally; });
    if (near && !beside && !p.stepping && G.t - (G.dashAt || -9) > 1.5 && tdist(near, p) <= 5 && ['strike', 'cleave', 'nova', 'line', 'spell', 'screen'].includes(def.kind)) {
      const spot = DIRS.map(([dx, dy]) => [near.tx + dx, near.ty + dy]).filter(([x, y]) => free(x, y))
        .sort((a, b) => Math.hypot(a[0] - p.tx, a[1] - p.ty) - Math.hypot(b[0] - p.tx, b[1] - p.ty))[0];
      if (spot) {
        G.dashAt = G.t;
        // Landing in the crowd, the hero is untouchable for a moment (it chose the fight, not the blows).
        p.inv = Math.max(p.inv, 0.5);
        p.x = spot[0] * TILE + TILE / 2;
        p.y = spot[1] * TILE + TILE - 6;
        heroTile();
        const dx = near.tx - p.tx, dy = near.ty - p.ty;
        if (Math.abs(dx) >= Math.abs(dy)) { p.fdx = Math.sign(dx) || 1; p.fdy = 0; p.face = p.fdx; } else { p.fdx = 0; p.fdy = Math.sign(dy); }
      }
    }
    return;
  }
  // Casters show only their own spell's effect: an extra meteor or bolt dropped on every cast
  // (the earlier flourish) made 백열주 look like a fire spell.
}



/** 연's status at the top left, as its screen draws it: the weapon's picture with the level
 * under it, then flat red and blue bars in a black line with their numbers in white. */
function drawYeonStatus() {
  if (!document.body.classList.contains('yeon')) return;
  const p = G.player, cr = canvas.getBoundingClientRect(), d = canvas.width / cr.width;
  const x = 8 * d, y = 8 * d, w = 150 * d, h = 15 * d;
  ctx.save();
  const wp = gearImage({ kind: 'weapon', tier: p.gear ? p.gear.weapon : 0 });
  if (wp && wp.width) {
    const k = Math.min(26 * d / wp.width, 26 * d / wp.height);
    ctx.drawImage(wp, x + (26 * d - wp.width * k) / 2, y, wp.width * k, wp.height * k);
  }
  ctx.font = `bold ${Math.round(12 * d)}px G11`;
  ctx.textAlign = 'center';
  outline(String(p.lvl), x + 13 * d, y + 2 * h + 2 * d, '#ffffff');
  const bx = x + 30 * d;
  const row = (yy, k, fill, text) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(bx - d, yy - d, w + 2 * d, h + 2 * d);
    ctx.fillStyle = '#2a1410';
    ctx.fillRect(bx, yy, w, h);
    ctx.fillStyle = fill;
    ctx.fillRect(bx, yy, Math.max(0, w * Math.min(1, k)), h);
    ctx.font = `bold ${Math.round(10 * d)}px G9`;
    ctx.textAlign = 'right';
    outline(text, bx + w - 3 * d, yy + h - 3 * d, '#ffffff');
  };
  row(y, p.hp / p.maxHp, 'rgb(180,43,0)', `${Math.ceil(Math.max(0, p.hp))}`);
  row(y + h + 2 * d, p.mp / p.maxMp, 'rgb(62,102,196)', `${Math.floor(p.mp)}`);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, canvas.height - 3 * d, canvas.width, 3 * d);
  ctx.fillStyle = 'rgb(62,180,60)';
  ctx.fillRect(0, canvas.height - 3 * d, canvas.width * Math.min(1, p.xp / p.next), 3 * d);
  ctx.restore();
}

/** 연's pickup list at the right: each find a line, the newest at the bottom, fading out. */
function lootFeed(text) {
  G.feed.push({ text, t: G.t });
  if (G.feed.length > 6) G.feed.shift();
}
function drawLootFeed() {
  G.feed = G.feed.filter(f => G.t - f.t < 4);
  if (!G.feed.length) return;
  const cr = canvas.getBoundingClientRect(), d = canvas.width / cr.width;
  const x = canvas.width - 12 * d, y0 = 150 * d;
  ctx.save();
  ctx.textAlign = 'right';
  ctx.font = `${Math.round(10 * d)}px G9`;
  G.feed.forEach((f, i) => {
    ctx.globalAlpha = Math.min(1, (4 - (G.t - f.t)) * 1.5);
    const y = y0 + i * 15 * d, w = ctx.measureText(f.text).width + 12 * d;
    ctx.fillStyle = 'rgba(10,8,6,0.5)';
    ctx.fillRect(x - w, y - 11 * d, w + 4 * d, 14 * d);
    outline(f.text, x, y, '#f4e6c4');
  });
  ctx.restore();
}

/** The hero's own stun on a raid boss gathering its blast cuts it short, as the 주술사's 마비 does. */
function cutBlast(e) {
  if (e.kind !== 'boss' || !G.blast) return;
  G.blast = null;
  banner('기술로 광역기를 끊었다!');
  emote('gains', G.player);
}

/** A companion's own words in the party chat (not a spell name), now and then. */
function partyTalk(m, lines) {
  if (G.t - (m.talked || -99) < 6) return;
  m.talked = G.t;
  const text = Array.isArray(lines) ? lines[Math.floor(Math.random() * lines.length)] : lines;
  m.bubble = { text: text.length > 14 ? text.slice(0, 13) + '…' : text, t: G.t };
  say(`${m.name}: ${text}`, 'party');
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
        partySay(m, '부활');
        partyTalk(m, ['부활 갑니다!', '일어나요, 아직 안 끝났어요!']);
        pose('magic');
        addShot(m, downed, { color: '#ffe680', glow: '#fff2b0', size: 5, speed: 380, onHit: () => {} });
        later(0.35, () => {
          if (!downed.down) return;
          downed.down = 0;
          downed.hp = downed.maxHp * 0.5;
          addFx(FX.revive, downed.x, downed.y + 2, { anchor: 'bottom' });
          audio.play('revive');
          downed.bubble = { text: '고마워!', t: G.t + 0.3 };
        });
      } else if (G.groupHeal && G.t - G.groupHeal < 3 && m.cd.g <= 0) {
        // After a blast over everyone: the 희원 to the whole party.
        m.cd.g = 10;
        for (const x of partyBodies()) addShot(m, x, { color: '#58e868', glow: '#b8ffb0', size: 4, speed: 420, onHit: () => {
          const n = x.maxHp * 0.25;
          if (x === p) { heal(n, false); addFx(SKILLS.p_sky.fx, 0, -26, { follow: true, scale: 0.7 }); }
          else healMember(x, n, SKILLS.p_sky.fx);
        } });
        audio.play('skill_p_sky', 'heal');
        partySay(m, '천공의희원');
        partyTalk(m, ['다들 피 채워요!', '광역 힐 갑니다~']);
        pose('magic');
      } else if (G.stage.raid && m.cd.e <= 0 && p.mp < p.maxMp * 0.5) {
        // 공력주입: mana for the hero's next great spell.
        m.cd.e = 16;
        addShot(m, p, { color: '#9a68ff', glow: '#d6c0ff', size: 4, speed: 380, onHit: () => {
          p.mp = Math.min(p.maxMp, p.mp + p.maxMp * 0.4);
          addFx(SKILLS.m_gongryeok.fx, 0, -26, { follow: true, scale: 0.6 });
        } });
        audio.play('skill_m_gongryeok', 'heal');
        partySay(m, '공력주입');
        partyTalk(m, ['공증 드려요!', '마력 채워 드릴게요']);
        pose('magic');
      } else if (m.cd.a <= 0 && low) {
        m.cd.a = G.stage.raid ? 3.2 : 5;
        const tier = Math.min(7, m.lv + 1), fx = SKILLS.c_heal.fxs[tier];
        const n = low.maxHp * (0.14 + 0.04 * m.lv);
        addShot(m, low, { color: '#58e868', glow: '#b8ffb0', size: 4, speed: 420, onHit: () => {
          if (low === p) { heal(n, false); addFx(fx, 0, -26, { follow: true }); } else healMember(low, n, fx);
        } });
        audio.play('skill_c_heal', 'heal', tier + 1);
        partySay(m, KIWON[tier]);
        pose('magic');
      } else if (m.cd.b <= 0) {
        m.cd.b = 14;
        G.buffs.shield = Math.max(G.buffs.shield, G.t + 4 + m.lv);
        for (const b of partyBodies()) addShot(m, b, { color: '#5aa8ff', glow: '#c0e0ff', size: 3, speed: 420, onHit: () =>
          addFx(FX.shield, b === p ? 0 : b.x, -26 + (b === p ? 0 : b.y), { follow: b === p, scale: 0.6 }) });
        audio.play('party_guard');
        partySay(m, G.stage.raid ? '보무' : '보호');
        if (G.stage.raid) partyTalk(m, ['보무 갑니다~', '보호 무장 걸어요!']);
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
      if (boss && G.blast && m.cd.b <= 0) {
        // 마비 on the boss gathering its blast: the blast is cut short.
        m.cd.b = 9;
        G.blast = null;
        boss.stun = 1.2;
        fxOn(SKILLS.m_para.fx, boss);
        audio.play('skill_m_para', 'strike');
        partySay(m, '마비');
        partyTalk(m, ['마비 걸었어요! 광역 끊김!', '마비! 지금 몰아쳐요!']);
        banner('마비! 광역기를 끊었다');
        emote('gains', p);
        pose('magic');
      } else if (boss && m.cd.d <= 0) {
        // 헬파이어 on the boss: the big one.
        m.cd.d = 16;
        fxOn(SKILLS.m_ult.fx, t);
        later(0.3, () => hurtEnemy(t, 70 * pw));
        audio.play('skill_m_ult', 'ult');
        partySay(m, '헬파이어');
        pose('magic');
      } else if (m.cd.a <= 0) {
        m.cd.a = 1.3;
        addShot(m, t, { color: '#ff8a20', glow: '#ffd060', size: 4, speed: 460, onHit: () => {
          fxOn(SKILLS.m_fire.fxs[Math.min(7, m.lv)], t);
          hurtEnemy(t, 8 * pw);
        } });
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
        partyTalk(m, ['탱 잡았어요, 뒤로 빠져요!', '어그로 끌게요!']);
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
    case 'lancer': {
      // 무사: in front with the warrior — 월하일섬 thrusts at what is within two tiles, 반월참 into a
      // crowd, 유성창 on the boss now and then; 진기보호 when hurt.
      const t = boss || near(1)[0];
      if (!t || Math.hypot(t.x - m.x, t.y - m.y) > TILE * 2.6) break;
      face(t);
      if (m.hp < m.maxHp * 0.4 && m.cd.e <= 0) {
        m.cd.e = 15;
        addFx(SKILLS.l_guard.fx, m.x, m.y - 20, { scale: 0.8 });
        audio.play('skill_l_guard', 'buff');
        partySay(m, '진기보호');
        healMember(m, m.maxHp * 0.15);
      }
      if (boss && t === boss && m.cd.d <= 0) {
        m.cd.d = 10;
        fxOn(SKILLS.l_meteor.fx, t);
        later(0.25, () => hurtEnemy(t, 45 * pw));
        audio.play('skill_l_meteor', 'strike');
        partySay(m, '유성창');
        if (Math.random() < 0.5) partyTalk(m, ['창끝을 받아라!', '보스 앞은 제가 막죠!']);
        pose('attack');
      } else if (m.cd.b <= 0 && around(t.tx, t.ty, 1).length >= 3) {
        m.cd.b = 7;
        fxOn(SKILLS.l_halfmoon.fx, t);
        later(0.15, () => { for (const e of around(t.tx, t.ty, 1)) hurtEnemy(e, 14 * pw); });
        audio.play('skill_l_halfmoon', 'cleave');
        partySay(m, '반월참');
        pose('attack');
      } else if (m.cd.a <= 0) {
        m.cd.a = 0.9;
        fxOn(SKILLS.l_moon.fx, t);
        hurtEnemy(t, 10 * pw);
        audio.play('skill_l_moon', 'line');
        if (Math.random() < 0.2) partySay(m, '월하일섬');
        pose('attack');
      }
      break;
    }
    case 'monk': {
      // 격투가: up close with the warrior — 붕권 at what stands beside it, 천지파동 into a crowd,
      // 전광석화 on the boss now and then; 금강불괴 when hurt.
      const t = boss || near(1)[0];
      if (!t || Math.hypot(t.x - m.x, t.y - m.y) > TILE * 1.8) break;
      face(t);
      if (m.hp < m.maxHp * 0.4 && m.cd.e <= 0) {
        m.cd.e = 15;
        addFx(SKILLS.mk_diamond.fx, m.x, m.y - 20, { scale: 0.8 });
        audio.play('skill_mk_diamond', 'buff');
        partySay(m, '금강불괴');
        healMember(m, m.maxHp * 0.15);
      }
      if (boss && t === boss && m.cd.d <= 0) {
        m.cd.d = 10;
        fxOn(SKILLS.mk_sudden.fx, t);
        later(0.2, () => hurtEnemy(t, 45 * pw));
        audio.play('skill_mk_sudden', 'blink');
        partySay(m, '전광석화');
        if (Math.random() < 0.5) partyTalk(m, ['급소를 찌른다!', '주먹 맛 좀 봐라!']);
        pose('attack');
      } else if (m.cd.b <= 0 && around(m.tx, m.ty, 1).length >= 3) {
        m.cd.b = 7;
        addFx(SKILLS.mk_quake.fx, m.x, m.y - 20);
        later(0.15, () => { for (const e of around(m.tx, m.ty, 1)) hurtEnemy(e, 14 * pw); });
        audio.play('skill_mk_quake', 'nova');
        partySay(m, '천지파동');
        pose('attack');
      } else if (m.cd.a <= 0) {
        m.cd.a = 0.7;
        fxOn(SKILLS.mk_bung.fx, t);
        hurtEnemy(t, 9 * pw);
        audio.play('skill_mk_bung', 'slash');
        if (Math.random() < 0.2) partySay(m, '붕권');
        pose('attack');
      }
      break;
    }
    case 'magus': {
      // 마도사: from afar with the 주술사 — 마력구회격 at the nearest, 기공구슬'뇌 on a crowd (it
      // stuns), 마력화살 on the boss now and then; 질서결계 when hurt.
      const t = boss || near(1)[0];
      if (!t) break;
      face(t);
      if (m.hp < m.maxHp * 0.4 && m.cd.e <= 0) {
        m.cd.e = 15;
        addFx(SKILLS.md_boundary.fx, m.x, m.y - 20, { scale: 0.8 });
        audio.play('skill_md_boundary', 'buff');
        partySay(m, '질서결계');
        healMember(m, m.maxHp * 0.15);
      }
      if (boss && m.cd.d <= 0) {
        m.cd.d = 10;
        fxOn(SKILLS.md_arrow.fx, t);
        later(0.25, () => hurtEnemy(t, 45 * pw));
        audio.play('skill_md_arrow', 'spell');
        partySay(m, '마력화살');
        if (Math.random() < 0.5) partyTalk(m, ['금기의 화살이다!', '보스에 집중!']);
        pose('magic');
      } else if (m.cd.b <= 0 && around(t.tx, t.ty, 1).length >= 3) {
        m.cd.b = 7;
        fxOn(SKILLS.md_orblight.fx, t);
        later(0.3, () => { for (const e of around(t.tx, t.ty, 1)) { hurtEnemy(e, 12 * pw); e.stun = Math.max(e.stun || 0, e.kind === 'boss' ? 0.3 : 1); } });
        audio.play('skill_md_orblight', 'spell');
        partySay(m, "기공구슬'뇌");
        pose('magic');
      } else if (m.cd.a <= 0) {
        m.cd.a = 1.1;
        fxOn(SKILLS.md_sphere.fx, t);
        hurtEnemy(t, 10 * pw);
        audio.play('skill_md_sphere', 'spell');
        if (Math.random() < 0.2) partySay(m, '마력구회격');
        pose('magic');
      }
      break;
    }
    case 'archer': {
      // 궁사: ranged damage from four tiles off — 활쏘기 at the nearest, 마탄 on a crowd, and on the
      // boss 조준 활쏘기 now and then; 위위비보 away when hurt.
      const t = boss || near(1)[0];
      if (!t) break;
      face(t);
      if (m.hp < m.maxHp * 0.4 && m.cd.e <= 0) {
        m.cd.e = 14;
        addFx(SKILLS.a_weebo.fx, m.x, m.y - 20, { scale: 0.8 });
        audio.play('skill_a_weebo', 'buff');
        partySay(m, '위위비보');
        healMember(m, m.maxHp * 0.15);
      }
      if (boss && m.cd.d <= 0) {
        m.cd.d = 10;
        fxOn(SKILLS.a_aim.fx, t);
        later(0.25, () => hurtEnemy(t, 45 * pw));
        audio.play('skill_a_aim', 'spell');
        partySay(m, '조준 활쏘기');
        if (Math.random() < 0.5) partyTalk(m, ['급소 조준!', '보스 집중 사격!']);
        pose('attack');
      } else if (m.cd.b <= 0 && around(t.tx, t.ty, 1).length >= 3) {
        m.cd.b = 7;
        fxOn(SKILLS.a_bomb.fx, t);
        later(0.3, () => { for (const e of around(t.tx, t.ty, 1)) hurtEnemy(e, 14 * pw); });
        audio.play('skill_a_bomb', 'strike');
        partySay(m, '마탄');
        pose('attack');
      } else if (m.cd.a <= 0) {
        m.cd.a = 1.1;
        fxOn(SKILLS.a_shot.fx, t);
        hurtEnemy(t, 10 * pw);
        audio.play('skill_a_shot', 'spell');
        if (Math.random() < 0.2) partySay(m, '활쏘기');
        pose('attack');
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
        for (let i = 0; i < 4; i++) later(0.1 + i * 0.1, () => hurtEnemy(t, 15 * pw * (m.hidden > G.t ? 1.5 : 1)));
        audio.play('skill_r_ult', 'ult');
        partySay(m, '필살검무');
        partyTalk(m, ['뒤 잡았다!', '필살 들어갑니다']);
      } else if (boss && m.cd.e <= 0 && m.hp < m.maxHp * 0.6) {
        // 흡성대법: the foe's strength drawn back as health.
        m.cd.e = 9;
        hurtEnemy(t, 10 * pw);
        addShot(t, m, { color: '#b040d0', glow: '#e8a0ff', size: 4, speed: 360, onHit: () => healMember(m, m.maxHp * 0.25) });
        audio.play('skill_r_drain', 'spell');
        partySay(m, '흡성대법');
        pose('attack');
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
  const mPose = m.down ? 'dead' : m.poseT > 0 ? m.pose : m.moving ? 'walk' : 'idle';
  if ((m.cls.id && drawYhero2(m.cls, m.gear, m, m.x, y, mPose, alpha)) || drawYhero(m.cls.id || m.cls, m.gear ? m.gear.armor : 0, m, m.x, y, mPose, alpha)) {
    // drawn in 연's own figure
  } else if (m.av) {
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
  // The closing vacuum: every drop on the field speeds toward the hero.
  const pull = G.vacuumAt !== undefined && G.t >= G.vacuumAt && G.t < G.vacuumEnd;
  if (pull && !G.vacuumSaid) {
    G.vacuumSaid = true;
    if (G.drops.length) audio.play('pickup');
  }
  for (const d of G.drops) {
    if (pull) {
      const dx = p.x - d.x, dy = p.y - 8 - d.y, l = Math.hypot(dx, dy) || 1;
      d.v = (d.v || 120) + 1800 * dt;
      const step = Math.min(l, d.v * dt);
      d.x += dx / l * step;
      d.y += dy / l * step;
    }
    if (Math.hypot(d.x - p.x, d.y - p.y) < reach) {
      d.taken = true;
      if (d.kind === 'gear') pickGear(d.gear);
      else if (d.kind === 'mat') {
        progress.mats = progress.mats || {};
        progress.mats[d.mat] = (progress.mats[d.mat] || 0) + 1;
        (G.gained = G.gained || []).push(MATS[d.mat].name);
        note(`${MATS[d.mat].name} +1`);
        lootFeed(`${MATS[d.mat].name} 획득`);
        audio.play('pickup');
      }
      else if (d.kind === 'heal') heal(30, true);
      else if (d.kind === 'coin') {
        const n = 5 + Math.floor(Math.random() * 10 * (1 + G.level));
        G.gold += n;
        if (G.texts.length < 70) G.texts.push({ x: p.x + rand(-6, 6), y: p.y - 40, text: String(n), t: 0, gold: true });
        note(`${n}전을 주웠습니다.`);
        lootFeed(`${n}전 획득`);
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
  v *= 1.7;
  p.xp += v * pactReward();
  p.total = (p.total || 0) + v;
  while (p.xp >= p.next) {
    p.xp -= p.next;
    p.lvl++;
    p.next = xpFor(p.lvl);
    G.pendingLevels++;
    say(`레벨이 올랐습니다. (Lv ${p.lvl})`, 'sys');
    // 연's level-up burst, its LEVEL UP lettering over the hero.
    if (M.fx.h_levelup) addFx('h_levelup', 0, 2, { anchor: 'bottom', follow: true });
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
      // 계열: the spell before it in the tree, learned in this hunt, opens it (it once had to be
      // raised to 3단 first, which with every hunt starting over and the slots filling up was
      // hardly ever reached).
      if (d.pre && !G.skills.some(x => x.id === d.pre[0])) continue;
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
  // Not in the middle of the closing sweep and pull: the cards wait until the spoils are in.
  if (G.sweepUntil && G.t < G.sweepUntil) {
    if (!G.choiceDeferred) {
      G.choiceDeferred = true;
      later(G.sweepUntil - G.t + 0.05, () => { G.choiceDeferred = false; if (!G.choosing) nextChoice(); });
    }
    return;
  }
  G.pendingLevels--;
  const picks = drawCards();
  if (!picks.length) picks.push({ type: 'heal' }, { type: 'gold' });
  G.choosing = true;
  audio.play('levelup');
  addFx(FX.levelup, 0, -26, { follow: true });
  // 자동 선택: the hunt goes on, as 연's auto hunting does; the pick is named in the feed.
  if (settings.autoPick && !G.banishing) {
    const o = bestCard(picks);
    lootFeed(`자동 선택 · ${cardName(o)}`);
    choose(o);
    return;
  }
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
      icon = skillIcon(o.id, lvFx);
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
    b._card = o;
    b.dataset.id = o.id;
    box.append(b);
  }
  $('#lv-reroll').textContent = `다시 뽑기 ${G.rerolls}`;
  $('#lv-skip').textContent = `넘기기 ${G.skips}`;
  $('#lv-banish').textContent = G.banishing ? '뺄 카드를 고르세요' : `빼기 ${G.banishes}`;
  $('#lv-reroll').disabled = !G.rerolls;
  $('#lv-skip').disabled = !G.skips;
  $('#lv-banish').disabled = !G.banishes;
  $('#lv-auto').textContent = settings.autoPick ? '자동 선택 켬' : '자동 선택';
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

/** A card's name, for the feed. */
function cardName(o) {
  return o.type === 'skill' ? skillName(o.id, o.lv) : o.type === 'passive' ? PASSIVES[o.id].name : o.type === 'heal' ? '회복' : '전';
}

/**
 * 자동 선택: what a sound player would take. The build grows deep before it grows wide —
 * raising spells already held, above all one near 8단 whose 각성 the 승급 already allows —
 * until three attacks are held; screen-wide and area spells come before single strikes, and
 * higher 승급 spells before lower; the spells of the build last kept for this class weigh
 * more; damage and cooldown passives lead the passives, life and armour when life runs low.
 */
const SUPPORT_KINDS = new Set(['buff', 'heal', 'blink']);
const AREA_KINDS = new Set(['screen', 'nova', 'cleave', 'aura', 'line', 'spell4']);
function cardScore(o) {
  const p = G.player, low = p.hp < p.maxHp * 0.45;
  const attacks = G.skills.filter(s => !SUPPORT_KINDS.has(SKILLS[s.id].kind)).length;
  const kept = ((progress.builds || {})[G.cls.id] || { skills: [] }).skills.map(x => x[0]);
  if (o.type === 'skill') {
    const d = SKILLS[o.id], attack = !SUPPORT_KINDS.has(d.kind);
    let v;
    if (o.lv > 1) {
      v = attack ? 10 : 6;
      if (d.up && SKILLS[d.up] && promoOf(G.cls.id) >= SKILLS[d.up].promo) v += 5;
      if (o.lv >= 6) v += 2;
    } else {
      v = attack ? (attacks < 3 ? 12 : 8) : d.kind === 'heal' ? (low ? 9 : 5) : d.kind === 'blink' ? 3 : 5;
      v += (d.promo || 0) * 1.2;
      if (o.mastered) v += 2;
    }
    if (attack && AREA_KINDS.has(d.kind)) v += 2;
    if (kept.includes(o.id)) v += 3;
    return v;
  }
  if (o.type === 'passive') {
    const base = { power: 9, haste: 8, area: 6, life: 6, armor: 6, mana: 4, speed: 4, magnet: 2 }[o.id] || 3;
    return base + (low && (o.id === 'life' || o.id === 'armor') ? 6 : 0) - (o.lv - 1) * 0.4;
  }
  if (o.type === 'heal') return low ? 15 : 1;
  return 0.5;
}
function bestCard(picks) {
  return picks.reduce((a, o) => (cardScore(o) > cardScore(a) ? o : a), picks[0]);
}

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

/** A spell's icon: the game's own for the 8·9차 spells, else its effect's, in its colour. */
function skillIcon(id, fx) {
  if (M.skillicon && M.skillicon.includes(id)) {
    const im = document.createElement('img');
    im.src = `assets/skillicon/${id}.png`;
    im.className = 'item skillicon';
    return im;
  }
  if (!fx) return itemIcon('p_power');
  const im = fxIcon(fx);
  if (SKILLS[id].tint) im.style.filter = SKILLS[id].tint;
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
    addFx(FX.revive, 0, 2, { follow: true, anchor: 'bottom' });
    audio.play('revive');
    return;
  }
  if (G.cls.revive && !G.revived) {
    G.revived = true;
    p.hp = p.maxHp * 0.5;
    G.buffs.guard = G.t + 3;
    G.bubble = { text: '부활!', t: G.t };
    say('부활 마법으로 다시 일어났습니다.');
    addFx(FX.revive, 0, 2, { follow: true, anchor: 'bottom' });
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
  $('#banner').hidden = true;
  clearTimeout(banner.t);
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
  G.gold = Math.round(G.gold * pactReward());
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
  // Nothing over the results window (the field behind it still runs out its last blows).
  if (G && G.over) return;
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
  if (G.fxs.length > 260) return life; // a phone draws only so many at once
  // A screen-filling effect (연's 포효검황, 혈겁만파 ...) is shown once at a time, and no more
  // than two of them together: stacked they hid the field and slowed a phone to a crawl.
  const area = M.fx[id].w * M.fx[id].h * (M.fx[id].k || 1) ** 2 * (o.scale || 1) ** 2;
  if (area > 120000) {
    const big = G.fxs.filter(f => f.big);
    if (big.length >= 2 || big.some(f => f.id === id)) return life;
  }
  // A middling one (a meteor, a pillar of fire) four at a time: the fifth adds nothing to see
  // and much to draw.
  if (area > 12000 && G.fxs.filter(f => f.id === id).length >= 4) return life;
  G.fxs.push({ id, x, y, t: -(o.delay || 0), life, scale: o.scale || 1, rot: o.rot || 0,
    follow: o.follow, anchor: o.anchor || 'center', big: area > 120000 });
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
  const im = images[`fx/${f.src || id}.png`];
  const i = fxFrame(durs(id), t, loop);
  // Long effects are folded into rows of "cols" frames (a phone holds no picture past 4096).
  const cols = (f.src ? M.fx[f.src].cols : f.cols) || 1e9;
  const sx = (i % cols) * f.w, sy = Math.floor(i / cols) * f.h;
  const w = f.w * scale * (f.k || 1), h = f.h * scale * (f.k || 1);
  ctx.save();
  if (f.add) ctx.globalCompositeOperation = 'lighter';
  const pic = f.tint ? tinted(im, f.tint) : im;
  // Blown up past its own pixels an effect is drawn smooth, a soft light rather than blocks.
  if (scale * (f.k || 1) > 1.5) ctx.imageSmoothingEnabled = true;
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  if (f.ax !== undefined) {
    // 연's effects carry their pivot: the target's feet (a little under a body's middle).
    const k = scale * (f.k || 1);
    ctx.drawImage(pic, sx, sy, f.w, f.h, -f.ax * k, -f.ay * k + (anchor === 'bottom' ? 0 : 14), w, h);
  } else ctx.drawImage(pic, sx, sy, f.w, f.h, -w / 2, anchor === 'bottom' ? -h : -h / 2, w, h);
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
    if (e.pointerId !== joy.id) return;
    // In town, a short tap on someone is talking to them, wherever the hero stands.
    if (t === 'pointerup' && T && !G && !$('#town').hidden && Math.hypot(joy.x - joy.ox, joy.y - joy.oy) < 12) tapTown(e);
    joy.id = null;
  });
}

/** The person under a tap in town, if any: spoken to at once. */
function tapTown(e) {
  if (T.camX === undefined) return;
  const r = canvas.getBoundingClientRect();
  // A tap on the minimap makes it larger or smaller.
  const mr = M.ui.ytown && townMinimapRect();
  if (mr) {
    const cx = (e.clientX - r.left) * (canvas.width / r.width), cy = (e.clientY - r.top) * (canvas.height / r.height);
    if (cx > mr.x - 6 * mr.d && cx < mr.x + mr.w + 6 * mr.d && cy > mr.y - 6 * mr.d && cy < mr.y + mr.h + 16 * mr.d) {
      townMapBig = !townMapBig;
      audio && audio.play('click');
      return;
    }
  }
  const wx = T.camX + (e.clientX - r.left) * (canvas.width / r.width) / Z;
  const wy = T.camY + (e.clientY - r.top) * (canvas.height / r.height) / Z;
  const hit = T.folk.map(n => [n, Math.abs(n.x - wx) + Math.abs(n.y - 22 - wy) * 0.7])
    .filter(([n, d]) => Math.abs(n.x - wx) < 26 && wy > n.y - 64 && wy < n.y + 10).sort((a, b) => a[1] - b[1])[0];
  if (!hit) return;
  T.near = hit[0];
  T.fdx = Math.sign(hit[0].x - T.x);
  T.fdy = 0;
  audio && audio.play('click');
  talk();
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
  '6008', '8011', '8015', '8023', '8024', '11015', '12020', '12021', '12022', '12023', '12024',
  // Drawn from above as well, the head at the bottom: the green rats, the rats of the bear cave, the scorpion.
  '1008', '1009', '1014', '1036', '1037', '3016']);
// The head at the top: snakes, and the squid (its mantle leads).
const SNAKES = new Set(['1016', '1018', '1019', '1020', '1021', '5015', '5016', '5055', '12013', '12014', '12016', '12017', '8027',
  '3027', '12108']);

/** A monster as it moves: turned (top-down kinds), or leaning (upright kinds). */
/** A summoned 괴수: its own four ways, walking or striking, from the dress-room sheet. */
function drawBeast(b, alpha, ox = 0, oy = 0, k = 0.62) {
  const d = M.beast[b.beast], im = images[`beast/${b.beast}.png`];
  const [cw, ch] = d.cell;
  const row = b.mdy > 0 ? 0 : b.mdx > 0 ? 1 : b.mdy < 0 ? 2 : b.mdx < 0 ? 3 : 0;
  const struck = b.lunge > 0 ? G.t : b.hitT;
  const col = struck !== undefined && G.t - struck < 0.3 ? 4 + (b.lunge > 0.15 || G.t - struck < 0.15 ? 0 : 1)
    : b.moving ? Math.floor(b.phase / (Math.PI / 2)) % 4 : Math.floor(G.t * 2.5) % 4;
  ctx.save();
  ctx.globalAlpha = Math.max(0, alpha);
  ctx.drawImage(im, col * cw, row * ch, cw, ch, Math.round(b.x + ox - d.feet[0] * k), Math.round(b.y + oy - d.feet[1] * k),
    Math.round(cw * k), Math.round(ch * k));
  ctx.restore();
}

// A picture in a colour filter, made once and kept: a canvas filter set every frame (a treasure
// monster's gold, a tinted spell, a dimmed body) took phones off their fast drawing path, and
// the game stuttered while one was on screen.
const tintCache = new Map();
function tinted(img, filter) {
  if (!filter || !img || !img.width) return img;
  let byImg = tintCache.get(img);
  if (!byImg) tintCache.set(img, byImg = new Map());
  let c = byImg.get(filter);
  if (!c) {
    c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d');
    g.filter = filter;
    g.drawImage(img, 0, 0);
    byImg.set(filter, c);
  }
  return c;
}
const GOLD_TINT = 'sepia(1) saturate(5) hue-rotate(-12deg) brightness(1.25)';
let monsterTint = null;

// ---------------------------------------------------------------- 연's damage digits
// The bitmap font 연 draws hits with (tools/yeon_hud.py): white digits in a black edge. Each
// kind of hit gets its colour by tinting the white (the edge stays black): white for a plain
// blow, 연's yellow for a heavy one, its red for a crit, grey for a light one.
const DIGIT_TINT = { '#d8d8d8': '#ffffff', '#ffb43a': 'rgb(255,220,60)', '#ff3a2a': 'rgb(255,60,40)' };
const tintedDigits = new Map();
function dmgFont() {
  const im = images['hud/font_damage.png'];
  return M.hud && M.hud.font_damage && im && im.width ? im : null;
}
function digitSheet(color) {
  const c0 = DIGIT_TINT[color] || color;
  let c = tintedDigits.get(c0);
  if (!c) {
    const im = dmgFont();
    c = document.createElement('canvas');
    c.width = im.width;
    c.height = im.height;
    const g = c.getContext('2d');
    g.drawImage(im, 0, 0);
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = c0;
    g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(im, 0, 0);
    tintedDigits.set(c0, c);
  }
  return c;
}
function goldFont() {
  const im = images['hud/font_gold.png'];
  return M.hud && M.hud.font_gold && im && im.width ? im : null;
}
function drawDigits(text, x, y, color, k, font = 'font_damage') {
  const f = M.hud[font], sheet = font === 'font_gold' ? goldFont() : digitSheet(color);
  const glyphs = [...text].map(ch => f.glyphs[ch]).filter(Boolean);
  const w = glyphs.reduce((a, g) => a + g[4], 0) * k;
  let cx = x - w / 2;
  for (const [gx, gy, gw, gh, adv] of glyphs) {
    ctx.drawImage(sheet, gx, gy, gw, gh, Math.round(cx), Math.round(y - f.height * k), gw * k, gh * k);
    cx += adv * k;
  }
}

// ---------------------------------------------------------------- 연's own heroes
// The heroes as 바람의나라 연 draws them (tools/yeon_avatar.py): each class in 연's own parts,
// in three outfits by the armour worn (a starter, a middle one, the dragon set), walking,
// standing, striking and casting in three directions (the side one faces left).

function yheroKey(clsId, armor) {
  // The class's armour line in thirds: the first third the starter outfit, then the middle one,
  // the best third the dragon set.
  const n = (GEAR[clsId] && GEAR[clsId].armor.length) || 6, f = Math.max(0, armor) / Math.max(1, n - 1);
  const tier = f > 2 / 3 ? 'c' : f > 1 / 3 ? 'b' : 'a';
  for (const k of [`${clsId}_${tier}`, clsId]) {
    if (M.yhero && M.yhero[k]) {
      const path = `yhero/${k}.png`;
      if (!(path in images)) loadImage(path);
      const im = images[path];
      if (im && im.complete && im.width) return { u: M.yhero[k], im };
    }
  }
  return null;
}

/** The 연 variant of each worn piece: a special by its id, the 용무기 by its step, else its tier. */
function yGearVariants(cls, gear) {
  const H = M.yhero2 && M.yhero2[cls.id];
  if (!H) return null;
  const out = { body: 'base', head: 'base' };
  for (const kind of ['armor', 'weapon', 'shield', 'helmet', 'cape']) {
    const map = H.map[kind] || {}, sp = gear[kind + 'Sp'], t = gear[kind];
    let v = null;
    if (sp) v = map[sp] || (SPECIAL[sp] ? map['t' + specialBase(SPECIAL[sp], cls.id)] : null);
    else if (kind === 'weapon' && t === dragonTier(cls)) v = map['dragon' + starOf(cls, `weapon:${t}`)] || map['t' + t];
    else if (t !== undefined && t >= 0) v = map['t' + t];
    if (v && H.layers[kind] && H.layers[kind][v]) out[kind] = v;
  }
  // What of the weapon goes behind the body (the 무사's spear shaft, the 격투가's far fist).
  if (out.weapon && H.layers.wback && H.layers.wback[out.weapon]) out.wback = out.weapon;
  return out;
}

/** Draws a hero from 연's layers in the frame's own order; false when the class has none. */
function drawYhero2(cls, gear, b, x, y, pose, alpha) {
  const H = M.yhero2 && M.yhero2[cls.id];
  if (!H) return false;
  const want = b.yv && b.yvGear === gear ? b.yv : (b.yvGear = gear, b.yv = yGearVariants(cls, gear || {}));
  const sheets = {};
  for (const [kind, v] of Object.entries(want)) {
    const meta = H.layers[kind][v], path = 'yhero2/' + meta.file;
    if (!(path in images)) loadImage(path);
    const im = images[path];
    if (!im || !im.complete || !im.width) {
      // Body and head first: without them the old sheet is drawn; a piece still loading waits.
      if (kind === 'body' || kind === 'head') return false;
      continue;
    }
    sheets[kind] = { im, cols: meta.cols || 1e9 };
  }
  const fdx = b.fdx || 0, fdy = b.fdy === undefined ? 1 : b.fdy;
  const dir = fdx ? 'side' : fdy < 0 ? 'up' : 'down';
  const name = { walk: 'walk', attack: 'atk', cast: 'cast', idle: 'idle', dead: 'dead' }[pose] || 'idle';
  // A fallen hero is 연's own ghost: the dead frame, the same from every side.
  const a = name === 'dead' && H.anims.dead ? H.anims.dead
    : H.anims[`${name}_${dir}`] || H.anims[`idle_${dir}`] || H.anims.walk_down;
  let f = 0;
  if (name === 'walk') f = Math.floor((b.walkT || 0) / a.ms) % a.n;
  else if (name === 'atk' || name === 'cast') f = Math.min(a.n - 1, Math.floor((1 - Math.max(0, b.poseT) / (name === 'atk' ? 0.22 : 0.3)) * a.n));
  const [cw, ch] = H.cell, [fx, fy] = H.foot, mirror = name !== 'dead' && dir === 'side' && fdx > 0;
  ctx.save();
  ctx.globalAlpha = 0.3 * alpha;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(Math.round(x), Math.round(y - 1), 10, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = alpha;
  ctx.translate(Math.round(x), Math.round(y));
  if (mirror) ctx.scale(-1, 1);
  for (const kind of (a.z && a.z[f]) || ['body', 'armor', 'head', 'helmet', 'shield', 'weapon']) {
    const sh = sheets[kind];
    if (!sh) continue;
    ctx.drawImage(sh.im, (f % sh.cols) * cw, (a.row + Math.floor(f / sh.cols)) * ch, cw, ch, -fx, -fy, cw, ch);
  }
  ctx.restore();
  return true;
}

/** Draws a hero from 연's sheet; false when there is none for the class. */
function drawYhero(clsId, armor, b, x, y, pose, alpha) {
  const yh = yheroKey(clsId, armor);
  if (!yh) return false;
  const fdx = b.fdx || 0, fdy = b.fdy === undefined ? 1 : b.fdy;
  const dir = fdx ? 'side' : fdy < 0 ? 'up' : 'down';
  const name = { walk: 'walk', attack: 'atk', cast: 'cast', idle: 'idle' }[pose] || 'idle';
  const a = yh.u.anims[`${name}_${dir}`] || yh.u.anims[`idle_${dir}`] || yh.u.anims.walk_down;
  let f = 0;
  if (name === 'walk') f = Math.floor((b.walkT || 0) / a.ms) % a.n;
  else if (name === 'atk' || name === 'cast') f = Math.min(a.n - 1, Math.floor((1 - Math.max(0, b.poseT) / (name === 'atk' ? 0.22 : 0.3)) * a.n));
  drawYunit(yh, b, x, y, 1, alpha, a.row, f, dir === 'side' && fdx > 0);
  return true;
}

// ---------------------------------------------------------------- 연's own monsters
// The monsters as 바람의나라 연 draws them (tools/yeon_units.py): a sheet per monster with walk,
// idle, attack and death in three directions (the side one faces left; mirrored for right),
// every frame standing on the same foot point. Loaded the first time the monster is drawn.

function yunit(m) {
  const u = M.yunit && M.yunit[m.id];
  if (!u) return null;
  const path = `yunit/${m.id}.png`;
  if (!(path in images)) loadImage(path);
  const im = images[path];
  return im && im.complete && im.width ? { u, im } : null;
}

/** Which row: the way it last moved (or faces), and what it is doing. */
function yunitAnim(u, b) {
  const dx = b.mdx || 0, dy = b.mdy === undefined ? 1 : b.mdy;
  const dir = dx ? 'side' : dy < 0 ? 'up' : 'down';
  const pick = (...names) => names.map(n => u.anims[n]).find(Boolean);
  const atk = pick(`atk_${dir}`, 'atk_side', 'atk_down');
  if (atk && b.atkAt !== undefined && (G.t - b.atkAt) * 1000 < atk.n * atk.ms) {
    return { a: atk, f: Math.min(atk.n - 1, Math.floor((G.t - b.atkAt) * 1000 / atk.ms)), dir, dx };
  }
  const walk = pick(`walk_${dir}`, 'walk_side', 'walk_down');
  const idle = pick(`idle_${dir}`);
  const a = b.moving || !idle ? walk : idle;
  if (!a) return null;
  b.seed = b.seed || Math.floor(Math.random() * 1000);
  return { a, f: Math.floor((performance.now() + b.seed) / a.ms) % a.n, dir, dx };
}

// Struck, a monster flashes white: a white copy of that one frame, not of its whole sheet.
const whiteFrames = new Map();
function whiteFrame(im, sx, sy, w, h) {
  const k = im.src + '|' + sx + '|' + sy;
  let c = whiteFrames.get(k);
  if (!c) {
    if (whiteFrames.size > 400) whiteFrames.clear();
    c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    g.drawImage(im, sx, sy, w, h, 0, 0, w, h);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = '#fff';
    g.fillRect(0, 0, w, h);
    whiteFrames.set(k, c);
  }
  return c;
}

function drawYunit(y, b, x, yy, s, alpha, row, f, mirror) {
  const { u, im } = y, [cw, ch] = u.cell, [fx, fy] = u.foot;
  const w = cw * s, h = ch * s;
  ctx.save();
  ctx.globalAlpha = 0.3 * alpha;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(Math.round(x), Math.round(yy - 1), Math.max(6, (u.foot_w || 16) * s * 0.6), 3.5 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(Math.round(x), Math.round(yy));
  if (mirror) ctx.scale(-1, 1);
  const cols = u.cols || 1e9, sx = (f % cols) * cw, sy = (row + Math.floor(f / cols)) * ch;
  ctx.drawImage(monsterTint ? tinted(im, monsterTint) : im, sx, sy, cw, ch, -fx * s, -fy * s, w, h);
  if (b.flash > 0) ctx.drawImage(whiteFrame(im, sx, sy, cw, ch), -fx * s, -fy * s, w, h);
  ctx.restore();
}

function drawMonster(b, x, y, s, alpha = 1) {
  const yu = yunit(b.m);
  if (yu) {
    const r = yunitAnim(yu.u, b);
    if (r) {
      drawYunit(yu, b, x, y, s, alpha, r.a.row, r.f, r.dir === 'side' && (r.dx > 0 || (!r.dx && b.face > 0)));
      return;
    }
  }
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
  const sil = silhouette(img), o = Math.max(1, s);
  ctx.globalAlpha = alpha * 0.85;
  for (const [ox, oy] of [[-o, 0], [o, 0], [0, -o], [0, o]]) ctx.drawImage(sil, -w / 2 + ox, -h / 2 + oy, w, h);
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  if (b.flash > 0) ctx.drawImage(white(img), -w / 2, -h / 2, w, h);
  ctx.restore();
}

function drawWalker(img, x, y, face, phase, moving, flash, scale = 1, alpha = 1, lean = 0) {
  if (monsterTint) img = tinted(img, monsterTint);
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
  // 연's sprites wear a dark outline: the silhouette a pixel out on four sides, under the picture.
  const sil = silhouette(img), o = Math.max(1, scale);
  ctx.globalAlpha = alpha * 0.85;
  for (const [ox, oy] of [[-o, 0], [o, 0], [0, -o], [0, o]]) ctx.drawImage(sil, -w / 2 + ox, -h + oy, w, h);
  ctx.globalAlpha = alpha;
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
    // Harder blows shake harder.
    const a = Math.min(5, 1 + G.shake * 12);
    camX += Math.round(rand(-a, a));
    camY += Math.round(rand(-a, a));
  }
  ctx.setTransform(Z, 0, 0, Z, -camX * Z, -camY * Z);
  ctx.fillStyle = G.ground;
  ctx.fillRect(camX, camY, VW, VH);

  // On the ground: experience, money, boxes.
  for (const d of G.drops) {
    const im = d.kind === 'gear' ? gearImage(d.gear) : d.kind === 'mat' ? matImage(d.mat)
      : images[`item/${M.items[d.kind].id}.png`];
    if (!im) continue;

    ctx.drawImage(im, Math.round(d.x - im.width / 2), Math.round(d.y - im.height - 2 + Math.sin(now * 4) * 1.5));
  }

  // A raid boss's marked tiles, blinking red until they are struck.
  for (const mk of G.marks) {
    const blink = Math.floor((G.t - mk.made) * 8) % 2;
    ctx.fillStyle = blink ? 'rgba(220, 30, 20, 0.45)' : 'rgba(220, 30, 20, 0.28)';
    for (const [x, y] of mk.tiles) ctx.fillRect(x * TILE + 1, y * TILE + 1, TILE - 2, TILE - 2);
  }

  // Bodies, back to front.
  const bodies = G.enemies.concat(G.allies, G.party, propsInView(camX, camY));
  bodies.push(p);
  bodies.sort((a, b) => a.y - b.y);
  const hidden = G.buffs.stealth > G.t;
  for (const b of bodies) {
    if (b === p) {
      drawHero(now, hidden);
      if (p.sts) drawHeroStatus(p);
      continue;
    }
    if (b.prop) {
      drawProp(b, p);
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
    // The treasure-bearer in gold, from a tinted copy made once.
    monsterTint = b.flee ? GOLD_TINT : null;
    if (b.beast) drawBeast(b, 1, lx, ly, 0.62 * s);
    else drawMonster(b, b.x + lx, b.y + ly, s);
    monsterTint = null;
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
      // A champion's tag only near the hero or once struck: a pack of tags cluttered the crowd.
      const tag = b.kind === 'boss' || b.kind === 'mini' || (b.shown && G.t - b.shown < 3)
        || Math.abs(b.x - G.player.x) + Math.abs(b.y - G.player.y) < TILE * 5;
      if (b.name && tag) outline(b.name, b.x, b.y - b.m.h * s - 4, b.kind === 'boss' ? '#ff8a6a' : '#ffe070');
    }
    // Its 상태이상, in 연's own debuff icon, over its head.
    if (b.stIcon && b.st && b.st[b.stIcon]) {
      const im = images[`hud/st_${STATUS[b.stIcon].icon}.png`];
      if (im && im.width) ctx.drawImage(im, Math.round(b.x - 6), Math.round(b.y - b.m.h * s - (b.kind ? 26 : 16)), 12, 12);
    }
  }
  for (const d of G.dying) {
    // Thrown back over the first quarter second.
    const kb = 14 * Math.min(1, d.t / 0.25) * (2 - Math.min(1, d.t / 0.25));
    const ox = (d.kx || 0) * kb, oy = (d.ky || 0) * kb * 0.6 - Math.sin(Math.min(1, d.t / 0.25) * Math.PI) * 4;
    // 연's own death, where the monster has one: its dead row, then a fade.
    const yd = !d.e.beast && yunit(d.e.m), dead = yd && yd.u.anims.dead;
    if (dead) {
      const f = Math.min(dead.n - 1, Math.floor(d.t * 1000 / dead.ms));
      drawYunit(yd, d.e, d.e.x + ox, d.e.y + oy, d.e.scale, Math.max(0, 1 - Math.max(0, d.t - 0.7) / 0.5), dead.row, f, (d.e.mdx || 0) > 0);
      continue;
    }
    // The body falls on its side, darkens and fades, as slain monsters did.
    const e = d.e, im = e.m.img, k = Math.min(1, d.t / 0.15);
    const w = im.width * e.scale, h = im.height * e.scale;
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - Math.max(0, d.t - 0.6) / 0.6);
    ctx.translate(Math.round(e.x + ox), Math.round(e.y + oy));
    ctx.rotate((Math.PI / 2) * k * e.face);
    if (!d.popped && d.t > 0.12 && d.t < 0.9) {
      // 연 marks the fallen: a small red DEAD over the body.
      ctx.save();
      ctx.rotate(-(Math.PI / 2) * k * e.face);
      ctx.font = 'bold 8px G7';
      ctx.textAlign = 'center';
      ctx.globalAlpha = Math.min(1, (0.9 - d.t) * 3);
      thick('DEAD', 0, -6, '#ff4a3a');
      ctx.restore();
    }
    if (e.beast && M.beast[e.beast]) {
      const d = M.beast[e.beast], k = 0.62 * e.scale;
      ctx.drawImage(images[`beast/${e.beast}.png`], 0, 0, d.cell[0], d.cell[1], -d.feet[0] * k, -d.feet[1] * k, d.cell[0] * k, d.cell[1] * k);
    } else ctx.drawImage(tinted(im, 'brightness(0.7)'), -w / 2, -h, w, h);
    ctx.restore();
  }

  drawShots();

  ctx.globalAlpha = 1;

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
    } else if (t.gold && goldFont()) {
      drawDigits(t.text, Math.round(t.x), Math.round(t.y), null, 0.32, 'font_gold');
    } else if (t.num && dmgFont()) {
      // 연's own damage digits: white with a black edge, tinted for the kind of hit; they pop
      // to a third larger and settle in a tenth of a second, a crit bigger still.
      const base = t.crit ? 1.0 : t.sum ? 0.8 : t.color === '#ffb43a' ? 0.66 : 0.56;
      const pop = t.crit ? (t.t < 0.12 ? 1.6 - t.t * 5 : 1) : (t.t < 0.1 ? 1.3 - t.t * 3 : 1);
      drawDigits(t.text, Math.round(t.x), Math.round(t.y), t.color, base * pop);
    } else if (t.num) {
      // A number pops in and settles; a crit larger.
      const base = t.crit ? 1.45 : t.color === '#ffb43a' ? 1.1 : 0.9;
      const k = base * (t.t < 0.1 ? 1.6 - t.t * 6 : 1);
      ctx.save();
      ctx.translate(Math.round(t.x), Math.round(t.y));
      ctx.scale(k, k);
      ctx.font = 'bold 12px G11';
      thick(t.text, 0, 0, t.color);
      ctx.restore();
      ctx.font = '10px G9';
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
  // A raid blast gathering: the screen's edge throbs red until it falls or is cut.
  if (G.blast) {
    const k = 0.25 + 0.2 * Math.sin(G.t * 18);
    const gr = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, canvas.height * 0.3,
      canvas.width / 2, canvas.height / 2, Math.hypot(canvas.width, canvas.height) / 2);
    gr.addColorStop(0, 'rgba(160,0,0,0)');
    gr.addColorStop(1, `rgba(200,20,10,${k})`);
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  // 절망 on the hero: the screen darkens round its edge, as the original's 절망 blinds.
  if (p.sts && heroStatusOn('despair')) {
    const gr = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, canvas.height * 0.25,
      canvas.width / 2, canvas.height / 2, Math.hypot(canvas.width, canvas.height) / 2);
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(1, 'rgba(0,0,0,0.75)');
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  // 연속 처치: the count at the top right while a streak runs.
  const c = G.combo;
  if (c.n >= 10 && G.t - c.t < 3) {
    const pop = Math.max(0, 1 - (G.t - c.pop) / 0.15), sc = (1 + 0.25 * pop) * (canvas.width / 860);
    ctx.save();
    ctx.translate(canvas.width - 70 * (canvas.width / 860), 64 * (canvas.width / 860));
    ctx.scale(sc, sc);
    ctx.textAlign = 'center';
    ctx.globalAlpha = Math.min(1, (3 - (G.t - c.t)) * 2);
    const base = images['hud/ui_Img_KillCombo_Base.png'], kill = images['hud/ui_Img_Kill.png'];
    if (base && base.width && kill && kill.width && goldFont()) {
      // 연's kill streak: an ink brush stroke, its 殺 mark, the count in its gold digits.
      ctx.drawImage(tinted(base, 'brightness(0.12)'), -78, -24, 128, 29);
      ctx.drawImage(c.n >= 100 ? tinted(kill, 'sepia(1) saturate(6) hue-rotate(-30deg)') : kill, -78, -28, 30, 30);
      drawDigits(String(c.n), 6, 3, null, 0.72, 'font_gold');
      ctx.font = '10px G9';
      outline('연속 처치', -6, 15, '#f0e0c0');
    } else {
      ctx.font = 'bold 18px G11';
      outline(`${c.n}`, 0, 0, c.n >= 100 ? '#ff7a3a' : '#ffe070');
      ctx.font = '10px G9';
      outline('연속 처치', 0, 13, '#f0e0c0');
    }
    ctx.restore();
  }
  drawSkillBar();
  drawYeonStatus();
  drawChain();
  drawLootFeed();
  drawJoystick();
}

function heroHeight() {
  const p = G.player;
  if (M.yhero && M.yhero[G.cls.id]) return 44;
  return p.av ? p.av.top : p.img.height;
}

/** A material's picture: an old item icon, or 연's own (st:<name> → hud/st_<name>.png). */
function matImage(id) {
  const ic = MATS[id].icon;
  return ic.startsWith('st:') ? images[`hud/st_${ic.slice(3)}.png`] : images[`item/${M.items[ic].id}.png`];
}

/** The hero's 상태이상 over their head: 연's icons, or the status's name in its colour. */
function drawHeroStatus(p) {
  const live = Object.keys(p.sts).filter(k => p.sts[k].until > G.t);
  if (!live.length) return;
  let x = Math.round(p.x - live.length * 7);
  const y = Math.round(p.y - 86);
  ctx.font = '8px G9';
  ctx.textAlign = 'center';
  for (const k of live) {
    const def = STATUS[k], im = def.icon && images[`hud/st_${def.icon}.png`];
    if (im && im.width) ctx.drawImage(im, x, y, 12, 12);
    else outline(def.name[0], x + 6, y + 9, def.color || '#ffd27a');
    x += 14;
  }
}

function drawHero(now, hidden) {
  const p = G.player;
  if (G.dead) {
    // The ghost the dead become: the hero, pale and see-through, floating.
    const y = p.y - 4 - Math.sin(now * 2) * 3;
    if (drawYhero2(G.cls, p.gear, p, p.x, y, 'dead', 0.9)) return;
    if (drawYhero(G.cls.id, p.gear ? p.gear.armor : 0, p, p.x, y, 'idle', 0.45)) return;
    if (p.av) drawAvatar(ctx, p.av, p.x, y, facing(p.fdx, p.fdy), 'idle', 0, 0.45);
    else drawWalker(p.img, p.x, y, p.face, 0, false, 0, 1, 0.45);
    return;
  }
  // 연's own figure for the class, in the outfit of the armour worn.
  const yPose = p.moving || p.stepping ? 'walk' : p.poseT > 0 ? p.pose : 'idle';
  if (drawYhero2(G.cls, p.gear, p, p.x, p.y, yPose, hidden ? 0.35 : 1)) return;
  if (drawYhero(G.cls.id, p.gear ? p.gear.armor : 0, p, p.x, p.y, yPose, hidden ? 0.35 : 1)) return;
  // Struck, the hero does not flicker: the client showed a blow only in the health bar.
  if (!p.av) {
    drawWalker(p.img, p.x, p.y, p.face, p.phase, p.moving, 0, 1, hidden ? 0.35 : 1);
    return;
  }
  // The wardrobe figure: four directions, four walking frames, attack and casting poses.
  const dir = facing(p.fdx, p.fdy);
  // Walking, the legs keep going while the spells fly (as in 연): the strike pose shows standing.
  const pose = p.moving || p.stepping ? 'walk' : p.poseT > 0 ? p.pose : 'idle';
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
  // A shout over a character's head, as 바람의나라 연 draws them: a dark see-through pill with a
  // thin light rim and white letters, a small tail below.
  if (!settings.bubbles) return;
  const RIM = 'rgba(230,230,235,0.9)', EDGE = 'rgba(0,0,0,0.5)', FILL = 'rgba(22,22,28,0.82)';
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
  ctx.fillStyle = '#ffffff';
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
  // 바람의나라 연's title: its emblem over the snowy peaks at dusk, filling the screen (the
  // menus after the title see it dimmed).
  const tb = M.ui.ytitle && images['ui/title_bg.jpg'];
  if (tb && tb.width) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = true;
    const k = Math.max(canvas.width / tb.width, canvas.height / tb.height);
    const w = tb.width * k, h = tb.height * k;
    // Held by its top, so the emblem is always whole; on a wide phone the clouds below go first.
    ctx.drawImage(tb, (canvas.width - w) / 2, 0, w, h);
    ctx.imageSmoothingEnabled = false;
    if ($('#title').hidden) {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    return;
  }
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
const BASE_STATS = { warrior: [30, 8, 14], rogue: [18, 10, 26], mage: [8, 30, 12], poet: [10, 26, 12], archer: [14, 12, 28], lancer: [26, 9, 18], monk: [24, 8, 22], magus: [8, 32, 12] };
const TITLES = ['초보 사냥꾼', '사냥꾼', '숙련된 사냥꾼', '용사', '영웅', '전설'];

/** The side panel and the map tab, kept in step with the hunt. */
function syncUlt() {
  if (!G) return;
  const p = G.player;
  put('#ult-mode', ultMode(G.cls.id) === 'hunt' ? '사냥' : '보스');
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
    // The 필살기 button is outside the panel: it is kept up to date without it too.
    const ready = p.mp >= p.maxMp && !G.dead && ultWait() <= 0;
    put('#ult span', ultShown(G.cls.id).name);
    put('#ult small', ultWait() > 0 ? `${Math.ceil(ultWait())}초` : ready ? '준비됨' : `${Math.floor(100 * p.mp / p.maxMp)}%`);
    const ic = `url(${ultShown(G.cls.id).icon})`;
    if (shown.ultIcon !== ic) { shown.ultIcon = ic; ultBtn.style.backgroundImage = ic; }
    ultBtn.classList.toggle('ready', ready);
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
  const ready = p.mp >= p.maxMp && !G.dead && ultWait() <= 0;
  put('#ult span', ultShown(G.cls.id).name);
  put('#ult small', ultWait() > 0 ? `${Math.ceil(ultWait())}초` : ready ? '준비됨' : `마력 ${Math.floor(p.mp)}/${p.maxMp}`);
  ultBtn.classList.toggle('ready', ready);
}

/** Folds the side panel away for a wider view, or brings it back; remembered between runs. */
function setPanel(on) {
  settings.panel = on;
  saveJson('bs_settings', settings);
  document.body.classList.toggle('panel-off', !on);
  document.body.classList.toggle('yeon', !on && document.body.classList.contains('hunting'));
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
  $('#opt-auto').textContent = '레벨업 자동 선택: ' + (settings.autoPick ? '켬' : '끔');
  $('#lv-auto').textContent = settings.autoPick ? '자동 선택 켬' : '자동 선택';
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
$('#ult-mode').onclick = e => { e.stopPropagation(); toggleUltMode(); };
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
const toggleAuto = () => {
  settings.autoPick = !settings.autoPick;
  saveJson('bs_settings', settings);
  syncSettings();
  // Turned on at a level-up: this card is taken at once too.
  if (settings.autoPick && G && G.choosing && !G.banishing) {
    const b = [...document.querySelectorAll('#choices .choice')];
    const picks = b.map(x => x._card).filter(Boolean);
    if (picks.length) {
      const o = bestCard(picks);
      lootFeed(`자동 선택 · ${cardName(o)}`);
      choose(o);
    }
  }
};
$('#opt-auto').onclick = toggleAuto;
$('#lv-auto').onclick = toggleAuto;
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

const EVENTS = [['hit', '타격'], ['crit', '치명타'], ['kill', '몬스터 쓰러짐'], ['hurt', '맞음'], ['levelup', '레벨업'], ['pickup', '줍기'],
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
  // 5차~9차: the sound list has none of these by name, so each takes the named sound closest to
  // what it is (a teleport 비영사천문, a wind 어두운바람소리, a death sentence 비명소리와 종소리),
  // and spells sharing a sound play it at their own pitch ('NNN@speed').
  skill_w_rush: '100@1.15', skill_w_stone: '084@0.85', skill_w_dragon: '101@0.9', skill_w_frenzy: '705',
  skill_w_thunder: '059@0.85', skill_w_flash: '354@1.1', skill_w_blackdragon: '060@0.8', skill_w_sentence: '020',
  skill_w_dawn: '065@1.1', skill_w_swords: '091@0.95', skill_w_advance: '104@0.9', skill_w_myriad: '035@0.85',
  skill_r_venom: '716@1.1', skill_r_phantom: '039@1.1', skill_r_shuriken: '709@0.9', skill_r_hidden: '096@1.1',
  skill_r_bloom: '090@1.1', skill_r_kill: '349', skill_r_flamesword: '357@0.9', skill_r_shadowstar: '716@0.85',
  skill_r_shadowclone: '039@0.85', skill_r_bloodslash: '064@0.9', skill_r_chainstar: '709@1.2', skill_r_gale: '035@1.15',
  skill_m_frost: '054', skill_m_wisdom: '105@1.1', skill_m_desert: '044@0.9', skill_m_twin: '059',
  skill_m_cross: '073@1.1', skill_m_inferno: '093@0.9', skill_m_thunderball: '058@1.1', skill_m_shift: '001',
  skill_m_coldveil: '053@0.85', skill_m_gale: '002', skill_m_shards: '052@1.2', skill_m_kalpa: '073@0.8',
  skill_p_judge: '057@1.1', skill_p_wargod: '084@1.1', skill_p_burst: '104@1.15', skill_p_realm: '097@0.9',
  skill_p_bagua: '109@0.9', skill_p_dragongod: '702', skill_p_flash: '701@1.2', skill_p_bind: '070',
  skill_p_warmth: '098@1.1', skill_p_thunderbomb: '700@1.1', skill_p_skyspirit: '066@0.9', skill_p_taiji: '109@0.75',
  // A kill thuds with the strong blade's hit (337), a crit rings with the client's own crit (349).
  hit: '331', kill: '337', crit: '349', hurt: '-', levelup: '123', pickup: '406', heal: '074', chest: '503', boss: '509',
  win: '401', lose: '402', revive: '112', party_guard: '008',
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
    if ((Array.isArray(n) ? n : [n]).every(x => x === '-' || bank.has(x.split('@')[0]))) d[use] = n;
  }
  // 바람의나라 연's own clips win wherever the build carries them (they go by name, not number:
  // checked against every file, not the numbered bank, or none of them was ever used).
  for (const [use, n] of Object.entries(YEON_SOUNDS)) {
    if ((Array.isArray(n) ? n : [n]).every(x => x === '-' || audio.has(x.split('@')[0]))) d[use] = n;
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
  // 바람의나라 연's own login theme (from its app) where the build has it.
  if (has('yeon_login')) d.bgm_title = 'yeon_login';
  if (has('bs_charcreate')) d.bgm_select = 'bs_charcreate';
  if (has('nx_08_2_Goguryeo')) d.bgm_town = 'nx_08_2_Goguryeo';
  if (has('nx_10_4way_battle')) d.bgm_boss = 'nx_10_4way_battle';
  for (const st of STAGES) if (has(st.bgm)) d['bgm_stage_' + st.id] = st.bgm;
  for (const r of RAIDS) if (has(r.bgm)) d['bgm_raid_' + r.id] = r.bgm;
  // 연's boss and raid music: the boss theme, and each raid's by where it is fought.
  if (has(YEON_BGM.boss)) d.bgm_boss = YEON_BGM.boss;
  const raidBgm = { sea: YEON_BGM.raid_sea, lava: YEON_BGM.raid_fire, house: YEON_BGM.raid_hell };
  for (const r of RAIDS) {
    const k = raidBgm[r.terrain] || YEON_BGM.raid;
    if (has(k)) d['bgm_raid_' + r.id] = k;
  }
  // Each ground's own music in 연, read off its map of the same name (and a raid's, where 연
  // has one for it).
  for (const [id, k] of Object.entries(YEON_STAGE_BGM)) if (has(k)) d['bgm_stage_' + id] = k;
  for (const [id, k] of Object.entries(YEON_RAID_BGM)) if (has(k)) d['bgm_raid_' + id] = k;
  return d;
}

function migrateSettings() {
  if (settings.layoutVer !== 1) {
    // 바람의나라 연's full-screen hunt by default; the carved panel is a tap away (상태창).
    settings.panel = false;
    settings.layoutVer = 1;
    saveJson('bs_settings', settings);
  }
  if (settings.numbersVer !== 2) {
    // 바람의나라 연 shows every blow's number: on by default (it can still be turned off).
    settings.numbers = true;
    settings.numbersVer = 2;
    saveJson('bs_settings', settings);
  }
}

function applySounds() {
  migrateSettings();
  // Picks made before the sounds had names were guesses: start again from the game's own.
  if (settings.soundsVer !== 8) {
    delete settings.sounds;
    delete settings.kinds;
    settings.soundsVer = 8;
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
      const nm = !Array.isArray(v) && v && (M.audio.names || {})[String(v).split('@')[0]];
      val.title = nm || '';
      name.textContent = nm ? `${label} · ${nm}` : label;
    };
    const move = d => {
      const cur = audio.map[key];
      const i = Math.max(0, options.indexOf(String(Array.isArray(cur) ? cur[0] : cur || '-').split('@')[0]));
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

// Test: every piece of gear of the class in play, worn in turn — its icon, its stats, the
// hero drawn in it and the equipment window — returning what failed.
window.__gearTest = () => {
  const bad = [], cls = G.cls, c = cls.id, keep = { ...G.player.gear };
  const check = (label, kind, t, sp) => {
    try {
      wear(kind, t, sp);
      const icon = pieceIcon(cls, kind, t, sp);
      if (!icon && !(kind === 'armor')) bad.push(label + ': no icon');
      if (!(G.player.gearPower > 0) || !(G.player.maxHp > 0)) bad.push(label + ': bad stats');
      render(performance.now() / 1000);
    } catch (e) {
      bad.push(label + ': ' + e.message);
    }
  };
  for (const kind of ['weapon', 'armor', 'shield', 'helmet', 'cape']) {
    (GEAR[c][kind] || []).forEach((name, t) => check(`${kind} ${t} ${name}`, kind, t, null));
  }
  let n = 0;
  for (const sp of Object.values(SPECIAL)) {
    if (sp.cls && sp.cls !== c) continue;
    n++;
    check(`special ${sp.id} ${specialName(sp, c)}`, sp.kind, specialBase(sp, c), sp.id);
  }
  try { $('#equip').hidden = false; buildEquip(); $('#equip').hidden = true; } catch (e) { bad.push('equip window: ' + e.message); }
  for (const [k, v] of Object.entries(keep)) if (!k.endsWith('Sp')) wear(k, v, keep[k + 'Sp'] || null);
  return { cls: c, tried: ['weapon', 'armor', 'shield', 'helmet', 'cape'].reduce((a, k) => a + (GEAR[c][k] || []).length, 0) + n, bad };
};
window.__dragonTier = () => dragonTier(G.cls);
window.__Z = () => Z;
window.__hurtPlayer = d => hurtPlayer(d, null);
window.__hurtPlayerFrom = (d, e) => hurtPlayer(d, e);
window.__event = k => huntEvent(k);
window.__openPortal = t => openPortal(t);
window.__silentSkills = () => {
  const has = n => (Array.isArray(n) ? n : [n]).some(x => x && x !== '-' && audio.has(String(x).split('@')[0]));
  return Object.entries(SKILLS).filter(([id, d]) => d.kind !== 'passive' && !has(audio.map['skill_' + id]))
    .map(([id, d]) => [id, d.name, d.kind, audio.map['skill_' + id] || null]);
};
window.__game = () => G;
window.__clear = () => clearStage();
window.__start = (c, s) => startRun(CLASSES[c], STAGES[s]);
window.__stageList = () => STAGES.map((s, i) => [i, s.id, s.terrain]);
window.__draw = () => drawCards();
window.__raid = (c, r) => startRun(CLASSES[c], RAIDS[r] || RAIDS.find(x => x.id === 'raid_' + r));
window.__quests = () => openQuests();

boot();
