// ゆくすいえ Worker：/api/*（Claude呼び出し・保存・回数制限）。それ以外は静的アセット（public/）
import * as Y from './engine/engine.js';
import { callJSON, callTools, PROMPTS, modelFor, hasDigits, digitsIn } from './ai.js';

const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
const today = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10).replace(/-/g, '');
const ipOf = req => req.headers.get('cf-connecting-ip') || 'local';

// ---- 回数制限（KV。無いときはメモリで数える）----
const mem = new Map();
async function bump(env, key, ttl = 172800) {
  if (env.STORE) { const n = +(await env.STORE.get(key) || 0) + 1; await env.STORE.put(key, String(n), { expirationTtl: ttl }); return n; }
  const n = (mem.get(key) || 0) + 1; mem.set(key, n); return n;
}
async function addUsd(env, usd) {
  if (!(usd > 0)) return;
  const micro = Math.round(usd * 1e6), d = today();
  for (const k of [`usd:${d}`, 'usd:total']) {
    if (env.STORE) { const n = +(await env.STORE.get(k) || 0) + micro; await env.STORE.put(k, String(n)); } else mem.set(k, (mem.get(k) || 0) + micro);
  }
}
async function peek(env, key) { return env.STORE ? +(await env.STORE.get(key) || 0) : (mem.get(key) || 0); }
async function guard(env, req, kind) {
  if (env.EMERGENCY_STOP === '1') return '現在、一時的に停止しています。しばらくしてから、もう一度お試しください。';
  const ip = ipOf(req), d = today();
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
        roof: { type: 'string', enum: ['flat', 'gable'] }, bigWindow: { type: 'boolean' }, eave: { type: 'string', enum: ['south', 'none'] }, carport: { type: 'boolean' }, shed: { type: 'boolean' },
      },
    },
    borrow: { type: 'string', enum: ['cover', 'keep'], description: 'cover＝増額の分を借入に足す／keep＝借入は増やさない' },
    electric: { type: 'array', items: { type: 'string', enum: Y.ELECTRIC.options.map(o => o.id) } },
  },
};
const toolSchema = desc => ({ type: 'object', additionalProperties: false, required: ['proposal'], properties: { proposal: PROPOSAL_SCHEMA } });

function tradeTools(world, d) {
  const wrap = fn => input => { const { proposal } = Y.normalizeProposal(input.proposal); return fn(world, d, proposal); };
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
function fallbackProposal(text, d) {
  const t = String(text);
  const spec = {};
  if (/トリプル|断熱|寒/.test(t)) spec.window = 'triple';
  if (/キッチン/.test(t)) spec.kitchen = !/やめ|なし|いらない/.test(t);
  if (/外構|庭/.test(t)) spec.exterior = /削|最小|後回し|あと/.test(t) ? 'min' : 'full';
  if (/勾配|三角/.test(t)) spec.roof = 'gable';
  if (/箱型|フラット/.test(t)) spec.roof = 'flat';
  const electric = [];
  if (/テレビ|壁掛け/.test(t)) electric.push('tv_wall');
  if (/LAN|有線/.test(t)) electric.push('lan_bed');
  const borrow = /借入|借り|ローン/.test(t) && !/増やさ|減ら/.test(t) ? 'cover' : 'keep';
  const side = d.id === 'D3' ? (borrow === 'cover' ? 'b' : 'a') : (spec.roof === 'gable' || spec.kitchen ? 'b' : 'a');
  const words = [spec.window === 'triple' && '南の窓をトリプルに', spec.kitchen === true && '造作キッチン', spec.exterior === 'full' && '外構まで', spec.exterior === 'min' && '外構は最小限', spec.roof === 'gable' && '勾配屋根', electric.length && '電気の追加'].filter(Boolean);
  return { side, spec, borrow, electric, label: (words.join('・') || d[side].label) + (borrow === 'cover' ? '（借入で）' : '') };
}

async function trade(env, body) {
  const world = body.world, ds = Y.decisions(body.pair), d = ds.find(x => x.id === body.decisionId) || ds[2];
  const co = Y.COMPANIES[world.company];
  const m = Y.money(world);
  const user = [
    `# いまの分かれ道：${Y.FORKS[d.no]}「${d.q}」`,
    `- 札a：${d.a.label}`, `- 札b：${d.b.label}`,
    `# 施主の家づくり（エンジンの値）`,
    `- 会社：${co.name}（${co.kind}）、担当：${co.staffRole}・${co.staff}`,
    `- 仕様：${JSON.stringify(world.spec)}`,
    `- 総額（土地＋建物）：${m.total}万円、借入：${m.loan}万円、自己資金：${m.self}万円`,
    `- これまでの道：${(world.labels || []).join(' → ') || 'なし'}`,
    `# 施主の言葉`, String(body.text || '').slice(0, 400),
  ].join('\n');
  const tools = tradeTools(world, d);
  const { submit, call } = await callTools(env, {
    role: 'trade', user, tools,
    validateSubmit: s => { const bad = digitsIn(s, ['message', 'reason', 'priority', 'label']); return bad.length ? `文（${bad.join('、')}）に算用数字が入っています。数字はエンジンが出すので、言葉だけで書き直してください。` : null; },
  });
  let proposal, message, reason = '', priority = '', label;
  if (submit) ({ proposal, message, reason, priority, label } = submit);
  else {
    proposal = fallbackProposal(body.text, d);
    message = 'いただいたご要望で、見積と借入を試算しました。条件をご確認のうえ、進めてよいか教えてください。';
    label = proposal.label;
    // 代わりの処理でも、エンジンへの問い合わせは実際に行い、その記録を残す
    for (const t of tools.slice(0, 4)) { const s = Date.now(); call.toolCalls.push({ name: t.name, input: { proposal }, output: t.run({ proposal }), ms: Date.now() - s, by: 'code' }); }
  }
  proposal = { ...proposal, label };
  const result = Y.simulate(world, d, proposal);
  return { decisionId: d.id, proposal: result.proposal, result, message, reason, priority, label, call };
}

// ---- 担当者（ヒアリング・場面ごとのせりふ）----
const STAFF_TONE = {
  A: 'Aハウス（大手ハウスメーカー）の営業・高橋。きっちりした敬語。段取りがよく、契約を急ぎがち。性能と保証に自信がある',
  B: 'Bハウス（ローコスト・規格）の営業・小林。元気で明るい。標準仕様の安さを推す。オプションの説明は後回しになりがち',
  C: 'Cデザイン（作り込み型の工務店）の設計・佐々木。丁寧で寡黙。暮らし方をよく聞く。見積は総額で出すが時間がかかる',
  D: 'D工務店（身軽型の工務店）の社長・森。気さくで話が早い。口約束が多く、記録を取らないことがある',
};
const HEARING_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['line', 'honne', 'heard', 'missed'],
  properties: {
    line: { type: 'string' }, honne: { type: 'string' },
    heard: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['tag', 'who', 'text'], properties: { tag: { type: 'string' }, who: { type: 'string', enum: ['かず', 'ゆう', 'ふたり'] }, text: { type: 'string' } } } },
    missed: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['tag', 'who', 'said', 'reason'], properties: { tag: { type: 'string' }, who: { type: 'string' }, said: { type: 'string' }, reason: { type: 'string' } } } },
  },
};
async function hearing(env, body) {
  const co = body.company in STAFF_TONE ? body.company : 'C';
  const p = PROMPTS.hearing;
  const system = p.body.replace('{{STAFF}}', STAFF_TONE[co]).replace('{{SCENE}}', String(body.scene || '初回打ち合わせ').slice(0, 400));
  const hist = (body.history || []).slice(-8).map(h => `${h.who}：${h.text}`).join('\n');
  const user = `${hist ? `# これまでの会話\n${hist}\n` : ''}# 施主の言葉\n${String(body.text || '').slice(0, 400)}`;
  const fb = { line: body.fallbackLine || 'ありがとうございます。いまのお話、図面に反映できるか確認しますね。', honne: '', heard: [], missed: [] };
  return callJSON(env, { role: 'hearing', system, user, schema: HEARING_SCHEMA, fallback: fb, validate: x => digitsIn(x, ['line']).length ? 'せりふに数字' : null });
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
  type: 'object', additionalProperties: false, required: ['title', 'balance', 'memories', 'tellFirst', 'closing'],
  properties: { title: { type: 'string' }, balance: { type: 'array', items: { type: 'string' } }, memories: { type: 'array', items: { type: 'string' } }, tellFirst: { type: 'array', items: { type: 'string' } }, closing: { type: 'string' } },
};
async function report(env, body) {
  const labels = (body.labels || []).slice(0, 4);
  const mem = body.memory || [];
  const forks = labels.map((l, i) => { const m = mem.find(x => x.decisionId === `D${i + 1}`); return `${i + 1}. ${Y.FORKS[i]}「${Y.DECISIONS[i].q}」→ 選んだ道：${l}${m?.reason ? `（本人の理由：${m.reason}）` : ''}${m?.priority ? `（優先：${m.priority}）` : ''}`; }).join('\n');
  const words = (body.words || []).slice(-16).map(w => `- ${w.who}：${String(w.text).slice(0, 120)}`).join('\n');
  const user = `# 4つの分かれ道（memories は、この順に${labels.length}つ書く）\n${forks}\n# 施主が打ち合わせで話した言葉\n${words || 'なし'}\n# 施主が最初に書いた思い\n${String(body.entry || 'なし').slice(0, 400)}\n# 1年後の出来事（エンジン）\n${(body.events || []).join('\n') || 'とくになし'}\n# 暖かさ・家計のゆとり（エンジン）\n${body.warmth || ''}／${body.slack || ''}`;
  const fb = { title: 'あのとき守ろうとしたもの', balance: ['毎日の暮らしやすさ', '家計の安心', '家族の時間'], memories: labels.map(l => `「${l}」を選びました。`), tellFirst: ['いちばん大切にしたいこと', '予算の上限と、その理由', '後から変えにくいところ（下地・配線・窓）'], closing: 'この紙を、本物の打ち合わせに持っていってください。' };
  return callJSON(env, { role: 'report', user, schema: REPORT_SCHEMA, fallback: fb, effort: 'low', maxTokens: 3000, validate: x => digitsIn(x, ['title', 'balance', 'memories', 'tellFirst', 'closing']).length ? '数字' : (x.memories.length !== labels.length ? `memories は${labels.length}つ` : null) });
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

// ---- 記録の保存と再生 ----
const rid = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), b => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');
const logMem = new Map();
async function saveLog(env, body) {
  const id = body.id && /^[a-z0-9]{8}$/.test(body.id) ? body.id : rid();
  const data = JSON.stringify({ v: 1, savedAt: Date.now(), events: body.events || [], state: body.state || null });
  if (data.length > 900000) return json({ error: '記録が大きすぎます' }, 413);
  if (env.STORE) await env.STORE.put(`log:${id}`, data, { expirationTtl: 60 * 60 * 24 * 60 }); else logMem.set(id, data);
  return json({ id });
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
      if (req.method !== 'POST') return json({ error: 'method' }, 405);
      const body = await req.json().catch(() => ({}));
      if (path === '/api/play/start') { const msg = await guard(env, req, 'play'); return msg ? json({ ok: false, message: msg }, 429) : json({ ok: true, playId: rid() }); }
      if (path === '/api/log') return saveLog(env, body);
      const ROLES = { '/api/ai/trade': trade, '/api/ai/hearing': hearing, '/api/ai/myai': myai, '/api/ai/report': report, '/api/ai/staff16': staff16 };
      const fn = ROLES[path];
      if (!fn) return json({ error: 'not found' }, 404);
      const limited = await guard(env, req, 'call');
      if (limited) env = { ...env, ANTHROPIC_API_KEY: '' }; // 上限を超えたら、Claudeを呼ばずに代わりの文で返す
      const out = await fn(env, body);
      const usd = (out.call?.costUsd || 0) + (out.calls || []).reduce((a, c) => a + (c.costUsd || 0), 0);
      ctx.waitUntil(addUsd(env, usd));
      return json({ ...out, limited: limited || undefined, costUsd: usd ? Math.round(usd * 1e5) / 1e5 : undefined });
    } catch (e) {
      return json({ error: String(e.message || e) }, 500);
    }
  },
};
