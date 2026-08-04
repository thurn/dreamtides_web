import type { CardData } from "../../../types/cards";
import { asCardId, asCardName } from "../../../types/card-identity";
import {
  EntityReference,
  type EntityReferenceModel,
} from "../../components/card/EntityReference";
import type { CumulusComponent } from "../registry";

const SAMPLE_CARD: CardData = {
  id: asCardId("11111111-1111-4111-8111-111111111111"),
  name: asCardName("Woodland Apparition"),
  cardNumber: 42,
  cardType: "Character",
  subtype: "Spirit Animal",
  isStarter: false,
  energyCost: 3,
  spark: 4,
  isFast: false,
  renderedText: "Support — Supported allies have +1✦.",
  imageNumber: 42,
  artOwned: true,
};
const SAMPLE_ENTITY: EntityReferenceModel = {
  kind: "card",
  card: SAMPLE_CARD,
};

function EntityReferenceDemo({
  entity = SAMPLE_ENTITY,
}: {
  entity?: EntityReferenceModel;
}) {
  return (
    <p>
      Gain <EntityReference entity={entity} />.
    </p>
  );
}

export const entityReferenceDemo: CumulusComponent = {
  id: "entity-reference",
  title: "Entity Reference",
  blurb:
    "An inline, underlined card or Dreamsign name that reveals the canonical full entity on hover, keyboard focus, or touch hold through the shared coordinator.",
  callout:
    "Resolve the complete entity by UUID immediately before rendering. The component owns the displayed name and reveal model so duplicate names cannot affect identity; pass copies when prose names several identical card objects.",
  group: "Components",
  docName: "EntityReference",
  Component: EntityReferenceDemo,
  usage: [
    {
      label: "Card name in prose",
      note: "Use the resolved UUID-backed card data; the inline source shares the same complete reading copy as GameCard.",
      code: `import { EntityReference } from "src/cumulus/components/card/EntityReference";

<p>
  Gain <EntityReference entity={{ kind: "card", card }} />.
</p>`,
    },
    {
      label: "Transfigured card name in prose",
      note: "Pass the resolved transfigured card snapshot and display descriptor so the reveal paints the applied form.",
      code: `import { EntityReference } from "src/cumulus/components/card/EntityReference";

<p>
  Apply Inspired to <EntityReference entity={{
    kind: "card",
    card: preview.card,
    transfiguration: preview.display,
  }} />.
</p>`,
    },
    {
      label: "Dreamsign name in prose",
      note: "Pass the resolved Dreamsign object to reuse its canonical object InfoCard and rules definitions.",
      code: `import { EntityReference } from "src/cumulus/components/card/EntityReference";

<p>
  Gain <EntityReference entity={{ kind: "dreamsign", dreamsign }} />.
</p>`,
    },
    {
      label: "Repeated card objects",
      note: "Pass the exact copy count when the sentence grants several identical cards; the reveal fans that many canonical card objects.",
      code: `import { EntityReference } from "src/cumulus/components/card/EntityReference";

<p>
  Gain 3 <EntityReference entity={{ kind: "card", card, copies: 3 }} /> cards.
</p>`,
    },
  ],
  demo: {
    defaultArgs: {},
    sampleContent: {
      entity: SAMPLE_ENTITY,
    },
  },
};
