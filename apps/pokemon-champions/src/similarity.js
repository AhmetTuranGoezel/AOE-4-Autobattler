// "Find similar Pokemon" — nearest neighbours by stat shape + typing + role.
import { STAT_KEYS } from "./effective-stats.js";

// Pre-compute per-stat mean/std across the dataset so each stat contributes
// comparably (z-scoring), regardless of its natural scale.
export function buildSimContext(all) {
  const mean = {}, std = {};
  for (const k of STAT_KEYS) {
    const xs = all.map((m) => m.stats[k]);
    const mu = xs.reduce((a, b) => a + b, 0) / xs.length;
    const v = xs.reduce((a, b) => a + (b - mu) ** 2, 0) / xs.length;
    mean[k] = mu;
    std[k] = Math.sqrt(v) || 1;
  }
  return { mean, std };
}

const DEFAULTS = { typeWeight: 1.2, roleWeight: 0.8 };

export function findSimilar(target, all, ctx, opts = {}) {
  const { typeWeight, roleWeight } = { ...DEFAULTS, ...opts };
  const z = (m) => STAT_KEYS.map((k) => (m.stats[k] - ctx.mean[k]) / ctx.std[k]);
  const zt = z(target);
  const ttypes = new Set(target.types);

  const scored = [];
  for (const m of all) {
    if (m.slug === target.slug) continue;
    const zm = z(m);
    let d = 0;
    for (let i = 0; i < zt.length; i++) d += (zt[i] - zm[i]) ** 2;
    d = Math.sqrt(d);
    const shared = m.types.filter((t) => ttypes.has(t)).length;
    d -= typeWeight * shared;
    if (m._eff && target._eff && m._eff.role === target._eff.role) d -= roleWeight;
    scored.push({ mon: m, dist: d });
  }
  scored.sort((a, b) => a.dist - b.dist);

  // Map distance to a friendly 0-100 similarity for display.
  const worst = scored[scored.length - 1]?.dist ?? 1;
  const best = scored[0]?.dist ?? 0;
  const span = worst - best || 1;
  for (const s of scored) {
    s.similarity = Math.round(100 * (1 - (s.dist - best) / span));
  }
  return scored;
}
