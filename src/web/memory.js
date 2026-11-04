// 要望の全体の記憶（docs/HEARING_v2.md の4、data/content/requirement_memory.json の shape）
// アンケートの答え → 要望1件ずつ（出どころ・だれの・会社ごとに伝わったか）。見積・提案・担当者・電気・レポートは、すべてここを読む。
// Claudeが書けるのは要望の言葉（notes）だけで、値（engine）はアンケートの選択肢から。
import * as Y from './engine/engine.js';

// 問いごとの、付箋の言い出し（選択肢の言葉につなぐ）【Claude】
const LEAD = { cars: '車は', carport: 'カーポートは', outside: '外に', ldk_size: 'LDKは', kitchen: 'キッチンは', dining: 'ダイニングは', tv: 'テレビは', ldk_feel: 'LDKに', entry: '帰宅の動線に', laundry: '洗濯物は', bath: '洗面と脱衣所は', storage: '収納に', kids: '子ども部屋は', bedroom: '寝室は', work: '在宅の仕事は', extra: 'あるとうれしい：', style: '外観は', roof: '屋根は', warm: '冬の暖かさは', budget_total: '総額は', budget_month: '月々は' };
// 問いごとの話題（担当者の「聞き漏らしやすい話題」oftenMiss と同じ言葉）【Claude】
export const QCAT = { cars: '外構', carport: '外構', outside: '外構', ldk_size: '部屋数と広さ', kitchen: '家事の動線', dining: '家事の動線', tv: '電気とネット', ldk_feel: 'デザイン', entry: '家事の動線', laundry: '家事の動線', bath: '家事の動線', storage: '収納の量', kids: '将来の部屋の使い方', bedroom: '部屋数と広さ', work: '電気とネット', extra: '親族の意向', style: 'デザインの好み', roof: 'デザインの好み', warm: '窓と断熱', budget_total: '予算の上限の伝え方', budget_month: '予算の上限の伝え方' };
export const SRC_LABEL = { survey: 'アンケート', summary: '総括', followUp: '打ち合わせ', message: 'メッセージ', partner: 'パートナー', show: '写真' };
const WHO_IN = { p1: 'かず', p2: 'ゆう', both: 'ふたり' }; // 内部の識別（1人目・2人目）。画面では入力された呼び名に置き換える

const norm = t => String(t || '').normalize('NFKC').replace(/[、。・\s「」（）()：:]/g, '');
const hash = s => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) % 1000; };
const asArr = v => (Array.isArray(v) ? v : v ? [v] : []).filter(x => x && x !== 'none');

export function emptyMemory() { return { survey: {}, items: [], limits: {}, summaryByCompany: {}, deferred: [], messages: [], seq: 0 }; }

// アンケートの答え（p1・p2）から、記憶を作る
export function buildMemory(survey, p1 = {}, p2 = {}) {
  const m = emptyMemory();
  for (const q of survey.questions) {
    const a = asArr(p1[q.id]), b = asArr(p2[q.id]);
    const same = a.length === b.length && a.every(x => b.includes(x));
    m.survey[q.id] = { p1: p1[q.id] ?? null, p2: p2[q.id] ?? null, differs: !!(a.length && b.length && !same) };
    const ids = [...new Set([...a, ...b])];
    for (const id of ids) {
      const c = q.choices.find(x => x.id === id); if (!c) continue;
      const who = a.includes(id) && b.includes(id) ? 'both' : a.includes(id) ? 'p1' : 'p2';
      addItem(m, { text: `${LEAD[q.id] || ''}${c.label}`.replace('外に庭で', '庭で'), area: q.section, q: q.id, who, source: 'survey', priority: q.id === 'warm' && id === 'top' || q.id.startsWith('budget') ? 'must' : 'want', engine: c.engine || null });
    }
    // 希望の上限（予算の2問）：ふたりで違えば、低いほうを上限にする
    for (const id of [...a, ...b]) { const c = q.choices.find(x => x.id === id); if (c?.engine) for (const [k, v] of Object.entries(c.engine)) { if (typeof v === 'number' && k in m.limits && /budget|monthly/.test(k)) m.limits[k] = Math.min(m.limits[k], v); else if (!(k in m.limits)) m.limits[k] = v; } }
    if (q.id === 'warm' && ids.length) m.limits.warmPriority = ids.includes('top') ? 'top' : ids.includes('mid') ? 'mid' : 'low';
  }
  return m;
}
// 同じ意味の要望は1件にまとめ、言い直しは出どころを足すだけ（付箋の重複をなくす）
export function addItem(m, it) {
  const n = norm(it.text);
  const same = m.items.find(x => norm(x.text) === n || (n.length >= 4 && (norm(x.text).includes(n) || n.includes(norm(x.text)))));
  if (same) { if (!same.sources.includes(it.source)) same.sources.push(it.source); if (it.co) same.deliveredTo[it.co] = it.delivered || 'told'; if (same.who !== it.who && it.who) same.who = 'both'; return same; }
  const x = { id: `req-${String(++m.seq).padStart(3, '0')}`, text: String(it.text).slice(0, 30), area: it.area || '', q: it.q || null, who: it.who || 'both', source: it.source, sources: [it.source], priority: it.priority || 'want', engine: it.engine || null, deliveredTo: {} };
  if (it.co) x.deliveredTo[it.co] = it.delivered || 'told';
  m.items.push(x); return x;
}
// その会社に、何が伝わったか：聞き漏らしやすい話題（rep_harness の oftenMiss）の要望は、種によって伝わらないことがある
export function deliver(m, co, oftenMiss = [], seed = 7) {
  for (const x of m.items) {
    if (x.deliveredTo[co]) continue;
    const cat = x.q ? QCAT[x.q] : '';
    x.deliveredTo[co] = cat && oftenMiss.includes(cat) && hash(`${seed}-${x.id}-${co}`) < 500 ? 'missed' : 'told';
  }
  return m;
}
// 担当者の返事の notes（要望の言葉）を記憶に入れる
export function addNotes(m, co, notes = [], source = 'followUp', who = 'both') { for (const t of notes) if (t && !/^[ぁ-ん]{0,3}$/.test(t)) addItem(m, { text: t, who, source, co }); return m; }

// 両立が難しそうな組み合わせ（コードの判定）。総括で1つだけ「検討してみます」と言わせる
export function conflictsOf(m) {
  const L = m.limits, s = q => [...asArr(m.survey[q]?.p1), ...asArr(m.survey[q]?.p2)];
  const out = [];
  if ((L.ldkJo || 0) >= 24 && (L.budgetTotalMan || 99999) <= 5000) out.push('二十四帖以上のLDKと、総額の上限');
  if (L.warmPriority === 'top' && (L.budgetTotalMan || 99999) <= 4500) out.push('冬の暖かさと、総額の上限');
  if (s('work').includes('room') && s('kids').includes('two') && (L.budgetTotalMan || 99999) <= 5000) out.push('仕事の個室と、最初から二部屋の子ども部屋');
  if (s('ldk_feel').includes('fukinuke') && L.warmPriority === 'top') out.push('吹き抜けと、冬の暖かさ');
  if ((L.parking || 0) >= 3 && s('outside').includes('garden')) out.push('車三台と、庭で遊べる芝生');
  return out;
}
// 話しかける順の材料
export const differsOf = (survey, m) => survey.questions.filter(q => m.survey[q.id]?.differs);
export function sectionsNoPref(survey, m) {
  return survey.sections.filter(sec => { const qs = survey.questions.filter(q => q.section === sec.id); const n = qs.filter(q => !asArr(m.survey[q.id]?.p1).length && !asArr(m.survey[q.id]?.p2).length).length; return n >= Math.ceil(qs.length / 2); }).map(s => s.label);
}
// 希望の上限（エンジンへ）。予算の2問はそのまま
export function wishesOf(m) {
  const w = [];
  if (m.limits.budgetTotalMan) w.push({ kind: 'totalMax', value: m.limits.budgetTotalMan, text: `総額${m.limits.budgetTotalMan.toLocaleString()}万円くらいまで` });
  if (m.limits.monthlyMan) w.push({ kind: 'monthlyMax', value: m.limits.monthlyMan, text: `月々${m.limits.monthlyMan}万円くらいまで` });
  if (m.limits.warmPriority === 'top') w.push({ kind: 'priority', value: null, text: '冬の暖かさがいちばん' });
  return w;
}
// 担当者のプロンプトに渡す要約（その会社に伝わったものだけ。伝わらなかったものは、担当者は知らない）
export function memoryText(survey, m, co, names = {}) {
  const A = names.a || 'あなた', B = names.b || 'パートナー', W = { p1: A, p2: B, both: 'ふたり' };
  const told = m.items.filter(x => !co || x.deliveredTo[co] === 'told' || x.deliveredTo[co] === 'deferred');
  // 担当者は数字を言わない決まりなので、要約にも数を書かない（数はアンケートの値として、計算の側だけが持つ）
  const say = x => /[0-9０-９]/.test(x.text) ? ({ cars: '車を停めたい（台数はアンケートのとおり）', ldk_size: 'LDKの広さの希望あり', bedroom: '寝室の広さの希望あり', budget_total: '総額の上限を決めている', budget_month: '月々の返済の上限を決めている' }[x.q] || x.text.replace(/[0-9０-９,，.]+/g, '')) : x.text;
  const lines = [`- 要望（${told.length}件）：${told.map(x => `${say(x)}（${W[x.who]}・${SRC_LABEL[x.source]}）`).join('／')}`];
  const dq = differsOf(survey, m); if (dq.length) lines.push(`- ふたりの意見が違う問い：${dq.map(q => q.text.replace(/（.*?）/g, '')).join('／')}`);
  const np = sectionsNoPref(survey, m); if (np.length) lines.push(`- 「こだわらない」が多い段：${np.join('、')}`);
  const cf = conflictsOf(m); if (cf.length) lines.push(`- 両立が難しそうな組み合わせ（計算の判定）：${cf.join('／')}`);
  const df = m.deferred.filter(d => !co || d.by === co); if (df.length) lines.push(`- 預かったこと：${df.map(d => d.text).join('／')}`);
  const ms = m.messages.filter(x => !co || x.to === co); if (ms.length) lines.push(`- 帰り道に届いたメッセージ：${ms.map(x => x.text).join('／')}`);
  return lines.join('\n');
}
// 画面の付箋・担当者が記録した要望（s.heard）と、聞き漏らし（s.missed）を、記憶から作り直す
export function syncHeard(s) {
  const m = s.memory; if (!m) return;
  const keep = (s.heard || []).filter(h => h.keep);
  s.heard = [...keep, ...m.items.flatMap(x => Object.entries(x.deliveredTo).filter(([, v]) => v === 'told').map(([co]) => ({ tag: x.text, who: WHO_IN[x.who], text: x.text, co, src: x.source, id: x.id })))];
  s.missed = m.items.flatMap(x => Object.entries(x.deliveredTo).filter(([, v]) => v === 'missed').map(([co]) => ({ tag: x.text, who: WHO_IN[x.who], said: x.text, co, source: x.source, reason: SRC_LABEL[x.source] })));
}
export const itemsForBoard = m => (m?.items || []);
export { WHO_IN };

// 担当者の差し込み枠の値（docs/REP_TRAINING_NEXT.md の1）：その場面のエンジンの状態から、文字列で。値がないものは入れない（枠を使えば作り直し）
const man = n => Math.round(Number(n)).toLocaleString('ja-JP');
export function slotValuesOf(s, co) {
  const w = s.player && (!co || s.player.company === co) ? s.player : Y.newWorld({ household: Y.HOUSEHOLDS[s.household] || Y.HOUSEHOLDS.t2, company: co || s.cur || 'C' });
  const m = Y.money(w), pay = Y.payment(m.loan, Y.RATE.variable), v = {};
  v.総額 = `${man(m.total)}万円`;
  if (m.building) v.本体 = `${man(m.building)}万円`;
  const tw = (s.wishes || []).find(x => x.kind === 'totalMax'), mw = (s.wishes || []).find(x => x.kind === 'monthlyMax');
  if (tw && m.total - tw.value > 0) v.希望との差 = `${man(m.total - tw.value)}万円`;
  v.月々 = `約${pay.toFixed(1)}万円`;
  if (mw && pay - mw.value > 0.05) v.月々の希望との差 = `約${(pay - mw.value).toFixed(1)}万円`;
  v.延床 = `${w.spec.tsubo}坪`;
  const sc = Y.scheduleOf(w); if (sc && sc[10] != null) { const now = sc[Math.min(s.step || 0, 10)] || 0; if (sc[10] - now > 0) v.引渡しまでの日数 = `約${sc[10] - now}日`; }
  if (m.add > 0) v.追加の額 = `${man(m.add)}万円`;
  return v;
}
