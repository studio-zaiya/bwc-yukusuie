# 担当者の研修の生の記録（1〜9回目）

`tools/rep_training/train.mjs` が `out/rep_training/<回>/` に書き出した記録を、そのまま写したもの（11/6）。まとめた文書は `docs/REP_TRAINING_LOG.md`、手順は `docs/REP_TRAINING.md`。

- `round<回>/<会社>-<お客様>-<場面>.json`：会話1本。会話の全文（担当者の発言ごとに、検査で作り直した理由 `retries`、応答したモデル `model`、決まり文句に落ちたか `stock` など）、コードで数えた項目 `auto`、審査役の点数 `scores` と、いちばん悪い発言 `worstTurn`
- `round<回>/summary.json`：その回の集計（合格率、項目ごとの平均、費用、呼び出しの回数）
- 1〜5回目は48本、6〜9回目は64本、合計496本。お客様役は `data/training/customers.json`、評価の項目は `data/training/rubric.json`
- お客様役・審査役・担当者は、すべて Claude（研修の合言葉がある呼び出しだけが通る Worker の口を使った）。登場する名前と会社はすべて架空
