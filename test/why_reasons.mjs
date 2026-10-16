// why_reasons.mjs — 「なぜ?」の理由コード化の性質テスト (2026-10-16)
//
// 方針: 「なぜ?」欄の説明を、文ではなく「理由コード + 値」(whyReasons) で持ち、文にするのは口調ごとの表
// (今の研究ノート口調 = whyLineLab)。表を替えても事実は同じところから出る。
// 1) 文の不変: 今の なぜ? 欄の文 (日英) が、理由コード化の前と一字一句同じ (golden = fixtures/why_golden.json)
// 2) 理由と文が 1 対 1・理由には層 (universal / convention) が付く (立法の理由を表に出すかを機械的に選べる)
// 3) 理由の裏付け (表示のみ): 文が言うことが語の実際の音に現れているかを数える (落ちない・報告だけ)
//
// golden の作り直し (理由コード化の前のコードでだけ使う): node test/why_reasons.mjs --write
// 実行: node test/why_reasons.mjs

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML_PATH = path.resolve(__dirname, "../iceface_onomatoi.html");
const GOLDEN_PATH = path.join(__dirname, "fixtures/why_golden.json");
const IMPURE = /\b(document|localStorage|sessionStorage|window|navigator|AudioContext|audioCtx|fetch\(|canvas|cctx|location|alert\(|requestAnimationFrame|history)\b/;
const WRITE = process.argv.includes("--write");

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


const engineSrc = extractEngine(fs.readFileSync(HTML_PATH, "utf8"));
const BASE = ["interpretStroke", "densified", "explainEvent", "romajiOf"];
const CODED = ["whyReasons", "whyLineLab"];
const EXPORTS = WRITE ? BASE : [...BASE, ...CODED];
const ctx = vm.createContext({ console });
vm.runInNewContext(engineSrc + `\n;globalThis.__api = { ${EXPORTS.join(", ")} };`
  + `\n;globalThis.__setLang = v => { uiLang = v; };`, ctx, { filename: "engine(extracted)" });
const api = ctx.__api;
for (const name of EXPORTS) {
  if (api[name] === undefined) throw new Error(`engine 抽出失敗: ${name}`);
}

let pass = 0, fail = 0;
function check(name, cond, detail = "") {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }
}

// ─── 線の集め方: 形の一致表の 248 本 + 種を固定した生成の線 (描いた語の経路 = 固定語彙でない語を多く通す) ───
function cases() {
  const out = [];
  const ref = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/stroke_core_parity.json"), "utf8"));
  for (const r of ref.results)
    out.push({ id: r.id, w: r.w, h: r.h, ink: r.points.map(([x, y]) => ({ x, y })) });
  let s = 0x2468ace1;
  const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  const W = 600, H = 400;
  const dense = pts => api.densified(pts, 6);
  for (let n = 0; n < 120; n++) {   // ジグザグ (角 2〜8・振れ幅と大きさを散らす)
    const k = 2 + Math.floor(rnd() * 7), size = 0.25 + rnd() * 0.65, amp = 0.15 + rnd() * 0.8;
    const pts = [];
    for (let i = 0; i <= k; i++) pts.push({ x: W * (0.5 + size * (i / k - 0.5)), y: H * (0.5 + size * amp * 0.5 * (i % 2 ? 1 : -1)) + rnd() * 6 });
    out.push({ id: `gen/zigzag/${n}`, w: W, h: H, ink: dense(pts) });
  }
  for (let n = 0; n < 120; n++) {   // 波・弧・渦 (周期・巻き・大きさを散らす)
    const kind = n % 3, size = 0.2 + rnd() * 0.7, turns = 0.3 + rnd() * 2.6, pts = [];
    for (let i = 0; i <= 80; i++) {
      const t = i / 80;
      if (kind === 0) pts.push({ x: W * (0.5 + size * (t - 0.5)), y: H * (0.5 + size * 0.3 * Math.sin(t * Math.PI * 2 * turns)) });
      else if (kind === 1) { const a = t * Math.PI * 2 * turns * 0.5; pts.push({ x: W * 0.5 + Math.cos(a) * size * H * 0.5, y: H * 0.5 + Math.sin(a) * size * H * 0.5 }); }
      else { const a = t * Math.PI * 2 * turns, r = size * H * 0.5 * (1 - 0.8 * t); pts.push({ x: W * 0.5 + Math.cos(a) * r, y: H * 0.5 + Math.sin(a) * r }); }
    }
    out.push({ id: `gen/curve${kind}/${n}`, w: W, h: H, ink: dense(pts) });
  }
  for (let n = 0; n < 120; n++) {   // 走り書き (なめらかな酔歩)
    let x = W * (0.2 + rnd() * 0.6), y = H * (0.2 + rnd() * 0.6), a = rnd() * Math.PI * 2, da = 0;
    const len = 30 + Math.floor(rnd() * 90), step = 4 + rnd() * 8, wob = 0.05 + rnd() * 0.6, pts = [];
    for (let i = 0; i < len; i++) {
      da = da * 0.8 + (rnd() - 0.5) * wob; a += da;
      x = Math.min(W - 5, Math.max(5, x + Math.cos(a) * step)); y = Math.min(H - 5, Math.max(5, y + Math.sin(a) * step));
      pts.push({ x, y });
    }
    out.push({ id: `gen/scribble/${n}`, w: W, h: H, ink: dense(pts) });
  }
  return out;
}

function explainBoth(c) {
  const r = api.interpretStroke(c.ink, c.w, c.h, { coarse: true, hc: 0, language: "ja" });
  const rEn = api.interpretStroke(c.ink, c.w, c.h, { coarse: true, hc: 0, language: "en" });
  ctx.__setLang("ja");
  const ja = api.explainEvent(r.ax, r.event.moras, r.event.vocabReason ?? null, r.cx);
  ctx.__setLang("en");
  const en = api.explainEvent(rEn.ax, rEn.event.moras, rEn.event.vocabReason ?? null, rEn.cx);
  return { r, rEn, ja: [...ja], en: [...en] };
}

const all = cases();
if (WRITE) {
  const golden = all.map(c => { const { r, ja, en } = explainBoth(c); return { id: c.id, word: api.romajiOf(r.event), ja, en }; });
  fs.writeFileSync(GOLDEN_PATH, JSON.stringify({ note: "「なぜ?」欄の文 (理由コード化の前) — test/why_reasons.mjs --write", cases: golden }, null, 0) + "\n");
  console.log(`golden を書いた: ${golden.length} 本`);
  process.exit(0);
}

const golden = JSON.parse(fs.readFileSync(GOLDEN_PATH, "utf8")).cases;
console.log("── 1) 文の不変 (理由コード化の前と一字一句同じ) ──");
{
  check("線の集め方が golden と同じ", golden.length === all.length && golden.every((g, i) => g.id === all[i].id),
        `${golden.length} vs ${all.length}`);
  let wordDiff = 0, textDiff = [];
  all.forEach((c, i) => {
    const g = golden[i], { r, ja, en } = explainBoth(c);
    if (api.romajiOf(r.event) !== g.word) wordDiff++;
    if (JSON.stringify(ja) !== JSON.stringify(g.ja) || JSON.stringify(en) !== JSON.stringify(g.en)) textDiff.push(c.id);
  });
  check(`語が golden と同じ (${all.length} 本)`, wordDiff === 0, `${wordDiff} 本ちがう — 語の規則が変わったなら golden を作り直す前に理由を確かめる`);
  check(`なぜ? の文が日英とも同じ (${all.length} 本)`, textDiff.length === 0, textDiff.slice(0, 5).join(", "));
}

console.log("── 2) 理由と文が 1 対 1・層が付く ──");
{
  let bad = [], layerBad = [], conv = 0, codes = new Map();
  for (const c of all) {
    const { r, rEn, ja, en } = explainBoth(c);
    const reasons = api.whyReasons(r.ax, r.event.moras, r.event.vocabReason ?? null, r.cx);
    const lab = reasons.map(x => api.whyLineLab(x, true));
    const labEn = api.whyReasons(rEn.ax, rEn.event.moras, rEn.event.vocabReason ?? null, rEn.cx)
      .map(x => api.whyLineLab(x, false));
    if (JSON.stringify(lab) !== JSON.stringify(ja) || JSON.stringify(labEn) !== JSON.stringify(en)) bad.push(c.id);
    for (const x of reasons) {
      codes.set(x.code, (codes.get(x.code) || 0) + 1);
      if (x.layer !== "universal" && x.layer !== "convention") layerBad.push(`${c.id}:${x.code}`);
      if (x.layer === "convention") conv++;
    }
  }
  check("理由を表に通すと なぜ? の文になる (日英)", bad.length === 0, bad.slice(0, 5).join(", "));
  check("どの理由にも層 (universal / convention) が付く", layerBad.length === 0, layerBad.slice(0, 5).join(", "));
  check("立法の理由 (固定語彙) は convention", conv > 0, `convention ${conv}`);
  console.log("  理由の出現数: " + [...codes].map(([k, v]) => `${k} ${v}`).join(" · "));
}

console.log("── 3) 理由の裏付け (報告のみ・落ちない) ──");
{
  // 文が言う音が、語の実際の音に現れているか。現れない = 軸の傾向を言っているだけで、この語の説明になっていない。
  const HARD = new Set(["k", "t", "s", "ts", "ch", "p", "sh", "g", "d", "z", "b", "j"]);
  const SOFT = new Set(["m", "w", "n", "r", "y", "ny", "my", "ry", "h", "hy", "f"]);
  const VOWELS = { open: ["a", "e"], closed: ["i", "u"], pursed: ["u", "o"], spread: ["i", "e"], big: ["a"] };
  const tally = {};
  const bump = (k, ok) => { tally[k] ??= { n: 0, ok: 0 }; tally[k].n++; if (ok) tally[k].ok++; };
  for (const c of all) {
    const { r } = explainBoth(c);
    const ms = r.event.moras.filter(m => !m.isSilentRest);
    const onsets = ms.map(m => m.onset).filter(Boolean), nuclei = ms.map(m => m.nucleus).filter(Boolean);
    for (const x of api.whyReasons(r.ax, r.event.moras, r.event.vocabReason ?? null, r.cx)) {
      if (x.code === "consonantSharp") bump("鋭い子音 (か・た・さ・つ系) と言った語に、鋭い子音がある", onsets.some(o => HARD.has(o)));
      if (x.code === "consonantSoft") bump("柔らかい子音 (ま・わ・な・ら系) と言った語に、柔らかい子音がある", onsets.some(o => SOFT.has(o)));
      if (x.code === "vowelMouth") for (const p of x.parts) bump(`口の形「${p}」と言った語に、その母音がある`, nuclei.some(v => VOWELS[p].includes(v)));
    }
  }
  for (const [k, v] of Object.entries(tally)) console.log(`  ${k}: ${v.ok}/${v.n} (${Math.round(100 * v.ok / v.n)}%)`);
}

console.log(`\n${pass} passed / ${fail} failed`);
process.exit(fail ? 1 : 0);
