import { event } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Gleam Below",
  mtgName: "Serum Visions",
  id: "45e3d703-7efc-4dc2-b854-33211f8d4f11",
  renderedText: "Draw a card. Foresee 2.",
  amplifiedText: "Draw a card. Foresee 3.",
  energyCost: 1,
  cardType: "Event",
  subtype: "",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: null,
  tags: ["Cantrips"],
  imageNumber: 457875913,
  artOwned: false,
  cardNumber: 341,
  art: { x: 0, y: -0.681, scale: 1.57 },
  isStarter: false,
  abilities: (variant) => [event(p.sequence(p.draw(1), p.foresee(variant.amplified ? 3 : 2)))],
  verifiedText: "1x2zlrwnt5j",
});
