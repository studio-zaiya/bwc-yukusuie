/* ゆくすいえ　操作（ボタン・入力）→ 出来事。Claudeを呼ぶものは、応答もイベントとして積む。
 * Claudeが応答できなかったときは、代わりの文で成功したように見せず、「応答できませんでした（もう一度）」を出す */
import * as Y from './engine/engine.js';
import { S, emit, api, render } from './main.js';
import { busy, setWho, getWho, persona, DATA, PHONE, SHOW, NAMES, unkept, FORK_DONE, dataReady, SV, SWITCH } from './scenes.js';
import { buildMemory, deliver, addItem, memoryText, conflictsOf, slotValuesOf } from './memory.js';
import { setFace } from './parts.js';
import { tourNext, tourSkip, tourHelp } from './tour.js';

const val = id => (document.getElementById(id)?.value || '').trim();
const clear = id => { const el = document.getElementById(id); if (el) el.value = ''; };
function toast(t) { S.toast = t; render(); setTimeout(() => { S.toast = null; render(); }, 2600); }
async function withBusy(fn) {
  if (busy.on) return; busy.on = true; render(); setFace(document.getElementById('face'), 'think');
  try { await fn(); } catch (e) { toast(String(e.message || e)); } finally { busy.on = false; render(); }
}
// 担当者の顔：応答中は「考え中」、文字が届いたら「話す」→「笑顔」→「待機」（CSSクラスの切り替えだけ）
function faceTalk() { setFace(document.getElementById('face'), 'talk'); setTimeout(() => { setFace(document.getElementById('face'), 'smile'); setTimeout(() => setFace(document.getElementById('face'), 'idle'), 1400); }, 1600); }
const goto = (scene, step) => emit('scene', { scene, step });
const isRealFail = call => call?.fallback && !/mock/.test(call.reason || '');
const words = () => S.chat.filter(m => m.who === 'kazu' || m.who === 'yuu');
const nameOf = w => w === 'yuu' ? NAMES.yuu : NAMES.kazu;
let lastSend = null; // 応答できなかったときに、もう一度送るため

// 担当者に送る（ヒアリング・返信・質問・電気で共通）
// 担当者は、場面ごとに役割を分けたハーネス（rep_harness.json）で話す。phase：summary／followUp／proposal／adjust／confirm
const PHASE_OF = { hearing: 'followUp', reply: 'followUp', forgot: 'followUp', compare: 'proposal', plan: 'proposal', contract: 'proposal', electric: 'confirm', coord: 'confirm' };
async function askStaff({ co, ch, scene, text, flag, history = true, phase }) {
  lastSend = { co, ch, scene, text, flag, history, phase };
  const ph = phase || PHASE_OF[S.scene] || 'proposal';
  await withBusy(async () => {
    const hist = history ? S.chat.filter(m => m.ch === ch && m.who !== 'sys').map(m => ({ who: m.who === 'staff' ? '担当者' : nameOf(m.who === 'partner' ? 'yuu' : m.who), text: m.text })) : [];
    const memory = S.memory && DATA.survey ? memoryText(DATA.survey, S.memory, co, S.names) : requests();
    const body = { company: co, phase: ph, history: hist, text, names: S.names, memory, extra: scene || '', slotValues: slotValuesOf(S, co) };
    let r = await api('/api/ai/rep', body);
    // 応答できなかったときは、自動で1回だけ送り直す（受け入れ基準0-5）。それでもだめなら、決まり文句で続ける（Worker側）
    if (isRealFail(r.call)) r = await api('/api/ai/rep', body);
    // 信頼の残り：値下げ・予算に合わないこだわり・実現できない要求は、会社の性格（patience）の重みで数える。段階はコードが決める
    const pr = r.data.pressure || 'none', t = S.trust[co] || { strikes: 0, stage: 0, offTopic: 0 };
    const weight = ['discount', 'overSpec', 'unreasonable'].includes(pr) ? (DATA.harness?.companies?.[co]?.patience?.[pr] ?? 1) : 0;
    const strikes = t.strikes + weight, stage = strikes >= 4 ? 3 : strikes >= 3 ? 2 : strikes >= 2 ? 1 : 0;
    const data = { ...r.data };
    if (weight && stage > t.stage) { data.line = STAGE_LINE[stage](pr); data.say = data.line; data.ask = null; data.notes = []; }
    emit('ai', { role: 'rep', co, ch, phase: ph, data, call: r.call, flag, weight, stage });
    faceTalk();
    pendingRefuse = weight && stage === 3 && t.stage < 3 ? { co, kind: pr } : null;
    // 役を壊そうとする入力が3回続いたら、打ち合わせを区切る（世界は移さない。信頼は減らさない）
    if (pr === 'offTopic' && (S.trust[co]?.offTopic || 0) >= 3 && S.scene === 'hearing') closeMeeting(co);
  });
  if (pendingRefuse) { const p = pendingRefuse; pendingRefuse = null; await refuseAndSwitch(p.co, p.kind); }
}
// 3段階の言葉（決まった文。WORLD_SWITCH.md の3）
const STAGE_LINE = {
  1: k => ({ discount: 'お気持ちはわかりますが、これ以上の値引きは難しいんです。', overSpec: 'そのご要望をすべて入れると、ご予算の中では難しいんです。', unreasonable: '申し訳ありませんが、それは私どもでは実現が難しいんです。' }[k] || 'お気持ちはわかりますが、そこは難しいんです。'),
  2: () => 'このままですと、ご期待に沿えないかもしれません。',
  3: () => '申し訳ありませんが、弊社ではご対応いたしかねます。',
};
let pendingRefuse = null;
// 断られた：ナレーションの帯 → すでにある別の世界線へ移る。第一の分岐点の前なら、もう1社と進む
async function refuseAndSwitch(co, kind) {
  await new Promise(r => setTimeout(r, 1400));
  SWITCH.on = true; SWITCH.lines = ['この世界では、話はここで終わりました。', 'そのころ、別の世界では——']; SWITCH.i = 0; render();
  await new Promise(r => setTimeout(r, 1900)); SWITCH.i = 1; render();
  await new Promise(r => setTimeout(r, 1900)); SWITCH.on = false;
  if (!S.player || !S.others.length) {
    // まだ世界が1つ：この会社とは話が終わり、第一の分岐点では、訪ねたもう1社と進む
    emit('refused', { co, kind });
    emit('say', { who: 'sys', ch: co, text: `${Y.COMPANIES[co].name}とは、ここで話が終わった` });
    if (S.scene === 'hearing' && S.visit[0] === co) await ACTIONS.toSecond();
    else if (S.scene === 'hearing') ACTIONS.toCompare();
    else render();
    return;
  }
  const to = Y.switchTarget(S.player, S.others, kind);
  if (!to) { emit('refused', { co, kind }); render(); return; }
  emit('jump', { to: to.bits.join(''), kind });
  emit('say', { who: 'sys', ch: S.player.company, text: `${Y.COMPANIES[S.player.company].name}と建てている世界で、続きから` });
  if (S.scene === 'plan') { emit('planReset', {}); await planCall(''); } else render();
}
const requests = () => [S.survey ? `アンケート：${JSON.stringify(S.survey)}` : '', S.entry.text ? `最初に書いた思い：${S.entry.text}` : '', S.entryRead?.summary ? `入口で読み取った要望：${S.entryRead.summary}` : ''].filter(Boolean).join('。');

export const ACTIONS = {
  async start() {
    let playId = null;
    try { const r = await api('/api/play/start', {}); playId = r.playId; } catch (e) { toast(String(e.message)); return; }
    emit('start', { seed: 7, playId });
  },
  // 審査員向けの短い入口：ヒアリングを終えた状態から、第一の分岐点の直前で始める（ひとりで遊ぶ）
  async continueStart() {
    let playId = null;
    try { const r = await api('/api/play/start', {}); playId = r.playId; } catch (e) { toast(String(e.message)); return; }
    await dataReady();
    emit('start', { seed: 7, playId }); emit('mode', { mode: 'solo' }); emit('names', { a: 'あなた', b: 'パートナー' });
    emit('visit', { cos: ['C', 'A'] });
    // 打ち合わせ済みの家族：来場者アンケートの答え（ふたり分）から、要望の記憶を作る【Claudeが決めた仮の答え】
    const p1 = { cars: 'c2', carport: 'yes', outside: ['shed', 'bike'], ldk_size: 'm', kitchen: 'face_open', dining: 'side', tv: 'wall', ldk_feel: ['view'], entry: ['path', 'shoes'], laundry: 'in', bath: 'sep', storage: ['pantry', 'family'], kids: 'split', bedroom: 's', work: 'corner', extra: ['none'], style: 'simple', roof: 'flat', warm: 'top', budget_total: 'b50', budget_month: 'm14' };
    const p2 = { ...p1, roof: 'gable', ldk_feel: ['tatami'], laundry: 'dryer', budget_month: 'm12' };
    for (const [q, ids] of Object.entries(p1)) emit('svAns', { q, who: 'p1', ids });
    const m = buildMemory(DATA.survey, p1, p2);
    deliver(m, 'C', DATA.harness.companies.C.oftenMiss, 7);
    // 打ち合わせで話したのに、担当者の記録に入らなかったこと（電気の打ち合わせで、伝え漏れに気づく種）
    addItem(m, { text: 'リビングのエアコンは見えないように', who: 'p2', source: 'followUp', co: 'C', delivered: 'missed' });
    deliver(m, 'A', DATA.harness.companies.A.oftenMiss, 7);
    emit('mem', { memory: m });
    for (const [co, who, text] of [['C', 'staff', 'ご記入ありがとうございます。外まわりまで目の届く、すっきりした箱の家で、冬でも暖かい暮らしがご希望なのですね。屋根の形はおふたりで好みが分かれているようなので、外観と一緒に考えましょう。'], ['C', 'yuu', 'リビングのエアコンは、見えないようにしたいです。'], ['C', 'staff', '承知しました。メモしておきますので、全体の計画の中で調整しましょう。'], ['A', 'staff', '本日はご来場ありがとうございます。いただいたアンケート、拝見しました。性能と資金計画の両方から、ご提案をお持ちします。']]) emit('say', who === 'staff' ? { who, co, ch: co, text } : { who, ch: co, text });
    emit('say', { who: 'sys', ch: 'C', text: '（ここまでの打ち合わせは、済ませてあります）' });
    emit('pair', { pair: ['C', 'A'] }); emit('world', {}); goto('fork', 2);
  },
  howtoNext() { saveNames(); if (S.howto < 3) emit('howto', { page: S.howto + 1 }); else goto('family', 0); },
  howtoSkip() { saveNames(); goto('family', 0); },
  mode(d) { saveNames(); emit('mode', { mode: d.m }); },
  toLotNoEntry() { goto('lot', 0); },
  // 担当者の質問への選択肢（押しても、自由に書いてもよい）
  choose(d) { const el = document.getElementById('say'); if (el) el.value = d.t; ACTIONS.send(); },
  openShow() { emit('pop', { pop: 'show' }); },
  async doShow() {
    const text = (document.getElementById('showText')?.value || '').trim();
    if (!text && !SHOW.photos.length) return;
    const photos = SHOW.photos.slice(0, 3);
    emit('pop', { pop: null });
    const co = S.cur;
    emit('say', { who: getWho(), ch: co, text: `（${photos.length ? `写真を${photos.length}枚` : ''}${photos.length && text ? 'と、' : ''}${text ? 'ページやメモ' : ''}を見せた）${text ? ' ' + text.slice(0, 60) : ''}` });
    SHOW.photos = []; SHOW.text = '';
    let read = null;
    await withBusy(async () => { const r = await api('/api/ai/entry', { text, photos }); if (!isRealFail(r.call)) { emit('ai', { role: 'entry', data: r.data, call: r.call }); read = r.data; } });
    // 担当者は、読み取った要素を見て受け答えする
    await askStaff({ co, ch: co, scene: `施主が、好きな家の写真やページを見せてくれた。読み取れた要素：${read ? read.elements.map(e => e.text).join('、') : 'うまく読み取れなかった'}。${read?.aside ? '家と関係ない写真もあった（' + read.aside + '）。' : ''}それを受けて、ひとこと返し、次の質問を一つする。`, text: `写真やページを見せた。${read?.summary || ''}` });
  },
  toEntry() { goto('entry', 0); },
  async toLot() {
    const text = val('entryText');
    emit('entry', { text, photos: S.entry.photos });
    goto('lot', 0);
    if (!text && !S.entry.photos.length) return;
    // ことば・写真・URLから、要望の要素を読み取る（1回だけ）。画像そのものは記録に残さない
    try { const r = await api('/api/ai/entry', { text, photos: S.entry.photos }); if (!isRealFail(r.call)) emit('ai', { role: 'entry', data: r.data, call: r.call }); } catch { /* 読み取れなくても進める */ }
  },
  toSources() { goto('sources', 0); },
  source(d) { emit('source', { id: d.id }); },
  pickVisit(d) {
    const v = S.visit.includes(d.co) ? S.visit.filter(x => x !== d.co) : [...S.visit, d.co].slice(-2);
    emit('visit', { cos: v });
  },
  // v2：来場者アンケート（1画面1問）。ひとりプレイでは、AIのパートナーも同じ問いに答える（先に答えをもらっておく）
  async toVisit() {
    if (S.visit.length !== 2) return;
    await dataReady();
    emit('cur', { co: S.visit[0] }); emit('svGo', { i: 0, who: 'p1' }); goto('survey', 1);
    if (S.mode === 'solo' && !S.partnerAns) { try { const r = await api('/api/ai/partnerSurvey', { names: S.names }); if (!isRealFail(r.call)) emit('ai', { role: 'partnerSurvey', data: r.data, call: r.call }); } catch { /* パートナーの答えがなくても進める */ } }
  },
  svPick(d) {
    const q = DATA.survey.questions[S.sv.i]; if (!q) return;
    if (q.multi) { const cur = SV.sel; if (d.id === 'none') SV.sel = ['none']; else { const x = cur.filter(v => v !== 'none'); SV.sel = x.includes(d.id) ? x.filter(v => v !== d.id) : [...x, d.id]; } render(); return; }
    SV.pressed = d.id; render();
    setTimeout(() => { SV.pressed = null; svCommit(q, [d.id]); }, 200);
  },
  svNext() { const q = DATA.survey.questions[S.sv.i]; if (!q) return; svCommit(q, SV.sel.length ? SV.sel : ['none']); },
  svBack() { SV.sel = []; if (S.sv.who === 'p2') emit('svGo', { i: S.sv.i, who: 'p1' }); else if (S.sv.i > 0) emit('svGo', { i: S.sv.i - 1, who: S.mode === 'duo' ? 'p2' : 'p1' }); },
  who(d) { setWho(d.w); render(); },
  // 追加の質問と補足（2〜4往復）。往復ごとに打ち合わせの時計が進み、残りが15分を切るか4往復で、担当者が区切る
  async send() {
    const text = val('say'); if (!text) return; clear('say');
    const who = getWho(), co = S.cur, mt = S.meet[co] || { rounds: 0, min: 15 };
    if (mt.ended) return;
    emit('say', { who, ch: co, text });
    emit('meet', { co, data: { rounds: mt.rounds + 1, min: mt.min + 10 } });
    await askStaff({ co, ch: co, phase: 'followUp', text: `${nameOf(who)}：${text}`, scene: S.visit[1] === co ? '2社目の初回打ち合わせ。アンケートの答えは1社目と同じ。' : '1社目の初回打ち合わせ。' });
    await partnerAnswers(co);
    maybeEndMeeting(co);
  },
  endMeeting() { closeMeeting(S.cur); },
  async retry() { if (lastSend) await askStaff(lastSend); },
  async toForgot() {
    goto('forgot', 1);
    emit('say', { who: 'partner', ch: 'partner', text: `${Y.COMPANIES[S.visit[0]].staff}さんとの打ち合わせ、伝え忘れたこと、あった？` });
    // ひとりプレイ：パートナーも、自分が伝え忘れたことを一つ言う（その言葉も担当者に送れる）
    if (S.mode === 'solo') await partnerSays('partner', `帰り道。${Y.COMPANIES[S.visit[0]].name}の打ち合わせのあと。担当者に伝え忘れたことを、自分の分を一つだけ言い、夫にも聞く。`, '伝え忘れたこと、ある？', true);
  },
  // 帰り道の「これだけは！」は1〜2個まで
  sayPartner() {
    const text = val('say'); if (!text) return;
    if (S.chat.filter(m => m.ch === 'partner' && m.forgot && !m.byPartner).length >= 2) { toast('送れるのは、2つまでです'); return; }
    clear('say');
    emit('say', { who: 'kazu', ch: 'partner', text, forgot: true });
    emit('say', { who: 'partner', ch: 'partner', text: `それ、${Y.COMPANIES[S.visit[0]].staff}さんに送っておこうよ。` });
  },
  async sendForgot() {
    const co = S.visit[0];
    // 担当者に送るのは、プレイヤーが話したことだけ（パートナーの相づちは送らない。攻めのレビュー11/5）
    const lines = S.chat.filter(m => m.ch === 'partner' && m.forgot && !m.byPartner).slice(-2);
    const text = lines.map(m => (m.byPartner ? NAMES.yuu + '：' : '') + m.text).join('\n');
    // 帰り道に送ったことも、要望の記憶に（出どころ：メッセージ。この会社には伝わった）
    if (S.memory) { const m = structuredClone(S.memory); for (const l of lines) { m.messages.push({ to: co, text: l.text, day: 7 }); addItem(m, { text: l.text.slice(0, 30), who: l.byPartner ? 'p2' : 'p1', source: 'message', co }); } emit('mem', { memory: m }); }
    goto('reply', 1);
    emit('say', { who: 'kazu', ch: 'msg', text });
    await new Promise(r => setTimeout(r, 1500)); // 返信は少し時間をおいて届く
    await askStaff({ co, ch: 'msg', phase: 'followUp', scene: '帰宅後、施主からメッセージアプリで届いた「伝え忘れたこと」への、翌日の返信。受け止めて、どう扱うかを短く。質問はしない。', text, flag: 'forgot', history: false });
  },
  // 2社目：同じアンケートの答えを使い回す（総括の切り口だけが会社で違う）
  async toSecond() {
    const co = S.visit[1];
    emit('cur', { co });
    if (S.memory) { const m = structuredClone(S.memory); deliver(m, co, DATA.harness.companies[co].oftenMiss, S.seed); emit('mem', { memory: m }); }
    goto('hearing', 1);
    emit('say', { who: 'sys', ch: co, text: `${Y.COMPANIES[S.visit[0]].name}で書いたアンケートを、そのまま渡した` });
    await startMeeting(co);
  },
  toCompare() { emit('tab', { co: S.visit[0] }); goto('compare', 2); },
  tab(d) { emit('tab', { co: d.co }); },
  async askCompare() {
    const text = val('say'); if (!text) return; clear('say');
    const co = S.tab;
    emit('say', { who: getWho(), ch: co, text });
    const q = Y.quote(Y.baseSpec(Y.HOUSEHOLDS[S.household]), co, false);
    await askStaff({ co, ch: co, scene: `提案と見積の説明。見積の見せ方は「${q.label}」。別途の項目：${q.lines.filter(l => !l.shown).map(l => l.label).join('、') || 'なし'}。施主の質問に答える。`, text: `${nameOf(getWho())}：${text}` });
  },
  toFork1() { emit('pair', { pair: S.visit }); emit('world', {}); goto('fork', 2); },
  // 札を押したら、パートナーが理由を聞く（任意）。理由は決断の記憶になり、レポートで使う
  pickSide(d) { const dec = Y.decisions(S.pair)[S.forkNo]; const o = dec[d.side]; emit('pendingSide', { side: d.side, label: typeof o.label === 'function' ? o.label(S.player) : o.label }); prefetchPlan(d.side); },
  unpick() { emit('pendingSide', { side: null }); },
  decideWhy() { const reason = val('say'); clear('say'); decide(S.pendingSide, reason); },
  decideNoWhy() { decide(S.pendingSide, ''); },
  async freeAnswer() {
    const text = val('say'); if (!text) return; clear('say');
    const dec = Y.decisions(S.pair)[S.forkNo];
    emit('say', { who: getWho(), ch: S.player.company, text });
    await withBusy(async () => {
      const r = await api('/api/ai/trade', { world: S.player, pair: S.pair, decisionId: dec.id, text, wishes: S.wishes });
      emit('ai', { role: 'trade', text, data: r, call: r.call });
      faceTalk();
    });
  },
  approve() {
    const t = S.pendingTrade; if (!t || t.result.verdict === 'いまは難しい') return;
    const dec = Y.decisions(S.pair).find(x => x.id === t.decisionId);
    emit('fork', { decisionId: dec.id, proposal: t.proposal, reason: t.reason, priority: t.priority });
    closeFork(dec, () => { afterFork(dec); partnerReacts(dec, t.reason); });
  },
  cancelTrade() { emit('cancelTrade', {}); },
  // 契約のあと：第四の分岐点「どう仕上げる？」を、ほかと同じ2枚の札の儀式で（人間の回答11/5）。そのあと、選んだ仕上げの中で色を決める
  toCoord() { goto('fork', 6); },
  finish(d) { emit('finish', { finish: { [d.k]: d.k === 'color' ? +d.v : d.v, ...(d.k === 'wall' ? { color: 0 } : {}) } }); },
  // 色決め：第四の分岐点で選んだ仕上げの中で、外壁の色だけを選ぶ（金額は変わらない）
  decideCoord() { goto('electric', 6); },
  elecTag(d) { const o = Y.ELECTRIC.options.find(x => x.id === d.id); const el = document.getElementById('say'); if (el && o) el.value = `${o.label}をお願いしたい`; },
  async sendElectric() {
    const text = val('say'); if (!text) return; clear('say');
    const co = S.player.company;
    emit('say', { who: getWho(), ch: 'elec', text });
    // 指摘を電気の項目に読み替える（コード）。伝えていたのに漏れていたか、一度も伝えていないかを、それまでの会話で見分ける
    const ids = Y.electricOf(text).filter(id => !S.player.electric.includes(id));
    // すでに図面に入っているもの：左の一覧を指して答える（コード）
    const inList = Y.electricOf(text).filter(id => S.player.electric.includes(id));
    if (!ids.length && inList.length) { emit('say', { who: 'staff', co, ch: 'elec', text: `${inList.map(id => Y.ELECTRIC.options.find(o => o.id === id).label).join('、')}は、図面に入っています（左の一覧）。ほかに気になるところはありますか？` }); faceTalk(); return; }
    if (!ids.length) { await askStaff({ co, ch: 'elec', scene: '契約後の電気の打ち合わせ。施主の指摘が、電気の項目に当たらない。確認して次回お返事すると、ていねいに伝える（金額は言わない）。', text, flag: 'electric', history: false }); return; }
    const memItems = S.memory?.items || [];
    const before = [...words().filter(m => m.ch !== 'elec'), { text: S.entry.text || '' }, ...memItems.map(x => ({ text: x.text }))];
    const told = ids.filter(id => before.some(m => Y.ELECTRIC_WORDS[id].test(m.text)));
    // 負担は、どの会社でも同じ決まり（人間の回答11/5）：会社が記録していた→会社の負担／書いて伝えていた→折半／口頭だけ→施主の負担
    const polOf = id => { const it = memItems.find(x => Y.ELECTRIC_WORDS[id].test(x.text)); return Y.missedPolicy(co, 0.5, { recorded: it?.deliveredTo?.[co] === 'told', written: !!it && it.sources.some(src => src === 'survey' || src === 'message') }); };
    const pols = told.map(id => [id, polOf(id)]);
    const adj = pols.map(([id, p]) => { const o = Y.ELECTRIC.options.find(x => x.id === id); return { label: `伝え漏れの扱い：${o.label}`, v: -Math.round(o.v * (1 - p.rate) * 10) / 10 }; }).filter(a => a.v);
    const rp = DATA.electrical?.replyPatterns;
    const kinds = [...new Set(pols.map(([, p]) => p.kind))];
    const pol = pols[0]?.[1] || { kind: null };
    const lines = kinds.map(k => k === 'free' ? rp?.requestedButMissed.free : k === 'half' ? rp?.requestedButMissed.half : rp?.requestedButMissed.paidNoRecord);
    if (ids.length > told.length) lines.push(rp?.notRequested.default);
    busy.on = true; render(); setFace(document.getElementById('face'), 'think');
    await new Promise(r => setTimeout(r, 900));
    busy.on = false;
    emit('say', { who: 'staff', co, ch: 'elec', text: lines.filter(Boolean).join('') || '承知しました。' });
    emit('electric', { ids, adj, told, policy: told.length ? pol.kind : null });
    // 根拠：いつ、どこで伝えていたか（アンケートに書いたのに／帰り道に送ったのに）
    const ev = told.map(id => memItems.find(x => Y.ELECTRIC_WORDS[id].test(x.text))).filter(Boolean);
    if (ev.length) emit('say', { who: 'sys', ch: 'elec', text: `根拠：${ev.map(x => `「${x.text}」は${{ survey: 'アンケートに書いていた', message: '帰り道にメッセージで送っていた', followUp: '打ち合わせで話していた', partner: '打ち合わせで話していた', summary: '打ち合わせで話していた', show: '写真で見せていた' }[x.source] || '伝えていた'}`).join('／')}` });
    faceTalk();
  },
  toBuild() { goto('build', 7); },
  // S6：着工すると、上棟・施主検査・引渡しまで自動で進み、白いフェードで引渡し式へ
  async startBuild() {
    emit('buildAuto', {});
    { const dd = Y.scheduleOf(S.player); emit('notice', { text: `土地の決済と、つなぎ融資の実行（着工金の支払い）が済みました（${dd[6] || ''}日目）。着工します。` }); }
    for (const st of [8, 9, 10]) { await new Promise(r => setTimeout(r, 1700)); goto('build', st); }
    await new Promise(r => setTimeout(r, 1400));
    goto('handover', 10);
  },
  toHandover() { goto('handover', 10); },
  // 写真を保存：引渡し式のSVGを canvas に描いて、画像として書き出す（家族の名前はニックネームだけ）
  // 写真を保存：引渡しの切り絵（同じ出どころの iframe の canvas）を、そのまま画像に書き出す
  async savePhoto() {
    const fr = document.getElementById('paper'); const cv = fr?.contentDocument?.getElementById('c'); if (!cv) return;
    const a = document.createElement('a'); a.download = 'yukusuie-hikiwatashi.png'; a.href = cv.toDataURL('image/png'); a.click();
  },
  // そして1年後……：季節が移り変わってから、1年後のわが家へ
  async toSeasons() { goto('seasons', 11); await new Promise(r => setTimeout(r, 4600)); goto('result', 11); },
  rtab(d) { emit('rtab', { k: d.k }); },
  toTree(d) { emit('tree', { no: d.no ? +d.no : null }); },
  treeSel(d) { emit('treeSel', { no: +d.no }); },
  treeBack() { goto(S.treeFrom || 'year', S.treeFrom2 ?? 11); },
  toEnd() { goto('end', 11); },
  async toYear() {
    goto('year', 11);
    if (!S.staff16) {
      const worlds = S.others.map(w => { const o = Y.outcome(w); return { no: o.no, company: o.company, labels: o.labels, events: o.events }; });
      try { const r = await api('/api/ai/staff16', { worlds }); emit('ai', { role: 'staff16', data: { lines: r.lines.filter((l, i) => !r.calls[i]?.fallback || /mock/.test(r.calls[i]?.reason || '')) }, call: { role: 'staff16', calls: r.calls.length, models: [...new Set(r.calls.map(c => c.servedModel || c.model))], fallback: r.calls.every(c => c.fallback) } }); } catch { /* 一言がなくても進める */ }
    }
  },
  lot(d) { emit('lot', { no: +d.no }); },
  toHonne() { goto('honne', 11); },
  async toReport() { goto('report', 11); if (!S.report || S.report.failed) await reportCall(); },
  retryReport() { S.report = null; render(); reportCall(); },
  print() { try { localStorage.setItem('yuku-report', JSON.stringify({ report: S.report, player: S.player, others: S.others, heard: S.heard, missed: S.missed, chat: S.chat, staff16: S.staff16, savedId: S.savedId, names: S.names, mode: S.mode })); } catch { } open('/report.html', '_blank'); },
  restart() { location.href = location.pathname; },
  openPop(d) { emit('pop', { pop: d.pop }); },
  closePop() { emit('pop', { pop: null }); },
  async askAI() {
    const q = val('aiq'); if (!q) return;
    const scene = S.scene;
    await withBusy(async () => {
      const r = await api('/api/ai/myai', { question: q, context: `${Y.STEPS[S.step]}。${S.player ? `会社：${Y.COMPANIES[S.player.company].name}。選んだ道：${S.player.labels.join('、') || 'まだ'}` : ''}` });
      if (isRealFail(r.call)) { emit('fail', { role: 'myai', ch: 'myai', call: r.call }); return; }
      emit('ai', { role: 'myai', q, scene, data: r.data, call: r.call });
    });
  },
  // スマホ連携
  async openPhone() {
    keepEntry();
    PHONE.st = null; emit('pop', { pop: 'phone' });
    const r = await fetch('/api/link/new', { method: 'POST' }); const j = await r.json().catch(() => ({}));
    if (r.status === 403) PHONE.st = { closed: true, message: j.message };
    else if (!j.ok) PHONE.st = { error: j.message || 'コードを出せませんでした。' };
    else { PHONE.st = { ...j, items: [] }; pollPhone(); }
    render();
  },
  closePhone() { clearTimeout(pollTimer); if (PHONE.st?.code) fetch(`/api/link/${PHONE.st.code}/close`, { method: 'POST' }); PHONE.st = null; emit('pop', { pop: S.scene === 'hearing' ? 'show' : null }); },
  async importPhone() {
    const code = PHONE.st?.code; if (!code) return;
    const j = await (await fetch(`/api/link/${code}/poll?full`)).json();
    const texts = (j.items || []).filter(i => i.text).map(i => i.text);
    const photos = (j.items || []).filter(i => i.photo && i.photo.startsWith('data:')).map(i => i.photo);
    const prev = document.getElementById('showText')?.value || '';
    SHOW.photos = [...SHOW.photos, ...photos].slice(0, 3);
    clearTimeout(pollTimer); if (PHONE.st?.code) fetch(`/api/link/${code}/close`, { method: 'POST' }); PHONE.st = null;
    emit('pop', { pop: 'show' });
    const t2 = document.getElementById('showText'); if (t2) t2.value = [prev, ...texts].filter(Boolean).join('\n');
  },
  // 設計担当との調整
  planView(d) { emit('planView', { i: +d.i }); },
  async planAsk() {
    const text = val('say'); if (!text || (S.planRound || 0) >= 3) return; clear('say');
    emit('say', { who: getWho(), ch: 'plan', text });
    await planCall(text);
    if ((S.planRound || 0) >= 3) emit('say', { who: 'staff', co: S.player.company, ch: 'plan', text: 'いったん持ち帰って整理しましょう。いまの案で、設計を進めさせてください。' });
  },
  planConfirm() { if (!S.plan || busy.on) return; emit('planConfirm', {}); goto('fork', 3); },
  tourNext() { tourNext(); render(); },
  tourSkip() { tourSkip(); render(); },
  help() { tourHelp(S); render(); },
};

function decide(side, reason) {
  if (!side) return;
  const dec = Y.decisions(S.pair)[S.forkNo];
  if (reason) emit('say', { who: getWho(), ch: S.player.company, text: reason });
  emit('fork', { decisionId: dec.id, side, reason, priority: '' });
  closeFork(dec, () => { afterFork(dec); partnerReacts(dec, reason); });
}
// 終わり：「第◯の分岐点：〇〇を選んだ」の帯を1.5秒出してから、通常の画面に戻る
function closeFork(dec, then) {
  FORK_DONE.on = true; FORK_DONE.text = `${Y.FORKS[dec.no]}：「${S.player.labels.at(-1)}」を選んだ`;
  render();
  setTimeout(() => { FORK_DONE.on = false; then(); }, 1500);
}
// ひとりプレイ：分岐点のあと、パートナーがひとこと（感想か心配）。決めるのはプレイヤー
async function partnerReacts(dec, reason) {
  if (S.mode !== 'solo') return;
  const ch = S.player.company;
  await partnerSays(ch, `分岐点「${dec.q}」で、夫が「${S.player.labels.at(-1)}」を選んだ。${reason ? '夫の理由：' + reason : '夫は理由を言わなかった'}。ひとことだけ、感想か心配を言う（反対しすぎない）。`, '');
}
async function partnerSays(ch, scene, ask, forgot = false) {
  try {
    const hist = S.chat.filter(m => m.ch === ch && m.who !== 'sys').slice(-6).map(m => ({ who: m.who === 'staff' ? '担当者' : nameOf(m.who === 'partner' ? 'yuu' : m.who), text: m.text }));
    const r = await api('/api/ai/partner', { names: S.names, scene, history: hist, ask });
    if (isRealFail(r.call)) return;
    S.calls.push(r.call);
    emit('say', { who: ch === 'partner' ? 'partner' : 'yuu', ai: true, ch, text: r.data.line, forgot: forgot || undefined, byPartner: true });
    for (const x of r.data.wishes || []) S.heard.push({ tag: x.tag, who: 'ゆう', text: x.text, co: S.cur });
    render();
  } catch { /* パートナーが黙っていても進める */ }
}
async function reportCall() {
  const o = Y.outcome(S.player);
  try {
    const worlds = [S.player, ...S.others].map(w => { const x = Y.outcome(w); return { no: x.no, mine: w === S.player, labels: x.labels, warmth: x.warmth.label, slack: x.slack.label, events: x.events }; });
    const hk = S.heard.filter(h => h.who === 'かず').length, hy = S.heard.filter(h => h.who === 'ゆう').length, hf = S.heard.filter(h => h.who === 'ふたり').length;
    const r = await api('/api/ai/report', { memory: S.player.memory, labels: S.player.labels, words: words().map(m => ({ who: nameOf(m.who), text: m.text })), entry: S.entry.text, events: o.events, warmth: o.warmth.label, slack: o.slack.label, worlds, unkept: unkept(S).map(c => `${c.label}（${c.fix}）`), couple: `${NAMES.kazu} ${hk}枚、${NAMES.yuu} ${hy}枚、ふたり ${hf}枚。${NAMES.kazu}の付箋：${S.heard.filter(h => h.who === 'かず').map(h => h.text).join('、') || 'なし'}。${NAMES.yuu}の付箋：${S.heard.filter(h => h.who === 'ゆう').map(h => h.text).join('、') || 'なし'}` });
    if (isRealFail(r.call)) { S.report = { failed: true }; emit('fail', { role: 'report', ch: 'report', call: r.call }); return; }
    emit('ai', { role: 'report', data: r.data, call: r.call });
  } catch (e) { S.report = { failed: true }; toast(String(e.message)); }
}
function afterFork(dec) {
  if (dec.id === 'D1') { const dd = Y.scheduleOf(S.player); emit('say', { who: 'sys', ch: S.player.company, text: `${Y.COMPANIES[S.player.company].name}に決めて、土地の売買契約を結んだ（ローン特約の期限は${Y.DEADLINE.loan}日目）` }); goto('plan', 3); emit('notice', { text: `土地の売買契約を結びました（${dd[1] || ''}日目）。住宅ローンの本審査は、ローン特約の期限（${Y.DEADLINE.loan}日目）までに通す必要があります。` }); planCall(''); }
  else if (dec.id === 'D2') goto('fork', 5);
  else if (dec.id === 'D4') goto('coord', 6);
  else if (dec.id === 'D3') {
    // 契約に入れてあるオプションは、その会社の担当者が聞き取れた（記録した）要望だけ
    const co = S.player.company;
    const inc = Y.electricOf(S.heard.filter(h => h.co === co).map(h => h.text).join(' ')).filter(id => !S.player.electric.includes(id));
    if (inc.length) emit('electric', { ids: inc, adj: [], contract: true });
    goto('contract', 5);
    const dd = Y.scheduleOf(S.player); emit('notice', { text: `住宅ローンの本審査が承認されました（${dd[4] || ''}日目）。建物の請負契約に進みます。` });
  }
}

// 入口：写真のドロップと、スクショの貼り付け。送る前に長辺1568pxまで縮小（canvasで描き直すので、撮影場所などの埋め込み情報も消える）
async function shrink(file) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 1568 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85);
}
async function addFiles(files) {
  const imgs = [...files].filter(f => f.type.startsWith('image/')).slice(0, 3 - SHOW.photos.length);
  for (const f of imgs) SHOW.photos.push(await shrink(f));
  render();
}
let bound = false;
export function bindDrop() {
  const el = document.getElementById('drop'); if (!el) return;
  el.addEventListener('dragover', e => { e.preventDefault(); el.classList.add('on'); });
  el.addEventListener('dragleave', () => el.classList.remove('on'));
  el.addEventListener('drop', e => { e.preventDefault(); el.classList.remove('on'); addFiles(e.dataTransfer.files); });
  if (!bound) { bound = true; addEventListener('paste', e => { if (S.pop === 'show' && e.clipboardData?.files?.length) addFiles(e.clipboardData.files); }); }
}

let pollTimer = null;
function keepEntry() { const ta = document.getElementById('showText'); if (ta) SHOW.text = ta.value; }
async function pollPhone() {
  clearTimeout(pollTimer);
  const code = PHONE.st?.code; if (!code || S.pop !== 'phone') return;
  try { const r = await fetch(`/api/link/${code}/poll`); const j = await r.json(); if (r.status === 410) { PHONE.st = { error: j.message }; render(); return; } if (j.ok && (j.items || []).length !== (PHONE.st.items || []).length) { PHONE.st.items = j.items; render(); } } catch { }
  pollTimer = setTimeout(pollPhone, 3000);
}

function saveNames() {
  const a = document.getElementById('nmA'), b = document.getElementById('nmB');
  if (a || b) emit('names', { a: (a?.value || '').trim() || 'あなた', b: (b?.value || '').trim() || 'パートナー' });
}
// ひとりプレイ：担当者が妻に聞いたとき、パートナー（AI）が答え、担当者がそれを受ける（1往復だけ）
async function partnerAnswers(co) {
  if (S.mode !== 'solo') return;
  const last = [...S.chat].reverse().find(m => m.ch === co && m.who === 'staff');
  if (!last || !new RegExp(`奥様|奥さま|${NAMES.yuu}さん|おふたり|お二人`).test(last.text) || !/[？?]/.test(last.text)) return;
  await withBusy(async () => {
    const hist = S.chat.filter(m => m.ch === co && m.who !== 'sys').slice(-8).map(m => ({ who: m.who === 'staff' ? '担当者' : nameOf(m.who), text: m.text }));
    const r = await api('/api/ai/partner', { names: S.names, scene: '住宅会社の初回打ち合わせ。担当者に聞かれたことに、短く答える。', history: hist, ask: last.text });
    if (isRealFail(r.call)) return;
    emit('ai', { role: 'partner', co, ch: co, data: r.data, call: r.call });
  });
}
// アンケートの1問を確定して、次の問いへ（ふたりで遊ぶときは、同じ問いに交互に答える）
function svCommit(q, ids) {
  SV.sel = [];
  const who = S.sv.who;
  emit('svAns', { q: q.id, who, ids: q.multi ? ids : ids[0] });
  const n = DATA.survey.questions.length;
  if (S.mode === 'duo' && who === 'p1') { emit('svGo', { i: S.sv.i, who: 'p2' }); return; }
  if (S.sv.i + 1 < n) emit('svGo', { i: S.sv.i + 1, who: 'p1' }); else finishSurvey();
}
// アンケートを書き終えた：記憶を作り、その会社に伝わったものを決め、担当者が総括する
async function finishSurvey() {
  const p2 = S.mode === 'duo' ? S.sv.p2 : (S.partnerAns ? Object.fromEntries(Object.entries(S.partnerAns).map(([k, v]) => { const q = DATA.survey.questions.find(x => x.id === k); return [k, q?.multi ? v : v[0]]; })) : {});
  const m = buildMemory(DATA.survey, S.sv.p1, p2);
  deliver(m, S.cur, DATA.harness.companies[S.cur].oftenMiss, S.seed);
  emit('mem', { memory: m });
  goto('hearing', 1);
  await startMeeting(S.cur);
}
async function startMeeting(co) {
  emit('meet', { co, data: { rounds: 0, min: 15, ended: false } });
  const cf = conflictsOf(S.memory);
  await askStaff({ co, ch: co, phase: 'summary', history: false, text: '（アンケートを書き終えて、担当者に渡した）', scene: `${S.visit[1] === co ? '2社目。1社目と同じアンケートの答えを受け取った。総括の切り口は、あなたの会社の個性で。' : '1社目。'}${cf.length ? `両立が難しそうな組み合わせのうち、言うのは一つだけ：${cf[0]}` : ''}` });
}
// 区切り：4往復か、残りが15分を切ったとき（2往復を終えていて担当者が区切ってよいと判断したときも）
function maybeEndMeeting(co) {
  const mt = S.meet[co]; if (!mt || mt.ended) return;
  const last = [...S.chat].reverse().find(m => m.ch === co && m.who === 'staff');
  if (mt.rounds >= 4 || mt.min >= 45) closeMeeting(co);
  else if (mt.rounds >= 2 && last && /このあたりにしましょう/.test(last.text)) emit('meet', { co, data: { ended: true } });
}
function closeMeeting(co) {
  if (S.meet[co]?.ended) return;
  emit('say', { who: 'staff', co, ch: co, text: '今日はこのあたりにしましょうか。次回までに、ラフなプランと概算をお持ちします。' });
  emit('meet', { co, data: { ended: true } });
}
function secondOpening(co) {
  const got = S.heard.slice(-3).map(h => h.text).join('、');
  const by = { A: '弊社の標準仕様で、どこまで叶うか確かめさせてください。', B: '規格プランのどれが近いか、一緒に見ていきましょう！', C: 'いくつか、詳しく伺ってもいいですか。', D: 'だいたいできますよ。気になってることから聞かせてください。' }[co];
  return `${Y.COMPANIES[S.visit[0]].name}さんと同じご要望を伺っています${got ? `（${got}など）` : ''}。${by}`;
}

// 設計担当（Opus 5.5）に、骨組みの案を頼む。数字はエンジンが出したものだけを使う
// 設計担当への依頼の中身（その世界の会社に伝わった要望と、預かったこと）
const planBody = (world, text, cur) => ({ world, wishes: S.wishes, heard: [...S.heard.filter(h => !h.co || h.co === world.company).map(h => ({ who: h.who === 'ふたり' ? 'ふたり' : nameOf(h.who === 'ゆう' ? 'yuu' : 'kazu'), text: h.text })), ...(S.memory?.deferred || []).filter(d => d.by === world.company).map(d => ({ who: '担当者が預かった', text: d.text }))], current: cur, text, round: (S.planRound || 0) + 1 });
// 第一の分岐点で札を押した時点で、その会社の間取りの依頼を先に始める（理由を書いている間に計算が進む。札を選び直したら捨てる）
const PREFETCH = { co: null, p: null };
function prefetchPlan(side) {
  const dec = Y.decisions(S.pair)[S.forkNo]; if (!dec || dec.id !== 'D1' || !S.player) return;
  const t = Y.forkWorld(S.player); Y.choose(t, dec, side);
  if (PREFETCH.co === t.company) return;
  PREFETCH.co = t.company; PREFETCH.p = api('/api/ai/planner', planBody(t, '', null)).catch(() => null);
}
async function planCall(text) {
  await withBusy(async () => {
    const cur = S.plan ? (S.plan.view != null ? S.plan.options[S.plan.view].plan : S.plan.main) : null;
    let r = null;
    if (!text && !cur && PREFETCH.p && PREFETCH.co === S.player.company) { r = await PREFETCH.p; }
    PREFETCH.co = null; PREFETCH.p = null;
    if (!r || !r.ok) r = await api('/api/ai/planner', planBody(S.player, text, cur));
    if (!r.ok) { emit('fail', { role: 'planner', ch: 'plan', call: r.call }); return; }
    emit('planGot', { data: { intro: r.intro, main: r.main, mainM: r.mainM, options: r.options, altIndex: r.altIndex, fallback: !!r.fallback }, round: !!text, call: r.call });
  });
}
