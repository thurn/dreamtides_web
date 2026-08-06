// The single wiring point for the /cumulus per-component full-screen mockups.
//
// Each `src/cumulus/docs/mockups/<id>.tsx` composes its component into a realistic
// full-bleed (100vw×100vh, responsive) scene using real content — curated card
// UUIDs, real dreamscape ids, production art served from `public/`. This module
// maps a component's route id to its mockup component so CumulusApp can dispatch
// `#/<id>/mockup` and ComponentPage can show the "View full-screen mockup" link
// only when a mockup exists.
//
// To add a mockup: create `mockups/<id>.tsx` exporting a full-screen component,
// then add one line to {@link MOCKUPS}. Ids absent from the map simply have no
// mockup (ComponentPage hides the link; CumulusApp shows a graceful note). Several
// ids may share one scene (the Dream Atlas map serves `atlas-map`, `atlas-node`,
// and `atlas-edge`).

import type { ComponentType } from "react";
import { AtlasMapMockup } from "./atlas-map";
import { DreamsignMockup } from "./dreamsign";
import { GameCardMockup } from "./game-card";
import { GlassButtonMockup } from "./glass-button";
import { InfoCardMockup } from "./info-card";
import { MotesMockup } from "./motes";
import { PressableMockup } from "./pressable";
import { JourneyStatusBarMockup } from "./journey-status-bar";
import { ResourceChipMockup } from "./resource-chip";
import { RulesTextMockup } from "./rules-text";
import { SegmentedControlMockup } from "./segmented-control";
import { SiteNodeMockup } from "./site-node";

/**
 * Route id → full-screen mockup component. The single place new mockups get
 * wired: add a file under `mockups/` and one entry here.
 */
export const MOCKUPS: Record<string, ComponentType> = {
  "game-card": GameCardMockup,
  "journey-status-bar": JourneyStatusBarMockup,
  "rules-text": RulesTextMockup,
  "atlas-map": AtlasMapMockup,
  "atlas-node": AtlasMapMockup,
  "atlas-edge": AtlasMapMockup,
  "site-node": SiteNodeMockup,
  dreamsign: DreamsignMockup,
  "info-card": InfoCardMockup,
  pressable: PressableMockup,
  "resource-chip": ResourceChipMockup,
  "glass-button": GlassButtonMockup,
  "segmented-control": SegmentedControlMockup,
  motes: MotesMockup,
};

/** True when a full-screen mockup is registered for the given route id. */
export function hasMockup(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(MOCKUPS, id);
}

/** The mockup component for a route id, or `undefined` when none is registered. */
export function getMockup(id: string): ComponentType | undefined {
  return MOCKUPS[id];
}
