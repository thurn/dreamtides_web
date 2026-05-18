import type { DrawContext } from "../util/rng";
import { generateNextJourney, type GenerationInput } from "./generate";
import type { JourneyManifest, JourneyShapeId } from "./manifest";
import { findCost } from "./shared/costs";
import { findReward } from "./shared/rewards";
import { isJourneyShapeId } from "./shapes/registry";

export type JourneyDebugForcing = {
  readonly shapeId?: string | null;
  readonly rewardTemplateId?: string | null;
  readonly costTemplateId?: string | null;
  readonly maxAttempts?: number;
};

export type JourneyDebugHarnessAttempt = {
  readonly attempt: number;
  readonly rootJourneyIndex: number;
  readonly shapeId?: string;
  readonly rewardTemplateIds: readonly string[];
  readonly costTemplateIds: readonly string[];
  readonly error?: string;
};

export type JourneyDebugHarnessResult = {
  readonly manifest: JourneyManifest;
  readonly attempts: readonly JourneyDebugHarnessAttempt[];
};

export class JourneyDebugHarnessError extends Error {
  readonly attempts: readonly JourneyDebugHarnessAttempt[];

  constructor(
    message: string,
    attempts: readonly JourneyDebugHarnessAttempt[] = [],
  ) {
    super(message);
    this.name = "JourneyDebugHarnessError";
    this.attempts = attempts;
  }
}

const DEFAULT_TEMPLATE_ATTEMPTS = 120;
const MAX_TEMPLATE_ATTEMPTS = 500;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function hasDebugForcing(forcing: JourneyDebugForcing | undefined): boolean {
  return Boolean(
    forcing?.shapeId ?? forcing?.rewardTemplateId ?? forcing?.costTemplateId,
  );
}

function boundedAttemptCount(forcing: JourneyDebugForcing): number {
  const requested = forcing.maxAttempts ?? DEFAULT_TEMPLATE_ATTEMPTS;
  if (!Number.isFinite(requested)) {
    return DEFAULT_TEMPLATE_ATTEMPTS;
  }

  return Math.max(1, Math.min(MAX_TEMPLATE_ATTEMPTS, Math.trunc(requested)));
}

function validateForcedShape(shapeId: string | null | undefined): JourneyShapeId | undefined {
  if (!shapeId) {
    return undefined;
  }

  if (!isJourneyShapeId(shapeId)) {
    throw new JourneyDebugHarnessError(
      `[journeys/debug-harness] Invalid debugJourneyShape "${shapeId}".`,
    );
  }

  return shapeId;
}

function validateForcedReward(rewardTemplateId: string | null | undefined): string | undefined {
  if (!rewardTemplateId) {
    return undefined;
  }

  if (!findReward(rewardTemplateId)) {
    throw new JourneyDebugHarnessError(
      `[journeys/debug-harness] Invalid debugJourneyReward "${rewardTemplateId}".`,
    );
  }

  return rewardTemplateId;
}

function validateForcedCost(costTemplateId: string | null | undefined): string | undefined {
  if (!costTemplateId) {
    return undefined;
  }

  if (!findCost(costTemplateId)) {
    throw new JourneyDebugHarnessError(
      `[journeys/debug-harness] Invalid debugJourneyCost "${costTemplateId}".`,
    );
  }

  return costTemplateId;
}

function drawContextForAttempt(
  drawContext: DrawContext,
  attempt: number,
): DrawContext {
  return {
    ...drawContext,
    rootJourneyIndex: drawContext.rootJourneyIndex + attempt,
  };
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) =>
    left.localeCompare(right, "en-US"),
  );
}

function recordTemplateId(
  value: unknown,
  rewardTemplateIds: Set<string>,
  costTemplateIds: Set<string>,
): void {
  if (Array.isArray(value)) {
    value.forEach((entry) =>
      recordTemplateId(entry, rewardTemplateIds, costTemplateIds),
    );
    return;
  }

  if (typeof value !== "object" || value === null) {
    return;
  }

  const record = value as Record<string, unknown>;
  const templateId = record.templateId;

  if (
    typeof templateId === "string" &&
    (record.operationKind === "reward" ||
      record.kind === "shared_reward_template")
  ) {
    rewardTemplateIds.add(templateId);
  }

  if (
    typeof templateId === "string" &&
    (record.operationKind === "cost" || record.kind === "shared_cost_template")
  ) {
    costTemplateIds.add(templateId);
  }

  const rewardIds = record.rewardTemplateIds;
  if (Array.isArray(rewardIds)) {
    for (const rewardId of rewardIds) {
      if (typeof rewardId === "string") {
        rewardTemplateIds.add(rewardId);
      }
    }
  }

  Object.values(record).forEach((entry) =>
    recordTemplateId(entry, rewardTemplateIds, costTemplateIds),
  );
}

export function journeyManifestTemplateIds(manifest: JourneyManifest): {
  readonly rewardTemplateIds: readonly string[];
  readonly costTemplateIds: readonly string[];
} {
  const rewardTemplateIds = new Set<string>();
  const costTemplateIds = new Set<string>();
  recordTemplateId(manifest, rewardTemplateIds, costTemplateIds);

  return {
    rewardTemplateIds: uniqueSorted(rewardTemplateIds),
    costTemplateIds: uniqueSorted(costTemplateIds),
  };
}

export function journeyManifestIncludesTemplateIds(
  manifest: JourneyManifest,
  forced: {
    readonly rewardTemplateId?: string | null;
    readonly costTemplateId?: string | null;
  },
): boolean {
  const ids = journeyManifestTemplateIds(manifest);
  return (
    (!forced.rewardTemplateId ||
      ids.rewardTemplateIds.includes(forced.rewardTemplateId)) &&
    (!forced.costTemplateId ||
      ids.costTemplateIds.includes(forced.costTemplateId))
  );
}

function failureMessage(
  forcing: {
    readonly shapeId?: string;
    readonly rewardTemplateId?: string;
    readonly costTemplateId?: string;
  },
  attempts: readonly JourneyDebugHarnessAttempt[],
): string {
  const requested = [
    forcing.shapeId ? `shape "${forcing.shapeId}"` : null,
    forcing.rewardTemplateId ? `reward "${forcing.rewardTemplateId}"` : null,
    forcing.costTemplateId ? `cost "${forcing.costTemplateId}"` : null,
  ].filter((entry): entry is string => entry !== null);

  return [
    `[journeys/debug-harness] Could not generate a viable Dream Journey for ${requested.join(", ")}`,
    `after ${attempts.length} attempt${attempts.length === 1 ? "" : "s"}.`,
  ].join(" ");
}

export function generateNextJourneyWithDebugHarness(
  input: GenerationInput & {
    readonly debugForcing?: JourneyDebugForcing;
  },
): JourneyDebugHarnessResult {
  if (!hasDebugForcing(input.debugForcing)) {
    return {
      manifest: generateNextJourney(input),
      attempts: [],
    };
  }

  const debugForcing = input.debugForcing ?? {};
  const shapeId = validateForcedShape(debugForcing.shapeId);
  const rewardTemplateId = validateForcedReward(debugForcing.rewardTemplateId);
  const costTemplateId = validateForcedCost(debugForcing.costTemplateId);
  const maxAttempts =
    rewardTemplateId || costTemplateId ? boundedAttemptCount(debugForcing) : 1;
  const attempts: JourneyDebugHarnessAttempt[] = [];

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const drawContext = drawContextForAttempt(input.drawContext, attempt);

    try {
      const manifest = generateNextJourney({
        ...input,
        drawContext,
        forcedShapeId: shapeId ?? input.forcedShapeId,
      });
      const templateIds = journeyManifestTemplateIds(manifest);
      attempts.push({
        attempt,
        rootJourneyIndex: drawContext.rootJourneyIndex,
        shapeId: manifest.shapeId,
        rewardTemplateIds: templateIds.rewardTemplateIds,
        costTemplateIds: templateIds.costTemplateIds,
      });

      if (
        journeyManifestIncludesTemplateIds(manifest, {
          rewardTemplateId,
          costTemplateId,
        })
      ) {
        return { manifest, attempts };
      }
    } catch (error) {
      attempts.push({
        attempt,
        rootJourneyIndex: drawContext.rootJourneyIndex,
        rewardTemplateIds: [],
        costTemplateIds: [],
        error: errorMessage(error),
      });
    }
  }

  throw new JourneyDebugHarnessError(
    failureMessage({ shapeId, rewardTemplateId, costTemplateId }, attempts),
    attempts,
  );
}
