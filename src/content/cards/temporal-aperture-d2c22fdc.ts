import { abandonCostCapture, additionalCost, event, x } from "../../engine/dsl/builders";
import { discover, materialize } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Temporal Aperture",
  mtgName: "Tinker",
  id: "d2c22fdc-bf86-4233-8a6b-c8a4bd418b7c",
  renderedText:
    "To play this event, abandon a warrior. Discover a warrior with higher cost, then materialize it.",
  amplifiedText:
    "To play this event, abandon a warrior. Discover a warrior with higher cost, then materialize it with awakened.",
  energyCost: 2,
  cardType: "Event",
  subtype: "",
  rarity: "Rare",
  isFast: false,
  isInterrupt: false,
  spark: null,
  tags: ["Discover", "Art Rework", "Art OK"],
  imageNumber: 2430444883,
  artOwned: false,
  cardNumber: 387,
  art: { x: 0, y: 1, scale: 1.17 },
  isStarter: false,
  abilities: (variant) => [
    // Higher cost compares with the abandoned Warrior's captured copiable cost (RD-hv-umm2.83-2).
    additionalCost(abandonCostCapture({ subtype: "Warrior" })),
    event(materialize(discover({ cardType: "character", subtype: "Warrior" }, { costGreaterThan: x() }), { awakened: variant.amplified })),
  ],
  verifiedText: "1we80xnp9rx",
});
