import { event, stackItem } from "../../engine/dsl/builders";
import { prevent } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Cragfall",
  mtgName: "Mana Leak",
  id: "795a7b54-40d5-42f9-bc3a-9e92bc938c2d",
  renderedText:
    "Prevent a played card unless the opponent abandons a non-figment character.",
  energyCost: 1,
  cardType: "Event",
  subtype: "",
  rarity: "Rare",
  isFast: true,
  isInterrupt: true,
  spark: null,
  tags: ["Counterspell", "Art Rework", "Art OK", "Art Owned"],
  imageNumber: 1239919309,
  artOwned: false,
  cardNumber: 266,
  isStarter: false,
  // RD-hv-umm2.98-1: the opponent who controls the played card accepts or declines, then chooses the character.
  abilities: () => [event(prevent(stackItem({ controller: "opponent" }), { unlessAbandons: { figment: false } }))],
  verifiedText: "145z0ekixg8",
});
