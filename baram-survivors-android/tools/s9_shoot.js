// node shoot.js OUTDIR NAME SKILL|ult "t1,t2,…" [gifSeconds]
// A warrior hunt, a gathered crowd, damage numbers hidden; the skill cast at 8단 (ult: the 9차 필살기); full-screen
// frames at the given times after the cast (the game paused for each), OUTDIR/NAME_<i>.png, and OUTDIR/NAME.json
// (the scale: screenshot pixels a game pixel; the times). With gifSeconds: also a free-running burst NAME_g<i>.png.
// env: PORT, SIZE (window.__ultSize), PRE (js run before the cast), CROWD (default 4 gathers), DSF (2), CLS (the class's index,
// default 0: 전사), WARM (comma-separated fx ids decoded before the cast; default the warrior's),
// ALSO ("id:at,id:at": more skills put in the hands with the cast, each first cast `at` seconds later).
const { chromium } = require('playwright');
const fs = require('fs');
const [OUT, NAME, SKILL, TS, GIF] = process.argv.slice(2);
const T = TS.split(',').map(Number), PORT = process.env.PORT || 9130, DSF = +(process.env.DSF || 2);
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 915, height: 412 }, deviceScaleFactor: DSF });
  p.on('pageerror', e => console.log('ERR', String(e).slice(0, 300)));
  await p.goto(`http://localhost:${PORT}/?all`);
  await p.waitForSelector('#title:not([hidden])', { timeout: 60000 });
  const stage = await p.evaluate(() => __stageList().find(s => s[1] === 'goblin')[0]);
  await p.evaluate(([c, s]) => __start(c, s), [+(process.env.CLS || 0), stage]);
  await p.waitForTimeout(1500);
  await p.evaluate(() => { window.__quietText = true; const g = __game(); g.hunt = null; g.player.lvl = 40; g.player.next = 1e15; g.skills = []; window.__botInput = () => [0, 0];
    document.querySelector('#levelup').hidden = true; g.choosing = false; for (let k = 0; k < 4; k++) window.__crowd(34, 60); g.buffs.guard = g.t + 999; g.player.atkT = 1e9; });
  await p.waitForTimeout(300);
  await p.evaluate(r => window.__gather(r), +(process.env.GATHER || 4));
  await p.waitForTimeout(300);
  if (SKILL === 'ult') { await p.evaluate(s => { if (s) window.__ultSize = s; window.__ultAt(9); }, +(process.env.SIZE || 0)); await p.waitForTimeout(700); }
  // (everything a class's kit draws, decoded before the cast: a frame is not shot while its sheet loads)
  await p.evaluate(ids => window.__fxWarm(ids), (process.env.WARM || 'o_w_hogisword,o_w_hogisign,o_w_apdo,o_w_heukryong,o_w_ult9,k_w_blackdragon').split(','));
  await p.waitForTimeout(300);
  // (the hud out of the frames)
  await p.addStyleTag({ content: '#hud, .hud, #chat, #log, #btns, #ult-btn, #util-btn, #train, #toast, #minimap, #say, #quest, #battle, #top, #skills, #bars { opacity: 0 !important; }' });
  if (process.env.PRE) await p.evaluate(process.env.PRE);
  const info = await p.evaluate(([id, also]) => {
    const g = __game();
    g.fxs.length = 0;
    if (id === 'ult') { g.player.mp = g.player.maxMp; g.ultAt = -999; window.__ult(); } else g.skills = [{ id, lv: 8, timer: 0.02 }].concat((also || '').split(',').filter(Boolean).map(a => ({ id: a.split(':')[0], lv: 8, timer: +a.split(':')[1] })));
    const c = document.querySelector('canvas');
    return { t0: g.t + (id === 'ult' ? 0 : 0.02), cw: c.width, ch: c.height, css: c.clientWidth, Z: window.__Z() };
  }, [SKILL, process.env.ALSO]);
  info.scale = (info.css * DSF) / (info.cw / info.Z); info.times = T;
  for (const [i, at] of T.entries()) {
    await p.waitForFunction(([a, d]) => __game().t >= a + d, [info.t0, at], { timeout: 20000, polling: 'raf' }).catch(() => {});
    await p.evaluate(() => { __game().paused = true; });
    await p.screenshot({ path: `${OUT}/${NAME}_${i}.png` });
    await p.evaluate(() => { __game().paused = false; });
  }
  if (GIF) {
    // again, free-running, as many frames as the screenshots allow (their real times kept)
    await p.waitForTimeout(1500);
    await p.evaluate(() => { const g = __game(); g.skills = []; if (g.enemies.length < 40) for (let k = 0; k < 2; k++) window.__crowd(34, 60); window.__gather(4); });
    await p.waitForTimeout(600 + +(process.env.GIFWAIT || 0));
    if (process.env.PRE) await p.evaluate(process.env.PRE);
    const t0 = await p.evaluate(([id, also]) => { const g = __game(); g.windUntil = 0; if (id === 'ult') { g.player.mp = g.player.maxMp; g.ultAt = -999; window.__ult(); } else g.skills = [{ id, lv: 8, timer: 0.02 }].concat((also || '').split(',').filter(Boolean).map(a => ({ id: a.split(':')[0], lv: 8, timer: +a.split(':')[1] }))); return g.t; }, [SKILL, process.env.ALSO]);
    info.gif = [];
    for (let n = 0; ; n++) {
      const t = await p.evaluate(() => __game().t);
      if (t - t0 > +GIF) break;
      await p.screenshot({ path: `${OUT}/${NAME}_g${String(n).padStart(3, '0')}.jpg`, type: 'jpeg', quality: 80, clip: { x: 457 - 220, y: 206 - 190, width: 440, height: 350 } });
      info.gif.push(+(t - t0).toFixed(3));
    }
  }
  fs.writeFileSync(`${OUT}/${NAME}.json`, JSON.stringify(info));
  console.log(NAME, JSON.stringify({ ...info, gif: info.gif && info.gif.length }));
  await b.close();
})();
