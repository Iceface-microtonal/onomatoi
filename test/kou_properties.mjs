// kou_properties.mjs — コウさんフィードバックの性質テスト (2026-07-12)
//
// 仕様の正本: Onomatoi/docs/FEEDBACK_2026-07-12_kou_phonetics_spec.md §4
// fixture:    Onomatoi/research/feedback/kou_2026-07-12.json (stroke 付き・決定的再生)
//
// 方式: iceface_onomatoi.html の <script> から純粋なエンジン宣言 (function/const/let で
// DOM/audio/storage に触れないもの) を自動抽出して vm で評価し、pointerup と同じ
// パイプライン (densified → extractAxes → handCorrection(0.5) → bucketedAxes(0.25) →
// strokeComplexity → drawK(0.125格子) → mannerProfile → sustained → segmentStroke →
// generateFromUnits / K整合ゲート×3) で fixture の描線を再生する。
//
// 判定は「語の完全一致」ではなく**性質** (破裂音を含む/歯茎硬口蓋を含まない等):
// 調整のたびに語が変わっても、コウさんの理由が満たされていれば green。
//
// 2層構造:
//   regression (👍) = 今も満たすべき性質。破れたら exit 1。
//   target     (👎) = 処方 P1〜P7 実装後に満たすべき性質。現状 FAIL は既知として報告のみ。
//                     STRICT=1 で enforce (全 green 達成後に昇格させる)。
//
// 実行: node test/kou_properties.mjs [fixture.json]
//
// 注意: 描線は正規化座標で保存されているため、再生キャンバスは 360×360 固定とする。
// 元端末のキャンバスが非正方の場合は縦横比が僅かに変わるが、性質判定には十分。

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML_PATH = path.resolve(__dirname, "../iceface_onomatoi.html");
const DEFAULT_FIXTURE = path.resolve(
  __dirname, "../../Onomatoi/research/feedback/kou_2026-07-12.json");

// ─── 1. エンジン抽出 ───────────────────────────────────────────
// <script> 内のトップレベル宣言を、文字列/テンプレート/コメントを認識しながら
// ブロック単位で切り出す。DOM/audio/storage に触れる宣言は除外。

const IMPURE = /\b(document|localStorage|sessionStorage|window|navigator|AudioContext|audioCtx|fetch\(|canvas|cctx|location|alert\(|requestAnimationFrame|history)\b/;

function extractEngine(html) {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  if (scripts.length === 0) throw new Error("no <script> found");
  const src = scripts.sort((a, b) => b.length - a.length)[0];

  const blocks = [];
  const lines = src.split("\n");
  // 行頭 (column 0) の宣言開始を探し、括弧バランスで終端まで読む
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
          if (inLC) break;                       // 行コメントは行末まで
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
          // 関数本体の閉じ } まで読み終えた (開始行だけの depth 0 は除外)
          if (/\}/.test(lines.slice(i, j + 1).join("\n"))) { end = j; break; }
        }
        if (isFunc && depth === 0 && j === i && /\{[\s\S]*\}\s*$/.test(line)) { end = j; break; }
      }
      if (end < 0) end = i;   // 変則行は1行だけ拾って先へ (安全側)
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
const EXPORTS = ["extractAxes", "applyHandCorrection", "bucketedAxes", "densified",
  "splineDensified", "strokeComplexity", "drawK", "mannerProfile", "segmentStroke",
  "unitEligible", "generateFromUnits", "generate", "axesSeed", "mulberry32",
  "wordK", "romajiOf", "openArcSignal", "openChevronSignal",
  "arcBulgeDirection", "arcSizeClass", "vocabEvent", "ARC_VOCAB", "CIRCLE_VOCAB",
  "heartVocabSignal", "heartVocabWord", "HEART_VOCAB", "HEART_CLEAN_VOCAB",
  "starVocabSignal", "STAR_VOCAB",
  "triangleVocabSignal", "TRIANGLE_VOCAB", "invertedTriangleVocabSignal", "INVERTED_TRIANGLE_VOCAB",
  "quadrilateralVocabSignal", "quadrilateralFamily", "SQUARE_VOCAB", "RECTANGLE_VOCAB",
  "segmentWord"];
const ctx = vm.createContext({ console });
vm.runInNewContext(
  engineSrc + `\n;globalThis.__api = { ${EXPORTS.join(", ")} };`,
  ctx, { filename: "engine(extracted)" });
const api = ctx.__api;
for (const name of EXPORTS) {
  // ARC_VOCAB / CIRCLE_VOCAB 等の定数も抽出対象 — 存在チェックのみ (関数とは限らない)。
  if (api[name] === undefined) throw new Error(`engine 抽出失敗: ${name} が見つからない`);
}

// ─── 2. fixture 再生 ───────────────────────────────────────────
//
// 主判定 = recorded モード: 当時のパイプラインが計算して fixture に保存した導出値
// (axes / k / cor / cs / lp) を生成段への入力にする。子音・母音・語形の選択段
// (処方 P2/P3/P4/P6/P7 の対象) を、幾何の再導出誤差なしで検証できる。
// ※元端末のキャンバス寸法は fbVersion 4 に未記録のため、stroke からの完全再導出は
//   スケール依存段 (角検出・densify) が 1 バケット程度ずれる — こちらは参考表示のみ
//   (P1/P5 = 幾何段の処方の検証には canvas 寸法の記録 (fbVersion 5) が必要)。

const W = 360, H = 360, HAND_CORR = 0.5;

/// 生成段 (pointerup 後半 = generateAndPlay の K 整合ゲート込み) の共通再現。
function runGeneration(ax, kDraw, cor, cs, loops, moraCount, sustained) {
  const mDraw = api.mannerProfile(ax.sharp, cor, cs, ax.tex, loops);
  const opts = { moraCountOverride: moraCount, kiki: kDraw, manner: mDraw,
                 sustained, lengthHint: moraCount };
  let best = null, bestD = Infinity;
  for (let a = 0; a < 3; a++) {
    const rand = api.mulberry32(api.axesSeed(ax, a));
    const ev = api.generate(ax, rand, 0.4, opts);
    const d = Math.abs(api.wordK(ev.moras) - opts.kiki);
    if (d < bestD) { best = ev; bestD = d; }
    if (d <= 0.35) break;
  }
  return best;
}

/// pointerup と同じ sustained 判定 (moraCount 以外は fixture に記録済み)。
function sustainedOf(rec, moraCount) {
  return rec.lp <= 1 && rec.cor <= 2 && rec.cs < 0.35
    && rec.axes.t < 0.3 && moraCount >= 2;
}

/// recorded モード: fixture の導出値を生成段へ。
/// cx.moraCount だけは fbVersion 4 に未記録 → **rec.word をチェックサムに 1..16 を
/// 探索して復元** (キャリブレーション)。エンジンが記録時から不変なら必ず一致する。
/// 一致が見つからない場合 = 記録後にエンジンが変わった (または fixture が別エンジン) —
/// rec.mora を近似に使い calibrated=false で報告する。
function replayRecorded(rec) {
  const a = rec.axes;
  const ax = { size: a.s, sharp: a.sh, tex: a.t, bright: a.b, round: a.r, open: a.o };
  // mc 注記 (fbVersion5 `mc` の前倒し・curator 永続化) があれば探索不要でそのまま使う。
  // これによりエンジンが記録時から変わっても「コウさん端末由来の正確な入力」で
  // 新エンジンを judged できる (キャンバス寸法差のある stroke 再導出より強い判定)。
  if (typeof rec.mc === "number") {
    const ev = runGeneration(ax, rec.k, rec.cor, rec.cs, rec.lp, rec.mc,
                             sustainedOf(rec, rec.mc));
    return { event: ev, ax, mc: rec.mc, calibrated: true, pinned: true };
  }
  for (let mc = 1; mc <= 16; mc++) {
    const ev = runGeneration(ax, rec.k, rec.cor, rec.cs, rec.lp, mc, sustainedOf(rec, mc));
    if (api.romajiOf(ev) === rec.word) return { event: ev, ax, mc, calibrated: true };
  }
  const mc = rec.mora;
  const event = runGeneration(ax, rec.k, rec.cor, rec.cs, rec.lp, mc, sustainedOf(rec, mc));
  return { event, ax, mc, calibrated: false };
}

/// stroke モード (参考): 描線から全段再導出。キャンバス寸法差で1バケットずれ得る。
function replayFromStroke(rec) {
  const beads = rec.stroke.map(([x, y]) => ({ x: x * W, y: y * H }));
  const inkPts = beads.length >= 2 ? api.densified(beads, 6) : beads;
  if (inkPts.length < 2) throw new Error("stroke too short");
  const raw = api.extractAxes(inkPts, W, H);
  let ax = api.applyHandCorrection(raw, HAND_CORR, false);   // coarse: dampenTexture=false
  ax = api.bucketedAxes(ax, 0.25);
  // P1: 角検出だけスプライン再構成幾何 (pointerup と同じ分岐)
  const geomPts = beads.length >= 3 ? api.splineDensified(beads, 6) : inkPts;
  const cx = api.strokeComplexity(geomPts, W, H, 16);
  let kDraw = api.drawK(ax.sharp, cx.corners, cx.cornerSharpness);
  kDraw = Math.round(kDraw / 0.125) * 0.125;
  const seg = api.segmentStroke(inkPts);
  let event;
  if (api.unitEligible(seg)) {
    const mDraw = api.mannerProfile(ax.sharp, cx.corners, cx.cornerSharpness, ax.tex, cx.loops);
    event = api.generateFromUnits(seg.units, W, H, ax, kDraw, 0.4, mDraw);
  } else {
    const sustained = cx.loops <= 1 && cx.corners <= 2 && cx.cornerSharpness < 0.35
      && ax.tex < 0.3 && cx.moraCount >= 2;
    event = runGeneration(ax, kDraw, cx.corners, cx.cornerSharpness, cx.loops,
                          cx.moraCount, sustained);
  }
  return { event, ax, cx, kDraw };
}

// ─── 3. 性質の登録 (spec §4) ─────────────────────────────────────

const PLOSIVE = new Set(["p", "t", "k", "b", "d", "g"]);           // ky/gy は拗音として別扱い
const ALVEOLO_PALATAL = new Set(["sh", "j", "ch"]);                // 歯茎硬口蓋
const PALATALIZED = new Set(["ky", "gy", "ny"]);                   // 拗音 (Cy)
const VOICELESS_FRIC = new Set(["s", "sh", "f", "h"]);             // 清音の摩擦
const onsets = ev => ev.moras.map(m => m.onset).filter(c => c !== null);
const nuclei = ev => ev.moras.filter(m => !m.isN).map(m => m.nucleus);
const hasOnset = (ev, set) => onsets(ev).some(c => set.has(c));
const endsWithN = ev => ev.moras.length > 0 && ev.moras[ev.moras.length - 1].isN;

// tier は fixture の vote から自動 (+1=regression / -1=target)。
const PROPERTIES = {
  // ── 2026-07-21 ラウンド (P13 三角立法・正本 = docs/FEEDBACK_2026-07-21_kou_triangle_vocab.md) ──
  "mrus5hvn-1": {  // 円 → aaan 👍 = P12 円則の初の実地承認
    // 2026-07-21 第2信 (サイズ3段立法) により、この円 (bbox対角比≈0.59=大クラス) の語形は
    // aaan → aaaan へ立法更新。👍の意味 (円が完成して ん が立つ) は保存され、語形のみ変化。
    desc: "円則が保たれる (当時 aaan 承認 → サイズ立法後は大円=aaaan)",
    check: () => p12VocabWord(p13FixtureStroke("mrus5hvn-1")) === "aaaan",
  },
  "mrus6t5v-1": {  // 三角 → gyadoon 👎 → P13 立法 gyagyoon
    // stroke は旧 export の末尾切り捨てで閉じが損失 → 記録済み cor/cs の pinned 判定
    // (cor=3 は v18 閉形正準化済み=閉。P11_CHECKS の同名注記参照)。
    desc: "P13 閉じた三角 → gyagyoon (ぎゃ=爆発・ぎょ=広がり・おー=空間・ん=完成)",
    check: () => {
      const rec = fixture.records.find(x => x.id === "mrus6t5v-1");
      const ax0 = { size: 0, sharp: 0, tex: 0, bright: 0, round: 0, open: 0 };
      return !!rec && api.triangleVocabSignal({ isClosed: true, corners: rec.cor, cornerSharpness: rec.cs })
        && api.romajiOf(api.vocabEvent(api.TRIANGLE_VOCAB, ax0)) === "gyagyoon";
    },
  },
  "mrfxxez7-3": {  // 丸 → aaaa 👍
    desc: "onset なし母音 run のまま (全モーラ onset=null)",
    check: ev => ev.moras.every(m => m.onset === null),
  },
  "mrgv5r43-1": {  // 丸 → joooo 👎
    desc: "onset に歯茎硬口蓋 (sh/j/ch) を含まない",
    check: ev => !hasOnset(ev, ALVEOLO_PALATAL),
  },
  "mrgv8z6l-3": {  // 縦線 → fun 👍
    desc: "先頭母音 u + 語末ん を保つ",
    check: ev => nuclei(ev)[0] === "u" && endsWithN(ev),
  },
  "mrgv9lk7-5": {  // 双こぶ山 → gyagigyogo 👎
    desc: "拗音 (ky/gy) と歯茎硬口蓋を使わない (軟口蓋 plain・母音は可)",
    check: ev => !hasOnset(ev, PALATALIZED) && !hasOnset(ev, ALVEOLO_PALATAL),
  },
  "mrgvewbq-1": {  // 緩い波 → nyoo 👍
    desc: "拗音鼻音 ny を保ち破裂音なし",
    check: ev => onsets(ev)[0] === "ny" && !hasOnset(ev, PLOSIVE),
  },
  "mrgvfeao-4": {  // 3こぶ波 → iiiii 👎
    desc: "onset を持つモーラが過半 (母音裸列にしない)",
    check: ev => ev.moras.filter(m => m.onset !== null).length > ev.moras.length / 2,
  },
  "mri8a7zz-2": {  // 長方形 → jon 👎
    desc: "破裂音 (p/t/k/b/d/g) を1つ以上含む",
    check: ev => hasOnset(ev, PLOSIVE),
  },
  "mriaoc95-1": {  // ドーム弧 → mii 👎
    desc: "両唇鼻音 m を保持 + 広母音 a 主体 + 語末ん",
    check: ev => hasOnset(ev, new Set(["m"]))
      && nuclei(ev).filter(v => v === "a").length >= nuclei(ev).length / 2
      && endsWithN(ev),
  },
  "mrib3e1u-1": {  // 流れるS字 → dunburi 👎
    desc: "破裂音を含まず、清音摩擦 (s/sh/f/h) で始まる",
    check: ev => !hasOnset(ev, PLOSIVE) && VOICELESS_FRIC.has(onsets(ev)[0]),
  },
  // ─── 第2ラウンド (2026-07-14・P1配備後): 幾何は正常化・残るは選択層 ───
  "mrkopj63-1": {  // 大きな四角 → bun 👎 (破裂音は出た・母音が課題)
    desc: "破裂音を維持しつつ、開放の大四角は母音 a 主体 (P9 母音の意味論: あ=開放・拡張)",
    check: ev => hasOnset(ev, PLOSIVE)
      && nuclei(ev).filter(v => v === "a").length >= nuclei(ev).length / 2,
  },
  "mrkoxd9n-1": {  // 鋭いジグザグ → gyapeen 👍
    desc: "鋭形に破裂音を含む (P1+manner の成功動作を回帰固定)",
    check: ev => hasOnset(ev, PLOSIVE),
  },
  "mrkoztb2-1": {  // 3連アーチ → gyuuuu 👎 (拗音+う には到達・濁音が違反)
    desc: "濁阻害音 (g/gy/z/j/d/b) を onset に使わない (P4: 第1回#6「濁音でない拗音+う」)",
    check: ev => !hasOnset(ev, new Set(["g", "gy", "z", "j", "d", "b"])),
  },
  "mrkp33vp-4": {  // 閉じた丸 → noooo 👍 (「最後は n でも良いかも」は任意メモ)
    desc: "破裂音・歯茎硬口蓋なし + 共鳴音 onset (丸の成功動作を回帰固定)",
    check: ev => !hasOnset(ev, PLOSIVE) && !hasOnset(ev, ALVEOLO_PALATAL)
      && ["n", "ny", "m", "w", "y", "r"].includes(onsets(ev)[0]),
  },
  // ─── 第3ラウンド (2026-07-15): i の統語論 (位置文法) ───
  "mrlacsw0-1": {  // 鋭ジグザグ → dizidozo 👎 (全文受領で立法完成・提案語 digaziba)
    // P10 言いやすさの制約: 「続くと言いづらい言葉は、定着しにくい」。
    // di→zi (歯茎→歯茎×同母音i) が違反、digaziba (d歯茎→g軟口蓋→z歯茎→b唇 ×
    // i-a-i-a 交替) が模範。gibiin (gi軟口蓋→bi唇) が 👍 だった謎もこれで解ける。
    // 音韻論の OCP (必異原理) と同型 = [普遍] の裏付けを持つ [慣習] 立法。
    desc: "P10 言いやすさ v1.1: 隣接 CV が 阻害音同士×異調音方法×同位置×同母音 を"
      + "繰り返さない (di→zi 禁止・ここ/ただ/さざ/まわ は許容)",
    check: ev => {
      const PLACE = { p: "lab", b: "lab", m: "lab", f: "lab", w: "lab", my: "lab",
                      t: "alv", d: "alv", s: "alv", z: "alv", n: "alv", r: "alv", ts: "alv",
                      sh: "pal", j: "pal", ch: "pal", y: "pal", ny: "pal",
                      k: "vel", g: "vel", ky: "palvel", gy: "palvel", h: "glo" };
      const MANNER = { k: "p", g: "p", t: "p", d: "p", p: "p", b: "p", ky: "p", gy: "p",
                       ts: "a", ch: "a", j: "a", s: "f", sh: "f", z: "f", h: "f", f: "f" };
      const SONORANT = new Set(["m", "n", "ny", "r", "w", "y", "my"]);
      for (let i = 1; i < ev.moras.length; i++) {
        const a = ev.moras[i - 1], b = ev.moras[i];
        if (a.onset && b.onset && a.onset !== b.onset && !a.isN && !b.isN
            && !SONORANT.has(a.onset) && !SONORANT.has(b.onset)
            && MANNER[a.onset] !== MANNER[b.onset]
            && a.nucleus === b.nucleus && PLACE[a.onset] === PLACE[b.onset]) return false;
      }
      return true;
    },
  },
  "mrlb56vr-1": {  // ジグザグ+終端カーブ → gibiin 👍「最後の曲線に いいん は非常に良い」
    desc: "鋭形+終端カーブ: 語末は 伸ばした i + ん の着地を保つ (P9 実地承認の回帰固定)",
    check: ev => endsWithN(ev)
      && ev.moras.some(m => m.onset === null && !m.isN && m.nucleus === "i"),
  },
  "mrlbrr6f-1": {  // 3連アーチ → bigibogo 👎「丸始まりに語頭 i は不適・a/u/o で始めよ」
    desc: "丸みから始まる描線: 先頭モーラの母音は a/u/o (語中の i 焦点化は可)",
    check: ev => ["a", "u", "o"].includes(nuclei(ev)[0]),
  },
};

// ─── 4. P1 幾何サニティ (角検出の判別力・regression 扱いで enforce) ─────
// spec P1 の契約: 偽の角 (滑らかな反転・波のこぶ) が corners に入らないこと +
// 真の角 (多角形の頂点) が失われないこと。fixture ストローク + 合成図形で固定。

const fixturePath = process.argv[2] ?? DEFAULT_FIXTURE;
const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
const strict = process.env.STRICT === "1";
const byId = Object.fromEntries(fixture.records.map(r => [r.id, r]));

function cxOfBeads(beads) {
  const pts = beads.map(([x, y]) => ({ x: x * W, y: y * H }));
  const geomPts = pts.length >= 3 ? api.splineDensified(pts, 6) : pts;
  return api.strokeComplexity(geomPts, W, H, 16);
}
function cxOfPts(pts) {
  return api.strokeComplexity(api.splineDensified(pts, 6), W, H, 16);
}
const zigzagPts = [];
for (let i = 0; i <= 6; i++) zigzagPts.push({ x: 40 + i * 45, y: i % 2 === 0 ? 250 : 120 });
const sinePts = [];
for (let i = 0; i <= 30; i++) {
  const t = i / 30;
  sinePts.push({ x: 30 + t * 300, y: 200 + Math.sin(t * Math.PI * 3) * 70 });
}
const GEOM_CHECKS = [
  ["長方形 #7: 真の角 3 個以上", () => cxOfBeads(byId["mri8a7zz-2"].stroke).corners >= 3],
  ["長方形 #7: cornerSharpness ≥ 0.1", () => cxOfBeads(byId["mri8a7zz-2"].stroke).cornerSharpness >= 0.1],
  ["S字 #9: 偽の角 ≤ 1", () => cxOfBeads(byId["mrib3e1u-1"].stroke).corners <= 1],
  ["3こぶ波 #6: 角 0", () => cxOfBeads(byId["mrgvfeao-4"].stroke).corners === 0],
  ["双こぶ #4: 谷だけ = 角 1", () => cxOfBeads(byId["mrgv9lk7-5"].stroke).corners === 1],
  ["丸 #1: 角 0", () => cxOfBeads(byId["mrfxxez7-3"].stroke).corners === 0],
  ["合成ジグザグ: 角ちょうど 5・cs ≥ 0.3", () => {
    const cx = cxOfPts(zigzagPts); return cx.corners === 5 && cx.cornerSharpness >= 0.3; }],
  ["合成正弦波: 角 0", () => cxOfPts(sinePts).corners === 0],
];
let geomFail = 0;
console.log("\nP1 幾何サニティ (角検出の判別力):");
for (const [label, fn] of GEOM_CHECKS) {
  let ok = false;
  try { ok = fn(); } catch { ok = false; }
  console.log(`  ${ok ? "✅" : "❌"} ${label}`);
  if (!ok) geomFail++;
}

// ─── 4.5 P6 拗音ゲートサニティ (2026-07-15・regression 扱いで enforce) ───────
// Icefaceさん報告: 「横一本線が yuu/yaa になる。口は閉じておらず、いいい に近い
// 印象になるはず」。原因 = mannerProfile の "s"(共鳴音) 類が -sharp (鈍さ) だけで
// 加点され、y/ny (拗音・半母音=グライド) が m/n/r/w と同格に選ばれてしまい、
// restrict{a,u,o} が口の形から導いた い の証拠を握り潰していた。
// 修正: y/ny の manner を "s" → "f"(wavy=tex 由来のうねり) へ繋ぎ替え、実際の
// 曲がり運動がない直線では加点されないようにした (MANNER_CLASS 定義)。
// 決定的 RNG (axesSeed/mulberry32) なので N 試行の内訳は再実行しても不変 — 閾値は
// 実測値 (修正前 453/1000, 修正後 149/1000 など) に安全マージンを取って固定。
function tallyOnsets(pts, N) {
  const inkPts = api.densified(pts, 6);
  const raw = api.extractAxes(inkPts, W, H);
  const ax = api.applyHandCorrection(raw, HAND_CORR, true);
  const geomPts = api.splineDensified(pts, 6);
  const cx = api.strokeComplexity(geomPts, W, H, 16);
  const kDraw = api.drawK(ax.sharp, cx.corners, cx.cornerSharpness);
  const manner = api.mannerProfile(ax.sharp, cx.corners, cx.cornerSharpness, ax.tex, cx.loops);
  let ynyCount = 0, pureVowelCount = 0;
  for (let seed = 0; seed < N; seed++) {
    const rand = api.mulberry32(api.axesSeed(ax, seed));
    const ev = api.generate(ax, rand, 0.4, { kiki: kDraw, manner });
    if (ev.moras.some(m => m.onset === "y" || m.onset === "ny")) ynyCount++;
    if (ev.moras.every(m => m.onset === null)) pureVowelCount++;
  }
  return { ynyCount, pureVowelCount };
}
const straightHPts = [];
for (let i = 0; i <= 40; i++) straightHPts.push({ x: 60 + i * 6, y: 180 });
const straightVPts = [];
for (let i = 0; i <= 40; i++) straightVPts.push({ x: 180, y: 60 + i * 6 });
const P6_N = 1000;
const p6H = tallyOnsets(straightHPts, P6_N);
const p6V = tallyOnsets(straightVPts, P6_N);
const P6_CHECKS = [
  [`横一本線: y/ny onset 率 ≤ 25% (実測 ${p6H.ynyCount}/${P6_N})`,
    () => p6H.ynyCount <= P6_N * 0.25],
  [`横一本線: 母音のみ (い系寄り) 率 ≥ 10% (実測 ${p6H.pureVowelCount}/${P6_N})`,
    () => p6H.pureVowelCount >= P6_N * 0.10],
  [`縦一本線: y/ny onset 率 ≤ 10% (実測 ${p6V.ynyCount}/${P6_N})`,
    () => p6V.ynyCount <= P6_N * 0.10],
];
let p6Fail = 0;
console.log("\nP6 拗音ゲートサニティ (直線に y/ny が乗って母音の証拠を握り潰さないこと):");
for (const [label, fn] of P6_CHECKS) {
  let ok = false;
  try { ok = fn(); } catch { ok = false; }
  console.log(`  ${ok ? "✅" : "❌"} ${label}`);
  if (!ok) p6Fail++;
}

// ─── 4.6 P11/P12 記号語彙サニティ (2026-07-16 コウさん立法で更新・regression 扱いで enforce) ───
// P12 (コウさん立法 2026-07-16, 正本 = docs/FEEDBACK_2026-07-16_kou_open_arc_vocab.md):
// 開いた弧 ⊃⊂∩∪ = 向き×大きさの固定語彙 (myi/myo/nyu/moo 系・語末ん なし)。
// 完全な大きく開いた円 = aaan (収束の ん が初めて立つ)。
// P11 (Icefaceさん発案・存続分): 開いた一角 ＜＞∧∨ → 子音+ん (コウさん未立法につき現状維持)。
/// pointerup の P12 語彙判定を忠実に再現。語彙語なら romaji を、通常経路なら null を返す。
function p12VocabWord(pts) {
  const inkPts = api.densified(pts, 6);
  const raw = api.extractAxes(inkPts, W, H);
  let ax = api.applyHandCorrection(raw, HAND_CORR, true);
  ax = api.bucketedAxes(ax, 0.25);
  const geomPts = pts.length >= 3 ? api.splineDensified(pts, 6) : inkPts;
  const cx = api.strokeComplexity(geomPts, W, H, 16);
  if (api.heartVocabSignal(cx)) return api.romajiOf(api.vocabEvent(api.heartVocabWord(cx), ax));
  if (api.starVocabSignal(cx)) return api.romajiOf(api.vocabEvent(api.STAR_VOCAB, ax));
  if (api.openArcSignal(cx)) {
    const dir = api.arcBulgeDirection(inkPts);
    const sc = api.arcSizeClass(inkPts, W, H);
    return api.romajiOf(api.vocabEvent(api.ARC_VOCAB[dir][sc], ax));
  }
  // 2026-07-21 立法: 円はサイズ3段階 (open>=0.5 ゲート撤去・HTML circleVocabSignal と厳密ミラー)。
  if (cx.isClosed && cx.corners === 0 && cx.rotationFraction > 0.8
      && cx.pathRatio / Math.max(1e-6, cx.sizeRatio) < 3.2
      && Math.abs(ax.round) <= 0.25) {
    const sc = api.arcSizeClass(inkPts, W, H);
    return api.romajiOf(api.vocabEvent(api.CIRCLE_VOCAB[sc], ax));
  }
  // P13 (2026-07-21 コウさん立法): 閉じた三角形 → gyagyoon。
  if (api.triangleVocabSignal(cx)) {
    const word = api.invertedTriangleVocabSignal(cx)
      ? api.INVERTED_TRIANGLE_VOCAB : api.TRIANGLE_VOCAB;
    return api.romajiOf(api.vocabEvent(word, ax));
  }
  if (api.quadrilateralVocabSignal(cx)) {
    const sc = api.arcSizeClass(inkPts, W, H);
    const family = api.quadrilateralFamily(inkPts);
    const words = family === "square" ? api.SQUARE_VOCAB : api.RECTANGLE_VOCAB;
    return api.romajiOf(api.vocabEvent(words[sc], ax));
  }
  return null;
}
/// 一角用: 従来どおり forceConsonantOnset 経路の統計。
function chevronTally(pts, N) {
  const inkPts = api.densified(pts, 6);
  const raw = api.extractAxes(inkPts, W, H);
  const ax = api.applyHandCorrection(raw, HAND_CORR, true);
  const geomPts = pts.length >= 3 ? api.splineDensified(pts, 6) : inkPts;
  const cx = api.strokeComplexity(geomPts, W, H, 16);
  const kDraw = api.drawK(ax.sharp, cx.corners, cx.cornerSharpness);
  const manner = api.mannerProfile(ax.sharp, cx.corners, cx.cornerSharpness, ax.tex, cx.loops);
  const openChevron = api.openChevronSignal(cx);
  let consOnsetFirst = 0, endsWithN = 0;
  for (let seed = 0; seed < N; seed++) {
    const rand = api.mulberry32(api.axesSeed(ax, seed));
    const ev = api.generate(ax, rand, 0.4, {
      moraCountOverride: openChevron ? 1 : cx.moraCount,
      kiki: kDraw, manner, lengthHint: cx.moraCount,
      forceConsonantOnset: openChevron,
    });
    if (ev.moras[0].onset !== null) consOnsetFirst++;
    if (ev.moras[ev.moras.length - 1].isN) endsWithN++;
  }
  return { openChevron, consOnsetFirst, endsWithN };
}
/// 膨らみ dir の弧 (中心角 200°)。r で大きさを変える。
function bulgeArcPts(bulge, r) {
  const centerAng = { right: 0, left: Math.PI, up: -Math.PI / 2, down: Math.PI / 2 }[bulge];
  const sweep = 200 * Math.PI / 180, start = centerAng - sweep / 2;
  const pts = [];
  for (let i = 0; i <= 40; i++) {
    const a = start + (i / 40) * sweep;
    pts.push({ x: 180 + r * Math.cos(a), y: 180 + r * Math.sin(a) });
  }
  return pts;
}
function circlePts2(r) {
  const pts = [];
  for (let i = 0; i <= 60; i++) {
    const a = i / 60 * 2 * Math.PI;
    pts.push({ x: 180 + r * Math.cos(a), y: 180 + r * Math.sin(a) });
  }
  return pts;
}
function chevronPts(apexDeg) {
  const half = (apexDeg / 2) * Math.PI / 180, legLen = 150, apex = { x: 180, y: 250 };
  const dir1 = { x: -Math.sin(half), y: -Math.cos(half) }, dir2 = { x: Math.sin(half), y: -Math.cos(half) };
  const pts = [];
  for (let i = 20; i >= 0; i--) { const t = i / 20; pts.push({ x: apex.x + dir1.x * legLen * t, y: apex.y + dir1.y * legLen * t }); }
  for (let i = 1; i <= 20; i++) { const t = i / 20; pts.push({ x: apex.x + dir2.x * legLen * t, y: apex.y + dir2.y * legLen * t }); }
  return pts;
}
function tiltedEllipsePts(tiltDeg, a = 120, b = 45) {
  const t0 = tiltDeg * Math.PI / 180, pts = [];
  for (let i = 0; i <= 60; i++) {
    const t = i / 60 * 2 * Math.PI;
    const ex = a * Math.cos(t), ey = b * Math.sin(t);
    pts.push({ x: 180 + ex * Math.cos(t0) - ey * Math.sin(t0),
               y: 180 + ex * Math.sin(t0) + ey * Math.cos(t0) });
  }
  return pts;
}
const P11_N = 300;
const chevronVariants = [30, 60].map(deg => chevronTally(chevronPts(deg), P11_N));
// コウさんの語彙表: 膨らみの向き → [小, 中, 大]
const P12_EXPECT = {
  right: ["myi", "myii", "myiii"], left: ["myo", "myoo", "myooo"],
  up: ["nyu", "nyuu", "nyuuu"], down: ["moo", "mooo", "moooo"],
};
const P12_RADII = [40, 90, 150];   // 小 / 中 / 大 (360×360 キャンバス)
// ─── P13 用ヘルパ (2026-07-21 コウさん立法・正本 = docs/FEEDBACK_2026-07-21_kou_triangle_vocab.md) ───
/// fixture の正規化 stroke ([0,1]) をテストキャンバス座標へ。
function p13FixtureStroke(id) {
  const r = fixture.records.find(x => x.id === id);
  return r ? r.stroke.map(([nx, ny]) => ({ x: nx * W, y: ny * H })) : null;
}
/// 頂点列を辺ごとに20分割補間した閉ポリゴン (最後に始点近傍へ戻る = 手描きの閉じ)。
function closedPolyPts(verts) {
  const pts = [];
  for (let e = 0; e < verts.length; e++) {
    const a = verts[e], b = verts[(e + 1) % verts.length];
    for (let t = 0; t < 20; t++)
      pts.push({ x: a[0] + (b[0] - a[0]) * t / 20, y: a[1] + (b[1] - a[1]) * t / 20 });
  }
  pts.push({ x: verts[0][0] + 1, y: verts[0][1] + 2 });
  return pts;
}
const p13Triangle = closedPolyPts([[180, 60], [280, 280], [80, 280]]);
const p13InvertedTriangle = closedPolyPts([[80, 80], [280, 80], [180, 300]]);
const p13Square = closedPolyPts([[100, 100], [260, 100], [260, 260], [100, 260]]);
const p13SmallSquare = closedPolyPts([[150, 150], [210, 150], [210, 210], [150, 210]]);
const p13LargeSquare = closedPolyPts([[65, 65], [295, 65], [295, 295], [65, 295]]);
const p13SmallRectangle = closedPolyPts([[120, 150], [240, 150], [240, 210], [120, 210]]);
const p13MediumRectangle = closedPolyPts([[90, 140], [270, 140], [270, 220], [90, 220]]);
const p13LargeRectangle = closedPolyPts([[30, 115], [330, 115], [330, 245], [30, 245]]);
const P11_CHECKS = [
  ...Object.entries(P12_EXPECT).map(([dir, words]) =>
    [`⊃⊂∩∪ ${dir}: 大きさ 3 段で ${words.join("/")} (コウさん語彙)`,
      () => P12_RADII.every((r, i) => p12VocabWord(bulgeArcPts(dir, r)) === words[i])]),
  ["円サイズ3段 (2026-07-21 立法): 大=aaaan / 中=aoon / 小=oon",
    () => p12VocabWord(circlePts2(140)) === "aaaan" && p12VocabWord(circlePts2(90)) === "aoon"
       && p12VocabWord(circlePts2(40)) === "oon"],
  ["円の vocabEvent 分解: oon=[o,ー,ん] / aoon=[a,o,ー,ん] (o の次に a は来ない構造)",
    () => {
      const ax0 = { size: 0, sharp: 0, tex: 0, bright: 0, round: 0, open: 0 };
      const o = api.vocabEvent("oon", ax0).moras;
      const ao = api.vocabEvent("aoon", ax0).moras;
      const a4 = api.vocabEvent("aaaan", ax0).moras;
      return o.length === 3 && o[0].onset === null && o[0].nucleus === "o" && !o[1].isN && o[2].isN
        && ao.length === 4 && ao[0].nucleus === "a" && ao[1].nucleus === "o" && ao[1].onset === null
        && !ao[2].isN && ao[2].nucleus === "o" && ao[3].isN
        && a4.length === 5 && a4[0].nucleus === "a" && a4[4].isN;
    }],
  // fixture の stroke は旧 export の slice(0,48) 末尾切り捨てで「閉じ」の珠が失われており
  // (実測: 再生 isClosed=false/cor=2 vs 記録 cor=3)、stroke 再生では閉合が復元できない。
  // 記録済み導出値 (cor=3, cs=0.453・cor=3 は v18 の閉形正準化を経た値=閉) を pinned 判定に使う。
  // export 側は均一間引き (端点保持) へ修正済み — 今後の fixture は stroke 再生で検証できる。
  ["P13 fixture 記録値 (mrus6t5v-1: cor=3, cs=0.453, 閉): 帯内で gyagyoon",
    () => {
      const rec = fixture.records.find(x => x.id === "mrus6t5v-1");
      const ax0 = { size: 0, sharp: 0, tex: 0, bright: 0, round: 0, open: 0 };
      return !!rec && api.triangleVocabSignal({ isClosed: true, corners: rec.cor, cornerSharpness: rec.cs })
        && api.romajiOf(api.vocabEvent(api.TRIANGLE_VOCAB, ax0)) === "gyagyoon";
    }],
  ["P13 合成正三角形 (閉): gyagyoon",
    () => p12VocabWord(p13Triangle) === "gyagyoon"],
  ["Q3変更 合成逆三角形 ▽ (閉): gyogyaan",
    () => p12VocabWord(p13InvertedTriangle) === "gyogyaan"],
  ["2026-08-28 正方形 (閉): 小/中/大 = teton/tetoon/tetooon",
    () => p12VocabWord(p13SmallSquare) === "teton"
       && p12VocabWord(p13Square) === "tetoon"
       && p12VocabWord(p13LargeSquare) === "tetooon"],
  ["2026-08-28 長方形 (閉): 小/中/大 = tsukon/tsukoon/tsukooon",
    () => p12VocabWord(p13SmallRectangle) === "tsukon"
       && p12VocabWord(p13MediumRectangle) === "tsukoon"
       && p12VocabWord(p13LargeRectangle) === "tsukooon"],
  ["四角語彙の分解: 3〜5モーラ・語末んを維持",
    () => {
      const ax0 = { size: 0, sharp: 0, tex: 0, bright: 0, round: 0, open: 0 };
      return [["teton", "tetoon", "tetooon"], ["tsukon", "tsukoon", "tsukooon"]]
        .every(words => words.every((w, i) => {
          const event = api.vocabEvent(w, ax0);
          return api.romajiOf(event) === w && event.moras.length === i + 3
            && event.moras[event.moras.length - 1].isN === true;
        }));
    }],
  ["正方形/長方形の境界: 1.25 は正方形・1.45 は長方形",
    () => api.quadrilateralFamily(closedPolyPts([[110, 130], [235, 130], [235, 230], [110, 230]])) === "square"
       && api.quadrilateralFamily(closedPolyPts([[105, 130], [250, 130], [250, 230], [105, 230]])) === "rectangle"],
  ["長方形は縦横で語族を変えない",
    () => api.quadrilateralFamily(closedPolyPts([[90, 140], [270, 140], [270, 220], [90, 220]])) === "rectangle"
       && api.quadrilateralFamily(closedPolyPts([[140, 90], [220, 90], [220, 270], [140, 270]])) === "rectangle"],
  ["P13 vocabEvent 複数CV: gyagyoon = [gya, gyo, ー, ん]",
    () => {
      const ax0 = { size: 0, sharp: 0, tex: 0, bright: 0, round: 0, open: 0 };
      const ms = api.vocabEvent("gyagyoon", ax0).moras;
      return ms.length === 4
        && ms[0].onset === "gy" && ms[0].nucleus === "a"
        && ms[1].onset === "gy" && ms[1].nucleus === "o"
        && ms[2].onset === null && ms[2].nucleus === "o" && !ms[2].isN
        && ms[3].isN === true;
    }],
  ["Q3 vocabEvent: gyogyaan = [gyo, gya, ー, ん]",
    () => {
      const ax0 = { size: 0, sharp: 0, tex: 0, bright: 0, round: 0, open: 0 };
      const ms = api.vocabEvent(api.INVERTED_TRIANGLE_VOCAB, ax0).moras;
      return ms.length === 4
        && ms[0].onset === "gy" && ms[0].nucleus === "o"
        && ms[1].onset === "gy" && ms[1].nucleus === "a"
        && ms[2].onset === null && ms[2].nucleus === "a" && !ms[2].isN
        && ms[3].isN === true;
    }],
  ["P13 vocabEvent 後方互換: aaan/myiii/moo のモーラ列が旧実装と同一",
    () => {
      const ax0 = { size: 0, sharp: 0, tex: 0, bright: 0, round: 0, open: 0 };
      const a = api.vocabEvent("aaan", ax0).moras;
      const my = api.vocabEvent("myiii", ax0).moras;
      const mo = api.vocabEvent("moo", ax0).moras;
      return a.length === 4 && a[0].onset === null && a[0].nucleus === "a"
        && a[1].onset === null && a[1].nucleus === "a" && a[2].nucleus === "a"
        && !a[1].isN && !a[2].isN && a[3].isN === true
        && my.length === 3 && my[0].onset === "my" && my[0].nucleus === "i"
        && my[1].onset === null && my[1].nucleus === "i" && my[2].nucleus === "i" && !my[2].isN
        && mo.length === 2 && mo[0].onset === "m" && mo[0].nucleus === "o"
        && mo[1].onset === null && mo[1].nucleus === "o" && !mo[1].isN;
    }],
  // 2026-07-21 立法更新: 小円も円として完成していれば oon (旧: 語彙にならず「う」の口の法)。
  // 「う」は円判定に満たない形 (潰れ/開き/極小) に残る — 境界はコウさん次ラウンドで確認。
  ["斜め楕円: 語彙にならない (え=P9e の既存法を保つ)",
    () => p12VocabWord(tiltedEllipsePts(-30)) === null],
  ["開いた一角 (2種) は全て openChevron 判定になる",
    () => chevronVariants.every(r => r.openChevron)],
  ["開いた一角: 子音 onset が支配的 (100%)",
    () => chevronVariants.every(r => r.consOnsetFirst === P11_N)],
  ["開いた一角: 語末んを付けない (100%, 2026-08-14 確認)",
    () => chevronVariants.every(r => r.endsWithN === 0)],
  ["双こぶ #4 (ループ2) は openArc/openChevron どちらにもならない",
    () => { const cx = cxOfBeads(byId["mrgv9lk7-5"].stroke);
            return !api.openArcSignal(cx) && !api.openChevronSignal(cx); }],
  ["合成正弦波 (相殺した回転) は openArc にならない (curveConsistency ゲート)",
    () => !api.openArcSignal(cxOfPts(sinePts))],
  ["合成ジグザグ (角5個) は openArc/openChevron どちらにもならない",
    () => { const cx = cxOfPts(zigzagPts); return !api.openArcSignal(cx) && !api.openChevronSignal(cx); }],
  ["横一本線 (P6 対象) は openArc/openChevron どちらにもならない・語彙にもならない",
    () => { const cx = cxOfPts(straightHPts);
            return !api.openArcSignal(cx) && !api.openChevronSignal(cx)
                && p12VocabWord(straightHPts) === null; }],
  // ─── cc v2 (2026-07-16 Icefaceさん報告「⊂が出にくい」): 手ブレ/ペン尾に頑健 ───
  ["手ブレ ⊂ (jitter±5px) が openArc になる (cc v2: 弧長リサンプル+端トリムの回帰固定)",
    () => {
      const pts = [];
      let rng = 7n * 2654435761n + 12345n;
      const rnd = () => { rng = (rng * 6364136223846793005n + 1442695040888963407n) & 0xFFFFFFFFFFFFFFFFn;
        return Number((rng >> 33n) & 0xFFFFn) / 32768.0 - 1.0; };
      const sweep = 210 * Math.PI / 180, start = Math.PI - sweep / 2;
      for (let i = 0; i <= 60; i++) {
        const a = start + i / 60 * sweep, rr = 120 + 5 * rnd();
        pts.push({ x: 180 + rr * Math.cos(a), y: 180 + rr * Math.sin(a) });
      }
      return api.openArcSignal(cxOfPts(pts))
          && api.arcBulgeDirection(pts) === "left";
    }],
  ["ペン尾フック付き ⊂ (末尾30px) が openArc になる (端トリムの回帰固定)",
    () => {
      const sweep = 210 * Math.PI / 180, start = Math.PI - sweep / 2;
      const pts = [];
      for (let i = 0; i <= 60; i++) {
        const a = start + i / 60 * sweep;
        pts.push({ x: 180 + 120 * Math.cos(a), y: 180 + 120 * Math.sin(a) });
      }
      const aEnd = start + sweep, tang = aEnd + Math.PI / 2;
      for (let k = 2; k <= 30; k += 4)
        pts.push({ x: pts[pts.length-1].x + 4 * Math.cos(tang - 0.9),
                   y: pts[pts.length-1].y + 4 * Math.sin(tang - 0.9) });
      return api.openArcSignal(cxOfPts(pts));
    }],
  // ─── my の直接入力 (2026-07-16 Icefaceさん報告「myon→yon」の修正固定) ───
  ["segmentWord: myon→みょん / myooo / myin (my がパーサに載る)",
    () => {
      const r = m => api.romajiOf({ moras: m });
      return r(api.segmentWord("myon")) === "myon"
          && r(api.segmentWord("myooo")) === "myooo"
          && r(api.segmentWord("myin")) === "myin";
    }],
];
let p11Fail = 0;
console.log("\nP11/P12/P13/PF-07〜09 記号語彙サニティ (弧・円・三角・四角・開いた一角=子音開始/ん無し・既存形は誤爆しない):");
for (const [label, fn] of P11_CHECKS) {
  let ok = false;
  try { ok = fn(); } catch { ok = false; }
  console.log(`  ${ok ? "✅" : "❌"} ${label}`);
  if (!ok) p11Fail++;
}

// ─── 4.7 P9e 斜め楕円=え サニティ (2026-07-15・regression 扱いで enforce) ───────
// Icefaceさん立法: 斜めに伸びた閉形 (楕円) は「横に引きながら開いた口」= え。左右どちらの
// 傾きでも同じ (反転対称)。horiz=cos2θ が斜めで伸びの証拠を消していたのを diagSpread で
// 補填 + 口の証拠が強いときは pickVowel の温度を絞る (2% の不運な揺れの凍結防止)。
function p9eNucleusShare(pts, N) {
  const inkPts = api.densified(pts, 6);
  const raw = api.extractAxes(inkPts, W, H);
  let ax = api.applyHandCorrection(raw, HAND_CORR, true);
  ax = api.bucketedAxes(ax, 0.25);
  const geomPts = api.splineDensified(pts, 6);
  const cx = api.strokeComplexity(geomPts, W, H, 16);
  const kDraw = api.drawK(ax.sharp, cx.corners, cx.cornerSharpness);
  const manner = api.mannerProfile(ax.sharp, cx.corners, cx.cornerSharpness, ax.tex, cx.loops);
  const sustained = cx.loops <= 1 && cx.corners <= 2 && cx.cornerSharpness < 0.35
    && ax.tex < 0.3 && cx.moraCount >= 2;
  const tally = { a: 0, i: 0, u: 0, e: 0, o: 0 };
  for (let seed = 0; seed < N; seed++) {
    const rand = api.mulberry32(api.axesSeed(ax, seed));
    const ev = api.generate(ax, rand, 0.4, { moraCountOverride: cx.moraCount, kiki: kDraw,
                                             manner, sustained, lengthHint: cx.moraCount });
    for (const m of ev.moras) if (!m.isN) tally[m.nucleus]++;
  }
  const total = Object.values(tally).reduce((x, y) => x + y, 0);
  return { tally, total, share: v => tally[v] / Math.max(1, total) };
}
function ellipsePts(tiltDeg, a = 120, b = 45) {
  const tilt = tiltDeg * Math.PI / 180, pts = [];
  for (let i = 0; i <= 60; i++) {
    const t = i / 60 * 2 * Math.PI;
    const ex = a * Math.cos(t), ey = b * Math.sin(t);
    pts.push({ x: 180 + ex * Math.cos(tilt) - ey * Math.sin(tilt),
               y: 180 + ex * Math.sin(tilt) + ey * Math.cos(tilt) });
  }
  return pts;
}
const P9E_N = 200;
const p9eTilts = [-30, 30, -45, 45].map(deg => [deg, p9eNucleusShare(ellipsePts(deg), P9E_N)]);
const p9eCircle = p9eNucleusShare(ellipsePts(0, 90, 90), P9E_N);
const p9eVertLine = (() => {
  const pts = []; for (let i = 0; i <= 40; i++) pts.push({ x: 180, y: 60 + i * 6 });
  return p9eNucleusShare(pts, P9E_N);
})();
const P9E_CHECKS = [
  ...p9eTilts.map(([deg, r]) =>
    [`斜め楕円 ${deg}°: え が最頻母音 (実測 e=${(r.share("e") * 100).toFixed(0)}%)`,
     () => ["a", "i", "u", "o"].every(v => r.share("e") > r.share(v))]),
  ["斜め楕円: 左右の傾きで母音分布が同一 (反転対称)",
    () => JSON.stringify(p9eTilts[0][1].tally) === JSON.stringify(p9eTilts[1][1].tally)
       && JSON.stringify(p9eTilts[2][1].tally) === JSON.stringify(p9eTilts[3][1].tally)],
  [`円 (傾きなし) は え 支配にならない (実測 e=${(p9eCircle.share("e") * 100).toFixed(0)}%)`,
    () => p9eCircle.share("e") < 0.4],
  [`縦一本線は う 優勢のまま (P9e が縦線を壊さない・実測 u=${(p9eVertLine.share("u") * 100).toFixed(0)}%)`,
    () => ["a", "i", "e", "o"].every(v => p9eVertLine.share("u") > p9eVertLine.share(v))],
];
let p9eFail = 0;
console.log("\nP9e 斜め楕円=え サニティ (傾き両方向で え・円/縦線は不変):");
for (const [label, fn] of P9E_CHECKS) {
  let ok = false;
  try { ok = fn(); } catch { ok = false; }
  console.log(`  ${ok ? "✅" : "❌"} ${label}`);
  if (!ok) p9eFail++;
}

// ─── 5. fixture 性質テストの実行・レポート ─────────────────────────

let regressFail = 0, targetFail = 0, targetPass = 0, errors = 0;
const rows = [];
for (const rec of fixture.records) {
  const prop = PROPERTIES[rec.id];
  const tier = rec.vote === 1 ? "regression" : "target";
  if (!prop) { rows.push([rec.id, tier, rec.word, "-", "⚠ 性質が未登録"]); continue; }
  let word = "?", strokeWord = "-", ok = false, note = "", match = "";
  try {
    const rr = replayRecorded(rec);
    let event = rr.event;
    let stroke = null;
    try { stroke = replayFromStroke(rec); strokeWord = api.romajiOf(stroke.event); } catch { }
    if (rr.pinned) {
      match = ` (mc=${rr.mc} 固定・recorded判定)`;
    } else if (rr.calibrated) {
      match = ` (mc=${rr.mc} で当時と一致)`;
    } else if (stroke) {
      // recorded モードで復元不能 = 単位語経路 (generateFromUnits) か記録後のエンジン変化。
      // stroke 再導出 (キャンバス寸法差あり) を判定に使う。
      event = stroke.event;
      match = " (⚠未較正→stroke再導出で判定: 単位語経路 or エンジン変化)";
    } else {
      match = ` (⚠未較正: mc=${rr.mc} 近似)`;
    }
    word = api.romajiOf(event);
    ok = prop.check(event);
  } catch (e) {
    note = `💥 ${e.message}`; errors++;
  }
  if (!note) {
    if (tier === "regression") {
      note = ok ? "✅ PASS" : "❌ FAIL (回帰!)";
      if (!ok) regressFail++;
    } else {
      note = ok ? "🎉 PASS (先行達成)" : "🔴 FAIL (既知・処方待ち)";
      ok ? targetPass++ : targetFail++;
    }
  }
  rows.push([rec.id, tier,
    `${rec.word} → ${word}${match}  [stroke再導出: ${strokeWord}]`, prop.desc, note]);
}

console.log(`\nコウさん性質テスト  (fixture: ${path.basename(fixturePath)}, engine: 再現パイプライン ${W}×${H})\n`);
for (const [id, tier, words, desc, note] of rows) {
  console.log(`  ${note.padEnd(18)} [${tier.padEnd(10)}] ${id}`);
  console.log(`      当時→今日: ${words}`);
  console.log(`      性質: ${desc}\n`);
}
console.log(`  幾何サニティ破れ: ${geomFail} / P6拗音ゲート破れ: ${p6Fail} / P11記号語彙破れ: ${p11Fail} / P9e斜め楕円破れ: ${p9eFail} / regression 破れ: ${regressFail} / target 既知FAIL: ${targetFail} / target 先行達成: ${targetPass} / エラー: ${errors}\n`);

if (geomFail > 0 || p6Fail > 0 || p11Fail > 0 || p9eFail > 0 || regressFail > 0 || errors > 0 || (strict && targetFail > 0)) process.exit(1);
console.log(strict ? "STRICT: all green ✅" : "幾何+regression green ✅ (target は処方 P2〜P7 の進捗指標)");
