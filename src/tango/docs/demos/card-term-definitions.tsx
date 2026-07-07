import { CardTermDefinitions } from "../../components/card/CardTermDefinitions";
import type { TangoComponent } from "../registry";

function CardTermDefinitionsDemo(args: Record<string, unknown>) {
  return (
    <CardTermDefinitions
      text={
        typeof args.text === "string"
          ? args.text
          : "Support and Reclaim keep a card's engine legible beside the preview."
      }
      side={args.side === "left" ? "left" : "right"}
      testId={typeof args.testId === "string" ? args.testId : undefined}
    />
  );
}

export const cardTermDefinitionsDemo: TangoComponent = {
  id: "card-term-definitions",
  title: "Card Term Definitions",
  blurb:
    "A stacked glossary panel for every gameplay term found in rules text, rendered as consistent InfoCard definition tiles.",
  group: "Components",
  docName: "CardTermDefinitions",
  Component: CardTermDefinitionsDemo,
  usage: [
    {
      code: `import { CardTermDefinitions } from "src/tango/components/card/CardTermDefinitions";

<CardTermDefinitions text={card.renderedText} side="right" />`,
    },
  ],
  demo: {
    defaultArgs: {
      text: "Support and Reclaim keep a card's engine legible beside the preview.",
      side: "right",
      testId: "",
    },
  },
};
