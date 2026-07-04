// Registry demo entry for Motes — see stat-tile.tsx for the wrapper-as-
// Component recipe this follows. Motes fills its POSITIONED parent (absolute
// inset:0), so it renders nothing useful on its own; the demo's `Component`
// is a small wrapper that supplies a sized, `position: relative` stage (with
// a dark token-styled background so the light motes read against it) and
// renders `<Motes {...args} />` inside it. `docName` still points at the real
// Motes so the props table reports its actual API.

import { Motes, type MotesProps } from "../../components/Motes";
import { token } from "../../primitives/tokens";
import type { TangoComponent } from "../registry";

function MotesDemo(args: MotesProps) {
  return (
    <div
      style={{
        position: "relative",
        width: 320,
        height: 220,
        overflow: "hidden",
        borderRadius: token("--radius-control"),
        background: token("--bg-sunken"),
        border: `1px solid ${token("--border-soft")}`,
      }}
    >
      <Motes {...args} />
    </div>
  );
}

export const motesDemo: TangoComponent = {
  id: "motes",
  title: "Motes",
  blurb:
    "The atmospheric particle layer — drifting dust that gives a surface its living shimmer. Its tint adapts to whether it sits over scene art or over chrome.",
  group: "Components",
  docName: "Motes",
  Component: MotesDemo,
  usage: [
    {
      note: "Drifting ambient motes that fill their positioned parent (absolute inset: 0), so give the container `position: relative` and `overflow: hidden`. `seed` makes the scatter deterministic.",
      code: `import { Motes } from "src/tango/components/Motes";

<div style={{ position: "relative", overflow: "hidden" }}>
  <Motes on tint="warm" count={14} seed={0} />
  {/* foreground content */}
</div>`,
    },
  ],
  demo: {
    defaultArgs: {
      on: true,
      tint: "warm",
      count: 14,
      seed: 0,
    },
  },
};
