/** Typed dreamsign battle lab facade. */
import { BATTLE } from "../../content/battle";
import type { Engine } from "../engine";
import type { EngineEvent } from "../events";
import type { BattleSlice } from "../fold/slice";
import type { BattleInit } from "../state/types";
import { emblemLabBattle, runEmblemLabPreflight } from "./emblem-lab";
import type { DreamsignId, Side } from "../state/ids";

export interface DreamsignLabRequest { readonly dreamsignId: DreamsignId; readonly side: Side; }

export function dreamsignLabBattle(engine: Engine, request: DreamsignLabRequest, published?: (events: readonly EngineEvent[]) => void): { init: BattleInit; slice: BattleSlice } {
  return emblemLabBattle(engine, { kind: "dreamsign", id: request.dreamsignId, side: request.side }, published);
}

export interface DreamsignLabPreflightResult {
  readonly uuid: DreamsignId;
  readonly side: Side;
  readonly entityKind: "dreamsign";
  readonly variant: "base";
  readonly verdict: "pass" | "pending" | "fail";
  readonly reason: "fixtureFailed" | "engineError" | "stalled" | "missingDay" | "wrongDreamsign" | null;
  readonly detail: string | null;
  readonly instance: null;
  readonly zone: null;
  /** Initialization evidence and observed ability exercise are distinct. */
  readonly exercised: boolean;
  readonly answers: number;
  readonly passes: number;
  readonly events: readonly EngineEvent[];
}

export function runDreamsignLabPreflight(engine: Engine, request: DreamsignLabRequest, maxIntents: number = BATTLE.labPreflight.maxIntents): DreamsignLabPreflightResult {
  const result = runEmblemLabPreflight(engine, { kind: "dreamsign", id: request.dreamsignId, side: request.side }, maxIntents);
  return { ...result, uuid: request.dreamsignId, entityKind: "dreamsign", reason: result.reason === "wrongEmblem" ? "wrongDreamsign" : result.reason };
}
