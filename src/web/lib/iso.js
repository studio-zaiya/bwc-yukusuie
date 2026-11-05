/* ゆくすいえ　分譲地と家の描画（SVG・アイソメ）。外部の素材は使わない */
(function (root) {
  'use strict';
  const C30 = Math.cos(Math.PI / 6), S30 = 0.5;
  const P = (x, y, z = 0) => [(x - y) * C30, (x + y) * S30 - z];
  const pts = a => a.map(p => p.map(v => v.toFixed(1)).join(',')).join(' ');
  const poly = (a, fill, stroke = '#1E2B36', sw = 1.4, extra = '') => `<polygon points="${pts(a)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round" ${extra}/>`;
  // 暗い外壁（黒・チャコールなど）は、輪郭が線と同化しないよう、面を明るめにする（人間の回答11/6）
  const lum = hex => { const n = parseInt(String(hex).slice(1), 16); return ((n >> 16) * .299 + (n >> 8 & 255) * .587 + (n & 255) * .114) / 255; };
  const liftDark = hex => /^#[0-9a-fA-F]{6}$/.test(hex || '') && lum(hex) < 0.3 ? mix(hex, '#FFFFFF', 0.32) : hex;
  function mix(a, b, t) { const p = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; const x = p(a), y = p(b); return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join(''); }
  function shade(hex, k) { const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = n >> 8 & 255, b = n & 255; const f = v => Math.max(0, Math.min(255, Math.round(v * k))); return '#' + [f(r), f(g), f(b)].map(v => v.toString(16).padStart(2, '0')).join(''); }

  const FINISH = [
    { wall: '#F4EFE6', roof: '#4A4F57' }, { wall: '#C9A27A', roof: '#3E4148' }, { wall: '#E9E4DA', roof: '#6C5B4B' }, { wall: '#7C8A93', roof: '#2F3338' },
    { wall: '#F2E3C9', roof: '#8B5E3C' }, { wall: '#DDE6EA', roof: '#3B4A57' }, { wall: '#B98E62', roof: '#2F3338' }, { wall: '#EFE9DF', roof: '#5A6E4F' },
  ];

  // 1軒：原点(ox,oy)に、幅w×奥行きd×高さh。stage: 0 地縄 / 1 基礎 / 2 骨組み / 3 白い下地 / 4 完成 / -1 工事中止
  function house(o) {
    const { x = 0, y = 0, w = 46, d = 38, h = 40, roof = 'flat', fin = FINISH[0], stage = 4, lamp = false, eave = true, third = false, z0 = 0, form = 'full' } = o;
    // 家の形（人間の回答11/6）：総二階／部分二階（1階は総二階と同じ大きさ、2階を半分ほどにして、1階に下屋）／1階を少し引っ込めた箱（2階は総二階と同じ大きさ）
    if (form !== 'full' && stage >= 3 && !z0) return formHouse(o);
    let s = '';
    const g = (a) => a.map(([px, py, pz]) => { const q = P(x + px, y + py, pz + z0); return q; });
    if (stage <= 0) {
      s += poly(g([[0, 0, 0], [w, 0, 0], [w, d, 0], [0, d, 0]]), 'none', '#1E2B36', 1.2, 'stroke-dasharray="4 4" opacity=".7"');
      if (stage === -1) s += poly(g([[-4, -4, 0], [w + 4, -4, 0], [w + 4, d + 4, 0], [-4, d + 4, 0]]), '#D9CDB4', '#8A8478', 1, 'opacity=".9"');
      return s;
    }
    // 基礎（2階だけの箱には描かない）
    if (!z0) { s += poly(g([[0, d, 0], [w, d, 0], [w, d, 3], [0, d, 3]]), '#CFCBC3'); s += poly(g([[w, 0, 0], [w, d, 0], [w, d, 3], [w, 0, 3]]), '#BDB8AF'); }
    if (stage === 1) { s += poly(g([[0, 0, 3], [w, 0, 3], [w, d, 3], [0, d, 3]]), '#E3DFD6'); return s; }
    if (stage === 2) { // 骨組み
      const cols = [[0, 0], [w, 0], [w, d], [0, d], [w / 2, 0], [w, d / 2]];
      cols.forEach(([cx, cy]) => { const a = P(x + cx, y + cy, 3), b = P(x + cx, y + cy, h); s += `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#B88A55" stroke-width="2.2"/>`; });
      s += poly(g([[0, 0, h], [w, 0, h], [w, d, h], [0, d, h]]), 'none', '#B88A55', 2.2);
      return s;
    }
    const white = stage === 3;
    const wall = white ? '#FFFFFF' : liftDark(fin.wall), rf = white ? '#F1EEE8' : liftDark(fin.roof);
    // 見える面：南（y=d）と東（x=w）
    const wallH = roof === 'shed' ? h : h;
    s += poly(g([[0, d, 3], [w, d, 3], [w, d, h], [0, d, h]]), wall);
    s += poly(g([[w, 0, 3], [w, d, 3], [w, d, h], [w, 0, h]]), shade(wall, .86));
    const win = (a0, z0, ww, hh, lit, face = 's') => {
      const q = face === 's' ? g([[a0, d, z0], [a0 + ww, d, z0], [a0 + ww, d, z0 + hh], [a0, d, z0 + hh]]) : g([[w, a0, z0], [w, a0 + ww, z0], [w, a0 + ww, z0 + hh], [w, a0, z0 + hh]]);
      return poly(q, lit ? '#FFD98A' : (white ? '#E8EEF2' : '#A9C9DB'), '#1E2B36', 1);
    };
    s += win(w * 0.10, 4, w * 0.46, h * 0.38, lamp);
    s += win(w * 0.68, 6, w * 0.16, h * 0.26, lamp);
    s += win(w * 0.14, h * 0.6, w * 0.22, h * 0.2, lamp);
    s += win(w * 0.62, h * 0.6, w * 0.22, h * 0.2, false);
    s += win(d * 0.30, h * 0.58, d * 0.3, h * 0.2, lamp, 'e');
    if (third) {
      const q = g([[w * 0.10 - 1.5, d, 2.5], [w * 0.56 + 1.5, d, 2.5], [w * 0.56 + 1.5, d, 4 + h * 0.38 + 1.5], [w * 0.10 - 1.5, d, 4 + h * 0.38 + 1.5]]);
      s += poly(q, 'none', '#C99A00', 2.6, 'stroke-dasharray="5 3"');
    }
    if (roof === 'flat') {
      s += poly(g([[0, 0, h + 3], [w, 0, h + 3], [w, d, h + 3], [0, d, h + 3]]), rf);
      s += poly(g([[0, d, h], [w, d, h], [w, d, h + 3], [0, d, h + 3]]), shade(rf, 1.18));
      s += poly(g([[w, 0, h], [w, d, h], [w, d, h + 3], [w, 0, h + 3]]), shade(rf, 1.05));
      if (eave) s += poly(g([[w * 0.04, d, h * 0.52], [w * 0.62, d, h * 0.52], [w * 0.62, d + 7, h * 0.52], [w * 0.04, d + 7, h * 0.52]]), shade(rf, 1.3), '#1E2B36', 1);
    } else if (roof === 'gable') {
      const r = 15;
      s += poly(g([[w, 0, h], [w, d, h], [w, d / 2, h + r]]), shade(wall, .86));
      s += poly(g([[-2, d / 2, h + r], [w + 2, d / 2, h + r], [w + 2, d + 3, h - 1], [-2, d + 3, h - 1]]), rf);
      s += poly(g([[w + 2, d / 2, h + r], [w + 2, d + 3, h - 1], [w + 2, d + 3, h - 2.5], [w + 2, d / 2, h + r - 1.5]]), shade(rf, .8), '#1E2B36', .8);
    } else if (roof === 'hip') {
      // 寄棟：四方に軒が出る
      const r = 13, o2 = 4;
      s += poly(g([[w * 0.3, d / 2, h + r], [w * 0.7, d / 2, h + r], [w + o2, d + o2, h - 1], [-o2, d + o2, h - 1]]), rf);
      s += poly(g([[w * 0.7, d / 2, h + r], [w + o2, -o2, h - 1], [w + o2, d + o2, h - 1]]), shade(rf, .82));
      s += poly(g([[-o2, d + o2, h - 1], [w + o2, d + o2, h - 1], [w + o2, d + o2, h - 2.6], [-o2, d + o2, h - 2.6]]), shade(rf, .7), '#1E2B36', .8);
    } else if (roof === 'mane') {
      // 招き屋根：棟をずらした切妻。段差に高窓
      const r1 = 18, r2 = 10, ry = d * 0.62;
      s += poly(g([[w, 0, h], [w, ry, h + r1], [w, ry, h + r2], [w, d, h]]), shade(wall, .86));
      s += poly(g([[w, ry, h + r2], [w, ry, h + r1 - 2], [w, d, h + 1]]), shade(wall, .86));
      s += poly(g([[-2, ry, h + r2], [w + 2, ry, h + r2], [w + 2, d + 3, h - 1], [-2, d + 3, h - 1]]), rf);
      s += poly(g([[-2, ry, h + r1], [w + 2, ry, h + r1], [w + 2, ry, h + r2 + 1], [-2, ry, h + r2 + 1]]), '#A9C9DB', '#1E2B36', 1);
    } else if (roof === 'cube') {
      // 軒ゼロのキューブ：パラペットだけ。庇も出さない
      s += poly(g([[0, 0, h + 4], [w, 0, h + 4], [w, d, h + 4], [0, d, h + 4]]), shade(wall, 1.04));
      s += poly(g([[0, d, h], [w, d, h], [w, d, h + 4], [0, d, h + 4]]), wall);
      s += poly(g([[w, 0, h], [w, d, h], [w, d, h + 4], [w, 0, h + 4]]), shade(wall, .86));
    } else {
      const r = 12;
      s += poly(g([[w, 0, h], [w, d, h], [w, 0, h + r]]), shade(wall, .86));
      s += poly(g([[-2, -2, h + r], [w + 2, -2, h + r], [w + 2, d + 3, h - 1], [-2, d + 3, h - 1]]), rf);
    }
    return s;
  }

  function formHouse(o) {
    const { x = 0, y = 0, w = 46, d = 38, h = 40, roof = 'flat', fin = FINISH[0], stage = 4, lamp = false, form } = o;
    const white = stage === 3, wall = white ? '#FFFFFF' : liftDark(fin.wall), rf = white ? '#F1EEE8' : liftDark(fin.roof);
    const g = a => a.map(([px, py, pz]) => P(x + px, y + py, pz));
    const h1 = Math.round(h * 0.5);
    let s = '';
    const win = (face, a0, z, ww, hh, X0 = w, D0 = d) => poly(face === 's' ? g([[a0, D0, z], [a0 + ww, D0, z], [a0 + ww, D0, z + hh], [a0, D0, z + hh]]) : g([[X0, a0, z], [X0, a0 + ww, z], [X0, a0 + ww, z + hh], [X0, a0, z + hh]]), lamp ? '#FFD98A' : (white ? '#E8EEF2' : '#A9C9DB'), '#1E2B36', 1);
    if (form === 'partial') {
      // 1階：総二階と同じ大きさ。2階は奥の右側に半分ほど。1階の残りに下屋（片流れの屋根）
      const x2 = Math.round(w * 0.38), d2 = Math.round(d * 0.58);
      s += poly(g([[0, d, 0], [w, d, 0], [w, d, 3], [0, d, 3]]), '#CFCBC3') + poly(g([[w, 0, 0], [w, d, 0], [w, d, 3], [w, 0, 3]]), '#BDB8AF');
      s += poly(g([[0, d, 3], [w, d, 3], [w, d, h1], [0, d, h1]]), wall) + poly(g([[w, 0, 3], [w, d, 3], [w, d, h1], [w, 0, h1]]), shade(wall, .86));
      s += win('s', w * 0.08, 4, w * 0.42, h1 * 0.6) + win('s', w * 0.62, 6, w * 0.14, h1 * 0.45);
      // 奥の左（2階のない部分）の屋根
      s += poly(g([[-2, -2, h1 + 2], [x2, -2, h1 + 2], [x2, d2, h1 + 2], [-2, d2, h1 + 2]]), rf);
      // 2階の箱（奥の右）
      s += house({ x: x + x2, y, w: w - x2, d: d2, h: h - h1, z0: h1, roof, fin, stage, lamp, eave: false });
      // 下屋：2階の前の壁から、1階の前の軒へ下がる
      s += poly(g([[-2, d2, h1 + 6], [w + 2, d2, h1 + 6], [w + 2, d + 3, h1 - 1], [-2, d + 3, h1 - 1]]), rf);
      s += poly(g([[w + 2, d2, h1 + 6], [w + 2, d + 3, h1 - 1], [w + 2, d + 3, h1 - 2.4], [w + 2, d2, h1 + 4.6]]), shade(rf, .8), '#1E2B36', .8);
      return s;
    }
    // overhang：1階を前で少し引っ込め、2階は総二階と同じ大きさ。下に影
    const dr = Math.round(d * 0.16);
    s += poly(g([[0, d - dr, 0], [w, d - dr, 0], [w, d, 0], [0, d, 0]]), 'rgba(30,43,54,.16)', 'none', 0);
    s += poly(g([[0, d - dr, 0], [w, d - dr, 0], [w, d - dr, 3], [0, d - dr, 3]]), '#CFCBC3') + poly(g([[w, 0, 0], [w, d - dr, 0], [w, d - dr, 3], [w, 0, 3]]), '#BDB8AF');
    s += poly(g([[0, d - dr, 3], [w, d - dr, 3], [w, d - dr, h1], [0, d - dr, h1]]), shade(wall, .92)) + poly(g([[w, 0, 3], [w, d - dr, 3], [w, d - dr, h1], [w, 0, h1]]), shade(wall, .82));
    s += win('s', w * 0.10, 5, w * 0.12, h1 * 0.35, w, d - dr) + win('s', w * 0.40, 5, w * 0.12, h1 * 0.35, w, d - dr) + win('s', w * 0.66, 3, w * 0.14, h1 * 0.7, w, d - dr);
    s += house({ x, y, w, d, h: h - h1, z0: h1, roof, fin, stage, lamp, eave: false });
    return s;
  }

  // カーポート（屋根だけの薄い板）
  function carport(x, y) {
    let s = '';
    [[0, 0], [22, 0], [0, 20], [22, 20]].forEach(([cx, cy]) => { const a = P(x + cx, y + cy, 0), b = P(x + cx, y + cy, 18); s += `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#8A8F96" stroke-width="1.6"/>`; });
    s += poly([[0, 0], [22, 0], [22, 20], [0, 20]].map(([cx, cy]) => P(x + cx, y + cy, 18)), 'rgba(220,230,236,.85)', '#8A8F96', 1.2);
    return s;
  }
  function tree(x, y, k = 1) {
    const a = P(x, y, 0), b = P(x, y, 10 * k);
    return `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#7A5A3A" stroke-width="2"/><circle cx="${b[0]}" cy="${b[1] - 6 * k}" r="${9 * k}" fill="#7DBF62" stroke="#1E2B36" stroke-width="1.2"/>`;
  }

  // 16区画の分譲地。worlds: [{no, stage, roof, fin, lamp, third, gravel, mark}]
  function estate(worlds, opt = {}) {
    const L = 96, gap = 18, sel = opt.selected, you = opt.you;
    let s = '';
    // 道路
    const road = (x0, y0, x1, y1) => poly([P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)], '#E2D8C4', 'none', 0);
    s += road(-gap, -gap, 4 * (L + gap), 0);
    s += road(2 * (L + gap) - gap, -gap, 2 * (L + gap), 4 * (L + gap));
    let labels = '';
    const order = worlds.map((wd, i) => [wd, i]).sort((a, b) => (Math.floor(a[1] / 4) + a[1] % 4) - (Math.floor(b[1] / 4) + b[1] % 4));
    order.forEach(([wd, i]) => {
      const r = Math.floor(i / 4), c = i % 4;
      const x = c * (L + gap) + (c >= 2 ? 0 : 0), y = r * (L + gap);
      const isSel = sel === wd.no, isYou = you === wd.no;
      const tile = [P(x, y), P(x + L, y), P(x + L, y + L), P(x, y + L)];
      s += `<g class="lot" data-no="${wd.no}">`;
      s += poly(tile, wd.gravel ? '#E7E0D2' : '#F3E7CF', isSel ? '#1E2B36' : '#9BD27A', isSel ? 3 : 2.2);
      if (!wd.gravel && wd.stage >= 4) s += poly([P(x + 6, y + 62), P(x + 58, y + 62), P(x + 58, y + 92), P(x + 6, y + 92)], '#BFE3A6', 'none', 0);
      if (wd.stage >= 4) s += carport(x + 66, y + 60);
      s += house({ x: x + 10, y: y + 8, roof: wd.roof, fin: wd.fin, stage: wd.stage, lamp: wd.lamp, third: wd.third });
      if (wd.stage >= 4) { s += tree(x + 12, y + 80, .9); s += tree(x + 84, y + 10, .8); }
      // 番号の札
      const t = P(x + L - 4, y + L - 4);
      labels += `<g transform="translate(${t[0]},${t[1] + 4})"><rect x="-16" y="-11" width="32" height="20" rx="4" fill="${isYou ? '#1E2B36' : '#FFFAF0'}" stroke="#1E2B36" stroke-width="1.2"/><text x="0" y="4" text-anchor="middle" font-size="12" font-weight="700" fill="${isYou ? '#FFFAF0' : '#1E2B36'}">${String(wd.no).padStart(2, '0')}</text></g>`;
      if (wd.mark) { const m = P(x + L / 2, y + L / 2, 70); labels += `<g transform="translate(${m[0]},${m[1]})">${wd.mark}</g>`; }
      s += `</g>`;
    });
    s += labels;
    const minX = P(0, 4 * (L + gap))[0] - 40, maxX = P(4 * (L + gap), 0)[0] + 40, minY = -110, maxY = P(4 * (L + gap), 4 * (L + gap))[1] + 30;
    return `<svg class="est" viewBox="${minX} ${minY} ${maxX - minX} ${maxY - minY}" xmlns="http://www.w3.org/2000/svg" font-family="inherit">${s}</svg>`;
  }

  root.ISO = { P, house, estate, FINISH, shade, poly, pts };
})(window);
