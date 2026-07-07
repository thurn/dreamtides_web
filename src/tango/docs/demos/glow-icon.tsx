import {
  GlowIcon,
  ENERGY_ICON_CLASS,
  ENERGY_ICON_COLOR,
  SPARK_ICON_CLASS,
  SPARK_ICON_COLOR,
} from "../../components/controls/GlowIcon";
import type { Glyph } from "../../primitives/glyph";
import type { TangoComponent } from "../registry";

function iconFromArg(value: unknown): Glyph {
  return value === ENERGY_ICON_CLASS ? ENERGY_ICON_CLASS : SPARK_ICON_CLASS;
}

function GlowIconDemo(args: Record<string, unknown>) {
  return (
    <GlowIcon
      iconClass={iconFromArg(args.iconClass)}
      color={args.iconClass === ENERGY_ICON_CLASS ? ENERGY_ICON_COLOR : SPARK_ICON_COLOR}
      size={typeof args.size === "string" ? args.size : "48px"}
      shadow={args.shadow === true}
      title={typeof args.title === "string" ? args.title : "Spark"}
    />
  );
}

export const glowIconDemo: TangoComponent = {
  id: "glow-icon",
  title: "Glow Icon",
  blurb:
    "The resource-glyph renderer for card marks: a named glyph, role color, optional soft shadow, and optional emitted-light filter in one square footprint.",
  group: "Components",
  docName: "GlowIcon",
  Component: GlowIconDemo,
  usage: [
    {
      code: `import { GlowIcon, SPARK_ICON_CLASS, SPARK_ICON_COLOR } from "src/tango/components/controls/GlowIcon";

<GlowIcon iconClass={SPARK_ICON_CLASS} color={SPARK_ICON_COLOR} shadow />`,
    },
  ],
  demo: {
    defaultArgs: {
      iconClass: SPARK_ICON_CLASS,
      color: SPARK_ICON_COLOR,
      size: "48px",
      shadow: true,
      title: "Spark",
    },
  },
};
