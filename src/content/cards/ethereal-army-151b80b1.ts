import { event, x } from "../../engine/dsl/builders";
import { materializeFigments } from "../../engine/effects/primitives";
import { parseFigmentId } from "../../engine/state/ids";
import { card } from "../define";
import ethereal from "../figments/ethereal-3eddb1b8";

export default card({
  name: "Ethereal Army",
  mtgName: "Pest Infestation",
  id: "151b80b1-0a3f-48d4-9c85-99a9c274fd7f",
  renderedText: "Materialize X 1✦ ethereal figments.",
  amplifiedText: "Materialize X 2✦ ethereal figments.",
  energyCost: null,
  cardType: "Event",
  subtype: "",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: null,
  tags: ["Figment Maker", "Art Rework", "Art OK"],
  imageNumber: 1785274679,
  artOwned: false,
  cardNumber: 287,
  isStarter: false,
  abilities: (variant) => [
    event(materializeFigments(parseFigmentId(ethereal.id), x(), { spark: variant.amplified ? 2 : 1 })),
  ],
  verifiedText: "ldwqy3vsku",
});
