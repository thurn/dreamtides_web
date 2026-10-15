import { energy, event, playedThisTurn, reclaim } from "../../engine/dsl/builders";
import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import { materializeFigments } from "../../engine/effects/primitives";
import { parseFigmentId } from "../../engine/state/ids";
import shadow from "../figments/shadow-86125402";
import { card } from "../define";

export default card({
  name: "Call the Lost",
  mtgName: "Empty the Warrens",
  id: "2690912e-0295-4d12-a603-5946d37902d3",
  renderedText:
    "For each card you've played this turn, materialize a 2✦ shadow figment.\n\nReclaim 2●",
  energyCost: 3,
  cardType: "Event",
  subtype: "",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: null,
  tags: ["Figment Maker", "Art Rework", "Art OK"],
  imageNumber: 454095508,
  artOwned: false,
  cardNumber: 116,
  art: { x: -0.068, y: 1, scale: 1.07 },
  isStarter: false,
  abilities: () => [
    event(materializeFigments(parseFigmentId(shadow.id), playedThisTurn(), { spark: 2 })),
    reclaim(energy(2)),
  ],
  verifiedText: expectedVerifiedText("For each card you've played this turn, materialize a 2✦ shadow figment.\n\nReclaim 2●"),
});
