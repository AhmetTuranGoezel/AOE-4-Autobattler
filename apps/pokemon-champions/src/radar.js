// Pure-SVG stat hexagon. Overlays raw base stats (outline) and effective /
// "cleaned" stats (filled) so the wasted area is visible at a glance.
// Axis order matches the in-game summary hexagon.
const ORDER = [
  ["hp", "HP"], ["atk", "Atk"], ["def", "Def"],
  ["spe", "Spe"], ["spd", "Sp.Def"], ["spa", "Sp.Atk"],
];

const pt = (cx, cy, r, i) => {
  const a = (-90 + i * 60) * Math.PI / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
};

const poly = (pts) => pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");

export function renderRadar(raw, eff, { size = 260, max = 200 } = {}) {
  const cx = size / 2, cy = size / 2;
  const R = size / 2 - 34;

  // concentric grid rings
  let grid = "";
  for (let ring = 1; ring <= 4; ring++) {
    const r = (R * ring) / 4;
    grid += `<polygon class="radar-grid" points="${poly(ORDER.map((_, i) => pt(cx, cy, r, i)))}"/>`;
  }
  // spokes + labels
  let spokes = "", labels = "";
  ORDER.forEach(([key, lab], i) => {
    const [x, y] = pt(cx, cy, R, i);
    spokes += `<line class="radar-spoke" x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`;
    const [lx, ly] = pt(cx, cy, R + 18, i);
    const anchor = Math.abs(lx - cx) < 1 ? "middle" : lx > cx ? "start" : "end";
    labels += `<text class="radar-label" x="${lx.toFixed(1)}" y="${(ly + 4).toFixed(1)}" text-anchor="${anchor}">` +
      `${lab} <tspan class="radar-val">${Math.round(raw[key])}</tspan></text>`;
  });

  const frac = (v) => Math.max(0, Math.min(1, v / max));
  const rawPts = ORDER.map(([k], i) => pt(cx, cy, R * frac(raw[k]), i));
  const effPts = ORDER.map(([k], i) => pt(cx, cy, R * frac(eff[k]), i));

  // Pad the viewBox horizontally so the axis labels (drawn outside R) aren't
  // clipped by the SVG edge — the hexagon stays centred on size/2.
  const PADX = 56, PADY = 12;
  return `<svg viewBox="${-PADX} ${-PADY} ${size + PADX * 2} ${size + PADY * 2}" class="radar" role="img" aria-label="stat chart">
    ${grid}${spokes}
    <polygon class="radar-raw" points="${poly(rawPts)}"/>
    <polygon class="radar-eff" points="${poly(effPts)}"/>
    ${ORDER.map(([k], i) => {
      const [x, y] = effPts[i];
      return `<circle class="radar-dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.5"/>`;
    }).join("")}
    ${labels}
  </svg>`;
}

// Overlay several Pokemon's base stats on one radar (for the compare view).
export function renderMultiRadar(series, { size = 340, max = 200 } = {}) {
  const cx = size / 2, cy = size / 2, R = size / 2 - 30;
  let grid = "";
  for (let ring = 1; ring <= 4; ring++) {
    const r = (R * ring) / 4;
    grid += `<polygon class="radar-grid" points="${poly(ORDER.map((_, i) => pt(cx, cy, r, i)))}"/>`;
  }
  let spokes = "", labels = "";
  ORDER.forEach(([, lab], i) => {
    const [x, y] = pt(cx, cy, R, i);
    spokes += `<line class="radar-spoke" x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`;
    const [lx, ly] = pt(cx, cy, R + 16, i);
    const anchor = Math.abs(lx - cx) < 1 ? "middle" : lx > cx ? "start" : "end";
    labels += `<text class="radar-label" x="${lx.toFixed(1)}" y="${(ly + 4).toFixed(1)}" text-anchor="${anchor}">${lab}</text>`;
  });
  const frac = (v) => Math.max(0, Math.min(1, v / max));
  const polys = series.map((s) => {
    const pts = ORDER.map(([k], i) => pt(cx, cy, R * frac(s.stats[k]), i));
    return `<polygon class="radar-multi" points="${poly(pts)}" style="stroke:${s.color};fill:${s.color}26"/>`;
  }).join("");
  const PADX = 48, PADY = 12;
  return `<svg viewBox="${-PADX} ${-PADY} ${size + PADX * 2} ${size + PADY * 2}" class="radar">${grid}${spokes}${polys}${labels}</svg>`;
}
