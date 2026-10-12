import { event } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Flash of Power",
  mtgName: "Seething Song",
  id: "c430ed7b-523e-4580-9a53-d43d11265633",
  renderedText: "Gain 5●.",
  amplifiedText: "Gain 6●.",
  energyCost: 3,
  cardType: "Event",
  subtype: "",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: null,
  tags: ["Ritual", "Art Owned"],
  imageNumber: 1063277315,
  artOwned: false,
  cardNumber: 152,
  art: { x: 0.042, y: 1, scale: 1.17 },
  isStarter: false,
  abilities: (v) => [event(p.gainEnergy(v.amplified ? 6 : 5))],
  verifiedText: "1e8dhv49rx0",
});
