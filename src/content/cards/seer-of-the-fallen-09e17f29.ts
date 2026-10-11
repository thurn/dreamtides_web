import { characterYouControl } from "../../engine/dsl/builders";
import { triggered, whenDissolved } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";
import { parseCardId } from "../../types/card-identity";
import contemplation from "./contemplation-69964b8e";
import { card } from "../define";

const CONTEMPLATION = parseCardId(contemplation.id);

export default card({
  name: "Seer of the Fallen",
  mtgName: "Voldaren Bloodcaster // Bloodbat Summoner",
  id: "09e17f29-8ee1-477f-8175-ff37eb1f254a",
  renderedText:
    "When a non-figment character you control is dissolved, create 'Contemplation' in your hand.",
  amplifiedText:
    "When a non-figment character you control is dissolved, create 'Contemplation' in your hand. If it was a survivor, create two instead.",
  energyCost: 2,
  cardType: "Character",
  subtype: "Survivor",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 2,
  tags: ["Ally Audit"],
  imageNumber: 1913887480,
  artOwned: false,
  cardNumber: 146,
  isStarter: false,
  // Contemplation is C1. Amplified, "if it was a survivor" reads the character
  // as it last was in play: two dissolve triggers, exactly one of which
  // matches each dissolve (RD-hv-umm2.108-1).
  abilities: (variant) =>
    variant.amplified
      ? [
          triggered(whenDissolved(characterYouControl({ subtype: "Survivor" }), { figment: false }), p.createCard(CONTEMPLATION, 2)),
          triggered(whenDissolved(characterYouControl({ notSubtype: "Survivor" }), { figment: false }), p.createCard(CONTEMPLATION, 1)),
        ]
      : [triggered(whenDissolved(characterYouControl(), { figment: false }), p.createCard(CONTEMPLATION, 1))],
  verifiedText: "xchy5h3e1y",
});
