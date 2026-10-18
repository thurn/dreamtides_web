// The open encounter preview's view: the encounter recorded at the preview's
// anchor (null until its first record folds), its opponent named by their
// dialogue's speaker. Opening, Fight and Not now are interactions
// (./use-d97-interactions.ts).

import { useMemo } from "react";
import type { D97DialogueModule } from "../../../content/d97/dialogue/schema";
import type { D97EncounterPreviewView } from "../../../cumulus/screens/d97/D97EncounterPreview";
import type { OverworldOccupants } from "../../../d97/overworld/occupants";
import type { D97Run } from "../../../rules/d97/d97-state";
import type { CardId } from "../../../types/card-identity";
import type { CardData } from "../../../types/cards";
import type { AvatarContent } from "../../../types/content";
import type { D97DialogueId, DreamAnchorId } from "../../../types/identifiers";
import { buildD97EncounterPreviewView } from "./d97-encounter-preview-view-model";

export function useD97EncounterPreview(args: {
  readonly run: D97Run;
  /** The open preview's anchor, or null with no preview open. */
  readonly anchorId: DreamAnchorId | null;
  readonly avatars: readonly AvatarContent[];
  readonly cardsById: ReadonlyMap<CardId, CardData>;
  /** Who stands at each anchor, with the dialogue they speak. */
  readonly occupants: OverworldOccupants;
  /** The dialogue catalog, which names the residents who speak. */
  readonly dialogues: ReadonlyMap<D97DialogueId, D97DialogueModule>;
}): D97EncounterPreviewView | null {
  const { run, anchorId, avatars, cardsById, occupants, dialogues } = args;
  const encounter = anchorId === null ? undefined : run.encounters[anchorId];
  const dialogueId = anchorId === null ? null : (occupants.get(anchorId)?.dialogue ?? null);
  const speakerName = dialogueId === null ? null : (dialogues.get(dialogueId)?.speaker.name ?? null);
  return useMemo(
    () => (encounter === undefined ? null : buildD97EncounterPreviewView(run.collection, encounter, avatars, cardsById, speakerName)),
    [avatars, cardsById, encounter, run.collection, speakerName],
  );
}
