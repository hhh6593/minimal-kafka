// 코디 (외형): 바람의나라 연's own costume items (tools/yeon_costume.py) worn over the hero's gear.
// A costume only changes the look: the slot's piece keeps its stats. Each class keeps its own
// choice (progress.costume.wear[cls]); the costumes owned are shared by all classes, and owning
// many of them gives small lasting bonuses, as 연's 코디 수집.
//
// The costume layers are more variants of the class's layers (manifest yhero2[cls].layers[kind]
// ["c<id>"]); a layer reaching past the class's cell has its own "cell" and "foot". The face
// decorations are a layer of their own, drawn just over the head.

export const KINDS = [['armor', '의상'], ['helmet', '머리 장식'], ['cape', '등 장식'], ['face', '얼굴 장식']];
// 일반 for 전, 고급 for 레이드주화, 희귀 from raids, 대항전 and bosses only.
export const GRADES = [
  { name: '일반', gold: 3000, color: '#4a6a20' },
  { name: '고급', coins: 60, color: '#1a4a9a' },
  { name: '희귀', color: '#8a1a9a' },
];
// 코디 수집: owned costumes -> lasting bonuses (each step adds).
export const COLLECT = [
  [5, { hp: 20 }], [10, { armor: 1 }], [20, { dmg: 0.02 }], [30, { hp: 30 }], [45, { dmg: 0.02 }],
  [60, { armor: 1 }], [80, { dmg: 0.03 }], [110, { hp: 50 }], [140, { dmg: 0.03 }],
];
// Given at the first visit: something to wear before the first purchase.
const STARTER = ['76017', '202093', '804206'];

let A = null;
let version = 0;

export function initCostume(api) { A = api; }
export function costumeVersion() { return version; }

/** Every costume the build has: {id: {kind, name, whole, icon, classes, grade}}. */
export function costumeItems() {
  const items = (A && A.M().ycostume) || {};
  if (!items.__graded) {
    // Grades by the item's place in its slot's list (the list runs plain to splendid).
    for (const [kind] of KINDS) {
      const ids = Object.keys(items).filter(id => items[id].kind === kind);
      ids.forEach((id, i) => { items[id].grade = Math.min(2, Math.floor(3 * i / Math.max(1, ids.length))); });
    }
    Object.defineProperty(items, '__graded', { value: true });
  }
  return items;
}

function state() {
  const p = A.progress();
  p.costume = Object.assign({ own: {}, wear: {} }, p.costume || {});
  if (!p.costume.started) {
    for (const id of STARTER) if (costumeItems()[id]) p.costume.own[id] = 1;
    p.costume.started = 1;
  }
  return p.costume;
}

export function ownsCostume(id) { return !!state().own[id]; }
export function ownedCount() { return Object.keys(state().own).filter(id => costumeItems()[id]).length; }

/** What a class wears: {kind: id} of owned costumes its figure has. */
export function wornCostume(clsId) {
  if (!A || !A.M().ycostume) return null;
  const w = state().wear[clsId] || {}, items = costumeItems(), out = {};
  for (const [kind, id] of Object.entries(w)) {
    const it = items[id];
    if (it && it.kind === kind && state().own[id] && it.classes.includes(clsId)) out[kind] = id;
  }
  return Object.keys(out).length ? out : null;
}

export function setCostume(clsId, kind, id) {
  const s = state();
  const w = s.wear[clsId] = Object.assign({}, s.wear[clsId]);
  if (id) w[kind] = id;
  else delete w[kind];
  version++;
  A.save();
}

/** Gives a costume (from a drop or a purchase); false when it was owned already. */
export function giveCostume(id) {
  const s = state();
  if (s.own[id] || !costumeItems()[id]) return false;
  s.own[id] = 1;
  version++;
  A.save();
  return true;
}

/** A costume not owned yet, at random, of the grades given (for drops); null when none is left. */
export function randomCostume(grades = [0, 1, 2]) {
  const items = costumeItems();
  const left = Object.keys(items).filter(id => !state().own[id] && grades.includes(items[id].grade));
  return left.length ? left[Math.floor(Math.random() * left.length)] : null;
}

/** A drop: a costume of those grades, announced; returns its name or null. */
export function dropCostume(grades, from) {
  const id = randomCostume(grades);
  if (!id || !giveCostume(id)) return null;
  const it = costumeItems()[id];
  A.say(`${from}: 코디 [${it.name}]을(를) 얻었습니다! (마을의 코디에서 입습니다)`, 'sys');
  return it.name;
}

/** The 코디 수집 bonuses of the costumes owned. */
export function costumeBonus() {
  const n = A && A.M().ycostume ? ownedCount() : 0, b = { hp: 0, armor: 0, dmg: 0, n };
  for (const [at, add] of COLLECT) if (n >= at) for (const [k, v] of Object.entries(add)) b[k] += v;
  b.next = COLLECT.find(([at]) => n < at);
  return b;
}

/** The variants a costume puts on a hero (applied over the gear's in game.js yGearVariants). */
export function costumeVariants(H, cos, out) {
  if (!cos) return out;
  const items = costumeItems();
  for (const [kind, id] of Object.entries(cos)) {
    const v = 'c' + id;
    if (!H.layers[kind] || !H.layers[kind][v]) continue;
    out[kind] = v;
    if (kind === 'helmet' && items[id] && items[id].whole && H.layers.head && H.layers.head.nohair) out.head = 'nohair';
  }
  return out;
}

// ---------------------------------------------------------------- drawing the layers

/** The frame box of a set of layers: the class's cell, grown to hold any costume's own cell. */
export function frameBox(H, metas) {
  const [cw, ch] = H.cell, [fx, fy] = H.foot;
  let x0 = -fx, y0 = -fy, x1 = cw - fx, y1 = ch - fy;
  for (const m of metas) {
    if (!m || !m.cell) continue;
    x0 = Math.min(x0, -m.foot[0]);
    y0 = Math.min(y0, -m.foot[1]);
    x1 = Math.max(x1, m.cell[0] - m.foot[0]);
    y1 = Math.max(y1, m.cell[1] - m.foot[1]);
  }
  return { cw: x1 - x0, ch: y1 - y0, fx: -x0, fy: -y0 };
}

/** The layers of frame f of anim a, back to front (a face decoration just over the head). */
export function layerOrder(a, f, kinds) {
  const z = ((a.z && a.z[f]) || ['body', 'armor', 'head', 'helmet', 'shield', 'weapon']).slice();
  if (kinds.face && !z.includes('face')) {
    const i = z.indexOf('head');
    if (i >= 0) z.splice(i + 1, 0, 'face');
  }
  return z;
}

/** Draws frame f of anim a from sheets {kind: {im, meta}} onto g, the feet at box.fx, box.fy. */
export function drawLayers(g, H, sheets, a, f, box) {
  const [cw, ch] = H.cell, [fx, fy] = H.foot;
  for (const kind of layerOrder(a, f, sheets)) {
    const sh = sheets[kind];
    if (!sh) continue;
    const m = sh.meta, cols = m.cols || 1e9, w = m.cell ? m.cell[0] : cw, h = m.cell ? m.cell[1] : ch;
    const mx = m.foot ? m.foot[0] : fx, my = m.foot ? m.foot[1] : fy;
    g.drawImage(sh.im, (f % cols) * w, (a.row + Math.floor(f / cols)) * h, w, h, box.fx - mx, box.fy - my, w, h);
  }
}

// ---------------------------------------------------------------- the 코디 window

let tab = 'armor', pick = null, trial = {}, previewTimer = 0, pose = 'walk';
const $ = s => document.querySelector(s);

export function openCoordi() {
  const cls = A.cls();
  if (!cls || !A.M().yhero2 || !A.M().yhero2[cls.id] || !A.M().ycostume) {
    A.say('이 직업은 아직 코디를 입을 수 없습니다.', 'warn');
    return;
  }
  state();
  trial = Object.assign({}, state().wear[cls.id] || {});
  for (const [k, id] of Object.entries(trial)) if (!ownsCostume(id)) delete trial[k];
  pick = null;
  $('#coordi').hidden = false;
  buildCoordi();
  clearInterval(previewTimer);
  previewTimer = setInterval(drawPreview, 90);
}

function closeCoordi() {
  $('#coordi').hidden = true;
  clearInterval(previewTimer);
}

function buildCoordi() {
  const cls = A.cls(), items = costumeItems(), p = A.progress();
  $('#coordi-title').textContent = `코디 · ${cls.name}`;
  $('#coordi-gold').textContent = `${A.won(p.gold || 0)} · 레이드주화 ${p.coins || 0} · 수집 ${ownedCount()}/${Object.keys(items).length}`;
  const tb = $('#coordi-tabs');
  tb.innerHTML = '';
  for (const [k, label] of [...KINDS, ['collect', '수집 효과']]) {
    const bt = document.createElement('button');
    bt.className = 'btn' + (k === tab ? ' on' : '');
    const n = k === 'collect' ? 0 : Object.keys(items).filter(id => items[id].kind === k && ownsCostume(id)).length;
    bt.innerHTML = label + (n ? ` <i>${n}</i>` : '');
    bt.onclick = () => { tab = k; pick = null; buildCoordi(); };
    tb.append(bt);
  }
  const list = $('#coordi-list'), keepTab = list.dataset.tab === tab, top = list.scrollTop;
  list.innerHTML = '';
  list.dataset.tab = tab;
  // Picking keeps the list where it was (a new tab starts at the top).
  requestAnimationFrame(() => { list.scrollTop = keepTab ? top : 0; });
  const detail = $('#coordi-detail');
  if (tab === 'collect') return buildCollect(list, detail);
  const ids = Object.keys(items).filter(id => items[id].kind === tab && items[id].classes.includes(cls.id))
    .sort((x, y) => (ownsCostume(y) - ownsCostume(x)) || items[x].grade - items[y].grade);
  // 벗기: the slot's own gear shows again.
  const none = document.createElement('div');
  none.className = 'forge-item' + (!trial[tab] ? ' on' : '');
  none.innerHTML = '<div class="noimg"></div><b>장비 그대로</b><small>코디 없음</small>';
  none.onclick = () => { delete trial[tab]; pick = null; buildCoordi(); };
  list.append(none);
  for (const id of ids) {
    const it = items[id], own = ownsCostume(id), el = document.createElement('div');
    el.className = 'forge-item' + (trial[tab] === id ? ' on' : '') + (own ? ' ready' : ' done');
    const g = GRADES[it.grade];
    el.innerHTML = (it.icon ? `<img src="assets/${it.icon}" alt="">` : '<div class="noimg"></div>')
      + `<b>${it.name}</b><small style="color:${g.color}">${g.name}${own ? ' · 보유' : ''}</small>`;
    el.onclick = () => { trial[tab] = id; pick = id; buildCoordi(); };
    list.append(el);
  }
  buildDetail(detail, cls);
}

function buildDetail(detail, cls) {
  const items = costumeItems(), id = pick || trial[tab], it = id && items[id], p = A.progress();
  detail.innerHTML = '<canvas id="coordi-preview" width="400" height="128"></canvas>';
  const poses = document.createElement('div');
  poses.className = 'coordi-poses';
  for (const [k, label] of [['walk', '걷기'], ['idle', '서기'], ['attack', '공격'], ['cast', '마법']]) {
    const b = document.createElement('button');
    b.className = 'btn' + (pose === k ? ' on' : '');
    b.textContent = label;
    b.onclick = () => { pose = k; buildCoordi(); };
    poses.append(b);
  }
  detail.append(poses);
  const info = document.createElement('div');
  info.className = 'coordi-info';
  if (it) {
    const g = GRADES[it.grade], own = ownsCostume(id);
    const how = own ? '보유' : g.gold ? `${A.won(g.gold)}에 삽니다` : g.coins ? `레이드주화 ${g.coins}개에 삽니다` : '레이드·대항전 승리, 보스의 보물에서 나옵니다';
    info.innerHTML = `<b>${it.name}</b> <span style="color:${g.color}">${g.name}</span><br><small>${how}${it.whole ? ' · 머리째 덮는 장식' : ''} · 능력치는 장비 그대로</small>`;
    if (!own && (g.gold || g.coins)) {
      const buy = document.createElement('button');
      buy.className = 'btn';
      const can = g.gold ? (p.gold || 0) >= g.gold : (p.coins || 0) >= g.coins;
      buy.disabled = !can;
      buy.textContent = '사기';
      buy.onclick = () => {
        if (g.gold) p.gold -= g.gold;
        else p.coins -= g.coins;
        giveCostume(id);
        A.say(`코디 [${it.name}]을(를) 샀습니다.`, 'sys');
        buildCoordi();
      };
      info.append(buy);
    }
  } else info.innerHTML = '<small>고른 코디를 미리 입어 봅니다. 가진 것만 저장됩니다.</small>';
  detail.append(info);
  const row = document.createElement('div');
  row.className = 'coordi-actions';
  const save = document.createElement('button');
  save.className = 'btn fd-go';
  save.textContent = '이대로 입기';
  save.onclick = () => {
    for (const [kind] of KINDS) {
      const v = trial[kind];
      setCostume(cls.id, kind, v && ownsCostume(v) ? v : null);
    }
    A.changed();
    A.say('코디를 바꿨습니다.', 'sys');
    buildCoordi();
  };
  const strip = document.createElement('button');
  strip.className = 'btn';
  strip.textContent = '모두 벗기';
  strip.onclick = () => { trial = {}; pick = null; buildCoordi(); };
  row.append(strip, save);
  detail.append(row);
  drawPreview();
}

function buildCollect(list, detail) {
  const b = costumeBonus();
  list.innerHTML = '';
  for (const [at, add] of COLLECT) {
    const el = document.createElement('div');
    el.className = 'forge-item' + (b.n >= at ? ' ready' : ' done');
    const txt = Object.entries(add).map(([k, v]) => (k === 'hp' ? `체력 +${v}` : k === 'armor' ? `방어 +${v}` : `피해 +${Math.round(v * 100)}%`)).join(', ');
    el.innerHTML = `<b>${at}벌 모으기</b><small>${txt}</small>`;
    list.append(el);
  }
  detail.innerHTML = `<div class="coordi-info"><b>코디 수집 ${b.n}벌</b><br><small>모든 직업이 함께: 체력 +${b.hp}, 방어 +${b.armor}, 피해 +${Math.round(b.dmg * 100)}%`
    + `${b.next ? ` · 다음 ${b.next[0]}벌` : ''}</small><br><small>일반 코디는 전으로, 고급 코디는 레이드주화로 사고, 희귀 코디는 레이드·대항전 승리와 사냥터 보스의 보물에서 얻습니다.</small></div>`;
}

const sheetCache = new Map();
function sheet(path) {
  let im = sheetCache.get(path);
  if (!im) {
    im = new Image();
    im.src = 'assets/' + path;
    sheetCache.set(path, im);
    if (sheetCache.size > 40) sheetCache.delete(sheetCache.keys().next().value);
  }
  return im.complete && im.naturalWidth ? im : null;
}

/** The hero in the trial look, in the four directions, walking (or the pose picked). */
function drawPreview() {
  const cv = document.getElementById('coordi-preview');
  if (!cv || $('#coordi').hidden) return;
  const cls = A.cls(), H = A.M().yhero2[cls.id];
  const gear = Object.assign({}, A.savedGear(cls));
  Object.defineProperty(gear, 'cos', { value: trial, enumerable: false });
  const want = A.yGearVariants(cls, gear);
  const g = cv.getContext('2d');
  g.clearRect(0, 0, cv.width, cv.height);
  const sheets = {};
  for (const [kind, v] of Object.entries(want)) {
    const meta = H.layers[kind] && H.layers[kind][v];
    const im = meta && sheet('yhero2/' + meta.file);
    if (im) sheets[kind] = { im, meta };
  }
  const box = frameBox(H, Object.values(sheets).map(s => s.meta));
  const t = performance.now();
  const name = { walk: 'walk', idle: 'idle', attack: 'atk', cast: 'cast' }[pose];
  const dirs = [['down', false], ['side', true], ['up', false], ['side', false]];
  const step = cv.width / 4, k = Math.min(1, (cv.height - 8) / 110);
  dirs.forEach(([dir, mirror], i) => {
    const a = H.anims[`${name}_${dir}`] || H.anims[`idle_${dir}`];
    const f = Math.floor(t / (pose === 'walk' ? a.ms : pose === 'idle' ? 500 : 160)) % a.n;
    g.save();
    g.translate(Math.round(step * i + step / 2), cv.height - 6);
    g.scale(mirror ? -k : k, k);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.beginPath();
    g.ellipse(0, -1, 10, 3.5, 0, 0, Math.PI * 2);
    g.fill();
    g.translate(-box.fx, -box.fy);
    drawLayers(g, H, sheets, a, f, box);
    g.restore();
  });
}

export function bindCoordi() {
  $('#coordi-close').onclick = closeCoordi;
  // Test: give and wear costumes, open the window (the verify scripts).
  window.__costume = { give: giveCostume, wear: setCostume, items: costumeItems, open: openCoordi, worn: wornCostume, bonus: costumeBonus, sheet: testSheet };
}

/** Test: every frame of every anim of a class in a look, as the game composes them (a data URL;
 *  null while a sheet is still loading). Rows: anims; the side rows twice (left, then right). */
function testSheet(cos, cls = A.cls()) {
  const H = A.M().yhero2[cls.id];
  const gear = Object.assign({}, A.savedGear(cls));
  Object.defineProperty(gear, 'cos', { value: cos, enumerable: false });
  const want = A.yGearVariants(cls, gear), sheets = {};
  for (const [kind, v] of Object.entries(want)) {
    const meta = H.layers[kind] && H.layers[kind][v];
    if (!meta) continue;
    const im = sheet('yhero2/' + meta.file);
    if (!im) return null;
    sheets[kind] = { im, meta };
  }
  const box = frameBox(H, Object.values(sheets).map(s => s.meta));
  const rows = [];
  for (const [name, a] of Object.entries(H.anims)) {
    rows.push([name, a, false]);
    if (name.endsWith('_side')) rows.push([name + '_r', a, true]);
  }
  const n = Math.max(...rows.map(r => r[1].n));
  const c = document.createElement('canvas');
  c.width = box.cw * n;
  c.height = box.ch * rows.length;
  const g = c.getContext('2d');
  g.fillStyle = '#3e5a3a';
  g.fillRect(0, 0, c.width, c.height);
  rows.forEach(([, a, mirror], r) => {
    for (let f = 0; f < a.n; f++) {
      g.save();
      g.translate(f * box.cw + (mirror ? box.cw : 0), r * box.ch);
      if (mirror) g.scale(-1, 1);
      drawLayers(g, H, sheets, a, f, box);
      g.restore();
    }
  });
  return c.toDataURL();
}
