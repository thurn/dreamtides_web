import { randomIn } from "../../engine/dsl/builders";
import { onDawn, triggered } from "../../engine/dsl/triggers";
import { returnFromVoid } from "../../engine/effects/primitives";
import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import { dreamsign } from "../define";

export default dreamsign({
  id: "a7cdc8fd-5827-4d73-ae0c-aa594a69fa8a",
  name: "Rope Doll",
  imageName: "doll.png",
  imageAlt:
    "Beige rope doll with flowing strands, tied in loose knots, on orange-brown background.",
  effectDescription:
    "▸Dawn: Return a random survivor from your void to your hand.",
  rarity: "Uncommon",
  tideIds: [
    "0ac06270-f783-4c4f-bfd9-4109d22316e0",
    "c78a2ce1-80fe-48b9-9400-98f4965e17a4",
    "9ca5a839-cdcb-497d-9b76-2de4c6874cf0",
  ],
  tags: ["J10", "Tag OK"],
  abilities: () => [
    triggered(
      onDawn(),
      returnFromVoid(randomIn("void", 1, { subtype: "Survivor" }), {
        toYourHand: true,
      }),
    ),
  ],
  verifiedText: expectedVerifiedText(
    "▸Dawn: Return a random survivor from your void to your hand.",
  ),
});
