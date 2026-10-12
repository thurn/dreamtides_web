import {
  activated,
  characterYouControl,
  exhaustSelf,
  keyword,
  self,
  target,
} from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Duskmount Rider",
  mtgName: "Soulherder",
  id: "58f0dba2-1bf9-4cb3-bb5d-e1b6e3067a6c",
  renderedText:
    "Awakened\n\n☾: Rematerialize a character you control. This character gains +1✦.",
  amplifiedText:
    "Awakened\n\n☾: Rematerialize a character you control. This character gains +2✦.",
  energyCost: 3,
  cardType: "Character",
  subtype: "Visitor",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: 2,
  tags: ["Art Rework", "Ally Audit", "Art OK"],
  imageNumber: 768349750,
  artOwned: false,
  cardNumber: 481,
  art: { x: 0, y: -0.668, scale: 1.67 },
  isStarter: false,
  abilities: (variant) => [
    keyword("awakened"),
    activated(
      [exhaustSelf()],
      p.sequence(
        p.rematerialize(target(characterYouControl())),
        p.gainSpark(self(), variant.amplified ? 2 : 1),
      ),
    ),
  ],
  verifiedText: "kd3jeakyi8",
});
