// クレヨン描画の共通部品（すべて自作）
const KW = 1920, KH = 1080;
const PAPER = '#FFFBF1';
const C = {
  red:'#E8553A', orange:'#F59A23', yellow:'#F7C81E', green:'#4FAE63', leaf:'#7CC46B',
  blue:'#3D7DD8', sky:'#86CCF2', brown:'#8A5A3B', pink:'#F28DB2', gray:'#8E959E',
  ink:'#3B3A40', cream:'#FFF1C9', brick:'#C9593F', wood:'#C98A4B', galv:'#9AA6B2',
  mint:'#9ED9C3', white:'#FFFFFF', purple:'#9B7BD4'
};

function hash(a, b, c) {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const seg = (p, a, b) => clamp((p - a) / (b - a));
const lerp = (a, b, k) => a + (b - a) * k;
const easeIO = k => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
const easeOut = k => 1 - Math.pow(1 - k, 3);
const easeBack = k => { const c = 1.6; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };

function resample(pts, step) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    const d = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.ceil(d / step));
    for (let k = 1; k <= n; k++) out.push([x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n]);
  }
  return out;
}

// クレヨンの線。p は描き進み（0〜1）、seed で揺れが決まる
function crayon(ctx, pts, col, w, seed, p = 1, alpha = 1) {
  if (p <= 0 || pts.length < 2) return;
  const rs = resample(pts, Math.max(2.5, w * 1.1));
  const m = Math.max(2, Math.ceil(rs.length * clamp(p)));
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = col;
  for (let pass = 0; pass < 3; pass++) {
    ctx.globalAlpha = (0.38 + pass * 0.16) * alpha;
    ctx.lineWidth = w * (0.55 + pass * 0.22);
    ctx.beginPath();
    for (let i = 0; i < m; i++) {
      const jx = (hash(seed, i, pass * 3 + 1) - .5) * w * .55;
      const jy = (hash(seed, i, pass * 3 + 2) - .5) * w * .55;
      const [x, y] = rs[i];
      i ? ctx.lineTo(x + jx, y + jy) : ctx.moveTo(x + jx, y + jy);
    }
    ctx.stroke();
  }
  // 紙の目（線の中に白い抜けをつくる）
  ctx.globalAlpha = .4 * alpha;
  ctx.strokeStyle = PAPER;
  ctx.lineWidth = w * .3;
  ctx.setLineDash([w * .35, w * .9]);
  ctx.beginPath();
  for (let i = 0; i < m; i++) { const [x, y] = rs[i]; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  ctx.stroke();
  ctx.restore();
}

// クレヨンの塗り（斜めのぐるぐる線）。poly で切り抜き、p で塗り進む
function scribble(ctx, poly, col, seed, sp = 7, alpha = .5, p = 1) {
  if (p <= 0) return;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [x, y] of poly) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  ctx.save();
  ctx.beginPath();
  poly.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.closePath();
  ctx.clip();
  ctx.strokeStyle = col; ctx.lineCap = 'round';
  ctx.lineWidth = sp * 1.05;
  ctx.globalAlpha = alpha;
  const h = y1 - y0, span = (x1 - x0) + h * .7;
  const lim = x0 - h * .7 + span * clamp(p);
  ctx.beginPath();
  let k = 0;
  for (let x = x0 - h * .7; x < lim; x += sp, k++) {
    const j1 = (hash(seed, k, 7) - .5) * sp * .8, j2 = (hash(seed, k, 9) - .5) * sp * .8;
    ctx.moveTo(x + j1, y1 + 2);
    ctx.lineTo(x + h * .7 + j2, y0 - 2);
  }
  ctx.stroke();
  ctx.restore();
}

const rectPts = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y + .01]];
function ellipsePts(cx, cy, rx, ry, a0 = 0, a1 = Math.PI * 2, n = 40) {
  const o = [];
  for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; o.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
  return o;
}

function kidText(ctx, s, x, y, size, col, opts = {}) {
  ctx.save();
  ctx.font = `${opts.weight || 600} ${size}px 'Klee One', 'Zen Maru Gothic', sans-serif`;
  ctx.fillStyle = col;
  ctx.textAlign = opts.align || 'left';
  ctx.textBaseline = opts.base || 'alphabetic';
  ctx.globalAlpha = opts.alpha == null ? 1 : opts.alpha;
  if (opts.rot) { ctx.translate(x, y); ctx.rotate(opts.rot); ctx.fillText(s, 0, 0); }
  else ctx.fillText(s, x, y);
  ctx.restore();
}
function numText(ctx, s, x, y, size, col, opts = {}) {
  ctx.save();
  ctx.font = `${opts.weight || 800} ${size}px 'Zen Maru Gothic', sans-serif`;
  ctx.fillStyle = col;
  ctx.textAlign = opts.align || 'left';
  ctx.textBaseline = opts.base || 'alphabetic';
  ctx.globalAlpha = opts.alpha == null ? 1 : opts.alpha;
  ctx.fillText(s, x, y);
  ctx.restore();
}

// マスキングテープ
function tape(ctx, x, y, w, h, rot, col = 'rgba(247,200,30,.55)') {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(rot);
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(-w / 2, -h / 2);
  for (let i = 0; i <= 6; i++) ctx.lineTo(-w / 2 + w * i / 6, -h / 2 + (i % 2 ? 1.5 : -1.5));
  ctx.lineTo(w / 2, h / 2);
  for (let i = 6; i >= 0; i--) ctx.lineTo(-w / 2 + w * i / 6, h / 2 + (i % 2 ? -1.5 : 1.5));
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

// 後ろ姿の人（顔は描かない）
function personBack(ctx, x, gy, hgt, body, hair, seed, p = 1, bob = 0) {
  const hr = hgt * .2, top = gy - hgt + bob;
  const bodyPoly = [[x - hgt * .2, gy], [x - hgt * .14, top + hr * 2.1], [x + hgt * .14, top + hr * 2.1], [x + hgt * .2, gy]];
  scribble(ctx, bodyPoly, body, seed + 1, Math.max(3, hgt * .07), .75, seg(p, .2, 1));
  crayon(ctx, [...bodyPoly, bodyPoly[0]], C.ink, Math.max(1.6, hgt * .03), seed + 2, seg(p, 0, .6));
  scribble(ctx, ellipsePts(x, top + hr, hr, hr, 0, 6.3, 24), hair, seed + 3, Math.max(3, hgt * .06), .9, seg(p, .3, 1));
  crayon(ctx, ellipsePts(x, top + hr, hr, hr, 0, 6.3, 24), C.ink, Math.max(1.6, hgt * .03), seed + 4, seg(p, .1, .7));
}

function rabbit(ctx, x, gy, s, seed, hop = 0) {
  const y = gy - hop;
  const bodyP = ellipsePts(x, y - s * .45, s * .6, s * .42, 0, 6.3, 22);
  scribble(ctx, bodyP, '#FFFFFF', seed, Math.max(2, s * .12), 1);
  crayon(ctx, bodyP, C.gray, Math.max(1.4, s * .07), seed + 1);
  const head = ellipsePts(x + s * .5, y - s * .78, s * .3, s * .27, 0, 6.3, 18);
  scribble(ctx, head, '#FFFFFF', seed + 2, Math.max(2, s * .1), 1);
  crayon(ctx, head, C.gray, Math.max(1.4, s * .07), seed + 3);
  crayon(ctx, [[x + s * .42, y - s * 1.0], [x + s * .36, y - s * 1.5], [x + s * .5, y - s * 1.05]], C.gray, Math.max(1.4, s * .07), seed + 4);
  crayon(ctx, [[x + s * .6, y - s * 1.0], [x + s * .7, y - s * 1.48], [x + s * .7, y - s * 1.02]], C.gray, Math.max(1.4, s * .07), seed + 5);
  crayon(ctx, [[x + s * .62, y - s * 1.2], [x + s * .66, y - s * 1.36]], C.pink, Math.max(1.4, s * .06), seed + 6);
}

// こどもの絵の家（カード座標：幅380×高さ214、地面 y=gy）
// spec: roof 'gable'|'box'|'eave', wall, roofc, floors, carport, shed, lit, rabbit, tree, cold, fate
function kidHouse(ctx, spec, ox, oy, k, seed, p = 1, opt = {}) {
  ctx.save();
  ctx.translate(ox, oy); ctx.scale(k, k);
  const w = opt.w || 2.6;
  const gy = 182, hx = spec.hx || 205;
  const ww = spec.floors === 1 ? 170 : 124, wh = spec.floors === 1 ? 58 : 98;
  const L = hx - ww / 2, T = gy - wh;
  const grey = spec.fate === 'vacant';
  const ink = grey ? C.gray : C.ink;
  // 太陽と空
  if (!opt.noSun) {
    const sp = seg(p, 0, .15);
    scribble(ctx, ellipsePts(52, 46, 22, 22, 0, 6.3, 24), C.yellow, seed + 10, 5, .9, sp);
    for (let r = 0; r < 8; r++) {
      const a = r / 8 * Math.PI * 2 + .2;
      crayon(ctx, [[52 + Math.cos(a) * 30, 46 + Math.sin(a) * 30], [52 + Math.cos(a) * 40, 46 + Math.sin(a) * 40]], C.orange, w, seed + 20 + r, seg(p, .05, .2));
    }
    crayon(ctx, [[290, 40], [302, 30], [318, 34], [330, 28], [344, 38], [336, 48], [298, 50], [290, 40]], C.sky, w, seed + 30, seg(p, .1, .25));
  }
  // 地面
  crayon(ctx, [[8, gy + 2], [120, gy - 1], [260, gy + 2], [372, gy]], C.green, w * 1.2, seed + 1, seg(p, 0, .15));
  scribble(ctx, [[6, gy], [374, gy], [374, 210], [6, 210]], C.leaf, seed + 2, 7, .32, seg(p, .05, .2));

  if (spec.fate === 'empty' || spec.fate === 'pause') {
    if (!opt.skipEmpty) emptyLot(ctx, spec, gy, seed, seg(p, .15, 1), w);
    ctx.restore();
    return;
  }
  const ha = opt.houseAlpha == null ? 1 : opt.houseAlpha;
  ctx.globalAlpha = ha;
  // 壁
  const wallPoly = rectPts(L, T, ww, wh);
  scribble(ctx, wallPoly, grey ? '#C8CCD2' : spec.wall, seed + 3, 6, .62, seg(p, .2, .45));
  crayon(ctx, wallPoly, ink, w, seed + 4, seg(p, .15, .4));
  if (spec.wallTex === 'brick') {
    for (let r = 0; r < 5; r++) crayon(ctx, [[L + 4, T + 18 + r * 16], [L + ww - 4, T + 18 + r * 16]], 'rgba(120,40,30,.6)', w * .5, seed + 60 + r, seg(p, .35, .5));
  } else if (spec.wallTex === 'wood') {
    for (let r = 0; r < 7; r++) crayon(ctx, [[L + 10 + r * ww / 7, T + 4], [L + 10 + r * ww / 7, gy - 4]], 'rgba(110,60,25,.45)', w * .5, seed + 70 + r, seg(p, .35, .5));
  } else if (spec.wallTex === 'galv') {
    for (let r = 0; r < 10; r++) crayon(ctx, [[L + 6 + r * ww / 10, T + 3], [L + 6 + r * ww / 10, gy - 3]], 'rgba(70,80,95,.4)', w * .4, seed + 80 + r, seg(p, .35, .5));
  }
  // 屋根
  const rp = seg(p, .45, .65);
  if (spec.roof === 'gable') {
    const roofPoly = [[L - 12, T + 2], [hx, T - 52], [L + ww + 12, T + 2], [L - 12, T + 2]];
    scribble(ctx, roofPoly, grey ? '#A7ADB5' : spec.roofc, seed + 5, 6, .75, rp);
    crayon(ctx, roofPoly, ink, w, seed + 6, rp);
  } else {
    const par = [[L - 4, T - 9], [L + ww + 4, T - 9], [L + ww + 4, T + 1], [L - 4, T + 1], [L - 4, T - 9]];
    scribble(ctx, par, grey ? '#A7ADB5' : spec.roofc, seed + 5, 5, .8, rp);
    crayon(ctx, par, ink, w, seed + 6, rp);
    if (spec.roof === 'eave') {
      const ey = gy - 52;
      crayon(ctx, [[L + 8, ey], [L + ww + 26, ey - 6]], ink, w * 1.3, seed + 7, seg(p, .55, .7));
      scribble(ctx, [[L + 8, ey - 3], [L + ww + 26, ey - 9], [L + ww + 26, ey - 2], [L + 8, ey + 4]], spec.roofc, seed + 8, 4, .8, seg(p, .55, .7));
    }
  }
  // 窓とドア
  const wp = seg(p, .62, .8);
  const winFill = grey ? '#6C727B' : (spec.lit ? C.yellow : C.sky);
  const wins = [];
  if (spec.floors === 1) {
    wins.push(rectPts(L + 14, gy - 42, 54, 30), rectPts(L + 104, gy - 42, 30, 22));
  } else {
    wins.push(rectPts(L + 14, T + 14, 28, 22), rectPts(L + ww - 44, T + 14, 28, 22));
    wins.push(rectPts(L + 12, gy - 40, 62, 30));
  }
  for (let i = 0; i < wins.length; i++) {
    scribble(ctx, wins[i], winFill, seed + 40 + i, 5, .85, wp);
    crayon(ctx, wins[i], ink, w * .9, seed + 45 + i, wp);
  }
  const door = rectPts(L + ww - 34, gy - 44, 22, 44);
  scribble(ctx, door, grey ? '#7C828B' : C.brown, seed + 50, 5, .8, wp);
  crayon(ctx, door, ink, w * .9, seed + 51, wp);
  // つめたい窓（青いぐるぐる）
  if (spec.cold && opt.cold > 0) {
    for (let i = 0; i < 3; i++) {
      const cx = L + 20 + i * 20, cy = gy - 52 - i * 6;
      crayon(ctx, ellipsePts(cx, cy, 7, 5, 0, Math.PI * 3.2, 26).map(([x, y], j) => [x + j * .5, y]), C.blue, w * .9, seed + 90 + i, opt.cold);
    }
  }
  ctx.globalAlpha = 1;
  // 外まわり
  const ep = seg(p, .8, 1);
  const right = L + ww + 10;
  if (spec.carport > 0) {
    const cw = spec.carport === 2 ? 92 : 50;
    crayon(ctx, [[right + 4, gy], [right + 4, gy - 48], [right + cw, gy - 50], [right + cw, gy]], ink, w, seed + 100, ep);
    for (let c = 0; c < spec.carport; c++) car(ctx, right + 10 + c * 42, gy, spec.carColors ? spec.carColors[c] : C.red, seed + 110 + c, ep, w);
  } else if (spec.gravel) {
    for (let i = 0; i < 14; i++) crayon(ctx, ellipsePts(right + 8 + (i % 7) * 9, gy - 3 - Math.floor(i / 7) * 5, 2.4, 1.6, 0, 6.3, 6), C.gray, w * .5, seed + 120 + i, ep);
    if (spec.carColors) car(ctx, right + 14, gy, spec.carColors[0], seed + 129, ep, w);
  }
  if (spec.shed) {
    const sx = L - 42;
    const sh = rectPts(sx, gy - 28, 28, 28);
    scribble(ctx, sh, C.galv, seed + 130, 4, .7, ep);
    crayon(ctx, sh, ink, w * .9, seed + 131, ep);
  }
  if (spec.tree) {
    const tx = spec.shed ? L - 70 : L - 34;
    crayon(ctx, [[tx, gy], [tx, gy - 30]], C.brown, w * 1.4, seed + 140, ep);
    scribble(ctx, ellipsePts(tx, gy - 44, 18, 18, 0, 6.3, 20), C.green, seed + 141, 5, .8, ep);
    crayon(ctx, ellipsePts(tx, gy - 44, 18, 18, 0, 6.3, 20), '#2F7D45', w * .8, seed + 142, ep);
  }
  if (spec.fence) {
    for (let i = 0; i < 6; i++) crayon(ctx, [[L - 60 + i * 9, gy], [L - 60 + i * 9, gy - 14]], C.wood, w * .7, seed + 150 + i, ep);
    crayon(ctx, [[L - 62, gy - 9], [L - 12, gy - 9]], C.wood, w * .7, seed + 157, ep);
  }
  ctx.restore();
}

function car(ctx, x, gy, col, seed, p, w) {
  const body = [[x, gy - 7], [x + 4, gy - 18], [x + 12, gy - 26], [x + 28, gy - 26], [x + 34, gy - 18], [x + 38, gy - 7], [x, gy - 7]];
  scribble(ctx, body, col, seed, 4, .8, p);
  crayon(ctx, body, C.ink, w * .8, seed + 1, p);
  crayon(ctx, ellipsePts(x + 9, gy - 5, 4, 4, 0, 6.3, 10), C.ink, w, seed + 2, p);
  crayon(ctx, ellipsePts(x + 29, gy - 5, 4, 4, 0, 6.3, 10), C.ink, w, seed + 3, p);
}

function emptyLot(ctx, spec, gy, seed, p, w) {
  // 看板
  const sx = 190;
  crayon(ctx, [[sx, gy], [sx, gy - 60]], C.brown, w * 1.3, seed + 200, seg(p, 0, .4));
  const board = rectPts(sx - 52, gy - 102, 104, 44);
  scribble(ctx, board, '#FFFFFF', seed + 201, 5, 1, seg(p, .2, .6));
  crayon(ctx, board, C.ink, w, seed + 202, seg(p, .2, .6));
  kidText(ctx, spec.sign || 'あきち', sx, gy - 72, 24, C.ink, { align: 'center', alpha: seg(p, .5, .8) });
  // 雑草
  for (let i = 0; i < 9; i++) {
    const x = 40 + i * 37 + hash(seed, i, 3) * 10;
    crayon(ctx, [[x, gy], [x - 4, gy - 12], [x + 2, gy - 3], [x + 6, gy - 14], [x + 6, gy]], C.green, w * .8, seed + 210 + i, seg(p, .5, 1));
  }
}

// 16の世界（同じふたりの、16とおりの1年後）
// path: 4つの分かれ道の答え（L/R）、graft は2択の外の答え
const FORKS = [
  { name: '会社えらび', L: '大手のハウスメーカー', R: '地元の工務店' },
  { name: '間取りで残すもの', L: '外構（かずの希望）', R: '造作キッチン（ゆうの希望）' },
  { name: '契約', L: '借入を増やして外構を戻す', R: '予算のまま' },
  { name: '仕様', L: '箱型の屋根', R: '勾配屋根' }
];
const WORLDS = [
  { lot: 1, path: 'LLLL', title: '入居の日に、ぜんぶそろった', line: '外構もライトアップも最初から。借入は300万円ふえた。', num: '+300万', sub: '借入', spec: { roof: 'box', wall: '#FFFFFF', roofc: C.ink, floors: 2, carport: 2, shed: true, lit: true, tree: true, carColors: [C.red, C.blue] } },
  { lot: 2, path: 'LLLR', title: '軒の下で雨やどり', line: '勾配屋根に外構もそろえた。毎月の返済がいちばん重い世界。', num: '月14.6万', sub: '返済', spec: { roof: 'gable', wall: C.cream, roofc: C.brick, floors: 2, carport: 2, lit: true, tree: true, carColors: [C.blue, C.yellow] } },
  { lot: 3, path: 'RLLL', detail: true, title: '上棟の2か月後、職人が来なくなった', line: '全部入る家を、着工金を多めに入れて契約。工務店が事業を止めた。', num: '−800万', sub: '戻らない代金', spec: { fate: 'empty', sign: 'あきち', roof: 'gable', wall: C.pink, roofc: C.red, floors: 2, carport: 2, shed: true, lit: true, tree: true },
    rows: [['戻らない代金', '約800万円'], ['工事が止まった時期', '上棟の2か月後'], ['いまの区画', '骨組みを片づけて更地'], ['担当の本音', '資金繰りが3か月前から苦しかった']] },
  { lot: 4, path: 'RLLR', title: 'ライトアップが自慢', line: '地元の工務店で外構まで。夜、帰ってくるのがたのしい家。', num: '+180万', sub: '外構', spec: { roof: 'gable', wall: C.wood, wallTex: 'wood', roofc: C.ink, floors: 2, carport: 1, lit: true, tree: true, carColors: [C.green] } },
  { lot: 5, path: 'LLRL', title: '和室を足した', line: '親の希望で6畳の和室。いまは季節ものの物置になっている。', num: '6畳', sub: '和室', spec: { roof: 'box', wall: C.galv, wallTex: 'galv', roofc: C.ink, floors: 2, carport: 1, lit: true, carColors: [C.red] } },
  { lot: 6, path: 'LLRR', title: '数字は最高、打ち合わせはおまかせ', line: '断熱も耐震も最上位。決めたことを、あまり覚えていない。', num: '等級7', sub: '断熱', spec: { roof: 'gable', wall: '#FFFFFF', roofc: C.blue, floors: 2, carport: 2, lit: true, carColors: [C.yellow, C.gray] } },
  { lot: 7, path: 'RR', graft: { at: 2, label: '少し借りて、窓をトリプルに' }, detail: true, mine: true, title: 'わが家', line: 'キッチンを残し、外構は削った。2択の外の答えで、窓だけは性能を上げた。', num: '20℃', sub: '2月の朝', spec: { roof: 'eave', hx: 240, wall: '#FFFFFF', roofc: C.wood, floors: 2, carport: 0, gravel: true, lit: true, rabbit: true, fence: true, carColors: [C.orange] },
    rows: [['2月の朝の室温', '20℃'], ['毎月の返済（35年・簡易計算）', '13.0万円'], ['打ち合わせ', '11回'], ['外構', 'いまは砂利。物置だけ先に']] },
  { lot: 8, path: 'RLRL', title: '吹き抜けのリビング', line: '吹き抜けで明るい。冬の暖房費は、ほかの世界より少し高い。', num: '+8千円', sub: '冬の暖房費/月', spec: { roof: 'box', wall: C.mint, roofc: C.ink, floors: 2, carport: 1, lit: true, tree: true, carColors: [C.purple] } },
  { lot: 9, path: 'RRLL', title: '設計を待つあいだに', line: 'プランを待っているうちに土地の期限が来た。半年おくれで着工。', num: '+6か月', sub: '着工', spec: { roof: 'box', wall: C.yellow, roofc: C.brown, floors: 2, carport: 1, lit: true, carColors: [C.blue] } },
  { lot: 10, path: 'RRLR', title: '畑とうさぎの庭', line: '外構も戻して、庭に畑。うさぎが毎朝、土をほる。', num: '月13.8万', sub: '返済', spec: { roof: 'gable', wall: C.wood, wallTex: 'wood', roofc: C.green, floors: 2, carport: 1, lit: true, rabbit: true, fence: true, carColors: [C.red] } },
  { lot: 11, path: 'LRLL', detail: true, title: '月末の仮契約', line: '150万円分のおまけで、月末に仮契約。契約のあとに増えていった。', num: '+380万', sub: '契約後の増額', tally: 19, spec: { roof: 'box', wall: C.brick, wallTex: 'brick', roofc: C.ink, floors: 2, carport: 2, lit: true, tree: true, carColors: [C.gray, C.blue] },
    rows: [['契約後の増額', '+380万円'], ['契約後の打ち合わせ', '19回'], ['毎月の返済（35年・簡易計算）', '14.3万円'], ['担当の本音', '月末のノルマまで、あと1棟だった']] },
  { lot: 12, path: '', graft: { at: 0, label: 'いまは建てない（賃貸で1年）' }, title: 'ようす見の1年', line: '2択のどちらも選ばず、賃貸でもう1年。区画は、まだ空いている。', num: '0円', sub: '借入', spec: { fate: 'pause', sign: 'ようす見' } },
  { lot: 13, path: 'LRLR', title: '二世帯になった', line: '親と住むことにして、玄関をふたつ。子どもはおばあちゃんっ子。', num: '玄関2つ', sub: '', spec: { roof: 'gable', wall: C.cream, roofc: C.purple, floors: 2, carport: 2, lit: true, tree: true, carColors: [C.green, C.red] } },
  { lot: 14, path: 'RRRR', title: '軒のある木の家', line: '予算のまま、勾配屋根。外構は休みの日に、ふたりで少しずつ。', num: '月12.6万', sub: '返済', spec: { roof: 'gable', wall: C.wood, wallTex: 'wood', roofc: C.brown, floors: 2, carport: 0, gravel: true, lit: true, tree: true, fence: true } },
  { lot: 15, path: 'RRRL', detail: true, title: '2月の朝、足もとが冷たい', line: 'わが家とほとんど同じ。ちがうのは、南の窓のガラスだけ。', num: '14℃', sub: '2月の朝', spec: { roof: 'eave', hx: 240, wall: '#FFFFFF', roofc: C.wood, floors: 2, carport: 0, gravel: true, lit: true, cold: true, fence: true, carColors: [C.orange] },
    rows: [['2月の朝の室温', '14℃'], ['毎月の返済（35年・簡易計算）', '12.8万円'], ['南の窓', '標準のガラスで大きく'], ['ゆうが見た投稿', 'この世界のふたりのものだった']] },
  { lot: 16, path: 'LRRL', title: '転勤で、空き家に', line: '住んで8か月で転勤。カーテンのない窓が、夜はまっくら。', num: '空き家', sub: '', spec: { fate: 'vacant', roof: 'box', wall: '#FFFFFF', roofc: C.ink, floors: 2, carport: 1, lit: false, carColors: [C.gray] } }
];
// 見ていない枝（2択のうち、どの世界にもならなかった組み合わせ）
const UNSEEN = ['LRRR', 'RLRR'];
