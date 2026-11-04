// 審査役の採点が抜けた会話（返事が途中で切れたもの）だけを、採点し直す。使い方：TRAIN_TOKEN=... node tools/rep_training/rescore.mjs <回の名前>
import fs from 'fs';
import path from 'path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const J = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const HARNESS = J('data/content/rep_harness.json'), RUBRIC = J('data/training/rubric.json');
const DIR = path.join(ROOT, 'out/rep_training', process.argv[2] || 'round6');
const JUDGE_SYS = `あなたは、住宅会社の担当者の会話を採点する審査役です。次の6項目を1〜5で付けます。\n${RUBRIC.judge.map(j => `- ${j.id}：${j.label}（${j.scale}。合格は${j.pass}）`).join('\n')}\nいちばん悪い担当者の発言の番号と、なぜ悪いか（1行）、こう言えばよかった（2文まで、数字なし）も返す。`;
const JS = { type: 'object', additionalProperties: false, required: ['scores', 'worstTurn'], properties: { scores: { type: 'object', additionalProperties: false, required: RUBRIC.judge.map(j => j.id), properties: Object.fromEntries(RUBRIC.judge.map(j => [j.id, { type: 'integer', enum: [1, 2, 3, 4, 5] }])) }, worstTurn: { type: 'object', additionalProperties: false, required: ['index', 'why', 'better'], properties: { index: { type: 'integer' }, why: { type: 'string' }, better: { type: 'string' } } } } };
let usd = 0;
for (const f of fs.readdirSync(DIR).filter(x => /^[ABCD]-/.test(x))) {
  const p = path.join(DIR, f), d = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (d.scores && Object.keys(d.scores).length) continue;
  const reps = d.log.filter(t => t.role === 'rep');
  const user = `# 会社の個性\n${d.co}：${HARNESS.companies[d.co].angle}。口調：${HARNESS.companies[d.co].tone}\n# 場面\n${d.phase === 'summary' ? '初回打ち合わせ（アンケートの総括と追加の質問）' : '提案の説明'}\n# 会話（担当者の発言に番号）\n${d.log.map(t => `${t.role === 'rep' ? `[${reps.indexOf(t)}] 担当者` : 'お客様'}：${t.text}`).join('\n')}`;
  const r = await fetch(`${process.env.TRAIN_URL || 'https://yukusuie.zaiya.workers.dev'}/api/train/llm`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-train-token': process.env.TRAIN_TOKEN }, body: JSON.stringify({ system: JUDGE_SYS, user, schema: JS, maxTokens: 1600, fallback: null }) }).then(x => x.json());
  usd += r.costUsd || 0;
  if (r.data?.scores) { d.scores = r.data.scores; d.worstTurn = r.data.worstTurn; const sc = d.scores; d.judgePass = sc.interrogate <= 2 && ['answer', 'defer', 'persona', 'progress', 'warmth'].every(k => sc[k] >= 4); d.pass = d.autoPass && d.judgePass; d.rescored = true; fs.writeFileSync(p, JSON.stringify(d, null, 1)); process.stdout.write('○ '); } else process.stdout.write('× ');
}
// まとめを作り直す
const rs = fs.readdirSync(DIR).filter(x => /^[ABCD]-/.test(x)).map(f => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')));
const sum = J(path.relative(ROOT, path.join(DIR, 'summary.json')));
const ok = rs.filter(r => r.scores && Object.keys(r.scores).length);
sum.judgeAvg = Object.fromEntries(RUBRIC.judge.map(j => [j.id, +(ok.reduce((a, r) => a + r.scores[j.id], 0) / Math.max(1, ok.length)).toFixed(2)]));
sum.judged = `${ok.length}/${rs.length}`; sum.usd = +(sum.usd + usd).toFixed(3); sum.passRate = Math.round(rs.filter(r => r.pass).length / rs.length * 100);
fs.writeFileSync(path.join(DIR, 'summary.json'), JSON.stringify(sum, null, 1));
console.log('\n採点あり', sum.judged, '感じの平均', JSON.stringify(sum.judgeAvg), '合格', sum.passRate + '%', '追加の費用', usd.toFixed(3));
