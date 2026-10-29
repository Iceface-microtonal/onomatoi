// ng_reroll.mjs — 一筆 → 語の本線の NG 語フィルタ (2026-10-23 作者・常設合意の本線への配線)。Core NGRerollTests / NGLegislatedWordsTests と同じ規則
// (a) 表: NAMING_NG_WORDS は Core LexicalFilter.ngWords と同じ (順序まで)・アホ / オシリ / ニョウ を含む
// (b) 言い直しの口 ngReroll: 偽の生成関数で規則を固定 (salt = k × 0x4E470000・最初にきれいな語・8 回で諦める・決定的)
// (c) generateFromUnits の salt: 0 は従来の語・ずらすと別の語
// (d) interpretStroke: NG を出す一筆 (合成の曲線・Core と同じ点列と語) は言い直され、きれいな同じ語に着地する。きれいな線は salt = 0 のまま
// (e) 固有語・族の規則の固定語は変えない (NG なら ngFixedWord の印だけ)
// (f) 立法の語 (LEXICON_KOU の words / family・Core の Data/lexicon_data_v1.json・かたち辞書の語と提案) が NG に当たらない — 当たったら止めて報告する
// (g) 避ける語 (2026-10-24 作者・衝突語の採否シート): STROKE_AVOID_WORDS = Core strokeAvoidWords・語全体の一致・命名には効かない・りりー になる合成の曲線は言い直される
// 実行: node test/ng_reroll.mjs   (Core の表と立法の語は隣の OnomatoiCore を読む。無ければ失敗する)
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
const EXPORTS = ["interpretStroke", "scaleFreeInk", "namingKanaOf", "namingIsClean", "NAMING_NG_WORDS", "NG_REROLL_STEP", "NG_MAX_REROLLS",
  "ngReroll", "LEXICON_KOU", "KATACHI_DICTIONARY", "segmentStroke", "generateFromUnits", "extractAxes", "vocabEvent", "romajiOf",
  "STROKE_AVOID_WORDS", "strokeWordIsClean"];
const ctx = vm.createContext({ console });
vm.runInNewContext(extractEngine(html) + `\n;globalThis.__api = { ${EXPORTS.join(", ")} };`, ctx, { filename: "engine(extracted)" });
const api = ctx.__api;
for (const name of EXPORTS) if (api[name] === undefined) throw new Error(`engine 抽出失敗: ${name}`);

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
    check("言い直しの刻みと上限が Core と同じ", rer && Number(rer[1].replace(/_/g, "")) === api.NG_REROLL_STEP && Number(max[1]) === api.NG_MAX_REROLLS,
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
  check("k × 0x4E470000 を順に試し、最初にきれいな語で止まる", r.value === "ぽとん" && r.rerolls === 2 && calls.join() === `0,${api.NG_REROLL_STEP},${2 * api.NG_REROLL_STEP}`, calls.join());
  calls = [];
  r = api.ngReroll(s => { calls.push(s); return s; }, () => "ゲリ");
  check("8 回とも NG なら最後の語のまま (従来 + 8 回 = 9 回呼ぶ)", r.rerolls === 8 && calls.length === 9 && r.value === 8 * api.NG_REROLL_STEP, `${r.rerolls}/${calls.length}/${r.value}`);
  const run = () => api.ngReroll(s => (s < 3 * api.NG_REROLL_STEP ? "うんこ" : "ほげ" + s), k => k);
  check("決定的", JSON.stringify(run()) === JSON.stringify(run()) && run().rerolls === 3);
}

console.log("── (c) generateFromUnits の salt ──");
{
  const W = 1000, H = 561;
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
    const shape = { corners: 0, loops: seg.loopCount, isClosed: false };
    const ev = salt === undefined
      ? api.generateFromUnits(seg.units, W, H, ax, kiki, 0.4, null, null, 6, shape)
      : api.generateFromUnits(seg.units, W, H, ax, kiki, 0.4, null, null, 6, shape, salt);
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
  { name: "sine1397", route: "units", ng: "ババ", word: "ばぬーろろーおー", points: "211.3,201.12 231.48,281.79 240.51,368.7 238.37,448.44 226.73,508.62 208.76,539.79 188.57,536.84 170.61,499.84 159.02,434 156.93,348.86 166.02,256.9 186.26,171.58 215.89,105.31 251.74,67.59 289.65,63.52 325.17,93.05 354.2,151.01 373.64,227.87 381.87,311.24 378.98,387.75 366.79,445.08 348.52,473.89 328.34,469.22 310.7,431.27 299.69,365.35 298.34,281.11 308.24,191.03 329.21,108.55 359.4,46.02 395.53,12.8 433.42,13.82 468.61,48.88 497.05,112.64 515.74,195.43 523.17,284.77 519.55,367.23 506.81,430.51 488.27,465.28 468.12,466.63 450.83,434.82 440.4,375.2 439.81,297.43 450.51,213.94 472.2,138.11 502.93,82.14 539.33,55.22 577.17,62.13 612.01,102.47 639.85,170.75 657.78,257.2 664.41,349.25 660.08,433.48 646.81,497.63 628.01,532.46 607.92,533.18 590.98,500.17 581.17,438.89 581.34,359.08 592.83,273.22 615.24,194.68 646.49,135.62 683.14,105.18 720.91,108.03 755.38,143.71 782.61,206.68 799.77,287.16 805.6,372.64 800.56,449.77 786.78,506.46 767.74,533.64 747.73,526.72 731.17,486.28 721.98,417.95 722.92,331.58 735.21,239.77 758.33,155.89 790.08,92.09 826.95,57.43 864.64,56.53 898.72,88.84" },
  { name: "sine1757", route: "units", ng: "ニョウ", word: "りるるっむろぶ", points: "213.01,202.3 222.96,213.5 227.78,227.39 227.78,242.27 223.69,256.49 216.54,268.61 207.6,277.54 198.31,282.6 190.12,283.61 184.39,280.89 182.29,275.18 184.7,267.59 192.14,259.49 204.72,252.32 222.13,247.47 243.71,246.14 268.42,249.18 295,256.99 322.03,269.49 348.06,286.07 371.71,305.65 391.8,326.75 407.43,347.61 418.05,366.32 423.53,381.03 424.13,390.11 420.53,392.28 413.71,386.75 404.92,373.37 395.6,352.58 387.18,325.49 381.06,293.77 378.43,259.56 380.21,225.27 386.97,193.47 398.88,166.63 415.69,146.91 436.77,136.03 461.14,135.06 487.56,144.36 514.61,163.49 540.86,191.23 564.89,225.69 585.5,264.37 601.75,304.42 613.05,342.8 619.2,376.51 620.41,402.89 617.31,419.76 610.84,425.65 602.24,419.91 592.9,402.79 584.28,375.43 577.78,339.81 574.63,298.59 575.8,254.94 581.89,212.27 593.13,174.01 609.33,143.31 629.9,122.83 653.9,114.47 680.12,119.25 707.18,137.19 733.61,167.32 758.01,207.67 779.13,255.48 796,307.32 807.96,359.4 814.78,407.79 816.61,448.77 814.03,479.07 807.93,496.15 799.54,498.38 790.21,485.18 781.42,457.11 774.57,415.8 770.92,363.87 771.47,304.75 776.9,242.43 787.46,181.2" },
  // bez45923 (2026-10-30): 旧 arcy1186 は族の語 みょー になった → Atlas probes/collide_all/find_reroll.mjs ng bez (従来の語 てげり)
  { name: "bez45923", route: "generated", ng: "ゲリ", word: "じぎゃり", points: "350.03,314.69 357.19,326.53 364.12,337.74 370.79,348.33 377.21,358.3 383.38,367.66 389.29,376.42 394.93,384.59 400.3,392.16 405.4,399.15 410.22,405.57 414.76,411.42 419.02,416.7 422.98,421.42 426.65,425.6 430.02,429.23 433.08,432.33 435.84,434.9 438.29,436.94 440.41,438.47 442.22,439.49 443.7,440 444.85,440.02 445.67,439.54 446.15,438.59 446.29,437.16 446.08,435.25 445.52,432.89 444.6,430.06 443.32,426.79 441.68,423.07 439.67,418.92 437.28,414.33 434.52,409.33 431.37,403.9 427.84,398.07 423.92,391.83 419.61,385.19 414.89,378.17 409.77,370.76 404.25,362.97 398.31,354.81 391.95,346.29 385.17,337.41" },
  { name: "arcy332", route: "generated", ng: "ニョウ", word: "ぬーなわ", points: "304.56,314.22 296.96,309.49 290.2,304.29 284.89,298.63 281.52,292.6 280.41,286.35 281.64,280.05 285.06,273.88 290.32,267.99 296.87,262.49 304.08,257.4 311.25,252.67 317.75,248.16 323.02,243.72 326.72,239.12 328.68,234.16 328.98,228.7 327.88,222.65 325.85,215.99 323.45,208.84 321.31,201.39 320.01,193.91 320.07,186.72 321.84,180.15 325.5,174.48 331.04,169.91 338.23,166.56 346.74,164.4 356.08,163.27 365.75,162.89 375.24,162.89 384.13,162.86 392.12,162.37 399.04,161.06 404.9,158.66 409.82,155.02 414.08,150.18 417.99,144.32 421.93,137.76 426.2,130.96 431.09,124.4 436.74,118.6 443.22,114.02 450.44,111.01 458.26,109.77 466.43,110.34 474.72,112.56 482.86,116.13 490.69,120.59 498.08,125.42 505.03,130.09 511.61,134.09 517.99,137.02 524.38,138.6 531,138.77 538.04,137.61 545.63,135.39 553.81,132.49 562.51,129.42 571.55,126.69 580.65,124.79 589.49,124.14 597.72,125.01 605.04,127.53 611.21,131.66 616.12,137.21 619.79,143.83 622.4,151.11 624.26,158.6 625.77,165.86 627.4,172.52" },
  { name: "spiral245538", route: "family", ng: "ニョウ (うにょうにょ)", word: "みゅねみゅね", points: "-7.29,0.08 -8.55,0.76 -9.72,1.56 -10.74,2.5 -11.6,3.55 -12.27,4.71 -12.71,5.96 -12.91,7.29 -12.84,8.68 -12.48,10.1 -11.83,11.54 -10.88,12.97 -9.62,14.38 -8.05,15.72 -6.17,16.98 -4.01,18.14 -1.57,19.17 1.12,20.05 4.04,20.76 7.16,21.27 10.44,21.58 13.85,21.66 17.33,21.5 20.86,21.09 24.38,20.43 27.85,19.51 31.2,18.33 34.4,16.9 37.4,15.23 40.14,13.32 42.57,11.19 44.66,8.87 46.36,6.36 47.64,3.71 48.46,0.92 48.78,-1.96 48.6,-4.89 47.89,-7.86 46.63,-10.82 44.84,-13.72 42.51,-16.55 39.64,-19.25 36.26,-21.79 32.39,-24.13 28.07,-26.24 23.32,-28.08 18.2,-29.62 12.75,-30.84 7.03,-31.71 1.1,-32.2 -4.98,-32.3 -11.12,-32 -17.28,-31.29 -23.36,-30.16 -29.3,-28.61 -35.02,-26.66 -40.44,-24.31 -45.5,-21.59 -50.12,-18.5 -54.24,-15.09 -57.8,-11.37 -60.73,-7.4 -62.99,-3.2 -64.53,1.18 -65.32,5.7 -65.33,10.29 -64.54,14.92 -62.93,19.53 -60.51,24.06 -57.29,28.46 -53.29,32.67 -48.53,36.65 -43.04,40.34 -36.89,43.68 -30.12,46.65 -22.79,49.18 -14.99,51.25 -6.79,52.81 1.73,53.85 10.47,54.33 19.34,54.24 28.23,53.57 37.05,52.31 45.7,50.47 54.07,48.06 62.05,45.08 69.56,41.57 76.49,37.55 82.76,33.07 88.27,28.15 92.96,22.85 96.75,17.23 99.59,11.34 101.41,5.24 102.2,-1.01 101.9,-7.32 100.52,-13.64 98.04,-19.89 94.48,-26 89.85,-31.9 84.18,-37.51 77.54,-42.77 69.96,-47.62 61.53,-51.98 52.33,-55.81 42.43,-59.04 31.96,-61.65 21,-63.57 9.69,-64.79 -1.86,-65.27 -13.53,-65 -25.17,-63.97 -36.67,-62.18 -47.89,-59.64 -58.69,-56.36 -68.95,-52.37 -78.55,-47.71 -87.37,-42.41 -95.29,-36.52 -102.22,-30.11 -108.06,-23.23 -112.73,-15.97 -116.16,-8.38 -118.29,-0.56 -119.08,7.41 -118.51,15.45 -116.55,23.46 -113.21,31.36 -108.52,39.05 -102.49,46.45 -95.19,53.47 -86.67,60.02 -77.02,66.03 -66.33,71.42 -54.69,76.12 -42.24,80.07 -29.09,83.21 -15.39,85.51 -1.29,86.92 13.08,87.42 27.54,86.98 41.94,85.6 56.12,83.29 69.91,80.06 83.16,75.93 95.71,70.93" },
];
const parse = text => text.split(" ").map(p => { const [x, y] = p.split(",").map(Number); return { x, y }; });
const run = (raw, lexicon) => {
  const free = api.scaleFreeInk(raw, 1000, 561);
  const opts = { coarse: true, hc: 0, language: "ja" };
  if (lexicon) opts.lexicon = lexicon;
  const r = api.interpretStroke(free.points, free.w, free.h, opts);
  return { r, kana: r.event.displayWordOverride ?? api.namingKanaOf(r.event.moras) };
};
for (const s of NG_STROKES) {
  const pts = parse(s.points);
  const a = run(pts), b = run(pts);
  check(`${s.name} (${s.route}・${s.ng}): 1 回言い直され、経路は ${s.route}`, a.r.ngRerolls === 1 && a.r.route === s.route, `${a.r.ngRerolls}/${a.r.route}`);
  check(`${s.name}: きれいな語 ${s.word} に着地し、固有語の印は付かない`, a.kana === s.word && api.namingIsClean(a.kana) && a.r.ngFixedWord === false, a.kana);
  check(`${s.name}: 同じ入力は同じ語`, a.kana === b.kana && JSON.stringify(a.r.event.moras) === JSON.stringify(b.r.event.moras));
}
const W = 1000, H = 561;
const circle = Array.from({ length: 161 }, (_, i) => { const a = 2 * Math.PI * i / 160; return { x: 500 + 150 * Math.cos(a), y: 280 + 150 * Math.sin(a) }; });
{
  const r = run(circle);
  check("きれいな固有語 (円) は言い直さない・印も付かない", r.r.ngRerolls === 0 && r.r.ngFixedWord === false && r.r.route === "vocabulary");
  const e = run(circle, { v: 1, lex: "empty", words: {}, family: null });
  check("固定語の無い辞書でも、生成の語は必ずきれいに着地する", api.namingIsClean(e.kana) && e.r.route !== "vocabulary", e.kana);
}

console.log("── (e) 固有語は変えない (NG なら印だけ) ──");
{
  const ngWord = { romaji: "geri", display: null };
  const lex = { ...api.LEXICON_KOU, lex: "test-ng-circle", words: { ...api.LEXICON_KOU.words, circle: [ngWord, ngWord, ngWord] } };
  const r = run(circle, lex);
  check("円の固有語が NG (げり) でも言い直さない", r.r.route === "vocabulary" && api.romajiOf(r.r.event) === "geri" && r.r.ngRerolls === 0, `${r.r.route}/${r.kana}`);
  check("NG の固有語には ngFixedWord の印が付く", r.r.ngFixedWord === true && !api.namingIsClean(r.kana), r.kana);
  const wave = Array.from({ length: 241 }, (_, i) => { const t = i / 240; return { x: 200 + 600 * t, y: 280 - 90 * Math.sin(t * 3 * Math.PI) }; });
  const fam = { ...api.LEXICON_KOU, lex: "test-ng-wave", family: { ...api.LEXICON_KOU.family, waveCrest: { romaji: "ge", display: "げ" }, waveTrough: { romaji: "ri", display: "り" } } };
  const w = run(wave, fam);
  check("族の規則の固定語 (波) が NG (げりげ) でも言い直さない・印が付く", w.r.route === "family" && w.kana === "げりげ" && w.r.ngRerolls === 0 && w.r.ngFixedWord === true, `${w.r.route}/${w.kana}`);
}

console.log("── (f) 立法の語が NG に当たらない (当たったら止めて報告) ──");
{
  const found = [];
  const walk = (node, p) => {
    if (node && typeof node === "object" && !Array.isArray(node) && typeof node.romaji === "string") found.push({ p, romaji: node.romaji, display: node.display ?? null });
    else if (Array.isArray(node)) node.forEach((x, i) => walk(x, `${p}[${i}]`));
    else if (node && typeof node === "object") for (const k of Object.keys(node).sort()) walk(node[k], `${p}.${k}`);
  };
  const ax = { size: 0, sharp: 0, tex: 0, bright: 0, round: 0, open: 0 };
  const spelled = romaji => api.namingKanaOf(api.vocabEvent(romaji, ax).moras);
  const assertClean = (list, source) => {
    const hits = [];
    for (const w of list) {
      const shown = w.display ?? spelled(w.romaji);
      if (!api.namingIsClean(shown)) hits.push(`${w.p} = ${shown} (${w.romaji})`);
      if (w.display != null && !api.namingIsClean(spelled(w.romaji))) hits.push(`${w.p} 綴りの かな = ${spelled(w.romaji)} (${w.romaji})`);
    }
    check(`${source}: ${list.length} 語すべて NG に当たらない`, hits.length === 0 && list.length > 0, hits.join(" / "));
  };
  walk(api.LEXICON_KOU.words, "words"); walk(api.LEXICON_KOU.family, "family");
  check("LEXICON_KOU の語を拾えた (60 語以上)", found.length > 60, String(found.length));
  assertClean(found.splice(0), "LEXICON_KOU");
  const fam = api.LEXICON_KOU.family;
  const crest = fam.waveCrest.display, trough = fam.waveTrough.display, row = fam.loopRow.display;
  const bad = [];
  for (let len = 1; len <= 8; len++) for (let bits = 0; bits < (1 << len); bits++) {
    let w = ""; for (let i = 0; i < len; i++) w += (bits >> i) & 1 ? crest : trough;
    if (!api.namingIsClean(w)) bad.push(w);
  }
  for (let n = 1; n <= 16; n++) if (!api.namingIsClean(row.repeat(n))) bad.push(row.repeat(n));
  check("波の語 (山 / 谷 の全並び 510 通り)・並ぶ輪の語 (1〜16 個) が NG に当たらない", bad.length === 0, bad.join(","));
  const dataV1 = readCore("Data/lexicon_data_v1.json");
  if (dataV1) {
    const j = JSON.parse(dataV1);
    walk(j.words ?? {}, "words"); walk(j.family ?? {}, "family");
    assertClean(found.splice(0), "lexicon_data_v1.json");
  }
  const spelledList = [];
  for (const f of api.KATACHI_DICTIONARY.families) for (const [key, block] of [["words", f.words], ["proposal", f.proposal]]) {
    if (!block) continue;
    if (block.skeleton) spelledList.push({ p: `${f.id}.${key}.skeleton`, romaji: block.skeleton, display: null });
    (block.sizes ?? []).forEach((s, i) => spelledList.push({ p: `${f.id}.${key}.sizes[${i}]`, romaji: s, display: null }));
  }
  assertClean(spelledList, "かたち辞書の語と提案");
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
  // 合成の曲線 (Onomatoi Atlas probes/collide_all/find_strokes.mjs・種 20261024 の 3 次ベジェ)・bez1914 は find_reroll.mjs bez = 2026-10-30 かたち辞書の族の語の後も生成の語のまま言い直す線 (旧 bez22167 は族の語 もー になった)。変更前の語は どちらも りりー。Core StrokeAvoidWordsTests と同じ点列と語
  const AVOID_STROKES = [
  { name: "bez1914", word: "いぺり", points: "782.98,370.29 785.72,367.26 788.4,364.32 791.03,361.48 793.6,358.73 796.11,356.07 798.57,353.5 800.97,351.01 803.32,348.62 805.61,346.31 807.85,344.08 810.03,341.94 812.16,339.88 814.24,337.9 816.26,335.99 818.24,334.17 820.16,332.42 822.03,330.75 823.85,329.15 825.61,327.63 827.33,326.17 829,324.79 830.62,323.47 832.19,322.23 833.71,321.05 835.18,319.93 836.61,318.88 837.99,317.89 839.32,316.97 840.61,316.1 841.85,315.29 843.04,314.54 844.19,313.85 845.29,313.21 846.35,312.63 847.37,312.09 848.34,311.61 849.27,311.18 850.15,310.8 851,310.47 851.8,310.18 852.56,309.93 853.28,309.73 853.96,309.58 854.6,309.46 855.2,309.39 855.76,309.35 856.28,309.35 856.76,309.38 857.2,309.46 857.61,309.56 857.98,309.7 858.31,309.87 858.61,310.06 858.86,310.29 859.09,310.54 859.28,310.82 859.43,311.13 859.55,311.45 859.63,311.8 859.68,312.18 859.7,312.57 859.69,312.98 859.64,313.4 859.56,313.84 859.45,314.3 859.31,314.77 859.13,315.25 858.93,315.74 858.7,316.25 858.44,316.76 858.14,317.27 857.82,317.8 857.48,318.32 857.1,318.86 856.7,319.39 856.26,319.92 855.81,320.45 855.32,320.99 854.81,321.51 854.28,322.04 853.72,322.55 853.14,323.06 852.53,323.57 851.89,324.06 851.24,324.54 850.56,325.01 849.86,325.47 849.14,325.91 848.39,326.34 847.63,326.75 846.84,327.14 846.03,327.51 845.2,327.86 844.36,328.19" },
  { name: "bez32970", word: "せしり", points: "740.98,358 744.05,364.52 746.95,370.42 749.69,375.74 752.27,380.49 754.69,384.68 756.95,388.34 759.03,391.48 760.96,394.12 762.71,396.28 764.3,397.99 765.71,399.25 766.96,400.09 768.04,400.52 768.94,400.57 769.67,400.24 770.23,399.57 770.61,398.57 770.82,397.25 770.85,395.64 770.7,393.76 770.37,391.62 769.86,389.24 769.17,386.63 768.29,383.83 767.24,380.84 766,377.69 764.57,374.4 762.96,370.97 761.16,367.44 759.17,363.81 756.99,360.12 754.63,356.36 752.07,352.58 749.32,348.78 746.37,344.98 743.23,341.2 739.9,337.45 736.37,333.77 732.64,330.16 728.71,326.65" },
  ];
  for (const s of AVOID_STROKES) {
    const pts = parse(s.points);
    const a = run(pts), b = run(pts);
    check(`${s.name}: りりー を 1 回言い直して ${s.word} (生成の語・印なし)`, a.r.ngRerolls === 1 && a.kana === s.word && a.r.ngFixedWord === false && a.r.route === "generated",
      `${a.r.ngRerolls}/${a.kana}/${a.r.route}`);
    check(`${s.name}: 同じ入力は同じ語`, a.kana === b.kana && JSON.stringify(a.r.event.moras) === JSON.stringify(b.r.event.moras));
  }
}

console.log(`
${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
