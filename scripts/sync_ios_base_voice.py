#!/usr/bin/env python3
"""Web 版の音声 (ConsonantsOnomatoi/) を、iOS 版 Onomatoi の base 音源から作り直す。

方針 (2026-09-25 Iceface さん): **Web 版の音声は iOS 版の base だけ**。iOS 側の音源は一切書き換えない。

    python3 scripts/sync_ios_base_voice.py            # 作り直す
    python3 scripts/sync_ios_base_voice.py --check    # 差分だけ表示 (書かない)
    python3 scripts/sync_ios_base_voice.py --only v_uuuu  # 指定した base 音源だけ同期

- 元   = /Volumes/Expansion/MacAPP/Onomatoi/Resources/Consonants/*.wav のうち base の録音
         (予備 *.orig1.wav / *_origi.wav・Finder の複製「diph_ao 2.wav」など空白入りの名前・
          高さ違い *_m300.wav / *_p200.wav / *_m300b.wav などは使わない)
- wav  = diph_* と伸ばしの録音 v_aaaa 等 (録音の途中から読む・つなぐ音)
- mp3  = それ以外。48kHz・モノラル・80kbps
- base に無いファイルは Web 側から消す。どの録音から作ったかは SOURCE.json (sha256) に残す
- SOURCE.json には元 wav の長さ (frames) と、iOS のロード時と同じ判定で求めた頭の無音トリム位置
  (trimStart) も書く。mp3 は立ち上がり直前に符号化の雑音が出て、Web でその場判定すると数ms早く切れるため
  (ConsonantSampleBank.loadWavFloats → trimLeadingSilence: 閾値 0.01・走査は 80% まで・
   CV/diph/撥音は頭の無音が 3500 サンプル超なら閉鎖期として残す・母音だけの録音は常に切る)
"""
import array
import argparse
import hashlib
import json
import re
import subprocess
import sys
import wave
from pathlib import Path

SRC = Path("/Volumes/Expansion/MacAPP/Onomatoi/Resources/Consonants")
DST = Path(__file__).resolve().parent.parent / "ConsonantsOnomatoi"
NOT_BASE = re.compile(r"(\.orig\d*|_orig\w*|_[mp]\d{3}[a-z]?)$|\s")
KEEP_WAV = re.compile(r"^(diph_.+|v_([aiueo])\2\2\2)$")
VOWEL_ONLY = re.compile(r"^v_([aiueo])(\1\1\1)?$")


def trim_start(path, key):
    """iOS の頭の無音トリム位置 (サンプル)。16bit を float (/32768) にした |x| > 0.01f は |s| >= 328。"""
    with wave.open(str(path)) as w:
        assert w.getsampwidth() == 2 and w.getnchannels() == 1, path
        samples = array.array("h", w.readframes(w.getnframes()))
    onset = next((i for i in range(len(samples) * 4 // 5) if abs(samples[i]) >= 328), -1)
    if onset <= 0 or (not VOWEL_ONLY.match(key) and onset > 3500):
        return len(samples), 0
    return len(samples), onset


def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="差分だけ表示する")
    parser.add_argument("--only", metavar="STEM", help="指定した base 音源だけ同期する (例: v_uuuu)")
    args = parser.parse_args()
    check = args.check
    base = sorted(p for p in SRC.glob("*.wav") if not NOT_BASE.search(p.stem))
    if args.only:
        base = [p for p in base if p.stem == args.only]
        if not base:
            parser.error(f"base 音源が見つかりません: {args.only}")
    old_manifest = {}
    if (DST / "SOURCE.json").exists():
        old_manifest = json.loads((DST / "SOURCE.json").read_text(encoding="utf-8")).get("files", {})
    want, manifest, made, kept = set(), dict(old_manifest) if args.only else {}, [], 0
    for src in base:
        key = src.stem
        ext = "wav" if KEEP_WAV.match(key) else "mp3"
        out = DST / f"{key}.{ext}"
        encoding = "pcm_s16le" if ext == "wav" else "mp3_80k"
        want.add(out.name)
        digest = sha(src)
        frames, start = trim_start(src, key)
        manifest[out.name] = {"source": f"Onomatoi/Resources/Consonants/{src.name}", "sha256": digest,
                              "frames": frames, "trimStart": start, "encoding": encoding}
        previous = old_manifest.get(out.name, {})
        if (previous.get("sha256") == digest and previous.get("encoding") == encoding
                and out.exists() and (not previous.get("outputSha256")
                                      or previous["outputSha256"] == sha(out))):
            manifest[out.name]["outputSha256"] = sha(out)
            if previous.get("conversionInputSha256"):
                manifest[out.name]["conversionInputSha256"] = previous["conversionInputSha256"]
            kept += 1
            continue                                   # 元が変わっていなければ作り直さない (repo を膨らませない)
        made.append(out.name)
        if check:
            continue
        codec = ["-c:a", "pcm_s16le"] if ext == "wav" else ["-c:a", "libmp3lame", "-b:a", "80k"]
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-ac", "1", "-ar", "48000",
                        *codec, str(out)], check=True)
        manifest[out.name]["outputSha256"] = sha(out)
    stale = [] if args.only else sorted(p.name for p in DST.iterdir()
                                        if p.is_file() and p.name != "SOURCE.json" and p.name not in want)
    print(f"base {len(base)} 本 / 作り直し {len(made)} / そのまま {kept} / 消す {len(stale)}")
    if stale:
        print("  消す: " + " ".join(stale))
    if check:
        return 0
    for name in stale:
        (DST / name).unlink()
    (DST / "SOURCE.json").write_text(json.dumps({
        "about": "Web 版の音声は iOS 版 Onomatoi の base 音源だけから作る (scripts/sync_ios_base_voice.py)。手で置き換えない。",
        "files": manifest}, ensure_ascii=False, indent=1), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
