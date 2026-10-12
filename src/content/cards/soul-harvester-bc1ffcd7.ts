import {
  abandonCost,
  activated,
  energy,
  exhaustSelf,
  self,
} from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Soul Harvester",
  mtgName: "Priest of Forgotten Gods",
  id: "bc1ffcd7-36c3-43b7-871b-bc2e6b3d0034",
  renderedText:
    "2●, ☾, Abandon two other characters: This character gains +2✦. Draw 2 cards.",
  amplifiedText:
    "2●, ☾, Abandon two other characters: This character gains +3✦. Draw 2 cards.",
  energyCost: 3,
  cardType: "Character",
  subtype: "Ancient",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 4,
  tags: ["Art Rework", "Art OK"],
  imageNumber: 2285036629,
  artOwned: false,
  cardNumber: 226,
  art: { x: 0.3, y: 1, scale: 1.47 },
  isStarter: false,
  abilities: (variant) => [
    activated(
      [energy(2), exhaustSelf(), abandonCost({ another: true }, 2)],
      p.sequence(p.gainSpark(self(), variant.amplified ? 3 : 2), p.draw(2)),
    ),
  ],
  verifiedText: "7on8rhopgj",
});
