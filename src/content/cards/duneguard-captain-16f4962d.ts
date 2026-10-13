import { activated, characterYouControl, countGroups, exhaustSelf, ofSubtype } from "../../engine/dsl/builders";
import { draw, materializeFigments } from "../../engine/effects/primitives";
import { parseFigmentId } from "../../engine/state/ids";
import { card } from "../define";
import survivor from "../figments/survivor-5256888f";

export default card({
  name: "Duneguard Captain",
  mtgName: "Cryptbreaker",
  id: "16f4962d-2950-4360-8f55-bc47428480ef",
  renderedText:
    "☾: Materialize a 1✦ survivor figment.\n\n☾: Draw a card for each 3 survivors you control.",
  amplifiedText:
    "☾: Materialize a 2✦ survivor figment.\n\n☾: Draw a card for each 3 survivors you control.",
  energyCost: 1,
  cardType: "Character",
  subtype: "Survivor",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 1,
  tags: [
    "Removal",
    "Figment Maker",
    "Art Rework",
    "Art OK",
    "Ally Audit",
    "Art Owned",
  ],
  imageNumber: 1639942840,
  artOwned: false,
  cardNumber: 134,
  art: { x: 0.446, y: 1, scale: 1.37 },
  isStarter: false,
  abilities: (variant) => [
    activated([exhaustSelf()], materializeFigments(parseFigmentId(survivor.id), 1, { spark: variant.amplified ? 2 : 1 })),
    activated([exhaustSelf()], draw(countGroups(characterYouControl(ofSubtype("Survivor")), 3))),
  ],
  verifiedText: "1lgepy83bld",
});
