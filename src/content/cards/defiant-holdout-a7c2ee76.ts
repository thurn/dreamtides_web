import { onDissolved, triggered } from "../../engine/dsl/triggers";
import { thisCharacterSpark } from "../../engine/dsl/values";
import * as p from "../../engine/effects/primitives";
import { parseFigmentId } from "../../engine/state/ids";
import survivor from "../figments/survivor-5256888f";
import { card } from "../define";

export default card({
  name: "Defiant Holdout",
  mtgName: "Nested Shambler",
  id: "a7c2ee76-48c9-4587-8f01-81d00ae280cb",
  renderedText:
    "▸Dissolved: Materialize X 1✦ survivor figments, where X is this character's ✦.",
  energyCost: 1,
  cardType: "Character",
  subtype: "Survivor",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 1,
  tags: ["Figment Maker"],
  imageNumber: 1149594491,
  artOwned: false,
  cardNumber: 184,
  isStarter: false,
  abilities: () => [
    // X is this character's spark immediately before it was dissolved (RD-hv-umm2.460-1); its last
    // in-play controller gets the figments (RD-hv-umm2.342-1).
    triggered(onDissolved(), p.materializeFigments(parseFigmentId(survivor.id), thisCharacterSpark(), { spark: 1 })),
  ],
  verifiedText: "2aq2nppn8qm",
});
