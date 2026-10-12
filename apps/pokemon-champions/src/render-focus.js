// Keep keyboard editing on the same control when an existing view rerenders.
// Attribute identity is presentation-only; never infer or change build state.
export function retainRenderFocus(root) {
  const focused = root.ownerDocument?.activeElement;
  if (!focused || !root.contains(focused)) return () => {};
  const identity = [...focused.attributes].filter(({ name }) => name === "id" || name.startsWith("data-"))
    .map(({ name, value }) => [name, value]);
  const tag = focused.tagName.toLowerCase();
  const selection = Number.isInteger(focused.selectionStart)
    ? [focused.selectionStart, focused.selectionEnd] : null;
  return () => {
    let next = focused.isConnected && root.contains(focused) ? focused : null;
    if (!next && identity.length) {
      const matches = [...root.querySelectorAll(tag)].filter(el => identity.every(([name, value]) => el.getAttribute(name) === value));
      // Ambiguous controls must not steal focus from a different build or row.
      if (matches.length === 1) next = matches[0];
    }
    if (!next || next.disabled || !next.getClientRects().length) return;
    next.focus({ preventScroll: true });
    if (selection && typeof next.setSelectionRange === "function") next.setSelectionRange(...selection);
  };
}
