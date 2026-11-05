/* ゆくすいえ　画面の部品（design/v3 の見本から移植：アバター、夫婦の顔、家の絵、選ばれなかった世界線のサムネイル、16区画）
 * 描画は画像生成を使わず、座標からコードで描く（app/iso.js の window.ISO を使う） */
import { COMPANIES, STEPS, FINISH as YFIN } from './engine/engine.js';
const I = window.ISO;
let YOU = 7;
// その世界で選んだ外壁の色（仕上げが決まる前は、番号ごとの見本の色）
// 家の形：プランの形から（部分二階／1階が2階より小さい箱／総二階）。プランが決まる前は総二階
export function formOf(w) {
  // 形は名前の札ではなく、エンジンが出す1階と2階の床面積の比から（守りの監査11/6）
  const t = w?.spec?.tsubo, f1 = w?.spec?.floor1Tsubo;
  if (!w?.plan || !t || !f1) return 'full';
  const f2 = t - f1;
  if (f2 < f1 * 0.75) return 'partial';
  if (f1 < f2 * 0.95) return 'overhang';
  return 'full';
}
export function finOf(w, fallbackNo) {
  const f = w.finish; if (!f || !f.decided && !f.wall) return I.FINISH[((fallbackNo ?? w.no) * 5) % 8];
  const wall = YFIN.wall.find(x => x.id === f.wall) || YFIN.wall[0]; const col = (wall.colors[f.color || 0] || wall.colors[0])[1];
  return { wall: col, roof: f.wall === 'galva' ? col : '#4A4F57' };
}
export const setYou = n => { YOU = n; };
export const STAFF = {
    A: { id: 'takahashi', co: 'A', role: '営業', name: '高橋', tone: 'きっちり', suit: '#2F3B4A', shirt: '#FFFFFF', tie: '#B48A5A', hair: 'bob', hairC: '#1E2B36',
      line: '本日はご来場ありがとうございます。弊社の標準仕様で、性能面はご安心いただけます。ご予算の目安から伺ってもよろしいでしょうか。' },
    B: { id: 'kobayashi', co: 'B', role: '営業', name: '小林', tone: '元気', suit: '#3C79B5', shirt: '#FFFFFF', tie: null, hair: 'bob', hairC: '#2B2B2B', badge: true,
      line: 'いらっしゃいませ！規格プランなら、迷わずにすぐ建ちますよ。まずは、どの間取りが気になりましたか？' },
    C: { id: 'sasaki', co: 'C', role: '設計', name: '佐々木', tone: '丁寧で寡黙', suit: '#7E8F80', shirt: '#F4EFE6', tie: null, hair: 'side', hairC: '#3A322C', glasses: true, knit: true,
      line: '……はい。まず、今の暮らしで困っていることから、伺ってもいいですか。' },
    D: { id: 'mori', co: 'D', role: '社長', name: '森', tone: '気さく', suit: '#A08A68', shirt: '#E9E4DA', tie: null, hair: 'thin', hairC: '#9A948C', vest: true, wrinkle: true,
      line: 'おう、よく来てくれたね。要望は全部言ってよ。なんとかするから。' },
    IC2: { id: 'yamada', co: 'C', role: 'コーディネーター', name: '山田', tone: '落ち着いた', suit: '#B9C2B0', shirt: '#FFFFFF', tie: null, hair: 'neat', hairC: '#2E2621', line: 'ひとつだけ上げるなら、床をおすすめします。' },
    IC: { id: 'nakamura', co: 'C', role: 'コーディネーター', name: '中村', tone: 'やわらか', suit: '#D8CBB8', shirt: '#FFFFFF', tie: null, hair: 'bob', hairC: '#5A3E2B',
      line: '床をオークの挽き板にすると、足ざわりがずいぶん変わりますよ。' },
  };

export function avatar(co, size = 150, state = 'idle', extra = '') {
    const p = STAFF[co], ink = '#1E2B36', skin = '#FFF3E6';
    const hair = {
      neat: `<path d="M48 64 Q48 28 80 26 Q112 28 112 64 Q108 46 92 42 Q70 40 56 50 Q50 56 48 64Z" fill="${p.hairC}" stroke="${ink}" stroke-width="2.4" stroke-linejoin="round"/><path d="M62 44 Q78 38 96 42" fill="none" stroke="#56606B" stroke-width="1.6"/>`,
      up: `<path d="M46 66 Q42 24 80 20 Q118 24 114 66 Q110 40 96 36 L90 22 L84 34 L76 20 L70 34 L62 24 L60 40 Q50 48 46 66Z" fill="${p.hairC}" stroke="${ink}" stroke-width="2.4" stroke-linejoin="round"/>`,
      side: `<path d="M47 70 Q44 26 82 25 Q114 28 113 62 Q100 40 70 46 Q56 50 47 70Z" fill="${p.hairC}" stroke="${ink}" stroke-width="2.4" stroke-linejoin="round"/>`,
      bob: `<path d="M42 100 Q36 26 80 24 Q124 26 118 100 L106 100 Q110 50 80 44 Q50 50 54 100Z" fill="${p.hairC}" stroke="${ink}" stroke-width="2.4" stroke-linejoin="round"/>`,
      thin: `<path d="M54 50 Q64 34 80 34 Q96 34 106 50 Q94 42 80 42 Q66 42 54 50Z" fill="${p.hairC}" stroke="${ink}" stroke-width="2" stroke-linejoin="round"/><path d="M50 60 Q48 52 52 46" fill="none" stroke="${p.hairC}" stroke-width="5" stroke-linecap="round"/><path d="M110 60 Q112 52 108 46" fill="none" stroke="${p.hairC}" stroke-width="5" stroke-linecap="round"/>`,
    }[p.hair];
    let body = `<path d="M18 170 Q22 122 80 118 Q138 122 142 170Z" fill="${p.suit}" stroke="${ink}" stroke-width="2.6" stroke-linejoin="round"/>`;
    if (p.tie) body += `<path d="M66 118 L80 138 L94 118" fill="${p.shirt}" stroke="${ink}" stroke-width="2"/><path d="M80 126 L74 136 L80 170 L86 136Z" fill="${p.tie}" stroke="${ink}" stroke-width="1.8"/><path d="M60 122 L72 170 M100 122 L88 170" stroke="${ink}" stroke-width="1.8"/>`;
    else if (p.knit) body += `<path d="M64 118 Q80 134 96 118" fill="${p.shirt}" stroke="${ink}" stroke-width="2"/><path d="M80 132 L80 170" stroke="${ink}" stroke-width="1.6"/><circle cx="80" cy="146" r="2" fill="${ink}"/><circle cx="80" cy="160" r="2" fill="${ink}"/>`;
    else if (p.vest) body += `<path d="M62 120 L80 150 L98 120" fill="${p.shirt}" stroke="${ink}" stroke-width="2"/><path d="M54 130 L54 170 M106 130 L106 170" stroke="${ink}" stroke-width="1.6"/><rect x="88" y="150" width="14" height="10" fill="none" stroke="${ink}" stroke-width="1.6"/>`;
    else body += `<path d="M64 118 L80 132 L96 118" fill="${p.shirt}" stroke="${ink}" stroke-width="2"/>`;
    if (p.badge) body += `<rect x="96" y="138" width="24" height="12" rx="2" fill="#fff" stroke="${ink}" stroke-width="1.6"/>`;
    const neck = `<path d="M70 104 L70 120 Q80 126 90 120 L90 104" fill="${skin}" stroke="${ink}" stroke-width="2.4"/>`;
    const head = `<ellipse cx="48" cy="74" rx="5" ry="8" fill="${skin}" stroke="${ink}" stroke-width="2"/><ellipse cx="112" cy="74" rx="5" ry="8" fill="${skin}" stroke="${ink}" stroke-width="2"/><ellipse cx="80" cy="72" rx="32" ry="36" fill="${skin}" stroke="${ink}" stroke-width="2.6"/>`;
    const brow = `<g class="brow"><path d="M60 60 Q67 56 74 59" fill="none" stroke="${ink}" stroke-width="2.2" stroke-linecap="round"/><path d="M86 59 Q93 56 100 60" fill="none" stroke="${ink}" stroke-width="2.2" stroke-linecap="round"/></g>`;
    const eyes = `<g class="eyes"><g class="e-open"><g class="pupil"><circle cx="67" cy="71" r="3" fill="${ink}"/><circle cx="93" cy="71" r="3" fill="${ink}"/></g></g><g class="e-smile"><path d="M62 72 Q67 66 72 72" fill="none" stroke="${ink}" stroke-width="2.4" stroke-linecap="round"/><path d="M88 72 Q93 66 98 72" fill="none" stroke="${ink}" stroke-width="2.4" stroke-linecap="round"/></g></g>`;
    const mouth = `<path class="m-close" d="M73 90 Q80 93 87 90" fill="none" stroke="${ink}" stroke-width="2.2" stroke-linecap="round"/><ellipse class="m-open" cx="80" cy="91" rx="5.5" ry="4.2" fill="#B5675A" stroke="${ink}" stroke-width="2"/><path class="m-smile" d="M70 88 Q80 98 90 88 Q80 93 70 88Z" fill="#fff" stroke="${ink}" stroke-width="2.2" stroke-linejoin="round"/>`;
    let acc = '';
    if (p.glasses) acc += `<g fill="none" stroke="${ink}" stroke-width="2"><rect x="58" y="63" width="18" height="15" rx="5"/><rect x="84" y="63" width="18" height="15" rx="5"/><path d="M76 70 L84 70"/></g>`;
    if (p.wrinkle) acc += `<path d="M58 84 Q60 88 58 92 M102 84 Q100 88 102 92" fill="none" stroke="${ink}" stroke-width="1.4" stroke-linecap="round"/>`;
    const think = `<g class="think"><circle cx="124" cy="34" r="4" fill="${ink}"/><circle cx="136" cy="26" r="4" fill="${ink}"/><circle cx="148" cy="18" r="4" fill="${ink}"/></g>`;
    return `<svg class="av" data-s="${state}" data-co="${co}" viewBox="0 0 160 170" width="${size}" height="${size * 170 / 160}" ${extra} aria-label="${p.role}・${p.name}">${body}${neck}${head}${hair}${brow}${eyes}${mouth}${acc}${think}</svg>`;
  }

export function spouse(who, size = 96) {
    const ink = '#1E2B36', c = who === 'kazu' ? '#E8701F' : '#1C8DCC';
    const hair = who === 'kazu' ? `<path d="M48 64 Q48 28 80 26 Q112 28 112 64 Q100 42 80 42 Q60 42 48 64Z" fill="#2E2621" stroke="${ink}" stroke-width="2.4"/>` : `<path d="M44 110 Q38 26 80 24 Q122 26 116 110 L104 106 Q110 50 80 44 Q50 50 56 106Z" fill="#3B2A22" stroke="${ink}" stroke-width="2.4"/>`;
    return `<svg viewBox="0 0 160 170" width="${size}" height="${size * 170 / 160}"><path d="M18 170 Q22 122 80 118 Q138 122 142 170Z" fill="${c}" stroke="${ink}" stroke-width="2.6"/><path d="M70 104 L70 120 Q80 126 90 120 L90 104" fill="#FFF3E6" stroke="${ink}" stroke-width="2.4"/><ellipse cx="80" cy="72" rx="32" ry="36" fill="#FFF3E6" stroke="${ink}" stroke-width="2.6"/>${hair}<circle cx="67" cy="72" r="3" fill="${ink}"/><circle cx="93" cy="72" r="3" fill="${ink}"/><path d="M73 90 Q80 94 87 90" fill="none" stroke="${ink}" stroke-width="2.2" stroke-linecap="round"/></svg>`;
  }

export function bigHouse(w, stage, o = {}) {
    const P = I.P; let s = '';
    const lot = [P(-20, -16), P(96, -16), P(96, 92), P(-20, 92)];
    s += I.poly(lot, stage >= 4 && w.spec.exterior !== 'full' ? '#E7E0D2' : '#F3E7CF', '#9BD27A', 2.4);
    if (stage === 0) s += I.poly([P(-6, -4), P(60, -4), P(60, 50), P(-6, 50)], 'none', '#1E2B36', 1.4, 'stroke-dasharray="5 4"');
    if (stage === 0 && o.ghost) s += `<g opacity="${o.ghost}">` + I.house({ x: 0, y: 0, w: 52, d: 44, h: 46, roof: o.roof || w.spec.roof, fin: I.FINISH[0], stage: 3 }) + '</g>';
    else s += I.house({ x: 0, y: 0, w: 52, d: 44, h: 46, roof: w.spec.roof, form: formOf(w), fin: o.fin || I.FINISH[(w.no * 5) % 8], stage: stage === 0 ? 0 : stage, third: !!w.third && stage >= 4 });
    if (stage >= 4) {
      const cp = (x, y) => { let t = ''; [[0,0],[24,0],[0,22],[24,22]].forEach(([a,b]) => { const q = P(x+a, y+b, 0), r = P(x+a, y+b, 20); t += `<line x1="${q[0]}" y1="${q[1]}" x2="${r[0]}" y2="${r[1]}" stroke="#8A8F96" stroke-width="1.6"/>`; }); t += I.poly([[0,0],[24,0],[24,22],[0,22]].map(([a,b]) => P(x+a, y+b, 20)), 'rgba(220,230,236,.85)', '#8A8F96', 1.2); return t; };
      s += cp(64, 56);
      // 1年後の暮らしの跡（TESTPLAY T10）：伸びた庭木、自転車、鉢植え。外構の状態と外壁の色は、その世界のまま
      if (o.life) {
        const tree = (x, y, k) => { const a = P(x, y, 0), b = P(x, y, 16 * k); return `<ellipse cx="${a[0]}" cy="${a[1]}" rx="${12 * k}" ry="${5 * k}" fill="rgba(30,43,54,.14)"/><line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#7A5A3A" stroke-width="3"/><circle cx="${b[0]}" cy="${b[1] - 9 * k}" r="${14 * k}" fill="#7DBF62" stroke="#1E2B36" stroke-width="1.2"/><circle cx="${b[0] - 7 * k}" cy="${b[1] - 2 * k}" r="${9 * k}" fill="#8CCB6E" stroke="#1E2B36" stroke-width="1"/>`; };
        s += tree(86, -8, w.spec.exterior === 'full' ? 1.5 : 1.0);
        const bk = P(58, 52, 0); s += `<g transform="translate(${bk[0]},${bk[1] - 10})" stroke="#1E2B36" stroke-width="1.6" fill="none"><circle cx="-9" cy="6" r="6"/><circle cx="9" cy="6" r="6"/><path d="M-9 6 L-2 -4 L6 -4 L9 6 M-2 -4 L0 6 M6 -4 L5 -8"/></g>`;
        s += tree(-14, 72, w.spec.exterior === 'full' ? 1.2 : 0.8);
        [[56, 14], [56, 20]].forEach(([x, y]) => { const q = P(x, y, 0); s += `<rect x="${q[0] - 4}" y="${q[1] - 6}" width="8" height="6" fill="#B9774F" stroke="#1E2B36" stroke-width="1"/><circle cx="${q[0]}" cy="${q[1] - 9}" r="5" fill="#7DBF62" stroke="#1E2B36" stroke-width="1"/>`; });
      }
      if (w.spec.exterior === 'full') [[-12, 80, 1.1], [86, -8, .9], [-14, 20, .8]].forEach(([x, y, k]) => { const a = P(x, y, 0), b = P(x, y, 12 * k); s += `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#7A5A3A" stroke-width="2.4"/><circle cx="${b[0]}" cy="${b[1] - 7 * k}" r="${11 * k}" fill="#7DBF62" stroke="#1E2B36" stroke-width="1.2"/>`; });
    }
    const minX = P(-20, 92)[0] - 10, maxX = P(96, -16)[0] + 10, minY = P(-20, -16)[1] - 90, maxY = P(96, 92)[1] + 10;
    return `<svg viewBox="${minX} ${minY} ${maxX - minX} ${maxY - minY}" xmlns="http://www.w3.org/2000/svg" style="${o.style || ''}">${s}</svg>`;
  }

export function thumb(x, o = {}) {
    const w = x.w, stage = x.stage, P = I.P; let s = '';
    s += I.poly([P(-10, -8), P(60, -8), P(60, 54), P(-10, 54)], stage >= 4 && w.spec.exterior !== 'full' ? '#E7E0D2' : '#F3E7CF', '#9BD27A', 1.6);
    if (stage === 0 && x.ghost) s += `<g opacity="${x.ghost}">` + I.house({ x: 0, y: 0, w: 40, d: 34, h: 36, roof: w.spec.roof, form: formOf(w), fin: I.FINISH[0], stage: 3 }) + '</g>';
    else s += I.house({ x: 0, y: 0, w: 40, d: 34, h: 36, roof: w.spec.roof, form: formOf(w), fin: stage >= 4 ? finOf(w) : I.FINISH[(w.no * 5) % 8], stage });
    const minX = P(-10, 54)[0] - 4, maxX = P(60, -8)[0] + 4, minY = P(-10, -8)[1] - 60, maxY = P(60, 54)[1] + 4;
    return `<svg viewBox="${minX} ${minY} ${maxX - minX} ${maxY - minY}" style="${o.style || ''}">${s}</svg>`;
  }

export function estate2(list, o = {}) {
    const P = I.P, Lz = 96, gap = 18; let s = '', tags = '';
    const road = (x0, y0, x1, y1) => I.poly([P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)], '#E2D8C4', 'none', 0);
    s += road(-gap, -gap, 4 * (Lz + gap), 0); s += road(2 * (Lz + gap) - gap, -gap, 2 * (Lz + gap), 4 * (Lz + gap));
    const order = list.map((x, i) => [x, i]).sort((a, b) => (Math.floor(a[1] / 4) + a[1] % 4) - (Math.floor(b[1] / 4) + b[1] % 4));
    // 地面を先に全部描き、家はそのあと（枠の線が手前の家に重ならない。TESTPLAY T13）
    // 自分の区画：地面を橙の薄い塗り＋太い橙の縁。いま見ている区画：墨の太い枠。ほかは緑の細い線
    order.forEach(([x, i]) => {
      const r = Math.floor(i / 4), c = i % 4, X = c * (Lz + gap), Yy = r * (Lz + gap), w = x.w, you = w.no === YOU && YOU > 0, hi = o.hi && o.hi.includes(w.no);
      s += I.poly([P(X, Yy), P(X + Lz, Yy), P(X + Lz, Yy + Lz), P(X, Yy + Lz)], you ? '#FBE1C9' : x.stage >= 4 && w.spec.exterior !== 'full' ? '#E7E0D2' : '#F3E7CF', you ? '#E8701F' : '#9BD27A', you ? 5 : 2.2);
      if (hi) s += I.poly([P(X + 5, Yy + 5), P(X + Lz - 5, Yy + 5), P(X + Lz - 5, Yy + Lz - 5), P(X + 5, Yy + Lz - 5)], 'none', '#1E2B36', 4);
    });
    order.forEach(([x, i]) => {
      const r = Math.floor(i / 4), c = i % 4, X = c * (Lz + gap), Yy = r * (Lz + gap), w = x.w, you = w.no === YOU && YOU > 0;
      if (x.stage === 0 && x.ghost) s += `<g opacity="${x.ghost}">` + I.house({ x: X + 10, y: Yy + 8, roof: w.spec.roof, form: formOf(w), fin: I.FINISH[0], stage: 3 }) + '</g>';
      else { // 各世界の案のデータから描き分ける：延床で大きさ、外構まで整えた世界は庭木（TESTPLAY T13）
        const k = Math.sqrt(Math.max(28, Math.min(44, w.spec.tsubo || 34)) / 34);
        s += I.house({ x: X + 10, y: Yy + 8, w: Math.round(46 * k), d: Math.round(38 * k), roof: w.spec.roof, form: formOf(w), fin: x.stage >= 4 ? finOf(w) : I.FINISH[(w.no * 5) % 8], stage: x.stage, third: !!w.third && you && x.stage >= 4 });
        if (x.stage >= 4 && w.spec.exterior === 'full') [[X + 84, Yy + 14, 1], [X + 12, Yy + 84, .8]].forEach(([tx, ty, kk]) => { const a0 = P(tx, ty, 0), b0 = P(tx, ty, 14 * kk); s += `<ellipse cx="${a0[0]}" cy="${a0[1]}" rx="${9 * kk}" ry="${4 * kk}" fill="rgba(30,43,54,.12)"/><line x1="${a0[0]}" y1="${a0[1]}" x2="${b0[0]}" y2="${b0[1]}" stroke="#7A5A3A" stroke-width="2.4"/><circle cx="${b0[0]}" cy="${b0[1] - 8 * kk}" r="${12 * kk}" fill="#7DBF62" stroke="#1E2B36" stroke-width="1.2"/>`; });
      }
      const t = P(X + 33, Yy + 27, 66); // 番号札は、その区画の家の真上に（手前の区画の家と取り違えない）
      if (you) { // 「あなた」の札：墨の地に白字、橙の■。ゆっくり上下に揺れる。寄った最初の数秒だけ、薄い光の柱
        const g0 = P(X + Lz / 2, Yy + Lz / 2, 0);
        void g0; // 光の柱は家の上に色が重なりくすんで見えるため、やめた（フレンドリー監査11/6。CLAUDE.md「家がくすむ演出」）
        tags += `<g transform="translate(${t[0]},${t[1] - 6})"><g class="youtag"><rect x="-44" y="-17" width="88" height="30" rx="7" fill="#1E2B36"/><rect x="-36" y="-7" width="10" height="10" fill="#E8701F"/><text x="8" y="5" text-anchor="middle" font-size="15" font-weight="700" fill="#FFFAF0">${String(w.no).padStart(2, '0')} あなた</text></g></g>`;
      } else tags += `<g transform="translate(${t[0]},${t[1] + 4})"><rect x="-17" y="-12" width="34" height="22" rx="5" fill="#FFFAF0" stroke="#1E2B36" stroke-width="1.2"/><text x="0" y="4" text-anchor="middle" font-size="13" font-weight="700" fill="#1E2B36">${String(w.no).padStart(2, '0')}</text></g>`;
      if (o.notes && x.note && (o.notes === true || o.notes.includes(w.no))) { const m = P(X + Lz / 2, Yy + Lz / 2, 74); const fs = o.noteFs || 11, tw = x.note.length * fs * 0.62 + fs * 1.4; tags += `<g transform="translate(${m[0]},${m[1]})"><rect x="${-tw / 2}" y="${-fs * 1.15}" width="${tw}" height="${fs * 2}" rx="${fs}" fill="rgba(255,250,240,.94)" stroke="rgba(30,43,54,.3)"/><text x="0" y="${fs * 0.3}" text-anchor="middle" font-size="${fs}" font-weight="700" fill="#1E2B36">${x.note}</text></g>`; }
    });
    // 区画がいつも少し動いている（人間の案 IMPL_REVIEW_2 の10）：道を犬と猫が歩き、空き地の草がそよぎ、工事中の区画には作業車と大工。動きを減らす設定では出さない
    let anim = '';
    if (o.anim !== false) {
      const W4 = 4 * (Lz + gap), rd = -gap / 2;
      const pth = pts => 'M' + pts.map(([x, y]) => P(x, y).map(v => v.toFixed(1)).join(' ')).join(' L');
      const pet = (kind, path, dur, begin) => `<g class="eanim"><g>${kind === 'dog' ? '<ellipse cx="0" cy="-5" rx="7" ry="4" fill="#C9A27A" stroke="#1E2B36" stroke-width="1"/><circle cx="7" cy="-9" r="3.4" fill="#C9A27A" stroke="#1E2B36" stroke-width="1"/><line x1="-7" y1="-6" x2="-11" y2="-10" stroke="#1E2B36" stroke-width="1.4"/>' : '<ellipse cx="0" cy="-4" rx="5.5" ry="3.2" fill="#55595E" stroke="#1E2B36" stroke-width="1"/><circle cx="6" cy="-7.5" r="3" fill="#55595E" stroke="#1E2B36" stroke-width="1"/><path d="M-5 -5 Q-10 -12 -7 -14" fill="none" stroke="#1E2B36" stroke-width="1.4"/>'}<animateTransform attributeName="transform" type="translate" values="0 0;0 -1.2;0 0" dur=".5s" repeatCount="indefinite"/></g><animateMotion path="${path}" dur="${dur}s" begin="${begin}s" repeatCount="indefinite" rotate="0"/></g>`;
      anim += pet('dog', pth([[-gap, rd], [W4, rd], [W4, rd], [-gap, rd]]), 26, 0);
      anim += pet('cat', pth([[2 * (Lz + gap) - gap / 2, W4], [2 * (Lz + gap) - gap / 2, -gap], [2 * (Lz + gap) - gap / 2, W4]]), 34, 3);
      list.forEach((x, i) => {
        const r = Math.floor(i / 4), c = i % 4, X = c * (Lz + gap), Yy = r * (Lz + gap);
        if (x.stage === 0 || x.w?.unbuilt) [[18, 70], [52, 40], [76, 78], [30, 30]].forEach(([gx, gy], k) => { const q = P(X + gx, Yy + gy); anim += `<g class="eanim sway" style="transform-origin:${q[0].toFixed(1)}px ${q[1].toFixed(1)}px;animation-delay:${((i * 3 + k) % 7) * 0.3}s"><path d="M${q[0]} ${q[1]} q-2 -8 -5 -11 M${q[0]} ${q[1]} q1 -9 2 -13 M${q[0]} ${q[1]} q3 -7 7 -9" fill="none" stroke="#6FA552" stroke-width="1.6" stroke-linecap="round"/></g>`; });
        if (x.stage >= 1 && x.stage <= 3) { const a = P(X + 70, Yy + 88), b2 = P(X + 30, Yy + 88); anim += `<g class="eanim"><g><rect x="-9" y="-9" width="12" height="7" fill="#E6EEF2" stroke="#1E2B36" stroke-width="1"/><rect x="3" y="-7" width="6" height="5" fill="#AFC1CA" stroke="#1E2B36" stroke-width="1"/><circle cx="-5" cy="-1" r="2" fill="#1E2B36"/><circle cx="5" cy="-1" r="2" fill="#1E2B36"/></g><animateMotion path="M${a[0]} ${a[1]} L${b2[0]} ${b2[1]} L${a[0]} ${a[1]}" dur="${9 + (i % 4)}s" repeatCount="indefinite"/></g>`; const h = P(X + 40, Yy + 30, 14); anim += `<g class="eanim"><g><circle cx="0" cy="-8" r="2.4" fill="#FFF3E6" stroke="#1E2B36" stroke-width=".8"/><path d="M-2.4 -8.6 a2.4 2.4 0 0 1 4.8 0z" fill="#fff" stroke="#1E2B36" stroke-width=".6"/><line x1="0" y1="-5.5" x2="0" y2="1" stroke="#F2C230" stroke-width="2.6"/><animateTransform attributeName="transform" type="translate" values="0 0;0 -1.5;0 0" dur=".7s" repeatCount="indefinite"/></g><animateMotion path="M${h[0]} ${h[1]} l18 9 l-18 -9" dur="${6 + (i % 3)}s" repeatCount="indefinite"/></g>`; }
      });
    }
    const minX = P(0, 4 * (Lz + gap))[0] - 40, maxX = P(4 * (Lz + gap), 0)[0] + 40, minY = -120, maxY = P(4 * (Lz + gap), 4 * (Lz + gap))[1] + 30;
    return `<svg viewBox="${minX} ${minY} ${maxX - minX} ${maxY - minY}" xmlns="http://www.w3.org/2000/svg" style="${o.style || ''}"><defs><linearGradient id="yb" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#F2C230" stop-opacity=".55"/><stop offset="1" stop-color="#F2C230" stop-opacity="0"/></linearGradient></defs>${s}${anim}${tags}</svg>`;
  }

export const setFace = (el, s) => { if (el) el.setAttribute('data-s', s); };
export function coTag(id, s = 30) { const sh = COMPANIES[id].shape; return `<span class="co ${sh}" style="width:${s}px;height:${s}px;font-size:${Math.round(s * .5)}px">${id}</span>`; }
// 工程の線は10段階（FLOW_v3 の2。設計申込・ショールームはなくした）。画面の中の工程の番号（0〜11）は変えず、表示だけを対応させる
export const STEPS_S = ['見学・相談', '初回打ち合わせ', 'プラン提案・見積', '契約', '色決め・電気', '着工', '上棟', '施主検査', '引渡し', '1年後'];
export const STEP_TO_BAR = [0, 1, 2, 2, 2, 3, 4, 5, 6, 7, 8, 9];
export const progress = now => { const b = STEP_TO_BAR[now] ?? 0; return `<ol class="pbar" aria-label="家づくりの進み具合：${STEPS_S[b]}">${STEPS_S.map((s, i) => `<li class="${i < b ? 'done' : i === b ? 'now' : ''}"><i></i><span>${s}</span></li>`).join('')}</ol>`; };
