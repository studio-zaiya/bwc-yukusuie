/* ゆくすいえ　後半の画面（S6〜S10）の共通部品。play/common.js（L）の上に載せる。
 * 数字はすべて engine.js（L.Y）から。言葉は試作の文例で、本番はClaudeが生成する。 */
(function (root) {
  'use strict';
  const L = root.L, Y = L.Y;
  const W = n => L.WORLDS[n - 1];
  const man = n => Math.round(n).toLocaleString('ja-JP');
  const LAND = Y.SITE.price + Y.SITE.waterFee;

  // 上の段：ロゴ＋詰めた進捗バー
  const top = p => `<div class="top"><div class="logo">ゆくすいえ</div>${L.progressBar(p, { compact: true })}</div>`;

  // お金の札。kind: 'contract'（契約金額＋増工）／'final'（最終の総額）
  function money(kind) {
    const me = W(L.YOU), base = W(5);
    const add = me.quote.real - base.quote.real; // 窓の増工（エンジンの差額）
    const ico = L.coTag('C', 18);
    if (kind === 'final') {
      return `<div class="money"><div class="co">${ico}Cデザイン　引渡し済み</div>
        <div class="c"><div class="k">最終の総額（建物）</div><div class="v">${man(me.quote.real)}<small>万円</small></div><div class="sub">契約 ${man(base.quote.real)} ＋ 増工 ${man(add)}</div></div>
        <div class="c"><div class="k">借入金額</div><div class="v">${man(me.principal)}<small>万円</small></div><div class="sub">土地 ${man(LAND)}万円を含む</div></div></div>`;
    }
    return `<div class="money"><div class="co">${ico}Cデザイン　契約済み</div>
      <div class="c"><div class="k">契約金額＋増工金額</div><div class="v">${man(me.quote.real)}<small>万円</small></div><div class="sub">契約 ${man(base.quote.real)} ＋ 増工 ${man(add)}</div></div>
      <div class="c"><div class="k">借入金額</div><div class="v">${man(me.principal)}<small>万円</small></div><div class="sub">土地 ${man(LAND)}万円を含む</div></div></div>`;
  }

  // 下の段：選ばれなかった世界線（15区画）
  function gallery(list, o = {}) {
    const others = list.filter(x => x.w.no !== L.YOU);
    return `<div class="galT"><b>選ばれなかった世界線</b>${o.sub ? `<span>${o.sub}</span>` : ''}</div>
    <div class="gal">${others.map(x => `<div class="th"><div class="hd"><span>${String(x.w.no).padStart(2, '0')}</span>${L.coTag(x.w.company, 18)}</div>${L.thumb(x)}<div class="st">${L.STEPS_S[Math.floor(x.s)]}</div><div class="nt">${x.note}</div><div class="bar"><i style="width:${Math.round(x.s / 11 * 100)}%"></i></div></div>`).join('')}</div>`;
  }

  // 4つの決断の文言（自由回答は選んだ道の中身として、特別な言葉を付けずに書く）
  const THIRD_LABEL = '借入を少し増やして、南の大きな窓だけトリプルガラスに';
  function decisions(w) {
    return Y.DECISIONS.map((d, i) => {
      const b = w.bits[i], t = w.third === d.id;
      return { q: d.q, a: t ? THIRD_LABEL : (b ? d.b.label : d.a.label), third: t };
    });
  }

  function fit() {
    const st = document.getElementById('stage');
    const f = () => st.style.setProperty('--k', Math.min(innerWidth / 1920, innerHeight / 1080));
    addEventListener('resize', f); f();
    if (new URLSearchParams(location.search).has('rec')) document.body.classList.add('rec');
  }

  root.S = { L, Y, W, man, LAND, top, money, gallery, decisions, fit };
})(window);
