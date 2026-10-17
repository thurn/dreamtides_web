// Adapter for the D97 placeholder overworld: resolves the run's Avatar for
// the pure screen and hosts the deck editor. Whether the editor is open is
// view state; every equip and unequip is recorded as an intent.

import { useCallback, useMemo, useState } from "react";
import { D97_COLLECTION } from "../../../content/d97/collection";
import { D97DeckEditorScreen } from "../../../cumulus/screens/d97/D97DeckEditorScreen";
import { D97OverworldPlaceholderScreen } from "../../../cumulus/screens/d97/D97OverworldPlaceholderScreen";
import type { JourneyContent } from "../../../data/journey-content";
import { logEvent } from "../../../logging";
import type { D97Run } from "../../../rules/d97/d97-state";
import { useActions } from "../../../session/hooks";
import type { D97OwnedCopyId } from "../../../types/identifiers";
import {
  buildD97DeckEditorView,
  cardsByUuid,
} from "./d97-deck-editor-view-model";
import { buildD97OverworldPlaceholderView } from "./d97-overworld-view-model";

function reportFailure(error: unknown): void {
  console.error("D97 deck edit failed", error);
}

/** Live placeholder overworld of a started run. */
export function D97OverworldPlaceholderScreenAdapter({
  run,
  journeyContent,
  initialDeckEditorOpen = false,
}: {
  readonly run: D97Run;
  readonly journeyContent: JourneyContent;
  readonly initialDeckEditorOpen?: boolean;
}) {
  const actions = useActions();
  const [deckEditorOpen, setDeckEditorOpen] = useState(initialDeckEditorOpen);
  const view = useMemo(
    () => buildD97OverworldPlaceholderView(run, journeyContent.avatars),
    [run, journeyContent.avatars],
  );
  const cards = useMemo(
    () => cardsByUuid(journeyContent.cardDatabase),
    [journeyContent.cardDatabase],
  );
  const deckView = useMemo(
    () =>
      buildD97DeckEditorView(
        run.collection,
        cards,
        D97_COLLECTION.minimumDeckSize,
      ),
    [run.collection, cards],
  );
  const openEditor = useCallback(() => {
    logEvent("d97_deck_editor_opened", { runId: run.runId });
    setDeckEditorOpen(true);
  }, [run.runId]);
  const closeEditor = useCallback(() => {
    logEvent("d97_deck_editor_closed", { runId: run.runId });
    setDeckEditorOpen(false);
  }, [run.runId]);
  const equip = useCallback(
    (copyId: D97OwnedCopyId) => {
      void actions.d97EquipCopy(copyId).catch(reportFailure);
    },
    [actions],
  );
  const unequip = useCallback(
    (copyId: D97OwnedCopyId) => {
      void actions.d97UnequipCopy(copyId).catch(reportFailure);
    },
    [actions],
  );
  return (
    <>
      <D97OverworldPlaceholderScreen view={view} onEditDeck={openEditor} />
      <D97DeckEditorScreen
        isOpen={deckEditorOpen}
        view={deckView}
        onEquip={equip}
        onUnequip={unequip}
        onClose={closeEditor}
      />
    </>
  );
}
