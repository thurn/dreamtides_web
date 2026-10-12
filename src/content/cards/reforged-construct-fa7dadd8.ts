import { energy, reclaim } from "../../engine/dsl/builders";
import { triggered, triggeringCard, whenReclaimSelf } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Reforged Construct",
  mtgName: "Safehold Elite",
  id: "fa7dadd8-c72f-42e7-b203-3d22aa36122f",
  renderedText: "When you reclaim this character, it gains +1✦.\n\nReclaim 0●",
  amplifiedText: "When you reclaim this character, it gains +2✦.\n\nReclaim 0●",
  energyCost: 2,
  cardType: "Character",
  subtype: "Visitor",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 1,
  tags: ["Art Rework", "Art OK"],
  imageNumber: 2530615371,
  artOwned: false,
  cardNumber: 85,
  art: { x: -0.084, y: -0.025, scale: 1.47 },
  isStarter: false,
  abilities: (variant) => [
    triggered(whenReclaimSelf(), p.gainSpark(triggeringCard(), variant.amplified ? 2 : 1)),
    reclaim(energy(0)),
  ],
  verifiedText: "le1cjviqg1",
});
