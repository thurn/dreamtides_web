import { onMaterialized, triggered } from "../../engine/dsl/triggers";
import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import { materializeChosen, optional } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Aether Diver",
  mtgName: "Arboreal Grazer",
  id: "87f075b1-b058-4570-a75f-c4f8f544e192",
  renderedText:
    "▸Materialized: You may materialize a ≤2● cost character from your hand.",
  amplifiedText:
    "▸Materialized: You may materialize a ≤3● cost character from your hand.",
  energyCost: 1,
  cardType: "Character",
  subtype: "Visitor",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: 1,
  tags: ["Art Rework", "Art OK", "Art Owned"],
  imageNumber: 1734998174,
  artOwned: false,
  cardNumber: 274,
  art: { x: 0, y: 1, scale: 1.11 },
  isStarter: false,
  abilities: (variant) => [triggered(onMaterialized(), optional(materializeChosen(variant.amplified ? 3 : 2)))],
  verifiedText: expectedVerifiedText("▸Materialized: You may materialize a ≤2● cost character from your hand.", "▸Materialized: You may materialize a ≤3● cost character from your hand."),
});
