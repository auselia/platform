// File-manager style selection for the capture grid. Pure so the modifier rules can be tested.
//
// Two different things exist: the *highlighted* capture (a plain click, shown in the details
// panel) and the *multi-selection* (Ctrl/Cmd/Shift, what Delete acts on). The highlighted one
// counts as selected once you start multi-selecting, like the focused file in a file manager,
// so Ctrl-clicking a second card gives two, not one.

export type ClickMods = { toggle: boolean; range: boolean };

export type ClickResult =
  | { kind: "select"; anchor: number }                       // plain click: highlight, clear multi
  | { kind: "multi"; picked: Set<number>; anchor: number };  // modifier click: new multi-selection

export function applyClick(
  ids: number[],            // cards in display order
  picked: ReadonlySet<number>,
  highlighted: number | null,
  anchor: number | null,
  id: number,
  mods: ClickMods,
): ClickResult {
  const base = new Set(picked);
  const seedFromHighlight = base.size === 0 && highlighted !== null && ids.includes(highlighted);

  if (mods.toggle) {
    if (seedFromHighlight) base.add(highlighted!);
    // Ctrl-clicking the highlighted card while nothing else is picked starts the selection
    // with it rather than immediately un-picking it.
    if (seedFromHighlight && id === highlighted) return { kind: "multi", picked: base, anchor: id };
    if (base.has(id)) base.delete(id); else base.add(id);
    return { kind: "multi", picked: base, anchor: id };
  }

  if (mods.range) {
    const from = ids.indexOf(anchor ?? highlighted ?? -1);
    const to = ids.indexOf(id);
    if (from !== -1 && to !== -1) {
      const [a, b] = from < to ? [from, to] : [to, from];
      return { kind: "multi", picked: new Set(ids.slice(a, b + 1)), anchor: anchor ?? highlighted! };
    }
  }

  return { kind: "select", anchor: id };
}
