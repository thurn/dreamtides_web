import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { CardData } from "../types/cards";
import type {
  DeckEntry,
  QuestState,
} from "../types/quest";
import { useQuest } from "../state/quest-context";
import { CardDisplay } from "./CardDisplay";
import { CardOverlay } from "./CardOverlay";
import { Dreamsign } from "../tango/components/hud/Dreamsign";
import { HoverZoomCard } from "../tango/components/card/HoverZoomCard";
import {
  getPersistedCardSize,
  persistCardSize,
  SIZE_PRESETS,
  type CardSizePreset,
} from "./card-size";
import { logEvent } from "../logging";
import {
  buildTransfigurationDisplay,
  TRANSFIGURATION_COLORS,
  type CardTransfigurationDisplay,
} from "../transfiguration/transfiguration-logic";
import { computeDeckSummary } from "./deck-summary";
import { DreamcallerPortrait } from "../tango/components/hud/DreamcallerPortrait";
import { RulesText } from "../tango/components/card/RulesText";
import {
  applyCardStatOverride,
  applyDeckEntryCardModification,
} from "../card-type-change";

/** Sort criteria options. */
type SortCriteria =
  | "acquisitionOrder"
  | "energyCost"
  | "name"
  | "cardType";

/** Labels for sort criteria. */
const SORT_LABELS: Readonly<Record<SortCriteria, string>> = {
  acquisitionOrder: "Acquisition Order",
  energyCost: "Energy Cost",
  name: "Name",
  cardType: "Card Type",
};

/** Card type filter options. */
type CardTypeFilter = "All" | "Characters" | "Events";

/** A deck entry paired with its resolved card data. */
interface ResolvedEntry {
  entry: DeckEntry;
  card: CardData;
  /** Display descriptor when the entry carries a transfiguration. */
  transfiguration?: CardTransfigurationDisplay;
  index: number;
}

/** Props for the DeckViewer component. */
interface DeckViewerProps {
  isOpen: boolean;
  onClose: () => void;
  cardDatabase: Map<number, CardData>;
  initialSize?: CardSizePreset;
}

/**
 * Full-screen overlay showing the player's complete deck, with filtering,
 * sorting, and a sidebar for dreamcaller and dreamsign data.
 */
export function DeckViewer({
  isOpen,
  onClose,
  cardDatabase,
  initialSize = "medium",
}: DeckViewerProps) {
  const { state } = useQuest();

  const [cardTypeFilter, setCardTypeFilter] =
    useState<CardTypeFilter>("All");
  const [sortCriteria, setSortCriteria] =
    useState<SortCriteria>("acquisitionOrder");
  const [sortAscending, setSortAscending] = useState(true);
  const [cardSize, setCardSizeState] = useState<CardSizePreset>(() =>
    getPersistedCardSize(initialSize),
  );
  const [overlayCard, setOverlayCard] = useState<{
    card: CardData;
    transfiguration?: CardTransfigurationDisplay;
  } | null>(null);
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const openTimestampRef = useRef<number>(0);
  const prevOpenRef = useRef(false);

  useEffect(() => {
    if (isOpen && !prevOpenRef.current) {
      openTimestampRef.current = Date.now();
      logEvent("deck_viewer_opened", {
        cardCount: state.deck.length,
        sortCriteria,
        sortAscending,
        cardTypeFilter,
        cardSize,
      });
    }
    prevOpenRef.current = isOpen;
  }, [
    isOpen,
    state.deck.length,
    sortCriteria,
    sortAscending,
    cardTypeFilter,
    cardSize,
  ]);

  const handleClose = useCallback(() => {
    const duration = Date.now() - openTimestampRef.current;
    logEvent("deck_viewer_closed", { durationMs: duration });
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return undefined;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (overlayCard !== null) {
          return;
        }
        handleClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, overlayCard, handleClose]);

  const resolvedEntries = useMemo<ResolvedEntry[]>(() => {
    return state.deck
      .map((entry, index) => {
        const card = cardDatabase.get(entry.cardNumber);
        if (!card) return null;
        const modified = applyDeckEntryCardModification(card, {
          typeChange: entry.typeChange,
          keywords: entry.keywordModification,
        });
        // Apply the debug stat override LAST, after transfiguration, so an
        // explicit override wins over transfiguration-derived stats (matching
        // resolveDeckEntryCard and the battle path).
        if (entry.transfiguration === null) {
          return {
            entry,
            card: applyCardStatOverride(modified, entry.statOverride),
            index,
          };
        }
        const transfigured = buildTransfigurationDisplay(
          modified,
          entry.transfiguration,
        );
        return {
          entry,
          card: applyCardStatOverride(transfigured.card, entry.statOverride),
          transfiguration: transfigured.display,
          index,
        };
      })
      .filter((e): e is ResolvedEntry => e !== null);
  }, [state.deck, cardDatabase]);

  const deckSummary = useMemo(
    () => computeDeckSummary(state.deck, cardDatabase),
    [state.deck, cardDatabase],
  );

  const hasActiveFilters = useMemo(
    () => cardTypeFilter !== "All",
    [cardTypeFilter],
  );

  const filteredEntries = useMemo<ResolvedEntry[]>(() => {
    return resolvedEntries.filter((resolved) => {
      if (
        cardTypeFilter === "Characters" &&
        resolved.card.cardType !== "Character"
      )
        return false;
      if (
        cardTypeFilter === "Events" &&
        resolved.card.cardType !== "Event"
      )
        return false;
      return true;
    });
  }, [resolvedEntries, cardTypeFilter]);

  const sortedEntries = useMemo<ResolvedEntry[]>(() => {
    const sorted = [...filteredEntries];
    sorted.sort((a, b) => {
      let cmp = 0;
      switch (sortCriteria) {
        case "acquisitionOrder":
          cmp = a.index - b.index;
          break;
        case "energyCost":
          cmp = (a.card.energyCost ?? 0) - (b.card.energyCost ?? 0);
          break;
        case "name":
          cmp = a.card.name.localeCompare(b.card.name);
          break;
        case "cardType":
          cmp = a.card.cardType.localeCompare(b.card.cardType);
          break;
      }
      return sortAscending ? cmp : -cmp;
    });
    return sorted;
  }, [filteredEntries, sortCriteria, sortAscending]);

  const setCardSize = useCallback((size: CardSizePreset) => {
    setCardSizeState(size);
    persistCardSize(size);
  }, []);

  const handleCardClick = useCallback((resolved: ResolvedEntry) => {
    setOverlayCard({
      card: resolved.card,
      transfiguration: resolved.transfiguration,
    });
  }, []);

  const handleCloseOverlay = useCallback(() => {
    setOverlayCard(null);
  }, []);

  const closeSortDropdown = useCallback(() => {
    setShowSortDropdown(false);
  }, []);

  useEffect(() => {
    if (!showSortDropdown) return undefined;
    function handleClick() {
      closeSortDropdown();
    }
    window.addEventListener("click", handleClick);
    return () => {
      window.removeEventListener("click", handleClick);
    };
  }, [showSortDropdown, closeSortDropdown]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="deck-viewer-backdrop"
          className="fixed inset-0 z-[60] flex flex-col"
          style={{ backgroundColor: "rgba(5, 2, 10, 0.92)" }}
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          transition={{ duration: 0.3 }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3 md:px-6"
            style={{
              borderBottom: "1px solid rgba(124, 58, 237, 0.3)",
              background:
                "linear-gradient(180deg, rgba(10, 6, 18, 0.95) 0%, rgba(10, 6, 18, 0.8) 100%)",
            }}
          >
            <h2 className="text-lg font-bold md:text-xl" style={{ color: "#e2e8f0" }}>
              Deck{" "}
              <span className="text-sm font-normal opacity-60 md:text-base">
                ({String(sortedEntries.length)}
                {sortedEntries.length !== resolvedEntries.length
                  ? ` / ${String(resolvedEntries.length)}`
                  : ""}{" "}
                cards)
              </span>
            </h2>
            <button
              // FIND-01-9 / FIND-10-11 (Stage 4): bump the close target to
              // 40px so it meets the WCAG 44x44 band (38px target +
              // transparent hit-padding) with visible hover/focus states.
              className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-lg transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
              style={{
                background: "rgba(255, 255, 255, 0.1)",
                color: "#e2e8f0",
              }}
              onClick={handleClose}
              aria-label="Close deck viewer"
            >
              {"\u2715"}
            </button>
          </div>

          {/* Deck summary */}
          {deckSummary.total > 0 && (
            <div
              className="px-4 py-2 md:px-6"
              style={{
                borderBottom: "1px solid rgba(124, 58, 237, 0.15)",
                background: "rgba(10, 6, 18, 0.5)",
              }}
            >
              {/* FIND-01-10 (Stage 4): summary tiles sit in an inline flex
                  row so the Avg Cost tile hugs its value instead of
                  stretching to 1/3 of a 1728px row. On narrow viewports the
                  tiles wrap naturally. */}
              <div
                className="mb-2 flex flex-wrap items-stretch gap-2"
                style={{ color: "#e2e8f0" }}
              >
                <SummaryBadge
                  label="Characters"
                  value={String(deckSummary.characterCount)}
                />
                <SummaryBadge
                  label="Events"
                  value={String(deckSummary.eventCount)}
                />
                <SummaryBadge
                  label="Avg Cost"
                  value={
                    deckSummary.averageEnergyCost === null
                      ? "--"
                      : deckSummary.averageEnergyCost.toFixed(1)
                  }
                />
              </div>
              {hasActiveFilters && (
                <div className="text-[11px] italic" style={{ color: "#6b7280" }}>
                  Showing the full deck summary while a type filter is active.
                </div>
              )}
            </div>
          )}

          {/* Controls row */}
          <div
            className="flex flex-wrap items-center gap-2 px-4 py-2 md:px-6"
            style={{
              borderBottom: "1px solid rgba(124, 58, 237, 0.15)",
              background: "rgba(10, 6, 18, 0.6)",
            }}
          >
            {/* Card type filter */}
            <div className="flex items-center gap-1">
              <span className="mr-1 text-[10px] uppercase tracking-wider opacity-40">
                Type
              </span>
              {(["All", "Characters", "Events"] as const).map((filter) => (
                <button
                  key={filter}
                  // FIND-01-9 / FIND-10-11 / FIND-10-12 (Stage 4): bump filter
                  // pills to a 36px height with visible hover/focus states.
                  className="flex min-h-[36px] cursor-pointer items-center rounded-full px-3 py-1 text-[12px] font-medium transition-all hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                  style={{
                    background:
                      cardTypeFilter === filter
                        ? "rgba(168, 85, 247, 0.25)"
                        : "rgba(255, 255, 255, 0.03)",
                    border: `1px solid ${cardTypeFilter === filter ? "rgba(168, 85, 247, 0.5)" : "rgba(255, 255, 255, 0.12)"}`,
                    color: cardTypeFilter === filter ? "#c084fc" : "#cbd5f5",
                  }}
                  onClick={() => {
                    setCardTypeFilter(filter);
                  }}
                >
                  {filter}
                </button>
              ))}
            </div>

            {/* Divider */}
            <div
              className="mx-1 hidden h-5 md:block"
              style={{ borderLeft: "1px solid rgba(255, 255, 255, 0.1)" }}
            />

            {/* Sort controls */}
            <div className="flex items-center gap-1">
              <span className="mr-1 text-[10px] uppercase tracking-wider opacity-40">
                Sort
              </span>
              <div className="relative">
                <button
                  // FIND-01-9 / FIND-10-11 (Stage 4): 36px sort dropdown
                  // trigger with hover/focus-visible chrome.
                  className="flex min-h-[36px] cursor-pointer items-center gap-1 rounded-full px-3 py-1 text-[12px] font-medium transition-all hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                  style={{
                    background: "rgba(255, 255, 255, 0.05)",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                    color: "#e2e8f0",
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowSortDropdown((prev) => !prev);
                  }}
                >
                  {SORT_LABELS[sortCriteria]}
                  <span className="opacity-50">{"\u25BE"}</span>
                </button>
                {showSortDropdown && (
                  <div
                    className="absolute top-full left-0 z-10 mt-1 rounded-lg py-1 shadow-xl"
                    style={{
                      background: "#1a1025",
                      border: "1px solid rgba(124, 58, 237, 0.3)",
                      minWidth: "160px",
                    }}
                  >
                    {(Object.keys(SORT_LABELS) as SortCriteria[]).map(
                      (criteria) => (
                        <button
                          key={criteria}
                          className="block w-full cursor-pointer px-3 py-1.5 text-left text-xs transition-colors"
                          style={{
                            color:
                              sortCriteria === criteria
                                ? "#c084fc"
                                : "#e2e8f0",
                            background:
                              sortCriteria === criteria
                                ? "rgba(168, 85, 247, 0.15)"
                                : "transparent",
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSortCriteria(criteria);
                            setShowSortDropdown(false);
                          }}
                        >
                          {SORT_LABELS[criteria]}
                        </button>
                      ),
                    )}
                  </div>
                )}
              </div>
              <button
                // FIND-01-9 / FIND-10-11 (Stage 4): sort-direction toggle
                // sized for comfortable tapping.
                className="flex h-9 min-w-[36px] cursor-pointer items-center justify-center rounded-full px-2 text-[12px] transition-all hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                style={{
                  background: "rgba(255, 255, 255, 0.05)",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  color: "#e2e8f0",
                }}
                onClick={() => {
                  setSortAscending((prev) => !prev);
                }}
                aria-label={
                  sortAscending ? "Sort descending" : "Sort ascending"
                }
              >
                {sortAscending ? "\u2191" : "\u2193"}
              </button>
            </div>

            <div
              className="mx-1 hidden h-5 md:block"
              style={{ borderLeft: "1px solid rgba(255, 255, 255, 0.1)" }}
            />

            <div className="flex items-center gap-1">
              <span className="mr-1 text-[10px] uppercase tracking-wider opacity-40">
                Size
              </span>
              {(Object.keys(SIZE_PRESETS) as CardSizePreset[]).map((preset) => (
                <button
                  key={preset}
                  // FIND-01-9 / FIND-10-11 (Stage 4): size preset pills
                  // bumped to 36px with full hover/focus chrome.
                  className="flex min-h-[36px] cursor-pointer items-center rounded-full px-3 py-1 text-[12px] font-medium transition-all hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                  style={{
                    background:
                      cardSize === preset
                        ? "rgba(168, 85, 247, 0.25)"
                        : "rgba(255, 255, 255, 0.03)",
                    border: `1px solid ${cardSize === preset ? "rgba(168, 85, 247, 0.5)" : "rgba(255, 255, 255, 0.12)"}`,
                    color: cardSize === preset ? "#c084fc" : "#cbd5f5",
                  }}
                  onClick={() => {
                    setCardSize(preset);
                  }}
                >
                  {SIZE_PRESETS[preset].label}
                </button>
              ))}
            </div>
          </div>

          {/* Main content area */}
          <div className="flex min-h-0 flex-1">
            {/* Card grid */}
            <div className="flex-1 overflow-y-auto px-4 py-3 md:px-6">
              {sortedEntries.length === 0 ? (
                <div className="flex h-full items-center justify-center">
                  <p className="text-sm opacity-40">
                    {resolvedEntries.length === 0
                      ? "No cards in deck yet."
                      : "No cards match the current filters."}
                  </p>
                </div>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: SIZE_PRESETS[cardSize].columns,
                    gap: SIZE_PRESETS[cardSize].gap,
                  }}
                >
                  {sortedEntries.map((resolved) => {
                    const cardTileBorderStyle =
                      resolved.entry.transfiguration !== null
                        ? {
                            boxShadow: `0 0 8px ${TRANSFIGURATION_COLORS[resolved.entry.transfiguration]}40`,
                            borderRadius: "0.5rem",
                          }
                        : resolved.entry.isBane
                          ? {
                              boxShadow:
                                "0 0 8px rgba(239, 68, 68, 0.3)",
                              borderRadius: "0.5rem",
                            }
                          : undefined;
                    // Small and medium tiles grow in place on hover (the card
                    // itself enlarges until its rules text is comfortably
                    // legible) so the in-grid card suppresses its own term
                    // popover to keep the enlarged read clean. Large tiles are
                    // already wide enough to read, so they neither grow nor
                    // suppress their term help.
                    const wrappedCardTile = (
                      <div style={cardTileBorderStyle}>
                        <HoverZoomCard
                          enabled={cardSize !== "large"}
                          logSurface="deck_viewer"
                          glossaryText={resolved.card.renderedText}
                          testId={`deck-viewer-row-${resolved.entry.entryId}`}
                        >
                          <CardDisplay
                            card={resolved.card}
                            transfiguration={resolved.transfiguration}
                            large={cardSize === "large"}
                            suppressHoverHelp={cardSize !== "large"}
                            onClick={() => {
                              handleCardClick(resolved);
                            }}
                          />
                        </HoverZoomCard>
                      </div>
                    );
                    return (
                      <div
                        key={resolved.entry.entryId}
                        className="relative"
                      >
                        {resolved.entry.typeChange != null && (
                          <div
                            className="absolute -bottom-1 -right-1 z-10 rounded-full border border-emerald-200 bg-emerald-700 px-1.5 py-0.5 text-[9px] font-bold text-white shadow-md"
                            title={`Becomes ${resolved.entry.typeChange.label}`}
                          >
                            {resolved.entry.typeChange.label}
                          </div>
                        )}
                        {/* Bane indicator */}
                        {resolved.entry.isBane && (
                          <div
                            className="absolute -top-1 -left-1 z-10 flex h-5 w-5 items-center justify-center rounded-full text-[10px] shadow-md"
                            style={{
                              background: "#7f1d1d",
                              border: "1px solid #ef4444",
                              color: "#fca5a5",
                            }}
                            title="Bane"
                          >
                            {"\u2620"}
                          </div>
                        )}
                        {wrappedCardTile}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Sidebar */}
            <div
              className="hidden w-64 shrink-0 overflow-y-auto border-l px-4 py-3 lg:block"
              style={{
                borderColor: "rgba(124, 58, 237, 0.2)",
                background: "rgba(10, 6, 18, 0.4)",
              }}
            >
              {/* Dreamcaller section */}
              <div className="mb-4">
                <h3
                  className="mb-2 text-xs font-bold uppercase tracking-wider"
                  style={{ color: "#a855f7" }}
                >
                  Dreamcaller
                </h3>
                {state.dreamcaller !== null ? (
                  <div
                    className="rounded-lg p-3"
                    style={{
                      background: "rgba(124, 58, 237, 0.1)",
                      border: "1px solid rgba(124, 58, 237, 0.2)",
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <DreamcallerPortrait
                        dreamcaller={state.dreamcaller}
                        variant="panel"
                        size={68}
                      />
                      <div>
                        <span
                          className="text-sm font-bold"
                          style={{ color: "#f8fafc" }}
                        >
                          {state.dreamcaller.name}
                        </span>
                        <p
                          className="mt-0.5 text-[11px] italic opacity-80"
                          style={{ color: "#cbd5f5" }}
                        >
                          {state.dreamcaller.title}
                        </p>
                      </div>
                    </div>
                    <div
                      className="mt-2 text-[11px] leading-relaxed opacity-70"
                      style={{ color: "#e2e8f0" }}
                    >
                      <RulesText text={state.dreamcaller.renderedText} />
                    </div>
                  </div>
                ) : (
                  <p className="text-xs opacity-40">
                    No dreamcaller selected.
                  </p>
                )}
              </div>

              {/* Dreamsigns section */}
              <div className="mb-4">
                <h3
                  className="mb-2 text-xs font-bold uppercase tracking-wider"
                  style={{ color: "#a855f7" }}
                >
                  Dreamsigns ({String(state.dreamsigns.length)}/12)
                </h3>
                {state.dreamsigns.length === 0 ? (
                  <p className="text-xs opacity-40">
                    No dreamsigns acquired.
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {state.dreamsigns.map((sign, i) => (
                      <div
                        key={`${sign.name}-${String(i)}`}
                        className="flex items-start gap-2 rounded-lg p-2"
                        style={{
                          background: sign.isBane
                            ? "rgba(239, 68, 68, 0.1)"
                            : "rgba(124, 58, 237, 0.08)",
                          border: `1px solid ${sign.isBane ? "rgba(239, 68, 68, 0.25)" : "rgba(124, 58, 237, 0.15)"}`,
                        }}
                      >
                        <Dreamsign dreamsign={sign} sizePx={36} />
                        <div className="flex flex-1 flex-col gap-1">
                          <div className="flex items-center gap-1.5">
                            <span
                              className="text-[11px] font-bold"
                              style={{
                                color: sign.isBane ? "#fca5a5" : "#f8fafc",
                              }}
                            >
                              {sign.name}
                            </span>
                            {sign.isBane && (
                              <span
                                className="ml-auto rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider"
                                style={{
                                  background: "rgba(239, 68, 68, 0.18)",
                                  color: "#fecaca",
                                  border:
                                    "1px solid rgba(239, 68, 68, 0.40)",
                                }}
                                title="Bane"
                              >
                                Bane
                              </span>
                            )}
                          </div>
                          <div
                            className="text-[10px] leading-snug opacity-70"
                            style={{ color: "#e2e8f0" }}
                          >
                            <RulesText text={sign.effectDescription} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          </div>

          {/* Mobile sidebar as tabs at bottom */}
          <MobileSidebar
            dreamcaller={state.dreamcaller}
            dreamsigns={state.dreamsigns}
          />

          {/* Card overlay */}
          <CardOverlay
            card={overlayCard?.card ?? null}
            transfiguration={overlayCard?.transfiguration}
            onClose={handleCloseOverlay}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function SummaryBadge({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="flex min-w-[7.5rem] flex-col rounded-lg px-3 py-2"
      style={{
        background: "rgba(255, 255, 255, 0.03)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
      }}
    >
      <span className="text-[11px] uppercase tracking-wider opacity-50">
        {label}
      </span>
      <div className="text-sm font-bold" style={{ color: "#e2e8f0" }}>
        {value}
      </div>
    </div>
  );
}

/** Mobile sidebar shown only on smaller screens as a collapsible section. */
function MobileSidebar({
  dreamcaller,
  dreamsigns,
}: {
  dreamcaller: QuestState["dreamcaller"];
  dreamsigns: QuestState["dreamsigns"];
}) {
  const [activeTab, setActiveTab] = useState<
    "dreamcaller" | "dreamsigns" | null
  >(null);

  const toggleTab = useCallback(
    (tab: "dreamcaller" | "dreamsigns") => {
      setActiveTab((prev) => (prev === tab ? null : tab));
    },
    [],
  );

  return (
    <div
      className="lg:hidden"
      style={{
        borderTop: "1px solid rgba(124, 58, 237, 0.2)",
        background: "rgba(10, 6, 18, 0.9)",
      }}
    >
      {/* Tab buttons */}
      <div className="flex">
        <button
          className="flex-1 cursor-pointer px-2 py-1.5 text-[10px] font-medium transition-colors"
          style={{
            color: activeTab === "dreamcaller" ? "#c084fc" : "#6b7280",
            background:
              activeTab === "dreamcaller"
                ? "rgba(168, 85, 247, 0.15)"
                : "transparent",
            borderBottom: `2px solid ${activeTab === "dreamcaller" ? "#a855f7" : "transparent"}`,
          }}
          onClick={() => {
            toggleTab("dreamcaller");
          }}
        >
          Dreamcaller
        </button>
        <button
          className="flex-1 cursor-pointer px-2 py-1.5 text-[10px] font-medium transition-colors"
          style={{
            color: activeTab === "dreamsigns" ? "#c084fc" : "#6b7280",
            background:
              activeTab === "dreamsigns"
                ? "rgba(168, 85, 247, 0.15)"
                : "transparent",
            borderBottom: `2px solid ${activeTab === "dreamsigns" ? "#a855f7" : "transparent"}`,
          }}
          onClick={() => {
            toggleTab("dreamsigns");
          }}
        >
          Dreamsigns ({String(dreamsigns.length)}/12)
        </button>
      </div>

      {/* Tab content */}
      <AnimatePresence>
        {activeTab !== null && (
          <motion.div
            key={activeTab}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden px-4 py-2"
          >
            {activeTab === "dreamcaller" && (
              <div>
                {dreamcaller !== null ? (
                  <div className="flex items-start gap-2">
                    <DreamcallerPortrait
                      dreamcaller={dreamcaller}
                      variant="thumb"
                      size={42}
                    />
                    <div>
                      <span
                        className="text-xs font-bold"
                        style={{ color: "#f8fafc" }}
                      >
                        {dreamcaller.name}
                      </span>
                      <p
                        className="mt-0.5 text-[10px] italic opacity-80"
                        style={{ color: "#cbd5f5" }}
                      >
                        {dreamcaller.title}
                      </p>
                      <div className="mt-0.5 text-[10px] opacity-60">
                        <RulesText text={dreamcaller.renderedText} />
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs opacity-40">
                    No dreamcaller selected.
                  </p>
                )}
              </div>
            )}
            {activeTab === "dreamsigns" && (
              <div className="flex flex-col gap-1.5">
                {dreamsigns.length === 0 ? (
                  <p className="text-xs opacity-40">
                    No dreamsigns acquired.
                  </p>
                ) : (
                  dreamsigns.map((sign, i) => (
                    <div
                      key={`mobile-${sign.name}-${String(i)}`}
                      className="flex items-start gap-2 rounded-lg p-2"
                      style={{
                        background: sign.isBane
                          ? "rgba(239, 68, 68, 0.1)"
                          : "rgba(124, 58, 237, 0.08)",
                        border: `1px solid ${sign.isBane ? "rgba(239, 68, 68, 0.25)" : "rgba(124, 58, 237, 0.15)"}`,
                      }}
                    >
                      <Dreamsign dreamsign={sign} sizePx={32} />
                      <div className="flex flex-1 flex-col gap-0.5">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="text-[10px] font-medium"
                            style={{
                              color: sign.isBane ? "#fca5a5" : "#f8fafc",
                            }}
                          >
                            {sign.name}
                          </span>
                          {sign.isBane && (
                            <span
                              className="ml-auto rounded-full px-1 py-0.5 text-[8px] font-bold uppercase tracking-wider"
                              style={{
                                background: "rgba(239, 68, 68, 0.18)",
                                color: "#fecaca",
                                border:
                                  "1px solid rgba(239, 68, 68, 0.40)",
                              }}
                            >
                              Bane
                            </span>
                          )}
                        </div>
                        <div
                          className="text-[10px] leading-snug opacity-60"
                          style={{ color: "#e2e8f0" }}
                        >
                          <RulesText text={sign.effectDescription} />
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
