// 通しの自動プレイ（Playwright）。各場面のスクショを out/shots/ に保存し、コンソールのエラーを出す
// 使い方：node scripts/playthrough.cjs [URL]
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = process.argv[2] || 'http://localhost:8787';
const OUT = process.env.OUT || 'out/shots';
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  let n = 0;
  const shot = async name => { await p.waitForTimeout(300); await p.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.png` }); };
  const click = async sel => { await p.click(sel, { timeout: 5000 }); await p.waitForTimeout(250); };
  const say = async (text, act) => { await p.fill('#say', text); await click(`button[data-act="${act}"]`); await p.waitForFunction(() => !document.querySelector('.msg.typing'), null, { timeout: 60000 }); await p.waitForTimeout(300); };
  try {
  await p.goto(BASE + '/'); await shot('start');
  await click('[data-act=start]'); await shot('family');
  await click('[data-act=household][data-id=t2]'); await click('[data-act=toEntry]');
  await p.fill('#entryText', '外観はシンプルでかっこよく。冬でも暖かい家がいい。'); await shot('entry');
  await click('[data-act=toLot]'); await click('[data-act=firstCo][data-co=C]'); await shot('lot');
  await click('[data-act=toSurvey]'); await p.fill('#sv_yuu', 'キッチンは家族の顔が見えるように'); await shot('survey');
  await click('[data-act=submitSurvey]');
  await say('外観はミニマルに。箱っぽい家が好きです。', 'send');
  await click('[data-act=who][data-w=yuu]');
  await say('キッチンは造作にしたい。テレビは壁掛けがいいな。', 'send'); await shot('hearing');
  await click('[data-act=toForgot]');
  await say('寝室にもLANがほしいです。', 'sendForgot'); await shot('forgot');
  await click('[data-act=toPlans]'); await click('[data-act=pickCo][data-co=A]'); await shot('plans');
  await click('[data-act=toFork1]'); await shot('fork1');
  await click('[data-act=fork][data-side=a]'); await shot('fork2');
  await click('[data-act=openPop][data-pop=sns]'); await shot('sns'); await click('.close');
  await click('[data-act=fork][data-side=b]'); await shot('fork3');
  await say('借入を少し増やして、南の大きな窓だけトリプルガラスにしたい', 'freeAnswer'); await shot('fork3-trade');
  await click('[data-act=approve]'); await shot('contract');
  await click('[data-act=toFork4]'); await shot('fork4');
  await click('[data-act=fork][data-side=b]'); await shot('coord');
  await click('[data-act=toElectric]');
  await say('テレビは壁掛けにしたいと伝えていたはずです', 'sendElectric'); await shot('electric');
  await click('[data-act=toBuild]'); await click('[data-act=buildNext]'); await shot('build');
  await click('[data-act=buildNext]'); await click('[data-act=buildNext]'); await click('[data-act=toHandover]'); await shot('handover');
  await click('[data-act=toYear]'); await p.waitForTimeout(800); await shot('year');
  await p.mouse.click(222, 560); await p.waitForTimeout(300); console.log('区画を押した →', await p.evaluate(() => YUKU.state.lot)); await shot('year-lot');
  await click('[data-act=openPop][data-pop=world]'); await p.waitForTimeout(4500); await shot('moshi'); await click('.close');
  await click('[data-act=toHonne]'); await shot('honne');
  await click('[data-act=toReport]'); await p.waitForSelector('.rep', { timeout: 60000 }); await p.waitForTimeout(1200); await shot('report');
  const [pr] = await Promise.all([p.context().waitForEvent('page'), p.click('[data-act=print]')]);
  await pr.waitForFunction(() => window.READY, null, { timeout: 10000 }); await pr.pdf({ path: `${OUT}/report.pdf`, format: 'A4', printBackground: true });
  await pr.setViewportSize({ width: 900, height: 1300 }); await pr.screenshot({ path: `${OUT}/report-print.png`, fullPage: true });
  const st = await p.evaluate(() => ({ others: YUKU.state.others.length, labels: YUKU.state.player.labels, saved: YUKU.state.savedId, events: YUKU.LOG.length }));
  console.log(JSON.stringify(st));
  } catch (e) { console.log('止まった：', e.message.split('\n')[0]); }
  console.log(errs.length ? errs.join('\n') : 'エラーなし');
  await b.close();
})();
