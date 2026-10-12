import { all, characterYouControl } from "../../engine/dsl/builders";
import { triggered, whenYouPlay } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Shadow Balladeer",
  mtgName: "Jeskai Ascendancy",
  id: "181b4924-743b-49c3-8056-6afd08ebde1d",
  renderedText: "When you play an event, awaken each character you control.",
  energyCost: 3,
  cardType: "Character",
  subtype: "Musician",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: 3,
  tags: ["Event Payoff", "Ally Audit"],
  imageNumber: 457875112,
  artOwned: false,
  cardNumber: 17,
  art: { x: 0, y: 0.798, scale: 1.17 },
  isStarter: false,
  abilities: () => [triggered(whenYouPlay({ cardType: "event" }), p.awaken(all(characterYouControl())))],
  verifiedText: "1niva0b12id",
});
