// Registry demo entry for StatTile — see resource-chip.tsx for the recipe
// this follows. `value` and `sub` are ReactNode-slot props with no generated
// control, so they're seeded via sampleContent instead of defaultArgs.
//
// Unlike ResourceChip/Button, StatTile's own props (`label`, `value`) are
// required, which the registry's `ComponentType<Record<string, unknown>>`
// signature can't satisfy directly (a Record doesn't guarantee those keys
// exist). A thin all-optional wrapper — same shape as segmented-control.tsx's
// stateful wrapper, but here only to relax required-ness, not to add state —
// defaults them so `Component` type-checks; `docName` still points at the
// real StatTile so the props table reports its actual (required) API.

import type { ReactNode } from "react";
import { StatTile } from "../../components/StatTile";
import type { TangoComponent } from "../registry";

interface StatTileDemoArgs {
  label?: string;
  value?: ReactNode;
  sub?: ReactNode;
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
  group: "Components",
  docName: "StatTile",
  Component: StatTileDemo,
  demo: {
    defaultArgs: {
      label: "Essence",
      accent: "essence",
    },
    sampleContent: {
      value: "240",
      sub: "this run",
    },
  },
};
