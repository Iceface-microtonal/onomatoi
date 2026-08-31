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
  "sharpnessStage", "sharpnessAxisValue", "prototypeRecognitionLevelFor",
  "prototypeVocabWord", "vocabEvent", "STAR_VOCAB", "ONE_STROKE_PENTAGRAM_VOCAB"];
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

function polyline(vertices, steps = 24) {
  const result = [];
  for (let i = 0; i < vertices.length - 1; i++) {
    const a = vertices[i], b = vertices[i + 1];
    for (let step = 0; step < steps; step++) {
      const t = step / steps;
      result.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  result.push(vertices.at(-1));
  return result;
}

function cubic(p0, p1, p2, p3, steps = 45) {
  return Array.from({ length: steps }, (_, i) => {
    const t = i / steps, u = 1 - t;
    const b0 = u ** 3, b1 = 3 * u * u * t, b2 = 3 * u * t * t, b3 = t ** 3;
    return { x: b0 * p0.x + b1 * p1.x + b2 * p2.x + b3 * p3.x,
             y: b0 * p0.y + b1 * p1.y + b2 * p2.y + b3 * p3.y };
  });
}

function leafPoints() {
  const left = { x: 55, y: 180 }, right = { x: 305, y: 180 };
  const points = cubic(left, { x: 115, y: 72 }, { x: 245, y: 72 }, right)
    .concat(cubic(right, { x: 245, y: 288 }, { x: 115, y: 288 }, left));
  points.push(left);
  return points;
}

function crescentPoints() {
  const top = { x: 205, y: 48 }, bottom = { x: 205, y: 312 };
  const points = cubic(top, { x: 55, y: 70 }, { x: 45, y: 285 }, bottom, 70)
    .concat(cubic(bottom, { x: 115, y: 250 }, { x: 115, y: 110 }, top, 70));
  points.push(top);
  return points;
}

function cloudPoints() {
  const left = { x: 60, y: 230 }, leftLobe = { x: 105, y: 160 };
  const middle = { x: 195, y: 130 }, rightLobe = { x: 280, y: 170 };
  const right = { x: 285, y: 240 };
  const points = cubic(left, { x: 42, y: 195 }, { x: 67, y: 157 }, leftLobe)
    .concat(cubic(leftLobe, { x: 108, y: 110 }, { x: 160, y: 88 }, middle))
    .concat(cubic(middle, { x: 232, y: 86 }, { x: 300, y: 117 }, rightLobe))
    .concat(cubic(rightLobe, { x: 330, y: 180 }, { x: 322, y: 227 }, right))
    .concat(cubic(right, { x: 230, y: 264 }, { x: 118, y: 258 }, left));
  points.push(left);
  return points;
}

function flowerPoints(lobes = 5) {
  return Array.from({ length: 241 }, (_, i) => {
    const angle = i / 240 * 2 * Math.PI;
    const radius = 88 + 24 * Math.cos(lobes * angle);
    return { x: 180 + radius * Math.cos(angle), y: 180 + radius * Math.sin(angle) };
  });
}

function dropletPoints() {
  const tip = { x: 180, y: 42 }, bottom = { x: 180, y: 314 };
  const points = cubic(tip, { x: 82, y: 118 }, { x: 72, y: 314 }, bottom, 70)
    .concat(cubic(bottom, { x: 288, y: 314 }, { x: 278, y: 118 }, tip, 70));
  points.push(tip);
  return points;
}

function lightningPoints() {
  return polyline([{ x: 42, y: 48 }, { x: 250, y: 92 }, { x: 126, y: 158 },
                   { x: 275, y: 220 }, { x: 82, y: 310 }]);
}

function outlineStarPoints() {
  const vertices = Array.from({ length: 10 }, (_, i) => {
    const angle = -Math.PI / 2 + i * Math.PI / 5;
    const radius = i % 2 === 0 ? 125 : 56;
    return { x: 180 + radius * Math.cos(angle), y: 180 + radius * Math.sin(angle) };
  });
  vertices.push(vertices[0]);
  return polyline(vertices);
}

function pentagramPoints(start = 0, clockwise = true, rotation = 0) {
  const vertices = Array.from({ length: 5 }, (_, i) => {
    const angle = -Math.PI / 2 + rotation + i * 2 * Math.PI / 5;
    return { x: 180 + 125 * Math.cos(angle), y: 180 + 125 * Math.sin(angle) };
  });
  const step = clockwise ? 2 : -2;
  const indices = Array.from({ length: 6 }, (_, offset) => ((start + offset * step) % 5 + 5) % 5);
  return polyline(indices.map(i => vertices[i]));
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

console.log("── Core同期: 固定形カテゴリと三段階語彙 ──");
{
  const canonical = [
    ["葉", leafPoints(), "isLeaf", "leafRecognitionLevel", "leaf", "keen"],
    ["三日月", crescentPoints(), "isCrescent", "crescentRecognitionLevel", "crescent", "heen"],
    ["雲", cloudPoints(), "isCloud", "cloudRecognitionLevel", "cloud", "hohoon"],
    ["花", flowerPoints(), "isFlower", "flowerRecognitionLevel", "flower", "haraan"],
    ["しずく", dropletPoints(), "isDroplet", "dropletRecognitionLevel", "droplet", "kuoon"],
    ["稲妻", lightningPoints(), "isLightning", "lightningRecognitionLevel", "lightning", "suchiQ"],
  ];
  for (const [label, points, flag, levelKey, family, centerWord] of canonical) {
    const cx = judge(points).cx;
    check(`${label}の中心形を認定`, cx[flag] === true,
          JSON.stringify({ selected: cx.shapeRecognition.selected,
                           prototype: cx.shapeRecognition.prototypeFamily,
                           score: +cx.shapeRecognition.confidence.toFixed(3) }));
    check(`${label}の中心形は認識度3`, cx[levelKey] === 3,
          `${levelKey}=${cx[levelKey]}, score=${cx.shapeRecognition.confidence}`);
    check(`${label}の中心語`, api.prototypeVocabWord(family, 3) === centerWord);
  }

  const tilt = -Math.PI / 6, a = 120, b = 45;
  const ellipse = Array.from({ length: 61 }, (_, i) => {
    const t = i / 60 * 2 * Math.PI, ex = a * Math.cos(t), ey = b * Math.sin(t);
    return { x: 180 + ex * Math.cos(tilt) - ey * Math.sin(tilt),
             y: 180 + ex * Math.sin(tilt) + ey * Math.cos(tilt) };
  });
  const ellipseCx = judge(ellipse).cx;
  check("斜め楕円は葉へ誤認せずP9eを保つ", !ellipseCx.isLeaf,
        JSON.stringify({ corners: ellipseCx.corners, descriptor: ellipseCx.shapeDescriptor,
                         recognition: ellipseCx.shapeRecognition }));

  const levelFixtures = [
    ["leaf", 0.70, 1], ["leaf", 0.85, 2], ["leaf", 0.95, 3],
    ["crescent", 0.60, 1], ["crescent", 0.84, 2], ["crescent", 0.93, 3],
    ["cloud", 0.70, 1], ["cloud", 0.80, 2], ["cloud", 0.90, 3],
    ["flower", 0.65, 1], ["flower", 0.82, 2], ["flower", 0.92, 3],
    ["droplet", 0.68, 1], ["droplet", 0.84, 2], ["droplet", 0.94, 3],
    ["lightning", 0.64, 1], ["lightning", 0.80, 2], ["lightning", 0.90, 3],
  ];
  for (const [family, score, expected] of levelFixtures) {
    const recognition = { candidates: [{ family, confidence: score }, { family: "heart", confidence: 0 }],
                          selected: score >= 0.65 ? family : null, confidence: score, margin: score };
    check(`${family} score ${score} → 認識度${expected}`,
          api.prototypeRecognitionLevelFor(recognition, family) === expected);
  }
}

console.log("── 星語彙分離: 輪郭星 / 一筆五芒星 ──");
{
  const outline = judge(outlineStarPoints()).cx;
  check("輪郭星 → chigyaan", outline.isOutlineStar && !outline.isOneStrokePentagram
    && api.STAR_VOCAB === "chigyaan",
    JSON.stringify({ selected: outline.shapeRecognition.selected,
                     crossings: outline.trajectoryDescriptor.selfIntersectionCount }));

  for (const [start, clockwise, rotation] of [[0, true, 0], [2, true, 0], [0, false, 0], [1, false, 0.41]]) {
    const cx = judge(pentagramPoints(start, clockwise, rotation)).cx;
    check(`一筆五芒星 start=${start} cw=${clockwise} rot=${rotation} → ayanoparu`,
          cx.isOneStrokePentagram && !cx.isOutlineStar
            && api.ONE_STROKE_PENTAGRAM_VOCAB === "ayanoparu",
          JSON.stringify({ selected: cx.shapeRecognition.selected,
                           order: cx.trajectoryDescriptor.radialSymmetryOrder,
                           strength: +cx.trajectoryDescriptor.radialSymmetryStrength.toFixed(3),
                           crossings: cx.trajectoryDescriptor.selfIntersectionCount }));
  }

  const axes = { size: 0, sharp: 0, tex: 0, bright: 0, round: 0, open: 0 };
  const pentagramEvent = api.vocabEvent("ayanoparu", axes);
  check("ayanoparu は5モーラ・語末ん無し", pentagramEvent.moras.length === 5
    && !pentagramEvent.moras.some(m => m.isN));
  const lightningEvent = api.vocabEvent("suchiQ", axes);
  check("suchiQ は語末促音を保持", lightningEvent.moras.length === 3
    && lightningEvent.moras.at(-1).isQ === true);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
