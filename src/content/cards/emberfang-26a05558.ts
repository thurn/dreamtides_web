import { activated, characterYouControl, energy, exhaustSelf, target } from "../../engine/dsl/builders";
import { triggered, triggeringCard, whenGainsSpark } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Emberfang",
  mtgName: "Zabaz, the Glimmerwasp",
  id: "26a05558-4692-43d2-ae6c-a6eb385a6d22",
  renderedText:
    "When a character you control gains ✦, it gains an additional +1✦.\n\n2●, ☾: Give a character you control +1✦.",
  energyCost: 1,
  cardType: "Character",
  subtype: "Warrior",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: 2,
  tags: ["Art Rework", "Art OK", "Ally Audit", "tutorial", "Art Owned"],
  imageNumber: 2186149275,
  artOwned: false,
  cardNumber: 168,
  art: { x: 0.714, y: 0.31, scale: 1.17 },
  isStarter: false,
  abilities: () => [
    triggered(whenGainsSpark(characterYouControl()), p.gainAdditionalSpark(triggeringCard(), 1)),
    activated([energy(2), exhaustSelf()], p.gainSpark(target(characterYouControl()), 1)),
  ],
  verifiedText: "1nycl9n9zws",
});
