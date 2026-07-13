import { CardBack } from "../../components/battle/CardBack";
import type { TangoComponent } from "../registry";

function CardBackDemo(args: Record<string, unknown>) {
  const label = typeof args.label === "string" ? args.label : "Face-down card";
  return (
    <div style={{ width: 112 }}>
      <CardBack label={label} />
    </div>
  );
}

export const cardBackDemo: TangoComponent = {
  id: "card-back",
  title: "Card Back",
  blurb:
    "The canonical face-down Dreamtides card object: the shipped card-back sprite on the shared 5:7 card geometry, with fixed crop, edge, and elevation.",
  callout:
    "CardBack owns its appearance and takes only an accessible label plus an optional test id. Size and place it through a wrapper.",
  group: "Components",
  docName: "CardBack",
  Component: CardBackDemo,
  usage: [
    {
      note: "A face-down card in a named zone. The label is available to assistive technology and is not painted on the card.",
      code: `import { CardBack } from "src/tango/components/battle/CardBack";

<div style={{ width: 96 }}>
  <CardBack label="Face-down enemy card" />
</div>`,
    },
  ],
  demo: {
    defaultArgs: {
      label: "Face-down card",
    },
  },
};
