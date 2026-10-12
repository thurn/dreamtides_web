import { characterYouControl, count, ofSubtype, self, staticAbility } from "../../engine/dsl/builders";
import { sparkModifier } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Blade of Unity",
  mtgName: "Michiko's Reign of Truth // Portrait of Michiko",
  id: "7947e9db-a85e-4277-a42a-8d45f7475295",
  renderedText: "This character has +1✦ for each warrior you control.",
  energyCost: 2,
  cardType: "Character",
  subtype: "Warrior",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 2,
  tags: ["Spark Scaler", "Art Rework", "Art OK", "Ally Audit", "tutorial"],
  imageNumber: 2667786599,
  artOwned: false,
  cardNumber: 201,
  art: { x: 0, y: -0.346, scale: 1.57 },
  isStarter: false,
  abilities: () => [staticAbility(sparkModifier(self(), count(characterYouControl(ofSubtype("Warrior")))))],
  verifiedText: "1jdn4p7priz",
});
