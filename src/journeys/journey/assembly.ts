// Journey assembly layer.
//
// Ported from the CLI's `src/journey/assembly.ts`. Takes a shape's
// `FilledJourney`, combines it with shape-agnostic metadata (versions, seed,
// stage, references, debug, target-resolution metadata), and produces the
// draft `JourneyManifest`.
//
// Two port-specific changes:
//
// 1. `RENDERER_VERSION` is inlined. The CLI sources it from
//    `src/render/theme.ts` (ANSI terminal theme), which is intentionally not
//    ported (the React UI uses its own styles). The constant is preserved at
//    its CLI value so manifest version metadata stays comparable.
// 2. `rootJourneyIndex` is read from `args.drawContext` rather than
//    `args.context.state.generator.rootJourneyIndex`. The prototype's
//    `JourneyContext` does not carry a `generator` projection; the
//    `DrawContext` carries the same index and is already plumbed through.
//
// One semantic addition: after building each option and branch, the
// `locked` flag is set to `true` when any cost on that option/branch is
// unaffordable for the current quest state. This is computed by inspecting
// each cost payload for a `templateId`/`params` pair (the convention
// shapes use when serialising costs into the manifest), looking up the
// matching cost template via `getCost`, and calling its `locked()`
// predicate. Payloads that already carry an explicit `locked: true` field
// or whose rendered text begins with the `[LOCKED]` marker are also
// treated as locked, so shapes that pre-compute the flag during fill
// continue to work without modification.
//
// Pure module: no I/O, no Node imports. Browser-safe.

import type { ContentBundle } from "../content/types";
import type { JourneyContext } from "./context";
import type { DrawContext } from "../util/rng";
import { shuffleDeterministic } from "../util/rng";
import {
  BANE_NAMES,
  EFFECT_CATALOG_VERSION,
  STANDARD_TRANSFIGURATIONS,
  attachTargetResolutionMetadata,
  isBaneName,
  resolveCardTargets,
  resolveDreamsignTargets,
} from "./effects";
import type {
  GeneratedObjectDefinition,
  JourneyManifest,
  JourneyOption,
  JourneyStage,
  JourneyTree,
  JourneyTreeBranch,
  JourneyTreeNode,
  ManifestReferences,
  PrecommittedOutcomes,
  RandomPrecommittedOutcome,
} from "./manifest";
import {
  MANIFEST_CONTRACT_VERSION,
  MANIFEST_SCHEMA_VERSION,
} from "./manifest";
import { getCost } from "./shared/costs";
import { getShapePlugin } from "./shapes/registry";
import { JOURNEY_SHAPE_CATALOG_VERSION } from "./shapes/shared";
import type { FilledJourney, JourneyShapeId } from "./shapes/types";
import {
  VALUE_MODEL_VERSION,
  evaluateOptionValue,
  type ValueBreakdown,
} from "./value";

// The CLI sources this from `src/render/theme.ts`, which is not ported (the
// React UI uses its own styles). Inlined here at the CLI value so the
// manifest's version metadata stays byte-identical across the port boundary.
const RENDERER_VERSION = "renderer:v1" as const;

export type BuildJourneyArgs = {
  context: JourneyContext;
  drawContext: DrawContext;
  journeyId: string;
  shapeId: JourneyShapeId;
  stage: JourneyStage;
  selectedTags: string[];
  shapeScores: { shapeId: JourneyShapeId; score: number }[];
  previousPick?: JourneyManifest["debug"]["previousPick"];
};

function optionalFilledManifestFields(
  filled: FilledJourney,
  tree: JourneyTree | undefined,
): Pick<JourneyManifest, "tree" | "rewardPool" | "sequence" | "presentation"> {
  const fields: Pick<
    JourneyManifest,
    "tree" | "rewardPool" | "sequence" | "presentation"
  > = {};

  if (filled.presentation) {
    fields.presentation = filled.presentation;
  }

  if (tree) {
    fields.tree = tree;
  }

  if (filled.rewardPool) {
    fields.rewardPool = filled.rewardPool;
  }

  if (filled.sequence) {
    fields.sequence = filled.sequence;
  }

  return fields;
}

function automaticLeaveEnabled(shapeId: JourneyShapeId): boolean {
  return getShapePlugin(shapeId).definition.automaticLeave !== false;
}

function automaticLeaveOption(number: number): JourneyOption {
  return {
    number,
    symbols: [],
    text: "Leave.",
    operations: [],
    costs: [],
    effects: [],
    burdens: [],
    targets: [],
    triggers: [],
    routeEffects: [],
    costConvertedEssence: 0,
    effectConvertedEssence: 0,
    burdenConvertedEssence: 0,
    uncertaintyConvertedEssence: 0,
    netConvertedEssence: 0,
    pickBehavior: "leave",
    locked: false,
  };
}

function withAutomaticLeaveOptions(
  shapeId: JourneyShapeId,
  options: readonly JourneyOption[],
  tree: JourneyTree | undefined,
): JourneyOption[] {
  if (!automaticLeaveEnabled(shapeId) || tree) {
    return [...options];
  }

  const meaningfulOptions = options
    .filter((option) => option.pickBehavior !== "leave")
    .map((option, index) => ({ ...option, number: index + 1 }));

  return [
    ...meaningfulOptions,
    automaticLeaveOption(meaningfulOptions.length + 1),
  ];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// A cost payload is considered locked when any of the following hold:
//
//  - it explicitly carries `locked: true` (a shape pre-computed it during fill);
//  - its rendered text begins with the `[LOCKED]` marker
//    (the `withLockedPrefix` convention from `shared/text.ts`); or
//  - it carries a `templateId` + `params` pair we can route through the cost
//    catalog's structural `locked(params, ctx)` predicate.
//
// The third path is the primary, structural check. The first two are
// fallbacks for shapes that either set the flag eagerly or only render text.
function isCostPayloadLocked(payload: unknown, ctx: JourneyContext): boolean {
  if (!isRecord(payload)) {
    return false;
  }

  if (payload.locked === true) {
    return true;
  }

  if (typeof payload.text === "string" && payload.text.startsWith("[LOCKED]")) {
    return true;
  }

  if (typeof payload.templateId !== "string") {
    return false;
  }

  let template;
  try {
    template = getCost(payload.templateId);
  } catch {
    return false;
  }

  const params = isRecord(payload.params) ? payload.params : {};
  try {
    return template.locked(params, ctx);
  } catch {
    return false;
  }
}

function optionWithLockedFlag(
  option: JourneyOption,
  ctx: JourneyContext,
): JourneyOption {
  if (option.locked === true) {
    return option;
  }

  const locked = option.costs.some((cost) => isCostPayloadLocked(cost, ctx));

  return locked ? { ...option, locked: true } : option;
}

function branchWithLockedFlag(
  branch: JourneyTreeBranch,
  ctx: JourneyContext,
): JourneyTreeBranch {
  if (branch.locked === true) {
    return branch;
  }

  const locked = branch.costs.some((cost) => isCostPayloadLocked(cost, ctx));

  return locked ? { ...branch, locked: true } : branch;
}

function treeWithLockedFlags(
  tree: JourneyTree | undefined,
  ctx: JourneyContext,
): JourneyTree | undefined {
  if (!tree) {
    return tree;
  }

  const nodes: JourneyTreeNode[] = tree.nodes.map((node) => ({
    ...node,
    branches: node.branches.map((branch) => branchWithLockedFlag(branch, ctx)),
  }));

  return { ...tree, nodes };
}

function naturalResourceRandomPrecommits(
  options: readonly JourneyOption[],
): RandomPrecommittedOutcome[] {
  return options.flatMap((journeyOption) =>
    [
      ...journeyOption.costs,
      ...journeyOption.effects,
      ...journeyOption.burdens,
    ]
      .flatMap((payload): RandomPrecommittedOutcome[] => {
        if (
          !isRecord(payload) ||
          (payload.kind !== "resource_random_range" &&
            payload.resourceAmountKind !== "random_range") ||
          (payload.resource !== "essence" && payload.resource !== "omens") ||
          typeof payload.minimum !== "number" ||
          typeof payload.maximum !== "number" ||
          typeof payload.amount !== "number"
        ) {
          return [];
        }

        return [{
          optionNumber: journeyOption.number,
          kind: "resource_random_range",
          resource: payload.resource,
          minimum: payload.minimum,
          maximum: payload.maximum,
          committedAmount: payload.amount,
        }];
      }),
  );
}

function selectedCardTargets(
  context: JourneyContext,
  drawContext: DrawContext,
) {
  const selected = resolveCardTargets(context.content, context.state.quest, {
    source: "draftPool",
    tideOverlap: "selected",
  });
  const fallback = resolveCardTargets(context.content, context.state.quest, {
    source: "draftPool",
  });

  return shuffleDeterministic(
    drawContext,
    "targets:cards",
    selected.length > 0 ? selected : fallback,
  );
}

function selectedDreamsignTargets(
  context: JourneyContext,
  drawContext: DrawContext,
) {
  const selected = resolveDreamsignTargets(
    context.content,
    context.state.quest,
    {
      source: "pool",
      tideOverlap: "selected",
    },
  );
  const fallback = resolveDreamsignTargets(
    context.content,
    context.state.quest,
    {
      source: "pool",
    },
  );

  return shuffleDeterministic(
    drawContext,
    "targets:dreamsigns",
    selected.length > 0 ? selected : fallback,
  );
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) =>
    left.localeCompare(right, "en-US"),
  );
}

function addBaneReference(references: Set<string>, value: unknown): void {
  if (typeof value === "string" && isBaneName(value)) {
    references.add(value);
  }
}

function collectBaneReferencesFromValue(
  value: unknown,
  references: Set<string>,
): void {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectBaneReferencesFromValue(entry, references));
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  addBaneReference(references, value.baneName);
  addBaneReference(references, value.newBaneName);

  if (Array.isArray(value.baneNames)) {
    value.baneNames.forEach((entry) => addBaneReference(references, entry));
  }

  if (Array.isArray(value.banes)) {
    value.banes.forEach((entry) => addBaneReference(references, entry));
  }

  if (
    (value.kind === "bane" || value.selectorKind === "bane") &&
    Array.isArray(value.names)
  ) {
    value.names.forEach((entry) => addBaneReference(references, entry));
  }

  Object.values(value).forEach((entry) =>
    collectBaneReferencesFromValue(entry, references),
  );
}

function collectBaneReferences(values: readonly unknown[]): string[] {
  const references = new Set<string>();

  values.forEach((value) => collectBaneReferencesFromValue(value, references));

  return uniqueSorted([...references]);
}

function referencesFor(
  content: ContentBundle,
  cardIds: readonly string[],
  dreamsignIds: readonly string[],
  baneReferenceSources: readonly unknown[] = [],
): ManifestReferences {
  const dreamcallerIds = content.dreamcallers.map(
    (dreamcaller) => dreamcaller.id,
  );

  return {
    cardIds: uniqueSorted(cardIds),
    dreamsignIds: uniqueSorted(dreamsignIds),
    dreamcallerIds: uniqueSorted(dreamcallerIds),
    baneNames: collectBaneReferences(baneReferenceSources),
  };
}

function previousPickDebug(args: BuildJourneyArgs): {
  previousPick?: JourneyManifest["debug"]["previousPick"];
} {
  if (!args.previousPick) {
    return {};
  }

  return { previousPick: args.previousPick };
}

export function buildJourneyForShape(args: BuildJourneyArgs): JourneyManifest {
  const selectedCards = selectedCardTargets(
    args.context,
    args.drawContext,
  ).slice(0, 3);
  const selectedDreamsigns = selectedDreamsignTargets(
    args.context,
    args.drawContext,
  ).slice(0, 3);
  const plugin = getShapePlugin(args.shapeId);
  const shape = plugin.definition;
  const filled = plugin.fill({
    context: args.context,
    drawContext: args.drawContext,
    stage: args.stage,
  });
  const tree = treeWithLockedFlags(filled.tree, args.context);
  const options = withAutomaticLeaveOptions(
    args.shapeId,
    filled.options
      .slice(0, shape.rootOptionCount.max)
      .map((option) => optionWithLockedFlag(option, args.context)),
    tree,
  );
  const resourceRandomPrecommits = naturalResourceRandomPrecommits(options);
  const legacyPrecommitted: PrecommittedOutcomes = {
    ...filled.precommitted,
    ...(resourceRandomPrecommits.length > 0
      ? {
          random: [
            ...(filled.precommitted.random ?? []),
            ...resourceRandomPrecommits,
          ],
        }
      : {}),
  };
  const precommitted = {
    ...legacyPrecommitted,
    operations: filled.precommitted.operations ?? [],
  };
  const optionValues: ValueBreakdown[] = options.map((journeyOption) =>
    evaluateOptionValue(journeyOption, args.context),
  );
  const symmetryContracts = filled.symmetryContracts;
  const generatedObjects: GeneratedObjectDefinition[] = [
    ...(filled.generatedObjects ?? []),
  ];

  const manifest: JourneyManifest = {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    versions: {
      contentVersion: args.context.contentVersion,
      shapeCatalogVersion: JOURNEY_SHAPE_CATALOG_VERSION,
      effectCatalogVersion: EFFECT_CATALOG_VERSION,
      valueModelVersion: VALUE_MODEL_VERSION,
      rendererVersion: RENDERER_VERSION,
      manifestContractVersion: MANIFEST_CONTRACT_VERSION,
    },
    journeyId: args.journeyId,
    seed: args.context.state.quest.seed,
    rootJourneyIndex: args.drawContext.rootJourneyIndex,
    shapeId: args.shapeId,
    stage: args.stage,
    dreamscape: args.context.state.quest.resources.dreamscape,
    selectedTags: args.selectedTags,
    options,
    generatedObjects,
    ...optionalFilledManifestFields(filled, tree),
    precommitted,
    debug: {
      shapeScores: args.shapeScores,
      selectedShapeId: args.shapeId,
      selectedTags: args.selectedTags,
      optionValues,
      ...(symmetryContracts && symmetryContracts.length > 0
        ? { symmetryContracts: [...symmetryContracts] }
        : {}),
      ...previousPickDebug(args),
    },
    references: referencesFor(
      args.context.content,
      selectedCards.map((card) => card.id),
      selectedDreamsigns.map((dreamsign) => dreamsign.id),
      [
        options,
        generatedObjects,
        filled.tree,
        filled.rewardPool,
        precommitted,
      ],
    ),
  };

  return attachTargetResolutionMetadata(
    manifest,
    args.context.content,
    args.context.state.quest,
  );
}

export function allowedGeneratedVocabulary() {
  return {
    banes: [...BANE_NAMES],
    transfigurations: [...STANDARD_TRANSFIGURATIONS],
  };
}
