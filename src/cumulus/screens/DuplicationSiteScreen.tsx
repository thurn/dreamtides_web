// DuplicationSiteScreen — Deacon Holt's Cumulus card-copying site.

import { useCallback, useState } from "react";
import type { GameCardModel } from "../components/card/CardView";
import { CardGalleryPanel } from "../components/card/CardGalleryPanel";
import type { ArtRef } from "../primitives/art";
import { token } from "../primitives/tokens";
import {
  GuideGallerySiteLayout,
  type GuideGalleryGuideView,
} from "./GuideGallerySiteLayout";

export type DuplicationGuideView = GuideGalleryGuideView;

export interface DuplicationCardView {
  /** Concrete deck-entry id; duplicate catalog cards remain independent choices. */
  entryId: string;
  /** The fully resolved card currently held in the deck. */
  model: GameCardModel;
}

export interface DuplicationSiteView {
  /** Stable site id used by the shared guide-gallery layout. */
  siteId: string;
  /** Current dreamscape scene art behind the site, if resolved. */
  scene: ArtRef | null;
  /** Deacon Holt's guide art and one stable line for this visit. */
  guide: DuplicationGuideView;
  /** Whether the persisted card-choice runtime is ready. */
  ready: boolean;
  /** Whether a card has already been duplicated during this visit. */
  alreadyAccepted: boolean;
  /** Whether this site offers the whole deck. */
  isEnhanced: boolean;
  /** Persisted duplication choices in offer order. */
  cards: readonly DuplicationCardView[];
}

export interface DuplicationSiteScreenProps {
  /** View-model rendered by the pure screen. */
  view: DuplicationSiteView;
  /** Leave the site without duplicating a card. */
  onClose: () => void;
  /** Duplicate the selected concrete deck entry. */
  onDuplicate: (entryId: string) => void;
}

export function DuplicationSiteScreen({
  view,
  onClose,
  onDuplicate,
}: DuplicationSiteScreenProps) {
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const locked = confirming || view.alreadyAccepted;

  const toggleSelection = useCallback(
    (entryId: string) => {
      if (locked) return;
      setSelectedEntryId((current) => (current === entryId ? null : entryId));
    },
    [locked],
  );

  const commitDuplicate = useCallback(() => {
    if (selectedEntryId === null || locked) return;
    setConfirming(true);
    onDuplicate(selectedEntryId);
  }, [locked, onDuplicate, selectedEntryId]);

  return (
    <GuideGallerySiteLayout
      siteId={view.siteId}
      scene={view.scene}
      guide={view.guide}
      desktopComposition={view.isEnhanced ? "split" : "showcase"}
      screenTestId="cumulus-duplication-site-screen"
      guideArtTestId="cumulus-duplication-guide-art"
      speechAnchorTestId="cumulus-duplication-speech-anchor"
      speechBubbleTestId="cumulus-duplication-speech-bubble"
      renderGallery={(layout) => {
        const desktop = layout === "desktop";
        const columnCount = view.isEnhanced ? (desktop ? 5 : 4) : 3;
        const columns = view.isEnhanced
          ? desktop
            ? "five"
            : "four"
          : "three";
        return (
          <section
            data-duplication-card-grid=""
            data-duplication-layout={layout}
            style={{
              position: "relative",
              zIndex: 10,
              minHeight: 0,
              height: "100%",
              maxHeight: "100%",
              width: desktop
                ? "100%"
                : `calc(100vw - (${token("--space-s")} * 2))`,
              boxSizing: "border-box",
              pointerEvents: "auto",
              alignSelf: desktop ? "stretch" : "start",
              justifySelf: desktop ? undefined : "center",
              display: desktop ? "grid" : undefined,
              alignItems: desktop ? "center" : undefined,
              justifyItems: desktop && !view.isEnhanced ? "end" : undefined,
            }}
          >
            <CardGalleryPanel
              title="Duplication"
              subtitle={
                view.ready
                  ? view.isEnhanced
                    ? "Choose any card to copy"
                    : "Choose a card to copy"
                  : "Gathering possibilities…"
              }
              footerActions={[
                {
                  label: desktop ? "Decline Offer" : "Decline",
                  disabled: locked,
                  onPress: onClose,
                  testId: "cumulus-duplication-decline",
                },
                {
                  label: confirming ? "Duplicating…" : "Duplicate",
                  variant: "accent",
                  disabled: selectedEntryId === null || locked,
                  onPress: commitDuplicate,
                  testId: "cumulus-duplication-confirm",
                },
              ]}
              cards={view.cards.map((card, index) => ({
                entryId: card.entryId,
                model: card.model,
                testId: `cumulus-duplication-card-${card.entryId}`,
                selected: selectedEntryId === card.entryId,
                stackedCopy: selectedEntryId === card.entryId,
                stackedCopyDirection:
                  (index + 1) % columnCount === 0 ? "left" : "right",
                disabled: locked,
                selectionColor: "accent",
              }))}
              emptyLabel={
                view.ready ? "No cards available to copy." : "Gathering possibilities…"
              }
              columns={columns}
              cardSize={view.isEnhanced ? "standard" : desktop ? "showcase" : "standard"}
              frame="floating"
              spacing="medium"
              widthMode={view.isEnhanced || !desktop ? "fill" : "content"}
              reserveStackedCopySpace
              testId="cumulus-duplication-card-gallery"
              onCardPress={toggleSelection}
            />
          </section>
        );
      }}
    />
  );
}
