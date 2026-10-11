import { abandonCostCapture, activated, x } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Dune Reaper",
  mtgName: "Altar of Dementia",
  id: "77f31db4-0397-49a7-8886-f5459ee960e9",
  renderedText:
    "Abandon a character: A player erodes X, where X is that character's cost.",
  energyCost: 3,
  cardType: "Character",
  subtype: "Warrior",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: 3,
  tags: ["Art Rework", "Art OK"],
  imageNumber: 2639857441,
  artOwned: false,
  cardNumber: 488,
  art: { x: -0.322, y: 1, scale: 1.11 },
  isStarter: false,
  abilities: () => [activated([abandonCostCapture()], p.choosePlayer((player) => p.erode(x(), player)))],
  verifiedText: "1kpl0u6f8nt",
});
