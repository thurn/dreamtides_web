import { activated, characterYouControl, count, exhaustSelf } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Blazing Emberwing",
  mtgName: "Circle of Dreams Druid",
  id: "18ff6a45-148a-40bf-85ae-4a51f32f406a",
  renderedText: "☾: Gain 1● for each character you control.",
  energyCost: 3,
  cardType: "Character",
  subtype: "Spirit Animal",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: 3,
  tags: ["Spirit Lord", "Ally Audit", "Art Owned"],
  imageNumber: 2123360855,
  artOwned: false,
  cardNumber: 265,
  isStarter: false,
  abilities: () => [activated([exhaustSelf()], p.gainEnergy(count(characterYouControl())))],
  verifiedText: "25nj8x3kb55",
});
