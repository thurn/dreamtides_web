import { card } from "../define";
import { conditionCardCounts, event, playCondition } from "../../engine/dsl/builders";
import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import { gainEnergy } from "../../engine/effects/primitives/gain-energy";

export default card({
  name: "Nebula's Wake",
  mtgName: "Cabal Ritual",
  id: "4d4618bd-4779-4953-b446-dab05e1da5db",
  renderedText:
    "Play this event only if there are 3 or more events in your void. Gain 5●.",
  amplifiedText:
    "Play this event only if there are 2 or more events in your void. Gain 5●.",
  energyCost: 2,
  cardType: "Event",
  subtype: "",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: null,
  tags: ["Ritual", "Art Rework", "Art OK"],
  imageNumber: 591626951,
  artOwned: false,
  cardNumber: 126,
  isStarter: false,
  abilities: (variant) => [
    playCondition(conditionCardCounts("void", variant.amplified ? 2 : 3, { filter: { cardType: "event" } })),
    event(gainEnergy(5)),
  ],
  verifiedText: expectedVerifiedText(
    "Play this event only if there are 3 or more events in your void. Gain 5●.",
    "Play this event only if there are 2 or more events in your void. Gain 5●.",
  ),
});
