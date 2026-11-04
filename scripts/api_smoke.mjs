// Claude API の疎通確認：役割ごとに1回ずつだけ呼ぶ（合計 約0.05〜0.1ドルの見込み）。
// 使い方：node scripts/api_smoke.mjs https://（公開URL）
// 通しの自動プレイ（scripts/playthrough.cjs）は AI_MODE=mock の環境で回し、クレジットを使わない。
import * as Y from '../src/engine/engine.js';
const BASE = process.argv[2] || 'http://localhost:8787';
async function post(path, body) {
  const t = Date.now();
  const r = await fetch(BASE + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { j: await r.json(), ms: Date.now() - t };
}
let p = Y.newWorld(), o = [];
({ player: p, others: o } = Y.branchAll(p, o, Y.DECISIONS[0], 'a'));
({ player: p, others: o } = Y.branchAll(p, o, Y.DECISIONS[1], 'b'));
console.log('health', await (await fetch(BASE + '/api/health')).json());
let total = 0;
function show(name, { j, ms }, pick) {
  const c = j.call || {};
  total += j.costUsd || 0;
  console.log(`\n## ${name}（${ms}ms、${c.servedModel || c.model}、${c.promptVersion}、fallback=${!!c.fallback}${c.reason ? '：' + c.reason : ''}、USD ${j.costUsd || 0}）`);
  console.log(JSON.stringify(pick(j), null, 1));
}
show('trade', await post('/api/ai/trade', { world: p, decisionId: 'D3', text: '借入を少し増やして、南の大きな窓だけトリプルガラスにしたい' }), j => ({ message: j.message, proposal: j.proposal, verdict: j.result?.verdict, conditions: j.result?.conditions, tools: j.call?.toolCalls?.map(t => t.name) }));
show('hearing', await post('/api/ai/hearing', { company: 'C', scene: '初回打ち合わせ', history: [], text: 'かず：外観はミニマルに。箱っぽい家が好きです。' }), j => j.data);
show('myai', await post('/api/ai/myai', { question: '階段はリビングの中と廊下、どっちがいい？', context: '設計申込・詳細打ち合わせ' }), j => j.data);
show('report', await post('/api/ai/report', { memory: p.memory, labels: p.labels, events: ['南の窓辺が、冬でもいちばんの居場所'], warmth: '快適', slack: '少し背伸び' }), j => j.data);
console.log(`\n合計の費用（見込み）：USD ${total.toFixed(4)}`);
