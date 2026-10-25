// ng_reroll.mjs — 一筆 → 語の本線の NG 語フィルタ (2026-10-23 作者・常設合意の本線への配線)。Core NGRerollTests / NGLegislatedWordsTests と同じ規則
// (公開版 main の作り: 族の規則・かたち辞書・辞書の切り替え口は無い。言い直すのは生成の語 = 構造単位・大域だけ)
// (a) 表: NAMING_NG_WORDS は Core LexicalFilter.ngWords と同じ (順序まで)・アホ / オシリ / ニョウ を含む。刻みと上限も Core と同じ
// (b) 言い直しの口 ngReroll: 偽の生成関数で規則を固定 (salt = k × 0x4E470000・最初にきれいな語・8 回で諦める・決定的)
// (c) generateFromUnits の salt: 0 は従来の語・ずらすと別の語
// (d) interpretStroke: NG を出す一筆 (合成の曲線・この版の珠の取り方) は言い直され、きれいな同じ語に着地する。きれいな線は salt = 0 のまま
// (e) 固有語は変えない (NG なら ngFixedWord の印だけ)
// (f) 固有語の表 (角度・弧・円・ハート・星・一筆五芒星・葉など・三角・四角・砂時計/蝶ネクタイ) が NG に当たらない — 当たったら止めて報告する
// (g) 避ける語 (2026-10-24 作者・衝突語の採否シート): STROKE_AVOID_WORDS = Core strokeAvoidWords・語全体の一致・命名には効かない・りりー / へん になる合成の曲線は言い直される
// 実行: node test/ng_reroll.mjs   (Core の表は隣の OnomatoiCore を読む。無ければ失敗する)
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML_PATH = path.resolve(__dirname, "../iceface_onomatoi.html");
const CORE = path.resolve(__dirname, "../../OnomatoiCore");
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
const EXPORTS = ["interpretStroke", "distanceFiltered", "densified", "namingKanaOf", "namingIsClean", "NAMING_NG_WORDS", "NG_REROLL_STEP",
  "NG_MAX_REROLLS", "ngReroll", "STROKE_AVOID_WORDS", "strokeWordIsClean", "segmentStroke", "generateFromUnits", "extractAxes", "vocabEvent", "romajiOf",
  "SHARPNESS_VOCAB", "ARC_VOCAB", "CIRCLE_VOCAB", "HEART_VOCAB", "HEART_CLEAN_VOCAB", "STAR_VOCAB", "ONE_STROKE_PENTAGRAM_VOCAB",
  "ONE_STROKE_PENTAGRAM_VOCAB_LEVELS", "SHAPE_PROTOTYPE_VOCAB", "TRIANGLE_VOCAB", "INVERTED_TRIANGLE_VOCAB", "SQUARE_VOCAB",
  "RECTANGLE_VOCAB", "LEGISLATED_DISPLAY", "crossedQuadrilateralVocabWord"];
function load(source) {
  const ctx = vm.createContext({ console });
  vm.runInNewContext(extractEngine(source) + `\n;globalThis.__api = { ${EXPORTS.join(", ")} };`, ctx, { filename: "engine(extracted)" });
  const api = ctx.__api;
  for (const name of EXPORTS) if (api[name] === undefined) throw new Error(`engine 抽出失敗: ${name}`);
  return api;
}
const api = load(html);

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => { if (cond) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); } };
const readCore = rel => {
  const p = path.join(CORE, rel);
  if (!fs.existsSync(p)) { check(`Core の ${rel} が読める`, false, `無い: ${p}`); return null; }
  return fs.readFileSync(p, "utf8");
};

console.log("── (a) 表 ──");
{
  const swift = readCore("Sources/OnomatoiCore/Core/LexicalFilter.swift");
  if (swift) {
    const block = swift.slice(swift.indexOf("public static let ngWords: [String] = ["));
    const body = block.slice(block.indexOf("[") + 1, block.indexOf("\n    ]"));
    const coreWords = [...body.split("\n").map(l => l.replace(/\/\/.*$/, "")).join("\n").matchAll(/"([^"]+)"/g)].map(m => m[1]);
    check("Core の表を読めた (25 語以上)", coreWords.length >= 25, String(coreWords.length));
    check("Web の NAMING_NG_WORDS = Core の LexicalFilter.ngWords (順序まで同じ)", JSON.stringify(api.NAMING_NG_WORDS) === JSON.stringify(coreWords),
      `web ${api.NAMING_NG_WORDS.length} 語 / core ${coreWords.length} 語`);
    const rer = /public static let rerollSalt: UInt64 = (0x[0-9A-Fa-f_]+)/.exec(swift), max = /public static let maxRerolls = (\d+)/.exec(swift);
    check("言い直しの刻みと上限が Core と同じ", !!rer && !!max && Number(rer[1].replace(/_/g, "")) === api.NG_REROLL_STEP && Number(max[1]) === api.NG_MAX_REROLLS,
      `${rer?.[1]} / ${max?.[1]}`);
  }
}
for (const ng of ["アホ", "オシリ", "ニョウ"]) check(`${ng} は表にあり NG`, api.NAMING_NG_WORDS.includes(ng) && !api.namingIsClean(ng));
check("あほり・おしり・おしーり・にょう・ぬにょうだ は NG", ["あほり", "おしり", "おしーり", "にょう", "ぬにょうだ"].every(w => !api.namingIsClean(w)));
check("隣の語 (じじ・うざん・ちょんちり・ちんちり・ちん・おしゃれ・にゅう) は通る", ["じじ", "じじー", "うざん", "ちょんちり", "ちんちり", "ちん", "おしゃれ", "にゅう", "ほほーん"].every(w => api.namingIsClean(w)));

console.log("── (b) ngReroll (偽の生成関数) ──");
{
  let calls = [];
  let r = api.ngReroll(s => { calls.push(s); return "ころころ"; }, k => k);
  check("きれいなら salt = 0 の 1 回だけ", r.value === "ころころ" && r.rerolls === 0 && calls.join() === "0", calls.join());
  calls = [];
  r = api.ngReroll(s => { calls.push(s); return s === 0 ? "げり" : s === api.NG_REROLL_STEP ? "ばば" : s === 2 * api.NG_REROLL_STEP ? "ぽとん" : "えろ"; }, k => k);
  check("k × 0x4E470000 を順に試し、最初にきれいな語で止まる", api.NG_REROLL_STEP === 0x4E470000 && r.value === "ぽとん" && r.rerolls === 2
    && calls.join() === `0,${api.NG_REROLL_STEP},${2 * api.NG_REROLL_STEP}`, calls.join());
  calls = [];
  r = api.ngReroll(s => { calls.push(s); return s; }, () => "ゲリ");
  check("8 回とも NG なら最後の語のまま (従来 + 8 回 = 9 回呼ぶ)", r.rerolls === 8 && calls.length === 9 && r.value === 8 * api.NG_REROLL_STEP, `${r.rerolls}/${calls.length}/${r.value}`);
  const run = () => api.ngReroll(s => (s < 3 * api.NG_REROLL_STEP ? "うんこ" : "ほげ" + s), k => k);
  check("決定的", JSON.stringify(run()) === JSON.stringify(run()) && run().rerolls === 3);
}

const W = 1000, H = 561;
console.log("── (c) generateFromUnits の salt ──");
{
  const loopChain = (loops, r, gap, zigzag = false) => {
    const pts = []; let x = 150; const cy = 280;
    for (let li = 0; li < loops; li++) {
      for (let k = 0; k <= 40; k++) { const t = k / 40 * 2 * Math.PI - Math.PI / 2; pts.push({ x: x + r * Math.cos(t), y: cy + r * Math.sin(t) }); }
      if (li < loops - 1) {
        const steps = Math.max(4, Math.floor(gap / 12));
        for (let s = 1; s <= steps; s++) { let y = cy - r; if (zigzag) y += (Math.floor(s / 4) % 2 === 0 ? -28 : 28); pts.push({ x: x + gap * s / steps, y }); }
      }
      x += gap;
    }
    return pts;
  };
  const word = (pts, kiki, salt) => {
    const seg = api.segmentStroke(pts);
    const ax = api.extractAxes(pts, W, H);
    const ev = salt === undefined
      ? api.generateFromUnits(seg.units, W, H, ax, kiki, 0.4, null, null, 6)
      : api.generateFromUnits(seg.units, W, H, ax, kiki, 0.4, null, null, 6, salt);
    return api.romajiOf(ev) + "|" + JSON.stringify(ev.moras);
  };
  const inputs = [loopChain(3, 55, 220), loopChain(4, 40, 120), loopChain(3, 55, 220, true), loopChain(5, 35, 90)];
  let same0 = true, deterministic = true, shifted = 0;
  for (const pts of inputs) for (const kiki of [null, 0.25, -0.5]) {
    const base = word(pts, kiki);
    if (word(pts, kiki, 0) !== base) same0 = false;
    const a = word(pts, kiki, api.NG_REROLL_STEP), b = word(pts, kiki, api.NG_REROLL_STEP);
    if (a !== b) deterministic = false;
    if (a !== base) shifted++;
  }
  check("salt = 0 は引数を省いたときと完全に同じ語", same0);
  check("同じ salt は同じ語", deterministic);
  check("salt をずらすと語が変わる入力がある", shifted > 0, String(shifted));
  const zz = loopChain(3, 55, 260, true), zbase = word(zz, null, 0);
  let changed = false, zdet = true;
  for (let k = 1; k <= 8; k++) { const w = word(zz, null, k * api.NG_REROLL_STEP); if (w !== word(zz, null, k * api.NG_REROLL_STEP)) zdet = false; if (w !== zbase) changed = true; }
  check("ギザギザのつなぎ線 (音節になる線) も salt に従う", changed && zdet);
}

console.log("── (d) interpretStroke: NG を出す一筆は言い直される ──");
const NG_STROKES = [
  // 従来の語 でぃっにょうやじっぶ (ニョウ) → 言い直し 1 回
  { name: "sine2605", route: "units", ng: "ニョウ", word: "じっやびびぎゃっい", points: "167.59,338.44 166.82,341.54 164.51,333.8 162.83,315.95 163.8,290.65 168.96,262.07 179.03,235.2 193.76,214.94 212.03,205.24 232.02,208.33 251.56,224.25 268.6,250.83 281.55,284.01 289.62,318.49 292.96,348.67 292.64,369.57 290.44,377.74 288.5,371.78 288.91,352.6 293.3,323.2 302.53,288.16 316.55,252.77 334.34,222.14 354.19,200.38 373.95,189.91 391.54,191.18 405.25,202.73 414.14,221.58 418.22,243.94 418.41,265.93 416.38,284.37 414.24,297.31 414.13,304.31 417.77,306.39 426.18,305.61 439.44,304.54 456.71,305.5 476.35,309.98 496.28,318.22 514.36,328.99 528.81,339.87 538.53,347.64 543.38,349.07 544.11,341.58 542.31,323.97 540.04,296.82 539.45,262.59 542.37,225.4 549.96,190.38 562.45,162.86 579.14,147.44 598.52,147.18 618.56,162.96 637.09,193.3 652.24,234.45 662.79,281.03 668.41,326.79 669.74,365.68 668.23,392.76 665.89,404.96 664.88,401.56 667.11,384.16 673.87,356.37 685.57,323.04 701.65,289.45 720.72,260.38 740.8,239.29 759.72,227.9 775.54,226 786.9,231.7 793.33,241.95 795.29,253.3 794.13,262.61 791.77,267.78 790.39,268.06 791.98,264.22 797.93,258.25 808.82,252.87 824.24,250.86 842.94,254.35" },
  // 従来の語 るんげり (ゲリ) → 言い直し 1 回
  { name: "arcy1120", route: "generated", ng: "ゲリ", word: "れるらら", points: "517.39,348.56 514.75,353.47 511.57,357.81 507.87,361.09 503.8,362.96 499.56,363.19 495.39,361.77 491.51,358.86 488.09,354.79 485.19,350.02 482.79,345.07 480.74,340.47 478.82,336.67 476.75,334.02 474.26,332.69 471.09,332.67 467.11,333.79 462.3,335.71 456.78,338.02 450.8,340.23 444.72,341.91 438.98,342.67 433.99,342.27 430.13,340.6 427.66,337.71 426.69,333.79 427.13,329.14 428.71,324.11 431.04,319.08 433.58,314.37 435.78,310.24 437.11,306.82 437.14,304.13 435.63,302.07 432.52,300.47 427.98,299.09 422.38,297.69 416.24,296.04 410.19,293.99 404.88,291.47 400.88,288.51 398.63,285.22 398.38,281.75 400.15,278.31 403.73,275.07 408.69,272.18 414.48,269.71 420.45,267.63 425.96,265.85 430.44,264.17 433.5,262.39 434.93,260.27 434.74,257.64 433.17,254.37 430.62,250.44 427.63,245.95 424.79,241.11 422.64,236.19 421.64,231.55 422.11,227.52 424.17,224.4 427.74,222.39 432.59,221.57 438.35,221.88 444.55,223.09 450.75,224.88 456.53,226.82 461.58,228.46 465.72,229.38 468.94,229.24 471.35,227.84" },
  // 従来の語 ぶばばぼ (ババ) → 言い直し 1 回
  { name: "arcy2863", route: "generated", ng: "ババ", word: "ずーうー", points: "400.16,242.27 397.26,236.07 395.46,229.92 395.34,224.25 397.19,219.49 401,215.91 406.41,213.6 412.85,212.43 419.6,212.03 425.99,211.86 431.45,211.31 435.64,209.82 438.5,206.99 440.25,202.68 441.28,197.04 442.13,190.5 443.32,183.72 445.29,177.47 448.28,172.48 452.35,169.33 457.33,168.29 462.93,169.32 468.77,172.01 474.49,175.7 479.82,179.54 484.63,182.69 488.95,184.44 492.95,184.37 496.87,182.39 500.96,178.8 505.4,174.2 510.26,169.42 515.47,165.34 520.81,162.75 526.01,162.19 530.75,163.89 534.8,167.7 538.06,173.14 540.6,179.49 542.66,185.9 544.61,191.61 546.9,196.01 549.93,198.78 553.98,199.92 559.13,199.76 565.23,198.86 571.89,197.92 578.55,197.6 584.58,198.45 589.41,200.81 592.61,204.73 594.01,209.99 593.74,216.19 592.23,222.8 590.12,229.28 588.18,235.21 587.12,240.33 587.53,244.58 589.69,248.09 593.56,251.16 598.75,254.13 604.6,257.34 610.28,261.02 614.94,265.26 617.88,270 618.65,275.04 617.16,280.14 613.67,285.02 608.78,289.49 603.29,293.5 598.06,297.12" },
  // 従来の語 にょう (ニョウ) → 言い直し 1 回
  { name: "arcy4204", route: "generated", ng: "ニョウ", word: "にん", points: "375.56,191.57 375.17,187.97 375.95,185.15 378.36,183.57 382,183.03 385.87,182.8 388.87,181.93 390.45,179.83 390.81,176.55 390.82,172.82 391.5,169.65 393.53,167.79 396.85,167.33 400.76,167.64 404.28,167.64 406.71,166.43 407.95,163.75 408.55,160.14 409.38,156.69 411.17,154.44 414.11,153.83 417.83,154.46 421.54,155.26 424.55,155.07 426.57,153.26 427.86,150.09 429.05,146.55 430.8,143.9 433.45,142.96 436.85,143.65 440.48,145.05 443.77,145.88 446.35,145.15 448.29,142.72 449.98,139.38 451.9,136.46 454.4,135.07 457.48,135.57 460.85,137.32 464.11,139.03 466.99,139.45 469.42,138.03 471.62,135.22 473.88,132.23 476.42,130.43 479.28,130.55 482.33,132.35 485.35,134.7 488.21,136.22 490.88,135.96 493.49,133.97 496.15,131.24 498.91,129.15 501.73,128.82 504.5,130.4 507.16,133.1 509.75,135.52 512.38,136.46 515.17,135.53 518.17,133.35 521.26,131.23 524.21,130.47 526.86,131.67 529.17,134.4 531.32,137.45 533.62,139.48 536.33,139.72 539.5,138.37 542.89,136.5 546.13,135.48 548.84,136.22" },
]
;
const parse = text => text.split(" ").map(p => { const [x, y] = p.split(",").map(Number); return { x, y }; });
// pointerup と同じ段 (この版): 粗い筆の頂点 (画面の対角の 2.2%) → 6px 密化 → interpretStroke
const run = (raw, a = api) => {
  const beads = a.distanceFiltered(raw, Math.hypot(W, H) * 0.022);
  const ink = beads.length >= 2 ? a.densified(beads, 6) : beads;
  const r = a.interpretStroke(ink, W, H, { coarse: true, hc: 0, language: "ja" });
  return { r, kana: r.event.displayWordOverride ?? a.namingKanaOf(r.event.moras) };
};
for (const s of NG_STROKES) {
  const pts = parse(s.points);
  const a = run(pts), b = run(pts);
  check(`${s.name} (${s.route}・${s.ng}): 1 回言い直され、経路は ${s.route}`, a.r.ngRerolls === 1 && a.r.route === s.route, `${a.r.ngRerolls}/${a.r.route}`);
  check(`${s.name}: きれいな語 ${s.word} に着地し、固有語の印は付かない`, a.kana === s.word && api.namingIsClean(a.kana) && a.r.ngFixedWord === false, a.kana);
  check(`${s.name}: 同じ入力は同じ語`, a.kana === b.kana && JSON.stringify(a.r.event.moras) === JSON.stringify(b.r.event.moras));
}
const circle = Array.from({ length: 161 }, (_, i) => { const a = 2 * Math.PI * i / 160; return { x: 500 + 150 * Math.cos(a), y: 280 + 150 * Math.sin(a) }; });
{
  const r = run(circle);
  check("きれいな固有語 (円) は言い直さない・印も付かない", r.r.ngRerolls === 0 && r.r.ngFixedWord === false && r.r.route === "vocabulary", `${r.r.route}/${r.kana}`);
  const wave = Array.from({ length: 241 }, (_, i) => { const t = i / 240; return { x: 200 + 600 * t, y: 280 - 90 * Math.sin(t * 3 * Math.PI) }; });
  const g = run(wave);
  check("きれいな生成の語は salt = 0 のまま", g.r.route !== "vocabulary" && g.r.ngRerolls === 0 && api.namingIsClean(g.kana), `${g.r.route}/${g.kana}`);
}

console.log("── (e) 固有語は変えない (NG なら印だけ) ──");
{
  const from = 'const CIRCLE_VOCAB = ["oon", "aoon", "aaaan"];';
  check("書き換え対象がある: CIRCLE_VOCAB", html.split(from).length === 2);
  const ng = load(html.replace(from, 'const CIRCLE_VOCAB = ["geri", "geri", "geri"];'));
  const r = run(circle, ng);
  check("円の固有語が NG (げり) でも言い直さない", r.r.route === "vocabulary" && ng.romajiOf(r.r.event) === "geri" && r.r.ngRerolls === 0, `${r.r.route}/${r.kana}`);
  check("NG の固有語には ngFixedWord の印が付く", r.r.ngFixedWord === true && !api.namingIsClean(r.kana), r.kana);
}

console.log("── (f) 固有語の表が NG に当たらない (当たったら止めて報告) ──");
{
  const ax = { size: 0, sharp: 0, tex: 0, bright: 0, round: 0, open: 0 };
  const spelled = romaji => api.namingKanaOf(api.vocabEvent(romaji, ax).moras);
  const words = [];
  const add = (p, romaji, display = null) => words.push({ p, romaji, display: display ?? api.LEGISLATED_DISPLAY[romaji] ?? null });
  for (const [stage, list] of Object.entries(api.SHARPNESS_VOCAB)) list.forEach(([r, d], i) => add(`SHARPNESS_VOCAB[${stage}][${i}]`, r, d));
  for (const [dir, list] of Object.entries(api.ARC_VOCAB)) list.forEach((r, i) => add(`ARC_VOCAB.${dir}[${i}]`, r));
  api.CIRCLE_VOCAB.forEach((r, i) => add(`CIRCLE_VOCAB[${i}]`, r));
  add("HEART_VOCAB", api.HEART_VOCAB); add("HEART_CLEAN_VOCAB", api.HEART_CLEAN_VOCAB); add("STAR_VOCAB", api.STAR_VOCAB);
  add("ONE_STROKE_PENTAGRAM_VOCAB", api.ONE_STROKE_PENTAGRAM_VOCAB);
  api.ONE_STROKE_PENTAGRAM_VOCAB_LEVELS.forEach((r, i) => add(`ONE_STROKE_PENTAGRAM_VOCAB_LEVELS[${i}]`, r));
  for (const [fam, list] of Object.entries(api.SHAPE_PROTOTYPE_VOCAB)) list.forEach((r, i) => add(`SHAPE_PROTOTYPE_VOCAB.${fam}[${i}]`, r));
  add("TRIANGLE_VOCAB", api.TRIANGLE_VOCAB); add("INVERTED_TRIANGLE_VOCAB", api.INVERTED_TRIANGLE_VOCAB);
  api.SQUARE_VOCAB.forEach((r, i) => add(`SQUARE_VOCAB[${i}]`, r)); api.RECTANGLE_VOCAB.forEach((r, i) => add(`RECTANGLE_VOCAB[${i}]`, r));
  for (const kind of ["hourglass", "bowtie"]) for (const level of [1, 2, 3]) add(`${kind}[${level}]`, api.crossedQuadrilateralVocabWord({ kind, level }));
  for (const [r, d] of Object.entries(api.LEGISLATED_DISPLAY)) add(`LEGISLATED_DISPLAY.${r}`, r, d);
  const hits = [];
  for (const w of words) {
    const shown = w.display ?? spelled(w.romaji);
    if (!api.namingIsClean(shown)) hits.push(`${w.p} = ${shown} (${w.romaji})`);
    if (w.display != null && !api.namingIsClean(spelled(w.romaji))) hits.push(`${w.p} 綴りの かな = ${spelled(w.romaji)} (${w.romaji})`);
  }
  check(`固有語の表 ${words.length} 語すべて NG に当たらない`, hits.length === 0 && words.length > 60, hits.join(" / ") || String(words.length));
}

console.log("── (g) 避ける語 (語全体の一致・一筆の本線だけ) ──");
{
  const swift = readCore("Sources/OnomatoiCore/Core/LexicalFilter.swift");
  if (swift) {
    const m = /public static let strokeAvoidWords: \[String\] = \[([^\]]*)\]/.exec(swift);
    const coreAvoid = m ? [...m[1].matchAll(/"([^"]+)"/g)].map(x => x[1]) : null;
    check("Web の STROKE_AVOID_WORDS = Core の LexicalFilter.strokeAvoidWords", coreAvoid && JSON.stringify(api.STROKE_AVOID_WORDS) === JSON.stringify(coreAvoid),
      `web ${JSON.stringify(api.STROKE_AVOID_WORDS)} / core ${JSON.stringify(coreAvoid)}`);
  }
  check("りりー・へん は一筆の語として避ける", ["りりー", "へん", "リリー", "ヘン"].every(w => !api.strokeWordIsClean(w)));
  check("語全体の一致だけ (ぴりり・ぎゃりり・りりり・りりーん・へんぽ・ぺへん・へー・ぜん は通る)",
    ["ぴりり", "ぎゃりり", "きゃりり", "りりり", "りり", "りりーん", "へんぽ", "ぺへん", "へー", "ぜん"].every(w => api.strokeWordIsClean(w)));
  check("NG は一筆の判定でも止まる・避ける語は命名 (namingIsClean) では止まらない",
    !api.strokeWordIsClean("ばばぼぼ") && api.namingIsClean("りりー") && api.namingIsClean("へん"));
  const make = s => (s === 0 ? "りりー" : "せしり");
  const plain = api.ngReroll(make, k => k), stroke = api.ngReroll(make, k => k, api.NG_MAX_REROLLS, api.NG_REROLL_STEP, api.strokeWordIsClean);
  check("ngReroll の判定は差し替えられる (既定 = NG だけ)", plain.value === "りりー" && plain.rerolls === 0 && stroke.value === "せしり" && stroke.rerolls === 1);
  // 合成の曲線 (Onomatoi Atlas probes/collide_all/find_strokes.mjs・種 20261024・公開 main の珠の取り方で探した)。変更前の語は from
  const AVOID_STROKES = [
    { name: "loopline763", from: "へん", word: "にゃん", route: "units", points: "329.66,244.58 334.63,244.09 339.61,243.59 344.58,243.09 349.56,242.59 354.53,242.09 359.51,241.59 364.48,241.09 369.46,240.6 374.43,240.1 379.41,239.6 384.38,239.1 389.36,238.6 394.33,238.1 399.31,237.6 404.28,237.1 409.26,236.61 414.23,236.11 419.21,235.61 424.18,235.11 429.16,234.61 425.34,238.79 418.79,245.77 414.05,254.75 411.38,265.24 410.94,276.67 412.74,288.4 416.68,299.79 422.55,310.22 430.03,319.12 438.71,326 448.11,330.48 457.71,332.32 467,331.42 475.45,327.82 482.61,321.72 488.09,313.46 491.59,303.49 492.9,292.36 491.97,280.68 488.84,269.08 483.68,258.2 476.78,248.64 468.52,240.93 459.34,235.48 449.75,232.59 440.28,232.43 431.45,235 423.73,240.16 417.56,247.63 413.26,256.99 411.09,267.74 411.15,279.29 413.44,291 417.84,302.23 424.1,312.37 431.89,320.85 440.77,327.22 450.26,331.13 459.84,332.36 468.98,330.84 477.18,326.66 484,320.05 489.06,311.36 492.07,301.08 492.89,289.77 491.46,278.05 487.85,266.56 482.28,255.92 487.35,256.43 492.43,256.93 497.5,257.44 502.58,257.94 507.66,258.44 512.73,258.95 517.81,259.45 522.88,259.95 527.96,260.46 533.03,260.96 538.11,261.47 543.18,261.97 548.26,262.47 553.34,262.98 558.41,263.48 563.49,263.98 568.56,264.49 573.64,264.99 578.71,265.5 583.79,266 588.86,266.5 593.94,267.01 599.02,267.51 604.09,268.01 609.17,268.52 614.24,269.02 619.32,269.53 624.39,270.03 629.47,270.53 634.54,271.04" },
    { name: "arc9322", from: "りりー", word: "しにり", route: "generated", points: "871.12,347.21 861.06,348.94 850.27,349.95 839.27,350.2 828.57,349.66 818.68,348.37 810.06,346.39 803.13,343.81 798.2,340.75 795.51,337.35 795.19,333.78 797.25,330.21 801.59,326.8 808.02,323.71 816.22,321.1 825.81,319.07 836.34,317.74 847.31,317.16 858.21,317.35 868.51,318.32 877.74,320.01 885.45,322.35 891.29,325.21" },
  ];
  for (const s of AVOID_STROKES) {
    const pts = parse(s.points);
    const a = run(pts), b = run(pts);
    check(`${s.name}: ${s.from} を 1 回言い直して ${s.word} (${s.route}・印なし)`, a.r.ngRerolls === 1 && a.kana === s.word && a.r.ngFixedWord === false && a.r.route === s.route,
      `${a.r.ngRerolls}/${a.kana}/${a.r.route}`);
    check(`${s.name}: 同じ入力は同じ語`, a.kana === b.kana && JSON.stringify(a.r.event.moras) === JSON.stringify(b.r.event.moras));
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
