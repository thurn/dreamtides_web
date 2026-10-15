import { useState } from "react";
import type { DeckEntryId, DreamsignId } from "../../types/identifiers";
import { CardPickerPanel } from "../components/card/CardPickerPanel";
import { GlassPanel } from "../components/overlay/GlassPanel";
import { JOURNEY_STATUS_BAR_FLOATING_PANEL_CLEARANCE } from "../components/hud/JourneyStatusBar";
import { resolveArtRef, type ArtRef } from "../primitives/art";
import { menuTriggerClearance } from "../primitives/chrome-geometry";
import { token } from "../primitives/tokens";
import { useIsDesktop } from "../primitives/use-is-desktop";
import type { DeckCardView } from "./MobileDeckViewer";

export interface JourneyOpeningHandView {
  readonly dreamsignId: DreamsignId;
  readonly heldIndex: number;
  readonly choiceIndex: number;
  readonly permissionSeq: number;
  readonly scene: ArtRef | null;
  readonly cards: readonly DeckCardView[];
  readonly title: string;
  readonly instruction: string;
  readonly confirmLabel: string;
  readonly continueLabel: string;
  readonly emptyLabel: string;
}

// Bound empty-state prose while the shared panel owns its material and natural height.
const EMPTY_PANEL_WIDTH = 640;

/** Tentative physical selection is local; confirmation resolves the folded permission. */
export function JourneyOpeningHandScreen({ view, onConfirm }: {
  readonly view: JourneyOpeningHandView;
  readonly onConfirm: (entryId: DeckEntryId | null) => void;
}) {
  const desktop = useIsDesktop();
  const top = menuTriggerClearance({ isDesktop: desktop, gap: token("--space-l") });
  const bottom = desktop ? `calc(${JOURNEY_STATUS_BAR_FLOATING_PANEL_CLEARANCE} + ${token("--space-2xl")})`
    : JOURNEY_STATUS_BAR_FLOATING_PANEL_CLEARANCE;
  const permission = `${view.dreamsignId}:${view.heldIndex}:${view.choiceIndex}:${view.permissionSeq}`;
  const [selection, setSelection] = useState<{ readonly permission: string; readonly entryId: DeckEntryId } | null>(null);
  const selected = selection?.permission === permission && view.cards.some((card) => card.entryId === selection.entryId)
    ? selection.entryId : null;
  const empty = view.cards.length === 0;
  const scene = view.scene === null ? null : resolveArtRef(view.scene);
  return <section data-testid="journey-opening-hand-screen" data-dreamsign-id={view.dreamsignId}
    data-choice-index={view.choiceIndex} data-selected-entry-id={selected ?? undefined}
    style={{ position: "fixed", inset: 0, display: "flex", background: token("--bg-app"), padding: token("--space-l"),
      paddingTop: top, paddingBottom: bottom }}>
    {scene !== null && <img src={scene} alt="" draggable={false}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />}
    <div style={{ position: "relative", width: "100%", minHeight: 0,
      ...(empty ? { display: "flex", alignItems: "center", justifyContent: "center" } : {}) }}>
      {empty ? <div style={{ width: `min(100%, ${String(EMPTY_PANEL_WIDTH)}px)`, display: "flex",
        flexDirection: "column", minHeight: 0, maxHeight: "100%" }}>
        <GlassPanel title={view.title} subtitle={view.instruction} testId="journey-opening-hand-empty-panel"
          rightAccessory={{ kind: "glassButton", button: { label: view.continueLabel, variant: "accent",
            testId: "journey-opening-hand-confirm", onPress: () => onConfirm(null) } }}>
          <div data-testid="journey-opening-hand-empty-body"
            style={{ minHeight: 0, overflowY: "auto", padding: token("--space-2xl") }}>
            <p style={{ margin: 0, color: token("--text-on-glass"), font: token("--t-body") }}>{view.emptyLabel}</p>
          </div>
        </GlassPanel>
      </div> : <CardPickerPanel presentation="overlay" title={view.title} subtitle={view.instruction} emptyLabel={view.emptyLabel}
        cards={view.cards.map((card) => ({ entryId: card.entryId, model: card.model,
          testId: `journey-opening-hand-card-${card.entryId}`, selection: selected === card.entryId ? "selected" : undefined }))}
        rightAccessory={{ kind: "glassButton", button: { label: empty ? view.continueLabel : view.confirmLabel,
          variant: "accent", disabled: !empty && selected === null, testId: "journey-opening-hand-confirm",
          onPress: () => { if (empty || selected !== null) onConfirm(selected); } } }}
        onCardPress={(entryId) => setSelection({ permission, entryId })} />}
    </div>
  </section>;
}
