// D97DeckEditorScreen — the Dreamtides 97 deck editor: one CardBrowserPanel
// over the run's collection, switching between the active deck and the
// reserve. Pressing a deck card unequips it into the reserve; pressing a
// reserve card equips it. At the minimum deck size the deck's cards are
// disabled, so the deck can never drop below it. On phones the cards sit in
// two readable columns, and a press and hold reveals a card's full text
// without moving it.
// PURE: it renders from a view model and reports each move by owned-copy id;
// the adapter records the move as an intent. Which half is shown is local
// view state.

import { useEffect, useState, type ReactElement } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CardBrowserPanel } from "../../components/card/CardBrowserPanel";
import type { CardGalleryCardView } from "../../components/card/card-gallery-surface";
import { token } from "../../primitives/tokens";
import { useIsDesktop } from "../../primitives/use-is-desktop";
import type { D97OwnedCopyId } from "../../../types/identifiers";

/** One owned copy, resolved for display. */
export type D97DeckEditorCardView = CardGalleryCardView<D97OwnedCopyId>;

export interface D97DeckEditorView {
  /** Active-deck copies in acquisition order. */
  readonly deck: readonly D97DeckEditorCardView[];
  /** Reserve copies in acquisition order. */
  readonly reserve: readonly D97DeckEditorCardView[];
  /** Copies in the active deck, resolvable or not. */
  readonly deckCount: number;
  /** Copies in the reserve, resolvable or not. */
  readonly reserveCount: number;
  /** The fewest copies the deck may hold. */
  readonly minimumDeckSize: number;
  /** Whether a deck copy may move to the reserve. */
  readonly canUnequip: boolean;
}

export interface D97DeckEditorScreenProps {
  /** Whether the editor is mounted. */
  readonly isOpen: boolean;
  readonly view: D97DeckEditorView;
  /** Move a reserve copy into the deck. */
  readonly onEquip: (copyId: D97OwnedCopyId) => void;
  /** Move a deck copy into the reserve. */
  readonly onUnequip: (copyId: D97OwnedCopyId) => void;
  /** Dismiss the editor. */
  readonly onClose: () => void;
}

type D97DeckEditorZone = "deck" | "reserve";

/** How a touch player reads a card before moving it. */
const READ_HINT = "Press and hold a card to read it.";

/** The editor's widest desktop measure. */
const EDITOR_MAX_WIDTH_PX = 1180;

function isZone(value: string): value is D97DeckEditorZone {
  return value === "deck" || value === "reserve";
}

/** The D97 deck editor overlay. Closed by Done or Escape. */
export function D97DeckEditorScreen({
  isOpen,
  view,
  onEquip,
  onUnequip,
  onClose,
}: D97DeckEditorScreenProps): ReactElement {
  const isDesktop = useIsDesktop();
  const [zone, setZone] = useState<D97DeckEditorZone>("deck");

  useEffect(() => {
    if (!isOpen) return undefined;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  const cards = zone === "deck" ? view.deck : view.reserve;
  const shown =
    zone === "deck" && !view.canUnequip
      ? cards.map((card) => ({ ...card, disabled: true }))
      : cards;
  const subtitle =
    zone === "deck"
      ? view.canUnequip
        ? `Tap a card to move it to your reserve. Your deck needs at least ${String(view.minimumDeckSize)} cards.`
        : `Your deck is at its minimum of ${String(view.minimumDeckSize)} cards.`
      : "Tap a card to add it to your deck.";
  // Touch screens have no hover: tell the player how to read a card first.
  const subtitleWithHint = isDesktop ? subtitle : `${subtitle} ${READ_HINT}`;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="d97-deck-editor"
          role="dialog"
          aria-modal="true"
          aria-label="Edit Deck"
          className="cumulus"
          data-d97-deck-editor=""
          data-d97-deck-zone={zone}
          data-d97-deck-count={view.deckCount}
          data-d97-reserve-count={view.reserveCount}
          data-d97-deck-minimum={view.minimumDeckSize}
          data-d97-can-unequip={view.canUnequip ? "true" : "false"}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={{
            position: "fixed",
            inset: 0,
            width: isDesktop ? undefined : "100dvw",
            height: isDesktop ? undefined : "100dvh",
            zIndex: token("--layer-app-overlay"),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: isDesktop ? token("--space-2xl") : 0,
          }}
        >
          <div
            style={{
              position: "relative",
              zIndex: 1,
              width: isDesktop ? `min(100%, ${String(EDITOR_MAX_WIDTH_PX)}px)` : "100%",
              height: isDesktop ? undefined : "100%",
              maxHeight: isDesktop
                ? `calc(100vh - ${token("--space-2xl")} - ${token("--space-2xl")})`
                : undefined,
              minHeight: 0,
              display: "flex",
              justifyContent: "center",
            }}
          >
            <CardBrowserPanel<D97OwnedCopyId>
              title="Edit Deck"
              subtitle={subtitleWithHint}
              rightAccessory={{
                kind: "glassButton",
                button: {
                  label: "Done",
                  variant: "accent",
                  onPress: onClose,
                  testId: "d97-deck-editor-done",
                },
              }}
              toolbar={{
                segmented: {
                  options: [
                    { value: "deck", label: `Deck (${String(view.deckCount)})` },
                    {
                      value: "reserve",
                      label: `Reserve (${String(view.reserveCount)})`,
                    },
                  ],
                  value: zone,
                  onChange: (value) => {
                    if (isZone(value)) setZone(value);
                  },
                },
              }}
              cards={shown}
              emptyLabel={
                zone === "deck"
                  ? "Your deck is empty."
                  : "Your reserve is empty. New cards arrive here."
              }
              presentation="overlay"
              density="readable"
              onCardPress={zone === "deck" ? onUnequip : onEquip}
              testId="d97-deck-editor-panel"
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
