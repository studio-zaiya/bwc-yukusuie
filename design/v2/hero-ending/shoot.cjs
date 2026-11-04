// node shoot.cjs <html> <outprefix> t1,t2,...
const { chromium } = require('playwright'); const path = require('path');
const THREE = '/home/claude/proto/hero16/_vendor/node_modules/three';
(async () => {
  const [file, pre, ts] = process.argv.slice(2);
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await ctx.route(/cdn\.jsdelivr\.net\/npm\/three@0\.160\.0\/(.*)/, (r, q) => r.fulfill({ path: path.join(THREE, q.url().split('three@0.160.0/')[1]), contentType: 'application/javascript' }));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await p.goto('file://' + path.resolve(file) + '?t=0');
  await p.waitForFunction(() => window.READY, null, { timeout: 30000 });
  await p.addStyleTag({ content: '#ctl{display:none!important}' });
  await p.evaluate(() => { const s = document.getElementById('stage'); if (s) s.style.transform = 'none'; });
  for (const t of ts.split(',').map(Number)) {
    await p.evaluate(v => window.render(v), t); await p.waitForTimeout(150);
    await p.screenshot({ path: `${pre}_${String(t).replace('.', '_')}.png` });
  }
  console.log(errs.join('\n') || 'no errors'); await b.close();
})();
