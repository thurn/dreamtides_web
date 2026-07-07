import { PipBadge } from "../../components/controls/PipBadge";
import type { TangoComponent } from "../registry";

function PipBadgeDemo(args: Record<string, unknown>) {
  return (
    <PipBadge
      variant={args.variant === "energy" ? "energy" : "spark"}
      value={typeof args.value === "string" ? args.value : "3"}
      size={args.size === "md" ? "md" : "sm"}
      scale={typeof args.scale === "number" ? args.scale : 1}
      ariaLabel={typeof args.ariaLabel === "string" ? args.ariaLabel : undefined}
      tooltip={typeof args.tooltip === "string" ? args.tooltip : undefined}
    />
  );
}

export const pipBadgeDemo: TangoComponent = {
  id: "pip-badge",
  title: "Pip Badge",
  blurb:
    "The compact circular number badge for inline spark and energy references, with the matching resource fill and optional explanatory tooltip.",
  group: "Components",
  docName: "PipBadge",
  Component: PipBadgeDemo,
  usage: [
    {
      code: `import { PipBadge } from "src/tango/components/controls/PipBadge";

<PipBadge variant="spark" value="3" size="sm" />`,
    },
  ],
  demo: {
    defaultArgs: {
      variant: "spark",
      value: "3",
      size: "sm",
      scale: 1,
      ariaLabel: "spark",
      tooltip: "Spark is the card's score value.",
    },
  },
};
