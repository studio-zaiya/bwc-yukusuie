// Claude呼び出しの共通部品：役割ごとのシステムプロンプト（版番号つき）、tool use、JSON出力の検証、
// 失敗時の再試行1回と、失敗したときの代わりの文。出来事の記録に、入力・出力の全文・モデル名・プロンプトの版を残す。
import Anthropic from '@anthropic-ai/sdk';
import tradeMd from '../prompts/trade.md';
import hearingMd from '../prompts/hearing.md';
import myaiMd from '../prompts/myai.md';
import reportMd from '../prompts/report.md';
import staff16Md from '../prompts/staff16.md';

function parsePrompt(md) {
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(md);
  const meta = {}; if (m) m[1].split('\n').forEach(l => { const i = l.indexOf(':'); if (i > 0) meta[l.slice(0, i).trim()] = l.slice(i + 1).trim(); });
  return { meta, body: (m ? m[2] : md).trim() };
}
export const PROMPTS = Object.fromEntries(Object.entries({ trade: tradeMd, hearing: hearingMd, myai: myaiMd, report: reportMd, staff16: staff16Md }).map(([k, v]) => [k, parsePrompt(v)]));

export function modelFor(env, role) {
  const tier = PROMPTS[role]?.meta.model || 'MODEL_MID';
  return env[tier] || { MODEL_TOP: 'claude-sonnet-5-5', MODEL_MID: 'claude-sonnet-5-5', MODEL_LIGHT: 'claude-haiku-5-5' }[tier];
}

// 言葉はClaude、数字はコード：Claudeの文に算用数字が入っていたら差し戻す
export const hasDigits = s => /[0-9０-９]/.test(String(s || ''));
export function digitsIn(obj, keys) { return keys.filter(k => { const v = obj?.[k]; return Array.isArray(v) ? v.some(x => hasDigits(typeof x === 'string' ? x : JSON.stringify(x))) : hasDigits(v); }); }

export function client(env) {
  if (!env.ANTHROPIC_API_KEY) return null;
  return new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 0, timeout: 45000 });
}

// 1回の呼び出し。Sonnet 系は、拒否のときに自動で別のモデルへ回す（server-side fallback）
async function create(c, params, { useFallback }) {
  if (useFallback && /sonnet-5-5|opus-5/.test(params.model)) {
    return c.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' });
  }
  return c.messages.create(params);
}

const textOf = msg => (msg.content || []).filter(b => b.type === 'text').map(b => b.text).join('');

// 構造化出力（JSON）で1回だけ答えさせる。検証に落ちたら1回だけ再試行し、だめなら代わりの文を返す
export async function callJSON(env, { role, user, schema, system, validate, fallback, effort = 'low', maxTokens = 2000 }) {
  const p = PROMPTS[role];
  const model = modelFor(env, role);
  const rec = { role, model, promptVersion: p.meta.version, input: { system: system || p.body, user }, attempts: [], fallback: false };
  const c = client(env);
  const t0 = Date.now();
  if (!c) { rec.fallback = true; rec.reason = 'APIキー未設定'; rec.output = fallback; rec.ms = 0; return { data: fallback, call: rec }; }
  for (let i = 0; i < 2; i++) {
    try {
      const msg = await create(c, {
        model, max_tokens: maxTokens, system: system || p.body,
        messages: [{ role: 'user', content: user }],
        output_config: { effort, format: { type: 'json_schema', schema } },
      }, { useFallback: i === 0 });
      const raw = textOf(msg);
      rec.attempts.push({ stop: msg.stop_reason, raw, model: msg.model, usage: msg.usage });
      if (msg.stop_reason === 'refusal') throw new Error('refusal');
      const data = JSON.parse(raw);
      const err = validate ? validate(data) : null;
      if (err) throw new Error('検証：' + err);
      rec.output = data; rec.ms = Date.now() - t0; rec.servedModel = msg.model;
      return { data, call: rec };
    } catch (e) {
      rec.attempts.push({ error: String(e.message || e) });
    }
  }
  rec.fallback = true; rec.reason = '2回とも失敗'; rec.output = fallback; rec.ms = Date.now() - t0;
  return { data: fallback, call: rec };
}

// tool use の往復（手で書いたループ）。tools は {name, description, input_schema, run(input) } の配列。
// 最後に submit の道具が呼ばれたら終わる
export async function callTools(env, { role, user, tools, submitName = 'submit', validateSubmit, maxTurns = 6, effort = 'medium' }) {
  const p = PROMPTS[role];
  const model = modelFor(env, role);
  const rec = { role, model, promptVersion: p.meta.version, input: { system: p.body, user }, turns: [], toolCalls: [], fallback: false };
  const c = client(env);
  const t0 = Date.now();
  if (!c) { rec.fallback = true; rec.reason = 'APIキー未設定'; rec.ms = 0; return { submit: null, call: rec }; }
  const defs = tools.map(({ name, description, input_schema }) => ({ name, description, input_schema }));
  const byName = Object.fromEntries(tools.map(t => [t.name, t]));
  for (let attempt = 0; attempt < 2; attempt++) {
    const messages = [{ role: 'user', content: user }];
    try {
      for (let turn = 0; turn < maxTurns; turn++) {
        const msg = await create(c, { model, max_tokens: 4000, system: p.body, tools: defs, tool_choice: { type: 'auto' }, messages, output_config: { effort } }, { useFallback: attempt === 0 });
        rec.turns.push({ stop: msg.stop_reason, content: msg.content, model: msg.model, usage: msg.usage });
        rec.servedModel = msg.model;
        if (msg.stop_reason === 'refusal') throw new Error('refusal');
        messages.push({ role: 'assistant', content: msg.content });
        const uses = msg.content.filter(b => b.type === 'tool_use');
        if (!uses.length) { messages.push({ role: 'user', content: `${submitName} の道具を呼んで、提案を確定してください。` }); continue; }
        const results = [];
        let submitted = null;
        for (const u of uses) {
          if (u.name === submitName) {
            const err = validateSubmit ? validateSubmit(u.input) : null;
            rec.toolCalls.push({ name: u.name, input: u.input, error: err || undefined, ms: 0 });
            if (err) { results.push({ type: 'tool_result', tool_use_id: u.id, is_error: true, content: err }); continue; }
            submitted = u.input;
            results.push({ type: 'tool_result', tool_use_id: u.id, content: '受け付けました。' });
            continue;
          }
          const t = byName[u.name]; const s = Date.now();
          let out, isErr = false;
          try { out = t ? t.run(u.input) : { error: `道具「${u.name}」はありません` }; if (!t) isErr = true; } catch (e) { out = { error: String(e.message || e) }; isErr = true; }
          rec.toolCalls.push({ name: u.name, input: u.input, output: out, ms: Date.now() - s });
          results.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(out), is_error: isErr || undefined });
        }
        messages.push({ role: 'user', content: results });
        if (submitted) { rec.ms = Date.now() - t0; rec.output = submitted; return { submit: submitted, call: rec }; }
      }
      throw new Error('往復の上限に達した');
    } catch (e) {
      rec.turns.push({ error: String(e.message || e) });
    }
  }
  rec.fallback = true; rec.reason = '2回とも失敗'; rec.ms = Date.now() - t0;
  return { submit: null, call: rec };
}
