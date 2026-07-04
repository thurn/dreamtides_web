// Registry demo entry for TidePill — see resource-chip.tsx for the recipe
// this follows. `icon` is a Boxicons class string (a generated text control);
// `label` is the tide name (a plain string), surfaced as a text control seeded
// via defaultArgs.
//
// TidePill's `label` and `description` are required, which the registry's
// `ComponentType<Record<string, unknown>>` signature can't satisfy directly (a
// Record doesn't guarantee the keys exist). A thin all-optional wrapper — same
// shape as stat-tile.tsx's — defaults them so `Component` type-checks; `docName`
// still points at the real TidePill so the props table reports its actual API.
// The demo pill floats its reveal above itself (no `stageRef` in the bounded
// demo stage), which is the standalone reveal path.

import { TidePill } from "../../components/hud/TidePill";
import type { TangoComponent } from "../registry";

interface TidePillDemoArgs {
  label?: string;
  description?: string;
  tone?: "violet" | "blue" | "gold" | "green" | "rust" | "red" | "neutral";
  icon?: string;
  size?: "sm" | "md";
  onPress?: () => void;
}

function TidePillDemo({
  label = "Singular Storm",
  description = "A tide of sudden, singular force — one overwhelming swell rather than a steady current.",
  tone,
  icon,
  size,
  onPress,
}: TidePillDemoArgs) {
  return (
    <TidePill
      label={label}
      description={description}
      tone={tone}
      icon={icon}
      size={size}
      onPress={onPress}
    />
  );
}

export const tidePillDemo: TangoComponent = {
  id: "tide-pill",
  title: "Tide Pill",
  blurb:
    "The labelled tag for a Dreamcaller's tides and affiliations. Hovering or pressing a pill reveals the tide's description through the shared InfoCard.",
  group: "Components",
  docName: "TidePill",
  Component: TidePillDemo,
  usage: [
    {
      label: "Anchored reveal",
      note: "Pass `stageRef` (the screen root) and the tide's InfoCard reveal is anchored to the pill and clamped fully on-screen — the preferred, material-continuity path.",
      code: `import { TidePill } from "src/tango/components/hud/TidePill";

<TidePill
  tone="blue"
  icon="bxf bx-water"
  label="Singular Storm"
  description="A tide of sudden, singular force."
  stageRef={screenRef}
  onPress={selectTide}
/>`,
    },
    {
      label: "Standalone",
      note: "Omit `stageRef` and the same InfoCard floats directly above the pill — for list contexts with no positioned stage.",
      code: `<TidePill tone="gold" label="Rising Sun" description="A tide that crests at dawn." />`,
    },
  ],
  demo: {
    defaultArgs: {
      tone: "blue",
      size: "md",
      icon: "bxf bx-water",
      label: "Singular Storm",
      description:
        "A tide of sudden, singular force — one overwhelming swell rather than a steady current.",
    },
  },
};
