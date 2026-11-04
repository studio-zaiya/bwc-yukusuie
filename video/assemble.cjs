// 通しの組み立て：場面表（SEGMENTS）→ 仮の板を書き出し → ffmpeg で 0.3秒クロスフェードでつなぐ → 字幕SRT・TIMELINE.md
// 使い方：node video/assemble.cjs   環境変数 FONT_DIR（@fontsource のフォルダ）、OUT（既定 out）
// 実機の録画ができたら、SEGMENTS の file を out/rec/ の mp4 に差し替える（plate をやめる）。
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(process.env.OUT || path.join(ROOT, 'out'));
const PARTS = path.join(OUT, 'video_parts'), PLATES = path.join(OUT, 'plates');
const FONT_DIR = process.env.FONT_DIR || '';
const XF = 0.3, FPS = 24;
const T = s => s; // 秒

// kind: part（書き出し済みのかけら）／plate（仮の板：秒数と中身を書いた紙色の板）
// ss/dur は元ファイルから使う区間。at は目安の時刻（v0.3の表）。
const SEGMENTS = [
  { id: 'hero', kind: 'part', file: 'hero-title.mp4', ss: 0, dur: 8, label: 'Hero（コピーまで、ロゴはまだ）' },
  { id: 'intro-c', kind: 'part', file: 'intro-c.mp4', dur: 35.3, label: '前振りC（7場面）。ここに実写の写真2枚と名乗りの声が入る' },
  { id: 'logo', kind: 'part', file: 'title-card.mp4', dur: 5, label: 'ロゴ' },
  { id: 'r01', kind: 'plate', dur: 8, label: '実機 1：アンケートのサクサク', note: '3〜4問をテンポよく選ぶ。「あと〇問」が減る' },
  { id: 'r02', kind: 'plate', dur: 8, label: '実機 2：担当者の総括', note: '「ご記入ありがとうございます。〇〇なお家がご希望なのですね」' },
  { id: 'r03', kind: 'plate', dur: 10, label: '実機 3：提案の日', note: '2社の案が並ぶ（形・屋根・色が違う）' },
  { id: 'r04', kind: 'plate', dur: 11, label: '実機 4：第一の分岐点の儀式', note: '暗転 → 札 → 選ぶ → 札が世界線の列へ飛ぶ → 1' },
  { id: 'r05', kind: 'plate', dur: 12, label: '実機 5：第三の分岐点（自分の言葉）', note: '「いま起きたこと」の帯 → 金額が数え上がる → 世界線が7へ' },
  { id: 'r06', kind: 'plate', dur: 9, label: '実機 6：色決め → 第四の分岐点', note: '確定 → 第四の分岐点が自動で → 15へ' },
  { id: 'r07', kind: 'plate', dur: 10, label: '実機 7：電気の伝え漏れ', note: '左の一覧に、伝えたはずのテレビの壁掛けがない → 指摘 → 追加になる' },
  { id: 'r08', kind: 'plate', dur: 10, label: '実機 8：早送り → 引渡し（切り絵）', note: '職人と重機が動く → 引渡しの切り絵' },
  { id: 'r09', kind: 'plate', dur: 12, label: '実機 9：1年後 → 16区画', note: '07の強調 → 区画を押して比べる' },
  { id: 'arch', kind: 'part', file: 'arch.mp4', dur: 12.5, label: '仕組み「言葉はClaude、数字はコード。」' },
  { id: 'train', kind: 'plate', dur: 3, label: '担当者の研修の前後', note: '研修の記録（docs/REP_TRAINING_NEXT.md の5）から' },
  { id: 'work', kind: 'plate', dur: 2.5, label: '作業画面', note: 'Claude Code の作業画面の録画' },
  { id: 'rep', kind: 'plate', dur: 8, label: 'レポートの表紙', note: '実機のレポート（4ページをめくる）' },
  { id: 'hand', kind: 'plate', dur: 8, label: '実写：レポートを手渡す', note: '手元だけ。背景は無地の机か壁。人間が撮る' },
  { id: 'end', kind: 'part', file: 'ending-EA.mp4', ss: 10, dur: 3, label: '締め（3秒）' },
  { id: 'credits', kind: 'part', file: 'credits.mp4', dur: 5, label: '黒画面（スタッフ・注記）' },
];

const html = (s, at, end) => `<!doctype html><meta charset=utf-8><style>
${FONT_DIR ? ['zen-maru-gothic/500.css', 'zen-maru-gothic/700.css', 'zen-maru-gothic/900.css', 'biz-udpgothic/400.css', 'biz-udpgothic/700.css'].map(f => `@import url("file://${path.join(FONT_DIR, f)}");`).join('\n') : ''}
body{margin:0;width:1920px;height:1080px;background:#FFFAF0;color:#1E2B36;font-family:"Hiragino Sans","BIZ UDPGothic","Zen Maru Gothic",sans-serif;position:relative;overflow:hidden}
.f{position:absolute;inset:48px;border:4px dashed #1E2B36;border-radius:12px;opacity:.5}
.tag{position:absolute;left:96px;top:92px;font-size:34px;font-weight:700;letter-spacing:.2em;border:3px solid #1E2B36;padding:6px 22px;border-radius:8px}
.t{position:absolute;left:96px;right:96px;top:380px;font-size:84px;font-weight:900;line-height:1.3}
.n{position:absolute;left:96px;right:96px;top:640px;font-size:42px;line-height:1.6;font-family:"BIZ UDPGothic","Zen Maru Gothic",sans-serif}
.k{position:absolute;left:96px;bottom:92px;font-size:38px;font-weight:700}
.d{position:absolute;right:96px;bottom:84px;font-size:120px;font-weight:900;color:#E8701F}
</style><div class=f></div><div class=tag>仮の板</div>
<div class=t>${s.label}</div><div class=n>${s.note || ''}</div>
<div class=k>通し ${at} 〜 ${end}</div><div class=d>${s.dur}秒</div>`;

const fmt = t => { const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s.toFixed(1).padStart(4, '0')}`; };
const srtT = t => { const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = Math.floor(t % 60), ms = Math.round((t % 1) * 1000); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`; };

(async () => {
  fs.mkdirSync(PLATES, { recursive: true });
  // 開始時刻：クロスフェードで前の場面と XF 秒かさなる
  let at = 0; for (const s of SEGMENTS) { s.at = at; at += s.dur - XF; } const total = at + XF;
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  for (const s of SEGMENTS) {
    if (s.kind !== 'plate') continue;
    await pg.setContent(html(s, fmt(s.at), fmt(s.at + s.dur))); await pg.evaluate(() => document.fonts.ready); await pg.waitForTimeout(200);
    const png = path.join(PLATES, s.id + '.png'); await pg.screenshot({ path: png });
    s.file = path.join(PLATES, s.id + '.mp4');
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-loop', '1', '-framerate', String(FPS), '-t', String(s.dur), '-i', png, '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', s.file]);
  }
  await b.close();
  // ffmpeg：全部を 24fps・1920x1080 にそろえ、xfade でつなぐ
  const args = ['-y', '-loglevel', 'error']; const fc = [];
  SEGMENTS.forEach((s, i) => {
    const f = s.kind === 'part' ? path.join(PARTS, s.file) : s.file;
    if (s.ss) args.push('-ss', String(s.ss));
    args.push('-t', String(s.dur), '-i', f);
    fc.push(`[${i}:v]fps=${FPS},scale=1920:1080,format=yuv420p,setsar=1,trim=duration=${s.dur},setpts=PTS-STARTPTS[v${i}]`);
  });
  let prev = 'v0';
  for (let i = 1; i < SEGMENTS.length; i++) {
    fc.push(`[${prev}][v${i}]xfade=transition=fade:duration=${XF}:offset=${(SEGMENTS[i].at).toFixed(3)}[x${i}]`); prev = 'x' + i;
  }
  const outFile = path.join(OUT, 'yukusuie_v1.mp4');
  args.push('-filter_complex', fc.join(';'), '-map', `[${prev}]`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', outFile);
  execFileSync('ffmpeg', args, { stdio: 'inherit' });
  // 字幕：video/subs.json（[{at, dur, text}]）→ SRT（最低1.8秒）
  const subsPath = path.join(__dirname, 'subs.json'); const subs = fs.existsSync(subsPath) ? JSON.parse(fs.readFileSync(subsPath, 'utf8')) : [];
  fs.writeFileSync(path.join(OUT, 'yukusuie_v1.srt'), subs.map((c, i) => `${i + 1}\n${srtT(c.at)} --> ${srtT(c.at + Math.max(c.dur || 0, 1.8, c.text.replace(/\s/g, '').length / 4))}\n${c.text}\n`).join('\n'));
  // 場面の時刻の表
  const rows = SEGMENTS.map(s => `| ${fmt(s.at)}–${fmt(s.at + s.dur)} | ${s.dur} | ${s.kind === 'part' ? '書き出し済み' : '**仮の板**'} | ${s.label}${s.note ? '（' + s.note + '）' : ''} |`);
  fs.writeFileSync(path.join(__dirname, 'TIMELINE.md'), `# 通し v1 の場面の時刻（自動生成：node video/assemble.cjs）\n\n全体 ${fmt(total)}（${total.toFixed(1)}秒）。つなぎは ${XF}秒のクロスフェード。1920×1080・24fps・音なし。\n\n| 時刻 | 秒 | 材料 | 中身 |\n|---|---|---|---|\n${rows.join('\n')}\n`);
  console.log('done', outFile, total.toFixed(1));
})();
