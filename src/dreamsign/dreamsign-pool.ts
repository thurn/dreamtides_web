import { createDreamsign } from "../data/dreamsigns";
import type { DreamsignTemplate } from "../types/content";
import type { Dreamsign } from "../types/journey";
import type { DreamsignId } from "../types/identifiers";

export interface DreamsignPoolDraw {
  offeredIds: DreamsignId[];
  offeredDreamsigns: Dreamsign[];
  remainingDreamsignPool: DreamsignId[];
}

export interface DreamsignPoolState {
  availableIds: DreamsignId[];
  templatesById: Map<DreamsignId, DreamsignTemplate>;
}

function canonicalizeDreamsignPool(
  remainingDreamsignPool: readonly DreamsignId[],
  templates: readonly DreamsignTemplate[],
): DreamsignPoolState {
  const templatesById = new Map(
    templates.map((template) => [template.id, template]),
  );
  const seenIds = new Set<DreamsignId>();
  const availableIds: DreamsignId[] = [];

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

function shufflePick<T>(
  items: readonly T[],
  count: number,
  rng: () => number,
): T[] {
  const pool = [...items];
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
  }
  return pool.slice(0, count);
}

/** Returns the canonical remaining Dreamsign ids backed by known templates. */
export function readDreamsignPool(
  remainingDreamsignPool: readonly DreamsignId[],
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
 */
export function drawDreamsignOptions(
  remainingDreamsignPool: readonly DreamsignId[],
  templates: readonly DreamsignTemplate[],
  count: number,
  regenerationPoolIds?: readonly DreamsignId[],
  rng: () => number = Math.random,
  requiredIds: readonly DreamsignId[] = [],
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

  const workingIdByNormalizedId = new Map(
    workingIds.map((id) => [id.toLocaleLowerCase(), id]),
  );
  const requiredOfferedIds: DreamsignId[] = [];
  for (const requiredId of requiredIds) {
    const availableId = workingIdByNormalizedId.get(
      requiredId.toLocaleLowerCase(),
    );
    if (
      availableId !== undefined &&
      !requiredOfferedIds.includes(availableId) &&
      requiredOfferedIds.length < count
    ) {
      requiredOfferedIds.push(availableId);
    }
  }
  const requiredSet = new Set(requiredOfferedIds);
  const randomOfferedIds = shufflePick(
    workingIds.filter((id) => !requiredSet.has(id)),
    Math.min(
      Math.max(0, count - requiredOfferedIds.length),
      workingIds.length - requiredOfferedIds.length,
    ),
    rng,
  );
  const offeredIds = [...requiredOfferedIds, ...randomOfferedIds];

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
  remainingDreamsignPool: readonly DreamsignId[],
  templates: readonly DreamsignTemplate[],
): DreamsignTemplate[] {
  const { availableIds, templatesById } = readDreamsignPool(
    remainingDreamsignPool,
    templates,
  );

  return availableIds.map((id) => templatesById.get(id)!);
}
