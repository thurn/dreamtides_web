import type { JourneyContext } from "../journey/context";
import type {
  JourneyManifest,
  JourneyOperation,
  JourneyOption,
  JourneyTreeBranch,
  ValueBreakdown,
} from "../journey/manifest";
import { getShapeDefinition } from "../journey/shapes/registry";
import { isLeaveBranch } from "./dreamArt";

export type JourneyExplanationCec = {
  readonly cost: number;
  readonly reward: number;
  readonly burden: number;
  readonly uncertainty: number;
  readonly net: number;
};

export type JourneyExplanationValueComponent = {
  readonly label: string;
  readonly kind: string;
  readonly value: number;
};

export type JourneyExplanationOperation = {
  readonly label: string;
  readonly role: string;
  readonly convertedEssence?: number;
  readonly bands: readonly JourneyExplanationValueComponent[];
};

export type JourneyExplanationChoice = {
  readonly id: string;
  readonly label: string;
  readonly text: string;
  readonly locked: boolean;
  readonly odds?: string;
  readonly cec: JourneyExplanationCec;
  readonly valueDetails: readonly string[];
  readonly components: readonly JourneyExplanationValueComponent[];
  readonly costs: readonly JourneyExplanationOperation[];
  readonly rewards: readonly JourneyExplanationOperation[];
  readonly burdens: readonly JourneyExplanationOperation[];
  readonly operations: readonly JourneyExplanationOperation[];
};

export type JourneyExplanationProgress = {
  readonly mode: "flat" | "tree" | "sequence";
  readonly label: string;
  readonly detail: string;
};

export type JourneyExplanation = {
  readonly journeyId: string;
  readonly shapeId: string;
  readonly shapeLabel: string;
  readonly topology: string;
  readonly stage: string;
  readonly dreamscape: number;
  readonly rootJourneyIndex: number;
  readonly seed: string;
  readonly selectedTags: readonly string[];
  readonly selectedShapeScore?: number;
  readonly topShapeScores: readonly { readonly shapeId: string; readonly score: number }[];
  readonly progress: JourneyExplanationProgress;
  readonly choices: readonly JourneyExplanationChoice[];
  readonly precommittedSummaries: readonly string[];
};

function cecForOption(option: JourneyOption): JourneyExplanationCec {
  return {
    cost: option.costConvertedEssence,
    reward: option.effectConvertedEssence,
    burden: option.burdenConvertedEssence,
    uncertainty: option.uncertaintyConvertedEssence,
    net: option.netConvertedEssence,
  };
}

function cecForBranch(branch: JourneyTreeBranch): JourneyExplanationCec {
  return {
    cost: branch.costConvertedEssence,
    reward: branch.effectConvertedEssence,
    burden: branch.burdenConvertedEssence,
    uncertainty: branch.uncertaintyConvertedEssence,
    net: branch.netConvertedEssence,
  };
}

function signed(value: number): string {
  return value > 0 ? `+${String(value)}` : String(value);
}

function valueDetailsFromCec(cec: JourneyExplanationCec): string[] {
  return [
    `Cost: ${String(cec.cost)} CEC.`,
    `Reward: ${signed(cec.reward)} CEC.`,
    `Burden: ${signed(cec.burden)} CEC.`,
    `Uncertainty: ${signed(cec.uncertainty)} CEC.`,
    `Net: ${signed(cec.net)} CEC.`,
  ];
}

function componentsFromBreakdown(
  breakdown: ValueBreakdown | undefined,
): JourneyExplanationValueComponent[] {
  return (breakdown?.components ?? []).map((component) => ({
    label: component.label,
    kind: component.kind,
    value: component.value,
  }));
}

function valueDetailsFromBreakdown(
  breakdown: ValueBreakdown | undefined,
  cec: JourneyExplanationCec,
): readonly string[] {
  return breakdown?.detail.length ? breakdown.detail : valueDetailsFromCec(cec);
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function stringField(
  source: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = source[key];
  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined;
}

function numberField(
  source: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = source[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function convertedEssence(value: unknown): number | undefined {
  const source = record(value);
  if (!source) return undefined;

  const direct = numberField(source, "convertedEssence") ?? numberField(source, "cec");
  if (direct !== undefined) return direct;

  const nestedValue = record(source.value);
  if (nestedValue) {
    return numberField(nestedValue, "convertedEssence");
  }

  const payload = record(source.payload);
  return payload ? numberField(payload, "convertedEssence") : undefined;
}

function operationLabel(value: unknown, fallback: string): string {
  const source = record(value);
  if (!source) return fallback;

  return (
    stringField(source, "text") ??
    stringField(source, "label") ??
    stringField(source, "description") ??
    stringField(source, "templateId") ??
    stringField(source, "rewardKind") ??
    stringField(source, "costKind") ??
    stringField(source, "burdenKind") ??
    stringField(source, "operationKind") ??
    stringField(source, "kind") ??
    fallback
  );
}

function operationRole(value: unknown, fallback: string): string {
  const source = record(value);
  if (!source) return fallback;
  return stringField(source, "role") ?? stringField(source, "operationKind") ?? fallback;
}

function bandsForOperation(value: unknown): JourneyExplanationValueComponent[] {
  const source = record(value);
  const valueMetadata = source ? record(source.value) : null;
  const bands = Array.isArray(valueMetadata?.bands) ? valueMetadata.bands : [];
  return bands.flatMap((band) => {
    const bandRecord = record(band);
    if (!bandRecord) return [];
    const amount = numberField(bandRecord, "amount");
    if (amount === undefined) return [];
    return [
      {
        label: operationLabel(bandRecord, "value band"),
        kind: stringField(bandRecord, "id") ?? "value-band",
        value: amount,
      },
    ];
  });
}

function summarizeRecord(
  value: unknown,
  fallback: string,
): JourneyExplanationOperation {
  return {
    label: operationLabel(value, fallback),
    role: operationRole(value, fallback),
    convertedEssence: convertedEssence(value),
    bands: bandsForOperation(value),
  };
}

function summarizeRecords(
  values: readonly unknown[],
  fallback: string,
): JourneyExplanationOperation[] {
  return values.map((value, index) =>
    summarizeRecord(value, `${fallback} ${String(index + 1)}`),
  );
}

function summarizeOperations(
  operations: readonly JourneyOperation[],
): JourneyExplanationOperation[] {
  return operations.map((operation, index) =>
    summarizeRecord(operation, `operation ${String(index + 1)}`),
  );
}

function choiceFromOption(
  option: JourneyOption,
  valueBreakdown: ValueBreakdown | undefined,
): JourneyExplanationChoice {
  const cec = cecForOption(option);
  return {
    id: `option-${String(option.number)}`,
    label: `Option ${String(option.number)}`,
    text: option.text,
    locked: option.locked,
    cec,
    valueDetails: valueDetailsFromBreakdown(valueBreakdown, cec),
    components: componentsFromBreakdown(valueBreakdown),
    costs: summarizeRecords(option.costs, "cost"),
    rewards: summarizeRecords(option.effects, "reward"),
    burdens: summarizeRecords(option.burdens, "burden"),
    operations: summarizeOperations(option.operations),
  };
}

function choiceFromBranch(branch: JourneyTreeBranch): JourneyExplanationChoice {
  const cec = cecForBranch(branch);
  const terminal = branch.terminal;
  return {
    id: `branch-${branch.id}`,
    label: branch.label,
    text: branch.text,
    locked: branch.locked,
    odds: branch.odds ? `${String(branch.odds.percent)}%` : undefined,
    cec,
    valueDetails: valueDetailsFromCec(cec),
    components: [],
    costs: summarizeRecords(
      [...branch.costs, ...(terminal?.costs ?? [])],
      "cost",
    ),
    rewards: summarizeRecords(
      [...branch.effects, ...(terminal?.effects ?? [])],
      "reward",
    ),
    burdens: summarizeRecords(
      [...branch.burdens, ...(terminal?.burdens ?? [])],
      "burden",
    ),
    operations: summarizeOperations([
      ...branch.operations,
      ...(terminal?.operations ?? []),
    ]),
  };
}

function flatProgress(manifest: JourneyManifest): JourneyExplanationProgress {
  return {
    mode: "flat",
    label: "Flat menu",
    detail: `${String(manifest.options.filter((option) => option.pickBehavior !== "leave").length)} visible choices.`,
  };
}

function treeProgress(
  manifest: JourneyManifest,
  currentNodeId: string | null,
): JourneyExplanationProgress {
  const nodes = manifest.tree?.nodes ?? [];
  const currentNode = nodes.find((node) => node.id === currentNodeId);
  const nodeIndex = currentNode
    ? nodes.findIndex((node) => node.id === currentNode.id) + 1
    : 0;

  return {
    mode: "tree",
    label: currentNode?.levelLabel ?? "Decision tree",
    detail:
      currentNode !== undefined
        ? `Node ${String(nodeIndex)} of ${String(nodes.length)}: ${currentNode.id}.`
        : `Decision tree with ${String(nodes.length)} nodes.`,
  };
}

function sequenceProgress(manifest: JourneyManifest): JourneyExplanationProgress {
  const sequence = manifest.sequence;
  if (!sequence) return flatProgress(manifest);

  const max = sequence.maxSteps !== undefined ? ` of ${String(sequence.maxSteps)}` : "";
  return {
    mode: "sequence",
    label: `Sequence ${sequence.status}`,
    detail: `Step ${String(sequence.step)}${max}.`,
  };
}

function progressFor(
  manifest: JourneyManifest,
  currentNodeId: string | null,
): JourneyExplanationProgress {
  if (manifest.tree) return treeProgress(manifest, currentNodeId);
  if (manifest.sequence) return sequenceProgress(manifest);
  return flatProgress(manifest);
}

function precommittedSummaries(manifest: JourneyManifest): string[] {
  const summaries: string[] = [];

  for (const outcome of manifest.precommitted.random ?? []) {
    const source = record(outcome);
    if (!source) continue;
    const presentation = stringField(source, "presentation");
    const summary = stringField(source, "summary");
    const kind = stringField(source, "kind") ?? "random";
    summaries.push(presentation ?? summary ?? kind);
  }

  if (manifest.precommitted.sequenceMenus) {
    summaries.push(
      `${String(Object.keys(manifest.precommitted.sequenceMenus).length)} sequence menus precommitted.`,
    );
  }

  if (manifest.precommitted.operations?.length) {
    summaries.push(
      `${String(manifest.precommitted.operations.length)} operations precommitted.`,
    );
  }

  return summaries;
}

export function buildJourneyExplanation(args: {
  readonly manifest: JourneyManifest;
  readonly context: JourneyContext;
  readonly currentNodeId: string | null;
}): JourneyExplanation {
  const { manifest, currentNodeId } = args;
  void args.context;
  const definition = getShapeDefinition(manifest.shapeId);
  const valueBreakdowns = new Map(
    manifest.debug.optionValues.map((breakdown) => [
      breakdown.optionNumber,
      breakdown,
    ]),
  );
  const currentNode = manifest.tree?.nodes.find((node) => node.id === currentNodeId);
  const choices = manifest.tree
    ? (currentNode?.branches ?? [])
        .filter((branch) => branch.kind === "player_choice" && !isLeaveBranch(branch))
        .map(choiceFromBranch)
    : manifest.options
        .filter((option) => option.pickBehavior !== "leave")
        .map((option) => choiceFromOption(option, valueBreakdowns.get(option.number)));
  const selectedScore = manifest.debug.shapeScores.find(
    (entry) => entry.shapeId === manifest.shapeId,
  )?.score;

  return {
    journeyId: manifest.journeyId,
    shapeId: manifest.shapeId,
    shapeLabel: definition.debugLabel,
    topology: definition.topology,
    stage: manifest.stage,
    dreamscape: manifest.dreamscape,
    rootJourneyIndex: manifest.rootJourneyIndex,
    seed: manifest.seed,
    selectedTags: manifest.debug.selectedTags.length
      ? manifest.debug.selectedTags
      : manifest.selectedTags,
    selectedShapeScore: selectedScore,
    topShapeScores: manifest.debug.shapeScores.slice(0, 5),
    progress: progressFor(manifest, currentNodeId),
    choices,
    precommittedSummaries: precommittedSummaries(manifest),
  };
}
