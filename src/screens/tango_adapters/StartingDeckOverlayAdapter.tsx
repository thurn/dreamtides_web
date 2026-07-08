// Adapter bridging live quest state to the pure starting-deck overlay
// (`src/tango/screens/StartingDeckOverlay`). Wiring only: it acquires
// `useQuest()`, builds the view-model from the live deck and card database, logs
// the open (once per open session) and the close (with the elapsed duration),
// and renders the Tango overlay. All resolution logic lives in the pure builder
// (`starting-deck-view-model.ts`); the overlay itself stays pure.

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useQuest } from "../../state/quest-context";
import { logEvent } from "../../logging";
import { StartingDeckOverlay } from "../../tango/screens/StartingDeckOverlay";
import { buildStartingDeckView } from "./starting-deck-view-model";

/** Props for {@link StartingDeckOverlayAdapter}. */
interface StartingDeckOverlayAdapterProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Live starting-deck reveal: builds the deck view-model from quest state,
 * instruments open/close, and renders the Tango overlay (which owns the
 * open/close animation, so it is rendered whether or not it is open).
 */
export function StartingDeckOverlayAdapter({
  isOpen,
  onClose,
}: StartingDeckOverlayAdapterProps) {
  const { state, questContent } = useQuest();
  const openTimestampRef = useRef(0);
  const wasOpenRef = useRef(false);

  const view = useMemo(
    () => buildStartingDeckView(state.deck, questContent.cardDatabase),
    [state.deck, questContent.cardDatabase],
  );
  const cardCount = view.cards.length;

  useEffect(() => {
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = isOpen;
    if (!isOpen || wasOpen) return;
    openTimestampRef.current = Date.now();
    logEvent("starting_deck_modal_opened", { cardCount });
  }, [cardCount, isOpen]);

  const handleClose = useCallback(() => {
    logEvent("starting_deck_modal_closed", {
      durationMs: Date.now() - openTimestampRef.current,
    });
    onClose();
  }, [onClose]);

  return (
    <StartingDeckOverlay isOpen={isOpen} view={view} onClose={handleClose} />
  );
}
