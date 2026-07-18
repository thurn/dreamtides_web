import { describe, expect, it } from "vitest";
import { motionTimeSeconds } from "./motion-time";

describe("motionTimeSeconds", () => {
  it("converts authored millisecond motion tokens for Framer Motion", () => {
    expect(motionTimeSeconds("--dur-loading-quote")).toBe(1.4);
    expect(motionTimeSeconds("--delay-loading-attribution")).toBe(2);
  });
});
