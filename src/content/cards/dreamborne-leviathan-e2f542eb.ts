import { triggered, whenYouPlay } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";
import { parseFigmentId } from "../../engine/state/ids";
import spiritAnimal from "../figments/spirit-animal-1745ab81";
import { card } from "../define";

export default card({
  name: "Dreamborne Leviathan",
  mtgName: "Elvish Warmaster",
  id: "e2f542eb-090f-4a22-a42c-a120eb6caaa3",
  renderedText:
    "Once per turn, when you play a spirit animal, materialize a 1✦ spirit animal figment.",
  amplifiedText:
    "Once per turn, when you play a spirit animal, materialize a 2✦ spirit animal figment.",
  energyCost: 2,
  cardType: "Character",
  subtype: "Spirit Animal",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: 2,
  tags: ["Art Owned"],
  imageNumber: 1723965970,
  artOwned: false,
  cardNumber: 180,
  art: { x: 0.294, y: 1, scale: 1.17 },
  isStarter: false,
  abilities: (variant) => [
    // Matches the played card's subtype as it was played (RD-hv-7x4l.34-1); "once per turn" limits
    // triggering (RD-hv-7x4l.6-5). It works in play, so its own play does not trigger it.
    triggered(
      whenYouPlay({ subtype: "Spirit Animal" }),
      p.materializeFigments(parseFigmentId(spiritAnimal.id), 1, { spark: variant.amplified ? 2 : 1 }),
      { oncePerTurn: true },
    ),
  ],
  verifiedText: "wmnz46gzwb",
});
