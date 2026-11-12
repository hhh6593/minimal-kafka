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
  warrior: { head: '17', armor: ['남자갑옷', '남자갑주', '비늘남자갑주', '궁중무사갑주', '불의갑주'],
    weapon: ['목검', '철검', '백화검', '환두대도', '칠지도', '용천제일검'], shield: ['나무방패', '사각방패', '철방패', '천성대방패'] },
  rogue: { head: '56', armor: ['호위무사옷', '흑영협객도복', '무도가옷', '해골갑옷', '황혼의갑주'],
    weapon: ['비늘단도', '가시철단도', '저주의단검', '진아광검', '용마제일검'], shield: ['보라방패', '월광방패', '일광방패'] },
  mage: { head: '20', armor: ['남자신관복', '남자성광법의', '자개망토옷', '용왕의용포'],
    weapon: ['해룡의지팡이', '흑단화염장', '원혼의낫', '월광천봉', '심판의낫'], shield: ['주술방패', '거울방패', '정화의방패'] },
  poet: { head: '19', armor: ['도포', '장삼', '남자제사장의상', '여명의치마'],
    weapon: ['흑단부채', '대붓', '백운장', '하늘개비'], shield: ['신선비급', '호리병', '연등', '여신의방패'] },
};

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
  const armor = images[`avatar/armor/${index('armor', gearName(cls, 'armor', gear.armor))}.png`];
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
  lay('head', GEAR[cls].head);
  lay('shield', gearName(cls, 'shield', gear.shield));
  lay('weapon', gearName(cls, 'weapon', gear.weapon));
  g.putImageData(out, 0, 0);
  return { sheet: c, cw, ch, fx: M.feet[0], fy: M.feet[1], top: bodyTop(out, cw, ch) };
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
