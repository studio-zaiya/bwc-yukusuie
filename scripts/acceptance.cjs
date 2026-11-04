// 受け入れ基準の確認用：審査員の道（タイトル →「続きから遊ぶ」→ 分岐点 → 電気 → 引渡し → 1年後 → レポート）を通し、
// 画面ごとのスクショを out/acceptance/ に保存する。使い方：node scripts/acceptance.cjs [URL]
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = process.argv[2] || 'http://localhost:8787';
const OUT = 'out/acceptance';
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 } });
  await ctx.addInitScript(() => { for (const k of ['sources', 'play', 'compare', 'gallery', 'fork', 'coord', 'build']) localStorage.setItem('yuku-tour-' + k, '1'); });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  const shot = async name => { await p.waitForTimeout(300); await p.screenshot({ path: `${OUT}/${name}.png` }); };
  const click = async sel => { await p.click(sel, { timeout: 8000 }); await p.waitForTimeout(250); };
  const idle = () => p.waitForFunction(() => !document.querySelector('.msg.typing'), null, { timeout: 120000 });
  try {
    await p.goto(BASE + '/'); await shot('S0-title');
    await click('[data-act=continueStart]'); await p.waitForTimeout(400); await shot('S4-fork1-intro'); await p.waitForTimeout(1500); await shot('S4-fork1');
    await click('[data-act=pickSide][data-side=a]'); await shot('S4-fork1-why');
    await p.fill('#say', '話を最初にじっくり聞いてくれたから'); await click('[data-act=decideWhy]'); await p.waitForTimeout(500); await shot('S4-fork1-band');
    await p.waitForSelector('[data-act=planConfirm]:not([disabled])', { timeout: 120000 }); await p.waitForTimeout(500); await shot('S5-plan');
    await click('[data-act=planConfirm]'); await p.waitForTimeout(1800); await shot('S4-fork2');
    await click('[data-act=pickSide][data-side=b]'); await shot('S4-fork2-why'); await click('[data-act=decideNoWhy]'); await p.waitForTimeout(400); await shot('S4-fork2-band');
    await p.waitForTimeout(1800); await shot('S4-fork3');
    await click('[data-act=pickSide][data-side=a]'); await click('[data-act=decideNoWhy]'); await p.waitForTimeout(1900); await shot('S5-contract');
    await click('[data-act=toCoord]'); await p.waitForTimeout(1600); await shot('S4-fork4'); await click('[data-act=pickSide][data-side=b]'); await click('[data-act=decideNoWhy]'); await p.waitForTimeout(1900); await click('[data-act=finish][data-k=color][data-v="1"]'); await shot('S4-fork4-coord');
    await click('[data-act=decideCoord]'); await p.waitForTimeout(600); await shot('P4b-electric');
    await p.fill('#say', 'リビングのエアコンは見えないようにしたいと伝えていたはずです'); await click('[data-act=sendElectric]'); await idle(); await p.waitForTimeout(500); await shot('P4b-electric-add');
    const m0 = await p.textContent('.moneyc .v'); await p.fill('#say', '間接照明をお願いしたい'); await click('[data-act=sendElectric]'); await p.waitForTimeout(1300); await shot('P4b-electric-count'); await p.waitForTimeout(1000); console.log('お金の札', m0, '→', await p.textContent('.moneyc .v'));
    await click('[data-act=toBuild]'); await click('[data-act=startBuild]'); await p.waitForTimeout(2000); await shot('S6-build');
    await p.waitForFunction(() => YUKU.state.scene === 'handover', null, { timeout: 20000 }); await p.waitForTimeout(400); await shot('S7-handover-fade'); await p.waitForTimeout(3800); await shot('S7-handover');
    await click('[data-act=toSeasons]'); await p.waitForTimeout(2200); await p.waitForFunction(() => YUKU.state.scene === 'result', null, { timeout: 8000 }); await p.waitForTimeout(5200); await shot('S8-result');
    await click('[data-act=toYear]'); await p.waitForTimeout(1200); await shot('S8-year');
    await click('[data-act=toTree]'); await p.waitForTimeout(2500); await shot('S8-tree');
    await click('[data-act=treeBack]');
    await click('[data-act=toReport]'); await p.waitForSelector('.rep', { timeout: 120000 }); await p.waitForTimeout(800); await shot('S9-report');
    console.log('saved', await p.evaluate(() => YUKU.state.savedId));
  } catch (e) { console.log('止まった：', e.message.split('\n')[0]); await p.screenshot({ path: `${OUT}/zz-stopped.png` }); }
  console.log(errs.length ? errs.join('\n') : 'エラーなし');
  await b.close();
})();
