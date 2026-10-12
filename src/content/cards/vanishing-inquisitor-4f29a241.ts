import { triggered, whenScores } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Vanishing Inquisitor",
  mtgName: "Moon-Circuit Hacker",
  id: "4f29a241-9265-4669-a189-5a2a91923e12",
  renderedText:
    "Phasing\n\nWhen this character scores ⍟, draw a card, then discard a card.",
  energyCost: 1,
  cardType: "Character",
  subtype: "Outsider",
  rarity: "Common",
  isFast: true,
  isInterrupt: false,
  spark: 1,
  tags: ["Ninja"],
  imageNumber: 461706976,
  artOwned: false,
  cardNumber: 307,
  art: { x: 0, y: 0.665, scale: 1.17 },
  isStarter: false,
  abilities: () => [p.phasing(), triggered(whenScores(), p.sequence(p.draw(1), p.discard(1)))],
  verifiedText: "220v8w6cskp",
});
