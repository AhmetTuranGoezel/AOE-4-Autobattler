(function (root) {
  'use strict';

  // Inspect the drawn segments, including vertical shot steps and gaps.
  function nearestSeries(series, point, tolerance = 18) {
    let best = null;
    for (const line of series) {
      let previous = null;
      for (const current of line.points) {
        if (!Number.isFinite(current.x) || !Number.isFinite(current.y)) { previous = null; continue; }
        const start = previous || current;
        previous = current;
        if (point.x < Math.min(start.x, current.x) - tolerance || point.x > Math.max(start.x, current.x) + tolerance) continue;
        const dx = current.x - start.x;
        const dy = current.y - start.y;
        const length = dx * dx + dy * dy;
        const progress = length ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / length)) : 0;
        const x = start.x + progress * dx;
        const y = start.y + progress * dy;
        const distance = Math.hypot(point.x - x, point.y - y);
        if (distance <= tolerance && (!best || distance < best.distance - 0.25
          || (Math.abs(distance - best.distance) <= 0.25 && line.pinned && !best.pinned))) {
          best = { name: line.name, pinned: Boolean(line.pinned), distance, x, y };
        }
      }
    }
    return best;
  }

  const api = { nearestSeries };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FinalsChart = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
