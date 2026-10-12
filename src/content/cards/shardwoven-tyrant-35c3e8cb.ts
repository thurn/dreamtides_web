import { abandonXCost, activated, energy, enemyCharacter, target, x } from "../../engine/dsl/builders";
import { onDawn, triggered } from "../../engine/dsl/triggers";
import { dissolve, materializeFigments } from "../../engine/effects/primitives";
import { parseFigmentId } from "../../engine/state/ids";
import ethereal from "../figments/ethereal-3eddb1b8";
import { card } from "../define";

export default card({
  name: "Shardwoven Tyrant",
  mtgName: "Chatterfang, Squirrel General",
  id: "35c3e8cb-dc59-4f5c-98c8-fd764fb36d2b",
  renderedText:
    "▸Dawn: Materialize 1✦ ethereal figment.\n\n1●, Abandon X figments: Dissolve an enemy with X✦.",
  amplifiedText:
    "▸Dawn: Materialize a 2✦ ethereal figment.\n\n1●, Abandon X figments: Dissolve an enemy with X✦.",
  energyCost: 3,
  cardType: "Character",
  subtype: "Ancient",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 2,
  tags: ["Art Rework", "Art OK"],
  imageNumber: 1180104511,
  artOwned: false,
  cardNumber: 432,
  art: { x: 0.175, y: 1, scale: 2.07 },
  isStarter: false,
  verifiedText: "e14k3w5f5t",
  abilities: (variant) => [
    triggered(onDawn(), materializeFigments(parseFigmentId(ethereal.id), 1, { spark: variant.amplified ? 2 : 1 })),
    activated([energy(1), abandonXCost({ selector: { figment: true } })], dissolve(target(enemyCharacter({ sparkAtLeast: x(), sparkAtMost: x() })))),
  ],
});
