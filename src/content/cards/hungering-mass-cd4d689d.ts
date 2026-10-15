import { abandonCost, activated, energy, leftPlayThisTurn, thisTurn } from "../../engine/dsl/builders";
import { onNight, triggered } from "../../engine/dsl/triggers";
import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import { foresee, materializeFigments } from "../../engine/effects/primitives";
import { parseFigmentId } from "../../engine/state/ids";
import { card } from "../define";
import ethereal from "../figments/ethereal-3eddb1b8";

export default card({
  name: "Hungering Mass",
  mtgName: "Hidden Stockpile",
  id: "cd4d689d-1442-4a19-8e6a-182b425d066d",
  renderedText:
    "▸Night: If a character you control left play this turn, materialize a 1✦ ethereal figment.\n\n1●, Abandon another character: Foresee 1.",
  amplifiedText:
    "▸Night: If a character you control left play this turn, materialize a 2✦ ethereal figment.\n\n1●, Abandon another character: Foresee 1.",
  energyCost: 2,
  cardType: "Character",
  subtype: "Ancient",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: 2,
  tags: [
    "Figment Maker",
    "Art Rework",
    "Art Duplicate",
    "Art OK",
    "Ally Audit",
  ],
  imageNumber: 1557999812,
  artOwned: false,
  cardNumber: 475,
  art: { x: -0.002, y: 1, scale: 1.07 },
  isStarter: false,
  abilities: (variant) => [
    triggered(onNight(), materializeFigments(parseFigmentId(ethereal.id), 1, { spark: variant.amplified ? 2 : 1 }),
      { condition: thisTurn(leftPlayThisTurn()) }),
    activated([energy(1), abandonCost({ another: true })], foresee(1)),
  ],
  verifiedText: expectedVerifiedText(
    "▸Night: If a character you control left play this turn, materialize a 1✦ ethereal figment.\n\n1●, Abandon another character: Foresee 1.",
    "▸Night: If a character you control left play this turn, materialize a 2✦ ethereal figment.\n\n1●, Abandon another character: Foresee 1.",
  ),
});
