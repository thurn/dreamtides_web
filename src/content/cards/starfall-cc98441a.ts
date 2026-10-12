import { event } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Starfall",
  mtgName: "Dark Ritual",
  id: "cc98441a-a8f9-421f-9895-423bd7fc31b4",
  renderedText: "Gain 3●.",
  amplifiedText: "Gain 4●.",
  energyCost: 1,
  cardType: "Event",
  subtype: "",
  rarity: "Rare",
  isFast: false,
  isInterrupt: false,
  spark: null,
  tags: ["Ritual"],
  imageNumber: 717263497,
  artOwned: false,
  cardNumber: 473,
  isStarter: false,
  abilities: (v) => [event(p.gainEnergy(v.amplified ? 4 : 3))],
  verifiedText: "1geue1kjo5r",
});
