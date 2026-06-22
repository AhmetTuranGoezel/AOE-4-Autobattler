// Browsable Abilities list: description, how many roster Pokemon have it (rarity),
// and a preview of those Pokemon. Clicking an ability filters the roster by it.
import { rarityTier, displayName } from "./data.js";

export function initAbilitiesView({ toolbarEl, contentEl, data, onInfo, onFilter }) {
  const byAbility = new Map();
  for (const m of data.pokemon) {
    for (const a of m.abilities) {
      if (!byAbility.has(a.slug)) byAbility.set(a.slug, []);
      byAbility.get(a.slug).push(m);
    }
  }
  const abilities = Object.entries(data.abilities).map(([slug, a]) => ({
    slug, ...a, mons: byAbility.get(slug) || [],
  }));
  const state = { search: "", sort: { key: "count", dir: "desc" } };

  toolbarEl.innerHTML = `
    <input class="search ab-search" type="search" placeholder="Search ability…" autocomplete="off">
    <label class="sortwrap">Sort <select class="ab-sort">
      <option value="count">Pokémon</option><option value="name">Name</option>
    </select></label>
    <button class="btn ab-dir">▼ Desc</button>
    <span class="count ab-count"></span>`;

  const $ = (s) => toolbarEl.querySelector(s);
  $(".ab-search").addEventListener("input", (e) => { state.search = e.target.value; draw(); });
  $(".ab-sort").addEventListener("change", (e) => { state.sort.key = e.target.value; draw(); });
  $(".ab-dir").addEventListener("click", () => {
    state.sort.dir = state.sort.dir === "asc" ? "desc" : "asc";
    $(".ab-dir").textContent = state.sort.dir === "asc" ? "▲ Asc" : "▼ Desc"; draw();
  });
  contentEl.addEventListener("click", (e) => {
    const lens = e.target.closest(".lens[data-filter]");
    if (lens) { onFilter && onFilter(lens.dataset.filter); return; }
    const card = e.target.closest("[data-ability]");
    if (card && onInfo) onInfo(card.dataset.ability);
  });

  function apply() {
    const q = state.search.trim().toLowerCase();
    let list = abilities.filter((a) =>
      !q || a.name.toLowerCase().includes(q) || (a.desc || "").toLowerCase().includes(q));
    const sign = state.sort.dir === "asc" ? 1 : -1;
    list.sort((a, b) => state.sort.key === "name"
      ? sign * a.name.localeCompare(b.name)
      : sign * (a.count - b.count) || a.name.localeCompare(b.name));
    return list;
  }

  function draw() {
    const list = apply();
    $(".ab-count").textContent = `${list.length} abilities`;
    contentEl.innerHTML = `<div class="ability-grid">${list.map((a) => {
      const r = rarityTier(a.count, data.total);
      const preview = a.mons.slice(0, 10).map((m) =>
        `<img loading="lazy" alt="" title="${displayName(m)}" src="${m.sprite || m.artwork || ""}">`).join("");
      const more = a.mons.length > 10 ? `<span class="ab-more">+${a.mons.length - 10}</span>` : "";
      return `<div class="ability-card" data-ability="${a.slug}" title="View ability details">
        <div class="ac-head"><span class="ac-name">${a.name}</span>
          <span class="ac-head-right"><span class="rarity ${r.cls}">${r.label} · ${a.count}</span>
          <button class="lens" data-filter="${a.slug}" title="Filter roster by this ability">🔍</button></span></div>
        <div class="ac-desc">${a.desc || "No description."}</div>
        <div class="ac-mons">${preview}${more}</div>
      </div>`;
    }).join("")}</div>`;
  }

  draw();
}
