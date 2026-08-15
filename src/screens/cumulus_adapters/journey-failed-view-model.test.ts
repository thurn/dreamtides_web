import { describe, expect, it } from "vitest";
import { localizedStringSourceEquality } from "../../runtime/localization/testing";
import { LocalizedString } from "@trox/runtime";

expect.addEqualityTesters([localizedStringSourceEquality]);
import { createDefaultState } from "../../state/journey-context";
import type { JourneyState } from "../../types/journey";
import { buildJourneyFailedView } from "./journey-failed-view-model";
import { parseBattleId } from "../../types/identifiers";
import { parseSiteId } from "../../types/identifiers";
import { parseAtlasNodeId } from "../../types/identifiers";
import { testAvatarId } from "../../types/test-identities";

function state(overrides: Partial<JourneyState> = {}): JourneyState {
  const base = createDefaultState();
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
      dreamscapeIdOrNone: parseAtlasNodeId("dreamscape-uuid"),
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
    expect(view?.avatar?.name).toBeInstanceOf(LocalizedString);
    expect(view?.avatar?.title).toBeInstanceOf(LocalizedString);
    expect(view?.avatar?.ability).toBeInstanceOf(LocalizedString);
    expect(view?.stats.map(({ id, value }) => [id, value])).toEqual([
      ["battles", 2],
      ["round", 6],
      ["playerScore", 4],
      ["enemyScore", 10],
    ]);
  });

  it.each(["turn_limit_reached", "forced_result"] as const)(
    "preserves the semantic %s reason",
    (reason) => {
      const view = buildJourneyFailedView(
        state({
          failureSummary: {
            ...state().failureSummary!,
            reason,
          },
        }),
      );

      expect(view?.reason).toBe(reason);
    },
  );

  it("uses the draw copy and tolerates a missing Avatar", () => {
    const view = buildJourneyFailedView(
      state({
        avatar: null,
        failureSummary: {
          ...state().failureSummary!,
          result: "draw",
        },
      }),
    );

    expect(view).toMatchObject({
      result: "draw",
      avatar: null,
    });
  });

  it("returns null when no frozen failure summary is available", () => {
    expect(buildJourneyFailedView(state({ failureSummary: null }))).toBeNull();
  });
});
