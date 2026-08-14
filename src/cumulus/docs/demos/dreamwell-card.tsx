import { assertLocalized } from "@trox/runtime";
import { asCardId } from "../../../types/card-identity";
import {
  DreamwellCard,
  type DreamwellCardModel,
} from "../../components/battle/DreamwellCard";
import type { CumulusComponent } from "../registry";

const CARD_ID = asCardId("3a4293da-55a1-4094-898a-df402ffa1c92");

const MODEL: DreamwellCardModel = {
  cardId: CARD_ID,
  displaySnapshot: {
    id: CARD_ID,
    name: assertLocalized("Shining Beacon"),
    renderedText: assertLocalized(
      "Look at the top 2 cards of your deck. Put one into your hand and the other on the bottom of your deck.",
    ),
    energyAdded: 2,
    imageNumber: 1252796548,
  },
};

function DreamwellCardDemo() {
  return (
    <div style={{ width: 360 }}>
      <DreamwellCard model={MODEL} />
    </div>
  );
}

export const dreamwellCardDemo: CumulusComponent = {
  id: "dreamwell-card",
  title: "Dreamwell Card",
  blurb:
    "The static landscape card drawn from the Dreamwell: UUID-keyed art, energy grant, name, and complete rules text in one readable object.",
  callout: "Size and place the card through a wrapper.",
  details: ["DreamwellCard performs no entrance, exit, or idle animation."],
  group: "Components",
  docName: "DreamwellCard",
  Component: DreamwellCardDemo,
  usage: [
    {
      note: "Resolve a Dreamwell definition by UUID, build its complete display snapshot, and let the containing battle surface own its width and overlap.",
      code: `import { DreamwellCard } from "src/cumulus/components/battle/DreamwellCard";

<div style={{ width: 360 }}>
  <DreamwellCard model={dreamwellCardModel} />
</div>`,
    },
  ],
  demo: { defaultArgs: {} },
};
