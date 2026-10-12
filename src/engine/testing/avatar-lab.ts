/** Typed avatar battle lab facade. */
import { BATTLE } from "../../content/battle";
import type { Engine } from "../engine";
import type { EngineEvent } from "../events";
import type { BattleSlice } from "../fold/slice";
import type { BattleInit } from "../state/types";
import { emblemLabBattle, runEmblemLabPreflight } from "./emblem-lab";
import type { AvatarId, Side } from "../state/ids";

export interface AvatarLabRequest { readonly avatarId: AvatarId; readonly side: Side; }

export function avatarLabBattle(engine: Engine, request: AvatarLabRequest, published?: (events: readonly EngineEvent[]) => void): { init: BattleInit; slice: BattleSlice } {
  return emblemLabBattle(engine, { kind: "avatar", id: request.avatarId, side: request.side }, published);
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

export function runAvatarLabPreflight(engine: Engine, request: AvatarLabRequest, maxIntents: number = BATTLE.labPreflight.maxIntents): AvatarLabPreflightResult {
  const result = runEmblemLabPreflight(engine, { kind: "avatar", id: request.avatarId, side: request.side }, maxIntents);
  return { ...result, uuid: request.avatarId, entityKind: "avatar", reason: result.reason === "wrongEmblem" ? "wrongAvatar" : result.reason };
}
