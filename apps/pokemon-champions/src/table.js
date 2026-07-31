// Result rendering: sortable table view and card/grid view + shared UI bits.
// Displayed stat numbers come from m._eff.disp (base or Lv 50, per the toggle).
import { STAT_KEYS, STAT_LABELS } from "./effective-stats.js";
import { TYPE_COLORS } from "./data.js";

export const ROLE_META = {
  physical: { label: "Physical", cls: "role-phys" },
  special: { label: "Special", cls: "role-spec" },
  mixed: { label: "Mixed", cls: "role-mixed" },
  defensive: { label: "Defensive", cls: "role-def" },
};

export function typeBadges(types) {
  return types.map((t) =>
    `<span class="type" style="background:${TYPE_COLORS[t]}">${t}</span>`).join("");
}

// Bright, saturated, value-distinct stat colours. Value is scaled by 200/max so
// Lv50 numbers fall on the same bands as base stats.
const STAT_BANDS = [
  [40, "#d23b3b"], [55, "#e8602f"], [70, "#ef8f2b"], [85, "#f2c218"],
  [100, "#b6cc34"], [115, "#74c042"], [135, "#36b061"], [Infinity, "#1fb3a6"],
];
export function statColor(v, max = 200) {
  const x = v * (200 / max);
  for (const [t, c] of STAT_BANDS) if (x < t) return c;
  return STAT_BANDS[STAT_BANDS.length - 1][1];
}

function spriteTag(mon, cls) {
  return `<img class="${cls}" loading="lazy" alt="" src="${mon.sprite || mon.artwork || ""}">`;
}

const megaBadge = (mon) => (mon.isMega ? ` <span class="mega-badge">MEGA</span>` : "");

function cmpBtn(mon, cmp, big) {
  const on = cmp.has(mon.slug);
  if (big) {
    return `<button class="btn cmp-detail ${on ? "on" : ""}" data-cmp="${mon.slug}" data-cmp-icon>${on ? "✓ In compare" : "＋ Compare"}</button>`;
  }
  return `<button class="cmp ${on ? "on" : ""}" data-cmp="${mon.slug}" title="Add to compare">${on ? "✓" : "＋"}</button>`;
}

// Pin: keeps the mon on top of the list through any filters/search (stat comparison).
function pinBtn(mon, on) {
  return `<button class="pin ${on ? "on" : ""}" data-pin="${mon.slug}" title="${on ? "Unpin" : "Pin — stays on top through any filters"}">📌</button>`;
}

const sep = (x) => Math.round(x).toLocaleString("en-US");

// ---- Table view ----
// Optional secondary-info columns (Weight / Usage %) toggled from the toolbar.
const EXTRA_COLS = [
  { key: "weight", label: "kg", num: true, title: "Weight — drives Grass Knot / Low Kick power" },
  { key: "usagePct", label: "Usage", num: true, title: "M-B ladder usage rate (pokebase)" },
];
const colsFor = (extras) => [
  { key: "dex", label: "#", num: true },
  { key: "name", label: "Name" },
  { key: "role", label: "Role", nosort: true },
  ...STAT_KEYS.map((k) => ({ key: k, label: STAT_LABELS[k], stat: true, num: true })),
  { key: "bst", label: "BST", num: true },
  { key: "cleaned", label: "Cleaned", num: true },
  { key: "wasted", label: "Wasted", num: true },
  ...(extras ? EXTRA_COLS : []),
  { key: "ehpPhys", label: "Phys eHP", num: true, ehp: true, title: "Effective HP vs physical @Lv50 (HP × Def)" },
  { key: "ehpSpec", label: "Spec eHP", num: true, ehp: true, title: "Effective HP vs special @Lv50 (HP × Sp.Def)" },
  { key: "ehpMixed", label: "Mixed eHP", num: true, ehp: true, title: "Effective HP vs an even physical+special mix @Lv50 (harmonic mean)" },
];
const widthsFor = (extras) => (extras
  ? ["3%", "12.6%", "5.4%", ...STAT_KEYS.map(() => "5.2%"), "4.6%", "6.8%", "5.8%", "4.6%", "5%", "6.6%", "6.6%", "7%"]
  : ["3%", "17.4%", "6%", ...STAT_KEYS.map(() => "5.6%"), "5%", "6.8%", "5.6%", "7.2%", "7.2%", "7.2%"]);

const sumGet = (m, k) => (k === "bst" ? m._eff.bst : k === "cleaned" ? m._eff.cleaned
  : k === "wasted" ? m._eff.wasted
  : (k === "ehpPhys" || k === "ehpSpec" || k === "ehpMixed") ? m._eff[k]
  : (k === "weight" || k === "usagePct") ? m[k]
  : m._eff.disp[k]);

const round1 = (x) => Math.round(x * 10) / 10;

// Weight / Usage carry decimals and may be missing (esp. usage), so summarise
// them over the non-null values only and keep one decimal place.
function summarize(list, extras = false) {
  const keys = [...STAT_KEYS, "bst", "cleaned", "wasted", "ehpPhys", "ehpSpec", "ehpMixed",
    ...(extras ? ["weight", "usagePct"] : [])];
  const out = {};
  for (const k of keys) {
    const decimal = k === "weight" || k === "usagePct";
    const rnd = decimal ? round1 : Math.round;
    const xs = list.map((m) => sumGet(m, k))
      .filter((v) => v != null && !Number.isNaN(v))
      .sort((a, b) => a - b);
    const n = xs.length;
    if (!n) { out[k] = null; continue; }
    out[k] = {
      avg: rnd(xs.reduce((s, v) => s + v, 0) / n),
      med: n % 2 ? rnd(xs[(n - 1) / 2]) : rnd((xs[n / 2 - 1] + xs[n / 2]) / 2),
      n,
    };
  }
  return out;
}

export function renderTable(list, sort, cmp, max = 200, extras = false, pinned = [], team = new Set()) {
  const cols = `<colgroup>${widthsFor(extras).map((w) => `<col style="width:${w}">`).join("")}</colgroup>`;

  const head = colsFor(extras).map((c) => {
    const active = sort.key === c.key;
    const arrow = active ? `<span class="th-arrow">${sort.dir === "asc" ? "▴" : "▾"}</span>` : "";
    const cls = `${c.num ? "num" : ""} ${c.nosort ? "" : "sortable"} ${active ? "active" : ""}`;
    return `<th class="${cls}" ${c.title ? `title="${c.title}"` : ""} ${c.nosort ? "" : `data-sort="${c.key}"`}>${c.label}${arrow}</th>`;
  }).join("");

  const row = (m, isPinned) => {
    const e = m._eff;
    const statCells = STAT_KEYS.map((k) => {
      const v = e.disp[k];
      const bar = Math.min((v * (200 / max)) / 180, 1) * 100;
      return `<td class="num stat" style="--bar:${bar}%;--c:${statColor(v, max)}"><span>${v}</span></td>`;
    }).join("");
    const role = ROLE_META[e.role];
    return `<tr data-slug="${m.slug}" class="${isPinned ? "pinned" : ""}">
      <td class="num dex">${m.dex}</td>
      <td class="namecell"><span class="row-btns">${pinBtn(m, isPinned)}${cmpBtn(m, cmp)}</span>${spriteTag(m, "spr")}
        <span class="nm"><span class="nm-top">${m._display}${megaBadge(m)}</span>
        <span class="types">${typeBadges(m.types)}</span></span></td>
      <td><span class="role ${role.cls}">${role.label}</span></td>
      ${statCells}
      <td class="num bst">${e.bst}</td>
      <td class="num cleaned">${e.cleaned}</td>
      <td class="num wasted">${e.wasted > 0 ? e.wasted : "0"}</td>
      ${extras ? `<td class="num xtra">${m.weight != null ? m.weight : "—"}</td>
      <td class="num xtra">${m.usagePct != null ? m.usagePct + "%" : "—"}</td>` : ""}
      <td class="num ehp">${sep(e.ehpPhys)}</td>
      <td class="num ehp">${sep(e.ehpSpec)}</td>
      <td class="num ehp ehp-mix">${sep(e.ehpMixed)}</td>
    </tr>`;
  };

  // pinned rows sit on top inside the same table (aligned columns), behind a labeled divider
  const nCols = colsFor(extras).length;
  const pinBlock = pinned.length ? `
    <tr class="pin-head"><td colspan="${nCols}">📌 Pinned (${pinned.length}) <small>ignores filters &amp; search</small><button class="btn-sm" data-pin-clear>Clear all</button></td></tr>
    ${pinned.map((m) => row(m, true)).join("")}
    <tr class="pin-end"><td colspan="${nCols}"></td></tr>` : "";
  const rows = pinBlock + list.map((m) => row(m, false)).join("");

  let foot = "";
  if (list.length) {
    const s = summarize(list, extras);
    const cell = (o) => `<td class="num"><b>${o.avg}</b><span class="sm-med">${o.med}</span></td>`;
    const ecell = (o) => `<td class="num ehp"><b>${sep(o.avg)}</b><span class="sm-med">${sep(o.med)}</span></td>`;
    // Weight/Usage may have no data across the current list → show a dash.
    const xcell = (o, suffix = "") => (o
      ? `<td class="num"><b>${o.avg}${suffix}</b><span class="sm-med">${o.med}${suffix}</span></td>`
      : `<td class="num xtra">—</td>`);
    foot = `<tfoot><tr class="summary-row">
      <td class="num sum-n">${list.length}</td>
      <td class="sum-legend"><b>Average</b><span class="sm-med">median</span></td>
      <td></td>
      ${STAT_KEYS.map((k) => cell(s[k])).join("")}
      ${cell(s.bst)}${cell(s.cleaned)}${cell(s.wasted)}
      ${extras ? `${xcell(s.weight)}${xcell(s.usagePct, "%")}` : ""}
      ${ecell(s.ehpPhys)}${ecell(s.ehpSpec)}${ecell(s.ehpMixed)}
    </tr></tfoot>`;
  }

  return `<table class="poke-table">${cols}<thead><tr>${head}</tr></thead><tbody>${rows}</tbody>${foot}</table>`;
}

// ---- Grid view ----
export function renderGrid(list, cmp, max = 200, pinned = [], team = new Set()) {
  const card = (m, isPinned) => {
    const e = m._eff;
    const role = ROLE_META[e.role];
    const bars = STAT_KEYS.map((k) => {
      const v = e.disp[k];
      const effPct = (Math.min(e.eff[k], max) / max) * 100;
      const rawPct = (Math.min(v, max) / max) * 100;
      return `<div class="gbar" title="${STAT_LABELS[k]} ${v}">
        <span class="gbar-lab">${STAT_LABELS[k]}</span>
        <span class="gbar-track"><i class="gbar-raw" style="width:${rawPct}%"></i>
          <i class="gbar-eff" style="width:${effPct}%;background:${statColor(v, max)}"></i></span>
        <span class="gbar-val">${v}</span></div>`;
    }).join("");
    return `<div class="pcard ${isPinned ? "pinned" : ""}" data-slug="${m.slug}">
      <div class="pcard-top">
        ${spriteTag(m, "pcard-art")}
        <div class="pcard-corner"><div class="pcard-btns">${pinBtn(m, isPinned)}${cmpBtn(m, cmp)}</div><div class="pcard-id">#${m.dex}${megaBadge(m)}</div></div>
      </div>
      <div class="pcard-name">${m._display}</div>
      <div class="types">${typeBadges(m.types)}</div>
      <div class="pcard-role"><span class="role ${role.cls}">${role.label}</span></div>
      <div class="pcard-bars">${bars}</div>
      <div class="pcard-totals">
        <div><span class="t-lab">BST</span><span class="t-val">${e.bst}</span></div>
        <div class="hl"><span class="t-lab">Cleaned</span><span class="t-val">${e.cleaned}</span></div>
      </div>
    </div>`;
  };
  const pinBlock = pinned.length ? `
    <div class="pin-grid-head">📌 Pinned (${pinned.length}) <small>ignores filters &amp; search</small><button class="btn-sm" data-pin-clear>Clear all</button></div>
    <div class="grid-view pinned-grid">${pinned.map((m) => card(m, true)).join("")}</div>` : "";
  return `${pinBlock}<div class="grid-view">${list.map((m) => card(m, false)).join("")}</div>`;
}
