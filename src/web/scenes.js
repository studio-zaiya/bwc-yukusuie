/* ゆくすいえ　場面ごとの描画。数字はすべてエンジン（engine.js）から。仕組みの名前は画面に出さない */
import * as Y from './engine/engine.js';
import { drawBuild, BUILD, DUR, PHASES, phaseAt } from './buildanim.js';
import * as P from './parts.js';
import { buildMemory, SRC_LABEL } from './memory.js';
import { protectedReasons } from './reasons.js';
import { fitProposalW } from './planfit.js';

// 金額の表示は万円単位の整数（計算の内部は小数のまま）
const man = n => Math.round(Number(n)).toLocaleString('ja-JP');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const NOTICE = '本作の制度・手続き・金額・期間などの設定は、体験のために簡略化しています。実際の家づくりは、地域・金融機関・住宅会社によって異なります。登場する住宅会社・人物・団体はすべて架空です。';
const H = s => Y.HOUSEHOLDS[s.household];
const STAFFN = co => `${Y.COMPANIES[co].staffRole}・${Y.COMPANIES[co].staff}`;
const YOU = 7;
// 情報収集の画面で、最後に登場の動きをつけた段
const GATHER_SHOWN = { step: null };
// 付箋の「ぽん」と出る動きは、初めて出たときだけ。会話のたびに描き直すので、毎回つけると全部の付箋がちらつく
const STICK_SEEN = new Set();
const stickNew = k => STICK_SEEN.has(k) ? '' : (STICK_SEEN.add(k), ' new');
const pad = n => String(n).padStart(2, '0');
function dno(s, w) { if (!s.player || s.player.bits.length < 4 || w.bits.length < 4) return null; const pn = Y.worldNo(s.player.bits), n = Y.worldNo(w.bits); return n === pn ? YOU : n === YOU ? pn : n; }
const lab = (o, w) => typeof o.label === 'function' ? o.label(w) : o.label;
const chOf = s => s.player ? s.player.company : s.cur;

// ---- データ（情報収集、SNS）----
// アンケートの、確定前の選択（複数選べる問い）と、押した札の沈み（0.2秒）
export const SV = { sel: [], pressed: null };
// 断られたあとのナレーションの帯（WORLD_SWITCH.md の5）
export const SWITCH = { on: false, lines: [], i: 0, soft: false };
export const DATA = { sources: null, sns: null, personas: null, electrical: null, ai: null, brochures: null, survey: null, harness: null, specs: null, snsSearch: null };
// 中身の素材集（data/content。期間中に claude.ai で作成）
for (const [k, f] of [['sources', 'info_sources'], ['sns', 'sns_posts'], ['personas', 'personas'], ['electrical', 'electrical'], ['ai', 'ai_assistant'], ['brochures', 'brochures'], ['survey', 'survey'], ['harness', 'rep_harness'], ['specs', 'standard_specs'], ['snsSearch', 'sns_search']]) fetch(`/data/content/${f}.json`).then(r => r.json()).then(j => { DATA[k] = j; }).catch(() => {});
export const dataReady = () => new Promise(res => { const t0 = Date.now(); const tick = () => (DATA.survey && DATA.harness && DATA.personas) || Date.now() - t0 > 5000 ? res() : setTimeout(tick, 50); tick(); });
export const persona = co => DATA.personas?.staff.find(p => p.company === co);
export const coordinator = s => { const cs = DATA.personas?.coordinators || []; return cs[(s.seed + (s.player ? Y.worldNo(s.player.bits.concat([0, 0, 0, 0]).slice(0, 4)) : 0)) % (cs.length || 1)]; };


// 電気の一覧のアイコン（線画）
const EI = d => `<svg class="eic" viewBox="0 0 24 24" fill="none" stroke="#1E2B36" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const EICON = {
  light: EI('<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>'),
  outlet: EI('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9.5 9v3M14.5 9v3M10 16h4"/>'),
  switch: EI('<rect x="6" y="3" width="12" height="18" rx="2"/><rect x="9.5" y="7" width="5" height="10" rx="1"/>'),
  aircon: EI('<rect x="3" y="5" width="18" height="8" rx="2"/><path d="M6 10h12M8 16c0 1.5-1 2-1 3M12 16c0 1.5-1 2-1 3M16 16c0 1.5-1 2-1 3"/>'),
  tv: EI('<rect x="3" y="5" width="18" height="12" rx="1.5"/><path d="M8 21h8"/>'),
  net: EI('<path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9 9 0 0 1 13 0M8.5 16a4.5 4.5 0 0 1 7 0"/><circle cx="12" cy="19.5" r="1"/>'),
  car: EI('<path d="M5 16V11l2-5h10l2 5v5M3 16h18M7 19.5v-3M17 19.5v-3"/><circle cx="8" cy="13" r="1"/><circle cx="16" cy="13" r="1"/>'),
  sun: EI('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/>'),
};
// ---- 上の帯・お金の札・時計 ----
function top(s) { return `<div class="top"><div class="logo"><img src="/brand/mark.svg" alt="" style="width:40px;height:40px;vertical-align:-10px;margin-right:4px">ゆくす<span class="logo-i">い</span>え</div>${P.progress(s.step)}</div>`; }
function moneyBox(s) {
  const h = H(s);
  // 間取りの調整のあいだは、上の札もいま見ている案の値（攻めのレビュー11/5：同じ画面に総額が2つ出ていた）
  if (s.scene === 'plan' && s.plan && s.player) {
    const cur = s.plan.view != null ? s.plan.options[s.plan.view] : { plan: s.plan.main, m: s.plan.mainM }, m = cur.m, co = s.player.company;
    return `<div class="moneyc"><div class="hd">${P.coTag(co, 18)}${Y.COMPANIES[co].name}　いま見ている間取りの案</div>
      <div class="c"><div class="k">総額（土地＋建物の見積）</div><div class="v">${man(m.total)}<small>万円</small></div><div class="sub">延床 ${m.tsubo}坪</div></div>
      <div class="c"><div class="k">月々の返済</div><div class="v">${m.monthly.toFixed(1)}<small>万円</small></div><div class="sub">変動 ${Y.RATE.variable * 100}%</div></div></div>`;
  }
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
  // 着工より後（着工・上棟・施主検査）は、工程表と同じ値（攻めのレビュー11/5：画面の日付と工程表が食い違っていた）
  let day = s.step === 0 ? 0 : s.step >= 7 ? d[s.step] : d[Math.max(0, s.step - 1)];
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
const SHORT = [w => Y.COMPANIES[w.company].name, b => b ? '外形を変えた' : '提案の外形', b => b ? '外構まで' : '外構は最小限', b => b ? 'グレードアップ' : '標準の仕上げ'];
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
  if (!s.others.length) return false ? '' : '';
  const full = s.others.length === 15;
  const list = [...s.others].sort((a, b) => full ? dno(s, a) - dno(s, b) : a.bits.join('').localeCompare(b.bits.join('')));
  const cols = Math.max(list.length, 5);
  return `<div class="galT"><b>選ばれなかった世界線</b><span>${list.length}</span></div><div class="gal" style="grid-template-columns:repeat(${cols},1fr)">${list.map(w => {
    const st = stepOf(w, s.step), stage = w.unbuilt ? 0 : stageOf(st);
    const x = { w: { ...w, no: hb(w) % 8 }, stage, ghost: w.unbuilt ? 0 : st >= 2 && st < 7 ? +(0.35 + (st - 2) / 5 * 0.45).toFixed(2) : 0 };
    const short = full ? Y.worldShort(Y.outcome(w)) : esc(shortName(w));
    // 15枚がそろったら：番号・会社の印・家の絵・ひとことだけ。押すと世界樹で、その世界の経路をたどる
    if (full) return `<button class="th th15 ${w.unbuilt ? 'unbuilt' : ''} ${s.newest.includes(w.bits.join('')) ? 'new' : ''}" data-act="peek" data-no="${dno(s, w)}" title="押すと、この世界線を覗く"><div class="thd"><span>${pad(dno(s, w))}</span>${P.coTag(w.company, 18)}</div>${P.thumb(x)}<div class="tnm big">${short}</div><div class="bar"><i style="width:${Math.round(st / 11 * 100)}%"></i></div></button>`;
    return `<div class="th ${w.unbuilt ? 'unbuilt' : ''} ${s.newest.includes(w.bits.join('')) ? 'new' : ''}"><div class="thd"><span></span>${P.coTag(w.company, 18)}</div>${P.thumb(x)}<div class="tnm big">${short}</div><div class="tnt">${noteOf(w, st)}</div><div class="bar"><i style="width:${Math.round(st / 11 * 100)}%"></i></div></div>`;
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
  const area = roofDecided || w.plan ? `${w.spec.tsubo}坪・${P.formLabel(w)}　${Y.ROOF_JA[w.spec.roof]}` : "間取りと屋根の形は、これから";
  return `<div class="hero ${tall(s)} ${cls}"><div class="lab"><span class="no">${pad(YOU)}</span>あなたの家${co}</div>
    <div class="ph">${P.STEPS_S?.[P.STEP_TO_BAR?.[s.step] ?? 0] || ''}<br><span style="font-size:15px">${area}${w.fitted ? `（予算に合わせて${w.fitted}坪小さく）` : ''}</span></div>${heroHouse(s)}${extra}</div>`;
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
  if (Y.finishCost(me.finish) !== Y.finishCost(w.finish)) out.push(Y.finishCost(w.finish) ? `${[w.finish.wall !== 'std' && '外壁', w.finish.floor !== 'std' && '床', w.finish.inner !== 'vinyl' && '内壁'].filter(Boolean).join('と') || '仕上げ'}をグレードアップ` : '標準の仕上げ');
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
export function wishLine(ch, { hideNg = false } = {}) {
  if (!ch.length) return '';
  const ng = hideNg ? [] : ch.filter(c => !c.ok);
  const diffs = ch.filter(c => c.kind === 'totalMax' || c.kind === 'monthlyMax').map(c => `${c.kind === 'totalMax' ? '総額' : '月々'}${c.diff > 0 ? '+' : c.diff < 0 ? '−' : ''}${c.kind === 'monthlyMax' ? Math.abs(c.diff).toFixed(1) : man(Math.abs(c.diff))}万円`);
  return `<li class="wl">希望との違い：${diffs.join('／') || 'なし'}${ng.length ? `<br><b>この案では守れない希望：${ng.map(c => esc(c.label)).join('、')}</b>` : hideNg ? '' : '<br>希望はすべて守れる'}</li>`;
}
// 希望のボード：わかった希望（付箋）・まだ決まっていないこと・次に決めること
const WISH_TXT = w => ({ totalMax: `総額 ${man(w.value)}万円以内`, monthlyMax: `月々 ${man(w.value)}万円以内`, areaMax: `${w.value}坪まで`, areaMin: `${w.value}坪は欲しい` }[w.kind] || w.text);
function boardHTML(s) {
  // 付箋は要望の記憶から（同じ意味は1枚。出どころの印つき）。記憶がまだないときは、聞き取った言葉から
  const items = s.memory ? s.memory.items.filter(x => x.deliveredTo[s.cur] !== undefined || !s.cur).slice(-14) : [];
  const seen = new Set();
  const old = s.memory ? [] : s.heard.filter(h => { const k = h.text; if (seen.has(k)) return false; seen.add(k); return true; }).slice(-14);
  const undecided = [!s.player || s.forkNo === 0 ? '建てる会社' : '', s.forkNo < 2 ? '屋根の形と広さ' : '', !s.wishes.some(w => w.kind === 'totalMax' || w.kind === 'monthlyMax') ? '予算の上限' : '', s.forkNo < 3 ? '外構をどこまで' : '', s.forkNo < 4 ? '外壁と床の仕上げ' : ''].filter(Boolean);
  const next = { hearing: s.visit[1] === s.cur ? '2社の提案を見比べる' : '帰り道に、伝え忘れを確かめる', forgot: '2社目を訪ねる', reply: '2社目を訪ねる' }[s.scene] || '';
  const stick = (text, who, src, i) => `<span class="sticky ${who === 'p2' || who === 'ゆう' ? 'yu' : who === 'both' || who === 'ふたり' ? 'both' : ''}${stickNew(who + '|' + text)}" style="--r:${(i * 37) % 7 - 3}deg">${src ? `<small>${SRC_LABEL[src] || src}</small>` : ''}${esc(String(text).length > 16 ? String(text).slice(0, 15) + '…' : text)}</span>`;
  const body = items.length ? items.map((x, i) => stick(x.text, x.who, x.source, i)).join('') : old.length ? old.map((h, i) => stick(h.text, h.who, h.src || '', i)).join('') : '<p class="note">担当者に話すと、ここに付箋がたまります。</p>';
  return `<div class="board"><div class="bcol"><h4>わかった希望</h4><div class="bst">${body}</div></div>
    <div class="bcol small"><h4>まだ決まっていないこと</h4><ul>${undecided.map(t => `<li>${t}</li>`).join('')}</ul><h4>次に決めること</h4><p>${next}</p></div></div>`;
}

// ---- チャット ----
const ICON = {
  sns: '<svg viewBox="0 0 20 20"><rect x="2" y="3" width="16" height="11" rx="3" fill="none" stroke="#1E2B36" stroke-width="1.8"/><path d="M6 14 L5 18 L10 14" fill="none" stroke="#1E2B36" stroke-width="1.8" stroke-linejoin="round"/><line x1="6" y1="7" x2="14" y2="7" stroke="#1E2B36" stroke-width="1.6"/><line x1="6" y1="10" x2="11" y2="10" stroke="#1E2B36" stroke-width="1.6"/></svg>',
  ai: '<svg viewBox="0 0 20 20"><rect x="5" y="1.5" width="10" height="17" rx="2.4" fill="none" stroke="#1E2B36" stroke-width="1.7"/><line x1="8.5" y1="15.6" x2="11.5" y2="15.6" stroke="#1E2B36" stroke-width="1.5" stroke-linecap="round"/><path d="M7.6 6.4h4.8M7.6 9h3.2" stroke="#1E2B36" stroke-width="1.4" stroke-linecap="round"/></svg>',
};
// 送る：入力欄の中の右端のアイコン（墨の塗りは「進む」だけ。UI_NAV_SYSTEM の2）
const SEND_ICON = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 11.5 21 3l-6.5 18-3.2-7.3z"/><path d="M11.3 13.7 21 3"/></svg>';
const sendB = (act, label = '送る', off = false) => `<button class="sendi" data-act="${act}" aria-label="${label}" title="${label}（Enter）" ${off ? 'disabled' : ''}>${SEND_ICON}</button>`;
const tbox = (id, act, ph, rows = 2, label, off) => `<div class="tw"><textarea id="${id}" rows="${rows}" data-keep data-enter="${act}" placeholder="${ph}"></textarea>${sendB(act, label, off)}</div>`;
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
export const setNames = n => { NAMES.kazu = n?.a || '夫'; NAMES.yuu = n?.b || '妻'; };
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
    ${input ? `<div class="in">${who ? whoSw() : ''}${tbox('say', act, placeholder, 3)}</div>` : ''}${navs(s)}</div>`;
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
    // 区画の番号は、遊んでいる間と同じ 01〜16（人間の回答11/5）。タイトルでは、どれも光らせない
    P.setYou(0);
    const list = Array.from({ length: 16 }, (_, i) => ({ w: { no: i + 1, spec: { roof: ['hip', 'cube', 'mane', 'gable'][i % 4], exterior: 'full' }, third: false }, stage: 4, ghost: 0, note: '' }));
    return `<div class="startbg">${P.estate2(list, {})}</div><div class="center" style="text-align:center;width:1500px">
      <h1 style="margin:0"><img src="/brand/lockup-horizontal.svg" alt="ゆくすいえ　YUKUSUIE 16 unbuilt futures" style="width:820px"></h1>
      <div class="catch">16回目の、マイホームへ。</div>
      <div class="beta"><span class="beta-tag">ベータ版</span>ベータ版です。金額や担当者の応答は、まだ開発中です。</div>
    </div><div class="disc">${NOTICE}</div>`;
  },
  howto(s) {
    const [t, pic, body] = HOWTO[s.howto];
    const last = s.howto === HOWTO.length - 1;
    const r = s.names.role || 'h', me = r === 'w' ? '妻' : '夫', pa = r === 'w' ? '夫' : '妻', dflt = v => ['夫', '妻', 'あなた', 'パートナー'].includes(v) ? '' : v;
    const first = s.howto === 0 ? `<div class="rolebox">あなたは<button class="mode sm" data-act="role" data-r="h" aria-pressed="${r === 'h'}">夫</button><button class="mode sm" data-act="role" data-r="w" aria-pressed="${r === 'w'}">妻</button></div><div class="namebox"><label><i class="sq"></i>あなたの呼び名<input id="nmA" maxlength="8" placeholder="${me}" value="${esc(dflt(s.names.a))}"></label><label><i class="ci"></i>パートナーの呼び名<input id="nmB" maxlength="8" placeholder="${pa}" value="${esc(dflt(s.names.b))}"></label></div><p class="note">ニックネームで入力してください（空欄なら「${me}」「${pa}」）。担当者は、この呼び名で呼びます。</p>
      <div class="modebox"><button class="mode" data-act="mode" data-m="solo" aria-pressed="${s.mode === 'solo'}"><b>ひとりで遊ぶ</b><span>パートナーはAIが演じます</span></button><button class="mode" data-act="mode" data-m="duo" aria-pressed="${s.mode === 'duo'}"><b>ふたりで遊ぶ</b><span>交互に入力します</span></button></div>` : '';
    return `<div class="center howto"><div class="hk">遊び方　${s.howto + 1} / ${HOWTO.length}</div><div class="h2">${t}</div>${s.howto === 0 ? '' : `<div class="pic">${MINI[pic]()}</div>`}<p class="lead">${body}</p>${first}
      <div style="display:flex;gap:14px;justify-content:center"><button class="opt" data-act="howtoSkip">遊び方をとばす</button></div></div>
      ${last ? `<div class="disc">${NOTICE}</div>` : ''}`;
  },
  family(s) {
    const h = H(s);
    return `<div class="full"><div class="h2">あなたの家族</div><p class="lead">${h.story}</p>
      <dl class="facts" style="max-width:900px"><dt>世帯</dt><dd>${esc(NAMES.kazu)}（${(s.names.role || 'h') === 'w' ? '妻' : '夫'}）・${esc(NAMES.yuu)}（${(s.names.role || 'h') === 'w' ? '夫' : '妻'}）・子ども2人</dd><dt>世帯年収</dt><dd>${man(h.income)}万円（共働き）</dd><dt>家に入れる預金</dt><dd>${man(h.saveHouse)}万円（ほかに手元に残す分 ${man(h.saveKeep)}万円）</dd><dt>借りられそうな額</dt><dd>${man(Y.loanLimit(h))}万円まで（審査の目安）</dd></dl>
      <p class="note" style="margin-top:14px">金額はゲームの中の仮定です。</p>
</div>`;
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
</div>`;
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
      parts.forEach((t, i) => { if (!have.includes(t)) { const el = document.createElement('span'); el.className = 'sticky new'; el.dataset.t = t; el.textContent = t.length > 18 ? t.slice(0, 18) + '…' : t; el.style.setProperty('--r', ((i * 37) % 7 - 3) + 'deg'); box.appendChild(el); } });
      [...box.children].forEach(el => { if (!parts.includes(el.dataset.t)) el.remove(); });
    };
    ta.addEventListener('input', draw); draw();
  },
  lot(s) {
    const c = Y.coverageCheck(Y.baseSpec(H(s)));
    return `${top(s)}${moneyBox(s)}${clocks(s)}<div class="full" style="padding-top:150px"><div class="h2">分譲地の区画が当たりました。</div><p class="lead">第一希望は外れましたが、第二希望の区画が当たりました。${Y.DEADLINE.land}日以内に土地の契約を結びます。ここから、建物を建てる会社を探します。</p>
      <dl class="facts" style="max-width:1100px"><dt>広さ</dt><dd>約${Y.SITE.tsubo}坪（${Y.SITE.area}㎡）</dd><dt>用途地域</dt><dd>第一種住居地域</dd><dt>建蔽率／容積率</dt><dd>${Y.SITE.coverage * 100}%／${Y.SITE.far * 100}%</dd><dt>建てられる1階の外形の上限</dt><dd>${c.limit}㎡（カーポート・物置を含む）</dd><dt>土地の代金</dt><dd>${man(Y.SITE.price)}万円（水道の負担金 ${Y.SITE.waterFee}万円）</dd><dt>土地の契約の期限</dt><dd>当選から${Y.DEADLINE.land}日以内</dd></dl>
</div>`;
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
        <div class="visitpick"><div style="font-weight:700;margin-bottom:8px">実際に訪ねる2社（${pick.length}/2）</div><div class="vp">${'ABCD'.split('').map(co => `<button class="vbtn" data-act="pickVisit" data-co="${co}" aria-pressed="${pick.includes(co)}">${P.coTag(co, 26)}${Y.COMPANIES[co].name}<small>${Y.COMPANIES[co].kind}</small></button>`).join('')}</div></div></div></div>`;
  },
  // 情報収集 v3（INFO_GATHER_v3）：全画面のシートで、4社のチラシに1〜3位 → SNSで検索ワードごとに保存 → 見に行く2社を選ぶ。メモは次へ進むと消える
  gather(s) {
    const g = s.gather || { step: 'flyer', rank: [], saved: {}, tab: 0 };
    // 登場の動きは、段（チラシ／SNS／2社を選ぶ）が変わったときだけ。押すたびに描き直すので、毎回つけると画面が上下に揺れる
    const enter = GATHER_SHOWN.step !== g.step ? ' g-in' : ''; GATHER_SHOWN.step = g.step;
    const B = DATA.brochures?.brochures || {}, ICON = DATA.specs?.chirashiIcons || {}, h = Y.HOUSEHOLDS[s.household];
    const head = n => `<div class="g-hd"><span class="g-step ${n === 1 ? 'on' : ''}">1／2 チラシを見比べる</span><span class="g-step ${n === 2 ? 'on' : ''}">2／2 SNSを見る</span></div>`;
    if (g.step === 'flyer') {
      const card = co => { const b = B[co] || {}, c = Y.COMPANIES[co], r = g.rank.indexOf(co);
        const img = P.thumb({ w: { no: b.style?.finish || 1, spec: { roof: c.roof, exterior: 'full' }, company: co, bits: [] }, stage: 4, ghost: 0 }, { style: 'width:100%;height:100%' });
        return `<div class="g-card ${r >= 0 ? 'on' : ''}"><button class="g-hit" data-act="gRank" data-co="${co}" aria-pressed="${r >= 0}"><div class="g-img">${img}</div><div class="g-body"><div class="g-co">${P.coTag(co, 26)}<b>${c.name}</b><small>${esc(b.medium || 'チラシ')}</small></div>
          <div class="g-catch">${esc(b.catch || '')}</div><div class="g-icons">${(ICON[co] || []).map(([k, v]) => `<span><small>${esc(k)}</small>${esc(v)}</span>`).join('')}</div>
          <div class="g-price">本体価格 ${man(c.tsubo * h.area[0])}万円〜<small>（${h.area[0]}坪の例）</small></div><div class="g-small">${esc(b.small || '')}</div></div>${r >= 0 ? `<span class="g-rank">${r + 1}</span>` : ''}</button>
          <button class="opt g-more" data-act="openPop" data-pop="flyers">くわしく見る ＋</button></div>`; };
      return `<div class="gsheet${enter}">${head(1)}<h2 class="g-h">気になる順に、1位から3位まで押してみましょう</h2><p class="g-sub">宣伝の言葉です。どの会社も、自分をよく見せています。押し直すと外れます。</p><div class="g-grid">${'ABCD'.split('').map(card).join('')}</div></div>`;
    }
    if (g.step === 'sns') {
      const S2 = DATA.snsSearch?.searches || [], t = Math.min(g.tab || 0, S2.length - 1), cur = S2[t] || { posts: [] }, sv = g.saved || {};
      const tabs = S2.map((x, i) => `<button class="g-tab" data-act="gTab" data-i="${i}" aria-pressed="${i === t}">${esc(x.word)}<small>${(sv[i] || []).length ? `保存 ${(sv[i] || []).length}` : ''}</small></button>`).join('');
      const posts = cur.posts.map((p, k) => { const on = (sv[t] || []).includes(k); return `<div class="g-post"><div class="g-by">${esc(p.by)}</div><p>${esc(p.text)}</p><button class="g-save ${on ? 'on' : ''}" data-act="gSave" data-i="${k}" aria-pressed="${on}"><svg viewBox="0 0 14 18" width="14" height="18"><path d="M1 1h12v16l-6-4-6 4z" fill="${on ? '#1E2B36' : 'none'}" stroke="#1E2B36" stroke-width="1.6"/></svg>${on ? '保存した' : '保存'}</button></div>`; }).join('');
      return `<div class="gsheet${enter}">${head(2)}<div class="g-sns"><div class="g-phone"><div class="g-bar">検索</div><div class="g-tabs">${tabs}</div><div class="g-posts">${posts}</div></div>
        <div class="g-side"><h2 class="g-h">各タブで、気になる投稿を1〜2個保存しましょう</h2><p class="g-sub">だれかの体験の一面です。食い違う話もあります。</p><ul class="g-cnt">${S2.map((x, i) => `<li class="${(sv[i] || []).length ? 'ok' : ''}">${esc(x.word)}：${(sv[i] || []).length}／2</li>`).join('')}</ul></div></div></div>`;
    }
    // 見に行く2社を選ぶ：チラシの1位・2位が最初から選ばれている。集めた情報のメモは、この画面だけ
    const S2 = DATA.snsSearch?.searches || [], memo = co => { const r = g.rank.indexOf(co); const ps = []; S2.forEach((x, i) => (g.saved?.[i] || []).forEach(k => { if (x.posts[k]?.company === co) ps.push(x.posts[k].text); }));
      return `<div class="g-memo-co">${P.coTag(co, 20)}<b>${Y.COMPANIES[co].name}</b>${r >= 0 ? `<span class="g-r">チラシ ${r + 1}位</span>` : ''}${ps.map(t => `<p>「${esc(t)}」</p>`).join('')}</div>`; };
    const gen = []; S2.forEach((x, i) => (g.saved?.[i] || []).forEach(k => { if (!x.posts[k]?.company) gen.push(x.posts[k].text); }));
    return `${top(s)}${moneyBox(s)}${clocks(s)}<div class="g-pick"><div><h2 class="g-h">見に行く会社を、2つ選びましょう</h2><p class="g-sub">チラシで1位・2位をつけた会社が選ばれています。変えてもかまいません。</p>
      <div class="vp g-vp">${'ABCD'.split('').map(co => `<button class="vbtn" data-act="pickVisit" data-co="${co}" aria-pressed="${s.visit.includes(co)}">${P.coTag(co, 30)}${Y.COMPANIES[co].name}<small>${Y.COMPANIES[co].kind}</small></button>`).join('')}</div></div>
      <aside class="g-memo${enter}"><h4>集めた情報のメモ</h4><p class="note">このメモは、次へ進むと消えます。担当者には伝わっていません。</p>${'ABCD'.split('').map(memo).join('')}${gen.length ? `<div class="g-memo-co"><b>会社の名前が出ない投稿</b>${gen.map(t => `<p>「${esc(t)}」</p>`).join('')}</div>` : ''}</aside></div>`;
  },
  // v2：来場者アンケート（1画面1問、選ぶとすぐ次へ。上に「あと〇問」と進み具合。段が変わるとき軽く横にすべる）
  survey(s) {
    const SVY = DATA.survey, co = s.cur;
    if (!SVY) return `${top(s)}<div class="center"><p class="lead">アンケートを用意しています……</p></div>`;
    const qs = SVY.questions, i = Math.min(s.sv.i, qs.length - 1), q = qs[i], who = s.sv.who;
    const sec = SVY.sections.find(x => x.id === q.section), prevSec = i > 0 ? qs[i - 1].section : null;
    const left = qs.length - i, pct = Math.round(i / qs.length * 100);
    const cur = s.sv[who][q.id], sel = q.multi ? SV.sel : [];
    const on = id => q.multi ? sel.includes(id) : (SV.pressed === id || cur === id);
    // 前の問いの、パートナーの答え（ひとりプレイ）。違えば「ふたりの答えが違う」と添える（◆と金の破線は、2択の外の答えの印として残す。人間の回答15→Claudeの判断）
    let pa = '';
    const lq = s.sv.last && qs.find(x => x.id === s.sv.last.q);
    if (s.mode === 'solo' && lq && s.partnerAns?.[lq.id]) {
      const mine = [].concat(s.sv.p1[lq.id] || []).filter(x => x !== 'none'), hers = s.partnerAns[lq.id].filter(x => x !== 'none');
      const differs = mine.length && hers.length && !(mine.length === hers.length && mine.every(x => hers.includes(x)));
      pa = `<div class="sv-pa ${differs ? 'diff' : ''}"><i class="ci"></i>${esc(NAMES.yuu)}は「${esc(hers.map(id => lq.choices.find(c => c.id === id)?.label || '').join('、') || 'こだわらない')}」${differs ? '<b>ふたりの答えが違う</b>' : ''}<small>（${esc(lq.text.replace(/（.*?）/g, ''))}）</small></div>`;
    }
    const preview = buildMemory(SVY, s.sv.p1, s.mode === 'duo' ? s.sv.p2 : {});
    const lastQ = s.sv.last?.q;
    const stickies = preview.items.slice(-16).map((x, k) => `<span class="sticky ${x.who === 'p2' ? 'yu' : x.who === 'both' ? 'both' : ''} ${x.q === lastQ && stickNew('sv|' + x.who + '|' + x.text) ? 'fly' : ''}" style="--r:${(k * 37) % 7 - 3}deg">${esc(x.text)}</span>`).join('');
    return `${top(s)}<div class="svy">
      <div class="sv-hd">${P.coTag(co, 30)}<b>${Y.COMPANIES[co].name}　来場者アンケート</b><span class="sv-left">あと${left}問</span><div class="sv-bar"><i style="width:${pct}%"></i></div></div>
      <div class="sv-card ${prevSec && prevSec !== q.section ? 'slide' : ''}" data-i="${i}">
        <div class="sv-sec">${esc(sec?.label || '')}${s.mode === 'duo' ? `　<span class="sv-who"><i class="${who === 'p1' ? 'sq' : 'ci'}"></i>${esc(who === 'p1' ? NAMES.kazu : NAMES.yuu)}の番</span>` : ''}</div>
        <h2 class="sv-q">${esc(q.text)}</h2>
        <div class="sv-ch ${q.choices.length > 5 ? 'many' : ''}">${q.choices.map(c => `<button class="sv-o ${on(c.id) ? 'on' : ''} ${c.id === 'none' ? 'nopref' : ''}" data-act="svPick" data-id="${c.id}" aria-pressed="${on(c.id)}">${esc(c.label)}</button>`).join('')}</div>
        <div class="sv-nav"><span class="note">${q.multi ? 'いくつでも選べます' : '選ぶと、次の問いへ進みます'}</span></div>
        ${pa}
      </div>
      <div class="sv-board"><h4>わかった希望</h4><div class="bst">${stickies || '<p class="note">答えると、ここに付箋がたまります。</p>'}</div>
        <div class="svside2">${P.avatar(co, 120, 'smile')}<p>${Y.COMPANIES[co].name}・${STAFFN(co)}<br><span class="note">選ぶだけ、2分ほどです。</span></p></div></div>
    </div>`;
  },
  // 総括 → 追加の質問と補足（2〜4往復）→ 時間が来たら担当者が区切る（初回打ち合わせは60分の枠）
  hearing(s) {
    const co = s.cur, second = s.visit[1] === co, mt = s.meet[co] || { rounds: 0, min: 0 };
    const canEnd = (mt.rounds >= 2 || mt.ended) && !busy.on;
    const clock = `<div class="meetclk"><b>打ち合わせ ${Math.min(60, mt.min)}分</b>／60分<div class="mbar"><i style="width:${Math.min(100, mt.min / 60 * 100)}%"></i></div></div>`;
    const quick = !busy.on && !mt.ended && mt.lastCall ? `<button class="opt ch" data-act="noMore">とくにありません</button>` : !busy.on && !mt.ended ? ['おまかせします', 'あとで考えます'].map(t => `<button class="opt ch" data-act="choose" data-t="${t}">${t}</button>`).join('') + `<button class="opt" data-act="openShow">写真やURLを見せる</button>` : '';
    const end = !mt.ended && !mt.lastCall && canEnd ? `<button class="opt" data-act="endMeeting">今日はこのあたりで</button>` : '';
    return `${chrome(s)}${hero(s, boardHTML(s), 'withboard')}<div class="right ${tall(s)}">${chat(s, { ch: co, head: staffHead(co, busy.on || (s.trust[co]?.stage || 0) >= 2 ? 'think' : 'idle', second ? '2社目' : '1社目') + clock, opts: quick + end, thinking: busy.on, placeholder: mt.ended ? '今日の打ち合わせは終わりました' : '担当者に答える・補足する' })}</div>${gallery(s)}`;
  },
  forgot(s) {
    const co = s.visit[0];
    const said = s.chat.some(m => m.ch === 'partner' && m.forgot && !m.byPartner);
    return `${chrome(s)}${hero(s)}<div class="right ${tall(s)}"><div class="chat"><div class="staffbar">${P.spouse('yuu', 70)}<div class="nm">帰り道<b>${esc(NAMES.yuu)}と話す</b></div></div>
      <div class="log">${s.chat.filter(m => m.ch === 'partner').map(msgHTML).join('')}</div>
      
      <div class="in">${tbox('say', 'sayPartner', `伝え忘れたことを、${esc(NAMES.yuu)}に話す`, 3, '話す')}</div>${navs(s)}</div></div>${gallery(s)}`;
  },
  reply(s) {
    const co = s.visit[0];
    return `${chrome(s)}${hero(s)}<div class="right ${tall(s)}"><div class="chat msgapp"><div class="staffbar">${P.avatar(co, 64, busy.on ? 'think' : 'smile', 'id="face"')}<div class="nm">翌日　メッセージ<b>${Y.COMPANIES[co].name}・${STAFFN(co)}</b></div></div>
      <div class="log">${s.chat.filter(m => m.ch === 'msg').map(msgHTML).join('')}${failNote(s, 'msg')}${busy.on ? `<div class="msg typing">${Y.COMPANIES[co].staff}さんが入力中……</div>` : ''}</div>${navs(s)}</div></div>${gallery(s)}`;
  },
  compare(s) {
    const tab = s.tab || s.visit[0];
    const spec = Y.baseSpec(H(s));
    const q = Y.quote(spec, tab, false);
    const shown = q.lines.filter(l => l.shown), hidden = q.lines.filter(l => !l.shown);
    const roof = Y.COMPANIES[tab].roof;
    // 反映した要望：その会社に伝わった要望の記憶から、問いごとに1つ（ふたりが同じ答え・優先度の高いものから）
    const heard = s.memory ? (() => { const seenQ = new Set(); return s.memory.items.filter(x => x.deliveredTo[tab] === 'told').sort((a, b) => (b.priority === 'must') - (a.priority === 'must') || (b.who === 'both') - (a.who === 'both')).filter(x => { const k = x.q || x.id; if (seenQ.has(k)) return false; seenQ.add(k); return true; }).slice(0, 4).map(x => x.text); })() : s.heard.filter(h => h.co === tab).slice(0, 4).map(h => h.text);
    const pitch = { A: '性能と保証を標準で。断熱は', B: '規格プランをもとに、ご要望に近い形を選びました。断熱は', C: '暮らしの時間帯に合わせて、南に開いた間取りにしました。断熱は', D: 'ご要望は全部入れておきました。細かいところは、これから一緒に。断熱は' }[tab];
    const thumb = P.thumb({ w: { no: 3, spec: { roof, exterior: 'full' }, company: tab, bits: [] }, stage: 4, ghost: 0 }, { style: 'width:300px;height:220px' });
    return `${chrome(s)}<div class="tabs">${s.visit.map(co => `<button class="tab" data-act="tab" data-co="${co}" aria-pressed="${co === tab}">${P.coTag(co, 24)}${Y.COMPANIES[co].name}</button>`).join('')}</div>
      <div class="qpanel"><div class="qh">${P.coTag(tab, 26)}${Y.COMPANIES[tab].name}の見積　<span>${q.label}</span></div><div class="qcover">${man(q.cover)}<small>万円</small></div>
        <table class="qt">${shown.map(l => `<tr><td>${l.label}</td><td>${l.range ? `概算 ${l.range[0]}〜${l.range[1]}万円` : man(l.v) + '万円'}</td></tr>`).join('')}${hidden.map(l => `<tr class="hid"><td>${l.label}</td><td>別途</td></tr>`).join('')}</table>
        <p class="note">${spec.tsubo}坪・総二階の案。地盤調査は${Y.COMPANIES[tab].groundTiming}。</p></div>
      <div class="ppanel"><div class="pp-top">${thumb}<div><h4>提案</h4><p>${pitch}等級${Y.COMPANIES[tab].insul}。</p>${heard.length ? `<p class="note">反映した要望：${heard.map(esc).join('、')}</p>` : ''}</div></div>
        ${chat(s, { ch: tab, head: '', thinking: busy.on, act: 'askCompare', placeholder: `${Y.COMPANIES[tab].staff}さんに、見積や提案について聞く` })}</div>`;
  },
  // 流れ v3：提案の日。2社の案（間取りの骨組み・延床と形・立体・概算見積・希望との違い）を左右に並べる
  proposal(s) {
    const cos = s.visit.slice(0, 2), TMP = { A: '#EFE9DF', B: '#DDE6EA', C: '#C9A27A', D: '#F2E3C9' }, TMPR = { A: '#3E4148', B: '#3B4A57', C: '#2F3338', D: '#8B5E3C' }; // 提案の段階の仮の外壁の色（会社を見分けるため）
    const col = co => {
      const p = s.proposals[co], C = Y.COMPANIES[co];
      if (!p) return `<section class="pp-col wait">${P.coTag(co, 30)}<b>${C.name}</b><div class="zone skel">${zoningSVG(null)}</div><p class="lead">${STAFFN(co)}「図面を広げますね……」</p></section>`;
      const m = p.mainM, plan = p.main, w = Y.newWorld({ household: H(s), company: co }); Y.applyPlan(w, plan);
      const q = Y.quote(w.spec, co, false);
      const house = P.bigHouse({ ...w, no: 3, spec: { ...w.spec, exterior: 'min' } }, 4, { fin: { wall: TMP[co], roof: TMPR[co] } });
      const wl = m.wishes?.length ? `<ul class="wbox">${wishLine(m.wishes.map(x => ({ ...x, kind: /総額/.test(x.label) ? 'totalMax' : /月々/.test(x.label) ? 'monthlyMax' : 'area' })))}</ul>` : '';
      return `<section class="pp-col"><div class="pp-hd">${P.coTag(co, 34)}<b>${C.name}</b><span>${STAFFN(co)}${p.fallback ? '<span class="mk">代わりの処理</span>' : ''}</span></div>
        <p class="pp-intro">${esc(p.intro || '')}</p>
        <div class="pp-zone">${zoningSVG(plan)}</div>
        <div class="pp-low"><div class="pp-house">${house}</div><div class="pp-facts"><div><span>延床と形</span><b>${m.tsubo}坪・${esc(P.formLabel(w))}・${Y.ROOF_JA[plan.shape?.roof] || ''}</b></div>
          <div><span>見積の表紙（${esc(q.label)}）</span><b>${man(q.cover)}万円</b></div>
          <div><span>総額（土地と建物）</span><b>${man(m.total)}万円</b></div><div><span>月々の返済</span><b>約${m.monthly.toFixed(1)}万円</b></div></div></div>${wl}</section>`;
    };
    const ready = cos.every(co => s.proposals[co]);
    return `${chrome(s)}<div class="pp-band">${(() => { const d = Y.scheduleOf(Y.newWorld({ household: H(s), company: s.visit[0] || 'C' })); return `初回の打ち合わせから${Math.max(1, d[1] - d[0])}日後——提案の日`; })()}</div><div class="pp-wrap">${cos.map(col).join('')}</div>`;
  },
  // 分岐点：儀式にする。暗くなって札の名前と問いが大きく出て、2枚の札がメインの領域いっぱいに並ぶ。担当者は出てこない
  fork(s) {
    const d = Y.decisions(s.pair)[s.forkNo];
    if (!d && !FORK_DONE.on) return chrome(s) + hero(s) + gallery(s);
    if (FORK_DONE.on) return `${chrome(s)}${hero(s)}<div class="ritual done"><div class="rt-band">${esc(FORK_DONE.text)}</div><svg class="rt-lot" viewBox="0 0 1860 676" aria-hidden="true"><polygon points="560,284 848,448 580,601 292,438" pathLength="100"/></svg></div>${gallery(s)}`;
    const w = s.player;
    // 2枚とも同じ「守れない希望」なら、札の上に1行だけ（攻めのレビュー11/5：同じ行が両方の札に出て、判断の材料にならなかった）
    const ngOf = side => { const t = Y.forkWorld(w); Y.choose(t, d, side); if (d.id === 'D1' && s.proposals?.[t.company]) Y.applyPlan(t, fitProposalW({ ...s.proposals[t.company], co: t.company }, { household: s.household, wishes: s.wishes, co: t.company }).main); return Y.checkWishes(t, s.wishes).filter(c => !c.ok).map(c => c.label).join('、'); };
    const ngA = ngOf('a'), ngB = ngOf('b'), commonNg = ngA && ngA === ngB ? ngA : '';
    // 第四の分岐点が自動で出るとき、選ばれる札は色決めで実際に選んだ中身で作る（監査11/5：「外壁と床」と出るのに外壁だけ、を避ける）
    const autoLab = f => `グレードアップして仕上げた（${[f.wall !== 'std' && '外壁', f.floor !== 'std' && '床', f.inner !== 'vinyl' && '内壁'].filter(Boolean).join('・')}）`;
    const card = side => { const t = Y.forkWorld(w); Y.choose(t, d, side); if (d.id === 'D4' && s.autoFork === side && Y.finishCost(w.finish)) t.finish = { ...w.finish }; if (d.id === 'D1' && s.proposals?.[t.company]) Y.applyPlan(t, fitProposalW({ ...s.proposals[t.company], co: t.company }, { household: s.household, wishes: s.wishes, co: t.company }).main); const m = Y.money(t), m0 = Y.money(w); const df = m.total - m0.total, mo = Y.payment(m.loan, Y.RATE.variable) - Y.payment(m0.loan, Y.RATE.variable); const lc = Y.loanCheck(H(s), m.loan);
      const co = Y.COMPANIES[t.company];
      const life = (w.company !== t.company || d.id === 'D1' ? `${co.kind}。担当は${co.staffRole}の${co.staff}さん、${Y.ROOF_JA[t.spec.roof]}の家` : diffWords(w, t)[0]) || '暮らしは大きくは変わらない';
      const mon = Y.payment(m.loan, Y.RATE.variable);
      return `<div class="rt-body"><div class="rt-name">${esc(d.id === 'D4' && s.autoFork === side && Y.finishCost(w.finish) ? autoLab(w.finish) : lab(d[side], w))}</div><div class="rt-num">総額 ${man(m.total)}<small>万円</small>${Math.round(df) && d.id !== 'D1' ? `<em>${df > 0 ? '+' : '−'}${man(Math.abs(df))}</em>` : ''}</div><div class="rt-sub">月々 約${mon.toFixed(1)}万円${Math.abs(mo) >= 0.05 && d.id !== 'D1' ? `（${mo > 0 ? '+' : '−'}${Math.abs(mo).toFixed(1)}）` : ''}${lc.ok ? '' : '　審査の上限を超える'}${t.fitted && !w.fitted ? `　予算に合わせた案（${t.spec.tsubo}坪）` : ''}</div><div class="rt-life">${esc(life)}</div>${d.id === 'D1' && DATA.brochures?.brochures?.[t.company]?.catch ? `<div class="rt-catch">チラシの一行：「${esc(DATA.brochures.brochures[t.company].catch)}」</div>` : ''}<ul class="wbox">${wishLine(Y.checkWishes(t, s.wishes), { hideNg: !!commonNg })}</ul></div><div class="rt-house">${P.coTag(t.company, 26)}${P.bigHouse(t, d.id === 'D3' || d.id === 'D4' ? 4 : 3, d.id === 'D4' ? { fin: P.finOf(t) } : {})}</div>`; };
    const pend = s.pendingTrade, side = s.pendingSide;
    const intro = INTRO.has(`${s.playId}-${d.no}`) ? '' : 'intro';
    let body;
    if (pend) {
      // 自由回答：承認する前に、その答えを当てたときの家と、変わるところを見せる（答えが家を変えることを、画面で）
      let pv = '';
      const tw = Y.forkWorld(w); if (d.id === 'D1') tw.proposalPlans = Object.fromEntries(Object.entries(s.proposals || {}).map(([c, x]) => [c, fitProposalW({ ...x, co: c }, { household: s.household, wishes: s.wishes, co: c }).main])); try { if (pend.proposal) Y.choose(tw, d, pend.proposal); } catch { }
      const spk = d.id === 'D1' ? tw.company : w.company; // 第一の分岐点では、選んだ会社の担当者が答える
      // 変わるところは、札に出していた同じ会社の提案と比べる（第一の分岐点）
      const cw = d.id === 'D1' ? (() => { const c = Y.forkWorld(w); c.proposalPlans = tw.proposalPlans; try { Y.choose(c, d, pend.proposal?.side || 'a'); } catch { } return c; })() : w;
      if (pend.proposal) { const t = tw; const ch = diffWords(cw, t).slice(0, 3); pv = `<div class="rt-pv">${P.bigHouse(t, 4, { fin: P.finOf(t) })}<ul>${(ch.length ? ch : ['見た目は変わらない']).map(x => `<li>◆ ${esc(x)}</li>`).join('')}</ul></div>`; }
      body = `<div class="rt-tw">${pv}<div class="rt-trade"><div class="msg"><div class="who">${P.coTag(spk, 18)}${Y.COMPANIES[spk].name}・${STAFFN(spk)}${pend.call?.fallback ? '<span class="mk">代わりの処理</span>' : ''}</div>${esc(pend.message)}<div class="cond">${pend.result.conditions.map(c => '・' + esc(c)).join('<br>')}</div></div>
        ${pend.result.wishCheck?.length ? `<ul class="wbox">${wishLine(pend.result.wishCheck)}</ul>` : ''}${band(s)}
        <div class="rt-acts">${pend.result.verdict === 'いまは難しい' ? '<span class="note">この条件では進められません。</span><button class="opt" data-act="cancelTrade">ほかの答えを考える</button>' : '<button class="opt" data-act="cancelTrade">やめておく</button>'}</div></div></div>`;
    } else if (side) {
      // 札を選んだら、そのまま決まる（理由は聞かない。FLOW_v3 の6）
      const other = side === 'a' ? 'b' : 'a';
      body = `<div class="rt-cards picked"><div class="rt-card on">${card(side)}</div><div class="rt-card fly">${card(other)}</div></div>`;
    } else {
      const refusedSide = side0 => { if (!s.refused || d.id !== 'D1') return false; const t = Y.forkWorld(w); Y.choose(t, d, side0); return t.company === s.refused.co; };
      const btn = side0 => PICK.key === pickKey(s) && PICK.side === side0 ? `<button class="rt-card sel" data-act="pickSide" data-side="${side0}" aria-pressed="true">${card(side0)}</button>` : s.autoFork ? `<div class="rt-card auto">${card(side0)}</div>` : refusedSide(side0) ? `<div class="rt-card off">${card(side0)}<div class="rt-off">この会社とは、話が終わりました</div></div>` : `<button class="rt-card" data-act="pickSide" data-side="${side0}">${card(side0)}</button>`;
      body = `${s.autoFork ? '<div class="rt-common">色決めの内容から、自動で決まります</div>' : ''}<div class="rt-cards">${btn('a')}${btn('b')}</div>
        <div class="rt-in free">${whoSw()}${tbox('say', 'freeAnswer', d.id === 'D3' ? '札を押すか、自分の言葉で答える（例：借入を少し増やして、南の大きな窓だけトリプルガラスにしたい）' : '札を押すか、自分の言葉で答える', 2)}</div>
        <div class="rt-navs">${navs(s)}</div>${busy.on ? '<div class="msg typing" style="margin:8px auto 0;max-width:600px">考えています……</div>' : ''}`;
    }
    return `${chrome(s)}${hero(s)}<div class="ritual ${intro}"><div class="rt-mark">${Y.FORKS[d.no]}</div><div class="rt-q">${d.q}</div>${commonNg && !pend ? `<div class="rt-common">どちらの札でも守れない希望：${esc(commonNg)}</div>` : ''}${body}</div>${gallery(s)}`;
  },
  fork_after(s) { const d = Y.decisions(s.pair)[s.forkNo]; if (d && !INTRO.has(`${s.playId}-${d.no}`)) setTimeout(() => INTRO.add(`${s.playId}-${d.no}`), 1600); },
  contract(s) {
    const m = Y.money(s.player), co = s.player.company, lc = Y.loanCheck(H(s), m.loan);
    return `${chrome(s)}${hero(s, nearestCard(s))}<div class="right ${tall(s)}"><div class="chat">${staffHead(co, 'smile')}<div class="log" data-top style="padding:22px">
      <div class="msg"><div class="who">${P.coTag(co, 18)}${STAFFN(co)}</div>請負契約の書類です。図面と見積の内容をご確認ください。</div>
      <dl class="facts" style="font-size:20px;margin-top:10px"><dt>契約金額（建物）</dt><dd>${man(m.contract)}万円</dd><dt>土地</dt><dd>${man(m.land)}万円</dd><dt>総額</dt><dd>${man(m.total)}万円</dd><dt>借入</dt><dd>${man(m.loan)}万円（返済負担率 ${lc.ratio}%）</dd><dt>月々の返済（変動 ${Y.RATE.variable * 100}%）</dt><dd>約${lc.monthly.toFixed(1)}万円</dd><dt>選んだ道</dt><dd>${s.player.labels.map(esc).join('<br>')}</dd></dl></div>${navs(s)}</div></div>${gallery(s)}`;
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
      <div class="opts"><span class="note" style="align-self:center">調整はあと${Math.max(0, 3 - (s.planRound || 0))}回</span></div>
      <div class="in">${whoSw()}${tbox('say', 'planAsk', '例：書斎はいらない／子ども部屋は将来仕切る／収納は一か所にまとめたい', 3, '伝える', (s.planRound || 0) >= 3)}</div>${navs(s)}</div></div>`;
  },
  // 第四の分岐点：コーディネートで選んだ結果が、そのまま分岐点の答えになる
  // 色決め（P4-a）：外壁・床・内壁の色と素材を選ぶ →「仕上げを確定する ▶」→ 第四の分岐点が自動で（FLOW_v3 の3.5）
  coord(s) {
    const w = s.player, f = w.finish;
    const wall = Y.FINISH.wall.find(x => x.id === f.wall) || Y.FINISH.wall[0];
    const cn = coordinator(s)?.name || '中村';
    const opt = (k, x) => `<button class="o" data-act="finish" data-k="${k}" data-v="${x.id}" aria-pressed="${f[k] === x.id}"><span class="sw" style="background:${x.sw || x.colors[0][1]}"></span>${x.label}<em>${x.v ? '+' + x.v + '万円' : '標準'}</em></button>`;
    const add = Y.finishCost(f);
    return `${chrome(s)}${hero(s)}<div class="right ${tall(s)}"><div class="chat"><div class="staffbar">${P.avatar(coordinator(s)?.gender === 'male' ? 'IC2' : 'IC', 70, 'smile')}<div class="nm">${Y.COMPANIES[w.company].name}<b>コーディネーター・${esc(cn)}</b></div><div class="nm" style="margin-left:auto;text-align:right">色決め</div></div>
      <div class="log coord" data-top style="padding:14px 22px;justify-content:flex-start">
      <div class="msg"><div class="who">コーディネーター・${esc(cn)}</div>${esc((coordinator(s)?.tone || ['外壁と床、内壁を決めましょう。'])[0])}標準からの増額だけ、お伝えしますね。</div>
      <h4>外壁</h4>${Y.FINISH.wall.map(x => opt('wall', x)).join('')}
      <div class="colors big">${wall.colors.map((c, i) => `<button data-act="finish" data-k="color" data-v="${i}" aria-pressed="${(f.color || 0) === i}" style="background:${c[1]}" title="${c[0]}"><span>${c[0]}</span></button>`).join('')}</div>
      <h4>床</h4>${Y.FINISH.floor.map(x => opt('floor', x)).join('')}<h4>内壁</h4>${Y.FINISH.inner.map(x => opt('inner', x)).join('')}</div>
      <div class="opts"><span style="font-size:18px;align-self:center">${add ? `グレードアップ +${man(add)}万円` : '標準の仕上げのまま'}</span></div>${navs(s)}</div></div>${gallery(s)}`;
  },
  // 電気の打ち合わせ（受け入れ基準4）：全画面。左に部屋ごとの一覧（標準／契約で決めたオプション／追加）、右に担当者と確認
  electric(s) {
    const w = s.player, co = w.company;
    const contract = new Set(w.contractOpts || []);
    const rooms = Y.electricRooms(co);
    for (const o of Y.ELECTRIC.options.filter(x => w.electric.includes(x.id))) {
      const [room, icon] = Y.ELECTRIC_OPT_ROOM[o.id] || ['LDK', 'outlet'];
      const adj = (w.adds || []).filter(a => a.label === `伝え漏れの扱い：${o.label}`).reduce((t, a) => t + a.v, 0);
      rooms[room].push({ icon, text: o.label, kind: contract.has(o.id) ? 'contract' : 'add', v: contract.has(o.id) ? 0 : Math.round((o.v + adj) * 10) / 10, fresh: s.elecFresh?.includes(o.id) });
    }
    const addSum = Object.values(rooms).flat().filter(x => x.kind === 'add').reduce((a, x) => a + x.v, 0);
    const cands = Y.ELECTRIC.options.filter(o => !w.electric.includes(o.id));
    const KIND = { contract: '契約', add: '追加' };
    const item = x => `<li class="ei ${x.kind || 'std'} ${x.fresh ? 'fresh' : ''}">${EICON[x.icon] || EICON.outlet}<span>${esc(x.text)}</span>${x.kind ? `<em>${KIND[x.kind]}${x.kind === 'add' ? (x.v ? ` +${x.v}万円` : '（費用なし）') : ''}</em>` : ''}</li>`;
    return `${chrome(s)}<div class="elec-full">
      <div class="el-left"><div class="el-hd"><h3>電気の図面の内容</h3><span class="lg"><i class="std"></i>標準でついているもの<i class="contract"></i>契約で決めたオプション<i class="add"></i>追加${addSum ? `（${Math.round(addSum * 10) / 10}万円）` : ''}</span></div>
        <div class="el-rooms">${Y.ELECTRIC_ROOMS.map(r => `<section class="el-room"><h4>${r}</h4><ul>${rooms[r].map(item).join('')}</ul></section>`).join('')}</div></div>
      <div class="el-right">${staffHead(co, busy.on ? 'think' : 'idle', '電気の打ち合わせ')}
        <div class="log" style="justify-content:flex-start"><div class="msg"><div class="who">${P.coTag(co, 18)}${STAFFN(co)}</div>電気の図面です。左の内容で進めますが、問題ないでしょうか？</div>
        ${s.chat.filter(m => m.ch === 'elec').map(msgHTML).join('')}${failNote(s, 'elec')}${busy.on ? '<div class="msg typing">確認しています……</div>' : ''}</div>
        <div class="opts">${s.elecOk ? '<span class="note" style="align-self:center">この内容で確定しました</span>' : '<button class="opt" data-act="elecOk">この内容でOK</button>'}</div>
        <div class="tags"><span>要望の候補：</span>${cands.map(o => `<button data-act="elecTag" data-id="${o.id}">${o.label}</button>`).join('')}</div>
        <div class="in">${whoSw()}${tbox('say', 'sendElectric', '気になるところを伝える（例：伝えていたはずのものが、左の一覧にない）', 2, '伝える')}</div></div>
    </div>`;
  },
  // S6：「着工する ▶」で、工程が自動で進む。前の工程で立ったフラグ（聞き漏れ）だけが、施主検査で芽を出す
  build(s) {
    const days = Y.scheduleOf(s.player);
    const INSPECT = /窓|収納|下地|コンセント|照明|床|壁|扉|棚|洗面|キッチン|テレビ|エアコン|LAN|手すり|クロス|スイッチ/;
    // 電気の打ち合わせで直したものは、施主検査で「気づいたこと」に出さない（攻めのレビュー11/5：解決済みの要望がまた出ていた）
    const fixed = t => { const ids = Y.electricOf(t); return ids.length && ids.every(id => s.player.electric.includes(id)); };
    const found = s.missed.filter(m => m.co === s.player.company && INSPECT.test(m.said || '') && !fixed(m.said)).slice(0, 2);
    const rows = [[7, '申請・着工', '確認の申請がおりて、地鎮祭。基礎の工事に入る'], [8, '上棟', '骨組みが立ち上がる。家の形がいちばんわかる日'], [9, '施主検査', found.length ? `頼んだとおりか確かめる。気づいたこと：${found.map(m => esc(m.said)).join('／')}` : '頼んだとおりか、付箋を貼って確かめる'], [10, '引渡し', '鍵を受け取る']];
    const auto = s.buildAuto;
    const anim = auto ? `<div class="hero ${tall(s)} bld"><div class="lab"><span class="no">${pad(YOU)}</span>あなたの家　${P.coTag(s.player.company, 28)}${Y.COMPANIES[s.player.company].name}</div><div id="banim"></div><div class="bcap" id="bcap"></div></div>` : hero(s);
    return `${chrome(s)}${anim}<div class="right ${tall(s)}"><div class="chat"><div class="staffbar"><div class="nm">工事の帳面<b>着工から引渡しまで</b></div></div>
      <ol class="timeline">${rows.map(([st, t, d]) => `<li class="${s.step >= st && (auto || st === 7 && s.step > 7) ? 'on' : ''}"><b>${days[st]}日目</b><span><b>${t}</b><br>${d}</span></li>`).join('')}</ol>
      <div class="opts" style="margin-top:auto">${auto ? '<span class="note">工事が進んでいます……</span>' : ''}</div>${navs(s)}</div></div>${gallery(s)}`;
  },
  build_after(s) {
    if (!s.buildAuto) return;
    if (BUILD.t0 == null) BUILD.t0 = performance.now();
    cancelAnimationFrame(BUILD.raf);
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches, fin = P.finOf(s.player);
    const tick = () => {
      const el = document.getElementById('banim'), cap = document.getElementById('bcap'); if (!el || BUILD.t0 == null) return;
      const t = Math.min(DUR, (performance.now() - BUILD.t0) / 1000);
      el.innerHTML = drawBuild({ ...s.player, form: P.formOf(s.player) }, t, fin, reduce);
      const k = phaseAt(t); if (cap && cap.dataset.k !== String(k)) { cap.dataset.k = k; cap.textContent = PHASES[k][1]; }
      if (t < DUR) BUILD.raf = requestAnimationFrame(tick);
    };
    tick();
  },
  // S7：白いフェードで入る引渡し式。動きが止まったら「写真を保存」と「そして1年後……」
  // S7 引渡し（受け入れ基準5）：着工〜施主検査の早送り → 白いフェード → 切り絵（W4の描き方を、家の状態のJSONから）で、家族と担当者が家の前に立つ
  handover(s) {
    const w = s.player, m = Y.money(w), co = w.company, days = Y.scheduleOf(w);
    const st = encodeURIComponent(JSON.stringify(paperState(s)));
    return `${chrome(s)}<div class="w4"><iframe id="paper" src="/paper.html?st=${st}" title="引渡しの日の家（切り絵）" tabindex="-1"></iframe>
        <div class="lab"><span class="no">${pad(YOU)}</span>あなたの家　${P.coTag(co, 26)}${Y.COMPANIES[co].name}</div></div>
      <div class="w4side"><div class="keys"><h3>引渡しの書類</h3><table>
        <tr><td>最終の総額</td><td>${man(m.total)}万円</td></tr><tr><td>うち増工</td><td>${man(m.add)}万円</td></tr><tr><td>借入</td><td>${man(m.loan)}万円</td></tr><tr><td>引渡し</td><td>${days[10]}日目</td></tr></table></div>
        <div class="chat">${staffHead(co, 'smile', '引渡し')}<div class="log" style="justify-content:flex-start">
          <div class="msg"><div class="who">${P.coTag(co, 18)}${STAFFN(co)}</div>鍵をお渡しします。おめでとうございます。</div>
          <div class="msg me late"><div class="who"><i class="sq"></i>${esc(NAMES.kazu)}</div>ありがとうございました。</div>
          <div class="msg late2"><div class="who">${P.coTag(co, 18)}${STAFFN(co)}</div>1年後の点検で、またうかがいます。</div></div>
          <div class="opts late2"><button class="opt" data-act="savePhoto">写真を保存</button></div></div></div>
      ${gallery(s)}<div class="whitefade"></div>`;
  },
  // 1年のうつろい：空の色と木の葉が、夏→秋→冬→春と移り変わる（夜は通らない）。最後に「1年後」の札
  seasons(s) {
    // 同じわが家の定点で、空と季節が1年ぶん移り変わる（切り絵は引渡しだけ。TESTPLAY T10）
    const w = s.player;
    return `<div class="seasons"><div class="sky"></div><div class="ground"></div><div class="tree"><i></i><i></i><i></i><i></i><i></i></div><div class="sz-house">${w ? P.bigHouse(w, 4, { fin: P.finOf(w) }) : ''}</div><div class="tag1y">1年後</div></div>`;
  },
  // S8a：1年後のわが家（リザルト）。選択の結果が絵に出る
  result(s) {
    const o = Y.outcome(s.player);
    return `${top(s)}${moneyBox(s)}<div class="hero tall res yr1"><div class="yr1-house">${P.bigHouse(s.player, 4, { fin: P.finOf(s.player), life: 1 })}</div><div class="pcap">${s.player.spec.exterior !== 'full' ? '玄関の前は、まだ砂利のまま' : '庭の緑が、少しずつ育ってきた'}</div></div><div class="card"><h3>${pad(YOU)}　あなたの家の、1年後</h3>
      <dl><dt>冬の朝</dt><dd>${o.warmth.label}</dd><dt>家計のゆとり</dt><dd>${o.slack.label}</dd><dt>総額</dt><dd>${man(o.total)}万円</dd><dt>借入</dt><dd>${man(o.principal)}万円</dd></dl>
      <div style="font-size:16px;color:var(--ink2);font-weight:700">この1年の出来事</div><ul class="ev">${(o.events.length ? o.events : ['大きな出来事はなかった']).slice(0, 3).map(e => `<li>${esc(e)}</li>`).join('')}</ul>
      <div style="font-size:16px;color:var(--ink2);font-weight:700;margin-top:14px">一つだけ選択が違う世界</div>
      <table class="cmp near4">${[0, 1, 2, 3].map(i => { const w = nearest(s, i); if (!w) return ''; const ow = Y.outcome(w); return `<tr><td>${Y.FORKS[i]}だけ逆</td><td>${esc(w.labels[i])}</td><td>${Math.round(ow.total) - Math.round(o.total) > 0 ? '+' : ''}${man(Math.round(ow.total) - Math.round(o.total))}万円</td><td>${ow.warmth.label}</td></tr>`; }).join('')}</table>
</div>`;
  },
  year(s) {
    const all = [s.player, ...s.others].map(w => ({ w, o: Y.outcome(w), n: dno(s, w) })).sort((a, b) => a.n - b.n);
    P.setYou(YOU);
    const list = all.map(({ w, n }) => ({ w: { ...w, no: n }, stage: w.unbuilt ? 0 : 4, ghost: 0, note: '' }));
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
      <div class="acts">${mine ? '' : `<button class="btn" data-act="peek" data-no="${sel.n}">この世界線を覗く</button>`}<button class="btn ghost" data-act="toTree" data-no="${sel.n}">世界樹で、この世界をたどる</button></div></div>`;
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
    if (r.failed) return `${top(s)}<div class="center" style="text-align:center"><p class="lead">レポートを書けませんでした。</p></div>`;
    const tab = s.rtab || 'home';
    const tabs = [['home', 'わが家'], ['worlds', '選ばれなかった世界線'], ['honne', 'それぞれの事情と見積の透視']].map(([k, l]) => `<button class="tab" data-act="rtab" data-k="${k}" aria-pressed="${tab === k}">${l}</button>`).join('');
    let body = '';
    if (tab === 'home') {
      // 冒頭：水彩のパース（W1の描き方、画像生成は使わない）と、タイトルの一言（受け入れ基準6）
      const w = s.player, wcq = new URLSearchParams({ roof: { gable: '切妻', hip: '切妻', mane: '片流れ', cube: '陸屋根', flat: '陸屋根' }[w.spec.roof] || '陸屋根', finish: w.finish.wall === 'galva' ? 'ガルバリウム' : '塗り壁', time: o.warmth.level >= 3 ? '夕方' : '昼', season: '春', carport: '2', seed: String(YOU), wall: P.finOf(w).wall });
      body = `<div class="rep rep2">
        <div class="rp-hero"><div class="rp-wc"><iframe src="/watercolor.html?${wcq}" title="わが家の水彩" tabindex="-1"></iframe></div>
          <div class="rp-title"><div class="k">わが家の、ちょうどいいバランス</div><h2>${esc(r.title)}</h2><p class="lead">${esc(r.closing)}</p>
            <div class="rp-bal"><div class="k">悩んだら、これを優先する</div>${r.balance.slice(0, 3).map((x, i) => `<div class="rk"><span class="no">${i + 1}</span><b>${esc(x)}</b></div>`).join('')}</div></div></div>
        <div class="rp-row">
          <section class="box"><h3>分岐点で、守ろうとしたもの</h3><div class="rp-radar">${radarSVG(s, 230)}</div><ul class="mem">${protectedReasons(s.player, s.others, s.memory).map((x, i) => `<li><b>${Y.FORKS[i] || ''}　${esc(s.player.labels[i] || '')}</b>${esc(x.t)}<span class="mk">${x.by}</span></li>`).join('')}</ul></section>
          <section class="box"><h3>本物の打ち合わせで、先に伝えておきたいこと</h3><ol>${r.tellFirst.map(x => `<li>${esc(x)}</li>`).join('')}</ol>${keptHTML(s)}</section>
          <section class="box"><h3>1年後のあなたの家</h3><dl class="facts rp-facts"><dt>総額</dt><dd>${man(o.total)}万円</dd><dt>借入</dt><dd>${man(o.principal)}万円</dd><dt>月々の返済</dt><dd>約${Y.payment(o.principal, Y.RATE.variable).toFixed(1)}万円</dd><dt>冬の朝</dt><dd>${o.warmth.label}</dd><dt>家計のゆとり</dt><dd>${o.slack.label}</dd></dl>
            ${r.couple ? `<h3>ふたりの傾向</h3><p class="lead">${esc(r.couple)}</p>` : ''}<p class="note" style="margin-top:14px">印刷用（PDF）は、右上のボタンから。</p></section>
        </div></div>`;
    }
    if (tab === 'worlds') { const ws = [s.player, ...s.others].map(w => ({ w, o: Y.outcome(w), n: dno(s, w) })).sort((a, b) => a.n - b.n);
      const meO = Y.outcome(s.player);
      // 同じ気づきが2回出たら、2回目からは選択の違いから書く（攻めのレビュー11/5：同じ文が並んでいた）
      const seenL = new Set(); const lessonU = oo => { let l = Y.worldLesson(oo, meO); if (seenL.has(l)) l = Y.worldLesson(oo, meO, { noCause: true }); seenL.add(l); return l; };
      body = `<div class="rep1"><div class="treehint"><button class="btn" data-act="toTree">世界樹で見る</button><span class="note">分岐点ごとの選択をたどって、16の家を見られます</span></div><table class="wtab">${ws.map(({ o: oo, n }) => `<tr class="${n === YOU ? 'me' : ''}"><td>${pad(n)}</td><td>${P.coTag(oo.company, 20)}</td><td><b>${esc(Y.worldName(oo))}</b><span>${n === YOU ? 'あなたが選んだ世界' : 'この世界線での気づき：' + esc(lessonU(oo))}</span></td><td>${oo.unbuilt ? '—' : oo.warmth.label}</td><td>${oo.unbuilt ? '—' : oo.slack.label}</td><td>${oo.unbuilt ? '—' : man(oo.total) + '万円'}</td></tr>`).join('')}</table></div>`; }
    if (tab === 'honne') body = honneBody(s);
    return `${top(s)}<div class="rtabs">${tabs}</div><div class="racts"><button class="btn ghost" data-act="toTree">世界樹で見る</button><button class="btn ghost" data-act="print">印刷用（PDF）</button></div>${body}`;
  },
  // 世界樹：根から4つの分岐点を経て、16の枝先に家が並ぶ。枝先を押すと、その道が根から描かれる
  tree(s) {
    const all = [s.player, ...s.others].map(w => ({ w, o: Y.outcome(w), n: dno(s, w) }));
    const byNo = Object.fromEntries(all.map(x => [Y.worldNo(x.w.bits), x]));
    const meO = Y.outcome(s.player), mine = Y.worldNo(s.player.bits);
    const selN = s.treeSel || YOU, sel = all.find(x => x.n === selN) || all.find(x => x.n === YOU);
    const X = k => 120 + k * 235, LY = i => 110 + i * 58, nodeY = (k, j) => { const span = 16 >> k; let a = 0; for (let i = j * span; i < (j + 1) * span; i++) a += LY(i); return a / span; };
    const onPath = (bits, k, j) => (j === parseInt(bits.slice(0, k).join('') || '0', 2));
    // 枝の名前は、その世界で実際に選んだ札（自由回答ならその答え）から。屋根の形では付けない（同じ名前の枝が並んでいた）
    const short = t => String(t || '').replace(/(にする|で進める|を受ける)$/, '').replace(/（.*?）/g, '').slice(0, 11);
    const lab = (k, x) => { const w = x.w; if (w.third === ['D1', 'D2', 'D3', 'D4'][k - 1]) return '◆' + short(w.labels[k - 1]); return k === 1 ? Y.COMPANIES[w.company].name : k === 2 ? short(w.labels[1]) : k === 3 ? (w.spec.exterior === 'full' ? '外構まで' : '外構は最小限') : (Y.finishCost(w.finish) ? 'グレードアップ' : '標準の仕上げ'); };
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
    // 分岐点の日は、プレイヤーが決めた日と同じ（画面の時計と同じ計算。世界ごとの工程表からは出さない）
    const o = sel.o, pd = Y.scheduleOf(s.player), at = [pd[1], pd[2], pd[4], pd[5]];
    const div = o.bits.findIndex((b, i) => b !== meO.bits[i]);
    const tl = o.labels.map((l, i) => `<li class="${i === div ? 'dv' : ''}"><b>${Y.FORKS[i]}</b><span>${esc(l)}</span><em>${at[i]}日目${i === div ? '　ここであなたと分かれた' : ''}</em></li>`).join('');
    const d = Math.round(o.total - meO.total);
    return `<div class="treebg"></div><div class="treetop"><div class="h2" style="margin:0">世界樹</div><span class="note">枝先の家を押すと、その世界線を根からたどります。墨の太い道が選んでいる世界、橙の道があなたの世界です。</span></div>
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
      <div style="display:flex;gap:16px;justify-content:center;margin-top:20px"></div>
      <p class="note" style="margin-top:40px">Built with Claude: Japan 2026　／　© 2026 KT (Studio ZaiYa)</p></div><div class="disc">${NOTICE}</div>`;
  },
};

// ---- 進行の帯（UI_NAV_SYSTEM）：右下に固定。「進む」は全画面でここに1つだけ。左に「いまやること」の1行 ----
export const PICK = { side: null, key: '' };
export const pickKey = s => `${s.playId}-${s.forkNo}`;
export function navOf(s) {
  const g = (act, label, o = {}) => ({ act, label, ...o });
  const off = (why) => ({ off: true, why });
  if (PEEK.on) return PEEK.mode === 'switch' ? { todo: 'そのころ、別の世界では——', go: g('peekClose', '自分の世界へ戻る ▶', off('別の世界線へ移っています')) } : { todo: '別の世界線を覗いています。操作は、あなたの世界のまま', go: g('peekClose', '自分の世界へ戻る ▶') };
  switch (s.scene) {
    case 'start': return { todo: '初めて家を建てる夫婦になって、家づくりを体験します', go: { act: 'start', label: '家づくりを体験する ▶' } };
    case 'seasons': return null;
    case 'howto': return { todo: s.howto === 0 ? '呼び名と、遊び方を選びましょう' : '遊び方を読みましょう', go: g('howtoNext', s.howto === HOWTO.length - 1 ? 'はじめる ▶' : 'つぎへ ▶') };
    case 'family': return { todo: '家族の条件を確かめましょう', go: g('toLotNoEntry', '区画へ ▶') };
    case 'entry': return { todo: '思いや理想を書いてみましょう', go: g('toLot', 'つぎへ ▶') };
    case 'lot': return { todo: '当たった区画を確かめましょう', go: g('toSources', '家づくりをはじめる ▶') };
    case 'gather': { const g = s.gather || { step: 'flyer', rank: [], saved: {} };
      if (g.step === 'flyer') return { todo: '気になる順に、1位から3位まで押してみましょう', go: g.rank.length >= 3 ? { act: 'gSns', label: 'SNSも見てみる ▶', ready: true } : { act: 'gSns', label: 'SNSも見てみる ▶', off: true, why: `あと${3 - g.rank.length}社に順位をつけてください` } };
      if (g.step === 'sns') { const n = (DATA.snsSearch?.searches || []).filter((_, i) => (g.saved?.[i] || []).length).length, all = (DATA.snsSearch?.searches || []).length || 3; return { todo: '各タブで、気になる投稿を1〜2個保存しましょう', back: { act: 'gBack', label: '＜ チラシへ' }, go: n >= all ? { act: 'gPick', label: '見に行く会社を選ぶ ▶', ready: true } : { act: 'gPick', label: '見に行く会社を選ぶ ▶', off: true, why: `まだ保存していないタブがあります（${n}／${all}）` } }; }
      return { todo: '見に行く会社を2つ選びましょう', go: s.visit.length === 2 ? { act: 'toVisit', label: 'この2社を訪ねる ▶', ready: true } : { act: 'toVisit', label: 'この2社を訪ねる ▶', off: true, why: `訪ねる会社を選んでください（${s.visit.length}/2）` } }; }
    case 'sources': return { todo: '入口を開いて、訪ねる2社を選びましょう', go: g('toVisit', 'この2社を訪ねる ▶', s.visit.length === 2 ? { ready: true } : off(`訪ねる会社を選んでください（${s.visit.length}/2）`)) };
    case 'survey': { const qs = DATA.survey?.questions || [], i = Math.min(s.sv.i, Math.max(0, qs.length - 1)), q = qs[i];
      const back = i > 0 || s.sv.who === 'p2' ? { act: 'svBack', label: '＜ 戻る' } : null;
      return { todo: `アンケートに答えましょう（あと${qs.length - i}問）`, back, go: q?.multi ? g('svNext', SV.sel.length ? 'つぎの問いへ ▶' : 'こだわらない ▶') : g('svNext', 'つぎの問いへ ▶', off('選ぶと、次の問いへ進みます')) }; }
    case 'hearing': { const co = s.cur, second = s.visit[1] === co, mt = s.meet[co] || { rounds: 0 };
      const go = g(second ? 'toCompare' : 'toForgot', second ? '提案の日へ ▶' : '帰り道へ ▶');
      if (busy.on) return { todo: '担当者の質問に答えましょう', go: { ...go, ...off('担当者の返事を待っています') } };
      if (mt.ended) return { todo: '担当者の質問に答えましょう', go: { ...go, ready: true } };
      if (mt.lastCall) return { todo: '最後に伝えたいことがあれば、伝えましょう', go: { ...go, ...off('担当者の最後の確認に答えてください') } };
      return { todo: '担当者の質問に答えましょう', go: { ...go, ...off(mt.rounds >= 2 ? '「今日はこのあたりで」で、打ち合わせを区切れます' : 'もう少し話してから、区切れます') } }; }
    case 'forgot': return { todo: '伝え忘れたことがあれば、話しましょう', go: g('toSecond', '2社目へ ▶', busy.on ? off('返事を待っています') : {}) };
    case 'reply': return { todo: '担当者からの返事を読みましょう', go: g('toSecond', '2社目へ ▶', busy.on ? off('返事を待っています') : {}) };
    case 'compare': return { todo: '2社の見積を見比べましょう', go: g('toFork1', '建てる会社を選ぶ ▶') };
    case 'proposal': { const ready = s.visit.slice(0, 2).every(co => s.proposals?.[co]);
      return { todo: '2社の提案を見比べて、建てる会社を選びます', go: g('toFork1', '建てる会社を選ぶ ▶', ready ? { ready: true } : off('提案をそろえています')) }; }
    case 'fork': { if (FORK_DONE.on || s.pendingSide) return { todo: 'この道で進みます', go: g('goSide', 'この道で進む ▶', off('道が分かれています')) };
      if (s.autoFork) return { todo: '色決めの内容から、自動で決まります', go: g('goSide', 'この道で進む ▶', off('自動で選ばれます')) };
      if (busy.on) return { todo: '札を押すか、自分の言葉で答えましょう', go: g('approve', 'この道で進む ▶', off('担当者が考えています')) };
      const pend = s.pendingTrade;
      if (pend) return { todo: '条件を確かめましょう', go: pend.result.verdict === 'いまは難しい' ? g('approve', 'この条件で進める ▶', off('この条件では進められません')) : g('approve', 'この条件で進める ▶', { ready: true }) };
      const picked = PICK.key === pickKey(s) && PICK.side;
      return { todo: '札を押すか、自分の言葉で答えましょう', go: g('goSide', 'この道で進む ▶', picked ? { ready: true } : off('札を押すと、選べます')) }; }
    case 'contract': return { todo: '契約の内容を確かめましょう', go: g('toCoord', '契約する ▶') };
    case 'plan': return { todo: '間取りの骨組みを確かめましょう', go: g('planConfirm', 'この案で進める ▶', busy.on || !s.plan ? off('図面に落としています') : {}) };
    case 'coord': return { todo: '色を選んで、仕上げを確定しましょう', go: g('decideCoord', '仕上げを確定する ▶') };
    case 'electric': return { todo: '電気の図面を確かめましょう', go: g('toBuild', '着工へ ▶', busy.on ? off('担当者が確認しています') : s.elecOk ? { ready: true } : off('左の内容を確かめて「この内容でOK」を押してください')) };
    case 'build': return s.buildAuto ? { todo: '工事を見守っています。引渡しまで、自動で進みます', go: g('toHandover', '引渡しへ ▶', off('工事が終わると、引渡しへ進みます')) } : { todo: '着工して、工事を見守りましょう', go: g('startBuild', '着工する ▶') };
    case 'handover': return { todo: '鍵を受け取りました', go: g('toSeasons', '1年後へ ▶') };
    case 'result': return { todo: '1年後のわが家を見てみましょう', go: g('toYear', '16の区画を見る ▶') };
    case 'year': return { todo: '16の区画を押して、ほかの世界を見てみましょう', go: g('toReport', 'レポートを受け取る ▶') };
    case 'report': return !s.report ? { todo: 'レポートを書いています', go: g('toEnd', 'おわりへ ▶', off('レポートを書いています')) } : s.report.failed ? { todo: 'レポートを書けませんでした', go: g('retryReport', 'もう一度書く ▶') } : { todo: 'レポートを読みましょう', go: g('toEnd', 'おわりへ ▶') };
    case 'tree': return { todo: '枝先の家を押して、世界線をたどりましょう', go: g('treeBack', 'もとの画面へ ▶') };
    case 'end': return { todo: 'おつかれさまでした', go: g('restart', 'タイトルへ ▶') };
    default: return null;
  }
}

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
// 切り絵（paper.html）に渡す家の状態：エンジンの世界から、屋根・外壁の色・外構・家族と担当者
export function paperState(s, o = {}) {
  const w = s.player, f = w.finish || {};
  const wall = Y.FINISH.wall.find(x => x.id === f.wall) || Y.FINISH.wall[0];
  const col = (wall.colors[f.color || 0] || wall.colors[0])[1];
  const roof = { flat: 'flat', cube: 'flat', gable: 'gable', hip: 'hip', mane: 'mane' }[w.spec.roof] || 'flat';
  return { roof, wall: col, roofCol: f.wall === 'galva' ? col : '#4A4F57', galva: f.wall === 'galva', eave: w.spec.roof === 'cube' ? 'none' : 'south', carport: w.spec.carport === false || s.memory?.limits?.carport === false ? 0 : Math.min(2, s.memory?.limits?.parking || 2), // アンケートの台数から
    exterior: { full: 'lawn', min: 'gravel', none: 'none' }[w.spec.exterior] || 'gravel', form: P.formOf(w), family: 4, staff: o.staff !== false, season: o.season || 'spring', timeOfDay: o.timeOfDay || 'day', cap: false };
}
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
  // 図面に入った電気の要望（契約で決めたもの・あとから足したもの）も、実現できたことに数える
  done.push(...Y.ELECTRIC.options.filter(x => s.player.electric.includes(x.id)).map(x => x.label));
  return `<h3>実現できたこと</h3>${done.length ? `<ul>${done.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : `<p class="note">${mine.length ? '（希望の条件は、この道では届かなかった）' : '（記録された希望の条件がありません）'}</p>`}
    ${ng.length ? `<h3>守れなかった希望</h3><ul>${ng.map(c => `<li><b>${esc(c.label)}</b>　${esc(c.fix)}</li>`).join('')}</ul>` : ''}`;
}

// ゾーニング図：部屋の塊を、階ごとに帯に詰めて描く（大きさは畳の段階に比例。描画はコード）
export function zoningSVG(plan, { stack = false } = {}) {
  const W = 470, H = 330, gap = 40;
  if (!plan) return `<svg viewBox="0 0 ${W * 2 + gap} ${H + 40}" class="zsvg">${[0, 1].map(f => `<rect x="${f * (W + gap)}" y="30" width="${W}" height="${H}" rx="8" fill="#F4F1EA" stroke="rgba(30,43,54,.15)"/>${[0, 1, 2].map(r => `<rect x="${f * (W + gap) + 14}" y="${50 + r * 100}" width="${W - 28}" height="80" rx="6" fill="#ECE7DD" class="pulse"/>`).join('')}`).join('')}</svg>`;
  // 玄関と階段は、面積の割り増しに入っている分を図にだけ描く（面積は二重に数えない）
  const floors = [1, 2].map(f => [...plan.rooms.filter(r => r.floor === f), ...(f === 1 ? [{ name: '玄関', size: 3, near: [] }, { name: '階段', size: 2, near: [] }] : plan.rooms.some(r => r.floor === 2) ? [{ name: '階段・ホール', size: 3, near: [] }] : [])]);
  const maxA = Math.max(...floors.map(rs => rs.reduce((a, r) => a + r.size, 0)), 1);
  let g = '';
  // 印刷では1階と2階を縦に並べる（stack）
  const wrap = (t, fi) => stack && fi ? `<g transform="translate(${-(W + gap)},${H + 50})">${t}</g>` : t;
  floors.forEach((rs, fi) => {
    let gf = '';
    const x0 = fi * (W + gap), area = rs.reduce((a, r) => a + r.size, 0);
    const fw = W * Math.sqrt(area / maxA), fh = H * Math.sqrt(area / maxA);
    gf += `<text x="${x0}" y="20" font-size="18" font-weight="700" fill="#1E2B36">${fi + 1}階</text>`;
    if (!rs.length) { gf += `<text x="${x0 + 20}" y="80" font-size="16" fill="#6B6358">（二階なし）</text>`; g += wrap(gf, fi); return; }
    gf += `<rect x="${x0}" y="30" width="${fw}" height="${fh}" rx="6" fill="#fff" stroke="#1E2B36" stroke-width="2"/>`;
    const rows = Math.max(1, Math.round(Math.sqrt(rs.length / 1.6)));
    const per = Math.ceil(rs.length / rows);
    for (let r = 0; r < rows; r++) {
      const row = rs.slice(r * per, (r + 1) * per); if (!row.length) continue;
      const ra = row.reduce((a, x) => a + x.size, 0), rh = fh * (ra / area);
      const y = 30 + rs.slice(0, r * per).reduce((a, x) => a + x.size, 0) / area * fh;
      let x = x0;
      row.forEach(room => { const w = fw * (room.size / ra); const wet = /浴|洗面|トイレ/.test(room.name), ldk = /LDK|リビング/.test(room.name);
        gf += `<rect x="${x + 2}" y="${y + 2}" width="${w - 4}" height="${rh - 4}" rx="4" fill="${ldk ? '#FDEBDD' : wet ? '#DDEFFA' : '#F4F1EA'}" stroke="rgba(30,43,54,.45)"/>`;
        // 部屋の名前が枠からはみ出さないよう、長い名前は略称にし、字の大きさを枠の幅と文字数から決める（FLOW_v3 の7）
        const nm = String(room.name).replace('ウォークインクローゼット', 'WIC').replace(/ファミリー(クローゼット|収納)/, '家族収納').replace('洗面・脱衣', '洗面'); const fH = Math.min(20, (w - 8) / Math.max(1, nm.length), rh / 2.4), fV = Math.min(20, w - 8, (rh - 10) / Math.max(1, nm.length));
        if (fV > fH * 1.2 && fV >= 11) { const ch = [...nm], y0 = y + rh / 2 - (ch.length - 1) * fV / 2; // 細長い部屋は縦書き
          gf += `<text text-anchor="middle" font-size="${fV.toFixed(1)}" fill="#1E2B36">${ch.map((c, i) => `<tspan x="${x + w / 2}" y="${(y0 + i * fV + fV / 3).toFixed(1)}">${esc(c)}</tspan>`).join('')}</text>`;
        } else { const fsz = Math.max(10, fH); gf += `<text x="${x + w / 2}" y="${y + rh / 2 + fsz / 3}" text-anchor="middle" font-size="${fsz.toFixed(1)}" fill="#1E2B36">${esc(nm)}</text>`; }
        x += w; });
    }
  g += wrap(gf, fi);
  });
  return `<svg viewBox="0 0 ${stack ? W : W * 2 + gap} ${stack ? H * 2 + 90 : H + 40}" class="zsvg">${g}</svg>`;
}

// ---- 世界線を覗くビュー（人間の案 IMPL_REVIEW_2 の12）と、世界線を移るときの飛行（WORLD_SWITCH の5）----
// 空へ飛び上がり、光る世界線の根元を抜けて、別の区画へ降りる（約3.6秒）。覗くだけで、操作の対象は自分の世界のまま
export const PEEK = { on: false, mode: 'peek', from: 6, to: 0, no: null, t0: 0, raf: 0, done: null };
const EST = (() => { const Lz = 96, gap = 18, W4 = 4 * (Lz + gap), Pp = (x, y, z = 0) => [(x - y) * Math.cos(Math.PI / 6), (x + y) * 0.5 - z]; const minX = Pp(0, W4)[0] - 40, maxX = Pp(W4, 0)[0] + 40, minY = -120, maxY = Pp(W4, W4)[1] + 30; return { Lz, gap, Pp, minX, minY, w: maxX - minX, h: maxY - minY, c: i => { const r = Math.floor(i / 4), c = i % 4; return Pp(c * (Lz + gap) + Lz / 2, r * (Lz + gap) + Lz / 2, 30); } }; })();
function peekList(s) {
  const all = [s.player, ...s.others];
  if (s.player.bits.length === 4) return all.map(w => ({ w: { ...w, no: dno(s, w) }, stage: w.unbuilt ? 0 : 4, ghost: 0, note: '' })).sort((a, b) => a.w.no - b.w.no);
  return Array.from({ length: 16 }, (_, i) => { const w = all[i % all.length]; return { w: { ...w, no: i + 1 }, stage: w ? stageOf(stepOf(w, s.step)) : 0, ghost: 0, note: '' }; });
}
export function peekHTML(s) {
  if (!PEEK.on) return '';
  const CW = 1920, CH = Math.round(CW * EST.h / EST.w);
  const lines = Array.from({ length: 16 }, (_, i) => { const c = EST.c(i); return `<line x1="${c[0].toFixed(1)}" y1="${c[1].toFixed(1)}" x2="${c[0].toFixed(1)}" y2="${(c[1] - 420).toFixed(1)}" stroke="url(#pkg)" stroke-width="${i === PEEK.to ? 7 : 3}"/>`; }).join('');
  let panel = '';
  if (PEEK.mode === 'peek') {
    const all = [s.player, ...s.others], w = all.find(x => dno(s, x) === PEEK.no) || s.player, o = Y.outcome(w), me = Y.outcome(s.player), pd = Y.scheduleOf(s.player), at = [pd[1], pd[2], pd[4], pd[5]];
    const div = o.bits.findIndex((b, i) => b !== me.bits[i]);
    panel = `<div class="pk-panel"><div class="pk-house">${P.bigHouse({ ...w, no: PEEK.no }, w.unbuilt ? 0 : 4, w.unbuilt ? {} : { fin: P.finOf(w) })}</div>
      <div class="pk-info"><div class="pk-k">別の世界線を覗いています（操作は、あなたの世界のまま）</div><h3><span class="no2">${pad(PEEK.no)}</span>${P.coTag(o.company, 26)}${esc(Y.worldName(o))}</h3>
        <ol class="pk-tl">${o.labels.map((l, i) => `<li class="${i === div ? 'dv' : ''}"><b>${Y.FORKS[i]}</b><span>${esc(l)}</span><em>${at[i]}日目${i === div ? '　ここで、あなたと分かれた' : ''}</em></li>`).join('')}</ol>
        <dl class="facts"><dt>総額</dt><dd>${o.unbuilt ? '—' : man(o.total) + '万円（あなたと ' + (Math.round(o.total) - Math.round(me.total) > 0 ? '+' : '') + man(Math.round(o.total) - Math.round(me.total)) + '）'}</dd><dt>冬の朝</dt><dd>${o.unbuilt ? '—' : o.warmth.label}</dd><dt>家計のゆとり</dt><dd>${o.unbuilt ? '—' : o.slack.label}</dd></dl>
        <div class="pk-ev"><b>この1年の出来事</b><ul>${(o.events.length ? o.events : ['大きな出来事はなかった']).slice(0, 4).map(e => `<li>${esc(e)}</li>`).join('')}</ul></div></div></div>`;
  }
  return `<div class="peek ${PEEK.mode}" id="peek"><div class="pk-sky" id="pkSky"></div><div class="pk-stage" id="pkStage" style="width:${CW}px;height:${CH}px">${P.estate2(peekList(s), { hi: PEEK.mode === 'peek' ? [PEEK.no] : [] })}<svg class="pk-lines" id="pkLines" viewBox="${EST.minX} ${EST.minY} ${EST.w} ${EST.h}"><defs><linearGradient id="pkg" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#FFFFFF" stop-opacity=".95"/><stop offset="1" stop-color="#CFE9F7" stop-opacity="0"/></linearGradient></defs>${lines}</svg></div>${panel}</div>`;
}
const easeIO = x => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
export function peekAnim() {
  const st = document.getElementById('pkStage'); if (!PEEK.on || !st) return;
  cancelAnimationFrame(PEEK.raf);
  const CW = 1920, CH = Math.round(CW * EST.h / EST.w), VW = 1920, VH = 992;
  const pt = i => { const c = EST.c(i); return [(c[0] - EST.minX) / EST.w * CW, (c[1] - EST.minY) / EST.h * CH]; };
  const A = pt(PEEK.from), B = pt(PEEK.to), M = [CW / 2, CH / 2];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches, DURF = reduce ? 0.01 : 3.6;
  const sky = document.getElementById('pkSky'), ln = document.getElementById('pkLines'), pk = document.getElementById('peek');
  const tick = () => {
    const t = Math.min(DURF, (performance.now() - PEEK.t0) / 1000), u = t / DURF;
    let c, s;
    if (u < 0.22) { const k = easeIO(u / 0.22); c = [A[0] + (M[0] - A[0]) * k, A[1] + (M[1] - A[1]) * k]; s = 2.6 + (1 - 2.6) * k; }
    else if (u < 0.45) { const k = easeIO((u - 0.22) / 0.23); c = [M[0], M[1] - 160 * k]; s = 1 - 0.45 * k; }
    else if (u < 0.8) { const k = easeIO((u - 0.45) / 0.35); c = [M[0] + (B[0] - M[0]) * k, M[1] - 160 + (B[1] - M[1] + 160) * k]; s = 0.55 + (2.6 - 0.55) * k; }
    else { c = B; s = 2.6; }
    st.style.transform = `translate(${(VW / 2 - c[0] * s).toFixed(1)}px,${(VH / 2 - c[1] * s).toFixed(1)}px) scale(${s.toFixed(3)})`;
    const up = u < 0.22 ? 0 : u < 0.45 ? (u - 0.22) / 0.23 : u < 0.8 ? 1 - (u - 0.45) / 0.35 : 0;
    if (sky) sky.style.opacity = up.toFixed(2); if (ln) ln.style.opacity = Math.min(1, up * 1.4).toFixed(2);
    if (u >= 0.82 && pk && !pk.classList.contains('land')) pk.classList.add('land');
    if (t < DURF) PEEK.raf = requestAnimationFrame(tick); else if (PEEK.done) { const f = PEEK.done; PEEK.done = null; f(); }
  };
  tick();
}
