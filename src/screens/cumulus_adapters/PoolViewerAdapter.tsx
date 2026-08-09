// Shared outer wiring for the Pool Viewer. Presentation and all deterministic
// mapping live in PoolViewerScreen and pool-viewer-view-model respectively.

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { logEvent } from "../../logging";
import type { CardData } from "../../types/cards";
import { PoolViewerScreen, type PoolViewerFilterView, type PoolViewerSourceId } from "../../cumulus/screens/PoolViewerScreen";
import { buildPoolViewerView, DEFAULT_POOL_VIEWER_FILTERS, type PoolViewerAdapterInput } from "./pool-viewer-view-model";

/** State/effect bridge used by both App and PlayableBattleScreen. */
export function PoolViewerAdapter({
  cardDatabase,
  draftState,
  isOpen,
  onClose,
  onPoolCardDragEnd,
  onPoolCardDragStart,
  poolVariant = null,
  resolvedPackage = null,
  tides4Provenance = null,
  title = "pool",
  variant = "overlay",
}: PoolViewerAdapterInput) {
  const [source, setSource] = useState<PoolViewerSourceId>("run");
  const [filters, setFilters] = useState<PoolViewerFilterView>(DEFAULT_POOL_VIEWER_FILTERS);
  const previousOpen = useRef(false);
  const view = useMemo(() => buildPoolViewerView({ cardDatabase, draftState, resolvedPackage, poolVariant, tides4Provenance, source, filters, title, frame: variant === "overlay" ? "fullScreen" : "floating" }), [cardDatabase, draftState, filters, poolVariant, resolvedPackage, source, tides4Provenance, title, variant]);

  useEffect(() => {
    const wasOpen = previousOpen.current;
    previousOpen.current = isOpen;
    if (isOpen && !wasOpen) logEvent("pool_viewer_opened", { source: view.source, variant, cardCount: view.totalCount });
  }, [isOpen, variant, view.source, view.totalCount]);

  const cardForEntry = useCallback((entryId: string): CardData | null => view.cards.find((card) => card.entryId === entryId)?.model.displaySnapshot ?? null, [view.cards]);
  const onCardPress = useCallback((entryId: string) => { const card = cardForEntry(entryId); if (card !== null) logEvent("card_preview", { cardNumber: card.cardNumber, cardId: card.id, sourceSurface: "pool_viewer" }); }, [cardForEntry]);
  const onDragStart = useCallback((entryId: string, event: DragEvent<HTMLDivElement>) => { const card = cardForEntry(entryId); if (card === null) return; event.dataTransfer?.setData("text/plain", card.id); if (event.dataTransfer !== undefined) event.dataTransfer.effectAllowed = "copy"; onPoolCardDragStart?.(card); }, [cardForEntry, onPoolCardDragStart]);
  const onFiltersChange = useCallback((patch: Partial<PoolViewerFilterView>) => setFilters((current) => ({ ...current, ...patch })), []);

  if (!isOpen) return null;
  return <PoolViewerScreen view={view} onClose={onClose} onSourceChange={setSource} onFiltersChange={onFiltersChange} onCardPress={onCardPress} onCardDragStart={onPoolCardDragStart === undefined ? undefined : onDragStart} onCardDragEnd={onPoolCardDragEnd === undefined ? undefined : () => onPoolCardDragEnd()} />;
}
