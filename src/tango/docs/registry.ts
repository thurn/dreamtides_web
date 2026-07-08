// The component registry for the /tango doc site. This is the single list the
// documentation UI walks to build the table of contents, resolve a hash route
// to a live component, and drive the demo/props/controls of a component page.
//
// Phase 2 populates this array with real Tango primitives/components (Pressable,
// etc). Each is a single self-contained object literal appended to
// TANGO_COMPONENTS, so growing the catalog never touches the harness code that
// consumes it. The array starts empty; TangoApp renders a "coming soon" note
// while it is.

import type { ComponentType } from "react";
import { atlasEdgeDemo } from "./demos/atlas-edge";
import { atlasNodeDemo } from "./demos/atlas-node";
import { buttonDemo } from "./demos/button";
import { cardStatOrbDemo } from "./demos/card-stat-orb";
import { cardTermDefinitionsDemo } from "./demos/card-term-definitions";
import { dreamcallerPortraitDemo } from "./demos/dreamcaller-portrait";
import { dreamsignDemo } from "./demos/dreamsign";
import { essenceValueDemo } from "./demos/essence-value";
import { gameCardDemo } from "./demos/game-card";
import { glassButtonDemo } from "./demos/glass-button";
import { glassDialogDemo } from "./demos/glass-dialog";
import { glossaryDefinitionCardDemo } from "./demos/glossary-definition-card";
import { glowIconDemo } from "./demos/glow-icon";
import { groupPanelDemo } from "./demos/group-panel";
import { hoverPopoverDemo } from "./demos/hover-popover";
import { hoverZoomCardDemo } from "./demos/hover-zoom-card";
import { iconButtonDemo } from "./demos/icon-button";
import { infoCardDemo } from "./demos/info-card";
import { leaveSiteButtonDemo } from "./demos/leave-site-button";
import { motesDemo } from "./demos/motes";
import { pipBadgeDemo } from "./demos/pip-badge";
import { pressableDemo } from "./demos/pressable";
import { questStatusBarDemo } from "./demos/quest-status-bar";
import { resourceChipDemo } from "./demos/resource-chip";
import { rulesTextDemo } from "./demos/rules-text";
import { segmentedControlDemo } from "./demos/segmented-control";
import { selectDemo } from "./demos/select";
import { siteNodeDemo } from "./demos/site-node";
import { statTileDemo } from "./demos/stat-tile";
import { tideDiscDemo } from "./demos/tide-disc";
import { tidePillDemo } from "./demos/tide-pill";

/**
 * A single authored usage snippet shown on a component's doc page. The source
 * is hand-written (not generated from `defaultArgs`) so it can show the real
 * prop shapes exactly as a caller would type them — including complex object
 * props (a full `card`, an `AtlasNodeView`, a `stageRef`) that the interactive
 * control panel cannot model. Provide more than one entry only when a component
 * has genuinely distinct usage variants (e.g. Button with vs. without a cost,
 * InfoCard's four media variants); a component with one obvious call site
 * carries a single snippet.
 */
export interface TangoUsageExample {
  /** Short variant label, shown only when a component lists more than one. */
  label?: string;
  /** One-line note under the label explaining when to reach for this variant. */
  note?: string;
  /** The JSX/TSX source to display, verbatim. */
  code: string;
}

/**
 * A single documented entry in the Tango catalog.
 */
export interface TangoComponent {
  /** Matches the hash route id, e.g. "pressable" (lowercased in routes). */
  id: string;
  /** Human-readable display title, e.g. "Pressable". */
  title: string;
  /**
   * A one-or-two-sentence description of what the component is and does, shown
   * directly under the title on both the overview showcase and the component's
   * doc page — so a reader learns the component's job before studying its live
   * example. Plain prose; never quantifies how many objects a demo happens to
   * show.
   */
  blurb: string;
  /**
   * Optional guidance admonition shown under the blurb on the component's doc
   * page — steers the reader before they use it (e.g. "prefer a higher-level
   * component before reaching for this primitive"). Omit when the blurb says
   * enough.
   */
  callout?: string;
  /**
   * The sanctioned escape from the ghost-components integrity check — set to
   * "incubating" for a component that is documented deliberately ahead of its
   * adoption, before any real (non-doc, non-test) code consumes it. It renders
   * a visible "Incubating" badge on the doc page so the gap reads as
   * intentional rather than dead. Omit for shipped components: every entry
   * should earn a real consumer by Phase 3, at which point the field is
   * dropped.
   */
  status?: "incubating";
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
  /**
   * One or more authored usage snippets demonstrating how to call the
   * component in real code, rendered in the doc page's "Usage" section.
   */
  usage: TangoUsageExample[];
  demo: {
    /** Initial control values, seeded into the ComponentPage's args state. */
    defaultArgs: Record<string, unknown>;
    /**
     * Props that have no interactive control (controlForProp returns "none") —
     * ReactNode children and structured model slots like a `RichText` body.
     * Keyed by prop name; spread into the demo alongside args so the live
     * component has real content to render.
     */
    sampleContent?: Record<string, unknown>;
  };
}

/**
 * The Tango component catalog. Append one object literal per component. Order
 * within a group is preserved; TangoApp groups entries by `group` for the TOC.
 */
export const TANGO_COMPONENTS: TangoComponent[] = [
  pressableDemo,
  resourceChipDemo,
  essenceValueDemo,
  buttonDemo,
  iconButtonDemo,
  glassButtonDemo,
  glassDialogDemo,
  leaveSiteButtonDemo,
  segmentedControlDemo,
  selectDemo,
  statTileDemo,
  tidePillDemo,
  tideDiscDemo,
  motesDemo,
  infoCardDemo,
  hoverPopoverDemo,
  groupPanelDemo,
  glowIconDemo,
  pipBadgeDemo,
  questStatusBarDemo,
  dreamcallerPortraitDemo,
  rulesTextDemo,
  gameCardDemo,
  hoverZoomCardDemo,
  cardTermDefinitionsDemo,
  glossaryDefinitionCardDemo,
  cardStatOrbDemo,
  atlasNodeDemo,
  atlasEdgeDemo,
  dreamsignDemo,
  siteNodeDemo,
];

/** Look up a registry entry by its route id. */
export function getComponent(id: string): TangoComponent | undefined {
  return TANGO_COMPONENTS.find((component) => component.id === id);
}
