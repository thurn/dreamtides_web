/** Node-side card-lab resolution checks; browser presentation remains the sweep's contract. */
import type { EngineCardDefinition } from "../catalog";
import { BATTLE } from "../../content/battle";
import type { Engine } from "../engine";
import type { EngineEvent } from "../events";
import { createFoldAdapter, type BattleIntent, type BattleSlice } from "../fold/slice";
import { firstLegalAnswer } from "../prompts/answers";
import type { CardId, DreamwellCardId, InstanceId, Side, Zone } from "../state/ids";
import { cardLabBattle, dreamwellLabBattle, type CardLabRequest, type CardLabVariant, type DreamwellLabRequest } from "./card-lab";

type FailureReason = "fixtureFailed" | "unplayable" | "engineError" | "stalled" | "missingResolution" | "unexpectedZone";

export interface LabPreflightResult {
  readonly uuid: CardId;
  readonly side: Side;
  readonly variant: CardLabVariant;
  readonly verdict: "pass" | "pending" | "fail";
  readonly reason: FailureReason | null;
  readonly detail: string | null;
  readonly instance: InstanceId | null;
  readonly zone: Zone | null;
  readonly resolved: boolean;
  readonly answers: number;
  readonly passes: number;
  /** Actual public engine events, including the lab fixture's initial scripted play. */
  readonly events: readonly EngineEvent[];
}

class PreflightFailure extends Error {
  constructor(readonly reason: FailureReason, message: string) { super(message); }
}

/** Dreamwell cards are UUID sources without a physical card instance or zone. */
export interface DreamwellLabPreflightResult {
  readonly uuid: DreamwellCardId;
  readonly side: Side;
  readonly variant: "base";
  readonly entityKind: "dreamwell";
  readonly verdict: "pass" | "pending" | "fail";
  readonly reason: "fixtureFailed" | "engineError" | "stalled" | "missingDraw" | null;
  readonly detail: string | null;
  readonly instance: null;
  readonly zone: null;
  readonly drawn: boolean;
  readonly answers: number;
  readonly passes: number;
  readonly events: readonly EngineEvent[];
}

/** Enters the requested side's next turn through normal passes and answers. */
export function runDreamwellLabPreflight(
  engine: Engine,
  request: DreamwellLabRequest,
  catalog: readonly DreamwellCardId[],
  maxIntents: number = BATTLE.labPreflight.maxIntents,
): DreamwellLabPreflightResult {
  const events: EngineEvent[] = [];
  let answers = 0;
  let passes = 0;
  let fixture = true;
  const drawn = () => events.some((event) => event.kind === "dreamwellDrawn" && event.side === request.side && event.card === request.cardId);
  const result = (verdict: DreamwellLabPreflightResult["verdict"], reason: DreamwellLabPreflightResult["reason"] = null, detail: string | null = null): DreamwellLabPreflightResult => ({
    uuid: request.cardId, side: request.side, variant: "base", entityKind: "dreamwell", verdict, reason, detail,
    instance: null, zone: null, drawn: drawn(), answers, passes, events,
  });
  try {
    if (!Number.isSafeInteger(maxIntents) || maxIntents < 1) return result("fail", "stalled", "Intent guard must be a positive safe integer");
    let slice = dreamwellLabBattle(engine, request, catalog).slice;
    fixture = false;
    const adapter = createFoldAdapter(engine);
    for (let intents = 0; ; intents++) {
      const pending = adapter.pending(slice);
      if (drawn() && pending === null && slice.inFlight === null && slice.committed.stack.length === 0) break;
      if (intents >= maxIntents) return result("fail", "stalled", `Intent guard exhausted after ${maxIntents} intents`);
      const decision = engine.decision(slice.committed);
      if (pending === null && (slice.inFlight !== null || decision === null)) return result("fail", "missingDraw", "No decision reaches the requested draw");
      const intent: BattleIntent = pending === null
        ? { kind: "battleAction", side: decision!.side, action: { kind: "pass" } }
        : { kind: "answer", side: pending.prompt.side, promptId: pending.prompt.id, value: firstLegalAnswer(pending.prompt) };
      const outcome = adapter.reduce(slice, intent);
      if (outcome.kind === "bounced") return result("fail", "engineError", `Intent rejected: ${outcome.reason}`);
      events.push(...outcome.published);
      slice = outcome.slice;
      if (outcome.error !== null) return result("fail", "engineError", outcome.error.message);
      if (pending === null) passes++; else answers++;
    }
    return result(engine.catalog.dreamwellCard(request.cardId).status === "pending" ? "pending" : "pass");
  } catch (error) {
    return result("fail", fixture ? "fixtureFailed" : "engineError", error instanceof Error ? error.message : String(error));
  }
}

/**
 * Plays one solved lab fixture and answers both sides with the first legal answer.
 * Enemy setup includes the lab's scripted play; this does not select an AI policy action.
 * Stops at the first empty stack without a prompt or in-flight step, before further Day actions.
 */
export function runCardLabPreflight(
  engine: Engine,
  request: CardLabRequest,
  pool: readonly EngineCardDefinition[],
  maxIntents: number = BATTLE.labPreflight.maxIntents,
): LabPreflightResult {
  const events: EngineEvent[] = [];
  let instance: InstanceId | null = null;
  let slice: BattleSlice | null = null;
  let answers = 0;
  let passes = 0;
  let fixture = true;
  const result = (verdict: LabPreflightResult["verdict"], reason: FailureReason | null = null, detail: string | null = null): LabPreflightResult => ({
    uuid: request.entry.cardId, side: request.side, variant: request.variant, verdict, reason, detail,
    instance, zone: instance === null ? null : slice?.committed.instances[instance]?.zone ?? null,
    resolved: events.some((event) => event.kind === "resolved" && event.instance === instance),
    answers, passes, events,
  });
  try {
    if (!Number.isSafeInteger(maxIntents) || maxIntents < 1) throw new PreflightFailure("stalled", "Intent guard must be a positive safe integer");
    slice = cardLabBattle(engine, request, pool, (published) => events.push(...published)).slice;
    fixture = false;
    // Setup may stage another copy of this printing. Select the actual scripted
    // play, or the solver's first source hand slot, rather than a printing match.
    const scripted = events.find((event) => event.kind === "cardPlayed" && event.side === request.side);
    instance = scripted?.kind === "cardPlayed" ? scripted.instance : slice.committed.sides[request.side].hand[0] ?? null;
    const source = instance === null ? undefined : slice.committed.instances[instance];
    if (source?.owner !== request.side || source.printing.kind !== "card" || source.printing.cardId !== request.entry.cardId) instance = null;
    if (instance === null) throw new PreflightFailure("unplayable", "The fixture contains no source instance");
    const adapter = createFoldAdapter(engine);
    let intents = 0;
    const apply = (intent: BattleIntent) => {
      if (slice === null) throw new PreflightFailure("engineError", "No lab slice");
      if (intents++ >= maxIntents) throw new PreflightFailure("stalled", `Intent guard exhausted after ${maxIntents} intents`);
      const outcome = adapter.reduce(slice, intent);
      if (outcome.kind === "bounced") throw new PreflightFailure("engineError", `Intent rejected: ${outcome.reason}`);
      events.push(...outcome.published);
      slice = outcome.slice;
      if (outcome.error !== null) throw new PreflightFailure("engineError", outcome.error.message);
    };
    if (request.side === "player" || request.stage !== undefined) {
      const play = engine.legalActions(slice.committed, request.side).find((action) => action.kind === "play" && action.card === instance && action.from === "hand");
      if (play === undefined) throw new PreflightFailure("unplayable", "The source has no legal hand play");
      apply({ kind: "battleAction", side: request.side, action: play });
    }
    for (;;) {
      const pending = adapter.pending(slice);
      if (pending !== null) {
        apply({ kind: "answer", side: pending.prompt.side, promptId: pending.prompt.id, value: firstLegalAnswer(pending.prompt) });
        answers++;
      } else if (slice.inFlight !== null) {
        throw new PreflightFailure("engineError", "In-flight step has no answerable prompt");
      } else if (slice.committed.stack.length === 0) {
        break;
      } else {
        const decision = engine.decision(slice.committed);
        if (decision === null) throw new PreflightFailure("stalled", "Stack remains without a decision");
        apply({ kind: "battleAction", side: decision.side, action: { kind: "pass" } });
        passes++;
      }
    }
    const resolved = events.findIndex((event) => event.kind === "resolved" && event.instance === instance);
    if (resolved < 0) throw new PreflightFailure("missingResolution", "No source-scoped resolved event");
    const card = engine.catalog.card(request.entry.cardId);
    const expected: Zone[] = card.cardType === "character" ? ["play"] : ["void", "banished"];
    const materialized = events.findIndex((event) => event.kind === "materialized" && event.instance === instance);
    // Engine events arrive in execution order; browser probe seq belongs to its wrapper.
    const abandoned = materialized >= 0 && events.some((event, index) => event.kind === "abandoned" && event.instance === instance && index > materialized);
    if (card.cardType === "character" && materialized > resolved && abandoned) expected.push("void");
    const zone = slice.committed.instances[instance]?.zone;
    if (zone === undefined || !expected.includes(zone)) throw new PreflightFailure("unexpectedZone", `Source zone ${String(zone)}; expected ${expected.join(" or ")}`);
    return result(card.status === "pending" ? "pending" : "pass");
  } catch (error) {
    return result("fail", error instanceof PreflightFailure ? error.reason : fixture ? "fixtureFailed" : "engineError", error instanceof Error ? error.message : String(error));
  }
}
