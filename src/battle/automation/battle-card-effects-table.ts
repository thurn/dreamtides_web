import type { BattleCardInstance } from "../types";
import type { EffectStep, StepContext } from "./effect-step";
import { gainEnergyEdits } from "./effect-step";

// ---------------------------------------------------------------------------
// Battle-card effect registry types
// ---------------------------------------------------------------------------

/**
 * Describes the static spark a supporter grants to each front-rank ally it
 * supports.
 */
export interface SupportScript {
  /** Static spark each supported front-rank ally gains from this supporter. */
  bonus: (ctx: StepContext) => number;
  /** Optional filter; defaults to all supported front-rank occupants. */
  applies?: (ally: BattleCardInstance, ctx: StepContext) => boolean;
}

/**
 * A scripted automation for a battle card, keyed in `BATTLE_CARD_EFFECTS` by
 * the card's UUID. `"dawn"`/`"materialized"` entries carry a non-empty `steps`
 * array; `"support"` entries carry a `support` object instead.
 */
export interface BattleCardEffectScript {
  /** Card UUID; equals the map key. */
  id: string;
  trigger: "dawn" | "materialized" | "support";
  /** `fnv1aHex` of the `renderedText` this script targets, for drift detection. */
  textHash: string;
  /** Ordered steps for `"dawn"`/`"materialized"` triggers. */
  steps?: EffectStep[];
  /** Spark grant for `"support"` triggers. */
  support?: SupportScript;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/**
 * Battle-card effect scripts keyed by the card UUID. Each entry's `.id` equals
 * its key. `"dawn"`/`"materialized"` entries automate the named trigger via
 * their `steps`; `"support"` entries describe the static spark a supporter
 * grants to the front-rank allies it supports.
 */
export const BATTLE_CARD_EFFECTS: Record<string, BattleCardEffectScript> = {
  // Driftcaller Sovereign — "▸Dawn: Gain 1●.\n\n4●, ☪: This character gains +1✦."
  // The script automates only the ▸Dawn energy gain; the activated ability is
  // resolved manually.
  "9b9c2743-75b3-499d-b5fb-c3429c92d420": {
    id: "9b9c2743-75b3-499d-b5fb-c3429c92d420",
    trigger: "dawn",
    textHash: "71765292",
    steps: [{ kind: "edits", build: (ctx) => gainEnergyEdits(ctx.side, 1) }],
  },

  // Ashwalker — "▸Materialized: Erode 3.\n\n▸Dissolved: Return a character from
  // your void to your hand." The script automates only the ▸Materialized Erode.
  "1cfc72e9-b75c-4d55-8bcf-54bb301d7e40": {
    id: "1cfc72e9-b75c-4d55-8bcf-54bb301d7e40",
    trigger: "materialized",
    textHash: "8d143597",
    steps: [{ kind: "edits", build: ({ side }) => [{ kind: "ERODE", side, count: 3 }] }],
  },

  // Eternal Stag — "Support – Supported spirit animals have +1✦.\n\n2●, ☪: Draw
  // a spirit animal." Supported front-rank allies whose subtype is "Spirit
  // Animal" gain +1 spark.
  "4e3c04a9-1cdd-468a-b42a-40157ed9c9d6": {
    id: "4e3c04a9-1cdd-468a-b42a-40157ed9c9d6",
    trigger: "support",
    textHash: "77e9432c",
    support: {
      bonus: () => 1,
      applies: (ally) => ally.definition.subtype === "Spirit Animal",
    },
  },

  // Woodland Apparition — "Support – Supported allies have +2✦ and have
  // unstoppable.\n\nReclaim – 3●, Banish 3 cards from your void." The script
  // grants the +2 spark to every supported ally; the unstoppable grant is
  // resolved manually.
  "1268a899-b209-46bb-bce4-6def1dcd0404": {
    id: "1268a899-b209-46bb-bce4-6def1dcd0404",
    trigger: "support",
    textHash: "efc84b0a",
    support: {
      bonus: () => 2,
    },
  },
};

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

/**
 * Returns the `BattleCardEffectScript` for `cardId` if one exists, else `null`.
 */
export function selectBattleCardEffectScript(cardId: string): BattleCardEffectScript | null {
  return BATTLE_CARD_EFFECTS[cardId] ?? null;
}

/**
 * Returns the automation status of a battle card:
 * - `"auto"` — a script exists in `BATTLE_CARD_EFFECTS`.
 * - `"none"` — the card id is unregistered.
 */
export function battleCardAutomationStatus(cardId: string): "auto" | "none" {
  return cardId in BATTLE_CARD_EFFECTS ? "auto" : "none";
}
