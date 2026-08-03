// PurgeSiteScreen — the Cumulus rendering of Master Takeshi's purge site.

import { useCallback, useMemo, useState } from "react";
import type { DeckCardView } from "./MobileDeckViewer";
import { CardGalleryPanel } from "../components/card/CardGalleryPanel";
import type { GlassButtonWidthReservation } from "../components/controls/GlassButton";
import type { ArtRef } from "../primitives/art";
import {
  GuideGallerySiteLayout,
  type GuideGalleryGuideView,
} from "./GuideGallerySiteLayout";
import { GUIDE_GALLERY_MOBILE_PANEL_WIDTH } from "./guide-gallery-geometry";

export type PurgeGuideView = GuideGalleryGuideView;

export interface PurgeCardView extends DeckCardView {
  /** Whether this card purges without spending essence. */
  purgeCostKind: "paid" | "free";
}

export interface PurgeSiteView {
  /** Stable site id used by the shared character-gallery layout. */
  siteId: string;
  /** Current dreamscape scene art behind the site, if resolved. */
  scene: ArtRef | null;
  /** Master Takeshi's guide art and line. */
  guide: PurgeGuideView;
  /** Deck cards in acquisition order, already resolved by concrete entry id. */
  cards: readonly PurgeCardView[];
  /** Visit cost by paid-card count. Index 0 is always 0. */
  visitCosts: readonly number[];
  /** Maximum paid cards selectable with current essence and visit cap. */
  maxPaidSelections: number;
}

export interface PurgeSiteScreenProps {
  /** View-model rendered by the pure screen. */
  view: PurgeSiteView;
  /** Leave the site without purging. */
  onClose: () => void;
  /** Commit selected deck entries at the displayed total cost. */
  onPurge: (entryIds: readonly string[], cost: number) => void;
}

export function PurgeSiteScreen({
  view,
  onClose,
  onPurge,
}: PurgeSiteScreenProps) {
  const [selectedEntryIds, setSelectedEntryIds] = useState<readonly string[]>(
    [],
  );
  const freeEntryIds = useMemo(
    () =>
      new Set(
        view.cards
          .filter((card) => card.purgeCostKind === "free")
          .map((card) => card.entryId),
      ),
    [view.cards],
  );
  const selectedPaidCount = selectedEntryIds.filter(
    (entryId) => !freeEntryIds.has(entryId),
  ).length;
  const totalCost = view.visitCosts[selectedPaidCount] ?? 0;
  const canSelectPaid = selectedPaidCount < view.maxPaidSelections;
  const selectedCount = selectedEntryIds.length;
  const actionWidthReservations = useMemo(
    () =>
      purgeActionWidthReservations(
        freeEntryIds.size,
        view.maxPaidSelections,
        view.visitCosts,
      ),
    [freeEntryIds, view.maxPaidSelections, view.visitCosts],
  );

  const toggleSelection = useCallback(
    (entryId: string) => {
      setSelectedEntryIds((prev) => {
        const selected = prev.includes(entryId);
        if (selected) {
          return prev.filter((candidate) => candidate !== entryId);
        }
        if (!freeEntryIds.has(entryId) && !canSelectPaid) {
          return prev;
        }
        return [...prev, entryId];
      });
    },
    [canSelectPaid, freeEntryIds],
  );

  const commitPurge = useCallback(() => {
    if (selectedEntryIds.length === 0) return;
    onPurge(selectedEntryIds, totalCost);
  }, [onPurge, selectedEntryIds, totalCost]);

  return (
    <GuideGallerySiteLayout
      siteId={view.siteId}
      scene={view.scene}
      guide={view.guide}
      screenTestId="cumulus-purge-site-screen"
      guideArtTestId="cumulus-purge-guide-art"
      speechAnchorTestId="cumulus-purge-speech-anchor"
      speechBubbleTestId="cumulus-purge-speech-bubble"
      renderGallery={(layout) => (
        <PurgeGallery
          layout={layout}
          cards={view.cards}
          selectedEntryIds={selectedEntryIds}
          selectedCount={selectedCount}
          canSelectPaid={canSelectPaid}
          totalCost={totalCost}
          actionWidthReservations={actionWidthReservations}
          onClose={onClose}
          onPurge={commitPurge}
          onToggle={toggleSelection}
        />
      )}
    />
  );
}

function PurgeGallery({
  layout,
  cards,
  selectedEntryIds,
  selectedCount,
  canSelectPaid,
  totalCost,
  actionWidthReservations,
  onClose,
  onPurge,
  onToggle,
}: {
  readonly layout: "mobile" | "desktop";
  readonly cards: readonly PurgeCardView[];
  readonly selectedEntryIds: readonly string[];
  readonly selectedCount: number;
  readonly canSelectPaid: boolean;
  readonly totalCost: number;
  readonly actionWidthReservations: readonly GlassButtonWidthReservation[];
  readonly onClose: () => void;
  readonly onPurge: () => void;
  readonly onToggle: (entryId: string) => void;
}) {
  const desktop = layout === "desktop";
  return (
    <section
      data-purge-card-grid=""
      data-purge-layout={layout}
      style={{
        position: "relative",
        zIndex: 10,
        minHeight: 0,
        height: "100%",
        maxHeight: "100%",
        width: desktop ? "100%" : GUIDE_GALLERY_MOBILE_PANEL_WIDTH,
        boxSizing: "border-box",
        pointerEvents: "auto",
        alignSelf: desktop ? "stretch" : "start",
        justifySelf: desktop ? undefined : "center",
        display: desktop ? "grid" : undefined,
        alignItems: desktop ? "center" : undefined,
      }}
    >
      <CardGalleryPanel
        title="Purge Cards"
        subtitle="Choose any number of cards to remove from your deck"
        rightAccessory={{
          kind: "glassButton",
          label:
            selectedCount === 0
              ? "Decline"
              : `Purge ${String(selectedCount)}`,
          essenceCost: selectedCount === 0 ? null : totalCost,
          widthReservations: actionWidthReservations,
          variant: selectedCount === 0 ? "default" : "danger",
          onPress: selectedCount === 0 ? onClose : onPurge,
          testId: "cumulus-purge-header-action",
        }}
        cards={cards.map((card) => {
          const selected = selectedEntryIds.includes(card.entryId);
          const disabled =
            !selected && card.purgeCostKind === "paid" && !canSelectPaid;
          return {
            entryId: card.entryId,
            model: card.model,
            testId: `cumulus-purge-card-${card.entryId}`,
            selected,
            disabled,
            selectionColor: "danger",
            emphasis: card.purgeCostKind === "free" ? "danger" : undefined,
          };
        })}
        columns={desktop ? "five" : "four"}
        frame="floating"
        spacing={desktop ? "regular" : "medium"}
        testId="cumulus-purge-card-gallery"
        onCardPress={onToggle}
      />
    </section>
  );
}

/** Every action label, paired with the widest reachable essence cost. */
export function purgeActionWidthReservations(
  freeCardCount: number,
  maxPaidSelections: number,
  visitCosts: readonly number[],
): readonly GlassButtonWidthReservation[] {
  const maxSelectionCount = freeCardCount + maxPaidSelections;
  const maxCost = Math.max(0, ...visitCosts.slice(0, maxPaidSelections + 1));
  return [
    { label: "Decline", essenceCost: null },
    ...Array.from({ length: maxSelectionCount }, (_, index) => ({
      label: `Purge ${String(index + 1)}`,
      essenceCost: maxCost,
    })),
  ];
}
