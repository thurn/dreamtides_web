import { characterYouControl } from "../../engine/dsl/builders";
import { triggered, whenDissolved } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Volcanic Channeler",
  mtgName: "Pitiless Plunderer",
  id: "290ea9db-0340-4838-842a-0dea09b5340a",
  renderedText: "When a character you control is dissolved, gain 1●.",
  energyCost: 4,
  cardType: "Character",
  subtype: "Mage",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: 4,
  tags: ["Ally Audit"],
  imageNumber: 2290648803,
  artOwned: false,
  cardNumber: 277,
  isStarter: false,
  abilities: () => [triggered(whenDissolved(characterYouControl()), p.gainEnergy(1))],
  verifiedText: "vtkdeonil0",
});
