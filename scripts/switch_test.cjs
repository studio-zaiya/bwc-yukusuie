// 断られたら、別の世界線へ（WORLD_SWITCH.md の8）の確かめ：担当者の返事の分類を discount に差し替えて、電気の打ち合わせで値下げを繰り返す
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = process.argv[2] || 'http://localhost:8787';
(async () => {
  fs.mkdirSync('out/acceptance', { recursive: true });
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 } });
  await ctx.addInitScript(() => { for (const k of ['sources', 'play', 'compare', 'gallery', 'fork', 'coord', 'build']) localStorage.setItem('yuku-tour-' + k, '1'); });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const click = async sel => { await p.click(sel, { timeout: 8000 }); await p.waitForTimeout(250); };
  await p.goto(BASE + '/'); await click('[data-act=continueStart]');
  await p.waitForSelector('[data-act=toFork1]:not([disabled])', { timeout: 150000 }); await click('[data-act=toFork1]'); await p.waitForTimeout(1800);
  await click('[data-act=pickSide][data-side=a]'); await click('[data-act=goSide]'); await p.waitForTimeout(4800);
  await click('[data-act=pickSide][data-side=b]'); await click('[data-act=goSide]'); await p.waitForTimeout(4800);
  await click('[data-act=pickSide][data-side=a]'); await click('[data-act=goSide]'); await p.waitForTimeout(2900);
  await click('[data-act=toCoord]'); await click('[data-act=decideCoord]'); await p.waitForTimeout(4200);
  // ここから、担当者の返事の分類を「値下げの要求」に差し替える
  await p.route('**/api/ai/rep', async route => { const r = await route.fetch(); const j = await r.json(); j.data.pressure = 'discount'; route.fulfill({ response: r, json: j }); });
  const before = await p.evaluate(() => ({ player: YUKU.state.player.bits.join(''), co: YUKU.state.player.company, unbuilt: YUKU.state.others.filter(w => w.unbuilt).length }));
  const lines = [];
  for (let i = 0; i < 4; i++) {
    await p.fill('#say', 'もっと値引きしてください。'); await click('[data-act=sendElectric]');
    await p.waitForFunction(() => !document.querySelector('.msg.typing'), null, { timeout: 30000 }); await p.waitForTimeout(400);
    lines.push(await p.evaluate(() => [...YUKU.state.chat].reverse().find(m => m.who === 'staff')?.text));
    if (i === 3) { await p.waitForTimeout(1700); await p.screenshot({ path: 'out/acceptance/WS-narration.png' }); }
  }
  await p.waitForTimeout(4500);
  const after = await p.evaluate(() => ({ player: YUKU.state.player.bits.join(''), co: YUKU.state.player.company, unbuilt: YUKU.state.others.filter(w => w.unbuilt).length, n: 1 + YUKU.state.others.length, switched: YUKU.state.switched }));
  await p.screenshot({ path: 'out/acceptance/WS-after.png' });
  console.log('担当者の言葉:', JSON.stringify(lines, null, 0));
  console.log('前:', JSON.stringify(before), '後:', JSON.stringify(after));
  // そのまま最後まで（レポートまで遊べるか）
  await p.unroute('**/api/ai/rep');
  await click('[data-act=elecOk]'); await click('[data-act=toBuild]'); await click('[data-act=startBuild]');
  await p.waitForFunction(() => YUKU.state.scene === 'handover', null, { timeout: 20000 }); await p.waitForTimeout(4200);
  await click('[data-act=toSeasons]'); await p.waitForFunction(() => YUKU.state.scene === 'result', null, { timeout: 8000 });
  await click('[data-act=toYear]'); await p.waitForTimeout(1200); await p.screenshot({ path: 'out/acceptance/WS-year.png' });
  await click('[data-act=toReport]'); await p.waitForSelector('.rep', { timeout: 60000 }); await click('[data-act=rtab][data-k=worlds]'); await p.waitForTimeout(500); await p.screenshot({ path: 'out/acceptance/WS-report-worlds.png' });
  console.log(errs.length ? errs.join('\n') : 'エラーなし'); await b.close();
})();
