import { dreamsign } from "../define";
import { charactersPlayedThisTurn, thisTurn } from "../../engine/dsl/builders";
import { onNight, triggered } from "../../engine/dsl/triggers";
import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import { draw } from "../../engine/effects/primitives";

export default dreamsign({
  id: "56caa78b-021d-4b27-acab-c77fb0146ced",
  name: "Rabbit Tail",
  imageName: "rabbit_tail.png",
  imageAlt:
    "Black-and-white swirling feather or seed form against blue background.",
  effectDescription:
    "▸Night: If you have played no characters this turn, draw a card.",
  rarity: "Common",
  tideIds: ["22ca33d1-9d0f-4e0f-a2f5-b635e0ce184e"],
  tags: ["J15", "Tag OK"],
  abilities: () => [triggered(onNight(), draw(1), { condition: thisTurn(charactersPlayedThisTurn(), 0, 0) })],
  verifiedText: expectedVerifiedText("▸Night: If you have played no characters this turn, draw a card."),
});
