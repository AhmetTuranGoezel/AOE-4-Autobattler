// Team Builder: pick up to 6 Pokémon and see the team's defensive weaknesses,
// offensive (STAB) coverage, speed tiers and role balance. Pure render — app
// owns the team state + persistence and calls renderTeamView() on any change.
import { TYPES, TYPE_COLORS, displayName } from "./data.js";
import { statsFor, roleOf, speedTier } from "./effective-stats.js";

export const TEAM_MAX = 6;
const ROLE_LABELS = { physical: "Physical", special: "Special", mixed: "Mixed", defensive: "Defensive" };

function effInfo(mult) {
  if (mult === 0) return { cls: "x0", txt: "×0" };
  if (mult <= 0.25) return { cls: "res2", txt: "×¼" };
  if (mult < 1) return { cls: "res", txt: "×½" };
  if (mult >= 4) return { cls: "weak2", txt: "×4" };
  if (mult >= 2) return { cls: "weak", txt: "×2" };
  return { cls: "neu", txt: "" };
}

const typePill = (t) => `<span class="type" style="background:${TYPE_COLORS[t]}">${t}</span>`;

export function renderTeamView(container, { data, team }) {
  const chart = data.typeChart;
  const nameToSlug = new Map(data.pokemon.map((m) => [(m._display || displayName(m)).toLowerCase(), m.slug]));
  container._nameToSlug = nameToSlug; // app reads this to resolve the add box (set before any early return)

  const addBox = `<div class="team-add-wrap">
    <input class="team-add" list="team-add-list" placeholder="Add a Pokémon…" autocomplete="off" ${team.length >= TEAM_MAX ? "disabled" : ""}>
    <datalist id="team-add-list">${data.pokemon.map((m) => `<option value="${m._display || displayName(m)}">`).join("")}</datalist>
    <span class="team-count">${team.length} / ${TEAM_MAX}</span>
  </div>`;

  const slots = `<div class="team-slots">${team.map((m) => `<div class="team-slot" data-slug="${m.slug}" title="Open details">
    <button class="team-remove" data-team-remove="${m.slug}" aria-label="Remove">✕</button>
    <img src="${m.sprite || m.artwork || ""}" alt="">
    <span class="ts-name">${m._display || displayName(m)}</span>
    <span class="types">${m.types.map(typePill).join("")}</span>
  </div>`).join("") || `<p class="team-empty">No Pokémon yet — add up to ${TEAM_MAX} above to analyse the team.</p>`}</div>`;

  if (!team.length) {
    container.innerHTML = `<div class="team"><div class="team-head"><h2>Team Builder</h2>
      <p class="calc-note">Add up to 6 Pokémon to see shared weaknesses, coverage, speed tiers and role balance. Your team is saved automatically.</p></div>
      ${addBox}${slots}</div>`;
    return;
  }

  // --- defensive matrix ---
  const rows = TYPES.map((atk) => {
    const cells = team.map((m) => m.types.reduce((x, t) => x * (chart[atk]?.[t] ?? 1), 1));
    const weak = cells.filter((v) => v > 1).length;
    const resist = cells.filter((v) => v < 1).length;
    return { atk, cells, weak, resist };
  }).sort((a, b) => b.weak - a.weak || a.resist - b.resist || TYPES.indexOf(a.atk) - TYPES.indexOf(b.atk));

  const matrix = `<table class="team-matrix"><thead><tr><th>Type</th>
    ${team.map((m) => `<th><img src="${m.sprite || m.artwork || ""}" alt="" title="${m._display || displayName(m)}"></th>`).join("")}
    <th class="tm-tally">weak</th></tr></thead><tbody>
    ${rows.map((r) => `<tr>
      <td class="tm-type">${typePill(r.atk)}</td>
      ${r.cells.map((v) => { const e = effInfo(v); return `<td class="tm-cell ${e.cls}">${e.txt}</td>`; }).join("")}
      <td class="tm-tally ${r.weak >= 3 ? "hot" : ""}">${r.weak || ""}</td>
    </tr>`).join("")}
  </tbody></table>`;

  const topWeak = rows.filter((r) => r.weak >= 2).slice(0, 4)
    .map((r) => `${r.atk[0].toUpperCase() + r.atk.slice(1)} (${r.weak})`).join(" · ");
  const callout = topWeak
    ? `<div class="team-callout warn">⚠ Shared weaknesses: ${topWeak}</div>`
    : `<div class="team-callout ok">✓ No type weakness shared by 2+ members.</div>`;

  // --- offensive STAB coverage ---
  const stabTypes = [...new Set(team.flatMap((m) => m.types))];
  const covered = TYPES.filter((d) => stabTypes.some((a) => (chart[a]?.[d] ?? 1) >= 2));
  const notCovered = TYPES.filter((d) => !covered.includes(d));

  // --- speed tiers ---
  const bySpeed = [...team].sort((a, b) => b.stats.spe - a.stats.spe);
  const speedList = bySpeed.map((m) => {
    const lv = statsFor(m, "lv50").spe;
    return `<div class="spd-row spd-${speedTier(m.stats.spe)}" data-slug="${m.slug}">
      <span class="spd-name">${m._display || displayName(m)}</span>
      <span class="spd-val">${m.stats.spe}<small> base · ${lv} @50</small></span></div>`;
  }).join("");

  // --- role / balance ---
  const roles = team.map((m) => roleOf(m));
  const count = (r) => roles.filter((x) => x === r).length;
  const slow = team.filter((m) => m.stats.spe <= 55).length;
  const nudges = [];
  if (!roles.some((r) => r === "special" || r === "mixed")) nudges.push("No special attacker");
  if (!roles.some((r) => r === "physical" || r === "mixed")) nudges.push("No physical attacker");
  if (!roles.includes("defensive")) nudges.push("No defensive wall");
  if (slow >= Math.ceil(team.length * 0.7)) nudges.push(`${slow}/${team.length} are slow (≤55 base)`);
  const roleChips = Object.entries(ROLE_LABELS).map(([k, l]) =>
    `<span class="role-tally"><b>${count(k)}</b> ${l}</span>`).join("");

  container.innerHTML = `<div class="team">
    <div class="team-head"><h2>Team Builder</h2></div>
    ${addBox}${slots}
    <div class="team-grid">
      <section class="team-card team-def">
        <h3>Defensive coverage <small>— how each member takes hits of every type</small></h3>
        ${callout}
        ${matrix}
        <div class="tm-legend"><span class="tm-cell weak2">×4</span><span class="tm-cell weak">×2</span><span class="tm-cell neu">×1</span><span class="tm-cell res">×½</span><span class="tm-cell res2">×¼</span><span class="tm-cell x0">×0</span></div>
      </section>
      <div class="team-col">
        <section class="team-card">
          <h3>Offensive coverage <small>(STAB)</small></h3>
          <div class="cov-row"><span class="cov-lab se">Super-effective</span><span class="type-chips">${covered.map(typePill).join("") || "<span class='muted'>none</span>"}</span></div>
          <div class="cov-row"><span class="cov-lab gap">Can't hit SE</span><span class="type-chips dim">${notCovered.map(typePill).join("") || "<span class='muted'>none</span>"}</span></div>
        </section>
        <section class="team-card">
          <h3>Speed tiers</h3>
          <div class="spd-list">${speedList}</div>
        </section>
        <section class="team-card">
          <h3>Roles &amp; balance</h3>
          <div class="role-tallies">${roleChips}</div>
          ${nudges.length ? `<ul class="team-nudges">${nudges.map((n) => `<li>${n}</li>`).join("")}</ul>` : `<p class="team-ok">✓ Well-rounded spread.</p>`}
        </section>
      </div>
    </div>
  </div>`;
}
