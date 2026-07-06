// glassSurfaceStyle — the shared "liquid glass" surface recipe.
//
// An Apple-style translucent glass material: a deep-chrome fill at reduced
// alpha over a blur+saturate backdrop, topped with a faint specular sheen, a
// hairline rim, a soft violet interior wash, and a drop shadow. Because the
// fill is translucent and the backdrop blurs, whatever scene art sits behind
// the surface refracts through it as glass. CSS-only (no WebGL refraction), so
// it is safe on iOS Safari.
//
// This is the ONE glass material, shared so it reads identically everywhere it
// appears: the InfoCard press-reveal popover shell and the MobileDeckViewer's
// full-bleed frosted backdrop both spread it. The translucent fill, specular
// sheen gradient, blur/saturate backdrop and layered rim/wash/drop shadow are
// the material's own bespoke literals — no design-system token maps to them —
// and are kept verbatim from the Claude Design "Dreamtides Mobile" source.
//
// The flat information-grouping card (GroupPanel) is a DIFFERENT, solid surface
// and does not use this recipe.

import * as React from "react";
import { token } from "../../primitives/tokens";

/**
 * The liquid-glass style object, spread onto the node that should read as
 * glass. Every value is fixed; there are no customization parameters — the
 * material is one surface everywhere it is used.
 */
export function glassSurfaceStyle(): React.CSSProperties {
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
