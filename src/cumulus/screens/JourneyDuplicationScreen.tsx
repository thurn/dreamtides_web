import { useState } from "react";
import type { DeckEntryId, DreamsignId, SiteId } from "../../types/identifiers";
import type { ArtRef } from "../primitives/art";
import { CardPickerPanel } from "../components/card/CardPickerPanel";
import { SiteLayout, type SiteLayoutGuideView } from "../components/layout/SiteLayout";
import type { DeckCardView } from "./MobileDeckViewer";

export interface JourneyDuplicationView {
  readonly siteId: SiteId;
  readonly dreamsignId: DreamsignId;
  readonly heldIndex: number;
  readonly choiceIndex: number;
  readonly earnedSeq: number;
  readonly scene: ArtRef | null;
  readonly guide: SiteLayoutGuideView;
  readonly cards: readonly DeckCardView[];
  readonly title: string;
  readonly instruction: string;
  readonly continueLabel: string;
  readonly confirmLabel: string;
}

/** Tentative selection stays local; only confirming resolves the earned permission. */
export function JourneyDuplicationScreen({ view, onConfirm }: {
  readonly view: JourneyDuplicationView;
  readonly onConfirm: (entryId: DeckEntryId | null) => void;
}) {
  const [selected, setSelected] = useState<DeckEntryId | null>(null);
  const valid = view.cards.some((card) => card.entryId === selected) ? selected : null;
  return <div data-testid="journey-duplication-screen" data-dreamsign-id={view.dreamsignId}
    data-choice-index={view.choiceIndex} style={{ position: "fixed", inset: 0 }}>
    <SiteLayout siteId={view.siteId} scene={view.scene} moteTint="warm"
      guide={{ ...view.guide, presence: "portrait-only" }} composition="content-led-gallery">
      <section style={{ minHeight: 0, height: "100%", width: "100%" }}>
        <CardPickerPanel presentation="overlay" title={view.title} subtitle={view.instruction}
          cards={view.cards.map((card) => ({ entryId: card.entryId, model: card.model,
            testId: `journey-duplication-card-${card.entryId}`, selection: valid === card.entryId ? "copied" : undefined }))}
          rightAccessory={{ kind: "glassButton", button: { label: valid === null ? view.continueLabel : view.confirmLabel,
            testId: "journey-duplication-confirm", onPress: () => onConfirm(valid) } }}
          onCardPress={(id) => setSelected((current) => current === id ? null : id)} />
      </section>
    </SiteLayout>
  </div>;
}
