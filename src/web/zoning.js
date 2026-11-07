/* ゆくすいえ　間取りの絵（ゾーニング図）v1 — docs/LAYOUT_RULES_v1.md
 * 決まり【人間・作り手の知見】：南向き。LDK は南、玄関は東か東南、水回りは北に一列、LDK の型は直線・L・田の字、
 * 水回りが多いときはトイレだけ玄関側、1階に主寝室のときは LDK を縦長にして隣に主寝室、階段は描かない（ホールとして曖昧に）。
 * 2階は主寝室 → 子ども部屋 → 余りに収納とトイレ。
 * このファイルは「絵だけ」：設計担当の案（部屋の一覧）を読むだけで、金額・延床・記録には何も書き戻さない。
 * 畳数の字は、案の部屋の大きさをそのまま出す（ほかの画面の数字とそろえる）。図の寸法はゾーニングの目安。 */

// 元に戻すスイッチ：'v1'＝新しい絵／'old'＝以前の絵（scenes.js の zoningSVG が、この1つの値で切り替える）
export const ZONING_STYLE = 'v1';

const COL = { main: '#FBEFC4', tatami: '#DDE7B8', water: '#D5EBF4', other: '#ECEAE5', priv: '#F7E4DA' };
const INK = '#1E2B36', INK2 = '#6B7680';
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// 会社ごとの癖（LAYOUT_RULES_v1 の4.6）：好む型と、LDK の中の並びの左右。エンジンはこの値を読まない
// 同じ型を好む会社どうし（A と C、B と D）は、LDK の中の並びを左右逆にして、2社を並べたときに見た目が必ず違うようにする
const STYLE = {
  A: { type: 'L', flip: false, entrance: 'SE', grow: 1, tano: 'kd' },
  B: { type: 'straight', flip: false, entrance: 'E', grow: 0, tano: 'tk' },
  C: { type: 'L', flip: true, entrance: 'E', grow: 0, tano: 'kd' },
  D: { type: 'straight', flip: true, entrance: 'E', grow: 0, tano: 'tk' },
};

// 案の部屋の一覧から、図の選びものを決める（読むだけ）
const has = (rooms, re, floor) => rooms.some(r => re.test(r.name) && (floor == null || r.floor === floor));
const sizeOf = (rooms, re, floor) => rooms.filter(r => re.test(r.name) && (floor == null || r.floor === floor)).reduce((a, r) => a + (+r.size || 0), 0);
export const WANT_KEYS = [
  { key: '畳スペース', re: /和室|畳|客間/ },
  { key: '書斎', re: /書斎|ワーク|スタディ|在宅/ },
  { key: 'パントリー', re: /パントリー/ },
  { key: 'ランドリー', re: /ランドリー|室内干し|洗濯/ },
];
export function wantsOf(plans = []) {
  const set = new Set();
  plans.filter(Boolean).forEach(p => (p.rooms || []).forEach(r => WANT_KEYS.forEach(k => { if (k.re.test(r.name)) set.add(k.key); })));
  return [...set];
}

function paramsOf(plan, co) {
  const rooms = (plan?.rooms || []).map(r => ({ ...r, name: String(r.name || '') }));
  const st = STYLE[co] || STYLE.B;
  const tatami = has(rooms, /和室|畳|客間/, 1);
  const masterRoom = rooms.find(r => /主寝室|寝室/.test(r.name));
  const master1f = !!masterRoom && masterRoom.floor === 1;
  const toilets1 = rooms.filter(r => /トイレ/.test(r.name) && r.floor === 1).length;
  const washes1 = rooms.filter(r => /洗面/.test(r.name) && r.floor === 1).length;
  const laundry1 = has(rooms, /ランドリー|室内干し|洗濯/, 1);
  const pantry = has(rooms, /パントリー/, 1);
  const shoes = has(rooms, /玄関収納|シューズ/, 1);
  const ldk = sizeOf(rooms, /LDK|リビング|ダイニング|キッチン/, 1) || 16;
  const kids = rooms.filter(r => /子ども|子供|こども/.test(r.name)).map(r => +r.size || 4.5);
  const f2 = rooms.filter(r => r.floor === 2);
  const extras2 = f2.filter(r => /書斎|ワーク|スタディ|納戸|趣味|室内干し|ランドリー/.test(r.name)).map(r => ({ name: r.name.replace(/ルーム$/, ''), size: +r.size || 3 }));
  const famCl = has(rooms, /ファミリー|家族|ウォークイン|WIC/);
  const toilet2 = has(rooms, /トイレ/, 2);
  const a1 = rooms.filter(r => r.floor === 1).reduce((a, r) => a + (+r.size || 0), 0), a2 = f2.reduce((a, r) => a + (+r.size || 0), 0);
  // 決まりで組めない部屋（1階の、型にない個室など）
  const odd = rooms.filter(r => r.floor === 1 && !/LDK|リビング|ダイニング|キッチン|和室|畳|客間|主寝室|寝室|トイレ|洗面|浴室|風呂|脱衣|ランドリー|室内干し|洗濯|パントリー|玄関|シューズ|収納|クローゼット|WIC|ホール|階段|廊下/.test(r.name)).map(r => r.name);
  return {
    type: tatami ? 'tanoji' : st.type, flip: st.flip, tano: st.tano, entrance: st.entrance, grow: st.grow,
    master1f, master: master1f ? 0 : (+masterRoom?.size || 6), masterSize: +masterRoom?.size || 6,
    kids, extras2, famCl, toilet2, pantry, shoes, ldk, tatamiSize: sizeOf(rooms, /和室|畳|客間/, 1) || 4.5,
    toiletOut: toilets1 > 1 || washes1 > 1 || laundry1, laundry1,
    partial: a2 > 0 && a2 < a1 * 0.75, a1, a2, odd, rooms,
  };
}

const R = (n, x, y, w, h, z, o = {}) => ({ n, x, y, w, h, z, ...o });

// ---- 1階 ----
function floor1Std(p) { // L型・田の字型（LDK は南西、東の列に玄関とホール、北に水回り）
  const N = 2.5, D = 8, rs = [], notes = [];
  const water = ['浴室', '洗面'];
  if (!p.toiletOut) water.push('トイレ');
  if (p.laundry1) water.push('ランドリー');
  const wid = { 浴室: 2, 洗面: 2, トイレ: 1, ランドリー: 2 };
  let wx = 0;
  for (const w of water) { const ww = wid[w] || 1.5; if (wx + ww > 6) { notes.push(w); continue; } rs.push(R(w, wx, 0, ww, N, 'water')); wx += ww; }
  if (wx < 6) rs.push(R('収納', wx, 0, 6 - wx, N, 'other'));
  rs.push(R('ホール', 6, 0, 2, N, 'other'));
  if (p.entrance === 'SE') {
    if (p.toiletOut) rs.push(R('ホール', 6, N, 2, 1.5, 'other'), R('トイレ', 6, N + 1.5, 2, 1, 'water'), R('玄関', 6, 5, 2, 3, 'other'));
    else rs.push(R('ホール', 6, N, 2, 2.5, 'other'), R('玄関', 6, 5, 2, 3, 'other'));
  } else {
    if (p.toiletOut) rs.push(R('ホール', 6, N, 2, 1.5, 'other'), R('玄関', 6, 4, 2, 2, 'other'), R('トイレ', 6, 6, 2, 1, 'water'), R(p.shoes ? 'シューズ収納' : '収納', 6, 7, 2, 1, 'other'));
    else rs.push(R('ホール', 6, N, 2, 1.5, 'other'), R('玄関', 6, 4, 2, 2, 'other'), R(p.shoes ? 'シューズ収納' : '収納', 6, 6, 2, 2, 'other'));
  }
  const by = N, bh = D - N;
  const ldk = [];
  // 田の字型は2通り：kd＝北にキッチン・ダイニング、南にリビング・畳／tk＝北に畳・キッチン、南にリビング・ダイニング（畳はリビングの隣）
  if (p.type === 'tanoji' && p.tano === 'tk') ldk.push(R('畳', 0, by, 3, 2.5, 'tatami', { jo: p.tatamiSize }), R('キッチン', 3, by, 3, 2.5, 'main'), R('リビング', 0, by + 2.5, 3, bh - 2.5, 'main'), R('ダイニング', 3, by + 2.5, 3, bh - 2.5, 'main'));
  else if (p.type === 'tanoji') ldk.push(R('キッチン', 0, by, 3, 2.5, 'main'), R('ダイニング', 3, by, 3, 2.5, 'main'), R('リビング', 0, by + 2.5, 3, bh - 2.5, 'main'), R('畳', 3, by + 2.5, 3, bh - 2.5, 'tatami', { jo: p.tatamiSize }));
  else ldk.push(R('キッチン', 0, by, 2.5, 2.5, 'main'), R('ダイニング', 2.5, by, 2.5, 2.5, 'main'), R('リビング', 0, by + 2.5, 6, bh - 2.5, 'main', { poly: [[0, by + 2.5], [5, by + 2.5], [5, by], [6, by], [6, D], [0, D]] }));
  if (p.pantry) { const k = ldk.find(r => r.n === 'キッチン'); const pw = k.w >= 2.5 ? 1 : 1.5; ldk.push(R('パントリー', k.x, k.y, pw, k.h, 'other')); k.x += pw; k.w -= pw; }
  if (p.flip) mirror(ldk, 0, 6);
  rs.push(...ldk);
  return { W: 8, D, rooms: rs, notes, ldk: { x: 0, y: by, w: 6, h: bh } };
}
function floor1Straight(p) { // 直線型：南側の全部が LDK、玄関は東の真ん中、北に水回り
  const rs = [];
  rs.push(R('浴室', 0, 0, 2, 2.5, 'water'), R('洗面', 2, 0, 2, 2.5, 'water'), R(p.toiletOut ? '収納' : 'トイレ', 4, 0, 1, 2.5, p.toiletOut ? 'other' : 'water'), R(p.laundry1 ? 'ランドリー' : '収納', 5, 0, 1, 2.5, p.laundry1 ? 'water' : 'other'), R('ホール', 6, 0, 2, 2.5, 'other'));
  if (p.toiletOut) rs.push(R(p.pantry ? 'パントリー' : 'ファミリー収納', 0, 2.5, 3, 1.5, 'other'), R('トイレ', 3, 2.5, 1, 1.5, 'water'), R('ホール', 4, 2.5, 2, 1.5, 'other'), R('玄関', 6, 2.5, 2, 1.5, 'other'));
  else rs.push(R(p.pantry ? 'パントリー・収納' : 'ファミリー収納', 0, 2.5, 4, 1.5, 'other'), R('ホール', 4, 2.5, 2, 1.5, 'other'), R('玄関', 6, 2.5, 2, 1.5, 'other'));
  const ldk = [R('リビング', 0, 4, 4, 4, 'main'), R('ダイニング', 4, 4, 2, 4, 'main'), R('キッチン', 6, 4, 2, 4, 'main')];
  if (p.flip) mirror(ldk, 0, 8);
  rs.push(...ldk);
  return { W: 8, D: 8, rooms: rs, notes: [], ldk: { x: 0, y: 4, w: 8, h: 4 } };
}
function floor1Master(p) { // 1階に主寝室：LDK を縦長（北から K・D・L）、隣の南に主寝室、残りに水回りを小さめに
  const rs = [];
  rs.push(R('浴室', 0, 0, 2, 2, 'water'), R('洗面', 2, 0, 2, 2, 'water'), R('トイレ', 4, 0, 1, 2, 'water'), R('収納', 5, 0, 3, 2, 'other'), R('ホール', 8, 0, 2, 3, 'other'));
  const ldk = [R('キッチン', 0, 2, 4.5, 1.5, 'main'), R('ダイニング', 0, 3.5, 4.5, 1.5, 'main'), R('リビング', 0, 5, 4.5, 3, 'main')];
  rs.push(...ldk, R('ホール', 4.5, 2, 3.5, 2, 'other'), R('主寝室', 4.5, 4, 3.5, 4, 'priv', { jo: p.masterSize }), R('玄関', 8, 3, 2, 2, 'other'), R('WIC', 8, 5, 2, 3, 'other'));
  return { W: 10, D: 8, rooms: rs, notes: [], ldk: { x: 0, y: 2, w: 4.5, h: 6 }, msg: '水回りは、要望より少し小さめにまとめています' };
}
function mirror(list, x0, x1) {
  list.forEach(r => { r.x = x0 + x1 - (r.x + r.w); if (r.poly) r.poly = r.poly.map(([a, b]) => [x0 + x1 - a, b]); });
}

// ---- 2階 ----
function floor2(p) {
  const W = 8, D = 8, N = 2.5, depth = 4, y0 = D - depth, rs = [], dropped = [];
  const x0 = p.master1f || p.partial ? 2 : 0; // 1階が広い・部分二階のときは、2階を小さく（西の2マスを空ける）
  const row = [];
  if (p.master) row.push({ n: '主寝室', jo: p.master });
  p.kids.forEach((k, i) => row.push({ n: p.kids.length === 1 ? '子ども部屋' : `子ども部屋${'①②③④'[i] || ''}`, jo: k }));
  const extras = [...p.extras2];
  // 南の帯に、主寝室と子ども部屋を並べる。幅が足りなければ、全体を少しずつ縮める（ゾーニングの目安）
  const wantW = r => Math.max(1.5, Math.ceil(r.jo * 2 / depth * 2) / 2);
  let ws = row.map(wantW), sum = ws.reduce((a, b) => a + b, 0), avail = W - x0;
  while (row.length && sum > avail && row.length > 1 && ws.some(w => w > 2)) { const i = ws.indexOf(Math.max(...ws)); ws[i] -= 0.5; sum -= 0.5; }
  while (sum > avail && row.length) { const r = row.pop(); dropped.push(r.n); sum -= ws.pop(); }
  let sx = x0;
  row.forEach((r, i) => { rs.push(R(r.n, sx, y0, ws[i], depth, 'priv', { jo: r.jo })); sx += ws[i]; });
  const left = W - sx;
  if (left >= 2 && extras.length) { const e = extras.shift(); rs.push(R(e.name, sx, y0, left, depth, 'priv', { jo: e.size })); }
  else if (left >= 1.5) rs.push(R('納戸', sx, y0, left, depth, 'other'));
  else if (left > 0 && rs.length) { const last = rs[rs.length - 1]; last.w += left; }
  // 中の帯：主寝室の上にクローゼット、残りはホール
  const zoneOf = n => /室内干し|ランドリー/.test(n) ? 'water' : 'priv';
  // 北の帯：1階の水回りの上に洗面・トイレ、残りに要望の部屋と収納。東の端はホール（階段のあたり）
  let nx = x0;
  rs.push(R('洗面', nx, 0, 2, N, 'water')); nx += 2;
  if (p.toilet2) { rs.push(R('トイレ', nx, 0, 1, N, 'water')); nx += 1; }
  const rest = [];
  for (const e of extras) { const ww = Math.min(2, 6 - nx); if (ww < 1) { rest.push(e); continue; } rs.push(R(e.name, nx, 0, ww, N, zoneOf(e.name), { jo: e.size })); nx += ww; }
  if (nx < 6) rs.push(R('収納', nx, 0, 6 - nx, N, 'other'));
  rs.push(R('ホール', 6, 0, 2, N, 'other'));
  // 中の帯：主寝室の上にクローゼット。北の帯に入らなかった要望の部屋は、ここに置き、残りをホールに（ホールは2マス以上残す）
  const mid = y0 - N, m = rs.find(r => r.n === '主寝室');
  let mx = x0;
  if (m) { rs.push(R(p.famCl ? 'ファミリー収納' : 'WIC', m.x, N, m.w, mid, 'other')); mx = m.x + m.w; }
  for (const e of rest) { if (W - mx - 2 >= 2) { rs.push(R(e.name, mx, N, 2, mid, zoneOf(e.name), { jo: e.size })); mx += 2; } else dropped.push(e.name); }
  rs.push(R('ホール', mx, N, W - mx, mid, 'other'));
  return { W, D, rooms: rs, x0, dropped };
}

// 縦に並んだホールを1つにまとめる（同じ幅・同じ列）
function merge(rs) {
  let ch = true;
  while (ch) {
    ch = false;
    for (const a of rs) {
      for (const b of rs) {
        if (a === b || a.n !== 'ホール' || b.n !== 'ホール' || a.poly || b.poly) continue;
        if (Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.w - b.w) < 1e-9 && Math.abs(a.y + a.h - b.y) < 1e-9) { a.h += b.h; rs.splice(rs.indexOf(b), 1); ch = true; break; }
      }
      if (ch) break;
    }
  }
  return rs;
}

// 図の組み立て（データだけ。テストからも呼ぶ）
export function layoutOf(plan, { co = 'B', wants = [], form } = {}) {
  const p = paramsOf(plan, co);
  if (form) p.partial = form === 'partial'; // 3Dの家の形（parts.js の formOf）と同じ判定を、呼ぶ側から受け取る
  let fallback = false;
  if (p.odd.length >= 2) fallback = true; // 決まりで組めない部屋が多いときは、基本形を出す（LAYOUT_RULES_v1 の2.6）
  const q = fallback ? { ...p, type: 'L', master1f: false, master: p.masterSize } : p;
  const f1 = q.master1f ? floor1Master(q) : q.type === 'straight' ? floor1Straight(q) : floor1Std(q);
  const f2 = floor2(q);
  merge(f1.rooms); merge(f2.rooms);
  const inPlan = wantsOf([plan]);
  const missing = [...new Set([...wants.filter(k => !inPlan.includes(k)), ...f1.notes, ...f2.dropped, ...(fallback ? [] : p.odd)])];
  return { f1, f2, p: q, fallback, missing, msg: f1.msg || '' };
}

// 決まりの検査（LAYOUT_RULES_v1 の6。コードで数える）
export function checkLayout(L) {
  const errs = [], f1 = L.f1, f2 = L.f2, D = f1.D;
  const by = n => f1.rooms.filter(r => r.n === n);
  const main = f1.rooms.filter(r => r.z === 'main');
  if (!main.some(r => Math.abs(r.y + r.h - D) < 1e-9)) errs.push('LDK が南に面していない');
  const ent = by('玄関')[0];
  if (!ent || ent.x + ent.w < f1.W - 1e-9) errs.push('玄関が東にない');
  const wet = f1.rooms.filter(r => /浴室|洗面/.test(r.n));
  if (wet.some(r => r.y > 0.01)) errs.push('浴室・洗面が北の帯にない');
  if (!f2.rooms.length || (L.p.master && !f2.rooms.some(r => r.n === '主寝室'))) errs.push('2階に主寝室がない');
  return errs;
}

// ---- 描画 ----
const S = 36; // 1マス（910mm）を何pxで描くか
function floorSVG(f, title, ox, oy, scale) {
  const k = scale, o = [];
  o.push(`<g transform="translate(${ox},${oy})"><text x="0" y="-12" font-size="17" font-weight="700" fill="${INK}">${title}</text>`);
  for (const r of f.rooms) {
    if (r.poly) o.push(`<polygon points="${r.poly.map(([a, b]) => `${(a * S * k).toFixed(1)},${(b * S * k).toFixed(1)}`).join(' ')}" fill="${COL[r.z]}" stroke="${INK}" stroke-width="1.1"/>`);
    else o.push(`<rect x="${(r.x * S * k).toFixed(1)}" y="${(r.y * S * k).toFixed(1)}" width="${(r.w * S * k).toFixed(1)}" height="${(r.h * S * k).toFixed(1)}" fill="${COL[r.z]}" stroke="${INK}" stroke-width="1.1"/>`);
  }
  for (const r of f.rooms) {
    const cw = r.w * S * k, chh = r.h * S * k;
    let cx = (r.x + r.w / 2) * S * k, cy = (r.y + r.h / 2) * S * k;
    if (r.poly) { cx = (r.x + r.w * 0.45) * S * k; cy = (r.y + r.h * 0.6) * S * k; }
    const small = cw < 52 || chh < 46;
    let fs = small ? 11.5 : 15;
    let nm = r.n.replace('ウォークインクローゼット', 'WIC').replace('ファミリークローゼット', 'ファミリー収納');
    const cap = Math.max(1, Math.floor((cw - 6) / fs));
    let lines = [nm];
    if ([...nm].length > cap) {
      if (/^子ども部屋/.test(nm)) lines = ['子ども', nm.slice(3)];
      else { const h = Math.ceil([...nm].length / 2); lines = [nm.slice(0, h), nm.slice(h)]; }
      fs = Math.min(fs, Math.max(9.5, (cw - 6) / Math.max(...lines.map(l => [...l].length))));
    }
    const jo = r.jo && !small ? `約${r.jo}畳` : '';
    const y0 = cy - (lines.length - 1) * fs * 0.6 - (jo ? 7 : 0);
    lines.forEach((l, i) => o.push(`<text x="${cx.toFixed(1)}" y="${(y0 + i * fs * 1.2).toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-size="${fs.toFixed(1)}" font-weight="700" fill="${INK}">${esc(l)}</text>`));
    if (jo) o.push(`<text x="${cx.toFixed(1)}" y="${(y0 + (lines.length - 1) * fs * 1.2 + 17).toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-size="11.5" fill="${INK2}">${jo}</text>`);
  }
  const x0 = (f.x0 || 0) * S * k;
  o.push(`<rect x="${x0}" y="0" width="${((f.W - (f.x0 || 0)) * S * k).toFixed(1)}" height="${(f.D * S * k).toFixed(1)}" fill="none" stroke="${INK}" stroke-width="3"/>`);
  if (f.ldk) {
    const l = f.ldk;
    o.push(`<rect x="${(l.x * S * k).toFixed(1)}" y="${(l.y * S * k).toFixed(1)}" width="${(l.w * S * k).toFixed(1)}" height="${(l.h * S * k).toFixed(1)}" fill="none" stroke="${INK}" stroke-width="2.4"/>`);
    if (f.ldkJo) o.push(`<text x="${(l.x * S * k + 6).toFixed(1)}" y="${((l.y + l.h) * S * k - 8).toFixed(1)}" font-size="12" font-weight="700" fill="${INK}">LDK 約${f.ldkJo}畳</text>`);
  }
  o.push('</g>');
  return o.join('');
}

// 1つの入口：案（plan）から図を描く。stack＝1階と2階を縦に（印刷）
export function drawZoning(plan, { stack = false, co = 'B', wants = [], form } = {}) {
  if (!plan) return skeletonSVG(stack);
  const L = layoutOf(plan, { co, wants, form });
  const k = 1; // 図は枠いっぱいに縮むので、会社ごとの外形の大小は付けない（付けると、かえって小さく見える）
  L.f1.ldkJo = L.p.ldk;
  const w1 = L.f1.W * S * k, w2 = L.f2.W * S * k, h = L.f1.D * S * k, gap = 46;
  const noteLines = [];
  if (L.fallback) noteLines.push('ご要望のすべては、この図には入れきれていません');
  if (L.msg) noteLines.push(L.msg);
  if (L.missing.length) noteLines.push(`図に入らなかった要望：${L.missing.join('、')}`);
  const compass = (x, y) => `<g transform="translate(${x},${y})"><line x1="0" y1="-34" x2="0" y2="-8" stroke="${INK}" stroke-width="1.6"/><path d="M-5,-12 L0,-2 L5,-12z" fill="${INK}"/><text x="0" y="12" text-anchor="middle" font-size="13" font-weight="700" fill="${INK}">南</text></g>`;
  let body = '', W, H;
  if (stack) {
    body += floorSVG(L.f1, '1階', 0, 26, k);
    body += `<text x="0" y="${26 + h + 16}" font-size="11.5" fill="${INK2}">道路（南）</text>`;
    body += floorSVG(L.f2, '2階', 0, 26 + h + 52, k);
    W = Math.max(w1, w2) + 40; H = 26 + h * 2 + 52 + 14;
    body += compass(Math.max(w1, w2) + 22, 26 + h);
  } else {
    body += floorSVG(L.f1, '1階', 0, 26, k);
    body += floorSVG(L.f2, '2階', w1 + gap, 26, k);
    body += `<text x="0" y="${26 + h + 18}" font-size="11.5" fill="${INK2}">道路（南）</text>`;
    body += compass(w1 + gap + w2 + 26, 26 + h - 4);
    W = w1 + gap + w2 + 50; H = 26 + h + 24;
  }
  noteLines.forEach((t, i) => { body += `<text x="0" y="${H + 16 + i * 18}" font-size="12.5" fill="${i === 0 && L.fallback ? INK : '#B4561A'}">${esc(t)}</text>`; });
  H += noteLines.length ? 14 + noteLines.length * 18 : 4;
  return `<svg viewBox="-4 -4 ${(W + 8).toFixed(0)} ${(H + 8).toFixed(0)}" class="zsvg zv1" role="img" aria-label="間取りのゾーニング図">${body}</svg>`;
}

function skeletonSVG(stack) {
  const s = 8 * S, gap = 46, box = (x, y) => `<rect x="${x}" y="${y}" width="${s}" height="${s}" rx="6" fill="#F4F1EA" stroke="rgba(30,43,54,.15)"/>`;
  return stack
    ? `<svg viewBox="-4 -4 ${s + 8} ${s * 2 + 60}" class="zsvg zv1">${box(0, 0)}${box(0, s + 48)}</svg>`
    : `<svg viewBox="-4 -4 ${s * 2 + gap + 8} ${s + 8}" class="zsvg zv1">${box(0, 0)}${box(s + gap, 0)}</svg>`;
}
