// Adapter bridging live quest state to the pure desktop deck viewer
// (`src/tango/screens/DesktopDeckViewer`). Wiring only: it acquires `useQuest()`,
// builds the view-model from the live deck, card database, Dreamcaller, and
// dreamsigns, logs the open, and renders nothing while closed. All resolution
// logic lives in the pure builder (`desktop-deck-view-model.ts`); the screen
// itself stays pure.

import { useEffect, useMemo, useRef } from "react";
import { useQuest } from "../../state/quest-context";
import { logEvent } from "../../logging";
import { DesktopDeckViewer } from "../../tango/screens/DesktopDeckViewer";
import { buildDesktopDeckView } from "./desktop-deck-view-model";

/** Props for {@link DesktopDeckViewerAdapter}. */
interface DesktopDeckViewerAdapterProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Live desktop deck viewer: builds the deck view-model from quest state and
 * renders the Tango screen while open.
 */
export function DesktopDeckViewerAdapter({
  isOpen,
  onClose,
}: DesktopDeckViewerAdapterProps) {
  const { state, questContent } = useQuest();
  const wasOpenRef = useRef(false);

  const view = useMemo(
    () =>
      buildDesktopDeckView(
        state.deck,
        questContent.cardDatabase,
        state.dreamcaller,
        state.dreamsigns,
      ),
    [
      state.deck,
      questContent.cardDatabase,
      state.dreamcaller,
      state.dreamsigns,
    ],
  );
  const cardCount = view.cards.length;
  const dreamsignCount = view.dreamsigns.length;
  const hasDreamcaller = view.dreamcaller !== null;

  useEffect(() => {
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = isOpen;
    if (!isOpen || wasOpen) return;
    logEvent("desktop_deck_viewer_opened", {
      cardCount,
      dreamsignCount,
      hasDreamcaller,
    });
  }, [cardCount, dreamsignCount, hasDreamcaller, isOpen]);

  if (!isOpen) return null;
  return <DesktopDeckViewer view={view} onClose={onClose} />;
}
