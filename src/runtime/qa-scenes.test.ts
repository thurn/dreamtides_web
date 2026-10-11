// QA scene registry contracts: unique ids, lookup, a fold-invariant-clean
// load for every registered scene, and seeded builds that are pure functions
// of the game seed.

import { testJourneySeed } from "../types/test-identities";
import { describe, expect, it } from "vitest";
import { SYNTHETIC_ATLAS_DREAMSCAPES } from "../testing/atlas-fixtures";
import { parseQaSceneId } from "../types/identifiers";
import type { JourneyContent } from "../data/journey-content";
import {
  QA_SCENES,
  buildQaScene,
  buildQaSceneBattle,
  findQaScene,
} from "./qa-scenes";
import { initialFoldState } from "../rules/fold-state";
import { loadState } from "../rules/journey/lifecycle";
import { foldInvariantViolations } from "../rules/invariants";
import { TEST_CONTENT_CONFIG } from "../testing/journey-genesis";
import { testDreamsignId } from "../types/test-identities";
import {
  battleSceneContent,
  makeAvatar,
  makeJourneyContent,
  SCENE_OPTIONS,
  TUTORIAL_AVATAR_ID,
} from "./qa-scenes.fixtures";

/**
 * {@link battleSceneContent} with the tutorial Avatar, a non-starter
 * dreamscape for every routed signature site, and enough Dreamsign templates
 * to fill a full Dreamsign row, so every registered scene can build.
 */
function invariantSceneContent(): JourneyContent {
  return {
    ...battleSceneContent(),
    avatars: [makeAvatar(), makeAvatar(TUTORIAL_AVATAR_ID)],
    dreamscapes: SYNTHETIC_ATLAS_DREAMSCAPES,
    dreamsignTemplates: Array.from({ length: 13 }, (_, index) => ({
      id: testDreamsignId(`invariant-dreamsign-${String(index + 1)}`),
      name: `Dreamsign ${String(index + 1)}`,
      effectDescription: "A QA effect.",
    })),
  };
}

describe("QA scenes", () => {
  it("registers each scene under a unique lowercase id", () => {
    const ids = QA_SCENES.map((scene) => scene.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toBe(id.trim().toLowerCase());
    }
  });

  it("resolves a scene id case-insensitively and ignores surrounding space", () => {
    const scene = QA_SCENES[0];
    expect(findQaScene(scene.id)).toBe(scene);
    expect(findQaScene(parseQaSceneId(`  ${scene.id.toUpperCase()}  `))).toBe(
      scene,
    );
  });

  for (const scene of QA_SCENES) {
    it(`${scene.id} loads into a state the fold invariants accept`, () => {
      const content = invariantSceneContent();
      const journey = buildQaScene(scene.id, content, SCENE_OPTIONS);
      if (journey === null) throw new Error(`${scene.id} did not build`);
      const battle = buildQaSceneBattle(scene.id, content, journey);
      const loaded = loadState(
        { ...initialFoldState(journey.seed, TEST_CONTENT_CONFIG), journey },
        { snapshot: journey, battle },
        {
          contentConfig: TEST_CONTENT_CONFIG,
          seq: 1,
          rng: () => 0,
          intervening: [],
          timestamp: new Date(0).toISOString(),
        },
      );
      if (loaded === null) throw new Error(`LOAD_STATE bounced ${scene.id}`);

      expect(foldInvariantViolations(loaded)).toEqual([]);
    });
  }

  it("returns null for an unknown scene id", () => {
    expect(findQaScene(parseQaSceneId("not-a-real-scene"))).toBeNull();
    expect(
      buildQaScene(
        parseQaSceneId("not-a-real-scene"),
        makeJourneyContent(),
        SCENE_OPTIONS,
      ),
    ).toBeNull();
  });
});

describe("QA scene seeding", () => {
  // One scene per kind of seeded content: the Avatar offer's seed, Atlas
  // layouts at several depths, a parked site, a keeper battle, and an end
  // screen built on a fully replayed Atlas.
  const sceneIds = [
    "avatar-select",
    "atlas",
    "atlas4",
    "shop",
    "draft",
    "battle3",
    "dreamscape",
    "journeycomplete",
  ].map((id) => parseQaSceneId(id));

  for (const sceneId of sceneIds) {
    it(`${sceneId} is a pure function of the game seed`, () => {
      const content = makeJourneyContent();
      const seed = testJourneySeed("qa-seed-7");
      const first = buildQaScene(sceneId, content, { journeySeed: seed });
      // An intervening build with another seed leaves no trace on the next.
      buildQaScene(sceneId, content, {
        journeySeed: testJourneySeed("qa-seed-8"),
      });
      const second = buildQaScene(sceneId, content, { journeySeed: seed });

      expect(first).not.toBeNull();
      expect(first?.seed).toBe(seed);
      expect(second).toEqual(first);
    });
  }
});
