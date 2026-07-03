// The component registry for the /tango doc site. This is the single list the
// documentation UI walks to build the table of contents, resolve a hash route
// to a live component, and drive the demo/props/controls of a component page.
//
// Phase 2 populates this array with real Tango primitives/components (Pressable,
// etc). Each is a single self-contained object literal appended to
// TANGO_COMPONENTS, so growing the catalog never touches the harness code that
// consumes it. The array starts empty; TangoApp renders a "coming soon" note
// while it is.

import type { ComponentType, ReactNode } from "react";
import { atlasEdgeDemo } from "./demos/atlas-edge";
import { atlasNodeDemo } from "./demos/atlas-node";
import { buttonDemo } from "./demos/button";
import { dreamsignDemo } from "./demos/dreamsign";
import { gameCardDemo } from "./demos/game-card";
import { groupPanelDemo } from "./demos/group-panel";
import { infoCardDemo } from "./demos/info-card";
import { motesDemo } from "./demos/motes";
import { pressableDemo } from "./demos/pressable";
import { questStatusBarDemo } from "./demos/quest-status-bar";
import { resourceChipDemo } from "./demos/resource-chip";
import { rulesTextDemo } from "./demos/rules-text";
import { segmentedControlDemo } from "./demos/segmented-control";
import { siteNodeDemo } from "./demos/site-node";
import { statTileDemo } from "./demos/stat-tile";
import { tidePillDemo } from "./demos/tide-pill";

/**
 * A single documented entry in the Tango catalog.
 */
export interface TangoComponent {
  /** Matches the hash route id, e.g. "pressable" (lowercased in routes). */
  id: string;
  /** Human-readable display title, e.g. "Pressable". */
  title: string;
  /** Table-of-contents grouping, e.g. "Primitives" | "Components". */
  group: string;
  /**
   * Key into tango-metadata.json — the component's react-docgen displayName.
   * PropsTable/ControlPanel look up the generated PropMeta[] under this key.
   */
  docName: string;
  /**
   * The actual component rendered live in the demo stage.
   *
   * Typed as `ComponentType<Record<string, unknown>>` rather than a precise
   * per-entry props type: the registry is heterogeneous (many component types
   * in one array) and the demo passes dynamically-built `args`, so a single
   * honest-but-loose prop type is contained here at the registry boundary. This
   * keeps the harness free of `any`/no-unsafe while callers stay type-checked.
   */
  Component: ComponentType<Record<string, unknown>>;
  demo: {
    /** Initial control values, seeded into the ComponentPage's args state. */
    defaultArgs: Record<string, unknown>;
    /**
     * ReactNode props (children, icon slots, ...) that have no interactive
     * control (controlForProp returns "none"). Keyed by prop name; spread into
     * the demo alongside args so the live component has real content to render.
     */
    sampleContent?: Record<string, ReactNode>;
  };
}

/**
 * The Tango component catalog. Append one object literal per component. Order
 * within a group is preserved; TangoApp groups entries by `group` for the TOC.
 */
export const TANGO_COMPONENTS: TangoComponent[] = [
  pressableDemo,
  resourceChipDemo,
  buttonDemo,
  segmentedControlDemo,
  statTileDemo,
  tidePillDemo,
  motesDemo,
  infoCardDemo,
  groupPanelDemo,
  questStatusBarDemo,
  rulesTextDemo,
  gameCardDemo,
  atlasNodeDemo,
  atlasEdgeDemo,
  dreamsignDemo,
  siteNodeDemo,
];

/** Look up a registry entry by its route id. */
export function getComponent(id: string): TangoComponent | undefined {
  return TANGO_COMPONENTS.find((component) => component.id === id);
}
