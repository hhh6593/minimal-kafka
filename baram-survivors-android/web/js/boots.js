// 신발 and 이동속도.
//
// Boots are their own slot, kept apart from the gear lines (avatar.js GEAR) and the bag: one pair
// worn, shared by every class (as the 괴력난신 cards are), saved as progress.boots = { have: [id],
// worn: id }. Each pair adds 이동속도; the hero's whole 이동속도 (boots, the 민첩 passive, the
// specials' 이동 속도 option) opens 경공 at +10%, +20% and +30%, which make the boss's red tiles
// easier to step off. The names and icons are today's client's 신발 (Items bundle, Item_206xxx),
// pictures in GEAR_DIR/<name>.png like the legendary gear (tools/yeon_boots.py).
//
// Where they come from: the first four from hunting-ground bosses (the deeper the ground, the
// better the pair), the next three from the smith's 조합, two from the 레이드 상점 for 레이드주화,
// and the last made from the 열반의신발 at the smith.

export const BOOTS = [
  { id: 'boot1', name: '수행의신발', pct: 4, drop: [0, 3] },
  { id: 'boot2', name: '선풍신발', pct: 6, drop: [4, 7] },
  { id: 'boot3', name: '경원신발', pct: 8, drop: [8, 11] },
  { id: 'boot4', name: '파천신발', pct: 10, drop: [12, 99] },
  { id: 'boot5', name: '금강신발', pct: 13, mats: { fur: 10, horn: 6 }, gold: 1500 },
  { id: 'boot6', name: '바람제일식신발', pct: 16, mats: { bone: 10, ember: 6 }, gold: 3000 },
  { id: 'boot7', name: '바람태사신발', pct: 20, mats: { jade: 10, scale: 8 }, gold: 5000 },
  { id: 'boot8', name: '바람홍옥신발', pct: 23, coins: 120 },
  { id: 'boot9', name: '열반의신발', pct: 26, coins: 250 },
  { id: 'boot10', name: "극'열반의신발", pct: 30, from: 'boot9', mats: { kalpa: 20, essence: 10 }, gold: 20000 },
];
export const BOOT = Object.fromEntries(BOOTS.map(b => [b.id, b]));

// 경공: what each step of 이동속도 opens (shown in the equipment window).
export const KYEONGGONG = [
  { at: 10, name: '경공 1단계', text: '붉은 칸 위에서 바로 돌아서고 걸음 20% 빠르게' },
  { at: 20, name: '경공 2단계', text: '붉은 칸이 내게는 0.2초 늦게 떨어짐' },
  { at: 30, name: '경공 3단계', text: '붉은 칸 위에서 4초마다 한 번 두 칸을 한 걸음에 (질풍보)' },
];

// 이동속도 past +60% gets nothing more from boots (the 민첩 passive and the specials' option, as
// before, are not cut: a hunt that ran that fast still does).
export const SPEED_CAP = 60;

/** The boots kept (an old save has none). */
export function bootsState(progress) {
  const b = progress.boots = progress.boots && Array.isArray(progress.boots.have) ? progress.boots : { have: [], worn: null };
  if (b.worn && !BOOT[b.worn]) b.worn = null;
  b.have = b.have.filter(id => BOOT[id]);
  return b;
}

/** The worn pair's 이동속도, in percent (0 when barefoot). */
export function bootsPct(progress) {
  const b = bootsState(progress);
  return b.worn ? BOOT[b.worn].pct : 0;
}

/**
 * The hero's 이동속도: base (the 민첩 passive and the option, multiplied as heroSpeed always did)
 * and the boots on top up to the cap. k: the multiplier boots add; pct: the whole bonus shown;
 * lvl: the 경공 step (0-3).
 */
export function moveBonus(base, bootPct) {
  const room = Math.max(1, (1 + SPEED_CAP / 100) / base);
  const k = Math.min(1 + bootPct / 100, room);
  const pct = Math.round((base * k - 1) * 100);
  let lvl = 0;
  for (const s of KYEONGGONG) if (pct >= s.at) lvl++;
  return { k, pct, lvl };
}

/** The pair a hunting-ground boss of this rank leaves (null past the drop pairs). */
export function bootsForRank(rank) {
  return BOOTS.find(b => b.drop && rank >= b.drop[0] && rank <= b.drop[1]) || null;
}
