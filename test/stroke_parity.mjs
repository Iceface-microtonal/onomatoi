// stroke_parity.mjs — 一筆 → 語 の Web 版とネイティブ版 (OnomatoiCore) の一致テスト
//
// 判定の正本はネイティブ版。fixture は生の点列とネイティブ版の出力 (語・固有語か・経路・K・6軸・構造・調音) を持つ。
// このテストは同じ生の点列を、アプリの pointerup と同じ段 (粗い筆: 対角の 2.2% で頂点確定 → 6px 密化)
// で interpretStroke に通し、項目ごとに突き合わせる。
//
// fixture は実際の手描きを含むので公開 repo には置かない (既定 = 隣の非公開 repo)。無ければ失敗する。
// 実行: node test/stroke_parity.mjs [fixture.json] [--list N] [--json 不一致の書き出し先.json]

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML_PATH = path.resolve(__dirname, "../iceface_onomatoi.html");
const DEFAULT_FIXTURE = path.resolve(__dirname, "../../Onomatoi Film/parity/stroke_parity.json");
const IMPURE = /\b(document|localStorage|sessionStorage|window|navigator|AudioContext|audioCtx|fetch\(|canvas|cctx|location|alert\(|requestAnimationFrame|history)\b/;

const args = process.argv.slice(2);
const listIx = args.indexOf("--list");
const LIST = listIx >= 0 ? Number(args[listIx + 1]) : 12;
const jsonIx = args.indexOf("--json");
const JSON_OUT = jsonIx >= 0 ? args[jsonIx + 1] : null;
const fixturePath = args.find((a, i) => !a.startsWith("--") && !["--list", "--json"].includes(args[i - 1])) ?? DEFAULT_FIXTURE;
if (!fs.existsSync(fixturePath)) {
  console.error(`FAIL  fixture が無い: ${fixturePath}`);
  process.exit(1);
}

// iceface_onomatoi.html の最長 <script> から、純粋なエンジン宣言 (function/const/let) だけを取り出す。
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

const EXPORTS = ["interpretStroke", "distanceFiltered", "densified", "romajiOf", "mannerProfile"];
const ctx = vm.createContext({ console });
vm.runInNewContext(extractEngine(fs.readFileSync(HTML_PATH, "utf8")) + `\n;globalThis.__api = { ${EXPORTS.join(", ")} };`,
  ctx, { filename: "engine(extracted)" });
const api = ctx.__api;
for (const name of EXPORTS) if (api[name] === undefined) throw new Error(`engine 抽出失敗: ${name}`);

// pointerup と同じ段: 粗い筆の頂点 (distanceFiltered と同じ規則・終端補完あり) → 6px 密化 → interpretStroke
function webInterpret(points, w, h) {
  const raw = points.map(([x, y]) => ({ x, y }));
  const beads = api.distanceFiltered(raw, Math.hypot(w, h) * 0.022);
  const ink = beads.length >= 2 ? api.densified(beads, 6) : beads;
  if (ink.length < 2) return null;
  return api.interpretStroke(ink, w, h, { coarse: true, hc: 0, language: "ja" });
}

const ROUTE = { vocabulary: "vocab", units: "unit", generated: "global" };
const AXES = [["size", "size"], ["sharp", "sharpness"], ["tex", "texture"], ["bright", "brightness"],
  ["round", "roundness"], ["open", "openness"]];
const MANNER = [["p", "plosive"], ["a", "affricate"], ["f", "fricative"], ["s", "sonorant"]];
const near = (a, b, tol) => (a == null && b == null) || (a != null && b != null && Math.abs(a - b) <= tol);

// 項目ごとの突き合わせ。順番 = 語に近い順 (語が合わない原因を上流から探せる)。
const FIELDS = {
  "語": (r, e) => [api.romajiOf(r.event), e.romaji],
  "経路": (r, e) => [ROUTE[r.route] ?? r.route, e.path],
  "K": (r, e) => [r.kDraw, e.kDraw, 1e-9],
  "formK": (r, e) => [r.cx.formK ?? null, e.formK ?? null, 1e-3],
  "角": (r, e) => [r.cx.corners, e.corners],
  "輪": (r, e) => [r.cx.loops, e.loops],
  "拍数": (r, e) => [r.cx.moraCount, e.moraCount],
  "閉じ": (r, e) => [!!r.cx.isClosed, !!e.isClosed],
  ...Object.fromEntries(AXES.map(([wk, sk]) => [`軸 ${sk}`, (r, e) => [r.ax[wk], e.axes[sk], 1e-6]])),
  ...Object.fromEntries(MANNER.map(([wk, sk]) => [`調音 ${sk}`, (r, e) => [mannerOf(r)[wk], e.manner[sk], 1e-3]])),
};
// interpretStroke は調音の親和度を返さないので、同じ入力でエンジン自身の mannerProfile を呼ぶ
const mannerOf = r => api.mannerProfile(r.ax.sharp, r.cx.corners, r.cx.cornerSharpness, r.ax.tex, r.cx.loops);

const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
const tally = Object.fromEntries(Object.keys(FIELDS).map(k => [k, 0]));
const mismatches = [];
let nullOk = 0, nullBad = 0;
for (const c of fixture.cases) {
  const [w, h] = c.canvas;
  const r = webInterpret(c.points, w, h);
  if (c.expect == null || r == null) {
    if ((c.expect == null) === (r == null)) nullOk++;
    else { nullBad++; mismatches.push({ id: c.id, diffs: [`語にならない: web=${r == null} native=${c.expect == null}`] }); }
    continue;
  }
  const e = c.expect;
  const diffs = [];
  for (const [name, f] of Object.entries(FIELDS)) {
    const [wv, ev, tol] = f(r, e);
    const ok = tol === undefined ? wv === ev : near(wv, ev, tol);
    if (ok) tally[name]++;
    else diffs.push(`${name}: web ${fmt(wv)} ≠ native ${fmt(ev)}`);
  }
  if (diffs.length) mismatches.push({ id: c.id, word: `${api.romajiOf(r.event)} / ${e.romaji}`, diffs });
}

function fmt(v) { return typeof v === "number" ? (Number.isInteger(v) ? String(v) : v.toFixed(3)) : String(v); }

const total = fixture.cases.length, scored = total - nullOk - nullBad;
console.log(`stroke_parity — 正本: ${fixture.truth}`);
console.log(`fixture: ${path.relative(process.cwd(), fixturePath)} (${total} 件・語にならない一致 ${nullOk}/${nullOk + nullBad})`);
console.log("");
for (const [name, n] of Object.entries(tally)) {
  const pct = (100 * n / scored).toFixed(1).padStart(5);
  console.log(`  ${n === scored ? "PASS" : "FAIL"}  ${name.padEnd(16)} ${String(n).padStart(4)}/${scored}  ${pct}%`);
}
console.log("");
const wordMiss = mismatches.filter(m => m.diffs.some(d => d.startsWith("語")));
console.log(`語の不一致 ${wordMiss.length} 件 (先頭 ${Math.min(LIST, wordMiss.length)} 件):`);
for (const m of wordMiss.slice(0, LIST)) console.log(`  ${m.id}  ${m.word ?? ""}\n      ${m.diffs.join("\n      ")}`);
if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify({ truth: fixture.truth, tally, scored, mismatches }, null, 1));
process.exit(mismatches.length === 0 ? 0 : 1);
