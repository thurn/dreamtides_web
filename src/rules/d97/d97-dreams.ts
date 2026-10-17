// The dreams the D97 rules know: each registered dream with its own
// challenger and speaker maps (`registerDream`), and `runDreamAnchor`, the one
// way a rule reads an anchor. Every shop, travel, encounter and
// dialogue-effect case resolves its payload's anchor in the run's own dream,
// so an intent at another registered dream's anchor bounces.
//
// This module obeys the src/rules/ lint rails: no React, no live clock or rng.

import { dreamChallengers } from "../../content/d97/challengers";
import type { D97DialogueModule } from "../../content/d97/dialogue/schema";
import type { D97DreamDefinition } from "../../content/d97/dreams/schema";
import type { D97DialogueId, DreamAnchorId } from "../../types/identifiers";
import type { D97ContentProvider, D97RegisteredAnchor, D97RegisteredDream } from "./d97-content";
import type { D97Run } from "./d97-state";

/**
 * Register `dream` over its map's `anchors`: its challengers by anchor, and
 * each speaking resident's dialogue among `dialogues` by anchor (a resident
 * whose dialogue is unregistered does not speak).
 */
export function registerDream(
  dream: D97DreamDefinition,
  anchors: readonly D97RegisteredAnchor[],
  dialogues: ReadonlyMap<D97DialogueId, D97DialogueModule>,
): D97RegisteredDream {
  const speakerDialogues = new Map<DreamAnchorId, D97DialogueModule>();
  for (const resident of dream.residents) {
    const module = resident.dialogueId === undefined ? undefined : dialogues.get(resident.dialogueId);
    if (module !== undefined) speakerDialogues.set(resident.anchorId, module);
  }
  const { topology } = dream;
  const anchorIds = new Set<DreamAnchorId>([
    ...anchors.map((anchor) => anchor.id),
    topology.waypointAnchorId,
    topology.arrivalDoorAnchorId,
    topology.exitDoorAnchorId,
    topology.exitGuardianAnchorId,
    topology.shopAnchorId,
    ...dream.residents.map((resident) => resident.anchorId),
  ]);
  return { definition: dream, anchors, anchorIds, challengers: dreamChallengers(dream), speakerDialogues };
}

/**
 * The run's registered dream when it declares `anchorId`, or null: for an
 * unregistered dream, a missing anchor, or an anchor of any other dream.
 */
export function runDreamAnchor(
  run: D97Run,
  content: D97ContentProvider,
  anchorId: DreamAnchorId | null,
): D97RegisteredDream | null {
  const dream = content.dreams.get(run.dreamId);
  return anchorId !== null && dream !== undefined && dream.anchorIds.has(anchorId) ? dream : null;
}
