import { energy, event, reclaim } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { parseFigmentId } from "../../engine/state/ids";
import monstrosity from "../figments/monstrosity-ec9f97b2";
import { card } from "../define";

export default card({
  name: "Profane Summons",
  mtgName: "Hard Evidence",
  id: "56f019a8-6b77-4bcb-bfa6-37b94e188ead",
  renderedText: "Materialize a 4✦ monstrosity figment.\n\nReclaim 4●",
  amplifiedText: "Materialize a 5✦ monstrosity figment.\n\nReclaim 4●",
  energyCost: 3,
  cardType: "Event",
  subtype: "",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: null,
  tags: ["Art Rework", "Art OK"],
  imageNumber: 2123360843,
  artOwned: false,
  cardNumber: 506,
  art: { x: 0.084, y: 1, scale: 1.17 },
  isStarter: false,
  abilities: (variant) => [
    event(p.materializeFigments(parseFigmentId(monstrosity.id), 1, { spark: variant.amplified ? 5 : 4 })),
    reclaim(energy(4)),
  ],
  verifiedText: "xz6vkvs5ao",
});
