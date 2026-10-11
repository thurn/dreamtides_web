import { event } from "../../engine/dsl/builders";
import { discover } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Beacon of Tomorrow",
  mtgName: "Finale of Devastation",
  id: "331e2846-85d1-4667-8c64-dc6c21a418ed",
  renderedText: "Choose a value of X. Discover a character with cost X●.",
  energyCost: 1,
  cardType: "Event",
  subtype: "",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: null,
  tags: ["Discover", "tutorial", "Art Owned"],
  imageNumber: 1633431262,
  artOwned: true,
  cardNumber: 467,
  isStarter: false,
  abilities: () => [event(discover({ cardType: "character" }, { chooseCost: true }))],
  verifiedText: "b3yicu7z55",
});
