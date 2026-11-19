// 사냥 템포 계측 (design/hunt_overhaul.md P0): plays hunting grounds with a bot and reads the
// game's own record (window.__pace): each game second's kills, level, field and boss life, and the
// moments something new happens. Prints, per run: its length, the boss fight, the longest and the
// median stretch with nothing new, the level at 0:30/1:00, kills a second in the first minute,
// and how many cards would have stopped the hunt with 자동 선택 off.
//
//   node tools/pace.js PORT CLASSES STAGES TAG [SPEED]      e.g. node tools/pace.js 8803 0,2 0,7 before
//
// CLASSES and STAGES are indices (comma lists); every pair is played. Env: HEAL=1 refills the
// hero below half life (to measure tempo, not death), LEGACY=1 plays with settings.legacyPace,
// DASH=1 lets the bot use 질주 (Shift), OUT=dir for the jsonl (default .), GEAR=+n gear steps.
// Needs playwright (npm i playwright) and a served build (build/assets/www).
const { chromium } = require('playwright');
const fs = require('fs');
const [PORT, CLS, LIST, TAG, SPEED = 8] = process.argv.slice(2);
const OUT = `${process.env.OUT || '.'}/pace_${TAG}.jsonl`;

function summary(r) {
  const P = r.pace || { s: [], ev: [] };
  const end = r.clearT !== undefined ? r.clearT : r.t;
  const NEW = /^(champ|mini|event|boss|press|clear|cross|goal|stage|hazard|phase|groggy|elite|act|intro|pat)/;
  const ev = P.ev.filter(([t, k]) => NEW.test(k) && t <= end).map(([t]) => t);
  const marks = [0, ...ev, end].sort((a, b) => a - b);
  const gaps = [];
  for (let i = 1; i < marks.length; i++) gaps.push(marks[i] - marks[i - 1]);
  const sg = gaps.slice().sort((a, b) => a - b);
  const at = s => { const x = P.s.find(q => q[0] >= s); return x || P.s[P.s.length - 1] || [0, 0, 0]; };
  return {
    run: Math.round(end), boss: r.bossT !== undefined ? Math.round(end - r.bossT) : null, bossAt: r.bossT !== undefined ? Math.round(r.bossT) : null,
    gapMax: Math.round(sg[sg.length - 1] || 0), gapMed: Math.round(sg[sg.length >> 1] || 0),
    lv30: at(30)[2], lv60: at(60)[2], kps1: +(at(60)[1] / 60).toFixed(1), cards: P.cards, stops: P.manual,
    lvEnd: r.lvl, kills: r.kills, dead: r.dead, cleared: r.cleared, grade: r.grade || '', dash: r.dashes || 0,
  };
}

(async () => {
  const lines = [];
  for (const cls of CLS.split(',').map(Number)) for (const si of LIST.split(',').map(Number)) {
    const b = await chromium.launch({ args: ['--disable-gpu-vsync', '--disable-frame-rate-limit'] });
    const p = await b.newPage({ viewport: { width: 915, height: 412 }, deviceScaleFactor: 1 });
    const errs = [];
    p.on('pageerror', e => errs.push('ERR ' + e.message + ' ' + (e.stack || '').split('\n')[1]));
    await p.goto(`http://localhost:${PORT}/?all&speed=${SPEED}`);
    await p.waitForSelector('#title:not([hidden])');
    await p.evaluate(([cls, si, legacy, step]) => (async () => {
      localStorage.clear();
      localStorage.setItem('bs_settings', JSON.stringify({ autoPick: true, bgm: false, sfx: false, numbers: true, bubbles: true, tiles: true, legacyPace: legacy }));
      // Gear and 승급 that fit the ground (its drops' tier is about level/3 + 1, two steps over).
      const D = await import('/js/data.js'), Av = await import('/js/avatar.js');
      const st = D.STAGES[si], lvl = st.level !== undefined ? st.level : si, c = D.CLASSES[cls].id;
      const gear = {};
      for (const k of ['weapon', 'armor', 'shield', 'helmet', 'cape']) {
        const l = Av.plainList(c, k);
        gear[k] = l.length ? l[Math.min(l.length - 1, Math.floor(lvl / 3) + 3 + step)] : -1;
      }
      const lvOf = id => { const s = D.STAGES.find(x => x.id === id); return s.level !== undefined ? s.level : D.STAGES.indexOf(s); };
      const byc = {};
      for (const at of D.PROMO_AT) if (lvOf(at) < lvl) byc[at] = true;
      localStorage.setItem('bs_progress', JSON.stringify({ gold: 0, cleared: {}, byClass: { [c]: byc }, gear: { [c]: gear } }));
    })(), [cls, si, !!process.env.LEGACY, +(process.env.GEAR || 0)]);
    await p.reload();
    await p.waitForSelector('#title:not([hidden])');
    await p.click('#start-btn');
    await p.click(`.card >> nth=${cls}`);
    await p.waitForTimeout(400);
    await p.evaluate(([c, s, heal, dash]) => {
      window.__dashes = 0;
      window.__botInput = G => {
        const pl = G.player, melee = ['warrior', 'rogue', 'lancer', 'monk', 'dokkaebi', 'reaper', 'celestial'].includes(G.cls.id);
        if (heal && pl.hp < pl.maxHp * 0.5 && !G.dead) pl.hp = pl.maxHp;
        let near = null, nd = 1e9, fx = 0, fy = 0;
        for (const e of G.enemies) {
          const dx = pl.tx - e.tx, dy = pl.ty - e.ty, d = Math.hypot(dx, dy) + 0.5;
          if (d < nd) { nd = d; near = e; }
          if (d < (melee ? 2.2 : 4.5)) { fx += dx / d / d * (e.kind ? 2 : 1); fy += dy / d / d * (e.kind ? 2 : 1); }
        }
        if (melee && near && nd > 1.6 && pl.hp > pl.maxHp * 0.4) { fx = near.tx - pl.tx; fy = near.ty - pl.ty; }
        for (const d of G.drops) {
          const k = Math.hypot(d.x - pl.x, d.y - pl.y);
          if ((d.kind === 'heal' && pl.hp < pl.maxHp * 0.6 && k < 260) || (k < 160 && nd > 2.5)) { fx = d.x - pl.x; fy = d.y - pl.y; break; }
        }
        // The objective (hunt.js) and the treasure are gone after.
        const goal = window.__huntGoal && window.__huntGoal();
        if (goal && nd > 1.2) { fx = goal[0] - pl.tx; fy = goal[1] - pl.ty; }
        const tr = G.enemies.find(e => e.kind === 'treasure' || e.chase);
        if (tr) { fx = tr.tx - pl.tx; fy = tr.ty - pl.ty; }
        // Off the red.
        if (G.marks.some(m => m.tiles.some(([x, y]) => x === pl.tx && y === pl.ty))) { fx = Math.cos(G.t) * 3; fy = Math.sin(G.t) * 3; }
        if (dash && window.__dash && near && ((melee && nd > 1.6 && nd < 4) || (!melee && nd < 1.8))) { if (window.__dash()) window.__dashes++; }
        return [fx + Math.cos(G.t * 0.3) * 0.02, fy + Math.sin(G.t * 0.3) * 0.02];
      };
      __start(c, s);
    }, [cls, si, !!process.env.HEAL, !!process.env.DASH]);
    const t0 = Date.now();
    for (let i = 0; i < 6000; i++) {
      await p.waitForTimeout(120);
      // Cards and the 갈림길 (crossroads), when shown: the first.
      if (await p.isVisible('#levelup')) await p.click('.choice >> nth=0', { timeout: 500 }).catch(() => {});
      if (await p.isVisible('#crossroad').catch(() => false)) await p.click('#crossroad button >> nth=0', { timeout: 500 }).catch(() => {});
      const st = await p.evaluate(() => { const G = __game(); return G && { t: G.t, over: G.over, dead: G.dead, cleared: G.cleared, res: !document.querySelector('#over').hidden }; });
      if (!st || st.over || st.res) break;
      if (st.dead && Date.now() - t0 > 2000) break;
      if (Date.now() - t0 > 300000) break;
    }
    const r = await p.evaluate(si => { const G = __game(); const P = G.pace; const clr = P && P.ev.find(e => e[1] === 'clear');
      return { si, id: G.stage.id, name: G.stage.name, level: G.level, cls: G.cls.id, t: G.t, bossT: G.bossT, clearT: clr ? clr[0] : undefined, kills: G.kills, lvl: G.player.lvl,
        dead: G.dead, cleared: G.cleared, grade: G.style && G.style.grade, dashes: window.__dashes, pace: P }; }, si);
    r.real = (Date.now() - t0) / 1000;
    r.errs = errs.splice(0);
    r.sum = summary(r);
    fs.appendFileSync(OUT, JSON.stringify(r) + '\n');
    const line = [r.cls, r.id, r.level, ...Object.values(r.sum)].join('\t');
    lines.push(line);
    console.log(line, r.errs.length ? r.errs.slice(0, 3).join(' | ') : '');
    await b.close();
  }
  console.log(['cls', 'ground', 'lvl', 'run', 'boss', 'bossAt', 'gapMax', 'gapMed', 'lv30', 'lv60', 'kps1', 'cards', 'stops', 'lvEnd', 'kills', 'dead', 'cleared', 'grade', 'dash'].join('\t'));
  for (const l of lines) console.log(l);
})();
