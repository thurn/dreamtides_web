import { abandonCost, activated, discardCost, enemyCharacter, exhaustSelf, target } from "../../engine/dsl/builders";
import { dissolve, materializeFigments } from "../../engine/effects/primitives";
import { parseFigmentId } from "../../engine/state/ids";
import warrior from "../figments/warrior-bb1a5acd";
import { card } from "../define";

export default card({
  name: "Ash Harbinger",
  mtgName: "Asmoranomardicadaistinaculdacar",
  id: "956aaeb1-5280-4294-bf80-73079f35c5f6",
  renderedText:
    "☾, Discard a card: Materialize a 1✦ warrior figment.\n\n☾, Abandon 2 warrior figments: Dissolve a ≤4✦ enemy.",
  amplifiedText:
    "☾, Discard a card: Materialize a 2✦ warrior figment.\n\n☾, Abandon 2 warrior figments: Dissolve a ≤4✦ enemy.",
  energyCost: 2,
  cardType: "Character",
  subtype: "Ancient",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: 2,
  tags: ["Removal", "Figment Maker", "Art Rework", "Art OK", "Art Owned"],
  imageNumber: 682942723,
  artOwned: false,
  cardNumber: 330,
  art: { x: 0.779, y: 0.574, scale: 1.47 },
  isStarter: false,
  abilities: (variant) => [
    activated([exhaustSelf(), discardCost()], materializeFigments(parseFigmentId(warrior.id), 1, { spark: variant.amplified ? 2 : 1 })),
    activated([exhaustSelf(), abandonCost({ subtype: "Warrior", figment: true }, 2)], dissolve(target(enemyCharacter({ sparkAtMost: 4 })))),
  ],
  verifiedText: "17edcyr8xv3",
});
