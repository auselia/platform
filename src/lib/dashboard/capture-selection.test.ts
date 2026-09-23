import { describe, expect, it } from "vitest";
import { applyClick } from "./capture-selection";

const ids = [10, 20, 30, 40, 50];
const none = new Set<number>();
const toggle = { toggle: true, range: false };
const range = { toggle: false, range: true };
const plain = { toggle: false, range: false };
const picked = (r: ReturnType<typeof applyClick>) => (r.kind === "multi" ? [...r.picked].sort((a, b) => a - b) : null);

describe("applyClick", () => {
  it("Ctrl-click keeps the highlighted card in the selection (the reported bug)", () => {
    expect(picked(applyClick(ids, none, 20, null, 40, toggle))).toEqual([20, 40]);
  });

  it("Ctrl-click with nothing highlighted just picks the card", () => {
    expect(picked(applyClick(ids, none, null, null, 30, toggle))).toEqual([30]);
  });

  it("Ctrl-clicking the highlighted card itself starts the selection with it", () => {
    expect(picked(applyClick(ids, none, 20, null, 20, toggle))).toEqual([20]);
  });

  it("Ctrl-click toggles a card that is already picked", () => {
    expect(picked(applyClick(ids, new Set([20, 40]), 20, 40, 40, toggle))).toEqual([20]);
  });

  it("does not re-add the highlighted card once a selection exists", () => {
    // 20 was highlighted but the user un-picked it; it must not sneak back in.
    expect(picked(applyClick(ids, new Set([30]), 20, 30, 40, toggle))).toEqual([30, 40]);
  });

  it("ignores a highlighted card that is no longer in the list", () => {
    expect(picked(applyClick(ids, none, 999, null, 40, toggle))).toEqual([40]);
  });

  it("Shift-click selects the range from the highlighted card when there is no anchor", () => {
    expect(picked(applyClick(ids, none, 20, null, 40, range))).toEqual([20, 30, 40]);
  });

  it("Shift-click works backwards and from the last Ctrl-clicked anchor", () => {
    expect(picked(applyClick(ids, new Set([40]), null, 40, 20, range))).toEqual([20, 30, 40]);
  });

  it("plain click clears the multi-selection and highlights", () => {
    expect(applyClick(ids, new Set([20, 40]), 20, 40, 30, plain)).toEqual({ kind: "select", anchor: 30 });
  });

  it("Shift-click with no anchor and nothing highlighted falls back to a plain click", () => {
    expect(applyClick(ids, none, null, null, 30, range)).toEqual({ kind: "select", anchor: 30 });
  });
});
