import type { ComponentType } from "react";
import {
  EntityRevealCoordinatorDocs,
  EntityRevealCoordinatorPreview,
} from "./entity-reveal-coordinator";
import {
  JourneyScreenHostChromeDocs,
  JourneyScreenHostChromePreview,
} from "./journey-screen-host-chrome";

/**
 * A cross-component behavioral contract documented by Cumulus. UI systems own
 * coordination, lifecycle, placement, or other behavior that cannot be
 * explained accurately as the props of one React component.
 */
export interface CumulusUISystem {
  /** Hash-route id under `#/systems/`. */
  readonly id: string;
  /** Human-readable system name. */
  readonly title: string;
  /** Short overview and page-header description. */
  readonly blurb: string;
  /** Compact overview specimen that introduces the system's flow. */
  readonly Preview: ComponentType;
  /** Complete contract page, including live behavioral examples. */
  readonly Docs: ComponentType;
}

export const CUMULUS_UI_SYSTEMS = [
  {
    id: "entity-reveals",
    title: "Entity Reveals",
    blurb:
      "Give cards, icons, portraits, terms, and other game objects a consistent way to show readable details. Render a reveal-enabled Cumulus component with its semantic data; hover, keyboard, touch, placement, accessibility, and dismissal behavior come with it.",
    Preview: EntityRevealCoordinatorPreview,
    Docs: EntityRevealCoordinatorDocs,
  },
  {
    id: "journey-screen-host-chrome",
    title: "Journey Screen Host & Chrome",
    blurb:
      "The application-host contract by which ScreenRouter combines screenFor and siteDispositionFor with CumulusJourneyChrome. It coordinates screen adapters, HUD and utility chrome, presence, tutorial guidance, route transitions, error containment, and explicit exceptions.",
    Preview: JourneyScreenHostChromePreview,
    Docs: JourneyScreenHostChromeDocs,
  },
] as const satisfies readonly CumulusUISystem[];

/** Every registered UI-system route id, kept literal for component backlinks. */
export type CumulusUISystemId = (typeof CUMULUS_UI_SYSTEMS)[number]["id"];

export function getUISystem(id: string): CumulusUISystem | undefined {
  return CUMULUS_UI_SYSTEMS.find((system) => system.id === id);
}
