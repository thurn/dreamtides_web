import { useCallback, useEffect, useRef, useState } from "react";
import type { DreamwellCardViewData } from "../../components/DreamwellCardView";
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
  /**
   * Whether this client is the single battle authority (owns init + the
   * once-per-turn Dreamwell reveal). A Dreamwell card's scripted edits — a flat
   * "gain 1 energy" with no prompt, for example — are authority mutations that
   * must apply exactly once. In a shared room EVERY connected client runs this
   * runner off the synced reveal, so without a gate each automatic edit would be
   * dispatched once per client (two clients ⇒ +2 energy from a +1 card). The
   * primary client owns a run from the start; ownership transfers to whichever
   * client resolves a prompt (see `resolvePrompt`), because only the resolver
   * keeps walking the run while the partner's overlay is torn down by
   * `cancelPromptSignal`. Single-player has one primary client, so it is
   * unaffected.
   */
  isPrimaryClient: boolean;
  /**
   * A monotonic counter that increments whenever a coop partner advances the
   * shared battle (see `remoteCommandEpoch` in the multiplayer context). When it
   * changes while a prompt is open, the partner has resolved that choice on
   * their client, so we tear down our local run and dismiss the overlay. Stays
   * constant (and so is inert) in single-player.
   */
  cancelPromptSignal: number;
}

export interface DreamwellRunnerResult {
  activePrompt: ActivePrompt | null;
  activePromptSide: BattleSide | null;     // for the foresee overlay + card rendering
  activePromptSourceName: string | null;   // dreamwell card driving the open prompt
  activePromptSourceCard: DreamwellCardViewData | null; // its full card, for in-modal display
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
  promptDismissedByPartner: "battle_proto_dreamwell_prompt_dismissed_by_partner",
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
  const { enabled, state, dreamwellDeck, dispatchEdit, isPrimaryClient, cancelPromptSignal } = args;

  // Internal runner state: the active card run (null when idle).
  const [run, setRun] = useState<{
    cardId: string;
    cardName: string;
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

  // Whether THIS client owns the active run's authority edits. Set when a run
  // starts (the primary client owns it) and flipped true when this client
  // resolves a prompt (the resolver continues the run alone while the partner's
  // overlay is dismissed). Automatic `dispatch`-plan edits fire only when this is
  // true, so a flat scripted edit (no prompt) is applied by exactly one client.
  const ownsRunRef = useRef(false);

  // Re-render guard: skip advance if the queue reference has not changed.
  const processedQueueRef = useRef<EffectStep[] | null>(null);

  // Last observed `cancelPromptSignal`, so the coop-dismiss effect fires only on
  // an actual change (a partner command) rather than on its initial mount value.
  const lastCancelSignalRef = useRef(cancelPromptSignal);

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
      // The primary client owns this run's authority edits from the start. The
      // non-primary client still starts the run (to walk to any prompt and show
      // it) but does not dispatch automatic edits — it receives them via synced
      // commands — unless it later resolves a prompt and takes ownership.
      ownsRunRef.current = isPrimaryClient;
      setRun({
        cardId: script.id,
        cardName: card?.name ?? "",
        side,
        remaining: [...script.steps],
      });
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
    isPrimaryClient,
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
      ownsRunRef.current = false;
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
        dispatched: ownsRunRef.current,
      });
      // Only the run's owner dispatches these authority edits; the non-owner
      // walks the queue (so it reaches and shows any later prompt) but receives
      // the resulting state via synced commands instead of applying it locally.
      // Without this gate both coop clients would apply the same edit (the
      // double "gain 1 energy" bug).
      if (ownsRunRef.current) {
        for (const edit of plan.edits) {
          dispatchEdit(edit);
        }
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

      // Resolving the prompt makes THIS client the run's owner: the partner's
      // overlay is torn down by `cancelPromptSignal`, so this client is now the
      // sole driver of the remaining queue and must dispatch its edits (these
      // resolution edits, and any automatic steps after the prompt) exactly once.
      ownsRunRef.current = true;
      for (const edit of edits) {
        dispatchEdit(edit);
      }

      pausedRef.current = null;
      setActivePrompt(null);
      setRun({ ...run, remaining: rest });
    },
    [run, activePrompt, state, dispatchEdit],
  );

  // ---------------------------------------------------------------------------
  // Coop dismiss — partner resolved this prompt on their client
  // ---------------------------------------------------------------------------
  // When `cancelPromptSignal` changes our coop partner advanced the shared
  // battle. Their resolution edits sync to us as commands, so the only thing
  // left to do locally is tear down the run that is paused on the open prompt
  // and clear the overlay — mirroring the abort teardown. Guarded on an open
  // prompt so unrelated partner moves do not disturb an in-progress run.
  useEffect(() => {
    if (cancelPromptSignal === lastCancelSignalRef.current) return;
    lastCancelSignalRef.current = cancelPromptSignal;
    if (activePrompt === null) return;
    logDreamwell(state, DREAMWELL_LOG.promptDismissedByPartner, {
      dreamwellCardId: run?.cardId ?? null,
      promptKind: activePrompt.kind,
    });
    setRun(null);
    setActivePrompt(null);
    pausedRef.current = null;
    processedQueueRef.current = null;
    ownsRunRef.current = false;
    // `lastRunKeyRef` deliberately stays set: the partner handled this (side,
    // turn) Dreamwell prompt, so it must not replay locally.
  }, [cancelPromptSignal, activePrompt, run, state]);

  // The full Dreamwell card behind the open run, looked up by id so the prompt
  // modal can re-render it as context (the on-board display is hidden behind the
  // prompt's backdrop).
  const activePromptSourceCard =
    run !== null
      ? dreamwellDeck.find((card) => card.id === run.cardId) ?? null
      : null;

  return {
    activePrompt,
    activePromptSide: run?.side ?? null,
    activePromptSourceName: run?.cardName ?? null,
    activePromptSourceCard,
    resolvePrompt,
  };
}
