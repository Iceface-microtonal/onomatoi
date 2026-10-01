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
  const measure = pts => api.strokeComplexity(api.coreSplineSmoothed(pts), W, H, 16, true, pts);
  const words = new Set(["ayanoparu", "ayanofaru", "ayanoharu"]);
  const failures = [];
  let count = 0;
  for (const radius of [70, 125]) for (const aspect of [1, 0.8, 0.65])
    for (const distortion of [0, 2]) for (let start = 0; start < 5; start++)
      for (const reversed of [false, true]) for (let degrees = 0; degrees < 360; degrees += 15) {
        const raw = star(degrees * Math.PI / 180, radius, aspect, distortion, start, reversed);
        for (const points of [raw, coarse(raw)]) {
          const result = api.interpretStroke(points, W, H);
          count++;
          if (!result.cx.isOneStrokePentagram || !words.has(api.romajiOf(result.event)))
            failures.push({ radius, aspect, distortion, start, reversed, degrees,
              fit: result.cx.pentagramTopologyFit, word: api.romajiOf(result.event) });
        }
      }
  check("pentagram: 5760 rotations / stretch / distortion / starts / directions / coarse ink", count === 5760 && !failures.length,
    `${failures.length} failures: ${JSON.stringify(failures.slice(0, 3))}`);

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
