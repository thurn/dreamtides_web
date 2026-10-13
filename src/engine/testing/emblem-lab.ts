/** Normal first-turn fixtures for the two battle emblem domains. */
import { BATTLE } from "../../content/battle";
import type { Engine } from "../engine";
import type { EngineEvent } from "../events";
import { createFoldAdapter, type BattleIntent, type BattleSlice } from "../fold/slice";
import { firstLegalAnswer } from "../prompts/answers";
import { battleSeed, opponent, type AvatarId, type DreamsignId, type Side } from "../state/ids";
import type { BattleInit } from "../state/types";
import { SYNTHETIC } from "./synthetic-cards";

export type EmblemLabRequest =
  | { readonly kind: "avatar"; readonly id: AvatarId; readonly side: Side }
  | { readonly kind: "dreamsign"; readonly id: DreamsignId; readonly side: Side };

function definition(engine: Engine, request: EmblemLabRequest) {
  return request.kind === "avatar" ? engine.catalog.avatar(request.id) : engine.catalog.dreamsign(request.id);
}

/** Builds only the requested emblem; the other side has no avatar or Dreamsigns. */
export function emblemLabBattle(
  engine: Engine,
  request: EmblemLabRequest,
  published?: (events: readonly EngineEvent[]) => void,
): { init: BattleInit; slice: BattleSlice } {
  definition(engine, request);
  const deck = Array.from({ length: BATTLE.minimumDeckSize }, () => ({ cardId: SYNTHETIC.vanilla1.id }));
  const energy = { openingHand: [], startingEnergy: BATTLE.energyCap, smallerHandAndCostDiscount: [] };
  const init: BattleInit = {
    seed: battleSeed(`${request.kind}-lab:${request.id}:${request.side}`),
    scoreToWin: BATTLE.scoreTargets[0], startingSide: request.side,
    decks: { player: deck, enemy: deck }, dreamwell: [],
    draftPools: { player: [SYNTHETIC.event0.id, SYNTHETIC.event1.id], enemy: [SYNTHETIC.event0.id, SYNTHETIC.event1.id] },
    ...(request.kind === "avatar" ? { avatars: { [request.side]: request.id } } : { dreamsigns: { [request.side]: [request.id] } }),
    nextBattle: { player: energy, enemy: energy },
  };
  const started = createFoldAdapter(engine).start(init);
  if (started.kind === "bounced") throw new Error(`${request.kind === "avatar" ? "Avatar" : "Dreamsign"} lab start rejected: ${started.reason}`);
  if (started.error !== null) throw new Error(started.error.message);
  published?.(started.published);
  return { init, slice: started.slice };
}

export interface EmblemLabPreflightResult {
  readonly uuid: AvatarId | DreamsignId;
  readonly side: Side;
  readonly entityKind: "avatar" | "dreamsign";
  readonly variant: "base";
  readonly verdict: "pass" | "pending" | "fail";
  readonly reason: "fixtureFailed" | "engineError" | "stalled" | "missingDay" | "wrongEmblem" | null;
  readonly detail: string | null;
  readonly instance: null;
  readonly zone: null;
  /** Initialization evidence and observed ability exercise are distinct. */
  readonly exercised: boolean;
  readonly answers: number;
  readonly passes: number;
  readonly events: readonly EngineEvent[];
}

/** Checks the first turn's normal progression; it does not synthesize ability triggers. */
export function runEmblemLabPreflight(
  engine: Engine,
  request: EmblemLabRequest,
  maxIntents: number = BATTLE.labPreflight.maxIntents,
): EmblemLabPreflightResult {
  const events: EngineEvent[] = [];
  let answers = 0;
  let passes = 0;
  let fixture = true;
  let dreamsignExercised = false;
  const result = (verdict: EmblemLabPreflightResult["verdict"], reason: EmblemLabPreflightResult["reason"] = null, detail: string | null = null): EmblemLabPreflightResult => ({
    uuid: request.id, side: request.side, entityKind: request.kind, variant: "base", verdict, reason, detail,
    instance: null, zone: null, answers, passes, events,
    exercised: request.kind === "dreamsign" ? dreamsignExercised : events.some(event => (event.kind === "abilityResolved" || event.kind === "triggerResolved") && typeof event.source === "object" && event.source?.kind === "avatar" && event.source.side === request.side),
  });
  try {
    if (!Number.isSafeInteger(maxIntents) || maxIntents < 1) return result("fail", "stalled", "Intent guard must be a positive safe integer");
    let slice = emblemLabBattle(engine, request, published => events.push(...published)).slice;
    fixture = false;
    const adapter = createFoldAdapter(engine);
    const observe = (batch: readonly EngineEvent[], state: BattleSlice["committed"]) => {
      if (request.kind !== "dreamsign" || state.sides[request.side].dreamsigns.length !== 1 || state.sides[request.side].dreamsigns[0].id !== request.id) return;
      dreamsignExercised ||= batch.some(event => (event.kind === "abilityResolved" || event.kind === "triggerResolved") && typeof event.source === "object" && event.source?.kind === "dreamsign" && event.source.side === request.side && event.source.index === 0 && (event.kind === "abilityResolved" ? event.side : event.controller) === request.side);
    };
    observe(events, slice.committed);
    for (let intents = 0; ; intents++) {
      const pending = adapter.pending(slice);
      const state = slice.committed;
      const selected = state.sides[request.side];
      const other = state.sides[opponent(request.side)];
      const matches = request.kind === "avatar"
        ? selected.avatar?.id === request.id && other.avatar === null
        : selected.avatar === null && other.avatar === null && selected.dreamsigns.length === 1 && selected.dreamsigns[0].id === request.id && other.dreamsigns.length === 0;
      if (!matches) return result("fail", "wrongEmblem", "Requested emblem membership differs from the battle");
      if (pending === null && slice.inFlight === null && state.stack.length === 0 && (state.turn.active === request.side && state.turn.phase === "day" || state.result !== null)) break;
      if (intents >= maxIntents) return result("fail", "stalled", `Intent guard exhausted after ${maxIntents} intents`);
      const decision = engine.decision(state);
      if (pending === null && (slice.inFlight !== null || decision === null)) return result("fail", "missingDay", "No decision reaches the requested first Day");
      const intent: BattleIntent = pending === null
        ? { kind: "battleAction", side: decision!.side, action: { kind: "pass" } }
        : { kind: "answer", side: pending.prompt.side, promptId: pending.prompt.id, value: firstLegalAnswer(pending.prompt) };
      const outcome = adapter.reduce(slice, intent);
      if (outcome.kind === "bounced") return result("fail", "engineError", `Intent rejected: ${outcome.reason}`);
      if (request.kind !== "dreamsign" || outcome.slice.committed.sides[request.side].dreamsigns.length === 1 && outcome.slice.committed.sides[request.side].dreamsigns[0].id === request.id) observe(outcome.published, state);
      events.push(...outcome.published);
      slice = outcome.slice;
      if (outcome.error !== null) return result("fail", "engineError", outcome.error.message);
      if (pending === null) passes++; else answers++;
    }
    return result(definition(engine, request).status === "pending" ? "pending" : "pass");
  } catch (error) {
    return result("fail", fixture ? "fixtureFailed" : "engineError", error instanceof Error ? error.message : String(error));
  }
}
