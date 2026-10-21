// lexicon_kou.mjs — コウさん版の辞書 (LEXICON_KOU) が語の唯一の出どころであることの検査 (2026-10-21)
// 正本 = OnomatoiCore/Data/lexicon_kou.json (tools/sync_lexicon.py が html の `// <lexicon-kou>` の間へ書き出す)。
// 辞書の語を 1 つ書き換えたら、*_VOCAB・仮名の表・族の語・砂時計の語がそれに従って変わる (コードに語が残っていない) ことを固定する。
// 実行: node test/lexicon_kou.mjs
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML_PATH = path.resolve(__dirname, "../iceface_onomatoi.html");
const IMPURE = /\b(document|localStorage|sessionStorage|window|navigator|AudioContext|audioCtx|fetch\(|canvas|cctx|location|alert\(|requestAnimationFrame|history)\b/;

function extractEngine(html) {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const src = scripts.sort((a, b) => b.length - a.length)[0];
  const blocks = [];
  const lines = src.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^(function\s+\w|const\s+\w|let\s+\w)/.test(line)) {
      const start = i;
      const isFunc = line.startsWith("function");
      let depth = 0, inS = null, inLC = false, inBC = false, tplBrace = [];
      let end = -1;
      outer:
      for (let j = i; j < lines.length; j++) {
        const l = lines[j];
        for (let k = 0; k < l.length; k++) {
          const c = l[k], p = k > 0 ? l[k - 1] : "";
          if (inLC) break;
          if (inBC) { if (p === "*" && c === "/") inBC = false; continue; }
          if (inS) {
            if (c === "\\") { k++; continue; }
            if (inS === "`" && c === "$" && l[k + 1] === "{") { tplBrace.push(depth); inS = null; k++; depth++; continue; }
            if (c === inS) inS = null;
            continue;
          }
          if (c === "/" && l[k + 1] === "/") { inLC = true; continue; }
          if (c === "/" && l[k + 1] === "*") { inBC = true; k++; continue; }
          if (c === '"' || c === "'" || c === "`") { inS = c; continue; }
          if (c === "{" || c === "(" || c === "[") { depth++; continue; }
          if (c === "}" || c === ")" || c === "]") {
            depth--;
            if (tplBrace.length && depth === tplBrace[tplBrace.length - 1]) { tplBrace.pop(); inS = "`"; }
            continue;
          }
          if (!isFunc && c === ";" && depth === 0) { end = j; break outer; }
        }
        inLC = false;
        if (isFunc && depth === 0 && j > i) {
          if (/\}/.test(lines.slice(i, j + 1).join("\n"))) { end = j; break; }
        }
        if (isFunc && depth === 0 && j === i && /\{[\s\S]*\}\s*$/.test(line)) { end = j; break; }
      }
      if (end < 0) end = i;
      blocks.push(lines.slice(start, end + 1).join("\n"));
      i = end + 1;
      continue;
    }
    i++;
  }
  return blocks.filter(b => !IMPURE.test(b)).join("\n\n");
}

const html = fs.readFileSync(HTML_PATH, "utf8");
const NAMES = ["LEXICON_KOU", "CIRCLE_VOCAB", "SHARPNESS_VOCAB", "LEGISLATED_DISPLAY", "SHAPE_PROTOTYPE_VOCAB",
  "familyWord", "crossedQuadrilateralVocabWord"];
function load(source) {
  const ctx = vm.createContext({ console });
  vm.runInNewContext(extractEngine(source) + `\n;globalThis.__api = { ${NAMES.join(", ")} };`, ctx, { filename: "engine(extracted)" });
  return ctx.__api;
}

let pass = 0, fail = 0;
function check(name, cond, detail = "") {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }
}

// 印の間に辞書が 1 行ある
const m = html.match(/\/\/ <lexicon-kou>\n[^\n]*\nconst LEXICON_KOU = (\{.*\});\n\/\/ <\/lexicon-kou>\n/);
check("html に // <lexicon-kou> 〜 // </lexicon-kou> の辞書がある", !!m);
const base = load(html);
check("辞書の版", base.LEXICON_KOU.lex === "kou-2026-10", base.LEXICON_KOU.lex);

// 辞書の語を書き換えた html を作って、同じ抽出で評価し直す
function mutated(from, to) {
  check(`書き換え対象がある: ${from}`, html.split(from).length === 2, `${html.split(from).length - 1} 箇所`);
  return load(html.replace(from, to));
}
{
  const a = mutated('{"romaji":"aaaan","display":null}', '{"romaji":"aaaaan","display":null}');
  check("円(大) を書き換える → CIRCLE_VOCAB が変わる", a.CIRCLE_VOCAB.join() === "oon,aoon,aaaaan", a.CIRCLE_VOCAB.join());
  check("書き換えていない円(小) は動かない", a.CIRCLE_VOCAB[0] === base.CIRCLE_VOCAB[0]);
}
{
  const a = mutated('"leaf":{"center":{"romaji":"keen","display":"けーん"}', '"leaf":{"center":{"romaji":"keeen","display":"けーーん"}');
  check("葉(中心形) を書き換える → 語の一覧と仮名の表が変わる",
    a.SHAPE_PROTOTYPE_VOCAB.leaf[2] === "keeen" && a.LEGISLATED_DISPLAY.keeen === "けーーん" && a.LEGISLATED_DISPLAY.keen === undefined);
}
{
  const a = mutated('"waveCrest":{"romaji":"nyu","display":"にゅ"}', '"waveCrest":{"romaji":"nyuu","display":"にゅう"}');
  const w = a.familyWord({ kind: "wave", crests: [true, false, true] });
  check("波の山を書き換える → 族の語が変わる", w.romaji === "nyuumonyuu" && w.display === "にゅうもにゅう", JSON.stringify(w));
}
{
  const a = mutated('"loopRow":{"romaji":"muu","display":"むう"}', '"loopRow":{"romaji":"muuu","display":"むうう"}');
  const w = a.familyWord({ kind: "loopRow", count: 2 });
  check("並ぶ輪を書き換える → 族の語が変わる", w.romaji === "muuumuuu" && w.display === "むううむうう", JSON.stringify(w));
}
{
  const a = mutated('"hourglass":{"center":{"romaji":"gyogyaQgyagyo"', '"hourglass":{"center":{"romaji":"gyogyaQgyagyoo"');
  check("砂時計(中心形) を書き換える → crossedQuadrilateralVocabWord が変わる",
    a.crossedQuadrilateralVocabWord({ kind: "hourglass", level: 3 }) === "gyogyaQgyagyoo"
    && a.crossedQuadrilateralVocabWord({ kind: "hourglass", level: 2 }) === base.crossedQuadrilateralVocabWord({ kind: "hourglass", level: 2 }));
}
{
  const a = mutated('"6":[{"romaji":"chiQ","display":"ちっ"}', '"6":[{"romaji":"chiQ","display":"ちっっ"}');
  check("角度の語(stage 6・小) の仮名を書き換える → SHARPNESS_VOCAB が変わる", a.SHARPNESS_VOCAB[6][0][1] === "ちっっ", a.SHARPNESS_VOCAB[6][0][1]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
