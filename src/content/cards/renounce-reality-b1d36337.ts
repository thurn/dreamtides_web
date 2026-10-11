import { energy, event, everyIn, reclaim } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Renounce Reality",
  mtgName: "Echo of Eons",
  id: "b1d36337-5668-4f1d-b155-2d07fc00f872",
  renderedText: "Banish your hand and void. Draw 5 cards.\n\nReclaim 3●",
  amplifiedText: "Banish your hand. Draw 5 cards.\n\nReclaim 3●",
  energyCost: 5,
  cardType: "Event",
  subtype: "",
  rarity: "Rare",
  isFast: false,
  isInterrupt: false,
  spark: null,
  tags: ["Art Rework", "Art OK"],
  imageNumber: 1213574263,
  artOwned: false,
  cardNumber: 311,
  art: { x: 0, y: 0.043, scale: 1 },
  isStarter: false,
  abilities: (v) => [
    event(p.sequence(p.banishCards(v.amplified ? [everyIn("hand")] : [everyIn("hand"), everyIn("void")]), p.draw(5))),
    reclaim(energy(3)),
  ],
  verifiedText: "28vlvegrkci",
});
