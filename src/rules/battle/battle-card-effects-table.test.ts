import { describe, expect, it } from "vitest";
import {
  BATTLE_CARD_EFFECTS,
  battleCardAutomationStatus,
  selectBattleCardEffectScript,
} from "./battle-card-effects-table";

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

  it("every trigger is one of the allowed values", () => {
    for (const script of Object.values(BATTLE_CARD_EFFECTS)) {
      expect(["dawn", "materialized", "support"]).toContain(script.trigger);
    }
  });

  it('every "support" entry has a support object and no steps', () => {
    for (const script of Object.values(BATTLE_CARD_EFFECTS)) {
      if (script.trigger !== "support") continue;
      expect(script.support).toBeDefined();
      expect(script.steps).toBeUndefined();
    }
  });

  it('every "dawn"/"materialized" entry has a non-empty steps array and no support', () => {
    for (const script of Object.values(BATTLE_CARD_EFFECTS)) {
      if (script.trigger === "support") continue;
      expect(Array.isArray(script.steps)).toBe(true);
      expect(script.steps?.length ?? 0).toBeGreaterThan(0);
      expect(script.support).toBeUndefined();
    }
  });

  it('every "support" entry exposes callable bonus and (when present) applies', () => {
    for (const script of Object.values(BATTLE_CARD_EFFECTS)) {
      if (script.trigger !== "support") continue;
      expect(typeof script.support?.bonus).toBe("function");
      if (script.support?.applies !== undefined) {
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
