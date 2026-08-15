import { beforeEach, describe, expect, it } from "vitest";
import { economyFixture } from "../../testing/economy-fixture";
import { opponentsFixture } from "../../testing/opponents-fixture";
import { draftDataFixture } from "../../testing/draft-data-fixture";
import { CONFIG_DATA_FIXTURE } from "../../testing/config-data-fixture";
import {
  MINIMAL_ATLAS_DATA,
  MINIMAL_DREAMSCAPES,
  MINIMAL_SITES_DATA,
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
import {
  testDreamwellCardId,
  testDreamwellCardName,
} from "../../types/test-identities";
import { parseJourneyId } from "../../types/identifiers";
import { parseSiteId } from "../../types/identifiers";
import { hashState } from "../../eventlog/hash";

function makeContent(): JourneyContent {
  return {
    ...CONFIG_DATA_FIXTURE,
    draftData: draftDataFixture(),
    cardDatabase: makeBattleTestCardDatabase(),
    dreamAvatars: makeBattleTestDreamAvatars(),
    dreamwellCards: [
      {
        id: testDreamwellCardId("json-safe-battle"),
        name: testDreamwellCardName("JSON-safe Battle"),
        renderedText: "Synthetic Dreamwell fixture.",
        order: 0,
        energyAdded: 1,
        cardNumber: 1,
      },
    ],
    dreamsignTemplates: [],
    dreamscapes: MINIMAL_DREAMSCAPES,
    affiliations: [],
    guides: [],
    atlasData: MINIMAL_ATLAS_DATA,
    sitesData: MINIMAL_SITES_DATA,
    economyData: economyFixture(),
    opponentsData: opponentsFixture(),
  };
}

function makeJourney(): JourneyState {
  return {
    ...createDefaultState(),
    ...makeBattleTestState(),
    runId: parseJourneyId("journey:test"),
  };
}

describe("battle init provider", () => {
  beforeEach(() => resetLog());

  it("builds the same preview init that BEGIN_BATTLE will fold", () => {
    const content = makeContent();
    const journey = makeJourney();

    const preview = createBattlePreview(
      content,
      journey,
      parseSiteId("site-7"),
      4242,
    );
    const battle = createBattleInitProvider(content).beginBattle({
      journey,
      siteId: parseSiteId("site-7"),
      seedOverride: 4242,
      seq: 17,
      rng: () => 0,
      timestamp: new Date(0).toISOString(),
    });

    expect(preview).not.toBeNull();
    expect(battle?.init).toEqual(preview);
    expect(battle?.init.seed).toBe(4242);
    expect(() => hashState(battle)).not.toThrow();
    expect(hashState(JSON.parse(JSON.stringify(battle)))).toBe(
      hashState(battle),
    );
    expect(getLogEntries()).toEqual([]);

    expect(settleDeferredOpponentLog(17, true)).toBe(true);
    expect(
      getLogEntries().some(
        (entry) => entry.event === "opponent_signature_cards_selected",
      ),
    ).toBe(true);
    const count = getLogEntries().length;
    expect(settleDeferredOpponentLog(17, true)).toBe(false);
    expect(getLogEntries()).toHaveLength(count);
  });
});
