import { characterYouControl } from "../../engine/dsl/builders";
import { triggered, untilEndOfTurn, whenReturn } from "../../engine/dsl/triggers";
import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import { costModifier } from "../../engine/effects/primitives";
import { dreamsign } from "../define";

export default dreamsign({
  id: "12ec9625-cbfb-4056-9c3e-98ed8c8bea70",
  name: "Charm Bracelet",
  imageName: "necklace.png",
  imageAlt:
    "Brown ringed bracelet with black beads and tan claw-like hanging charms.",
  effectDescription:
    "Once per turn, when you return a character you control to hand, your next character this turn costs 1● less.",
  rarity: "Common",
  tideIds: [
    "80e3d33f-6b21-4739-9050-be8d28de28a6",
    "eb397537-8a0b-4969-924b-baee5137094c",
    "e03f4d87-bc6c-46f9-9c08-bef7b59a9f70",
  ],
  tags: ["Tag OK", "Ally Audit"],
  abilities: () => [
    triggered(whenReturn(characterYouControl()),
      costModifier("you", { cardType: "character" }, -1, { next: true, duration: untilEndOfTurn() }),
      { oncePerTurn: true }),
  ],
  verifiedText: expectedVerifiedText(
    "Once per turn, when you return a character you control to hand, your next character this turn costs 1● less.",
  ),
});
