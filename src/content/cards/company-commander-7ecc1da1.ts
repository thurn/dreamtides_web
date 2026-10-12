import { self } from "../../engine/dsl/builders";
import { triggered, whenYouPlay } from "../../engine/dsl/triggers";
import { gainSpark } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Company Commander",
  mtgName: "Patchwork Automaton",
  id: "7ecc1da1-dc39-4596-9a1d-262a261ffeea",
  renderedText: "When you play a warrior, this character gains +1✦.",
  amplifiedText: "When you play a warrior, this character gains +2✦.",
  energyCost: 2,
  cardType: "Character",
  subtype: "Warrior",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: 2,
  tags: ["tutorial", "Art Owned"],
  imageNumber: 1798382140,
  artOwned: true,
  cardNumber: 343,
  art: { x: -0.045, y: 0.64, scale: 1.47 },
  isStarter: false,
  abilities: (variant) => [triggered(whenYouPlay({ subtype: "Warrior" }), gainSpark(self(), variant.amplified ? 2 : 1))],
  verifiedText: "1b749lwhdfd",
});
