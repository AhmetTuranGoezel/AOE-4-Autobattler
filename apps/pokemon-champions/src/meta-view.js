// Presentation only. Aggregate usage, captured evidence and import mapping stay separate.
import { teamsForPokemon, groupTeammates, mapTournamentTeam } from "./meta-model.js";
import { escapeHtml as esc, SET_STATS, NATURE_MODS, canonicalSlug } from "./set-model.js";
import { itemLabel, ITEMS } from "./item-model.js";
import { displayName, TYPE_COLORS } from "./data.js";

const labels = { hp: "HP", atk: "Atk", def: "Def", spa: "SpA", spd: "SpD", spe: "Spe" };
const natureName = id => id ? id[0].toUpperCase() + id.slice(1) : "Unavailable";
const natureLabel = id => `${natureName(id)}${NATURE_MODS[id] ? ` (+${labels[NATURE_MODS[id][0]]} / −${labels[NATURE_MODS[id][1]]})` : ""}`;
const safeUrl = s => /^https:\/\//.test(s || "") ? esc(s) : "#";
const date = s => s ? esc(s.slice(0, 10)) : "Not supplied";
const prettyDate = s => s ? new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "Date unavailable";
const spreadKey = stats => SET_STATS.map(k => stats[k]).join("/");
const pctWidth = n => Math.max(0, Math.min(100, Number(n) || 0));

function help(id, label, text) {
  return `<button class="meta-info" popovertarget="${id}" aria-label="About ${esc(label)}" title="About ${esc(label)}">i</button><div class="meta-help" id="${id}" popover><h3>${esc(label)}</h3><p>${esc(text)}</p><button class="btn-sm" popovertarget="${id}" popovertargetaction="hide">Got it</button></div>`;
}

function portrait(mon, name, large = false) {
  const src = large ? mon?.artwork || mon?.sprite : mon?.sprite || mon?.artwork;
  return `<span class="meta-avatar${large ? " art" : ""}${src ? "" : " unavailable"}"${!src ? ` role="img" aria-label="${esc(name)} — image unavailable"` : ""}>${src ? `<img src="${safeUrl(src)}" alt="${esc(name)}" loading="lazy" decoding="async" onerror="this.hidden=true;this.parentElement.classList.add('unavailable')">` : ""}</span>`;
}

function statPoints(stats) {
  return `<div class="meta-stat-points" aria-label="Stat Points">${SET_STATS.map(k => `<span class="${stats[k] ? "invested" : ""}"><small>${labels[k]}</small><b>${stats[k]}</b></span>`).join("")}</div>`;
}

// Exact six-stat equality only. Captured counts never inherit an aggregate denominator.
export function presentBuilds(entry) {
  const observed = entry.observedSpreads || [], seen = new Set();
  const builds = (entry.spreads || []).map((row, index) => {
    const key = spreadKey(row.stats), jointIndex = observed.findIndex(j => spreadKey(j.stats) === key);
    seen.add(key);
    return { stats: row.stats, percent: row.percent, index, jointIndex, evidence: observed[jointIndex] || null };
  });
  observed.forEach((row, jointIndex) => {
    if (!seen.has(spreadKey(row.stats))) builds.push({ stats: row.stats, percent: null, index: null, jointIndex, evidence: row });
  });
  return builds;
}

function buildCard(build, rank) {
  const { evidence, jointIndex } = build, natures = evidence?.natures || [];
  const use = natures.length === 1
    ? `<button class="btn-sm meta-use-build" data-meta-joint="${jointIndex}" data-meta-nature="${esc(natures[0].id)}">Use build ↗</button>`
    : build.index != null ? `<button class="btn-sm meta-use-build" data-meta-spread="${build.index}">Use points ↗</button>` : "";
  return `<article class="meta-build-card" data-build-card>
    <div class="meta-build-top"><span class="meta-eyebrow">Build ${String(rank + 1).padStart(2, "0")}</span>${build.percent != null ? `<span class="meta-build-share"><b>${build.percent}%</b><small>aggregate usage</small></span>` : '<span class="meta-captured-only">Captured sets only</span>'}</div>
    ${statPoints(build.stats)}
    <div class="meta-build-evidence">${natures.length ? `<span class="meta-evidence-label">Captured Nature evidence</span><div class="meta-nature-evidence">${natures.map(n => `<span title="${esc(natureLabel(n.id))}; ${n.count} of ${evidence.count} captured sets with this exact spread"><b>${esc(natureName(n.id))}</b><span>${n.count}/${evidence.count}</span>${natures.length > 1 ? `<button class="btn-sm" data-meta-joint="${jointIndex}" data-meta-nature="${esc(n.id)}" aria-label="Use ${esc(natureName(n.id))} build">Use</button>` : ""}</span>`).join("")}</div><small>${evidence.count} matching sets · separate from aggregate sample</small>` : '<span class="meta-nature-missing">Nature: unavailable from captured sets</span>'}</div>
    <div class="meta-build-footer"><span>${natures.length === 1 ? esc(natureLabel(natures[0].id)) : "Exact six-stat points"}</span>${use}</div>
  </article>`;
}

function renderBuilds(entry, limits, preview) {
  const builds = presentBuilds(entry), count = preview ? 2 : limits.spreads || 4;
  return `<section class="meta-builds"><div class="meta-section-head"><div><h3>${preview ? "Popular builds" : "Observed builds"}</h3><p>Exact Stat Points, with captured Nature evidence alongside.</p></div>${preview ? '<button class="meta-text-button" data-detail-tab="builds">All builds & Stat Lab ↗</button>' : help("build-evidence-help", "Build evidence", `${entry.observedSpreadScope || "Only captured sets with an exact spread and explicit Nature."} Aggregate usage and captured sets have different denominators. Nature counts refer only to matching captured sets, not the aggregate sample. A missing Nature is never inferred from overall usage.`)}</div>
    <div class="meta-build-grid">${builds.slice(0, count).map(buildCard).join("") || '<p class="meta-empty">No complete spreads captured. You can still build your own in the Stat Lab.</p>'}</div>
    ${!preview && builds.length > count ? `<button class="btn-sm meta-more" data-meta-more="spreads" data-meta-next="${count + 4}">Show more builds <span>${count} / ${builds.length}</span></button>` : ""}</section>`;
}

function datasetHeader(entry, data, dataset) {
  const methodology = `PokéBase snapshot, separate from static mechanics and ranked eligibility. Fetched ${date(entry?.fetchedAt || dataset.fetchedAt)}. Source update time: ${date(entry?.sourceUpdatedAt || dataset.sourceUpdatedAt)}. Full source sample size: ${dataset.sampleSize ?? "not supplied"}. Captured team dates: ${date(dataset.capturedDateRange?.[0])} to ${date(dataset.capturedDateRange?.[1])}; not the source's full date range. ${entry?.coverage?.teams || dataset.scope || ""}`;
  return `<div class="meta-sourcebar"><label>Regulation <select class="cl-sel" data-meta-regulation aria-label="Meta regulation">${Object.keys(data.tournamentMeta.datasets).map(r => `<option ${r === data.metaRegulation ? "selected" : ""}>${esc(r)}</option>`).join("")}</select></label><span class="meta-snapshot-date">Snapshot <time datetime="${esc(entry?.fetchedAt || dataset.fetchedAt)}">${prettyDate(entry?.fetchedAt || dataset.fetchedAt)}</time></span><a href="${safeUrl(entry?.source || dataset.source)}" target="_blank" rel="noopener noreferrer">PokéBase ↗</a>${help("meta-source-help", "Snapshot & source", methodology)}</div>`;
}

function category(key, label, note, entry, data, limits) {
  const list = entry[key] || [], count = limits[key] || 4;
  const moveIds = new Map(Object.entries(data.moves).map(([id, m]) => [canonicalSlug(m.name), id]));
  return `<section class="meta-category" data-meta-category="${key}"><div class="meta-section-head"><h3>${label}</h3>${help(`meta-${key}-help`, label, note)}</div><div class="meta-bars">${list.slice(0, count).map(row => {
    const id = key === "moves" ? moveIds.get(row.id) : null, type = id != null ? data.moves[id].type : null;
    const name = id != null ? `<button class="use-name use-link" data-move-info="${id}">${esc(row.name)}</button>` : `<span class="use-name" title="${esc(key === "natures" ? natureLabel(row.id) : row.name)}">${esc(row.name)}</span>`;
    return `<div class="use-item">${type ? `<i class="meta-type-dot" style="--move-type:${TYPE_COLORS[type]}" title="${esc(type)}"></i>` : ""}${name}<span class="use-pct">${row.percent}%</span><span class="meta-bar-track"><i class="use-fill" style="width:${pctWidth(row.percent)}%"></i></span></div>`;
  }).join("") || '<p class="meta-empty">Not supplied</p>'}</div>${list.length > count ? `<button class="meta-text-button meta-more" data-meta-more="${key}" data-meta-next="${count + 5}">Show more <span>${count} / ${list.length}</span></button>` : ""}</section>`;
}

function renderTeammates(entry, data, limits, dataset) {
  const groups = groupTeammates(entry.teammates), count = limits.teammates || 6;
  return `<section class="meta-teammates"><div class="meta-section-head"><h3>Common teammates</h3>${help("meta-teammates-help", "Common teammates", dataset.denominators.teammates)}</div><div class="meta-teammate-grid">${groups.slice(0, count).map(group => {
    const row = group.base || group.forms[0], mon = data.pokemon.find(m => m.slug === row.id);
    return `<div class="meta-teammate">${portrait(mon, row.name)}<div><span class="meta-teammate-name">${esc(row.name)}</span>${group.forms.length && group.base ? `<small title="Overlapping base/Mega rows; never added together">${group.forms.map(f => `${esc(f.name)} ${f.percent}%`).join(" · ")}</small>` : ""}</div><b>${row.percent}%</b></div>`;
  }).join("") || '<p class="meta-empty">No teammate sample captured.</p>'}</div>${groups.length > count ? `<button class="meta-text-button meta-more" data-meta-more="teammates" data-meta-next="${count + 6}">Show more teammates <span>${count} / ${groups.length}</span></button>` : ""}</section>`;
}

const setMon = (set, data) => data.pokemon.find(m => m.slug === set.form);
const setName = (set, data) => { const mon = setMon(set, data); return mon ? displayName(mon) : set.sourceNames?.pokemon || set.form; };
const record = team => team.record?.wins != null ? `${team.record.wins}–${team.record.losses}${team.record.ties ? `–${team.record.ties}` : ""}` : null;

function teamLineup(team, data, interactive = false) {
  return `<div class="meta-lineup${interactive ? " interactive" : ""}" aria-label="Six Pokémon">${team.members.map((set, index) => {
    const name = setName(set, data), content = `${portrait(setMon(set, data), name)}<span>${esc(name)}</span>`;
    return interactive ? `<button class="meta-lineup-slot" data-meta-set-target="${index}" aria-label="View ${esc(name)} set">${content}</button>` : `<div class="meta-lineup-slot" title="${esc(name)}">${content}</div>`;
  }).join("")}</div>`;
}

function teamCard(team, data) {
  return `<article class="meta-team-card" data-team-card="${esc(team.id)}"><div class="meta-team-card-head"><span class="meta-placement">${team.placement ? `#${esc(team.placement)}` : "Featured"}</span><div><b>${esc(team.player || "Community team")}</b><small>${esc(team.event || team.title)}</small></div></div>${teamLineup(team, data)}<div class="meta-team-card-foot"><span>${prettyDate(team.date)}${record(team) ? ` <b>${record(team)}</b>` : ""}</span><button class="btn-sm" data-meta-open-team="${esc(team.id)}" aria-label="Open ${esc(team.title)}">Open ↗</button></div></article>`;
}

// Filter PRESENTATION only: missing disclosure stays in the import model unchanged.
export function presentImportNotes(mapping) {
  return {
    undisclosed: mapping.warnings.filter(w => w.includes("Stat Points undisclosed; no exact spread was imported.")).length,
    notes: mapping.warnings.filter(w => !w.includes("Stat Points undisclosed; no exact spread was imported.")),
  };
}

export function renderPublishedTeam(team, data) {
  const mapping = mapTournamentTeam(team, data), { undisclosed, notes } = presentImportNotes(mapping);
  const moveIds = new Map(Object.entries(data.moves).map(([id, m]) => [canonicalSlug(m.name), id]));
  return `<div class="meta-team-focus" data-meta-team-view="${esc(team.id)}"><button class="meta-text-button meta-back" data-meta-team-back>← Back to teams</button>
    <div class="meta-focus-heading"><div><span class="meta-eyebrow">${team.kind === "featured" ? "Featured team" : "Tournament team"} · ${esc(team.regulation)}</span><h3 id="published-team-title" tabindex="-1">${esc(team.event || team.title)}</h3><p>${team.placement ? `<b>#${esc(team.placement)}</b> · ` : ""}${esc(team.player || "Author not supplied")} · ${prettyDate(team.date)}${record(team) ? ` · <b>${record(team)}</b> record` : ""}</p></div><a class="meta-source-link" href="${safeUrl(team.publishedSource || team.source)}" target="_blank" rel="noopener noreferrer">Team source ↗</a></div>
    <div class="meta-team-actions"><button class="btn accent" data-meta-import="${esc(team.id)}" ${mapping.errors.length ? "disabled" : ""}>Open in Team Builder</button><button class="btn" data-meta-opponent="${esc(team.id)}" ${mapping.errors.length ? "disabled" : ""}>Use as opponents in Damage</button></div>
    ${teamLineup(team, data, true)}
    ${mapping.errors.length ? `<div class="meta-import-problems" role="alert"><b>Resolve before importing</b><ul>${mapping.errors.map(error => `<li>${esc(error)}</li>`).join("")}</ul></div>` : ""}
    ${notes.length ? `<div class="meta-import-notes"><span>Set / import notes</span>${help("team-mapping-help", "Set / import notes", notes.join(" "))}</div>` : ""}
    <div class="meta-set-heading"><h3>The six sets</h3><span>${undisclosed ? `${undisclosed}/6 spreads unavailable` : "All six spreads disclosed"}</span>${help("team-disclosure-help", "Set disclosure", "Only disclosed source values are shown or imported. A zero placeholder row is not a disclosed spread. Missing Stat Points stay unknown; no Nature or investment is inferred. A recorded pre-Mega ability is retained as source evidence while the existing importer uses the appropriate battle-form ability.")}</div>
    <div class="meta-set-grid">${team.members.map((set, index) => {
      const mon = setMon(set, data), name = setName(set, data);
      return `<article class="meta-set-card" id="published-set-${index}" tabindex="-1"><div class="meta-set-identity">${portrait(mon, name, true)}<div><small>Slot ${index + 1}</small><h4>${esc(name)}</h4><span class="meta-set-nature" title="${esc(natureLabel(set.nature))}">${esc(natureName(set.nature))} ${set.nature ? "nature" : "Nature"}</span></div></div><dl class="meta-set-facts"><div><dt>Item</dt><dd>${esc(Object.hasOwn(ITEMS, set.item) ? itemLabel(set.item) : set.sourceNames?.item || set.item || "Unavailable")}</dd></div><div><dt>Ability</dt><dd>${esc(data.abilities[set.ability]?.name || set.sourceNames?.ability || set.ability || "Unavailable")}</dd></div></dl>
        ${set.statsKnown ? statPoints(set.stats) : '<div class="meta-spread-missing">Spread unavailable</div>'}
        <div class="meta-set-moves">${set.moves.map(slug => { const id = moveIds.get(slug), move = data.moves[id]; return `<${move ? `button data-move-info="${id}"` : "span"} class="meta-set-move"${move?.type ? ` style="--move-type:${TYPE_COLORS[move.type]}"` : ""}>${esc(move?.name || slug.replace(/-/g, " "))}</${move ? "button" : "span"}>`; }).join("") || '<span class="muted">Moves unavailable</span>'}</div></article>`;
    }).join("")}</div></div>`;
}

function renderTeams(mon, data, limits, options) {
  if (!data.tournamentTeams) return `<div class="meta-empty" role="status">${esc(data.tournamentTeamsError || "Loading published team records…")}${data.tournamentTeamsError ? '<button class="btn-sm" data-meta-retry>Try again</button>' : ""}</div>`;
  const teams = teamsForPokemon(data, mon), focused = teams.find(t => t.id === options.teamId);
  if (focused) return renderPublishedTeam(focused, data);
  const counts = Object.fromEntries(["tournament", "featured"].map(kind => [kind, teams.filter(t => t.kind === kind).length]));
  const kind = options.teamKind || (counts.tournament ? "tournament" : "featured"), list = teams.filter(t => t.kind === kind), count = limits[kind] || 6;
  return `<section class="meta-team-browser"><div class="meta-section-head"><div><h3>Real teams. At a glance.</h3><p>Published ${esc(displayName(mon))} teams · ${teams.length} captured</p></div></div>
    <div class="meta-team-filters" aria-label="Team category">${["tournament", "featured"].map(k => `<button data-meta-team-kind="${k}" aria-pressed="${kind === k}">${k === "tournament" ? "Tournament" : "Featured"}<span>${counts[k]}</span></button>`).join("")}</div>
    <div class="meta-team-grid">${list.slice(0, count).map(team => teamCard(team, data)).join("") || '<p class="meta-empty">No teams captured in this category.</p>'}</div>
    ${list.length > count ? `<button class="btn-sm meta-more" data-meta-more="${kind}" data-meta-next="${count + 6}">Show more teams <span>${count} / ${list.length}</span></button>` : ""}
    ${mon.metaUsage?.excludedTeams?.length ? `<p class="item-note">${mon.metaUsage.excludedTeams.length} incomplete published teams excluded.</p>` : ""}</section>`;
}

export function renderMetaUsage(mon, data, limits = {}, options = {}) {
  const view = options.view || "meta";
  if (!data.tournamentMeta) return `<section class="detail-usage"><p class="meta-empty">${esc(data.metaLoadError || "Meta snapshot unavailable. Mechanics remain available.")}</p></section>`;
  const dataset = data.tournamentMeta.datasets[data.metaRegulation], entry = mon.metaUsage;
  const header = datasetHeader(entry, data, dataset);
  if (!entry || entry.status !== "ok") return `<section class="detail-usage">${header}<div class="meta-empty"><h3>No captured sample for this form</h3><p>No base-form values substituted in ${esc(data.metaRegulation)}.</p>${entry?.status === "unavailable-regulation" ? `<p class="learnset-warning">The source fell back to ${esc(entry.sourceSelectedRegulation)}. Those values were withheld instead of relabelled as ${esc(data.metaRegulation)}. Select that dataset above to view it.</p>` : ""}</div></section>`;
  let content;
  if (view === "teams") content = renderTeams(mon, data, limits, options);
  else if (view === "builds") content = renderBuilds(entry, limits, false);
  else content = `${renderBuilds(entry, limits, true)}<div class="meta-category-grid">${category("natures", "Overall Nature", dataset.denominators.natures + " Separate from captured Nature evidence for each exact build.", entry, data, limits)}${category("abilities", "Ability usage", dataset.denominators.abilities, entry, data, limits)}${category("items", "Item usage", "Recorded held-item share, separate from item mechanics and local availability.", entry, data, limits)}${category("moves", "Move share", dataset.denominators.moves, entry, data, limits)}</div>${renderTeammates(entry, data, limits, dataset)}`;
  return `<section class="detail-usage">${header}${content}</section>`;
}
