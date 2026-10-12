/** Avatar QA uses a normal battle start, preserving first-turn triggers and prompts. */
import { BATTLE } from "../../content/battle";
import type { Engine } from "../engine";
import type { EngineEvent } from "../events";
import { createFoldAdapter, type BattleIntent, type BattleSlice } from "../fold/slice";
import { firstLegalAnswer } from "../prompts/answers";
import { battleSeed, opponent, type AvatarId, type Side } from "../state/ids";
import type { BattleInit } from "../state/types";
import { SYNTHETIC } from "./synthetic-cards";

export interface AvatarLabRequest {
  readonly avatarId: AvatarId;
  readonly side: Side;
}

/** Builds only the requested emblem; the other side has no avatar or Dreamsigns. */
export function avatarLabBattle(
  engine: Engine,
  request: AvatarLabRequest,
  published?: (events: readonly EngineEvent[]) => void,
): { init: BattleInit; slice: BattleSlice } {
  engine.catalog.avatar(request.avatarId);
  const deck = Array.from({ length: BATTLE.minimumDeckSize }, () => ({ cardId: SYNTHETIC.vanilla1.id }));
  const energy = { openingHand: [], startingEnergy: BATTLE.energyCap, smallerHandAndCostDiscount: [] };
  const init: BattleInit = {
    seed: battleSeed(`avatar-lab:${request.avatarId}:${request.side}`),
    scoreToWin: BATTLE.scoreTargets[0], startingSide: request.side,
    decks: { player: deck, enemy: deck }, dreamwell: [],
    avatars: { [request.side]: request.avatarId },
    nextBattle: { player: energy, enemy: energy },
  };
  const started = createFoldAdapter(engine).start(init);
  if (started.kind === "bounced") throw new Error(`Avatar lab start rejected: ${started.reason}`);
  if (started.error !== null) throw new Error(started.error.message);
  published?.(started.published);
  return { init, slice: started.slice };
}

export interface AvatarLabPreflightResult {
  readonly uuid: AvatarId;
  readonly side: Side;
  readonly entityKind: "avatar";
  readonly variant: "base";
  readonly verdict: "pass" | "pending" | "fail";
  readonly reason: "fixtureFailed" | "engineError" | "stalled" | "missingDay" | "wrongAvatar" | null;
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
export function runAvatarLabPreflight(
  engine: Engine,
  request: AvatarLabRequest,
  maxIntents: number = BATTLE.labPreflight.maxIntents,
): AvatarLabPreflightResult {
  const events: EngineEvent[] = [];
  let answers = 0;
  let passes = 0;
  let fixture = true;
  const result = (verdict: AvatarLabPreflightResult["verdict"], reason: AvatarLabPreflightResult["reason"] = null, detail: string | null = null): AvatarLabPreflightResult => ({
    uuid: request.avatarId, side: request.side, entityKind: "avatar", variant: "base", verdict, reason, detail,
    instance: null, zone: null, answers, passes, events,
    exercised: events.some(event => (event.kind === "abilityResolved" || event.kind === "triggerResolved") && typeof event.source === "object" && event.source?.kind === "avatar" && event.source.side === request.side),
  });
  try {
    if (!Number.isSafeInteger(maxIntents) || maxIntents < 1) return result("fail", "stalled", "Intent guard must be a positive safe integer");
    let slice = avatarLabBattle(engine, request, published => events.push(...published)).slice;
    fixture = false;
    const adapter = createFoldAdapter(engine);
    for (let intents = 0; ; intents++) {
      const pending = adapter.pending(slice);
      const state = slice.committed;
      if (state.sides[request.side].avatar?.id !== request.avatarId || state.sides[opponent(request.side)].avatar !== null) return result("fail", "wrongAvatar", "Requested emblem membership differs from the battle");
      if (pending === null && slice.inFlight === null && state.stack.length === 0 && (state.turn.active === request.side && state.turn.phase === "day" || state.result !== null)) break;
      if (intents >= maxIntents) return result("fail", "stalled", `Intent guard exhausted after ${maxIntents} intents`);
      const decision = engine.decision(state);
      if (pending === null && (slice.inFlight !== null || decision === null)) return result("fail", "missingDay", "No decision reaches the requested first Day");
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
    return result(engine.catalog.avatar(request.avatarId).status === "pending" ? "pending" : "pass");
  } catch (error) {
    return result("fail", fixture ? "fixtureFailed" : "engineError", error instanceof Error ? error.message : String(error));
  }
}
