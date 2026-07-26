import { describe, expect, it } from "vitest";
import { createDefaultState } from "../../state/quest-context";
import type { QuestState } from "../../types/quest";
import { buildQuestFailedView } from "./quest-failed-view-model";

function state(overrides: Partial<QuestState> = {}): QuestState {
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

describe("buildQuestFailedView", () => {
  it("builds the interactive DreamAvatar portrait and terminal battle summary", () => {
    const view = buildQuestFailedView(state());

    expect(view).toMatchObject({
      result: "defeat",
      reason: "score_target_reached",
      title: "Quest Ended",
      message: "Your journey ends here.",
      reasonLabel: "Score Threshold Reached",
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

  it.each([
    ["turn_limit_reached", "Turn Limit Reached"],
    ["forced_result", "Forced Result"],
  ] as const)("formats the %s reason", (reason, label) => {
    const view = buildQuestFailedView(
      state({
        failureSummary: {
          ...state().failureSummary!,
          reason,
        },
      }),
    );

    expect(view?.reasonLabel).toBe(label);
  });

  it("uses the draw copy and tolerates a missing DreamAvatar", () => {
    const view = buildQuestFailedView(
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
      title: "Stalemate",
      message: "Neither side could claim the dream.",
      dreamAvatar: null,
    });
  });

  it("returns null when no frozen failure summary is available", () => {
    expect(buildQuestFailedView(state({ failureSummary: null }))).toBeNull();
  });
});
