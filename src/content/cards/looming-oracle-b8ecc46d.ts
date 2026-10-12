import { onDawn, onMaterialized, triggered } from "../../engine/dsl/triggers";
import { foresee, gainEnergy } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Looming Oracle",
  mtgName: "Ignoble Hierarch",
  id: "b8ecc46d-bd92-4826-a416-7ce177e69cbf",
  renderedText: "▸Materialized: Foresee 1.\n\n▸Dawn: Gain 1●.",
  amplifiedText: "▸Materialized: Foresee 2.\n\n▸Dawn: Gain 1●.",
  energyCost: 1,
  cardType: "Character",
  subtype: "Spirit Animal",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: 1,
  tags: ["Elves", "Art Rework", "Art OK", "Art Owned"],
  imageNumber: 717263287,
  artOwned: false,
  cardNumber: 141,
  art: { x: 0.136, y: 0.212, scale: 1.37 },
  isStarter: false,
  abilities: (variant) => [
    triggered(onMaterialized(), foresee(variant.amplified ? 2 : 1)),
    triggered(onDawn(), gainEnergy(1)),
  ],
  verifiedText: "16n5mh8595i",
});
