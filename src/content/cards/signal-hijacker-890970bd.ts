import { enemyCharacter, target } from "../../engine/dsl/builders";
import { onMaterialized, triggered } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Signal Hijacker",
  mtgName: "Scheming Fence",
  id: "890970bd-475f-4da4-b835-2fb75882a84d",
  renderedText:
    "▸Materialized: An enemy loses all abilities. This character gains those abilities.",
  energyCost: 2,
  cardType: "Character",
  subtype: "Synth",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 2,
  tags: ["Art Rework", "Art OK"],
  imageNumber: 1740270995,
  artOwned: false,
  cardNumber: 316,
  art: { x: 0, y: -0.321, scale: 1.87 },
  isStarter: false,
  // RD-hv-umm2.111-1..3: the enemy loses its abilities while it is in play; this character gains those it had, while in play.
  abilities: () => [triggered(onMaterialized(), p.loseAllAbilities(target(enemyCharacter()), { sourceGains: true }))],
  verifiedText: "82puti3zyu",
});
