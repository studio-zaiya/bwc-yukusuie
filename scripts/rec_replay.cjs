// 本番の記録を、再生モードで録画する（動画の実機の場面用。ブラウザの枠・カーソル・アカウントは写らない）
// 使い方：node scripts/rec_replay.cjs <記録ID> [速さ=1] [出力名=demo] [公開先]
//   → out/rec_<記録ID>/<出力名>.webm。mp4 と、貼りやすい大きさの分割は ffmpeg で：
//   ffmpeg -i demo.webm -c:v libx264 -crf 18 -pix_fmt yuv420p -r 30 -movflags +faststart demo.mp4
//   ffmpeg -ss 0 -t 150 -i demo.mp4 -c:v libx264 -crf 20 -pix_fmt yuv420p -movflags +faststart demo_part1.mp4
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const [id, speed = '1', name = 'demo', base = 'https://yukusuie.zaiya.workers.dev'] = process.argv.slice(2);
  if (!id) { console.log('使い方：node scripts/rec_replay.cjs <記録ID> [速さ] [出力名] [公開先]'); process.exit(1); }
  const dir = path.join('out', 'rec_' + id), tmp = path.join(dir, 'tmp_' + name);
  fs.mkdirSync(tmp, { recursive: true });
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, recordVideo: { dir: tmp, size: { width: 1920, height: 1080 } } });
  const p = await ctx.newPage(); const t0 = Date.now();
  // 場面が切り替わった時刻（録画の頭からの秒）を <出力名>.scenes.txt に書き出す。場面ごとに切り出すときに使う
  const scenes = []; let last = null;
  const watch = setInterval(async () => { try { const sc = await p.evaluate(() => window.YUKU && YUKU.state.scene); if (sc && sc !== last) { last = sc; scenes.push(`${((Date.now() - t0) / 1000).toFixed(1)}\t${sc}`); } } catch { } }, 200);
  // rec=1：再生中の帯と操作の案内を隠す。speed：出来事の間だけを伸び縮みさせる（演出の動きは実時間）
  await p.goto(`${base}/?replay=${id}&rec=1&speed=${speed}`);
  await p.waitForFunction(() => window.YUKU && YUKU.state.scene === 'report' && YUKU.state.report, null, { timeout: 1800000, polling: 1000 });
  await p.waitForFunction(() => !document.querySelector('.replaybar'), null, { timeout: 600000, polling: 1000 });
  await p.waitForTimeout(4000);
  clearInterval(watch); fs.writeFileSync(path.join(dir, name + '.scenes.txt'), scenes.join('\n') + '\n');
  const v = p.video(); await ctx.close(); fs.renameSync(await v.path(), path.join(dir, name + '.webm'));
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('録画しました', path.join(dir, name + '.webm'), ((Date.now() - t0) / 1000).toFixed(0) + '秒');
  await b.close();
})();
