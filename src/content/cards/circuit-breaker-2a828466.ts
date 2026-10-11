import { energy, reclaim } from "../../engine/dsl/builders";
import { onMaterialized, triggered } from "../../engine/dsl/triggers";
import { gainPoints } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Circuit Breaker",
  mtgName: "Murderous Redcap",
  id: "2a828466-450a-4637-9c68-6b54522450c0",
  renderedText: "▸Materialized: Gain 1⍟.\n\nReclaim 0●",
  amplifiedText: "▸Materialized: Gain 2⍟.\n\nReclaim 0●",
  energyCost: 4,
  cardType: "Character",
  subtype: "Synth",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: 2,
  tags: ["Art Rework", "Art OK"],
  imageNumber: 644603722,
  artOwned: false,
  cardNumber: 229,
  isStarter: false,
  abilities: (variant) => [
    triggered(onMaterialized(), gainPoints(variant.amplified ? 2 : 1)),
    reclaim(energy(0)),
  ],
  verifiedText: "2bw1rm5qtl8",
});
