// Animation and facing: walking cycles the walk sheet's eight moving frames,
// idling cycles its two frames, and idle characters face the player within
// range (on the dominant axis) and otherwise face down.

import { describe, expect, it } from "vitest";
import { D97_CHARACTER_TUNABLES } from "../../../content/d97/tunables";
import { animationColumn, idleFacing } from "./animation";

const TUNABLES = { ...D97_CHARACTER_TUNABLES, walkFramesPerSecond: 10, idleFramesPerSecond: 2 };

describe("animationColumn", () => {
  it("cycles walk columns 1 to 8 and idle columns 0 to 1", () => {
    const walk = Array.from({ length: 10 }, (_, frame) => animationColumn("walk", frame / 10, TUNABLES));
    expect(walk).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 1, 2]);
    const idle = Array.from({ length: 4 }, (_, frame) => animationColumn("idle", frame / 2, TUNABLES));
    expect(idle).toEqual([0, 1, 0, 1]);
  });
});

describe("idleFacing", () => {
  it("faces the player within range and down otherwise", () => {
    expect(idleFacing([5, 5], { x: 7, y: 5 }, 2)).toBe("right");
    expect(idleFacing([5, 5], { x: 5, y: 3 }, 2)).toBe("up");
    expect(idleFacing([5, 5], { x: 4, y: 6.5 }, 2)).toBe("down");
    expect(idleFacing([5, 5], { x: 3, y: 4 }, 2)).toBe("left");
    expect(idleFacing([5, 5], { x: 8, y: 5 }, 2)).toBe("down");
    expect(idleFacing([5, 5], { x: 5, y: 5 }, 2)).toBe("down");
  });
});
