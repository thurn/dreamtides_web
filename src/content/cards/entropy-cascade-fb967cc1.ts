import { energy, event, reclaim } from "../../engine/dsl/builders";
import { triggeringCard, whenYouPlay } from "../../engine/dsl/triggers";
import { copyCardTimes, delayed } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Entropy Cascade",
  mtgName: "Increasing Vengeance",
  id: "fb967cc1-4199-4a08-8070-724e07cebea5",
  renderedText:
    "The next time you play an event this turn, copy it twice.\n\nReclaim 5●.",
  amplifiedText:
    "The next time you play an event this turn, copy it twice. You may choose new targets for the copies.\n\nReclaim 5●.",
  energyCost: 3,
  cardType: "Event",
  subtype: "",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: null,
  tags: ["Art Rework", "Art OK"],
  imageNumber: 1068257321,
  artOwned: false,
  cardNumber: 393,
  art: { x: -0.126, y: 0.897, scale: 1.07 },
  isStarter: false,
  abilities: () => [
    event(delayed(whenYouPlay({ cardType: "event" }), copyCardTimes(triggeringCard(), 2), "untilEndOfTurn")),
    reclaim(energy(5)),
  ],
  verifiedText: "8eq3yijblt",
});
