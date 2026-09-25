// web_parity.mjs — Web 版の発声が iOS 版 (Onomatoi) と同じかを、波形で比べる。
//
//   1) iOS 版: cd test/native_render && swift build -c release -Xswiftc -enable-testing
//              ./test/native_render/.build/release/native_render test/parity_cases.json test/parity_out/native
//   2) Web 版: node test/web_parity.mjs            (ffmpeg が要る。配布音声 ConsonantsOnomatoi/ を本番のバンク構築で読む)
//
// 比べるもの (10ms ごと・どちらかが -45dBFS 以上の区間):
//   meanDb / p95Db = 音量の差 (dB) の平均と 95% 点
//   endMs          = 鳴り終わり (最後に -45dBFS を超える時刻) の差
//   corr           = 音量の形 (線形 RMS) の相関
//   holeMs         = 片方が -60dBFS 未満で、もう片方が -30dBFS 以上の区間の長さ (脱落・余計な音)
// 合格の目安 (PASS): p95Db ≤ 3 かつ |endMs| ≤ 20 かつ holeMs ≤ 20
//
// 注意: Web は mp3 (配布物) を ffmpeg で読むので、ブラウザのデコーダとは細部が違う。
//       また iOS 側は FormantSynth の出力 (アプリの後段エフェクトは含まない) との比較。
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML_PATH = path.resolve(__dirname, "../iceface_onomatoi.html");
const NATIVE_DIR = path.resolve(__dirname, "parity_out/native");
const ASSET_DIR = path.resolve(__dirname, "../ConsonantsOnomatoi");
const SR = 48000;

// ─── エンジン抽出 (native_voice.mjs と同じ方式: 純粋な宣言だけを vm で評価) ───
const IMPURE = /\b(document|localStorage|sessionStorage|window|navigator|AudioContext|audioCtx|fetch\(|canvas|cctx|location|alert\(|requestAnimationFrame|history)\b/;
function extractEngine(html) {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const src = scripts.sort((a, b) => b.length - a.length)[0];
  const blocks = [], lines = src.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^(function\s+\w|const\s+\w|let\s+\w)/.test(line)) {
      const start = i, isFunc = line.startsWith("function");
      let depth = 0, inS = null, inBC = false, tplBrace = [], end = -1;
      outer: for (let j = i; j < lines.length; j++) {
        const L = lines[j];
        let inLC = false;
        for (let k = 0; k < L.length; k++) {
          const c = L[k], n = L[k + 1];
          if (inLC) break;
          if (inBC) { if (c === "*" && n === "/") { inBC = false; k++; } continue; }
          if (inS) {
            if (c === "\\") { k++; continue; }
            if (inS === "`" && c === "$" && n === "{") { tplBrace.push(depth); depth++; inS = null; k++; continue; }
            if (c === inS) inS = null;
            continue;
          }
          if (c === "/" && n === "/") { inLC = true; break; }
          if (c === "/" && n === "*") { inBC = true; k++; continue; }
          if (c === '"' || c === "'" || c === "`") { inS = c; continue; }
          if (c === "{" || c === "(" || c === "[") depth++;
          if (c === "}" || c === ")" || c === "]") {
            depth--;
            if (tplBrace.length && depth === tplBrace[tplBrace.length - 1]) { tplBrace.pop(); inS = "`"; }
            continue;
          }
          if (!isFunc && c === ";" && depth === 0) { end = j; break outer; }
        }
        if (isFunc && depth === 0 && j > i && /\}/.test(lines.slice(i, j + 1).join("\n"))) { end = j; break; }
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
const EXPORTS = ["parseMora", "sampleKeys", "sampleUrlCandidates", "buildNativeVoiceBank", "sampleBank", "nvRenderEvent"];
const ctx = vm.createContext({ console });
vm.runInNewContext(extractEngine(fs.readFileSync(HTML_PATH, "utf8")) +
  `\n;globalThis.__api = { ${EXPORTS.join(", ")} };`, ctx, { filename: "engine(extracted)" });
const api = ctx.__api;

// ─── 配布音声を本番のバンク構築で読む ───
const decode = file => {
  const b = execFileSync("ffmpeg", ["-v", "error", "-i", file, "-f", "f32le", "-ar", String(SR), "-ac", "1", "pipe:1"],
                         { maxBuffer: 1 << 28 });
  return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
};
for (const key of api.sampleKeys()) {
  const name = api.sampleUrlCandidates(key).find(n => fs.existsSync(path.join(ASSET_DIR, n)));
  if (!name) continue;
  const data = decode(path.join(ASSET_DIR, name));
  api.sampleBank.set(key, { getChannelData: () => data, length: data.length, sampleRate: SR });
}
const bank = api.buildNativeVoiceBank(SR);

// ─── トークン列 → Web のモーラ (playRomaji と同じ + 語末の q は語末促音) ───
function webMoras(tokens) {
  const moras = [];
  let pendingQ = false;
  for (const tk of tokens.trim().toLowerCase().split(/\s+/)) {
    if (tk === "q") { pendingQ = true; continue; }
    if (tk === "n" || tk === "nn") {
      moras.push({ onset: null, nucleus: "a", durationMs: 160, gapMs: pendingQ ? 70 : 0, amplitude: 1, isN: true, isQ: false });
      pendingQ = false; continue;
    }
    const m = api.parseMora(tk, pendingQ);
    if (!m) return null;
    moras.push(m); pendingQ = false;
  }
  if (pendingQ && moras.length)
    moras.push({ onset: null, nucleus: moras[moras.length - 1].nucleus, durationMs: 60, gapMs: 0, amplitude: 0.18, isQ: true, isN: false });
  return moras;
}

// ─── 比較 ───
const frameDb = (a, i, w) => {
  let s = 0; for (let k = i; k < i + w && k < a.length; k++) s += a[k] * a[k];
  return 10 * Math.log10(Math.max(1e-12, s / w));
};
function compare(nat, web) {
  const w = SR / 100, n = Math.max(nat.length, web.length);
  let sum = 0, cnt = 0, hole = 0, lastN = 0, lastW = 0;
  const diffs = [], ln = [], lw = [];
  for (let i = 0; i < n; i += w) {
    const dn = i < nat.length ? frameDb(nat, i, w) : -120, dw = i < web.length ? frameDb(web, i, w) : -120;
    if (dn > -45) lastN = i; if (dw > -45) lastW = i;
    if (Math.max(dn, dw) > -45) { const d = Math.abs(dn - dw); diffs.push(d); sum += d; cnt++; ln.push(10 ** (dn / 20)); lw.push(10 ** (dw / 20)); }
    if ((dn < -60 && dw > -30) || (dw < -60 && dn > -30)) hole += 10;
  }
  diffs.sort((a, b) => a - b);
  const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
  const mn = mean(ln), mw = mean(lw);
  let cov = 0, vn = 0, vw = 0;
  for (let k = 0; k < ln.length; k++) { cov += (ln[k] - mn) * (lw[k] - mw); vn += (ln[k] - mn) ** 2; vw += (lw[k] - mw) ** 2; }
  return { meanDb: cnt ? sum / cnt : 0, p95Db: diffs.length ? diffs[Math.floor(diffs.length * 0.95)] : 0,
           endMs: (lastW - lastN) / SR * 1000, corr: vn && vw ? cov / Math.sqrt(vn * vw) : 1, holeMs: hole };
}

const manifest = JSON.parse(fs.readFileSync(path.join(NATIVE_DIR, "manifest.json"), "utf8"));
const rows = [];
for (const c of manifest.cases) {
  if (c.error) { rows.push({ id: c.id, skip: `iOS 側で読めない (${c.error})` }); continue; }
  const buf = fs.readFileSync(path.join(NATIVE_DIR, `${c.id}.f32`));
  const nat = new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const moras = webMoras(c.tokens);
  if (!moras) { rows.push({ id: c.id, skip: "Web 側で読めない" }); continue; }
  const res = api.nvRenderEvent(moras, bank, SR, c.moraMs);
  const webData = res ? res.data : new Float32Array(0);
  fs.mkdirSync(path.resolve(__dirname, "parity_out/web"), { recursive: true });
  fs.writeFileSync(path.resolve(__dirname, `parity_out/web/${c.id}.f32`), Buffer.from(webData.buffer, webData.byteOffset, webData.byteLength));
  const m = compare(nat, webData);
  m.pass = m.p95Db <= 3 && Math.abs(m.endMs) <= 20 && m.holeMs <= 20;
  rows.push({ id: c.id, ...m });
}
const scored = rows.filter(r => !r.skip);
const byCat = {};
for (const r of scored) { const cat = r.id.split("__")[0]; (byCat[cat] ||= []).push(r); }
console.log(`比較 ${scored.length} 件 / 合格 ${scored.filter(r => r.pass).length} / 対象外 ${rows.length - scored.length}`);
for (const [cat, rs] of Object.entries(byCat)) {
  const avg = k => (rs.reduce((s, r) => s + Math.abs(r[k]), 0) / rs.length).toFixed(1);
  console.log(`  ${cat.padEnd(7)} 合格 ${String(rs.filter(r => r.pass).length).padStart(2)}/${rs.length}  平均|差| ${avg("meanDb")}dB  p95 ${avg("p95Db")}dB  終わり ${avg("endMs")}ms  脱落 ${avg("holeMs")}ms`);
}
const worst = scored.filter(r => !r.pass).sort((a, b) => b.p95Db + b.holeMs / 10 - (a.p95Db + a.holeMs / 10)).slice(0, 15);
if (worst.length) console.log("差が大きい順:");
for (const r of worst) console.log(`  ${r.id.padEnd(34)} p95 ${r.p95Db.toFixed(1)}dB  平均 ${r.meanDb.toFixed(1)}dB  終わり ${r.endMs.toFixed(0)}ms  脱落 ${r.holeMs}ms  相関 ${r.corr.toFixed(2)}`);
for (const r of rows.filter(r => r.skip)) console.log(`  対象外 ${r.id}: ${r.skip}`);
fs.writeFileSync(path.resolve(__dirname, "parity_out/report.json"), JSON.stringify(rows, null, 1));
