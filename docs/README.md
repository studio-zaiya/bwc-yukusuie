# 文書の入口

ゆくすいえ　YUKUSUIE: 16 unbuilt futures の設計・指示・記録の文書です。期間中（2026-11-02〜11-08）に、人間と claude.ai の Claude と Claude Code が書きました。

## まず読むもの

| 文書 | 中身 |
|---|---|
| [`handoff.md`](handoff.md) | 引き継ぎ書。作品の骨格と決まりの正（食い違いがあれば、これを優先） |
| [`TECH_FACTS.md`](TECH_FACTS.md) | 技術の裏付け。役割ごとのモデル、Claude が数字を作らない仕組み、記録と再生、回数と費用の上限、研修、量の数え方（どこに書いてあるかの行つき） |
| [`REP_TRAINING_LOG.md`](REP_TRAINING_LOG.md) | 担当者の研修の記録。Claude どうしのロールプレイ9回・496本の会話の推移と全文（生の記録は `data/training/runs/`） |
| [`devshots/`](devshots/) | 開発中の画面の写真（人間がスマホとパソコンで撮った作業の記録） |
| [`JUDGING.md`](JUDGING.md) | 主催者の審査基準とテーマの原文（動画・README の点検に使った） |

## 文書の並び
- **指示書と設計**：`CLAUDE_CODE_BRIEF.md`（最初の実装の指示）、`07_process_and_roles.md`（家づくりの手順とAIの役割）、`06_engine.md`（計算エンジン）、`FLOW_v3.md`・`HEARING_v2.md`・`REPORT_v2.md`・`INFO_GATHER_v3.md`・`WORLD_SWITCH.md`・`UI_NAV_SYSTEM.md`・`LAYOUT_RULES_v1.md`（作り直した画面と仕組み。名前の v は版）
- **レビューと監査**：`IMPL_REVIEW_1.md`・`IMPL_REVIEW_2.md`（外部と人間のレビュー）、`REVIEW_attack_v2.md`（攻めのレビュー）、`AUDIT_1105.md`（4つの監査）、`PROMISE_LEDGER.md`（動画・説明と実機の約束の表）、`SECURITY_CHECK_1108.md`（提出前の安全確認）
- **記録**：`devlog.md`（開発記録。日時・頼んだこと・結果・テスト）、`questions.md`（人間への質問と回答）、`REC_HANDOFF_1105.md`（実機の録画の引き継ぎ）、`MERGE_PREP.md`（ブランチのまとめ）
- **研修**：`REP_TRAINING.md`（手順）、`REP_TRAINING_NEXT.md`（次の回への指示）、`REP_TRAINING_LOG.md`（記録）
- **試作と見本**：`layout_proto/`（間取りの絵の試作）、`devlog/`（開発中の画面と研修の推移の図）

文書の発案元は【人間】【Claude】【レビュー】で書き分けています。動画の構成と字幕の記録は `video/` にあります。
