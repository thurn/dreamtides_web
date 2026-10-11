import { everyIn, event, x } from "../../engine/dsl/builders";
import { atEndOfTurn } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Borrowed Minutes",
  mtgName: "Rally the Ancestors",
  id: "2a6af0b8-11da-4d4b-8217-3bd7ed399dfa",
  renderedText:
    "Materialize each ≤X● cost character in your void. Banish them at end of turn.",
  energyCost: 1,
  energyCosts: ["1", "X"],
  xMinimum: 0,
  cardType: "Event",
  subtype: "",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: null,
  tags: [],
  imageNumber: 662452591,
  artOwned: false,
  cardNumber: 370,
  isStarter: false,
  abilities: () => [
    event(
      p.withMaterialized(
        p.materialize(everyIn("void", { cardType: "character" }, { costAtMost: x() })),
        p.delayed(atEndOfTurn(), p.banishCards([p.capturedCards()])),
      ),
    ),
  ],
  verifiedText: "dg9bv8tlnw",
});
