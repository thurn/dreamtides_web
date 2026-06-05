import { describe, expect, it } from "vitest";
import { aiMayRunHere } from "./ai-may-run-here";

describe("aiMayRunHere", () => {
  it("runs when this client is the sole connected client (count 1)", () => {
    expect(aiMayRunHere({ connectedCount: 1 })).toBe(true);
  });

  it("runs when presence is unknown (count undefined → treated as local)", () => {
    expect(aiMayRunHere({ connectedCount: undefined })).toBe(true);
    expect(aiMayRunHere({ connectedCount: null })).toBe(true);
  });

  it("runs when no client is observed connected yet (count 0)", () => {
    expect(aiMayRunHere({ connectedCount: 0 })).toBe(true);
  });

  it("does NOT run in a shared room with two connected clients", () => {
    expect(aiMayRunHere({ connectedCount: 2 })).toBe(false);
  });

  it("does NOT run with three or more connected clients", () => {
    expect(aiMayRunHere({ connectedCount: 3 })).toBe(false);
    expect(aiMayRunHere({ connectedCount: 10 })).toBe(false);
  });
});
