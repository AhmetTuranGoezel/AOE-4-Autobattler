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

// ---- Table view ----
const COLS = [
  { key: "dex", label: "#", num: true },
  { key: "name", label: "Name" },
  { key: "role", label: "Role", nosort: true },
  ...STAT_KEYS.map((k) => ({ key: k, label: STAT_LABELS[k], stat: true, num: true })),
  { key: "bst", label: "BST", num: true },
  { key: "cleaned", label: "Cleaned", num: true },
  { key: "wasted", label: "Wasted", num: true },
];
const COL_WIDTHS = ["3.5%", "23%", "7.5%", ...STAT_KEYS.map(() => "7%"), "6.5%", "9%", "8.5%"];

const sumGet = (m, k) => (k === "bst" ? m._eff.bst : k === "cleaned" ? m._eff.cleaned
  : k === "wasted" ? m._eff.wasted : m._eff.disp[k]);

function summarize(list) {
  const keys = [...STAT_KEYS, "bst", "cleaned", "wasted"];
  const out = {};
  for (const k of keys) {
    const xs = list.map((m) => sumGet(m, k)).sort((a, b) => a - b);
    const n = xs.length;
    out[k] = {
      avg: Math.round(xs.reduce((s, v) => s + v, 0) / n),
      med: n % 2 ? xs[(n - 1) / 2] : Math.round((xs[n / 2 - 1] + xs[n / 2]) / 2),
    };
  }
  return out;
}

export function renderTable(list, sort, cmp, max = 200) {
  const cols = `<colgroup>${COL_WIDTHS.map((w) => `<col style="width:${w}">`).join("")}</colgroup>`;

  const head = COLS.map((c) => {
    const active = sort.key === c.key;
    const arrow = active ? (sort.dir === "asc" ? " ▲" : " ▼") : "";
    const cls = `${c.num ? "num" : ""} ${c.nosort ? "" : "sortable"} ${active ? "active" : ""}`;
    return `<th class="${cls}" ${c.nosort ? "" : `data-sort="${c.key}"`}>${c.label}${arrow}</th>`;
  }).join("");

  const rows = list.map((m) => {
    const e = m._eff;
    const statCells = STAT_KEYS.map((k) => {
      const v = e.disp[k];
      const bar = Math.min((v * (200 / max)) / 180, 1) * 100;
      return `<td class="num stat" style="--bar:${bar}%;--c:${statColor(v, max)}"><span>${v}</span></td>`;
    }).join("");
    const role = ROLE_META[e.role];
    return `<tr data-slug="${m.slug}">
      <td class="num dex">${m.dex}</td>
      <td class="namecell">${cmpBtn(m, cmp)}${spriteTag(m, "spr")}
        <span class="nm"><span class="nm-top">${m._display}${megaBadge(m)}</span>
        <span class="types">${typeBadges(m.types)}</span></span></td>
      <td><span class="role ${role.cls}">${role.label}</span></td>
      ${statCells}
      <td class="num bst">${e.bst}</td>
      <td class="num cleaned">${e.cleaned}</td>
      <td class="num wasted">${e.wasted > 0 ? "−" + e.wasted : "0"}</td>
    </tr>`;
  }).join("");

  let foot = "";
  if (list.length) {
    const s = summarize(list);
    const cell = (o) => `<td class="num"><b>${o.avg}</b><span class="sm-med">${o.med}</span></td>`;
    foot = `<tfoot><tr class="summary-row">
      <td class="num sum-n">${list.length}</td>
      <td class="sum-legend"><b>Average</b><span class="sm-med">median</span></td>
      <td></td>
      ${STAT_KEYS.map((k) => cell(s[k])).join("")}
      ${cell(s.bst)}${cell(s.cleaned)}${cell(s.wasted)}
    </tr></tfoot>`;
  }

  return `<table class="poke-table">${cols}<thead><tr>${head}</tr></thead><tbody>${rows}</tbody>${foot}</table>`;
}

// ---- Grid view ----
export function renderGrid(list, cmp, max = 200) {
  return `<div class="grid-view">${list.map((m) => {
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
    return `<div class="pcard" data-slug="${m.slug}">
      <div class="pcard-top">
        ${spriteTag(m, "pcard-art")}
        <div class="pcard-corner">${cmpBtn(m, cmp)}<div class="pcard-id">#${m.dex}${megaBadge(m)}</div></div>
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
  }).join("")}</div>`;
}
