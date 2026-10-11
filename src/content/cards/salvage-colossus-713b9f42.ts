import { banishFromVoidCost, energy, reclaim } from "../../engine/dsl/builders";
import { onMaterialized, triggered } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Salvage Colossus",
  mtgName: "Ox of Agonas",
  id: "713b9f42-b0a0-4c0a-bc2e-89e0ac8a2dbc",
  renderedText:
    "▸Materialized: Draw 2 cards.\n\nReclaim – 3●, Banish 7 cards from your void.",
  energyCost: 5,
  cardType: "Character",
  subtype: "Synth",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 4,
  tags: ["Art Rework", "Art OK"],
  imageNumber: 603547823,
  artOwned: false,
  cardNumber: 57,
  art: { x: 0, y: 1, scale: 1 },
  isStarter: false,
  abilities: () => [
    triggered(onMaterialized(), p.draw(2)),
    reclaim(energy(3), banishFromVoidCost(7)),
  ],
  verifiedText: "dzc53y892",
});
