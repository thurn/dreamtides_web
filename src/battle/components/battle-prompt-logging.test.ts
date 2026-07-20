import { describe, expect, it } from "vitest";
import { emptyBackRankSlots, emptyFrontRankSlots } from "../test-support";
import type { BattleMutableState, BattleSide } from "../types";
import type { PendingPrompt } from "../../rules/battle/fold";
import { createBattlePromptResolutionLogFields } from "./battle-prompt-logging";

function side(): BattleMutableState["sides"][BattleSide] {
  return {
    currentEnergy: 0,
    maxEnergy: 0,
    score: 0,
    visibility: {},
    deck: [],
    hand: [],
    void: [],
    banished: [],
    backRank: emptyBackRankSlots(),
    frontRank: emptyFrontRankSlots(),
    fatigueCount: 0,
    dreamwellCardIndex: null,
    dreamwellDrawnTurn: null,
  };
}

function board(): BattleMutableState {
  const player = side();
  const enemy = side();
  player.void = ["void-instance"];
  enemy.frontRank.F0 = "battlefield-instance";
  return {
    battleId: "battle-log-fixture",
    activeSide: "player",
    turnNumber: 2,
    phase: "dreamwell",
    result: null,
    forcedResult: null,
    dreamwellDeckIndex: 0,
    nextBattleCardOrdinal: 3,
    sides: { player, enemy },
    cardInstances: {
      "void-instance": {
        definition: { cardId: "11111111-1111-4111-8111-111111111111" },
      },
      "battlefield-instance": {
        definition: { cardId: "22222222-2222-4222-8222-222222222222" },
      },
    },
  } as unknown as BattleMutableState;
}

describe("createBattlePromptResolutionLogFields", () => {
  it("records Dreamwell, instance, backing UUID, zone, and final resolution identity", () => {
    const prompt = {
      promptId: 81,
      run: {
        scriptRef: {
          table: "dreamwell",
          id: "2b23a60c-209c-4c75-b63c-b7f73b2e1a56",
        },
        cursor: [0],
        side: "player",
      },
      kind: "pick-cards",
      options: {
        kind: "pick-cards",
        label: "Choose a card",
        candidateIds: ["void-instance", "battlefield-instance"],
        count: 1,
        optional: false,
        highlightCardIds: [],
      },
    } satisfies PendingPrompt;

    expect(createBattlePromptResolutionLogFields(board(), prompt, {
      kind: "pick-cards",
      chosenIds: ["battlefield-instance"],
    })).toEqual({
      dreamwellCardUuid: "2b23a60c-209c-4c75-b63c-b7f73b2e1a56",
      promptId: 81,
      promptKind: "pick-cards",
      promptLabel: "Choose a card",
      candidateBattleCardInstanceIds: ["void-instance", "battlefield-instance"],
      candidateBackingCardUuids: [
        "11111111-1111-4111-8111-111111111111",
        "22222222-2222-4222-8222-222222222222",
      ],
      candidateCards: [
        {
          battleCardInstanceId: "void-instance",
          backingCardUuid: "11111111-1111-4111-8111-111111111111",
          owner: "player",
          zone: "void",
        },
        {
          battleCardInstanceId: "battlefield-instance",
          backingCardUuid: "22222222-2222-4222-8222-222222222222",
          owner: "enemy",
          zone: "frontRank",
        },
      ],
      chosenBattleCardInstanceIds: ["battlefield-instance"],
      chosenBackingCardUuids: ["22222222-2222-4222-8222-222222222222"],
      finalResolution: {
        kind: "pick-cards",
        chosenIds: ["battlefield-instance"],
      },
    });
  });
});
