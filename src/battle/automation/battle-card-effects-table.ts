import type { BattleDebugEdit } from "../debug/commands";
import type {
  BackRankSlotId,
  BattleCardInstance,
  BattleMutableState,
  BattleSide,
  FrontRankSlotId,
} from "../types";
import { BACK_RANK_SLOT_IDS, FRONT_RANK_SLOT_IDS } from "../types";
import type { EffectStep, StepContext } from "./effect-step";
import { alliesInPlay, gainEnergyEdits } from "./effect-step";
import { fnv1aHex } from "./rules-text-hash";

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

  // Nocturne Strummer — "Support – Supported characters have +2✦." Grants +2
  // spark to every supported front-rank ally (no subtype restriction).
  "5a980eff-6ec7-44d8-9977-b98e66bbc2c8": {
    id: "5a980eff-6ec7-44d8-9977-b98e66bbc2c8",
    trigger: "support",
    textHash: "a4a7189e",
    support: {
      bonus: () => 2,
    },
  },

  // Dreadmount Sovereign — "This character costs 1● less for each allied
  // warrior.\n\nSupport – Supported warriors have +3✦." The script grants +3
  // spark to supported front-rank "Warrior" allies; the cost-reduction clause
  // is resolved manually.
  "6497d8b1-85b8-486d-99e2-5c141486d508": {
    id: "6497d8b1-85b8-486d-99e2-5c141486d508",
    trigger: "support",
    textHash: "6a53a8c1",
    support: {
      bonus: () => 3,
      applies: (ally) => ally.definition.subtype === "Warrior",
    },
  },

  // Ash Sower — "❖ – Abandon an ally: Move this character to the abandoned
  // ally's position.\n\nSupport – Supported characters have +3✦." The script
  // grants +3 spark to every supported front-rank ally; the ❖ activated ability
  // is resolved manually.
  "8c9ef6a8-d93e-4149-a965-0bdbe2acf6bd": {
    id: "8c9ef6a8-d93e-4149-a965-0bdbe2acf6bd",
    trigger: "support",
    textHash: "be732f49",
    support: {
      bonus: () => 3,
    },
  },

  // Battlefield Medic — "❖ – 1●: Move this character to an unoccupied character
  // position.\n\nSupport – Supported characters have +2✦." The script grants +2
  // spark to every supported front-rank ally; the ❖ activated ability is
  // resolved manually.
  "c61c8b29-6911-4bbf-b1c4-0c18b22ed33f": {
    id: "c61c8b29-6911-4bbf-b1c4-0c18b22ed33f",
    trigger: "support",
    textHash: "0e53771a",
    support: {
      bonus: () => 2,
    },
  },

  // Ghostlight Wolves — "☪: Gain 1● for each allied spirit animal.\n\nSupport –
  // Supported spirit animals have +2✦." The script grants +2 spark to supported
  // front-rank "Spirit Animal" allies; the ☪ activated ability is resolved
  // manually.
  "c8579b20-95ff-4b1d-b4c6-6bd049fc4760": {
    id: "c8579b20-95ff-4b1d-b4c6-6bd049fc4760",
    trigger: "support",
    textHash: "6744fe3d",
    support: {
      bonus: () => 2,
      applies: (ally) => ally.definition.subtype === "Spirit Animal",
    },
  },
};

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

/**
 * Returns the registered cards whose live `renderedText` differs from the hash
 * stored in `BATTLE_CARD_EFFECTS`. `cardsById` maps card UUID → its current
 * `renderedText`. A card that is registered here but absent from `cardsById` is
 * reported with `actual: null` (missing from the catalog). An empty result
 * means every registered script still matches its target card's rules text.
 */
export function collectAutomationHashDrift(
  cardsById: ReadonlyMap<string, string>,
): { id: string; expected: string; actual: string | null }[] {
  const drift: { id: string; expected: string; actual: string | null }[] = [];
  for (const [id, script] of Object.entries(BATTLE_CARD_EFFECTS)) {
    const text = cardsById.get(id);
    const actual = text === undefined ? null : fnv1aHex(text);
    if (actual !== script.textHash) {
      drift.push({ id, expected: script.textHash, actual });
    }
  }
  return drift;
}

/**
 * Returns the `BattleCardEffectScript` for `cardId` if one exists, else `null`.
 */
export function selectBattleCardEffectScript(cardId: string): BattleCardEffectScript | null {
  return BATTLE_CARD_EFFECTS[cardId] ?? null;
}

/**
 * A Dawn script is interactive if any of its steps needs a player choice.
 * Interactive Dawn scripts run through the runner post-dawn, NOT the bookend
 * (the synchronous bookend produces a flat `BattleDebugEdit[]` and cannot pause
 * for a prompt). A script with only `edits` steps is deterministic.
 */
export function dawnScriptIsInteractive(script: BattleCardEffectScript): boolean {
  return (script.steps ?? []).some((s) => s.kind === "prompt");
}

/**
 * Edits from the active side's in-play ▸Dawn characters when automation resolves
 * the Dawn bookend. For each in-play character (front + back rank) of `side`
 * whose `definition.cardId` has a registered `"dawn"` script, runs each
 * edits-step `build(ctx)` and concatenates them, in stable slot order
 * (`alliesInPlay`: back rank then front rank). The `random`/`nowMs` injected
 * into the step context keep the builders pure.
 *
 * Interactive Dawn scripts (those with a `prompt` step, per
 * `dawnScriptIsInteractive`) are skipped ENTIRELY here — not even their
 * deterministic edits steps run — because they are routed through the React
 * runner post-dawn (`useBattleEffectRunner`). Contributing any of a mixed
 * deterministic+interactive script's edits here would double-apply them (once
 * in the bookend, again in the runner). Any other non-edits step in a
 * deterministic script is skipped defensively with a `console.warn`.
 */
export function collectDawnTriggerEdits(
  state: BattleMutableState,
  side: BattleSide,
  nowMs: number,
): BattleDebugEdit[] {
  const edits: BattleDebugEdit[] = [];
  const ctx: StepContext = { side, state, random: Math.random, nowMs };
  for (const occupantId of alliesInPlay(state, side)) {
    const instance = state.cardInstances[occupantId];
    if (instance === undefined) continue;
    const script = selectBattleCardEffectScript(instance.definition.cardId);
    if (script === null || script.trigger !== "dawn" || script.steps === undefined) {
      continue;
    }
    // Interactive Dawn scripts run through the runner post-dawn; skip them
    // wholesale here so a mixed script is never half-applied in the bookend.
    if (dawnScriptIsInteractive(script)) continue;
    for (const step of script.steps) {
      if (step.kind === "edits") {
        edits.push(...step.build(ctx));
      } else {
        console.warn(
          `collectDawnTriggerEdits: skipping non-edits step kind "${step.kind}" for card ${instance.definition.cardId}`,
        );
      }
    }
  }
  return edits;
}

/**
 * Returns the automation status of a battle card:
 * - `"auto"` — a script exists in `BATTLE_CARD_EFFECTS`.
 * - `"none"` — the card id is unregistered.
 */
export function battleCardAutomationStatus(cardId: string): "auto" | "none" {
  return cardId in BATTLE_CARD_EFFECTS ? "auto" : "none";
}

// ---------------------------------------------------------------------------
// Support recompute
// ---------------------------------------------------------------------------

/**
 * Back-rank → front-rank Support geometry (rules §Support). A back-rank
 * Supporter in a given slot benefits the up-to-two front-rank occupants of the
 * slots listed here:
 * `B0→[F0]`, `B1→[F0,F1]`, `B2→[F1,F2]`, `B3→[F2,F3]`, `B4→[F3]`.
 */
export const SUPPORT_ADJACENCY: Record<BackRankSlotId, FrontRankSlotId[]> = {
  B0: ["F0"],
  B1: ["F0", "F1"],
  B2: ["F1", "F2"],
  B3: ["F2", "F3"],
  B4: ["F3"],
};

/**
 * Computes the `SET_CARD_STATIC_SPARK_BONUS` edits needed to bring every
 * in-play instance's `staticSparkBonus` to its correct Support total. "In-play"
 * means front- and back-rank occupants of both sides; hand/void/deck instances
 * are never touched. Returns only the edits where the target differs from the
 * current value, so it is idempotent: calling it on a state whose bonuses
 * already match the computed targets emits an empty list (the runner that calls
 * it does not loop). When `enabled` is `false` every target is `0`, clearing any
 * prior bonus. Only back-rank Supporters with a registered `"support"` script
 * grant spark, and only to the front-rank occupants of the slots they support
 * that pass the script's optional `applies` predicate. Iteration follows
 * `BACK_RANK_SLOT_IDS`/`FRONT_RANK_SLOT_IDS` order for deterministic output.
 */
export function planSupportRecompute(
  state: BattleMutableState,
  enabled: boolean,
  nowMs: number,
): BattleDebugEdit[] {
  const sides: BattleSide[] = ["player", "enemy"];

  // 1. Default every in-play instance to a target of 0.
  const targets = new Map<string, number>();
  for (const side of sides) {
    for (const slotId of BACK_RANK_SLOT_IDS) {
      const id = state.sides[side].backRank[slotId];
      if (id !== null) targets.set(id, 0);
    }
    for (const slotId of FRONT_RANK_SLOT_IDS) {
      const id = state.sides[side].frontRank[slotId];
      if (id !== null) targets.set(id, 0);
    }
  }

  // 2. Accumulate Support bonuses from back-rank Supporters onto front allies.
  if (enabled) {
    for (const side of sides) {
      const ctx: StepContext = { side, state, random: Math.random, nowMs };
      for (const backSlot of BACK_RANK_SLOT_IDS) {
        const supporterId = state.sides[side].backRank[backSlot];
        if (supporterId === null) continue;
        const supporter = state.cardInstances[supporterId];
        if (supporter === undefined) continue;
        const script = selectBattleCardEffectScript(supporter.definition.cardId);
        if (script === null || script.trigger !== "support" || script.support === undefined) {
          continue;
        }
        const support = script.support;
        for (const frontSlot of SUPPORT_ADJACENCY[backSlot]) {
          const allyId = state.sides[side].frontRank[frontSlot];
          if (allyId === null) continue;
          const ally = state.cardInstances[allyId];
          if (ally === undefined) continue;
          if (support.applies !== undefined && !support.applies(ally, ctx)) continue;
          targets.set(allyId, (targets.get(allyId) ?? 0) + support.bonus(ctx));
        }
      }
    }
  }

  // 3. Emit an edit for every instance whose current bonus differs from target.
  const edits: BattleDebugEdit[] = [];
  for (const side of sides) {
    for (const slotId of BACK_RANK_SLOT_IDS) {
      const id = state.sides[side].backRank[slotId];
      if (id !== null) pushIfChanged(edits, state, id, targets.get(id) ?? 0);
    }
    for (const slotId of FRONT_RANK_SLOT_IDS) {
      const id = state.sides[side].frontRank[slotId];
      if (id !== null) pushIfChanged(edits, state, id, targets.get(id) ?? 0);
    }
  }
  return edits;
}

/** Appends a `SET_CARD_STATIC_SPARK_BONUS` edit when `target` differs from the
 *  instance's current `staticSparkBonus`. */
function pushIfChanged(
  edits: BattleDebugEdit[],
  state: BattleMutableState,
  battleCardId: string,
  target: number,
): void {
  const instance = state.cardInstances[battleCardId];
  if (instance === undefined) return;
  if (instance.staticSparkBonus === target) return;
  edits.push({ kind: "SET_CARD_STATIC_SPARK_BONUS", battleCardId, value: target });
}
