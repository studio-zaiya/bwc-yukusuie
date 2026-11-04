/* ゆくすいえ　操作（ボタン・入力）→ 出来事。Claudeを呼ぶものは、応答もイベントとして積む。
 * Claudeが応答できなかったときは、代わりの文で成功したように見せず、「応答できませんでした（もう一度）」を出す */
import * as Y from './engine/engine.js';
import { S, emit, api, render } from './main.js';
import { busy, setWho, getWho, persona, DATA, PHONE } from './scenes.js';
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
const nameOf = w => w === 'yuu' ? 'ゆう' : 'かず';
let lastSend = null; // 応答できなかったときに、もう一度送るため

// 担当者に送る（ヒアリング・返信・質問・電気で共通）
async function askStaff({ co, ch, scene, text, flag, history = true }) {
  lastSend = { co, ch, scene, text, flag, history };
  await withBusy(async () => {
    const hist = history ? S.chat.filter(m => m.ch === ch && m.who !== 'sys').map(m => ({ who: m.who === 'staff' ? '担当者' : m.who === 'partner' ? 'ゆう' : nameOf(m.who), text: m.text })) : [];
    const r = await api('/api/ai/hearing', { company: co, scene, history: hist, text });
    if (isRealFail(r.call)) { emit('fail', { role: 'hearing', ch, call: r.call }); return; }
    emit('ai', { role: 'hearing', co, ch, data: r.data, call: r.call, flag });
    faceTalk();
  });
}
const requests = () => [S.survey ? `アンケート：${JSON.stringify(S.survey)}` : '', S.entry.text ? `最初に書いた思い：${S.entry.text}` : '', S.entryRead?.summary ? `入口で読み取った要望：${S.entryRead.summary}` : ''].filter(Boolean).join('。');

export const ACTIONS = {
  async start() {
    let playId = null;
    try { const r = await api('/api/play/start', {}); playId = r.playId; } catch (e) { toast(String(e.message)); return; }
    emit('start', { seed: 7, playId });
  },
  howtoNext() { if (S.howto < 3) emit('howto', { page: S.howto + 1 }); else goto('family', 0); },
  howtoSkip() { goto('family', 0); },
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
  toVisit() { if (S.visit.length !== 2) return; emit('cur', { co: S.visit[0] }); goto('survey', 1); },
  submitSurvey() {
    const a = { fam: val('sv_fam'), now: val('sv_now'), budget: val('sv_budget'), when: val('sv_when'), kazu: val('sv_kazu'), yuu: val('sv_yuu'), worry: val('sv_worry') };
    emit('survey', { answers: a });
    const co = S.cur;
    const open = [S.entryRead?.aside, persona(co)?.tone[0] || 'ご来場ありがとうございます。まずは、おふたりの理想を聞かせてください。'].filter(Boolean).join('');
    goto('hearing', 1);
    emit('say', { who: 'staff', co, ch: co, text: open });
  },
  who(d) { setWho(d.w); render(); },
  async send() {
    const text = val('say'); if (!text) return; clear('say');
    const who = getWho(), co = S.cur, second = S.visit[1] === co;
    emit('say', { who, ch: co, text });
    const scene = second
      ? `2社目の初回打ち合わせ。施主は前の会社と同じ要望を伝えている（${requests()}）。この会社の視点で、質問や助言をする。`
      : `1社目の初回打ち合わせ（ヒアリング）。${requests()}。ご主人（かず）と奥様（ゆう）の両方に聞く。話題：暮らし方と家族の時間帯、収納と家事の動線、予算と資金、土地、性能、デザイン、将来の変化。`;
    await askStaff({ co, ch: co, scene, text: `${nameOf(who)}：${text}` });
  },
  async retry() { if (lastSend) await askStaff(lastSend); },
  toForgot() {
    goto('forgot', 1);
    emit('say', { who: 'partner', ch: 'partner', text: `${Y.COMPANIES[S.visit[0]].staff}さんとの打ち合わせ、伝え忘れたこと、あった？` });
  },
  sayPartner() {
    const text = val('say'); if (!text) return; clear('say');
    emit('say', { who: 'kazu', ch: 'partner', text, forgot: true });
    emit('say', { who: 'partner', ch: 'partner', text: `それ、${Y.COMPANIES[S.visit[0]].staff}さんに送っておこうよ。` });
  },
  async sendForgot() {
    const co = S.visit[0];
    const text = S.chat.filter(m => m.ch === 'partner' && m.forgot).map(m => m.text).join('\n');
    goto('reply', 1);
    emit('say', { who: 'kazu', ch: 'msg', text });
    await new Promise(r => setTimeout(r, 1500)); // 返信は少し時間をおいて届く
    await askStaff({ co, ch: 'msg', scene: '帰宅後、施主からメッセージアプリで届いた「伝え忘れたこと」への、翌日の返信。短く。', text, flag: 'forgot', history: false });
  },
  toSecond() { emit('cur', { co: S.visit[1] }); goto('hearing', 1); emit('say', { who: 'sys', ch: S.visit[1], text: `${Y.COMPANIES[S.visit[0]].name}と同じ要望を伝えた` }); emit('say', { who: 'staff', co: S.visit[1], ch: S.visit[1], text: persona(S.visit[1])?.tone[1] || 'ご要望、拝見しました。気になる点からお聞かせください。' }); },
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
  pickSide(d) { emit('pendingSide', { side: d.side }); },
  unpick() { emit('pendingSide', { side: null }); },
  decideWhy() { const reason = val('say'); clear('say'); decide(S.pendingSide, reason); },
  decideNoWhy() { decide(S.pendingSide, ''); },
  async freeAnswer() {
    const text = val('say'); if (!text) return; clear('say');
    const dec = Y.decisions(S.pair)[S.forkNo];
    emit('say', { who: getWho(), ch: S.player.company, text });
    await withBusy(async () => {
      const r = await api('/api/ai/trade', { world: S.player, pair: S.pair, decisionId: dec.id, text });
      emit('ai', { role: 'trade', text, data: r, call: r.call });
      faceTalk();
    });
  },
  approve() {
    const t = S.pendingTrade; if (!t || t.result.verdict === 'いまは難しい') return;
    const dec = Y.decisions(S.pair).find(x => x.id === t.decisionId);
    emit('fork', { decisionId: dec.id, proposal: t.proposal, reason: t.reason, priority: t.priority });
    afterFork(dec);
  },
  cancelTrade() { emit('cancelTrade', {}); },
  toCoord() { goto('coord', 6); },
  finish(d) { emit('finish', { finish: { [d.k]: d.k === 'color' ? +d.v : d.v, ...(d.k === 'wall' ? { color: 0 } : {}) } }); },
  // 第四の分岐点：コーディネートで選んだ結果が答えになる。増額があれば「アップグレードを受ける」側
  decideCoord() {
    const f = { ...S.player.finish }, add = Y.finishCost(f);
    const dec = Y.decisions(S.pair)[3];
    const label = add ? `アップグレードを受ける（${[f.wall !== 'std' && '外壁', f.floor !== 'std' && '床', f.inner !== 'vinyl' && '内壁'].filter(Boolean).join('・')}）` : '標準の仕上げのまま';
    emit('fork', { decisionId: dec.id, proposal: { side: add ? 'b' : 'a', finish: f, plain: true, label, spec: {}, borrow: 'cover' }, reason: '', priority: '' });
    goto('electric', 6);
  },
  elecTag(d) { const o = Y.ELECTRIC.options.find(x => x.id === d.id); const el = document.getElementById('say'); if (el && o) el.value = `${o.label}をお願いしたい`; },
  async sendElectric() {
    const text = val('say'); if (!text) return; clear('say');
    const co = S.player.company;
    emit('say', { who: getWho(), ch: 'elec', text });
    // 指摘を電気の項目に読み替える（コード）。伝えていたのに漏れていたか、一度も伝えていないかを、それまでの会話で見分ける
    const ids = Y.electricOf(text).filter(id => !S.player.electric.includes(id));
    if (!ids.length) { await askStaff({ co, ch: 'elec', scene: '契約後の電気の打ち合わせ。施主の指摘が、電気の項目に当たらない。確認して次回お返事すると、ていねいに伝える（金額は言わない）。', text, flag: 'electric', history: false }); return; }
    const before = [...words().filter(m => m.ch !== 'elec'), { text: S.entry.text || '' }, { text: Object.values(S.survey || {}).join(' ') }];
    const told = ids.filter(id => before.some(m => Y.ELECTRIC_WORDS[id].test(m.text)));
    const pol = Y.missedPolicy(co, Y.outcome(S.player).skill);
    const adj = told.map(id => { const o = Y.ELECTRIC.options.find(x => x.id === id); return { label: `伝え漏れの扱い：${o.label}`, v: -Math.round(o.v * (1 - pol.rate) * 10) / 10 }; }).filter(a => a.v);
    const rp = DATA.electrical?.replyPatterns;
    const lines = [];
    if (told.length) lines.push(pol.kind === 'free' ? rp?.requestedButMissed.free : pol.kind === 'half' ? rp?.requestedButMissed.half : rp?.requestedButMissed.paidNoRecord);
    if (ids.length > told.length) lines.push(rp?.notRequested.default);
    busy.on = true; render(); setFace(document.getElementById('face'), 'think');
    await new Promise(r => setTimeout(r, 900));
    busy.on = false;
    emit('say', { who: 'staff', co, ch: 'elec', text: lines.filter(Boolean).join('') || '承知しました。' });
    emit('electric', { ids, adj, told, policy: told.length ? pol.kind : null });
    faceTalk();
  },
  toBuild() { goto('build', 7); },
  // S6：着工すると、上棟・施主検査・引渡しまで自動で進み、白いフェードで引渡し式へ
  async startBuild() {
    emit('buildAuto', {});
    for (const st of [8, 9, 10]) { await new Promise(r => setTimeout(r, 1700)); goto('build', st); }
    await new Promise(r => setTimeout(r, 1400));
    goto('handover', 10);
  },
  toHandover() { goto('handover', 10); },
  // 写真を保存：引渡し式のSVGを canvas に描いて、画像として書き出す（家族の名前はニックネームだけ）
  async savePhoto() {
    const { ceremonySVG } = await import('./scenes.js');
    const svg = ceremonySVG(S, true);
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    await img.decode();
    const c = document.createElement('canvas'); c.width = 1124 * 2; c.height = 920 * 2;
    const g = c.getContext('2d'); g.scale(2, 2); g.drawImage(img, 0, 0);
    const a = document.createElement('a'); a.download = 'yukusuie-hikiwatashi.png'; a.href = c.toDataURL('image/png'); a.click();
  },
  // そして1年後……：季節が移り変わってから、1年後のわが家へ
  async toSeasons() { goto('seasons', 11); await new Promise(r => setTimeout(r, 4600)); goto('result', 11); },
  rtab(d) { emit('rtab', { k: d.k }); },
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
  print() { try { localStorage.setItem('yuku-report', JSON.stringify({ report: S.report, player: S.player, others: S.others, heard: S.heard, missed: S.missed, chat: S.chat, staff16: S.staff16, savedId: S.savedId })); } catch { } open('/report.html', '_blank'); },
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
  closePhone() { clearTimeout(pollTimer); if (PHONE.st?.code) fetch(`/api/link/${PHONE.st.code}/close`, { method: 'POST' }); PHONE.st = null; emit('pop', { pop: null }); },
  async importPhone() {
    const code = PHONE.st?.code; if (!code) return;
    const j = await (await fetch(`/api/link/${code}/poll?full`)).json();
    const texts = (j.items || []).filter(i => i.text).map(i => i.text);
    const photos = (j.items || []).filter(i => i.photo && i.photo.startsWith('data:')).map(i => i.photo).slice(0, 3 - S.entry.photos.length);
    const ta = document.getElementById('entryText');
    const text = [ta?.value || S.entry.text, ...texts].filter(Boolean).join('\n');
    S.entry = { text, photos: [...S.entry.photos, ...photos] };
    ACTIONS.closePhone();
    const t2 = document.getElementById('entryText'); if (t2) { t2.value = text; t2.dispatchEvent(new Event('input')); }
  },
  tourNext() { tourNext(); render(); },
  tourSkip() { tourSkip(); render(); },
  help() { tourHelp(S); render(); },
};

function decide(side, reason) {
  if (!side) return;
  const dec = Y.decisions(S.pair)[S.forkNo];
  if (reason) emit('say', { who: getWho(), ch: S.player.company, text: reason });
  emit('fork', { decisionId: dec.id, side, reason, priority: '' });
  afterFork(dec);
}
async function reportCall() {
  const o = Y.outcome(S.player);
  try {
    const worlds = [S.player, ...S.others].map(w => { const x = Y.outcome(w); return { no: x.no, mine: w === S.player, labels: x.labels, warmth: x.warmth.label, slack: x.slack.label, events: x.events }; });
    const hk = S.heard.filter(h => h.who === 'かず').length, hy = S.heard.filter(h => h.who === 'ゆう').length, hf = S.heard.filter(h => h.who === 'ふたり').length;
    const r = await api('/api/ai/report', { memory: S.player.memory, labels: S.player.labels, words: words().map(m => ({ who: nameOf(m.who), text: m.text })), entry: S.entry.text, events: o.events, warmth: o.warmth.label, slack: o.slack.label, worlds, couple: `かず ${hk}枚、ゆう ${hy}枚、ふたり ${hf}枚。かずの付箋：${S.heard.filter(h => h.who === 'かず').map(h => h.text).join('、') || 'なし'}。ゆうの付箋：${S.heard.filter(h => h.who === 'ゆう').map(h => h.text).join('、') || 'なし'}` });
    if (isRealFail(r.call)) { S.report = { failed: true }; emit('fail', { role: 'report', ch: 'report', call: r.call }); return; }
    emit('ai', { role: 'report', data: r.data, call: r.call });
  } catch (e) { S.report = { failed: true }; toast(String(e.message)); }
}
function afterFork(dec) {
  if (dec.id === 'D1') { emit('say', { who: 'sys', ch: S.player.company, text: `${Y.COMPANIES[S.player.company].name}に決めて、土地の売買契約を結んだ（ローン特約の期限は${Y.DEADLINE.loan}日目）` }); goto('fork', 3); }
  else if (dec.id === 'D2') goto('fork', 5);
  else if (dec.id === 'D3') {
    // 契約に入れてあるオプションは、その会社の担当者が聞き取れた（記録した）要望だけ
    const co = S.player.company;
    const inc = Y.electricOf(S.heard.filter(h => h.co === co).map(h => h.text).join(' ')).filter(id => !S.player.electric.includes(id));
    if (inc.length) emit('electric', { ids: inc, adj: [], contract: true });
    goto('contract', 5);
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
  const imgs = [...files].filter(f => f.type.startsWith('image/')).slice(0, 3 - S.entry.photos.length);
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

let pollTimer = null;
function keepEntry() { const ta = document.getElementById('entryText'); if (ta) S.entry.text = ta.value; }
async function pollPhone() {
  clearTimeout(pollTimer);
  const code = PHONE.st?.code; if (!code || S.pop !== 'phone') return;
  try { const r = await fetch(`/api/link/${code}/poll`); const j = await r.json(); if (r.status === 410) { PHONE.st = { error: j.message }; render(); return; } if (j.ok && (j.items || []).length !== (PHONE.st.items || []).length) { PHONE.st.items = j.items; render(); } } catch { }
  pollTimer = setTimeout(pollPhone, 3000);
}
