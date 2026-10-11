import { testAvatarId } from "../../types/test-identities";
import { describe, expect, it } from "vitest";
import { annotatedTextEquality } from "../../cumulus/testing/annotated-text";
import {
  parseAtlasNodeId,
  parseBattleId,
  parseSiteId,
} from "../../types/identifiers";
import { testJourneyState } from "../../testing/journey-genesis";
import type { JourneyState } from "../../types/journey";
import { buildJourneyFailedView } from "./journey-failed-view-model";

describe("journey-failed-view-model", () => {
  expect.addEqualityTesters([annotatedTextEquality]);

  function state(overrides: Partial<JourneyState> = {}): JourneyState {
    const base = testJourneyState();
    return {
      ...base,
      completionLevel: 2,
      avatar: {
        id: testAvatarId("avatar-uuid"),
        name: "The Wayfinder",
        title: "Bearer of the Last Light",
        renderedText: "A fixture ability.",
        imageNumber: "001",
        startingEssence: 200,
      },
      failureSummary: {
        battleId: parseBattleId("battle-uuid"),
        result: "defeat",
        reason: "score_target_reached",
        siteId: parseSiteId("site-uuid"),
        siteLabel: "Battle",
        nodeIdOrNone: parseAtlasNodeId("dreamscape-uuid"),
        turnNumber: 6,
        playerScore: 4,
        enemyScore: 10,
      },
      ...overrides,
    };
  }

  describe("buildJourneyFailedView", () => {
    it("builds the interactive Avatar portrait and terminal battle summary", () => {
      const journey = state();
      const view = buildJourneyFailedView(journey);

      expect(view).toMatchObject({
        result: "defeat",
        reason: "score_target_reached",
        avatar: {
          id: journey.avatar?.id,
          imageNumber: "001",
        },
      });
      expect(view?.avatar?.name).toEqual(expect.any(String));
      expect(view?.avatar?.title).toEqual(expect.any(String));
      expect(view?.avatar?.ability).toEqual(expect.any(String));
      expect(view?.stats.map(({ id, value }) => [id, value])).toEqual([
        ["battles", 2],
        ["round", 6],
        ["playerScore", 4],
        ["enemyScore", 10],
      ]);
    });
  });
});
