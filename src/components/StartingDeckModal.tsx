import { useCallback, useEffect, useMemo, useRef } from "react";
import type { CSSProperties } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { CardData } from "../types/cards";
import type { DeckEntry } from "../types/quest";
import { useQuest } from "../state/quest-context";
import { CardDisplay } from "./CardDisplay";
import { HoverZoomCard } from "../tango/components/card/HoverZoomCard";
import { Pressable } from "../tango/primitives/Pressable";
import { GlowIcon } from "../tango/components/controls/GlowIcon";
import { GLYPHS } from "../tango/primitives/glyph";
import { glassSurfaceStyle } from "../tango/components/controls/glass-surface";
import { glassIconButtonChrome } from "../tango/components/controls/control-treatment";
import { token } from "../tango/primitives/tokens";
import { useIsDesktop } from "../tango/screens/use-is-desktop";
import {
  applyCardStatOverride,
  applyDeckEntryCardModification,
} from "../card-type-change";
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

/** Diameter of the corner close disc; a comfortable touch target. */
const CLOSE_BUTTON_PX = 44;

/**
 * Popup that previews the player's starting deck the first time the player
 * enters the dreamscape after picking a Dreamcaller. It wears the deck viewer's
 * liquid-glass surface (a blur+saturate backdrop under a translucent chrome
 * fill), so the dreamscape behind refracts through it, and carries a matching
 * glass close disc in its header. It adapts to the platform the way the deck
 * viewer does: a full-bleed frosted overlay on mobile, and a centered, bounded
 * glass dialog on desktop with the dreamscape visible around it. The content is
 * intentionally minimal — a title, one line of intro copy, and the cards; there
 * are no filter, sort, or "Continue" controls. Dismissal is the close disc or
 * Escape.
 */
export function StartingDeckModal({
  isOpen,
  onClose,
  cardDatabase,
}: StartingDeckModalProps) {
  const { state } = useQuest();
  const isDesktop = useIsDesktop();
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
          card: applyCardStatOverride(
            applyDeckEntryCardModification(card, {
              typeChange: entry.typeChange,
              keywords: entry.keywordModification,
            }),
            entry.statOverride,
          ),
        };
      })
      .filter((e): e is ResolvedEntry => e !== null);
  }, [state.deck, cardDatabase]);

  const glass = glassSurfaceStyle();

  // Desktop is a bounded, centered dialog; mobile is a full-bleed overlay.
  const panelStyle: CSSProperties = isDesktop
    ? {
        ...glass,
        position: "relative",
        width: "100%",
        // Wide enough to lay the deck out in a couple of rows so the dialog
        // stays short; capped at 85vh (plus the backdrop's own padding) so it
        // never runs to the viewport edge.
        maxWidth: "min(900px, 90vw)",
        maxHeight: "85vh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }
    : {
        // Full-bleed frosted glass: keep the fill + blur, drop the card's rim,
        // radius, and shadow so it reads edge to edge.
        ...glass,
        border: "none",
        borderRadius: 0,
        boxShadow: "none",
        position: "relative",
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      };

  const headerStyle: CSSProperties = {
    flexShrink: 0,
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: token("--space-4"),
    borderBottom: `1px solid ${token("--border-strong")}`,
    ...(isDesktop
      ? { padding: token("--space-6") }
      : {
          // Clear the device screen cut-out on a full-bleed overlay.
          paddingTop: `max(env(safe-area-inset-top, ${token(
            "--gutter",
          )}), ${token("--gutter")})`,
          paddingRight: token("--gutter"),
          paddingLeft: token("--gutter"),
          paddingBottom: token("--space-4"),
        }),
  };

  // Desktop hugs its content (whitespace around a short deck); mobile fills the
  // screen and scrolls internally.
  const scrollFlex = isDesktop ? "0 1 auto" : "1 1 auto";

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="starting-deck-modal-backdrop"
          className="tango"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            // Breathing room around the desktop dialog; edge-to-edge on mobile.
            padding: isDesktop ? token("--space-7") : 0,
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          data-testid="starting-deck-modal-backdrop"
        >
          <motion.div
            key="starting-deck-modal-content"
            style={panelStyle}
            {...(isDesktop
              ? {
                  initial: { scale: 0.96, opacity: 0, y: 10 },
                  animate: { scale: 1, opacity: 1, y: 0 },
                  exit: { scale: 0.96, opacity: 0, y: 10 },
                  transition: { duration: 0.22 },
                }
              : { initial: false })}
            data-testid="starting-deck-modal"
          >
            {/* Header: the title and intro copy with a glass close disc on the
                trailing edge, closed by a neutral hairline. */}
            <div style={headerStyle}>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: token("--space-1"),
                }}
              >
                <h2
                  style={{
                    margin: 0,
                    font: token("--t-title-sm"),
                    color: token("--text-primary"),
                  }}
                >
                  Starting Deck
                </h2>
                <p
                  style={{
                    margin: 0,
                    font: token("--t-body"),
                    // Near-white, untinted, for legibility over the glass.
                    color: token("--text-primary"),
                  }}
                >
                  These are the cards you begin the quest with.
                </p>
              </div>
              <Pressable
                as="button"
                aria-label="Close starting deck"
                onClick={handleClose}
                data-testid="starting-deck-modal-close"
                style={{
                  flexShrink: 0,
                  width: CLOSE_BUTTON_PX,
                  height: CLOSE_BUTTON_PX,
                  color: token("--text-primary"),
                  display: "grid",
                  placeItems: "center",
                  fontSize: 22,
                  cursor: "pointer",
                  ...glassIconButtonChrome(),
                }}
              >
                <GlowIcon
                  iconClass={GLYPHS.close}
                  color="text-primary"
                  size="1em"
                />
              </Pressable>
            </div>

            {/* Scrollable card grid. */}
            <div
              className="overflow-y-auto"
              style={{
                flex: scrollFlex,
                minHeight: 0,
                WebkitOverflowScrolling: "touch",
                padding: token("--space-5"),
              }}
              data-testid="starting-deck-modal-scroll"
            >
              {resolvedEntries.length === 0 ? (
                <div className="flex h-full items-center justify-center">
                  <p
                    style={{
                      font: token("--t-body"),
                      color: token("--text-primary"),
                    }}
                  >
                    No cards in starting deck.
                  </p>
                </div>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(auto-fill, minmax(140px, 1fr))",
                    gap: token("--space-4"),
                  }}
                >
                  {resolvedEntries.map((resolved) => (
                    <HoverZoomCard
                      key={resolved.entry.entryId}
                      logSurface="starting_deck"
                      glossaryText={resolved.card.renderedText}
                      testId={`starting-deck-modal-card-${resolved.entry.entryId}`}
                    >
                      <CardDisplay card={resolved.card} suppressHoverHelp />
                    </HoverZoomCard>
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
