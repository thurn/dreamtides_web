import { event, playedThisTurn } from "../../engine/dsl/builders";
import { materializeFigments } from "../../engine/effects/primitives/materialize-figments";
import { parseFigmentId } from "../../engine/state/ids";
import ethereal from "../figments/ethereal-3eddb1b8";
import { card } from "../define";

export default card({
  name: "Ethereal Call",
  mtgName: "Chatterstorm",
  id: "2d0a7c62-29b5-433b-9b0e-c3dd7630ccc7",
  renderedText:
    "For each card you've played this turn, materialize a 1✦ ethereal figment.",
  amplifiedText:
    "For each card you've played this turn, materialize a 2✦ ethereal figment.",
  energyCost: 2,
  cardType: "Event",
  subtype: "",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: null,
  tags: ["Figment Maker", "Art Rework", "Art OK"],
  imageNumber: 2123360849,
  artOwned: false,
  cardNumber: 426,
  art: { x: 0.046, y: 1, scale: 1.11 },
  isStarter: false,
  abilities: (variant) => [event(materializeFigments(parseFigmentId(ethereal.id), playedThisTurn(), { spark: variant.amplified ? 2 : 1 }))],
  verifiedText: "1ntddotivpu",
});
