import type { BattleDebugEdit } from "../../battle/debug/commands";
import type { EffectPrompt, EffectStep, StepContext } from "./effect-step";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** What the UI must render when the runner is paused on a prompt. Candidate ids
 *  are resolved here (from live state) so the overlay needs no builder access. */
export type ActivePrompt =
  | {
      kind: "pick-cards";
      label: string;
      candidateIds: string[];
      count: number;
      optional: boolean;
      /** Candidate ids to flag in the picker (e.g. a just-drawn card). */
      highlightCardIds: string[];
    }
  | { kind: "choice"; label: string; options: { label: string }[] }
  | { kind: "foresee"; count: number; cardIds: string[] };

export type PromptResolution =
  | { kind: "pick-cards"; chosenIds: string[] }
  | { kind: "choice"; optionIndex: number }
  | {
      kind: "foresee";
      orderedCardIds?: string[];
      voidCardIds?: string[];
    };

/** Result of inspecting the head of the step queue. */
export type EffectStepPlan =
  | { type: "dispatch"; edits: BattleDebugEdit[]; rest: EffectStep[] }
  | { type: "prompt"; active: ActivePrompt; prompt: EffectPrompt; rest: EffectStep[] }
  | { type: "done" };

// ---------------------------------------------------------------------------
// planNextEffectStep
// ---------------------------------------------------------------------------

/** Inspect the head of the step queue and return a plan.
 *
 *  - Empty queue → `{ type: "done" }`.
 *  - `edits` head → `{ type: "dispatch", edits: head.build(ctx), rest }`.
 *  - `prompt` head → `{ type: "prompt", active, prompt, rest }` where `active`
 *    has candidates already resolved from live state. Confirm prompts are
 *    presented as a two-option choice: "Yes" (index 0) / "Skip" (index 1).
 */
export function planNextEffectStep(
  remaining: EffectStep[],
  ctx: StepContext,
): EffectStepPlan {
  if (remaining.length === 0) {
    return { type: "done" };
  }

  const [head, ...rest] = remaining as [EffectStep, ...EffectStep[]];

  if (head.kind === "edits") {
    return { type: "dispatch", edits: head.build(ctx), rest };
  }

  // head.kind === "prompt"
  const { prompt } = head;
  const active = buildActivePrompt(prompt, ctx);
  return { type: "prompt", active, prompt, rest };
}

function buildActivePrompt(prompt: EffectPrompt, ctx: StepContext): ActivePrompt {
  switch (prompt.kind) {
    case "pick-cards": {
      const candidateIds = prompt.candidates(ctx);
      const highlightCardIds = (prompt.highlight?.(ctx) ?? []).filter((id) =>
        candidateIds.includes(id),
      );
      return {
        kind: "pick-cards",
        label: prompt.label,
        candidateIds,
        count: prompt.count,
        optional: prompt.optional,
        highlightCardIds,
      };
    }
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
      return {
        kind: "foresee",
        count: prompt.count,
        cardIds: ctx.state.sides[ctx.side].deck.slice(0, prompt.count),
      };
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
 *  - `foresee` → one atomic `FORESEE` edit when the resolution carries a
 *    staged order, or no edits for legacy kind-only resolutions.
 *  - Mismatched prompt/resolution → defensive fallback `{ edits: [], rest }`.
 */
export function applyPromptResolution(
  prompt: EffectPrompt,
  resolution: PromptResolution,
  rest: EffectStep[],
  ctx: StepContext,
): { edits: BattleDebugEdit[]; rest: EffectStep[] } {
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
      if (
        resolution.kind !== "foresee" ||
        resolution.orderedCardIds === undefined ||
        resolution.voidCardIds === undefined
      ) {
        return { edits: [], rest };
      }
      return {
        edits: [{
          kind: "FORESEE",
          side: ctx.side,
          viewedCardIds: ctx.state.sides[ctx.side].deck.slice(0, prompt.count),
          orderedCardIds: resolution.orderedCardIds,
          voidCardIds: resolution.voidCardIds,
        }],
        rest,
      };
    }
  }
}
