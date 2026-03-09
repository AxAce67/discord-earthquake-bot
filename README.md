# discord-earthquake-bot

Discord 向けの地震通知 bot です。P2PQuake のリアルタイム情報を一次ソースにし、同じ地震については 1 つの通知メッセージを更新し続けます。

## できること

- 地震速報の即時通知
- 同一地震の重複通知抑止
- 詳細情報への後追い更新
- Yahoo 地震ページからの補助画像取得
- Slash コマンドだけで通知設定を管理

## セットアップ

```bash
npm install
cp .env.example .env
npm run register:commands
npm run dev
```

## Slash コマンド

- `/quake setup`
- `/quake disable`
- `/quake status`
- `/quake test`
- `/quake latest`
