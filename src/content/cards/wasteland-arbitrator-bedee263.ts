import { energy, reclaim } from "../../engine/dsl/builders";
import { onMaterialized, triggered } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Wasteland Arbitrator",
  mtgName: "Rotting Rats",
  id: "bedee263-27b9-4d73-ab77-6b5c747dff69",
  renderedText: "▸Materialized: Each player discards a card.\n\nReclaim 1●.",
  energyCost: 3,
  cardType: "Character",
  subtype: "Survivor",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 2,
  tags: [],
  imageNumber: 1727859043,
  artOwned: false,
  cardNumber: 484,
  art: { x: 0, y: -0.142, scale: 1.47 },
  isStarter: false,
  abilities: () => [triggered(onMaterialized(), p.eachPlayer(p.discard(1))), reclaim(energy(1))],
  verifiedText: "14vj370z8d3",
});
