import { useCallback, useEffect, useRef, useState } from "react";
import type { BattleDebugEdit } from "../debug/commands";
import type { BattleMutableState, BattleSide, DreamwellCardDefinition } from "../types";
import { createBattleLogBaseFields, logEvent } from "../../logging";
import type { DreamwellEffectStep, DreamwellPrompt } from "./dreamwell-effects";
import { selectDreamwellEffectScript } from "./dreamwell-effects-table";
import {
  applyPromptResolution,
  planNextDreamwellStep,
} from "./dreamwell-runner-core";
import type { DreamwellActivePrompt, DreamwellPromptResolution } from "./dreamwell-runner-core";

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
  activePrompt: DreamwellActivePrompt | null;
  activePromptSide: BattleSide | null;     // for the foresee overlay + card rendering
  resolvePrompt: (resolution: DreamwellPromptResolution) => void;
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

// ---------------------------------------------------------------------------
// useDreamwellEffectRunner
// ---------------------------------------------------------------------------

export function useDreamwellEffectRunner(args: DreamwellRunnerArgs): DreamwellRunnerResult {
  const { enabled, state, dreamwellDeck, dispatchEdit } = args;

  // Internal runner state: the active card run (null when idle).
  const [run, setRun] = useState<{
    cardId: string;
    side: BattleSide;
    remaining: DreamwellEffectStep[];
  } | null>(null);

  // The active prompt shown to the player (null when idle or between prompts).
  const [activePrompt, setActivePrompt] = useState<DreamwellActivePrompt | null>(null);

  // Paused prompt + rest queue, held in a ref so resolvePrompt can read it
  // without being regenerated on every render.
  const pausedRef = useRef<{
    prompt: DreamwellPrompt;
    rest: DreamwellEffectStep[];
  } | null>(null);

  // Key guard: fires at most once per (side, turn) combination.
  const lastRunKeyRef = useRef<string | null>(null);

  // Re-render guard: skip advance if the queue reference has not changed.
  const processedQueueRef = useRef<DreamwellEffectStep[] | null>(null);

  // ---------------------------------------------------------------------------
  // Start effect — fires when the dreamwell reveal for this (side, turn) lands
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!enabled) return;
    if (state.result !== null) return;
    if (state.phase !== "dreamwell") return;
    if (state.turnNumber <= 1) return;

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
      logEvent("battle_proto_dreamwell_effect_started", {
        ...createBattleLogBaseFields(state, { sourceSurface: "auto-system", selectedCardId: null }),
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
  ]);

  // ---------------------------------------------------------------------------
  // Advance effect — walks the queue one step at a time
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (run === null) return;
    if (activePrompt !== null) return;

    if (!enabled || state.result !== null) {
      // Abort: automation toggled off or battle ended.
      setRun(null);
      setActivePrompt(null);
      pausedRef.current = null;
      return;
    }

    // Guard against double-dispatch on re-renders that did not change the queue.
    if (processedQueueRef.current === run.remaining) return;
    processedQueueRef.current = run.remaining;

    const ctx = {
      side: run.side,
      state,
      random: Math.random,
      nowMs: Date.now(),
    };

    const plan = planNextDreamwellStep(run.remaining, ctx);

    if (plan.type === "done") {
      logEvent("battle_proto_dreamwell_effect_resolved", {
        ...createBattleLogBaseFields(state, { sourceSurface: "auto-system", selectedCardId: null }),
        dreamwellCardId: run.cardId,
        side: run.side,
      });
      setRun(null);
    } else if (plan.type === "dispatch") {
      logEvent("battle_proto_dreamwell_step", {
        ...createBattleLogBaseFields(state, { sourceSurface: "auto-system", selectedCardId: null }),
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
    (resolution: DreamwellPromptResolution) => {
      const paused = pausedRef.current;
      if (paused === null) return;

      const ctx = {
        side: run?.side ?? ("player" as BattleSide),
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

      logEvent("battle_proto_dreamwell_prompt_resolved", {
        ...createBattleLogBaseFields(state, { sourceSurface: "auto-system", selectedCardId: null }),
        dreamwellCardId: run?.cardId ?? null,
        promptKind: paused.prompt.kind,
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
      setRun(run !== null ? { ...run, remaining: rest } : null);
    },
    [run, activePrompt, state, dispatchEdit],
  );

  return {
    activePrompt,
    activePromptSide: run?.side ?? null,
    resolvePrompt,
  };
}
