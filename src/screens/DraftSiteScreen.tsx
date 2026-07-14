import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useQuest } from "../state/quest-context";
import { CardDisplay } from "../components/CardDisplay";
import { CardOverlay } from "../components/CardOverlay";
import { CompactGameCardRow } from "../cumulus/components/card/CompactGameCardRow";
import {
  OFFERING_ACCENT,
  OfferingAcceptButton,
  OfferingScreenHeader,
} from "../components/OfferingScreen";
import { buildCardSourceDebugState } from "../debug/card-source-debug";
import {
  countRemainingCards,
  SITE_PICKS,
} from "../draft/draft-engine";
import type { DraftState } from "../types/draft";
import type { CardData } from "../types/cards";
import { CARD_ASPECT_RATIO } from "../cumulus/components/card/card-aspect";
import { DRAFT_OFFER_CARD_WIDTH } from "../components/card-size";
import { logEvent } from "../logging";
import { useCardSourceDebugPublication } from "../state/use-card-source-debug-publication";


/** Delay in ms before showing the next pack after a pick. */
const NEXT_PACK_DELAY = 500;
const DECK_FLY_DURATION = 0.45;
const DECK_HIGHLIGHT_DURATION = 900;

/** Animation phases during a pick. */
type PickPhase = "idle" | "animating" | "waiting";

const DRAFT_OFFER_CARD_STYLE = {
  "--draft-offer-card-width": DRAFT_OFFER_CARD_WIDTH,
  aspectRatio: CARD_ASPECT_RATIO,
} as CSSProperties & Record<"--draft-offer-card-width", string>;

interface RectSnapshot {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface FlyingCardAnimation {
  key: string;
  card: CardData;
  sourceRect: RectSnapshot;
  targetRect: RectSnapshot;
}

function snapshotRect(rect: DOMRect): RectSnapshot {
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

function sortCardsForDisplay(cards: CardData[]): CardData[] {
  return [...cards].sort((a, b) => {
    const energyCostDelta = (a.energyCost ?? 0) - (b.energyCost ?? 0);
    if (energyCostDelta !== 0) {
      return energyCostDelta;
    }

    return a.name.localeCompare(b.name);
  });
}

/** Summary screen shown after all 5 picks are complete. */
function DraftSummary({
  draftedCardNumbers,
  cardDatabase,
  onContinue,
}: {
  draftedCardNumbers: number[];
  cardDatabase: Map<number, CardData>;
  onContinue: () => void;
}) {
  const draftedCards = draftedCardNumbers
    .map((num) => cardDatabase.get(num))
    .filter((c): c is CardData => c !== undefined);

  return (
    <motion.div
      className="flex flex-col items-center gap-6 px-4 py-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <OfferingScreenHeader
        title="Draft Complete"
        subtitle={`${String(draftedCards.length)} cards added to your deck`}
      />

      <div
        className="draft-summary-grid grid w-full max-w-4xl gap-3 md:gap-4"
        style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))", alignItems: "start" }}
      >
        {draftedCards.map((card, i) => (
          <motion.div
            key={`summary-${String(i)}-${String(card.cardNumber)}`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: i * 0.1 }}
          >
            <CardDisplay card={card} />
          </motion.div>
        ))}
      </div>

      <OfferingAcceptButton
        className="mt-4 px-6 py-3 text-base"
        onClick={onContinue}
        testId="draft-summary-continue"
      >
        Continue
      </OfferingAcceptButton>
    </motion.div>
  );
}

/**
 * Hearthstone-style deck row. The row is a horizontal rectangle that uses
 * the card's art as its background — cropped to a wide strip that focuses on
 * the upper portion of the art (where character faces and event focal points
 * tend to live). Energy cost sits on the left as the shared `<PipBadge>`,
 * the name overlays the art in white with a thick text-shadow so it stays
 * legible across varied art, and duplicate count sits on the right (omitted
 * for singletons to keep the row clean).
 *
 * Designed to be scanned by art rather than read by name — a player who
 * recognizes the art can identify the card without parsing the text.
 */
/** Stable identifier for a deck row — one row per unique card. */
interface DeckRow {
  cardNumber: number;
  card: CardData;
  count: number;
  /**
   * Entry ids of every deck entry that resolves to this row's card, in
   * insertion order. Used by the post-pick highlight to flash the row that
   * received the freshly-added copy.
   */
  entryIds: string[];
}

/** Compact deck sidebar showing all drafted cards sorted by energy cost. */
function DeckSidebar({
  cardDatabase,
  highlightedEntryId,
}: {
  cardDatabase: Map<number, CardData>;
  highlightedEntryId: string | null;
}) {
  const { state } = useQuest();

  const deckRows = useMemo<DeckRow[]>(() => {
    const rowsByCardNumber = new Map<number, DeckRow>();
    for (const entry of state.deck) {
      const card = cardDatabase.get(entry.cardNumber);
      if (!card) {
        continue;
      }
      const existing = rowsByCardNumber.get(entry.cardNumber);
      if (existing) {
        existing.count += 1;
        existing.entryIds.push(entry.entryId);
      } else {
        rowsByCardNumber.set(entry.cardNumber, {
          cardNumber: entry.cardNumber,
          card,
          count: 1,
          entryIds: [entry.entryId],
        });
      }
    }
    return Array.from(rowsByCardNumber.values()).sort((left, right) => {
      const energyCostDelta =
        (left.card.energyCost ?? 0) - (right.card.energyCost ?? 0);
      if (energyCostDelta !== 0) {
        return energyCostDelta;
      }

      return left.card.name.localeCompare(right.card.name);
    });
  }, [state.deck, cardDatabase]);

  if (deckRows.length === 0) {
    return (
      <div className="flex h-full min-h-0 flex-1 items-center justify-center p-4">
        <p className="text-xs opacity-40">No cards drafted yet.</p>
      </div>
    );
  }

  // The rows container is the scroll region. It is given `flex-1 min-h-0` so
  // the sidebar flex-column above hands it exactly the residual height after
  // the header, and `overflow-y-auto` then produces an in-panel scrollbar
  // rather than letting the rows spill past the sidebar. `min-h-0` is
  // required: without it the flex item refuses to shrink below its content
  // height, which is what produces the original bug where the rail clips
  // past the viewport without scrolling.
  return (
    <div
      data-testid="draft-deck-rows"
      className="draft-deck-rail-scroll flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2"
    >
      {deckRows.map(({ cardNumber, card, count, entryIds }) => {
        const isHighlighted = entryIds.includes(highlightedEntryId ?? "");
        // Stable row identity: card number is unique per row. The hover
        // popover is also keyed off the cardNumber so prior tests that
        // inspect "draft-deck-row-<entryId>" continue to find the most
        // recent entry's row via its first entry id (we still expose every
        // entry id as a row attribute for highlight matching).
        const rowTestId = `draft-deck-row-${entryIds[0] ?? String(cardNumber)}`;
        const hoverTestId = `draft-deck-row-hover-card-${entryIds[0] ?? String(cardNumber)}`;

        return (
          <motion.div
            key={cardNumber}
            layout
            animate={
              isHighlighted
                ? {
                    scale: [1, 1.04, 1],
                    boxShadow: [
                      "0 0 0 rgba(249, 115, 22, 0)",
                      "0 0 18px rgba(249, 115, 22, 0.45)",
                      "0 0 0 rgba(249, 115, 22, 0)",
                    ],
                  }
                : {
                    scale: 1,
                    boxShadow: "0 0 0 rgba(249, 115, 22, 0)",
                  }
            }
            transition={{ duration: 0.35 }}
          >
              <CompactGameCardRow card={card} count={String(count)} testId={rowTestId} revealTestId={hoverTestId} entryIds={entryIds.join(",")} />
          </motion.div>
        );
      })}
    </div>
  );
}

/**
 * Chevron toggle that docks at the deck panel edge and folds the drafted-
 * card rail open/closed. The chevron always points toward the side the
 * panel folds into so the affordance honestly previews the result of the
 * click: when expanded it points right (panel will fold away to the right),
 * when collapsed it points left (panel will fold back out to the left).
 */
function DeckSidebarToggle({
  expanded,
  onToggle,
}: {
  expanded: boolean;
  onToggle: () => void;
}) {
  const label = expanded ? "Collapse deck panel" : "Expand deck panel";
  // Chevron arrow: ▶ points right (collapse), ◀ points left (expand).
  const glyph = expanded ? "▶" : "◀";

  return (
    <button
      type="button"
      data-testid="draft-deck-toggle"
      data-expanded={expanded ? "true" : "false"}
      aria-label={label}
      aria-expanded={expanded}
      title={label}
      onClick={onToggle}
      className="group flex h-8 w-7 cursor-pointer items-center justify-center rounded text-base font-bold leading-none transition-colors"
      style={{
        background: "rgba(124, 58, 237, 0.12)",
        border: "1px solid rgba(124, 58, 237, 0.35)",
        color: "#c084fc",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "rgba(124, 58, 237, 0.32)";
        e.currentTarget.style.borderColor = "rgba(168, 85, 247, 0.7)";
        e.currentTarget.style.color = "#e9d5ff";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "rgba(124, 58, 237, 0.12)";
        e.currentTarget.style.borderColor = "rgba(124, 58, 237, 0.35)";
        e.currentTarget.style.color = "#c084fc";
      }}
    >
      <span aria-hidden="true">{glyph}</span>
    </button>
  );
}

/** The draft site screen: 4-card pack display, card picking, and summary. */
export function DraftSiteScreen({ siteId }: { siteId: string }) {
  const { state, mutations, cardDatabase } = useQuest();
  const [pickPhase, setPickPhase] = useState<PickPhase>("idle");
  const [pickedCardNumber, setPickedCardNumber] = useState<number | null>(null);
  const [overlayCard, setOverlayCard] = useState<CardData | null>(null);
  const [showDeckSidebar, setShowDeckSidebar] = useState(true);
  const [highlightedDeckEntryId, setHighlightedDeckEntryId] = useState<string | null>(null);
  const [flyingCard, setFlyingCard] = useState<FlyingCardAnimation | null>(null);
  const pendingPickedCardNumberRef = useRef<number | null>(null);
  const offerCardRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const deckFlightTargetRef = useRef<HTMLDivElement | null>(null);
  const previousDeckEntryIdsRef = useRef(state.deck.map((entry) => entry.entryId));

  // The displayed draft state is the live fold's — the reducer's optimistic
  // echo paints the first offer immediately on entry (see the entry effect
  // below), so there is no local bootstrap slice to fall back to.
  const effectiveDraftState: DraftState | null = state.draftState;

  // Multiplayer snapshots create a fresh state.draftState reference on every
  // RTDB update (the normalizer in room-service rebuilds objects via spread).
  // Derive everything from content-equal scalars so renders triggered by
  // unrelated room writes don't churn local state or AnimatePresence keys.
  const isActiveDraftSite = effectiveDraftState?.activeSiteId === siteId;
  const draftSitePicksCompleted = isActiveDraftSite
    ? effectiveDraftState?.sitePicksCompleted ?? 0
    : 0;
  const draftCurrentOfferKey = isActiveDraftSite
    ? (effectiveDraftState?.currentOffer ?? []).join(",")
    : "";
  // Pool-only stat: total copies left in the run multiset. The deck-fit modes
  // (replay, fresh20) have no multiset, so they report 0; that is safe because
  // their completion is driven by an empty current offer at the site's final
  // pick (see `isComplete` below), not this count.
  const draftRemainingTotal =
    effectiveDraftState && effectiveDraftState.mode === "pool"
      ? countRemainingCards(effectiveDraftState.remainingCopiesByCard)
      : 0;

  const draftedCardNumbers = useMemo(() => {
    if (!isActiveDraftSite || draftSitePicksCompleted === 0) {
      return [];
    }
    return state.deck
      .slice(-draftSitePicksCompleted)
      .map((entry) => entry.cardNumber);
  }, [isActiveDraftSite, draftSitePicksCompleted, state.deck]);

  const currentOfferCards = useMemo(() => {
    if (!isActiveDraftSite || draftCurrentOfferKey === "") {
      return [];
    }
    const offerNumbers = draftCurrentOfferKey
      .split(",")
      .map((num) => Number(num));
    const offerCards = offerNumbers
      .map((num) => cardDatabase.get(num))
      .filter((c): c is CardData => c !== undefined);
    return sortCardsForDisplay(offerCards);
  }, [isActiveDraftSite, draftCurrentOfferKey, cardDatabase]);

  const isComplete =
    isActiveDraftSite
    && draftCurrentOfferKey === ""
    && (draftSitePicksCompleted > 0 || draftRemainingTotal < 4);

  const cardSourceDebugState = useMemo(
    () =>
      isComplete
        ? null
        : buildCardSourceDebugState(
          "Draft Picks",
          "Draft",
          currentOfferCards,
          state.resolvedPackage,
        ),
    [currentOfferCards, isComplete, state.resolvedPackage],
  );

  // Enter this site whenever the displayed draft state has not advanced to
  // `siteId`. The run-scoped event-log key gives every mount and connected
  // client one shared logical entry intent.
  useEffect(() => {
    if (state.draftState?.activeSiteId === siteId) return;
    mutations.enterDraftSite(siteId);
  }, [siteId, state.draftState?.activeSiteId, mutations]);

  useCardSourceDebugPublication(
    mutations.setCardSourceDebug,
    cardSourceDebugState,
    "draft_site_cards_shown",
    "draft_site_cards_hidden",
  );

  useEffect(() => {
    if (flyingCard === null) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setFlyingCard((current) =>
        current?.key === flyingCard.key ? null : current,
      );
    }, Math.round(DECK_FLY_DURATION * 1000));

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [flyingCard]);

  useEffect(() => {
    if (highlightedDeckEntryId === null) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setHighlightedDeckEntryId((current) =>
        current === highlightedDeckEntryId ? null : current,
      );
    }, DECK_HIGHLIGHT_DURATION);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [highlightedDeckEntryId]);

  useEffect(() => {
    const previousDeckEntryIds = previousDeckEntryIdsRef.current;
    const addedEntry = state.deck.find(
      (entry) => !previousDeckEntryIds.includes(entry.entryId),
    );
    previousDeckEntryIdsRef.current = state.deck.map((entry) => entry.entryId);

    const pendingPickedCardNumber = pendingPickedCardNumberRef.current;
    if (
      pendingPickedCardNumber !== null
      && addedEntry !== undefined
      && !showDeckSidebar
    ) {
      pendingPickedCardNumberRef.current = null;
      return;
    }

    if (
      pendingPickedCardNumber === null
      || addedEntry === undefined
      || addedEntry.cardNumber !== pendingPickedCardNumber
      || !showDeckSidebar
    ) {
      return;
    }

    setHighlightedDeckEntryId(addedEntry.entryId);
    pendingPickedCardNumberRef.current = null;
  }, [showDeckSidebar, state.deck]);

  const handleCardPick = useCallback(
    (cardNumber: number) => {
      if (pickPhase !== "idle") return;
      if (state.draftState === null) return;
      const sourceElement = offerCardRefs.current[cardNumber];
      const targetElement = deckFlightTargetRef.current;
      const sourceRect =
        sourceElement === undefined || sourceElement === null
          ? null
          : snapshotRect(sourceElement.getBoundingClientRect());
      const targetRect =
        targetElement === null
          ? null
          : snapshotRect(targetElement.getBoundingClientRect());
      const pickedCard = cardDatabase.get(cardNumber);

      setPickedCardNumber(cardNumber);
      setPickPhase("animating");
      pendingPickedCardNumberRef.current = cardNumber;
      if (
        pickedCard !== undefined
        && sourceRect !== null
        && targetRect !== null
      ) {
        setFlyingCard({
          key: `${String(cardNumber)}-${String(Date.now())}`,
          card: pickedCard,
          sourceRect,
          targetRect,
        });
      }

      // Close overlay if open
      setOverlayCard(null);

      // After animation, process the pick
      setTimeout(() => {
        setPickPhase("waiting");
        mutations.pickDraftCard(siteId, cardNumber);

        setTimeout(() => {
          setPickPhase("idle");
          setPickedCardNumber(null);
        }, NEXT_PACK_DELAY);
      }, 300);
    },
    [pickPhase, cardDatabase, mutations, siteId, state.draftState],
  );

  const handleCardInspect = useCallback(
    (card: CardData) => {
      if (pickPhase === "idle") {
        setOverlayCard(card);
      }
    },
    [pickPhase],
  );

  const handleOverlayClose = useCallback(() => {
    setOverlayCard(null);
  }, []);

  const handleContinue = useCallback(() => {
    logEvent("draft_site_completed_ui", {
      siteId,
      cardsDrafted: draftedCardNumbers,
    });

    mutations.completeSite(siteId, "draft_site_completed");
  }, [siteId, draftedCardNumbers, mutations]);

  const pickNumber = draftSitePicksCompleted + 1;

  if (cardDatabase.size === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
        <p className="text-lg opacity-60">
          Card database unavailable. Cannot start draft.
        </p>
        <button
          className="rounded-lg px-6 py-3 font-bold text-white transition-colors"
          style={{
            background: "linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)",
            border: "1px solid rgba(168, 85, 247, 0.5)",
          }}
          onClick={() => {
            mutations.setScreen({ type: "dreamscape" });
          }}
        >
          Return to Dreamscape
        </button>
      </div>
    );
  }

  if (state.draftState === null) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
        <p className="text-lg opacity-60">
          Draft pool unavailable. Cannot start draft.
        </p>
        <button
          className="rounded-lg px-6 py-3 font-bold text-white transition-colors"
          style={{
            background: "linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)",
            border: "1px solid rgba(168, 85, 247, 0.5)",
          }}
          onClick={() => {
            mutations.setScreen({ type: "dreamscape" });
          }}
        >
          Return to Dreamscape
        </button>
      </div>
    );
  }

  if (isComplete) {
    return (
      <DraftSummary
        draftedCardNumbers={draftedCardNumbers}
        cardDatabase={cardDatabase}
        onContinue={handleContinue}
      />
    );
  }

  {/*
    Layout: full viewport minus HUD (48px). Cards use the smaller of the
    available draft-area width and viewport-relative height so the 2x2 grid
    fills the screen without spilling under the deck rail. `overflow: hidden`
    keeps the screen from ever contributing scroll height.
  */}
  return (
    <div
      data-testid="draft-site-screen"
      className="flex overflow-hidden"
      style={{ height: "calc(100vh - 48px)" }}
    >
      {/* Main draft area */}
      <div
        className="flex min-w-0 flex-1 flex-col items-center justify-center overflow-hidden"
        style={{ containerType: "inline-size" }}
      >
        {/* 2x2 card grid, centered */}
        <AnimatePresence mode="wait">
          <motion.div
            key={`offer-${draftCurrentOfferKey}`}
            className="order-2 grid gap-3 md:gap-4"
            style={{
              gridTemplateColumns: "repeat(2, auto)",
              gridTemplateRows: "repeat(2, auto)",
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            {currentOfferCards.map((card) => {
              const isPicked = pickedCardNumber === card.cardNumber;
              const isOther = pickedCardNumber !== null && !isPicked;

              return (
                <motion.div
                  key={`card-${String(card.cardNumber)}`}
                  initial={{ opacity: 0 }}
                  animate={
                    isPicked && pickPhase !== "idle"
                      ? { opacity: 0, scale: 0.9 }
                      : isOther && pickPhase !== "idle"
                        ? { opacity: 0, scale: 0.95 }
                        : { opacity: 1, scale: 1 }
                  }
                  transition={{ duration: 0.3 }}
                >
                  <div
                    ref={(element) => {
                      offerCardRefs.current[card.cardNumber] = element;
                    }}
                    data-testid={`draft-offer-card-wrapper-${String(card.cardNumber)}`}
                    className="draft-offer-card-wrapper relative rounded-lg"
                    style={DRAFT_OFFER_CARD_STYLE}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      handleCardInspect(card);
                    }}
                  >
                    <div className="h-full w-full">
                      <CardDisplay
                        card={card}
                        large
                        onClick={
                          pickPhase === "idle"
                            ? () => {
                                handleCardPick(card.cardNumber);
                              }
                            : undefined
                        }
                      />
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        </AnimatePresence>

        {/* Compact header — uses the shared offering header tokens so it
            stays visually aligned with the dreamsign draft / offering / journey
            chooser surfaces. */}
        <div className="order-1 w-full px-4 py-1 md:px-8">
          <OfferingScreenHeader
            compact
            title="Draft"
            subtitle={`Pick ${String(Math.min(pickNumber, SITE_PICKS))}/${String(SITE_PICKS)}`}
            rightSlot={
              <div className="flex items-center gap-3">
                <div
                  className="h-1.5 w-24 overflow-hidden rounded-full md:w-32"
                  style={{ background: "rgba(124, 58, 237, 0.2)" }}
                >
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: "#f97316" }}
                    initial={false}
                    animate={{
                      width: `${String((draftedCardNumbers.length / SITE_PICKS) * 100)}%`,
                    }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              </div>
            }
          />
        </div>
      </div>

      {/* Deck sidebar */}
      {showDeckSidebar ? (
        <div
          data-testid="draft-deck-sidebar"
          // FIND-01-14 (Stage 4): widen the drafted-card rail so the card
          // name no longer overlaps the right-edge thumb image at 1728x930.
          // The thumb art is masked to 40% of the pill width; giving the
          // pill more horizontal space keeps the name clear of the thumb.
          //
          // The sidebar is a flex column constrained to the parent's
          // `calc(100vh - 48px)` height. The header keeps its intrinsic
          // height; the `DeckSidebar` rows container below claims the
          // remaining height as `flex-1 min-h-0` and becomes the scroll
          // region. That keeps the four draft offers stationary while the
          // player browses a deck that overflows the panel.
          className="flex h-full w-64 shrink-0 flex-col overflow-hidden border-l lg:w-80"
          style={{
            borderColor: "rgba(124, 58, 237, 0.2)",
            background: "rgba(5, 2, 10, 0.6)",
          }}
        >
          <div
            className="flex shrink-0 items-center justify-between gap-2 px-3 py-2"
            style={{ borderBottom: "1px solid rgba(124, 58, 237, 0.15)" }}
          >
            <DeckSidebarToggle
              expanded
              onToggle={() => {
                setShowDeckSidebar(false);
              }}
            />
            <span
              className="text-xs font-bold uppercase tracking-wider"
              style={{ color: OFFERING_ACCENT.primary }}
            >
              Deck ({String(state.deck.length)})
            </span>
            <div
              ref={deckFlightTargetRef}
              data-testid="draft-deck-flight-target"
              className="h-8 w-[1.4rem] shrink-0 overflow-hidden rounded-sm border"
              style={{
                borderColor: "rgba(249, 115, 22, 0.45)",
                background: "linear-gradient(180deg, rgba(249, 115, 22, 0.26) 0%, rgba(15, 10, 24, 0.92) 100%)",
                boxShadow: "0 0 10px rgba(249, 115, 22, 0.12)",
              }}
            />
          </div>
          <DeckSidebar
            cardDatabase={cardDatabase}
            highlightedEntryId={highlightedDeckEntryId}
          />
        </div>
      ) : (
        <div
          data-testid="draft-deck-sidebar-collapsed-rail"
          className="flex shrink-0 items-start border-l"
          style={{
            borderColor: "rgba(124, 58, 237, 0.2)",
            background: "rgba(5, 2, 10, 0.6)",
          }}
        >
          <DeckSidebarToggle
            expanded={false}
            onToggle={() => {
              setShowDeckSidebar(true);
            }}
          />
        </div>
      )}

      {flyingCard !== null && (
        <motion.div
          data-testid="draft-flying-card"
          className="pointer-events-none fixed z-50"
          initial={{
            left: flyingCard.sourceRect.left,
            top: flyingCard.sourceRect.top,
            width: flyingCard.sourceRect.width,
            height: flyingCard.sourceRect.height,
            opacity: 0.92,
          }}
          animate={{
            left: flyingCard.targetRect.left,
            top: flyingCard.targetRect.top,
            width: flyingCard.targetRect.width,
            height: flyingCard.targetRect.height,
            opacity: 0.2,
          }}
          transition={{ duration: DECK_FLY_DURATION, ease: [0.22, 1, 0.36, 1] }}
          style={{
            left: flyingCard.sourceRect.left,
            top: flyingCard.sourceRect.top,
            width: flyingCard.sourceRect.width,
            height: flyingCard.sourceRect.height,
          }}
        >
          <div className="h-full w-full">
            <CardDisplay card={flyingCard.card} />
          </div>
        </motion.div>
      )}

      {/* Card overlay */}
      <CardOverlay card={overlayCard} onClose={handleOverlayClose} />
    </div>
  );
}
