// Registry demo entry for PipBadge — the circled number on a colored disc used
// for card corner stats (spark, energy cost) and for the inline spark reference
// inside rules text. The live Component shows a control-driven hero above a
// static showcase of the spark and energy variants at both sizes ('sm', 'md'),
// with one energy pip carrying a tooltip so a reader can see the long-delay
// hover anchor. The resource fills are exported from PipBadge.tsx as the single
// source of truth (see the callout), so a corner pip and the inline energy
// glyph in rules text paint the same resource.

import { PipBadge } from "../../components/controls/PipBadge";
import { token } from "../../primitives/tokens";
import type { CumulusComponent } from "../registry";

function coerceString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function PipBadgeDemo(args: Record<string, unknown>) {
  const variant = args.variant === "energy" ? "energy" : "spark";
  const value = coerceString(args.value, "3");
  const size = args.size === "md" ? "md" : "sm";
  const scale = typeof args.scale === "number" ? args.scale : 1;
  const ariaLabel =
    typeof args.ariaLabel === "string" ? args.ariaLabel : undefined;
  const tooltip = typeof args.tooltip === "string" ? args.tooltip : undefined;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: token("--space-8"),
      }}
    >
      {/* Control-driven hero: the args from the panel paint one pip. */}
      <PipBadge
        variant={variant}
        value={value}
        size={size}
        scale={scale}
        ariaLabel={ariaLabel}
        tooltip={tooltip}
      />
      {/* Static showcase: the spark and energy variants at both sizes. The
          energy 'md' pip carries a tooltip — hover and hold it for a full
          second (the corner-tuned delay) to reveal the description. */}
      <div
        style={{
          display: "flex",
          gap: token("--space-8"),
          alignItems: "flex-end",
          flexWrap: "wrap",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: token("--space-3"),
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: token("--space-5"),
            }}
          >
            <PipBadge variant="spark" value="3" size="sm" />
            <PipBadge variant="spark" value="3" size="md" />
          </div>
          <span
            style={{ font: token("--t-caption"), color: token("--text-muted") }}
          >
            Spark
          </span>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: token("--space-3"),
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: token("--space-5"),
            }}
          >
            <PipBadge variant="energy" value="2" size="sm" />
            <PipBadge
              variant="energy"
              value="2"
              size="md"
              tooltip="Energy is the cost you pay to play this card."
            />
          </div>
          <span
            style={{ font: token("--t-caption"), color: token("--text-muted") }}
          >
            Energy cost
          </span>
        </div>
      </div>
    </div>
  );
}

export const pipBadgeDemo: CumulusComponent = {
  id: "pip-badge",
  title: "Pip Badge",
  blurb:
    "The circled number on a colored disc for card stats: a spark value or an energy cost, and the inline spark reference inside rules text. The value renders in white with a thin outline so it stays legible over the colored fill at small card sizes, and each variant owns its resource fill so a corner pip and an inline reference to the same resource cannot drift apart. An optional tooltip turns a pip into its own hover anchor on a longer delay tuned for card corners.",
  callout:
    "PipBadge.tsx is the single source of truth for the resource fills: it exports the spark fill (SPARK_PIP_COLOR, gold #facc15) and the energy fill (ENERGY_PIP_COLOR, teal #0ea5e9). GlowIcon reads ENERGY_PIP_COLOR for the inline energy glyph, so a corner energy pip and an inline energy reference in rules text paint the same color. Import these constants rather than re-typing the hex value.",
  group: "Components",
  docName: "PipBadge",
  Component: PipBadgeDemo,
  usage: [
    {
      label: "Corner spark pip",
      note: "The spark stat as a corner pip. `value` is a string so a variable value can pass \"X\"; `scale` lets a card renderer track the surrounding card text scale.",
      code: `import { PipBadge } from "src/cumulus/components/controls/PipBadge";

<PipBadge variant="spark" value="3" size="sm" />`,
    },
    {
      label: "Energy-cost pip with tooltip",
      note: "The energy cost as a pip, with a tooltip so a first-time player can learn what the number means. The pip becomes its own hover anchor; the tooltip fires on a full-second hold so brushing past a card corner does not trigger it.",
      code: `import { PipBadge } from "src/cumulus/components/controls/PipBadge";

<PipBadge
  variant="energy"
  value="2"
  size="sm"
  tooltip="Energy is the cost you pay to play this card."
/>`,
    },
  ],
  demo: {
    defaultArgs: {
      variant: "spark",
      value: "3",
      size: "sm",
    },
  },
};
