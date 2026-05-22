import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { CardData } from "../types/cards";
import type { DraftState } from "../types/draft";
import { CardDisplay } from "./CardDisplay";
import { CardHoverPreview } from "./CardHoverPreview";
import { CardOverlay } from "./CardOverlay";
import {
  CARD_HOVER_PREVIEW_DELAY_MS,
  CARD_HOVER_PREVIEW_WIDTH_PX,
  HoverPopover,
} from "./HoverPopover";

type PoolViewerSource = "run" | "catalog";
type PoolViewerCostFilter = "all" | "0" | "1" | "2" | "3" | "4" | "5+" | "x";
type PoolViewerTypeFilter = "all" | "characters" | "events";
type PoolViewerVariant = "overlay" | "floating";
type FloatingPosition = { x: number; y: number };
type FloatingDragState = { offsetX: number; offsetY: number } | null;

interface PoolCardEntry {
  card: CardData;
  copies: number | null;
}

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
  const [query, setQuery] = useState("");
  const [costFilter, setCostFilter] = useState<PoolViewerCostFilter>("all");
  const [typeFilter, setTypeFilter] = useState<PoolViewerTypeFilter>("all");
  const [subtypeFilter, setSubtypeFilter] = useState("");
  const [overlayCard, setOverlayCard] = useState<CardData | null>(null);
  const [floatingPosition, setFloatingPosition] = useState<FloatingPosition | null>(null);
  const [floatingDrag, setFloatingDrag] = useState<FloatingDragState>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setOverlayCard(null);
      setFloatingDrag(null);
      return;
    }
    searchInputRef.current?.focus();
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
    if (typeFilter !== "characters") {
      setSubtypeFilter("");
    }
  }, [typeFilter]);

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
        y: clamp(event.clientY - drag.offsetY, 8, window.innerHeight - height - 8),
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

  const entries = useMemo<PoolCardEntry[]>(() => {
    const values = source === "run"
      ? buildRunPoolEntries(draftState, cardDatabase)
      : Array.from(cardDatabase.values()).map((card) => ({ card, copies: null }));
    return values.sort((left, right) => left.card.name.localeCompare(right.card.name));
  }, [cardDatabase, draftState, source]);

  const subtypeOptions = useMemo(
    () => Array.from(new Set(
      entries
        .map((entry) => entry.card)
        .filter((card) => card.cardType === "Character" && card.subtype.trim() !== "")
        .map((card) => card.subtype),
    )).sort((left, right) => left.localeCompare(right)),
    [entries],
  );

  const filteredEntries = useMemo(() => entries.filter((entry) => {
    const card = entry.card;
    if (query.trim() !== "" && !card.name.toLowerCase().includes(query.trim().toLowerCase())) {
      return false;
    }
    if (!matchesCostFilter(card, costFilter)) {
      return false;
    }
    if (typeFilter === "characters" && card.cardType !== "Character") {
      return false;
    }
    if (typeFilter === "events" && card.cardType !== "Event") {
      return false;
    }
    if (subtypeFilter !== "" && (card.cardType !== "Character" || card.subtype !== subtypeFilter)) {
      return false;
    }
    return true;
  }), [costFilter, entries, query, subtypeFilter, typeFilter]);

  const handlePanelPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (variant !== "floating" || event.target instanceof HTMLElement &&
      event.target.closest("button, input, select, textarea, [data-pool-card-tile]") !== null) {
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
  }, [variant]);

  const wrapperClass = variant === "floating"
    ? "pointer-events-none fixed inset-0 z-[58]"
    : "fixed inset-0 z-[60] flex flex-col bg-slate-950/90";
  const panelClass = variant === "floating"
    ? "pointer-events-auto fixed flex max-h-[min(76vh,720px)] w-[min(720px,calc(100vw-24px))] flex-col overflow-hidden rounded-lg border border-cyan-400/30 bg-slate-950/95 shadow-2xl"
    : "flex min-h-0 flex-1 flex-col";
  const panelStyle = variant === "floating"
    ? {
        left: `${String(floatingPosition?.x ?? 24)}px`,
        top: `${String(floatingPosition?.y ?? 24)}px`,
      }
    : undefined;

  return (
    <AnimatePresence>
      {isOpen ? (
        <motion.div
          key={`pool-viewer-${variant}`}
          className={wrapperClass}
          data-pool-viewer={variant}
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
              className="flex cursor-default flex-wrap items-center justify-between gap-3 border-b border-cyan-400/20 bg-slate-900/80 px-4 py-3"
              onPointerDown={handlePanelPointerDown}
            >
              <div>
                <h2 className="text-lg font-semibold text-slate-100">{title}</h2>
                <div className="text-xs uppercase text-slate-400">
                  {String(filteredEntries.length)} / {String(entries.length)} cards
                </div>
              </div>
              <button
                type="button"
                aria-label="Close pool viewer"
                className="flex h-10 w-10 items-center justify-center rounded-md border border-slate-600 bg-slate-800 text-slate-100 hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                onClick={onClose}
              >
                {"\u2715"}
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-700 bg-slate-900/70 px-4 py-3">
              <div className="flex items-center gap-1">
                {(["run", "catalog"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    data-pool-source={value}
                    className={`min-h-9 rounded-md border px-3 text-xs font-semibold ${source === value ? "border-cyan-300 bg-cyan-300/20 text-cyan-100" : "border-slate-600 bg-slate-800 text-slate-300"}`}
                    onClick={() => setSource(value)}
                  >
                    {value === "run" ? "Run Pool" : "All Cards"}
                  </button>
                ))}
              </div>
              <input
                ref={searchInputRef}
                type="search"
                data-pool-search=""
                className="min-h-9 min-w-[180px] flex-1 rounded-md border border-slate-600 bg-slate-950 px-3 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                placeholder="Search by name..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <div className="flex flex-wrap items-center gap-1">
                {(["all", "0", "1", "2", "3", "4", "5+", "x"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    data-pool-cost={value}
                    className={`min-h-8 rounded-md border px-2 text-xs ${costFilter === value ? "border-amber-300 bg-amber-300/20 text-amber-100" : "border-slate-600 bg-slate-800 text-slate-300"}`}
                    onClick={() => setCostFilter(value)}
                  >
                    {value === "all" ? "All" : value.toUpperCase()}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1">
                {(["all", "characters", "events"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    data-pool-type={value}
                    className={`min-h-8 rounded-md border px-2 text-xs ${typeFilter === value ? "border-fuchsia-300 bg-fuchsia-300/20 text-fuchsia-100" : "border-slate-600 bg-slate-800 text-slate-300"}`}
                    onClick={() => setTypeFilter(value)}
                  >
                    {formatTypeFilter(value)}
                  </button>
                ))}
              </div>
              <select
                data-pool-subtype=""
                className="min-h-9 rounded-md border border-slate-600 bg-slate-950 px-2 text-sm text-slate-100 disabled:opacity-40"
                disabled={typeFilter !== "characters" || subtypeOptions.length === 0}
                value={subtypeFilter}
                onChange={(event) => setSubtypeFilter(event.target.value)}
              >
                <option value="">All subtypes</option>
                {subtypeOptions.map((subtype) => (
                  <option key={subtype} value={subtype}>{subtype}</option>
                ))}
              </select>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {filteredEntries.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-slate-400" data-pool-empty="">
                  {source === "run" && entries.length === 0
                    ? "No run pool cards are available."
                    : "No cards match the current filters."}
                </div>
              ) : (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-3 md:grid-cols-[repeat(auto-fill,minmax(150px,1fr))]">
                  {filteredEntries.map(({ card, copies }) => {
                    const tile = (
                      <div
                        data-pool-card-tile=""
                        data-pool-card-number={String(card.cardNumber)}
                        className="relative"
                        draggable={onPoolCardDragStart !== undefined}
                        onDragStart={(event) => {
                          event.dataTransfer?.setData("text/plain", String(card.cardNumber));
                          if (event.dataTransfer !== undefined) {
                            event.dataTransfer.effectAllowed = "copy";
                          }
                          onPoolCardDragStart?.(card);
                        }}
                        onDragEnd={() => onPoolCardDragEnd?.()}
                      >
                        <CardDisplay
                          card={card}
                          onClick={() => setOverlayCard(card)}
                          className="h-full w-full"
                        />
                        {copies !== null ? (
                          <div
                            data-pool-copy-badge=""
                            className="absolute top-1 right-1 rounded-full border border-cyan-200/60 bg-slate-950/90 px-2 py-0.5 text-xs font-bold text-cyan-100 shadow"
                          >
                            x{String(copies)}
                          </div>
                        ) : null}
                      </div>
                    );
                    return (
                      <HoverPopover
                        key={card.cardNumber}
                        content={({ side, anchorRect }) => (
                          <CardHoverPreview
                            card={card}
                            testId={`pool-card-preview-${String(card.cardNumber)}`}
                            widthPx={CARD_HOVER_PREVIEW_WIDTH_PX}
                            popoverSide={side}
                            anchorRect={anchorRect}
                          />
                        )}
                        delayMs={CARD_HOVER_PREVIEW_DELAY_MS}
                        maxWidthPx={null}
                        triggerAs="div"
                      >
                        {tile}
                      </HoverPopover>
                    );
                  })}
                </div>
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
  for (const [cardNumberText, copies] of Object.entries(draftState.remainingCopiesByCard)) {
    const cardNumber = Number(cardNumberText);
    const card = Number.isFinite(cardNumber) ? cardDatabase.get(cardNumber) : undefined;
    if (card === undefined || copies <= 0) {
      continue;
    }
    entries.push({ card, copies });
  }
  return entries;
}

function matchesCostFilter(card: CardData, filter: PoolViewerCostFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "x":
      return card.energyCost === null;
    case "5+":
      return card.energyCost !== null && card.energyCost >= 5;
    default:
      return card.energyCost === Number(filter);
  }
}

function formatTypeFilter(filter: PoolViewerTypeFilter): string {
  switch (filter) {
    case "all":
      return "All";
    case "characters":
      return "Characters";
    case "events":
      return "Events";
  }
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}
