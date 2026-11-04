/* ゆくすいえ　プレイ本体（素のJavaScript・ESモジュール）
 * 出来事の記録（イベント）を基本にする：操作もClaudeの応答も1件のイベントとして積み、状態はイベントから組み立てる。
 * 再生（?replay=記録ID）は、同じイベントを順に当て直すだけ。Claudeは呼ばない。 */
import * as Y from './engine/engine.js';
import { SCENES, snsHTML, myaiHTML, worldHTML, flyersHTML, phoneHTML, showHTML, setWho, setNames, MODE } from './scenes.js';
import { ACTIONS } from './actions.js';
import { tourAfterRender, tourHTML } from './tour.js';
import { addNotes, syncHeard, wishesOf } from './memory.js';

const Q = new URLSearchParams(location.search);
export const REC = Q.has('rec');
if (REC) document.body.classList.add('rec');
const stage = document.getElementById('stage');
const fit = () => stage.style.setProperty('--k', Math.min(innerWidth / 1920, innerHeight / 1080));
addEventListener('resize', fit); fit();

// ---- 状態 ----
export function initialState() {
  return {
    scene: 'start', step: 0, household: 't2', seed: 7, playId: null, howto: 0, names: { a: 'あなた', b: 'パートナー' }, mode: 'solo', wishes: [],
    entry: { text: '', photos: [] }, entryRead: null, sources: [], visit: [], cur: null, survey: null,
    chat: [], heard: [], missed: [], honne: [], turns: {},
    pair: ['C', 'A'], player: null, others: [], newest: [],
    forkNo: 0, pendingSide: null, pendingTrade: null, band: null, calls: [], failed: null,
    aiLeft: {}, pop: null, myai: null, report: null, staff16: null, tab: null,
    lot: null, savedId: null, toast: null, buildAuto: false, rtab: 'home', plan: null, planRound: 0,
    memory: null, sv: { i: 0, who: 'p1', p1: {}, p2: {}, last: null }, partnerAns: null, meet: {},
  };
}
export let S = initialState();
export const LOG = [];
export const RT = { replaying: false };

// プレイヤーの家の番号は、最初から最後まで07に固定する。ほかの世界線は、プレイヤーを除いた番号
export const YOU = 7;
export function displayNo(s, w) {
  if (!w || w.bits.length < 4 || !s.player || s.player.bits.length < 4) return null;
  const pn = Y.worldNo(s.player.bits), n = Y.worldNo(w.bits);
  return n === pn ? YOU : n === YOU ? pn : n;
}

// ---- イベントを当てる（純粋に状態だけを変える）----
const D = s => Y.decisions(s.pair);
const isMock = call => !!call && /mock/.test(call.reason || '');
export function apply(s, e) {
  switch (e.type) {
    case 'start': Object.assign(s, initialState(), { scene: 'howto', seed: e.seed, playId: e.playId }); break;
    case 'scene': if (s.scene !== e.scene || s.step !== e.step) s.band = null; s.scene = e.scene; if (e.step != null) s.step = e.step; s.pop = null; s.failed = null; s.newest = e.scene === 'fork' || e.scene === 'coord' ? s.newest : []; break;
    case 'howto': s.howto = e.page; break;
    case 'names': s.names = { a: e.a || 'あなた', b: e.b || 'パートナー' }; break;
    case 'mode': s.mode = e.mode; break;
    case 'entry': s.entry = { text: e.text, photos: e.photos || [] }; break;
    case 'source': if (!s.sources.includes(e.id)) s.sources.push(e.id); break;
    case 'visit': s.visit = e.cos; s.pair = [...e.cos]; break;
    case 'pair': s.pair = [...e.pair]; break;
    case 'cur': s.cur = e.co; s.tab = e.co; break;
    case 'tab': s.tab = e.co; break;
    case 'survey': s.survey = e.answers; s.chat.push({ who: 'sys', ch: s.cur, text: `${Y.COMPANIES[s.cur].name}の来場者アンケートを書いた` }); break;
    case 'say': { const { type, at, ...m } = e; s.chat.push(m); break; }
    case 'fail': s.failed = { role: e.role, ch: e.ch }; s.calls.push(e.call); break;
    case 'ai': {
      s.calls.push(e.call);
      s.failed = null;
      const mock = isMock(e.call);
      if (e.role === 'hearing') {
        s.chat.push({ who: 'staff', co: e.co, ch: e.ch || e.co, text: e.data.line, mock, flag: e.flag, choices: e.data.choices || [] });
        for (const w of e.data.wishes || []) { const i = s.wishes.findIndex(x => x.kind === w.kind && w.kind !== 'priority'); if (i >= 0) s.wishes[i] = w; else s.wishes.push(w); }
        if (e.data.honne) s.honne.push({ co: e.co, text: e.data.honne, step: s.step });
        s.heard.push(...(e.data.heard || []).map(h => ({ ...h, co: e.co })));
        s.missed.push(...(e.data.missed || []).map(h => ({ ...h, co: e.co })));
        s.turns[e.ch || e.co] = (s.turns[e.ch || e.co] || 0) + 1;
      }
      if (e.role === 'rep') {
        s.chat.push({ who: 'staff', co: e.co, ch: e.ch || e.co, text: e.data.line, mock, flag: e.flag, stock: !!e.data.stock });
        if (s.memory && e.phase !== 'confirm') { addNotes(s.memory, e.co, e.data.notes || [], e.phase === 'summary' ? 'summary' : 'followUp'); for (const d of e.data.deferred || []) if (!s.memory.deferred.some(x => x.text === d)) s.memory.deferred.push({ text: d, by: e.co, line: 'メモしておきます' }); if (e.phase === 'summary') s.memory.summaryByCompany[e.co] = e.data.say; syncHeard(s); }
        s.turns[e.ch || e.co] = (s.turns[e.ch || e.co] || 0) + 1;
      }
      if (e.role === 'partnerSurvey') s.partnerAns = Object.fromEntries((e.data.answers || []).map(a => [a.q, a.choices]));
      if (e.role === 'myai') { s.myai = { q: e.q, scene: e.scene, mock, ...e.data }; s.aiLeft[s.scene] = 0; }
      if (e.role === 'report') s.report = { ...e.data, mock };
      if (e.role === 'partner') { s.chat.push({ who: 'yuu', ch: e.ch, text: e.data.line, ai: true }); if (s.memory && e.co) { addNotes(s.memory, e.co, (e.data.wishes || []).map(x => x.text), 'partner', 'p2'); syncHeard(s); } else s.heard.push(...(e.data.wishes || []).map(x => ({ tag: x.tag, who: 'ゆう', text: x.text, co: e.co, keep: true }))); }
      if (e.role === 'entry') { s.entryRead = e.data; if (s.memory && s.cur) { addNotes(s.memory, s.cur, (e.data.elements || []).map(x => x.text), 'show'); syncHeard(s); } else s.heard.push(...(e.data.elements || []).map(x => ({ tag: x.tag, who: 'ふたり', text: x.text, from: x.from, keep: true }))); }
      if (e.role === 'staff16') s.staff16 = e.data;
      if (e.role === 'trade') {
        s.pendingTrade = { decisionId: e.data.decisionId, text: e.text, ...e.data };
        s.band = bandOf(e.data);
        s.chat.push({ who: 'staff', co: s.player.company, ch: s.player.company, text: e.data.message, cond: e.data.result.conditions, verdict: e.data.result.verdict, mock: !!e.call?.fallback });
      }
      break;
    }
    case 'world': s.player = Y.newWorld({ household: Y.HOUSEHOLDS[s.household], seed: s.seed, company: s.pair[0] }); s.others = []; break;
    case 'pendingSide': s.pendingSide = e.side; s.pendingLabel = e.label || null; break;
    case 'fork': {
      const d = D(s).find(x => x.id === e.decisionId);
      const before = new Set(s.others.map(w => w.bits.join('')));
      const opt = e.proposal || e.side;
      const r = Y.branchAll(s.player, s.others, d, opt, { reason: e.reason, priority: e.priority });
      s.player = r.player; s.others = r.others;
      s.newest = s.others.filter(w => !before.has(w.bits.join(''))).map(w => w.bits.join(''));
      s.forkNo = d.no + 1; s.pendingTrade = null; s.pendingSide = null;
      if (!e.proposal || e.proposal.plain) s.band = null;
      s.chat.push({ who: 'sys', ch: s.player.company, text: `${Y.FORKS[d.no]}：${s.player.labels.at(-1)}` });
      break;
    }
    case 'cancelTrade': s.pendingTrade = null; s.band = null; s.chat.push({ who: 'sys', ch: s.player.company, text: 'この条件では進めないことにした' }); break;
    case 'finish': Object.assign(s.player.finish, e.finish); break;
    // v2：来場者アンケートと、要望の全体の記憶（HEARING_v2.md）
    case 'svAns': s.sv[e.who][e.q] = e.ids; s.sv.last = { q: e.q, who: e.who }; break;
    case 'svGo': s.sv.i = e.i; s.sv.who = e.who || 'p1'; break;
    case 'mem': s.memory = structuredClone(e.memory); syncHeard(s); for (const w of wishesOf(s.memory)) { const i = s.wishes.findIndex(x => x.kind === w.kind); if (i >= 0) s.wishes[i] = w; else s.wishes.push(w); } break;
    case 'meet': s.meet[e.co] = { ...(s.meet[e.co] || {}), ...e.data }; break;
    case 'electric': s.elecFresh = e.contract ? [] : e.ids; s.player.electric = [...new Set([...s.player.electric, ...e.ids])]; s.player.adds.push(...(e.adj || [])); if (e.contract) s.player.contractOpts = [...new Set([...(s.player.contractOpts || []), ...e.ids])]; break;
    case 'pop': s.pop = e.pop; break;
    case 'lot': s.lot = e.no; break;
    case 'buildAuto': s.buildAuto = true; break;
    case 'planGot': s.plan = { ...e.data, view: null }; s.planRound = (s.planRound || 0) + (e.round ? 1 : 0); s.chat.push({ who: 'staff', co: s.player.company, ch: 'plan', text: e.data.intro, mock: !!e.data.fallback }); if (e.call) s.calls.push(e.call); break;
    case 'planView': if (s.plan) s.plan.view = e.i < 0 ? null : e.i; break;
    case 'planConfirm': { const P0 = s.plan; const chosen = P0.view != null ? P0.options[P0.view].plan : P0.main; const altO = P0.view != null ? { plan: P0.main } : P0.options[P0.altIndex]; Y.applyPlan(s.player, { ...chosen, alt: altO ? altO.plan : null }); s.player.spec.kitchen = !!chosen.kitchen; s.chat.push({ who: 'sys', ch: s.player.company, text: `間取りの骨組みを確定した：${chosen.title}` }); break; }
    case 'rtab': s.rtab = e.k; break;
    case 'tree': s.treeFrom = s.scene; s.treeFrom2 = s.step; s.treeSel = e.no || s.treeSel || 7; s.scene = 'tree'; s.pop = null; break;
    case 'treeSel': s.treeSel = e.no; break;
    case 'saved': s.savedId = e.id; break;
  }
  return s;
}

// いま起きたこと（帯）：実際の呼び出しの記録から作る
function bandOf(t) {
  const call = t.call || {}, r = t.result;
  const tc = call.toolCalls || [];
  const sp = t.proposal;
  const words = [];
  if (sp.spec?.window === 'triple') words.push('南の大開口をトリプルガラスに');
  if (sp.spec?.kitchen === true) words.push('造作キッチンを入れる');
  if (sp.spec?.kitchen === false) words.push('造作キッチンはやめる');
  if (sp.spec?.exterior) words.push({ full: '外構を予定どおりに', min: '外構は最小限に', none: '外構はなし' }[sp.spec.exterior]);
  if (sp.spec?.roof) words.push(`${Y.ROOF_JA[sp.spec.roof]}に`);
  (sp.electric || []).forEach(id => words.push(Y.ELECTRIC.options.find(o => o.id === id)?.label));
  words.push(sp.borrow === 'cover' ? '増額の分は借入で' : '借入は増やさない');
  return {
    by: call.fallback ? '代わりの処理' : 'Claude', model: call.servedModel || call.model, ms: call.ms,
    reading: words.filter(Boolean).join('／'),
    tools: tc.filter(x => x.name !== 'submit').map(x => x.name),
    quote: r.quote.diff, ratio: r.loan.ratio, days: r.schedule.addDays, verdict: r.verdict,
  };
}

// ---- 出来事を起こす（記録して、当てて、描く）----
export function emit(type, payload = {}) {
  const e = { type, ...payload, at: Date.now() };
  LOG.push(e);
  apply(S, e);
  // 担当者の質問に合わせて、話す人を切り替える（手で戻すこともできる）
  if (type === 'ai' && e.role === 'hearing' && S.mode === 'duo') { const t = e.data.line || ''; if (new RegExp(`奥様|奥さま|${S.names.b}さん`).test(t)) setWho('yuu'); else if (new RegExp(`ご主人|旦那|${S.names.a}さん`).test(t)) setWho('kazu'); }
  render();
  if (['fork', 'ai'].includes(type) && !RT.replaying) autosave();
  return e;
}
let saveTimer = null;
// 記録の書き込み用の秘密（出来事の記録には入れない。再生する人には渡らない）
const LOGKEY = { v: null };
function autosave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      const r = await fetch('/api/log', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: S.savedId, key: LOGKEY.v, events: LOG.map(e => e.type === 'entry' ? { ...e, photos: [] } : e) }) });
      const j = await r.json(); if (j.key) LOGKEY.v = j.key; if (j.id && j.id !== S.savedId) { LOG.push({ type: 'saved', id: j.id, at: Date.now() }); S.savedId = j.id; try { localStorage.setItem('yuku-last', j.id); } catch { } }
    } catch { /* 保存に失敗してもプレイは続ける */ }
  }, 600);
}

// ---- API ----
export async function api(path, body) {
  const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(path.startsWith('/api/ai/') ? { ...body, playId: S.playId } : body) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.message || j.error || r.status);
  return j;
}

// ---- 描画 ----
export function render() {
  setNames(S.names); MODE.solo = S.mode === 'solo';
  const fn = SCENES[S.scene] || SCENES.start;
  const view = document.getElementById('view');
  const keep = [...view.querySelectorAll('[data-keep]')].map(el => ({ id: el.id, v: el.value }));
  view.innerHTML = fn(S) + popHTML() + (S.toast ? `<div class="toast">${S.toast}</div>` : '') + (RT.replaying ? `<div class="replaybar">実際のプレイの記録を再生しています</div>` : '') + (REC || RT.replaying || S.scene === 'start' ? '' : `<button class="help" data-act="help" title="操作の案内">？</button>`) + tourHTML(S);
  for (const k of keep) { const el = document.getElementById(k.id); if (el && !el.value) el.value = k.v; }
  view.querySelectorAll('.chat .log, .el-right .log').forEach(log => { log.scrollTop = log.scrollHeight; });
  countUp(view);
  if (SCENES[S.scene + '_after']) SCENES[S.scene + '_after'](S);
  if (!REC && !RT.replaying) tourAfterRender(S);
}
// お金の札：前の表示から新しい値まで、数え上がる（動画の書き出しと再生では動かさない）
const MONEY_PREV = [];
function countUp(view) {
  view.querySelectorAll('.moneyc .v').forEach((el, i) => {
    const node = el.firstChild; if (!node || node.nodeType !== 3) return;
    const to = Number(node.nodeValue.replace(/[^0-9.]/g, '')), from = MONEY_PREV[i];
    MONEY_PREV[i] = to;
    if (REC || RT.replaying || from == null || !isFinite(to) || from === to || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t0 = performance.now(), dur = 900;
    el.classList.add('counting');
    const step = now => { const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3); node.nodeValue = Math.round(from + (to - from) * e).toLocaleString('ja-JP'); if (k < 1) requestAnimationFrame(step); else el.classList.remove('counting'); };
    requestAnimationFrame(step);
  });
}
function popHTML() {
  if (!S.pop) return '';
  return `<div class="veil" data-act="closePop"></div>${S.pop === 'sns' ? snsHTML(S) : S.pop === 'world' ? worldHTML(S) : S.pop === 'flyers' ? flyersHTML(S) : S.pop === 'phone' ? phoneHTML(S) : S.pop === 'show' ? showHTML(S) : myaiHTML(S)}`;
}

// ---- 操作の受け口（data-act）----
stage.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  if (RT.replaying) return;
  const fn = ACTIONS[b.dataset.act]; if (fn) { e.preventDefault(); fn(b.dataset, b); }
});
stage.addEventListener('keydown', e => {
  if (RT.replaying) return;
  const t = e.target;
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && t.matches('[data-enter]')) { e.preventDefault(); const fn = ACTIONS[t.dataset.enter]; if (fn) fn(t.dataset, t); }
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && t.closest('.sv')) { e.preventDefault(); ACTIONS.submitSurvey(); }
});

// ---- 再生 ----
async function replay(id) {
  const r = await fetch(`/api/log/${id}`); if (!r.ok) { S.toast = '記録が見つかりませんでした'; render(); return; }
  const data = await r.json();
  RT.replaying = true; S = initialState(); render();
  const evs = data.events.filter(e => e.type !== 'saved');
  const speed = +(Q.get('speed') || 1);
  for (let i = 0; i < evs.length; i++) {
    const gap = i ? Math.min(4000, Math.max(500, (evs[i].at - evs[i - 1].at))) / speed : 800;
    await new Promise(res => setTimeout(res, gap));
    LOG.push(evs[i]); apply(S, evs[i]); render();
  }
  RT.replaying = false; render();
}

window.YUKU = { get state() { return S; }, LOG, emit, Y };
if (Q.get('replay')) replay(Q.get('replay')); else render();
