// Detail panel for a selected Pokemon: radar, cleaned-stat breakdown,
// abilities + moves with rarity, and "find similar".
import { statScaleMax } from "./effective-stats.js";
import { displayName, rarityTier, TYPE_COLORS, GEN_LABEL } from "./data.js";
import { renderRadar } from "./radar.js";
import { findSimilar } from "./similarity.js";
import { typeBadges, ROLE_META } from "./table.js";
import { renderEhpCards, renderStatRows, emptySpread } from "./stat-lab.js";

// Competitive usage % (from pokebase): which ability/item/nature/move a Pokémon
// actually runs on ladder, and how often.
function renderUsage(mon) {
  const u = mon.usage || {};
  const cat = (label, list) => (list && list.length ? `<div class="use-cat">
    <span class="use-lab">${label}</span>
    <div class="use-items">${list.map(([n, p]) =>
      `<span class="use-item" title="${n}: ${p}%"><i class="use-fill" style="width:${p}%"></i><span class="use-name">${n}</span><span class="use-pct">${p}%</span></span>`).join("")}</div>
  </div>` : "");
  // Ability % is shown on the Abilities list itself; here we keep item/nature/move.
  const body = cat("Item", u.items) + cat("Nature", u.natures) + cat("Moves", u.moves);
  return `<section class="detail-usage">
    <h4>Usage <span class="muted">ranked ladder · pokebase</span></h4>
    ${body || '<p class="use-empty">No ranked usage data for this Pokémon yet.</p>'}
  </section>`;
}

function rarityBadge(count, total) {
  const r = rarityTier(count, total);
  const pct = Math.round(r.pct * 100);
  return `<span class="rarity ${r.cls}" title="${count} of ${total} (${pct}%) can use this">` +
    `${r.label} · ${count}</span>`;
}

function moveRow(id, data) {
  const mv = data.moves[id];
  if (!mv) return "";
  const type = mv.type
    ? `<span class="type tiny" style="background:${TYPE_COLORS[mv.type]}">${mv.type}</span>` : "—";
  const r = rarityTier(mv.count, data.total);
  return `<tr class="mv-row" data-move-info="${id}" data-name="${mv.name.toLowerCase()}" data-class="${mv.class}" data-type="${mv.type || ""}" data-power="${mv.power || 0}" data-count="${mv.count || 0}" title="View move details">
    <td class="dm-name"><button class="lens" data-move-filter="${id}" title="Find Pokémon that learn this">🔍</button>${mv.name}</td>
    <td>${type}</td>
    <td><span class="mv-class mv-${mv.class}" title="${mv.class}">${mv.class[0].toUpperCase()}</span></td>
    <td class="num">${mv.power == null ? (mv.class === "status" ? "—" : '<span class="mv-varies">var</span>') : mv.power}</td>
    <td class="num"><span class="rarity ${r.cls}">${mv.count}</span></td>
  </tr>`;
}

// Derive a shiny artwork/sprite URL from a PokeAPI sprite path by inserting /shiny/.
function shinyUrl(url) {
  if (!url) return "";
  if (url.includes("/official-artwork/")) return url.replace("/official-artwork/", "/official-artwork/shiny/");
  return url.replace("/pokemon/", "/pokemon/shiny/");
}

export function renderDetail(mon, { data, all, simCtx, statMode, spread, detailShiny }) {
  const e = mon._eff;
  const role = ROLE_META[e.role];
  const max = statScaleMax(statMode);
  const sp = spread || emptySpread();
  const shiny = !!detailShiny;

  // Shiny artwork with a graceful fallback: shiny art → shiny sprite → normal art → placeholder.
  // The chain ends in .img-missing (CSS Pokéball placeholder) so a rate-limited CDN never
  // leaves a silent blank gap.
  const artNormal = mon.artwork || mon.sprite || "";
  const artSrc = shiny ? shinyUrl(mon.artwork || mon.sprite || "") : artNormal;
  const missing = "this.onerror=null;this.classList.add('img-missing')";
  const artOnErr = shiny
    ? `this.onerror=function(){this.onerror=function(){${missing}};this.src='${artNormal}'};this.src='${shinyUrl(mon.sprite || "")}'`
    : `this.onerror=function(){${missing}};this.src='${mon.sprite || ""}'`;

  // Form switch: base ⇄ its Mega form(s), sharing the National Dex number.
  const base = all.find((m) => m.dex === mon.dex && !m.isMega);
  const megas = all.filter((m) => m.dex === mon.dex && m.isMega);
  const formList = [];
  if (base) formList.push(base);
  formList.push(...megas);
  const formBtns = formList.length > 1 ? formList.map((f) => {
    const label = f.isMega ? (f.formLabel || "Mega") : "Base";
    return `<button class="df-btn ${f.slug === mon.slug ? "on" : ""}" data-form="${f.slug}">${label}</button>`;
  }).join("") : "";
  const formBar = `<div class="detail-forms">
    <button class="df-btn ${shiny ? "on" : ""}" data-shiny title="Toggle shiny artwork">✨ Shiny</button>
    ${formBtns}
  </div>`;

  const usePct = new Map((mon.usage?.abilities || []).map(([n, p]) => [n, p]));
  const abilities = mon.abilities.map((a) => {
    const meta = data.abilities[a.slug] || { name: a.slug, desc: "" };
    const pct = usePct.get(meta.name);
    return `<div class="ab-row" data-ability-info="${a.slug}" title="View ability details">
      <span class="ab-name">${meta.name}${pct != null ? ` <span class="ab-use" title="ranked usage">${pct}%</span>` : ""}${a.hidden ? ` <span class="hidden-tag">Hidden</span>` : ""}</span>
      ${rarityBadge(meta.count, data.total)}
      <button class="lens" data-ability-filter="${a.slug}" title="Find Pokémon with this ability">🔍</button>
      <span class="ab-desc">${meta.desc || ""}</span>
    </div>`;
  }).join("");

  // moves: damaging (by power desc) then status (alpha)
  const moves = mon.moves.map((id) => ({ id, mv: data.moves[id] })).filter((x) => x.mv);
  const damaging = moves.filter((x) => x.mv.class !== "status")
    .sort((a, b) => (b.mv.power || 0) - (a.mv.power || 0));
  const status = moves.filter((x) => x.mv.class === "status")
    .sort((a, b) => a.mv.name.localeCompare(b.mv.name));
  const moveList = [...damaging, ...status].map((x) => moveRow(x.id, data)).join("");

  const similar = findSimilar(mon, all, simCtx).slice(0, 6).map((s) => {
    const sm = s.mon;
    return `<button class="sim-card" data-slug="${sm.slug}">
      <img loading="lazy" alt="" src="${sm.sprite || sm.artwork || ""}">
      <span class="sim-name">${sm._display}</span>
      <span class="sim-types">${typeBadges(sm.types)}</span>
      <span class="sim-score">${s.similarity}% match</span>
    </button>`;
  }).join("");

  return `<div class="detail-card">
    <button class="detail-close" data-close aria-label="Close">✕</button>
    <div class="detail-head">
      <div class="detail-artwrap">
        ${shiny ? '<span class="shiny-glitter" aria-hidden="true">✨</span>' : ""}
        <img class="detail-art ${shiny ? "is-shiny" : ""}" alt="" src="${artSrc}" onerror="${artOnErr}">
        ${formBar}
      </div>
      <div class="detail-meta">
        <div class="detail-name">${displayName(mon)} ${mon.isMega ? '<span class="mega-badge">MEGA</span>' : ""}</div>
        <div class="detail-sub">#${mon.dex} · ${GEN_LABEL(mon.gen)} · <span class="role ${role.cls}">${role.label}</span></div>
        <div class="types big">${typeBadges(mon.types)}</div>
        <div class="detail-totals">
          <div><span class="t-lab">${statMode === "lv50" ? "Total" : "BST"}</span><span class="t-val">${e.bst}</span></div>
          <div class="hl"><span class="t-lab">Cleaned total</span><span class="t-val">${e.cleaned}</span></div>
          <div class="wst"><span class="t-lab">Wasted</span><span class="t-val">${e.wasted}</span></div>
          ${mon.weight != null ? `<div><span class="t-lab">Weight</span><span class="t-val">${mon.weight} kg</span></div>` : ""}
        </div>
        <div class="detail-actions">
          <button class="btn cmp-detail" data-cmp="${mon.slug}" data-cmp-icon>＋ Compare</button>
          <button class="btn cmp-detail" data-team="${mon.slug}" data-team-icon>＋ Team</button>
        </div>
      </div>
    </div>

    <div class="detail-grid">
      <section class="detail-radar">
        ${renderRadar(e.disp, e.eff, { max })}
        <div class="radar-legend">
          <span><i class="lg-raw"></i> Base</span><span><i class="lg-eff"></i> Cleaned</span>
        </div>
      </section>
      <section class="detail-ehp">
        <h4>Effective HP <span class="muted">Lv 50</span></h4>
        ${renderEhpCards(mon, sp)}
      </section>
    </div>

    <section class="stat-lab">
      <div class="lab-head"><h4>Stat spread</h4><span class="lab-hint">Distribute ${66} points (max 32 per stat) — eHP updates live.</span></div>
      ${renderStatRows(mon, sp)}
    </section>

    <section class="detail-ab">
      <h4>Abilities</h4>
      <div class="ab-list">${abilities}</div>
    </section>

    ${renderUsage(mon)}

    <section class="detail-sim">
      <h4>Similar Pokémon</h4>
      <div class="sim-list">${similar}</div>
    </section>

    <section class="detail-moves">
      <div class="dm-head">
        <h4>Moves <span class="muted">${moves.length}</span></h4>
        <input class="mv-search" type="search" placeholder="Filter moves…" autocomplete="off">
        <button class="btn-sm dm-browse" data-browse-moves="${mon.slug}" title="Open the Moves tab filtered to this Pokémon">↗ Moves tab</button>
      </div>
      <div class="dm-scroll">
        <table class="dm-table" data-dsort="type" data-ddir="asc">
          <thead><tr>
            <th class="sortable" data-dsort="name">Move</th>
            <th class="sortable" data-dsort="type">Type</th>
            <th class="sortable" data-dsort="class">Cat</th>
            <th class="num sortable" data-dsort="power">Pow</th>
            <th class="num sortable" data-dsort="count">#</th>
          </tr></thead>
          <tbody class="mv-list">${moveList}</tbody>
        </table>
      </div>
    </section>
  </div>`;
}
