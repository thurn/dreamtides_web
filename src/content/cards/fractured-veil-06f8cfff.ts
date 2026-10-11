import { additionalCost, banishXCost, event, x } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Fractured Veil",
  mtgName: "Dig Through Time",
  id: "06f8cfff-92ec-4668-afbc-f33a274c3b1a",
  renderedText:
    "To play this event, banish X cards from your void. Look at the top X cards of your deck. Put two of them into your hand and the rest on the bottom.",
  energyCost: 2,
  cardType: "Event",
  subtype: "",
  rarity: "Uncommon",
  isFast: true,
  isInterrupt: true,
  spark: null,
  tags: [],
  imageNumber: 2269064815,
  artOwned: false,
  cardNumber: 440,
  isStarter: false,
  abilities: () => [
    additionalCost(banishXCost()),
    event(p.putFromTop(x(), [{ to: "hand", count: 2 }, { to: "bottom", count: "rest" }])),
  ],
  verifiedText: "2dmrayvb9lf",
});
