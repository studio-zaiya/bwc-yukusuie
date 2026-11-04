/* ゆくすいえ　操作（ボタン・入力）→ 出来事。Claudeを呼ぶものは、応答もイベントとして積む */
import * as Y from './engine/engine.js';
import { S, emit, api, render } from './main.js';
import { busy, setWho, getWho } from './scenes.js';
import { setFace } from './parts.js';

const val = id => (document.getElementById(id)?.value || '').trim();
const clear = id => { const el = document.getElementById(id); if (el) el.value = ''; };
function toast(t) { S.toast = t; render(); setTimeout(() => { S.toast = null; render(); }, 2600); }
async function withBusy(fn) {
  if (busy.on) return; busy.on = true; render(); setFace(document.getElementById('face'), 'think');
  try { await fn(); } catch (e) { toast(String(e.message || e)); } finally { busy.on = false; render(); }
}
// 担当者の顔：応答中は「考え中」、文字が届いたら「話す」→「笑顔」→「待機」（CSSクラスの切り替えだけ）
function faceTalk() { const f = document.getElementById('face'); setFace(f, 'talk'); setTimeout(() => { const g = document.getElementById('face'); setFace(g, 'smile'); setTimeout(() => setFace(document.getElementById('face'), 'idle'), 1400); }, 1600); }

const sceneOfStep = { 2: 'plans' };
function goto(scene, step) { emit('scene', { scene, step }); }

export const ACTIONS = {
  async start() {
    let playId = null;
    try { const r = await api('/api/play/start', {}); playId = r.playId; } catch (e) { toast(String(e.message)); return; }
    emit('start', { seed: 7, playId });
  },
  household(d) { emit('household', { id: d.id }); },
  toEntry() { goto('entry', 0); },
  toLot() { emit('entry', { text: val('entryText'), photos: S.entry.photos }); goto('lot', 0); },
  firstCo(d) { emit('firstCo', { co: d.co }); },
  toSurvey() { goto('survey', 1); },
  submitSurvey() {
    const a = { fam: val('sv_fam'), now: val('sv_now'), budget: val('sv_budget'), when: val('sv_when'), kazu: val('sv_kazu'), yuu: val('sv_yuu'), worry: val('sv_worry') };
    emit('survey', { answers: a });
    const co = S.firstCo, staff = { A: '本日はご来場ありがとうございます。アンケート、拝見しました。ご主人は、どんな家がいいですか。', B: 'アンケートありがとうございます！まずは、ご主人のこだわりから聞かせてください！', C: '……ありがとうございます。まず、今の暮らしで困っていることから、伺ってもいいですか。', D: 'おう、ありがとね。で、ご主人は？どんな家にしたいの。' }[co];
    goto('hearing', 1);
    emit('say', { who: 'staff', co, text: staff });
  },
  who(d) { setWho(d.w); render(); },
  async send() {
    const text = val('say'); if (!text) return; clear('say');
    const who = getWho(), co = S.firstCo;
    emit('say', { who, text });
    await withBusy(async () => {
      const r = await api('/api/ai/hearing', { company: co, scene: `初回打ち合わせ（ヒアリング）。アンケート：${JSON.stringify(S.survey || {})}。施主が最初に書いた思い：${S.entry.text || 'なし'}。ご主人（かず）と奥様（ゆう）の両方に、順に聞く。`, history: S.chat.filter(m => m.who !== 'sys').map(m => ({ who: m.who === 'staff' ? '担当者' : m.who === 'yuu' ? 'ゆう' : 'かず', text: m.text })), text: `${who === 'yuu' ? 'ゆう' : 'かず'}：${text}`, fallbackLine: S.hearingTurns === 0 ? 'なるほど。奥様は、いかがですか。' : 'ありがとうございます。いまのお話、プランに反映できるか確認しますね。' });
      emit('ai', { role: 'hearing', co, data: r.data, call: r.call });
      faceTalk();
    });
  },
  toForgot() { goto('forgot', 1); },
  async sendForgot() {
    const text = val('say'); if (!text) return; clear('say');
    emit('say', { who: 'kazu', text, forgot: true });
    await withBusy(async () => {
      const r = await api('/api/ai/hearing', { company: S.firstCo, scene: '帰宅後、施主から担当者へのメッセージ（伝え忘れたこと）への返信。メッセージアプリの短い返事。', history: [], text, fallbackLine: 'ご連絡ありがとうございます。プランに反映して、お持ちしますね。' });
      emit('ai', { role: 'hearing', co: S.firstCo, data: r.data, call: r.call, flag: 'forgot' });
    });
  },
  toPlans() { goto('plans', 2); },
  pickCo(d) {
    if (S.pair.includes(d.co)) return;
    emit('pair', { pair: [S.pair[1] === S.firstCo ? S.pair[1] : S.pair[0], d.co] });
  },
  toFork1() { emit('world', {}); goto('fork', 2); },
  fork(d) {
    const dec = Y.decisions(S.pair)[S.forkNo];
    emit('fork', { decisionId: dec.id, side: d.side });
    afterFork(dec);
  },
  async freeAnswer() {
    const text = val('say'); if (!text) return; clear('say');
    const dec = Y.decisions(S.pair)[S.forkNo];
    emit('say', { who: getWho(), text });
    await withBusy(async () => {
      const r = await api('/api/ai/trade', { world: S.player, pair: S.pair, decisionId: dec.id, text });
      emit('ai', { role: 'trade', text, data: r, call: r.call });
      faceTalk();
    });
  },
  approve() {
    const t = S.pendingTrade; if (!t) return;
    const dec = Y.decisions(S.pair).find(x => x.id === t.decisionId);
    emit('fork', { decisionId: dec.id, proposal: t.proposal, reason: t.reason, priority: t.priority });
    afterFork(dec);
  },
  cancelTrade() { emit('cancelTrade', {}); },
  toFork4() { goto('fork', 6); },
  finish(d) { emit('finish', { finish: { [d.k]: d.k === 'color' ? +d.v : d.v, ...(d.k === 'wall' ? { color: 0 } : {}) } }); },
  toElectric() { goto('electric', 6); },
  async sendElectric() {
    const text = val('say'); if (!text) return; clear('say');
    emit('say', { who: getWho(), text, electric: true });
    // 指摘を電気の項目に読み替える（コード）。契約に入っていないものは増工として加える
    const ids = [];
    if (/テレビ|壁掛け/.test(text)) ids.push('tv_wall');
    if (/LAN|有線|ネット/.test(text)) ids.push('lan_bed');
    if (/外.*コンセント|防水|庭/.test(text)) ids.push('outlet_out');
    if (/充電|EV|電気自動車/.test(text)) ids.push('ev');
    const fresh = ids.filter(id => !S.player.electric.includes(id));
    await withBusy(async () => {
      const opts = Y.ELECTRIC.options.filter(o => fresh.includes(o.id));
      const r = await api('/api/ai/hearing', { company: S.player.company, scene: `契約後の電気の打ち合わせ。施主の指摘に返事をする。${opts.length ? `指摘された「${opts.map(o => o.label).join('、')}」は契約に入っていないので、追加になることを、すまなそうに伝える（金額は言わない）。` : '指摘が電気の項目に当たらなければ、確認すると伝える。'}`, history: [], text, fallbackLine: opts.length ? 'すみません。そちらは、契約には入っていないんです。追加で承りますね。' : '確認して、次回お返事しますね。' });
      emit('ai', { role: 'hearing', co: S.player.company, data: r.data, call: r.call, flag: 'electric' });
      if (fresh.length) emit('electric', { ids: fresh });
    });
  },
  toBuild() { goto('build', 7); },
  buildNext() { goto('build', Math.min(10, S.step + 1)); },
  toHandover() { goto('handover', 10); },
  async toYear() {
    goto('year', 11);
    if (!S.staff16) {
      const worlds = S.others.map(w => { const o = Y.outcome(w); return { no: o.no, company: o.company, labels: o.labels, events: o.events }; });
      try { const r = await api('/api/ai/staff16', { worlds }); emit('ai', { role: 'staff16', data: { lines: r.lines }, call: { role: 'staff16', calls: r.calls.length, models: [...new Set(r.calls.map(c => c.servedModel || c.model))], fallback: r.calls.every(c => c.fallback) } }); } catch { /* 一言がなくても進める */ }
    }
  },
  lot(d) { emit('lot', { no: +d.no }); },
  toHonne() { goto('honne', 11); },
  async toReport() {
    goto('report', 11);
    if (S.report) return;
    const o = Y.outcome(S.player);
    try {
      const words = S.chat.filter(m => m.who === 'kazu' || m.who === 'yuu').map(m => ({ who: m.who === 'yuu' ? 'ゆう' : 'かず', text: m.text }));
      const r = await api('/api/ai/report', { memory: S.player.memory, labels: S.player.labels, words, entry: S.entry.text, events: o.events, warmth: o.warmth.label, slack: o.slack.label });
      emit('ai', { role: 'report', data: r.data, call: r.call });
    } catch (e) { toast(String(e.message)); }
  },
  print() { try { localStorage.setItem('yuku-report', JSON.stringify({ report: S.report, player: S.player, others: S.others, heard: S.heard, missed: S.missed, chat: S.chat, staff16: S.staff16, savedId: S.savedId })); } catch { } open('/report.html', '_blank'); },
  restart() { location.href = location.pathname; },
  openPop(d) { emit('pop', { pop: d.pop }); },
  closePop() { emit('pop', { pop: null }); },
  async askAI() {
    const q = val('aiq'); if (!q) return;
    const scene = S.scene;
    await withBusy(async () => {
      const r = await api('/api/ai/myai', { question: q, context: `${Y.STEPS[S.step]}。${S.player ? `会社：${Y.COMPANIES[S.player.company].name}。選んだ道：${S.player.labels.join('、') || 'まだ'}` : ''}` });
      emit('ai', { role: 'myai', q, scene, data: r.data, call: r.call });
    });
  },
};

function afterFork(dec) {
  if (dec.id === 'D1') { goto('fork', 3); }
  else if (dec.id === 'D2') { goto('fork', 5); }
  else if (dec.id === 'D3') { goto('contract', 5); }
  else if (dec.id === 'D4') { goto('coord', 6); }
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
  const imgs = [...files].filter(f => f.type.startsWith('image/')).slice(0, 4 - S.entry.photos.length);
  for (const f of imgs) S.entry.photos.push(await shrink(f));
  render();
}
let bound = false;
export function bindDrop() {
  const el = document.getElementById('drop'); if (!el) return;
  el.addEventListener('dragover', e => { e.preventDefault(); el.classList.add('on'); });
  el.addEventListener('dragleave', () => el.classList.remove('on'));
  el.addEventListener('drop', e => { e.preventDefault(); el.classList.remove('on'); addFiles(e.dataTransfer.files); });
  if (!bound) { bound = true; addEventListener('paste', e => { if (S.scene === 'entry' && e.clipboardData?.files?.length) addFiles(e.clipboardData.files); }); }
}
