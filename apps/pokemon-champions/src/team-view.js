// Team Builder: pick up to 6 Pokémon (each with an optional 4-move set), save/load
// multiple teams, and see defensive weaknesses, offensive coverage (from the chosen
// moves), speed tiers and role balance. Pure render — app owns state + persistence
// and attaches the add/move autocompletes after each render.
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
const nameOf = (m) => m._display || displayName(m);

export function renderTeamView(container, { data, team, savedTeams = [] }) {
  const chart = data.typeChart;
  const bySlug = new Map(data.pokemon.map((m) => [m.slug, m]));

  // --- team manager (save / load / delete multiple teams) ---
  const savedRows = savedTeams.length
    ? savedTeams.map((t) => `<div class="tm-saved-row">
        <button class="tm-load" data-load-team="${t.id}" title="Load this team">
          <span class="tm-saved-name">${t.name}</span>
          <span class="tm-saved-sprites">${t.members.slice(0, TEAM_MAX).map((mm) => {
            const mo = bySlug.get(mm.slug);
            return mo ? `<img src="${mo.sprite || mo.artwork || ""}" alt="" title="${nameOf(mo)}">` : "";
          }).join("")}</span>
        </button>
        <button class="tm-del" data-del-team="${t.id}" aria-label="Delete team" title="Delete">✕</button>
      </div>`).join("")
    : `<p class="muted tm-none">No saved teams yet — build one below and press Save.</p>`;

  const manager = `<div class="team-manager">
    <div class="tm-save">
      <input class="team-name" placeholder="Team name…" maxlength="30" autocomplete="off">
      <button class="btn-sm" data-save-team ${team.length ? "" : "disabled"}>Save</button>
      <button class="btn-sm" data-new-team ${team.length ? "" : "disabled"}>New</button>
    </div>
    <div class="tm-saved">${savedRows}</div>
  </div>`;

  const addRow = `<div class="team-add-row">
    <div class="ac-wrap">
      <input class="team-add" placeholder="Add a Pokémon…" autocomplete="off" ${team.length >= TEAM_MAX ? "disabled" : ""}>
    </div>
    <span class="team-count">${team.length} / ${TEAM_MAX}</span>
  </div>`;

  // --- member cards (sprite + types + moveset) ---
  const members = team.map(({ mon, moveIds }) => {
    const chips = moveIds.map((id) => {
      const mv = data.moves[id];
      if (!mv) return "";
      return `<span class="tm-move" style="--tc:${TYPE_COLORS[mv.type] || "#555"}">
        <span class="tm-move-name">${mv.name}</span>
        <button class="tm-move-x" data-move-remove="${id}" data-slug="${mon.slug}" aria-label="Remove move">✕</button></span>`;
    }).join("");
    const addMove = moveIds.length < 4
      ? `<div class="ac-wrap tm-move-addwrap"><input class="tm-move-add" data-slug="${mon.slug}" placeholder="+ add move…" autocomplete="off"></div>`
      : "";
    return `<div class="team-member">
      <div class="tm-head" data-open="${mon.slug}" title="Open details">
        <img class="tm-spr" src="${mon.sprite || mon.artwork || ""}" alt="">
        <div class="tm-info"><span class="tm-name">${nameOf(mon)}</span>
          <span class="types">${mon.types.map(typePill).join("")}</span></div>
        <button class="team-remove" data-team-remove="${mon.slug}" aria-label="Remove">✕</button>
      </div>
      <div class="tm-moves">${chips}${addMove}</div>
    </div>`;
  }).join("") || `<p class="team-empty">No Pokémon yet — add up to ${TEAM_MAX} above to analyse the team.</p>`;

  const head = `<div class="team-head"><h2>Team Builder</h2>
    <p class="calc-note">Add up to 6 Pokémon (give each a moveset), analyse coverage, and save multiple teams. Your working team is kept automatically.</p></div>`;

  if (!team.length) {
    container.innerHTML = `<div class="team">${head}${manager}${addRow}<div class="team-members">${members}</div></div>`;
    return;
  }

  const mons = team.map((t) => t.mon);

  // --- defensive matrix ---
  const rows = TYPES.map((atk) => {
    const cells = mons.map((m) => m.types.reduce((x, t) => x * (chart[atk]?.[t] ?? 1), 1));
    const weak = cells.filter((v) => v > 1).length;
    const resist = cells.filter((v) => v < 1).length;
    return { atk, cells, weak, resist };
  }).sort((a, b) => b.weak - a.weak || a.resist - b.resist || TYPES.indexOf(a.atk) - TYPES.indexOf(b.atk));

  const matrix = `<table class="team-matrix"><thead><tr><th>Type</th>
    ${mons.map((m) => `<th><img src="${m.sprite || m.artwork || ""}" alt="" title="${nameOf(m)}"></th>`).join("")}
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

  // --- offensive coverage: from each member's damaging moves, STAB where none set ---
  let usesMoves = false;
  const attackTypes = new Set();
  for (const { mon, moveIds } of team) {
    const dmg = [...new Set(moveIds.map((id) => data.moves[id])
      .filter((mv) => mv && mv.class !== "status" && mv.type).map((mv) => mv.type))];
    if (dmg.length) usesMoves = true;
    (dmg.length ? dmg : mon.types).forEach((t) => attackTypes.add(t));
  }
  const covered = TYPES.filter((d) => [...attackTypes].some((a) => (chart[a]?.[d] ?? 1) >= 2));
  const notCovered = TYPES.filter((d) => !covered.includes(d));
  const covNote = usesMoves ? "from selected moves (STAB where none set)" : "(STAB — add moves for exact coverage)";

  // --- speed tiers ---
  const bySpeed = [...mons].sort((a, b) => b.stats.spe - a.stats.spe);
  const speedList = bySpeed.map((m) => {
    const lv = statsFor(m, "lv50").spe;
    return `<div class="spd-row spd-${speedTier(m.stats.spe)}" data-slug="${m.slug}">
      <span class="spd-name">${nameOf(m)}</span>
      <span class="spd-val">${m.stats.spe}<small> base · ${lv} @50</small></span></div>`;
  }).join("");

  // --- role / balance ---
  const roles = mons.map((m) => roleOf(m));
  const count = (r) => roles.filter((x) => x === r).length;
  const slow = mons.filter((m) => m.stats.spe <= 55).length;
  const nudges = [];
  if (!roles.some((r) => r === "special" || r === "mixed")) nudges.push("No special attacker");
  if (!roles.some((r) => r === "physical" || r === "mixed")) nudges.push("No physical attacker");
  if (!roles.includes("defensive")) nudges.push("No defensive wall");
  if (slow >= Math.ceil(mons.length * 0.7)) nudges.push(`${slow}/${mons.length} are slow (≤55 base)`);
  const roleChips = Object.entries(ROLE_LABELS).map(([k, l]) =>
    `<span class="role-tally"><b>${count(k)}</b> ${l}</span>`).join("");

  container.innerHTML = `<div class="team">
    ${head}${manager}${addRow}
    <div class="team-members">${members}</div>
    <div class="team-grid">
      <section class="team-card team-def">
        <h3>Defensive coverage <small>— how each member takes hits of every type</small></h3>
        ${callout}
        ${matrix}
        <div class="tm-legend"><span class="tm-cell weak2">×4</span><span class="tm-cell weak">×2</span><span class="tm-cell neu">×1</span><span class="tm-cell res">×½</span><span class="tm-cell res2">×¼</span><span class="tm-cell x0">×0</span></div>
      </section>
      <div class="team-col">
        <section class="team-card">
          <h3>Offensive coverage <small>${covNote}</small></h3>
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
