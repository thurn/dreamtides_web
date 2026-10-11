import { characterYouControl, controlsNone } from "../../engine/dsl/builders";
import { onNight, triggered } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";
import { parseFigmentId } from "../../engine/state/ids";
import shadow from "../figments/shadow-86125402";
import { card } from "../define";

export default card({
  name: "Haunted Mariner",
  mtgName: "Jadar, Ghoulcaller of Nephalia",
  id: "9d63ba3e-fafb-466e-8418-ce5f8941ba30",
  renderedText:
    "▸Night: If you control no shadow figments, materialize a 2✦ shadow figment.",
  amplifiedText:
    "▸Night: If you control no shadow figments, materialize a 3✦ shadow figment.",
  energyCost: 2,
  cardType: "Character",
  subtype: "Visitor",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 1,
  tags: ["Art Rework", "Ally Audit", "Art OK"],
  imageNumber: 762927766,
  artOwned: false,
  cardNumber: 309,
  art: { x: 0.334, y: -0.244, scale: 1.77 },
  isStarter: false,
  abilities: (variant) => [
    // A shadow figment is a figment, figment copies included, whose subtype is Shadow (RD-hv-umm2.88-1).
    triggered(
      onNight(),
      p.materializeFigments(parseFigmentId(shadow.id), 1, { spark: variant.amplified ? 3 : 2 }),
      { condition: controlsNone(characterYouControl({ figment: true, subtype: "Shadow" })) },
    ),
  ],
  verifiedText: "1p0pbygap53",
});
