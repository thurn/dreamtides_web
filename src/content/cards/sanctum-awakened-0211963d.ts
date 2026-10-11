import { energy, event, reclaim } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Sanctum Awakened",
  mtgName: "Deep Analysis",
  id: "0211963d-d097-4427-9d16-5e857621e481",
  renderedText: "Draw two cards.\n\nReclaim 2●",
  energyCost: 4,
  cardType: "Event",
  subtype: "",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: null,
  tags: [],
  imageNumber: 1258823161,
  artOwned: false,
  cardNumber: 334,
  art: { x: -0.504, y: 1, scale: 1.17 },
  isStarter: false,
  abilities: () => [event(p.draw(2)), reclaim(energy(2))],
  verifiedText: "yxc4a5x7re",
});
