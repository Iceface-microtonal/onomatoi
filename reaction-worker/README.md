# 一筆へのひとこと API

`onomatoi.com` の一筆から生まれた表示語と6軸・形の特徴を GPT-6 Luna に送る Cloudflare Worker。画像・描線座標・音声は送らない。API キーは Worker の Secret `OPENAI_API_KEY` にだけ置く。

```sh
npm ci
npm run deploy
security find-generic-password -a "$USER" -s com.puppetwin.onomatoi-reaction -w | npx wrangler secret put OPENAI_API_KEY
```

Secret の登録は Worker を再配信する。登録前は `/api/reaction/status` が `unavailable` を返す。公開ページからの呼び出しだけに CORS を許可し、1 IP あたり20回/日、全体300回/日を UTC 日付で制限する。Origin は偽装できるため、費用上限は Durable Object の回数制限で管理する。
