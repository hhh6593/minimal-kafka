// 코디 (외형): 바람의나라 연's own costume items (tools/yeon_costume.py) worn over the hero's gear —
// outfits, hats, back and face pieces, weapon and shield looks — and 연's pets (tools/yeon_pets.py),
// one walking at the hero's heel. A costume only changes the look: the slot's piece keeps its
// stats, and the equip window still shows the real gear with its stars and 용무기 step. Each class
// keeps its own choice (progress.costume.wear[cls]); what is owned is shared by all classes, and
// owning many gives small lasting bonuses, as 연's 코디 수집 (capped as before).
//
// 헤어·얼굴: 연's own hair styles and faces (its 미용실 and 성형외과, tools/yeon_costume.py hair head),
// free and always owned, as the old 미용실 was. The hero's head is then drawn in parts: the face
// (head "c<id>", or "nohair": the class's own face without its hair), the hair over it (hair
// "c<id>", or "own": the class's own hair) and what of it hangs behind the body (back "c<id>").
//
// Some 1400 looks and 360 pets: their list (assets/ycostume/index.json, prepare_assets.py) is read
// after the title shows, and each sheet only when it is worn or tried on. The layers join the
// classes' own (manifest yhero2[cls].layers[kind]["c<id>"]), each with its own cell and foot.

export const KINDS = [['armor', '의상'], ['hair', '헤어'], ['head', '얼굴'], ['helmet', '모자'], ['cape', '등'], ['face', '장식'], ['weapon', '무기'], ['shield', '방패'], ['pet', '환수']];
// Kinds every class has for free: not bought, not dropped, not counted in 코디 수집.
const FREE = new Set(['hair', 'head']);
const isFree = it => !!it && FREE.has(it.kind) && !it.musin;
// 연's grades (the items' MinGrade). 일반·고급 can be bought at any time; 희귀·영웅 when the shop
// has them in its stock (it turns over every six hours); 전설 only from 뽑기 and the best rewards.
export const GRADES = [
  { name: '일반', gold: 3000, color: '#4a6a20' },
  { name: '고급', gold: 8000, color: '#1a4a9a' },
  { name: '희귀', coins: 40, color: '#8a1a9a' },
  { name: '영웅', coins: 100, color: '#b05a00' },
  { name: '전설', color: '#c01818' },
];
// 코디 뽑기 (전 only): the chance of each grade, in hundredths.
export const PULL = { gold: 6000, ten: 54000, rate: [46, 32, 15, 6, 1] };
const SHOP_N = 8, SHOP_MS = 6 * 3600 * 1000, REROLL = 2000;
// 코디 수집: what is owned (looks and pets) -> lasting bonuses (each step adds; in all 체력 +100,
// 방어 +2, 피해 +10%, as when there were 165 looks).
export const COLLECT = [
  [10, { hp: 20 }], [30, { armor: 1 }], [60, { dmg: 0.02 }], [120, { hp: 30 }], [200, { dmg: 0.02 }],
  [320, { armor: 1 }], [480, { dmg: 0.03 }], [700, { hp: 50 }], [1000, { dmg: 0.03 }],
];
// 투명 모자 · 투명 망토 · 투명 방패: worn in the 모자, 등 and 방패 slots, they hide what the hero has
// there (the gear's piece, a special one too; its stats stay), showing the hair (or the 헤어 picked)
// under a hidden hat. Free and always owned, like 코디 없음, and listed right after it.
export const HIDE = 'hide';
const HIDE_NAME = { helmet: '투명 모자', cape: '투명 망토', shield: '투명 방패' };
const HIDE_WHAT = { helmet: '투구·모자', cape: '망토', shield: '방패' };
// The layers a slot's piece is drawn in (a shield look's far part is its own layer, sback).
const SLOT_LAYERS = { helmet: ['helmet'], cape: ['cape'], shield: ['shield', 'sback'] };
// 아바타 프리셋: each class keeps this many whole looks (progress.costume.presets[cls]).
const PRESETS = 5;
// 사신수 무신의 헤어: the original's own hairs (its dress room's renders laid on 연's hairless head,
// tools/sinsu_worn.py hair: layers hair and back "c<id>", picture yhero2/sinsu/<id>_icon.png). Looks
// only, 전설, never sold, pulled or dropped: each 신수's pair (남·여, worn by any class) comes with its
// 성물's raid won (items.js SINSU_GATE: 청룡 바루나, 주작 아그니, 백호 아이라바타; 현무 해왕 and
// 바루나 both), shared by every class.
export const MUSIN_HAIR = [];
for (const [s, name, raids, gate] of [['cheong', '청룡', ['raid_varuna'], '바루나 레이드'], ['baekho', '백호', ['raid_airavata'], '아이라바타 레이드'],
  ['jujak', '주작', ['raid_agni'], '아그니 레이드'], ['hyeonmu', '현무', ['raid_varuna', 'raid_sea'], '바루나 레이드와 해왕 레이드']]) {
  for (const [g, gn] of [['m', '남'], ['f', '여']]) MUSIN_HAIR.push({ id: `musin_${s}_${g}`, name: `${name}무신의헤어(${gn})`, raids, gate });
}
const MUSIN_ORDER = Object.fromEntries(MUSIN_HAIR.map((h, i) => [h.id, i]));

/** Gives the 사신수 무신의 헤어 whose raids are all won (progress.raids); their names. */
export function unlockMusinHair(from) {
  if (!A || !D) return [];
  const won = A.progress().raids || {}, items = costumeItems(), got = [];
  for (const h of MUSIN_HAIR) {
    if (items[h.id] && h.raids.every(r => won[r]) && giveCostume(h.id)) got.push(h.name);
  }
  if (got.length && from) A.say(`${from}: 코디 헤어 [${got.join('], [')}]을(를) 얻었습니다! (마을의 코디 · 헤어에서 입습니다)`, 'sys');
  return got;
}

// Given at the first visit: something to wear before the first purchase.
const STARTER = ['76017', '202093', '804206'];

let A = null;
let version = 0;
let D = null; // the loaded list: {items: {id: item}, pets: {id: pet}}
let loading = null;

export function initCostume(api) { A = api; }
export function costumeVersion() { return version; }

/** Reads the list of looks and pets (once); the layers join the classes' own. */
export function loadCostumes() {
  const m = A && A.M() && A.M().ycostume;
  if (loading || !m || !m.index) return loading || Promise.resolve(null);
  loading = fetch('assets/' + m.index).then(r => r.json()).then(j => {
    const metas = j.files.map(([file, cols, cw, ch, fx, fy, side]) => ({ file, cols, cell: [cw, ch], foot: [fx, fy], side }));
    const items = {};
    for (const [id, [kind, name, grade, set, whole, icon]] of Object.entries(j.items)) {
      if (/\[사용안함\]|사용안함/.test(name)) continue; // 연's retired entries ("[사용안함]용마제일검")
      items[id] = { id, kind, name, grade: Math.max(0, Math.min(4, grade)), set, whole: !!whole, icon: icon ? `ycostume/i/${id}.png` : null, classes: [] };
      // A hair style of no hair (대머리) has no picture: every class can wear it.
      if (kind === 'hair' && whole) items[id].classes = Object.keys(A.M().yhero2 || {});
    }
    const H2 = A.M().yhero2 || {};
    for (const [cls, kinds] of Object.entries(j.layers)) {
      const H = H2[cls];
      if (!H) continue;
      for (const [kind, vs] of Object.entries(kinds)) {
        const L = H.layers[kind] = H.layers[kind] || {};
        for (const [v, fi] of Object.entries(vs)) {
          L[v] = metas[fi];
          const it = items[v.slice(1)];
          if (it && kind !== 'wback' && kind !== 'sback' && kind !== 'aback' && kind !== 'back' && !it.classes.includes(cls)) it.classes.push(cls);
        }
      }
    }
    // (연's pets run 일반 to 신화, a grade more than the looks: their 일반 and 고급 are 일반 here, their 신화 전설.)
    for (const [id, [name, grade, file, cols, cw, ch, fx, fy, anims, icon]] of Object.entries(j.pets || {})) {
      const an = {};
      for (const [k, [row, n, ms]] of Object.entries(anims)) an[k] = { row, n, ms };
      items['p' + id] = { id: 'p' + id, kind: 'pet', name, grade: Math.max(0, Math.min(4, grade - 1)), set: '', icon: icon ? `ycostume/i/p${id}.png` : null,
        classes: Object.keys(H2), pet: { file, cols, cell: [cw, ch], foot: [fx, fy], anims: an } };
    }
    // 사신수 무신의 헤어: their layers came with the heroes' own (the manifest, prepare_assets.py).
    for (const h of MUSIN_HAIR) {
      const classes = Object.keys(H2).filter(c => H2[c].layers.hair && H2[c].layers.hair['c' + h.id]);
      if (classes.length) items[h.id] = { id: h.id, kind: 'hair', name: h.name, grade: 4, set: '사신수 무신', whole: false, musin: h, icon: `yhero2/sinsu/${h.id}_icon.png`, classes };
    }
    for (const id of Object.keys(items)) if (!items[id].classes.length) delete items[id];
    D = { items };
    // A save whose raids were won before these hairs came gets them now.
    unlockMusinHair('사신수 레이드 승리');
    version++;
    if (A.changed) A.changed();
    return D;
  }).catch(e => { console.warn('코디 목록', e); return null; });
  return loading;
}

/** Every look and pet the build has: {id: {kind, name, grade, set, whole, icon, classes, pet?}}. */
export function costumeItems() { return (D && D.items) || {}; }

function state() {
  const p = A.progress();
  p.costume = Object.assign({ own: {}, wear: {} }, p.costume || {});
  if (!p.costume.started) {
    for (const id of STARTER) p.costume.own[id] = 1;
    p.costume.started = 1;
  }
  return p.costume;
}

export function ownsCostume(id) { return id === HIDE || isFree(costumeItems()[id]) || !!state().own[id]; }
/** How many are owned (the list need not be read yet: 코디 수집 counts from the save). */
export function ownedCount() { return Object.keys(state().own).length; }

/** What a class wears: {kind: id} of owned looks its figure has (and its pet). */
export function wornCostume(clsId) {
  if (!A || !D) return null;
  const w = state().wear[clsId] || {}, items = costumeItems(), out = {};
  for (const [kind, id] of Object.entries(w)) {
    if (id === HIDE) {
      if (HIDE_NAME[kind]) out[kind] = id;
      continue;
    }
    const it = items[id];
    if (it && it.kind === kind && ownsCostume(id) && it.classes.includes(clsId)) out[kind] = id;
  }
  return Object.keys(out).length ? out : null;
}

/** Whether a class can wear id in that slot (an owned look its figure has, or 투명). */
function wearable(clsId, kind, id) {
  if (id === HIDE) return !!HIDE_NAME[kind];
  const it = costumeItems()[id];
  return !!it && it.kind === kind && ownsCostume(id) && it.classes.includes(clsId);
}

export function setCostume(clsId, kind, id) {
  const s = state();
  const w = s.wear[clsId] = Object.assign({}, s.wear[clsId]);
  if (id) w[kind] = id;
  else delete w[kind];
  version++;
  A.save();
}

/** Gives a look or pet (a drop, a purchase, a pull); false when it was owned already. */
export function giveCostume(id) {
  const s = state();
  if (s.own[id] || !costumeItems()[id] || isFree(costumeItems()[id])) return false;
  s.own[id] = 2; // 2: new, not yet looked at
  version++;
  A.save();
  return true;
}

/** Not owned yet, at random, of the grades given; null when none is left. */
export function randomCostume(grades = [0, 1, 2, 3]) {
  const items = costumeItems(), own = state().own;
  const left = Object.keys(items).filter(id => !own[id] && !isFree(items[id]) && !items[id].musin && grades.includes(items[id].grade));
  return left.length ? left[Math.floor(Math.random() * left.length)] : null;
}

/** A drop from a raid, a war or a boss: tiers 0 (일반·고급), 1 (희귀), 2 (영웅, now and then 전설). */
export function dropCostume(tiers, from) {
  if (!D) return null;
  const grades = [];
  for (const t of tiers) grades.push(...(t === 0 ? [0, 1] : t === 1 ? [2] : Math.random() < 0.15 ? [3, 4] : [3]));
  const id = randomCostume(grades) || randomCostume([0, 1, 2]);
  if (!id || !giveCostume(id)) return null;
  const it = costumeItems()[id];
  A.say(`${from}: ${it.kind === 'pet' ? '환수' : '코디'} [${it.name}]을(를) 얻었습니다! (마을의 코디에서 입습니다)`, 'sys');
  return it.name;
}

// An AI fighter's 코디 (war.js aiLook): 연's own pieces worn in the field, more and finer the higher
// its step (0-3): a hair and a face most of the time, an outfit, a hat, a cape or a weapon look
// now and then, of grades that rise with the step. Lists by class and kind made once.
const aiLists = new Map();
const AI_WEAR = { // chance by step, and the grades drawn from at each step
  armor: [[0.12, 0.3, 0.5, 0.7], [[0, 1], [1, 2], [1, 2, 3], [2, 3, 4]]],
  helmet: [[0.06, 0.15, 0.25, 0.35], [[0, 1], [1], [1, 2], [2, 3, 4]]],
  cape: [[0, 0.12, 0.25, 0.4], [[0, 1], [1], [1, 2], [2, 3, 4]]],
  weapon: [[0, 0.08, 0.18, 0.3], [[0, 1], [1], [1, 2], [2, 3, 4]]],
};
export function aiCostume(clsId, step) {
  if (!D) return null;
  const items = costumeItems();
  const list = (kind, grades) => {
    const key = clsId + kind + grades.join();
    if (!aiLists.has(key)) aiLists.set(key, Object.keys(items).filter(id => items[id].kind === kind && grades.includes(items[id].grade) && items[id].classes.includes(clsId)));
    return aiLists.get(key);
  };
  const any = ids => (ids.length ? ids[Math.floor(Math.random() * ids.length)] : null);
  const out = {};
  if (Math.random() < 0.8) out.hair = any(list('hair', [0]));
  if (Math.random() < 0.55) out.head = any(list('head', [0]));
  for (const [kind, [chance, grades]] of Object.entries(AI_WEAR)) {
    const i = Math.max(0, Math.min(3, step));
    if (Math.random() < chance[i]) out[kind] = any(list(kind, grades[i]));
  }
  for (const k of Object.keys(out)) if (!out[k]) delete out[k];
  return Object.keys(out).length ? out : null;
}

/** The 코디 수집 bonuses of what is owned. */
export function costumeBonus() {
  const n = A ? ownedCount() : 0, b = { hp: 0, armor: 0, dmg: 0, n };
  for (const [at, add] of COLLECT) if (n >= at) for (const [k, v] of Object.entries(add)) b[k] += v;
  b.next = COLLECT.find(([at]) => n < at);
  return b;
}

/** The variants a costume puts on a hero (applied over the gear's in game.js yGearVariants). */
export function costumeVariants(H, cos, out) {
  if (!cos) return out;
  const items = costumeItems();
  let wholeHat = false;
  for (const [kind, id] of Object.entries(cos)) {
    // 투명 모자 / 망토: the worn helmet or cape not drawn (its stats stay).
    if (id === HIDE) {
      if (HIDE_NAME[kind]) for (const k of SLOT_LAYERS[kind]) delete out[k];
      continue;
    }
    const v = 'c' + id;
    if (kind === 'pet' || FREE.has(kind) || !H.layers[kind] || !H.layers[kind][v]) continue;
    out[kind] = v;
    // A weapon look brings its own second part (behind the body, the off hand), or none.
    if (kind === 'weapon') {
      if (H.layers.wback && H.layers.wback[v]) out.wback = v;
      else delete out.wback;
    }
    // An outfit's parts off the body (wings, a cape, a tail: its prefab's Sprite_b), or none.
    if (kind === 'armor') {
      if (H.layers.aback && H.layers.aback[v]) out.aback = v;
      else delete out.aback;
    }
    // A shield look's far part (a sheath's strap, the half behind the body), or none.
    if (kind === 'shield') {
      if (H.layers.sback && H.layers.sback[v]) out.sback = v;
      else delete out.sback;
    }
    if (kind === 'helmet' && items[id] && items[id].whole && H.layers.head && H.layers.head.nohair) {
      out.head = 'nohair';
      wholeHat = true;
    }
  }
  return headParts(H, cos, out, wholeHat);
}

/** 헤어·얼굴: the head in parts (a face, a hair over it, what hangs behind), the hat that holds the
 *  hair (wholeHat) leaving the face alone. Without either the class's own head stays whole. */
function headParts(H, cos, out, wholeHat) {
  const L = H.layers, hair = cos.hair, face = cos.head;
  if (!hair && !face) return out;
  const fv = face && L.head && L.head['c' + face] ? 'c' + face : 'nohair';
  if (!L.head || !L.head[fv]) return out;
  if (wholeHat) {
    out.head = fv;
    return out;
  }
  const it = hair && costumeItems()[hair];
  if (it && it.whole) out.head = fv; // 대머리: the face alone
  else if (hair && L.hair && L.hair['c' + hair]) {
    out.head = fv;
    out.hair = 'c' + hair;
    // 사신수 무신의 헤어 under a hat or helmet (one drawn, not 투명): its cut at the top of the
    // skull, the original's crown and ornament not poking through the hat.
    if (out.helmet && L.hair['c' + hair + '_h']) out.hair = 'c' + hair + '_h';
    if (L.back && L.back['c' + hair]) out.back = 'c' + hair;
  } else if (fv !== 'nohair' && L.hair && L.hair.own) {
    out.head = fv;
    out.hair = 'own';
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

/** The layers of frame f of anim a, back to front (a face decoration just over the head; a
 *  weapon look's second part behind the body on a class whose own weapons have none). */
export function layerOrder(a, f, kinds) {
  const z = ((a.z && a.z[f]) || ['body', 'armor', 'head', 'helmet', 'shield', 'weapon']).slice();
  if (kinds.face && !z.includes('face')) {
    const i = z.indexOf('head');
    if (i >= 0) z.splice(i + 1, 0, 'face');
  }
  // A hair of its own goes over the face, under a face decoration and the hat.
  if (kinds.hair && !z.includes('hair')) {
    const i = z.indexOf('head');
    if (i >= 0) z.splice(i + 1, 0, 'hair');
  }
  // 사신수 무신의 헤어 (MUSIN_HAIR): what of it hangs is behind the body in every frame, as the
  // original draws it (its part over the body is in its hair layer); 연's own long hairs come over
  // the body striking aside.
  if (kinds.back && kinds.back.meta && /^sinsu\//.test(kinds.back.meta.file || '')) {
    const i = z.indexOf('back');
    if (i >= 0) z.splice(i, 1);
    if (z.indexOf('body') >= 0) z.splice(z.indexOf('body'), 0, 'back');
  }
  if (kinds.wback && !z.includes('wback')) z.splice(Math.max(0, z.indexOf('body')), 0, 'wback');
  if (kinds.sback && !z.includes('sback')) z.splice(Math.max(0, z.indexOf('body')), 0, 'sback');
  if (kinds.aback && !z.includes('aback')) z.splice(Math.max(0, z.indexOf('body')), 0, 'aback');
  // A weapon or shield look's two layers each know, per frame, the side of the body 연 draws them
  // on (its sorting): where the class's own piece is on the other side, the layer moves across
  // (청룡 심판의낫's shaft behind the body, its blade in front; a sheath or a quiver carried on the
  // back behind the body from the front, over it from behind).
  for (const kind of ['weapon', 'wback', 'shield', 'sback', 'aback']) {
    const side = sideOf(kinds[kind], a, f);
    if (!side || z.indexOf('body') < 0) continue;
    // A frame the class's own piece is not drawn in (its shield facing up, its hands in a cast)
    // still shows the look where 연 draws it.
    if (!z.includes(kind)) z.splice(z.indexOf('body'), 0, kind);
    const i = z.indexOf(kind), b = z.indexOf('body');
    if ((side === 'f') === (i > b)) continue;
    z.splice(i, 1);
    if (side === 'f') z.splice(Math.max(z.indexOf('body'), z.indexOf('armor')) + 1, 0, kind);
    else z.splice(z.indexOf('body'), 0, kind);
  }
  return z;
}

/** 'f' (in front of the body), 'b' (behind) or null: a weapon look's layer in frame f of anim a. */
function sideOf(sh, a, f) {
  const s = sh && sh.meta && sh.meta.side, r = s && s[a.row];
  const c = r && r[f];
  return c === 'f' || c === 'b' ? c : null;
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

// ---------------------------------------------------------------- the pet at the hero's heel

/** The pet a class has out (its item), or null. */
export function petOf(clsId) {
  const w = wornCostume(clsId);
  const it = w && w.pet && costumeItems()[w.pet];
  return it && it.pet ? it : null;
}

/** Moves the pet of `holder` (holder.cpet) after `hero` ({x, y, fdx, fdy, face}): it walks to a
 *  spot a little behind and beside the hero, and waits there. One pet, the hero's only. */
export function updateCosPet(holder, hero, clsId, dt, speed = 160) {
  const it = petOf(clsId);
  if (!it) { holder.cpet = null; return; }
  let p = holder.cpet;
  if (!p || p.id !== it.id) p = holder.cpet = { cpet: true, id: it.id, it, x: hero.x - 26, y: hero.y + 6, fdx: -1, fdy: 0, moving: false, t: 0 };
  p.t += dt;
  const fx = hero.fdx || 0, fy = hero.fdy === undefined ? 1 : hero.fdy;
  const n = Math.hypot(fx, fy) || 1;
  const tx = hero.x - fx / n * 26 + (fy ? 14 : 0), ty = hero.y - fy / n * 18 + (fx ? 8 : 0);
  const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
  if (d > 260) { p.x = tx; p.y = ty; p.moving = false; return; }
  // Walks past 10px off its spot, stops under 3 (no flicker at one distance), and turns only on a
  // clear heading: a side row while it goes mostly sideways, front or back only when clearly up or
  // down — it flipped between front and side each step as the hero's tile steps pulled it.
  p.moving = p.moving ? d > 3 : d > 10;
  if (p.moving) {
    const v = Math.min(d, Math.max(speed * 0.6, Math.min(speed * 1.6, d * 5)) * dt);
    p.x += dx / d * v;
    p.y += dy / d * v;
    const ax = Math.abs(dx), ay = Math.abs(dy);
    if (ay > ax * 2) { p.fdy = Math.sign(dy); p.fdx = 0; }
    else if (ax > ay * 1.2 && ax > 4) { p.fdx = Math.sign(dx); p.fdy = 0; }
    if (!p.fdy && !p.fdx) p.fdy = 1;
  }
  p.y0 = p.y;
}

/** Draws a pet as 연 does: its walk or idle row of the way it faces (the side one faces left). */
export function drawCosPet(g, p, alpha = 1) {
  const pe = p.it.pet, im = sheet(pe.file);
  if (!im) return;
  const side = p.fdx && !(Math.abs(p.fdy) > 0), dir = side ? 'side' : p.fdy < 0 ? 'up' : 'down';
  const a = pe.anims[`${p.moving ? 'walk' : 'idle'}_${dir}`] || pe.anims.idle_down;
  if (!a) return;
  const f = Math.floor(p.t * 1000 / Math.max(60, a.ms)) % a.n, [cw, ch] = pe.cell, [fx, fy] = pe.foot, cols = pe.cols || 1e9;
  g.save();
  g.globalAlpha = 0.25 * alpha;
  g.fillStyle = '#000';
  g.beginPath();
  g.ellipse(Math.round(p.x), Math.round(p.y - 1), Math.max(6, Math.min(16, cw * 0.3)), 3, 0, 0, Math.PI * 2);
  g.fill();
  g.globalAlpha = alpha;
  g.translate(Math.round(p.x), Math.round(p.y));
  if (side && p.fdx > 0) g.scale(-1, 1);
  g.drawImage(im, (f % cols) * cw, (a.row + Math.floor(f / cols)) * ch, cw, ch, -fx, -fy, cw, ch);
  g.restore();
}

// ---------------------------------------------------------------- shop and 뽑기

function shop() {
  const s = state(), items = costumeItems(), slot = Math.floor(Date.now() / SHOP_MS);
  if (!s.shop || s.shop.slot !== slot || !s.shop.ids.every(id => items[id])) {
    // Mostly 희귀 and 영웅 (the grades not for sale at all times), some of the others.
    const pool = Object.keys(items).filter(id => items[id].grade < 4 && !s.own[id] && !isFree(items[id]) && !items[id].musin);
    const ids = [];
    for (let i = 0; i < SHOP_N * 6 && ids.length < SHOP_N && pool.length; i++) {
      const id = pool[Math.floor(Math.random() * pool.length)], g = items[id].grade;
      if (!ids.includes(id) && Math.random() < (g >= 2 ? 1 : 0.35)) ids.push(id);
    }
    s.shop = { slot, ids };
    A.save();
  }
  return s.shop;
}

/** One pull: a grade by PULL.rate, then a look or pet of it not owned yet (a lower grade when all of
 *  it is owned); null when everything is owned. */
function pullOne(min = 0) {
  let r = Math.random() * 100, g = 0;
  for (; g < 4 && r >= PULL.rate[g]; g++) r -= PULL.rate[g];
  g = Math.max(g, min);
  for (let k = g; k >= 0; k--) {
    const id = randomCostume([k]);
    if (id) { giveCostume(id); return id; }
  }
  return null;
}

function pull(n) {
  const p = A.progress(), cost = n === 10 ? PULL.ten : PULL.gold;
  if ((p.gold || 0) < cost) return null;
  p.gold -= cost;
  const got = [];
  for (let i = 0; i < n; i++) {
    // Ten at once: the last is 희귀 or better if none of the nine was.
    const id = pullOne(n === 10 && i === 9 && !got.some(x => costumeItems()[x].grade >= 2) ? 2 : 0);
    if (id) got.push(id);
  }
  // Everything owned already: the 전 of the pulls not made back.
  if (got.length < n) p.gold += Math.round(cost * (n - got.length) / n);
  A.save();
  return got;
}

// ---------------------------------------------------------------- the 코디 window

let tab = 'armor', pick = null, trial = {}, previewTimer = 0, pose = 'walk';
const F = { q: '', grade: -1, own: 'all', sets: false };
let lastPulls = [];
const $ = s => document.querySelector(s);

/** Opens the 코디 window (on the tab `at`, e.g. 'hair' from the equip window). */
export function openCoordi(at) {
  const cls = A.cls();
  if (!cls || !A.M().yhero2 || !A.M().yhero2[cls.id] || !A.M().ycostume || !A.M().ycostume.index) {
    A.say('이 직업은 아직 코디를 입을 수 없습니다.', 'warn');
    return;
  }
  state();
  if (at && KINDS.some(([k]) => k === at)) { tab = at; vscroll.top = 0; }
  $('#coordi').hidden = false;
  const go = () => {
    trial = Object.assign({}, state().wear[cls.id] || {});
    for (const [k, id] of Object.entries(trial)) if (!ownsCostume(id)) delete trial[k];
    pick = null;
    buildCoordi();
    clearInterval(previewTimer);
    previewTimer = setInterval(drawPreview, 90);
  };
  if (D) go();
  else {
    $('#coordi-list').innerHTML = '<div class="coordi-note">코디 목록을 읽는 중…</div>';
    loadCostumes().then(() => { if (!$('#coordi').hidden) go(); });
  }
}

function closeCoordi() {
  $('#coordi').hidden = true;
  clearInterval(previewTimer);
  // Looked at: what was new is not new any more.
  const own = state().own;
  for (const id of seen) if (own[id] === 2) own[id] = 1;
  seen.clear();
  A.save();
}
const seen = new Set();

function canWear(cls, it) { return it.classes.includes(cls.id); }

function tabCount(cls, kind) {
  const items = costumeItems(), own = state().own;
  let n = 0, fresh = 0;
  for (const id in items) {
    const it = items[id];
    if (it.kind !== kind || !(own[id] || isFree(it)) || !canWear(cls, it)) continue;
    n++;
    if (own[id] === 2) fresh++;
  }
  return { n, fresh };
}

function buildCoordi() {
  const cls = A.cls(), items = costumeItems(), p = A.progress();
  $('#coordi-title').textContent = `코디 · ${cls.name}`;
  const total = Object.values(items).filter(it => !isFree(it)).length;
  $('#coordi-gold').innerHTML = (A.walletHTML ? A.walletHTML(p.gold, p.coins) : `${A.won(p.gold || 0)} · 레이드주화 ${p.coins || 0}`) + `<span class="wcollect">수집 ${ownedCount()}/${total}</span>`;
  const tb = $('#coordi-tabs');
  tb.innerHTML = '';
  const kinds = KINDS.filter(([k]) => k === 'pet' || Object.values(items).some(it => it.kind === k && canWear(cls, it)));
  if (!kinds.some(([k]) => k === tab) && !['shop', 'pull', 'collect'].includes(tab)) tab = 'armor';
  for (const [k, label] of [...kinds, ['shop', '상점'], ['pull', '뽑기'], ['collect', '수집']]) {
    const bt = document.createElement('button');
    bt.className = 'btn' + (k === tab ? ' on' : '');
    const c = KINDS.some(([x]) => x === k) ? tabCount(cls, k) : { n: 0, fresh: 0 };
    bt.innerHTML = label + (c.fresh ? ` <i style="background:#c02010">+${c.fresh}</i>` : c.n ? ` <i>${c.n}</i>` : '');
    bt.onclick = () => { tab = k; pick = null; vscroll.top = 0; buildCoordi(); };
    tb.append(bt);
  }
  const filt = $('#coordi-filter');
  filt.hidden = !KINDS.some(([k]) => k === tab);
  const detail = $('#coordi-detail');
  if (tab === 'collect') return buildCollect(detail);
  if (tab === 'shop') return buildShop(detail, cls);
  if (tab === 'pull') return buildPull(detail);
  renderList(cls);
  buildDetail(detail, cls);
}

// The list: only the rows in sight are made (a slot holds hundreds); icons load as they show.
const vscroll = { rows: [], top: 0 };
const ROW_H = 62, HEAD_H = 18;

function listIds(cls) {
  const items = costumeItems(), own = state().own, q = F.q.trim().toLowerCase();
  const ids = Object.keys(items).filter(id => {
    const it = items[id];
    if (it.kind !== tab || !canWear(cls, it)) return false;
    if (F.grade >= 0 && it.grade !== F.grade) return false;
    if (F.own === 'own' && !own[id] && !isFree(it)) return false;
    if (F.own === 'not' && (own[id] || isFree(it))) return false;
    if (F.own === 'new' && own[id] !== 2) return false;
    return !q || it.name.toLowerCase().includes(q) || (it.set && it.set.toLowerCase().includes(q));
  });
  // (헤어·얼굴 in 연's own order, its ids: the plain ones first.)
  // (사신수 무신의 헤어 first.)
  if (FREE.has(tab)) ids.sort((x, y) => (items[y].musin ? 1 : 0) - (items[x].musin ? 1 : 0) || (items[x].musin ? MUSIN_ORDER[x] - MUSIN_ORDER[y] : +x - +y));
  else ids.sort((x, y) => ((own[y] ? 1 : 0) - (own[x] ? 1 : 0)) || items[y].grade - items[x].grade || items[x].name.localeCompare(items[y].name, 'ko'));
  return ids;
}

function renderList(cls) {
  const list = $('#coordi-list'), items = costumeItems();
  const ids = listIds(cls);
  $('#coordi-count').textContent = `${ids.length}개`;
  const cols = Math.max(1, Math.floor((list.clientWidth || 300) / 92));
  // Rows: the 벗기 cell first; with 세트, items of a set (two or more of this slot, as 연 names
  // its sets) under the set's name, the rest after (the 벗기 cell then on a row of its own).
  const cells = [];
  // The 투명 cell right after 코디 없음 (투명 방패 only for a class that carries a shield).
  const H2 = (A.M().yhero2 || {})[cls.id];
  const lead = HIDE_NAME[tab] && (tab !== 'shield' || (H2 && H2.layers.shield)) ? [{ none: true }, { hide: true }] : [{ none: true }];
  const rows = [{ cells: lead }];
  if (F.sets) {
    const by = new Map();
    for (const id of ids) {
      const s = items[id].set;
      if (s) by.set(s, (by.get(s) || []).concat(id));
    }
    const solo = ids.filter(id => !items[id].set || by.get(items[id].set).length < 2);
    const groups = [...by.entries()].filter(([, v]) => v.length >= 2).sort((a, b) => a[0].localeCompare(b[0], 'ko'));
    for (const [name, v] of groups) {
      rows.push({ head: `${name} (${v.length})` });
      for (let i = 0; i < v.length; i += cols) rows.push({ cells: v.slice(i, i + cols).map(id => ({ id })) });
    }
    if (solo.length) rows.push({ head: '세트 아닌 것' });
    cells.push(...solo.map(id => ({ id })));
  } else {
    // The 벗기 cell leads the first row.
    rows.length = 0;
    cells.push(...lead);
    cells.push(...ids.map(id => ({ id })));
  }
  for (let i = 0; i < cells.length; i += cols) rows.push({ cells: cells.slice(i, i + cols) });
  let y = 0;
  for (const r of rows) {
    r.y = y;
    y += r.head ? HEAD_H : ROW_H + 4;
  }
  vscroll.rows = rows;
  vscroll.cols = cols;
  vscroll.h = y;
  vscroll.cls = cls;
  list.innerHTML = '';
  const spacer = document.createElement('div');
  spacer.style.height = y + 'px';
  list.append(spacer);
  vscroll.made = new Map();
  list.onscroll = () => { vscroll.top = list.scrollTop; paintRows(); };
  list.scrollTop = vscroll.top;
  paintRows();
}

function paintRows() {
  const list = $('#coordi-list'), items = costumeItems(), own = state().own, cls = vscroll.cls;
  const top = list.scrollTop, bottom = top + (list.clientHeight || 300);
  const want = new Set();
  for (let i = 0; i < vscroll.rows.length; i++) {
    const r = vscroll.rows[i];
    if (r.y + ROW_H < top - ROW_H * 2 || r.y > bottom + ROW_H * 2) continue;
    want.add(i);
    if (vscroll.made.has(i)) continue;
    let el;
    if (r.head) {
      el = document.createElement('div');
      el.className = 'vhead';
      el.textContent = r.head;
    } else {
      el = document.createElement('div');
      el.className = 'vrow';
      el.style.gridTemplateColumns = `repeat(${vscroll.cols}, minmax(0, 1fr))`;
      for (const c of r.cells) {
        const d = document.createElement('div');
        if (c.none) {
          d.className = 'forge-item' + (!trial[tab] ? ' on' : '');
          d.innerHTML = '<div class="noimg"></div><b>' + ({ pet: '데리고 다니지 않기', hair: '직업 기본 머리', head: '직업 기본 얼굴' }[tab] || '장비 그대로')
            + '</b><small>' + (FREE.has(tab) ? '처음 모습' : '코디 없음') + '</small>';
          d.onclick = () => { delete trial[tab]; pick = null; repaint(cls); };
        } else if (c.hide) {
          d.className = 'forge-item ready' + (trial[tab] === HIDE ? ' on' : '');
          d.innerHTML = `<div class="noimg hide">숨김</div><b>${HIDE_NAME[tab]}</b><small>${HIDE_WHAT[tab]} 감추기 · 무료</small>`;
          d.onclick = () => { trial[tab] = HIDE; pick = null; repaint(cls); };
        } else {
          const it = items[c.id], free = isFree(it), o = free || own[c.id], g = GRADES[it.grade];
          d.className = 'forge-item' + (trial[tab] === c.id ? ' on' : '') + (o ? ' ready' : ' done');
          d.innerHTML = (it.icon ? `<img loading="lazy" decoding="async" src="assets/${it.icon}" alt="">` : '<div class="noimg"></div>')
            + `<b>${it.name}</b>` + (free ? '<small>무료</small>' : `<small style="color:${g.color}">${g.name}${o ? ' · 보유' : ''}</small>`) + (o === 2 ? '<em>NEW</em>' : '');
          if (o === 2) seen.add(c.id);
          d.onclick = () => { trial[tab] = c.id; pick = c.id; repaint(cls); };
        }
        el.append(d);
      }
    }
    el.style.top = r.y + 'px';
    list.append(el);
    vscroll.made.set(i, el);
  }
  for (const [i, el] of vscroll.made) if (!want.has(i)) { el.remove(); vscroll.made.delete(i); }
}

/** After a pick: the list's marks and the detail, the list staying where it is. */
function repaint(cls) {
  for (const el of vscroll.made.values()) el.remove();
  vscroll.made.clear();
  paintRows();
  buildDetail($('#coordi-detail'), cls);
}

function howToGet(it, inShop) {
  const g = GRADES[it.grade];
  if (it.musin) return `${it.musin.gate}를 이기면 얻습니다(남·여 모두, 모든 직업 공용)`;
  if (it.grade <= 1) return `${A.won(g.gold)}에 삽니다`;
  if (it.grade <= 3) return inShop ? `상점 진열 중: 레이드주화 ${g.coins}개` : '상점 진열(6시간마다 바뀜)·뽑기·레이드·대항전·보스에서 얻습니다';
  return '뽑기와 레이드·대항전 승리, 보스의 보물에서만 나옵니다';
}

function buyButton(id, after) {
  const items = costumeItems(), it = items[id], g = GRADES[it.grade], p = A.progress();
  const inShop = shop().ids.includes(id);
  if (ownsCostume(id) || !(g.gold || (g.coins && inShop))) return null;
  const buy = document.createElement('button');
  buy.className = 'btn';
  buy.disabled = g.gold ? (p.gold || 0) < g.gold : (p.coins || 0) < g.coins;
  buy.textContent = g.gold ? `사기 ${A.won(g.gold)}` : `사기 주화 ${g.coins}`;
  buy.onclick = () => {
    if (g.gold) p.gold -= g.gold;
    else p.coins -= g.coins;
    giveCostume(id);
    state().own[id] = 1;
    A.say(`${it.kind === 'pet' ? '환수' : '코디'} [${it.name}]을(를) 샀습니다.`, 'sys');
    after();
  };
  return buy;
}

function buildDetail(detail, cls) {
  const items = costumeItems(), id = pick || trial[tab], it = id && items[id];
  detail.innerHTML = '<canvas id="coordi-preview" width="400" height="136"></canvas>';
  const poses = document.createElement('div');
  poses.className = 'coordi-poses';
  for (const [k, label] of [['walk', '걷기'], ['idle', '서기'], ['attack', '공격'], ['cast', '마법']]) {
    const b = document.createElement('button');
    b.className = 'btn' + (pose === k ? ' on' : '');
    b.textContent = label;
    b.onclick = () => { pose = k; buildDetail(detail, cls); };
    poses.append(b);
  }
  detail.append(poses);
  const info = document.createElement('div');
  info.className = 'coordi-info';
  if (id === HIDE && HIDE_NAME[tab]) {
    info.innerHTML = `<b>${HIDE_NAME[tab]}</b> <span>무료</span><br><small>쓰고 있는 ${HIDE_WHAT[tab]}를 감춥니다. 능력치는 장비 그대로`
      + `${tab === 'helmet' ? ', 머리(고른 헤어)가 보입니다' : ''}.</small>`;
  } else if (it) {
    const g = GRADES[it.grade], own = ownsCostume(id);
    const note = it.kind === 'weapon' || it.kind === 'shield' ? ' · 모습만: 장비 창에는 실제 무기·별·용무기 단계 그대로'
      : it.kind === 'pet' ? ' · 사냥·마을·레이드·대항전에서 뒤를 따라다님'
        : isFree(it) ? ' · 언제든 무료로 바꿈(머리째 덮는 모자를 쓰면 머리카락은 가려짐)' : ' · 능력치는 장비 그대로';
    info.innerHTML = isFree(it) ? `<b>${it.name}</b> <span>${it.kind === 'hair' ? '헤어' : '얼굴'}</span><br><small>연의 ${it.kind === 'hair' ? '미용실' : '성형외과'}${note}</small>`
      : `<b>${it.name}</b> <span style="color:${g.color}">${g.name}</span>${it.set ? ` <small>· ${it.set}</small>` : ''}<br>`
      + `<small>${own ? '보유' : howToGet(it, shop().ids.includes(id))}${it.whole ? ' · 머리째 덮는 장식' : ''}${note}</small>`;
    const b = buyButton(id, () => buildCoordi());
    if (b) info.append(document.createElement('br'), b);
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
  // 되돌리기: the preview back to what the hero wears now (a trial not yet saved is dropped).
  const undo = document.createElement('button');
  undo.className = 'btn';
  undo.textContent = '되돌리기';
  undo.title = '미리 입어 본 것을 취소하고 지금 입은 모습으로';
  undo.onclick = () => {
    trial = Object.assign({}, state().wear[cls.id] || {});
    for (const [k, id] of Object.entries(trial)) if (!ownsCostume(id)) delete trial[k];
    pick = null;
    buildCoordi();
  };
  // 원래 모습: every costume off at once and saved — the class's own look, as before any 코디
  // (what was worn stays owned, and a 아바타 프리셋 can bring it back).
  const orig = document.createElement('button');
  orig.className = 'btn';
  orig.textContent = '원래 모습으로';
  orig.title = '코디를 모두 벗고 직업 본래의 모습으로 바로 저장합니다. 가진 코디는 그대로 남습니다.';
  orig.onclick = () => {
    for (const [kind] of KINDS) setCostume(cls.id, kind, null);
    trial = {};
    pick = null;
    A.changed();
    A.say('코디를 모두 벗고 원래 모습으로 돌아왔습니다.', 'sys');
    buildCoordi();
  };
  row.append(undo, strip, orig, save);
  detail.append(presetRow(cls), row);
  drawPreview();
}

// ---------------------------------------------------------------- 아바타 프리셋

/** A class's preset slots: [{name?, wear: {kind: id}} | null] (old saves have none). */
function presets(clsId) {
  const s = state();
  if (!s.presets || typeof s.presets !== 'object') s.presets = {};
  const p = Array.isArray(s.presets[clsId]) ? s.presets[clsId] : [];
  while (p.length < PRESETS) p.push(null);
  return (s.presets[clsId] = p.slice(0, PRESETS));
}

/** The preset's look as this class can wear it now (what it no longer owns or fits left off). */
function presetWear(clsId, pr) {
  const out = {};
  for (const [kind, id] of Object.entries((pr && pr.wear) || {})) if (KINDS.some(([k]) => k === kind) && wearable(clsId, kind, id)) out[kind] = id;
  return out;
}

/** Saves the look tried on (what is owned of it) in slot i. */
export function savePreset(clsId, i, look, name) {
  const p = presets(clsId), wear = presetWear(clsId, { wear: look });
  p[i] = { name: name || (p[i] && p[i].name) || `프리셋 ${i + 1}`, wear };
  state().presets[clsId] = p;
  A.save();
  return p[i];
}

/** Wears slot i at once; false when it is empty. */
export function applyPreset(clsId, i) {
  const pr = presets(clsId)[i];
  if (!pr) return false;
  const wear = presetWear(clsId, pr);
  for (const [kind] of KINDS) setCostume(clsId, kind, wear[kind] || null);
  if (A.changed) A.changed();
  return wear;
}

let presetSave = false;

const sameLook = (a, b) => {
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every(k => a[k] === b[k]);
};

/** 프리셋 [1]..[5] [저장]: a tap wears a slot (the one worn now is marked); 저장 (a name if wanted)
 *  then a slot keeps the look tried on. */
function presetRow(cls) {
  const row = document.createElement('div');
  row.className = 'coordi-presets';
  const lab = document.createElement('small');
  lab.textContent = presetSave ? '저장할 칸' : '프리셋';
  row.append(lab);
  let name = null;
  if (presetSave) {
    name = document.createElement('input');
    name.type = 'text';
    name.maxLength = 12;
    name.placeholder = '이름(선택)';
    row.append(name);
  }
  const worn = presetWear(cls.id, { wear: state().wear[cls.id] || {} });
  presets(cls.id).forEach((pr, i) => {
    const b = document.createElement('button');
    const now = pr && !presetSave && sameLook(presetWear(cls.id, pr), worn);
    b.className = 'btn' + (pr ? ' full' : '') + (presetSave ? ' pick' : '') + (now ? ' on' : '');
    b.textContent = pr && !presetSave ? (pr.name.length > 5 ? String(i + 1) : pr.name.replace(/^프리셋 /, '')) : String(i + 1);
    b.title = pr ? `${pr.name} · ${Object.keys(pr.wear).length}칸` : '빈 칸';
    b.onclick = () => {
      if (presetSave) {
        presetSave = false;
        const p = savePreset(cls.id, i, trial, name && name.value.trim().slice(0, 12));
        A.say(`지금 모습을 ${p.name}에 저장했습니다.`, 'sys');
      } else if (!pr) {
        A.say(`프리셋 ${i + 1}은 비어 있습니다. 저장을 누르고 칸을 고르면 지금 모습이 들어갑니다.`, 'warn');
        return;
      } else {
        trial = applyPreset(cls.id, i);
        pick = null;
        A.say(`${pr.name}을(를) 입었습니다.`, 'sys');
      }
      buildCoordi();
    };
    row.append(b);
  });
  const sv = document.createElement('button');
  sv.className = 'btn' + (presetSave ? ' on' : '');
  sv.textContent = presetSave ? '취소' : '저장';
  sv.onclick = () => { presetSave = !presetSave; buildDetail($('#coordi-detail'), cls); };
  row.append(sv);
  return row;
}

function itemCell(id, extra) {
  const it = costumeItems()[id], g = GRADES[it.grade], d = document.createElement('div');
  d.className = 'forge-item' + (ownsCostume(id) ? ' ready' : '');
  d.innerHTML = (it.icon ? `<img loading="lazy" src="assets/${it.icon}" alt="">` : '<div class="noimg"></div>')
    + `<b>${it.name}</b><small style="color:${g.color}">${g.name} · ${KINDS.find(([k]) => k === it.kind)[1]}${extra || ''}</small>`;
  return d;
}

function staticList(cells) {
  const list = $('#coordi-list');
  list.onscroll = null;
  list.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'vrow';
  box.style.position = 'static';
  box.style.gridTemplateColumns = `repeat(${Math.max(1, Math.floor((list.clientWidth || 300) / 92))}, minmax(0, 1fr))`;
  box.append(...cells);
  list.append(box);
}

function buildShop(detail, cls) {
  const s = shop(), items = costumeItems(), p = A.progress();
  let sel = pick && s.ids.includes(pick) ? pick : null;
  staticList(s.ids.map(id => {
    const it = items[id], g = GRADES[it.grade];
    const d = itemCell(id, ` · ${g.gold ? A.won(g.gold) : '주화 ' + g.coins}`);
    if (sel === id) d.classList.add('on');
    d.onclick = () => {
      pick = id;
      if (it.kind !== 'pet' && !canWear(cls, it)) { buildShop(detail, cls); return; }
      trial[it.kind] = id;
      buildShop(detail, cls);
    };
    return d;
  }));
  const left = SHOP_MS - (Date.now() % SHOP_MS);
  detail.innerHTML = '<canvas id="coordi-preview" width="400" height="136"></canvas>';
  const info = document.createElement('div');
  info.className = 'coordi-info';
  info.innerHTML = `<b>코디 상점</b><br><small>희귀·영웅 코디와 환수는 여기 진열될 때만 레이드주화로 삽니다. ${Math.ceil(left / 60000)}분 뒤 바뀝니다. 일반·고급은 각 칸에서 언제든 전으로 삽니다.</small>`;
  if (sel) {
    const it = items[sel];
    info.innerHTML += `<br><b>${it.name}</b> <span style="color:${GRADES[it.grade].color}">${GRADES[it.grade].name}</span>`
      + (it.kind !== 'pet' && !canWear(cls, it) ? '<br><small>이 직업은 입을 수 없습니다(다른 직업용).</small>' : '');
    const b = buyButton(sel, () => buildCoordi());
    if (b) info.append(document.createElement('br'), b);
  }
  const re = document.createElement('button');
  re.className = 'btn';
  re.textContent = `진열 바꾸기 ${A.won(REROLL)}`;
  re.disabled = (p.gold || 0) < REROLL;
  re.onclick = () => { p.gold -= REROLL; state().shop = null; pick = null; buildCoordi(); };
  info.append(document.createElement('br'), re);
  detail.append(info);
  drawPreview();
}

function buildPull(detail) {
  const items = costumeItems(), p = A.progress();
  staticList(lastPulls.map(id => itemCell(id)));
  if (!lastPulls.length) $('#coordi-list').innerHTML = '<div class="coordi-note" style="position:static">뽑은 코디가 여기 보입니다.</div>';
  detail.innerHTML = '';
  const info = document.createElement('div');
  info.className = 'coordi-info';
  const rate = PULL.rate.map((r, g) => `${GRADES[g].name} ${r}%`).join(' · ');
  info.innerHTML = `<b>코디 뽑기</b><br><small>아직 없는 코디·환수 하나를 뽑습니다(겹치지 않음). ${rate}. 10회는 마지막 한 번이 희귀 이상을 보장합니다. 능력치는 없고, 모은 수만 코디 수집 효과에 더해집니다.</small>`;
  const row = document.createElement('div');
  row.className = 'coordi-actions';
  row.style.marginTop = '6px';
  for (const n of [1, 10]) {
    const b = document.createElement('button');
    b.className = 'btn fd-go';
    const cost = n === 10 ? PULL.ten : PULL.gold;
    b.textContent = `${n}회 ${A.won(cost)}`;
    b.disabled = (p.gold || 0) < cost;
    b.onclick = () => {
      const got = pull(n);
      if (!got) return;
      lastPulls = got;
      if (!got.length) A.say('더 뽑을 코디가 없습니다.', 'sys');
      else {
        const best = got.reduce((a, b) => (items[b].grade > items[a].grade ? b : a));
        A.say(`코디 뽑기: ${got.length}개 (가장 좋은 것 [${items[best].name}] ${GRADES[items[best].grade].name})`, 'sys');
      }
      buildCoordi();
    };
    row.append(b);
  }
  info.append(row);
  detail.append(info);
}

function buildCollect(detail) {
  const b = costumeBonus();
  staticList(COLLECT.map(([at, add]) => {
    const el = document.createElement('div');
    el.className = 'forge-item' + (b.n >= at ? ' ready' : ' done');
    const txt = Object.entries(add).map(([k, v]) => (k === 'hp' ? `체력 +${v}` : k === 'armor' ? `방어 +${v}` : `피해 +${Math.round(v * 100)}%`)).join(', ');
    el.innerHTML = `<b>${at}개 모으기</b><small>${txt}</small>`;
    return el;
  }));
  detail.innerHTML = `<div class="coordi-info"><b>코디 수집 ${b.n}개</b> <small>(코디와 환수 모두)</small><br><small>모든 직업이 함께: 체력 +${b.hp}, 방어 +${b.armor}, 피해 +${Math.round(b.dmg * 100)}%`
    + `${b.next ? ` · 다음 ${b.next[0]}개` : ' · 모두 열림'}</small><br><small>일반·고급 코디는 전으로 언제든, 희귀·영웅은 상점 진열 때 레이드주화로 사고, 뽑기(전)와 레이드·대항전 승리, 사냥터 보스의 보물에서도 얻습니다. 전설은 뽑기와 보상에서만 나옵니다.</small></div>`;
}

const sheetCache = new Map();
function sheet(path) {
  let im = sheetCache.get(path);
  if (!im) {
    im = new Image();
    im.src = 'assets/' + (path.startsWith('p/') ? 'ycostume/' : 'yhero2/') + path;
    sheetCache.set(path, im);
    if (sheetCache.size > 60) sheetCache.delete(sheetCache.keys().next().value);
  }
  return im.complete && im.naturalWidth ? im : null;
}

/** The hero in the trial look, in the four directions, walking (or the pose picked); its pet beside. */
function drawPreview() {
  const cv = document.getElementById('coordi-preview');
  if (!cv || $('#coordi').hidden) return;
  const cls = A.cls(), H = A.M().yhero2[cls.id];
  const gear = Object.assign({}, A.savedGear(cls));
  Object.defineProperty(gear, 'cos', { value: trial, enumerable: false });
  const want = A.yGearVariants(cls, gear);
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, cv.width, cv.height);
  const sheets = {};
  for (const [kind, v] of Object.entries(want)) {
    const meta = H.layers[kind] && H.layers[kind][v];
    const im = meta && sheet(meta.file);
    if (im) sheets[kind] = { im, meta };
  }
  const box = frameBox(H, Object.values(sheets).map(s => s.meta));
  const t = performance.now();
  const name = { walk: 'walk', idle: 'idle', attack: 'atk', cast: 'cast' }[pose];
  const dirs = [['down', false, 0, 1], ['side', true, 1, 0], ['up', false, 0, -1], ['side', false, -1, 0]];
  const pet = trial.pet && costumeItems()[trial.pet];
  const step = cv.width / 4, k = Math.min(1.25, (cv.height - 8) / 100);
  dirs.forEach(([dir, mirror, fdx, fdy], i) => {
    const a = H.anims[`${name}_${dir}`] || H.anims[`idle_${dir}`];
    const f = Math.floor(t / (pose === 'walk' ? a.ms : pose === 'idle' ? 500 : 160)) % a.n;
    const cx = Math.round(step * i + step / 2 + (pet ? 10 : 0));
    if (pet && pet.pet) drawCosPet(g, { it: pet, x: cx - 30 * k, y: cv.height - 10, fdx, fdy, moving: pose === 'walk', t: t / 1000 });
    g.save();
    g.translate(cx, cv.height - 6);
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
  const gs = $('#coordi-grade');
  gs.innerHTML = '<option value="-1">모든 등급</option>' + GRADES.map((g, i) => `<option value="${i}">${g.name}</option>`).join('');
  let qt = 0;
  $('#coordi-q').oninput = e => {
    clearTimeout(qt);
    qt = setTimeout(() => { F.q = e.target.value; vscroll.top = 0; buildCoordi(); }, 150);
  };
  gs.onchange = e => { F.grade = +e.target.value; vscroll.top = 0; buildCoordi(); };
  $('#coordi-own').onchange = e => { F.own = e.target.value; vscroll.top = 0; buildCoordi(); };
  $('#coordi-sets').onclick = e => { F.sets = !F.sets; e.target.classList.toggle('on', F.sets); vscroll.top = 0; buildCoordi(); };
  // Test: give and wear costumes, open the window (the verify scripts).
  window.__costume = { give: giveCostume, wear: setCostume, items: costumeItems, open: openCoordi, worn: wornCostume, bonus: costumeBonus,
    sheet: testSheet, load: loadCostumes, pull, shop, filter: F, state, savePreset, applyPreset, presets, HIDE };
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
    const im = sheet(meta.file);
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
