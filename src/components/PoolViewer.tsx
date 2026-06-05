import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { CSSProperties } from "react";
import type { CardData } from "../types/cards";
import type { DraftState } from "../types/draft";
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

type PoolViewerSource = "run" | "catalog";
type PoolViewerVariant = "overlay" | "floating";
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
 * `card-browser` module, and layers in pool-specific affordances: a run-pool vs.
 * full-catalog source toggle, remaining-copy badges, drag-to-deck support, and a
 * click-to-zoom card overlay. It renders as a full-screen `overlay` or a
 * draggable `floating` panel.
 */
export function PoolViewer({
  cardDatabase,
  draftState,
  isOpen,
  onClose,
  onPoolCardDragEnd,
  onPoolCardDragStart,
  title = "Pool Viewer",
  variant = "overlay",
}: {
  cardDatabase: ReadonlyMap<number, CardData>;
  draftState: DraftState | null;
  isOpen: boolean;
  onClose: () => void;
  onPoolCardDragEnd?: () => void;
  onPoolCardDragStart?: (card: CardData) => void;
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

  const baseEntries = useMemo<PoolCardEntry[]>(
    () =>
      source === "run"
        ? buildRunPoolEntries(draftState, cardDatabase)
        : Array.from(cardDatabase.values()).map((card) => ({
            card,
            copies: null,
          })),
    [cardDatabase, draftState, source],
  );

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
      {(["run", "catalog"] as const).map((value) => (
        <button
          key={value}
          type="button"
          data-pool-source={value}
          aria-pressed={source === value}
          style={sourceButtonStyle(source === value)}
          onClick={() => setSource(value)}
        >
          {value === "run" ? "Run Pool" : "All Cards"}
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
              <h2 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 800 }}>
                {title}
              </h2>
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
                  {source === "run" && baseCards.length === 0
                    ? "No run pool cards are available."
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
  if (draftState === null) {
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

function clamp(value: number, min: number, max: number): number {
  if (max < min) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}
