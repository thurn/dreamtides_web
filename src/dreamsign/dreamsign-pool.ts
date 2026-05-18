import { createDreamsign } from "../data/dreamsigns";
import type { DreamsignTemplate, PackageTideId } from "../types/content";
import type { Dreamsign } from "../types/quest";

export interface DreamsignPoolDraw {
  offeredIds: string[];
  offeredDreamsigns: Dreamsign[];
  remainingDreamsignPool: string[];
}

export interface DreamsignPoolState {
  availableIds: string[];
  templatesById: Map<string, DreamsignTemplate>;
}

function canonicalizeDreamsignPool(
  remainingDreamsignPool: readonly string[],
  templates: readonly DreamsignTemplate[],
): DreamsignPoolState {
  const templatesById = new Map(
    templates.map((template) => [template.id, template]),
  );
  const seenIds = new Set<string>();
  const availableIds: string[] = [];

  for (const id of remainingDreamsignPool) {
    if (seenIds.has(id) || !templatesById.has(id)) {
      continue;
    }

    seenIds.add(id);
    availableIds.push(id);
  }

  return {
    availableIds,
    templatesById,
  };
}

function shufflePick<T>(items: readonly T[], count: number): T[] {
  const pool = [...items];
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
  }
  return pool.slice(0, count);
}

/**
 * Returns true when the template overlaps any of the given required tides.
 * A missing template (unknown id) is treated as not covering any tide.
 */
function templateCoversRequiredTide(
  template: DreamsignTemplate | undefined,
  requiredTides: ReadonlySet<PackageTideId>,
): boolean {
  if (template === undefined || requiredTides.size === 0) {
    return false;
  }
  return template.packageTides.some((tide) => requiredTides.has(tide));
}

/**
 * Enforces the "at least one offered dreamsign must come from a required
 * structural tide" guarantee on an already-sampled offer list.
 *
 * If the offer already includes a required-tide template, the offer is
 * returned unchanged. Otherwise, the function swaps one offered id for a
 * randomly-chosen eligible id drawn from `workingIds`. Random placement of
 * the swap keeps the constraint invisible in the UI: the structural slot is
 * not always first or always marked.
 *
 * Falls back gracefully when no eligible id exists in the working pool
 * (e.g. the pool is exhausted of required-tide dreamsigns) -- the original
 * offer is returned and the caller is responsible for any further fallback.
 */
function ensureRequiredTideCoverage(
  offeredIds: readonly string[],
  workingIds: readonly string[],
  templatesById: ReadonlyMap<string, DreamsignTemplate>,
  requiredTides: ReadonlyArray<PackageTideId>,
): string[] {
  const requiredTideSet = new Set(requiredTides);
  if (requiredTideSet.size === 0 || offeredIds.length === 0) {
    return [...offeredIds];
  }

  const alreadyCovers = offeredIds.some((id) =>
    templateCoversRequiredTide(templatesById.get(id), requiredTideSet),
  );
  if (alreadyCovers) {
    return [...offeredIds];
  }

  const offeredSet = new Set(offeredIds);
  const eligibleCandidates = workingIds.filter(
    (id) =>
      !offeredSet.has(id) &&
      templateCoversRequiredTide(templatesById.get(id), requiredTideSet),
  );

  if (eligibleCandidates.length === 0) {
    // Nothing in the working pool covers a required tide. Graceful fallback:
    // return the offer as-is so the player still sees a complete draft.
    return [...offeredIds];
  }

  const chosenEligible =
    eligibleCandidates[Math.floor(Math.random() * eligibleCandidates.length)];
  const swapIndex = Math.floor(Math.random() * offeredIds.length);
  const result = [...offeredIds];
  result[swapIndex] = chosenEligible;
  return result;
}

/** Returns the canonical remaining Dreamsign ids backed by known templates. */
export function readDreamsignPool(
  remainingDreamsignPool: readonly string[],
  templates: readonly DreamsignTemplate[],
): DreamsignPoolState {
  return canonicalizeDreamsignPool(remainingDreamsignPool, templates);
}

/**
 * Draws unique Dreamsigns from the shared run pool and spends them
 * immediately. When the remaining pool cannot fill a full offer, the multiset
 * is recreated from `regenerationPoolIds` (the run's full Dreamsign pool) so
 * the shared pool behaves as a renewable resource, as the design document
 * describes.
 *
 * When `requiredTides` is non-empty (the active dreamcaller's required
 * structural tides) the draw guarantees that at least one offered dreamsign
 * carries a template tide in `requiredTides`, biasing the sampler only by
 * swapping a single slot when the unbiased shuffle did not naturally cover
 * the requirement. The swap is randomly positioned so the constrained slot
 * is not detectable from the offer's order. When the working pool contains
 * no required-tide template the draw falls back gracefully and returns the
 * unbiased offer.
 */
export function drawDreamsignOptions(
  remainingDreamsignPool: readonly string[],
  templates: readonly DreamsignTemplate[],
  count: number,
  regenerationPoolIds?: readonly string[],
  requiredTides?: readonly PackageTideId[],
): DreamsignPoolDraw {
  const { availableIds, templatesById } = canonicalizeDreamsignPool(
    remainingDreamsignPool,
    templates,
  );

  let workingIds = availableIds;
  if (workingIds.length < count && regenerationPoolIds !== undefined) {
    const regenerated = canonicalizeDreamsignPool(
      regenerationPoolIds,
      templates,
    ).availableIds;
    if (regenerated.length > workingIds.length) {
      workingIds = regenerated;
    }
  }

  const initialOfferedIds = shufflePick(
    workingIds,
    Math.min(count, workingIds.length),
  );

  const offeredIds =
    requiredTides !== undefined && requiredTides.length > 0
      ? ensureRequiredTideCoverage(
          initialOfferedIds,
          workingIds,
          templatesById,
          requiredTides,
        )
      : initialOfferedIds;

  return {
    offeredIds,
    offeredDreamsigns: offeredIds.map((id) =>
      createDreamsign(templatesById.get(id)!),
    ),
    remainingDreamsignPool:
      offeredIds.length === 0
        ? workingIds
        : workingIds.filter((id) => !offeredIds.includes(id)),
  };
}

/** Resolves the currently available Dreamsign templates from a shared pool. */
export function resolveDreamsignTemplates(
  remainingDreamsignPool: readonly string[],
  templates: readonly DreamsignTemplate[],
): DreamsignTemplate[] {
  const { availableIds, templatesById } = readDreamsignPool(
    remainingDreamsignPool,
    templates,
  );

  return availableIds.map((id) => templatesById.get(id)!);
}
