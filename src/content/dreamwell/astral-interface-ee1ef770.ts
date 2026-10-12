import { event } from "../../engine/dsl/builders";
import { discard } from "../../engine/effects/primitives/discard";
import { draw } from "../../engine/effects/primitives/draw";
import { sequence } from "../../engine/effects/primitives/sequence";
import { dreamwellCard } from "../define";

export default dreamwellCard({
  name: "Astral Interface",
  id: "ee1ef770-29ea-4a63-a1f9-7e97b5b8870d",
  renderedText: "Draw a card, then discard a card.",
  order: 1,
  energyAdded: 1,
  cardType: "Dreamwell",
  imageNumber: 1011222385,
  artOwned: true,
  cardNumber: 7,
  tags: ["Art Owned"],
  abilities: () => [event(sequence(draw(1), discard(1)))],
  verifiedText: "73adwzu8jt",
});
