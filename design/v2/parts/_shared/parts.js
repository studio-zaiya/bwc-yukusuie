/* UI部品モック用の共通処理（外部コードなし） */
(function (root) {
  'use strict';
  const stage = document.getElementById('stage');
  const fit = () => stage.style.setProperty('--k', Math.min(innerWidth / 1920, innerHeight / 1080));
  addEventListener('resize', fit); fit();

  const STEPS = ['見学・相談', '初回打ち合わせ', 'プラン提案・見積', '設計申込・詳細', 'ショールーム', '契約', 'コーディネート・電気', '申請・着工', '上棟', '施主検査', '引渡し', '1年後'];
  function progress(now, opt = {}) {
    return `<div class="prog ${opt.bottom ? 'bottom' : ''}" style="${opt.style || ''}">${STEPS.map((s, i) => `<div class="st ${i < now ? 'done' : i === now ? 'now' : ''}">${s}</div>`).join('')}</div>`;
  }

  // 線画の顔（胸から上）。背景は透過
  const PEOPLE = {
    takahashi: { name: '高橋', role: '営業', co: 'A', shape: 'square', hair: '#2E2621', suit: '#3E4A57', tie: '#C9A27A', hairStyle: 'short' },
    sasaki: { name: '佐々木', role: '設計', co: 'C', shape: 'circle', hair: '#4A4038', suit: '#6B7B6E', tie: null, hairStyle: 'side', glasses: true },
    kobayashi: { name: '小林', role: '営業', co: 'B', shape: 'triangle', hair: '#2B2B2B', suit: '#2F4A6B', tie: '#9FB7CF', hairStyle: 'up' },
    mori: { name: '森', role: '社長', co: 'D', shape: 'hex', hair: '#9A948C', suit: '#7A6A55', tie: null, hairStyle: 'thin' },
    ic: { name: '中村', role: 'コーディネーター', co: 'C', shape: 'circle', hair: '#5A3E2B', suit: '#C8B8A6', tie: null, hairStyle: 'bob' },
    denki: { name: '山口', role: '電気', co: 'C', shape: 'circle', hair: '#2E2621', suit: '#5C6E7E', tie: null, hairStyle: 'short', cap: true },
    kazu: { name: 'かず', role: '', hair: '#2E2621', suit: '#E8701F', hairStyle: 'short' },
    yuu: { name: 'ゆう', role: '', hair: '#3B2A22', suit: '#1C8DCC', hairStyle: 'long' },
  };
  function face(id, s = 1) {
    const p = PEOPLE[id]; const W = 150 * s, H = 150 * s;
    const hair = {
      short: 'M44,58 Q46,26 75,24 Q104,26 106,58 Q100,40 75,40 Q52,40 44,58Z',
      side: 'M44,60 Q44,24 78,24 Q106,28 106,56 Q90,36 64,44 Q52,48 44,60Z',
      up: 'M46,56 Q44,20 76,18 Q104,22 104,54 Q96,30 76,32 Q56,32 46,56Z',
      thin: 'M48,52 Q56,32 75,32 Q94,32 102,52 Q90,42 75,42 Q60,42 48,52Z',
      bob: 'M40,84 Q36,26 75,24 Q114,26 110,84 L100,84 Q102,46 75,42 Q48,46 50,84Z',
      long: 'M38,104 Q32,24 75,22 Q118,24 112,104 L100,100 Q104,48 75,42 Q46,48 50,100Z',
    }[p.hairStyle];
    let g = '';
    g += `<path d="M18,150 Q22,108 75,104 Q128,108 132,150Z" fill="${p.suit}" stroke="#1E2B36" stroke-width="2.4"/>`;
    if (p.tie) g += `<path d="M75,106 L68,118 L75,150 L82,118Z" fill="${p.tie}" stroke="#1E2B36" stroke-width="1.6"/><path d="M62,104 L75,118 L88,104" fill="#fff" stroke="#1E2B36" stroke-width="1.6"/>`;
    else g += `<path d="M64,104 Q75,116 86,104" fill="none" stroke="#1E2B36" stroke-width="2"/>`;
    g += `<rect x="67" y="88" width="16" height="18" fill="#F3DCC6" stroke="#1E2B36" stroke-width="2"/>`;
    g += `<ellipse cx="75" cy="64" rx="30" ry="34" fill="#F6E2CF" stroke="#1E2B36" stroke-width="2.4"/>`;
    g += `<path d="${hair}" fill="${p.hair}" stroke="#1E2B36" stroke-width="2"/>`;
    g += `<circle cx="64" cy="66" r="2.6" fill="#1E2B36"/><circle cx="86" cy="66" r="2.6" fill="#1E2B36"/>`;
    g += `<path d="M66,82 Q75,88 84,82" fill="none" stroke="#1E2B36" stroke-width="2" stroke-linecap="round"/>`;
    if (p.glasses) g += `<circle cx="64" cy="66" r="8" fill="none" stroke="#1E2B36" stroke-width="1.8"/><circle cx="86" cy="66" r="8" fill="none" stroke="#1E2B36" stroke-width="1.8"/><line x1="72" y1="66" x2="78" y2="66" stroke="#1E2B36" stroke-width="1.8"/>`;
    if (p.cap) g += `<path d="M44,50 Q75,22 106,50 L112,54 L40,54Z" fill="#E9E4DA" stroke="#1E2B36" stroke-width="2"/>`;
    return `<svg width="${W}" height="${H}" viewBox="0 0 150 150" xmlns="http://www.w3.org/2000/svg">${g}</svg>`;
  }
  // 実況ふうの重ね（担当者を画面下に小さく）
  function cast(list, opt = {}) {
    const s = opt.scale || 1;
    return `<div class="cast" style="left:${opt.left ?? 40}px;${opt.style || ''}">${list.map(id => { const p = PEOPLE[id];
      const tag = p.co ? `<span class="co ${p.shape}">${p.co}</span>${p.role}・${p.name}` : `<span style="width:10px;height:10px;display:inline-block;${id === 'kazu' ? 'background:#E8701F' : 'background:#1C8DCC;border-radius:50%'}"></span>${p.name}`;
      return `<div class="who">${face(id, s)}<div class="tag">${tag}</div></div>`; }).join('')}${opt.bubble ? `<div class="bub" style="left:${opt.bubbleLeft || 0}px">${opt.bubble}</div>` : ''}</div>`;
  }

  // 自分の家のアップ（アイソメ）。stage: 0 地縄 / 1 基礎 / 2 骨組み / 3 白 / 4 完成
  function myLot(stg = 0, opt = {}) {
    const I = root.ISO; let s = '';
    const P = I.P;
    s += I.poly([P(-30, -30), P(110, -30), P(110, 110), P(-30, 110)], '#F3E7CF', '#9BD27A', 3);
    if (opt.ghost) { // 要望から膨らむボリュームの影（破線）
      const g = opt.ghost; s += I.poly([P(0, 0), P(g.w, 0), P(g.w, g.d), P(0, g.d)], 'rgba(30,43,54,.05)', '#1E2B36', 1.6, 'stroke-dasharray="6 5"');
      s += I.poly([P(0, g.d, 0), P(g.w, g.d, 0), P(g.w, g.d, g.h), P(0, g.d, g.h)], 'rgba(255,255,255,.55)', '#1E2B36', 1.6, 'stroke-dasharray="6 5"');
      s += I.poly([P(g.w, 0, 0), P(g.w, g.d, 0), P(g.w, g.d, g.h), P(g.w, 0, g.h)], 'rgba(255,255,255,.4)', '#1E2B36', 1.6, 'stroke-dasharray="6 5"');
      s += I.poly([P(0, 0, g.h), P(g.w, 0, g.h), P(g.w, g.d, g.h), P(0, g.d, g.h)], 'rgba(255,255,255,.65)', '#1E2B36', 1.6, 'stroke-dasharray="6 5"');
    }
    s += I.house({ x: 6, y: 4, w: 56, d: 46, h: 46, roof: opt.roof || 'flat', fin: opt.fin || I.FINISH[0], stage: stg, third: opt.third, lamp: opt.lamp });
    if (stg >= 4) {
      [[-14, 92], [96, 4]].forEach(([x, y]) => { const a = P(x, y, 0), b = P(x, y, 14); s += `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#7A5A3A" stroke-width="2.4"/><circle cx="${b[0]}" cy="${b[1] - 8}" r="12" fill="#7DBF62" stroke="#1E2B36" stroke-width="1.4"/>`; });
    }
    return `<svg viewBox="${opt.vb || '-150 -95 300 225'}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%">${s}</svg>`;
  }

  // コーディネート・電気の仮の価格表（engine.js へ追加予定。差額と月々はengineの関数で出す）
  const COORD = {
    wall: [{ id: 'std', label: '窯業系サイディング（標準）', v: 0 }, { id: 'galva', label: 'ガルバリウム縦ハゼ', v: 48 }, { id: 'wood', label: '杉板の縦張り（一部）', v: 36 }],
    floor: [{ id: 'std', label: 'シート貼りフローリング（標準）', v: 0 }, { id: 'oak', label: 'オークの挽き板', v: 42 }, { id: 'solid', label: '無垢のパイン', v: 28 }],
    light: [{ id: 'std', label: 'シーリング照明（標準）', v: 0 }, { id: 'down', label: 'ダウンライト＋間接照明', v: 34 }],
    outlet: { std: 38, add: 1.2 }, lan: 2.5,
  };
  function monthly(add, principal = 4800) { const Y = root.YKS; return Math.round((Y.payment(principal + add, Y.RATE.variable) - Y.payment(principal, Y.RATE.variable)) * 10000); }

  root.UI = { STEPS, progress, face, cast, myLot, COORD, monthly, PEOPLE };
})(window);
