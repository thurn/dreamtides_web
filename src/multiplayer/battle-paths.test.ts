import { describe, expect, it } from "vitest";
import {
  battleStateInitPath,
  battleStatePath,
  battleStateReducerPath,
} from "./battle-paths";

describe("battle-paths", () => {
  it("builds the canonical battleState path", () => {
    expect(battleStatePath("room-1")).toBe("rooms/room-1/battleState");
  });

  it("builds nested init and reducer paths", () => {
    expect(battleStateInitPath("room-1")).toBe(
      "rooms/room-1/battleState/init",
    );
    expect(battleStateReducerPath("room-1")).toBe(
      "rooms/room-1/battleState/reducer",
    );
  });

  it("rejects forbidden room ids", () => {
    expect(() => battleStatePath("bad/id")).toThrow();
  });
});
