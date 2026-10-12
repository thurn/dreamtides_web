import { characterYouControl } from "../../engine/dsl/builders";
import { triggered, whenDissolved } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";
import { parseFigmentId } from "../../engine/state/ids";
import warrior from "../figments/warrior-bb1a5acd";
import { card } from "../define";

export default card({
  name: "Railgun Reinforcer",
  mtgName: "Oni-Cult Anvil",
  id: "f0a70e7d-46af-4d32-92cc-9d510e97a07e",
  renderedText:
    "Once per turn, when a warrior you control is dissolved, materialize a 1✦ warrior figment.",
  amplifiedText:
    "Once per turn, when a warrior you control is dissolved, materialize a 2✦ warrior figment.",
  energyCost: 2,
  cardType: "Character",
  subtype: "Warrior",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 3,
  tags: ["Figment Maker", "Art Rework", "Art OK", "Ally Audit", "Art Owned"],
  imageNumber: 2186149279,
  artOwned: false,
  cardNumber: 171,
  art: { x: 0.084, y: 0.369, scale: 1.17 },
  isStarter: false,
  abilities: (variant) => [
    // The ability watches its own dissolve too, and sees each warrior as it last was in play (RD-hv-umm2.65-1).
    triggered(
      whenDissolved(characterYouControl({ subtype: "Warrior" })),
      p.materializeFigments(parseFigmentId(warrior.id), 1, { spark: variant.amplified ? 2 : 1 }),
      { oncePerTurn: true },
    ),
  ],
  verifiedText: "1m3srhgpah3",
});
