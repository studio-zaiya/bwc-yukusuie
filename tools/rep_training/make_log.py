# 研修の記録を1つのファイルにまとめる（out/rep_training/REP_TRAINING_LOG.md）。使い方：python3 tools/rep_training/make_log.py
import json, glob, os, re
ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
D = os.path.join(ROOT, 'out', 'rep_training')
rounds = sorted([os.path.basename(p) for p in glob.glob(os.path.join(D, 'round*')) if os.path.exists(os.path.join(p, 'summary.json'))], key=lambda r: int(re.sub(r'\D', '', r)))
CH = {
 'round1': 'harness-v1（研修前）',
 'round2': 'harness-v2：差し込み枠の意味・問いかけの置き場所・同じ言い回しを続けない・短い答えの客には案を示す／コード：3文目以降を整える、客の数字は繰り返してよい',
 'round3': 'コード：数と単位（「5,000万円」）をまとめて許す',
 'round4': 'コード：部屋数・台数の漢数字（「二部屋」）は通す',
 'round5': 'harness-v3：おすすめを先に・手元にない数字はいつ出すかを約束・二択を続けない・家族の話にひとこと・会社の切り口',
 'round6': 'harness-v4：枠を意味ごとに8つ、値はエンジンから会社ごと、提案の場面に見積の要点、同じ話題は2往復で預ける、発言の分類。客役に「理不尽な値下げ」「役を壊す」を追加（64本）',
 'round7': 'コード：作り直しのときに、前の出力と理由を会話に足す（同じ依頼の送り直しをやめた）。作り直しの理由を具体的に',
 'round8': 'harness-v5：「削ったらいくら下がるか」の枠（1坪減らした差・外構を最小限にした差・仕上げを標準に戻した差）、提案の場面で質問を決まり文句に差し替えない、答えてから次へ',
 'round9': 'harness-v6：役を壊す質問は無視せず役のまま受け止めて戻す、「枠」などの内部の言葉を口にしない、会社ごとの使わない言い回し（Aの「でございます」）を検査で止める',
}
KEYS = ['interrogate', 'answer', 'defer', 'persona', 'progress', 'warmth']
out = ['# 担当者の研修の記録（Claude同士のペアレビュー）\n', '作成：Claude Code（tools/rep_training/make_log.py で作り直せる）。手順は docs/REP_TRAINING.md と docs/REP_TRAINING_NEXT.md。担当者は本番と同じ組み立て（src/rep.js、Sonnet 5.5）、客役と審査役は Haiku 5.5。1〜5回目は48本、6回目からは客役を2人足して64本。数えられる項目はコードで数え、審査役には「感じ」の6項目だけを付けさせた。6回目からの記録では、枠から入った数字に［総額］などの印を付けた（審査役には印のない文を見せる。7回目までは印つきの文を見せていた）。\n', '## 結果の推移\n',
       '| 回 | 変えたこと | 決まり文句に落ちた発言 | 聞き直し | 尋問っぽさ（低いほどよい） | 答えたか | 預け方 | 会社らしさ | 前に進んだか | 分かってもらえた感 | 分類（理不尽な値下げ／役を壊す／ふつう） | 費用 |', '|---|---|---|---|---|---|---|---|---|---|---|---|']
S = {}; total = 0
for r in rounds:
  s = json.load(open(os.path.join(D, r, 'summary.json'))); S[r] = s; total += s.get('usd', 0)
  ok = [json.load(open(f))['scores'] for f in glob.glob(os.path.join(D, r, '*-*.json'))]; ok = [x for x in ok if x]
  j = {k: round(sum(x[k] for x in ok) / max(1, len(ok)), 2) for k in KEYS}
  a = s['autoTurns']; p = s.get('pressure', {})
  pr = f"{p.get('haggler_discount','—')}／{p.get('rolebreak_offTopic','—')}／{p.get('normal_none','—')}" if p else '—'
  out.append(f"| {re.sub(r'\D','',r)} | {CH.get(r,'')} | {a['stock']}／{a['turns']} | {a['reask']} | {j['interrogate']} | {j['answer']} | {j['defer']} | {j['persona']} | {j['progress']} | {j['warmth']} | {pr} | {s['usd']}ドル |")
out.append(f"\n感じの平均は、審査役の採点がそろった会話だけで計算。合計の費用：{round(total, 2)}ドル。\n")
out.append('## 読み取れたこと\n')
out.append('- 決まり文句に落ちた発言の減少（92 → 0〜2）は、大半が検査の誤検出を直したことと、作り直しのときに理由を伝えるようにしたことの効果。ハーネスの言い方の改善は、その後の小さな上積み。')
out.append('- 合格（6項目すべてが基準を満たす）は0〜4%で、雑音の範囲。REP_TRAINING_NEXT.md の4のとおり、項目ごとの平均と違反の件数で判断する。')
out.append('- 発言の分類（6回目から）は、ふつうの客をほぼ全部「ふつう」と判定し（誤って注意が出ない）、理不尽な値下げはおおむね「値下げ」と判定する。役を壊す客は、家の話もはさむ客役のため低めに出る。')
out.append('- 次は人間の確認（AとCを2本ずつ読む。REP_TRAINING.md の4）。\n')
last = rounds[-1]
out.append('## 同じお客様への返事の、研修前と後\n')
for key in ['A-price-proposal', 'C-tired-summary', 'C-haggler-proposal', 'A-rolebreak-proposal']:
  for r in ['round1', last]:
    p = os.path.join(D, r, key + '.json')
    if not os.path.exists(p): continue
    d = json.load(open(p)); out.append(f"### {key}（{r}、{d['harness']}）　審査：{d['scores']}\n")
    for t in d['log']: out.append(f"- **{'担当者' if t['role']=='rep' else 'お客様'}**：{t['text']}{'（決まり文句）' if t.get('stock') else ''}{'　〔分類：'+t['pressure']+'〕' if t.get('pressure') and t['pressure']!='none' else ''}")
    out.append('')
out.append('## 会話の記録（全部）\n')
for r in rounds:
  out.append(f"### {r}（{CH.get(r,'')}）\n")
  for p in sorted(glob.glob(os.path.join(D, r, '*-*.json'))):
    d = json.load(open(p))
    out.append(f"#### {d['co']}・{d['custLabel']}・{'総括と追加の質問' if d['phase']=='summary' else '提案の説明'}\n")
    out.append(f"自動：{d['auto']}　感じ：{d['scores']}\n")
    for t in d['log']:
      ex = ''
      if t['role'] == 'rep':
        if t.get('stock'): ex = '（決まり文句）'
        if t.get('retries'): ex += f"（作り直し：{'／'.join(e.replace('検証：','') for e in t['retries'])}）"
        if t.get('pressure') and t['pressure'] != 'none': ex += f"〔分類：{t['pressure']}〕"
      out.append(f"- **{'担当者' if t['role']=='rep' else 'お客様'}**：{t['text']}{ex}")
    if d.get('worstTurn'): out.append(f"\n審査役：いちばん悪い発言は[{d['worstTurn']['index']}]。{d['worstTurn']['why']}　こう言えばよかった：{d['worstTurn']['better']}")
    out.append('')
open(os.path.join(D, 'REP_TRAINING_LOG.md'), 'w').write('\n'.join(out))
print(len(rounds), 'rounds', os.path.getsize(os.path.join(D, 'REP_TRAINING_LOG.md')))
