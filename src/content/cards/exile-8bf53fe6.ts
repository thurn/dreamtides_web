import { characterYouControl, count, enemyCharacter, event, staticAbility, target } from "../../engine/dsl/builders";
import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import { dissolve, selfCostReduction } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Exile",
  mtgName: "Lethal Scheme",
  id: "8bf53fe6-8a25-401e-9a99-84343a026bb0",
  renderedText:
    "This event costs 1● less for each character you control. Dissolve an enemy.",
  energyCost: 4,
  cardType: "Event",
  subtype: "",
  rarity: "Common",
  isFast: true,
  isInterrupt: true,
  spark: null,
  tags: ["Removal", "Art Rework", "Ally Audit", "Art OK"],
  imageNumber: 432001897,
  artOwned: false,
  cardNumber: 182,
  art: { x: 0, y: 1, scale: 1.11 },
  isStarter: false,
  abilities: () => [
    staticAbility(selfCostReduction(count(characterYouControl())), { zone: "any" }),
    event(dissolve(target(enemyCharacter()))),
  ],
  verifiedText: expectedVerifiedText("This event costs 1● less for each character you control. Dissolve an enemy."),
});
