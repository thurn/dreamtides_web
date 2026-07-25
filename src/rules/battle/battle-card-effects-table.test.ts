import { describe, expect, it } from "vitest";
import {
  BATTLE_EFFECT_FIXTURE_CARD_ID,
  BATTLE_CARD_EFFECTS,
  battleTriggerScriptId,
  battleCardAutomationStatus,
  selectBattleCardEffectScript,
} from "./battle-card-effects-table";
import { newEffectRun, resolveScript, type EffectRun } from "./fold";

const UNREGISTERED_ID = "00000000-0000-0000-0000-000000000000";

// ---------------------------------------------------------------------------
// Structural invariants — not membership
// ---------------------------------------------------------------------------

describe("BATTLE_CARD_EFFECTS structural invariants", () => {
  it("every entry's id equals its map key", () => {
    for (const [key, script] of Object.entries(BATTLE_CARD_EFFECTS)) {
      expect(script.id).toBe(key);
    }
  });

  it("contains only Support scripts", () => {
    for (const script of Object.values(BATTLE_CARD_EFFECTS)) {
      expect(script.trigger).toBe("support");
    }
  });

  it("every entry exposes callable Support behavior", () => {
    for (const script of Object.values(BATTLE_CARD_EFFECTS)) {
      expect(typeof script.support.bonus).toBe("function");
      if (script.support.applies !== undefined) {
        expect(typeof script.support.applies).toBe("function");
      }
    }
  });
});

// ---------------------------------------------------------------------------
// battleCardAutomationStatus contract
// ---------------------------------------------------------------------------

describe("battleCardAutomationStatus", () => {
  it('returns "auto" for a registered id', () => {
    for (const registeredId of Object.keys(BATTLE_CARD_EFFECTS)) {
      expect(battleCardAutomationStatus(registeredId)).toBe("auto");
    }
  });

  it('returns "none" for an unregistered id', () => {
    expect(battleCardAutomationStatus(UNREGISTERED_ID)).toBe("none");
  });

  it('returns "none" for a character with a manual triggered effect', () => {
    expect(battleCardAutomationStatus("647f5150-b2e0-424b-9480-27557642524e")).toBe("none");
  });
});

// ---------------------------------------------------------------------------
// selectBattleCardEffectScript contract
// ---------------------------------------------------------------------------

describe("selectBattleCardEffectScript", () => {
  it("returns the entry for a registered id", () => {
    for (const registeredId of Object.keys(BATTLE_CARD_EFFECTS)) {
      const script = selectBattleCardEffectScript(registeredId);
      expect(script).not.toBeNull();
      expect(script?.id).toBe(registeredId);
    }
  });

  it("returns null for an unregistered id", () => {
    expect(selectBattleCardEffectScript(UNREGISTERED_ID)).toBeNull();
  });
});

describe("battle trigger script registry", () => {
  it("resolves UUID#trigger ids without placing closures in persisted runs", () => {
    const scriptRef = {
      table: "battle" as const,
      id: battleTriggerScriptId(BATTLE_EFFECT_FIXTURE_CARD_ID, "dissolved"),
    };
    expect(resolveScript(scriptRef)).toHaveLength(1);

    const run = newEffectRun(scriptRef, "player", "instance-1", {
      trigger: "dissolved",
      sourceCardId: BATTLE_EFFECT_FIXTURE_CARD_ID,
      sourceController: "player",
      sourceZone: "frontRank",
    });
    const restored = JSON.parse(JSON.stringify(run)) as EffectRun;
    expect(restored).toEqual(run);
    expect(resolveScript(restored.scriptRef)).toHaveLength(1);
  });
});
