// GroupPanel — the information-grouping card (R-19).
//
// Rung 2 of the legibility ladder (Principle two). It is the ONE card used to
// collect dense, RELATED information into a single unit — several values, a
// heading + body + an action (the console at the bottom of the Dreamcaller
// screen). It earns its place by organizing information, NOT by being a
// readable backdrop for a lone label (that's on-media outlining via
// .hud-outline / R-15).
//
// Distinct from InfoCard (the press-reveal popover) and GameCard (the play
// object).
//
// ── The surface: an Apple-style "liquid glass" pane (tokenized so it can't
//    drift) ───────────────────────────────────────────────────────────────
//   - fill         — a deep, translucent chrome tint so the scene art blurs
//                    through the pane
//   - backdrop     — blur + saturate, refracting the art behind it
//   - sheen        — a faint top-left specular gradient on top of the fill
//   - rims/wash    — inset white top rim + soft violet interior wash
//   - edge         — a hairline --border-soft
//   - elevation    — a soft drop shadow
// The panel is its OWN glass object over the scene art. CSS-only (no WebGL
// refraction), so it is safe on iOS Safari. Tuned to stay legible over a
// painterly portrait, not to distract.
//
// The corner radius (--radius-popover) and padding (--space-6) are fixed Tango
// tokens, not props — a GroupPanel is one shape everywhere, and callers never
// dial in an arbitrary radius or padding. The translucent chrome fill,
// specular sheen gradient, blur/saturate backdrop and layered rim/wash/drop
// shadow have no design-system token and are the panel's own bespoke glass
// material, kept verbatim from the source. Sizing and content layout belong to
// the consumer: wrap the pane to size it, and lay out its `children` inside.
//
// Ported from the Claude Design "Dreamtides Mobile" project
// (components/surfaces/GroupPanel.jsx / .d.ts).

import * as React from "react";
import { token } from "../../primitives/tokens";

/**
 * The grouping-card glass style object, if you need to spread it onto your own
 * node. Call it — `GroupPanel.style()` — do not pass the function itself. The
 * radius and every other value are fixed; there are no customization
 * parameters.
 */
export function groupPanelStyle(): React.CSSProperties {
  return {
    // Deep chrome tint at reduced alpha so the backdrop blur reads as glass —
    // topped with a faint top-left specular sheen. Bespoke glass literals: no
    // design-system token maps to the translucent fill or sheen gradient.
    background:
      "linear-gradient(150deg, rgba(255,255,255,0.07), rgba(255,255,255,0) 42%), rgba(18,14,28,0.5)",
    backdropFilter: "blur(22px) saturate(1.5)",
    WebkitBackdropFilter: "blur(22px) saturate(1.5)",
    border: `1px solid ${token("--border-soft")}`,
    borderRadius: token("--radius-popover"),
    // Layered rim / interior wash / drop shadow — bespoke glass literals with
    // no matching elevation token.
    boxShadow: [
      "inset 0 1px 1px rgba(255,255,255,0.22)", // top specular rim
      "inset 0 -18px 30px rgba(120,70,170,0.10)", // soft interior wash
      "0 10px 34px rgba(6,2,14,0.5)", // drop
    ].join(", "),
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
 * An Apple-style liquid-glass pane: a translucent deep-chrome fill with a
 * blur/saturate backdrop, a specular top rim, and a soft interior wash — so the
 * scene art refracts through it. One fixed shape (radius + padding are tokens,
 * not props); collects dense, related information into one unit — never a
 * readable backdrop for a lone label. Size it and lay out its content from the
 * outside. Also exposes `GroupPanel.style`.
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
 * want to spread the glass recipe onto their own node.
 */
export const GroupPanel: typeof GroupPanelComponent & GroupPanelStatics =
  Object.assign(GroupPanelComponent, { style: groupPanelStyle });
