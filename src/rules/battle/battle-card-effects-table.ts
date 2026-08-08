import type { BattleDebugEdit } from "../../battle/debug/commands";
import { supportedDeploySlots, supportingReserveSlots } from "../../battle/engine/support";
import { countAlliedWarriors } from "../../battle/state/figments";
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
import { createMessageDescriptor } from "../../data/localization-descriptors";

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
  /** `fnv1aHex` of the exact authored text this script implements. */
  textHash?: string;
  triggers: Partial<Record<BattleScriptTrigger, readonly EffectStep[]>>;
}

/** Stable synthetic ids used exclusively by reducer-level framework fixtures. */
export const BATTLE_EFFECT_FIXTURE_CARD_ID = "00000000-0000-4000-8000-000000000101";
export const BATTLE_EFFECT_PROMPT_FIXTURE_CARD_ID = "00000000-0000-4000-8000-000000000102";
export const BATTLE_EFFECT_DISSOLVE_SUPPORT_FIXTURE_CARD_ID = "00000000-0000-4000-8000-000000000103";

const FIXTURE_TRIGGER_STEPS: readonly EffectStep[] = [{
  kind: "edits",
  build: (ctx) => [{ kind: "ADJUST_SCORE", side: ctx.side, amount: 1 }],
}];

/**
 * This resolver table intentionally contains only small framework fixtures;
 * the production support registry above remains the audited card catalog.
 */
export const BATTLE_TRIGGERED_EFFECTS: Record<string, BattleTriggeredEffectScript> = {
  // Starter tutorial/automated battle rules.  These ids are the source of
  // truth; names are intentionally absent because card names are not unique.
  "5a980eff-6ec7-44d8-9977-b98e66bbc2c8": {
    id: "5a980eff-6ec7-44d8-9977-b98e66bbc2c8", textHash: "a4a7189e", triggers: {},
  },
  "647f5150-b2e0-424b-9480-27557642524e": {
    id: "647f5150-b2e0-424b-9480-27557642524e", textHash: "153cdaf2",
    triggers: { materialized: [{ kind: "prompt", prompt: { kind: "foresee", count: 1 } }] },
  },
  "e83014d3-9d35-4e80-a1b3-9b25360ad2af": {
    id: "e83014d3-9d35-4e80-a1b3-9b25360ad2af", textHash: "811c9dc5", triggers: {},
  },
  "a28ad36d-fa74-4190-a463-7efd3a6233d0": {
    id: "a28ad36d-fa74-4190-a463-7efd3a6233d0", textHash: "ce8fae02",
    triggers: { dawn: [{ kind: "edits", build: (ctx) => [{ kind: "ADJUST_SCORE", side: ctx.side, amount: 1 }] }] },
  },
  "a526fa7b-5cef-4da9-a3f2-27ee0bd9b481": {
    id: "a526fa7b-5cef-4da9-a3f2-27ee0bd9b481", textHash: "9a004bcb",
    triggers: { dissolved: [{ kind: "edits", build: (ctx) => [{ kind: "DRAW_CARD", side: ctx.side }] }], abandoned: [{ kind: "edits", build: (ctx) => [{ kind: "DRAW_CARD", side: ctx.side }] }] },
  },
  "5ab11bef-5dcd-49f5-be49-ae2ccde76e70": {
    id: "5ab11bef-5dcd-49f5-be49-ae2ccde76e70", textHash: "42ad9866", triggers: {},
  },
  "4408b942-09a0-4f4e-a403-10c708c6e3c5": {
    id: "4408b942-09a0-4f4e-a403-10c708c6e3c5", textHash: "ad1c27c7",
    triggers: { played: [{ kind: "edits", build: (ctx) => {
      const target = ctx.bindings?.targetBattleCardIds?.[0];
      const instance = target === undefined ? undefined : ctx.state.cardInstances[target];
      if (target === undefined || instance === undefined) return [];
      if (instance.status.veil) {
        return [{ kind: "SET_CARD_STATUS", battleCardId: target, status: { veil: false } }];
      }
      return [{ kind: "MOVE_CARD_TO_ZONE", battleCardId: target, destination: { side: ctx.side === "player" ? "enemy" : "player", zone: "void" } }];
    } }] },
  },
  "2162742c-09d0-4e62-ae49-0f8f79b45adc": {
    id: "2162742c-09d0-4e62-ae49-0f8f79b45adc", textHash: "7776dd2f",
    triggers: { played: [{ kind: "edits", build: (ctx) => [{ kind: "DRAW_CARD", side: ctx.side }] }, { kind: "prompt", prompt: { kind: "foresee", count: 1 } }] },
  },
  "910b4cf9-dec7-4e03-af4f-7d5ae342eeba": {
    id: "910b4cf9-dec7-4e03-af4f-7d5ae342eeba", textHash: "469120a4",
    triggers: { played: [{ kind: "prompt", prompt: {
      kind: "pick-cards", label: createMessageDescriptor("battle-prompt-discover-character"), count: 1, optional: false,
      candidates: (ctx) => sampleDiscoverCharacters(ctx),
      resolve: (chosenIds, ctx) => resolveDiscoverChoice(chosenIds, ctx),
    } }] },
  },
  "944e15d2-d680-4ebe-8d18-36826f4b1535": {
    id: "944e15d2-d680-4ebe-8d18-36826f4b1535", textHash: "03e76b70",
    triggers: { played: [{ kind: "edits", build: (ctx) => {
      const target = ctx.bindings?.targetBattleCardIds?.[0];
      const instance = target === undefined ? undefined : ctx.state.cardInstances[target];
      if (target === undefined || instance === undefined) return [];
      return [{ kind: "SET_CARD_SPARK_DELTA", battleCardId: target, value: instance.sparkDelta + 3 }];
    } }] },
  },
  "229ab3a1-3720-41a2-924c-8fe112188f8e": {
    id: "229ab3a1-3720-41a2-924c-8fe112188f8e",
    textHash: "811c9dc5",
    triggers: {},
  },
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
          label: createMessageDescriptor("battle-prompt-generic"),
          onYes: FIXTURE_TRIGGER_STEPS as EffectStep[],
        },
      }],
      dissolved: [{
        kind: "prompt",
        prompt: {
          kind: "confirm",
          label: createMessageDescriptor("battle-prompt-generic"),
          onYes: FIXTURE_TRIGGER_STEPS as EffectStep[],
        },
      }],
    },
  },
  [BATTLE_EFFECT_DISSOLVE_SUPPORT_FIXTURE_CARD_ID]: {
    id: BATTLE_EFFECT_DISSOLVE_SUPPORT_FIXTURE_CARD_ID,
    triggers: {
      // Framework-only fixture: proves an F0 dissolution can change F1's
      // support before the cursor evaluates F1.
      dissolved: [{
        kind: "edits",
        build: (ctx) => {
          const battleCardId = ctx.state.sides[ctx.side].backRank.B1;
          return battleCardId === null
            ? []
            : [{
              kind: "MOVE_CARD_TO_ZONE",
              battleCardId,
              destination: { side: ctx.side, zone: "void" },
            }];
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
    textHash: "c72e97a0",
    support: {
      bonus: () => 1,
      applies: (ally) => ally.definition.subtype === "Spirit Animal",
    },
  },
  "56411ed4-bda9-4fdf-82e5-b5492de67039": {
    id: "56411ed4-bda9-4fdf-82e5-b5492de67039",
    trigger: "support",
    textHash: "84f5be41",
    support: {
      bonus: (ctx) => countAlliedWarriors(ctx.state, ctx.side),
    },
  },
  "1268a899-b209-46bb-bce4-6def1dcd0404": {
    id: "1268a899-b209-46bb-bce4-6def1dcd0404",
    trigger: "support",
    textHash: "04484014",
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
    textHash: "7415a86e",
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
  for (const [id, script] of Object.entries(BATTLE_TRIGGERED_EFFECTS)) {
    if (script.textHash === undefined || BATTLE_CARD_EFFECTS[id] !== undefined) continue;
    const text = cardsById.get(id);
    const actual = text === undefined ? null : fnv1aHex(text);
    if (actual !== script.textHash) drift.push({ id, expected: script.textHash, actual });
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
 * idempotent. A figment stack stores the per-figment Support bonus here, and
 * its spark selectors apply that bonus once to each member.
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
    // Rusted Colossus receives its own static contribution for every occupied
    // geometrically supporting back-rank slot.  The supporting character need
    // not itself have Support.
    for (const side of sides) {
      for (const frontSlot of rankSlotIds(state.sides[side].frontRank)) {
        const recipientId = state.sides[side].frontRank[frontSlot];
        if (recipientId === null || state.cardInstances[recipientId]?.definition.cardId !== "5ab11bef-5dcd-49f5-be49-ae2ccde76e70") continue;
        const occupied = supportingReserveSlots(frontSlot).filter((slot) => state.sides[side].backRank[slot] !== null).length;
        targets.set(recipientId, (targets.get(recipientId) ?? 0) + occupied * 2);
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

function sampleDiscoverCharacters(ctx: StepContext): string[] {
  const candidates = ctx.state.sides[ctx.side].deck.filter((battleCardId) =>
    ctx.state.cardInstances[battleCardId]?.definition.battleCardKind === "character",
  );
  if (candidates.length === 0) return [];

  // A Discover prompt owns exactly one event-rng draw. Derive its whole sample
  // from that committed draw so re-rendering/reloading a parked prompt cannot
  // consume or resample randomness, while the three offered ids remain random.
  let seed = Math.floor(ctx.random() * 0x1_0000_0000) >>> 0;
  const nextRandom = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x1_0000_0000;
  };
  const pool = [...candidates];
  const offers: string[] = [];
  while (pool.length > 0 && offers.length < 3) {
    offers.push(pool.splice(Math.floor(nextRandom() * pool.length), 1)[0]);
  }
  return offers;
}

function resolveDiscoverChoice(chosenIds: string[], ctx: StepContext): BattleDebugEdit[] {
  const chosen = chosenIds[0];
  if (chosen === undefined) return [];
  const remaining = ctx.state.sides[ctx.side].deck.filter((id) => id !== chosen);
  for (let index = remaining.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(ctx.random() * (index + 1));
    [remaining[index], remaining[swap]] = [remaining[swap], remaining[index]];
  }
  return [
    { kind: "MOVE_CARD_TO_ZONE", battleCardId: chosen, destination: { side: ctx.side, zone: "hand" } },
    { kind: "REORDER_DECK", side: ctx.side, order: remaining },
  ];
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
  if (instance === undefined) return;
  if (instance.staticSparkBonus === target) return;
  edits.push({ kind: "SET_CARD_STATIC_SPARK_BONUS", battleCardId, value: target });
}
