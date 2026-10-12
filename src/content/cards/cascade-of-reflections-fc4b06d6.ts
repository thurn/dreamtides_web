import { event } from "../../engine/dsl/builders";
import { triggeringCard, whenYouPlay } from "../../engine/dsl/triggers";
import { copyCard, floating } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Cascade of Reflections",
  mtgName: "Bonus Round",
  id: "fc4b06d6-3b30-4769-af98-88fcea5b54dd",
  renderedText: "Until end of turn, when you play an event, copy it.",
  energyCost: 3,
  cardType: "Event",
  subtype: "",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: null,
  tags: ["Art Owned"],
  imageNumber: 1739438657,
  artOwned: false,
  cardNumber: 246,
  art: { x: 0.042, y: 1, scale: 1.17 },
  isStarter: false,
  abilities: () => [event(floating(whenYouPlay({ cardType: "event" }), copyCard(triggeringCard()), "untilEndOfTurn"))],
  verifiedText: "1otq7959d0z",
});
