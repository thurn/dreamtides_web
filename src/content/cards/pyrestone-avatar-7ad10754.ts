import { all, characterYouControl, keyword, staticAbility } from "../../engine/dsl/builders";
import { grant } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Pyrestone Avatar",
  mtgName: "Anger",
  id: "7ad10754-690c-45fa-abe6-28944da6eef6",
  renderedText: "Offering\n\nCharacters you control have awakened.",
  energyCost: 4,
  cardType: "Character",
  subtype: "Visitor",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 2,
  tags: ["Ally Audit"],
  imageNumber: 1109402492,
  artOwned: false,
  cardNumber: 165,
  isStarter: false,
  abilities: () => [keyword("offering"), staticAbility(grant(all(characterYouControl()), "awakened"))],
  verifiedText: "1u7pb3x60m",
});
