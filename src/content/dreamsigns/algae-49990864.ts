import { triggered, triggeringCard, untilEndOfTurn, whenDraw } from "../../engine/dsl/triggers";
import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import { changeCardCost } from "../../engine/effects/primitives/modify-card-cost";
import { dreamsign } from "../define";

export default dreamsign({
  id: "49990864-1db0-4c08-91ae-40a1f04223e4",
  name: "Algae",
  imageName: "algae.png",
  imageAlt:
    "Shimmering lime-green ribbon or liquid fabric twisting in soft waves.",
  effectDescription:
    "Once per turn, when you draw a character, reduce its cost by 1● until end of turn.",
  rarity: "Uncommon",
  tideIds: ["3bdfa6f6-b4f5-4a35-b5c0-ea76727eeea3"],
  tags: ["Tag OK"],
  abilities: () => [triggered(whenDraw("you", undefined, { cardType: "character" }),
    changeCardCost(triggeringCard(), { reduce: 1 }, { duration: untilEndOfTurn() }), { oncePerTurn: true })],
  verifiedText: expectedVerifiedText("Once per turn, when you draw a character, reduce its cost by 1● until end of turn."),
});
