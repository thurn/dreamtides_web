import { beforeEach, describe, expect, it } from "vitest";
import { economyFixture } from "../../testing/economy-fixture";
import { opponentsFixture } from "../../testing/opponents-fixture";
import { draftDataFixture } from "../../testing/draft-data-fixture";
import { CONFIG_DATA_FIXTURE } from "../../testing/config-data-fixture";
import {
  MINIMAL_ATLAS_DATA,
  MINIMAL_DREAMSCAPES,
} from "../../__test-helpers__/atlas-fixtures";
import {
  makeBattleTestCardDatabase,
  makeBattleTestDreamAvatars,
  makeBattleTestState,
} from "../../battle/test-support";
import type { JourneyContent } from "../../data/journey-content";
import { createDefaultState } from "../../state/journey-context";
import type { JourneyState } from "../../types/journey";
import { getLogEntries, resetLog } from "../../logging";
import {
  createBattleInitProvider,
  createBattlePreview,
  settleDeferredOpponentLog,
} from "./battle-init-provider";

function makeContent(): JourneyContent {
  return {
    ...CONFIG_DATA_FIXTURE,
    draftData: draftDataFixture(),
    cardDatabase: makeBattleTestCardDatabase(),
    dreamAvatars: makeBattleTestDreamAvatars(),
    dreamwellCards: [],
    dreamsignTemplates: [],
    dreamscapes: MINIMAL_DREAMSCAPES,
    affiliations: [],
    guides: [],
    atlasData: MINIMAL_ATLAS_DATA,
    economyData: economyFixture(),
    opponentsData: opponentsFixture(),
  };
}

function makeJourney(): JourneyState {
  return {
    ...createDefaultState(),
    ...makeBattleTestState(),
    runId: "journey:test",
  };
}

describe("battle init provider", () => {
  beforeEach(() => resetLog());

  it("builds the same preview init that BEGIN_BATTLE will fold", () => {
    const content = makeContent();
    const journey = makeJourney();

    const preview = createBattlePreview(content, journey, "site-7", 4242);
    const battle = createBattleInitProvider(content).beginBattle({
      journey,
      siteId: "site-7",
      seedOverride: 4242,
      seq: 17,
      rng: () => 0,
      timestamp: new Date(0).toISOString(),
    });

    expect(preview).not.toBeNull();
    expect(battle?.init).toEqual(preview);
    expect(battle?.init.seed).toBe(4242);
    expect(getLogEntries()).toEqual([]);

    expect(settleDeferredOpponentLog(17, true)).toBe(true);
    expect(
      getLogEntries().some(
        (entry) => entry.event === "opponent_signature_cards_selected",
      ),
    ).toBe(true);
    expect(
      getLogEntries().some(
        (entry) => entry.event === "opponent_deck_constructed",
      ),
    ).toBe(true);
    const count = getLogEntries().length;
    expect(settleDeferredOpponentLog(17, true)).toBe(false);
    expect(getLogEntries()).toHaveLength(count);
  });
});
