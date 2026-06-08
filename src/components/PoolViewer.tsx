import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { CSSProperties } from "react";
import type { CardData } from "../types/cards";
import type {
  ResolvedDreamcallerPackage,
  SeedProvenanceSummary,
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

type PoolViewerSource =
  | "run"
  | "catalog"
  | "idf3"
  | "signature"
  | "deck"
  | "history";
type PoolViewerVariant = "overlay" | "floating";

const SOURCE_LABELS: Record<PoolViewerSource, string> = {
  run: "Run Pool",
  catalog: "All Cards",
  idf3: "IDF3 Decklist",
  signature: "Signature Cards",
  deck: "Record Deck",
  history: "Pick History",
};

const EMPTY_BASE_MESSAGES: Record<PoolViewerSource, string> = {
  run: "No run pool cards are available.",
  catalog: "No cards match the current filters.",
  idf3: "No IDF3 starting decklist is available for this run.",
  signature: "This Dreamcaller has no signature cards.",
  deck: "The replay record has no resolvable deck cards.",
  history: "The replay record has no pick history.",
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
  title?: string;
  variant?: PoolViewerVariant;
}) {
  const [source, setSource] = useState<PoolViewerSource>("run");
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

  // Resolve card NAMES (how draft records store cards) to the CardData the grid
  // renders. First occurrence of a name wins, matching the rest of the viewer.
  const cardsByName = useMemo(() => {
    const byName = new Map<string, CardData>();
    for (const card of cardDatabase.values()) {
      if (!byName.has(card.name)) {
        byName.set(card.name, card);
      }
    }
    return byName;
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
        resolvedPackage?.dreamcaller.signatureCards ?? [],
        cardDatabase,
      ),
    [cardDatabase, resolvedPackage],
  );

  // The deck the original drafter eventually built, resolved from the record's
  // mainboard. Copies are counted so a doubled card shows an "x2" badge.
  const deckEntries = useMemo<PoolCardEntry[]>(
    () => buildDeckEntries(replayRecord?.mainboard ?? [], cardsByName),
    [cardsByName, replayRecord],
  );

  const availableSources = useMemo<PoolViewerSource[]>(() => {
    if (isReplay) {
      const sources: PoolViewerSource[] = ["deck", "history", "catalog"];
      if (signatureEntries.length > 0) {
        sources.push("signature");
      }
      return sources;
    }
    const sources: PoolViewerSource[] = ["run", "catalog"];
    if (idf3Entries.length > 0) {
      sources.push("idf3");
    }
    if (signatureEntries.length > 0) {
      sources.push("signature");
    }
    return sources;
  }, [idf3Entries.length, isReplay, signatureEntries.length]);

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
  }, [cardDatabase, deckEntries, draftState, idf3Entries, signatureEntries, source]);

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
                    cardsByName={cardsByName}
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
  cardsByName,
  onCardClick,
}: {
  record: DraftRecord;
  cardsByName: ReadonlyMap<string, CardData>;
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
        const picks = record.picks[index] ?? [];
        const pickedNames = new Set(picks);
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
                {picks.length > 0
                  ? `chose ${picks.join(", ")}`
                  : "no pick recorded"}
              </span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
              {pack.map((name, cardIndex) => {
                const picked = pickedNames.has(name);
                const card = cardsByName.get(name);
                return (
                  <button
                    key={`${name}-${String(cardIndex)}`}
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
                    {name}
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
 * built) from card names into pool entries, deduping on first occurrence and
 * counting copies so doubled cards carry an "x2" badge. Names with no matching
 * card in the current set are skipped.
 */
function buildDeckEntries(
  mainboard: readonly string[],
  cardsByName: ReadonlyMap<string, CardData>,
): PoolCardEntry[] {
  const order: number[] = [];
  const copiesByNumber = new Map<number, number>();
  const cardByNumber = new Map<number, CardData>();
  for (const name of mainboard) {
    const card = cardsByName.get(name);
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
 * Resolve a Dreamcaller's signature card names against the card database by
 * name, preserving authoring order and skipping names with no matching card.
 * Signature cards are metadata, so entries carry no copy badge.
 */
function buildSignatureEntries(
  signatureCards: readonly string[],
  cardDatabase: ReadonlyMap<number, CardData>,
): PoolCardEntry[] {
  const cardsByName = new Map<string, CardData>();
  for (const card of cardDatabase.values()) {
    if (!cardsByName.has(card.name)) {
      cardsByName.set(card.name, card);
    }
  }

  const entries: PoolCardEntry[] = [];
  for (const name of signatureCards) {
    const card = cardsByName.get(name);
    if (card === undefined) {
      continue;
    }
    entries.push({ card, copies: null });
  }
  return entries;
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}
