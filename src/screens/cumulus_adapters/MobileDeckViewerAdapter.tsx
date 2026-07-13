// Adapter bridging live quest state to the pure mobile deck viewer
// (`src/cumulus/screens/MobileDeckViewer`). Wiring only: it acquires `useQuest()`,
// builds the view-model from the live deck and card database, logs the open,
// and renders nothing while closed. All resolution logic lives in the pure
// builder (`mobile-deck-view-model.ts`); the screen itself stays pure.

import { useEffect, useMemo } from "react";
import { useQuest } from "../../state/quest-context";
import { logEvent } from "../../logging";
import { MobileDeckViewer } from "../../cumulus/screens/MobileDeckViewer";
import { buildMobileDeckView } from "./mobile-deck-view-model";

/** Props for {@link MobileDeckViewerAdapter}. */
interface MobileDeckViewerAdapterProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Live mobile deck viewer: builds the deck view-model from quest state and
 * renders the Cumulus screen while open.
 */
export function MobileDeckViewerAdapter({
  isOpen,
  onClose,
}: MobileDeckViewerAdapterProps) {
  const { state, questContent } = useQuest();

  const view = useMemo(
    () => buildMobileDeckView(state.deck, questContent.cardDatabase),
    [state.deck, questContent.cardDatabase],
  );

  useEffect(() => {
    if (!isOpen) return;
    logEvent("mobile_deck_viewer_opened", { cardCount: view.cards.length });
  }, [isOpen, view.cards.length]);

  if (!isOpen) return null;
  return <MobileDeckViewer view={view} onClose={onClose} />;
}
