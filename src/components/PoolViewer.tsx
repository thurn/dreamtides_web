import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { CSSProperties } from "react";
import type { CardData } from "../types/cards";
import type { ResolvedDreamcallerPackage } from "../types/content";
import type { DraftState } from "../types/draft";
import { poolStrategyFor } from "../draft/pool/registry";
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

type PoolViewerSource = "run" | "catalog" | "idf3" | "signature";
type PoolViewerVariant = "overlay" | "floating";

const SOURCE_LABELS: Record<PoolViewerSource, string> = {
  run: "Run Pool",
  catalog: "All Cards",
  idf3: "IDF3 Decklist",
  signature: "Signature Cards",
};

const EMPTY_BASE_MESSAGES: Record<PoolViewerSource, string> = {
  run: "No run pool cards are available.",
  catalog: "No cards match the current filters.",
  idf3: "No IDF3 starting decklist is available for this run.",
  signature: "This Dreamcaller has no signature cards.",
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
 */
export function PoolViewer({
  cardDatabase,
  draftState,
  isOpen,
  onClose,
  onPoolCardDragEnd,
  onPoolCardDragStart,
  poolVariant = null,
  resolvedPackage = null,
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
  resolvedPackage?: ResolvedDreamcallerPackage | null;
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

  const availableSources = useMemo<PoolViewerSource[]>(() => {
    const sources: PoolViewerSource[] = ["run", "catalog"];
    if (idf3Entries.length > 0) {
      sources.push("idf3");
    }
    if (signatureEntries.length > 0) {
      sources.push("signature");
    }
    return sources;
  }, [idf3Entries.length, signatureEntries.length]);

  // Fall back to the always-present run pool if the selected source loses its
  // backing data (for example when a new run drops the signature cards).
  useEffect(() => {
    if (!availableSources.includes(source)) {
      setSource("run");
    }
  }, [availableSources, source]);

  const baseEntries = useMemo<PoolCardEntry[]>(() => {
    switch (source) {
      case "run":
        return buildRunPoolEntries(draftState, cardDatabase);
      case "idf3":
        return idf3Entries;
      case "signature":
        return signatureEntries;
      case "catalog":
      default:
        return Array.from(cardDatabase.values()).map((card) => ({
          card,
          copies: null,
        }));
    }
  }, [cardDatabase, draftState, idf3Entries, signatureEntries, source]);

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
                {poolVariant ? (
                  <span
                    title={poolStrategyFor(poolVariant).description}
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
                    {`algo: ${poolVariant}`}
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
                visibleCount={filteredCards.length}
                totalCount={baseCards.length}
                barExtras={sourceToggle}
              />

              {filteredCards.length === 0 ? (
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
