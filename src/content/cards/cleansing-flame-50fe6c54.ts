import { card } from "../define";
import { event, x } from "../../engine/dsl/builders";
import { choosePlayer, discard, draw, sequence } from "../../engine/effects/primitives";

export default card({
  name: "Cleansing Flame",
  mtgName: "Burning Inquiry",
  id: "50fe6c54-4bf2-4177-a2f7-4c00a4a4c188",
  renderedText:
    "Choose a player. That player discard X cards, then draws X cards.",
  energyCost: null,
  cardType: "Event",
  subtype: "",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: null,
  tags: ["Art Rework", "Art OK"],
  imageNumber: 789290998,
  artOwned: true,
  cardNumber: 124,
  art: { x: 0.092, y: 1, scale: 1.11 },
  isStarter: false,
  abilities: () => [event(choosePlayer((player) => sequence(discard(x(), player), draw(x(), player))))],
  verifiedText: "1toqwxkfkci",
});
