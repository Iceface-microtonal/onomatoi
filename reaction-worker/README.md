# 一筆へのひとこと API

`onomatoi.com` の一筆から生まれた表示語と6軸・形の特徴を GPT-6 Luna に送る Cloudflare Worker。画像・描線座標・音声は送らない。API キーは Worker の Secret `OPENAI_API_KEY` にだけ置く。

```sh
npm ci
npm run deploy
security find-generic-password -a "$USER" -s com.puppetwin.onomatoi-reaction -w | npx wrangler secret put OPENAI_API_KEY
```

Secret の登録は Worker を再配信する。登録前は `/api/reaction/status` が `unavailable` を返す。公開ページからの呼び出しだけに CORS を許可し、1 IP あたり20回/日、全体300回/日を UTC 日付で制限する。Origin は偽装できるため、費用上限は Durable Object の回数制限で管理する。

「音の地図の視点を加える」は初期状態でオフ。オンの場合、Worker は非公開 Secret `SOUND_MAP_JSON` から表示語の音を最大2つ選び、その短い説明だけを Luna に渡す。資料の PDF と対応表はリポジトリに置かない。Secret の形式は単音のかなをキー、短い説明を値にした JSON オブジェクト。管理者が非公開ファイルから登録する:

```sh
npx wrangler secret put SOUND_MAP_JSON < /path/to/private-sound-map.json
```

返答画面には使った音の説明を表示するため、選ばれた説明は閲覧者にも見える。未定義の音は解釈せず、対応する音がないときは素朴版で返す。Secret がないときは音の地図モードだけ 503 になる。PDF 全文、描線の座標、音声は送らず、Luna の返答ログは保存しない。
