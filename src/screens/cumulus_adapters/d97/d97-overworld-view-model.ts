// The pure view-model builders for the D97 overworld: its HUD, its door
// veils, beaten opponents drawn without badges, and which panel is open (view
// state: interactions open panels, and closing one returns to the world).

import type { D97DreamTopology } from "../../../content/d97/dreams/schema";
import type { VeilVariant } from "../../../d97/overworld/dream-veil";
import type { InteractionPanel } from "../../../d97/overworld/interactions";
import type { OverworldOccupants } from "../../../d97/overworld/occupants";
import type { D97Run } from "../../../rules/d97/d97-state";
import type { DreamAnchorId } from "../../../types/identifiers";
import type {
  D97OverworldControlId,
  D97OverworldHudView,
} from "../../../cumulus/screens/d97/D97OverworldScreen";

export interface D97OverworldHudInput {
  /** The act the run is in, from 1. */
  readonly act: number;
  /** Challenger tier by act, act 1 first (the tunables catalog). */
  readonly actTiers: readonly number[];
  readonly essence: number | null;
  /** Controls whose surfaces exist. */
  readonly enabled: ReadonlySet<D97OverworldControlId>;
}

const CONTROLS: readonly { readonly id: D97OverworldControlId; readonly label: string }[] = [
  { id: "deck", label: "Deck" },
  { id: "quests", label: "Quests" },
  { id: "menu", label: "Menu" },
];

/** The HUD view: the act and its tier, Essence, and the control bar. */
export function buildD97OverworldHudView(input: D97OverworldHudInput): D97OverworldHudView {
  const tier = input.actTiers[Math.min(input.act, input.actTiers.length) - 1];
  return {
    actLabel: `Act ${String(input.act)}`,
    tierLabel: tier === undefined ? "" : `Tier ${String(tier)}`,
    essence: input.essence,
    controls: CONTROLS.map((control) => ({
      ...control,
      enabled: input.enabled.has(control.id),
    })),
  };
}

/**
 * Each door's veil in a dream: the exit door shows the act-exit veil; every
 * other door is unexplored, the canvas default.
 */
export function buildD97DoorVeils(dream: D97DreamTopology): ReadonlyMap<DreamAnchorId, VeilVariant> {
  return new Map<DreamAnchorId, VeilVariant>([[dream.exitDoorAnchorId, "actExit"]]);
}

/** The panel open over the overworld: an interaction's, or a HUD control's. */
export type D97OverworldPanel = InteractionPanel | { readonly kind: "menu" } | { readonly kind: "quests" };

export type D97OverworldPanelAction = { readonly type: "open"; readonly panel: D97OverworldPanel } | { readonly type: "close" };

/** Opening a panel replaces the open one; closing returns to the world. */
export function overworldPanelReducer(_panel: D97OverworldPanel | null, action: D97OverworldPanelAction): D97OverworldPanel | null {
  return action.type === "open" ? action.panel : null;
}

/** The anchors of the run's beaten opponents, joined as stable text (a memo dependency). */
export function beatenOpponentsText(encounters: D97Run["encounters"]): string {
  return Object.values(encounters)
    .filter((encounter) => encounter?.beaten === true)
    .map((encounter) => encounter?.anchorId)
    .join(",");
}

/** Beaten opponents (by `beatenText`) stay as ordinary characters: no badge, desaturated. */
export function withBeatenOpponents(placed: OverworldOccupants, beatenText: string): OverworldOccupants {
  const beaten = new Set(beatenText.split(","));
  return new Map([...placed].map(([anchorId, occupant]) => [anchorId, beaten.has(anchorId) ? { ...occupant, badge: null, beaten: true as const } : occupant]));
}
