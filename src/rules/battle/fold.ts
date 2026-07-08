// The authoritative in-battle slice of the coop fold state, plus the cursor
// model that lets it stay PURE DATA (design spec §Data model, §"FoldState must
// be pure data").
//
// The battle effect system is expressed today as `EffectStep[]` scripts whose
// steps hold `build(ctx)` / `candidates(ctx)` / `resolve(ids,ctx)` CLOSURES.
// Closures cannot live in fold state: `baseSnapshot` serializes the state and
// the sync tripwire hashes it, so a leaked function would either be silently
// dropped by JSON or break the byte-exact round-trip. The fold state therefore
// stores only a CURSOR — plain numbers — into the static script tables. The
// live scripts (code) are re-resolved from the tables at fold time via
// `resolveScript`; state carries ids and indices, never steps.

import type { BattleMutableState, BattleSide } from "../../battle/types";
import { selectBattleCardEffectScript } from "./battle-card-effects-table";
import { selectDreamwellEffectScript } from "./dreamwell-effects-table";
import type { ActivePrompt } from "./effect-runner-core";
import type { EffectStep } from "./effect-step";

// ---------------------------------------------------------------------------
// Cursor + run model
// ---------------------------------------------------------------------------

/** Key into the two static effect-script tables. `id` is a card/dreamwell UUID. */
export interface ScriptRef {
  table: "battle" | "dreamwell";
  id: string;
}

/**
 * A pending automation run, as PLAIN DATA.
 *
 * `cursor` is a PATH of indices into the (possibly nested) static script step
 * tree, not a single top-level `stepIndex`. `cursor[0]` indexes the script's
 * top-level `steps`; each subsequent index descends into the `onYes` branch of
 * the `confirm` prompt at the previous index. A single top-level index cannot
 * address a prompt that lives inside a `confirm.onYes` branch — and such nested
 * prompts DO exist in the live dreamwell table (Sunset's Last Gaze, The
 * Bastion, Ruin Tree, Luminous Enigma), so the path is required for
 * correctness. Because every element is a number, an `EffectRun` round-trips
 * through `JSON.parse(JSON.stringify(...))` byte-for-byte with no closure or
 * `EffectStep` ever entering the state.
 *
 * A fresh run starts at `cursor: [0]` (see {@link newEffectRun}); the driver
 * advances the cursor as steps dispatch and descends into `onYes` when a
 * `confirm` resolves affirmatively.
 */
export interface EffectRun {
  scriptRef: ScriptRef;
  cursor: number[];
  side: BattleSide;
  /** Triggering in-play character id, for self-targeting scripts (Dawn/Materialized). */
  sourceInstanceId?: string;
}

/**
 * An open prompt awaiting a `RESOLVE_PROMPT`. Pure data: `options` is the
 * already-materialized {@link ActivePrompt} (candidate ids resolved from live
 * state at open time), so the UI needs no builder access, and `run` is the
 * parked cursor. `promptId` is the seq of the event that opened the prompt; the
 * root CAS policy matches a `RESOLVE_PROMPT` against it (reducer rules 2/4).
 */
export interface PendingPrompt {
  promptId: number;
  run: EffectRun;
  kind: "pick-cards" | "choice" | "confirm" | "foresee";
  options: ActivePrompt;
}

/**
 * The in-battle fold slice. `board` is today's `BattleMutableState`, relocated;
 * `effectQueue` is the FIFO of pending automation runs; `pendingPrompt` is the
 * single open prompt (or null). All three are plain data.
 */
export interface BattleFoldState {
  board: BattleMutableState;
  effectQueue: EffectRun[];
  pendingPrompt: PendingPrompt | null;
}

// ---------------------------------------------------------------------------
// Script resolution
// ---------------------------------------------------------------------------

/**
 * Resolves a {@link ScriptRef} to its live `EffectStep[]` via the static tables.
 * Returns `[]` when the id is unregistered (or a battle card has no `steps`),
 * so a stale/unknown cursor drives cleanly to "done" rather than throwing.
 */
export function resolveScript(ref: ScriptRef): EffectStep[] {
  if (ref.table === "battle") {
    return selectBattleCardEffectScript(ref.id)?.steps ?? [];
  }
  return selectDreamwellEffectScript(ref.id)?.steps ?? [];
}

/**
 * Constructs a fresh {@link EffectRun} positioned at the first step. Task 19-21
 * (BEGIN_BATTLE / BATTLE_COMMAND) mint runs through this so the initial cursor
 * convention (`[0]`) lives in one place.
 */
export function newEffectRun(
  scriptRef: ScriptRef,
  side: BattleSide,
  sourceInstanceId?: string,
): EffectRun {
  return sourceInstanceId === undefined
    ? { scriptRef, cursor: [0], side }
    : { scriptRef, cursor: [0], side, sourceInstanceId };
}
