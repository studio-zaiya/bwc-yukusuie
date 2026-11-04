// レビュー用スライド（場面ごとのスクショ＋修正指示の欄）
const pptxgen = require('pptxgenjs');
const path = require('path'), fs = require('fs');
const { applyTheme } = require(process.env.PPTX_SKILL + '/scripts/apply_theme.js');
const STILLS = process.argv[2], APPSHOTS = process.argv[3], OUT = process.argv[4];

const THEME = { name: 'YUKUSUIE', headFontFace: 'Hiragino Sans', bodyFontFace: 'Hiragino Sans',
  colors: { dk1: '1E2B36', lt1: 'FFFFFF', dk2: '6B6358', lt2: 'FFFAF0', accent1: 'E8701F', accent2: '1C8DCC', accent3: 'F2C230', accent4: '2E5A88', accent5: '9BD27A', accent6: '8C6A00', hlink: '1C8DCC', folHlink: '14699A' } };

const SEG = JSON.parse(fs.readFileSync(path.join(STILLS, 'segments.json'), 'utf8'));
const NOTE = {
  '01_hero': 'H2の0〜7.5秒＋ロゴ。金の破線は07の枝をなぞる形に直した（17番目なし）。名乗りの字幕は仮で、本番は人間の声。説明の一行はここに出していない。',
  '02_intro': '前振りC（44秒）を2.2倍速にしただけの仮。文字が読み切れない。本番は場面を削って15〜25秒で作り直す。',
  '03_lot': '抽選の場面はなし。第二希望の当選だけを1枚で見せる。',
  '04_wish': '付箋とぶつかり検出は、試作では用意した8枚。本番はClaudeが実際に付箋化する。建蔽率の判定はエンジンの計算。',
  '05_meet': '4社とも墨の札＋形だけ。エンカウントの構図（手前に夫婦の背中）。人物の絵はまだ記号的。',
  '06_ledger': '台帳の③見せ方→②原価と価格。数字はすべてengine.jsの出力。',
  '07_fork': '隣の世界（05）のSNS投稿が伏線。2択は同じ大きさ。ゆう●のひとことで自由入力へ誘う。',
  '08_free': '見せ場：Claudeがエンジンを道具として呼び、検算してから答える（7章の2）。ログは試作では台本。本番は実際の呼び出しを表示。',
  '09_agents': '見せ場：16の担当者が同時に考える（7章の1）。木は16のまま、07の枝が金の破線。',
  '10_build': '早送り。Cの世界は少し遅れて建つ。右に07の間取り。',
  '11_year': '1年後の16区画。「もし、あのとき」で05へ、続けて13（大きな出来事）を再生（7章の3の演出）。',
  '12_w4': '完成の瞬間（W4）をそのまま流用。家の状態JSONはエンジンから渡せる形。W4の中にもキャッチ「16回目の、マイホームへ。」が出るので、締めのE3と重なっている。どちらか1回にしたい。',
  '13_honne': '担当者の本音は「それぞれの事情」の温度。どの会社も貶めない言い方。',
  '14_arch': '仕組み（arch C）。17番目の敷地をやめ、07の区画が金の屋根になる形に直した。',
  '15_devlog': '仮のカード。本番はClaude Codeの作業画面・テスト・コミットの実写に差し替え。',
  '16_handoff': 'E6の前半（カードが手前に来る〜机に置く）。本番は実写の手渡しに差し替え予定。',
  '17_e3': '締めはE3の1回だけ。題名を「ゆくすいえ」に差し替え、キャッチと注記を統合。注記は数秒延ばす必要あり。',
};
const APP = [
  ['B1・B13', '起動画面', '注記はここで1回。自動モードは1回遊ぶと開く。'],
  ['B2', '世帯と家計', '型2を仮採用。借りられそうな額と月々の目安を1行で。'],
  ['B3', '区画の当選', '抽選なし。15の世界でも同じ区画。'],
  ['A3', '要望を話す', '付箋、ぶつかり、建蔽率の判定。'],
  ['A4', '住宅会社と打ち合わせ', '4社のタブ、見積の表紙、担当者への質問欄。'],
  ['B7', '見積と台帳', '3層の切り替え。プレイ中は③だけ見せる想定。'],
  ['A5', '分かれ道3', '2択＋自由回答。隣の世界のSNS。'],
  ['A5', '自由回答を確かめる', '読み替え→仮計算→条件→承認→確定。'],
  ['B10', '16の世界が同時に動く', '待ち時間の表示を兼ねる。'],
  ['B8・B9', '時計と間取り', 'つまみで早送り。07の平面図。'],
  ['A6・B5', '1年後の16区画', '区画を押すとその世界のカード。'],
  ['A6', '事情と見積の透視', '「別途」が浮かび上がる。'],
  ['B14', 'わが家のバランス', '印刷版（A9）と同じ中身。'],
  ['B11', '自動モード', '2台のスマホは提出後に回す。'],
];

(async () => {
  const pres = new pptxgen();
  pres.layout = 'LAYOUT_WIDE';
  pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
  pres.title = 'ゆくすいえ 通しアニマティック レビュー';
  const C = pres.SchemeColor;

  pres.defineSlideMaster({ title: 'SCENE', background: { color: 'FFFAF0' },
    objects: [{ placeholder: { options: { name: 'title', type: 'title', x: 0.45, y: 0.3, w: 12.4, h: 0.6, fontSize: 26, bold: true, color: C.text1, valign: 'middle', align: 'left', margin: 0 }, text: '' } }],
    slideNumber: { x: 12.4, y: 7.05, w: 0.6, h: 0.3, fontSize: 10, color: C.text2 } });
  pres.defineSlideMaster({ title: 'COVER', background: { color: '1E2B36' } });

  // 表紙
  pres.addSection({ title: '表紙' });
  let s = pres.addSlide({ masterName: 'COVER', sectionTitle: '表紙' });
  s.addText('ゆくすいえ', { x: 0.8, y: 1.6, w: 11, h: 1.2, fontSize: 60, bold: true, color: 'FFFAF0', isTextBox: true, margin: 0 });
  s.addText('通しアニマティック v0.1　レビュー用', { x: 0.8, y: 2.9, w: 11, h: 0.6, fontSize: 24, color: 'FFD98A', isTextBox: true, margin: 0 });
  s.addText([
    { text: '各スライドの右下「修正指示・提案」の欄に、直してほしいことを書き込んで返してください。', options: { breakLine: true } },
    { text: '動画本体：yukusuie_animatic_v0.1.mp4（3分・字幕は仮）', options: { breakLine: true } },
    { text: '後半に、アプリの通し試作の14画面も付けています。' },
  ], { x: 0.8, y: 4.2, w: 11.5, h: 1.5, fontSize: 16, color: 'E9EEF2', isTextBox: true, margin: 0, paraSpaceAfter: 6 });
  s.addText('作成：Claude（2026-11-04 未明）。字幕・ナレーションの文案はClaudeの仮案です。', { x: 0.8, y: 6.6, w: 11.5, h: 0.4, fontSize: 12, color: '9FB0BC', isTextBox: true, margin: 0 });

  // 全体の流れ
  pres.addSection({ title: '動画の場面' });
  s = pres.addSlide({ masterName: 'SCENE', sectionTitle: '動画の場面' });
  s.addText('3分の流れ（17場面）', { placeholder: 'title' });
  const total = SEG.reduce((a, g) => a + g.dur, 0);
  let acc = 0;
  const groups = { '01': '冒頭', '02': '課題', '03': '実機', '04': '実機', '05': '実機', '06': '実機', '07': '実機', '08': '実機', '09': '実機', '10': '実機', '11': '1年後', '12': '1年後', '13': '1年後', '14': '仕組み', '15': '仕組み', '16': '締め', '17': '締め' };
  const fills = { '冒頭': 'F2C230', '課題': 'CFEBFA', '実機': 'FDE3CC', '1年後': 'D6ECF8', '仕組み': 'E3DFD6', '締め': 'BFE3A6' };
  SEG.forEach((g, i) => {
    const x = 0.45 + 12.4 * acc / total, w = 12.4 * g.dur / total;
    s.addShape(pres.shapes.RECTANGLE, { x, y: 1.3, w, h: 0.7, fill: { color: fills[groups[g.id.slice(0, 2)]] }, line: { color: 'FFFAF0', width: 1.5 }, objectName: 'seg' + g.id });
    s.addText(g.id.slice(0, 2), { x, y: 1.3, w, h: 0.7, fontSize: 11, color: C.text1, align: 'center', valign: 'middle', isTextBox: true, margin: 0 });
    acc += g.dur;
  });
  const rows = [[{ text: '場面', options: { bold: true } }, { text: '時刻', options: { bold: true } }, { text: '中身', options: { bold: true } }]];
  acc = 0;
  SEG.forEach(g => { const t0 = acc, t1 = acc + g.dur; acc = t1; rows.push([g.id.slice(0, 2), `${fmt(t0)}–${fmt(t1)}`, g.label]); });
  s.addTable(rows.slice(0, 10), { x: 0.45, y: 2.3, w: 6.0, colW: [0.7, 1.4, 3.9], fontSize: 11, color: '1E2B36', border: { type: 'solid', pt: 0.5, color: 'D9D2C5' }, rowH: 0.36 });
  s.addTable([rows[0], ...rows.slice(10)], { x: 6.85, y: 2.3, w: 6.0, colW: [0.7, 1.4, 3.9], fontSize: 11, color: '1E2B36', border: { type: 'solid', pt: 0.5, color: 'D9D2C5' }, rowH: 0.36 });

  // 場面ごと
  acc = 0;
  SEG.forEach(g => {
    const t0 = acc, t1 = acc + g.dur; acc = t1;
    const sl = pres.addSlide({ masterName: 'SCENE', sectionTitle: '動画の場面' });
    sl.addText(`${g.id.slice(0, 2)}　${g.label}`, { placeholder: 'title' });
    sl.addImage({ path: path.join(STILLS, g.id + '.jpg'), x: 0.45, y: 1.15, w: 8.4, h: 4.725, objectName: 'still' });
    sl.addText(`${fmt(t0)} – ${fmt(t1)}（${g.dur}秒）`, { x: 9.15, y: 1.15, w: 3.7, h: 0.4, fontSize: 16, bold: true, color: C.text1, isTextBox: true, margin: 0 });
    const cap = (g.cap || []).map(c => c[2]);
    sl.addText([{ text: '字幕（仮）', options: { bold: true, breakLine: true, color: '6B6358' } }, { text: cap.length ? cap.join('\n') : 'なし（画面内の文字のみ）' }],
      { x: 9.15, y: 1.65, w: 3.7, h: 1.2, fontSize: 12, color: C.text1, isTextBox: true, margin: 0, valign: 'top' });
    sl.addText([{ text: 'いまの状態・メモ（Claude）', options: { bold: true, breakLine: true, color: '6B6358' } }, { text: NOTE[g.id] || '' }],
      { x: 9.15, y: 2.95, w: 3.7, h: 2.9, fontSize: 12, color: C.text1, isTextBox: true, margin: 0, valign: 'top' });
    commentBox(sl, pres);
  });

  // アプリの画面
  pres.addSection({ title: 'アプリの画面' });
  APP.forEach((a, i) => {
    const sl = pres.addSlide({ masterName: 'SCENE', sectionTitle: 'アプリの画面' });
    sl.addText(`アプリ ${String(i + 1).padStart(2, '0')}　${a[1]}`, { placeholder: 'title' });
    sl.addImage({ path: path.join(APPSHOTS, `s${String(i).padStart(2, '0')}.png`), x: 0.45, y: 1.15, w: 8.4, h: 4.725, objectName: 'appshot' });
    sl.addText(a[0], { x: 9.15, y: 1.15, w: 3.7, h: 0.4, fontSize: 16, bold: true, color: C.text1, isTextBox: true, margin: 0 });
    sl.addText([{ text: 'メモ（Claude）', options: { bold: true, breakLine: true, color: '6B6358' } }, { text: a[2] }], { x: 9.15, y: 1.65, w: 3.7, h: 4.2, fontSize: 12, color: C.text1, isTextBox: true, margin: 0, valign: 'top' });
    commentBox(sl, pres);
  });

  // 確認待ち
  pres.addSection({ title: '確認待ち' });
  s = pres.addSlide({ masterName: 'SCENE', sectionTitle: '確認待ち' });
  s.addText('人間に決めてほしいこと', { placeholder: 'title' });
  const qs = ['世帯は型2でよいか', '説明の一行の文案と、置く場所（いまは起動画面にも動画にも出していない）', '前振りCの線の色（青緑か、デザインコードの空色か）', '7章の先鋭機能：1＋2を核に、3を演出（この通し試作の形）でよいか', '冒頭の名乗りの言い回し', '印刷レポートの中身（A4・1枚）', 'GitHubの置き場所（個人の下か、Organizationか）'];
  s.addText(qs.map((q, i) => ({ text: q, options: { bullet: { type: 'number' }, breakLine: i < qs.length - 1 } })), { x: 0.6, y: 1.3, w: 7.4, h: 5.2, fontSize: 16, color: C.text1, isTextBox: true, paraSpaceAfter: 10, valign: 'top' });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 8.4, y: 1.3, w: 4.45, h: 5.2, rectRadius: 0.1, fill: { color: 'FFFFFF' }, line: { color: 'B5AEA3', width: 1, dashType: 'dash' }, objectName: 'answerBox' });
  s.addText('答え・コメント', { x: 8.6, y: 1.45, w: 4, h: 0.4, fontSize: 12, bold: true, color: '6B6358', isTextBox: true, margin: 0 });

  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
})();

function fmt(t) { const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s.toFixed(1).padStart(4, '0')}`; }
function commentBox(sl, pres) {
  sl.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.45, y: 6.0, w: 12.4, h: 0.95, rectRadius: 0.08, fill: { color: 'FFFFFF' }, line: { color: 'B5AEA3', width: 1, dashType: 'dash' }, objectName: 'commentBox' });
  sl.addText('修正指示・提案：', { x: 0.6, y: 6.08, w: 3, h: 0.3, fontSize: 11, bold: true, color: '6B6358', isTextBox: true, margin: 0 });
}
