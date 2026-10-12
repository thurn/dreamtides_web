import { abandonCost, additionalCost, choiceCost, discardCost, enemyCharacter, event, target } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Desperation",
  mtgName: "Bone Shards",
  id: "625fe37e-8059-481c-99fd-109fd02ceedd",
  renderedText:
    "To play this event, abandon a character or discard a card. Dissolve an enemy.",
  energyCost: 1,
  cardType: "Event",
  subtype: "",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: null,
  tags: ["Removal", "Art Rework", "Art OK"],
  imageNumber: 1470059006,
  artOwned: false,
  cardNumber: 331,
  isStarter: false,
  abilities: () => [
    additionalCost(choiceCost([abandonCost()], [discardCost()])),
    event(p.dissolve(target(enemyCharacter()))),
  ],
  verifiedText: "wyyfqra46g",
});
