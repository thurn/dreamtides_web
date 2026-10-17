// The overworld's challenger and guardian interactions, routed by
// ../../../d97/overworld/encounter-routing.ts: an opponent with a dialogue
// speaks first (its challenge choice calls `challenge`), one without opens its
// preview at once while unbeaten. A preview's first opening records the
// encounter, Fight starts the battle (or opens the deck editor when the
// active deck is below its minimum) and Not now closes the preview. Which
// preview is open is view state; every choice is an intent.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { D97_COLLECTION } from "../../../content/d97/collection";
import type { D97EncounterPreviewView } from "../../../cumulus/screens/d97/D97EncounterPreview";
import { deckSize } from "../../../d97/collection/collection";
import type { CompiledAnchor } from "../../../d97/map/compiled";
import { routeBattleResident, routeChallenge } from "../../../d97/overworld/encounter-routing";
import type { InteractionRegistry } from "../../../d97/overworld/interactions";
import type { OverworldOccupants } from "../../../d97/overworld/occupants";
import { logEvent } from "../../../logging";
import type { D97Run } from "../../../rules/d97/d97-state";
import type { GameActions } from "../../../session/actions";
import type { CardId } from "../../../types/card-identity";
import type { CardData } from "../../../types/cards";
import type { AvatarContent } from "../../../types/content";
import type { DreamAnchorId } from "../../../types/identifiers";
import { buildD97EncounterPreviewView } from "./d97-encounter-preview-view-model";
import type { D97DialogueModule } from "../../../content/d97/dialogue/schema";
import type { D97DialogueId } from "../../../types/identifiers";

function reportFailure(error: unknown): void {
  console.error("D97 encounter intent failed", error);
}

export function useD97Encounter(args: {
  readonly run: D97Run;
  readonly registry: InteractionRegistry;
  readonly actions: GameActions;
  readonly avatars: readonly AvatarContent[];
  readonly cardsById: ReadonlyMap<CardId, CardData>;
  /** Who stands at each anchor, with the dialogue they speak. */
  readonly occupants: OverworldOccupants;
  /** The dialogue catalog, which names the residents who speak. */
  readonly dialogues: ReadonlyMap<D97DialogueId, D97DialogueModule>;
  /** Opens the conversation with the resident at an anchor. */
  readonly converse: (anchorId: DreamAnchorId) => void;
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
  const { run, registry, actions, avatars, cardsById, occupants, dialogues, converse, openDeckEditor } = args;
  const [anchorId, setAnchorId] = useState<DreamAnchorId | null>(null);
  const runRef = useRef(run);
  runRef.current = run;

  const challenge = useCallback(
    (id: DreamAnchorId) => {
      const encounter = runRef.current.encounters[id];
      if (routeChallenge({ beaten: encounter?.beaten === true }) === "none") return;
      logEvent("d97_encounter_opened", { runId: runRef.current.runId, anchorId: id, firstPreview: encounter === undefined });
      if (encounter === undefined) void actions.d97PreviewEncounter(id).catch(reportFailure);
      setAnchorId(id);
    },
    [actions],
  );

  useEffect(() => {
    const open = (anchor: CompiledAnchor) => {
      const route = routeBattleResident({
        hasDialogue: occupants.get(anchor.id)?.dialogue != null,
        beaten: runRef.current.encounters[anchor.id]?.beaten === true,
      });
      logEvent("d97_battle_resident_routed", { runId: runRef.current.runId, anchorId: anchor.id, kind: anchor.kind, route });
      if (route === "conversation") converse(anchor.id);
      else if (route === "preview") challenge(anchor.id);
    };
    const removals = [registry.register("challenger", open), registry.register("guardian", open)];
    return () => removals.forEach((remove) => remove());
  }, [challenge, converse, occupants, registry]);

  const encounter = anchorId === null ? undefined : run.encounters[anchorId];
  const dialogueId = anchorId === null ? null : (occupants.get(anchorId)?.dialogue ?? null);
  const speakerName = dialogueId === null ? null : (dialogues.get(dialogueId)?.speaker.name ?? null);
  const preview = useMemo(
    () => (encounter === undefined ? null : buildD97EncounterPreviewView(run.collection, encounter, avatars, cardsById, speakerName)),
    [avatars, cardsById, encounter, run.collection, speakerName],
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
