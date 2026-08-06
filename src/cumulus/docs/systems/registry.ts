import type { ComponentType } from "react";
import {
  EntityRevealCoordinatorDocs,
  EntityRevealCoordinatorPreview,
} from "./entity-reveal-coordinator";

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
    title: "Entity Reveal Coordinator",
    blurb:
      "The application-wide interaction and placement system for semantic entity reveals. It coordinates named sources, input modality, measurement, safe bounds, portal rendering, ordered secondary cards, dismissal, and diagnostics while strict surfaces such as InfoCard own their visual content.",
    Preview: EntityRevealCoordinatorPreview,
    Docs: EntityRevealCoordinatorDocs,
  },
] as const satisfies readonly CumulusUISystem[];

/** Every registered UI-system route id, kept literal for component backlinks. */
export type CumulusUISystemId = (typeof CUMULUS_UI_SYSTEMS)[number]["id"];

export function getUISystem(id: string): CumulusUISystem | undefined {
  return CUMULUS_UI_SYSTEMS.find((system) => system.id === id);
}
