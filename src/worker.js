// ゆくすいえ Worker：/api/*（Claude呼び出し・保存・回数制限）。それ以外は静的アセット（public/）
import * as Y from './engine/engine.js';
import { callJSON, callTools, PROMPTS, modelFor, hasDigits, digitsIn } from './ai.js';
import PERSONAS from '../data/content/personas.json';
import TOPICS from '../data/content/hearing_topics.json';
import PHRASES from '../data/content/report_phrases.json';
import HARNESS from '../data/content/rep_harness.json';
import SURVEY from '../data/content/survey.json';
import BROCHURES from '../data/content/brochures.json';
import { REP_SCHEMA, buildRepSystem, checkRep, repairRep, numsIn, stockReply, fillSlots, PHASES, SLOTS, PRESSURES } from './rep.js';
import { PhoneLink, linkOpen, newCode } from './link.js';
import { Meter } from './meter.js';
export { PhoneLink, Meter };

const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
const today = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10).replace(/-/g, '');
const ipOf = req => req.headers.get('cf-connecting-ip') || 'local';

// ---- 回数制限（KV。無いときはメモリで数える）----
const mem = new Map();
async function bump(env, key, ttl = 172800, by = 1) {
  if (env.STORE) { const n = +(await env.STORE.get(key) || 0) + by; await env.STORE.put(key, String(n), { expirationTtl: ttl }); return n; }
  const n = (mem.get(key) || 0) + by; mem.set(key, n); return n;
}
// 費用の累計：計量器（Durable Object）で原子的に足す。はじめての日は、KVに残っていた値から引き継ぐ
const meter = env => env.METER ? env.METER.get(env.METER.idFromName('global')) : null;
async function meterAdd(env, keys, n) { const m = meter(env); if (m) return m.fetch('https://meter/add', { method: 'POST', body: JSON.stringify({ keys, micro: n }) }).then(x => x.json()); const o = {}; for (const k of keys) { o[k] = (mem.get(k) || 0) + n; mem.set(k, o[k]); } return o; }
async function meterGet(env, k) { const m = meter(env); if (m) return (await m.fetch(`https://meter/get?k=${encodeURIComponent(k)}`).then(x => x.json())).v; return mem.has(k) ? mem.get(k) : null; }
// train=true：研修の費用は累計には数えるが、本番のプレイ用の1日の上限とは別に数える（研修で遊ぶ人の枠を使い切らない）
async function addUsd(env, usd, { train = false } = {}) {
  if (!(usd > 0)) return;
  const micro = Math.round(usd * 1e6), keys = [train ? `usdtrain:${today()}` : `usd:${today()}`, 'usd:total'];
  const m = meter(env);
  if (m) { const seed = {}; if (env.STORE) for (const k of keys) seed[k] = +(await env.STORE.get(k) || 0); const r = await m.fetch('https://meter/add', { method: 'POST', body: JSON.stringify({ keys, micro, seed }) }).then(x => x.json()); if (env.STORE) for (const k of keys) await env.STORE.put(k, String(r[k])); return; }
  for (const k of keys) { if (env.STORE) { const n = +(await env.STORE.get(k) || 0) + micro; await env.STORE.put(k, String(n)); } else mem.set(k, (mem.get(k) || 0) + micro); }
}
async function peek(env, key) {
  if (key.startsWith('usd:') && meter(env)) { const r = await meter(env).fetch(`https://meter/get?k=${encodeURIComponent(key)}`).then(x => x.json()); if (r.v != null) return r.v; }
  return env.STORE ? +(await env.STORE.get(key) || 0) : (mem.get(key) || 0);
}
async function guard(env, req, kind) {
  if (env.EMERGENCY_STOP === '1') return '現在、一時的に停止しています。しばらくしてから、もう一度お試しください。';
  const ip = ipOf(req), d = today();
  // 公開の期間を過ぎたら、Claudeを呼ばない（プレイは始められる。応答は代わりの文）
  if (kind !== 'play' && env.OPEN_UNTIL && Date.now() > Date.parse(env.OPEN_UNTIL)) return '公開の期間は終了しました。代わりの文でお返しします。';
  if (kind === 'play') {
    const n = await bump(env, `p:${ip}:${d}`);
    if (n > +(env.PLAYS_PER_IP_PER_DAY || 6)) return '本日のプレイ回数の上限に達しました。明日、またお試しください。';
    return null;
  }
  // 費用の上限（ドル建て）。1日と累計の両方を見る。超えたら、Claudeを呼ばずに代わりの文で返す
  const usdDay = await peek(env, `usd:${d}`) / 1e6, usdAll = await peek(env, 'usd:total') / 1e6;
  if (usdDay >= +(env.DAILY_BUDGET_USD || 10)) return '本日の費用の上限に達しました。代わりの文でお返しします。';
  if (usdAll >= +(env.TOTAL_BUDGET_USD || 100)) return '費用の上限に達しました。代わりの文でお返しします。';
  const g = await peek(env, `g:${d}`);
  if (g >= +(env.CALLS_GLOBAL_PER_DAY || 4000)) return '本日の全体の上限に達しました。代わりの文でお返しします。';
  const n = await bump(env, `c:${ip}:${d}`);
  if (n > +(env.CALLS_PER_IP_PER_DAY || 120)) return '本日の呼び出しの上限に達しました。代わりの文でお返しします。';
  await bump(env, `g:${d}`);
  return null;
}

// ---- 自由回答の取引（核）----
const PROPOSAL_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['side', 'spec', 'borrow'],
  properties: {
    side: { type: 'string', enum: ['a', 'b'], description: 'いまの分かれ道の2つの札のうち、近いほう' },
    spec: {
      type: 'object', additionalProperties: false, properties: {
        window: { type: 'string', enum: ['standard', 'triple'] }, kitchen: { type: 'boolean' }, exterior: { type: 'string', enum: ['full', 'min', 'none'] },
        roof: { type: 'string', enum: ['flat', 'gable', 'hip', 'mane', 'cube'] }, tsubo: { type: 'integer', description: '施主が坪数を言ったときだけ、その数字を写す' }, bigWindow: { type: 'boolean' }, eave: { type: 'string', enum: ['south', 'none'] }, carport: { type: 'boolean' }, shed: { type: 'boolean' },
      },
    },
    borrow: { type: 'string', enum: ['cover', 'keep'], description: 'cover＝増額の分を借入に足す／keep＝借入は増やさない' },
    electric: { type: 'array', items: { type: 'string', enum: Y.ELECTRIC.options.map(o => o.id) } },
  },
};
const toolSchema = desc => ({ type: 'object', additionalProperties: false, required: ['proposal'], properties: { proposal: PROPOSAL_SCHEMA } });

function tradeTools(world, d) {
  const wrap = fn => input => { const { proposal } = Y.normalizeProposal(input.proposal, { d1: d.id === 'D1' }); return fn(world, d, proposal); };
  return [
    { name: 'quote', description: '仮の見積。提案を当てたときの総額（土地＋建物）の差と、増える項目を返す', input_schema: toolSchema(), run: wrap(Y.TOOLS.quote) },
    { name: 'loan_check', description: '仮の借入。借入額、返済負担率、審査に通るか、月々の差を返す', input_schema: toolSchema(), run: wrap(Y.TOOLS.loanCheck) },
    { name: 'schedule', description: '仮の工程。本審査のやり直しの日数と、ローン特約の期限までの残りを返す', input_schema: toolSchema(), run: wrap(Y.TOOLS.schedule) },
    { name: 'coverage_check', description: '仮の建蔽率と容積率の判定', input_schema: toolSchema(), run: wrap(Y.TOOLS.coverageCheck) },
    {
      name: 'submit', description: '提案を確定して施主に返す。最後に1回だけ呼ぶ。文には算用数字を書かない',
      input_schema: {
        type: 'object', additionalProperties: false, required: ['proposal', 'message', 'reason', 'priority', 'label'],
        properties: {
          proposal: PROPOSAL_SCHEMA,
          message: { type: 'string', description: '担当者から施主へのひとこと（2〜3文、算用数字なし）' },
          reason: { type: 'string', description: '施主がこの道を選んだ理由（守ろうとしたもの）。わからなければ空' },
          priority: { type: 'string', description: '優先したことを短い言葉で（例：冬の暖かさ）' },
          label: { type: 'string', description: 'この道の短い名前（例：南の窓だけトリプルに）' },
        },
      },
    },
  ];
}

// APIキーが無いとき・失敗したときの代わりの読み替え（キーワードだけ。画面と記録には「代わりの処理」と出す）
function fallbackProposal(text, d, world) {
  const t = String(text);
  const spec = {};
  if (/トリプル|断熱|寒/.test(t)) spec.window = 'triple';
  if (/キッチン/.test(t)) spec.kitchen = !/やめ|なし|いらない/.test(t);
  if (/外構|庭/.test(t)) spec.exterior = /削|最小|後回し|あと/.test(t) ? 'min' : 'full';
  if (/勾配|三角/.test(t)) spec.roof = 'gable';
  if (/箱型|フラット/.test(t)) spec.roof = 'flat';
  const electric = [];
  if (/テレビ|壁掛け/.test(t)) electric.push('tag_tv_wall');
  if (/LAN|有線/.test(t)) electric.push('tag_lan');
  const borrow = /借入|借り|ローン/.test(t) && !/増やさ|減ら/.test(t) ? 'cover' : 'keep';
  // 第一の分岐点：文中の会社名で札を選ぶ（広さや屋根の形は、ここでは受けない）
  const coName = c => Y.COMPANIES[c]?.name || '';
  const d1side = d.id === 'D1' ? (t.includes(coName(d.b.patch?.company)) ? 'b' : t.includes(coName(d.a.patch?.company)) ? 'a' : null) : null;
  if (d.id === 'D1') { delete spec.roof; }
  const side = d1side || (d.id === 'D3' ? (borrow === 'cover' ? 'b' : 'a') : (spec.roof === 'gable' || spec.kitchen ? 'b' : 'a'));
  const words = [spec.window === 'triple' && '南の窓をトリプルに', spec.kitchen === true && '造作キッチン', spec.exterior === 'full' && '外構まで', spec.exterior === 'min' && '外構は最小限', spec.roof && spec.roof !== 'flat' && Y.ROOF_JA[spec.roof], electric.length && '電気の追加'].filter(Boolean);
  return { side, spec, borrow, electric, label: (words.join('・') || (typeof d[side].label === 'function' ? d[side].label(world) : d[side].label)) + (borrow === 'cover' ? '（借入で）' : '') };
}

async function trade(env, body) {
  const world = body.world, ds = Y.decisions(body.pair), d = ds.find(x => x.id === body.decisionId) || ds[2];
  const co = Y.COMPANIES[world.company];
  const m = Y.money(world);
  const user = [
    `# いまの分かれ道：${Y.FORKS[d.no]}「${d.q}」`,
    `- 札a：${typeof d.a.label === 'function' ? d.a.label(world) : d.a.label}`, `- 札b：${typeof d.b.label === 'function' ? d.b.label(world) : d.b.label}`,
    `# 施主の家づくり（エンジンの値）`,
    `- 会社：${co.name}（${co.kind}）、担当：${co.staffRole}・${co.staff}`,
    `- 仕様：${JSON.stringify(world.spec)}`,
    `- 総額（土地＋建物）：${m.total}万円、借入：${m.loan}万円、自己資金：${m.self}万円`,
    `- これまでの道：${(world.labels || []).join(' → ') || 'なし'}`,
    `- 施主の希望の条件：${(body.wishes || []).map(w => w.text).join('、') || 'なし'}（守れない案になるときは、message でやわらかく触れる）`,
    d.id === 'D1' ? '# この分かれ道で受けること：どちらの会社と進めるか、と、その会社と進める条件（借入・設備・窓など）だけ。広さや屋根の形の変更は、次の分かれ道（なにを優先する？）で受けると message で伝える。spec に tsubo・roof・form を入れない' : '',
    `# 施主の言葉`, String(body.text || '').slice(0, 400),
  ].join('\n');
  const tools = tradeTools(world, d);
  const { submit, call } = await callTools(env, {
    role: 'trade', user, tools,
    validateSubmit: s => { if (s.proposal?.spec?.tsubo != null && newNumbers(String(s.proposal.spec.tsubo), [body.text]).length) return '坪数は、施主が言った数字だけを写してください。'; const bad = digitsIn(s, ['message', 'reason', 'priority', 'label']); return bad.length ? `文（${bad.join('、')}）に算用数字が入っています。数字はエンジンが出すので、言葉だけで書き直してください。` : null; },
  });
  let proposal, message, reason = '', priority = '', label;
  if (submit) ({ proposal, message, reason, priority, label } = submit);
  else {
    proposal = fallbackProposal(body.text, d, world);
    message = 'いただいたご要望で、見積と借入を試算しました。条件をご確認のうえ、進めてよいか教えてください。';
    label = proposal.label;
    // 代わりの処理でも、エンジンへの問い合わせは実際に行い、その記録を残す
    for (const t of tools.slice(0, 4)) { const s = Date.now(); call.toolCalls.push({ name: t.name, input: { proposal }, output: t.run({ proposal }), ms: Date.now() - s, by: 'code' }); }
  }
  proposal = { ...proposal, label };
  const result = Y.simulate(world, d, proposal);
  { const t = Y.forkWorld(world); Y.choose(t, d, result.proposal); result.wishCheck = Y.checkWishes(t, body.wishes || []); }
  return { decisionId: d.id, proposal: result.proposal, result, message, reason, priority, label, call };
}

// ---- 担当者（ヒアリング・場面ごとのせりふ）----
// 担当者の人格と、聞き方の深さ（data/content/personas.json から組み立てる。会社の型と担当者の力量で、聞き方の深さと抜けが変わる）
const TYPE_HINT = {
  A: '予算と入居の時期を先に詰める。暮らし方の細かいことは、設計の打ち合わせに回しがち。契約を急ぎがち',
  B: '規格プランの選択肢を見せて、どれが近いかを聞く。オプションや電気の細かい話は後回しにしがち',
  C: '家族の一日の時間帯、収納の量、家事の動線、将来の変化まで、ひとつずつ深く聞く。見積が出るまで時間がかかる',
  D: '「全部できますよ」と受け止めるが、細かいことはメモを取らずに流しがち。口約束が多い',
};
const STAFF_TONE = Object.fromEntries(PERSONAS.staff.map(p => [p.company, `${p.companyName}（${p.type}）の${p.role}・${p.name}（${p.gender === 'female' ? '女性' : '男性'}、${p.age}）。${TYPE_HINT[p.company]}。
口調の見本：${p.tone.join('／')}
深く聞く話題：${p.digDeep.join('、')}。聞き漏らしやすい話題：${p.oftenMiss.join('、')}（施主が話しても、heard に入れずに missed に入れることがある）。
得意な助言：${p.advice}。言いがちな一言：「${p.catchphrase}」`]));
const TOPIC_LIST = TOPICS.topics.map(t => `- ${t.label}（質問の例：${t.questions[0]}）`).join('\n');
// 施主が自分で言った数字（例：18時）を繰り返すのは許す。それ以外の数字は、Claudeが作った数字として差し戻す
const nums = t => (String(t || '').normalize('NFKC').match(/\d+(?:\.\d+)?/g) || []);
function newNumbers(line, sources) { const ok = new Set(sources.flatMap(nums)); return nums(line).filter(n => !ok.has(n)); }
// 担当者が数字を言うときは、この差し込み記号を書く。値はエンジンが入れる（Claudeは数字を作らない）
function staffFacts(co) {
  const c = Y.COMPANIES[co], spec = Y.baseSpec(Y.HOUSEHOLDS.t2), q = Y.quote(spec, co, false);
  return {
    '{{断熱等級}}': `等級${c.insul}`, '{{UA値}}': `${Y.UA[c.insul]}`, '{{見積の表紙}}': `${Math.round(q.cover).toLocaleString()}万円`,
    '{{坪単価}}': `${c.tsubo}万円`, '{{延床の目安}}': `${spec.tsubo}坪`, '{{地盤調査}}': c.groundTiming, '{{見積の見せ方}}': q.label,
  };
}
const WISH = { type: 'object', additionalProperties: false, required: ['kind', 'value', 'text'], properties: { kind: { type: 'string', enum: ['totalMax', 'monthlyMax', 'areaMax', 'areaMin', 'priority'] }, value: { anyOf: [{ type: 'number' }, { type: 'null' }] }, text: { type: 'string' } } };
const HEARING_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['line', 'honne', 'heard', 'missed', 'choices', 'wishes'],
  properties: {
    line: { type: 'string' }, honne: { type: 'string' },
    choices: { type: 'array', items: { type: 'string' } }, wishes: { type: 'array', items: WISH },
    heard: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['tag', 'who', 'text'], properties: { tag: { type: 'string' }, who: { type: 'string', enum: ['a', 'b', 'both'] }, text: { type: 'string' } } } },
    missed: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['tag', 'who', 'said', 'reason'], properties: { tag: { type: 'string' }, who: { type: 'string' }, said: { type: 'string' }, reason: { type: 'string' } } } },
  },
};
async function hearing(env, body) {
  const co = body.company in STAFF_TONE ? body.company : 'C';
  const p = PROMPTS.hearing;
  const facts = staffFacts(co);
  const factList = Object.entries(facts).map(([k, v]) => `- ${k}（${k.replace(/[{}]/g, '')}。画面では「${v}」に置き換わる）`).join('\n');
  const A = String(body.names?.a || 'あなた').slice(0, 8), B = String(body.names?.b || 'パートナー').slice(0, 8);
  const system = p.body.replace('{{A}}', A).replace('{{B}}', B).replace('{{STAFF}}', STAFF_TONE[co] + (/ヒアリング|初回/.test(body.scene || '') ? `\nヒアリングの話題（会社の個性に合わせて、深く聞くものと流すものを選ぶ）：\n${TOPIC_LIST}` : '')).replace('{{SCENE}}', String(body.scene || '初回打ち合わせ').slice(0, 600)).replace('{{FACTS}}', factList);
  const hist = (body.history || []).slice(-8).map(h => `${h.who}：${h.text}`).join('\n');
  const user = `${hist ? `# これまでの会話\n${hist}\n` : ''}# 施主の言葉\n${String(body.text || '').slice(0, 400)}`;
  const fb = { line: body.fallbackLine || 'ありがとうございます。いまのお話、図面に反映できるか確認しますね。', honne: '', heard: [], missed: [], choices: [], wishes: [] };
  const said = [body.text, ...(body.history || []).map(h => h.text)];
  const r = await callJSON(env, { role: 'hearing', system, user, schema: HEARING_SCHEMA, fallback: fb, maxTokens: 1800, validate: x => x.wishes.some(w => w.value != null && newNumbers(String(w.value), said).length) ? '希望の条件の数字は、施主が言った数字だけ' : x.choices.some(hasDigits) ? '選択肢に数字' : newNumbers(x.line, said).length || /[一二三四五六七八九十百千]+(万円|円|日|週間|か月|ヶ月|坪)/.test(x.line) ? 'せりふに、施主が言っていない数字がある。数字は差し込み記号で書く' : hasDigits(x.honne) ? '本音のメモに数字' : null });
  const WHO = { a: 'かず', b: 'ゆう', both: 'ふたり' }; // 内部の識別（1人目・2人目）。画面では入力された呼び名に置き換える
  r.data.heard = (r.data.heard || []).map(h => ({ ...h, who: WHO[h.who] || h.who }));
  r.data.choices = (r.data.choices || []).slice(0, 4);
  if (!r.call.fallback) { r.data.raw = r.data.line; for (const [k, v] of Object.entries(facts)) r.data.line = r.data.line.split(k).join(v); r.data.line = r.data.line.replace(/等級等級/g, '等級').replace(/UA値UA値/g, 'UA値'); }
  return r;
}

// ---- 担当者（v2のハーネス）：場面ごとに役割を分ける（HEARING_v2.md の3、受け入れ基準3）----
PROMPTS.rep = { meta: { version: HARNESS.version, model: 'REP_MODEL' }, body: '' };
PROMPTS.trainLLM = { meta: { version: 'train-v1', model: 'MODEL_LIGHT' }, body: '' };
PROMPTS.partnerSurvey = { meta: { version: 'partner-survey-v1', model: 'MODEL_PARTNER' }, body: '' };
const STAFF_OF = Object.fromEntries((PERSONAS.staff || []).map(p => [p.company, p]));
async function rep(env, body, HARNESS_ = HARNESS) {
  const HARNESS = HARNESS_;
  const co = ['A', 'B', 'C', 'D'].includes(body.company) ? body.company : 'C';
  const phase = PHASES.includes(body.phase) ? body.phase : 'followUp';
  const specs = (BROCHURES.brochures[co]?.standard || []).map(t => t.replace('（エンジンの値）', `${Y.COMPANIES[co].insul}`));
  // 差し込み枠の値は、画面側がその場面のエンジンの状態から計算して渡す（文字列。数字を作るのはコードだけ）
  const slotValues = Object.fromEntries(Object.entries(body.slotValues || {}).filter(([k, v]) => SLOTS[k] && typeof v === 'string' && v.length <= 20));
  const system = buildRepSystem(HARNESS, { company: co, phase, staff: STAFF_OF[co], specs, memory: String(body.memory || '').slice(0, 2400), names: body.names || {}, extra: String(body.extra || '').slice(0, 600), slotValues });
  const hist = (body.history || []).slice(-8).map(h => `${h.who}：${h.text}`).join('\n');
  const user = `${hist ? `# これまでの会話\n${hist}\n` : ''}# ${phase === 'summary' ? 'アンケートを書き終えたところ' : 'お客様の言葉'}\n${String(body.text || '').slice(0, 400)}`;
  const staffTurns = (body.history || []).filter(h => h.who === '担当者').length;
  const allowNums = [...new Set([body.text, ...(body.history || []).filter(h => h.who !== '担当者').map(h => h.text), ...specs].flatMap(numsIn))];
  const r = await callJSON(env, { role: 'rep', system, user, schema: REP_SCHEMA, fallback: stockReply(HARNESS, co, phase, staffTurns), maxTokens: 900, tries: 3, validate: x => checkRep(repairRep(x, phase), { phase, company: co, allowNums, slotValues, banned: HARNESS.companies[co]?.bannedPhrases || [] }) });
  if (r.call.fallback && !r.data.stock) r.data = stockReply(HARNESS, co, phase, staffTurns);
  // 提案の場面：担当者からの新しい質問は、場面全体で1回まで（2回目からは「ほかに気になるところはありますか？」）
  const asked = (body.history || []).some(h => h.who === '担当者' && /[？?]/.test(h.text) && !/ほかに気になるところ/.test(h.text));
  // 決まり文句に差し替えると「逃げた」に見えるので、質問を消すだけにする（研修7回目）
  if (phase === 'proposal' && asked && r.data.ask) r.data.ask = null;
  if (body.markSlots) r.data.lineMarked = [fillSlots(r.data.say, slotValues, true), r.data.ask ? fillSlots(r.data.ask, slotValues, true) : ''].join('');
  r.data.say = fillSlots(r.data.say, slotValues); r.data.ask = r.data.ask ? fillSlots(r.data.ask, slotValues) : null;
  r.data.line = [r.data.say, r.data.ask].filter(Boolean).join('');
  r.data.pressure = PRESSURES.includes(r.data.pressure) ? r.data.pressure : 'none';
  r.data.notes = (r.data.notes || []).slice(0, 4).map(t => String(t).slice(0, 30));
  r.data.deferred = (r.data.deferred || []).slice(0, 3).map(t => String(t).replace(/[（(][^）)]*[A-Za-z][^）)]*[）)]/g, '').slice(0, 30));
  return r;
}
// ひとりプレイ：AIのパートナーが、同じアンケートに答える（パートナーの人格から。答えは選択肢のidだけ）
const PS_SCHEMA = { type: 'object', additionalProperties: false, required: ['answers'], properties: { answers: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['q', 'choices'], properties: { q: { type: 'string' }, choices: { type: 'array', items: { type: 'string' } } } } } } };
async function partnerSurvey(env, body) {
  const B = String(body.names?.b || 'パートナー').slice(0, 8);
  const qs = SURVEY.questions.map(q => `- ${q.id}${q.multi ? '（複数可）' : ''}：${q.text}　${q.choices.map(c => `${c.id}=${c.label}`).join(' / ')}`).join('\n');
  const system = `あなたは、家づくりの体験ゲームの中で、共働きの夫婦の妻（呼び名：${B}）を演じています。子ども二人の家族。仕事は忙しいが、家事の動線と家族の時間を大事にし、予算には少し慎重。住宅会社の来場者アンケートに、自分の考えで答えてください。夫と同じ答えに合わせる必要はありません。答えは選択肢のidだけで返します。`;
  const fb = { answers: SURVEY.questions.map((q, i) => ({ q: q.id, choices: [q.choices[(i * 7 + 3) % Math.max(1, q.choices.length - 1)].id] })) };
  const r = await callJSON(env, { role: 'partnerSurvey', system, user: `# アンケート\n${qs}`, schema: PS_SCHEMA, fallback: fb, maxTokens: 1500,
    validate: x => x.answers.some(a => { const q = SURVEY.questions.find(y => y.id === a.q); return !q || !a.choices.length || a.choices.some(c => !q.choices.some(y => y.id === c)); }) ? '選択肢のidが合わない' : null });
  return r;
}

// ---- 設計担当との調整（間取りの骨組み。Opus 5.5 がエンジンを道具として使う）----
const ROOM = { type: 'object', additionalProperties: false, required: ['name', 'size', 'floor', 'near'], properties: { name: { type: 'string' }, size: { type: 'number', enum: Y.ROOM_SIZES }, floor: { type: 'integer', enum: [1, 2] }, near: { type: 'array', items: { type: 'string' } } } };
const PLAN = { type: 'object', additionalProperties: false, required: ['title', 'rooms', 'shape'], properties: {
  title: { type: 'string', description: '案の短い名前（算用数字なし）' }, rooms: { type: 'array', items: ROOM },
  shape: { type: 'object', additionalProperties: false, required: ['form', 'roof'], properties: { form: { type: 'string', enum: Y.PLAN_FORMS }, roof: { type: 'string', enum: ['cube', 'hip', 'gable', 'mane', 'flat'] } } } } };
const OPTION = { type: 'object', additionalProperties: false, required: ['plan', 'effect'], properties: { plan: PLAN, effect: { type: 'string', description: '暮らしで何が変わるか（一行、算用数字なし）' } } };
function planErr(p) {
  if (!p || !Array.isArray(p.rooms) || p.rooms.length < 3 || p.rooms.length > 16) return '部屋は三つ以上、十六まで';
  // 部屋の名前の番号（「子ども部屋1」など）は数量ではないので、消して受け付ける
  p.rooms.forEach(r => { r.name = String(r.name).replace(/[0-9０-９]+/g, '').trim() || '部屋'; });
  if (hasDigits(p.title)) return '案の名前に算用数字';
  return null;
}
async function planner(env, body) {
  // 続きから遊ぶ道（毎回同じ打ち合わせ済みの家族）の提案は、一度作ったものを取っておき、2回目からはすぐ返す（審査員を待たせない）
  const ck = /^preset-[a-z0-9-]{1,20}-[ABCD]$/.test(body.cache || '') ? `plancache:${body.cache}` : null;
  if (ck && env.STORE) { const hit = await env.STORE.get(ck); if (hit) { const j = JSON.parse(hit); return { ...j, call: { role: 'planner', cached: true, ms: 0 } }; } }
  // 設計担当が時間内に返せないとき（502・時間切れ・例外）は、決まった型の案で必ず返す（提案の日で止まらない）
  let out;
  try { out = await Promise.race([body.fallbackOnly ? plannerRun(env, body) : plannerRun(env, body), new Promise((_, rej) => setTimeout(() => rej(new Error('planner timeout')), 60000))]); }
  catch (e) { out = await plannerRun(env, { ...body, fallbackOnly: true }); out.call = { ...(out.call || {}), role: 'planner', fallback: true, error: String(e.message || e).slice(0, 80) }; }
  if (ck && env.STORE && out.ok && !out.fallback) await env.STORE.put(ck, JSON.stringify({ ...out, call: undefined }), { expirationTtl: 60 * 60 * 24 * 30 });
  return out;
}
const ROOFS = ['cube', 'hip', 'gable', 'mane', 'flat'];
async function plannerRun(env, body) {
  const world = body.world;
  const co = Y.COMPANIES[world.company];
  const wishes = body.wishes || [];
  let measured = 0;
  const tools = [
    { name: 'measure_plan', description: '骨組みを仮に当てたときの、延床・1階と2階の床面積・建蔽率・総額・借入・月々の返済・希望との違いを返す（計算エンジン）。main について二回まで', input_schema: { type: 'object', additionalProperties: false, required: ['plan'], properties: { plan: PLAN } }, run: i => (++measured > 2 ? { note: 'これ以上は測らずに、submit_plan を呼んでください。調整の案の数字は、エンジンがあとで出します。' } : Y.measurePlan(world, i.plan, wishes)) },
    { name: 'submit_plan', strict: true, description: '骨組みと調整の案を確定して、施主に見せる。最後に一回だけ呼ぶ', input_schema: { type: 'object', additionalProperties: false, required: ['intro', 'main', 'options', 'altIndex'], properties: {
      intro: { type: 'string', description: '担当者から施主へのひとこと（二〜三文、算用数字なし）' }, main: PLAN, options: { type: 'array', items: OPTION }, altIndex: { type: 'integer', description: '第二の分岐点で「もう一つの案」として残す option の番号（0から）' } } } },
  ];
  const user = [
    `# 会社：${co.name}（${co.kind}）。会社がふだん勧める外形：${Y.ROOF_JA[co.roof]}`,
    `# 世帯：${Y.HOUSEHOLDS[world.household]?.story || ''}　広さの目安：${(Y.HOUSEHOLDS[world.household]?.area || []).join('〜')}坪`,
    `# 要望の台帳（ヒアリングで聞き取ったこと）\n${(body.heard || []).slice(0, 30).map(h => `- ${h.who}：${h.text}`).join('\n') || 'なし'}`,
    `# 希望の条件\n${wishes.map(w => `- ${w.text}`).join('\n') || 'なし'}`,
    body.current ? `# いまの骨組み\n${JSON.stringify(body.current)}` : '',
    ROOFS.includes(body.roof) && !body.current ? `# この案の屋根：${body.roof}（${Y.ROOF_JA[body.roof]}）。${String(body.roofWhy || '').slice(0, 60)}。本案（main）はこの屋根で組む。会社のふだんの外形と違うなら、intro にその理由を一言` : '',
    body.text ? `# 施主の指示（これを反映して組み直す。調整の回数：${body.round || 1}回目）\n${String(body.text).slice(0, 300)}` : '',
  ].filter(Boolean).join('\n');
  const { submit, call } = body.fallbackOnly ? { submit: null, call: { role: 'planner', fallback: true } } : await callTools(env, {
    role: 'planner', user, tools, submitName: 'submit_plan', effort: 'low', maxTurns: 4,
    validateSubmit: x => (!x.main || !Array.isArray(x.options) ? 'main と options（二つか三つ）を入れてください' : null) || (ROOFS.includes(body.roof) && !body.current && x.main?.shape?.roof !== body.roof ? `本案の屋根は ${body.roof} にしてください` : null) || planErr(x.main) || x.options.map(o => planErr(o?.plan)).find(Boolean) || (digitsIn(x, ['intro']).length || x.options.some(o => hasDigits(o.effect)) ? '文に算用数字' : null),
  });
  if (!submit) {
    // 代わりの処理：決まった型の骨組みと調整の案（画面には「代わりの処理」と出す）
    const R = (name, size, floor) => ({ name, size, floor, near: [] });
    // 部屋は世帯の設定（夫婦＋子ども二人）と、どの家にも要る水回り・収納だけ。聞いていない部屋（和室・書斎など）や設備は足さない
    const base = [R('LDK', 16, 1), R('洗面・脱衣', 3, 1), R('浴室', 3, 1), R('トイレ', 3, 1), R('玄関収納', 3, 1), R('ファミリー収納', 3, 1), R('主寝室', 8, 2), R('子ども部屋', 6, 2), R('子ども部屋', 6, 2), R('トイレ', 3, 2)];
    // アンケートで答えた部屋（仕事の個室・客間）は、聞いていれば足す（区画の決まり33〜35坪に収まる範囲で、調整の案で外せる）
    const said = (body.heard || []).map(h => h.text).join(' ');
    if (/仕事は個室/.test(said)) base.push(R('書斎', 4.5, 2));
    if (/客間|和室/.test(said)) base.push(R('和室', 4.5, 1));
    // 屋根は、要望の台帳の好みを優先（FLOW_v3 の4）
    // ふたりの好みが分かれていれば、会社によってどちらの好みから組むかが変わる（理由は intro に一言）。形は会社の性格から
    const RP = [['屋根は四角い箱', 'cube'], ['屋根は三角屋根', 'gable'], ['屋根は寄棟', 'hip'], ['屋根は片流れ', 'mane']].filter(([k]) => said.includes(k)).map(([, v]) => v);
    const second = ['A', 'D'].includes(world.company);
    const pref = ROOFS.includes(body.roof) ? body.roof : RP.length ? RP[second && RP.length > 1 ? 1 : 0] : co.roof;
    const form = ['A', 'B'].includes(world.company) ? '総二階' : '部分二階';
    const shape = { form, roof: pref };
    const main = { title: 'いただいた要望をそのまま入れた案', rooms: form === '総二階' ? base.map(r => r.name === 'ファミリー収納' ? { ...r, floor: 2 } : r) : base, shape };
    const why = body.roofWhy ? `屋根は、${String(body.roofWhy).slice(0, 40)}、${Y.ROOF_JA[pref]}で描いてみました。` : RP.length > 1 ? `屋根は、おふたりの好みが分かれていたので、${Y.ROOF_JA[pref]}で描いてみました。` : '';
    const opts = [
      { plan: { title: '総二階に寄せた案', rooms: base.map(r => r.name === 'ファミリー収納' ? { ...r, floor: 2 } : r), shape: { form: '総二階', roof: pref } }, effect: '一階と二階の形がそろい、基礎と屋根が減る' },
      { plan: { title: '子ども部屋をひとまわり小さくした案', rooms: base.map(r => r.name === '子ども部屋' ? { ...r, size: 4.5 } : r), shape }, effect: '子ども部屋は寝て勉強する広さに絞り、過ごすのはリビングで' },
      { plan: { title: '収納を一か所にまとめた案', rooms: base.filter(r => r.name !== '玄関収納').map(r => r.name === 'ファミリー収納' ? { ...r, size: 4.5 } : r), shape }, effect: '玄関の収納とまとめ、家族で共有する' },
    ];
    const measure = p => Y.measurePlan(world, p, wishes);
    return { ok: true, fallback: true, intro: `いただいた要望を全部入れると、こうなります。${why}調整の案もお持ちしました。`, main, mainM: measure(main), options: opts.map(o => ({ ...o, m: measure(o.plan) })), altIndex: 1, call };
  }
  // 数字はエンジンが出す：各案の面積・総額・月々・希望との違い
  const measure = p => Y.measurePlan(world, p, wishes);
  return { ok: true, intro: submit.intro, main: submit.main, mainM: measure(submit.main), options: submit.options.slice(0, 3).map(o => ({ ...o, m: measure(o.plan) })), altIndex: Math.max(0, Math.min(submit.options.length - 1, submit.altIndex || 0)), call };
}

// ---- パートナー（ひとりプレイのとき、妻をAIが演じる）----
const PARTNER_SCHEMA = { type: 'object', additionalProperties: false, required: ['line', 'wishes'], properties: { line: { type: 'string' }, wishes: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['tag', 'text'], properties: { tag: { type: 'string' }, text: { type: 'string' } } } } } };
async function partner(env, body) {
  const A = String(body.names?.a || 'あなた').slice(0, 8), B = String(body.names?.b || 'パートナー').slice(0, 8);
  // パートナーの立場はプレイヤーが選ぶ（TESTPLAY T3）。口調は男女の2種類
  const wife = (body.names?.role || 'h') === 'h';
  const TONE = wife ? '口調：やわらかい話し言葉。口ぐせ：「それ、毎日のことだよね」「わたしは、こっちのほうが気になるかな」' : '口調：落ち着いた話し言葉（一人称は「ぼく」）。口ぐせ：「それ、毎日のことだよな」「ぼくは、こっちのほうが気になるかな」';
  const system = PROMPTS.partner.body.split('{{A}}').join(A).split('{{B}}').join(B).split('{{PR}}').join(wife ? '妻' : '夫').split('{{ME}}').join(wife ? '夫' : '妻').split('{{TONE}}').join(TONE);
  const hist = (body.history || []).slice(-8).map(h => `${h.who}：${h.text}`).join('\n');
  const user = `# いまの場面\n${String(body.scene || '').slice(0, 300)}\n${hist ? `# これまでの会話\n${hist}\n` : ''}# あなたへの問いかけ\n${String(body.ask || '').slice(0, 300)}`;
  const fb = { line: wife ? 'うーん、わたしは毎日の家事が回るほうが気になるかな。' : 'うーん、ぼくは毎日の家事が回るほうが気になるかな。', wishes: [] };
  return callJSON(env, { role: 'partner', system, user, schema: PARTNER_SCHEMA, fallback: fb, maxTokens: 800, validate: x => hasDigits(x.line) ? '数字' : null });
}

// ---- 自分のAI（1ターン1回、短い回答を1回だけ。最も安価なモデル）----
const MYAI_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['answer', 'rooms'],
  properties: {
    answer: { type: 'string' },
    rooms: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['floor', 'row', 'col', 'name'], properties: { floor: { type: 'integer', enum: [1, 2] }, row: { type: 'integer', enum: [0, 1, 2, 3] }, col: { type: 'integer', enum: [0, 1, 2, 3] }, name: { type: 'string' } } } },
  },
};
async function myai(env, body) {
  const user = `# いまの場面\n${String(body.context || '').slice(0, 300)}\n# 聞いたこと\n${String(body.question || '').slice(0, 300)}`;
  const fb = { answer: 'いまは詳しくお答えできません。担当の方に、いちど確かめてみてください。', rooms: [] };
  return callJSON(env, { role: 'myai', user, schema: MYAI_SCHEMA, fallback: fb, maxTokens: 800, validate: x => hasDigits(x.answer) ? '数字' : null });
}

// ---- 1年後のレポート ----
const REPORT_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['title', 'balance', 'memories', 'tellFirst', 'couple', 'closing'],
  properties: {
    title: { type: 'string' }, balance: { type: 'array', items: { type: 'string' } }, memories: { type: 'array', items: { type: 'string' } },
    tellFirst: { type: 'array', items: { type: 'string' } }, couple: { type: 'string' }, closing: { type: 'string' },
  },
};
// 呼び名・タイトル・教訓の候補（Claudeの生成が確認に通らないときの代わり。data/content/report_phrases.json）
const tagsOf = w => [w.company, ...(w.labels || []).flatMap(l => [/勾配/.test(l) && 'gable', /箱型/.test(l) && 'box', /外構まで/.test(l) && 'full', /最小限/.test(l) && 'min', /トリプル/.test(l) && 'triple', /グレードアップ|アップグレード/.test(l) && 'upgrade', /標準/.test(l) && 'standard']).filter(Boolean)];
function pickPhrase(list, tags, salt) { const sc = list.map((x, i) => [x.tags.filter(t => tags.includes(t)).length * 10 - ((i + salt) % 7), x]); sc.sort((a, b) => b[0] - a[0]); return sc[0][1].text.replace(/^教訓：/, ''); }
const BANNED = PHRASES.checks.bannedWords;
const hasBanned = t => BANNED.some(b => String(t).includes(b));
const lenOK = (t, n) => [...String(t).replace(/[。、「」・\s]/g, '')].length <= n;
async function report(env, body) {
  const labels = (body.labels || []).slice(0, 4);
  const mem = body.memory || [];
  const forks = labels.map((l, i) => { const m = mem.find(x => x.decisionId === `D${i + 1}`); return `${i + 1}. ${Y.FORKS[i]}「${Y.DECISIONS[i].q}」→ 選んだ道：${l}${m?.reason ? `（本人の理由：${m.reason}）` : ''}${m?.priority ? `（優先：${m.priority}）` : ''}`; }).join('\n');
  const words = (body.words || []).slice(-16).map(w => `- ${w.who}：${String(w.text).slice(0, 120)}`).join('\n');
  const worlds = (body.worlds || []).slice(0, 16);
  const wlist = worlds.map(w => `- no ${w.no}${w.mine ? '（施主の世界）' : ''}：${(w.labels || []).join(' → ')}／冬の朝 ${w.warmth}／ゆとり ${w.slack}／出来事：${(w.events || []).join('、') || 'なし'}`).join('\n');
  const user = `# 4つの分かれ道（memories は、この順に${labels.length}つ書く）\n${forks}\n# 施主が打ち合わせで話した言葉\n${words || 'なし'}\n# 施主が最初に書いた思い\n${String(body.entry || 'なし').slice(0, 400)}\n# ふたりの要望の付箋の数（コードで数えた）\n${body.couple || 'なし'}\n# 守れなかった希望（エンジンで確かめた。memories や tellFirst で、責めずに触れてよい）\n${(body.unkept || []).join('\n') || 'なし'}\n# 1年後の出来事\n${(body.events || []).join('\n') || 'とくになし'}\n# 暖かさ・家計のゆとり\n${body.warmth || ''}／${body.slack || ''}`;
  const fb = { title: '', balance: ['毎日の暮らしやすさ', '家計の安心', '家族の時間'], memories: labels.map(l => `「${l}」を選びました。`), tellFirst: ['いちばん大切にしたいこと', '予算の上限と、その理由', '後から変えにくいところ（下地・配線・窓）'], couple: '', closing: 'この紙を、本物の打ち合わせに持っていってください。', worlds: [] };
  const check = x => {
    const bad = digitsIn(x, ['title', 'balance', 'memories', 'tellFirst', 'couple', 'closing']);
    if (bad.length) return `算用数字（${bad.join('、')}）`;
    if (x.memories.length !== labels.length) return `memories は${labels.length}つ`;
    if (!lenOK(x.title, PHRASES.checks.titleMaxChars)) return 'title は16字以内';
    if (hasBanned(JSON.stringify(x))) return '使わない言葉が入っている（正解・失敗など）';
    return null;
  };
  const r = await callJSON(env, { role: 'report', user, schema: REPORT_SCHEMA, fallback: fb, effort: 'low', maxTokens: 5000, validate: check });
  // 足りない世界には、候補から呼び名を当てる（コード）
  if (r.call.fallback) { const me = worlds.find(w => w.mine); if (me) r.data.title = pickPhrase(PHRASES.titles, tagsOf(me), me.no); }
  return r;
}

// ---- 選ばれなかった世界の担当者のひとこと（並列で呼ぶ）----
async function staff16(env, body) {
  const worlds = (body.worlds || []).slice(0, 15);
  const schema = { type: 'object', additionalProperties: false, required: ['line'], properties: { line: { type: 'string' } } };
  const res = await Promise.all(worlds.map(w => callJSON(env, {
    role: 'staff16', schema, maxTokens: 300,
    user: `会社：${Y.COMPANIES[w.company]?.name}／担当：${Y.COMPANIES[w.company]?.staffRole}・${Y.COMPANIES[w.company]?.staff}\n選んだ道：${(w.labels || []).join(' → ')}\n出来事：${(w.events || []).join('、') || 'とくになし'}`,
    fallback: { line: '1年、おつかれさまでした。' }, validate: x => hasDigits(x.line) ? '数字' : null,
  })));
  return { lines: res.map((r, i) => ({ no: worlds[i].no, line: r.data.line })), calls: res.map(r => r.call) };
}

// ---- 入口の自由入力：ことば・写真・URL（P1）----
const ENTRY_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['elements', 'colors', 'summary', 'unrelated', 'aside'],
  properties: {
    unrelated: { type: 'integer' }, aside: { type: 'string' },
    elements: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['tag', 'text', 'from'], properties: { tag: { type: 'string' }, text: { type: 'string' }, from: { type: 'string', enum: ['ことば', '写真', 'URL'] } } } },
    colors: { type: 'array', items: { type: 'string' } }, summary: { type: 'string' },
  },
};
// URLのページを Worker 側で取得し、題名・説明・本文の先頭だけを取り出す（大きさと時間に上限）
async function pageText(url) {
  try {
    const u = new URL(url); if (!/^https?:$/.test(u.protocol)) return null;
    // IPを直接書いたアドレス・内部向けの名前は取りに行かない。転送先は追わない（どこへでも届く中継にしない）
    if (/^(\d{1,3}\.){3}\d{1,3}$|^\[|^localhost$|\.local$|\.internal$|^metadata/i.test(u.hostname) || u.port && !['80', '443'].includes(u.port)) return null;
    const r = await fetch(u.toString(), { headers: { 'user-agent': 'yukusuie-entry/1.0', accept: 'text/html' }, signal: AbortSignal.timeout(5000), redirect: 'manual' });
    if (!r.ok || !/text\/html/.test(r.headers.get('content-type') || '')) return null;
    const html = (await r.text()).slice(0, 300000);
    const pick = re => (html.match(re) || [])[1] || '';
    const title = pick(/<title[^>]*>([^<]{0,200})/i), desc = pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{0,400})/i) || pick(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']{0,400})/i);
    const body = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 1500);
    return `題名：${title}\n説明：${desc}\n本文の先頭：${body}`;
  } catch { return null; }
}
async function entry(env, body) {
  const text = String(body.text || '').slice(0, 1000);
  const urls = (text.match(/https?:\/\/[^\s　]+/g) || []).slice(0, 2);
  const pages = (await Promise.all(urls.map(pageText))).map((t, i) => t ? `# URL ${i + 1}\n${t}` : '').filter(Boolean);
  const photos = (body.photos || []).filter(p => /^data:image\/jpeg;base64,/.test(p) && p.length < 1600000).slice(0, 3);
  const content = [
    ...photos.map(p => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: p.split(',')[1] } })),
    { type: 'text', text: `# 施主のことば\n${text || 'なし'}\n${pages.join('\n')}\n# 写真\n${photos.length}枚` },
  ];
  const fb = { elements: [], colors: [], summary: text.slice(0, 120), unrelated: 0, aside: '' };
  const r = await callJSON(env, { role: 'entry', user: content, schema: ENTRY_SCHEMA, fallback: fb, maxTokens: 1500, validate: x => digitsIn(x, ['summary', 'aside']).length || x.elements.some(e => hasDigits(e.text)) ? '数字' : null });
  // 画像の中身は記録に残さない（枚数だけ）
  r.call.input = { ...r.call.input, user: `ことば ${text.length}字、写真 ${photos.length}枚、URL ${urls.length}件（取得 ${pages.length}件）` };
  return r;
}

// ---- 記録の保存と再生 ----
const rid = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), b => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');
const logMem = new Map();
// プレイの記録：作ったときに書き込み用の秘密を返し、上書きはその秘密があるときだけ（再生のコードを知っていても書き換えられない）
async function saveLog(env, body) {
  let id = body.id && /^[a-z0-9]{8}$/.test(body.id) ? body.id : null, key = String(body.key || '');
  if (id) { const k = env.STORE ? await env.STORE.get(`logkey:${id}`) : logMem.get('k:' + id); if (!k || k !== key) id = null; }
  const fresh = !id; if (fresh) { id = rid(); key = crypto.randomUUID(); }
  const data = JSON.stringify({ v: 1, savedAt: Date.now(), events: body.events || [], state: body.state || null });
  if (data.length > 900000) return json({ error: '記録が大きすぎます' }, 413);
  const ttl = { expirationTtl: 60 * 60 * 24 * 60 };
  if (env.STORE) { await env.STORE.put(`log:${id}`, data, ttl); if (fresh) await env.STORE.put(`logkey:${id}`, key, ttl); } else { logMem.set(id, data); if (fresh) logMem.set('k:' + id, key); }
  return json({ id, key: fresh ? key : undefined });
}
async function loadLog(env, id) {
  const data = env.STORE ? await env.STORE.get(`log:${id}`) : logMem.get(id);
  return data ? new Response(data, { headers: { 'content-type': 'application/json; charset=utf-8' } }) : json({ error: 'not found' }, 404);
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const path = url.pathname;
    if (!path.startsWith('/api/')) return env.ASSETS.fetch(req);
    try {
      if (path === '/api/health') return json({ ok: true, engine: Y.VERSION, models: { top: modelFor(env, 'trade'), mid: modelFor(env, 'hearing'), light: modelFor(env, 'myai') }, prompts: Object.fromEntries(Object.entries(PROMPTS).map(([k, v]) => [k, v.meta.version])), hasKey: !!env.ANTHROPIC_API_KEY, mode: env.AI_MODE || 'live', usdToday: (await peek(env, `usd:${today()}`)) / 1e6, usdTotal: (await peek(env, 'usd:total')) / 1e6, budget: { day: +(env.DAILY_BUDGET_USD || 10), total: +(env.TOTAL_BUDGET_USD || 100) }, store: !!env.STORE, stop: env.EMERGENCY_STOP === '1', phone: env.PHONE_LINK === '1' });
      if (req.method === 'GET' && path.startsWith('/api/log/')) return loadLog(env, path.slice(9));
      // スマホ連携（審査期間中のみ）
      if (path.startsWith('/api/link')) {
        if (!linkOpen(env) || !env.LINK) return json({ ok: false, closed: true, message: '審査期間中のみ利用できます。' }, 403);
        if (path === '/api/link/new' && req.method === 'POST') {
          const n = await bump(env, `l:${ipOf(req)}:${today()}`);
          if (n > 10) return json({ ok: false, message: '本日の上限に達しました。' }, 429);
          const g = await bump(env, `lg:${today()}`);
          if (g > 1000) return json({ ok: false, message: '本日の全体の上限に達しました。' }, 429);
          const code = newCode();
          const r = await env.LINK.get(env.LINK.idFromName(code)).fetch('https://link/init', { method: 'POST' });
          const j = await r.json();
          return json({ ok: true, code, url: `${url.origin}/m.html?c=${code}`, expiresAt: j.expiresAt });
        }
        const m = /^\/api\/link\/([a-z2-9]{10})\/(send|poll|close)$/.exec(path);
        if (!m) return json({ error: 'not found' }, 404);
        if (m[2] === 'send') { const n = await bump(env, `ls:${ipOf(req)}:${today()}`); if (n > 60) return json({ ok: false, message: '本日の上限に達しました。' }, 429); }
        return env.LINK.get(env.LINK.idFromName(m[1])).fetch(`https://link/${m[2]}${url.search}`, { method: req.method, body: req.method === 'POST' ? await req.text() : undefined });
      }
      if (req.method !== 'POST') return json({ error: 'method' }, 405);
      const body = await req.json().catch(() => ({}));
      if (path === '/api/play/start') { const msg = await guard(env, req, 'play'); if (msg) return json({ ok: false, message: msg }, 429); const playId = rid(); await meterAdd(env, [`play:${playId}`], 0); return json({ ok: true, playId }); }
      if (path === '/api/log') {
        // 記録の保存にも、1つのIPで1日の上限（1プレイ約20回 × 1日6プレイに余裕を見て300回）。超えたら保存しない（プレイは続く）
        // KV は同じ欄を1秒に何度も書くと失敗するので、数えられなかったときは保存を通す（保存を落とさない）
        const n = await bump(env, `s:${ipOf(req)}:${today()}`).catch(() => 0);
        if (n > +(env.SAVES_PER_IP_PER_DAY || 300)) return json({ ok: false, message: '本日の保存の上限に達しました。' }, 429);
        return saveLog(env, body);
      }
      // 担当者の研修（docs/REP_TRAINING.md）：合言葉（Workerの秘密）がある呼び出しだけ。研修中のハーネスを差し替えて試せる。費用は全体の上限に数える
      if (path.startsWith('/api/train/')) {
        if (!env.TRAIN_TOKEN || req.headers.get('x-train-token') !== env.TRAIN_TOKEN) return json({ error: 'forbidden' }, 403);
        if (await peek(env, 'usd:total') / 1e6 >= +(env.TOTAL_BUDGET_USD || 100)) return json({ error: '費用の上限' }, 429);
        let out;
        if (path === '/api/train/rep') out = await rep(env, body, body.harness && body.harness.base && body.harness.companies ? body.harness : HARNESS);
        else if (path === '/api/train/llm') out = await callJSON(env, { role: 'trainLLM', system: String(body.system || '').slice(0, 8000), user: String(body.user || '').slice(0, 12000), schema: body.schema, fallback: body.fallback || {}, maxTokens: Math.min(+body.maxTokens || 800, 2000) });
        else return json({ error: 'not found' }, 404);
        const usd = out.call?.costUsd || 0; ctx.waitUntil(addUsd(env, usd, { train: true }));
        return json({ ...out, costUsd: usd });
      }
      const ROLES = { '/api/ai/trade': trade, '/api/ai/myai': myai, '/api/ai/report': report, '/api/ai/staff16': staff16, '/api/ai/entry': entry, '/api/ai/partner': partner, '/api/ai/planner': planner, '/api/ai/rep': rep, '/api/ai/partnerSurvey': partnerSurvey };
      const fn = ROLES[path];
      if (!fn) return json({ error: 'not found' }, 404);
      // プレイを始めた人だけが呼べる。1プレイの呼び出しにも上限（15回呼ぶ役割は15回と数える）
      const playId = /^[a-z0-9]{8}$/.test(body.playId || '') ? body.playId : null;
      const used = playId ? await meterGet(env, `play:${playId}`) : null;
      if (used == null) return json({ ok: false, message: 'プレイを始めてから、お試しください。' }, 403);
      const cost = path === '/api/ai/staff16' ? 15 : 1;
      const n = (await meterAdd(env, [`play:${playId}`], cost))[`play:${playId}`];
      if (path === '/api/ai/entry' && (body.text || '').match(/https?:\/\//) && (await meterAdd(env, [`url:${playId}`], 1))[`url:${playId}`] > 2) body.text = String(body.text).replace(/https?:\/\/\S+/g, '');
      let limited = n > +(env.CALLS_PER_PLAY || 90) ? 'このプレイの呼び出しの上限に達しました。代わりの文でお返しします。' : await guard(env, req, 'call');
      // 15回呼ぶ役割は、まとめて1回の書き込みで数える（同じ欄を短い間に何度も書くと、KVの書き込みの制限で失敗していた）
      if (!limited && cost > 1) await bump(env, `c:${ipOf(req)}:${today()}`, 172800, cost - 1);
      if (limited) env = { ...env, ANTHROPIC_API_KEY: '' }; // 上限を超えたら、Claudeを呼ばずに代わりの文で返す
      const finish = out => { const usd = (out.call?.costUsd || 0) + (out.calls || []).reduce((a, c) => a + (c.costUsd || 0), 0); ctx.waitUntil(addUsd(env, usd)); return JSON.stringify({ ...out, limited: limited || undefined, costUsd: usd ? Math.round(usd * 1e5) / 1e5 : undefined }); };
      // 時間のかかる役割（設計担当・レポート）は、待つ間も空白を少しずつ送り、途中の中継に接続を切られないようにする（JSONの前の空白は読むときに無視される）
      if (path === '/api/ai/planner' || path === '/api/ai/report' || path === '/api/ai/staff16') {
        const { readable, writable } = new TransformStream(); const w = writable.getWriter(), enc = new TextEncoder();
        const beat = setInterval(() => { w.write(enc.encode(' ')).catch(() => {}); }, 8000);
        ctx.waitUntil((async () => { let txt; try { txt = finish(await fn(env, body)); } catch (e) { txt = JSON.stringify({ ok: false, error: String(e.message || e) }); } clearInterval(beat); try { await w.write(enc.encode(txt)); await w.close(); } catch { } })());
        return new Response(readable, { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
      }
      return new Response(finish(await fn(env, body)), { headers: { 'content-type': 'application/json; charset=utf-8' } });
    } catch (e) {
      return json({ error: String(e.message || e) }, 500);
    }
  },
};
