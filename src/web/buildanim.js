/* ゆくすいえ　着工から施主検査までの早送り（TESTPLAY T11・T12）
 * 静止画のコマ送りではなく、職人と重機が動く絵。drawBuild(w, t) は t 秒の絵を返す（決定論的。同じ t なら同じ絵）
 * 家の大きさと屋根の形、外壁の色、外構の範囲は、その世界の案のデータから */
const I = window.ISO;
const P = I.P;
export const DUR = 16;
// 場面の区切り（秒）と、絵の下に出す一行
export const PHASES = [
  [0, '地鎮祭と地縄張り'],
  [1.6, '基礎：掘って、鉄筋を組み、コンクリートを流す'],
  [5.2, '上棟：柱と梁を組み、屋根をかける'],
  [9.6, '外まわり：足場をかけ、外壁と窓を入れる'],
  [12.6, '内装と施主検査：足場が外れ、家族が中を確かめる'],
];
export const BUILD = { t0: null, raf: 0 };
export const phaseAt = t => { let k = 0; for (let i = 0; i < PHASES.length; i++) if (t >= PHASES[i][0]) k = i; return k; };

const INK = '#1E2B36';
const f1 = v => v.toFixed(1);
const pts = a => a.map(p => p.map(f1).join(',')).join(' ');
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const prog = (t, a, b) => clamp((t - a) / (b - a)); // a〜b秒の進み具合 0..1
const ease = x => x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
const poly = (a, fill, stroke = INK, sw = 1, extra = '') => `<polygon points="${pts(a)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round" ${extra}/>`;
const line = (a, b, stroke = INK, sw = 1, extra = '') => { const p = P(...a), q = P(...b); return `<line x1="${f1(p[0])}" y1="${f1(p[1])}" x2="${f1(q[0])}" y2="${f1(q[1])}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" ${extra}/>`; };
// 箱（見える面だけ：上・y+d の面（左）・x+w の面（右））。奥の面は描かない
function box(x, y, z, w, d, h, top, left, right, sw = 1, extra = '') {
  return poly([P(x, y + d, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x, y + d, z + h)], left, INK, sw, extra)
    + poly([P(x + w, y, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x + w, y, z + h)], right, INK, sw, extra)
    + poly([P(x, y, z + h), P(x + w, y, z + h), P(x + w, y + d, z + h), P(x, y + d, z + h)], top, INK, sw, extra);
}
// 職人・家族の人形：歩く（上下に揺れる）、打つ（腕を振る）
function person(x, y, z, t, { color = '#F2C230', helmet = true, act = 'stand', ph = 0, k = 1 } = {}) {
  const bob = act === 'walk' ? Math.abs(Math.sin((t + ph) * 9)) * 0.8 : 0;
  const f = P(x, y, z + bob), hd = P(x, y, z + bob + 9 * k);
  const sh = [hd[0], hd[1] + 2.6 * k];
  let s = `<ellipse cx="${f1(f[0])}" cy="${f1(f[1] + bob)}" rx="${2.6 * k}" ry="${1.2 * k}" fill="rgba(30,43,54,.18)"/>`;
  s += `<line x1="${f1(f[0])}" y1="${f1(f[1])}" x2="${f1(sh[0])}" y2="${f1(sh[1] + 1.4 * k)}" stroke="${color}" stroke-width="${2.6 * k}" stroke-linecap="round"/>`;
  const sw = act === 'hammer' ? Math.sin((t + ph) * 14) * 0.9 : act === 'walk' ? Math.sin((t + ph) * 9) * 0.5 : 0.3;
  const ax = sh[0] + Math.cos(-0.6 + sw) * 3.4 * k, ay = sh[1] + 1.6 * k + Math.sin(-0.6 + sw) * 3.4 * k;
  s += `<line x1="${f1(sh[0])}" y1="${f1(sh[1] + 1.4 * k)}" x2="${f1(ax)}" y2="${f1(ay)}" stroke="${INK}" stroke-width="${0.9 * k}" stroke-linecap="round"/>`;
  if (act === 'hammer') s += `<rect x="${f1(ax - 0.8)}" y="${f1(ay - 1.6)}" width="1.6" height="1.6" fill="${INK}"/>`;
  s += `<circle cx="${f1(hd[0])}" cy="${f1(hd[1])}" r="${1.9 * k}" fill="#FFF3E6" stroke="${INK}" stroke-width="${0.6 * k}"/>`;
  if (helmet) s += `<path d="M${f1(hd[0] - 2.1 * k)} ${f1(hd[1] - 0.2)} a${2.1 * k} ${2.1 * k} 0 0 1 ${4.2 * k} 0z" fill="#FFFFFF" stroke="${INK}" stroke-width="${0.5 * k}"/>`;
  return s;
}
// ショベルカー：腕が掘る
function excavator(x, y, t) {
  let s = box(x, y, 0, 12, 7, 2.2, '#5B6168', '#4A4F57', '#3E4148', 0.8);
  s += box(x + 2, y + 1, 2.2, 7, 5, 5, '#F7D774', '#F2C230', '#D9A91C', 0.8);
  const a = -0.4 + Math.sin(t * 3) * 0.5, j = [x - 2, y + 3.5, 8], e = [j[0] - 9 * Math.cos(a), j[1], j[2] - 9 * Math.sin(-a) - 2];
  s += line([x + 3, y + 3.5, 6.5], j, '#D9A91C', 2.2) + line(j, e, '#D9A91C', 1.8);
  const b = P(...e); s += `<path d="M${f1(b[0])} ${f1(b[1])} l-2.6 1.2 l1 2.6 l3 -0.6z" fill="#3E4148" stroke="${INK}" stroke-width=".6"/>`;
  return s;
}
// ミキサー車：ドラムが回る
function mixer(x, y, t) {
  let s = box(x, y, 1.6, 6, 7, 6, '#E6EEF2', '#C9D6DD', '#AFC1CA', 0.8) + box(x + 6, y, 1.6, 14, 7, 1.4, '#9AA4AC', '#8A939A', '#7A838A', 0.8);
  const c = P(x + 13, y + 3.5, 7.5); const r = (t * 220) % 360;
  s += `<ellipse cx="${f1(c[0])}" cy="${f1(c[1])}" rx="7.5" ry="4.6" fill="#F4EFE6" stroke="${INK}" stroke-width=".8"/>`;
  s += `<g transform="rotate(${f1(r)} ${f1(c[0])} ${f1(c[1])})"><line x1="${f1(c[0] - 6)}" y1="${f1(c[1])}" x2="${f1(c[0] + 6)}" y2="${f1(c[1])}" stroke="#E8701F" stroke-width="1.4"/></g>`;
  [[x + 3, y + 7], [x + 16, y + 7]].forEach(([wx, wy]) => { const q = P(wx, wy, 1.2); s += `<circle cx="${f1(q[0])}" cy="${f1(q[1])}" r="1.8" fill="${INK}"/>`; });
  return s;
}
// トラック（木材を積む）
function lumberTruck(x, y, n) {
  let s = box(x + 14, y, 1.6, 6, 7, 6, '#E6EEF2', '#C9D6DD', '#AFC1CA', 0.8) + box(x, y, 1.6, 14, 7, 1.4, '#9AA4AC', '#8A939A', '#7A838A', 0.8);
  for (let i = 0; i < n; i++) s += box(x + 0.5, y + 0.6 + (i % 3) * 2.1, 3 + Math.floor(i / 3) * 1.2, 13, 1.8, 1.1, '#E8CFA6', '#D6B98A', '#C9A878', 0.5);
  [[x + 3, y + 7], [x + 17, y + 7]].forEach(([wx, wy]) => { const q = P(wx, wy, 1.2); s += `<circle cx="${f1(q[0])}" cy="${f1(q[1])}" r="1.8" fill="${INK}"/>`; });
  return s;
}
// 木の骨組み：910mmの格子（この図では約5単位）に沿って、柱・梁・筋交い・垂木
function frame(W, D, H, roof, p) {
  const GX = Math.max(6, Math.round(W / 5)), GY = Math.max(5, Math.round(D / 5));
  const wood = '#C9A27A', dark = '#9C7A55';
  let s = '';
  const H1 = H / 2;
  const cols = [];
  for (let i = 0; i <= GX; i++) cols.push([i * W / GX, 0], [i * W / GX, D]);
  for (let j = 1; j < GY; j++) cols.push([0, j * D / GY], [W, j * D / GY]);
  cols.push([W / 2, D / 2], [W / 4, D / 2], [3 * W / 4, D / 2]);
  cols.sort((a, b) => (a[0] + a[1]) - (b[0] + b[1])); // 奥から手前へ
  const n1 = Math.floor(cols.length * clamp(p.c1 * 1.02));
  // 2階の床梁・桁
  const beam = (z, k) => { let t = ''; const seg = [[[0, 0], [W, 0]], [[0, D], [W, D]], [[0, 0], [0, D]], [[W, 0], [W, D]], [[0, D / 2], [W, D / 2]]]; for (let j = 1; j < GX; j += 2) seg.push([[j * W / GX, 0], [j * W / GX, D]]); seg.slice(0, Math.ceil(seg.length * k)).forEach(([a, b]) => { t += line([a[0], a[1], z], [b[0], b[1], z], dark, 2.2) + line([a[0], a[1], z - 0.8], [b[0], b[1], z - 0.8], wood, 1.4); }); return t; };
  cols.slice(0, n1).forEach(([x, y]) => { s += line([x, y, 0], [x, y, H1], dark, 1.9) + line([x + 0.3, y + 0.3, 0], [x + 0.3, y + 0.3, H1], wood, 1.1); });
  if (p.b1 > 0) s += beam(H1, p.b1);
  const n2 = Math.floor(cols.length * clamp(p.c2));
  cols.slice(0, n2).forEach(([x, y]) => { s += line([x, y, H1], [x, y, H], dark, 1.9) + line([x + 0.3, y + 0.3, H1], [x + 0.3, y + 0.3, H], wood, 1.1); });
  if (p.b2 > 0) s += beam(H, p.b2);
  // 筋交い（外周の見える面の、ところどころの区画に）
  if (p.br > 0) {
    const bays = [[0, 1], [2, 3], [GX - 2, GX - 1]].filter(([a, b]) => b <= GX);
    bays.slice(0, Math.ceil(bays.length * p.br)).forEach(([a, b]) => { const xa = a * W / GX, xb = b * W / GX; s += line([xa, D, 0], [xb, D, H1], dark, 1.2) + line([xa, D, H1], [xb, D, H], dark, 1.2); });
    [[0, 1], [GY - 1, GY]].slice(0, Math.ceil(2 * p.br)).forEach(([a, b]) => { const ya = a * D / GY, yb = b * D / GY; s += line([W, ya, 0], [W, yb, H1], dark, 1.2) + line([W, ya, H1], [W, yb, H], dark, 1.2); });
  }
  // 屋根の垂木
  if (p.rf > 0) {
    const R = roof === 'gable' || roof === 'hip' ? 13 : roof === 'mane' ? 10 : 0;
    const m = Math.ceil((GX * 2 + 1) * p.rf);
    if (roof === 'gable' || roof === 'hip') {
      for (let i = 0; i <= GX * 2 && i < m; i++) { const x = i * W / (GX * 2); s += line([x, -2, H - 1], [x, D / 2, H + R], wood, 1.3) + line([x, D + 2, H - 1], [x, D / 2, H + R], dark, 1.3); }
      if (p.rf > 0.5) s += line([0, D / 2, H + R], [W, D / 2, H + R], dark, 2.4);
    } else if (roof === 'mane') {
      for (let i = 0; i <= GX * 2 && i < m; i++) { const x = i * W / (GX * 2); s += line([x, -2, H + R], [x, D + 2, H - 1], dark, 1.3); }
    } else {
      for (let i = 0; i <= GX * 2 && i < m; i++) { const x = i * W / (GX * 2); s += line([x, 0, H + 0.6], [x, D, H + 0.6], dark, 1.3); }
    }
  }
  return s;
}
function crane(x, y, t, hookTo) {
  let s = line([x, y, 0], [x, y, 76], '#D9A91C', 2.4) + line([x + 1.2, y + 1.2, 0], [x + 1.2, y + 1.2, 76], '#F2C230', 1.4);
  for (let z = 6; z < 76; z += 8) s += line([x, y, z], [x + 1.2, y + 1.2, z + 4], '#D9A91C', 0.6);
  const a = -2.2 + Math.sin(t * 0.9) * 0.55, L = 52, e = [x + L * Math.cos(a), y + L * Math.sin(a), 76];
  s += line([x, y, 76], e, '#D9A91C', 2) + line([x, y, 76], [x - 10 * Math.cos(a), y - 10 * Math.sin(a), 76], '#D9A91C', 2);
  const hz = hookTo ?? 50 + Math.sin(t * 2.2) * 8;
  s += line(e, [e[0], e[1], hz], INK, 0.6) + box(e[0] - 6, e[1] - 0.8, hz - 2.2, 12, 1.6, 1.4, '#E8CFA6', '#D6B98A', '#C9A878', 0.5);
  return s;
}
function treeG(x, y, k) { const a = P(x, y, 0), b = P(x, y, 14 * k); return `<ellipse cx="${f1(a[0])}" cy="${f1(a[1])}" rx="${f1(10 * k)}" ry="${f1(4 * k)}" fill="rgba(30,43,54,.14)"/><line x1="${f1(a[0])}" y1="${f1(a[1])}" x2="${f1(b[0])}" y2="${f1(b[1])}" stroke="#7A5A3A" stroke-width="2.6"/><circle cx="${f1(b[0])}" cy="${f1(b[1] - 8 * k)}" r="${f1(12 * k)}" fill="#7DBF62" stroke="${INK}" stroke-width="1"/>`; }

// t 秒の絵。fin は選んだ外壁の色、reduce は動きを減らす設定（場面ごとのフェードに置き換える）
export function drawBuild(w, t, fin, reduce = false) {
  if (reduce) { const k = phaseAt(t); t = Math.min(DUR, (PHASES[k + 1]?.[0] ?? DUR) - 0.05); }
  const W = 52, D = 44, H = 46, roof = w.spec.roof || 'gable';
  let back = '', mid = '', front = '';
  // 区画の地面
  const lot = [P(-20, -16), P(96, -16), P(96, 92), P(-20, 92)];
  back += poly(lot, '#F3E7CF', '#9BD27A', 2.4);
  // 道路（手前）
  back += poly([P(-40, 96), P(116, 96), P(116, 118), P(-40, 118)], '#E2D8C4', 'none', 0);
  // 地鎮祭：地縄と竹
  if (t < 2.4) {
    const o = t < 1.6 ? 1 : 1 - prog(t, 1.6, 2.4);
    back += `<g opacity="${f1(o)}">` + poly([P(0, 0), P(W, 0), P(W, D), P(0, D)], 'none', INK, 1.2, 'stroke-dasharray="4 3"');
    [[-4, -4], [W + 4, -4], [W + 4, D + 4], [-4, D + 4]].forEach(([x, y]) => { back += line([x, y, 0], [x, y, 16], '#5E9B4A', 1.8); });
    back += line([-4, D + 4, 12], [W + 4, D + 4, 12], INK, 0.6) + line([W + 4, -4, 12], [W + 4, D + 4, 12], INK, 0.6) + '</g>';
  }
  // 掘った跡
  const dig = prog(t, 2.0, 3.0);
  if (dig > 0 && t < 4.8) back += poly([P(-2, -2), P(W + 2, -2), P(W + 2, D + 2), P(-2, D + 2)], `rgba(150,120,90,${f1(0.45 * dig)})`, 'none', 0);
  // 鉄筋
  const reb = prog(t, 2.6, 3.5);
  if (reb > 0 && t < 4.6) { const n = Math.ceil(12 * reb); for (let i = 0; i <= n; i++) { const x = i * W / 12; mid += line([x, 0, 0.6], [x, D, 0.6], '#7A838A', 0.6); } for (let j = 0; j <= Math.ceil(10 * reb); j++) { const y = j * D / 10; mid += line([0, y, 0.6], [W, y, 0.6], '#7A838A', 0.6); } }
  // 型枠（木の板）とコンクリート
  const pour = prog(t, 3.6, 4.6);
  if (t >= 3.3 && t < 4.9) { const fo = t < 4.6 ? 1 : 1 - prog(t, 4.6, 4.9); mid += `<g opacity="${f1(fo)}">` + box(-1.2, -1.2, 0, W + 2.4, D + 2.4, 3.6, 'none', '#D6B98A', '#C9A878', 0.6, 'fill-opacity=".85"') + '</g>'; }
  if (pour > 0 || t >= 4.6) { const h = 3 * ease(pour || 1); mid += box(0, 0, 0, W, D, h, '#D9D5CE', '#CFCBC3', '#BDB8AF', 0.9); // 基礎の前の面にも、打ち放しの細かい筋（T12：面の塗りが欠けていた）
    if (h > 1) for (let i = 1; i < 8; i++) { mid += line([i * W / 8, D, 0.4], [i * W / 8, D, h - 0.4], 'rgba(30,43,54,.18)', 0.4) ; if (i < 6) mid += line([W, i * D / 6, 0.4], [W, i * D / 6, h - 0.4], 'rgba(30,43,54,.18)', 0.4); } }
  // 骨組み
  const fp = { c1: prog(t, 5.8, 7.0), b1: prog(t, 6.6, 7.3), c2: prog(t, 7.0, 7.9), b2: prog(t, 7.8, 8.4), br: prog(t, 7.6, 8.6), rf: prog(t, 8.2, 9.3) };
  const wallP = prog(t, 10.2, 12.2);
  if (t >= 5.8 && wallP < 1) mid += `<g transform="translate(0,-3)">${frame(W, D, H - 3, roof, fp)}</g>`;
  // 外壁：下から張られていく（選んだ色）。家の絵は完成形を、画面の下から上へ切り抜いて見せる
  if (wallP > 0) {
    const full = I.house({ x: 0, y: 0, w: W, d: D, h: H, roof, fin, stage: 4 });
    const yTop = P(0, 0, H + 20)[1], yBot = P(W, D, 0)[1] + 2, yc = yBot - (yBot - yTop) * ease(wallP);
    mid += `<clipPath id="wallclip"><rect x="-200" y="${f1(yc)}" width="400" height="${f1(yBot - yc + 4)}"/></clipPath><g clip-path="url(#wallclip)">${full}</g>`;
  }
  // 窓の明かり（内装）
  const lit = prog(t, 12.6, 13.4) * (1 - prog(t, 15.2, 16));
  if (lit > 0) { [[12, D], [30, D], [W, 14], [W, 30]].forEach(([x, y], i) => { const z0 = i % 2 ? 26 : 8; const q = x === W ? [P(W + 0.2, y - 4, z0), P(W + 0.2, y + 4, z0), P(W + 0.2, y + 4, z0 + 9), P(W + 0.2, y - 4, z0 + 9)] : [P(x - 4, D + 0.2, z0), P(x + 4, D + 0.2, z0), P(x + 4, D + 0.2, z0 + 9), P(x - 4, D + 0.2, z0 + 9)]; mid += poly(q, `rgba(242,194,48,${f1(0.55 * lit)})`, 'none', 0); }); }
  // 足場とシート
  const scIn = prog(t, 9.6, 10.1), scOut = prog(t, 12.8, 13.4);
  if (scIn > 0 && scOut < 1) {
    const o = scIn * (1 - scOut); let sc = '';
    for (let i = 0; i <= 10; i++) { const x = -3 + i * (W + 6) / 10; sc += line([x, D + 3, 0], [x, D + 3, H + 4], '#8A8F96', 0.8); }
    for (let j = 0; j <= 8; j++) { const y = -3 + j * (D + 6) / 8; sc += line([W + 3, y, 0], [W + 3, y, H + 4], '#8A8F96', 0.8); }
    for (let z = 6; z <= H + 4; z += 8) sc += line([-3, D + 3, z], [W + 3, D + 3, z], '#8A8F96', 0.8) + line([W + 3, -3, z], [W + 3, D + 3, z], '#8A8F96', 0.8);
    const sh = prog(t, 10.0, 10.4) * (1 - prog(t, 12.4, 12.8));
    sc += poly([P(-3, D + 3, 0), P(W + 3, D + 3, 0), P(W + 3, D + 3, H + 4), P(-3, D + 3, H + 4)], `rgba(220,230,236,${f1(0.5 * sh)})`, 'none', 0) + poly([P(W + 3, -3, 0), P(W + 3, D + 3, 0), P(W + 3, D + 3, H + 4), P(W + 3, -3, H + 4)], `rgba(200,214,222,${f1(0.5 * sh)})`, 'none', 0);
    front += `<g opacity="${f1(o)}">${sc}</g>`;
  }
  // 重機とトラック
  if (t >= 1.6 && t < 5.0) { const x = 112 - 44 * ease(prog(t, 1.6, 2.2)) + 44 * ease(prog(t, 4.4, 5.0)); front += excavator(x, 50, t); }
  if (t >= 3.1 && t < 5.0) { const x = 120 - 50 * ease(prog(t, 3.1, 3.6)) + 50 * ease(prog(t, 4.5, 5.0)); front += mixer(x, 70, t); }
  if (t >= 5.2 && t < 7.6) { const x = 120 - 54 * ease(prog(t, 5.2, 5.8)) + 54 * ease(prog(t, 7.0, 7.6)); front += lumberTruck(x, 74, Math.round(9 * (1 - prog(t, 5.9, 7.0)))); }
  if (t >= 5.4 && t < 9.6) { const o = prog(t, 5.4, 5.8) * (1 - prog(t, 9.2, 9.6)); front += `<g opacity="${f1(o)}">${crane(-14, 70, t)}</g>`; }
  // 職人：地面で運ぶ・打つ、骨組みの上で打つ
  const crew = [];
  if (t >= 2.4 && t < 4.8) crew.push([10 + 30 * prog(t, 2.4, 4.6), D + 6, 0, 'walk', 0], [W + 6, 12 + 20 * Math.abs(Math.sin(t * 0.8)), 0, 'walk', 1.3], [24, D - 6, 0.6, 'hammer', 0.4]);
  if (t >= 5.8 && t < 9.6) crew.push([W * 0.25, D, 20, 'hammer', 0], [W * 0.7, D, 20 + (t > 7.8 ? 21 : 0), 'hammer', 0.7], [W, D * 0.4, t > 7.9 ? 41 : 20, 'hammer', 1.1], [70 - 18 * Math.abs(Math.sin(t * 0.7)), 80, 0, 'walk', 0.2]);
  if (t >= 9.6 && t < 12.8) crew.push([W + 3, D * 0.3, 14 + (t > 11 ? 16 : 0), 'hammer', 0.3], [W * 0.5, D + 3, 6 + 16 * prog(t, 10, 12), 'hammer', 0.9]);
  if (t >= 12.8 && t < 14.4) crew.push([W + 8 + 30 * prog(t, 12.8, 14.4), D + 10, 0, 'walk', 0], [W * 0.5 + 40 * prog(t, 13, 14.4), D + 14, 0, 'walk', 0.6]);
  crew.forEach(([x, y, z, act, ph]) => { front += person(x, y, z, t, { act, ph }); });
  // 外構（その世界で選んだ範囲）
  if (t >= 13.4) {
    if (w.spec.exterior === 'full') { const k = ease(prog(t, 13.4, 14.6)); if (k > 0.02) { back += treeG(86, -8, 0.9 * k) + treeG(-12, 80, 1.0 * k); } front += poly([P(56, 50), P(96, 50), P(96, 92), P(56, 92)], `rgba(200,190,170,${f1(0.6 * prog(t, 13.4, 14))})`, 'none', 0); }
    else front += poly([P(56, 50), P(96, 50), P(96, 92), P(56, 92)], `rgba(190,185,175,${f1(0.45 * prog(t, 13.4, 14))})`, 'none', 0);
  }
  // 家族：地鎮祭で並び、施主検査で中を確かめに歩いてくる
  const fam = [['#E8701F', 0, 1], ['#1C8DCC', 4, 1], ['#E8701F', 8, 0.7], ['#1C8DCC', 11, 0.6]];
  if (t < 1.8) { const o = t < 1.4 ? 1 : 1 - prog(t, 1.4, 1.8); front += `<g opacity="${f1(o)}">` + fam.map(([c, dx, k], i) => person(14 + dx * 2, D + 16, 0, t, { color: c, helmet: false, k })).join('') + person(46, D + 16, 0, t, { color: INK, helmet: false }) + '</g>'; }
  if (t >= 14.2) { const k = ease(prog(t, 14.2, 16)); front += fam.map(([c, dx, kk], i) => person(40 + dx - 10 * k, 104 - 50 * k, 0, t, { color: c, helmet: false, act: k < 1 ? 'walk' : 'stand', ph: i * 0.3, k: kk })).join(''); }
  const minX = P(-40, 118)[0] - 10, maxX = P(116, -16)[0] + 10, minY = P(-20, -16)[1] - 96, maxY = P(116, 118)[1] + 6;
  return `<svg viewBox="${f1(minX)} ${f1(minY)} ${f1(maxX - minX)} ${f1(maxY - minY)}" xmlns="http://www.w3.org/2000/svg">${back}${mid}${front}</svg>`;
}
