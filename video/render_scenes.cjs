// 動画のかけらを書き出す（render(t) の決定論的なページを、連番 → mp4）
// 使い方：node video/render_scenes.cjs <出力フォルダ> [id,id,...]
// 環境変数：THREE_DIR（three@0.160.0 のフォルダ）、FONT_DIR（@fontsource のフォルダ。なければGoogle Fontsのまま）
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'out', 'video_parts'));
const ONLY = process.argv[3] ? process.argv[3].split(',') : null;
const FPS = +(process.env.FPS || 24);
const THREE = process.env.THREE_DIR || path.join(ROOT, 'node_modules', 'three');
const FONT_DIR = process.env.FONT_DIR || '';
const P = rel => 'file://' + path.join(ROOT, 'video', 'scenes', rel);

const SCENES = [
  { id: 'training-log', url: P('training-log.html?t=0'), dur: 6 },
  { id: 'skills', url: P('skills.html?t=0'), dur: 6 },
  { id: 'opening', url: P('opening.html?t=0'), dur: 4 },
  { id: 'closing', url: P('opening.html?t=0&mode=light&dur=3'), dur: 3 },
  { id: 'ending-EA-notitle', url: P('ending-EA.html?t=0&notitle=1'), dur: 13 },
  { id: 'intro-c', url: P('intro-c.html?t=0'), dur: 35.3 },
  { id: 'title-card', url: P('title-card.html'), dur: 5 },
  { id: 'hero', url: P('hero.html?t=0'), dur: 12 },
  { id: 'hero-title', url: P('hero-title.html?t=0'), dur: 12 },
  { id: 'arch', url: P('arch.html?t=0'), dur: 12.5 },
  { id: 'ending-EA', url: P('ending-EA.html?t=0'), dur: 13 },
  { id: 'credits', url: P('credits.html?t=0'), dur: 5 },
  // 動画担当が足した場面（11/5の上書きのあとに戻した）
  { id: 'handover', url: P('handover.html?t=0'), dur: 8 },
  { id: 'training', url: P('training.html?t=0'), dur: 6 },
  { id: 'report-pages', url: P('report-pages.html?t=0&dur=12'), dur: 12 },
  { id: 'photo-handover', url: P('photo-sub.html?kind=handover&t=0'), dur: 8 },
  // 実際に走らせた点検の結果（video/checks/run_checks.py の出力）
  { id: 'check-audit', url: P('check-table.html?t=0&kind=audit&dur=2.8'), dur: 2.8 },
  { id: 'check-consistency', url: P('check-table.html?t=0&kind=consistency&dur=6.3'), dur: 6.3 },
  { id: 'intro-v2', url: P('intro-v2.html?t=0'), dur: 55.5 },
  // 舞台裏（NARRATION_v2）
  { id: 'bs-title', url: P('backstage.html?t=0&kind=title&dur=2.5'), dur: 2.5 },
  { id: 'bs-desk', url: P('backstage.html?t=0&kind=desk&dur=4.5'), dur: 4.5 },
  { id: 'bs-phone', url: P('backstage.html?t=0&kind=phone&dur=4.5'), dur: 4.5 },
  { id: 'bs-models', url: P('backstage.html?t=0&kind=models&dur=2.5'), dur: 2.5 },
  { id: 'bs-numbers', url: P('backstage.html?t=0&kind=numbers&dur=3'), dur: 3 },
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, locale: 'ja-JP' });
  await ctx.route(/cdn\.jsdelivr\.net\/npm\/three@0\.160\.0\/(.*)/, (route, req) => route.fulfill({ path: path.join(THREE, req.url().split('three@0.160.0/')[1]), contentType: 'application/javascript' }));
  if (FONT_DIR) await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  // 正式のクレジット（コミットしない手元のファイル）を、file:// でも読めるようにページへ渡す
  const LOCAL = path.join(ROOT, 'video', 'scenes', 'credits.local.json');
  if (fs.existsSync(LOCAL)) await ctx.addInitScript(j => { window.CREDITS_LOCAL = j; }, JSON.parse(fs.readFileSync(LOCAL, 'utf8')));
  for (const s of SCENES) {
    if (ONLY && !ONLY.includes(s.id)) continue;
    const dir = path.join(OUT, '_frames_' + s.id); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    const p = await ctx.newPage();
    p.on('pageerror', e => console.error(s.id, e.message));
    await p.goto(s.url);
    if (FONT_DIR) {
      const css = ['zen-maru-gothic/500.css', 'zen-maru-gothic/700.css', 'zen-maru-gothic/900.css', 'biz-udpgothic/400.css', 'biz-udpgothic/700.css']
        .map(f => `@import url("file://${path.join(FONT_DIR, f)}");`).join('\n');
      await p.addStyleTag({ content: css });
    }
    await p.addStyleTag({ content: '#ctl,#bar,#states{display:none!important}#wrap{inset:0!important}' });
    await p.waitForFunction(() => window.READY && window.render, null, { timeout: 20000 }).catch(() => {});
    await p.evaluate(() => document.fonts && document.fonts.ready);
    await p.evaluate(() => { dispatchEvent(new Event('resize')); const st = document.getElementById('stage'); if (st && /scale\(/.test(st.style.transform)) st.style.transform = st.style.transform.replace(/scale\([^)]*\)/, 'scale(1)'); });
    await p.waitForTimeout(500);
    const n = Math.round(s.dur * FPS);
    for (let k = 0; k < n; k++) {
      const t = k / FPS;
      await p.evaluate(v => { for (const id of ['sl', 'seek', 'scrub', 'sc']) { const el = document.getElementById(id); if (el && el.tagName === 'INPUT') { el.step = 'any'; el.max = Math.max(+el.max || 0, v + 1); el.value = v; el.dispatchEvent(new Event('input')); } } if (window.seekTo) window.seekTo(v); window.render(v); return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); }, t);
      await p.screenshot({ path: path.join(dir, `f${String(k).padStart(5, '0')}.png`) });
    }
    await p.close();
    const mp4 = path.join(OUT, s.id + '.mp4');
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(dir, 'f%05d.png'), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4]);
    // 確認用の静止画（最初・中ほど・最後）
    for (const [tag, k] of [['a', 0], ['b', Math.floor(n / 2)], ['c', n - 1]]) fs.copyFileSync(path.join(dir, `f${String(k).padStart(5, '0')}.png`), path.join(OUT, `${s.id}-${tag}.png`));
    fs.rmSync(dir, { recursive: true, force: true });
    console.log('done', s.id, n);
  }
  await b.close();
})();
