import { ofSubtype, staticAbility } from "../../engine/dsl/builders";
import { costModifier } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Sun Clan Lieutenant",
  mtgName: "Lodestone Golem",
  id: "243a15d3-a4eb-415c-b106-86d4a2b7ec6a",
  renderedText: "Warriors cost you 1● less.",
  energyCost: 4,
  cardType: "Character",
  subtype: "Warrior",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: 4,
  tags: ["tutorial"],
  imageNumber: 2295991865,
  artOwned: false,
  cardNumber: 109,
  art: { x: -0.168, y: 0.839, scale: 1.17 },
  isStarter: false,
  abilities: () => [staticAbility(costModifier("you", ofSubtype("Warrior"), -1))],
  verifiedText: "heewn724xj",
});
