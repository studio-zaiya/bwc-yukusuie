// 通しアニマティックの書き出し（試作）。node capture.cjs <出力フォルダ>
// 各場面を 12fps の連番JPEGにする。render(t) のある試作は時刻で、アプリは実時間で撮る。
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const OUT = process.argv[2] || path.join(__dirname, 'frames');
const ONLY = process.argv[3] ? process.argv[3].split(',') : null;
const FPS = 12;
const THREE = path.join(process.env.THREE_DIR || '/home/claude/proto/hero16/_vendor/node_modules/three');
const P = rel => 'file://' + path.join(ROOT, rel);

// 時刻 → 試作の時刻
const span = (a, b) => (t, d) => a + (b - a) * (t / d);
const SEG = [
  { id: '01_hero', label: '冒頭：H2＋名乗り＋題名', url: P('prototypes/hero-v2/H2-continuity/hero.html?t=0'), dur: 10, map: t => t < 7.5 ? t : 21.6 + (t - 7.5) * 1.0,
    cap: [[0.6, 3.6, '地方工務店で、住宅の設計をしています。'], [3.8, 7.2, '初めて家を建てる人のための、ゲームを作りました。']] },
  { id: '02_intro', label: '課題：前振りC（44秒を20秒に圧縮）', url: P('prototypes/intro/C-line/intro.html?t=0'), dur: 20, map: (t, d) => t * 44 / d },
  { id: '03_lot', label: '実機：区画の当選', url: P('app/index.html?s=2'), dur: 4, live: [],
    cap: [[0.3, 3.9, 'ふたりの家族で、遊びはじめます。']] },
  { id: '04_wish', label: '実機：要望 → 付箋 → ぶつかり', url: P('app/index.html?s=3'), dur: 15, live: [...Array(8)].map((_, k) => [0.8 + k * 1.5, p => p.click('#wishGo')]),
    cap: [[0.5, 7.5, 'ふたりの要望を話すと、Claudeが付箋にします。'], [7.7, 14.5, 'ぶつかるところと、敷地に入らないことも見つけます。']] },
  { id: '05_meet', label: '実機：4社の担当者と打ち合わせ', url: P('app/index.html?s=4'), dur: 14, live: [[3, p => p.click('[data-co=B]')], [5.5, p => p.click('[data-co=C]')], [8, p => p.click('[data-co=D]')], [10.5, p => p.click('[data-co=C]')], [11.5, p => p.click('#askGo')]],
    cap: [[0.5, 6, '4つの型の住宅会社。どこも、本物の魅力があります。'], [6.2, 13.5, '担当者には、自由に質問できます。']] },
  { id: '06_ledger', label: '実機：見積と台帳（3層）', url: P('app/index.html?s=5'), dur: 8, live: [[5, p => p.click('[data-l="2"]')]],
    cap: [[0.5, 4.8, '見積の表紙は、会社ごとの見せ方で変わります。'], [5, 7.8, '数字は、すべて計算エンジンが出します。']] },
  { id: '07_fork', label: '実機：分かれ道3（隣の世界のSNS）', url: P('app/index.html?s=6'), dur: 11, live: [],
    cap: [[0.5, 5, '分かれ道。隣の世界の投稿が、ふと目に入る。'], [5.2, 10.5, 'どちらにするか、ふたりで考える。']] },
  { id: '08_free', label: '実機：自由回答の取引と検算', url: P('app/index.html?s=7'), dur: 14, live: [[8.6, p => p.click('#ok')]],
    cap: [[0.5, 8, 'Claudeが答えを読み替え、エンジンで検算してから受け止めます。'], [9, 13.5, '条件を確かめて、決める。']] },
  { id: '09_agents', label: '実機：16の担当者が同時に考える', url: P('app/index.html?s=8'), dur: 8, live: [],
    cap: [[0.5, 7.5, '選ばなかった道も消えない。16の世界が、同時に進む。']] },
  { id: '10_build', label: '実機：早送り（着工〜引き渡し）', url: P('app/index.html?s=9'), dur: 6, live: [] },
  { id: '11_year', label: '1年後の16区画', url: P('app/index.html?s=10'), dur: 12, live: [[4, p => p.click('#rewind')], [8, p => p.evaluate(() => document.querySelector('.lot[data-no="13"]').dispatchEvent(new MouseEvent('click', { bubbles: true })))]],
    cap: [[0.5, 4, '1年後。16の、わが家を見比べる。'], [4.2, 11.5, '選ばなかった世界の1年も、再生できます。']] },
  { id: '12_w4', label: '完成の瞬間（W4）', url: P('prototypes/completion/W4-paper/completion.html?t=0'), dur: 8, map: t => t },
  { id: '13_honne', label: '担当者の、それぞれの事情', url: P('app/index.html?s=11'), dur: 10, live: [],
    cap: [[0.5, 9.5, '担当者にも、それぞれの事情があった。']] },
  { id: '14_arch', label: '仕組み（arch C・17番目なし）', url: P('prototypes/arch/C-exploded/arch.html?t=0'), dur: 12.5, map: t => t },
  { id: '15_devlog', label: 'Claude Codeの開発記録（仮のカード）', url: P('video/devlog-card.html'), dur: 7.5, map: t => t },
  { id: '16_handoff', label: 'E6：レポートを手渡す（実写の代わり）', url: P('prototypes/ending/E6-handoff/ending.html?t=0'), dur: 10, map: t => t * 1.35 },
  { id: '17_e3', label: '締め：E3（題名と注記）', url: P('prototypes/ending/E3-morning/ending.html?t=0'), dur: 10, map: t => 10 + t },
];

const CAPCSS = 'position:fixed;left:0;right:0;bottom:56px;text-align:center;z-index:2147483647;pointer-events:none';
const capHTML = s => s ? `<span style="display:inline-block;background:rgba(30,43,54,.84);color:#fff;font:700 34px 'Hiragino Sans','BIZ UDPGothic','Noto Sans CJK JP',sans-serif;padding:10px 28px;border-radius:12px;letter-spacing:.02em">${s}</span>` : '';

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, locale: 'ja-JP' });
  await ctx.route(/cdn\.jsdelivr\.net\/npm\/three@0\.160\.0\/(.*)/, (route, req) => {
    const rel = req.url().split('three@0.160.0/')[1];
    route.fulfill({ path: path.join(THREE, rel), contentType: 'application/javascript' });
  });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const manifest = [];
  let n = 0;
  for (const s of SEG) {
    if (ONLY && !ONLY.includes(s.id)) { n += Math.round(s.dur * FPS); continue; }
    const p = await ctx.newPage();
    p.on('pageerror', e => console.error(s.id, e.message));
    await p.goto(s.url);
    await p.waitForFunction(() => window.READY || document.querySelector('#stage .scr.on'), null, { timeout: 15000 }).catch(() => {});
    await p.addStyleTag({ content: '#ctl,#bar,#states{display:none!important}#wrap{inset:0!important}.nav{opacity:0!important}.dots{display:none!important}' });
    await p.evaluate(css => { const d = document.createElement('div'); d.id = '__cap'; d.style.cssText = css; document.body.appendChild(d); dispatchEvent(new Event('resize')); const st = document.getElementById('stage'); if (st && !st.querySelector('.scr') && /scale\(/.test(st.style.transform)) st.style.transform = st.style.transform.replace(/scale\([^)]*\)/, 'scale(1)'); }, CAPCSS);
    await p.waitForTimeout(400);
    const frames = Math.round(s.dur * FPS);
    const setCap = async t => { const c = (s.cap || []).find(([a, z]) => t >= a && t < z); const txt = c ? c[2] : ''; if (txt !== setCap.last) { await p.evaluate(h => { document.getElementById('__cap').innerHTML = h; }, capHTML(txt)); setCap.last = txt; } };
    const file = k => path.join(OUT, `f${String(n + k).padStart(5, '0')}.jpg`);
    if (s.map) {
      for (let k = 0; k < frames; k++) { const t = k / FPS; await p.evaluate(v => { for (const id of ['sl', 'seek', 'scrub', 'sc']) { const el = document.getElementById(id); if (el && el.tagName === 'INPUT') { el.step = 'any'; el.max = Math.max(+el.max || 0, v + 1); el.value = v; el.dispatchEvent(new Event('input')); } } if (window.seekTo) window.seekTo(v); window.render(v); return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); }, s.map(t, s.dur)); await setCap(t); await p.screenshot({ path: file(k), type: 'jpeg', quality: 88 }); }
    } else {
      // 実時間で撮り、撮れなかったコマは直前の絵で埋める
      const acts = (s.live || []).slice(); const t0 = Date.now(); let written = 0;
      while (written < frames) {
        const t = (Date.now() - t0) / 1000;
        while (acts.length && acts[0][0] <= t) { await acts.shift()[1](p).catch(e => console.error(s.id, e.message)); }
        await setCap(t);
        const buf = await p.screenshot({ type: 'jpeg', quality: 88 });
        const slot = Math.min(frames, Math.floor(((Date.now() - t0) / 1000) * FPS) + 1);
        do { fs.writeFileSync(file(written), buf); written++; } while (written < slot);
      }
    }
    n += frames;
    manifest.push({ id: s.id, label: s.label, start: +(manifest.reduce((a, m) => a + m.dur, 0)).toFixed(2), dur: s.dur });
    console.log(s.id, 'done', frames);
    await p.close();
  }
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ fps: FPS, segments: SEG.map((s, i) => ({ id: s.id, label: s.label, dur: s.dur, cap: s.cap || [] })) }, null, 1));
  await b.close();
})();
