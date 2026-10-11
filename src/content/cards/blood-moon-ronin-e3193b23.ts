import { abandonSelfCost, activated } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Blood Moon Ronin",
  mtgName: "Urza's Bauble",
  id: "e3193b23-2002-40a9-91fc-e0713200355e",
  renderedText: "Abandon this character: Draw a card with ephemeral.",
  amplifiedText: "Abandon this character: Draw 2 cards with ephemeral.",
  energyCost: 0,
  cardType: "Character",
  subtype: "Warrior",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: 1,
  tags: ["Lotus Petal", "Art Rework", "Art OK", "tutorial"],
  imageNumber: 565499662,
  artOwned: true,
  cardNumber: 133,
  art: { x: 0.448, y: 0.25, scale: 1.57 },
  isStarter: false,
  abilities: (v) => [activated([abandonSelfCost()], p.draw(v.amplified ? 2 : 1, "you", { ephemeral: true }))],
  verifiedText: "hv6hdc57hj",
});
