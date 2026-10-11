/**
 * The card-lab (`?goto=card-lab&card=<uuid>&variant=<v>&as=<side>`): a
 * deterministic battle that plays one catalog card in one variant, built
 * from the setup solver (`lab-solver.ts`) plus `lab-overrides.ts`, for the
 * card-lab QA scene and the card sweep (`scripts/qa/card-sweep.mjs`). As
 * the enemy without a declaration, the lab opens with its play of the card on the
 * stack, so the AI host answers its prompts and the human follows it.
 */
import type { EngineCardDefinition } from "../catalog";
import type { Engine } from "../engine";
import type { EngineEvent } from "../events";
import { createFoldAdapter, type BattleSlice } from "../fold/slice";
import { BACK_RANK_SIZE, FRONT_RANK_SIZE, SIDES, type CardId, type InstanceId, type Side } from "../state/ids";
import type { BattleInit, DeckEntry } from "../state/types";
import { logEvent } from "../../logging";
import { cardIdFromUnknown } from "../../types/card-identity";
import { actionsEqual, allowedBy, type Action } from "../rules/actions";
import { applyDebugOp } from "../debug/debug-actions";
import type { TransfigurationType } from "../../types/journey";
import { fixedEnergy } from "../dsl/energy";
import type { BoardSetup } from "./board";
import { labBoard } from "./lab-solver";
import { SYNTHETIC } from "./synthetic-cards";
import { promptLabBattle, type LabStep, type PromptLabFixture } from "./prompt-lab";

/** Every variant the card-lab plays: the base card and each transfiguration. */
export const CARD_LAB_VARIANTS = [
  "base",
  "amplified",
  "empowered",
  "kindled",
  "resonant",
  "inspired",
  "enduring",
  "hastened",
  "attuned",
  "perfected",
] as const;

export type CardLabVariant = (typeof CARD_LAB_VARIANTS)[number];

const TRANSFIGURATIONS: Readonly<Record<Exclude<CardLabVariant, "base">, TransfigurationType>> = {
  amplified: "Amplified",
  empowered: "Empowered",
  kindled: "Kindled",
  resonant: "Resonant",
  inspired: "Inspired",
  enduring: "Enduring",
  hastened: "Hastened",
  attuned: "Attuned",
  perfected: "Perfected",
};

/** The variant a URL token names, or `null`. */
export function cardLabVariant(token: string): CardLabVariant | null {
  return CARD_LAB_VARIANTS.find((variant) => variant === token) ?? null;
}

/** The journey transfiguration a variant applies; `null` for the base card. */
export function variantTransfiguration(variant: CardLabVariant): TransfigurationType | null {
  return variant === "base" ? null : TRANSFIGURATIONS[variant];
}

/** A card-lab request: one card UUID's deck entry, with its variant, played by `side`. */
export interface CardLabRequest {
  readonly entry: DeckEntry;
  readonly variant: CardLabVariant;
  readonly side: Side;
  readonly stage?: CardLabStage;
}

/** Physical references name the initial enemy slot, never a printing or display name. */
interface LabCardRef {
  readonly zone: "front" | "back" | "hand" | "void";
  readonly index: number;
}

type LabEnemyStep =
  | { readonly kind: "play"; readonly ref: LabCardRef }
  | { readonly kind: "advance"; readonly ref: LabCardRef; readonly lane: number }
  | { readonly kind: "activate"; readonly ref: LabCardRef; readonly ability: number }
  | { readonly kind: "challenge" };

/** Supplied zones replace the solver's zones; omitted fields retain its defaults. */
export interface CardLabStage {
  readonly player?: LabSide;
  readonly enemy?: LabSide;
  readonly enemyScript?: readonly LabEnemyStep[];
}

interface LabSide {
  readonly front?: readonly (CardId | null)[];
  readonly back?: readonly (CardId | null)[];
  readonly hand?: readonly CardId[];
  readonly void?: readonly CardId[];
  readonly energy?: number;
}

/** Persisted only by a declared card-lab LOAD_STATE, consumed only in development. */
interface CardLabBattleInit extends BattleInit {
  readonly cardLabStage: { readonly kind: "declared-card-lab"; readonly stage: CardLabStage };
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function integer(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** Strict URL/save boundary: malformed fields throw before any board is published. */
export function cardLabStageFromUnknown(value: unknown): CardLabStage {
  const invalid = (): never => { throw new Error("Invalid declared card-lab stage"); };
  if (!record(value) || Object.keys(value).some((key) => !["player", "enemy", "enemyScript"].includes(key))) return invalid();
  const sides: Partial<Record<Side, LabSide>> = {};
  for (const side of SIDES) {
    const input = value[side];
    if (input === undefined) continue;
    if (!record(input) || Object.keys(input).some((key) => !["front", "back", "hand", "void", "energy"].includes(key))) return invalid();
    if (input.energy !== undefined && !integer(input.energy)) return invalid();
    const zones: Partial<LabSide> = {};
    for (const zone of ["front", "back", "hand", "void"] as const) {
      const cards = input[zone];
      if (cards === undefined) continue;
      if (!Array.isArray(cards) || (zone === "front" && cards.length > FRONT_RANK_SIZE) || (zone === "back" && cards.length > BACK_RANK_SIZE)) return invalid();
      const parsed = cards.map((card: unknown) => {
        if (card === null && (zone === "front" || zone === "back")) return null;
        const id = cardIdFromUnknown(card);
        return id ?? invalid();
      });
      // Each assignment preserves rank holes; hand and void forbid null above.
      Object.assign(zones, { [zone]: parsed });
    }
    sides[side] = { ...zones, ...(input.energy === undefined ? {} : { energy: input.energy }) };
  }
  if (value.enemyScript === undefined) return sides;
  if (!Array.isArray(value.enemyScript)) return invalid();
  const enemyScript: LabEnemyStep[] = value.enemyScript.map((step: unknown) => {
    if (!record(step)) return invalid();
    if (step.kind === "challenge" && Object.keys(step).length === 1) return { kind: "challenge" };
    if (step.kind !== "play" && step.kind !== "advance" && step.kind !== "activate") return invalid();
    if (Object.keys(step).some((key) => !["kind", "ref", ...(step.kind === "advance" ? ["lane"] : step.kind === "activate" ? ["ability"] : [])].includes(key))) return invalid();
    const ref = step.ref;
    if (!record(ref) || Object.keys(ref).some((key) => key !== "zone" && key !== "index") || !integer(ref.index)) return invalid();
    const zone = ref.zone;
    if (zone !== "front" && zone !== "back" && zone !== "hand" && zone !== "void") return invalid();
    if (step.kind === "play" && zone !== "hand" && zone !== "void") return invalid();
    const parsedRef: LabCardRef = { zone, index: ref.index };
    if (step.kind === "play") return { kind: "play", ref: parsedRef };
    if (step.kind === "activate") return integer(step.ability) ? { kind: "activate", ref: parsedRef, ability: step.ability } : invalid();
    if (!integer(step.lane) || step.lane >= FRONT_RANK_SIZE) return invalid();
    return { kind: "advance", ref: parsedRef, lane: step.lane };
  });
  return { ...sides, enemyScript };
}

function enemyActions(engine: Engine, stage: CardLabStage, base: BattleSlice): Action[] {
  return (stage.enemyScript ?? []).map((step) => {
    if (step.kind === "challenge") return { kind: "pass" };
    const side = base.committed.sides.enemy;
    const cards = step.ref.zone === "front" ? side.frontRank : step.ref.zone === "back" ? side.backRank : side[step.ref.zone];
    const card = cards[step.ref.index];
    if (card === null || card === undefined || base.committed.instances[card]?.controller !== "enemy") throw new Error("Declared lab script has no enemy physical card at its reference");
    if (step.kind === "activate") return { kind: "activate", source: card, ability: step.ability };
    if (step.kind === "advance") {
      const printing = base.committed.instances[card]?.printing;
      if (printing?.kind !== "card" || engine.catalog.card(printing.cardId).cardType !== "character") throw new Error("Declared lab advance requires a character");
      return { kind: "reposition", card, to: { rank: "front", index: step.lane } };
    }
    if (step.ref.zone !== "hand" && step.ref.zone !== "void") throw new Error("Declared lab play requires hand or void");
    return { kind: "play", card, from: step.ref.zone };
  });
}

interface ScriptFailure {
  readonly reason: "action-not-legal";
  readonly actionKind: Action["kind"];
  readonly stepIndex: number;
  readonly historyIndex: number;
  readonly instance: InstanceId | null;
  readonly sourceCardId: CardId | null;
}

function enemyDayReady(engine: Engine, slice: BattleSlice): boolean {
  const main = engine.decision(slice.committed);
  return slice.inFlight === null && main?.kind === "main" && main.side === "enemy" &&
    slice.committed.turn.active === "enemy" && slice.committed.turn.phase === "day";
}

/** The first invalid ready boundary in history deterministically stops a script. */
function scriptActionFailed(engine: Engine, init: BattleInit, slice: BattleSlice, action: Action, stepIndex: number, historyIndex: number): boolean {
  if (!enemyDayReady(engine, slice) || engine.legalActions(slice.committed, "enemy").some((legal) => allowedBy(legal, action, slice.committed))) return false;
  const instance = action.kind === "play" || action.kind === "reposition" ? action.card : action.kind === "activate" && typeof action.source === "string" ? action.source : null;
  const printing = instance === null ? undefined : slice.committed.instances[instance]?.printing;
  const failure: ScriptFailure = { reason: "action-not-legal", actionKind: action.kind, stepIndex, historyIndex, instance, sourceCardId: printing?.kind === "card" ? printing.cardId : null };
  logEvent("debug_card_lab_script_failed", { seed: init.seed, ...failure });
  return true;
}

/**
 * The live next enemy Day action, derived from successful replayed intents.
 * Answers, response passes, cancellations and undo never act as a script cursor.
 * Repeated reads and reloads make the same choice; the normal driver commits it.
 */
export function cardLabEnemyAction(engine: Engine, init: BattleInit, slice: BattleSlice): Action | null {
  if (!("cardLabStage" in init)) return null;
  const metadata = init.cardLabStage;
  if (!record(metadata) || metadata.kind !== "declared-card-lab") throw new Error("Invalid declared card-lab metadata");
  const stage = cardLabStageFromUnknown(metadata.stage);
  const history = slice.history;
  if (history === undefined) throw new Error("Declared lab script requires persisted history");
  const actions = enemyActions(engine, stage, history.base);
  if (actions.length === 0) return null;
  const adapter = createFoldAdapter(engine);
  let replay = history.base;
  let cursor = 0;
  let completing = false;
  for (const [historyIndex, entry] of history.entries.entries()) {
    if (cursor === actions.length) return null;
    if (scriptActionFailed(engine, init, replay, actions[cursor], cursor, historyIndex)) return null;
    if ("attempt" in entry) { replay = { ...replay, attempt: entry.attempt }; continue; }
    if ("debug" in entry) {
      const changed = applyDebugOp(engine, replay, entry.debug);
      if (changed.kind === "rejected") throw new Error("Declared lab history diverged at a debug intent");
      replay = changed.slice;
      continue;
    }
    const intent = entry.intent;
    const main = engine.decision(replay.committed);
    if (intent.kind === "battleAction" && intent.side === "enemy" && replay.inFlight === null &&
        main?.kind === "main" && replay.committed.turn.active === "enemy" && replay.committed.turn.phase === "day" &&
        actionsEqual(intent.action, actions[cursor])) completing = true;
    const outcome = adapter.reduce(replay, intent);
    if (outcome.kind === "bounced") throw new Error("Declared lab history diverged at a battle intent");
    replay = outcome.slice;
    if (intent.kind === "cancel" || outcome.error !== null) completing = false;
    if (completing && replay.inFlight === null) { cursor += 1; completing = false; }
  }
  if (cursor === actions.length) return null;
  if (!enemyDayReady(engine, slice)) return null;
  const action = actions[cursor];
  return scriptActionFailed(engine, init, slice, action, cursor, history.entries.length) ? null : action;
}

/**
 * The lab battle's fixture: the solved board (throws when the card stays
 * unplayable) and, as the enemy, the enemy's play of the card. The human
 * then also holds a no-effect Interrupt, beside any card the solver staged
 * in their hand, so the battle stops on the human's
 * response window (P1) with the card on the stack, and its resolution is
 * presented when the human passes. A card with a stack target first has
 * its opponent play the solver's opener, so as the player the battle
 * stops on the human's response window with the opener on the stack; as
 * the enemy the human's energy covers both the opener and the Interrupt.
 */
export function cardLabFixture(engine: Engine, request: CardLabRequest, pool: readonly EngineCardDefinition[]): PromptLabFixture {
  const stage = request.stage === undefined ? undefined : cardLabStageFromUnknown(request.stage);
  const { setup: solved, opener } = labBoard(engine, request.entry, pool, request.side, stage);
  if (stage !== undefined) {
    for (const side of SIDES) for (const id of [...(solved[side]?.front ?? []), ...(solved[side]?.back ?? [])]) {
      if (id !== null && engine.catalog.card(id).cardType !== "character") throw new Error("Declared lab ranks require characters");
    }
  }
  const responder = SYNTHETIC.interruptEvent;
  const setup: BoardSetup =
    request.side === "enemy" && stage === undefined
      ? { ...solved, player: { ...solved.player, hand: [...(solved.player?.hand ?? []), responder.id], energy: (solved.player?.energy ?? 0) + fixedEnergy(responder.costs) } }
      : solved;
  const name = `card-lab:${request.entry.cardId}:${request.variant}:${request.side}`;
  // Each scripted play is the side's first hand card.
  const playFirst = (side: Side): LabStep => ({
    side,
    action: (ids) => {
      const card = ids[side].hand[0];
      if (card === undefined) throw new Error(`${name} places no ${side} hand card`);
      return { kind: "play", card, from: "hand" };
    },
  });
  return {
    name,
    description: `The card-lab battle of ${request.entry.cardId} (${request.variant}) for the ${request.side}`,
    setup,
    script: [
      ...(opener === null ? [] : [playFirst(opener)]),
      ...(request.side === "enemy" && stage === undefined ? [playFirst("enemy")] : []),
    ],
  };
}

/** The card-lab battle: its init and slice at play, with optional scripted-event observation. */
export function cardLabBattle(
  engine: Engine,
  request: CardLabRequest,
  pool: readonly EngineCardDefinition[],
  published?: (events: readonly EngineEvent[]) => void,
): { init: BattleInit; slice: BattleSlice } {
  const lab = promptLabBattle(engine, cardLabFixture(engine, request, pool), published);
  if (request.stage === undefined) return lab;
  const stage = cardLabStageFromUnknown(request.stage);
  enemyActions(engine, stage, lab.slice);
  const init: CardLabBattleInit = { ...lab.init, cardLabStage: { kind: "declared-card-lab", stage } };
  return { ...lab, init };
}
