import { event, playedThisTurn, times } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Blooming Horror",
  mtgName: "Brain Freeze",
  id: "29d25251-8b42-4d3d-97e6-6c3abaabd9a2",
  renderedText:
    "Choose a player. For each card you've played this turn, that player erodes 2.",
  energyCost: 2,
  cardType: "Event",
  subtype: "",
  rarity: "Rare",
  isFast: false,
  isInterrupt: false,
  spark: null,
  tags: ["Art Rework", "Art OK"],
  imageNumber: 1225878706,
  artOwned: false,
  cardNumber: 335,
  art: { x: 0.322, y: 1, scale: 1.11 },
  isStarter: false,
  abilities: () => [event(p.choosePlayer((player) => p.erode(times(playedThisTurn(), 2), player)))],
  verifiedText: "18qw63577yl",
});
