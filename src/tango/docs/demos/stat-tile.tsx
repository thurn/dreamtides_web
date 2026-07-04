// Registry demo entry for StatTile — see resource-chip.tsx for the recipe
// this follows. `value` and `sub` are plain strings, so they surface as text
// controls and are seeded via defaultArgs.
//
// Unlike ResourceChip/Button, StatTile's own props (`label`, `value`) are
// required, which the registry's `ComponentType<Record<string, unknown>>`
// signature can't satisfy directly (a Record doesn't guarantee those keys
// exist). A thin all-optional wrapper — same shape as segmented-control.tsx's
// stateful wrapper, but here only to relax required-ness, not to add state —
// defaults them so `Component` type-checks; `docName` still points at the
// real StatTile so the props table reports its actual (required) API.

import { StatTile } from "../../components/controls/StatTile";
import type { TangoComponent } from "../registry";

interface StatTileDemoArgs {
  label?: string;
  value?: string;
  sub?: string;
  accent?: "essence" | "energy" | "spark" | "points";
}

function StatTileDemo({
  label = "Essence",
  value = "240",
  sub,
  accent,
}: StatTileDemoArgs) {
  return <StatTile label={label} value={value} sub={sub} accent={accent} />;
}

export const statTileDemo: TangoComponent = {
  id: "stat-tile",
  title: "Stat Tile",
  blurb:
    "A labelled value cell for summary grids — a large value over a small uppercase label — used for deck stats and run-end results. Its value can be tinted to a resource role.",
  group: "Components",
  docName: "StatTile",
  Component: StatTileDemo,
  usage: [
    {
      note: "A labelled readout — `label` + `value`, an optional `sub` caption, and an `accent` that tints the value.",
      code: `import { StatTile } from "src/tango/components/controls/StatTile";

<StatTile label="Essence" value="240" sub="this run" accent="essence" />`,
    },
  ],
  demo: {
    defaultArgs: {
      label: "Essence",
      value: "240",
      sub: "this run",
      accent: "essence",
    },
  },
};
