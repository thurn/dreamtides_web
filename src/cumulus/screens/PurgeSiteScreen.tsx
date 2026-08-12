// PurgeSiteScreen — the Cumulus rendering of Master Takeshi's purge site.

import { tx } from "@trox/runtime";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { DeckCardView } from "./MobileDeckViewer";
import { CardPickerPanel } from "../components/card/CardPickerPanel";
import type { GlassButtonWidthReservation } from "../components/controls/GlassButton";
import type { ArtRef } from "../primitives/art";
import {
  GuideGallerySiteLayout,
  type GuideGalleryGuideView,
} from "./GuideGallerySiteLayout";
import { GUIDE_GALLERY_MOBILE_PANEL_WIDTH } from "./guide-gallery-geometry";
import type { FirstVisitSiteTutorialView } from "./site-tutorial-view";
import { useDelayedTutorialSpeechBubbleVisibility } from "./use-delayed-tutorial-speech-bubble-visibility";
import { ViewportTutorialDialogue } from "./ViewportTutorialDialogue";
import { formatAuthoredTemplate } from "../../data/authored-template";

export type PurgeGuideView = GuideGalleryGuideView;

export type PurgeActionWidthLabel =
  | { readonly kind: "decline" }
  | { readonly kind: "purge"; readonly count: number };

export interface PurgeActionWidthReservation {
  readonly label: PurgeActionWidthLabel;
  readonly essenceCost: number | null;
}

export interface PurgeCardView extends DeckCardView {
  /** Whether this card purges without spending essence. */
  purgeCostKind: "paid" | "free";
}

export interface PurgeSiteView {
  presentation: Extract<
    import("../../types/sites-data").SitePresentation,
    { kind: "purge" }
  >;
  /** Stable site id used by the shared character-gallery layout. */
  siteId: string;
  /** Current dreamscape scene art behind the site, if resolved. */
  scene: ArtRef | null;
  /** Master Takeshi's guide art and line. */
  guide: PurgeGuideView;
  /** Mira guidance shown throughout the first Purge site visit. */
  tutorial?: FirstVisitSiteTutorialView;
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
  /** Reports when delayed first-visit guidance becomes visible. */
  onTutorialShown?: (tutorial: FirstVisitSiteTutorialView) => void;
}

export function PurgeSiteScreen({
  view,
  onClose,
  onPurge,
  onTutorialShown,
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
      ).map((reservation) => ({
        ...(reservation.label.kind === "decline"
          ? { label: tx(
                "Decline",
                "Compact command that declines the current site interaction without applying it.",
              ) }
          : { authoredLabel: formatAuthoredTemplate(view.presentation.purgeAction, {
                count: reservation.label.count,
              }) }),
        essenceCost: reservation.essenceCost,
      })),
    [
      freeEntryIds,
      view.maxPaidSelections,
      view.presentation.purgeAction,
      view.visitCosts,
    ],
  );
  const tutorialVisible = useDelayedTutorialSpeechBubbleVisibility(
    view.tutorial?.id ?? view.tutorial?.model.text,
    view.tutorial === undefined ? undefined : (view.tutorial.delaySeconds ?? 0),
  );
  useEffect(() => {
    if (tutorialVisible && view.tutorial !== undefined) {
      onTutorialShown?.(view.tutorial);
    }
  }, [onTutorialShown, tutorialVisible, view.tutorial]);

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
          presentation={view.presentation}
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
    >
      {tutorialVisible && view.tutorial !== undefined && (
        <ViewportTutorialDialogue
          view={{
            id: view.tutorial.id ?? view.tutorial.model.text,
            dialogue: view.tutorial.model,
            horizontalOffset: view.tutorial.horizontalOffset,
            verticalOffset: view.tutorial.verticalOffset,
            bubbleWidth: view.tutorial.bubbleWidth,
          }}
          visible
          kind="site"
        />
      )}
    </GuideGallerySiteLayout>
  );
}

function PurgeGallery({
  layout,
  presentation,
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
  readonly presentation: PurgeSiteView["presentation"];
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
      <CardPickerPanel
        authoredTitle={presentation.title}
        authoredSubtitle={presentation.instruction}
        rightAccessory={{
          kind: "glassButton",
          button: {
            ...(selectedCount === 0
              ? { label: tx(
                    "Decline",
                    "Compact command that declines the current site interaction without applying it.",
                  ) }
              : { authoredLabel: formatAuthoredTemplate(presentation.purgeAction, {
                    count: selectedCount,
                  }) }),
            essenceCost: selectedCount === 0 ? null : totalCost,
            widthReservations: actionWidthReservations,
            variant: selectedCount === 0 ? "default" : "danger",
            onPress: selectedCount === 0 ? onClose : onPurge,
            testId: "cumulus-purge-header-action",
          },
        }}
        cards={cards.map((card) => {
          const selected = selectedEntryIds.includes(card.entryId);
          const disabled =
            !selected && card.purgeCostKind === "paid" && !canSelectPaid;
          return {
            entryId: card.entryId,
            model: card.model,
            testId: `cumulus-purge-card-${card.entryId}`,
            selection: selected ? "danger" : undefined,
            disabled,
            emphasis: card.purgeCostKind === "free" ? "danger" : undefined,
          };
        })}
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
): readonly PurgeActionWidthReservation[] {
  const maxSelectionCount = freeCardCount + maxPaidSelections;
  const maxCost = Math.max(0, ...visitCosts.slice(0, maxPaidSelections + 1));
  return [
    { label: { kind: "decline" }, essenceCost: null },
    ...Array.from({ length: maxSelectionCount }, (_, index) => ({
      label: { kind: "purge" as const, count: index + 1 },
      essenceCost: maxCost,
    })),
  ];
}
