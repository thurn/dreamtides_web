import { event } from "../../engine/dsl/builders";
import { gainEnergy } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Arc Gate Opening",
  mtgName: "Desperate Ritual",
  id: "be72bd04-21a6-4035-a117-2b7213ad1a34",
  renderedText: "Gain 4●.",
  amplifiedText: "Gain 5●.",
  energyCost: 1,
  cardType: "Event",
  subtype: "",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: null,
  tags: ["Ritual", "Art OK", "Art Owned"],
  imageNumber: 1164289066,
  artOwned: false,
  cardNumber: 11,
  art: { x: 0.084, y: 1, scale: 1.17 },
  isStarter: false,
  abilities: (variant) => [event(gainEnergy(variant.amplified ? 5 : 4))],
  verifiedText: "110etja2pza",
});
