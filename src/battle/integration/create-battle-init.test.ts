// Journey -> battle start smoke. These cases guard the frozen BattleInit that a
// journey Battle site hands to the battle fold, including the essence reward
// that END_BATTLE pays out, until the engine rewires the handoff.
import { describe, expect, it } from "vitest";
import {
  makeBattleTestAvatars,
  makeBattleTestCardDatabase,
  makeBattleTestSite,
  makeBattleTestState,
} from "../test-support";
import {
  createBattleInit,
  type CreateBattleInitInput,
} from "./create-battle-init";
import { economyFixture } from "../../testing/economy-fixture";
import { opponentsFixture } from "../../testing/opponents-fixture";
import { transfigurationFixture } from "../../testing/transfiguration-fixture";
import { parseBattleEntryKey } from "../../types/identifiers";
import { testJourneyMutationSource } from "../../types/test-identities";

function makeBaseInput(): CreateBattleInitInput {
  return {
    opponentsData: opponentsFixture(),
    transfigurationData: transfigurationFixture(),
    battleEntryKey: parseBattleEntryKey("site-7::2::dreamscape-2"),
    site: makeBattleTestSite(),
    state: makeBattleTestState(),
    cardDatabase: makeBattleTestCardDatabase(),
    avatars: makeBattleTestAvatars(),
  };
}

describe("createBattleInit", () => {
  it("creates a deterministic frozen battle init for a battle entry", () => {
    const input = makeBaseInput();

    const first = createBattleInit(input);
    const second = createBattleInit(input);

    expect(first.battleEntryKey).toBe("site-7::2::dreamscape-2");
    expect(first.battleId).toBe("battle:site-7::2::dreamscape-2");
    // battleId and battleEntryKey share a derivation but are distinct values.
    expect(first.battleId).not.toBe(first.battleEntryKey);
    expect(first.seed).toBe(second.seed);
    expect(first.playerDeckOrder).toEqual(second.playerDeckOrder);
    expect(first.enemyDescriptor).toEqual(second.enemyDescriptor);
    expect(Object.isFrozen(first)).toBe(true);
  });

  it("carries every journey deck entry into the player battle deck", () => {
    const init = createBattleInit(makeBaseInput());
    // The battle deck is padded up to the minimum size, so the same journey
    // entry id can appear multiple times; the set of distinct ids still
    // matches the journey deck exactly.
    const sourceIds = [
      ...new Set(
        init.playerDeckOrder
          .map((card) => card.sourceDeckEntryId)
          .filter((id): id is NonNullable<typeof id> => id !== null),
      ),
    ].sort();
    const inputIds = makeBaseInput()
      .state.deck.map((entry) => entry.entryId)
      .sort();
    expect(sourceIds).toEqual(inputIds);
  });

  it("derives the essence reward from the injected battle reward curve and its floor", () => {
    const economy = economyFixture();
    economy.battleReward = {
      baseEssence: 43,
      essencePerCompletionLevel: 17,
      minimumEssence: 11,
    };
    const state = {
      ...makeBattleTestState(),
      completionLevel: 3,
      battleModifiers: [
        {
          kind: "reward_reduction_flat" as const,
          amount: 200,
          battlesRemaining: 1,
          source: testJourneyMutationSource("journey:test"),
        },
      ],
    };

    const init = createBattleInit({
      ...makeBaseInput(),
      state,
      economyData: economy,
    });

    expect(init.completionLevelAtStart).toBe(3);
    expect(init.essenceReward).toBe(11);
  });
});
