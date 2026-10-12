import { triggered, whenYouPlay } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";
import { parseFigmentId } from "../../engine/state/ids";
import ethereal from "../figments/ethereal-3eddb1b8";
import { card } from "../define";

export default card({
  name: "Gateweaver",
  mtgName: "Young Pyromancer",
  id: "b6d1df72-d989-4689-a599-4490a0c2568d",
  renderedText: "When you play an event, materialize a 1✦ ethereal figment.",
  amplifiedText: "When you play an event, materialize a 2✦ ethereal figment.",
  energyCost: 2,
  cardType: "Character",
  subtype: "Mage",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 1,
  tags: ["Figment Maker", "Event Payoff"],
  imageNumber: 1913887477,
  artOwned: false,
  cardNumber: 176,
  art: { x: 0, y: 1, scale: 1.27 },
  isStarter: false,
  abilities: (variant) => [
    triggered(
      whenYouPlay({ cardType: "event" }),
      p.materializeFigments(parseFigmentId(ethereal.id), 1, {
        spark: variant.amplified ? 2 : 1,
      }),
    ),
  ],
  verifiedText: "at7ef2zo6m",
});
