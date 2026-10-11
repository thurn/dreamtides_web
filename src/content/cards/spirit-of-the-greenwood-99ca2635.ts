import { activated, characterYouControl, count, energy, exhaustSelf, keyword } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Spirit of the Greenwood",
  mtgName: "Gaea's Cradle",
  id: "99ca2635-a91a-46ba-a9d3-4d2581c354f3",
  renderedText: "Awakened\n\n1●, ☾: Gain 1● for each character you control.",
  energyCost: 1,
  cardType: "Character",
  subtype: "Spirit Animal",
  rarity: "Legendary",
  isFast: false,
  isInterrupt: false,
  spark: 1,
  tags: ["Spirit Lord", "Ally Audit", "Art Owned"],
  imageNumber: 2303852065,
  artOwned: false,
  cardNumber: 244,
  art: { x: 0.059, y: 0, scale: 1.67 },
  isStarter: false,
  abilities: () => [keyword("awakened"), activated([energy(1), exhaustSelf()], p.gainEnergy(count(characterYouControl())))],
  verifiedText: "1idtylsuv67",
});
