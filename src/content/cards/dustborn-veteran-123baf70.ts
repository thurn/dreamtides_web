import { characterYouControl } from "../../engine/dsl/builders";
import { triggered, whenDissolved } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";
import { parseFigmentId } from "../../engine/state/ids";
import survivor from "../figments/survivor-5256888f";
import { card } from "../define";

export default card({
  name: "Dustborn Veteran",
  mtgName: "Headless Rider",
  id: "123baf70-305a-4583-bdba-a10b5153fbeb",
  renderedText:
    "When a non-figment survivor you control is dissolved, materialize a 1✦ survivor figment.",
  amplifiedText:
    "When a non-figment survivor you control is dissolved, materialize a 2✦ survivor figment.",
  energyCost: 3,
  cardType: "Character",
  subtype: "Survivor",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: 3,
  tags: ["Figment Maker", "Ally Audit"],
  imageNumber: 2258761883,
  artOwned: false,
  cardNumber: 424,
  art: { x: -0.21, y: 0.608, scale: 1.17 },
  isStarter: false,
  abilities: (variant) => [
    // The ability watches its own dissolve too, and sees each survivor as it last was in play,
    // figment status included (RD-hv-umm2.65-1).
    triggered(
      whenDissolved(characterYouControl({ subtype: "Survivor", figment: false })),
      p.materializeFigments(parseFigmentId(survivor.id), 1, { spark: variant.amplified ? 2 : 1 }),
    ),
  ],
  verifiedText: "2bpqd6vyrj7",
});
