import { CoopPresenceStatus } from "../../components/hud/CoopPresenceStatus";
import type { CumulusComponent } from "../registry";

function CoopPresenceStatusDemo({
  count = 2,
  visible = true,
}: {
  count?: number | null;
  visible?: boolean;
}) {
  return <CoopPresenceStatus count={count} visible={visible} />;
}

export const coopPresenceStatusDemo: CumulusComponent = {
  id: "coop-presence-status",
  title: "Coop Presence Status",
  blurb:
    "The compact, non-interactive app chrome that reports connected room participants from an explicit view-model count.",
  callout:
    "Supply visibility from app chrome state rather than hiding the status with injected presentation rules.",
  relatedSystems: ["journey-screen-host-chrome"],
  group: "Components",
  docName: "CoopPresenceStatus",
  Component: CoopPresenceStatusDemo,
  usage: [
    {
      code: `import { CoopPresenceStatus } from "src/cumulus/components/hud/CoopPresenceStatus";

<CoopPresenceStatus count={connectedCount} visible={showConnectedCount} />`,
    },
  ],
  demo: { defaultArgs: { count: 2, visible: true } },
};
