import { enemyCharacter, target } from "../../engine/dsl/builders";
import { onMaterialized, triggered, whileSourceInPlay } from "../../engine/dsl/triggers";
import { disableTriggers } from "../../engine/effects/primitives/disable-triggers";
import { card } from "../define";

export default card({
  name: "Pallid Arbiter",
  mtgName: "Phyrexian Revoker",
  id: "ce09ddfa-c349-4b32-b524-fb74444cddcb",
  renderedText:
    "▸Materialized: Disable the triggered abilities of an enemy while this character is in play.",
  amplifiedText:
    "▸Materialized: Disable the triggered and activated abilities of an enemy while this character is in play.",
  energyCost: 2,
  cardType: "Character",
  subtype: "Warrior",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 2,
  tags: ["tutorial", "Art Owned"],
  imageNumber: 1289324164,
  artOwned: true,
  cardNumber: 389,
  isStarter: false,
  abilities: (variant) => [triggered(onMaterialized(), disableTriggers(
    target(enemyCharacter()), whileSourceInPlay(), null, variant.amplified ? "triggeredAndActivated" : "triggered",
  ))],
  verifiedText: "1g148wyr3j5",
});
