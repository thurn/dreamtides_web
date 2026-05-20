import { useCallback, useEffect, useMemo, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { CardData } from "../types/cards";
import type { DeckEntry } from "../types/quest";
import { useQuest } from "../state/quest-context";
import { CardDisplay } from "./CardDisplay";
import { applyDeckEntryCardModification } from "../card-type-change";
import { logEvent } from "../logging";

/** Props for the StartingDeckModal component. */
interface StartingDeckModalProps {
  isOpen: boolean;
  onClose: () => void;
  cardDatabase: Map<number, CardData>;
}

/** A deck entry paired with its resolved card data. */
interface ResolvedEntry {
  entry: DeckEntry;
  card: CardData;
}

/**
 * Centered modal popup that previews the player's starting deck the first
 * time they enter the dreamscape after picking a Dreamcaller. The modal sits
 * on top of the live dreamscape so the player can see where they are headed,
 * and is dismissed only via the red close button in the top-right corner
 * (Escape and backdrop click are accepted as additional dismissals). The
 * content is intentionally minimal: just the cards. No filtering, sorting,
 * card counts, summaries, or "Continue" button.
 */
export function StartingDeckModal({
  isOpen,
  onClose,
  cardDatabase,
}: StartingDeckModalProps) {
  const { state } = useQuest();
  const openTimestampRef = useRef<number>(0);
  const prevOpenRef = useRef(false);

  useEffect(() => {
    if (isOpen && !prevOpenRef.current) {
      openTimestampRef.current = Date.now();
      logEvent("starting_deck_modal_opened", {
        cardCount: state.deck.length,
      });
    }
    prevOpenRef.current = isOpen;
  }, [isOpen, state.deck.length]);

  const handleClose = useCallback(() => {
    const duration = Date.now() - openTimestampRef.current;
    logEvent("starting_deck_modal_closed", { durationMs: duration });
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return undefined;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        handleClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, handleClose]);

  // Preserve acquisition order: the starting deck is short enough that no
  // sorting controls are needed, and acquisition order matches the order the
  // player will see the cards in normal deck inspection.
  const resolvedEntries = useMemo<ResolvedEntry[]>(() => {
    return state.deck
      .map((entry) => {
        const card = cardDatabase.get(entry.cardNumber);
        if (!card) return null;
        return {
          entry,
          card: applyDeckEntryCardModification(card, {
            typeChange: entry.typeChange,
            keywords: entry.keywordModification,
          }),
        };
      })
      .filter((e): e is ResolvedEntry => e !== null);
  }, [state.deck, cardDatabase]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="starting-deck-modal-backdrop"
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ backgroundColor: "transparent" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={handleClose}
          data-testid="starting-deck-modal-backdrop"
        >
          <motion.div
            key="starting-deck-modal-content"
            // Cap at roughly half the viewport width on desktop, fall back to
            // most of the viewport on narrow displays so the cards remain
            // legible.
            className="relative flex w-full max-w-[min(640px,50vw)] flex-col overflow-hidden rounded-2xl"
            style={{
              maxHeight: "min(80vh, 720px)",
              background:
                "linear-gradient(180deg, rgba(20, 12, 32, 0.98) 0%, rgba(10, 6, 18, 0.98) 100%)",
              border: "1px solid rgba(124, 58, 237, 0.45)",
              boxShadow:
                "0 24px 60px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(124, 58, 237, 0.18)",
            }}
            initial={{ scale: 0.92, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 12 }}
            transition={{ duration: 0.25 }}
            onClick={(e) => {
              e.stopPropagation();
            }}
            data-testid="starting-deck-modal"
          >
            {/* Header */}
            <div
              className="flex items-start justify-between gap-3 px-5 py-4"
              style={{
                borderBottom: "1px solid rgba(124, 58, 237, 0.25)",
              }}
            >
              <div>
                <h2
                  className="text-xl font-bold leading-tight md:text-2xl"
                  style={{ color: "#c4b5fd" }}
                >
                  Starting Deck
                </h2>
                <p
                  className="mt-1 text-sm leading-relaxed"
                  style={{ color: "#e2e8f0" }}
                >
                  These are the cards you begin the quest with.
                </p>
              </div>
              <button
                type="button"
                onClick={handleClose}
                aria-label="Close starting deck"
                data-testid="starting-deck-modal-close"
                className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-base font-bold text-white transition-colors hover:bg-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                style={{
                  background: "#dc2626",
                  border: "1px solid #f87171",
                  boxShadow: "0 0 12px rgba(220, 38, 38, 0.45)",
                }}
              >
                {"✕"}
              </button>
            </div>

            {/* Scrollable card list */}
            <div
              className="min-h-0 flex-1 overflow-y-auto px-5 py-4"
              data-testid="starting-deck-modal-scroll"
            >
              {resolvedEntries.length === 0 ? (
                <div className="flex h-full items-center justify-center">
                  <p className="text-sm opacity-40">
                    No cards in starting deck.
                  </p>
                </div>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(auto-fill, minmax(140px, 1fr))",
                    gap: "0.75rem",
                  }}
                >
                  {resolvedEntries.map((resolved) => (
                    <div
                      key={resolved.entry.entryId}
                      data-testid={`starting-deck-modal-card-${resolved.entry.entryId}`}
                    >
                      <CardDisplay card={resolved.card} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
