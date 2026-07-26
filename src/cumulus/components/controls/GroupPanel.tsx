// GroupPanel — the information-grouping card (R-19).
//
// Rung 2 of the legibility ladder (Principle two). It is the ONE card used to
// collect dense, RELATED information into a single unit — several values, a
// heading + body + an action (the console at the bottom of the DreamAvatar
// screen). It earns its place by organizing information, NOT by being a
// readable backdrop for a lone label (that's on-media outlining via
// .hud-outline / R-15).
//
// Distinct from InfoCard (the press-reveal popover) and GameCard (the play
// object). InfoCard is the system's glass popover; GroupPanel is a flat solid
// card, so the two read as distinct surfaces rather than the same material.
//
// ── The surface: a flat, solid deep-plum card ─────────────────────────────
//   - fill    — the opaque --surface-card plum, so the card reads as a solid
//               object over the scene art, not a pane the art shows through
//   - edge    — none; the card has no border
//   - radius  — --radius-popover
//   - elevation — a soft --shadow-card drop shadow that lifts the card off the
//               scene art behind it
//
// The corner radius (--radius-popover) and padding (--space-6) are fixed Cumulus
// tokens, not props — a GroupPanel is one shape everywhere, and callers never
// dial in an arbitrary radius or padding. Sizing and content layout belong to
// the consumer: wrap the pane to size it, and lay out its `children` inside.
//
// Ported from the Claude Design "Dreamtides Mobile" project
// (components/surfaces/GroupPanel.jsx / .d.ts).

import * as React from "react";
import { token } from "../../primitives/tokens";

/**
 * The grouping-card surface style object, if you need to spread it onto your
 * own node. Call it — `GroupPanel.style()` — do not pass the function itself.
 * The radius, fill, and every other value are fixed; there are no
 * customization parameters.
 */
export function groupPanelStyle(): React.CSSProperties {
  return {
    // A flat, opaque deep-plum fill so the card reads as a solid object over
    // the scene art (the blurred liquid-glass treatment is InfoCard's, kept
    // visually distinct on purpose).
    background: token("--surface-card"),
    borderRadius: token("--radius-popover"),
    // A soft drop shadow lifts the flat card off the scene art behind it; with
    // no border, the elevation is what separates the card from its backdrop.
    boxShadow: token("--shadow-card"),
  };
}

export interface GroupPanelProps {
  /** The grouped content laid out inside the pane. */
  children?: React.ReactNode;
}

interface GroupPanelStatics {
  style: typeof groupPanelStyle;
}

/**
 * GroupPanel — the information-grouping card (rung 2 of the legibility ladder).
 * A flat, solid deep-plum card: an opaque --surface-card fill, no border, and a
 * soft drop shadow that lifts it off the scene art — a distinct surface from
 * InfoCard's glass. One fixed shape (radius + padding are tokens, not props);
 * collects dense, related information into one unit — never a readable backdrop
 * for a lone label. Size it and lay out its content from the outside. Also
 * exposes `GroupPanel.style`.
 */
function GroupPanelComponent({
  children,
}: GroupPanelProps): React.ReactElement {
  return (
    <div
      style={{
        ...groupPanelStyle(),
        padding: token("--space-6"),
        // visible so a child action (badge, button) may deliberately overhang
        // the rounded pane edge, per the design source.
        overflow: "visible",
      }}
    >
      {children}
    </div>
  );
}

/**
 * GroupPanel — the component plus its `style` static. Attaching the style
 * helper with a single typed `Object.assign` (no `any`) means the exported
 * symbol both renders the pane and exposes `GroupPanel.style` for callers who
 * want to spread the card recipe onto their own node.
 */
export const GroupPanel: typeof GroupPanelComponent & GroupPanelStatics =
  Object.assign(GroupPanelComponent, { style: groupPanelStyle });
