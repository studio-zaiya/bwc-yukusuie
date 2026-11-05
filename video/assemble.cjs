// 通しの組み立て（プレファイナル）
//   場面表 video/edl.json → 仮の板の書き出し → ffmpeg で 0.3秒クロスフェード → 字幕の焼き込み → YouTube 向けの mp4
//   出力（out/prefinal/）：
//     yukusuie_prefinal.mp4        字幕を焼き込んだ版（H.264 High・1920x1080・24fps・無音のAAC）
//     yukusuie_prefinal_nosub.mp4  字幕なし（音を入れる編集アプリ用）
//     yukusuie_prefinal.srt        字幕（YouTube の字幕としても上げられる）
//     stills/NN-<id>.png           場面ごとのスクリーンショット（レビュー用パワーポイントの材料）
//   video/TIMELINE.md も書き直す。
// 使い方：node video/assemble.cjs   環境変数：FONT_DIR（@fontsource のフォルダ）、OUT（既定 out）、EDL（既定 video/edl.json）
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(process.env.OUT || path.join(ROOT, 'out'));
const EDL = JSON.parse(fs.readFileSync(process.env.EDL || path.join(__dirname, 'edl.json'), 'utf8'));
const PARTS = path.join(OUT, 'video_parts'), PLATES = path.join(OUT, 'plates'), PRE = path.join(OUT, 'prefinal');
const FONT_DIR = process.env.FONT_DIR || '';
const XF = EDL.xfade, FPS = EDL.fps, END = EDL.end;
const FONTS = FONT_DIR ? ['zen-maru-gothic/700.css', 'zen-maru-gothic/900.css', 'biz-udpgothic/400.css', 'biz-udpgothic/700.css'].map(f => `@import url("file://${path.join(FONT_DIR, f)}");`).join('\n') : '';

const fmt = t => { const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s.toFixed(1).padStart(4, '0')}`; };
const srtT = t => { const ms = Math.round(t * 1000); const h = Math.floor(ms / 3600000), m = Math.floor(ms % 3600000 / 60000), s = Math.floor(ms % 60000 / 1000); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`; };
const parseT = s => { const [h, m, r] = s.split(':'); const [sec, ms] = r.split(','); return +h * 3600 + +m * 60 + +sec + +ms / 1000; };
const readSrt = f => fs.readFileSync(f, 'utf8').trim().split(/\n\s*\n/).map(b => { const l = b.split('\n'); const [a, z] = l[1].split(' --> '); return { at: parseT(a), to: parseT(z), text: l.slice(2).join('\n') }; });

const plateHTML = s => `<!doctype html><meta charset=utf-8><style>${FONTS}
body{margin:0;width:1920px;height:1080px;background:#FFFAF0;color:#1E2B36;font-family:"Hiragino Sans","BIZ UDPGothic","Zen Maru Gothic",sans-serif;position:relative;overflow:hidden}
.f{position:absolute;inset:48px;border:4px dashed #1E2B36;border-radius:12px;opacity:.5}
.tag{position:absolute;left:96px;top:92px;font-size:34px;font-weight:700;letter-spacing:.2em;border:3px solid #1E2B36;padding:6px 22px;border-radius:8px}
.t{position:absolute;left:96px;right:96px;top:330px;font-size:80px;font-weight:700;line-height:1.3}
.n{position:absolute;left:96px;right:96px;top:600px;font-size:40px;line-height:1.6}
.k{position:absolute;left:96px;bottom:92px;font-size:36px;font-weight:700}
.d{position:absolute;right:96px;bottom:84px;font-size:110px;font-weight:700;color:#E8701F}
</style><div class=f></div><div class=tag>仮の板</div><div class=t>${s.label}</div><div class=n>${s.note || ''}</div>
<div class=k>通し ${fmt(s.at)} 〜 ${fmt(s.to)}</div><div class=d>${(s.to - s.at).toFixed(1)}秒</div>`;

// 字幕：枠の下の紙の帯（上22px＋枠929px の下、高さ129px）の中央に、墨の字（座布団なし）。全編で同じ位置・同じ大きさ
const FR = { x: 134, y: 22, w: 1652, h: 929 };
const subHTML = text => `<!doctype html><meta charset=utf-8><style>${FONTS}
html,body{margin:0;width:1920px;height:1080px;background:transparent}
.s{position:absolute;left:0;right:0;top:${FR.y + FR.h}px;height:${1080 - FR.y - FR.h}px;display:flex;align-items:center;justify-content:center;color:#1E2B36;
font-family:"Hiragino Sans","BIZ UDPGothic","Zen Maru Gothic",sans-serif;font-weight:700;font-size:44px;letter-spacing:.04em;text-align:center;white-space:pre-line}
</style><div class=s>${text}</div>`;
// 枠：紙色の地に、角丸の穴（透明）と薄い影。枠に入れる場面の上に重ねる
const maskHTML = `<!doctype html><meta charset=utf-8><style>html,body{margin:0;background:transparent}</style><canvas id=c width=1920 height=1080></canvas><script>
const c=document.getElementById('c').getContext('2d');const {x,y,w,h}=${JSON.stringify(FR)},r=14;
const rr=()=>{c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath()};
c.fillStyle='#FFFAF0';c.fillRect(0,0,1920,1080);
c.save();c.shadowColor='rgba(30,43,54,.20)';c.shadowBlur=28;c.shadowOffsetY=8;rr();c.fill();c.restore();
c.globalCompositeOperation='destination-out';rr();c.fill();c.globalCompositeOperation='source-over';
c.strokeStyle='rgba(30,43,54,.10)';c.lineWidth=1.5;rr();c.stroke();
<\/script>`;
// 寄り：0.6秒で寄って止める（smoothstep）。out があれば、その秒から0.6秒で引く
const zoomExpr = z => { const T = `(in/${24})`; const ss = a => `(clip((${T}-${a})/0.6,0,1)*clip((${T}-${a})/0.6,0,1)*(3-2*clip((${T}-${a})/0.6,0,1)))`;
  return `1+${z.scale - 1}*(${ss(z.at)}${z.out != null ? '-' + ss(z.out) : ''})`; };

(async () => {
  for (const d of [PLATES, PRE, path.join(PRE, 'stills'), path.join(PRE, '_subs')]) fs.mkdirSync(d, { recursive: true });
  // 場面の時刻：at は通しでの開始。長さは次の場面の開始まで＋クロスフェードの重なり
  const S = EDL.segments.map((s, i, a) => ({ ...s, to: i + 1 < a.length ? a[i + 1].at : END }));
  S.forEach((s, i) => { s.xfIn = s.xf || XF; });
  S.forEach((s, i) => { s.dur = +(s.to - s.at + (i + 1 < S.length ? S[i + 1].xfIn : 0)).toFixed(3); });
  const subs = readSrt(path.join(__dirname, EDL.subs));
  // 字幕の基準（最低1.8秒、文字数÷4秒）の確認
  const warn = [];
  subs.forEach((c, i) => { const need = Math.max(1.8, c.text.replace(/\s/g, '').length / 4); if (c.to - c.at < need - 1e-6) warn.push(`字幕${i + 1}「${c.text}」が ${(c.to - c.at).toFixed(2)}秒（基準 ${need.toFixed(2)}秒）`); });

  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  for (const s of S) {
    if (s.kind !== 'plate') continue;
    await pg.setContent(plateHTML(s)); await pg.evaluate(() => document.fonts.ready); await pg.waitForTimeout(150);
    const png = path.join(PLATES, s.id + '.png'); await pg.screenshot({ path: png });
    s.path = path.join(PLATES, s.id + '.mp4');
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-loop', '1', '-framerate', String(FPS), '-t', String(s.dur), '-i', png, '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', s.path]);
  }
  const maskPng = path.join(PRE, '_subs', 'frame.png');
  await pg.setContent(maskHTML); await pg.waitForTimeout(200); await pg.screenshot({ path: maskPng, omitBackground: true });
  const subPng = [];
  for (let i = 0; i < subs.length; i++) {
    await pg.setContent(subHTML(subs[i].text)); await pg.evaluate(() => document.fonts.ready); await pg.waitForTimeout(100);
    const f = path.join(PRE, '_subs', `s${String(i + 1).padStart(2, '0')}.png`); await pg.screenshot({ path: f, omitBackground: true }); subPng.push(f);
  }
  await b.close();

  // ffmpeg：場面をそろえる（枠に入れる場面は 0.86倍＋寄り＋枠の PNG）→ クロスフェードでつなぐ
  const args = ['-y', '-loglevel', 'error'], fc = [];
  S.forEach((s, i) => {
    const f = s.kind === 'plate' ? s.path : s.kind === 'rec' ? path.join(OUT, s.file) : path.join(PARTS, s.file);
    if (!fs.existsSync(f)) throw new Error('ない：' + f);
    const sp = s.speed || 1;
    if (s.in) args.push('-ss', String(s.in));
    args.push('-t', String((s.play || s.dur) * sp + 0.2), '-i', f);
  });
  // 枠の PNG は、枠に入れる場面ごとに長さを区切った別の入力にする（1つを分けると、あとの場面のコマがたまる）
  const maskIn = {}; let nIn = S.length;
  S.forEach((s, i) => { if (s.full) return; args.push('-loop', '1', '-framerate', String(FPS), '-t', String(s.dur + 0.5), '-i', maskPng); maskIn[i] = nIn++; });
  S.forEach((s, i) => {
    const sp = s.speed || 1;
    const crop = s.crop ? `crop=${s.crop.join(':')},` : '';
    const play = s.play ? `trim=duration=${s.play},setpts=PTS-STARTPTS,` : '';
    let v = `[${i}:v]setpts=(PTS-STARTPTS)/${sp},${crop}fps=${FPS},${play}scale=1920:1080:force_original_aspect_ratio=decrease:flags=lanczos,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0xFFFAF0,setsar=1,tpad=stop_mode=clone:stop_duration=${Math.ceil(s.dur) + 2}`;
    if (s.full) { fc.push(`${v},format=yuv420p,trim=duration=${s.dur},setpts=PTS-STARTPTS[v${i}]`); return; }
    if (s.zoom) { const z = s.zoom; v += `,zoompan=z='${zoomExpr(z)}':x='(iw-iw/zoom)*${z.cx}':y='(ih-ih/zoom)*${z.cy}':d=1:s=${FR.w}x${FR.h}:fps=${FPS}`; }
    else v += `,scale=${FR.w}:${FR.h}:flags=lanczos`;
    v += `,setsar=1,pad=1920:1080:${FR.x}:${FR.y}:color=0xFFFAF0,format=rgba[p${i}];[p${i}][${maskIn[i]}:v]overlay=0:0:shortest=1,format=yuv420p,trim=duration=${s.dur},setpts=PTS-STARTPTS[v${i}]`;
    fc.push(v);
  });
  let prev = 'v0';
  for (let i = 1; i < S.length; i++) { fc.push(`[${prev}][v${i}]xfade=transition=fade:duration=${S[i].xfIn}:offset=${S[i].at.toFixed(3)}[x${i}]`); prev = 'x' + i; }
  const nosub = path.join(PRE, 'yukusuie_prefinal_nosub.mp4'), withsub = path.join(PRE, 'yukusuie_prefinal.mp4');
  // YouTube の推奨（1080p・24fps・SDR）に合わせる：H.264 High、yuv420p、最大 12Mbps、無音のステレオ AAC
  const enc = ['-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slow', '-crf', '18', '-maxrate', '12M', '-bufsize', '24M', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-g', String(FPS / 2), '-bf', '2',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-shortest', '-movflags', '+faststart'];
  const silent = ['-f', 'lavfi', '-t', String(END), '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000'];
  execFileSync('ffmpeg', [...args, ...silent, '-filter_complex', fc.join(';'), '-map', `[${prev}]`, '-map', `${nIn}:a`, ...enc, nosub], { stdio: 'inherit' });
  // 字幕を重ねる
  const a2 = ['-y', '-loglevel', 'error', '-i', nosub]; subPng.forEach(f => a2.push('-i', f));
  const f2 = []; let p2 = '0:v';
  subs.forEach((c, i) => { f2.push(`[${p2}][${i + 1}:v]overlay=0:0:enable='between(t,${c.at.toFixed(3)},${c.to.toFixed(3)})'[o${i}]`); p2 = 'o' + i; });
  execFileSync('ffmpeg', [...a2, '-filter_complex', f2.join(';'), '-map', `[${p2}]`, '-map', '0:a', ...enc.filter((x, i, a) => x !== '-shortest'), withsub], { stdio: 'inherit' });
  fs.writeFileSync(path.join(PRE, 'yukusuie_prefinal.srt'), subs.map((c, i) => `${i + 1}\n${srtT(c.at)} --> ${srtT(c.to)}\n${c.text}\n`).join('\n'));

  // 場面ごとのスクリーンショット（字幕つきの版から。字幕がある場面は字幕の出ている時刻を優先）
  for (const f of fs.readdirSync(path.join(PRE, 'stills'))) fs.rmSync(path.join(PRE, 'stills', f));
  S.forEach((s, i) => {
    const mid = (s.at + s.to) / 2, c = subs.find(c => c.at < s.to && c.to > s.at && c.at >= s.at - 0.5);
    s.shot = s.shotAt != null ? s.at + s.shotAt : c ? Math.min(Math.max(c.at + 0.8, s.at + 0.6), s.to - 0.4) : mid;
    s.still = path.join(PRE, 'stills', `${String(i + 1).padStart(2, '0')}-${s.id}.png`);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', s.shot.toFixed(3), '-i', withsub, '-frames:v', '1', s.still]);
    s.subs = subs.filter(c => c.at < s.to && c.to > s.at).map(c => c.text);
  });
  fs.writeFileSync(path.join(PRE, 'scenes.json'), JSON.stringify(S.map(({ id, kind, label, note, at, to, shot, still, subs, file, in: inp }) => ({ id, kind, label, note, at, to, shot, still: path.relative(PRE, still), subs, src: kind === 'plate' ? '仮の板' : file, in: inp })), null, 1));

  const kindJa = s => (s.sub ? '**代用**' : s.kind === 'rec' ? '実機の録画' : s.kind === 'plate' ? '**仮の板**' : '書き出し済み') + (s.full ? '・全面' : '・枠') + (s.zoom ? `・寄り${s.zoom.scale}倍` : '') + (s.play ? `・${s.play}秒で静止` : '') + (s.speed && s.speed !== 1 ? `・${s.speed}倍速` : '');
  const rows = S.map(s => `| ${fmt(s.at)}–${fmt(s.to)} | ${(s.to - s.at).toFixed(1)} | ${kindJa(s)} | ${s.label}${s.note ? '（' + s.note + '）' : ''} | ${s.file ? s.file + (s.in != null ? ' @' + s.in + '秒' : '') : ''} |`);
  const subRows = subs.map((c, i) => `| ${i + 1} | ${fmt(c.at)}–${fmt(c.to)} | ${c.text} |`);
  fs.writeFileSync(path.join(__dirname, 'TIMELINE.md'), `# 通しの場面と字幕の時刻（自動生成：node video/assemble.cjs）\n\n全体 ${fmt(END)}（${END}秒）。つなぎは ${XF}秒のクロスフェード。1920×1080・${FPS}fps。音は無音のトラックだけ（BGMと声は人間が入れる）。\n場面の開始時刻は構成 v0.3 の時刻にそろえ、字幕（${EDL.subs}）の時刻がそのまま使えるようにしてある。\n\n## 場面\n| 時刻 | 秒 | 材料 | 中身 | ファイル |\n|---|---|---|---|---|\n${rows.join('\n')}\n\n## 字幕（焼き込み）\n| # | 時刻 | 字幕 |\n|---|---|---|\n${subRows.join('\n')}\n${warn.length ? '\n## 字幕の基準に足りないもの\n' + warn.map(w => '- ' + w).join('\n') + '\n' : ''}`);
  console.log(warn.length ? warn.join('\n') : '字幕はすべて基準を満たす');
  console.log('done', withsub);
})();
