# AGENTS.md — Onomatoi Web (project rules for coding agents)

2026-09-19 制定。このファイルは入口 (ポインタ集)。設計の本文は `README.md`。
公開 repo なので**簡素に保つ**: 設計の議論・作業記録・個人環境の絶対パスはここに書かない (repo 外の私本 doc へ)。
CLAUDE.md は置かない (両方あると読み手ごとに正本が割れる)。

## 1. これは何か

Onomatoi (描いた形を音象徴 + 口の形として読み、日本語に似た架空のことばで発声する作品) の
**自己完結した Web 版**。ネイティブ実装 (OnomatoiCore) からの移植で、このフォルダ単体で動く。
公開先: https://onomatoi.com/ (静的ホスティング・`CNAME`)。作者名義は **PuppeTwin**。

## 2. 正本の所在

| 何を | どこ |
|---|---|
| 機能・使い方・現行版と旧版の差・フィードバック形式 (`FB_VERSION`) | `README.md` |
| エンジン本体 (音声生成・描線判定) | `iceface_onomatoi.html` 内の `<script>` (**唯一の実装**。`web-play.js` / `web-play.css` は表示・操作専用) |
| 音声の同期 (iOS base → `ConsonantsOnomatoi/`) | `scripts/sync_ios_base_voice.py` (冒頭コメント。Web の音声は iOS 版 base の録音だけから作る・継続撥音 `v_<v>_nn` も wav のまま同期しベイクはしない) |
| 音声の監査記録 | `test/WEB_AUDIO_AUDIT_2026-09-12.md` |
| 文法の性質テストの仕様・fixture | `test/kou_properties.mjs` 冒頭コメント (仕様と fixture は隣の `Onomatoi` repo にある) |
| ネイティブ側の規則 (音声フォーマット・Family 配布・言語の統治) | 隣の `../Onomatoi/AGENTS.md` (非公開 repo) |

## 3. 動かし方・合格ゲート

```sh
python3 -m http.server 8765        # mp3 を fetch するため file:// 直開きは不可 → http://localhost:8765/
node test/closed_form.mjs          # ほかも「0 failed」で合格
node test/naming_placement.mjs
node test/native_voice.mjs
node test/symbol_vocab.mjs         # golden の作り直しは Onomatoi/docs/WEB_DRAWING_PARITY_AUDIT_2026-09-12.md
node test/feedback_worker.mjs      # 「送る」の受け口 (Worker) の検査とメール本文
node test/audio_session.mjs
node test/reaction_modes.mjs
node test/reaction_native_access.mjs
node test/reaction_sound_map.mjs
node test/kou_properties.mjs       # 幾何 + regression が green であること (target は進捗指標・落ちてよい)
node test/stroke_parity.mjs        # 一筆→語 のネイティブ一致 (語の不一致 0・fixture は隣の非公開 repo `../Onomatoi Film/parity/`)
node test/family_rules.mjs
node test/ng_reroll.mjs
node test/loop_gate.mjs
node test/zigzag_family.mjs
node test/katachi_sheet6.mjs
node test/why_reasons.mjs          # 「なぜ?」の文の golden。語の規則を変えたら --diff で前後を確かめてから --write
node test/twins.mjs
node test/lexicon_kou.mjs          # 語の出どころは辞書 (LEXICON_KOU) だけ・書き換えると語が変わる
node test/kana_input.mjs
node test/lexicon_switch.mjs
node test/web_parity.mjs           # iOS の参照音 (test/parity_out/native) と比べて「比較 N / 合格 N」が等しいこと
```

(この一覧が合格ゲート・2026-11-02 に全部合格)。テストは HTML から純粋なエンジン宣言を自動抽出して `vm` で評価する
— **DOM / audio / storage に触れる関数をエンジン宣言に混ぜると抽出が壊れる**。
**テストが通っても実聴合格ではない。** 聴感の判定は作者だけが行う。

## 4. 音声資産の規則

- 読出し先は `ConsonantsOnomatoi/` (現行版・通常音声は 80kbps mp3、接合に使う diph と伸ばしは wav)。`Consonants/` は旧版 (2026-06-22 アーカイブ) で触らない。
- マスターはネイティブ側 (`../Onomatoi/Resources/Consonants*`・mono/48k/16bit wav)。Web へは**変換して持ち込む**:
  `python3 scripts/sync_ios_base_voice.py` (`--only <名前>` で 1 本・`--check` で差分だけ)。継続撥音 `v_<v>_nn` も
  wav のまま同期する (頭の母音を切る位置を音量で決めるので mp3 にしない)。録音を同期したら `test/parity_out/native` も作り直す。
- ファイル名がローダのキー。`のコピー` / 連番付き / 別拡張子は読まれない。
- 置換は事前に現物を控えてから。差し替え後は `node test/native_voice.mjs` と実聴。

## 5. 境界 (踏み越えない)

- **LICENSE ファイルが無いのは意図的** (all rights reserved)。足さない。
- 👍👎 の投票は localStorage のみ。`FEEDBACK_ENDPOINT` を勝手に設定して外部送信を有効にしない。
- ストアへの架空リンク・準備中機能の実在を装う表示を置かない。
- 語形・言い直し・語の美学 (慣習層) は言語の権威 (調音設計パートナー) の領分。エンジンの規則を変えるときは性質テストを先に足す。
- `iceface_onomatopian.html` / `about.html` / `Consonants/` (旧版) は更新しない。
- commit / push / 公開は明示指示があるときだけ。**公開コミットのメッセージは簡素に** (設計語りは入れない)。
- 作業ツリーに他の作業の未コミット差分が同居することがある。**commit は自分の差分だけ** (`git add <path>` / `git apply --cached`)。他の差分は触らない・混ぜない。
