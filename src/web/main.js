/* ゆくすいえ　プレイ本体（素のJavaScript・ESモジュール）
 * 出来事の記録（イベント）を基本にする：操作もClaudeの応答も1件のイベントとして積み、状態はイベントから組み立てる。
 * 再生（?replay=記録ID）は、同じイベントを順に当て直すだけ。Claudeは呼ばない。 */
import * as Y from './engine/engine.js';
import { SCENES, snsHTML, myaiHTML, worldHTML, setWho } from './scenes.js';
import { ACTIONS } from './actions.js';
import { tourAfterRender, tourHTML } from './tour.js';

const Q = new URLSearchParams(location.search);
export const REC = Q.has('rec');
if (REC) document.body.classList.add('rec');
const stage = document.getElementById('stage');
const fit = () => stage.style.setProperty('--k', Math.min(innerWidth / 1920, innerHeight / 1080));
addEventListener('resize', fit); fit();

// ---- 状態 ----
export function initialState() {
  return {
    scene: 'start', step: 0, household: 't2', seed: 7, playId: null, howto: 0,
    entry: { text: '', photos: [] }, entryRead: null, sources: [], visit: [], cur: null, survey: null,
    chat: [], heard: [], missed: [], honne: [], turns: {},
    pair: ['C', 'A'], player: null, others: [], newest: [],
    forkNo: 0, pendingSide: null, pendingTrade: null, band: null, calls: [], failed: null,
    aiLeft: {}, pop: null, myai: null, report: null, staff16: null, tab: null,
    lot: null, savedId: null, toast: null,
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
        s.chat.push({ who: 'staff', co: e.co, ch: e.ch || e.co, text: e.data.line, mock, flag: e.flag });
        if (e.data.honne) s.honne.push({ co: e.co, text: e.data.honne, step: s.step });
        s.heard.push(...(e.data.heard || []).map(h => ({ ...h, co: e.co })));
        s.missed.push(...(e.data.missed || []).map(h => ({ ...h, co: e.co })));
        s.turns[e.ch || e.co] = (s.turns[e.ch || e.co] || 0) + 1;
      }
      if (e.role === 'myai') { s.myai = { q: e.q, scene: e.scene, mock, ...e.data }; s.aiLeft[s.scene] = 0; }
      if (e.role === 'report') s.report = { ...e.data, mock };
      if (e.role === 'entry') { s.entryRead = e.data; s.heard.push(...(e.data.elements || []).map(x => ({ tag: x.tag, who: 'ふたり', text: x.text, from: x.from }))); }
      if (e.role === 'staff16') s.staff16 = e.data;
      if (e.role === 'trade') {
        s.pendingTrade = { decisionId: e.data.decisionId, text: e.text, ...e.data };
        s.band = bandOf(e.data);
        s.chat.push({ who: 'staff', co: s.player.company, ch: s.player.company, text: e.data.message, cond: e.data.result.conditions, verdict: e.data.result.verdict, mock: !!e.call?.fallback });
      }
      break;
    }
    case 'world': s.player = Y.newWorld({ household: Y.HOUSEHOLDS[s.household], seed: s.seed, company: s.pair[0] }); s.others = []; break;
    case 'pendingSide': s.pendingSide = e.side; break;
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
    case 'electric': s.player.electric = [...new Set([...s.player.electric, ...e.ids])]; s.player.adds.push(...(e.adj || [])); break;
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
  if (type === 'ai' && e.role === 'hearing') { const t = e.data.line || ''; if (/奥様|ゆうさん|奥さま/.test(t)) setWho('yuu'); else if (/ご主人|かずさん|旦那/.test(t)) setWho('kazu'); }
  render();
  if (['fork', 'ai'].includes(type) && !RT.replaying) autosave();
  return e;
}
let saveTimer = null;
function autosave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      const r = await fetch('/api/log', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: S.savedId, events: LOG.map(e => e.type === 'entry' ? { ...e, photos: [] } : e) }) });
      const j = await r.json(); if (j.id && j.id !== S.savedId) { LOG.push({ type: 'saved', id: j.id, at: Date.now() }); S.savedId = j.id; try { localStorage.setItem('yuku-last', j.id); } catch { } }
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
  const keep = [...view.querySelectorAll('[data-keep]')].map(el => ({ id: el.id, v: el.value }));
  view.innerHTML = fn(S) + popHTML() + (S.toast ? `<div class="toast">${S.toast}</div>` : '') + (RT.replaying ? `<div class="replaybar">記録の再生中（実際のプレイの記録。Claudeは呼んでいません）</div>` : '') + (REC || RT.replaying || S.scene === 'start' ? '' : `<button class="help" data-act="help" title="操作の案内">？</button>`) + tourHTML(S);
  for (const k of keep) { const el = document.getElementById(k.id); if (el && !el.value) el.value = k.v; }
  view.querySelectorAll('.chat .log').forEach(log => { log.scrollTop = log.scrollHeight; });
  if (SCENES[S.scene + '_after']) SCENES[S.scene + '_after'](S);
  if (!REC && !RT.replaying) tourAfterRender(S);
}
function popHTML() {
  if (!S.pop) return '';
  return `<div class="veil" data-act="closePop"></div>${S.pop === 'sns' ? snsHTML(S) : S.pop === 'world' ? worldHTML(S) : myaiHTML(S)}`;
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
