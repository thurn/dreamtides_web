import { energy, event, reclaim } from "../../engine/dsl/builders";
import { whenMaterialize } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Quiet Reflection",
  mtgName: "Rite of Harmony",
  id: "f160fd01-b3c3-4904-b15f-339f6fcf5ca5",
  renderedText:
    "Until end of turn, when you materialize a character, draw a card.\n\nReclaim 4●.",
  energyCost: 2,
  cardType: "Event",
  subtype: "",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: null,
  tags: ["Art Rework", "Art OK"],
  imageNumber: 1099575602,
  artOwned: false,
  cardNumber: 269,
  art: { x: 0, y: 0.897, scale: 1.07 },
  isStarter: false,
  abilities: () => [event(p.floating(whenMaterialize(), p.draw(1))), reclaim(energy(4))],
  verifiedText: "omsi6o5xc4",
});
