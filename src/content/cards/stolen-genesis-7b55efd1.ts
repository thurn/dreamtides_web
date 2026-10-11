import { abandonCostCapture, additionalCost, energy, event, randomIn, reclaim, x } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Stolen Genesis",
  mtgName: "Diabolic Intent",
  id: "7b55efd1-6d9f-4156-9de7-1c71ccc410cb",
  renderedText:
    "To play this card, abandon a character. Materialize a random character with higher cost from your deck.\n\nReclaim 3●",
  energyCost: 2,
  cardType: "Event",
  subtype: "",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: null,
  tags: [],
  imageNumber: 2293194527,
  artOwned: false,
  cardNumber: 503,
  art: { x: 0.126, y: 1, scale: 1.37 },
  isStarter: false,
  // RD-hv-umm2.83-2: "higher cost" is above the abandoned character's cost, captured as X as the cost is paid.
  abilities: () => [
    additionalCost(abandonCostCapture()),
    event(p.materialize(randomIn("deck", 1, { cardType: "character" }, { costGreaterThan: x() }))),
    reclaim(energy(3)),
  ],
  verifiedText: "1x8bw97gj7x",
});
