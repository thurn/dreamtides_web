import { alternativeCost, energy, event, enemyCharacter, giveOpponentPointsCost, target } from "../../engine/dsl/builders";
import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import { dissolve } from "../../engine/effects/primitives/dissolve";
import { card } from "../define";

export default card({
  name: "Final Gambit",
  mtgName: "Dismember",
  id: "a56e0f68-30b6-404e-9b83-a7584177f21e",
  renderedText:
    "You may play this card for 0● by giving the opponent 5⍟. Dissolve an enemy.",
  energyCost: 3,
  cardType: "Event",
  subtype: "",
  rarity: "Rare",
  isFast: true,
  isInterrupt: true,
  spark: null,
  tags: ["Art Rework", "Art OK"],
  imageNumber: 2530614283,
  artOwned: true,
  cardNumber: 500,
  art: { x: 0, y: 0.814, scale: 1 },
  isStarter: false,
  abilities: () => [alternativeCost(energy(0), giveOpponentPointsCost(5)), event(dissolve(target(enemyCharacter())))],
  verifiedText: expectedVerifiedText("You may play this card for 0● by giving the opponent 5⍟. Dissolve an enemy."),
});
