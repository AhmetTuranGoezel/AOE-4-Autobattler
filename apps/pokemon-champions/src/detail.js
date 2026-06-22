// Detail panel for a selected Pokemon: radar, cleaned-stat breakdown,
// abilities + moves with rarity, and "find similar".
import { STAT_KEYS, STAT_LABELS, explainEffective, statScaleMax } from "./effective-stats.js";
import { displayName, rarityTier, TYPE_COLORS, GEN_LABEL } from "./data.js";
import { renderRadar } from "./radar.js";
import { findSimilar } from "./similarity.js";
import { typeBadges, statColor, ROLE_META } from "./table.js";

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
    <td class="num">${mv.power ?? "—"}</td>
    <td class="num"><span class="rarity ${r.cls}">${mv.count}</span></td>
  </tr>`;
}

export function renderDetail(mon, { data, all, simCtx, statMode }) {
  const e = mon._eff;
  const role = ROLE_META[e.role];
  const max = statScaleMax(statMode);

  // stat breakdown bars (raw vs effective)
  const bars = STAT_KEYS.map((k) => {
    const v = e.disp[k];
    const effV = Math.round(e.eff[k]);
    const wasted = v - effV;
    const rawPct = (Math.min(v, max) / max) * 100;
    const effPct = (Math.min(effV, max) / max) * 100;
    return `<div class="sb">
      <span class="sb-lab">${STAT_LABELS[k]}</span>
      <span class="sb-track"><i class="sb-raw" style="width:${rawPct}%"></i>
        <i class="sb-eff" style="width:${effPct}%;background:${statColor(v, max)}"></i></span>
      <span class="sb-val">${v}${wasted > 2 ? ` <em>→ ${effV}</em>` : ""}</span>
    </div>`;
  }).join("");

  const abilities = mon.abilities.map((a) => {
    const meta = data.abilities[a.slug] || { name: a.slug, desc: "" };
    return `<div class="ab-row" data-ability-info="${a.slug}" title="View ability details">
      <span class="ab-name">${meta.name}${a.hidden ? ` <span class="hidden-tag">Hidden</span>` : ""}</span>
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

  const reasons = explainEffective(mon, e).map((r) => `<li>${r}</li>`).join("");

  return `<div class="detail-card">
    <button class="detail-close" data-close aria-label="Close">✕</button>
    <div class="detail-head">
      <img class="detail-art" alt="" src="${mon.artwork || mon.sprite || ""}">
      <div class="detail-meta">
        <div class="detail-name">${displayName(mon)} ${mon.isMega ? '<span class="mega-badge">MEGA</span>' : ""}</div>
        <div class="detail-sub">#${mon.dex} · ${GEN_LABEL(mon.gen)} · <span class="role ${role.cls}">${role.label}</span></div>
        <div class="types big">${typeBadges(mon.types)}</div>
        <div class="detail-totals">
          <div><span class="t-lab">${statMode === "lv50" ? "Total" : "BST"}</span><span class="t-val">${e.bst}</span></div>
          <div class="hl"><span class="t-lab">Cleaned total</span><span class="t-val">${e.cleaned}</span></div>
          <div class="wst"><span class="t-lab">Wasted</span><span class="t-val">${e.wasted}</span></div>
        </div>
        <button class="btn cmp-detail" data-cmp="${mon.slug}" data-cmp-icon>＋ Compare</button>
      </div>
    </div>

    <div class="detail-grid">
      <section class="detail-radar">
        ${renderRadar(e.disp, e.eff, { max })}
        <div class="radar-legend">
          <span><i class="lg-raw"></i> Base</span><span><i class="lg-eff"></i> Cleaned</span>
        </div>
      </section>
      <section class="detail-bars">
        <h4>Stat breakdown</h4>
        ${bars}
        <ul class="why">${reasons}</ul>
      </section>
    </div>

    <section class="detail-ab">
      <h4>Abilities</h4>
      <div class="ab-list">${abilities}</div>
    </section>

    <section class="detail-sim">
      <h4>Similar Pokémon</h4>
      <div class="sim-list">${similar}</div>
    </section>

    <section class="detail-moves">
      <div class="dm-head">
        <h4>Moves <span class="muted">${moves.length}</span></h4>
        <input class="mv-search" type="search" placeholder="Filter moves…" autocomplete="off">
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
