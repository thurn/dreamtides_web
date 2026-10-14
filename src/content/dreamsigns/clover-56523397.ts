import { controlsNone, characterYouControl } from "../../engine/dsl/builders";
import { triggered, whenYouPlay, triggeringCard } from "../../engine/dsl/triggers";
import { copyCard } from "../../engine/effects/primitives/copy-card";
import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import { dreamsign } from "../define";

export default dreamsign({
  id: "56523397-6c48-4df6-846b-9e4f15d7fdee",
  name: "Clover",
  imageName: "clover.png",
  imageAlt: "pale green clover leaf with white ringed center pattern",
  effectDescription:
    "Once per turn, when you play an event while you control no characters, copy it.",
  rarity: "Common",
  tideIds: [
    "1ad97f42-6157-45b3-8290-e27219c7888a",
    "87d5e3fa-192e-482b-a75c-a0921e5699e2",
    "ab89d262-45d4-438d-8670-79d91f6e944f",
  ],
  tags: ["J10", "Tag OK", "Ally Audit"],
  abilities: () => [triggered(whenYouPlay({ cardType: "event" }), copyCard(triggeringCard()), { condition: controlsNone(characterYouControl()), oncePerTurn: true })],
  verifiedText: expectedVerifiedText("Once per turn, when you play an event while you control no characters, copy it."),
});
