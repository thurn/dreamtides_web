// Shared outer wiring for the Pool Viewer. Presentation and all deterministic
// mapping live in PoolViewerScreen and pool-viewer-view-model respectively.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { logEvent } from "../../logging";
import type { CardData } from "../../types/cards";
import { PoolViewerScreen, type PoolViewerFilterView, type PoolViewerSourceId } from "../../cumulus/screens/PoolViewerScreen";
import { buildPoolViewerView, DEFAULT_POOL_VIEWER_FILTERS, type PoolViewerAdapterInput } from "./pool-viewer-view-model";
import type { DeckEntryId } from "../../types/identifiers";

/** State/effect bridge for the Pool Viewer overlay. */
export function PoolViewerAdapter({
  cardDatabase,
  draftState,
  isOpen,
  onClose,
  poolVariant = null,
  resolvedPackage = null,
  tides4Provenance = null,
  title = "pool",
}: PoolViewerAdapterInput) {
  const [source, setSource] = useState<PoolViewerSourceId>("run");
  const [filters, setFilters] = useState<PoolViewerFilterView>(
    DEFAULT_POOL_VIEWER_FILTERS,
  );
  const previousOpen = useRef(false);
  const view = useMemo(
    () =>
      buildPoolViewerView({
        cardDatabase,
        draftState,
        resolvedPackage,
        poolVariant,
        tides4Provenance,
        source,
        filters,
        title,
        frame: "fullScreen",
      }),
    [
      cardDatabase,
      draftState,
      filters,
      poolVariant,
      resolvedPackage,
      source,
      tides4Provenance,
      title,
    ],
  );

  useEffect(() => {
    const wasOpen = previousOpen.current;
    previousOpen.current = isOpen;
    if (isOpen && !wasOpen)
      logEvent("pool_viewer_opened", {
        source: view.source,
        variant: "overlay",
        cardCount: view.totalCount,
      });
  }, [isOpen, view.source, view.totalCount]);

  const cardForEntry = useCallback(
    (entryId: DeckEntryId): CardData | null =>
      view.cards.find((card) => card.entryId === entryId)?.model
        .displaySnapshot ?? null,
    [view.cards],
  );
  const onCardPress = useCallback(
    (entryId: DeckEntryId) => {
      const card = cardForEntry(entryId);
      if (card !== null)
        logEvent("card_preview", {
          cardNumber: card.cardNumber,
          cardId: card.id,
          sourceSurface: "pool_viewer",
        });
    },
    [cardForEntry],
  );
  const onFiltersChange = useCallback(
    (patch: Partial<PoolViewerFilterView>) =>
      setFilters((current) => ({ ...current, ...patch })),
    [],
  );

  if (!isOpen) return null;
  return (
    <PoolViewerScreen
      view={view}
      onClose={onClose}
      onSourceChange={setSource}
      onFiltersChange={onFiltersChange}
      onCardPress={onCardPress}
    />
  );
}
