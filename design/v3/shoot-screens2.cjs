// 後半の画面（S6〜S10）の静止画を撮る。node design/v3/shoot-screens2.cjs
const { chromium } = require('playwright');
const path = require('path');
const BASE = 'file://' + path.join(__dirname, 'screens');
const OUT = path.join(__dirname, 'stills');
const SHOTS = [
  ['S6-build/index.html?rec&t=3', 'S6-build-a.png'],
  ['S6-build/index.html?rec&t=9.5', 'S6-build-b.png'],
  ['S7-handover/index.html?rec', 'S7-handover.png', 2500],
  ['S8-year/index.html?rec&lot=5', 'S8-year.png'],
  ['S9-honne/index.html?rec', 'S9-honne.png'],
  ['S10-report-entry/index.html?rec', 'S10-report.png'],
];
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, locale: 'ja-JP' });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const errs = [];
  for (const [u, f, wait] of SHOTS) {
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(`${f}: ${e.message}`));
    await p.goto(`${BASE}/${u}`);
    await p.waitForTimeout(wait || 700);
    // はみ出しの簡易確認：文字を持つ要素が舞台（1920×1080）の外に出ていないか
    const over = await p.evaluate(() => [...document.querySelectorAll('#view *')].filter(el => {
      if (!el.childNodes.length || ![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) return false;
      const r = el.getBoundingClientRect(); return r.width && (r.right > 1921 || r.bottom > 1081 || r.left < -1 || el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflow === 'visible' && el.clientWidth > 0 && getComputedStyle(el).whiteSpace === 'nowrap');
    }).slice(0, 6).map(el => el.className + ':' + el.textContent.trim().slice(0, 20)));
    if (over.length) errs.push(`${f} overflow: ${over.join(' | ')}`);
    await p.screenshot({ path: path.join(OUT, f) });
    await p.close();
  }
  console.log(errs.join('\n') || 'no errors');
  await b.close();
})();
