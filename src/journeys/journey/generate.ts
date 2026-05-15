// Generation pipeline for Dream Journeys.
//
// Ported from the CLI's `src/journey/generate.ts`. The six-phase pipeline:
//
//   1. Resolve `drawContext` (seed, content-version, root-journey index).
//   2. Resolve the stage (early/mid/late) from `dreamscape`, or use
//      `forcedStage` if supplied.
//   3. Derive the desired-tag set from quest context.
//   4. Score every registered shape against the tag set and contextual signals.
//   5. Select a shape via weighted choice (or use `forcedShapeId` if supplied).
//   6. Build the manifest via assembly, attach target-resolution metadata,
//      validate, and return the frozen-serializable manifest.
//
// Two port-specific changes from the CLI version:
//
//   1. `previousPick` is passed through unchanged. The history-driven fallback
//      from `context.state.history` is replaced with an empty array: this port
//      does not yet maintain a pick-history projection on `JourneyContext`.
//      Per the spec this is an open extension point, and the pipeline degrades
//      gracefully (the tag-repetition penalty and exact-shape-repetition fall
//      back to zero in the absence of history).
//   2. `rootJourneyIndex` is read from `context.state.quest.seed` via the
//      caller-supplied `drawContext` rather than from
//      `context.state.generator.rootJourneyIndex`. The ported `JourneyContext`
//      does not carry a `generator` projection; the caller constructs the
//      `DrawContext` (with `rootJourneyIndex` zero for the first root and
//      incremented per subsequent root) from quest-prototype state.
//
// Pure module: no I/O, no Node imports. Browser-safe.

import type { JourneyContext } from "./context";
import {
  weightedChoice,
  deterministicTieJitter,
  type DrawContext,
} from "../util/rng";
import { buildJourneyForShape } from "./assembly";
import { attachTargetResolutionMetadata } from "./effects";
import type {
  JourneyManifest,
  JourneyOption,
  JourneyStage,
  SequenceState,
} from "./manifest";
import {
  getShapePlugin,
  isJourneyShapeId,
  journeyShapePlugins,
} from "./shapes/registry";
import type { JourneyShapeDefinition } from "./shapes/types";
import {
  validateJourneyManifest,
  type ValidationResult,
} from "./validate/index";
import { evaluateOptionValue } from "./value";

/**
 * Pick-history entry the generator consults for repetition penalties. The
 * structure mirrors the CLI's `PickHistoryEntry`; the port currently passes
 * `previousPick` directly (via `GenerationInput`) and treats the wider
 * `context.state.history` as empty until the prototype maintains it.
 */
export type PickHistoryEntry = {
  journeyId: string;
  shapeId: string;
  sequenceStep?: number;
  sequenceStatus?: "active" | "complete" | "left";
  selectedOptionNumber: number;
  selectedOptionText: string;
  effectSimulation: "not_applied";
};

export type GenerationInput = {
  context: JourneyContext;
  drawContext: DrawContext;
  previousPick?: PickHistoryEntry;
  forcedShapeId?: string;
  forcedStage?: JourneyStage;
};

export type SequenceAdvanceInput = {
  context: JourneyContext;
  manifest: JourneyManifest;
  selectedOptionNumber: number;
};

export type SequenceAdvanceResult =
  | { kind: "advanced"; manifest: JourneyManifest }
  | {
      kind: "complete";
      journeyId: string;
      rootJourneyIndex: number;
      sequence: SequenceState;
      shouldGenerateNextRoot: true;
    }
  | {
      kind: "left";
      journeyId: string;
      rootJourneyIndex: number;
      sequence: SequenceState;
      shouldGenerateNextRoot: true;
    };

function journeyId(rootJourneyIndex: number): string {
  return `J-${String(rootJourneyIndex).padStart(6, "0")}`;
}

function stageForDreamscape(dreamscape: number): JourneyStage {
  if (dreamscape <= 1) {
    return "early";
  }

  if (dreamscape <= 3) {
    return "mid";
  }

  return "late";
}

function desiredTagsFor(
  context: JourneyContext,
  stage: JourneyStage,
): string[] {
  const tags = new Set<string>(
    stage === "early"
      ? ["build", "cleanup", "reward", "immediate", "broad"]
      : stage === "mid"
        ? ["refine", "risk", "delayed", "economy", "reward"]
        : ["convert", "sacrifice", "gamble", "route", "reward"],
  );

  if (
    context.state.quest.resources.essence <
    context.state.quest.resources.maxEssence * 0.25
  ) {
    tags.add("resource");
  }

  if (context.state.quest.activeDreamsigns.length === 0) {
    tags.add("dreamsign");
  }

  if (context.state.quest.deck.summary.starterCards > 0) {
    tags.add("cleanup");
  }

  return [...tags].sort((left, right) => left.localeCompare(right, "en-US"));
}

function overlapFraction(
  left: readonly string[],
  right: readonly string[],
): number {
  if (right.length === 0) {
    return 0;
  }

  const leftSet = new Set(left);
  const matches = right.filter((tag) => leftSet.has(tag)).length;

  return matches / right.length;
}

function broadRunNeedFit(
  shape: JourneyShapeDefinition,
  context: JourneyContext,
): number {
  let score = 0;
  let possible = 0;

  possible += 1;
  if (
    context.state.quest.deck.summary.starterCards > 0 &&
    shape.supportedTags.includes("cleanup")
  ) {
    score += 1;
  }

  possible += 1;
  if (
    context.state.quest.activeDreamsigns.length === 0 &&
    shape.supportedTags.includes("dreamsign")
  ) {
    score += 1;
  }

  possible += 1;
  if (
    context.state.quest.resources.essence < 100 &&
    shape.supportedTags.includes("reward")
  ) {
    score += 1;
  }

  return score / possible;
}

function targetAvailability(
  shape: JourneyShapeDefinition,
  context: JourneyContext,
): number {
  const hasCards = context.state.quest.draftPool.length > 0;
  const hasDreamsigns = context.state.quest.dreamsignPoolIds.length > 0;

  if (shape.supportedTags.includes("card") && !hasCards) {
    return 0;
  }

  if (shape.supportedTags.includes("dreamsign") && !hasDreamsigns) {
    return 0;
  }

  return 1;
}

// The port does not yet carry `context.state.history`; the generator falls
// back to an empty history. `previousPick` (when supplied) is consulted
// directly. This matches the spec's open extension point.
function recentHistory(): readonly PickHistoryEntry[] {
  return [];
}

function exactShapeRepetitionPenalty(
  shape: JourneyShapeDefinition,
  previousPick?: PickHistoryEntry,
): number {
  const history = recentHistory();
  const latest = previousPick ?? history[history.length - 1];

  return latest?.shapeId === shape.id ? 1 : 0;
}

function tagRepetitionPenalty(
  shape: JourneyShapeDefinition,
): number {
  const recent = recentHistory().slice(-3);

  if (recent.length === 0) {
    return 0;
  }

  return recent.some((entry) => {
    const previous = isJourneyShapeId(entry.shapeId)
      ? getShapePlugin(entry.shapeId).definition
      : undefined;

    return previous?.supportedTags.some((tag) =>
      shape.supportedTags.includes(tag),
    );
  })
    ? 1
    : 0;
}

function scoreShapes(
  context: JourneyContext,
  drawContext: DrawContext,
  desiredTags: readonly string[],
  previousPick?: PickHistoryEntry,
): { shapeId: JourneyShapeDefinition["id"]; score: number }[] {
  return journeyShapePlugins().map((plugin) => {
    const shape = plugin.definition;
    const contextualScore =
      1 +
      0.08 * overlapFraction(shape.supportedTags, desiredTags) +
      0.06 * broadRunNeedFit(shape, context) +
      0.04 * targetAvailability(shape, context) -
      0.1 * exactShapeRepetitionPenalty(shape, previousPick) -
      0.05 * tagRepetitionPenalty(shape);
    const score =
      contextualScore * plugin.scoreWeight +
      deterministicTieJitter(drawContext, `shape:${shape.id}:tie`, 0.02);

    return {
      shapeId: shape.id,
      score: Number(Math.max(0.5, score).toFixed(6)),
    };
  }).sort((left, right) => {
    const scoreComparison = right.score - left.score;

    if (scoreComparison !== 0) {
      return scoreComparison;
    }

    return left.shapeId.localeCompare(right.shapeId, "en-US");
  });
}

function selectShape(
  drawContext: DrawContext,
  scores: readonly { shapeId: JourneyShapeDefinition["id"]; score: number }[],
) {
  return weightedChoice(
    drawContext,
    "root:shape",
    scores.map((entry) => ({
      item: entry.shapeId,
      weight: entry.score,
    })),
  );
}

function previousPickDebug(
  previousPick: PickHistoryEntry | undefined,
): JourneyManifest["debug"]["previousPick"] | undefined {
  if (!previousPick) {
    return undefined;
  }

  if (!isJourneyShapeId(previousPick.shapeId)) {
    return undefined;
  }

  return {
    journeyId: previousPick.journeyId,
    shapeId: previousPick.shapeId,
    selectedOptionNumber: previousPick.selectedOptionNumber,
    effectSimulation: "not_applied",
    ...(previousPick.sequenceStep !== undefined
      ? { sequenceStep: previousPick.sequenceStep }
      : {}),
    ...(previousPick.sequenceStatus !== undefined
      ? { sequenceStatus: previousPick.sequenceStatus }
      : {}),
  };
}

function sequenceMenuKey(step: number): string {
  return `step${step}`;
}

function freezeSerializable<T>(value: T): T {
  if (Array.isArray(value)) {
    const frozenArray = (value as unknown[]).map((entry) =>
      freezeSerializable(entry),
    );
    return Object.freeze(frozenArray) as T;
  }

  if (typeof value === "object" && value !== null) {
    return Object.freeze(
      Object.fromEntries(
        Object.entries(value).map(([key, nested]) => [
          key,
          freezeSerializable(nested),
        ]),
      ),
    ) as T;
  }

  return value;
}

function forcedFailureMessage(
  forcedShapeId: string,
  manifest: JourneyManifest,
  validation: ValidationResult,
): string {
  if (validation.ok) {
    return `Forced shape ${forcedShapeId} could not be generated legally`;
  }

  return [
    `Forced shape ${forcedShapeId} failed validation: ${validation.message}`,
    `(shape: ${manifest.shapeId}; rule: ${validation.rule})`,
  ].join(" ");
}

function generationFailureMessage(
  manifest: JourneyManifest,
  validation: ValidationResult,
): string {
  if (validation.ok) {
    return `Journey shape ${manifest.shapeId} could not be generated legally`;
  }

  return [
    `Journey shape ${manifest.shapeId} failed validation: ${validation.message}`,
    `(journey: ${manifest.journeyId}; rule: ${validation.rule})`,
  ].join(" ");
}

export function generateNextJourney(input: GenerationInput): JourneyManifest {
  const { context, previousPick, drawContext } = input;
  const stage =
    input.forcedStage ??
    stageForDreamscape(context.state.quest.resources.dreamscape);
  const selectedTags = desiredTagsFor(context, stage);
  const shapeScores = scoreShapes(
    context,
    drawContext,
    selectedTags,
    previousPick,
  );
  let selectedShapeId: JourneyShapeDefinition["id"];
  if (input.forcedShapeId) {
    if (!isJourneyShapeId(input.forcedShapeId)) {
      throw new Error(`Unknown Journey shape: ${input.forcedShapeId}`);
    }

    selectedShapeId = input.forcedShapeId;
  } else {
    selectedShapeId = selectShape(drawContext, shapeScores);
  }

  const manifest = buildJourneyForShape({
    context,
    drawContext,
    journeyId: journeyId(drawContext.rootJourneyIndex),
    shapeId: selectedShapeId,
    stage,
    selectedTags,
    shapeScores,
    previousPick: previousPickDebug(previousPick),
  });
  const resolvedManifest = attachTargetResolutionMetadata(
    manifest,
    context.content,
    context.state.quest,
  );
  const validation = validateJourneyManifest(resolvedManifest, context);
  if (!validation.ok && input.forcedShapeId) {
    throw new Error(
      forcedFailureMessage(
        input.forcedShapeId,
        resolvedManifest,
        validation,
      ),
    );
  }

  if (!validation.ok) {
    throw new Error(generationFailureMessage(resolvedManifest, validation));
  }

  return freezeSerializable(resolvedManifest);
}

function cloneOptions(options: readonly JourneyOption[]): JourneyOption[] {
  return options.map((journeyOption) => ({
    ...journeyOption,
    symbols: [...journeyOption.symbols],
    operations: [...journeyOption.operations],
    costs: [...journeyOption.costs],
    effects: [...journeyOption.effects],
    burdens: [...journeyOption.burdens],
    targets: [...journeyOption.targets],
    triggers: [...journeyOption.triggers],
    routeEffects: [...journeyOption.routeEffects],
  }));
}

export function advanceSequenceJourney(
  input: SequenceAdvanceInput,
): SequenceAdvanceResult {
  const { context, manifest, selectedOptionNumber } = input;

  if (!manifest.sequence || manifest.sequence.status !== "active") {
    throw new Error("Cannot advance a manifest without an active sequence");
  }

  const selectedOption = manifest.options.find(
    (option) => option.number === selectedOptionNumber,
  );

  if (!selectedOption) {
    throw new Error(
      `Option ${selectedOptionNumber} is not available in ${manifest.journeyId}`,
    );
  }

  if (selectedOption.pickBehavior === "complete_sequence") {
    return {
      kind: "complete",
      journeyId: manifest.journeyId,
      rootJourneyIndex: manifest.rootJourneyIndex,
      sequence: { ...manifest.sequence, status: "complete" },
      shouldGenerateNextRoot: true,
    };
  }

  if (selectedOption.pickBehavior === "leave") {
    return {
      kind: "left",
      journeyId: manifest.journeyId,
      rootJourneyIndex: manifest.rootJourneyIndex,
      sequence: { ...manifest.sequence, status: "left" },
      shouldGenerateNextRoot: true,
    };
  }

  if (selectedOption.pickBehavior !== "advance_sequence") {
    throw new Error(
      `Option ${selectedOptionNumber} does not advance a sequence`,
    );
  }

  const nextStep = manifest.sequence.step + 1;
  const maxSteps = manifest.sequence.maxSteps ?? nextStep;

  if (nextStep > maxSteps) {
    return {
      kind: "complete",
      journeyId: manifest.journeyId,
      rootJourneyIndex: manifest.rootJourneyIndex,
      sequence: { ...manifest.sequence, status: "complete" },
      shouldGenerateNextRoot: true,
    };
  }

  const nextMenu =
    manifest.precommitted.sequenceMenus?.[sequenceMenuKey(nextStep)];

  if (!nextMenu) {
    throw new Error(`Missing precommitted sequence menu for step ${nextStep}`);
  }

  const options = cloneOptions(nextMenu);
  const advanced: JourneyManifest = {
    ...manifest,
    options,
    sequence: {
      ...manifest.sequence,
      step: nextStep,
      status: "active",
    },
    debug: {
      ...manifest.debug,
      optionValues: options.map((journeyOption) =>
        evaluateOptionValue(journeyOption, context),
      ),
    },
  };
  const validation = validateJourneyManifest(advanced, context);

  if (!validation.ok) {
    throw new Error(
      `Advanced sequence manifest failed validation: ${validation.rule}`,
    );
  }

  return {
    kind: "advanced",
    manifest: freezeSerializable(advanced),
  };
}
