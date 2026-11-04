# 人間に決めてもらうこと（区切りで聞く）

作成：Claude Code。

1. **Cloudflare への接続**：この作業環境から `api.cloudflare.com` への接続が拒否されている。環境の設定（Network access）で許可が要る。許可が出るまではローカルで進める
2. **Anthropic の APIキー**：`wrangler secret put ANTHROPIC_API_KEY` で登録（値は人間が貼る）。登録までは「代わりの処理」で動く
3. **クレジットの額**：`TOTAL_BUDGET_USD`（累計の上限）を決めるため（docs/08_cost.md）
4. **workers.dev のサブドメイン**：中立な名前か（例：yukusuie）
5. **担当者のモデル**：Haiku 5.5 に下げた（費用のため）。テストプレイで口調が物足りなければ Sonnet 5.5 に戻す
6. **コミットの作者のメール**：`studio-zaiya@users.noreply.github.com`（組織名の形）にしている
