import { abandonSelfCost, activated, discardHandCost, exhaustSelf } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Gilded Catalyst",
  mtgName: "Diamond Lion",
  id: "0bddeb19-ff49-4a77-bc06-955377ba3ed1",
  renderedText: "☾, Discard your hand, abandon this character: Gain 3●.",
  amplifiedText: "☾, Discard your hand, abandon this character: Gain 4●.",
  energyCost: 1,
  cardType: "Character",
  subtype: "Warrior",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: 2,
  tags: ["Art Rework", "Art OK"],
  imageNumber: 2189428529,
  artOwned: false,
  cardNumber: 485,
  art: { x: -0.024, y: 0.669, scale: 1.67 },
  isStarter: false,
  abilities: (v) => [activated([exhaustSelf(), discardHandCost(), abandonSelfCost()], p.gainEnergy(v.amplified ? 4 : 3))],
  verifiedText: "29mwuz8279r",
});
