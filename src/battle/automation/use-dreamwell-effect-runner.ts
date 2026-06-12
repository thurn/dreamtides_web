import { useCallback, useEffect, useRef, useState } from "react";
import type { BattleDebugEdit } from "../debug/commands";
import type { BattleMutableState, BattleSide, DreamwellCardDefinition } from "../types";
import { createBattleLogBaseFields, logEvent } from "../../logging";
import type { EffectPrompt, EffectStep } from "./effect-step";
import { selectDreamwellEffectScript } from "./dreamwell-effects-table";
import {
  applyPromptResolution,
  planNextEffectStep,
} from "./effect-runner-core";
import type { ActivePrompt, PromptResolution } from "./effect-runner-core";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface DreamwellRunnerArgs {
  enabled: boolean;                        // isBasicAutomationEnabled
  state: BattleMutableState;               // reducerState.mutable (live, per-render)
  dreamwellDeck: readonly DreamwellCardDefinition[];
  dispatchEdit: (edit: BattleDebugEdit) => void; // bypasses planBasicAutomationCommands
}

export interface DreamwellRunnerResult {
  activePrompt: ActivePrompt | null;
  activePromptSide: BattleSide | null;     // for the foresee overlay + card rendering
  resolvePrompt: (resolution: PromptResolution) => void;
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/** Extracts a loggable target id from a debug edit without using `any`. */
function extractEditTarget(edit: BattleDebugEdit): string | null {
  if ("battleCardId" in edit) return edit.battleCardId;
  if ("side" in edit) return edit.side;
  return null;
}

/** Canonical event-name constants for dreamwell logging. */
const DREAMWELL_LOG = {
  started: "battle_proto_dreamwell_effect_started",
  step: "battle_proto_dreamwell_step",
  promptResolved: "battle_proto_dreamwell_prompt_resolved",
  resolved: "battle_proto_dreamwell_effect_resolved",
} as const;

/** Logs a dreamwell event, spreading the standard base fields. */
function logDreamwell(
  state: BattleMutableState,
  event: string,
  payload: Record<string, unknown>,
): void {
  logEvent(event, {
    ...createBattleLogBaseFields(state, { sourceSurface: "auto-system", selectedCardId: null }),
    ...payload,
  });
}

// ---------------------------------------------------------------------------
// useDreamwellEffectRunner
// ---------------------------------------------------------------------------

export function useDreamwellEffectRunner(args: DreamwellRunnerArgs): DreamwellRunnerResult {
  const { enabled, state, dreamwellDeck, dispatchEdit } = args;

  // Internal runner state: the active card run (null when idle).
  const [run, setRun] = useState<{
    cardId: string;
    side: BattleSide;
    remaining: EffectStep[];
  } | null>(null);

  // The active prompt shown to the player (null when idle or between prompts).
  const [activePrompt, setActivePrompt] = useState<ActivePrompt | null>(null);

  // Paused prompt + rest queue, held in a ref so resolvePrompt can read it
  // without being regenerated on every render.
  const pausedRef = useRef<{
    prompt: EffectPrompt;
    rest: EffectStep[];
  } | null>(null);

  // Key guard: fires at most once per (side, turn) combination.
  const lastRunKeyRef = useRef<string | null>(null);

  // Re-render guard: skip advance if the queue reference has not changed.
  const processedQueueRef = useRef<EffectStep[] | null>(null);

  // ---------------------------------------------------------------------------
  // Start effect — fires when the dreamwell reveal for this (side, turn) lands
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!enabled) return;
    if (state.result !== null) return;
    if (state.phase !== "dreamwell") return;
    if (state.turnNumber <= 1) return;

    // One Dreamwell card at a time: never start (or clobber) a run while another
    // is in progress or paused on a prompt. When the active run completes (`run`
    // returns to null) this effect re-runs — `run` is a dependency — and the next
    // reveal's run can start. Without this guard, a reveal committing for the
    // following phase while a prior prompt is still unresolved would overwrite
    // `run` and desync it from `pausedRef`, resolving the pending prompt against
    // the wrong card/side.
    if (run !== null) return;

    const side = state.activeSide;
    if (state.sides[side].dreamwellDrawnTurn !== state.turnNumber) return;

    const key = `${side}:${state.turnNumber}`;
    if (lastRunKeyRef.current === key) return;
    lastRunKeyRef.current = key;

    const index = state.sides[side].dreamwellCardIndex;
    if (index === null) return;

    const card = dreamwellDeck[index];
    const cardId = card?.id;
    const script = cardId != null ? selectDreamwellEffectScript(cardId) : null;

    if (script !== null && script.steps.length > 0) {
      setRun({ cardId: script.id, side, remaining: [...script.steps] });
      logDreamwell(state, DREAMWELL_LOG.started, {
        dreamwellCardId: cardId,
        dreamwellCardName: card?.name,
        side,
        stepCount: script.steps.length,
      });
    }
    // If script is null or empty: deterministic-"none"/"manual" cards already
    // received energy from the existing reveal path. Nothing to do here.
  }, [
    enabled,
    state.result,
    state.phase,
    state.turnNumber,
    state.activeSide,
    // Read the specific fields that change when a reveal commits.
    state.sides[state.activeSide].dreamwellDrawnTurn,
    state.sides[state.activeSide].dreamwellCardIndex,
    dreamwellDeck,
    // Re-run when the active run finishes (`run` → null) so the next card starts.
    run,
  ]);

  // ---------------------------------------------------------------------------
  // Advance effect — walks the queue one step at a time
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (run === null) return;

    // Abort check runs FIRST — before the prompt-pause guard — so that toggling
    // automation off or the battle ending while a prompt is open tears down the
    // run and clears the overlay instead of leaving both stuck.
    if (!enabled || state.result !== null) {
      setRun(null);
      setActivePrompt(null);
      pausedRef.current = null;
      processedQueueRef.current = null;
      // `lastRunKeyRef` is deliberately NOT reset here: if the operator toggles
      // automation off and back on during the same (side, turn) Dreamwell phase,
      // the start effect's key guard keeps the bonus ability from replaying.
      return;
    }

    // Prompt-pause guard: a prompt is open; wait for resolvePrompt.
    if (activePrompt !== null) return;

    // Guard against double-dispatch on re-renders that did not change the queue.
    if (processedQueueRef.current === run.remaining) return;
    processedQueueRef.current = run.remaining;

    const ctx = {
      side: run.side,
      state,
      random: Math.random,
      nowMs: Date.now(),
    };

    const plan = planNextEffectStep(run.remaining, ctx);

    if (plan.type === "done") {
      logDreamwell(state, DREAMWELL_LOG.resolved, {
        dreamwellCardId: run.cardId,
        side: run.side,
      });
      processedQueueRef.current = null;
      setRun(null);
    } else if (plan.type === "dispatch") {
      logDreamwell(state, DREAMWELL_LOG.step, {
        dreamwellCardId: run.cardId,
        editKinds: plan.edits.map((e) => e.kind),
        targetIds: plan.edits.map((e) => extractEditTarget(e)),
      });
      for (const edit of plan.edits) {
        dispatchEdit(edit);
      }
      // Advance the queue by updating remaining to a new array so this effect
      // re-runs and processes the next step.
      setRun({ ...run, remaining: plan.rest });
    } else {
      // plan.type === "prompt"
      pausedRef.current = { prompt: plan.prompt, rest: plan.rest };
      setActivePrompt(plan.active);
      // Do NOT advance — wait for resolvePrompt.
    }
  }, [run, activePrompt, enabled, state, dispatchEdit]);

  // ---------------------------------------------------------------------------
  // resolvePrompt — called by UI when the player makes a choice
  // ---------------------------------------------------------------------------
  const resolvePrompt = useCallback(
    (resolution: PromptResolution) => {
      const paused = pausedRef.current;
      if (paused === null) return;
      // run must be non-null whenever pausedRef is set (a prompt is only opened
      // from inside the advance effect which already guards run !== null).
      if (run === null) return;

      const ctx = {
        side: run.side,
        state,
        random: Math.random,
        nowMs: Date.now(),
      };

      const { edits, rest } = applyPromptResolution(paused.prompt, resolution, paused.rest, ctx);

      // Capture candidateIds before clearing activePrompt.
      const candidateIds =
        activePrompt?.kind === "pick-cards" ? activePrompt.candidateIds : null;

      const choice: unknown =
        resolution.kind === "pick-cards"
          ? resolution.chosenIds
          : resolution.kind === "choice"
            ? resolution.optionIndex
            : "foresee";

      logDreamwell(state, DREAMWELL_LOG.promptResolved, {
        dreamwellCardId: run.cardId,
        promptKind: paused.prompt.kind,
        // The foresee prompt kind has no label field; the cast surfaces it safely.
        label: (paused.prompt as { label?: string }).label ?? null,
        candidateIds,
        choice,
        resultingEditKinds: edits.map((e) => e.kind),
      });

      for (const edit of edits) {
        dispatchEdit(edit);
      }

      pausedRef.current = null;
      setActivePrompt(null);
      setRun({ ...run, remaining: rest });
    },
    [run, activePrompt, state, dispatchEdit],
  );

  return {
    activePrompt,
    activePromptSide: run?.side ?? null,
    resolvePrompt,
  };
}
