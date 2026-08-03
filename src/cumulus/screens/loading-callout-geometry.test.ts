import { describe, expect, it } from "vitest";
import { buildLoadingCalloutLeaderLine } from "./loading-callout-geometry";

describe("buildLoadingCalloutLeaderLine", () => {
  it("starts at the bubble edge and ends at the exact target center", () => {
    const line = buildLoadingCalloutLeaderLine(
      { left: 100, top: 50, right: 600, bottom: 650, width: 500, height: 600 },
      { left: 120, top: 140, right: 220, bottom: 188, width: 100, height: 48 },
      { left: 260, top: 150, right: 296, bottom: 186, width: 36, height: 36 },
    );

    expect(line).toMatchObject({
      startX: 120,
      startY: 118,
      endX: 178,
      endY: 118,
    });
    expect(line.path.endsWith("L 178 118")).toBe(true);
  });

  it("uses the bubble's left edge when the callout sits right of the target", () => {
    const line = buildLoadingCalloutLeaderLine(
      { left: 0, top: 0, right: 500, bottom: 600, width: 500, height: 600 },
      { left: 380, top: 80, right: 480, bottom: 128, width: 100, height: 48 },
      { left: 330, top: 70, right: 370, bottom: 110, width: 40, height: 40 },
    );

    expect(line.startX).toBe(380);
    expect(line.endX).toBe(350);
    expect(line.endY).toBe(90);
  });

  it("clamps the line start away from the bubble's rounded corners", () => {
    const line = buildLoadingCalloutLeaderLine(
      { left: 0, top: 0, right: 500, bottom: 600, width: 500, height: 600 },
      { left: 20, top: 200, right: 120, bottom: 248, width: 100, height: 48 },
      { left: 200, top: 150, right: 220, bottom: 170, width: 20, height: 20 },
    );

    expect(line.startY).toBe(208);
    expect(line.endY).toBe(160);
  });
});
