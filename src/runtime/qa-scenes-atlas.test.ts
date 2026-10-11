// Journey-start and Atlas QA scenes: each parks the run on its screen with
// the frontier and identity the scene names.

import { describe, expect, it } from "vitest";
import { parseQaSceneId } from "../types/identifiers";
import { layerOrdinal } from "../types/layer-name";
import { buildQaScene } from "./qa-scenes";
import {
  testDreamscapeArtKey,
  testDreamscapeId,
  testGuideArtKey,
  testGuideId,
  testAvatarId,
} from "../types/test-identities";
import {
  makeAvatar,
  makeJourneyContent,
  SCENE_OPTIONS,
  TUTORIAL_AVATAR_ID,
} from "./qa-scenes.fixtures";

describe('the "avatar-select" QA scene', () => {
  it("parks the run on the journeyStart Avatar selection screen", () => {
    const state = buildQaScene(
      parseQaSceneId("avatar-select"),
      makeJourneyContent(),
      SCENE_OPTIONS,
    );

    expect(state).not.toBeNull();
    expect(state?.screen.type).toBe("journeyStart");
    // The selection screen is shown before an Avatar is chosen, so no
    // Avatar, package, or draft state has been resolved yet.
    expect(state?.avatar).toBeNull();
    expect(state?.resolvedPackage).toBeNull();
    expect(state?.draftState).toBeNull();
  });
});

describe('the "tutorial-avatar-select" QA scene', () => {
  it("parks journeyStart on the one fixed tutorial Avatar UUID", () => {
    const content = makeJourneyContent();
    content.avatars = [makeAvatar(TUTORIAL_AVATAR_ID)];

    const state = buildQaScene(
      parseQaSceneId("tutorial-avatar-select"),
      content,
      SCENE_OPTIONS,
    );

    expect(state).not.toBeNull();
    expect(state?.screen).toEqual({
      type: "journeyStart",
      tutorialAvatarId: testAvatarId(TUTORIAL_AVATAR_ID),
    });
    expect(state?.avatar).toBeNull();
    expect(state?.resolvedPackage).toBeNull();
    expect(state?.draftState).toBeNull();
  });
});

describe('the "atlas" QA scene', () => {
  it("parks the run on the atlas screen with a generated boss node", () => {
    const state = buildQaScene(
      parseQaSceneId("atlas"),
      makeJourneyContent(),
      SCENE_OPTIONS,
    );

    expect(state).not.toBeNull();
    expect(state?.screen.type).toBe("atlas");
    // Between dreamscapes: no dreamscape entered and no active site.
    expect(state?.currentDreamscape).toBeNull();
    expect(state?.avatar?.id).toBe(testAvatarId("avatar-1"));

    const bossNodeId = state?.atlas.bossNodeId;
    expect(bossNodeId).toBeTruthy();
    expect(
      bossNodeId == null ? undefined : state?.atlas.nodes[bossNodeId],
    ).toBeDefined();
  });
});

describe('the "random-site-atlas" QA scene', () => {
  it("places Maddox's enhanced Random Site on an available Atlas node", () => {
    const content = makeJourneyContent();
    content.dreamscapes = [
      ...content.dreamscapes,
      {
        id: testDreamscapeId("rust-expanse-test"),
        artKey: testDreamscapeArtKey("rust-expanse-test"),
        name: "The Rust Expanse",
        guideId: testGuideId("maddox"),
        signatureSite: "RandomSite",
        affiliationId: null,
        isStarter: false,
        avatarIds: [],
      },
    ];
    content.guides = [
      {
        id: testGuideId("maddox"),
        name: "Maddox",
        homeDreamscapeId: testDreamscapeId("rust-expanse-test"),
        siteType: "RandomSite",
        portraitSource: "fixture-guide.png",
        artKey: testGuideArtKey("fixture-guide"),
        headTargetX: 0.6,
        dialogue: { site: ["Pick a road."] },
        homeSpecialty: "Choose one of three sites.",
      },
    ];

    const state = buildQaScene(
      parseQaSceneId("random-site-atlas"),
      content,
      SCENE_OPTIONS,
    );

    expect(state?.screen.type).toBe("atlas");
    const maddoxNode = Object.values(state?.atlas.nodes ?? {}).find(
      (node) =>
        node.dreamscapeId === testDreamscapeId("rust-expanse-test") &&
        node.state === "available",
    );
    expect(maddoxNode?.state).toBe("available");
    expect(maddoxNode?.enhancedSiteType).toBe("RandomSite");
    const randomSite = maddoxNode?.sites.find(
      (site) => site.type === "RandomSite",
    );
    expect(randomSite?.isEnhanced).toBe(true);
    expect(randomSite?.randomSite?.mode).toBe("homeChoice");
  });
});

describe('the "tutorial-atlas" QA scene', () => {
  it("parks the tutorial journey at its first Atlas frontier", () => {
    const state = buildQaScene(
      parseQaSceneId("tutorial-atlas"),
      makeJourneyContent(),
      SCENE_OPTIONS,
    );

    expect(state?.screen.type).toBe("atlas");
    expect(state?.completionLevel).toBe(1);
    expect(state?.isTutorialJourney).toBe(true);
  });
});

describe("the atlas layer QA scenes", () => {
  // `atlasN` is numbered by the UI's 1-indexed "Layer N" column label, so it
  // parks the frontier on 0-indexed layer N-1. Column I (the starter) is never
  // a resting frontier, so the numbered scenes run Layer II through Layer VII.
  const displayLayers = [2, 3, 4, 5, 6, 7];

  for (const displayLayer of displayLayers) {
    const frontierLayer = displayLayer - 1;
    it(`atlas${String(displayLayer)} parks on the atlas with the frontier on the "Layer ${String(displayLayer)}" column`, () => {
      const state = buildQaScene(
        parseQaSceneId(`atlas${String(displayLayer)}`),
        makeJourneyContent(),
        SCENE_OPTIONS,
      );

      expect(state).not.toBeNull();
      expect(state?.screen.type).toBe("atlas");
      expect(state?.currentDreamscape).toBeNull();
        // Reaching the column-N frontier means N-1 dreamscapes were completed.
      expect(state?.completionLevel).toBe(frontierLayer);

      const nodes = Object.values(state?.atlas.nodes ?? {});
      const completed = nodes.filter((node) => node.state === "completed");
      expect(completed.length).toBe(frontierLayer);

      // The available frontier sits on the 0-indexed layer the UI shows as N.
      const available = nodes.filter((node) => node.state === "available");
      expect(available.length).toBeGreaterThan(0);
      expect(
        available.every((node) => layerOrdinal(node.layer) === frontierLayer),
      ).toBe(true);
    });
  }
});
