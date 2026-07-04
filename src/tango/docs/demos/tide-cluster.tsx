// Registry demo entry for TideCluster — see tide-pill.tsx for the recipe. The
// demo cluster floats its pills' reveals above themselves (no `stageRef` in the
// bounded demo stage), the standalone reveal path.

import { TideCluster, type TideClusterTideView } from "../../components/hud/TideCluster";
import type { TangoComponent } from "../registry";

const DEMO_TIDES: TideClusterTideView[] = [
  { id: "vision", label: "Singular Storm", description: "Foresight and spells — scry deep, then break one overwhelming storm.", tide: "vision" },
  { id: "valor", label: "Iron Bulwark", description: "An unbreaking host that absorbs every blow and answers in kind.", tide: "valor" },
  { id: "shadow", label: "Risen Depths", description: "Death is a doorway — reclaim the fallen stronger than before.", tide: "shadow" },
];

function TideClusterDemo() {
  return <TideCluster tides={DEMO_TIDES} />;
}

export const tideClusterDemo: TangoComponent = {
  id: "tide-cluster",
  title: "Tide Cluster",
  blurb:
    "The collapsed tide disclosure: overlapping colored glyph discs that expand, with a container-transform, into the full named tide pills.",
  group: "Components",
  docName: "TideCluster",
  Component: TideClusterDemo,
  usage: [
    {
      code: `import { TideCluster } from "src/tango/components/hud/TideCluster";

<TideCluster
  tides={[
    { id: "vision", label: "Singular Storm", description: "Foresight and spells.", tide: "vision" },
    { id: "valor", label: "Iron Bulwark", description: "An unbreaking host.", tide: "valor" },
  ]}
  stageRef={screenRef}
/>`,
    },
  ],
  demo: {
    defaultArgs: {},
  },
};
