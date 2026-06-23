import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { CSSProperties } from "react";
import type { CardData } from "../types/cards";
import type {
  ResolvedDreamcallerPackage,
  SeedProvenanceSummary,
  Tides4ProvenanceSummary,
  Tides4TideSelection,
  Tides4TideSummary,
} from "../types/content";
import type { DraftState } from "../types/draft";
import type { DraftRecord } from "../data/cards-v2-database";
import { poolStrategyFor } from "../draft/pool/registry";
import { seedProvenanceVariantCopy } from "../draft/pool/seed-provenance-copy";
import type { PoolVariant } from "../draft/pool/types";
import { BrowserCard } from "./card-browser/BrowserCard";
import CardBrowserGrid from "./card-browser/CardBrowserGrid";
import CardBrowserToolbar from "./card-browser/CardBrowserToolbar";
import {
  DEFAULT_CARD_BROWSER_VALUES,
  type CardBrowserToolbarValues,
} from "./card-browser/card-browser-types";
import {
  filterAndSortCardData,
  subtypeOptionsFromCards,
} from "./card-browser/card-browser-filter";
import { CardOverlay } from "./CardOverlay";
import { HoverPopover } from "./HoverPopover";

type PoolViewerSource =
  | "run"
  | "tides"
  | "catalog"
  | "idf3"
  | "signature"
  | "deck"
  | "history";
type PoolViewerVariant = "overlay" | "floating";

const SOURCE_LABELS: Record<PoolViewerSource, string> = {
  run: "Run Pool",
  tides: "Tide Decks",
  catalog: "All Cards",
  idf3: "IDF3 Decklist",
  signature: "Signature Cards",
  deck: "Record Deck",
  history: "Pick History",
};

const EMPTY_BASE_MESSAGES: Record<PoolViewerSource, string> = {
  run: "No run pool cards are available.",
  tides: "This run was not built from tide decks.",
  catalog: "No cards match the current filters.",
  idf3: "No IDF3 starting decklist is available for this run.",
  signature: "This Dreamcaller has no signature cards.",
  deck: "The replay record has no resolvable deck cards.",
  history: "The replay record has no pick history.",
};

/**
 * Per-selection display metadata for the run's tides: a short tag and an accent
 * colour distinguishing the always-joined signature tide, the random theme draw
 * (the variety engine), the on-theme fill, and the broad neutral tail.
 */
const TIDE_SELECTION_META: Record<
  Tides4TideSelection,
  { tag: string; accent: string }
> = {
  starter: { tag: "Signature", accent: "#34c759" },
  "facet-drawn": { tag: "Theme · drawn", accent: "#2d8a80" },
  "facet-fill": { tag: "Theme · fill", accent: "#7c8a86" },
  "neutral-fill": { tag: "Broad", accent: "#5b6b78" },
};
type FloatingPosition = { x: number; y: number };
type FloatingDragState = { offsetX: number; offsetY: number } | null;

interface PoolCardEntry {
  card: CardData;
  copies: number | null;
}

const segmentedStyle: CSSProperties = {
  display: "inline-flex",
  width: "fit-content",
  boxSizing: "border-box",
  minHeight: "36px",
  border: "1px solid rgba(247, 241, 223, 0.24)",
  borderRadius: "6px",
  overflow: "hidden",
};

function sourceButtonStyle(active: boolean): CSSProperties {
  return {
    minHeight: "34px",
    border: 0,
    borderRight: "1px solid rgba(247, 241, 223, 0.16)",
    background: active ? "#2d8a80" : "#16242a",
    color: active ? "#ffffff" : "#d9e1dd",
    padding: "0 12px",
    font: "inherit",
    fontWeight: 800,
    fontSize: "0.82rem",
    cursor: "pointer",
  };
}

/**
 * Read-only card-pool browser. It shares the card editor's filter/sort/size
 * toolbar, grid layout, and Magic: The Gathering hover tooltip through the
 * `card-browser` module, and layers in pool-specific affordances: a source
 * toggle (remaining run pool, full catalog, the IDF3 starting decklist that
 * seeded the pool, and the Dreamcaller's signature cards), remaining-copy
 * badges, drag-to-deck support, and a click-to-zoom card overlay. It renders as
 * a full-screen `overlay` or a draggable `floating` panel.
 *
 * The IDF3 and signature toggles appear only when `resolvedPackage` supplies the
 * matching data — an IDF3 starter decklist and a non-empty signature list,
 * respectively — so runs without that content show just the run-pool and
 * catalog sources.
 *
 * In record-replay draft mode (`draftState.mode === "replay"`) the pool-mode
 * sources are replaced by replay diagnostics drawn from `replayRecord`: a
 * "Record Deck" grid of the deck the original drafter eventually built and a
 * "Pick History" panel walking their pack-by-pack picks. The algorithm chip
 * then reads `algo: replay` rather than the IDF3 fallback the pool generator
 * resolves for the run.
 *
 * For the `tides4` variant, `tides4Provenance` adds a construction banner (the
 * starting signature tide, the random theme-tide draw, the broad fill) and a
 * "Tide Decks" source whose sub-navigation lets the player open each individual
 * tide that built the pool and see which of its cards landed, so the tide
 * relationships and the reason each tide was picked are legible.
 */
export function PoolViewer({
  cardDatabase,
  draftState,
  isOpen,
  onClose,
  onPoolCardDragEnd,
  onPoolCardDragStart,
  poolVariant = null,
  replayRecord = null,
  resolvedPackage = null,
  seedProvenance = null,
  tides4Provenance = null,
  title = "Pool Viewer",
  variant = "overlay",
}: {
  cardDatabase: ReadonlyMap<number, CardData>;
  draftState: DraftState | null;
  isOpen: boolean;
  onClose: () => void;
  onPoolCardDragEnd?: () => void;
  onPoolCardDragStart?: (card: CardData) => void;
  poolVariant?: PoolVariant | null;
  replayRecord?: DraftRecord | null;
  resolvedPackage?: ResolvedDreamcallerPackage | null;
  seedProvenance?: SeedProvenanceSummary | null;
  tides4Provenance?: Tides4ProvenanceSummary | null;
  title?: string;
  variant?: PoolViewerVariant;
}) {
  const [source, setSource] = useState<PoolViewerSource>("run");
  const [selectedTideId, setSelectedTideId] = useState<string | null>(null);
  const [values, setValues] = useState<CardBrowserToolbarValues>(
    DEFAULT_CARD_BROWSER_VALUES,
  );
  const [overlayCard, setOverlayCard] = useState<CardData | null>(null);
  const [floatingPosition, setFloatingPosition] =
    useState<FloatingPosition | null>(null);
  const [floatingDrag, setFloatingDrag] = useState<FloatingDragState>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setOverlayCard(null);
      setFloatingDrag(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape" && overlayCard === null) {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose, overlayCard]);

  useEffect(() => {
    if (floatingDrag === null) {
      return undefined;
    }

    const drag = floatingDrag;
    function handlePointerMove(event: PointerEvent): void {
      const panel = panelRef.current;
      const width = panel?.offsetWidth ?? 0;
      const height = panel?.offsetHeight ?? 0;
      setFloatingPosition({
        x: clamp(event.clientX - drag.offsetX, 8, window.innerWidth - width - 8),
        y: clamp(
          event.clientY - drag.offsetY,
          8,
          window.innerHeight - height - 8,
        ),
      });
    }

    function handlePointerUp(): void {
      setFloatingDrag(null);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [floatingDrag]);

  // Record-replay draft mode swaps the pool-mode sources (run pool, IDF3
  // starter) for the historical record's own deck and pick log. The IDF3
  // starter that `resolvedPackage` still carries describes how the pool would
  // have been seeded in pool mode, so it is hidden here to avoid implying the
  // replay draft came from it.
  const isReplay = draftState?.mode === "replay" && replayRecord !== null;

  // Resolve cards by stable cards_v2 UUID (lowercased). Draft records and
  // Dreamcaller signatures carry id-aligned arrays alongside their display
  // names; keying on the id keeps the viewer correct when two distinct cards
  // share a name.
  const cardsById = useMemo(() => {
    const byId = new Map<string, CardData>();
    for (const card of cardDatabase.values()) {
      byId.set(card.id.toLowerCase(), card);
    }
    return byId;
  }, [cardDatabase]);

  const idf3Entries = useMemo<PoolCardEntry[]>(
    () =>
      buildEntriesFromCardNumbers(
        resolvedPackage?.starterDecklistCardNumbers ?? [],
        cardDatabase,
      ),
    [cardDatabase, resolvedPackage],
  );

  const signatureEntries = useMemo<PoolCardEntry[]>(
    () =>
      buildSignatureEntries(
        resolvedPackage?.dreamcaller.signatureCardIds ?? [],
        cardsById,
      ),
    [cardsById, resolvedPackage],
  );

  // The deck the original drafter eventually built, resolved from the record's
  // mainboard ids. Copies are counted so a doubled card shows an "x2" badge.
  const deckEntries = useMemo<PoolCardEntry[]>(
    () => buildDeckEntries(replayRecord?.mainboardIds ?? [], cardsById),
    [cardsById, replayRecord],
  );

  // The run's tides, in join order. Present only for the `tides4` variant.
  const tideList = tides4Provenance?.tides ?? [];
  const hasTides = tideList.length > 0 && !isReplay;

  // Keep the selected tide valid as the provenance loads or changes: default to
  // the first tide (the signature tide when present), and re-anchor if the
  // current selection is no longer in the list.
  useEffect(() => {
    const list = tides4Provenance?.tides ?? [];
    if (list.length === 0) {
      setSelectedTideId(null);
      return;
    }
    setSelectedTideId((current) =>
      current !== null && list.some((tide) => tide.id === current)
        ? current
        : list[0].id,
    );
  }, [tides4Provenance]);

  const selectedTide =
    tideList.find((tide) => tide.id === selectedTideId) ?? null;

  // The constructed draft-pool copy counts, used to badge tide cards with how
  // many copies of each landed in the pool (so "didn't make the cut" reads as a
  // missing badge against the tide's full decklist).
  const poolCopiesByNumber = useMemo(() => {
    const counts = new Map<number, number>();
    for (const [key, copies] of Object.entries(
      resolvedPackage?.draftPoolCopiesByCard ?? {},
    )) {
      const cardNumber = Number(key);
      if (Number.isFinite(cardNumber)) {
        counts.set(cardNumber, copies);
      }
    }
    return counts;
  }, [resolvedPackage]);

  const tideEntries = useMemo<PoolCardEntry[]>(
    () => buildTideEntries(selectedTide, cardDatabase, poolCopiesByNumber),
    [cardDatabase, poolCopiesByNumber, selectedTide],
  );

  const availableSources = useMemo<PoolViewerSource[]>(() => {
    if (isReplay) {
      const sources: PoolViewerSource[] = ["deck", "history", "catalog"];
      if (signatureEntries.length > 0) {
        sources.push("signature");
      }
      return sources;
    }
    const sources: PoolViewerSource[] = ["run"];
    if (hasTides) {
      sources.push("tides");
    }
    sources.push("catalog");
    if (idf3Entries.length > 0) {
      sources.push("idf3");
    }
    if (signatureEntries.length > 0) {
      sources.push("signature");
    }
    return sources;
  }, [hasTides, idf3Entries.length, isReplay, signatureEntries.length]);

  // Fall back to the first available source if the selected one loses its
  // backing data (a new run dropping the signature cards, or switching between
  // pool and replay draft modes).
  useEffect(() => {
    if (!availableSources.includes(source)) {
      setSource(availableSources[0]);
    }
  }, [availableSources, source]);

  const baseEntries = useMemo<PoolCardEntry[]>(() => {
    switch (source) {
      case "run":
        return buildRunPoolEntries(draftState, cardDatabase);
      case "tides":
        return tideEntries;
      case "idf3":
        return idf3Entries;
      case "deck":
        return deckEntries;
      case "signature":
        return signatureEntries;
      case "history":
        return [];
      case "catalog":
      default:
        return Array.from(cardDatabase.values()).map((card) => ({
          card,
          copies: null,
        }));
    }
  }, [
    cardDatabase,
    deckEntries,
    draftState,
    idf3Entries,
    signatureEntries,
    source,
    tideEntries,
  ]);

  const baseCards = useMemo(
    () => baseEntries.map((entry) => entry.card),
    [baseEntries],
  );

  const copiesByNumber = useMemo(
    () =>
      new Map(
        baseEntries.map((entry) => [entry.card.cardNumber, entry.copies]),
      ),
    [baseEntries],
  );

  const subtypeOptions = useMemo(
    () => subtypeOptionsFromCards(baseCards),
    [baseCards],
  );

  const filteredCards = useMemo(
    () => filterAndSortCardData(baseCards, values),
    [baseCards, values],
  );

  const handlePatch = useCallback(
    (patch: Partial<CardBrowserToolbarValues>) => {
      setValues((current) => ({ ...current, ...patch }));
    },
    [],
  );

  const handlePanelPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (
        variant !== "floating" ||
        (event.target instanceof HTMLElement &&
          event.target.closest(
            "button, input, select, textarea, [data-pool-card-tile]",
          ) !== null)
      ) {
        return;
      }
      const panel = panelRef.current;
      if (panel === null) {
        return;
      }
      const rect = panel.getBoundingClientRect();
      setFloatingPosition({ x: rect.left, y: rect.top });
      setFloatingDrag({
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
      });
    },
    [variant],
  );

  const wrapperClass =
    variant === "floating"
      ? "pointer-events-none fixed inset-0 z-[58]"
      : "fixed inset-0 z-[60] flex flex-col";
  const panelClass =
    variant === "floating"
      ? "pointer-events-auto fixed flex max-h-[min(76vh,720px)] w-[min(820px,calc(100vw-24px))] flex-col overflow-hidden rounded-lg border border-cyan-400/30 shadow-2xl"
      : "flex min-h-0 flex-1 flex-col";
  const panelStyle: CSSProperties =
    variant === "floating"
      ? {
          left: `${String(floatingPosition?.x ?? 24)}px`,
          top: `${String(floatingPosition?.y ?? 24)}px`,
          background: "#101417",
          color: "#f7f1df",
        }
      : { background: "#101417", color: "#f7f1df" };

  // The algorithm chip names the draft strategy actually in effect. In the
  // deck-fit modes that is "replay" / "fresh20" — the pool generator still
  // resolves a `poolVariant` (the IDF3 fallback) for the run, but it does not
  // drive the draft, so surfacing it here would be misleading.
  const isFresh20 = draftState?.mode === "fresh20";
  const algoLabel = isReplay ? "replay" : isFresh20 ? "fresh20" : poolVariant;
  const algoTitle = isReplay
    ? replayRecord !== null
      ? `Record-replay draft · replaying record ${replayRecord.id}`
      : "Record-replay draft"
    : isFresh20
      ? "Fresh-pack draft · fresh random packs ranked by deck fit"
      : poolVariant !== null
        ? poolStrategyFor(poolVariant).description
        : "";

  const sourceToggle = (
    <div role="group" aria-label="Card source" style={segmentedStyle}>
      {availableSources.map((value) => (
        <button
          key={value}
          type="button"
          data-pool-source={value}
          aria-pressed={source === value}
          style={sourceButtonStyle(source === value)}
          onClick={() => setSource(value)}
        >
          {SOURCE_LABELS[value]}
        </button>
      ))}
    </div>
  );

  return (
    <AnimatePresence>
      {isOpen ? (
        <motion.div
          key={`pool-viewer-${variant}`}
          className={wrapperClass}
          data-pool-viewer={variant}
          style={
            variant === "floating"
              ? undefined
              : { background: "rgba(2, 6, 12, 0.9)" }
          }
          initial={{ opacity: 0, y: variant === "floating" ? 0 : 36 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: variant === "floating" ? 0 : 36 }}
          transition={{ duration: 0.18 }}
          onClick={variant === "floating" ? undefined : onClose}
        >
          <div
            ref={panelRef}
            className={panelClass}
            style={panelStyle}
            onClick={(event) => event.stopPropagation()}
          >
            <div
              className="flex cursor-default flex-wrap items-center justify-between gap-3 px-4 py-3"
              style={{ borderBottom: "1px solid rgba(142, 219, 209, 0.2)" }}
              onPointerDown={handlePanelPointerDown}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  flexWrap: "wrap",
                  gap: "8px",
                }}
              >
                <h2 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 800 }}>
                  {title}
                </h2>
                {algoLabel ? (
                  <span
                    data-pool-algo={algoLabel}
                    title={algoTitle}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      borderRadius: "999px",
                      border: "1px solid rgba(142, 219, 209, 0.4)",
                      background: "rgba(45, 138, 128, 0.18)",
                      color: "#8edbd1",
                      padding: "2px 10px",
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      letterSpacing: "0.02em",
                    }}
                  >
                    {`algo: ${algoLabel}`}
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                aria-label="Close pool viewer"
                className="flex h-10 w-10 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                style={{
                  border: "1px solid rgba(247, 241, 223, 0.28)",
                  background: "#16242a",
                  color: "#f7f1df",
                }}
                onClick={onClose}
              >
                {"✕"}
              </button>
            </div>

            <div
              style={{
                display: "flex",
                flex: "1 1 auto",
                flexDirection: "column",
                minHeight: 0,
                gap: "12px",
                padding: "12px 16px 16px",
              }}
            >
              <CardBrowserToolbar
                ariaLabel="Pool viewer controls"
                className="pool-viewer-toolbar"
                values={values}
                onPatch={handlePatch}
                subtypeOptions={subtypeOptions}
                visibleCount={
                  source === "history"
                    ? (replayRecord?.packs.length ?? 0)
                    : filteredCards.length
                }
                totalCount={
                  source === "history"
                    ? (replayRecord?.packs.length ?? 0)
                    : baseCards.length
                }
                barExtras={sourceToggle}
              />

              {seedProvenance !== null ? (
                <div
                  data-pool-seed-source=""
                  style={{
                    fontSize: "0.78rem",
                    color: "#9fb0ac",
                    lineHeight: 1.5,
                  }}
                >
                  {"Seed card: "}
                  <span style={{ color: "#f4c453", fontWeight: 700 }}>
                    {seedProvenance.seedCardName}
                  </span>
                  {" — drawn at random, then grown to "}
                  <span style={{ color: "#8edbd1", fontWeight: 600 }}>
                    {`${String(seedProvenance.totalCopies)} copies`}
                  </span>
                  {` (${String(seedProvenance.distinctCardCount)} cards, ${String(
                    seedProvenance.doubledCardCount,
                  )} doubled) by ${
                    seedProvenanceVariantCopy(seedProvenance.variant)
                      .poolViewerAffinityBasis
                  } to the seed and to the cards already chosen.`}
                </div>
              ) : null}

              {tides4Provenance !== null ? (
                <Tides4Banner provenance={tides4Provenance} />
              ) : null}

              {source === "tides" && tides4Provenance !== null ? (
                <TideDeckNav
                  tides={tideList}
                  selectedTideId={selectedTideId}
                  onSelect={setSelectedTideId}
                />
              ) : null}

              {source === "tides" &&
              selectedTide !== null &&
              tides4Provenance !== null ? (
                <TideDeckCaption
                  tide={selectedTide}
                  provenance={tides4Provenance}
                />
              ) : null}

              {source === "deck" && replayRecord !== null ? (
                <div
                  data-pool-deck-source=""
                  style={{
                    fontSize: "0.78rem",
                    color: "#9fb0ac",
                    wordBreak: "break-all",
                  }}
                >
                  {"Record deck: "}
                  <span style={{ color: "#8edbd1", fontWeight: 600 }}>
                    {replayRecord.sourceFile}
                  </span>
                </div>
              ) : null}

              {source === "history" ? (
                replayRecord !== null && replayRecord.packs.length > 0 ? (
                  <ReplayPickHistory
                    record={replayRecord}
                    cardsById={cardsById}
                    onCardClick={setOverlayCard}
                  />
                ) : (
                  <div
                    className="flex flex-1 items-center justify-center text-sm"
                    style={{ color: "#9fb0ac" }}
                    data-pool-empty=""
                  >
                    {EMPTY_BASE_MESSAGES.history}
                  </div>
                )
              ) : filteredCards.length === 0 ? (
                <div
                  className="flex flex-1 items-center justify-center text-sm"
                  style={{ color: "#9fb0ac" }}
                  data-pool-empty=""
                >
                  {baseCards.length === 0
                    ? EMPTY_BASE_MESSAGES[source]
                    : "No cards match the current filters."}
                </div>
              ) : (
                <CardBrowserGrid
                  items={filteredCards}
                  size={values.size}
                  getKey={(card) => card.cardNumber}
                  getItemProps={(card) => ({
                    "data-pool-card-tile": "",
                    "data-pool-card-number": String(card.cardNumber),
                    draggable: onPoolCardDragStart !== undefined,
                    onDragStart: (event) => {
                      event.dataTransfer?.setData(
                        "text/plain",
                        String(card.cardNumber),
                      );
                      if (event.dataTransfer !== undefined) {
                        event.dataTransfer.effectAllowed = "copy";
                      }
                      onPoolCardDragStart?.(card);
                    },
                    onDragEnd: () => onPoolCardDragEnd?.(),
                    style: { position: "relative" },
                  })}
                  renderItem={(card) => {
                    const copies =
                      copiesByNumber.get(card.cardNumber) ?? null;
                    return (
                      <>
                        <BrowserCard
                          card={card}
                          size={values.size}
                          onClick={() => setOverlayCard(card)}
                        />
                        {copies !== null ? (
                          <div
                            data-pool-copy-badge=""
                            className="absolute top-1 right-1 rounded-full border border-cyan-200/60 bg-slate-950/90 px-2 py-0.5 text-xs font-bold text-cyan-100 shadow"
                          >
                            x{String(copies)}
                          </div>
                        ) : null}
                      </>
                    );
                  }}
                />
              )}
            </div>
          </div>
          <CardOverlay card={overlayCard} onClose={() => setOverlayCard(null)} />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/**
 * Pack-by-pack walkthrough of the replayed record's original picks. Each row is
 * one of the 30 served packs: the offered cards as chips with the drafter's
 * choice highlighted, and a header naming the chosen card(s). Chips that resolve
 * to a card in the database open the zoom overlay on click; unresolved names
 * (cards absent from the current set) render as inert labels.
 */
function ReplayPickHistory({
  record,
  cardsById,
  onCardClick,
}: {
  record: DraftRecord;
  cardsById: ReadonlyMap<string, CardData>;
  onCardClick: (card: CardData) => void;
}) {
  return (
    <div
      data-pool-pick-history=""
      style={{
        display: "flex",
        flex: "1 1 auto",
        flexDirection: "column",
        gap: "8px",
        minHeight: 0,
        overflowY: "auto",
      }}
    >
      <p style={{ margin: 0, fontSize: "0.82rem", color: "#9fb0ac" }}>
        {"Replaying record "}
        <strong style={{ color: "#8edbd1" }}>{record.id}</strong>
        {
          ". These are the original drafter's picks, pack by pack — the offered cards with the chosen one highlighted."
        }
      </p>
      {record.packs.map((pack, index) => {
        const packIds = record.packIds[index] ?? [];
        const pickIds = record.pickIds[index] ?? [];
        const pickedIds = new Set(pickIds.map((id) => id.toLowerCase()));
        // Display the chosen cards by their resolved current name (correct even
        // when two cards share a name), falling back to the record's stored name.
        const pickLabels = pickIds.map(
          (id, pickIndex) =>
            cardsById.get(id.toLowerCase())?.name ??
            record.picks[index]?.[pickIndex] ??
            id,
        );
        return (
          <div
            key={index}
            data-pool-pick-row={String(index + 1)}
            style={{
              borderRadius: "6px",
              border: "1px solid rgba(142, 219, 209, 0.16)",
              background: "rgba(22, 36, 42, 0.6)",
              padding: "8px 10px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                flexWrap: "wrap",
                gap: "8px",
                marginBottom: "6px",
              }}
            >
              <span
                style={{
                  fontWeight: 800,
                  fontSize: "0.78rem",
                  color: "#f7f1df",
                }}
              >
                {`Pick ${String(index + 1)}`}
              </span>
              <span style={{ fontSize: "0.72rem", color: "#9fb0ac" }}>
                {pickLabels.length > 0
                  ? `chose ${pickLabels.join(", ")}`
                  : "no pick recorded"}
              </span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
              {pack.map((name, cardIndex) => {
                const id = packIds[cardIndex];
                const card =
                  id !== undefined ? cardsById.get(id.toLowerCase()) : undefined;
                const picked =
                  id !== undefined && pickedIds.has(id.toLowerCase());
                // Prefer the resolved card's current name so a name collision
                // shows the actual offered card; fall back to the stored name.
                const label = card?.name ?? name;
                return (
                  <button
                    key={`${id ?? name}-${String(cardIndex)}`}
                    type="button"
                    data-pool-pick-card={picked ? "picked" : "offered"}
                    onClick={
                      card !== undefined ? () => onCardClick(card) : undefined
                    }
                    disabled={card === undefined}
                    style={{
                      borderRadius: "4px",
                      border: picked
                        ? "1px solid rgba(142, 219, 209, 0.7)"
                        : "1px solid rgba(247, 241, 223, 0.14)",
                      background: picked
                        ? "rgba(45, 138, 128, 0.4)"
                        : "rgba(16, 20, 23, 0.6)",
                      color: picked ? "#ffffff" : "#d9e1dd",
                      fontWeight: picked ? 800 : 500,
                      fontSize: "0.72rem",
                      padding: "2px 7px",
                      cursor: card !== undefined ? "pointer" : "default",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function buildRunPoolEntries(
  draftState: DraftState | null,
  cardDatabase: ReadonlyMap<number, CardData>,
): PoolCardEntry[] {
  if (draftState === null || draftState.mode !== "pool") {
    return [];
  }

  const entries: PoolCardEntry[] = [];
  for (const [cardNumberText, copies] of Object.entries(
    draftState.remainingCopiesByCard,
  )) {
    const cardNumber = Number(cardNumberText);
    const card = Number.isFinite(cardNumber)
      ? cardDatabase.get(cardNumber)
      : undefined;
    if (card === undefined || copies <= 0) {
      continue;
    }
    entries.push({ card, copies });
  }
  return entries;
}

/**
 * Resolve an ordered list of card numbers (such as the IDF3 starter decklist)
 * into pool entries, skipping any number with no matching card. Entries carry
 * no copy badge because these lists describe a deck, not a draftable multiset.
 */
function buildEntriesFromCardNumbers(
  cardNumbers: readonly number[],
  cardDatabase: ReadonlyMap<number, CardData>,
): PoolCardEntry[] {
  const entries: PoolCardEntry[] = [];
  for (const cardNumber of cardNumbers) {
    const card = cardDatabase.get(cardNumber);
    if (card === undefined) {
      continue;
    }
    entries.push({ card, copies: null });
  }
  return entries;
}

/**
 * Resolve a replay record's mainboard (the deck the original drafter eventually
 * built) from its stable card ids into pool entries, deduping on first
 * occurrence and counting copies so doubled cards carry an "x2" badge. Ids with
 * no matching card in the current set are skipped.
 */
function buildDeckEntries(
  mainboardIds: readonly string[],
  cardsById: ReadonlyMap<string, CardData>,
): PoolCardEntry[] {
  const order: number[] = [];
  const copiesByNumber = new Map<number, number>();
  const cardByNumber = new Map<number, CardData>();
  for (const id of mainboardIds) {
    const card = cardsById.get(id.toLowerCase());
    if (card === undefined) {
      continue;
    }
    if (!copiesByNumber.has(card.cardNumber)) {
      order.push(card.cardNumber);
      cardByNumber.set(card.cardNumber, card);
    }
    copiesByNumber.set(
      card.cardNumber,
      (copiesByNumber.get(card.cardNumber) ?? 0) + 1,
    );
  }
  return order.map((cardNumber) => ({
    // `order` only holds numbers inserted alongside their card, so both lookups
    // are guaranteed present.
    card: cardByNumber.get(cardNumber)!,
    copies: copiesByNumber.get(cardNumber)!,
  }));
}

/**
 * Resolve a Dreamcaller's signature card ids against the card database by stable
 * UUID, preserving authoring order and skipping ids with no matching card.
 * Signature cards are metadata, so entries carry no copy badge.
 */
function buildSignatureEntries(
  signatureCardIds: readonly string[],
  cardsById: ReadonlyMap<string, CardData>,
): PoolCardEntry[] {
  const entries: PoolCardEntry[] = [];
  for (const id of signatureCardIds) {
    const card = cardsById.get(id.toLowerCase());
    if (card === undefined) {
      continue;
    }
    entries.push({ card, copies: null });
  }
  return entries;
}

/**
 * Resolve one tide's decklist (card numbers) into pool entries. The copy badge
 * shows how many copies of each tide card landed in the run's draft pool, so a
 * card with no badge is one this tide carried but that did not make the cut.
 */
function buildTideEntries(
  tide: Tides4TideSummary | null,
  cardDatabase: ReadonlyMap<number, CardData>,
  poolCopiesByNumber: ReadonlyMap<number, number>,
): PoolCardEntry[] {
  if (tide === null) {
    return [];
  }
  const entries: PoolCardEntry[] = [];
  for (const cardNumber of tide.cardNumbers) {
    const card = cardDatabase.get(cardNumber);
    if (card === undefined) {
      continue;
    }
    const copies = poolCopiesByNumber.get(cardNumber) ?? 0;
    entries.push({ card, copies: copies > 0 ? copies : null });
  }
  return entries;
}

/**
 * One-paragraph summary of how the `tides4` pool was constructed: the starting
 * signature tide (or the borrowed archetype for a signatureless Dreamcaller),
 * the random theme-tide draw that gives the run its variety, and the deal rule.
 */
function Tides4Banner({
  provenance,
}: {
  provenance: Tides4ProvenanceSummary;
}) {
  const starterTide = provenance.tides.find(
    (tide) => tide.selection === "starter",
  );
  return (
    <div
      data-pool-tides-banner=""
      style={{ fontSize: "0.78rem", color: "#9fb0ac", lineHeight: 1.5 }}
    >
      {provenance.signatureless ? (
        <>
          {"This Dreamcaller has no signature, so its pool borrowed the "}
          <span style={{ color: "#f4c453", fontWeight: 700 }}>
            {provenance.borrowedArchetypeName ?? "a random"}
          </span>
          {" archetype this run: "}
        </>
      ) : (
        <>
          {"Built from tides — the "}
          <span style={{ color: "#34c759", fontWeight: 700 }}>
            {starterTide?.displayName ?? starterTide?.name ?? "signature"}
          </span>
          {" tide (always joined), "}
        </>
      )}
      {"drawing "}
      <span style={{ color: "#8edbd1", fontWeight: 600 }}>
        {`${String(provenance.facetDrawnCount)} of ${String(
          provenance.facetAvailableCount,
        )} theme tides`}
      </span>
      {" at random, then broad tides to fill — shuffled together and dealt to "}
      <span style={{ color: "#8edbd1", fontWeight: 600 }}>
        {`${String(provenance.dealSize)} cards`}
      </span>
      {`, at most ${String(provenance.cap)} copies each.`}
    </div>
  );
}

/**
 * The tide selector: one button per tide that took part in the run, in join
 * order, tagged by why it was joined. Selecting a tide shows its decklist in the
 * grid. Unjoined fill tides (the run filled up before reaching them) read dimmed.
 */
function TideDeckNav({
  tides,
  selectedTideId,
  onSelect,
}: {
  tides: readonly Tides4TideSummary[];
  selectedTideId: string | null;
  onSelect: (tideId: string) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Tide decks"
      data-pool-tide-nav=""
      style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}
    >
      {tides.map((tide) => {
        const meta = TIDE_SELECTION_META[tide.selection];
        const active = tide.id === selectedTideId;
        const button = (
          <button
            key={tide.id}
            type="button"
            data-pool-tide-button={tide.id}
            aria-pressed={active}
            onClick={() => onSelect(tide.id)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              borderRadius: "6px",
              border: active
                ? `1px solid ${meta.accent}`
                : "1px solid rgba(247, 241, 223, 0.16)",
              background: active ? "rgba(45, 138, 128, 0.22)" : "#16242a",
              color: tide.joined ? "#f7f1df" : "#8a9590",
              padding: "4px 9px",
              font: "inherit",
              fontSize: "0.74rem",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "999px",
                background: meta.accent,
                opacity: tide.joined ? 1 : 0.4,
              }}
            />
            {tide.displayName ?? tide.name}
            <span
              style={{
                fontSize: "0.64rem",
                fontWeight: 600,
                opacity: 0.7,
                letterSpacing: "0.02em",
              }}
            >
              {meta.tag}
            </span>
          </button>
        );
        if (tide.displayDescription == null) return button;
        return (
          <HoverPopover
            key={tide.id}
            style={{ display: "inline-flex" }}
            content={<TideTooltipContent tide={tide} />}
          >
            {button}
          </HoverPopover>
        );
      })}
    </div>
  );
}

/** Hover tooltip: the tide's thematic name and one-line player-facing blurb. */
function TideTooltipContent({ tide }: { tide: Tides4TideSummary }) {
  return (
    <span
      data-pool-tide-tooltip={tide.id}
      style={{
        display: "block",
        maxWidth: "260px",
        borderRadius: "8px",
        border: "1px solid rgba(255, 255, 255, 0.16)",
        background: "#000000",
        color: "#ffffff",
        padding: "8px 12px",
        fontSize: "0.74rem",
        lineHeight: 1.5,
        textAlign: "left",
        boxShadow: "0 12px 32px rgba(0, 0, 0, 0.55)",
      }}
    >
      <span style={{ fontWeight: 700 }}>{tide.displayName ?? tide.name}</span>
      {tide.displayDescription != null ? (
        <span style={{ display: "block", marginTop: "3px", opacity: 0.88 }}>
          {tide.displayDescription}
        </span>
      ) : null}
    </span>
  );
}

/** Why the selected tide was part of the run, and what it contributed. */
function TideDeckCaption({
  tide,
  provenance,
}: {
  tide: Tides4TideSummary;
  provenance: Tides4ProvenanceSummary;
}) {
  const reason = tideSelectionReason(tide, provenance);
  const contribution = tide.joined
    ? `Contributed ${String(tide.contributedCardCount)} ${
        tide.contributedCardCount === 1 ? "card" : "cards"
      } to your draft pool.`
    : "Not joined this run — the pool filled up before reaching it.";
  return (
    <div
      data-pool-tide-caption=""
      style={{ fontSize: "0.78rem", color: "#9fb0ac", lineHeight: 1.5 }}
    >
      <span style={{ color: "#f7f1df", fontWeight: 600 }}>{reason}</span>{" "}
      {contribution}{" "}
      <span style={{ opacity: 0.75 }}>
        {
          "Badges show how many copies of each card landed in your pool; an unbadged card did not make the cut."
        }
      </span>
    </div>
  );
}

/** Player-facing reason a tide was joined, by its selection role. */
function tideSelectionReason(
  tide: Tides4TideSummary,
  provenance: Tides4ProvenanceSummary,
): string {
  switch (tide.selection) {
    case "starter":
      return provenance.signatureless
        ? `Borrowed signature tide — this signatureless Dreamcaller leaned the ${
            provenance.borrowedArchetypeName ?? "borrowed"
          } archetype, and its signature is the pool's identity floor.`
        : "Your Dreamcaller's signature tide — the pool's identity floor, always joined.";
    case "facet-drawn":
      return `A theme tide drawn in this run's random subset (${String(
        provenance.facetDrawnCount,
      )} of ${String(
        provenance.facetAvailableCount,
      )}). Drawing a different few each run is what makes pools vary.`;
    case "facet-fill":
      return "An on-theme tide outside this run's draw, folded in only to top the pool up to full size.";
    case "neutral-fill":
      return "A broad, format-spanning tide folded in to top the pool up with generic cards.";
  }
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}
