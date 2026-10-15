import { dreamsign } from "../define";
import { leftPlayThisTurn } from "../../engine/dsl/builders";
import { triggered, triggeringCard, whenYouPlay } from "../../engine/dsl/triggers";
import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import { gainTriggeringCardSpark } from "../../engine/effects/primitives";

export default dreamsign({
  id: "2788cdad-2735-4cdf-89a8-dcecaca87369",
  name: "Phoenix Feather",
  imageName: "phoenix_feather.png",
  imageAlt: "Golden feather with brown shaft and warm orange glow.",
  effectDescription:
    "When you play a character, it gains +1✦ for each character you control that left play this turn.",
  rarity: "Uncommon",
  tideIds: ["3bdfa6f6-b4f5-4a35-b5c0-ea76727eeea3"],
  tags: ["J12", "Tag OK", "Ally Audit"],
  abilities: () => [triggered(whenYouPlay({ cardType: "character" }), gainTriggeringCardSpark(triggeringCard(), leftPlayThisTurn(), "permanent"))],
  verifiedText: expectedVerifiedText("When you play a character, it gains +1✦ for each character you control that left play this turn."),
});
