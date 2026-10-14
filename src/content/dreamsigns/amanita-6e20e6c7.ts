import { characterYouControl } from "../../engine/dsl/builders";
import { triggered, untilEndOfTurn, whenLeavesPlay } from "../../engine/dsl/triggers";
import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import { costModifier } from "../../engine/effects/primitives";
import { dreamsign } from "../define";

export default dreamsign({
  id: "6e20e6c7-295a-48b1-b252-b8b00d6902c9",
  name: "Amanita",
  imageName: "amanita.png",
  imageAlt: "Red spotted mushroom with white flecks and pale stem.",
  effectDescription:
    "Once per turn, when a character you control leaves play, your next character this turn costs 2● less.",
  rarity: "Uncommon",
  tideIds: [
    "f7072be7-f12b-482a-b9e1-4d3925622eb2",
    "0ac06270-f783-4c4f-bfd9-4109d22316e0",
    "1694633b-f5a7-4fe8-a685-993be7e1a13c",
  ],
  tags: ["Tag OK", "Ally Audit"],
  abilities: () => [
    triggered(whenLeavesPlay(characterYouControl()),
      costModifier("you", { cardType: "character" }, -2, { next: true, duration: untilEndOfTurn() }),
      { oncePerTurn: true }),
  ],
  verifiedText: expectedVerifiedText(
    "Once per turn, when a character you control leaves play, your next character this turn costs 2● less.",
  ),
});
