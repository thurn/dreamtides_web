import { costExactly } from "../../engine/dsl/builders";
import { triggered, whenYouPlay } from "../../engine/dsl/triggers";
import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import { draw } from "../../engine/effects/primitives";
import { dreamsign } from "../define";

export default dreamsign({
  id: "62e1a588-f719-415c-9434-80aa08ce2e6a",
  name: "Red Pin",
  imageName: "pin.png",
  imageAlt: "Glossy red lollipop or wand with a tapered silver stick.",
  effectDescription:
    "Once per turn, when you play a 2● cost character, draw a card.",
  rarity: "Uncommon",
  tideIds: [
    "1694633b-f5a7-4fe8-a685-993be7e1a13c",
    "e1620ab4-7e68-4a57-a6eb-d7a3380c4dc5",
  ],
  tags: ["J15", "Tag OK"],
  abilities: () => [triggered(whenYouPlay({ cardType: "character", ...costExactly(2) }), draw(1), { oncePerTurn: true })],
  verifiedText: expectedVerifiedText("Once per turn, when you play a 2● cost character, draw a card."),
});
