import { characterYouControl, controls } from "../../engine/dsl/builders";
import { onDawn, triggered } from "../../engine/dsl/triggers";
import { abandon, draw, ifThen, optional, sequence } from "../../engine/effects/primitives";
import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import { dreamsign } from "../define";

export default dreamsign({
  id: "bfec4f5d-9b0d-4ed2-b470-db73d852448f",
  name: "Dead Rat",
  imageName: "dead_rat.png",
  imageAlt: "blue-gray rat with red eyes on a brown branch",
  effectDescription: "▸Dawn: You may abandon a character to draw a card.",
  rarity: "Uncommon",
  tideIds: [
    "0ac06270-f783-4c4f-bfd9-4109d22316e0",
    "4b01b6c1-ccca-4e19-848a-d799d46088b2",
    "7dfa6a52-04ce-42fc-9ef6-4e6571435510",
  ],
  tags: ["J10", "Tag OK"],
  abilities: () => [triggered(onDawn(), optional(ifThen(controls(characterYouControl(), 1), sequence(abandon(), draw(1)))))],
  verifiedText: expectedVerifiedText("▸Dawn: You may abandon a character to draw a card."),
});
