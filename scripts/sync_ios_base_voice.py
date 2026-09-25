#!/usr/bin/env python3
"""Web 版の音声 (ConsonantsOnomatoi/) を、iOS 版 Onomatoi の base 音源から作り直す。

方針 (2026-09-25 Iceface さん): **Web 版の音声は iOS 版の base だけ**。iOS 側の音源は一切書き換えない。

    python3 scripts/sync_ios_base_voice.py            # 作り直す
    python3 scripts/sync_ios_base_voice.py --check    # 差分だけ表示 (書かない)

- 元   = /Volumes/Expansion/MacAPP/Onomatoi/Resources/Consonants/*.wav のうち base の録音
         (予備 *.orig1.wav と高さ違い *_m300.wav / *_p200.wav / *_m300b.wav などは使わない)
- wav  = diph_* と伸ばしの録音 v_aaaa 等 (録音の途中から読む・つなぐ音。mp3 の頭の余白とフレーム区切りを避ける)
- mp3  = それ以外。48kHz・モノラル・96kbps (旧版は 22.05kHz・48kbps だった)
- base に無いファイルは Web 側から消す。どの録音から作ったかは SOURCE.json (sha256) に残す
"""
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

SRC = Path("/Volumes/Expansion/MacAPP/Onomatoi/Resources/Consonants")
DST = Path(__file__).resolve().parent.parent / "ConsonantsOnomatoi"
NOT_BASE = re.compile(r"(\.orig\d*|_[mp]\d{3}[a-z]?)$")
KEEP_WAV = re.compile(r"^(diph_.+|v_([aiueo])\2\2\2)$")


def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


def main():
    check = "--check" in sys.argv
    base = sorted(p for p in SRC.glob("*.wav") if not NOT_BASE.search(p.stem))
    old_manifest = {}
    if (DST / "SOURCE.json").exists():
        old_manifest = json.loads((DST / "SOURCE.json").read_text(encoding="utf-8")).get("files", {})
    want, manifest, made, kept = set(), {}, [], 0
    for src in base:
        key = src.stem
        ext = "wav" if KEEP_WAV.match(key) else "mp3"
        out = DST / f"{key}.{ext}"
        want.add(out.name)
        digest = sha(src)
        manifest[out.name] = {"source": f"Onomatoi/Resources/Consonants/{src.name}", "sha256": digest}
        if old_manifest.get(out.name, {}).get("sha256") == digest and out.exists():
            kept += 1
            continue                                   # 元が変わっていなければ作り直さない (repo を膨らませない)
        made.append(out.name)
        if check:
            continue
        if ext == "wav":
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-ac", "1", "-ar", "48000",
                            "-c:a", "pcm_s16le", str(out)], check=True)
        else:
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-ac", "1", "-ar", "48000",
                            "-c:a", "libmp3lame", "-b:a", "96k", str(out)], check=True)
    stale = sorted(p.name for p in DST.iterdir() if p.is_file() and p.name != "SOURCE.json" and p.name not in want)
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
