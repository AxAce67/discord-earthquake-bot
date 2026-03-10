# discord-earthquake-bot

Discord 向けの地震通知 bot です。P2PQuake のリアルタイム情報を一次ソースにし、同じ地震については 1 つの通知メッセージを更新し続けます。

## できること

- 地震速報の即時通知
- 同一地震の重複通知抑止
- 詳細情報への後追い更新
- Yahoo 地震ページからの補助画像取得
- Yahoo 地震画像の短時間集中監視
- Slash コマンドだけで通知設定を管理

## セットアップ

```bash
npm install
cp .env.example .env
npm run register:commands
npm run dev
```

### 調査モード

P2PQuake の受信イベントを広く観測したいときは、`.env` で `P2PQUAKE_LOG_INCOMING=true` を設定すると、受信した `code` と `issue.type` をログ出力できます。

### Yahoo 画像監視

Yahoo 地震画像は検知後すぐに公開されないことがあるため、`.env` の `YAHOO_IMAGE_RETRY_DELAYS_MS` に従って短時間だけ再試行します。既定では、発生直後は細かく、その後は間隔を広げながら約 2 分間追跡します。

## Slash コマンド

- `/quake setup`
- `/quake disable`
- `/quake status`
- `/quake test`
- `/quake latest`
