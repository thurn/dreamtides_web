import { characterYouControl, energy, thisCardIn } from "../../engine/dsl/builders";
import { either, triggered, whenDiscardSelf, whenDissolved, whenErodeSelf } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";
import { parseFigmentId } from "../../engine/state/ids";
import survivor from "../figments/survivor-5256888f";
import { card } from "../define";

export default card({
  name: "Shadowsinger",
  mtgName: "Bridge from Below",
  id: "c36e67ab-fbee-4d83-b57b-34d34f60e17c",
  renderedText:
    "When a character you control is dissolved, materialize a 1✦ survivor figment. When you discard or erode this card, it gains reclaim 0●.",
  amplifiedText:
    "When a character you control is dissolved, materialize a 2✦ survivor figment. When you discard or erode this card, it gains reclaim 0●.",
  energyCost: 3,
  cardType: "Character",
  subtype: "Visitor",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: 2,
  tags: ["Figment Maker", "Ally Audit"],
  imageNumber: 281111747,
  artOwned: false,
  cardNumber: 361,
  art: { x: 0.054, y: -0.4, scale: 1.97 },
  isStarter: false,
  abilities: (variant) => [
    // The ability watches its own dissolve too, and sees each character as it last was in play (RD-hv-umm2.65-1).
    triggered(
      whenDissolved(characterYouControl()),
      p.materializeFigments(parseFigmentId(survivor.id), 1, { spark: variant.amplified ? 2 : 1 }),
    ),
    // "When you discard or erode this card" works from the void (RD-hv-umm2.87-1).
    triggered(either(whenDiscardSelf(), whenErodeSelf()), p.grantReclaim(thisCardIn("void"), { costs: [energy(0)] }), {
      zone: "void",
    }),
  ],
  verifiedText: "2dfvt3l2fc5",
});
