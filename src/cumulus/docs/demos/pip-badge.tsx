// Registry demo entry for PipBadge — the circled number on a colored disc used
// for card corner stats (spark, energy cost) and for the inline spark reference
// inside rules text. The live Component shows a control-driven hero above a
// static showcase of the spark and energy variants at both sizes ('sm', 'md'),
// with one energy pip carrying a glossary reveal so a reader can see the long-delay
// hover anchor. The resource fills are exported from PipBadge.tsx as the single
// source of truth (see the callout), so a corner pip and the inline energy
// glyph in rules text paint the same resource.

import { PipBadge } from "../../components/controls/PipBadge";
import { token } from "../../primitives/tokens";
import { GLOSSARY_IDS } from "../../../data/glossary";
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
  const glossaryId =
    typeof args.glossaryId === "string" ? args.glossaryId : undefined;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: token("--space-2xl"),
      }}
    >
      {/* Control-driven hero: the args from the panel paint one pip. */}
      <PipBadge
        variant={variant}
        value={value}
        size={size}
        scale={scale}
        ariaLabel={ariaLabel}
        glossaryId={glossaryId}
      />
      {/* Static showcase: the spark and energy variants at both sizes. The
          energy 'md' pip carries a glossary Info Card — hover and hold it for a full
          second (the corner-tuned delay) to reveal the description. */}
      <div
        style={{
          display: "flex",
          gap: token("--space-2xl"),
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
            gap: token("--space-xs"),
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: token("--space-m"),
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
            gap: token("--space-xs"),
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: token("--space-m"),
            }}
          >
            <PipBadge variant="energy" value="2" size="sm" />
            <PipBadge
              variant="energy"
              value="2"
              size="md"
              glossaryId={GLOSSARY_IDS.energyCost}
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
    "The compact circled number used in dense card rows and inline rules text for spark or energy values. The value renders in white with a thin outline at small sizes; full game-card corners use the larger, art-aware CardStatOrb. An optional glossary entry turns a pip into its own semantic reveal source.",
  callout:
    "The compact pip fills live in pip-colors.ts: SPARK_PIP_COLOR is gold #facc15 and ENERGY_PIP_COLOR is teal #0ea5e9. InlineGlyph uses the same resource constants in flowing rules text, while larger CardStatOrb glyphs use the card-stat treatment. Import the named constants rather than re-typing their values.",
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
      label: "Energy-cost pip with glossary entry",
      note: "The energy cost as a pip, with a glossary-backed Info Card so a first-time player can learn what the number means. The pip becomes its own hover anchor; the reveal fires on a full-second hold so brushing past a card corner does not trigger it.",
      code: `import { GLOSSARY_IDS } from "src/data/glossary";
import { PipBadge } from "src/cumulus/components/controls/PipBadge";

<PipBadge
  variant="energy"
  value="2"
  size="sm"
  glossaryId={GLOSSARY_IDS.energyCost}
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
