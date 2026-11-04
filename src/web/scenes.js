/* ゆくすいえ　場面ごとの描画。数字はすべてエンジン（engine.js）から。仕組みの名前は画面に出さない */
import * as Y from './engine/engine.js';
import * as P from './parts.js';

// 金額の表示は万円単位の整数（計算の内部は小数のまま）
const man = n => Math.round(Number(n)).toLocaleString('ja-JP');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const NOTICE = '本作の制度・手続き・金額・期間などの設定は、体験のために簡略化しています。実際の家づくりでは、地域・金融機関・住宅会社によって異なります。登場する住宅会社・人物・団体はすべて架空です。';
const H = s => Y.HOUSEHOLDS[s.household];
const STAFFN = co => `${Y.COMPANIES[co].staffRole}・${Y.COMPANIES[co].staff}`;
const YOU = 7;
const pad = n => String(n).padStart(2, '0');
function dno(s, w) { if (!s.player || s.player.bits.length < 4 || w.bits.length < 4) return null; const pn = Y.worldNo(s.player.bits), n = Y.worldNo(w.bits); return n === pn ? YOU : n === YOU ? pn : n; }
const lab = (o, w) => typeof o.label === 'function' ? o.label(w) : o.label;
const chOf = s => s.player ? s.player.company : s.cur;

// ---- データ（情報収集、SNS）----
export const DATA = { sources: null, sns: null, personas: null, electrical: null, ai: null, brochures: null };
// 中身の素材集（data/content。期間中に claude.ai で作成）
for (const [k, f] of [['sources', 'info_sources'], ['sns', 'sns_posts'], ['personas', 'personas'], ['electrical', 'electrical'], ['ai', 'ai_assistant'], ['brochures', 'brochures']]) fetch(`/data/content/${f}.json`).then(r => r.json()).then(j => { DATA[k] = j; }).catch(() => {});
export const persona = co => DATA.personas?.staff.find(p => p.company === co);
export const coordinator = s => { const cs = DATA.personas?.coordinators || []; return cs[(s.seed + (s.player ? Y.worldNo(s.player.bits.concat([0, 0, 0, 0]).slice(0, 4)) : 0)) % (cs.length || 1)]; };

// ---- 上の帯・お金の札・時計 ----
function top(s) { return `<div class="top"><div class="logo"><img src="/brand/mark.svg" alt="" style="width:40px;height:40px;vertical-align:-10px;margin-right:4px">ゆくすいえ</div>${P.progress(s.step)}</div>`; }
function moneyBox(s) {
  const h = H(s);
  if (!s.player || s.forkNo === 0) {
    return `<div class="moneyc"><div class="hd">${s.player ? `${s.pair.map(c => Y.COMPANIES[c].name).join('と')}を見比べ中` : 'まだ会社は決まっていません'}</div>
      <div class="c"><div class="k">借りられそうな額</div><div class="v">${man(Y.loanLimit(h))}<small>万円まで</small></div><div class="sub">審査の目安（返済負担率35%）</div></div>
      <div class="c"><div class="k">土地（区画）</div><div class="v">${man(Y.landCost())}<small>万円</small></div><div class="sub">自己資金 ${man(h.saveHouse)}万円</div></div></div>`;
  }
  const m = Y.money(s.player), co = s.player.company;
  const signed = s.player.contracted && s.scene !== 'contract';
  const k = signed ? '総額（土地＋契約＋増工）' : '総額（土地＋建物の見積）';
  const sub = signed ? `土地 ${man(m.land)}＋契約 ${man(m.contract)}＋増工 ${man(m.add)}` : `土地 ${man(m.land)}＋建物 ${man(m.building)}`;
  return `<div class="moneyc"><div class="hd">${P.coTag(co, 18)}${Y.COMPANIES[co].name}${signed ? '　契約済み' : ''}</div>
    <div class="c"><div class="k">${k}</div><div class="v">${man(m.total)}<small>万円</small></div><div class="sub">${sub}</div></div>
    <div class="c"><div class="k">借入</div><div class="v">${man(m.loan)}<small>万円</small></div><div class="sub">自己資金 ${man(m.self)}万円</div></div></div>`;
}
// 時計の札：土地の契約までは「土地の契約期限」、そのあとは「ローン特約の期限」
const DAY_OF_STEP = [0, 6, 14, 24, 34, 48, 62, 80, 120, 170, 200, 565];
function dayOf(s) {
  const w = s.player || Y.newWorld({ household: H(s), company: s.visit[0] || 'C' });
  const d = Y.scheduleOf(w);
  let day = s.step === 0 ? 0 : d[Math.max(0, s.step - 1)];
  if (s.scene === 'reply') day += 1; // 帰り道の翌日
  if (s.scene === 'hearing' && s.visit[1] && s.cur === s.visit[1]) day += 4; // 2社目は、その週のうちに
  if (s.step >= 10) day = d[10]; // 引渡しの日は、結果の欄・比較と同じ値（工程表の同じ値）
  return day;
}
function clocks(s) {
  const day = dayOf(s);
  const out = [`<span class="clk"><b>${day}</b>日目</span>`];
  const landSigned = s.forkNo >= 1;
  if (!landSigned) out.push(`<span class="clk soft">土地の契約期限まで ${Math.max(0, Y.DEADLINE.land - day)}日</span>`);
  else if (s.step <= 5 && day < Y.DEADLINE.loan) out.push(`<span class="clk soft">ローン特約の期限 ${Y.DEADLINE.loan}日目</span>`);
  return `<div class="clks">${out.join('')}</div>`;
}
const chrome = s => top(s) + moneyBox(s) + clocks(s);

// ---- 選ばれなかった世界線（分岐を経るごとに 1 → 3 → 7 → 15。番号は15がそろってから）----
const PACE = { A: [1.12, 0.95], B: [1.15, 1.1], C: [0.86, 1.0], D: [1.0, 0.92] };
const hash = n => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };
const hb = w => Y.hashStr(w.bits.join(''));
function stepOf(w, p) {
  const [pre, post] = PACE[w.company] || [1, 1];
  const j = (hash(hb(w) % 97) - 0.5) * 0.7;
  const v = p < 5 ? p * pre + j : 5 * pre + (p - 5) * post + j;
  return Math.max(0, Math.min(11, v));
}
const stageOf = st => st < 7 ? 0 : st < 8 ? 1 : st < 9 ? 2 : st < 9.6 ? 3 : 4;
const SHORT = [w => Y.COMPANIES[w.company].name, b => b ? '外形を変えた' : '提案の外形', b => b ? '外構まで' : '外構は最小限', b => b ? 'アップグレード' : '標準の仕上げ'];
const shortName = w => w.bits.map((b, i) => i === 0 ? w.company : i === 1 ? Y.ROOF_JA[w.spec.roof] : SHORT[i](b)).join('・');
const NOTES = [
  ['見積の表紙が届いた', '「別途」の行を数えた', '担当者に質問を送った', '総額で見積が届いた'],
  ['間取りの案が2つ届いた', '収納の数で少しもめた', '階段の位置を決めた', '詳細見積を待っている'],
  ['ショールームで迷う', '床と建具の色を見た', '窓のサンプルを見た'],
  ['契約の日取りを決めた', '月末に契約した', '本審査の書類をそろえた', 'ローン特約の期限を確かめた'],
  ['外壁の色で迷う', 'コンセントの数を数える', '照明の打ち合わせ', '床の見本を持ち帰った'],
  ['地鎮祭', '基礎の配筋を見に行った', '地盤の結果が出た'],
  ['上棟した', '差し入れを持って行った', '窓が入った'],
  ['施主検査', '付箋を12枚貼った', 'クロスの浮きを指摘した'],
  ['引渡し', '鍵を受け取った'],
];
function noteOf(w, st) {
  const band = st < 3 ? 0 : st < 4 ? 1 : st < 5 ? 2 : st < 6 ? 3 : st < 7 ? 4 : st < 8 ? 5 : st < 9 ? 6 : st < 10 ? 7 : 8;
  const pool = NOTES[band];
  if (band === 8 && w.bits.length === 4) { const o = Y.outcome(w); if (o.increase) return `+${o.increase}万円で引渡し`; }
  return pool[(hb(w) + band) % pool.length];
}
function gallery(s) {
  if (!s.others.length) return ['hearing', 'forgot', 'reply'].includes(s.scene) ? '<div class="galT solo"><b>選ばれなかった世界線</b><span>まだ分岐していません</span></div>' : '';
  const full = s.others.length === 15;
  const list = [...s.others].sort((a, b) => full ? dno(s, a) - dno(s, b) : a.bits.join('').localeCompare(b.bits.join('')));
  const cols = Math.max(list.length, 5);
  return `<div class="galT"><b>選ばれなかった世界線</b><span>${list.length}</span></div><div class="gal" style="grid-template-columns:repeat(${cols},1fr)">${list.map(w => {
    const st = stepOf(w, s.step), stage = stageOf(st);
    const x = { w: { ...w, no: hb(w) % 8 }, stage, ghost: st >= 2 && st < 7 ? +(0.35 + (st - 2) / 5 * 0.45).toFixed(2) : 0 };
    const short = full ? Y.worldName(Y.outcome(w)).split('、')[0] : esc(shortName(w));
    return `<div class="th ${s.newest.includes(w.bits.join('')) ? 'new' : ''}"><div class="thd"><span>${full ? pad(dno(s, w)) : ''}</span>${P.coTag(w.company, 18)}</div>${P.thumb(x)}<div class="tnm big">${short}</div><div class="tnt">${noteOf(w, st)}</div><div class="bar"><i style="width:${Math.round(st / 11 * 100)}%"></i></div></div>`;
  }).join('')}</div>`;
}
const tall = s => s.others.length ? '' : 'tall';

// ---- 自分の家：地縄の点線 → 各社の立体（半透明）→ 屋根の形が決まる → 契約で確定（白）→ 色の見本 → 工事で立ち上がる ----
function heroHouse(s) {
  const w = s.player || Y.newWorld({ household: H(s) });
  const ww = { ...w, no: YOU };
  const fin = Y.FINISH.wall.find(x => x.id === w.finish.wall) || Y.FINISH.wall[0];
  const col = fin.colors[w.finish.color || 0] || fin.colors[0];
  const finObj = { wall: col[1], roof: w.finish.wall === 'galva' ? col[1] : '#4A4F57' };
  if (s.step >= 7) { const stg = s.step < 8 ? 1 : s.step < 9 ? 2 : s.step < 10 ? 3 : 4; return P.bigHouse(ww, stg, { fin: finObj }); }
  if (s.scene === 'coord' || s.scene === 'electric' || (w.contracted && s.forkNo >= 4)) return P.bigHouse(ww, 4, { fin: finObj });
  if (w.contracted) return P.bigHouse(ww, 3, {});
  if (s.forkNo >= 2) return P.bigHouse(ww, 0, { ghost: 0.7 });
  if (s.step >= 2) return P.bigHouse(ww, 0, { ghost: 0.45, roof: w.spec.roof });
  return P.bigHouse(ww, 0, { ghost: 0 });
}
function hero(s, extra = '', cls = '') {
  const w = s.player || Y.newWorld({ household: H(s) });
  const co = s.player && s.forkNo > 0 ? `　${P.coTag(w.company, 28)}${Y.COMPANIES[w.company].name}` : s.player ? '　2社を見比べ中' : (s.cur ? `　${P.coTag(s.cur, 28)}${Y.COMPANIES[s.cur].name}で相談中` : '');
  const roofDecided = s.forkNo >= 2;
  const area = roofDecided || w.plan ? `${w.spec.tsubo}坪・${w.plan?.shape?.form || '総二階'}　${Y.ROOF_JA[w.spec.roof]}` : "間取りと屋根の形は、これから";
  return `<div class="hero ${tall(s)} ${cls}"><div class="lab"><span class="no">${pad(YOU)}</span>あなたの家${co}</div>
    <div class="ph">${Y.STEPS[s.step]}<br><span style="font-size:15px">${area}${w.fitted ? `（予算に合わせて${w.fitted}坪小さく）` : ''}</span></div>${heroHouse(s)}${extra}</div>`;
}

// いちばん近い世界：直前の分岐点だけ逆を選んだ世界を、1枚だけ大きく出す（数字はエンジン）
export function nearest(s, k) {
  const me = s.player; if (!me || me.bits.length < 1) return null;
  const i = k ?? me.bits.length - 1;
  return s.others.find(w => w.bits.length === me.bits.length && w.bits.every((b, j) => j === i ? b !== me.bits[j] : b === me.bits[j]));
}
function diffWords(me, w) {
  const out = [];
  if (me.company !== w.company) out.push(`${Y.COMPANIES[w.company].name}と建てている`);
  if (me.spec.roof !== w.spec.roof) out.push(`${Y.ROOF_JA[w.spec.roof]}の家`);
  if (me.spec.kitchen !== w.spec.kitchen) out.push(w.spec.kitchen ? '造作キッチンがある' : '造作キッチンはない');
  if (me.spec.exterior !== w.spec.exterior) out.push(w.spec.exterior === 'full' ? '入居の日から玄関前と庭が整う' : '玄関前は砂利のまま、外構はあとから');
  if (me.spec.window !== w.spec.window) out.push(w.spec.window === 'triple' ? '南の窓がトリプルガラス' : '南の窓は標準のガラス');
  if (me.spec.tsubo !== w.spec.tsubo) out.push(`広さは${w.spec.tsubo}坪になる`);
  if (Y.finishCost(me.finish) !== Y.finishCost(w.finish)) out.push(Y.finishCost(w.finish) ? '外壁や床をアップグレード' : '標準の仕上げ');
  const wa = Y.warmth(me.spec, me.company), wb = Y.warmth(w.spec, w.company);
  if (wa.level !== wb.level) out.push(`冬の朝は「${wb.label}」`);
  return out;
}
export function nearestCard(s) {
  const w = nearest(s); if (!w) return '';
  const i = s.player.bits.length - 1;
  const a = Y.money(s.player), b = Y.money(w);
  const d = Math.round(b.total - a.total), mo = Y.payment(b.loan, Y.RATE.variable) - Y.payment(a.loan, Y.RATE.variable);
  return `<div class="nearest"><div class="nk">いちばん近い世界：${Y.FORKS[i]}だけ逆を選んだ世界</div><b>${esc(w.labels[i])}</b>
    <div class="nd">総額 ${d > 0 ? '+' : ''}${man(d)}万円／月々 ${mo >= 0 ? '+' : '−'}${Math.abs(mo).toFixed(1)}万円</div><ul>${diffWords(s.player, w).slice(0, 3).map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>`;
}

// 希望との違い：守れない希望を、札と判定に出す（数字はエンジン）
export function wishLine(ch) {
  if (!ch.length) return '';
  const ng = ch.filter(c => !c.ok);
  const diffs = ch.filter(c => c.kind === 'totalMax' || c.kind === 'monthlyMax').map(c => `${c.kind === 'totalMax' ? '総額' : '月々'}${c.diff > 0 ? '+' : c.diff < 0 ? '−' : ''}${c.kind === 'monthlyMax' ? Math.abs(c.diff).toFixed(1) : man(Math.abs(c.diff))}万円`);
  return `<li class="wl">希望との違い：${diffs.join('／') || 'なし'}${ng.length ? `<br><b>この案では守れない希望：${ng.map(c => esc(c.label)).join('、')}</b>` : '<br>希望はすべて守れる'}</li>`;
}
// 希望のボード：わかった希望（付箋）・まだ決まっていないこと・次に決めること
const WISH_TXT = w => ({ totalMax: `総額 ${man(w.value)}万円以内`, monthlyMax: `月々 ${man(w.value)}万円以内`, areaMax: `${w.value}坪まで`, areaMin: `${w.value}坪は欲しい` }[w.kind] || w.text);
function boardHTML(s) {
  const st = s.heard.slice(-14);
  const undecided = [!s.player || s.forkNo === 0 ? '建てる会社' : '', s.forkNo < 2 ? '屋根の形と広さ' : '', !s.wishes.some(w => w.kind === 'totalMax' || w.kind === 'monthlyMax') ? '予算の上限' : '', s.forkNo < 3 ? '外構をどこまで' : '', s.forkNo < 4 ? '外壁と床の仕上げ' : ''].filter(Boolean);
  const next = { hearing: s.visit[1] === s.cur ? '2社の提案を見比べる' : '帰り道に、伝え忘れを確かめる', forgot: '2社目を訪ねる', reply: '2社目を訪ねる' }[s.scene] || '';
  return `<div class="board"><div class="bcol"><h4>わかった希望</h4><div class="bst">${st.length || s.wishes.length ? s.wishes.filter(w => w.kind !== 'priority').map(w => `<span class="sticky wish">${esc(WISH_TXT(w))}</span>`).join('') + st.map((h, i) => `<span class="sticky ${h.who === 'ゆう' ? 'yu' : h.who === 'かず' ? '' : 'both'}" style="--r:${(i * 37) % 7 - 3}deg">${esc(h.text.slice(0, 16))}</span>`).join('') : '<p class="note">担当者に話すと、ここに付箋がたまります。</p>'}</div></div>
    <div class="bcol small"><h4>まだ決まっていないこと</h4><ul>${undecided.map(t => `<li>${t}</li>`).join('')}</ul><h4>次に決めること</h4><p>${next}</p></div></div>`;
}

// ---- チャット ----
const ICON = {
  sns: '<svg viewBox="0 0 20 20"><rect x="2" y="3" width="16" height="11" rx="3" fill="none" stroke="#1E2B36" stroke-width="1.8"/><path d="M6 14 L5 18 L10 14" fill="none" stroke="#1E2B36" stroke-width="1.8" stroke-linejoin="round"/><line x1="6" y1="7" x2="14" y2="7" stroke="#1E2B36" stroke-width="1.6"/><line x1="6" y1="10" x2="11" y2="10" stroke="#1E2B36" stroke-width="1.6"/></svg>',
  ai: '<svg viewBox="0 0 20 20"><rect x="5" y="1.5" width="10" height="17" rx="2.4" fill="none" stroke="#1E2B36" stroke-width="1.7"/><line x1="8.5" y1="15.6" x2="11.5" y2="15.6" stroke="#1E2B36" stroke-width="1.5" stroke-linecap="round"/><path d="M7.6 6.4h4.8M7.6 9h3.2" stroke="#1E2B36" stroke-width="1.4" stroke-linecap="round"/></svg>',
};
function navs(s) {
  const left = s.aiLeft[s.scene] ?? 1;
  return `<div class="navs"><button class="nav" data-act="openPop" data-pop="sns">${ICON.sns}SNSを見る</button><button class="nav" data-act="openPop" data-pop="ai" ${left ? '' : 'disabled'}>${ICON.ai}自分のAIに聞く<span class="n">このターン あと${left}回</span></button></div>`;
}
function msgHTML(m) {
  if (m.who === 'sys') return `<div class="msg sys">${esc(m.text)}</div>`;
  if (m.who === 'staff') return `<div class="msg"><div class="who">${P.coTag(m.co, 18)}${Y.COMPANIES[m.co].name}・${STAFFN(m.co)}${m.mock ? '<span class="mk">代わりの処理</span>' : ''}</div>${esc(m.text)}${m.cond ? `<div class="cond">${m.cond.map(c => '・' + esc(c)).join('<br>')}</div>` : ''}</div>`;
  if (m.who === 'partner') return `<div class="msg"><div class="who"><i class="ci"></i>${esc(NAMES.yuu)}</div>${esc(m.text)}</div>`;
  if (m.who === 'yuu') return `<div class="msg me yu"><div class="who"><i class="ci"></i>${esc(NAMES.yuu)}${m.ai ? '<span class="mk">パートナー</span>' : ''}</div>${esc(m.text)}</div>`;
  return `<div class="msg me kz"><div class="who"><i class="sq"></i>${esc(NAMES.kazu)}</div>${esc(m.text)}</div>`;
}
export const NAMES = { kazu: 'あなた', yuu: 'パートナー' };
export const setNames = n => { NAMES.kazu = n?.a || 'あなた'; NAMES.yuu = n?.b || 'パートナー'; };
let WHO = 'kazu';
export const setWho = w => { WHO = w; };
export const getWho = () => WHO;
function whoSw() { if (MODE.solo) return ''; return `<div class="who-sw">話す人<button data-act="who" data-w="kazu" aria-pressed="${WHO === 'kazu'}"><i class="sq"></i>${esc(NAMES.kazu)}</button><button data-act="who" data-w="yuu" aria-pressed="${WHO === 'yuu'}"><i class="ci"></i>${esc(NAMES.yuu)}</button></div>`; }
export const MODE = { solo: true };
export const busy = { on: false };
export const INTRO = new Set();
export const FORK_DONE = { on: false, text: '' };
function failNote(s, ch) { return s.failed && s.failed.ch === ch ? `<div class="msg sys fail">担当者が応答できませんでした。<button class="linkbtn" data-act="retry">もう一度送る</button></div>` : ''; }
function chat(s, { ch, head = '', middle = '', opts = '', input = true, act = 'send', placeholder = '担当者に、自由に伝える・聞く', thinking = false, who = true } = {}) {
  const co = ch && 'ABCD'.includes(ch) ? ch : chOf(s);
  const log = s.chat.filter(m => m.ch === ch).slice(-16).map(msgHTML).join('') + failNote(s, ch) + (thinking ? `<div class="msg typing"><div class="who">${co ? P.coTag(co, 18) + STAFFN(co) : ''}</div>考えています……</div>` : '');
  return `<div class="chat">${head}<div class="log">${log}</div>${middle}${opts ? `<div class="opts">${opts}</div>` : ''}
    ${input ? `<div class="in">${who ? whoSw() : ''}<textarea id="say" rows="3" data-keep data-enter="${act}" placeholder="${placeholder}"></textarea><button class="btn" data-act="${act}">送る</button></div>` : ''}${navs(s)}</div>`;
}
function staffHead(co, state = 'idle', sub = '') {
  return `<div class="staffbar">${P.avatar(co, 78, state, 'id="face"')}<div class="nm">${Y.COMPANIES[co].name}<b>${STAFFN(co)}</b></div><div class="nm" style="margin-left:auto;text-align:right">${sub || Y.COMPANIES[co].kind}</div></div>`;
}
// 小さな絵（遊び方のページ）
const MINI = {
  lot: () => `<svg viewBox="-200 -40 400 260" width="360">${Array.from({ length: 16 }, (_, i) => { const r = Math.floor(i / 4), c = i % 4; const P2 = (x, y) => [(x - y) * 0.866, (x + y) * 0.5]; const a = P2(c * 50, r * 50), b = P2(c * 50 + 44, r * 50), d = P2(c * 50 + 44, r * 50 + 44), e = P2(c * 50, r * 50 + 44); return `<polygon points="${[a, b, d, e].map(p => p.join(',')).join(' ')}" fill="${i === 6 ? '#E8701F' : '#F3E7CF'}" stroke="${i === 6 ? '#E8701F' : '#9BD27A'}" stroke-width="2.5"/>`; }).join('')}</svg>`,
  chat: () => `<svg viewBox="0 0 360 220" width="360"><rect x="10" y="20" width="230" height="56" rx="14" fill="#F4F1EA"/><rect x="120" y="92" width="230" height="56" rx="14" fill="#FDEBDD"/><rect x="10" y="164" width="200" height="44" rx="14" fill="#F4F1EA"/><rect x="138" y="112" width="14" height="14" fill="#E8701F"/></svg>`,
  fork: () => `<svg viewBox="0 0 360 220" width="360" fill="none" stroke="#1E2B36" stroke-width="3"><path d="M20 110 H90"/><path d="M90 110 C130 110 130 50 170 50 H200"/><path d="M90 110 C130 110 130 170 170 170 H200" stroke-dasharray="7 6"/><path d="M200 50 C230 50 230 25 260 25 H340 M200 50 C230 50 230 75 260 75 H340" /><path d="M200 170 C230 170 230 145 260 145 H340 M200 170 C230 170 230 195 260 195 H340" stroke-dasharray="7 6"/><circle cx="90" cy="110" r="7" fill="#F2C230"/></svg>`,
  report: () => `<svg viewBox="0 0 360 220" width="360"><rect x="110" y="10" width="140" height="200" rx="6" fill="#fff" stroke="#1E2B36" stroke-width="3"/><path d="M130 50 H230 M130 80 H220 M130 110 H230 M130 140 H200" stroke="#1E2B36" stroke-width="3"/><rect x="130" y="166" width="22" height="22" fill="#E8701F"/><circle cx="175" cy="177" r="11" fill="#1C8DCC"/></svg>`,
};
const HOWTO = [
  ['あなたは', 'lot', '初めて家を建てる共働きの夫婦になります。分譲地の区画が当たったところから始まります。'],
  ['やること', 'chat', '家づくりの手順（上の12段階）に沿って、住宅会社の担当者と話しながら進めます。4つの分岐点で選びます。2択の札を押しても、自分の言葉で答えてもかまいません。'],
  ['同時に進む世界', 'fork', '選ばなかった道も、別の世界線として同時に進みます。1年後に、16の区画を見比べられます。'],
  ['持ち帰るもの', 'report', '最後に「わが家の、ちょうどいいバランス」のレポートを受け取ります。本物の打ち合わせに持っていけます。'],
];
const played = () => { try { return !!localStorage.getItem('yuku-last'); } catch { return false; } };

// ---- 場面 ----
export const SCENES = {
  start(s) {
    const last = (() => { try { return localStorage.getItem('yuku-last'); } catch { return null; } })();
    const list = Array.from({ length: 16 }, (_, i) => ({ w: { no: i * 3, spec: { roof: ['hip', 'cube', 'mane', 'gable'][i % 4], exterior: 'full' }, third: false }, stage: 4, ghost: 0, note: '' }));
    return `<div class="startbg">${P.estate2(list, {})}</div><div class="center" style="text-align:center;width:1500px">
      <h1 style="margin:0"><img src="/brand/lockup-horizontal.svg" alt="ゆくすいえ　YUKUSUIE 16 unbuilt futures" style="width:820px"></h1>
      <div class="catch">16回目の、マイホームへ。</div>
      <div style="display:flex;gap:18px;justify-content:center;margin-top:30px"><button class="big-btn" data-act="continueStart">打ち合わせを終えた家族で、続きから遊ぶ</button><button class="big-btn ghost" data-act="start">最初から遊ぶ</button>
      ${last ? `<a class="big-btn ghost" href="/?replay=${last}" style="text-decoration:none">前回のプレイを再生する</a>` : ''}</div>
    </div><div class="disc">${NOTICE}</div>`;
  },
  howto(s) {
    const [t, pic, body] = HOWTO[s.howto];
    const last = s.howto === HOWTO.length - 1;
    const first = s.howto === 0 ? `<div class="namebox"><label><i class="sq"></i>夫の呼び名<input id="nmA" maxlength="8" placeholder="かず" value="${esc(s.names.a === 'かず' ? '' : s.names.a)}"></label><label><i class="ci"></i>妻の呼び名<input id="nmB" maxlength="8" placeholder="ゆう" value="${esc(s.names.b === 'ゆう' ? '' : s.names.b)}"></label></div><p class="note">ニックネームで入力してください（空欄なら「かず」「ゆう」）。</p>
      <div class="modebox"><button class="mode" data-act="mode" data-m="solo" aria-pressed="${s.mode === 'solo'}"><b>ひとりで遊ぶ</b><span>あなたが夫になり、妻はAIが演じます</span></button><button class="mode" data-act="mode" data-m="duo" aria-pressed="${s.mode === 'duo'}"><b>ふたりで遊ぶ</b><span>交互に入力します</span></button></div>` : '';
    return `<div class="center howto"><div class="hk">遊び方　${s.howto + 1} / ${HOWTO.length}</div><div class="h2">${t}</div>${s.howto === 0 ? '' : `<div class="pic">${MINI[pic]()}</div>`}<p class="lead">${body}</p>${first}
      <div style="display:flex;gap:14px;justify-content:center"><button class="big-btn ${played() ? '' : 'ghost'}" data-act="howtoSkip">とばす</button><button class="big-btn ${played() ? 'ghost' : ''}" data-act="howtoNext">${last ? 'はじめる' : 'つぎへ'}</button></div></div>
      ${last ? `<div class="disc">${NOTICE}</div>` : ''}`;
  },
  family(s) {
    const h = H(s);
    return `<div class="full"><div class="h2">あなたの家族</div><p class="lead">${h.story}</p>
      <dl class="facts" style="max-width:900px"><dt>世帯</dt><dd>${esc(NAMES.kazu)}（夫）・${esc(NAMES.yuu)}（妻）・子ども2人</dd><dt>世帯年収</dt><dd>${man(h.income)}万円（共働き）</dd><dt>家に入れる預金</dt><dd>${man(h.saveHouse)}万円（ほかに手元に残す分 ${man(h.saveKeep)}万円）</dd><dt>借りられそうな額</dt><dd>${man(Y.loanLimit(h))}万円まで（審査の目安）</dd><dt>家の広さの目安</dt><dd>${h.area[0]}〜${h.area[1]}坪</dd></dl>
      <p class="note" style="margin-top:14px">金額はゲームの中の仮定です。</p>
      <div style="margin-top:36px;text-align:right"><button class="big-btn" data-act="toLotNoEntry">つぎへ</button></div></div>`;
  },
  entry(s) {
    return `<div class="full"><div class="h2">どんな家にしたいですか。</div><p class="lead">思いや理想を、自由に書いてください。好きな家の写真やスクリーンショット、気になったページのURLも置けます。<br>あとで担当者に伝える要望のもとになります（書かなくても進めます）。</p>
      <div style="display:grid;grid-template-columns:1.3fr 1fr;gap:30px">
        <div><div class="stickies" id="stickies" aria-live="polite"></div><textarea class="free" id="entryText" data-keep style="height:300px" placeholder="例：外観はシンプルでかっこよく。キッチンは家族の顔が見えるように。冬でも暖かい家がいい。"></textarea></div>
        <div><div class="drop" id="drop">ここに写真をドロップ／Ctrl＋Vで貼り付け<br><span style="font-size:15px">送る前に長辺1568pxまで縮小し、撮影場所などの埋め込み情報は消えます</span></div>
          <div class="thumbs">${(s.entry.photos || []).map(p => `<img src="${p}" alt="置いた写真">`).join('')}</div>
          <button class="flyer-btn" style="margin-top:14px" data-act="openPhone">スマホから送る（QRコード）</button>
          <p class="note" style="margin-top:12px">「つぎへ」で、ことば・写真・URLから要望の要素を読み取ります。写真そのものは保存しません。</p></div>
      </div>
      <div style="margin-top:30px;text-align:right"><button class="big-btn" data-act="toLot">つぎへ</button></div></div>`;
  },
  // 入口：書いていくと、付箋がその場で生まれる（句点・読点・改行で区切る。言葉は施主のまま）
  hearing_after() { if (document.getElementById('drop')) import('./actions.js').then(m => m.bindDrop()); },
  entry_after() {
    import('./actions.js').then(m => m.bindDrop());
    const ta = document.getElementById('entryText'), box = document.getElementById('stickies');
    if (!ta || !box) return;
    const draw = () => {
      const parts = ta.value.split(/[。\n！？!?]+/).map(t => t.trim()).filter(t => t.length >= 3).slice(0, 12);
      const have = [...box.children].map(el => el.dataset.t);
      parts.forEach((t, i) => { if (!have.includes(t)) { const el = document.createElement('span'); el.className = 'sticky'; el.dataset.t = t; el.textContent = t.length > 18 ? t.slice(0, 18) + '…' : t; el.style.setProperty('--r', ((i * 37) % 7 - 3) + 'deg'); box.appendChild(el); } });
      [...box.children].forEach(el => { if (!parts.includes(el.dataset.t)) el.remove(); });
    };
    ta.addEventListener('input', draw); draw();
  },
  lot(s) {
    const c = Y.coverageCheck(Y.baseSpec(H(s)));
    return `${top(s)}${moneyBox(s)}${clocks(s)}<div class="full" style="padding-top:150px"><div class="h2">分譲地の区画が当たりました。</div><p class="lead">第一希望は外れましたが、第二希望の区画が当たりました。${Y.DEADLINE.land}日以内に土地の契約を結びます。ここから、建物を建てる会社を探します。</p>
      <dl class="facts" style="max-width:1100px"><dt>広さ</dt><dd>約${Y.SITE.tsubo}坪（${Y.SITE.area}㎡）</dd><dt>用途地域</dt><dd>第一種住居地域</dd><dt>建蔽率／容積率</dt><dd>${Y.SITE.coverage * 100}%／${Y.SITE.far * 100}%</dd><dt>建てられる1階の外形の上限</dt><dd>${c.limit}㎡（カーポート・物置を含む）</dd><dt>土地の代金</dt><dd>${man(Y.SITE.price)}万円（水道の負担金 ${Y.SITE.waterFee}万円）</dd><dt>土地の契約の期限</dt><dd>当選から${Y.DEADLINE.land}日以内</dd></dl>
      <div style="margin-top:30px;text-align:right"><button class="big-btn" data-act="toSources">会社を探しはじめる</button></div></div>`;
  },
  sources(s) {
    const src = DATA.sources?.sources || [];
    const opened = src.filter(x => s.sources.includes(x.id));
    const pick = s.visit;
    return `${top(s)}${moneyBox(s)}${clocks(s)}<div class="full" style="padding-top:140px;display:grid;grid-template-columns:1fr 1.1fr;gap:36px">
      <div><div class="h2">情報を集める</div><p class="lead">気になる入口を開いてみましょう。どの話も、だれかの一面です。</p>
        <button class="flyer-btn" data-act="openPop" data-pop="flyers">各社のチラシ・ウェブサイトを見比べる</button>
        <div class="srcs">${src.map(x => `<button class="src" data-act="source" data-id="${x.id}" aria-pressed="${s.sources.includes(x.id)}"><b>${x.label}</b><span>${s.sources.includes(x.id) ? '開いた' : '開いてみる'}</span></button>`).join('')}</div></div>
      <div><div class="memo">${opened.length ? opened.map(x => `<div class="memo-s"><h4>${x.label}</h4>${'ABCD'.split('').map(co => (x.items[co] || []).map(n => `<p>${P.coTag(co, 18)}${esc(n.text)}</p>`).join('')).join('')}</div>`).join('') : '<p class="lead">入口を開くと、ここにメモがたまります。</p>'}</div>
        <div class="visitpick"><div style="font-weight:700;margin-bottom:8px">実際に訪ねる2社（${pick.length}/2）</div><div class="vp">${'ABCD'.split('').map(co => `<button class="vbtn" data-act="pickVisit" data-co="${co}" aria-pressed="${pick.includes(co)}">${P.coTag(co, 26)}${Y.COMPANIES[co].name}<small>${Y.COMPANIES[co].kind}</small></button>`).join('')}</div>
        <div style="text-align:right;margin-top:12px"><button class="big-btn" data-act="toVisit" ${pick.length === 2 ? '' : 'disabled'}>この2社を訪ねる</button></div></div></div></div>`;
  },
  survey(s) {
    const co = s.cur, h = H(s);
    const title = { A: '来場者アンケート', B: 'かんたんアンケート', C: 'はじめに、少しだけ教えてください', D: 'ご相談シート' }[co];
    return `${top(s)}${moneyBox(s)}<form class="sv ${co}" onsubmit="return false">
      <h3>${P.coTag(co, 40)}${Y.COMPANIES[co].name}　${title}</h3><div class="sub">Tabで次へ。Ctrl＋Enterで記入を終えて、担当者のところへ。</div>
      <div class="row"><div><label>家族構成</label><input id="sv_fam" value="夫婦と子ども2人"></div><div><label>いまの住まい</label><input id="sv_now" value="賃貸のアパート"></div></div>
      <div class="row"><div><label>ご予算の目安（総額）</label><input id="sv_budget" placeholder="わからなければ空欄で"></div><div><label>入居したい時期</label><input id="sv_when" value="来年の春ごろ"></div></div>
      <label><i class="sq"></i> ${esc(NAMES.kazu)} の要望</label><textarea id="sv_kazu">${esc(s.entry.text ? s.entry.text.slice(0, 80) : '')}</textarea>
      <label><i class="ci"></i> ${esc(NAMES.yuu)} の要望</label><textarea id="sv_yuu"></textarea>
      <label>気になっていること</label><textarea id="sv_worry" placeholder="例：お金のこと、性能のこと、間取りのこと"></textarea>
      <div style="margin-top:18px;text-align:right"><button class="btn" data-act="submitSurvey">書き終えた</button></div></form>
      <div class="svside">${P.avatar(co, 200, 'smile')}<p class="lead" style="margin-top:14px">${Y.COMPANIES[co].name}（${Y.COMPANIES[co].kind}）<br>${STAFFN(co)}</p>
      ${s.entryRead?.elements?.length ? `<p class="note" style="font-weight:700;margin-top:10px">入口で読み取った要望</p><div class="chips2">${s.entryRead.elements.map(e => `<span>${esc(e.text)}<small>${esc(e.from)}</small></span>`).join('')}</div>` : ''}
      <p class="note">世帯年収 ${man(h.income)}万円／借りられそうな額 ${man(Y.loanLimit(h))}万円までは、アンケートには書かなくても大丈夫です。</p></div>`;
  },
  hearing(s) {
    const co = s.cur, n = s.chat.filter(m => m.ch === co && (m.who === 'kazu' || m.who === 'yuu') && !m.ai).length, second = s.visit[1] === co;
    const need = second ? 2 : 3, left = Math.max(0, need - n);
    const last = [...s.chat].reverse().find(m => m.ch === co && m.who === 'staff');
    const choices = !busy.on && last?.choices?.length ? last.choices.map(c => `<button class="opt ch" data-act="choose" data-t="${esc(c)}">${esc(c)}</button>`).join('') + `<button class="opt ch" data-act="choose" data-t="おまかせします">おまかせ</button>` : '';
    const end = left === 0 ? `<button class="opt" data-act="${second ? 'toCompare' : 'toForgot'}" ${busy.on ? 'disabled' : ''}>${second ? 'ヒアリングを終えて、提案を待つ' : 'ヒアリングを終えて、帰宅する'}</button>` : `<span class="note" style="align-self:center">あと${left}回答えると、${second ? '提案を待てます' : '帰宅できます'}</span>`;
    const show = `<button class="opt" data-act="openShow">写真やURLを見せる</button>`;
    return `${chrome(s)}${hero(s, boardHTML(s), 'withboard')}<div class="right ${tall(s)}">${chat(s, { ch: co, head: staffHead(co, busy.on ? 'think' : 'idle', second ? '2社目' : '1社目'), opts: choices + end + show, thinking: busy.on, placeholder: '担当者の質問に答える・自由に伝える（選択肢を押してもかまいません）' })}</div>${gallery(s)}`;
  },
  forgot(s) {
    const co = s.visit[0];
    const said = s.chat.some(m => m.ch === 'partner' && (m.who === 'kazu' || m.who === 'yuu' || m.forgot));
    return `${chrome(s)}${hero(s)}<div class="right ${tall(s)}"><div class="chat"><div class="staffbar">${P.spouse('yuu', 70)}<div class="nm">帰り道<b>${esc(NAMES.yuu)}と話す</b></div></div>
      <div class="log">${s.chat.filter(m => m.ch === 'partner').map(msgHTML).join('')}</div>
      <div class="opts">${said ? `<button class="opt" style="background:var(--ink);color:var(--paper)" data-act="sendForgot">${Y.COMPANIES[co].staff}さんに送る</button>` : ''}<button class="opt" data-act="toSecond">${said ? '送らずに、2社目へ' : 'とくにない（2社目へ）'}</button></div>
      <div class="in"><textarea id="say" rows="3" data-keep data-enter="sayPartner" placeholder="伝え忘れたことを、ゆうに話す"></textarea><button class="btn" data-act="sayPartner">話す</button></div>${navs(s)}</div></div>${gallery(s)}`;
  },
  reply(s) {
    const co = s.visit[0];
    return `${chrome(s)}${hero(s)}<div class="right ${tall(s)}"><div class="chat msgapp"><div class="staffbar">${P.avatar(co, 64, busy.on ? 'think' : 'smile', 'id="face"')}<div class="nm">翌日　メッセージ<b>${Y.COMPANIES[co].name}・${STAFFN(co)}</b></div></div>
      <div class="log">${s.chat.filter(m => m.ch === 'msg').map(msgHTML).join('')}${failNote(s, 'msg')}${busy.on ? `<div class="msg typing">${Y.COMPANIES[co].staff}さんが入力中……</div>` : ''}</div>
      <div class="opts"><button class="opt" style="background:var(--ink);color:var(--paper)" data-act="toSecond" ${busy.on ? 'disabled' : ''}>2社目を訪ねる</button></div>${navs(s)}</div></div>${gallery(s)}`;
  },
  compare(s) {
    const tab = s.tab || s.visit[0];
    const spec = Y.baseSpec(H(s));
    const q = Y.quote(spec, tab, false);
    const shown = q.lines.filter(l => l.shown), hidden = q.lines.filter(l => !l.shown);
    const roof = Y.COMPANIES[tab].roof;
    const heard = s.heard.filter(h => h.co === tab || h.who === 'ふたり').slice(0, 4).map(h => h.text);
    const pitch = { A: '性能と保証を標準で。断熱は', B: '規格プランをもとに、ご要望に近い形を選びました。断熱は', C: '暮らしの時間帯に合わせて、南に開いた間取りにしました。断熱は', D: 'ご要望は全部入れておきました。細かいところは、これから一緒に。断熱は' }[tab];
    const thumb = P.thumb({ w: { no: 3, spec: { roof, exterior: 'full' }, company: tab, bits: [] }, stage: 4, ghost: 0 }, { style: 'width:300px;height:220px' });
    return `${chrome(s)}<div class="tabs">${s.visit.map(co => `<button class="tab" data-act="tab" data-co="${co}" aria-pressed="${co === tab}">${P.coTag(co, 24)}${Y.COMPANIES[co].name}</button>`).join('')}</div>
      <div class="qpanel"><div class="qh">${P.coTag(tab, 26)}${Y.COMPANIES[tab].name}の見積　<span>${q.label}</span></div><div class="qcover">${man(q.cover)}<small>万円</small></div>
        <table class="qt">${shown.map(l => `<tr><td>${l.label}</td><td>${l.range ? `概算 ${l.range[0]}〜${l.range[1]}万円` : man(l.v) + '万円'}</td></tr>`).join('')}${hidden.map(l => `<tr class="hid"><td>${l.label}</td><td>別途</td></tr>`).join('')}</table>
        <p class="note">${spec.tsubo}坪・総二階の案。地盤調査は${Y.COMPANIES[tab].groundTiming}。</p></div>
      <div class="ppanel"><div class="pp-top">${thumb}<div><h4>提案</h4><p>${pitch}等級${Y.COMPANIES[tab].insul}。</p>${heard.length ? `<p class="note">反映した要望：${heard.map(esc).join('、')}</p>` : ''}</div></div>
        ${chat(s, { ch: tab, head: '', opts: `<button class="opt" style="background:var(--ink);color:var(--paper)" data-act="toFork1">2社を見比べて、第一の分岐点へ</button>`, thinking: busy.on, act: 'askCompare', placeholder: `${Y.COMPANIES[tab].staff}さんに、見積や提案について聞く` })}</div>`;
  },
  // 分岐点：儀式にする。暗くなって札の名前と問いが大きく出て、2枚の札がメインの領域いっぱいに並ぶ。担当者は出てこない
  fork(s) {
    const d = Y.decisions(s.pair)[s.forkNo];
    if (!d && !FORK_DONE.on) return chrome(s) + hero(s) + gallery(s);
    if (FORK_DONE.on) return `${chrome(s)}${hero(s)}<div class="ritual done"><div class="rt-band">${esc(FORK_DONE.text)}</div><svg class="rt-lot" viewBox="0 0 1860 676" aria-hidden="true"><polygon points="560,284 848,448 580,601 292,438" pathLength="100"/></svg></div>${gallery(s)}`;
    const w = s.player;
    const card = side => { const t = Y.forkWorld(w); Y.choose(t, d, side); const m = Y.money(t), m0 = Y.money(w); const df = m.total - m0.total, mo = Y.payment(m.loan, Y.RATE.variable) - Y.payment(m0.loan, Y.RATE.variable); const lc = Y.loanCheck(H(s), m.loan);
      const co = Y.COMPANIES[t.company];
      const life = (w.company !== t.company || d.id === 'D1' ? `${co.kind}。担当は${co.staffRole}の${co.staff}さん、${Y.ROOF_JA[t.spec.roof]}の家` : diffWords(w, t)[0]) || '暮らしは大きくは変わらない';
      const mon = Y.payment(m.loan, Y.RATE.variable);
      return `<div class="rt-body"><div class="rt-name">${esc(lab(d[side], w))}</div><div class="rt-num">総額 ${man(m.total)}<small>万円</small>${Math.round(df) ? `<em>${df > 0 ? '+' : '−'}${man(Math.abs(df))}</em>` : ''}</div><div class="rt-sub">月々 約${mon.toFixed(1)}万円${Math.abs(mo) >= 0.05 ? `（${mo > 0 ? '+' : '−'}${Math.abs(mo).toFixed(1)}）` : ''}${lc.ok ? '' : '　審査の上限を超える'}${t.fitted && !w.fitted ? `　予算に合わせた案（${t.spec.tsubo}坪）` : ''}</div><div class="rt-life">${esc(life)}</div><ul class="wbox">${wishLine(Y.checkWishes(t, s.wishes))}</ul></div><div class="rt-house">${P.coTag(t.company, 26)}${P.bigHouse(t, d.id === 'D3' || d.id === 'D4' ? 4 : 3, {})}</div>`; };
    const pend = s.pendingTrade, side = s.pendingSide;
    const intro = INTRO.has(`${s.playId}-${d.no}`) ? '' : 'intro';
    let body;
    if (pend) {
      body = `<div class="rt-trade"><div class="msg"><div class="who">${P.coTag(w.company, 18)}${Y.COMPANIES[w.company].name}・${STAFFN(w.company)}${pend.call?.fallback ? '<span class="mk">代わりの処理</span>' : ''}</div>${esc(pend.message)}<div class="cond">${pend.result.conditions.map(c => '・' + esc(c)).join('<br>')}</div></div>
        ${pend.result.wishCheck?.length ? `<ul class="wbox">${wishLine(pend.result.wishCheck)}</ul>` : ''}${band(s)}
        <div class="rt-acts">${pend.result.verdict === 'いまは難しい' ? '<span class="note">この条件では進められません。</span><button class="opt" data-act="cancelTrade">ほかの答えを考える</button>' : '<button class="big-btn" data-act="approve">この条件で進める</button><button class="big-btn ghost" data-act="cancelTrade">やめておく</button>'}</div></div>`;
    } else if (side) {
      const asker = MODE.solo || WHO === 'kazu' ? 'yuu' : 'kazu', other = side === 'a' ? 'b' : 'a';
      body = `<div class="rt-cards picked"><div class="rt-card on">${card(side)}</div><div class="rt-card fly">${card(other)}</div></div>
        <div class="rt-why"><div class="msg"><div class="who"><i class="${asker === 'yuu' ? 'ci' : 'sq'}"></i>${esc(NAMES[asker])}</div>「${esc(s.pendingLabel || lab(d[side], w))}」だね。どうしてそっちにしたの？</div>
        <div class="rt-in"><textarea id="say" rows="2" data-keep data-enter="decideWhy" placeholder="理由を書く（書かなくても進めます）"></textarea><button class="big-btn" data-act="decideWhy">理由を伝える</button><button class="big-btn ghost" data-act="decideNoWhy">言わずに進む</button></div>
        <button class="linkbtn" data-act="unpick">札を選びなおす</button></div>`;
    } else {
      body = `<div class="rt-cards"><button class="rt-card" data-act="pickSide" data-side="a">${card('a')}</button><button class="rt-card" data-act="pickSide" data-side="b">${card('b')}</button></div>
        <div class="rt-in free">${whoSw()}<textarea id="say" rows="2" data-keep data-enter="freeAnswer" placeholder="${d.id === 'D3' ? '札を押すか、自分の言葉で答える（例：借入を少し増やして、南の大きな窓だけトリプルガラスにしたい）' : '札を押すか、自分の言葉で答える'}"></textarea><button class="btn" data-act="freeAnswer">送る</button></div>
        <div class="rt-navs">${navs(s)}</div>${busy.on ? '<div class="msg typing" style="margin:8px auto 0;max-width:600px">考えています……</div>' : ''}`;
    }
    return `${chrome(s)}${hero(s)}<div class="ritual ${intro}"><div class="rt-mark">${Y.FORKS[d.no]}</div><div class="rt-q">${d.q}</div>${body}</div>${gallery(s)}`;
  },
  fork_after(s) { const d = Y.decisions(s.pair)[s.forkNo]; if (d && !INTRO.has(`${s.playId}-${d.no}`)) setTimeout(() => INTRO.add(`${s.playId}-${d.no}`), 1600); },
  contract(s) {
    const m = Y.money(s.player), co = s.player.company, lc = Y.loanCheck(H(s), m.loan);
    return `${chrome(s)}${hero(s, nearestCard(s))}<div class="right ${tall(s)}"><div class="chat">${staffHead(co, 'smile')}<div class="log" style="padding:22px">
      <div class="msg"><div class="who">${P.coTag(co, 18)}${STAFFN(co)}</div>請負契約の書類です。図面と見積の内容をご確認ください。</div>
      <dl class="facts" style="font-size:20px;margin-top:10px"><dt>契約金額（建物）</dt><dd>${man(m.contract)}万円</dd><dt>土地</dt><dd>${man(m.land)}万円</dd><dt>総額</dt><dd>${man(m.total)}万円</dd><dt>借入</dt><dd>${man(m.loan)}万円（返済負担率 ${lc.ratio}%）</dd><dt>月々の返済（変動 ${Y.RATE.variable * 100}%）</dt><dd>約${(Math.round(lc.monthly * 100) * 100).toLocaleString('ja-JP')}円</dd><dt>選んだ道</dt><dd>${s.player.labels.map(esc).join('<br>')}</dd></dl></div>
      <div class="opts"><button class="opt" style="background:var(--ink);color:var(--paper)" data-act="toCoord">署名する</button></div>${navs(s)}</div></div>${gallery(s)}`;
  },
  // 設計申込・詳細打ち合わせ：設計担当と、間取りの骨組みと予算を確定させる（第二の分岐点の手前）
  plan(s) {
    const P0 = s.plan, co = s.player.company;
    if (!P0) return `${chrome(s)}<div class="hero tall"><div class="lab"><span class="no">07</span>間取りの骨組み</div><div class="zone skel">${zoningSVG(null)}</div><p class="lead" style="position:absolute;left:40px;bottom:40px">図面に落としています……</p></div><div class="right tall"><div class="chat">${staffHead(co, 'think', '設計申込・詳細打ち合わせ')}<div class="log"><div class="msg typing">いただいた要望を、間取りの骨組みにしています……</div></div></div></div>`;
    const cur = P0.view != null ? P0.options[P0.view] : { plan: P0.main, m: P0.mainM };
    const m = cur.m;
    const opt = (o, i) => { const d = Math.round(o.m.total - P0.mainM.total), mo = o.m.monthly - P0.mainM.monthly; return `<button class="cd pl ${P0.view === i ? 'on' : ''}" data-act="planView" data-i="${i}"><h4>${esc(o.plan.title)}</h4><ul><li>総額 ${d > 0 ? '+' : ''}${man(d)}万円／月々 ${mo >= 0 ? '+' : '−'}${Math.abs(mo).toFixed(1)}万円</li><li>${esc(o.effect)}</li></ul></button>`; };
    const facts = `<dl class="facts pf"><dt>延床</dt><dd>${m.tsubo}坪（1階 ${(m.f1 / Y.TSUBO).toFixed(1)}坪／2階 ${(m.f2 / Y.TSUBO).toFixed(1)}坪）</dd><dt>建蔽率</dt><dd>${m.coverage}㎡／上限 ${m.coverageLimit}㎡${m.coverageOk ? '' : '（超える）'}</dd><dt>総額</dt><dd>${man(m.total)}万円</dd><dt>月々の返済</dt><dd>約${m.monthly.toFixed(1)}万円${m.loanOk ? '' : '（審査の上限を超える）'}</dd></dl>`;
    const wl = m.wishes.length ? `<ul class="wbox">${wishLine(m.wishes.map(w => ({ ...w, kind: /総額/.test(w.label) ? 'totalMax' : /月々/.test(w.label) ? 'monthlyMax' : 'area' })))}</ul>` : '';
    return `${chrome(s)}<div class="hero tall"><div class="lab"><span class="no">07</span>間取りの骨組み　<span style="font-size:18px;color:var(--ink2)">${esc(cur.plan.title)}${P0.fallback ? '<span class="mk">代わりの処理</span>' : ''}</span></div><div class="zone">${zoningSVG(cur.plan)}</div><div class="pfacts">${facts}${wl}</div></div>
      <div class="right tall"><div class="chat">${staffHead(co, busy.on ? 'think' : 'idle', '設計申込・詳細打ち合わせ')}<div class="log" style="justify-content:flex-start">${s.chat.filter(m2 => m2.ch === 'plan').map(msgHTML).join('')}${busy.on ? '<div class="msg typing">図面に落としています……</div>' : ''}</div>
      <div class="fk"><div class="q">調整の案（押すと、図と金額が動きます）</div><div class="cards">${P0.options.map(opt).join('')}</div>${P0.view != null ? `<button class="opt" style="margin-top:8px" data-act="planView" data-i="-1">元の案に戻す</button>` : ''}</div>
      <div class="opts"><button class="opt" style="background:var(--ink);color:var(--paper)" data-act="planConfirm" ${busy.on ? 'disabled' : ''}>この間取りの骨組みと予算で、設計を進める</button><span class="note" style="align-self:center">調整はあと${Math.max(0, 3 - (s.planRound || 0))}回</span></div>
      <div class="in">${whoSw()}<textarea id="say" rows="3" data-keep data-enter="planAsk" placeholder="例：書斎はいらない／子ども部屋は将来仕切る／収納は一か所にまとめたい"></textarea><button class="btn" data-act="planAsk" ${(s.planRound || 0) >= 3 ? 'disabled' : ''}>伝える</button></div>${navs(s)}</div></div>`;
  },
  // 第四の分岐点：コーディネートで選んだ結果が、そのまま分岐点の答えになる
  coord(s) {
    const w = s.player, f = w.finish;
    const wall = Y.FINISH.wall.find(x => x.id === f.wall) || Y.FINISH.wall[0];
    const opt = (k, x) => `<button class="o" data-act="finish" data-k="${k}" data-v="${x.id}" aria-pressed="${f[k] === x.id}"><span class="sw" style="background:${x.sw || x.colors[0][1]}"></span>${x.label}<em>${x.v ? '+' + x.v + '万円' : '標準'}</em></button>`;
    const add = Y.finishCost(f);
    return `${chrome(s)}${hero(s, `<div class="forkmark">${Y.FORKS[3]}</div>${nearestCard(s)}`)}<div class="right ${tall(s)}"><div class="chat"><div class="staffbar">${P.avatar(coordinator(s)?.gender === 'male' ? 'IC2' : 'IC', 70, 'smile')}<div class="nm">${Y.COMPANIES[w.company].name}<b>コーディネーター・${esc(coordinator(s)?.name || '中村')}</b></div><div class="nm" style="margin-left:auto;text-align:right">${Y.FORKS[3]}<br><b style="font-size:22px">どう仕上げる？</b></div></div>
      <div class="log coord" style="padding:14px 22px;justify-content:flex-start">
      <div class="msg"><div class="who">コーディネーター・${esc(coordinator(s)?.name || '中村')}</div>${esc((coordinator(s)?.tone || ['外壁と床、内壁を決めましょう。'])[0])}標準からの増額だけ、お伝えしますね。</div>
      <h4>外壁</h4>${Y.FINISH.wall.map(x => opt('wall', x)).join('')}
      <div class="colors">${wall.colors.map((c, i) => `<button data-act="finish" data-k="color" data-v="${i}" aria-pressed="${(f.color || 0) === i}" style="background:${c[1]}" title="${c[0]}"></button>`).join('')}</div>
      <h4>床</h4>${Y.FINISH.floor.map(x => opt('floor', x)).join('')}<h4>内壁</h4>${Y.FINISH.inner.map(x => opt('inner', x)).join('')}</div>
      <div class="opts"><span style="font-size:18px;align-self:center">${add ? `アップグレード +${man(add)}万円` : '標準の仕上げのまま'}</span><button class="opt" style="margin-left:auto;background:var(--ink);color:var(--paper)" data-act="decideCoord">これで決める</button></div>${navs(s)}</div></div>${gallery(s)}`;
  },
  electric(s) {
    const w = s.player, co = w.company, adds = Y.ELECTRIC.options.filter(o => w.electric.includes(o.id));
    const told = Y.ELECTRIC.options.filter(o => !w.electric.includes(o.id) && s.chat.some(m => (m.who === 'kazu' || m.who === 'yuu') && m.ch !== 'elec' && Y.ELECTRIC_WORDS[o.id].test(m.text)));
    const cands = Y.ELECTRIC.options.filter(o => !w.electric.includes(o.id));
    return `${chrome(s)}${hero(s)}<div class="right ${tall(s)}"><div class="chat">${staffHead(co, busy.on ? 'think' : 'idle', '電気の打ち合わせ')}<div class="log" style="padding:14px 22px;justify-content:flex-start">
      <div class="elbox"><div><h4>標準仕様</h4><ul class="elist">${(Y.ELECTRIC.standardBy[co] || Y.ELECTRIC.standard).map(t => `<li>${t}</li>`).join('')}</ul></div>
      <div><h4>契約に入れてあるオプション</h4><ul class="elist">${adds.length ? adds.map(o => `<li class="add"><b>${o.label}</b></li>`).join('') : '<li style="list-style:none;margin-left:-1.2em;color:var(--ink2)">なし</li>'}</ul></div></div>
      <div class="msg" style="margin-top:12px"><div class="who">${P.coTag(co, 18)}${STAFFN(co)}</div>電気の打ち合わせです。上の内容で進めますが、問題ないでしょうか。</div>
      ${s.chat.filter(m => m.ch === 'elec').map(msgHTML).join('')}${failNote(s, 'elec')}</div>
      <div class="opts"><button class="opt" style="background:var(--ink);color:var(--paper)" data-act="toBuild">この内容でOK</button></div>
      <div class="tags"><span>要望の候補：</span>${cands.map(o => `<button data-act="elecTag" data-id="${o.id}">${o.label}</button>`).join('')}</div>
      <div class="in">${whoSw()}<textarea id="say" rows="3" data-keep data-enter="sendElectric" placeholder="気になるところを指摘する（例：テレビは壁掛けにしたいと伝えていたはず）"></textarea><button class="btn" data-act="sendElectric">伝える</button></div>${navs(s)}</div></div>${gallery(s)}`;
  },
  // S6：「着工する ▶」で、工程が自動で進む。前の工程で立ったフラグ（聞き漏れ）だけが、施主検査で芽を出す
  build(s) {
    const days = Y.scheduleOf(s.player);
    const INSPECT = /窓|収納|下地|コンセント|照明|床|壁|扉|棚|洗面|キッチン|テレビ|エアコン|LAN|手すり|クロス|スイッチ/;
    const found = s.missed.filter(m => m.co === s.player.company && INSPECT.test(m.said || '')).slice(0, 2);
    const rows = [[7, '申請・着工', '確認の申請がおりて、地鎮祭。基礎の工事に入る'], [8, '上棟', '骨組みが立ち上がる。家の形がいちばんわかる日'], [9, '施主検査', found.length ? `頼んだとおりか確かめる。気づいたこと：${found.map(m => esc(m.said)).join('／')}` : '頼んだとおりか、付箋を貼って確かめる'], [10, '引渡し', '鍵を受け取る']];
    const auto = s.buildAuto;
    return `${chrome(s)}${hero(s)}<div class="right ${tall(s)}"><div class="chat"><div class="staffbar"><div class="nm">工事の帳面<b>着工から引渡しまで</b></div></div>
      <ol class="timeline">${rows.map(([st, t, d]) => `<li class="${s.step >= st && (auto || st === 7 && s.step > 7) ? 'on' : ''}"><b>${days[st]}日目</b><span><b>${t}</b><br>${d}</span></li>`).join('')}</ol>
      <div class="opts" style="margin-top:auto">${auto ? '<span class="note">工事が進んでいます……</span>' : `<button class="opt" style="background:var(--ink);color:var(--paper)" data-act="startBuild">着工する ▶</button>`}</div>${navs(s)}</div></div>${gallery(s)}`;
  },
  // S7：白いフェードで入る引渡し式。動きが止まったら「写真を保存」と「そして1年後……」
  handover(s) {
    const m = Y.money(s.player);
    return `${chrome(s)}<div class="hero tall cer">${ceremonySVG(s)}</div><div class="right tall"><div class="chat">${staffHead(s.player.company, 'smile')}<div class="log" style="padding:22px">
      <div class="msg"><div class="who">${P.coTag(s.player.company, 18)}${STAFFN(s.player.company)}</div>鍵をお渡しします。おめでとうございます。</div>
      <dl class="facts" style="font-size:20px;margin-top:12px"><dt>最終の総額</dt><dd>${man(m.total)}万円</dd><dt>うち増工</dt><dd>${man(m.add)}万円</dd><dt>借入</dt><dd>${man(m.loan)}万円</dd><dt>引渡し</dt><dd>${Y.outcome(s.player).days}日目</dd></dl></div></div></div>
      <button class="photo late" data-act="savePhoto">写真を保存</button><button class="big-btn next1y late" data-act="toSeasons">そして1年後……</button><div class="whitefade"></div>`;
  },
  // 1年のうつろい：空の色と木の葉が、夏→秋→冬→春と移り変わる（夜は通らない）。最後に「1年後」の札
  seasons(s) {
    return `<div class="seasons"><div class="sky"></div><div class="tree"><i></i><i></i><i></i><i></i><i></i></div><div class="ground"></div><div class="tag1y">1年後</div></div>`;
  },
  // S8a：1年後のわが家（リザルト）。選択の結果が絵に出る
  result(s) {
    const o = Y.outcome(s.player);
    return `${top(s)}${moneyBox(s)}<div class="hero tall res">${lifeSVG(s, o)}</div><div class="card"><h3>${pad(YOU)}　あなたの家の、1年後</h3>
      <dl><dt>冬の朝</dt><dd>${o.warmth.label}</dd><dt>家計のゆとり</dt><dd>${o.slack.label}</dd><dt>総額</dt><dd>${man(o.total)}万円</dd><dt>借入</dt><dd>${man(o.principal)}万円</dd></dl>
      <div style="font-size:16px;color:var(--ink2);font-weight:700">この1年の出来事</div><ul class="ev">${(o.events.length ? o.events : ['大きな出来事はなかった']).slice(0, 3).map(e => `<li>${esc(e)}</li>`).join('')}</ul>
      <div style="font-size:16px;color:var(--ink2);font-weight:700;margin-top:14px">一つだけ選択が違う世界</div>
      <table class="cmp near4">${[0, 1, 2, 3].map(i => { const w = nearest(s, i); if (!w) return ''; const ow = Y.outcome(w); return `<tr><td>${Y.FORKS[i]}だけ逆</td><td>${esc(w.labels[i])}</td><td>${ow.total - o.total > 0 ? '+' : ''}${man(ow.total - o.total)}万円</td><td>${ow.warmth.label}</td></tr>`; }).join('')}</table>
      <div class="acts"><button class="btn" data-act="toYear">16の区画を見る</button></div></div>`;
  },
  year(s) {
    const all = [s.player, ...s.others].map(w => ({ w, o: Y.outcome(w), n: dno(s, w) })).sort((a, b) => a.n - b.n);
    P.setYou(YOU);
    const list = all.map(({ w, n }) => ({ w: { ...w, no: n }, stage: 4, ghost: 0, note: '' }));
    const cur = s.lot || YOU;
    const sel = all.find(x => x.n === cur) || all.find(x => x.n === YOU);
    const o = sel.o, mine = sel.n === YOU;
    const line = s.staff16?.lines?.find(l => l.no === o.no)?.line;
    return `${top(s)}${moneyBox(s)}<div class="estate" title="区画を押すと、その世界が右に出ます">${P.estate2(list, { hi: [cur] })}</div>
      <div class="card"><h3>${pad(sel.n)}　${P.coTag(o.company, 30)}${Y.COMPANIES[o.company].name}${mine ? '　あなたの世界' : ''}</h3><div class="wname">${esc(Y.worldName(o))}</div>
      <ol>${o.labels.map(esc).map((l, i) => `<li>${Y.FORKS[i]}：${l}</li>`).join('')}</ol>
      <dl><dt>総額</dt><dd>${man(o.total)}万円</dd><dt>借入</dt><dd>${man(o.principal)}万円</dd><dt>冬の朝</dt><dd>${o.warmth.label}</dd><dt>家計のゆとり</dt><dd>${o.slack.label}</dd><dt>引渡し</dt><dd>${o.days}日目</dd></dl>
      <div style="font-size:16px;color:var(--ink2);font-weight:700">この1年の出来事</div><ul class="ev">${(o.events.length ? o.events : ['大きな出来事はなかった']).map(e => `<li>${esc(e)}</li>`).join('')}</ul>
      ${line ? `<div class="ln">${P.coTag(o.company, 18)} ${STAFFN(o.company)}：${esc(line)}</div>` : ''}
      <div class="acts"><button class="btn ghost" data-act="toTree" data-no="${sel.n}">世界樹で、この世界をたどる</button><button class="btn" data-act="toReport">レポートを受け取る</button></div></div>`;
  },
  // 区画を押す：押した位置をアイソメの逆算で区画に直す（16区画は表示の番号順に並ぶ）
  year_after() {
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
  report(s) {
    const r = s.report, o = Y.outcome(s.player);
    if (!r) return `${top(s)}<div class="center" style="text-align:center">${P.avatar(s.player.company, 160, 'think')}<p class="lead" style="margin-top:20px">決断の記憶から、レポートを書いています……</p></div>`;
    if (r.failed) return `${top(s)}<div class="center" style="text-align:center"><p class="lead">レポートを書けませんでした。</p><button class="big-btn" data-act="retryReport">もう一度</button></div>`;
    const tab = s.rtab || 'home';
    const tabs = [['home', 'わが家'], ['worlds', '選ばれなかった世界線'], ['honne', 'それぞれの事情と見積の透視']].map(([k, l]) => `<button class="tab" data-act="rtab" data-k="${k}" aria-pressed="${tab === k}">${l}</button>`).join('');
    let body = '';
    if (tab === 'home') body = `<div class="rep"><div class="box"><div style="font-size:18px;color:var(--ink2)">わが家の、ちょうどいいバランス</div><div class="h2" style="font-size:40px">${esc(r.title)}</div>
      <div style="display:flex;gap:20px;align-items:center">${radarSVG(s, 300)}<div><h3 style="margin-top:0">悩んだら、これを優先する</h3><ol>${r.balance.map(x => `<li>${esc(x)}</li>`).join('')}</ol></div></div>
      <h3>分岐点で、守ろうとしたもの</h3><ul>${r.memories.map((x, i) => `<li><b>${Y.FORKS[i] || ''}</b>　${esc(x)}</li>`).join('')}</ul></div>
      <div class="box"><h3>本物の打ち合わせで、先に伝えておきたいこと</h3><ol>${r.tellFirst.map(x => `<li>${esc(x)}</li>`).join('')}</ol>
      ${keptHTML(s)}
      ${r.couple ? `<h3>ふたりの傾向</h3><p class="lead" style="margin-bottom:8px">${esc(r.couple)}</p>` : ''}
      <h3>1年後のあなたの家</h3><dl class="facts" style="font-size:19px"><dt>総額</dt><dd>${man(o.total)}万円</dd><dt>借入</dt><dd>${man(o.principal)}万円</dd><dt>冬の朝</dt><dd>${o.warmth.label}</dd><dt>家計のゆとり</dt><dd>${o.slack.label}</dd></dl>
      <p class="lead" style="margin-top:16px">${esc(r.closing)}</p></div></div>`;
    if (tab === 'worlds') { const ws = [s.player, ...s.others].map(w => ({ w, o: Y.outcome(w), n: dno(s, w) })).sort((a, b) => a.n - b.n);
      const meO = Y.outcome(s.player);
      body = `<div class="rep1"><div class="treehint"><button class="btn" data-act="toTree">世界樹で見る</button><span class="note">分岐点ごとの選択をたどって、16の家を見られます</span></div><table class="wtab">${ws.map(({ o: oo, n }) => `<tr class="${n === YOU ? 'me' : ''}"><td>${pad(n)}</td><td>${P.coTag(oo.company, 20)}</td><td><b>${esc(Y.worldName(oo))}</b><span>${n === YOU ? 'あなたが選んだ世界' : '教訓：' + esc(Y.worldLesson(oo, meO))}</span></td><td>${oo.warmth.label}</td><td>${oo.slack.label}</td><td>${man(oo.total)}万円</td></tr>`).join('')}</table></div>`; }
    if (tab === 'honne') body = honneBody(s);
    return `${top(s)}<div class="rtabs">${tabs}</div><div class="racts"><button class="btn ghost" data-act="toTree">世界樹で見る</button><button class="btn ghost" data-act="print">印刷用（PDF）</button><button class="btn" data-act="toEnd">おわりへ</button></div>${body}`;
  },
  // 世界樹：根から4つの分岐点を経て、16の枝先に家が並ぶ。枝先を押すと、その道が根から描かれる
  tree(s) {
    const all = [s.player, ...s.others].map(w => ({ w, o: Y.outcome(w), n: dno(s, w) }));
    const byNo = Object.fromEntries(all.map(x => [Y.worldNo(x.w.bits), x]));
    const meO = Y.outcome(s.player), mine = Y.worldNo(s.player.bits);
    const selN = s.treeSel || YOU, sel = all.find(x => x.n === selN) || all.find(x => x.n === YOU);
    const X = k => 120 + k * 235, LY = i => 110 + i * 58, nodeY = (k, j) => { const span = 16 >> k; let a = 0; for (let i = j * span; i < (j + 1) * span; i++) a += LY(i); return a / span; };
    const onPath = (bits, k, j) => (j === parseInt(bits.slice(0, k).join('') || '0', 2));
    const lab = (k, x) => { const w = x.w; return k === 1 ? Y.COMPANIES[w.company].name : k === 2 ? Y.ROOF_JA[w.spec.roof] : k === 3 ? (w.spec.exterior === 'full' ? '外構まで' : '外構は最小限') : (Y.finishCost(w.finish) ? 'アップグレード' : '標準の仕上げ'); };
    let edges = '', labels = '', hi = '';
    for (let k = 1; k <= 4; k++) for (let j = 0; j < (1 << k); j++) {
      const pj = j >> 1, x0 = X(k - 1), y0 = nodeY(k - 1, pj), x1 = X(k), y1 = nodeY(k, j);
      const leaf = byNo[(j << (4 - k)) + 1];
      const d = `M${x0},${y0} C${(x0 + x1) / 2},${y0} ${(x0 + x1) / 2},${y1} ${x1},${y1}`;
      const me = onPath(s.player.bits, k, j), sl = onPath(sel.w.bits, k, j);
      edges += `<path d="${d}" pathLength="1" class="edge l${k} ${me ? 'me' : ''}" style="--d:${(k - 1) * 0.35}s"/>`;
      if (sl) hi += `<path d="${d}" pathLength="1" class="edge sel" style="--d:${(k - 1) * 0.3}s"/>`;
      if (k <= 3 || sl || me) labels += `<text x="${x1 - 8}" y="${y1 - 7}" text-anchor="end" class="elab ${sl ? 'on' : ''}">${esc(lab(k, leaf))}</text>`;
      labels += `<circle cx="${x1}" cy="${y1}" r="${k === 4 ? 4 : 6}" class="node ${me ? 'me' : ''} ${sl ? 'on' : ''}"/>`;
    }
    const leaves = Array.from({ length: 16 }, (_, i) => { const x = byNo[i + 1]; const th = P.thumb({ w: { ...x.w, no: x.n }, stage: 4, ghost: 0 }, { style: 'width:62px;height:46px' });
      return `<button class="leaf ${x.n === selN ? 'on' : ''} ${x.n === YOU ? 'me' : ''}" data-act="treeSel" data-no="${x.n}" style="top:${LY(i) - 26}px;left:${X(4) + 14}px"><span class="ln">${pad(x.n)}</span>${th}<span class="lt">${esc(Y.worldName(x.o).split('、')[0])}</span></button>`; }).join('');
    const o = sel.o, days = Y.scheduleOf(sel.w), at = [days[2], days[3], days[5], days[6]];
    const div = o.bits.findIndex((b, i) => b !== meO.bits[i]);
    const tl = o.labels.map((l, i) => `<li class="${i === div ? 'dv' : ''}"><b>${Y.FORKS[i]}</b><span>${esc(l)}</span><em>${at[i]}日目${i === div ? '　ここであなたと分かれた' : ''}</em></li>`).join('');
    const d = Math.round(o.total - meO.total);
    return `<div class="treebg"></div><div class="treetop"><div class="h2" style="margin:0">世界樹</div><span class="note">枝先の家を押すと、その世界線を根からたどります。金色の道が選んでいる世界、橙の道があなたの世界です。</span><button class="btn ghost" data-act="treeBack">戻る</button></div>
      <svg class="treesvg ${s.treeSeen ? 'seen' : ''}" viewBox="0 0 1920 1080"><circle cx="${X(0)}" cy="540" r="10" class="node root"/><text x="${X(0)}" y="575" text-anchor="middle" class="elab">区画が当たった日</text>${edges}${hi}${labels}</svg>${leaves}
      <div class="tpanel"><div class="tp-h"><span class="no2">${pad(sel.n)}</span>${P.coTag(o.company, 24)}${sel.n === YOU ? '<span class="mk">あなたの世界</span>' : ''}</div><div class="h2" style="font-size:28px;margin:4px 0 6px">${esc(Y.worldName(o))}</div>
        <div class="tp-house">${P.bigHouse({ ...sel.w, no: sel.n }, 4, {})}</div>
        <ol class="tp-tl">${tl}<li><b>1年後</b><span>${esc((o.events[0] || '大きな出来事はなかった'))}</span></li></ol>
        <dl class="facts tp-f"><dt>総額</dt><dd>${man(o.total)}万円${sel.n === YOU ? '' : `（あなたと ${d > 0 ? '+' : ''}${man(d)}）`}</dd><dt>冬の朝</dt><dd>${o.warmth.label}</dd><dt>家計のゆとり</dt><dd>${o.slack.label}</dd></dl>
        <div class="tp-k"><b>この世界線での気づき</b><p>${esc(Y.worldLesson(o, meO))}</p>${o.causes.length ? `<p class="note">なぜ起きたか：${esc(o.causes[0].cause)}</p>` : ''}</div></div>`;
  },
  tree_after(s) { if (!s.treeSeen) setTimeout(() => { s.treeSeen = true; }, 2200); },
  // 終わりの画面
  end(s) {
    return `<div class="center" style="text-align:center;width:1400px"><img src="/brand/lockup-horizontal.svg" alt="ゆくすいえ" style="width:620px">
      <div class="h2" style="margin-top:30px">遊んでくださって、ありがとうございました。</div>
      <p class="lead">本物の家づくりでも、あなたの「ちょうどいい」が見つかりますように。</p>
      <div style="display:flex;gap:16px;justify-content:center;margin-top:20px"><button class="big-btn" data-act="restart">もう一度遊ぶ</button>${s.savedId ? `<a class="big-btn ghost" href="/?replay=${s.savedId}" style="text-decoration:none">このプレイを再生する</a>` : ''}</div>
      <p class="note" style="margin-top:40px">Built with Claude: Japan 2026　／　© 2026 Studio ZaiYa</p></div><div class="disc">${NOTICE}</div>`;
  },
};

// いま起きたこと（帯）：仕組みの名前は出さず、起こった変化だけ（v4）。代わりの処理のときだけ小さく印を付ける
function band(s) {
  const b = s.band; if (!b) return '';
  return `<div class="band"><div class="bt">いま起きたこと<span>${b.by === 'Claude' ? '' : '代わりの処理'}</span></div><div class="steps">
    <div class="sp"><div class="who">受け止めたこと</div><div class="wh">${esc(b.reading)}</div></div>
    <div class="sp ${b.tools.includes('quote') ? '' : 'off'}"><div class="who">総額</div><div class="wh">見積の差</div><div class="val">${b.quote > 0 ? '+' : ''}${man(b.quote)}万円</div></div>
    <div class="sp ${b.tools.includes('loan_check') ? '' : 'off'}"><div class="who">借入</div><div class="wh">返済負担率</div><div class="val">${b.ratio}%</div></div>
    <div class="sp ${b.tools.includes('schedule') ? '' : 'off'}"><div class="who">工程</div><div class="wh">本審査のやり直し</div><div class="val">+${b.days}日</div></div>
    <div class="sp fin"><div class="who">判定</div><div class="wh">&nbsp;</div><div class="val">${esc(b.verdict)}</div></div></div></div>`;
}

// ---- ポップアップ ----
// いまの話題（素材の topic）。立場（stance）が混ざるように3〜5件を出す
function topicsOf(s) {
  if (s.scene === 'fork') return [['会社選び'], ['間取り'], ['契約', '窓・断熱', '外構']][s.forkNo] || ['見積'];
  return { lot: ['会社選び'], sources: ['会社選び'], survey: ['会社選び'], hearing: ['間取り', '会社選び'], forgot: ['間取り'], reply: ['間取り'], compare: ['見積', '会社選び'], contract: ['契約'], coord: ['コーディネート'], electric: ['電気'], build: ['工事'], handover: ['工事'], result: ['住んでから'], year: ['住んでから'] }[s.scene] || ['見積'];
}
export function snsHTML(s) {
  const ts = topicsOf(s);
  const all = DATA.sns?.posts || [];
  const list = all.filter(p => ts.includes(p.topic));
  const seen = new Set(); const mixed = [];
  const order = [...list].sort((a, b) => ((Y.hashStr(a.id) + s.step) % 7) - ((Y.hashStr(b.id) + s.step) % 7));
  for (const p of order) if (!seen.has(p.stance)) { seen.add(p.stance); mixed.push(p); }
  for (const p of order) if (mixed.length < 5 && !mixed.includes(p)) mixed.push(p);
  return `<div class="pop"><div class="ph2"><div class="ttl"><span class="sns-h">${esc(DATA.sns?.app || 'ひろば')}</span><span class="meta">いまの話題：${ts.join('・')}</span></div><button class="close" data-act="closePop">閉じる</button></div>
    <div class="body">${mixed.slice(0, 5).map(p => `<div class="post"><div class="avt">${esc(p.stance[0])}</div><div><div class="nm">${esc(p.stance)}<span>${esc((p.tags || []).join(' '))}</span></div><div class="tx">${esc(p.text)}</div></div></div>`).join('')}</div>
    <div class="ft"><span class="meta">架空のSNSです。通知はしません。閉じると、元の画面に戻ります。</span></div></div>`;
}
export function myaiHTML(s) {
  if (s.scene === 'electric' && DATA.ai) { const fx = DATA.ai.fixedForElectrical; const pick = fx.slice((s.seed + s.player.electric.length) % fx.length).concat(fx).slice(0, 2);
    return `<div class="pop"><div class="ph2"><div class="ttl"><span class="aimark">${ICON.ai}</span><span style="white-space:nowrap">自分のAI</span><span class="meta">電気の打ち合わせの、おすすめ</span></div><button class="close" data-act="closePop">閉じる</button></div><div class="body">${pick.map(x => `<p class="ans" style="margin-bottom:14px">${esc(x.text)}</p>`).join('')}</div><div class="ft"><span class="meta">スマホの中の汎用AIです。専門家ではありません。</span></div></div>`; }
  const a = s.myai && s.myai.scene === s.scene ? s.myai : null;
  const left = s.aiLeft[s.scene] ?? 1;
  const sketch = a && a.rooms && a.rooms.length ? `<div class="sketch">${[1, 2].map(f => { const rs = a.rooms.filter(r => r.floor === f); if (!rs.length) return ''; return `<figure><svg viewBox="0 0 400 300">${rs.map(r => `<rect x="${10 + r.col * 95}" y="${10 + r.row * 70}" width="90" height="64" rx="6" fill="#fff" stroke="#1E2B36" stroke-width="1.6"/><text x="${55 + r.col * 95}" y="${48 + r.row * 70}" text-anchor="middle" font-size="15" fill="#1E2B36">${esc(r.name).slice(0, 6)}</text>`).join('')}</svg><figcaption>${f}階の部屋の並び（自分のAIの略図）</figcaption></figure>`; }).join('')}</div>` : '';
  return `<div class="pop"><div class="ph2"><div class="ttl"><span class="aimark">${ICON.ai}</span><span style="white-space:nowrap">自分のAI</span><span class="meta">スマホの中の汎用AI。専門家ではありません</span></div><button class="close" data-act="closePop">閉じる</button></div>
    <div class="body">${a ? `<div class="ask">聞いたこと：<b>${esc(a.q)}</b></div><div class="ans">${esc(a.answer)}${a.mock ? '<span class="mk">代わりの処理</span>' : ''}</div>${sketch}` : busy.on ? '<div class="ans">考えています……</div>' : s.failed?.role === 'myai' ? '<div class="ans">応答できませんでした。もう一度聞いてみてください。</div>' : '<div class="ask">1ターンに1回、短く答えます。</div>'}</div>
    <div class="ft">${a || !left ? `<span class="meta">このターンは、あと0回</span>` : `<input id="aiq" data-keep data-enter="askAI" placeholder="例：土地の期限が近いけど、詳細の見積まで待つべき？"><button class="btn" data-act="askAI">聞く</button>`}</div></div>`;
}
// もし、あのとき：選ばれなかった世界を、分岐点ごとにたどって再生する（数字はエンジン、自分の世界と並べる）
export function worldHTML(s) {
  const all = [s.player, ...s.others];
  const w = all.find(x => dno(s, x) === s.lot) || s.player;
  const o = Y.outcome(w), me = Y.outcome(s.player), n = dno(s, w);
  const days = Y.scheduleOf(w);
  const at = [days[2], days[3], days[5], days[6]];
  const diverge = o.bits.findIndex((b, i) => b !== me.bits[i]);
  const rows = o.labels.map((l, i) => `<li style="animation-delay:${i * 0.7}s" class="${i === diverge ? 'dv' : ''}"><b>${at[i]}日目</b><span>${Y.FORKS[i]}「${Y.DECISIONS[i].q}」<br><strong>${esc(l)}</strong>${i === diverge ? '<em>ここで、あなたと分かれた</em>' : (i < diverge ? '<em>あなたと同じ</em>' : '')}</span></li>`).join('');
  const ev = (o.events.length ? o.events : ['大きな出来事はなかった']).map((e, i) => `<li style="animation-delay:${3 + i * 0.7}s"><b>${i ? '' : '1年後'}</b><span>${esc(e)}</span></li>`).join('');
  const cmp = (k, a, b) => `<tr><td>${k}</td><td>${a}</td><td>${b}</td></tr>`;
  return `<div class="pop wplay"><div class="ph2"><div class="ttl">決断の履歴　<span class="no2">${pad(n)}</span>${P.coTag(o.company, 22)}${Y.COMPANIES[o.company].name}</div><button class="close" data-act="closePop">閉じる</button></div>
    <div class="body" style="display:grid;grid-template-columns:1.2fr 1fr;gap:28px"><ol class="timeline replay">${rows}${ev}</ol>
    <div><table class="cmp"><tr><th></th><th>この世界</th><th>あなたの世界（${pad(YOU)}）</th></tr>
      ${cmp('選択による総額', man(o.choiceTotal) + '万円', man(me.choiceTotal) + '万円')}${cmp('途中の出来事による増額', o.increase ? '+' + man(o.increase) + '万円' : 'なし', me.increase ? '+' + man(me.increase) + '万円' : 'なし')}${cmp('最終的な総額', man(o.total) + '万円', man(me.total) + '万円')}${cmp('借入', man(o.principal) + '万円', man(me.principal) + '万円')}${cmp('冬の朝', o.warmth.label, me.warmth.label)}${cmp('家計のゆとり', o.slack.label, me.slack.label)}${cmp('引渡し', o.days + '日目', me.days + '日目')}</table>
      ${o.causes.length ? `<p class="note" style="margin-top:12px"><b>なぜ起きたか：</b>${o.causes.map(c => esc(c.cause)).join('／')}</p>` : ''}
      <p class="note" style="margin-top:12px">同じ家族、同じ土地、同じ外の出来事で、決断だけが違う世界です。どちらがよいかは決めません。</p></div></div></div>`;
}

function honneBody(s) {
  const spec = s.player.spec;
  const qs = s.visit.map(id => Y.quote(spec, id, true)).concat('ABCD'.split('').filter(id => !s.visit.includes(id)).map(id => Y.quote(spec, id, true)));
  const max = Math.max(...qs.map(q => q.real));
  const memo = co => s.honne.filter(n => n.co === co).slice(-1)[0];
  return `<div class="rep"><div class="box"><h3 style="margin-top:0">それぞれの事情</h3><p class="note">1年たって、訪ねた2社の担当者が話してくれたこと。</p>
    ${s.visit.map(co => `<div style="display:flex;gap:16px;margin:12px 0">${P.avatar(co, 80, 'idle')}<div><b>${Y.COMPANIES[co].name}・${STAFFN(co)}</b><p style="font-size:19px;line-height:1.6;margin-top:6px">${esc(persona(co)?.jijo || '')}</p>${memo(co) ? `<p class="note">打ち合わせのときのメモ：${esc(memo(co).text)}</p>` : ''}</div></div>`).join('')}</div>
    <div class="box"><h3 style="margin-top:0">見積の透視</h3><p class="note">同じ仕様で、4社の見積の表紙（黒）と、別途だった項目（斜線）を並べました。</p>
    <div class="bars">${qs.map(q => `<div class="barc"><div class="colw"><div class="seg hide" style="height:${Math.round((q.real - q.cover) / max * 400)}px"></div><div class="seg cover" style="height:${Math.round(q.cover / max * 400)}px"></div></div><div class="num">${man(q.real)}</div><div class="lbl">${P.coTag(q.company, 18)}表紙 ${man(q.cover)}万円</div></div>`).join('')}</div></div></div>`;
}
// レーダー図（コードで数える。APIの費用はゼロ）：暖かさ・性能／広さ・間取り／デザイン・素材／家計のゆとり／時間と手間
export function radarAxes(w) {
  const o = Y.outcome(w), h = Y.HOUSEHOLDS[w.household];
  const warm = (o.warmth.level + 1) / 4;
  const space = Math.min(1, Math.max(0.1, (w.spec.tsubo - h.area[0] + 1) / (h.area[1] - h.area[0] + 2)));
  const design = Math.min(1, 0.3 + (Y.pitched(w.spec.roof) ? 0.15 : 0.2) + Y.finishCost(w.finish) / 150);
  const money = (o.slack.level + 1) / 4;
  const time = Math.max(0.15, Math.min(1, 1 - (o.days - 190) / 120));
  return [['暖かさ・性能', warm], ['広さ・間取り', space], ['デザイン・素材', design], ['家計のゆとり', money], ['時間と手間', time]];
}
export function radarSVG(s, size = 300, others = []) {
  const ax = radarAxes(s.player), N = ax.length, c = size / 2, R = size * 0.34;
  const pt = (i, v) => [c + Math.sin(i / N * 2 * Math.PI) * R * v, c - Math.cos(i / N * 2 * Math.PI) * R * v];
  const poly = vals => vals.map((v, i) => pt(i, v).map(x => x.toFixed(1)).join(',')).join(' ');
  let g = [0.25, 0.5, 0.75, 1].map(k => `<polygon points="${poly(Array(N).fill(k))}" fill="none" stroke="rgba(30,43,54,.15)"/>`).join('');
  g += ax.map((a, i) => { const [x, y] = pt(i, 1.28); return `<line x1="${c}" y1="${c}" x2="${pt(i, 1)[0]}" y2="${pt(i, 1)[1]}" stroke="rgba(30,43,54,.15)"/><text x="${x}" y="${y}" font-size="${size / 22}" text-anchor="middle" dominant-baseline="middle" fill="#6B6358">${a[0]}</text>`; }).join('');
  for (const w of others) g += `<polygon points="${poly(radarAxes(w).map(a => a[1]))}" fill="none" stroke="#C99A00" stroke-width="2" stroke-dasharray="6 4"/>`;
  g += `<polygon points="${poly(ax.map(a => a[1]))}" fill="rgba(232,112,31,.22)" stroke="#E8701F" stroke-width="2.5"/>`;
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${g}</svg>`;
}
// 引渡し式：家・担当者・家族・テープ（写真の保存にも同じSVGを使う）
export function ceremonySVG(s, forPhoto = false) {
  const w = s.player;
  const fin = Y.FINISH.wall.find(x => x.id === w.finish.wall) || Y.FINISH.wall[0];
  const col = fin.colors[w.finish.color || 0] || fin.colors[0];
  const house = P.bigHouse({ ...w, no: YOU }, 4, { fin: { wall: col[1], roof: w.finish.wall === 'galva' ? col[1] : '#4A4F57' } }).replace('<svg ', '<svg x="200" y="40" width="720" height="520" ');
  const ppl = [P.avatar(w.company, 120, 'smile'), P.avatar(coordinator(s)?.gender === 'male' ? 'IC2' : 'IC', 120, 'smile'), P.spouse('kazu', 112), P.spouse('yuu', 112)].map((sv, i) => sv.replace('<svg ', `<svg x="${250 + i * 160}" y="590" `)).join('');
  const date = new Date(); const d = `${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()}`;
  return `<svg class="cersvg" viewBox="0 0 1124 920" xmlns="http://www.w3.org/2000/svg" width="1124" height="920"><rect width="1124" height="560" fill="#DDF0FA"/><rect y="560" width="1124" height="360" fill="#F3E7CF"/>${house}
    <g class="tape"><path class="tl" d="M200 640 Q400 660 562 650" stroke="#C99A00" stroke-width="7" fill="none"/><path class="tr" d="M562 650 Q724 660 924 640" stroke="#C99A00" stroke-width="7" fill="none"/></g>${ppl}
    <text x="1100" y="900" text-anchor="end" font-size="22" fill="#6B6358" font-family="Hiragino Sans, sans-serif">${esc(NAMES.kazu)} と ${esc(NAMES.yuu)} の家　引渡しの日　${d}</text></svg>`;
}
// 1年後のわが家：選択の結果が絵に出る（外構、窓辺のあかり、洗濯物、庭の木）
function lifeSVG(s, o) {
  const w = s.player;
  const fin = Y.FINISH.wall.find(x => x.id === w.finish.wall) || Y.FINISH.wall[0];
  const col = fin.colors[w.finish.color || 0] || fin.colors[0];
  const house = P.bigHouse({ ...w, no: YOU }, 4, { fin: { wall: col[1], roof: w.finish.wall === 'galva' ? col[1] : '#4A4F57' } }).replace('<svg ', '<svg x="160" y="60" width="800" height="580" ');
  const gravel = w.spec.exterior !== 'full';
  const warm = o.warmth.level >= 3;
  return `<svg viewBox="0 0 1124 920" width="1124" height="920"><rect width="1124" height="560" fill="#DDF0FA"/><rect y="560" width="1124" height="360" fill="${gravel ? '#E7E0D2' : '#CFE6B8'}"/>${house}
    ${warm ? '<circle cx="470" cy="440" r="60" fill="#FFD98A" opacity=".45"/>' : ''}
    <path d="M760 600 L760 520 M900 600 L900 520 M760 530 L900 530" stroke="#8A8F96" stroke-width="3" fill="none"/>${[0, 1, 2, 3].map(i => `<rect x="${775 + i * 30}" y="532" width="20" height="${26 + (i % 2) * 8}" rx="3" fill="${['#FFFFFF', '#CFEBFA', '#FDEBDD', '#FFFFFF'][i]}" stroke="#1E2B36" stroke-width="1.4"/>`).join('')}
    ${gravel ? Array.from({ length: 40 }, (_, i) => `<circle cx="${380 + (i * 37) % 260}" cy="${700 + (i * 53) % 120}" r="3" fill="#B9B0A0"/>`).join('') : '<path d="M300 760 q20 -30 40 0 q20 -30 40 0 q20 -30 40 0" stroke="#7DBF62" stroke-width="4" fill="none"/>'}
    <text x="40" y="880" font-size="22" fill="#6B6358" font-family="Hiragino Sans, sans-serif">${gravel ? '玄関の前は、まだ砂利のまま' : '庭の緑が、少しずつ育ってきた'}${warm ? '　／　冬でも、南の窓辺があたたかい' : ''}</text></svg>`;
}

// 各社のチラシ・ウェブサイト（ダイジェスト）：家のイメージ、宣伝文、強み、標準仕様。価格はチラシの「本体価格〜」の程度だけ
export function flyersHTML(s) {
  const B = DATA.brochures?.brochures || {};
  const h = Y.HOUSEHOLDS[s.household];
  const card = co => { const b = B[co]; if (!b) return ''; const c = Y.COMPANIES[co];
    const img = P.thumb({ w: { no: b.style.finish, spec: { roof: c.roof, exterior: 'full' }, company: co, bits: [] }, stage: 4, ghost: 0 }, { style: 'width:100%;height:210px' });
    return `<div class="flyer ${b.medium === 'チラシ' ? 'paper' : 'web'}"><div class="fl-top">${b.medium === 'ウェブサイト' ? '<span class="fl-url">●●●</span>' : ''}${P.coTag(co, 26)}<b>${c.name}</b><small>${b.medium}</small></div>
      <div class="fl-img">${img}</div><div class="fl-catch">${esc(b.catch)}</div><p class="fl-lead">${esc(b.lead)}</p>
      <ul class="fl-pt">${b.points.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
      <div class="fl-std"><b>標準仕様（抜粋）</b>${b.standard.map(x => `<span>${esc(x.replace('等級（エンジンの値）', '等級' + c.insul))}</span>`).join('')}</div>
      <div class="fl-price">本体価格 ${man(c.tsubo * h.area[0])}万円〜<small>（${h.area[0]}坪の例）</small></div><div class="fl-small">${esc(b.small)}</div></div>`; };
  return `<div class="pop flyers"><div class="ph2"><div class="ttl">各社のチラシ・ウェブサイト<span class="meta">宣伝の言葉です。どの会社も、自分をよく見せています</span></div><button class="close" data-act="closePop">閉じる</button></div>
    <div class="body fl-grid">${'ABCD'.split('').map(card).join('')}</div></div>`;
}

// スマホ連携のポップアップ：QRと短いコード。PCは数秒おきに読みに来る。「取り込む」で入口に入る
export const PHONE = { st: null };
export function phoneHTML(s) {
  const p = PHONE.st;
  let body;
  if (!p) body = '<p class="lead">準備しています……</p>';
  else if (p.closed) body = `<p class="lead">${esc(p.message || '審査期間中のみ利用できます。')}</p><p class="note">期間外は、PCの画面に直接書くか、写真をドロップしてください。</p>`;
  else if (p.error) body = `<p class="lead">${esc(p.error)}</p>`;
  else {
    let qr = '';
    try { const q = window.qrcode(0, 'M'); q.addData(p.url); q.make(); qr = q.createSvgTag({ cellSize: 6, margin: 2, scalable: true }); } catch { }
    const n = (p.items || []).length, ph = (p.items || []).filter(i => i.photo).length;
    body = `<div style="display:grid;grid-template-columns:320px 1fr;gap:30px;align-items:center"><div class="qrbox">${qr}</div>
      <div><p class="lead">スマホのカメラでQRコードを読み取ると、送るためのページが開きます。</p><p style="font-size:20px">コード：<span class="code">${esc(p.code)}</span></p>
      <p class="note">30分で期限が切れます。写真は3枚まで。送ったものは、取り込むか期限が来ると消えます。</p>
      <p style="font-size:20px;margin-top:14px">届いたもの：ことば ${n - ph}件、写真 ${ph}枚</p></div></div>`;
  }
  return `<div class="pop"><div class="ph2"><div class="ttl">スマホから送る</div><button class="close" data-act="closePhone">閉じる</button></div><div class="body">${body}</div>
    <div class="ft"><span class="meta">画像の読み取りは、取り込んで「つぎへ」を押したときだけ行います。</span>${p && p.items && p.items.length ? '<button class="btn" data-act="importPhone">取り込む</button>' : ''}</div></div>`;
}

// 写真やURLを見せる（打ち合わせの中で。ドロップ・貼り付け・URL・スマホから）
export const SHOW = { photos: [], text: '' };
export function showHTML(s) {
  return `<div class="pop"><div class="ph2"><div class="ttl">写真やURLを見せる</div><button class="close" data-act="closePop">閉じる</button></div>
    <div class="body"><div style="display:grid;grid-template-columns:1fr 1fr;gap:24px">
      <div><div class="drop" id="drop">好きな家の写真をドロップ／Ctrl＋Vで貼り付け<br><span style="font-size:15px">長辺1568pxまで縮小し、撮影場所などの埋め込み情報は消えます（3枚まで）</span></div>
        <div class="thumbs">${SHOW.photos.map(p => `<img src="${p}" alt="見せる写真">`).join('')}</div>
        <button class="flyer-btn" style="margin-top:12px" data-act="openPhone">スマホから送る（QRコード）</button></div>
      <div><label class="note">気になったページのURLや、写真の説明（任意）</label><textarea class="free" id="showText" data-keep style="height:200px" placeholder="例：https://… こんな玄関が好きです"></textarea></div></div></div>
    <div class="ft"><span class="meta">写真そのものは保存しません。家の要素だけを読み取ります。</span><button class="btn" data-act="doShow">担当者に見せる</button></div></div>`;
}

// 守れなかった希望と、どの分岐点で何を選べば守れたか（エンジンで確かめる）
export function unkept(s) {
  const mine = Y.checkWishes(s.player, s.wishes);
  return mine.filter(c => !c.ok).map(c => {
    for (let i = 3; i >= 0; i--) { const w = nearest(s, i); if (!w) continue; const cw = Y.checkWishes(w, [c])[0]; if (cw && cw.ok) return { ...c, fix: `${Y.FORKS[i]}で「${w.labels[i]}」を選べば守れた` }; }
    return { ...c, fix: '一つの分岐点だけでは守れなかった' };
  });
}
function keptHTML(s) {
  const mine = Y.checkWishes(s.player, s.wishes), o = Y.outcome(s.player);
  const done = [...mine.filter(c => c.ok).map(c => c.label), o.warmth.level >= 2 ? `冬の朝は「${o.warmth.label}」` : '', s.player.spec.exterior === 'full' ? '入居の日から外構が整った' : ''].filter(Boolean);
  const ng = unkept(s);
  return `<h3>実現できたこと</h3>${done.length ? `<ul>${done.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : '<p class="note">（記録された希望の条件がありません）</p>'}
    ${ng.length ? `<h3>守れなかった希望</h3><ul>${ng.map(c => `<li><b>${esc(c.label)}</b>　${esc(c.fix)}</li>`).join('')}</ul>` : ''}`;
}

// ゾーニング図：部屋の塊を、階ごとに帯に詰めて描く（大きさは畳の段階に比例。描画はコード）
export function zoningSVG(plan) {
  const W = 470, H = 330, gap = 40;
  if (!plan) return `<svg viewBox="0 0 ${W * 2 + gap} ${H + 40}" class="zsvg">${[0, 1].map(f => `<rect x="${f * (W + gap)}" y="30" width="${W}" height="${H}" rx="8" fill="#F4F1EA" stroke="rgba(30,43,54,.15)"/>${[0, 1, 2].map(r => `<rect x="${f * (W + gap) + 14}" y="${50 + r * 100}" width="${W - 28}" height="80" rx="6" fill="#ECE7DD" class="pulse"/>`).join('')}`).join('')}</svg>`;
  const floors = [1, 2].map(f => plan.rooms.filter(r => r.floor === f));
  const maxA = Math.max(...floors.map(rs => rs.reduce((a, r) => a + r.size, 0)), 1);
  let g = '';
  floors.forEach((rs, fi) => {
    const x0 = fi * (W + gap), area = rs.reduce((a, r) => a + r.size, 0);
    const fw = W * Math.sqrt(area / maxA), fh = H * Math.sqrt(area / maxA);
    g += `<text x="${x0}" y="20" font-size="18" font-weight="700" fill="#1E2B36">${fi + 1}階</text>`;
    if (!rs.length) { g += `<text x="${x0 + 20}" y="80" font-size="16" fill="#6B6358">（二階なし）</text>`; return; }
    g += `<rect x="${x0}" y="30" width="${fw}" height="${fh}" rx="6" fill="#fff" stroke="#1E2B36" stroke-width="2"/>`;
    const rows = Math.max(1, Math.round(Math.sqrt(rs.length / 1.6)));
    const per = Math.ceil(rs.length / rows);
    for (let r = 0; r < rows; r++) {
      const row = rs.slice(r * per, (r + 1) * per); if (!row.length) continue;
      const ra = row.reduce((a, x) => a + x.size, 0), rh = fh * (ra / area);
      const y = 30 + rs.slice(0, r * per).reduce((a, x) => a + x.size, 0) / area * fh;
      let x = x0;
      row.forEach(room => { const w = fw * (room.size / ra); const wet = /浴|洗面|トイレ/.test(room.name), ldk = /LDK|リビング/.test(room.name);
        g += `<rect x="${x + 2}" y="${y + 2}" width="${w - 4}" height="${rh - 4}" rx="4" fill="${ldk ? '#FDEBDD' : wet ? '#DDEFFA' : '#F4F1EA'}" stroke="rgba(30,43,54,.45)"/>`;
        g += `<text x="${x + w / 2}" y="${y + rh / 2 + 5}" text-anchor="middle" font-size="${Math.min(16, Math.max(10, w / 6))}" fill="#1E2B36">${esc(room.name)}</text>`; x += w; });
    }
  });
  return `<svg viewBox="0 0 ${W * 2 + gap} ${H + 40}" class="zsvg">${g}</svg>`;
}
