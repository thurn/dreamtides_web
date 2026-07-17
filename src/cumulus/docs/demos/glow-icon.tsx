// Registry demo entry for GlowIcon — the Boxicons glyph behind every card
// resource mark. The live Component shows a control-driven hero above a static
// showcase of the three canonical marks (spark, energy, activated-ability bolt)
// at two sizes, each with the content-protection shadow and again with its
// emitted-light glow, so a reader sees the same glyph read as depth vs. bloom.
// The spark/energy hues and glyph classes are exported from GlowIcon.tsx as the
// single source of truth (see the callout), so a corner orb and an inline
// rules-text reference paint the same resource.

import {
  GlowIcon,
  BOLT_ICON_CLASS,
  ENERGY_ICON_CLASS,
  ENERGY_ICON_COLOR,
  SPARK_ICON_CLASS,
  SPARK_ICON_COLOR,
} from "../../components/controls/GlowIcon";
import type { Glyph } from "../../primitives/glyph";
import type { CumulusColor } from "../../primitives/color";
import type { MediaFilter } from "../../primitives/media";
import { token } from "../../primitives/tokens";
import type { CumulusComponent } from "../registry";

/** The three canonical resource marks, each with its hue and matching glow. */
const MARKS: {
  label: string;
  iconClass: Glyph;
  color: CumulusColor;
  glow?: MediaFilter;
}[] = [
  {
    label: "Spark",
    iconClass: SPARK_ICON_CLASS,
    color: SPARK_ICON_COLOR,
    glow: "spark-glow",
  },
  {
    label: "Energy",
    iconClass: ENERGY_ICON_CLASS,
    color: ENERGY_ICON_COLOR,
    glow: "energy-glow",
  },
  {
    // The activated-ability bolt paints in text hue on the card title bar; it
    // has no dedicated emitted-light glow, so it shows shadow-only.
    label: "Bolt",
    iconClass: BOLT_ICON_CLASS,
    color: "text-primary",
  },
];

function coerceString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function GlowIconDemo(args: Record<string, unknown>) {
  const iconClass = (args.iconClass ?? SPARK_ICON_CLASS) as Glyph;
  const color = (args.color ?? SPARK_ICON_COLOR) as CumulusColor;
  const size = coerceString(args.size, "48px");
  const glowFilter =
    typeof args.glowFilter === "string"
      ? (args.glowFilter as MediaFilter)
      : undefined;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: token("--space-8"),
      }}
    >
      {/* Control-driven hero: the args from the panel paint one glyph. */}
      <GlowIcon
        iconClass={iconClass}
        color={color}
        size={size}
        glowFilter={glowFilter}
        shadow={args.shadow === true}
        title={coerceString(args.title, "Spark")}
      />
      {/* Static showcase: each mark at 24px and 48px with the shadow, then at
          48px with its glow (the bolt has no glow, so it shows shadow-only). */}
      <div
        style={{
          display: "flex",
          gap: token("--space-8"),
          alignItems: "flex-end",
          flexWrap: "wrap",
          justifyContent: "center",
        }}
      >
        {MARKS.map((mark) => (
          <div
            key={mark.label}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: token("--space-3"),
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-end", gap: token("--space-5") }}>
              <GlowIcon
                iconClass={mark.iconClass}
                color={mark.color}
                size="24px"
                shadow
                title={`${mark.label} mark, small`}
              />
              <GlowIcon
                iconClass={mark.iconClass}
                color={mark.color}
                size="48px"
                shadow
                title={`${mark.label} mark`}
              />
              <GlowIcon
                iconClass={mark.iconClass}
                color={mark.color}
                size="48px"
                shadow
                glowFilter={mark.glow}
                title={`${mark.label} mark, glowing`}
              />
            </div>
            <span style={{ font: token("--t-caption"), color: token("--text-muted") }}>
              {mark.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export const glowIconDemo: CumulusComponent = {
  id: "glow-icon",
  title: "Glow Icon",
  blurb:
    "The resource-glyph renderer for card marks: a Boxicons glyph that paints in the caller's resource hue, with an optional content-protection shadow and an optional emitted-light glow pinned to its own font-size so both scale with the mark.",
  callout:
    "The glyph vocabulary lives in primitives/glyph.ts. GlowIcon exports the card-stat spark and energy hues plus the content-protection shadow used by CardStatOrb and inline RulesText marks; compact PipBadge fills live in pip-colors.ts. This keeps each rendering role named without claiming one component owns every resource mark.",
  group: "Primitives",
  docName: "GlowIcon",
  Component: GlowIconDemo,
  usage: [
    {
      label: "Corner spark mark",
      note: "The larger corner-stat glyph: the spark glyph in the spark hue with the content-protection shadow so it reads against card art (as CardStatOrb paints it).",
      code: `import { GlowIcon, SPARK_ICON_CLASS, SPARK_ICON_COLOR } from "src/cumulus/components/controls/GlowIcon";

<GlowIcon iconClass={SPARK_ICON_CLASS} color={SPARK_ICON_COLOR} size="44px" shadow title="Spark" />`,
    },
    {
      label: "Inline energy mark",
      note: "An inline glyph that tracks the surrounding text: the default 1em size lets the energy mark sit at the rules-text cap height, painted in the shared energy hue.",
      code: `import { GlowIcon, ENERGY_ICON_CLASS, ENERGY_ICON_COLOR } from "src/cumulus/components/controls/GlowIcon";

<GlowIcon iconClass={ENERGY_ICON_CLASS} color={ENERGY_ICON_COLOR} />`,
    },
    {
      label: "Activated-ability bolt",
      note: "The lightning-bolt mark for an activated ability, painted in text hue to sit on the card title bar's fast/interrupt chip.",
      code: `import { GlowIcon, BOLT_ICON_CLASS } from "src/cumulus/components/controls/GlowIcon";

<GlowIcon iconClass={BOLT_ICON_CLASS} color="text-primary" size="1.1em" title="Fast" />`,
    },
  ],
  demo: {
    defaultArgs: {
      iconClass: SPARK_ICON_CLASS,
      color: SPARK_ICON_COLOR,
      size: "48px",
      glowFilter: "spark-glow",
      shadow: true,
      title: "Spark",
    },
  },
};
