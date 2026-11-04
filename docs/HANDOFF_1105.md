# Claude Code への引き継ぎ（11/5 未明）

作成：2026-11-05 03:25（Claude）。同梱のファイルは、すべて最新版。リポジトリの同じ場所に上書きする。

## 0. 最初に読む順番
1. このファイル
2. `docs/ACCEPTANCE.md`（完成の定義。○×の付け方）
3. `docs/FLOW_v3.md`（流れの作り直し。いちばん大きい変更）
4. `docs/UI_NAV_SYSTEM.md`（進み方のUIの決まり。全画面に共通）
5. `docs/TESTPLAY_NOTES_1105.md`（人間のテストプレイの指摘 T1〜T13）
6. `docs/HEARING_v2.md`、`docs/REPORT_v2.md`、`docs/REP_TRAINING_NEXT.md`、`docs/WORLD_SWITCH.md`
- 食い違いがあれば、**新しいファイルが優先**：HEARING_v2 ＞ IMPL_REVIEW_2 の0-5、FLOW_v3 ＞ IMPL_REVIEW_2 の17と工程の12段階、REPORT_v2 ＞ ACCEPTANCE の6のレポート。IMPL_REVIEW_2 の冒頭に差し替えの一覧を書いた

## 1. 進め方の決まり（守れていなかったので、あらためて）
- 「できた」と言う前に、その画面のスクリーンショットを撮り、ACCEPTANCE の項目に ○／× を付けて `docs/devlog.md` に残す。×が残っていれば「できた」と言わない
- 作業の途中で新しい指示に移らない。いまの画面の×を消してから
- 1つ直したら、審査員の道（タイトル →「続きから遊ぶ」→ 提案の日 → 第一〜第四の分岐点 → 電気 → 早送り → 引渡し → 1年後 → レポート）を、ひとりプレイで最初から通して、壊れていないか確かめる
- コミットは小さく、日本語で「何を、なぜ」
- 録画とスクリーンショットは、ブックマークバーやアカウントが写らない録画専用のブラウザのプロファイルか全画面で撮る（個人のハンドル名が写り込むため）

## 2. 順番（上から。審査員の道を先に完璧にする）
| 順 | やること | 基準 |
|---|---|---|
| 1 | 個人名の一覧を非公開ファイルに移した変更を反映し、監査スキルの古い版がコミットの履歴に残っていないか確かめる。残っていれば公開前に消す | `.claude/local/private-words.txt`（人間が作る）、CLAUDE.md |
| 2 | 流れを v3 に：工程10段階、提案の日に2社の案（間取りの骨組み・延床と形・立体・概算見積）、第一〜第三の分岐点を続けて → 契約、色決めのあとに第四の分岐点を自動で、理由を聞く画面をすべて削除、提案は帰り道で裏で先に作る | FLOW_v3、ACCEPTANCE の2・2.5 |
| 3 | 進み方のUI：「進む」は右下の進行の帯に1つだけ、墨の塗りは「進む」だけ、「いまやること」の1行、言葉は「行き先＋▶」 | UI_NAV_SYSTEM |
| 4 | テストプレイの指摘：締めの「最後に何かございますか？」、帰り道の転送の画面を削除、夫か妻かを選ぶ・呼び方は名前、提案の屋根と立体を各社の案から、16区画の自分の区画の強調、切り絵は引渡しだけ、早送りを動く絵に、絵の品質 | TESTPLAY_NOTES T1〜T13、ACCEPTANCE の4・5・5.5・6 |
| 5 | 要望の聞き方 v2：アンケート21問 → 総括 → 追加の質問 → 60分の時計 → 帰り道 → 要望の全体の記憶。担当者のハーネス | HEARING_v2、`data/content/survey.json`・`requirement_memory.json`・`rep_harness.json`・`standard_specs.json` |
| 6 | 担当者の研修の次の回：数字の差し込み枠を意味ごとに分け、出てきた数字が「お客様の言った数」か「エンジンの値」に一致するかで検査、研修の場に見積の要点を渡す | REP_TRAINING_NEXT |
| 7 | レポート v2（4ページ：表紙の水彩をわが家のデータから、わが家の答え＋希望と結果の表、担当者に渡す1枚、いちばん近い4つの世界と16区画の地図） | REPORT_v2 |
| 8 | 監査を順に回す：守り（yukusuie-audit）→ フレンドリー（yukusuie-friendly）→ 攻め（yukusuie-review）→ 一貫性（yukusuie-consistency、約束の表 `docs/PROMISE_LEDGER.md`）。結果は優先順位をつけて一度に人間へ | 各スキル |
| 9 | P1：断られたら別の世界線へ（最小版）、区画の常時アニメーション、世界線を覗くビュー | WORLD_SWITCH、IMPL_REVIEW_2 の10〜14 |
- 道具：画面の照合とフレンドリー監査には、Anthropic公式の webapp-testing と frontend-design のスキルを使ってよい（Claude Code側に入れ、リポジトリにはコミットしない）。コントラストは axe-core を開発用の依存として使ってよい

## 3. 動画の材料として残すもの
- 担当者の研修の前後（REP_TRAINING_NEXT の5）。実際の記録だけ
- 作業画面の録画（主要な場面）。上の録画の注意を守る

## 4. 同梱のファイル
- docs：HANDOFF_1105、ACCEPTANCE、FLOW_v3、UI_NAV_SYSTEM、TESTPLAY_NOTES_1105、HEARING_v2、REPORT_v2、REP_TRAINING、REP_TRAINING_NEXT、WORLD_SWITCH、PROMISE_LEDGER、IMPL_REVIEW_2、CLAUDE_CODE_BRIEF、handoff
- data/content：survey、requirement_memory、rep_harness、standard_specs、info_sources（＋v1）、report_phrases
- data/training：customers、rubric
- .claude/skills：yukusuie-audit、yukusuie-consistency、yukusuie-friendly
- CLAUDE.md、.gitignore
