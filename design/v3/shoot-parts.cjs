const { chromium } = require('playwright');
const path = require('path');
const B = 'file://' + path.join(__dirname, 'parts');
const OUT = path.join(__dirname, 'stills');
const SHOTS = [
  ['P1-survey', '/P1-survey/index.html?co=A&fill&rec&focus'],
  ['P1-survey-C', '/P1-survey/index.html?co=C&rec'],
  ['P1-chat', '/P1-chat/index.html?co=A&rec&s=talk'],
  ['P1-chat-D', '/P1-chat/index.html?co=D&rec&s=smile'],
  ['P1-avatars', '/P1-avatars/index.html?rec'],
  ['P4a', '/P4a/index.html?rec&wall=galva&color=1&floor=oak'],
  ['P4b-ask', '/P4b/index.html?rec&v=ask'],
  ['P4b-reply', '/P4b/index.html?rec&v=reply'],
];
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  await p.route(/fonts\.(googleapis|gstatic)/, r => r.abort());
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  for (const [n, u] of SHOTS) { await p.goto(B + u); await p.waitForTimeout(500); await p.screenshot({ path: path.join(OUT, n + '.png') }); }
  console.log(errs.join('\n') || 'no errors'); await b.close();
})();
