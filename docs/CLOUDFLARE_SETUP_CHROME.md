# Cloudflare と Anthropic Console の設定指示書（Claude in Chrome 用）

作成：2026-11-04 昼（Claude）。人間はCloudflareにログイン済みで、Workers Paid Plan に加入済み【人間】。

## 方針【Claude】
- 設定のほとんどは、Claude Code が `wrangler` コマンドで行う（KVの作成、デプロイ、シークレットの登録）。ブラウザで行うのは、ダッシュボードでしかできないことだけにする
- **APIキーやトークンの値を、Claude in Chrome に読ませたり、コピーさせたりしない。** キーの作成と貼り付けは人間が行う
- 料金に関わる変更（プランの変更・購入）はしない。表示を確かめるだけ

## Claude in Chrome に頼むこと（この順で）

### 1. workers.dev のサブドメインを確かめる
- Cloudflare のダッシュボード → Workers & Pages → 右側の「Subdomain」の表示を確認
- サブドメインが個人名やハンドルなら、人間に伝えて、変更するかどうかを聞く（変更は人間の確認後に行う）
- 候補：`yukusuie` など、作品名か中立な名前

### 2. プランの確認
- Workers & Pages の「Plans」で、Workers Paid になっていることを確認するだけ。変更はしない

### 3. （任意）独自ドメインは使わない
- 提出版は workers.dev のURLで出す。ドメインの購入や設定はしない

### 4. Anthropic Console（console.anthropic.com）
- ハッカソンで支給されたクレジットの組織が選ばれていることを確認する
- **使用額の上限（Spend limit）** を、提出後の審査期間まで持つ額に設定するよう、人間に提案する（設定は人間が確認してから）
- APIキーの作成画面までは案内してよいが、キーの作成・表示・コピーは人間が行う
  - キーは Claude Code の `wrangler secret put ANTHROPIC_API_KEY` で、人間が貼り付ける

### 5. 終わったら
- 確かめた内容（サブドメイン名、プラン、上限の設定の有無）を、短い箇条書きで報告する
- 画面のスクショは、キーや個人情報が映っていないものだけ保存する

## Claude Code が行うこと（参考）
- `wrangler login`（人間のブラウザで許可）
- `wrangler kv namespace create YUKU_STORE` と、`wrangler.toml` への追記
- `wrangler secret put ANTHROPIC_API_KEY`（値は人間が貼る）
- `wrangler deploy` と、公開URLでの確認
- 回数制限の設定（Workers の Rate Limiting の仕組み、またはKVの数え上げ）
