// Registry demo entry for TidePill — see resource-chip.tsx for the recipe
// this follows. `icon` is a Boxicons class string (a generated text control);
// `label` is the tide name (a plain string), surfaced as a text control seeded
// via defaultArgs.
//
// TidePill's `label` is required, which the registry's
// `ComponentType<Record<string, unknown>>` signature can't satisfy directly (a
// Record doesn't guarantee the key exists). A thin all-optional wrapper — same
// shape as stat-tile.tsx's — defaults it so `Component` type-checks; `docName`
// still points at the real TidePill so the props table reports its actual API.

import { TidePill } from "../../components/TidePill";
import type { TangoComponent } from "../registry";

interface TidePillDemoArgs {
  label?: string;
  tone?: "violet" | "blue" | "gold" | "green" | "rust" | "red" | "neutral";
  icon?: string;
  size?: "sm" | "md";
  onPress?: () => void;
}

function TidePillDemo({
  label = "Singular Storm",
  tone,
  icon,
  size,
  onPress,
}: TidePillDemoArgs) {
  return (
    <TidePill label={label} tone={tone} icon={icon} size={size} onPress={onPress} />
  );
}

export const tidePillDemo: TangoComponent = {
  id: "tide-pill",
  title: "Tide Pill",
  group: "Components",
  docName: "TidePill",
  Component: TidePillDemo,
  usage: [
    {
      label: "Presentational",
      note: "A labelled tag for a tide / affiliation — a `tone` color, an optional leading `icon`, and the tide name as the `label` string.",
      code: `import { TidePill } from "src/tango/components/TidePill";

<TidePill tone="blue" icon="bxf bx-water" label="Singular Storm" />`,
    },
    {
      label: "Pressable",
      note: "Pass `onPress` and the pill renders as a button with press feedback.",
      code: `<TidePill tone="gold" label="Rising Sun" onPress={showTideInfo} />`,
    },
  ],
  demo: {
    defaultArgs: {
      tone: "blue",
      size: "md",
      icon: "bxf bx-water",
      label: "Singular Storm",
    },
  },
};
