import { characterYouControl, count, keyword } from "../../engine/dsl/builders";
import { onDawn, triggered } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Silent Gatherer",
  mtgName: "Insidious Roots",
  id: "01298848-1ebb-48a1-b00b-d7e0af890870",
  renderedText: "Veil\n\n▸Dawn: Gain 1● for each figment you control.",
  energyCost: 2,
  cardType: "Character",
  subtype: "Child",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 2,
  tags: ["Art Rework", "Art Duplicate", "Art OK", "Ally Audit"],
  imageNumber: 658076071,
  artOwned: false,
  cardNumber: 111,
  art: { x: 0.344, y: 0.18, scale: 1.37 },
  isStarter: false,
  abilities: () => [keyword("veil"), triggered(onDawn(), p.gainEnergy(count(characterYouControl({ figment: true }))))],
  verifiedText: "ohewewgsmv",
});
