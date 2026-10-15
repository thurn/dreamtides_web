import { dreamsign } from "../define";
import { randomIn } from "../../engine/dsl/builders";
import { atEndOfTurn, triggered } from "../../engine/dsl/triggers";
import { materialize } from "../../engine/effects/primitives";
import { expectedVerifiedText } from "../../engine/dsl/verified-text";

export default dreamsign({
  id: "b765f6bb-0b8a-4847-ada4-477b9493e3ad",
  name: "Flower Petals",
  imageName: "petals.png",
  imageAlt: "Dark magenta flower petals layered into a velvety blossom.",
  effectDescription:
    "At the end of your turn, materialize a random character in your void which you abandoned this turn. It has 0✦.",
  rarity: "Uncommon",
  tideIds: ["3bdfa6f6-b4f5-4a35-b5c0-ea76727eeea3"],
  tags: ["J12", "Tag OK"],
  abilities: () => [triggered(atEndOfTurn("you"), materialize(randomIn("void", 1, { cardType: "character" }, { thisTurn: "abandoned" }), { zeroSpark: true }))],
  verifiedText: expectedVerifiedText("At the end of your turn, materialize a random character in your void which you abandoned this turn. It has 0✦."),
});
