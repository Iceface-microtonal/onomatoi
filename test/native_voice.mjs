// native_voice.mjs — v13 native 音声レンダラ (FormantSynth 移植) の性質テスト (2026-07-16)
//
// 方式: kou_properties.mjs と同じ「<script> から純粋宣言を抽出して vm 評価」。
// 音声は合成波形 (サイン波の疑似テイク) で駆動し、以下を固定する:
//   1. 振り分け: 現行Coreの再アタック3法 (kaii / aaii / iiii) と撥音直前例外、
//      Webの5モーラ以上における末尾1モーラ孤立の抑止
//      単独ペア (ai) は生 diph、単独CV→V (sai) は cvDiph のまま
//   2. nvPrepareCvDiph: 整形後のレベル (頭 -12dBFS 付近) と第2母音の復元
//   3. nvRenderEvent: aauu / an / ai の語中に無音級の谷 (テイク境界の途切れ) が無い
//   4. 促音 isQ の音価 (60ms) が量子化で保存される
//   4b. 後続モーラの弱め (iOS FormantRenderer と同じ -3dB・主音の diph run・tea-mi 型の二重)
//   5. 語末専用 diph テイク (_fin) は iOS と同じく使わない
//
// 実行: node test/native_voice.mjs

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML_PATH = path.resolve(__dirname, "../iceface_onomatoi.html");

// ─── エンジン抽出 (kou_properties.mjs と同一のミニ抽出器) ───
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
      blocks.push(lines.slice(start, end + 1).join("\n"));
      i = end + 1;
      continue;
    }
    i++;
  }
  return blocks.filter(b => !IMPURE.test(b)).join("\n\n");
}

const engineSrc = extractEngine(fs.readFileSync(HTML_PATH, "utf8"));
const EXPORTS = ["segmentWord", "romajiOf", "NAMING_NG_WORDS",
  "RECORDED_EXTENDED_CVS", "expressiveVariantCandidate", "expressiveOnset",
  "enforceVowelAspectOrder",
  "DIPH_PAIRS", "sampleKeys", "sampleUrlCandidates", "buildNativeVoiceBank", "sampleBank",
  "nvApplyFollowingMoraAttenuation", "NV_FOLLOWING_MORA_ATTENUATION_DB", "nvPlaybackMoras",
  "nvQuantizeMoras", "nvVowelRunRootHasOnset", "parseMora",
  "nvVvDiphPart1Takes", "nvCvDiphPrev", "nvDiphContext",
  "nvLongVowelExtension", "nvNextUsesCVtoVDiph", "nvPrepareCvDiph",
  "nvDiphReattackBreaks", "nvExtendedRunBoundaryReattacks", "nvSameVowelRunReattacks",
  "nvCvDiphPreRollMs", "NV_DIPH_JOIN_GAIN",
  "nvTrimTrailingSilence", "nvSustainWrap", "nvRenderEvent", "nvInterp",
  "nvComputeCvSustainHandoffEnd", "nvReadRootCVSample",
  "nvUsesStandaloneVowel", "nvReadRootVowelSample",
  "nvContinuousMoraGain", "nvReadMoraicNSample"];
const ctx = vm.createContext({ console });
vm.runInNewContext(engineSrc + `\n;globalThis.__api = { ${EXPORTS.join(", ")} };`,
  ctx, { filename: "engine(extracted)" });
const api = ctx.__api;
for (const name of EXPORTS) {
  if (api[name] === undefined) throw new Error(`engine 抽出失敗: ${name} が見つからない`);
}

// ─── テストハーネス ───
let pass = 0, fail = 0;
function check(name, cond, detail = "") {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }
}
const db = x => 20 * Math.log10(Math.max(1e-9, x));

// ─── 合成テイク ───
const SR = 48000;
function sine(durSec, freq, amp, attackMs = 10) {
  const n = Math.round(durSec * SR);
  const arr = new Float32Array(n);
  const atk = Math.round(attackMs / 1000 * SR);
  for (let i = 0; i < n; i++) {
    const a = i < atk ? i / atk : 1;
    arr[i] = Math.sin(2 * Math.PI * freq * i / SR) * amp * a;
  }
  return arr;
}
// 長尺 diph 録音の模擬: V1 定常 → グライド → V2 定常 (小さい) → 減衰
function synthLongDiphRaw() {
  const seg1 = sine(0.30, 220, 0.10);          // V1 (-20dBFS)
  const seg2 = sine(0.10, 275, 0.06);          // 移行
  const seg3 = sine(0.45, 330, 0.02, 1);       // V2 (-34dBFS: 第2母音は小さく録れている)
  const tail = new Float32Array(Math.round(0.15 * SR));
  for (let i = 0; i < tail.length; i++) {
    const u = 1 - i / tail.length;
    tail[i] = Math.sin(2 * Math.PI * 330 * i / SR) * 0.02 * u * u;
  }
  const out = new Float32Array(seg1.length + seg2.length + seg3.length + tail.length);
  out.set(seg1, 0);
  out.set(seg2, seg1.length);
  out.set(seg3, seg1.length + seg2.length);
  out.set(tail, seg1.length + seg2.length + seg3.length);
  return out;
}

function makeBank() {
  const bank = { sr: SR, cv: new Map(), cvHandoff: new Map(), v: new Map(),
                 shortV: new Map(), shortVHandoff: new Map(), vQ: new Map(),
                 fricQ: new Map(), fricQOnset: new Map(), nN: null, contN: new Map(),
                 diph: new Map(), cvDiph: new Map() };
  bank.v.set("a", sine(1.0, 200, 0.15));
  bank.v.set("e", sine(1.0, 270, 0.15));
  bank.v.set("u", sine(1.0, 300, 0.15));
  bank.v.set("i", sine(1.0, 320, 0.15));
  bank.cv.set("s|a", sine(0.5, 210, 0.15));
  bank.cv.set("s|e", sine(0.5, 270, 0.15));
  for (const [key, take] of bank.cv) {
    bank.cvHandoff.set(key, api.nvComputeCvSustainHandoffEnd(take, SR));
  }
  bank.nN = sine(0.6, 150, 0.10);
  bank.contN.set("a", sine(0.6, 160, 0.10, 1));   // ベイク済み相当 (頭から鼻音定常)
  for (const p of api.DIPH_PAIRS) {
    bank.diph.set(p, sine(0.6, 250, 0.12));
    const prepared = api.nvPrepareCvDiph(synthLongDiphRaw(), SR);
    bank.cvDiph.set(p, prepared);
  }
  return bank;
}

function rmsWindows(data, sr, winSec = 0.02) {
  const win = Math.round(winSec * sr);
  const out = [];
  for (let i = 0; i + win <= data.length; i += win) {
    let s = 0;
    for (let j = i; j < i + win; j++) s += data[j] * data[j];
    out.push({ tMs: i / sr * 1000, db: db(Math.sqrt(s / win)) });
  }
  return out;
}

const MORA_MS = 250;
const q = w => api.nvQuantizeMoras(api.segmentWord(w), MORA_MS);

console.log("── Base単音母音: 短音 / 長音 / 接続の分離 ──");
{
  const bank = makeBank();
  bank.shortV = new Map();
  bank.shortVHandoff = new Map();
  for (const v of "aiueo") {
    bank.shortV.set(v, new Float32Array(SR * 0.36).fill(0.2));
    bank.shortVHandoff.set(v, 0.30);
    bank.v.set(v, new Float32Array(SR * 1.2).fill(-0.2));
    check(`${v}: 単音は専用短音を選ぶ`, api.nvUsesStandaloneVowel(0, q(v), bank));
    check(`${v}: 短音の波形を読む`, api.nvReadRootVowelSample(bank, v, 0.1, 250, true) > 0.19);
  }
  const oldBank = { ...bank, shortV: new Map(), shortVHandoff: new Map() };
  const render = (w, b) => api.nvRenderEvent(api.segmentWord(w), b, SR, MORA_MS).data;
  for (const w of ["aa", "aaaa", "an", "in", "un", "en", "on", "ai", "sai", "kaaaa"]) {
    const before = render(w, oldBank), after = render(w, bank);
    check(`${w}: 持続/接続音声は全フレーム不変`, before.length === after.length && before.every((x, i) => x === after[i]));
  }
  for (const w of ["iii", "keii"]) {
    const moras = q(w), before = render(w, oldBank), after = render(w, bank);
    check(`${w}: 最後の母音だけ単音を選ぶ`, api.nvUsesStandaloneVowel(moras.length - 1, moras, bank));
    const boundary = 2 * MORA_MS / 1000 * SR;
    check(`${w}: 先行する2モーラは不変`, before.slice(0, boundary).every((x, i) => x === after[i]));
    check(`${w}: 最後の言い直しは短音に切り替わる`, before.slice(boundary).some((x, i) => x !== after[boundary + i]));
  }
  const slow = Array.from({length: 24000}, (_, i) => api.nvReadRootVowelSample(bank, "a", i / SR, 500, true));
  check("遅い単音: ファイル終端を越えて持続音に接続", slow.every(Number.isFinite) && slow[22000] < -0.19);
  check("遅い単音: 接続点で段差が生じない", slow.every((x, i) => i === 0 || Math.abs(x - slow[i - 1]) < 0.001));
  check("短音欠落時: 従来の持続素材で発音", api.nvReadRootVowelSample(oldBank, "a", 0.1, 250, true) < -0.19);
}

console.log("── 1. 再アタック3法と振り分け (Core準拠 + Web末尾孤立例外) ──");
{
  const bank = makeBank();
  for (const w of ["aauu", "aaii", "oouu", "eeii", "ooii"]) {
    const ms = q(w);
    check(`${w}: 4モーラ`, ms.length === 4, `got ${ms.length}`);
    check(`${w}: 第2法がモーラ3境界で発火`,
          api.nvExtendedRunBoundaryReattacks(2, ms));
    check(`${w}: 境界を生 diph が取らない`, !api.nvVvDiphPart1Takes(1, ms, bank));
    const c2 = api.nvCvDiphPrev(2, ms, bank);
    const c3 = api.nvCvDiphPrev(3, ms, bank);
    check(`${w}: モーラ3/4 は cvDiph 経路に入らない`, !c2 && !c3,
          JSON.stringify({ c2: !!c2, c3: !!c3 }));
    check(`${w}: 先行オーバーラップしない`, !api.nvNextUsesCVtoVDiph(1, ms, bank));
    check(`${w}: モーラ3は言い直し`, api.nvLongVowelExtension(2, ms) === null);
    const ext = api.nvLongVowelExtension(3, ms);
    check(`${w}: モーラ4は言い直したV2を根に延長`,
          !!ext && ext.sourceNucleus === ms[2].nucleus && ext.baseMs === MORA_MS && ext.totalMs === 2 * MORA_MS,
          JSON.stringify(ext));
  }
  const ai = q("ai");
  check("ai (単独ペア): 生 diph のまま", api.nvVvDiphPart1Takes(0, ai, bank));
  check("ai (単独ペア): cvDiph に取られない", api.nvCvDiphPrev(1, ai, bank) === null);
  const sai = q("sai");
  check("sai (単独CV→V): cvDiph 経路は維持", api.nvCvDiphPrev(1, sai, bank) !== null);
  const saai = q("saai");
  check("saai (子音根の長音後): 第2法でcvDiphを使わない",
        api.nvCvDiphPrev(saai.length - 1, saai, bank) === null);

  for (const w of ["kaii", "uii"]) {
    const ms = q(w);
    const breakAt = ms.length - 1;
    check(`${w}: 第1法がV2直後で発火`, api.nvDiphReattackBreaks(breakAt, ms));
    check(`${w}: 言い直し点はcvDiph継続に入らない`, api.nvCvDiphPrev(breakAt, ms, bank) === null);
  }

  for (const w of ["aiin", "kuiin"]) {
    const ms = q(w);
    const extendedV2 = ms.length - 2;
    check(`${w}: 撥音直前のV2延長は第1法で切らない`,
          !api.nvDiphReattackBreaks(extendedV2, ms));
    check(`${w}: 撥音までV2を一続きに延長`,
          api.nvLongVowelExtension(extendedV2, ms) !== null);
  }

  const i4 = q("iiii");
  check("iiii: 第3法は3モーラ目だけで発火",
        !api.nvSameVowelRunReattacks(1, i4) && api.nvSameVowelRunReattacks(2, i4)
          && !api.nvSameVowelRunReattacks(3, i4));
  check("iiii: ii|ii の言い直し点は延長しない", api.nvLongVowelExtension(2, i4) === null);
  const i4tail = api.nvLongVowelExtension(3, i4);
  check("iiii: 4モーラ目は3モーラ目を根に継続",
        !!i4tail && i4tail.baseMs === MORA_MS && i4tail.totalMs === 2 * MORA_MS,
        JSON.stringify(i4tail));
  const i5 = q("iiiii");
  check("iiiii: ii|iii とし、5モーラ目を孤立させない",
        api.nvSameVowelRunReattacks(2, i5) && !api.nvSameVowelRunReattacks(4, i5));
  const i5tail = api.nvLongVowelExtension(4, i5);
  check("iiiii: 末尾3モーラは一続き",
        !!i5tail && i5tail.baseMs === 2 * MORA_MS
          && i5tail.totalMs === 3 * MORA_MS,
        JSON.stringify(i5tail));
  const i7 = q("iiiiiii");
  check("iiiiiii: ii|ii|iii とし、7モーラ目を孤立させない",
        api.nvSameVowelRunReattacks(2, i7) && api.nvSameVowelRunReattacks(4, i7)
          && !api.nvSameVowelRunReattacks(6, i7));
  check("iii: 5モーラ未満は従来どおり ii|i",
        api.nvSameVowelRunReattacks(2, q("iii")));
  const piuuuu = q("piuuuu");
  check("piuuuu: 非diphのi→u後を pi|uu|uu にする",
        piuuuu.length === 5 && !api.nvDiphReattackBreaks(2, piuuuu)
          && api.nvSameVowelRunReattacks(3, piuuuu)
          && !api.nvSameVowelRunReattacks(4, piuuuu));
  const piuuuuTail = api.nvLongVowelExtension(4, piuuuu);
  check("piuuuu: 最後のuは単独再アタックにならない",
        !!piuuuuTail && piuuuuTail.baseMs === MORA_MS
          && piuuuuTail.totalMs === 2 * MORA_MS,
        JSON.stringify(piuuuuTail));
  const bouuuu = q("bouuuu");
  check("bouuuu: diph後の区切りは維持し、末尾だけ孤立させない",
        bouuuu.length === 5 && api.nvDiphReattackBreaks(2, bouuuu)
          && !api.nvSameVowelRunReattacks(4, bouuuu));
  const bouuuuTail = api.nvLongVowelExtension(4, bouuuu);
  check("bouuuu: bou|uuu の末尾3モーラは一続き",
        !!bouuuuTail && bouuuuTail.baseMs === 2 * MORA_MS
          && bouuuuTail.totalMs === 3 * MORA_MS,
        JSON.stringify(bouuuuTail));
  const rest = { onset: null, nucleus: "a", durationMs: MORA_MS, gapMs: 0,
                 amplitude: 0, isN: false, isSilentRest: true };
  check("bouuuu+休符: COMPOSE内でも語末1モーラを孤立させない",
        !api.nvSameVowelRunReattacks(4, [...bouuuu, rest]));
  check("iiiin: 直後がんのrunは第3法の例外", !api.nvSameVowelRunReattacks(2, q("iiiin")));
  check("kooon: 子音接頭でもん例外", !api.nvSameVowelRunReattacks(2, q("kooon")));

  check("CV→V pre-roll: BPM120は40ms", api.nvCvDiphPreRollMs(250) === 40);
  check("CV→V pre-roll: 短拍では1/5以下", api.nvCvDiphPreRollMs(125) === 25);
  check("diph接合ゲイン: -3dB", Math.abs(api.NV_DIPH_JOIN_GAIN - 0.7079) < 1e-9);
}

console.log("── 2. nvPrepareCvDiph (整形) ──");
{
  const prepared = api.nvPrepareCvDiph(synthLongDiphRaw(), SR);
  check("整形後も十分な長さ", prepared.length > 0.5 * SR, `${prepared.length / SR}s`);
  const w = rmsWindows(prepared, SR);
  const head = w.slice(0, 5).reduce((a, b) => a + b.db, 0) / 5;
  check("頭が -12dBFS 付近 (±4dB)", Math.abs(head - (-12 - 3)) < 7, `head=${head.toFixed(1)}dB`);
  const late = w.filter(x => x.tMs > (prepared.length / SR * 1000) * 0.55 &&
                             x.tMs < (prepared.length / SR * 1000) * 0.85);
  const lateMean = late.reduce((a, b) => a + b.db, 0) / late.length;
  check("自然な第2母音を時変ゲインで持ち上げない", lateMean < -24, `late=${lateMean.toFixed(1)}dB`);
  let peak = 0;
  for (const v of prepared) peak = Math.max(peak, Math.abs(v));
  check("クリップしない", peak <= 1.0, `peak=${peak.toFixed(2)}`);
}

console.log("── 3. 実レンダ: 語中に無音級の谷が無い ──");
{
  const bank = makeBank();
  for (const [w, holeFrom, holeTo] of [["aauu", 40, 750], ["ai", 40, 400], ["an", 40, 420]]) {
    const ms = api.segmentWord(w);
    const res = api.nvRenderEvent(ms, bank, SR, MORA_MS);
    check(`${w}: レンダ成功`, !!res && res.data.length > 0);
    if (!res) continue;
    const wins = rmsWindows(res.data, SR);
    const core = wins.filter(x => x.tMs >= holeFrom && x.tMs <= holeTo);
    const minDb = Math.min(...core.map(x => x.db));
    check(`${w}: ${holeFrom}〜${holeTo}ms に -45dB 未満の谷なし`, minDb > -45,
          `min=${minDb.toFixed(1)}dB`);
    let peak = 0;
    for (const v of res.data) peak = Math.max(peak, Math.abs(v));
    check(`${w}: クリップしない`, peak <= 1.0, `peak=${peak.toFixed(2)}`);
  }
}

console.log("── 4. 促音の音価 (量子化) ──");
{
  const pa = api.segmentWord("paQ");
  const qm = api.nvQuantizeMoras(pa, MORA_MS);
  const last = qm[qm.length - 1];
  check("語末っ (isQ) が存在", !!last.isQ, JSON.stringify(pa.map(m => m.isQ)));
  if (last.isQ) {
    check("isQ は原寸 (60ms) のまま", last.durationMs === 60, `got ${last.durationMs}`);
  }
  const kutta = api.segmentWord("kutta");
  const qk = api.nvQuantizeMoras(kutta, MORA_MS);
  const gapped = qk.find(m => m.gapMs > 0);
  check("語中促音の gap は 1 拍へ量子化", !!gapped && gapped.gapMs === MORA_MS,
        JSON.stringify(qk.map(m => m.gapMs)));
}

console.log("── 4b. 後続モーラの弱め (iOS FormantRenderer.eventApplyingFollowingMoraAttenuation) ──");
{
  const g = Math.pow(10, -3 / 20);
  const bank = makeBank();
  check("Onomatoi 本体と同じ -3dB", api.NV_FOLLOWING_MORA_ATTENUATION_DB === -3);
  const source = [
    { onset:"k", nucleus:"a", durationMs:180, gapMs:0, amplitude:0.74, isN:false, isQ:false },
    { onset:null, nucleus:"a", durationMs:180, gapMs:0, amplitude:0, isN:false, isQ:false, isSilentRest:true },
    { onset:"r", nucleus:"a", durationMs:180, gapMs:0, amplitude:0.92, isN:false, isQ:false },
    { onset:null, nucleus:"a", durationMs:60, gapMs:0, amplitude:0.18, isN:false, isQ:true },
    { onset:"m", nucleus:"a", durationMs:180, gapMs:0, amplitude:0.66, isN:false, isQ:false },
  ];
  const actual = api.nvApplyFollowingMoraAttenuation(api.nvPlaybackMoras(source), bank);
  check("語頭の主音は生成時の強弱のまま (0.74)", actual[0].amplitude === 0.74);
  check("休符は数えず 0 のまま", actual[1].amplitude === 0);
  check("2モーラ目以降は生成時の強弱 × -3dB",
        Math.abs(actual[2].amplitude - 0.92 * g) < 1e-12 && Math.abs(actual[4].amplitude - 0.66 * g) < 1e-12);
  check("語末促音も同じ -3dB (断ちの 0.18 を保つ)", Math.abs(actual[3].amplitude - 0.18 * g) < 1e-12);
  check("元のモーラ列は非破壊", source[0].amplitude === 0.74 && source[2].amplitude === 0.92);
  const kai = api.nvApplyFollowingMoraAttenuation(q("kaita"), bank);
  check("kaita: 主音と同じ diph run (ka→i) は弱めない", kai[0].amplitude === 1 && kai[1].amplitude === 1,
        JSON.stringify(kai.map(m => m.amplitude)));
  check("kaita: 先頭2モーラが一続きの diph で3モーラ目が新しい子音なら -6dB (tea-mi 型)",
        Math.abs(kai[2].amplitude - g * g) < 1e-12, JSON.stringify(kai.map(m => m.amplitude)));
  const kakiku = api.nvApplyFollowingMoraAttenuation(q("kakiku"), bank);
  check("kakiku: 通常の3モーラ語は2・3モーラ目とも -3dB",
        kakiku[0].amplitude === 1 && Math.abs(kakiku[1].amplitude - g) < 1e-12
          && Math.abs(kakiku[2].amplitude - g) < 1e-12, JSON.stringify(kakiku.map(m => m.amplitude)));
  check("legacyフォールバックも同じ弱め方を使う",
        fs.readFileSync(HTML_PATH, "utf8").includes(
          "const moras = nvApplyFollowingMoraAttenuation(nvPlaybackMoras(event.moras), null);"));
}

console.log("── 5. 語末専用 diph テイク (_fin) は使わない ──");
{
  // iOS は全11ペアで短尺 diph を優先し (prefersShortCvDiphForCV)、語末 _fin も長尺 diph_aaii 等も
  // CV→V 連結に使わない。Web も _fin は読み込まない (長尺は legacy 経路の cvDiphExt 用にだけ読む)。
  check("_fin を読み込まない", !api.sampleKeys().some(k => k.endsWith("_fin")));
  const sei = api.nvRenderEvent(api.segmentWord("sei"), makeBank(), SR, MORA_MS);
  check("sei: 短尺 diph でレンダ成功", !!sei && sei.data.every(Number.isFinite));
}

console.log("── 6. 現行Core入力正規化・NG語 ──");
{
  const wordOf = word => api.romajiOf({ moras: api.segmentWord(word) });
  const cases = { myi: "myi", iye: "iye", kwakwi: "kwakwi", twi: "twi",
                  gwe: "gwe", swi: "swi", zwi: "zwi", hyahyuhyehyo: "hyahyuhyehyo",
                  pyapyupyo: "pyapyupyo", ryaryuryo: "ryaryuryo", yi: "i" };
  for (const [input, expected] of Object.entries(cases))
    check(`${input} → ${expected}`, wordOf(input) === expected, `got ${wordOf(input)}`);
  // 一時停止中の CV (iOS SuspendedCVTests と同じ): 両方の解析器で丸ごと拒否し、短く読み直して代用しない
  const suspended = ["kyi", "kye", "gyi", "gye", "nyi", "mye", "ye", "hyi", "kwu", "pyi", "pye", "ryi", "rye", "nye"];
  for (const token of suspended) {
    check(`${token}: 停止中なので鳴らさない (代用しない)`,
          api.parseMora(token, false) === null && api.segmentWord(token).length === 0);
    check(`ka${token}Qyo → kayo`, wordOf("ka" + token + "Qyo") === "kayo", `got ${wordOf("ka" + token + "Qyo")}`);
  }
  for (const token of ["hye", "iye", "myi", "kya", "gya", "nya", "ya", "yu", "yo"])
    check(`${token}: 停止対象ではない`, api.segmentWord(token).length === 1);
  const stale = api.nvQuantizeMoras([
    { onset:"k", nucleus:"a", durationMs:180, gapMs:0, amplitude:1, isN:false, isQ:false },
    { onset:"ny", nucleus:"e", durationMs:180, gapMs:0, amplitude:1, isN:false, isQ:false },
  ], MORA_MS);
  check("再生時も停止中の CV を語から取り除く (PhonosymbolicEvent.init)",
        stale.length === 1 && stale[0].onset === "k");
  check("NG語にババを含む", api.NAMING_NG_WORDS.includes("ババ"));
}

console.log("── 6.5. 表情CVと母音順序 ──");
{
  const soft = { size:-1, sharp:-1, tex:1, bright:1, round:1, open:1 };
  const rounded = { size:0, sharp:0, tex:0, bright:0, round:1, open:1 };
  const rubbed = { size:0, sharp:1, tex:1, bright:0, round:1, open:0 };
  const bounce = { size:-1, sharp:1, tex:1, bright:0, round:0, open:0 };
  const cases = [
    [null,"e",soft,"iy"], ["n","e",soft,"ny"],
    ["k","a",rounded,"kw"], ["g","e",rounded,"gw"],
    ["s","i",rubbed,"sw"], ["z","i",rubbed,"zw"],
    ["h","a",soft,"hy"], ["m","i",soft,"my"],
    ["p","u",bounce,"py"], ["r","o",soft,"ry"],
  ];
  for (const [parent, vowel, axes, expected] of cases) {
    const candidate = api.expressiveVariantCandidate(parent, vowel, axes);
    check(`${parent ?? "∅"}${vowel} → ${expected}候補`,
          candidate?.onset === expected && candidate.strength >= 0.70,
          JSON.stringify(candidate));
    check(`${expected}は強い証拠で決定的に選択`,
          api.expressiveOnset(parent, vowel, axes, 0) === expected);
  }
  const ordered = api.enforceVowelAspectOrder([
    { onset:"k", nucleus:"o", durationMs:180, gapMs:0, amplitude:1, isN:false, isQ:false },
    { onset:"r", nucleus:"a", durationMs:180, gapMs:0, amplitude:1, isN:false, isQ:false },
  ]);
  check("通常生成のo→aは母音を保ってa→oへ整列",
        ordered[0].nucleus === "a" && ordered[1].nucleus === "o");
  check("直接入力のgyogyaanは制定綴りを保持",
        api.romajiOf({ moras: api.segmentWord("gyogyaan") }) === "gyogyaan");
}

console.log("── 7. Base追加音源と連続接続 ──");
{
  check("二重母音11種を登録",
        JSON.stringify(Array.from(api.DIPH_PAIRS)) === JSON.stringify([
          "ai", "au", "ei", "oi", "ou", "ui", "uo", "ea", "eo", "oa", "ua"
        ]), JSON.stringify(Array.from(api.DIPH_PAIRS)));

  const constant = (durSec, value) => {
    const out = new Float32Array(Math.round(durSec * SR));
    out.fill(value);
    return out;
  };
  const cv = new Float32Array(Math.round(0.60 * SR));
  cv.fill(0.5, 0, Math.round(0.25 * SR));
  cv.fill(0.025, Math.round(0.25 * SR));
  const handoff = api.nvComputeCvSustainHandoffEnd(cv, SR);
  check("CV定常終端を約250msで検出", Math.abs(handoff * 1000 - 250) <= 15,
        `got ${(handoff * 1000).toFixed(1)}ms`);

  const bank = { sr: SR, cv: new Map([["k|a", cv]]),
                 cvHandoff: new Map([["k|a", handoff]]),
                 v: new Map([["a", constant(1.0, -0.5)]]) };
  const before = api.nvReadRootCVSample(bank, "k", "a", 200, 500);
  const after = api.nvReadRootCVSample(bank, "k", "a", 300, 500);
  check("CV定常部までは録音を保持", before > 0.45, `got ${before.toFixed(3)}`);
  check("終端後は持続母音へhandoff", after < -0.20, `got ${after.toFixed(3)}`);

  check("連続モーラの先頭ゲインは前値", api.nvContinuousMoraGain(1, 0.5, 0, 250) === 1);
  check("連続モーラの30ms後は現値", Math.abs(api.nvContinuousMoraGain(1, 0.5, 30, 250) - 0.5) < 1e-9);

  const nTake = constant(0.10, 0.5);
  check("撥音末尾は15msフェード", api.nvReadMoraicNSample(nTake, SR, 99) < 0.05);
  check("撥音EOF後は無音", api.nvReadMoraicNSample(nTake, SR, 101) === 0);

  const assetDir = path.resolve(__dirname, "../ConsonantsOnomatoi");
  // 素材到達性パトロール: canonicalなCV/diph/促音テイクを置いたのに preload keyへ追加し忘れる事故を止める。
  // 例外は iOS の解析器も受け付けない表情CV (recordedExpressiveVowels 外 = 山専用の録音 cv_swo 等) だけ。
  const iosUnused = key => {
    const m = key.match(/^cv_([a-z]+?)([aiueo])$/);
    return !!m && !!api.RECORDED_EXTENDED_CVS[m[1]] && !api.RECORDED_EXTENDED_CVS[m[1]].has(m[2]);
  };
  const preloadKeys = new Set(api.sampleKeys());
  const canonicalAssets = fs.readdirSync(assetDir)
    .map(name => name.replace(/\.(?:wav|mp3)$/, ""))
    .filter(key => /^cv_[A-Za-z]+$/.test(key) || /^diph_[aeiou]{2}$/.test(key) || /^v_[aeiou]_Q$/.test(key));
  const ignoredAssets = [...new Set(canonicalAssets)]
    .filter(key => !preloadKeys.has(key) && !iosUnused(key));
  check("追加音声に未到達のcanonical assetがない", ignoredAssets.length === 0,
        ignoredAssets.join(", "));

  const missing = [];
  for (const key of api.sampleKeys()) {
    const candidates = api.sampleUrlCandidates(key);
    if (!candidates.some(name => fs.existsSync(path.join(assetDir, name))))
      missing.push(`${key} (${candidates.join(" | ")})`);
  }
  check("プリロード対象の音声が全て実在", missing.length === 0, missing.join(", "));
}

console.log("── 8. 配布実音源による脱落パトロール (ffmpeg必要) ──");
{
  // 合成素材では見えない移行点の誤検出を、配布ファイルと本番バンク構築で検査。
  new Function([...fs.readFileSync(HTML_PATH, "utf8").matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1]);
  const dir = path.resolve(__dirname, "../ConsonantsOnomatoi");
  for (const key of api.sampleKeys()) {
    const name = api.sampleUrlCandidates(key).find(n => fs.existsSync(path.join(dir, n)));
    const bytes = execFileSync("ffmpeg", ["-v", "error", "-i", path.join(dir, name),
      "-f", "f32le", "-ar", String(SR), "-ac", "1", "pipe:1"]);
    const data = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    api.sampleBank.set(key, { getChannelData: () => data });
  }
  const bank = api.buildNativeVoiceBank(SR);
  for (const v of "aiueo") {
    check(`${v}: 配布MP3が短音バンクに載る`, bank.shortV.get(v)?.length > SR * 0.12);
    check(`${v}: 短音と長音を別素材で保持`, bank.shortV.get(v) !== bank.v.get(v));
    for (const ms of [125, 250, 500]) {
      const result = api.nvRenderEvent(api.segmentWord(v), bank, SR, ms);
      const windows = rmsWindows(result.data, SR);
      const voiced = windows.filter(w => w.tMs >= 40 && w.tMs < ms - 40);
      check(`${v}/${ms}ms: 実短音の発音が途切れない`, result.data.every(Number.isFinite) && voiced.length > 0 && voiced.every(w => w.db > -60));
    }
  }
  for (const p of api.DIPH_PAIRS) {
    check(`${p}: 接続素材が120ms超`, bank.cvDiph.get(p)?.length > SR * 0.12,
      `${bank.cvDiph.get(p)?.length / SR * 1000}ms`);
  }
  check("促音テイクがバンクへ載る (v_<v>_Q 4本・摩擦延長 3本)",
        bank.vQ.size === 4 && ["s", "sh", "ts"].every(c => bank.fricQ.has(c)));
  check("停止中の nye は鳴らさない", api.nvRenderEvent([{ onset: "ny", nucleus: "e", durationMs: 180,
        gapMs: 0, amplitude: 1, isN: false, isQ: false }], bank, SR, 250) === null);
  let patrolled = 0;
  const silentMoras = [], invalid = [];
  for (const key of bank.cv.keys()) {
    const [onset, v1] = key.split("|");
    for (const pair of api.DIPH_PAIRS.filter(p => p[0] === v1)) {
      for (const suffix of [pair[1], pair[1] + pair[1] + "n"]) {
        const word = onset + v1 + suffix;
        const moras = api.segmentWord(word);
        const result = api.nvRenderEvent(moras, bank, SR, 250);
        patrolled++;
        if (!result || !result.data.every(Number.isFinite)) { invalid.push(word); continue; }
        for (let m = 1; m < moras.length; m++) {
          if (moras[m].isN) continue;
          const from = Math.floor((m * 0.25 + 0.06) * SR);
          const to = Math.floor((m * 0.25 + 0.18) * SR);
          let sum = 0;
          for (let i = from; i < to; i++) sum += result.data[i] ** 2;
          if (db(Math.sqrt(sum / (to - from))) < -60) silentMoras.push(`${word}:${m}`);
        }
      }
    }
  }
  check(`実CV×11二重母音 ${patrolled}語: NaN/レンダ失敗なし`, invalid.length === 0, invalid.join(", "));
  check("中央120msが無音級になる母音なし", silentMoras.length === 0, silentMoras.join(", "));
  for (const ms of [125, 250, 454.545]) {
    for (const word of ["nuoon", "kuoon", "ruoon", "keaan", "keoon", "koaan", "kuaan"]) {
      const result = api.nvRenderEvent(api.segmentWord(word), bank, SR, ms);
      const start = Math.floor((ms + ms * 0.2) / 1000 * SR);
      const end = Math.floor((2 * ms - ms * 0.2) / 1000 * SR);
      let energy = 0;
      for (let i = start; i < end; i++) energy += result.data[i] ** 2;
      const level = db(Math.sqrt(energy / (end - start)));
      check(`${word}/${ms.toFixed(0)}ms: 後半母音が脱落しない`, level > -45, `${level.toFixed(1)}dB`);
      check(`${word}: 全サンプル有限`, result.data.every(Number.isFinite));
    }
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
