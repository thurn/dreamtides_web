import { describe, expect, it } from "vitest";
import { artRef } from "../primitives/art";
import { atlasFixtureNodes, nodeSizing } from "./__atlas-fixtures__";
import { asDreamscapeId } from "../../types/identifiers";
import { asGuideId } from "../../types/identifiers";

describe("Atlas documentation fixtures", () => {
  it("uses shipped art for the unrevealed frame and boss presentation", () => {
    const fixtures = atlasFixtureNodes(nodeSizing(false));
    const boss = fixtures.find((fixture) => fixture.role === "boss")?.item;

    expect(fixtures.map((fixture) => fixture.item.unrevealedFrameRef)).toEqual(
      fixtures.map(() => artRef.atlasAsset("Round_frame_main.png")),
    );
    expect(boss?.iconRef).toEqual(
      artRef.dreamscapeIcon(asDreamscapeId("limbo")),
    );
    expect(boss?.primary.sceneArt).toEqual(
      artRef.dreamscapeScene(asDreamscapeId("limbo")),
    );
    expect(boss?.primary.figureArt).toEqual(
      artRef.dreamGuide(asGuideId("apollyon")),
    );
  });
});
