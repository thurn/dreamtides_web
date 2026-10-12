import { triggered, whenYouPlay } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";
import { parseFigmentId } from "../../engine/state/ids";
import warrior from "../figments/warrior-bb1a5acd";
import { card } from "../define";

export default card({
  name: "Battle Herald",
  mtgName: "Sai, Master Thopterist",
  id: "90a6a7a0-b739-475e-8379-647741aab423",
  renderedText: "When you play a warrior, materialize a 1✦ warrior figment.",
  amplifiedText: "When you play a warrior, materialize a 2✦ warrior figment.",
  energyCost: 3,
  cardType: "Character",
  subtype: "Emissary",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: 2,
  tags: ["Figment Maker", "Art Rework", "Art OK", "tutorial", "Art Owned"],
  imageNumber: 309018608,
  artOwned: false,
  cardNumber: 82,
  art: { x: 0.206, y: -0.374, scale: 2.57 },
  isStarter: false,
  abilities: (variant) => [
    // Matches the played card's subtype as it was played (RD-hv-7x4l.34-1). Figments are materialized, not
    // played, so the figments it makes do not trigger it.
    triggered(
      whenYouPlay({ subtype: "Warrior" }),
      p.materializeFigments(parseFigmentId(warrior.id), 1, {
        spark: variant.amplified ? 2 : 1,
      }),
    ),
  ],
  verifiedText: "2e9fqgdpl5u",
});
