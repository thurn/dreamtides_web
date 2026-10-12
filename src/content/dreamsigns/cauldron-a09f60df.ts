import { randomIn } from "../../engine/dsl/builders";
import { triggered, untilEndOfTurn, whenYouPlay } from "../../engine/dsl/triggers";
import { grantReclaim } from "../../engine/effects/primitives";
import { dreamsign } from "../define";

export default dreamsign({
  id: "a09f60df-ec9f-4608-873c-1372af18daa2",
  name: "Cauldron",
  imageName: "cauldron.png",
  imageAlt: "black cauldron filled with bubbling neon green liquid",
  effectDescription:
    "When you play an event, a random event in your void gains reclaim until end of turn.",
  rarity: "Rare",
  tideIds: [
    "1ad97f42-6157-45b3-8290-e27219c7888a",
    "e6863f55-50e7-4c7b-b118-609b5fc5c005",
    "ab89d262-45d4-438d-8670-79d91f6e944f",
  ],
  tags: ["J10", "Tag OK"],
  abilities: () => [triggered(whenYouPlay({ cardType: "event" }), grantReclaim(randomIn("void", 1, { cardType: "event" }), { duration: untilEndOfTurn() }))],
  verifiedText: "c7bojt6oo4",
});
