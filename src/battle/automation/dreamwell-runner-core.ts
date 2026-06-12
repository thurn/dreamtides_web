import type { BattleDebugEdit } from "../debug/commands";
import type { DreamwellEffectStep, DreamwellPrompt, StepContext } from "./dreamwell-effects";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** What the UI must render when the runner is paused on a prompt. Candidate ids
 *  are resolved here (from live state) so the overlay needs no builder access. */
export type DreamwellActivePrompt =
  | { kind: "pick-cards"; label: string; candidateIds: string[]; count: number; optional: boolean }
  | { kind: "choice"; label: string; options: { label: string }[] }
  | { kind: "foresee"; count: number };

export type DreamwellPromptResolution =
  | { kind: "pick-cards"; chosenIds: string[] }
  | { kind: "choice"; optionIndex: number }
  | { kind: "foresee" };

/** Result of inspecting the head of the step queue. */
export type DreamwellStepPlan =
  | { type: "dispatch"; edits: BattleDebugEdit[]; rest: DreamwellEffectStep[] }
  | { type: "prompt"; active: DreamwellActivePrompt; prompt: DreamwellPrompt; rest: DreamwellEffectStep[] }
  | { type: "done" };

// ---------------------------------------------------------------------------
// planNextDreamwellStep
// ---------------------------------------------------------------------------

/** Inspect the head of the step queue and return a plan.
 *
 *  - Empty queue → `{ type: "done" }`.
 *  - `edits` head → `{ type: "dispatch", edits: head.build(ctx), rest }`.
 *  - `prompt` head → `{ type: "prompt", active, prompt, rest }` where `active`
 *    has candidates already resolved from live state. Confirm prompts are
 *    presented as a two-option choice: "Yes" (index 0) / "Skip" (index 1).
 */
export function planNextDreamwellStep(
  remaining: DreamwellEffectStep[],
  ctx: StepContext,
): DreamwellStepPlan {
  if (remaining.length === 0) {
    return { type: "done" };
  }

  const [head, ...rest] = remaining as [DreamwellEffectStep, ...DreamwellEffectStep[]];

  if (head.kind === "edits") {
    return { type: "dispatch", edits: head.build(ctx), rest };
  }

  // head.kind === "prompt"
  const { prompt } = head;
  const active = buildActivePrompt(prompt, ctx);
  return { type: "prompt", active, prompt, rest };
}

function buildActivePrompt(prompt: DreamwellPrompt, ctx: StepContext): DreamwellActivePrompt {
  switch (prompt.kind) {
    case "pick-cards":
      return {
        kind: "pick-cards",
        label: prompt.label,
        candidateIds: prompt.candidates(ctx),
        count: prompt.count,
        optional: prompt.optional,
      };
    case "choice":
      return {
        kind: "choice",
        label: prompt.label,
        options: prompt.options.map((o) => ({ label: o.label })),
      };
    case "confirm":
      return {
        kind: "choice",
        label: prompt.label,
        options: [{ label: "Yes" }, { label: "Skip" }],
      };
    case "foresee":
      return { kind: "foresee", count: prompt.count };
  }
}

// ---------------------------------------------------------------------------
// applyPromptResolution
// ---------------------------------------------------------------------------

/** Given the paused prompt, the user's resolution, and the queued rest, returns
 *  the edits to dispatch and the next queue.
 *
 *  - `pick-cards` → `{ edits: prompt.resolve(chosenIds, ctx), rest }`.
 *  - `choice` → `{ edits: options[optionIndex].build(ctx), rest }`.
 *  - `confirm` with index 0 (Yes) → `{ edits: [], rest: [...onYes, ...rest] }`.
 *  - `confirm` with index 1 (Skip) → `{ edits: [], rest }`.
 *  - `foresee` → `{ edits: [], rest }` (the foresee overlay applies its own edits).
 *  - Mismatched prompt/resolution → defensive fallback `{ edits: [], rest }`.
 */
export function applyPromptResolution(
  prompt: DreamwellPrompt,
  resolution: DreamwellPromptResolution,
  rest: DreamwellEffectStep[],
  ctx: StepContext,
): { edits: BattleDebugEdit[]; rest: DreamwellEffectStep[] } {
  switch (prompt.kind) {
    case "pick-cards": {
      if (resolution.kind !== "pick-cards") return { edits: [], rest };
      return { edits: prompt.resolve(resolution.chosenIds, ctx), rest };
    }
    case "choice": {
      if (resolution.kind !== "choice") return { edits: [], rest };
      const option = prompt.options[resolution.optionIndex];
      if (option === undefined) return { edits: [], rest };
      return { edits: option.build(ctx), rest };
    }
    case "confirm": {
      if (resolution.kind !== "choice") return { edits: [], rest };
      if (resolution.optionIndex === 0) {
        // Yes — prepend onYes steps before the remaining queue
        return { edits: [], rest: [...prompt.onYes, ...rest] };
      }
      // Skip (or any other index)
      return { edits: [], rest };
    }
    case "foresee": {
      return { edits: [], rest };
    }
  }
}
