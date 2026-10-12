import { energy, event, reclaim } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { parseFigmentId } from "../../engine/state/ids";
import ethereal from "../figments/ethereal-3eddb1b8";
import { card } from "../define";

export default card({
  name: "Together Against the Tide",
  mtgName: "Lingering Souls",
  id: "491e4233-0911-46ed-bced-0498e69b5bba",
  renderedText: "Materialize two 1✦ ethereal figments.\n\nReclaim 2●",
  amplifiedText: "Materialize three 1✦ ethereal figments.\n\nReclaim 2●",
  energyCost: 2,
  cardType: "Event",
  subtype: "",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: null,
  tags: ["Figment Maker", "Art Rework", "Art OK"],
  imageNumber: 1687930282,
  artOwned: false,
  cardNumber: 429,
  art: { x: 0.042, y: 1, scale: 1.1 },
  isStarter: false,
  abilities: (variant) => [
    event(p.materializeFigments(parseFigmentId(ethereal.id), variant.amplified ? 3 : 2, { spark: 1 })),
    reclaim(energy(2)),
  ],
  verifiedText: "223mz4ymg0r",
});
