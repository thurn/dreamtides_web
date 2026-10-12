import { event } from "../../engine/dsl/builders";
import { discard } from "../../engine/effects/primitives/discard";
import { draw } from "../../engine/effects/primitives/draw";
import { optional } from "../../engine/effects/primitives/optional";
import { sequence } from "../../engine/effects/primitives/sequence";
import { dreamwellCard } from "../define";

export default dreamwellCard({
  name: "Sunset's Last Gaze",
  id: "fa8704fe-759f-408d-992d-d8f9d5ffd760",
  renderedText: "You may discard 2 cards, then draw 2 cards.",
  order: 3,
  energyAdded: 1,
  cardType: "Dreamwell",
  imageNumber: 1721490835,
  artOwned: false,
  cardNumber: 15,
  tags: ["Art Owned"],
  abilities: () => [event(optional(sequence(discard(2), draw(2))))],
  verifiedText: "1kp4e858wcq",
});
