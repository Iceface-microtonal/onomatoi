// Geometry only. Word generation and audio remain in iceface_onomatoi.html.
const TwinsGeometry = {
  extent(points) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of points) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
    return { x: (minX + maxX) / 2, y: (minY + maxY) / 2,
      width: maxX - minX, height: maxY - minY };
  },
  maxScale(points, size) {
    const b = this.extent(points);
    // Leave room for the stroke, including drawings made at the edge.
    const limit = Math.min(b.width ? 2 * Math.min(b.x - 3, size - 3 - b.x) / b.width : Infinity,
      b.height ? 2 * Math.min(b.y - 3, size - 3 - b.y) / b.height : Infinity);
    return Math.max(1, Math.min(2, Math.floor(limit * 100) / 100));
  },
  scale(points, factor) {
    if (factor === 1) return points.map(p => ({ ...p }));
    const b = this.extent(points);
    return points.map(p => ({ x: b.x + (p.x - b.x) * factor,
      y: b.y + (p.y - b.y) * factor }));
  },
  // Plain translation (shape and size untouched). Never mutates the input.
  translate(points, dx, dy) {
    return points.map(p => ({ x: p.x + dx, y: p.y + dy }));
  },
  // Centre of the bounding box along `axis` ('x' | 'y') as a percentage of the frame (exact, not rounded).
  positionPercent(points, size, axis) {
    return this.extent(points)[axis] / size * 100;
  },
  // Range (in whole %) the bounding-box centre can take along `axis` with the whole shape inside the
  // frame (margin 3, like maxScale), plus `origin` = the drawn position rounded to a whole %.
  // The origin is always inside [min, max] (it is served by the untouched shape, not by a translation).
  positionRange(points, size, axis) {
    const b = this.extent(points), half = (axis === 'x' ? b.width : b.height) / 2;
    const lo = (3 + half) / size * 100, hi = (size - 3 - half) / size * 100;
    const origin = Math.round(this.positionPercent(points, size, axis));
    return { min: Math.min(Math.ceil(lo - 1e-9), origin), max: Math.max(Math.floor(hi + 1e-9), origin), origin };
  },
  // The shape with its bounding-box centre moved to `percent` along `axis` (other axis untouched).
  moveTo(points, size, axis, percent) {
    const d = percent / 100 * size - this.extent(points)[axis];
    return axis === 'x' ? this.translate(points, d, 0) : this.translate(points, 0, d);
  },
  // Run-length the words read at consecutive 1% steps (words[0] is at startPercent).
  // `returns`: the neighbours on both sides are the same word and this run is <= 4% long,
  // i.e. the word flips away and straight back (same rule as the Atlas size sweep bands).
  runs(words, startPercent = 40) {
    const out = [];
    words.forEach((word, i) => {
      const last = out[out.length - 1];
      if (last && last.word === word) last.length++;
      else out.push({ word, start: startPercent + i, length: 1, returns: false });
    });
    out.forEach((r, i) => {
      r.returns = i > 0 && i < out.length - 1 && out[i - 1].word === out[i + 1].word && r.length <= 4;
    });
    return out;
  },
  // Colour step of a run by its length: 1-2 / 3-5 / 6-10 / 11-20 / 21+ (%).
  bandLevel(length) {
    return length <= 2 ? 1 : length <= 5 ? 2 : length <= 10 ? 3 : length <= 20 ? 4 : 5;
  },
  // Scale the original input BEFORE sampling beads; never scale old beads.
  // Same preparation as the public pen-up (scaleFreeInk): beads relative to the stroke's own size,
  // analysed in a frame of fixed stroke size with the canvas scaled alike. Returns {points, w, h, scale}.
  prepare(points, size) {
    return scaleFreeInk(points, size, size);
  }
};
