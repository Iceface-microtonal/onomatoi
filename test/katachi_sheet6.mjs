// katachi_sheet6.mjs — コウさん確認 第6回 (かたちの型と語・2026-11-02 回答 3 問とも「はい」・Core KatachiSheet6Tests と同じ形と語)
// Q2: 縦長の楕円・卵は しずくの語族 (しずく = く・卵 = ぬ・楕円 = る)、大きさで くおん → くおーん → くおおーん。横長の楕円は今のまま。
// Q3: 線の途中のくるん = むう → むーうー → むーうーうー (大きさ)。V の先端のはね返りの輪は くるん にしない。
// 実行: node test/katachi_sheet6.mjs
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

const EXPORTS = ["interpretStroke", "scaleFreeInk", "namingKanaOf", "arcSizeClass", "ovalDropletLevel", "dropletSized", "familyWord", "LEXICON_KOU", "romajiOf"];
const ctx = vm.createContext({ console });
vm.runInNewContext(extractEngine(fs.readFileSync(HTML_PATH, "utf8")) + `\n;globalThis.__api = { ${EXPORTS.join(", ")} };`, ctx, { filename: "engine(extracted)" });
const api = ctx.__api;
for (const name of ["interpretStroke", "scaleFreeInk", "namingKanaOf", "arcSizeClass", "ovalDropletLevel", "dropletSized"])
  if (typeof api[name] !== "function") throw new Error(`engine 抽出失敗: ${name}`);

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => { if (cond) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); } };
const W = 1000, H = 561;
function read(raw) {
  const free = api.scaleFreeInk(raw, W, H);
  const r = api.interpretStroke(free.points, free.w, free.h, { coarse: true, hc: 0, language: "ja" });
  return { r, word: r.event.displayWordOverride ?? api.namingKanaOf(r.event.moras), romaji: api.romajiOf(r.event),
           size: api.arcSizeClass(free.points, free.w, free.h), level: api.ovalDropletLevel(r.cx, free.points) };
}
// 楕円 (rx・ry)。k > 0 で下が太い卵 (y は下向き)
const oval = (rx, ry, k = 0) => Array.from({ length: 97 }, (_, i) => {
  const t = -Math.PI / 2 + i / 96 * 2 * Math.PI;
  return { x: 500 + rx * Math.cos(t) * (1 + k * Math.sin(t)), y: 280 + ry * Math.sin(t) };
});
// 一巻きのトロコイド (線の途中に輪が 1 つ)・横幅 w
function kurun(w) {
  const raw = Array.from({ length: 161 }, (_, i) => { const t = -Math.PI + 2 * Math.PI * i / 160; return [t - 2.4 * Math.sin(t), -2.4 * Math.cos(t)]; });
  const xs = raw.map(p => p[0]), mn = Math.min(...xs), s = w / (Math.max(...xs) - mn);
  return raw.map(([x, y]) => ({ x: 500 - w / 2 + (x - mn) * s, y: 300 + y * s }));
}

console.log("── Q2 縦長の楕円 = しずくの語族の外縁 (る)・大きさで 3 段 ──");
{
  const sizes = new Set();
  for (const sc of [0.35, 1.0, 2.0]) {
    const x = read(oval(100 * sc, 170 * sc));
    sizes.add(x.size);
    check(`楕円 ×${sc} → ${["るおん", "るおーん", "るおおーん"][x.size]}`, x.romaji === ["ruon", "ruoon", "ruooon"][x.size] && x.word === ["るおん", "るおーん", "るおおーん"][x.size], `${x.word} (${x.romaji}・大きさ ${x.size})`);
  }
  check("小・中・大がそろう", sizes.size === 3, [...sizes].join(","));
}
console.log("── Q2 卵: しずくと認識 = く・認識されない卵 = ぬ・楕円 = る・横長と円は外 ──");
{
  const d = read(oval(100, 200, 0.45));
  check("しずくに近い卵 → く の語", d.romaji === ["kuon", "kuoon", "kuooon"][d.size], `${d.word}`);
  check("卵の段 = 近傍 (ぬ)", read(oval(120, 190, 0.5)).level === 2, String(read(oval(120, 190, 0.5)).level));
  check("楕円の段 = 外縁 (る)", read(oval(100, 170)).level === 1, String(read(oval(100, 170)).level));
  check("横長の楕円は外", read(oval(170, 106)).level == null);
  check("円は外", read(oval(150, 150)).level == null);
  for (const [name, pts] of [["横長の楕円", oval(170, 106)], ["円", oval(150, 150)]]) {
    const x = read(pts);
    check(`${name} はしずくの語にしない`, !/^(ku|nu|ru)o+n$/.test(x.romaji), `${x.word}`);
  }
}
console.log("── Q3 くるん = むう → むーうー → むーうーうー ──");
{
  const sizes = new Set();
  for (const w of [180, 420, 800]) {
    const x = read(kurun(w));
    sizes.add(x.size);
    check(`くるん 幅 ${w} → ${["むう", "むーうー", "むーうーうー"][x.size]}`, x.word === ["むう", "むーうー", "むーうーうー"][x.size] && x.r.route === "family", `${x.word}/${x.r.route}`);
  }
  check("小・中・大がそろう", sizes.size === 3, [...sizes].join(","));
}
console.log("── 辞書と大きさの段 ──");
check("辞書の くるん = むう / むーうー / むーうーうー", api.LEXICON_KOU.family.kurun.map(w => w.display).join("/") === "むう/むーうー/むーうーうー");
check("くおーん の小 = くおん", api.dropletSized({ romaji: "kuoon", display: "くおーん" }, 0).display === "くおん");
check("くおーん の大 = くおおーん", api.dropletSized({ romaji: "kuoon", display: "くおーん" }, 2).romaji === "kuooon");
check("語末が おーん でない語はそのまま", api.dropletSized({ romaji: "piyo", display: "ぴよ" }, 2).romaji === "piyo");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
