const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.route(/fonts\.(googleapis|gstatic)/, r => r.abort());
  const base = 'file:///home/claude/yukusuie/design/v3/play/index.html';
  const shots = [['play-normal', 'v=normal&p=3.4'], ['play-ai', 'v=ai&p=3.4'], ['play-ai-sketch', 'v=ai-sketch&p=3.4'], ['play-sns', 'v=sns&p=3.4'], ['play-later', 'v=normal&p=8.4']];
  for (const [n, q] of shots) { await pg.goto(`${base}?rec&${q}`); await pg.waitForTimeout(500); await pg.screenshot({ path: `/home/claude/yukusuie/design/v3/stills/${n}.png` }); }
  // 操作の確認：ボタンでポップアップが開き、閉じると戻る
  await pg.goto(base + '?p=3.4'); await pg.click('[data-open="ai"]'); const a = await pg.$('.pop'); await pg.click('[data-close]'); const c = await pg.$('.pop');
  console.log('open', !!a, 'closed', !c, errs.join('|') || 'no errors');
  await b.close();
})();
