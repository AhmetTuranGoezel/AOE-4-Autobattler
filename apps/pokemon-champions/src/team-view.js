// Team Builder: pick up to 6 Pokémon (each with an optional 4-move set), save/load
// multiple teams, and see defensive weaknesses, offensive coverage (from the chosen
// moves), speed tiers and role balance. Pure render — app owns state + persistence
// and attaches the add/move autocompletes after each render.
import { TYPES, TYPE_COLORS, displayName } from "./data.js";
import { statsFor, roleOf, speedTier } from "./effective-stats.js";
import { rosterAbilities } from "./type-defense.js";
import {
  buildDefensiveProfile, buildOffensiveProfile, rankTypingRecommendations,
} from "./team-analysis.js";

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

function renderRecommendationList(items) {
  if (!items.length) return `<p class="muted fit-empty">No available typings remain outside this roster.</p>`;
  return `<ol class="fit-list">${items.map((item, index) => {
    const { mon, bench } = item.representative;
    const alternatives = item.matches.filter((match) => match.mon.slug !== mon.slug);
    const scoreText = item.score > 0
      ? `+${Number(item.score.toFixed(1))} pts`
      : item.score === 0 ? "neutral" : `${Number(item.score.toFixed(1))} pts`;
    return `<li class="fit-item">
      <div class="fit-heading">
        <span class="fit-rank">${index + 1}</span>
        <span class="types fit-types">${item.types.map(typePill).join("")}</span>
        <span class="fit-score ${item.score > 0 ? "positive" : item.score < 0 ? "negative" : ""}"
          title="Relative team-fit improvement, not a Pokemon viability score">${scoreText}</span>
      </div>
      <div class="fit-rep">
        <button class="fit-rep-main" data-open="${mon.slug}" title="Open ${nameOf(mon)} details">
          <img src="${mon.sprite || mon.artwork || ""}" alt="">
          <span><strong>${nameOf(mon)}</strong><small>${item.roleLabel} · ${item.moveSource}</small></span>
        </button>
        <span class="fit-ability" title="Ability assumed by this recommendation">${item.abilityName}</span>
        ${bench ? '<span class="fit-bench">already on your bench</span>' : ""}
      </div>
      ${item.toolkit.length ? `<div class="fit-toolkit">${item.toolkit.slice(0, 4).map((tool) =>
        `<span class="fit-tool" title="From ${tool.source}">${tool.label}</span>`).join("")}</div>` : ""}
      <ul class="fit-reasons">${item.reasons.map((reason) => `<li>${reason}</li>`).join("")}</ul>
      ${item.warnings.length ? `<ul class="fit-warnings">${item.warnings.map((warning) => `<li>${warning}</li>`).join("")}</ul>` : ""}
      ${alternatives.length ? `<details class="fit-matches">
        <summary>${alternatives.length} other Pokemon with this typing</summary>
        <div class="fit-mon-list">${alternatives.map(({ mon: alternative, bench: alternativeBench }) =>
          `<button data-open="${alternative.slug}" title="Open ${nameOf(alternative)} details">
            <img src="${alternative.sprite || alternative.artwork || ""}" alt="">${nameOf(alternative)}
            ${alternativeBench ? '<span class="fit-bench">on your bench</span>' : ""}
          </button>`).join("")}</div>
      </details>` : ""}
    </li>`;
  }).join("")}</ol>`;
}

export function renderTeamView(container, {
  data, team, savedTeams = [], notice = "", share = null, analysisScope = "full",
}) {
  const chart = data.typeChart;
  const bySlug = new Map(data.pokemon.map((m) => [m.slug, m]));
  const pickedCount = team.filter((member) => member.picked).length;
  const battleTeam = team.filter((member) => member.picked).slice(0, 4);
  const analysisTeam = analysisScope === "battle" ? battleTeam : team;

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
        <button class="tm-share" data-share-team="${t.id}" aria-label="Share team" title="Copy a share link — opening it imports this team anywhere">⤴</button>
        <button class="tm-del" data-del-team="${t.id}" aria-label="Delete team" title="Delete">✕</button>
      </div>`).join("")
    : `<p class="muted tm-none">No saved teams yet — build one below and press Save.</p>`;

  const manager = `<div class="team-manager">
    <div class="tm-save">
      <input class="team-name" placeholder="Team name…" maxlength="30" autocomplete="off">
      <button class="btn-sm" data-save-team ${team.length ? "" : "disabled"}>Save</button>
      <button class="btn-sm" data-new-team ${team.length ? "" : "disabled"} title="Clear the current team">Clear team</button>
      <button class="btn-sm" data-share-working ${team.length ? "" : "disabled"} title="Get a short share link — opening it imports the team on any browser/PC">⤴ Share</button>
      <input class="tm-import" placeholder="Import: paste a link or code…" autocomplete="off" spellcheck="false">
    </div>
    ${share ? `<div class="tm-share-pop">
      <div class="tm-share-head"><b>Share “${share.name}”</b><button class="tc-detail-x" data-share-close aria-label="Close">✕</button></div>
      <div class="tm-share-row">
        <input class="tm-share-link" readonly value="${share.url}" onclick="this.select()">
        <button class="btn accent" data-share-copy>Copy link</button>
      </div>
      <small class="muted">Anyone opening this link gets the team imported automatically — works on any browser or PC.</small>
    </div>` : ""}
    ${notice ? `<div class="tm-notice">${notice}</div>` : ""}
    <div class="tm-saved">${savedRows}</div>
  </div>`;

  const addRow = `<div class="team-add-row">
    <div class="ac-wrap">
      <input class="team-add" placeholder="Add a Pokémon…" autocomplete="off" ${team.length >= TEAM_MAX ? "disabled" : ""}>
    </div>
    <span class="team-count">${team.length} / ${TEAM_MAX}</span>
  </div>`;

  // --- member cards (sprite + types + ability + moveset) ---
  const members = team.map(({ mon, moveIds, ability, picked }) => {
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
    // Team fit uses the actual selected ability for immunities, mitigation and support.
    const abilities = rosterAbilities(mon);
    const abilSel = abilities.length ? `<div class="tm-abil" title="Used by defensive coverage and team-fit recommendations">
      <span class="tm-abil-label">Ability</span>
      <button class="tm-abil-chip ${ability == null ? "on" : ""}" data-set-ability="null" data-slug="${mon.slug}">None assumed</button>
      ${abilities.map((slug) => `<button class="tm-abil-chip ${ability === slug ? "on" : ""}" data-set-ability="${slug}" data-slug="${mon.slug}" title="Use this ability for team analysis">${(data.abilities[slug] || {}).name || slug}</button>`).join("")}
    </div>` : "";
    const pickDisabled = !picked && pickedCount >= 4;
    return `<div class="team-member ${picked ? "battle-picked" : "battle-benched"}">
      <div class="tm-battle-row">
        <button class="tm-battle-pick ${picked ? "on" : ""}" data-battle-pick="${mon.slug}"
          aria-pressed="${picked ? "true" : "false"}" ${pickDisabled ? "disabled" : ""}
          aria-label="${picked ? `Remove ${nameOf(mon)} from Battle Four` : `Select ${nameOf(mon)} for Battle Four`}"
          title="${pickDisabled ? "Four Pokemon are already selected" : picked ? "Move to bench" : "Select for Battle Four"}">
          <span class="tm-pick-dot" aria-hidden="true"></span>${picked ? "Battle pick" : "Bench"}
        </button>
      </div>
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
    <p class="calc-note">Up to 6 Pokémon with movesets — coverage and speed update live. Saved automatically.</p></div>`;

  const analysisBar = team.length ? `<div class="team-analysis-bar">
    <div class="team-analysis-copy">
      <span class="team-analysis-label">Analyze roster</span>
      <small>${analysisScope === "battle" ? "All panels use the selected battle squad." : "All panels use every team member."}</small>
    </div>
    <div class="seg team-scope" role="group" aria-label="Team analysis roster">
      <button data-team-scope="full" class="${analysisScope === "full" ? "active" : ""}" aria-pressed="${analysisScope === "full"}">Full Team</button>
      <button data-team-scope="battle" class="${analysisScope === "battle" ? "active" : ""}" aria-pressed="${analysisScope === "battle"}" ${pickedCount ? "" : "disabled"}>Battle Four</button>
    </div>
    <span class="team-pick-count ${pickedCount === 4 ? "complete" : ""}" aria-live="polite">${pickedCount}/4 selected</span>
  </div>` : "";

  if (!team.length) {
    container.innerHTML = `<div class="team">${head}${manager}${addRow}${analysisBar}<div class="team-members">${members}</div></div>`;
    return;
  }

  if (!analysisTeam.length) {
    container.innerHTML = `<div class="team">${head}${manager}${addRow}${analysisBar}
      <div class="team-members">${members}</div>
      <div class="team-card team-analysis-empty">Select one to four Battle picks to analyze this squad.</div>
    </div>`;
    return;
  }

  const mons = analysisTeam.map((t) => t.mon);

  // --- defensive matrix (ability-aware: Levitate → Ground ×0, Thick Fat → ½ Fire/Ice, …) ---
  const rows = buildDefensiveProfile(analysisTeam, chart).rows
    .map((row) => ({
      atk: row.attackType,
      cells: row.cells,
      weak: row.weakCount,
      resist: row.resistCount,
    }))
    .sort((a, b) => b.weak - a.weak || a.resist - b.resist || TYPES.indexOf(a.atk) - TYPES.indexOf(b.atk));

  const matrix = `<div class="team-matrix-scroll"><table class="team-matrix"><thead><tr><th>Type</th>
    ${mons.map((m) => `<th><img src="${m.sprite || m.artwork || ""}" alt="" title="${nameOf(m)}"></th>`).join("")}
    <th class="tm-tally" title="Members weak to this type">weak</th><th class="tm-tally" title="Members that resist or are immune to this type">res</th></tr></thead><tbody>
    ${rows.map((r) => `<tr>
      <td class="tm-type">${typePill(r.atk)}</td>
      ${r.cells.map((v) => { const e = effInfo(v); return `<td class="tm-cell ${e.cls}">${e.txt}</td>`; }).join("")}
      <td class="tm-tally ${r.weak >= 3 ? "hot" : ""}">${r.weak || ""}</td>
      <td class="tm-tally ${r.resist >= 3 ? "good" : ""}">${r.resist || ""}</td>
    </tr>`).join("")}
  </tbody></table></div>`;

  const topWeak = rows.filter((r) => r.weak >= 2).slice(0, 4)
    .map((r) => `${r.atk[0].toUpperCase() + r.atk.slice(1)} (${r.weak})`).join(" · ");
  const callout = topWeak
    ? `<div class="team-callout warn">⚠ Shared weaknesses: ${topWeak}</div>`
    : `<div class="team-callout ok">✓ No type weakness shared by 2+ members.</div>`;

  // --- offensive coverage MATRIX: defending types × members, from SELECTED damaging
  // moves only. Each super-effective cell is marked ★ when it comes from a STAB move
  // (move type ∈ the member's types) vs a plain coverage move. No STAB fallback.
  const offensiveProfile = buildOffensiveProfile(analysisTeam, chart, data.moves);
  const anyDamaging = offensiveProfile.hasDamagingMoves;
  const offRows = offensiveProfile.rows.map((row) => ({
    def: row.defendingType,
    cells: row.cells.map((cell) => ({
      cat: cell.category === "neutral" ? "neu"
        : cell.category === "resisted" ? "res"
          : cell.category === "immune" ? "zero" : cell.category,
      mult: cell.mult,
      stab: cell.stab,
      name: cell.move?.name,
      mon: cell.mon,
    })),
    tally: row.superEffectiveMembers,
    canNeutral: row.canDealNeutral,
  })).sort((a, b) => b.tally - a.tally || (b.canNeutral - a.canNeutral) || TYPES.indexOf(a.def) - TYPES.indexOf(b.def));

  const offMatrix = `<div class="team-matrix-scroll"><table class="team-matrix team-off"><thead><tr><th>Type</th>
    ${mons.map((m) => `<th><img src="${m.sprite || m.artwork || ""}" alt="" title="${nameOf(m)}"></th>`).join("")}
    <th class="tm-tally">SE</th></tr></thead><tbody>
    ${offRows.map((r) => `<tr>
      <td class="tm-type ${r.tally ? "" : (r.canNeutral ? "co-gap" : "co-wall")}">${typePill(r.def)}</td>
      ${r.cells.map((c) => {
        if (c.cat === "se") {
          const cls = c.stab ? "co-stab" : "co-cover";
          return `<td class="tm-cell ${cls}" title="${nameOf(c.mon)} · ${c.name} (${c.stab ? "STAB" : "coverage"}) ×${c.mult}">${(c.stab ? "★" : "") + (c.mult >= 4 ? "4" : "2")}</td>`;
        }
        if (c.cat === "neu") return `<td class="tm-cell co-neu" title="${nameOf(c.mon)} · ${c.name} ×1 — normal damage">1</td>`;
        if (c.cat === "res") return `<td class="tm-cell co-res" title="${nameOf(c.mon)} · ${c.name} ×${c.mult} — only reduced damage">${c.mult === 0.25 ? "¼" : "½"}</td>`;
        return `<td class="tm-cell co-none" title="${c.name ? `${nameOf(c.mon)} · ${c.name} ×0 — no effect` : "no damaging move for this type"}">·</td>`;
      }).join("")}
      <td class="tm-tally ${r.tally ? "" : (r.canNeutral ? "hot" : "wall")}">${r.tally || (r.canNeutral ? "⚠" : "⛔")}</td>
    </tr>`).join("")}
  </tbody></table></div>
  <div class="tm-legend co-legend"><span class="tm-cell co-stab">★2</span> STAB
    <span class="tm-cell co-cover">2</span> coverage
    <span class="tm-cell co-neu">1</span> neutral
    <span class="tm-cell co-res">½</span> reduced only
    <span class="co-dim">· = can't</span></div>`;

  const cap = (g) => g[0].toUpperCase() + g.slice(1);
  const teamBest = (r) => Math.max(0, ...r.cells.map((c) => c.mult || 0));            // best multiplier ANY member reaches
  const reducedOnly = offRows.filter((r) => !r.canNeutral && teamBest(r) > 0).map((r) => r.def);  // best case is not-very-effective
  const noDamage = offRows.filter((r) => !r.canNeutral && teamBest(r) === 0).map((r) => r.def);    // nothing on the team even touches it
  const seGapTypes = offRows.filter((r) => r.canNeutral && !r.tally).map((r) => r.def);
  const covParts = [];
  if (reducedOnly.length) covParts.push(`<div class="team-callout bad cov-gap">⛔ Only reduced damage vs: ${reducedOnly.map(cap).join(" · ")}</div>`);
  if (noDamage.length) covParts.push(`<div class="team-callout bad cov-gap">🚫 Can't damage at all: ${noDamage.map(cap).join(" · ")}</div>`);
  if (seGapTypes.length) covParts.push(`<div class="team-callout warn cov-gap">⚠ No super-effective answer to: ${seGapTypes.map(cap).join(" · ")}</div>`);
  if (!covParts.length) covParts.push(`<div class="team-callout ok">✓ Something on the team hits every type super-effectively.</div>`);
  const covGap = covParts.join("");

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

  const recommendations = rankTypingRecommendations({
    data,
    activeTeam: analysisTeam,
    fullTeam: team,
    limit: 5,
  });
  const recommendationPanel = `<section class="team-card team-recommendations">
    <div class="fit-head">
      <div><h3>Best complete additions</h3>
        <p>Actual Pokemon are tested with legal abilities, likely moves, useful team roles, bulk, and the new shared weaknesses they create. Typings stay grouped for easier comparison.</p></div>
      <span class="fit-pool">${recommendations.candidatePokemonCount} Pokemon · ${recommendations.candidateCount} typings</span>
    </div>
    <div class="fit-grid">
      <div class="fit-column">
        <h4>Defensive Fit <small>ability-aware switch safety, with useful pressure or support still required</small></h4>
        ${renderRecommendationList(recommendations.defensive)}
      </div>
      <div class="fit-column">
        <h4>Role &amp; Pressure Fit <small>damage, support, status, and setup without opening an easy shared weakness</small></h4>
        ${recommendations.hasDamagingMoves ? "" : '<p class="fit-note">No damaging moves are selected yet. Candidate pressure uses likely moves, while utility and defensive safety still count.</p>'}
        ${renderRecommendationList(recommendations.offensive)}
      </div>
    </div>
  </section>`;

  container.innerHTML = `<div class="team">
    ${head}${manager}${addRow}${analysisBar}
    <div class="team-members">${members}</div>
    ${recommendationPanel}
    <div class="team-grid">
      <div class="team-col team-col-matrix">
        <section class="team-card team-def">
          <h3>Defensive coverage <small>— how each member takes hits of every type</small></h3>
          ${callout}
          ${matrix}
          <div class="tm-legend"><span class="tm-cell weak2">×4</span><span class="tm-cell weak">×2</span><span class="tm-cell neu">×1</span><span class="tm-cell res">×½</span><span class="tm-cell res2">×¼</span><span class="tm-cell x0">×0</span></div>
        </section>
        <section class="team-card team-off-card">
          <h3>Offensive coverage <small>— best hit each member lands on every type (★ = STAB · ½ = only reduced damage)</small></h3>
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
