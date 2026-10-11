import { energy, reclaim } from "../../engine/dsl/builders";
import { onMaterialized, triggered } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Night Scavenger",
  mtgName: "Kitchen Finks",
  id: "19aeffa6-fd1b-4b8f-bb0c-c35659521976",
  renderedText: "▸Materialized: Erode 1.\n\nReclaim 0●",
  amplifiedText: "▸Materialized: Erode 2.\n\nReclaim 0●",
  energyCost: 3,
  cardType: "Character",
  subtype: "Survivor",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: 2,
  tags: ["Self-Mill", "Art Owned"],
  imageNumber: 2290648807,
  artOwned: true,
  cardNumber: 143,
  art: { x: 0.494, y: -0.356, scale: 1.47 },
  isStarter: false,
  abilities: (v) => [triggered(onMaterialized(), p.erode(v.amplified ? 2 : 1)), reclaim(energy(0))],
  verifiedText: "3oih1scmf6",
});
