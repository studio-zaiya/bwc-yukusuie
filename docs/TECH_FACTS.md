# 技術の裏付け（動画と提出フォームに書く「技術」の確認）

作成：2026-11-06 04:16（Claude Code、実装担当）。依頼：claude.ai の Claude（2026-11-06 04:10）。コードは変えていない。
確かめた版：main と作業ブランチ（claude/peaceful-johnson-5z0crp）は同じコミット（429e080）。本番の確認は https://yukusuie.zaiya.workers.dev/api/health（11/6 未明）。
決まり：推測で埋めない。確認できないものは「未確認」。

> モデルの API 文字列はこの文書に書かない（リポジトリの文書にモデル識別子を入れない、という作業の決まりのため）。文字列は「どこで」の列の行（`wrangler.toml` の19〜24行、`src/ai.js` の22行）と、本番の `/api/health` の `models` で確かめられる。この文書では、設定の名前（MODEL_TOP など）と、モデルの系統（上位・中位・軽量）だけを書く。

---

## 1. モデルの使い分け

### 1-1. 役割とモデル

役割ごとのモデルは、プロンプトのファイルの頭にある `model:`（設定の名前）で決まり、`src/ai.js:20-23` の `modelFor()` が、Worker の環境変数（`wrangler.toml:19-24`）からモデルを引く。環境変数がなければ `src/ai.js:22` の既定値を使う。

| 項目 | 使ったか | どこで | 一言 |
|---|---|---|---|
| 担当者の会話（初回の総括・追加の質問・提案の説明・電気の打ち合わせ） | 使った | 役割 `rep`、設定 `REP_MODEL`（`src/worker.js:213`）。`wrangler.toml` に `REP_MODEL` はないので、`src/ai.js:22` の既定値（中位の系統）。呼び出しは `src/worker.js:229` | 本番と研修が同じ組み立て（`src/rep.js`）。研修のハーネス `data/content/rep_harness.json`（本番は harness-v7） |
| 担当者の提案（計画役・設計担当：間取りの骨組み） | 使った | 役割 `planner`、設定 `MODEL_PLANNER`（`wrangler.toml:24`、上位の系統）、`prompts/planner.md`（planner-v5）。呼び出し `src/worker.js:299-300`（tool use：`measure_plan` で仮に測り、`submit_plan` で確定） | 1プレイで2回（2社の提案）。60秒で打ち切り、代わりの案へ。待つ間は8秒ごとに空白を送ってつなぐ（`src/worker.js:528-529`） |
| 自分のAI（スマホの汎用AI） | 使った | 役割 `myai`、設定 `MODEL_LIGHT`（`wrangler.toml:21`、軽量の系統）、`prompts/myai.md`。呼び出し `src/worker.js:359` | 住宅の専門家ではない汎用AIとして答える |
| パートナー（ひとりプレイの相手のAI） | 使った | 役割 `partner`／`partnerSurvey`、設定 `MODEL_PARTNER`（`wrangler.toml:23`、中位の系統）。呼び出し `src/worker.js:345`（会話）、`:250`（アンケートの答え） | アンケートの答えと、打ち合わせでの返事 |
| 要望の読み替え（2択の外の自由回答 → 変更の提案） | 使った | 役割 `trade`、設定 `MODEL_TOP`（`wrangler.toml:19`）、`prompts/trade.md`（trade-v3）。呼び出し `src/worker.js:139-142`（tool use：`quote`／`loan_check`／`schedule`／`coverage_check` → `submit`、`src/worker.js:81-86`） | 数字は道具（エンジン）から。Claude の文に算用数字があれば差し戻し |
| 要望の読み取り（入口・アンケートと写真から要素を拾う） | 使った | 役割 `entry`、設定 `MODEL_TOP`、`prompts/entry.md`（entry-v2）。呼び出し `src/worker.js:445` | — |
| レポートの文 | 使った | 役割 `report`、設定 `MODEL_TOP`、`prompts/report.md`（report-v4）。呼び出し `src/worker.js:393` | — |
| 概略の世界（選ばなかった世界の担当者のひとこと） | 使った | 役割 `staff16`、設定 `MODEL_LIGHT`（軽量の系統）、`prompts/staff16.md`。呼び出し `src/worker.js:404` | 1回の場面で15世界ぶん（記録 qmx2uy73 では15件、すべて軽量の系統） |
| SNS（情報収集の投稿） | 使っていない（実行時は） | `data/content/sns_search.json` を読むだけ | 投稿は事前に用意した文。プレイ中に Claude は呼ばない |
| 研修のお客さま役 | 使った | `/api/train/llm`（役割 `trainLLM`、設定 `MODEL_LIGHT`、`src/worker.js:214`、`:506`）。呼ぶ側は `tools/rep_training/train.mjs:75`、`:85` | 合言葉（Worker の秘密 `TRAIN_TOKEN`）がある呼び出しだけ（`src/worker.js:502`） |
| 研修の審査役 | 使った | 同じ `/api/train/llm`（軽量の系統）。`tools/rep_training/train.mjs:99`、`:109-110` | 「感じ」の6項目だけ採点。数えられる5項目はコードで数える |
| 旧：打ち合わせの担当者（hearing） | 本番の流れでは未確認 | 役割 `hearing`、設定 `MODEL_MID`、`src/worker.js:204` | 記録 qmx2uy73・cd9cz43g には出てこない（担当者は `rep` に置き換わった） |
| 拒否のときのモデルの自動の切り替え | 使った（設定として） | `src/ai.js:43-46`（server-side fallback のベータ） | 実際に切り替わった回数は未確認 |

本番で実際に応答したモデル（記録から）：記録 qmx2uy73 と cd9cz43g の出来事に残る `servedModel` は、中位の系統（担当者・パートナー・読み替え・読み取り・レポート）、上位の系統（設計担当、2回）、軽量の系統（自分のAI・概略の世界）の3系統。

### 1-2. 1プレイあたりの呼び出し回数

| 項目 | 使ったか | どこで | 一言 |
|---|---|---|---|
| 記録 qmx2uy73（11/5 フリーズ版・動画用） | 数えた | `GET /api/log/qmx2uy73` の出来事 | 役割の呼び出し18回（担当者8・パートナー2・アンケートの答え1・読み取り1・読み替え1・自分のAI1・レポート1・設計担当2・概略の世界1）。概略の世界の中身は15件なので、API への依頼は少なくとも31回（再試行を含む。設計担当の道具の往復は数えられていない）。代わりの文に落ちたのは0回 |
| 記録 cd9cz43g（11/5 動画担当が録画） | 数えた | `GET /api/log/cd9cz43g` | 役割の呼び出し17回、API への依頼は少なくとも30回。代わりの文は0回 |
| CLAUDE.md の目安「1プレイ15〜30回」 | — | `CLAUDE.md` | 役割の呼び出しで数えると目安の範囲。API の依頼の数で数えると、目安の上限前後 |
| 1プレイの費用 | 一部だけ | 同じ記録の `costUsd` | 記録に費用が残っている分の合計で約0.14ドル（概略の世界と設計担当の一部は含まない）。全体の正確な額は未確認 |

### 1-3. 構造化出力（JSON）と検証

| 項目 | 使ったか | どこで | 一言 |
|---|---|---|---|
| JSON のスキーマで答えさせる | 使った | `src/ai.js:53-68`（`output_config.format = json_schema`） | 役割ごとにスキーマ（例：`src/rep.js:18-22` の REP_SCHEMA） |
| tool use（道具を呼ばせる） | 使った | `src/ai.js:91-104`（手で書いた往復のループ。最後の1回は確定の道具を強制）、`strict` の道具（`src/worker.js:287`） | 読み替え（trade）と設計担当（planner） |
| 検証に落ちたとき | 使った | `src/ai.js:79-85` | 前の出力と落ちた理由を会話に足して出し直させる（同じ依頼の送り直しはしない）。既定2回、担当者は3回（`src/worker.js:229`）。だめなら代わりの文（担当者は会社ごとの決まった返事 `stockReply`） |
| Claude の文の数字の検査 | 使った | `src/ai.js:25-27`（`hasDigits`・`digitsIn`）、`src/worker.js:142`（読み替え）、`:174`・`:204`（施主が言っていない数字） | 算用数字と「万円・日・坪」などがついた漢数字を差し戻す |
| 数字の枠（型つきの差し込み）の照合 | 使った | `src/rep.js:31`（`{総額}` などの枠）、`:51-60`（`checkRep`：エンジンが値を渡していない枠を使ったら差し戻し。枠の外の数字は、お客様が言った数と自社の標準仕様の表の数だけ通す）、`:104-105`（`fillSlots`：枠をエンジンの値で置き換える） | 担当者は数字を書かず枠で書き、表示の直前にコードが値を入れる |

---

## 2. 開発で使った Claude の機能

数えた範囲：この実装のセッション（Claude Code、2026-11-04 12:27〜11-06 04:12 JST）の記録。11/2〜11/4 朝の claude.ai での作業と、動画担当のセッションの中身は、この環境からは見えないので「未確認」。

| 項目 | 使ったか | どこで | 一言 |
|---|---|---|---|
| Skills：yukusuie-audit（守りの監査） | 使った | `.claude/skills/yukusuie-audit/SKILL.md`（コミット bbaf48f）。直接の呼び出し2回＋サブエージェントが手順書を読んで実行4回 | 結果：`docs/AUDIT_1105.md`、devlog 11/4 14:36・11/5 07:54・09:49 |
| Skills：yukusuie-review（攻めのレビュー） | 使った | 直接の呼び出し1回＋サブエージェント5回 | 結果：`docs/REVIEW_attack_v2.md`、`docs/AUDIT_1105.md` |
| Skills：yukusuie-friendly（初見の人の目） | 使った | サブエージェント1回 | 結果：`docs/AUDIT_1105.md` |
| Skills：yukusuie-consistency（約束の表との照合） | 使った | サブエージェント2回 | 結果：`docs/PROMISE_LEDGER.md` の「状態」、`docs/AUDIT_1105.md` |
| Skills：Anthropic 標準の claude-api | 使った | 直接の呼び出し1回 | API の使い方の確認 |
| サブエージェント（Agent ツール） | 使った（12回） | このセッションの記録 | すべて監査とレビュー。「実装した本人ではない目」で見るため。11/4 16:29 に4つの立場（審査員・共働きの夫婦・住宅のプロ・UIとAI技術）を並行、11/4 22:38 に4つの監査を並行、11/5 00:36 に再監査2つ、11/5 08:00 に最終の守りの監査 |
| MCP | 使った（開発の補助だけ） | このセッションの記録：GitHub の MCP（ブランチの一覧、1回）、クラウド環境の説明書の MCP（1回） | 作品の中では MCP を使っていない。claude.ai・動画担当の側は未確認 |
| フック | 作品のためには設定していない | リポジトリに `.claude/settings*.json` はない | クラウド環境が標準で持つ確認の仕組みはあるが、作品のために設定したものではない |
| CLAUDE.md による決まりごとの共有 | 使った | `CLAUDE.md`（守ること・デザインコード・エンジンの大原則）。人間の回答に合わせて更新（例：区画の行、11/5） | 実装と動画の両方のセッションが同じファイルを読む |
| 複数の Claude Code セッションでの分担 | 使った | 実装：`claude/peaceful-johnson-5z0crp`／動画：`claude/awesome-allen-q77y7j`。動画だけのコミット14件を main にまとめた（マージ 253b719、`docs/MERGE_PREP.md`） | 設計と指示書は claude.ai の Claude（`docs/HANDOFF_*.md`、`docs/IMPL_REVIEW_*.md` ほか）。3者の分担 |
| ヘッドレスブラウザでの自動プレイと目視 | 使った | `scripts/playthrough.cjs`、`scripts/acceptance.cjs`、`scripts/switch_test.cjs` | 毎回スクショを撮り、コンソールのエラーと 5xx を拾う |

---

## 3. 仕組みの事実

| 項目 | 使ったか | どこで | 一言 |
|---|---|---|---|
| 計算エンジン（金額・日数・面積・ローン・工程） | ある | `src/engine/engine.js`（550行、engine-0.5）。見積 `quote`（214行）、ローン `loanCheck`（36行）、工程 `schedule`（254行）、分岐 `choose`（326行）、1年後 `outcome`（443行）、Claude に渡す道具 `TOOLS`（383行） | 数字はすべてここから |
| Claude が数字を作らない保証 | ある | 1-3 の検査（`hasDigits`・`newNumbers`・`checkRep`）と、枠の差し込み（`fillSlots`）。読み替えの道具は「仮に当てた差」をエンジンが返す（`src/engine/engine.js:383-386`） | Claude は言葉と選択だけを返し、数字の入った文は差し戻す |
| 出来事の記録（イベントソーシング） | ある | `src/web/main.js:31`（LOG）、`:45`（`apply`）、`:173-181`（`emit`：記録して当てて描く）、保存 `src/worker.js:455-463`（`/api/log`、60日） | 再生（`?replay=記録ID`）は同じ出来事を当て直すだけで、Claude は呼ばない（`src/web/main.js:3`）。Claude の入力・出力の全文・モデル名・プロンプトの版も出来事に残る（`src/ai.js:1-2`、`:56`） |
| スナップショット | 一部 | 保存の口は `state` を受けられる（`src/worker.js:459`）が、画面からは出来事の列だけを送っている（`src/web/main.js:190`）。分かれ道では世界の写しを作る（`forkWorld`、`src/engine/engine.js`） | 「出来事＋スナップショット」と言い切るのは避けたほうがよい |
| テスト | 15件すべて通る | `test/engine.test.js`、`npm test`（11/6 未明に実行：pass 15／fail 0） | ほかに通しの自動プレイ（`scripts/playthrough.cjs` ほか） |
| 公開の構成 | ある | Cloudflare Workers（`wrangler.toml:1-11`：1つの Worker で画面と `/api/*`）、KV（記録・数え上げ）、Durable Objects（スマホ連携 `PhoneLink`、数え上げ `Meter`） | — |
| API キーがブラウザに出ない | ある | キーは Worker の秘密 `ANTHROPIC_API_KEY`（`src/ai.js:37-39`）。`src/web/` にキーの参照はない（grep で0件） | ブラウザは `/api/ai/*` を呼ぶだけ |
| 1人あたりの回数制限 | ある | `src/worker.js:41-56`（`guard`）、`wrangler.toml:26-28`：1つの IP で1日6プレイ・120回、全体で1日4,000回 | 超えたら代わりの文で返す |
| 費用の上限 | ある | `wrangler.toml:31-32`（1日25ドル・全体150ドル）、`src/worker.js:51-52`、研修 `:503`。緊急停止 `EMERGENCY_STOP`（`:42`） | 11/6 未明の `/api/health`：累計 約50.6ドル |
| 担当者の研修 | ある | `docs/REP_TRAINING_LOG.md`（`tools/rep_training/make_log.py` で作り直せる）、`tools/rep_training/train.mjs`、推移の図 `docs/devlog/rep_training.svg`。生の記録（会話1本ずつのJSON、モデル名つき）は `data/training/runs/round1〜9`（11/6 に人間の指示でリポジトリに入れた） | 9回、会話496本（1〜5回目は各48本、6〜9回目は各64本）、お客さま役10人（`data/training/customers.json`：初めの8人＋6回目から値下げを迫る人・役を壊す人）、合計40.14ドル |
| 研修の評価の項目 | ある | `data/training/rubric.json`：コードで数える5項目（発言の長さ・質問は1つ・枠の外の数字・聞き直し・ほかの会社の言葉）＋審査役の6項目（尋問っぽさ・答えたか・預け方・会社らしさ・前に進んだか・分かってもらえた感） | — |
| 研修の前後の数字 | ある | `docs/REP_TRAINING_LOG.md` の表 | 決まり文句に落ちた発言 92/281 → 5/377（途中の最小は7回目の0/373）。答えたか 1.69 → 2.67。預け方 2.02 → 3.12。前に進んだか 1.53 → 2.55。合格（6項目すべて）は0〜4%で雑音の範囲 |

注意：依頼の「答えたか 1.58→2.67」の 1.58 は、11/5 01:21 の devlog（5回目までの集計）の値。いまの研修の記録（審査役の採点がそろった会話だけで集計し直した版）では1回目は1.69。動画と提出フォームでは `docs/REP_TRAINING_LOG.md` の値（1.69 → 2.67）にそろえるのがよい。「92→2」も5回目の値で、9回目は5。

---

## 4. 試行錯誤の量

| 項目 | 使ったか | どこで | 一言 |
|---|---|---|---|
| 期間中のコミット数 | 数えた | `git rev-list --count --since="2026-11-02 12:00 +0900" origin/main` | 101件（main＝作業ブランチ）。内訳：動画のブランチに分かれる前の共通53、実装だけ30、動画だけ14、マージ1、マージ後3 |
| 最初と最後のコミット | 数えた | `git log origin/main` | 最初 2026-11-04 12:28 JST（fcbd793：11/2〜11/4 に claude.ai で作った試作・設計・エンジンの試作の取り込み）、最後 2026-11-05 17:57 JST（429e080。この文書のコミットより前） |
| 11/2〜11/4 朝の claude.ai での作業 | コミットとしては未確認 | `docs/devlog.md` の表（11/2〜11/4 の行）、`prototypes/` | 取り込みのコミットにまとまっていて、作業の回数は数えられない |
| docs/ の設計書・指示書 | 数えた | `git ls-files docs` | Markdown 36本・約35万字（研修の記録 `REP_TRAINING_LOG.md` の約218万字は、会話の全文を書き出したものなので除く。含めると約253万字）。ほかに `video/` の Markdown 10本・約6万字 |
| プロンプト | 数えた | `prompts/*.md` 8本・約1.7万字 | 版：trade-v3、hearing-v3、report-v4、planner-v5、entry-v2、myai-v2、partner-v2、staff16-v1。担当者のハーネスは v1 → v7 |
| 作り直した主な画面・仕組み（指示書の版） | 数えた | `docs/` と `design/v3/` | 流れ（FLOW_v3）、ヒアリング（HEARING_v2）、レポート（REPORT_v2：印刷を4ページで作り直し）、情報収集（INFO_GATHER_v2 → v3）、画面の案（design/v3、UI_FEEDBACK_v4）、攻めのレビュー（REVIEW_attack_v2）、実装レビュー（IMPL_REVIEW_1・2）、エンジン（engine-0.5）。指示書の名前に版がある主なものは8系統 |
| コードの量 | 数えた | `src/` `app/` `scripts/` `tools/` `test/` の js・html・css・py | 約7,400行 |
| 本番の記録で残った費用 | 数えた | `/api/health` | 累計 約50.6ドル（研修を含む） |

---

## 5. 動画や提出フォームで言ってよい一文（候補）

1. 金額・日数・ローンは、すべて計算エンジンが出します。Claude は言葉だけを返し、数字の入った文はコードが差し戻します。
2. 担当者・設計担当・パートナー・レポートなど、役割ごとに Claude のモデルを使い分けています（設計担当は上位のモデルに道具を持たせ、選ばなかった15の世界のひとことは軽量のモデル）。
3. 住宅会社の担当者は、お客さま役と審査役も Claude にした研修を9回、496の会話で重ね、決まり文句に落ちた発言を 92 から一桁に減らしました。
4. 1回のプレイは出来事としてすべて記録され、同じ記録から何度でも再生できます。Claude の入力と出力、プロンプトの版も残ります。
5. 開発では、実装と動画の Claude Code を分け、監査とレビューは、実装していない別のエージェントにスキルの手順書で行わせました。
