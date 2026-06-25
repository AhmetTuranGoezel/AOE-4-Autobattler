// Detail popups for a single move or ability (shown on click; the lens button
// elsewhere is what filters the roster).
import { TYPE_COLORS, rarityTier, displayName, targetLabel, isSpread } from "./data.js";

function learnerSprites(mons, cap) {
  const shown = mons.slice(0, cap).map((m) =>
    `<img class="lr" loading="lazy" alt="" title="${displayName(m)}" data-slug="${m.slug}" src="${m.sprite || m.artwork || ""}">`).join("");
  const more = mons.length > cap ? `<span class="ab-more">+${mons.length - cap}</span>` : "";
  return shown + more;
}

export function renderMovePopup(move, learners, total) {
  const r = rarityTier(move.count, total);
  const type = move.type
    ? `<span class="type" style="background:${TYPE_COLORS[move.type]}">${move.type}</span>` : "";
  const flags = (move.flags || []).map((f) => `<span class="mflag">${f}</span>`).join("")
    || "<span class='muted'>none</span>";
  const prio = move.priority > 0 ? "+" + move.priority : move.priority;
  return `<div class="info-card">
    <button class="detail-close" data-close-popup aria-label="Close">✕</button>
    <div class="info-head">
      <h3>${move.name}</h3>${type}
      <span class="mv-class mv-${move.class}" title="${move.class}">${move.class[0].toUpperCase()}</span>
      <span class="rarity ${r.cls}">${r.label} · ${move.count} learn it</span>
    </div>
    <div class="info-stats">
      <div><span class="t-lab">Power</span><span class="t-val">${move.power ?? "—"}</span></div>
      <div><span class="t-lab">Accuracy</span><span class="t-val">${move.accuracy ?? "—"}</span></div>
      <div><span class="t-lab">PP</span><span class="t-val">${move.pp ?? "—"}</span></div>
      <div><span class="t-lab">Priority</span><span class="t-val">${prio}</span></div>
      <div><span class="t-lab">Category</span><span class="t-val cap">${move.class}</span></div>
      <div><span class="t-lab">Target</span><span class="t-val mv-target ${isSpread(move.target) ? "spread" : ""}">${targetLabel(move.target)}</span></div>
    </div>
    <div class="info-flags"><span class="il">Flags</span> ${flags}</div>
    ${(move.secondaries || []).length ? `<div class="info-secondaries">${move.secondaries.map(([c, l]) => `<span class="mv-chance">${c}%${l ? " " + l : ""}</span>`).join(" ")}</div>` : ""}
    <p class="info-effect">${move.effect || "No additional effect."}</p>
    <button class="btn accent filter-btn" data-move-filter="${move.id}">🔍 Show the ${learners.length} Pokémon that learn this</button>
    <div class="info-learners">${learnerSprites(learners, 48)}</div>
  </div>`;
}

export function renderAbilityPopup(ability, learners, total) {
  const r = rarityTier(ability.count, total);
  return `<div class="info-card">
    <button class="detail-close" data-close-popup aria-label="Close">✕</button>
    <div class="info-head">
      <h3>${ability.name}</h3>
      <span class="rarity ${r.cls}">${r.label} · ${ability.count} have it</span>
    </div>
    <p class="info-effect">${ability.desc || "No description available."}</p>
    <button class="btn accent filter-btn" data-ability-filter="${ability.slug}">🔍 Show the ${learners.length} Pokémon with this ability</button>
    <div class="info-learners">${learnerSprites(learners, 60)}</div>
  </div>`;
}
