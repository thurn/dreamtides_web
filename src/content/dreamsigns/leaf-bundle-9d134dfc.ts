import { triggered, whenDiscard } from "../../engine/dsl/triggers";
import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import { draw } from "../../engine/effects/primitives";
import { dreamsign } from "../define";

export default dreamsign({
  id: "9d134dfc-4643-47f3-a7ec-ea770587cea1",
  name: "Leaf Bundle",
  imageName: "bunch_of_leaves.png",
  imageAlt: "olive green leafy branch bound with yellow twine",
  effectDescription: "Once per turn, when you discard a card, draw a card.",
  rarity: "Rare",
  tideIds: ["1a075e25-0344-4103-997c-dd8f8a57c84e"],
  tags: ["J11", "Tag OK"],
  abilities: () => [triggered(whenDiscard(), draw(1), { oncePerTurn: true })],
  verifiedText: expectedVerifiedText("Once per turn, when you discard a card, draw a card."),
});
