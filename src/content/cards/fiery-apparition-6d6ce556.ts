import { anyCharacter, characterYouControl, self } from "../../engine/dsl/builders";
import { triggered, whenDissolved } from "../../engine/dsl/triggers";
import { gainSpark, materializeFigments } from "../../engine/effects/primitives";
import { parseFigmentId } from "../../engine/state/ids";
import ember from "../figments/ember-361b4942";
import { card } from "../define";

export default card({
  name: "Fiery Apparition",
  mtgName: "Anax, Hardened in the Forge",
  id: "6d6ce556-60df-486f-b2d8-5df168a6f75e",
  renderedText:
    "When a non-figment character you control is dissolved, materialize a 1✦ ember figment with awakened. When an ember figment is dissolved, this character gains +1✦.",
  amplifiedText:
    "When a non-figment character you control is dissolved, materialize a 2✦ ember figment with awakened. When an ember figment is dissolved, this character gains +1✦.",
  energyCost: 3,
  cardType: "Character",
  subtype: "Elemental",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 3,
  tags: ["Figment Maker", "Art Rework", "Ally Audit", "Art OK"],
  imageNumber: 2018053217,
  artOwned: false,
  cardNumber: 154,
  art: { x: 0, y: 1, scale: 1.28 },
  isStarter: false,
  abilities: (variant) => [
    // The armed non-figment watcher includes this character as it leaves play.
    triggered(whenDissolved(characterYouControl(), { figment: false }), materializeFigments(parseFigmentId(ember.id), 1, { spark: variant.amplified ? 2 : 1, awakened: true })),
    // An Ember figment on either side gives the permanent gain.
    triggered(whenDissolved(anyCharacter({ subtype: "Ember" }), { figment: true }), gainSpark(self(), 1)),
  ],
  verifiedText: "15bbhjwilnu",
});
