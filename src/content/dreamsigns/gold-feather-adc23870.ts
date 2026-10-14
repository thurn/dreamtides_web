import { characterYouControl, randomCharacter } from "../../engine/dsl/builders";
import { triggered, whenAbandon } from "../../engine/dsl/triggers";
import { gainSpark } from "../../engine/effects/primitives/gain-spark";
import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import { dreamsign } from "../define";

export default dreamsign({
  id: "adc23870-55f8-4f23-b973-a358fc257414",
  name: "Gold Feather",
  imageName: "feather_gold.png",
  imageAlt:
    "White-gold feather glowing softly against a vivid yellow background.",
  effectDescription:
    "When you abandon a character, a random character you control gains +1✦.",
  rarity: "Uncommon",
  tideIds: [
    "0ac06270-f783-4c4f-bfd9-4109d22316e0",
    "9ca5a839-cdcb-497d-9b76-2de4c6874cf0",
    "ee5e7dd2-0c11-4349-94e1-ec1ae35b20af",
  ],
  tags: ["J11", "Tag OK", "Ally Audit"],
  abilities: () => [triggered(whenAbandon(), gainSpark(randomCharacter(characterYouControl()), 1))],
  verifiedText: expectedVerifiedText("When you abandon a character, a random character you control gains +1✦."),
});
