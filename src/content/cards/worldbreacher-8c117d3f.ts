import { activated, exhaustSelf } from "../../engine/dsl/builders";
import { materializeFigments } from "../../engine/effects/primitives";
import { parseFigmentId } from "../../engine/state/ids";
import { card } from "../define";
import warrior from "../figments/warrior-bb1a5acd";

export default card({
  name: "Worldbreacher",
  mtgName: "Retrofitter Foundry",
  id: "8c117d3f-09af-4312-9897-694a76bd23c6",
  renderedText: "☾: Materialize a 1✦ warrior figment.",
  amplifiedText: "☾: Materialize a 2✦ warrior figment.",
  energyCost: 1,
  cardType: "Character",
  subtype: "Warrior",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: 1,
  tags: ["Figment Maker", "tutorial"],
  imageNumber: 1511229275,
  artOwned: false,
  cardNumber: 108,
  art: { x: 0, y: -0.346, scale: 1.57 },
  isStarter: false,
  abilities: (variant) => [
    activated([exhaustSelf()], materializeFigments(parseFigmentId(warrior.id), 1, { spark: variant.amplified ? 2 : 1 })),
  ],
  verifiedText: "1i0885fkgro",
});
