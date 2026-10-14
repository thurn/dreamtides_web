import { card } from "../define";
import { ofSubtype, staticAbility } from "../../engine/dsl/builders";
import { costModifierNth } from "../../engine/effects/primitives";

export default card({
  name: "Tethered Hollow",
  mtgName: "Mishra's Workshop",
  id: "d95533f4-7809-44a8-a882-7675c61cee1c",
  renderedText: "The first warrior you play each turn costs 3● less.",
  energyCost: 1,
  cardType: "Character",
  subtype: "Warrior",
  rarity: "Rare",
  isFast: false,
  isInterrupt: false,
  spark: 1,
  tags: ["tutorial"],
  imageNumber: 465449504,
  artOwned: false,
  cardNumber: 115,
  art: { x: 0.353, y: 0.931, scale: 1.17 },
  isStarter: false,
  abilities: () => [staticAbility(costModifierNth("you", { cardType: "character", ...ofSubtype("Warrior") }, 1, { reduce: 3 }))],
  verifiedText: "1f9cj8kmz2y",
});
