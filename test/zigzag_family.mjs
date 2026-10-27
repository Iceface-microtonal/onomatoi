// zigzag_family.mjs — ジグザグの族 (2026-10-26 仮決定 PD-028・Core ZigzagFamilyTests と同じ形)
// 山と谷 (頂) を描いた順に 1 音節: 尖った頂 = コウさんの提案語 digaziba の d → g → z → b を頂の番号で巡回 + 山 い / 谷 あ・
// 丸めた頂 = 波の音 (山 にゅ / 谷 も)・曲線で終わる = いん の着地・角や直線で終わる開いた線に ん を付けない。
// 実行: node test/zigzag_family.mjs
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

const EXPORTS = ["interpretStroke", "scaleFreeInk", "namingKanaOf", "familyMatch", "LEXICON_EMPTY"];
const ctx = vm.createContext({ console });
vm.runInNewContext(extractEngine(fs.readFileSync(HTML_PATH, "utf8")) + `\n;globalThis.__api = { ${EXPORTS.join(", ")} };`, ctx, { filename: "engine(extracted)" });
const api = ctx.__api;
for (const name of EXPORTS) if (api[name] === undefined) throw new Error(`engine 抽出失敗: ${name}`);

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => { if (cond) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); } };
const W = 1000, H = 561;
function run(raw) {
  const free = api.scaleFreeInk(raw, W, H);
  const r = api.interpretStroke(free.points, free.w, free.h, { coarse: true, hc: 0, language: "ja" });
  return { r, word: r.event.displayWordOverride ?? api.namingKanaOf(r.event.moras), pts: free.points, w: free.w, h: free.h };
}

// 頂 n 個のジグザグ (x 200〜800・振幅 amp)。up = 最初の頂が山 (上)・round = 丸める頂の番号 (0 始まり・二次ベジェで前後の辺の中点をつなぐ)
function zig(n, { amp = 90, up = true, round = new Set() } = {}) {
  const V = [];
  for (let i = 0; i <= n + 1; i++) V.push({ x: 200 + 600 * i / (n + 1), y: 280 + (i === 0 || i === n + 1 ? 0 : ((i % 2 === 1) === up ? -amp : amp)) });
  const out = [V[0]];
  const line = (b) => { const a = out[out.length - 1], L = Math.hypot(b.x - a.x, b.y - a.y), k = Math.max(1, Math.ceil(L / 6));
    for (let j = 1; j <= k; j++) out.push({ x: a.x + (b.x - a.x) * j / k, y: a.y + (b.y - a.y) * j / k }); };
  const mid = (p, q) => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
  for (let i = 1; i <= n; i++) {
    if (round.has(i - 1)) {
      const m1 = mid(V[i - 1], V[i]), m2 = mid(V[i], V[i + 1]), c = V[i];
      line(m1);
      for (let j = 1; j <= 20; j++) { const t = j / 20; out.push({ x: (1 - t) ** 2 * m1.x + 2 * (1 - t) * t * c.x + t * t * m2.x, y: (1 - t) ** 2 * m1.y + 2 * (1 - t) * t * c.y + t * t * m2.y }); }
    } else line(V[i]);
  }
  line(V[n + 1]);
  return out;
}

console.log("── ジグザグ = 頂を描いた順に digaziba の子音 + 山 い / 谷 あ (仮決定 PD-028) ──");
const w = (pts, opts) => { const x = opts ? (() => { const free = api.scaleFreeInk(pts, W, H);
  const r = api.interpretStroke(free.points, free.w, free.h, { coarse: true, hc: 0, language: "ja", ...opts });
  return { r, word: r.event.displayWordOverride ?? api.namingKanaOf(r.event.moras) }; })() : run(pts); return x; };
check("頂 3・山から → でぃがじば (コウさんの提案語 digaziba)", w(zig(3)).word === "でぃがじば", w(zig(3)).word);
check("頂 3・谷から → だぎざび (上下の反転で い と あ が入れ替わる)", w(zig(3, { up: false })).word === "だぎざび", w(zig(3, { up: false })).word);
check("頂 5・山から → でぃがじばでぃが", w(zig(5)).word === "でぃがじばでぃが", w(zig(5)).word);
check("2 つ目の頂を丸める → その頂だけ波の音 (でぃもじばでぃが)", w(zig(5, { round: new Set([1]) })).word === "でぃもじばでぃが", w(zig(5, { round: new Set([1]) })).word);
{
  const x = w(zig(5, { round: new Set([4]) }));
  check("最後の頂を丸める (曲線で終わる) → いん の着地 (でぃがじばにゅいいん・い は言い直す)", x.word === "でぃがじばにゅいいん", x.word);
  const ms = x.r.event.moras;
  check("曲線で終わる語は ん で終わり、伸ばした い を持つ (コウさん 👍 gibiin の性質)", ms[ms.length - 1].isN && ms.some(m => m.onset === null && !m.isN && m.nucleus === "i"));
}
for (const [name, pts] of [["頂 3", zig(3)], ["頂 5", zig(5)], ["頂 3 谷から", zig(3, { up: false })]]) {
  const ms = w(pts).r.event.moras;
  check(`${name}: 角で終わる開いた線に ん を付けない (原理 7)`, !ms[ms.length - 1].isN);
}
check("頂 9 → 8 音節で止める (でぃがじばでぃがじば)", w(zig(9, { amp: 70 })).word === "でぃがじばでぃがじば", w(zig(9, { amp: 70 })).word);
check("経路は族の規則 (family)", w(zig(5)).r.route === "family" && api.familyMatch.length >= 2, w(zig(5)).r.route);
check("波 (丸い頂だけ) は波の族のまま (にゅもにゅ)", w(wave3()).word === "にゅもにゅ", w(wave3()).word);
check("族の規則を持たない辞書 (LEXICON_EMPTY) ではジグザグにしない", w(zig(5), { lexicon: api.LEXICON_EMPTY }).r.route !== "family", w(zig(5), { lexicon: api.LEXICON_EMPTY }).r.route);
function wave3() { return Array.from({ length: 241 }, (_, i) => { const t = i / 240; return { x: 200 + 600 * t, y: 280 - 90 * Math.sin(t * 3 * Math.PI) }; }); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
