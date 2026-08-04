import { describe, expect, it } from "vitest";
import { motionTimeSeconds } from "./motion-time";

describe("motionTimeSeconds", () => {
  it("converts authored millisecond motion tokens for Framer Motion", () => {
    expect(motionTimeSeconds("--dur-loading-screen-fade")).toBe(1.2);
  });
});
