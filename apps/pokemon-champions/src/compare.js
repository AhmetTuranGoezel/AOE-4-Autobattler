// Side-by-side comparison of up to 4 Pokemon: overlaid radar + stat table
// (best value per row highlighted) + abilities.
import { STAT_KEYS, STAT_LABELS, statsFor } from "./effective-stats.js";
import { renderMultiRadar } from "./radar.js";
import { displayName } from "./data.js";
import { typeBadges, ROLE_META } from "./table.js";

export const CMP_COLORS = ["#e3350d", "#3c93dd", "#56ab2f", "#f2c218"];

export function renderCompare(mons, data, max = 200, anchorSlug = null) {
  const aIdx = Math.max(0, mons.findIndex((m) => m.slug === anchorSlug));
  const anchorName = displayName(mons[aIdx]);
  const series = mons.map((m, i) => ({ color: CMP_COLORS[i % 4], stats: m._eff.disp }));
  const radar = renderMultiRadar(series, { max });

  const heads = mons.map((m, i) => `<th class="cmp-col ${i === aIdx ? "is-anchor" : ""}" data-anchor="${m.slug}" title="Click to compare the others against this Pokémon">
    <span class="cmp-dot" style="background:${CMP_COLORS[i % 4]}"></span>
    <img src="${m.sprite || m.artwork || ""}" alt="">
    <span class="cmp-h-name">${displayName(m)}</span>
    <span class="types">${typeBadges(m.types)}</span>
    <span class="role ${ROLE_META[m._eff.role].cls}">${ROLE_META[m._eff.role].label}</span>
    <span class="cmp-anchor-tag">${i === aIdx ? "baseline" : "set baseline"}</span>
  </th>`).join("");

  const ehp = (m, k) => { const lv = statsFor(m, "lv50"); return Math.round(lv.hp * lv[k] / 100); };
  const rowDefs = [
    ...STAT_KEYS.map((k) => [STAT_LABELS[k], (m) => m._eff.disp[k]]),
    ["Total", (m) => m._eff.bst],
    ["Cleaned", (m) => m._eff.cleaned, true],
    ["Phys. eHP @50", (m) => ehp(m, "def"), false, "Effective HP vs physical = Lv50 HP × Defense ÷ 100 (physical bulk)"],
    ["Spec. eHP @50", (m) => ehp(m, "spd"), false, "Effective HP vs special = Lv50 HP × Sp.Def ÷ 100 (special bulk)"],
  ];
  const rows = rowDefs.map(([label, fn, hl, title]) => {
    const vals = mons.map(fn);
    const max = Math.max(...vals);
    const base = vals[aIdx];
    const cells = vals.map((v, i) => {
      const cls = vals.length > 1 && v === max && new Set(vals).size > 1 ? "best" : "";
      let delta = "";
      if (i !== aIdx) {
        const d = v - base;
        delta = `<span class="cmp-delta ${d > 0 ? "up" : d < 0 ? "down" : ""}">${d > 0 ? "+" + d : d < 0 ? "−" + (-d) : "±0"}</span>`;
      }
      return `<td class="num ${cls} ${i === aIdx ? "anchor-col" : ""}">${v}${delta}</td>`;
    }).join("");
    return `<tr class="${hl ? "cmp-hl" : ""}"><th title="${title || ""}">${label}</th>${cells}</tr>`;
  }).join("");

  const abil = `<tr class="cmp-abil"><th>Abilities</th>${mons.map((m) =>
    `<td>${m.abilities.map((a) => {
      const meta = data.abilities[a.slug] || { name: a.slug };
      return `<span class="cmp-ab" title="${(meta.desc || "")}">${meta.name}${a.hidden ? " *" : ""}</span>`;
    }).join("")}</td>`).join("")}</tr>`;

  return `<div class="compare-card">
    <button class="detail-close" data-close-compare aria-label="Close">✕</button>
    <h3 class="compare-title">Compare <span class="cmp-sub">— differences shown vs <b>${anchorName}</b> (baseline). Click another column to rebase.</span></h3>
    <div class="compare-grid">
      <div class="compare-radar">${radar}
        <div class="cmp-legend">${mons.map((m, i) =>
          `<span><i style="background:${CMP_COLORS[i % 4]}"></i>${displayName(m)}</span>`).join("")}</div>
      </div>
      <div class="compare-table-wrap">
        <table class="compare-table"><thead><tr><th></th>${heads}</tr></thead>
        <tbody>${rows}${abil}</tbody></table>
      </div>
    </div>
  </div>`;
}
