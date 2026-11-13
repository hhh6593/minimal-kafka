// Dressing the hero from the wardrobe layers (tools/avatar_assets.py): an armor sheet carries
// the whole figure; head, weapon and shield layers are laid over it. Every sheet is 8 columns
// (idle, attack, magic, sit, walk 0-3) by 4 rows (front, right, back, left) of one cell size.

import { CLASSES } from './data.js';

const ROWS = { front: 0, right: 1, back: 2, left: 3 };
const COLS = { idle: 0, attack: 1, magic: 2, sit: 3, walk: 4 };
export const WALK_MS = 135;

// What each class wears, tier by tier: chests in the hunting grounds hand out the next one.
// Names are the wardrobe's.
export const GEAR = {
  warrior: { head: '17', armor: ['남자갑옷', '남자갑주', '비늘남자갑주', '궁중무사갑주', '남자무사옷', '불의갑주'],
    weapon: ['목검', '철검', '백화검', '환두대도', '칠지도', '용천제일검', '청룡의검', '참마도'],
    shield: ['나무방패', '사각방패', '철방패', '천성대방패'] },
  rogue: { head: '56', armor: ['호위무사옷', '흑영협객도복', '무도가옷', '해골갑옷', '중국풍남자옷', '황혼의갑주'],
    weapon: ['비늘단도', '가시철단도', '철도', '진아광검', '도룡보도', '용마제일검', '저주의단검'],
    shield: ['보라방패', '월광방패', '일광방패'] },
  mage: { head: '20', armor: ['남자신관복', '남자성광법의', '자개망토옷', '곤룡포', '용왕의용포'],
    weapon: ['해룡의지팡이', '월광천봉', '원혼의낫', '일월대도', '현랑부', '심판의낫', '흑단화염장'],
    shield: ['주술방패', '거울방패', '정화의방패'] },
  poet: { head: '19', armor: ['도포', '장삼', '남자도복', '남자제사장의상', '여명의치마'],
    weapon: ['흑단부채', '대붓', '백운장', '하늘개비', '자월초롱'],
    shield: ['신선비급', '호리병', '연등', '여신의방패', '백룡현갑'] },
};
// 투구 and 망토: only today's crafted pieces (items.js), worn from the dress room's looks.
for (const g of Object.values(GEAR)) { g.helmet = []; g.cape = []; }

// Raid spoils: one piece a class a raid, beyond anything a hunting ground drops, after the boss
// it comes from — dragons' gear from 삼두룡, the judging and the cursed from 흑술사, fire from 화령.
export const RAID_GEAR = {
  // A set for each raid: an armor and a shield any class may wear, and a weapon for each
  // class. pow is the tier the set counts as (a hunting ground's best is about 4-5): a middling
  // raid gives middling pieces, the last raids the best.
  raid_boar: { pow: 3, armor: '원주민의옷', shield: '대나무방패',
    weapon: { warrior: '곤봉', rogue: '삼첨도', mage: '횃불', poet: '나비채' } },
  raid_tiger: { pow: 4, armor: '여자무사옷', shield: '떡갈나무방패',
    weapon: { warrior: '백호의검', rogue: '얼음칼', mage: '건곤권', poet: '초롱' } },
  raid_goblin: { pow: 5, armor: '여자갑옷', shield: '문신방패',
    weapon: { warrior: '도깨비방망이', rogue: '현랑부', mage: '도깨비방망이', poet: '검정깃발' } },
  raid_hydra: { pow: 7, armor: '용왕의용포', shield: '백룡현갑',
    weapon: { warrior: '청룡의검', rogue: '도룡보도', mage: '일월대도', poet: '탁조' } },
  raid_sorcerer: { pow: 8, armor: '무녀복', shield: '팔세지도',
    weapon: { warrior: '참마도', rogue: '저주의단검', mage: '심판의낫', poet: '자월초롱' } },
  raid_sea: { pow: 8, armor: '선녀의옷', shield: '거문고',
    weapon: { warrior: '현무의검', rogue: '탁조', mage: '얼음칼', poet: '현무의검' } },
  raid_fire: { pow: 9, armor: '불의갑주', shield: '일광방패',
    weapon: { warrior: '주작의검', rogue: '횃불', mage: '흑단화염장', poet: '건곤권' } },
  raid_wukong: { pow: 10, armor: '장삼', shield: '연등',
    weapon: { warrior: '삼첨도', rogue: '진아광검', mage: '백운장', poet: '하늘개비' } },
  raid_musin: { pow: 11, armor: '남자기모노', shield: '월광방패',
    weapon: { warrior: '일월대도', rogue: '비늘단도', mage: '해룡의지팡이', poet: '흑단부채' } },
  raid_brit: { pow: 12, armor: '황혼의갑주', shield: '천성대방패',
    weapon: { warrior: '현무의검', rogue: '저주의단검', mage: '심판의낫', poet: '자월초롱' } },
  raid_gwoe: { pow: 11, armor: '황혼의갑주', shield: '주술방패',
    weapon: { warrior: '참마도', rogue: '저주의단검', mage: '원혼의낫', poet: '자월초롱' } },
  raid_varuna: { pow: 12, armor: '용왕의용포', shield: '거문고',
    weapon: { warrior: '청룡의검', rogue: '도룡보도', mage: '해룡의지팡이', poet: '하늘개비' } },
  raid_agni: { pow: 13, armor: '불의갑주', shield: '일광방패',
    weapon: { warrior: '주작의검', rogue: '진아광검', mage: '흑단화염장', poet: '자월초롱' } },
  raid_airavata: { pow: 14, armor: '선녀의옷', shield: '천성대방패',
    weapon: { warrior: '백호의검', rogue: '저주의단검', mage: '심판의낫', poet: '백운장' } },
};

// 용무기: made only by the smith's 조합, never dropped (see items.js for the recipe).
export const CRAFT_GEAR = { warrior: '용천제일검', rogue: '용마제일검', mage: '용겸제일봉', poet: '용랑제일봉' };
export const CRAFT_POWER = 10;
for (const [cls, name] of Object.entries(CRAFT_GEAR)) if (!GEAR[cls].weapon.includes(name)) GEAR[cls].weapon.push(name);

/** A raid's three pieces for a class: [kind, name]. */
export function raidSet(id, cls) {
  const r = RAID_GEAR[id];
  return [['weapon', r.weapon[cls]], ['armor', r.armor], ['shield', r.shield]];
}

// Every raid piece has a place in each class's line, after the hunting grounds' own.
for (const id of Object.keys(RAID_GEAR))
  for (const cls of Object.keys(GEAR))
    for (const [kind, name] of raidSet(id, cls)) if (!GEAR[cls][kind].includes(name)) GEAR[cls][kind].push(name);

/** The tier a worn piece counts as: its place in the line, or its raid set's power. */
export function gearPower(cls, kind, tier) {
  const name = GEAR[cls][kind][tier];
  if (kind === 'weapon' && name === CRAFT_GEAR[cls]) return CRAFT_POWER;
  for (const id of Object.keys(RAID_GEAR))
    if (raidSet(id, cls).some(([k, n]) => k === kind && n === name)) return RAID_GEAR[id].pow;
  return tier;
}

// Looks added to a class's line only for crafted pieces: never dropped as they are.
export const EXTRA_LOOKS = new Set();

/** The place of a look in a class's line, adding it (as a crafted-only look) when missing. */
export function lookTier(cls, kind, name) {
  let i = GEAR[cls][kind].indexOf(name);
  if (i < 0) {
    GEAR[cls][kind].push(name);
    EXTRA_LOOKS.add(name);
    i = GEAR[cls][kind].length - 1;
  }
  return i;
}

/** The places in a line that the hunting grounds hand out, weakest first: no raid or crafted
 *  piece among them, wherever those sit in the line. */
export function plainList(cls, kind) {
  const raid = new Set(Object.keys(RAID_GEAR).flatMap(id => raidSet(id, cls)).filter(([k]) => k === kind).map(([, n]) => n));
  if (kind === 'weapon') raid.add(CRAFT_GEAR[cls]);
  return GEAR[cls][kind].map((n, i) => (raid.has(n) || EXTRA_LOOKS.has(n) ? -1 : i)).filter(i => i >= 0);
}

/** How many tiers of a kind the hunting grounds hand out: the raid pieces are not among them. */
export function plainTiers(cls, kind) {
  const raid = new Set(Object.keys(RAID_GEAR).flatMap(id => raidSet(id, cls)).filter(([k]) => k === kind).map(([, n]) => n));
  if (kind === 'weapon') raid.add(CRAFT_GEAR[cls]);
  return GEAR[cls][kind].filter(n => !raid.has(n)).length;
}

let M, images;

export function initAvatars(manifest, imgs) {
  M = manifest.avatar;
  images = imgs;
}

export function hasAvatars() {
  return !!M;
}

/** Image paths to load: every sheet the classes can wear, and their slot icons. */
export function avatarPaths(manifest) {
  const a = manifest.avatar;
  if (!a) return [];
  const out = [];
  for (const c of CLASSES) {
    const g = GEAR[c.id];
    const pick = (kind, name) => {
      const i = a[kind].findIndex(x => x.name === name);
      if (i >= 0) out.push(`avatar/${kind}/${i}.png`, `avatar/${kind}/${i}_icon.png`);
    };
    pick('head', g.head);
    for (const kind of ['armor', 'weapon', 'shield']) for (const n of g[kind]) pick(kind, n);
  }
  // Every hair the wardrobe has: any class may wear any of them (머리 모양 in the equip window).
  a.head.forEach((h, i) => out.push(`avatar/head/${i}.png`, `avatar/head/${i}_icon.png`));
  return [...new Set(out)];
}

function index(kind, name) {
  return M[kind].findIndex(x => x.name === name);
}

/** The name of a class's gear at a tier, or null when it has none there. */
export function gearName(cls, kind, tier) {
  const list = GEAR[cls][kind];
  return tier >= 0 && tier < list.length ? list[tier] : null;
}

/** Every hair style, by its wardrobe name, with its icon. */
export function heads() {
  return M ? M.head.map((h, i) => ({ name: h.name, icon: `assets/avatar/head/${i}_icon.png` })) : [];
}

export function gearIcon(cls, kind, tier) {
  const n = gearName(cls, kind, tier);
  const i = n ? index(kind, n) : -1;
  return i >= 0 ? `assets/avatar/${kind}/${i}_icon.png` : null;
}

/**
 * One sheet of a dressed hero: the armor, then the head (which may clear some of the plain
 * head's hair: alpha 1), the shield and the weapon.
 */
export function dress(cls, gear) {
  const [cw, ch] = M.cell;
  // gear.looks: today's dress-room look of a piece (its name), when its sheet is loaded.
  const looks = gear.looks || {};
  const pick = kind => (looks[kind] && lookReady(kind, looks[kind]) ? looks[kind] : gearName(cls, kind, gear[kind]));
  const armor = images[`avatar/armor/${index('armor', pick('armor'))}.png`];
  const c = document.createElement('canvas');
  c.width = cw * 8;
  c.height = ch * 4;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(armor, 0, 0);
  const out = g.getImageData(0, 0, c.width, c.height);
  const lay = (kind, name) => {
    const i = name ? index(kind, name) : -1;
    const im = i >= 0 && images[`avatar/${kind}/${i}.png`];
    if (!im || !im.width) return;
    const t = document.createElement('canvas');
    t.width = c.width;
    t.height = c.height;
    const tg = t.getContext('2d', { willReadFrequently: true });
    tg.drawImage(im, 0, 0);
    const src = tg.getImageData(0, 0, c.width, c.height).data, dst = out.data;
    for (let p = 0; p < src.length; p += 4) {
      const a = src[p + 3];
      if (a === 0) continue;
      if (a === 1) {
        dst[p + 3] = 0;
        continue;
      }
      dst[p] = src[p];
      dst[p + 1] = src[p + 1];
      dst[p + 2] = src[p + 2];
      dst[p + 3] = a;
    }
  };
  lay('cape', pick('cape'));
  lay('head', gear.head || GEAR[cls].head);
  lay('helmet', pick('helmet'));
  lay('shield', pick('shield'));
  lay('weapon', pick('weapon'));
  g.putImageData(out, 0, 0);
  return { sheet: c, cw, ch, fx: M.feet[0], fy: M.feet[1], top: bodyTop(out, cw, ch) };
}

/** Whether the build has today's dress-room look of that name (a sheet, maybe not loaded yet). */
export function hasLook(kind, name) {
  return !!M && !!M[kind] && index(kind, name) >= 0;
}
function lookReady(kind, name) {
  const im = images[`avatar/${kind}/${index(kind, name)}.png`];
  return index(kind, name) >= 0 && !!im && im.complete && im.naturalWidth > 0;
}

/**
 * Loads the sheets of today's looks when first worn (there are many; loading them all at the
 * start would take hundreds of MB), then calls done once if any was missing.
 */
export function loadLooks(looks, done) {
  const want = Object.entries(looks).filter(([k, n]) => n && hasLook(k, n) && !lookReady(k, n));
  if (!want.length) return;
  let left = want.length;
  for (const [kind, name] of want) {
    const path = `avatar/${kind}/${index(kind, name)}.png`;
    const im = images[path] || new Image();
    images[path] = im;
    const end = () => { if (--left === 0) done(); };
    if (im.src && !im.complete) { im.addEventListener('load', end); im.addEventListener('error', end); continue; }
    im.onload = end;
    im.onerror = end;
    im.src = `assets/${path}`;
  }
}

/** How far above the feet the figure's head is, in the front idle pose (for bars and bubbles). */
function bodyTop(img, cw, ch) {
  const d = img.data, w = img.width;
  for (let y = 0; y < ch; y++) {
    for (let x = Math.floor(cw * 0.35); x < cw * 0.65; x++) if (d[(y * w + x) * 4 + 3] > 1) return M.feet[1] - y;
  }
  return 48;
}

export function facing(dx, dy) {
  if (dy > 0) return 'front';
  if (dy < 0) return 'back';
  return dx < 0 ? 'left' : 'right';
}

/** Draws a dressed hero with its feet at x, y. pose: idle, attack, magic, sit or walk. */
export function drawAvatar(ctx, av, x, y, dir, pose, frame = 0, alpha = 1) {
  const col = pose === 'walk' ? COLS.walk + (frame % 4) : COLS[pose];
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(av.sheet, col * av.cw, ROWS[dir] * av.ch, av.cw, av.ch,
    Math.round(x - av.fx), Math.round(y - av.fy), av.cw, av.ch);
  ctx.restore();
}

/** The front idle figure as a picture, cropped, for menus and the side panel. */
export function portrait(av) {
  const c = document.createElement('canvas');
  c.width = av.cw;
  c.height = av.ch;
  c.getContext('2d').drawImage(av.sheet, 0, 0, av.cw, av.ch, 0, 0, av.cw, av.ch);
  const g = c.getContext('2d');
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      if (d[(y * c.width + x) * 4 + 3] > 1) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
    }
  }
  const o = document.createElement('canvas');
  o.width = Math.max(1, x1 - x0 + 1);
  o.height = Math.max(1, y1 - y0 + 1);
  o.getContext('2d').drawImage(c, x0, y0, o.width, o.height, 0, 0, o.width, o.height);
  return o.toDataURL();
}
