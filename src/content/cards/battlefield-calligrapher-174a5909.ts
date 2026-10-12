import { triggered, whenYouPlay } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";
import { parseFigmentId } from "../../engine/state/ids";
import warrior from "../figments/warrior-bb1a5acd";
import { card } from "../define";

export default card({
  name: "Battlefield Calligrapher",
  mtgName: "Saheeli, Sublime Artificer",
  id: "174a5909-48e2-4aab-8cc5-fa3292281d1d",
  renderedText: "When you play an event, materialize a 1✦ warrior figment.",
  amplifiedText: "When you play an event, materialize a 2✦ warrior figment.",
  energyCost: 2,
  cardType: "Character",
  subtype: "Mage",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: 2,
  tags: ["Figment Maker", "Event Payoff", "Art Rework", "Art OK"],
  imageNumber: 2320845233,
  artOwned: false,
  cardNumber: 259,
  art: { x: 0, y: -0.266, scale: 2.57 },
  isStarter: false,
  abilities: (variant) => [
    triggered(
      whenYouPlay({ cardType: "event" }),
      p.materializeFigments(parseFigmentId(warrior.id), 1, {
        spark: variant.amplified ? 2 : 1,
      }),
    ),
  ],
  verifiedText: "1ugomclru4f",
});
