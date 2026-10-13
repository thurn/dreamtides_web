import { useState } from "react";
import type { DeckEntryId, DreamsignId, SiteId } from "../../types/identifiers";
import type { ArtRef } from "../primitives/art";
import { CardPickerPanel } from "../components/card/CardPickerPanel";
import { SiteLayout, type SiteLayoutGuideView } from "../components/layout/SiteLayout";
import type { DeckCardView } from "./MobileDeckViewer";

export interface JourneyTransfigurationView {
  readonly siteId: SiteId;
  readonly dreamsignId: DreamsignId;
  readonly heldIndex: number;
  readonly choiceIndex: number;
  readonly scene: ArtRef | null;
  readonly guide: SiteLayoutGuideView;
  readonly cards: readonly DeckCardView[];
  readonly maxCount: number;
  readonly title: string;
  readonly instruction: string;
  readonly continueLabel: string;
  readonly confirmLabel: (count: number) => string;
}

/** Tentative selection is local; confirming advances the saved permission. */
export function JourneyTransfigurationScreen({ view, onConfirm }: {
  readonly view: JourneyTransfigurationView;
  readonly onConfirm: (entryIds: readonly DeckEntryId[]) => void;
}) {
  const [selected, setSelected] = useState<readonly DeckEntryId[]>([]);
  const valid = selected.filter((id) => view.cards.some((card) => card.entryId === id));
  return <div data-testid="journey-transfiguration-screen" data-dreamsign-id={view.dreamsignId}
    data-choice-index={view.choiceIndex} style={{ position: "fixed", inset: 0 }}>
    <SiteLayout siteId={view.siteId} scene={view.scene} moteTint="warm"
      guide={{ ...view.guide, presence: "portrait-only" }} composition="content-led-gallery">
      <section style={{ minHeight: 0, height: "100%", width: "100%" }}>
        <CardPickerPanel presentation="overlay" title={view.title} subtitle={view.instruction}
          cards={view.cards.map((card) => ({ entryId: card.entryId, model: card.model,
            testId: `journey-transfiguration-card-${card.entryId}`, selection: valid.includes(card.entryId) ? "selected" : undefined,
            disabled: !valid.includes(card.entryId) && valid.length >= view.maxCount }))}
          rightAccessory={{ kind: "glassButton", button: { label: valid.length === 0 ? view.continueLabel : view.confirmLabel(valid.length),
            testId: "journey-transfiguration-confirm", onPress: () => onConfirm(valid) } }}
          onCardPress={(id) => setSelected((current) => current.includes(id) ? current.filter((candidate) => candidate !== id)
            : valid.length < view.maxCount ? [...valid, id] : current)} />
      </section>
    </SiteLayout>
  </div>;
}
