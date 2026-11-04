const { chromium } = require('playwright'); const path = require('path');
(async () => { const ids = process.argv.slice(2); const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  p.on('pageerror', e => console.error('ERR', e.message)); await p.route(/fonts\.(googleapis|gstatic)/, r => r.abort());
  for (const id of ids) { await p.goto('file://' + path.join(__dirname, 'parts', id, 'index.html')); await p.waitForTimeout(500);
    await p.screenshot({ path: path.join(__dirname, 'stills', id + '.png') }); console.log('shot', id); }
  await b.close(); })();
