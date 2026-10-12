import { event } from "../../engine/dsl/builders";
import { gainEnergy } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Glimpse of Infinity",
  mtgName: "Black Lotus",
  id: "1658d9a0-c3b0-4eb7-babc-4933acf362c4",
  renderedText: "Gain 3●.",
  amplifiedText: "Gain 4●.",
  energyCost: 0,
  cardType: "Event",
  subtype: "",
  rarity: "Legendary",
  isFast: false,
  isInterrupt: false,
  spark: null,
  tags: ["Ritual", "Art Owned"],
  imageNumber: 2191235671,
  artOwned: true,
  cardNumber: 451,
  art: { x: 0, y: 1, scale: 1.17 },
  isStarter: false,
  abilities: (variant) => [event(gainEnergy(variant.amplified ? 4 : 3))],
  verifiedText: "1geue1kjo5r",
});
