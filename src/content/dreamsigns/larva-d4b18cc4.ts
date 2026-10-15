import { dreamsign } from "../define";
import { charactersPlayedThisTurn, plus } from "../../engine/dsl/builders";
import { triggered, triggeringCard, whenYouPlay } from "../../engine/dsl/triggers";
import { gainTriggeringCardSpark } from "../../engine/effects/primitives";
import { expectedVerifiedText } from "../../engine/dsl/verified-text";

export default dreamsign({
  id: "d4b18cc4-caeb-40b3-b0e2-f1c8b1c8354c",
  name: "Larva",
  imageName: "larva.png",
  imageAlt:
    "cream-white segmented grub with red head, orange legs, and black mandibles",
  effectDescription:
    "When you play a character, it gains +1✦ for each other character you have played this turn.",
  rarity: "Rare",
  tideIds: [
    "568c305c-6884-4dff-b1ec-c08f387a6527",
    "b2b1b0da-6d48-40cb-9d44-f0a94f0615f5",
  ],
  tags: ["J12", "Tag OK"],
  abilities: () => [triggered(whenYouPlay({ cardType: "character" }), gainTriggeringCardSpark(triggeringCard(), plus(charactersPlayedThisTurn(), -1)))],
  verifiedText: expectedVerifiedText("When you play a character, it gains +1✦ for each other character you have played this turn."),
});
