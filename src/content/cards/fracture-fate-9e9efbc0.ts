import { enemyCharacter, event, target } from "../../engine/dsl/builders";
import { untilOpponentPays } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Fracture Fate",
  mtgName: "Swift Reconfiguration",
  id: "9e9efbc0-d438-48a9-9551-85c93fb33f3e",
  renderedText: "An enemy loses all abilities  until the opponent pays 3●.",
  amplifiedText: "An enemy loses all abilities until the opponent pays 4●.",
  energyCost: 1,
  cardType: "Event",
  subtype: "",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: null,
  tags: ["Art Rework", "Art OK"],
  imageNumber: 2182865341,
  artOwned: false,
  cardNumber: 509,
  art: { x: 0.672, y: 1, scale: 1.11 },
  isStarter: false,
  // C7, RD-hv-7x4l.1-12: the opponent pays to end it as a Fast special action; RD-hv-umm2.111-1, -2.
  abilities: (variant) => [event(p.loseAllAbilities(target(enemyCharacter()), { duration: untilOpponentPays(variant.amplified ? 4 : 3) }))],
  verifiedText: "150jra9abq",
});
