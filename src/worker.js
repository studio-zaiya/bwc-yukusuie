// ゆくすいえ Worker：/api/*（Claude呼び出し・保存・回数制限）。それ以外は静的アセット（public/）
import * as Y from './engine/engine.js';
import { callJSON, callTools, PROMPTS, modelFor, hasDigits, digitsIn } from './ai.js';
import PERSONAS from '../data/content/personas.json';
import TOPICS from '../data/content/hearing_topics.json';
import PHRASES from '../data/content/report_phrases.json';
import { PhoneLink, linkOpen, newCode } from './link.js';
export { PhoneLink };

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
        roof: { type: 'string', enum: ['flat', 'gable', 'hip', 'mane', 'cube'] }, tsubo: { type: 'integer', description: '施主が坪数を言ったときだけ、その数字を写す' }, bigWindow: { type: 'boolean' }, eave: { type: 'string', enum: ['south', 'none'] }, carport: { type: 'boolean' }, shed: { type: 'boolean' },
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
  const side = d.id === 'D3' ? (borrow === 'cover' ? 'b' : 'a') : (spec.roof === 'gable' || spec.kitchen ? 'b' : 'a');
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
  const A = String(body.names?.a || 'かず').slice(0, 8), B = String(body.names?.b || 'ゆう').slice(0, 8);
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

// ---- 設計担当との調整（間取りの骨組み。Opus 5.5 がエンジンを道具として使う）----
const ROOM = { type: 'object', additionalProperties: false, required: ['name', 'size', 'floor', 'near'], properties: { name: { type: 'string' }, size: { type: 'number', enum: Y.ROOM_SIZES }, floor: { type: 'integer', enum: [1, 2] }, near: { type: 'array', items: { type: 'string' } } } };
const PLAN = { type: 'object', additionalProperties: false, required: ['title', 'rooms', 'shape', 'kitchen'], properties: {
  title: { type: 'string', description: '案の短い名前（算用数字なし）' }, rooms: { type: 'array', items: ROOM }, kitchen: { type: 'boolean', description: '造作キッチンを入れるか' },
  shape: { type: 'object', additionalProperties: false, required: ['form', 'roof'], properties: { form: { type: 'string', enum: Y.PLAN_FORMS }, roof: { type: 'string', enum: ['cube', 'hip', 'gable', 'mane', 'flat'] } } } } };
const OPTION = { type: 'object', additionalProperties: false, required: ['plan', 'effect'], properties: { plan: PLAN, effect: { type: 'string', description: '暮らしで何が変わるか（一行、算用数字なし）' } } };
function planErr(p) {
  if (!p || !Array.isArray(p.rooms) || p.rooms.length < 3 || p.rooms.length > 16) return '部屋は三つ以上、十六まで';
  if (hasDigits(p.title) || p.rooms.some(r => hasDigits(r.name))) return '名前に算用数字';
  return null;
}
async function planner(env, body) {
  const world = body.world;
  const co = Y.COMPANIES[world.company];
  const wishes = body.wishes || [];
  const tools = [
    { name: 'measure_plan', description: '骨組みを仮に当てたときの、延床・1階と2階の床面積・建蔽率・総額・借入・月々の返済・希望との違いを返す（計算エンジン）', input_schema: { type: 'object', additionalProperties: false, required: ['plan'], properties: { plan: PLAN } }, run: i => Y.measurePlan(world, i.plan, wishes) },
    { name: 'submit_plan', description: '骨組みと調整の案を確定して、施主に見せる。最後に一回だけ呼ぶ', input_schema: { type: 'object', additionalProperties: false, required: ['intro', 'main', 'options', 'altIndex'], properties: {
      intro: { type: 'string', description: '担当者から施主へのひとこと（二〜三文、算用数字なし）' }, main: PLAN, options: { type: 'array', items: OPTION }, altIndex: { type: 'integer', description: '第二の分岐点で「もう一つの案」として残す option の番号（0から）' } } } },
  ];
  const user = [
    `# 会社：${co.name}（${co.kind}）。提案の外形：${Y.ROOF_JA[co.roof]}`,
    `# 世帯：${Y.HOUSEHOLDS[world.household]?.story || ''}　広さの目安：${(Y.HOUSEHOLDS[world.household]?.area || []).join('〜')}坪`,
    `# 要望の台帳（ヒアリングで聞き取ったこと）\n${(body.heard || []).slice(0, 30).map(h => `- ${h.who}：${h.text}`).join('\n') || 'なし'}`,
    `# 希望の条件\n${wishes.map(w => `- ${w.text}`).join('\n') || 'なし'}`,
    body.current ? `# いまの骨組み\n${JSON.stringify(body.current)}` : '',
    body.text ? `# 施主の指示（これを反映して組み直す。調整の回数：${body.round || 1}回目）\n${String(body.text).slice(0, 300)}` : '',
  ].filter(Boolean).join('\n');
  const { submit, call } = await callTools(env, {
    role: 'planner', user, tools, effort: 'low', maxTurns: 5,
    validateSubmit: x => planErr(x.main) || x.options.map(o => planErr(o.plan)).find(Boolean) || (digitsIn(x, ['intro']).length || x.options.some(o => hasDigits(o.effect)) ? '文に算用数字' : null),
  });
  if (!submit) {
    // 代わりの処理：決まった型の骨組みと調整の案（画面には「代わりの処理」と出す）
    const R = (name, size, floor) => ({ name, size, floor, near: [] });
    const base = [R('LDK', 16, 1), R('和室', 6, 1), R('洗面・脱衣', 3, 1), R('浴室', 3, 1), R('トイレ', 3, 1), R('玄関収納', 3, 1), R('主寝室', 8, 2), R('子ども部屋', 6, 2), R('子ども部屋', 6, 2), R('書斎', 4.5, 2), R('納戸', 3, 2), R('トイレ', 3, 2)];
    const shape = { form: '部分二階', roof: co.roof };
    const main = { title: '要望を全部入れた案', rooms: base, shape, kitchen: true };
    const opts = [
      { plan: { title: '書斎と納戸をなくした案', rooms: base.filter(r => r.name !== '書斎' && r.name !== '納戸'), shape, kitchen: true }, effect: '在宅の仕事は、寝室の一角かリビングで' },
      { plan: { title: '和室を畳コーナーにした総二階の案', rooms: base.filter(r => r.name !== '納戸').map(r => r.name === '和室' ? { ...r, size: 4.5, floor: 2 } : r), shape: { form: '総二階', roof: co.roof }, kitchen: true }, effect: '一階はひとまわり小さく、基礎と屋根が減る' },
      { plan: { title: '造作キッチンを標準にした案', rooms: base, shape, kitchen: false }, effect: '台所はシステムキッチンで、こだわりは小物で' },
    ];
    const measure = p => Y.measurePlan(world, p, wishes);
    return { ok: true, fallback: true, intro: 'いただいた要望を全部入れると、こうなります。調整の案もお持ちしました。', main, mainM: measure(main), options: opts.map(o => ({ ...o, m: measure(o.plan) })), altIndex: 1, call };
  }
  // 数字はエンジンが出す：各案の面積・総額・月々・希望との違い
  const measure = p => Y.measurePlan(world, p, wishes);
  return { ok: true, intro: submit.intro, main: submit.main, mainM: measure(submit.main), options: submit.options.slice(0, 3).map(o => ({ ...o, m: measure(o.plan) })), altIndex: Math.max(0, Math.min(submit.options.length - 1, submit.altIndex || 0)), call };
}

// ---- パートナー（ひとりプレイのとき、妻をAIが演じる）----
const PARTNER_SCHEMA = { type: 'object', additionalProperties: false, required: ['line', 'wishes'], properties: { line: { type: 'string' }, wishes: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['tag', 'text'], properties: { tag: { type: 'string' }, text: { type: 'string' } } } } } };
async function partner(env, body) {
  const A = String(body.names?.a || 'かず').slice(0, 8), B = String(body.names?.b || 'ゆう').slice(0, 8);
  const system = PROMPTS.partner.body.split('{{A}}').join(A).split('{{B}}').join(B);
  const hist = (body.history || []).slice(-8).map(h => `${h.who}：${h.text}`).join('\n');
  const user = `# いまの場面\n${String(body.scene || '').slice(0, 300)}\n${hist ? `# これまでの会話\n${hist}\n` : ''}# あなたへの問いかけ\n${String(body.ask || '').slice(0, 300)}`;
  const fb = { line: 'うーん、わたしは毎日の家事が回るほうが気になるかな。', wishes: [] };
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
  type: 'object', additionalProperties: false, required: ['title', 'balance', 'memories', 'tellFirst', 'couple', 'worlds', 'closing'],
  properties: {
    title: { type: 'string' }, balance: { type: 'array', items: { type: 'string' } }, memories: { type: 'array', items: { type: 'string' } },
    tellFirst: { type: 'array', items: { type: 'string' } }, couple: { type: 'string' }, closing: { type: 'string' },
    worlds: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['no', 'name', 'lesson'], properties: { no: { type: 'integer' }, name: { type: 'string' }, lesson: { type: 'string' } } } },
  },
};
// 呼び名・タイトル・教訓の候補（Claudeの生成が確認に通らないときの代わり。data/content/report_phrases.json）
const tagsOf = w => [w.company, ...(w.labels || []).flatMap(l => [/勾配/.test(l) && 'gable', /箱型/.test(l) && 'box', /外構まで/.test(l) && 'full', /最小限/.test(l) && 'min', /トリプル/.test(l) && 'triple', /アップグレード/.test(l) && 'upgrade', /標準/.test(l) && 'standard']).filter(Boolean)];
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
  const user = `# 4つの分かれ道（memories は、この順に${labels.length}つ書く）\n${forks}\n# 施主が打ち合わせで話した言葉\n${words || 'なし'}\n# 施主が最初に書いた思い\n${String(body.entry || 'なし').slice(0, 400)}\n# ふたりの要望の付箋の数（コードで数えた）\n${body.couple || 'なし'}\n# 守れなかった希望（エンジンで確かめた。memories や tellFirst で、責めずに触れてよい）\n${(body.unkept || []).join('\n') || 'なし'}\n# 1年後の出来事\n${(body.events || []).join('\n') || 'とくになし'}\n# 暖かさ・家計のゆとり\n${body.warmth || ''}／${body.slack || ''}\n# 16の世界（worlds は、この no ごとに1つずつ）\n${wlist}`;
  const fb = { title: '', balance: ['毎日の暮らしやすさ', '家計の安心', '家族の時間'], memories: labels.map(l => `「${l}」を選びました。`), tellFirst: ['いちばん大切にしたいこと', '予算の上限と、その理由', '後から変えにくいところ（下地・配線・窓）'], couple: '', closing: 'この紙を、本物の打ち合わせに持っていってください。', worlds: [] };
  const check = x => {
    const bad = digitsIn(x, ['title', 'balance', 'memories', 'tellFirst', 'couple', 'closing']);
    if (bad.length) return `算用数字（${bad.join('、')}）`;
    if (x.memories.length !== labels.length) return `memories は${labels.length}つ`;
    if (!lenOK(x.title, PHRASES.checks.titleMaxChars)) return 'title は16字以内';
    if (hasBanned(JSON.stringify(x))) return '使わない言葉が入っている（正解・失敗など）';
    if (worlds.length && x.worlds.length < worlds.length - 2) return 'worlds が足りない';
    if (x.worlds.some(w => !lenOK(w.name, 16) || !lenOK(w.lesson, 26) || hasDigits(w.name + w.lesson))) return '呼び名は16字以内、教訓は26字以内、数字なし';
    return null;
  };
  const r = await callJSON(env, { role: 'report', user, schema: REPORT_SCHEMA, fallback: fb, effort: 'low', maxTokens: 5000, validate: check });
  // 足りない世界には、候補から呼び名を当てる（コード）
  const have = new Set((r.data.worlds || []).map(w => w.no));
  r.data.worlds = [...(r.data.worlds || []), ...worlds.filter(w => !have.has(w.no)).map((w, i) => ({ no: w.no, name: pickPhrase(PHRASES.worldNames, tagsOf(w), w.no + i), lesson: pickPhrase(PHRASES.lessons, tagsOf(w), w.no) }))];
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
    const r = await fetch(u.toString(), { headers: { 'user-agent': 'yukusuie-entry/1.0', accept: 'text/html' }, signal: AbortSignal.timeout(5000), redirect: 'follow' });
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
      if (path === '/api/play/start') { const msg = await guard(env, req, 'play'); return msg ? json({ ok: false, message: msg }, 429) : json({ ok: true, playId: rid() }); }
      if (path === '/api/log') return saveLog(env, body);
      const ROLES = { '/api/ai/trade': trade, '/api/ai/hearing': hearing, '/api/ai/myai': myai, '/api/ai/report': report, '/api/ai/staff16': staff16, '/api/ai/entry': entry, '/api/ai/partner': partner, '/api/ai/planner': planner };
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
