import { abandonSelfCost, activated } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Glimmerwood Scout",
  mtgName: "Mishra's Bauble",
  id: "49c6e5ad-8da8-47fa-a8f3-906cbef8a3ed",
  renderedText:
    "Abandon this character: Reveal the opponent's hand. Draw a card with ephemeral.",
  energyCost: 0,
  cardType: "Character",
  subtype: "Warrior",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: 0,
  tags: ["Art Rework", "Art OK"],
  imageNumber: 2155438709,
  artOwned: false,
  cardNumber: 178,
  art: { x: -0.294, y: 0.369, scale: 1.17 },
  isStarter: false,
  abilities: () => [activated([abandonSelfCost()], p.sequence(p.reveal("opponent"), p.draw(1, "you", { ephemeral: true })))],
  verifiedText: "1uyjk6jzc9m",
});
