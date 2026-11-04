/* ゆくすいえ　v3の見本：画面の共通の枠（前半 S1〜S5）
 * design/v3/play（L1）の部品（../../play/common.js の window.L）をそのまま使う。
 * 数字はすべて app/engine.js（window.YKS）から。 */
(function (root) {
  'use strict';
  const L = root.L, Y = L.Y, H = L.H;
  const W = n => L.WORLDS[n - 1];
  const man = n => n.toLocaleString('ja-JP');
  const LAND = Y.SITE.price + Y.SITE.waterFee;
  // 分かれ道3の取引（S4・S5で共通）。05＝窓を変える前の同じ仕様
  const BASE = W(5);
  const DAY_S4 = 4.75;
  const loanLeftAt = p => { const day = Math.round(p < 5 ? p * 13 : 65 + (p - 5) * 38); return 90 - day; };
  const SIM = Y.simulate({ spec: BASE.spec, company: 'C', principal: BASE.principal, household: H, loanDeadlineLeft: loanLeftAt(DAY_S4) }, { borrowAdd: 60, spec: { window: 'triple' } });

  const CSS = `
.top{position:absolute;left:36px;top:16px;width:1380px;display:flex;align-items:center;gap:22px}
#logo-slot{font-family:var(--fr);font-weight:900;font-size:28px;white-space:nowrap}
.top .pbar{width:1170px;flex:none}
.pbar.compact{font-size:12.5px}
.money{position:absolute;right:30px;top:10px;width:480px;background:#fff;border:1.5px solid var(--ink);border-radius:14px;padding:6px 16px 7px;display:grid;grid-template-columns:1fr 1fr;column-gap:14px}
.money .co{grid-column:1/-1;display:flex;align-items:center;font-size:13px;font-weight:700;color:var(--ink2)}
.money .c{min-width:0}
.money .c+.c{border-left:1px dashed rgba(30,43,54,.25);padding-left:14px}
.money .k{font-size:13px;color:var(--ink2);white-space:nowrap}
.money .v{font-family:var(--fr);font-weight:900;font-size:32px;line-height:1.15;font-variant-numeric:tabular-nums;white-space:nowrap}
.money .v small{font-size:16px;font-weight:700;margin-left:2px}
.money .sub{font-size:12.5px;color:var(--ink2);font-variant-numeric:tabular-nums;white-space:nowrap}
.money.pending{border-style:dashed;border-color:rgba(30,43,54,.4)}
.money.pending .v{color:rgba(30,43,54,.35)}
.clks{position:absolute;left:36px;top:76px}
.clks .clk{font-size:17px;padding:3px 14px}.clks .clk b{font-size:19px}
.hero{position:absolute;left:30px;top:124px;width:1124px;height:676px;background:linear-gradient(#DDF0FA,#F4FAFD 52%,#F3E7CF 52.1%);border-radius:22px;overflow:hidden}
.hero > svg{position:absolute;left:150px;top:22px;width:840px;height:600px}
.hero .lab{position:absolute;left:28px;top:22px;display:flex;align-items:center;gap:10px;font-size:22px;font-weight:700;z-index:2}
.hero .no{font-family:var(--fr);font-weight:900;font-size:44px}
.hero .ph{position:absolute;right:26px;top:24px;font-size:18px;color:var(--ink2);text-align:right;line-height:1.5;z-index:2}
.right{position:absolute;left:1180px;top:124px;width:710px;height:676px}
.right .chat{height:100%}
.navs{display:flex;gap:10px;padding:10px 16px 0;border-top:1px solid rgba(30,43,54,.1)}
.nav{display:inline-flex;align-items:center;gap:8px;font:700 17px var(--f);padding:8px 14px;border-radius:999px;border:1.5px solid rgba(30,43,54,.45);background:var(--paper);color:var(--ink);cursor:pointer}
.nav .n{font-weight:400;font-size:14px;color:var(--ink2)}
.nav svg{width:18px;height:18px}
.chat .in{border-top:none}
.caster{left:44px;top:690px}
.galT{position:absolute;left:34px;top:814px;font-size:16px;color:var(--ink2);display:flex;gap:14px;align-items:baseline}
.galT b{font-size:17px;color:var(--ink)}
.gal{position:absolute;left:30px;right:30px;top:842px;height:222px;display:grid;grid-template-columns:repeat(15,1fr);gap:8px}
.th{background:#fff;border:1.5px solid rgba(30,43,54,.14);border-radius:12px;padding:5px 6px 7px;display:flex;flex-direction:column;align-items:center;font-size:12.5px;line-height:1.3;overflow:hidden}
.th .hd{display:flex;align-items:center;justify-content:space-between;width:100%;font-weight:700;font-size:15px}
.th svg{width:100%;height:104px}
.th .st{font-weight:700;font-size:13px;white-space:nowrap}
.th .nt{color:var(--ink2);text-align:center;min-height:32px}
.th .bar{width:100%;height:5px;border-radius:3px;background:rgba(30,43,54,.1);margin-top:auto}.th .bar i{display:block;height:100%;background:var(--ink);border-radius:3px}
.th .tbd{display:inline-grid;place-items:center;width:18px;height:18px;border:1.5px dashed rgba(30,43,54,.4);border-radius:4px;font-size:11px;color:var(--ink2)}
.panel{background:#fff;border:1.5px solid rgba(30,43,54,.2);border-radius:18px;box-shadow:0 10px 30px rgba(30,43,54,.10);padding:26px 30px}
.panel h2{font-family:var(--fr);font-weight:900;font-size:30px;margin-bottom:10px}
.panel .lead{font-size:19px;color:var(--ink2);line-height:1.6}
table.kv{width:100%;border-collapse:collapse;font-size:20px;margin-top:12px}
table.kv td{padding:9px 4px;border-bottom:1px solid rgba(30,43,54,.1)}
table.kv td:last-child{text-align:right;font-variant-numeric:tabular-nums}
table.kv td small{color:var(--ink2);font-size:15px}
`;

  function moneyBox(state) {
    if (state === 'pending') return `<div class="money pending"><div class="co">住宅会社を決めると表示します</div>
      <div class="c"><div class="k">見積金額</div><div class="v">—</div><div class="sub">　</div></div>
      <div class="c"><div class="k">借入金額</div><div class="v">—</div><div class="sub">土地 ${man(LAND)}万円を含む予定</div></div></div>`;
    const ico = L.coTag('C', 18);
    if (state === 'estimate') return `<div class="money"><div class="co">${ico}Cデザイン</div>
      <div class="c"><div class="k">見積金額（建物の総額）</div><div class="v">${man(BASE.quote.real)}<small>万円</small></div><div class="sub">付帯・外構・諸費用込み</div></div>
      <div class="c"><div class="k">借入金額</div><div class="v">${man(BASE.principal)}<small>万円</small></div><div class="sub">土地 ${man(LAND)}万円を含む</div></div></div>`;
    if (state === 'estimate2') return `<div class="money"><div class="co">${ico}Cデザイン</div>
      <div class="c"><div class="k">見積金額（建物の総額）</div><div class="v">${man(BASE.quote.real + SIM.diff)}<small>万円</small></div><div class="sub">窓の変更 ＋${man(SIM.diff)}を含む</div></div>
      <div class="c"><div class="k">借入金額</div><div class="v">${man(SIM.principal)}<small>万円</small></div><div class="sub">土地 ${man(LAND)}万円を含む</div></div></div>`;
    // 契約：札が「契約金額」に切り替わる
    return `<div class="money"><div class="co">${ico}Cデザイン　契約済み</div>
      <div class="c"><div class="k">契約金額＋増工金額</div><div class="v">${man(BASE.quote.real + SIM.diff)}<small>万円</small></div><div class="sub">契約 ${man(BASE.quote.real + SIM.diff)} ＋ 増工 0</div></div>
      <div class="c"><div class="k">借入金額</div><div class="v">${man(SIM.principal)}<small>万円</small></div><div class="sub">土地 ${man(LAND)}万円を含む</div></div></div>`;
  }

  function chrome(p, money, o = {}) {
    return `<div class="top"><div id="logo-slot">ゆくすいえ</div>${L.progressBar(p, { compact: true })}</div>
      ${moneyBox(money)}
      <div class="clks">${o.clocks || L.clocks(p)}</div>`;
  }

  // 下の段：選ばれなかった世界線（L1と同じ部品）。noteFn で札の文を差し替えられる
  function gallery(p, o = {}) {
    const list = L.worldsAt(p).filter(x => x.w.no !== L.YOU);
    return `<div class="galT"><b>選ばれなかった世界線</b></div>
      <div class="gal">${list.map(x => {
        const co = o.noCompany ? '<span class="tbd">？</span>' : L.coTag(x.w.company, 18);
        const st = o.stepLabel ? o.stepLabel(x) : L.STEPS_S[Math.floor(x.s)];
        const nt = o.noteFn ? o.noteFn(x) : x.note;
        const pct = o.pct ? o.pct(x) : x.s / 11 * 100;
        return `<div class="th"><div class="hd"><span>${String(x.w.no).padStart(2, '0')}</span>${co}</div>${L.thumb(x)}<div class="st">${st}</div><div class="nt">${nt}</div><div class="bar"><i style="width:${pct}%"></i></div></div>`;
      }).join('')}</div>`;
  }

  const ICON = {
    sns: '<svg viewBox="0 0 20 20"><rect x="2" y="3" width="16" height="11" rx="3" fill="none" stroke="#1E2B36" stroke-width="1.8"/><path d="M6 14 L5 18 L10 14" fill="none" stroke="#1E2B36" stroke-width="1.8" stroke-linejoin="round"/><line x1="6" y1="7" x2="14" y2="7" stroke="#1E2B36" stroke-width="1.6"/><line x1="6" y1="10" x2="11" y2="10" stroke="#1E2B36" stroke-width="1.6"/></svg>',
    ai: '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="7.5" fill="none" stroke="#1E2B36" stroke-width="1.8"/><circle cx="7.4" cy="9" r="1.2" fill="#1E2B36"/><circle cx="12.6" cy="9" r="1.2" fill="#1E2B36"/><path d="M7 12.5 Q10 14.6 13 12.5" fill="none" stroke="#1E2B36" stroke-width="1.6" stroke-linecap="round"/></svg>',
  };
  const navs = (aiLeft = 1) => `<div class="navs"><button class="nav">${ICON.sns}SNSを見る</button><button class="nav">${ICON.ai}自分のAIに聞く<span class="n">このターン あと${aiLeft}回</span></button></div>`;

  function mountStatic(draw) {
    const css = document.createElement('style'); css.textContent = L.CSS + CSS; document.head.appendChild(css);
    const st = document.getElementById('stage');
    const fit = () => st.style.setProperty('--k', Math.min(innerWidth / 1920, innerHeight / 1080));
    addEventListener('resize', fit); fit();
    draw();
    root.READY = true;
  }

  root.S = { L, Y, H, W, man, LAND, BASE, SIM, DAY_S4, loanLeftAt, moneyBox, chrome, gallery, navs, ICON, mountStatic };
})(window);
