const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  p.on('pageerror', e => console.error('ERR', e.message));
  const ids = (process.argv[2] || 'L1,L2,L3,L4').split(',');
  for (const id of ids) for (const [suf, ph] of [['a', 3.4], ['b', 8.4]]) {
    await p.goto(`file:///home/claude/yukusuie/design/v2/layout/${id}/index.html?rec&p=${ph}`);
    await p.waitForTimeout(500);
    await p.screenshot({ path: `/home/claude/yukusuie/design/v2/stills/${id}-${suf}.png` });
  }
  await b.close();
})();
