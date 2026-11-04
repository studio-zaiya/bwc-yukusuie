/* ゆくすいえ　プレイ本体（素のJavaScript・ESモジュール）
 * 出来事の記録（イベント）を基本にする：操作もClaudeの応答も1件のイベントとして積み、状態はイベントから組み立てる。
 * 再生（?replay=記録ID）は、同じイベントを順に当て直すだけ。Claudeは呼ばない。 */
import * as Y from './engine/engine.js';
import * as P from './parts.js';
import { SCENES } from './scenes.js';

const Q = new URLSearchParams(location.search);
export const REC = Q.has('rec');
if (REC) document.body.classList.add('rec');
const stage = document.getElementById('stage');
const fit = () => stage.style.setProperty('--k', Math.min(innerWidth / 1920, innerHeight / 1080));
addEventListener('resize', fit); fit();

// ---- 状態 ----
export function initialState() {
  return {
    scene: 'start', step: 0, household: 't2', seed: 7, playId: null,
    entry: { text: '', photos: [] }, firstCo: 'C', survey: null,
    chat: [], heard: [], missed: [], honne: [], hearingTurns: 0,
    pair: ['C', 'A'], player: null, others: [], newest: [],
    forkNo: 0, pendingTrade: null, band: null, calls: [],
    aiLeft: { }, pop: null, myai: null, report: null, staff16: null,
    lot: null, savedId: null, toast: null,
  };
}
export let S = initialState();
export const LOG = [];
let replaying = false;

// ---- イベントを当てる（純粋に状態だけを変える）----
const D = s => Y.decisions(s.pair);
export function apply(s, e) {
  switch (e.type) {
    case 'start': Object.assign(s, initialState(), { scene: 'family', seed: e.seed, playId: e.playId }); break;
    case 'scene': if (s.scene !== e.scene || s.step !== e.step) s.band = null; s.scene = e.scene; if (e.step != null) s.step = e.step; s.pop = null; s.newest = e.scene === 'fork' || e.scene === 'coord' ? s.newest : []; break;
    case 'household': s.household = e.id; break;
    case 'pair': s.pair = e.pair; break;
    case 'entry': s.entry = { text: e.text, photos: e.photos || [] }; break;
    case 'firstCo': s.firstCo = e.co; s.pair = [e.co, e.co === 'A' ? 'C' : 'A']; break;
    case 'survey': s.survey = e.answers; s.chat.push({ who: 'sys', text: `${Y.COMPANIES[s.firstCo].name}の来場者アンケートを書いた` }); break;
    case 'say': { const { type, at, ...m } = e; s.chat.push(m); break; }
    case 'ai': {
      s.calls.push(e.call);
      if (e.role === 'hearing') {
        s.chat.push({ who: 'staff', co: e.co, text: e.data.line, afterForgot: e.flag === 'forgot' || undefined, afterElectric: e.flag === 'electric' || undefined });
        if (e.data.honne) s.honne.push({ co: e.co, text: e.data.honne, step: s.step });
        s.heard.push(...(e.data.heard || []).map(h => ({ ...h, co: e.co })));
        s.missed.push(...(e.data.missed || []).map(h => ({ ...h, co: e.co })));
        s.hearingTurns++;
      }
      if (e.role === 'myai') { s.myai = { q: e.q, scene: e.scene, ...e.data }; s.aiLeft[s.scene] = 0; }
      if (e.role === 'report') s.report = e.data;
      if (e.role === 'entry') { s.entryRead = e.data; s.heard.push(...(e.data.elements || []).map(x => ({ tag: x.tag, who: 'ふたり', text: x.text, from: x.from }))); }
      if (e.role === 'staff16') s.staff16 = e.data;
      if (e.role === 'trade') {
        s.pendingTrade = { decisionId: e.data.decisionId, text: e.text, ...e.data };
        s.band = bandOf(e.data);
        s.chat.push({ who: 'staff', co: s.player.company, text: e.data.message, cond: e.data.result.conditions, verdict: e.data.result.verdict });
      }
      break;
    }
    case 'world': s.player = Y.newWorld({ household: Y.HOUSEHOLDS[s.household], seed: s.seed, company: s.pair[0] }); s.others = []; break;
    case 'fork': {
      const d = D(s).find(x => x.id === e.decisionId);
      const before = new Set(s.others.map(w => w.bits.join('')));
      const opt = e.proposal || e.side;
      const r = Y.branchAll(s.player, s.others, d, opt, { reason: e.reason, priority: e.priority });
      s.player = r.player; s.others = r.others;
      s.newest = s.others.filter(w => !before.has(w.bits.join(''))).map(w => w.bits.join(''));
      s.forkNo = d.no + 1; s.pendingTrade = null;
      if (!e.proposal) s.band = null;
      s.chat.push({ who: 'sys', text: `${Y.FORKS[d.no]}：${s.player.labels.at(-1)}` });
      break;
    }
    case 'cancelTrade': s.pendingTrade = null; s.band = null; s.chat.push({ who: 'sys', text: 'この条件では進めないことにした' }); break;
    case 'finish': Object.assign(s.player.finish, e.finish); break;
    case 'electric': s.player.electric = [...new Set([...s.player.electric, ...e.ids])]; break;
    case 'pop': s.pop = e.pop; break;
    case 'lot': s.lot = e.no; break;
    case 'saved': s.savedId = e.id; break;
  }
  return s;
}

// いま起きたこと（帯）：実際の呼び出しの記録から作る
function bandOf(t) {
  const call = t.call || {}, r = t.result;
  const tc = call.toolCalls || [];
  const fallback = !!call.fallback;
  const sp = t.proposal;
  const words = [];
  if (sp.spec?.window === 'triple') words.push('南の大開口をトリプルガラスに');
  if (sp.spec?.kitchen === true) words.push('造作キッチンを入れる');
  if (sp.spec?.kitchen === false) words.push('造作キッチンはやめる');
  if (sp.spec?.exterior) words.push({ full: '外構を予定どおりに', min: '外構は最小限に', none: '外構はなし' }[sp.spec.exterior]);
  if (sp.spec?.roof) words.push(sp.spec.roof === 'gable' ? '勾配屋根に' : '箱型の屋根に');
  (sp.electric || []).forEach(id => words.push(Y.ELECTRIC.options.find(o => o.id === id)?.label));
  words.push(sp.borrow === 'cover' ? '増額の分は借入で' : '借入は増やさない');
  return {
    by: fallback ? '代わりの処理' : 'Claude', model: call.servedModel || call.model, prompt: call.promptVersion, ms: call.ms,
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
  render();
  if (['fork', 'ai'].includes(type) && !replaying) autosave();
  return e;
}
let saveTimer = null;
function autosave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      const r = await fetch('/api/log', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: S.savedId, events: LOG.map(e => e.type === 'entry' ? { ...e, photos: [] } : e) }) });
      const j = await r.json(); if (j.id && j.id !== S.savedId) { LOG.push({ type: 'saved', id: j.id, at: Date.now() }); S.savedId = j.id; }
    } catch { /* 保存に失敗してもプレイは続ける */ }
  }, 600);
}

// ---- API ----
export async function api(path, body) {
  const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.message || j.error || r.status);
  return j;
}

// ---- 描画 ----
export function render() {
  const fn = SCENES[S.scene] || SCENES.start;
  const view = document.getElementById('view');
  const keep = view.querySelector('[data-keep]');
  const draft = keep ? { id: keep.id, v: keep.value } : null;
  view.innerHTML = fn(S) + popHTML() + (S.toast ? `<div class="toast">${S.toast}</div>` : '') + (replaying ? `<div class="replaybar">記録の再生中（実際のプレイの記録。Claudeは呼んでいません）</div>` : '');
  if (draft) { const el = document.getElementById(draft.id); if (el && !el.value) el.value = draft.v; }
  const log = view.querySelector('.chat .log'); if (log) log.scrollTop = log.scrollHeight;
  if (SCENES[S.scene + '_after']) SCENES[S.scene + '_after'](S);
}

// ポップアップ（SNS・自分のAI）
import { snsHTML, myaiHTML, worldHTML } from './scenes.js';
function popHTML() {
  if (!S.pop) return '';
  return `<div class="veil" data-act="closePop"></div>${S.pop === 'sns' ? snsHTML(S) : S.pop === 'world' ? worldHTML(S) : myaiHTML(S)}`;
}

// ---- 操作の受け口（data-act）----
import { ACTIONS } from './actions.js';
stage.addEventListener('click', e => {
  if (replaying) return;
  const b = e.target.closest('[data-act]'); if (!b) return;
  const fn = ACTIONS[b.dataset.act]; if (fn) { e.preventDefault(); fn(b.dataset, b); }
});
stage.addEventListener('keydown', e => {
  if (replaying) return;
  const t = e.target;
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && t.matches('[data-enter]')) { e.preventDefault(); const fn = ACTIONS[t.dataset.enter]; if (fn) fn(t.dataset, t); }
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && t.closest('.sv')) { e.preventDefault(); ACTIONS.submitSurvey(); }
});

// ---- 再生 ----
async function replay(id) {
  const r = await fetch(`/api/log/${id}`); if (!r.ok) { S.toast = '記録が見つかりませんでした'; render(); return; }
  const data = await r.json();
  replaying = true; S = initialState(); render();
  const evs = data.events.filter(e => e.type !== 'saved');
  const speed = +(Q.get('speed') || 1);
  for (let i = 0; i < evs.length; i++) {
    const gap = i ? Math.min(4000, Math.max(500, (evs[i].at - evs[i - 1].at))) / speed : 800;
    await new Promise(res => setTimeout(res, gap));
    LOG.push(evs[i]); apply(S, evs[i]); render();
  }
  replaying = false; render();
}

window.YUKU = { get state() { return S; }, LOG, emit, Y };
if (Q.get('replay')) replay(Q.get('replay')); else render();
