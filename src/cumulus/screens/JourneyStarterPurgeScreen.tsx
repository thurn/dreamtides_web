import { useState } from "react";
import type { DeckEntryId, DreamsignId } from "../../types/identifiers";
import { CardPickerPanel } from "../components/card/CardPickerPanel";
import { resolveArtRef, type ArtRef } from "../primitives/art";
import { token } from "../primitives/tokens";
import { useIsDesktop } from "../primitives/use-is-desktop";
import { menuTriggerClearance } from "../primitives/chrome-geometry";
import { JOURNEY_STATUS_BAR_FLOATING_PANEL_CLEARANCE } from "../components/hud/JourneyStatusBar";
import type { DeckCardView } from "./MobileDeckViewer";
export interface JourneyStarterPurgeView {
  readonly dreamsignId: DreamsignId;
  readonly heldIndex: number;
  readonly choiceIndex: number;
  readonly permissionSeq: number;
  readonly scene: ArtRef | null;
  readonly cards: readonly DeckCardView[];
  readonly maxCount: number;
  readonly title: string;
  readonly instruction: string;
  readonly continueLabel: string;
  readonly confirmLabel: (count: number) => string;
}
/** The folded permission owns progress; only its tentative selection is local. */
export function JourneyStarterPurgeScreen({ view, onConfirm }: {
  readonly view: JourneyStarterPurgeView;
  readonly onConfirm: (ids: readonly DeckEntryId[]) => void;
}) {
  const desktop = useIsDesktop();
  const top = menuTriggerClearance({ isDesktop: desktop, gap: token("--space-l") });
  const bottom = JOURNEY_STATUS_BAR_FLOATING_PANEL_CLEARANCE;
  const permission = `${view.dreamsignId}:${view.heldIndex}:${view.choiceIndex}:${view.permissionSeq}`;
  const [selection, setSelection] = useState<{ permission: string; ids: readonly DeckEntryId[] }>({ permission, ids: [] });
  const selected = selection.permission === permission ? selection.ids.filter((id) => view.cards.some((card) => card.entryId === id)) : [];
  const scene = view.scene === null ? null : resolveArtRef(view.scene);
  return <section data-testid="journey-starter-purge-screen" data-dreamsign-id={view.dreamsignId} data-choice-index={view.choiceIndex}
    style={{ position: "fixed", inset: 0, display: "flex", background: token("--bg-app"), padding: token("--space-l"), paddingTop: top, paddingBottom: bottom }}>
    {scene !== null && <img src={scene} alt="" draggable={false} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />}
    <div style={{ position: "relative", width: "100%", minHeight: 0 }}>
      <CardPickerPanel presentation="overlay" title={view.title} subtitle={view.instruction}
        cards={view.cards.map((card) => ({ entryId: card.entryId, model: card.model,
          testId: `journey-starter-purge-card-${card.entryId}`, selection: selected.includes(card.entryId) ? "danger" : undefined,
          disabled: !selected.includes(card.entryId) && selected.length >= view.maxCount }))}
        rightAccessory={{ kind: "glassButton", button: { label: selected.length === 0 ? view.continueLabel : view.confirmLabel(selected.length),
          variant: selected.length === 0 ? "default" : "danger", testId: "journey-starter-purge-confirm", onPress: () => onConfirm(selected) } }}
        onCardPress={(id) => setSelection({ permission, ids: selected.includes(id) ? selected.filter((old) => old !== id) : selected.length < view.maxCount ? [...selected, id] : selected })} />
    </div>
  </section>;
}
