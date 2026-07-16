import { BanishedZoneIndicator } from "../../components/battle/BanishedZoneIndicator";
import type { CumulusComponent } from "../registry";

function BanishedZoneIndicatorDemo(args: Record<string, unknown>) {
  const count = typeof args.count === "number" ? args.count : 3;
  return (
    <div style={{ width: 72 }}>
      <BanishedZoneIndicator
        count={count}
        label="Player banished zone"
        onActivate={() => undefined}
      />
    </div>
  );
}

export const banishedZoneIndicatorDemo: CumulusComponent = {
  id: "banished-zone-indicator",
  title: "Banished Zone Indicator",
  blurb:
    "A rounded symbolic portal for a non-empty banished zone, using fixed ethereal art instead of any card in the zone.",
  callout:
    "Render it only when the zone contains cards. Size and place its wrapper beside the deck; activation opens the shared zone browser.",
  group: "Components",
  docName: "BanishedZoneIndicator",
  Component: BanishedZoneIndicatorDemo,
  usage: [
    {
      code: `import { BanishedZoneIndicator } from "src/cumulus/components/battle/BanishedZoneIndicator";

<BanishedZoneIndicator
  count={banishedCardIds.length}
  label="Player banished zone"
  onActivate={openBanishedBrowser}
/>`,
    },
  ],
  demo: {
    defaultArgs: {
      count: 3,
    },
  },
};
