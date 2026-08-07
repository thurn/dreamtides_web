import { describe, expect, it } from "vitest";
import { createDefaultState } from "../../state/journey-context";
import type { JourneyState } from "../../types/journey";
import { buildJourneyFailedView } from "./journey-failed-view-model";

function state(overrides: Partial<JourneyState> = {}): JourneyState {
  const base = createDefaultState();
  return {
    ...base,
    completionLevel: 2,
    dreamAvatar: {
      id: "dream-avatar-uuid",
      name: "The Wayfinder",
      title: "Bearer of the Last Light",
      renderedText: "A fixture ability.",
      imageNumber: "001",
      startingEssence: 200,
    },
    failureSummary: {
      battleId: "battle-uuid",
      result: "defeat",
      reason: "score_target_reached",
      siteId: "site-uuid",
      siteLabel: "Battle",
      dreamscapeIdOrNone: "dreamscape-uuid",
      turnNumber: 6,
      playerScore: 4,
      enemyScore: 10,
    },
    ...overrides,
  };
}

describe("buildJourneyFailedView", () => {
  it("builds the interactive DreamAvatar portrait and terminal battle summary", () => {
    const view = buildJourneyFailedView(state());

    expect(view).toMatchObject({
      result: "defeat",
      reason: "score_target_reached",
      dreamAvatar: {
        id: "dream-avatar-uuid",
        name: "The Wayfinder",
        title: "Bearer of the Last Light",
        ability: "A fixture ability.",
        imageNumber: "001",
      },
    });
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

  it("uses the draw copy and tolerates a missing DreamAvatar", () => {
    const view = buildJourneyFailedView(
      state({
        dreamAvatar: null,
        failureSummary: {
          ...state().failureSummary!,
          result: "draw",
        },
      }),
    );

    expect(view).toMatchObject({
      result: "draw",
      dreamAvatar: null,
    });
  });

  it("returns null when no frozen failure summary is available", () => {
    expect(buildJourneyFailedView(state({ failureSummary: null }))).toBeNull();
  });
});
