/* ゆくすいえ　場面ごとの描画。数字はすべてエンジン（engine.js）から */
import * as Y from './engine/engine.js';
import * as P from './parts.js';
import { REC } from './main.js';

const man = n => Number(n).toLocaleString('ja-JP', { maximumFractionDigits: 1 });
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const NOTICE = '本作の制度・手続き・金額・期間などの設定は、体験のために簡略化しています。実際の家づくりでは、地域・金融機関・住宅会社によって異なります。登場する住宅会社・人物・団体はすべて架空です。';
const H = s => Y.HOUSEHOLDS[s.household];
const STAFFN = co => `${Y.COMPANIES[co].staffRole}・${Y.COMPANIES[co].staff}`;
const myNo = s => (s.player && s.player.bits.length === 4 ? Y.worldNo(s.player.bits) : 7);

// ---- 上の帯・お金の札・時計 ----
function top(s) { return `<div class="top"><div class="logo">ゆくすいえ</div>${P.progress(s.step)}</div>`; }
function moneyBox(s) {
  const h = H(s);
  if (!s.player) {
    return `<div class="moneyc"><div class="hd">まだ会社は決まっていません</div>
      <div class="c"><div class="k">借りられそうな額</div><div class="v">${man(Y.loanLimit(h))}<small>万円まで</small></div><div class="sub">審査の目安（返済負担率35%）</div></div>
      <div class="c"><div class="k">土地（区画）</div><div class="v">${man(Y.landCost())}<small>万円</small></div><div class="sub">自己資金 ${man(h.saveHouse)}万円</div></div></div>`;
  }
  const m = Y.money(s.player), co = s.player.company;
  const k = s.player.contracted ? '総額（土地＋契約＋増工）' : '総額（土地＋建物の見積）';
  const sub = s.player.contracted ? `土地 ${man(m.land)}＋契約 ${man(m.contract)}＋増工 ${man(m.add)}` : `土地 ${man(m.land)}＋建物 ${man(m.building)}`;
  return `<div class="moneyc"><div class="hd">${P.coTag(co, 18)}${Y.COMPANIES[co].name}${s.player.contracted ? '　契約済み' : ''}</div>
    <div class="c"><div class="k">${k}</div><div class="v">${man(m.total)}<small>万円</small></div><div class="sub">${sub}</div></div>
    <div class="c"><div class="k">借入</div><div class="v">${man(m.loan)}<small>万円</small></div><div class="sub">自己資金 ${man(m.self)}万円</div></div></div>`;
}
function clocks(s) {
  if (!s.player) return '';
  const days = Y.scheduleOf(s.player); const day = s.step === 0 ? 0 : days[Math.max(0, s.step - 1)];
  const out = [`<span class="clk"><b>${day}</b>日目</span>`];
  const loanLeft = Y.DEADLINE.loan - day;
  if (s.step <= 5 && loanLeft > 0) out.push(`<span class="clk soft">ローン特約の期限まで ${loanLeft}日</span>`);
  return `<div class="clks">${out.join('')}</div>`;
}
const chrome = s => top(s) + moneyBox(s) + clocks(s);

// ---- 選ばれなかった世界線（分岐を経るごとに 1 → 3 → 7 → 15）----
const PACE = { A: [1.12, 0.95], B: [1.15, 1.1], C: [0.86, 1.0], D: [1.0, 0.92] };
const hash = n => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };
function stepOf(w, p) {
  const [pre, post] = PACE[w.company] || [1, 1];
  const j = (hash(Y.hashStr(w.bits.join('')) % 97) - 0.5) * 0.7;
  const v = p < 5 ? p * pre + j : 5 * pre + (p - 5) * post + j;
  return Math.max(0, Math.min(11, v));
}
const stageOf = st => st < 7 ? 0 : st < 8 ? 1 : st < 9 ? 2 : st < 9.6 ? 3 : 4;
function noteOf(w, st) {
  const co = Y.COMPANIES[w.company];
  if (st < 3) return co.style === 'total' ? '総額で見積が届いた' : '見積の表紙が届いた';
  if (st < 4) return w.company === 'C' ? '詳細見積を待っている' : '設計の申込をした';
  if (st < 5) return 'ショールームで迷う';
  if (st < 6) return w.company === 'A' ? '月末に契約した' : '契約の日取りを決めた';
  if (st < 7) return w.spec.kitchen ? '造作キッチンの色決め' : 'コンセントの数を数える';
  if (st < 8) return '地鎮祭';
  if (st < 9) return '上棟した';
  if (st < 10) return '施主検査';
  if (st < 11) return '引渡し';
  return '1年が過ぎた';
}
function gallery(s) {
  if (!s.others.length) return '';
  const list = [...s.others].sort((a, b) => Y.worldNo(a.bits.concat(Array(4 - a.bits.length).fill(0))) - Y.worldNo(b.bits.concat(Array(4 - b.bits.length).fill(0))));
  const n = list.length, cols = Math.max(n, 5);
  const label = w => w.bits.length === 4 ? String(Y.worldNo(w.bits)).padStart(2, '0') : w.bits.map(b => b ? '右' : '左').join('');
  return `<div class="galT"><b>選ばれなかった世界線</b><span>${n}</span></div><div class="gal" style="grid-template-columns:repeat(${cols},1fr)">${list.map(w => {
    const st = stepOf(w, s.step), stage = stageOf(st);
    const x = { w: { ...w, no: 0, spec: w.spec }, stage, ghost: st >= 2 && st < 7 ? +(0.35 + (st - 2) / 5 * 0.45).toFixed(2) : 0 };
    return `<div class="th ${s.newest.includes(w.bits.join('')) ? 'new' : ''}"><div class="thd"><span>${label(w)}</span>${P.coTag(w.company, 18)}</div>${P.thumb(x)}<div class="tst">${P.STEPS_S[Math.floor(st)]}</div><div class="tnt">${noteOf(w, st)}</div><div class="bar"><i style="width:${Math.round(st / 11 * 100)}%"></i></div></div>`;
  }).join('')}</div>`;
}
const tall = s => s.others.length ? '' : 'tall';

// ---- 自分の家 ----
function hero(s, extra = '') {
  const w = s.player || Y.newWorld({ household: H(s) });
  const stage = s.step < 7 ? 0 : s.step < 8 ? 1 : s.step < 9 ? 2 : s.step < 10 ? 3 : 4;
  const ghost = s.step >= 2 && s.step < 7 ? +(0.35 + (s.step - 2) / 5 * 0.45).toFixed(2) : (s.step < 2 ? 0.25 : 0);
  const fin = Y.FINISH.wall.find(x => x.id === w.finish.wall) || Y.FINISH.wall[0];
  const col = fin.colors[w.finish.color || 0] || fin.colors[0];
  const ww = { ...w, no: myNo(s), third: w.third };
  let svg = P.bigHouse(ww, stage, { ghost });
  if (stage >= 3 && w.contracted) svg = svg.replace(/fill="#F4EFE6"|fill="#C9A27A"|fill="#E9E4DA"|fill="#7C8A93"|fill="#F2E3C9"|fill="#DDE6EA"|fill="#B98E62"|fill="#EFE9DF"/, `fill="${col[1]}"`);
  const co = s.player ? `　${P.coTag(w.company, 28)}${Y.COMPANIES[w.company].name}` : '';
  const area = `${w.spec.tsubo}坪・総二階　${w.spec.roof === 'gable' ? '勾配屋根' : '箱型の屋根'}`;
  return `<div class="hero ${tall(s)}"><div class="lab"><span class="no">${String(myNo(s)).padStart(2, '0')}</span>あなたの家${co}</div>
    <div class="ph">${Y.STEPS[s.step]}<br><span style="font-size:15px">${area}</span></div>${svg}${extra}</div>`;
}

// ---- チャット ----
const ICON = {
  sns: '<svg viewBox="0 0 20 20"><rect x="2" y="3" width="16" height="11" rx="3" fill="none" stroke="#1E2B36" stroke-width="1.8"/><path d="M6 14 L5 18 L10 14" fill="none" stroke="#1E2B36" stroke-width="1.8" stroke-linejoin="round"/><line x1="6" y1="7" x2="14" y2="7" stroke="#1E2B36" stroke-width="1.6"/><line x1="6" y1="10" x2="11" y2="10" stroke="#1E2B36" stroke-width="1.6"/></svg>',
  ai: '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="7.5" fill="none" stroke="#1E2B36" stroke-width="1.8"/><circle cx="7.4" cy="9" r="1.2" fill="#1E2B36"/><circle cx="12.6" cy="9" r="1.2" fill="#1E2B36"/><path d="M7 12.5 Q10 14.6 13 12.5" fill="none" stroke="#1E2B36" stroke-width="1.6" stroke-linecap="round"/></svg>',
};
function navs(s) {
  const left = s.aiLeft[s.scene] ?? 1;
  return `<div class="navs"><button class="nav" data-act="openPop" data-pop="sns">${ICON.sns}SNSを見る</button><button class="nav" data-act="openPop" data-pop="ai" ${left ? '' : 'disabled'}>${ICON.ai}自分のAIに聞く<span class="n">このターン あと${left}回</span></button></div>`;
}
function msgHTML(m) {
  if (m.who === 'sys') return `<div class="msg sys">${esc(m.text)}</div>`;
  if (m.who === 'staff') return `<div class="msg"><div class="who">${P.coTag(m.co, 18)}${Y.COMPANIES[m.co].name}・${STAFFN(m.co)}</div>${esc(m.text)}${m.cond ? `<div class="cond">${m.cond.map(c => '・' + esc(c)).join('<br>')}</div>` : ''}</div>`;
  if (m.who === 'yuu') return `<div class="msg me"><div class="who"><i class="ci"></i>ゆう</div>${esc(m.text)}</div>`;
  return `<div class="msg me kz"><div class="who"><i class="sq"></i>かず</div>${esc(m.text)}</div>`;
}
let WHO = 'kazu';
export const setWho = w => { WHO = w; };
export const getWho = () => WHO;
function whoSw() { return `<div class="who-sw">話す人<button data-act="who" data-w="kazu" aria-pressed="${WHO === 'kazu'}"><i class="sq"></i>かず</button><button data-act="who" data-w="yuu" aria-pressed="${WHO === 'yuu'}"><i class="ci"></i>ゆう</button></div>`; }
function chat(s, { head = '', middle = '', opts = '', input = true, act = 'send', placeholder = '担当者に、自由に伝える・聞く', thinking = false } = {}) {
  const co = s.player ? s.player.company : s.firstCo;
  const log = s.chat.slice(-14).map(msgHTML).join('') + (thinking ? `<div class="msg typing"><div class="who">${P.coTag(co, 18)}${STAFFN(co)}</div>考えています……</div>` : '');
  return `<div class="chat">${head}<div class="log">${log}</div>${middle}${opts ? `<div class="opts">${opts}</div>` : ''}${navs(s)}
    ${input ? `<div class="in">${whoSw()}<textarea id="say" data-keep data-enter="${act}" placeholder="${placeholder}"></textarea><button class="btn" data-act="${act}">送る</button></div>` : ''}</div>`;
}
function staffHead(co, state = 'idle') {
  return `<div class="staffbar">${P.avatar(co, 78, state, 'id="face"')}<div class="nm">${Y.COMPANIES[co].name}<b>${STAFFN(co)}</b></div><div class="nm" style="margin-left:auto;text-align:right">${Y.COMPANIES[co].kind}</div></div>`;
}
export const busy = { on: false };

// ---- 場面 ----
export const SCENES = {
  start(s) {
    return `<div class="center" style="text-align:center;width:1500px">
      <div class="title">ゆくすいえ</div><div class="subt">YUKUSUIE: 16 unbuilt futures</div>
      <div class="catch">16回目の、マイホームへ。</div>
      <p class="lead" style="margin-top:22px">初めて家を建てる共働きの夫婦になって、4つの分かれ道を選びます。<br>選ばなかった道も、16の世界で同時に進みます。</p>
      <button class="big-btn" data-act="start">はじめる</button>
    </div><div class="disc">${NOTICE}</div>`;
  },
  family(s) {
    const card = id => { const h = Y.HOUSEHOLDS[id]; return `<button class="famc" data-act="household" data-id="${id}" aria-pressed="${s.household === id}">${id === 't2' ? '<span class="rec">はじめての方に</span>' : '<span class="rec" style="visibility:hidden">-</span>'}<div class="st">${h.story}</div><dl><dt>世帯年収</dt><dd>${man(h.income)}万円</dd><dt>家に入れる預金</dt><dd>${man(h.saveHouse)}万円</dd><dt>借りられそうな額</dt><dd>${man(Y.loanLimit(h))}万円まで</dd><dt>家の広さの目安</dt><dd>${h.area[0]}〜${h.area[1]}坪</dd></dl></button>`; };
    return `<div class="full"><div class="h2">どの家族として、家を建てますか。</div><p class="lead">3つの家族から1つ選びます。金額はゲームの中の仮定です。</p>
      <div class="fam">${['t1', 't2', 't3'].map(card).join('')}</div>
      <div style="margin-top:36px;text-align:right"><button class="big-btn" data-act="toEntry">この家族で始める</button></div></div>`;
  },
  entry(s) {
    return `<div class="full"><div class="h2">どんな家にしたいですか。</div><p class="lead">思いや理想を、自由に書いてください。好きな家の写真やスクリーンショットも、ここにドロップか貼り付けで置けます。<br>あとで担当者に伝える要望のもとになります（書かなくても進めます）。</p>
      <div style="display:grid;grid-template-columns:1.3fr 1fr;gap:30px">
        <textarea class="free" id="entryText" data-keep style="height:420px" placeholder="例：外観はシンプルでかっこよく。キッチンは家族の顔が見えるように。冬でも暖かい家がいい。"></textarea>
        <div><div class="drop" id="drop">ここに写真をドロップ／Ctrl＋Vで貼り付け<br><span style="font-size:15px">送る前に長辺1568pxまで縮小し、撮影場所などの埋め込み情報は消えます</span></div>
          <div class="thumbs">${(s.entry.photos || []).map(p => `<img src="${p}" alt="置いた写真">`).join('')}</div>
          <p class="note" style="margin-top:12px">写真の読み取り（Claudeの画像の読み取り）は準備中です。いまは、要望のメモとして残ります。</p></div>
      </div>
      <div style="margin-top:30px;text-align:right"><button class="big-btn" data-act="toLot">次へ</button></div></div>`;
  },
  // 区画を押す：押した位置をアイソメの逆算で区画に直す（16区画は世界の番号順に並ぶ）
  year_after(s) {
    const svg = document.querySelector('.estate svg'); if (!svg) return;
    svg.style.cursor = 'pointer';
    svg.onclick = ev => {
      const pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY;
      const q = pt.matrixTransform(svg.getScreenCTM().inverse());
      const C30 = Math.cos(Math.PI / 6), x = q.y + q.x / (2 * C30), y = q.y - q.x / (2 * C30), L = 96 + 18;
      const c = Math.floor(x / L), r = Math.floor(y / L);
      if (c < 0 || c > 3 || r < 0 || r > 3) return;
      import('./main.js').then(m => m.emit('lot', { no: r * 4 + c + 1 }));
    };
  },
  entry_after(s) { import('./actions.js').then(m => m.bindDrop()); },
  lot(s) {
    const c = Y.coverageCheck(Y.baseSpec(H(s)));
    return `${top(s)}${moneyBox(s)}<div class="full" style="padding-top:150px"><div class="h2">分譲地の区画が当たりました。</div><p class="lead">第一希望は外れましたが、第二希望の区画が当たりました。土地の契約は進めてあります。ここから、建物を建てる会社を探します。</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:40px"><dl class="facts"><dt>広さ</dt><dd>約${Y.SITE.tsubo}坪（${Y.SITE.area}㎡）</dd><dt>用途地域</dt><dd>第一種住居地域</dd><dt>建蔽率／容積率</dt><dd>${Y.SITE.coverage * 100}%／${Y.SITE.far * 100}%</dd><dt>建てられる1階の外形の上限</dt><dd>${c.limit}㎡（カーポート・物置を含む）</dd><dt>土地の代金</dt><dd>${man(Y.SITE.price)}万円（水道の負担金 ${Y.SITE.waterFee}万円）</dd><dt>ローン特約の期限</dt><dd>土地の契約から${Y.DEADLINE.loan}日</dd></dl>
      <div><p class="lead" style="margin-bottom:12px">最初に見学に行く会社を選んでください。</p><div class="cos" style="grid-template-columns:1fr 1fr">${'ABCD'.split('').map(id => `<button class="coc" data-act="firstCo" data-co="${id}" aria-pressed="${s.firstCo === id}"><div class="nm">${P.coTag(id, 34)}${Y.COMPANIES[id].name}</div><div class="kd">${Y.COMPANIES[id].kind}</div></button>`).join('')}</div>
      <div style="margin-top:22px;text-align:right"><button class="big-btn" data-act="toSurvey">見学に行く</button></div></div></div></div>`;
  },
  survey(s) {
    const co = s.firstCo, h = H(s);
    const title = { A: '来場者アンケート', B: 'かんたんアンケート', C: 'はじめに、少しだけ教えてください', D: 'ご相談シート' }[co];
    return `${top(s)}${moneyBox(s)}<form class="sv ${co}" onsubmit="return false">
      <h3>${P.coTag(co, 40)}${Y.COMPANIES[co].name}　${title}</h3><div class="sub">Tabで次へ。Ctrl＋Enterで記入を終えて、担当者のところへ。</div>
      <div class="row"><div><label>家族構成</label><input id="sv_fam" value="夫婦と子ども2人"></div><div><label>いまの住まい</label><input id="sv_now" value="賃貸のアパート"></div></div>
      <div class="row"><div><label>ご予算の目安（総額）</label><input id="sv_budget" placeholder="わからなければ空欄で"></div><div><label>入居したい時期</label><input id="sv_when" value="来年の春ごろ"></div></div>
      <label><i class="sq"></i> かず の要望</label><textarea id="sv_kazu">${esc(s.entry.text ? s.entry.text.slice(0, 80) : '')}</textarea>
      <label><i class="ci"></i> ゆう の要望</label><textarea id="sv_yuu"></textarea>
      <label>気になっていること</label><textarea id="sv_worry" placeholder="例：お金のこと、性能のこと、間取りのこと"></textarea>
      <div style="margin-top:18px;text-align:right"><button class="btn" data-act="submitSurvey">書き終えた</button></div></form>
      <div class="svside">${P.avatar(co, 200, 'smile')}<p class="lead" style="margin-top:14px">${Y.COMPANIES[co].name}（${Y.COMPANIES[co].kind}）<br>${STAFFN(co)}</p>
      <p class="note">世帯年収 ${man(h.income)}万円／借りられそうな額 ${man(Y.loanLimit(h))}万円までは、アンケートには書かなくても大丈夫です。</p></div>`;
  },
  hearing(s) {
    const co = s.firstCo, done = s.hearingTurns >= 3;
    const opts = done || s.hearingTurns >= 2 ? `<button class="opt" data-act="toForgot">ヒアリングを終えて、帰宅する</button>` : '';
    return `${chrome(s)}${hero(s, P.STAFF ? '' : '')}<div class="right ${tall(s)}">${chat(s, { head: staffHead(co, busy.on ? 'think' : 'idle'), opts, thinking: busy.on, placeholder: 'ご主人は？奥様は？に答える（要望・こだわり・困っていること）' })}</div>${gallery(s)}`;
  },
  forgot(s) {
    const sent = s.chat.some(m => m.forgot);
    return `${chrome(s)}${hero(s)}<div class="right ${tall(s)}"><div class="chat"><div class="staffbar">${P.spouse('yuu', 70)}<div class="nm">帰り道<b>ゆう</b></div></div>
      <div class="log"><div class="msg me" style="font-size:26px"><div class="who"><i class="ci"></i>ゆう</div>今日の打ち合わせ、伝え忘れたこと、あった？</div>
      ${s.chat.filter(m => m.forgot || m.afterForgot).map(msgHTML).join('')}${busy.on ? '<div class="msg typing">担当者に送っています……</div>' : ''}</div>
      ${sent ? `<div class="opts"><button class="opt" data-act="toPlans">プランと見積を受け取る</button></div>` : ''}
      ${sent ? '' : `<div class="in"><textarea id="say" data-keep data-enter="sendForgot" placeholder="担当者に、メッセージで送る"></textarea><button class="btn" data-act="sendForgot">送る</button></div>
      <div class="opts"><button class="opt" data-act="toPlans">とくにない</button></div>`}</div></div>${gallery(s)}`;
  },
  plans(s) {
    const spec = Y.baseSpec(H(s));
    const pick = s.pair;
    return `${top(s)}${moneyBox(s)}<div class="full" style="padding-top:140px"><div class="h2">4社から、プランと見積が届きました。</div>
      <p class="lead">同じ要望を伝えています（2社目以降は、1社目に書いた内容を写しました）。見積の「見せ方」は会社ごとに違います。最後まで迷う2社を選んでください。</p>
      <div class="cos">${'ABCD'.split('').map(id => { const q = Y.quote(spec, id, false); const hidden = q.lines.filter(l => !l.shown).map(l => l.label); return `<button class="coc" data-act="pickCo" data-co="${id}" aria-pressed="${pick.includes(id)}"><div class="nm">${P.coTag(id, 34)}${Y.COMPANIES[id].name}</div><div class="kd">${Y.COMPANIES[id].kind}・${STAFFN(id)}</div><div class="lb">${q.label}</div><div class="cv">${man(q.cover)}<small>万円</small></div><ul>${hidden.length ? `<li>別途：${hidden.slice(0, 4).join('、')}${hidden.length > 4 ? ' ほか' : ''}</li>` : '<li>付帯・外構・諸費用まで込み</li>'}<li>断熱の標準：等級${Y.COMPANIES[id].insul}</li><li>地盤調査：${Y.COMPANIES[id].groundTiming}</li></ul></button>`; }).join('')}</div>
      <p class="lead" style="margin-top:18px">選んでいる2社：${pick.map(id => Y.COMPANIES[id].name).join('、')}</p>
      <div style="text-align:right"><button class="big-btn" data-act="toFork1">この2社で考える</button></div></div>`;
  },
  fork(s) {
    const d = Y.decisions(s.pair)[s.forkNo];
    if (!d) return chrome(s) + hero(s) + gallery(s);
    const w = s.player;
    const facts = side => { const q = Y.TOOLS.quote(w, d, side); const l = Y.TOOLS.loanCheck(w, d, side); return `<li>総額 ${man(q.after)}万円${q.diff ? `（${q.diff > 0 ? '+' : ''}${man(q.diff)}）` : ''}</li><li>借入 ${man(Y.round(l.before + l.diff, 1))}万円${l.ok ? '' : '（審査の上限を超える）'}</li>`; };
    const pend = s.pendingTrade;
    const mid = pend ? '' : `<div class="fk"><div class="q">${Y.FORKS[d.no]}</div><div class="qq">${d.q}</div><div class="cards">
      <button class="cd" data-act="fork" data-side="a"><h4>${d.a.label}</h4><ul>${facts('a')}</ul></button>
      <button class="cd" data-act="fork" data-side="b"><h4>${d.b.label}</h4><ul>${facts('b')}</ul></button></div></div>`;
    const opts = pend ? `<button class="opt" style="background:var(--ink);color:var(--paper)" data-act="approve">この条件で進める</button><button class="opt" data-act="cancelTrade">やめておく</button>` : '';
    const co = w.company;
    const lead = { 0: 'どちらの会社と、家を建てますか。', 1: '間取りと予算の配分を決める段階です。', 2: '契約の前の最終見積と、ローンの本審査です。', 3: '契約のあと、コーディネートでアップグレードを勧められました。' }[d.no];
    return `${chrome(s)}${hero(s, `<div class="forkmark">${Y.FORKS[d.no]}</div>${band(s)}`)}<div class="right ${tall(s)}">${chat(s, { head: d.no === 0 ? '' : staffHead(co, busy.on ? 'think' : 'idle'), middle: mid, opts, act: 'freeAnswer', thinking: busy.on, placeholder: `2つの札のどちらかを押すか、自分の言葉で答える（${lead}）` })}</div>${gallery(s)}`;
  },
  contract(s) {
    const m = Y.money(s.player), co = s.player.company, lc = Y.loanCheck(H(s), m.loan);
    return `${chrome(s)}${hero(s)}<div class="right ${tall(s)}"><div class="chat">${staffHead(co, 'smile')}<div class="log" style="padding:22px">
      <div class="msg"><div class="who">${P.coTag(co, 18)}${STAFFN(co)}</div>請負契約の書類です。図面と見積の内容をご確認ください。</div>
      <dl class="facts" style="font-size:20px;margin-top:10px"><dt>契約金額（建物）</dt><dd>${man(m.contract)}万円</dd><dt>土地</dt><dd>${man(m.land)}万円</dd><dt>総額</dt><dd>${man(m.total)}万円</dd><dt>借入</dt><dd>${man(m.loan)}万円（返済負担率 ${lc.ratio}%）</dd><dt>月々の返済（変動 ${Y.RATE.variable * 100}%）</dt><dd>約${man(Math.round(lc.monthly * 10) / 10)}万円</dd><dt>選んだ道</dt><dd>${s.player.labels.map(esc).join('<br>')}</dd></dl></div>
      <div class="opts"><button class="opt" style="background:var(--ink);color:var(--paper)" data-act="toFork4">署名する</button></div>${navs(s)}</div></div>${gallery(s)}`;
  },
  coord(s) {
    const w = s.player, f = w.finish;
    const wall = Y.FINISH.wall.find(x => x.id === f.wall) || Y.FINISH.wall[0];
    const opt = (k, x) => `<button class="o" data-act="finish" data-k="${k}" data-v="${x.id}" aria-pressed="${f[k] === x.id}"><span class="sw" style="background:${x.sw || x.colors[0][1]}"></span>${x.label}<em>${x.v ? '+' + x.v + '万円' : '標準'}</em></button>`;
    return `${chrome(s)}${hero(s)}<div class="right ${tall(s)}"><div class="chat">${staffHead(w.company, 'smile')}<div class="log coord" style="padding:16px 22px;justify-content:flex-start">
      <div class="msg"><div class="who">${P.coTag(w.company, 18)}コーディネーター・中村</div>外壁と床、内壁を決めましょう。標準からの増額だけ、お伝えしますね。</div>
      <h4>外壁</h4>${Y.FINISH.wall.map(x => opt('wall', x)).join('')}
      <div class="colors">${wall.colors.map((c, i) => `<button data-act="finish" data-k="color" data-v="${i}" aria-pressed="${(f.color || 0) === i}" style="background:${c[1]}" title="${c[0]}"></button>`).join('')}</div>
      <h4>床</h4>${Y.FINISH.floor.map(x => opt('floor', x)).join('')}<h4>内壁</h4>${Y.FINISH.inner.map(x => opt('inner', x)).join('')}</div>
      <div class="opts"><span style="font-size:18px;align-self:center">仕上げの増工 +${man(Y.finishCost(f))}万円</span><button class="opt" style="margin-left:auto;background:var(--ink);color:var(--paper)" data-act="toElectric">これで決める</button></div>${navs(s)}</div></div>${gallery(s)}`;
  },
  electric(s) {
    const w = s.player, adds = Y.ELECTRIC.options.filter(o => w.electric.includes(o.id));
    const asked = s.chat.some(m => m.electric);
    return `${chrome(s)}${hero(s)}<div class="right ${tall(s)}"><div class="chat">${staffHead(w.company, busy.on ? 'think' : 'idle')}<div class="log" style="padding:16px 22px;justify-content:flex-start">
      <div style="font-size:16px;color:var(--ink2);font-weight:700">標準仕様と、契約に入れてあるもの</div><ul class="elist">${Y.ELECTRIC.standard.map(t => `<li>${t}</li>`).join('')}${adds.map(o => `<li class="add"><b>${o.label}</b>　+${o.v}万円</li>`).join('')}</ul>
      <div class="msg" style="margin-top:12px"><div class="who">${P.coTag(w.company, 18)}${STAFFN(w.company)}</div>電気の打ち合わせです。上の内容で進めますが、問題ないでしょうか。</div>
      ${s.chat.filter(m => m.electric || m.afterElectric).map(msgHTML).join('')}</div>
      <div class="opts"><button class="opt" style="background:var(--ink);color:var(--paper)" data-act="toBuild">この内容でOK</button></div>${navs(s)}
      <div class="in"><textarea id="say" data-keep data-enter="sendElectric" placeholder="気になるところを指摘する（例：テレビは壁掛けにしたいと伝えていたはず）"></textarea><button class="btn" data-act="sendElectric">伝える</button></div></div></div>${gallery(s)}`;
  },
  build(s) {
    const days = Y.scheduleOf(s.player);
    const rows = [[7, '申請・着工', '確認の申請がおりて、地鎮祭。基礎の工事に入る'], [8, '上棟', '骨組みが立ち上がる。家の形がいちばんわかる日'], [9, '施主検査', '頼んだとおりか、付箋を貼って確かめる'], [10, '引渡し', '鍵を受け取る']];
    return `${chrome(s)}${hero(s)}<div class="right ${tall(s)}"><div class="chat"><div class="staffbar"><div class="nm">工事の帳面<b>着工から引渡しまで</b></div></div>
      <ol class="timeline">${rows.map(([st, t, d]) => `<li class="${s.step >= st ? 'on' : ''}"><b>${days[st - 1]}日目</b><span><b>${t}</b><br>${d}</span></li>`).join('')}</ol>
      <div class="opts" style="margin-top:auto">${s.step < 10 ? `<button class="opt" data-act="buildNext">早送り（次の工程へ）</button>` : `<button class="opt" style="background:var(--ink);color:var(--paper)" data-act="toHandover">引渡しへ</button>`}</div>${navs(s)}</div></div>${gallery(s)}`;
  },
  handover(s) {
    const m = Y.money(s.player);
    return `${chrome(s)}${hero(s)}<div class="right ${tall(s)}"><div class="chat">${staffHead(s.player.company, 'smile')}<div class="log" style="padding:22px">
      <div class="msg"><div class="who">${P.coTag(s.player.company, 18)}${STAFFN(s.player.company)}</div>鍵をお渡しします。おめでとうございます。</div>
      <dl class="facts" style="font-size:20px;margin-top:12px"><dt>最終の総額</dt><dd>${man(m.total)}万円</dd><dt>うち増工</dt><dd>${man(m.add)}万円</dd><dt>借入</dt><dd>${man(m.loan)}万円</dd><dt>引渡し</dt><dd>${Y.scheduleOf(s.player)[10]}日目</dd></dl></div>
      <div class="opts"><button class="opt" style="background:var(--ink);color:var(--paper)" data-act="toYear">1年後へ</button></div></div></div>${gallery(s)}`;
  },
  year(s) {
    const all = [s.player, ...s.others].map(w => ({ w, o: Y.outcome(w) })).sort((a, b) => a.o.no - b.o.no);
    P.setYou(myNo(s));
    const list = all.map(({ w, o }) => ({ w: { ...w, no: o.no }, stage: 4, ghost: 0, note: '' }));
    const sel = all.find(x => x.o.no === (s.lot || myNo(s))) || all.find(x => x.o.no === myNo(s));
    const o = sel.o, mine = o.no === myNo(s);
    const line = s.staff16?.lines?.find(l => l.no === o.no)?.line;
    return `${top(s)}${moneyBox(s)}<div class="estate" title="区画を押すと、その世界が右に出ます">${P.estate2(list, { hi: [s.lot || myNo(s)] })}</div>
      <div class="card"><h3>${String(o.no).padStart(2, '0')}　${P.coTag(o.company, 30)}${Y.COMPANIES[o.company].name}${mine ? '　あなたの世界' : ''}</h3>
      <ol>${o.labels.map(esc).map((l, i) => `<li>${Y.FORKS[i]}：${l}</li>`).join('')}</ol>
      <dl><dt>総額</dt><dd>${man(o.total)}万円</dd><dt>借入</dt><dd>${man(o.principal)}万円</dd><dt>冬の朝</dt><dd>${o.warmth.label}</dd><dt>家計のゆとり</dt><dd>${o.slack.label}</dd><dt>引渡し</dt><dd>${o.days}日目</dd></dl>
      <div style="font-size:16px;color:var(--ink2);font-weight:700">この1年の出来事</div><ul class="ev">${(o.events.length ? o.events : ['大きな出来事はなかった']).map(e => `<li>${esc(e)}</li>`).join('')}</ul>
      ${line ? `<div class="ln">${P.coTag(o.company, 18)} ${STAFFN(o.company)}：${esc(line)}</div>` : ''}
      <div class="acts"><button class="btn ghost" data-act="toHonne">それぞれの事情と、見積の透視</button><button class="btn" data-act="toReport">レポートを受け取る</button></div></div>`;
  },
  honne(s) {
    const spec = s.player.spec;
    const qs = 'ABCD'.split('').map(id => Y.quote(spec, id, true));
    const max = Math.max(...qs.map(q => q.real));
    const notes = s.honne.slice(-3);
    return `${top(s)}${moneyBox(s)}<div class="full" style="padding-top:130px;display:grid;grid-template-columns:1fr 1fr;gap:40px">
      <div><div class="h2">それぞれの事情</div><p class="lead">打ち合わせのあいだ、担当者が心の中で考えていたこと（記録から）。</p>
      ${notes.length ? notes.map(n => `<div class="card" style="position:static;width:auto;height:auto;margin-bottom:14px;display:flex;gap:16px">${P.avatar(n.co, 90, 'idle')}<div><b>${Y.COMPANIES[n.co].name}・${STAFFN(n.co)}</b><p style="font-size:19px;line-height:1.6;margin-top:6px">${esc(n.text)}</p></div></div>`).join('') : '<p class="lead">（この記録には、担当者の本音が残っていません）</p>'}</div>
      <div><div class="h2">見積の透視</div><p class="lead">同じ仕様で、4社の見積の表紙（黒）と、別途だった項目（斜線）を並べました。</p>
      <div class="bars">${qs.map(q => `<div class="barc"><div class="colw"><div class="seg hide" style="height:${Math.round((q.real - q.cover) / max * 400)}px"></div><div class="seg cover" style="height:${Math.round(q.cover / max * 400)}px"></div></div><div class="num">${man(q.real)}</div><div class="lbl">${P.coTag(q.company, 18)}表紙 ${man(q.cover)}万円</div></div>`).join('')}</div>
      <div class="acts" style="justify-content:flex-end"><button class="btn ghost" data-act="toYear">16区画に戻る</button><button class="btn" data-act="toReport">レポートを受け取る</button></div></div></div>`;
  },
  report(s) {
    const r = s.report, o = Y.outcome(s.player);
    if (!r) return `${top(s)}<div class="center" style="text-align:center">${P.avatar(s.player.company, 160, 'think')}<p class="lead" style="margin-top:20px">決断の記憶から、レポートを書いています……</p></div>`;
    return `${top(s)}${moneyBox(s)}<div class="rep"><div class="box"><div style="font-size:18px;color:var(--ink2)">わが家の、ちょうどいいバランス</div><div class="h2" style="font-size:36px">${esc(r.title)}</div>
      <h3>悩んだら、これを優先する</h3><ol>${r.balance.map(x => `<li>${esc(x)}</li>`).join('')}</ol>
      <h3>あのとき守ろうとしたもの</h3><ul>${r.memories.map((x, i) => `<li><b>${Y.FORKS[i] || ''}</b>　${esc(x)}</li>`).join('')}</ul></div>
      <div class="box"><h3>本物の打ち合わせで、先に伝えておきたいこと</h3><ol>${r.tellFirst.map(x => `<li>${esc(x)}</li>`).join('')}</ol>
      <h3>1年後のあなたの家（エンジンの値）</h3><dl class="facts" style="font-size:19px"><dt>総額</dt><dd>${man(o.total)}万円</dd><dt>借入</dt><dd>${man(o.principal)}万円</dd><dt>冬の朝</dt><dd>${o.warmth.label}</dd><dt>家計のゆとり</dt><dd>${o.slack.label}</dd></dl>
      <p class="lead" style="margin-top:16px">${esc(r.closing)}</p>
      ${s.savedId ? `<p class="note">このプレイの再生コード：<span class="code">${s.savedId}</span>　（<a href="/?replay=${s.savedId}">再生する</a>）</p>` : ''}
      <div class="acts"><button class="btn ghost" data-act="print">印刷用を開く</button><button class="btn ghost" data-act="toYear">16区画を見る</button><button class="btn" data-act="restart">もう一度</button></div></div></div>
      <div class="disc" style="bottom:8px">${NOTICE}</div>`;
  },
};

// いま起きたこと（帯）
function band(s) {
  const b = s.band; if (!b) return '';
  return `<div class="band"><div class="bt">いま起きたこと<span>${esc(b.by)}${b.model && b.by === 'Claude' ? '（' + esc(b.model) + '・' + esc(b.prompt) + '）' : ''}${b.ms ? `　${(b.ms / 1000).toFixed(1)}秒` : ''}</span></div><div class="steps">
    <div class="sp"><div class="who"><i>${b.by === 'Claude' ? 'Claude' : 'コード'}</i>読み替え</div><div class="wh">${esc(b.reading)}</div></div>
    <div class="sp ${b.tools.includes('quote') ? '' : 'off'}"><div class="who"><i>エンジン</i>見積</div><div class="wh">差額</div><div class="val">${b.quote > 0 ? '+' : ''}${man(b.quote)}万円</div></div>
    <div class="sp ${b.tools.includes('loan_check') ? '' : 'off'}"><div class="who"><i>エンジン</i>審査</div><div class="wh">返済負担率</div><div class="val">${b.ratio}%</div></div>
    <div class="sp ${b.tools.includes('schedule') ? '' : 'off'}"><div class="who"><i>エンジン</i>工程</div><div class="wh">本審査のやり直し</div><div class="val">+${b.days}日</div></div>
    <div class="sp fin"><div class="who"><i>判定</i></div><div class="wh">&nbsp;</div><div class="val">${esc(b.verdict)}</div></div></div></div>`;
}

// ---- ポップアップ ----
let SNS = null;
fetch('/data/sns_posts.json').then(r => r.json()).then(j => { SNS = j; }).catch(() => {});
const TOPIC = s => ({ lot: 'visit', survey: 'visit', hearing: 'hearing', forgot: 'hearing', plans: 'estimate', coord: 'coord', electric: 'coord', build: 'build', handover: 'build', year: 'year' }[s.scene] || ['visit', 'hearing', 'estimate', 'design', 'showroom', 'contract', 'coord', 'build', 'build', 'build', 'build', 'year'][s.step]);
export function snsHTML(s) {
  const t = TOPIC(s);
  const all = SNS?.posts || [];
  let list = all.filter(p => p.topic === t);
  if (list.length < 3) list = list.concat(all.filter(p => p.topic !== t).slice(0, 3));
  const seen = new Set(); const mixed = [];
  for (const p of list) if (!seen.has(p.stance)) { seen.add(p.stance); mixed.push(p); } // 立場を混ぜる
  for (const p of list) if (mixed.length < 5 && !mixed.includes(p)) mixed.push(p);
  return `<div class="pop"><div class="ph2"><div class="ttl"><span class="sns-h">ひろば</span><span class="meta">いまの話題：${esc(t)}</span></div><button class="close" data-act="closePop">閉じる</button></div>
    <div class="body">${mixed.slice(0, 5).map(p => `<div class="post"><div class="avt">${esc(p.name[0])}</div><div><div class="nm">${esc(p.name)}<span>${esc(SNS.stances[p.stance] || '')}</span></div><div class="tx">${esc(p.text)}</div></div></div>`).join('')}</div>
    <div class="ft"><span class="meta">架空のSNSです。通知はしません。閉じると、元の画面に戻ります。</span></div></div>`;
}
export function myaiHTML(s) {
  const a = s.myai && s.myai.scene === s.scene ? s.myai : null;
  const left = s.aiLeft[s.scene] ?? 1;
  const sketch = a && a.rooms && a.rooms.length ? `<div class="sketch">${[1, 2].map(f => { const rs = a.rooms.filter(r => r.floor === f); if (!rs.length) return ''; return `<figure><svg viewBox="0 0 400 300">${rs.map(r => `<rect x="${10 + r.col * 95}" y="${10 + r.row * 70}" width="90" height="64" rx="6" fill="#fff" stroke="#1E2B36" stroke-width="1.6"/><text x="${55 + r.col * 95}" y="${48 + r.row * 70}" text-anchor="middle" font-size="15" fill="#1E2B36">${esc(r.name).slice(0, 6)}</text>`).join('')}</svg><figcaption>${f}階の部屋の並び（自分のAIの略図）</figcaption></figure>`; }).join('')}</div>` : '';
  return `<div class="pop"><div class="ph2"><div class="ttl">${ICON.ai}自分のAI<span class="meta">施主のスマホの中の汎用AI。専門家ではありません</span></div><button class="close" data-act="closePop">閉じる</button></div>
    <div class="body">${a ? `<div class="ask">聞いたこと：<b>${esc(a.q)}</b></div><div class="ans">${esc(a.answer)}</div>${sketch}` : busy.on ? '<div class="ans">考えています……</div>' : '<div class="ask">1ターンに1回、短く答えます。</div>'}</div>
    <div class="ft">${a || !left ? `<span class="meta">このターンは、あと0回</span>` : `<input id="aiq" data-keep data-enter="askAI" placeholder="例：土地の期限が近いけど、詳細の見積まで待つべき？"><button class="btn" data-act="askAI">聞く</button>`}</div></div>`;
}
