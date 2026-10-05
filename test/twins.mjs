// Verify twin geometry against the actual public engine, not a word mock.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

// Reuse the extraction routine already used by native/Web stroke parity.
const harness = fs.readFileSync(new URL('./stroke_parity.mjs', import.meta.url), 'utf8');
const extractor = harness.match(/function extractEngine\(html\) \{[\s\S]*?\n\}/)?.[0];
const impurity = harness.match(/^const IMPURE = .+;$/m)?.[0];
assert.ok(extractor && impurity, 'stroke parity extractor available');
const extract = vm.runInNewContext(`${impurity}\n${extractor}\nextractEngine`);
const ctx = vm.createContext({ console });
vm.runInContext(extract(fs.readFileSync(new URL('../iceface_onomatoi.html', import.meta.url), 'utf8')) +
  '\n' + fs.readFileSync(new URL('../twins-geometry.js', import.meta.url), 'utf8') +
  '\nthis.api = {TwinsGeometry, interpretStroke, distanceFiltered, densified, romajiOf};', ctx);
const {TwinsGeometry: g, interpretStroke, distanceFiltered, densified, romajiOf} = ctx.api;
const size = 600;
const circle = Array.from({length:97}, (_, i) => ({x:300 + 115 * Math.cos(i / 96 * 2 * Math.PI), y:300 + 115 * Math.sin(i / 96 * 2 * Math.PI)}));
const zigzag = [{x:80,y:400},{x:180,y:180},{x:300,y:400},{x:420,y:180},{x:520,y:400}];
const edge = [{x:4,y:4},{x:310,y:300},{x:595,y:200}];
const vertical = [{x:15,y:90},{x:15,y:500}];
const snapshot = JSON.stringify([circle, zigzag, edge, vertical]);
let checks = 0;
for (const raw of [circle, zigzag, edge, vertical]) {
  assert.equal(JSON.stringify(g.scale(raw, 1)), JSON.stringify(raw)); checks++;
  const b = g.extent(raw), max = g.maxScale(raw, size);
  assert.ok(max >= 1 && max <= 2); checks++;
  for (const factor of [.4, 1, max]) {
    const scaled = g.scale(raw, factor), after = g.extent(scaled);
    assert.ok(Math.abs(after.x - b.x) < 1e-8 && Math.abs(after.y - b.y) < 1e-8);
    assert.ok(Math.abs(after.width - b.width * factor) < 1e-8);
    assert.ok(scaled.every(p => p.x >= 3 - 1e-8 && p.x <= 597 + 1e-8 && p.y >= 3 - 1e-8 && p.y <= 597 + 1e-8));
    const beads = distanceFiltered(scaled, Math.hypot(size,size) * .022);
    const prepared = g.prepare(scaled,size);
    assert.equal(JSON.stringify(prepared), JSON.stringify(densified(beads,6)), 'same preprocessing as public canvas');
    const read = () => interpretStroke(prepared,size,size,{coarse:true,hc:0,language:'ja'});
    assert.equal(JSON.stringify(read()),JSON.stringify(read()),'repeatable output');
    checks += 5;
  }
}
assert.equal(snapshot, JSON.stringify([circle, zigzag, edge, vertical])); checks++;
const words = [.4,1,2].map(f => romajiOf(interpretStroke(g.prepare(g.scale(circle,f),size),size,size).event));
assert.ok(new Set(words).size > 1, 'circle size changes reach the shared vocabulary'); checks++;
// Word band: run-length of the 1%-step words (pure function in twins-geometry.js).
const shape = rs => rs.map(r => `${r.word}${r.start}+${r.length}${r.returns ? 'R' : ''}`).join(' ');
// b is a 1-step flip between a's -> returns; the 7-long c between a's is not; the first and last runs never are.
assert.equal(shape(g.runs([...'aabaaccccccc'.split(''), 'a', 'a'], 40)), 'a40+2 b42+1R a43+2 c45+7 a52+2'); checks++;
assert.equal(shape(g.runs(['x', 'y', 'x'], 40)), 'x40+1 y41+1R x42+1'); checks++;
// length boundary: 4 returns, 5 does not
assert.equal(g.runs(['a', ...Array(4).fill('b'), 'a'], 40)[1].returns, true); checks++;
assert.equal(g.runs(['a', ...Array(5).fill('b'), 'a'], 40)[1].returns, false); checks++;
// different words on each side: not a return even when short
assert.equal(g.runs(['a', 'b', 'c'], 40)[1].returns, false); checks++;
assert.equal(g.runs([], 40).length, 0); assert.equal(g.runs(['q'], 40)[0].returns, false); checks += 2;
const lengths = [1, 2, 3, 5, 6, 10, 11, 20, 21, 160].map(n => g.bandLevel(n));
assert.equal(lengths.join(), '1,1,2,2,3,3,4,4,5,5'); checks++;
// Circle across every scale (40% .. limit, 1% steps): the words gather into a few runs.
const circleMax = Math.floor(g.maxScale(circle, size) * 100);
const circleWords = [];
for (let p = 40; p <= circleMax; p++) {
  const r = interpretStroke(g.prepare(g.scale(circle, p / 100), size), size, size, { coarse: true, hc: 0, language: 'ja' });
  circleWords.push(r ? romajiOf(r.event) : '∅');
}
const circleRuns = g.runs(circleWords, 40);
assert.equal(circleWords.length, circleMax - 40 + 1);
assert.equal(circleRuns.reduce((n, r) => n + r.length, 0), circleWords.length);
assert.ok(circleRuns.length >= 2 && circleRuns.length <= 6, `circle band has a few runs (got ${circleRuns.length})`); checks += 3;
console.log(`twins band: circle 40-${circleMax}% = ${circleRuns.length} runs (${circleRuns.map(r => `${r.word}:${r.start}+${r.length}`).join(' ')})`);
console.log(`twins: ${checks} checks passed; circle 40/100/200%: ${words.join(' / ')}`);
