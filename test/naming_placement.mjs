// naming_placement.mjs — 命名モード (配置層 Phase1-4, 2026-07-20) の性質テスト
//
// 移植元 (正本): OnomatoiCore/Sources/OnomatoiCore/Core/NamingPlacement.swift
// テストの正本: OnomatoiCore/Tests/OnomatoiCoreTests/NamingPlacementTests.swift
// 設計文書:     Onomatoi/docs/NamingPlacementDesign.md (§10 に較正の来歴)
//
// 方式: closed_form.mjs / kou_properties.mjs と同じ vm 抽出方式 — iceface_onomatoi.html の
// <script> から純粋なエンジン宣言 (function/const/let で DOM/audio/storage に触れないもの) を
// 自動抽出して vm で評価し、抽出した namingDecompose/namingSlots/namingGenerate/
// namingGenerateClean/namingIsClean を直接叩く。
//
// 実行: node test/naming_placement.mjs

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML_PATH = path.resolve(__dirname, "../iceface_onomatoi.html");
const IMPURE = /\b(document|localStorage|sessionStorage|window|navigator|AudioContext|audioCtx|fetch\(|canvas|cctx|location|alert\(|requestAnimationFrame|history)\b/;

function extractEngine(html) {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  if (scripts.length === 0) throw new Error("no <script> found");
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
      const block = lines.slice(start, end + 1).join("\n");
      blocks.push(block);
      i = end + 1;
      continue;
    }
    i++;
  }

  const pure = blocks.filter(b => !IMPURE.test(b));
  return pure.join("\n\n");
}

const engineSrc = extractEngine(fs.readFileSync(HTML_PATH, "utf8"));
const EXPORTS = ["extractAxes", "strokeComplexity", "splineDensified", "densified",
  "splitmix64", "axesSeed", "pickConsonant", "pickVowel", "geminateGapMs",
  "namingDecompose", "namingSlots", "namingGenerate", "namingGenerateClean",
  "namingIsClean", "namingKanaOf", "namingHeadPolarity",
  "NAMING_NG_WORDS", "NAMING_SALIENCE_FLOOR"];
const ctx = vm.createContext({ console });
vm.runInNewContext(
  engineSrc + `\n;globalThis.__api = { ${EXPORTS.join(", ")} };`,
  ctx, { filename: "engine(extracted)" });
const api = ctx.__api;
for (const name of EXPORTS) {
  if (api[name] === undefined) throw new Error(`engine 抽出失敗: ${name} が見つからない`);
}

let pass = 0, fail = 0;
function check(name, cond, detail = "") {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }
}

const W = 360, H = 360;
const ZERO_AXES = { size: 0, sharp: 0, tex: 0, bright: 0, round: 0, open: 0 };

// ─── 合成点列ヘルパ (NamingPlacementTests.swift と同じ座標) ───
function circlePoints() {
  const pts = [];
  for (let i = 0; i <= 72; i++) {
    const t = (i / 72) * 2 * Math.PI;
    pts.push({ x: 180 + 120 * Math.cos(t), y: 180 + 120 * Math.sin(t) });
  }
  return pts;
}
function trianglePoints() {
  const v = [[180, 60], [280, 280], [80, 280]];
  const pts = [];
  for (let e = 0; e < 3; e++) {
    const a = v[e], b = v[(e + 1) % 3];
    for (let t = 0; t < 20; t++) {
      pts.push({ x: a[0] + (b[0] - a[0]) * t / 20, y: a[1] + (b[1] - a[1]) * t / 20 });
    }
  }
  pts.push({ x: v[0][0], y: v[0][1] });
  return pts;
}
function squarePoints() {
  const cs = [[100, 100], [260, 100], [260, 260], [100, 260]];
  const sq = [];
  for (let e = 0; e < 4; e++) {
    const [ax, ay] = cs[e], [bx, by] = cs[(e + 1) % 4];
    for (let t = 0; t < 10; t++) {
      sq.push({ x: ax + (bx - ax) * t / 10, y: ay + (by - ay) * t / 10 });
    }
  }
  sq.push({ x: 101, y: 102 });
  return sq;
}
// 長い水平線 (240px / canvas対角509 ≈ 0.47 → long)。
function longLinePoints() {
  const pts = [];
  for (let i = 0; i <= 30; i++) pts.push({ x: 60 + i * 8, y: 180 });
  return pts;
}
// 短い水平線 (80px → open)。
function shortLinePoints() {
  const pts = [];
  for (let i = 0; i <= 10; i++) pts.push({ x: 100 + i * 8, y: 180 });
  return pts;
}

function decomposeFromPoints(pts) {
  const axes = api.extractAxes(pts, W, H);
  const cx = api.strokeComplexity(pts, W, H, 16);
  return api.namingDecompose(axes, cx);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
console.log("── 1. 解体の決定性 ──");
{
  const a = decomposeFromPoints(circlePoints());
  const b = decomposeFromPoints(circlePoints());
  check("同一入力2回で FeatureInventory が一致", JSON.stringify(a) === JSON.stringify(b));
}

console.log("── 2. 円 → round & nasal ──");
{
  const inv = decomposeFromPoints(circlePoints());
  check("円の最強特徴が round", inv.features[0]?.kind === "round",
        JSON.stringify(inv.features));
  check("円 (閉じた丸) の終止が nasal", inv.closure === "nasal", inv.closure);
}

console.log("── 3. 正三角形 (既定感度) → spike > edge & nasal ──");
{
  const inv = decomposeFromPoints(trianglePoints());
  const spike = inv.features.find(f => f.kind === "spike")?.strength ?? 0;
  const edge = inv.features.find(f => f.kind === "edge")?.strength ?? 0;
  check("正三角形は spike が edge を上回る", spike > edge, `spike=${spike} edge=${edge}`);
  check("閉じた三角 (cs<0.6) の終止は nasal", inv.closure === "nasal", inv.closure);
}

console.log("── 4. 正方形 → edge > spike & features[0]==edge ──");
{
  const inv = decomposeFromPoints(squarePoints());
  const spike = inv.features.find(f => f.kind === "spike")?.strength ?? 0;
  const edge = inv.features.find(f => f.kind === "edge")?.strength ?? 0;
  check("正方形は edge が spike を上回る", edge > spike, `edge=${edge} spike=${spike}`);
  check("正方形の最強特徴は edge", inv.features[0]?.kind === "edge", JSON.stringify(inv.features));
}

console.log("── 5. 長い水平線→long / 短い線→open ──");
{
  const invLong = decomposeFromPoints(longLinePoints());
  check("長い滑らかな線の終止が long", invLong.closure === "long", invLong.closure);
  const invShort = decomposeFromPoints(shortLinePoints());
  check("短い線の終止が open", invShort.closure === "open", invShort.closure);
}

console.log("── 6. namingGenerate の決定性 ──");
{
  const inv = decomposeFromPoints(circlePoints());
  const a = api.namingGenerate(inv, api.splitmix64(12345), 0, 0.4);
  const b = api.namingGenerate(inv, api.splitmix64(12345), 0, 0.4);
  check("同一 seed で かな完全一致", api.namingKanaOf(a.moras) === api.namingKanaOf(b.moras),
        `${api.namingKanaOf(a.moras)} vs ${api.namingKanaOf(b.moras)}`);
}

console.log("── 7. round 単独 → 語頭が共鳴音寄り ──");
{
  const inv = { features: [{ kind: "round", strength: 0.9 }], closure: "nasal", axes: ZERO_AXES };
  // "my" は Swift 側でも consonantBias 未登録 (P11/P12 専用) で generate 系からは選ばれない
  // ため web の CONSONANTS 同様に対象から外す (差分の詳細は報告参照)。
  const target = new Set(["m", "n", "ny", "r", "w", "y"]);
  let hit = 0, total = 0;
  for (let seed = 0; seed < 40; seed++) {
    const ev = api.namingGenerate(inv, api.splitmix64(seed), 0, 0.4);
    const onset = ev.moras[0]?.onset;
    if (onset === undefined) continue;
    total++;
    if (target.has(onset)) hit++;
  }
  const rate = hit / Math.max(1, total);
  check("丸みの語頭が共鳴音寄り (>=0.55)", rate >= 0.55, `rate=${rate}`);
}

console.log("── 8. spike 単独 → 語頭が鋭い子音寄り ──");
{
  const inv = { features: [{ kind: "spike", strength: 0.9 }], closure: "open", axes: ZERO_AXES };
  const target = new Set(["k", "t", "ts", "ch", "ky", "p"]);
  let hit = 0, total = 0;
  for (let seed = 0; seed < 40; seed++) {
    const ev = api.namingGenerate(inv, api.splitmix64(seed), 0, 0.4);
    const onset = ev.moras[0]?.onset;
    if (onset === undefined) continue;
    total++;
    if (target.has(onset)) hit++;
  }
  const rate = hit / Math.max(1, total);
  check("尖りの語頭が鋭い子音寄り (>=0.55)", rate >= 0.55, `rate=${rate}`);
}

console.log("── 9. ClosureMode の適用 ──");
{
  const invNasal = { features: [{ kind: "round", strength: 0.8 }], closure: "nasal", axes: ZERO_AXES };
  const evNasal = api.namingGenerate(invNasal, api.splitmix64(1), 0, 0.4);
  check("nasal 終止の語末に撥音ん", evNasal.moras[evNasal.moras.length - 1]?.isN === true);

  const invOpen = { features: [{ kind: "spike", strength: 0.8 }], closure: "open", axes: ZERO_AXES };
  const evOpen = api.namingGenerate(invOpen, api.splitmix64(1), 0, 0.4);
  check("open 終止に撥音んが無い", evOpen.moras[evOpen.moras.length - 1]?.isN !== true);

  const invCut = { features: [{ kind: "edge", strength: 0.8 }, { kind: "mass", strength: 0.6 }],
                   closure: "cut", axes: ZERO_AXES };
  const evCut = api.namingGenerate(invCut, api.splitmix64(42), 0, 0.4);
  const lastCut = evCut.moras[evCut.moras.length - 1];
  check("cut 終止 (2モーラ以上) は最終モーラに促音 gap", (lastCut?.gapMs ?? 0) > 0,
        JSON.stringify(lastCut));
  check("cut 終止の末尾に撥音んが無い", lastCut?.isN !== true);
  check("cut 終止が語末促音 (禁止表現) になっていない", lastCut?.isQ !== true);

  const invLong = { features: [{ kind: "flat", strength: 0.8 }], closure: "long", axes: ZERO_AXES };
  const evLong = api.namingGenerate(invLong, api.splitmix64(7), 0, 0.4);
  const lastLong = evLong.moras[evLong.moras.length - 1];
  const prevLong = evLong.moras[evLong.moras.length - 2];
  check("long 終止は2モーラ以上", evLong.moras.length >= 2, api.namingKanaOf(evLong.moras));
  check("long 終止の末尾は onset なし", lastLong?.onset === null);
  check("long 終止の末尾が直前と同母音", prevLong && lastLong?.nucleus === prevLong.nucleus,
        JSON.stringify({ last: lastLong, prev: prevLong }));
}

console.log("── 10. contrast: スロット数 ──");
{
  const inv = { features: [{ kind: "mass", strength: 0.9 }], closure: "nasal", axes: ZERO_AXES };
  const base = api.namingSlots(inv, 0);
  const contrasted = api.namingSlots(inv, 1.0);
  check("contrast 0 は尾スロットなし (1スロット)", base.length === 1, `len=${base.length}`);
  check("contrast 1.0 でスロット+1", contrasted.length === base.length + 1,
        `base=${base.length} contrasted=${contrasted.length}`);
  check("対照尾は1モーラ", contrasted[contrasted.length - 1]?.moraCount === 1);
}

console.log("── 11. mass 頭 + contrast 1.0 → ドデカミン型 (頭>尾の Δsize) ──");
{
  // MoraAxes.vbias (OnomatoiCore/Core/MoraAxes.swift) の size 成分の移植: 「語→軸」の逆推定
  // 専用テーブル (生成側 VOWEL_BIAS とは別物 — 例えば u は生成側 +0.20・逆推定側 -0.30 で符号が
  // 違う。Swift の NamingPlacementTests.testContrastDodekaminDirection と同じ物差しで測る)。
  const vbiasSize = v => ({ a: 0.6, i: -0.6, u: -0.3, e: 0.0, o: 0.4 }[v] ?? 0);
  const inv = { features: [{ kind: "mass", strength: 0.9 }], closure: "nasal", axes: ZERO_AXES };
  let positive = 0, total = 0;
  for (let seed = 0; seed < 40; seed++) {
    const ev = api.namingGenerate(inv, api.splitmix64(seed), 1.0, 0.4);
    const cv = ev.moras.filter(m => !m.isN);
    if (cv.length < 2) continue;
    const head = cv[0], tail = cv[cv.length - 1];
    total++;
    if (vbiasSize(head.nucleus) - vbiasSize(tail.nucleus) > 0) positive++;
  }
  const rate = positive / Math.max(1, total);
  // Swift 側の実測基準 (testContrastDodekaminDirection) と同じ閾値 0.7。
  check("締め型の Δsize (頭−尾) が正になる率 (>=0.7)", rate >= 0.7, `rate=${rate}`);
}

console.log("── 12. nasal 昇格は強い頭のみ ──");
{
  const strong = { features: [{ kind: "mass", strength: 0.9 }], closure: "open", axes: ZERO_AXES };
  const evStrong = api.namingGenerate(strong, api.splitmix64(3), 1.0, 0.4);
  check("強い頭 (mass) × contrast1.0 の open が ん に昇格", evStrong.moras[evStrong.moras.length - 1]?.isN === true,
        api.namingKanaOf(evStrong.moras));

  const soft = { features: [{ kind: "round", strength: 0.9 }], closure: "open", axes: ZERO_AXES };
  const evSoft = api.namingGenerate(soft, api.splitmix64(3), 1.0, 0.4);
  check("丸い頭 (極性負) は nasal 昇格しない", evSoft.moras[evSoft.moras.length - 1]?.isN !== true,
        api.namingKanaOf(evSoft.moras));
}

console.log("── 13. namingGenerateClean の NG フィルタ ──");
{
  const representatives = [
    { features: [{ kind: "round", strength: 0.9 }], closure: "nasal", axes: ZERO_AXES },
    { features: [{ kind: "spike", strength: 0.9 }, { kind: "edge", strength: 0.5 }], closure: "open", axes: ZERO_AXES },
    { features: [{ kind: "mass", strength: 0.8 }, { kind: "round", strength: 0.4 }], closure: "cut", axes: ZERO_AXES },
  ];
  let allClean = true, sample = "";
  for (const inv of representatives) {
    for (let seed = 0; seed < 10; seed++) {
      const ev = api.namingGenerateClean(inv, seed);
      const kana = api.namingKanaOf(ev.moras);
      if (!api.namingIsClean(kana)) { allClean = false; sample = kana; }
    }
  }
  check("namingGenerateClean が NG 語を通さない", allClean, sample);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
