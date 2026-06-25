// Side-by-side comparison of up to 4 Pokemon: overlaid radar + stat table
// (best value per row highlighted) + abilities.
import { STAT_KEYS, STAT_LABELS, statsFor } from "./effective-stats.js";
import { renderMultiRadar } from "./radar.js";
import { displayName, TYPE_COLORS } from "./data.js";
import { typeBadges, ROLE_META } from "./table.js";

export const CMP_COLORS = ["#e3350d", "#3c93dd", "#56ab2f", "#f2c218"];

export function renderCompare(mons, data, max = 200, anchorSlug = null, movesFilter = "all") {
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

  const ehp = (m, k) => { const lv = statsFor(m, "lv50"); return lv.hp * lv[k]; };
  const sep = (x) => x.toLocaleString("en-US");
  const rowDefs = [
    ...STAT_KEYS.map((k) => [STAT_LABELS[k], (m) => m._eff.disp[k]]),
    ["Total", (m) => m._eff.bst],
    ["Cleaned", (m) => m._eff.cleaned, true],
    ["Phys. eHP @50", (m) => ehp(m, "def"), false, "Effective HP vs physical = Lv50 HP × Defense (physical bulk)", sep],
    ["Spec. eHP @50", (m) => ehp(m, "spd"), false, "Effective HP vs special = Lv50 HP × Sp.Def (special bulk)", sep],
  ];
  const rows = rowDefs.map(([label, fn, hl, title, fmt]) => {
    const f = fmt || ((x) => String(x));
    const vals = mons.map(fn);
    const max = Math.max(...vals);
    const base = vals[aIdx];
    const cells = vals.map((v, i) => {
      const cls = vals.length > 1 && v === max && new Set(vals).size > 1 ? "best" : "";
      let delta = "";
      if (i !== aIdx) {
        const d = v - base;
        const mag = f(Math.abs(d));
        delta = `<span class="cmp-delta ${d > 0 ? "up" : d < 0 ? "down" : ""}">${d > 0 ? "+" + mag : d < 0 ? "−" + mag : "±0"}</span>`;
      }
      return `<td class="num ${cls} ${i === aIdx ? "anchor-col" : ""}">${f(v)}${delta}</td>`;
    }).join("");
    return `<tr class="${hl ? "cmp-hl" : ""}"><th title="${title || ""}">${label}</th>${cells}</tr>`;
  }).join("");

  const abil = `<tr class="cmp-abil"><th>Abilities</th>${mons.map((m) =>
    `<td>${m.abilities.map((a) => {
      const meta = data.abilities[a.slug] || { name: a.slug };
      return `<span class="cmp-ab" title="${(meta.desc || "")}">${meta.name}${a.hidden ? " *" : ""}</span>`;
    }).join("")}</td>`).join("")}</tr>`;

  // --- movepool presence matrix ---
  const moveSets = mons.map((m) => new Set(m.moves));
  const typeChip = (t) => (t ? `<span class="type tiny" style="background:${TYPE_COLORS[t]}">${t}</span>` : "");
  let moveRows = [...new Set(mons.flatMap((m) => m.moves))]
    .map((id) => ({ id, mv: data.moves[id], present: moveSets.map((s) => s.has(id)) }))
    .filter((r) => r.mv)
    .map((r) => ({ ...r, cnt: r.present.filter(Boolean).length }));
  const totalMoves = moveRows.length;
  const sharedCount = moveRows.filter((r) => r.cnt === mons.length).length;
  if (movesFilter === "diff") moveRows = moveRows.filter((r) => r.cnt < mons.length);
  moveRows.sort((a, b) => b.cnt - a.cnt
    || (a.mv.type || "").localeCompare(b.mv.type || "") || a.mv.name.localeCompare(b.mv.name));

  const movesSection = `<section class="cmp-moves">
    <div class="cmp-moves-head">
      <h4>Movepool <span class="muted">${totalMoves} moves · ${sharedCount} shared by all</span></h4>
      <div class="cmp-moves-actions">
        <div class="seg cm-toggle">
          <button data-cmp-moves="all" class="${movesFilter === "all" ? "active" : ""}">All</button>
          <button data-cmp-moves="diff" class="${movesFilter === "diff" ? "active" : ""}">Only differences</button>
        </div>
        <button class="btn-sm cm-open-moves" data-open-moves title="See these movepools with full detail (power, target, flags, effect…) and filter">Open in Moves page →</button>
      </div>
    </div>
    <div class="cm-scroll"><table class="cm-table"><thead><tr><th>Move</th>
      ${mons.map((m, i) => `<th class="cm-mon"><img src="${m.sprite || m.artwork || ""}" alt="" title="${displayName(m)}" style="outline-color:${CMP_COLORS[i % 4]}"></th>`).join("")}
    </tr></thead><tbody>${moveRows.map((r) => `<tr>
      <td class="cm-name" data-move-info="${r.id}" title="View move details">${r.mv.name}${typeChip(r.mv.type)}</td>
      ${r.present.map((has, i) => `<td class="cm-cell">${has ? `<img class="cm-yes" loading="lazy" alt="✓" title="${displayName(mons[i])}" src="${mons[i].sprite || mons[i].artwork || ""}">` : ""}</td>`).join("")}
    </tr>`).join("")}</tbody></table></div>
  </section>`;

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
    ${movesSection}
  </div>`;
}
