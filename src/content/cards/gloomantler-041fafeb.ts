import { conditionCardCounts, staticAbility } from "../../engine/dsl/builders";
import { playFromZone } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Gloomantler",
  mtgName: "Lurrus of the Dream-Den",
  id: "041fafeb-f159-4aba-90c2-3ce4b3038bdc",
  renderedText:
    "Once per turn, if you have one or fewer cards in hand, you may play a character from your void.",
  amplifiedText:
    "Once per turn, if you have two or fewer cards in hand, you may play a character from your void.",
  energyCost: 3,
  cardType: "Character",
  subtype: "Ancient",
  rarity: "Rare",
  isFast: false,
  isInterrupt: false,
  spark: 3,
  tags: [],
  imageNumber: 2218612339,
  artOwned: false,
  cardNumber: 155,
  art: { x: -0.378, y: 1, scale: 1.27 },
  isStarter: false,
  abilities: (variant) => [
    staticAbility(playFromZone("void", { cardType: "character" }, { oncePerTurn: true }), {
      while: conditionCardCounts("hand", 0, { atMost: variant.amplified ? 2 : 1 }),
    }),
  ],
  verifiedText: "25bdz679xi5",
});
