import { energy, event, fromVoid, reclaim } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Phantom Flotilla",
  mtgName: "Sevinne's Reclamation",
  id: "3e83cbe2-2b21-4804-9906-4b4735db9869",
  renderedText:
    "Materialize up to two ≤2● cost characters from your void.\n\nReclaim 5●.",
  energyCost: 4,
  cardType: "Event",
  subtype: "",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: null,
  tags: ["Art Owned"],
  imageNumber: 686903113,
  artOwned: false,
  cardNumber: 254,
  art: { x: -0.342, y: 0.608, scale: 1.17 },
  isStarter: false,
  abilities: () => [event(p.materialize(fromVoid({ cardType: "character", costAtMost: 2 }, { count: 2, upTo: true }))), reclaim(energy(5))],
  verifiedText: "1qvvmcr5v6y",
});
