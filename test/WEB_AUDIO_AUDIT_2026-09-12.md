# Web Base audio audit — 2026-09-12

Reported symptom: `nuoon` sounded like `nu … n` on the public Web page.
The published v22 HTML matched the local deployed commit (`0489675`).

## Cause and correction

The old `nvPrepareCvDiph` treated the release of `diph_uo.wav` as its vowel
transition, then cut another 40 ms forward. The 498.9 ms source became a
47.2 ms playback buffer. `nvSustainWrap` intentionally does not loop buffers
of 120 ms or less, so reads in the following `o` mora returned no sample.
The first `o` central window was digitally silent in an offline reproduction.
The second `o` was also missing except for the upcoming nasal overlap.

Other new sources were also truncated: ea 49.8 ms, eo 48.6 ms, ua 79.5 ms,
oa 148.1 ms. These figures describe the old prepared buffers, not WAV lengths.

v23 uses the current Core short-diph source-start rules and constant gain
(head 120 ms toward -12 dBFS, lift limited to +6 dB and peak 0.95).
All eleven pairs retain their short sources rather than using old long/fin
recordings. Base overlap timings are shared across pre-roll and subsequent
moras; both sides use the same source clock and joining gain. Natural releases
are preserved for ei/au/ea/eo/oa/ua. The recorded nye preload omission is fixed.

## Verification

`node test/native_voice.mjs` now decodes shipped assets with ffmpeg and runs
the production `buildNativeVoiceBank` and renderer, in addition to synthetic
tests. This requires ffmpeg on PATH. It checks:

- all eleven connected buffers exceed the 120 ms non-looping threshold;
- 560 real CV/diph words (CV+V and CV+VV+n) at 250 ms/mora, with finite output
  and no vowel central 120 ms window below -60 dBFS;
- nuoon/kuoon/ruoon/keaan/keoon/koaan/kuaan at 125, 250, and 454.545 ms/mora;
- nye is actually loaded, not merely present on disk;
- full HTML JavaScript syntax and existing vocabulary/shape regression suites.

The former synthetic-only tests let the defect pass because their recordings
had a different envelope. Actual asset decoding and production bank construction
are now part of the regression test.

## Scope and remaining differences

This is an offline Web-renderer check, not iPhone Safari listening acceptance.
ffmpeg MP3 decoding does not reproduce every browser decoder detail or the
browser's CV leading-silence preprocessing. Small clicks, perceived doubling,
and vowel identity cannot be accepted solely from the silence-window metric.

Web still differs from Core outside this correction: continuation-N recordings
are the Web's baked files, and chains containing multiple different diph pairs
do not yet include all of Core's ownership/transition safeguards. Naked V+V
uses the older fixed event-time reader. Those paths were identified in source
review but are not claimed repaired or covered by the 560 connected-word set.
P/M, Warabe and native app post-effects remain outside this Base Web renderer.
