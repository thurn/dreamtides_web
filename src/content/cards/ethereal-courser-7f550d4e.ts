import { self } from "../../engine/dsl/builders";
import { triggered, whenYouPlay } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Ethereal Courser",
  mtgName: "Nettle Sentinel",
  id: "7f550d4e-c6a1-4e5e-ae0c-1b3edd6f0f4a",
  renderedText:
    "When you play a spirit animal, return this character to hand. It costs 0● this turn.",
  energyCost: 1,
  cardType: "Character",
  subtype: "Spirit Animal",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 1,
  tags: ["Art Rework", "Art OK", "Art Owned"],
  imageNumber: 2127752123,
  artOwned: false,
  cardNumber: 446,
  art: { x: -0.084, y: -0.29, scale: 1.37 },
  isStarter: false,
  abilities: () => [
    triggered(
      whenYouPlay({ subtype: "Spirit Animal" }),
      p.modifyCardCost(p.returnToHand(self()), { set: 0 }, { duration: "untilEndOfTurn" }),
    ),
  ],
  verifiedText: "18jvrscifnd",
});
