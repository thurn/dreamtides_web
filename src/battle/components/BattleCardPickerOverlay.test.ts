import { describe, expect, it } from "vitest";
import { togglePick } from "./BattleCardPickerOverlay";

describe("togglePick", () => {
  it("adds an id when under the cap", () => {
    expect(togglePick([], "a", 2)).toEqual(["a"]);
    expect(togglePick(["a"], "b", 2)).toEqual(["a", "b"]);
  });

  it("removes an id when clicking an already-selected id", () => {
    expect(togglePick(["a", "b"], "a", 3)).toEqual(["b"]);
    expect(togglePick(["a"], "a", 1)).toEqual([]);
  });

  it("leaves selected unchanged when at cap with count > 1", () => {
    expect(togglePick(["a", "b"], "c", 2)).toEqual(["a", "b"]);
    expect(togglePick(["a", "b", "c"], "d", 3)).toEqual(["a", "b", "c"]);
  });

  it("replaces the current pick when count === 1 and a different id is chosen", () => {
    expect(togglePick(["a"], "b", 1)).toEqual(["b"]);
    expect(togglePick(["z"], "x", 1)).toEqual(["x"]);
  });

  it("returns a new array (does not mutate the input)", () => {
    const original = ["a", "b"];
    const result = togglePick(original, "c", 3);
    expect(result).not.toBe(original);
  });
});
