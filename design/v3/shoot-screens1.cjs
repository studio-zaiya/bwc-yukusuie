const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const base = 'file://' + path.join(__dirname, 'screens');
  const out = path.join(__dirname, 'stills');
  const list = [['S1-start', '', 'S1-start'], ['S2-family', '', 'S2-family'], ['S3-lot', '', 'S3-lot'], ['S4-fork', '?v=ask', 'S4-fork-ask'], ['S4-fork', '?v=done', 'S4-fork-done'], ['S5-contract', '', 'S5-contract']];
  for (const [d, q, n] of list) {
    await p.goto(`${base}/${d}/index.html${q}`); await p.waitForFunction(() => window.READY, null, { timeout: 8000 }); await p.waitForTimeout(300);
    await p.screenshot({ path: path.join(out, n + '.png') });
  }
  console.log(errs.join('\n') || 'no errors'); await b.close();
})();
