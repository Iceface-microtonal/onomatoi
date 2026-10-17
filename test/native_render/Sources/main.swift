// iOS 版 Onomatoi と同じ手順で語を鳴らし、f32 の波形を書き出す (Web 版との比較用)。
//   native_render <cases.json> <出力フォルダ>
// cases.json = {"cases":[{"id":"kai_250","tokens":"ka i","moraMs":250}, ...]}
// 手順 (アプリの playEvent → FormantRenderer.play と同じ):
//   parseRomaji → bpmQuantized(targetMoraMs) → 2モーラ目以降 -3dB (アプリ既定・主音と同じ diph run は除く)
//   → FormantSynth.render (base 音源のみ・音程変化なし・フェードイン 5ms・iPhone 経路 =
//     録音が尽きても合成器へ落とさず録音で続ける AudioCompatibilityMode.isolatedPhoneRecovery)
// 書き出す長さ = playbackDurationMs (語末の単独母音の余韻込み) + 60ms。
// Web 版は平坦な音程なので、声域による音程変化 (axisModulationPlan) は掛けない。
import Foundation
@testable import OnomatoiCore

struct Case: Codable { let id: String; let tokens: String; let moraMs: Double }
struct Cases: Codable { let cases: [Case] }

let args = CommandLine.arguments
guard args.count == 3 else { print("usage: native_render <cases.json> <outdir>"); exit(2) }
let cases = try JSONDecoder().decode(Cases.self, from: Data(contentsOf: URL(fileURLWithPath: args[1]))).cases
let outDir = URL(fileURLWithPath: args[2])
try FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)

let sampleRate = 48000.0
let resources = "/Volumes/Expansion/MacAPP/Onomatoi/Resources"
// 2026-10-17: Onomatoi 本体 (Shared/UI/ContentView.swift の FormantRenderer 初期化) と同じ試聴設定
//   CV の頭を保つ (Base・M300)・語頭の CV を 1ms で開く・Base / BPM120 は伸ばす CV を CV 録音だけで・
//   Base の myu は 200ms 保ってから長母音へ・Base の mu は作者の Cubase 配置
guard let bundle = Bundle(path: resources), let bank = ConsonantSampleBank.loadFromBundle(
        bundle, preservedCVHeadPitchCents: [0, -300],
        baseMinimumHeldVowelJoinStartMs: [.init(onset: .my, nucleus: .u): 200],
        baseHeldVowelJoinLayouts: [.init(onset: .m, nucleus: .u): .init(
            startMs: 85, vowelRiseMs: 270, cvHoldMs: 109, cvZeroMs: 1000, terminalReleaseMs: 410)]) else {
    FileHandle.standardError.write("FATAL: bank load failed\n".data(using: .utf8)!); exit(1)
}

var manifest: [[String: Any]] = []
for c in cases {
    let (moras, failed) = Romaji.parseRomaji(c.tokens)
    if !failed.isEmpty || moras.isEmpty {
        manifest.append(["id": c.id, "tokens": c.tokens, "moraMs": c.moraMs, "error": "parse: \(failed)"]); continue
    }
    let base = PhonosymbolicEvent(axes: .zero, moras: moras, baseF0: 200, isReduplicated: false)
        .bpmQuantized(targetMoraMs: c.moraMs)
    let event = FormantRenderer.eventApplyingFollowingMoraAttenuation(
        base, decibels: -0.5, emphasizedAudibleMoraIndex: 0, sampleBank: bank)   // Onomatoi 本体と同じ (2026-10-05 試し: -3 → 0 → -0.5)
    var synth = FormantSynth()
    synth.sampleBank = bank
    synth.eventFadeInMs = 5.0
    synth.initialRecordedCVFadeInMs = 1      // 本体の dry 経路と同じ (TimePitch 経路では無効)
    synth.baseCVOnlyLongVowelMoraMs = 250    // Base / BPM120 の試行 (Web は BPM120 固定)
    synth.continuesRecordedSamplesAtEOF = true   // Onomatoi iPhone (isolatedPhoneRecovery)
    synth.reset()
    let frames = Int((synth.playbackDurationMs(event: event) + 60) / 1000.0 * sampleRate)
    var out = [Float](repeating: 0, count: frames)
    out.withUnsafeMutableBufferPointer { buf in
        _ = synth.render(event: event, samplesElapsed: 0, frameCount: frames,
                         output: buf.baseAddress!, sampleRate: sampleRate)
    }
    let file = outDir.appendingPathComponent("\(c.id).f32")
    try out.withUnsafeBufferPointer { try Data(buffer: $0).write(to: file) }
    manifest.append(["id": c.id, "tokens": c.tokens, "moraMs": c.moraMs, "frames": frames,
                     "moras": event.moras.count, "kana": event.kanaMarks.joined()])
}
try JSONSerialization.data(withJSONObject: ["sampleRate": sampleRate, "cases": manifest], options: [.prettyPrinted])
    .write(to: outDir.appendingPathComponent("manifest.json"))
print("書き出し \(manifest.filter { $0["error"] == nil }.count) / \(cases.count) → \(outDir.path)")
