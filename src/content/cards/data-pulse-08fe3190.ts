import { event } from "../../engine/dsl/builders";
import { draw, gainEnergy, sequence } from "../../engine/effects/primitives";
import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import { card } from "../define";

export default card({
  name: "Data Pulse",
  mtgName: "Manamorphose",
  id: "08fe3190-f559-4152-941d-33ec4180f509",
  renderedText: "Gain 2●. Draw a card.",
  amplifiedText: "Gain 3●. Draw a card.",
  energyCost: 2,
  cardType: "Event",
  subtype: "",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: null,
  tags: ["Ritual", "Art Owned"],
  imageNumber: 1084619579,
  artOwned: false,
  cardNumber: 285,
  art: { x: -0.168, y: 0.032, scale: 1.17 },
  isStarter: false,
  abilities: (variant) => [event(sequence(gainEnergy(variant.amplified ? 3 : 2), draw(1)))],
  verifiedText: expectedVerifiedText("Gain 2●. Draw a card.", "Gain 3●. Draw a card."),
});
