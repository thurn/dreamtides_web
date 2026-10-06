import { describe, expect, it } from "vitest";
import { testDreamscapeId, testGuideId } from "../types/test-identities";
import { parseDreamGuides } from "./dreamscapes";

const GUIDE_ID = testGuideId("fixture-guide");
const HOME_DREAMSCAPE_ID = testDreamscapeId("fixture-home");

function catalog(guide: Record<string, unknown>): unknown {
  return {
    schemaVersion: 1,
    contentHash: "0".repeat(64),
    guides: [
      {
        id: GUIDE_ID,
        artKey: "fixture_guide",
        name: "Fixture Guide",
        homeDreamscapeId: HOME_DREAMSCAPE_ID,
        siteType: "Shop",
        portraitSource: "fixture.png",
        headTargetX: 0.6,
        homeSpecialty: "Fixture specialty.",
        dialogue: { site: ["Fixture line."] },
        ...guide,
      },
    ],
  };
}

describe("parseDreamGuides", () => {
  it("decodes the guide identity, art key, and head target", () => {
    const [guide] = parseDreamGuides(
      catalog({ id: GUIDE_ID.toUpperCase() }),
    );
    expect(guide?.id).toBe(GUIDE_ID);
    expect(guide?.artKey).toBe("fixture_guide");
    expect(guide?.headTargetX).toBe(0.6);
  });

  it.each([
    ["a slug identity", { id: "fixture_guide" }],
    ["a missing art key", { artKey: undefined }],
    ["an art key with path characters", { artKey: "../fixture" }],
    ["a missing head target", { headTargetX: undefined }],
    ["a head target outside the render", { headTargetX: 1.5 }],
  ])("rejects %s", (_label, guide) => {
    expect(() => parseDreamGuides(catalog(guide))).toThrow();
  });
});
