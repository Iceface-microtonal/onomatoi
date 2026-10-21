// lexicon_switch.mjs — 辞書の切り替え口 (計画「二つの辞書」段 2・2026-10-21)。Core LexiconSwitchTests と同じ 4 つ + 記録の lex
// (a) 既定 = コウさん版 (LEXICON_KOU)・interpretStroke の戻りの lex = "kou-2026-10"
// (b) LEXICON_KOU を明示しても既定と語・経路が同じ (代表の形: 円・星・ハート・三角・四角・弧・角度・波・並ぶ輪・渦)
// (c) LEXICON_EMPTY (固定語なし・族の規則なし) で同じ形を通すと落ちず、固有語・族の語にならない (経路は生成)
// (d) 語が無い形は、その分岐を飛ばして次へ進む (一部だけ欠けた辞書)
// (e) FB の記録 (👍👎 の 1 件・書き出し・「送る」) に lex が入る (FB_VERSION 5)
// 実行: node test/lexicon_switch.mjs
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
const EXPORTS = ["interpretStroke", "selectStrokeVocabulary", "scaleFreeInk", "densified", "namingKanaOf", "familyWord", "familyMatch",
  "crossedQuadrilateralVocabWord", "LEXICON_KOU", "LEXICON_EMPTY", "FB_VERSION"];
const ctx = vm.createContext({ console });
vm.runInNewContext(extractEngine(html) + `\n;globalThis.__api = { ${EXPORTS.join(", ")} };`, ctx, { filename: "engine(extracted)" });
const api = ctx.__api;
for (const name of EXPORTS) if (api[name] === undefined) throw new Error(`engine 抽出失敗: ${name}`);

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => { if (cond) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); } };

// ─── 代表の形 (Core LexiconSwitchTests と同じ形を 1000×561 の画面に置く) ───
const W = 1000, H = 561;
const dense = pts => api.densified(pts, 6);
const circle = Array.from({ length: 161 }, (_, i) => { const a = 2 * Math.PI * i / 160; return { x: 500 + 150 * Math.cos(a), y: 280 + 150 * Math.sin(a) }; });
const star = (() => {
  const v = Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 === 0 ? 180 : 80; return { x: 500 + r * Math.cos(a), y: 290 + r * Math.sin(a) }; });
  v.push(v[0]); return dense(v);
})();
const heart = (() => {
  const pts = Array.from({ length: 180 }, (_, i) => {
    const t = i / 180 * 2 * Math.PI, x = 16 * Math.sin(t) ** 3;
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    return { x: 500 + 9 * x, y: 280 - 9 * y };
  });
  pts.push(pts[0]); return pts;
})();
const triangle = dense([{ x: 500, y: 80 }, { x: 330, y: 440 }, { x: 670, y: 440 }, { x: 500, y: 80 }]);
const square = dense([{ x: 380, y: 160 }, { x: 620, y: 160 }, { x: 620, y: 400 }, { x: 380, y: 400 }, { x: 382, y: 163 }]);
const arc = Array.from({ length: 41 }, (_, i) => { const sw = 200 * Math.PI / 180, a = -sw / 2 + i / 40 * sw; return { x: 400 + 150 * Math.cos(a), y: 280 + 150 * Math.sin(a) }; });
const angle = (() => {
  const half = 30 * Math.PI / 180, apex = { x: 500, y: 420 }, leg = 280, pts = [];
  for (let i = 20; i >= 0; i--) { const t = i / 20; pts.push({ x: apex.x - Math.sin(half) * leg * t, y: apex.y - Math.cos(half) * leg * t }); }
  for (let i = 1; i <= 20; i++) { const t = i / 20; pts.push({ x: apex.x + Math.sin(half) * leg * t, y: apex.y - Math.cos(half) * leg * t }); }
  return dense(pts);
})();
const wave = Array.from({ length: 241 }, (_, i) => { const t = i / 240; return { x: 200 + 600 * t, y: 280 - 90 * Math.sin(t * 3 * Math.PI) }; });
const loops = (k => {
  const a = 1, b = 2.4, t0 = -Math.PI, t1 = Math.PI + (k - 1) * 2 * Math.PI, n = 160 * k;
  const raw = Array.from({ length: n + 1 }, (_, i) => { const t = t0 + (t1 - t0) * i / n; return [a * t - b * Math.sin(t), -b * Math.cos(t)]; });
  const xs = raw.map(p => p[0]), mn = Math.min(...xs), s = 500 / (Math.max(...xs) - mn);
  return raw.map(([x, y]) => ({ x: 250 + (x - mn) * s, y: 300 + y * s }));
})(3);
const spiral = Array.from({ length: 401 }, (_, i) => { const u = i / 400, a = -Math.PI / 2 - u * 2.5 * 2 * Math.PI, r = 200 * (1 - 0.85 * u); return { x: 500 + r * Math.cos(a), y: 280 + r * Math.sin(a) }; });
const SHAPES = { 円: circle, 星: star, ハート: heart, 三角: triangle, 四角: square, 弧: arc, 角度: angle, 波: wave, 並ぶ輪: loops, 渦: spiral };

function run(raw, lexicon) {
  const free = api.scaleFreeInk(raw, W, H);
  const opts = { coarse: true, hc: 0, language: "ja" };
  if (lexicon) opts.lexicon = lexicon;
  const r = api.interpretStroke(free.points, free.w, free.h, opts);
  return { r, romaji: r.event.moras.map(m => m.isN ? "N" : m.isQ ? "Q" : (m.onset ?? "") + m.nucleus).join("|"),
           display: r.event.displayWordOverride ?? null, route: r.route, free };
}

console.log("── (a) 既定 = コウさん版・戻りの lex ──");
check("LEXICON_KOU.lex = kou-2026-10", api.LEXICON_KOU.lex === "kou-2026-10");
check("LEXICON_EMPTY は固定語なし・族の規則なし", api.LEXICON_EMPTY.lex === "empty" && Object.keys(api.LEXICON_EMPTY.words).length === 0 && api.LEXICON_EMPTY.family === null);
for (const [name, pts] of Object.entries(SHAPES)) check(`${name}: 戻りの lex = kou-2026-10`, run(pts).r.lex === "kou-2026-10", run(pts).r.lex);
check("LEXICON_EMPTY を渡すと lex = empty", run(circle, api.LEXICON_EMPTY).r.lex === "empty");

console.log("── (b) LEXICON_KOU を明示しても既定と同じ ──");
const base = {};
for (const [name, pts] of Object.entries(SHAPES)) {
  const d = run(pts), e = run(pts, api.LEXICON_KOU);
  base[name] = d;
  check(`${name}: 語・表記・経路が同じ`, d.romaji === e.romaji && d.display === e.display && d.route === e.route, `${d.romaji}/${d.display}/${d.route} ≠ ${e.romaji}/${e.display}/${e.route}`);
}
// 代表の形が固有語・族の語になっている (切り替え口の試験が空振りしていない)
for (const name of ["円", "星", "ハート", "三角", "四角", "弧", "角度"]) check(`${name}: 固有語の経路 (kou)`, base[name].route === "vocabulary", base[name].route);
check("波: 族の語 にゅもにゅ", base["波"].route === "family" && base["波"].display === "にゅもにゅ", `${base["波"].route}/${base["波"].display}`);
check("並ぶ輪: 族の語 むうむうむう", base["並ぶ輪"].route === "family" && base["並ぶ輪"].display === "むうむうむう", `${base["並ぶ輪"].route}/${base["並ぶ輪"].display}`);
check("渦: 族の規則 (くり返し)", base["渦"].route === "family" && base["渦"].r.event.isRedup === true, `${base["渦"].route}`);
check("ハート: くぅん", base["ハート"].display === "くぅん", base["ハート"].display);
check("円: aoon 系 (小/中/大のどれか)", ["oon", "aoon", "aaaan"].some(w => base["円"].r.event.vocabReason?.includes(w)), base["円"].r.event.vocabReason);

console.log("── (c) LEXICON_EMPTY: 落ちず、固有語・族の語にならない ──");
for (const [name, pts] of Object.entries(SHAPES)) {
  let e;
  try { e = run(pts, api.LEXICON_EMPTY); } catch (err) { check(`${name}: 落ちない`, false, String(err)); continue; }
  check(`${name}: 経路は生成 (units / generated)`, e.route === "units" || e.route === "generated", e.route);
  check(`${name}: 固定語の表記が付かない・理由なし`, e.display === null && !e.r.event.vocabReason, `${e.display} ${e.r.event.vocabReason}`);
  check(`${name}: kou の語と綴りが違う`, e.romaji !== base[name].romaji, `${e.romaji}`);
}
{
  const free = api.scaleFreeInk(circle, W, H);
  const sel = api.selectStrokeVocabulary(free.points, free.w, free.h, base["円"].r.ax, base["円"].r.cx, "ja", api.LEXICON_EMPTY);
  check("selectStrokeVocabulary(LEXICON_EMPTY) は語を選ばない", sel.vocabWord === null && sel.displayWordOverride === null, JSON.stringify(sel));
  check("familyWord(LEXICON_EMPTY) は null", api.familyWord({ kind: "wave", crests: [true, false, true] }, api.LEXICON_EMPTY) === null
    && api.familyWord({ kind: "loopRow", count: 2 }, api.LEXICON_EMPTY) === null);
  check("familyWord の既定は kou のまま", api.familyWord({ kind: "wave", crests: [true, false, true] }).display === "にゅもにゅ");
}
{
  const r = run(spiral, api.LEXICON_EMPTY);
  check("渦: LEXICON_EMPTY では族の規則を通らない (isRedup でない)", r.r.event.isRedup !== true);
}

console.log("── (d) 語が無い形は分岐を飛ばして次へ進む (一部だけ欠けた辞書) ──");
{
  const without = key => ({ ...api.LEXICON_KOU, lex: "kou-without-" + key, words: { ...api.LEXICON_KOU.words, [key]: undefined } });
  for (const [name, key] of [["円", "circle"], ["弧", "arc"], ["三角", "triangle"], ["四角", "square"], ["星", "star"], ["ハート", "heart"], ["角度", "sharpness"]]) {
    const r = run(SHAPES[name], without(key));
    check(`${key} だけ欠ける → ${name}はその語にならない (経路 ${r.route})`, r.romaji !== base[name].romaji, `${r.route}/${r.romaji}`);
    check(`${key} だけ欠ける → lex が記録される`, r.r.lex === "kou-without-" + key);
  }
  const noFamily = { ...api.LEXICON_KOU, lex: "kou-no-family", family: null };
  check("族の規則だけ欠ける → 波は族の語にならない", run(wave, noFamily).route !== "family");
  check("族の規則だけ欠ける → 固有語は残る (円)", run(circle, noFamily).romaji === base["円"].romaji);
}

console.log("── (e) 記録の lex (FB_VERSION 5) ──");
check("FB_VERSION = 5", api.FB_VERSION === 5, String(api.FB_VERSION));
{
  const block = (start, len = 900) => { const i = html.indexOf(start); return i < 0 ? "" : html.slice(i, i + len); };
  check("👍👎 の 1 件 (vote の rec) に lex がある", /const rec = \{[\s\S]*?lex: u\.lex \?\? LEXICON_KOU\.lex[\s\S]*?\};/.test(block("function vote(verdict)")));
  check("発話レコード (currentUtterance) に lex がある", /currentUtterance = \{[\s\S]*?lex: extra\.lex \?\? LEXICON_KOU\.lex/.test(block("currentUtterance = {", 600)));
  check("描いた一筆の結果の lex を発話へ渡す", /shape: cx, lex: result\.lex \}/.test(html));
  check("書き出し (feedbackExportText) に lex がある", /function feedbackExportText\(\) \{[\s\S]*?lex: LEXICON_KOU\.lex/.test(block("function feedbackExportText()", 400)));
  check("「送る」の payload に lex がある", /fbVersion: FB_VERSION, lex: LEXICON_KOU\.lex, exported: new Date\(\)\.toISOString\(\), records/.test(html));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
