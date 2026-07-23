import {
  DreamcallerAbilityText,
  type DreamcallerAbilityTextProps,
} from "../../components/hud/DreamcallerAbilityText";
import type { CumulusComponent } from "../registry";

const SAMPLE_DREAMCALLER_ID = "11111111-1111-4111-8111-111111111111";
const SAMPLE_ABILITY = [
  "↯fast",
  "❖❖ – 2●, ☪: Return a card from your void.",
  "▸Night: Draw a card.",
].join("\n");

interface DreamcallerAbilityTextDemoArgs {
  dreamcallerId?: string;
  text?: string;
  presentation?: DreamcallerAbilityTextProps["presentation"];
}

function DreamcallerAbilityTextDemo({
  dreamcallerId = SAMPLE_DREAMCALLER_ID,
  text = SAMPLE_ABILITY,
  presentation = "natural",
}: DreamcallerAbilityTextDemoArgs) {
  return (
    <DreamcallerAbilityText
      dreamcallerId={dreamcallerId}
      text={text}
      presentation={presentation}
    />
  );
}

export const dreamcallerAbilityTextDemo: CumulusComponent = {
  id: "dreamcaller-ability-text",
  title: "Dreamcaller Ability Text",
  blurb:
    "The complete Dreamcaller rules-text source: hovering, focusing, or touch-holding anywhere in the ability reveals one compact title-free card containing every defined term in reading order.",
  group: "Components",
  docName: "DreamcallerAbilityText",
  Component: DreamcallerAbilityTextDemo,
  usage: [
    {
      note: "Pass the Dreamcaller UUID and complete rendered rules text. Use the selection-card presentation for the aligned desktop offer triptych.",
      code: `import { DreamcallerAbilityText } from "src/cumulus/components/hud/DreamcallerAbilityText";

<DreamcallerAbilityText
  dreamcallerId={dreamcaller.id}
  text={dreamcaller.renderedText}
  presentation="selectionCard"
/>`,
    },
  ],
  demo: {
    defaultArgs: {
      dreamcallerId: SAMPLE_DREAMCALLER_ID,
      text: SAMPLE_ABILITY,
      presentation: "natural",
    },
  },
};
