import { event } from "../../engine/dsl/builders";
import { untilEndOfTurn, whenYouPlay } from "../../engine/dsl/triggers";
import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import { draw, floating } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Celestial Reverie",
  mtgName: "Glimpse of Nature",
  id: "caaee8a9-0c22-41b4-950f-4c1131b98221",
  renderedText: "Until end of turn, when you play a character, draw a card.",
  energyCost: 1,
  cardType: "Event",
  subtype: "",
  rarity: "Rare",
  isFast: false,
  isInterrupt: false,
  spark: null,
  tags: ["tutorial", "Art Owned"],
  imageNumber: 2293194521,
  artOwned: false,
  cardNumber: 209,
  isStarter: false,
  abilities: () => [event(floating(whenYouPlay({ cardType: "character" }), draw(1), untilEndOfTurn()))],
  verifiedText: expectedVerifiedText("Until end of turn, when you play a character, draw a card."),
});
