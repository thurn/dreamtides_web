// The component registry for the /cumulus doc site. This is the single list the
// documentation UI walks to build the table of contents, resolve a hash route
// to a live component, and drive the demo/props/controls of a component page.
//
// Phase 2 populates this array with real Cumulus primitives/components (Pressable,
// etc). Each is a single self-contained object literal appended to
// CUMULUS_COMPONENTS, so growing the catalog never touches the harness code that
// consumes it. The array starts empty; CumulusApp renders a "coming soon" note
// while it is.

import type { ComponentType } from "react";
import { atlasEdgeDemo } from "./demos/atlas-edge";
import { atlasMapDemo } from "./demos/atlas-map";
import { atlasNodeDemo } from "./demos/atlas-node";
import { battleStatusDisplayDemo } from "./demos/battle-status-display";
import { cardBackDemo } from "./demos/card-back";
import { cardGalleryPanelDemo } from "./demos/card-gallery-panel";
import { cardPileDemo } from "./demos/card-pile";
import { cardOrderEditorDemo } from "./demos/card-order-editor";
import { cardStatOrbDemo } from "./demos/card-stat-orb";
import { cardTermDefinitionsDemo } from "./demos/card-term-definitions";
import { characterDialogueDemo } from "./demos/character-dialogue";
import { coopPresenceStatusDemo } from "./demos/coop-presence-status";
import { commandMenusDemo, contextActionMenuDemo } from "./demos/command-menus";
import { dreamAvatarAbilityTextDemo } from "./demos/dream-avatar-ability-text";
import { dreamAvatarPortraitDemo } from "./demos/dream-avatar-portrait";
import { dreamwellCardDemo } from "./demos/dreamwell-card";
import { dreamsignDemo } from "./demos/dreamsign";
import { dreamsignGalleryPanelDemo } from "./demos/dreamsign-gallery-panel";
import { disclosureSectionDemo } from "./demos/disclosure-section";
import { developerRailDemo } from "./demos/developer-rail";
import { essenceValueDemo } from "./demos/essence-value";
import { gameCardDemo } from "./demos/game-card";
import { glassButtonDemo } from "./demos/glass-button";
import { glassDialogDemo } from "./demos/glass-dialog";
import { glassPanelDemo } from "./demos/glass-panel";
import { glossaryDefinitionCardDemo } from "./demos/glossary-definition-card";
import { glowIconDemo } from "./demos/glow-icon";
import { groupPanelDemo } from "./demos/group-panel";
import { iconButtonDemo } from "./demos/icon-button";
import { infoCardDemo } from "./demos/info-card";
import { inlineGlyphDemo } from "./demos/inline-glyph";
import { mainMenuButtonDemo } from "./demos/main-menu-button";
import { motesDemo } from "./demos/motes";
import { numberStepperDemo } from "./demos/number-stepper";
import { offerTileDemo } from "./demos/offer-tile";
import { pipBadgeDemo } from "./demos/pip-badge";
import { playingCardDemo } from "./demos/playing-card";
import { pressableDemo } from "./demos/pressable";
import { radialAnnouncementDemo } from "./demos/radial-announcement";
import { journeyStatusBarDemo } from "./demos/journey-status-bar";
import { resourceChipDemo } from "./demos/resource-chip";
import { richTextDemo } from "./demos/rich-text";
import { rulesTextDemo } from "./demos/rules-text";
import { segmentedControlDemo } from "./demos/segmented-control";
import { selectDemo } from "./demos/select";
import { siteNodeDemo } from "./demos/site-node";
import { speechBubbleDemo } from "./demos/speech-bubble";
import { tideDiscDemo } from "./demos/tide-disc";
import { textFieldDemo } from "./demos/text-field";
import { textAreaDemo } from "./demos/text-area";
import { transfigurationFormButtonDemo } from "./demos/transfiguration-form-button";
import { transientStatusToastDemo } from "./demos/transient-status-toast";

/**
 * A single authored usage snippet shown on a component's doc page. The source
 * is hand-written (not generated from `defaultArgs`) so it can show the real
 * prop shapes exactly as a caller would type them — including complex object
 * props (a full `card` or an `AtlasNodeModel`) that the interactive
 * control panel cannot model. Provide more than one entry only when a component
 * has genuinely distinct usage variants (e.g. Button with vs. without a cost,
 * InfoCard's four media variants); a component with one obvious call site
 * carries a single snippet.
 */
export interface CumulusUsageExample {
  /** Short variant label, shown only when a component lists more than one. */
  label?: string;
  /** One-line note under the label explaining when to reach for this variant. */
  note?: string;
  /** The JSX/TSX source to display, verbatim. */
  code: string;
}

/**
 * A single documented entry in the Cumulus catalog.
 */
export interface CumulusComponent {
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
   * intentional rather than dead. The catalog lifecycle permits one subsequent
   * health sweep for adoption; a component that remains unconsumed at the next
   * sweep is adopted or deleted. Omit for shipped components.
   */
  status?: "incubating";
  /** Table-of-contents grouping, e.g. "Primitives" | "Components". */
  group: string;
  /**
   * Key into cumulus-metadata.json — the component's react-docgen displayName.
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
  usage: CumulusUsageExample[];
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
 * The Cumulus component catalog. Append one object literal per component. Order
 * within a group is preserved; CumulusApp groups entries by `group` for the TOC.
 */
export const CUMULUS_COMPONENTS: CumulusComponent[] = [
  pressableDemo,
  resourceChipDemo,
  essenceValueDemo,
  iconButtonDemo,
  mainMenuButtonDemo,
  glassButtonDemo,
  offerTileDemo,
  glassPanelDemo,
  glassDialogDemo,
  developerRailDemo,
  commandMenusDemo,
  contextActionMenuDemo,
  speechBubbleDemo,
  characterDialogueDemo,
  segmentedControlDemo,
  selectDemo,
  textFieldDemo,
  textAreaDemo,
  numberStepperDemo,
  disclosureSectionDemo,
  cardOrderEditorDemo,
  tideDiscDemo,
  transfigurationFormButtonDemo,
  transientStatusToastDemo,
  radialAnnouncementDemo,
  motesDemo,
  infoCardDemo,
  groupPanelDemo,
  inlineGlyphDemo,
  glowIconDemo,
  pipBadgeDemo,
  journeyStatusBarDemo,
  coopPresenceStatusDemo,
  battleStatusDisplayDemo,
  dreamwellCardDemo,
  dreamAvatarAbilityTextDemo,
  dreamAvatarPortraitDemo,
  richTextDemo,
  rulesTextDemo,
  playingCardDemo,
  gameCardDemo,
  cardBackDemo,
  cardPileDemo,
  cardGalleryPanelDemo,
  cardTermDefinitionsDemo,
  glossaryDefinitionCardDemo,
  cardStatOrbDemo,
  atlasNodeDemo,
  atlasEdgeDemo,
  atlasMapDemo,
  dreamsignDemo,
  dreamsignGalleryPanelDemo,
  siteNodeDemo,
];

/** Look up a registry entry by its route id. */
export function getComponent(id: string): CumulusComponent | undefined {
  return CUMULUS_COMPONENTS.find((component) => component.id === id);
}
