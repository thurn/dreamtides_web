import { activated, energy, self, stackItem } from "../../engine/dsl/builders";
import { onMaterialized, triggered } from "../../engine/dsl/triggers";
import { move, prevent } from "../../engine/effects/primitives";
import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import { card } from "../define";

export default card({
  name: "Dune Interceptor",
  mtgName: "Spellstutter Sprite",
  id: "99101fce-f2b4-4032-b999-317ce3e4a6dd",
  renderedText:
    "▸Materialized: Prevent a played ≤2● cost card.\n\n❖ – 1●: Reposition this character.",
  amplifiedText:
    "▸Materialized: Prevent a played ≤3● cost card.\n\n❖ – 1●: Reposition this character.",
  energyCost: 2,
  cardType: "Character",
  subtype: "Visitor",
  rarity: "Common",
  isFast: true,
  isInterrupt: true,
  spark: 1,
  tags: ["Counterspell", "Art Rework", "Art OK"],
  imageNumber: 2657255499,
  artOwned: false,
  cardNumber: 423,
  art: { x: -0.078, y: 0.188, scale: 1.97 },
  isStarter: false,
  abilities: (variant) => [
    triggered(onMaterialized(), prevent(stackItem({ costAtMost: variant.amplified ? 3 : 2 }))),
    activated([energy(1)], move(self(), { to: "reposition" }), { speed: "fast" }),
  ],
  verifiedText: expectedVerifiedText("▸Materialized: Prevent a played ≤2● cost card.\n\n❖ – 1●: Reposition this character.", "▸Materialized: Prevent a played ≤3● cost card.\n\n❖ – 1●: Reposition this character."),
});
