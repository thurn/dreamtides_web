import { JOURNEY_SITE_MESSAGES } from "../../runtime/journey-site-messages";
import { resolveArtRef, type ArtRef } from "../primitives/art";
import { Select } from "../components/controls/Select";
import type { CardSubtype } from "../../types/card-identity";
import { useState } from "react";
import type { DreamsignId, SiteId } from "../../types/identifiers";
import { Dreamsign, type DreamsignView } from "../components/hud/Dreamsign";
import { GlassPanel } from "../components/overlay/GlassPanel";
import { GlassButton } from "../components/controls/GlassButton";
import { token } from "../primitives/tokens";
import { useIsDesktop } from "../primitives/use-is-desktop";
import { menuTriggerClearance } from "../primitives/chrome-geometry";
import { JOURNEY_STATUS_BAR_FLOATING_PANEL_CLEARANCE } from "../components/hud/JourneyStatusBar";

export interface JourneyDreamsignView {
  readonly scene: ArtRef | null;
  readonly mode: "copy" | "offer";
  readonly sourceDreamsignId: DreamsignId;
  readonly heldIndex: number;
  readonly choiceIndex: number;
  readonly permissionSeq: number;
  readonly siteId: SiteId | null;
  readonly title: string;
  readonly instruction: string;
  readonly options: readonly { readonly heldIndex: number; readonly dreamsign: DreamsignView }[];
  readonly held: readonly { readonly heldIndex: number; readonly dreamsign: DreamsignView }[];
  readonly atCap: boolean;
  readonly canContinue: boolean;
}
export interface JourneyTypeRemapView extends Omit<JourneyDreamsignView, "mode"> {
  readonly mode: "typeRemap";
  readonly typeOptions: readonly CardSubtype[];
}
export interface JourneySubtypeView extends Omit<JourneyTypeRemapView, "mode"> {
  readonly mode: "subtype";
  readonly purpose: "deckSubtype" | "typeRemap";
}
export type JourneyDreamsignScreenView = JourneyDreamsignView | JourneyTypeRemapView | JourneySubtypeView;
export interface JourneyDreamsignScreenProps {
  readonly view: JourneyDreamsignScreenView;
  readonly onSubtype?: (subtype: CardSubtype) => void;
  readonly onTypeRemap?: (subtype: CardSubtype) => void;
  readonly onOffer: (dreamsignId: DreamsignId | null, purgeIndex?: number) => void;
  readonly onCopy: (heldIndex: number, expectedDreamsignId: DreamsignId) => void;
}
// The offer shelf's bounded width; the shared panel owns its material.
// The existing Revelation offer scale and replacement-dialog HUD scale.
const PANEL_WIDTH = 640;
const MOBILE_OFFER_SIZE = 120;
const DESKTOP_OFFER_SIZE = 154;
const REPLACEMENT_SIZE = 72;
/** Selection is tentative; every completion is an intent against a folded permission. */
export function JourneyDreamsignScreen({ view, onOffer, onCopy, onTypeRemap, onSubtype }: JourneyDreamsignScreenProps) {
  const desktop = useIsDesktop();
  const optionSize = desktop ? DESKTOP_OFFER_SIZE : MOBILE_OFFER_SIZE;
  const topClearance = menuTriggerClearance({ isDesktop: desktop, gap: token("--space-l") });
  const bottomClearance = JOURNEY_STATUS_BAR_FLOATING_PANEL_CLEARANCE;
  const permission = `${view.sourceDreamsignId}:${view.heldIndex}:${view.choiceIndex}:${view.permissionSeq}`;
  const [chosenType, setChosenType] = useState<{ permission: string; subtype: CardSubtype } | null>(null);
  const tentative = (view.mode === "typeRemap" || view.mode === "subtype") && chosenType?.permission === permission && view.typeOptions.includes(chosenType.subtype) ? chosenType.subtype : null;
  const [selected, setSelected] = useState<{ permission: string; id: DreamsignId } | null>(null);
  const incoming = view.options.find((option) => selected?.permission === permission && option.dreamsign.id === selected.id);
  const sceneUrl = view.scene === null ? null : resolveArtRef(view.scene);
  return <section data-testid="journey-dreamsign-screen" data-choice-mode={view.mode} data-source-dreamsign-id={view.sourceDreamsignId}
    style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: token("--bg-app"), padding: token("--space-l"), paddingTop: topClearance, paddingBottom: bottomClearance }}>
    {sceneUrl !== null && <img data-journey-dreamsign-scene="" src={sceneUrl} alt="" draggable={false} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />}
    <div style={{ position: "relative", width: `min(100%, ${String(PANEL_WIDTH)}px)`, display: "flex", flexDirection: "column", minHeight: 0, maxHeight: `calc(100dvh - ${topClearance} - ${bottomClearance})` }}>
      <GlassPanel title={view.title}>
        <div data-journey-dreamsign-scroll="" style={{ display: "flex", flexDirection: "column", minHeight: 0, overflowY: "auto", gap: token("--space-l"), padding: token("--space-2xl") }}>
        <p style={{ margin: 0, color: token("--text-on-glass-muted"), font: token("--t-body") }}>{view.instruction}</p>
        {(view.mode === "typeRemap" || view.mode === "subtype") && <div data-testid="journey-type-remap-picker" data-selected-subtype={tentative ?? undefined} style={{ display: "flex", flexDirection: "column", gap: token("--space-l") }}>
          <Select<CardSubtype | ""> options={view.typeOptions.map(subtype => ({ value: subtype, label: subtype }))} value={tentative ?? ""} placeholder={JOURNEY_SITE_MESSAGES.typeRemapPlaceholder} ariaLabel={JOURNEY_SITE_MESSAGES.typeRemapLabel} onChange={subtype => { if (subtype !== "") setChosenType({ permission, subtype }); }} />
          <GlassButton placement="onGlass" variant="accent" label={JOURNEY_SITE_MESSAGES.typeRemapConfirm} testId="journey-type-remap-confirm" disabled={tentative === null} onPress={() => { if (tentative !== null) (view.mode === "subtype" ? onSubtype : onTypeRemap)?.(tentative); }} />
        </div>}
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: token("--space-l") }}>
          {view.options.map(({ heldIndex, dreamsign }, ordinal) => <div key={`${dreamsign.id}:${heldIndex}:${ordinal}`} data-dreamsign-choice-index={heldIndex} style={{ width: optionSize, height: optionSize, flex: "0 0 auto" }}>
            <Dreamsign dreamsign={dreamsign} variant="revelation" action={view.mode === "copy" ? { kind: "copy", heldIndex } : undefined} selected={view.mode === "offer" && view.atCap ? incoming?.dreamsign.id === dreamsign.id : undefined} onPress={() => view.mode === "copy" ? onCopy(heldIndex, dreamsign.id) : view.atCap ? setSelected({ permission, id: dreamsign.id }) : onOffer(dreamsign.id)} />
          </div>)}
        </div>
        {view.mode === "offer" && view.atCap && <div data-testid={incoming === undefined ? undefined : "journey-dreamsign-replacement"} style={{ position: incoming === undefined ? "absolute" : undefined, display: "flex", flexDirection: "column", gap: token("--space-m") }}>
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: token("--space-m") }}>
            {incoming !== undefined && <div style={{ width: REPLACEMENT_SIZE, height: REPLACEMENT_SIZE, flex: "0 0 auto" }}>
              <Dreamsign dreamsign={incoming.dreamsign} variant="hud" />
            </div>}
            <p role="status" aria-live="polite" aria-atomic="true" data-selected-dreamsign-id={incoming?.dreamsign.id} style={{ margin: 0, color: token("--text-on-glass"), font: token("--t-body") }}>{incoming === undefined ? null : JOURNEY_SITE_MESSAGES.dreamsignSelectedGain(incoming.dreamsign.name)}</p>
          </div>
          {incoming !== undefined && <>
          <p style={{ margin: 0, color: token("--text-on-glass-muted"), font: token("--t-body") }}>{JOURNEY_SITE_MESSAGES.dreamsignReplaceInstruction}</p>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: token("--space-m") }}>
            {view.held.map(({ heldIndex, dreamsign }) => <div key={`${dreamsign.id}:${heldIndex}`} data-replacement-held-index={heldIndex} style={{ width: REPLACEMENT_SIZE, height: REPLACEMENT_SIZE, flex: "0 0 auto" }}>
              <Dreamsign dreamsign={dreamsign} variant="hud" action={{ kind: "replace", heldIndex }} onPress={() => onOffer(incoming.dreamsign.id, heldIndex)} />
            </div>)}
          </div>
          </>}
        </div>}
        {view.canContinue && <GlassButton placement="onGlass" label={view.options.length === 0 ? JOURNEY_SITE_MESSAGES.continue : JOURNEY_SITE_MESSAGES.dreamsignKeep} testId="journey-dreamsign-continue" onPress={() => onOffer(null)} />}
        </div>
      </GlassPanel>
    </div>
  </section>;
}
