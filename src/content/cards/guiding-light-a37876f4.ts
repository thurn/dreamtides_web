import { energy, event, reclaim } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Guiding Light",
  mtgName: "Consider",
  id: "a37876f4-08a7-4352-bb3a-6d24f5c9407d",
  renderedText: "Foresee 1. Draw a card.\n\nReclaim 4●",
  amplifiedText: "Foresee 2. Draw a card.\n\nReclaim 4●",
  energyCost: 1,
  cardType: "Event",
  subtype: "",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: null,
  tags: ["Art Owned"],
  imageNumber: 1328168243,
  artOwned: true,
  cardNumber: 236,
  art: { x: 0, y: 1, scale: 1.67 },
  isStarter: false,
  abilities: (variant) => [event(p.sequence(p.foresee(variant.amplified ? 2 : 1), p.draw(1))), reclaim(energy(4))],
  verifiedText: "dce8raslhb",
});
