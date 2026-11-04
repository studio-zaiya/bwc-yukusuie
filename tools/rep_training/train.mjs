// 担当者の研修（docs/REP_TRAINING.md）：Claude同士のペアレビュー。一から書いた道具（外部のコードは使わない）。
// 担当者：本番と同じ組み立て（src/rep.js、Workerの /api/train/rep。ハーネスは手元の data/content/rep_harness.json を渡す）
// 客役・審査役：軽量のモデル（/api/train/llm）。数えられる項目はコードで数え、Claudeには「感じ」の6項目だけ付けさせる。
// 使い方：TRAIN_TOKEN=... NODE_USE_ENV_PROXY=1 node tools/rep_training/train.mjs <回の名前> [会社] [客役の数]
// 上限：TRAIN_MAX_USD（既定 8）、TRAIN_MAX_CALLS（既定 900）。会話の記録は out/rep_training/<回>/ に（コミットしない）
import fs from 'fs';
import path from 'path';
import { checkRep } from '../../src/rep.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const J = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const HARNESS = J('data/content/rep_harness.json'), SURVEY = J('data/content/survey.json'), CUST = J('data/training/customers.json').customers, RUBRIC = J('data/training/rubric.json');
const M = await import(path.join(ROOT, 'public/memory.js'));
const BASE = process.env.TRAIN_URL || 'https://yukusuie.zaiya.workers.dev';
const TOKEN = process.env.TRAIN_TOKEN || '';
const MAX_USD = +(process.env.TRAIN_MAX_USD || 8), MAX_CALLS = +(process.env.TRAIN_MAX_CALLS || 900);
const ROUND = process.argv[2] || 'round1';
const ONLY = process.argv[3] && process.argv[3] !== 'all' ? process.argv[3].split(',') : null;
const NCUST = +(process.argv[4] || 0);
const OUT = path.join(ROOT, 'out/rep_training', ROUND);
fs.mkdirSync(OUT, { recursive: true });
let usd = 0, calls = 0;

async function post(route, body) {
  if (usd >= MAX_USD || calls >= MAX_CALLS) throw new Error(`研修の上限（${usd.toFixed(2)}ドル／${calls}回）`);
  calls++;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(`${BASE}/api/train/${route}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-train-token': TOKEN }, body: JSON.stringify(body) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error || r.status);
      usd += j.costUsd || 0; return j;
    } catch (e) { if (i === 2) throw e; await new Promise(r => setTimeout(r, 1500 * (i + 1))); }
  }
}
// 種つきの乱数で、客役ごとのアンケートの答え（ふたり分）を作る
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function answersFor(seed, cust) {
  const R = rng(seed), p1 = {}, p2 = {};
  for (const q of SURVEY.questions) {
    const ch = q.choices.filter(c => c.id !== 'none');
    const pick = () => cust.id === 'blank' && R() < 0.5 ? 'none' : ch[Math.floor(R() * ch.length)].id;
    const a = pick(); let b = R() < (cust.id === 'conflict' ? 0.5 : 0.2) ? pick() : a;
    if (cust.id === 'conflict' && (q.id === 'roof' || q.id.startsWith('budget'))) b = ch[(ch.findIndex(c => c.id === a) + 1) % ch.length].id;
    if (cust.id === 'impossible' && q.id === 'ldk_size') { p1[q.id] = 'l'; p2[q.id] = 'l'; continue; }
    if (cust.id === 'impossible' && q.id === 'budget_total') { p1[q.id] = 'b45'; p2[q.id] = 'b45'; continue; }
    if (cust.id === 'price' && q.id === 'budget_total') { p1[q.id] = 'b50'; p2[q.id] = 'b50'; continue; }
    p1[q.id] = q.multi ? [a] : a; p2[q.id] = q.multi ? [b] : b;
  }
  return { p1, p2 };
}
// 聞き直しの検出：アンケートで答えのある問い（ふたりが同じ）を、担当者が質問で聞いていないか
const QKEY = { cars: /車|駐車/, carport: /カーポート/, ldk_size: /LDKの広さ|リビングの広さ/, kitchen: /キッチンの形|対面|壁付け/, dining: /ダイニング/, tv: /テレビ/, laundry: /洗濯|干し/, bath: /脱衣/, storage: /収納/, kids: /子ども部屋/, bedroom: /寝室/, work: /仕事|書斎/, style: /外観|雰囲気/, roof: /屋根/, warm: /暖か|断熱/, budget_total: /予算|総額/, budget_month: /月々|返済/ };
function reasks(ask, mem) {
  if (!ask) return 0;
  return Object.entries(QKEY).filter(([q, re]) => re.test(ask) && mem.survey[q] && !mem.survey[q].differs && [].concat(mem.survey[q].p1 || []).some(x => x !== 'none')).length ? 1 : 0;
}
const DIG = /[0-9０-９]/;
// 差し込み枠の値（本番ではエンジンの値。研修では一つの家の見積の例）
const SLOTS = { price: '5,320万円', area: '35坪', days: '約200日' };
const PROPOSAL = '提案の内容：総二階の家。一階にLDKと水まわり、二階に寝室と子ども部屋。アンケートの希望はおおむね入れたが、総額の上限を少し超えている。金額はお見積りの書類に書いてある（会話では数字を言わない）。';

async function conversation(co, cust, phase, seed) {
  const { p1, p2 } = answersFor(seed, cust);
  const mem = M.buildMemory(SURVEY, p1, p2); M.deliver(mem, co, HARNESS.companies[co].oftenMiss, seed);
  const names = { a: 'ひろ', b: 'なつ' };
  const memory = M.memoryText(SURVEY, mem, co, names);
  const custView = mem.items.map(x => x.text).join('／');
  const conflicts = M.conflictsOf(mem);
  const log = [];
  const hist = () => log.map(t => ({ who: t.role === 'rep' ? '担当者' : 'お客様', text: t.text }));
  let custSay = phase === 'summary' ? '（アンケートを書き終えて、担当者に渡した）' : null;
  if (phase === 'proposal') {
    const c0 = await post('llm', { system: custSystem(cust, custView, names), user: `${PROPOSAL}\n担当者から提案の図面と見積を受け取った。最初のひとことを言う。`, schema: CS, maxTokens: 300, fallback: { say: 'この提案、どうですか。' } });
    custSay = c0.data.say; log.push({ role: 'cust', text: custSay });
  }
  for (let turn = 0; turn < 6; turn++) {
    const ph = phase === 'summary' ? (turn === 0 ? 'summary' : 'followUp') : 'proposal';
    const extra = ph === 'summary' ? (conflicts.length ? `両立が難しそうな組み合わせのうち、言うのは一つだけ：${conflicts[0]}` : '') : ph === 'proposal' ? PROPOSAL : `追加の質問は${turn}往復目（2〜4往復で区切る）。時間の枠：${15 + turn * 10}分／60分`;
    const r = await post('rep', { harness: HARNESS, company: co, phase: ph, text: custSay, history: hist().slice(0, -1), names, memory, extra, slotValues: SLOTS });
    const d = r.data, errs = (r.call?.attempts || []).filter(a => a.error).map(a => a.error);
    log.push({ role: 'rep', phase: ph, text: d.line, say: d.say, ask: d.ask, notes: d.notes, deferred: d.deferred, endMeeting: d.endMeeting, stock: !!d.stock, retries: errs, model: r.call?.servedModel });
    if (d.endMeeting && turn >= 2) break;
    const c = await post('llm', { system: custSystem(cust, custView, names), user: `# これまでの会話\n${hist().map(h => `${h.who}：${h.text}`).join('\n')}\n\n担当者の最後の発言に、あなたらしく答える。`, schema: CS, maxTokens: 300, fallback: { say: 'はい。' } });
    custSay = c.data.say; log.push({ role: 'cust', text: custSay });
  }
  // 自動の項目（コード）
  const reps = log.filter(t => t.role === 'rep');
  const auto = {
    len: reps.filter(t => checkRep({ say: t.say, ask: null }, { phase: t.phase, company: co }) === `say は${t.phase === 'summary' ? 3 : 2}文まで`).length,
    q1: reps.filter(t => (String(t.ask || '').match(/[？?]/g) || []).length > 1 || (t.ask && /[？?]/.test(t.say))).length,
    num: reps.filter((t, i) => { const okN = [...log.filter(x => x.role === 'cust').map(x => x.text), ...Object.values(SLOTS), '等級6', '等級5'].join(' ').normalize('NFKC').match(/\d[\d,]*/g) || []; let u = t.text.normalize('NFKC'); for (const n of okN.sort((a, b) => b.length - a.length)) u = u.split(n).join(''); return DIG.test(u); }).length,
    reask: reps.filter((t, i) => t.phase !== 'summary' && reasks(t.ask, mem)).length,
    words: reps.filter(t => /Claude|AI|エンジン|ゲーム|Aハウス|Bハウス|Cデザイン|D工務店/.test(t.text.replace(['Aハウス', 'Bハウス', 'Cデザイン', 'D工務店'][['A', 'B', 'C', 'D'].indexOf(co)], ''))).length,
    stock: reps.filter(t => t.stock).length, turns: reps.length,
  };
  // 感じの項目（審査役）
  const jr = await post('llm', { system: JUDGE_SYS, user: `# 会社の個性\n${co}：${HARNESS.companies[co].angle}。口調：${HARNESS.companies[co].tone}\n# 場面\n${phase === 'summary' ? '初回打ち合わせ（アンケートの総括と追加の質問）' : '提案の説明'}\n# アンケートの答え\n${custView}\n# 会話（担当者の発言に番号）\n${log.map((t, i) => `${t.role === 'rep' ? `[${reps.indexOf(t)}] 担当者` : 'お客様'}：${t.text}`).join('\n')}`, schema: JS, maxTokens: 700, fallback: null });
  const sc = jr.data?.scores || {};
  const judgePass = sc.interrogate <= 2 && ['answer', 'defer', 'persona', 'progress', 'warmth'].every(k => sc[k] >= 4);
  const autoPass = auto.num === 0 && auto.words === 0 && auto.len === 0 && auto.q1 === 0 && auto.reask === 0;
  const rec = { co, cust: cust.id, custLabel: cust.label, phase, seed, harness: HARNESS.version, log, auto, scores: sc, worstTurn: jr.data?.worstTurn || null, judgeErr: (jr.call?.attempts || []).filter(a => a.error).map(a => a.error).slice(0, 2), autoPass, judgePass, pass: autoPass && judgePass };
  fs.writeFileSync(path.join(OUT, `${co}-${cust.id}-${phase}.json`), JSON.stringify(rec, null, 1));
  return rec;
}
const CS = { type: 'object', additionalProperties: false, required: ['say'], properties: { say: { type: 'string' } } };
const custSystem = (cust, view, names) => `あなたは、家づくりの体験ゲームの研修で「お客様」を演じます。共働きの夫婦（夫：${names.a}、妻：${names.b}、子ども二人）。住宅会社の担当者と話しています。\n人物：${cust.label}。${cust.style}\nアンケートに書いたこと：${view}\n発言は1〜3文。地の文やト書きは書かない。`;
const JUDGE_SYS = `あなたは、住宅会社の担当者の会話を採点する審査役です。次の6項目を1〜5で付けます。\n${RUBRIC.judge.map(j => `- ${j.id}：${j.label}（${j.scale}。合格は${j.pass}）`).join('\n')}\nいちばん悪い担当者の発言の番号と、なぜ悪いか（1行）、こう言えばよかった（2文まで、数字なし）も返す。`;
const JS = { type: 'object', additionalProperties: false, required: ['scores', 'worstTurn'], properties: { scores: { type: 'object', additionalProperties: false, required: RUBRIC.judge.map(j => j.id), properties: Object.fromEntries(RUBRIC.judge.map(j => [j.id, { type: 'integer', enum: [1, 2, 3, 4, 5] }])) }, worstTurn: { type: 'object', additionalProperties: false, required: ['index', 'why', 'better'], properties: { index: { type: 'integer' }, why: { type: 'string' }, better: { type: 'string' } } } } };

// 研修の組み合わせ：A と C は客役全員、B と D は4人。場面は「総括と追加の質問」「提案の説明」
const plan = [];
for (const co of ['A', 'C', 'B', 'D']) {
  if (ONLY && !ONLY.includes(co)) continue;
  const cs = (co === 'A' || co === 'C' ? CUST : CUST.filter(c => ['tired', 'chatty', 'price', 'normal'].includes(c.id))).slice(0, NCUST || 99);
  cs.forEach((c, i) => { for (const ph of ['summary', 'proposal']) plan.push([co, c, ph, 100 + i * 7 + (co.charCodeAt(0) - 64)]); });
}
const results = [];
const LIMIT = 6;
let k = 0;
await Promise.all(Array.from({ length: LIMIT }, async () => {
  while (k < plan.length) {
    const [co, c, ph, seed] = plan[k++];
    try { const r = await conversation(co, c, ph, seed); results.push(r); process.stdout.write(`${r.pass ? '○' : '×'} ${co}-${c.id}-${ph}  `); }
    catch (e) { console.log(`\n止まった ${co}-${c.id}-${ph}：${e.message}`); }
  }
}));
// まとめ
const rate = xs => xs.length ? Math.round(xs.filter(r => r.pass).length / xs.length * 100) : 0;
const allReps = results.flatMap(r => r.log.filter(t => t.role === 'rep'));
const sum = {
  round: ROUND, harness: HARNESS.version, conversations: results.length, usd: +usd.toFixed(3), calls,
  passRate: rate(results), byCompany: Object.fromEntries(['A', 'B', 'C', 'D'].map(co => [co, rate(results.filter(r => r.co === co))])),
  autoTurns: { turns: allReps.length, len: results.reduce((a, r) => a + r.auto.len, 0), q1: results.reduce((a, r) => a + r.auto.q1, 0), num: results.reduce((a, r) => a + r.auto.num, 0), reask: results.reduce((a, r) => a + r.auto.reask, 0), words: results.reduce((a, r) => a + r.auto.words, 0), stock: results.reduce((a, r) => a + r.auto.stock, 0) },
  judgeAvg: Object.fromEntries(RUBRIC.judge.map(j => [j.id, +(results.reduce((a, r) => a + (r.scores[j.id] || 0), 0) / Math.max(1, results.length)).toFixed(2)])),
  judgePassRate: Math.round(results.filter(r => r.judgePass).length / Math.max(1, results.length) * 100),
  failures: results.filter(r => !r.pass).map(r => ({ id: `${r.co}-${r.cust}-${r.phase}`, auto: r.auto, scores: r.scores, worst: r.worstTurn ? { turn: r.log.filter(t => t.role === 'rep')[r.worstTurn.index]?.text, why: r.worstTurn.why, better: r.worstTurn.better } : null })),
};
fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(sum, null, 1));
console.log(`\n${ROUND}：会話 ${sum.conversations}本、合格 ${sum.passRate}%（A ${sum.byCompany.A}%／B ${sum.byCompany.B}%／C ${sum.byCompany.C}%／D ${sum.byCompany.D}%）、感じの項目の合格 ${sum.judgePassRate}%、費用 ${sum.usd}ドル・${calls}回`);
console.log('自動の項目', JSON.stringify(sum.autoTurns), '感じの平均', JSON.stringify(sum.judgeAvg));
