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
  '\nthis.api = {TwinsGeometry, interpretStroke, distanceFiltered, densified, scaleFreeInk, romajiOf};', ctx);
const {TwinsGeometry: g, interpretStroke, distanceFiltered, densified, scaleFreeInk, romajiOf} = ctx.api;
const readInk = ink => interpretStroke(ink.points, ink.w, ink.h, {coarse:true,hc:0,language:'ja'});
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
    const prepared = g.prepare(scaled,size);
    assert.equal(JSON.stringify(prepared), JSON.stringify(scaleFreeInk(scaled,size,size)), 'same preprocessing as public pen-up');
    const read = () => readInk(prepared);
    assert.equal(JSON.stringify(read()),JSON.stringify(read()),'repeatable output');
    checks += 5;
  }
}
assert.equal(snapshot, JSON.stringify([circle, zigzag, edge, vertical])); checks++;
const words = [.4,1,2].map(f => romajiOf(readInk(g.prepare(g.scale(circle,f),size)).event));
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
  const r = readInk(g.prepare(g.scale(circle, p / 100), size));
  circleWords.push(r ? romajiOf(r.event) : '∅');
}
const circleRuns = g.runs(circleWords, 40);
assert.equal(circleWords.length, circleMax - 40 + 1);
assert.equal(circleRuns.reduce((n, r) => n + r.length, 0), circleWords.length);
assert.ok(circleRuns.length >= 2 && circleRuns.length <= 6, `circle band has a few runs (got ${circleRuns.length})`); checks += 3;
console.log(`twins band: circle 40-${circleMax}% = ${circleRuns.length} runs (${circleRuns.map(r => `${r.word}:${r.start}+${r.length}`).join(' ')})`);
console.log(`twins: ${checks} checks passed; circle 40/100/200%: ${words.join(' / ')}`);

// Position (up/down, left/right): translation only; the range keeps the whole shape inside the frame.
const before = JSON.stringify([circle, zigzag, edge, vertical]);
for (const raw of [circle, zigzag, edge, vertical]) {
  const b = g.extent(raw);
  assert.equal(JSON.stringify(g.translate(raw, 0, 0)), JSON.stringify(raw)); checks++;
  const moved = g.translate(raw, 17, -9), mb = g.extent(moved);
  assert.ok(Math.abs(mb.width - b.width) < 1e-8 && Math.abs(mb.height - b.height) < 1e-8, 'translate keeps size');
  assert.ok(moved.every((p, i) => Math.abs(p.x - raw[i].x - 17) < 1e-8 && Math.abs(p.y - raw[i].y + 9) < 1e-8)); checks += 2;
  for (const axis of ['x', 'y']) {
    const r = g.positionRange(raw, size, axis), other = axis === 'x' ? 'y' : 'x';
    assert.ok(r.min <= r.origin && r.origin <= r.max && r.min >= 0 && r.max <= 100); checks++;
    assert.equal(r.origin, Math.round(g.positionPercent(raw, size, axis))); checks++;
    for (const v of [r.min, r.max]) {
      if (v === r.origin) continue;   // the origin is served by the untouched drawing
      const m = g.moveTo(raw, size, axis, v), e = g.extent(m);
      assert.ok(Math.abs(e[axis] - v / 100 * size) < 1e-8, 'centre lands on the %');
      assert.ok(Math.abs(e[other] - b[other]) < 1e-8, 'other axis untouched');
      assert.ok(Math.abs(e.width - b.width) < 1e-8 && Math.abs(e.height - b.height) < 1e-8, 'size untouched');
      assert.ok(m.every(p => p.x >= 3 - 1e-8 && p.x <= size - 3 + 1e-8 && p.y >= 3 - 1e-8 && p.y <= size - 3 + 1e-8), `${axis}=${v}% fits the frame`);
      checks += 4;
    }
  }
}
assert.equal(before, JSON.stringify([circle, zigzag, edge, vertical]), 'inputs not mutated'); checks++;
// Tightness on a shape with a known box: circle r=115 -> centre range (3+115)/6 .. (597-115)/6 => 20 .. 80 (ceil / floor)
{
  const r = g.positionRange(circle, size, 'x');
  assert.deepEqual([r.min, r.max, r.origin], [20, 80, 50]); checks++;
  const out = g.moveTo(circle, size, 'x', r.min - 1);
  assert.ok(Math.min(...out.map(p => p.x)) < 3, 'one % before min leaves the frame'); checks++;
  const out2 = g.moveTo(circle, size, 'x', r.max + 1);
  assert.ok(Math.max(...out2.map(p => p.x)) > size - 3, 'one % after max leaves the frame'); checks++;
}
// The word over every position. Left/right is expected to be a pure pan (same word everywhere): observed, and asserted
// only as far as the observation holds (see the log line). Up/down: the number of runs is recorded, not judged.
const positionLog = [];
for (const [name, raw] of [['circle', circle], ['zigzag', zigzag], ['edge', edge], ['vertical', vertical]]) {
  for (const axis of ['x', 'y']) {
    const r = g.positionRange(raw, size, axis), ws = [];
    for (let v = r.min; v <= r.max; v++) {
      const res = readInk(g.prepare(v === r.origin ? raw : g.moveTo(raw, size, axis, v), size));
      ws.push(res ? romajiOf(res.event) : '∅');
    }
    const rs = g.runs(ws, r.min);
    assert.equal(ws.length, r.max - r.min + 1); checks++;
    positionLog.push(`${name} ${axis === 'x' ? '左右' : '上下'} ${r.min}-${r.max}% = ${rs.length} run(s): ${rs.map(q => `${q.word}:${q.start}+${q.length}`).join(' ')}`);
    if (axis === 'x' && (name === 'circle' || name === 'zigzag')) { assert.equal(new Set(ws).size, 1, `${name}: left/right moves keep one word`); checks++; }
  }
}
console.log('twins position (recorded):\n  ' + positionLog.join('\n  '));
console.log(`twins: ${checks} checks passed in total`);

// Rotation (about the box centre; + = clockwise on screen) and one-axis stretch.
{
  const shapes = [['circle', circle], ['zigzag', zigzag], ['edge', edge], ['vertical', vertical]];
  const ex = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-8, `${msg}: ${a} vs ${b}`);
  const inFrame = pts => pts.every(p => p.x >= 3 - 1e-8 && p.x <= size - 3 + 1e-8 && p.y >= 3 - 1e-8 && p.y <= size - 3 + 1e-8);
  const guard = JSON.stringify(shapes.map(s => s[1]));
  // direction: the point right of the centre, turned +90, ends up BELOW it (screen y is down) = clockwise
  const probe = g.rotate([{x:100,y:100},{x:200,y:100},{x:150,y:100}], 90);
  ex(probe[2].x, 150, 'pivot x'); ex(probe[2].y, 100, 'pivot y');
  assert.ok(probe[1].y > probe[2].y + 40 && Math.abs(probe[1].x - 150) < 1e-8, '+90 is clockwise on screen'); checks += 3;
  const probe2 = g.rotate([{x:100,y:100},{x:200,y:100},{x:150,y:100}], -90);
  assert.ok(probe2[1].y < probe2[2].y - 40, '-90 is counter-clockwise'); checks++;
  for (const [name, raw] of shapes) {
    const b = g.extent(raw);
    assert.equal(JSON.stringify(g.rotate(raw, 0)), JSON.stringify(raw), `${name}: 0 deg is untouched`); checks++;
    g.rotate(raw, 0)[0].x = -1;   // the copy is independent of the input
    const full = g.rotate(raw, 360);
    full.forEach((p, i) => { ex(p.x, raw[i].x, `${name} 360 x`); ex(p.y, raw[i].y, `${name} 360 y`); }); checks += raw.length * 2;
    // the axis (box centre of the input) does not move
    const withPivot = g.rotate([...raw, { x: b.x, y: b.y }], 37).pop();
    ex(withPivot.x, b.x, `${name} pivot x`); ex(withPivot.y, b.y, `${name} pivot y`); checks += 2;
    // a half turn maps the box onto itself: the box centre stays
    const half = g.extent(g.rotate(raw, 180));
    ex(half.x, b.x, `${name} 180 centre x`); ex(half.y, b.y, `${name} 180 centre y`); checks += 2;
    // range: contains 0, contiguous, whole shape inside the frame, and one degree past either end does not fit
    const r = g.rotationRange(raw, size);
    assert.equal(r.origin, 0); assert.ok(r.min <= 0 && 0 <= r.max && r.min >= -180 && r.max <= 180); checks += 2;
    for (let d = r.min; d <= r.max; d++) assert.ok(inFrame(g.rotate(raw, d)), `${name}: ${d} deg fits`);
    checks += r.max - r.min + 1;
    if (r.max < 180) { assert.equal(g.fits(g.rotate(raw, r.max + 1), size), false, `${name}: max+1 leaves the frame`); checks++; }
    if (r.min > -180) { assert.equal(g.fits(g.rotate(raw, r.min - 1), size), false, `${name}: min-1 leaves the frame`); checks++; }
    // stretch: the other coordinate is exactly unchanged, the box centre does not move, the span follows the factor
    for (const axis of ['x', 'y']) {
      const other = axis === 'x' ? 'y' : 'x', dim = axis === 'x' ? 'width' : 'height', otherDim = axis === 'x' ? 'height' : 'width';
      assert.equal(JSON.stringify(g.stretch(raw, axis, 1)), JSON.stringify(raw)); checks++;
      const sr = g.stretchRange(raw, size, axis);
      assert.deepEqual([sr.min, sr.origin], [40, 100]); assert.ok(sr.max >= 100 && sr.max <= 200); checks += 2;
      for (const f of [.4, .7, 1.5, sr.max / 100]) {
        const st = g.stretch(raw, axis, f), e = g.extent(st);
        st.forEach((p, i) => assert.equal(p[other], raw[i][other], `${name} ${axis}: other axis exact`));
        ex(e.x, b.x, `${name} ${axis} centre x`); ex(e.y, b.y, `${name} ${axis} centre y`);
        ex(e[dim], b[dim] * f, `${name} ${axis} span`); ex(e[otherDim], b[otherDim], `${name} ${axis} other span`);
        checks += raw.length + 4;
      }
      assert.ok(inFrame(g.stretch(raw, axis, sr.max / 100)), `${name} ${axis}: max fits`); checks++;
      if (sr.max < 200) { assert.equal(g.fits(g.stretch(raw, axis, (sr.max + 1) / 100), size), false, `${name} ${axis}: max+1 leaves the frame`); checks++; }
    }
  }
  assert.equal(guard, JSON.stringify(shapes.map(s => s[1])), 'rotate/stretch do not mutate inputs'); checks++;
  // The word over the whole range (recorded, not judged): rotation as far as the frame allows, stretch 40%..limit.
  const log = [];
  const sweep = (label, lo, hi, make) => {
    const ws = [];
    for (let v = lo; v <= hi; v++) { const res = readInk(g.prepare(make(v), size)); ws.push(res ? romajiOf(res.event) : '∅'); }
    assert.equal(ws.length, hi - lo + 1); checks++;
    const rs = g.runs(ws, lo);
    log.push(`${label} ${lo}..${hi} = ${rs.length} run(s): ${rs.map(q => `${q.word}:${q.start}+${q.length}${q.returns ? 'R' : ''}`).join(' ')}`);
  };
  for (const [name, raw] of shapes) {
    const rr = g.rotationRange(raw, size);
    sweep(`${name} 回転(度)`, rr.min, rr.max, d => g.rotate(raw, d));
    for (const axis of ['x', 'y']) {
      const sr = g.stretchRange(raw, size, axis);
      sweep(`${name} ${axis === 'x' ? '横に伸ばす' : '縦に伸ばす'}(%)`, sr.min, sr.max, v => g.stretch(raw, axis, v / 100));
    }
  }
  console.log('twins rotate/stretch (recorded):\n  ' + log.join('\n  '));
}
console.log(`twins: ${checks} checks passed with rotate/stretch`);
