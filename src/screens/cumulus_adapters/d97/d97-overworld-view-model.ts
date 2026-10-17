// The pure view-model builder for the D97 overworld HUD.

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
