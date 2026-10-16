// family_rules.mjs — 族の語の規則 (2026-10-16 コウさん確認済み・Core FamilyRules.swift と同じ規則)
// 波 = 山 にゅ・谷 も を描いた順に / 2 周以上の渦 = 前半 2 音のくり返し / 並ぶ輪 = 輪ごとに むう。
// 当てない形 (S 字・浅い波・浅いジグザグ・縦の波・くるん・2 周なぞりの円・8の字) も固定する。Core FamilyRulesTests と同じ形。
// 実行: node test/family_rules.mjs
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

const EXPORTS = ["interpretStroke", "scaleFreeInk", "namingKanaOf", "familyMatch", "strokeComplexity", "coreSplineSmoothed"];
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
const wave = (humps, amp, down = false, x0 = 200, w = 600, y0 = 280) =>
  Array.from({ length: 241 }, (_, i) => { const t = i / 240; return { x: x0 + w * t, y: y0 + (down ? 1 : -1) * amp * Math.sin(t * humps * Math.PI) }; });
function loops(k, x0 = 250, w = 500, y0 = 300) {
  const a = 1, b = 2.4, t0 = -Math.PI, t1 = Math.PI + (k - 1) * 2 * Math.PI, n = 160 * k;
  const raw = Array.from({ length: n + 1 }, (_, i) => { const t = t0 + (t1 - t0) * i / n; return [a * t - b * Math.sin(t), -b * Math.cos(t)]; });
  const xs = raw.map(p => p[0]), mn = Math.min(...xs), s = w / (Math.max(...xs) - mn);
  return raw.map(([x, y]) => ({ x: x0 + (x - mn) * s, y: y0 + y * s }));
}
const spiral = (turns, r = 200) => Array.from({ length: 401 }, (_, i) => { const u = i / 400, a = -Math.PI / 2 - u * turns * 2 * Math.PI, rr = r * (1 - 0.85 * u); return { x: 500 + rr * Math.cos(a), y: 280 + rr * Math.sin(a) }; });
function zigzag(amp, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const ax = 200 + 600 * i / n, bx = 200 + 600 * (i + 1) / n, ay = 280 + (i % 2 === 0 ? amp : -amp), by = 280 + (i % 2 === 0 ? -amp : amp);
    for (let j = 0; j < 20; j++) { const u = j / 20; out.push({ x: ax + (bx - ax) * u, y: ay + (by - ay) * u }); }
  }
  return out;
}

console.log("── 波 = 山 にゅ・谷 も を描いた順に ──");
check("山・谷・山 → にゅもにゅ", run(wave(3, 90)).word === "にゅもにゅ", run(wave(3, 90)).word);
check("谷・山・谷 → もにゅも", run(wave(3, 90, true)).word === "もにゅも", run(wave(3, 90, true)).word);
check("山と谷が 5 つ → にゅもにゅもにゅ", run(wave(5, 45)).word === "にゅもにゅもにゅ", run(wave(5, 45)).word);
check("右から左へ描いても同じ", run(wave(3, 90).reverse()).word === "にゅもにゅ", run(wave(3, 90).reverse()).word);
check("位置・大きさを変えても同じ", run(wave(3, 45, false, 100, 300, 150)).word === "にゅもにゅ", run(wave(3, 45, false, 100, 300, 150)).word);
for (const [name, pts] of [["S 字", wave(2, 90)], ["浅い波", wave(3, 20)], ["浅いジグザグ", zigzag(40, 6)],
                           ["縦の波", wave(3, 90).map(p => ({ x: 500 + (p.y - 280), y: 30 + (p.x - 200) * 0.8 }))]]) {
  const w = run(pts).word;
  check(`${name} は波の規則に当てない`, !/にゅも|もにゅ/.test(w), w);
}
console.log("── 並ぶ輪 = 輪ごとに むう ──");
check("輪 2 つ → むうむう", run(loops(2)).word === "むうむう", run(loops(2)).word);
check("輪 3 つ → むうむうむう", run(loops(3)).word === "むうむうむう", run(loops(3)).word);
check("輪 1 つ (くるん) は当てない", run(loops(1)).word !== "むう", run(loops(1)).word);
console.log("── 2 周以上の渦 = 前半 2 音のくり返し ──");
{
  const { r } = run(spiral(2.5));
  const ms = r.event.moras.filter(m => !m.isSilentRest);
  const key = m => (m.onset ?? "") + m.nucleus;
  const ok = ms.length === 4 ? (r.event.isRedup && key(ms[0]) === key(ms[2]) && key(ms[1]) === key(ms[3]))
                             : ms.slice(0, 2).some(m => m.nucleus === "i");
  check("2.5 周の渦はくり返し形 (い が入るときだけくり返さない)", ok, ms.map(key).join(" "));
  const one = run(spiral(1.0));
  check("1 周の渦は渦の規則に当てない", api.familyMatch(one.pts, one.r.cx)?.kind !== "spiral", JSON.stringify(api.familyMatch(one.pts, one.r.cx)));
}
console.log("── 閉じた形は当てない ──");
{
  const circle2 = Array.from({ length: 361 }, (_, i) => { const a = i / 360 * 4 * Math.PI; return { x: 500 + 150 * Math.cos(a), y: 280 + 150 * Math.sin(a) }; });
  const eight = Array.from({ length: 361 }, (_, i) => { const t = i / 360 * 2 * Math.PI; return { x: 500 + 120 * Math.sin(t), y: 280 + 200 * Math.sin(t) * Math.cos(t) }; });
  for (const [name, pts] of [["2 周なぞりの円", circle2], ["8の字", eight]]) {
    const x = run(pts);
    check(`${name} は族の規則に当てない`, api.familyMatch(x.pts, x.r.cx) === null, JSON.stringify(api.familyMatch(x.pts, x.r.cx)));
  }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
