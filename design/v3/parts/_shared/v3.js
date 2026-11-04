/* ゆくすいえ　場面の部品 v3 共通処理（外部コードなし）
 * 進捗バー（詰めた版）、お金の札、会社の札、表情の変わるアバター、口調の見本、L1の部品の呼び出し */
(function (root) {
  'use strict';
  const Y = root.YKS, I = root.ISO;
  const stage = document.getElementById('stage');
  const fit = () => stage.style.setProperty('--k', Math.min(innerWidth / 1920, innerHeight / 1080));
  addEventListener('resize', fit); fit();
  const Q = new URLSearchParams(location.search);
  if (Q.has('rec')) document.body.classList.add('rec');

  const STEPS = ['見学・相談', '初回打ち合わせ', 'プラン・見積', '設計申込・詳細', 'ショールーム', '契約', 'コーディネート・電気', '申請・着工', '上棟', '施主検査', '引渡し', '1年後'];
  const STEPS_S = ['見学', '初回', 'プラン', '設計申込', 'ショールーム', '契約', '色決め・電気', '着工', '上棟', '施主検査', '引渡し', '1年後'];
  const progress = now => `<ol class="pbar" aria-label="家づくりの進み具合：${STEPS[now]}">${STEPS_S.map((s, i) => `<li class="${i < now ? 'done' : i === now ? 'now' : ''}"><i></i><span>${s}</span></li>`).join('')}</ol>`;

  // お金の札：見積金額（契約後は契約金額＋増工）／借入金額。数字はエンジンから
  const H = Y.HOUSEHOLDS.t2;
  function money(o = {}) {
    if (!o.company) return `<div class="money"><div class="m soft"><small>見積金額</small><b>—</b></div><div class="m soft"><small>借りられそうな額</small><b>${Y.loanLimit(H).toLocaleString()}<span>万円まで</span></b></div></div>`;
    const label = o.contract ? '契約金額＋増工（建物）' : '見積金額（建物）';
    const add = o.add ? `<em>＋${o.add}</em>` : '';
    return `<div class="money"><div class="m"><small>${label}</small><b>${(o.amount + (o.add || 0)).toLocaleString(undefined, { maximumFractionDigits: 1 })}<span>万円</span></b>${add}</div><div class="m"><small>借入金額</small><b>${o.loan.toLocaleString()}<span>万円</span></b></div></div>`;
  }
  const topbar = (now, m) => `<div class="topbar"><div class="logo">ゆくすいえ</div>${progress(now)}${money(m)}</div>`;

  function coTag(id, s = 30) { const sh = Y.COMPANIES[id].shape; return `<span class="co ${sh}" style="width:${s}px;height:${s}px;font-size:${Math.round(s * .5)}px">${id}</span>`; }

  // 担当者（ビルダーごとに見た目と口調を変える）
  const STAFF = {
    A: { id: 'takahashi', co: 'A', role: '営業', name: '高橋', tone: 'きっちり', suit: '#2F3B4A', shirt: '#FFFFFF', tie: '#B48A5A', hair: 'neat', hairC: '#1E2B36',
      line: '本日はご来場ありがとうございます。弊社の標準仕様で、性能面はご安心いただけます。ご予算の目安から伺ってもよろしいでしょうか。' },
    B: { id: 'kobayashi', co: 'B', role: '営業', name: '小林', tone: '元気', suit: '#3C79B5', shirt: '#FFFFFF', tie: null, hair: 'up', hairC: '#2B2B2B', badge: true,
      line: 'いらっしゃいませ！規格プランなら、迷わずにすぐ建ちますよ。まずは、どの間取りが気になりましたか？' },
    C: { id: 'sasaki', co: 'C', role: '設計', name: '佐々木', tone: '丁寧で寡黙', suit: '#7E8F80', shirt: '#F4EFE6', tie: null, hair: 'side', hairC: '#3A322C', glasses: true, knit: true,
      line: '……はい。まず、今の暮らしで困っていることから、伺ってもいいですか。' },
    D: { id: 'mori', co: 'D', role: '社長', name: '森', tone: '気さく', suit: '#A08A68', shirt: '#E9E4DA', tie: null, hair: 'thin', hairC: '#9A948C', vest: true, wrinkle: true,
      line: 'おう、よく来てくれたね。要望は全部言ってよ。なんとかするから。' },
    IC: { id: 'nakamura', co: 'C', role: 'コーディネーター', name: '中村', tone: 'やわらか', suit: '#D8CBB8', shirt: '#FFFFFF', tie: null, hair: 'bob', hairC: '#5A3E2B',
      line: '床をオークの挽き板にすると、足ざわりがずいぶん変わりますよ。' },
  };

  // アバター：data-s = idle / think / talk / smile。CSSクラスだけで表情が切り替わる
  function avatar(co, size = 150, state = 'idle', extra = '') {
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
  // 夫婦の小さな顔（線画）
  function spouse(who, size = 96) {
    const ink = '#1E2B36', c = who === 'kazu' ? '#E8701F' : '#1C8DCC';
    const hair = who === 'kazu' ? `<path d="M48 64 Q48 28 80 26 Q112 28 112 64 Q100 42 80 42 Q60 42 48 64Z" fill="#2E2621" stroke="${ink}" stroke-width="2.4"/>` : `<path d="M44 110 Q38 26 80 24 Q122 26 116 110 L104 106 Q110 50 80 44 Q50 50 56 106Z" fill="#3B2A22" stroke="${ink}" stroke-width="2.4"/>`;
    return `<svg viewBox="0 0 160 170" width="${size}" height="${size * 170 / 160}"><path d="M18 170 Q22 122 80 118 Q138 122 142 170Z" fill="${c}" stroke="${ink}" stroke-width="2.6"/><path d="M70 104 L70 120 Q80 126 90 120 L90 104" fill="#FFF3E6" stroke="${ink}" stroke-width="2.4"/><ellipse cx="80" cy="72" rx="32" ry="36" fill="#FFF3E6" stroke="${ink}" stroke-width="2.6"/>${hair}<circle cx="67" cy="72" r="3" fill="${ink}"/><circle cx="93" cy="72" r="3" fill="${ink}"/><path d="M73 90 Q80 94 87 90" fill="none" stroke="${ink}" stroke-width="2.2" stroke-linecap="round"/></svg>`;
  }
  // アバターの状態を変える（AIの応答の開始・文字の到着・完了に合わせて呼ぶ）
  function setFace(el, s) { if (el) el.setAttribute('data-s', s); }

  // L1の部品（v2 layout/common.js の L）を使って、自分の家と選ばれなかった世界線を描く
  function gallery(p, opt = {}) {
    const L = root.L; const list = L.worldsAt(p).filter(x => x.w.no !== L.YOU);
    return `<div class="galT">選ばれなかった世界線</div><div class="gal">${list.map(x => `<div class="th"><div class="thd"><span>${String(x.w.no).padStart(2, '0')}</span>${coTag(x.w.company, 18)}</div>${L.thumb(x)}<div class="tst">${L.STEPS_S[Math.floor(x.s)]}</div><div class="tnt">${x.note}</div></div>`).join('')}</div>`;
  }

  // 自分の世界（07）の数字
  const ME = () => root.L.WORLDS[root.L.YOU - 1];

  root.V3 = { STEPS, progress, money, topbar, coTag, STAFF, avatar, spouse, setFace, gallery, ME, Q, H };
})(window);
