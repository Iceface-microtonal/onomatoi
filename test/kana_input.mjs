// kana_input.mjs — dev の文字入力欄 (?dev=1) のかな → ローマ字 (nvKanaToRomajiTokens・2026-10-19)
//
// 結果のかな表記 (NAMING_KANA_ROWS) を逆に引くので、画面に出た語を貼れば同じモーラ列で鳴る。
// 確かめること: (1) 表の全マスのうち parseMora で戻るものは往復する (2) っ ん ー・カタカナ・小さいかなの音節
// (3) エンジンが鳴らせない音節は鳴らさずに知らせる。
//
// 実行: node test/kana_input.mjs

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const harness = fs.readFileSync(path.resolve(__dirname, "stroke_parity.mjs"), "utf8");
const extract = vm.runInNewContext(harness.match(/^const IMPURE = .+;$/m)[0] + "\n"
  + harness.match(/function extractEngine\(html\) \{[\s\S]*?\n\}/)[0] + "\nextractEngine");
const ctx = vm.createContext({ console });
vm.runInContext(extract(fs.readFileSync(path.resolve(__dirname, "../iceface_onomatoi.html"), "utf8"))
  + "\n;this.api = { nvKanaToRomajiTokens, parseMora, NAMING_KANA_ROWS, namingKanaOf };", ctx);
const { nvKanaToRomajiTokens, parseMora, NAMING_KANA_ROWS } = ctx.api;

let passed = 0, failed = 0;
const check = (ok, label) => { if (ok) passed++; else { failed++; console.log("FAIL", label); } };
const read = w => { const k = nvKanaToRomajiTokens(w); return { t: k.tokens.join(" "), u: k.unknown.join(",") }; };

// (1) 表の往復: 表の先の行が、かな → ローマ字 → parseMora で同じ子音と母音に戻る
const seen = new Set();
for (const [onset, row] of Object.entries(NAMING_KANA_ROWS)) {
  ["a", "i", "u", "e", "o"].forEach((v, k) => {
    const m = parseMora(onset + v, false);
    if (!m || (m.onset ?? "") !== onset || m.nucleus !== v || seen.has(row[k])) return;
    seen.add(row[k]);
    const r = read(row[k]);
    check(r.t === onset + v && r.u === "", `往復 ${row[k]} → ${r.t} (期待 ${onset + v})`);
  });
}
check(seen.size >= 100, `往復できるかなが少なすぎる (${seen.size})`);

// (2) っ ん ー・カタカナ・小さいかなの音節・区切り
for (const [w, want] of [["れっい", "re q i"], ["レッイ", "re q i"], ["ぼーん", "bo o n"], ["かっ", "ka q"],
                         ["しゃっきーん", "sha q ki i n"], ["てぃとぅ", "ti tu"], ["くぃくぉ", "kwi kwo"],
                         ["ぬぬっいやにゃいぬー", "nu nu q i ya nya i nu u"], ["ころ ころ", "ko ro ko ro"]]) {
  const r = read(w);
  check(r.t === want && r.u === "", `${w} → ${r.t} ${r.u} (期待 ${want})`);
}

// (3) 鳴らせない音節は 2 文字ごと知らせ、前の かな に割らない
for (const [w, want, bad] of [["きぇ", "", "きぇ"], ["きぇすぁ", "", "きぇ,すぁ"], ["かきぇ", "ka", "きぇ"], ["x", "", "x"]]) {
  const r = read(w);
  check(r.t === want && r.u === bad, `${w} → [${r.t}] ×[${r.u}] (期待 [${want}] ×[${bad}])`);
}

console.log(`kana_input: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
