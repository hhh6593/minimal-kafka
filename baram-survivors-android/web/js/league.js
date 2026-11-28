// 문파 리그 · 주간 전장 규칙 (엔드게임 2026-11-28, docs/9cha_rules.md "엔드게임 심층 분석·설계").
//
// Every 사냥터 cleared, the 대항전 and the 「쟁」 are what is left to play, and they had no ladder: a war won or lost paid
// the same 성물 and left nothing to climb. Here, with no other file's state:
// - 리그 점수 (명성): a war or a 「쟁」 moves it (won/lost, the hero's tier S~C, a run of wins, the day's first win),
//   seven 무림 경지 from 삼류 to 현경 by it; a 경지 reached the first time in a season pays at once, the season's best
//   pays at its end. A season is four weeks (the 괴력난신's Monday week); at its turn the points fall back halfway.
//   A loss at the floor of a 경지 does not take it away (강등 보호) below 일류 — the climb is never lost to one bad war.
// - 주간 전장 규칙: one of five rules a week (the same Monday week) shapes every war and 「쟁」 of that week — the shrines
//   come more often, kills mend, the guild behind fights harder, supply doubles, the commanders stand longer — so the week's
//   wars do not play as the last week's did (the 쐐기돌 어픽스 / 주간 리셋 idea), and its win pays a little more.

import { gwoeWeek } from './data.js';

export const LEAGUE_TIERS = [
  { id: 'samryu', name: '삼류', at: 0, col: '#b8a888' },
  { id: 'iryu', name: '이류', at: 250, col: '#9fd0a0' },
  { id: 'ilryu', name: '일류', at: 600, col: '#8ac8ff' },
  { id: 'jeoljeong', name: '절정', at: 1050, col: '#c89aff' },
  { id: 'chojeol', name: '초절정', at: 1600, col: '#ffb060' },
  { id: 'hwagyeong', name: '화경', at: 2250, col: '#ff7a6a' },
  { id: 'hyeongyeong', name: '현경', at: 3000, col: '#ffd040' },
];
export const SEASON_WEEKS = 4;
/** The season of a week (four of the 괴력난신's weeks). */
export const seasonOf = (week = gwoeWeek()) => Math.floor(week / SEASON_WEEKS);
/** Days left in the season (its last Monday's end). */
export function seasonDaysLeft(now = Date.now()) {
  const week = gwoeWeek(now), end = Date.UTC(2024, 0, 1) + (seasonOf(week) + 1) * SEASON_WEEKS * 7 * 864e5;
  return Math.max(1, Math.ceil((end - now) / 864e5));
}
export function leagueTier(pts) {
  let i = 0;
  while (i + 1 < LEAGUE_TIERS.length && pts >= LEAGUE_TIERS[i + 1].at) i++;
  return i;
}
// What reaching a 경지 pays the first time in a season, and what the season's best pays at its end.
// (mats: game ids — kalpa 겁화의 파편, essence 조화의 정수, scroll 고문서; coins 레이드주화.)
export const TIER_REWARD = [
  null,
  { gold: 3000, coins: 10, mats: { kalpa: 2 } },
  { gold: 5000, coins: 20, mats: { kalpa: 3, essence: 1 } },
  { gold: 8000, coins: 30, mats: { kalpa: 4, essence: 2 } },
  { gold: 12000, coins: 45, mats: { kalpa: 5, essence: 3, scroll: 1 } },
  { gold: 16000, coins: 60, mats: { kalpa: 6, essence: 4, scroll: 1 }, cos: true },
  { gold: 22000, coins: 80, mats: { kalpa: 8, essence: 5, scroll: 2 }, cos: true },
];
export const SEASON_REWARD = tier => ({ gold: 4000 + 4000 * tier, coins: 15 + 20 * tier, mats: tier >= 3 ? { kalpa: 2 + tier, essence: tier - 1 } : { kalpa: 1 + tier }, cos: tier >= 4 });
/** The title a 경지 gives on the war's board and the results (the season's best). */
export const tierTitle = i => `${LEAGUE_TIERS[i].name} 문파장`;

/** The save's 리그 (pr.league), turned over to this season when a new one has begun (its end paid: pending). */
export function leagueOf(pr, week = gwoeWeek()) {
  const season = seasonOf(week);
  let L = pr.league;
  if (!L) L = pr.league = { season, first: season, pts: 0, peak: 0, streak: 0, played: 0, won: 0, paid: [], log: [], pending: null, day: null, best: 0 };
  if (L.season !== season) {
    // The season's end: its best 경지 is paid (claimed in the board), the points fall back halfway.
    if (L.played) L.pending = { season: L.season, tier: leagueTier(L.peak), reward: SEASON_REWARD(leagueTier(L.peak)) };
    L.best = Math.max(L.best || 0, leagueTier(L.peak));
    L.season = season;
    L.pts = Math.round(L.pts * 0.5);
    L.peak = L.pts;
    L.paid = [];
    L.streak = 0;
    L.played = L.won = 0;
    L.log = [];
  }
  return L;
}

/**
 * The points a war or a 「쟁」 brings: won (+40) or lost (−22); the hero's tier (S +14, A +8, B +2, C −6 — a war
 * lost while carrying it costs little, one won while away gains little), a run of wins (+4 a win, up to +16), the day's
 * first win (+25), the week's rule won (+6). 「쟁」: by place (1위 +40, 2위 +8, 3위 −18) on the same scale.
 * 강등 보호: a loss never takes the points under the floor of the 경지 held, below 일류 (it does from 절정 on, by half).
 */
export function leagueGain(L, o) {
  const parts = [];
  const won = o.place ? o.place === 1 : !!o.win;
  if (o.place) parts.push([`쟁 ${o.place}위`, [0, 40, 8, -18][o.place]]);
  else parts.push([won ? '승리' : '패배', won ? 40 : -22]);
  const tk = { S: 14, A: 8, B: 2, C: -6 }[o.tier] || 0;
  if (tk) parts.push([`기여 ${o.tier}`, tk]);
  if (won && L.streak >= 1) parts.push([`${L.streak + 1}연승`, Math.min(16, 4 * L.streak)]);
  if (won && o.day && L.day !== o.day) parts.push(['오늘 첫 승', 25]);
  if (won && o.rule) parts.push([`주간 규칙 · ${o.rule}`, 6]);
  let delta = parts.reduce((a, p) => a + p[1], 0);
  // (백호 난투, three minutes: 0.7 of a war's points)
  if (o.short) { const d2 = Math.round(delta * 0.7); parts.push(['3분 난투 ×0.7', d2 - delta]); delta = d2; }
  if (delta < 0) {
    const i = leagueTier(L.pts), floor = LEAGUE_TIERS[i].at;
    if (i <= 2 && L.pts + delta < floor) { parts.push(['강등 보호', floor - (L.pts + delta)]); delta = floor - L.pts; }
    else if (i > 2 && L.pts + delta < floor) { const keep = Math.round((floor - (L.pts + delta)) / 2); parts.push(['강등 완충', keep]); delta += keep; }
  }
  return { delta, parts, won };
}

/** Into the save: the points, the run, the 경지 reached (its reward the first time this season). */
export function leagueApply(pr, o) {
  const L = leagueOf(pr);
  const before = L.pts, tBefore = leagueTier(before);
  const g = leagueGain(L, o);
  L.pts = Math.max(0, before + g.delta);
  L.peak = Math.max(L.peak, L.pts);
  L.played++;
  if (g.won) { L.won++; L.streak++; if (o.day) L.day = o.day; } else L.streak = 0;
  const tAfter = leagueTier(L.pts);
  const ups = [];
  for (let i = tBefore + 1; i <= tAfter; i++) if (!L.paid.includes(i)) { L.paid.push(i); ups.push(i); }
  L.log.unshift({ what: o.what, d: g.delta, won: g.won, tier: o.tier || '', t: Date.now() });
  L.log.length = Math.min(L.log.length, 12);
  return { before, after: L.pts, delta: g.delta, parts: g.parts, tBefore, tAfter, ups, streak: L.streak, next: LEAGUE_TIERS[tAfter + 1] || null };
}

// ------------------------------------------------ 주간 전장 규칙
// One a week, in turn (the Monday week), for every 대항전 and 「쟁」 of the week. war.js reads the numbers.
export const WAR_RULES = [
  { id: 'shrine', name: '신단의 주', desc: '전장 신단이 더 자주(45초마다) 깨어나고, 신단의 힘이 1.5배로 오래 간다.', shrineEvery: 45, shrineK: 1.5 },
  { id: 'blood', name: '혈풍', desc: '적을 쓰러뜨린 자는 체력 15%를 되찾고, 처치 점수(백호전·쟁)가 1.5배.', killHeal: 0.15, killPts: 1.5 },
  { id: 'comeback', name: '역전의 기세', desc: '뒤지는 문파는 점수 차만큼 공격이 강해진다(최대 +15%) — 끝까지 알 수 없다.', comeback: 0.15 },
  { id: 'supply', name: '보급 풍년', desc: '보급 상자가 두 배로 나오고, 운반 효과가 1.5배.', crateK: 2, deliverK: 1.5 },
  { id: 'siege', name: '공성 병기', desc: '현무전 충차가 더 튼튼하고 빨리 다시 만들어지며, 백호·청룡·주작전엔 진영대장이 25% 단단하다.', ramK: 1.5, cmdHpK: 1.25 },
];
/** The week's rule (window.__warRule overrides it for tests). */
export function warRule(week = gwoeWeek()) {
  if (typeof window !== 'undefined' && window.__warRule) return WAR_RULES.find(r => r.id === window.__warRule) || WAR_RULES[0];
  return WAR_RULES[((week % WAR_RULES.length) + WAR_RULES.length) % WAR_RULES.length];
}
