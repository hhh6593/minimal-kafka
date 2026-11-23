import {
  CLASSES, SKILLS, PASSIVES, STAGES, MAX_SKILLS, MAX_PASSIVES, MAX_SKILL_LEVEL, MAX_PASSIVE_LEVEL, BOSS_AT, MINI_AT,
  CHAMPIONS_AT, FX, ELEMENTS, PROMOS, PROMO_NAMES, RAIDS, YEON_FX, RAID_BOSS_AT, RAID_LIMIT, GWOE_BEASTS, gwoeWeek, BRANCHES, PROMO_BONUS,
  skillStats, skillName, levelText, isMend, MEND_FX, ULT_TIERS, ULT_BANDS, SKILL_ALIAS,
} from './data.js';
import { Audio } from './audio.js';
import { GYEOK, STATUS, gyeokText, dragonGyeok, DRAGON_CORE, SINSU, SOURCE_GYEOK, ABYSS_TINT as GY_ABYSS_TINT } from './gyeok.js';
import { YEON_SOUNDS, YEON_BGM, YEON_STAGE_BGM, YEON_RAID_BGM } from './yeon_sounds.js';
import { initWar } from './war.js';
import { initHunt } from './hunt.js';
import { BOOTS, BOOT, KYEONGGONG, bootsState, bootsPct, moveBonus, bootsForRank } from './boots.js';
import { initCostume, bindCoordi, openCoordi, wornCostume, costumeVariants, costumeVersion, costumeBonus, dropCostume, frameBox, drawLayers, dyeImage, loadCostumes, updateCosPet, drawCosPet, costumeItems, unlockMusinHair, dropDyed, releaseCostume } from './costume.js';
import {
  SPECIALS, SPECIAL, OPTIONS, KIND_NAME, specialBase, specialName, specialPower, tierSources, raidOf,
  MATS, craftRecipe, STAR_MAX, starCost, CRAFTS, starMats, matCount, DRAGON_MAX, dragonName, craftPicture,
  RARITY, loadAbyssLoot, rollAbyssItem, taechoChance, CLASSIC_AXIS, TAECHO_EDGE, ABYSS_SWING, MELEE_WEAPON, ABYSS_TRAIL, ABYSS_FX_K,
  DRAGON_STEP, ABYSS_HUNT, JUJAK_AURA, WEAPON_FAMILY, familyOf, familyLine, DRAGON_LOOK, LOOK_FIX,
  GEAR_OPT, PROCS, optIds, specialRank, MUSIN_SET, musinSetOf, JUDGE_EDGE, gyeokTier, NAME_ICONS, TOP_GYEOK_FX,
  sinsuCount, SINSU_GATE, needsMet, needsName, AKMA_DROP, FAMILY_TINT, SINSU_TINT, HEAVEN_DRESS, HEAVEN_COST,
} from './items.js';
import {
  initAvatars, hasAvatars, gearName, gearIcon, GEAR,
  RAID_GEAR, plainTiers, plainList, gearPower, raidSet, raidTier, MOVED_TIERS, lookAt, CRAFT_GEAR, CRAFT_POWER, hasShield,
} from './avatar.js';

const $ = s => document.querySelector(s);
const canvas = $('#game');
// Opaque: the page under the field is black anyway (body's background) and every frame paints the
// whole canvas (a ground, or render's black fill off the field), so the compositor need not blend
// the canvas over the page each frame (on a phone a full-screen blend of its own).
const ctx = canvas.getContext('2d', { alpha: false });

// A picture drawn straight from an <img> goes through the browser's decode cache on every draw;
// with a crowd of monster sheets, digits and effects in a frame that cache overflowed and was
// trimmed and refilled all the time (a third of the field's drawing cost under a slow CPU). Each
// <img> the field draws is decoded once into an ImageBitmap and drawn from that instead, and a
// bitmap not drawn for a while is let go (sweepBitmaps) so a long session does not hoard them.
// They are held to a budget (the least lately drawn let go past it).
// The bitmap is the only decoded copy the game keeps: a picture is never drawn from its <img> where
// a bitmap can be had (bmSrc for the small canvases too), and an effect sheet is made ready as a
// bitmap (bmWarm), not by <img>.decode() — either left a second decoded copy in the browser's own
// cache, which no budget here saw and nothing let go: 60 to 90 MB more for every class tried in 수련장.
const bitmapOf = new WeakMap(), bitmapsLive = new Set();
// (test: ?bm=<MB> sets the budget, ?bmraw draws a picture from its <img> while its bitmap is made, as before)
const BM_Q = new URLSearchParams(location.search);
const BITMAP_BUDGET = BM_Q.has('bm') ? +BM_Q.get('bm') * 1e6 : 48e6, BITMAP_MAX = BM_Q.has('bmmax') ? +BM_Q.get('bmmax') * 1e6 : 16e6, BITMAP_RAW = BM_Q.has('bmraw');
const rawDrawImage = ctx.drawImage;
let bitmapClock = 0, bitmapBytes = 0;
ctx.drawImage = function (im, a, b, c, d, e, f, g, h) {
  // A picture wholly off the canvas is not drawn (about half the draws of a crowded hunt: monsters,
  // shadows and props in the margin round the view). Exact: only a picture none of whose pixels
  // could land on the canvas, judged by the followed transform (xfFollow) when it has no turn.
  if (xb === 0 && xc === 0) {
    const n = arguments.length;
    let x = a, y = b, w, ht;
    if (n === 9) { x = e; y = f; w = g; ht = h; } else if (n === 5) { w = c; ht = d; } else { w = im.naturalWidth !== undefined ? im.naturalWidth : im.width; ht = im.naturalHeight !== undefined ? im.naturalHeight : im.height; }
    const x0 = xa * x + xe, x1 = x0 + xa * w, y0 = xd * y + xf, y1 = y0 + xd * ht;
    // (a pixel's margin: the canvas keeps its transform in single precision)
    if ((x0 > x1 ? x0 : x1) < -1 || (x0 < x1 ? x0 : x1) > cvW + 1 || (y0 > y1 ? y0 : y1) < -1 || (y0 < y1 ? y0 : y1) > cvH + 1) {
      if (CULL_CHECK) xfCheck(true);
      return;
    }
  }
  if (CULL_CHECK) xfCheck(false);
  // (a picture let go — a closed bitmap — or not in yet has no size: nothing to draw, and no throw)
  if (!im.width) return;
  if (im instanceof HTMLImageElement && window.createImageBitmap) {
    const bm = bitmapOf.get(im);
    if (bm === undefined) {
      const bytes = im.naturalWidth * im.naturalHeight * 4;
      if (im.complete && bytes && bytes <= BITMAP_MAX) {
        const rec = { bm: null, im, used: bitmapClock, bytes, wait: !BITMAP_RAW };
        bitmapOf.set(im, rec);
        createImageBitmap(im).then(x => {
          rec.wait = false;
          // (its picture let go meanwhile: picDrop, fxKeep)
          if (bitmapOf.get(im) !== rec) { x.close(); return; }
          rec.bm = x; bitmapsLive.add(rec); bitmapBytes += bytes; if (bitmapBytes > BITMAP_BUDGET) trimBitmaps();
        }).catch(() => { rec.wait = false; });
        // Not drawn from its <img> meanwhile (a frame or two): that draw decoded the picture a second
        // time into the browser's own cache, where the copy stayed (unseen by the budget here) —
        // every new sheet of a class tried in 수련장 left one, 60 to 90 MB a class.
        if (rec.wait) return;
      }
    } else if (bm.bm) {
      bm.used = bitmapClock;
      im = bm.bm;
    } else if (bm.wait) return;
  }
  switch (arguments.length) {
    case 3: return rawDrawImage.call(this, im, a, b);
    case 5: return rawDrawImage.call(this, im, a, b, c, d);
    default: return rawDrawImage.call(this, im, a, b, c, d, e, f, g, h);
  }
};

// The main canvas's transform, followed in step with the canvas (save/restore, translate, scale,
// rotate, transform, setTransform) so a draw can be judged and a scale read without getTransform,
// which makes a new DOMMatrix each call (a hundred and more a frame: footShadow, textPic).
// Test: ?cullcheck compares it with the canvas's own at every draw (window.__xfBad).
let xa = 1, xb = 0, xc = 0, xd = 1, xe = 0, xf = 0, cvW = 0, cvH = 0;
const xfStack = [];
function xfReset() {
  xa = xd = 1;
  xb = xc = xe = xf = 0;
  xfStack.length = 0;
  cvW = canvas.width;
  cvH = canvas.height;
}
const CULL_CHECK = /[?&]cullcheck/.test(location.search);
function xfCheck(culled) {
  // (the canvas keeps it in single precision: equal to a millionth, its move to a thousandth of a pixel)
  const m = ctx.getTransform(), near = (u, v, k) => Math.abs(u - v) <= k * Math.max(1, Math.abs(v));
  const ok = near(m.a, xa, 1e-6) && near(m.b, xb, 1e-6) && near(m.c, xc, 1e-6) && near(m.d, xd, 1e-6) && near(m.e, xe, 1e-3) && near(m.f, xf, 1e-3)
    && cvW === canvas.width && cvH === canvas.height;
  const r = window.__xfBad || (window.__xfBad = { draws: 0, culled: 0, bad: 0, first: null });
  r.draws++;
  if (culled) r.culled++;
  if (!ok) { r.bad++; if (!r.first) r.first = [[m.a, m.b, m.c, m.d, m.e, m.f], [xa, xb, xc, xd, xe, xf], new Error().stack]; }
}
(function xfFollow() {
  const fin = Number.isFinite, raw = {};
  for (const k of ['save', 'restore', 'translate', 'scale', 'rotate', 'transform', 'setTransform', 'resetTransform']) raw[k] = ctx[k];
  ctx.save = function () {
    xfStack.push(xa, xb, xc, xd, xe, xf);
    raw.save.call(this);
  };
  ctx.restore = function () {
    // (a restore with nothing saved does nothing, as the canvas's own)
    if (xfStack.length) {
      xf = xfStack.pop(); xe = xfStack.pop(); xd = xfStack.pop();
      xc = xfStack.pop(); xb = xfStack.pop(); xa = xfStack.pop();
    }
    raw.restore.call(this);
  };
  // (a call with a value not finite is let be by the canvas: so here too)
  ctx.translate = function (x, y) {
    if (fin(x) && fin(y)) { xe += xa * x + xc * y; xf += xb * x + xd * y; }
    raw.translate.call(this, x, y);
  };
  ctx.scale = function (x, y) {
    if (fin(x) && fin(y)) { xa *= x; xb *= x; xc *= y; xd *= y; }
    raw.scale.call(this, x, y);
  };
  ctx.rotate = function (t) {
    if (fin(t)) {
      const cs = Math.cos(t), sn = Math.sin(t), a = xa, b = xb;
      xa = a * cs + xc * sn; xb = b * cs + xd * sn;
      xc = xc * cs - a * sn; xd = xd * cs - b * sn;
    }
    raw.rotate.call(this, t);
  };
  ctx.transform = function (a, b, c, d, e, f) {
    if (fin(a) && fin(b) && fin(c) && fin(d) && fin(e) && fin(f)) {
      const A = xa, B = xb, C = xc, D = xd;
      xa = A * a + C * b; xb = B * a + D * b;
      xc = A * c + C * d; xd = B * c + D * d;
      xe += A * e + C * f; xf += B * e + D * f;
    }
    raw.transform.call(this, a, b, c, d, e, f);
  };
  ctx.setTransform = function (a, b, c, d, e, f) {
    if (arguments.length >= 6) {
      if (fin(a) && fin(b) && fin(c) && fin(d) && fin(e) && fin(f)) { xa = a; xb = b; xc = c; xd = d; xe = e; xf = f; }
      return raw.setTransform.call(this, a, b, c, d, e, f);
    }
    raw.setTransform.call(this, a);
    // (a matrix: whatever the canvas made of it)
    const m = CanvasRenderingContext2D.prototype.getTransform.call(this);
    xa = m.a; xb = m.b; xc = m.c; xd = m.d; xe = m.e; xf = m.f;
  };
  ctx.resetTransform = function () {
    xa = xd = 1;
    xb = xc = xe = xf = 0;
    raw.resetTransform.call(this);
  };
  // (a lost and restored canvas starts again from nothing)
  canvas.addEventListener('contextrestored', xfReset);
  xfReset();
})();

/** The bitmap of a picture made ahead (an effect sheet loaded for a run): settles when it is ready. */
function bmWarm(im) {
  if (!(im instanceof HTMLImageElement) || !window.createImageBitmap) return Promise.resolve();
  const had = bitmapOf.get(im);
  if (had) return had.p || Promise.resolve();
  const bytes = im.naturalWidth * im.naturalHeight * 4;
  if (!im.complete || !bytes || bytes > BITMAP_MAX) return Promise.resolve();
  const rec = { bm: null, im, used: bitmapClock, bytes, wait: !BITMAP_RAW, p: null };
  bitmapOf.set(im, rec);
  rec.p = createImageBitmap(im).then(x => {
    rec.wait = false;
    rec.p = null;
    if (bitmapOf.get(im) !== rec) { x.close(); return; }
    rec.bm = x; rec.used = bitmapClock; bitmapsLive.add(rec); bitmapBytes += bytes; if (bitmapBytes > BITMAP_BUDGET) trimBitmaps();
  }).catch(() => { rec.wait = false; rec.p = null; });
  return rec.p;
}
/** What to draw a picture from on a canvas of the game's own (a tint, a white copy): its bitmap when it has one. */
function bmSrc(im) {
  const rec = im instanceof HTMLImageElement ? bitmapOf.get(im) : null;
  if (rec && rec.bm) { rec.used = bitmapClock; return rec.bm; }
  return im;
}
function dropBitmap(rec) {
  bitmapsLive.delete(rec);
  bitmapOf.delete(rec.im);
  bitmapBytes -= rec.bytes;
  rec.bm.close();
}
/** Past the budget: the least lately drawn let go, to three quarters of it. */
function trimBitmaps() {
  const old = [...bitmapsLive].sort((x, y) => x.used - y.used);
  for (const rec of old) {
    // (never one drawn this last second: it would be made again at once, and blink meanwhile)
    if (bitmapBytes <= BITMAP_BUDGET * 0.75 || bitmapClock - rec.used < 1) break;
    dropBitmap(rec);
  }
}
/** Once a second: the bitmaps not drawn for half a minute closed (made again when next drawn). */
function sweepBitmaps(now) {
  // (a long gap between frames — the app in the background — is not time a picture went unused)
  const gap = now - bitmapClock;
  if (gap > 2 && bitmapClock) {
    for (const rec of bitmapsLive) rec.used += gap;
    for (const L of heroLooks.values()) L.used += gap;
  }
  bitmapClock = now;
  if (now - (sweepBitmaps.at || 0) < 1) return;
  sweepBitmaps.at = now;
  for (const rec of bitmapsLive) if (now - rec.used >= 30) dropBitmap(rec);
  heroLooksSweep(now);
}

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
// 스킬 2차 개편: a spell merged into another of its line, or moved up into the 필살기 (data.js
// SKILL_ALIAS), keeps its place in a saved build and in the 숙련 list under the one it became.
for (const b of Object.values(progress.builds || {})) {
  if (!b || !Array.isArray(b.skills)) continue;
  const seen = new Set();
  b.skills = b.skills.map(([id, lv]) => [SKILL_ALIAS[id] || id, lv]).filter(([id]) => !seen.has(id) && seen.add(id));
}
for (const [c, l] of Object.entries(progress.mastered || {})) if (Array.isArray(l)) progress.mastered[c] = [...new Set(l.map(id => SKILL_ALIAS[id] || id))];
// The 끝없는 지옥's weapons found so far, each with its own affixes (items.js).
loadAbyssLoot(progress.abyssLoot);
// Which grounds each class has conquered: its 승급 come from these. Grounds conquered before
// classes were told apart count for every class.
if (!progress.byClass) {
  progress.byClass = {};
  for (const c of ['warrior', 'rogue', 'mage', 'poet']) progress.byClass[c] = Object.assign({}, progress.cleared);
}
// A save from before the raids had their own places in the lines (avatar.js MOVED_TIERS): a raid
// piece that shared its place with a hunting grounds' piece moves to the raid's own place, with
// its stars and copies, worn or not. Once (gearV 2).
if ((progress.gearV || 0) < 2) {
  for (const [c, kinds] of Object.entries(MOVED_TIERS)) for (const [kind, moves] of Object.entries(kinds)) for (const [from, to] of Object.entries(moves)) {
    const a = `${kind}:${from}`, b = `${kind}:${to}`, inv = (progress.inv || {})[c];
    if (!inv || !inv.includes(a) || inv.includes(b)) continue;
    inv.splice(inv.indexOf(a), 1, b);
    for (const m of [progress.stars, progress.copies]) if (m && m[c] && m[c][a] !== undefined) { m[c][b] = m[c][a]; delete m[c][a]; }
    const g = (progress.gear || {})[c];
    if (g && g[kind] === +from && !g[kind + 'Sp']) g[kind] = to;
  }
  progress.gearV = 2;
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

let fxWebp = null;
// The pictures a screen loads for itself, by folder: let go when the screen is left (picRelease;
// fx/ by fxKeep). Each is decoded once into a bitmap of its own, off the main thread (fetch +
// createImageBitmap), and closed when let go — memory given back there and then. As an <img> its
// file stayed in the browser's memory after every reference was dropped (and src cleared): 68 MB
// for the effects alone once each had been seen, 5 MB a class tried.
// (Not here: the small ones every screen draws — item/, mon/, hud/, npc/, emote/, the title's art.)
const PIC_LAZY = /^(icon|skillicon|yhero2|yhero|yunit|beast|prop|floor|ytown|gear|gicon|yitemicon|ycostume|yamb|ywar|yhunt|avatar)\//;
const PIC_BITMAP = /^(fx|icon|skillicon|yhero2|yhero|yunit|beast|prop|floor|ytown|gear|gicon|yitemicon|ycostume|yamb|ywar|yhunt|avatar)\//;
function loadImage(path) {
  // An effect the build shrank to WebP (tools/webp_fx.py) keeps its .png key.
  const webp = path.startsWith('fx/') && fxWebp && fxWebp.has(path.slice(3, -4));
  const url = 'assets/' + (webp ? path.slice(0, -4) + '.webp' : path);
  if (PIC_BITMAP.test(path) && window.createImageBitmap && window.fetch) {
    // Until it is in: a stand-in with no size (what draws it skips it, as an <img> still loading).
    const ph = { complete: false, width: 0, height: 0, naturalWidth: 0, naturalHeight: 0, src: url, p: null };
    images[path] = ph;
    ph.p = fetch(url).then(r => (r.ok ? r.blob() : null)).then(bl => (bl ? createImageBitmap(bl) : null)).catch(() => null).then(bm => {
      // (let go meanwhile: picDrop, fxKeep)
      if (images[path] !== ph) { if (bm) bm.close(); return null; }
      if (!bm) { ph.complete = true; return null; } // (missing: as a broken <img>, there but with no size)
      bm.complete = true;
      bm.naturalWidth = bm.width;
      bm.naturalHeight = bm.height;
      bm.src = url;
      bm.used = bitmapClock - 3; // (not drawn yet: among the first to go if the effects are past their budget)
      images[path] = bm;
      return bm;
    });
    return ph.p;
  }
  return new Promise(resolve => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => resolve(null);
    im.src = url;
    images[path] = im;
  });
}

// ---- pictures loaded by the screen that draws them
/** A picture loaded when it is first asked for: the <img> once it is in, null until then (never a
 *  throw, never a wait: what draws it skips it until it is in). */
function pic(path) {
  const im = images[path];
  if (im) return im.complete && im.naturalWidth ? im : null;
  loadImage(path);
  return null;
}
/** Loads these pictures; settles when they are in (or missing), or after `wait` ms at most. */
function picWarm(paths, wait = 0) {
  const all = Promise.all(paths.map(path => {
    const im = images[path];
    if (!im) return loadImage(path);
    if (im.complete) return im;
    if (im.p) return im.p;
    return new Promise(r => { im.addEventListener('load', r, { once: true }); im.addEventListener('error', r, { once: true }); });
  }));
  return wait ? Promise.race([all, new Promise(r => setTimeout(r, wait))]) : all;
}

/** A picture let go: its bitmap closed, what was made from it (tints, white copies) forgotten. */
function picForget(im) {
  if (!im) return;
  tintCache.delete(im);
  whiteCache.delete(im);
  shadowCache.delete(im);
  if (im instanceof HTMLImageElement) {
    const rec = bitmapOf.get(im);
    if (rec) { bitmapOf.delete(im); if (rec.bm) { bitmapsLive.delete(rec); bitmapBytes -= rec.bytes; rec.bm.close(); } }
  } else if (im.close) im.close(); // a bitmap of its own: its memory back now
}
function picDrop(path) {
  const im = images[path];
  if (im === undefined) return;
  delete images[path];
  picForget(im);
}
/** Lets go of every lazily loaded picture but these (paths, or the start of some: a folder). */
function picRelease(keep = []) {
  const set = new Set(keep), dirs = keep.filter(k => !/\.\w+$/.test(k));
  for (const path of Object.keys(images)) {
    if (!PIC_LAZY.test(path) || set.has(path) || dirs.some(d => path.startsWith(d))) continue;
    picDrop(path);
  }
  for (const c of yunitSeen.values()) c.r = null;
  whiteFrames.clear();
  propsSeen = null;
}

// ---- effect sheets, loaded as they are needed
// Every effect sheet loaded at boot was some 1.2 GB decoded: a phone's WebView renderer was killed
// a few seconds into a hunt. Only the common ones (hit sparks, revive, ...) load at boot; a run
// loads and decodes its own (fxWarm(runFxIds(...)): the hero's kit, its 필살기 band, the war's kits)
// and lets go of the previous run's (fxKeep); anything else loads on its first use and is drawn
// from when it is decoded (fxPic: null until then, so a first use is skipped, never a stall).
const fxPending = new Map(), fxPinned = new Set();
/** The decoded sheet of effect `id` (its own sheet, f.src), or null while it loads (and starts it). */
function fxPic(id) {
  const f = M.fx[id], src = f ? f.src || id : id, im = images[`fx/${src}.png`];
  if (im && im.__ok) { im.used = bitmapClock; return im; }
  if (f) fxLoad(src);
  return null;
}
function fxLoad(src) {
  const path = `fx/${src}.png`;
  if (images[path] && images[path].__ok) return Promise.resolve(images[path]);
  if (images[path] && images[path].complete && !images[path].width) return Promise.resolve(null); // (the build lacks it)
  let p = fxPending.get(src);
  if (!p) {
    p = loadImage(path).then(im => {
      if (!im) return null;
      // Ready to draw: a bitmap of its own already (loadImage), else its bitmap made now.
      if (!(im instanceof HTMLImageElement)) { im.__ok = true; fxTrim(); return im; }
      return bmWarm(im).then(() => { im.__ok = true; return im; });
    }).finally(() => fxPending.delete(src));
    fxPending.set(src, p);
  }
  return p;
}
// The effect sheets held at most (decoded): past it the least lately drawn are let go (never a common
// one, nor one drawn these last seconds) and load again when next used. A hunt's own kit is 40 to
// 60 MB; a long one with every 격 and proc going stays under this, and a war, which asks for every
// class's spells at its start (245 MB), keeps what it draws.
const FX_BUDGET = 96e6;
function fxTrim() {
  let total = 0;
  const list = [];
  for (const [path, im] of Object.entries(images)) {
    if (!path.startsWith('fx/') || !im || !im.width) continue;
    total += im.width * im.height * 4;
    if (!fxPinned.has(path.slice(3, -4))) list.push([path, im]);
  }
  if (total <= FX_BUDGET) return;
  list.sort((x, y) => (x[1].used || 0) - (y[1].used || 0));
  for (const [path, im] of list) {
    if (total <= FX_BUDGET * 0.8 || bitmapClock - (im.used || 0) < 2) break;
    total -= im.width * im.height * 4;
    delete images[path];
    picForget(im);
  }
}
/** Whether effect sheets may be loaded ahead (the war's fighters' kits, war.js nearKitFx): under
 *  three fifths of the budget, so what is loaded ahead is not let go again before it is drawn, and a
 *  war holds what it draws rather than a budget's worth of what it might. */
function fxRoom() {
  let total = 0;
  for (const [path, im] of Object.entries(images)) if (path.startsWith('fx/') && im && im.width) total += im.width * im.height * 4;
  return total < FX_BUDGET * 0.6;
}
/** Loads and decodes the sheets of these effect ids; settles when done, or after `wait` ms at most. */
function fxWarm(ids, wait = 0) {
  const srcs = new Set();
  for (const id of ids) { const f = id && M.fx[id]; if (f) srcs.add(f.src || id); }
  const all = Promise.all([...srcs].map(fxLoad));
  return wait ? Promise.race([all, new Promise(r => setTimeout(r, wait))]) : all;
}
/** Lets go of every effect sheet but the common ones and these (a run's own): the next run's are
 *  loaded instead, and a sheet let go loads again if it is used. */
function fxKeep(ids) {
  const keep = new Set(fxPinned);
  for (const id of ids) { const f = id && M.fx[id]; if (f) keep.add(f.src || id); }
  for (const path of Object.keys(images)) {
    if (!path.startsWith('fx/')) continue;
    const src = path.slice(3, -4);
    if (keep.has(src) || fxPending.has(src)) continue;
    const im = images[path];
    delete images[path];
    picForget(im);
  }
}
/** The effect ids an object names (a skill, a 필살기 tier, a look): its string values that are
 *  effects, or whose k_ form is (a tier's boss, a technique), arrays and nested objects too. */
function fxRefs(o, out, depth = 0) {
  if (!o || depth > 3) return out;
  for (const v of Array.isArray(o) ? o : Object.values(o)) {
    if (typeof v === 'string') { if (M.fx[v]) out.add(v); if (M.fx['k_' + v]) out.add('k_' + v); } else if (v && typeof v === 'object') fxRefs(v, out, depth + 1);
  }
  return out;
}
let fxByPrefix = null;
/** A skill's effects: what its data names, and 연's pieces by its name (k_<id>, k_x_<id>_*, k_v_<id>_*, new_, s_). */
function skillFxIds(id, out = new Set()) {
  const d = SKILLS[id];
  if (!d) return out;
  fxRefs(d, out);
  for (const k of ['k_' + id, 'new_' + id, 's_' + id]) if (M.fx[k]) out.add(k);
  if (!fxByPrefix) {
    fxByPrefix = new Map();
    for (const k of Object.keys(M.fx)) { const m = /^k_[xv]_(.+?)_[^_]+$/.exec(k); if (m) { if (!fxByPrefix.has(m[1])) fxByPrefix.set(m[1], []); fxByPrefix.get(m[1]).push(k); } }
  }
  for (const k of fxByPrefix.get(id) || []) out.add(k);
  return out;
}
/** What a run of this class on this ground can draw from its start: the class's kit open at its
 *  승급 (as the level-up cards offer it), its 필살기 band, its close-in look, the ground's own effect. */
function runFxIds(cls, stage) {
  const out = new Set(), promo = promoOf(cls.id);
  for (const [id, d] of Object.entries(SKILLS)) if ((d.cls === cls.id || d.cls === 'all' || !d.cls) && promo >= (d.promo || 0)) skillFxIds(id, out);
  try { fxRefs(ultTier(cls.id, promoOf(cls.id)), out); fxRefs(ultLook(cls.id), out); } catch (e) { /* no tier */ }
  fxRefs(MELEE_LOOK[cls.id], out);
  if (stage) { fxRefs([stage.fx, 'new_' + stage.id], out); if (stage.boss) fxRefs(stage.boss, out); }
  return out;
}

const monsterById = {};

/** The pictures a run on this ground draws from its start: its floor and props, its monsters' and
 *  boss's 연 sheets, the 괴수 its boss or the class's calls bring. */
function runPics(cls, stage) {
  const out = new Set();
  if (stage.terrain && (M.floor || []).includes(stage.terrain)) out.add(`floor/${stage.terrain}.png`);
  for (const [n] of propKinds(stage.terrain)) out.add(`prop/${n}.png`);
  let mons = null;
  try { mons = stageMonsters(stage); } catch (e) { /* a war's ground has none */ }
  for (const m of mons ? [...mons.pool, mons.boss && mons.boss.m, mons.mini && mons.mini.m] : []) if (m && M.yunit && M.yunit[m.id]) out.add(`yunit/${m.id}.png`);
  if (mons && mons.boss && mons.boss.beast) out.add(`beast/${mons.boss.beast}.png`);
  for (const d of Object.values(SKILLS)) if (d.beasts && d.cls === cls.id) for (const bk of d.beasts) if (bk && M.beast && M.beast[bk]) out.add(`beast/${bk}.png`);
  if (M.yunit && M.yunit[TRAIN_MOB]) out.add(`yunit/${TRAIN_MOB}.png`);
  return [...out];
}
/** The town's pictures for an area: its map and little map, its people, the statue. */
function townPics(area) {
  const yt = M.ui.ytown;
  if (!yt) return M.ui.town ? ['ui/town.png'] : [];
  const out = [`ytown/${area}.png`, `ytown/mm_${area}.png`, 'ytown/statue.png', 'ytown/sign.png'];
  for (const n of TOWNSFOLK) { const sp = yt.spots[n.id], look = YTOWN_LOOK[n.id]; if (sp && sp.area === area && look && yt.folk[look]) out.push(`ytown/${look}.png`); }
  return out;
}
/** A screen is left for another: what the old one loaded for itself is let go (the hero's own look
 *  and `keep` aside), so the pictures held are the screen's own, not every screen's seen so far. */
function leaveScreen(cls, gear, keep) {
  heroLooksRelease(cls, gear);
  picRelease(keep);
  releaseCostume();
  shadowPics.clear();
  if (textPics.size > 300) textPics.clear();
}

async function boot() {
  M = await (await fetch('assets/manifest.json')).json();
  fxWebp = new Set(M.fxWebp || []);
  // The pixel fonts, before anything is written on the canvas with them.
  await Promise.all(['12px G11', 'bold 12px G11', '10px G9', '8px G7'].map(f => document.fonts.load(f).catch(() => {})));
  audio = new Audio(M.audio);
  applySounds();
  audio.setBgm(settings.bgm);
  audio.setSfx(settings.sfx);
  audio.setBgmVolume(volOf('bgm'));
  audio.setSfxVolume(volOf('sfx'));
  // The common effects (hit sparks, the level-up, kill and revive, the procs' and shots' pictures)
  // at boot, pinned; the rest as a run or a first use needs them (fxWarm, fxPic).
  for (const id of Object.keys(M.fx)) if (id.startsWith('h_')) fxPinned.add(id);
  for (const id of [...Object.values(FX), ...Object.values(SHOT_FX), ...Object.values(PROCS).map(p => p && p.fx), 'k_revive', '131', 'k_x_hero_foot']) {
    if (id && M.fx[id]) fxPinned.add(M.fx[id].src || id);
  }
  // Only what the title and every screen draw: the small pictures (items, the old monsters, the
  // HUD). The rest is loaded by the screen that draws it (pic, picWarm) and let go when it is left
  // (picRelease): the town's maps, a ground's floor and props, the 괴수, the spells' icons. (The old
  // wardrobe's figures, 268 MB decoded at every start, are gone: every hero is drawn in 연's layers.)
  const paths = [
    ...Object.values(M.items).map(i => `item/${i.id}.png`),
    ...M.monsters.map(m => `mon/${m.id}.png`),
    ...(M.npc || []).map(n => `npc/${n}.png`),
    ...(M.ui.ytitle ? ['ui/title_bg.jpg'] : []),
    ...Object.keys(M.emote || {}).map(k => `emote/${k}.png`),
    ...(M.hud && M.hud.font_damage ? ['hud/font_damage.png'] : []),
    ...(M.hud && M.hud.font_gold ? ['hud/font_gold.png'] : []),
    ...(M.hud && M.hud.font_dmgk_o ? ['hud/font_dmgk_o.png', 'hud/font_dmgk_r.png'] : []),
    ...(M.hud && M.hud.font_dmgk_w ? ['hud/font_dmgk_w.png'] : []),
    ...(M.hud && M.hud.font_dmgk_g ? ['hud/font_dmgk_g.png', 'hud/font_dmgk_b.png'] : []),
    ...(M.hud && M.hud.ui ? M.hud.ui.map(k => `hud/${k}.png`) : []),
    ...(M.status_icons || []).map(k => `hud/st_${k}.png`),
  ];
  let done = 0;
  const bar = $('#load-bar');
  const total = paths.length + fxPinned.size;
  await Promise.all([...paths.map(p => loadImage(p)), ...[...fxPinned].map(fxLoad)].map(q => q.then(() => {
    bar.style.width = (100 * ++done / total) + '%';
  })));
  // 연's own effects where the build has them: the spell's picture as it is, no tint.
  for (const [id, fx] of Object.entries(YEON_FX)) {
    if (M.fx[fx]) Object.assign(SKILLS[id], { fx, fxs: null, tint: null, fxk: 1, modern: null, yeon: true });
  }
  // Every getting-up (성황령, the class's own 부활, a companion raised) shows 연's revive.
  if (M.fx.k_revive) FX.revive = 'k_revive';
  // Better still, the spell's own effect out of 연's client, where it has one by that name.
  // (not over the original's own 9차 picture, o_<id>: 해일강타 had 연's water storm before the original's wave)
  for (const id of Object.keys(SKILLS)) {
    const fx = 'k_' + id;
    if (M.fx[fx] && !String(SKILLS[id].fx || '').startsWith('o_')) Object.assign(SKILLS[id], { fx, fxs: null, tint: null, fxk: 1, modern: null, yeon: true });
  }
  // 태초광명 격: 천자의분노's blow drawn additive (its dark strokes drop out), a gold-white light.
  if (M.fx.g_anger_son) M.fx.g_taecho_light = { ...M.fx.g_anger_son, src: M.fx.g_anger_son.src || 'g_anger_son', add: true };
  // 현무의 철옹 (gyeok.js), out of 연's 현무 pictures only, no white: y_hyeonmu's crystals rising into the
  // 현무 (its frames before the white shatter and the rider), g_sw_hyunmu's bubble looped as the shell
  // and its falling crystal shards on whoever strikes the one inside. (f0: the first frame used.)
  const part = (id, src, a, b, o = {}) => { if (M.fx[src]) M.fx[id] = { ...M.fx[src], src: M.fx[src].src || src, f0: a, n: b - a, durs: M.fx[src].durs.slice(a, b), ...o }; };
  part('gy_hm_rise', 'y_hyeonmu', 0, 15);
  part('gy_hm_shell', 'g_sw_hyunmu', 2, 6);
  part('gy_hm_shard', 'g_sw_hyunmu', 6, 24);
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
  initAvatars(M);
  $('#version').textContent = M.version ? `빌드 ${M.version}` : '';
  // (연's own title art hides the drawn figures: they are made only without it)
  if (!M.ui.ytitle) $('#heroes').innerHTML = CLASSES.map(c => `<img src="${heroPicture(c)}" alt="${c.name}">`).join('');
  // 연's own title art carries the name: the drawn title and figures make way for it.
  if (M.ui.ytitle) document.body.classList.add('ytitle');
  showScreen('title');
  requestAnimationFrame(frame);
  // The 코디 list (some 1400 looks and 360 pets) after the title is up: its sheets only when worn.
  setTimeout(() => loadCostumes(), 50);
}

/** A boss or leader's monster. One that wore an old picture and now wears a 연 unit (was: the old
 *  id) keeps the old picture's size for its life, so the fight is as long as before; without the
 *  연 sheet in the build it is the old monster again. */
function namedMonster(d) {
  const m = monsterById[d.id], old = d.was && monsterById[d.was];
  if (!m) return old;
  return old ? { ...m, area: old.area } : m;
}

/** A monster's picture for a card (the ground list, the raid list, a ground's monsters): cropped
 *  to what is drawn. 연's unit frames keep the empty room round a body where the sheet's anchor
 *  needs it (고원 기마병: a rider whose spear runs off one side, the frame left of him empty), and
 *  such a face sat off to one side of its card. */
const monFaces = new Map();
function monFace(id) {
  const path = `assets/mon/${id}.png`;
  if (monFaces.has(id)) return monFaces.get(id) || path;
  let out = null;
  const im = images[`mon/${id}.png`];
  if (im && im.width) {
    try {
      const c = document.createElement('canvas');
      c.width = im.width;
      c.height = im.height;
      const g = c.getContext('2d');
      g.drawImage(im, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
      for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 40) {
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      // (only where the empty room is more than a few pixels: the old monsters are drawn edge to edge)
      if (x1 >= 0 && (x0 > 3 || y0 > 3 || c.width - 1 - x1 > 3 || c.height - 1 - y1 > 3)) {
        const t = document.createElement('canvas');
        t.width = x1 - x0 + 1;
        t.height = y1 - y0 + 1;
        t.getContext('2d').drawImage(c, x0, y0, t.width, t.height, 0, 0, t.width, t.height);
        out = t.toDataURL();
      }
    } catch (e) { out = null; }
    monFaces.set(id, out);
  }
  return out || path;
}

/** The monsters of a hunting ground, weakest first, with its boss and middle boss. */
function stageMonsters(stage) {
  let list;
  if (stage.monsters) list = stage.monsters.map(id => monsterById[id]).filter(Boolean);
  else list = Object.values(monsterById).filter(m => m.pages.some(p => stage.pages.includes(p)));
  list = list.slice().sort((a, b) => a.area - b.area);
  let boss, mini;
  if (stage.boss) boss = { m: namedMonster(stage.boss), name: stage.boss.name, scale: stage.boss.scale || 1.4,
    beast: stage.boss.beast && M.beast && M.beast[stage.boss.beast] ? stage.boss.beast : null };
  if (stage.mini) mini = { m: namedMonster(stage.mini), name: stage.mini.name, scale: stage.mini.scale || 1.2 };
  // Grounds known only by their page: the biggest monsters lead.
  if (!boss) boss = { m: list[list.length - 1], name: stage.name + '의 주인', scale: 1.3 };
  if (!mini) mini = { m: list[Math.max(0, list.length - 2)], name: stage.name + ' 우두머리', scale: 1.2 };
  // A ground of big monsters (stage.big, 연's werewolves and tree spirits) lets them walk with the crowd.
  let pool = list.filter(m => m.area <= (stage.big || 5200) && m.h <= 100 && m !== boss.m);
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
// (the last answer, kept while the view stays over the same cells and the same pictures are in:
// it was made anew every frame, some forty objects and closures)
let propsSeen = null;
function propsInView(camX, camY) {
  const kinds = propKinds(G.stage.terrain);
  if (!kinds.length) return [];
  const list = kinds.filter(([n]) => M.prop[n] && pic(`prop/${n}.png`));
  const total = list.reduce((a, [, w]) => a + w, 0);
  if (!total) return [];
  const x0 = Math.floor((camX - 220) / PROP_CELL), x1 = Math.floor((camX + VW + 220) / PROP_CELL);
  const y0 = Math.floor((camY - 60) / PROP_CELL), y1 = Math.floor((camY + VH + 120) / PROP_CELL);
  const L = propsSeen;
  if (L && L.stage === G.stage && L.kinds === kinds && L.n === list.length && L.total === total
    && L.x0 === x0 && L.x1 === x1 && L.y0 === y0 && L.y1 === y1) return L.out;
  const out = [];
  propsSeen = { stage: G.stage, kinds, n: list.length, total, x0, x1, y0, y1, out };
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
  const im = pic(`prop/${b.prop}.png`);
  if (!im) return;
  const left = Math.round(b.x - im.width / 2), top = Math.round(b.y - im.height);
  const behind = b.prop.startsWith('tree') && p.x > left && p.x < left + im.width && p.y < b.y - 4 && p.y > top + 10;
  if (behind) ctx.globalAlpha = 0.5;
  ctx.drawImage(im, left, top);
  ctx.globalAlpha = 1;
}

/** A ground pattern for a terrain kind, drawn once per hunt. */
function makeGround(kind) {
  // 연's own floor for the terrain, one game pixel per picture pixel.
  const fp = `floor/${kind}.png`, has = (M.floor || []).includes(kind), tile = has ? pic(fp) : null;
  if (tile) return ctx.createPattern(tile, 'repeat');
  // (not in yet: the drawn ground stands in, and 연's floor takes its place as soon as it is)
  if (has && !makeGround.wait.has(kind)) {
    makeGround.wait.add(kind);
    picWarm([fp]).then(() => {
      makeGround.wait.delete(kind);
      if (!pic(fp)) return;
      if (G && G.stage.terrain === kind) G.ground = makeGround(kind);
      if (kind === 'field') menuGround = makeGround('field');
    });
  }
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

makeGround.wait = new Set();

const DARK = { cave: 0.55, house: 0.6, sea: 0.45, lava: 0.35,
  // 연's grounds under the earth or the sea (tools/yeon_grounds.py).
  y_raid_hell: 0.45, y_wolf: 0.55, y_hwatang: 0.4, y_cheolsang: 0.5, y_greatwall: 0.55, y_qin: 0.5, y_spidercave: 0.55, y_baekdu4: 0.5, y_geohae: 0.45, y_wreck: 0.45, y_reef: 0.35 };

// Where the canvas and the keys stand on the screen, for the HUD drawn on the canvas: read at most
// twice a second (and afresh after a resize). Read every frame, each read made the browser lay
// the page out again after the HUD's text had changed (a forced layout or five a frame).
const boxes = new Map();
function boxOf(el) {
  const now = performance.now();
  let b = boxes.get(el);
  if (!b || now - b.at > 500) {
    b = { r: el.getBoundingClientRect(), at: now };
    boxes.set(el, b);
  }
  return b.r;
}

function resize() {
  boxes.clear();
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
  xfReset(); // (a canvas given a size starts again: its transform too)
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
  if (name !== null) $('#train').hidden = true; // 수련장's panel goes with the hunt view
  if (name === 'select' || name === 'stages') audio.bgm(audio.pickBgm('select') ? 'select' : 'title');
  if (name === 'select') buildSelect();
  if (name === 'stages') { buildStages(); syncPartyLine(); }
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
    // The hero as it is now: its worn pieces and 코디 (연's layers), not the class's bare portrait.
    lookPicture(c).then(url => { if (url) b.querySelector('.hero').src = url; });
  }
}

/** A class's look as saved (gear and 코디), standing facing down: a data URL, or null without 연's heroes. */
const lookPics = new Map();
let lookChain = Promise.resolve();
async function lookPicture(cls) {
  const H = M.yhero2 && M.yhero2[cls.id];
  if (!H) return null;
  const want = yGearVariants(cls, savedGear(cls) || {});
  const key = cls.id + JSON.stringify(want);
  // (one class after another: each look's sheets are 40 to 80 MB while its picture is made)
  if (!lookPics.has(key)) lookPics.set(key, (lookChain = lookChain.then(() => drawLook(cls, H, want)).catch(() => null)));
  return lookPics.get(key);
}
async function drawLook(cls, H, want) {
  const sheets = {}, parts = heroLookParts(H, want);
  await Promise.all(parts.map(x => layerEntry(x[2]).p));
  try {
    for (const [kind, meta, path] of parts) {
      const e = layerBms.get(path), im = e && e.bm;
      if (im && im.width) sheets[kind] = { im: dyeImage(sinsuDressed(savedGear(cls) || {}, kind, im, path), meta), meta };
    }
    return lookFrame(H, sheets);
  } finally {
    layerDone(parts.map(x => x[2]));
  }
}
function lookFrame(H, sheets) {
  if (!sheets.body) return null;
  const a = H.anims.idle_down || H.anims.walk_down;
  const box = frameBox(H, Object.values(sheets).map(x => x.meta));
  const c = document.createElement('canvas');
  c.width = box.cw;
  c.height = box.ch;
  drawLayers(c.getContext('2d'), H, sheets, a, 0, box);
  // Cropped to what is drawn, so the card shows the hero, not the empty cell around it.
  const g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 8) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 < 0) return null;
  const out = document.createElement('canvas');
  out.width = x1 - x0 + 3;
  out.height = y1 - y0 + 3;
  out.getContext('2d').drawImage(c, x0 - 1, y0 - 1, out.width, out.height, 0, 0, out.width, out.height);
  return out.toDataURL();
}

/** What opens a closed ground: the boss of the ground before it (or of the ground it hangs on). */
function lockReason(i) {
  const s = STAGES[i], need = s.open ? STAGES.find(x => x.id === s.open) : STAGES[i - 1];
  return need ? `${need.name}의 보스를 쓰러뜨리면 해금됩니다` : '이전 사냥터를 정복하면 해금됩니다';
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

/** 끝없는 지옥 (stage.hidden): shown once 철상지옥 has been conquered three times, or with ?abyss;
 *  the 비밀의 소 레벨 once its way has opened past the last floor's boss. */
function abyssFound() {
  return QUERY.has('abyss') || !!progress.abyss;
}
function hiddenShown(s) {
  return !s.hidden || (s.cow ? QUERY.has('abyss') || !!progress.cowLevel : abyssFound());
}

function unlocked(i) {
  // The first fourteen open one after another; an added ground when its own is conquered.
  const s = STAGES[i];
  if (!hiddenShown(s)) return false;
  if (s.open) return QUERY.has('all') || !!progress.cleared[s.open];
  return QUERY.has('all') || i === 0 || !!progress.cleared[STAGES[i - 1].id];
}

let mapTab = 'world_1';
let pickedStage = null;
let pickedMode = 'conquer'; // 사냥 기믹: 정복 / 보스 직행 / 소탕 on a ground conquered before

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
      if (!hiddenShown(s)) continue;
      const open = unlocked(i), done = !!progress.cleared[s.id];
      const b = document.createElement('button');
      b.className = 'raid stagecard' + (open ? '' : ' locked') + (s === pickedStage ? ' on' : '');
      const { pool, boss } = stageMonsters(s);
      // The boss's picture where the build has one, else the ground's strongest monster.
      const face = monsterById[boss.id] ? boss.id : (pool[pool.length - 1] || {}).id;
      b.innerHTML = `<img src="${monFace(face)}" alt=""><div><b>${s.name} <small>Lv ${s.lv}</small></b>`
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
      b.innerHTML = `<img src="${monFace((namedMonster(r.boss) || r.boss).id)}" alt=""><div><b>${r.name} <small>${raidStars(r)}</small></b><span>${r.intro}</span>`
        + `<span>${raidOpen(r) ? (done ? `${done}번 처치` : '미처치') : raidLock(r)}</span></div>`;
      b.onclick = () => { pickedStage = r; buildStages(); };
      map.append(b);
    }
    // 대항전 (war.js): the guild wars from the raid list too.
    const wb = document.createElement('button');
    wb.className = 'raid';
    wb.innerHTML = `${M.hud && M.hud.ui && M.hud.ui.includes('ui_img_sinsu_4') ? '<img src="assets/hud/ui_img_sinsu_4.png" alt="">' : ''}<div><b>사신수 문파대항전</b><span>청룡·백호·주작·현무 — 25 대 25 문파전</span><span>역할을 골라 출전</span></div>`;
    wb.onclick = () => War.openBoard();
    map.append(wb);
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
    if (s.map !== mapTab || !hiddenShown(s)) return;
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
    <div class="mons">${show.map(m => `<img src="${monFace(m.id)}" alt="">`).join('')}</div>
    <div class="boss">보스: <b>${boss.name}</b></div>
    <div class="state${progress.cleared[s.id] ? ' done' : ''}">${progress.cleared[s.id] ? '정복한 사냥터'
      : open ? '도전 가능한 사냥터' : `잠김: ${lockReason(i)}`}</div>`;
  // 사냥 기믹: a ground conquered before, three ways in; its 숙련 ★.
  if (!progress.cleared[s.id] || settings.legacyPace) pickedMode = 'conquer';
  else {
    const row = document.createElement('div'), star = (progress.mastery || {})[s.id] || 0;
    row.className = 'modes';
    row.innerHTML = `<small>숙련 ${'★'.repeat(star)}${'☆'.repeat(3 - star)}</small>` + Object.entries(Hunt.MODES)
      .map(([k, m]) => `<button class="btn${k === pickedMode ? ' on' : ''}" data-mode="${k}" title="${m.desc}">${m.name}</button>`).join('');
    for (const b of row.querySelectorAll('button')) b.onclick = () => { pickedMode = b.dataset.mode; stageInfo(); };
    $('#stage-info').append(row);
  }
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
  $('#trade-title').textContent = `괴력난신 ★ 효과 · ★${cs.stars}` + (cs.next ? ` · 다음 ★${cs.next[0]}` : ' · 모두 해금');
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
  return QUERY.has('all') || (!!progress.cleared[r.open] && (!r.after || !!(progress.raids || {})[r.after]));
}
/** What a raid still waits on, for its card. */
function raidLock(r) {
  if (!progress.cleared[r.open]) return `${STAGES.find(x => x.id === r.open).name}을(를) 정복하면 해금`;
  return `${RAIDS.find(x => x.id === r.after).name} 승리 시 해금`;
}

/** The raid's card: its boss, and the party that will gather, from each class's best. */
function raidInfo(r) {
  // 공대: twenty-four raiders gather; the player's other grown classes (Lv 8 and up) among them.
  const party = CLASSES.filter(c => c !== chosenClass && best[c.id] && best[c.id].lvl >= 8).map(c => `${c.name} Lv ${best[c.id].lvl}`);
  const rec = best[chosenClass.id], start = raidStart(rec, chosenClass.id);
  const roles = War.raidRoles(chosenClass);
  const role = War.ROLES[settings.raidRole] ? settings.raidRole : chosenClass.id === 'poet' ? 'healer' : chosenClass.id === 'warrior' ? 'tank' : 'dps';
  $('#stage-info').innerHTML = `<h3>${r.name}</h3><div class="lv">보스 ${r.boss.name} · ${RAID_BOSS_AT}초에 등장 · ${RAID_LIMIT / 60}분 안에</div>
    <p>${r.intro}. 바닥이 붉게 깜빡이는 칸은 곧 내리친다: 한 칸씩 걸어 피하라.</p>
    <div class="mons"><img src="${monFace((namedMonster(r.boss) || r.boss).id)}" alt=""></div>
    <div class="party">${chosenClass.name}(나) Lv ${start}부터 · 공격대 25명${party.length ? ` · 내 다른 직업: ${party.slice(0, 4).join(', ')}` : ''}</div>
    <div class="party raid-roles">역할 ${Object.entries(War.ROLES).map(([id, x]) => `<button data-rrole="${id}" title="${x.desc}" style="font:11px G9,sans-serif;padding:0 5px;margin:0 1px;border:1px solid ${id === role ? '#c08a10' : '#8a7050'};background:${id === role ? '#ffe9a8' : '#f4e6c4'};color:${id === role ? '#7a3a00' : '#4a3a28'}${roles.includes(id) ? '' : ';opacity:0.7'}">${x.name}</button>`).join('')} <small>· 보상 등급은 역할별 기여로</small></div>
    <div class="boss">난이도 ${raidStars(r)} · 보상 ${RAID_GEAR[r.id].pow}등급 세트 · ${won(120 * r.level)} · 레이드주화 ${10 * r.level + (r.gwoe ? 30 : 0)}</div>
    <div class="party" style="color:${combatPower(chosenClass) >= raidPower(r) ? '#1e6a10' : '#9a1800'}">권장 전투력 ${raidPower(r).toLocaleString()} · 내 전투력 ${combatPower(chosenClass).toLocaleString()}</div>
    <div class="party">${raidSet(r.id, chosenClass.id).map(([k, n]) => {
      const owned = bag(chosenClass).includes(`${k}:${GEAR[chosenClass.id][k].indexOf(n)}`);
      return `${{ weapon: '무기', armor: '갑옷', shield: '방패' }[k]} ${n}${owned ? '(보유)' : ''}`;
    }).join(' · ')}</div>
    <div class="state">${raidOpen(r) ? '25인 공격대 레이드' : raidLock(r)}</div>`;
  $('#stage-info').querySelectorAll('[data-rrole]').forEach(b => {
    b.onclick = () => { settings.raidRole = b.dataset.rrole; saveJson('bs_settings', settings); raidInfo(r); };
  });
  // How the hero starts: its recorded build, or picking cards as on a hunting ground.
  const sw = document.createElement('button');
  sw.className = 'btn';
  sw.style.marginTop = '4px';
  sw.textContent = settings.raidManual ? '시작 기술: 직접 고르기' : '시작 기술: 최고 빌드';
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
      || STAGES.find(s => s.map === mapTab && !s.hidden);
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
const occ = new Map(); // "tx,ty" -> the body holding that tile
const key = (x, y) => x + ',' + y;
const DIRS = [[0, 1], [-1, 0], [1, 0], [0, -1]];

// 바람의나라 연's crowd: right round the hero monsters do not queue one to a tile but press in, a few
// on a tile, overlapping. Away from the hero a tile still holds one (the field keeps its order and
// its pathing); within two tiles of the hero a tile may take up to three (two on the outer ring),
// each drawn a little off the tile's middle. The tile's first comer holds it in occ; the others
// sharing it are in crowd. Whatever strikes a tile strikes everyone on it (bodiesAt).
// In a war, a raid or a 「쟁」 war.js decides (War.share): fighters of one side pass through and
// share each other's tiles (and the hero's), as 연's players do; a foe's tile stays shut.
const crowd = new Map(); // "tx,ty" -> the monsters sharing the tile with its holder
const SHARE_NEAR = 3, SHARE_FAR = 2;

/** Every body on a tile: its holder, then those sharing it (null when none). */
function bodiesAt(x, y) {
  const k = key(x, y), b = occ.get(k);
  if (!b) return null;
  const c = crowd.get(k);
  return c ? [b, ...c] : [b];
}

/** A body leaves its tile: one sharing it takes it over. */
function leave(b) {
  const k = key(b.tx, b.ty), c = crowd.get(k);
  if (occ.get(k) === b) {
    if (c && c.length) {
      occ.set(k, c.shift());
      if (!c.length) crowd.delete(k);
    } else occ.delete(k);
  } else if (c) {
    const i = c.indexOf(b);
    if (i >= 0) c.splice(i, 1);
    if (!c.length) crowd.delete(k);
  }
}

/** May this monster press onto a taken tile beside the hero? */
function canShare(b, nx, ny) {
  if (G && G.war) return !!(b.war && War.share(b, nx, ny));
  if (!G || G.war || G.stage.raid || !b.m || b.ally || b.war || b.march || b.flee || b.kind === 'boss' || b.kind === 'mini') return false;
  const p = G.player, d = Math.abs(nx - p.tx) + Math.abs(ny - p.ty);
  if (d < 1 || d > 2 || (p.stepping && p.sfx === nx && p.sfy === ny)) return false;
  const k = key(nx, ny), h = occ.get(k);
  if (!h || !h.m || h.ally || h.war || h.kind === 'boss' || h.kind === 'mini') return false;
  const c = crowd.get(k);
  return !c || c.length + 1 < (d === 1 ? SHARE_NEAR : SHARE_FAR);
}

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
  b.x = (b.fx + (b.tx - b.fx) * k) * TILE + TILE / 2 + (b.jx || 0);
  b.y = (b.fy + (b.ty - b.fy) * k) * TILE + TILE - 6 + (b.jy || 0);
}

/**
 * Where a monster stands on its tile: a little off the middle of its own (no rigid rows), and
 * spread round the tile when others share it, leaning in to the hero, as 연's crowds heap on one.
 */
function jostle(b, dt) {
  if (b.j0 === undefined) b.j0 = Math.random() * Math.PI * 2;
  // (its tile's key kept while it stands there: a new string per monster per frame before)
  if (b.jkx !== b.tx || b.jky !== b.ty) { b.jkx = b.tx; b.jky = b.ty; b.jk = key(b.tx, b.ty); }
  const k = b.jk, c = crowd.get(k);
  let tx = Math.cos(b.j0) * 5, ty = Math.sin(b.j0) * 3;
  if (c) {
    const n = c.length + 1, i = occ.get(k) === b ? 0 : c.indexOf(b) + 1;
    const a = b.j0 + (i / n) * Math.PI * 2;
    tx = Math.cos(a) * 15;
    ty = Math.sin(a) * 9;
  }
  const p = G.player, dx = p.tx - b.tx, dy = p.ty - b.ty, d = Math.abs(dx) + Math.abs(dy);
  if (d <= 2 && d > 0) {
    tx += (dx / d) * 9;
    ty += (dy / d) * 7;
  }
  const r = Math.min(1, dt * 7);
  b.jx = (b.jx || 0) + (tx - (b.jx || 0)) * r;
  b.jy = (b.jy || 0) + (ty - (b.jy || 0)) * r;
}

function free(tx, ty) {
  const p = G.player;
  return !occ.has(key(tx, ty)) && !crowd.has(key(tx, ty)) && !(p.tx === tx && p.ty === ty)
    && !(p.stepping && p.sfx === tx && p.sfy === ty)
    && (!G.arena || Hunt.open(tx, ty)); // 사냥 기믹: a ground fought on 연's own map
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
  const open = free(nx, ny);
  if (!open && !canShare(b, nx, ny)) return false;
  leave(b);
  if (open) occ.set(key(nx, ny), b);
  else {
    const k = key(nx, ny), c = crowd.get(k);
    if (c) c.push(b);
    else crowd.set(k, [b]);
  }
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
  if (b.m && !b.ally && !b.war && G && !G.war) jostle(b, dt);
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

function startRun(cls, stage, training = false) {
  const gear = savedGear(cls);
  const mons = stageMonsters(stage);
  occ.clear();
  crowd.clear();
  // The screen before (the town, another run) is let go; this run's own pictures loaded.
  const pics = runPics(cls, stage);
  leaveScreen(cls, gear, [...pics, `yhunt/${stage.id}_`, 'prop/war_']);
  portalSprites.clear(); // (the town's gate swirls, 30 MB: made again when the town opens)
  if (!stage.war) War.release(true);
  picWarm(pics);
  heroWarm(cls, gear);
  // The run's own effects, loaded and decoded now (goHunt waits for them; a war's kits are warmed by war.js).
  // (수련장: each spell's as it is picked, trainPick — the whole kit at once was 50 MB)
  if (!training) fxWarm(runFxIds(cls, stage));
  G = {
    cls, stage, ...mons, level: stage.level !== undefined ? stage.level : STAGES.indexOf(stage), ground: makeGround(stage.terrain), marks: [],
    t: 0, kills: 0, gold: 0, over: false, dead: false, paused: false, choosing: false, cleared: false, revived: false,
    player: {
      hp: Math.round(cls.hp * (1 + 0.1 * up('life'))), maxHp: Math.round(cls.hp * (1 + 0.1 * up('life'))), mp: cls.mp * 0.5, maxMp: cls.mp, speed: cls.speed, armor: cls.armor,
      face: 1, fdx: 0, fdy: 1, phase: 0, lvl: 1, xp: 0, next: xpFor(1), inv: 0,
      hero: true, gear,
      pose: null, poseT: 0, walkT: 0,
    },
    skills: [], passives: Object.fromEntries(Object.keys(PASSIVES).map(k => [k, 0])),
    buffs: { power: 0, stealth: 0, guard: 0, shield: 0, haste: 0, reflect: 0, ward9: 0, echo: 0 },
    enemies: [], dying: [], allies: [], party: [], fxs: [], drops: [], texts: [], log: [], shots: [], sparks: [], feed: [],
    combo: { n: 0, t: 0, best: 0, pop: 0 },
    chainRun: null,
    bubble: null, spawnT: 0, minis: MINI_AT.slice(), champs: CHAMPIONS_AT.slice(), packs: 0, bossDue: true, events: eventPlan(),
    pendingLevels: 0, shake: 0, plainDropAt: 0,
    rerolls: 2 + up('reroll'), skips: 2 + up('skip'), banishes: 2 + up('banish'), banished: new Set(),
    banishing: false, extraLives: up('revive'),
  };
  G.meta0 = training ? null : metaSnap(); // the results say what this hunt moved (pkg C)
  G.player.x = TILE / 2;
  G.player.y = TILE - 6;
  heroTile();
  applyGear();
  Hunt.start(G); // 사냥 기믹 (hunt.js)
  $('#dash-btn').hidden = !G.hunt;
  // A run starts with the weapon's plain attack only; the first card comes at once.
  // (사냥 기믹 보스 직행: the build comes made, as a raid's.)
  if (!(G.hunt && G.hunt.mode === 'rush')) {
    G.pendingLevels = 1;
    G.firstCard = true;
  }
  showScreen(null);
  if (audio) audio.play('enter'); // 연's own 'into the world' sting
  audio.bgm(huntMusic());
  $('#chat').innerHTML = '';
  $('#vert').innerHTML = '';
  say(`${stage.name}에 들어왔습니다.`, 'sys');
  say(stage.intro);
  if (stage.raid) raidSetup();
  if (stage.war) War.setup();
  G.wasCleared = stage.raid ? !!(progress.raids || {})[stage.id] : !!progress.cleared[stage.id];
  ultPrime(); // (the 9차 필살기's cinematic readied now: the first press stalled on it)
  // 수련장: no cards, no crowd; the dummy and the spell panel instead.
  if (training) {
    setupTraining();
    return;
  }
  syncSpeed();
  nextChoice();
}

/** The 속도 key: x2 anywhere, x3 on a ground (or raid) conquered before. */
function speedMax() { return !G || (G.war && !G.war.raid) ? 1 : G.wasCleared ? 3 : 2; } // 대항전: as it is
// The pick holds for this run only: every hunt, raid, 대항전 and 쟁 starts at ×1 (G is new each run).
function huntSpeed() { return G ? Math.min(G.speedPick || 1, speedMax()) : 1; }
function syncSpeed() {
  const b = $('#speed-btn');
  b.hidden = !G || !!G.training || speedMax() < 2;
  b.textContent = `속도 ×${huntSpeed()}`;
}
$('#speed-btn').onclick = () => {
  G.speedPick = huntSpeed() % speedMax() + 1;
  syncSpeed();
};

// ---------------------------------------------------------------- gear
//
// Each class wears its own line of gear (avatar.js GEAR). Chests from middle bosses and bosses
// hand out the next piece; what a class has found stays for its later hunts, as in the game.

function savedGear(cls) {
  progress.gear = progress.gear || {};
  const g = Object.assign({ armor: 0, weapon: 0, shield: -1, helmet: -1, cape: -1 }, progress.gear[cls.id]);
  // The 코디 worn over it (costume.js): looks only, kept apart from the saved gear.
  Object.defineProperty(g, 'cos', { value: wornCostume(cls.id), enumerable: false, writable: true });
  return g;
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
  const pw = k => Math.max(0, pieceRank(cls, g, k));
  // The weapon as it strikes (weaponEff): its 공격력 options and its family's edge on every foe
  // counted, so the ▲/▼ and 가장 강한 장비 agree with the damage done. (By the rank alone a
  // 공격력 piece — 심연 고유 ×2.74 — read below a 진일신검 ×2.50.)
  const gear = weaponEff(cls, g) * 3 + pw('armor') * 2 + (hasShield(c) ? pw('shield') : pw('armor') / 2) + pw('helmet') + pw('cape') + extraPow(g);
  const set = cardSet(), rec = best[c];
  return Math.round((gear * 200 + promoOf(c) * 800 + (rec ? rec.lvl : 1) * 60) * (1 + set.dmg) * (1 + PROMO_BONUS.dmg * promoOf(c)) + set.hp * 20);
}
/** A worn piece's rank (-1: none): a special's with its stars (items.js specialRank), else its
 *  place's power with its stars (the 용무기 its step). One rule for the 전투력, the stats, the card. */
function pieceRank(cls, g, k) {
  const sp = g[k + 'Sp'] && SPECIAL[g[k + 'Sp']];
  if (sp) return specialRank(sp, cls.id, starOf(cls, 'sp:' + sp.id));
  return g[k] < 0 || g[k] === undefined ? -1 : gearPower(cls.id, k, g[k]) + starPow(cls, `${k}:${g[k]}`);
}
/** The weapon's damage multiplier: ×(1 + 0.12 rank), the 공격력 options worn, its family's edge on
 *  every foe (태초, 심판의낫). */
function weaponMult(cls, g) {
  const sp = g.weaponSp && SPECIAL[g.weaponSp];
  let power = 0;
  for (const k of ['weapon', 'armor', 'shield', 'helmet', 'cape']) {
    const s = g[k + 'Sp'] && SPECIAL[g[k + 'Sp']];
    if (s) power += optIds(s).filter(o => o === 'power').length;
  }
  // (태초's first blow and crowd edge are not "every foe": a boss is struck by its rank alone.)
  const edge = sp && sp.taecho ? 1 + TAECHO_EDGE.all : sp && sp.craft && sp.craft.judge ? 1 + (JUDGE_EDGE[sp.id] || 0) : 1;
  return (1 + 0.12 * Math.max(0, pieceRank(cls, g, 'weapon'))) * (1 + 0.15 * power) * edge;
}
/** The weapon's rank as it strikes: the plain rank that would strike as hard. */
function weaponEff(cls, g) {
  return (weaponMult(cls, g) - 1) / 0.12;
}
/** 방어구 보조 옵션 (items.js gearExtra) in 전투력: a second line counts 0.3 of a rank, a feature 0.5. */
const EXTRA_POW = { line: 0.3, proc: 0.5 };
function extraPow(g) {
  let n = 0;
  for (const k of ['armor', 'shield', 'helmet', 'cape']) {
    const sp = g[k + 'Sp'] && SPECIAL[g[k + 'Sp']];
    if (k === 'shield' && g.shield < 0 && !g.shieldSp) continue;
    if (sp) n += (sp.extra ? EXTRA_POW.line : 0) + (sp.proc ? EXTRA_POW.proc : 0);
  }
  return n;
}
function raidPower(r) {
  return 1200 * r.level + 3000;
}

/** Stats from the gear worn: weapons hit harder, armor gives health, shields guard. */
function applyGear() {
  const p = G.player, g = p.gear, c = G.cls.id;
  if (!hasShield(c)) { g.shield = -1; delete g.shieldSp; } // an old save's shield on a class that carries none
  // A special worn counts a rank above its look, and adds its option.
  // Each star above ★1 adds half a rank.
  const pow = k => pieceRank(G.cls, g, k);
  const bonus = p.bonus = {};
  for (const k of ['weapon', 'armor', 'shield', 'helmet', 'cape']) {
    const sp = g[k + 'Sp'] && SPECIAL[g[k + 'Sp']];
    if (sp) for (const o of optIds(sp)) bonus[o] = (bonus[o] || 0) + 1;
  }
  // 사신수 무신 세트 (armory.js): 갑옷 and 기운 of one 신수 add their lines (and 현무's 호신강기).
  const mset = musinSetOf(g);
  if (mset) for (const o of mset.lines) bonus[o] = (bonus[o] || 0) + 1;
  // The features of the pieces besides the weapon (items.js PROCS): each once, however many carry it.
  p.procs = new Set(['weapon', 'armor', 'shield', 'helmet', 'cape'].map(k => g[k + 'Sp'] && SPECIAL[g[k + 'Sp']] && SPECIAL[g[k + 'Sp']].proc).filter(Boolean));
  if (mset && mset.proc) p.procs.add(mset.proc);
  // 투구 adds health, 망토 guards (both only from today's crafted sets).
  const extra = k => (g[k] >= 0 || g[k + 'Sp'] ? Math.max(0, pow(k)) : 0);
  const cs = cardSet(), promo = promoOf(c), cb = costumeBonus(); // cb: 코디 수집
  const hp = G.cls.hp + pow('armor') * 20 + extra('helmet') * 12 + 40 * (bonus.life || 0) + cs.hp + PROMO_BONUS.hp * promo + cb.hp;
  p.hp += hp - (p.gearHp || G.cls.hp);
  p.maxHp += hp - (p.gearHp || G.cls.hp);
  p.gearHp = hp;
  p.armor = G.cls.armor + (hasShield(G.cls.id) ? Math.max(0, pow('shield') + 1) : Math.max(0, Math.floor(pow('armor') / 2) + 1)) + Math.round(extra('cape') / 3) + 3 * (bonus.guard || 0) + cs.armor + cb.armor;
  p.gearPower = (1 + 0.12 * pow('weapon')) * (1 + 0.15 * (bonus.power || 0)) * (1 + cs.dmg) * (1 + PROMO_BONUS.dmg * promo) * (1 + cb.dmg);
  p.bootPct = bootsPct(progress); // 신발 (boots.js): 이동속도, worn by every class
  // 격: what the worn pieces loose by themselves (gyeok.js), and the statuses the shields ward off.
  const gy = [];
  p.wards = new Set();
  // A weapon's 격 is drawn as large as the weapon strikes a boss (items.js GYEOK_TIER, weaponEff).
  const eff = weaponEff(G.cls, g);
  for (const k of ['weapon', 'armor', 'shield', 'helmet', 'cape']) {
    const sp = g[k + 'Sp'] && SPECIAL[g[k + 'Sp']];
    if (!sp) continue;
    if (sp.gyeok && GYEOK[sp.gyeok]) {
      const g0 = tierGyeok({ id: sp.gyeok, ...GYEOK[sp.gyeok] }, k === 'weapon' ? eff : null, familyTint(sp));
      // The abyss uniques: their 격 drawn larger still (태초 is already at the top tier of tierGyeok).
      const top = k === 'weapon' && !sp.taecho && sp.rarity ? TOP_GYEOK_FX.abyss : 0;
      gy.push(top ? { ...g0, fxK: (g0.fxK || 1) * top } : g0);
    }
    if (sp.ward) p.wards.add(sp.ward);
  }
  p.dragonCut = 0;
  if (!g.weaponSp && g.weapon === dragonTier(G.cls)) {
    const step = starOf(G.cls, `weapon:${g.weapon}`), dg = dragonGyeok(c, step);
    const ss = (progress.dragonSinsu || {})[c];
    // The 제십's flash: its 사신수's colour where it took one, 선계's light after its 천상 각성.
    const dtint = step >= 10 && heavenOn(c) ? FAMILY_TINT.heaven : ss && step >= 10 ? SINSU_TINT[ss] : FAMILY_TINT.dragon;
    gy.push(tierGyeok({ id: 'dragon', ...dg }, eff, dtint));
    p.dragonCut = dg.cdCut;
    if (ss && SINSU[ss] && step >= 10) gy.push(tierGyeok({ id: SINSU[ss].gyeok, ...GYEOK[SINSU[ss].gyeok] }, eff, dtint));
  }
  p.gyeoks = gy;
  p.judge = g.weaponSp && SPECIAL[g.weaponSp] && SPECIAL[g.weaponSp].craft && SPECIAL[g.weaponSp].craft.judge ? JUDGE_EDGE[g.weaponSp] || 0 : 0;
  // The weapon's family edge (items.js): an abyss unique's hunt (not 태초's: its own is the first
  // blow, TAECHO_EDGE), the 주작's aura on the allies near.
  const wsp = g.weaponSp && SPECIAL[g.weaponSp];
  p.abyssHunt = !!(wsp && wsp.rarity && !wsp.taecho);
  p.taecho = !!(wsp && wsp.taecho);
  p.aura = 0;
  if (g.weaponSp === 'cr_sinsu_jujak') p.aura = JUJAK_AURA.k + JUJAK_AURA.perStar * (starOf(G.cls, 'sp:cr_sinsu_jujak') - 1);
  else if (!g.weaponSp && g.weapon === dragonTier(G.cls) && starOf(G.cls, `weapon:${g.weapon}`) >= 10 && (progress.dragonSinsu || {})[c] === 'jujak') p.aura = JUJAK_AURA.dragonK;
  // An abyss weapon's strike effect (items.js ABYSS_SWING): its kind's (close-in or far).
  const ws = g.weaponSp && SPECIAL[g.weaponSp];
  const far = !MELEE_WEAPON.has(c), set = ABYSS_SWING[far ? 'ranged' : 'melee'];
  const have = layers => layers.filter(l => M.fx[l[0]]);
  const fxTint = ws && ws.dress && ws.dress.fxTint || null; // a filter, or one per effect (TAECHO_DRESS)
  p.swing = ws && ws.swing && have(set.hit).length ? { ...ws.swing, hit: have(set.hit), heavy: ws.swing.heavy ? have(set.heavy) : null, tint: fxTint } : null;
  p.trail = far && ws && ws.rarity && have(ABYSS_TRAIL.layers).length ? { ...ABYSS_TRAIL, layers: have(ABYSS_TRAIL.layers), tint: fxTint } : null;
}

/** A weapon's 격 grown with the weapon's rank (items.js GYEOK_TIER): a larger picture, and a 격 that
 *  strikes round reaching further. The 격's own entry is left as it is (a copy). */
function tierGyeok(g, rank, tint = null) {
  // (an armour's 격: as it is, whatever the weapon)
  const t = rank === null ? null : gyeokTier(rank);
  if (!t) return g;
  return { ...g, fxK: (g.fxK || 1) * t.fxK, area: g.area ? g.area + t.area : g.area, lv: t.lv || 0, flash: t.flash ? tint || '#fff2c0' : null };
}
/** The colour of a worn piece's family (items.js FAMILY_TINT): the top 격's flash. */
function familyTint(sp) {
  const f = familyOf(sp);
  return FAMILY_TINT[f] || null;
}
/** 천상 각성 (선계 레이드's 선계의 기운): the class's 용무기 제십 in 선계's light. */
function heavenOn(c) {
  return !!(progress.dragonHeaven || {})[c];
}

/** A weapon's strike-effect filter for effect id: one for all, or by effect (with a default). */
function fxTintOf(t, id) {
  return t && typeof t === 'object' ? t[id] || t.default : t || null;
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
  if (on === 'hit' && p.swing && t && t.m) {
    const w = p.swing;
    // With the blow: on the frame the weapon lands (half way through the swing or cast pose the
    // damage starts), a close-in weapon's slash between the hero's weapon and the struck, turned
    // the way the blow travels; a far weapon's where its arrow or bolt lands. Sized to the hero.
    const land = p.poseT > 0 ? p.poseT * 0.5 : 0.08, melee = MELEE_WEAPON.has(G.cls.id);
    const hx = p.x, hy = p.y - 22, ex = t.x, ey = t.y - 18, ang = Math.atan2(ey - hy, ex - hx);
    const at = (k, dy) => melee ? [hx + (ex - hx) * k, hy + (ey - hy) * k + dy] : [ex, ey + dy];
    if (G.t >= (G.swingAt || 0)) {
      G.swingAt = G.t + w.cd;
      w.hit.forEach(([id, sc, dy, dl], i) => {
        const [x, y] = at(i ? 0.95 : 0.6, dy);
        addFx(id, x, y, { scale: sc * w.scale * ABYSS_FX_K, delay: land + dl, rot: melee && !i ? ang - Math.PI / 2 : 0, tint: fxTintOf(w.tint, id) });
      });
    }
    if (w.heavy && w.heavy.length && G.t >= (G.heavyAt || 0)) {
      G.heavyAt = G.t + w.hcd;
      for (const [id, sc, dy, dl] of w.heavy) { const [x, y] = at(0.9, dy); addFx(id, x, y, { scale: sc * ABYSS_FX_K, delay: land + dl, tint: fxTintOf(w.tint, id) }); }
    }
  }
  if (!p.gyeoks || !p.gyeoks.length || !t || !t.m) return;
  G.gyeokCd = G.gyeokCd || {};
  for (const g of p.gyeoks) {
    if (g.on !== on || G.t < (G.gyeokCd[g.id] || 0) || Math.random() >= g.chance * (G.plainHit ? PLAIN_GYEOK_K : 1)) continue;
    G.gyeokCd[g.id] = G.t + (g.cd || 0) * GYEOK_CD_K;
    fireGyeok(g, t);
  }
}

/** The features of the pieces besides the weapon (items.js PROCS), on a blow taken or a kill. */
function gearProc(on, t) {
  const p = G.player;
  if (!p.procs || !p.procs.size || G.dead) return;
  const cd = (G.procCd = G.procCd || {});
  const ready = id => p.procs.has(id) && G.t >= (cd[id] || 0);
  if (on === 'kill' && ready('killheal') && Math.random() < PROCS.killheal.chance) {
    cd.killheal = G.t + PROCS.killheal.cd;
    if (p.hp < p.maxHp) {
      heal(p.maxHp * PROCS.killheal.k, false, true);
      if (M.fx[PROCS.killheal.fx] && fxBudget('proc', 2)) addFx(PROCS.killheal.fx, 0, -26, { follow: true, scale: 0.7 });
    }
  }
  if (on !== 'hurt') return;
  if (ready('shock')) {
    const P = PROCS.shock, base = gyeokBase();
    cd.shock = G.t + P.cd;
    if (M.fx[P.fx]) addFx(P.fx, p.x, p.y - 10, { scale: 0.9 });
    G.procHitting = true;
    for (const e of G.enemies) if (e.hp > 0 && !(e.war && e.team === SIDE) && Math.abs(e.tx - p.tx) <= P.area && Math.abs(e.ty - p.ty) <= P.area) hurtEnemy(e, base * P.dmg);
    G.procHitting = false;
    floatText(p.x, p.y - 78, P.name, '#ffd27a', true);
  }
  if (ready('swift')) {
    const P = PROCS.swift;
    cd.swift = G.t + P.cd;
    G.buffs.swift = G.t + P.sec;
    if (M.fx[P.fx]) addFx(P.fx, 0, -26, { follow: true, scale: 0.7 });
  }
}
/** Each frame: 흡혈's share paid out (capped a second), 호신강기's shield renewed, a 보호막 run out. */
function gearTick(dt) {
  const p = G.player;
  if (p.vampAcc > 0) {
    G.vampT = (G.vampT || 0) + dt;
    if (G.vampT >= 1) {
      G.vampT = 0;
      const n = Math.min(p.vampAcc, p.maxHp * GEAR_OPT.vampCap);
      p.vampAcc = 0;
      if (n >= 1 && p.hp < p.maxHp) heal(n, false, true);
    }
  }
  if (p.barrierUntil && G.t >= p.barrierUntil) { p.barrier = 0; p.barrierUntil = 0; }
  if (p.procs && p.procs.has('barrier')) {
    const cd = (G.procCd = G.procCd || {}), P = PROCS.barrier;
    if (G.t >= (cd.barrier || P.cd * 0.5)) {
      cd.barrier = G.t + P.cd;
      const v = p.maxHp * P.k;
      if (!(p.barrier >= v)) {
        p.barrier = v;
        p.barrierUntil = 0; // until broken
        if (M.fx[P.fx]) addFx(P.fx, 0, -26, { follow: true, scale: 0.8 });
      }
    }
  }
}

function fireGyeok(g, t) {
  const p = G.player, base = gyeokBase(), m = g.mech || null, lv = g.lv || 0;
  // 끌어모음 (귀문진상·귀문진산): the foes round the struck dragged a tile toward it first, so the blow finds them.
  if (m && m.pull) gyPull(t, m.pull);
  const hits = g.area ? G.enemies.filter(e => Math.abs(e.tx - t.tx) <= g.area && Math.abs(e.ty - t.ty) <= g.area)
    : g.targets ? [t, ...nearestEnemies(g.targets, 5, t).filter(e => e !== t).slice(0, g.targets - 1)] : [t];
  const fxId = M.fx[g.fx] ? g.fx : g.fxAlt && M.fx[g.fxAlt] ? g.fxAlt : null;
  const fxK = (g.area ? 0.9 : 0.7) * (g.fxK || 1) * (fxId === g.fx ? 1 : g.altK || 1);
  if (fxId && fxBudget('gyeok', 3)) {
    // On the wearer (현무 standing over the one it guards, 주작 over the one it strengthens).
    const self = M.fx[g.fxSelf] ? g.fxSelf : g.selfAlt && M.fx[g.selfAlt] ? g.selfAlt : null;
    if (self) {
      addFx(self, p.x, p.y + (g.selfDy || 0), { scale: (g.selfK || 1) * (self === g.fxSelf ? 1 : g.selfAltK || 1), anchor: 'bottom' });
      // (seen through a little: the hero it stands over stays in sight)
      const f = G.fxs[G.fxs.length - 1];
      if (g.selfAlpha && f && f.id === self) f.alpha = g.selfAlpha;
    }
    // 청린수폭: its 청룡 drawn in parts (crBurst), the rest as one picture.
    if (g.draw === 'cr' && fxId === g.fx && M.fx.g_cr_brush) crBurst('storm', t, fxK, g);
    else {
      // (보이는 범위 = 맞는 범위: an area 격 over the 3×3 it strikes, a single one on the one struck)
      fxOn(fxId, t, { scale: gyScale(fxId, fxK), tint: g.tint || null, ...(g.area ? { area: true, cap: 3 * 1.25 } : {}) });
      gyLight(fxId);
    }
    // Over every tile of the struck 3x3, the middle first (청린수폭's burst of water; with its 청룡,
    // as the lightning reaches the ground: gridAt).
    if (g.fxGrid && M.fx[g.fxGrid]) {
      const at = fxId === g.fx ? g.gridAt || 0 : 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (dx || dy || (at && g.gridMid)) addFx(g.fxGrid, t.x + dx * TILE * 0.85, t.y + dy * TILE * 0.7 + 6, { scale: g.gridK || 1, anchor: 'bottom', delay: at + 0.06 * (Math.abs(dx) + Math.abs(dy)), flip: dx > 0 });
      }
    }
    // A second picture on each struck (청룡's orbs, 주작's flames), a few at most.
    if (g.fx2 && M.fx[g.fx2]) for (const e of hits.slice(0, 4)) if (g.fx2 !== g.fx || e !== t) { fxOn(g.fx2, e, { scale: gyScale(g.fx2, 0.8 * (g.fx2K || g.fxK || 1)), tint: g.tint || null, delay: fxId === g.fx ? g.fx2At || 0 : 0 }); gyLight(g.fx2); }
  }
  // The top weapons' 격 (신화, items.js GYEOK_TIER): a soft light round the struck in the family's
  // colour (it was the whole screen; drawn in render), and the blow's way one step further (lv).
  if (g.flash && screenFlashOk()) {
    G.gyeokFlash = { t: G.t, color: g.flash, x: t.x, y: t.y - 20, dark: GLOW_DARK.has(g.flash) };
    G.shake = Math.max(G.shake, 0.1);
  }
  // The first blow: the whole of it, or its share where the 격's way deals the rest (a ground, a
  // second blow, the strikes after it); 처형 a boss nearly felled the harder.
  const n = m && m.strikes ? m.strikes.n : 1;
  const first = m && m.strikes ? m.strikes.first || 1 / n : (m && m.first) || 1;
  G.procHitting = true;
  let dealt = 0;
  for (const e of hits) {
    if (e.hp <= 0) continue;
    const ex = m && m.exec && (e.kind === 'boss' || e.kind === 'mini') && e.hp <= e.maxHp * m.exec.boss ? 1 + m.exec.bossK : 1;
    if (g.dmg) dealt += hurtEnemy(e, base * g.dmg * first * ex) || 0;
    if (g.st) applyStatus(e, ...g.st);
    if (g.st2) applyStatus(e, ...g.st2);
  }
  if (m) dealt += gyWays(g, m, t, hits, base, lv);
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

// ---------------------------------------------------------------- 격's ways (gyeok.js mech)
//
// Each 격 does its own thing besides its picture: a chain that leaps, a ground that burns or
// guards for a few seconds, a blow that lands again a moment later, a line, a pull or a shove,
// a 처형, strikes of a summoned beast, pillars of light, a rally of the allies. All of it runs
// from two short lists (G.gq: what is still to land; G.gz: the grounds) with a cap each, the
// grounds looking at the field twice a second, their pictures one cached sprite per colour.
const GQ_MAX = 24, GZ_MAX = 6, GL_MAX = 10, GZ_TICK = 0.5;
const GZ_RGB = { fire: '255,120,40', poison: '120,210,70', wood: '110,180,60', ice: '150,210,255', blood: '150,16,24', jade: '70,220,180', gold: '255,220,140', soul: '190,150,255' };
const GLOW_DARK = new Set(['#c0201a']); // the blood families: their light darkens, never a red flash

/** Is a screen-wide light allowed now? Never with 번쩍임 줄이기, and one in 0.45 s at most (no
 *  more than ~2 a second from all sources together, never back to back). */
function screenFlashOk() {
  if (settings.calmFx) return false;
  if (G.t - (G.screenFlashAt ?? -9) < 0.45) return false;
  G.screenFlashAt = G.t;
  return true;
}
/** A 격 picture drawn added (light on light: 태초광명, 주작비상) is seen through, never a white sheet. */
function gyLight(id) {
  const f = G.fxs[G.fxs.length - 1];
  if (f && f.id === id && M.fx[id].add) f.alpha = settings.calmFx ? 0.5 : 0.65;
}
/** ...and never taller than most of the screen (주작비상's fire, grown at the top tier, was three
 *  screens high, its own white flash at its heart lighting half the screen for a second). */
function gyScale(id, k) {
  const f = M.fx[id];
  return f && f.add ? Math.min(k, (VH * 0.65) / (f.h * (f.k || 1))) : k;
}

function gyQueue(o) {
  const q = G.gq || (G.gq = []);
  if (q.length >= GQ_MAX) return;
  q.push(o);
}
/** The foes on the tiles within r of a tile (r 0 = its own). */
function gyArea(tx, ty, r, out) {
  out.length = 0;
  for (const e of G.enemies) if (e.hp > 0 && Math.abs(e.tx - tx) <= r && Math.abs(e.ty - ty) <= r) out.push(e);
  return out;
}
const gyTmp = [];
/** A body moved a tile, as 유인 moves them: never a boss, its lieutenant or a war's fighter. */
function gyShove(e, dx, dy) {
  if ((!dx && !dy) || e.hp <= 0 || e.moving || e.kind === 'boss' || e.kind === 'mini' || e.war || e.march || e.flee || e.ally) return;
  step(e, dx, dy, 0.16);
}
function gyPull(t, o) {
  let n = 0;
  for (const e of G.enemies) {
    if (e === t || n >= o.max || Math.max(Math.abs(e.tx - t.tx), Math.abs(e.ty - t.ty)) > o.r || Math.max(Math.abs(e.tx - t.tx), Math.abs(e.ty - t.ty)) < 2) continue;
    gyShove(e, Math.sign(t.tx - e.tx), Math.sign(t.ty - e.ty));
    n++;
  }
}

/** A 격's way, after its first blow: what it deals now (the rest lands later). */
function gyWays(g, m, t, hits, base, lv) {
  const p = G.player, D = base * g.dmg;
  let dealt = 0;
  if (m.push) for (const e of hits) gyShove(e, Math.sign(e.tx - p.tx), Math.sign(e.ty - p.ty));
  if (m.exec) {
    // 처형: a crowd foe the blow left at a fifth of its life falls.
    for (const e of hits) if (e.hp > 0 && !e.war && e.kind !== 'boss' && e.kind !== 'mini' && e.hp <= e.maxHp * m.exec.hp) {
      tally(e, e.hp);
      e.hp = 0;
      killEnemy(e);
      G.gyExec = (G.gyExec || 0) + 1;
    }
  }
  if (m.line) {
    // 돌풍: on along the line from the hero through the struck, every foe on it struck and thrown on.
    const dx = Math.sign(t.tx - p.tx), dy = Math.sign(t.ty - p.ty);
    if (dx || dy) {
      const len = Math.max(Math.abs(t.tx - p.tx), Math.abs(t.ty - p.ty)) + m.line.len + lv;
      for (let i = 1; i <= len; i++) {
        const bs = bodiesAt(p.tx + dx * i, p.ty + dy * i);
        if (bs) for (const e of bs.slice()) if (e.m && !e.ally && e.hp > 0 && e !== t && !(e.war && e.team === SIDE)) {
          dealt += hurtEnemy(e, D * m.line.k, [dx, dy]) || 0;
          if (m.line.push) gyShove(e, dx, dy);
        }
        if (i % 2 === 0 && M.fx[g.fx] && fxBudget('gyway', 4)) addFx(g.fx, (p.tx + dx * i) * TILE + TILE / 2, (p.ty + dy * i) * TILE + TILE / 2, { scale: 0.45, delay: 0.03 * i });
      }
    }
  }
  if (m.chain) gyQueue({ at: G.t + 0.08, kind: 'jump', g, x: t.x, y: t.y, tx: t.tx, ty: t.ty, left: m.chain.n + lv, dmg: D * m.chain.fall, fall: m.chain.fall, st: m.chain.st, seen: hits.slice(0, 8), color: m.chain.color === 'soul' ? '205,170,255' : '200,230,255' });
  if (m.det) {
    // A mark on the struck (its ring shown under it), going off a moment later round wherever it is.
    let k = m.det.k;
    if (m.det.bleedK && t.st && t.st.bleed) k *= 1 + Math.min(0.5, m.det.bleedK * t.st.bleed.n);
    gyQueue({ at: G.t + m.det.delay, made: G.t, kind: 'det', g, e: t, x: t.x, y: t.y, tx: t.tx, ty: t.ty, r: m.det.r, dmg: D * k, st: m.det.st, cursed: m.det.cursed });
  }
  if (m.zone) gyZone(g, m.zone, t, D, lv);
  if (m.strikes) {
    const seen = [t];
    for (let i = 1; i < m.strikes.n; i++) gyQueue({ at: G.t + m.strikes.gap * i, kind: 'strike', g, e: t, i, focus: m.strikes.focus, dmg: D * (m.strikes.rest || (m.strikes.n - 1) / m.strikes.n) / (m.strikes.n - 1), seen });
  }
  if (m.rays) {
    // Pillars of light on the crowd outside the first blow, nearest first; alone, on the struck.
    const r = m.rays, far = [], n = r.n + (lv >= 3 ? 1 : 0);
    for (const e of G.enemies) {
      const d = Math.max(Math.abs(e.tx - t.tx), Math.abs(e.ty - t.ty));
      if (e.hp > 0 && d > (g.area || 0) && d <= 6) far.push([d, e]);
    }
    far.sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < n; i++) {
      const e = far[i] ? far[i][1] : t;
      gyQueue({ at: G.t + r.gap * (i + 1), kind: 'ray', g, e, x: e.x, y: e.y, tx: e.tx, ty: e.ty, r: r.r, dmg: D * (far[i] ? r.k : r.lone) });
    }
  }
  if (m.rally) {
    // 호령: the allies near (companions, raiders, the guild's) strike harder a while (auraK).
    G.buffs.g_rally = G.t + m.rally.sec;
    G.buffs.g_rallyK = m.rally.k;
  }
  if (m.cleanse && p.sts) p.sts = {};
  if (m.taunt) {
    // 현무: the boss turns on the one in the shell (its 어그로 for a while).
    G.aggro = p;
    G.aggroT = m.taunt;
  }
  return dealt;
}

/** A ground of a 격: lies (or, a shell, goes with the hero) a few seconds, striking twice a second. */
function gyZone(g, o, t, D, lv) {
  const zs = G.gz || (G.gz = []);
  let z = zs.find(x => !x.on);
  if (!z) {
    if (zs.length < GZ_MAX) zs.push(z = {});
    else z = zs.reduce((a, b) => (a.until < b.until ? a : b));
  }
  const p = G.player, at = o.follow ? p : t;
  z.on = true;
  z.g = g;
  z.o = o;
  z.x = at.x;
  z.y = at.y;
  z.tx = at.tx;
  z.ty = at.ty;
  z.r = o.r + (o.follow ? 0 : Math.max(0, (g.area || 0) - (GYEOK[g.id] ? GYEOK[g.id].area || 0 : 0)));
  z.made = G.t;
  z.until = G.t + o.sec + 0.5 * lv;
  z.next = G.t + GZ_TICK;
  z.dmg = D * o.k;
  z.rgb = GZ_RGB[o.color] || GZ_RGB.gold;
}
/** Is the body inside a guarding shell (현무의 철옹)? Its ward, else 0. */
function shellWard(b) {
  if (!G.gz) return 0;
  for (const z of G.gz) if (z.on && z.o.allyWard && Math.abs(b.tx - z.tx) <= z.r && Math.abs(b.ty - z.ty) <= z.r) return z.o.allyWard;
  return 0;
}
function shellThorns() {
  if (!G.gz) return null;
  for (const z of G.gz) if (z.on && z.o.thorns) return z;
  return null;
}

/** Each frame: what is due lands, the grounds strike. No allocation in the common case. */
function gyeokTick() {
  const q = G.gq;
  if (q && q.length) {
    let n = q.length;
    for (let i = 0; i < n;) {
      if (q[i].at > G.t) { i++; continue; }
      const o = q[i];
      q[i] = q[n - 1];
      q[n - 1] = q[q.length - 1];
      q.pop();
      n--;
      G.procHitting = true;
      gyLand(o);
      G.procHitting = false;
    }
  }
  const zs = G.gz;
  if (!zs) return;
  const p = G.player;
  for (const z of zs) {
    if (!z.on) continue;
    if (G.t >= z.until) { z.on = false; continue; }
    if (z.o.follow) { z.x = p.x; z.y = p.y; z.tx = p.tx; z.ty = p.ty; }
    if (G.t < z.next) continue;
    z.next += GZ_TICK;
    let got = 0;
    G.procHitting = true;
    for (const e of gyArea(z.tx, z.ty, z.r, gyTmp)) {
      if (z.dmg > 0) got += hurtEnemy(e, z.dmg) || 0;
      if (z.o.st) applyStatus(e, ...z.o.st);
      if (z.o.slow) e.slow = Math.max(e.slow || 0, 0.8);
    }
    G.procHitting = false;
    if (z.o.drain && got > 0) heal(got * z.o.drain, false, true);
    // a flicker of the 격's own picture somewhere in it, now and then
    if (z.dmg > 0 && M.fx[z.g.fx] && fxBudget('gzone', 2)) addFx(z.g.fx, z.x + rand(-z.r, z.r) * TILE * 0.8, z.y + rand(-z.r, z.r) * TILE * 0.5, { scale: 0.32, tint: z.g.tint || null, anchor: 'bottom' });
  }
}

function gyLand(o) {
  const g = o.g;
  if (o.kind === 'jump') {
    // The next one: the nearest standing foe within four tiles not yet struck.
    let best = null, bd = 5;
    for (const e of G.enemies) {
      if (e.hp <= 0 || o.seen.includes(e)) continue;
      const d = Math.max(Math.abs(e.tx - o.tx), Math.abs(e.ty - o.ty));
      if (d < bd) { bd = d; best = e; }
    }
    if (!best) return;
    hurtEnemy(best, o.dmg);
    if (o.st) applyStatus(best, ...o.st);
    gyLine(o.x, o.y - 20, best.x, best.y - 20, o.color);
    if (M.fx[g.fx] && fxBudget('gyway', 4)) fxOn(g.fx, best, { scale: 0.42 * (g.fxK || 1), tint: g.tint || null });
    if (o.left > 1 && o.seen.length < 12) {
      o.seen.push(best);
      gyQueue({ ...o, at: G.t + 0.08, x: best.x, y: best.y, tx: best.tx, ty: best.ty, left: o.left - 1, dmg: o.dmg * o.fall });
    }
  } else if (o.kind === 'det' || o.kind === 'ray') {
    const e = o.e && o.e.hp > 0 ? o.e : null;
    const tx = e ? e.tx : o.tx, ty = e ? e.ty : o.ty, x = e ? e.x : o.x, y = e ? e.y : o.y;
    for (const b of gyArea(tx, ty, o.r, gyTmp)) {
      if (o.cursed && !(b.curse > 0)) continue;
      hurtEnemy(b, o.dmg);
      if (o.st) applyStatus(b, ...o.st);
    }
    const id = M.fx[g.fx] ? g.fx : null;
    if (id && fxBudget('gyway', 4)) { addFx(id, x, y - 14, { scale: (o.kind === 'ray' ? 0.5 : 0.55) * Math.min(1.6, g.fxK || 1), tint: g.tint || null }); gyLight(id); }
  } else if (o.kind === 'strike') {
    // A summoned beast's next strike: another foe near (the 용무기's, the same one), else the struck again.
    let e = o.e && o.e.hp > 0 ? o.e : null;
    if (!o.focus) {
      let best = null, bd = 5;
      const from = e || o.e;
      for (const b of G.enemies) {
        if (b.hp <= 0 || o.seen.includes(b)) continue;
        const d = Math.max(Math.abs(b.tx - from.tx), Math.abs(b.ty - from.ty));
        if (d < bd) { bd = d; best = b; }
      }
      if (best) e = best;
    }
    if (!e) return;
    for (const b of g.area ? gyArea(e.tx, e.ty, g.area, gyTmp) : [e]) {
      hurtEnemy(b, o.dmg);
      if (g.st) applyStatus(b, ...g.st);
      if (g.st2) applyStatus(b, ...g.st2);
    }
    const id = g.fxGrid && M.fx[g.fxGrid] ? g.fxGrid : g.fx2 && M.fx[g.fx2] ? g.fx2 : M.fx[g.fx] ? g.fx : null;
    if (g.draw === 'cr' && M.fx.g_cr_bolt) crBurst('bolt', e, (g.fxK || 1) * 0.9, g, o.i);
    if (id && fxBudget('gyway', 4)) {
      if (id === g.fxGrid) addFx(id, e.x, e.y + 6, { scale: (g.gridK || 1) * 1.1, anchor: 'bottom', flip: o.i % 2 === 1 });
      else fxOn(id, e, { scale: (id === g.fx ? 0.75 * (g.fxK || 1) : 0.8 * (g.fx2K || 1)), tint: g.tint || null, flip: o.i % 2 === 1 });
    }
    o.seen.push(e); // the next strike looks for yet another
  }
}

/** A chain's leap: a jagged line between two bodies for a fifth of a second (pooled). */
function gyLine(x1, y1, x2, y2, rgb) {
  const ls = G.gl || (G.gl = []);
  let l = ls.find(x => !(G.t - x.t0 < 0.22));
  if (!l) {
    if (ls.length >= GL_MAX) return;
    ls.push(l = {});
  }
  l.x1 = x1; l.y1 = y1; l.x2 = x2; l.y2 = y2; l.t0 = G.t; l.rgb = rgb; l.seed = Math.random() * 100;
}

// ---------------------------------------------------------------- 청린수폭's 청룡 (gyeok.js cheongrin)
//
// Out of 연's own 청룡 pictures only (tools/yeon_cheongrin.py): its 청룡 변신's storm cloud with the
// blue-lightning dragon coiling down out of it onto the struck (g_cr_storm, the clip's 8 cells at its
// pace and its small sideways shake), the lightning body alone striking again on each strike after
// (g_cr_bolt), and, the water of it, 진청룡마령참's brush-stroke dragons (Yong-gung_BlueDragon_Line,
// in the 청룡's blues: g_cr_brush) swimming round the struck 3x3, one more with each strike, each
// growing through the clip's shapes as it goes, behind the storm on the far side and before it on
// the near, a pale wake behind. Under them a ground of water. All alpha-blended (no added light),
// one pooled list, a few pictures each frame.
const CR_MAX = 6, CR_RGB = '60,160,255';
// Skill_Effect_Transform_Chungryong's Position/Effect x per cell (its units: the sprite at ×1.1)
const CR_SHAKE = [0, 4.5, -6, 5, 5.5, 5.5, 5.5, 5];
// its cells in turn, the coiled dragon's crackling three (4-6) once more while the strikes land
const CR_SEQ = [0, 1, 2, 3, 4, 5, 6, 4, 5, 6, 7], CR_CELL = 0.11;
const CR_BRUSH = { n: 3, gap: 0.25, life: 1.15, turn: 1.25 * Math.PI };
function crBurst(kind, e, k, g, i = 0) {
  const bs = G.gcr || (G.gcr = []);
  let b = bs.find(o => G.t - o.t0 > o.life);
  if (!b) {
    if (bs.length >= CR_MAX) return;
    bs.push(b = {});
  }
  // on the struck, going with it as 연's weapon 격 do (FOLLOW_EFFECT_TARGET), where it fell if it falls
  b.kind = kind; b.e = e; b.x = e.x; b.y = e.y; b.t0 = G.t; b.i = i;
  b.k = k / 1.3; // 1 at the 격's own size, more as the weapon's rank grows it
  b.r = (g.area || 1) + 0.25;
  b.tint = g.tint || null;
  b.dir = Math.random() < 0.5 ? 1 : -1;
  b.life = kind === 'storm' ? Math.max(CR_BRUSH.gap * (CR_BRUSH.n - 1) + CR_BRUSH.life + 0.05, CR_SEQ.length * CR_CELL + 0.2) : 0.4;
}
/** One brush dragon of a storm at its age: where it is, its look; null when not out. */
function crBrush(b, j, age, out) {
  const u = (age - 0.04 - CR_BRUSH.gap * j) / CR_BRUSH.life;
  if (u <= 0 || u >= 1) return null;
  const a = Math.PI * (0.55 + 0.667 * j) + b.dir * u * CR_BRUSH.turn;
  const rx = b.r * TILE * 1.05, ry = b.r * TILE * 0.55;
  out.u = u;
  out.x = b.x + Math.cos(a) * rx;
  out.y = b.y - 6 + Math.sin(a) * ry - 14 * u;
  out.front = Math.sin(a) > 0;
  out.vx = -Math.sin(a) * b.dir; // its way round, seen from the side
  return out;
}
const crTmp = {};
/** A brush dragon (j) of a storm, on its side of the storm (front: nearer the viewer). */
function crDrawBrush(b, j, age, front) {
  const o = crBrush(b, j, age, crTmp);
  if (!o || o.front !== front) return;
  const calm = settings.calmFx, u = o.u, grow = 1 - (1 - u) * (1 - u);
  const a = Math.min(1, u / 0.12, (1 - u) / 0.18) * (calm ? 0.7 : 0.9);
  const t = (Math.min(4, Math.floor(u * 6)) + 0.5) * 0.11, sc = b.k * (0.2 + 0.13 * grow), y = o.y - 287 * sc * 0.42;
  ctx.globalAlpha = a;
  drawFx('g_cr_brush', o.x, y, t, sc, o.vx * 0.3, 'mid', false, o.vx < 0, b.tint);
  // and once more added, faint, for the water's light (never past 0.65; not with 번쩍임 줄이기)
  if (!calm) {
    ctx.globalAlpha = a * 0.25;
    ctx.globalCompositeOperation = 'lighter';
    drawFx('g_cr_brush', o.x, y, t, sc, o.vx * 0.3, 'mid', false, o.vx < 0, b.tint);
    ctx.globalCompositeOperation = 'source-over';
  }
}
/** Over the bodies, before the other effects: the storms and bolts, their brush dragons round them. */
function drawCheongrin() {
  const bs = G.gcr;
  if (!bs || !M.fx.g_cr_brush) return;
  for (const b of bs) {
    const age = G.t - b.t0;
    if (age > b.life) { b.e = null; continue; }
    if (b.e && b.e.hp > 0) { b.x = b.e.x; b.y = b.e.y; }
    if (b.kind === 'storm') for (let j = 0; j < CR_BRUSH.n; j++) crDrawBrush(b, j, age, false);
  }
  for (const b of bs) {
    const age = G.t - b.t0;
    if (age > b.life) continue;
    const calm = settings.calmFx;
    if (b.kind === 'storm') {
      // the clip's cells at its 0.117 s (game pace 0.11), its last one fading
      const end = CR_SEQ.length * CR_CELL;
      ctx.globalAlpha = Math.min(1, age / 0.08, 1 - (age - end) / 0.2) * (calm ? 0.85 : 1);
      if (ctx.globalAlpha > 0) {
        // (grown with the weapon's rank, but never past most of the screen's height)
        const c = CR_SEQ[Math.min(CR_SEQ.length - 1, Math.floor(age / CR_CELL))], sc = Math.min(b.k * 0.78, VH * 0.62 / 256);
        drawFx('g_cr_storm', b.x + CR_SHAKE[c] * sc / 1.1, b.y + 4, (c + 0.5) * CR_CELL, sc, 0, 'bottom', false, false, b.tint);
      }
    } else {
      // the lightning dragon's body, its two cells in turn, striking again
      ctx.globalAlpha = Math.min(1, age / 0.05, (b.life - age) / 0.15) * (calm ? 0.8 : 0.95);
      drawFx('g_cr_bolt', b.x, b.y + 4, age, b.k * 0.5, 0, 'bottom', true, b.i % 2 === 1, b.tint);
    }
  }
  for (const b of bs) {
    const age = G.t - b.t0;
    if (age > b.life || b.kind !== 'storm') continue;
    for (let j = 0; j < CR_BRUSH.n; j++) crDrawBrush(b, j, age, true);
  }
  ctx.globalAlpha = 1;
}

/** Under the bodies: the grounds of the 격 and the marks still to go off. */
function drawGyeokGround() {
  // 청린수폭's water on the struck 3x3, spreading as the lightning lands, gone with the last dragon
  if (G.gcr) for (const b of G.gcr) {
    const age = G.t - b.t0;
    if (b.kind !== 'storm' || age > b.life) continue;
    const w = (2 * b.r + 0.6) * TILE * Math.min(1, 0.5 + age / 0.4);
    ctx.globalAlpha = Math.min(1, age / 0.2, (b.life - age) / 0.4) * 0.85;
    ctx.drawImage(gzSprite(CR_RGB), Math.round(b.x - w / 2), Math.round(b.y - 6 - w * 0.27), Math.round(w), Math.round(w * 0.54));
  }
  if (G.gz) for (const z of G.gz) {
    if (!z.on) continue;
    const age = G.t - z.made, left = z.until - G.t;
    const a = Math.min(1, age / 0.25, left / 0.5) * (z.o.follow ? 0.8 : 0.9);
    const w = (2 * z.r + 1) * TILE * 1.05;
    ctx.globalAlpha = a;
    ctx.drawImage(gzSprite(z.rgb), Math.round(z.x - w / 2), Math.round(z.y - 6 - w * 0.27), Math.round(w), Math.round(w * 0.54));
  }
  if (G.gq) for (const o of G.gq) {
    if (o.kind !== 'det') continue;
    // the mark: a ring that fills in as it nears (a steady rise, no blinking)
    const e = o.e && o.e.hp > 0 ? o.e : o, k = Math.min(1, (G.t - o.made) / Math.max(0.1, o.at - o.made));
    const w = (2 * o.r + 1) * TILE * (0.6 + 0.4 * k);
    ctx.globalAlpha = 0.35 + 0.45 * k;
    ctx.drawImage(gzSprite(o.g.tint === GY_ABYSS_TINT ? GZ_RGB.blood : GZ_RGB.gold), Math.round(e.x - w / 2), Math.round(e.y - 6 - w * 0.27), Math.round(w), Math.round(w * 0.54));
  }
  ctx.globalAlpha = 1;
}
/** Over the bodies: the 현무 shell round the hero (seen through), the chains' leaps. */
function drawGyeokLines() {
  if (G.gz && M.fx.gy_hm_shell) for (const z of G.gz) {
    if (!z.on || !z.o.shell) continue;
    const age = G.t - z.made, left = z.until - G.t;
    ctx.globalAlpha = Math.min(1, age / 0.3, left / 0.5) * 0.45;
    drawFx('gy_hm_shell', z.x, z.y - 22, age, 1.1 + 0.55 * z.r, 0, 'mid', true);
    ctx.globalAlpha = 1;
  }
  if (!G.gl) return;
  ctx.save();
  ctx.lineJoin = 'round';
  for (const l of G.gl) {
    const age = G.t - l.t0;
    if (age >= 0.22) continue;
    const a = 1 - age / 0.22;
    for (const [lw, al] of LINE_PASSES) {
      ctx.strokeStyle = `rgba(${l.rgb},${(al * a).toFixed(2)})`;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(l.x1, l.y1);
      for (let i = 1; i < 5; i++) {
        const k = i / 5, j = Math.sin(l.seed + i * 2.3) * 9;
        ctx.lineTo(l.x1 + (l.x2 - l.x1) * k - (l.y2 - l.y1) / 60 * j, l.y1 + (l.y2 - l.y1) * k + j);
      }
      ctx.lineTo(l.x2, l.y2);
      ctx.stroke();
    }
  }
  ctx.restore();
}
const LINE_PASSES = [[5, 0.25], [2, 0.9]];
const gzSprites = new Map();
/** One soft ground ellipse per colour (made once): a glow, brighter at its rim. */
function gzSprite(rgb) {
  let c = gzSprites.get(rgb);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d'), gr = x.createRadialGradient(64, 64, 0, 64, 64, 63);
  gr.addColorStop(0, `rgba(${rgb},0.22)`);
  gr.addColorStop(0.75, `rgba(${rgb},0.16)`);
  gr.addColorStop(0.9, `rgba(${rgb},0.55)`);
  gr.addColorStop(1, `rgba(${rgb},0)`);
  x.fillStyle = gr;
  x.fillRect(0, 0, 128, 128);
  gzSprites.set(rgb, c);
  return c;
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
  // 연 names a status over the struck as it takes hold ("마비", "중독"): once, and a few at a time.
  if (!live && !G.war && fxBudget('stword', 3)) floatText(e.x, e.y - e.m.h * (e.scale || 1) - 22, STATUS[kind].name, STATUS[kind].color || '#d8b8ff');
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

/** The hero's damage before a boss's cap or a raid's scaling, by kind (for the tests' DPS); a
 *  companion's apart. */
function tally(e, d) {
  const t = G.dealt || (G.dealt = { all: 0, big: 0, ally: 0 });
  if (G.training) trainHit(d, G.allyHitting || G.procHitting);
  if (G.allyHitting) { t.ally = (t.ally || 0) + d; return; }
  t.all += d;
  if (G.procHitting) t.proc = (t.proc || 0) + d; // (a 격's own share, for the tests)
  if (e.kind === 'boss' || e.kind === 'mini') t.big += d;
}

/** An abyss unique's edge (items.js ABYSS_HUNT): more to the crowd, more again in the abyss. */
function abyssEdge(e) {
  const crowd = !e.war && e.kind !== 'boss' && e.kind !== 'mini';
  // 태초 (items.js TAECHO_EDGE): the crowd a little more; not the abyss's own (no burst either).
  if (G.player.taecho) return crowd ? 1 + TAECHO_EDGE.mob : 1;
  return (crowd ? 1 + ABYSS_HUNT.mob : 1) * (G.stage.abyss && !G.war ? 1 + ABYSS_HUNT.abyss : 1);
}

/** An abyss unique's kill: now and then the fallen bursts in dark fire round it. */
function abyssBurst(e) {
  const b = ABYSS_HUNT.burst;
  if (G.t < (G.abyssBurstAt || 0) || Math.random() >= b.chance) return;
  G.abyssBurstAt = G.t + b.cd;
  G.burstN = (G.burstN || 0) + 1; // (counted for the tests)
  // (태초의 무기: its burst in light, the weapon's own strike tint.)
  const tint = G.player.swing && fxTintOf(G.player.swing.tint, b.fx);
  if (M.fx[b.fx] && fxBudget('abyssBurst', 2)) addFx(b.fx, e.x, e.y - 14, { scale: 0.5 * ABYSS_FX_K * 1.3, tint });
  const hits = G.enemies.filter(o => o !== e && o.hp > 0 && Math.abs(o.tx - e.tx) <= b.area && Math.abs(o.ty - e.ty) <= b.area);
  G.procHitting = true;
  for (const o of hits) hurtEnemy(o, gyeokBase() * b.dmg);
  G.procHitting = false;
}

/** 주작의 기운 (items.js JUJAK_AURA): an ally within its reach of the hero strikes this much harder. */
function auraK(m) {
  // 호령 (천자의분노·태초광명 격): the allies within five tiles of the hero, a while.
  const r = G && G.buffs && G.buffs.g_rally > G.t && m && (m.tx - G.player.tx) ** 2 + (m.ty - G.player.ty) ** 2 <= 25 ? 1 + (G.buffs.g_rallyK || 0) : 1;
  if (G && G.player && G.player.aura) G.auraAll = (G.auraAll || 0) + 1; // allies' blows while worn (for the tests)
  if (!inAura(m)) return r;
  G.auraN = (G.auraN || 0) + 1; // of them, strengthened
  return (1 + G.player.aura) * r;
}
function inAura(m) {
  const p = G && G.player;
  if (!p || !p.aura || G.dead || !m || m.dead || m.down) return false;
  return (m.tx - p.tx) ** 2 + (m.ty - p.ty) ** 2 <= JUJAK_AURA.r ** 2;
}

function dotHit(e, d, color) {
  if (e.hp <= 0) return;
  tally(e, d);
  if (e.capPerSec) {
    const sec = Math.floor(G.t);
    if (e.capSec !== sec) { e.capSec = sec; e.capUsed = 0; }
    d = Math.min(d, e.maxHp * e.capPerSec - e.capUsed);
    if (!(d > 0)) return;
    e.capUsed += d;
  }
  if (e.war) d = War.scale(d);
  e.hp -= d;
  e.shown = G.t;
  if (settings.numbers && G.texts.length < 70) G.texts.push({ x: e.x + rand(-6, 6), y: e.y - e.m.h * e.scale - 4, text: hitNum(d), t: 0, num: true, dot: true, crit: false, color });
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
  bujori9(kind); // (부조리, 격투가 9차 패시브: a hard status raises a barrier)
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

/** The ranks a piece's stars add: half a rank a star, the 용무기 DRAGON_STEP a step. */
function starPow(cls, key) {
  return (starOf(cls, key) - 1) * (isDragonKey(cls, key) ? DRAGON_STEP : 0.5);
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
  const sp = key.startsWith('sp:') && SPECIAL[key.slice(3)];
  return isDragonKey(cls, key) ? DRAGON_MAX : sp && sp.craft && sp.craft.stars ? sp.craft.stars : STAR_MAX;
}
/** An item icon by the item's name, made to sit with 연's (tools/fetch_icons.py, manifest gicon), or null. */
function nameIcon(name) {
  const f = name && M && M.gicon && M.gicon[name];
  return f ? 'assets/gicon/' + f : null;
}
/** A today's-client item picture by the item's name (its icon in 연's frame where the build has
 *  one, else the render as fetched), or null when the build has none. */
function picture(name) {
  const n = nameIcon(name);
  if (n) return n;
  const g = name && M && M.gear && M.gear[name];
  return g ? `assets/gear/${g.id}.png` : null;
}
/** Two item names the same piece: 연's 치장용 copy, a 진' form, spaces and the star aside. */
function sameItem(a, b) {
  const n = x => String(x || '').replace(/\(.*?\)|\d+성$|\s/g, '').replace(/^(진|극)'?/, '');
  return !!a && !!b && n(a) === n(b);
}
/** A bag piece's name: the 용무기 by its step (용천제삼검), the rest by their line. */
function pieceName(cls, kind, t) {
  return kind === 'weapon' && t === dragonTier(cls) ? dragonName(cls.id, starOf(cls, `weapon:${t}`)) : gearName(cls.id, kind, t);
}
/** 연's own icon of a piece, keyed as its 연 look is (a special by id, the 용무기 by step, else tier). */
function yItemIcon(cls, kind, t, spId) {
  const idx = M.yitemicon && M.yitemicon[cls.id] && M.yitemicon[cls.id][kind];
  if (!idx) return null;
  const key = spId ? (idx[spId] ? spId : SPECIAL[spId] ? 't' + lookAt(cls.id, kind, specialBase(SPECIAL[spId], cls.id)) : null)
    : kind === 'weapon' && t === dragonTier(cls) ? 'dragon' + starOf(cls, `weapon:${t}`) : 't' + lookAt(cls.id, kind, t);
  const f = key && idx[key];
  return f ? 'assets/yitemicon/' + f : null;
}
/** A picture in 태초's light (gold halo, white core), as a data URL. */
function glowIcon(pic, dz) {
  const pad = 8, c = document.createElement('canvas');
  c.width = pic.width + pad * 2;
  c.height = pic.height + pad * 2;
  const g = c.getContext('2d');
  for (const [col, blur, al] of [[dz.glowColor, 4, 0.9], [dz.core, 1, 0.9]]) {
    const r = document.createElement('canvas');
    r.width = c.width; r.height = c.height;
    const rg = r.getContext('2d');
    rg.drawImage(pic, pad, pad);
    rg.globalCompositeOperation = 'source-in';
    rg.fillStyle = col;
    rg.fillRect(0, 0, r.width, r.height);
    g.save(); g.filter = `blur(${blur}px)`; g.globalAlpha = al; g.drawImage(r, 0, 0); g.drawImage(r, 0, 0); g.restore();
  }
  g.drawImage(pic, pad, pad);
  return c.toDataURL();
}
/** A picture (its path under assets/) recoloured as a dress recolours a worn layer, in its light;
 *  made once, null until the picture is in. */
const dressedIcons = {};
function dressedIcon(src, dz) {
  if (dressedIcons[src]) return dressedIcons[src];
  const rel = src.replace(/^assets\//, '');
  if (!(rel in images)) loadImage(rel);
  const im = images[rel];
  if (!im || !im.complete || !im.width) return null;
  return (dressedIcons[src] = glowIcon(dressedSheet(im, 'icon|' + rel, dz.tint, dz.pal), dz));
}
/** 태초의 무기's icon: the very weapon the hero wears (its 연 layer, standing, facing down) in its
 *  gold-white dress and light, cut to the weapon. Made once a class; null until the sheet is in. */
const taechoIcons = {};
function taechoIcon(cls, sp) {
  // (an abyss weapon laid from the original's own picture takes the same way, in its dark dress)
  const ik = cls.id + (sp.taecho ? '' : ':abyss');
  if (taechoIcons[ik]) return taechoIcons[ik];
  // The first four: old 바람's picture itself, in the same light (what the hero holds).
  const cn = sp.classic && sp.classic[cls.id];
  if (cn && M.gear && M.gear[cn]) {
    const pp = `gear/${M.gear[cn].id}.png`;
    if (!(pp in images)) loadImage(pp);
    const pic = images[pp];
    if (!pic || !pic.complete || !pic.width) return null;
    return (taechoIcons[ik] = glowIcon(pic, sp.dress));
  }
  const H = M.yhero2 && M.yhero2[cls.id], ab = sp.base && sp.base[cls.id];
  // (the original's own weapon where it is laid for the class: items.js TAECHO_WORN)
  const wn = H && sp.worn && sp.worn[cls.id] && H.layers.weapon[sp.worn[cls.id]];
  const meta = wn || (H && ab && H.layers.weapon[String(ab[0])]);
  if (!meta) return null;
  const path = 'yhero2/' + meta.file;
  if (!(path in images)) loadImage(path);
  const im = images[path];
  if (!im || !im.complete || !im.width) return null;
  const a = H.anims.idle_down || H.anims.walk_down, box = frameBox(H, [meta]), dz = sp.dress;
  const sheets = { weapon: { im: dressedSheet(im, path, dz.tint, dz.pal), meta } };
  // (with its part behind the body: a laid spear's shaft is there)
  const wk = wn ? sp.worn[cls.id] : String(ab[0]);
  if (H.layers.wback && H.layers.wback[wk]) {
    const wb = H.layers.wback[wk], wp = 'yhero2/' + wb.file;
    if (!(wp in images)) loadImage(wp);
    if (images[wp] && images[wp].width) sheets.wback = { im: dressedSheet(images[wp], wp, dz.tint, dz.pal), meta: wb };
  }
  const w = document.createElement('canvas');
  w.width = box.cw;
  w.height = box.ch;
  drawLayers(w.getContext('2d'), H, sheets, a, 0, box);
  // (the icon is kept; the sheets it was cut from, and their recoloured copies, are not)
  for (const k of Object.keys(sheets)) { const lp = 'yhero2/' + sheets[k].meta.file; picDrop(lp); sheetForget(lp); }
  let bb;
  try {
    const d = w.getContext('2d').getImageData(0, 0, w.width, w.height).data;
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let y = 0; y < w.height; y++) for (let x = 0; x < w.width; x++) if (d[(y * w.width + x) * 4 + 3] > 30) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    if (x1 < 0) return null;
    bb = [x0, y0, x1 - x0 + 1, y1 - y0 + 1];
  } catch (e) { return null; }
  const pad = 8, c = document.createElement('canvas');
  c.width = bb[2] + pad * 2;
  c.height = bb[3] + pad * 2;
  const g = c.getContext('2d'), tint = (col, blur, al) => {
    const r = document.createElement('canvas');
    r.width = c.width; r.height = c.height;
    const rg = r.getContext('2d');
    rg.drawImage(w, bb[0], bb[1], bb[2], bb[3], pad, pad, bb[2], bb[3]);
    rg.globalCompositeOperation = 'source-in';
    rg.fillStyle = col;
    rg.fillRect(0, 0, r.width, r.height);
    g.save(); g.filter = `blur(${blur}px)`; g.globalAlpha = al; g.drawImage(r, 0, 0); g.drawImage(r, 0, 0); g.restore();
  };
  tint(dz.glowColor || '#ff2a0a', 4, dz.core ? 0.9 : 0.6);
  if (dz.core) tint(dz.core, 1, 0.9);
  g.drawImage(w, bb[0], bb[1], bb[2], bb[3], pad, pad, bb[2], bb[3]);
  return (taechoIcons[ik] = c.toDataURL());
}

/**
 * The icon of a piece as the hero wears it: where it is worn as one of 연's 치장용 looks (items.js
 * base, DRAGON_LOOK, LOOK_FIX) that look's own icon, else 연's icon of the item its layer is
 * (yItemIcon), so the picture in the bag, the codex and the smith is what the hero then wears.
 * null without 연's heroes.
 */
function wornIcon(cls, kind, t, spId) {
  if (!M.yhero2 || !M.yhero2[cls.id]) return null;
  // 백호환령부 is not worn: the tiger walks beside the hero, its own picture is its icon.
  if (spId && SPECIAL[spId] && SPECIAL[spId].craft && SPECIAL[spId].craft.pet) return null;
  const g = { [kind]: t };
  if (spId) g[kind + 'Sp'] = spId;
  const v = (yGearVariants(cls, g) || {})[kind];
  if (v && v[0] === 'c') {
    const it = costumeItems()[v.slice(1)];
    if (it && it.icon) return 'assets/' + it.icon;
  }
  return yItemIcon(cls, kind, t, spId);
}
/** The 용무기's icon at a step, as it is worn then. */
function dragonIcon(cls, step) {
  const H = M.yhero2 && M.yhero2[cls.id], dl = DRAGON_LOOK[cls.id] && DRAGON_LOOK[cls.id][step];
  const it = dl && H && H.layers.weapon && H.layers.weapon['c' + dl] && costumeItems()[dl];
  if (it && it.icon) return 'assets/' + it.icon;
  const idx = M.yitemicon && M.yitemicon[cls.id] && M.yitemicon[cls.id].weapon;
  return idx && idx['dragon' + step] ? 'assets/yitemicon/' + idx['dragon' + step] : null;
}
/** A piece's icon: what the hero wears with it (wornIcon); today's picture or the wardrobe's without 연's heroes. */
function pieceIcon(cls, kind, t, spId) {
  if (spId && SPECIAL[spId] && (SPECIAL[spId].taecho || (SPECIAL[spId].rarity && SPECIAL[spId].worn && SPECIAL[spId].worn[cls.id]
    && M.yhero2 && M.yhero2[cls.id] && M.yhero2[cls.id].layers.weapon[SPECIAL[spId].worn[cls.id]]))) {
    const ic = taechoIcon(cls, SPECIAL[spId]);
    if (ic) return ic;
  }
  // 청룡신검·현무불괴갑: worn as a recoloured 연 stand-in (items.js SINSU_DRESS), shown as the original's own picture.
  if (spId && SPECIAL[spId] && SPECIAL[spId].craft && (SPECIAL[spId].dress || SPECIAL[spId].worn || SPECIAL[spId].wornBack)) {
    const pic = picture(craftPicture(SPECIAL[spId], cls.id, starOf(cls, 'sp:' + spId)));
    // 악마 심판의낫: the original's picture in the abyss's dress and its red light, as it is worn.
    if (pic && SPECIAL[spId].worn && SPECIAL[spId].dress && !SPECIAL[spId].dress.pal) return dressedIcon(pic, SPECIAL[spId].dress) || pic;
    if (pic) return pic;
  }
  // An abyss weapon's icon is its look's own 연 icon: the named weapon's, else the plain one's.
  const ab = spId && SPECIAL[spId] && SPECIAL[spId].base && SPECIAL[spId].base[cls.id];
  const abIt = ab && costumeItems()[ab[0]];
  if (abIt && abIt.icon && M.yhero2 && M.yhero2[cls.id] && M.yhero2[cls.id].layers[kind] && M.yhero2[cls.id].layers[kind]['c' + ab[0]]) return 'assets/' + abIt.icon;
  const lt = spId && SPECIAL[spId] && SPECIAL[spId].lookTier ? SPECIAL[spId].lookTier[cls.id] : undefined;
  if (lt !== undefined) return yItemIcon(cls, kind, lt, null) || (hasAvatars() ? gearIcon(cls.id, kind, lt) : null);
  // A crafted piece with the original's own name and picture (the legendary sets, the original's
  // weapon lines): that picture, unless the hero wears 연's own copy of the very item (a 치장용),
  // whose icon is then the same piece in 연's drawing.
  const csp = spId && SPECIAL[spId] && SPECIAL[spId].craft && SPECIAL[spId];
  if (csp && csp.craft.pic) {
    const name = craftPicture(csp, cls.id, starOf(cls, 'sp:' + spId));
    const g = { [kind]: t, [kind + 'Sp']: spId }, v = (yGearVariants(cls, g) || {})[kind];
    const it = v && v[0] === 'c' && costumeItems()[v.slice(1)];
    if (!(it && sameItem(it.name, name)) && picture(name)) return picture(name);
  }
  // A piece of the lines whose 연 icon is another item's (items.js NAME_ICONS): the original's own.
  if (!csp && M.gicon) {
    const base = spId && SPECIAL[spId] ? specialBase(SPECIAL[spId], cls.id) : t;
    const n = base >= 0 && GEAR[cls.id][kind][base];
    if (n && NAME_ICONS.has(n) && nameIcon(n)) return nameIcon(n);
  }
  const y = wornIcon(cls, kind, t, spId);
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

function gearImage(g) {
  // The wardrobe's armor icon is a whole figure wearing it: on the ground that looked like a
  // stranger standing in the hunt. Armor lies there as an item, as the client showed drops.
  // 연's own icon for the piece where the build has it.
  const gc = G && (g.cls && g.cls !== G.cls.id ? CLASSES.find(c => c.id === g.cls) || G.cls : G.cls);
  const y = G && yItemIcon(gc, g.kind, g.tier, g.sp);
  if (y) {
    const k = y.slice('assets/'.length);
    if (!(k in images)) loadImage(k);
    if (images[k] && images[k].complete && images[k].width) return images[k];
  }
  if (g.kind === 'armor' && M.items.armor) return images[`item/${M.items.armor.id}.png`];
  // (the old wardrobe's icon of the piece, where 연 has none: loaded when first dropped)
  const path = hasAvatars() && gearIcon(gc ? gc.id : G.cls.id, g.kind, g.tier);
  return (path && pic(path.slice('assets/'.length))) || images[`item/${M.items.chest.id}.png`];
}

function pickGear(g) {
  if (g.cls && g.cls !== G.cls.id) return companionPick(g);
  if (g.sp && SPECIAL[g.sp] && SPECIAL[g.sp].rarity) {
    // An abyss weapon: one of a kind, in gold, with the 승급 fanfare.
    const sp = SPECIAL[g.sp], name = specialName(sp, G.cls.id), R = RARITY.unique;
    bag(G.cls).push('sp:' + g.sp);
    autoWearDrop(sp.kind, specialBase(sp, G.cls.id), g.sp);
    audio.play('promote');
    (G.gained = G.gained || []).push(`[${R.name}] ${name}`);
    saveJson('bs_progress', progress);
    say(`${R.name} 아이템 ${josa(name, '을', '를')} 얻었습니다! (${sp.opt.text}${sp.gyeok && GYEOK[sp.gyeok] ? ' · ' + GYEOK[sp.gyeok].name : ''})`, 'sys');
    banner(`${R.name} · ${name}`);
    specialMoment(name, R.name);
    return;
  }
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
    autoWearDrop(sp.kind, specialBase(sp, G.cls.id), g.sp);
    (G.gained = G.gained || []).push('★' + name);
    saveJson('bs_progress', progress);
    say(`스페셜 아이템 ${josa(name, '을', '를')} 얻었습니다! (${sp.opt.text})`, 'sys');
    banner(`★ 스페셜: ${name}`);
    specialMoment(name);
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
  autoWearDrop(g.kind, g.tier, null);
  (G.gained = G.gained || []).push(name);
  saveJson('bs_progress', progress);
  say(`${josa(name, '을', '를')} 주웠습니다. (메뉴 → 장비)`, 'sys');
  note(`${name} 획득`);
}

/** A piece for one of the player's own companions: into that class's bag (a second one a copy),
 * and the companion puts on whatever is now its strongest. */
function companionPick(g) {
  const cls = CLASSES.find(c => c.id === g.cls);
  if (!cls) return;
  const b = bag(cls), id = `${g.kind}:${g.tier}`, name = gearName(cls.id, g.kind, g.tier) || '장비';
  audio.play('pickup');
  if (b.includes(id)) {
    addCopy(cls, id);
    saveJson('bs_progress', progress);
    note(`내 ${cls.name} · ${name}: 강화 재료(사본) +1`);
    return;
  }
  b.push(id);
  (G.gained = G.gained || []).push(`${name} (내 ${cls.name})`);
  const put = companionWearBest(cls);
  saveJson('bs_progress', progress);
  if (put.length) {
    say(`내 ${cls.name}: ${josa(name, '을', '를')} 주워 바로 장착했습니다.`, 'party');
    const m = (G.party || []).find(x => x.own && x.cls === cls);
    if (m) m.bubble = { text: '장비 교체!', t: G.t };
  } else say(`내 ${cls.name}: ${josa(name, '을', '를')} 주웠습니다.`, 'party');
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
    applyGear();
  }
}

/** 이동속도 of a class as the equipment window shows it (in a hunt with its 민첩 too), and its 경공. */
function moveInfo(cls, bootId) {
  const g = savedGear(cls), spd = ['weapon', 'armor', 'shield', 'helmet', 'cape'].filter(k => g[k + 'Sp'] && SPECIAL[g[k + 'Sp']] && optIds(SPECIAL[g[k + 'Sp']]).includes('speed')).length;
  const base = (1 + 0.08 * (G && G.cls === cls ? G.passives.speed : 0)) * (1 + 0.1 * spd);
  const st = bootsState(progress), id = bootId === undefined ? st.worn : bootId;
  return moveBonus(base, id ? BOOT[id].pct : 0);
}
function moveText(cls) {
  const m = moveInfo(cls);
  return `이동속도 +${m.pct}%${m.lvl ? ` (${KYEONGGONG[m.lvl - 1].name})` : ''}`;
}

/** The equipment window's 신발 row (boots.js): the pairs found, each with its 이동속도 against the worn. */
function bootsRow(box) {
  const cls = G ? G.cls : chosenClass, st = bootsState(progress), now = moveInfo(cls);
  const h = document.createElement('h4');
  h.textContent = '신발';
  h.title = '이동속도 · 모든 직업 공용';
  box.append(h);
  const row = document.createElement('div');
  row.className = 'equip-row';
  const top = st.have.reduce((a, id) => (!a || BOOT[id].pct > BOOT[a].pct ? id : a), null);
  for (const id of [null, ...BOOTS.map(b => b.id).filter(x => st.have.includes(x))]) {
    const b = id && BOOT[id], btn = document.createElement('button');
    btn.className = 'equip' + (st.worn === id ? ' on' : '');
    const icon = b && picture(b.name);
    btn.innerHTML = (icon ? `<img src="${icon}" alt="">` : '') + `<span>${b ? b.name : '해제'}</span>` + (b ? `<small>이동 +${b.pct}%</small>` : '');
    const d = moveInfo(cls, id).pct - now.pct, em = document.createElement('em');
    em.className = 'cmp ' + (st.worn === id ? 'worn' : d > 0 ? 'up' : d < 0 ? 'down' : 'same');
    em.textContent = st.worn === id ? (b ? '착용 중' : '비어 있음') : d > 0 ? `▲이동 ${d}%` : d < 0 ? `▼이동 ${-d}%` : '같음';
    btn.append(em);
    if (id && id === top && st.worn !== id) btn.classList.add('best');
    btn.onclick = () => (window.__equipInstant ? wearBoots(id) : openBootsPop(id));
    row.append(btn);
  }
  box.append(row);
  const note = document.createElement('div');
  note.className = 'boots-note';
  note.style.cssText = 'grid-column:1 / -1;font:10px G9, monospace;color:#6a3e16;line-height:1.5;margin:0 0 4px';
  note.innerHTML = KYEONGGONG.map((k, i) => `<div style="opacity:${now.lvl > i ? 1 : 0.55}">${now.lvl > i ? '●' : '○'} +${k.at}% ${k.name}: ${k.text}</div>`).join('')
    + `<div style="opacity:0.7">신발은 모든 직업 공용입니다${st.have.length < BOOTS.length ? " · 획득: 사냥터 보스, 대장장이 조합, 레이드 상점" : ""}</div>`;
  box.append(note);
}

/** The equipment window's 보조 기술 row: the four techniques, the chosen one thrown by hand in a hunt. */
function utilRow(box, cls) {
  const h = document.createElement('h4');
  h.textContent = '보조';
  h.title = '보조 기술: 사냥·레이드에서 직접 눌러 쓰는 기술 (Q)';
  box.append(h);
  const row = document.createElement('div');
  row.className = 'equip-row';
  const now = utilOf(cls);
  for (const id of UTIL_ORDER) {
    const U = UTIL[id], btn = document.createElement('button');
    btn.className = 'equip util' + (now === id ? ' on' : '');
    btn.dataset.util = id;
    btn.innerHTML = `<img src="assets/skillicon/${U.icon}.png" alt=""><span>${U.name}</span><small>${U.cd}초</small>`;
    btn.title = U.text;
    btn.onpointerenter = () => showUtilTip(id);
    btn.onclick = () => {
      progress.util = progress.util || {};
      progress.util[cls.id] = id;
      saveJson('bs_progress', progress);
      equipTip = ['util', id];
      buildEquip();
    };
    row.append(btn);
  }
  box.append(row);
}
let equipTip = null; // the piece (or 보조 기술) the window's card shows
function showUtilTip(id) {
  const U = UTIL[id], el = $('#equip-tip');
  el.hidden = false;
  el.innerHTML = `<b>${U.name}</b> <span class="sub">보조 기술 · 직접 눌러 사용 (Q) · 재사용 ${U.cd}초</span><div class="o1">${U.text}</div>`;
}
/** The window's card for a piece: its rank, its option lines, its feature and 격. */
function showPieceTip(cls, kind, t, id) {
  if (kind === 'util') return showUtilTip(t);
  const el = $('#equip-tip'), sp = id && SPECIAL[id];
  if (!sp && (t === undefined || t < 0)) { el.hidden = true; return; }
  const st = starOf(cls, sp ? 'sp:' + id : `${kind}:${t}`), dragon = !sp && kind === 'weapon' && t === dragonTier(cls);
  const one = { [kind]: t, [kind + 'Sp']: sp ? id : null }, rank = pieceRank(cls, one, kind);
  const name = sp ? specialName(sp, cls.id) : pieceName(cls, kind, t);
  // A weapon: the damage it strikes for alone (its rank, its own 공격력 option, its family's edge on
  // every foe), so two weapons read the same way the ▲/▼ do. (The 용무기's step is in its name, not a ★.)
  const hit = kind === 'weapon' ? ` · 공격력 ×${weaponMult(cls, one).toFixed(2)}` : '';
  const lines = [`<b${sp && sp.rarity ? ` style="color:${RARITY.unique.ui}"` : ''}>${name}${st > 1 && !dragon ? ` ★${st}` : ''}</b> <span class="sub">${KIND_NAME[kind]} · ${(Math.round(rank * 10) / 10)}등급${hit}${sp ? sp.craft ? ' · 조합' : sp.rarity ? ' · 고유' : sp.raid ? ' · 레이드 스페셜' : ' · 스페셜' : dragon ? ' · 용무기' : ''}</span>`];
  if (sp) {
    const [o1, ...more] = sp.optLines || [sp.opt.text];
    lines.push(`<div class="o1">옵션: ${o1}</div>`);
    for (const o of more) lines.push(`<div class="o2">보조 옵션: ${o}</div>`);
    if (sp.proc) lines.push(`<div class="pr">특수 · ${PROCS[sp.proc].name}: ${PROCS[sp.proc].text}</div>`);
    if (sp.gyeok && GYEOK[sp.gyeok]) lines.push(`<div class="gy">${gyeokText(sp.gyeok)}</div>`);
    if (sp.ward) lines.push(`<div class="gy">${STATUS[sp.ward].name} 막기: ${STATUS[sp.ward].name}에 걸리지 않는다</div>`);
    if (sp.craft && sp.craft.set && MUSIN_SET[sp.craft.set]) lines.push(`<div class="pr">세트 · ${MUSIN_SET[sp.craft.set].name} (같은 신수의 갑옷 + 기운): ${MUSIN_SET[sp.craft.set].text}</div>`);
  }
  el.hidden = false;
  el.innerHTML = lines.join('');
}

function wearBoots(id) {
  bootsState(progress).worn = id;
  saveJson('bs_progress', progress);
  if (G) applyGear();
  buildEquip();
}

/** The 격 and wards of a set of gear, as lines for the equipment window. */
function wornGyeok(cls, g) {
  const lines = [];
  const fam = weaponFamilyOf(cls, g.weapon, g.weaponSp);
  if (fam) lines.push(`<b>${familyLine(fam)}</b>`, WEAPON_FAMILY[fam].text);
  const aura = auraOf(cls, g);
  if (aura) lines.push(`주작의 기운: 주변 ${JUJAK_AURA.r}칸 안의 아군(동료·공대원·문파원) 공격력 +${Math.round(aura * 100)}%`);
  for (const k of ['weapon', 'armor', 'shield', 'helmet', 'cape']) {
    const sp = g[k + 'Sp'] && SPECIAL[g[k + 'Sp']];
    if (!sp) continue;
    if (sp.gyeok && GYEOK[sp.gyeok]) lines.push(gyeokText(sp.gyeok));
    if (sp.ward) lines.push(`${STATUS[sp.ward].name} 막기: ${STATUS[sp.ward].name}에 걸리지 않는다`);
    if (sp.proc && !lines.some(l => l.startsWith(PROCS[sp.proc].name + ':'))) lines.push(`${PROCS[sp.proc].name}: ${PROCS[sp.proc].text}`);
  }
  const mset = musinSetOf(g);
  if (mset) lines.push(`<b>세트 · ${mset.name}</b>: ${mset.text}`);
  if (!g.weaponSp && g.weapon === dragonTier(cls)) {
    const step = starOf(cls, `weapon:${g.weapon}`), dg = dragonGyeok(cls.id, step);
    lines.push(`${dg.name}: 타격 시 ${Math.round(dg.chance * 100)}% · 고정 피해${dg.st ? ' · 저주' : ''}${dg.cdCut ? ` · 핵심 기술 재사용 -${dg.cdCut * 100}%` : ''}`);
    const ss = (progress.dragonSinsu || {})[cls.id];
    if (ss && SINSU[ss] && step >= 10) lines.push(gyeokText(SINSU[ss].gyeok));
  }
  return { lines };
}

/** A weapon's family (items.js WEAPON_FAMILY) as worn or in the bag: tier, its special's id. */
function weaponFamilyOf(cls, t, spId) {
  const sp = spId && SPECIAL[spId];
  if (t === undefined || t < 0) return null;
  return familyOf(sp, !sp && t === dragonTier(cls), !sp && t > 0 && !!raidOf(cls.id, 'weapon', t));
}
/** 주작의 기운 of a set of gear (0 when none): 주작선장's by its star, the 주작's 용무기 제십's. */
function auraOf(cls, g) {
  if (g.weaponSp === 'cr_sinsu_jujak') return JUJAK_AURA.k + JUJAK_AURA.perStar * (starOf(cls, 'sp:cr_sinsu_jujak') - 1);
  if (!g.weaponSp && g.weapon === dragonTier(cls) && starOf(cls, `weapon:${g.weapon}`) >= 10 && (progress.dragonSinsu || {})[cls.id] === 'jujak') return JUJAK_AURA.dragonK;
  return 0;
}
/** A weapon button's tooltip: its family, its role and trade. */
function familyTitle(fam) {
  return fam ? `${familyLine(fam)}\n${WEAPON_FAMILY[fam].text}` : '';
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
  if (kind === 'shield' && !hasShield(cls.id)) return [];
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

/** 동료 모드: one of the player's own characters puts on the strongest of its own bag (saved to its
 * gear, as 가장 강한 장비로 갈아입기 would), and its figure in the party is dressed again. */
function companionWearBest(cls) {
  const { out } = bestSwaps(cls);
  if (!out.length) return [];
  progress.gear = progress.gear || {};
  const g = savedGear(cls);
  for (const s of out) Object.assign(g, { [s.kind]: s.q[0], [s.kind + 'Sp']: s.q[1] || null });
  progress.gear[cls.id] = g;
  saveJson('bs_progress', progress);
  for (const m of (G && G.party) || []) {
    if (m.cls !== cls || !m.own) continue;
    m.gear = savedGear(cls);
  }
  return out;
}

/** A piece's button gets its 전투력 change against what is worn, and 추천 on the row's best. */
function markCompare(btn, cls, kind, tier, sp, now, top) {
  const d = powerWith(cls, kind, tier, sp) - now;
  btn.dataset.d = d;
  const em = document.createElement('em');
  em.className = 'cmp ' + (btn.classList.contains('on') ? 'worn' : d > 0 ? 'up' : d < 0 ? 'down' : 'same');
  em.textContent = btn.classList.contains('on') ? (tier < 0 && !sp ? '비어 있음' : '착용 중') : d > 0 ? `▲${d.toLocaleString()}` : d < 0 ? `▼${(-d).toLocaleString()}` : '같음';
  btn.append(em);
  if (top && !btn.classList.contains('on')) btn.classList.add('best');
}

function buildEquip() {
  const cls = G ? G.cls : chosenClass, g = savedGear(cls), b = bag(cls);
  const box = $('#equip-rows');
  box.innerHTML = '';
  const now = combatPower(cls);
  box.append(eqBar(cls));
  // One tap to the strongest set, where something stronger lies in the bag.
  const better = ['weapon', 'armor', 'shield', 'helmet', 'cape'].some(k => bagPieces(cls, k).some(q => powerWith(cls, k, q[0], q[1]) > now));
  if (better) {
    const bb = document.createElement('button');
    bb.className = 'btn wear-best';
    bb.textContent = '자동 장착';
    bb.id = 'equip-best';
    bb.onclick = () => (window.__equipInstant ? (wearBest(cls), buildEquip()) : openBestPop());
    box.append(bb);
  }
  // A hero drawn in 연's own figure changes hair and face in the 코디 window (연's own 헤어·얼굴).
  if (M.yhero2 && M.yhero2[cls.id]) {
    const hb = document.createElement('button');
    hb.className = 'btn wear-best'; // a row of its own across the grid
    hb.id = 'equip-hairface';
    hb.textContent = '헤어·얼굴 바꾸기 (코디)';
    hb.onclick = () => openCoordi('hair');
    box.append(hb);
  }
  for (const [kind, label] of [['weapon', '무기'], ['armor', '갑옷'], ['shield', '방패'], ['helmet', '투구'], ['cape', '망토']]) {
    if (kind === 'shield' && !hasShield(cls.id)) continue; // 연's 궁사, 무사 ... carry none
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
      btn.dataset.k = kind; btn.dataset.t = t; btn.dataset.sp = '';
      const icon = pieceIcon(cls, kind, t);
      const star = t < 0 ? 1 : starOf(cls, `${kind}:${t}`), dragon = kind === 'weapon' && t === dragonTier(cls);
      btn.innerHTML = (icon ? `<img src="${icon}" alt="">` : '') + `<span>${t < 0 ? '해제' : pieceName(cls, kind, t)}${star > 1 && !dragon ? ` ★${star}` : ''}</span>`;
      if (dragon) {
        const dg = dragonGyeok(cls.id, starOf(cls, `weapon:${t}`));
        const sm = document.createElement('small');
        sm.textContent = dg.name;
        btn.append(sm);
        const tag = document.createElement('i');
        tag.className = 'fam';
        tag.textContent = WEAPON_FAMILY.dragon.name;
        btn.append(tag);
      }
      if (kind === 'weapon' && t >= 0) btn.title = familyTitle(weaponFamilyOf(cls, t, null));
      markCompare(btn, cls, kind, t, null, now, rowTop[0] === t && rowTop[1] === null);
      btn.onpointerenter = () => showPieceTip(cls, kind, t, null);
      btn.onclick = () => pieceClick(kind, t, null);
      row.append(btn);
    }
    // The specials found of this kind: gold-framed, with their option.
    for (const id of b.filter(x => x.startsWith('sp:')).map(x => x.slice(3))) {
      const sp = SPECIAL[id];
      if (!sp || sp.kind !== kind) continue;
      const t = specialBase(sp, cls.id), btn = document.createElement('button');
      btn.className = 'equip special' + (g[kind + 'Sp'] === id ? ' on' : '');
      btn.dataset.k = kind; btn.dataset.t = t; btn.dataset.sp = id;
      const icon = pieceIcon(cls, kind, t, id), st = starOf(cls, 'sp:' + id);
      btn.innerHTML = (icon ? `<img src="${icon}" alt="">` : '') + `<span${sp.rarity ? ` style="color:${RARITY.unique.ui}"` : ''}>${sp.rarity ? `[${RARITY.unique.name}] ` : sp.craft ? '◆' : '★'}${specialName(sp, cls.id)}${st > 1 ? ` ★${st}` : ''}</span><small>${sp.gyeok && GYEOK[sp.gyeok] ? `${GYEOK[sp.gyeok].name}` : sp.ward ? `${STATUS[sp.ward].name} 막기` : sp.opt.text}</small>`;
      const fam = kind === 'weapon' || sp.craft && sp.craft.sinsu ? familyOf(sp) : null;
      btn.title = [fam ? familyTitle(fam) : '', sp.opt.text, sp.gyeok ? gyeokText(sp.gyeok) : '', sp.ward ? `${STATUS[sp.ward].name}에 걸리지 않는다` : '',
        id === 'cr_sinsu_jujak' ? `주작의 기운: 주변 ${JUJAK_AURA.r}칸 아군 공격력 +${Math.round((JUJAK_AURA.k + JUJAK_AURA.perStar * (st - 1)) * 100)}%` : ''].filter(Boolean).join('\n');
      if (fam && WEAPON_FAMILY[fam]) {
        const tag = document.createElement('i');
        tag.className = 'fam';
        tag.textContent = WEAPON_FAMILY[fam].name;
        btn.append(tag);
      }
      if (sp.proc) btn.title += `\n${PROCS[sp.proc].name}: ${PROCS[sp.proc].text}`;
      markCompare(btn, cls, kind, t, id, now, rowTop[1] === id);
      btn.onpointerenter = () => showPieceTip(cls, kind, t, id);
      btn.onclick = () => pieceClick(kind, t, id);
      row.append(btn);
    }
    arrangeRow(row, cls);
    box.append(row);
  }
  bootsRow(box);
  utilRow(box, cls);
  if (equipTip) showPieceTip(cls, ...equipTip);
  else $('#equip-tip').hidden = true;
  const pw = k => pieceRank(cls, g, k);
  const opts = ['weapon', 'armor', 'shield', 'helmet', 'cape'].map(k => g[k + 'Sp'] && SPECIAL[g[k + 'Sp']]).filter(Boolean).map(sp => sp.opt.text);
  // As applyGear counts them: a plain helmet or cape too (only the specials were shown).
  const ex = k => (g[k] >= 0 || g[k + 'Sp'] ? Math.max(0, pw(k)) : 0);
  $('#equip-stats').textContent = `공격력 +${Math.round((weaponMult(cls, g) - 1) * 100)}% · 체력 +${Math.round(pw('armor') * 20 + ex('helmet') * 12)}`
    + ` · 방어 +${(hasShield(cls.id) ? Math.max(0, pw('shield') + 1) : Math.max(0, Math.floor(pw('armor') / 2) + 1)) + Math.round(ex('cape') / 3)} · 전투력 ${combatPower(cls).toLocaleString()}`
    + (opts.length ? ` · ${opts.join(' · ')}` : '') + ` · ${moveText(cls)}`;
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

// ---------------------------------------------------------------- 장착 팝업 · 장비 편의
//
// A tap on a card in the equipment window opens this popup (not an instant change): the piece
// in full, set against what is worn, with 장착 / 해제 / 취소. 가장 강한 장비 asks the same way.
// Around it: NEW marks, 찜, sorting and filters kept in settings.eq, a toast with 되돌리기,
// 자동 착용 of better drops, and 「바로 착용」 on the results screen.

const EQ_KINDS = ['weapon', 'armor', 'shield', 'helmet', 'cape'];
const EQ_LABEL = { weapon: '무기', armor: '갑옷', shield: '방패', helmet: '투구', cape: '망토' };
/** The window's remembered choices: sort (rank | power), filter (all | up | new | fav), 자동 착용. */
function eqPrefs() {
  if (!settings.eq) settings.eq = { sort: 'rank', filter: 'all', auto: false };
  return settings.eq;
}
function pieceKey(kind, t, sp) { return sp ? 'sp:' + sp : `${kind}:${t}`; }
function pieceListOf(cls, name) {
  progress[name] = progress[name] || {};
  return progress[name][cls.id] = progress[name][cls.id] || [];
}
/** Everything already in a bag when this feature first runs counts as seen: only later finds are NEW. */
function ensureSeen() {
  if (progress.seen) return;
  progress.seen = {};
  for (const [c, b] of Object.entries(progress.inv || {})) progress.seen[c] = b.slice();
  saveJson('bs_progress', progress);
}
function isNewPiece(cls, key) {
  return key !== 'armor:0' && key !== 'weapon:0' && !pieceListOf(cls, 'seen').includes(key);
}
function markSeen(cls, key) {
  const s = pieceListOf(cls, 'seen');
  if (!s.includes(key)) { s.push(key); saveJson('bs_progress', progress); }
}
function isFav(cls, key) { return pieceListOf(cls, 'fav').includes(key); }
function toggleFav(cls, key) {
  const f = pieceListOf(cls, 'fav'), i = f.indexOf(key);
  if (i >= 0) f.splice(i, 1); else f.push(key);
  saveJson('bs_progress', progress);
}
/** The pieces in the bag not yet looked at, as [kind, tier, special id]. */
function newPieces(cls) {
  const out = [];
  for (const kind of EQ_KINDS) for (const [t, id] of bagPieces(cls, kind)) if ((t >= 0 || id) && isNewPiece(cls, pieceKey(kind, t, id))) out.push([kind, t, id]);
  return out;
}

/** What a set of gear amounts to: 전투력, 공격력, 체력, 방어, 이동속도 and its option and 격 lines. */
function gearStats(cls, g) {
  progress.gear = progress.gear || {};
  const keep = progress.gear[cls.id];
  progress.gear[cls.id] = g;
  try {
    const pw = k => pieceRank(cls, g, k), ex = k => (g[k] >= 0 || g[k + 'Sp'] ? Math.max(0, pw(k)) : 0);
    return {
      power: combatPower(cls),
      atk: Math.round((weaponMult(cls, g) - 1) * 100),
      hp: Math.round(pw('armor') * 20 + ex('helmet') * 12),
      def: (hasShield(cls.id) ? Math.max(0, pw('shield') + 1) : Math.max(0, Math.floor(pw('armor') / 2) + 1)) + Math.round(ex('cape') / 3),
      spd: moveInfo(cls).pct,
      lines: wornGyeok(cls, g).lines,
      opts: EQ_KINDS.map(k => g[k + 'Sp'] && SPECIAL[g[k + 'Sp']]).filter(Boolean).flatMap(sp => sp.optLines || [sp.opt.text]),
    };
  } finally { progress.gear[cls.id] = keep; }
}
const withPiece = (cls, kind, t, sp) => Object.assign({}, savedGear(cls), { [kind]: t, [kind + 'Sp']: sp || null });

function pieceLabel(cls, kind, t, spId) {
  const sp = spId && SPECIAL[spId];
  if (sp) return specialName(sp, cls.id);
  return t < 0 || t === undefined ? `${EQ_LABEL[kind]} 없음` : pieceName(cls, kind, t);
}
function epDelta(a, b, unit = '') {
  const d = b - a;
  return `${a.toLocaleString()}${unit} → <b>${b.toLocaleString()}${unit}</b> <em class="${d > 0 ? 'up' : d < 0 ? 'down' : 'same'}">${d > 0 ? '▲' + d.toLocaleString() : d < 0 ? '▼' + (-d).toLocaleString() : '같음'}${d ? unit : ''}</em>`;
}
/** Where a piece comes from, as the 도감 words it. */
function pieceFrom(cls, kind, t, spId) {
  const name = pieceLabel(cls, kind, t, spId);
  const it = codexItems(cls).find(x => x.kind === kind && (x.name === name || (x.name.includes(' ~ ') && !spId && t === dragonTier(cls))));
  if (!it) return '';
  return Array.isArray(it.from) ? (it.from.length ? (it.from.length > 2 ? `${it.from[0]} ~ ${it.from[it.from.length - 1]}` : it.from.join(', ')) : '드롭 없음') : it.from;
}
/** Which classes can wear it. */
function pieceClasses(cls, kind, spId) {
  const sp = spId && SPECIAL[spId];
  if (sp && sp.craft && sp.craft.only) return `${sp.craft.only.map(c => (CLASSES.find(x => x.id === c) || { name: c }).name).join('·')} 전용`;
  if (sp && sp.cls) return `${(CLASSES.find(x => x.id === sp.cls) || { name: sp.cls }).name} 전용`;
  return `${cls.name} 장비${kind === 'shield' ? ' (방패를 드는 직업)' : ''} · 직업별로 따로 획득`;
}

let epState = null; // what the popup shows, for tests: {type, kind, t, sp}
function epopShow(cap, html, buttons, state) {
  epState = state;
  $('#epop-cap').textContent = cap;
  $('#epop-body').innerHTML = html;
  const row = $('#epop-btns');
  row.innerHTML = '';
  for (const [label, cls, fn, id] of buttons) {
    const b = document.createElement('button');
    b.className = 'btn ' + (cls || '');
    if (id) b.id = id;
    b.textContent = label;
    b.onclick = fn;
    row.append(b);
  }
  $('#epop').hidden = false;
  $('#epop-body').scrollTop = 0;
}
function closePiecePop() { $('#epop').hidden = true; epState = null; }

/** The popup for a piece of the bag (tier -1: taking the slot's piece off). */
function openPiecePop(kind, t, spId = null) {
  const cls = G ? G.cls : chosenClass, g0 = savedGear(cls), sp = spId && SPECIAL[spId];
  const key = pieceKey(kind, t, spId), none = t < 0 && !sp;
  const worn = sp ? g0[kind + 'Sp'] === spId : g0[kind] === t && !g0[kind + 'Sp'];
  const one = { [kind]: t, [kind + 'Sp']: sp ? spId : null }, rank = pieceRank(cls, one, kind);
  const st = none ? 1 : starOf(cls, sp ? 'sp:' + spId : key), stMax = none ? 1 : starMaxOf(cls, sp ? 'sp:' + spId : key);
  const dragon = !sp && kind === 'weapon' && t === dragonTier(cls);
  const name = pieceLabel(cls, kind, t, spId), icon = none ? null : pieceIcon(cls, kind, t, spId);
  const tag = sp ? (sp.craft ? '조합' : sp.rarity ? '고유' : sp.raid ? '레이드 스페셜' : '스페셜') : dragon ? '용무기' : (!none && t > 0 && raidOf(cls.id, kind, t) ? '레이드' : '일반');
  const after = withPiece(cls, kind, t, spId);
  const A = gearStats(cls, g0), B = gearStats(cls, after);
  // -- the piece
  const L = [];
  if (!none) {
    L.push(`<div class="ep-tier"><b>${Math.round(rank * 10) / 10}등급</b> · ${EQ_LABEL[kind]} · ${tag}`
      + `${kind === 'weapon' ? ` · 공격력 ×${weaponMult(cls, one).toFixed(2)}` : ''}</div>`);
    L.push(`<div class="ep-star">${dragon ? `${dragonName(cls.id, st)} (제${st}/${stMax}단)` : '★'.repeat(st) + '<i>' + '★'.repeat(Math.max(0, stMax - st)) + '</i>'} <small>강화는 대장장이에서</small></div>`);
    if (sp) {
      const [o1, ...more] = sp.optLines || [sp.opt.text];
      L.push(`<div class="o1">옵션: ${o1}</div>`);
      for (const o of more) L.push(`<div class="o2">보조 옵션: ${o}</div>`);
      if (sp.proc) L.push(`<div class="pr">특수 · ${PROCS[sp.proc].name}: ${PROCS[sp.proc].text}</div>`);
      if (sp.ward) L.push(`<div class="gy">방어 · ${STATUS[sp.ward].name} 막기: ${STATUS[sp.ward].name}에 걸리지 않는다</div>`);
    } else L.push('<div class="none">옵션 없음 (일반 장비는 등급과 ★로 강해집니다)</div>');
    const fam = kind === 'weapon' ? weaponFamilyOf(cls, t, spId) : sp && sp.craft && sp.craft.sinsu ? familyOf(sp) : null;
    if (fam && WEAPON_FAMILY[fam]) L.push(`<div class="fam">${familyLine(fam)}<br>${WEAPON_FAMILY[fam].text}</div>`);
    // 격: the rule and what it does
    const gys = [];
    if (sp && sp.gyeok && GYEOK[sp.gyeok]) gys.push(gyeokText(sp.gyeok));
    if (dragon) { const dg = dragonGyeok(cls.id, st); gys.push(`${dg.name}: 타격 시 ${Math.round(dg.chance * 100)}% · 고정 피해${dg.st ? ' · 저주' : ''}${dg.cdCut ? ` · 핵심 기술 재사용 -${dg.cdCut * 100}%` : ''}`); }
    if (gys.length) L.push(`<div class="gy"><b>격</b> · ${gys.join('<br>')}</div>`);
    else L.push('<div class="none">격 없음</div>');
    const ms = sp && sp.craft && sp.craft.set && MUSIN_SET[sp.craft.set];
    if (ms) {
      const on = !!musinSetOf(after);
      L.push(`<div class="pr"><b>세트 · ${ms.name}</b> ${on ? '(이 장비로 완성)' : '(같은 신수의 갑옷 + 기운 착용 시)'}: ${ms.text}</div>`);
    }
    const from = pieceFrom(cls, kind, t, spId);
    if (from) L.push(`<div class="from">획득처: ${from}</div>`);
  } else L.push(`<div class="none">${EQ_LABEL[kind]}을(를) 해제합니다.</div>`);
  L.push(`<div class="from">착용 직업: ${pieceClasses(cls, kind, spId)}</div>`);
  // -- the comparison with what is worn now
  const curSp = g0[kind + 'Sp'] && SPECIAL[g0[kind + 'Sp']], curT = g0[kind];
  const cur = pieceLabel(cls, kind, curT, curSp ? curSp.id : null), curRank = pieceRank(cls, g0, kind);
  const R = [];
  if (worn) R.push('<div class="ep-now">현재 착용 중인 장비입니다.</div>');
  else {
    R.push(`<div class="ep-cur">현재 ${EQ_LABEL[kind]}: <b>${cur}</b>${curRank >= 0 ? ` (${Math.round(curRank * 10) / 10}등급)` : ''}</div>`);
    R.push('<table class="ep-cmp">'
      + `<tr><th>전투력</th><td>${epDelta(A.power, B.power)}</td></tr>`
      + `<tr><th>공격력</th><td>${epDelta(A.atk, B.atk, '%')}</td></tr>`
      + `<tr><th>체력</th><td>${epDelta(A.hp, B.hp)}</td></tr>`
      + `<tr><th>방어</th><td>${epDelta(A.def, B.def)}</td></tr>`
      + `<tr><th>이동속도</th><td>${epDelta(A.spd, B.spd, '%')}</td></tr></table>`);
    const famSet = new Set(Object.keys(WEAPON_FAMILY).flatMap(f => [`<b>${familyLine(f)}</b>`, WEAPON_FAMILY[f].text]));
    const diff = (a, b) => b.filter(x => !a.includes(x) && !famSet.has(x));
    const fa = weaponFamilyOf(cls, g0.weapon, g0.weaponSp), fb = weaponFamilyOf(cls, after.weapon, after.weaponSp);
    const dl = [...(fa !== fb ? [`<div class="${fb && WEAPON_FAMILY[fb] ? 'up' : 'down'}">계열: ${fa && WEAPON_FAMILY[fa] ? WEAPON_FAMILY[fa].name : '없음'} → ${fb && WEAPON_FAMILY[fb] ? WEAPON_FAMILY[fb].name : '없음'}</div>`] : []), ...diff(A.opts, B.opts).map(x => `<div class="up">+ 옵션 ${x}</div>`), ...diff(B.opts, A.opts).map(x => `<div class="down">− 옵션 ${x}</div>`),
      ...diff(A.lines, B.lines).map(x => `<div class="up">+ ${x}</div>`), ...diff(B.lines, A.lines).map(x => `<div class="down">− ${x}</div>`)];
    R.push(dl.length ? `<div class="ep-diff">${dl.join('')}</div>` : '<div class="none">옵션·격은 그대로입니다.</div>');
  }
  const head = `<div class="ep-head">${icon ? `<img src="${icon}" alt="">` : '<span class="ep-noimg"></span>'}<div><b class="ep-name${sp && sp.rarity ? ' uniq' : ''}">${name}</b>`
    + `${isNewPiece(cls, key) && !none ? ' <i class="newtag">NEW</i>' : ''}${worn ? ' <i class="wornflag">착용 중</i>' : ''}</div></div>`;
  const btns = [];
  const canOff = none || (worn && ['shield', 'helmet', 'cape'].includes(kind));
  if (!worn) btns.push([none ? '해제' : '장착', 'primary', () => equipFromPop(kind, t, spId), 'ep-wear']);
  else if (canOff && !none) btns.push(['해제', 'primary', () => equipFromPop(kind, -1, null), 'ep-wear']);
  else btns.push(['착용 중', 'primary', null, 'ep-wear']);
  if (!none) btns.push([isFav(cls, key) ? '찜 해제' : '찜', '', () => { toggleFav(cls, key); openPiecePop(kind, t, spId); buildEquip(); }, 'ep-fav']);
  // where to get / make it
  if (!none && !G) {
    if (sp && sp.craft) btns.push(['조합하러', '', () => { closePiecePop(); openForge(); }, 'ep-go']);
    else if (sp && !sp.rarity) {
      const stg = STAGES.find(s => s.id === sp.src) || RAIDS.find(r => r.id === sp.src);
      if (stg) btns.push(['사냥터 보기', '', () => { closePiecePop(); $('#equip').hidden = true; pickedStage = stg; mapTab = stg.raid ? 'raid' : 'list'; showScreen('stages'); }, 'ep-go']);
    }
  }
  btns.push(['취소', '', closePiecePop, 'ep-cancel']);
  if (btns[0][2] === null) btns[0][2] = closePiecePop;
  if (!none) markSeen(cls, key);
  epopShow(none ? `${EQ_LABEL[kind]} 해제` : '장착 확인', `${head}<div class="ep-cols"><div class="ep-l">${L.join('')}</div><div class="ep-r">${R.join('')}</div></div>`, btns, { type: 'piece', kind, t, sp: spId });
  buildEquip();
}
function equipFromPop(kind, t, spId) {
  const cls = G ? G.cls : chosenClass, g0 = savedGear(cls), prev = [kind, g0[kind], g0[kind + 'Sp'] || null];
  const name = pieceLabel(cls, kind, t, spId);
  wear(kind, t, spId);
  if (t >= 0 || spId) markSeen(cls, pieceKey(kind, t, spId));
  closePiecePop();
  equipTip = [kind, t, spId];
  buildEquip();
  eqToast(t < 0 && !spId ? `${EQ_LABEL[kind]}을(를) 해제했습니다` : `${name} 착용`, () => { wear(...prev); buildEquip(); });
}
/** A line under the window's rows, with 되돌리기 where there is something to undo. */
let eqToastTimer = 0;
function eqToast(text, undo) {
  const el = $('#equip-toast');
  if (!el) return;
  el.innerHTML = '';
  const s = document.createElement('span');
  s.textContent = text;
  el.append(s);
  if (undo) {
    const b = document.createElement('button');
    b.className = 'btn';
    b.id = 'eq-undo';
    b.textContent = '되돌리기';
    b.onclick = () => { undo(); el.hidden = true; };
    el.append(b);
  }
  el.hidden = false;
  clearTimeout(eqToastTimer);
  eqToastTimer = setTimeout(() => { el.hidden = true; }, 7000);
}

/** 가장 강한 장비로 갈아입기: what would change, and 적용 / 취소. */
function bestSwaps(cls) {
  const g = savedGear(cls), out = [];
  const after = Object.assign({}, g);
  for (const kind of EQ_KINDS) {
    const ps = bagPieces(cls, kind);
    if (!ps.length) continue;
    const top = ps.reduce((a, q) => (powerWith(cls, kind, q[0], q[1]) > powerWith(cls, kind, a[0], a[1]) ? q : a), ps[0]);
    if (top[0] === g[kind] && (top[1] || null) === (g[kind + 'Sp'] || null)) continue;
    out.push({ kind, from: pieceLabel(cls, kind, g[kind], g[kind + 'Sp']), to: pieceLabel(cls, kind, top[0], top[1]), q: top });
    Object.assign(after, { [kind]: top[0], [kind + 'Sp']: top[1] || null });
  }
  return { out, after };
}
function openBestPop() {
  const cls = G ? G.cls : chosenClass, { out, after } = bestSwaps(cls);
  if (!out.length) { eqToast('이미 가장 강한 장비입니다'); return; }
  const A = gearStats(cls, savedGear(cls)), B = gearStats(cls, after);
  const rows = out.map(s => `<tr><th>${EQ_LABEL[s.kind]}</th><td>${s.from} <span class="arrow">→</span> <b>${s.to}</b></td></tr>`).join('');
  epopShow('자동 장착', `<div class="ep-cur">다음과 같이 바뀝니다.</div><table class="ep-cmp ep-swaps">${rows}</table>`
    + `<table class="ep-cmp"><tr><th>전투력</th><td>${epDelta(A.power, B.power)}</td></tr><tr><th>공격력</th><td>${epDelta(A.atk, B.atk, '%')}</td></tr>`
    + `<tr><th>체력</th><td>${epDelta(A.hp, B.hp)}</td></tr><tr><th>방어</th><td>${epDelta(A.def, B.def)}</td></tr></table>`,
  [['적용', 'primary', () => {
    const snap = savedGear(cls), prev = out.map(s => [s.kind, snap[s.kind], snap[s.kind + 'Sp'] || null]);
    for (const s of out) { wear(s.kind, s.q[0], s.q[1]); if (s.q[0] >= 0 || s.q[1]) markSeen(cls, pieceKey(s.kind, s.q[0], s.q[1])); }
    closePiecePop();
    buildEquip();
    eqToast(`${out.length}부위를 교체했습니다`, () => { for (const p of prev) wear(...p); buildEquip(); });
  }, 'ep-apply'], ['취소', '', closePiecePop, 'ep-cancel']], { type: 'best' });
}

/** The popup for a pair of boots (shared by every class). */
function openBootsPop(id) {
  const cls = G ? G.cls : chosenClass, st = bootsState(progress), b = id && BOOT[id], cur = st.worn && BOOT[st.worn];
  const now = moveInfo(cls), nxt = moveInfo(cls, id), worn = st.worn === id, icon = b && picture(b.name);
  const lv = nxt.lvl ? KYEONGGONG[nxt.lvl - 1] : null;
  const L = [`<div class="ep-tier"><b>신발</b> · 이동속도 ${b ? `+${b.pct}%` : '기본'}</div>`,
    lv ? `<div class="gy"><b>경공</b> · ${lv.name}: ${lv.text}</div>` : '<div class="none">경공 없음</div>',
    `<div class="from">모든 직업 공용 · 획득: 사냥터 보스, 대장장이 조합, 레이드 상점</div>`];
  const R = worn ? ['<div class="ep-now">현재 착용 중인 신발입니다.</div>']
    : [`<div class="ep-cur">현재 신발: <b>${cur ? cur.name : '없음'}</b></div>`, `<table class="ep-cmp"><tr><th>이동속도</th><td>${epDelta(now.pct, nxt.pct, '%')}</td></tr></table>`,
      `<div class="${nxt.lvl > now.lvl ? 'up' : nxt.lvl < now.lvl ? 'down' : 'none'}">${nxt.lvl !== now.lvl ? `경공: ${now.lvl ? KYEONGGONG[now.lvl - 1].name : '없음'} → ${nxt.lvl ? KYEONGGONG[nxt.lvl - 1].name : '없음'}` : '경공은 그대로입니다.'}</div>`];
  const head = `<div class="ep-head">${icon ? `<img src="${icon}" alt="">` : '<span class="ep-noimg"></span>'}<div><b class="ep-name">${b ? b.name : '신발 벗기'}</b>${worn ? ' <i class="wornflag">착용 중</i>' : ''}</div></div>`;
  const go = () => { const prev = st.worn; wearBoots(id); closePiecePop(); buildEquip(); eqToast(b ? `${b.name} 착용` : '신발을 해제했습니다', () => { wearBoots(prev); }); };
  epopShow(b ? '신발 장착 확인' : '신발 해제', `${head}<div class="ep-cols"><div class="ep-l">${L.join('')}</div><div class="ep-r">${R.join('')}</div></div>`,
    [[worn ? '착용 중' : b ? '장착' : '해제', 'primary', worn ? closePiecePop : go, 'ep-wear'], ['취소', '', closePiecePop, 'ep-cancel']], { type: 'boots', id });
}

/** A card was tapped: the popup (or, for tests with window.__equipInstant, the old instant change). */
function pieceClick(kind, t, spId) {
  equipTip = [kind, t, spId];
  if (window.__equipInstant) { wear(kind, t, spId); buildEquip(); return; }
  openPiecePop(kind, t, spId);
}

/** Sort and filter a row's cards by the remembered choices, favourites first; also each card's attributes. */
function arrangeRow(row, cls) {
  const P = eqPrefs(), cards = [...row.children];
  for (const c of cards) {
    const key = pieceKey(c.dataset.k, +c.dataset.t, c.dataset.sp || null), none = +c.dataset.t < 0 && !c.dataset.sp;
    c.dataset.fav = !none && isFav(cls, key) ? '1' : '';
    const nw = !none && isNewPiece(cls, key);
    if (nw) {
      c.classList.add('isnew');
      const n = document.createElement('i');
      n.className = 'newtag';
      n.textContent = 'NEW';
      c.append(n);
    }
    if (c.dataset.fav) {
      const f = document.createElement('u');
      f.className = 'favmark';
      f.textContent = '♥';
      c.append(f);
    }
    const on = c.classList.contains('on'), d = +c.dataset.d || 0;
    c.hidden = !on && !none && ((P.filter === 'up' && d <= 0) || (P.filter === 'new' && !nw) || (P.filter === 'fav' && !c.dataset.fav));
    if (none && P.filter !== 'all') c.hidden = false;
  }
  const rankOf = c => (+c.dataset.t < 0 && !c.dataset.sp ? -1e9 : 0);
  const order = cards.map((c, i) => [c, i]).sort((a, b) => (b[0].dataset.fav ? 1 : 0) - (a[0].dataset.fav ? 1 : 0)
    || (P.sort === 'power' ? (rankOf(a[0]) - rankOf(b[0])) || ((+b[0].dataset.d || 0) - (+a[0].dataset.d || 0)) : 0) || a[1] - b[1]);
  for (const [c] of order) row.append(c);
}

/** The bar at the top of the equipment window: 신규 확인, sort, filter, 자동 착용. */
function eqBar(cls) {
  const P = eqPrefs(), bar = document.createElement('div');
  bar.className = 'eq-bar';
  const add = (label, on, fn, id, title) => {
    const b = document.createElement('button');
    b.className = 'eqb' + (on ? ' on' : '');
    if (id) b.id = id;
    if (title) b.title = title;
    b.textContent = label;
    b.onclick = fn;
    bar.append(b);
  };
  const news = newPieces(cls);
  if (news.length) add(`신규 장비 확인 (${news.length})`, true, () => openPiecePop(...news[0]), 'eq-new', '새로 얻은 장비를 차례로 봅니다');
  add(P.sort === 'power' ? '정렬: 전투력순' : '정렬: 기본', false, () => { P.sort = P.sort === 'power' ? 'rank' : 'power'; saveJson('bs_settings', settings); buildEquip(); }, 'eq-sort');
  for (const [f, label] of [['all', '전체'], ['up', '▲ 상위 장비'], ['new', 'NEW'], ['fav', '♥ 찜']]) {
    add(label, P.filter === f, () => { P.filter = f; saveJson('bs_settings', settings); buildEquip(); }, 'eq-f-' + f);
  }
  add(`자동 착용 ${P.auto ? '켬' : '끔'}`, P.auto, () => { P.auto = !P.auto; saveJson('bs_settings', settings); buildEquip(); eqToast(P.auto ? '사냥 중 더 강한 장비를 얻으면 바로 장착합니다' : '자동 착용을 껐습니다'); }, 'eq-auto', '사냥 중 전투력이 오르는 장비를 얻으면 바로 장착합니다');
  return bar;
}

/** Wearing a drop at once when it is stronger (자동 착용), from pickGear. */
function autoWearDrop(kind, tier, spId) {
  if (!G || !eqPrefs().auto || G.training) return;
  const cls = G.cls;
  if (powerWith(cls, kind, tier, spId) > combatPower(cls)) {
    const name = pieceLabel(cls, kind, tier, spId);
    wear(kind, tier, spId);
    markSeen(cls, pieceKey(kind, tier, spId));
    say(`자동 착용: ${name}`, 'sys');
  }
}

/** The results screen: new pieces that would raise 전투력, each with 바로 착용. */
function overWearUI() {
  let box = $('#over-wear');
  if (!box) return;
  box.innerHTML = '';
  if (!G) return;
  const cls = G.cls, now = combatPower(cls), ups = [];
  for (const [kind, t, id] of newPieces(cls)) {
    const d = powerWith(cls, kind, t, id) - now;
    if (d > 0) ups.push([kind, t, id, d]);
  }
  ups.sort((a, b) => b[3] - a[3]);
  for (const [kind, t, id, d] of ups.slice(0, 4)) {
    const b = document.createElement('button');
    b.className = 'btn ow';
    b.dataset.k = kind;
    b.innerHTML = `바로 착용 · ${pieceLabel(cls, kind, t, id)} <em>▲${d.toLocaleString()}</em>`;
    b.onclick = () => { wear(kind, t, id); markSeen(cls, pieceKey(kind, t, id)); b.disabled = true; b.textContent = `${pieceLabel(cls, kind, t, id)} 착용 완료`; };
    box.append(b);
  }
}

/** The window opened: where it was, or on the first NEW piece. */
let eqScroll = 0;
function openEquipWindow() {
  equipTip = null;
  buildEquip();
  $('#equip').hidden = false;
  const box = $('#equip-rows'), nw = box.querySelector('.equip.isnew:not([hidden])');
  if (nw) nw.scrollIntoView({ block: 'center', inline: 'nearest' });
  else box.scrollTop = eqScroll;
}
function closeEquipWindow() {
  eqScroll = $('#equip-rows').scrollTop;
  $('#equip').hidden = true;
}

/** Android back / Esc: the top-most layer closes first. true when one did. */
const BACK_LAYERS = [['#epop', closePiecePop], ['#coordi', () => $('#coordi-close').click()], ['#party-pick', () => $('#pp-close').click()],
  ['#forge', () => $('#forge-close').click()], ['#trade', () => $('#close-trade').click()], ['#codex', () => $('#close-codex').click()],
  ['#backup', () => $('#backup-close').click()], ['#tree', () => $('#close-tree').click()], ['#equip', closeEquipWindow], ['#sounds', () => $('#close-sounds').click()]];
function closeTopLayer() {
  for (const [sel, close] of BACK_LAYERS) {
    const el = $(sel);
    if (el && !el.hidden) { close(); return true; }
  }
  return false;
}
window.__closeTopLayer = closeTopLayer;
window.__equipPop = (kind, t, sp) => (kind === 'best' ? openBestPop() : openPiecePop(kind, t, sp || null));
window.__epopState = () => epState;

// ---------------------------------------------------------------- 도감
//
// Every piece a class can have: the hunting grounds' line, the raids' sets and the specials,
// with where each drops and whether it is found. Searchable, filtered by grade.

import { ABYSS_UNIQUES, abyssPreview, HIDDEN_HINTS } from './items.js';
let codexCls = null, codexGrade = 'all', codexOwned = false;

function codexItems(cls) {
  const b = bag(cls), out = [];
  for (const kind of ['weapon', 'armor', 'shield', 'helmet', 'cape']) {
    if (kind === 'shield' && !hasShield(cls.id)) continue;
    const plain = new Set(plainList(cls.id, kind));
    GEAR[cls.id][kind].forEach((name, t) => {
      const raid = raidOf(cls.id, kind, t), craft = kind === 'weapon' && name === CRAFT_GEAR[cls.id];
      // A look only a crafted piece wears (해골갑옷 on the 전사's line ...) is no piece of its own: it
      // was listed as a plain piece "나오지 않음" at its raw place for a rank (남자기모노 15등급).
      if (!craft && !raid && !plain.has(t)) return;
      const rc = craft && craftRecipe(cls.id), step = craft && b.includes(`${kind}:${t}`) ? starOf(cls, `${kind}:${t}`) : 0;
      // The 용무기: its rank at the step owned, and the whole climb (it read a flat 10등급, under
      // pieces it outranks from 제사 on).
      const dpow = r => Math.round(r * 10) / 10;
      out.push({ grade: craft ? 'craft' : raid ? 'raid' : 'plain', kind, name: craft ? `${dragonName(cls.id, 1)} ~ ${dragonName(cls.id, DRAGON_MAX)}` : name,
        icon: (craft && (dragonIcon(cls, step || 1) || picture(dragonName(cls.id, step || 1)))) || pieceIcon(cls, kind, t),
        pow: craft ? `${step ? `${dragonName(cls.id, step)} ${dpow(CRAFT_POWER + (step - 1) * DRAGON_STEP)} · ` : ''}${CRAFT_POWER}~${dpow(CRAFT_POWER + (DRAGON_MAX - 1) * DRAGON_STEP)}` : gearPower(cls.id, kind, t),
        owned: b.includes(`${kind}:${t}`),
        from: craft ? `대장장이 조합: ${GEAR[cls.id].weapon[rc.base]} ★${rc.star} + 용의 비늘 ${rc.mats.scale} + 여의주 ${rc.mats.pearl}`
          : raid ? raid.name : tierSources(cls.id, kind, t) });
    });
  }
  for (const sp of SPECIALS) {
    if (sp.craft && sp.craft.only && !sp.craft.only.includes(cls.id)) continue;
    if (sp.kind === 'shield' && !hasShield(cls.id)) continue;
    const t = specialBase(sp, cls.id);
    const from = sp.craft ? `대장장이 조합: ${sp.craft.from ? specialName(SPECIAL[sp.craft.from], cls.id) + ' ★5 + ' : ''}${Object.entries(sp.craft.mats).map(([id, n]) => `${MATS[id].name} ${n}`).join(' + ')} + ${won(sp.craft.gold)}`
      : sp.srcName;
    out.push({ grade: sp.craft ? 'craft' : 'special', kind: sp.kind, name: specialName(sp, cls.id),
      icon: pieceIcon(cls, sp.kind, t, sp.id) || picture(craftPicture(sp, cls.id, b.includes('sp:' + sp.id) ? starOf(cls, 'sp:' + sp.id) : 1)),
      pow: specialPower(sp, cls.id), owned: b.includes('sp:' + sp.id), from,
      opt: [sp.opt.text, sp.gyeok && GYEOK[sp.gyeok] ? GYEOK[sp.gyeok].name : '', sp.ward ? `${STATUS[sp.ward].name} 막기` : ''].filter(Boolean).join(' · '),
      // 악마 심판의낫 not yet had: the 지하국대적's own drop, as a hint (items.js HIDDEN_HINTS)
      hint: !b.includes('sp:' + sp.id) && HIDDEN_HINTS[sp.id] || null });
  }
  return out.concat(codexHidden(cls, b));
}

/**
 * The 끝없는 지옥's uniques and the 태초의 무기, kept as found (progress.abyssLoot), one row each:
 * found (in this class's bag), the best one's own row; not yet, its shadow and a hint in an old
 * NPC's words (items.js HIDDEN_HINTS) for where it falls.
 */
function codexHidden(cls, b) {
  const loot = progress.abyssLoot || {}, out = [];
  for (const un of ABYSS_UNIQUES) {
    const have = b.filter(k => k.startsWith('sp:') && loot[k.slice(3)] && loot[k.slice(3)].u === un.u && SPECIAL[k.slice(3)])
      .map(k => SPECIAL[k.slice(3)]).sort((x, y) => specialPower(y, cls.id) - specialPower(x, cls.id));
    const sp = have[0] || abyssPreview(un.u), t = specialBase(sp, cls.id);
    const opt = [sp.opt.text, sp.gyeok && GYEOK[sp.gyeok] ? GYEOK[sp.gyeok].name : ''].filter(Boolean).join(' · ');
    if (have.length) {
      out.push({ grade: 'special', kind: 'weapon', name: specialName(sp, cls.id), icon: pieceIcon(cls, 'weapon', t, sp.id), pow: specialPower(sp, cls.id),
        owned: true, tag: un.taecho ? '태초' : '고유', from: un.u === 'cow' ? '끝없는 지옥 · 비밀의 소 레벨의 소 왕' : un.taecho ? '끝없는 지옥 · 세계석 요새의 군주, 소 왕' : '끝없는 지옥', opt });
      continue;
    }
    // The shadow: the look it would have (the same for every unique of a class; 태초 its own).
    const ab = sp.base && sp.base[cls.id], abIt = ab && costumeItems()[ab[0]];
    const icon = taechoIcon(cls, sp) || (abIt && abIt.icon ? 'assets/' + abIt.icon : null);
    out.push({ grade: 'special', kind: 'weapon', name: un.taecho ? '태초의 ???' : un.name, icon, pow: '??', owned: false, tag: '숨은 무기', shadow: true,
      from: un.u === 'cow' || un.taecho ? '???' : '끝없는 지옥', hint: HIDDEN_HINTS[un.u] + (abyssFound() ? '' : ' ' + HIDDEN_HINTS.gate) });
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
  own.textContent = '보유 장비만';
  own.className = codexOwned ? 'on' : '';
  own.onclick = () => { codexOwned = !codexOwned; buildCodex(); };
  grades.append(own);
  const q = $('#codex-search').value.trim();
  const all = codexItems(cls);
  const list = all.filter(it => (codexGrade === 'all' || it.grade === codexGrade) && (!codexOwned || it.owned)
    && (!q || [it.name, KIND_NAME[it.kind], it.opt || '', ...[].concat(it.from)].some(x => x.includes(q))));
  $('#codex-count').textContent = `${cls.name} · 수집 ${all.filter(x => x.owned).length}/${all.length}`;
  const box = $('#codex-rows');
  box.innerHTML = '';
  for (const it of list) {
    const row = document.createElement('div');
    row.className = 'codex-item ' + it.grade + (it.owned ? '' : ' missing');
    const from = Array.isArray(it.from) ? (it.from.length ? (it.from.length > 2 ? `${it.from[0]} ~ ${it.from[it.from.length - 1]}` : it.from.join(', ')) : '드롭 없음') : it.from;
    const grade = it.tag || { plain: '일반', raid: '레이드', craft: '조합', special: '스페셜' }[it.grade];
    // A hidden piece not yet found: its shadow, and the old words of where it falls.
    row.innerHTML = (it.icon ? `<img src="${it.icon}" alt=""${it.shadow ? ' style="filter:brightness(0);opacity:.45"' : ''}>` : '<span></span>')
      + `<div><b>${it.grade === 'special' ? '★' : it.grade === 'craft' ? '◆' : ''}${it.name}</b><i>${grade}</i><i>${KIND_NAME[it.kind]} ${it.pow}등급</i>`
      + (it.shadow ? `<span>${from}</span>` : `<span>${it.owned ? '✓ 보유 · ' : ''}${it.grade === 'special' ? '매우 희귀 · ' : ''}${from}${it.opt ? ` · ${it.opt}` : ''}</span>`)
      + (it.hint ? `<span class="codex-hint" style="color:#6a2a08;font-style:italic">${it.hint}</span>` : '') + '</div>';
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

/**
 * The smith's 강화·조합. With a sink (the 조합 window, openForge) the recipes are gathered as
 * entries — section, name, text, button, and the materials they ask — instead of laid out as
 * rows of the trade window.
 */
function openCraft(sink = null) {
  const cls = G ? G.cls : chosenClass, b = bag(cls), box = $('#trade-rows');
  let sec = '', meta = null;
  if (!sink) box.innerHTML = '';
  $('#trade-title').textContent = '대장장이 · 강화·조합';
  const mats = progress.mats || {};
  $('#trade-gold').textContent = `소지금 ${won(progress.gold || 0)} · `
    + Object.entries(MATS).map(([id, m]) => `${m.name} ${mats[id] || 0}`).join(' · ');
  let icon = null, fxs = null;
  const row = (name, desc, label, can, act) => {
    if (sink) {
      const ent = { sec, name, desc, label, can, icon, meta, star: fxs, act: null };
      // The making plays out in the window (forgeRun): suspense, then the result.
      ent.act = () => forgeRun(ent, () => {
        act();
        saveJson('bs_progress', progress);
        if ($('#town-gold')) $('#town-gold').innerHTML = walletHTML(progress.gold, progress.coins);
        if (G) applyGear();
        if (!$('#equip').hidden) buildEquip();
      });
      sink.push(ent);
      icon = null;
      meta = null;
      fxs = null;
      return;
    }
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
      if ($('#town-gold')) $('#town-gold').innerHTML = walletHTML(progress.gold, progress.coins);
      if (G) applyGear();
      if (!$('#equip').hidden) buildEquip();
      openCraft();
    };
    r.append(btn);
    box.append(r);
  };
  const head = text => {
    sec = text;
    if (sink) return;
    const h = document.createElement('h4');
    h.textContent = text;
    h.style.margin = '6px 0 2px';
    box.append(h);
  };
  head(`조합 · ${cls.name}의 용무기`);
  const rc = craftRecipe(cls.id), dragon = CRAFT_GEAR[cls.id], dt = GEAR[cls.id].weapon.indexOf(dragon);
  const baseKey = `weapon:${rc.base}`, baseName = GEAR[cls.id].weapon[rc.base];
  const has = b.includes(`weapon:${dt}`);
  const ok = !has && b.includes(baseKey) && starOf(cls, baseKey) >= rc.star && (progress.gold || 0) >= rc.gold
    && Object.entries(rc.mats).every(([id, n]) => (mats[id] || 0) >= n);
  icon = dragonIcon(cls, 1) || picture(dragonName(cls.id, 1)); // as it is worn (연's), today's picture without 연's heroes
  meta = { mats: rc.mats, gold: rc.gold, base: `${baseName} ★${rc.star}`, gyeok: dragonGyeok(cls.id, 1) };
  row(`${dragonName(cls.id, 1)} (${CRAFT_POWER}등급 · 제십까지 ${CRAFT_POWER + (DRAGON_MAX - 1) * DRAGON_STEP}등급)`, `${baseName} ★${rc.star} (지금 ${b.includes(baseKey) ? '★' + starOf(cls, baseKey) : '없음'}) + `
    + Object.entries(rc.mats).map(([id, n]) => `${MATS[id].name} ${mats[id] || 0}/${n}`).join(' + ') + ` + ${won(rc.gold)}`,
    has ? '보유' : '조합', ok, () => {
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
  const SHOP = [['scroll', 1, 5], ['kalpa', 5, 8], ['silver1', 5, 6], ['silver2', 2, 15], ['essence', 3, 20], ['silver3', 1, 250], ['pearl', 1, 60]];
  for (const [id, n, price] of SHOP) {
    row(`${MATS[id].name} ${n}개`, `레이드주화 ${price}개`, '교환', (progress.coins || 0) >= price, () => {
      progress.coins -= price;
      mats[id] = (mats[id] || 0) + n;
      progress.mats = mats;
      say(`${MATS[id].name} ${n}개를 교환했습니다.`, 'sys');
    });
  }
  // 신발 (boots.js): the smith's pairs, the raid shop's, and 극'열반 made from 열반. Shared by every class.
  head('신발 (이동속도 · 모든 직업 공용)');
  const bst = bootsState(progress);
  for (const bt of BOOTS.filter(x => !x.drop)) {
    const got = bst.have.includes(bt.id), baseOk = !bt.from || bst.have.includes(bt.from);
    const ok = !got && baseOk && (bt.coins ? (progress.coins || 0) >= bt.coins
      : Object.entries(bt.mats).every(([id, n]) => (mats[id] || 0) >= n) && (progress.gold || 0) >= bt.gold);
    icon = picture(bt.name);
    meta = bt.coins ? { opt: `이동속도 +${bt.pct}%`, got } : { mats: bt.mats, gold: bt.gold, base: bt.from ? BOOT[bt.from].name : null, opt: `이동속도 +${bt.pct}%`, got };
    row(`${bt.name} (이동속도 +${bt.pct}%)`, bt.coins ? `레이드주화 ${bt.coins}개` : `${bt.from ? BOOT[bt.from].name + ' + ' : ''}`
      + Object.entries(bt.mats).map(([id, n]) => `${MATS[id].name} ${mats[id] || 0}/${n}`).join(' + ') + ` + ${won(bt.gold)}`,
    got ? '보유' : bt.coins ? '교환' : '조합', ok, () => {
      if (bt.coins) progress.coins -= bt.coins;
      else {
        progress.gold -= bt.gold;
        for (const [id, n] of Object.entries(bt.mats)) mats[id] -= n;
        progress.mats = mats;
      }
      if (bt.from) {
        bst.have = bst.have.filter(x => x !== bt.from);
        if (bst.worn === bt.from) bst.worn = null;
      }
      bst.have.push(bt.id);
      if (!bst.worn || BOOT[bst.worn].pct < bt.pct) bst.worn = bt.id;
      say(`${josa(bt.name, '을', '를')} 얻었습니다! (이동속도 +${bt.pct}%)`, 'sys');
      banner(`신발 · ${bt.name}`);
    });
  }
  head('조합 · 재료 장비');
  const have = m => Object.entries(m).every(([id, n]) => (mats[id] || 0) >= n);
  const matText = m => Object.entries(m).map(([id, n]) => `${MATS[id].name} ${mats[id] || 0}/${n}`).join(' + ');
  for (const c of CRAFTS) {
    if (c.only && !c.only.includes(cls.id)) continue;
    if (c.kind === 'shield' && !hasShield(cls.id)) continue;
    const sp = SPECIAL[c.id], key = 'sp:' + c.id, got = b.includes(key);
    if (c.legend && c === CRAFTS.find(x => x.legend)) head('조합 · 전설 장비 (현대 바람의나라)');
    if (c.sinsu && c === CRAFTS.find(x => x.sinsu && (!x.only || x.only.includes(cls.id)))) head('조합 · 사신수 지존 장비 (성물 4종 → 신수의 격)');
    if (c.judge && c === CRAFTS.find(x => x.judge)) head('조합 · 심판의낫 (용궁의 보물 · 균형 딜)');
    if (c.group && c === CRAFTS.find(x => x.group === c.group && (!x.only || x.only.includes(cls.id)))) head(c.group);
    // An evolution is made out of its base piece at ★5, which goes into the making.
    const baseKey = c.from && 'sp:' + c.from, base = c.from && SPECIAL[c.from];
    const baseOk = !c.from || (b.includes(baseKey) && starOf(cls, baseKey) >= 5);
    const baseText = c.from ? `${specialName(base, cls.id)} ★5 (지금 ${b.includes(baseKey) ? '★' + starOf(cls, baseKey) : '없음'}) + ` : '';
    icon = pieceIcon(cls, c.kind, specialBase(sp, cls.id), c.id) || picture(craftPicture(sp, cls.id, got ? starOf(cls, key) : 1));
    meta = { mats: c.mats, gold: c.gold, base: c.from ? `${specialName(base, cls.id)} ★5` : null, gyeok: sp.gyeok && GYEOK[sp.gyeok], opt: sp.opt.text + (c.set && MUSIN_SET[c.set] ? ` · 세트 ${MUSIN_SET[c.set].name}: ${MUSIN_SET[c.set].text}` : ''), got };
    const fam = familyOf(sp), famText = fam !== 'craft' && WEAPON_FAMILY[fam] ? ` · ${WEAPON_FAMILY[fam].role}${c.id === 'cr_sinsu_jujak' ? ` (주변 ${JUJAK_AURA.r}칸 아군 공격력 +${Math.round(JUJAK_AURA.k * 100)}%)` : ''}` : '';
    // A recipe of the story's gate (items.js needs): shut until that ground or raid is won.
    const gateOk = got || needsMet(c.needs, progress);
    const gateText = gateOk ? '' : `🔒 ${needsName(c.needs)}${c.needs.startsWith('raid_') ? ' 승리 시' : ' 정복 시'} 해금 · `;
    row(`${specialName(sp, cls.id)} (${KIND_NAME[c.kind]} ${c.pow}등급${c.stars === 1 ? ' · 별 없음' : ''})`, `${gateText}${baseText}${matText(c.mats)} + ${won(c.gold)} · ${sp.opt.text}${sp.gyeok && GYEOK[sp.gyeok] ? ' · ' + GYEOK[sp.gyeok].name : ''}${famText}`,
      got ? '보유' : gateOk ? '조합' : '잠김', !got && gateOk && baseOk && have(c.mats) && (progress.gold || 0) >= c.gold, () => {
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
      icon = dragonIcon(cls, DRAGON_MAX) || picture(dragonName(cls.id, DRAGON_MAX));
      meta = { mats: need, gold: 20000, gyeok: GYEOK[sn.gyeok], got: now };
      row(`${sn.name}의 ${dragonName(cls.id, DRAGON_MAX)}`, `${matText(need)} + 20000전 · ${gyeokText(sn.gyeok)}${sid === 'jujak' ? ` · 주작의 기운: 주변 ${JUJAK_AURA.r}칸 아군 공격력 +${Math.round(JUJAK_AURA.dragonK * 100)}%` : ''}`,
        now ? '각인 완료' : '각인', !now && have(need) && (progress.gold || 0) >= 20000, () => {
          progress.gold -= 20000;
          for (const [id, n] of Object.entries(need)) mats[id] -= n;
          progress.mats = mats;
          progress.dragonSinsu[cls.id] = sid;
          say(`${dragonName(cls.id, DRAGON_MAX)}에 ${sn.name}의 격을 새겼습니다!`, 'sys');
          banner(`${sn.name}의 ${dragonName(cls.id, DRAGON_MAX)}`);
        });
    }
    // 천상 각성 (선계 레이드's 선계의 기운): the 제십 in 선계's light — a look and its 격's flash, no rank.
    head('천상 각성 · 선계의 기운으로 제십 용무기에 선계의 빛을 입힌다 (외형만)');
    const hv = heavenOn(cls.id);
    icon = dragonIcon(cls, DRAGON_MAX) || picture(dragonName(cls.id, DRAGON_MAX));
    meta = { mats: HEAVEN_COST.mats, gold: HEAVEN_COST.gold, got: hv };
    row(`천상의 ${dragonName(cls.id, DRAGON_MAX)}`, `${matText(HEAVEN_COST.mats)} + ${won(HEAVEN_COST.gold)} · 금백 광채와 격 섬광 (등급은 그대로 17.2)`,
      hv ? '각성 완료' : '각성', !hv && have(HEAVEN_COST.mats) && (progress.gold || 0) >= HEAVEN_COST.gold, () => {
        progress.gold -= HEAVEN_COST.gold;
        for (const [id, n] of Object.entries(HEAVEN_COST.mats)) mats[id] -= n;
        progress.mats = mats;
        (progress.dragonHeaven = progress.dragonHeaven || {})[cls.id] = true;
        say(`${dragonName(cls.id, DRAGON_MAX)}에 선계의 빛이 깃들었습니다!`, 'sys');
        banner(`천상의 ${dragonName(cls.id, DRAGON_MAX)}`);
      });
  }
  head('강화 · 사본(조합 장비는 재료)으로 별을 올린다');
  // 확률 강화 (today's way, optional): half the materials, but it can fail — 손상 (spent for
  // nothing) or 부식 (a star back) — at 90% … 10% from 제일 to 제구.
  if (!sink) row(`확률 강화 ${settings.chanceUp ? '켜짐' : '꺼짐'}`, settings.chanceUp ? '재료 절반 · 성공 90%→10% · 실패 시 손상(재료만 잃음) 또는 부식(별 -1)'
    : '켜면 조합 장비·용무기 강화에 재료가 절반만 들고, 대신 성공 확률이 붙습니다', settings.chanceUp ? '끄기' : '켜기', true, () => {
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
      meta = star < top ? { mats: sc.mats, gold: sc.gold, gyeok: dragon ? dragonGyeok(cls.id, star + 1) : null } : null;
      fxs = { n: star, dragon };
      row(dragon ? name : `${name} ★${star}`, star >= top ? (dragon ? '최고 단계 (제십)' : '최고 별') : `${next}: ${matText(sc.mats)} + ${won(sc.gold)}`
        + (settings.chanceUp ? ` · 성공 ${Math.round(chance * 100)}%` : ' · 반 등급 상승'),
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
            forgeOut = { t: rust ? 'rust' : 'dmg', from: star, to: rust ? star - 1 : star, name, dragon };
            say(rust ? `강화 실패 — 부식! ${name} 별이 하나 내려갔습니다.` : `강화 실패 — 손상. 재료만 사라졌습니다.`, 'warn');
            banner(rust ? '강화 실패 · 부식' : '강화 실패 · 손상');
            return;
          }
          st[key] = star + 1;
          forgeOut = { t: 'ok', from: star, to: star + 1, name: dragon ? dragonName(cls.id, star + 1) : name, dragon };
          say(dragon ? `${dragonName(cls.id, star + 1)} 승급!` : `${name} ★${star + 1} 강화!`, 'sys');
          if (dragon || (csp && csp.craft.legend)) banner(dragon ? `승급 성공 · ${dragonName(cls.id, star + 1)}` : `강화 성공 · ${name} ★${star + 1}`);
        });
      continue;
    }
    const cost = starCost(star);
    if (!copies && star === 1) continue;
    any = true;
    const can = star < STAR_MAX && copies >= cost.copies && (progress.gold || 0) >= cost.gold;
    fxs = { n: star };
    row(`${name} ★${star}`, star >= STAR_MAX ? '최고 별' : `★${star + 1}: 사본 ${copies}/${cost.copies} + ${won(cost.gold)} · 별마다 반 등급`,
      star >= STAR_MAX ? '최고' : '강화', can, () => {
        progress.gold -= cost.gold;
        progress.copies[cls.id][key] -= cost.copies;
        progress.stars = progress.stars || {};
        const st = progress.stars[cls.id] = progress.stars[cls.id] || {};
        st[key] = star + 1;
        forgeOut = { t: 'ok', from: star, to: star + 1, name };
        say(`${name} ★${star + 1} 강화!`, 'sys');
      });
  }
  if (!any) row('강화할 장비가 없습니다', '같은 장비를 한 번 더 얻으면 사본이 되어 강화 재료로 쓰입니다', '-', false, () => {});
  if (!sink) $('#trade').hidden = false;
}

$('#equip-craft').onclick = () => openForge();

// ---------------------------------------------------------------- 조합 window
// Every recipe of the smith in one place: a tab per kind of making, the list of that tab,
// and the chosen recipe in full — its picture, what it gives (격 included), each material
// with what is held and where it drops, and the button.
let forgeTab = null, forgePick = null, forgeFresh = true, forgeBusy = false, forgeOut = null, forgeLast = null;
const lbScroll = { tab: null };
const forgeKey = e => e.name.replace(/ ★\d+$/, '').replace(/ \(.*\)$/, '');
const FORGE_TABS = [['용무기', /용무기/], ['재료 장비', /재료 장비/], ['전설', /전설/], ['사신수', /사신수 지존/], ['무신 방어구', /사신수 무신/], ['투구·방패·망토', /^조합 · (투구|방패|망토)/], ['각인', /각인/],
  ['강화', /강화/], ['신발', /^신발/], ['레이드 상점', /레이드 상점/]];
function forgeTabOf(sec) {
  const t = FORGE_TABS.find(([, re]) => re.test(sec));
  return t ? t[0] : '기타';
}
function openForge() {
  const list = [];
  openCraft(list);
  const mats = progress.mats || {}, cls = G ? G.cls : chosenClass;
  const tabs = FORGE_TABS.map(([n]) => n).filter(n => list.some(e => forgeTabOf(e.sec) === n));
  if (!tabs.includes(forgeTab)) forgeTab = tabs[0];
  $('#forge-title').textContent = `조합 · ${cls.name}`;
  $('#forge-gold').innerHTML = walletHTML(progress.gold, progress.coins);
  const tb = $('#forge-tabs');
  tb.innerHTML = '';
  for (const t of tabs) {
    const n = list.filter(e => forgeTabOf(e.sec) === t && e.can).length;
    const bt = document.createElement('button');
    bt.className = 'btn' + (t === forgeTab ? ' on' : '');
    bt.innerHTML = t + (n ? ` <i>${n}</i>` : '');
    bt.onclick = () => { if (forgeBusy) return; forgeTab = t; forgePick = null; forgeFresh = true; forgeLast = null; openForge(); };
    tb.append(bt);
  }
  const mine = list.filter(e => forgeTabOf(e.sec) === forgeTab);
  const pick = mine.find(e => forgeKey(e) === forgePick) || mine.find(e => e.can) || mine[0];
  forgePick = pick && forgeKey(pick);
  const keep = !forgeFresh && lbScroll.tab === forgeTab;
  forgeFresh = false;
  const done = e => e.label === '보유' || e.label === '각인 완료' || e.label === '최고';
  const lb = $('#forge-list'), d = $('#forge-detail');
  const sL = lb.scrollTop, sD = d.scrollTop;
  lb.innerHTML = '';
  for (const e of mine) {
    const it = document.createElement('button');
    it.className = 'forge-item' + (e === pick ? ' on' : '') + (e.can ? ' ready' : '') + (done(e) ? ' done' : '');
    it.innerHTML = (e.icon ? `<img src="${e.icon}" alt="">` : '<span class="noimg"></span>')
      + `<b>${e.name.replace(/ \(.*\)$/, '')}</b><small>${e.can ? '가능' : e.label === '보유' || e.label === '각인 완료' ? '보유' : e.label === '최고' ? '최고 단계' : '재료 부족'}</small>`;
    it.onclick = () => { if (forgeBusy) return; forgePick = forgeKey(e); openForge(); };
    lb.append(it);
  }
  d.innerHTML = '';
  if (pick) {
    const m = pick.meta || {};
    const where = id => {
      const names = ((MATS[id] && MATS[id].from) || []).map(sid => (STAGES.find(x => x.id === sid) || RAIDS.find(x => x.id === sid) || {}).name).filter(Boolean);
      return names.slice(0, 3).join(', ') + (names.length > 3 ? ` 외 ${names.length - 3}곳` : '');
    };
    d.innerHTML = `<div class="fd-head">${pick.icon ? `<img src="${pick.icon}" alt="">` : ''}<div><b>${pick.name}</b><span>${pick.sec}</span></div></div>`
      + (m.gyeok ? `<div class="fd-gyeok">${gyeokLine(m.gyeok)}</div>` : '')
      + (m.opt ? `<div class="fd-opt">옵션: ${m.opt}</div>` : '')
      + (m.base ? `<div class="fd-mat">재료 장비: ${m.base}</div>` : '')
      + (m.mats ? Object.entries(m.mats).map(([id, n]) => `<div class="fd-mat ${(mats[id] || 0) >= n ? 'ok' : 'no'}"><span>${matIcon(id) ? `<img src="${matIcon(id)}" alt="">` : ''}${MATS[id].name} ${mats[id] || 0}/${n}</span><small>${where(id)}</small></div>`).join('') : '')
      + (m.gold ? `<div class="fd-mat ${(progress.gold || 0) >= m.gold ? 'ok' : 'no'}"><span>${won(m.gold)}</span></div>` : '')
      + (!m.mats ? `<div class="fd-desc">${pick.desc}</div>` : '');
    const bt = document.createElement('button');
    bt.className = 'btn fd-go';
    bt.textContent = pick.label;
    bt.disabled = !pick.can;
    bt.onclick = () => pick.act();
    d.append(bt);
  }
  forgeOptBar();
  forgeLastLine();
  $('#forge').hidden = false;
  if (keep) { lb.scrollTop = sL; d.scrollTop = sD; }
  lbScroll.tab = forgeTab;
}
// ---------------------------------------------------------------- 강화·조합 연출
// A making (강화, 승급, 조합 ...) plays in the window: a short suspense (the card glows, 연's
// sparkle, the roulette's ticks), then its result — 성공 (flash, the ★ counting up, 연's level-up
// pillar), 손상 (the card cracks, dark smoke, 재료만 사라짐) or 부식 (a star back) — and the
// result stays as a line in the window until the next action. The window is locked meanwhile.
let forgeOptAsk = false, forgeTimers = [], forgeSprites = [], forgeRaf = 0;
const FORGE_OPT_TEXT = '확률 강화: 재료 절반 · 성공 90%→10% · 실패 시 손상/부식';

/** The 확률 강화 switch, apart from the list: the footer of the 강화 tab. */
function forgeOptBar() {
  let bar = $('#forge-opt');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'forge-opt';
    $('#forge-body').after(bar);
  }
  bar.hidden = forgeTab !== '강화';
  if (bar.hidden) { forgeOptAsk = false; return; }
  const on = !!settings.chanceUp;
  bar.title = FORGE_OPT_TEXT;
  bar.className = on ? 'on' : '';
  if (forgeOptAsk && !on) {
    bar.innerHTML = '<span class="fopt-warn">⚠ 실패하면 재료가 사라지고 별이 내려갈 수 있습니다. 켤까요?</span><button class="fopt-yes">켜기</button><button class="fopt-no">취소</button>';
    bar.querySelector('.fopt-yes').onclick = () => { forgeOptAsk = false; settings.chanceUp = true; saveJson('bs_settings', settings); openForge(); };
    bar.querySelector('.fopt-no').onclick = () => { forgeOptAsk = false; forgeOptBar(); };
    return;
  }
  bar.innerHTML = `<label class="fopt"><input type="checkbox" ${on ? 'checked' : ''}><span class="sw"></span><b>확률 강화</b></label><small>${FORGE_OPT_TEXT.replace('확률 강화: ', '')}</small>`;
  bar.querySelector('input').onchange = ev => {
    if (forgeBusy) { ev.target.checked = on; return; }
    if (ev.target.checked) { ev.target.checked = false; forgeOptAsk = true; forgeOptBar(); return; }
    settings.chanceUp = false;
    saveJson('bs_settings', settings);
    openForge();
  };
}

/** The last result as a line at the top of the card, kept until the next action. */
function forgeLastLine() {
  if (!forgeLast) return;
  const d = $('#forge-detail'), el = document.createElement('div');
  el.className = 'fd-res ' + forgeLast.t;
  el.textContent = forgeLast.text;
  d.prepend(el);
}

function forgeSound(k) { try { if (audio) audio.play(k); } catch (e) { /* silent */ } }
function forgeLater(ms, fn) { forgeTimers.push(setTimeout(fn, ms)); }

/** One of 연's/the game's effect sheets on the window's canvas, centred on the card's picture. */
function forgeSprite(id, o = {}) {
  const f = M.fx && M.fx[id];
  if (!f || !$('.ffx-live .ffx-cv')) return;
  const im = fxPic(id);
  // (not loaded yet: shown when it is, if the window is still up)
  if (!im) { const t0 = performance.now(); fxLoad(f.src || id).then(x => { if (x) forgeSprite(id, { ...o, delay: Math.max(0, (o.delay || 0) - (performance.now() - t0)) }); }); return; }
  forgeSprites.push({ id, f, im, t0: performance.now() + (o.delay || 0), scale: o.scale || 1, dy: o.dy || 0 });
  if (!forgeRaf) forgeRaf = requestAnimationFrame(forgeDraw);
}
function forgeDraw(now) {
  forgeRaf = 0;
  const cvs = [...document.querySelectorAll('.ffx-live .ffx-cv')];
  if (!cvs.length) { forgeSprites = []; return; }
  // Two layers: the additive sheets (black ground) on one that blends by 'screen', the rest on a plain one.
  const cv = cvs[0], cA = cvs[1].getContext('2d'), cN = cv.getContext('2d');
  cA.clearRect(0, 0, cv.width, cv.height);
  cN.clearRect(0, 0, cv.width, cv.height);
  forgeSprites = forgeSprites.filter(s => {
    const d = durs(s.id), life = d.reduce((a, b) => a + b, 0), t = (now - s.t0) / 1000;
    if (t >= life) return false;
    if (t < 0) return true;
    const f = s.f, i = fxFrame(d, t, false) + (f.f0 || 0);
    const k = s.scale * (f.k || 1), w = f.w * k, h = f.h * k;
    const c = f.add ? cA : cN;
    c.globalCompositeOperation = f.add ? 'lighter' : 'source-over';
    c.imageSmoothingEnabled = k > 1.5;
    const cx = cv.width / 2, cy = cv.height / 2 + s.dy;
    fxBlit(c, s.im, f, i, cx - w / 2, f.ax !== undefined ? cy - f.ay * k + h * 0.15 : cy - h / 2, k, s.id);
    return true;
  });
  if (forgeSprites.length) forgeRaf = requestAnimationFrame(forgeDraw);
}

function forgeEnd() {
  forgeTimers.forEach(clearTimeout);
  forgeTimers = [];
  forgeSprites = [];
  const fx = $('#forge-fx');
  if (fx) fx.remove();
  forgeBusy = false;
}

/** Runs a making: suspense, the real action (raw), then the result. */
function forgeRun(ent, raw) {
  if (forgeBusy) return;
  const kind = /레이드 상점/.test(ent.sec) ? null : /강화/.test(ent.sec) ? (ent.star && ent.star.dragon ? 'promo' : 'enh') : 'craft';
  if (!kind) { raw(); openForge(); return; }
  forgeBusy = true;
  forgeLast = null;
  forgeOut = null;
  const calm = !!settings.calmFx, label = ent.name.replace(/ \(.*\)$/, '');
  const fx = document.createElement('div');
  fx.id = 'forge-fx';
  fx.className = 'ffx ffx-live wait' + (calm ? ' calm' : '');
  fx.innerHTML = `<div class="ffx-flash"></div><div class="ffx-card"><div class="ffx-ico">${ent.icon ? `<img src="${ent.icon}" alt="">` : ''}</div>`
    + `<b class="ffx-name">${label}</b><div class="ffx-star">${ent.star && ent.star.n ? '★' + ent.star.n : '…'}</div><div class="ffx-msg">${kind === 'craft' ? '조합 중…' : kind === 'promo' ? '승급 중…' : '강화 중…'}</div></div>`;
  $('#forge-box').append(fx);
  // The effect layers sit on the window (not inside the card: a card in motion would cut the
  // 'screen' blend short), centred on the card's picture.
  const ico = fx.querySelector('.ffx-ico').getBoundingClientRect(), fr = fx.getBoundingClientRect();
  for (const cls of ['', ' add']) {
    const cv = document.createElement('canvas');
    cv.className = 'ffx-cv' + cls;
    cv.width = 300; cv.height = 240;
    cv.style.left = Math.round(ico.left - fr.left + ico.width / 2 - 150) + 'px';
    cv.style.top = Math.round(ico.top - fr.top + ico.height / 2 - 120) + 'px';
    fx.append(cv);
  }
  fx.onclick = () => { if (fx.classList.contains('done')) forgeEnd(); };
  forgeSound('click');
  forgeSprite('129', { scale: 1.6 });
  forgeSprite('131', { scale: 1.5, delay: 300 });
  forgeLater(260, () => forgeSound('click'));
  forgeLater(520, () => { forgeSound('click'); forgeSprite('77', { scale: 1.3 }); });
  forgeLater(780, () => {
    try { raw(); } catch (e) { console.error(e); forgeEnd(); return; }
    const out = forgeOut || { t: 'ok', name: label, craft: true };
    const was = $('#forge-list').scrollTop;
    openForge();
    $('#forge-list').scrollTop = was;
    const star = fx.querySelector('.ffx-star'), msg = fx.querySelector('.ffx-msg'), name = fx.querySelector('.ffx-name');
    fx.classList.remove('wait');
    fx.classList.add(out.t, 'res');
    if (out.t === 'ok') {
      const big = kind === 'promo' || kind === 'craft';
      if (kind === 'craft') { msg.textContent = `조합 성공 — ${label}`; forgeLast = { t: 'ok', text: `조합 성공 · ${label}` }; star.textContent = '✔'; }
      else {
        name.textContent = out.name;
        star.textContent = '★' + out.from;
        forgeLater(260, () => { star.textContent = '★' + out.to; star.classList.add('pop'); });
        msg.textContent = kind === 'promo' ? `승급 성공 — ${out.name}` : `강화 성공 — ★${out.from} → ★${out.to}`;
        forgeLast = { t: 'ok', text: kind === 'promo' ? `승급 성공 · ${out.name}` : `강화 성공 · ${out.name} ★${out.from} → ★${out.to}` };
      }
      forgeSound(big ? 'promote' : 'chest');
      if (kind === 'promo') forgeLater(120, () => forgeSound('levelup'));
      forgeSprite('h_levelup', { scale: big ? 1.6 : 1.2, dy: -10 });
      forgeSprite('131', { scale: 2.2 });
      if (kind === 'promo') forgeSprite('g_zodiac_dragon', { scale: 1, delay: 150, dy: 20 });
      forgeLater(big ? 2000 : 1500, () => fx.classList.add('done'));
    } else {
      const rust = out.t === 'rust';
      star.textContent = '★' + out.from;
      msg.textContent = rust ? `부식 — ★${out.from} → ★${out.to}` : '손상 — 재료만 사라졌습니다';
      forgeLast = { t: out.t, text: msg.textContent + ` · ${out.name}` };
      if (rust) forgeLater(300, () => { star.textContent = '★' + out.to; star.classList.add('drop'); });
      forgeSound('lose');
      forgeSprite(rust ? 'g_poison_purple' : 'k_ab_darkburst', { scale: rust ? 1.3 : 1, dy: rust ? 0 : 30 });
      if (!rust) forgeSprite('k_ab_smoke', { scale: 0.9, delay: 250, dy: 20 });
      forgeLater(1700, () => fx.classList.add('done'));
    }
    forgeLater(out.t === 'ok' ? 2200 : 2000, () => { if ($('#forge-fx') === fx) forgeEnd(); });
    forgeLastLine();
  });
}

/** A 격 (a gyeok.js entry or a 용무기's) as a line. */
function gyeokLine(g) {
  const id = Object.keys(GYEOK).find(k => GYEOK[k] === g);
  if (id) return gyeokText(id);
  return `${g.name}: 타격 시 ${Math.round(g.chance * 100)}% · 고정 피해${g.st ? ' · 저주' : ''}${g.cdCut ? ` · 핵심 기술 재사용 -${g.cdCut * 100}%` : ''}`;
}
$('#forge-close').onclick = () => { forgeEnd(); forgeOptAsk = false; $('#forge').hidden = true; if (!$('#equip').hidden) buildEquip(); };
$('#equip-cards').onclick = () => openCards();

$('#open-equip').onclick = () => openEquipWindow();
$('#close-equip').onclick = () => closeEquipWindow();

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
    + (G && !mine && skillReq(def) > G.player.lvl ? ' lock' : '');
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
  const lv = grown ? '완성됨' : mine ? (def.evolved ? '완성' : `${mine.lv}/${MAX_SKILL_LEVEL}단`) : `Lv ${skillReq(def)}부터`;
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
        note = (note ? note + ' · ' : '') + `${q.name}(${q.promo ? q.promo + '차' : '일반'}) ${INHERIT_LV}단에서 계승 (자리·단 이어받음)`;
      }
      if (!note && mastered(cls.id).includes(id)) note = '숙련 · 첫 카드에 등장';
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
  // (a class with no portrait of its own: nothing until its look is drawn from 연's layers, heroPic)
  return M.yhero2 && M.yhero2[cls.id] ? BLANK_PIC : `assets/hero/${cls.hero}.png`;
}
const BLANK_PIC = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
/** Puts a class's figure in an <img>: its portrait at once, its look as worn (연's layers) once drawn. */
function heroPic(el, cls) {
  if (!el) return;
  el.dataset.cls = cls.id;
  if (!el.getAttribute('src') || el.dataset.look !== cls.id) el.src = heroPicture(cls);
  lookPicture(cls).then(url => { if (url && el.dataset.cls === cls.id) { el.src = url; el.dataset.look = cls.id; } });
}

/** The hero calls out a spell, as players typed it: a bubble over the head. */
function shout(name, plain = false) {
  if (plain || SH) return;
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
  if (G.stage.war) return G.stage.music || 'raid_raid_goblin'; // 대항전: the raids' battle drums («쟁»: its boss's)
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
  // The class's own weight (data.js), from bot clears of 왕초보. A cut (a caster whose spells
  // grow into a screen-wide sweep) comes in with the levels, from Lv 15 to full at Lv 40 (spells
  // near 8단): from the first, 천인 at half its blows fell to the first crowds about Lv 13; coming
  // in from Lv 1 it was already three quarters by the 왕초보 crowd of 200-300 (Lv 17-24, before the
  // boss), where a 천인 still on single-target 염화·삼족오 fell in three runs of five.
  let ck = G.cls.dmgK || 1;
  if (ck < 1) ck = 1 - (1 - ck) * Math.min(1, Math.max(0, G.player.lvl - 15) / 25);
  let k = (G.player.gearPower || 1) * ck;
  if (G.buffs.g_power > G.t) k *= 1 + (G.buffs.g_powerK || 0);
  if (G.buffs.g_pierce > G.t) k *= 1 + (G.buffs.g_pierceK || 0);
  if (G.player.sts && heroStatusOn('despair')) k *= 0.8;
  if (G.buffs.power > G.t) k *= 1 + (G.buffs.powerK || 0.5);
  // 암습의 여세: for a moment after the 암습 every blow lands as from behind (연's 배후 공격 +50%).
  if (G.buffs.ambushF > G.t) k *= AMBUSH.followK;
  // 치유의반향 (도사 9차 패시브, data.js p_banhyang.full9): at full health the blows are stronger.
  const f9 = G.cls.id === 'poet' && SKILLS.p_banhyang && SKILLS.p_banhyang.full9;
  if (f9 && G.player.hp >= G.player.maxHp * f9.at && promoOf('poet') >= 9) k *= 1 + f9.k;
  return k;
}

// ---------------------------------------------------------------- 도적의 은신·암습 (바람의나라 연)
// 연's 투명 (Skill 20210700): five seconds out of sight (it was 2.5 s at three times every blow), and
// the 도적's great strikes deal half again from behind the foe (필살검무·백호검무·이기어검·필살검강·
// 수효도검·암살: "대상 배후에서 타격 시, 기술 피해량이 50% 증가"); attacking ends 투명. Here:
//   잠행 — 투명 cast: the hero fades (and the monsters lose it and wander); its blows are held for
//          `stalk` seconds while it closes in, the gauge at its feet filling.
//   암습 — then the strongest strike it has comes out of hiding first, `k` times as hard (`kLv` more a
//          단 of 투명: 3.5배 at 1단, 5.25배 at 8단), every hit of it a 치명타 with 연's 암살 picture and sound; that ends 투명.
//   여세 — for `follow` seconds after, every blow lands as from behind (+50%; 연's older 투명 record
//          gave as much, "5초간 44% 추가 피해"); the strikes that were held go out together in it. 3차 승급 and up: the 여세 is longer. 5차 and up: a foe
//          felled by the 암습 brings the next 투명 sooner (half its wait).
// One fade and one strike a 투명 (no flicker on and off): the hero stays hidden through the 잠행.
const AMBUSH = { stalk: 1.2, grace: 1.2, k: 3.5, kLv: 0.25, follow: 3, followLong: 4, followK: 1.5, show: 0.6 };

/** The strike the 암습 opens with: the hardest single throw among the hero's ready (or soon) blows. */
function ambushOpener() {
  const left = G.buffs.stealth - G.t;
  let best = null, bs = 0;
  for (const s of G.skills) {
    const def = SKILLS[s.id];
    if (!def || ['ult', 'buff', 'aura', 'passive', 'heal'].includes(def.kind) || def.heal) continue;
    const st = stats(s);
    if (!(st.dmg > 0) || s.timer > left) continue;
    const sc = st.dmg * (st.count || def.count || 1) * (['screen', 'nova', 'cleave', 'line'].includes(def.kind) ? 1.5 : 1);
    if (sc > bs) { bs = sc; best = s; }
  }
  return best;
}

/** The 암습 lands: 투명 ends, its picture and sound on the nearest foe, the 여세 begins. */
function ambushStrike(s) {
  G.buffs.stealth = G.t;
  G.ambush = null;
  G.ambushes = (G.ambushes || 0) + 1;
  G.buffs.ambushF = G.t + (promoOf(G.cls.id) >= 3 ? AMBUSH.followLong : AMBUSH.follow);
  G.ambushShow = G.t + AMBUSH.show;
  const t = nearestEnemies(1, 7)[0];
  if (t) {
    if (M.fx.k_r_amsal) fxOn('k_r_amsal', t, { scale: 0.75 });
    if (M.fx.h_ml_cross) fxOn('h_ml_cross', t, { scale: 0.9, delay: 0.05 });
  }
  audio.play('skill_r_amsal', 'strike');
  G.bubble = { text: `암습! ${skillName(s.id, s.lv)}`, t: G.t };
  G.shake = Math.max(G.shake, 0.18);
  battleInfo('cast', null, () => `[암습] ${skillName(s.id, s.lv)}`);
}

/** The 잠행 gauge at the hero's feet: filling while it closes in, gold once the 암습 is ready, a red
 *  ring running down through the 여세. Drawn under the hero (the hero itself is faded). */
function drawAmbush(p) {
  const hid = G.buffs.stealth > G.t && G.ambush, fol = G.buffs.ambushF > G.t;
  if (!hid && !fol) return;
  ctx.save();
  ctx.translate(Math.round(p.x), Math.round(p.y + 2));
  ctx.scale(1, 0.5);
  ctx.lineWidth = 3;
  if (hid) {
    const k = Math.min(1, (G.t - G.ambush.at) / AMBUSH.stalk), ready = k >= 1;
    ctx.strokeStyle = 'rgba(20,10,30,0.55)';
    ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = ready ? `rgba(255,214,74,${0.7 + 0.3 * Math.sin(G.t * 14)})` : 'rgba(176,120,255,0.9)';
    ctx.beginPath(); ctx.arc(0, 0, 20, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); ctx.stroke();
  } else {
    const k = (G.buffs.ambushF - G.t) / (promoOf(G.cls.id) >= 3 ? AMBUSH.followLong : AMBUSH.follow);
    ctx.strokeStyle = 'rgba(255,70,50,0.75)';
    ctx.beginPath(); ctx.arc(0, 0, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); ctx.stroke();
  }
  ctx.restore();
  // Hidden, the hero is 연's 투명 itself (Skill_Effect_0031): its green outline held over the faded
  // figure, breathing a little, while it lasts (its cast plays the whole effect once).
  if (hid && M.fx.k_r_stealth && G.t - G.ambush.at > 0.4) {
    ctx.save();
    ctx.globalAlpha = 0.45 + 0.15 * Math.sin(G.t * 5);
    drawFx('k_r_stealth', p.x, p.y - 26, 0.2, 1, 0, 'center', false, p.face < 0);
    ctx.restore();
  }
  if (hid && G.t - G.ambush.at >= AMBUSH.stalk) {
    ctx.font = 'bold 10px G9';
    ctx.textAlign = 'center';
    outline('암습', p.x, p.y - 62, '#ffd84a');
  }
}

function frame(now) {
  // A slow frame now and then is caught up (up to a tenth of a second) rather than played as
  // slow motion.
  const dt = Math.min(0.1, (now - (frame.last || now)) / 1000);
  frame.last = now;
  // (the share of late frames lately, about the last second and a half: the 필살기's grand layers
  // shrink to what the device keeps up with — ultGrand)
  frame.late = (frame.late || 0) * 0.98 + (dt > 0.02 ? 0.02 : 0);
  // The 속도 key: x2 on any ground, x3 on one already conquered (farming goes quicker).
  const fast = huntSpeed();
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
    p.inDx = p.inDy = 0;
    return;
  }
  const walking = p.moving;
  // A direction the player has just pressed (not one held on while a spell turned the hero to
  // its target: before, every cast while the hero stood turned it back and started the turn
  // again, and a hero casting often — a 격투가 by the boss — could not step off the red at all).
  const fresh = p.inDx !== dx || p.inDy !== dy;
  p.inDx = dx;
  p.inDy = dy;
  if (p.fdx !== dx || p.fdy !== dy) {
    p.fdx = dx;
    p.fdy = dy;
    if (dx) p.face = dx;
    if (fresh) p.pushT = 0;
    // Standing, a new direction first turns the hero (to aim a spell); walking, it turns as it goes.
    // (경공 1단계: on the boss's red the hero sets off at once.)
    if (!walking && fresh && !(heroMove().lvl >= 1 && onRed(p.tx, p.ty))) {
      p.turnT = 0.1;
      return;
    }
  }
  if (p.turnT > 0) {
    p.turnT -= dt;
    return;
  }
  const nx = p.tx + dx, ny = p.ty + dy, there = occ.get(key(nx, ny));
  // 대항전 (war.js): the castle's walls and the enemy's gate stop the hero; its own guild does not.
  if ((G.war && !War.open(nx, ny)) || (G.arena && !Hunt.open(nx, ny))) {
    p.moving = false;
    return;
  }
  if (there && there.hp > 0 && !(G.war && there.team === 0)) {
    p.moving = false;
    p.pushT = (p.pushT || 0) + dt;
    // 초상비 (보조 기술): through the crowd at once, not after half a second's shove.
    const through = G.buffs.chosang > G.t && there.kind !== 'boss' && !there.cmdr;
    if (!through && (p.pushT < 0.5 || there.moving || there.kind === 'boss' || there.cmdr)) return;
    // (A war: not while fighters of its own side share the hero's tile — the heap would land on them.)
    if (G.war && crowd.has(key(p.tx, p.ty))) return;
    // Pushed long enough, the hero and the monsters on the tile trade places (the whole heap of
    // a crowded tile goes together): never the hero and a monster on one tile.
    const k = key(nx, ny), heap = crowd.get(k) || [];
    occ.delete(k);
    crowd.delete(k);
    place(there, p.tx, p.ty);
    if (heap.length) crowd.set(key(p.tx, p.ty), heap);
    // It slides across as the hero does, rather than jumping.
    for (const b of [there, ...heap]) {
      b.tx = p.tx;
      b.ty = p.ty;
      b.fx = nx;
      b.fy = ny;
      b.mt = 0;
      b.dur = TILE / heroSpeed();
      b.moving = true;
    }
  }
  p.pushT = 0;
  p.sfx = p.tx;
  p.sfy = p.ty;
  // 경공 on the boss's red: steps a fifth quicker (1단계); once in four seconds a step of two
  // tiles (3단계, 질풍보) when the tile beyond is open and off the red.
  const mv = heroMove(), red = mv.lvl >= 1 && onRed(p.tx, p.ty);
  let tx = nx, ty = ny;
  if (red && mv.lvl >= 3 && !there && G.t - (G.galeAt || -9) >= 4) {
    const fx = nx + dx, fy = ny + dy;
    if (free(fx, fy) && !onRed(fx, fy) && (!G.war || War.open(fx, fy))) {
      tx = fx;
      ty = fy;
      G.galeAt = G.t;
    }
  }
  p.tx = tx;
  p.ty = ty;
  p.st = 0;
  p.sdur = TILE / heroSpeed() * (red ? 0.8 : 1);
  p.stepping = p.moving = true;
  if (rest > 0 && rest < p.sdur) stepHero(dx, dy, rest);
}

/** Pixels a second the hero walks. */
function heroSpeed() {
  const p = G.player;
  const held = p.sts && (heroStatusOn('stun') || heroStatusOn('para') || heroStatusOn('freeze')) ? 0.3 : p.sts && heroStatusOn('slow') ? 0.65 : 1;
  return (TILE / 0.24) * (p.speed / 70) * (1 + 0.08 * G.passives.speed) * (1 + 0.1 * opt('speed')) * heroMove().k
    * (G.buffs.g_speed > G.t ? 1 + (G.buffs.g_speedK || 0) : 1) * held
    * (G.buffs.swift > G.t ? 1 + PROCS.swift.k : 1) * (G.buffs.chosang > G.t ? 1 + UTIL.chosang.speed : 1)
    * (G.hunt ? Hunt.speedK() : 1); // 사냥 기믹: 기세 1단
}

/**
 * The hero's 이동속도 (boots.js): the 민첩 passive and the option as before, the worn boots on
 * top (up to the cap), and the 경공 step it opens.
 */
function heroMove() {
  const p = G.player, base = (1 + 0.08 * G.passives.speed) * (1 + 0.1 * opt('speed')), bp = p.bootPct || 0;
  const c = p.moveC;
  if (c && c.base === base && c.bp === bp) return c.v;
  p.moveC = { base, bp, v: moveBonus(base, bp) };
  return p.moveC.v;
}

function update(dt) {
  // 대항전 (war.js): the opening count holds the field.
  if (G.war && War.hold(dt)) return;
  G.t += dt;
  const p = G.player;
  if (G.pace) Hunt.tick(dt); // 사냥 기믹: the tempo record, the boss's measure

  if (!G.dead) {
    const [dx, dy] = input();
    if (dx || dy) G.steerAt = G.t;
    if (G.war && (dx || dy)) War.moved(); // 대항전·공대: the player is at the keys (not 자리비움)
    if (settings.tiles || G.war) stepHero(dx, dy, dt);
    else {
    p.moving = !!(dx || dy);
    if (p.moving) {
      p.fdx = dx;
      p.fdy = dy;
      if (dx) p.face = dx;
      const ox = p.x, oy = p.y;
      p.x += dx * heroSpeed() * dt;
      p.y += dy * heroSpeed() * dt;
      // 사냥 기믹: the map's walls. A slant into one slides along it (the other way's half kept), as
      // the tiles' walk does, rather than stopping the hero dead at every cliff's edge.
      const shut = (x, y) => !Hunt.open(Math.floor(x / TILE), Math.floor((y - TILE / 2 + 6) / TILE));
      if (G.arena && shut(p.x, p.y)) {
        if (dx && dy && !shut(p.x, oy)) p.y = oy;
        else if (dx && dy && !shut(ox, p.y)) p.x = ox;
        else { p.x = ox; p.y = oy; }
      }
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
    gearTick(dt);
  }
  G.shake = Math.max(0, G.shake - dt);

  spawn(dt);
  moveEnemies(dt);
  if (!G.dead) {
    const chain = chainSkills();
    // 투명's 잠행 (AMBUSH): the blows wait for the 암습; a 투명 run out unspent is simply over.
    if (G.ambush && !(G.buffs.stealth > G.t)) G.ambush = null;
    const stalk = G.ambush;
    const opener = stalk && G.t >= stalk.at + AMBUSH.stalk && G.t < stalk.at + AMBUSH.stalk + AMBUSH.grace ? ambushOpener() : null;
    for (const s of G.skills) {
      // 마기지체: every spell turns 1.6 times as fast for a while.
      s.timer -= dt * (G.buffs.haste > G.t ? 1.6 : 1) * (1 + 0.08 * opt('haste')) * (G.hunt ? Hunt.cdK() : 1); // 사냥 기믹: 기세 2단
      // A spell in the 기술 연계 waits, ready, for the others of the chain.
      if (chain.includes(s) && !stalk) {
        s.timer = Math.max(0, s.timer);
        continue;
      }
      if (s.timer <= 0) {
        // A blow with no foe in its own reach is not thrown (in a 대항전 the hero swung 초혼비무
        // at empty ground while walking between the fights): it waits, ready, for the first foe
        // to come within that skill's reach. Heals and summons still go out (buffs: below).
        const st0 = stats(s), rch = st0.dmg && !SKILLS[s.id].heal ? skillReach(SKILLS[s.id], st0) : 0;
        if (rch && !G.enemies.some(e => tkFoe(e) && tdist(e, p) <= rch)) {
          s.timer = 0;
          continue;
        }
        // A buff is for a fight too (사용자 피드백: 빈 들판에 기술이 계속 나감): not thrown with no foe within six tiles —
        // a guard or a shield also when the hero is hurt. (A 기원 still goes out: it mends.)
        const d0 = SKILLS[s.id];
        if (d0.kind === 'buff' && d0.buff !== 'stealth' && !(['shield', 'guard'].includes(d0.buff) && p.hp < p.maxHp * 0.9) && !G.enemies.some(e => tkFoe(e) && tdist(e, p) <= 6)) {
          s.timer = 0;
          continue;
        }
        // 투명 is kept for a fight: not thrown with no foe within six tiles.
        if (SKILLS[s.id].buff === 'stealth' && (stalk || !G.enemies.some(e => tdist(e, p) <= 6))) {
          s.timer = 0;
          continue;
        }
        // In the 잠행 every blow waits; then the strongest goes first (the others wait for it a
        // moment more, then any blow in reach will do for the 암습).
        if (stalk && rch && (G.t < stalk.at + AMBUSH.stalk || (opener && s !== opener))) {
          s.timer = 0;
          continue;
        }
        fireSkill(s, 1);
      }
    }
    if (chain.length && !G.chainRun && !G.ambush && chain.every(s => s.timer <= 0) && nearestEnemies(1, 7).length) startChain(chain);
    plainAttack(dt);
    idleLook(dt);
  }
  runTimers();
  G.allyHitting = true;
  updateAllies(dt);
  G.allyHitting = false;
  if (!G.dead) updatePet(dt);
  // The 코디 pet at the hero's heel (looks only).
  updateCosPet(G, G.player, G.cls.id, dt, heroSpeed());
  tickHeroStatus();
  updateParty(dt);
  updateShots(dt);
  gyeokTick(); // 격's ways: what is still to land, the grounds
  updateStyle(dt);
  if (!G.dead) updatePickups(dt);
  for (const f of G.fxs) f.t += dt;
  G.fxs = G.fxs.filter(f => f.t < f.life && !(f.on && fxDone(f)));
  for (const d of G.dying) d.t += dt;
  if (G.shocks) {
    for (const s of G.shocks) s.t += dt;
    G.shocks = G.shocks.filter(s => s.t < 0.3);
  }
  G.dying = G.dying.filter(d => d.t < 1.2);
  for (const t of G.texts) {
    t.t += dt;
    if (t.t < 0.15 && !t.sum) t.y -= 40 * dt;
  }
  G.texts = G.texts.filter(t => t.t < 1.1);
  if (G.bubble && G.t - G.bubble.t > 1.3) G.bubble = null;
  if (G.training) trainTick();
}

// ---------------------------------------------------------------- monsters

/** Tiles from the hero to the edge of the screen, and a little beyond. */
function viewTiles() {
  return { w: Math.ceil(VW / TILE / 2) + 1, h: Math.ceil(VH / TILE / 2) + 1 };
}

/** A free tile just outside the screen (as the camera stands: its lead ahead of the hero, camLead). */
function ringTile(must = false) {
  const p = G.player, v = viewTiles(), L = G.camLead;
  const cx = p.tx + (L ? Math.round(L.x / TILE) : 0), cy = p.ty + (L ? Math.round(L.y / TILE) : 0);
  for (let tries = 0; tries < (must ? 200 : 40); tries++) {
    let tx, ty;
    if (Math.random() < 0.5) {
      tx = cx + Math.floor(rand(-v.w, v.w + 1));
      ty = cy + (Math.random() < 0.5 ? -v.h : v.h);
    } else {
      tx = cx + (Math.random() < 0.5 ? -v.w : v.w);
      ty = cy + Math.floor(rand(-v.h, v.h + 1));
    }
    if (free(tx, ty) && (!G.arena || Hunt.reach(tx, ty))) return [tx, ty];
  }
  if (G.arena) return Hunt.spawnTile(); // 사냥 기믹: the rim all wall: an open tile within reach
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

/**
 * The class's best skills at a level (raids, 쟁, 대항전): its strongest open kit (tierKit — the
 * highest 승급's blows of every kind, its power, guard and 기원), each as high as the level allows;
 * then the player's own recorded picks, then the rest of its strongest open spells, up to the bar's
 * twelve. (It was the last good hunt's build as it was, often a low-level one.)
 */
function applyBuild(start) {
  const cls = G.cls.id, rec = (progress.builds || {})[cls], promo = promoOf(cls);
  const fits = (id, d) => d && (d.cls === cls || d.cls === 'all') && d.kind !== 'ult' && promo >= (d.promo || 0)
    && skillReq(d) <= start;
  const ids = [], add = id => { if (ids.length < MAX_SKILLS && !ids.includes(id) && fits(id, SKILLS[id])) ids.push(id); };
  // A 도사 keeps two of its heals: in a raid it is the party's healer.
  const open = Object.entries(SKILLS).filter(([id, d]) => fits(id, d) && !d.evolved && d.cls === cls);
  if (cls === 'poet') open.filter(([, d]) => d.kind === 'heal').sort((a, b) => skillReq(b[1]) - skillReq(a[1])).slice(0, 2).forEach(([id]) => add(id));
  // (9차 스킬 개편: an open 9차 set comes whole — its 보조 공격 and 아우라 strike by themselves.)
  open.filter(([, d]) => d.promo === 9).forEach(([id]) => add(id));
  tierKit(cls, promo).forEach(add);
  if (rec) rec.skills.forEach(([id]) => { if (!SKILLS[id] || !SKILLS[id].evolved) add(id); });
  open.sort((a, b) => (a[1].dmg ? 0 : 1) - (b[1].dmg ? 0 : 1) || (b[1].promo || 0) - (a[1].promo || 0) || (b[1].dmg || 0) - (a[1].dmg || 0)).forEach(([id]) => add(id));
  add('c_heal');
  G.skills = ids.map(id => {
    const d = SKILLS[id];
    return { id, lv: d.evolved ? 1 : Math.max(1, Math.min(start - skillReq(d) + 1, MAX_SKILL_LEVEL)), timer: 0.5 };
  });
  // Its 보조 능력 at their best too: the six it may hold (MAX_PASSIVES), its own picks first and then
  // those a fight wants, each as high as the level allows up to MAX_PASSIVE_LEVEL (it went past 5).
  const cap = Math.min(MAX_PASSIVE_LEVEL, Math.max(1, Math.floor(start / 4)));
  const pas = [];
  for (const k of [...Object.keys(G.passives).filter(k => rec && rec.passives[k] > 0), 'life', 'power', 'haste', 'area', 'armor', 'mana'])
    if (k in G.passives && !pas.includes(k) && pas.length < MAX_PASSIVES) pas.push(k);
  for (const k of Object.keys(G.passives)) G.passives[k] = pas.includes(k) ? cap : 0;
  // 체력 단련 gives its health as when picked on a card.
  G.player.maxHp += 20 * G.passives.life;
  G.player.hp = G.player.maxHp;
  say(`최고 빌드로 시작 (Lv ${start}): ${G.skills.map(s => skillName(s.id, s.lv)).join(', ')}`, 'sys');
}

/** A hunt's build, kept for the class when it went well (its raids start from it). */
function keepBuild() {
  if (!G || G.stage.raid || G.war || G.player.lvl < 8) return;
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

/** The level a hero starts a raid (and a 쟁·대항전, floored there) at: the class's own level, its best,
 *  and no lower than its highest 승급's spells at 8단 (5차 Lv 16 … 9차 Lv 22, a 대항전's floor): a class
 *  grown mostly as a companion (its record ≤ 80% of the hero's) or promoted on a short run would else
 *  start below its 9차 spells (Lv 15) and fight with none of them. */
function raidStart(rec, id = G && G.cls ? G.cls.id : chosenClass && chosenClass.id) {
  const pr = id ? promoOf(id) : 0;
  const top = pr >= 5 ? Object.values(SKILLS).filter(d => d.cls === id && d.promo === pr && d.kind !== 'ult').map(skillReq) : [];
  const floor = top.length ? Math.max(...top) + MAX_SKILL_LEVEL - 1 : 1;
  return Math.max(1, floor, rec ? rec.lvl : 1);
}

/** A raid: the hero starts grown (its build fitted to the start level), and the raid gathers. */
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
  // 공대 (war.js): twenty-four raiders of every class and role gather with the hero — the
  // player's other grown classes among them — on the guild war's fighters.
  War.raidSetup();
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
    const d = M.beast[G.boss.beast], bi = pic(`beast/${G.boss.beast}.png`), side = Math.min(d.cell[0], d.cell[1]);
    if (bi) g.drawImage(bi, (d.cell[0] - side) / 2, 0, side, side, 0, 0, c.width, c.height);
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
    if (free(tx, ty) && (!G.stage.jaeng || War.open(tx, ty))) addEnemy(pickMonster(i % 4 === 0), null, null, 0, [tx, ty]);
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
  // 공대: the raid's servants come about the boss (its lair before it), not round the hero.
  const RW = G.war && G.war.raid;
  const floor = G.bossT === undefined ? (RW ? 24 : 30) : (RW ? 10 + 6 * G.phase : 12 + 6 * G.phase);
  G.spawnT -= dt;
  if (G.spawnT <= 0) {
    G.spawnT = 1;
    for (let i = 0; i < 2 && G.enemies.length < floor; i++) {
      const at = RW ? War.raidSpot() : null;
      if (!RW || at) addEnemy(pickMonster(), null, null, 0, at);
    }
  }
  if (G.bossDue && t >= RAID_BOSS_AT) {
    const e = addEnemy(G.boss.m, 'boss', G.boss, 0, RW ? War.raidLair() : null);
    if (!e) return;
    // Built for a whole party: about four minutes for a party of grown heroes.
    // Tougher for a party that comes in stronger (a start above Lv 20: +6% a level).
    // 공대: in the raid's own measure, for twenty-five (war.js).
    e.hp = e.maxHp = RW ? War.raidBossHp() : 11000 * G.level * (1 + 0.06 * Math.max(0, G.player.lvl - 20));
    // 공대: the boss stands over the crowd of twenty-five, some three and a half heroes tall,
    // so it shows through their spells. Only the picture grows: its reach stays (baseScale).
    if (RW) {
      const yu = M.yunit && M.yunit[e.m.id], tall = (yu ? yu.foot[1] - 4 : e.m.h) * e.scale;
      e.baseScale = e.scale;
      e.scale *= Math.max(1, Math.min(2.4, RAID_BOSS_TALL / Math.max(1, tall)));
    }
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
  bossBrain(b, dt, { rageAt: RAID_LIMIT - 60 });
}

/**
 * A raid boss's own fight once it stands (the raid's, and 「쟁」's through war.js): its phases at
 * 70% and 40% with their waves and champions, its call every half minute, its rage (o.rageAt), whom
 * it turns on, its bolts and blasts at the bodies about it (o.bodies: the raid's party; 「쟁」: all
 * three guilds), and its red floor one pattern at a time.
 */
function bossBrain(b, dt, o) {
  const t = G.t, p = G.player;
  const RW = G.war && (G.war.raid || G.stage.jaeng);
  const bodies = () => (o.bodies ? o.bodies() : partyBodies());
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
    for (let i = 0; i < 1 + phase; i++) addEnemy(m, 'champ', { name: '챔피언', scale: 1.15 }, pack, G.stage.jaeng ? War.mobSpot() : null);
  }
  // Every half minute it calls its own.
  if (t >= G.waveT) {
    G.waveT = t + 30;
    bossSay('summon');
    raidWave(b, (5 + G.phase * 2) * (RW ? 1.5 : 1));
  }
  if (!G.saidLow && b.hp < b.maxHp * 0.1) {
    G.saidLow = true;
    bossSay('low');
  }
  // The last minute before the time runs out: enraged, it strikes harder and faster.
  if (!G.enraged && t > o.rageAt) {
    G.enraged = true;
    bossSay('enrage');
    emote('rage');
    banner(`${G.boss.name} 광폭화!`);
    b.dmg *= 1.3;
  }
  // Every six seconds the boss turns on someone: the warrior most, the hero next.
  G.aggroT -= dt;
  if (G.aggroT <= 0 && RW) {
    // 공대: the tanks hold it mostly; a taunt holds it (war.js).
    G.aggroT = 6;
    const prev = G.aggro;
    G.aggro = War.raidAggro();
    if (G.aggro && G.aggro !== prev) b.bubble = { text: `${G.aggro === p ? '너' : G.aggro.name}!`, t: G.t };
  } else if (G.aggroT <= 0) {
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
    const face = RW ? War.raidTarget() : G.aggro && !G.aggro.down ? G.aggro : p;
    // (Not at a hero gone 투명: the bolt finds someone it can see.)
    const pool = bodies().filter(x => x !== face && !(x === p && G.buffs.stealth > G.t));
    const tgt = pool.length ? pool[Math.floor(Math.random() * pool.length)] : face;
    b.lunge = 0.2;
    addShot(b, tgt, { color: '#c02838', glow: '#ff6a5a', size: 5, speed: 300, onHit: () => {
      const k = 0.12 * raidK() * (G.enraged ? 1.3 : 1);
      if (tgt === p) hurtPlayer(p.maxHp * k, b, true); else if (!tgt.down) hurtMember(tgt, tgt.maxHp * k, b);
      if (!RW || fxBudget('volley', 4)) addFx(G.stage.fx, tgt.x, tgt.y - 20, { scale: 0.45 });
    } });
  }
  G.blastT = (G.blastT === undefined ? 12 : G.blastT) - dt;
  if (G.blastT <= 0 && !G.blast) {
    // 공대: enraged, its blasts come twice as often (and the raiders no longer cut them).
    G.blastT = [15, 12, 10][G.phase] * (RW && G.enraged ? 0.5 : 1);
    G.blast = { at: G.t + 1.6 };
    b.bubble = { text: '모두 쓸어 주마!', t: G.t };
    say(`${G.boss.name}이(가) 힘을 모읍니다! (광역기)`, 'warn');
    banner('광역기 준비! 마비로 끊어라');
  }
  if (G.blast && G.t >= G.blast.at) {
    G.blast = null;
    G.shake = Math.max(G.shake, 0.35);
    audio.play('boss');
    for (const x of bodies()) {
      const k = 0.26 * raidK() * (G.enraged ? 1.3 : 1);
      if (!RW || (Math.abs(x.x - p.x) < VW / 2 && Math.abs(x.y - p.y) < VH / 2 && fxBudget('blast', 8))) addFx(G.stage.fx, x.x, x.y - 20, { scale: 0.6 });
      if (x === p) hurtPlayer(p.maxHp * k, b, true); else hurtMember(x, x.maxHp * k, b);
    }
    G.groupHeal = G.t;
    say('광역기가 파티를 덮쳤습니다!', 'warn');
  }
  G.raidT -= dt;
  // One pattern at a time: a pattern of several waves runs out before the next begins.
  if (G.raidT <= 0 && !(G.t < (G.seqTill || 0))) {
    G.raidT = [4, 3.2, 2.4][G.phase] * (G.enraged ? 0.7 : 1) * (G.frenzy ? 0.85 : 1);
    raidPattern(b, pickPattern());
  }
}

/**
 * The boss marks tiles in red; a moment later they are struck. Step off them.
 * The common blows (십자·숨결·비·고리·유성·불기둥) every raid may use, and each boss's own: a charge it
 * runs along, a pounce, rings of force going out, three heads in turn, a curse that follows, a
 * sweeping tide, fire rising in turn, a floor with a few safe spots … Several waves come one after
 * another, each shown only when the one before falls, each with its own warning.
 */
const PATTERN_NAMES = {
  cross: '십자 화염', breath: '화염 숨결', rain: '저주의 비', ring: '혼의 고리', meteor: '유성 낙하', plus: '불기둥',
  charge: '돌진', stampede: '연속 돌진', trample: '짓밟기',
  pounce: '덮치기', cloud: '근두운', claw: '할퀴기',
  quake: '방망이 충격파', stomp: '대지 진동', flare: '화염 폭발',
  sparks: '도깨비불', thunder: '낙뢰',
  heads: '세 머리 숨결', heads3: '삼두 화염',
  hunt: '쫓는 저주', drought: '가뭄의 손길',
  safe: '혼의 결계', ward: '괴수의 영역', eye: '태풍의 눈', seal: '봉인진',
  whirl: '소용돌이', tide: '해일', sweep: '타계의 물결',
  pillars: '불기둥 연쇄', lava: '불바다',
  staff: '여의봉', clones: '분신술',
  xslash: '십자 검기', iai: '발도 일섬',
};
// The boss's own blows that share another's shape (by name only).
const PATTERN_AS = { trample: 'charge', cloud: 'pounce', stomp: 'quake', flare: 'quake', thunder: 'sparks', drought: 'hunt', ward: 'safe', sweep: 'tide' };
const COMMON_PATTERNS = ['cross', 'breath', 'rain', 'ring', 'meteor', 'plus'];

/** The next blow: the raid's own list, more as its phases go (patterns1, patterns2); its own blows twice as often. */
function pickPattern() {
  const st = G.stage, pool = [];
  const add = list => { for (const k of list || []) pool.push(...Array(COMMON_PATTERNS.includes(k) ? 1 : 2).fill(k)); };
  add(st.patterns);
  if (G.phase >= 1) add(st.patterns1);
  if (G.phase >= 2) add(st.patterns2);
  // Not the same twice running, if there is another.
  const other = pool.filter(k => k !== G.lastPattern);
  const list = other.length ? other : pool;
  return G.lastPattern = list[Math.floor(Math.random() * list.length)];
}

/** Whom the boss aims at: whom it has turned on (공대: the raid's target). */
function raidAim() {
  return G.war && (G.war.raid || G.stage.jaeng) ? War.raidTarget() || G.player : G.aggro && !G.aggro.down ? G.aggro : G.player;
}

/** The four ways, the one leading most from a toward c. */
function wayTo(a, c) {
  const dx = c.tx - a.tx, dy = c.ty - a.ty;
  return Math.abs(dx) >= Math.abs(dy) ? [Math.sign(dx) || 1, 0] : [0, Math.sign(dy) || 1];
}

function raidPattern(b, kind, follow = false) {
  const base = PATTERN_AS[kind] || kind, ph = G.phase;
  b.bubble = { text: (PATTERN_NAMES[kind] || '') + '!', t: G.t };
  // A boss's own blow is named on the screen the first time it comes.
  if (!COMMON_PATTERNS.includes(kind)) {
    G.patSeen = G.patSeen || {};
    if (!G.patSeen[kind]) { G.patSeen[kind] = true; banner(`${G.boss.name} · ${PATTERN_NAMES[kind]}`); }
  }
  const waves = [];
  const sq = (cx, cy, r, out = [], hole = -1) => {
    for (let x = -r; x <= r; x++) for (let y = -r; y <= r; y++) if (Math.max(Math.abs(x), Math.abs(y)) > hole) out.push([cx + x, cy + y]);
    return out;
  };
  // A line out at an angle, from r0 to r1 tiles.
  const ray = (cx, cy, a, r0, r1, out = []) => {
    for (let s = r0; s <= r1; s += 0.5) out.push([Math.round(cx + Math.cos(a) * s), Math.round(cy + Math.sin(a) * s)]);
    return out;
  };
  if (base === 'cross' || base === 'breath' || base === 'rain' || base === 'ring' || base === 'meteor' || base === 'plus') {
    waves.push(() => commonTiles(b, base, raidAim()));
  } else if (base === 'charge' || base === 'stampede') {
    // It lowers its head toward its mark and runs the line, past where they stood (짓밟기: three wide).
    // (연속 돌진: three runs, each from where the last ended, at whoever it faces then.)
    const runs = base === 'stampede' ? 3 : kind === 'trample' && ph >= 2 ? 2 : 1;
    for (let i = 0; i < runs; i++) waves.push(() => {
      const t = raidAim(), [dx, dy] = wayTo(b, t), d = Math.abs(t.tx - b.tx) + Math.abs(t.ty - b.ty);
      // It runs to where its mark stood (the line goes two past), not on into the back ranks.
      const L = Math.max(5, Math.min(11, d + 2)), run = Math.max(3, Math.min(L, d)), tiles = [], wide = kind === 'trample' ? 1 : 0;
      for (let k = 1; k <= L; k++) for (let w = -wide; w <= wide; w++) tiles.push([b.tx + dx * k + dy * w, b.ty + dy * k + dx * w]);
      return { tiles, fall: () => bossLeap(b, b.tx + dx * run, b.ty + dy * run, 0.3) };
    });
  } else if (base === 'pounce') {
    // It springs onto its mark (a 3×3 where they stand), then swipes all round where it lands.
    waves.push(() => {
      const t = raidAim(), cx = t.tx, cy = t.ty;
      return { tiles: sq(cx, cy, 1), fall: () => bossLeap(b, cx, cy, 0.25) };
    });
    waves.push(() => ({ tiles: sq(b.tx, b.ty, ph >= 1 ? 2 : 1, [], 0) }));
  } else if (base === 'claw') {
    // Three claw marks across its mark, one tile apart, the long way across the boss's line.
    const n = ph >= 2 ? 2 : 1;
    for (let i = 0; i < n; i++) waves.push(() => {
      const t = raidAim(), [dx, dy] = wayTo(b, t), tiles = [], off = i ? 1 : 0;
      for (const o of [-2, 0, 2]) for (let k = -5; k <= 5; k++) tiles.push([t.tx + dx * (o + off) + dy * k, t.ty + dy * (o + off) + dx * k]);
      return tiles;
    });
  } else if (base === 'quake') {
    // Rings of force going out from the boss, one after the other (two, four, six tiles out; a
    // fourth at eight when it is fierce): step over each, or in behind it.
    // (화염 폭발 and 대지 진동 come on top of the late phase's other blows: three rings, never four.)
    const rings = ph >= 2 && kind === 'quake' ? 4 : 3;
    for (let i = 0; i < rings; i++) waves.push(() => sq(b.tx, b.ty, 2 * i + 2, [], 2 * i + 1));
  } else if (base === 'sparks') {
    // A small cross under several of the party at once (spread out!); 낙뢰 strikes twice, following.
    const n = kind === 'thunder' ? 2 : 1;
    for (let i = 0; i < n; i++) waves.push(() => {
      const near = partyBodies().filter(x => Math.abs(x.tx - b.tx) + Math.abs(x.ty - b.ty) < 14);
      const aim = raidAim(), picks = [aim];
      while (picks.length < 2 + ph && near.length) {
        const x = near.splice(Math.floor(Math.random() * near.length), 1)[0];
        if (!picks.includes(x)) picks.push(x);
      }
      const tiles = [];
      for (const x of picks) tiles.push(...plusTiles(x.tx, x.ty, 1));
      return tiles;
    });
  } else if (base === 'heads' || base === 'heads3') {
    // Three heads, three ways. 세 머리 숨결: one after another (toward its mark, then the two sides
    // in turn); 삼두 화염: all three at once, only behind it is clear.
    const [dx, dy] = wayTo(b, raidAim()), s = Math.random() < 0.5 ? 1 : -1;
    const ways = [[dx, dy], [dy * s, dx * s], [-dy * s, -dx * s]];
    if (base === 'heads3') waves.push(() => ways.flatMap(([x, y]) => triTiles(b.tx, b.ty, x, y, 3)));
    else for (const [x, y] of ways) waves.push(() => triTiles(b.tx, b.ty, x, y, 4));
  } else if (base === 'hunt') {
    // A curse that follows its mark: three times, wherever they stand by then.
    for (let i = 0; i < 3; i++) waves.push(() => {
      const t = raidAim(), tiles = sq(t.tx, t.ty, 1);
      for (let j = 0; j < 2 + ph; j++) tiles.push([t.tx + Math.floor(rand(-4, 5)), t.ty + Math.floor(rand(-4, 5))]);
      return tiles;
    });
  } else if (base === 'safe') {
    // All the floor round the boss red but a few spots (one each corner way) and the far edge.
    waves.push(() => {
      const R = 4, tiles = [], holes = new Set();
      for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const hx = b.tx + sx * (2 + Math.floor(rand(0, 2))), hy = b.ty + sy * (2 + Math.floor(rand(0, 2)));
        for (const [x, y] of sq(hx, hy, 1)) holes.add(x + ',' + y);
      }
      for (const t of sq(b.tx, b.ty, R)) if (!holes.has(t[0] + ',' + t[1])) tiles.push(t);
      return tiles;
    });
  } else if (base === 'eye') {
    // A storm round its mark: a band all round, calm only in its eye and outside.
    waves.push(() => { const t = raidAim(); return sq(t.tx, t.ty, 4, [], 1); });
    if (ph >= 2) waves.push(() => { const t = raidAim(); return sq(t.tx, t.ty, 2); });
  } else if (base === 'seal') {
    // A seal of rings about the boss: the inner circle (step out), then the band round it (step back in).
    waves.push(() => sq(b.tx, b.ty, 2));
    waves.push(() => sq(b.tx, b.ty, 4, [], 2));
  } else if (base === 'whirl') {
    // Four arms turning about the boss, wave by wave.
    const a0 = Math.random() * Math.PI / 2, turn = (Math.random() < 0.5 ? 1 : -1) * Math.PI / 8;
    for (let i = 0; i < 3; i++) waves.push(() => {
      const tiles = [];
      for (let k = 0; k < 4; k++) ray(b.tx, b.ty, a0 + turn * i + k * Math.PI / 2, 1.5, 7, tiles);
      return tiles;
    });
  } else if (base === 'tide') {
    // A wall of water sweeping out from the boss toward its mark, two rows a wave: step back into
    // the row that has just broken.
    const [dx, dy] = wayTo(b, raidAim()), cx = raidAim(), mid = dx ? cx.ty : cx.tx;
    for (let i = 0; i < 4; i++) waves.push(() => {
      const tiles = [];
      for (const k of [2 + 2 * i, 3 + 2 * i]) for (let w = -8; w <= 8; w++)
        tiles.push(dx ? [b.tx + dx * k, mid + w] : [mid + w, b.ty + dy * k]);
      return tiles;
    });
  } else if (base === 'pillars') {
    // Fire rising in turn: three pillars a wave where its mark stands then, and about it.
    for (let i = 0; i < 3; i++) waves.push(() => {
      const t = raidAim(), tiles = [];
      for (const [cx, cy] of [[t.tx, t.ty], [t.tx + Math.floor(rand(-4, 5)), t.ty + Math.floor(rand(-4, 5))], [t.tx + Math.floor(rand(-4, 5)), t.ty + Math.floor(rand(-4, 5))]])
        tiles.push(...plusTiles(cx, cy, 1));
      return tiles;
    });
  } else if (base === 'lava') {
    // The floor about its mark burns in a checker of 2×2, then the other squares.
    const t = raidAim(), cx = t.tx, cy = t.ty;
    for (const odd of [0, 1]) waves.push(() => sq(cx, cy, 3).filter(([x, y]) => ((Math.floor(x / 2) + Math.floor(y / 2)) & 1) === odd));
  } else if (base === 'staff') {
    // 여의봉 grows and falls along its line, then swings across where it fell.
    const t0 = raidAim(), [dx, dy] = wayTo(b, t0);
    const d = Math.max(4, Math.min(10, Math.abs(t0.tx - b.tx) + Math.abs(t0.ty - b.ty)));
    waves.push(() => {
      const tiles = [];
      for (let k = 1; k <= 14; k++) tiles.push([b.tx + dx * k, b.ty + dy * k]);
      return tiles;
    });
    waves.push(() => {
      const tiles = [], cx = b.tx + dx * d, cy = b.ty + dy * d;
      for (let k = -7; k <= 7; k++) for (const w of [0, 1]) tiles.push([cx + dy * k + dx * w, cy + dx * k + dy * w]);
      return tiles;
    });
  } else if (base === 'clones') {
    // Hairs blown into copies about its mark: each strikes a cross about itself, two and two.
    const t = raidAim(), spots = [];
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 2 * i + rand(-0.4, 0.4), r = rand(3, 5);
      spots.push([Math.round(t.tx + Math.cos(a) * r), Math.round(t.ty + Math.sin(a) * r)]);
    }
    for (const pair of [[spots[0], spots[2]], [spots[1], spots[3]]]) waves.push(() => {
      const tiles = [];
      for (const [x, y] of pair) tiles.push(...plusTiles(x, y, 3));
      return tiles;
    });
  } else if (base === 'xslash') {
    // Cuts like an ✕ across its mark, then a ✚ (and an ✕ again when it is fierce).
    const t = raidAim(), cx = t.tx, cy = t.ty;
    const X = () => { const o = [[cx, cy]]; for (let k = 1; k <= 5; k++) o.push([cx + k, cy + k], [cx - k, cy - k], [cx + k, cy - k], [cx - k, cy + k]); return o; };
    waves.push(X);
    waves.push(() => plusTiles(cx, cy, 6));
    if (ph >= 2) waves.push(X);
  } else if (base === 'iai') {
    // One cut from far off along a whole row through its mark, then the column.
    const t = raidAim();
    for (const horiz of Math.random() < 0.5 ? [1, 0] : [0, 1]) waves.push(() => {
      const t2 = raidAim(), tiles = [];
      for (let k = -12; k <= 12; k++) tiles.push(horiz ? [t2.tx + k, t.ty] : [t.tx, t2.ty + k]);
      return tiles;
    });
  } else {
    waves.push(() => commonTiles(b, 'cross', raidAim()));
  }
  // The fierce boss strings a common blow on after its own (a third phase or the enrage).
  const more = !follow && (ph >= 2 || G.enraged) && !COMMON_PATTERNS.includes(kind) && Math.random() < 0.3;
  G.seqTill = G.t + 20;
  raidSeq(b, waves, () => {
    if (more) {
      const list = (G.stage.patterns || []).filter(k => COMMON_PATTERNS.includes(k)); // (a hunting ground's boss has no list)
      raidPattern(b, list.length ? list[Math.floor(Math.random() * list.length)] : 'meteor', true);
      return;
    }
    // A blow of several waves takes the time of more than one: the next waits a while after it.
    G.seqTill = G.t + 0.4;
    if (waves.length > 1) G.raidT = Math.max(G.raidT, [4, 3.2, 2.4][G.phase] * (G.enraged ? 0.7 : 1) * 0.6);
  });
}

/** The common blows' tiles, at its mark p. */
function commonTiles(b, kind, p) {
  const tiles = [], add = (x, y) => tiles.push([x, y]);
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
  return tiles;
}

/**
 * A pattern's waves, one after another: each is laid (its tiles worked out then, at whoever the
 * boss faces then) when the one before falls, with its own full warning; done after the last.
 * A wave gives its tiles, or { tiles, fall } with what happens as it falls (the boss's own run).
 */
function raidSeq(b, waves, done) {
  let i = 0;
  const next = () => {
    if (!(b.hp > 0) || G.over || G.cleared) { G.seqTill = 0; return; }
    if (i >= waves.length) { if (done) done(); return; }
    const r = waves[i](), o = Array.isArray(r) ? { tiles: r } : r;
    raidMark(b, o.tiles, i, () => { if (o.fall) o.fall(); next(); });
    i++;
  };
  next();
}

/** One wave of red: off the arena's edge it is not laid; the warning as long as stepping off needs. */
function raidMark(b, raw, nth, onFall) {
  const seen = new Set(), tiles = [];
  const W = G.war && (G.war.raid || G.stage.jaeng) ? G.war : null;
  for (const [x, y] of raw) {
    const k = x + ',' + y;
    if (seen.has(k)) continue;
    seen.add(k);
    if (W && !War.open(x, y)) continue;
    tiles.push([x, y]);
  }
  // The warning lasts at least as long as a person needs to step off the red at the slowest
  // class's own pace: a moment to see it, a turn, and a step for each tile of the deepest red
  // (a melee hero beside the boss is three tiles inside 혼의 고리; at the third phase's one
  // second it could not get out). A later wave of the same blow is a little quicker, never less.
  const floor = nth ? [1.05, 0.95, 0.9][G.phase] : [1.4, 1.2, 1][G.phase];
  const warn = Math.max(floor, MARK_REACT + MARK_STEP * redDepth(tiles, b));
  // A share of the hero's health, so a robed caster and an armoured warrior fear it alike.
  // (A later wave strikes a little lighter: the blow is several.)
  // (Softened with the bosses' own blows: [0.3, 0.35, 0.4] and later waves 0.8 had the raiders on
  // the high raids struck 25~60% more, 흑술사's raid 57 downs.)
  const share = [0.28, 0.32, 0.36][G.phase] * raidK() * (nth ? 0.7 : 1) * (G.hunt ? Hunt.PACE.share : 1);
  G.marks.push({ tiles, at: G.t + warn, made: G.t, dmg: G.player.maxHp * share, share, onFall });
  b.lunge = 0.3;
}

// How tall a raid boss stands on screen (px): over the heads of the 25 and their spells.
const RAID_BOSS_TALL = 170;

/** The boss runs or springs to (x, y) (the nearest free tile there), in dur seconds. */
function bossLeap(b, x, y, dur) {
  if (!(b.hp > 0)) return;
  const W = G.war && (G.war.raid || G.stage.jaeng) ? G.war : null;
  if (W) { x = Math.max(1, Math.min(W.map.cols - 2, x)); y = Math.max(1, Math.min(W.map.rows - 2, y)); }
  let at = null;
  for (let r = 0; r < 4 && !at; r++)
    for (let dx = -r; dx <= r && !at; dx++)
      for (let dy = -r; dy <= r; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const nx = x + dx, ny = y + dy;
        if ((W && !War.open(nx, ny)) || !free(nx, ny)) continue;
        at = [nx, ny];
        break;
      }
  if (!at || (at[0] === b.tx && at[1] === b.ty)) return;
  leave(b);
  b.fx = b.tx;
  b.fy = b.ty;
  if (at[0] !== b.tx) b.face = at[0] > b.tx ? 1 : -1;
  b.tx = at[0];
  b.ty = at[1];
  occ.set(key(b.tx, b.ty), b);
  b.mt = 0;
  b.dur = dur;
  b.moving = true;
  b.lunge = 0.3;
  shock(b.tx * TILE + TILE / 2, b.ty * TILE + TILE - 6, 2.5);
  G.shake = Math.max(G.shake, 0.45);
}

// A person's moment to see the red and turn (0.45 s and the 0.1 s turn), and the slowest class's
// step (전사·도깨비, speed 66: 0.24 s × 70 / 66).
const MARK_REACT = 0.55, MARK_STEP = 0.255;

/** The most steps any tile of the red needs to its edge (four ways; the boss's own tile is no way out). */
function redDepth(tiles, b) {
  const K = (x, y) => (x + 1000) * 10000 + (y + 1000);
  const red = new Set(tiles.map(([x, y]) => K(x, y)));
  const dist = new Map();
  let q = [];
  for (const [x, y] of tiles) {
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy, k = K(nx, ny);
      if (red.has(k) || (b && nx === b.tx && ny === b.ty)) continue;
      if (G.war && (G.war.raid || G.stage.jaeng) && !War.open(nx, ny)) continue; // the arena's edge is no way out
      if (!dist.has(K(x, y))) { dist.set(K(x, y), 1); q.push([x, y]); }
    }
  }
  let d = q.length ? 1 : 0;
  while (q.length) {
    const nq = [];
    for (const [x, y] of q) for (const [dx, dy] of DIRS) {
      const k = K(x + dx, y + dy);
      if (!red.has(k) || dist.has(k)) continue;
      dist.set(k, d + 1);
      nq.push([x + dx, y + dy]);
    }
    if (nq.length) d++;
    q = nq;
  }
  return d;
}

/** Marked tiles fall due: the hero standing on one is struck. */
function raidMarks() {
  const p = G.player;
  // 경공 2단계 (이동속도 +20%): the red falls on the hero a moment after the rest.
  const grace = heroMove().lvl >= 2 ? 0.2 : 0;
  for (const mk of G.marks) {
    if (mk.done || G.t < mk.at) continue;
    if (!mk.fell) {
      mk.fell = true;
      partyMarks(mk);
      // The next wave of the same blow is laid as this one falls (raidSeq).
      if (mk.onFall) mk.onFall();
    }
    if (G.t < mk.at + grace) continue;
    mk.done = true;
    if (!G.dead && mk.tiles.some(([x, y]) => x === p.tx && y === p.ty)) {
      p.inv = 0;
      hurtPlayer(mk.dmg, null, true);
      say('붉은 칸에 맞았습니다!', 'warn');
      if (G.war && G.war.stat) G.war.stat.heroHits = (G.war.stat.heroHits || 0) + 1;
    }
  }
  G.marks = G.marks.filter(mk => !mk.done);
}

/** A mark falls on the party (and shows): the raiders on its tiles are struck. */
function partyMarks(mk) {
  G.shake = Math.max(G.shake, 0.2);
  const fx = M.fx['new_' + G.stage.id] ? 'new_' + G.stage.id : G.stage.fx;
  mk.tiles.filter((_, i) => i % Math.max(1, Math.floor(mk.tiles.length / 10)) === 0).forEach(([x, y]) =>
    addFx(fx, x * TILE + TILE / 2, y * TILE + TILE / 2, { scale: 0.7 }));
  // The red floor is the boss's blow, but one that could be stepped off: not counted as tanking.
  const boss = G.enemies.find(e => e.kind === 'boss'), floor = { kind: 'boss', floor: true, name: boss ? boss.name : G.stage.name, m: boss && boss.m };
  for (const m of (G.stage.jaeng ? War.jaengBodies() : G.party)) if (!m.down && mk.tiles.some(([x, y]) => x === m.tx && y === m.ty)) {
    hurtMember(m, m.maxHp * mk.share, floor);
    if (G.war) G.war.stat.markHits++;
  }
}

/** 계속 사냥: the field keeps growing (40 and half a monster more each second, to 220), a
 *  champion pack every minute; monsters already grow tougher with time. */
function endlessSpawn(dt) {
  // 사냥 기믹 소탕: the fullest field at once, for two and a half minutes.
  if (G.endEnd && G.t >= G.endEnd && !G.over) {
    sweepField();
    G.endEnd = 0;
    later(3, () => { if (G && !G.over && !G.dead) showResults(`${G.stage.name} 소탕 완료`); });
    return;
  }
  const t = G.t, floor = G.endEnd !== undefined ? Math.min(220, 90 + (t - G.clearT) * 2) : Math.min(FIELD_MAX, 40 + (t - G.clearT) * 0.5);
  G.spawnT -= dt;
  if (G.spawnT <= 0) {
    G.spawnT = 0.5;
    for (let i = 0; i < 3 && G.enemies.length < floor; i++) addEnemy(pickMonster(Math.random() < 0.3));
  }
  if (t >= G.endlessChamp) {
    G.endlessChamp = t + (G.endEnd ? 30 : 60);
    const m = pickMonster(true), pack = ++G.packs;
    for (let i = 0; i < 3; i++) addEnemy(m, 'champ', { name: '챔피언', scale: 1.15 }, pack);
    say('챔피언 무리가 나타났습니다!', 'warn');
  }
}

// 바람의나라 연's monsters show a red "!" over their heads when they first turn on the hero, and now
// and then one shouts as it comes. Only a few at a time (a crowd of "!" hides the crowd): one a
// quarter second, four up at once; a shout every twelve seconds at most. Not in raids or wars.
const SPAWN_SHOUTS = ['크르르…', '침입자다!', '어딜 감히!', '꼼짝 마라!', '가만두지 않겠다!', '여기서 끝이다!'];
function noticeHero(e, p) {
  if (e.noticed || e.ally || e.war || G.stage.raid || G.war || e.march || e.flee) return;
  if (Math.abs(e.tx - p.tx) + Math.abs(e.ty - p.ty) > 7) return;
  e.noticed = true;
  if (G.t - (G.alertLast || -9) < 0.25 || G.enemies.filter(o => o.alertAt && G.t - o.alertAt < 0.9).length >= 4) return;
  G.alertLast = G.t;
  e.alertAt = G.t;
  if (G.t - (G.shoutLast || -20) > 12 && Math.random() < 0.3 && !e.bubble) {
    G.shoutLast = G.t;
    e.bubble = { text: e.kind === 'boss' || e.kind === 'mini' ? '감히 여기까지 오다니!' : SPAWN_SHOUTS[Math.floor(Math.random() * SPAWN_SHOUTS.length)], t: G.t + 0.3 };
  }
}

/** The red "!" over a monster that has just seen the hero: it pops in, bobs, and fades. */
function drawAlert(x, y, age) {
  if (age < 0 || age > 0.9 || !settings.bubbles) return;
  const pop = Math.min(1, age / 0.1), s = 0.7 + 0.3 * pop + (age < 0.18 ? 0.25 * Math.sin(age / 0.18 * Math.PI) : 0);
  ctx.save();
  ctx.globalAlpha = age < 0.7 ? 1 : (0.9 - age) / 0.2;
  ctx.translate(Math.round(x), Math.round(y - 4 * Math.sin(Math.min(1, age / 0.3) * Math.PI)));
  ctx.scale(s, s);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath(); ctx.arc(0, -9, 9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e8262a';
  ctx.beginPath(); ctx.arc(0, -9, 7.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-3, 0); ctx.lineTo(3, 0); ctx.lineTo(0, 5); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillRect(-1.5, -14.5, 3, 7);
  ctx.fillRect(-1.5, -5.5, 3, 2.5);
  ctx.restore();
}

function spawn(dt) {
  if (G.war && !G.war.raid) return G.stage.jaeng ? War.bossTick(dt) : undefined; // 대항전 (war.js): the guilds are the field; 「쟁」: its boss
  if (G.dummy) return; // a test's lone boss (window.__dummyBoss)
  if (G.endless) {
    endlessSpawn(dt);
    return;
  }
  if (G.stage.raid) {
    raidSpawn(dt);
    raidMarks();
    return;
  }
  // 사냥 기믹 (hunt.js): 토벌도, the three acts and the boss's fight (not with legacyPace).
  if (G.hunt) {
    Hunt.spawn(dt);
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
      if (press > (G.press || 0)) Hunt.note('press' + press);
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
      Hunt.note('champ');
      if (Math.random() < 0.6) emote('surprise');
    }
    if (G.minis.length && t >= G.minis[0] && addEnemy(G.mini.m, 'mini', G.mini)) {
      G.minis.shift();
      for (let i = 0; i < 3; i++) addEnemy(pickMonster(), 'minion');
      say(`${josa(G.mini.name, '이', '가')} 나타났습니다!`, 'warn');
      banner(`${G.mini.name} 등장`);
      Hunt.note('mini');
    }
    if (G.events.length && t >= G.events[0].at) huntEvent(G.events.shift().kind);
  }
  if (G.bossDue && t >= BOSS_AT) {
    // The field calms for the boss.
    while (G.enemies.length > 25) {
      const e = G.enemies.find(x => !x.kind);
      if (!e) break;
      G.enemies.splice(G.enemies.indexOf(e), 1);
      leave(e);
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
    Hunt.note('boss');
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
  Hunt.note('event:' + kind);
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
  const c = Math.min(1, (G.hunt ? Hunt.clock() : G.t) / (BOSS_AT * 0.9));
  const r = Math.min(1, Math.max(0, c + (Math.random() - 0.7) * 0.5));
  return G.pool[Math.round(r * (G.pool.length - 1))];
}

function addEnemy(m, kind = null, named = null, pack = 0, spot = null) {
  const at = spot || ringTile(kind === 'boss' || kind === 'mini');
  if (!at) return null;
  // 사냥 기믹: the monsters grow with the 토벌도 and the act, not the clock.
  const t = G.hunt ? Hunt.clock() : G.t;
  // Monsters toughen with time: x2.5 by 5:00 (matched to spells growing 15% a 단).
  // A ground may be eased a little (stage.ease, e.g. 흉가: its 99-level monsters were a wall).
  const ease = G.stage.ease || 1;
  const tough = (1 + G.level * 0.1) * (G.hunt ? Hunt.tough() : 1 + t / 133) * (G.cleared ? 1.5 : 1) * ease;
  const rank = kind ? 1 : m.rank;
  // On a ground of big monsters a big one is no tougher than the others' biggest.
  const area = G.stage.big ? Math.min(m.area, 5200) : m.area;
  let hp = (6 + area / 70) * tough;
  // Elites as in D2 Survivors: champions ×8 life, ×1.5 damage, ×3 experience; a named leader
  // ×12, ×1.25, ×5; followers ×2 life.
  const base = hp;
  if (kind === 'champ') hp = base * 8;
  if (kind === 'minion') hp = base * 2;
  if (kind === 'mini') hp = Math.max(base * 12, (70 + area / 10) * tough * 2);
  if (kind === 'boss') hp = (180 + area / 5) * tough * 4;
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
  e.stepTime *= tp.step * (pactOn('swift') ? 0.83 : 1) * (G.hunt ? Hunt.stepK() : 1);
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
  if (G.arena) { const f = Hunt.flowDirs(b, tx, ty); if (f) return f; } // 사냥 기믹: round the map's walls
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
  return !!(settings.pacts && settings.pacts[id]) || !!(G && G.pacts && G.pacts[id]); // 사냥 기믹: a pact taken at the 갈림길
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
  // 연's darting kinds (its MoveSpeed 128 and up: riders, wolves, birds) are fierce twice as often.
  const fierce = Math.min(0.3, 0.05 + lv * 0.02) * (m.quick ? 2 : 1);
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
    if (e.war) continue; // 대항전: war.js moves its fighters
    advance(e, dt);
    e.flash = Math.max(0, e.flash - dt);
    e.lunge = Math.max(0, e.lunge - dt);
    e.slow = Math.max(0, e.slow - dt);
    e.stun = Math.max(0, e.stun - dt);
    e.curse = Math.max(0, e.curse - dt);
    if (e.st) tickStatus(e);
    if (e.hp <= 0) continue;
    // 수련장's dummy stands where it is put and strikes no one; its life never runs down.
    if (e.still) {
      if (e.hp < e.maxHp * 0.5) e.hp = e.maxHp;
      continue;
    }
    if ((e.goal || e.hunt) && G.hunt && !e.stun && Hunt.move(e)) continue; // 사냥 기믹: the objective's monsters
    // 공대: twenty-five can hold a boss for ever; a raid's boss shakes a hold off within 1.2 s and
    // cannot be held again for four more (its blast is still cut by the hold that lands).
    if (e.kind === 'boss' && e.stun > 0 && G.war && (G.war.raid || G.stage.jaeng)) {
      if (G.t < (e.stunFree || 0) && !e.stunned) e.stun = 0;
      else if (!e.stunned) { e.stun = Math.min(e.stun, 1.2); e.stunned = true; e.stunFree = G.t + e.stun + 4; }
      else e.stun = Math.min(e.stun, e.stunFree - 4 - G.t);
    }
    if (e.stun <= 0) e.stunned = false;
    noticeHero(e, p);
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
    if (G.stage.jaeng) { War.mobAct(e, dt); continue; } // 「쟁」 (war.js): every guild is its prey
    if (!(G.war && G.war.raid) && (Math.abs(e.tx - p.tx) > v.w + 4 || Math.abs(e.ty - p.ty) > v.h + 4)) {
      // Left far behind: come back from the edge of the screen. Champions, leaders and the
      // boss too: they hunt the hero rather than wait somewhere off the map.
      const at = ringTile(e.kind === 'boss' || e.kind === 'mini');
      if (at) {
        leave(e);
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
          if (m.down || m.hidden > G.t) continue; // (a companion gone 투명 is not seen)
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
          // A 공대 raider's life is in the raid's measure: a servant's bite as the share it takes of
          // a hero of the raid's level (war.js), whatever the class the player came as.
          hurtMember(tgt, e.kind === 'boss' && G.stage.raid ? tgt.maxHp * 0.16 * raidK() : tgt.war ? tgt.maxHp * e.dmg * 0.8 / War.raidHeroHp() : e.dmg * 0.8, e);
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
        // Only the tile's holder bites; the others pressed in on its tile lunge for show. The heap
        // round the hero is a sight and a target, not three times the bites (at 0.6 a ring of
        // heaps bit 2.2 times as hard and swarmed the casters, 천인 dying on 왕초보).
        if (occ.get(key(e.tx, e.ty)) === e) hurtPlayer(e.dmg, e);
      }
      continue;
    }
    if (e.cd > 0) continue;
    const st = e.stepTime * (e.slow > 0 ? 2 : 1);
    // Not in step with each other: a crowd that moves like one block looks stiff.
    e.cd = st * (0.85 + Math.random() * 0.35);
    const calm = e.temper === 'timid' && !e.provoked && Math.abs(e.tx - p.tx) + Math.abs(e.ty - p.ty) > TEMPERS.timid.sight;
    // 투명: a boss or its lieutenant holds its ground, looking about (it does not walk off and leave
    // the hero striking air); the rest wander off.
    if (hidden && (e.kind === 'boss' || e.kind === 'mini') && !G.dead) continue;
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
    leave(e);
    if (e.flee) say('보물을 지닌 몬스터가 달아났습니다.');
  }
}

/** 차폐: monsters next to the hero cannot touch them while it holds. */
function barred(e) {
  return G.skills.some(s => SKILLS[s.id].kind === 'aura');
}

function hurtPlayer(dmg, from = null, pierce = false) {
  if (G.hunt && !G.dead && !(G.player.inv > 0)) { Hunt.hurtTaken(dmg); Hunt.hurtBy(from); } // 사냥 기믹: 받은 피해, 정예 속성
  const p = G.player;
  if (G.buffs.guard > G.t || p.inv > 0) return;
  // 방어: a share of each blow, not a flat amount (taken off flat, a good shield turned every
  // monster's bite into 1): 10 cuts a third, 20 half, never more than 70%.
  // A raid boss's blows are measured on the hero's life and go through armor.
  const ac = pierce || (from && from.kind === 'boss' && G.stage.raid) ? 0 : Math.max(0, p.armor + 2 * G.passives.armor);
  // 공대: the boss of a raid of twenty-five strikes harder (war.js raidHurt; a little less on the hero).
  if (G.war && (G.war.raid || G.stage.jaeng) && (pierce || (from && from.kind === 'boss'))) dmg *= War.raidHeroHurt();
  let taken = Math.max(1, dmg * Math.max(0.3, 20 / (20 + ac)));
  if (G.buffs.shield > G.t) taken = Math.max(1, taken / 2);
  // 절망 on the attacker weakens its blow; 저주 on the hero lets more through; 현무의 철옹's ward.
  if (from && from.st && from.st.despair && from.st.despair.until > G.t) taken *= 0.7;
  if (p.sts && heroStatusOn('curse')) taken *= 1.25;
  if (G.buffs.g_ward > G.t) taken *= 1 - (G.buffs.g_wardK || 0);
  if (G.buffs.ward9 > G.t) {
    // 9차 아우라 (data.js S9: ward); 천신의권역's (zone9 wardHits): so many blows at the first cut, the rest at the second
    const wh = G.ward9Hits && G.ward9Hits.inside && G.ward9Hits.until > G.t ? G.ward9Hits : null;
    taken *= 1 - (wh ? (wh.n++ < wh.at[0] ? wh.at[1] : wh.at[2]) : G.buffs.ward9K || 0);
  }
  // 현무의 철옹's shell: whoever strikes the one in it is pricked back (each attacker twice a second at most).
  const thorn = from && from.m && from.hp > 0 && shellThorns();
  if (thorn && G.t - (from.thornAt || -9) >= 0.5) {
    from.thornAt = G.t;
    if (M.fx.gy_hm_shard && fxBudget('gyway', 4)) fxOn('gy_hm_shard', from, { scale: 1.1 });
    G.procHitting = true;
    hurtEnemy(from, gyeokBase() * thorn.o.thorns);
    G.procHitting = false;
  }
  // A boss, its lieutenant or a champion strikes in its own nature (gyeok.js SOURCE_GYEOK).
  if (from && from.m && (from.kind === 'boss' || from.kind === 'mini' || from.kind === 'champ')) {
    // Not on the first ground, where a new hero learns the hunt; rarer from champions.
    const sg = G.stage.id !== 'novice' && SOURCE_GYEOK[G.stage.id];
    if (sg && Math.random() < (from.kind === 'champ' ? 0.1 : 0.2)) heroStatus(sg.st, from);
  }
  if (from && from.m) gyeokProc('hurt', from);
  if (from && from.m) gearProc('hurt', from);
  // 부조리 (격투가 9차 패시브): a blow of one that strikes in its nature raises the barrier first
  if (from && from.m && (from.kind === 'boss' || from.kind === 'mini' || from.kind === 'champ')) bujori9(null);
  // 보호막 (보조 기술 보호, 호신강기): takes the blow first, as far as it holds.
  if (p.barrier > 0 && G.t < (p.barrierUntil || Infinity)) {
    const a = Math.min(p.barrier, taken);
    p.barrier -= a;
    taken -= a;
    if (taken <= 0) {
      p.inv = 0.25;
      if (G.t - (p.barrierShown || -9) > 0.6) { p.barrierShown = G.t; floatText(p.x, p.y - 64, '흡수', '#9ad8ff'); }
      return;
    }
  }
  // 반탄공: the blow comes back threefold.
  if (from && from.m && G.buffs.reflect > G.t) later(0.05, () => hurtEnemy(from, taken * 3));
  p.hp -= taken;
  // 공대: the hero's share of the blows, counted (not the red floor's: that could be stepped off).
  if (G.war && (G.war.raid || G.stage.jaeng) && !(pierce && !from)) War.heroTaken(taken);
  p.inv = 0.25;
  audio.play('hurt');
  floatText(p.x, p.y - 64, '-' + shownNum(taken), '#ff6060');
  if (p.hp <= 0) die();
}

/** How white a struck body goes: a boss or its lieutenant (a big shape) at 0.45, 번쩍임 줄이기 lower still. */
function hitWhite(b) {
  return (settings.calmFx ? 0.35 : 0.75) * (b.kind === 'boss' || b.kind === 'mini' ? 0.6 : 1);
}
/** At most 14 bodies newly flashing white in any tenth of a second. */
function flashRoom() {
  const f = (G.flashes = (G.flashes || []).filter(t => t > G.t));
  if (f.length >= 14) return false;
  f.push(G.t + 0.1);
  return true;
}

function hurtEnemy(e, dmg, push = null) {
  if (fxHitLog && e && dmg > 0) fxHitLog.push([e.tx, e.ty, SH ? 1 : 0]); // test (보이는 범위 = 맞는 범위)
  if (SH) return SH.hurt(e, dmg, push); // an AI's cast (castAs): its own blow
  e.provoked = true;
  if (e.hp <= 0) return 0;
  if (e.guardT > G.t) return 0; // a boss speaking at its entrance or a phase
  if (G.hunt && Hunt.tryExecute(e)) { hitStop(0.07, 'exec'); return e.maxHp; } // 사냥 기믹: 처형
  // (손맛 예산: a heavy blow on a big one no longer stops the world; only the big moments do.)
  // A struck monster jerks back a little, away from the blow: each hit of a 오중공격 shows.
  const p = G.player;
  e.kickAt = G.t;
  e.kickBig = false;
  e.kdx = push ? push[0] : Math.sign(e.tx - p.tx);
  e.kdy = push ? push[1] : (e.tx === p.tx ? Math.sign(e.ty - p.ty) : 0);
  // The hero's own blows take the armour's lines (items.js GEAR_OPT): 최소 피해 lifts the low end
  // of the roll, 최종 피해 the whole; 치명타 확률·피해 below. A companion's blows are its own.
  const own = !G.allyHitting;
  const lo = own ? Math.min(1.08, 0.9 + GEAR_OPT.floor * opt('floor')) : 0.9;
  if (own && G.coat9 && G.t < G.coat9.win) coatInfect(e); // 묵혈독바르기: a striking skill's blows while it is on
  dmg *= (lo + Math.random() * (1.1 - lo)) * might() * (e.curse > 0 ? 1.4 : 1) * (e.weak || 1)
    * (e.venom9 && e.venom9.until > G.t ? 1 + (e.venom9.k || 0) : 1)
    * (own ? 1 + GEAR_OPT.final * opt('final') : 1)
    * (e.st && e.st.mark && e.st.mark.until > G.t ? 1 + e.st.mark.k : 1)
    * (e.kind === 'boss' || e.kind === 'mini' ? 1 + 0.25 * opt('boss') : 1)
    * ((p.abyssHunt || p.taecho) && !G.allyHitting ? abyssEdge(e) : 1)
    // 태초's first blow (items.js TAECHO_EDGE.fresh): a foe at its full health, never a war's fighter.
    * (p.taecho && own && !G.procHitting && !e.war && e.hp >= e.maxHp ? 1 + TAECHO_EDGE.fresh : 1)
    * (p.judge && own ? 1 + p.judge : 1) // 심판의낫 (items.js JUDGE_EDGE): every foe alike
    * (G.hunt ? Hunt.takeK(e) * (own ? Hunt.react(e) : 1) : 1); // 사냥 기믹: 그로기, 폭주, 속성 반응
  if (!(dmg > 0)) return 0; // never NaN: a monster with NaN life could not die
  // 치명타: one blow in ten lands at 1.8 times, its number large and golden.
  const lucky = Math.random() < 0.1 + (own ? GEAR_OPT.crit * opt('crit') + (G.buffs.crit > G.t ? G.buffs.critK || 0 : 0) : 0);
  if (lucky) dmg *= 1.8 + (own ? GEAR_OPT.critdmg * opt('critdmg') : 0);
  if (G.critProbe) { G.critProbe.n++; if (lucky) G.critProbe.c++; }
  // The 암습's hits (AMBUSH) all show as 치명타 (their weight is already in the blow).
  const crit = lucky || (G.ambushShow > G.t && !G.allyHitting && !G.procHitting);
  if (crit) audio.play('crit');
  // 5차+: a foe felled by the 암습 brings the next 투명 sooner.
  if (G.ambushKill > G.t && e.hp - dmg <= 0) {
    G.ambushKill = 0;
    const sk = G.skills.find(x => SKILLS[x.id].buff === 'stealth');
    if (sk) sk.timer = Math.min(sk.timer, (sk.cdMax || 10) * 0.5);
  }
  tally(e, dmg);
  if (e.capPerSec) {
    // A hunt's boss: no more than its share of life a second, whatever lands on it.
    const sec = Math.floor(G.t);
    if (e.capSec !== sec) { e.capSec = sec; e.capUsed = 0; }
    dmg = Math.min(dmg, e.maxHp * e.capPerSec - e.capUsed);
    if (!(dmg > 0)) return 0;
    e.capUsed += dmg;
  }
  // 대항전 (war.js): 전장 보정 — the hero's blows on fighters are matched to the field's.
  if (e.war || G.stage.jaeng) dmg = War.scale(dmg, e);
  // 공대: the hero's blows past about two raiders' worth a second are scaled down (war.js).
  const RW = G.war && G.war.raid;
  if (RW) dmg = War.raidScale(dmg, e);
  e.hp -= dmg;
  if (G.hunt) Hunt.hurt(e, dmg); // 사냥 기믹: 그로기, the boss's measure
  if (e.groggyT > G.t && e.groggyShown !== e.groggyT) { e.groggyShown = e.groggyT; hitStop(0.08, 'groggy'); } // 그로기의 순간
  // 흡혈 (an armour's line): a share of the hero's own blows back, at most vampCap a second (update).
  if (own && opt('vamp') && !G.procHitting) p.vampAcc = (p.vampAcc || 0) + dmg * GEAR_OPT.vamp * opt('vamp');
  // 흡혈 buff (스킬 2차 개편, data.js drain): straight back, at most 2% of the hero's life a blow.
  if (own && G.buffs.drain > G.t && !G.procHitting && p.hp > 0) p.hp = Math.min(p.maxHp, p.hp + Math.min(p.maxHp * 0.02, dmg * (G.buffs.drainK || 0)));
  // The white flash of the struck, as 연 shows it on the few it strikes: a whole screen struck at
  // once (포효검황, a 필살기) flashed every body white for a blink, a field of white shapes.
  // 수련장: the dummy is struck many times a second; kept white it showed nothing but a white shape.
  // (a big one starts a new white blink no more than three times a second: struck by a crowd of
  // blows it blinked at the rate of the blows, a large white shape strobing)
  const big = e.kind === 'boss' || e.kind === 'mini';
  if (!G.training && (big ? G.t - (e.flashAt ?? -9) >= 0.34 && (e.flashAt = G.t) : e.flash > 0 || flashRoom())) e.flash = 0.12;
  e.shown = G.t;
  if (e.war) War.credit(e, dmg); // 대항전: the hero's contribution
  if (RW || (G.stage.jaeng && !e.war)) War.raidCredit(e, dmg, e.hp <= 0);
  // Numbers as 바람의나라 연 shows them: stacked over the struck, red and large for a crit,
  // orange for a heavy blow, grey for a light one.
  // 합산 숫자 (deep in a streak): a plain monster's ordinary blow adds to one number over the hero.
  if (!crit && settings.numbers && !e.kind && !G.allyHitting && !G.training && G.combo.n >= 10 && G.t - G.combo.t < 3) sumNumber(dmg);
  else if (crit || settings.numbers || G.training) {
    // 연's way: every blow its own line, the lines of a quick burst stacked in a column over
    // the struck (up to eight), white (a 치명타 orange and larger); a companion's blows smaller.
    e.numN = G.t - (e.numT || -9) < 0.7 ? ((e.numN || 0) + 1) % 8 : 0;
    e.numT = G.t;
    if (G.texts.length > 90) G.texts.shift();
    const heavy = dmg >= e.maxHp * 0.35;
    // As 연 shows them, a handful of big numbers at a time, not a wall: past 16 on the field a
    // blow's number takes the place of the smallest showing, or is not shown.
    const nums = G.texts.filter(t => t.num && !t.heal && !t.mana && t.t < 0.9);
    let show = true;
    if (nums.length >= 16) {
      const low = nums.reduce((a, t) => ((t.v || 0) < (a.v || 0) ? t : a), nums[0]);
      if (!crit && (low.v || 0) >= dmg) show = false;
      else G.texts.splice(G.texts.indexOf(low), 1);
    }
    // Over a crowd the numbers of neighbours would print on each other: one that would lands a line up.
    let ny = e.y - e.m.h * e.scale - 8 - e.numN * 17;
    const nt = hitNum(dmg), nw = nt.length * 6;
    for (let k = 0; k < 4 && nums.some(t => Math.abs(t.y - ny) < 13 && Math.abs(t.x - e.x) < (nw + t.text.length * 6) / 2); k++) ny -= 15;
    if (show) G.texts.push({ x: e.x + rand(-2, 2), y: ny, text: nt, t: 0, num: true, v: dmg,
      crit, heavy, ally: !!G.allyHitting, color: crit ? '#ff3a2a' : heavy ? '#ffb43a' : '#d8d8d8' });
  }
  // 연's strike marks on the struck: a claw slash for blade classes, a burst of fire for a
  // 주술사's heavy blow; a crit stops the world for a blink. Budgeted, not on a whole crowd.
  // A close-in fighter's blows carry its own 연 hit flash (meleeMark).
  // (G.quietHit: a 9차 blow whose original shows no hit mark — its own picture is the whole of what is seen)
  const look = !G.allyHitting && !G.procHitting && !G.quietHit && MELEE_LOOK[G.cls.id];
  if (G.quietHit) { /* no mark */ } else if (look && Math.max(Math.abs(e.tx - p.tx), Math.abs(e.ty - p.ty)) <= 2 && M.fx[look.hit]) meleeMark(e, look, crit);
  else if (G.spark && !G.allyHitting && !G.procHitting) {
    // A caster's spell: 연's small spark of its element (fire, lightning, an arrow's, a claw's)
    // on each one struck, a little larger on a crit. Budgeted, not on a whole crowd.
    if (M.fx[G.spark] && G.t - (e.markT || -9) > 0.25 && fxBudget('hit', 12)) {
      e.markT = G.t;
      fxOn(G.spark, e, { scale: (SPARK_SCALE[G.spark] || 0.5) * (crit ? 1.35 : 1), rot: rand(-0.3, 0.3) });
    }
  } else {
    const mark = G.cls.id === 'mage' ? ((crit || dmg >= e.maxHp * 0.35) && 'h_hit_fire')
      : G.cls.id === 'poet' ? null : 'h_hit_tiger';
    if (mark && M.fx[mark] && G.t - (e.markT || -9) > 0.3 && fxBudget('hit', 10)) {
      e.markT = G.t;
      fxOn(mark, e, { scale: mark === 'h_hit_fire' ? 0.38 : crit ? 0.6 : 0.45 });
    }
  }
  // The hero's own blow (not a party member's, a summon's, or a 격's own) may loose a 격.
  if (!G.allyHitting && !G.procHitting) gyeokProc('hit', e);
  // A 치명타 shakes the screen a little (손맛 예산: no longer stops the world).
  if (crit && !G.stage.raid && G.t - (G.critShakeAt ?? -9) > 0.4) {
    G.critShakeAt = G.t;
    G.shake = Math.max(G.shake, 0.08);
  }
  if (e.hp <= 0) killEnemy(e);
  else audio.play('hit');
  return dmg;
}

/**
 * 공대 (war.js): an AI raider's blow on a monster — taken as from a companion, without the hero's
 * own might, crits or 격; its number small and grey, over the struck when it is in view.
 */
function allyStrike(e, dmg, shown) {
  if (!(e.hp > 0) || e.guardT > G.t) return 0;
  e.provoked = true;
  dmg *= (e.curse > 0 ? 1.4 : 1) * (e.weak || 1) * (e.st && e.st.mark && e.st.mark.until > G.t ? 1 + e.st.mark.k : 1);
  if (!(dmg > 0)) return 0;
  e.hp -= dmg;
  e.flash = 0.12;
  e.shown = G.t;
  if (shown && settings.numbers && G.texts.length < 40 && G.t - (e.allyNumT || -9) > 0.12) {
    e.allyNumT = G.t;
    e.numN = G.t - (e.numT || -9) < 0.7 ? ((e.numN || 0) + 1) % 8 : 0;
    e.numT = G.t;
    G.texts.push({ x: e.x + rand(-6, 6), y: e.y - e.m.h * e.scale - 8 - e.numN * 17, text: hitNum(dmg), t: 0, num: true, ally: true, color: '#d8d8d8' });
  }
  if (e.hp <= 0) {
    G.allyHitting = true;
    killEnemy(e);
    G.allyHitting = false;
  }
  return dmg;
}

// ---------------------------------------------------------------- 근접 타격감 (바람의나라 연)
// 연's close-in fighters throw white slash arcs over what they strike and a flash on each one
// struck. Each class has its own pair out of 연's client (tools/yeon_hud.py, fx h_ml_*):
//   slash — over the struck tile, turned along the blow (Bookchun_Slash, Thief_BackAttack_Hit,
//           Lancer_F_02_Hit, Monk_ConsecutivePunch, Fighter_BodyCheck_Hit_Up, Reaper_WindSlash_Hit3)
//   hit   — a small flash on each monster struck (Fighter_BodyCheck_Hit_Up, 0026_Break_Hit, ...)
// Budgeted: a crowd of thirty struck at once shows a handful, not thirty.
const MELEE_LOOK = {
  warrior: { slash: 'h_ml_slash', ss: 0.95, hit: 'h_ml_burst', hs: 0.34, turn: true },
  rogue: { slash: 'h_ml_cross', ss: 0.42, hit: 'h_ml_spark', hs: 0.8 },
  lancer: { slash: 'h_ml_thrust', ss: 0.7, hit: 'h_ml_spark', hs: 0.8, turn: true },
  monk: { slash: 'h_ml_punch', ss: 0.6, hit: 'h_ml_upper', hs: 0.75 },
  dokkaebi: { slash: 'h_ml_burst', ss: 0.42, hit: 'h_ml_spark', hs: 0.8 },
  reaper: { slash: 'h_ml_wind', ss: 0.3, hit: 'h_ml_slash', hs: 0.6, turn: true },
};

/**
 * A picture drawn larger: a second name for the same frames, `want` game pixels on its longer
 * side (never smaller than it is, at most `cap` times). (보이는 범위 = 맞는 범위: what uses it holds the
 * picture to what it strikes afterwards — addFx's o.self/o.body/o.cap, capK.)
 */
function bigFx(id, want, tag, cap = 3.2) {
  const f = id && M.fx[id];
  if (!f || !want) return id;
  const k = f.k || 1, now = Math.max(f.w, f.h) * k;
  const mult = Math.max(1, Math.min(cap, want / now));
  if (mult < 1.05) return id;
  const big = `${id}#${tag}`;
  if (!M.fx[big]) M.fx[big] = { ...f, src: f.src || id, k: k * mult };
  return big;
}

/** The picture id drawn larger for a close-in technique (growing a little with the 단 still). */
function meleeBig(id, kind, lv) {
  // 보이는 범위 = 맞는 범위 (사용자 규칙): no longer drawn larger than it strikes ("only the look grows" was the fault: a
  // 백호참 or a 진섬 two to four tiles across over the tile or the few it struck). Each kind draws it fitted to its tiles.
  return id;
}

/**
 * 연 draws many techniques the way they go: its _Down picture (fx k_<id>), an _Up one and a _Left
 * one (k_v_<id>_u, k_v_<id>_l; the right is the left turned over). The picture for the spell's
 * picture `fxid` (k_<id>, grown or drawn larger: the same for the other way) going (dx, dy):
 * [id, flip]. Up and down win a diagonal only when they are the longer way.
 */
function dirFx(fxid, sid, dx, dy) {
  if (!fxid || (!dx && !dy)) return [fxid, false];
  const way = Math.abs(dx) > Math.abs(dy) ? 'l' : dy < 0 ? 'u' : null;
  const v = way && `k_v_${sid}_${way}`, f = M.fx[fxid], base = M.fx['k_' + sid];
  if (!v || !M.fx[v] || !f || !base) return [fxid, false];
  const mult = (f.k || 1) / (base.k || 1);
  const id = Math.abs(mult - 1) > 0.01 ? `${v}#x${mult.toFixed(3)}` : v;
  if (!M.fx[id]) M.fx[id] = { ...M.fx[v], src: v, k: (M.fx[v].k || 1) * mult };
  return [id, way === 'l' && dx > 0];
}

function casterBig(id, kind, lv) {
  // 보이는 범위 = 맞는 범위 (사용자 규칙): as meleeBig — the picture as it is (it was half again larger, up to 560 px, a
  // little more a 단, "what it strikes stays what the old picture reached"); each kind fits it to what it strikes.
  return id;
}

/**
 * A screen-wide spell or a 필살기 as 연 plays it: one picture, large over the hero (most of the
 * screen's height), not a rain of small copies; where 연 has it in stages (뇌격룡's dragon
 * gathering, rising and striking: fx k_x_<id>_1, _2), each in turn.
 */
function screenFx(id, sid, frac = 0.9, flip = false, hold = 0) {
  if (!M.fx[id]) return 0;
  // 이펙트=판정: a spell on the whole screen is drawn over the whole screen — its drawn part as wide as the
  // screen's tiles it strikes (onScreen: the view and a tile past each edge), not a square the screen's height
  // in its middle (on a phone held sideways, the third of the screen each side was struck with nothing there).
  // (보이는 범위 = 맞는 범위: within the screen's struck tiles both ways — a tall one was fitted by its width alone and
  // stood twice the screen's height)
  const v = viewTiles(), want = (2 * v.w + 1) * Math.min(1, frac / 0.85), high = 2 * v.h + 1;
  const stages = [`k_x_${sid}_1`, `k_x_${sid}_2`].filter(s => M.fx[s]);
  let at = 0, end = 0;
  for (const s of [...stages, id]) {
    const b = fxIn(s, want, high, 'scr');
    // Centred on the hero, not hung from its own pivot (that put a screen-high picture under it).
    const t0 = at;
    later(at, () => {
      fxAt(b, 0, -24, { follow: true, flip: flip && s === id, must: false });
      // (hold: kept looping that long, while the blows it stands for still fall — a rain over the screen)
      const f = G.fxs[G.fxs.length - 1];
      if (hold && s === id && f && f.id === b) { f.loop = f.seenLoop = true; f.life = Math.max(f.life, hold - t0); }
    });
    end = Math.max(at + fxLife(s), s === id ? hold : 0);
    at += fxLife(s) * 0.7;
  }
  return end;
}

/** Which of 연's small hit sparks (fx h_hit_*) a caster's spell leaves on each one it strikes. */
function sparkOf(id, def) {
  if (def.elem === 'thunder' || /thunder|light|judge|flash|noejeon|storm|ray|cross|brilliant|jiroe|burst|gwang/.test(id)) return 'h_hit_light';
  if (def.elem === 'fire' || /fire|flame|inferno|boom|sammae|desert|kalpa|jiok|bomb|hell|crowfire|m_ult/.test(id)) return 'h_hit_fire';
  return { archer: 'h_hit_attack', celestial: 'h_hit_tiger', magus: 'h_hit_light', mage: 'h_hit_6', poet: 'h_hit_6' }[def.cls] || null;
}
// How large each spark is drawn (its picture's own size differs).
const SPARK_SCALE = { h_hit_6: 0.8, h_hit_attack: 0.42, h_hit_fire: 0.5, h_hit_light: 0.5, h_hit_tiger: 0.55 };

/**
 * The weight of a close-in technique landing (1 a blow, 2 a heavy one, 3 a burst round the
 * hero), as 연 plays it: the screen shakes, and the world stops for a blink on the heavier ones
 * (not more than twice a second, nor in a raid or a war where the party's blows never stop).
 */
function meleeImpact(power) {
  if (!MELEE_LOOK[G.cls.id] || G.stage.raid || G.war) return;
  // (손맛 예산: the shake stays; the world no longer stops on ordinary heavy blows — that was
  // 5~7% of a close-in fighter's real time, a hitch every 0.6 s. See hitStop.)
  G.shake = Math.max(G.shake, 0.06 + 0.06 * power);
}

// ---------------------------------------------------------------- 손맛 예산 (기획 P0-4·P0-3·P0-7·P0-8)
// The world stops only for the big moments — 처형, a champion pack or a leader felled, 그로기,
// 일망타진, the boss, the 필살기 — and never for more than 1.5% of the hunt's time (plus a little
// grace at its start); never more than once in half a second, never in a raid or a war.
const HITSTOP = { gap: 0.5, share: 0.015, grace: 0.2 };
/** This run's feel record (also read by the measuring tools). */
function feel() {
  return G.feel || (G.feel = { hs: 0, hsN: 0, why: {}, lvFull: 0, lvQuiet: 0, pulls: 0, sums: 0 });
}
function hitStop(sec, why) {
  if (!G || G.stage.raid || G.war || G.training) return false;
  const f = feel();
  if (G.t - (G.hitstopAt ?? -9) < HITSTOP.gap) return false;
  if (f.hs + sec > HITSTOP.grace + HITSTOP.share * G.t) return false;
  G.hitstop = Math.max(G.hitstop || 0, sec);
  G.hitstopAt = G.t;
  f.hs += sec;
  f.hsN++;
  f.why[why] = (f.why[why] || 0) + 1;
  return true;
}

/**
 * 흡입: after a big kill (a champion pack wiped, a leader, a treasure, a 일망타진) everything lying
 * near flies to the hero for a moment, the coins ringing in one after another — the "수확" of
 * 몰이 → 폭발 → 수확. (hunt.js can call it at a wave's end: A.pullLoot.) Not over the closing pull.
 */
function pullLoot(sec = 1.6, reach = 7) {
  if (!G || G.dead) return;
  G.pullUntil = Math.max(G.pullUntil || 0, G.t + sec);
  G.pullReach = reach * TILE;
  feel().pulls++;
}

/** 처치음 리듬: the kill sound climbs with the streak (기세 0~4: 10/40/100/200), a 질주's kill higher. */
function killRate() {
  const n = G.combo.n;
  return (n >= 200 ? 1.3 : n >= 100 ? 1.2 : n >= 40 ? 1.12 : n >= 10 ? 1.06 : 1) + (G.dashHit ? 0.08 : 0);
}

/**
 * 합산 숫자: deep in a streak (10 kills or more) the plain monsters' ordinary blows are not each
 * given a number; they add up in one number over the hero that keeps counting (a 치명타 and the
 * big ones' numbers still show). The wall of small numbers was what hid the fight.
 */
function sumNumber(dmg) {
  const p = G.player, f = feel();
  let s = G.sumText;
  if (!s || !G.texts.includes(s) || G.t - G.sumAt > 1.2) {
    s = G.sumText = { x: p.x, y: p.y - 118, text: '', t: 0, num: true, sum: true, heavy: true, v: 0, crit: false, color: '#ffb43a' };
    G.sumTotal = 0;
    G.sumAt = G.t;
    G.texts.push(s);
    f.sums++;
  }
  G.sumTotal += dmg;
  G.sumAt = G.t;
  s.v = G.sumTotal;
  s.text = hitNum(G.sumTotal);
  s.x = p.x;
  s.y = p.y - 118;
  if (s.t > 0.2) s.t = 0.2; // kept alive while it counts, without popping again
}

/**
 * A heavy technique throws a plain monster it did not kill back, away from where the blow came
 * from (ox, oy), and it springs back onto its tile: the heap round the hero bursts open for a
 * moment and closes again. Only seen: the tile it holds stays, so the heap is still there to cut
 * (moved off a tile, the next blows fell on air and the hunt slowed by a third).
 */
function fling(e, ox, oy) {
  if (!e || e.hp <= 0 || e.kind || e.war || e.ally || G.stage.raid || G.war || !MELEE_LOOK[G.cls.id]) return;
  let dx = e.tx - ox, dy = e.ty - oy;
  if (!dx && !dy) dx = G.player.face || 1;
  const d = Math.hypot(dx, dy);
  e.kickAt = G.t;
  e.kdx = dx / d;
  e.kdy = dy / d;
  e.kickBig = true;
}

/** A ring of force on the ground (code-drawn, as 연's slams shake the earth), in tiles. */
function shock(x, y, r, color = '255,236,200') {
  if (!fxBudget('shock', 4)) return;
  (G.shocks = G.shocks || []).push({ x, y, r, t: 0, color });
}
/** A thrust's wake: a white streak along the row it goes through (len tiles), gone in a blink. */
function streak(x, y, dx, dy, len) {
  if (!fxBudget('streak', 3)) return;
  (G.shocks = G.shocks || []).push({ x, y, dx, dy, len: Math.max(2, len || 3), t: 0, streak: true });
}
function drawShocks() {
  if (!G.shocks || !G.shocks.length) return;
  ctx.save();
  for (const s of G.shocks) {
    if (s.streak) {
      // Tapered: wide at the far end where the blow lands, thin back at the hero.
      const k = Math.min(1, s.t / 0.2), L = s.len * TILE, w = 9 * (1 - k);
      if (w <= 0.3) continue;
      const nx = -s.dy, ny = s.dx, x1 = s.x + s.dx * L * (0.3 + 0.7 * Math.min(1, s.t / 0.06)), y1 = s.y + s.dy * L * (0.3 + 0.7 * Math.min(1, s.t / 0.06));
      ctx.globalAlpha = 0.85 * (1 - k);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(s.x + s.dx * L * k * 0.6, s.y + s.dy * L * k * 0.6);
      ctx.lineTo(x1 + nx * w, y1 + ny * w);
      ctx.lineTo(x1 + s.dx * 10, y1 + s.dy * 10);
      ctx.lineTo(x1 - nx * w, y1 - ny * w);
      ctx.closePath();
      ctx.fill();
      continue;
    }
    const k = Math.min(1, s.t / 0.28), rr = s.r * TILE * (0.35 + 0.65 * Math.sqrt(k));
    ctx.globalAlpha = 0.75 * (1 - k);
    ctx.strokeStyle = `rgb(${s.color})`;
    ctx.lineWidth = 6 * (1 - k) + 1;
    ctx.beginPath();
    ctx.ellipse(s.x, s.y, rr, rr * 0.55, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Whether a technique that carries the hero to a foe (쇄혼비무's dash, 비영승보, 파천검무, 돌진,
 * the 필살기's leap) should leave it where it stands (it strikes from there, or stops short)
 * rather than carry it to (tx, ty):
 * - 대항전: the hero stands in a 거점's circle (or by the cart, or on a watch post it is taking)
 *   and the spot is outside it. In 연 such a leap pulled the hero off the point it was taking.
 * - The boss's red tiles (a raid): the spot is on a red tile not yet fallen. A leap that landed
 *   the hero in the blow the player was stepping out of made the patterns hard to dodge.
 * - The menu's 돌진 기술: 제자리 — never carried anywhere, on any ground.
 * A hunt on 자동 (the default) leaps as before.
 */
function holdGround(tx, ty) {
  if (settings.dashMode === 'stay') return true;
  if (onRed(tx, ty)) return true;
  if (!G.war || G.war.raid) return false;
  // 대항전: never onto a wall, nor through one (the castle's walls, a cliff, the shut gate).
  if (!War.clear(G.player.tx, G.player.ty, tx, ty)) return true;
  const z = War.anchor();
  return !!z && Math.hypot(tx - z.x, ty - z.y) > z.r;
}

/**
 * Where a leap to a foe (돌진, the 필살기's) lands: the open tile beside it nearest the hero that
 * the leap may reach (holdGround). Before, only the nearest was tried, and when a wall stood
 * between (a 대항전's, 「쟁」's) the hero did not leap at all though the far side was open.
 */
function leapSpot(e) {
  const p = G.player;
  return DIRS.map(([dx, dy]) => [e.tx + dx, e.ty + dy]).filter(([x, y]) => free(x, y) && !holdGround(x, y))
    .sort((a, b) => Math.hypot(a[0] - p.tx, a[1] - p.ty) - Math.hypot(b[0] - p.tx, b[1] - p.ty))[0] || null;
}

/**
 * The hero carried to a tile in one move, set down on its middle. A step it was in the middle of
 * is over: left on, the next frame carried the walk on from the tile it had stepped off toward
 * the new one — the hero was drawn back where it had been and slid the leap again (the 필살기's
 * leap did so, mid-step, in a war where every walk is a tile's step).
 */
function leapTo(tx, ty) {
  const p = G.player, x0 = p.x, y0 = p.y;
  p.x = tx * TILE + TILE / 2;
  p.y = ty * TILE + TILE - 6;
  heroTile();
  p.stepping = false;
  dashFrom(x0, y0);
}

/** A tile under one of the boss's red marks not yet fallen. */
function onRed(tx, ty) {
  for (const mk of G.marks) if (!mk.done && mk.tiles.some(([x, y]) => x === tx && y === ty)) return true;
  return false;
}

/**
 * 돌진 (the melee classes' own close-in) waits in a raid while the player steers, or while the
 * hero stands on red: the player's own dodge wins over a leap back to the boss. So in a 대항전 and
 * 「쟁」 (the war's fields, walked a tile a step): there a 돌진 thrown while the player walked off
 * pulled the hero back to a foe five tiles away, against the key held — the walk seemed to hitch.
 */
function steering() {
  if (!G.marks.length && !G.war) return false;
  return G.t - (G.steerAt || -9) < 0.6 || onRed(G.player.tx, G.player.ty);
}

/**
 * The hero went from (x0, y0) to where it stands in one move (a dash, 비영승보, 진섬): three
 * fading copies of it along the way, and it is seen to slide the last of it, not pop.
 */
function dashFrom(x0, y0) {
  const p = G.player, dx = x0 - p.x, dy = y0 - p.y;
  if (Math.hypot(dx, dy) < TILE * 0.8) return;
  G.ghosts = (G.ghosts || []).filter(g => G.t - g.t < 0.3);
  for (let i = 0; i < 3; i++) {
    const k = (i + 1) / 4;
    G.ghosts.push({ x: p.x + dx * (1 - k), y: p.y + dy * (1 - k), t: G.t - i * 0.04 });
  }
  p.slide = { dx, dy, t: G.t };
}

/** Where the hero is drawn while a dash is seen travelling its path (p.glide: from x0, y0 by dx, dy over d s — 화혼돌파):
 *  the hero itself already stands at the end. */
function glideAt(p) {
  const g = p.glide;
  if (!g || G.t - g.t >= g.d) return { x: p.x, y: p.y };
  const k = Math.max(0, (G.t - g.t) / g.d);
  return { x: g.x0 + g.dx * k, y: g.y0 + g.dy * k };
}

/** A blow's slash arc over a struck tile (dx, dy: the way the blow goes; h: which of a flurry). */
function meleeSlash(tx, ty, dx, dy, h = 0) {
  const look = MELEE_LOOK[G.cls.id];
  if (!look || !M.fx[look.slash] || !fxBudget('slash', 6)) return;
  const x = tx * TILE + TILE / 2, y = ty * TILE + TILE / 2 - 4;
  const along = Math.atan2(dy || 0, dx || 0.0001);
  const rot = look.turn ? along + Math.PI / 2 + (h % 2 ? 0.7 : -0.5) : (h % 2 ? 0.5 : -0.3);
  addFx(look.slash, x + rand(-5, 5), y + rand(-5, 3), { scale: look.ss * (h % 3 === 2 ? 1.15 : 1), rot, body: ONE_TILES });
}

/** The flash on one struck monster, and once in a while a slash arc over it too. */
function meleeMark(e, look, crit) {
  // A technique that draws its own picture on each one struck (a 진섬, a 유성창) shows that, not
  // the class's flash too: each technique looks its own, not one shared slash for everything.
  const own = G.t - (G.ownPicAt || -9) < 0.6;
  if (own && !crit) return;
  if (G.t - (e.markT || -9) > 0.25 && fxBudget('hit', crit ? 16 : 12)) {
    e.markT = G.t;
    fxOn(look.hit, e, { scale: look.hs * (crit ? 1.4 : 1), rot: rand(-0.5, 0.5) });
  }
  // Area blows (a 퇴격, a 반월참, an earthquake) show arcs on the struck as well, not only the flash.
  if (!own && G.t - (G.areaAt || -9) > 0.5 && G.t - (G.arcT || -9) > 0.06 && Math.random() < 0.35) {
    G.arcT = G.t;
    const p = G.player;
    meleeSlash(e.tx, e.ty, Math.sign(e.tx - p.tx), Math.sign(e.ty - p.ty), Math.floor(Math.random() * 3));
  }
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
  // A plain monster 0.003% (was 0.03%): a hunt fells ~2400 of them, so the plain ones alone gave
  // ~0.7 specials a hunt (career sim: 0.8-1 a hunt in all), hardly "very rare". Now ~0.2 a hunt
  // (plain 0.07, champions 0.045, leaders 0.04, boss 0.03), and 계속 사냥 (3 champions a minute)
  // about one in 40 minutes.
  const chance = { boss: 0.03, mini: 0.02, champ: 0.005, treasure: 0.05 }[e.kind] || 0.00003;
  if (Math.random() >= chance) return;
  // (and a smith's piece this place drops itself now and then: armory.js dropFrom)
  const mine = SPECIALS.filter(s => (s.src === G.stage.id || (s.craft && s.craft.dropFrom && s.craft.dropFrom.includes(G.stage.id)
    && (!s.craft.only || s.craft.only.includes(G.cls.id)))) && (s.kind !== 'shield' || hasShield(G.cls.id)));
  if (!mine.length) return;
  const sp = mine[Math.floor(Math.random() * mine.length)];
  // 스페셜 드롭의 한 방 (기획 P1-9): a column of gold over it and a call across the field (it
  // looked like any plain drop). The slowed breath comes when it is picked up (specialMoment).
  G.drops.push({ x: e.x, y: e.y, kind: 'gear', gear: { kind: sp.kind, tier: specialBase(sp, G.cls.id), sp: sp.id }, beam: '#ffe070' });
  say('어디선가 빛나는 물건이 떨어졌습니다!', 'warn');
  banner('빛나는 물건!');
  emote(Math.random() < 0.5 ? 'really' : 'hehe', G.player);
}

/**
 * 끝없는 지옥's weapons (items.js rollAbyssItem): 고유 only, and rare: the boss a third of the time
 * (the 소 왕 always, his own horn), a leader one in ten, a champion one in a hundred; the rest none.
 */
// ---- abyss drop rates (retune here) ----
// (Was boss 35%, mini 10%, champ 1%: about 0.64 uniques a hunt, every unique within a few dozen
// hunts. Now about 0.38: boss 20%, two leaders 6% each, nine or so champions 0.6% each.)
const ABYSS_DROP = { boss: 0.2, mini: 0.06, champ: 0.006 };
function rollAbyss(e) {
  const cowKing = G.stage.id === 'cow' && e.kind === 'boss';
  // 태초의 무기: the 소 왕 besides his horn, now and then; the 세계석 요새's lord in place of his drop.
  if (cowKing && Math.random() < taechoChance('cow')) dropAbyss(e, true);
  if (!cowKing && !(Math.random() < (ABYSS_DROP[e.kind] || 0))) return;
  dropAbyss(e, e.kind === 'boss' && G.stage.id === 'abyss4' && Math.random() < taechoChance('abyss4'), cowKing);
}
function dropAbyss(e, taecho, cowKing = false) {
  progress.abyssLoot = progress.abyssLoot || {};
  const sp = rollAbyssItem(progress.abyssLoot, G.level, taecho ? 'taecho' : cowKing ? 'cow' : null);
  G.drops.push({ x: e.x, y: e.y, kind: 'gear', gear: { kind: sp.kind, tier: specialBase(sp, G.cls.id), sp: sp.id }, beam: taecho ? '#fff1c0' : RARITY.unique.color });
  if (taecho) { say(`태초의 무기가 떨어졌습니다! (${specialName(sp, G.cls.id)})`, 'warn'); banner('태초의 무기'); }
  else say(`${RARITY.unique.name} 아이템이 떨어졌습니다!`, 'warn');
}

/** Materials of the ground's kind: a few from bosses, sometimes from the strong ones. */
function rollMats(e) {
  for (const [id, m] of Object.entries(MATS)) {
    if (!m.from.includes(G.stage.id)) continue;
    // 사신수 성물: in full only from their 신수's raid (items.js SINSU_GATE), elsewhere a taste.
    let n = id.startsWith('sinsu_') ? sinsuCount(id, G.stage.id, e.kind, progress.raids) : matCount(id, e.kind, !!G.stage.raid);
    // 금린 below 8등급 (산군 L3, 도깨비대장 L5): one now and then, not 3-5 a boss — the 11등급
    // 금린 set came by the 12th hunt and skipped the raid sets and the craft ladder between.
    if (id === 'gold' && G.level < 8) n = e.kind === 'boss' && Math.random() < 0.35 ? 1 : 0;
    if (n && Math.random() < pactReward() - 1) n++; // 규약: richer spoils
    for (let i = 0; i < n; i++) G.drops.push({ x: e.x + (i - n / 2) * 14, y: e.y + 6, kind: 'mat', mat: id });
  }
}

const COMBO_AT = [50, 100, 200, 300, 500, 800, 1200];

function killEnemy(e) {
  if (e.war) return War.down(e); // 대항전: a fighter falls and gets up at its camp
  if (G.stage.jaeng) return War.mobDown(e); // 「쟁」: the boss's own fall
  // Each monster dies once: a second call (two blows landing in the same instant) must not
  // count it again, nor — through indexOf -1 — take the last monster in the list (often the
  // boss, the newest) off the field with it.
  const at = G.enemies.indexOf(e);
  if (at < 0) return;
  G.kills++;
  if (G.hunt) Hunt.kill(e); // 사냥 기믹: 토벌도
  if (G.endEnd) Hunt.sweepKill(e); // 사냥 기믹: 소탕's spoils
  if (G.player.abyssHunt && !G.allyHitting) abyssBurst(e);
  if (e.venom9) venomBurst(e); // 묵혈독바르기
  // 죽음의희열 (원작 9차 패시브, 설명창 IMG14; no picture — 2662 IMG15 shows only 묵마수리검'쇄 thrown again): a kill
  // brings, three times in ten, one of the 수리검 skills ready at once (at most once in three seconds)
  const jg = SKILLS.r_jugeum && SKILLS.r_jugeum.proc9;
  if (jg && G.cls.id === 'rogue' && !G.allyHitting && (promoOf('rogue') >= 9 || G.training) && G.t >= (G.jugeumAt || 0) && Math.random() < jg.chance) {
    const ready = G.skills.filter(s => jg.ids.includes(s.id) && s.timer > 0.3);
    if (ready.length) {
      ready[Math.floor(Math.random() * ready.length)].timer = 0.05;
      G.jugeumAt = G.t + jg.cd;
      note('죽음의희열: 수리검의 재사용 대기가 끝났습니다.');
    }
  }
  // 영혼갈무리 (원작 9차 패시브, 설명창 IMG82; no picture): every foe the 차사 fells gives back a little 마력 (혼력) and brings
  // 분쇄섬 (멸살's place) nearer (9차 승급부터, 수련장에서는 늘)
  const gm9 = SKILLS.rp_galmuri && SKILLS.rp_galmuri.galmuri9;
  if (gm9 && G.cls.id === 'reaper' && !G.allyHitting && (promoOf('reaper') >= 9 || G.training)) {
    const p = G.player;
    p.mp = Math.min(p.maxMp, p.mp + p.maxMp * gm9.mana);
    for (const s of G.skills) if (gm9.ids.includes(s.id) && s.timer > 0) s.timer = Math.max(0, s.timer - gm9.cut);
  }
  // 영혼갈무리·죽음의희열 (9차): a foe felled while it is up brings the other skills' waits nearer
  if (G.buffs.killCut > G.t) for (const s of G.skills) if (s.timer > 0.5 && SKILLS[s.id].kind !== 'ult') s.timer -= Math.min(s.timer * 0.25, G.buffs.killCutK || 0.125);
  gearProc('kill', e);
  // 이동기 한방컷 (연's 차사): a foe felled just after a dash brings the next dash sooner.
  if (G.dashAt !== undefined && G.t - G.dashAt < 0.6) G.dashAt -= 0.35;
  // 연속 처치: kills within three seconds of each other chain; the round numbers are called out.
  const c = G.combo;
  c.n = G.t - c.t < 3 ? c.n + 1 : 1;
  c.t = G.t;
  c.pop = G.t;
  c.best = Math.max(c.best, c.n);
  if (COMBO_AT.includes(c.n)) {
    // The mark is shown by the 殺 strip itself (a bigger pop): a banner across the field as well
    // only covered the numbers over the hero.
    c.mark = G.t;
    // 연's kill-streak voice, one step louder at each mark.
    audio.play('combo', null, COMBO_AT.indexOf(c.n) + 1);
    G.flash = G.t;
    G.shake = Math.max(G.shake, 0.15);
    // (the level-up chime no longer rings with it: 연's kill-streak voice alone — 기획 P0-3)
    if (c.n >= 100) emote(c.n >= 300 ? 'godgame' : 'gains', G.player);
  }
  rollSpecial(e);
  if (G.stage.abyss) rollAbyss(e);
  rollMats(e);
  // For the 의뢰: every kill counts, by ground, and bosses by ground.
  const st = qstats();
  st.kills++;
  st.stageKills[G.stage.id] = (st.stageKills[G.stage.id] || 0) + 1;
  if (e.kind === 'boss') st.bosses[G.stage.id] = (st.bosses[G.stage.id] || 0) + 1;
  G.enemies.splice(at, 1);
  leave(e);
  // The body is thrown a little away from the hero as it falls.
  const kp = G.player, kl = Math.hypot(e.x - kp.x, e.y - kp.y) || 1;
  const dy = { e, t: 0, kx: (e.x - kp.x) / kl, ky: (e.y - kp.y) / kl, fly: !e.kind && !!MELEE_LOOK[G.cls.id] && !G.war && !G.allyHitting && kl < TILE * 4 };
  // 연's kill burst on the fallen, a few at a time.
  if (M.fx.h_kill && fxBudget('kill', 6)) {
    dy.popped = true;
    fxOn('h_kill', e, { scale: e.kind ? 0.8 : 0.55 });
  }
  G.dying.push(dy);
  // 몰이: a kill stirs the shy ones nearby, so the pack gathers on the hero.
  for (const o of G.enemies) if (!o.provoked && Math.abs(o.tx - e.tx) + Math.abs(o.ty - e.ty) <= 3) o.provoked = true;
  audio.play('kill', null, 1, killRate()); // 처치음 리듬: higher with the streak
  const p = G.player;
  // A kill gives a little mana, but not the kills of a 필살기 itself (a screen of them refilled it
  // at once, and it could be thrown again and again).
  // 마력 리듬 (기획 P2-2, light): a kill in a heap (five or more within 3 tiles) gives twice the
  // mana, a lone one a little less — the bigger the 몰이, the sooner the 필살기.
  if (G.t - (G.ultAt === undefined ? -99 : G.ultAt) > 3) p.mp = Math.min(p.maxMp, p.mp + (G.hunt ? (heapNear() >= 5 ? 1.2 : 0.45) : 0.6));
  // Experience comes at the kill, as in the game: nothing to pick up.
  gainXp(e.xp);
  const roll = Math.random();
  // Gear drops as in D2 Survivors: a plain monster at most one piece every three minutes,
  // a champion one time in three, a named leader one in two, a boss two.
  if (e.kind === 'champ') {
    if (!G.enemies.some(o => o.pack === e.pack)) {
      G.drops.push({ x: e.x, y: e.y, kind: 'chest' });
      say('챔피언 무리를 물리쳤습니다!');
      hitStop(0.06, 'champ');
      pullLoot();
    }
    if (Math.random() < 0.33) dropGear(e);
  } else if (e.kind === 'mini') {
    G.drops.push({ x: e.x, y: e.y, kind: 'chest' });
    say(`${josa(e.name, '을', '를')} 쓰러뜨렸습니다!`);
    hitStop(0.08, 'mini');
    pullLoot();
    if (Math.random() < 0.5) dropGear(e);
  } else if (e.kind === 'treasure') {
    G.drops.push({ x: e.x, y: e.y, kind: 'chest' });
    for (let i = 0; i < 6; i++) G.drops.push({ x: e.x + (i % 3 - 1) * 20, y: e.y + (i < 3 ? -14 : 14), kind: 'coin' });
    say('보물을 지닌 몬스터를 잡았습니다!');
    later(0.25, () => pullLoot());
  } else if (e.kind === 'boss') {
    if (!G.stage.raid) hitStop(0.1, 'boss');
    G.drops.push({ x: e.x, y: e.y, kind: 'chest' });
    dropGear(e, -12);
    dropGear(e, 12);
    if (!G.stage.raid) bootsDrop();
    say(`${josa(e.name, '을', '를')} 쓰러뜨렸습니다!`);
    fieldFalls();
    clearStage();
  } else if (G.t >= G.plainDropAt && roll < 0.02) {
    G.plainDropAt = G.t + (G.hunt ? 100 : 180); // 사냥 기믹: a shorter run, the same pieces a minute
    dropGear(e);
  } else if (roll < 0.035) G.drops.push({ x: e.x, y: e.y, kind: 'heal' });
  else if (roll < 0.07) G.drops.push({ x: e.x, y: e.y, kind: 'coin' });
}

/** With the boss, the whole field falls (over two seconds), giving its experience. */
function fieldFalls() {
  const rest = G.enemies.slice();
  rest.forEach((o, i) => later(0.02 * i % 2, () => { if (o.hp > 0) killEnemy(o); }));
}

/**
 * 신발 (boots.js) from a hunting ground's boss: the ground's pair, half the time, until it is
 * found (once found, nothing more: boots have no stars). Put on at once when better.
 */
function bootsDrop() {
  const bt = bootsForRank(G.level), st = bootsState(progress);
  if (!bt || st.have.includes(bt.id) || Math.random() >= 0.5) return;
  st.have.push(bt.id);
  if (!st.worn || BOOT[st.worn].pct < bt.pct) {
    st.worn = bt.id;
    G.player.bootPct = bt.pct;
  }
  saveJson('bs_progress', progress);
  (G.gained = G.gained || []).push(bt.name);
  say(`신발 ${josa(bt.name, '을', '를')} 얻었습니다! (이동속도 +${bt.pct}%)`, 'sys');
  later(0.8, () => banner(`신발 · ${bt.name}`));
}

/** A piece of the class's gear on the ground, about as good as the ground is deep. */
function dropGear(e, dx = 0) {
  // 동료 모드: about a third of the pieces are for one of the player's own companions (its class's
  // line, into its own bag; it puts on what is stronger — companionPick).
  const mine = (G.party || []).filter(m => m.own && m.cls && GEAR[m.cls.id] && m.down <= 0);
  if (mine.length && !G.war && !G.stage.raid && Math.random() < 0.35) {
    const m = mine[Math.floor(Math.random() * mine.length)], cid = m.cls.id, ln = GEAR[cid];
    const ks = ['weapon', 'armor', 'shield', 'weapon', 'armor', 'shield', 'helmet', 'cape']
      .filter(k => (ln[k] || []).length && plainList(cid, k).length && (k !== 'shield' || hasShield(cid)));
    if (ks.length) {
      const k = ks[Math.floor(Math.random() * ks.length)], lst = plainList(cid, k), tp = lst.length - 1;
      const t = lst[Math.max(0, Math.min(tp, Math.floor(G.level / 3) + (Math.random() < 0.35 ? 1 : 0) + (e.kind === 'boss' ? 1 : 0)))];
      G.drops.push({ x: e.x + dx, y: e.y, kind: 'gear', gear: { kind: k, tier: t, cls: cid } });
      return;
    }
  }
  // 투구 and 망토 drop too (a little rarer than the weapon, armour and shield), from their own lines.
  const line = GEAR[G.cls.id];
  const kinds = ['weapon', 'armor', 'shield', 'weapon', 'armor', 'shield', 'helmet', 'cape']
    .filter(k => (line[k] || []).length && plainList(G.cls.id, k).length && (k !== 'shield' || hasShield(G.cls.id)));
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
  G.clearT = G.t;
  Hunt.note('clear');
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
    const set = raidSet(G.stage.id, G.cls.id).map(([kind, name]) => ({ kind, name, tier: raidTier(G.stage.id, G.cls.id, kind) }));
    const missing = set.filter(g => !b.includes(`${g.kind}:${g.tier}`)).sort(() => Math.random() - 0.5);
    const pool = missing.length ? missing : set.slice().sort(() => Math.random() - 0.5);
    const got = pool.slice(0, G.level >= 7 ? 2 : 1);
    got.forEach((g, i) => G.drops.push({ x: p.x + (i ? 40 : -40), y: p.y + 24, kind: 'gear', gear: { kind: g.kind, tier: g.tier } }));
    const names = got.map(g => g.name).join(', ');
    say(`레이드 전용 장비가 떨어졌습니다: ${names}`, 'sys');
    later(1.2, () => banner(`레이드 전용 · ${names}`));
    G.drops.push({ x: p.x, y: p.y + 30, kind: 'chest' });
    // 지하국대적: now and then 악마 심판의낫 itself (items.js AKMA_DROP), for a class that wields it.
    const ak = SPECIAL.cr_judge_weapon3;
    if (G.stage.id === 'raid_hell' && ak && ak.craft.only.includes(G.cls.id) && Math.random() < AKMA_DROP) {
      G.drops.push({ x: p.x, y: p.y - 30, kind: 'gear', gear: { kind: 'weapon', tier: specialBase(ak, G.cls.id), sp: ak.id } });
      later(2.4, () => banner(`★ ${specialName(ak, G.cls.id)}`));
    }
    G.gold += 120 * G.level;
    // 레이드주화 for the raid shop (in the smith's window).
    // 공대: paid at the end by the hero's tier (war.js raidEnd).
    const coins = 10 * G.level + (G.stage.gwoe ? 30 : 0);
    if (!G.war) {
      progress.coins = (progress.coins || 0) + coins;
      say(`레이드주화 ${coins}개를 받았습니다.`, 'sys');
    }
    if (G.stage.gwoe) gwoeCards();
    // 코디: a raid won gives a costume now and then (the higher raids the rarer ones).
    if (Math.random() < 0.4 + 0.03 * G.level) dropCostume(G.level >= 10 ? [1, 2] : [0, 1, 2], '레이드 보상');
    // 사신수 무신의 헤어: the pair of the 신수 whose 성물's raid this is (costume.js MUSIN_HAIR).
    const mh = unlockMusinHair('사신수 레이드 승리');
    if (mh.length) later(3.6, () => banner(`코디 헤어 · ${mh.join(' · ')}`));
  } else {
    progress.cleared[G.stage.id] = true;
    if (G.hunt) Hunt.cleared(); // 사냥 기믹: the slow moment, the 갈림길's spoils
    promote();
    if (G.stage.id === 'cheolsang' && !progress.abyss && st.clears.cheolsang >= 3) {
      progress.abyss = true;
      // The Cairn Stones' nod: five stones light, and the way down opens.
      later(2.2, () => { say('철상지옥 바닥의 돌 다섯 개가 붉게 빛난다… 끝없는 지옥, 지하 묘지로 가는 문이 열렸다.', 'sys'); banner('끝없는 지옥'); });
    }
    // Past the 파괴의 군주, now and then, a way to the cows.
    if (G.stage.id === 'abyss4' && !progress.cowLevel && Math.random() < 0.25) {
      progress.cowLevel = true;
      later(2.6, () => { say('어디선가 소 울음소리가 들린다… 음매. 비밀의 소 레벨로 가는 문이 열렸다.', 'sys'); banner('비밀의 소 레벨'); });
    }
    // From the grounds past 타계 (Lv 18 and up) the rarer looks, as from the raids.
    if (Math.random() < 0.15) dropCostume(G.level >= 18 ? [1, 2] : [0, 1, 2], '보스의 보물');
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
    // 공대: a hero lying down waits for its feet (it gets up at the camp), not for nothing.
    if (G !== run || (G.dead && !G.war) || G.over) return;
    if (G.choosing || G.pendingLevels || (G.dead && !(G.war && G.war.heroOut))) setTimeout(end, 500);
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

/** How far (tiles) a damaging skill reaches from the hero, by its kind: a foe must be within it
 *  for the skill to be thrown. 0: no such check (summons, auras). */
function skillReach(d, st) {
  const r = st.radius ?? d.radius ?? 0, rg = st.range ?? d.range;
  switch (d.kind) {
    case 'nova': return r + 1.5;
    case 'cleave': return r + 2;
    case 'slash': return typeof d.dash === 'number' ? d.dash + 1 : 2;
    case 'blink': return (rg || 4) + 1;
    case 'strike': return (rg || 6) + r;
    case 'spell': case 'spell4': return rg || 6;
    case 'line': return 6;
    case 'screen': return 9;
    default: return 0;
  }
}
function nearestEnemies(n, range, from = G.player) {
  return G.enemies
    .map(e => [e, tdist(e, from)])
    .filter(([, d]) => d <= range)
    .sort((a, b) => a[1] - b[1])
    .slice(0, n)
    .map(([e]) => e);
}
/** 보스 우선 (사용자 피드백: 보스가 나와도 어그로가 계속 빠져서 잡몹을 친다): the ground's boss when it is a foe within
 *  `range` tiles of the hero, else null. Since 사냥 개편 A the field stays full while the boss stands (50~90 of the crowd,
 *  and 4~6 more called round it every 8 s: hunt.js PACE.boss), so the nearest foe, a random one of the nearest or the
 *  row with most foes was nearly always the crowd's. A blow that picks one foe (the 기본 공격, spell, strike, blink) or a
 *  way (line, cleave, the rows) goes to the boss first when it is in that blow's reach; out of its reach they take what
 *  is near, as before (the hero never waits on a boss it cannot reach). A spread spell hits round it as it always did. */
function bossIn(range, from = G.player) {
  for (const e of G.enemies) if (e.kind === 'boss' && tkFoe(e) && tdist(e, from) <= range) return e;
  return null;
}
/** What a row or a triangle of foes is worth in choosing the way a blow goes: the one with the boss in it first (보스 우선). */
function aimWorth(hit) {
  return hit.length + (hit.some(e => e.kind === 'boss') ? 1000 : 0);
}

/** Monsters within a square of tiles around a tile (radius 1 = the eight around it). */
/** Monsters on a list of tiles. */
function onTiles(tiles) {
  const out = [];
  for (const [x, y] of tiles) {
    const bs = bodiesAt(x, y);
    if (bs) for (const b of bs) if (b.m && b.hp > 0 && !b.ally && !(b.war && b.team === SIDE) && !out.includes(b)) out.push(b);
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

/** The foes on the tiles round a spot (a war's or a raid's own fighters, team 0, are not foes:
 * before, the hero's spread spells stunned and struck its own guild or raid). */
function around(tx, ty, r) {
  // (whole tiles: a reach measured off a picture, 2.7, looked up tiles at 0.3 past each — none, nothing struck)
  r = Math.floor(r + 1e-6);
  const out = [];
  for (let x = tx - r; x <= tx + r; x++) {
    for (let y = ty - r; y <= ty + r; y++) {
      const bs = bodiesAt(x, y);
      if (bs) for (const b of bs) if (b.m && b.hp > 0 && !b.ally && !(b.war && b.team === SIDE)) out.push(b);
    }
  }
  return out;
}

/** Where an effect sits on a body: tall pillars stand on its feet, the rest on its middle. */
function fxOn(id, b, o = {}) {
  const f = M.fx[id];
  if (!f) return 0.3;
  const tall = f.h > f.w * 1.4;
  const h = b.m ? b.m.h * b.scale : HERO_H;
  // (보이는 범위 = 맞는 범위: a picture on one body no larger than that body — o.area: one already fitted to an area)
  return addFx(id, b.x, tall ? b.y + 4 : b.y - h / 2, { anchor: tall ? 'bottom' : 'center', ...(o.area ? {} : { body: bodyTiles(b) }), ...o });
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
  // The first blow out of 투명 is the 암습 (AMBUSH).
  const ambush = G.ambush && G.buffs.stealth > G.t && st.dmg > 0 && !SKILLS[s.id].heal;
  if (ambush) { st.dmg *= G.ambush.k || AMBUSH.k; G.ambushShow = G.t + AMBUSH.show; G.ambushKill = promoOf(G.cls.id) >= 5 ? G.t + 0.8 : 0; }
  G.castCd = st.cd; // 사냥 기믹: a heavy blow fills the boss's 그로기 twice; its element reacts
  G.castElem = G.hunt ? Hunt.elemOf(SKILLS[s.id]) : null;
  G.castDmg = st.dmg || 0;
  cast(s, st);
  G.castCd = 0;
  G.castElem = null;
  if (ambush) ambushStrike(s);
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
  const power = G.hunt ? Hunt.chainPower(CHAIN_POWER) : CHAIN_POWER; // 사냥 기믹: 일망타진
  if (power !== CHAIN_POWER) later(lead, () => { hitStop(0.06, 'sweep'); pullLoot(1.8); });
  G.chainRun = { ids: chain.map(s => s.id), at: G.t + lead, done: 0, end: G.t + lead + chain.length * CHAIN_GAP + 1 };
  chain.forEach((s, i) => later(lead + i * CHAIN_GAP, () => {
    if (G.dead || !G.skills.includes(s)) return;
    fireSkill(s, power);
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
    const spot = ring.filter(([x, y]) => free(x, y) && Math.hypot(x - p.tx, y - p.ty) < tdist(e, p) && (!G.war || War.clear(e.tx, e.ty, x, y)))
      .sort((a, b) => Math.hypot(a[0] - e.tx, a[1] - e.ty) - Math.hypot(b[0] - e.tx, b[1] - e.ty))[0];
    if (!spot) continue;
    leave(e);
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
  const cr = boxOf(canvas), d = canvas.width / cr.width;
  const sz = 26 * d, gap = 4 * d, n = c.ids.length;
  const w = n * sz + (n - 1) * gap + 12 * d, h = sz + 24 * d;
  const x = 8 * d, y = Math.max(64 * d, (G.binfoBottom || 0) + 4 * d);
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
  // A picture redrawn from 연's own (a whole tornado where a small one stood) keeps the reach of
  // the one it replaced: reach = [its width, its height] as parts of this one's (balance unchanged).
  const r = f.reach || [1, 1];
  return (Math.min(f.w * r[0], f.h * r[1] * 1.6) * (f.k || 1) * scale) / 2 / TILE * 0.85;
}

// ---------------------------------------------------------------- 같은 기술은 같은 그림 (AI의 시전)
// 사용자 피드백: "왜 다르냐, 같은 기술인데" — an AI ally's skill (a companion's in a hunt, a raid's or a war's fighter's)
// was drawn by code of its own (war.js fitArea·aiFx·AI_FX_AREA, its old class routines' raw pictures × 1.1~1.4, the
// companions' fxFit·memberFx), at sizes of its own: 백호참 a third of the screen in a 쟁, 사슬벼락·비영승보 far
// larger than the hero's. Now every AI cast goes through the hero's own cast (cast, TIER_KINDS) — castAs: the
// same picture, scale, anchor and the same area struck as the hero's cast of that skill at that 단. Only its
// see-through (aiFxAlpha) and the budgets of how many are drawn are an AI's own.
//
// The hero's cast runs for the caster in a shadow of the game (SH): G is an object over the real one (its fields read
// through; what the cast sets — buffs, shakes, flags — kept to the shadow), its hero a stand-in where the caster
// stands, its foes the caster's; a blow it strikes goes to the caster's own hit (its own power: ctx.hit), and nothing
// of the hero's own is touched (its life, buffs, words, sounds, pose). What the cast draws goes on the field as the
// hero's would, a picture over "the hero" kept on the caster. Its later steps (later) run in the same shadow.
let SH = null; // the shadow cast running now (castAs), or null
let SIDE = 0; // the side whose fighters are not struck (a war's or raid's own side, team 0; a caster's own in castAs)
const SILENT = new Proxy({}, { get: () => () => {} });
/** fn() inside the shadow cast ctx; what it put on the field marked as the caster's (castAs). */
function inShadow(ctx, fn) {
  const real = ctx.real;
  if (G !== real && G !== ctx.sh) return; // (that hunt is over)
  const g0 = G, s0 = SH, side0 = SIDE, a0 = audio, n0 = real.fxs.length;
  G = ctx.sh;
  SH = ctx;
  SIDE = ctx.team;
  audio = SILENT;
  try {
    return fn();
  } catch (err) {
    // (a step of the hero's code that cannot run for another: that cast's step is lost, the game goes on — tests read it)
    ctx.failed = true;
    (window.__castAsErr = window.__castAsErr || []).push(`${ctx.id}: ${err && err.message}`);
  } finally {
    G = g0;
    SH = s0;
    SIDE = side0;
    audio = a0;
    // (a cast struck unseen — out of sight, over the AI's budget —: what it put up taken down at once)
    for (let i = real.fxs.length - 1; i >= n0; i--) if (ctx.mark(real.fxs[i])) real.fxs.splice(i, 1);
  }
}
/** fn() out of the shadow (a blow struck by the caster's own hit: war.js and the party read the real game). */
function outShadow(fn) {
  const ctx = SH;
  if (!ctx) return fn();
  const g0 = G, side0 = SIDE, a0 = audio;
  G = ctx.real;
  SH = null;
  SIDE = 0;
  audio = ctx.audio;
  try {
    return fn();
  } finally {
    G = g0;
    SH = ctx;
    SIDE = side0;
    audio = a0;
  }
}
/**
 * One skill of an AI ally cast by the hero's own code (see above). by: the caster (x, y, tx, ty, fdx, fdy, cls; a war
 * fighter's team), id and lv (its 단). o: { foes: its foes (default the hero's), team: its side (0), hit(e, share, dmg,
 * push): a blow it struck — share the part of one whole blow of the skill (st.dmg) — at: the one it means (it turns
 * to it), on: the body a picture over "the hero" goes on (default by), alpha (aiFxAlpha), draw: false to strike without
 * drawing (a cast out of sight or over the budget) }. Returns true when it went off (false: nothing in its reach).
 */
function castAs(by, id, lv, o = {}) {
  const def = SKILLS[id];
  if (!G || !by || !def || ['ult', 'summon', 'none'].includes(def.kind)) return false;
  lv = Math.max(1, Math.min(MAX_SKILL_LEVEL, lv || 1));
  const real = G, pass = {};
  for (const k of Object.keys(real.passives || {})) pass[k] = 0;
  // (its reach as the hero's at that 단 on this field: the hero's 공력 (passive area) widens a spread spell's square, and the
  // same spell of an ally beside it is drawn and strikes as wide — the hero's blow and pace stay the hero's own)
  pass.area = (real.passives && real.passives.area) || 0;
  const st = skillStats(id, lv, { power: 0, haste: 0, ...pass });
  const on = o.on || by, onHero = on === real.player || on.hero;
  const p = {
    x: by.x, y: by.y, tx: by.tx, ty: by.ty, fdx: by.fdx || 0, fdy: by.fdx ? 0 : by.fdy || 1, face: by.face || by.fdx || 1,
    hp: def.kind === 'heal' || def.ck === 'heal' || isMend(def) ? 50 : 100, maxHp: 100, // (a mend is cast on one hurt) mp: 1e9, maxMp: 1e9, lvl: real.player.lvl, gear: by.gear, gearPower: 1, bonus: {},
  };
  if (o.at && o.at !== by && (o.at.tx !== by.tx || o.at.ty !== by.ty)) {
    const dx = o.at.tx - by.tx, dy = o.at.ty - by.ty;
    if (Math.abs(dx) >= Math.abs(dy)) { p.fdx = Math.sign(dx); p.fdy = 0; p.face = p.fdx; } else { p.fdx = 0; p.fdy = Math.sign(dy); }
  }
  const buffs = {};
  for (const k of Object.keys(real.buffs)) buffs[k] = 0;
  const sh = Object.create(real);
  Object.assign(sh, {
    player: p, cls: o.cls || by.cls || real.cls, buffs, passives: { power: 0, haste: 0, area: 0, ...pass }, enemies: o.foes || real.enemies, party: [], skills: [], allies: [],
    dead: false, shake: 0, bubble: null, binfo: [], ghosts: [], ambush: null, coat9: null, chainRun: null, blast: null, quietHit: false,
  });
  const base = st.dmg || def.hit || 1, draw = o.draw !== false, alpha = o.alpha === undefined ? 1 : o.alpha;
  const ctx = {
    real, sh, team: o.team || 0, by, audio, id,
    hurt: (e, d, push) => outShadow(() => (o.hit ? o.hit(e, d / base, d, push) : 0)) || 0,
    draw,
    mark: f => {
      if (f.by) return false;
      f.by = by;
      f.cast = id + '@' + lv; // (tests: whose cast it is)
      if (!draw) return true;
      if (f.follow && !onHero) { f.follow = false; f.on = on; }
      if (f.life === Infinity) f.life = 1.5; // (a ward kept round the hero while it holds: once, a moment)
      if (alpha < 1) f.alpha = (f.alpha === undefined ? 1 : f.alpha) * alpha;
    },
  };
  const skill = { id, lv, timer: 0 };
  inShadow(ctx, () => cast(skill, st));
  return !skill.waiting && !ctx.failed;
}
window.__castAs = (b, id, lv, o) => castAs(b, id, lv, o); // test: an AI cast of a skill
window.__joinParty = ids => { for (const id of ids) joinParty(CLASSES.find(c => c.id === id)); return G.party.map(m => [m.name, m.cls.id, m.own, m.cl, memberSkillLv(m)]); }; // test: companions now
// test (같은 기술은 같은 그림): each picture up now, its drawn extent in tiles (the union of its frames' boxes, at its scale)
// [id, w, h, an AI's cast ('id@lv') or '' for the hero's, alpha]
window.__fxExt = () => G.fxs.filter(f => f.t >= 0 && M.fx[f.id]).map(f => {
  const d = M.fx[f.id], u = fxUnion(f.id), k = (d.k || 1) * (f.scale || 1), ky = d.ky || 1;
  const w = (u ? u.x1 - u.x0 : d.w) * k, h = (u ? u.y1 - u.y0 : d.h) * k * ky;
  return [String(f.id), +(w / TILE).toFixed(3), +(h / TILE).toFixed(3), f.cast || '', f.alpha === undefined ? 1 : +f.alpha.toFixed(2)];
});
/** The sheets a skill's cast at a 단 draws from (to be decoded before a fighter casts it in view): its picture at that 단
 *  and its stages (fxCast, fxShot, fxHit, fxAfter, fx2, 연's k_x_<id>_*). */
function skillSheets(id, lv) {
  const d = SKILLS[id];
  if (!d) return [];
  const base = d.yeon ? d.fx : d.modern && M.fx[d.modern] ? d.modern : d.promo === 4 && M.fx['new_' + id] ? 'new_' + id
    : d.fxs ? d.fxs[Math.min(lv || 1, d.fxs.length) - 1] : M.fx['s_' + id] ? 's_' + id : d.fx;
  const ids = [base, d.fx, d.fx2, d.fxCast, d.fxShot, d.fxHit, d.fxAfter, 'k_' + id, 'k_x_' + id + '_cast', 'k_x_' + id + '_hit', 'k_x_' + id + '_shot'];
  return [...new Set(ids.filter(f => f && M.fx[f]))];
}
/** A fighter's plain blow seen as the hero's own is (plainAttack): a close-in class's slash on the struck, a far one's
 *  first spell's picture small on it. (A war's fighters drew their first technique's whole picture on every other blow.) */
function plainLook(cls, t, alpha = 1, from = null) {
  if (!cls || !t) return;
  const look = MELEE_LOOK[cls.id];
  if (look) {
    if (!M.fx[look.slash] || !fxBudget('slash', 6)) return;
    const dx = from ? Math.sign(t.tx - from.tx) : 0, dy = from ? Math.sign(t.ty - from.ty) : 1, along = Math.atan2(dy || 0, dx || 0.0001);
    addFx(look.slash, t.tx * TILE + TILE / 2, t.ty * TILE + TILE / 2 - 4, { scale: look.ss, rot: look.turn ? along + Math.PI / 2 - 0.5 : -0.3, alpha });
    return;
  }
  const start = plainSpell(cls.id), fxid = start && !MEND_FX.has(start.fx) ? start.fx : null;
  if (fxid && M.fx[fxid]) fxOn(fxid, t, { scale: 0.55, alpha });
}

// 보이는 범위 = 맞는 범위 (사용자 규칙): while a skill's cast draws (FXC: cast() and its later steps), a picture over the caster
// that is not the area it strikes (addFx follow, not placed by its middle as an area is — fxAt —, not the one picture of a
// blow's area — o.must —, not o.area) strikes nothing: it is held to the caster's body (SELF_TILES), as a 기원 or a buff is.
let FXC = 0;
function inCastFx(fn) {
  FXC++;
  try { return fn(); } finally { FXC--; }
}
function cast(skill, st) {
  return inCastFx(() => castNow(skill, st));
}
function castNow(skill, st) {
  const def = SKILLS[skill.id];
  // The spell's picture at this level (the site draws each grade of 신수마법 and 기원 differently).
  // 4차 승급 spells, the last of the tree, show today's client effect when the build has it.
  // 5차+ spells draw their effect in their own colour (s_<id>, made at boot from def.tint).
  const fxBase = def.yeon ? def.fx : def.modern && M.fx[def.modern] ? def.modern : def.promo === 4 && M.fx['new_' + skill.id] ? 'new_' + skill.id
    : def.fxs ? def.fxs[Math.min(skill.lv, def.fxs.length) - 1] : M.fx['s_' + skill.id] ? 's_' + skill.id : def.fx;
  // A spell grows with its 단, as a survivors weapon does: its picture 6% larger a step.
  const fxReach = grownFx(fxBase, skill.lv);
  // A close-in fighter's techniques are drawn as 연 draws them, two to four tiles across and
  // larger than the hero; what they strike stays what the spell's own picture reached (fxReach).
  // (Not the shared 금강퇴 every class learns: one big kick on all six looked alike.)
  // A caster's spells too, one and a half times what they were (casterBig).
  const fxid = def.cls !== G.cls.id || G.war ? fxReach
    : MELEE_LOOK[G.cls.id] ? meleeBig(fxReach, def.kind, skill.lv) : casterBig(fxReach, def.kind, skill.lv);
  // A caster's blow leaves 연's small hit spark of its element on each one struck.
  const spark = MELEE_LOOK[G.cls.id] ? null : sparkOf(skill.id, def);
  const smite = (o, d, push) => {
    G.spark = spark;
    const r = hurtEnemy(o, d, push);
    G.spark = null;
    return r;
  };
  // 연's Cast → Shot → Hit, where it has the pieces: the call over the hero (독수리소환's eagle,
  // 삼족오), then the shot flying to each one (기공구슬's orbs) before the hit lands on it.
  // A row or a burst round the hero may have its own small hit on each one struck (추격, 천지파열).
  // 스킬 2차 개편: a spell may name its stages itself (data.js fxCast · fxShot · fxHit · fxAfter), each a
  // 연 strip of its own class: the call over the hero, the shot flying, the spark on each struck, and
  // what stays a moment where it landed — the high tiers are several pictures in turn, not one.
  const castPic = def.fxCast || 'k_x_' + skill.id + '_cast', shotPic = def.fxShot || 'k_x_' + skill.id + '_shot';
  const hitPic = def.fxHit && M.fx[def.fxHit] ? def.fxHit : M.fx['k_x_' + skill.id + '_hit'] ? 'k_x_' + skill.id + '_hit' : null;
  // (drawn once the spell is cast (after the switch below): a spell with no foe in its reach waits (retry) and
  // shows nothing — its call over the hero went up every 0.3 s while it waited, a blade swung at an empty field)
  const castAt = G.fxs.length, castOk = M.fx[castPic] && (def.fxCast ? def.kind !== 'heal' : ['spell', 'strike', 'nova', 'line'].includes(def.kind));
  let hitN = 0;
  const hitOn = e => { if (hitPic && hitN++ < 8) fxOn(hitPic, e, { scale: def.hitScale || 1.1 }); };
  let afterN = 0;
  // (보이는 범위 = 맞는 범위: what stays where it landed no wider than what was struck there — `cap` tiles)
  const afterAt = (x, y, delay = 0, cap = ONE_TILES) => {
    if (!def.fxAfter || !M.fx[def.fxAfter] || afterN++ >= 3) return;
    const sc = def.afterScale || 1;
    later(delay, () => tkLoop(def.fxAfter, x, y, def.afterT || 0.8, { scale: sc * capK(def.fxAfter, sc, cap), alpha: settings.calmFx ? 0.5 : 0.8 }));
  };
  const shoot = e => {
    if (!M.fx[shotPic] || !e) return 0;
    const q = G.player, dx = e.x - q.x, dy = e.y - 20 - (q.y - 26), fl = Math.min(0.22, 0.08 + Math.hypot(dx, dy) / 1600);
    addFx(shotPic, q.x, q.y - 26, { mv: [dx, dy, fl], rot: Math.atan2(dy, dx) + Math.PI / 2, scale: 1.3, cap: ONE_TILES });
    return fl;
  };
  classFlourish(def, skill, st);
  const p = G.player;
  if (MELEE_LOOK[G.cls.id] && def.dmg) {
    // Its own picture on each one struck: the class's flash and slash arcs keep out of its way.
    // (A row's one travelling picture leaves the class's flash on each it passes.)
    if (['strike', 'spell', 'blink', 'smite'].includes(def.kind)) G.ownPicAt = G.t;
    else if (def.kind !== 'slash') G.areaAt = G.t;
  }
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
        smite(under, st.dmg);
      }
      const foeAt = (dx, dy) => { const b = occ.get(key(p.tx + dx, p.ty + dy)); return b && b.m && !b.ally && !(b.war && b.team === SIDE); };
      const fx0 = p.fdx || 0, fy0 = fx0 ? 0 : p.fdy || 1;
      let near = DIRS.filter(([dx, dy]) => foeAt(dx, dy));
      if (!near.length && def.dash) {
        // 쇄혼비무: only the way the hero faces, to the first monster up to four tiles off.
        let k = 2;
        while (k <= def.dash && !occ.get(key(p.tx + fx0 * k, p.ty + fy0 * k)) && (!G.war || G.war.raid || War.open(p.tx + fx0 * k, p.ty + fy0 * k))) k++;
        const b = occ.get(key(p.tx + fx0 * k, p.ty + fy0 * k));
        if (k <= def.dash && b && b.m && !b.ally && !(b.war && b.team === SIDE) && holdGround(p.tx + fx0 * (k - 1), p.ty + fy0 * (k - 1))) {
          // Held (a war's point, the red floor, 제자리): the flurry reaches the foe; the hero stays.
          if (fxid) fxOn(fxid, b);
          smite(b, st.dmg * 1.6, [fx0, fy0]);
          meleeSlash(b.tx, b.ty, fx0, fy0, 0);
          break;
        }
        if (k <= def.dash && b && b.m && !b.ally && !(b.war && b.team === SIDE) && !occ.has(key(p.tx + fx0 * (k - 1), p.ty + fy0 * (k - 1)))) {
          addFx(fxid, p.x, p.y - 26, { scale: 0.6 });
          const x0 = p.x, y0 = p.y;
          p.tx += fx0 * (k - 1);
          p.ty += fy0 * (k - 1);
          p.x = p.tx * TILE + TILE / 2;
          p.y = p.ty * TILE + TILE - 6;
          p.stepping = false;
          dashFrom(x0, y0);
          near = [[fx0, fy0]];
        }
      }
      if (!near.length) return under ? undefined : retry(0.12);
      // The blow goes the way the hero faces when a monster is there, else to the one beside;
      // the hero's own facing is left alone, so walking stays the player's. (보스 우선: the boss beside first)
      const [ax, ay] = near.find(([dx, dy]) => (bodiesAt(p.tx + dx, p.ty + dy) || []).some(b => b.kind === 'boss'))
        || near.find(([dx, dy]) => dx === fx0 && dy === fy0) || near[0];
      p.lungeAt = G.t;
      p.lungeK = 1;
      p.ldx = ax;
      p.ldy = ay;
      const dirs = [[ax, ay]];
      if (lv >= 3) dirs.push([-ax, -ay]);
      if (lv >= 5) dirs.push([ay, ax], [-ay, -ax]);
      // The blows share one strike's worth (and a half): more blows, not more of everything.
      const dmg = st.dmg * (lv >= 7 ? 1.3 : 1) * 1.6 / hits;
      // 이펙트=판정: a flurry whose picture stays (쇄혼비무's 1.5 s of blades) spreads its blows over it
      const gap = Math.max(0.14, Math.min(0.4, fxLife(fxid) * 0.8 / hits));
      const sEnd = new Map(); // (each tile's picture drawn again only once the last is gone)
      for (let h = 0; h < hits; h++) {
        later(h * gap, () => {
          for (const [dx, dy] of dirs) {
            // Everyone pressed onto the tile takes the blow; the picture once, on the holder.
            const bs = bodiesAt(p.tx + dx, p.ty + dy);
            if (!bs) continue;
            const dk = dx + ',' + dy, draw = G.t >= (sEnd.get(dk) || -1) - 0.05;
            bs.forEach((b, i) => {
              if (!b.m || b.ally || b.hp <= 0) return;
              if (fxid && !i && draw) sEnd.set(dk, G.t + fxOn(fxid, b, { rot: (h % 2) * 0.6 }));
              smite(b, dmg, [dx, dy]);
            });
            meleeSlash(p.tx + dx, p.ty + dy, dx, dy, h);
          }
          // A flurry's last blow lands heavier (as 연's 쇄혼비무 ends on a big cut).
          if (h === hits - 1 && def.fx) meleeImpact(hits >= 4 ? 2 : 1);
          // The swing sweeps on: the two tiles flanking the one struck ahead (diagonally beside the
          // hero) take half the blow, so a heap pressed round the hero is cut, not one tile of it.
          for (const [fx, fy] of [[ax + ay, ay + ax], [ax - ay, ay - ax]]) {
            for (const b of bodiesAt(p.tx + fx, p.ty + fy) || []) if (b.m && !b.ally && b.hp > 0) smite(b, dmg * 0.5, [ax, ay]);
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
      }).sort((a, b) => (b.kind === 'boss') - (a.kind === 'boss') || tdist(a, p) - tdist(b, p)); // (보스 우선: the boss ahead first)
      // Nothing ahead: strike one beside the hero where it stands, without moving.
      const e = ahead[0] || DIRS.map(([dx, dy]) => occ.get(key(p.tx + dx, p.ty + dy))).find(b => b && b.m && !b.ally && !(b.war && b.team === SIDE) && b.hp > 0);
      if (!e) return retry(0.25);
      const bx = e.tx + fx0, by = e.ty + fy0;
      // 연's picture for the way it goes (up, down, left; right the left turned over).
      // (이펙트=판정: its picture on the one it cuts about a body across, and its blows spread over that picture)
      const [bf0, bflip] = dirFx(fxid, skill.id, fx0, fy0), bf = fxFit(bf0, ONE_TILES, 'bl');
      const bgap = Math.max(0.12, Math.min(0.4, fxLife(bf) * 0.8 / (def.count || 1)));
      if (ahead[0] && !occ.has(key(bx, by)) && !holdGround(bx, by)) {
        addFx(bf, p.x, p.y - 26, { scale: 0.7, flip: bflip });
        const x0 = p.x, y0 = p.y;
        p.x = bx * TILE + TILE / 2;
        p.y = by * TILE + TILE - 6;
        heroTile();
        p.stepping = false;
        dashFrom(x0, y0);
      }
      // Its own blows (def.count) on the one it lands by; the targets the 단 add go to others
      // beside it, not again on the same (on a lone boss that tripled the blow).
      // (one picture while it plays, the blows under it: drawn again only once it is gone)
      const bn = def.count || 1, blows = fxLife(bf) > 1 ? beatsUnder(fxLife(bf) - 0.1).map(([t, k]) => [t, k * bn]) : Array.from({ length: bn }, (_, i) => [i * bgap, 1]);
      let bEnd = -1;
      blows.forEach(([at, k], i) => {
        later(at, () => {
          if (e.hp <= 0) return;
          if (G.t >= bEnd - 0.05) bEnd = G.t + fxOn(bf, e, { flip: bflip });
          if (def.curse) e.curse = def.curse;
          // Those pressed onto the same tile are cut with it.
          for (const b of bodiesAt(e.tx, e.ty) || [e]) if (b.m && !b.ally && b.hp > 0) smite(b, st.dmg * k, [fx0, fy0]);
          meleeSlash(e.tx, e.ty, fx0, fy0, i);
          if (i === blows.length - 1) meleeImpact(2);
        });
      });
      const others = around(e.tx, e.ty, 1).filter(o => o !== e && o.hp > 0).slice(0, Math.max(0, st.count - (def.count || 1)));
      others.forEach((o, i) => later(0.1 + i * 0.1, () => {
        if (o.hp <= 0) return;
        fxOn(bf, o, { flip: bflip });
        for (const [dt, k] of beatsUnder(fxLife(bf) - 0.1)) later(dt, () => { if (o.hp > 0) smite(o, st.dmg * k); });
      }));
      break;
    }
    case 'spell': {
      let targets = nearestEnemies(st.count * 3, st.range);
      if (def.weakest) targets.sort((a, b) => a.hp - b.hp);
      // 보스 우선: the boss in reach is the first struck (it may stand past the nearest few of its crowd)
      const sbo = !def.weakest && bossIn(st.range);
      if (sbo) targets = [sbo, ...targets.filter(e => e !== sbo)];
      targets = targets.slice(0, st.count);
      if (!targets.length) return retry(0.25);
      // 이펙트=판정: one foe struck, its picture about a body across (not four tiles round it), the blow
      // spread over the picture's life when it stays (half at once, the rest in beats)
      const spic = fxFit(fxid, ONE_TILES, 'sp');
      targets.forEach((e, i) => later(i * 0.08, () => {
        if (e.hp <= 0) return;
        later(shoot(e), () => {
          if (e.hp <= 0) return;
          const life = fxOnArea(spic, e), at = def.hitAt || 0.3;
          // (hitAt: where in its picture the blow falls, for one cut short of its empty end)
          for (const [dt, k] of beatsUnder(life * (1 - at))) later(life * at + dt, () => {
            if (e.hp <= 0) return;
            const dealt = smite(e, (st.dmg + (def.scaleHp ? p.maxHp * def.scaleHp : 0)) * k);
            if (dt) return;
            hitOn(e);
            if (def.slow) e.slow = def.slow;
            if (def.stun) { e.stun = def.stun; cutBlast(e); }
            if (def.curse) e.curse = def.curse;
            if (def.drain && dealt) heal(dealt * def.drain, false, true);
          });
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
          if (b && b.m && !b.ally && !(b.war && b.team === SIDE)) {
            any = true;
            // (이펙트=판정: a picture on every one struck — a burning row's sixth had none, past addFx's four of one
            // picture — a body across, its blow spread over it while it stays)
            const life = fxOnArea(fxFit(fxid, ONE_TILES, 's4'), b, { must: true }), bx = b.tx, by = b.ty;
            for (const [dt, k] of beatsUnder(life - 0.1)) later(dt, () => { for (const o of bodiesAt(bx, by) || []) if (o.m && !o.ally && o.hp > 0) smite(o, st.dmg * k); });
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
      // 보스 우선: the boss in reach is the first struck (the rest at random, as before).
      const kbo = bossIn(st.range);
      const targets = [...(kbo ? [kbo] : []), ...nearestEnemies(st.count * 3, st.range).filter(e => e !== kbo)
        .sort(def.strongest ? (a, b) => b.maxHp - a.maxHp : () => Math.random() - 0.5)].slice(0, st.count);
      if (!targets.length) return retry(0.3);
      // 이펙트=판정: the picture exactly as wide as what it strikes (2r+1 tiles; one foe: a body across), and
      // a picture that stays strikes while it stays (beatsUnder: the same blow, spread)
      const sr = def.shape === 'plus' ? Math.max(1, st.radius) : st.radius;
      targets.forEach((e, i) => {
        const tx = e.tx, ty = e.ty, fl = shoot(e);
        const [sf, sflip] = dirFx(fxid, skill.id, tx - p.tx, ty - p.ty);
        const so = { delay: i * 0.12 + fl, flip: sflip };
        const life = sr && def.shape !== 'plus' ? fxAtSquare(sf, sr * 2 + 1, tx * TILE + TILE / 2, ty * TILE + TILE - 30, so, 'st') : fxOnArea(fxFit(sf, sr ? sr * 2 + 1 : ONE_TILES, 'st'), e, { ...so, tile: !!sr }), at = def.hitAt || 0.3;
        const inArea = () => (def.shape === 'plus' ? onTiles(plusTiles(tx, ty, sr)) : sr ? around(tx, ty, sr) : onTiles([[tx, ty]]));
        for (const [dt, k] of beatsUnder(life * (1 - at)).slice(1)) later(i * 0.12 + fl + life * at + dt, () => { for (const o of inArea()) smite(o, st.dmg * k); });
        const k0 = beatsUnder(life * (1 - at))[0][1];
        later(i * 0.12 + fl + life * at, () => {
          G.shake = Math.max(G.shake, 0.08);
          const hit = inArea();
          if (MELEE_LOOK[G.cls.id] && !i) {
            // A slam: the ground rings out under it and the screen jolts.
            shock(tx * TILE + TILE / 2, ty * TILE + TILE - 6, (st.radius || 0) + 0.5); // (the ring as wide as the square struck: 2r+1)
            meleeImpact(2);
          }
          for (const o of hit) {
            if (def.slow) o.slow = def.slow;
            if (def.stun) { o.stun = def.stun; cutBlast(o); }
            if (def.curse) o.curse = def.curse;
            smite(o, st.dmg * k0);
            hitOn(o);
            if (o !== e) fling(o, tx, ty);
          }
          afterAt(tx * TILE + TILE / 2, ty * TILE + TILE - 10, 0, sr ? sr * 2 + 1 : ONE_TILES);
          // A field that stays (the 천인's 선풍 whirlpools): it strikes again where it fell, at half weight.
          for (let k = 1; k <= (def.ticks || 0); k++) {
            later(k * 0.45, () => { for (const o of around(tx, ty, st.radius)) smite(o, st.dmg * 0.5); });
          }
        });
      });
      break;
    }
    case 'cleave': {
      // 9차 절섬 (원작 2662 IMG77; 설명창 IMG76: 범위 앞 5×5): only the way the hero faces, the ground ahead struck under the
      // original's blue crescent (o_rp_jeol at the original's own size — 1.5 tiles tall, its pivot its own middle — sweeping
      // out from the hero to the far row and fading, 0.39 s as in the scene). 이펙트=판정: what it sweeps — `depth` tiles
      // ahead, `half` to each side (the crescent is 1.5 tiles tall: the hero's own row, half 0 — not the tooltip's 5×5).
      const j9 = def.jeol9;
      if (j9 && G.cls.id === 'reaper' && (promoOf('reaper') >= 9 || G.training) && M.fx[j9.fx]) {
        const fx = p.fdx || (p.fdy ? 0 : p.face || 1), fy = fx ? 0 : p.fdy;
        const ux = Math.sign(fx), uy = Math.sign(fy);
        const tiles = [];
        for (let a = 1; a <= j9.depth; a++) for (let s = -j9.half; s <= j9.half; s++) tiles.push([p.tx + ux * a + uy * s, p.ty + uy * a + ux * s]);
        const hit = onTiles(tiles).sort((a, b) => Math.hypot(a.tx - p.tx, a.ty - p.ty) - Math.hypot(b.tx - p.tx, b.ty - p.ty));
        if (!hit.length && !st.nine) return retry(0.2);
        // (drawn going right: flipped going left, turned for up and down; out from a tile ahead to the square's far half)
        const jl = j9.life || 0.39;
        const f = { id: j9.fx, x: p.x + ux * TILE * 0.8, y: p.y - 22 + uy * TILE * 0.8, t: 0, life: jl, scale: 1, rot: 0, anchor: 'bottom',
          alpha: settings.calmFx ? 0.85 : 1, must: true, mv: [ux * TILE * (j9.depth - 1.4), uy * TILE * (j9.depth - 1.4), jl * 0.8], fadeOut: 0.12 };
        if (ux < 0) f.flip = true;
        if (uy) f.rot = uy < 0 ? -Math.PI / 2 : Math.PI / 2;
        G.fxs.push(f);
        later(0.08, () => {
          G.shake = Math.max(G.shake, 0.06);
          meleeImpact(2);
          G.quietHit = true; // (no hit marks of another's: the crescent is what strikes)
          for (const e of hit.slice(0, j9.max || 99)) if (e.hp > 0) smite(e, st.dmg, [ux, uy]);
          G.quietHit = false;
        });
        break;
      }
      // Ahead of the hero in an inverted triangle, turning first to where most monsters stand (the boss's way first: aimWorth).
      // The triangle deepens a row at 4단 and 8단 (1 → 4 → 9 tiles); grown spells count as 8단.
      const depth = def.depth || 1 + Math.floor((def.evolved ? 8 : skill.lv) / 4);
      let best = null, most = 0;
      for (const [dx, dy] of [[p.fdx, p.fdy], ...DIRS]) {
        if (!dx && !dy) continue;
        const hit = onTiles(triTiles(p.tx, p.ty, dx, dy, depth));
        const w = aimWorth(hit);
        if (w > most) { most = w; best = [dx, dy, hit]; }
      }
      if (!best) return retry(0.2);
      const [dx, dy, hit] = best;
      if (def.hpCost) p.hp = Math.max(1, p.hp * (1 - def.hpCost));
      // The picture stands in the middle of the triangle.
      const mid = (depth + 1) / 2;
      const [cf, cflip] = dirFx(fxid, skill.id, dx, dy);
      // 이펙트=판정: the picture set in the triangle's middle (not hung from its pivot at the hero: 연's way pictures
      // reached behind and past it) and drawn over the triangle's box (its depth, its far row's width: fxRect);
      // what it strikes is the triangle, while the picture stays.
      // (보이는 범위 = 맞는 범위: as deep as the triangle and as wide as its far row — at least a body, ONE_TILES)
      const along = Math.max(ONE_TILES, depth + 0.2), across = Math.max(ONE_TILES, depth * 2 - 1);
      const clife = fxAt(dx ? fxRect(cf, along, across, 'cv') : fxRect(cf, across, along, 'cv'), p.x + dx * mid * TILE, p.y - 24 + dy * mid * TILE, { flip: cflip });
      const cbeats = beatsUnder(clife - 0.12);
      const cx0 = p.tx, cy0 = p.ty;
      for (const [dt, k] of cbeats.slice(1)) later(0.12 + dt, () => { for (const e of onTiles(triTiles(cx0, cy0, dx, dy, depth)).slice(0, def.max || 99)) smite(e, (st.dmg + (def.scaleHp ? p.maxHp * def.scaleHp : 0)) * k); });
      later(0.12, () => {
        G.shake = Math.max(G.shake, 0.1);
        if (def.cls !== 'all') meleeImpact(2);
        for (const e of hit.slice(0, def.max || 99)) {
          if (def.stun) { e.stun = def.stun; cutBlast(e); }
          smite(e, (st.dmg + (def.scaleHp ? p.maxHp * def.scaleHp : 0)) * cbeats[0][1], [dx, dy]);
          hitOn(e);
          fling(e, p.tx, p.ty);
        }
        afterAt(p.x + dx * mid * TILE, p.y - 10 + dy * mid * TILE, 0, Math.max(ONE_TILES, depth));
      });
      break;
    }
    case 'line': {
      // 무형검, 파천검무: a row of tiles ahead, turning to the row with most monsters (the boss's row first: aimWorth).
      // A row that carries the hero (파천검무) goes only the way it faces; one that does not
      // (무형검) may strike the row with most monsters. The hero is not turned either way.
      let best = null, most = 0;
      const ways = def.dash ? [[p.fdx || 0, p.fdx ? 0 : p.fdy || 1]] : [[p.fdx, p.fdy], ...DIRS];
      for (const [dx, dy] of ways) {
        if (!dx && !dy) continue;
        const tiles = [];
        for (let k = 1; k <= def.depth; k++) tiles.push([p.tx + dx * k, p.ty + dy * k]);
        const hit = onTiles(tiles);
        const w = aimWorth(hit);
        if (w > most) { most = w; best = [dx, dy, hit]; }
      }
      if (!best) return retry(0.25);
      const [dx, dy, hit] = best;
      // 연 sends one arrow, beam or cut along the row and a small hit on each it passes (not a
      // copy of the spell on every one in it): the spell's picture goes from the hero to the
      // row's end, and each in the row is struck as it reaches it (the class's flash or the
      // spell's spark on it). A beam (광폭기조사) stands along the row at once instead.
      const lx = p.tx, ly = p.ty, len = def.depth * TILE, dur = 0.14 + 0.025 * def.depth;
      const beam = M.fx['k_x_' + skill.id + '_beam'];
      // 이펙트=판정: what is drawn lies on the row it strikes — a beam laid along the row's own tiles (it hung
      // from its pivot, half of it behind the hero), 연's way picture set over the row's middle — each as long as
      // the row and two tiles across it (fxRect; from its pivot at the hero it reached behind and far to the sides), a flying one a body
      // across going down the row. A beam or a way picture that stays strikes the row while it stays.
      const rmid = (def.depth + 1) / 2;
      let llife = 0;
      if (beam) {
        llife = fxAt(fxRect('k_x_' + skill.id + '_beam', LINE_ACROSS, def.depth, 'bm'), p.x + dx * rmid * TILE, p.y - 24 + dy * rmid * TILE, { rot: Math.atan2(dy, dx) + Math.PI / 2 });
      } else {
        const [lf, lflip] = dirFx(fxid, skill.id, dx, dy);
        const lfx = M.fx[lf];
        const way = lfx && M.fx['k_v_' + skill.id + '_l'] && lfx.ax !== undefined;
        if (way) llife = fxAt(dx ? fxRect(lf, def.depth, LINE_ACROSS, 'lw') : fxRect(lf, LINE_ACROSS, def.depth, 'lw'), p.x + dx * rmid * TILE, p.y - 24 + dy * rmid * TILE, { flip: lflip });
        else {
          addFx(fxFit(lf, ONE_TILES, 'lf'), p.x + dx * TILE * 0.5, p.y - 24 + dy * TILE * 0.5,
            { mv: [dx * (len - TILE * 0.5), dy * (len - TILE * 0.5), dur], flip: lf === fxid ? dx < 0 : lflip });
          // (gone a moment after its flight: it lay on at the row's end a second, striking nothing)
          const f = G.fxs[G.fxs.length - 1];
          if (f && f.mv) f.life = Math.min(f.life, dur + 0.35);
        }
      }
      for (const [dt, k] of beatsUnder(llife - 0.1).slice(1)) later(0.1 + dt, () => {
        const row = [];
        for (let k2 = 1; k2 <= def.depth; k2++) row.push([lx + dx * k2, ly + dy * k2]);
        for (const e of onTiles(row)) smite(e, st.dmg * k);
      });
      const lk = beatsUnder(llife - 0.1)[0][1];
      later(0.04, () => meleeImpact(2));
      for (const e of hit) {
        const d = Math.max(Math.abs(e.tx - lx), Math.abs(e.ty - ly));
        later(0.04 + (beam ? 0.06 : dur * Math.min(1, d / def.depth)), () => {
          hitOn(e);
          smite(e, st.dmg * lk, [dx, dy]);
          // A thrust drives them on along it; one that went through throws them aside.
          if (def.dash) fling(e, e.tx - dy, e.ty - dx); else fling(e, lx, ly);
        });
      }
      if (MELEE_LOOK[G.cls.id]) streak(p.x, p.y - 22, dx, dy, def.depth);
      afterAt(p.x + dx * len, p.y - 10 + dy * len, dur);
      if (def.dash) {
        const x0 = p.x, y0 = p.y;
        // Through the row to the farthest open tile along it.
        for (let k = def.depth + 1; k >= 1; k--) {
          const tx = p.tx + dx * k, ty = p.ty + dy * k;
          if (occ.has(key(tx, ty)) || holdGround(tx, ty)) continue; // (not past a war's point, not onto red)
          p.tx = tx;
          p.ty = ty;
          p.x = tx * TILE + TILE / 2;
          p.y = ty * TILE + TILE - 6;
          p.stepping = false;
          break;
        }
        dashFrom(x0, y0);
      }
      break;
    }
    case 'screen': {
      // The whole screen, as 지폭지술 and its kind struck. 스킬 2차 개편: each has a way of its own
      // (def.pattern), not one flash over everything at once:
      //   flat  — at once (the old way), rain — falling on each foe in turn, ring — running out from
      //   the hero, sweep — a wall crossing the screen the way it faces, pull — drawn in, then burst,
      //   mark  — every foe marked, then all burst.
      const all = onScreen();
      if (!all.length) return retry(0.5);
      const pat = def.pattern || 'flat';
      const hold = e => {
        if (e.hp <= 0) return false;
        if (def.slow) e.slow = def.slow;
        if (def.curse) e.curse = def.curse;
        if (def.stun) { e.stun = def.stun; cutBlast(e); }
        return true;
      };
      const far = e => (def.falloff ? Math.max(0.2, 1 - def.falloff * tdist(e, p)) : 1);
      const big = (hold = 0) => { const [scf, scflip] = dirFx(fxReach, skill.id, p.fdx, p.fdy); return screenFx(scf, skill.id, def.frac || 0.9, scflip, hold); };
      // 이펙트=판정: a screen picture that stays strikes the screen while it stays (the same blow, spread in beats)
      const screenBeats = (end, at) => {
        const bs = beatsUnder(end - at);
        for (const [dt, k] of bs.slice(1)) later(at + dt, () => { if (!G.dead) for (const e of onScreen()) if (e.hp > 0 && !e.ally && !(e.war && e.team === SIDE)) smite(e, st.dmg * far(e) * k); });
        return bs[0][1];
      };
      if (pat === 'flat') {
        const k0 = screenBeats(big(), 0.35);
        later(0.35, () => {
          G.shake = Math.max(G.shake, 0.25);
          for (const e of all) if (hold(e)) { smite(e, st.dmg * far(e) * k0); hitOn(e); }
        });
      } else if (pat === 'rain') {
        const order = all.slice().sort(() => Math.random() - 0.5), span = def.span || 1.1;
        const drop = def.fxDrop && M.fx[def.fxDrop] ? bigFx(def.fxDrop, def.dropSize || 110, 'drop') : null;
        // (이펙트=판정: the drops fall on a dozen; more than that on the screen, the screen picture shows too)
        if ((!def.fxCast && !def.noBig) || !drop || order.length > 12) big(0.15 + span + 0.25);
        order.forEach((e, i) => {
          const at = 0.15 + (i / order.length) * span;
          if (drop && i < 12) later(at, () => { if (e.hp > 0) addFx(drop, e.x, e.y + 4, { anchor: 'bottom' }); });
          later(at + 0.15, () => { if (hold(e)) { smite(e, st.dmg * far(e)); hitOn(e); G.shake = Math.max(G.shake, 0.08); } });
        });
      } else if (pat === 'ring') {
        const k0 = screenBeats(big(), 0.6);
        for (const e of all) {
          const at = 0.2 + tdist(e, p) * 0.045;
          later(at, () => { if (hold(e)) { smite(e, st.dmg * far(e) * k0); hitOn(e); } });
        }
        for (let k = 1; k <= 3; k++) later(0.15 + k * 0.12, () => shock(p.x, p.y - 4, k * 2.5));
        afterAt(p.x, p.y - 10, 0.3, 2 * viewTiles().h + 1);
      } else if (pat === 'sweep') {
        const dx = p.fdx || (p.fdy ? 0 : p.face || 1), dy = dx ? 0 : p.fdy, v = viewTiles();
        const along = e => (e.tx - p.tx) * dx + (e.ty - p.ty) * dy, from = -(dx ? v.w : v.h), span = 2 * (dx ? v.w : v.h);
        // (이펙트=판정: the wall across the whole screen — three-tile walls side by side over its width, each drawn,
        // not the three of them the four-of-one limit let through — and gone as it passes on)
        const wall = fxSquare(fxReach, 3, 'wall'), side = dx ? v.h : v.w, lanes = Math.ceil(side / 3);
        for (let s = 0; s < 5; s++) {
          const a = from + span * (s + 0.5) / 5;
          later(0.08 + s * 0.12, () => {
            for (let k = -lanes; k <= lanes; k++) {
              fxAt(wall, p.x + (dx * a + dy * k * 3) * TILE, p.y - 24 + (dy * a + dx * k * 3) * TILE, { flip: dx < 0 });
              const f = G.fxs[G.fxs.length - 1];
              if (f) f.life = Math.min(f.life, 0.45);
            }
          });
        }
        for (const e of all) {
          const at = 0.12 + Math.max(0, Math.min(1, (along(e) - from) / span)) * 0.6;
          later(at, () => { if (hold(e)) { smite(e, st.dmg * far(e), [dx, dy]); hitOn(e); } });
        }
      } else if (pat === 'pull') {
        const kp = screenBeats(big(), 0.55);
        const ring = [];
        for (let r = 1; r <= 3; r++) for (let yy = -r; yy <= r; yy++) for (let xx = -r; xx <= r; xx++) if (Math.max(Math.abs(xx), Math.abs(yy)) === r) ring.push([p.tx + xx, p.ty + yy]);
        all.slice().sort((a, b) => tdist(a, p) - tdist(b, p)).slice(0, 16).forEach(e => {
          const spot = ring.filter(([x, y]) => free(x, y) && Math.hypot(x - p.tx, y - p.ty) < tdist(e, p)).sort((a, b) => Math.hypot(a[0] - e.tx, a[1] - e.ty) - Math.hypot(b[0] - e.tx, b[1] - e.ty))[0];
          if (spot) tkShove(e, spot[0], spot[1]);
        });
        later(0.55, () => {
          G.shake = Math.max(G.shake, 0.3);
          shock(p.x, p.y - 4, 3.5);
          for (const e of all) if (hold(e)) { smite(e, st.dmg * far(e) * kp); hitOn(e); }
        });
        afterAt(p.x, p.y - 10, 0.55, 2 * viewTiles().h + 1);
      } else if (pat === 'mark') {
        // (the marks first; the screen picture with the burst, when the blows fall — it played before them, over)
        later(0.85, big);
        const km = screenBeats(0.85 + fxLife(dirFx(fxReach, skill.id, p.fdx, p.fdy)[0]), 0.9);
        const mk = def.fxMark && M.fx[def.fxMark] ? def.fxMark : null;
        all.slice(0, 14).forEach((e, i) => { if (mk) later(0.1 + i * 0.03, () => { if (e.hp > 0) fxOn(mk, e, { scale: 0.7 }); }); });
        for (const e of all) e.curse = Math.max(e.curse || 0, 1.2);
        all.slice().sort((a, b) => tdist(a, p) - tdist(b, p)).forEach((e, i) => {
          later(0.9 + Math.min(0.5, i * 0.02), () => { if (hold(e)) { smite(e, st.dmg * far(e) * km); hitOn(e); } });
        });
      }
      break;
    }
    case 'nova': {
      if (def.snare) { if (!snare(def, st, smite, fxid)) return retry(0.3); break; }
      if (def.hpCost) p.hp = Math.max(1, p.hp * (1 - def.hpCost));
      const nf = M.fx[fxid];
      // It strikes as far as its picture is seen to spread, if that is past its own reach.
      const novaScale = nf && nf.cls === 'yeon' ? 1 : nf && nf.add ? 2.2 : 1.4;
      const reach = Math.max(1, Math.floor(Math.max(st.radius || 0, nf && nf.cls === 'yeon' ? seenReach(fxReach, novaScale) : 0) + 1e-6));
      // 이펙트=판정: the burst drawn exactly over the square it strikes (2·reach+1 tiles round the hero; the old
      // ring of light copies out at the reach reached past it), striking while it stays.
      const life = fxAtSquare(fxid, reach * 2 + 1, 0, -24, { follow: true }, 'nv');
      if (MELEE_LOOK[G.cls.id]) shock(p.x, p.y - 4, reach + 0.5);
      const beats = beatsUnder(life - 0.1);
      for (const [dt, k] of beats.slice(1)) later(0.1 + dt, () => { if (!G.dead) for (const e of around(p.tx, p.ty, reach)) smite(e, st.dmg * k); });
      later(0.1, () => {
        meleeImpact(3);
        afterAt(p.x, p.y - 10, 0, reach * 2 + 1);
        for (const e of around(p.tx, p.ty, reach)) {
          if (def.stun) { e.stun = def.stun; cutBlast(e); }
          hitOn(e);
          smite(e, st.dmg * beats[0][1]);
          fling(e, p.tx, p.ty);
        }
      });
      break;
    }
    case 'aura': {
      // 차폐: the monsters beside the hero cannot strike, and are worn down.
      let h = G.fxs.find(f => f.aura === skill);
      if (!h) {
        h = { id: fxSquare(fxid, 3, 'ar'), x: 0, y: -30, t: 0, life: Infinity, scale: 1, rot: 0, follow: true, anchor: 'center',
          aura: skill, loop: true, seenLoop: true, alpha: 0.7 };
        G.fxs.push(h);
      }
      // (이펙트=판정: the ward drawn over the eight beside the hero, which it strikes every turn: 0.5 s at 8단)
      for (const e of around(p.tx, p.ty, 1)) smite(e, st.dmg);
      used = false;
      break;
    }
    case 'summon': {
      for (let i = 0; i < st.count; i++) {
        const m = monsterById[def.allies[(skill.lv + i) % def.allies.length]];
        const spot = DIRS.map(([dx, dy]) => [p.tx + dx, p.ty + dy]).find(([x, y]) => free(x, y) && (!G.war || G.war.raid || War.open(x, y)));
        if (!m || !spot) continue;
        const a = { m, ally: true, scale: 1, t: 0, life: st.duration, dmg: st.dmg, face: 1, phase: 0, cd: 0, atk: 0,
          hp: 1, flash: 0, mdx: 0, mdy: 1 };
        // From 3단 the call brings one of the client's 괴수 (the dress room's 괴수의상), stronger by 단.
        const bk = def.beasts && def.beasts[skill.lv - 1];
        if (bk && M.beast && M.beast[bk] && pic(`beast/${bk}.png`)) {
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
      // 대항전·쟁·공대: the 기원 reaches the allies near (a 도사's as a healer's), its picture on each.
      if (G.war && !SH) War.heroHeal(st.heal, fxReach, G.cls.id === 'poet', low);
      // A 도사 hero in a raid is the party's healer: its 기원 reach everyone standing.
      if (G.stage.raid && !G.war && G.cls.id === 'poet') for (const m of G.party) if (m !== low && !m.down) healMember(m, m.maxHp * st.heal / p.maxHp * 0.6);
      if (def.shieldT) G.buffs.shield = Math.max(G.buffs.shield, G.t + def.shieldT);
      if (def.mana) p.mp = Math.min(p.maxMp, p.mp + p.maxMp * def.mana);
      if (def.guard) G.buffs.guard = Math.max(G.buffs.guard, G.t + def.guard);
      // The 기원's own picture for its grade (누리, 대지, 바다 …), over the hero: at a caster's size
      // everywhere (in a war or a raid, and for the shared 누리의 기원, it was the small one, a ring
      // lost under the hero among the field's blows).
      const hfx = casterBig(fxReach, 'heal', skill.lv) || fxid;
      // (연's own big 기원 pictures — 운공체식's water sphere — drawn at their size were two and a half
      // heroes high round a hero who heals every few seconds: about one and a half now.)
      if (hfx) addFx(hfx, 0, -26, { follow: true, self: true, scale: hfx !== fxid && /^y_/.test(hfx) ? 0.65 : 1 });
      audio.play('skill_' + skill.id, def.kind, skill.lv);
      note(`${skillName(skill.id, skill.lv)}의 효과를 받습니다.`);
      used = false;
      // Not counted as a blow (used stays false), but the 기원 is still a spell said aloud: the
      // casting pose (it had none, the hero stood idle while it went off).
      strikePose('magic');
      p.castUntil = G.t + 0.3;
      break;
    }
    case 'buff': {
      G.buffs[def.buff] = G.t + st.duration;
      if (def.buff === 'stealth') {
        // 투명: the 잠행 begins (AMBUSH); the monsters about lose the hero.
        G.ambush = { at: G.t, k: AMBUSH.k + AMBUSH.kLv * (skill.lv - 1) };
        if (!SH) for (const e of G.enemies) if (!e.kind && tdist(e, p) <= 8) e.lostAt = G.t;
      }
      if (def.buff === 'power') G.buffs.powerK = def.power;
      // 스킬 2차 개편: what each class's buff brings besides (no two alike): 흡혈 (drain: a share of the
      // blows back as life), 치명 (crit: more 치명타), 가속 (haste too), 기운 (aura: strikes round the hero).
      if (def.drain) { G.buffs.drain = G.t + st.duration; G.buffs.drainK = def.drain; }
      if (def.crit) { G.buffs.crit = G.t + st.duration; G.buffs.critK = def.crit; }
      if (def.alsoHaste) G.buffs.haste = Math.max(G.buffs.haste, G.t + st.duration);
      if (def.alsoShield) G.buffs.shield = Math.max(G.buffs.shield, G.t + def.alsoShield);
      if (def.aura) {
        const n = Math.round(st.duration / 0.5), ad = def.aura * Math.pow(1.15, skill.lv - 1);
        for (let k = 1; k <= n; k++) later(k * 0.5, () => {
          if (G.dead) return;
          const near = around(p.tx, p.ty, def.auraR || 1);
          if (near.length && def.fxHit && M.fx[def.fxHit] && k % 2) fxOn(def.fxHit, near[0], { scale: 0.8 });
          for (const e of near) hurtEnemy(e, ad);
        });
      }
      note(`${skillName(skill.id, skill.lv)}의 효과를 받습니다.`);
      const [uf, uflip] = dirFx(fxid, skill.id, p.fdx, p.fdy);
      // 이펙트=판정: a buff that strikes round the hero (def.aura) keeps its picture round the hero, as wide as
      // what it strikes, as long as it strikes (it was one flash at the start and seconds of blows unseen)
      if (def.aura) tkLoopAt(fxSquare(uf, (def.auraR || 1) * 2 + 1, 'au'), 0, -24, Math.round(st.duration / 0.5) * 0.5 + 0.2, { follow: true, alpha: settings.calmFx ? 0.4 : 0.6 });
      else addFx(uf, 0, -26, { follow: true, self: true, flip: uflip });
      break;
    }
    default: {
      // 차수별 고유 기술 (data.js TIER_SKILLS): each kind its own way (TIER_KINDS below). A number
      // back is "nothing for it yet: again in that many seconds".
      const run = TIER_KINDS[def.kind];
      if (!run) break;
      // (its hit picture, def.fxHit, on the first few each blow of it strikes)
      const smiteHit = def.fxHit ? (e, d, push) => { const r = smite(e, d, push); hitOn(e); return r; } : smite;
      const again = run({ skill, st, def, fxid, smite: smiteHit, hitOn, afterAt, p });
      if (again) return retry(again);
      break;
    }
  }
  // the call over the hero, under what the spell drew, now that it went off
  if (castOk && !skill.waiting) {
    const n = G.fxs.length;
    // (the call strikes nothing: over the caster, about its body — 보이는 범위 = 맞는 범위; it was 150 px, three tiles)
    addFx(castPic, 0, -30, { follow: true, self: true });
    if (G.fxs.length > n && castAt < n) G.fxs.splice(castAt, 0, G.fxs.pop());
  }
  if (SH) return; // (an AI's cast: what follows is the hero's own — its passives, words, sounds, pose)
  // 9차 절섬 (data.js S9: nine): from the 9차 승급, a second cut follows the first
  if (used && def.nine && !st.nine && (promoOf(G.cls.id) >= 9 || (def.jeol9 && G.training))) later(def.nine.at || 0.3, () => { if (!G.dead) cast(skill, { ...st, dmg: st.dmg * def.nine.k, nine: true }); });
  // 명천검파 (원작 9차; 2662에 장면이 없어 패시브, 그림 없음 — data.js mcheon9): every third cast of a 검기 skill goes
  // out once more a moment later, at most once in five seconds (원작: 검기 3회 발사 · 쿨타임 5초)
  if (used && def.mcheon9 && !st.nine && G.cls.id === 'warrior' && (promoOf(G.cls.id) >= 9 || G.training)) {
    const m = def.mcheon9;
    G.mcheonN = (G.mcheonN || 0) + 1;
    if (G.mcheonN >= m.every && G.t >= (G.mcheonAt || 0)) {
      G.mcheonN = 0;
      G.mcheonAt = G.t + m.cd;
      later(m.at, () => { if (!G.dead) cast(skill, { ...st, dmg: st.dmg * m.k, nine: true }); });
      note('명천검파: 검기가 한 번 더 나갑니다.');
    }
  }
  if (used && def.wind9 && (promoOf(G.cls.id) >= 9 || G.training || window.__windAlways)) heukWind(def.wind9, skill);
  // 화살비폭격 (원작 9차 패시브): 염시투사·응축뇌전시·마탄 bring the rain of arrows before the hero
  if (used) hwasalbi9(skill, st);
  // 마력폭풍 (원작 9차 패시브): 마력파장·기공신장 bring, three times in ten, bolts of 마력 down on the nearest
  if (used) mstorm9(skill, st);
  // 전도체 (원작 9차 패시브): 천뢰마옥쌍구 or 뇌격구 brings 과전류, one time in two (9차 승급부터, 수련장에서는 늘)
  const oc = SKILLS.m_jeondo && SKILLS.m_jeondo.proc9;
  if (used && oc && oc.ids.includes(skill.id) && G.cls.id === 'mage' && (promoOf('mage') >= 9 || G.training) && (window.__overAlways || Math.random() < oc.chance)) {
    if (!(G.overcur > G.t)) note('전도체: 과전류 상태가 됩니다.');
    G.overcur = G.t + oc.dur;
  }
  // 천공의공명 (원작 9차 패시브): a 천기 skill rings the 풍랑의표식 (9차 승급부터, 수련장에서는 늘)
  const gm = SKILLS.cl_gongmyeong && SKILLS.cl_gongmyeong.gong9;
  if (used && gm && !st.nine && gm.ids.includes(skill.id) && G.cls.id === 'celestial' && (promoOf('celestial') >= 9 || G.training)) gongmyeong(gm, skill, st);
  // 불길한혼불 (원작 9차 패시브): a fire skill bursts the soul fires clinging to the foes round (9차 승급부터, 수련장에서는 늘)
  const hb = SKILLS.dk_honbul && SKILLS.dk_honbul.honbul9;
  if (used && hb && !st.nine && hb.ids.includes(skill.id) && G.cls.id === 'dokkaebi' && (promoOf('dokkaebi') >= 9 || G.training)) honbul(hb, skill, st);
  // 묵혈독바르기: a striking skill cast while the blade is coated takes a charge — its blows for the next second leave 묵혈독
  if (used && G.coat9 && def.kind !== 'coat9' && (def.dmg || def.hit) && G.t < G.coat9.until && G.coat9.n > 0) {
    G.coat9.n--;
    G.coat9.win = G.t + 1.2;
    if (!G.coat9.n) G.coat9.until = G.t + 1.2;
  }
  if (used || def.kind === 'heal') shout(skillName(skill.id, skill.lv), def.kind === 'slash');
  if (used) battleInfo('cast', null, () => `[${skillName(skill.id, skill.lv)}]을(를) 외웠습니다.`);
  if ((used || def.kind === 'heal') && window.__castLog) window.__castLog.push([skill.id, def.kind, +G.t.toFixed(2), Math.min(99, ...G.enemies.filter(e => e.hp > 0 && !e.ally && !(e.war && e.team === SIDE)).map(e => tdist(e, p)))]); // test: casts with no foe about
  if (used && (def.dmg || def.kind === 'nova')) G.lastHit = G.t;
  if (used) {
    // (The field goes dark only under a 필살기 (castUlt): a plain skill comes round every few seconds,
    // and a dark sheet each time — 마도사's 광폭멸천강·광폭파장 did — read as the screen flickering.)
    audio.play('skill_' + skill.id, def.kind, skill.lv);
    // (A blink is a dash and a strike, but a caster's own (주술사's 이형환위) is a spell: the cast.)
    const melee = def.kind === 'slash' || (def.kind === 'blink' && !['mage', 'poet', 'magus'].includes(G.cls.id)) || (def.kind === 'spell' && G.cls.id === 'warrior')
      || (WEAPON_POSE.has(G.cls.id) && !['buff', 'heal'].includes(def.kind));
    // A 기원 of any kind (운기, 메밀묵섭취, 저승의기원 are 'regen', 신성제마술 a cleanse) is cast, never swung.
    strikePose(melee && !isMend(def) ? 'attack' : 'magic');
    G.player.castUntil = G.t + 0.3; // 기본 공격: not in the middle of a cast
  }
}

// ---------------------------------------------------------------- 궁사 9차 (원작 2662 IMG40·42·44)
/** 응축뇌전시 (원작 2662 IMG44, its first part): the great lightning arrow (o_a_eungbolt at the original's own size, drawn
 *  going right, turned the way it flies) shot the way the hero faces (사용자 규칙: a line skill only that way — it waits while
 *  nothing stands ahead), up to `depth` tiles — only as far as leaves the rune disk at its end whole on the screen (up or down:
 *  some two tiles). What it passes on its own row is struck (the arrow is a tile across: 이펙트=판정); those a tile beside its way
 *  are drawn onto it a step before the head comes (끌어당김), and struck as it passes them. At its end the blue rune disk
 *  opens (o_a_eungvortex, its middle the arrow's end): what stands within `endR` game pixels of it (the disk's own round)
 *  is drawn a step in and blown up as the disk shatters. 이펙트=판정: the arrow's row, the disk. */
function eungchuk9(st, def, smite) {
  const p = G.player;
  let [dx, dy] = faceWay();
  if (window.__eungDir) [dx, dy] = window.__eungDir; // (test: the way it is shot)
  const R = def.endR || 92;
  let D = def.depth;
  if (G.camView) {
    // (the disk whole on the screen: its middle kept `R` inside the view — up or down the screen is short)
    const [cx0, cy0] = G.camView, xh = p.x, yh = p.y - 24;
    const off = k => { const x = xh + dx * k * TILE, y = yh + dy * k * TILE; return x < cx0 + R + 4 || x > cx0 + VW - R - 4 || y < cy0 + R + 4 || y > cy0 + VH - R - 4; };
    while (D > 2 && off(D)) D--;
  }
  const band = [];
  for (let k = 1; k <= D; k++) for (let o = -1; o <= 1; o++) band.push([p.tx + dx * k + (dy ? o : 0), p.ty + dy * k + (dx ? o : 0)]);
  if (!onTiles(band).length) return 0.3;
  p.fdx = dx; p.fdy = dy;
  if (dx) p.face = dx;
  const run = G, sx = p.tx, sy = p.ty, len = D * TILE, x0 = p.x, y0 = p.y - 24, dur = def.dur * D / def.depth, steps = Math.max(2, Math.round(dur / 0.075));
  const ex = x0 + dx * len, ey = y0 + dy * len, rot = Math.atan2(dy, dx), alpha = settings.calmFx ? 0.8 : 1;
  // the arrow: its head (the cell's pivot) running from the hero to the end
  // (보이는 범위 = 맞는 범위: no longer than the row it runs, D tiles — up or down the screen it was twice the row)
  if (M.fx[def.fx]) G.fxs.push({ id: def.fx, x: x0, y: y0, t: 0, life: dur, scale: capK(def.fx, 1, Math.max(ONE_TILES, D * 1.25), rot), rot, anchor: 'bottom', alpha, must: true, loop: true, mv: [dx * len, dy * len, dur] });
  const seen = new Set();
  for (let s = 1; s <= steps; s++) later(s * (dur / steps), () => {
    if (G !== run) return;
    const k = Math.round((s / steps) * D), cx = sx + dx * k, cy = sy + dy * k;
    // (those beside its way a tile on drawn onto it, before the head reaches them)
    for (const o of [-1, 1]) for (const e of onTiles([[cx + dx + (dy ? o : 0), cy + dy + (dx ? o : 0)]])) if (k < D) tkShove(e, cx + dx, cy + dy);
    G.quietHit = true;
    for (let j = Math.max(1, k - 1); j <= k; j++) for (const e of onTiles([[sx + dx * j, sy + dy * j]])) {
      if (seen.has(e)) continue;
      seen.add(e);
      smite(e, st.dmg * def.k);
    }
    G.quietHit = false;
  });
  later(dur, () => {
    if (G !== run) return;
    if (M.fx[def.fxEnd]) G.fxs.push({ id: def.fxEnd, x: ex, y: ey, t: 0, life: fxLife(def.fxEnd), scale: capK(def.fxEnd, 1, (2 * R) / TILE), rot: 0, anchor: 'bottom', alpha, must: true });
    const inDisk = e => tkFoe(e) && Math.hypot(e.x - ex, e.y - 24 - ey) <= R;
    // drawn in to the middle as the disk turns, blown up as it shatters (its last frames)
    later(0.15, () => { if (G === run) for (const e of G.enemies) if (inDisk(e)) tkShove(e, e.tx - Math.sign(e.tx - (sx + dx * D)), e.ty - Math.sign(e.ty - (sy + dy * D))); });
    later(Math.max(0.2, fxLife(def.fxEnd) - 0.16), () => {
      if (G !== run) return;
      G.shake = Math.max(G.shake, 0.08);
      G.quietHit = true;
      for (const e of G.enemies) if (inDisk(e)) smite(e, st.dmg * def.endBurst);
      G.quietHit = false;
    });
  });
}

const IGI_CROSS = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];
/** 이기뇌멸시 (원작 2662 IMG40): `n` 뇌전시 shot at the nearest foes within `range` (one each, the nearest first). As in the
 *  original (bolts coming down for some 2 s, the 뇌기 lying on the ground to ~4.2 s), the bolts come down on each foe's tile
 *  `waves` times, `waveGap` apart (o_a_igibolt at the original's own size, its pivot the arrowhead's point at the tile's
 *  feet), each striking what stands on that tile as it lands; with the first, the 뇌기 spreads over the ground — a pool of
 *  lightning opens on its tile and on the four beside it (o_a_igipool) and lies there till `poolEnd` s after the cast,
 *  striking what stands on the four every `poolTick` s it lies (the first holds them `stun` s: 경직). 이펙트=판정: the bolts
 *  on their tile, the pools while they lie. */
function igi9(st, def, smite) {
  const p = G.player, foes = tkNear(p.tx, p.ty, st.range || def.range).slice(0, def.n || 5);
  if (!foes.length) return 0.3;
  const run = G, alpha = settings.calmFx ? 0.8 : 1, fall = 0.12, W = def.waves || 3, gap = def.waveGap || 0.6;
  const end = def.poolEnd || 4.2, tick = def.poolTick || 0.8;
  if (Math.abs(foes[0].x - p.x) > 2) p.face = Math.sign(foes[0].x - p.x);
  foes.forEach((t, i) => {
    const tx = t.tx, ty = t.ty, fx = tx * TILE + TILE / 2, fy = ty * TILE + TILE - 6, t0 = i * 0.06;
    for (let w = 0; w < W; w++) later(t0 + w * gap, () => {
      if (G !== run) return;
      // the bolt falls the last stretch onto the spot, and stands a moment
      if (M.fx[def.fx]) G.fxs.push({ id: def.fx, x: fx, y: fy - 60, t: 0, life: fall + 0.3, scale: 1, rot: 0, anchor: 'bottom', alpha, must: true, loop: true, mv: [0, 60, fall] });
      later(fall, () => {
        if (G !== run) return;
        G.quietHit = true;
        for (const e of onTiles([[tx, ty]])) { smite(e, st.dmg / W); if (!w) tkAfflict(e, { stun: def.stun }); }
        G.quietHit = false;
      });
    });
    // the pools open one after another, out from the struck tile, with the first bolt, and lie till `end`
    later(t0 + fall, () => {
      if (G !== run) return;
      IGI_CROSS.forEach(([ox, oy], j) => later(j ? 0.08 : 0, () => {
        if (G !== run) return;
        const px = (tx + ox) * TILE + TILE / 2, py = (ty + oy) * TILE + TILE - 14, life = end - t0 - fall - (j ? 0.08 : 0);
        const f = M.fx[def.fxPool] && tkLoop(def.fxPool, px, py, life, { alpha, anchor: 'bottom' });
        if (f) f.fadeOut = 0.5;
        if (!j) return;
        for (let k = 0; k * tick < life - 0.3; k++) later(k * tick, () => {
          if (G !== run) return;
          G.quietHit = true;
          for (const e of onTiles([[tx + ox, ty + oy]])) { smite(e, st.dmg * (def.poolK || 0.5) / 4); if (!k) tkAfflict(e, { stun: def.stun }); }
          G.quietHit = false;
        });
      }));
    });
  });
}

/** 천궁난사 (원작 2662 IMG42): for `duration` seconds, every `every`, a fire arrow of 천궁 at one of the foes ahead (the way
 *  the hero faces, within `range` tiles; the one in front with the most round it first, then the others in turn); where it
 *  strikes, the great burst of fire (o_a_cheongung at the original's own size, its middle on the foe) — what stands inside
 *  it is struck and burns. 이펙트=판정: the burst's own round (110 game px across, `burstR` 56 from its middle). */
function cheon9(st, def, smite) {
  const p = G.player, r = def.range || 5;
  const ahead = () => {
    const fx = p.fdx || (p.fdy ? 0 : p.face || 1), fy = p.fdx ? 0 : p.fdy || 0;
    return tkNear(p.tx, p.ty, r).filter(e => fx ? Math.sign(e.tx - p.tx) === Math.sign(fx) && Math.abs(e.ty - p.ty) <= Math.abs(e.tx - p.tx) + 1
      : Math.sign(e.ty - p.ty) === fy && Math.abs(e.tx - p.tx) <= Math.abs(e.ty - p.ty) + 1);
  };
  let list = ahead();
  if (!list.length) {
    // (none ahead: turned to the nearest)
    const e = tkNear(p.tx, p.ty, r)[0];
    if (!e) return 0.3;
    const ex = e.tx - p.tx, ey = e.ty - p.ty;
    if (Math.abs(ex) >= Math.abs(ey)) { p.fdx = Math.sign(ex) || 1; p.fdy = 0; p.face = p.fdx; } else { p.fdx = 0; p.fdy = Math.sign(ey); }
    list = ahead();
    if (!list.length) return 0.3;
  }
  const run = G, n = Math.max(1, Math.round((def.duration || 1.25) / (def.every || 0.25))), alpha = settings.calmFx ? 0.8 : 1, used = new Map();
  for (let i = 0; i < n; i++) later(i * (def.every || 0.25), () => {
    if (G !== run || G.dead) return;
    const pool = ahead();
    if (!pool.length) return;
    // the thickest first, then each in turn (the one shot least)
    const t = pool.slice(0, 10).sort((a, b) => (used.get(a) || 0) - (used.get(b) || 0) || around(b.tx, b.ty, 1).length - around(a.tx, a.ty, 1).length)[0];
    used.set(t, (used.get(t) || 0) + 1);
    const tx = t.tx, ty = t.ty, bx = tx * TILE + TILE / 2, by = ty * TILE + TILE - 30, R = def.burstR || 56;
    G.fxs.push({ id: def.fx, x: bx, y: by, t: 0, life: fxLife(def.fx), scale: 1, rot: 0, anchor: 'bottom', alpha, must: true });
    later(0.06, () => {
      if (G !== run) return;
      G.quietHit = true;
      // (이펙트=판정: what stands inside the burst's own round — 110 px across — its body's middle within `burstR`)
      for (const e of G.enemies) if (tkFoe(e) && (e === t || Math.hypot(e.x - bx, e.y - 24 - by) <= R)) { smite(e, e === t ? st.dmg : st.dmg * 0.7); tkAfflict(e, def); }
      G.quietHit = false;
    });
  });
}

/** 화살비폭격 (궁사 9차 패시브; 원작 2662 IMG44, after 응축뇌전시): a cast of one of proc9.ids brings a rain of white arrows
 *  `ahead` tiles before the hero (the way it faces): o_a_hwasalbi (the original's own streaks and dust, its middle there),
 *  striking what stands within its half width and depth `ticks` times as it falls. 이펙트=판정: the rain's ground. */
function hwasalbi9(skill, st) {
  const c = SKILLS.a_hwasalbi && SKILLS.a_hwasalbi.proc9;
  if (!c || !c.ids.includes(skill.id) || G.cls.id !== 'archer' || !(promoOf('archer') >= 9 || G.training || window.__rainAlways)) return;
  if (G.t < (G.rain9At || 0)) return;
  G.rain9At = G.t + (c.cd || 1);
  const p = G.player, fx = p.fdx || (p.fdy ? 0 : p.face || 1), fy = p.fdx ? 0 : p.fdy || 0;
  const x = p.x + Math.sign(fx) * c.ahead * TILE, y = p.y - 20 + fy * c.ahead * TILE, run = G, [hx, hy] = c.half;
  const rf = tkLoop(c.fx, x, y, fxLife(c.fx) * 1.5, { alpha: settings.calmFx ? 0.8 : 1, anchor: 'bottom', scale: c.scale || 1 });
  if (rf) rf.top = true;
  const d = (st.dmg || 30) * c.k;
  for (let k = 0; k < c.ticks; k++) later(0.15 + k * (fxLife(c.fx) * 1.5 - 0.25) / c.ticks, () => {
    if (G !== run || G.dead) return;
    G.quietHit = true;
    for (const e of G.enemies) if (tkFoe(e) && Math.abs(e.x - x) <= hx && Math.abs(e.y - 20 - y) <= hy) hurtEnemy(e, d);
    G.quietHit = false;
  });
}

// ---------------------------------------------------------------- 창술사(무사) 9차 ← 살수 (원작 2662 IMG86·88·90·92·94)
/** 극청룡참 (원작 2662 IMG86; 설명창 IMG85: 청룡의 힘을 빌려 전방에 크게 베어내 피해): the great blue crescent swung round
 *  before the hero, the way it faces (o_l_cheong at the original's own size, drawn facing left — flipped facing right, turned for up
 *  and down; its pivot the hero's feet): every foe it covers — `depth` tiles ahead, `half` to each side — is struck once.
 *  이펙트=판정: the crescent reaches 1.6 tiles ahead, 0.6 behind and 1.1 to each side of the hero's body (`cut`). */
function cheong9(st, def, smite) {
  const p = G.player, [ux, uy] = faceWay(), run = G;
  // (이펙트=판정: what the crescent covers, round the hero's body — `cut` [behind, ahead, to each side] px: it reaches 76 px
  // ahead, 28 behind and 51 to each side, a body's half more — the tile ahead and the two beside, three rows; not two deep)
  const [cb, ca, cs] = def.cut || [-34, 82, 57], cx = p.x, cy = p.y - 20;
  const inCut = e => { const bx = e.x - cx, by = e.y - 20 - cy, a = bx * ux + by * uy, s = bx * uy - by * ux; return tkFoe(e) && a >= cb && a <= ca && Math.abs(s) <= cs; };
  if (!G.enemies.some(inCut)) return 0.3;
  const f = { id: def.fx, x: p.x, y: p.y - 20, t: 0, life: fxLife(def.fx), scale: 1, rot: uy ? (uy < 0 ? Math.PI / 2 : -Math.PI / 2) : 0,
    flip: ux > 0, anchor: 'bottom', alpha: 1, must: true };
  G.fxs.push(f);
  later(0.08, () => {
    if (G !== run || G.dead) return;
    G.quietHit = true;
    for (const e of G.enemies.filter(inCut)) { smite(e, st.dmg); tkAfflict(e, def); }
    G.quietHit = false;
  });
}
/** 이계의침식 (원작 2662 IMG88; 설명창 IMG87: 전방으로 이계에서 불러낸 기운을 발사, 피해와 침식; 맞은 적은 진행방향 좌우로 밀쳐짐;
 *  최대 9칸, 폭 3줄): the 이계 energy runs out the way the hero faces, `depth` tiles: over each stretch in turn the white-blue bursts,
 *  the light pillars, then the dark rubble left in three rows (o_l_ero at the original's own size, one stretch a tile wide, its pivot
 *  the middle row). What the stretch covers (`side` px either side of the line) is struck as it rises, 침식 (cursed: takes more),
 *  and shoved a tile aside of the way. 이펙트=판정: the stretches laid. */
function erode9(st, def, smite) {
  const p = G.player, [ux, uy] = faceWay(), x0 = p.x, y0 = p.y - 14, D = def.depth || 9, run = G;
  const side = uy ? def.sideV || 26 : def.side || 36;
  const inBand = (e, a0, a1) => {
    const ax = (e.x - x0) * ux + (e.y - 20 - y0) * uy, sd = (e.x - x0) * uy + (e.y - 20 - y0) * ux;
    return ax >= a0 && ax < a1 && Math.abs(sd) <= side ? sd : null;
  };
  if (!G.enemies.some(e => tkFoe(e) && inBand(e, TILE / 2, (D + 0.5) * TILE) !== null)) return 0.3;
  const seen = new Set(), step = def.step || 0.06;
  for (let k = 1; k <= D; k++) later((k - 1) * step, () => {
    if (G !== run) return;
    // (보이는 범위 = 맞는 범위: each stretch within the band it strikes there, a tile along and 2·side across)
    G.fxs.push({ id: def.fx, x: x0 + ux * k * TILE, y: y0 + uy * k * TILE + 14, t: 0, life: fxLife(def.fx), scale: capK(def.fx, 1, Math.max(ONE_TILES, (2 * side) / TILE * 1.25)), rot: 0, anchor: 'bottom', alpha: 1, must: true });
    later(0.07, () => {
      if (G !== run || G.dead) return;
      G.quietHit = true;
      for (const e of G.enemies) {
        if (!tkFoe(e) || seen.has(e)) continue;
        const sd = inBand(e, (k - 0.5) * TILE, (k + 0.5) * TILE);
        if (sd === null) continue;
        seen.add(e);
        smite(e, st.dmg);
        tkAfflict(e, def);
        // (shoved aside of the way: to the side it stood on)
        const s = Math.sign(sd) || (Math.random() < 0.5 ? -1 : 1);
        tkShove(e, e.tx + (uy ? s : 0), e.ty + (ux ? s : 0));
      }
      G.quietHit = false;
    });
  });
}
/** 차원개방 (원작 2662 IMG90; 설명창 IMG89: 지속시간 15초 동안 이계의 차원을 몸에 개방 — 이계의낫으로 공격하면 개방한 차원에서
 *  이계의낫 파편이 생성되어 주변의 적들을 공격): the dimension opens in the hero's body (o_l_dimcast: the dark orb, the wisps lashing
 *  out of it), then for `duration`, every `every` seconds while foes stand within `range` tiles, fragments of the 이계의낫 come out
 *  of it on the `shots` nearest — the blue whirling disc (o_l_dimshard at the original's own size, on the foe's feet): that foe and
 *  whoever stands inside the disc (`reach` [rx, ry] px) is cut. 이펙트=판정: the disc. */
function dim9(skill, st, def) {
  const p = G.player, run = G;
  if (!tkNear(p.tx, p.ty, (def.range || 3) + 1).length) return 0.4;
  if (M.fx[def.fxCast]) addFx(def.fxCast, 0, -18, { follow: true, anchor: 'bottom', must: true, self: true });
  const life = def.duration || 15, n = Math.floor(life / def.every), d = tkHit(def, skill), [rx, ry] = def.reach || [46, 34];
  G.buffs.echo = G.t + life;
  for (let k = 1; k <= n; k++) later(0.4 + (k - 1) * def.every, () => {
    if (G !== run || G.dead) return;
    tkNear(p.tx, p.ty, def.range || 3).slice(0, def.shots || 2).forEach((t, i) => later(i * 0.07, () => {
      if (G !== run || t.hp <= 0) return;
      const x = t.x, y = t.y - 6;
      // (보이는 범위 = 맞는 범위: the disc on one foe and those inside it — its reach, a body at the least)
      G.fxs.push({ id: def.fx, x, y, t: 0, life: fxLife(def.fx), scale: capK(def.fx, 1, Math.max(ONE_TILES, (2 * rx) / TILE)), rot: 0, anchor: 'bottom', alpha: 1, must: true, flip: Math.random() < 0.5 });
      later(0.1, () => {
        if (G !== run) return;
        G.quietHit = true;
        for (const e of G.enemies) if (tkFoe(e) && (e === t || ((e.x - x) / rx) ** 2 + ((e.y - 6 - y) / ry) ** 2 <= 1)) hurtEnemy(e, e === t ? d : d * 0.7);
        G.quietHit = false;
      });
    }));
  });
  note(`${skillName(skill.id, skill.lv)}: 이계의 차원이 열립니다.`);
}

// ---------------------------------------------------------------- 마도사 9차 (원작 2662 IMG58·60·62·64·66)
/** The way the hero faces, one of the four: [dx, dy] (a line skill goes only that way — 사용자 결정). */
function faceWay() {
  const p = G.player;
  if (p.fdx) return [Math.sign(p.fdx), 0];
  if (p.fdy) return [0, Math.sign(p.fdy)];
  return [p.face > 0 ? 1 : -1, 0];
}
/** 기공십자광선'쾌 (원작 2662 IMG58 #2-98): for `duration` seconds the mirrors round the hero shoot the cross of 열광선 — the four
 *  arms (o_md_cross9 at the original's own size, drawn going right from the hero's middle, turned for the others) follow the hero;
 *  every `tick` what stands on the hero's row or column within `reach` tiles is struck. A beam that strikes takes in 광폭기: the
 *  blows are `power` stronger meanwhile. 이펙트=판정: the arms (one tile across, `reach` tiles long). */
function cross9(skill, st, def) {
  const p = G.player, run = G, life = st.duration || def.duration, d = tkHit(def, skill), R = def.reach || 5;
  const near = G.enemies.some(e => tkFoe(e) && ((e.ty === p.ty && Math.abs(e.tx - p.tx) <= R) || (e.tx === p.tx && Math.abs(e.ty - p.ty) <= R)));
  if (!near && !tkNear(p.tx, p.ty, R).length) return 0.4;
  const alpha = 1;
  for (const r of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const f = tkLoop(def.fx, 0, -24, life, { follow: true, anchor: 'bottom', alpha });
    if (f) { f.rot = r; f.must = true; }
  }
  let took = false;
  for (let k = 1; k <= Math.round(life / def.tick); k++) later(k * def.tick - 0.2, () => {
    if (G !== run || G.dead) return;
    G.quietHit = true;
    for (const e of G.enemies) {
      if (!tkFoe(e) || !((e.ty === p.ty && Math.abs(e.tx - p.tx) <= R) || (e.tx === p.tx && Math.abs(e.ty - p.ty) <= R))) continue;
      hurtEnemy(e, d);
      if (!took) {
        // (광폭기 흡수: the first beam that strikes)
        took = true;
        G.buffs.powerK = Math.max(G.buffs.power > G.t ? G.buffs.powerK || 0 : 0, def.power || 0.2);
        G.buffs.power = Math.max(G.buffs.power, G.t + life - k * def.tick + 0.2);
      }
    }
    G.quietHit = false;
  });
  note(`${skillName(skill.id, skill.lv)}: 마력의 거울이 십자로 열광선을 쏩니다.`);
}

const SAECHUL_A = Math.atan2(190, -142), SAECHUL_L = 237 * 0.62;
/** 광폭기사출 (원작 2662 IMG62): 광폭기 shot at the foes ahead (the way the hero faces, within `range` tiles), `count` at most,
 *  the nearest first: each a beam from the hero to the foe and its pink burst there (o_md_saechul: the original's lower left beam,
 *  its pivot the hero, turned to the foe and drawn to its distance). 이펙트=판정: the splash at the beam's end — the foe and
 *  whoever stands inside it. */
function saechul9(st, def, smite) {
  const p = G.player, [ux, uy] = faceWay(), r = st.range || def.range || 5;
  const ahead = tkNear(p.tx, p.ty, r).filter(e => ux ? Math.sign(e.tx - p.tx) === ux && Math.abs(e.ty - p.ty) <= Math.abs(e.tx - p.tx) + 1
    : Math.sign(e.ty - p.ty) === uy && Math.abs(e.tx - p.tx) <= Math.abs(e.ty - p.ty) + 1).slice(0, st.count || def.count || 8);
  if (!ahead.length) return 0.3;
  const run = G, x0 = p.x, y0 = p.y - 20, struck = new Set();
  ahead.forEach((t, i) => later(i * 0.03, () => {
    if (G !== run) return;
    // (보이는 범위 = 맞는 범위: the beam as long as the way to the one it strikes — held at least 0.55 of its length, it
    // reached a tile past a foe close by)
    const dx = t.x - x0, dy = t.y - 10 - y0, L = Math.hypot(dx, dy) || 1, sc = Math.max(0.3, Math.min(1.6, L / SAECHUL_L));
    if (M.fx[def.fx]) G.fxs.push({ id: def.fx, x: x0, y: y0, t: 0, life: fxLife(def.fx), scale: sc, rot: Math.atan2(dy, dx) - SAECHUL_A, anchor: 'bottom', alpha: 1, must: true });
    // (이펙트=판정: the pink splash at the beam's end — some 50 px across at the original's length, drawn to the foe's
    // distance (sc) — strikes the foe and whoever else stands inside it; each struck once a cast)
    const bx = t.x, by = t.y - 10, R = (def.splashR || 26) * sc;
    later(0.12, () => {
      if (G !== run) return;
      G.quietHit = true;
      for (const e of G.enemies) if (tkFoe(e) && !struck.has(e) && (e === t || Math.hypot(e.x - bx, e.y - 10 - by) <= R)) { struck.add(e); smite(e, st.dmg); }
      G.quietHit = false;
    });
  }));
}

/** 공간전도 (원작 2662 IMG66, PVP → monsters): the wave of 광폭 sent the way the hero faces, `depth` tiles in `dur` seconds — its
 *  head (o_md_gongjeon, the black hole in its ring) runs ahead, its arcs (o_md_gongarc) left behind it a moment; what it passes
 *  (inside the arcs' tube, `half` px either side of its way) is struck and pushed on a tile (진영 파괴), and at its end what stands within `endR` tiles is
 *  struck and held `stun` seconds (기절). 이펙트=판정: the head's way, the end. */
function gong9(st, def, smite) {
  const p = G.player, [ux, uy] = faceWay(), D = def.depth || 5;
  const run = G, sx = p.tx, sy = p.ty, x0 = p.x, y0 = p.y - 20, len = D * TILE, steps = D;
  const way = [];
  for (let k = 1; k <= D; k++) for (let o = -1; o <= 1; o++) way.push([sx + ux * k + (uy ? o : 0), sy + uy * k + (ux ? o : 0)]);
  if (!onTiles(way).some(e => Math.abs((e.x - p.x) * uy - (e.y - p.y) * ux) <= (def.half || 52))) return 0.4;
  const rot = uy ? (uy > 0 ? Math.PI / 2 : -Math.PI / 2) : 0, flip = ux < 0;
  if (M.fx[def.fx]) G.fxs.push({ id: def.fx, x: x0, y: y0, t: 0, life: def.dur + 0.15, scale: 1, rot, flip, anchor: 'mid', alpha: 1, must: true, loop: true, mv: [ux * len, uy * len, def.dur] });
  const seen = new Set();
  // (the arcs laid every half tile behind the head, overlapping as in the original's tube, each a moment)
  if (M.fx[def.fxArc]) for (let h = 1; h <= 2 * D - 1; h++) later((h / (2 * D)) * def.dur, () => {
    if (G !== run) return;
    const f = tkLoop(def.fxArc, x0 + ux * (h / 2 - 0.3) * TILE, y0 + uy * (h / 2 - 0.3) * TILE, 0.5, { alpha: 1, anchor: 'mid' });
    if (f) { f.rot = rot; f.flip = flip; f.must = true; }
  });
  // (이펙트=판정: the arcs' tube is 104 game px across — what stands with its body's middle inside it, `half` either side of
  // the way, is struck as the head passes)
  const half = def.half || 52;
  for (let s = 1; s <= steps; s++) later((s / steps) * def.dur, () => {
    if (G !== run) return;
    G.quietHit = true;
    for (const e of G.enemies) {
      if (!tkFoe(e) || seen.has(e)) continue;
      const a = (e.x - x0) * ux + (e.y - 20 - y0) * uy, sd = (e.x - x0) * uy - (e.y - 20 - y0) * ux;
      if (a < TILE / 2 || a > (s + 0.5) * TILE || Math.abs(sd) > half) continue;
      seen.add(e);
      smite(e, st.dmg * def.k);
      tkShove(e, e.tx + ux, e.ty + uy);
    }
    G.quietHit = false;
  });
  later(def.dur, () => {
    if (G !== run) return;
    const ex = sx + ux * D, ey = sy + uy * D, R = def.endR || 1.5;
    G.quietHit = true;
    for (const e of G.enemies) if (tkFoe(e) && Math.hypot(e.tx - ex, e.ty - ey) <= R) {
      smite(e, st.dmg);
      tkAfflict(e, { stun: def.stun });
      // (the formation broken: scattered a tile away from the end)
      tkShove(e, e.tx + Math.sign(e.tx - ex || ux), e.ty + Math.sign(e.ty - ey || uy));
    }
    G.quietHit = false;
  });
}

/** 마력폭풍 (마도사 9차 패시브; 원작 2662 IMG60): a cast of one of proc9.ids brings, `chance` of the time, a bolt of 마력 down on up
 *  to `n` of the foes nearest within `range` (o_md_mstorm at the original's own size, its foot on the foe), striking what stands on
 *  that tile. 이펙트=판정: the bolt's foot, one tile. */
function mstorm9(skill, st) {
  const c = SKILLS.md_mstorm && SKILLS.md_mstorm.proc9;
  if (!c || !c.ids.includes(skill.id) || G.cls.id !== 'magus' || !(promoOf('magus') >= 9 || G.training || window.__mstormAlways)) return;
  if (G.t < (G.mstormAt || 0) || (!window.__mstormAlways && Math.random() >= c.chance)) return;
  G.mstormAt = G.t + (c.cd || 0.5);
  const p = G.player, run = G, foes = tkNear(p.tx, p.ty, c.range).slice(0, c.n), d = (st.dmg || 30) * c.k;
  foes.forEach((t, i) => later(0.15 + i * 0.08, () => {
    if (G !== run) return;
    const tx = t.tx, ty = t.ty;
    G.fxs.push({ id: c.fx, x: tx * TILE + TILE / 2, y: ty * TILE + TILE - 8, t: 0, life: fxLife(c.fx), scale: 1, rot: 0, anchor: 'bottom', alpha: 1, must: true });
    later(0.08, () => {
      if (G !== run) return;
      G.quietHit = true;
      for (const e of onTiles([[tx, ty]])) hurtEnemy(e, d);
      G.quietHit = false;
    });
  }));
}

// ---------------------------------------------------------------- 차수별 고유 기술 (TIER_KINDS)
// data.js TIER_SKILLS: each kind below is a way of striking no other spell of the class has —
// a bolt that leaps from foe to foe, a field that burns where it lies, a mark that bursts later
// (or at once, struck by a 선심단멸 or a 광야건곤), a totem, orbs round the hero, a pull, a shove, a
// finishing blow, a dash into the heap ... Each takes the cast's context { skill, st, def, fxid,
// smite, hitOn, p } and returns nothing when it went off, or the seconds to wait for a target.
// Persistent ones (fields, orbs, totems, traps, auras) run on later() ticks of their own; their
// pictures are G.fxs entries kept alive for the effect's life (looped), moved by those ticks.

/** 이펙트=판정: what a picture's own frames draw (a part of a sheet, f0…, only its frames), in its cell's pixels:
 *  { x0, y0, x1, y1 } their union, { mw, mh } the largest frame; null when its sheet knows no frame boxes. */
const fxUnions = new Map();
function fxUnion(id) {
  if (fxUnions.has(id)) return fxUnions.get(id);
  const f = M.fx[id], src = f && (f.src ? M.fx[f.src] || f : f), bb = src && src.bb;
  let u = null;
  if (bb && bb.length >= 4) {
    const f0 = f.f0 || 0, n = f.durs ? f.durs.length : bb.length / 4;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, mw = 0, mh = 0;
    for (let i = f0; i < f0 + n && i * 4 + 3 < bb.length; i++) {
      const b = i * 4;
      if (!bb[b + 2]) continue;
      x0 = Math.min(x0, bb[b]); y0 = Math.min(y0, bb[b + 1]);
      x1 = Math.max(x1, bb[b] + bb[b + 2]); y1 = Math.max(y1, bb[b + 1] + bb[b + 3]);
      mw = Math.max(mw, bb[b + 2]); mh = Math.max(mh, bb[b + 3]);
    }
    if (x1 > x0) u = { x0, y0, x1, y1, mw, mh };
  }
  fxUnions.set(id, u);
  return u;
}
/** 이펙트=판정: a picture drawn exactly `tiles` tiles across (larger or smaller than its own size), so what
 *  is seen is what is struck. */
function fxTiles(id, tiles, tag = 't') {
  const f = id && M.fx[id];
  if (!f) return id;
  // (by what its frames draw — packed sheets know each frame's box — not the empty cell round it)
  // (보이는 범위 = 맞는 범위: all its frames together, as they are drawn — not its largest frame: a picture whose frames
  // move across, a sweep, a rising bolt, reached past the tiles by what they cover between them)
  const u = fxUnion(id), ext = u ? Math.max(u.x1 - u.x0, (u.y1 - u.y0) * (f.ky || 1)) : Math.max(f.w, f.h * (f.ky || 1));
  const now = ext * (f.k || 1), want = tiles * TILE;
  if (Math.abs(now - want) < 2) return id;
  const key = `${id}#${tag}${Math.round(want)}`;
  if (!M.fx[key]) M.fx[key] = { ...f, src: f.src || id, k: (f.k || 1) * want / now };
  return key;
}
/** 보이는 범위 = 맞는 범위: a picture drawn as large as fits in w × h tiles (what all its frames draw, its shape kept). */
function fxIn(id, w, h, tag = 'in', grow = true) {
  const f = id && M.fx[id];
  if (!f) return id;
  const u = fxUnion(id), uw = (u ? u.x1 - u.x0 : f.w) * (f.k || 1), uh = (u ? u.y1 - u.y0 : f.h) * (f.k || 1) * (f.ky || 1);
  const m = Math.min(grow ? 1e9 : 1, (w * TILE) / uw, (h * TILE) / uh);
  if (Math.abs(m - 1) < 0.02) return id;
  const key = `${id}#${tag}${Math.round(w * 10)}x${Math.round(h * 10)}`;
  if (!M.fx[key]) M.fx[key] = { ...f, src: f.src || id, k: (f.k || 1) * m };
  return key;
}
/** 이펙트=판정: how many tiles across a blow on one body is drawn — the body's own size (사용자 규칙, 보이는 범위 =
 *  맞는 범위: a blow on one is drawn about the one it strikes, 1~1.5 tiles; it was 2.2, a burst twice the body). */
const ONE_TILES = 1.4;
/** 이펙트=판정: how many tiles across a row of one tile is drawn (a beam, an arrow's way: the row and a little). */
const LINE_ACROSS = 1.3;
/** 이펙트=판정: fxTiles (once: a tall picture — a pillar, a bolt — measured by its width alone, its height left two or
 *  three times the tiles it strikes). */
function fxFit(id, tiles, tag = 'f') {
  // (보이는 범위 = 맞는 범위: a tall picture too is held to the tiles it strikes by its longer side — measured by its width,
  // a bolt on one body stood three or four tiles over it, a 기원's pillar five)
  return fxTiles(id, tiles, tag);
}
/** 이펙트=판정 for what strikes nothing — a 기원, a buff, a shield on a body (the hero's, a companion's, a raid or war
 *  fighter's): its drawn part never more than SELF_TILES across (a tall one by its width), shrunk only. (사용자 피드백:
 *  구름의 기원's ring stood about five heroes high round a hero it only mends; 완력 on a raid's 도깨비 four tiles wide.)
 *  The scale factor (≤ 1) for the picture at `scale`. */
const SELF_TILES = 1.5;
function selfCapK(id, scale = 1, rot = 0) {
  return capK(id, scale, SELF_TILES, rot);
}
/** 보이는 범위 = 맞는 범위 (사용자 규칙): the scale factor (≤ 1) that keeps a picture at `scale` (turned `rot`) within `tiles`
 *  tiles on its longer side — what all its frames draw together (the union of their boxes, as drawn: k, ky, the turn),
 *  never cut, only shrunk. */
function capK(id, scale, tiles, rot = 0) {
  const f = id && M.fx[id];
  if (!f || !(tiles > 0)) return 1;
  const u = fxUnion(id), k = (f.k || 1) * (scale || 1);
  let w = (u ? u.x1 - u.x0 : f.w) * k, h = (u ? u.y1 - u.y0 : f.h) * k * (f.ky || 1);
  if (rot) { const c = Math.abs(Math.cos(rot)), sn = Math.abs(Math.sin(rot)); [w, h] = [w * c + h * sn, w * sn + h * c]; }
  const ext = Math.max(w, h);
  return ext > tiles * TILE ? (tiles * TILE) / ext : 1;
}
/** 보이는 범위 = 맞는 범위: how many tiles a picture on one body may be — the body's own size (a tile; a big one, a boss,
 *  its height), and a little round it. */
function bodyTiles(b) {
  // (a plain monster stands on one tile: a body across; a boss or a lieutenant drawn over several, its height)
  if (!b || !b.m || !(b.kind === 'boss' || b.kind === 'mini' || b.cmdr)) return ONE_TILES;
  return Math.max(ONE_TILES, Math.min(4, ((b.m.h || TILE) * (b.scale || 1) / TILE) * 1.1));
}
/** 이펙트=판정: where a picture's drawn part (the union of its frames' boxes) has its middle, from its cell's middle,
 *  in game pixels at its size: [x, y]. */
const fxMids = new Map();
function fxMid(id) {
  let m = fxMids.get(id);
  if (m) return m;
  const f = M.fx[id], k = f ? f.k || 1 : 1, ky = f ? f.ky || 1 : 1, u = f && fxUnion(id);
  m = u ? [((u.x0 + u.x1) / 2 - f.w / 2) * k, ((u.y0 + u.y1) / 2 - f.h / 2) * k * ky, (u.x1 - u.x0) * k, (u.y1 - u.y0) * k * ky]
    : [0, 0, f ? f.w * k : 0, f ? f.h * k * ky : 0];
  fxMids.set(id, m);
  return m;
}
/** 이펙트=판정: a picture with its drawn part's middle on (x, y) — a tile's middle is its feet less 24 (or, following
 *  the hero, -24) — not hung from its pivot (연's pivot is the caster's feet: a picture grown to the tiles it strikes
 *  was carried tiles off them). o as addFx's; returns its life. */
function fxAt(id, x, y, o = {}) {
  if (!id || !M.fx[id]) return 0;
  let [mx, my] = fxMid(id);
  const sc = o.scale || 1;
  if (o.flip) mx = -mx;
  if (o.rot) { const c = Math.cos(o.rot), sn = Math.sin(o.rot); [mx, my] = [mx * c - my * sn, mx * sn + my * c]; }
  // (the picture of a blow's area: never left out by addFx's few-at-once limits — o.must, unless told not)
  addFx(id, x - mx * sc, y - my * sc, { must: true, ...o, anchor: 'mid' });
  return fxLife(id);
}
/** fxAt on a body's tile (its feet less 24), following it as fxOn does not: where it stood when struck. */
function fxAtTile(id, tx, ty, o = {}) {
  return fxAt(id, tx * TILE + TILE / 2, ty * TILE + TILE - 30, o);
}
/** 이펙트=판정: a picture drawn over exactly w × h tiles (its drawn part stretched to them: a beam or a way picture
 *  laid on a row — as long as the row, two tiles across it). */
function fxRect(id, w, h, tag = 'r') {
  const f = id && M.fx[id];
  if (!f) return id;
  const u = fxUnion(id), uw = u ? u.x1 - u.x0 : f.w, uh = u ? u.y1 - u.y0 : f.h;
  const k = (w * TILE) / uw, ky = Math.max(0.1, Math.min(12, (h * TILE) / uh / k));
  const key = `${id}#${tag}${w}x${h}`;
  if (!M.fx[key]) M.fx[key] = { ...f, src: f.src || id, k, ky };
  return key;
}
/** fxAt of a picture made the square of `tiles` it strikes (fxSquare); one too flat or too narrow for the stretch
 *  (a sword's streak) is laid two or three times across the square, so the whole square is drawn. */
function fxAtSquare(id0, tiles, x, y, o = {}, tag = 'q') {
  const id = fxSquare(id0, tiles, tag);
  if (!id || !M.fx[id]) return 0;
  const [, , uw, uh] = fxMid(id), want = tiles * TILE, sc = o.scale || 1;
  const ny = uh * sc < want - TILE ? Math.ceil(want / (uh * sc)) : 1, nx = uw * sc < want - TILE ? Math.ceil(want / (uw * sc)) : 1;
  let life = 0;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const ox = nx > 1 ? -want / 2 + (uw * sc) / 2 + (i * (want - uw * sc)) / (nx - 1) : 0;
    const oy = ny > 1 ? -want / 2 + (uh * sc) / 2 + (j * (want - uh * sc)) / (ny - 1) : 0;
    life = fxAt(id, x + ox, y + oy, o);
  }
  return life;
}
/** fxAt on a body (its middle, 24 over its feet); a tall picture (a pillar, a bolt) stood on its feet as fxOn does. */
function fxOnArea(id, b, o = {}) {
  const f = id && M.fx[id];
  if (!f) return 0;
  // (o.tile: an area round the body's tile — on that tile's middle, not on the body, which a crowd draws up to a tile off
  // it: a 3×3 burst stood a tile beside the 3×3 it struck)
  const bx = o.tile ? b.tx * TILE + TILE / 2 : b.x, by = o.tile ? b.ty * TILE + TILE - 6 : b.y;
  // (a pillar: its drawn foot on the body's feet, not hung from its pivot)
  if (f.h > f.w * 1.4) return fxAt(id, bx, by + 4 - fxMid(id)[3] * (o.scale || 1) / 2, o);
  return fxAt(id, bx, by - 24, o);
}
/** tkLoop with the drawn part's middle on (x, y) (fxAt). */
function tkLoopAt(id, x, y, life, o = {}) {
  if (!id || !M.fx[id]) return null;
  const [mx, my] = fxMid(id);
  return tkLoop(id, x - mx, y - my, life, { ...o, anchor: 'mid' });
}
/** 이펙트=판정: a picture drawn over exactly a square of `tiles` tiles — its drawn part (the union of its frames'
 *  boxes) as wide as the square and stretched up or down to its height (a wide burst over a square it strikes left
 *  its top and bottom rows struck under nothing; a pillar squat; within 0.6–1.7 of its own shape). */
function fxSquare(id, tiles, tag = 'q') {
  const f = id && M.fx[id];
  if (!f) return id;
  const u = fxUnion(id), uw = u ? u.x1 - u.x0 : f.w, uh = u ? u.y1 - u.y0 : f.h, want = tiles * TILE;
  const ky = Math.max(0.6, Math.min(1.7, uw / uh));
  // (보이는 범위 = 맞는 범위: one too tall for the stretch is shrunk whole into the square — a pillar stood a tile over it)
  const k = (want / uw) * Math.min(1, uw / (uh * ky));
  const key = `${id}#${tag}s${Math.round(want)}`;
  if (!M.fx[key]) M.fx[key] = { ...f, src: f.src || id, k, ky: (f.ky || 1) * ky };
  return key;
}
/** How long a picture is seen (seconds): its frames' time up to the last that draws anything (연's strips often end
 *  on empty frames — a blow spread to their end struck under nothing). */
const fxSeen = new Map();
function fxLife(id) {
  if (!id || !M.fx[id]) return 0;
  let v = fxSeen.get(id);
  if (v !== undefined) return v;
  const f = M.fx[id], src = f.src ? M.fx[f.src] || f : f, d = durs(id), bb = src.bb, f0 = f.f0 || 0;
  let last = d.length - 1;
  if (bb && bb.length >= 4) while (last > 0 && (f0 + last) * 4 + 2 < bb.length && !bb[(f0 + last) * 4 + 2]) last--;
  v = d.slice(0, last + 1).reduce((a, b) => a + b, 0);
  fxSeen.set(id, v);
  return v;
}
/** 이펙트=판정: a blow under a picture that stays `span` seconds after the blow lands, as [[delay, share], …]:
 *  all at once when the picture is soon gone; else half at once and the rest in beats about every 0.35 s
 *  until it fades (the same blow in all: spread, not multiplied). */
function beatsUnder(span) {
  if (!(span > 0.9)) return [[0, 1]];
  const n = Math.min(10, Math.max(2, Math.round((span - 0.1) / 0.35))), step = (span - 0.1) / n, out = [[0, 0.5]];
  for (let i = 1; i <= n; i++) out.push([i * step, 0.5 / n]);
  return out;
}
/** A foe of the hero's (not its war's or raid's own side, not an ally). */
function tkFoe(e) {
  return e && e.m && e.hp > 0 && !e.ally && !(e.war && e.team === SIDE);
}
/** Foes within `r` tiles of a tile, nearest first. */
function tkNear(tx, ty, r) {
  const out = [];
  for (const e of G.enemies) if (tkFoe(e) && Math.hypot(e.tx - tx, e.ty - ty) <= r) out.push(e);
  return out.sort((a, b) => Math.hypot(a.tx - tx, a.ty - ty) - Math.hypot(b.tx - tx, b.ty - ty));
}
/** A utility skill's blow (its `hit`, grown as a spell's dmg grows: +15% a 단, 힘). */
function tkHit(def, skill) {
  return (def.hit || 0) * Math.pow(1.15, (skill.lv || 1) - 1) * (1 + 0.1 * (G.passives.power || 0));
}
/** A looping picture kept for `life` seconds at (x, y) (or on the hero, follow). */
function tkLoop(id, x, y, life, o = {}) {
  if (!id || !M.fx[id]) return null;
  // (이펙트=판정 seenLoop: it loops over the frames that draw — a strip's blank tail left the field it stands for
  // unseen a moment each turn while it still struck)
  // (보이는 범위 = 맞는 범위: one held over the caster that is not the area it strikes is held to the body, as addFx's)
  if (FXC && o.follow && !o.area && !o.anchor) o = { ...o, scale: (o.scale || 1) * selfCapK(id, o.scale || 1) };
  const f = { id, x, y, t: 0, life, scale: o.scale || 1, rot: 0, follow: o.follow, anchor: o.anchor || 'center', loop: true,
    alpha: o.alpha || 0.85, tint: o.tint, seenLoop: true };
  G.fxs.push(f);
  return f;
}
/** The tile a pixel spot stands on. */
function tkTile(x, y) {
  return [Math.floor(x / TILE), Math.floor((y - TILE / 2 + 6) / TILE)];
}
/** Moves a plain monster to a free tile (a pull or a shove); bosses, a war's or raid's fighters stay. */
function tkShove(e, tx, ty) {
  if (!e || e.hp <= 0 || e.kind || e.war || e.march || G.war || G.stage.raid) return false;
  if ((e.tx === tx && e.ty === ty) || !free(tx, ty)) return false;
  leave(e);
  e.fx = e.tx;
  e.fy = e.ty;
  e.tx = tx;
  e.ty = ty;
  occ.set(key(tx, ty), e);
  e.mt = 0;
  e.dur = 0.18;
  e.moving = true;
  return true;
}
/** The hero leaps to a tile (not onto a taken one, a war's wall or the boss's red); false when it cannot. */
function tkMoveHero(tx, ty) {
  const p = G.player;
  if (!free(tx, ty) || holdGround(tx, ty)) return false;
  const x0 = p.x, y0 = p.y;
  p.x = tx * TILE + TILE / 2;
  p.y = ty * TILE + TILE - 6;
  heroTile();
  p.stepping = false;
  dashFrom(x0, y0);
  return true;
}
/** How many hindrances a foe carries (저주, 둔화, 기절, and each 상태이상 of gyeok.js). */
function tkStatusN(e) {
  let n = (e.curse > 0) + (e.slow > 0) + (e.stun > 0);
  if (e.st) for (const s of Object.values(e.st)) if (s.until > G.t) n++;
  return n;
}
/** The 상태이상 a skill leaves (def.dot: burn, venom, poison) and its holds. */
function tkAfflict(e, def, scale = 1) {
  if (e.hp <= 0) return;
  if (def.slow) e.slow = Math.max(e.slow || 0, def.slow);
  if (def.curse) e.curse = Math.max(e.curse || 0, def.curse);
  if (def.stun && scale >= 1) { e.stun = Math.max(e.stun || 0, e.kind === 'boss' ? Math.min(def.stun, 0.5) : def.stun); cutBlast(e); }
  if (def.dot) applyStatus(e, def.dot, 3, 1);
}
/** The row (of `depth` tiles) out from the hero with the most foes (the boss's first: aimWorth): [dx, dy, foes]. */
function tkBestRow(depth, ways = DIRS) {
  const p = G.player;
  let best = null, most = 0;
  for (const [dx, dy] of [[p.fdx, p.fdy], ...ways]) {
    if (!dx && !dy) continue;
    const tiles = [];
    for (let k = 1; k <= depth; k++) tiles.push([p.tx + dx * k, p.ty + dy * k]);
    const hit = onTiles(tiles);
    const w = aimWorth(hit);
    if (w > most) { most = w; best = [dx, dy, hit]; }
  }
  return best;
}
/** The foe within `range` with the most others round it (radius r): where a field or a leap goes. */
function tkDensest(range, r = 1) {
  const p = G.player;
  let best = null, most = -1;
  for (const e of tkNear(p.tx, p.ty, range).slice(0, 24)) {
    const n = around(e.tx, e.ty, r).length;
    if (n > most) { most = n; best = e; }
  }
  return best;
}
/** A mark that bursts (투도멸진, 투혈사식, 광폭구슬'화, 폭화분격): at once when a 선심단멸 or a finishing blow finds it. */
function tkBurstMark(e) {
  const m = e.tkMark;
  if (!m || m.done) return;
  m.done = true;
  e.tkMark = null;
  m.burst(1.3);
}

const TIER_KINDS = {
  // 사슬벼락, 광폭구슬'뇌: from the nearest foe to the next unstruck within `jump` tiles, `count` times.
  chain({ st, def, fxid, smite }) {
    const p = G.player, first = tkNear(p.tx, p.ty, st.range)[0];
    if (!first) return 0.25;
    const hit = new Set([first]);
    let cur = first;
    const seq = [first];
    while (seq.length < st.count) {
      const nx = tkNear(cur.tx, cur.ty, def.jump || 3).find(e => !hit.has(e));
      if (!nx) break;
      hit.add(nx);
      seq.push(nx);
      cur = nx;
    }
    // (이펙트=판정: the bolt on each a body across, its blow spread over the picture while it stays)
    const cp = fxFit(fxid, ONE_TILES, 'ch'), beats = beatsUnder(fxLife(cp) - 0.1);
    seq.forEach((e, i) => later(i * 0.09, () => {
      if (e.hp <= 0) return;
      fxOnArea(cp, e);
      for (const [dt, k] of beats) later(dt, () => { if (e.hp > 0) smite(e, st.dmg * Math.pow(def.decay || 0.8, i) * k); });
      tkAfflict(e, def);
    }));
  },
  // 혈독주입, 광폭구슬'수: a field (on the hero's feet, or on the thickest of the foes) that strikes
  // what stands in it every `tick` for its life, and leaves its 상태이상.
  zone({ st, def, smite }) {
    const p = G.player;
    let tx = p.tx, ty = p.ty;
    if (def.at !== 'self') {
      const e = tkDensest(st.range, st.radius);
      if (!e) return 0.3;
      tx = e.tx;
      ty = e.ty;
    } else if (!tkNear(p.tx, p.ty, st.radius + 1).length) return 0.3;
    const x = tx * TILE + TILE / 2, y = ty * TILE + TILE - 10, life = st.duration;
    // (이펙트=판정: the field drawn as wide as the tiles it strikes — it was held under 2.6 times its size)
    tkLoopAt(fxSquare(def.fx, st.radius * 2 + 1, 'zn'), x, ty * TILE + TILE - 30, life, { alpha: 0.7 });
    if (def.fx2) addFx(def.fx2, x, y - 10, { scale: 0.8 });
    const n = Math.round(life / def.tick);
    for (let k = 0; k < n; k++) later(k * def.tick + 0.1, () => {
      for (const e of around(tx, ty, st.radius)) { smite(e, st.dmg * def.k); tkAfflict(e, def, 0); }
    });
  },
  // 투도멸진, 투혈사식, 광폭구슬'화, 폭화분격: a mark on a few foes (저주 meanwhile), bursting after `delay`.
  mark({ skill, st, def, smite }) {
    const p = G.player;
    let foes = tkNear(p.tx, p.ty, st.range).filter(e => !e.tkMark);
    if (def.strongest) foes.sort((a, b) => b.maxHp - a.maxHp);
    foes = foes.slice(0, st.count);
    if (!foes.length) return 0.3;
    if (def.hpCost) p.hp = Math.max(1, p.hp - p.maxHp * def.hpCost);
    for (const e of foes) {
      const pic = tkLoop(def.fx, e.x, e.y - 30, def.delay + 0.1, { scale: 0.6 * capK(def.fx, 0.6, bodyTiles(e)), alpha: 0.9 });
      e.curse = Math.max(e.curse || 0, def.delay);
      const mark = { done: false };
      let lx = e.tx, ly = e.ty;
      const follow = () => {
        if (mark.done) return;
        if (e.hp > 0) { lx = e.tx; ly = e.ty; if (pic) { pic.x = e.x; pic.y = e.y - (e.m.h * (e.scale || 1)) * 0.6; } }
        later(0.1, follow);
      };
      follow();
      // (struck down before it bursts, the mark bursts where it fell: it spreads)
      mark.burst = (k = 1) => {
        if (pic) pic.life = pic.t;
        const x = lx * TILE + TILE / 2, y = ly * TILE + TILE - 6;
        if (def.fx2) fxAtTile(fxSquare(def.fx2, st.radius * 2 + 1, 'mk'), lx, ly, { must: true });
        G.shake = Math.max(G.shake, 0.12);
        for (const o of around(lx, ly, st.radius)) { smite(o, st.dmg * k); tkAfflict(o, def, 0); }
      };
      e.tkMark = mark;
      later(def.delay, () => { if (!mark.done) { mark.done = true; if (e.tkMark === mark) e.tkMark = null; mark.burst(1); } });
    }
  },
  // 선심단멸: a curse on the foes round one, then it bursts: more for every hindrance each carries.
  detonate({ st, def, fxid, smite }) {
    const e = tkDensest(st.range, st.radius);
    if (!e) return 0.3;
    const tx = e.tx, ty = e.ty;
    if (def.fx2) fxOn(def.fx2, e, { scale: 0.9 });
    // (이펙트=판정: the burst drawn over the square it strikes, striking while it stays)
    const life = fxLife(fxSquare(fxid, st.radius * 2 + 1, 'dt'));
    const beats = beatsUnder(life - 0.1);
    for (const [dt, k] of beats.slice(1)) later(0.25 + dt, () => { for (const o of around(tx, ty, st.radius)) smite(o, st.dmg * k); });
    later(0.25, () => {
      fxAtTile(fxSquare(fxid, st.radius * 2 + 1, 'dt'), tx, ty);
      G.shake = Math.max(G.shake, 0.15);
      for (const o of around(tx, ty, st.radius)) {
        const n = Math.min(3, tkStatusN(o));
        smite(o, st.dmg * (1 + (def.per || 0.35) * n) * beats[0][1]);
        o.curse = Math.max(o.curse || 0, def.curse || 3);
        tkBurstMark(o);
      }
    });
  },
  // 혼마기, 권기중첩, 영기변환: each cast lays one more stack on a few foes (each a quarter harder);
  // at `stacks` the stack bursts round the one that carried it.
  stack({ skill, st, def, fxid, smite }) {
    const p = G.player, foes = tkNear(p.tx, p.ty, st.range).slice(0, st.count);
    if (!foes.length) return 0.25;
    foes.forEach((e, i) => later(i * 0.08, () => {
      if (e.hp <= 0) return;
      const s = (e.tkStack = e.tkStack || {});
      const n = (s[skill.id] = (s[skill.id] || 0) + 1);
      // (이펙트=판정: its picture on the one struck a body across, the blow spread over it while it stays)
      const life = fxOnArea(fxFit(fxid, ONE_TILES, 'sk'), e);
      for (const [dt, k] of beatsUnder(life - 0.1)) later(dt, () => { if (e.hp > 0) smite(e, st.dmg * (1 + def.per * (n - 1)) * k); });
      if (n >= def.stacks) {
        s[skill.id] = 0;
        if (def.fx2) fxOnArea(fxSquare(def.fx2, 3, 'skb'), e, { tile: true });
        floatText(e.x, e.y - 40, '폭발', '#ffcf5a');
        for (const o of around(e.tx, e.ty, 1)) smite(o, st.dmg * 2.5);
      }
    }));
  },
  // 선기전도: a ring that runs out from the hero a tile at a time, striking and shoving each it meets.
  wave({ st, def, fxid, smite }) {
    const p = G.player;
    if (!tkNear(p.tx, p.ty, st.radius).length) return 0.3;
    const cx = p.tx, cy = p.ty, seen = new Set();
    addFx(fxTiles(fxid, st.radius * 2 + 1, 'wv'), 0, -26, { follow: true, area: true });
    if (def.shieldT) G.buffs.shield = Math.max(G.buffs.shield, G.t + def.shieldT);
    for (let r = 1; r <= st.radius; r++) later(r * 0.09, () => {
      shock(cx * TILE + TILE / 2, cy * TILE + TILE - 6, r + 0.3, '200,240,255');
      for (const e of around(cx, cy, r)) {
        if (seen.has(e)) continue;
        seen.add(e);
        smite(e, st.dmg * (1 - 0.06 * (r - 1)));
        const dx = Math.sign(e.tx - cx), dy = Math.sign(e.ty - cy);
        for (let k = def.push || 1; k >= 1; k--) if (tkShove(e, e.tx + dx * k, e.ty + dy * k)) break;
      }
    });
  },
  // 청명파살: one bolt down the row of most foes, harder with every one it goes through.
  lance({ st, def, fxid, smite }) {
    const p = G.player;
    let best = tkBestRow(def.depth);
    if (!best) {
      // none in line: down the way of the nearest (its longer axis), through whatever is there
      const e = tkNear(p.tx, p.ty, def.depth)[0];
      if (!e) return 0.25;
      const ex = e.tx - p.tx, ey = e.ty - p.ty, dx = Math.abs(ex) >= Math.abs(ey) ? Math.sign(ex) : 0, dy = dx ? 0 : Math.sign(ey);
      const tiles = [];
      for (let k = 1; k <= def.depth; k++) for (const w of [-1, 0, 1]) tiles.push([p.tx + dx * k + dy * w, p.ty + dy * k + dx * w]);
      best = [dx, dy, onTiles(tiles)];
    }
    const [dx, dy, hit] = best, len = def.depth * TILE;
    hit.sort((a, b) => Math.abs(a.tx - p.tx) + Math.abs(a.ty - p.ty) - Math.abs(b.tx - p.tx) - Math.abs(b.ty - p.ty));
    addFx(fxid, p.x + dx * TILE * 0.5, p.y - 22 + dy * TILE * 0.5, { mv: [dx * len, dy * len, 0.3], rot: Math.atan2(dy, dx) + Math.PI / 2 });
    hit.forEach((e, i) => later(0.3 * Math.min(1, (Math.abs(e.tx - p.tx) + Math.abs(e.ty - p.ty)) / def.depth), () => {
      if (e.hp <= 0) return;
      if (def.fx2 && i < 4) fxOn(def.fx2, e, { scale: 0.45 });
      smite(e, st.dmg * (1 + def.grow * i), [dx, dy]);
    }));
  },
  // 운상미보, 위위비보: three tiles back from the nearest foe, untouchable a moment; arrows at a few as it
  // goes (운상미보), or the place it left bursts (위위비보's afterimage).
  evade({ skill, st, def, fxid }) {
    const p = G.player, near = tkNear(p.tx, p.ty, 2.2)[0];
    if (!near || steering()) return 0.4;
    const ox = p.tx, oy = p.ty, dx = Math.sign(p.tx - near.tx), dy = Math.sign(p.ty - near.ty) || (dx ? 0 : 1);
    let moved = false;
    for (let k = 3; k >= 2 && !moved; k--) moved = tkMoveHero(p.tx + dx * k, p.ty + dy * k);
    if (!moved) return 0.6;
    G.buffs.guard = Math.max(G.buffs.guard, G.t + (def.guard || 0.6));
    addFx(fxid, 0, -26, { follow: true, self: true });
    const d = tkHit(def, skill);
    if (def.after) {
      later(0.25, () => {
        if (def.fx2) addFx(def.fx2, ox * TILE + TILE / 2, oy * TILE + TILE - 16, { scale: 1 });
        for (const e of around(ox, oy, st.radius || 1)) hurtEnemy(e, d);
      });
    } else {
      tkNear(p.tx, p.ty, st.range || 6).slice(0, st.count).forEach((e, i) => later(0.1 + i * 0.08, () => {
        if (e.hp <= 0) return;
        if (def.fx2) fxOn(def.fx2, e, { scale: 0.8 });
        hurtEnemy(e, d);
      }));
    }
  },
  // 연사, 무한류: blow on blow on one foe (more at 4·7단), the last one heavier.
  flurry({ skill, st, def, fxid, smite }) {
    const p = G.player, e = tkNear(p.tx, p.ty, st.range || 6)[0];
    if (!e) return 0.25;
    const n = (def.hits || 6) + (skill.lv >= 4) + (skill.lv >= 7);
    if (def.melee) {
      const dx = e.tx - p.tx, dy = e.ty - p.ty;
      if (Math.abs(dx) >= Math.abs(dy)) { p.fdx = Math.sign(dx) || 1; p.fdy = 0; p.face = p.fdx; } else { p.fdx = 0; p.fdy = Math.sign(dy); }
    }
    for (let i = 0; i < n; i++) later(i * 0.07, () => {
      if (e.hp <= 0) return;
      if (i % 2 === 0 || i === n - 1) fxOn(i === n - 1 && def.fx2 ? def.fx2 : fxid, e, { scale: i === n - 1 ? 1 : 0.7 });
      smite(e, st.dmg * def.k * (i === n - 1 ? 1.6 : 1));
      if (i === n - 1) { tkAfflict(e, def); if (def.melee) meleeImpact(2); }
    });
  },
  // 낙뢰충전, 도깨비불 2성, 원혼소환: a totem where the hero stands, striking the nearest (or two) in reach.
  totem({ skill, st, def, fxid, smite }) {
    const p = G.player, dmg = st.dmg || tkHit(def, skill);
    if (!tkNear(p.tx, p.ty, st.range).length) return 0.3;
    const tx = p.tx, ty = p.ty, x = p.x + 6, y = p.y - 18, life = st.duration;
    // (the 도깨비불 itself, a body beside the hero that strikes nothing where it stands: a body's size)
    tkLoop(fxid, x, y, life, { scale: 0.9 * capK(fxid, 0.9, SELF_TILES), alpha: 0.95 });
    const n = Math.floor(life / def.every);
    for (let k = 1; k <= n; k++) later(k * def.every, () => {
      tkNear(tx, ty, st.range).slice(0, def.shots || 1).forEach(e => {
        if (def.fx2) fxOn(def.fx2, e, { scale: 0.7 });
        smite(e, dmg * def.k);
        tkAfflict(e, def, 0);
      });
    });
  },
  // 운화: a gate over the thickest of the foes, raining blows on random tiles round it for `dur`.
  // (9차: 서리파편 over the thickest; 황천화 round the hero itself (at 'self'), each flower healing it a
  // little (heal: % of life) and bursting (fxBurst) where it struck.)
  rain({ st, def, fxid, smite }) {
    const p = G.player, self = def.at === 'self';
    if (def.killCut) { G.buffs.killCut = Math.max(G.buffs.killCut || 0, G.t + def.dur + 0.5); G.buffs.killCutK = def.killCut; }
    const c = self ? (tkNear(p.tx, p.ty, st.radius + 1).length ? p : null) : tkDensest(st.range, 2);
    if (!c) return 0.3;
    const cx = c.tx, cy = c.ty, x = cx * TILE + TILE / 2, y = cy * TILE + TILE - 6;
    // (the gate is the rain's source over its middle, not its ground: each drop is drawn where it strikes)
    if (fxid && !def.noLoop) tkLoop(fxid, x, y - 40, def.dur + 0.3, { scale: 1, alpha: 0.6 });
    const run = G;
    for (let i = 0; i < def.drops; i++) later(0.15 + (i * def.dur) / def.drops, () => {
      if (G !== run) return;
      const ox = self ? p.tx : cx, oy = self ? p.ty : cy;
      const pool = around(ox, oy, st.radius);
      const t = pool.length && Math.random() < 0.75 ? pool[Math.floor(Math.random() * pool.length)] : null;
      const tx = t ? t.tx : ox + Math.round(rand(-st.radius, st.radius)), ty = t ? t.ty : oy + Math.round(rand(-st.radius, st.radius));
      if (def.fx2) addFx(def.dropScale ? fxTiles(def.fx2, 3, 'rd') : def.fx2, tx * TILE + TILE / 2, ty * TILE + TILE - 10, { scale: def.dropScale ? 1 : 0.55 });
      later(def.fxBurst ? 0.45 : 0.12, () => {
        if (G !== run) return;
        if (def.fxBurst && fxBudget('rainBurst', 3)) addFx(fxTiles(def.fxBurst, 3, 'rb'), tx * TILE + TILE / 2, ty * TILE + TILE - 20);
        const hit = around(tx, ty, 1);
        for (const o of hit) { smite(o, st.dmg * def.k); tkAfflict(o, def, 0); }
        if (def.heal && hit.length) heal(p.maxHp * def.heal / 100, false, true);
        if (def.mana && hit.length) p.mp = Math.min(p.maxMp, p.mp + p.maxMp * def.mana);
      });
    });
  },
  // 회천: out along the row and back, striking each foe in it both ways.
  boomerang({ st, def, fxid, smite, hitOn }) {
    const p = G.player, best = tkBestRow(def.depth);
    if (!best) return 0.25;
    const [dx, dy] = best, x0 = p.x + dx * TILE * 0.4, y0 = p.y - 22 + dy * TILE * 0.4, len = def.depth * TILE, fly = 0.32;
    const tiles = [];
    for (let k = 1; k <= def.depth; k++) tiles.push([p.tx + dx * k, p.ty + dy * k]);
    addFx(fxid, x0, y0, { mv: [dx * len, dy * len, fly], scale: 0.55 });
    later(fly, () => addFx(fxid, x0 + dx * len, y0 + dy * len, { mv: [-dx * len, -dy * len, fly], scale: 0.55 }));
    for (const [h, at] of [[0, 0.05], [1, fly + 0.05]]) {
      later(at, () => {
        const row = onTiles(tiles);
        row.forEach(e => later(fly * (h ? 1 - Math.abs(e.tx - p.tx + e.ty - p.ty) / def.depth : Math.abs(e.tx - p.tx + e.ty - p.ty) / def.depth),
          () => { if (e.hp > 0) { hitOn(e); smite(e, st.dmg, [dx, dy]); } }));
      });
    }
  },
  // 뇌기지체, 도깨비불 1성, 영혼공명: orbs round the hero for a while; each foe they pass is struck (each
  // foe once in half a second).
  orbit({ skill, st, def, smite }) {
    const p = G.player, dmg = st.dmg || tkHit(def, skill);
    if (!tkNear(p.tx, p.ty, 4).length) return 0.4;
    const n = def.n || 3, life = st.duration, r = 1.5 * TILE, t0 = G.t, run = G, next = new Map();
    const orbs = [];
    for (let i = 0; i < n; i++) { const f = tkLoop(def.fx, p.x, p.y, life, { scale: 0.6, alpha: 0.95 }); if (f) orbs.push(f); }
    const turn = () => {
      if (G !== run || G.t - t0 >= life) return;
      const age = G.t - t0;
      for (let i = 0; i < n; i++) {
        const a = age * 3.4 + (i / n) * Math.PI * 2, x = p.x + Math.cos(a) * r, y = p.y - 20 + Math.sin(a) * r * 0.7;
        if (orbs[i]) { orbs[i].x = x; orbs[i].y = y; }
        const [tx, ty] = tkTile(x, y + 20);
        for (const e of around(tx, ty, 0)) {
          if ((next.get(e) || 0) > G.t) continue;
          next.set(e, G.t + 0.5);
          if (def.fx2) fxOn(def.fx2, e, { scale: 0.5 });
          smite(e, dmg * def.k);
          tkAfflict(e, def, 0);
        }
      }
      later(0.05, turn);
    };
    turn();
  },
  // 뇌기침투, 백열장: the row ahead struck and shoved back `push` tiles; one with nowhere to go is held.
  knock({ st, def, fxid, smite }) {
    const p = G.player, best = tkBestRow(def.depth);
    if (!best) return 0.25;
    const [dx, dy, hit] = best;
    addFx(fxid, p.x + dx * TILE, p.y - 22 + dy * TILE, { mv: [dx * TILE * (def.depth - 1), dy * TILE * (def.depth - 1), 0.18], scale: 0.9 });
    // the far ones first, so the near ones have room to be shoved into
    hit.sort((a, b) => Math.abs(b.tx - p.tx) + Math.abs(b.ty - p.ty) - Math.abs(a.tx - p.tx) - Math.abs(a.ty - p.ty));
    later(0.08, () => {
      meleeImpact(2);
      for (const e of hit) {
        if (e.hp <= 0) continue;
        smite(e, st.dmg, [dx, dy]);
        let moved = false;
        for (let k = def.push || 2; k >= 1 && !moved; k--) moved = tkShove(e, e.tx + dx * k, e.ty + dy * k);
        if (!moved || def.stun) { e.stun = Math.max(e.stun || 0, def.stun || 0.6); cutBlast(e); }
      }
    });
  },
  // 회오리, 회색지대: a whirl sent down the row of most foes, drawing those beside its path onto it.
  vortex({ st, def, fxid, smite }) {
    if (def.fxEnd) return eungchuk9(st, def, smite);
    const p = G.player, best = tkBestRow(def.depth, DIRS);
    const near = tkNear(p.tx, p.ty, def.depth);
    if (!best && !near.length) return 0.3;
    let dx, dy;
    if (best) [dx, dy] = best;
    else { const e = near[0], ex = e.tx - p.tx, ey = e.ty - p.ty; if (Math.abs(ex) >= Math.abs(ey)) { dx = Math.sign(ex); dy = 0; } else { dx = 0; dy = Math.sign(ey); } }
    const len = def.depth * TILE, x0 = p.x, y0 = p.y - 10, steps = Math.round(def.dur / 0.15), next = new Map(), sx = p.tx, sy = p.ty;
    // (이펙트=판정: the whirl three tiles across, as wide as the path it draws in and strikes)
    const n0 = G.fxs.length;
    fxAt(fxTiles(fxid, 3, 'vx'), x0, p.y - 24, { mv: [dx * len, dy * len, def.dur] });
    if (def.swirl) { vortexSwirl(def, st, smite, dx, dy, G.fxs.length > n0 ? G.fxs[G.fxs.length - 1] : null); return; }
    for (let s = 1; s <= steps; s++) later(s * 0.15, () => {
      const k = Math.round((s / steps) * def.depth), cx = sx + dx * k, cy = sy + dy * k;
      for (const e of around(cx, cy, 1)) {
        if ((next.get(e) || 0) > G.t) continue;
        next.set(e, G.t + 0.3);
        // drawn in onto the path
        if (dx) tkShove(e, e.tx, cy); else tkShove(e, cx, e.ty);
        smite(e, st.dmg * def.k);
        tkAfflict(e, def, 0);
      }
    });
    // 응축뇌전시: drawn together, the foes on the way are blown up at the end
    if (def.endBurst) later(def.dur + 0.05, () => {
      const ex = sx + dx * def.depth, ey = sy + dy * def.depth;
      if (def.fx2) addFx(bigFx(def.fx2, 160, 'vb'), ex * TILE + TILE / 2, ey * TILE + TILE - 16, { scale: 1 });
      G.shake = Math.max(G.shake, 0.08);
      for (let k = 1; k <= def.depth; k++) for (const e of around(sx + dx * k, sy + dy * k, k >= def.depth - 1 ? def.burstR || 1 : 0)) {
        if ((next.get(e) || 0) > G.t + 9) continue;
        next.set(e, G.t + 10);
        smite(e, st.dmg * (k >= def.depth - 1 ? def.endBurst : def.endBurst * 0.5));
      }
    });
  },
  // 타력광풍: spinning for ticks × tick seconds, the tiles round the hero struck each turn (it walks on).
  spin({ st, def, fxid, smite }) {
    const p = G.player;
    if (!tkNear(p.tx, p.ty, st.radius + 1.5).length) return 0.25;
    const run = G;
    for (let i = 0; i < def.ticks; i++) later(i * def.tick, () => {
      if (G !== run || G.dead) return;
      if (i % 3 === 0) {
        // (turned, held within the square it strikes: a square picture turned reached past it by its corners)
        fxAt(fxSquare(fxid, st.radius * 2 + 1, 'sp'), 0, -24, { follow: true, rot: i * 0.7, cap: st.radius * 2 + 1 });
        // (이펙트=판정: not left turning past the last turn that strikes)
        const f = G.fxs[G.fxs.length - 1];
        if (f && f.follow) f.life = Math.min(f.life, (def.ticks - 1 - i) * def.tick + 0.3);
      }
      for (const e of around(p.tx, p.ty, st.radius)) { smite(e, st.dmg * 0.22); fling(e, p.tx, p.ty); }
      if (i === def.ticks - 1) meleeImpact(3);
    });
  },
  // 광야건곤, 약육강식: the triangle ahead; a plain foe under `below` of its life falls at once, the rest
  // harder the deeper their wounds (a boss under half: +60% at the most); marks burst.
  execute({ st, def, fxid, smite }) {
    const p = G.player;
    let best = null, most = 0;
    for (const [dx, dy] of [[p.fdx, p.fdy], ...DIRS]) {
      if (!dx && !dy) continue;
      const hit = onTiles(triTiles(p.tx, p.ty, dx, dy, def.depth));
      const w = aimWorth(hit);
      if (w > most) { most = w; best = [dx, dy, hit]; }
    }
    if (!best) return 0.25;
    const [dx, dy, hit] = best, mid = (def.depth + 1) / 2;
    const [cf, cflip] = dirFx(fxid, '', dx, dy);
    addFx(cf, p.x + dx * mid * TILE, p.y - 20 + dy * mid * TILE, { scale: 1.1, flip: cflip });
    later(0.12, () => {
      meleeImpact(2);
      for (const e of hit.slice(0, def.max || 9)) {
        if (e.hp <= 0) continue;
        const left = e.hp / e.maxHp;
        tkBurstMark(e);
        if (!e.kind && !e.war && left < def.below) {
          floatText(e.x, e.y - 44, '처단', '#ff5a3a');
          smite(e, e.maxHp * 4, [dx, dy]);
        } else smite(e, st.dmg * (1 + (e.kind ? 0.6 : 1) * (1 - left)), [dx, dy]);
      }
    });
  },
  // 영풍진격, 허공답보, 도깨비걸음: a leap to the thickest of the foes in reach, untouchable on the way, and a
  // slam round where it lands.
  charge({ st, def, fxid, smite }) {
    const p = G.player, e = tkDensest(st.range, 1);
    if (!e || steering()) return 0.3;
    const spot = [...DIRS, [1, 1], [-1, 1], [1, -1], [-1, -1]].map(([dx, dy]) => [e.tx + dx, e.ty + dy])
      .filter(([x, y]) => free(x, y) && !holdGround(x, y))
      .sort((a, b) => Math.hypot(a[0] - p.tx, a[1] - p.ty) - Math.hypot(b[0] - p.tx, b[1] - p.ty))[0];
    if (!spot && tdist(e, p) > (st.radius || 1) + 0.5) return 0.4;
    if (spot && (spot[0] !== p.tx || spot[1] !== p.ty)) {
      addFx(fxid, p.x, p.y - 26, { scale: 0.8 });
      tkMoveHero(spot[0], spot[1]);
    }
    p.inv = Math.max(p.inv || 0, 0.4);
    const ex = e.tx - p.tx, ey = e.ty - p.ty;
    if (Math.abs(ex) >= Math.abs(ey)) { p.fdx = Math.sign(ex) || 1; p.fdy = 0; p.face = p.fdx; } else { p.fdx = 0; p.fdy = Math.sign(ey); }
    later(0.1, () => {
      // (이펙트=판정: the slam drawn round where it lands as wide as what it strikes, not a small one on the foe)
      const cr = def.linger ? def.radius || 1 : st.radius || 1;
      if (def.fx2 && !def.linger) fxAt(fxSquare(def.fx2, cr * 2 + 1, 'cs'), p.x, p.y - 24);
      else if (def.fx2) fxOn(def.fx2, e.hp > 0 ? e : p, { scale: 1 });
      shock(p.x, p.y - 4, (st.radius || 1) + 0.5);
      meleeImpact(3);
      for (const o of around(p.tx, p.ty, def.linger ? def.radius || 1 : st.radius || 1)) { smite(o, st.dmg); tkAfflict(o, def); }
      // 순보선풍: a gale stays where it landed, sweeping round it
      if (def.linger) {
        const lx = p.tx, ly = p.ty, run = G;
        const lr = def.radius || 1;
        tkLoop(fxTiles(def.lingerFx || def.fx2, lr * 2 + 1, 'cl'), lx * TILE + TILE / 2, ly * TILE + TILE - 10, def.linger, { alpha: 0.75 });
        for (let k = 1; k <= Math.round(def.linger / 0.5); k++) later(k * 0.5, () => {
          if (G !== run) return;
          for (const o of around(lx, ly, lr)) smite(o, st.dmg * def.lingerK);
        });
      }
    });
  },
  // 참간맹습: foe to foe, the hero landing behind each in turn.
  hop({ st, def, fxid, smite }) {
    const p = G.player, first = tkNear(p.tx, p.ty, st.range)[0];
    if (!first) return 0.25;
    const seq = [first];
    while (seq.length < st.count) {
      const nx = tkNear(seq[seq.length - 1].tx, seq[seq.length - 1].ty, 3).find(e => !seq.includes(e));
      if (!nx) break;
      seq.push(nx);
    }
    seq.forEach((e, i) => later(i * 0.13, () => {
      if (e.hp <= 0 || G.dead) return;
      const dx = Math.sign(e.tx - p.tx), dy = Math.sign(e.ty - p.ty);
      if (!steering()) tkMoveHero(e.tx + dx, e.ty + dy) || tkMoveHero(e.tx - dy, e.ty + dx);
      const life = fxOnArea(fxFit(fxid, ONE_TILES, 'hp'), e), ex = e.tx, ey = e.ty;
      for (const [t, k] of beatsUnder(life - 0.1)) later(t, () => { for (const b of bodiesAt(ex, ey) || []) if (b.m && !b.ally && b.hp > 0) { smite(b, st.dmg * k, [dx, dy]); if (!t) tkAfflict(b, def); } });
      meleeSlash(e.tx, e.ty, dx || 1, dy, i);
    }));
  },
  // 그림자쐐기: wedges on the open tiles by foes; any foe that comes beside one sets it off.
  trap({ st, def, fxid, smite }) {
    const p = G.player, foes = tkNear(p.tx, p.ty, st.range);
    if (!foes.length) return 0.3;
    const spots = [], taken = new Set();
    for (const e of foes) {
      for (const [dx, dy] of DIRS) {
        const x = e.tx + dx, y = e.ty + dy, k = key(x, y);
        if (spots.length >= st.count || taken.has(k) || occ.has(k)) continue;
        taken.add(k);
        spots.push([x, y]);
        break;
      }
      if (spots.length >= st.count) break;
    }
    if (!spots.length) return 0.4;
    const run = G, end = G.t + st.duration;
    for (const [x, y] of spots) {
      const pic = tkLoop(fxid, x * TILE + TILE / 2, y * TILE + TILE - 8, st.duration, { scale: 0.45, alpha: 0.8 });
      const watch = () => {
        if (G !== run || G.t > end) return;
        const near = around(x, y, 1);
        if (!near.length) return later(0.15, watch);
        if (pic) pic.life = pic.t;
        if (def.fx2) fxAtTile(fxSquare(def.fx2, st.radius * 2 + 1, 'tp'), x, y, { must: true });
        for (const o of around(x, y, st.radius)) { smite(o, st.dmg); tkAfflict(o, def); }
      };
      later(0.2, watch);
    }
  },
  // 분골쇄신: life given for power: the share of life spent strikes on top of the blow, all round.
  sacrifice({ st, def, fxid, smite }) {
    const p = G.player;
    if (p.hp < p.maxHp * 0.35 || !tkNear(p.tx, p.ty, st.radius + 0.5).length) return 0.5;
    const cost = p.hp * def.hpCost;
    p.hp -= cost;
    addFx(fxid, 0, -26, { follow: true, scale: 1.2 });
    // (이펙트=판정: the burst as wide as the square it strikes round the hero, striking while it stays)
    const bp = def.fx2 ? fxSquare(def.fx2, st.radius * 2 + 1, 'sc') : null, beats = beatsUnder(fxLife(bp) - 0.1);
    for (const [dt, k] of beats.slice(1)) later(0.15 + dt, () => { for (const e of around(p.tx, p.ty, st.radius)) smite(e, (st.dmg + cost * def.k) * k); });
    later(0.15, () => {
      if (bp) fxAt(bp, 0, -24, { follow: true });
      shock(p.x, p.y - 4, st.radius + 0.5, '255,180,120');
      meleeImpact(3);
      for (const e of around(p.tx, p.ty, st.radius)) smite(e, (st.dmg + cost * def.k) * beats[0][1]);
    });
  },
  // 도깨비불 3성: a fan of fires, each bursting on the first foe in its way.
  barrage({ st, def, fxid, smite }) {
    const p = G.player, near = tkNear(p.tx, p.ty, def.depth)[0];
    if (!near) return 0.3;
    const a0 = Math.atan2(near.ty - p.ty, near.tx - p.tx), n = def.n || 5;
    for (let i = 0; i < n; i++) {
      const a = a0 + (i - (n - 1) / 2) * 0.22, cx = Math.cos(a), cy = Math.sin(a);
      let hitAt = null, k = 1;
      for (; k <= def.depth; k++) {
        const tx = p.tx + Math.round(cx * k), ty = p.ty + Math.round(cy * k);
        if (around(tx, ty, 0).length) { hitAt = [tx, ty]; break; }
      }
      const reach = Math.min(k, def.depth) * TILE, fly = 0.05 + 0.03 * Math.min(k, def.depth);
      later(i * 0.04, () => addFx(fxid, p.x, p.y - 24, { mv: [cx * reach, cy * reach, fly], scale: 0.8 }));
      if (hitAt) later(i * 0.04 + fly, () => {
        const br = def.radius === 0 ? 0 : def.radius || 1;
        if (def.fx2) addFx(fxTiles(def.fx2, br * 2 + 1, 'br'), hitAt[0] * TILE + TILE / 2, hitAt[1] * TILE + TILE - 14);
        for (const o of around(hitAt[0], hitAt[1], br)) { smite(o, st.dmg * def.k); tkAfflict(o, def, i % 2 ? 0 : 1); }
      });
    }
  },
  // 유인: the foes about drawn in round the hero and struck; it takes half the blows for a while.
  taunt({ skill, st, def, fxid }) {
    const p = G.player;
    if (tkNear(p.tx, p.ty, st.range).length < 2) return 0.5;
    lure();
    G.buffs.shield = Math.max(G.buffs.shield, G.t + st.duration);
    addFx(fxid, 0, -26, { follow: true });
    const d = tkHit(def, skill);
    later(0.3, () => { for (const e of around(p.tx, p.ty, 1)) hurtEnemy(e, d); });
  },
  // 의지의외침, 신성제마술: every 상태이상 on the hero (and the party) gone; a shout that holds the foes
  // beside it and quickens the spells (의지의외침), or a heal and a moment untouchable (신성제마술).
  cleanse({ skill, st, def, fxid }) {
    const p = G.player, sts = p.sts && Object.values(p.sts).some(s => s.until > G.t);
    const hurt = p.hp < p.maxHp * 0.8 || (def.party && G.party.some(m => !m.down && m.hp < m.maxHp * 0.7));
    if (!sts && !(def.party ? hurt : tkNear(p.tx, p.ty, 1.5).length >= 2)) return 0.5;
    p.sts = {};
    addFx(fxid, 0, -26, { follow: true });
    if (def.party) {
      // 신성제마술 (밋밋한 효과 보강): its holy light drawn tall over the hero, and the stars of the cleansing
      // rising round the hero and on each companion while the guard lasts.
      if (def.fxAfter && M.fx[def.fxAfter]) {
        addFx(bigFx(fxid, 180, 'cl'), 0, -10, { follow: true, anchor: 'bottom', self: true });
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          later(0.1 + i * 0.06, () => addFx(def.fxAfter, Math.cos(a) * 40, -20 + Math.sin(a) * 24, { follow: true, scale: 1.5 }));
        }
        tkLoop(def.fxAfter, 0, -40, st.duration, { follow: true, scale: 2, alpha: settings.calmFx ? 0.5 : 0.9 });
        for (const m of G.party) if (!m.down) fxOnBody(def.fxAfter, m, -26, { scale: 1.4 });
      }
      heal(st.heal, true);
      for (const m of G.party) { if (m.sts) m.sts = {}; healMember(m, st.heal); }
      G.buffs.guard = Math.max(G.buffs.guard, G.t + st.duration);
    } else {
      G.buffs.haste = Math.max(G.buffs.haste, G.t + st.duration);
      const d = tkHit(def, skill);
      for (const e of around(p.tx, p.ty, 1)) { hurtEnemy(e, d); tkAfflict(e, def); }
    }
    note(`${skillName(skill.id, skill.lv)}: 해로운 효과가 사라졌습니다.`);
  },
  // 즉발시전: the other spells' waits all but done, and the spells quickened a moment.
  // (밋밋한 효과 보강: the blue fire large over the hero, a flame of it for each spell made ready, round
  // the hero, and the 마기 standing in the hero's light while the spells quicken — 연's own strips.)
  reset({ skill, st, def, fxid }) {
    const cooling = G.skills.filter(s => s !== skill && SKILLS[s.id].kind !== 'ult' && s.timer > 1.2);
    if (cooling.length < 2 || !nearestEnemies(1, 7).length) return 0.5;
    for (const s of cooling) s.timer = Math.min(s.timer, 0.3);
    G.buffs.haste = Math.max(G.buffs.haste, G.t + st.duration);
    addFx(bigFx(fxid, 190, 'rs'), 0, -26, { follow: true });
    const n = Math.min(6, cooling.length), small = bigFx(fxid, 84, 'rs2');
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      later(0.08 + i * 0.07, () => addFx(small, Math.cos(a) * 46, -26 + Math.sin(a) * 30, { follow: true }));
    }
    if (def.fxAfter && M.fx[def.fxAfter]) tkLoop(def.fxAfter, 0, -24, st.duration, { follow: true, scale: 1.3, alpha: settings.calmFx ? 0.5 : 0.85 });
  },
  // 운기, 메밀묵섭취, 저승의기원: life back a little every half second for a while (and a shield, mana).
  regen({ skill, st, def, fxid }) {
    const p = G.player;
    if (p.hp > p.maxHp * 0.75) return 1;
    const n = Math.round(st.duration / 0.5), each = p.maxHp * def.hot / 100 * (1 + 0.12 * (skill.lv - 1)), run = G;
    for (let k = 1; k <= n; k++) later(k * 0.5, () => { if (G === run && !G.dead) heal(each, false, true); });
    if (def.shieldT) G.buffs.shield = Math.max(G.buffs.shield, G.t + def.shieldT);
    if (def.mana) p.mp = Math.min(p.maxMp, p.mp + p.maxMp * def.mana);
    tkLoop(fxid, 0, -26, Math.min(st.duration, 3), { follow: true, alpha: 0.7, scale: selfCapK(fxid) });
    note(`${skillName(skill.id, skill.lv)}의 효과를 받습니다.`);
  },
  // 호기방출: a wind round the hero for a while: every tick it strikes and drives back what is beside it;
  // meanwhile the hero strikes harder.
  gust({ skill, st, def, fxid }) {
    const p = G.player;
    if (!tkNear(p.tx, p.ty, 3).length) return 0.4;
    const run = G, n = Math.round(st.duration / def.tick), d = tkHit(def, skill) * 0.3;
    G.buffs.powerK = Math.max(G.buffs.power > G.t ? G.buffs.powerK || 0 : 0, def.power || 0.2);
    G.buffs.power = Math.max(G.buffs.power, G.t + st.duration);
    tkLoopAt(fxSquare(fxid, (st.radius || 1) * 2 + 1, 'gs'), 0, -24, n * def.tick + 0.1, { follow: true, alpha: 0.75 });
    for (let k = 1; k <= n; k++) later(k * def.tick, () => {
      if (G !== run || G.dead) return;
      for (const e of around(p.tx, p.ty, st.radius || 1)) {
        hurtEnemy(e, d);
        const dx = Math.sign(e.tx - p.tx), dy = Math.sign(e.ty - p.ty);
        if (k % 3 === 0) tkShove(e, e.tx + dx, e.ty + dy); else fling(e, p.tx, p.ty);
      }
    });
  },
  // 복수, 마류귀체: for a while each foe beside the hero is struck back every tick (and cursed: 복수), the
  // hero drawing a little life from each (마류귀체).
  thorns({ skill, st, def, fxid }) {
    const p = G.player;
    if (!tkNear(p.tx, p.ty, 2).length) return 0.4;
    const run = G, n = Math.round(st.duration / def.tick), d = tkHit(def, skill) * def.k;
    tkLoopAt(fxSquare(fxid, (st.radius || 1) * 2 + 1, 'th'), 0, -24, n * def.tick + 0.1, { follow: true, alpha: 0.6 });
    for (let k = 1; k <= n; k++) later(k * def.tick, () => {
      if (G !== run || G.dead) return;
      let got = 0;
      for (const e of around(p.tx, p.ty, st.radius || 1)) {
        if (def.fx2 && got < 2) fxOn(def.fx2, e, { scale: 0.45 });
        hurtEnemy(e, d);
        if (def.curse) e.curse = Math.max(e.curse || 0, def.curse);
        got++;
      }
      if (def.drain && got) heal(p.maxHp * def.drain * Math.min(3, got), false, true);
    });
  },
  // 호신강기: a shield (half the blows) for a while, and when it falls it bursts round the hero.
  shieldburst({ skill, st, def, fxid }) {
    const p = G.player;
    if (!tkNear(p.tx, p.ty, 3).length) return 0.4;
    const run = G;
    G.buffs.shield = Math.max(G.buffs.shield, G.t + st.duration);
    tkLoop(fxid, 0, -26, st.duration, { follow: true, alpha: 0.65, scale: selfCapK(fxid) });
    later(st.duration, () => {
      if (G !== run || G.dead) return;
      if (def.fx2) addFx(fxTiles(def.fx2, (st.radius || 2) * 2 + 1, 'sbu'), 0, -26, { follow: true, area: true });
      shock(p.x, p.y - 4, (st.radius || 2) + 0.5, '200,220,255');
      const d = tkHit(def, skill);
      for (const e of around(p.tx, p.ty, st.radius || 2)) { hurtEnemy(e, d); tkAfflict(e, def); }
    });
  },
  // ---- 9차 스킬 개편 (data.js S9): 보조 공격 (echo), 몸 주변 아우라 (aura9), 강한 일격 (smite), 전방 물결
  // (crosswave), 여덟 방향 수리검 (starburst).
  // 호기어검, 묵혈독바르기, 전도체, 화살비폭격, 기공십자광선'쾌, 권법의기원: for `duration` the hero strikes harder
  // (power) and every `every` seconds a follow-up blow of the class's own way (def.echo, ECHO below) goes out
  // by itself at the foes near — the 보조 공격 the original's 9차 buffs add.
  echo({ skill, st, def, fxid }) {
    const p = G.player;
    if (!tkNear(p.tx, p.ty, (def.range || 5) + 1).length) return 0.4;
    // (its length does not grow with the 단; its wait shrinks slowly, data.js S9: aoe)
    const run = G, life = def.duration, n = Math.floor(life / def.every), d = tkHit(def, skill), way = ECHO[def.echo] || ECHO.sword;
    if (def.power) {
      G.buffs.powerK = Math.max(G.buffs.power > G.t ? G.buffs.powerK || 0 : 0, def.power);
      G.buffs.power = Math.max(G.buffs.power, G.t + life);
    }
    G.buffs.echo = G.t + life;
    if (def.killCut) { G.buffs.killCut = Math.max(G.buffs.killCut || 0, G.t + life); G.buffs.killCutK = def.killCut; }
    if (!def.noCast) addFx(bigFx(fxid, 150, 'e9'), 0, -26, { follow: true });
    // (its sign held over the hero while it lasts: 호기어검's swords, 묵혈독's dark blade …)
    if (def.fxLoop && M.fx[def.fxLoop]) tkLoop(bigFx(def.fxLoop, def.loopSize || 110, 'e9l'), 0, def.loopY || -40, life, { follow: true, alpha: settings.calmFx ? 0.5 : 1 });
    for (let k = 1; k <= n; k++) later(k * def.every, () => {
      if (G !== run || G.dead) return;
      way(def, d, k);
    });
    note(`${skillName(skill.id, skill.lv)}의 효과를 받습니다.`);
  },
  // 흑룡검풍, 천신의기운, 천신의권역, 비사검, 반탄강기, 불사귀인: held round the hero for `duration`: every
  // `tick` the foes within `radius` are struck (and shoved, slowed, burnt as the spell says); meanwhile
  // the hero takes less (ward), sends blows back (reflect), heals (hot, with the party) or drinks (drain).
  // 천선의영역 (원작 2662 IMG35): the golden seal laid where the hero stands for `duration` seconds (o_p_cheonseon9 at the
  // original's own size); while the hero is within `radius` tiles of it, what it takes is cut by `ward`; leaving it
  // ends the seal at once. It strikes nothing (the original's is a guard alone).
  // 천신의권역 (원작 2662 IMG54): the same, with the blue vortex (o_cl_cheonsin at the original's own size, its pivot its
  // middle) — `reach` its drawn round in game pixels; it stays its whole life (stay) whether the hero is in it or not,
  // guarding only while the hero is; wardHits [n, k1, k2]: the first n blows taken in it cut by k1, the rest by k2
  // (설명창: 피격 10회까지 방어도 -80, 초과하면 -40).
  zone9({ skill, def, fxid }) {
    // (def.feet — 천선의영역: the seal's middle is where the hero's feet were, as in the original; R its drawn round)
    const p = G.player, run = G, fy = def.feet ? 0 : 14, cx = p.x, cy = p.y - fy, R = def.reach || (def.radius || 3) * TILE + TILE / 2, life = def.duration || 10;
    if (p.hp >= p.maxHp * 0.95 && !tkNear(p.tx, p.ty, 4).length) return 0.4;
    // (보이는 범위 = 맞는 범위: the domain drawn within the square it holds, 2R across — 아공간전개's crystals stood 5.7 × 6.4
    // tiles over a field of 4.3, 천선의영역 grew with the 단 past it)
    const zw = (2 * R) / TILE * 1.15, zfit = id => fxIn(id, zw, zw, 'z9');
    const fx = { id: zfit(fxid), x: cx, y: cy, t: 0, life, scale: 1, loop: true, seenLoop: true, alpha: settings.calmFx ? 0.6 : 1, must: true };
    if (def.stay) Object.assign(fx, { y: cy + 4, anchor: 'bottom', alpha: settings.calmFx ? 0.6 : 1 }); // (its pivot its middle: on the hero's body)
    if (def.feet) fx.anchor = 'bottom'; // (its pivot, the seal's middle, exactly on the hero's feet)
    // (아공간전개: its pivot the hero's feet where it was laid, drawn whole — its own crystals and field, not see-through)
    if (def.atFeet) Object.assign(fx, { id: zfit(def.fx), y: p.y, anchor: 'bottom', alpha: 1, floor: true });
    G.fxs.push(fx);
    const end = G.t + life;
    G.ward9Hits = def.wardHits ? { n: 0, at: def.wardHits, until: end } : null;
    const tick = () => {
      if (G !== run || G.dead || G.t >= end) return;
      if (Math.hypot(p.x - cx, p.y - fy - cy) > R) {
        if (!def.stay) { fx.life = Math.min(fx.life, fx.t + 0.15); G.buffs.ward9 = 0; return; }
        if (G.ward9Hits) G.ward9Hits.inside = false;
        later(0.2, tick);
        return;
      }
      G.buffs.ward9 = G.t + 0.3;
      // (아공간전개: 영역 안에서는 명중회피가 점차 증가 — what it takes cut more the longer the hero stays in it)
      G.buffs.ward9K = def.wardRamp ? def.wardRamp[0] + (def.wardRamp[1] - def.wardRamp[0]) * Math.min(1, (G.t - (end - life)) / life) : def.ward || 0.5;
      // (PVP 기술 → 몬스터: the foes inside lose their way in it — slowed)
      if (def.slowIn) for (const e of G.enemies) if (tkFoe(e) && Math.abs(e.x - cx) <= R && Math.abs(e.y - 14 - cy) <= R) tkAfflict(e, { slow: def.slowIn });
      if (G.ward9Hits) G.ward9Hits.inside = true;
      later(0.2, tick);
    };
    tick();
    note(`${skillName(skill.id, skill.lv)}의 효과를 받습니다.`);
  },
  aura9({ skill, st, def, fxid }) {
    // (it grows by one tile at most: held round the hero, a wider one hid the field)
    const p = G.player, r = Math.min(st.radius || 1, (def.radius || 1) + 1);
    const hurt = p.hp < p.maxHp * 0.85 || (def.party && G.party.some(m => !m.down && m.hp < m.maxHp * 0.7));
    if (!tkNear(p.tx, p.ty, r + 1.5).length && !(def.hot && hurt)) return 0.4;
    const run = G, life = def.duration, n = Math.round(life / def.tick), d = tkHit(def, skill);
    if (def.ward) { G.buffs.ward9 = G.t + life; G.buffs.ward9K = def.ward; }
    if (def.reflect) G.buffs.reflect = Math.max(G.buffs.reflect, G.t + life);
    // the aura's own picture held round the hero, as wide as what it reaches — or (def.half: 천신의기운, 원작 2662 IMG33) the
    // original's own picture at the original's size relative to the hero, and what it strikes the ellipse it draws
    // (half: its half width and depth in game px), not grown with the 단
    const own = def.half && M.fx[def.fx];
    if (own) tkLoop(def.fx, 0, -14, life, { follow: true, area: true, alpha: settings.calmFx ? 0.45 : def.auraAlpha || 0.7 });
    else tkLoop(fxTiles(fxid, (r * 2 + 1) * Math.min(1, def.auraSize || 1), 'a9'), 0, -14, life, { follow: true, area: true, alpha: settings.calmFx ? 0.45 : def.auraAlpha || 0.7 });
    // (the ring lies on the ground round the hero's feet, its middle def.halfAt px below them as in the original: a foe's
    // feet inside the ring drawn are struck — 이펙트=판정)
    const inAura = own ? () => G.enemies.filter(e => tkFoe(e) && ((e.x - p.x) / def.half[0]) ** 2 + ((e.y - (p.y + (def.halfAt || 0))) / def.half[1]) ** 2 <= 1)
      : () => around(p.tx, p.ty, r);
    if (def.mana) p.mp = Math.min(p.maxMp, p.mp + p.maxMp * def.mana);
    for (let k = 1; k <= n; k++) later(k * def.tick, () => {
      if (G !== run || G.dead) return;
      const near = inAura();
      let got = 0;
      for (const e of near) {
        if (def.fxHit && got < 2 && k % 2) fxOn(def.fxHit, e, { scale: 0.6 });
        hurtEnemy(e, def.bossK && (e.kind === 'boss' || e.kind === 'mini') ? d * def.bossK : d);
        tkAfflict(e, def, 0);
        if (def.shove && k % def.shove === 0) tkShove(e, e.tx + Math.sign(e.tx - p.tx), e.ty + Math.sign(e.ty - p.ty));
        got++;
      }
      if (def.drain && got) heal(p.maxHp * def.drain * Math.min(3, got), false, true);
      if (def.hot) {
        heal(p.maxHp * def.hot / 100 * (1 + 0.08 * (skill.lv - 1)), false, true);
        if (def.party) for (const m of G.party) if (!m.down && tdist(m, p) <= r + 2) m.hp = Math.min(m.maxHp, m.hp + m.maxHp * def.hot / 100);
      }
    });
    note(`${skillName(skill.id, skill.lv)}의 효과를 받습니다.`);
  },
  // 압도적진격, 묵혈파광참, 회선격풍, 폭렬천뢰탄, 무형투창, 점혈:통: the strongest foe within reach (a boss
  // first) struck very hard: the hero dashes in (dash), a shot flies (shot), or a mark bursts after
  // `delay`; round it a share (splash) of the blow; a storm may stay (linger) or the blow leap on (chain).
  smite({ skill, st, def, fxid, smite, hitOn }) {
    // 압도적진격 (원작 2662 IMG07; 사용자 결정: 돌진기): the hero charges `deep` tiles the way it faces (이동 기술은 바라보는
    // 방향으로만; it stops at a wall), the wall of three rings of fire (o_w_apdo at the original's own size, its pivot
    // the hero's feet where the charge began, turned that way) driven before it over the path for its third of a
    // second; every foe on the path — wall[1] tiles to each side — is struck and stunned as it passes, not driven
    // back (one on the tile the hero lands on steps aside). Nothing else is drawn: no flames, no hit sparks.
    if (def.wall) {
      const p = G.player, fx = p.fdx || 0, fy = fx ? 0 : p.fdy || 1, [deep, half] = def.wall, run = G, sx = p.tx, sy = p.ty;
      const row = k => { const out = []; for (let o = -half; o <= half; o++) out.push([sx + fx * k + (fy ? o : 0), sy + fy * k + (fx ? o : 0)]); return out; };
      let any = false;
      for (let k = 1; k <= deep && !any; k++) any = onTiles(row(k)).length > 0;
      if (!any) return 0.3;
      // the charge: as far as the way is open (the ground's edge stops it), a foe on the last tile stepping aside
      let went = 0;
      if (!steering()) {
        let reach = 0;
        for (let k = 1; k <= deep; k++) { if (G.arena && !Hunt.open(sx + fx * k, sy + fy * k)) break; reach = k; }
        for (let k = reach; k >= 1 && !went; k--) {
          const tx = sx + fx * k, ty = sy + fy * k;
          for (const e of onTiles([[tx, ty]])) tkShove(e, tx + fy, ty + fx) || tkShove(e, tx - fy, ty - fx);
          if (tkMoveHero(tx, ty)) { p.inv = Math.max(p.inv || 0, 0.4); went = k; }
        }
      }
      // the wall goes with the hero — its pivot the hero's feet, the rings half a tile before it — from where the charge
      // began to where it ends; 이펙트=판정: it strikes the path and what the wall still covers at the end (two tiles more)
      const rows = Math.max(deep, went + 2);
      // (the hero is at the charge's end at once, the camera with it: the wall is held on the hero, not sent after it)
      addFx(fxid, 0, fx ? 0 : -20, { follow: true, anchor: 'bottom', must: true, flip: fx > 0, rot: fy < 0 ? Math.PI / 2 : fy > 0 ? -Math.PI / 2 : 0 });
      G.shake = Math.max(G.shake, 0.06);
      const seen = new Set();
      for (let k = 1; k <= rows; k++) later(0.04 + (k - 1) * (0.26 / rows), () => {
        if (G !== run) return;
        G.procHitting = true; // (no hit sparks of the blade's on them: the original shows none)
        for (const o of onTiles(row(k))) {
          if (seen.has(o)) continue;
          seen.add(o);
          smite(o, st.dmg);
          tkAfflict(o, def);
        }
        G.procHitting = false;
      });
      return;
    }
    const p = G.player, foes = tkNear(p.tx, p.ty, st.range);
    if (!foes.length) return 0.3;
    // (천신의심판: the thickest of them, where the 천신 comes down; the rest the strongest)
    const t = def.densest ? tkDensest(st.range, 2) || foes[0]
      : foes.slice(0, 16).sort((a, b) => (b.kind === 'boss') - (a.kind === 'boss') || b.maxHp - a.maxHp || a.hp - b.hp)[0];
    const ex = t.tx - p.tx, ey = t.ty - p.ty;
    if (Math.abs(ex) >= Math.abs(ey)) { p.fdx = Math.sign(ex) || 1; p.fdy = 0; p.face = p.fdx; } else { p.fdx = 0; p.fdy = Math.sign(ey); }
    if (def.dash && tdist(t, p) > 1.5 && !steering()) {
      const spot = DIRS.map(([dx, dy]) => [t.tx + dx, t.ty + dy]).filter(([x, y]) => free(x, y) && !holdGround(x, y))
        .sort((a, b) => Math.hypot(a[0] - p.tx, a[1] - p.ty) - Math.hypot(b[0] - p.tx, b[1] - p.ty))[0];
      if (spot) { tkMoveHero(spot[0], spot[1]); p.inv = Math.max(p.inv || 0, 0.3); }
    }
    let wait = def.delay || 0.18;
    if (def.shot) {
      const sp = def.fxShot && M.fx[def.fxShot] ? def.fxShot : fxid, dx = t.x - p.x, dy = t.y - 20 - (p.y - 26);
      const fl = Math.min(0.24, 0.08 + Math.hypot(dx, dy) / 1500);
      addFx(fxTiles(sp, ONE_TILES, 'ss'), p.x, p.y - 26, { mv: [dx, dy, fl], rot: def.fxShot ? Math.atan2(dy, dx) + Math.PI / 2 : 0 });
      wait = fl;
    }
    // the blow's own picture on it (drawn a little larger than the foe: it is the class's great blow)
    // (압도적진격: its double ring of fire bursts at the front, between the hero and the one struck, facing the blow)
    // (drawn as wide as it strikes: the one struck and its splash round it, or one and a half tiles alone)
    const span = Math.max(1.5, (def.radius || 0) * 2 + 1);
    // (천신의심판, 원작 2662 IMG71: the whirl drawing them in and the 천신's pillar of light, one picture at the original's own
    // size, its pivot the middle of the ring — the spot struck; what it strikes the ring's round, radius tiles)
    if (def.own) addFx(fxid, t.tx * TILE + TILE / 2, t.ty * TILE + TILE - 14, { anchor: 'bottom', must: true, cap: span * 1.25 });
    else if (def.front) later(wait, () => addFx(fxTiles(fxid, span, 'sm'), t.x, t.y - 24, { flip: t.x > p.x }));
    else if (!def.shot || def.fxShot) later(def.shot ? wait : 0, () => fxOn(fxTiles(fxid, span, 'sm'), t, { area: true }));
    const tx = t.tx, ty = t.ty;
    // 천신의심판: the foes round it drawn into the middle first
    if (def.pull) {
      if (def.fxPull && M.fx[def.fxPull]) addFx(fxTiles(def.fxPull, (def.radius + 1) * 2 + 1, 'smp'), tx * TILE + TILE / 2, ty * TILE + TILE - 20, { scale: 1, alpha: 0.85 });
      for (const o of around(tx, ty, def.radius + 1)) if (o !== t) tkShove(o, o.tx - Math.sign(o.tx - tx), o.ty - Math.sign(o.ty - ty));
    }
    // 극청룡참: the thrown sickle comes back and cuts again
    if (def.again) later(wait + 0.4, () => { if (t.hp > 0) { hitOn(t); smite(t, st.dmg * def.again); } });
    later(wait + (def.delay && !def.shot ? 0 : 0.05), () => {
      const sr = def.radius || 0;
      if (def.fx2 && M.fx[def.fx2]) addFx(fxTiles(def.fx2, sr * 2 + 1, 'sm2'), tx * TILE + TILE / 2, ty * TILE + TILE - 16);
      G.shake = Math.max(G.shake, 0.08);
      meleeImpact(2);
      // (천신의심판: no hit marks of another's — the pillar is what strikes; the original shows none)
      if (def.own) G.quietHit = true;
      later(0.01, () => { if (def.own) G.quietHit = false; });
      if (t.hp > 0) { smite(t, st.dmg, def.push ? [Math.sign(ex), Math.sign(ey)] : null); tkAfflict(t, def); tkBurstMark(t); }
      if (sr) for (const o of around(tx, ty, sr)) {
        if (o === t) continue;
        smite(o, st.dmg * (def.splash || 0.4));
        tkAfflict(o, def);
        if (def.push) tkShove(o, o.tx + Math.sign(o.tx - p.tx), o.ty + Math.sign(o.ty - p.ty));
      }
      // 폭렬천뢰탄: the orb discharges into the nearest few
      if (def.chain) tkNear(tx, ty, 3).filter(o => o !== t).slice(0, def.chain).forEach((o, i) => later(0.08 * (i + 1), () => {
        if (o.hp <= 0) return;
        // (원작 2662 IMG31: the one it jumps to bursts with the same sphere, smaller — def.chainFx)
        if (def.chainFx && M.fx[def.chainFx]) fxOn(def.chainFx, o, { scale: def.chainScale || 0.6 }); else hitOn(o);
        smite(o, st.dmg * (def.chainK || 0.5));
      }));
      // 회선격풍: the wind stays and cuts on
      if (def.linger) {
        const x = tx * TILE + TILE / 2, y = ty * TILE + TILE - 10, run = G;
        tkLoop(fxTiles(fxid, 3, 'sl'), x, y - 10, def.linger, { alpha: 0.6 });
        for (let k = 1; k <= Math.round(def.linger / 0.5); k++) later(k * 0.5, () => {
          if (G !== run) return;
          for (const o of around(tx, ty, 1)) smite(o, st.dmg * def.lingerK);
        });
      }
    });
  },
  // 해일강타: a wave out along the row (ways 1: the thickest row; 4: all four), `width` tiles to each side,
  // striking each foe once as it passes; `pulses` waves `gap` apart.
  crosswave({ st, def, fxid, smite, hitOn }) {
    const p = G.player;
    let ways = DIRS;
    if ((def.ways || 4) === 1) {
      const best = tkBestRow(def.depth);
      if (!best) return 0.3;
      ways = [[best[0], best[1]]];
    } else if (!tkNear(p.tx, p.ty, def.depth).length) return 0.3;
    const sx = p.tx, sy = p.ty, w = def.width || 0, len = def.depth * TILE, step = def.step || 0.05;
    // 화혼돌파: the hero goes with it, to the farthest free tile of the way
    if (def.dash && !steering()) {
      // (through the crowd: the end of the way, or the free tile nearest it)
      const [dx, dy] = ways[0];
      const spots = [];
      for (let k = def.depth; k >= 2; k--) for (const [ox, oy] of [[0, 0], [dy, dx], [-dy, -dx], [dx, dy]]) spots.push([sx + dx * k + ox, sy + dy * k + oy]);
      for (const [x, y] of spots) if (tkMoveHero(x, y)) { p.inv = Math.max(p.inv || 0, 0.4); break; }
    }
    // 이계의침식: what it raises stays along its way a moment
    // (명천검파: each pulse lays its 검기 along every arm, turned with it — the cross reads whole)
    const trailAt = () => { if (def.trail && M.fx[def.trail]) for (const [dx, dy] of ways) for (let k = def.trailStep || 2; k <= def.depth; k += def.trailStep || 2) later(k * step, () => addFx(fxTiles(def.trail, (w * 2 + 1) * (def.trailK || 1), 'cwt'), (sx + dx * k) * TILE + TILE / 2, (sy + dy * k) * TILE + TILE - 14, { scale: 1, rot: def.trailRot ? Math.atan2(dy, dx) : 0 })); };
    for (let i = 0; i < (def.pulses || 1); i++) later(i * (def.gap || 0.3), () => {
      trailAt();
      for (const [dx, dy] of ways) {
        addFx(fxTiles(fxid, w * 2 + 1, 'cw'), p.x + dx * 20, p.y - 16 + dy * 20, { mv: [dx * len, dy * len, def.depth * step + 0.1], scale: 1, alpha: 0.9, anchor: def.shotRot ? 'mid' : undefined, must: def.shotRot, ...(def.shotRot ? shotTurn(dx, dy) : null) });
        const seen = new Set();
        for (let k = 1; k <= def.depth; k++) later(k * step, () => {
          const tiles = [];
          for (let o = -w; o <= w; o++) tiles.push([sx + dx * k + (dy ? o : 0), sy + dy * k + (dx ? o : 0)]);
          for (const e of onTiles(tiles)) {
            if (seen.has(e)) continue;
            seen.add(e);
            hitOn(e);
            smite(e, st.dmg, [dx, dy]);
            tkAfflict(e, def);
          }
        });
      }
    });
  },
  // 묵마수리검'쇄: `n` stars out all round to `reach` tiles; each stays `dur` seconds at its end, cutting
  // the foes round it every `tick`.
  starburst({ st, def, fxid, smite }) {
    const p = G.player;
    if (!tkNear(p.tx, p.ty, def.reach + 1.5).length) return 0.3;
    const sx = p.tx, sy = p.ty, run = G, n = def.n || 8, fly = 0.18;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, cx = Math.round(Math.cos(a) * def.reach), cy = Math.round(Math.sin(a) * def.reach);
      const ex = sx + cx, ey = sy + cy, x = ex * TILE + TILE / 2, y = ey * TILE + TILE - 18;
      addFx(fxid, p.x, p.y - 24, { mv: [x - p.x, y - (p.y - 24), fly], scale: 0.7 });
      later(fly, () => {
        if (G !== run) return;
        tkLoop(fxTiles(fxid, (def.radius || 1) * 2 + 1, 'sb'), x, y, def.dur, { alpha: 0.9 });
        for (let k = 0; k < Math.round(def.dur / def.tick); k++) later(k * def.tick, () => {
          if (G !== run) return;
          const hit = around(ex, ey, def.radius || 1);
          if (hit.length && def.fx2 && k % 2 === 0) fxOn(def.fx2, hit[0], { scale: 0.5 });
          for (const e of hit) smite(e, st.dmg * def.k);
        });
      });
    }
  },
  // 묵마수리검'쇄 (원작 2662 IMG13): eight blue kunai thrown the eight ways — the white-blue streak of each flight
  // (o_r_swaefly) cutting what it passes — stand `ring` game pixels out (the original's 260 capture pixels: three
  // tiles and a third) for `dur` seconds, points to the hero, round the spot it was cast on (o_r_swaestar at the
  // original's own size); every `tick` what stands inside their ring is ground, and at the end each goes in a white
  // glint and a burst of blue fire (o_r_swaeend) striking what it covers. 이펙트=판정: the streaks, the ring the eight
  // stand on, the bursts.
  swae9({ skill, st, def, smite }) {
    // (the original's own size: def.fx itself, not grown with the 단 — what it strikes is fixed in pixels)
    const p = G.player, R = def.ring || 159, fxid = def.fx;
    const cx = p.x, cy = p.y - 20, inRing = e => Math.hypot(e.x - cx, e.y - 20 - cy) <= R;
    if (!G.enemies.some(e => tkFoe(e) && Math.hypot(e.x - cx, e.y - 20 - cy) <= R + 24)) return 0.3;
    const run = G, n = def.n || 8, dur = def.dur || 5, alpha = settings.calmFx ? 0.75 : 1;
    const spots = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R;
      spots.push([x, y, a]);
      // the streak out, its pivot the hero (the picture is drawn going right: turned the way it flies)
      if (def.fxFly && M.fx[def.fxFly]) G.fxs.push({ id: def.fxFly, x: cx, y: cy, t: 0, life: fxLife(def.fxFly), scale: 1, rot: a, anchor: 'bottom', alpha, must: true });
      // the kunai standing at the ring's edge, its tip to the hero (drawn pointing left: turned by its own angle)
      later(0.2, () => {
        if (G !== run) return;
        // (보이는 범위 = 맞는 범위: a kunai standing on a tile, a body across)
        G.fxs.push({ id: fxid, x, y, t: 0, life: dur, scale: capK(fxid, 1, ONE_TILES, a), rot: a, anchor: 'bottom', loop: true, seenLoop: true, alpha });
      });
    }
    // the flight: what lies on each streak (within a third of a tile of its line), once
    later(0.1, () => {
      if (G !== run) return;
      const seen = new Set();
      for (const [x, y] of spots) for (const e of G.enemies) {
        if (!tkFoe(e) || seen.has(e)) continue;
        const ux = x - cx, uy = y - cy, ex = e.x - cx, ey = e.y - 20 - cy, t = (ex * ux + ey * uy) / (R * R);
        if (t < 0 || t > 1 || Math.abs(ex * uy - ey * ux) / R > TILE * 0.45) continue;
        seen.add(e);
        G.quietHit = true;
        smite(e, st.dmg);
        G.quietHit = false;
      }
    });
    // While they stand, the kunai fire (원작 2662 IMG13 #9~13, #21~25, #48~53: from the standing kunai, long white
    // streaks shoot across the field at the monsters): each tick a few of them each send the throw's own streak
    // (def.fxFly) from where it stands through the nearest monster and on past it; what lies on that line is struck.
    // 이펙트=판정: the streak's drawn line is what it strikes (within 0.45 tile of it).
    const ticks = Math.round(dur / def.tick), L = R * (def.shotLen || 1.8), per = def.shots || 3;
    for (let k = 1; k <= ticks; k++) later(0.2 + k * def.tick, () => {
      if (G !== run || G.dead) return;
      const order = spots.map((s, i) => [s, (i * 5 + k * 3) % n]).sort((a, b) => a[1] - b[1]).map(e => e[0]);
      let fired = 0;
      for (const [sx, sy] of order) {
        if (fired >= per) break;
        let best = null, bd = L * L;
        for (const e of G.enemies) {
          if (!tkFoe(e)) continue;
          const d = (e.x - sx) ** 2 + (e.y - 20 - sy) ** 2;
          if (d < bd && d > 16 * 16) { bd = d; best = e; }
        }
        if (!best) continue;
        fired++;
        const a = Math.atan2(best.y - 20 - sy, best.x - sx), ux = Math.cos(a), uy = Math.sin(a);
        if (def.fxFly && M.fx[def.fxFly]) G.fxs.push({ id: def.fxFly, x: sx, y: sy, t: 0, life: fxLife(def.fxFly), scale: L / R, rot: a, anchor: 'bottom', alpha, must: true });
        G.quietHit = true;
        for (const e of G.enemies) {
          if (!tkFoe(e)) continue;
          const ex = e.x - sx, ey = e.y - 20 - sy, t = ex * ux + ey * uy;
          if (t < 0 || t > L || Math.abs(ex * uy - ey * ux) > TILE * 0.45) continue;
          smite(e, st.dmg * def.k);
        }
        G.quietHit = false;
      }
    });
    // the end: each one a white glint and a burst of blue fire, striking what it covers (a tile and a bit round it)
    later(0.2 + dur, () => {
      if (G !== run) return;
      for (const [x, y, a] of spots) {
        if (def.fxEnd && M.fx[def.fxEnd]) G.fxs.push({ id: def.fxEnd, x, y, t: 0, life: fxLife(def.fxEnd), scale: 1, rot: a, anchor: 'bottom', alpha, must: true });
      }
      later(0.08, () => {
        if (G !== run) return;
        const seen = new Set();
        G.quietHit = true;
        for (const [x, y] of spots) for (const e of G.enemies) if (tkFoe(e) && !seen.has(e) && Math.abs(e.x - x) <= 60 && Math.abs(e.y - 20 - y) <= 52) { seen.add(e); smite(e, st.dmg * def.endK); }
        G.quietHit = false;
      });
    });
  },
  // 묵혈파광참 (원작 2662 IMG11): the hero's shadow goes to a foe within `range` tiles (the one ahead first, else the
  // strongest, the hero turned to it) and leaves the great red seal 斬 on it (o_r_zan at the original's own size:
  // red, then pale in its ring, then gone); reaching it, the shadow splits to the left and right and leaves one
  // more each, `side` game pixels to either side across the way. 이펙트=판정: each seal strikes what it covers (a
  // square of 2 × `half` pixels), the middle one in full, the sides a share; all are weakened (curse).
  zan9({ st, def, smite }) {
    const p = G.player, r = def.range || 4, fxid = def.fx;
    const foes = tkNear(p.tx, p.ty, r + 0.5).filter(e => Math.abs(e.tx - p.tx) <= r && Math.abs(e.ty - p.ty) <= r);
    if (!foes.length) return 0.3;
    const fx = p.fdx || 0, fy = fx ? 0 : p.fdy || 1;
    const ahead = foes.filter(e => fx ? Math.sign(e.tx - p.tx) === fx && Math.abs(e.ty - p.ty) <= 1 : Math.sign(e.ty - p.ty) === fy && Math.abs(e.tx - p.tx) <= 1);
    const t = ahead[0] || foes.slice(0, 16).sort((a, b) => (b.kind === 'boss') - (a.kind === 'boss') || b.maxHp - a.maxHp)[0];
    const ex = t.tx - p.tx, ey = t.ty - p.ty;
    if (!ahead.length) { if (Math.abs(ex) >= Math.abs(ey)) { p.fdx = Math.sign(ex) || 1; p.fdy = 0; p.face = p.fdx; } else { p.fdx = 0; p.fdy = Math.sign(ey); } }
    // (across the way, left and right of the line from the hero to it, and `back` pixels back toward the hero: the
    // three stand in a wedge opening to the hero, as in the original — the sides about level with the hero)
    const along = Math.abs(ex) >= Math.abs(ey), ux = along ? Math.sign(ex) || 1 : 0, uy = along ? 0 : Math.sign(ey) || 1;
    const run = G, h = def.half || 59, bk = def.back || 0;
    // (the middle one at least `back` ahead of the hero — a foe next to it is still under its lower half — so the
    // wedge keeps the original's shape)
    const mx = along ? p.x + ux * Math.max(bk, Math.abs(t.x - p.x)) : t.x, my = along ? t.y - 20 : p.y - 20 + uy * Math.max(bk, Math.abs(t.y - p.y));
    const seals = [[mx, my, 1], [mx - ux * bk + uy * def.side, my - uy * bk + ux * def.side, def.splash], [mx - ux * bk - uy * def.side, my - uy * bk - ux * def.side, def.splash]];
    for (const [x, y] of seals) G.fxs.push({ id: fxid, x, y, t: 0, life: fxLife(fxid), scale: 1, rot: 0, anchor: 'bottom', alpha: settings.calmFx ? 0.75 : 1, must: true });
    later(0.08, () => {
      if (G !== run) return;
      G.shake = Math.max(G.shake, 0.08);
      const seen = new Set();
      for (const [x, y, k] of seals) for (const e of G.enemies) {
        if (!tkFoe(e) || seen.has(e) || Math.abs(e.x - x) > h || Math.abs(e.y - 20 - y) > h) continue;
        seen.add(e);
        G.quietHit = true;
        smite(e, st.dmg * k);
        G.quietHit = false;
        tkAfflict(e, def);
      }
    });
  },
  // 묵혈독바르기 (원작 2662 IMG17): (the cast — only the hero's own body tinted violet in the original — is not drawn: it would carry the hero's outline);
  // the next `charges` casts of a striking skill (within `duration`) leave 묵혈독 on every foe they strike for `infect`
  // seconds — the blue-violet flame bursting on it as it takes hold (o_r_mukdok) — under which it takes `taken` more,
  // and falling with it on, it bursts (venomBurst). Nothing struck by itself (설명창: no blow of its own).
  coat9({ skill, def }) {
    const p = G.player, fxid = def.fx;
    if (!tkNear(p.tx, p.ty, 6).length) return 0.4;
    G.coat9 = { n: def.charges || 5, until: G.t + (def.duration || 10), win: 0, infect: def.infect || 7, taken: def.taken || 0.15, burst: tkHit(def, skill) * (def.burst || 1), fx: fxid };
    if (def.fxCast && M.fx[def.fxCast]) addFx(def.fxCast, 0, 0, { follow: true, anchor: 'bottom', must: true });
    note(`${skillName(skill.id, skill.lv)}: 다음 공격 기술 ${G.coat9.n}번이 묵혈독을 남깁니다.`);
  },
  // 회선격풍 (원작 2662 IMG21): the great teal whirlwind raised on the strongest foe in reach (o_m_hoeseon at the original's
  // own size, its pivot the struck one's feet): it strikes what it covers (def.half: the whirl's half width and depth);
  // on up to `winds` of those struck the gathered wind stays — `windN` times in three seconds a small swirl bursts
  // green on it (o_m_hoeseonwind), striking it. Cast again within five seconds, it strikes `stack` harder (up to
  // stackMax times). 이펙트=판정: the whirl, and each burst on the one it is on.
  gale9({ skill, st, def, smite }) {
    const p = G.player, foes = tkNear(p.tx, p.ty, st.range);
    if (!foes.length) return 0.3;
    const t = foes.slice(0, 16).sort((a, b) => (b.kind === 'boss') - (a.kind === 'boss') || b.maxHp - a.maxHp)[0];
    G.galeN = G.t - (G.galeAt || -9) <= 5 ? Math.min(def.stackMax || 5, (G.galeN || 0) + 1) : 0;
    G.galeAt = G.t;
    const run = G, x = t.x, y = t.y, [hx, hy] = def.half, dmg = st.dmg * (1 + (def.stack || 0) * G.galeN);
    if (Math.abs(t.x - p.x) > 2) p.face = Math.sign(t.x - p.x);
    // (보이는 범위 = 맞는 범위: the whirl drawn over the box it strikes — its middle on the struck one's feet, no taller than
    // the box — not rising from them four tiles high over rows it never struck)
    const gid = fxIn(def.fx, (2 * hx * 1.25) / TILE, ((2 * hy) / TILE + 0.3) * 1.25, 'gl');
    fxAt(gid, x, y, { alpha: settings.calmFx ? 0.75 : 1, must: true });
    later(0.15, () => {
      if (G !== run) return;
      const hit = G.enemies.filter(e => tkFoe(e) && Math.abs(e.x - x) <= hx && Math.abs(e.y - y) <= hy);
      G.quietHit = true;
      for (const e of hit) smite(e, e === t ? dmg : dmg * 0.8);
      G.quietHit = false;
      // the gathered wind on the first few struck (the one under the whirl first)
      hit.sort((a, b) => (b === t) - (a === t)).slice(0, def.winds || 3).forEach((e, i) => {
        for (let k = 0; k < (def.windN || 3); k++) later(0.85 + k * 0.85 + i * 0.07, () => {
          if (G !== run || e.hp <= 0) return;
          if (def.fxWind && M.fx[def.fxWind]) addFx(def.fxWind, 0, 4, { on: e, anchor: 'bottom' });
          later(0.17, () => {
            if (G !== run || e.hp <= 0) return;
            G.quietHit = true;
            smite(e, dmg * (def.windK || 0.25));
            G.quietHit = false;
          });
        });
      });
    });
  },
  // 폭렬천뢰탄 (원작 2662 IMG31): the sphere of lightning flies ahead along the row the hero faces (the way it faces if a
  // foe stands on it, else the row with the most, the hero turned to it) up to `range` tiles, to the strongest on that
  // row; there it hangs crackling `hold` seconds and bursts (o_p_cheonroe9: forming, the sphere, the burst — at the
  // original's own size). On its way the lightning leaps from it to `chain` foes round the one struck, the same sphere
  // smaller on each (chainFx). Never laid on the hero's body: it forms a tile ahead, and bursts at least 1.6 tiles out.
  // 이펙트=판정: the one under the sphere, and each under a smaller one.
  orb9({ skill, st, def, smite }) {
    const p = G.player, f = M.fx[def.fx], run = G, depth = st.range || def.range || 7;
    if (!f) return 0.3;
    let [dx, dy] = faceWay();
    const row = (ux, uy) => { const t = []; for (let k = 1; k <= depth; k++) t.push([p.tx + ux * k, p.ty + uy * k]); return onTiles(t); };
    let foes = row(dx, dy);
    if (!foes.length) {
      const best = tkBestRow(depth);
      if (!best) return 0.3;
      [dx, dy, foes] = best;
    }
    p.fdx = dx; p.fdy = dy;
    if (dx) p.face = dx;
    const t = foes.slice().sort((a, b) => (b.kind === 'boss') - (a.kind === 'boss') || b.maxHp - a.maxHp || (Math.abs(a.tx - p.tx) + Math.abs(a.ty - p.ty)) - (Math.abs(b.tx - p.tx) + Math.abs(b.ty - p.ty)))[0];
    // (the sheet's lightning runs to the right, the way the original's sphere flew: turned to the way it goes)
    const rot = dy ? (dy > 0 ? Math.PI / 2 : -Math.PI / 2) : 0, flip = dx < 0;
    const part = (tag, a, b, o = {}) => {
      const id = def.fx + '#' + tag;
      if (!M.fx[id]) M.fx[id] = { ...f, src: f.src || def.fx, f0: (f.f0 || 0) + a, n: b - a, durs: f.durs.slice(a, b), ...o };
      return id;
    };
    const form = part('form', 0, 1), ball = part('ball', 1, 3), burst = part('burst', 3, 4, { durs: [220], hold: true });
    // where it goes: the one struck, but never nearer the hero than 1.6 tiles (its round would lie on the hero)
    const bx = p.x, by = p.y - 26, along = (t.x - p.x) * dx + (t.y - 20 - by) * dy;
    const pull = Math.max(0, TILE * 1.6 - along);
    const ex = t.x + dx * pull, ey = t.y - 20 + dy * pull;
    const sx = bx + dx * TILE, sy = by + dy * TILE, dist = Math.hypot(ex - sx, ey - sy), fly = 0.12 + dist / 900, hold = def.hold || 1.0;
    // (보이는 범위 = 맞는 범위: the sphere strikes the one under it — a body across, as each smaller one on those it leaps to)
    const put = (id, x, y, life, o = {}) => G.fxs.push({ id, x, y, t: 0, life, scale: (o.scale || 1) * capK(id, o.scale || 1, bodyTiles(t), rot), rot, flip, anchor: 'bottom', loop: o.loop, seenLoop: o.loop,
      mv: o.mv, must: true, alpha: settings.calmFx ? 0.8 : 1 });
    put(form, sx, sy, 0.09, { scale: 0.55 });
    later(0.09, () => { if (G === run) put(ball, sx, sy, fly, { scale: 0.55, loop: true, mv: [ex - sx, ey - sy, fly] }); });
    const at = 0.09 + fly;
    later(at, () => {
      if (G !== run) return;
      put(ball, ex, ey, hold, { loop: true });
      later(hold, () => { if (G === run) put(burst, ex, ey, 0.22); });
      G.shake = Math.max(G.shake, 0.08);
      // (no other picture's hit sparks on them: the sphere is what strikes, as in the original)
      G.quietHit = true;
      if (t.hp > 0) { smite(t, st.dmg); tkAfflict(t, def); }
      G.quietHit = false;
      // the lightning leaping on from it: the nearest round the one struck (not one at the hero's side)
      // (its round, f.w·k/2 scaled, clear of the hero's body — half a hero, 26 px, round its middle)
      const sc = def.chainScale || 0.6, clear = f.w * (f.k || 1) / 2 * sc + 26;
      const near = tkNear(t.tx, t.ty, 3).filter(o => o !== t && Math.hypot(o.x - p.x, o.y - 20 - (p.y - 26)) >= clear).slice(0, def.chain || 2);
      near.forEach((o, i) => later(0.25 * (i + 1), () => {
        if (G !== run || o.hp <= 0) return;
        const ox = o.x, oy = o.y - 20, life = Math.max(0.3, hold - 0.25 * (i + 1));
        put(ball, ox, oy, life, { loop: true, scale: sc });
        later(life, () => { if (G === run) put(burst, ox, oy, 0.22, { scale: sc }); });
        G.quietHit = true;
        smite(o, st.dmg * (def.chainK || 0.5));
        G.quietHit = false;
      }));
    });
  },
  // 서리파편 (원작 2662 IMG23): the orb of frost shards flies ahead (the way with the most foes, the hero turned to it) up
  // to `depth` tiles, and bursts on the first foe it meets or at its end: a field of ice crystals (o_m_seori at the
  // original's own size, centred where it burst) stays `dur` seconds, every `tick` striking and slowing what stands in
  // it (def.half: the field's half width and depth). In 과전류 (전도체) the current runs from the hero into those struck.
  shard9({ skill, st, def, smite }) {
    const p = G.player, best = tkBestRow(def.depth);
    if (!best) return 0.3;
    const [dx, dy, foes] = best;
    p.fdx = dx; p.fdy = dy;
    if (dx) p.face = dx;
    // (it bursts on the first foe two tiles out or more — what is nearer it strikes as it passes — or else on the nearest)
    const far = foes.map(e => Math.abs(e.tx - p.tx) + Math.abs(e.ty - p.ty)).filter(n => n >= 2).sort((a, b) => a - b)[0];
    const k = far || Math.max(1, Math.min(...foes.map(e => Math.abs(e.tx - p.tx) + Math.abs(e.ty - p.ty))));
    const sx = p.x, sy = p.y - 20, ex = sx + dx * k * TILE, ey = sy + dy * k * TILE, fly = 0.08 * k, run = G;
    if (def.fxShot && M.fx[def.fxShot]) addFx(def.fxShot, sx, sy, { mv: [ex - sx, ey - sy, fly], anchor: 'mid', must: true, cap: ONE_TILES });
    const passed = new Set();
    for (let i = 1; i < k; i++) later(0.08 * i, () => {
      if (G !== run) return;
      G.quietHit = true;
      for (const e of onTiles([[p.tx + dx * i, p.ty + dy * i]])) if (!passed.has(e)) { passed.add(e); smite(e, st.dmg * 0.5); }
      G.quietHit = false;
    });
    later(fly, () => {
      if (G !== run) return;
      const [hx, hy] = def.half, life = def.dur;
      // (its pivot the field's middle; 보이는 범위 = 맞는 범위: within the box it strikes, 2·half and a tile)
      const sk = Math.min(1, (2 * hx * 1.25 + TILE) / (fxMid(def.fx)[2] || 1), (2 * hy * 1.25 + TILE) / (fxMid(def.fx)[3] || 1));
      tkLoop(def.fx, ex, ey, life, { alpha: settings.calmFx ? 0.7 : 1, anchor: 'bottom', scale: sk });
      const n = Math.round(life / def.tick);
      for (let i = 0; i < n; i++) later(i * def.tick, () => {
        if (G !== run || G.dead) return;
        const hit = G.enemies.filter(e => tkFoe(e) && Math.abs(e.x - ex) <= hx && Math.abs(e.y - 20 - ey) <= hy);
        G.quietHit = true;
        for (const e of hit) { smite(e, st.dmg * (i ? def.k : 1)); tkAfflict(e, def); }
        G.quietHit = false;
        overcurrent(hit, st.dmg);
      });
    });
  },
  // 환영안개 (원작 2662 IMG29; PVP 기술 → 몬스터 상대): the purple fog of phantoms rolled out ahead of the hero (the way it
  // faces) for `duration` (o_m_hwanyeong at the original's own size, its pivot the hero's feet where it was cast); every
  // `tick` the foes in it (reach: from and to how far ahead, side: how far to each side) lose their way — slowed,
  // cursed (they take more) — and are struck a little.
  // 궁사 9차 (원작 2662 IMG40, IMG42): see igi9, cheon9 above
  igi9({ st, def, smite }) { return igi9(st, def, smite); },
  cheon9({ st, def, smite }) { return cheon9(st, def, smite); },
  // 마도사 9차 (원작 2662 IMG58, IMG62, IMG66): see cross9, saechul9, gong9 above
  cross9({ skill, st, def }) { return cross9(skill, st, def); },
  saechul9({ st, def, smite }) { return saechul9(st, def, smite); },
  gong9({ st, def, smite }) { return gong9(st, def, smite); },
  // 창술사(무사) 9차 ← 살수 (원작 2662 IMG86, IMG88, IMG90): see cheong9, erode9, dim9 above
  cheong9({ st, def, smite }) { return cheong9(st, def, smite); },
  erode9({ st, def, smite }) { return erode9(st, def, smite); },
  dim9({ skill, st, def }) { return dim9(skill, st, def); },
  fog9({ skill, st, def }) {
    const p = G.player, fx = p.fdx || (p.face || -1), fy = p.fdx ? 0 : p.fdy || 0;
    const ux = fy ? 0 : Math.sign(fx) || -1, uy = fy, [r0, r1] = def.reach, side = def.side;
    const ox = p.x, oy = p.y - 20, run = G;
    const inFog = e => { const ax = (e.x - ox) * ux + (e.y - 20 - oy) * uy, sd = Math.abs((e.x - ox) * uy - (e.y - 20 - oy) * ux); return ax >= r0 && ax <= r1 && sd <= side; };
    if (!G.enemies.some(e => tkFoe(e) && inFog(e))) return 0.4;
    const life = st.duration || def.duration, d = tkHit(def, skill);
    // (drawn going left: flipped when the hero faces right, turned for up and down)
    const f = tkLoop(def.fx, ox, p.y, life, { alpha: settings.calmFx ? 0.6 : 1, anchor: 'bottom' });
    if (f) { if (ux > 0) f.flip = true; if (uy) f.rot = uy < 0 ? Math.PI / 2 : -Math.PI / 2; }
    for (let k = 1; k <= Math.round(life / def.tick); k++) later(k * def.tick, () => {
      if (G !== run || G.dead) return;
      G.quietHit = true;
      for (const e of G.enemies) if (tkFoe(e) && inFog(e)) { tkAfflict(e, def); hurtEnemy(e, d); }
      G.quietHit = false;
    });
    note(`${skillName(skill.id, skill.lv)}: 환영 안개가 퍼집니다.`);
  },
  // 순보선풍 (원작 2662 IMG49; 이동 기술 → 바라보는 쪽으로만): the 천인 leaps the way it faces onto the foe there (up to `range`
  // tiles ahead, a tile to either side of the line) with the most round it, and strikes as it lands; the blue gale
  // (o_cl_sunbo at the original's own size, its pivot the whirl's middle, 22 over the feet) whirls where it landed for its
  // life, every `tick` striking what stands inside its round (def.half: the whirl's half width and depth); landing, the
  // hero takes less a moment (설명창: 순간적으로 방어에 최적화 — `guard` for `guardT` s). 이펙트=판정: the whirl.
  sunbo9({ skill, st, def, smite }) {
    const p = G.player, fx = p.fdx || (p.fdy ? 0 : p.face || 1), fy = fx ? 0 : p.fdy;
    const ahead = e => {
      const a = (e.tx - p.tx) * fx + (e.ty - p.ty) * fy, s = Math.abs((e.tx - p.tx) * fy - (e.ty - p.ty) * fx);
      return a >= 1 && a <= (def.range || 6) && s <= 1 ? a : 0;
    };
    const foes = G.enemies.filter(e => tkFoe(e) && ahead(e));
    if (!foes.length) return 0.3;
    let t = null, most = -1;
    for (const e of foes.slice(0, 24)) {
      const n = around(e.tx, e.ty, 1).length;
      if (n > most || (n === most && ahead(e) > ahead(t))) { most = n; t = e; }
    }
    if (!steering()) {
      // (down on the near side of it, or beside it: the way it faces stays the way it leapt)
      const spots = [[t.tx - fx, t.ty - fy], [t.tx - fx + fy, t.ty - fy + fx], [t.tx - fx - fy, t.ty - fy - fx], [t.tx + fy, t.ty + fx], [t.tx - fy, t.ty - fx]];
      for (const [x, y] of spots) if ((x !== p.tx || y !== p.ty) && ahead({ tx: x, ty: y }) && tkMoveHero(x, y)) break;
    }
    p.inv = Math.max(p.inv || 0, 0.35);
    if (def.guard && !(G.buffs.ward9 > G.t + def.guardT)) { G.buffs.ward9 = G.t + def.guardT; G.buffs.ward9K = Math.max(def.guard, G.buffs.ward9 > G.t ? G.buffs.ward9K || 0 : 0); }
    // (its frames at the original's own pace — 3 s, as long as it strikes — not cut to the game's usual 0.11 s a frame)
    const fid = def.fx + '#hold';
    if (!M.fx[fid] && M.fx[def.fx]) M.fx[fid] = { ...M.fx[def.fx], src: M.fx[def.fx].src || def.fx, hold: true };
    const run = G, x = p.x, y = p.y - 22, [hx, hy] = def.half, life = fxLife(fid) || 2.8;
    G.fxs.push({ id: fid, x, y, t: 0, life, scale: 1, rot: 0, anchor: 'bottom', alpha: settings.calmFx ? 0.7 : 1, must: true });
    const inWhirl = e => tkFoe(e) && ((e.x - x) / hx) ** 2 + ((e.y - 20 - y) / hy) ** 2 <= 1;
    const n = Math.max(1, Math.round((life - 0.2) / (def.tick || 0.5)));
    for (let k = 0; k <= n; k++) later(0.08 + k * (def.tick || 0.5), () => {
      if (G !== run || G.dead) return;
      G.quietHit = true; // (no hit marks of another's: the whirl is what strikes)
      for (const e of G.enemies.filter(inWhirl)) smite(e, k ? st.dmg * (def.k || 0.3) : e === t ? st.dmg : st.dmg * 0.7);
      G.quietHit = false;
    });
  },
  // 해일강타 (원작 2662 IMG51): the 천인 raises a tidal wave the way it faces: every foe
  // `depth` tiles ahead and `width` to each side is struck at once, an ice pillar rising on it (o_cl_haeilhit, at most
  // twelve drawn) and 풍랑의표식 left on it for `mark` s (cursed: it takes more; 천공의공명 rings it); the sheet of water
  // (o_cl_haeil at the original's own size, its pivot the hero's feet; drawn going left — flipped going right, turned
  // for up and down) sweeps out over that ground in a second. 이펙트=판정: the water covers what was struck.
  haeil9({ skill, st, def, smite }) {
    // (사용자 결정: only the way the hero faces — it waits while nothing stands in that row of `depth` × 3)
    const p = G.player, dx = p.fdx || (p.fdy ? 0 : p.face || 1), dy = dx ? 0 : p.fdy;
    const sx = p.tx, sy = p.ty, w = def.width || 1, run = G;
    const inWave = e => {
      const a = (e.tx - sx) * dx + (e.ty - sy) * dy, s = Math.abs((e.tx - sx) * dy - (e.ty - sy) * dx);
      return tkFoe(e) && a >= 1 && a <= def.depth && s <= w;
    };
    if (!G.enemies.some(inWave)) return 0.3;
    const f = { id: def.fx, x: p.x, y: p.y, t: 0, life: fxLife(def.fx), scale: 1, rot: 0, anchor: 'bottom', alpha: settings.calmFx ? 0.65 : 1, must: true };
    if (dx > 0) f.flip = true;
    if (dy) f.rot = dy < 0 ? Math.PI / 2 : -Math.PI / 2;
    G.fxs.push(f);
    later(0.12, () => {
      if (G !== run || G.dead) return;
      G.quietHit = true;
      let drawn = 0;
      for (const e of G.enemies.filter(inWave)) {
        if (def.fxHit && M.fx[def.fxHit] && drawn++ < 12) addFx(def.fxHit, 0, 2, { on: e, anchor: 'bottom' });
        smite(e, st.dmg);
        tkAfflict(e, def);
        e.mark9 = G.t + (def.mark || 8);
      }
      G.quietHit = false;
    });
  },
  // 화혼돌파 (원작 2662 IMG68; 설명창 IMG67: 대장군의 힘으로 전방 6칸 앞으로 돌진하며 경로 내 적을 공격, 주변 적에게도 요괴혼이
  // 날아가 공격; 이동 기술 → 바라보는 쪽으로만): the 도깨비 charges `depth` tiles the way it faces (stopping at the ground's edge;
  // one on the last tile steps aside), and where it ends the blue soul fire (o_dk_hwahon at the original's own size, its pivot
  // the hero's feet; drawn going left — flipped going right, turned for up and down) sweeps before it, `ahead` tiles more, while
  // its cyan trails stream back over the path. 이펙트=판정: the path and the sweep ahead, `half` tiles to either side, burnt.
  hwahon9({ st, def, smite }) {
    const p = G.player, fx = p.fdx || (p.fdy ? 0 : p.face || 1), fy = fx ? 0 : p.fdy, run = G, sx = p.tx, sy = p.ty;
    const deep = def.depth || 6, ahead = def.ahead || 2, half = def.half ?? 1;
    const row = k => { const out = []; for (let o = -half; o <= half; o++) out.push([sx + fx * k + (fy ? o : 0), sy + fy * k + (fx ? o : 0)]); return out; };
    let any = false;
    for (let k = 1; k <= deep + ahead && !any; k++) any = onTiles(row(k)).length > 0;
    if (!any) return 0.3;
    let went = 0;
    const x0 = p.x, y0 = p.y;
    if (!steering()) {
      let reach = 0;
      for (let k = 1; k <= deep; k++) { if (G.arena && !Hunt.open(sx + fx * k, sy + fy * k)) break; reach = k; }
      for (let k = reach; k >= 1 && !went; k--) {
        const tx = sx + fx * k, ty = sy + fy * k;
        for (const e of onTiles([[tx, ty]])) tkShove(e, tx + fy, ty + fx) || tkShove(e, tx - fy, ty - fx);
        if (tkMoveHero(tx, ty)) { went = k; }
      }
    }
    // (the dash is seen along the way, not a jump: the hero is drawn travelling the path over `dashT` s a tile — 6 tiles
    // ≈ 0.36 s — the swoosh and its trails carried with it, each row struck as the hero passes it; p.glide, drawHero)
    const per = def.dashT || 0.06, travel = went * per, t0 = G.t;
    if (went) {
      G.ghosts = [];
      p.slide = null;
      p.glide = { x0, y0, dx: p.x - x0, dy: p.y - y0, t: t0, d: travel };
      p.inv = Math.max(p.inv || 0, travel + 0.3);
    }
    const at = { get x() { return glideAt(p).x; }, get y() { return glideAt(p).y; } };
    // (보이는 범위 = 맞는 범위: the sweep and its trails no longer than the rows it burns, went + ahead, nor wider than
    // them — drawn at the original's size it reached three tiles behind a charge the crowd held short)
    const hid = fxIn(def.fx, Math.max(ONE_TILES, 1.25 * (went + ahead)), 1.25 * (2 * half + 1), 'hh' + went, false);
    const f = { id: hid, x: 0, y: 0, on: at, t: 0, life: fxLife(def.fx), scale: 1, rot: 0, anchor: 'bottom', alpha: settings.calmFx ? 0.85 : 1, must: true };
    if (fx > 0) f.flip = true;
    if (fy) f.rot = fy < 0 ? Math.PI / 2 : -Math.PI / 2;
    // (held where it stood — the crowd let it go nowhere —: the sweep over the rows ahead it burns, not on the hero)
    if (!went) fxAt(hid, p.x + fx * TILE * (ahead + 1) / 2, p.y - 24 + fy * TILE * (ahead + 1) / 2, { flip: f.flip, rot: f.rot, alpha: f.alpha });
    else G.fxs.push(f);
    const rows = went + ahead, seen = new Set();
    for (let k = 1; k <= rows; k++) later(0.04 + (k <= went ? (k - 1) * per : travel + (k - went - 1) * 0.06), () => {
      if (G !== run) return;
      G.quietHit = true;
      for (const o of onTiles(row(k))) {
        if (seen.has(o)) continue;
        seen.add(o);
        smite(o, st.dmg);
        tkAfflict(o, def);
      }
      G.quietHit = false;
    });
  },
  // 장승영역 (원작 2662 IMG75; PVP 기술 → 몬스터 상대로, 모습 그대로): where the 도깨비 stands, the golden seal (o_dk_jangseal: its
  // first frames rising, then the rest looping) and round it the ring of 장승 on their green square (o_dk_jangpole), both at the
  // original's own size, their pivot the hero's feet, for `duration` s. Every `tick` the foes inside the square (`radius` tiles
  // each way: 5×5) are struck by the 장승 and slowed; while the hero is inside, what it takes is cut by `ward` (설명창: 영역 안에서
  // 밖을 공격하거나 밖에서 안을 공격할 수 없다). It stays where it was laid. 이펙트=판정: the square.
  jang9({ skill, st, def }) {
    const p = G.player, R = def.radius || 2;
    if (!tkNear(p.tx, p.ty, R + 2).length) return 0.4;
    const run = G, life = def.duration || 8, x = p.x, y = p.y, tx0 = p.tx, ty0 = p.ty, d = tkHit(def, skill), calm = settings.calmFx ? 0.75 : 1;
    const src = M.fx[def.fx];
    if (src && !M.fx[def.fx + '#rise']) {
      const cut = Math.min(3, src.n - 1);
      M.fx[def.fx + '#rise'] = { ...src, src: src.src || def.fx, f0: 0, n: cut, durs: src.durs.slice(0, cut) };
      M.fx[def.fx + '#held'] = { ...src, src: src.src || def.fx, f0: cut, n: src.n - cut, durs: src.durs.slice(cut) };
    }
    // (보이는 범위 = 맞는 범위: the seal and its ring within the square they strike, (2R+1) tiles and a quarter)
    const js = Math.min(capK(def.fx, 1, (2 * R + 1) * 1.25), M.fx[def.fxPole] ? capK(def.fxPole, 1, (2 * R + 1) * 1.25) : 1);
    if (src) {
      const rise = fxLife(def.fx + '#rise');
      G.fxs.push({ id: def.fx + '#rise', x, y, t: 0, life: rise, scale: js, rot: 0, anchor: 'bottom', alpha: calm, must: true });
      G.fxs.push({ id: def.fx + '#held', x, y, t: -rise, life: life - rise, scale: js, rot: 0, anchor: 'bottom', loop: true, seenLoop: true, alpha: calm, must: true, fadeOut: 0.4 });
    }
    if (M.fx[def.fxPole]) G.fxs.push({ id: def.fxPole, x, y, t: 0, life, scale: js, rot: 0, anchor: 'bottom', loop: true, seenLoop: true, alpha: calm, must: true, fadeOut: 0.4 });
    const inside = e => tkFoe(e) && Math.abs(e.tx - tx0) <= R && Math.abs(e.ty - ty0) <= R;
    const n = Math.round(life / (def.tick || 0.5));
    for (let k = 1; k <= n; k++) later(k * (def.tick || 0.5), () => {
      if (G !== run || G.dead) return;
      if (Math.abs(p.tx - tx0) <= R && Math.abs(p.ty - ty0) <= R) { G.buffs.ward9 = G.t + (def.tick || 0.5) + 0.1; G.buffs.ward9K = def.ward || 0.5; }
      G.quietHit = true;
      for (const e of G.enemies.filter(inside)) { hurtEnemy(e, d); tkAfflict(e, def, 0); }
      G.quietHit = false;
    });
    note(`${skillName(skill.id, skill.lv)}: 장승이 영역을 둘러쌉니다.`);
  },
  // 비사검 (원작 2662 IMG79; 설명창 IMG78: 차사 주변의 대상에게 살극의 기를 방출, 맞은 적과 그 주변에 피해): for `duration`, every
  // `every`, the 살극의 기 goes out to `shots` foes within `range` tiles (the nearest first, each in turn) and swings shut on
  // each as the red ring (o_rp_bisa at the original's own size, its middle on the foe's middle): that foe and whoever
  // stands inside the ring (`reach` px of its middle) is cut. 이펙트=판정: the ring.
  bisa9({ st, def, smite }) {
    const p = G.player, r = st.range || def.range || 3;
    if (!tkNear(p.tx, p.ty, r).length) return 0.3;
    const run = G, n = Math.max(1, Math.round((st.duration || def.duration) / def.every)), used = new Map();
    const life = fxLife(def.fx) || 0.22, alpha = settings.calmFx ? 0.85 : 1;
    for (let i = 0; i < n; i++) later(i * def.every, () => {
      if (G !== run || G.dead) return;
      const pool = tkNear(p.tx, p.ty, r).slice(0, 10);
      if (!pool.length) return;
      // (the nearest, each in turn: the one struck least first)
      pool.sort((a, b) => (used.get(a) || 0) - (used.get(b) || 0));
      pool.slice(0, def.shots || 2).forEach((t, j) => later(j * 0.06, () => {
        if (G !== run || G.dead) return;
        used.set(t, (used.get(t) || 0) + 1);
        const x = t.x, y = t.y - 24;
        // (the crescent, then the ring held a moment: the original's two frames at their own pace, 0.11 s each)
        // (보이는 범위 = 맞는 범위: the ring no wider than its reach round the struck one, 2·reach)
        G.fxs.push({ id: def.fx, x, y, t: 0, life: life + 0.1, scale: capK(def.fx, 1, Math.max(ONE_TILES, (2 * def.reach) / TILE * 1.25)), rot: 0, anchor: 'bottom', alpha, must: true, flip: t.x < p.x });
        later(life * 0.5, () => {
          if (G !== run) return;
          G.quietHit = true;
          for (const e of G.enemies) if (tkFoe(e) && (e === t || Math.hypot(e.x - x, e.y - 24 - y) <= def.reach)) smite(e, e === t ? st.dmg : st.dmg * 0.7);
          G.quietHit = false;
        });
      }));
    });
  },
  // 황천화 (원작 2662 IMG81; 설명창 IMG80: 7×7 주변 무작위 위치에 명계의 꽃 황천화가 피고, 꽃가루에 닿은 적은 능력치가 대폭 감소,
  // 시전한 차사는 황천화 주변에서 체력과 마력이 빠르게 회복): `n` lotuses come up at random spots within `radius` tiles of the
  // hero (on the foes there first; o_rp_lotus at the original's own size, its pivot the flower's middle): bud, bloom, then
  // its blue ring pulses and golden powder held for `dur`; every `tick` the foes within `touch` px of a flower are cursed
  // and slowed (능력치 감소: they take more) and cut a little (k), and the 차사 standing within reach of one gains `heal`% of
  // its life and `mana` of its 마력. At the end each flower bursts (o_rp_lotusburst: the great bloom, the white rings, the
  // dark-blue smoke, the petals) striking what stands within `burstR` px. 이펙트=판정: the flowers and their bursts.
  hwang9({ st, def, smite }) {
    const p = G.player, R = st.radius || def.radius || 3;
    if (!tkNear(p.tx, p.ty, R + 1).length) return 0.3;
    const run = G, alpha = settings.calmFx ? 0.85 : 1;
    // the flower's own frames: bud and bloom once, then the bloom held (its ring pulses and powder) — parts of the sheet
    const src = M.fx[def.fx];
    if (src && !M.fx[def.fx + '#bud']) {
      const n = src.durs.length, cut = Math.min(4, n - 1);
      M.fx[def.fx + '#bud'] = { ...src, src: src.src || def.fx, f0: 0, n: cut, durs: src.durs.slice(0, cut) };
      M.fx[def.fx + '#held'] = { ...src, src: src.src || def.fx, f0: cut, n: n - cut, durs: src.durs.slice(cut) };
    }
    // the spots: the foes within reach first (a random few), the rest at random over the 7×7, none twice
    const taken = new Set(), spots = [];
    const foes = tkNear(p.tx, p.ty, R).filter(e => Math.abs(e.tx - p.tx) <= R && Math.abs(e.ty - p.ty) <= R).sort(() => Math.random() - 0.5);
    for (const e of foes) { const k = e.tx + ',' + e.ty; if (spots.length < Math.ceil(def.n * 0.6) && !taken.has(k)) { taken.add(k); spots.push([e.tx, e.ty]); } }
    for (let g = 0; spots.length < def.n && g < 200; g++) {
      const tx = p.tx + Math.round(rand(-R, R)), ty = p.ty + Math.round(rand(-R, R)), k = tx + ',' + ty;
      if ((tx !== p.tx || ty !== p.ty) && !taken.has(k)) { taken.add(k); spots.push([tx, ty]); }
    }
    const pts = spots.map(([tx, ty]) => [tx * TILE + TILE / 2, ty * TILE + TILE - 30]);
    const bud = fxLife(def.fx + '#bud'), dur = def.dur || 3.4;
    pts.forEach(([x, y], i) => later(i * 0.03, () => {
      if (G !== run) return;
      // (top: over the crowd's other pictures — the blows' flashes and puffs hid all but a few flowers in a crowd)
      G.fxs.push({ id: def.fx + '#bud', x, y, t: 0, life: bud, scale: 1, rot: 0, anchor: 'bottom', alpha, must: true, top: true });
      later(bud, () => { if (G !== run) return; const h = tkLoop(def.fx + '#held', x, y, Math.max(0.3, dur - bud - i * 0.03), { anchor: 'bottom', alpha }); if (h) { h.top = true; h.must = true; } });
    }));
    const near = (e, r, o = [0, 0]) => pts.some(([x, y]) => Math.hypot(e.x - x - o[0], e.y - 24 - y - o[1]) <= r);
    const ticks = Math.max(1, Math.round(dur / (def.tick || 0.5)));
    for (let k = 1; k <= ticks; k++) later(k * (def.tick || 0.5), () => {
      if (G !== run || G.dead) return;
      G.quietHit = true;
      for (const e of G.enemies) if (tkFoe(e) && near(e, def.touch || 40)) { tkAfflict(e, def); smite(e, st.dmg * (def.k || 0.15)); }
      G.quietHit = false;
      if (near(p, (def.touch || 40) + TILE)) {
        if (def.heal) heal(p.maxHp * def.heal / 100, false, true);
        if (def.mana) p.mp = Math.min(p.maxMp, p.mp + p.maxMp * def.mana);
      }
    });
    later(dur, () => {
      if (G !== run || G.dead) return;
      pts.forEach(([x, y]) => G.fxs.push({ id: def.fxBurst, x, y: y + 12, t: 0, life: fxLife(def.fxBurst), scale: 1, rot: 0, anchor: 'bottom', alpha, must: true, top: true }));
      later(0.1, () => {
        if (G !== run) return;
        G.shake = Math.max(G.shake, 0.08);
        G.quietHit = true;
        // (이펙트=판정: the burst's own round — the bloom and its rings, about 46 px round a point a little right of and
        // below the flower — not wider)
        for (const e of G.enemies) if (tkFoe(e) && near(e, def.burstR || 46, def.burstAt || [8, 7])) smite(e, st.dmg);
        G.quietHit = false;
      });
    });
  },
  // 진'투귀살 (원작 2662 IMG96; 설명창 IMG95: 전방으로 마력의 화살을 2발 연속으로 쏜다, 적에게 피해를 주면 대상을 기준으로 주변
  // 적에게 유도 화살이 튀어나가 추가 피해 — 범위 앞 세 줄, 최대 7칸): only the way the hero faces. `shots` great arrows one after
  // another (`gap` s), each the original's own cone (o_mk_tugwi at its own size, its pivot the hero, drawn going left —
  // flipped going right, turned for up and down): it strikes every foe `depth` tiles ahead, `half` to each side (the cone
  // reaches 1.4–4.4 tiles and is 2.7 tiles tall in the scene; the tooltip's three rows — 이펙트=판정: tiles `from`..`depth` ahead, the cone's own reach). From each struck foe (at most
  // `homeFrom`) a homing arrow leaps to `chain` foes within `chainR` tiles of it, the golden swirl of the scene
  // (o_mk_tugwihit) on each, `chainK` of the blow. 이펙트=판정: the cone, then the swirls.
  tugwi9({ st, def, smite }) {
    const p = G.player, dx = p.fdx || (p.fdy ? 0 : p.face || 1), dy = dx ? 0 : p.fdy;
    const sx = p.tx, sy = p.ty, run = G;
    const inCone = e => {
      const a = (e.tx - sx) * dx + (e.ty - sy) * dy, s = Math.abs((e.tx - sx) * dy - (e.ty - sy) * dx);
      return tkFoe(e) && a >= (def.from || 1) && a <= def.depth && s <= (def.half || 1);
    };
    if (!G.enemies.some(inCone)) return 0.3;
    const alpha = settings.calmFx ? 0.85 : 1;
    for (let k = 0; k < (def.shots || 2); k++) later(k * (def.gap || 0.3), () => {
      if (G !== run || G.dead) return;
      const f = { id: def.fx, x: p.x, y: p.y - 24, t: 0, life: fxLife(def.fx) + 0.05, scale: 1, rot: 0, anchor: 'bottom', alpha, must: true };
      if (dx > 0) f.flip = true;
      if (dy) f.rot = dy < 0 ? Math.PI / 2 : -Math.PI / 2;
      G.fxs.push(f);
      later(0.07, () => {
        if (G !== run || G.dead) return;
        const hit = G.enemies.filter(inCone);
        G.quietHit = true;
        for (const e of hit) smite(e, st.dmg / (def.shots || 2), [dx, dy]);
        G.quietHit = false;
        // the homing arrows: from each struck one to the others round it
        const used = new Set(hit);
        hit.slice(0, def.homeFrom || 3).forEach((src, i) => later(0.12 + i * 0.04, () => {
          if (G !== run || G.dead) return;
          const near = tkNear(src.tx, src.ty, def.chainR || 2).filter(o => o !== src && !used.has(o)).slice(0, def.chain || 3);
          for (const o of near.length ? near : [src]) {
            used.add(o);
            if (def.fxHit && M.fx[def.fxHit]) G.fxs.push({ id: def.fxHit, x: o.x, y: o.y - 24, t: 0, life: fxLife(def.fxHit), scale: 1, rot: 0, anchor: 'bottom', alpha, must: true });
            later(0.05, () => {
              if (G !== run || !tkFoe(o)) return;
              G.quietHit = true;
              smite(o, st.dmg * (def.chainK || 0.45) / (def.shots || 2));
              G.quietHit = false;
            });
          }
        }));
      });
    });
  },
  // 마궁폭사 (원작 2662 IMG100; 설명창 IMG99: 마력의 화살을 동시에 여러발 장전하여 시전자 기준 가장 가까운 적에게 동시에 3발씩 화살을
  // 발사 — 5칸 거리, 최대 24발): the crimson spiked disc of the loaded arrows round the hero (o_mk_magung at its own size, held
  // while it shoots), and every `every` s a volley of `per` arrows at the nearest foes within `range` tiles (the nearest
  // first, one arrow each), `volleys` in all (24 arrows). Each arrow is the scene's own spiked red bolt (o_mk_magungshot: its
  // white head and the spikes fanning behind it) sent from the hero to its foe — its far end reaches the foe as it strikes.
  magung9({ st, def, smite }) {
    const p = G.player, R = st.range || def.range || 5;
    if (!tkNear(p.tx, p.ty, R).length) return 0.3;
    const run = G, alpha = settings.calmFx ? 0.85 : 1, n = def.volleys || 8, span = n * def.every;
    // (보이는 범위 = 맞는 범위: the disc round the hero strikes nothing — the hero's size; each bolt a body long, as it
    // strikes one)
    tkLoop(def.fxCast, 0, -26, span + 0.2, { follow: true, anchor: 'mid', alpha, scale: selfCapK(def.fxCast) });
    const bsc = capK(def.fx, 1, ONE_TILES), len = (M.fx[def.fx] ? M.fx[def.fx].w * (M.fx[def.fx].k || 1) * bsc : 80) * 0.9;
    for (let v = 0; v < n; v++) later(0.1 + v * def.every, () => {
      if (G !== run || G.dead) return;
      const pool = tkNear(p.tx, p.ty, R).slice(0, def.per || 3);
      pool.forEach((t, j) => {
        // (the arrow's head starts at the hero, the spikes trailing it; it goes until its far end is on the foe)
        const ux = t.x - p.x, uy = t.y - p.y, d = Math.hypot(ux, uy) || 1;
        const go = Math.max(0, d - len);
        G.fxs.push({ id: def.fx, x: p.x, y: p.y - 24, t: 0, life: 0.2, scale: bsc, rot: Math.atan2(-uy, -ux), anchor: 'bottom', alpha, must: true,
          mv: [(ux / d) * go, (uy / d) * go, 0.16], fadeOut: 0.06 });
        later(0.12 + j * 0.02, () => {
          if (G !== run || !tkFoe(t)) return;
          G.quietHit = true;
          smite(t, st.dmg / (n * (def.per || 3)) * 3);
          G.quietHit = false;
        });
      });
    });
  },
};
/** 부조리 (원작 흑화랑 9차 패시브, 설명창 IMG101 [지속효과 마법]: 상태이상 공격 — 마비·절대마비·수면·기절·무장해제·회복불가·변이 — 을
 *  받았을 경우 일시적으로 보호막이 씌워져 피해를 막는다, 보호막 (5초), 재발동 20초; data.js mk_bujori.bujori9): a hard status on the
 *  격투가, or a blow of a boss, a lieutenant or a champion (this game's monsters that strike in their nature), raises a
 *  barrier of `share` of its life for `dur` s, once in `cd` s. No picture of its own (no scene of it): the word only. */
function bujori9(kind) {
  const b = SKILLS.mk_bujori && SKILLS.mk_bujori.bujori9;
  if (!b || G.cls.id !== 'monk' || G.dead || !(promoOf('monk') >= 9 || G.training)) return;
  if (kind && !b.kinds.includes(kind)) return;
  if (G.t < (G.bujoriAt || 0)) return;
  const p = G.player;
  G.bujoriAt = G.t + b.cd;
  p.barrier = Math.max(p.barrier || 0, p.maxHp * b.share);
  p.barrierUntil = G.t + b.dur;
  floatText(p.x, p.y - 84, '부조리', '#ffb0b0');
}
/** 천공의공명 (원작 9차 패시브, 설명창 IMG52; data.js cl_gongmyeong.gong9): a 천기 skill cast sets the 풍랑의표식 ringing — on every
 *  marked foe within `reach` tiles (at most `max`) a bolt of the storm falls (the small light of a blow: the original shows
 *  no picture of it), and the skill's wait shrinks `cut` a foe (at most `cutMax`). */
function gongmyeong(gm, skill, st) {
  const p = G.player, run = G;
  const marked = G.enemies.filter(e => tkFoe(e) && e.mark9 > G.t && Math.hypot(e.tx - p.tx, e.ty - p.ty) <= gm.reach).slice(0, gm.max);
  if (!marked.length) return;
  const blow = (st.dmg || 30) * gm.k;
  marked.forEach((e, i) => later(0.12 + i * 0.05, () => {
    if (G !== run || e.hp <= 0) return;
    if (M.fx[gm.fx]) fxOn(gm.fx, e, { scale: 0.7 });
    G.procHitting = true;
    hurtEnemy(e, blow);
    G.procHitting = false;
  }));
  const cut = Math.min(gm.cutMax, marked.length * gm.cut);
  if (skill.timer > 0) skill.timer -= (skill.cdMax || skill.timer) * cut;
}

/** 불길한혼불 (원작 9차 패시브, 설명창 IMG69; data.js dk_honbul.honbul9): a fire skill cast bursts the soul fire on every foe it
 *  clings to within `reach` tiles — that one and those a tile round it take `k` of the skill's blow (the small fire of a blow:
 *  the original shows no picture of it) — and then it clings anew to the `n` nearest foes within `cling` tiles for `life` s. */
function honbul(hb, skill, st) {
  const p = G.player, run = G, blow = (st.dmg || st.hit || 30) * hb.k;
  const lit = G.enemies.filter(e => tkFoe(e) && e.honbul9 > G.t && Math.hypot(e.tx - p.tx, e.ty - p.ty) <= hb.reach).slice(0, 8);
  lit.forEach((e, i) => {
    e.honbul9 = 0;
    later(0.15 + i * 0.05, () => {
      if (G !== run || e.hp <= 0) return;
      if (M.fx[hb.fx]) fxOn(hb.fx, e, { scale: SPARK_SCALE[hb.fx] || 0.5 });
      // (one small fire on the one it clung to, no other marks: G.quietHit keeps the else-branch's claw marks off the struck)
      G.procHitting = true; G.quietHit = true;
      for (const o of around(e.tx, e.ty, 1)) hurtEnemy(o, o === e ? blow : blow * 0.5);
      G.procHitting = false; G.quietHit = false;
    });
  });
  tkNear(p.tx, p.ty, hb.cling).filter(e => !(e.honbul9 > G.t) && !lit.includes(e)).slice(0, hb.n).forEach(e => { e.honbul9 = G.t + hb.life; });
}

// The follow-up blows of the 9차 보조 공격 (echo): (def, blow, tick).
const ECHO = {
  // 호기어검 (원작 2662 IMG02): a great sword falls from the sky on one of the foes within reach — the ring of light
  // and the bolt, the ice, the sword standing a moment, its white ghost (o_w_hogisword, at the original's own size,
  // its pivot the struck one's feet). It strikes as it lands: that one, and a share on those within a tile (the
  // burst is three and a half tiles wide).
  drop(def, d) {
    const p = G.player, near = tkNear(p.tx, p.ty, def.range).filter(e => Math.abs(e.tx - p.tx) <= def.range && Math.abs(e.ty - p.ty) <= def.range);
    if (!near.length) return;
    // (not the same one twice running while there are others: the swords go round the field)
    const pool = near.slice(0, 8).filter(e => e !== G.dropLast);
    const e = (pool.length ? pool : near)[Math.floor(Math.random() * (pool.length || near.length))];
    G.dropLast = e;
    const tx = e.tx, ty = e.ty;
    // 이펙트=판정 (사용자 피드백: 레이드에서 날개 달린 푸른 소용돌이가 화면 삼분의 일): the sheet at its own size was 4.2 tiles
    // wide (its swirl and wings) over a blow of three (the struck one and a tile round it) — drawn as wide as it strikes
    // (and by its longer side, all its frames: the swords fall from over the 3×3, not three tiles over it)
    addFx(def.fx, tx * TILE + TILE / 2, ty * TILE + TILE - 4, { anchor: 'bottom', must: true, scale: capK(def.fx, 1, 3 * 1.2) });
    later(0.08, () => {
      for (const o of around(tx, ty, 1)) hurtEnemy(o, o === e ? d : d * (def.splash || 0.5));
    });
  },
  // 호기어검: swords fly from over the hero to the nearest foes, piercing.
  sword(def, d) {
    const p = G.player;
    tkNear(p.tx, p.ty, def.range).slice(0, def.shots || 1).forEach((e, i) => {
      const dx = e.x - p.x, dy = e.y - 20 - (p.y - 60), fl = 0.14;
      later(i * 0.07, () => {
        addFx(bigFx(def.fx2, def.shotSize || 70, 'es'), p.x, p.y - 60, { mv: [dx, dy, fl], flip: dx < 0, scale: 1 });
        later(fl, () => {
          if (e.hp <= 0) return;
          if (def.fxHit) fxOn(fxTiles(def.fxHit, def.splash ? 3 : ONE_TILES, 'ew'), e, { area: !!def.splash });
          hurtEnemy(e, d);
          // (the sword goes through: those beside it take a share)
          if (def.splash) for (const o of around(e.tx, e.ty, 1)) if (o !== e) hurtEnemy(o, d * def.splash);
        });
      });
    });
  },
  // 묵혈독바르기: the blade cuts the nearest and leaves 묵혈독 on it (a curse, venom; it bursts as it dies).
  venom(def, d) {
    const p = G.player;
    tkNear(p.tx, p.ty, def.range).slice(0, def.shots || 1).forEach(e => {
      if (def.fxHit) fxOn(def.fxHit, e, { scale: 0.6 });
      if (def.fx2 && fxBudget('venom9h', 4)) fxOn(def.fx2, e, { scale: 0.5 });
      e.venom9 = { until: G.t + 7, burst: d * (def.burst || 0.8) * 3 };
      e.curse = Math.max(e.curse || 0, def.curse || 3);
      applyStatus(e, 'venom', 3, 1);
      hurtEnemy(e, d);
    });
  },
  // 전도체: a bolt from the hero to the nearest, leaping on to the next unstruck within `jump`.
  chain(def, d) {
    const p = G.player, first = tkNear(p.tx, p.ty, def.range)[0];
    if (!first) return;
    const seq = [first];
    while (seq.length < (def.shots || 3)) {
      const c = seq[seq.length - 1], nx = tkNear(c.tx, c.ty, def.jump || 3).find(o => !seq.includes(o));
      if (!nx) break;
      seq.push(nx);
    }
    seq.forEach((e, i) => later(i * 0.06, () => {
      if (e.hp <= 0) return;
      fxOn(def.fxHit || 'h_hit_light', e, { scale: 0.8 });
      hurtEnemy(e, d * Math.pow(0.85, i));
      if (i === 0) e.slow = Math.max(e.slow || 0, 0.6);
    }));
  },
  // 화살비폭격: a rain of arrows on a foe's spot and round it.
  rain(def, d) {
    const p = G.player, pool = tkNear(p.tx, p.ty, def.range).slice(0, 8);
    if (!pool.length) return;
    const e = pool[Math.floor(Math.random() * pool.length)], tx = e.tx, ty = e.ty;
    addFx(fxTiles(def.fx2, (def.radius || 1) * 2 + 1, 'er'), tx * TILE + TILE / 2, ty * TILE + TILE - 10);
    later(0.2, () => { for (const o of around(tx, ty, def.radius || 1)) hurtEnemy(o, d); });
  },
  // 기공십자광선'쾌: beams out of the hero's mirror in the four ways, every foe in the rows struck.
  cross(def, d, k) {
    const p = G.player, len = def.depth || 6, w = def.width === undefined ? 1 : def.width;
    // (each beam drawn as long as it reaches, every tick it strikes; its arms `w` tiles to each side)
    const pic = fxTiles(def.fx2, len * 2 + 1, 'cq');
    addFx(pic, 0, -20, { follow: true, alpha: 0.85, area: true });
    const tiles = [];
    for (const [dx, dy] of DIRS) for (let i = 1; i <= len; i++) for (let o = -w; o <= w; o++) tiles.push([p.tx + dx * i + (dy ? o : 0), p.ty + dy * i + (dx ? o : 0)]);
    let got = 0;
    for (const e of onTiles(tiles)) {
      if (def.fxHit && got++ < 3) fxOn(def.fxHit, e, { scale: 0.5 });
      hurtEnemy(e, d);
    }
  },
  // 차원개방: fragments of the 이계의낫 out of the opened dimension cut the foes round the hero.
  shard(def, d) {
    const p = G.player;
    tkNear(p.tx, p.ty, def.range).slice(0, def.shots || 2).forEach((e, i) => later(i * 0.07, () => {
      if (e.hp <= 0) return;
      if (def.fxHit) addFx(fxTiles(def.fxHit, 3, 'sh'), e.x, e.y - 20);
      hurtEnemy(e, d);
      for (const o of around(e.tx, e.ty, 1)) if (o !== e) hurtEnemy(o, d * (def.splash || 0.3));
    }));
  },
  // 불길한혼불: an ill-omened fire clings to a foe near and bursts a moment later round it.
  hex(def, d) {
    const p = G.player, run = G;
    tkNear(p.tx, p.ty, def.range).filter(e => !e.hex9).slice(0, def.shots || 1).forEach(e => {
      e.hex9 = true;
      const pic = tkLoop(def.fx2, e.x, e.y - 30, def.delay || 1.2, { scale: def.markScale || 0.45, alpha: 1 });
      later(def.delay || 1.2, () => {
        if (G !== run) return;
        e.hex9 = false;
        if (pic) pic.life = pic.t;
        const tx = e.tx, ty = e.ty;
        if (fxBudget('hex9', 4)) addFx(fxTiles(def.fxBurst || def.fx2, (def.radius || 1) * 2 + 1, 'hx'), tx * TILE + TILE / 2, ty * TILE + TILE - 12);
        for (const o of around(tx, ty, def.radius || 1)) { hurtEnemy(o, d); if (def.dot) applyStatus(o, def.dot, 3, 1); }
      });
    });
  },
  // 치유의반향: the healing's echo strikes the nearest and gives the hero a little life back.
  mend(def, d) {
    const p = G.player;
    let got = 0;
    tkNear(p.tx, p.ty, def.range).slice(0, def.shots || 1).forEach(e => {
      if (def.fxHit) fxOn(def.fxHit, e, { scale: 0.8 });
      hurtEnemy(e, d);
      got++;
    });
    if (got && def.heal) heal(p.maxHp * def.heal / 100, false, true);
  },
  // 천공의공명: the marked (저주·표식) foes in reach are struck from the sky, the rest after them.
  mark(def, d) {
    const p = G.player, near = tkNear(p.tx, p.ty, def.range);
    near.sort((a, b) => (b.curse > 0) - (a.curse > 0)).slice(0, def.shots || 2).forEach((e, i) => later(i * 0.06, () => {
      if (e.hp <= 0) return;
      if (def.fxHit) fxOn(def.fxHit, e, { scale: 0.6 });
      hurtEnemy(e, d * (e.curse > 0 ? 1.5 : 1));
    }));
  },
  // 권법의기원: fists of 기 strike the foes beside the hero.
  fist(def, d) {
    const p = G.player;
    tkNear(p.tx, p.ty, def.range).slice(0, def.shots || 1).forEach((e, i) => later(i * 0.08, () => {
      if (e.hp <= 0) return;
      fxOn(i % 2 ? def.fxHit : def.fx2, e, { scale: 0.7 });
      hurtEnemy(e, d);
    }));
  },
};
/** A shot's picture drawn pointing left (1320's sprites), turned the way it flies. */
function shotTurn(dx, dy) {
  return dx > 0 ? { flip: true } : dx < 0 ? {} : { rot: dy < 0 ? Math.PI / 2 : -Math.PI / 2 };
}
/** 초혼진무 (def.snare; 사용자 2026-11-23: 사슬은 하나, 그 안으로 몬스터를 모아 묶는다 — 영웅에게 뜨지 않게): 연's purple chain
 *  ring (the skill's own picture, k_w_chohonjin, as it was) laid once, 3 tiles across, on the foe within def.range with the most round it; those two
 *  tiles out drawn a step in, then all within the ring (its 3×3, at most nine) bound def.stun seconds (a boss 0.5) and
 *  struck, and struck again as the chains tighten. False when no foe is in reach (the cast waits). */
function snare(def, st, smite, fxid) {
  const p = G.player, foes = nearestEnemies(40, def.range || 4).filter(e => e.hp > 0);
  if (!foes.length) return false;
  let best = foes[0], most = -1;
  for (const e of foes) { const n = around(e.tx, e.ty, 1).length; if (n > most) { most = n; best = e; } }
  const cx = best.tx, cy = best.ty;
  // (3 tiles across by its cell: its frames' boxes (fxTiles) read a fraction of the ring it draws)
  const sf = M.fx[fxid];
  if (sf) fxAt(fxid, cx * TILE + TILE / 2, cy * TILE + TILE - 30, { scale: (3 * TILE) / (Math.max(sf.w, sf.h) * (sf.k || 1)) });
  for (const e of around(cx, cy, 2)) {
    const ex = e.tx - cx, ey = e.ty - cy;
    if (Math.max(Math.abs(ex), Math.abs(ey)) > 1) tkShove(e, cx + Math.sign(ex) * Math.min(1, Math.abs(ex)), cy + Math.sign(ey) * Math.min(1, Math.abs(ey)));
  }
  const bind = (k, hold) => {
    for (const e of around(cx, cy, 1)) {
      if (hold && def.stun) { e.stun = Math.max(e.stun || 0, e.kind === 'boss' ? Math.min(def.stun, 0.5) : def.stun); cutBlast(e); }
      smite(e, st.dmg * k);
    }
  };
  later(0.15, () => { if (!G.dead) bind(0.6, true); });
  later(0.7, () => { if (!G.dead) bind(0.6, false); });
  return true;
}
/** 흑룡광참 (def.swirl; 사용자 결정 2026-11-23): the whirl runs ahead as the plain vortex does, but the first time a foe
 *  stands on its way (the 3 tiles across it) it stops there and turns on the spot for swirl.dur seconds — drawn as the
 *  whole whirl looping (swirl.fx) over the 3×3 it strikes, the foes a tile further out drawn in onto it, each struck
 *  every swirl.every. If nothing stands on the way it runs its five tiles and ends. (이펙트=판정: the turning whirl is
 *  laid where the running one was seen to stop, and strikes round that tile.) */
function vortexSwirl(def, st, smite, dx, dy, runner) {
  const p = G.player, run = G, sx = p.tx, sy = p.ty, px = p.x, py = p.y - 24, steps = Math.round(def.dur / 0.15);
  const sw = def.swirl, next = new Map();
  let stopped = false;
  const strike = (cx, cy) => {
    for (const e of around(cx, cy, 2)) {
      if (Math.max(Math.abs(e.tx - cx), Math.abs(e.ty - cy)) > 1) { tkShove(e, e.tx - Math.sign(e.tx - cx), e.ty - Math.sign(e.ty - cy)); continue; }
      if ((next.get(e) || 0) > G.t) continue;
      next.set(e, G.t + sw.every);
      smite(e, st.dmg * def.k);
      tkAfflict(e, def, 0);
    }
  };
  for (let s = 1; s <= steps; s++) later(s * 0.15, () => {
    if (G !== run || G.dead || stopped) return;
    const k = Math.round((s / steps) * def.depth), cx = sx + dx * k, cy = sy + dy * k;
    const on = around(cx, cy, 1);
    for (const e of on) if (dx) tkShove(e, e.tx, cy); else tkShove(e, cx, e.ty);
    if (!on.length) return;
    // caught: where the running whirl is seen now (its eased path), to the tile
    stopped = true;
    let ox = dx * k * TILE, oy = dy * k * TILE;
    if (runner && runner.mv) {
      const q = Math.min(1, runner.t / runner.mv[2]), e = 1 - (1 - q) * (1 - q);
      ox = runner.mv[0] * e; oy = runner.mv[1] * e;
      runner.life = runner.t;
    }
    const tx = sx + Math.round(ox / TILE), ty = sy + Math.round(oy / TILE);
    tkLoopAt(fxTiles(sw.fx, 3, 'vx'), px + (tx - sx) * TILE, py + (ty - sy) * TILE, sw.dur, { alpha: settings.calmFx ? 0.75 : 1 });
    strike(tx, ty);
    const n = Math.round(sw.dur / 0.15);
    for (let j = 1; j < n; j++) later(j * 0.15, () => { if (G === run && !G.dead) strike(tx, ty); });
  });
}
/** 흑룡검풍 (원작 9차 패시브, 2662 IMG04·IMG05): 흑룡광참 brings, three times in ten, a 흑적색 wind worn round the hero
 *  for eight seconds (사용자 결정 2026-11-23: 옆에서 도는 것이 아니라 캐릭터의 오라처럼 — o_w_heukaura, 연's whirl of 흑룡광참
 *  made dark red, tools/s9_stamps.py heukaura), cutting what stands within `reach` tiles of the hero every tick.
 *  이펙트=판정: drawn 2.6 tiles across over the 3×3 it strikes; see-through enough that the hero's face shows.
 *  One at a time. (data.js w_blackdragon.wind9; test: window.__windAlways) */
function heukWind(w, skill) {
  if (!w || !M.fx[w.fx] || (G.windUntil || 0) > G.t) return;
  if (!window.__windAlways && Math.random() >= w.chance) return;
  const p = G.player, run = G, d = tkHit(w, skill);
  G.windUntil = G.t + w.duration;
  const f = tkLoopAt(fxTiles(w.fx, 2.6, 'au'), 0, -24, w.duration, { follow: true, alpha: settings.calmFx ? 0.55 : 0.78 });
  if (!f) return;
  const n = Math.round(w.duration / w.tick);
  for (let k = 1; k <= n; k++) later(k * w.tick, () => {
    if (G !== run || G.dead) return;
    for (const e of around(p.tx, p.ty, w.reach)) if (tkFoe(e)) hurtEnemy(e, d);
  });
  note(`${w.name}이 일어납니다.`);
}
/** 전도체 (원작 9차 패시브, 2662 IMG24·IMG25): in 과전류 the current runs from the hero into those 서리파편 strikes — the
 *  forked bolts (o_m_jeondo at the original's own size, from the hero, turned to it) to the nearest two within the bolts'
 *  length, striking them. */
function overcurrent(hit, dmg) {
  const c = SKILLS.m_jeondo && SKILLS.m_jeondo.proc9;
  if (!c || !(G.overcur > G.t) || !hit.length || G.t < (G.overcurAt || 0)) return;
  G.overcurAt = G.t + c.every - 0.05;
  // (the farthest two within the bolts' length: the bolts are drawn near their own length, not shrunk to a stub)
  const p = G.player, near = hit.filter(e => e.hp > 0 && Math.hypot(e.x - p.x, e.y - p.y) <= c.reach).sort((a, b) => Math.hypot(b.x - p.x, b.y - p.y) - Math.hypot(a.x - p.x, a.y - p.y)).slice(0, 2);
  for (const e of near) {
    const a = Math.atan2(e.y - p.y, e.x - p.x), len = Math.hypot(e.x - p.x, e.y - p.y), f = M.fx[c.fx];
    if (f) addFx(c.fx, 0, -20, { follow: true, rot: a, must: true, anchor: 'bottom', scale: Math.max(0.6, Math.min(1, len / (f.w * (f.k || 1) * 0.9))) });
    later(0.05, () => { if (e.hp > 0) { G.quietHit = true; hurtEnemy(e, dmg * c.k); G.quietHit = false; } });
  }
}
/** 묵혈독바르기 (원작 9차, 2662 IMG17): 묵혈독 takes hold on a foe struck by a skill cast while the blade is coated — the
 *  blue-violet flame bursting on it (o_r_mukdok, at the original's own size), its weakness for `infect` seconds. */
function coatInfect(e) {
  const c = G.coat9;
  if (e.venom9 && e.venom9.until > G.t + 1) return;
  e.venom9 = { until: G.t + c.infect, burst: c.burst, k: c.taken };
  if (M.fx[c.fx] && fxBudget('venom9h', 6)) addFx(c.fx, e.x, e.y - 10, { anchor: 'bottom' });
}
/** 묵혈독바르기: a foe falling with 묵혈독 on it bursts, striking those round it. */
function venomBurst(e) {
  const v = e.venom9;
  if (!v || v.until < G.t) return;
  e.venom9 = null;
  // (묵혈독's own flame, o_r_mukdok, at the original's own size; 이펙트=판정: what stands in the flame drawn — the ellipse in
  // its picture's box, measured from the sheet — is struck)
  const f = M.fx.o_r_mukdok;
  if (!f) {
    if (fxBudget('venom9', 3)) addFx('g_poison_purple', e.x, e.y - 10, { scale: 0.9, anchor: 'bottom' });
    later(0.05, () => { for (const o of around(e.tx, e.ty, 1)) if (o !== e) hurtEnemy(o, v.burst); });
    return;
  }
  if (fxBudget('venom9', 3)) addFx('o_r_mukdok', e.x, e.y - 10, { anchor: 'bottom' });
  const k = f.k || 1, hx = f.w * k / 2, hy = f.h * k / 2, cx = e.x + (f.w / 2 - f.ax) * k, cy = e.y - 10 + (f.h / 2 - f.ay) * k;
  later(0.05, () => { for (const o of G.enemies) if (o !== e && tkFoe(o) && ((o.x - cx) / hx) ** 2 + ((o.y - 20 - cy) / hy) ** 2 <= 1) hurtEnemy(o, v.burst); });
}

/** A companion's view of a 차수별 기술: the plain kind it casts it as (def.ck), or the skill as it is. */
const TIER_ALIAS = {};
function tierDef(id) {
  const d = SKILLS[id];
  if (!d || !TIER_KINDS[d.kind]) return d;
  return TIER_ALIAS[id] || (TIER_ALIAS[id] = { ...d, kind: d.ck || 'none', dmg: d.dmg || d.hit || 0 });
}

/**
 * 기본 공격: every class always has one blow to throw, whatever its spells are doing. It has its
 * own short wait (`cd`) and its own reach; it goes out whenever the hero is not in the middle of a
 * cast and a foe is within reach (the spells' waits do not matter, and it no longer holds back for
 * 1.5 s after a spell). A close-in class strikes the nearest foe up to `reach` tiles off, leaning
 * into it (the lunge) with its own 연 slash arc on the struck tile; a far class (archer, the four
 * casters) sends its first damage spell's own picture (and a small orb for the casters) at the nearest
 * foe in reach. Never a 기원's: the orbs were 신령의기원's ring (131) for the 주술사 and 도사 and 누리의
 * 기원's moon (3) for the 마도사, a 기원 thrown at every foe. Its power is a share (PLAIN_K) of the class's first spell at the level of the hero's
 * highest spell, so it never outgrows the spells; it is struck through hurtEnemy like any blow
 * (weapon, stats, crits) and looses 격 at half the spells' chance (G.plainHit).
 */
const PLAIN_K = 0.25;
const PLAIN_GYEOK_K = 0.5;
const PLAIN = {
  warrior: { reach: 2, cd: 0.8 },
  rogue: { reach: 2, cd: 0.7 },
  lancer: { reach: 3, cd: 0.9 },
  monk: { reach: 2, cd: 0.65 },
  dokkaebi: { reach: 2, cd: 0.85 },
  reaper: { reach: 2.5, cd: 0.8 },
  archer: { reach: 6, cd: 0.8 },
  mage: { reach: 5, cd: 0.95, orb: ['k_x_md_orbfire_shot', '96'] },
  poet: { reach: 5, cd: 0.95, orb: ['k_x_md_orbice_shot', '31'] },
  magus: { reach: 5, cd: 0.95, orb: ['k_x_md_orblight_shot', '31'] },
  celestial: { reach: 5, cd: 0.95, orb: ['148'] },
};
/** The class's first damage spell (its start, unless that is no blow): the 기본 공격's picture and sound. */
function plainSpell(cls) {
  const c = CLASSES.find(x => x.id === cls) || G.cls, d0 = SKILLS[c.start];
  if (d0 && d0.dmg && !isMend(d0)) return { id: c.start, ...d0 };
  const e = Object.entries(SKILLS).filter(([, d]) => d.cls === cls && d.dmg > 0 && !isMend(d) && d.kind !== 'ult' && !d.evolved)
    .sort((a, b) => (a[1].promo || 0) - (b[1].promo || 0) || (a[1].req || 1) - (b[1].req || 1))[0];
  return e ? { id: e[0], ...e[1] } : null;
}
/** A caster's orb: the first of its pictures the build has, never a 기원's. */
function plainOrb(pr) {
  return (pr.orb || []).find(id => M.fx[id] && !MEND_FX.has(id)) || null;
}

/** The plain blow's power: PLAIN_K (a quarter) of the first spell at the level of the hero's highest spell. */
function plainDmg() {
  const d0 = plainSpell(G.cls.id);
  let lv = 1;
  for (const s of G.skills) {
    const d = SKILLS[s.id];
    if (d && d.dmg && d.kind !== 'ult' && !d.heal) lv = Math.max(lv, s.lv);
  }
  return PLAIN_K * ((d0 && d0.dmg) || 12) * Math.pow(1.15, Math.min(lv, 8) - 1) * (1 + 0.1 * G.passives.power);
}

/** The nearest foe (alive, not a war's own side) within `reach` tiles of the hero, or null — the boss first when it is
 *  within reach (보스 우선: bossIn). */
function plainTarget(reach) {
  const p = G.player;
  let best = bossIn(reach), bd = best ? -1 : 1e9;
  for (const e of G.enemies) {
    if (e.hp <= 0 || e.ally || (e.war && e.team === SIDE)) continue;
    const d = tdist(e, p);
    if (d < bd && d <= reach) { bd = d; best = e; }
  }
  if (best && G.war && !G.war.raid && !War.clear(p.tx, p.ty, best.tx, best.ty)) return null; // 대항전: not through a wall
  return best;
}

function plainAttack(dt) {
  // 수련장: the plain blow only when its key is on (to try the weapon's 격), and then always.
  if (G.training && !G.training.plain) return;
  const p = G.player;
  p.atkT = (p.atkT || 0) - dt;
  const dashCancel = G.hunt && Hunt.cancel(); // 사냥 기믹: 질주 → the plain blow at once
  if (!dashCancel && p.atkT > 0) return;
  // Not in the middle of a cast (the pose of a spell just thrown) nor a 기술 연계 running.
  if (G.t < (p.castUntil || 0) || G.chainRun) return;
  if (G.buffs.stealth > G.t) return; // 투명: no plain blow gives the hero away
  const cls = G.cls.id, pr = PLAIN[cls] || PLAIN.warrior;
  const t = plainTarget(pr.reach);
  if (!t) { p.atkT = 0.1; return; } // no foe in reach: look again shortly
  const start = plainSpell(cls);
  const dmg = plainDmg();
  p.atkT = pr.cd;
  const dx = t.tx - p.tx, dy = t.ty - p.ty;
  const dist = Math.hypot(t.x - p.x, t.y - p.y) || 1;
  // Walking a tile at a time, the facing is the player's: a blow does not turn the hero.
  if ((dx || dy) && !settings.tiles) {
    p.fdx = Math.sign(dx);
    p.fdy = dx ? 0 : Math.sign(dy);
    if (p.fdx) p.face = p.fdx;
  }
  const far = !MELEE_LOOK[cls]; // the archer and the casters strike from where they stand
  strikePose(MELEE_LOOK[cls] || WEAPON_POSE.has(cls) ? 'attack' : 'magic');
  if (start) audio.play('skill_' + start.id, start.kind);
  const hit = (b, push) => {
    G.plainHit = true;
    G.spark = far && start ? sparkOf(start.id, start) : null;
    hurtEnemy(b, dmg, push);
    G.spark = null;
    G.plainHit = false;
  };
  if (!far) {
    // The lunge: leaning into the foe, further the further it is (the hero itself stays put).
    p.lungeAt = G.t;
    p.ldx = (t.x - p.x) / dist;
    p.ldy = (t.y - p.y) / dist;
    p.lungeK = Math.min(2.4, 0.6 + Math.hypot(dx, dy) * 0.6);
    const sx = Math.sign(dx), sy = Math.sign(dy);
    later(0.07, () => {
      if (G.dead) return;
      // Everyone pressed onto that tile takes the blow.
      for (const b of bodiesAt(t.tx, t.ty) || [t]) if (b.m && !b.ally && b.hp > 0) hit(b, dx || dy ? [sx, sy] : null);
      meleeSlash(t.tx, t.ty, sx, sy, 0);
    });
    return;
  }
  // A far blow: the first damage spell's own picture on the foe, a small orb flying to it for a caster.
  const fxid = start && !MEND_FX.has(start.fx) ? start.fx : null;
  const land = () => {
    if (t.hp <= 0 || G.dead) return;
    if (fxid && M.fx[fxid]) fxOn(fxid, t, { scale: 0.55 });
    hit(t, null);
  };
  const orb = plainOrb(pr);
  if (orb) addShot(p, t, { fx: orb, speed: 640, size: 4, onHit: land });
  else later(0.1, land);
}

/**
 * Not standing blankly: a hero left alone (no key, no touch for a second) with a foe within eight
 * tiles turns to face the nearest one. It never walks by itself (the hero is the player's to
 * move); only the facing, which the next 기본 공격 or a spell that goes ahead of the hero (돌진,
 * 비영승보, 쇄혼비무) then follows.
 */
function idleLook(dt) {
  const p = G.player;
  p.lookT = (p.lookT || 0) - dt;
  if (p.lookT > 0 || p.moving || p.stepping || G.t - (G.steerAt || -9) < 1) return;
  p.lookT = 0.4;
  const t = plainTarget(8);
  if (!t || (t.tx === p.tx && t.ty === p.ty)) return;
  const dx = t.tx - p.tx, dy = t.ty - p.ty;
  if (Math.abs(dx) >= Math.abs(dy)) { p.fdx = Math.sign(dx); p.fdy = 0; p.face = p.fdx; } else { p.fdx = 0; p.fdy = Math.sign(dy); }
}

/** The class's finishing spell: costs all mana (and some health for the fighters). */
/** The 필살기 grows with 승급 (data.js ULT_TIERS): a technique of its own for each band of 승급
 * (0~2차, 3~5차, 6~8차, 9차), by the class's own name, icon and 연 effects, each with a way of
 * striking of its own (ULT_MECH below) — not one spell drawn larger. */
function ultTier(cls, promo = G && G.ultPromo !== undefined ? G.ultPromo : promoOf(cls)) {
  const list = ULT_TIERS[cls] || [];
  let t = list[0];
  for (let i = 0; i < list.length; i++) if (promo >= ULT_BANDS[i]) t = list[i];
  return t;
}
function ultLook(cls) {
  const base = SKILLS[CLASSES.find(c => c.id === cls).ult], t = ultTier(cls);
  if (!t) return { ...base, id: CLASSES.find(c => c.id === cls).ult };
  const own = SKILLS[t.id] || base;
  const fx = [t.main, t.cast, 'k_' + t.id, base.fx].find(f => f && M.fx[f]) || base.fx;
  return { ...base, ...t, hpCost: t.hpCost ?? base.hpCost, darken: t.darken ?? base.darken, name: own.name, fx };
}
function ultIcon(cls) {
  const l = ultLook(cls);
  const iid = l.icon || l.id;
  if (M.skillicon && M.skillicon.includes(iid)) return `assets/skillicon/${iid}.png`;
  // (no 연 icon: the old client's own icon of that spell, iconFx — 태양의희원, 귀염추혼소)
  return `assets/icon/${l.iconFx && M.fx[l.iconFx] ? l.iconFx : l.fx}.png`;
}

// ---- 필살기 ways of striking (ULT_TIERS[cls][band].mech). Each gives every foe on the screen its
// share of the blow (`base` × the tier's k), in an order and with pictures of its own:
//   cast  — over the hero as it begins (the call), main — the great picture(s) of the technique,
//   hit   — on each one struck, after — what stays a moment where it landed. All 연's own strips.
function ultPic(id, x, y, o = {}) {
  if (!id || !M.fx[id]) return 0;
  const want = o.want ? bigFx(id, o.want, 'u' + Math.round(o.want), M.fx[id].cls === 'yeon' ? 5 : 2.4) : id;
  return addFx(want, x, y, o);
}
function ultHitPic(t, e, delay) {
  // (eighteen at most a cast: a full screen of eighty struck each wearing it slowed a phone)
  if (!t.hit || !M.fx[t.hit] || (G.ultHits = (G.ultHits || 0) + 1) > 18) return;
  fxOn(t.hit, e, { delay, scale: t.hitScale || 1.1 });
}
function ultAfter(t, x, y, delay = 0) {
  if (!t.after || !M.fx[t.after]) return;
  later(delay, () => tkLoop(t.after, x, y, t.afterT || 0.9, { scale: t.afterScale || 1.2, alpha: settings.calmFx ? 0.55 : 0.8 }));
}
const tileX = e => e.tx * TILE + TILE / 2, tileY = e => e.ty * TILE + TILE - 6;
const ULT_MECH = {
  // 건곤대나이·차사강림: three great cleaves going out ahead, to the sides, then behind.
  cleaveWave(t, seen, strike) {
    const p = G.player, dx = p.fdx || (p.fdy ? 0 : p.face || 1), dy = p.fdy || 0;
    const fwd = e => (e.tx - p.tx) * dx + (e.ty - p.ty) * dy;
    const waves = [seen.filter(e => fwd(e) > 0), seen.filter(e => fwd(e) === 0), seen.filter(e => fwd(e) < 0)];
    waves.forEach((w, i) => {
      const sx = i === 0 ? dx : i === 2 ? -dx : dy, sy = i === 0 ? dy : i === 2 ? -dy : dx;
      later(0.12 + i * 0.28, () => {
        ultPic(t.main, p.x + sx * TILE * 2.2, p.y - 22 + sy * TILE * 2.2, { want: t.mainSize || 220, rot: Math.atan2(sy, sx) + Math.PI / 2 });
        G.shake = Math.max(G.shake, 0.3);
      });
      w.forEach((e, j) => { ultHitPic(t, e, 0.2 + i * 0.28 + j * 0.02); later(0.22 + i * 0.28, () => strike(e, 1)); });
    });
    ultAfter(t, p.x, p.y - 10, 0.9);
  },
  // 혈겁만파·여래신장: the blow falls on each foe from above, a rain over the whole screen.
  rain(t, seen, strike) {
    const order = seen.slice().sort(() => Math.random() - 0.5), span = t.span || 1.4;
    order.forEach((e, i) => {
      const at = 0.2 + (i / Math.max(1, order.length)) * span;
      if (i < 16) later(at, () => ultPic(t.drop || t.hit, tileX(e), tileY(e) - 8, { want: t.dropSize || 120, anchor: 'bottom' }));
      later(at + 0.18, () => { strike(e, 1); G.shake = Math.max(G.shake, 0.12); });
    });
    if (t.main) later(0.05, () => screenFx(t.main, t.id, t.frac || 0.85));
  },
  // 헬파이어·화룡사멸·광폭멸천강: a few great blasts on the thickest heaps; each strikes all round it.
  meteor(t, seen, strike) {
    const left = new Set(seen), spots = [];
    while (left.size && spots.length < (t.n || 5)) {
      let best = null, most = -1;
      for (const e of left) { const n = [...left].filter(o => Math.abs(o.tx - e.tx) <= 2 && Math.abs(o.ty - e.ty) <= 2).length; if (n > most) { most = n; best = e; } }
      const grp = [...left].filter(o => Math.abs(o.tx - best.tx) <= 2 && Math.abs(o.ty - best.ty) <= 2);
      grp.forEach(o => left.delete(o));
      spots.push([best, grp]);
    }
    const rest = [...left];
    spots.forEach(([c, grp], i) => {
      const at = 0.15 + i * (t.gap || 0.3), x = tileX(c), y = tileY(c);
      later(at, () => ultPic(t.main, x, y, { want: t.mainSize || 200, anchor: 'bottom' }));
      later(at + (t.land || 0.35), () => {
        G.shake = Math.max(G.shake, 0.35);
        shock(x, y, 2.5);
        grp.forEach((e, j) => { ultHitPic(t, e, j * 0.02); strike(e, 1); });
      });
      ultAfter(t, x, y - 6, at + (t.land || 0.35));
    });
    // The rest of the screen: the blasts' wave reaches them a little after.
    const end = 0.5 + spots.length * (t.gap || 0.3);
    rest.forEach((e, j) => { ultHitPic(t, e, end + j * 0.02); later(end, () => strike(e, 1)); });
  },
  // 필살검무·돌격명령·필살권무·범아귀: the hero goes from foe to foe, a blow on each; the rest by its wake.
  dash(t, seen, strike) {
    const p = G.player, n = Math.min(seen.length, t.n || 8), path = [];
    let cur = p;
    const left = seen.slice();
    for (let i = 0; i < n; i++) {
      left.sort((a, b) => tdist(a, cur) - tdist(b, cur));
      const e = left.shift();
      path.push(e);
      cur = e;
    }
    if (t.cast) ultPic(t.cast, 0, -26, { follow: true, want: t.castSize || 160 });
    path.forEach((e, i) => later(0.12 + i * (t.gap || 0.11), () => {
      if (G.dead) return;
      const spot = e.hp > 0 && !G.war && !G.stage.raid ? leapSpot(e) : null;
      if (spot) leapTo(spot[0], spot[1]);
      p.inv = Math.max(p.inv, 0.4);
      ultPic(t.main, tileX(e), tileY(e) - 20, { want: t.mainSize || 130, rot: rand(-0.6, 0.6) });
      ultHitPic(t, e, 0.04);
      strike(e, 1);
      if (MELEE_LOOK[G.cls.id]) meleeImpact(2);
    }));
    const end = 0.2 + path.length * (t.gap || 0.11);
    later(end, () => { if (t.after && M.fx[t.after]) ultPic(t.after, 0, -26, { follow: true, want: t.afterSize || 240 }); G.shake = Math.max(G.shake, 0.3); });
    left.forEach((e, j) => { ultHitPic(t, e, end + 0.05 + j * 0.02); later(end + 0.08, () => strike(e, 1)); });
  },
  // 만검귀종·폭풍화우·도깨비폭풍·저승문: the foes are drawn in round the hero, then it bursts.
  vortex(t, seen, strike) {
    const p = G.player;
    tkLoop(t.main, p.x, p.y - 24, t.hold || 1.1, { scale: t.mainScale || 1, alpha: settings.calmFx ? 0.6 : 0.9 });
    if (t.cast) ultPic(t.cast, 0, -26, { follow: true, want: t.castSize || 200 });
    const ring = [];
    for (let r = 1; r <= 3; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) === r) ring.push([p.tx + dx, p.ty + dy]);
    seen.slice().sort((a, b) => tdist(a, p) - tdist(b, p)).slice(0, 24).forEach((e, i) => later(0.1 + i * 0.02, () => {
      const spot = ring.filter(([x, y]) => free(x, y) && Math.hypot(x - p.tx, y - p.ty) < tdist(e, p)).sort((a, b) => Math.hypot(a[0] - e.tx, a[1] - e.ty) - Math.hypot(b[0] - e.tx, b[1] - e.ty))[0];
      if (spot) tkShove(e, spot[0], spot[1]);
    }));
    const at = t.hold || 1.1;
    later(at, () => {
      if (t.burst) ultPic(t.burst, 0, -26, { follow: true, want: t.burstSize || 300 });
      // (a ring of the burst's own picture round the hero as well: 만검귀종's swords, each its size)
      if (t.ring && M.fx[t.ring]) for (let k = 0; k < 8; k++) {
        const ang = (k / 8) * Math.PI * 2, R = 2.4 * TILE;
        later(k * 0.03, () => ultPic(t.ring, p.x + Math.cos(ang) * R, p.y - 20 + Math.sin(ang) * R * 0.7, { want: 150 + k * 5, rot: ang + Math.PI / 2 }));
      }
      G.shake = Math.max(G.shake, 0.45);
      shock(p.x, p.y - 4, 4);
      seen.forEach((e, j) => { ultHitPic(t, e, j * 0.015); strike(e, 1); });
    });
    ultAfter(t, p.x, p.y - 10, at);
  },
  // 분혼경천·귀염추혼소·살극·투혈오식·전의상실: every foe is marked; then the marks burst, nearest first.
  mark(t, seen, strike) {
    const p = G.player, delay = t.delay || 1.0;
    if (t.cast) later(0.02, () => screenFx(t.cast, t.id, t.frac || 0.8));
    seen.slice(0, 18).forEach((e, i) => later(0.15 + i * 0.03, () => { if (e.hp > 0) fxOn(t.main, e, { scale: t.markScale || 0.8 }); }));
    seen.forEach(e => { e.curse = Math.max(e.curse || 0, delay + 0.5); if (t.stun) { e.stun = Math.max(e.stun || 0, e.kind === 'boss' ? 0.4 : t.stun); } });
    seen.slice().sort((a, b) => tdist(a, p) - tdist(b, p)).forEach((e, i) => {
      const at = delay + Math.min(0.6, i * 0.025);
      ultHitPic(t, e, at);
      later(at + 0.05, () => { strike(e, 1); G.shake = Math.max(G.shake, 0.15); });
    });
  },
  // 대지진·천지파열·광폭파장·나선광륜·도깨비의 격노: rings run out from the hero, three times.
  rings(t, seen, strike) {
    const p = G.player, n = t.n || 3, share = 1 / n;
    for (let k = 0; k < n; k++) {
      const at = 0.15 + k * (t.gap || 0.4);
      later(at, () => {
        ultPic(t.main, 0, -20, { follow: true, want: (t.mainSize || 240) * (1 + 0.25 * k) });
        shock(p.x, p.y - 4, 3 + k * 2);
        G.shake = Math.max(G.shake, 0.25);
      });
      seen.forEach(e => {
        const d = tdist(e, p), hitAt = at + Math.min(0.35, d * 0.03);
        if (k === n - 1) ultHitPic(t, e, hitAt);
        later(hitAt, () => strike(e, share));
      });
    }
    ultAfter(t, p.x, p.y - 10, 0.15 + n * (t.gap || 0.4));
  },
  // 헬파이어'첨·백월난격: pillars along the four ways (and the slants) out from the hero; then the rest.
  cross(t, seen, strike) {
    const p = G.player, ways = t.diag ? [...DIRS, [1, 1], [1, -1], [-1, 1], [-1, -1]] : DIRS;
    const onLine = e => ways.some(([dx, dy]) => { const a = (e.tx - p.tx) * dx + (e.ty - p.ty) * dy, s = Math.abs((e.tx - p.tx) * dy - (e.ty - p.ty) * dx); return a > 0 && s <= 1; });
    ways.forEach(([dx, dy], w) => {
      for (let k = 1; k <= (t.len || 5); k++) {
        // (a size a ring: each ring its own picture, so the four-of-one-picture limit of addFx holds per ring)
        later(0.1 + k * 0.07 + w * 0.02, () => ultPic(t.main, p.x + dx * k * TILE * 1.4, p.y - 6 + dy * k * TILE * 1.4, { want: (t.mainSize || 110) + k * 6, anchor: 'bottom' }));
      }
    });
    if (t.cast) ultPic(t.cast, 0, -26, { follow: true, want: t.castSize || 200 });
    const first = seen.filter(onLine), rest = seen.filter(e => !onLine(e));
    first.forEach(e => { const at = 0.15 + tdist(e, p) * 0.05; ultHitPic(t, e, at); later(at, () => strike(e, 1.15)); });
    rest.forEach((e, j) => { const at = 0.75 + j * 0.015; ultHitPic(t, e, at); later(at, () => strike(e, 0.85)); });
    ultAfter(t, p.x, p.y - 10, 0.7);
  },
  // 파천검무·염화마탄시·월하멸섬·혈마광폭열파: a wall of blows sweeps across the screen the way it faces.
  sweep(t, seen, strike) {
    const p = G.player, v = viewTiles();
    const dx = p.fdx || (p.fdy ? 0 : p.face || 1), dy = dx ? 0 : p.fdy;
    const along = e => (e.tx - p.tx) * dx + (e.ty - p.ty) * dy;
    const span = (dx ? v.w : v.h) * 2, steps = t.steps || 6, from = -(dx ? v.w : v.h);
    for (let s = 0; s < steps; s++) {
      const a = from + (span * (s + 0.5)) / steps;
      later(0.1 + s * (t.gap || 0.13), () => {
        for (let k = -1; k <= 1; k++) {
          const side = k * (dx ? v.h : v.w) * 0.55;
          ultPic(t.main, p.x + (dx * a + dy * side) * TILE, p.y - 6 + (dy * a + dx * side) * TILE, { want: (t.mainSize || 150) + (k + 1) * 6, anchor: 'bottom', flip: dx < 0 });
        }
        G.shake = Math.max(G.shake, 0.14);
      });
    }
    seen.forEach(e => {
      const s = Math.max(0, Math.min(steps - 1, Math.floor(((along(e) - from) / span) * steps)));
      const at = 0.16 + s * (t.gap || 0.13);
      ultHitPic(t, e, at);
      later(at, () => strike(e, 1));
    });
  },
  // 일환탄시·광폭구회격·백월난격: volleys flying out from the hero to every foe, three in turn.
  barrage(t, seen, strike) {
    const p = G.player, n = t.n || 3, share = 1 / n;
    if (t.cast) ultPic(t.cast, 0, -26, { follow: true, want: t.castSize || 180 });
    for (let k = 0; k < n; k++) {
      seen.forEach((e, i) => {
        const at = 0.15 + k * (t.gap || 0.3) + (i % 12) * 0.015;
        later(at, () => {
          if (e.hp <= 0) return;
          const dx = e.x - p.x, dy = e.y - 20 - (p.y - 26), fl = Math.min(0.3, 0.08 + Math.hypot(dx, dy) / 1400);
          if (i < 12 && t.shot && M.fx[t.shot]) addFx(t.shot, p.x, p.y - 26, { mv: [dx, dy, fl], rot: Math.atan2(dy, dx) + Math.PI / 2, scale: t.shotScale || 1.2 });
          later(fl, () => { if (k === n - 1 || i < 6) ultHitPic(t, e, 0); strike(e, share); });
        });
      });
    }
    ultAfter(t, p.x, p.y - 10, 0.2 + n * (t.gap || 0.3));
  },
  // 뇌격룡: a bolt leaping from foe to foe through the whole screen.
  chain(t, seen, strike) {
    const p = G.player, left = seen.slice(), path = [];
    let cur = p;
    while (left.length) { left.sort((a, b) => tdist(a, cur) - tdist(b, cur)); cur = left.shift(); path.push(cur); }
    if (t.cast) later(0.02, () => screenFx(t.cast, t.castStages === false ? '-' : t.id, t.frac || 0.8));
    let prev = { x: p.x, y: p.y - 26 };
    // (이펙트=판정: through the whole screen within a second and a half — at 0.05 s a foe, a full screen's eighty took
    // four seconds, struck long after the dark and the pictures were gone)
    const gap = Math.min(t.gap || 0.05, 1.5 / Math.max(1, path.length));
    path.forEach((e, i) => {
      const at = 0.35 + i * gap, from = prev;
      prev = { x: e.x, y: e.y - 20 };
      later(at, () => {
        if (i < 20 && t.shot && M.fx[t.shot]) addFx(t.shot, from.x, from.y, { mv: [e.x - from.x, e.y - 20 - from.y, 0.06], rot: Math.atan2(e.y - 20 - from.y, e.x - from.x) + Math.PI / 2 });
        if (i < 20) fxOn(t.main, e, { scale: t.markScale || 0.9 });
        strike(e, 1);
        if (t.stun) e.stun = Math.max(e.stun || 0, e.kind === 'boss' ? 0.3 : t.stun);
      });
    });
  },
  // 태극팔괘진·권신강림·강림술'신록: a great presence stands on the thickest heap, striking round it.
  totem(t, seen, strike) {
    const c = seen.slice().sort((a, b) => around(b.tx, b.ty, 2).length - around(a.tx, a.ty, 2).length)[0];
    const x = tileX(c), y = tileY(c), life = t.life || 2.4, n = t.n || 4;
    tkLoop(t.main, x, y - (t.lift || 30), life, { scale: t.mainScale || 1.4, alpha: settings.calmFx ? 0.65 : 0.95 });
    if (t.cast) ultPic(t.cast, 0, -26, { follow: true, want: t.castSize || 160 });
    for (let k = 0; k < n; k++) {
      const at = 0.3 + (k * (life - 0.4)) / n;
      later(at, () => {
        shock(x, y, 3 + k);
        G.shake = Math.max(G.shake, 0.22);
        if (t.drop) ultPic(t.drop, x + rand(-40, 40), y, { want: t.dropSize || 140, anchor: 'bottom' });
        seen.forEach((e, j) => { if (k === n - 1 && j < 14) ultHitPic(t, e, 0); strike(e, 1 / n); });
      });
    }
  },
  // 일격필살'괴력난신: the strongest few first, each crushed (a foe below 40% of its life twice as hard).
  execute(t, seen, strike) {
    const top = seen.slice().sort((a, b) => b.maxHp - a.maxHp).slice(0, t.n || 3);
    top.forEach((e, i) => later(0.15 + i * 0.3, () => {
      ultPic(t.main, tileX(e), tileY(e), { want: t.mainSize || 200, anchor: 'bottom' });
      later(0.25, () => { G.shake = Math.max(G.shake, 0.4); shock(tileX(e), tileY(e), 2.5); strike(e, e.hp < e.maxHp * 0.4 ? 2.4 : 1.6); });
    }));
    const end = 0.3 + top.length * 0.3;
    seen.filter(e => !top.includes(e)).forEach((e, j) => { ultHitPic(t, e, end + j * 0.02); later(end + 0.1, () => strike(e, e.hp < e.maxHp * 0.4 ? 1.6 : 1)); });
    ultAfter(t, G.player.x, G.player.y - 10, end);
  },
  // 태양의희원: the hero made whole and untouchable, light falling on every foe.
  sanctuary(t, seen, strike) {
    const p = G.player;
    heal(p.maxHp, true);
    G.buffs.guard = Math.max(G.buffs.guard, G.t + (t.guard || 3));
    ultPic(t.cast || t.main, 0, -26, { follow: true, want: t.castSize || 200 });
    seen.forEach((e, i) => { const at = 0.3 + (i % 14) * 0.05; if (i < 14) later(at, () => fxOn(t.main, e, { scale: 1 })); ultHitPic(t, e, at + 0.2); later(at + 0.25, () => strike(e, 1)); });
  },
};

// ---- 필살기 단계 위엄 (2차 피드백): each band of 승급 must look grander than the one before — a higher
// 필살기 seen smaller than a lower one (돌격명령·만검귀종 a knot round the hero after 혈겁만파's screen of
// swords) read as a step down. Over the band's own way of striking (ULT_MECH, unchanged, as is the blow)
// it lays, from the tier's own 연 pictures only (data.js ULT_TIERS open / echo / echo2 / fin / aura):
//   open  — the call, the technique's picture large over the hero as it begins (3차~; not for the ways
//           that already hang one over the screen),
//   aura  — its picture held round the hero while it lasts (longer a band),
//   echo  — the picture again over the field, one ring (3차), two or three (6차·9차), every other one
//           the band's 보스용 technique or its hit (echo2), and a late ring as it fades (the moment lasts),
//   fin   — 9차: a last burst after the striking, flash, shake and rings of force, echoes at the edge.
// Each band darkens the field longer and shakes it harder. Measured (scratchpad ult3 probe.js): the
// screen covered, its sum over time, the pictures at once and how long it lasts all grow band to band.
// Cost: a picture blown up past its pixels is drawn smooth, and two of a screen's size cost a slowed phone
// a frame in four — so the coverage is many pictures near their own size (echoCap), the call and the burst
// at most twice theirs (openCap / finCap), and a device already late on frames gets fewer (ultGrand q).
// In a war or a raid only the call (the party's spells are many there); 번쩍임 줄이기 halves the echoes.
const ULT_GRAND = [
  { dark: 0.7, shake: 0.5 },
  { openW: 0.32, aura: 1.1, auraW: 130, echoN: 3, echoW: 125, echoR: [[0.27, 0.3]], echoT: [0.1, 0.5], lateN: 3, lateAt: 0.6, dark: 0.9, shake: 0.55 },
  { openW: 0.45, aura: 1.15, auraW: 160, echoN: 12, echoW: 150, echoR: [[0.2, 0.22], [0.34, 0.34], [0.46, 0.44]], echoT: [0.1, 0.55], lateN: 5, lateAt: 0.6, dark: 1.1, shake: 0.65 },
  { openW: 0.5, aura: 1.2, auraW: 180, echoN: 20, echoW: 160, echoR: [[0.18, 0.2], [0.32, 0.32], [0.46, 0.44]], echoT: [0.1, 0.55], finAt: 0.6, finW: 0.55, edgeN: 8, lateN: 8, lateAt: 0.7, dark: 1.2, shake: 0.8, cutT: 1.1 },
];
// (ways that already hang their main or cast picture over the screen: no second call of it)
const ULT_SCREEN_OWN = { rain: 'main', mark: 'cast', chain: 'cast' };
function ultBand(cls) {
  const list = ULT_TIERS[cls] || [], t = ultTier(cls);
  return Math.max(0, list.indexOf(t));
}
/** A grand layer's picture `want` game pixels across, pushed past the few-at-once limits of addFx (a
 * handful a cast, counted: the 필살기 is the moment they are for) but never past the phone's cap. */
function ultLayer(id, want, tag, x, y, o = {}) {
  if (!id || !M.fx[id] || G.fxs.length > 240) return 0;
  // (one to come is laid when its time comes, and left out, more often the later the frames are by then)
  if (o.delay > 0) { later(o.delay, () => ultLayer(id, want, tag, x, y, { ...o, delay: 0, thin: true })); return 1; }
  if (o.thin && (frame.late || 0) > 0.1 && Math.random() < Math.min(0.85, frame.late * 3)) return 0;
  const f = M.fx[id], now = Math.max(f.w, f.h) * (f.k || 1);
  // (larger than wanted, a screen picture as an echo: drawn smaller under a name of its own — under
  // its own name it counted against the technique's own picture in addFx's few-of-one limit)
  let b = id;
  if (now > want) {
    b = `${id}#${tag}`;
    if (!M.fx[b]) M.fx[b] = { ...f, src: f.src || id, k: (f.k || 1) * want / now };
  } else b = bigFx(id, want, tag, o.cap || (f.cls === 'yeon' ? 4 : 2.4));
  const life = durs(b).reduce((a, d) => a + d, 0);
  G.fxs.push({ id: b, x, y, t: 0, life, scale: 1, rot: o.rot || 0, follow: o.follow, anchor: o.anchor || 'mid',
    flip: o.flip, alpha: o.alpha, skip: 0, fadeIn: 0 });
  return life;
}
function ultGrand(t, bi) {
  const g = ULT_GRAND[bi];
  if (!g) return;
  const p = G.player, calm = settings.calmFx, light = G.war || G.stage.raid;
  // A device already late on frames (a slowed phone in a thick hunt) gets fewer of the layers: the echoes
  // thinned to a half or a third, the last rings left out — each band still above the one before.
  const late = frame.late || 0, q = late > 0.2 ? 0.34 : late > 0.06 ? 0.5 : 1;
  G.darkUntil = Math.max(G.darkUntil || 0, G.t + (t.dark || g.dark));
  G.shake = Math.max(G.shake, g.shake);
  if (!bi) return;
  // 9차: the original 궁극's own full-screen art (2662 captures: data.js ULT_TIERS cutin, fx o_<cls>_ult9) framing the
  // darkened field, its middle left clear; not in a war, where thirty fighters are drawn too.
  let cine = false;
  if (g.cutT && t.cutin && M.fx[t.cutin] && !G.war) {
    const c = M.fx[t.cutin], want = Math.max(VW, VH * c.w / c.h) * 1.04;
    // (after the dark's first beat — the hero's glow — the cinematic plays, holds and fades)
    later(0.25, () => {
      if (G.dead || !G.player || !ultLayer(t.cutin, want, 'gc', 0, -10, { follow: true, cap: 3.5, alpha: calm ? 0.55 : 0.92 })) return;
      const f = G.fxs[G.fxs.length - 1];
      f.loop = true;
      f.life = g.cutT;
    });
    cine = true;
  }
  const ownScreen = ULT_SCREEN_OWN[t.mech] && t[ULT_SCREEN_OWN[t.mech]];
  const open = t.open !== undefined ? t.open : ownScreen ? null : t.cast || t.main;
  // (9차: the call gives way to the last burst — never two screen pictures at once, a phone's worth)
  const addK = id => (M.fx[id] && M.fx[id].add ? 0.7 : 1); // (an added picture drawn whole: smaller)
  if (open && ultLayer(open, VW * (t.openW || g.openW) * (q < 1 ? 0.75 : 1) * addK(open), 'go' + bi + Math.round(q * 4) + addK(open), 0, -24, { follow: true, cap: t.openCap || 2, alpha: calm ? 0.5 : t.openA || (bi > 2 ? 0.75 : 0.85) }) && g.finAt) {
    const f = G.fxs[G.fxs.length - 1];
    f.life = Math.min(f.life, (t.finAt || g.finAt) + 0.05);
  }
  if (light) return;
  // (the original's own cinematic fills the screen: the echoes round it would only cover it)
  if (cine) { G.darkUntil = Math.max(G.darkUntil, G.t + g.cutT + 0.3); return; }
  // The technique's picture held round the hero while it lasts (longer a band).
  // (a picture drawn added, light on light, is drawn whole — its black too — and costs a slowed phone
  // several times a plain one: the held picture and the many echoes are plain ones where the tier has them)
  const plain = id => id && M.fx[id] && !M.fx[id].add;
  const pick = (...ids) => ids.find(plain) || ids.find(id => id && M.fx[id]);
  const aura = pick(t.aura !== undefined ? t.aura : t.main, t.hit);
  if (aura && ultLayer(aura, t.auraW || g.auraW, 'ga' + bi, 0, -24, { follow: true, cap: t.echoCap || 1.3, alpha: calm ? 0.4 : 0.65 })) tkLoopLast(g.aura);
  const boss = M.fx['k_' + t.boss] ? 'k_' + t.boss : null;
  const echo0 = t.echo !== undefined ? t.echo : t.drop || t.main || t.hit;
  // (every other echo the band's own 보스용 technique, or its hit picture: one more layer)
  const echo20 = t.echo2 !== undefined ? t.echo2 : boss && boss !== echo0 ? boss : t.hit && t.hit !== echo0 && M.fx[t.hit] ? t.hit : echo0;
  const echo = pick(echo0, echo20, t.hit), echo2 = pick(echo20, echo0, t.hit);
  // (6차~ every third its hit or its after picture, where that is another again: one more layer)
  const third = [t.hit, t.after, t.cast].find(id => plain(id) && id !== echo && id !== echo2);
  const echoAt = k => (bi > 1 && third && k % 3 === 2 ? third : k % 2 ? echo2 : echo);
  const x0 = p.x, y0 = p.y - 16;
  const ringAt = (k, n, rx, ry, off) => { const a = off + (k / n) * Math.PI * 2; return [x0 + Math.cos(a) * rx * VW, y0 + Math.sin(a) * ry * VH]; };
  if (g.echoN && echo) {
    const n = Math.round((calm ? (t.echoN || g.echoN) >> 1 : t.echoN || g.echoN) * q), rings = g.echoR, per = Math.ceil(n / rings.length);
    for (let k = 0; k < n; k++) {
      const r = rings[Math.min(rings.length - 1, Math.floor(k / per))], j = k % per;
      const [x, y] = ringAt(j, per, r[0], r[1], (Math.floor(k / per) * Math.PI) / per + 0.3);
      const want = (t.echoW || g.echoW) * (1 + 0.04 * (k % 4)), at = g.echoT[0] + ((g.echoT[1] - g.echoT[0]) * k) / n;
      ultLayer(echoAt(k), want, 'ge' + Math.round(want), x, y, { delay: at, cap: t.echoCap || 1.3, flip: x < x0, alpha: calm ? 0.6 : 1 });
    }
  }
  // (6차~: the technique's picture once more over the field as it fades — the moment lasts)
  if (g.lateN && echo && q === 1) {
    const n = calm ? g.lateN >> 1 : g.lateN;
    for (let k = 0; k < n; k++) {
      const [x, y] = ringAt(k, n, 0.3, 0.3, 0.5);
      ultLayer(echoAt(k), (t.echoW || g.echoW) + k * 3, 'gl' + k, x, y, { delay: g.lateAt + k * 0.1, cap: t.echoCap || 1.3, flip: x < x0, alpha: calm ? 0.6 : 1 });
    }
  }
  if (g.finAt) {
    const at = t.finAt || g.finAt;
    const fin = t.fin !== undefined ? t.fin : M.fx['k_' + t.boss] && Math.max(M.fx['k_' + t.boss].w, M.fx['k_' + t.boss].h) >= 120 ? 'k_' + t.boss : open || t.main;
    later(at, () => {
      if (G.dead || !G.player) return;
      ultLayer(fin, VW * (t.finW || g.finW) * (q < 1 ? 0.75 : 1) * addK(fin), 'gf' + Math.round(q * 4), 0, -24, { follow: true, cap: t.finCap || 2, alpha: calm ? 0.55 : 0.95 });
      const n = Math.round((calm ? g.edgeN >> 1 : g.edgeN) * q);
      for (let k = 0; k < n; k++) {
        const [x, y] = ringAt(k, n, 0.45, 0.42, 0);
        ultLayer(echoAt(k) || fin, (t.echoW || g.echoW) * 1.15 + k * 4, 'gd' + k, x, y, { delay: k * 0.04, cap: 1, flip: x < x0, alpha: calm ? 0.6 : 1 });
      }
      for (let k = 0; k < 3; k++) later(k * 0.12, () => shock(G.player.x, G.player.y - 4, 4 + k * 3));
      G.shake = Math.max(G.shake, g.shake);
      if (!G.stage.raid && !G.war) {
        if (screenFlashOk()) G.whiteAt = G.t;
        hitStop(0.05, 'ult');
      }
    });
  }
}
/** The aura just pushed (the last of G.fxs) held looping for `life` seconds round the hero. */
function tkLoopLast(life) {
  const f = G.fxs[G.fxs.length - 1];
  f.loop = true;
  f.life = life;
  f.t = 0;
  return f;
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
const MELEE = new Set(['warrior', 'rogue', 'lancer', 'monk', 'celestial', 'dokkaebi', 'reaper']);
// Classes whose every damaging technique is their weapon's own attack clip (연's bow draw, spear thrust).
const WEAPON_POSE = new Set(['archer', 'lancer', 'monk', 'dokkaebi', 'reaper']);
// (ULT_TIERS[cls][band].boss: the 보스용 필살기 grows with the 승급 too.)
const bossUlt = cls => { const t = ultTier(cls); return t && SKILLS[t.boss] ? t.boss : null; };
function ultWait() {
  return G && G.ultAt !== undefined ? Math.max(0, ULT_REST - (G.t - G.ultAt)) : 0;
}

/** What the 필살기 button shows: the 보스 technique in 보스 mode, the hunting 필살기 else. */
function ultShown(cls) {
  if (ultMode(cls) === 'boss' && bossUlt(cls)) {
    const id = bossUlt(cls);
    const icon = M.skillicon && M.skillicon.includes(id) ? `assets/skillicon/${id}.png` : ultIcon(cls);
    return { name: SKILLS[id].name, icon };
  }
  return { name: ultLook(cls).name, icon: ultIcon(cls) };
}

// ---------------------------------------------------------------- 보조 기술
// One utility technique the player chooses in town (장비 window, utilRow) and throws only by hand:
// the button left of the 필살기 (or Q). It never goes off by itself, nor by the auto play. Each
// wears 연's own icon (assets/skillicon) and effect (fx k_*) of the technique it stands for.
// ---- utility skill tuning (retune here) ----
const UTIL = {
  chosang: { name: '초상비', icon: 'rp_walk', fx: 'k_rp_walk', cd: 25, sec: 5, speed: 0.7,
    text: '5초 동안 이동속도 +70%, 몬스터를 밀치고 지나간다 (재사용 25초)' },
  heal: { name: '회복', icon: 'c_heal', fx: 'k_c_heal', cd: 35, k: 0.3, text: '체력 30% 즉시 회복 (재사용 35초)' },
  protect: { name: '보호', icon: 'p_protect', fx: 'k_p_protect', cd: 40, sec: 8, k: 0.25,
    text: '8초 동안 최대 체력 25%만큼 피해를 막는 보호막 (재사용 40초)' },
  blink: { name: '순간이동', icon: 'r_blink', fx: 'k_r_blink', cd: 20, range: 4,
    text: '바라보는 쪽으로 최대 4칸 순간이동, 몬스터 너머로 (재사용 20초)' },
};
const UTIL_ORDER = ['chosang', 'heal', 'protect', 'blink'];
function utilOf(cls) {
  const id = ((progress.util || {})[cls.id]);
  return UTIL[id] ? id : 'chosang';
}
/** Not in a 문파대항전 (its own keys), nor in the 수련장. */
function utilHere() {
  return !!G && !G.training && !(G.war && !G.war.raid);
}
function utilWait() {
  if (!G || G.utilAt === undefined) return 0;
  return Math.max(0, UTIL[utilOf(G.cls)].cd - (G.t - G.utilAt));
}
function castUtil() {
  if (!G || G.over || G.dead || G.paused || G.choosing || !utilHere() || utilWait() > 0) return false;
  const p = G.player, id = utilOf(G.cls), U = UTIL[id];
  if (G.war) War.moved();
  switch (id) {
    case 'chosang':
      G.buffs.chosang = G.t + U.sec;
      if (M.fx[U.fx]) addFx(U.fx, 0, -26, { follow: true });
      break;
    case 'heal':
      if (p.hp >= p.maxHp) { say('체력이 가득합니다.', 'warn'); return false; }
      heal(p.maxHp * U.k, false, true);
      if (M.fx[U.fx]) addFx(U.fx, 0, -26, { follow: true, scale: 1.3 });
      break;
    case 'protect':
      p.barrier = Math.max(p.barrier || 0, p.maxHp * U.k);
      p.barrierUntil = G.t + U.sec;
      if (M.fx[U.fx]) addFx(U.fx, 0, -26, { follow: true, scale: 1.2 });
      break;
    case 'blink': {
      const dx = p.fdx || 0, dy = dx ? 0 : p.fdy || 1;
      let to = null;
      for (let k = U.range; k >= 1 && !to; k--) {
        const x = p.tx + dx * k, y = p.ty + dy * k;
        if (!occ.has(key(x, y)) && !holdGround(x, y) && (!G.war || War.open(x, y))) to = [x, y];
      }
      if (!to) { say('갈 곳이 없습니다.', 'warn'); return false; }
      if (M.fx[U.fx]) addFx(U.fx, p.x, p.y - 26, { scale: 0.9 });
      const x0 = p.x, y0 = p.y;
      p.x = to[0] * TILE + TILE / 2;
      p.y = to[1] * TILE + TILE - 6;
      heroTile();
      p.stepping = p.moving = false;
      dashFrom(x0, y0);
      if (M.fx[U.fx]) addFx(U.fx, 0, -26, { follow: true, scale: 0.9 });
      p.inv = Math.max(p.inv, 0.3);
      break;
    }
  }
  G.utilAt = G.t;
  (G.utilUsed = G.utilUsed || {})[id] = (G.utilUsed[id] || 0) + 1;
  G.bubble = { text: `${U.name}!`, t: G.t };
  say(`${U.name}의 효과를 받습니다.`, 'sys');
  audio.play('skill_' + U.icon, id === 'heal' ? 'heal' : 'buff', 1);
  strikePose('magic');
  return true;
}
/** The 보조 기술 button, kept in step with the hunt (its icon, the seconds left). */
function syncUtil() {
  const b = $('#util-btn');
  if (!b) return;
  const on = utilHere();
  if (b.hidden === on) b.hidden = !on;
  if (!on) return;
  const U = UTIL[utilOf(G.cls)], w = utilWait();
  put('#util-btn span', U.name);
  put('#util-btn small', w > 0 ? `${Math.ceil(w)}초` : 'Q');
  const ic = `url(assets/skillicon/${U.icon}.png)`;
  if (shown.utilIcon !== ic) { shown.utilIcon = ic; b.style.backgroundImage = ic; }
  b.classList.toggle('ready', w <= 0);
  const k = w > 0 ? w / U.cd : 0, sh = `${(k * 100).toFixed(0)}%`;
  if (shown.utilShade !== sh) { shown.utilShade = sh; b.style.setProperty('--wait', sh); }
}

function castUlt() {
  if (!G || G.over || G.dead || G.paused || G.choosing) return;
  const p = G.player;
  if (p.mp < p.maxMp || ultWait() > 0) return;
  G.ultAt = G.t;
  if (G.war) War.moved(); // the player's own key: not 자리비움
  const def = ultLook(G.cls.id);
  p.mp = 0;
  if (def.hpCost) p.hp = Math.max(1, p.hp * (1 - def.hpCost));
  const shownName = ultShown(G.cls.id).name;
  G.bubble = { text: `${shownName}!`, t: G.t };
  // A blade's or a bow's strike for the fighters; the 천인 (in MELEE for its leap) casts its 필살기.
  strikePose(MELEE_LOOK[G.cls.id] || WEAPON_POSE.has(G.cls.id) ? 'attack' : 'magic');
  say(`${shownName}!`);
  const mode = ultMode(G.cls.id);
  audio.play('skill_' + (mode === 'boss' && def.boss ? def.boss : def.id), 'ult');
  // The field darkens a moment under a 필살기 so its light reads (never a white sheet with 번쩍임 줄이기).
  G.darkUntil = G.t + (def.darken || 0.7);
  G.shake = 0.5;
  if (!G.stage.raid && !G.war) {
    if (screenFlashOk()) G.whiteAt = G.t;
    hitStop(0.035, 'ult');
  }
  const lvl = p.lvl, pw = (1 + 0.1 * G.passives.power) * (1 + 0.15 * promoOf(G.cls.id));
  const v = viewTiles();
  const onScreen = () => G.enemies.filter(e => e.hp > 0 && !e.ally && !(e.war && e.team === SIDE) && Math.abs(e.tx - p.tx) <= v.w && Math.abs(e.ty - p.ty) <= v.h);
  // The 필살기's two ways, switched by the player at the button: 사냥 strikes everything on the
  // screen, 보스 puts eight times the blow into the strongest foe in sight (and a little around it).
  const base = (G.cls.id === 'warrior' ? p.maxHp * 0.9 : 60 + lvl * 12) * pw * (def.k || 1);
  const seen = onScreen();
  // Its call over the hero first, at a caster's size (the technique's own 연 picture).
  if (def.cast && M.fx[def.cast] && !['dash', 'vortex', 'barrage', 'cross', 'totem', 'sanctuary', 'mark', 'chain'].includes(def.mech)) {
    ultPic(def.cast, 0, -26, { follow: true, want: def.castSize || 180 });
  }
  if (mode === 'boss') {
    // The tier's own technique against the strongest foe (data.js ULT_TIERS boss): five quick
    // blows with that technique's 연 effect, the close-in classes leaping to it first.
    const rank = e => (e.kind === 'boss' ? 4 : e.kind === 'mini' ? 3 : e.kind === 'champ' ? 2 : 1) * 1e9 + e.hp;
    const target = seen.slice().sort((a, b) => rank(b) - rank(a))[0];
    const tech = def.boss && SKILLS[def.boss] ? def.boss : null;
    const tfx = tech && M.fx['k_' + tech] ? 'k_' + tech : def.hit && M.fx[def.hit] ? def.hit : def.fx;
    G.bubble = { text: `${tech ? SKILLS[tech].name : def.name}!`, t: G.t };
    if (target) {
      if (MELEE.has(G.cls.id)) {
        const spot = leapSpot(target);
        if (spot) {
          leapTo(spot[0], spot[1]);
          p.inv = Math.max(p.inv, 1.2);
        }
      }
      if (def.cast && M.fx[def.cast]) ultPic(def.cast, 0, -26, { follow: true, want: 150 });
      for (let k = 0; k < 5; k++) {
        later(0.15 + k * 0.22, () => {
          if (target.hp <= 0) return;
          fxOn(tfx, target, { scale: 1.2 + 0.1 * k });
          if (k === 4 && def.hit && M.fx[def.hit] && def.hit !== tfx) fxOn(def.hit, target, { scale: 1.4 });
          hurtEnemy(target, base * 1.6);
          G.shake = Math.max(G.shake, 0.12);
          if (k === 4) around(target.tx, target.ty, 1.5).forEach(e => { if (e !== target && e.hp > 0) hurtEnemy(e, base); });
        });
      }
    }
  } else {
    const strike = (e, k) => { if (e.hp > 0) hurtEnemy(e, base * k); };
    G.ultHits = 0;
    if (ultCine9(def, strike)) return ultExtras(def);
    const run = ULT_MECH[def.mech] || ULT_MECH.rain;
    // 9차: the original 궁극's own cinematic (ultGrand) is the picture; the way of striking keeps its blows,
    // but its own big pictures give way to a small hit flash (they covered the cinematic)
    const cine = def.cutin && M.fx[def.cutin] && !G.war && ultBand(G.cls.id) === 3;
    const quiet = cine ? { ...def, main: 'h_ml_burst', cast: null, burst: null, ring: null, drop: 'h_ml_burst', shot: 'h_ml_burst', after: null, hit: 'h_ml_burst', hitScale: 0.6, mainScale: 0.6, castStages: false } : def;
    // 이펙트=판정: the cinematic covers the whole screen while it plays, so it strikes the whole screen while it
    // plays — the way of striking keeps 60% of the blow, the rest comes in 8 beats over the cinematic's 3.4 s.
    const CINE_N = 8, cineK = 0.4 / CINE_N;
    // 이펙트=판정 (0·3·6차): its layers stay over the darkened screen a second and a half to three and a half (ultGrand's
    // held picture and late echoes), its way of striking over in about one: 30% of the blow comes in beats on the
    // whole screen while they stay (the same blow, spread), and the dark holds over the screen as long (2.2 / 2.9 / 3.4 s:
    // the last of a way's blows — 헬파이어's wave to the rest — fall by 2 s).
    // (사용자 결정 2026-11-22: 필살기는 빠르게 — every band's dark and held pictures about 1.2 s, its beats within the first 0.6 s)
    const band = ultBand(G.cls.id), span = cine ? 0 : 1.2;
    const beatN = cine || G.war ? 0 : 2, beatK = 0.3 / Math.max(1, beatN);
    const blow = cine ? (e, k) => strike(e, k * 0.6) : beatN ? (e, k) => strike(e, k * 0.7) : strike;
    if (cine) for (let i = 0; i < CINE_N; i++) later(0.2 + i * 0.06, () => { if (!G.dead) for (const e of onScreen()) strike(e, cineK); });
    for (let i = 1; i <= beatN; i++) later(0.3 + (i - 1) * 0.28, () => { if (!G.dead) for (const e of onScreen()) strike(e, beatK); });
    if (beatN) G.darkUntil = Math.max(G.darkUntil, G.t + span);
    if (seen.length || def.mech === 'sanctuary') run(quiet, seen, blow);
    if (seen.length || def.mech === 'sanctuary') ultGrand(def, ultBand(G.cls.id));
  }
  ultExtras(def);
}
/** 9차 필살기, 원작 연출 그대로 (만검귀종, 2662 IMG09; 사용자 결정 2026-11-22): the original's cinematic drawn centred on
 *  the hero at def.cine9 of the screen's height (test: window.__ultSize) — never stretched over the screen — under the
 *  dark; nothing else is drawn with it (no rain of swords, no rings, no hit pictures). 이펙트=판정: it strikes what
 *  stands inside the drawn art, in two quick beats at its peak, the hero untouchable
 *  meanwhile (설명창: 시전 동안 무적). Not in a war or a raid (the old way there). True when it took the cast. */
function ultCine9(def, strike) {
  const f = def.cine9 && M.fx[def.cutin];
  if (!f || G.war || G.stage.raid || ultBand(G.cls.id) !== 3) return false;
  const p = G.player, run = G, size = window.__ultSize || def.cine9, k = (VH * size) / f.h, id = `${def.cutin}#c${Math.round(size * 100)}`;
  // (사용자 결정: 한 번에 휙 — the dark a blink, the whole cinematic in def.cineT (1.1 s), the blow at its peak)
  if (!M.fx[id]) M.fx[id] = { ...f, src: f.src || def.cutin, k, durs: f.durs.map(() => Math.round(((def.cineT || 1.1) * 1000) / f.durs.length)) };
  const life = durs(id).reduce((a, b) => a + b, 0), lead = 0.15;
  G.darkUntil = G.t + lead + life + 0.1;
  p.inv = Math.max(p.inv || 0, lead + life);
  later(lead, () => {
    if (G !== run || G.dead) return;
    G.fxs.push({ id, x: 0, y: -12, t: 0, life, scale: 1, rot: 0, follow: true, anchor: 'mid', alpha: settings.calmFx ? 0.6 : 1, big: true, skip: 0, fadeIn: 0 });
  });
  // (the art's own ellipse: the cell's, less its faded edge)
  const rx = (f.w * k) / 2 * 0.92, ry = (f.h * k) / 2 * 0.86, BEATS = 2;
  G.ultArea = { rx, ry, until: G.t + lead + life }; // test: what it strikes
  for (let i = 0; i < BEATS; i++) later(lead + life * 0.4 + i * 0.25, () => {
    if (G !== run || G.dead) return;
    G.shake = Math.max(G.shake, 0.3);
    G.quietHit = true; // (no hit marks over the cinematic: it is the whole of what is seen)
    for (const e of G.enemies) if (tkFoe(e) && ((e.x - p.x) / rx) ** 2 + ((e.y - 24 - (p.y - 12)) / ry) ** 2 <= 1) strike(e, 1 / BEATS);
    G.quietHit = false;
  });
  return true;
}
/** The 필살기's picture made ready ahead (decoded, and drawn once so the first press does not stall on it). */
function ultPrime() {
  if (!G || !G.cls) return;
  let def = null;
  try { def = ultLook(G.cls.id); } catch (e) { return; }
  if (!def || !def.cine9 || !M.fx[def.cutin]) return;
  const run = G;
  fxWarm([def.cutin]).then(() => {
    const im = fxPic(def.cutin);
    if (G !== run || !im) return;
    // (one pixel of it, all but clear: the browser readies the whole sheet for the canvas now, not at the press)
    const a = ctx.globalAlpha;
    ctx.globalAlpha = 0.01;
    try { ctx.drawImage(im, 0, 0, im.width, im.height, 0, 0, 2, 2); } catch (e) { /* not ready */ }
    ctx.globalAlpha = a;
    G.ultPrimed = def.cutin;
  });
}
function ultExtras(def) {
  // What a tier brings besides the blow (헬파이어's 보호막 …).
  const p = G.player;
  if (def.shield) {
    G.buffs.shield = Math.max(G.buffs.shield, G.t + def.shield);
    if (FX.shield) addFx(FX.shield, 0, -26, { follow: true, scale: 0.6 });
  }
  if (def.guard && def.mech !== 'sanctuary') G.buffs.guard = Math.max(G.buffs.guard, G.t + def.guard);
  if (def.heal) heal(p.maxHp * def.heal, true);
}

/** Foes within 3 tiles of the hero (counted at most four times a second: the kills ask often). */
function heapNear() {
  if (G.t < (G.heapAt ?? -9)) return G.heapN;
  G.heapAt = G.t + 0.25;
  const p = G.player;
  let n = 0;
  for (const e of G.enemies) if (e.hp > 0 && !e.ally && Math.abs(e.tx - p.tx) <= 3 && Math.abs(e.ty - p.ty) <= 3 && ++n >= 5) break;
  return (G.heapN = n);
}
const timers = [];
function later(delay, fn) {
  if (delay <= 0) return void fn();
  // (a step of an AI's cast (castAs) runs in its shadow again, on the real hunt's clock)
  if (SH) { const ctx = SH, f0 = fn; fn = () => inShadow(ctx, f0); }
  // (a step of a skill's cast draws as the cast does: FXC, 보이는 범위 = 맞는 범위)
  if (FXC) { const f1 = fn; fn = () => inCastFx(f1); }
  timers.push({ at: G.t + delay, fn, run: SH ? SH.real : G });
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
// ---------------------------------------------------------------- 백호환령부, the pet weapon
// The original's fastest mount, worn here as a weapon that lives: 연's own white tiger (the
// 사신수 백호, Units sinsu_whitetiger tiger_roar: prowl 0-3, pounce 4-6, back 7-11, front 13-24)
// walks at the hero's heel and, every second and a half, leaps on the nearest monster — its
// landing tears the ground around (백호의 맹렬's claws) and may set the struck bleeding.
const PET_PROWL = [0, 1, 2, 3], PET_POUNCE = [4, 5, 6, 12], PET_BACK = [7, 8, 9, 10], PET_FRONT = [19, 20, 21, 22, 23, 24];
function petWorn() {
  const g = G.player.gear || {};
  return g.capeSp === 'cr_sinsu_baekho';
}
function updatePet(dt) {
  const p = G.player;
  if (!petWorn() || !M.fx.g_pet_baekho) { G.pet = null; return; }
  const pet = G.pet = G.pet || { pet: true, x: p.x - 30, y: p.y, face: 1, state: 'heel', t: 0, cd: 1, row: PET_PROWL, f: 0 };
  pet.t += dt;
  pet.cd -= dt;
  if (pet.state === 'leap') {
    const k = Math.min(1, pet.t / 0.35);
    pet.x = pet.fx + (pet.tx - pet.fx) * k;
    pet.y = pet.fy + (pet.ty - pet.fy) * k - Math.sin(k * Math.PI) * 32;
    pet.f = PET_POUNCE[Math.min(PET_POUNCE.length - 1, Math.floor(k * PET_POUNCE.length))];
    if (k >= 1) {
      // The landing: the claws round about, 연's 백호 hit.
      const base = gyeokBase() * 2.4 * (1 + 0.15 * (starOf(G.cls, 'sp:cr_sinsu_baekho') - 1));
      G.allyHitting = true;
      for (const e of G.enemies.filter(e => Math.abs(e.x - pet.x) < TILE * 1.4 && Math.abs(e.y - pet.y) < TILE * 1.4).slice(0, 8)) {
        hurtEnemy(e, base);
        if (Math.random() < 0.3) applyStatus(e, 'bleed', 5, 1);
      }
      G.allyHitting = false;
      if (fxBudget('pet', 2)) {
        // The strike's own claw marks only (tools/yeon_claws.py): its leaping tiger and roaring
        // head were bigger than the hero and hid the fight.
        if (M.fx.g_tf_backho_claw) addFx('g_tf_backho_claw', pet.x, pet.y - 10, { scale: 0.5, flip: pet.face > 0 });
      }
      G.shake = Math.max(G.shake, 0.06);
      audio.play('kill');
      pet.state = 'roar';
      pet.t = 0;
    }
    return;
  }
  if (pet.state === 'roar') {
    pet.f = PET_FRONT[Math.min(PET_FRONT.length - 1, Math.floor(pet.t / 0.08))];
    if (pet.t > 0.5) { pet.state = 'heel'; pet.t = 0; }
    return;
  }
  // At the hero's heel, a little behind; a monster near enough is leapt on.
  const prey = pet.cd <= 0 && nearestEnemies(1, 4.5, p)[0];
  if (prey) {
    Object.assign(pet, { state: 'leap', t: 0, fx: pet.x, fy: pet.y, tx: prey.x, ty: prey.y, cd: 1.5 });
    pet.face = Math.sign(prey.x - pet.x) || pet.face;
    return;
  }
  tigerFollow(pet, p.x, p.y, p.moving ? p.fdx : 0, !!G.cpet, heroSpeed(), dt);
}
/** The town's purse at the top: 전 and 레이드주화, kept current every frame (they were written
 *  once on entering town, so what the smith, the shop, 코디 or 뽑기 spent did not show). */
let walletShown = '';
function townWallet() {
  const g = progress.gold || 0, c = progress.coins || 0, key = g + '/' + c;
  if (key === walletShown) return;
  walletShown = key;
  $('#town-gold').innerHTML = walletHTML(g, c);
  syncTownGoal(); // what was bought or claimed may change the next goal
}
/** In town too, 백호환령부's tiger walks at the hero's heel (it was seen only on the hunting grounds). */
function townTiger(dt) {
  if (savedGear(T.cls).capeSp !== 'cr_sinsu_baekho' || !M.fx.g_pet_baekho) { T.tiger = null; return; }
  const pet = T.tiger = T.tiger || { pet: true, x: T.x - 66, y: T.y, face: 1, t: 0, f: 0 };
  pet.t += dt;
  tigerFollow(pet, T.x, T.y, T.moving ? T.fdx : 0, !!T.cpet, (TILE / 0.24) * (T.cls.speed / 70), dt);
}
/** The tiger at the hero's heel, smoothly: it keeps one side of the hero and changes it only when
 *  the hero walks the other way (not each time a blow turns the hero, which made it dart across
 *  and back), eases toward its spot instead of start-stop steps, and walks its cycle by distance. */
function tigerFollow(pet, x, y, walkDx, belowPet, speed, dt) {
  if (walkDx) pet.side = -Math.sign(walkDx); // behind the way the hero walks
  const side = pet.side || -1;
  const hx = x + side * 54, hy = y + (belowPet ? -18 : 4);
  const dx = hx - pet.x, dy = hy - pet.y, d = Math.hypot(dx, dy);
  if (d > TILE * 8) { pet.x = hx; pet.y = hy; pet.walking = false; return; }
  // Walking starts past 12px and stops under 3 (no flicker between the two at one distance).
  pet.walking = pet.walking ? d > 3 : d > 12;
  if (pet.walking) {
    const v = Math.min(d, Math.max(speed * 0.6, Math.min(speed * 1.6, d * 5)) * dt);
    pet.x += dx / d * v;
    pet.y += dy / d * v;
    pet.dist = (pet.dist || 0) + v;
    if (Math.abs(dx) > 10) pet.face = Math.sign(dx);
    // Up or down only when clearly so; the row is kept while it stays so.
    const vert = Math.abs(dy) > Math.abs(dx) * 2;
    if (vert || Math.abs(dx) > Math.abs(dy)) pet.row = vert ? (dy < 0 ? PET_BACK : PET_FRONT) : PET_PROWL;
    const row = pet.row || PET_PROWL;
    pet.f = row[Math.floor(pet.dist / 14) % row.length]; // a frame every 14px walked
  } else {
    if (Math.abs(x - pet.x) > 4) pet.face = Math.sign(x - pet.x); // at rest it looks toward the hero
    pet.row = PET_PROWL;
    pet.f = PET_PROWL[Math.floor(pet.t / 0.4) % 2];
  }
}
function drawPet(pet) {
  const f = M.fx.g_pet_baekho, im = f && fxPic('g_pet_baekho');
  if (!f || !im || !im.width) return;
  const k = 0.78 * (f.k || 1); // a beast about the hero's size: at 연's full size it towered over the hero
  ctx.save();
  ctx.translate(Math.round(pet.x), Math.round(pet.y));
  // The sheet's tiger faces left; turned for the right.
  if (pet.face > 0) ctx.scale(-1, 1);
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(0, -2, 28, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.drawImage(im, pet.f * f.w, 0, f.w, f.h, -f.ax * k, -f.ay * k, f.w * k, f.h * k);
  ctx.restore();
}

function updateAllies(dt) {
  for (const a of G.allies) {
    a.t += dt;
    advance(a, dt);
    if (a.moving) continue;
    a.cd -= dt;
    a.atk -= dt;
    const beside = DIRS.map(([dx, dy]) => occ.get(key(a.tx + dx, a.ty + dy))).find(b => b && b.m && !b.ally && !(b.war && b.team === SIDE) && b.hp > 0);
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
    for (const [dx, dy] of towards(a, tgt.tx, tgt.ty)) if ((!G.war || G.war.raid || War.open(a.tx + dx, a.ty + dy)) && step(a, dx, dy, 0.28)) break;
  }
  for (const a of G.allies) if (a.t >= a.life) leave(a);
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

// ---- the ways out, in one row
// The market's ways out stood where 연's map has its gates — the 남문's opening, the hall's far
// end, a corner — far apart and marked by a 장승 alone, so it was hard to tell where a way out
// was. They stand now in one row across the square's south side, an even step apart, each a
// swirling gate (연's own 귀문 effect, k_rp_gate) under its name; the hero starts just below the
// middle one, just inside the 남문. The guardian statue (the raids) and the training ground's gate are in the row too.
// In the market's own pixels (its 1664×1568 at 32-pixel tiles); a build with another market keeps
// its own ways out, the training ground's gate added by the spawn.
const PORTAL_ROW_Y = 1304, PORTAL_STEP = 224, PORTAL_MID = 800;
const PORTAL_ROW = [
  { tab: 'raid', label: '영웅의 석상', sub: '레이드', art: 'statue', tint: 'hue-rotate(-30deg) saturate(1.6)' },
  { tab: 'world_4', label: '환상의 섬', sub: '사냥터', tint: 'hue-rotate(170deg) saturate(1.5) brightness(1.5)' },
  { tab: 'gungnae', label: '국내성', sub: '사냥터', tint: null },
  { tab: 'world_1', label: '대륙', sub: '사냥터', tint: 'hue-rotate(28deg) saturate(1.8) brightness(1.35)' },
  { tab: 'training', label: '수련장', sub: '기술 시험', tint: 'hue-rotate(95deg) saturate(1.5) brightness(1.1)' },
];
const PORTAL_FX = 'k_rp_gate';
let portalCache = null;
/** The market's ways out (cached per build). */
function townPortals() {
  const yt = M.ui.ytown;
  if (!yt) return [];
  if (portalCache) return portalCache;
  const m = yt.areas.market;
  if (m.w === 1664 && m.h === 1568) {
    portalCache = PORTAL_ROW.map((p, i) => ({ ...p, x: PORTAL_MID + (i - 2) * PORTAL_STEP, y: PORTAL_ROW_Y, r: p.art === 'statue' ? 26 : 30 }));
  } else {
    portalCache = yt.portals.map(p => ({ ...p, sub: '', tint: null }));
    portalCache.push({ tab: 'training', label: '수련장', sub: '기술 시험', x: m.spawn[0] + 96, y: m.spawn[1], r: 30, tint: PORTAL_ROW[4].tint });
  }
  return portalCache;
}
/** Where the hero comes into the market: just inside the 남문, under the row's middle gate, facing it. */
function townSpawn() {
  const m = M.ui.ytown.areas.market;
  return m.w === 1664 && m.h === 1568 ? [PORTAL_MID, PORTAL_ROW_Y + 50] : m.spawn;
}

/** The swirl of a way out on the floor: a few of 연's 귀문 frames laid flat and turning, lit, with
 *  a faint standing glow over it. Drawn once into a sheet of 48 steps per colour and size (turned and
 *  scaled sprites drawn live, three a gate, were most of the town's frame on a phone). */
const PORTAL_K = 48, PORTAL_COLS = 8;
const portalSprites = new Map();
function portalSprite(tint, size, upright) {
  const key = (tint || '') + '|' + size + '|' + (upright ? 1 : 0);
  let c = portalSprites.get(key);
  if (c) return c;
  const f = M.fx[PORTAL_FX], im0 = f && fxPic(PORTAL_FX);
  if (!f || !im0 || !im0.complete || !im0.width) return null;
  const im = tint ? tinted(im0, tint) : bmSrc(im0);
  const R = 2, top = upright ? size * 0.95 : size * 0.3, W = Math.ceil(size * R), H = Math.ceil((top + size * 0.3) * R);
  c = document.createElement('canvas');
  c.width = W * PORTAL_COLS;
  c.height = H * Math.ceil(PORTAL_K / PORTAL_COLS);
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = true;
  g.globalCompositeOperation = 'lighter';
  const n = f.n || (f.durs ? f.durs.length : 1), lo = Math.floor(n * 0.4), hi = Math.max(lo + 1, Math.floor(n * 0.72)), cols = f.cols || 1e9;
  for (let k = 0; k < PORTAL_K; k++) {
    const i = lo + k % (hi - lo), sx = (i % cols) * f.w, sy = Math.floor(i / cols) * f.h, th = k / PORTAL_K * Math.PI * 2;
    g.save();
    g.translate((k % PORTAL_COLS) * W + W / 2, Math.floor(k / PORTAL_COLS) * H + top * R);
    g.scale(R, R);
    g.save();
    g.scale(1, 0.48);
    g.rotate(th);
    g.drawImage(im, sx, sy, f.w, f.h, -size / 2, -size / 2, size, size);
    // A second turn of it the other way, a little smaller: the swirl reads at a glance.
    g.rotate(-2 * th);
    g.globalAlpha = 0.7;
    g.drawImage(im, sx, sy, f.w, f.h, -size * 0.36, -size * 0.36, size * 0.72, size * 0.72);
    g.restore();
    if (upright) {
      // A faint standing glow over it, so the gate is seen from across the square.
      g.globalAlpha = 0.35 + 0.15 * Math.sin(th * 3);
      g.drawImage(im, sx, sy, f.w, f.h, -size * 0.32, -size * 0.95, size * 0.64, size * 0.8);
    }
    g.restore();
  }
  c.fw = W;
  c.fh = H;
  c.top = top;
  // (the sheet's tinted copy, 5 MB a colour, was only for this)
  if (tint && tintCache.get(im0)) tintCache.get(im0).delete(tint);
  portalSprites.set(key, c);
  return c;
}
function drawPortalFx(x, y, size, tint, now, upright) {
  const c = portalSprite(tint, size, upright);
  if (!c) return false;
  const k = Math.floor(now * 12) % PORTAL_K;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(c, (k % PORTAL_COLS) * c.fw, Math.floor(k / PORTAL_COLS) * c.fh, c.fw, c.fh, Math.round(x - size / 2), Math.round(y - c.top), size, c.fh / 2);
  ctx.restore();
  return true;
}

const plateW = new Map();
/** A way out's name plate over it: the place, and what it is under it. */
function portalPlate(text, sub, x, y, color) {
  ctx.font = 'bold 12px G11';
  ctx.textAlign = 'center';
  let w = plateW.get(text);
  if (!w) plateW.set(text, w = Math.ceil(ctx.measureText(text).width) + 12);
  ctx.fillStyle = 'rgba(20,10,4,0.72)';
  ctx.fillRect(Math.round(x - w / 2), Math.round(y - 13), w, sub ? 26 : 16);
  ctx.strokeStyle = 'rgba(255,210,122,0.75)';
  ctx.lineWidth = 1;
  ctx.strokeRect(Math.round(x - w / 2) + 0.5, Math.round(y - 13) + 0.5, w - 1, (sub ? 26 : 16) - 1);
  outline(text, x, y, color);
  if (sub) {
    ctx.font = '8px G7';
    outline(sub, x, y + 10, '#e8d8b0');
  }
}

// ---- the town's life: people and riders walking the square's roads, a word now and then
// 연's own figures only: passing adventurers in 연's class sprites (yhero2, plain gear of a few
// steps), and 연's mounted units (the 고원 riders: a mounted archer and a horseman) as the guard's
// horse patrol. (연's riderless 말 is not in the build, so no horse walks alone.) They step a
// tile at a time along the roads, stop, look about and say something; few, so the town stays cheap.
const TOWN_ROADS = [
  // [tx0, ty0, tx1, ty1] in the market's tiles: the top road under the hall, the road between the
  // halls, the square's south side, the west and east sides.
  [3, 13, 48, 14], [3, 28, 48, 29], [3, 39, 48, 42], [3, 13, 5, 42], [46, 13, 48, 42], [43, 31, 48, 38],
];
const TOWN_WALKERS = [
  { name: '떠돌이 검객', cls: 'warrior', gear: { armor: 2, weapon: 3, shield: 1, helmet: -1, cape: -1 },
    lines: ['남문 밖 토끼굴은 초보들 차지라네.', '백호령 한 번이면 칼끝이 달라지지.', '대장간 털보 영감 솜씨 하나는 고구려 제일이야.'] },
  { name: '견습 도적', cls: 'rogue', gear: { armor: 1, weapon: 2, shield: -1, helmet: -1, cape: -1 },
    lines: ['쉿, 투명 쓰고 지나가는 중이오.', '흉가 귀신이 요새 부쩍 늘었다던데.', '떼보네 갑옷점 물건이 오늘 좋더군.'] },
  { name: '방랑 주술사', cls: 'mage', gear: { armor: 2, weapon: 2, shield: -1, helmet: -1, cape: -1 },
    lines: ['마력이 바닥나면 주막에서 쉬어 가게.', '헬파이어 한 방이면 다 끝나지.', '수련장 송백인형한테 마법을 시험해 봤소?'] },
  { name: '마을 도사', cls: 'poet', gear: { armor: 1, weapon: 1, shield: -1, helmet: -1, cape: -1 },
    lines: ['다친 데 있으면 말하게. 기원 한 번이면 낫는다네.', '부여성까지 걸어가려니 다리가 후들거리는군.', '영웅의 석상 앞에 모이면 공대를 꾸린다네.'] },
  { name: '사냥꾼 궁사', cls: 'archer', gear: { armor: 1, weapon: 2, shield: -1, helmet: -1, cape: -1 },
    lines: ['화살이 떨어져서 장터에 왔소.', '대륙 쪽 길은 짐승이 사나우니 조심하시오.', '왈숙 이모네 국밥이 일품이지.'] },
  { name: '기마 순라꾼', unit: 'y616004', scale: 0.8, speed: 58, rider: true,
    lines: ['길 비키시오! 순라 도는 중이오.', '해 지면 성문 밖으로 나가지 마시오.', '도둑이 들면 바로 알리시오.'] },
  { name: '기마 궁수', unit: 'y616002', scale: 0.8, speed: 64, rider: true,
    lines: ['이랴! 고원에서 막 달려 왔소.', '국내성 장터는 언제 와도 붐비는군.', '말에게 먹일 꼴 파는 데 아시오?'] },
];
const TOWN_GOSSIP = ['오늘 장터가 꽤 붐비는구먼.', '레이드 갔던 공대가 돌아왔다더군!', '알림판에 새 의뢰가 붙었다오.'];

let roadGrid = null;
/** The market's road tiles a walker may step on: on a road, walkable, away from the gates and folk. */
function townRoads() {
  if (roadGrid) return roadGrid;
  const m = M.ui.ytown.areas.market, yt = M.ui.ytown;
  const g = roadGrid = new Uint8Array(m.cols * m.rows);
  const folk = Object.values(yt.spots).filter(s => s.area === 'market');
  for (const [x0, y0, x1, y1] of TOWN_ROADS) {
    for (let ty = y0; ty <= Math.min(y1, m.rows - 1); ty++) for (let tx = x0; tx <= Math.min(x1, m.cols - 1); tx++) {
      if (m.walk[ty][tx] !== '.') continue;
      const cx = tx * m.tile + m.tile / 2, cy = ty * m.tile + m.tile - 4;
      if (townPortals().some(p => Math.abs(p.x - cx) < 64 && Math.abs(p.y - cy) < 48)) continue;
      if (yt.doors.some(d => Math.hypot(d.x - cx, d.y - cy) < 40)) continue;
      if (folk.some(s => Math.hypot(s.x - cx, s.y - cy) < 40)) continue;
      g[ty * m.cols + tx] = 1;
    }
  }
  return g;
}
function onRoad(tx, ty) {
  const m = M.ui.ytown.areas.market;
  return tx >= 0 && ty >= 0 && tx < m.cols && ty < m.rows && townRoads()[ty * m.cols + tx] === 1;
}

/** The walkers of a visit to town, each on a road tile of its own, its first word a while off. */
function makeWalkers() {
  const yt = M.ui.ytown;
  if (!yt || !yt.areas.market.walk) return [];
  const m = yt.areas.market, out = [], taken = new Set();
  const tiles = [];
  for (let ty = 0; ty < m.rows; ty++) for (let tx = 0; tx < m.cols; tx++) if (onRoad(tx, ty)) tiles.push(ty * m.cols + tx);
  if (!tiles.length) return out;
  for (const def of TOWN_WALKERS) {
    if (def.unit && !(M.yunit && M.yunit[def.unit])) continue;
    if (def.cls && !(M.yhero2 && M.yhero2[def.cls])) continue;
    let k = tiles[Math.floor(Math.random() * tiles.length)];
    for (let tries = 0; tries < 20 && taken.has(k); tries++) k = tiles[Math.floor(Math.random() * tiles.length)];
    taken.add(k);
    const tx = k % m.cols, ty = Math.floor(k / m.cols);
    const w = { walker: true, def, name: def.name, x: tx * m.tile + m.tile / 2, y: ty * m.tile + m.tile - 4, tx, ty,
      fdx: 0, fdy: 1, mdx: 0, mdy: 1, moving: false, walkT: 0, wait: 0.5 + Math.random() * 3, steps: 0, gx: 0, gy: 0,
      talk: 3 + Math.random() * 12, say: null, sayT: 0, seed: Math.floor(Math.random() * 1000),
      cls: def.cls ? CLASSES.find(c => c.id === def.cls) : null, gear: null, m: def.unit ? { id: def.unit } : null };
    if (w.cls) {
      w.gear = Object.assign({}, def.gear);
      Object.defineProperty(w.gear, 'cos', { value: null, enumerable: false, writable: true });
    }
    out.push(w);
  }
  return out;
}

const WALK_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
/** A walker's next few tiles: on along its way most of the time, else a turn; never back at once. */
function walkerTurn(w) {
  const ahead = onRoad(w.tx + w.mdx, w.ty + w.mdy) && (w.mdx || w.mdy);
  if (ahead && Math.random() < 0.7) return true;
  const start = Math.floor(Math.random() * 4);
  for (let k = 0; k < 4; k++) {
    const [dx, dy] = WALK_DIRS[(start + k) % 4];
    if (dx === -w.mdx && dy === -w.mdy && (w.mdx || w.mdy)) continue;
    if (onRoad(w.tx + dx, w.ty + dy)) { w.mdx = dx; w.mdy = dy; return true; }
  }
  if (onRoad(w.tx - w.mdx, w.ty - w.mdy)) { w.mdx = -w.mdx; w.mdy = -w.mdy; return true; }
  return false;
}

let townSaying = 0;
function updateWalkers(dt) {
  const ws = T.walkers;
  if (!ws || T.area !== 'market') return;
  const m = M.ui.ytown.areas.market, tile = m.tile;
  townSaying = 0;
  for (const w of ws) if (w.say) townSaying++;
  for (const w of ws) {
    // A word now and then: never more than two talking at once; a passer-by near the hero sooner.
    if (w.say) {
      w.sayT += dt;
      if (w.sayT > 3.4) { w.say = null; townSaying--; }
    } else {
      w.talk -= dt * (Math.hypot(w.x - T.x, w.y - T.y) < 90 ? 3 : 1);
      if (w.talk <= 0 && townSaying < 2) {
        const ls = w.def.lines, gossip = Math.random() < 0.2;
        w.say = gossip ? TOWN_GOSSIP[Math.floor(Math.random() * TOWN_GOSSIP.length)] : ls[Math.floor(Math.random() * ls.length)];
        w.sayT = 0;
        w.talk = 9 + Math.random() * 12;
        townSaying++;
        // A rider pulls up to say it; one on foot stops too.
        if (!w.moving) w.wait = Math.max(w.wait, 2.2);
      }
    }
    if (w.moving) {
      const sp = (w.def.speed || 42) * dt;
      const dx = w.gx - w.x, dy = w.gy - w.y, d = Math.abs(dx) + Math.abs(dy);
      if (d <= sp) {
        w.x = w.gx;
        w.y = w.gy;
        w.tx += w.mdx;
        w.ty += w.mdy;
        w.moving = false;
        if (--w.steps <= 0) w.wait = 1.2 + Math.random() * 3.5;
      } else {
        w.x += Math.sign(dx) * sp;
        w.y += Math.sign(dy) * sp;
        w.walkT += dt * 1000;
        continue;
      }
    }
    if (w.wait > 0) {
      w.wait -= dt;
      if (w.say && w.wait <= 0) w.wait = 0.3; // stands while it speaks
      continue;
    }
    if (w.steps <= 0) w.steps = 2 + Math.floor(Math.random() * 5);
    if (!walkerTurn(w)) { w.wait = 1 + Math.random() * 2; w.steps = 0; continue; }
    w.fdx = w.mdx;
    w.fdy = w.mdy;
    w.gx = (w.tx + w.mdx) * tile + tile / 2;
    w.gy = (w.ty + w.mdy) * tile + tile - 4;
    w.moving = true;
  }
}

/** A walker as 연 draws it: an adventurer in its class's figure, or a mounted unit's own frames. */
function drawTownWalker(w, now) {
  let top = 64;
  if (w.cls) {
    if (!drawYhero2(w.cls, w.gear, w, w.x, w.y, w.moving ? 'walk' : 'idle', 1)) return;
  } else {
    const yu = yunit(w.m);
    if (!yu) return;
    const u = yu.u, dir = w.mdx ? 'side' : w.mdy < 0 ? 'up' : 'down';
    const a = (w.moving ? u.anims['walk_' + dir] : u.anims['idle_' + dir]) || u.anims.walk_down;
    if (!a) return;
    const f = Math.floor((now * 1000 + w.seed) / a.ms) % a.n, s = w.def.scale || 1;
    drawYunit(yu, w, w.x, w.y, s, 1, a.row, f, dir === 'side' && w.mdx > 0);
    top = u.foot[1] * s - 4;
  }
  ctx.font = '8px G7';
  ctx.textAlign = 'center';
  outline(w.name, w.x, w.y + 10, '#c8e0ff');
  if (w.say) drawBubble(w.say, w.x, w.y - top, w.sayT > 3.1 ? 1 + (w.sayT - 3.1) : 0);
}


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
  // Out of a run: its effect sheets are let go (the next run loads its own), and its pictures
  // (the ground, its monsters, the war's field and fighters); the town's own are loaded.
  fxKeep([]);
  leaveScreen(cls, savedGear(cls), ['ytown/']);
  War.release(true);
  Hunt.release();
  picWarm(townPics('market'));
  heroWarm(cls, savedGear(cls));
  if (!M.ui.town && !M.ui.ytown) {
    showScreen('stages');
    return;
  }
  const gear = savedGear(cls);
  const yt = M.ui.ytown;
  const sp = yt ? townSpawn() : [7.5 * TOWN_TILE, 5 * TOWN_TILE - 6];
  T = { cls, x: sp[0], y: sp[1], fdx: 0, fdy: yt ? -1 : 1, moving: false,
    walkT: 0, near: null, area: 'market' };
  T.folk = townFolk('market');
  T.walkers = yt ? makeWalkers() : [];
  // The gates' swirls drawn once now, as the town opens, not in the middle of a walk.
  if (yt) {
    for (const pt of townPortals()) portalSprite(pt.tint, pt.art === 'statue' ? 70 : 84, pt.art !== 'statue');
    portalSprite(DOOR_TINT, 58, true);
  }
  showScreen('town');
  syncLastHunt();
  audio.bgm('town');
  walletShown = '';
  townWallet();
  $('#town-name').textContent = `국내성 · ${cls.name}`;
}

function townBlocked(x, y) {
  const m = townArea();
  if (m) {
    const tx = Math.floor(x / m.tile), ty = Math.floor((y - 2) / m.tile);
    if (tx < 0 || ty < 0 || tx >= m.cols || ty >= m.rows || m.walk[ty][tx] !== '.') return true;
    // The guardian statue stands on its base: the hero walks up to it, not through it.
    if (T.area === 'market' && townPortals().some(pt => pt.art === 'statue' && Math.abs(pt.x - x) < 16 && y < pt.y - 12 && y > pt.y - 40)) return true;
    return T.folk.some(n => Math.abs(n.x - x) < 14 && y > n.y - 14 && y < n.y + 6);
  }
  const tx = Math.floor(x / TOWN_TILE), ty = Math.floor((y - 4) / TOWN_TILE);
  if (tx < 0 || ty < 0 || tx > 15 || ty > 9) return true;
  return TOWN_WALLS.has(`${tx},${ty}`) || TOWNSFOLK.some(n => n.tx === tx && n.ty === ty);
}

/** A portal's gate opens the hunting grounds of its region, its tab chosen. */
function openPortal(tab) {
  if (tab === 'training') return startTraining(T ? T.cls : chosenClass);
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
    for (const pt of townPortals()) if (Math.hypot(pt.x - T.x, pt.y - T.y) < (pt.r || WARP_R)) hit = () => openPortal(pt.tab);
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
  if (!T) return; // a gate taken (the training ground) leaves the town
  updateWalkers(dt);
  updateCosPet(T, T, T.cls.id, dt, (TILE / 0.24) * (T.cls.speed / 70));
  townTiger(dt);
  townWallet();
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

/** A way out of town: a gate's swirl on the floor (연's 귀문) under its name plate, the guardian
 * statue standing on its own; a door into a house or a house's way out, a smaller cool swirl. */
const DOOR_TINT = 'hue-rotate(185deg) saturate(1.3)';
const PLATE_UP = 94; // every gate's name plate at one height over the row (above the statue's head)
function drawWayOut(pt, now) {
  if (pt.art === 'statue') {
    const im = pic('ytown/statue.png');
    const fy = pt.y - 12;
    if (im && im.width) {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(pt.x, fy - 1, im.width * 0.45, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.drawImage(im, Math.round(pt.x - im.width / 2), Math.round(fy - im.height));
    }
    if (pt.sub !== undefined) portalPlate(pt.label, pt.sub, pt.x, pt.y - PLATE_UP, '#ffd27a');
    else {
      ctx.font = '8px G7';
      ctx.textAlign = 'center';
      outline(pt.label, pt.x, fy + 10, '#ffd27a');
    }
    return;
  }
  if (pt.door) {
    drawPortalFx(pt.x, pt.y, 58, DOOR_TINT, now + pt.x * 0.01, true);
    ctx.font = '8px G7';
    ctx.textAlign = 'center';
    outline(pt.label, pt.x, pt.y - 60, '#bfe6ff');
    return;
  }
  drawPortalFx(pt.x, pt.y, 84, pt.tint, now + pt.x * 0.01, true);
  portalPlate(pt.label, pt.sub, pt.x, pt.y - PLATE_UP, '#ffd27a');
}

// 연's minimap at the top right: the area small, the hero, its people and the ways out on it.
// A tap on it makes it larger or smaller.
let townMapBig = false;
function townMinimapRect() {
  const a = townArea();
  if (!a || !a.mm) return null;
  const cr = boxOf(canvas), d = canvas.width / cr.width;
  // Small by default (about a sixth of the screen's width at most); a tap shows it large.
  let k = (townMapBig ? 1.3 : 0.55) * d;
  const cap = canvas.width * (townMapBig ? 0.42 : 0.17);
  if (a.mm[0] * k > cap) k = cap / a.mm[0];
  const w = a.mm[0] * k, h = a.mm[1] * k;
  return { x: canvas.width - w - 10 * d, y: 34 * d, w, h, d };
}
function drawTownMinimap() {
  const a = townArea(), r = townMinimapRect(), im = a && pic(`ytown/mm_${T.area}.png`);
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
    for (const pt of townPortals()) dot(pt.x, pt.y, pt.tab === 'training' ? '#7aff8a' : '#ffb43a', 4 * d, pt.label);
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
  const map = pic(yt ? `ytown/${T.area}.png` : 'ui/town.png');
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
      // The statue's own gate swirl under it too (the statue itself stands among the bodies).
      for (const pt of townPortals()) if (pt.art !== 'statue') drawWayOut(pt, now);
      else if (pt.sub !== undefined) drawPortalFx(pt.x, pt.y - 6, 70, pt.tint, now, false);
      for (const d of yt.doors) {
        if (!d.pt) d.pt = { x: d.x, y: d.y + 4, label: d.label, door: true };
        drawWayOut(d.pt, now);
      }
    } else if (yt.exits[T.area]) {
      const ex = yt.exits[T.area];
      if (!ex.pt) ex.pt = { x: ex.x, y: ex.y + 4, label: '장터로', door: true };
      drawWayOut(ex.pt, now);
    }
  }
  const bodies = T.folk.map(n => ({ n, y: n.y })).concat([{ hero: true, y: T.y }], T.cpet ? [{ cpet: T.cpet, y: T.cpet.y }] : [], T.tiger ? [{ tiger: T.tiger, y: T.tiger.y }] : []);
  if (yt && T.area === 'market') {
    for (const pt of townPortals()) if (pt.art === 'statue') bodies.push({ statue: pt, y: pt.y - 12 });
    for (const w of T.walkers) bodies.push(w);
  }
  bodies.sort((a, b) => a.y - b.y);
  for (const b of bodies) {
    if (b.walker) {
      drawTownWalker(b, now);
      continue;
    }
    if (b.statue) {
      drawWayOut(b.statue, now);
      continue;
    }
    if (b.cpet) {
      drawCosPet(ctx, b.cpet);
      continue;
    }
    if (b.tiger) {
      drawPet(b.tiger);
      continue;
    }
    if (b.hero) {
      // In town too, the hero in 연's own figure, in the gear it has on.
      drawYhero2(T.cls, savedGear(T.cls), T, T.x, T.y, T.moving ? 'walk' : 'idle', 1);
      continue;
    }
    const n = b.n;
    const f = yt && n.look && yt.folk[n.look], fim = f && pic(`ytown/${n.look}.png`);
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
  if (id === 'last') {
    const st = lastHuntStage();
    if (!st) return;
    pickedStage = st;
    pickedMode = (settings.lastHunt && settings.lastHunt.mode) || 'conquer';
    if (!progress.cleared[st.id] || settings.legacyPace) pickedMode = 'conquer';
    return goHunt();
  }
  if (id === 'party') return openPartyPick();
  if (id === 'war') return War.openBoard();
  if (id === 'training') return startTraining(T ? T.cls : chosenClass);
  if (id === 'coordi') return openCoordi();
  if (id === 'raid') {
    mapTab = 'raid';
    // A raid picked, or the list would open on the map of the hardest hunting ground instead.
    if (!pickedStage || !pickedStage.raid) pickedStage = RAIDS.find(raidOpen) || RAIDS[0];
    showScreen('stages');
    return;
  }
  const n = (T && T.folk || []).find(f => f.id === id) || TOWNSFOLK.find(f => f.id === id);
  if (T) T.near = n;
  talk();
}
document.querySelectorAll('#town-quick button[data-go]').forEach(b => { b.onclick = () => townErrand(b.dataset.go); });

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
  else if (n.id === 'smith') openEquipWindow();
  else openTrade(n.id);
}

// ---------------------------------------------------------------- 수련장
//
// The town's training ground: a target that never falls, and the class's spells to try on it one
// at a time — the spell's name and what it does, its effect, the numbers of every blow over it,
// and the damage it deals (each blow, a second over the last five seconds, all of it). Built on
// the hunt itself (startRun with no cards and no crowd, G.dummy as window.__dummyBoss uses it), so
// what is seen is what the spell does on a hunt. The target is 연's 송백인형 (placeDummy):
// 연 ships no 허수아비 picture.

const TRAIN_WINDOW = 5; // seconds of the recent DPS
const TRAIN_RING = 1024;
const trainT = new Float64Array(TRAIN_RING), trainD = new Float64Array(TRAIN_RING);
const TRAIN_KIND = { slash: '근접 연타', cleave: '정면 베기', nova: '주위 공격', screen: '화면 전체', spell: '마법', spell4: '네 방향 마법', ult: '필살기', strike: '내려치기',
  line: '직선 공격', blink: '이동 공격', buff: '강화', heal: '회복', summon: '소환', aura: '오라', passive: '패시브' };

const TRAIN_MOB = 'y315505'; // 수련장's target: 연's 송백인형 (a straw-hatted doll on a stake)
function startTraining(cls) {
  chosenClass = cls;
  // The first ground's floor, at its easiest; the dummy alone on it.
  startRun(cls, { ...STAGES[0], level: 0, name: '국내성 수련장', intro: '수련장 송백인형은 쓰러지지 않고 맞서 싸우지도 않습니다. 왼쪽에서 기술을 골라 시험해 보세요.' }, true);
}

/** The class's spells for the panel: all of them (a locked one marked), the 필살기 apart. */
function trainSkills(cls) {
  return Object.entries(SKILLS).filter(([, d]) => (d.cls === cls.id || d.cls === 'all') && d.kind !== 'ult' && d.kind !== 'passive')
    .sort((a, b) => (a[1].promo || 0) - (b[1].promo || 0) || skillReq(a[1]) - skillReq(b[1])).map(([id]) => id);
}

function setupTraining() {
  const p = G.player, rec = best[G.cls.id];
  G.training = { id: null, lv: MAX_SKILL_LEVEL, auto: true, plain: false, total: 0, other: 0, n: 0, max: 0, last: 0, t0: G.t, head: 0, len: 0, shown: '' };
  G.dummy = true; // spawn() adds no one (as window.__dummyBoss)
  G.bossDue = false;
  G.pendingLevels = 0;
  G.firstCard = false;
  G.skills = [];
  // The hero at its best level (its spells' reach and the 격 grow with it).
  p.lvl = Math.max(1, rec ? rec.lvl : 1);
  p.next = xpFor(p.lvl);
  $('#speed-btn').hidden = true;
  placeDummy();
  $('#train').hidden = false;
  buildTrainPanel();
}

/** The dummy beside the hero, the hero turned to it. */
function placeDummy() {
  const p = G.player;
  for (const e of G.enemies.slice()) { G.enemies.splice(G.enemies.indexOf(e), 1); leave(e); }
  // 연 has no 허수아비 in the build (its test dummies' units were never shipped): its 송백인형, a
  // straw-hatted doll on a stake, stands in (the 장승 post was hard to make out, a 도깨비 not wanted).
  const m = monsterById[TRAIN_MOB] || Object.values(monsterById)[0];
  let at = null;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0]]) if (free(p.tx + dx, p.ty + dy)) { at = [p.tx + dx, p.ty + dy]; break; }
  if (!at) return null;
  const e = addEnemy(m, 'boss', { name: '수련장 송백인형', scale: 1.2 }, 0, at);
  if (!e) return null;
  e.hp = e.maxHp = 1e12;
  e.still = true;
  e.temper = 'normal';
  // Turned toward it, so a blow that goes ahead of the hero lands.
  const dx = at[0] - p.tx, dy = at[1] - p.ty;
  p.fdx = Math.sign(dx);
  p.fdy = dx ? 0 : Math.sign(dy);
  if (p.fdx) p.face = p.fdx;
  return e;
}

/** Each blow on the dummy (from tally): the spell's own, or another's (a 격, a summon). */
function trainHit(d, other) {
  const tr = G.training;
  if (!(d > 0)) return;
  if (other) { tr.other += d; return; }
  tr.total += d;
  tr.n++;
  tr.last = d;
  if (d > tr.max) tr.max = d;
  const i = (tr.head + tr.len) % TRAIN_RING;
  trainT[i] = G.t;
  trainD[i] = d;
  if (tr.len < TRAIN_RING) tr.len++;
  else tr.head = (tr.head + 1) % TRAIN_RING;
}

/** The meter back to nothing (and the dummy back in its place). */
function trainReset(replace = true) {
  const tr = G.training;
  tr.total = tr.other = tr.n = tr.max = tr.last = 0;
  tr.head = tr.len = 0;
  tr.t0 = G.t;
  tr.shown = '';
  tr.shownAt = -9;
  G.dealt = { all: 0, big: 0, ally: 0 };
  G.gyeokCount = {};
  // What the last spell still had on its way (its later hits, its arrows, its pictures) goes with
  // it: those blows would count for the next.
  timers.length = 0;
  G.shots.length = 0;
  G.fxs.length = 0;
  G.texts.length = 0;
  G.chainRun = null;
  if (replace) placeDummy();
  const s = G.skills[0];
  if (s) {
    s.timer = G.training.auto ? 0.15 : 1e9;
    s.readyAt = 0;
  }
}

// 수련장 can cast every spell of the class: the sheets of the last few tried are kept (TRAIN_FX_KEEP),
// the older let go (they load again if the spell is picked again), and the 필살기's after it is over.
const TRAIN_FX_KEEP = 6;
function trainFx(id) {
  const tr = G.training;
  tr.recent = (tr.recent || []).filter(x => x !== id);
  if (id) tr.recent.push(id);
  if (tr.recent.length > TRAIN_FX_KEEP) tr.recent.shift();
  const keep = new Set();
  for (const k of tr.recent) skillFxIds(k, keep);
  fxRefs(MELEE_LOOK[G.cls.id], keep);
  if (G.ultAt !== undefined && G.t - G.ultAt < 6) { try { fxRefs(ultTier(G.cls.id), keep); fxRefs(ultLook(G.cls.id), keep); } catch (e) { /* no tier */ } }
  for (const f of G.fxs) if (f.id) keep.add(f.id);
  fxKeep(keep);
  if (id) fxWarm(skillFxIds(id));
}
/** Picks the spell to try (and its 단): it alone in the hero's hands, cast at once. */
function trainPick(id, lv) {
  const tr = G.training, d = SKILLS[id];
  if (!d) return;
  tr.id = id;
  if (lv) tr.lv = lv;
  trainFx(id);
  Hunt.trainTried(G.cls.id, id); // 사냥 기믹 (P1-10): the preset for the next hunt's first card
  const level = d.evolved ? 1 : Math.max(1, Math.min(MAX_SKILL_LEVEL, tr.lv));
  G.skills = [{ id, lv: level, timer: 0 }];
  G.buffs.power = G.buffs.stealth = G.buffs.guard = G.buffs.shield = G.buffs.haste = 0;
  G.ambush = null;
  trainReset(false);
  if (!tr.auto) trainCast();
  syncTrainPanel();
}

/** Casts the spell now (the 시전 key with 자동 off): once its wait is over. */
function trainCast() {
  const s = G.skills[0];
  if (!s || G.paused) return;
  if (G.t < (s.readyAt || 0)) return;
  s.timer = 0;
  fireSkill(s, 1);
  if (!G.training.auto) { s.readyAt = G.t + (s.cdMax || 1); s.timer = 1e9; }
}

function buildTrainPanel() {
  const box = $('#train-skills');
  box.innerHTML = '';
  const tier = promoOf(G.cls.id);
  for (const id of trainSkills(G.cls)) {
    const d = SKILLS[id], b = document.createElement('button');
    b.className = 'tsk' + ((d.promo || 0) > tier ? ' locked' : '');
    b.dataset.id = id;
    b.title = d.name;
    b.append(skillIcon(id, d.fxs ? d.fxs[d.fxs.length - 1] : d.fx));
    const n = document.createElement('span');
    n.textContent = d.name;
    b.append(n);
    b.onclick = () => trainPick(id);
    box.append(b);
  }
  const lv = $('#train-lv');
  lv.innerHTML = '';
  for (let i = 1; i <= MAX_SKILL_LEVEL; i++) {
    const b = document.createElement('button');
    b.textContent = i + '단';
    b.dataset.lv = i;
    b.onclick = () => { if (G.training.id) trainPick(G.training.id, i); else { G.training.lv = i; syncTrainPanel(); } };
    lv.append(b);
  }
  $('#train-cls').textContent = `${G.cls.name} · ${tier ? tier + '차 승급' : '승급 전'} · Lv ${G.player.lvl}`;
  $('#train-meter').innerHTML = '';
  syncTrainPanel();
}

/** The chosen spell's card: its name at that 단, what it is, its numbers. */
function syncTrainPanel() {
  const tr = G.training, id = tr.id, d = id && SKILLS[id];
  for (const b of $('#train-skills').children) b.classList.toggle('on', b.dataset.id === id);
  for (const b of $('#train-lv').children) b.classList.toggle('on', +b.dataset.lv === tr.lv);
  $('#train-auto').textContent = tr.auto ? '자동 시전: 켬' : '자동 시전: 끔';
  $('#train-plain').textContent = tr.plain ? '기본 공격: 켬' : '기본 공격: 끔';
  $('#train-cast').hidden = tr.auto;
  if (!d) {
    $('#train-info').innerHTML = '<b>기술을 고르세요</b><p>송백인형에게 쓰면 이펙트와 피해 숫자가 표시됩니다. 승급 전이라 잠긴 기술도 여기서는 시험할 수 있습니다.</p>';
    return;
  }
  const s = G.skills[0], st = stats(s), tier = promoOf(G.cls.id);
  const tags = [TRAIN_KIND[d.kind] || d.kind];
  if (d.elem && ELEMENTS[d.elem]) tags.push(ELEMENTS[d.elem][0] + ' 속성');
  if (d.promo) tags.push(d.promo + '차 승급' + (d.promo > tier ? ' 필요 (잠김)' : ''));
  if (d.evolved) tags.push('완성 기술');
  const nums = [];
  if (st.dmg) nums.push(`위력 ${st.dmg.toFixed(1)}`);
  nums.push(`재사용 ${st.cd.toFixed(1)}초`);
  if (st.range) nums.push(`사거리 ${st.range}칸`);
  if (st.radius) nums.push(`범위 ${st.radius}칸`);
  if (st.count > 1 && st.dmg) nums.push(`대상 ${st.count}`);
  if (st.duration) nums.push(`지속 ${st.duration.toFixed(1)}초`);
  if (st.heal) nums.push(`회복 ${Math.round(st.heal)}`);
  const esc = t => String(t).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  $('#train-info').innerHTML = `<b>${esc(skillName(id, s.lv))}</b> <small>${d.evolved ? '' : s.lv + '단'}</small>`
    + `<em>${tags.map(esc).join(' · ')}</em><p>${esc(d.desc || '')}</p><i>${nums.join(' · ')}</i>`
    + (st.dmg ? '' : '<p class="note">피해를 주지 않는 기술: 효과만 볼 수 있습니다.</p>');
}

/** How far the view moves over for the panel at its left (world pixels; measured when it changes). */
function trainShift() {
  const el = $('#train'), w = el.hidden ? 0 : el.offsetWidth, cw = canvas.clientWidth || 1;
  const tr = G.training;
  if (tr.shiftW !== w || tr.shiftCw !== cw) { tr.shiftW = w; tr.shiftCw = cw; tr.shift = Math.round((w + 8) / 2 * VW / cw); }
  return tr.shift;
}

/** The meter, four times a second: the last blow, the recent and the whole DPS, the total. */
function trainTick() {
  const tr = G.training;
  if (G.t - (tr.shownAt === undefined ? -9 : tr.shownAt) < 0.25) return;
  tr.shownAt = G.t;
  let recent = 0;
  const from = G.t - TRAIN_WINDOW;
  for (let k = 0; k < tr.len; k++) {
    const i = (tr.head + k) % TRAIN_RING;
    if (trainT[i] >= from) recent += trainD[i];
  }
  const span = Math.max(0.5, G.t - tr.t0);
  const dps = recent / Math.min(TRAIN_WINDOW, span), avg = tr.total / span;
  const s = G.skills[0];
  const wait = s && !tr.auto ? Math.max(0, (s.readyAt || 0) - G.t) : 0;
  const html = `<div class="wide"><span>초당 피해 (최근 ${TRAIN_WINDOW}초)</span><b class="hot">${shownNum(dps)}</b></div>`
    + `<div><span>마지막</span><b>${shownNum(tr.last)}</b></div>`
    + `<div><span>최대</span><b>${shownNum(tr.max)}</b></div>`
    + `<div><span>타수</span><b>${tr.n}</b></div>`
    + `<div><span>평균 DPS</span><b>${shownNum(avg)}</b></div>`
    + `<div class="wide"><span>총 피해 (${span.toFixed(1)}초)</span><b>${shownNum(tr.total)}</b></div>`
    + (tr.other ? `<div class="wide"><span>그 외 (격·소환)</span><b>${shownNum(tr.other)}</b></div>` : '')
    + trainGyeokLine();
  if (html !== tr.shown) {
    tr.shown = html;
    $('#train-meter').innerHTML = html;
  }
  const c = $('#train-cast');
  const label = wait > 0 ? `시전 (${wait.toFixed(1)}초)` : '시전';
  if (c.textContent !== label) c.textContent = label;
}

/** Back to town from the training ground: nothing of it is kept (no record, no spoils). */
function leaveTraining() {
  const cls = G.cls;
  G = null;
  $('#train').hidden = true;
  $('#pause').hidden = true;
  enterTown(cls);
  // Back at the training ground's gate, not at the town's middle.
  const pt = townPortals().find(x => x.tab === 'training');
  if (pt && T) { T.x = pt.x; T.y = pt.y + 50; T.fdx = 0; T.fdy = -1; T.warpLock = true; }
}

$('#train-reset').onclick = () => { if (G && G.training) trainReset(); };
$('#train-auto').onclick = () => {
  if (!G || !G.training) return;
  const tr = G.training;
  tr.auto = !tr.auto;
  const s = G.skills[0];
  if (s) { s.timer = tr.auto ? 0 : 1e9; s.readyAt = 0; }
  syncTrainPanel();
};
$('#train-cast').onclick = () => { if (G && G.training) trainCast(); };
$('#train-plain').onclick = () => {
  if (!G || !G.training) return;
  G.training.plain = !G.training.plain;
  syncTrainPanel();
};
/** The 격 that went off since the reset, by name and count (skills and the plain swing both set them off). */
function trainGyeokLine() {
  const n = Object.entries(G.gyeokCount || {}).filter(([, k]) => k);
  if (!n.length) return '';
  return `<div class="wide"><span>격 발동</span><b>${n.map(([id, k]) => `${(GYEOK[id] && GYEOK[id].name) || id} ${k}회`).join(' · ')}</b></div>`;
}
$('#train-ult').onclick = () => {
  if (!G || !G.training) return;
  const run = G, out = new Set();
  try { fxRefs(ultTier(G.cls.id), out); fxRefs(ultLook(G.cls.id), out); } catch (e) { /* no tier */ }
  // Its pictures first (a second at most), so the first one is seen too.
  fxWarm(out, 1000).then(() => {
    if (G !== run || !G.training) return;
    G.player.mp = G.player.maxMp;
    G.ultAt = undefined;
    castUlt();
    // (its sheets are let go once it is over)
    setTimeout(() => { if (G === run && G.training && G.t - (G.ultAt || 0) >= 6) trainFx(null); }, 7500);
  });
};
$('#train-close').onclick = () => { if (G && G.training) leaveTraining(); };

// Test: the training ground (a class by its index), a spell picked, the meter as numbers.
window.__training = c => startTraining(CLASSES[c]);
window.__trainPick = (id, lv) => trainPick(id, lv);
window.__trainSkills = () => (G && G.training ? trainSkills(G.cls) : []);
window.__trainRead = () => {
  const tr = G && G.training;
  if (!tr) return null;
  let recent = 0;
  for (let k = 0; k < tr.len; k++) { const i = (tr.head + k) % TRAIN_RING; if (trainT[i] >= G.t - TRAIN_WINDOW) recent += trainD[i]; }
  return { id: tr.id, lv: G.skills[0] && G.skills[0].lv, n: tr.n, total: tr.total, max: tr.max, last: tr.last, other: tr.other,
    recentDps: recent / Math.min(TRAIN_WINDOW, Math.max(0.5, G.t - tr.t0)), t: G.t - tr.t0, fxs: G.fxs.length,
    dummy: G.enemies.filter(e => e.still).length, texts: G.texts.filter(t => t.num).length };
};

// ---------------------------------------------------------------- 의뢰 and 칭호
//
// The 관원 in town keeps a board of 의뢰: lasting ones that give gold and a 칭호 (shown in the
// panel's TITLE), and three of the day that send the hunter back to grounds already opened.
// Progress counts across classes, from progress.stats.

function qstats() {
  return progress.stats = Object.assign({ kills: 0, stageKills: {}, bosses: {}, clears: {}, raids: {}, endless: 0, styleA: 0 }, progress.stats);
}

const sumOf = o => Object.values(o || {}).reduce((a, b) => a + (+b || 0), 0);
/** A counter the 의뢰 read, by its key: a stats field (['kills'], ['clears', 'deer']) or a total of
 *  the save's own tallies (every clear, every raid won, 대항전, 쟁, ★, this week's 괴력난신 and 쟁). */
function statOf(key) {
  const s = qstats(), wk = gwoeWeek();
  switch (key[0]) {
    case 'clearsAll': return sumOf(s.clears);
    case 'raidsAll': return sumOf(s.raids);
    case 'war': return (progress.war || {}).played || 0;
    case 'jaeng': return (progress.bosspk || {}).total || 0;
    case 'stars': return sumOf(progress.mastery);
    case 'gwoeWeek': return progress.gwoe && progress.gwoe.week === wk ? progress.gwoe.n || 0 : 0;
    case 'jaengWeek': return progress.bosspk && progress.bosspk.week === wk ? progress.bosspk.paid || 0 : 0;
    default: return key.length > 1 ? ((s[key[0]] || {})[key[1]] || 0) : (s[key[0]] || 0);
  }
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

/** How far the save has come: the level of the hardest ground or raid won (rewards grow with it). */
function metaLevel() {
  let lv = 0;
  for (const [i, s] of STAGES.entries()) if (progress.cleared[s.id]) lv = Math.max(lv, s.level !== undefined ? s.level : i);
  for (const r of RAIDS) if ((progress.raids || {})[r.id]) lv = Math.max(lv, r.level);
  return lv;
}
// The plain materials a ground gives, cheapest first: what a 의뢰 on that ground pays besides money.
const QUEST_MATS = ['fur', 'horn', 'bone', 'ember', 'jade', 'scale', 'steel', 'gold', 'soul', 'silver1', 'kalpa', 'essence'];
function stageMat(id, lv) {
  return QUEST_MATS.find(m => MATS[m] && MATS[m].from.includes(id)) || (lv >= 12 ? 'kalpa' : lv >= 6 ? 'silver1' : 'fur');
}
/** A reward as a short line: 300전 · 레이드주화 5 · 짐승 가죽 2. */
function rewardText(r) {
  const t = [];
  if (r.gold) t.push(won(r.gold));
  if (r.coins) t.push(`레이드주화 ${r.coins}`);
  for (const [id, n] of Object.entries(r.mats || {})) if (MATS[id]) t.push(`${MATS[id].name} ${n}`);
  if (r.cos) t.push('코디 상자');
  return t.join(' · ');
}
/** Pays a reward into the save; returns what came (a costume's name when one was given). */
function payReward(r, from) {
  progress.gold = (progress.gold || 0) + (r.gold || 0);
  if (r.coins) progress.coins = (progress.coins || 0) + r.coins;
  if (r.mats) {
    progress.mats = progress.mats || {};
    for (const [id, n] of Object.entries(r.mats)) progress.mats[id] = (progress.mats[id] || 0) + n;
  }
  let cos = null;
  if (r.cos) {
    try { cos = dropCostume(r.cos, from); } catch (e) { cos = null; }
    // The costume list is not read yet (or every look is owned): coins in its place.
    if (!cos) progress.coins = (progress.coins || 0) + 40;
  }
  say(`${from}: ${rewardText(r)}${cos ? ` · [${cos}]` : ''}`, 'sys');
  return cos;
}

const QUESTS = [
  { id: 'q_novice', title: '초보 사냥꾼', text: '왕초보사냥터 정복', gold: 50, need: 1, have: s => s.clears.novice || 0 },
  { id: 'q_rat', title: '쥐잡이', text: '쥐굴의 서생원 3번 쓰러뜨리기', gold: 300, mats: { fur: 2 }, need: 3, have: s => s.bosses.rat || 0 },
  { id: 'q_snake', title: '땅꾼', text: '뱀굴에서 몬스터 500마리', gold: 400, mats: { fur: 3 }, need: 500, have: s => s.stageKills.snake || 0 },
  { id: 'q_deer', title: '사슴 사냥꾼', text: '사슴굴 3번 정복', gold: 500, mats: { fur: 4 }, need: 3, have: s => s.clears.deer || 0 },
  { id: 'q_haunt', title: '퇴마사', text: '흉가 정복', gold: 800, mats: { bone: 4 }, need: 1, have: s => s.clears.haunt || 0 },
  { id: 'q_goblin', title: '도깨비 잡이', text: '도깨비굴 정복', gold: 1000, mats: { horn: 4 }, need: 1, have: s => s.clears.goblin || 0 },
  { id: 'q_promo1', title: '승급자', text: '아무 직업이나 1차 승급', gold: 300, need: 1, have: () => Math.max(...CLASSES.map(c => promoOf(c.id))) },
  { id: 'q_promo4', title: '탈명의 경지', text: '아무 직업이나 4차 승급', gold: 3000, coins: 20, need: 4, have: () => Math.max(...CLASSES.map(c => promoOf(c.id))) },
  { id: 'q_promo7', title: '현세의 고수', text: '아무 직업이나 7차 승급', gold: 9000, coins: 50, mats: { kalpa: 5 }, need: 7, have: () => Math.max(...CLASSES.map(c => promoOf(c.id))) },
  { id: 'q_promo9', title: '천하의 지존', text: '아무 직업이나 9차 승급', gold: 20000, coins: 100, mats: { essence: 5 }, need: 9, have: () => Math.max(...CLASSES.map(c => promoOf(c.id))) },
  { id: 'q_raid1', title: '레이드 대원', text: '레이드 한 번 이기기', gold: 500, coins: 10, need: 1, have: s => sumOf(s.raids) },
  // (was '레이드 일곱 곳' while it counted every raid: the words now say the count it checks)
  { id: 'q_raid7', title: '전설의 용사', text: `레이드 ${RAIDS.length}곳 모두 이기기`, gold: 5000, coins: 100, mats: { scroll: 2 }, need: RAIDS.length, have: s => RAIDS.filter(r => s.raids[r.id]).length },
  { id: 'q_sp1', title: '빛을 본 자', text: '스페셜 아이템 1개 얻기', gold: 500, need: 1, have: () => specialsOwned() },
  { id: 'q_sp10', title: '수집가', text: '스페셜 아이템 10개 얻기', gold: 3000, coins: 30, need: 10, have: () => specialsOwned() },
  { id: 'q_kills', title: '백전노장', text: '몬스터 누적 10000마리', gold: 2000, mats: { silver1: 4 }, need: 10000, have: s => s.kills },
  { id: 'q_endless', title: '불굴', text: '정복 뒤 계속 사냥에서 10분 버티기', gold: 1500, need: 10, have: s => Math.floor(s.endless / 60) },
  // (was '네 직업 모두' — any four count, so it says so; every class is its own 의뢰 below)
  { id: 'q_allclass', title: '팔방미인', text: '아무 직업 넷 Lv 20 기록', gold: 2000, need: 4, have: () => CLASSES.filter(c => (best[c.id] || {}).lvl >= 20).length },
  { id: 'q_every', title: '만능의 협객', text: `모든 직업(${CLASSES.length}) Lv 20 기록`, gold: 8000, coins: 60, cos: [1], need: CLASSES.length, have: () => CLASSES.filter(c => (best[c.id] || {}).lvl >= 20).length },
  { id: 'q_codex', title: '장비 수집가', text: '도감 장비 절반 모으기', gold: 2000, need: 50, have: () => Math.floor(codexShare() * 100) },
  // 수집 목표: the ★ of the grounds, the 코디 owned.
  { id: 'q_star30', title: '숙련자', text: '사냥터 숙련 ★ 30개', gold: 3000, mats: { kalpa: 3 }, need: 30, have: () => sumOf(progress.mastery) },
  { id: 'q_star90', title: '사냥의 달인', text: '사냥터 숙련 ★ 90개', gold: 10000, coins: 60, need: 90, have: () => sumOf(progress.mastery) },
  { id: 'q_cos30', title: '멋쟁이', text: '코디 30벌 모으기', gold: 3000, cos: [1], need: 30, have: () => costumeOwned() },
  { id: 'q_cos120', title: '패션 리더', text: '코디 120벌 모으기', gold: 8000, cos: [2], need: 120, have: () => costumeOwned() },
  // 「쟁」 (war.js): first of the three guilds ten times, the boss's last blow ten times.
  { id: 'q_jaeng_won', title: '패왕', text: '쟁에서 문파 1위 10번', gold: 5000, coins: 50, need: 10, have: () => (progress.bosspk || {}).won || 0 },
  { id: 'q_jaeng_last', title: '막타 장인', text: '쟁에서 보스 막타 10번', gold: 5000, coins: 50, need: 10, have: () => (progress.bosspk || {}).last || 0 },
];
function costumeOwned() { return Object.keys(((progress.costume || {}).own) || {}).length; }

/** Today's three 의뢰: drawn from the grounds already open, the same all day. The third turns over
 *  among a few kinds (any ground, a raid, an A grade, a 대항전) so the board is not the same each day. */
function dailyQuests() {
  const day = new Date().toISOString().slice(0, 10);
  const d = progress.daily;
  if (d && d.day === day) return d.list;
  let seed = [...day].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0;
  const rnd = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296;
  const open = STAGES.filter((s, i) => unlocked(i));
  const pick = () => open[Math.floor(rnd() * open.length)];
  const lvl = s => (s.level !== undefined ? s.level : STAGES.indexOf(s));
  const a = pick(), b = pick(), L = metaLevel();
  const coins = Math.max(2, Math.round(L / 2));
  const third = [
    { id: 'd_any', text: '아무 사냥터에서 몬스터 800마리', gold: 500, mats: { [stageMat('', L)]: 2 }, key: ['kills'], need: 800 },
    { id: 'd_style', text: '스타일 A 이상으로 정복 2번', gold: 600, coins: coins * 2, key: ['styleA'], need: 2 },
    { id: 'd_war', text: '대항전 한 판', gold: 600, coins, mats: { kalpa: 1 }, key: ['war'], need: 1 },
  ];
  if (RAIDS.some(raidOpen)) third.push({ id: 'd_raid', text: '레이드 한 번 이기기', gold: 800, coins: coins * 3, key: ['raidsAll'], need: 1 });
  const list = [
    { id: 'd_kill', text: `${a.name}에서 몬스터 300마리`, gold: 300 + 60 * lvl(a), mats: { [stageMat(a.id, lvl(a))]: 2 }, key: ['stageKills', a.id], need: 300 },
    { id: 'd_clear', text: `${josa(b.name, '을', '를')} 정복`, gold: 400 + 80 * lvl(b), coins, mats: { [stageMat(b.id, lvl(b))]: 3 }, key: ['clears', b.id], need: 1 },
    third[Math.floor(rnd() * third.length)],
  ].map(q => ({ ...q, base: statOf(q.key) }));
  progress.daily = { day, list, claimed: [] };
  saveJson('bs_progress', progress);
  return list;
}

function dailyHave(q) {
  return (q.abs ? statOf(q.key) : statOf(q.key) - (q.base || 0));
}

// 주간 의뢰 (from Monday, as the 괴력난신 and the 쟁): five of them; all five claimed open the week's
// chest (주간 상자: 레이드주화, 겁화의 파편·조화의 정수, a 희귀 코디).
const WEEKLY_CHEST = L => ({ coins: 40 + 4 * L, mats: L >= 12 ? { kalpa: 4, essence: 2 } : { silver1: 4, kalpa: 2 }, gold: 2000 + 200 * L, cos: [1] });
function weeklyQuests() {
  const week = gwoeWeek();
  const w = progress.weekly;
  if (w && w.week === week) return w.list;
  const L = metaLevel(), raid = RAIDS.some(raidOpen);
  const list = [
    { id: 'w_kill', text: '몬스터 5000마리', gold: 1500 + 100 * L, mats: { [stageMat('', L)]: 4 }, key: ['kills'], need: 5000 },
    { id: 'w_clear', text: '사냥터 정복·소탕 8번', gold: 1500 + 100 * L, coins: 10, key: ['clearsAll'], need: 8 },
    { id: 'w_style', text: '스타일 A 이상으로 정복 5번', gold: 1200, coins: 15, key: ['styleA'], need: 5 },
    raid ? { id: 'w_raid', text: '레이드 3번 이기기', gold: 2000, coins: 30, mats: { scroll: 1 }, key: ['raidsAll'], need: 3 }
      : { id: 'w_war', text: '대항전 3판', gold: 2000, coins: 15, mats: { kalpa: 2 }, key: ['war'], need: 3 },
    L >= 13 ? { id: 'w_gwoe', text: '괴력난신 3번 (이번 주 괴수)', gold: 2000, coins: 30, key: ['gwoeWeek'], need: 3, abs: true }
      : { id: 'w_jaeng', text: '쟁 3번', gold: 2000, coins: 20, key: ['jaengWeek'], need: 3, abs: true },
  ].map(q => ({ ...q, base: q.abs ? 0 : statOf(q.key) }));
  progress.weekly = { week, list, claimed: [], chest: false };
  saveJson('bs_progress', progress);
  return list;
}

/** 의뢰 ready to be claimed (the town's line and the 의뢰 key say how many). */
function claimable() {
  const s = qstats(), done = progress.quests || {};
  let n = 0;
  for (const q of dailyQuests()) if (!progress.daily.claimed.includes(q.id) && dailyHave(q) >= q.need) n++;
  for (const q of weeklyQuests()) if (!progress.weekly.claimed.includes(q.id) && dailyHave(q) >= q.need) n++;
  if (progress.weekly.list.every(q => progress.weekly.claimed.includes(q.id)) && !progress.weekly.chest) n++;
  for (const q of QUESTS) if (!done[q.id] && q.have(s) >= q.need) n++;
  return n;
}

/** The chosen 칭호, or the one the conquests give. */
function heroTitle(cleared) {
  return progress.title || TITLES[Math.min(TITLES.length - 1, Math.floor(cleared / 3))];
}

function openQuests() {
  const box = $('#trade-rows'), s = qstats();
  const keep = box.scrollTop;
  box.innerHTML = '';
  $('#trade-title').textContent = '관원 · 의뢰';
  $('#trade-gold').textContent = `소지금 ${won(progress.gold || 0)} · 레이드주화 ${progress.coins || 0}`;
  const done = progress.quests = progress.quests || {};
  const row = (name, desc, label, can, act, cls = '') => {
    const r = document.createElement('div');
    r.className = 'trade-row' + (cls ? ' ' + cls : '');
    r.innerHTML = `<div><b>${name}</b><span>${desc}</span></div>`;
    const b = document.createElement('button');
    b.className = 'btn';
    b.textContent = label;
    b.disabled = !can;
    b.onclick = () => { act(); saveJson('bs_progress', progress); $('#town-gold').innerHTML = walletHTML(progress.gold, progress.coins); audio.play('chest'); openQuests(); syncTownGoal(); };
    r.append(b);
    box.append(r);
  };
  const head = text => { const h = document.createElement('h4'); h.textContent = text; h.style.margin = '6px 0 2px'; box.append(h); };
  const bar = (have, need) => `<i class="qbar"><i style="width:${Math.round(100 * Math.min(1, have / need))}%"></i></i>${have}/${need}`;
  head('오늘의 의뢰 (매일 갱신)');
  const daily = dailyQuests();
  for (const q of daily) {
    const have = Math.max(0, Math.min(q.need, dailyHave(q))), got = progress.daily.claimed.includes(q.id);
    row(q.text, `${bar(have, q.need)} · ${rewardText(q)}`, got ? '완료' : '받기', !got && have >= q.need, () => {
      progress.daily.claimed.push(q.id);
      payReward(q, '오늘의 의뢰');
    }, !got && have >= q.need ? 'ready' : '');
  }
  const weekly = weeklyQuests(), W = progress.weekly;
  const wDone = weekly.filter(q => W.claimed.includes(q.id)).length;
  head(`이번 주 의뢰 ${wDone}/${weekly.length} (월요일 갱신)`);
  for (const q of weekly) {
    const have = Math.max(0, Math.min(q.need, dailyHave(q))), got = W.claimed.includes(q.id);
    row(q.text, `${bar(have, q.need)} · ${rewardText(q)}`, got ? '완료' : '받기', !got && have >= q.need, () => {
      W.claimed.push(q.id);
      payReward(q, '이번 주 의뢰');
    }, !got && have >= q.need ? 'ready' : '');
  }
  const chest = WEEKLY_CHEST(metaLevel()), all = wDone >= weekly.length;
  row('주간 상자', `이번 주 의뢰를 모두 완료하면 · ${rewardText(chest)}`, W.chest ? '완료' : '열기', all && !W.chest, () => {
    W.chest = true;
    payReward(chest, '주간 상자');
    banner('주간 상자를 열었습니다!');
  }, all && !W.chest ? 'ready chest' : 'chest');
  head('의뢰 · 칭호');
  // Ready ones first, then the nearest to done; those claimed last.
  const order = QUESTS.map(q => ({ q, have: Math.min(q.need, q.have(s)), got: !!done[q.id] }))
    .sort((a, b) => (a.got - b.got) || ((b.have >= b.q.need) - (a.have >= a.q.need)) || (b.have / b.q.need - a.have / a.q.need));
  for (const { q, have, got } of order) {
    row(`${q.text}`, `${bar(have, q.need)} · ${rewardText(q)} · 칭호 「${q.title}」`, got ? '완료' : '받기', !got && have >= q.need, () => {
      done[q.id] = true;
      payReward(q, `의뢰 「${q.title}」`);
    }, !got && have >= q.need ? 'ready' : '');
  }
  head('칭호 고르기');
  const titles = QUESTS.filter(q => done[q.id]).map(q => q.title);
  if (!titles.length) row('보유한 칭호가 없습니다', '의뢰를 완료하고 보상을 받으면 칭호를 얻습니다', '-', false, () => {});
  for (const t of titles)
    row(`「${t}」`, progress.title === t ? '사용 중인 칭호' : '상태창 TITLE에 표시됩니다', progress.title === t ? '사용 중' : '사용', progress.title !== t, () => {
      progress.title = t;
    });
  $('#trade').hidden = false;
  box.scrollTop = keep;
}

// ---------------------------------------------------------------- 다음 목표
//
// One line at the top of the town: the nearest thing that makes the hero stronger — a 의뢰 to claim,
// the next 승급's ground, the next raid's gate, the next 조합 — and a tap goes there.

/** The next goal for a class: { text, go } (go: an errand for townErrand, or a stage to open). */
function nextGoal(cls, noClaim = false) {
  const n = noClaim ? 0 : claimable();
  if (n) return { text: `의뢰 보상 ${n}개를 받을 수 있습니다 — 관원에게`, go: 'clerk', hot: true };
  // The next 승급: its ground, or the ground that opens it.
  const pr = promoOf(cls.id), promos = PROMOS[cls.id] || [];
  if (pr < promos.length) {
    const at = promos[pr].at, i = STAGES.findIndex(s => s.id === at), st = STAGES[i];
    const spells = Object.values(SKILLS).filter(d => d.cls === cls.id && d.promo === pr + 1 && !d.evolved).map(d => d.name).slice(0, 2);
    const what = spells.length ? ` · ${spells.join('·')}` : '';
    if (st && unlocked(i)) return { text: `다음 승급 ${pr + 1}차: ${josa(st.name, '을', '를')} ${cls.name}로 정복${what}`, stage: st };
    // Walk back to the first ground not yet open on its way.
    let j = i;
    while (j > 0 && !unlocked(j)) {
      const s = STAGES[j], k = s.open ? STAGES.findIndex(x => x.id === s.open) : j - 1;
      if (k < 0 || k === j) break;
      j = k;
    }
    if (st && j >= 0 && unlocked(j)) return { text: `다음 승급 ${pr + 1}차 (${st.name}) — 먼저 ${josa(STAGES[j].name, '을', '를')} 정복`, stage: STAGES[j] };
  }
  // The next raid: the first not won, open or the gate it waits on.
  const raid = RAIDS.find(r => !r.gwoe && !(progress.raids || {})[r.id]);
  if (raid && raidOpen(raid)) return { text: `레이드 도전: ${raid.name} (Lv ${raid.level}) — 이기면 세트 장비·레이드주화`, go: 'raid' };
  // The 조합 nearest to done among the pieces this class lacks (its gate open).
  const c = nextCraft(cls);
  if (c) return { text: `다음 조합: ${c.name} — ${c.need}`, go: 'smith' };
  if (raid) {
    const gate = STAGES.find(x => x.id === raid.open);
    return { text: `다음 레이드 ${raid.name}: ${gate && !progress.cleared[gate.id] ? `${josa(gate.name, '을', '를')} 정복하면 열림` : raidLock(raid)}`, stage: gate && !progress.cleared[gate.id] ? gate : null, go: 'raid' };
  }
  const W = progress.weekly, wk = weeklyQuests();
  const left = wk.filter(q => !W.claimed.includes(q.id)).length;
  if (left) return { text: `이번 주 의뢰 ${wk.length - left}/${wk.length} — 모두 완료하면 주간 상자`, go: 'clerk' };
  return { text: '용무기·사신수 강화로 더 강해지기 — 대장장이에게', go: 'smith' };
}
/** The 조합 recipe this class lacks that is nearest to done, as { name, need }. */
function nextCraft(cls) {
  const b = bag(cls), mats = progress.mats || {};
  let bestC = null, bestK = -1;
  for (const c of CRAFTS) {
    if (c.only && !c.only.includes(cls.id)) continue;
    if (c.kind === 'shield' && !hasShield(cls.id)) continue;
    if (b.includes('sp:' + c.id) || (c.from && !b.includes('sp:' + c.from)) || !needsMet(c.needs, progress)) continue;
    // Only a recipe whose materials the grounds won so far can give.
    if (!Object.keys(c.mats).every(id => MATS[id] && MATS[id].from.some(f => progress.cleared[f] || (progress.raids || {})[f]))) continue;
    const all = Object.values(c.mats).reduce((a, n) => a + n, 0);
    const have = Object.entries(c.mats).reduce((a, [id, n]) => a + Math.min(n, mats[id] || 0), 0);
    const k = have / all;
    if (k > bestK) { bestK = k; bestC = c; }
  }
  if (!bestC) return null;
  const sp = SPECIAL[bestC.id];
  const lack = Object.entries(bestC.mats).map(([id, n]) => `${MATS[id].name} ${Math.min(n, mats[id] || 0)}/${n}`).join(' · ');
  return { name: sp ? specialName(sp, cls.id) : bestC.id, need: bestK >= 1 ? `재료가 모였습니다! (${won(bestC.gold)})` : lack };
}
let townGoal = null;
function syncTownGoal() {
  const b = $('#town-goal');
  if (!b || !T) return;
  try { townGoal = nextGoal(T.cls); } catch (e) { console.error(e); townGoal = null; }
  b.hidden = !townGoal;
  if (!townGoal) return;
  b.innerHTML = `<small>다음 목표</small> ${townGoal.text}`;
  b.classList.toggle('hot', !!townGoal.hot);
  const k = $('#town-quick button[data-go="clerk"]'), n = claimable();
  if (k) { k.textContent = n ? `의뢰 (${n})` : '의뢰'; k.classList.toggle('hot', !!n); }
}
function goTownGoal() {
  const g = townGoal;
  if (!g) return;
  if (g.stage) {
    pickedStage = g.stage;
    mapTab = g.stage.map || mapTab;
    showScreen('stages');
    return;
  }
  townErrand(g.go);
}

// ---------------------------------------------------------------- what a hunt moved
//
// A hunt's start keeps a snapshot of the purse, the materials, the 코디 and every 의뢰's count; the
// results compare against it to say what the hunt gave and which 의뢰 it moved.

function metaSnap() {
  const q = {};
  try {
    for (const x of dailyQuests().concat(weeklyQuests())) q[x.id] = dailyHave(x);
  } catch (e) { /* the board can wait */ }
  return { gold: progress.gold || 0, coins: progress.coins || 0, mats: Object.assign({}, progress.mats), cos: costumeOwned(), q };
}
/** What the hunt moved: coins, materials by name (×n), 코디 found, 의뢰 lines. */
function metaDiff(s) {
  if (!s) return null;
  const mats = [];
  for (const [id, n] of Object.entries(progress.mats || {})) {
    const d = n - (s.mats[id] || 0);
    if (d > 0 && MATS[id]) mats.push({ id, n: d });
  }
  const quests = [];
  for (const x of dailyQuests().concat(weeklyQuests())) {
    const now = Math.min(x.need, dailyHave(x)), was = Math.min(x.need, s.q[x.id] || 0);
    const claimed = (progress.daily.claimed || []).includes(x.id) || (progress.weekly.claimed || []).includes(x.id);
    if (now > was && !claimed) quests.push({ text: x.text, now, need: x.need, done: now >= x.need, week: x.id.startsWith('w_') });
  }
  return { coins: (progress.coins || 0) - s.coins, mats, cos: costumeOwned() - s.cos, quests };
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

// The merchant's materials (openTrade): the first one's price, up 30% a piece; MAT_BUYS of each
// between hunts (showResults restocks). Rare ones (여의주, 은나무 가지, 고문서, 성물) are not sold.
const MAT_PRICE = { fur: 1500, horn: 1500, bone: 1500, ember: 1500, jade: 2000, scale: 4000, silver1: 3000,
  kalpa: 4000, gold: 5000, steel: 5000, soul: 5000, essence: 6000, silver2: 8000 };
const MAT_BUYS = 5;
function openTrade(who) {
  const cls = chosenClass, box = $('#trade-rows');
  box.innerHTML = '';
  $('#trade-title').textContent = who === 'inn' ? '주모 · 단련' : '상인 · 장비';
  $('#trade-gold').textContent = `소지금 ${won(progress.gold || 0)}`;
  const row = (name, desc, cost, done, buy) => {
    const r = document.createElement('div');
    r.className = 'trade-row';
    r.innerHTML = `<div><b>${name}</b><span>${desc}</span></div>`;
    const b = document.createElement('button');
    b.className = 'btn';
    b.textContent = done ? (typeof done === 'string' ? done : '습득 완료') : `${won(cost)}`;
    b.disabled = done || (progress.gold || 0) < cost;
    b.onclick = () => {
      progress.gold -= cost;
      buy();
      saveJson('bs_progress', progress);
      $('#town-gold').innerHTML = walletHTML(progress.gold, progress.coins);
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
    // The first piece of each kind the bag lacks, priced by its tier: only the hunting grounds'
    // pieces (plainList). It used to walk the whole line, so the 용무기 (10등급, made from 15 비늘 and
    // a 여의주) sold for 9000전 and a raid's 11등급 방패 for 250전.
    const b = bag(cls);
    for (const kind of ['weapon', 'armor', 'shield', 'helmet', 'cape']) {
      if (kind === 'shield' && !hasShield(cls.id)) continue;
      const tier = plainList(cls.id, kind).find(i => !b.includes(`${kind}:${i}`));
      if (tier === undefined) continue;
      row(gearName(cls.id, kind, tier), `${{ weapon: '무기', armor: '갑옷', shield: '방패', helmet: '투구', cape: '망토' }[kind]} · ${tier + 1}단계`,
        250 * (tier + 1) * (tier + 1), false, () => b.push(`${kind}:${tier}`));
    }
    // 재료: where gold goes late (a hunt there brings 30-60k전 and nothing was left to buy). Only
    // what a ground or raid already cleared drops, a few of each between hunts, dearer each time.
    const mats = progress.mats || {}, bought = progress.tradeBuys || {};
    for (const [id, base] of Object.entries(MAT_PRICE)) {
      // 금린 only once a ground of 8등급 or more that drops it is cleared (rollMats: the early raids give one now and then).
      const lvOf = f => { const st = STAGES.find(x => x.id === f) || RAIDS.find(x => x.id === f); return st ? (st.level ?? STAGES.indexOf(st)) : 0; };
      if (!QUERY.has('all') && !MATS[id].from.some(f => progress.cleared[f] && (id !== 'gold' || lvOf(f) >= 8))) continue;
      const n = bought[id] || 0, cost = Math.round(base * Math.pow(1.3, n) / 100) * 100;
      row(`${MATS[id].name} (${mats[id] || 0})`, n >= MAT_BUYS ? '다음 사냥 뒤에 다시 들여오오' : `재료 · 이번 물량 ${MAT_BUYS - n}개 남음`, cost, n >= MAT_BUYS && '품절', () => {
        mats[id] = (mats[id] || 0) + 1;
        progress.mats = mats;
        bought[id] = n + 1;
        progress.tradeBuys = bought;
      });
    }
    if (!box.children.length) box.textContent = '더 팔 물건이 없소.';
  }
  $('#trade').hidden = false;
}

$('#talk').onclick = talk;
$('#close-trade').onclick = () => { $('#trade').hidden = true; syncTownGoal(); };
$('#town-goal').onclick = () => goTownGoal();
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
  celestial: { names: ['천랑', '재천', '삼족오'], role: '번개와 불꽃을 떨구고 적 사이로 뛰어든다' },
  dokkaebi: { names: ['두억시니', '어둑시니', '뚝딱이'], role: '방망이로 앞을 막고 일격필살로 내리찍는다' },
  reaper: { names: ['강림', '월직', '일직'], role: '백도로 파고들어 거둔다' },
};

/** 동료 모드's own companions: the player's other classes that have been played (a record). */
function ownCompanions() {
  return CLASSES.map(c => c.id).filter(id => id !== G.cls.id && PARTY[id] && (best[id] || promoOf(id) > 0));
}
/** 동료 성장: an own companion's level is its record's (best[id].lvl, with best[id].xp the exp into the
 *  next level), the same record the hero's hunts write, so the class cards, raids and quests read it too.
 *  Joining a hunt it starts at 60% of the record (and at least 1 + 2 per 승급), never more than two levels
 *  past the hero at that moment; then it shares 60% of the hero's exp, never passing 80% of the hero's level (compCap).
 *  The effect (HP, spell power) still reads m.lv, which stays 1..6 (1 + level/6, as before). */
const COMP_START = 0.6, COMP_SHARE = 0.6;
const compCap = lv => Math.max(3, Math.floor(lv * 0.8));
function companionStart(id, heroLv) {
  const rec = best[id];
  return Math.max(1, Math.min(heroLv + 2, Math.max(Math.floor((rec ? rec.lvl : 1) * COMP_START), 1 + 2 * promoOf(id))));
}
/** "Lv 12 · 2차 승급": a class's level as a companion and its 승급 (the 동료 설정 cards, the party panel). */
function companionLabel(id) {
  const rec = best[id], pr = promoOf(id);
  return `${rec ? `Lv ${rec.lvl}` : '기록 없음'}${pr ? ` · ${pr}차 승급` : ''}`;
}
/** The hero gained exp: each own companion takes its share and levels up (a bubble and a line). */
function shareCompanionXp(v) {
  const p = G.player;
  for (const m of G.party || []) {
    if (!m.own) continue;
    m.xp = (m.xp || 0) + v * COMP_SHARE;
    while (m.cl < compCap(p.lvl) && m.xp >= xpFor(m.cl)) {
      m.xp -= xpFor(m.cl);
      m.cl++;
      m.bubble = { text: `Lv ${m.cl}!`, t: G.t };
      say(`${m.name} Lv ${m.cl}!`, 'party');
    }
    if (m.cl >= compCap(p.lvl)) m.xp = Math.min(m.xp, xpFor(m.cl) - 1);
  }
}
/** The hunt's end (clear or fail): each own companion's level goes into its class's record, once; the
 *  results screen lists what grew. Idempotent (record() runs on every way a hunt ends). */
function recordCompanions() {
  if (G.war || G.training) return;
  const grew = G.compGrowth = G.compGrowth || {};
  for (const m of G.party || []) {
    if (!m.own || !m.cl) continue;
    const id = m.cls.id, r = best[id];
    const g = grew[id] = grew[id] || { name: m.name, from: r ? r.lvl : 0, was: m.promo || 0 };
    if (!r || m.cl > r.lvl) best[id] = { lvl: m.cl, kills: r ? r.kills : Math.round(G.kills * 0.5), xp: Math.round(m.xp) };
    else if (m.cl === r.lvl) r.xp = Math.max(r.xp || 0, Math.round(m.xp));
    g.to = best[id].lvl;
  }
  saveJson('bs_best', best);
}
/** The results line: '동료 성장: 내 전사 Lv 9→12, 내 궁사 Lv 4→7 · 2차 승급'. */
function companionSummary() {
  const rows = Object.entries(G.compGrowth || {}).map(([id, g]) => {
    const pr = promoOf(id);
    const t = [g.to > g.from ? `${g.name} Lv ${g.from || 1}→${g.to}` : `${g.name} Lv ${g.to}`];
    if (pr > g.was) t.push(`${pr}차 승급`);
    return t.join(' · ');
  });
  return rows.length ? `<br><b class="promo">동료 성장: ${rows.join(', ')}</b>` : '';
}
/** Who joins this hunt, in order: the 동료 설정's picks, then classes at random (once a hunt). */
function partyOrder() {
  if (G.partyOrder) return G.partyOrder;
  const picks = (settings.partyPick || []).filter(id => id !== G.cls.id && PARTY[id]);
  const rest = CLASSES.map(c => c.id).filter(id => id !== G.cls.id && PARTY[id] && !picks.includes(id));
  for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
  return (G.partyOrder = picks.concat(rest));
}

function joinParty(cls) {
  const p = G.player;
  const def = PARTY[cls.id];
  // Mine: a class picked in 동료 설정, or one played before; it shares the conquest (promote).
  const own = (settings.partyPick || []).includes(cls.id) || ownCompanions().includes(cls.id), promo = own ? promoOf(cls.id) : 0;
  const name = own ? `내 ${cls.name}` : def.names[Math.floor(Math.random() * def.names.length)];
  if (own) companionWearBest(cls);
  const gear = savedGear(cls);
  const slot = G.party.length;
  const m = {
    cls, name, lv: 1, cl: 1, xp: 0, gear, own, promo, baseLv: own ? Math.min(6, 1 + Math.floor(promo / 2)) : 0,
    // Walks in from the edge of the view, as another player would.
    x: p.x + (slot % 2 ? 1 : -1) * 220, y: p.y + 30, fdx: 0, fdy: 1, moving: false, walkT: 0, pose: null, poseT: 0,
    cd: { a: 1, b: 3, c: 6, d: 9, r: 0, e: 5, g: 0 }, bubble: null, slot, hp: 1, maxHp: 1, down: 0, flash: 0,
  };
  m.maxHp = memberMaxHp(m);
  m.hp = m.maxHp;
  m.tx = Math.floor(m.x / TILE);
  m.ty = Math.floor((m.y - TILE / 2 + 6) / TILE);
  [m.tx, m.ty] = arenaNear([m.tx, m.ty]);
  m.x = m.tx * TILE + TILE / 2;
  m.y = m.ty * TILE + TILE - 6;
  m.lv = Math.max(1, m.baseLv);
  if (own) {
    m.cl = companionStart(cls.id, p.lvl);
    const rec = best[cls.id];
    if (rec && rec.xp && m.cl === rec.lvl) m.xp = Math.min(rec.xp, xpFor(m.cl) - 1);
    m.lv = Math.max(m.baseLv, Math.min(6, 1 + Math.floor(m.cl / 6)));
  }
  m.maxHp = memberMaxHp(m);
  m.hp = m.maxHp;
  G.party.push(m);
  say(own ? `${name}(Lv ${m.cl})${promo ? `(${promo}차 승급)` : ''}이(가) 함께합니다. 이 사냥터를 깨면 ${cls.name}의 기록에도 남습니다.`
    : `${josa(name, '이', '가')} 파티에 들어왔습니다. (${cls.name})`, 'party');
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
function hurtMember(m, dmg, from = null) {
  if (m.war) return War.hurt(m, dmg, from); // 공대 (war.js): a raider's own life, guards and fall
  if (m.down || G.dead || m.hidden > G.t) return;
  if (G.buffs.shield > G.t) dmg /= 2;
  if (G.buffs.guard > G.t) return;
  dmg *= 1 - shellWard(m); // inside the hero's 현무 shell
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
  if (G.war && m.war) n = Math.min(m.maxHp * 0.12, n * G.war.refHp / G.player.maxHp); // 대항전: a fighter's life is in the field's units
  n = Math.min(n, m.maxHp - m.hp);
  if (n <= 0) return;
  m.hp += n;
  if (G.war) War.healed(m, n);
  healText(m, n, 58);
  if (fx) fxOnBody(fx, m, -26, { scale: 0.8 });
}

/**
 * Who a heal should go to: the hero below 80% (85% in a raid) first, else the companion lowest
 * below 60% (75%). Nobody when all are well enough, so the heal is ready when it is needed.
 */
function neediest() {
  if (G.war) return War.neediest();
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
    if (cls === 'warrior' || cls === 'lancer' || cls === 'dokkaebi') at = ax ? [foe.tx + ax, foe.ty] : [foe.tx, foe.ty + ay];
    else if (cls === 'rogue' || cls === 'monk' || cls === 'celestial' || cls === 'reaper') at = ax ? [foe.tx - ax, foe.ty] : [foe.tx, foe.ty - ay];
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
  return arenaNear(at);
}

/** 사냥 기믹: on a ground fought on 연's own map, the open tile the hero can walk to nearest a spot
 *  (a companion's place, where it walks in from): never on a cliff, in the void or past the edge. */
function arenaNear(at) {
  if (!G.arena || Hunt.reach(at[0], at[1])) return at;
  for (let r = 1; r <= 6; r++)
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++)
      if (Math.max(Math.abs(dx), Math.abs(dy)) === r && Hunt.reach(at[0] + dx, at[1] + dy)) return [at[0] + dx, at[1] + dy];
  return [G.player.tx, G.player.ty];
}

function updateParty(dt) {
  if (G.war) return War.update(dt); // 대항전: both guilds are war.js's
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
    const lv = Math.max(m.baseLv || 0, Math.min(6, 1 + Math.floor((m.own ? m.cl : p.lvl) / 6)));
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
    // What each companion did, for the results (처치 and its share of the damage).
    const k0 = G.kills, d0 = G.dealt ? G.dealt.ally || 0 : 0;
    G.allyHitting = true;
    partyAct(m);
    G.allyHitting = false;
    if (G.kills > k0 || (G.dealt && (G.dealt.ally || 0) > d0)) {
      const dd = m.deeds = m.deeds || {};
      dd.kills = (dd.kills || 0) + G.kills - k0;
      dd.dmg = (dd.dmg || 0) + (G.dealt.ally || 0) - d0;
    }
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
    let way = null;
    if (ddx || ddy) {
      const a = [Math.sign(ddx), 0], b = [0, Math.sign(ddy)];
      way = Math.abs(ddx) >= Math.abs(ddy) ? [a, b] : [b, a];
      // 사냥 기믹: the map's walls hold the companions too: the other way round, else round the wall
      // by the monsters' road to the hero.
      if (G.arena) {
        way = way.filter(([x, y]) => (x || y) && Hunt.open(m.tx + x, m.ty + y));
        if (!way.length) way = Hunt.flowDirs(m, p.tx, p.ty) || [];
      }
      way = way[0];
    }
    if (way) {
      const [sx, sy] = way;
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
/** What flies between bodies is the game's own spell picture, small, by the colour it was given.
 * Green (#58e868, 누리의 기원's moon 3) and gold (#ffe680, 신령의기원's ring 131) are 기원 and 부활
 * flying to an ally: a shot at a foe is given its own picture (fx) — a war 궁사's shot was gold, a
 * 신령의기원 at every foe. Nothing given falls back to a plain spark, not a 기원. */
const SHOT_FX = { '#c02838': '148', '#ffe680': '131', '#58e868': '3', '#9a68ff': '98', '#5aa8ff': '96', '#ff8a20': '40', '#b040d0': '98' };
function drawShots() {
  for (const sh of G.shots) {
    const id = sh.fx || SHOT_FX[sh.color] || '40';
    if (!M.fx[id]) continue;
    drawFx(id, sh.x, sh.y, sh.t, 0.45, 0, 'center', true);
  }
}

// ---------------------------------------------------------------- style: today's 바람 over the old art
// The old pictures stay as they were; on them, the staging of today's game: a cut-in for the
// boss: letterbox bars and a name plate, souls streaming to the hero, motes in the air of each
// ground, light when a spell is cast.

/** The glow of a class's flying spells: [halo, core]. */
const CLASS_GLOW = { warrior: ['#6fb8ff', '#e8f4ff'], rogue: ['#c9b2ff', '#f4eeff'], mage: ['#ff8a3a', '#fff0c0'], poet: ['#ffd84a', '#fffbe0'], archer: ['#9adf6a', '#f0ffe0'], lancer: ['#7fd0ff', '#eaf8ff'], monk: ['#ffb35a', '#fff1d8'], magus: ['#c27bff', '#f6e8ff'], celestial: ['#ffe06a', '#fffbe8'], dokkaebi: ['#ff6a4a', '#ffe8d8'], reaper: ['#8fb4ff', '#eef3ff'] };

/** The effect picture of a spell at its 단: a second name for the same frames, 6% larger a step. */
function grownFx(id, lv) {
  if (!id || !M.fx[id]) return id;
  lv = Math.max(1, lv || 1);
  const key = id + '@' + lv;
  if (!M.fx[key]) {
    // 연's spells are drawn large over the field: a quarter larger to begin, 6% more a 단.
    const f = M.fx[id];
    // (보이는 범위 = 맞는 범위, 사용자 규칙: no longer drawn larger a 단 — 4% a step, 8단 a third larger than what it
    // strikes; a spell's area grows only with what it strikes, st.radius, and its picture is fitted to that)
    M.fx[key] = { ...f, src: f.src || id };
  }
  return key;
}

function updateStyle(dt) {}


/** The spells in hand, as 연's skill row: each icon in a frame of its 승급 tier, the time
 * to its next cast sweeping round it, its 단 in the corner. Bottom left, above the chat. */
const iconCache = {};
function skillIconImage(id) {
  let path = iconCache[id];
  if (path === undefined) {
    const def = SKILLS[id], fx = def.fxs ? def.fxs[def.fxs.length - 1] : def.fx;
    if (M.skillicon && M.skillicon.includes(id)) path = `skillicon/${id}.png`;
    // A plain weapon strike (이중공격) has no spell picture: its slot shows the weapon itself.
    else if (!fx && def.kind === 'slash') path = 'weapon';
    // (hit sparks, the level-up burst and the like have no icon of their own)
    else path = !fx || !M.fx[fx] || /^(new_|h_|g_)/.test(fx) ? null : `icon/${fx}.png`;
    iconCache[id] = path;
  }
  if (path === 'weapon') return G ? gearImage({ kind: 'weapon', tier: 1 }) || null : null;
  // (each loaded when its spell is first in hand, and let go with the run: leaveScreen)
  return path ? pic(path) : null;
}
/**
 * The spells' bar (2차 피드백: three rows of big slots hid too much of the field). 연: two rows of
 * six small slots at the bottom right, ending left of the 보조 기술 / 필살기 and level with their
 * foot; a thin frame on a see-through ground, the slots that are ready a little faded (the bar
 * stands out only while it counts down). 설정 「기술 창: 보통 / 작게」 (30 / 24 points a slot, a
 * little larger on a tall screen). The carved-panel layout: one row at the bottom left.
 */
function drawSkillBar() {
  if (!G.skills.length || G.dead || !$('#over').hidden) return;
  const W = canvas.width, cr = boxOf(canvas), d = canvas.width / cr.width;
  const yeon = document.body.classList.contains('yeon');
  const small = settings.barSize === 'small';
  const tall = Math.max(1, Math.min(1.15, cr.height / 412));
  const sz = Math.round((small ? 24 : 30) * tall * d), gap = Math.round(3 * d), cols = yeon ? 6 : MAX_SKILLS;
  const list = G.skills.slice(0, MAX_SKILLS), rows = Math.ceil(list.length / cols);
  let x0, yBot;
  if (yeon) {
    // Left of the keys' grid and the 보조 기술 (it stands outside the grid, at the 필살기's left).
    const kr = $('#keys') ? boxOf($('#keys')) : null;
    const ub = $('#util-btn') && !$('#util-btn').hidden ? boxOf($('#util-btn')) : null;
    const ult = $('#ult') ? boxOf($('#ult')) : null;
    const keyLeft = Math.min(kr && kr.width ? kr.left : Infinity, ub && ub.width ? ub.left : Infinity, ult && ult.width ? ult.left : Infinity);
    const right = keyLeft < Infinity ? (keyLeft - cr.left - 8) * d : W - 130 * d;
    x0 = Math.round(right - cols * sz - (cols - 1) * gap);
    // level with the foot of the 필살기 (lifted with it over the 대항전's bottom bar)
    yBot = ult && ult.height ? Math.round((ult.bottom - cr.top) * d) : canvas.height - 8 * d;
  } else {
    const dl = $('#chat') && boxOf($('#chat'));
    const H = dl && dl.top > cr.top ? Math.min(canvas.height, (dl.top - cr.top) * d) : canvas.height;
    x0 = Math.round(10 * d);
    yBot = Math.round(H - 6 * d);
  }
  const y0 = yBot - rows * sz - (rows - 1) * gap;
  ctx.save();
  // a see-through ground under the whole bar
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(x0 - 2 * d, y0 - 2 * d, Math.min(cols, list.length) * (sz + gap) - gap + 4 * d, rows * (sz + gap) - gap + 4 * d);
  const fs = Math.max(8, Math.round((small ? 8 : 9) * tall * d));
  list.forEach((s, i) => {
    const def = SKILLS[s.id], x = x0 + (i % cols) * (sz + gap), y = y0 + Math.floor(i / cols) * (sz + gap);
    const left = s.cdMax && !s.waiting ? Math.max(0, Math.min(1, s.timer / s.cdMax)) : 0, cooling = left > 0.02;
    ctx.globalAlpha = cooling ? 0.95 : 0.72;
    ctx.fillStyle = '#000';
    ctx.fillRect(x - d, y - d, sz + 2 * d, sz + 2 * d);
    const im = skillIconImage(s.id);
    if (im && im.width) {
      const ic = def.tint && !(M.skillicon && M.skillicon.includes(s.id)) ? tinted(im, def.tint) : im;
      const k = Math.min(sz / im.width, sz / im.height);
      ctx.drawImage(ic, x + (sz - im.width * k) / 2, y + (sz - im.height * k) / 2, im.width * k, im.height * k);
    }
    // 연's purple slot edge, thin: the frame no longer weighs on the field
    const lw = Math.max(1, Math.round(d));
    ctx.strokeStyle = 'rgba(148,48,219,0.85)';
    ctx.lineWidth = lw;
    ctx.strokeRect(x - lw / 2, y - lw / 2, sz + lw, sz + lw);
    // The wait: the part still to come darkened from the top, the whole seconds over it.
    if (cooling) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(x, y, sz, Math.round(sz * left));
      if (s.timer >= 1) {
        ctx.globalAlpha = 1;
        ctx.font = `bold ${fs + Math.round(2 * d)}px G9`;
        ctx.textAlign = 'center';
        outline(String(Math.ceil(s.timer)), x + sz / 2, y + sz / 2 + fs * 0.45, '#ffffff');
      }
    }
    ctx.globalAlpha = cooling ? 0.95 : 0.8;
    ctx.font = `bold ${fs}px G9`;
    ctx.textAlign = 'right';
    outline(String(s.lv), x + sz - d, y + sz - d, '#fff');
  });
  ctx.restore();
  ctx.textAlign = 'left';
}


// ---------------------------------------------------------------- class flourishes (바람의나라 연)
// From 연's hunts: the 전사 and 도적 close in (a dash to the foe, afterimages behind), and the
// 주술사 and 도사 fill the field from afar with the game's own spell pictures on many foes.

const THUNDER = /뢰|뇌|천둥|번개|섬광/;
function classFlourish(def, skill, st) {
  if (SH) return; // (the hero's own dash and flourish)
  const p = G.player, cls = G.cls.id;
  if (!def || def.kind === 'ult' || def.kind === 'buff' || def.kind === 'aura') return;
  const near = nearestEnemies(1, 6)[0];
  if (MELEE.has(cls)) {
    // 돌진: to the nearest foe out of reach, once a second and a half, when no blow lands by the hero.
    const beside = DIRS.some(([dx, dy]) => { const b = occ.get(key(p.tx + dx, p.ty + dy)); return b && b.m && !b.ally && !(b.war && b.team === SIDE); });
    if (near && !beside && !p.stepping && !steering() && G.t - (G.dashAt || -9) > (G.dashUsed ? 3 : 1.5) && tdist(near, p) <= 5 && ['strike', 'cleave', 'nova', 'line', 'spell', 'screen'].includes(def.kind)) {
      const spot = leapSpot(near);
      if (spot) {
        G.dashAt = G.t;
        // Landing in the crowd, the hero is untouchable for a moment (it chose the fight, not the blows).
        p.inv = Math.max(p.inv, 0.5);
        leapTo(spot[0], spot[1]);
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
  const p = G.player, cr = boxOf(canvas), d = canvas.width / cr.width;
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
  row(y, p.hp / p.maxHp, 'rgb(180,43,0)', shownNum(Math.max(0, p.hp)));
  row(y + h + 2 * d, p.mp / p.maxMp, 'rgb(62,102,196)', `${Math.floor(p.mp)}`);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, canvas.height - 3 * d, canvas.width, 3 * d);
  ctx.fillStyle = 'rgb(62,180,60)';
  ctx.fillRect(0, canvas.height - 3 * d, canvas.width * Math.min(1, p.xp / p.next), 3 * d);
  xpShine(0, canvas.height - 3 * d, canvas.width, 3 * d);
  ctx.restore();
}

/** A quiet level-up: the experience bar shines gold for a moment (0.35 s), sweeping across. */
function xpShine(x, y, w, h) {
  const k = G.xpShine !== undefined ? 1 - (G.t - G.xpShine) / 0.35 : 0;
  if (!(k > 0) || k > 1) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = `rgba(255,214,74,${(0.85 * k).toFixed(2)})`;
  ctx.fillRect(x, y, w, h);
  const sx = x + w * (1 - k);
  ctx.fillStyle = `rgba(255,255,230,${k.toFixed(2)})`;
  ctx.fillRect(sx - h * 3, y, h * 6, h);
  ctx.restore();
}

/**
 * 연's pickup list at the right, below where its minimap stands: each find a dark rounded line,
 * its icon on a pale disc at the left ("57전 획득" with 연's 엽전), the newest at the bottom.
 * A line fades in, stays and fades; the oldest go as more come. icon: an image or a function
 * giving one (drawn as it is loaded).
 */
function lootFeed(text, icon = null) {
  G.feed.push({ text, t: G.t, icon });
  if (G.feed.length > 4) G.feed.shift();
}
function coinIcon() { return images['hud/ui_icon_gold2.png']; }
function drawLootFeed() {
  G.feed = G.feed.filter(f => G.t - f.t < 4);
  if (!G.feed.length) return;
  const cr = boxOf(canvas), d = canvas.width / cr.width;
  // Right of it the 상태창 tab; above it the 연속 처치 count.
  // In a war or raid, under its kill feed (which is under the 연속 처치 count), not across it.
  const xr = canvas.width - 26 * d, y0 = Math.max(G.hunt ? Math.max(112 * d, 106 * canvas.width / 860) : 96 * d, G.war && G.war.feedBottom ? G.war.feedBottom + 4 * d : 0), h = 16 * d, gap = 19 * d;
  ctx.save();
  ctx.textAlign = 'left';
  ctx.font = `${Math.round(10 * d)}px G9`;
  G.feed.forEach((f, i) => {
    const age = G.t - f.t;
    ctx.globalAlpha = Math.max(0, Math.min(1, age / 0.18, (4 - age) * 1.5));
    const ic = typeof f.icon === 'function' ? f.icon() : f.icon;
    const hasIc = ic && ic.width;
    const tw = ctx.measureText(f.text).width;
    const w = tw + (hasIc ? h + 6 * d : 8 * d) + 8 * d;
    const x = xr - w + Math.max(0, 1 - age / 0.18) * 8 * d, y = y0 + i * gap;
    ctx.fillStyle = 'rgba(16,12,8,0.62)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, h / 2); else ctx.rect(x, y, w, h);
    ctx.fill();
    let tx = x + 8 * d;
    if (hasIc) {
      const r = h / 2 - d;
      ctx.fillStyle = 'rgba(242,234,214,0.92)';
      ctx.beginPath();
      ctx.arc(x + h / 2, y + h / 2, r, 0, Math.PI * 2);
      ctx.fill();
      const s = r * 1.7, k = Math.min(s / ic.width, s / ic.height);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(ic, x + h / 2 - ic.width * k / 2, y + h / 2 - ic.height * k / 2, ic.width * k, ic.height * k);
      tx = x + h + 4 * d;
    }
    outline(f.text, tx, y + h - 4 * d, '#ffffff');
  });
  ctx.restore();
}

/**
 * 연's 전투 정보 at the left, under health and mana: a small dark window with its brown title,
 * the hero's experience as a bar with its numbers, and the last few things the fight did
 * ("[백호의희원]을(를) 외웠습니다.", "체력이 …회복되었습니다.", "경험치가 …올랐습니다.") as 연 lists them.
 * key: lines of a kind that come close together are added into one (amount n, words from text(n)).
 */
function battleInfo(key, n, text) {
  if (SH) return;
  const L = G.binfo || (G.binfo = []), last = L[L.length - 1];
  if (last && last.key === key && G.t - last.t < 1.5 && n !== null) {
    last.n += n;
    last.t = G.t;
    last.text = text(last.n);
    return;
  }
  L.push({ key, n, t: G.t, text: text(n) });
  if (L.length > 3) L.shift();
}
const binfoWraps = new Map();
function drawBattleInfo() {
  G.binfoBottom = 0;
  if (!document.body.classList.contains('yeon') || G.war || settings.battleInfo === false) return;
  const p = G.player, cr = boxOf(canvas), d = canvas.width / cr.width;
  // (left edge with the status above it, 8 points in)
  const x = 8 * d, y = 50 * d, w = 124 * d, th = 14 * d, lh = 10.5 * d, MAXROWS = 4;
  ctx.save();
  ctx.font = `${Math.round(8.5 * d)}px G9`;
  // The last lines, wrapped at word breaks as 연 wraps them, the newest kept when they are many.
  const rows = [];
  for (const l of (G.binfo || []).filter(l => G.t - l.t < 9).reverse()) {
    // (a line's wrapping kept by its words, font and width: it was measured word by word each frame)
    const wk = ctx.font + '|' + (w - 8 * d) + '|' + l.text;
    let out = binfoWraps.get(wk);
    if (!out) {
      out = [];
      let cur = '';
      for (const word of l.text.split(' ')) {
        const t = cur ? cur + ' ' + word : word;
        if (cur && ctx.measureText(t).width > w - 8 * d) { out.push(cur); cur = word; } else cur = t;
      }
      if (cur) out.push(cur);
      if (binfoWraps.size > 200) binfoWraps.clear();
      binfoWraps.set(wk, out);
    }
    if (rows.length + out.length > MAXROWS) break;
    rows.unshift(...out.map(text => ({ text, a: Math.min(1, (9 - (G.t - l.t)) * 0.8) })));
  }
  const h = th + 23 * d + rows.length * lh + 3 * d;
  G.binfoBottom = y + h; // the 기술 연계 window goes under it, not over it
  ctx.fillStyle = 'rgba(14,10,8,0.5)';
  ctx.fillRect(x, y, w, h);
  // The title: 연's dark brown plate with a gilt edge.
  ctx.fillStyle = 'rgba(58,30,16,0.92)';
  ctx.fillRect(x, y, w, th);
  ctx.strokeStyle = 'rgba(201,162,74,0.9)';
  ctx.lineWidth = d;
  ctx.strokeRect(x + d / 2, y + d / 2, w - d, th - d);
  ctx.textAlign = 'center';
  ctx.font = `bold ${Math.round(9.5 * d)}px G11`;
  outline('전투 정보', x + w / 2, y + th - 3.5 * d, '#f6ead0');
  // Experience: its numbers over an orange bar with the share in it.
  const k = Math.min(1, p.xp / p.next);
  ctx.font = `${Math.round(8.5 * d)}px G9`;
  outline(`${shownNum(Math.floor(p.xp))}/${shownNum(Math.floor(p.next))}`, x + w / 2, y + th + 10 * d, '#ffffff');
  const bx = x + 8 * d, by = y + th + 13 * d, bw = w - 16 * d, bh = 8 * d;
  ctx.fillStyle = '#000';
  ctx.fillRect(bx - d, by - d, bw + 2 * d, bh + 2 * d);
  ctx.fillStyle = '#3a1c0c';
  ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = 'rgb(236,112,20)';
  ctx.fillRect(bx, by, bw * k, bh);
  xpShine(bx, by, bw, bh);
  ctx.font = `${Math.round(7.5 * d)}px G9`;
  outline(`${(k * 100).toFixed(2)}%`, x + w / 2, by + bh - 1.5 * d, '#ffffff');
  ctx.textAlign = 'left';
  ctx.font = `${Math.round(8.5 * d)}px G9`;
  rows.forEach((r, i) => {
    ctx.globalAlpha = r.a;
    outline(r.text, x + 4 * d, by + bh + 11 * d + i * lh, '#efe6d6');
  });
  ctx.restore();
}

/** The hero's own stun on a raid boss gathering its blast cuts it short, as the 주술사's 마비 does. */
function cutBlast(e) {
  if (SH || e.kind !== 'boss' || !G.blast) return;
  G.blast = null;
  banner('기술로 광역기를 끊었다!');
  emote('gains', G.player);
  if (G.war && (G.war.raid || G.stage.jaeng)) War.raidCut(); // 공대·「쟁」: counted in the hero's contribution
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


// ---------------------------------------------------------------- 동료의 승급 기술
// An own companion casts the class's skills of every 승급 tier it has (promoOf), not only the old four:
// its kit is the highest tiers' attacks (up to five, a spread of kinds, tier first), one 강화 buff, one
// shield and one heal. A skill is open once the companion's level reaches half its `req` (a 9차 skill
// at Lv 17); its 단 is 1 + level/5 (at most 8) and its blow is the hero's own formula (dmg x 1.15^(단-1),
// evolved = 8단) at 55%, so it never out-damages the hero's cast of the same skill (the hero also has
// gear, passives and 용무기). One cast at a time, 1.4 s apart (1.0 in a raid); each skill's wait is
// 1.5x the hero's, so the highest tier goes first and the lower tiers fill the gaps.
const TIER_ATK = new Set(['spell', 'strike', 'spell4', 'nova', 'cleave', 'line', 'screen', 'slash', 'blink']);
const TIER_K = 0.55;
function tierKit(id, tier) {
  const defs = Object.keys(SKILLS).map(k => [k, tierDef(k)]).filter(([, d]) => d.cls === id && d.promo && d.promo <= tier && !d.hpCost && d.kind !== 'ult');
  const best = f => defs.filter(([, d]) => f(d)).sort((a, b) => b[1].promo - a[1].promo || (b[1].dmg || 0) - (a[1].dmg || 0));
  // (A 기원 is never among the blows, whatever plain kind it is cast as.)
  const atk = best(d => TIER_ATK.has(d.kind) && !isMend(d)), kit = [], seen = new Set();
  for (const e of atk) if (!seen.has(e[1].kind) && kit.length < 5) { seen.add(e[1].kind); kit.push(e); }
  for (const e of atk) if (!kit.includes(e) && kit.length < 5) kit.push(e);
  kit.sort((a, b) => b[1].promo - a[1].promo || (b[1].dmg || 0) - (a[1].dmg || 0));
  const out = kit.map(e => e[0]);
  for (const f of [d => d.kind === 'buff' && d.buff === 'power', d => d.kind === 'buff' && d.buff === 'shield', d => d.kind === 'heal']) {
    const e = best(f)[0];
    if (e) out.push(e[0]);
  }
  return out;
}
/** The names of a class's highest-tier skills at a 승급 (the 동료 설정 card): '6차: ○○'. */
function tierSkillLine(id, tier) {
  if (!tier) return '';
  const kit = tierKit(id, tier).map(k => tierDef(k)).filter(d => TIER_ATK.has(d.kind));
  const top = kit.length ? kit[0].promo : 0;
  return top ? `${top}차: ${kit.filter(d => d.promo === top).map(d => d.name).slice(0, 2).join('·')}` : '';
}
function memberSkillLv(m) { return Math.max(1, Math.min(8, 1 + Math.floor(m.cl / 5))); }
function memberFx(id, sl) {
  const d = SKILLS[id];
  const base = d.yeon ? d.fx : d.modern && M.fx[d.modern] ? d.modern : d.promo === 4 && M.fx['new_' + id] ? 'new_' + id
    : d.fxs ? d.fxs[Math.min(sl, d.fxs.length) - 1] : M.fx['s_' + id] ? 's_' + id : d.fx;
  return grownFx(base, sl);
}
/** A companion's blow from its cast (castAs): its own, counted as a companion's. */
function memberHit(e, n, push) {
  const was = G.allyHitting;
  G.allyHitting = true;
  hurtEnemy(e, n, push);
  G.allyHitting = was;
  return 0;
}
/** A companion's 단 for its old routine's skills (its 승급 kit's: memberSkillLv). */
function partyLv(m) { return m.own ? memberSkillLv(m) : Math.max(1, Math.min(8, m.lv || 1)); }
/** A skill of a companion's old routine, as the hero casts it (castAs): its picture, size and area; n its blow for one
 *  whole blow of it; also(e) on each struck. A 필살기 (kind ult, the hero's a scene of its own) a body across on t. */
function memberSkill(m, id, n, t, also) {
  if (SKILLS[id] && SKILLS[id].kind === 'ult') {
    fxOnArea(fxFit(SKILLS[id].fx, ONE_TILES, 'mu'), t);
    later(0.25, () => { if (t.hp > 0) { memberHit(t, n); if (also) also(t); } });
    return true;
  }
  return castAs(m, id, partyLv(m), { at: t, hit: (e, sh, d, push) => { memberHit(e, n * sh, push); if (also) also(e); return 0; } });
}
/** A skill of a companion seen only (its own rule does what it does): the hero's cast of it — on `at` for a 기원, a ward
 *  or a buff (cast as on that one), else at `at` among foes (default the field's). */
function memberShow(m, id, at, foes = null, lv = 0) {
  const d = SKILLS[id];
  if (!d || !at) return false;
  if (['heal', 'buff', 'aura'].includes(d.kind) || at === m || at === G.player || !at.m) return castAs(at, id, lv || partyLv(m), { cls: m.cls, on: at });
  return castAs(m, id, lv || partyLv(m), { at, foes: foes || undefined });
}
/** One tier skill of an own companion, if one is ready: returns true when it cast (the old routine rests). */
function memberTierCast(m, near, face, pose) {
  if (!m.own) return false;
  const tier = Math.max(m.promo || 0, promoOf(m.cls.id));
  if (!tier) return false;
  if (m.kitTier !== tier) { m.kitTier = tier; m.kit = tierKit(m.cls.id, tier); m.sk = m.sk || {}; }
  const haste = (m.hasteUntil || 0) > G.t ? 0.6 : 1;
  if (G.t < (m.tierGap || 0)) return false;
  const sl = memberSkillLv(m), p = G.player;
  for (const id of m.kit) {
    const d = tierDef(id);
    if (m.cl < Math.floor((d.req || 1) * 0.5) || G.t < (m.sk[id] || 0)) continue;
    const cd = d.cd * Math.pow(0.93, sl - 1) * 1.5;
    // its blow: the hero's formula for the skill at its 단 (castAs strikes what the hero's cast strikes) at TIER_K
    const k = TIER_K * (m.power || 1) * auraK(m) * ((m.buffUntil || 0) > G.t ? 1 + (m.buffK || 0.4) : 1);
    const t = near(3)[0];
    let done = false;
    // 같은 기술은 같은 그림: every skill of it cast by the hero's own code (castAs) — the hero's picture at that 단, its
    // size, place and the area it strikes. (It drew memberFx's picture fitted by kinds of its own: 비영승보's cloud,
    // 사슬벼락's dragon far larger than the hero's.)
    if (d.kind === 'buff') {
      if (d.buff === 'shield' ? m.hp >= m.maxHp * 0.7 : !t) continue;
      if (d.buff === 'power') { m.buffUntil = G.t + (d.duration || 4) * 1.2; m.buffK = (d.power || 0.4) * 0.5; }
      else if (d.buff === 'shield') m.hp = Math.min(m.maxHp, m.hp + m.maxHp * 0.15);
      castAs(m, id, sl, { at: t, hit: (e, sh, dd, push) => memberHit(e, dd * k, push) });
      done = true;
    } else if (d.kind === 'heal') {
      const low = partyBodies().filter(b => b.hp < b.maxHp * 0.6).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
      if (!low) continue;
      const n = low.maxHp * Math.min(0.3, 0.1 + 0.02 * sl);
      if (low === p) heal(n, true); else low.hp = Math.min(low.maxHp, low.hp + n);
      castAs(low, id, sl, { cls: m.cls, on: low });
      done = true;
    } else if (t) {
      face(t);
      done = castAs(m, id, sl, { at: t, hit: (e, sh, dd, push) => memberHit(e, dd * k, push) });
    }
    if (!done) continue;
    m.sk[id] = G.t + cd * haste;
    m.tierGap = G.t + (G.stage.raid ? 1.0 : 1.4) * haste;
    if (d.buff === 'haste') m.hasteUntil = G.t + (d.duration || 4);
    if (d.promo >= 4) partySay(m, d.name); else m.bubble = { text: d.name, t: G.t };
    // A fighter's blow is its weapon's swing; spells, 기원 and buffs the cast (the hero's own rule).
    pose((MELEE_LOOK[m.cls.id] || WEAPON_POSE.has(m.cls.id)) && !['buff', 'heal'].includes(d.kind) && !isMend(SKILLS[id]) ? 'attack' : 'magic');
    return true;
  }
  return false;
}

function partyAct(m) {
  // Companions help; the hero carries the hunt, so each hits about as hard as a starting spell.
  const p = G.player, pw = (1 + 0.15 * (m.lv - 1)) * (1 + (m.own ? m.cl : p.lvl) * 0.04) * (m.power || 1) * auraK(m);
  // (the clip's own length: 0.3 on a swing started its frames below the first, a blank frame)
  const pose = kind => { m.pose = kind; m.poseT = kind === 'attack' ? 0.22 : 0.3; };
  const near = n => nearestEnemies(n, 7, { tx: m.tx, ty: m.ty });
  const face = t => {
    m.fdx = Math.abs(t.x - m.x) > Math.abs(t.y - m.y) ? Math.sign(t.x - m.x) : 0;
    m.fdy = m.fdx ? 0 : Math.sign(t.y - m.y);
  };
  const boss = G.enemies.find(e => e.kind === 'boss' && tdist(e, m) < 9);
  if (memberTierCast(m, near, face, pose)) return;
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
          const dd = m.deeds = m.deeds || {};
          dd.revive = (dd.revive || 0) + 1;
        });
      } else if (G.groupHeal && G.t - G.groupHeal < 3 && m.cd.g <= 0) {
        // After a blast over everyone: the 희원 to the whole party.
        m.cd.g = 10;
        for (const x of partyBodies()) addShot(m, x, { color: '#58e868', glow: '#b8ffb0', size: 4, speed: 420, onHit: () => {
          const n = x.maxHp * 0.25;
          if (x === p) heal(n, false); else healMember(x, n);
          memberShow(m, 'p_sky', x);
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
          memberShow(m, 'm_gongryeok', p);
        } });
        audio.play('skill_m_gongryeok', 'heal');
        partySay(m, '공력주입');
        partyTalk(m, ['공증 드려요!', '마력 채워 드릴게요']);
        pose('magic');
      } else if (m.cd.a <= 0 && low) {
        m.cd.a = G.stage.raid ? 3.2 : 5;
        const tier = Math.min(7, m.lv + 1), fx = SKILLS.c_heal.fxs ? SKILLS.c_heal.fxs[tier] : SKILLS.c_heal.fx;
        const n = low.maxHp * (0.14 + 0.04 * m.lv);
        addShot(m, low, { color: '#58e868', glow: '#b8ffb0', size: 4, speed: 420, onHit: () => {
          const dd = m.deeds = m.deeds || {};
          dd.heal = (dd.heal || 0) + Math.min(n, low.maxHp - low.hp);
          if (low === p) heal(n, false); else healMember(low, n);
          memberShow(m, 'c_heal', low, null, tier + 1);
        } });
        audio.play('skill_c_heal', 'heal', tier + 1);
        partySay(m, KIWON[tier]);
        pose('magic');
      } else if (m.cd.b <= 0) {
        m.cd.b = 14;
        G.buffs.shield = Math.max(G.buffs.shield, G.t + 4 + m.lv);
        for (const b of partyBodies()) addShot(m, b, { color: '#5aa8ff', glow: '#c0e0ff', size: 3, speed: 420, onHit: () =>
          fxOnBody(FX.shield, b, -26, { scale: 0.6 }) });
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
        memberShow(m, 'm_curse', t, around(t.tx, t.ty, 1));
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
        memberShow(m, 'm_para', boss, [boss]);
        audio.play('skill_m_para', 'strike');
        partySay(m, '마비');
        partyTalk(m, ['마비 걸었어요! 광역 끊김!', '마비! 지금 몰아쳐요!']);
        banner('마비! 광역기를 끊었다');
        emote('gains', p);
        pose('magic');
      } else if (boss && m.cd.d <= 0) {
        // 헬파이어 on the boss: the big one.
        m.cd.d = 16;
        memberSkill(m, 'm_ult', 70 * pw, t);
        audio.play('skill_m_ult', 'ult');
        partySay(m, '헬파이어');
        pose('magic');
      } else if (m.cd.a <= 0) {
        m.cd.a = 1.3;
        memberSkill(m, 'm_fire', 8 * pw, t);
        audio.play('skill_m_fire', 'spell', Math.min(8, m.lv * 2));
        if (Math.random() < 0.3) partySay(m, ['화염주', '화영열주', '화열참주'][Math.min(2, m.lv - 1)]);
        pose('magic');
      } else if (m.cd.b <= 0) {
        m.cd.b = 8;
        for (const e of around(t.tx, t.ty, 1)) e.stun = e.kind === 'boss' ? 0.6 : 2;
        memberShow(m, 'm_para', t, around(t.tx, t.ty, 1));
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
        memberSkill(m, 'w_roar', 60 * pw, t);
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
          memberSkill(m, 'w_tiger', 15 * pw, t);
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
        memberShow(m, 'l_guard', m);
        audio.play('skill_l_guard', 'buff');
        partySay(m, '진기보호');
        healMember(m, m.maxHp * 0.15);
      }
      if (boss && t === boss && m.cd.d <= 0) {
        m.cd.d = 10;
        memberSkill(m, 'l_meteor', 45 * pw, t);
        audio.play('skill_l_meteor', 'strike');
        partySay(m, '유성창');
        if (Math.random() < 0.5) partyTalk(m, ['창끝을 받아라!', '보스 앞은 제가 막죠!']);
        pose('attack');
      } else if (m.cd.b <= 0 && around(t.tx, t.ty, 1).length >= 3) {
        m.cd.b = 7;
        memberSkill(m, 'l_halfmoon', 14 * pw, t);
        audio.play('skill_l_halfmoon', 'cleave');
        partySay(m, '반월참');
        pose('attack');
      } else if (m.cd.a <= 0) {
        m.cd.a = 0.9;
        memberSkill(m, 'l_moon', 10 * pw, t);
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
        memberShow(m, 'mk_diamond', m);
        audio.play('skill_mk_diamond', 'buff');
        partySay(m, '금강불괴');
        healMember(m, m.maxHp * 0.15);
      }
      if (boss && t === boss && m.cd.d <= 0) {
        m.cd.d = 10;
        memberSkill(m, 'mk_sudden', 45 * pw, t);
        audio.play('skill_mk_sudden', 'blink');
        partySay(m, '전광석화');
        if (Math.random() < 0.5) partyTalk(m, ['급소를 찌른다!', '주먹 맛 좀 봐라!']);
        pose('attack');
      } else if (m.cd.b <= 0 && around(m.tx, m.ty, 1).length >= 3) {
        m.cd.b = 7;
        memberSkill(m, 'mk_quake', 14 * pw, t);
        audio.play('skill_mk_quake', 'nova');
        partySay(m, '천지파동');
        pose('attack');
      } else if (m.cd.a <= 0) {
        m.cd.a = 0.7;
        memberSkill(m, 'mk_bung', 9 * pw, t);
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
        memberShow(m, 'md_boundary', m);
        audio.play('skill_md_boundary', 'buff');
        partySay(m, '질서결계');
        healMember(m, m.maxHp * 0.15);
      }
      if (boss && m.cd.d <= 0) {
        m.cd.d = 10;
        memberSkill(m, 'md_arrow', 45 * pw, t);
        audio.play('skill_md_arrow', 'spell');
        partySay(m, '마력화살');
        if (Math.random() < 0.5) partyTalk(m, ['금기의 화살이다!', '보스에 집중!']);
        pose('magic');
      } else if (m.cd.b <= 0 && around(t.tx, t.ty, 1).length >= 3) {
        m.cd.b = 7;
        memberSkill(m, 'md_orblight', 12 * pw, t, e => { e.stun = Math.max(e.stun || 0, e.kind === 'boss' ? 0.3 : 1); });
        audio.play('skill_md_orblight', 'spell');
        partySay(m, "기공구슬'뇌");
        pose('magic');
      } else if (m.cd.a <= 0) {
        m.cd.a = 1.1;
        memberSkill(m, 'md_sphere', 10 * pw, t);
        audio.play('skill_md_sphere', 'spell');
        if (Math.random() < 0.2) partySay(m, '마력구회격');
        pose('magic');
      }
      break;
    }
    case 'celestial': {
      // 천인: magic that dives — 염화 at the nearest from a little off, 찰나 behind the boss now and then,
      // 빙글번쩍 when foes close round it; 철옹벽 when hurt.
      const t = boss || near(1)[0];
      if (!t) break;
      face(t);
      if (m.hp < m.maxHp * 0.4 && m.cd.e <= 0) {
        m.cd.e = 16;
        memberShow(m, 'cl_wall', m);
        audio.play('skill_cl_wall', 'buff');
        partySay(m, '철옹벽');
        healMember(m, m.maxHp * 0.15);
      }
      if (boss && m.cd.d <= 0) {
        m.cd.d = 10;
        memberSkill(m, 'cl_moment', 45 * pw, t);
        audio.play('skill_cl_moment', 'blink');
        partySay(m, '찰나');
        if (Math.random() < 0.5) partyTalk(m, ['파고든다!', '뒤를 잡았어요!']);
        pose('attack');
      } else if (m.cd.b <= 0 && around(m.tx, m.ty, 1).length >= 3) {
        m.cd.b = 7;
        memberSkill(m, 'cl_brilliant', 14 * pw, t);
        audio.play('skill_cl_brilliant', 'nova');
        partySay(m, '빙글번쩍');
        pose('magic');
      } else if (m.cd.a <= 0) {
        m.cd.a = 1.1;
        memberSkill(m, 'cl_boom', 10 * pw, t);
        audio.play('skill_cl_boom', 'spell');
        if (Math.random() < 0.2) partySay(m, '염화');
        pose('magic');
      }
      break;
    }
    case 'dokkaebi': {
      // 도깨비: the party's second wall beside the warrior — 퇴격 at what stands close, 회전회오리 into
      // a crowd, 일격필살'징벌 on the boss now and then; 귀체 when hurt.
      const t = boss || near(1)[0];
      if (!t || Math.hypot(t.x - m.x, t.y - m.y) > TILE * 1.8) break;
      face(t);
      if (m.hp < m.maxHp * 0.4 && m.cd.e <= 0) {
        m.cd.e = 14;
        memberShow(m, 'dk_body', m);
        audio.play('skill_dk_body', 'heal');
        partySay(m, '귀체');
        healMember(m, m.maxHp * 0.2);
      }
      if (boss && t === boss && m.cd.d <= 0) {
        m.cd.d = 10;
        memberSkill(m, 'dk_punish', 50 * pw, t);
        audio.play('skill_dk_punish', 'strike');
        partySay(m, "일격필살'징벌");
        if (Math.random() < 0.5) partyTalk(m, ['방망이 맛 좀 봐라!', '뚝딱!']);
        pose('attack');
      } else if (m.cd.b <= 0 && around(m.tx, m.ty, 1).length >= 3) {
        m.cd.b = 7;
        memberSkill(m, 'dk_whirl', 14 * pw, t);
        audio.play('skill_dk_whirl', 'nova');
        partySay(m, '회전회오리');
        pose('attack');
      } else if (m.cd.a <= 0) {
        m.cd.a = 0.9;
        memberSkill(m, 'dk_repel', 10 * pw, t);
        audio.play('skill_dk_repel', 'cleave');
        if (Math.random() < 0.2) partySay(m, '퇴격');
        pose('attack');
      }
      break;
    }
    case 'reaper': {
      // 차사: in close from the far side like the rogue — 절섬 at what stands near, 나선회륜 into a
      // crowd, 진섬'연 on the boss now and then; 흡기공 when hurt.
      const t = boss || near(1)[0];
      if (!t || Math.hypot(t.x - m.x, t.y - m.y) > TILE * 1.8) break;
      face(t);
      if (m.hp < m.maxHp * 0.4 && m.cd.e <= 0) {
        m.cd.e = 13;
        memberShow(m, 'rp_drain', m);
        audio.play('skill_rp_drain', 'heal');
        partySay(m, '흡기공');
        healMember(m, m.maxHp * 0.2);
      }
      if (boss && t === boss && m.cd.d <= 0) {
        m.cd.d = 10;
        memberSkill(m, 'rp_flash', 45 * pw, t);
        audio.play('skill_rp_flash', 'blink');
        partySay(m, "진섬'연");
        if (Math.random() < 0.5) partyTalk(m, ['저승길로 모신다!', '명부에 이름이 올랐다!']);
        pose('attack');
      } else if (m.cd.b <= 0 && around(m.tx, m.ty, 1).length >= 3) {
        m.cd.b = 7;
        memberSkill(m, 'rp_spiral', 14 * pw, t);
        audio.play('skill_rp_spiral', 'nova');
        partySay(m, '나선회륜');
        pose('attack');
      } else if (m.cd.a <= 0) {
        m.cd.a = 0.8;
        memberSkill(m, 'rp_cut', 10 * pw, t);
        audio.play('skill_rp_cut', 'cleave');
        if (Math.random() < 0.2) partySay(m, '절섬');
        pose('attack');
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
        memberShow(m, 'a_weebo', m);
        audio.play('skill_a_weebo', 'buff');
        partySay(m, '위위비보');
        healMember(m, m.maxHp * 0.15);
      }
      if (boss && m.cd.d <= 0) {
        m.cd.d = 10;
        memberSkill(m, 'a_aim', 45 * pw, t);
        audio.play('skill_a_aim', 'spell');
        partySay(m, '조준 활쏘기');
        if (Math.random() < 0.5) partyTalk(m, ['급소 조준!', '보스 집중 사격!']);
        pose('attack');
      } else if (m.cd.b <= 0 && around(t.tx, t.ty, 1).length >= 3) {
        m.cd.b = 7;
        memberSkill(m, 'a_bomb', 14 * pw, t);
        audio.play('skill_a_bomb', 'strike');
        partySay(m, '마탄');
        pose('attack');
      } else if (m.cd.a <= 0) {
        m.cd.a = 1.1;
        memberSkill(m, 'a_shot', 10 * pw, t);
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
        // 투명 (AMBUSH, as the hero's): out of sight, nothing strikes it; a moment closing in,
        // then the 암습 — its first blow three times as hard — and it is seen again.
        m.cd.c = 12;
        m.hidden = G.t + 4;
        m.stalk = G.t + AMBUSH.stalk;
        memberShow(m, 'r_stealth', m);
        audio.play('skill_r_stealth', 'buff');
        partySay(m, '투명');
      }
      if (m.hidden > G.t && G.t < m.stalk) break;
      const amb = m.hidden > G.t ? AMBUSH.k : 1;
      if (amb > 1 && ((boss && m.cd.d <= 0) || m.cd.a <= 0)) {
        m.hidden = 0;
        memberShow(m, 'r_amsal', t, [t]);
        partySay(m, '암습');
      }
      if (boss && m.cd.d <= 0) {
        m.cd.d = 15;
        fxOnArea(fxFit(SKILLS.r_ult.fx, ONE_TILES, 'ru'), t);
        for (let i = 0; i < 4; i++) later(0.1 + i * 0.1, () => hurtEnemy(t, 15 * pw * (i === 0 ? amb : 1)));
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
        memberSkill(m, 'r_blink', 12 * pw * amb, t);
        audio.play('skill_r_blink', 'blink');
        if (Math.random() < 0.25) partySay(m, '비영승보');
        pose('attack');
      }
      break;
    }
  }
}

function drawParty(m) {
  const alpha = m.down ? 0.4 : m.hidden > G.t ? 0.35 : 1, y = m.down ? m.y - 4 - Math.sin(G.t * 2) * 3 : m.y;
  const mPose = m.down ? 'dead' : m.poseT > 0 ? m.pose : m.moving ? 'walk' : 'idle';
  if ((m.cls.id && drawYhero2(m.cls, m.gear, m, m.x, y, mPose, alpha)) || drawYhero(m.cls.id || m.cls, m.gear ? m.gear.armor : 0, m, m.x, y, mPose, alpha)) {
    // drawn in 연's own figure (nothing for the moment its layers are still loading)
  }
  if (!m.down) {
    // A small bar over the head, as the client showed for a party.
    const top = m.y - HERO_TOP - 4, k = m.hp / m.maxHp;
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
  // 노획 reaches for dropped things from further away. (1.2 tiles to begin, was 0.7: a coin a
  // step aside was a detour; 기획 P0-7.)
  const reach = TILE * (1.2 + 0.5 * G.passives.magnet + opt('magnet'));
  // The closing vacuum: every drop on the field speeds toward the hero.
  const pull = G.vacuumAt !== undefined && G.t >= G.vacuumAt && G.t < G.vacuumEnd;
  if (pull && !G.vacuumSaid) {
    G.vacuumSaid = true;
    if (G.drops.length) audio.play('pickup');
  }
  // 흡입 after a big kill (pullLoot): what lies within its reach flies in.
  const near = !pull && G.pullUntil > G.t ? G.pullReach || TILE * 7 : 0;
  for (const d of G.drops) {
    if (pull || (near && Math.abs(d.x - p.x) < near && Math.abs(d.y - p.y) < near)) {
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
        lootFeed(`${MATS[d.mat].name} 획득`, () => matImage(d.mat));
        audio.play('pickup');
      }
      else if (d.kind === 'heal') heal(30, true);
      else if (d.kind === 'coin') {
        const n = 5 + Math.floor(Math.random() * 10 * (1 + G.level));
        G.gold += n;
        if (G.texts.length < 70) G.texts.push({ x: p.x + rand(-6, 6), y: p.y - 40, text: String(n), t: 0, gold: true });
        note(`${won(n)}을 주웠습니다.`);
        lootFeed(`${won(n)} 획득`, coinIcon);
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
  if (SH) return; // (an AI's cast mends by its own rule)
  const p = G.player;
  n = Math.min(n, p.maxHp - p.hp);
  if (n <= 0) return;
  p.hp += n;
  healText(p, n);
  battleInfo('heal', n, v => `체력이 ${shownNum(v)} 회복되었습니다.`);
  if (!quiet) addFx(FX.heal, 0, -26, { follow: true });
  if (sound) audio.play('heal');
}

function gainXp(v) {
  const p = G.player;
  // Alone, the hero grows a little faster: more cards, sooner.
  v *= 1.7;
  v *= 1 + GEAR_OPT.exp * opt('exp'); // 경험치 (an armour's line)
  if (G.hunt) v *= Hunt.xpK(); // 사냥 기믹: experience by act
  p.xp += v * pactReward();
  if (G.party && G.party.length) shareCompanionXp(v * pactReward());
  p.total = (p.total || 0) + v;
  const got = v * pactReward(), of = p.next;
  battleInfo('xp', got, k => `경험치가 ${shownNum(Math.round(k))}(${(k / of * 100).toFixed(2)}%) 올랐습니다.`);
  while (p.xp >= p.next) {
    p.xp -= p.next;
    p.lvl++;
    p.next = xpFor(p.lvl);
    G.pendingLevels++;
    // 레벨업 연출 다이어트 (기획 P0-3): the chat line, 연's LEVEL UP burst and the chime come with
    // the card (nextChoice: levelFx) — in full only every 5th level and for a card that stops.
    if (p.lvl % 5 === 0) G.lvMark = true;
    if (p.lvl % 10 === 0) emote('grind', p);
    // Party members join at levels 3, 9 and 15, as D2 Survivors' mercenaries do.
    const joinAt = [3, 9, 15].indexOf(p.lvl);
    if (joinAt >= 0) {
      // 동료 모드: the player's own other characters (those with a record), most 승급 first, then
      // the old four; they share the conquest (promote) and so climb their own 승급 with the hero.
      const order = partyOrder();
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
  return Math.min(MAX_SKILL_LEVEL, G.player.lvl - skillReq(SKILLS[id]) + 1);
}

/** Evolves the first spell that is ready: level 8, its catalyst passive, its form's level. */
function evolve() {
  // 각성: a spell at 8단 grows into the higher 승급's spell of its line, once the class has
  // that 승급 (백호참 → 극백호참 at 4차). No passive is needed: the 승급 is the key.
  for (const s of G.skills) {
    const d = SKILLS[s.id];
    if (!d.up || s.lv < MAX_SKILL_LEVEL) continue;
    const into = SKILLS[d.up];
    if (G.player.lvl < skillReq(into)) continue;
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
    const deal = known.concat(first).slice(0, 3);
    // 사냥 기믹 (P1-10): on a ground conquered before, the 수련장's preset first.
    const fit = id => SKILLS[id] && mine(id) && !SKILLS[id].evolved && SKILLS[id].kind !== 'ult' && SKILLS[id].kind !== 'heal' && (SKILLS[id].req === 1 || mastered(G.cls.id).includes(id));
    return Hunt.firstPicks(G.cls.id, fit, deal) || deal;
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
  // 계승: a 5차 and higher spell takes the place of the spell before it in its line (its slot and
  // its 단), so the line climbs without a new slot. Before, each step needed a slot of its own:
  // 포효검황 → 황룡승천 → 천둥낙뢰 → 흑룡광참 was four of six, and from 6차 up nothing was used.
  for (const [id, d] of Object.entries(SKILLS)) {
    if (!d.pre || !mine(id) || d.evolved || skillReq(d) > lvl || have(id)) continue;
    if (d.promo && promoOf(G.cls.id) < d.promo) continue;
    const from = G.skills.find(x => x.id === d.pre[0]) || (d.promo === 9 ? lineHeld(d) : null);
    if (!from || from.lv < INHERIT_LV) continue;
    opts.push({ type: 'skill', id, lv: Math.max(1, Math.min(from.lv, levelCap(id))), from: from.id, w: 3.5 + 0.25 * (d.promo || 0) });
  }
  if (G.skills.length < MAX_SKILLS) {
    for (const [id, d] of Object.entries(SKILLS)) {
      if (!mine(id) || d.evolved || d.kind === 'ult' || skillReq(d) > lvl || have(id)) continue;
      if (d.promo && promoOf(G.cls.id) < d.promo) continue;
      // 계열: a spell with one before it in the tree comes by 계승 (above), in that one's place.
      if (d.pre) continue;
      // The class's own way of fighting (the 도적's 투명) comes up more often.
      // A higher 승급's spell comes up more: the hero won it to use it.
      opts.push({ type: 'skill', id, lv: 1, w: SIGNATURE[G.cls.id] === id ? 4 : 2.5 + 0.25 * (d.promo || 0) });
    }
  }
  // 9차: one of the 9차 spells the hero has no line to, a deal — a new spell while a slot is free, else
  // in the place of its weakest spell (a 계승: its slot and its 단). A 9차 hero (Lv 15 in a run: skillReq)
  // ended most hunts with none of them: they came only by their lines, rarely held, the slots full by Lv 20.
  if (promoOf(G.cls.id) >= 9) {
    const open9 = Object.entries(SKILLS).filter(([id, d]) => d.cls === G.cls.id && d.promo === 9 && !d.evolved && d.kind !== 'ult'
      && skillReq(d) <= lvl && !have(id) && !opts.some(o => o.id === id));
    if (open9.length) {
      const [id] = open9[Math.floor(Math.random() * open9.length)];
      if (G.skills.length < MAX_SKILLS) opts.push({ type: 'skill', id, lv: 1, w: 4.75 });
      else {
        const rank = x => (SKILLS[x.id].promo || 0) * 10 + x.lv;
        const from = G.skills.filter(x => SKILLS[x.id].promo !== 9 && !SKILLS[x.id].evolved && SKILLS[x.id].kind !== 'ult'
          && SKILLS[x.id].kind !== 'heal' && SIGNATURE[G.cls.id] !== x.id).sort((a, b) => rank(a) - rank(b))[0];
        if (from) opts.push({ type: 'skill', id, lv: Math.max(1, Math.min(from.lv, levelCap(id))), from: from.id, w: 4 });
      }
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

/** 9차 계승: the spell of the line the hero holds, nearest below the one before it. A 9차 spell came only
 *  from its 8차·7차 step, and those from theirs, so with the slots full by about Lv 20 a 9차 hero ended
 *  most hunts with none of its 9차 spells: any spell of the line now leads to it (its slot and its 단). */
function lineHeld(d) {
  let x = SKILLS[d.pre[0]];
  for (let i = 0; x && x.pre && i < 12; i++) {
    const held = G.skills.find(s => s.id === x.pre[0]);
    if (held) return held;
    x = SKILLS[x.pre[0]];
  }
  return null;
}

/** A level-up's show: in full (연's chime, burst, LEVEL UP lettering, the chat line), or quietly. */
function levelFx(full) {
  const f = feel(), p = G.player;
  if (!full) {
    G.xpShine = G.t;
    f.lvQuiet++;
    return;
  }
  G.lvFullAt = G.t;
  G.xpShine = G.t;
  f.lvFull++;
  audio.play('levelup');
  addFx(FX.levelup, 0, -26, { follow: true });
  if (M.fx.h_levelup) addFx('h_levelup', 0, 2, { anchor: 'bottom', follow: true });
  say(`레벨이 올랐습니다. (Lv ${p.lvl})`, 'sys');
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
  const first = G.firstCard, tune = G.tuneCard;
  G.tuneCard = false;
  const picks = drawCards();
  if (!picks.length) picks.push({ type: 'heal' }, { type: 'gold' });
  // 사냥 기믹: only a pick with something new in it (a new spell, a 계승, a 정비 pick) stops the
  // hunt; a pick of raises only is taken as the 자동 선택 would, named in the feed.
  const stop = !G.hunt || first || tune || Hunt.stops(picks);
  if (tune && G.hunt) G.rerolls++; // 정비: a free deal again
  if (G.pace) { G.pace.cards++; if (stop) G.pace.manual++; }
  G.choosing = true;
  // The full level-up (chime, burst, LEVEL UP, the chat line) only for cards shown to the player,
  // a card with something new in it, and every 5th level — not more than once in 6 seconds unless
  // the cards are shown; the rest go quietly: a gold shine on the experience bar and the feed line.
  const shown = !((settings.autoPick || !stop) && !G.banishing);
  if (G.redeal) G.redeal = false; // 다시 뽑기: the same level dealt again, not a new one
  else levelFx(shown || ((stop || G.lvMark) && G.t - (G.lvFullAt ?? -9) > 6));
  G.lvMark = false;
  // 자동 선택: the hunt goes on, as 연's auto hunting does; the pick is named in the feed.
  if ((settings.autoPick || !stop) && !G.banishing) {
    const o = bestCard(picks);
    lootFeed(`자동 선택 · ${cardName(o)}`);
    choose(o);
    return;
  }
  $('#lv-title').textContent = tune && G.hunt ? `정비 · 레벨 ${G.player.lvl}` : `레벨 ${G.player.lvl}`;
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
      if (o.from) text = `${SKILLS[o.from].name} 자리를 잇는다 (${o.lv}단 그대로). ` + text;
      tag = (o.from ? '계승' : o.mastered ? '숙련' : o.lv === 1 ? '새 마법' : `Lv ${o.lv}`)
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
  G.redeal = true;
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
// A class's signature spell (its identity: the 도적's 투명, which opens every 암습): offered more
// often, and the 자동 선택 takes it.
const SIGNATURE = { rogue: 'r_stealth' };
function cardScore(o) {
  const p = G.player, low = p.hp < p.maxHp * 0.45;
  const attacks = G.skills.filter(s => !SUPPORT_KINDS.has(SKILLS[s.id].kind)).length;
  const kept = ((progress.builds || {})[G.cls.id] || { skills: [] }).skills.map(x => x[0]);
  if (o.type === 'skill') {
    const d = SKILLS[o.id], attack = !SUPPORT_KINDS.has(d.kind);
    let v;
    if (o.from) return (attack ? 14 : 9) + (d.promo || 0) - (SKILLS[o.from].promo || 0) + (kept.includes(o.id) ? 3 : 0);
    if (o.lv > 1) {
      v = attack ? 10 : 6;
      if (d.up && SKILLS[d.up] && promoOf(G.cls.id) >= SKILLS[d.up].promo) v += 5;
      if (o.lv >= 6) v += 2;
    } else {
      v = attack ? (attacks < 3 ? 12 : 8) : d.kind === 'heal' ? (low ? 9 : 5) : d.kind === 'blink' ? 3 : 5;
      if (SIGNATURE[G.cls.id] === o.id) v = attacks >= 2 ? 13 : 7;
      v += (d.promo || 0) * 2;
      if (o.mastered) v += 2;
      // Keep room for the 승급 spells still to come: with six slots and every hunt starting over,
      // the low-level 0차 spells filled them all and the hero's 3~9차 spells never got in.
      // While fewer free slots are left than better spells will open (by their level), a spell
      // of a lower 승급 than those is put after raising what is held and the passives.
      const free = MAX_SKILLS - G.skills.length, lvl = p.lvl, pr = promoOf(G.cls.id);
      const later = Object.entries(SKILLS).filter(([id, x]) => (x.cls === G.cls.id) && !x.evolved && x.kind !== 'ult'
        && !x.pre && !SUPPORT_KINDS.has(x.kind) && (x.promo || 0) > (d.promo || 0) && (x.promo || 0) <= pr && skillReq(x) > lvl
        && !G.skills.some(s => s.id === id)).length;
      if (attack && later && free <= Math.min(later, 3)) v -= 9;
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
  if (o.type === 'skill' && o.from) {
    const sk = G.skills.find(x => x.id === o.from);
    const was = SKILLS[o.from].name;
    if (sk) { sk.id = o.id; sk.lv = o.lv; sk.timer = 0.2; sk.from = o.from; } else addSkill(o.id);
    audio.play('levelup');
    say(`${josa(was, '이', '가')} ${josa(SKILLS[o.id].name, '으로', '로')} 이어졌습니다! (계승)`, 'sys');
  } else if (o.type === 'skill') {
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
  if (G.hunt && Hunt.cardBonus(o)) lootFeed(`카드 무게 · ${cardName(o)} +1`); // 사냥 기믹: past Lv 20, two steps
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
  // (hit sparks, the level-up burst and the like have no icon of their own: 누리's h_levelup_force)
  if (!fx || !M.fx[fx] || /^(new_|h_|g_)/.test(fx)) return itemIcon('p_power');
  const im = fxIcon(fx);
  if (SKILLS[id].tint) im.style.filter = SKILLS[id].tint;
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
  if (G.war && War.heroDown()) return; // 대항전: down for a few seconds, up again at the camp
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

/** The level a spell opens at in a hunt: its 연 level (req) brought down to under half, so the
 * high 승급 spells come in the hunt's first half (9차 at Lv 15, not 33 — a hunt reached that only
 * as its boss came, and they were never really used). The order of the tree stays. */
function skillReq(d) {
  const r = d.req || 1;
  return r <= 1 ? 1 : Math.max(2, Math.round(r * SKILL_REQ_K));
}
const SKILL_REQ_K = 0.45;
// The 단 a spell must reach before the next of its line can take its place.
const INHERIT_LV = 2;

/** What a hunt gave, short: the same thing counted (곰가죽 ×3), the rare first, eight at most. */
function gainedSummary(list, most = 8) {
  const n = new Map();
  for (const x of list) n.set(x, (n.get(x) || 0) + 1);
  const rank = x => x.startsWith('★') ? 0 : x.startsWith('[') ? 1 : 2;
  const all = [...n].sort((a, b) => rank(a[0]) - rank(b[0]) || b[1] - a[1]);
  const shown = all.slice(0, most).map(([x, k]) => k > 1 ? `${x} ×${k}` : x).join(', ');
  return all.length > most ? `${shown} 외 ${all.length - most}종 (모두 ${list.length}개)` : shown;
}

// ---------------------------------------------------------------- results, 승급 의식, the special's moment
//
// The results say what the hunt gave at a glance: the grade (as large as a 연 result), the special
// finds first in gold, then 전 · 레이드주화 · 재료 · 코디 · 장비 as chips with their icons, the 승급,
// what the companions did, which 의뢰 moved, and the next goal.

/** The results window's body. style: Hunt.grade() (S/A/B/C, sc, and its parts when hunt.js gives
 *  them as style.parts [[label, value], ...]; else the 기세·처형·일망타진·반응 counts). */
function resultsHTML(style, huntGold) {
  const d = metaDiff(G.meta0);
  const chip = (html, cls = '') => `<span class="rchip${cls ? ' ' + cls : ''}">${html}</span>`;
  const out = [];
  out.push(`<div class="r-head">${style ? `<b class="r-grade g${style.g}">${style.g}</b>` : ''}<div class="r-who"><b>${G.cls.name} · Lv ${G.player.lvl} · ${G.stage.name}</b><br>`
    + `생존 시간 ${clock(G.t)}${G.endless ? ` (계속 사냥 ${clock(G.t - G.clearT)})` : ''} · 처치 ${G.kills.toLocaleString()}마리</div></div>`);
  if (style) {
    const parts = Array.isArray(style.parts) ? style.parts.map(([l, v]) => `${l} ${v}`)
      : [`최고 기세 ${style.best}단`, `처형 ${style.execs}`, `일망타진 ${style.sweeps}`, `반응 ${style.reactions}`];
    out.push(`<div class="r-style">스타일 ${style.g}${style.sc !== undefined ? ` · ${style.sc}점` : ''} · ${parts.join(' · ')}`
      + (style.stars ? ` · 숙련 <span class="r-star">${'★'.repeat(style.stars)}${'☆'.repeat(Math.max(0, 3 - style.stars))}</span>${style.newStar ? ' <em>새 ★</em>' : ''}` : '') + '</div>');
  }
  // The rare finds first, in gold (스페셜, 고유, 코디).
  const rare = (G.gained || []).filter(x => x.startsWith('★') || x.startsWith('['));
  if (rare.length) out.push(`<div class="r-special">${[...new Set(rare)].map(x => `<span>${x.startsWith('★') ? x : '★' + x}</span>`).join('')}</div>`);
  const gains = [];
  gains.push(chip(`<img src="assets/hud/ui_icon_gold2.png" alt="">+${won(G.gold)}${style && style.k !== 1 ? ` <small>(${won(huntGold)} × ${style.k})</small>` : ''}`, 'gold'));
  if (d && d.coins > 0) gains.push(chip(`<img src="assets/hud/ui_Icon_Medal_Gold_01.png" alt="">레이드주화 +${d.coins}`, 'coin'));
  for (const m of (d ? d.mats : []).sort((a, b) => b.n - a.n)) {
    const ic = matIcon(m.id);
    gains.push(chip(`${ic ? `<img src="${ic}" alt="">` : ''}${MATS[m.id].name} +${m.n}`));
  }
  if (d && d.cos > 0) gains.push(chip(`코디 +${d.cos}`, 'cos'));
  const matNames = new Set(Object.values(MATS).map(m => m.name));
  const gear = (G.gained || []).filter(x => !x.startsWith('★') && !x.startsWith('[') && !matNames.has(x));
  if (gear.length) gains.push(chip(`장비 ${gainedSummary(gear, 4)}`, 'gear'));
  out.push(`<div class="r-gains">${gains.join('')}</div>`);
  if (G.promoted) out.push(`<div class="r-promo">${G.promoted.join('<br>')}</div>`);
  const comp = companionSummary() + companionDeeds();
  if (comp) out.push(`<div class="r-comp">${comp.replace(/^<br>/, '').replace(/<br>/g, ' · ')}</div>`);
  if (d && d.quests.length) {
    out.push(`<div class="r-quest">${d.quests.slice(0, 3).map(q => `<span class="${q.done ? 'done' : ''}">${q.week ? '주간' : '오늘'} · ${q.text} ${q.now}/${q.need}${q.done ? ' ✔ 보상 받기' : ''}</span>`).join('')}</div>`);
  }
  try {
    const nc = claimable();
    if (nc) out.push(`<div class="r-quest"><span class="done">관원에게 받을 의뢰 보상 ${nc}개</span></div>`);
    const g = nextGoal(G.cls, true); // (the 의뢰 to claim are listed just above)
    if (g) out.push(`<div class="r-next"><small>다음 목표</small> ${g.text}</div>`);
  } catch (e) { /* the goal is a hint only */ }
  out.push(`<div class="r-skills">${G.skills.map(s => skillName(s.id, s.lv)).join(' · ')}</div>`);
  return out.join('');
}

/** What each companion did in the hunt: 처치, 피해 몫, 회복, 부활 (updateAllies and partyAct count them). */
function companionDeeds() {
  const all = (G.party || []).filter(m => m.deeds);
  if (!all.length) return '';
  const total = Math.max(1, (G.dealt && G.dealt.all || 0) + (G.dealt && G.dealt.ally || 0));
  const rows = all.map(m => {
    const d = m.deeds, t = [`${m.name} 처치 ${d.kills || 0}`];
    if (d.dmg) t.push(`피해 ${Math.round(100 * d.dmg / total)}%`);
    if (d.heal) t.push(`회복 ${shownNum(d.heal)}`);
    if (d.revive) t.push(`부활 ${d.revive}`);
    return t.join(' ');
  });
  return `<br>동료: ${rows.join(', ')}`;
}

/** A special (or 고유, or 코디) found: the field slows for a moment, a pillar of light over the hero,
 *  a gold line in the chat; the results list it first. Not in a 대항전 (its time is shared). */
function specialMoment(name, kind = '스페셜') {
  if (!G || G.over) return;
  if (!G.war) G.slowmo = Math.max(G.slowmo || 0, 0.4);
  if (M.fx.h_levelup) addFx('h_levelup', 0, 2, { anchor: 'bottom', follow: true, scale: 1.3 });
  if (M.fx['131']) addFx('131', 0, -20, { follow: true, scale: 1.2 });
  say(`★ ${kind} 획득! ${name}`, 'loot');
}

/** The 승급 의식 over the results: the hero, 'N차 승급', the title of the step, the new spells
 *  with their icons and the 필살기 it now casts, in 연's 승급 light and sound. A tap closes it. */
function promoCeremony(list) {
  if (!list || !list.length || $('#promo-fx')) return;
  const cls = list[0].cls, top = list[list.length - 1];
  const calm = !!settings.calmFx;
  const names = PROMO_NAMES[cls.id] || [];
  const title = names[top.n - 1] ? ` · ${names[top.n - 1]}` : '';
  const spells = list.flatMap(x => x.ids).slice(0, 6);
  const icons = spells.map(id => {
    const im = skillIcon(id, SKILLS[id].fx);
    return `<span class="pc-sk">${im.outerHTML}<small>${SKILLS[id].name}</small></span>`;
  }).join('');
  const ult = ultLook(cls.id);
  const fx = document.createElement('div');
  fx.id = 'promo-fx';
  fx.className = 'ffx ffx-live ok res' + (calm ? ' calm' : '');
  fx.innerHTML = `<div class="ffx-flash"></div><div class="ffx-card pc-card"><div class="ffx-ico"><img class="pc-hero" src="${heroPicture(cls)}" alt=""></div>`
    + `<b class="pc-n">${top.n}차 승급${title}</b><div class="ffx-name">${cls.name} · 승급 효과 피해 +${Math.round(PROMO_BONUS.dmg * 100 * top.n)}% · 체력 +${PROMO_BONUS.hp * top.n}</div>`
    + (icons ? `<div class="pc-sks">${icons}</div>` : '')
    + `<div class="ffx-msg">필살기: ${ult.name}</div><small class="pc-tap">터치하여 닫기</small></div>`;
  document.body.append(fx);
  const ico = fx.querySelector('.ffx-ico').getBoundingClientRect(), fr = fx.getBoundingClientRect();
  for (const c of ['', ' add']) {
    const cv = document.createElement('canvas');
    cv.className = 'ffx-cv' + c;
    cv.width = 300; cv.height = 240;
    cv.style.left = Math.round(ico.left - fr.left + ico.width / 2 - 150) + 'px';
    cv.style.top = Math.round(ico.top - fr.top + ico.height / 2 - 120) + 'px';
    fx.append(cv);
  }
  const end = () => { forgeSprites = []; fx.remove(); };
  fx.onclick = end;
  forgeSound('promote');
  setTimeout(() => forgeSound('levelup'), 160);
  forgeSprite('131', { scale: 2.2 });
  forgeSprite('h_levelup', { scale: 1.6, delay: 200, dy: -10 });
  forgeSprite('129', { scale: 1.4, delay: 500 });
  setTimeout(() => { if ($('#promo-fx') === fx) end(); }, 6000);
}

function showResults(title) {
  if (!G || G.over) return;
  // 공대 (war.js): the contribution, the tier and its coins, then the war's spotlight result.
  const RW = G.war && G.war.raid;
  if (RW) War.raidEnd(G.cleared && !G.war.wiped, title);
  gatherGear();
  G.over = true;
  // Whatever was open goes: the results are on top of nothing.
  $('#levelup').hidden = true;
  $('#banner').hidden = true;
  clearTimeout(banner.t);
  G.choosing = false;
  G.pendingLevels = 0;
  // 사냥 기믹: 스타일 등급 — money ×1.0~1.3 by the grade.
  const style = G.hunt && G.cleared && !G.dead ? Hunt.grade() : null;
  const huntGold = G.gold;
  if (style) G.gold = Math.round(G.gold * style.k);
  // 의뢰: a conquest graded A or better counts (오늘·이번 주의 '스타일 A 이상'), once a hunt.
  if (style && (style.g === 'S' || style.g === 'A') && !G.styleCounted) { G.styleCounted = true; qstats().styleA++; }
  bankGold();
  keepBuild();
  progress.tradeBuys = {}; // the merchant restocks its materials
  if (G.endless) {
    const st = qstats();
    st.endless = Math.max(st.endless, G.t - G.clearT);
  }
  saveJson('bs_progress', progress);
  if (RW) {
    record();
    audio.play(G.cleared ? 'levelup' : 'lose');
    setTimeout(() => War.raidShow(), 900);
    return;
  }
  $('#over-title').textContent = title;
  $('#over-stats').innerHTML = resultsHTML(style, huntGold);
  // A conquered ground can be hunted on, harder and harder, for its specials.
  $('#keep').hidden = !(G.cleared && !G.dead && !G.stage.raid);
  showScreen('over');
  overWearUI();
  // 승급 의식: a 승급 won on this ground is its own moment over the results.
  const pc = G.promoCeremony;
  if (pc && pc.length && !G.ceremonyShown) { G.ceremonyShown = true; setTimeout(() => { if (!$('#over').hidden) promoCeremony(pc); }, 500); }
}

function leaveHunt() {
  if (G && G.training) return leaveTraining();
  if ($('#promo-fx')) { forgeSprites = []; $('#promo-fx').remove(); } // the 승급 의식 goes with the results
  if (G) {
    if (!G.over) gatherGear();
    record();
    bankGold();
  }
  const cls = G ? G.cls : chosenClass;
  G = null;
  const wb = document.getElementById('war-sb-btn'); // 대항전's 현황 key goes with the war
  if (wb) wb.hidden = true;
  document.body.classList.remove('war');
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
  if (G.war) return; // a war's floored level is not the class's record
  const r = best[G.cls.id];
  // 사냥 기믹: a card past Lv 20 weighs two steps; the record counts the level those make.
  const lvl = G.player.lvl + (G.hunt ? G.hunt.bonusLv : 0);
  if (!r || lvl > r.lvl || (lvl === r.lvl && G.kills > r.kills)) {
    best[G.cls.id] = { lvl, kills: G.kills };
    saveJson('bs_best', best);
  }
  recordCompanions();
}

/** How many 승급 a class has: each tier needs its ground conquered by that class, in order. */
function promoOf(cls) {
  const done = progress.byClass[cls] || {};
  // A later tier's ground conquered brings every 승급 before it (its ground need not be done).
  let n = 0;
  PROMOS[cls].forEach((pr, i) => { if (done[pr.at]) n = i + 1; });
  return n;
}

/** On a conquest: the class's record, and a 승급 when the ground was the next one it needed. */
function promote() {
  // 동료 모드: the player's own characters in the party share the conquest, and its 승급.
  for (const m of G.party || []) {
    if (!m.own) continue;
    const id = m.cls.id, was = promoOf(id);
    (progress.byClass[id] = progress.byClass[id] || {})[G.stage.id] = true;
    const now = promoOf(id);
    if (now > was) {
      say(`${m.name} ${now}차 승급! (함께 깬 ${G.stage.name})`, 'sys');
      G.promoted = (G.promoted || []).concat(`${m.cls.name} ${now}차 승급 (동료)`);
      m.bubble = { text: `${now}차 승급!`, t: G.t };
    }
  }
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
    (G.promoCeremony = G.promoCeremony || []).push({ n: n + 1, cls: G.cls, ids: tierSpells.map(d => Object.keys(SKILLS).find(k => SKILLS[k] === d)) });
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
  if (SH) return;
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

// (the painters are kept functions handed the text and colour: a new closure per call before)
function paintThick(g, x0, y0, text, color) {
  g.fillStyle = '#1a1a1a';
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 2; dy++) if (dx || dy) g.fillText(text, x0 + dx, y0 + dy);
  g.fillStyle = color;
  g.fillText(text, x0, y0);
}
/** Big numbers with a heavy dark edge, as the game shows damage and healing. */
function thick(text, x, y, color) {
  x = Math.round(x);
  y = Math.round(y);
  const e = textPic('t', text, color, paintThick, 3, 3, 3, 4);
  if (e) {
    ctx.drawImage(e.c, x - e.ox, y - e.oy, e.w, e.h);
    return;
  }
  ctx.fillStyle = '#1a1a1a';
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 2; dy++) if (dx || dy) ctx.fillText(text, x + dx, y + dy);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function floatText(x, y, text, color, box = false) {
  if (window.__quietText) return; // test: frames of a skill without the numbers over it
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
  // (hold: a cinematic's frames keep their own time — the 9차 필살기, ultCine9)
  return fxDurs[id] || (fxDurs[id] = M.fx[id].durs.map(d => (M.fx[id].hold ? d : Math.min(d, 110)) / 1000));
}

/** The largest drawn part of a picture's frames, in game pixels² (its cell's when its sheet has no frame boxes). */
const fxAreas = new Map();
function fxDrawnArea(id) {
  let a = fxAreas.get(id);
  if (a !== undefined) return a;
  const f = M.fx[id], src = f.src ? M.fx[f.src] || f : f, k = f.k || 1;
  a = 0;
  if (src.bb && src.bb.length >= 4) for (let i = 0; i + 3 < src.bb.length; i += 4) a = Math.max(a, src.bb[i + 2] * src.bb[i + 3]);
  a = (a || f.w * f.h) * k * k * (f.ky || 1);
  fxAreas.set(id, a);
  return a;
}
/** Starts an effect; returns how long it plays. */
const FX_LEAD = { g_zodiac_turtle: 0.28, g_zodiac_dragon: 0.28, g_zodiac_phoenix: 0.28 };
function addFx(id, x, y, o = {}) {
  if (!M.fx[id]) return 0;
  const life = durs(id).reduce((a, b) => a + b, 0);
  if (G.fxs.length > 260) return life; // a phone draws only so many at once
  if (SH && !SH.draw) return life; // (an AI's cast struck unseen: castAs)
  // a picture that strikes nothing, on a body (o.self: a 기원, a buff, a shield on the hero, a companion, a raid or war
  // fighter): no larger than the body and a little round it (selfCapK)
  // 보이는 범위 = 맞는 범위 (사용자 규칙): a picture on one body (o.body: tiles, fxOn) no larger than that body; o.cap: any
  // picture's longest side at most that many tiles (what its blow strikes). Shrunk about its drawn middle (fxMid), so a
  // picture placed by its middle (fxAt) stays where it was put; one hung from its pivot (연's: the struck one's feet), about it.
  const self = o.self || (FXC && o.follow && !o.must && !o.area && !o.anchor);
  // (and one flying, o.mv — a shot, a thrown blade, a row's arrow —: a body across, what it strikes as it passes)
  const shot = FXC && o.mv && !o.must && !o.area;
  const capT = Math.min(self ? SELF_TILES : 1e9, shot ? ONE_TILES : 1e9, o.body || 1e9, o.cap || 1e9);
  if (capT < 1e9) {
    const sc = o.scale || 1, c = capK(id, sc, capT, o.rot || 0);
    if (c < 1) {
      const f0 = M.fx[id];
      if (!(f0.ax !== undefined && o.anchor !== 'mid') && o.anchor !== 'bottom') {
        let [mx, my] = fxMid(id);
        if (o.flip) mx = -mx;
        if (o.rot) { const cs = Math.cos(o.rot), sn = Math.sin(o.rot); [mx, my] = [mx * cs - my * sn, mx * sn + my * cs]; }
        x += mx * sc * (1 - c); y += my * sc * (1 - c);
      }
      o = { ...o, scale: sc * c };
    }
  }
  // A screen-filling effect (연's 포효검황, 혈겁만파 ...) is shown once at a time, and no more
  // than two of them together: stacked they hid the field and slowed a phone to a crawl.
  // (the drawn part of its frames — packed sheets know each frame's box — not the empty cell round it: a
  // picture fitted to the tiles it strikes (fxTiles) is counted at the size it is drawn)
  const area = fxDrawnArea(id) * (o.scale || 1) ** 2;
  // (o.must: the one picture of a blow's area — 이펙트=판정: a blow is never struck where nothing is drawn)
  if (area > 120000 && !o.must) {
    const big = G.fxs.filter(f => f.big);
    if (big.length >= 2 || big.some(f => f.id === id)) return life;
  }
  // A middling one (a meteor, a pillar of fire) four at a time: the fifth adds nothing to see
  // and much to draw.
  if (area > 12000 && !o.must && G.fxs.filter(f => f.id === id).length >= 4) return life;
  // 연's 신수 각인 pictures open on four frames of a pure white shape (280 ms): started past them,
  // faded in instead (a white pop the size of the beast, seen at every 현무·청룡·주작 격).
  const skip = FX_LEAD[id] || 0;
  G.fxs.push({ uid: ++fxUid, id, x, y, t: skip - (o.delay || 0), life, scale: o.scale || 1, rot: o.rot || 0,
    follow: o.follow, anchor: o.anchor || 'center', big: area > 120000, mv: o.mv, flip: o.flip, tint: o.tint, skip, fadeIn: skip ? 0.2 : 0,
    alpha: o.alpha, on: o.on }); // (o.alpha: an AI fighter's picture, see-through: war.js aiAlpha)
  return life;
}

/**
 * A 기원, a shield or a buff on a body (a companion, a war's or raid's fighter): it stays on that
 * body for its whole life, moving with it (x, y offsets from its feet), and ends when it falls.
 * (They were left where they began: a healed fighter walked out of its 기원.) On the hero: follow.
 */
function fxOnBody(id, b, dy = -26, o = {}) {
  if (!b) return 0;
  if (b === G.player || b.hero) return addFx(id, 0, dy, { ...o, follow: true, self: true });
  return addFx(id, 0, dy, { ...o, on: b, self: true });
}
function fxDone(f) {
  const b = f.on;
  return b && (b.dead || b.down || b.hp <= 0 || (b.war && G.war && !G.war.bodies.includes(b)));
}

function fxFrame(d, t, loop) {
  // (loop: true, or the period it loops over — a held picture loops over the frames that draw, fxLife)
  if (loop) t %= typeof loop === 'number' && loop > 0 ? loop : d.reduce((a, b) => a + b, 0);
  for (let i = 0; i < d.length; i++) {
    t -= d[i];
    if (t < 0) return i;
  }
  return d.length - 1;
}

/**
 * Frame i of effect f on canvas c, its cell's top left at (dx, dy), k canvas pixels a cell pixel.
 * Only the part of the cell that shows is drawn (bb, tools/fx_trim.py: most of a cell is empty, and
 * every pixel drawn is blended). A packed sheet (tools/fx_pack.py: "at") holds just those parts,
 * each at [x, y, w, h] of the sheet, maybe at fewer pixels than the cell's (an effect never drawn
 * as large as its frames): bb stays in the cell's own pixels, so it is drawn the same size.
 */
let fxScaleLog = null; // test (tools/fx_drawscale.json): the largest canvas pixels a cell pixel each sheet is drawn at
function fxBlit(c, pic, f, i, dx, dy, k, sid, kv = k) {
  const sh = f.src ? M.fx[f.src] : f, bb = sh.bb, at = sh.at, b4 = i * 4;
  if (fxScaleLog && sid) { const T = c.getTransform(), q = Math.hypot(T.a, T.b) * k, key = f.src || sid; if (!(fxScaleLog[key] >= q)) fxScaleLog[key] = q; }
  if (at) {
    if (b4 + 3 < at.length && at[b4 + 2]) c.drawImage(pic, at[b4], at[b4 + 1], at[b4 + 2], at[b4 + 3], dx + bb[b4] * k, dy + bb[b4 + 1] * kv, bb[b4 + 2] * k, bb[b4 + 3] * kv);
    return;
  }
  const cols = sh.cols || 1e9, sx = (i % cols) * f.w, sy = Math.floor(i / cols) * f.h;
  if (bb && b4 + 3 < bb.length) {
    if (bb[b4 + 2]) c.drawImage(pic, sx + bb[b4], sy + bb[b4 + 1], bb[b4 + 2], bb[b4 + 3], dx + bb[b4] * k, dy + bb[b4 + 1] * kv, bb[b4 + 2] * k, bb[b4 + 3] * kv);
  } else c.drawImage(pic, sx, sy, f.w, f.h, dx, dy, f.w * k, f.h * kv);
}

// test (보이는 범위 = 맞는 범위): what each picture drew (world pixels, frame by frame) and what was struck, while on
let fxDrawLog = null, fxHitLog = null, fxCur = null, fxUid = 0;
function fxLogDraw(f, i, dx, dy, k, kv, x, y, turn, rot, flip) {
  const sh = f.src ? M.fx[f.src] : f, bb = sh.bb, b4 = i * 4;
  let r = bb && b4 + 3 < bb.length ? [dx + bb[b4] * k, dy + bb[b4 + 1] * kv, bb[b4 + 2] * k, bb[b4 + 3] * kv] : [dx, dy, f.w * k, f.h * kv];
  if (!(r[2] > 0)) return;
  let xs = [r[0], r[0] + r[2]], ys = [r[1], r[1] + r[3]];
  if (turn) {
    const c = Math.cos(rot || 0), sn = Math.sin(rot || 0), px = [], py = [];
    for (const a of xs) for (const b of ys) { const u = flip ? -a : a; px.push(x + u * c - b * sn); py.push(y + u * sn + b * c); }
    xs = px; ys = py;
  }
  const f0 = fxCur;
  if (!f0.uid) f0.uid = ++fxUid;
  const e = fxDrawLog[f0.uid] || (fxDrawLog[f0.uid] = { id: String(f0.id), cast: f0.cast || '', mv: !!f0.mv, follow: !!f0.follow, x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9, fw: 0, fh: 0 });
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  e.x0 = Math.min(e.x0, x0); e.y0 = Math.min(e.y0, y0); e.x1 = Math.max(e.x1, x1); e.y1 = Math.max(e.y1, y1);
  e.fw = Math.max(e.fw, x1 - x0); e.fh = Math.max(e.fh, y1 - y0);
}
window.__clearFoes = () => { for (const e of G.enemies) leave(e); G.enemies.length = 0; timers.length = 0; G.fxs.length = 0; }; // test: the field emptied (and what was still to come)
window.__fxMeasure = on => { const r = { draw: fxDrawLog, hit: fxHitLog }; fxDrawLog = on ? {} : null; fxHitLog = on ? [] : null; return r; };
function drawFx(id, x, y, t, scale, rot, anchor, loop, flip, tint) {
  const f = M.fx[id];
  const im = fxPic(id);
  if (!im) return; // (still loading: drawn from when it is ready)
  const i = fxFrame(durs(id), t, loop) + (f.f0 || 0);
  const w = f.w * scale * (f.k || 1), h = f.h * scale * (f.k || 1) * (f.ky || 1);
  // No save()/restore() round each one: with forty effects up in a crowded fight the restores were
  // a fifth of the frame on a slow phone. The two settings it changes are put back by hand, and the
  // move (with a turn or a flip) undone in reverse.
  const op0 = ctx.globalCompositeOperation, sm0 = ctx.imageSmoothingEnabled;
  if (f.add) ctx.globalCompositeOperation = 'lighter';
  const pic = tint || f.tint ? tinted(im, tint || f.tint) : im;
  // Blown up past its own pixels an effect is drawn smooth, a soft light rather than blocks (and a
  // sheet the build shrank, ds, always: its pixels are no longer the cell's).
  if (scale * (f.k || 1) > 1.5 || (f.src ? M.fx[f.src] : f).ds) ctx.imageSmoothingEnabled = true;
  const turn = rot || flip;
  let ox = x, oy = y;
  if (turn) {
    ctx.translate(x, y);
    if (rot) ctx.rotate(rot);
    if (flip) ctx.scale(-1, 1);
    ox = oy = 0;
  }
  // The cell's top left: 연's effects carry their pivot (the target's feet, a little under a body's
  // middle), the others are centred.
  // (f.ky: a picture stretched up or down to the square it strikes, fxSquare)
  const k = scale * (f.k || 1), kv = k * (f.ky || 1);
  const dx = f.ax !== undefined && anchor !== 'mid' ? ox - f.ax * k : ox - w / 2;
  const dy = f.ax !== undefined && anchor !== 'mid' ? oy - f.ay * kv + (anchor === 'bottom' ? 0 : 14) : oy + (anchor === 'bottom' ? -h : -h / 2);
  // Only the part of the cell that shows (tools/fx_trim.py): most of a cell is empty, and every
  // pixel drawn is blended.
  fxBlit(ctx, pic, f, i, dx, dy, k, id, kv);
  if (fxDrawLog && fxCur) fxLogDraw(f, i, dx, dy, k, kv, x, y, turn, rot, flip);
  if (turn) {
    if (flip) ctx.scale(-1, 1);
    if (rot) ctx.rotate(-rot);
    ctx.translate(-x, -y);
  }
  if (f.add) ctx.globalCompositeOperation = op0;
  ctx.imageSmoothingEnabled = sm0;
}

// ---------------------------------------------------------------- input

const keys = new Set();
addEventListener('keydown', e => {
  keys.add(e.code);
  if (e.code === 'Escape' || e.code === 'KeyP') togglePause();
  if (e.code === 'Space') castUlt();
  if (e.code === 'KeyQ') castUtil();
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') Hunt.dash(); // 사냥 기믹: 질주
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
    g.drawImage(bmSrc(img), 0, 0);
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
  const d = M.beast[b.beast], im = pic(`beast/${b.beast}.png`);
  if (!im) return;
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
    g.drawImage(bmSrc(img), 0, 0);
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
/** Life (green) or mana (blue) given back, in 연's digits over the one healed, as its clips show them. */
/** Money as 연 writes it: 1,500전. */
function won(n) { return Math.round(+n || 0).toLocaleString('ko-KR') + '전'; }
/** The purse as two plain chips, each with its coin: 전 (엽전) and 레이드주화 (the medal). */
function walletHTML(gold, coins) {
  const n = v => Math.round(+v || 0).toLocaleString('ko-KR');
  return `<span class="wallet"><span class="wchip gold"><img src="assets/hud/ui_icon_gold2.png" alt="">${n(gold)}<small>전</small></span>`
    + `<span class="wchip coin"><img src="assets/hud/ui_Icon_Medal_Gold_01.png" alt="">${n(coins)}<small>레이드주화</small></span></span>`;
}

function healText(b, n, up = 64, mana = false) {
  if (M.hud && M.hud.font_dmgk_g && dmgkFont()) {
    if (G.texts.length > 90) G.texts.shift();
    G.texts.push({ x: b.x + rand(-4, 4), y: b.y - up, text: shownNum(n), t: 0, num: true, heal: !mana, mana });
  } else floatText(b.x, b.y - up, '+' + shownNum(n), mana ? '#7ab8ff' : '#7dff8a');
}
/** 연's Korean-unit damage font, where the build has it. */
function dmgkFont() {
  const im = images['hud/font_dmgk_o.png'];
  return M.hud && M.hud.font_dmgk_o && im && im.width ? im : null;
}

// Numbers as 연 shows them: in 만·억·조 ("640억2262만"), at its scale — the game's own figures
// times NUM_SCALE, so a starting blow reads in 만 and a 9차 one in 억, as 연's do.
const NUM_SCALE = 10000;
function korNum(n) {
  n = Math.max(0, Math.round(n));
  const jo = Math.floor(n / 1e12), eok = Math.floor(n / 1e8) % 10000, man = Math.floor(n / 1e4) % 10000;
  if (jo) return `${jo}조${eok ? eok + '억' : ''}`;
  if (eok) return `${eok}억${man ? man + '만' : ''}`;
  if (man) return `${man}만`;
  return String(n);
}
function shownNum(n) {
  return korNum(n * NUM_SCALE);
}
/** A blow's number as 연 floats it: below 1억 the whole of it ("5413만7807"), from 1억 down to 만. */
function hitNum(n) {
  const v = Math.max(0, Math.round(n * NUM_SCALE)), rem = v % 10000;
  return v >= 1e4 && v < 1e8 && rem ? `${Math.floor(v / 1e4)}만${rem}` : korNum(v);
}

function drawDigits(text, x, y, color, k, font = 'font_damage') {
  const f = M.hud[font], sheet = font === 'font_gold' ? goldFont() : font.startsWith('font_dmgk') ? images[`hud/${font}.png`] : digitSheet(color);
  // (by index, no arrays: the numbers are digits and signs, one UTF-16 unit each)
  const gl = f.glyphs;
  let w = 0;
  for (let i = 0; i < text.length; i++) { const g = gl[text[i]]; if (g) w += g[4]; }
  w *= k;
  let cx = x - w / 2;
  for (let i = 0; i < text.length; i++) {
    const g = gl[text[i]];
    if (!g) continue;
    ctx.drawImage(sheet, g[0], g[1], g[2], g[3], Math.round(cx), Math.round(y - f.height * k), g[2] * k, g[3] * k);
    cx += g[4] * k;
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
    // 백호환령부 is not worn on the back: it walks beside the hero (updatePet).
    if (sp === 'cr_sinsu_baekho') continue;
    let v = null;
    // An abyss weapon looks its class's named 연 weapon, dressed (items.js ABYSS_BASE), or where the
    // build lacks that layer a plain iron or steel one (ABYSS_LOOK_TIER).
    const lt = sp && SPECIAL[sp] && SPECIAL[sp].lookTier && SPECIAL[sp].lookTier[cls.id];
    let ab = sp && SPECIAL[sp] && SPECIAL[sp].base && SPECIAL[sp].base[cls.id];
    // A look by star (청룡 심판의낫: ★1-2 청룡, ★3-4 진'청룡, ★5 극'청룡; items.js lookSteps).
    const ls = ab && SPECIAL[sp].lookSteps;
    if (ls) {
      const st = starOf(cls, 'sp:' + sp);
      const at = Object.keys(ls).map(Number).filter(k => k <= st).sort((a, b) => b - a)[0];
      if (at && H.layers[kind] && H.layers[kind]['c' + ls[at]]) ab = [ls[at]];
    }
    // The original's own piece laid on 연's hero (items.js worn, tools/sinsu_worn.py), where the build has it.
    const wn = sp && SPECIAL[sp] && SPECIAL[sp].worn && SPECIAL[sp].worn[cls.id];
    if (wn && H.layers[kind] && H.layers[kind][wn]) v = wn;
    else if (ab && H.layers[kind] && H.layers[kind]['c' + ab[0]]) v = 'c' + ab[0];
    else if (ab && kind === 'weapon' && H.layers[kind] && H.layers[kind][String(ab[0])]) v = String(ab[0]);
    else if (lt !== undefined && lt !== null && map['t' + lt]) v = map['t' + lt];
    else if (sp) v = map[sp] || (SPECIAL[sp] ? map['t' + lookAt(cls.id, kind, specialBase(SPECIAL[sp], cls.id))] : null);
    else if (kind === 'weapon' && t === dragonTier(cls)) {
      // A step the build's map has no sword of its own for: 연's 치장용 of that step (DRAGON_LOOK).
      const step = starOf(cls, `weapon:${t}`), dl = DRAGON_LOOK[cls.id] && DRAGON_LOOK[cls.id][step];
      v = dl && H.layers.weapon && H.layers.weapon['c' + dl] ? 'c' + dl : map['dragon' + step] || map['t' + t];
    } else if (t !== undefined && t >= 0) v = map['t' + lookAt(cls.id, kind, t)];
    // A look the build drew wrong or lacks, by its variant or the piece's name (items.js LOOK_FIX).
    const fx = LOOK_FIX[cls.id] && LOOK_FIX[cls.id][kind];
    const fid = fx && !(v && v[0] === 'c') && ((v && fx[v]) || (t >= 0 && fx[GEAR[cls.id][kind][t]]));
    if (fid && H.layers[kind] && H.layers[kind]['c' + fid]) v = 'c' + fid;
    if (v && H.layers[kind] && H.layers[kind][v]) out[kind] = v;
  }
  // What of the weapon goes behind the body (the 무사's spear shaft, the 격투가's far fist).
  if (out.weapon && H.layers.wback && H.layers.wback[out.weapon]) out.wback = out.weapon;
  // What of an outfit worn as 연's own look is not on the body (the 용 파천·멸아 wings).
  if (out.armor && H.layers.aback && H.layers.aback[out.armor]) out.aback = out.armor;
  // 현무불괴갑's wings, the original's own (items.js wornBack).
  const wb = gear.armorSp && SPECIAL[gear.armorSp] && SPECIAL[gear.armorSp].wornBack;
  if (wb && out.armor && H.layers.aback && H.layers.aback[wb]) out.aback = wb;
  // The 코디 worn over the gear (costume.js): its looks replace the slots' own.
  return costumeVariants(H, gear.cos, out);
}

// ---- a hero's look: its frames made once from 연's layer sheets, the sheets then let go
// A hero's layers are sheets of 4 to 10 MB decoded each, five to nine a look (the 도깨비's and the
// 천인's 190-pixel cells; a 사신수 piece 30 MB): kept, as they were (an <img> each, for good), one
// class's look held 40 to 80 MB, the town's passers-by 130 MB more, and every class tried added its
// own (수련장 through three classes killed a phone's renderer). A look has forty frames (HERO_FRAMES):
// they are composed once (the one asked for at once, the rest a little a frame, heroLooksTick) into
// small pictures, and the sheets are closed (layerDrop) as soon as no look still being made needs
// them. A look not drawn for a while is let go with its frames (heroLooksSweep, heroLooksRelease).
const layerBms = new Map(); // 'yhero2/<file>' -> { bm, p, failed, at }
/** A sheet decoded off the main thread into a bitmap of its own (closed when done with). */
function decodeSheet(path) {
  if (window.createImageBitmap && window.fetch) {
    return fetch('assets/' + path).then(r => (r.ok ? r.blob() : null)).then(bl => (bl ? createImageBitmap(bl) : null)).catch(() => null);
  }
  return new Promise(r => { const im = new Image(); im.onload = () => r(im); im.onerror = () => r(null); im.src = 'assets/' + path; });
}
function layerEntry(path) {
  let e = layerBms.get(path);
  if (!e) {
    e = { bm: null, failed: false, at: 0, p: null };
    layerBms.set(path, e);
    e.p = decodeSheet(path).then(bm => {
      if (layerBms.get(path) !== e) { if (bm && bm.close) bm.close(); return null; }
      e.bm = bm;
      e.failed = !bm;
      return bm;
    });
  }
  return e;
}
function layerDrop(path) {
  const e = layerBms.get(path);
  if (!e) return;
  layerBms.delete(path);
  if (e.bm && e.bm.close) e.bm.close();
  sheetForget(path);
}
/** What was made from a sheet (its recoloured, laid-over and dyed copies, each as big as the sheet). */
function sheetForget(path) {
  for (const k of dressSheets.keys()) if (k.startsWith(path + '|')) dressSheets.delete(k);
  for (const k of classicSheets.keys()) if (k.startsWith(path + '|')) classicSheets.delete(k);
  dropDyed(path.replace(/^yhero2\//, ''));
}
/** The sheets no look still being made needs are closed (one asked for a moment ago is kept: a warm). */
function layerSweep(force, keep) {
  const need = new Set(keep || []), now = performance.now();
  for (const L of heroLooks.values()) if (!L.done) for (const [, , path] of L.parts) need.add(path);
  for (const [path, e] of layerBms) if (!need.has(path) && (force || now - e.at > 4000)) layerDrop(path);
}
/** These sheets are done with (a card's picture made): closed unless a look being made needs them. */
function layerDone(paths) {
  const need = new Set();
  for (const L of heroLooks.values()) if (!L.done) for (const [, , path] of L.parts) need.add(path);
  for (const path of paths) if (!need.has(path)) layerDrop(path);
}

const heroLooks = new Map(); // look key -> { cls, H, want, gear, dz, cl, parts, frames, pts, box, ready, done, used, mine }
const HERO_FRAME_MS = 2;
let heroLoading = 0;
function heroLookParts(H, want) {
  const parts = [];
  for (const [kind, v] of Object.entries(want)) {
    const meta = H.layers[kind] && H.layers[kind][v];
    if (meta) parts.push([kind, meta, 'yhero2/' + meta.file]);
  }
  return parts;
}
/** The look's sheets as they are drawn (dressed, dyed), or null while its body or head is not in.
 *  L.ready once every layer is in (or missing for good). */
function heroLookSheets(L) {
  const { H, gear, dz, cls } = L, sheets = {};
  let all = true;
  for (const [kind, meta, path] of L.parts) {
    const e = layerEntry(path), im = e.bm;
    if (!im) {
      if (!e.failed) all = false;
      // Body and head first: without them nothing is drawn; a piece still loading waits.
      if (kind === 'body' || kind === 'head') {
        // (the build lacks it: the look is given up, so it does not hold a place among the looks loading)
        if (e.failed && !L.done) { L.done = true; if (L.asked) heroLoading--; }
        return null;
      }
      continue;
    }
    // 태초 of the first four: old 바람's picture laid where 연's weapon is held (classicSheet).
    const cl = dz && kind === 'weapon' && L.cl;
    const src = cl ? classicSheet(im, path, cl, H, meta) : null;
    if (cl && !src) {
      // (still loading; a picture the build lacks is not waited for)
      const gp = images[`gear/${M.gear[cl].id}.png`];
      if (!(gp && gp.complete && !gp.naturalWidth)) all = false;
      continue;
    }
    sheets[kind] = { im: dz && (kind === 'weapon' || kind === 'wback') ? dressedSheet(src || im, src ? path + '|' + cl : path, cl ? dz.classicTint : dz.tint, dz.pal, dz.water && waterRows(H, meta)) : dyeImage(armorDressed(gear, kind, im, path), meta), meta };
  }
  if (all && !L.ready) {
    L.ready = true;
    // (the frames made while a piece was still loading are made again with it)
    for (const pic of L.frames.values()) if (pic.close) pic.close();
    L.frames.clear();
    L.pts.clear();
  }
  L.box = frameBox(H, Object.values(sheets).map(x => x.meta));
  return sheets;
}
function heroFrameMake(L, sheets, a, f) {
  const fk = a.row * 64 + f, c = document.createElement('canvas');
  c.width = L.box.cw;
  c.height = L.box.ch;
  if (L.dz && sheets.weapon) L.pts.set(fk, dressFrame(c, L.H, sheets, a, f, L.box, L.dz));
  drawLayers(c.getContext('2d'), L.H, sheets, a, f, L.box);
  L.frames.set(fk, c);
  // (the canvas emptied once its bitmap is made: some two thousand of them left to the collector in
  // the dress room's try-ons were a few hundred MB before it ran)
  if (window.createImageBitmap) createImageBitmap(c).then(bm => { if (L.frames.get(fk) === c) L.frames.set(fk, bm); else bm.close(); c.width = c.height = 0; }).catch(() => {});
  return c;
}
function heroLookDrop(key) {
  const L = heroLooks.get(key);
  if (!L) return;
  heroLooks.delete(key);
  L.gone = true;
  if (!L.done && L.asked) heroLoading--;
  for (const pic of L.frames.values()) if (pic.close) pic.close();
  L.frames.clear();
}
/** Once a drawn frame: the looks whose sheets are in get the rest of their frames, a little at a
 *  time (the hero's own first), and their sheets are then closed. */
function heroLooksTick() {
  if (!heroLooks.size) return;
  const t0 = performance.now();
  let swept = false;
  for (const mine of [true, false]) for (const L of heroLooks.values()) {
    if (L.done || !L.ready || !!L.mine !== mine) continue;
    const sheets = heroLookSheets(L);
    if (!sheets) continue;
    let left = false;
    for (const a of L.anims) {
      for (let f = 0; f < a.n; f++) {
        if (L.frames.has(a.row * 64 + f)) continue;
        if (performance.now() - t0 > HERO_FRAME_MS) { left = true; break; }
        heroFrameMake(L, sheets, a, f);
      }
      if (left) break;
    }
    if (left) return;
    L.done = true;
    if (L.asked) heroLoading--;
    swept = true;
  }
  if (swept) layerSweep(false);
  else if (layerBms.size && !heroLoading) layerSweep(false);
}
/** The looks not drawn for a while are let go (a walker left behind, the gear worn before). */
function heroLooksSweep(now) {
  for (const [key, L] of heroLooks) if (now - L.used > (L.mine ? 20 : 8)) heroLookDrop(key);
}
/** A screen left: everyone's looks but the hero's own are let go at once, and every sheet. */
function heroLooksRelease(cls, gear) {
  for (const [key, L] of heroLooks) if (!L.mine || bitmapClock - L.used > 1) heroLookDrop(key);
  const H = cls && M.yhero2 && M.yhero2[cls.id];
  layerSweep(true, H ? heroLookParts(H, yGearVariants(cls, gear || {})).map(x => x[2]) : null);
  dressSheets.clear();
  classicSheets.clear();
}
/** The look a body wears now (made when first seen). */
function heroLookOf(cls, H, gear, b, want) {
  // An abyss weapon worn: its layers dressed in black, blood and fire (by its rarity).
  let dz = !window.__noDress && gear && gear.weaponSp && SPECIAL[gear.weaponSp] && SPECIAL[gear.weaponSp].dress;
  // The 용무기 제십 after its 천상 각성 (선계의 기운): 선계's light (items.js HEAVEN_DRESS).
  if (!window.__noDress && gear && !gear.weaponSp && gear.weapon >= 0 && gear.weapon === dragonTier(cls)
    && heavenOn(cls.id) && starOf(cls, `weapon:${gear.weapon}`) >= DRAGON_MAX) dz = HEAVEN_DRESS;
  // A 코디 weapon look worn over it (costume.js) is that look's own colours: the weapon's dress
  // (청룡신검's blue, an abyss's black and red) belongs to the weapon's own picture, not to the look
  // put on in its place (a 진일염화검 look over 청룡신검 came out in the dragon's blue).
  if (dz && gear.cos && gear.cos.weapon && want.weapon === 'c' + gear.cos.weapon) dz = null;
  // The original's own piece worn (an "s_" layer) is not recoloured as its stand-in would be.
  if (dz && dz.standIn && want.weapon && want.weapon.startsWith('s_')) dz = null;
  // The 창술사's long spear (laid or 연's own): fewer, smaller fire tongues, so its line still reads.
  if (dz && cls.id === 'lancer') {
    if (!spearDress.has(dz)) spearDress.set(dz, { ...dz, flames: Math.min(dz.flames, 2), fsc: dz.fsc * 0.6, glow: dz.glow * 0.7 });
    dz = spearDress.get(dz);
  }
  // (The worn looks' part of the key made once per look, not each frame: the town's walkers too.)
  if (b.yvKeyOf !== want || b.yvKeyCls !== cls.id) { b.yvKeyOf = want; b.yvKeyCls = cls.id; b.yvKey = cls.id + JSON.stringify(want); }
  const cl = dz ? classicOf(cls, gear) : null;
  const key = b.yvKey + (dz ? '|d' + dz.tint + (dz.pal || '') + (cl ? '|' + cl : '') : '')
    + (gear && gear.armorSp && SPECIAL[gear.armorSp] && SPECIAL[gear.armorSp].dress ? '|a' + gear.armorSp + (gear.cos && gear.cos.armor && gear.cos.armor !== 'hide' ? 'c' : '') : '');
  let L = heroLooks.get(key);
  if (!L) {
    L = { key, cls, H, want, gear, dz: dz || null, cl, parts: heroLookParts(H, want), frames: new Map(), pts: new Map(), box: null,
      anims: Object.values(H.anims), ready: false, done: false, asked: false, used: bitmapClock, mine: false };
    heroLooks.set(key, L);
  }
  return L;
}
/** Draws a hero from 연's layers in the frame's own order; false when the class has none (or its
 *  body is not in yet and it has shown nothing before). */
function drawYhero2(cls, gear, b, x, y, pose, alpha) {
  const H = M.yhero2 && M.yhero2[cls.id];
  if (!H) return false;
  let L = b.yvLook;
  if (!L || L.gone || b.yvGear !== gear || b.yvCos !== costumeVersion() || b.yvCls !== cls.id) {
    const want = (b.yvGear = gear, b.yvCos = costumeVersion(), b.yvCls = cls.id, b.yv = yGearVariants(cls, gear || {}));
    L = b.yvLook = heroLookOf(cls, H, gear, b, want);
  }
  L.used = bitmapClock;
  if (b.hero || b === T) L.mine = true;
  const fdx = b.fdx || 0, fdy = b.fdy === undefined ? 1 : b.fdy;
  const dir = fdx ? 'side' : fdy < 0 ? 'up' : 'down';
  // 'magic' (strikePose: a spell, a 기원, the casters' plain blow) is 연's cast clip; it fell to
  // idle here, so a 마도사's or 주술사's spells went off with the hero standing still.
  const name = { walk: 'walk', attack: 'atk', cast: 'cast', magic: 'cast', idle: 'idle', dead: 'dead' }[pose] || 'idle';
  // A fallen hero is 연's own ghost: the dead frame, the same from every side.
  const a = name === 'dead' && H.anims.dead ? H.anims.dead
    : H.anims[`${name}_${dir}`] || H.anims[`idle_${dir}`] || H.anims.walk_down;
  let f = 0;
  if (name === 'walk') f = Math.floor((b.walkT || 0) / a.ms) % a.n;
  else if (name === 'atk' || name === 'cast') f = Math.min(a.n - 1, Math.floor((1 - Math.max(0, b.poseT) / (name === 'atk' ? 0.22 : 0.3)) * a.n));
  // The layers composited once per frame and kept: six draws from big sheets each frame (연's
  // 도깨비 and 궁사 cells are 193 px a side) were a fifth of a phone's frame.
  const fk = a.row * 64 + f;
  let pic = L.frames.get(fk), S = L;
  if (!pic && !L.done) {
    // (the passers-by and companions one look at a time: a look's sheets are 40 to 80 MB while its frames are made)
    if (!L.asked && (L.mine || heroLoading < 1)) { L.asked = true; heroLoading++; }
    const sheets = L.asked ? heroLookSheets(L) : null;
    if (sheets) pic = heroFrameMake(L, sheets, a, f);
  }
  if (!pic) {
    // Its new look still loading (a piece just put on): the look it showed last, until then.
    S = b.yvShown;
    pic = S && !S.gone && S !== L ? S.frames.get(fk) || S.frames.values().next().value : null;
    if (!pic) return false;
    S.used = bitmapClock;
  } else if (L.ready) b.yvShown = L;
  const { fx, fy } = S.box, mirror = name !== 'dead' && dir === 'side' && fdx > 0;
  ctx.save();
  ctx.globalAlpha = 0.3 * alpha;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(Math.round(x), Math.round(y - 1), 10, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = alpha;
  ctx.translate(Math.round(x), Math.round(y));
  if (mirror) ctx.scale(-1, 1);
  ctx.drawImage(pic, -fx, -fy);
  if (S.dz) drawBladeFlames(S.pts.get(fk), -fx, -fy, S.dz);
  ctx.restore();
  return true;
}
/** A look's sheets asked for ahead (a screen about to show the hero): settles when they are in. */
function heroWarm(cls, gear) {
  const H = M.yhero2 && M.yhero2[cls.id];
  if (!H) return Promise.resolve();
  const want = yGearVariants(cls, gear || {}), wk = JSON.stringify(want);
  // (its frames made already: no sheet is needed)
  for (const L of heroLooks.values()) if (L.done && L.cls === cls && L.frames.size && JSON.stringify(L.want) === wk) return Promise.resolve();
  return Promise.all(heroLookParts(H, want).map(([, , path]) => { const e = layerEntry(path); e.at = performance.now(); return e.p; }));
}

// ---- the abyss weapons' dress (items.js ABYSS_DRESS): 연's weapon, the game's colours over it.
// The weapon layer's sheet recoloured once (black, blood red, ember edges where it was brightest),
// per sheet and strength; with it the swing trail the sheet carries. Each composed hero frame (cached
// as the hero's are) gets a red glow under the weapon and its blade points: a few spots spread along
// the weapon's long axis in that very cell, so the fire follows the blade in every direction and frame.
const dressSheets = new Map();
/** The old 바람 picture the worn special lays over 연's weapon (TAECHO_CLASSIC), when the build has it. */
function classicOf(cls, gear) {
  const sp = gear && gear.weaponSp && SPECIAL[gear.weaponSp];
  const n = sp && sp.classic && sp.classic[cls.id];
  return n && M.gear && M.gear[n] ? n : null;
}
/**
 * 연's weapon sheet with old 바람's picture in its place: in each cell the drawn weapon's long axis
 * (its solid pixels, not the faint swing trail) gives the hand's end (the one nearer the body) and
 * the tip's; the picture (upright, handle down) is turned and sized onto that line. The trail stays
 * behind it and the hand's own pixels over it, so it is held and swings as 연's weapon does.
 */
const classicSheets = new Map();
function classicSheet(im, path, name, H, meta) {
  const key = path + '|' + name;
  let c = classicSheets.get(key);
  if (c) return c;
  const pp = `gear/${M.gear[name].id}.png`;
  if (!(pp in images)) loadImage(pp);
  const pic = images[pp];
  if (!pic || !pic.complete || !pic.width) return null;
  const cw = meta.cell ? meta.cell[0] : H.cell[0], ch = meta.cell ? meta.cell[1] : H.cell[1];
  const ffx = meta.foot ? meta.foot[0] : H.foot[0], ffy = meta.foot ? meta.foot[1] : H.foot[1];
  c = document.createElement('canvas');
  c.width = im.width;
  c.height = im.height;
  const g = c.getContext('2d');
  const src = document.createElement('canvas');
  src.width = im.width;
  src.height = im.height;
  const sg = src.getContext('2d');
  sg.drawImage(im, 0, 0);
  let d;
  try { d = sg.getImageData(0, 0, im.width, im.height); } catch (e) { return null; }
  const p = d.data, W = im.width;
  const skin = i => p[i] > 170 && p[i + 1] > 115 && p[i + 1] < 228 && p[i + 2] < 175 && p[i] - p[i + 2] > 45;
  // The picture's own line (CLASSIC_AXIS), else upright with its handle at the bottom.
  const ax = CLASSIC_AXIS[name] || [pic.width / 2, pic.height, pic.width / 2, 0];
  const pl = Math.hypot(ax[2] - ax[0], ax[3] - ax[1]), pa = Math.atan2(ax[3] - ax[1], ax[2] - ax[0]);
  const trail = document.createElement('canvas'), hand = document.createElement('canvas');
  trail.width = hand.width = W;
  trail.height = hand.height = im.height;
  const td = sg.createImageData(W, im.height), hd = sg.createImageData(W, im.height);
  for (let i = 0; i < p.length; i += 4) {
    const a = p[i + 3];
    if (!a) continue;
    const t = a < 170 ? td.data : skin(i) ? hd.data : null;
    if (t) { t[i] = p[i]; t[i + 1] = p[i + 1]; t[i + 2] = p[i + 2]; t[i + 3] = a; }
  }
  trail.getContext('2d').putImageData(td, 0, 0);
  hand.getContext('2d').putImageData(hd, 0, 0);
  g.drawImage(trail, 0, 0);
  const rows = Math.round(im.height / ch), cols = Math.round(W / cw);
  for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
    const x0 = q * cw, y0 = r * ch, xs = [], ys = [];
    for (let y = y0; y < y0 + ch; y++) for (let x = x0; x < x0 + cw; x++) {
      const i = (y * W + x) * 4;
      if (p[i + 3] >= 170 && !skin(i)) { xs.push(x); ys.push(y); }
    }
    if (xs.length < 8) continue;
    let mx = 0, my = 0;
    for (let k = 0; k < xs.length; k++) { mx += xs[k]; my += ys[k]; }
    mx /= xs.length; my /= xs.length;
    let sxx = 0, syy = 0, sxy = 0;
    for (let k = 0; k < xs.length; k++) { const dx = xs[k] - mx, dy = ys[k] - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
    const th = 0.5 * Math.atan2(2 * sxy, sxx - syy), ux = Math.cos(th), uy = Math.sin(th);
    let lo = 1e9, hi = -1e9;
    for (let k = 0; k < xs.length; k++) { const t = (xs[k] - mx) * ux + (ys[k] - my) * uy; lo = Math.min(lo, t); hi = Math.max(hi, t); }
    const A = [mx + ux * lo, my + uy * lo], B = [mx + ux * hi, my + uy * hi];
    // The hand's end: nearer the body's middle (the feet, half a body up).
    const bx = x0 + ffx, by = y0 + ffy - 24;
    const [grip, tip] = Math.hypot(A[0] - bx, A[1] - by) <= Math.hypot(B[0] - bx, B[1] - by) ? [A, B] : [B, A];
    // (A rod 연 holds pointing down, turned up about the hand: the old staff by the shoulder.)
    if (ax[5] && tip[1] > grip[1]) tip[1] = grip[1] - (tip[1] - grip[1]);
    // (Never shorter than CLASSIC_MIN: 연's rods are short, old 바람's staffs stand to the shoulder.)
    const dl = Math.max(1, Math.hypot(tip[0] - grip[0], tip[1] - grip[1]));
    const len = Math.max(CLASSIC_MIN * (ax[4] || 1), dl * CLASSIC_REACH * (ax[4] || 1));
    // a short drawing lengthened: the grip stays, the tip goes out along the same line
    { const r = len / dl; tip[0] = grip[0] + (tip[0] - grip[0]) * r; tip[1] = grip[1] + (tip[1] - grip[1]) * r; }
    const k = len / pl, ang = Math.atan2(tip[1] - grip[1], tip[0] - grip[0]);
    g.save();
    g.beginPath();
    g.rect(x0, y0, cw, ch);
    g.clip();
    // The handle's end a little behind the hand, the tip out along 연's line.
    g.translate(grip[0] + (tip[0] - grip[0]) * -0.18, grip[1] + (tip[1] - grip[1]) * -0.18);
    g.rotate(ang - pa);
    g.scale(k, k);
    g.translate(-ax[0], -ax[1]);
    g.drawImage(pic, 0, 0);
    g.restore();
  }
  g.drawImage(hand, 0, 0);
  classicSheets.set(key, c);
  return c;
}
// How much longer the old picture is laid than 연's weapon it stands for (its handle reaches past the hand).
const CLASSIC_REACH = 1.22;
// The shortest the old picture is laid (px of the hero's cell): about two thirds of a body.
const CLASSIC_MIN = 34;
/** One pixel of 청룡신검's or 현무불괴갑's stand-in turned toward the original's colours (items.js
 *  SINSU_DRESS). The outline and warm colours (the hand, the skin, a gold hilt) are kept.
 *  cheong (백사월도 → 청룡신검): its red spine and ribbon the dragon's blue, the rest blued steel,
 *  dark navy in the shade, the edge near white. hyeonmu (얼음의경갑 → 현무불괴갑): its blue trims
 *  gold, its pale-blue plates silver-white. */
function sinsuPixel(p, i, t, pal) {
  const r = p[i], g = p[i + 1], b = p[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const v = mx / 255, s = mx ? (mx - mn) / mx : 0;
  if (v < 0.12) return;
  const hsv = (h, ss, vv) => {
    const f = (n, k = (n + h * 6) % 6) => vv - vv * ss * Math.max(0, Math.min(k, 4 - k, 1));
    p[i] = f(5) * 255; p[i + 1] = f(3) * 255; p[i + 2] = f(1) * 255;
  };
  if (pal === 'cheong' && s > 0.5 && g < 0.45 * r && b < 0.6 * r) return hsv(0.585, Math.min(1, s * 0.95), Math.min(1, v * 1.15));
  if (r > b + 25 && r >= g) return;
  let h = 0;
  if (mx !== mn) h = (mx === r ? (g - b) / (mx - mn) + 6 : mx === g ? (b - r) / (mx - mn) + 2 : (r - g) / (mx - mn) + 4) / 6 % 1;
  if (pal === 'hyeonmu' && h > 0.5 && h < 0.72 && s > 0.42) return hsv(0.115, Math.min(1, s * 1.15), Math.min(1, v * 1.12));
  const l = (0.3 * r + 0.59 * g + 0.11 * b) / 255;
  const [tr, tg, tb] = pal === 'cheong'
    ? [12 + Math.pow(l, 1.35) * 235, 30 + Math.pow(l, 1.2) * 225, 62 + l * 200]
    : [20 + l * 245, 20 + l * 245, 26 + l * 240];
  p[i] = r + (Math.min(255, tr) - r) * t;
  p[i + 1] = g + (Math.min(255, tg) - g) * t;
  p[i + 2] = b + (Math.min(255, tb) - b) * t;
}
/** A pixel of a strike frame turned to water (the original 청룡신검's swing: blue-cyan crescents,
 *  white crests): deep blue in the shade, cyan, near white at the top. The outline, the hand and
 *  the hilt's gold are kept (false: left to sinsuPixel). */
function waterPixel(p, i) {
  const r = p[i], g = p[i + 1], b = p[i + 2], l = (0.3 * r + 0.59 * g + 0.11 * b) / 255;
  if (Math.max(r, g, b) < 31 || (r > b + 25 && r >= g) || l < 0.38) return false;
  const u = Math.min(1, (l - 0.38) / 0.58);
  const ramp = [[16, 78, 214], [52, 160, 255], [206, 244, 255]];
  const [a, c] = u < 0.55 ? [ramp[0], ramp[1]] : [ramp[1], ramp[2]], f = u < 0.55 ? u / 0.55 : (u - 0.55) / 0.45;
  p[i] = a[0] + (c[0] - a[0]) * f; p[i + 1] = a[1] + (c[1] - a[1]) * f; p[i + 2] = a[2] + (c[2] - a[2]) * f;
  return true;
}
/** The strike rows of a layer's sheet (its cell height and the rows of the atk clips). */
function waterRows(H, meta) {
  return { ch: meta.cell ? meta.cell[1] : H.cell[1], rows: new Set(['atk_down', 'atk_up', 'atk_side'].map(n => H.anims[n] && H.anims[n].row).filter(r => r !== undefined)) };
}
/** A worn layer as the hero wears it: 현무불괴갑's outfit recoloured (SINSU_DRESS with armor), else as it is. */
function armorDressed(gear, kind, im, path) {
  const az = (kind === 'armor' || kind === 'aback') && gear && gear.armorSp && SPECIAL[gear.armorSp] && SPECIAL[gear.armorSp].dress;
  // (the original's own wings, an "s_" layer, keep their colours; and a 코디 outfit worn over it is
  // that outfit's own colours, not 현무's)
  if (az && gear.cos && gear.cos.armor && gear.cos.armor !== 'hide') return im;
  return az && az.armor && !path.includes('/sinsu/') ? dressedSheet(im, path, az.tint, az.pal) : im;
}
/** The same for a still picture of the hero (the class card): 청룡신검's blade too. */
function sinsuDressed(gear, kind, im, path) {
  const w = (kind === 'weapon' || kind === 'wback') && gear.weaponSp && SPECIAL[gear.weaponSp] && !(gear.cos && gear.cos.weapon);
  return w && w.craft && w.dress && !path.includes('/sinsu/') ? dressedSheet(im, path, w.dress.tint, w.dress.pal) : armorDressed(gear, kind, im, path);
}
function dressedSheet(im, path, t, pal, swing) {
  const k = path + '|' + t + '|' + (pal || '') + (swing ? '|w' : '');
  let c = dressSheets.get(k);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = im.width;
  c.height = im.height;
  const g = c.getContext('2d');
  g.drawImage(im, 0, 0);
  try {
    const d = g.getImageData(0, 0, c.width, c.height), p = d.data, rowPx = c.width * 4;
    for (let i = 0; i < p.length; i += 4) {
      if (!p[i + 3]) continue;
      // 청룡신검's swing (the strike rows): the blade's sweep a crescent of the blue dragon's water.
      if (swing && swing.rows.has(Math.floor(i / rowPx / swing.ch))) { if (waterPixel(p, i)) continue; }
      if (pal === 'cheong' || pal === 'hyeonmu') { sinsuPixel(p, i, t, pal); continue; }
      const l = (0.3 * p[i] + 0.59 * p[i + 1] + 0.11 * p[i + 2]) / 255;
      // 태초 (pal gold): pale gold, lighter, the shading kept; the abyss: black, blood and embers.
      // 천상 각성 (pal heaven): a little toward a cool gold-white, the steel's own shading kept.
      if (pal === 'heaven') {
        p[i] += (Math.min(255, 175 + l * 90) - p[i]) * t;
        p[i + 1] += (Math.min(250, 165 + l * 95) - p[i + 1]) * t;
        p[i + 2] += (Math.min(240, 125 + l * 125) - p[i + 2]) * t;
        continue;
      }
      const r = pal === 'gold' ? Math.min(255, 150 + l * 130) : Math.min(235, Math.max(8, Math.pow(l, 1.6) * 330));
      const gg = pal === 'gold' ? Math.min(248, 115 + l * 140) : Math.min(140, Math.max(0, (l - 0.6) * 260));
      const b = pal === 'gold' ? Math.min(225, 40 + l * 170) : Math.min(20, l * 12);
      p[i] += (r - p[i]) * t;
      p[i + 1] += (gg - p[i + 1]) * t;
      p[i + 2] += (b - p[i + 2]) * t;
    }
    g.putImageData(d, 0, 0);
  } catch (e) { /* a tainted sheet keeps its colours */ }
  dressSheets.set(k, c);
  return c;
}
// (the dress of the 창술사's long spear, by its family's: drawYhero2)
const spearDress = new Map();
function dressFrame(c, H, sheets, a, f, box, dz) {
  // The weapon alone in this cell: its glow under the hero, and the spots its fire stands on.
  const w = document.createElement('canvas');
  w.width = c.width;
  w.height = c.height;
  const wg = w.getContext('2d');
  drawLayers(wg, H, { weapon: sheets.weapon, wback: sheets.wback }, a, f, box);
  const pts = [];
  try {
    const d = wg.getImageData(0, 0, w.width, w.height).data, xs = [], ys = [];
    for (let y = 0; y < w.height; y += 2) for (let x = 0; x < w.width; x += 2) if (d[(y * w.width + x) * 4 + 3] > 100) { xs.push(x); ys.push(y); }
    if (xs.length > 6) {
      let mx = 0, my = 0;
      for (let i = 0; i < xs.length; i++) { mx += xs[i]; my += ys[i]; }
      mx /= xs.length; my /= xs.length;
      let sxx = 0, syy = 0, sxy = 0;
      for (let i = 0; i < xs.length; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
      const th = 0.5 * Math.atan2(2 * sxy, sxx - syy), ux = Math.cos(th), uy = Math.sin(th);
      const ts = xs.map((x, i) => (x - mx) * ux + (ys[i] - my) * uy), order = ts.map((t, i) => i).sort((i, j) => ts[i] - ts[j]);
      const n = dz.flames;
      for (let k = 0; k < n; k++) {
        const i = order[Math.round((0.08 + 0.84 * (n > 1 ? k / (n - 1) : 0.5)) * (order.length - 1))];
        pts.push([xs[i], ys[i]]);
      }
    }
  } catch (e) { /* no fire on a tainted sheet */ }
  if (dz.glow > 0) {
    const g = c.getContext('2d');
    g.save();
    g.filter = 'blur(2px)';
    g.globalAlpha = dz.glow;
    const r = document.createElement('canvas');
    r.width = w.width;
    r.height = w.height;
    const rg = r.getContext('2d');
    rg.drawImage(w, 0, 0);
    rg.globalCompositeOperation = 'source-in';
    rg.fillStyle = dz.glowColor || '#ff2a0a';
    rg.fillRect(0, 0, r.width, r.height);
    g.drawImage(r, 0, 0);
    g.drawImage(r, 0, 0);
    // 태초: a wider gold light, and a white core hugging the weapon.
    if (dz.core) {
      g.filter = 'blur(5px)';
      g.drawImage(r, 0, 0);
      rg.fillStyle = dz.core;
      rg.fillRect(0, 0, r.width, r.height);
      g.filter = 'blur(1px)';
      g.globalAlpha = Math.min(1, dz.glow * 1.1);
      g.drawImage(r, 0, 0);
    }
    g.restore();
  }
  return pts;
}
// The fire: 연's archer 화염벽, each of its frames cut into its three tongues, deepened to blood orange.
const flameSets = new Map();
let flameTongues = null;
function tongues(color = '#ff8c4c') {
  flameTongues = flameSets.get(color) || null;
  if (flameTongues) return flameTongues.length ? flameTongues : null;
  const fm = M.fx.k_a_firewall, path = fm && `fx/${fm.src || 'k_a_firewall'}.png`;
  if (!fm) return flameSets.set(color, []), (flameTongues = []), null;
  const im = fxPic('k_a_firewall');
  if (!im || !im.complete || !im.width) return null;
  const out = [], cols = (fm.src ? M.fx[fm.src].cols : fm.cols) || 1e9, n = Math.min(durs('k_a_firewall').length, 24);
  for (let k = 0; k < n; k++) {
    const sx = (k % cols) * fm.w, sy = Math.floor(k / cols) * fm.h;
    for (let t = 0; t < 3; t++) {
      const c = document.createElement('canvas'), tw = Math.floor(fm.w / 3);
      c.width = tw;
      c.height = fm.h;
      const g = c.getContext('2d');
      g.drawImage(im, sx + t * tw, sy, tw, fm.h, 0, 0, tw, fm.h);
      g.globalCompositeOperation = 'multiply';
      g.fillStyle = color;
      g.fillRect(0, 0, tw, fm.h);
      // 태초's light: the tongue's own shape, lifted to gold-white.
      if (color !== '#ff8c4c') { g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.45; g.fillRect(0, 0, tw, fm.h); g.globalAlpha = 1; }
      g.globalCompositeOperation = 'destination-in';
      g.drawImage(im, sx + t * tw, sy, tw, fm.h, 0, 0, tw, fm.h);
      out.push(c);
    }
  }
  flameSets.set(color, out);
  return (flameTongues = out);
}
function drawBladeFlames(pts, ox, oy, dz) {
  const T = pts && pts.length && tongues(dz.pal === 'gold' || dz.pal === 'heaven' ? '#ffe7a0' : undefined);
  if (!T) return;
  const now = performance.now() / 70;
  for (let j = 0; j < pts.length; j++) {
    const im = T[(Math.floor(now) + j * 7) % T.length], k = 0.2 * dz.fsc * (0.85 + 0.3 * ((j * 37) % 10) / 10);
    const w = im.width * k, h = im.height * k;
    ctx.drawImage(im, ox + pts[j][0] - w / 2, oy + pts[j][1] - h * 0.85, w, h);
  }
}

/** Draws a hero from 연's sheet; false when there is none for the class. */
function drawYhero(clsId, armor, b, x, y, pose, alpha) {
  const yh = yheroKey(clsId, armor);
  if (!yh) return false;
  const fdx = b.fdx || 0, fdy = b.fdy === undefined ? 1 : b.fdy;
  const dir = fdx ? 'side' : fdy < 0 ? 'up' : 'down';
  const name = { walk: 'walk', attack: 'atk', cast: 'cast', magic: 'cast', idle: 'idle' }[pose] || 'idle';
  const a = yh.u.anims[`${name}_${dir}`] || yh.u.anims[`idle_${dir}`] || yh.u.anims.walk_down;
  let f = 0;
  if (name === 'walk') f = Math.floor((b.walkT || 0) / a.ms) % a.n;
  else if (name === 'atk' || name === 'cast') f = Math.min(a.n - 1, Math.floor((1 - Math.max(0, b.poseT) / (name === 'atk' ? 0.22 : 0.3)) * a.n));
  drawYunit(yh, b, x, y, 1, alpha, a.row, f, dir === 'side' && fdx > 0);
  return true;
}

// ---------------------------------------------------------------- 끝없는 지옥
// The deepest ground is lit only by a torch round the hero, as Diablo's cellars: a near-black
// shade with a flickering hole where the hero stands, a veil of dried blood left even in the
// light, and faint holes round its leaders and the boss so they loom up before they reach the
// light. The monsters are darkened (their leaders blood-cast) copies made once. Everything is
// 연's own picture under these code passes (no drawn art). The shade is drawn at a fifth of
// the screen's size and stretched (it is all soft gradients): one small canvas, a few gradient
// fills and one drawImage a frame (full-size blend passes halved the frame rate at 4x CPU).
const ABYSS_TINT = 'brightness(0.6) saturate(0.55)';
const ABYSS_LEAD_TINT = 'brightness(0.75) sepia(0.6) hue-rotate(-28deg) saturate(2.2)';
const ABYSS_Q = 5;
let abyssShade = null, abyssTickMade = 0;
const abyssHalf = document.createElement('canvas');
// The two soft discs the darkness is made of, drawn once.
const ABYSS_STAMP = (() => {
  const disc = stops => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 4, 32, 32, 32);
    for (const [at, col] of stops) gr.addColorStop(at, col);
    x.fillStyle = gr;
    x.fillRect(0, 0, 64, 64);
    return c;
  };
  return { light: disc([[0, 'rgba(0,0,0,1)'], [0.55, 'rgba(0,0,0,0.75)'], [1, 'rgba(0,0,0,0)']]),
    fog: disc([[0, 'rgba(30,22,22,0.32)'], [1, 'rgba(30,22,22,0)']]) };
})();
function drawAbyss(px, py, camX, camY) {
  const q = ABYSS_Q, w = Math.ceil(canvas.width / q), h = Math.ceil(canvas.height / q);
  if (!abyssShade || abyssShade.width !== w || abyssShade.height !== h) {
    abyssShade = document.createElement('canvas');
    abyssShade.width = w;
    abyssShade.height = h;
  }
  const t = G.t, sx = x => (x - camX) * Z, sy = y => (y - camY) * Z;
  const onScreen = (x, y) => x > -80 && y > -80 && x < canvas.width + 80 && y < canvas.height + 80;
  // The shade is made anew every third frame (the camera keeps the hero still on screen, so only
  // the far lights lag a frame or two); drawn every frame.
  G.abyssTick = (G.abyssTick || 0) + 1;
  if (G.abyssTick % 3 === 1 || abyssShade.made !== G) {
    abyssShade.made = G;
    abyssTickMade = G.abyssTick;
    const g = abyssShade.getContext('2d');
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(26,3,2,0.97)';
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'destination-out';
    // A light is one soft disc stamp, drawn at its size and strength (no gradient made a frame).
    const hole = (x, y, r, a) => {
      x /= q; y /= q; r /= q;
      g.globalAlpha = a;
      g.drawImage(ABYSS_STAMP.light, x - r, y - r, 2 * r, 2 * r);
    };
    // The torch: it breathes and flickers.
    const flick = 1 + 0.05 * Math.sin(t * 13) + 0.035 * Math.sin(t * 31 + 1.3) + 0.02 * Math.sin(t * 7.7);
    const light = (G.stage.abyss && G.stage.abyss.light) || 0.36;
    hole(px, py, Math.min(canvas.width, canvas.height) * light * flick, 0.8);
    let fires = 0; // six burning at most: the rest stay dark
    for (const e of G.enemies) {
      // 연's cursed torches (저주받은 횃불) carry their own fire.
      if (e.m.id === 'y304170') { const x = sx(e.x), y = sy(e.y - 30); if (fires < 6 && onScreen(x, y)) { hole(x, y, Z * 34 * flick, 0.6); fires++; } continue; }
      if (!e.kind || e.kind === 'minion') continue;
      hole(sx(e.x), sy(e.y - 20), Z * (e.kind === 'boss' ? 60 : 32), e.kind === 'boss' ? 0.5 : 0.32);
    }
    // The floor's fires (연's torch among its props), a spell's flash, a drop's beam.
    for (const b of G.seenProps || []) {
      if (M.prop[b.prop] && M.prop[b.prop][3] === 'torch') hole(sx(b.x), sy(b.y - 20), Z * 40 * (1 + 0.08 * Math.sin(t * 9 + b.x)), 0.7);
    }
    let n = 0;
    for (const f of G.fxs) {
      if (n >= 6 || f.t < 0) continue;
      const x = sx(f.x), y = sy(f.y);
      if (onScreen(x, y)) { hole(x, y, Z * 30, 0.45); n++; }
    }
    for (const d of G.drops) if (d.beam) hole(sx(d.x), sy(d.y - 20), Z * 26, 0.6);
    // Fog: slow banks of murk drifting over even what the torch lights.
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    for (let i = 0; i < 3; i++) {
      const fx = (((t * (6 + i * 3) + i * 211 - camX * 0.6) % 900) + 900) % 900 * Z / q - 100, fy = ((i * 0.33 + 0.12) * h);
      const fr = (120 + i * 40) * Z / q;
      g.drawImage(ABYSS_STAMP.fog, fx - fr, fy - fr, 2 * fr, 2 * fr);
    }
  }
  // Stretched smooth (it is all soft gradients) into a half-size canvas when it is made, and that
  // drawn up blocky: a smooth stretch to the whole screen each frame cost a slow phone 4 ms.
  const sm = ctx.imageSmoothingEnabled;
  if (abyssHalf.made !== abyssShade.made || abyssHalf.tick !== abyssTickMade) {
    const hw = Math.ceil(canvas.width / 2), hh = Math.ceil(canvas.height / 2);
    if (abyssHalf.width !== hw || abyssHalf.height !== hh) { abyssHalf.width = hw; abyssHalf.height = hh; }
    const hg = abyssHalf.getContext('2d');
    hg.imageSmoothingEnabled = true;
    hg.clearRect(0, 0, hw, hh);
    hg.drawImage(abyssShade, 0, 0, w * q / 2, h * q / 2);
    abyssHalf.made = abyssShade.made;
    abyssHalf.tick = abyssTickMade;
  }
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(abyssHalf, 0, 0, abyssHalf.width * 2, abyssHalf.height * 2);
  ctx.imageSmoothingEnabled = sm;
  // A dropped weapon's beam shines through the dark, as Diablo's do.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const d of G.drops) {
    if (!d.beam) continue;
    const x = sx(d.x), y = sy(d.y), bh = Z * 110, a = 0.55 + 0.2 * Math.sin(t * 5 + d.x);
    const bg = ctx.createLinearGradient(0, y - bh, 0, y);
    bg.addColorStop(0, 'rgba(0,0,0,0)');
    bg.addColorStop(1, d.beam);
    ctx.globalAlpha = a;
    ctx.fillStyle = bg;
    ctx.fillRect(x - Z * 4, y - bh, Z * 8, bh);
  }
  ctx.restore();
}

// ---------------------------------------------------------------- 연's own monsters
// The monsters as 바람의나라 연 draws them (tools/yeon_units.py): a sheet per monster with walk,
// idle, attack and death in three directions (the side one faces left; mirrored for right),
// every frame standing on the same foot point. Loaded the first time the monster is drawn.

// (its path and its answer kept by the unit's id: a new string and object per body per frame before)
const yunitSeen = new Map();
function yunit(m) {
  const u = M.yunit && M.yunit[m.id];
  if (!u) return null;
  let c = yunitSeen.get(m.id);
  if (!c) yunitSeen.set(m.id, (c = { path: `yunit/${m.id}.png`, r: null }));
  const path = c.path;
  if (!(path in images)) loadImage(path);
  const im = images[path];
  if (!(im && im.complete && im.width)) return null;
  if (!c.r || c.r.u !== u || c.r.im !== im) c.r = { u, im };
  return c.r;
}

// Units whose 연 attack row reads badly here and strike from their standing pose instead
// (their attack sinks into the ground or fades out and back, which flickers at this size):
// 반고 (삼두룡), 용마 (청기린), 폭염왕 (화령), 고균도 저주의 추장, 숭숭이 (제천대성).
const STILL_ATK = new Set(['y606011', 'y304624', 'y511013', 'y611001', 'y617201']);
/** Which row: the way it last moved (or faces), and what it is doing. */
// The rows a unit has for each way it faces, looked up once (a crowd made a dozen arrays and
// strings each a frame), and one answer reused: every caller reads it at once.
const yunitRows = new WeakMap(), yunitOut = { a: null, f: 0, dir: '', dx: 0 };
function yunitRowsOf(u, dir) {
  let R = yunitRows.get(u);
  if (!R) yunitRows.set(u, (R = {}));
  if (!R[dir]) {
    const pick = (...names) => names.map(n => u.anims[n]).find(Boolean);
    R[dir] = { atk: pick(`atk_${dir}`, 'atk_side', 'atk_down'), walk: pick(`walk_${dir}`, 'walk_side', 'walk_down'), idle: pick(`idle_${dir}`) };
  }
  return R[dir];
}
function yunitAnim(u, b) {
  const dx = b.mdx || 0, dy = b.mdy === undefined ? 1 : b.mdy;
  const dir = dx ? 'side' : dy < 0 ? 'up' : 'down';
  const R = yunitRowsOf(u, dir), atk = R.atk, o = yunitOut;
  o.dir = dir;
  o.dx = dx;
  if (atk && b.atkAt !== undefined && !STILL_ATK.has((b.m && b.m.id) || b.unit) && (G.t - b.atkAt) * 1000 < atk.n * atk.ms) {
    o.a = atk;
    o.f = Math.min(atk.n - 1, Math.floor((G.t - b.atkAt) * 1000 / atk.ms));
    return o;
  }
  const walk = R.walk, idle = R.idle;
  // A unit that never walks (연's cursed torch) keeps standing in its idle row as it moves.
  const a = (b.moving || !idle) && walk ? walk : idle || walk;
  if (!a) return null;
  b.seed = b.seed || Math.floor(Math.random() * 1000);
  o.a = a;
  o.f = Math.floor((performance.now() + b.seed) / a.ms) % a.n;
  return o;
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
    g.drawImage(bmSrc(im), sx, sy, w, h, 0, 0, w, h);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = '#fff';
    g.fillRect(0, 0, w, h);
    whiteFrames.set(k, c);
  }
  return c;
}

// The shadow under a monster's feet: its ellipse drawn once into a small picture (by its size, in
// half pixels, at the screen's scale) and laid down with the shadow's alpha; a crowd of ninety
// filled ninety ellipse paths a frame.
const shadowPics = new Map();
function footShadow(x, y, rx, ry, a) {
  const sc = Math.fround(xa); // (the canvas's scale, followed: xfFollow; kept in single precision there)
  rx = Math.round(rx * 2) / 2;
  ry = Math.round(ry * 2) / 2;
  const key = rx * 1000 + ry + sc * 1e7;
  let e = shadowPics.get(key);
  if (!e) {
    const c = document.createElement('canvas'), mx = Math.ceil(rx) + 1, my = Math.ceil(ry) + 1;
    c.width = Math.ceil(2 * mx * sc);
    c.height = Math.ceil(2 * my * sc);
    const g = c.getContext('2d');
    g.scale(sc, sc);
    g.fillStyle = '#000';
    g.beginPath();
    g.ellipse(mx, my, rx, ry, 0, 0, Math.PI * 2);
    g.fill();
    e = { c, mx, my, w: c.width / sc, h: c.height / sc };
    if (shadowPics.size > 400) shadowPics.clear();
    shadowPics.set(key, e);
  }
  ctx.globalAlpha = a;
  ctx.drawImage(e.c, x - e.mx, y - e.my, e.w, e.h);
}

function drawYunit(y, b, x, yy, s, alpha, row, f, mirror) {
  const { u, im } = y, [cw, ch] = u.cell, [fx, fy] = u.foot;
  const w = cw * s, h = ch * s;
  const a0 = ctx.globalAlpha;
  footShadow(Math.round(x), Math.round(yy - 1), Math.max(6, (u.foot_w || 16) * s * 0.6), 3.5 * s, 0.3 * alpha);
  // (no save/restore: the alpha is set back and a mirror's move undone by hand)
  ctx.globalAlpha = alpha;
  const X = Math.round(x), Y = Math.round(yy);
  if (mirror) {
    ctx.translate(X, Y);
    ctx.scale(-1, 1);
  }
  const ox = mirror ? 0 : X, oy = mirror ? 0 : Y;
  const cols = u.cols || 1e9, sx = (f % cols) * cw, sy = (row + Math.floor(f / cols)) * ch;
  ctx.drawImage(monsterTint ? tinted(im, monsterTint) : im, sx, sy, cw, ch, ox - fx * s, oy - fy * s, w, h);
  // The flash fades as it goes and never quite hides the monster: a blink of white, not a white shape.
  if (b.flash > 0) {
    ctx.globalAlpha *= Math.min(1, b.flash / 0.12) * hitWhite(b);
    ctx.drawImage(whiteFrame(im, sx, sy, cw, ch), ox - fx * s, oy - fy * s, w, h);
  }
  if (mirror) {
    ctx.scale(-1, 1);
    ctx.translate(-X, -Y);
  }
  ctx.globalAlpha = a0;
}

function drawMonster(b, x, y, s, alpha = 1) {
  // A raid boss is struck all the time by twenty-five: with the white flash on it would stay a
  // pale shape. It is drawn without it (the numbers show the blows).
  if (b.kind === 'boss' && b.flash > 0 && G.war && G.war.raid) {
    const fl = b.flash;
    b.flash = 0;
    drawMonster(b, x, y, s, alpha);
    b.flash = fl;
    return;
  }
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
  if (b.flash > 0) {
    ctx.globalAlpha *= Math.min(1, b.flash / 0.12) * hitWhite(b);
    ctx.drawImage(white(img), -w / 2, -h / 2, w, h);
  }
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
    ctx.globalAlpha = alpha * (settings.calmFx ? 0.35 : 1);
    ctx.drawImage(white(img), -w / 2, -h, w, h);
  }
  ctx.restore();
}

/** 연's white target frame (Atlas Frame_Select) over the monster the hero's blows go to: the nearest. */
function drawTargetFrame() {
  const im = images['hud/ui_frame_select.png'];
  if (!im || !im.width || !G || G.over || G.war) return;
  const p = G.player;
  if (!(G.t - (G.tfT || -9) < 0.25 && G.tf && G.enemies.includes(G.tf) && !G.tf.dying)) {
    let best = null, bd = 49;
    for (const e of G.enemies) {
      if (e.dying) continue;
      const d = (e.tx - p.tx) ** 2 + (e.ty - p.ty) ** 2;
      if (d < bd) { bd = d; best = e; }
    }
    G.tf = best;
    G.tfT = G.t;
  }
  const e = G.tf;
  if (!e) return;
  const h = Math.min(90, (e.m.h || 32) * (e.scale || 1)), sz = Math.max(26, Math.min(70, h * 0.9));
  ctx.save();
  ctx.globalAlpha = 0.55 + 0.15 * Math.sin(G.t * 6);
  ctx.drawImage(im, Math.round(e.x - sz / 2), Math.round(e.y - h / 2 - sz / 2), Math.round(sz), Math.round(sz));
  ctx.restore();
}

// The ground under the bodies (a map's pieces, or a terrain's pattern) drawn into a buffer a margin
// wider than the view and painted again only when the view leaves it: each frame is then one
// straight copy of opaque pixels (a black fill, the ground's pieces and a second black fill under
// them were three passes over the screen every frame, the costliest of a slow phone's drawing).
const groundBuf = { c: null, g: null, key: null, z: 0, x0: 0, y0: 0, ok: false, tries: 0 };
const GROUND_MARGIN = 112;

/** The ground for the view at camX, camY. paint(g, x, y, w, h) paints that part of the world into
 *  g (its transform set, black under it) and returns false while one of its pieces is still loading. */
function drawGroundCached(key, camX, camY, paint) {
  const B = groundBuf, m = GROUND_MARGIN;
  const w = Math.ceil((VW + 2 * m) * Z), h = Math.ceil((VH + 2 * m) * Z);
  if (!B.c || B.c.width !== w || B.c.height !== h) {
    B.c = document.createElement('canvas');
    B.c.width = w;
    B.c.height = h;
    B.g = B.c.getContext('2d', { alpha: false });
    B.key = null;
  }
  const out = camX < B.x0 || camY < B.y0 || (camX + VW - B.x0) * Z > w || (camY + VH - B.y0) * Z > h;
  if (B.key !== key || B.z !== Z || out || (!B.ok && B.tries++ % 6 === 0)) {
    B.x0 = Math.round(camX - m);
    B.y0 = Math.round(camY - m);
    B.key = key;
    B.z = Z;
    const g = B.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#000';
    g.fillRect(0, 0, w, h);
    g.setTransform(Z, 0, 0, Z, -B.x0 * Z, -B.y0 * Z);
    // (a piece that never comes is let be after a while: the rest is not painted again for it)
    B.ok = paint(g, B.x0, B.y0, w / Z, h / Z) !== false || B.tries > 120;
    if (B.ok) B.tries = 0;
  }
  const t = ctx.getTransform();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(B.c, Math.round((camX - B.x0) * Z), Math.round((camY - B.y0) * Z), canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
  ctx.setTransform(t);
}

/**
 * The camera (2차 피드백: the lead made walking sway and sick). By default it is held on the hero
 * exactly — the hero's own glide from tile to tile, rounded to whole pixels, nothing eased on top
 * — so it never runs ahead, overshoots or swings back. Only a jump of more than a tile and a half
 * in one frame (a blink, a 순간이동) is eased over about a tenth of a second instead of cut.
 * 「카메라 앞보기」 (설정, off by default) adds a short lead of one tile the way the player steers
 * (their keys, not the way a spell turned the hero), eased in and out slowly and without overshoot.
 */
function camLead(now) {
  const L = G.camLead || (G.camLead = { x: 0, y: 0, at: now });
  const dt = Math.min(0.1, Math.max(0, now - L.at));
  L.at = now;
  const p = G.player;
  let tx = 0, ty = 0;
  if (settings.camLead && !G.training && !G.dead && !G.paused && !G.choosing && p.moving) {
    const dx = settings.tiles || G.war ? p.inDx || 0 : p.fdx || 0, dy = settings.tiles || G.war ? p.inDy || 0 : p.fdy || 0;
    const far = TILE * (G.war || G.stage.raid ? 0.5 : 1);
    tx = dx * far;
    ty = dy * far;
  }
  const moving = tx || ty, k = 1 - Math.exp(-dt / (moving ? 0.5 : 0.8) * 2.3);
  // (the hero standing still a blink between tiles keeps the lead: only a real stop eases back)
  if (!moving && G.t - (G.steerAt ?? -9) < 0.2) return L;
  L.x += (tx - L.x) * k;
  L.y += (ty - L.y) * k;
  if (Math.abs(L.x - tx) < 0.3) L.x = tx;
  if (Math.abs(L.y - ty) < 0.3) L.y = ty;
  return L;
}

/** Where the camera looks (world pixels): the hero, or eased toward it after a jump. */
function camFollow(now, lead) {
  const p = G.player, C = G.camAt || (G.camAt = { x: p.x, y: p.y, at: now });
  const dt = Math.min(0.1, Math.max(0, now - C.at));
  C.at = now;
  // (a dash seen travelling its path — p.glide: the camera goes along with the hero as drawn)
  if (p.glide && G.t - p.glide.t < p.glide.d) {
    const g = glideAt(p);
    C.x = g.x; C.y = g.y; C.easing = false;
    return [Math.round(C.x + lead.x - VW / 2), Math.round(C.y + lead.y - 30 - VH / 2)];
  }
  const far = Math.hypot(p.x - C.x, p.y - C.y);
  if (far > TILE * 1.5 && far < TILE * 30 && !C.easing) C.easing = true;
  if (C.easing) {
    const k = 1 - Math.exp(-dt / 0.1 * 2.3);
    C.x += (p.x - C.x) * k;
    C.y += (p.y - C.y) * k;
    if (Math.hypot(p.x - C.x, p.y - C.y) < 2) C.easing = false;
  }
  if (!C.easing) { C.x = p.x; C.y = p.y; }
  return [Math.round(C.x + lead.x - VW / 2), Math.round(C.y + lead.y - 30 - VH / 2)];
}

// Back to front by the feet, in place, those at the same height kept in their order (as the
// stable sort kept them). A loop of its own rather than sort with a comparator: each of the
// thousand calls of a crowd made new numbers (the feet read out, the difference handed back).
function sortByFeet(list) {
  for (let i = 1; i < list.length; i++) {
    const b = list[i], y = b.y;
    if (!(list[i - 1].y > y)) continue;
    let lo = 0, hi = i - 1;
    // (the first place whose y is past this one's: after every equal one)
    while (lo < hi) { const m = (lo + hi) >> 1; if (list[m].y > y) hi = m; else lo = m + 1; }
    for (let j = i; j > lo; j--) list[j] = list[j - 1];
    list[lo] = b;
  }
  return list;
}
function render(now) {
  sweepBitmaps(now);
  heroLooksTick();
  ctx.imageSmoothingEnabled = false;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (!G) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (T && !$('#town').hidden) drawTown(now);
    else drawMenuBackdrop(now);
    return;
  }
  const p = G.player;
  let [camX, camY] = camFollow(now, camLead(now));
  // 대항전 (war.js): the camera stays on the battlefield's map.
  if (G.war) [camX, camY] = War.cam(camX, camY);
  if (G.arena) [camX, camY] = Hunt.cam(camX, camY); // 사냥 기믹: held inside the map
  // 수련장: the hero and the dummy in the middle of what the panel leaves free.
  if (G.training) camX -= trainShift();
  G.camView = [camX, camY]; // (where it looks before any shake: tests trace it)
  // The screen shakes only for the big moments (a boss's slam, a 일망타진, the hero's 필살기): the
  // small knocks of every blow and 치명타 no longer jitter it (they ran together into a constant
  // tremble). Small, a smooth sway rather than a jump each frame, fading out; none with 번쩍임 줄이기.
  if (G.shake >= 0.3 && !settings.calmFx) {
    const a = Math.min(2, (G.shake - 0.2) * 5), w = G.t * 38;
    camX += Math.round(a * Math.sin(w));
    camY += Math.round(a * 0.7 * Math.cos(w * 1.3));
  }
  ctx.setTransform(Z, 0, 0, Z, -camX * Z, -camY * Z);
  if (G.war && !G.war.raid) {
    War.drawMap(camX, camY);
    War.drawGround();
  } else if (G.arena) Hunt.drawMap(ctx, camX, camY); // 사냥 기믹: 연's own map of the ground
  else {
    // (every ground covers the whole view: no black fill under it)
    const pat = G.ground;
    drawGroundCached(pat, camX, camY, (g, x, y, w, h) => { g.fillStyle = pat; g.fillRect(x, y, w, h); });
    if (G.war) War.drawGround(); // 공대: the arena's edge and the camp
  }

  // On the ground: experience, money, boxes.
  for (const d of G.drops) {
    const im = d.kind === 'gear' ? gearImage(d.gear) : d.kind === 'mat' ? matImage(d.mat)
      : images[`item/${M.items[d.kind].id}.png`];
    if (!im) continue;
    if (d.beam) {
      // Diablo's drop beam: a column of the rarity's colour over the piece, breathing.
      const bh = 90, a = 0.5 + 0.2 * Math.sin(now * 5);
      const bg = ctx.createLinearGradient(0, d.y - bh, 0, d.y);
      bg.addColorStop(0, 'rgba(0,0,0,0)');
      bg.addColorStop(1, d.beam);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = bg;
      ctx.fillRect(Math.round(d.x - 5), Math.round(d.y - bh), 10, bh);
      ctx.restore();
    }
    ctx.drawImage(im, Math.round(d.x - im.width / 2), Math.round(d.y - im.height - 2 + Math.sin(now * 4) * 1.5));
  }

  if (G.hunt) Hunt.ground(ctx); // 사냥 기믹: the objective, the bog
  drawGyeokGround(); // 격's grounds and marks
  // A raid boss's marked tiles, blinking red until they are struck.
  for (const mk of G.marks) {
    // a soft pulse 1.5 a second (it blinked hard 4 a second); steady with 번쩍임 줄이기
    const pulse = settings.calmFx ? 0.5 : 0.5 + 0.5 * Math.sin((G.t - mk.made) * 9.4);
    ctx.fillStyle = `rgba(220, 30, 20, ${(0.28 + 0.15 * pulse).toFixed(3)})`;
    for (const [x, y] of mk.tiles) ctx.fillRect(x * TILE + 1, y * TILE + 1, TILE - 2, TILE - 2);
  }

  // A boss gathering its 광역기: the whole floor flashes red under the bodies, as 연's boss rooms do.
  if (G.blast && G.t < G.blast.at) {
    const k = 1 - (G.blast.at - G.t) / 1.6;
    ctx.fillStyle = `rgba(210, 30, 25, ${(0.22 + 0.2 * k) * (settings.calmFx ? 0.9 : 0.85 + 0.15 * Math.sin(G.t * 7.5))})`;
    ctx.fillRect(camX, camY, VW, VH);
  }

  // A 필살기's dark (castUlt): the field goes dark round the bodies for a moment, as in 연.
  if (G.darkUntil > G.t) {
    ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(0.9, (G.darkUntil - G.t) * 2.5)})`;
    ctx.fillRect(camX, camY, VW, VH);
  }

  if (p.aura && !G.dead) drawAuraRing(p);
  // (f.floor: a picture laid on the ground — 아공간전개's domain — drawn under the bodies, not over them)
  for (const f of G.fxs) if (f.floor && f.t >= 0) (fxCur = f), drawFx(f.id, f.x, f.y, f.loop ? now : f.t, f.scale, f.rot, f.anchor, f.seenLoop ? fxLife(f.id) : f.loop, f.flip, f.tint);

  // Bodies, back to front.
  const seenProps = (G.war && !G.war.raid) || G.arena ? [] : G.broken ? propsInView(camX, camY).filter(b => !G.broken.has(b.x + ',' + b.y)) : propsInView(camX, camY); // 사냥 기믹: broken jars
  G.seenProps = seenProps;
  const bodies = G.enemies.concat(G.allies, G.party, G.war ? (G.war.raid ? War.props().concat(seenProps) : War.props()) : seenProps, G.pet ? [G.pet] : [], G.cpet ? [G.cpet] : []);
  bodies.push(p);
  sortByFeet(bodies);
  const hidden = G.buffs.stealth > G.t;
  for (const b of bodies) {
    if (b.war) {
      War.drawBody(b);
      continue;
    }
    if (b === p) {
      if (!G.dead) drawAmbush(p);
      drawHero(now, hidden);
      if (p.sts) drawHeroStatus(p);
      continue;
    }
    if (b.pet) {
      drawPet(b);
      continue;
    }
    if (b.cpet) {
      drawCosPet(ctx, b, hidden ? 0.35 : 1);
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
    // A close-in fighter's blows knock harder: further, and easing back (연's struck jolt).
    const kt = b.kickAt !== undefined ? G.t - b.kickAt : 9, hard = MELEE_LOOK[G.cls.id] && !G.war;
    // Flung by a heavy technique: out half a tile at once, back over a quarter second.
    const kick = hard && b.kickBig ? (kt < 0.26 ? 22 * Math.min(1, kt / 0.04) * (1 - Math.max(0, kt - 0.04) / 0.22) : 0)
      : hard ? (kt < 0.16 ? 8 * (1 - kt / 0.16) : 0) : kt < 0.1 ? 4 : 0;
    const lx = (b.lunge > 0 ? Math.sign(p.x - b.x) * 3 : 0) + (b.kdx || 0) * kick;
    const ly = (b.lunge > 0 ? Math.sign(p.y - b.y) * 3 : 0) + (b.kdy || 0) * kick;
    // The treasure-bearer in gold, from a tinted copy made once.
    monsterTint = b.flee ? GOLD_TINT : G.stage.abyss ? (b.kind && b.kind !== 'minion' ? ABYSS_LEAD_TINT : ABYSS_TINT) : null;
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
      if (b.name && tag) outline(b.name, b.x, b.y - b.m.h * s - 4, G.stage.abyss ? (b.kind === 'champ' ? '#7a9cff' : '#d8a64a')
        : b.kind === 'boss' ? '#ff8a6a' : '#ffe070');
    }
    // Its 상태이상, in 연's own debuff icon, over its head.
    if (b.stIcon && b.st && b.st[b.stIcon]) {
      const im = images[`hud/st_${STATUS[b.stIcon].icon}.png`];
      if (im && im.width) ctx.drawImage(im, Math.round(b.x - 6), Math.round(b.y - b.m.h * s - (b.kind ? 26 : 16)), 12, 12);
    }
  }
  drawAuraIcons();
  for (const d of G.dying) {
    // Thrown back over the first quarter second.
    // A close-in fighter's kill is flung: further, up in an arc, as 연's struck fly off the blade.
    const far = d.fly ? 34 : 14, up = d.fly ? 16 : 4, fk = Math.min(1, d.t / (d.fly ? 0.3 : 0.25));
    const kb = far * fk * (2 - fk);
    const ox = (d.kx || 0) * kb, oy = (d.ky || 0) * kb * 0.6 - Math.sin(fk * Math.PI) * up;
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
      const bi = pic(`beast/${e.beast}.png`);
      if (bi) ctx.drawImage(bi, 0, 0, d.cell[0], d.cell[1], -d.feet[0] * k, -d.feet[1] * k, d.cell[0] * k, d.cell[1] * k);
    } else ctx.drawImage(tinted(im, 'brightness(0.7)'), -w / 2, -h, w, h);
    ctx.restore();
  }

  drawTargetFrame();
  drawShots();

  ctx.globalAlpha = 1;

  drawShocks();
  drawCheongrin(); // 청린수폭's 청룡 (before the splashes and orbs on it)
  // Spell effects over everything, at their own size.
  const trail = !G.war && p.trail, puffs = [];
  // (f.top: drawn over the rest — 화살비폭격's rain is not to be lost under the blasts of the skill that brings it)
  const fxOrder = G.fxs.some(f => f.top) ? G.fxs.filter(f => !f.top).concat(G.fxs.filter(f => f.top)) : G.fxs;
  for (const f of fxOrder) {
    if (f.t < 0 || f.floor) continue;
    let x = f.follow ? p.x + f.x : f.on ? f.on.x + f.x : f.x, y = f.follow ? p.y + f.y : f.on ? f.on.y + f.y : f.y;
    if (f.mv) {
      // Travelling (a row's arrow or beam): out to its end over mv[2] seconds, slowing at the last.
      const k = Math.min(1, f.t / f.mv[2]), e = 1 - (1 - k) * (1 - k);
      x += f.mv[0] * e;
      y += f.mv[1] * e;
      // An abyss far weapon: black smoke and embers behind it as it flies.
      if (trail && k < 1 && !f.trailFx && G.t >= (f.trailAt || 0) && puffs.length < 6) { f.trailAt = G.t + trail.cd; puffs.push([x, y]); }
    }
    if (f.alpha || f.fadeIn) ctx.globalAlpha = (f.alpha || 1) * (f.fadeIn ? Math.min(1, (f.t - f.skip) / f.fadeIn) : 1);
    // (fadeOut: a held picture of one frame — 절섬's crescent — fading over its last fadeOut seconds)
    if (f.fadeOut && f.life) ctx.globalAlpha *= Math.max(0, Math.min(1, (f.life - f.t) / f.fadeOut));
    fxCur = f;
    drawFx(f.id, x, y, f.loop ? now : f.t, f.scale, f.rot, f.anchor, f.seenLoop ? fxLife(f.id) : f.loop, f.flip, f.tint);
    ctx.globalAlpha = 1;
  }
  fxCur = null;
  drawGyeokLines(); // 격 chains' leaps
  // 공대: the spells of twenty-five hid the boss. Its shape again, faint, over them.
  if (G.war && G.war.raid) {
    const bo = G.enemies.find(e => e.kind === 'boss' && e.hp > 0);
    if (bo && G.fxs.length) drawMonster(bo, bo.x, bo.y, bo.scale, 0.42);
  }
  if (trail) {
    for (const sh of G.shots) if (sh.mine && G.t >= (sh.trailAt || 0) && puffs.length < 8) { sh.trailAt = G.t + trail.cd; puffs.push([sh.x, sh.y]); }
    for (const [x, y] of puffs) for (const [id, sc] of trail.layers) { addFx(id, x, y, { scale: sc * trail.scale, tint: fxTintOf(trail.tint, id) }); G.fxs[G.fxs.length - 1].trailFx = true; }
  }
  ctx.font = '8px G7';
  ctx.textAlign = 'center';
  ctx.font = '10px G9';
  for (const t of G.texts) {
    ctx.globalAlpha = t.t < 0.7 ? 1 : 1 - (t.t - 0.7) / 0.4;
    // No number over the top bar (the ground's name, the boss's life): one up there is not drawn.
    if (t.num && t.y < camY + 56) continue;
    if (t.num && window.__quietText) continue; // test: a skill's frames without its numbers
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
    } else if (t.num && dmgkFont()) {
      // 연's damage lines (font_dmgk, morris9 with its orange material): pop in, settle, rise.
      const base = t.ally ? 0.42 : t.crit ? 0.95 : t.heavy ? 0.7 : t.dot ? 0.45 : 0.6;
      // As 연 shows a blow: a plain one white, a 치명타 larger and orange (it pops in white too);
      // a companion's in orange, small.
      const white = M.hud.font_dmgk_w, fresh = t.t < 0.16 && !t.dot && white;
      const pop = t.t < 0.16 ? (t.crit ? 1.7 : 1.4) - t.t * (t.crit ? 4.4 : 2.5) : 1;
      const font = t.heal ? 'font_dmgk_g' : t.mana ? 'font_dmgk_b' : fresh ? 'font_dmgk_w'
        : t.crit || t.ally || !white ? 'font_dmgk_o' : 'font_dmgk_w';
      drawDigits(t.text, Math.round(t.x), Math.round(t.y), null, (t.heal || t.mana ? 0.5 : base) * pop, font);
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
    } else if (t.heal && dmgFont()) {
      // 대항전: heals in green, in 연's digits.
      drawDigits(t.text.replace('+', ''), Math.round(t.x), Math.round(t.y), t.color, 0.5);
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
    if (m.war) continue; // a war's or raid's fighters draw their own (war.js)
    if (m.bubble) drawBubble(m.bubble.text, m.x, m.y - HERO_TOP - 12, G.t - m.bubble.t);
    drawEmote(m, m.x, m.y - HERO_TOP - (m.bubble ? 36 : 10));
  }
  let lost = 0;
  for (const e of G.enemies) {
    if (e.bubble && G.t - e.bubble.t < 1.6 && G.t >= e.bubble.t) drawBubble(e.bubble.text, e.x, e.y - e.m.h * e.scale - 16, G.t - e.bubble.t);
    else if (e.lostAt !== undefined && G.t - e.lostAt < 1 && lost++ < 8) {
      // 투명: the monsters that lost the hero look about (a grey "?", a few of them).
      ctx.font = 'bold 13px G9';
      ctx.textAlign = 'center';
      outline('?', e.x, e.y - e.m.h * e.scale - 4 - 3 * Math.sin((G.t - e.lostAt) * 9), '#d8d8e8');
    } else if (e.alertAt !== undefined) drawAlert(e.x, e.y - e.m.h * e.scale - 6, G.t - e.alertAt);
  }

  if (G.hunt) Hunt.world(ctx); // 사냥 기믹: 처형 marks, the objective
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (G.stage.abyss) drawAbyss((p.x - camX) * Z, (p.y - 22 - camY) * Z, camX, camY);
  // (the abyss has its own darkness: no second vignette over it)
  const dark = !G.stage.abyss && !G.hunt && DARK[G.stage.terrain]; // 사냥 기믹: the group's own light (hunt.js)
  if (dark) {
    // Caves and houses are dim away from the hero, as in the old game's dungeons.
    const cx = canvas.width / 2, cy = canvas.height / 2;
    const gr = ctx.createRadialGradient(cx, cy, canvas.height * 0.35, cx, cy, Math.hypot(cx, cy));
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(1, `rgba(0,0,0,${dark})`);
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  // A 신화 격's light in its family's colour (fireGyeok): round the struck, not the whole screen,
  // rising in 60 ms and fading over 0.4 s; the blood families darken instead of lighting red.
  const gf = G.gyeokFlash, ga = gf ? G.t - gf.t : 9;
  if (gf && ga < 0.46 && !settings.calmFx) {
    const a = (ga < 0.06 ? ga / 0.06 : (1 - (ga - 0.06) / 0.4) ** 2) * (gf.dark ? 0.22 : 0.16);
    const cx = (gf.x - camX) * Z, cy = (gf.y - camY) * Z, r = canvas.height * 0.42;
    const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    gr.addColorStop(0, gf.dark ? 'rgba(40,0,4,1)' : gf.color);
    gr.addColorStop(1, gf.dark ? 'rgba(40,0,4,0)' : gf.color + '00');
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = gr;
    ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);
    ctx.restore();
  }
  if (G.hunt) Hunt.ambient(ctx, canvas, camX, camY); // 사냥 기믹: light, colour, weather
  // A 필살기's blink of white over the whole screen.
  // (0.3 at most, fading as it goes: it was 0.75 for a third of a second over a whole screen)
  if (G.whiteAt !== undefined && G.t - G.whiteAt < 0.25 && !settings.calmFx) {
    ctx.fillStyle = `rgba(255,255,255,${(0.3 * (1 - (G.t - G.whiteAt) / 0.25) ** 2).toFixed(3)})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  // A raid blast gathering: the screen's edge throbs red until it falls or is cut.
  if (G.blast) {
    // a slow throb (1.2 a second; it was 2.9, near the rate that troubles the eye), still with 번쩍임 줄이기
    const k = settings.calmFx ? 0.3 : 0.27 + 0.08 * Math.sin(G.t * 7.5);
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
    const pop = Math.max(0, 1 - (G.t - c.pop) / 0.15), mark = Math.max(0, 1 - (G.t - (c.mark || -9)) / 0.6);
    // (it grows a step with each 기세 step, 10/40/100/200, as the kill sound climbs: killRate)
    const tier = c.n >= 200 ? 0.24 : c.n >= 100 ? 0.16 : c.n >= 40 ? 0.08 : 0;
    const sc = (1 + tier + 0.25 * pop + 0.6 * mark * mark) * (canvas.width / 860);
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
  // 대항전: the keys and the chat stand over its bottom bar (진영대장), not on it.
  const warBar = !!(G.war && !G.war.raid && !G.stage.jaeng);
  if (shown.warBar !== warBar) { shown.warBar = warBar; document.body.classList.toggle('war-bar', warBar); boxes.clear(); }
  drawSkillBar();
  drawYeonStatus();
  drawChain();
  drawLootFeed();
  drawBattleInfo();
  if (G.hunt) Hunt.hud(ctx, canvas); // 사냥 기믹: 토벌도, 그로기, the boss's warning
  if (G.war) War.hud();
  drawJoystick();
}

// How far over its feet a hero's head is (the old wardrobe figure's, 51-52 in every class: bars and bubbles sit by it).
const HERO_TOP = 51, HERO_H = 56;
function heroHeight() {
  if (M.yhero && M.yhero[G.cls.id]) return 44;
  return HERO_TOP;
}

/** A material's icon, as a path under assets/: 연's own item (items.js MATS[].yeon, cut and set in
 *  연's frame by tools/fetch_icons.py: gicon "mat:<id>"), else the old item icon, or 연's HUD one
 *  (st:<name> → hud/st_<name>.png). */
function matPath(id) {
  const g = M.gicon && M.gicon['mat:' + id];
  if (g) return 'gicon/' + g;
  const ic = MATS[id].icon;
  return ic.startsWith('st:') ? `hud/st_${ic.slice(3)}.png` : M.items[ic] ? `item/${M.items[ic].id}.png` : null;
}
/** A material's icon for the windows (a URL), or ''. */
function matIcon(id) {
  const p = MATS[id] && matPath(id);
  return p ? 'assets/' + p : '';
}
/** A material's picture (loaded on first ask; the old icon until then). */
function matImage(id) {
  const p = matPath(id);
  if (p && !(p in images)) loadImage(p);
  const im = p && images[p];
  if (im && im.complete && im.width) return im;
  const ic = MATS[id].icon;
  return ic.startsWith('st:') ? images[`hud/st_${ic.slice(3)}.png`] : images[`item/${M.items[ic].id}.png`];
}

/** 주작의 기운: its reach as a faint breathing ring of fire on the ground round the hero. */
function drawAuraRing(p) {
  const r = JUJAK_AURA.r * TILE, k = 0.5 + 0.5 * Math.sin(G.t * 2.4);
  ctx.save();
  ctx.strokeStyle = `rgba(255, 120, 40, ${0.24 + 0.14 * k})`;
  ctx.lineWidth = 3;
  ctx.setLineDash([6, 5]);
  ctx.lineDashOffset = -G.t * 12;
  ctx.beginPath();
  ctx.ellipse(p.x, p.y - 4, r, r * 0.62, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** 주작의 기운 on the allies it reaches: the 주작혈안 (연's icon) over their heads, breathing. */
function drawAuraIcons() {
  const p = G.player;
  if (!p.aura || G.dead) return;
  const im = images['hud/st_mat_jujak.png'];
  const allies = G.war ? G.war.bodies.filter(b => b.team === 0 && !b.dead && !b.hero) : G.party.filter(m => !m.down);
  const a = 0.75 + 0.25 * Math.sin(G.t * 3);
  ctx.save();
  ctx.globalAlpha = a;
  for (const m of allies) {
    if (!inAura(m) || Math.abs(m.x - p.x) > VW || Math.abs(m.y - p.y) > VH) continue;
    // Just over its health bar (a war's fighter's at 52 over its feet, a companion's higher).
    const S = 18, x = Math.round(m.x - S / 2), y = Math.round(m.y - (m.war ? 56 : 80) - S + Math.sin(G.t * 3 + m.x) * 1.5);
    ctx.fillStyle = 'rgba(255, 110, 30, 0.35)';
    ctx.beginPath(); ctx.arc(x + S / 2, y + S / 2, S * 0.62, 0, Math.PI * 2); ctx.fill();
    if (im && im.width) ctx.drawImage(im, x, y, S, S);
  }
  ctx.restore();
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
    drawYhero(G.cls.id, p.gear ? p.gear.armor : 0, p, p.x, y, 'idle', 0.45);
    return;
  }
  // 연's ring at the player's own feet (FXs player_foot), turning under the hero all the while.
  if (M.fx.k_x_hero_foot && !hidden) { const g = glideAt(p); drawFx('k_x_hero_foot', g.x, g.y + 2, now, 1.3, 0, 'bottom', true); }
  // 연's own figure for the class, in the outfit of the armour worn.
  const yPose = p.moving || p.stepping ? 'walk' : p.poseT > 0 ? p.pose : 'idle';
  // After a dash: fading copies along the way, and the last of the way slid, not popped.
  // A swing leans the hero into the one it strikes.
  let hx = p.x, hy = p.y;
  if (G.ghosts && G.ghosts.length) {
    G.ghosts = G.ghosts.filter(g => G.t - g.t < 0.3);
    for (const g of G.ghosts) {
      const a = Math.max(0, 0.45 * (1 - (G.t - g.t) / 0.3));
      if (a > 0.02) drawYhero2(G.cls, p.gear, p, g.x, g.y, 'attack', a) || drawYhero(G.cls.id, p.gear ? p.gear.armor : 0, p, g.x, g.y, 'attack', a);
    }
  }
  if (p.glide && G.t - p.glide.t < p.glide.d) ({ x: hx, y: hy } = glideAt(p));
  else if (p.slide && G.t - p.slide.t < 0.09) {
    const k = 1 - (G.t - p.slide.t) / 0.09;
    hx += p.slide.dx * 0.35 * k * k;
    hy += p.slide.dy * 0.35 * k * k;
  }
  if (p.lungeAt !== undefined && G.t - p.lungeAt < 0.16) {
    const k = Math.sin((G.t - p.lungeAt) / 0.16 * Math.PI);
    const lk = p.lungeK || 1;
    hx += (p.ldx || 0) * 9 * k * lk;
    hy += (p.ldy || 0) * 6 * k * lk;
  }
  if (drawYhero2(G.cls, p.gear, p, hx, hy, yPose, hidden ? 0.45 : 1)) return;
  // (a class 연's layers do not have falls back to 연's first figures; nothing for the moment a sheet is loading)
  drawYhero(G.cls.id, p.gear ? p.gear.armor : 0, p, hx, hy, yPose, hidden ? 0.45 : 1);
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
  // thin light rim and white letters, a small tail below. Drawn once into a kept picture (textPic).
  if (!settings.bubbles) return;
  ctx.save();
  ctx.globalAlpha = age < 1 ? 1 : Math.max(0, 1 - (age - 1) / 0.3);
  ctx.font = 'bold 12px G11';
  ctx.textAlign = 'center';
  const h = 20;
  const w = Math.max(h + 8, Math.ceil(ctx.measureText(text).width) + 18);
  x = Math.round(x);
  const l = x - Math.round(w / 2), t = Math.round(y) - h - 4;
  const tr = ctx.getTransform(), sc = tr.a;
  if (!tr.b && !tr.c && tr.d === sc && sc > 0 && sc <= 6 && (!document.fonts || document.fonts.check(ctx.font))) {
    const key = 'b|' + sc + '|' + text;
    let e = textPics.get(key);
    if (!e) {
      const c = document.createElement('canvas'), g = c.getContext('2d');
      c.width = Math.ceil(w * sc);
      c.height = Math.ceil((h + 2) * sc);
      g.scale(sc, sc);
      g.font = ctx.font;
      g.textAlign = 'center';
      paintBubble(g, text, Math.round(w / 2), 0, w, h);
      e = { c, w: c.width / sc, h: c.height / sc };
      keepTextPic(key, e);
    }
    ctx.drawImage(e.c, l, t, e.w, e.h);
  } else paintBubble(ctx, text, x, t, w, h);
  ctx.restore();
}

/** The bubble's pill (x its middle, t its top, w wide, h high) with its text. */
function paintBubble(g, text, x, t, w, h) {
  const RIM = 'rgba(230,230,235,0.9)', EDGE = 'rgba(0,0,0,0.5)', FILL = 'rgba(22,22,28,0.82)';
  const r = h / 2, l = x - Math.round(w / 2);
  // Row by row, so the rounded ends stay pixel-sharp.
  for (let row = 0; row < h; row++) {
    const dy = row + 0.5 - r;
    const inset = Math.round(r - Math.sqrt(Math.max(0, r * r - dy * dy)));
    const yy = t + row;
    g.fillStyle = EDGE;
    g.fillRect(l + inset, yy, w - inset * 2, 1);
    if (row === 0 || row === h - 1) continue;
    const dy2 = row + 0.5 - r, r2 = r - 1;
    const in2 = Math.round(r - Math.sqrt(Math.max(0, r2 * r2 - dy2 * dy2)));
    g.fillStyle = RIM;
    g.fillRect(l + in2, yy, w - in2 * 2, 1);
    if (row === 1 || row === h - 2) continue;
    const r3 = r - 2.5, in3 = Math.round(r - Math.sqrt(Math.max(0, r3 * r3 - dy2 * dy2)));
    g.fillStyle = FILL;
    g.fillRect(l + in3, yy, w - in3 * 2, 1);
  }
  // The tail.
  g.fillStyle = RIM;
  g.fillRect(x - 2, t + h - 1, 5, 1);
  g.fillRect(x - 1, t + h, 3, 1);
  g.fillStyle = EDGE;
  g.fillRect(x, t + h + 1, 1, 1);
  g.fillStyle = '#ffffff';
  g.fillText(text, x, t + 14);
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

// Text with an edge (outline, thick) and the shouts' bubbles, each drawn once into a small picture
// at the screen's own scale and kept: a crowd's names, calls and bubbles were some hundred fills a
// frame (a bubble alone fifty rows), now one drawImage each. The picture is drawn where the text
// would be; under a turn or an uneven scale, or while the font is still loading, the text is
// drawn as before.
const textPics = new Map();
let textPicN = 0;
function textPic(kind, text, color, paint, padL = 2, padR = 2, padT = 2, padB = 3) {
  const sc = Math.fround(xa); // (the canvas's transform, followed: xfFollow; single precision there)
  if (xb || xc || Math.fround(xd) !== sc || !(sc > 0) || sc > 6) return null;
  const key = kind + '|' + ctx.font + '|' + ctx.textAlign + '|' + ctx.textBaseline + '|' + color + '|' + sc + '|' + text;
  let e = textPics.get(key);
  if (e) return e;
  if (document.fonts && !document.fonts.check(ctx.font)) return null;
  const c = document.createElement('canvas'), g = c.getContext('2d');
  g.font = ctx.font;
  g.textAlign = ctx.textAlign;
  g.textBaseline = ctx.textBaseline;
  const m = g.measureText(text);
  const ox = Math.ceil(m.actualBoundingBoxLeft) + padL, oy = Math.ceil(m.actualBoundingBoxAscent) + padT;
  const w = ox + Math.ceil(m.actualBoundingBoxRight) + padR, h = oy + Math.ceil(m.actualBoundingBoxDescent) + padB;
  c.width = Math.max(1, Math.ceil(w * sc));
  c.height = Math.max(1, Math.ceil(h * sc));
  g.scale(sc, sc);
  g.font = ctx.font;
  g.textAlign = ctx.textAlign;
  g.textBaseline = ctx.textBaseline;
  paint(g, ox, oy, text, color);
  e = { c, ox, oy, w: c.width / sc, h: c.height / sc };
  keepTextPic(key, e);
  return e;
}
function keepTextPic(key, e) {
  if (++textPicN > 900) { textPics.clear(); textPicN = 0; }
  textPics.set(key, e);
}

function paintOutline(g, x0, y0, text, color) {
  g.fillStyle = '#000';
  g.fillText(text, x0 + 1, y0);
  g.fillText(text, x0, y0 + 1);
  g.fillText(text, x0 + 1, y0 + 1);
  g.fillStyle = color;
  g.fillText(text, x0, y0);
}
/** Text with a one-pixel dark edge, crisp at any whole scale. */
function outline(text, x, y, color = '#efe3c2') {
  x = Math.round(x);
  y = Math.round(y);
  const e = textPic('o', text, color, paintOutline);
  if (e) {
    ctx.drawImage(e.c, x - e.ox, y - e.oy, e.w, e.h);
    return;
  }
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
const BASE_STATS = { warrior: [30, 8, 14], rogue: [18, 10, 26], mage: [8, 30, 12], poet: [10, 26, 12], archer: [14, 12, 28], lancer: [26, 9, 18], monk: [24, 8, 22], magus: [8, 32, 12], celestial: [14, 24, 20], dokkaebi: [32, 6, 12], reaper: [20, 14, 22] };
const TITLES = ['초보 사냥꾼', '사냥꾼', '숙련된 사냥꾼', '용사', '영웅', '전설'];

/** The side panel and the map tab, kept in step with the hunt. */
function syncUlt() {
  if (!G) return;
  const p = G.player;
  syncUtil();
  put('#ult-mode', ultMode(G.cls.id) === 'hunt' ? '사냥' : '보스');
  put('#map-name', G.stage.name + (G.cleared ? ' (정복)' : ''));
  const hc = G.hunt && Hunt.clockText(); // 사냥 기믹: 토벌도 in place of the clock
  put('#boss-clock', hc !== null && hc !== undefined && G.hunt ? hc : G.bossDue ? `${G.boss.name}까지 ${clock((G.stage.raid ? RAID_BOSS_AT : BOSS_AT) - G.t)}`
    : G.stage.raid && !G.cleared ? `남은 시간 ${clock(Math.max(0, RAID_LIMIT - G.t))}` : '');
  // The boss's bar across the top, as a raid shows it: also for leaders on any ground.
  const big = G.training ? null : G.enemies.find(e => e.kind === 'boss') || G.enemies.find(e => e.kind === 'mini');
  $('#bossbar').hidden = !big;
  if (big) {
    put('#bb-name', big.name + (G.stage.raid ? ['', ' · 분노', ' · 광폭'][G.phase || 0] : ''));
    $('#bb-fill').style.width = Math.max(0, big.hp / big.maxHp * 100).toFixed(1) + '%';
    put('#bb-num', `${shownNum(Math.max(0, big.hp))} / ${shownNum(big.maxHp)}`);
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
  gauge('#g-hp', p.hp / p.maxHp, shownNum(Math.max(0, p.hp)));
  gauge('#g-mp', p.mp / p.maxMp, String(Math.floor(p.mp)));
  put('#sd-exp', String(Math.floor(p.total || 0)));
  put('#sd-gold', String(G.gold));
  put('#sd-pos', `${String(p.tx + 500).padStart(4, '0')} ${String(p.ty + 500).padStart(4, '0')}`);
  const look = JSON.stringify(p.gear);
  if (shown.hero !== look) {
    shown.hero = look;
    heroPic($('#side-hero'), G.cls);
    heroPic($('#sd-face'), G.cls);
  }
  // The lettered list holds the learned spells, as the magic window lettered them.
  // The scroll's list: effects on the hero with the seconds left, as the client listed them,
  // then the spells learned.
  const effects = [['power', '공격력증가'], ['stealth', '투명'], ['ambushF', '암습 여세'], ['guard', '금강불체'], ['shield', '보호막']]
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
  const worn = ['helmet', 'weapon', 'shield'].map(k => (g[k] >= 0 || g[k + 'Sp'] ? pieceIcon(G.cls, k, g[k], g[k + 'Sp']) : null));
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
$('#util-btn').addEventListener('pointerdown', e => {
  e.preventDefault();
  e.stopPropagation();
  castUtil();
});

function togglePause(force) {
  if (!G || G.over || G.choosing || (G.dead && !(G.war && G.war.heroOut))) return false; // (out of revives in a raid: the menu, to go home)
  G.paused = force ?? !G.paused;
  $('#pause').hidden = !G.paused;
  if (G.paused) syncSettings();
  return true;
}

function syncSettings() {
  $('#opt-bgm').textContent = '배경음: ' + (settings.bgm ? '켬' : '끔');
  $('#opt-sfx').textContent = '효과음: ' + (settings.sfx ? '켬' : '끔');
  // The same two switches on the title and in town (소리 끄기 without starting a hunt).
  for (const b of document.querySelectorAll('.snd')) b.textContent = (b.dataset.sound === 'bgm' ? '배경음 ' : '효과음 ') + (settings[b.dataset.sound] ? '켬' : '끔');
  for (const v of document.querySelectorAll('.vstep')) {
    const k = v.dataset.vol, p = Math.round(volOf(k) * 100);
    v.querySelector('b').textContent = p + '%';
    v.classList.toggle('off', !settings[k]);
    v.querySelector('.vm').disabled = p <= 0;
    v.querySelector('.vp').disabled = p >= 100;
  }
  $('#opt-num').textContent = '피해 숫자: ' + (settings.numbers ? '켬' : '끔');
  $('#opt-bubble').textContent = '말풍선: ' + (settings.bubbles ? '켬' : '끔');
  $('#opt-tiles').textContent = '이동: ' + (settings.tiles ? '한 칸씩' : '자유');
  $('#opt-party').textContent = '동료 모드: ' + (settings.party ? '켬' : '끔');
  $('#opt-dash').textContent = '돌진 기술: ' + (settings.dashMode === 'stay' ? '제자리' : '자동');
  $('#opt-auto').textContent = '레벨업 자동 선택: ' + (settings.autoPick ? '켬' : '끔');
  $('#opt-pace').textContent = '사냥 방식: ' + (settings.legacyPace ? '옛 4분' : '토벌도');
  $('#opt-info').textContent = '전투 정보: ' + (settings.battleInfo !== false ? '켬' : '끔');
  $('#opt-calm').textContent = '번쩍임 줄이기: ' + (settings.calmFx ? '켬' : '끔');
  $('#opt-cam').textContent = '카메라 앞보기: ' + (settings.camLead ? '켬' : '끔');
  $('#opt-bar').textContent = '기술 창: ' + (settings.barSize === 'small' ? '작게' : '보통');
  if (document.body.classList.contains('hud-small') !== (settings.barSize === 'small')) {
    document.body.classList.toggle('hud-small', settings.barSize === 'small');
    boxes.clear();
  }
  $('#opt-aifx').textContent = `AI 이펙트 투명도: ${Math.round((1 - aiFxAlpha()) * 100)}%`;
  $('#opt-overlap').textContent = `겹친 캐릭터 투명도: ${overlapAlpha() >= 1 ? '끔' : Math.round((1 - overlapAlpha()) * 100) + '%'}`;
  $('#opt-big').textContent = '대규모 전투: ' + (settings.bigBattle === false ? '끔' : settings.bigBattle === 'all' ? '쟁까지' : '대항전·레이드');
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
  $('#backup-note').textContent = '이 코드 전체를 복사해 메모장 등에 보관하세요. 복구할 때는 붙여 넣고 불러오기를 누르세요.';
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
    $('#backup-note').textContent = '올바른 백업 코드가 아닙니다. 처음부터 끝까지 그대로 붙여 넣으세요.';
  }
};
$('#backup-close').onclick = () => { $('#backup').hidden = true; };

$('#start-btn').onclick = () => {
  audio.unlock();
  showScreen('select');
};
$('#back-title').onclick = () => showScreen('title');
$('#back-select').onclick = () => enterTown(chosenClass);
$('#go').onclick = () => goHunt();
/** Into the picked ground (remembered, for 「이전 사냥터」 in the town). */
let goingHunt = false;
async function goHunt() {
  if (goingHunt) return;
  settings.lastHunt = { id: pickedStage.id, mode: pickedMode };
  saveJson('bs_settings', settings);
  // The hunt's effects decoded first (a few seconds at most: what is not ready yet shows when it is).
  const go = $('#go');
  if (go) go.disabled = true;
  goingHunt = true;
  try { await Promise.race([Promise.all([fxWarm(runFxIds(chosenClass, pickedStage)), picWarm(runPics(chosenClass, pickedStage)), heroWarm(chosenClass, savedGear(chosenClass))]), new Promise(r => setTimeout(r, 3000))]); } finally { goingHunt = false; if (go) go.disabled = false; }
  startRun(chosenClass, pickedStage);
  if (G && G.hunt && G.hunt.mode === 'conquer' && pickedMode === 'sweep' && progress.cleared[G.stage.id]) Hunt.sweep(G); // 사냥 기믹: 소탕
}
/** The ground of the last hunt, if it is still open to this hero. */
function lastHuntStage() {
  const l = settings.lastHunt;
  if (!l) return null;
  const si = STAGES.findIndex(s => s.id === l.id);
  if (si >= 0) return unlocked(si) ? STAGES[si] : null;
  const r = RAIDS.find(x => x.id === l.id);
  return r && raidOpen(r) ? r : null;
}
/** The town's 「이전 사냥터」 key: named for the ground, hidden until there is one. */
function syncLastHunt() {
  const b = $('#town-last'), st = lastHuntStage();
  if (!b) return;
  b.hidden = !st;
  if (st) { b.textContent = `다시: ${st.name.replace(' 레이드', '')}`; b.title = `${st.name}에 바로 입장합니다`; }
}
$('#pause-btn').onclick = () => togglePause();
$('#resume').onclick = () => togglePause(false);
$('#quit').onclick = () => {
  $('#pause').hidden = true;
  leaveHunt();
};
$('#again').onclick = () => {
  const sw = G.hunt && G.hunt.mode === 'sweep';
  pickedMode = G.hunt ? (sw ? 'sweep' : G.hunt.mode) : pickedMode;
  startRun(G.cls, G.stage);
  if (sw && G.hunt) Hunt.sweep(G);
};
// 계속 사냥: back into the conquered ground; the field grows until the hero falls.
$('#keep').onclick = () => {
  if (!G || !G.cleared || G.dead) return;
  G.over = false;
  G.banked = false;
  G.gold = 0;
  G.endless = true;
  G.clearT = G.t;
  G.endlessChamp = G.t + 60;
  // 사냥 기믹: 소탕 in its place — two and a half minutes, champions every half minute.
  if (G.hunt) Hunt.sweep(G);
  showScreen(null);
  audio.bgm(huntMusic());
  say(G.hunt ? '소탕합니다. 2분 30초 동안 몬스터가 가장 많이 몰려옵니다.' : '계속 사냥합니다. 갈수록 몬스터가 늘고 강해집니다.', 'sys');
  banner(G.hunt ? '소탕 2:30' : '계속 사냥');
};
$('#to-select').onclick = () => leaveHunt();
$('#ult-mode').onclick = e => { e.stopPropagation(); toggleUltMode(); };
$('#opt-bgm').onclick = () => {
  settings.bgm = !settings.bgm;
  audio.setBgm(settings.bgm);
  saveJson('bs_settings', settings);
  syncSettings();
};
// 배경음/효과음 volume (0-100%, 10% steps): − value + beside each on/off switch (pause menu, title, town).
const VOL_DEFAULT = { bgm: 0.5, sfx: 0.6 };
function volOf(k) {
  const v = settings[k + 'Vol'];
  return typeof v === 'number' && v >= 0 && v <= 1 ? v : VOL_DEFAULT[k];
}
function setVol(k, v) {
  v = Math.max(0, Math.min(1, Math.round(v * 20) / 20));
  settings[k + 'Vol'] = v;
  if (k === 'bgm') audio && audio.setBgmVolume(v);
  else audio && audio.setSfxVolume(v);
  saveJson('bs_settings', settings);
  syncSettings();
  if (k === 'sfx' && audio) audio.sample();
}
function initVolume() {
  const anchors = [...document.querySelectorAll('.snd'), $('#opt-bgm'), $('#opt-sfx')];
  for (const a of anchors) {
    const k = a.dataset.sound || (a.id === 'opt-bgm' ? 'bgm' : 'sfx');
    const v = document.createElement('span');
    v.className = 'vstep';
    v.dataset.vol = k;
    v.title = (k === 'bgm' ? '배경음' : '효과음') + ' 크기';
    v.innerHTML = '<button class="btn vm" aria-label="작게">−</button><b></b><button class="btn vp" aria-label="크게">+</button>';
    v.querySelector('.vm').onclick = e => { e.stopPropagation(); setVol(k, volOf(k) - 0.1); };
    v.querySelector('.vp').onclick = e => { e.stopPropagation(); setVol(k, volOf(k) + 0.1); };
    const g = document.createElement('span');
    g.className = 'vgroup';
    a.before(g);
    g.append(a, v);
  }
}
initVolume();
document.querySelectorAll('.snd').forEach(b => { b.onclick = () => $(b.dataset.sound === 'bgm' ? '#opt-bgm' : '#opt-sfx').click(); });
syncSettings();
$('#opt-sfx').onclick = () => {
  settings.sfx = !settings.sfx;
  audio.setSfx(settings.sfx);
  saveJson('bs_settings', settings);
  syncSettings();
};
$('#opt-party-pick').onclick = () => openPartyPick();
/** 동료 설정: who joins in 동료 모드, in order (up to three); an empty place goes to a class at random.
 *  The classes as cards like 직업 선택's, each in its own look; a tap puts it in or takes it out. */
function openPartyPick() {
  const box = $('#pp-cards'), picks = (settings.partyPick || []).slice();
  $('#pp-note').textContent = `선택한 동료 ${picks.length}/3 · 빈자리는 무작위 · 사냥 중 Lv 3·9·15에 선택 순서대로 합류`
    + (chosenClass ? ` · 현재 직업(${chosenClass.name})은 제외` : '');
  box.innerHTML = '';
  for (const c of CLASSES) {
    const at = picks.indexOf(c.id), pr = promoOf(c.id), rec = best[c.id];
    const b = document.createElement('button');
    b.className = 'card' + (at >= 0 ? ' on' : '') + (chosenClass && chosenClass.id === c.id ? ' me' : '');
    b.innerHTML = `${at >= 0 ? `<i>${at + 1}</i>` : ''}<div class="slot"><img class="hero" src="${heroPicture(c)}" alt=""></div>
      <b>${c.name}</b><em>${PARTY[c.id] ? PARTY[c.id].role : ''}</em>
      <small>${companionLabel(c.id)}${rec ? ` · 합류 Lv ${companionStart(c.id, 99)}~` : ''}${tierSkillLine(c.id, pr) ? `<br>${tierSkillLine(c.id, pr)}` : ''}</small>`;
    b.disabled = at < 0 && picks.length >= 3;
    b.onclick = () => {
      settings.partyPick = at >= 0 ? picks.filter(x => x !== c.id) : picks.concat(c.id);
      saveJson('bs_settings', settings);
      openPartyPick();
    };
    box.append(b);
    lookPicture(c).then(url => { if (url) b.querySelector('.hero').src = url; });
  }
  $('#pp-mode').textContent = '동료 모드: ' + (settings.party ? '켬' : '끔');
  $('#pp-mode').classList.toggle('on', !!settings.party);
  $('#party-pick').hidden = false;
  syncPartyLine();
}
/** The 사냥터 panel's line: 동료 모드 and how many companions are picked, with a shortcut. */
function syncPartyLine() {
  const el = $('#party-line span');
  if (el) el.textContent = `동료 모드: ${settings.party ? '켬' : '끔'}` + (settings.party ? ` · 동료 ${(settings.partyPick || []).length}명${(settings.partyPick || []).length ? '' : ' (무작위)'}` : '');
}
$('#pp-mode').onclick = () => { settings.party = !settings.party; saveJson('bs_settings', settings); syncSettings(); openPartyPick(); };
$('#party-line-btn').onclick = () => openPartyPick();
$('#pp-close').onclick = () => { $('#party-pick').hidden = true; syncPartyLine(); };
$('#pp-clear').onclick = () => { settings.partyPick = []; saveJson('bs_settings', settings); openPartyPick(); };
$('#opt-party').onclick = () => {
  settings.party = !settings.party;
  saveJson('bs_settings', settings);
  syncSettings();
  syncPartyLine();
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
// 돌진 기술: 자동 (dashes, blinks and the 필살기's leap carry the hero to the foe, as always) or
// 제자리 (they strike from where the hero stands). Raids keep the hero off the red either way.
$('#opt-dash').onclick = () => {
  settings.dashMode = settings.dashMode === 'stay' ? 'auto' : 'stay';
  saveJson('bs_settings', settings);
  syncSettings();
};
$('#opt-info').onclick = () => {
  settings.battleInfo = settings.battleInfo === false;
  saveJson('bs_settings', settings);
  syncSettings();
};
// 번쩍임 줄이기: no light over the screen (필살기's white, a 신화 격's glow), steady warnings, a
// softer white on the struck, the added-light 격 pictures dimmer.
$('#opt-calm').onclick = () => {
  settings.calmFx = !settings.calmFx;
  saveJson('bs_settings', settings);
  syncSettings();
};
// 카메라 앞보기 (off by default): the view a tile ahead of the way the player steers (camLead).
$('#opt-cam').onclick = () => {
  settings.camLead = !settings.camLead;
  saveJson('bs_settings', settings);
  syncSettings();
};
// 기술 창: 보통 / 작게 — the spells' slots and the keys beside them (drawSkillBar, body.hud-small).
$('#opt-bar').onclick = () => {
  settings.barSize = settings.barSize === 'small' ? 'normal' : 'small';
  saveJson('bs_settings', settings);
  syncSettings();
};
// AI 이펙트 투명도: how see-through the war's, raid's and 쟁's other fighters' pictures are drawn
// (war.js aiAlpha; the hero's own spells and the 기원 on it stay solid). From the next picture on.
const AI_FX_STEPS = [1, 0.8, 0.65, 0.5, 0.35];
function aiFxAlpha() {
  const v = settings.aiFxAlpha;
  return typeof v === 'number' && v > 0 && v <= 1 ? v : 0.8;
}
$('#opt-aifx').onclick = () => {
  const i = AI_FX_STEPS.findIndex(v => Math.abs(v - aiFxAlpha()) < 0.01);
  settings.aiFxAlpha = AI_FX_STEPS[(i + 1) % AI_FX_STEPS.length];
  saveJson('bs_settings', settings);
  syncSettings();
};
// 겹친 캐릭터 투명도: in a war, a raid or a 「쟁」 a fighter drawn over the hero, or sharing a tile
// with another of its side, is drawn see-through (war.js overAlpha; the hero itself never), so the
// hero and a heap of allies on a tile still read. 연 lets its players pass through and stand on one
// another; this keeps such a heap legible. 50% by default.
const OVERLAP_STEPS = [0.5, 0.35, 0.7, 1];
function overlapAlpha() {
  const v = settings.overlapAlpha;
  return typeof v === 'number' && v > 0 && v <= 1 ? v : 0.5;
}
$('#opt-overlap').onclick = () => {
  const i = OVERLAP_STEPS.findIndex(v => Math.abs(v - overlapAlpha()) < 0.01);
  settings.overlapAlpha = OVERLAP_STEPS[(i + 1) % OVERLAP_STEPS.length];
  saveJson('bs_settings', settings);
  syncSettings();
};
// 대규모 전투: a war and a raid with more fighters (war.js BIG), or a 「쟁」 too ('all'); from the next
// one. Off on a phone that cannot keep up with the crowd. 대항전·레이드 → 쟁까지 → 끔 → ...
$('#opt-big').onclick = () => {
  settings.bigBattle = settings.bigBattle === false ? true : settings.bigBattle === 'all' ? false : 'all';
  saveJson('bs_settings', settings);
  syncSettings();
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
$('#dash-btn').onclick = () => Hunt.dash(); // 사냥 기믹: 질주
// 사냥 기믹: the old four-minute script, kept for comparison (takes effect from the next hunt).
$('#opt-pace').onclick = () => {
  settings.legacyPace = !settings.legacyPace;
  saveJson('bs_settings', settings);
  syncSettings();
};
$('#lv-auto').onclick = toggleAuto;
$('#opt-num').onclick = () => {
  settings.numbers = !settings.numbers;
  saveJson('bs_settings', settings);
  syncSettings();
};
document.addEventListener('pointerdown', () => audio && audio.unlock(), { capture: true });
// 대항전·공대 자리비움 (war.js afk): any touch or key is the player at the controls, not only a
// step — a caster standing to cast (its spells fire by themselves) was taken for away after 20
// seconds and its blows cut to 5%, so every 주술사·도사 raid ran out of time.
for (const ev of ['pointerdown', 'keydown']) document.addEventListener(ev, () => { if (G && G.war && !G.over) War.moved(); }, { capture: true });
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
  ['boom', '폭발·큰 마법'], ['light', '빛·신비'], ['monster', '몬스터'], ['ui', '알림'], ['none', '미분류·미사용'],
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
    $('#sort-num').textContent = '분류를 마쳤습니다';
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
  if (closeTopLayer()) return true; // the top-most window or popup first
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
    if (sp.kind === 'shield' && !hasShield(c)) continue;
    if (sp.craft && sp.craft.only && sp.craft.judge && !sp.craft.only.includes(c)) continue; // 심판의낫: its three classes
    n++;
    check(`special ${sp.id} ${specialName(sp, c)}`, sp.kind, specialBase(sp, c), sp.id);
  }
  try { $('#equip').hidden = false; buildEquip(); $('#equip').hidden = true; } catch (e) { bad.push('equip window: ' + e.message); }
  for (const [k, v] of Object.entries(keep)) if (!k.endsWith('Sp')) wear(k, v, keep[k + 'Sp'] || null);
  return { cls: c, tried: ['weapon', 'armor', 'shield', 'helmet', 'cape'].reduce((a, k) => a + (GEAR[c][k] || []).length, 0) + n, bad };
};
window.__dragonTier = () => dragonTier(G.cls);
// Test (weapon bench): put on one weapon of a family, as a player who has it at its best would.
// conf: plain | special | dragon1 | dragon10 | cr_<craft id> | abyss | taecho. Returns its name and power.
window.__benchWear = conf => {
  const cls = G.cls, c = cls.id;
  progress.stars = progress.stars || {};
  const st = progress.stars[c] = progress.stars[c] || {};
  let t, sp = null;
  if (conf === 'plain') { const l = plainList(c, 'weapon'); t = l[l.length - 1]; st[`weapon:${t}`] = STAR_MAX; }
  else if (conf.startsWith('dragon')) { t = dragonTier(cls); st[`weapon:${t}`] = +conf.slice(6); }
  else if (conf === 'special') {
    const s0 = Object.values(SPECIAL).filter(x => x.kind === 'weapon' && !x.craft && !x.rarity && (!x.cls || x.cls === c)).sort((a, b) => specialPower(b, c) - specialPower(a, c))[0];
    sp = s0.id; t = specialBase(s0, c);
  } else if (conf === 'abyss' || conf === 'taecho') {
    progress.abyssLoot = progress.abyssLoot || {};
    const s0 = rollAbyssItem(progress.abyssLoot, 26, conf === 'abyss' ? 'diablo' : 'taecho');
    sp = s0.id; t = specialBase(s0, c);
  } else { const s0 = SPECIAL[conf]; if (!s0) return null; sp = s0.id; t = specialBase(s0, c); st['sp:' + sp] = STAR_MAX; }
  wear('weapon', t, sp);
  G.dealt = { all: 0, big: 0, ally: 0 };
  G.gyeokCount = {};
  G.burstN = 0;
  return { name: sp ? specialName(SPECIAL[sp], c) : pieceName(cls, 'weapon', t), power: G.player.gearPower, fam: familyOf(sp && SPECIAL[sp], !sp && t === dragonTier(cls)) };
};
// Test (보조 옵션·보조 기술): an option line counted n times on the hero now (bench), the crit
// count of the hero's blows, the 보조 기술 thrown and its state.
window.__setOpt = (k, n) => { G.player.bonus[k] = n; };
window.__critProbe = () => (G.critProbe = { n: 0, c: 0 });
// n of the hero's own blows of dmg on the strongest foe (the dummy boss): the damage done, the crits.
window.__strike = (n, dmg) => {
  const e = G.enemies.find(x => x.kind === 'boss') || G.enemies[0];
  if (!e) return null;
  G.critProbe = { n: 0, c: 0 };
  let sum = 0, lo = Infinity;
  for (let i = 0; i < n; i++) { const h0 = e.hp; e.guardT = 0; hurtEnemy(e, dmg); const d = h0 - e.hp; sum += d; lo = Math.min(lo, d); e.capUsed = 0; }
  return { avg: sum / n, min: lo, critRate: G.critProbe.c / G.critProbe.n, might: might() };
};
window.__util = () => castUtil();
window.__utilState = () => ({ id: utilOf(G.cls), wait: utilWait(), used: G.utilUsed || {}, chosang: G.buffs.chosang > G.t, barrier: G.player.barrier || 0,
  speed: heroSpeed(), hidden: $('#util-btn').hidden, procs: [...(G.player.procs || [])] });
window.__benchRead = () => ({ dealt: G.dealt, gyeok: G.gyeokCount, burst: G.burstN || 0, hp: G.player.hp / G.player.maxHp, t: G.t });
// For measuring: the hero grown to a level with its build (as a raid starts it), now.
// For measuring single-target damage: the field cleared and the ground's boss alone, unkillable.
// test (빈 들판 시전): the field emptied and kept empty (no spawns): what the hero casts at nothing (window.__castLog)
window.__emptyField = () => { G.dummy = true; G.bossDue = false; for (const e of G.enemies.slice()) { G.enemies.splice(G.enemies.indexOf(e), 1); leave(e); } return G.enemies.length; };
window.__dummyBoss = () => {
  G.dummy = true;
  G.bossDue = false;
  for (const e of G.enemies.slice()) { G.enemies.splice(G.enemies.indexOf(e), 1); leave(e); }
  const bo = addEnemy(G.boss.m, 'boss', G.boss);
  if (bo) bo.hp = bo.maxHp = 1e12;
  return !!bo;
};
// For measuring a crowd: the field held at n of the ground's plain monsters, each k times as tough.
window.__crowd = (n, k) => {
  G.dummy = true;
  G.bossDue = false;
  for (let i = 0; i < 12 && G.enemies.length < n; i++) {
    const e = addEnemy(pickMonster());
    if (e) e.hp = e.maxHp = e.maxHp * k;
  }
  return G.enemies.length;
};
// test (이펙트=판정): a still dummy on every free tile within r of the hero, k times as tough
window.__dummyField = (r, k) => {
  G.dummy = true;
  G.bossDue = false;
  const p = G.player;
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
    if ((!x && !y) || Math.hypot(x, y) > r + 0.5 || !free(p.tx + x, p.ty + y)) continue;
    const e = addEnemy(pickMonster(), null, null, 0, [p.tx + x, p.ty + y]);
    if (e) e.hp = e.maxHp = e.maxHp * k;
  }
  return G.enemies.length;
};
window.__grow = n => { const p = G.player; p.lvl = n; p.next = xpFor(n); G.pendingLevels = 0; G.firstCard = false; applyBuild(n); };
window.__Z = () => Z;
window.__hurtPlayer = d => hurtPlayer(d, null);
window.__hurtPlayerFrom = (d, e) => hurtPlayer(d, e);
window.__event = k => huntEvent(k);
// For trying effects out: one of the build's effects at a place.
window.__fx = (id, x, y, o) => addFx(id, x, y, o || {});
window.__fireWorn = (i = 0, e) => fireGyeok(G.player.gyeoks[i], e || G.enemies.find(x => x.kind === 'boss') || G.enemies[0]); // test: a worn 격 as it is grown (GYEOK_TIER)
window.__fireGyeok = (id, e) => fireGyeok({ id, ...GYEOK[id] }, e || G.enemies[0]); // test: a 격 goesoff
window.__gy = id => GYEOK[id]; // test: a 격's entry
// For trying the abyss loot out: a unique (by name, else any) dropped beside the hero.
window.__abyssDrop = u => {
  progress.abyssLoot = progress.abyssLoot || {};
  const sp = rollAbyssItem(progress.abyssLoot, G.level, u);
  G.drops.push({ x: G.player.x + 40, y: G.player.y + 10, kind: 'gear', gear: { kind: sp.kind, tier: specialBase(sp, G.cls.id), sp: sp.id }, beam: RARITY.unique.color });
  return sp.id;
};
window.__openPortal = t => openPortal(t);
window.__wear = (k, t, sp) => wear(k, t, sp); // test: put on a piece
// test: the added armour (armory.js) and the worn layers a class's saved gear picks
window.__armory = () => SPECIALS.filter(s => s.craft && s.craft.group).map(s => ({ id: s.id, kind: s.kind,
  classes: CLASSES.map(c => c.id).filter(c => (!s.craft.only || s.craft.only.includes(c)) && (s.kind !== 'shield' || hasShield(c))) }));
window.__variants = c => { const cls = CLASSES.find(x => x.id === c); return yGearVariants(cls, savedGear(cls)); };
window.__pieceIcon = (k, t, sp) => pieceIcon(G.cls, k, t, sp); // test: its icon
window.__silentSkills = () => {
  const has = n => (Array.isArray(n) ? n : [n]).some(x => x && x !== '-' && audio.has(String(x).split('@')[0]));
  return Object.entries(SKILLS).filter(([id, d]) => d.kind !== 'passive' && !has(audio.map['skill_' + id]))
    .map(([id, d]) => [id, d.name, d.kind, audio.map['skill_' + id] || null]);
};
window.__game = () => G;
// test (memory): out of a run as a player leaves it; the class cards; the windows with long lists of pictures
window.__leave = () => { if (G && G.training) leaveTraining(); else leaveHunt(); };
window.__showSelect = () => showScreen('select');
window.__memOpen = [() => openEquipWindow(), () => $('#open-codex').onclick(), () => openCraft(), () => openForge(), () => openTrade('shop'), () => openTrade('inn'),
  () => openQuests(), () => openPartyPick(), () => openCards(), () => buildTree(chosenClass)];
window.__images = () => images; // test: the loaded pictures
// test: what is held in memory, in MB decoded (pictures by folder, the bitmaps made of them, the heroes' looks and sheets, the made copies, the sounds)
window.__mem = () => {
  const mb = (w, h) => (w || 0) * (h || 0) * 4 / 1048576, of = v => (v ? mb(v.naturalWidth || v.width, v.naturalHeight || v.height) : 0), r1 = x => Math.round(x * 10) / 10;
  const img = {};
  let imgN = 0;
  for (const [k, v] of Object.entries(images)) { if (!v || !v.naturalWidth) continue; const c = k.split('/')[0]; img[c] = (img[c] || 0) + of(v); imgN++; }
  for (const k of Object.keys(img)) img[k] = r1(img[k]);
  const sum = (m, f = of) => { let t = 0; for (const v of m.values()) t += f(v); return r1(t); };
  let frames = 0, frameMb = 0;
  for (const L of heroLooks.values()) { frames += L.frames.size; for (const v of L.frames.values()) frameMb += of(v); }
  let tintN = 0, tintMb = 0;
  for (const m of tintCache.values()) for (const v of m.values()) { tintN++; tintMb += of(v); }
  return {
    img, imgN, imgMb: r1(Object.values(img).reduce((a, b) => a + b, 0)),
    bitmaps: [bitmapsLive.size, r1(bitmapBytes / 1048576)],
    layers: [layerBms.size, sum(layerBms, e => of(e.bm))],
    looks: [heroLooks.size, frames, r1(frameMb), heroLoading],
    dress: [dressSheets.size, sum(dressSheets)], classic: [classicSheets.size, sum(classicSheets)],
    tint: [tintN, r1(tintMb)], white: [whiteCache.size, sum(whiteCache)], whiteFrames: whiteFrames.size, shadow: shadowCache.size,
    text: textPics.size, icons: Object.keys(iconCache).length, lookPics: lookPics.size,
    sfx: audio ? [Object.keys(audio.buffers).length, r1(audio.bytes / 1048576)] : null,
    canvases: document.querySelectorAll('canvas').length, imgs: document.querySelectorAll('img').length,
  };
};
window.__clear = () => clearStage();
window.__tierKit = (id, tier) => tierKit(id, tier).map(k => SKILLS[k].promo + "차 " + SKILLS[k].name);
window.__tierIds = (id, tier) => tierKit(id, tier); // test: a 승급 band's kit (ids)
window.__start = (c, s, m) => { pickedMode = m || 'conquer'; startRun(CLASSES[c], STAGES[s]); if (m === 'sweep' && G.hunt) Hunt.sweep(G); };
window.__enterTown = c => enterTown(CLASSES[c]);
window.__stageList = () => STAGES.map((s, i) => [i, s.id, s.terrain]);
window.__draw = () => drawCards();
window.__raid = (c, r) => startRun(CLASSES[c], RAIDS[r] || RAIDS.find(x => x.id === 'raid_' + r));
window.__quests = () => openQuests();
// Test (pkg C): the 의뢰 board as data, the next goal of a class, a piece picked up, the 승급 의식.
window.__meta = () => ({ daily: dailyQuests(), weekly: weeklyQuests(), claimable: claimable(), level: metaLevel(),
  quests: QUESTS.map(q => ({ id: q.id, text: q.text, need: q.need, have: q.have(qstats()) })) });
window.__nextGoal = c => nextGoal(CLASSES[c]);
window.__pickGear = g => pickGear(g);
window.__promoCeremony = (c, n) => promoCeremony([{ n, cls: CLASSES[c], ids: Object.keys(SKILLS).filter(k => SKILLS[k].cls === CLASSES[c].id && SKILLS[k].promo === n) }]);
// Test hooks (the career sim: a class played from an empty save, buying and making between hunts):
// the save, wearing the best, the 전투력, the 필살기 key. Nothing calls these in play.
window.__progress = () => progress;
// test: a class's 승급 up to n (its grounds marked done in this session's progress, not saved)
window.__promoTo = (cls, n) => { const d = progress.byClass[cls] || (progress.byClass[cls] = {}); PROMOS[cls].forEach((pr, i) => { if (i < n) d[pr.at] = true; }); return promoOf(cls); };
window.__saveProgress = () => saveJson('bs_progress', progress);
window.__wearBest = c => { chosenClass = CLASSES[c]; wearBest(CLASSES[c]); };
window.__power = c => combatPower(CLASSES[c]);
// test: the 전투력 of a class with everything at its end — each slot's best piece (a plain tier, the
// 용무기 at its last step, any special it may wear) at full stars, every 승급, the card sets full,
// the record at `lvl` — the save put back after. Returns { cp, gear }.
window.__maxPower = (ci, lvl = 60) => {
  const cls = CLASSES[ci], c = cls.id;
  const keep = JSON.stringify({ gear: progress.gear, stars: progress.stars, cards: progress.cards, byClass: progress.byClass }), keepBest = best[c];
  try {
    progress.byClass = progress.byClass || {};
    progress.byClass[c] = Object.fromEntries(STAGES.map(st => [st.id, true]));
    progress.cards = { all: { max: 99 } };
    best[c] = { lvl, kills: 0 };
    const st = (progress.stars = progress.stars || {})[c] = {};
    const g = (progress.gear = progress.gear || {})[c] = { armor: 0, weapon: 0, shield: -1, helmet: -1, cape: -1 };
    const kinds = ['weapon', 'armor', 'shield', 'helmet', 'cape'];
    const cands = k => {
      const out = [];
      if (k === 'shield' && !hasShield(c)) return out;
      for (const t of plainList(c, k)) out.push([t, null]);
      for (const sp of Object.values(SPECIAL)) {
        if (sp.kind !== k || (sp.cls && sp.cls !== c) || (sp.craft && sp.craft.only && !sp.craft.only.includes(c))) continue;
        let base; try { base = specialBase(sp, c); } catch (e) { continue; }
        if (base === undefined || base === null || base < 0) continue;
        out.push([base, sp.id]);
      }
      return out;
    };
    for (let pass = 0; pass < 2; pass++) for (const k of kinds) {
      let bestCp = -1, pick = null;
      for (const [t, sp] of cands(k)) {
        const was = [g[k], g[k + 'Sp']];
        g[k] = t; if (sp) g[k + 'Sp'] = sp; else delete g[k + 'Sp'];
        st[`${k}:${t}`] = isDragonKey(cls, `${k}:${t}`) ? DRAGON_MAX : STAR_MAX;
        if (sp) st['sp:' + sp] = STAR_MAX;
        const v = combatPower(cls);
        if (v > bestCp) { bestCp = v; pick = [t, sp]; }
        g[k] = was[0]; if (was[1]) g[k + 'Sp'] = was[1]; else delete g[k + 'Sp'];
      }
      if (pick) { g[k] = pick[0]; if (pick[1]) g[k + 'Sp'] = pick[1]; else delete g[k + 'Sp']; }
    }
    return { cp: combatPower(cls), gear: JSON.stringify(g) };
  } finally {
    const k0 = JSON.parse(keep);
    Object.assign(progress, k0);
    if (keepBest) best[c] = keepBest; else delete best[c];
  }
};
window.__ult = () => castUlt();
// Test (tools/fx_pack.py, before/after): effects drawn alone on the canvas, then read back.
window.__fxWarm = ids => fxWarm(ids).then(() => true);
window.__fxDraw = (list, w, h) => {
  const T = ctx.getTransform();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#203020';
  ctx.fillRect(0, 0, w, h);
  for (const [id, x, y, t, s] of list) drawFx(id, x, y, t, s, 0, 'center', false, false, null);
  ctx.setTransform(T);
  return canvas.toDataURL();
};
window.__fxScale = on => { if (on) fxScaleLog = fxScaleLog || {}; return fxScaleLog; }; // test: tools/fx_drawscale.json
window.__gather = (r = 4) => { // test: the field's foes set round the hero (for frames of a skill going off)
  const p = G.player, spots = [];
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if ((x || y) && Math.hypot(x, y) <= r + 0.5) spots.push([p.tx + x, p.ty + y]);
  spots.sort(() => Math.random() - 0.5);
  let n = 0;
  for (const e of G.enemies) { const s = spots.find(([x, y]) => free(x, y)); if (s && tkShove(e, s[0], s[1])) { e.mt = e.dur; e.moving = false; n++; } }
  return n;
};
window.__skillAlias = () => SKILL_ALIAS; // test: skills merged into others (스킬 2차 개편)
window.__skills = () => SKILLS; // test: the skill table (9차 스킬 개편)
window.__ultAt = n => { G.ultPromo = n; ultPrime(); return ultLook(G.cls.id).name; }; // test: the 필살기 of a 승급 band
window.__ultGrand = () => ULT_GRAND; // test: the 필살기 단계 위엄 table (measuring what each layer costs)
// Test (필살기 단계 위엄): what the effects up now cover of the view — the drawn part of each picture
// (its trimmed box this frame, turned) on a grid of g×g/2 cells; n pictures, ids, the big ones.
// Test (이펙트=판정): each effect up now as a box in tiles from the hero's tile [x0, y0, x1, y1] with its id.
window.__fxBoxes = () => {
  const p = G.player, out = [];
  for (let n = 0; n < G.fxs.length; n++) {
    const f = G.fxs[n];
    if (f.t < 0 || !M.fx[f.id]) continue;
    const d = M.fx[f.id], src = d.src ? M.fx[d.src] : d, k = f.scale * (d.k || 1);
    let x = f.follow ? p.x + f.x : f.on ? f.on.x + f.x : f.x, y = f.follow ? p.y + f.y : f.on ? f.on.y + f.y : f.y;
    if (f.mv) { const q = Math.min(1, f.t / f.mv[2]), e = 1 - (1 - q) * (1 - q); x += f.mv[0] * e; y += f.mv[1] * e; }
    const i = fxFrame(durs(f.id), f.loop ? G.t : f.t, f.seenLoop ? fxLife(f.id) : f.loop) + (d.f0 || 0), bb = src.bb, b4 = i * 4;
    const kv = k * (d.ky || 1), w = d.w * k, h = d.h * kv;
    const dx = d.ax !== undefined && f.anchor !== 'mid' ? -d.ax * k : -w / 2;
    const dy = d.ax !== undefined && f.anchor !== 'mid' ? -d.ay * kv + (f.anchor === 'bottom' ? 0 : 14) : (f.anchor === 'bottom' ? -h : -h / 2);
    let r = bb && b4 + 3 < bb.length ? [dx + bb[b4] * k, dy + bb[b4 + 1] * kv, bb[b4 + 2] * k, bb[b4 + 3] * kv] : [dx, dy, w, h];
    if (!r[2]) continue;
    if (f.flip) r = [-r[0] - r[2], r[1], r[2], r[3]];
    let pts = [[r[0], r[1]], [r[0] + r[2], r[1]], [r[0], r[1] + r[3]], [r[0] + r[2], r[1] + r[3]]];
    if (f.rot) { const c = Math.cos(f.rot), s = Math.sin(f.rot); pts = pts.map(([a, b]) => [a * c - b * s, a * s + b * c]); }
    // (a body's tile: its feet are 6 px over the tile's foot, its middle about 24 px up)
    const tx = q => (x + q[0]) / TILE - 0.5 - p.tx, ty = q => (y + q[1] + 30) / TILE - 1 - p.ty;
    out.push([String(f.id).split('#')[0], Math.min(...pts.map(tx)), Math.min(...pts.map(ty)), Math.max(...pts.map(tx)), Math.max(...pts.map(ty)), n]);
  }
  return out;
};
window.__fxCover = (g = 48) => {
  if (!G || !G.camView) return null;
  const [cx, cy] = G.camView, p = G.player, gw = g, gh = Math.round(g * VH / VW), on = new Uint8Array(gw * gh);
  const ids = new Set();
  let n = 0, big = 0;
  for (const f of G.fxs) {
    if (f.t < 0 || !M.fx[f.id]) continue;
    n++;
    if (f.big) big++;
    ids.add(String(f.id).split('#')[0]);
    const d = M.fx[f.id], src = d.src ? M.fx[d.src] : d, k = f.scale * (d.k || 1);
    let x = f.follow ? p.x + f.x : f.on ? f.on.x + f.x : f.x, y = f.follow ? p.y + f.y : f.on ? f.on.y + f.y : f.y;
    if (f.mv) { const q = Math.min(1, f.t / f.mv[2]), e = 1 - (1 - q) * (1 - q); x += f.mv[0] * e; y += f.mv[1] * e; }
    const i = fxFrame(durs(f.id), f.loop ? G.t : f.t, f.seenLoop ? fxLife(f.id) : f.loop) + (d.f0 || 0), bb = src.bb, b4 = i * 4;
    const kv = k * (d.ky || 1), w = d.w * k, h = d.h * kv;
    const dx = d.ax !== undefined && f.anchor !== 'mid' ? -d.ax * k : -w / 2;
    const dy = d.ax !== undefined && f.anchor !== 'mid' ? -d.ay * kv + (f.anchor === 'bottom' ? 0 : 14) : (f.anchor === 'bottom' ? -h : -h / 2);
    let r = bb && b4 + 3 < bb.length ? [dx + bb[b4] * k, dy + bb[b4 + 1] * kv, bb[b4 + 2] * k, bb[b4 + 3] * kv] : [dx, dy, w, h];
    if (!r[2]) continue;
    if (f.flip) r = [-r[0] - r[2], r[1], r[2], r[3]];
    let pts = [[r[0], r[1]], [r[0] + r[2], r[1]], [r[0], r[1] + r[3]], [r[0] + r[2], r[1] + r[3]]];
    if (f.rot) { const c = Math.cos(f.rot), s = Math.sin(f.rot); pts = pts.map(([a, b]) => [a * c - b * s, a * s + b * c]); }
    const xs = pts.map(q => (x + q[0] - cx) / VW * gw), ys = pts.map(q => (y + q[1] - cy) / VH * gh);
    const x0 = Math.max(0, Math.ceil(Math.min(...xs) - 0.5)), x1 = Math.min(gw - 1, Math.floor(Math.max(...xs) - 0.5));
    const y0 = Math.max(0, Math.ceil(Math.min(...ys) - 0.5)), y1 = Math.min(gh - 1, Math.floor(Math.max(...ys) - 0.5));
    for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) on[yy * gw + xx] = 1;
  }
  let c = 0;
  for (const v of on) c += v;
  return { n, big, ids: ids.size, idl: [...ids], cover: c / on.length, shocks: (G.shocks || []).length, dark: Math.max(0, (G.darkUntil || 0) - G.t), shake: G.shake || 0 };
};

// ---------------------------------------------------------------- 사신수 문파대항전 (war.js)
// The war lives in war.js; these are the hunt's own pieces it builds on (the hero, its spells,
// the grid, the effects, the screens). Kept together here so the two files merge apart.
const War = initWar({
  G: () => G, setG: v => { G = v; }, M: () => M, Z: () => Z, VW: () => VW, VH: () => VH, settings: () => settings,
  progress: () => progress, best: () => best, audio: () => audio, chosenClass: () => chosenClass, setChosenClass: c => { chosenClass = c; },
  saveProgress: () => saveJson('bs_progress', progress),
  ctx, canvas, images, pic, occ, crowd, CLASSES, SKILLS, FX, SHOT_FX, MATS, GYEOK, SPECIAL, GEAR, plainList,
  place, step, advance, free, towards, faceTo, tickStatus, addFx, fxOn, fxOnArea, fxSquare, fxBudget, floatText, say, banner, outline, bar, drawBubble, drawGroundCached, boxOf,
  drawYhero2, drawYhero, yGearVariants, drawYunit, yunit, yunitAnim, tinted, fxWarm, shownNum, addShot, later, hurtPlayer, heal, gainXp, xpFor,
  applyBuild, raidStart, startRun, showScreen, enterTown, savedGear, wear, bagPieces, gyeokText, loadImage, promo: id => promoOf(id),
  SINSU_GATE, specialName, raidName: id => (RAIDS.find(r => r.id === id) || { name: id }).name,
  heroPicture, matPicture: id => { const im = matImage(id); return im ? im.src : ''; },
  // 공대 (the raid on the war's fighters)
  strike: allyStrike, auraK, bossSay, raidK: () => raidK(), RAID_LIMIT, RAID_BOSS_AT, raidPow: id => (RAID_GEAR[id] || { pow: 3 }).pow,
  altName: c => (PARTY[c.id] ? PARTY[c.id].names[0] : c.name), raidFail: title => showResults(title),
  // 「쟁」 (the world boss fought over by three guilds)
  RAIDS, bossBrain, raidMarks, addEnemy, pickMonster: champ => pickMonster(champ), leave, josa, emote,
  raidSet, raidTier, pickGear, bag: c => bag(c),
  // AI 동료 (war.js personas): the hero's 전투력 (the spread of the fighters' specs), a skill's own
  // definition and its picture at a 단 (the fighters' rotations, as the companions').
  combatPower: c => combatPower(c), heroBusy: () => heroLoading > 0, fxRoom: () => fxRoom(), tierDef: id => tierDef(id), memberFx: (id, sl) => memberFx(id, sl),
  castAs, skillSheets, plainLook,
});

// 사냥 기믹 (hunt.js): the hunting grounds' own rules (design/hunt_overhaul.md).
const Hunt = initHunt({
  G: () => G, settings: () => settings, progress: () => progress, saveSettings: () => saveJson('bs_settings', settings), audio: () => audio,
  say, banner, emote, josa, floatText, outline, lootFeed, addEnemy, pickMonster, floorCount, huntEvent, pactOn, PACTS,
  raidPattern, raidWave, raidMarks, killEnemy, clearStage, promoOf, nextChoice, rollMats, dropGear, levelCap, MAX_PASSIVE_LEVEL,
  M: () => M, images, pic, picDrop, occ, TILE, MELEE, free, bodiesAt, heroTile, dashFrom, stats, hurtEnemy, applyStatus, around, later, addFx, fxBudget,
  walled: (tx, ty) => !!(G.arena && !Hunt.open(tx, ty)),
  heroStatus, towards, step, relocate: (e, at) => { leave(e); place(e, at[0], at[1]); }, propsNear: () => G.seenProps || [],
  VW: () => VW, VH: () => VH, Z: () => Z, might, loadImage, drawGroundCached, mode: () => pickedMode, best: () => best, raidStart, applyBuild, xpFor, rollSpecial,
  saveProgress: () => saveJson('bs_progress', progress),
});

// 코디 (costume.js): 연's costume items over the gear, chosen in town.
initCostume({
  M: () => M, progress: () => progress, save: () => saveJson('bs_progress', progress), say, won, walletHTML,
  cls: () => (G ? G.cls : chosenClass), savedGear, yGearVariants,
  changed: () => { if (G && G.player && G.player.gear) G.player.gear.cos = wornCostume(G.cls.id); },
});
bindCoordi();
$('#equip-coordi').onclick = () => openCoordi();

ensureSeen();
boot();
