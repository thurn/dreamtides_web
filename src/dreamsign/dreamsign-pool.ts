import { createDreamsign } from "../data/dreamsigns";
import type { DreamsignTemplate } from "../types/content";
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
 */
export function drawDreamsignOptions(
  remainingDreamsignPool: readonly string[],
  templates: readonly DreamsignTemplate[],
  count: number,
  regenerationPoolIds?: readonly string[],
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

  const offeredIds = shufflePick(
    workingIds,
    Math.min(count, workingIds.length),
  );

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
