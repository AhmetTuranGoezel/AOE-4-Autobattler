// Team Builder: pick up to 6 Pokémon (each with an optional 4-move set), save/load
// multiple teams, and see defensive weaknesses, offensive coverage (from the chosen
// moves), speed tiers and role balance. Pure render — app owns state + persistence
// and attaches the add/move autocompletes after each render.
import { TYPES, TYPE_COLORS, displayName } from "./data.js";
import { statsFor, roleOf, speedTier } from "./effective-stats.js";
import { typingAbilities, applyAbility } from "./type-defense.js";

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

  // --- member cards (sprite + types + ability + moveset) ---
  const members = team.map(({ mon, moveIds, ability }) => {
    const chips = moveIds.map((id) => {
      const mv = data.moves[id];
      if (!mv) return "";
      const pow = mv.power != null ? mv.power : (mv.class === "status" ? "" : "~");
      return `<span class="tm-move" data-move-info="${id}" style="--tc:${TYPE_COLORS[mv.type] || "#555"}" title="${mv.name} · ${mv.type || ""} · ${mv.class} · view details">
        <span class="tm-move-name">${mv.name}</span>${pow !== "" ? `<small class="tm-move-pow">${pow}</small>` : ""}
        <button class="tm-move-x" data-move-remove="${id}" data-slug="${mon.slug}" aria-label="Remove move">✕</button></span>`;
    }).join("");
    const addMove = moveIds.length < 4
      ? `<div class="ac-wrap tm-move-addwrap"><input class="tm-move-add" data-slug="${mon.slug}" placeholder="+ add move…" autocomplete="off"></div>`
      : "";
    // ability selector — only when a member has an ability that changes type effectiveness
    const tas = typingAbilities(mon);
    const abilSel = tas.length ? `<div class="tm-abil" title="Affects how this Pokémon takes damage">
      <button class="tm-abil-chip ${ability == null ? "on" : ""}" data-set-ability="null" data-slug="${mon.slug}">Types only</button>
      ${tas.map((slug) => `<button class="tm-abil-chip ${ability === slug ? "on" : ""}" data-set-ability="${slug}" data-slug="${mon.slug}">${(data.abilities[slug] || {}).name || slug}</button>`).join("")}
    </div>` : "";
    return `<div class="team-member">
      <div class="tm-head" data-open="${mon.slug}" title="Open details">
        <img class="tm-spr" src="${mon.sprite || mon.artwork || ""}" alt="">
        <div class="tm-info"><span class="tm-name">${nameOf(mon)}</span>
          <span class="types">${mon.types.map(typePill).join("")}</span></div>
        <button class="team-remove" data-team-remove="${mon.slug}" aria-label="Remove">✕</button>
      </div>
      ${abilSel}
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

  // --- defensive matrix (ability-aware: Levitate → Ground ×0, Thick Fat → ½ Fire/Ice, …) ---
  const rows = TYPES.map((atk) => {
    const cells = team.map(({ mon, ability }) =>
      applyAbility(mon.types.reduce((x, t) => x * (chart[atk]?.[t] ?? 1), 1), atk, ability));
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

  // --- offensive coverage MATRIX: defending types × members, from SELECTED damaging
  // moves only. Each super-effective cell is marked ★ when it comes from a STAB move
  // (move type ∈ the member's types) vs a plain coverage move. No STAB fallback.
  const offContrib = team.map(({ mon, moveIds }) => ({
    mon,
    dmg: moveIds.map((id) => data.moves[id]).filter((mv) => mv && mv.class !== "status" && mv.type),
  }));
  const anyDamaging = offContrib.some((c) => c.dmg.length);

  const offRows = TYPES.map((def) => {
    const cells = offContrib.map(({ mon, dmg }) => {
      const se = dmg.filter((mv) => (chart[mv.type]?.[def] ?? 1) >= 2);
      if (!se.length) return { mult: 0 };
      const mult = Math.max(...se.map((mv) => chart[mv.type][def]));
      const stabMv = se.find((mv) => mon.types.includes(mv.type));
      const bestMv = stabMv || se.slice().sort((a, b) => chart[b.type][def] - chart[a.type][def])[0];
      return { mult, stab: !!stabMv, name: bestMv.name, mon };
    });
    const tally = cells.filter((c) => c.mult >= 2).length;
    return { def, cells, tally };
  }).sort((a, b) => b.tally - a.tally || TYPES.indexOf(a.def) - TYPES.indexOf(b.def));

  const offMatrix = `<table class="team-matrix team-off"><thead><tr><th>Type</th>
    ${mons.map((m) => `<th><img src="${m.sprite || m.artwork || ""}" alt="" title="${nameOf(m)}"></th>`).join("")}
    <th class="tm-tally">SE</th></tr></thead><tbody>
    ${offRows.map((r) => `<tr>
      <td class="tm-type ${r.tally ? "" : "co-gap"}">${typePill(r.def)}</td>
      ${r.cells.map((c) => {
        if (!c.mult) return `<td class="tm-cell co-none">·</td>`;
        const cls = c.stab ? "co-stab" : "co-cover";
        const txt = (c.stab ? "★" : "") + (c.mult >= 4 ? "4" : "2");
        return `<td class="tm-cell ${cls}" title="${nameOf(c.mon)} · ${c.name} (${c.stab ? "STAB" : "coverage"}) ×${c.mult}">${txt}</td>`;
      }).join("")}
      <td class="tm-tally ${r.tally ? "" : "hot"}">${r.tally || "⚠"}</td>
    </tr>`).join("")}
  </tbody></table>
  <div class="tm-legend co-legend"><span class="tm-cell co-stab">★2</span> STAB
    <span class="tm-cell co-cover">2</span> coverage <span class="co-dim">· = can't</span></div>`;

  const offGapTypes = offRows.filter((r) => !r.tally).map((r) => r.def);
  const covGap = offGapTypes.length
    ? `<div class="team-callout warn cov-gap">⚠ No super-effective answer to: ${offGapTypes.map((g) => g[0].toUpperCase() + g.slice(1)).join(" · ")}</div>`
    : `<div class="team-callout ok">✓ Something on the team hits every type super-effectively.</div>`;

  const offBody = anyDamaging
    ? `${covGap}${offMatrix}`
    : `<p class="cov-help cov-empty">Add damaging moves to your team to see super-effective coverage.</p>`;

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
      <div class="team-col team-col-matrix">
        <section class="team-card team-def">
          <h3>Defensive coverage <small>— how each member takes hits of every type</small></h3>
          ${callout}
          ${matrix}
          <div class="tm-legend"><span class="tm-cell weak2">×4</span><span class="tm-cell weak">×2</span><span class="tm-cell neu">×1</span><span class="tm-cell res">×½</span><span class="tm-cell res2">×¼</span><span class="tm-cell x0">×0</span></div>
        </section>
        <section class="team-card team-off-card">
          <h3>Offensive coverage <small>— which types each member hits super-effectively (★ = via a STAB move)</small></h3>
          ${offBody}
        </section>
      </div>
      <div class="team-col">
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
