import type { BattleDebugEdit } from "../../battle/debug/commands";
import { supportedDeploySlots } from "../../battle/engine/support";
import type {
  BattleCardInstance,
  BattleMutableState,
  BattleSide,
} from "../../battle/types";
import { rankSlotIds } from "../../battle/types";
import type { StepContext } from "./effect-step";
import type { EffectStep } from "./effect-step";
import type { BattleScriptTrigger } from "./fold";
import { fnv1aHex } from "./rules-text-hash";

/** Describes the static spark a supporter grants to supported front-rank allies. */
export interface SupportScript {
  bonus: (ctx: StepContext) => number;
  applies?: (ally: BattleCardInstance, ctx: StepContext) => boolean;
}

/** A Support automation keyed by the source card UUID. */
export interface BattleCardEffectScript {
  id: string;
  trigger: "support";
  /** `fnv1aHex` of the `renderedText` this script targets. */
  textHash: string;
  support: SupportScript;
}

/**
 * A closure-backed battle script. The registry is code, never fold state; a
 * queued run references it by this stable UUID only. Static support remains a
 * separate contribution source on the same card registry.
 */
export interface BattleTriggeredEffectScript {
  id: string;
  triggers: Partial<Record<BattleScriptTrigger, readonly EffectStep[]>>;
}

/** Stable synthetic ids used exclusively by reducer-level framework fixtures. */
export const BATTLE_EFFECT_FIXTURE_CARD_ID = "00000000-0000-4000-8000-000000000101";
export const BATTLE_EFFECT_PROMPT_FIXTURE_CARD_ID = "00000000-0000-4000-8000-000000000102";

const FIXTURE_TRIGGER_STEPS: readonly EffectStep[] = [{
  kind: "edits",
  build: (ctx) => [{ kind: "ADJUST_SCORE", side: ctx.side, amount: 1 }],
}];

/**
 * This resolver table intentionally contains only small framework fixtures;
 * the production support registry above remains the audited card catalog.
 */
export const BATTLE_TRIGGERED_EFFECTS: Record<string, BattleTriggeredEffectScript> = {
  [BATTLE_EFFECT_FIXTURE_CARD_ID]: {
    id: BATTLE_EFFECT_FIXTURE_CARD_ID,
    triggers: {
      played: FIXTURE_TRIGGER_STEPS,
      materialized: FIXTURE_TRIGGER_STEPS,
      rematerialized: FIXTURE_TRIGGER_STEPS,
      dawn: FIXTURE_TRIGGER_STEPS,
      dissolved: FIXTURE_TRIGGER_STEPS,
      abandoned: FIXTURE_TRIGGER_STEPS,
    },
  },
  [BATTLE_EFFECT_PROMPT_FIXTURE_CARD_ID]: {
    id: BATTLE_EFFECT_PROMPT_FIXTURE_CARD_ID,
    triggers: {
      materialized: [{
        kind: "prompt",
        prompt: {
          kind: "confirm",
          label: "Run fixture effect?",
          onYes: FIXTURE_TRIGGER_STEPS as EffectStep[],
        },
      }],
    },
  },
};

const TRIGGER_ID_SEPARATOR = "#";

/** A stable registry key for one card UUID and lifecycle trigger. */
export function battleTriggerScriptId(cardId: string, trigger: BattleScriptTrigger): string {
  return `${cardId}${TRIGGER_ID_SEPARATOR}${trigger}`;
}

/** Returns the live steps for one UUID-keyed trigger script id, or null when unmodeled. */
export function selectBattleTriggeredEffectSteps(
  scriptId: string,
): EffectStep[] | null {
  const separator = scriptId.lastIndexOf(TRIGGER_ID_SEPARATOR);
  if (separator <= 0) return null;
  const cardId = scriptId.slice(0, separator);
  const trigger = scriptId.slice(separator + 1) as BattleScriptTrigger;
  const script = BATTLE_TRIGGERED_EFFECTS[cardId];
  if (script === undefined) return null;
  return script.triggers[trigger] === undefined ? null : [...script.triggers[trigger]];
}

/**
 * Static Support scripts keyed by card UUID. Character-triggered effects are
 * resolved manually; this registry contains only Support spark grants.
 */
export const BATTLE_CARD_EFFECTS: Record<string, BattleCardEffectScript> = {
  "4e3c04a9-1cdd-468a-b42a-40157ed9c9d6": {
    id: "4e3c04a9-1cdd-468a-b42a-40157ed9c9d6",
    trigger: "support",
    textHash: "77e9432c",
    support: {
      bonus: () => 1,
      applies: (ally) => ally.definition.subtype === "Spirit Animal",
    },
  },
  "1268a899-b209-46bb-bce4-6def1dcd0404": {
    id: "1268a899-b209-46bb-bce4-6def1dcd0404",
    trigger: "support",
    textHash: "facf0878",
    support: { bonus: () => 2 },
  },
  "5a980eff-6ec7-44d8-9977-b98e66bbc2c8": {
    id: "5a980eff-6ec7-44d8-9977-b98e66bbc2c8",
    trigger: "support",
    textHash: "a4a7189e",
    support: { bonus: () => 2 },
  },
  "6497d8b1-85b8-486d-99e2-5c141486d508": {
    id: "6497d8b1-85b8-486d-99e2-5c141486d508",
    trigger: "support",
    textHash: "a2c043a8",
    support: {
      bonus: () => 3,
      applies: (ally) => ally.definition.subtype === "Warrior",
    },
  },
  "8c9ef6a8-d93e-4149-a965-0bdbe2acf6bd": {
    id: "8c9ef6a8-d93e-4149-a965-0bdbe2acf6bd",
    trigger: "support",
    textHash: "b82fe41f",
    support: { bonus: () => 3 },
  },
  "c61c8b29-6911-4bbf-b1c4-0c18b22ed33f": {
    id: "c61c8b29-6911-4bbf-b1c4-0c18b22ed33f",
    trigger: "support",
    textHash: "b027ad8e",
    support: { bonus: () => 2 },
  },
  "c8579b20-95ff-4b1d-b4c6-6bd049fc4760": {
    id: "c8579b20-95ff-4b1d-b4c6-6bd049fc4760",
    trigger: "support",
    textHash: "7f113a7a",
    support: {
      bonus: () => 2,
      applies: (ally) => ally.definition.subtype === "Spirit Animal",
    },
  },
};

/** Returns registered scripts whose live rules text differs from its hash. */
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

/** Returns the Support script for `cardId`, or `null` when it is manual. */
export function selectBattleCardEffectScript(cardId: string): BattleCardEffectScript | null {
  return BATTLE_CARD_EFFECTS[cardId] ?? null;
}

/** Returns whether the card has automated Support behavior. */
export function battleCardAutomationStatus(cardId: string): "auto" | "none" {
  return cardId in BATTLE_CARD_EFFECTS ? "auto" : "none";
}

/**
 * Computes the Support edits needed to bring every in-play instance's
 * `staticSparkBonus` to its current total. The result is diff-based and
 * idempotent. Figment stack bonuses are maintained by the figment system and
 * are not overwritten here.
 */
export function planStaticContributionSettlement(
  state: BattleMutableState,
  enabled: boolean,
  random: () => number,
  nowMs: number,
): BattleDebugEdit[] {
  const sides: BattleSide[] = ["player", "enemy"];
  const targets = new Map<string, number>();

  for (const side of sides) {
    for (const slotId of rankSlotIds(state.sides[side].backRank)) {
      const id = state.sides[side].backRank[slotId];
      if (id !== null) targets.set(id, 0);
    }
    for (const slotId of rankSlotIds(state.sides[side].frontRank)) {
      const id = state.sides[side].frontRank[slotId];
      if (id !== null) targets.set(id, 0);
    }
  }

  if (enabled) {
    for (const side of sides) {
      const ctx: StepContext = { side, state, random, nowMs };
      for (const backSlot of rankSlotIds(state.sides[side].backRank)) {
        const supporterId = state.sides[side].backRank[backSlot];
        if (supporterId === null) continue;
        const supporter = state.cardInstances[supporterId];
        if (supporter === undefined) continue;
        const script = selectBattleCardEffectScript(supporter.definition.cardId);
        if (script === null) continue;

        for (const frontSlot of supportedDeploySlots(backSlot)) {
          const allyId = state.sides[side].frontRank[frontSlot];
          if (allyId === null) continue;
          const ally = state.cardInstances[allyId];
          if (ally === undefined) continue;
          if (script.support.applies !== undefined && !script.support.applies(ally, ctx)) {
            continue;
          }
          targets.set(allyId, (targets.get(allyId) ?? 0) + script.support.bonus(ctx));
        }
      }
    }
  }

  const edits: BattleDebugEdit[] = [];
  for (const side of sides) {
    for (const slotId of rankSlotIds(state.sides[side].backRank)) {
      const id = state.sides[side].backRank[slotId];
      if (id !== null) pushIfChanged(edits, state, id, targets.get(id) ?? 0);
    }
    for (const slotId of rankSlotIds(state.sides[side].frontRank)) {
      const id = state.sides[side].frontRank[slotId];
      if (id !== null) pushIfChanged(edits, state, id, targets.get(id) ?? 0);
    }
  }
  return edits;
}

/** Compatibility export for callers that still use the former Support name. */
export const planSupportRecompute = planStaticContributionSettlement;

function pushIfChanged(
  edits: BattleDebugEdit[],
  state: BattleMutableState,
  battleCardId: string,
  target: number,
): void {
  const instance = state.cardInstances[battleCardId];
  if (instance === undefined || instance.provenance?.kind === "generated-figment") return;
  if (instance.staticSparkBonus === target) return;
  edits.push({ kind: "SET_CARD_STATIC_SPARK_BONUS", battleCardId, value: target });
}
