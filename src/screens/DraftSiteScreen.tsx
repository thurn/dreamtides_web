import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useQuest } from "../state/quest-context";
import { CardDisplay } from "../components/CardDisplay";
import { CardOverlay } from "../components/CardOverlay";
import { HoverPopover } from "../components/HoverPopover";
import { buildCardSourceDebugState } from "../debug/card-source-debug";
import {
  countRemainingCards,
  enterDraftSite,
  SITE_PICKS,
} from "../draft/draft-engine";
import type { DraftState } from "../types/draft";
import type { CardData } from "../types/cards";
import { cardImageUrl } from "../data/card-database";
import { logEvent } from "../logging";


/** Delay in ms before showing the next pack after a pick. */
const NEXT_PACK_DELAY = 500;
const DECK_FLY_DURATION = 0.45;
const DECK_HIGHLIGHT_DURATION = 900;
/**
 * Delay before showing the hover-card preview on a deck row. Tighter than
 * the glossary-tooltip default (500ms) because players are scanning a
 * compact list and want quick previews while moving down the rail.
 */
const DECK_ROW_HOVER_DELAY_MS = 300;
/**
 * Width (px) of the card preview portaled by deck-row hover. Roughly the
 * width of the draft cards themselves so players see the same render they
 * would after picking.
 */
const DECK_ROW_HOVER_CARD_WIDTH_PX = 240;

/** Animation phases during a pick. */
type PickPhase = "idle" | "animating" | "waiting";

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
      <h2
        className="text-2xl font-bold tracking-wide"
        style={{ color: "#a855f7" }}
      >
        Draft Complete
      </h2>
      <p className="text-sm opacity-60">
        {String(draftedCards.length)} cards added to your deck
      </p>

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

      <button
        className="mt-4 rounded-lg px-6 py-3 font-bold text-white transition-colors"
        style={{
          background: "linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)",
          border: "1px solid rgba(168, 85, 247, 0.5)",
        }}
        onClick={onContinue}
      >
        Continue
      </button>
    </motion.div>
  );
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

  const deckCards = useMemo(() => {
    const cards: Array<{ entryId: string; card: CardData }> = [];
    for (const entry of state.deck) {
      const card = cardDatabase.get(entry.cardNumber);
      if (card) {
        cards.push({ entryId: entry.entryId, card });
      }
    }
    return cards.sort((left, right) => {
      const energyCostDelta = (left.card.energyCost ?? 0) - (right.card.energyCost ?? 0);
      if (energyCostDelta !== 0) {
        return energyCostDelta;
      }

      return left.card.name.localeCompare(right.card.name);
    });
  }, [state.deck, cardDatabase]);

  if (deckCards.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <p className="text-xs opacity-40">No cards drafted yet.</p>
      </div>
    );
  }

  // Group by energy cost
  let lastCost = -1;

  return (
    <div className="flex flex-col gap-0.5 overflow-y-auto p-2">
      {deckCards.map(({ entryId, card }) => {
        const cost = card.energyCost ?? 0;
        const showDivider = cost !== lastCost;
        lastCost = cost;
        const accentColor =
          card.cardType === "Event" ? "#c084fc" : "#a855f7";
        const isHighlighted = highlightedEntryId === entryId;

        return (
          <motion.div
            key={entryId}
            layout
            animate={
              isHighlighted
                ? {
                    scale: [1, 1.04, 1],
                    boxShadow: [
                      "0 0 0 rgba(249, 115, 22, 0)",
                      "0 0 18px rgba(249, 115, 22, 0.35)",
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
            {showDivider && (
              <div className="flex items-center gap-1.5 px-1 pt-1.5 pb-0.5">
                <span
                  className="flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold"
                  style={{
                    background: "rgba(251, 191, 36, 0.2)",
                    color: "#fbbf24",
                    border: "1px solid rgba(251, 191, 36, 0.3)",
                  }}
                >
                  {String(cost)}
                </span>
                <div
                  className="h-px flex-1"
                  style={{ background: "rgba(251, 191, 36, 0.15)" }}
                />
              </div>
            )}
            <HoverPopover
              triggerAs="div"
              placement="left"
              delayMs={DECK_ROW_HOVER_DELAY_MS}
              maxWidthPx={null}
              content={
                <div
                  data-testid={`draft-deck-row-hover-card-${entryId}`}
                  style={{ width: DECK_ROW_HOVER_CARD_WIDTH_PX }}
                >
                  <CardDisplay card={card} />
                </div>
              }
            >
              <div
                data-testid={`draft-deck-row-${entryId}`}
                tabIndex={0}
                aria-label={`Deck card: ${card.name}`}
                className="relative flex items-center gap-2 overflow-hidden rounded px-2 py-1 outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
                style={{
                  background: isHighlighted
                    ? `linear-gradient(90deg, ${accentColor}28 0%, rgba(249, 115, 22, 0.16) 38%, rgba(10, 6, 18, 0.72) 78%)`
                    : `linear-gradient(90deg, ${accentColor}15 0%, rgba(10, 6, 18, 0.7) 70%)`,
                  borderLeft: `2px solid ${accentColor}60`,
                }}
              >
                <div
                  className="relative z-10 h-10 w-[1.75rem] shrink-0 overflow-hidden rounded-sm border"
                  style={{
                    borderColor: `${accentColor}66`,
                    background: `linear-gradient(180deg, ${accentColor}30 0%, rgba(9, 6, 16, 0.9) 100%)`,
                  }}
                >
                  <img
                    src={cardImageUrl(card.cardNumber)}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </div>
                <img
                  src={cardImageUrl(card.cardNumber)}
                  alt=""
                  className="pointer-events-none absolute top-0 right-0 h-full object-cover"
                  style={{
                    width: "40%",
                    maskImage: "linear-gradient(to right, transparent 0%, black 60%)",
                    WebkitMaskImage: "linear-gradient(to right, transparent 0%, black 60%)",
                    opacity: 0.25,
                  }}
                />
                <span
                  className="relative z-10 min-w-0 flex-1 truncate text-[11px] font-medium"
                  style={{ color: "#e2e8f0" }}
                >
                  {card.name}
                </span>
                <span
                  className="relative z-10 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold"
                  style={{
                    background: "rgba(251, 191, 36, 0.2)",
                    color: "#fbbf24",
                    border: "1px solid rgba(251, 191, 36, 0.3)",
                  }}
                >
                  {String(cost)}
                </span>
              </div>
            </HoverPopover>
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

/**
 * Compute a locally-bootstrapped draft state for this site if the live
 * `state.draftState` has not yet been advanced to it. Returns null when
 * either the live state already targets this site (no override needed) or
 * the inputs are not ready (no draft pool / empty card database).
 *
 * This is the synchronous companion to the RTDB write in the bootstrap
 * effect: the first render uses this locally-computed offer so the screen
 * never paints with `currentOffer = []` and then re-renders with the real
 * offer once the snapshot round-trips. That double-render is what produced
 * the visible "fade out / fade in" flicker on draft entry.
 */
function bootstrapLocalDraftState(
  liveDraftState: DraftState | null,
  siteId: string,
  cardDatabase: Map<number, CardData>,
): DraftState | null {
  if (cardDatabase.size === 0) return null;
  if (liveDraftState === null) return null;
  if (liveDraftState.activeSiteId === siteId) return null;

  const cloned = JSON.parse(JSON.stringify(liveDraftState)) as DraftState;
  enterDraftSite(cloned, siteId, cardDatabase);
  return cloned;
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
  // Locally-bootstrapped draft state for this site. Populated lazily on the
  // first render when the live `state.draftState` has not yet caught up to
  // this site, so the screen has a real offer to show before the RTDB write
  // round-trips. Cleared once the live state matches.
  const [localDraftState, setLocalDraftState] = useState<DraftState | null>(
    () => bootstrapLocalDraftState(state.draftState, siteId, cardDatabase),
  );
  const draftStateRef = useRef<DraftState | null>(null);
  // Latches the local draft state we have already pushed to RTDB so the
  // bootstrap effect does not re-write the same value on every snapshot
  // received before the live state catches up.
  const writtenLocalDraftStateRef = useRef<DraftState | null>(null);
  const pendingPickedCardNumberRef = useRef<number | null>(null);
  const offerCardRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const deckFlightTargetRef = useRef<HTMLDivElement | null>(null);
  const previousDeckEntryIdsRef = useRef(state.deck.map((entry) => entry.entryId));

  // Prefer the live state when it has caught up to this site (so picks /
  // resumed visits reflect the source of truth); otherwise fall back to the
  // local bootstrap so the first render shows the real offer.
  const liveTargetsThisSite = state.draftState?.activeSiteId === siteId;
  const effectiveDraftState: DraftState | null = liveTargetsThisSite
    ? state.draftState
    : (localDraftState ?? state.draftState);

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
  const draftRemainingTotal = effectiveDraftState
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

  // Initialize or resume draft state for this site. The body only writes when
  // we need to enter a different site — content-stable derivations above
  // handle the steady-state display, so this effect must not call setState
  // on the live draft slice. It DOES set `localDraftState` so the first
  // paint already shows the new offer (the synchronous useState initializer
  // covers the very first render; this effect covers later siteId / draft
  // state changes).
  useEffect(() => {
    if (cardDatabase.size === 0) return;
    if (state.draftState === null) return;

    if (state.draftState.activeSiteId === siteId) {
      draftStateRef.current = state.draftState;
      // Live state has caught up; drop the local override so the live
      // snapshot is the single source of truth for subsequent picks. Also
      // release the write latch so a future re-entry can issue its own
      // bootstrap write.
      if (localDraftState !== null) {
        setLocalDraftState(null);
      }
      writtenLocalDraftStateRef.current = null;
      return;
    }

    // The local state initializer already bootstrapped and held a reference
    // for this exact (siteId, liveDraftState). Avoid re-bootstrapping on
    // every render — a fresh enterDraftSite() call rolls a new offer via
    // Math.random() and would itself create a flicker. Issue the RTDB
    // bootstrap write exactly once per local-state value.
    if (
      localDraftState !== null
      && localDraftState.activeSiteId === siteId
    ) {
      draftStateRef.current = localDraftState;
      if (writtenLocalDraftStateRef.current !== localDraftState) {
        writtenLocalDraftStateRef.current = localDraftState;
        mutations.setDraftState(localDraftState, "draft_site_enter");
      }
      return;
    }

    const cloned = JSON.parse(JSON.stringify(state.draftState)) as DraftState;
    enterDraftSite(cloned, siteId, cardDatabase);
    draftStateRef.current = cloned;
    setLocalDraftState(cloned);
    writtenLocalDraftStateRef.current = cloned;
    mutations.setDraftState(cloned, "draft_site_enter");
  }, [siteId, state.draftState, cardDatabase, mutations, localDraftState]);

  useEffect(() => {
    mutations.setCardSourceDebug(cardSourceDebugState, "draft_site_cards_shown");
  }, [cardSourceDebugState, mutations]);

  useEffect(
    () => () => {
      mutations.setCardSourceDebug(null, "draft_site_cards_hidden");
    },
    [mutations],
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
      const ds = draftStateRef.current;
      if (!ds) return;
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
    [pickPhase, cardDatabase, mutations, siteId],
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
    mutations.setScreen({ type: "dreamscape" });
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

  if (state.draftState === null && draftStateRef.current === null) {
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
    Layout: full viewport minus HUD (48px). Cards use viewport-relative
    heights so the 2x2 grid fills the screen. Each card is ~42vh tall
    (two rows + gap + header ≈ 100vh - 48px). Width follows from the
    2:3 aspect ratio. `overflow: hidden` keeps the screen from ever
    contributing scroll height — if a card is briefly oversized during
    layout, the wrapper clips rather than letting the page scroll.
  */}
  return (
    <div
      data-testid="draft-site-screen"
      className="flex overflow-hidden"
      style={{ height: "calc(100vh - 48px)" }}
    >
      {/* Main draft area */}
      <div className="flex min-w-0 flex-1 flex-col items-center justify-center overflow-hidden">
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
                    className="relative rounded-lg transition-shadow duration-200"
                    style={{
                      height: "calc((100vh - 48px - 80px) / 2)",
                      aspectRatio: "2 / 3",
                      boxShadow: "none",
                    }}
                    onMouseEnter={(e) => {
                      if (pickPhase === "idle") {
                        e.currentTarget.style.boxShadow =
                          "0 0 0 3px #f97316, 0 0 16px rgba(249, 115, 22, 0.4)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.boxShadow = "none";
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      handleCardInspect(card);
                    }}
                  >
                    <CardDisplay
                      card={card}
                      className="h-full w-full"
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
                </motion.div>
              );
            })}
          </motion.div>
        </AnimatePresence>

        {/* Compact header */}
        <div className="order-1 flex w-full items-center justify-between px-4 py-1 md:px-8">
          <div className="flex items-center gap-3">
            <h2
              className="text-lg font-bold tracking-wide"
              style={{ color: "#a855f7" }}
            >
              Draft
            </h2>
            <span className="text-xs opacity-50">
              Pick {String(Math.min(pickNumber, SITE_PICKS))}/{String(SITE_PICKS)}
            </span>
          </div>
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
            <span
              data-testid="draft-deck-count-badge"
              aria-label={`${String(state.deck.length)} cards in deck`}
              className="rounded px-2 py-1 text-xs font-medium"
              style={{
                background: "rgba(124, 58, 237, 0.15)",
                border: "1px solid rgba(124, 58, 237, 0.3)",
                color: "#c084fc",
              }}
            >
              {"\uD83C\uDCCF"} {String(state.deck.length)}
            </span>
          </div>
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
          className="w-64 shrink-0 overflow-hidden border-l lg:w-80"
          style={{
            borderColor: "rgba(124, 58, 237, 0.2)",
            background: "rgba(5, 2, 10, 0.6)",
          }}
        >
          <div
            className="flex items-center justify-between gap-2 px-3 py-2"
            style={{ borderBottom: "1px solid rgba(124, 58, 237, 0.15)" }}
          >
            <DeckSidebarToggle
              expanded
              onToggle={() => {
                setShowDeckSidebar(false);
              }}
            />
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "#a855f7" }}>
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
          <CardDisplay card={flyingCard.card} className="h-full w-full" />
        </motion.div>
      )}

      {/* Card overlay */}
      <CardOverlay card={overlayCard} onClose={handleOverlayClose} />
    </div>
  );
}
