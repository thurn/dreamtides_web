import { describe, expect, it } from "vitest";
import {
  MINIMAL_ATLAS_CONFIG,
  MINIMAL_DREAMSCAPES,
} from "../../__test-helpers__/atlas-fixtures";
import {
  makeBattleTestCardDatabase,
  makeBattleTestDreamcallers,
  makeBattleTestState,
} from "../../battle/test-support";
import type { QuestContent } from "../../data/quest-content";
import { createDefaultState } from "../../state/quest-context";
import type { QuestState } from "../../types/quest";
import {
  createBattleInitProvider,
  createBattlePreview,
} from "./battle-init-provider";

function makeContent(): QuestContent {
  return {
    cardDatabase: makeBattleTestCardDatabase(),
    dreamcallers: makeBattleTestDreamcallers(),
    dreamwellCards: [],
    dreamsignTemplates: [],
    dreamscapes: MINIMAL_DREAMSCAPES,
    affiliations: [],
    guides: [],
    atlasConfig: MINIMAL_ATLAS_CONFIG,
  };
}

function makeQuest(): QuestState {
  return {
    ...createDefaultState(),
    ...makeBattleTestState(),
    runId: "quest:test",
  };
}

describe("battle init provider", () => {
  it("builds the same preview init that BEGIN_BATTLE will fold", () => {
    const content = makeContent();
    const quest = makeQuest();

    const preview = createBattlePreview(content, quest, "site-7");
    const battle = createBattleInitProvider(content).beginBattle({
      quest,
      siteId: "site-7",
      rng: () => 0,
      timestamp: new Date(0).toISOString(),
    });

    expect(preview).not.toBeNull();
    expect(battle?.init).toEqual(preview);
  });
});
