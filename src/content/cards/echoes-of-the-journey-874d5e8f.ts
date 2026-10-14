import { event, playedThisTurn } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Echoes of the Journey",
  mtgName: "Mind's Desire",
  id: "874d5e8f-4e12-4426-a2e7-1ab761d2ca12",
  renderedText:
    "For each card you have played this turn, draw a card with ephemeral. They cost 0● this turn.",
  energyCost: 5,
  cardType: "Event",
  subtype: "",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: null,
  tags: ["Art Owned"],
  imageNumber: 1798514905,
  artOwned: false,
  cardNumber: 84,
  art: { x: 0.546, y: 1, scale: 1.17 },
  isStarter: false,
  abilities: () => [event(p.modifyCardCost(
    p.draw(playedThisTurn(), "you", { ephemeral: true }),
    { set: 0 },
    { duration: "untilEndOfTurn" },
  ))],
  verifiedText: "1pm72bpnofs",
});
