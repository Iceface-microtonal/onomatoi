// symbol_vocab.mjs — P12 固定語彙ゲートの性質テスト (2026-07-17)
//
// 発端: Icefaceさん報告 mrnps275-7 — 多重ループの複雑な一筆 (cor=0/lp=2) が
// 「完全な円 = aaan」に吸われた。真因 = circle ゲートに回転の上限が無く、
// rotationFraction > 0.8 だけでは 2周以上の渦・連ループも通過していた。
// 修正 = circleVocabSignal (純関数化): 0.8 < rotationFraction < 1.5 の一周閉円のみ。
//
// 地雷ルール (HANDOFF 07-16): 診断は実描画条件で — 合成形には必ず jitter 変奏を併走。
//
// 実行: node test/symbol_vocab.mjs

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

const engineSrc = extractEngine(fs.readFileSync(HTML_PATH, "utf8"));
const EXPORTS = ["strokeComplexity", "extractAxes", "applyHandCorrection", "bucketedAxes",
  "densified", "splineDensified", "circleVocabSignal", "openArcSignal",
  "sharpnessStage", "sharpnessAxisValue"];
const ctx = vm.createContext({ console });
vm.runInNewContext(engineSrc + `\n;globalThis.__api = { ${EXPORTS.join(", ")} };`, ctx,
  { filename: "engine(extracted)" });
const api = ctx.__api;
for (const name of EXPORTS) {
  if (api[name] === undefined) throw new Error(`engine 抽出失敗: ${name}`);
}

let pass = 0, fail = 0;
function check(name, cond, detail = "") {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }
}

const W = 360, H = 360;

// pointerup と同じ段: 珠 → ink (densified) / 幾何 (splineDensified) → cx / ax
function judge(pts) {
  const inkPts = api.densified(pts, 6);
  const geomPts = api.splineDensified(pts, 6);
  const cx = api.strokeComplexity(geomPts, W, H, 16);
  const ax = api.bucketedAxes(api.applyHandCorrection(api.extractAxes(inkPts, W, H), 0.0, false), 0.25);
  return { cx, ax, circle: api.circleVocabSignal(cx, ax) };
}

// 決定的 jitter (±1.5px 手ブレ・実描画条件)
function jittered(pts, amp = 1.5) {
  let s = 0x9e3779b9;
  const rnd = () => {
    s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
  return pts.map(p => ({ x: p.x + (rnd() * 2 - 1) * amp, y: p.y + (rnd() * 2 - 1) * amp }));
}

/// 中心 (cx0,cy0)・半径 r・turns 周の円弧点列 (時計回り)。
function arc(cx0, cy0, r, turns, n = Math.round(72 * turns)) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * turns * 2 * Math.PI;
    pts.push({ x: cx0 + r * Math.cos(t), y: cy0 + r * Math.sin(t) });
  }
  return pts;
}

console.log("── circle (aaan) ゲート: 一周の閉円のみ ──");
{
  // 大きく開いた円 1周 (P12 の正典形)
  const circle = arc(180, 180, 120, 1.0);
  const j = judge(circle);
  check("大円1周 → aaan ゲート true", j.circle,
        JSON.stringify({ rot: +j.cx.rotationFraction.toFixed(2), closed: j.cx.isClosed,
                         cor: j.cx.corners, open: j.ax.open, round: j.ax.round }));
  const jj = judge(jittered(circle));
  check("大円1周 (jitter±1.5px) → true", jj.circle,
        JSON.stringify({ rot: +jj.cx.rotationFraction.toFixed(2), closed: jj.cx.isClosed,
                         cor: jj.cx.corners, open: jj.ax.open }));
  // ペン尾の重なり (~1.08周) は許容 — 閉ストロークの継ぎ目巻き込みで rotation は 1.6 超に
  // 過大測定される (だから回転上限でなく紙面効率で判定する)
  const overshoot = arc(180, 180, 120, 1.08);
  const jo = judge(overshoot);
  check("円1.08周 (ペン尾重なり) → true", jo.circle,
        JSON.stringify({ rot: +jo.cx.rotationFraction.toFixed(2), closed: jo.cx.isClosed,
                         eff: +(jo.cx.pathRatio / jo.cx.sizeRatio).toFixed(2) }));
  // 同じ円を2周なぞる = Step3 で 1 周に畳んで「1つの円」と同一視 → aaan true (2026-07-17 更新)。
  // (Step1 時代は「弾く=false」だったが、Step3 で「同一視」まで進めた: なぞりは完成形が同じ)
  const traced2 = arc(180, 180, 120, 2.0);
  const j2 = judge(traced2);
  check("同一円2周なぞり → aaan true (Step3 で畳む)", j2.circle,
        JSON.stringify({ rot: +j2.cx.rotationFraction.toFixed(2), cor: j2.cx.corners }));
}
{
  // 渦 (同心 2.2周): 複雑な一筆 — aaan にしない (mrnps275-7 のクラス)
  const spiral = [];
  const n = 160;
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * 2.2 * 2 * Math.PI;
    const r = 120 - 25 * (t / (2 * Math.PI));   // 内へ巻く
    spiral.push({ x: 180 + r * Math.cos(t), y: 180 + r * Math.sin(t) });
  }
  const j = judge(spiral);
  check("渦2.2周 → aaan ゲート false", !j.circle,
        JSON.stringify({ rot: +j.cx.rotationFraction.toFixed(2), closed: j.cx.isClosed }));
  check("渦2.2周 (jitter) → false", !judge(jittered(spiral)).circle);
}
{
  // 連ループ (右へ流れる 2 ループ + 尾): mrnps275-7 の描写クラス
  const chain = [
    ...arc(120, 120, 55, 1.05),
    ...arc(230, 130, 60, 1.05).map(p => p),
    { x: 300, y: 200 }, { x: 315, y: 240 }, { x: 320, y: 280 },
  ];
  const j = judge(chain);
  check("連ループ2+尾 → aaan ゲート false", !j.circle,
        JSON.stringify({ rot: +j.cx.rotationFraction.toFixed(2), closed: j.cx.isClosed,
                         cor: j.cx.corners, lp: j.cx.loops }));
  check("連ループ2+尾 (jitter) → false", !judge(jittered(chain)).circle);
}
{
  // 2026-07-21 コウさん立法 (第2信・円サイズ3段): 小円も円として完成していれば語彙が立つ
  // (小=oon)。旧「open<0.5 は う の領域」ゲートは撤去 — う は円判定に満たない形に残る。
  // 正本 = Onomatoi/docs/FEEDBACK_2026-07-21_kou_circle_sizes.md
  const small = arc(180, 180, 30, 1.0);
  const j = judge(small);
  check("小円 → circle ゲート true (2026-07-21 サイズ立法: 小=oon)", j.circle,
        JSON.stringify({ open: j.ax.open }));
}

console.log("── sharpness 7段階: 角なし / 135 / 115 / 90 / 65 / 40 / 20° ──");
{
  const anchors = [135, 115, 90, 65, 40, 20];
  const chevron = angle => {
    const half = angle * Math.PI / 360, apex = { x: 180, y: 230 }, length = 130;
    const left = { x: -Math.sin(half), y: -Math.cos(half) };
    const right = { x: Math.sin(half), y: -Math.cos(half) };
    const points = [];
    for (let i = 40; i >= 0; i--)
      points.push({ x: apex.x + left.x * length * i / 40,
                    y: apex.y + left.y * length * i / 40 });
    for (let i = 1; i <= 40; i++)
      points.push({ x: apex.x + right.x * length * i / 40,
                    y: apex.y + right.y * length * i / 40 });
    return points;
  };
  check("角なし stage 0 → -1", api.sharpnessStage(null) === 0
    && api.sharpnessAxisValue(0) === -1);
  anchors.forEach((angle, i) => {
    const expected = api.sharpnessAxisValue(i + 1);
    const ax = api.extractAxes(chevron(angle), W, H);
    check(`内角${angle}° → stage ${i + 1}`,
          Math.abs(ax.sharp - expected) < 1e-9, `sharp=${ax.sharp}`);
    const corrected = api.applyHandCorrection(ax, 1, true);
    check(`内角${angle}° は手書き補正で移動しない`, corrected.sharp === ax.sharp);
    check(`内角${angle}° は粗い筆でも7段階を保持`,
          Math.abs(api.bucketedAxes(ax, 0.25).sharp - expected) < 1e-9);
  });
  const smooth = judge(arc(180, 180, 120, 1.0));
  check("滑らかな円は角なし stage", smooth.ax.sharp === -1,
        `sharp=${smooth.ax.sharp}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
