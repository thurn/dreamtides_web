import { describe, expect, it } from "vitest";
import { BATTLE_EFFECT_FIXTURE_CARD_ID } from "../rules/battle/battle-card-effects-table";
import { isBattleCardSemanticPlayAutomated } from "./semantic-play";
import { testCardId } from "../types/test-identities";

describe("semantic play support", () => {
  it("uses the explicit audited card set instead of the trigger registry", () => {
    expect(
      isBattleCardSemanticPlayAutomated(
        testCardId("5a980eff-6ec7-44d8-9977-b98e66bbc2c8"),
      ),
    ).toBe(true);
    expect(
      isBattleCardSemanticPlayAutomated(
        testCardId(BATTLE_EFFECT_FIXTURE_CARD_ID),
      ),
    ).toBe(false);
  });
});
