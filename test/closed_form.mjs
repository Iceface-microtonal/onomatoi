// closed_form.mjs — Step1 閉形の正準化の性質テスト (2026-07-17)
//
// 方針 (Icefaceさん 2026-07-17): ブーバ/キキは「見えた、完成された形」の印象 —
// 軌跡は正確に測るが、最終的な重みは出来上がった形。Step1 = 閉じたストロークを
// 輪郭として正準化 (終端スナップ + 最直線位置への回転) し、描き始めの頂点も
// 他の角と同じ規則で数える。始点・描く向きに不変。
//
// 発端 fixture: 三角レポート mrnqm2sk-32 (research/feedback/iceface_2026-07-16_triangle.json)
// — 頂点で描き切った三角が角2 (頂点欠損) で rodorada になっていた。
//
// 実行: node test/closed_form.mjs

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
      blocks.push(lines.slice(start_or(i), end + 1).join("\n"));
      i = end + 1;
      continue;
    }
    i++;
  }
  function start_or(x) { return x; }
  return blocks.filter(b => !IMPURE.test(b)).join("\n\n");
}

const engineSrc = extractEngine(fs.readFileSync(HTML_PATH, "utf8"));
const EXPORTS = ["strokeComplexity", "splineDensified", "densified", "extractAxes",
  "applyHandCorrection", "bucketedAxes", "circleVocabSignal", "generate", "mulberry32",
  "heartRecognitionLevelFor", "heartVocabSignal", "heartVocabWord", "starVocabSignal",
  "oneStrokePentagramVocabSignal", "outlineStarVocabSignal",
  "vocabEvent", "romajiOf", "HEART_VOCAB", "HEART_CLEAN_VOCAB", "STAR_VOCAB",
  "ONE_STROKE_PENTAGRAM_VOCAB"];
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
function cxOf(beads) {
  return api.strokeComplexity(api.splineDensified(beads, 6), W, H, 16);
}
function jittered(pts, amp = 1.5) {
  let s = 0x12345678;
  const rnd = () => {
    s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
  return pts.map(p => ({ x: p.x + (rnd() * 2 - 1) * amp, y: p.y + (rnd() * 2 - 1) * amp }));
}

// ─── 実レポートの三角 (mrnqm2sk-32・頂点から描き切り) ───
const TRI = [[0.456,0.151],[0.431,0.171],[0.397,0.245],[0.371,0.294],[0.344,0.346],[0.317,0.397],[0.295,0.442],[0.276,0.483],[0.252,0.533],[0.295,0.55],[0.34,0.55],[0.393,0.55],[0.446,0.55],[0.498,0.55],[0.543,0.55],[0.583,0.55],[0.617,0.55],[0.655,0.546],[0.647,0.494],[0.629,0.455],[0.607,0.4],[0.582,0.346],[0.556,0.294],[0.529,0.249],[0.504,0.209],[0.479,0.174],[0.457,0.147]]
  .map(([x, y]) => ({ x: x * W, y: y * H }));

console.log("── 三角レポート (実描線): 頂点=形の角 ──");
{
  const cx = cxOf(TRI);
  check("角 3 (頂点が数えられる)", cx.corners === 3,
        JSON.stringify({ cor: cx.corners, cs: +cx.cornerSharpness.toFixed(2) }));
  check("閉形・回転 ≈1", cx.isClosed && Math.abs(cx.rotationFraction - 1) < 0.25,
        JSON.stringify({ rot: +cx.rotationFraction.toFixed(2) }));
  check("5 モーラ (角3+ループ1+サイズ)", cx.moraCount === 5, `mc=${cx.moraCount}`);
  check("確定▲の座標が 3 点返る", (cx.cornerPoints || []).length === 3);
  // ○→▲ (2026-07-17): 各角の dx/dy = 外向き二等分線。凸形なら「重心から離れる向き」
  // (dot(dir, 角−重心) > 0) かつ単位ベクトル — ▲が角の外側から角を指す前提。
  {
    const gx = TRI.reduce((a, p) => a + p.x, 0) / TRI.length;
    const gy = TRI.reduce((a, p) => a + p.y, 0) / TRI.length;
    const ok = cx.cornerPoints.every(p =>
      Number.isFinite(p.dx) && Number.isFinite(p.dy)
      && Math.abs(Math.hypot(p.dx, p.dy) - 1) < 1e-6
      && p.dx * (p.x - gx) + p.dy * (p.y - gy) > 0);
    check("確定▲の向き = 外向き二等分線 (単位・重心から離れる向き)", ok,
          JSON.stringify(cx.cornerPoints.map(p => ({ dx: +(p.dx ?? 9).toFixed(2), dy: +(p.dy ?? 9).toFixed(2) }))));
  }
}

console.log("── 不変性: どこから・どちら回りに描いても同じ形は同じ測定 ──");
{
  const base = cxOf(TRI);
  // 始点を底辺左角へ回した同じ輪郭 (末尾の閉じ足しを除いて回転)
  const ring = TRI.slice(0, TRI.length - 1);
  for (const shift of [5, 8, 14, 20]) {
    const rot = ring.slice(shift).concat(ring.slice(0, shift));
    rot.push({ ...rot[0] });   // 閉じ足し (実描画と同じく始点近くで終わる)
    const cx = cxOf(rot);
    check(`始点シフト+${shift}: 角 ${base.corners} / mc ${base.moraCount} を保持`,
          cx.corners === base.corners && cx.moraCount === base.moraCount,
          JSON.stringify({ cor: cx.corners, mc: cx.moraCount }));
  }
  const rev = [...TRI].reverse();
  const cxR = cxOf(rev);
  check("逆回り: 角/モーラ数を保持",
        cxR.corners === base.corners && cxR.moraCount === base.moraCount,
        JSON.stringify({ cor: cxR.corners, mc: cxR.moraCount }));
}

console.log("── 合成形 (jitter 込み・実描画条件) ──");
{
  // 閉じた四角 (一周・角4)
  const sq = [];
  const cs = [[100,100],[260,100],[260,260],[100,260]];
  for (let e = 0; e < 4; e++) {
    const [ax, ay] = cs[e], [bx, by] = cs[(e + 1) % 4];
    for (let t = 0; t < 10; t++) sq.push({ x: ax + (bx - ax) * t / 10, y: ay + (by - ay) * t / 10 });
  }
  sq.push({ x: 101, y: 102 });   // 始点近くで描き終える
  const cx1 = cxOf(sq), cx2 = cxOf(jittered(sq));
  check("閉じた四角 → 角 4", cx1.corners === 4, `cor=${cx1.corners}`);
  check("閉じた四角 (jitter) → 角 4", cx2.corners === 4, `cor=${cx2.corners}`);
  // 円: 角 0 のまま・aaan ゲートも維持
  const circle = [];
  for (let i = 0; i <= 72; i++) {
    const t = i / 72 * 2 * Math.PI;
    circle.push({ x: 180 + 120 * Math.cos(t), y: 180 + 120 * Math.sin(t) });
  }
  for (const [label, ptsC] of [["円", circle], ["円 (jitter)", jittered(circle)]]) {
    const cx = cxOf(ptsC);
    const ax = api.bucketedAxes(api.applyHandCorrection(
      api.extractAxes(api.densified(ptsC, 6), W, H), 0.0, false), 0.25);
    check(`${label} → 角 0・aaan ゲート維持`, cx.corners === 0 && api.circleVocabSignal(cx, ax),
          JSON.stringify({ cor: cx.corners, rot: +cx.rotationFraction.toFixed(2) }));
  }
  // 開いた線は従来どおり (正準化は閉形のみ): ジグザグ 5 角
  const zig = [];
  for (let i = 0; i <= 5; i++) {
    zig.push({ x: 60 + i * 48, y: i % 2 === 0 ? 120 : 260 });
  }
  const zigDense = [];
  for (let i = 0; i < zig.length - 1; i++) {
    for (let t = 0; t < 12; t++) {
      zigDense.push({ x: zig[i].x + (zig[i+1].x - zig[i].x) * t / 12,
                      y: zig[i].y + (zig[i+1].y - zig[i].y) * t / 12 });
    }
  }
  zigDense.push(zig[zig.length - 1]);
  const cxZ = cxOf(zigDense);
  check("開いたジグザグ → 角 4 以上 (開いた線の規則は不変)", cxZ.corners >= 4 && !cxZ.isClosed,
        JSON.stringify({ cor: cxZ.corners, closed: cxZ.isClosed }));
}

console.log("── Step2: 転回集中度 → 形の K (formK・P3 の形式化) ──");
{
  const f = beads => cxOf(beads).formK;
  const triK = f(TRI), triKj = f(jittered(TRI));
  check("三角 (実レポート) formK ≥ +0.3 (破裂圏)", triK !== null && triK >= 0.3,
        `formK=${triK?.toFixed(2)}`);
  check("三角 jitter でも安定 (±0.15)", triKj !== null && Math.abs(triKj - triK) < 0.15,
        `formK=${triKj?.toFixed(2)}`);
  const sq = [];
  const cs4 = [[100, 100], [260, 100], [260, 260], [100, 260]];
  for (let e = 0; e < 4; e++) {
    const [ax, ay] = cs4[e], [bx, by] = cs4[(e + 1) % 4];
    for (let t = 0; t < 10; t++) sq.push({ x: ax + (bx - ax) * t / 10, y: ay + (by - ay) * t / 10 });
  }
  sq.push({ x: 101, y: 102 });
  const sqK = f(sq);
  check("四角 formK ≥ +0.3", sqK !== null && sqK >= 0.3, `formK=${sqK?.toFixed(2)}`);
  const circle = [];
  for (let i = 0; i <= 72; i++) {
    const t = i / 72 * 2 * Math.PI;
    circle.push({ x: 180 + 120 * Math.cos(t), y: 180 + 120 * Math.sin(t) });
  }
  const cK = f(circle), cKj = f(jittered(circle));
  check("円 formK ≤ −0.7 (ブーバ)", cK !== null && cK <= -0.7, `formK=${cK?.toFixed(2)}`);
  check("円 jitter でも ≤ −0.7", cKj !== null && cKj <= -0.7, `formK=${cKj?.toFixed(2)}`);
  const blob = [];
  for (let i = 0; i <= 80; i++) {
    const t = i / 80 * 2 * Math.PI;
    const r = 110 + 14 * Math.sin(3 * t);
    blob.push({ x: 180 + r * Math.cos(t), y: 180 + 0.8 * r * Math.sin(t) });
  }
  const bK = f(blob);
  check("丸みブロブ formK ≤ −0.6", bK !== null && bK <= -0.6, `formK=${bK?.toFixed(2)}`);
  // 渦 = 単純な輪郭ではない → formK null (軌跡層の担当。巻きパッドの接続跳びで
  // 偽の角 +0.5 級が出る事故を紙面効率ゲート <3.2 で防ぐ — 実測で踏んだ)
  const spiral = [];
  for (let i = 0; i <= 160; i++) {
    const t = i / 160 * 2.2 * 2 * Math.PI;
    const r = 120 - 25 * (t / (2 * Math.PI));
    spiral.push({ x: 180 + r * Math.cos(t), y: 180 + r * Math.sin(t) });
  }
  check("渦 (非単純形) は formK null = 正準化対象外", cxOf(spiral).formK === null);
  // 開いた線も null (従来の軌跡 K)
  const line = [];
  for (let i = 0; i <= 30; i++) line.push({ x: 60 + i * 8, y: 120 + i * 3 });
  check("開いた線は formK null", cxOf(line).formK === null);
}

console.log("── Step3: なぞり直しの正準化 (N 周 → 1 周に畳んで同一視) ──");
{
  const circ = (turns) => {
    const p = [];
    const n = Math.round(60 * turns);
    for (let i = 0; i <= n; i++) {
      const t = i / n * turns * 2 * Math.PI;
      p.push({ x: 180 + 120 * Math.cos(t), y: 180 + 120 * Math.sin(t) });
    }
    return p;
  };
  const tri = (turns) => {
    const V = [[0, -1], [0.866, 0.5], [-0.866, 0.5]];
    const p = [];
    const per = 90, n = per * turns;
    for (let i = 0; i <= n; i++) {
      const u = (i / per) % 1, s = Math.floor(u * 3) % 3, f = u * 3 - Math.floor(u * 3);
      const a = V[s], b = V[(s + 1) % 3];
      p.push({ x: 180 + 120 * (a[0] + (b[0] - a[0]) * f), y: 180 + 120 * (a[1] + (b[1] - a[1]) * f) });
    }
    return p;
  };
  // 2周・3周の円 → 単一円と同じ測定 (formK ≈ −0.85・角0)
  const c1 = cxOf(circ(1)), c2 = cxOf(circ(2)), c3 = cxOf(circ(3));
  check("円2周 → formK ≈ 単一円 (±0.1)", c2.formK !== null && Math.abs(c2.formK - c1.formK) < 0.1,
        `1周=${c1.formK?.toFixed(2)} 2周=${c2.formK?.toFixed(2)}`);
  check("円2周 → 角0 (なぞりが偽の角を作らない)", c2.corners === 0, `cor=${c2.corners}`);
  check("円3周 → formK ≈ 単一円", c3.formK !== null && Math.abs(c3.formK - c1.formK) < 0.1,
        `3周=${c3.formK?.toFixed(2)}`);
  check("円2周 jitter → 角0・formK 安定", (() => {
    const j = cxOf(jittered(circ(2)));
    return j.corners === 0 && j.formK !== null && Math.abs(j.formK - c1.formK) < 0.15;
  })());
  // 三角2周 → 三角と同じ (角3・破裂圏)
  const t1 = cxOf(tri(1)), t2 = cxOf(tri(2));
  check("三角2周 → 角3 (単一三角と同じ)", t2.corners === 3, `cor=${t2.corners}`);
  check("三角2周 → formK ≈ 三角 (±0.1)", t2.formK !== null && Math.abs(t2.formK - t1.formK) < 0.1,
        `1周=${t1.formK?.toFixed(2)} 2周=${t2.formK?.toFixed(2)}`);
  // 渦 (半径が縮む) は畳まない → 軌跡層 (formK null)
  const spiral = [];
  for (let i = 0; i <= 154; i++) {
    const t = i / 154 * 2.2 * 2 * Math.PI;
    const r = 130 * (1 - 0.75 * (i / 154));
    spiral.push({ x: 180 + r * Math.cos(t), y: 180 + r * Math.sin(t) });
  }
  check("渦 (半径縮む) → 畳まない・formK null", cxOf(spiral).formK === null);
  // 連ループびーびー (別位置のループ) は畳まない → 軌跡層 (複数モーラを保つ)
  const chain = [];
  for (const [c0x] of [[120], [999]]) void c0x;
  const lap = (ox) => { const p = []; for (let i = 0; i <= 50; i++) { const t = i / 50 * 2 * Math.PI; p.push({ x: ox + 45 * Math.cos(t), y: 180 + 45 * Math.sin(t) }); } return p; };
  for (const q of lap(120)) chain.push(q);
  for (let t = 0; t < 8; t++) chain.push({ x: 120 + 120 * t / 8, y: 180 });
  for (const q of lap(240)) chain.push(q);
  const ch = cxOf(chain);
  check("連ループびーびー → 畳まない (formK null・複数モーラ保持)",
        ch.formK === null && ch.moraCount >= 3, `formK=${ch.formK} mc=${ch.moraCount}`);
}

console.log("── アーキタイプ監査 #1〜#3 (2026-07-17): 想定ユーザーの描き方 ──");
{
  // 実描画条件: 入力は常時「粗い筆」珠化 (canvas対角×0.022 ステップ) を通る —
  // 密な合成点列を直接入れると実機と別の解像度レジームになる (地雷: 診断は実描画条件で)。
  const beadify = (pts) => {
    const step = Math.hypot(W, H) * 0.022;
    const out = [pts[0]];
    for (const p of pts) {
      const l = out[out.length - 1];
      if (Math.hypot(p.x - l.x, p.y - l.y) >= step) out.push(p);
    }
    return out;
  };
  const cxB = (pts) => cxOf(beadify(pts));
  const line = (x1, y1, x2, y2, n = 40) => {
    const p = [];
    for (let i = 0; i <= n; i++) p.push({ x: x1 + (x2 - x1) * i / n, y: y1 + (y2 - y1) * i / n });
    return p;
  };
  // #1 8の字: 転回が相殺する閉形 — 円と同じ formK −0.85 を与えない (rot/cc ガード)
  const eight = [];
  for (let i = 0; i <= 120; i++) {
    const t = i / 120 * 2 * Math.PI;
    eight.push({ x: 180 + 110 * Math.sin(t), y: 180 + 70 * Math.sin(2 * t) });
  }
  const e8 = cxB(eight);
  check("#1 8の字 → formK null (軌跡層=単位語圏へ)", e8.formK === null,
        JSON.stringify({ formK: e8.formK, rot: +e8.rotationFraction.toFixed(2),
                         cc: +e8.curveConsistency.toFixed(2) }));
  // #2 星 (5芒星・自己交差): 紙面効率 3.62 でも「形」— formK が立ちキキ圏
  const star = (() => {
    const p = [];
    const R = 130, pts = [];
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + i * 4 * Math.PI / 5;
      pts.push([180 + R * Math.cos(a), 180 + R * Math.sin(a)]);
    }
    pts.push(pts[0]);
    for (let i = 0; i < pts.length - 1; i++)
      for (const q of line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], 20)) p.push(q);
    return p;
  })();
  const st = cxB(star), stJ = cxB(jittered(star));
  check("#2 星 → formK ≥ 0.5 (キキ圏・旧: null→軌跡Kで最ブーバに逆転)",
        st.formK !== null && st.formK >= 0.5, `formK=${st.formK}`);
  check("#2 星 (jitter) → formK ≥ 0.5", stJ.formK !== null && stJ.formK >= 0.5,
        `formK=${stJ.formK}`);
  check("一筆五芒星 → 専用固定語ゲート", api.oneStrokePentagramVocabSignal(st),
        JSON.stringify({ order: st.trajectoryDescriptor.radialSymmetryOrder,
                         strength: +st.trajectoryDescriptor.radialSymmetryStrength.toFixed(2),
                         crossings: st.trajectoryDescriptor.selfIntersectionCount,
                         selected: st.shapeRecognition.selected }));
  check("一筆五芒星の固定語 = ayanoparu (あやのぱる)",
        api.romajiOf(api.vocabEvent(api.ONE_STROKE_PENTAGRAM_VOCAB,
          { size: 0, sharp: 0, tex: 0, bright: 0, round: 0, open: 0 })) === "ayanoparu");

  const outlineStar = (() => {
    const p = [], vs = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 === 0 ? 125 : 56;
      vs.push([180 + r * Math.cos(a), 180 + r * Math.sin(a)]);
    }
    vs.push(vs[0]);
    for (let i = 0; i < vs.length - 1; i++)
      for (const q of line(vs[i][0], vs[i][1], vs[i + 1][0], vs[i + 1][1], 12)) p.push(q);
    return p;
  })();
  const os = cxB(outlineStar);
  check("輪郭星 → chigyaan固定語ゲート", api.outlineStarVocabSignal(os),
        JSON.stringify({ concavity: +os.shapeDescriptor.concavityDepth.toFixed(2),
                         tips: os.shapeDescriptor.tipCount,
                         solidity: +os.shapeDescriptor.solidity.toFixed(2),
                         order: os.trajectoryDescriptor.radialSymmetryOrder,
                         selected: os.shapeRecognition.selected }));

  const heart = [];
  for (let i = 0; i < 180; i++) {
    const t = i / 180 * 2 * Math.PI;
    const x = 16 * Math.sin(t) ** 3;
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    heart.push({ x: 180 + 7.2 * x, y: 180 - 7.2 * y });
  }
  heart.push(heart[0]);
  const he = cxB(heart);
  check("ハート → ハートの仮固定語ゲート", api.heartVocabSignal(he),
        JSON.stringify({ confidence: +he.heartConfidence.toFixed(2),
                         concavity: +he.shapeDescriptor.concavityDepth.toFixed(2),
                         symmetry: +he.shapeDescriptor.bilateralSymmetry.toFixed(2),
                         lobes: he.shapeDescriptor.lobeCount, tips: he.shapeDescriptor.tipCount }));
  check("整ったハート = 認識度3", he.heartRecognitionLevel === 3,
        `level=${he.heartRecognitionLevel} confidence=${he.heartConfidence}`);
  check("認識度3の固定語 = kuun (くぅん)",
        api.romajiOf(api.vocabEvent(api.heartVocabWord(he),
          { size: 0, sharp: 0, tex: 0, bright: 0, round: 0, open: 0 })) === "kuun");
  check("ハート認識度の閾値 = 1/2/3",
        api.heartRecognitionLevelFor(0.40) === 1
          && api.heartRecognitionLevelFor(0.62) === 2
          && api.heartRecognitionLevelFor(0.82) === 3
          && api.heartRecognitionLevelFor(0.399) === 0);

  const cubic = (p0, p1, p2, p3, steps = 45) => {
    const out = [];
    for (let i = 0; i < steps; i++) {
      const t = i / steps, u = 1 - t;
      const b0 = u ** 3, b1 = 3 * u * u * t, b2 = 3 * u * t * t, b3 = t ** 3;
      out.push({ x: b0*p0.x + b1*p1.x + b2*p2.x + b3*p3.x,
                 y: b0*p0.y + b1*p1.y + b2*p2.y + b3*p3.y });
    }
    return out;
  };
  const notch = {x:180,y:120}, right = {x:295,y:135};
  const bottom = {x:180,y:265}, left = {x:65,y:135};
  const roundedHeart = [
    ...cubic(notch,{x:218,y:82},{x:285,y:72},right),
    ...cubic(right,{x:305,y:195},{x:250,y:255},bottom),
    ...cubic(bottom,{x:110,y:260},{x:55,y:200},left),
    ...cubic(left,{x:70,y:80},{x:145,y:86},notch), notch,
  ];
  const rounded = api.strokeComplexity(roundedHeart, W, H, 16);
  check("下端が丸い崩れハートも認識度1/2で救済",
        [1, 2].includes(rounded.heartRecognitionLevel) && api.heartVocabSignal(rounded),
        JSON.stringify({ level: rounded.heartRecognitionLevel,
                         confidence: +rounded.heartConfidence.toFixed(2),
                         descriptor: rounded.shapeDescriptor }));
  check("認識度1/2の固定語 = myuun (みゅーん)",
        api.heartVocabWord(rounded) === api.HEART_VOCAB);
  const closedVariant = (pts, rotation, reversed, shift) => {
    let open = pts.slice(0, -1).map(p => {
      const x = p.x - 180, y = p.y - 180;
      return { x: 180 + x * Math.cos(rotation) - y * Math.sin(rotation),
               y: 180 + x * Math.sin(rotation) + y * Math.cos(rotation) };
    });
    if (reversed) open.reverse();
    const s = ((shift % open.length) + open.length) % open.length;
    open = open.slice(s).concat(open.slice(0, s));
    return open.concat([open[0]]);
  };
  for (const [label, pts] of [
    ["ハート回転", closedVariant(heart, 0.73, false, 0)],
    ["ハート逆回り", closedVariant(heart, -0.41, true, 0)],
    ["ハート始点移動", closedVariant(heart, 0.18, false, 57)],
  ]) {
    const variant = cxB(pts);
    check(`${label} → 認識度3 kuun を保持`,
          variant.heartRecognitionLevel === 3
            && api.heartVocabWord(variant) === api.HEART_CLEAN_VOCAB);
  }
  for (const [label, pts] of [
    ["輪郭星回転", closedVariant(outlineStar, 0.51, false, 0)],
    ["輪郭星逆回り+始点移動", closedVariant(outlineStar, -0.32, true, 37)],
  ]) check(`${label} → chigyaan ゲートを保持`, api.outlineStarVocabSignal(cxB(pts)));

  const flower = [];
  for (let i = 0; i <= 240; i++) {
    const t = i / 240 * 2 * Math.PI, r = 88 + 24 * Math.cos(5 * t);
    flower.push({ x: 180 + r * Math.cos(t), y: 180 + r * Math.sin(t) });
  }
  const fl = cxB(flower);
  check("滑らかな5弁花 → 星に吸収しない", !api.starVocabSignal(fl),
        JSON.stringify({ solidity: +fl.shapeDescriptor.solidity.toFixed(2),
                         order: fl.trajectoryDescriptor.radialSymmetryOrder,
                         selected: fl.shapeRecognition.selected }));
  // #3 労力チャネル: 往復系 (P1 が角を設計どおり除外する形) でも語長が労力に応じる
  const hatch = (() => {
    const p = [];
    let x = 80;
    for (let r = 0; r < 7; r++) {
      const up = r % 2 === 0;
      for (const q of line(x, up ? 260 : 80, x, up ? 80 : 260, 12)) p.push(q);
      x += 32;
      for (const q of line(x - 32, up ? 80 : 260, x, up ? 80 : 260, 3)) p.push(q);
    }
    return p;
  })();
  const ht = cxB(hatch);
  check("#3 ハッチング → mc ≥ 5 (旧: 92珠の労力が 1 モーラ)", ht.moraCount >= 5,
        `mc=${ht.moraCount} rev=${ht.reversals}`);
  check("#3 ハッチング → 角 0 のまま (P1 の意味論は不変・語長だけ底上げ)", ht.corners === 0,
        `cor=${ht.corners}`);
  const fill = (() => {
    const p = [];
    let y = 140;
    for (let r = 0; r < 14; r++) {
      const dir = r % 2 ? -1 : 1;
      for (const q of line(dir > 0 ? 140 : 220, y, dir > 0 ? 220 : 140, y, 10)) p.push(q);
      y += 6;
    }
    return p;
  })();
  check("#3 塗りつぶし → mc ≥ 5", cxB(fill).moraCount >= 5,
        `mc=${cxB(fill).moraCount}`);
  // #3 U字デッドゾーン (折返し幅 16〜32px で角も労力も消えていた帯)
  for (const gap of [16, 24, 32]) {
    const u = [...line(180, 80, 180, 260, 24), ...line(180 + gap, 260, 180 + gap, 80, 24)];
    const cu = cxB(u);
    check(`#3 U字 幅${gap}px → mc ≥ 2 (デッドゾーン解消)`, cu.moraCount >= 2,
          `mc=${cu.moraCount} rev=${cu.reversals}`);
  }
  // ✓ (kS): 頂点が角として立ち、弧語彙 (muu) に誤爆しない
  const checkmark = [...line(110, 180, 160, 240, 10), ...line(160, 240, 260, 110, 20)];
  const cm = cxB(checkmark);
  check("✓ → 角 1 (kS: 短ストロークの spread 誤棄却の根治)", cm.corners === 1,
        `cor=${cm.corners}`);
  check("✓ → 弧語彙に落ちない", !api.circleVocabSignal(cm, { round: 0, open: 0 }) && cm.corners > 0);
  // 回帰: 基準形の測定は不変
  const circle = [];
  for (let i = 0; i <= 72; i++) {
    const t = i / 72 * 2 * Math.PI;
    circle.push({ x: 180 + 120 * Math.cos(t), y: 180 + 120 * Math.sin(t) });
  }
  const ci = cxOf(circle);
  check("回帰: 円 formK −0.85・mc 2 不変", Math.abs((ci.formK ?? 0) + 0.85) < 0.01 && ci.moraCount === 2,
        JSON.stringify({ formK: ci.formK, mc: ci.moraCount }));
  const tr = cxOf(TRI);
  check("回帰: 三角 角3・mc5 不変", tr.corners === 3 && tr.moraCount === 5,
        JSON.stringify({ cor: tr.corners, mc: tr.moraCount }));
}

console.log("── #4 乱雑度 (立法提案・kikiパラメータ方式=null で厳密互換) ──");
{
  const beadify = (pts) => {
    const step = Math.hypot(W, H) * 0.022;
    const out = [pts[0]];
    for (const p of pts) {
      const l = out[out.length - 1];
      if (Math.hypot(p.x - l.x, p.y - l.y) >= step) out.push(p);
    }
    return out;
  };
  const cxB = (pts) => cxOf(beadify(pts));
  const line = (x1, y1, x2, y2, n = 40) => {
    const p = [];
    for (let i = 0; i <= n; i++) p.push({ x: x1 + (x2 - x1) * i / n, y: y1 + (y2 - y1) * i / n });
    return p;
  };
  // なぐり書き (決定的疑似乱数のジャンプ列): 乱雑 ≥0.6
  const scribble = (seed, jumps, lo, span) => {
    let s = seed;
    const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    const p = [{ x: 180, y: 180 }];
    for (let i = 0; i < jumps; i++) {
      const last = p[p.length - 1];
      for (const q of line(last.x, last.y, lo + rnd() * span, lo + rnd() * span, 4)) p.push(q);
    }
    return p;
  };
  const sc1 = cxB(scribble(12345, 60, 60, 240));
  check("なぐり書き → 乱雑度 ≥ 0.6", sc1.disorder >= 0.6, `dis=${sc1.disorder.toFixed(2)}`);
  const sc2 = cxB(jittered(scribble(777, 25, 120, 120)));
  check("小さいなぐり書き (jitter) → 乱雑度 ≥ 0.5", sc2.disorder >= 0.5, `dis=${sc2.disorder.toFixed(2)}`);
  // 規則形は全て閾値 0.4 未満 = 生成に注入されない (従来と厳密互換)
  const hatch = (() => {
    const p = [];
    let x = 80;
    for (let r = 0; r < 7; r++) {
      const up = r % 2 === 0;
      for (const q of line(x, up ? 260 : 80, x, up ? 80 : 260, 12)) p.push(q);
      x += 32;
      for (const q of line(x - 32, up ? 80 : 260, x, up ? 80 : 260, 3)) p.push(q);
    }
    return p;
  })();
  const zig = (() => {
    const p = [];
    let x = 40;
    for (let i = 0; i < 12; i++) {
      for (const q of line(x, i % 2 ? 110 : 250, x + 25, i % 2 ? 250 : 110, 6)) p.push(q);
      x += 25;
    }
    return p;
  })();
  const star = (() => {
    const p = [];
    const vs = [];
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + i * 4 * Math.PI / 5;
      vs.push([180 + 130 * Math.cos(a), 180 + 130 * Math.sin(a)]);
    }
    vs.push(vs[0]);
    for (let i = 0; i < vs.length - 1; i++)
      for (const q of line(vs[i][0], vs[i][1], vs[i + 1][0], vs[i + 1][1], 20)) p.push(q);
    return p;
  })();
  const wave = (() => {
    const p = [];
    for (let i = 0; i <= 90; i++) {
      const t = i / 90;
      p.push({ x: 40 + t * 280, y: 180 + 60 * Math.sin(t * 3 * 2 * Math.PI) });
    }
    return p;
  })();
  for (const [label, pts] of [["ハッチング", hatch], ["ジグザグ12山", zig],
                              ["星", star], ["波3山", wave]]) {
    const d = cxB(pts).disorder;
    check(`${label} → 乱雑度 < 0.4 (規則形は注入されない)`, d < 0.4, `dis=${d.toFixed(2)}`);
    const dj = cxB(jittered(pts)).disorder;
    check(`${label} (jitter) → 乱雑度 < 0.4`, dj < 0.4, `dis=${dj.toFixed(2)}`);
  }
  // 効果: disorder 注入で濁音・拗音率が上がる (200 シードの統計・決定的) /
  // null は同 seed で完全不変 (厳密後方互換)
  const ax0 = { size: 0.25, sharp: 0.25, tex: 0.5, bright: 0, round: 0, open: 0 };
  const messy = new Set(["g", "z", "j", "gy", "d", "b", "ch"]);
  const messyRate = (dis) => {
    let m = 0, total = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const rand = api.mulberry32(seed * 7919);
      const ev = api.generate(ax0, rand, 0.4, { moraCountOverride: 6, kiki: 0.3, disorder: dis });
      for (const mo of ev.moras) {
        if (mo.isN || mo.isSilentRest || !mo.onset) continue;
        total++;
        if (messy.has(mo.onset)) m++;
      }
    }
    return m / Math.max(1, total);
  };
  const wordAt = (dis) => {
    const rand = api.mulberry32(424242);
    return api.generate(ax0, rand, 0.4, { moraCountOverride: 6, kiki: 0.3, disorder: dis })
      .moras.map(m => (m.onset ?? "") + m.nucleus).join(",");
  };
  check("disorder=null → 同 seed で語が完全に不変", wordAt(null) === wordAt(null));
  const r0 = messyRate(null), r1 = messyRate(1.0);
  check("disorder=1.0 → 濁音・拗音率が +0.15 以上上がる (200シード統計)",
        r1 - r0 >= 0.15, `null=${r0.toFixed(2)} dis=${r1.toFixed(2)}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
