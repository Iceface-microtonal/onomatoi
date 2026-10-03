// Native PentagramRotationTests equivalents, exercised through the production interpreter.
export function checkPentagramRotations(api, check) {
  const W = 400, H = 600;
  const polyline = (route, steps = 24) => route.slice(1).flatMap((b, index) => {
    const a = route[index];
    return Array.from({ length: steps }, (_, i) => ({
      x: a.x + (b.x - a.x) * i / steps, y: a.y + (b.y - a.y) * i / steps,
    }));
  }).concat(route.slice(-1));
  function star(rotation, radius = 125, aspect = 1, distortion = 0, start = 0, reversed = false, steps = 24) {
    const offsets = [[0, -3], [4, 2], [-3, 4], [2, -4], [-4, 1]];
    const vertices = offsets.map(([dx, dy], i) => {
      const theta = -Math.PI / 2 + i * 2 * Math.PI / 5;
      const x = radius * Math.cos(theta) * aspect + dx * distortion;
      const y = radius * Math.sin(theta) + dy * distortion;
      return { x: 200 + x * Math.cos(rotation) - y * Math.sin(rotation),
        y: 300 + x * Math.sin(rotation) + y * Math.cos(rotation) };
    });
    return polyline(Array.from({ length: 6 }, (_, i) =>
      vertices[((start + i * (reversed ? -2 : 2)) % 5 + 5) % 5]), steps);
  }
  const coarse = pts => api.densified(api.distanceFiltered(pts, Math.hypot(W, H) * 0.022), 6);
  // 手の速さで打った星 (Core handSampledStar と同じ): 各辺 minimum-jerk (先端で速さ 0)・周期 dt。
  // 等分の点列は先端が必ず点に乗り、旧い粗い筆では珠が先端に乗る偶然があった (2026-10-04)。
  function handSampledStar(rotation, radius, aspect, distortion, start, reversed, dt, phase) {
    const tips = star(rotation, radius, aspect, distortion, start, reversed, 1);
    const points = [tips[0]];
    let carry = phase * dt;
    for (let e = 1; e < tips.length; e++) {
      const a = tips[e - 1], b = tips[e];
      const duration = 0.12 * Math.sqrt(Math.hypot(b.x - a.x, b.y - a.y)) / 3.5;
      let t = carry;
      for (; t < duration; t += dt) {
        const u = t / duration, s = 10 * u ** 3 - 15 * u ** 4 + 6 * u ** 5;
        points.push({ x: a.x + (b.x - a.x) * s, y: a.y + (b.y - a.y) * s });
      }
      carry = t - duration;
    }
    return points.concat(tips.slice(-1));
  }
  const measure = pts => api.strokeComplexity(api.coreSplineSmoothed(pts), W, H, 16, true, pts);
  const words = new Set(["ayanoparu", "ayanofaru", "ayanoharu"]);
  const failures = [];
  let count = 0, coarseSameWord = 0;
  const coarseRecognized = [0, 0];
  for (const radius of [70, 125]) for (const aspect of [1, 0.8, 0.65])
    for (const distortion of [0, 2]) for (let start = 0; start < 5; start++)
      for (const reversed of [false, true]) for (let degrees = 0; degrees < 360; degrees += 15) {
        const raw = star(degrees * Math.PI / 180, radius, aspect, distortion, start, reversed);
        const result = api.interpretStroke(raw, W, H);
        count++;
        if (!result.cx.isOneStrokePentagram || !words.has(api.romajiOf(result.event)))
          failures.push({ radius, aspect, distortion, start, reversed, degrees,
            fit: result.cx.pentagramTopologyFit, word: api.romajiOf(result.event) });
        // 粗い筆: 120Hz と 60Hz に打つ。珠は道筋 (と折り返しの先端) で決まる。
        const coarseWords = [1 / 120, 1 / 60].map(dt => api.romajiOf(api.interpretStroke(coarse(
          handSampledStar(degrees * Math.PI / 180, radius, aspect, distortion, start, reversed, dt,
            ((degrees / 15 + start) % 7) / 7)), W, H).event));
        if (coarseWords[0] === coarseWords[1]) coarseSameWord++;
        coarseWords.forEach((w, i) => { if (words.has(w)) coarseRecognized[i]++; });
      }
  check("pentagram: 2880 rotations / stretch / distortion / starts / directions", count === 2880 && !failures.length,
    `${failures.length} failures: ${JSON.stringify(failures.slice(0, 3))}`);
  // 珠を円の出口と角に置く規則 (coarseBeads) で 120Hz・60Hz とも 2880/2880 (旧規則は同じ入力で 2723・2758)。
  // 打ち方で語が分かれるのは星の語彙の段 (ayanoparu ↔ ayanofaru) だけ (角の珠は指の点の上に乗る)。
  check("pentagram: coarse ink recognized 2880 / 2880 at 120Hz and 60Hz",
    coarseRecognized.every(n => n === 2880), JSON.stringify(coarseRecognized));
  check("pentagram: coarse ink same word at 120Hz and 60Hz ≥ 2874 / 2880", coarseSameWord >= 2874, `${coarseSameWord}`);

  const thin = measure(star(Math.PI / 4, 125, 0.65));
  check("pentagram: thin star rescued without rewriting radial order", thin.trajectoryDescriptor.radialSymmetryOrder === 4
    && thin.pentagramTopologyFit >= 0.66 && thin.oneStrokePentagramRecognitionLevel === 2);
  const gaps = [];
  for (const steps of [8, 24, 60]) {
    const raw = star(Math.PI / 4, 125, 0.65, 0, 0, false, steps);
    const open = raw.slice(0, -1), shift = steps / 2;
    const edgeStart = open.slice(shift).concat(open.slice(0, shift), [open[shift]]);
    const smallGap = raw.slice(), end = raw.at(-1), before = raw.at(-2);
    smallGap[smallGap.length - 1] = { x: end.x + (before.x - end.x) * 0.25,
      y: end.y + (before.y - end.y) * 0.25 };
    for (const pts of [edgeStart, smallGap]) if (!measure(pts).isOneStrokePentagram) gaps.push(steps);
  }
  check("pentagram: edge starts, small gaps and sampling density", !gaps.length, JSON.stringify(gaps));

  const radial = (count, radius) => Array.from({ length: count }, (_, i) => ({
    x: 200 + radius(i) * Math.cos(i * 2 * Math.PI / count),
    y: 300 + radius(i) * Math.sin(i * 2 * Math.PI / count),
  }));
  const pentagon = radial(5, () => 120), outline = radial(10, i => i % 2 === 0 ? 120 : 50);
  const seven = radial(7, () => 120), flower = radial(180, i => 90 + 20 * Math.cos(i * 10 * Math.PI / 180));
  const cases = [polyline(pentagon.concat(pentagon[0])), polyline(outline.concat(outline[0])),
    polyline(Array.from({ length: 8 }, (_, i) => seven[i * 3 % 7])), flower.concat(flower[0]),
    Array.from({ length: 181 }, (_, i) => ({ x: 200 + 90 * Math.sin(i * 2 * Math.PI / 180),
      y: 300 + 110 * Math.sin(i * 4 * Math.PI / 180) })),
    star(0, 125, 0.65).slice(0, -15), star(Math.PI / 4, 125, 0.2)];
  const falsePositives = [];
  cases.forEach((pts, index) => {
    for (let degrees = 0; degrees < 360; degrees += 30) {
      const a = degrees * Math.PI / 180;
      const rotated = pts.map(p => ({
        x: 200 + (p.x - 200) * Math.cos(a) - (p.y - 300) * Math.sin(a),
        y: 300 + (p.x - 200) * Math.sin(a) + (p.y - 300) * Math.cos(a),
      }));
      const cx = measure(rotated);
      if (cx.pentagramTopologyFit !== 0 || cx.isOneStrokePentagram) falsePositives.push({ index, degrees });
    }
  });
  check("pentagram: 84 other-shape rotations remain excluded", !falsePositives.length, JSON.stringify(falsePositives.slice(0, 3)));
  const points = star(Math.PI / 4, 125, 0.65);
  const live = api.strokeComplexity(api.coreSplineSmoothed(points), W, H, 16, false, points);
  check("pentagram: live analysis skips topology", live.pentagramTopologyFit === 0 && !live.isOneStrokePentagram);
}
