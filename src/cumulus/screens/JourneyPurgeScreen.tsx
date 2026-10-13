import { useState } from "react";
import type { DeckEntryId, DreamsignId, SiteId } from "../../types/identifiers";
import type { ArtRef } from "../primitives/art";
import { CardPickerPanel } from "../components/card/CardPickerPanel";
import { SiteLayout, type SiteLayoutGuideView } from "../components/layout/SiteLayout";
import type { DeckCardView } from "./MobileDeckViewer";

export interface JourneyPurgeView {
  readonly siteId: SiteId;
  readonly dreamsignId: DreamsignId;
  readonly heldIndex: number;
  readonly choiceIndex: number;
  readonly scene: ArtRef | null;
  readonly guide: SiteLayoutGuideView;
  readonly cards: readonly DeckCardView[];
  readonly minCount: number;
  readonly maxCount: number;
  readonly collectAmount: number | null;
  readonly title: string;
  readonly instruction: string;
}

/** Only the tentative card selection is local; accepting advances the folded permission. */
export function JourneyPurgeScreen({ view, onPurge, onCollect }: {
  readonly view: JourneyPurgeView;
  readonly onPurge: (entryIds: readonly DeckEntryId[]) => void;
  readonly onCollect: () => void;
}) {
  const [selected, setSelected] = useState<readonly DeckEntryId[]>([]);
  const valid = selected.filter((id) => view.cards.some((card) => card.entryId === id));
  const canPurge = valid.length >= view.minCount && valid.length <= view.maxCount;
  return <div data-testid="journey-purge-screen" data-dreamsign-id={view.dreamsignId}
    data-choice-index={view.choiceIndex} style={{ position: "fixed", inset: 0 }}>
    <SiteLayout siteId={view.siteId} scene={view.scene} moteTint="warm"
      guide={{ ...view.guide, presence: "speaking" }} composition="content-led-gallery">
      <section style={{ minHeight: 0, height: "100%", width: "100%" }}>
        <CardPickerPanel presentation="overlay" title={view.title} subtitle={view.instruction}
          cards={view.cards.map((card) => ({ entryId: card.entryId, model: card.model,
            testId: `journey-purge-card-${card.entryId}`, selection: valid.includes(card.entryId) ? "danger" : undefined,
            disabled: !valid.includes(card.entryId) && valid.length >= view.maxCount }))}
          rightAccessory={{ kind: "glassButton", button: {
            label: valid.length === 0 && view.minCount === 0 ? "Continue" : `Purge ${String(valid.length)}`,
            variant: valid.length === 0 ? "default" : "danger", disabled: !canPurge,
            testId: "journey-purge-confirm", onPress: () => onPurge(valid) } }}
          footerActions={view.collectAmount === null ? undefined : [{ label: `Collect ${String(view.collectAmount)} Essence`,
            testId: "journey-purge-collect", onPress: onCollect }]}
          onCardPress={(id) => setSelected((current) => current.includes(id)
            ? current.filter((candidate) => candidate !== id)
            : valid.length < view.maxCount ? [...valid, id] : current)} />
      </section>
    </SiteLayout>
  </div>;
}
