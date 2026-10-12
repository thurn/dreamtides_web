import { enemyCharacter, event, keyword, target } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Veil Shatter",
  mtgName: "March of Otherworldly Light",
  id: "c96c6c7f-c0fe-4272-b856-a54ace01f596",
  renderedText: "Offering\n\nBanish a ≤3● cost enemy.",
  amplifiedText: "Offering\n\nBanish a ≤4● cost enemy.",
  energyCost: 2,
  cardType: "Event",
  subtype: "",
  rarity: "Common",
  isFast: true,
  isInterrupt: true,
  spark: null,
  tags: ["Art Owned"],
  imageNumber: 2033123279,
  artOwned: true,
  cardNumber: 398,
  isStarter: false,
  abilities: (variant) => [
    keyword("offering"),
    event(p.banish(target(enemyCharacter({ costAtMost: variant.amplified ? 4 : 3 })))),
  ],
  verifiedText: "2gnibtrjnyi",
});
