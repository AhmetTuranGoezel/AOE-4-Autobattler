// Small icon autocomplete: type to filter, see a name+icon dropdown, click (or
// Enter) a row to pick it. Replaces native <datalist> (which only commits on blur).
//
// attachAutocomplete(input, {
//   items: () => [{ value, name, icon }],   // icon = small HTML (sprite <img> / type pill)
//   onPick: (value) => void,
//   max = 10,
//   clearOnPick = true,
// }) -> detach()
//
// The input must live inside a `.ac-wrap` (position: relative) so the menu anchors
// under it. Safe to re-attach after a re-render (returns a detach() to clean up).
const MAX_DEFAULT = 10;

export function attachAutocomplete(input, opts) {
  const { items, onPick, max = MAX_DEFAULT, clearOnPick = true } = opts;
  const wrap = input.closest(".ac-wrap") || input.parentElement;
  const menu = document.createElement("ul");
  menu.className = "ac-menu";
  menu.hidden = true;
  wrap.appendChild(menu);

  let matches = [];
  let active = -1;

  const norm = (s) => s.toLowerCase();
  function compute() {
    const q = norm(input.value.trim());
    const all = items() || [];
    matches = (q ? all.filter((it) => norm(it.name).includes(q)) : all).slice(0, max);
    active = matches.length ? 0 : -1;
  }
  function draw() {
    if (!matches.length) { close(); return; }
    menu.innerHTML = matches.map((it, i) =>
      `<li class="ac-row ${i === active ? "active" : ""}" data-i="${i}">
        <span class="ac-icon">${it.icon || ""}</span><span class="ac-name">${it.name}</span>${it.meta ? `<span class="ac-meta">${it.meta}</span>` : ""}</li>`).join("");
    menu.hidden = false;
  }
  function close() { menu.hidden = true; menu.innerHTML = ""; active = -1; }
  function pick(i) {
    const it = matches[i];
    if (!it) return;
    onPick(it.value);
    if (clearOnPick) input.value = "";
    close();
    if (!clearOnPick) { compute(); draw(); }
  }

  const onInput = () => { compute(); draw(); };
  const onFocus = () => { compute(); draw(); };
  const onKey = (e) => {
    if (menu.hidden && (e.key === "ArrowDown" || e.key === "ArrowUp")) { compute(); draw(); return; }
    if (menu.hidden) return;
    if (e.key === "ArrowDown") { e.preventDefault(); active = (active + 1) % matches.length; draw(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); active = (active - 1 + matches.length) % matches.length; draw(); }
    else if (e.key === "Enter") { e.preventDefault(); pick(active); }
    else if (e.key === "Escape") { close(); }
  };
  // mousedown (not click) so the pick fires before the input's blur closes the menu.
  const onMenuDown = (e) => {
    const row = e.target.closest(".ac-row");
    if (!row) return;
    e.preventDefault();
    pick(Number(row.dataset.i));
  };
  const onDocDown = (e) => { if (!wrap.contains(e.target)) close(); };

  input.addEventListener("input", onInput);
  input.addEventListener("focus", onFocus);
  input.addEventListener("keydown", onKey);
  menu.addEventListener("mousedown", onMenuDown);
  document.addEventListener("mousedown", onDocDown);

  return function detach() {
    input.removeEventListener("input", onInput);
    input.removeEventListener("focus", onFocus);
    input.removeEventListener("keydown", onKey);
    document.removeEventListener("mousedown", onDocDown);
    menu.remove();
  };
}
