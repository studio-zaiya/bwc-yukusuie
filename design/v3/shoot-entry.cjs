// 入口とレポートv2の静止画とPDF
const { chromium } = require('playwright');
const path = require('path');
const D = path.join(__dirname, 'entry-report'), S = path.join(__dirname, 'stills');
(async () => {
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ locale: 'ja-JP' });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.setViewportSize({ width: 1920, height: 1080 });
  for (const [f, o] of [['entry.html', 'entry.png'], ['report-screen.html', 'report-screen.png']]) {
    await p.goto('file://' + path.join(D, f)); await p.waitForTimeout(500);
    await p.screenshot({ path: path.join(S, o) });
  }
  // A4：幅1240px相当（210mm）で1ページずつ
  await p.setViewportSize({ width: 1240, height: 1800 });
  await p.goto('file://' + path.join(D, 'report.html')); await p.waitForTimeout(500);
  await p.addStyleTag({ content: 'html{background:#DDD5C6}.page{margin:0 auto 20px}' });
  const pages = await p.$$('.page');
  for (let i = 0; i < pages.length; i++) await pages[i].screenshot({ path: path.join(S, `report-p${i + 1}.png`) });
  await p.pdf({ path: path.join(D, 'report.pdf'), format: 'A4', printBackground: true });
  // はみ出しの確認：ページ内の要素が下端の注記に重ならないか
  const over = await p.evaluate(() => [...document.querySelectorAll('.page')].map((pg, i) => {
    const foot = pg.querySelector('.foot').getBoundingClientRect().top; let max = 0;
    pg.querySelectorAll(':scope > *:not(.foot):not(.pno)').forEach(e => { max = Math.max(max, e.getBoundingClientRect().bottom); });
    return `p${i + 1}: 内容の下端 ${Math.round(max)} / 注記の上端 ${Math.round(foot)}`;
  }));
  console.log(over.join('\n')); console.log(errs.length ? errs.join('\n') : 'no page errors');
  await b.close();
})();
