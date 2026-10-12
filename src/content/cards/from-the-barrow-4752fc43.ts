import { energy, event, everyIn, thisCardIn } from "../../engine/dsl/builders";
import { either, triggered, untilEndOfTurn, whenDiscardSelf, whenErodeSelf } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "From the Barrow",
  mtgName: "Past in Flames",
  id: "4752fc43-6696-4bc3-88d0-4d5b97622fa8",
  renderedText:
    "Until end of turn, events in your void gain reclaim.\n\nWhen you discard or erode this card, it gains reclaim 3●.",
  energyCost: 5,
  cardType: "Event",
  subtype: "",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: null,
  tags: [],
  imageNumber: 478671142,
  artOwned: false,
  cardNumber: 496,
  art: { x: 0.228, y: 1, scale: 1.17 },
  isStarter: false,
  abilities: () => [
    event(p.grantReclaim(everyIn("void", { cardType: "event" }), { duration: untilEndOfTurn() })),
    triggered(either(whenDiscardSelf(), whenErodeSelf()), p.grantReclaim(thisCardIn("void"), { costs: [energy(3)] }), { zone: "void" }),
  ],
  verifiedText: "1o0bqvac7ek",
});
