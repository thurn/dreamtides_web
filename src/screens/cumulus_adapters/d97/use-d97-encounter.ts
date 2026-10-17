// The overworld's challenger and guardian interactions: talking to an
// unbeaten opponent opens its preview (its first preview records the
// encounter), Fight starts the battle (or opens the deck editor when the
// active deck is below its minimum) and Not now closes the preview. Which
// preview is open is view state; every choice is an intent.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { D97_COLLECTION } from "../../../content/d97/collection";
import type { D97EncounterPreviewView } from "../../../cumulus/screens/d97/D97EncounterPreview";
import { deckSize } from "../../../d97/collection/collection";
import type { CompiledAnchor } from "../../../d97/map/compiled";
import type { InteractionRegistry } from "../../../d97/overworld/interactions";
import { logEvent } from "../../../logging";
import type { D97Run } from "../../../rules/d97/d97-state";
import type { GameActions } from "../../../session/actions";
import type { CardId } from "../../../types/card-identity";
import type { CardData } from "../../../types/cards";
import type { AvatarContent } from "../../../types/content";
import type { DreamAnchorId } from "../../../types/identifiers";
import { buildD97EncounterPreviewView } from "./d97-encounter-preview-view-model";

function reportFailure(error: unknown): void {
  console.error("D97 encounter intent failed", error);
}

export function useD97Encounter(args: {
  readonly run: D97Run;
  readonly registry: InteractionRegistry;
  readonly actions: GameActions;
  readonly avatars: readonly AvatarContent[];
  readonly cardsById: ReadonlyMap<CardId, CardData>;
  /** Opens the deck editor when Fight finds the deck too small. */
  readonly openDeckEditor: () => void;
}): {
  readonly preview: D97EncounterPreviewView | null;
  /** Whether a preview is open (it may still be waiting for its first record). */
  readonly open: boolean;
  readonly fight: () => void;
  readonly notNow: () => void;
  /** Open `anchorId`'s preview, as interacting with it would (a dialogue's challenge). */
  readonly challenge: (anchorId: DreamAnchorId) => void;
} {
  const { run, registry, actions, avatars, cardsById, openDeckEditor } = args;
  const [anchorId, setAnchorId] = useState<DreamAnchorId | null>(null);
  const runRef = useRef(run);
  runRef.current = run;

  const challenge = useCallback(
    (id: DreamAnchorId) => {
      const encounter = runRef.current.encounters[id];
      if (encounter?.beaten === true) return;
      logEvent("d97_encounter_opened", { runId: runRef.current.runId, anchorId: id, firstPreview: encounter === undefined });
      if (encounter === undefined) void actions.d97PreviewEncounter(id).catch(reportFailure);
      setAnchorId(id);
    },
    [actions],
  );

  useEffect(() => {
    const open = (anchor: CompiledAnchor) => challenge(anchor.id);
    const removals = [registry.register("challenger", open), registry.register("guardian", open)];
    return () => removals.forEach((remove) => remove());
  }, [challenge, registry]);

  const encounter = anchorId === null ? undefined : run.encounters[anchorId];
  const preview = useMemo(
    () => (encounter === undefined ? null : buildD97EncounterPreviewView(run, encounter, avatars, cardsById)),
    [avatars, cardsById, encounter, run],
  );

  const fight = useCallback(() => {
    if (anchorId === null) return;
    setAnchorId(null);
    if (deckSize(runRef.current.collection) < D97_COLLECTION.minimumDeckSize) {
      logEvent("d97_encounter_deck_too_small", { runId: runRef.current.runId, anchorId });
      openDeckEditor();
      return;
    }
    void actions.d97BeginBattle(anchorId).catch(reportFailure);
  }, [actions, anchorId, openDeckEditor]);

  const notNow = useCallback(() => {
    if (anchorId === null) return;
    setAnchorId(null);
    void actions.d97DeclineEncounter(anchorId).catch(reportFailure);
  }, [actions, anchorId]);

  return { preview, open: anchorId !== null, fight, notNow, challenge };
}
