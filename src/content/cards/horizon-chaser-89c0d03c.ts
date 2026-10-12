import { characterYouControl } from "../../engine/dsl/builders";
import { triggered, triggeringCard, whenMaterialize } from "../../engine/dsl/triggers";
import { thisCharacterSpark } from "../../engine/dsl/values";
import { gainSpark } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Horizon Chaser",
  mtgName: "Arwen, Weaver of Hope",
  id: "89c0d03c-2199-415a-bc66-89e451034328",
  renderedText:
    "When you materialize a non-figment character, it gains +X✦ where X is this character's ✦.",
  energyCost: 4,
  cardType: "Character",
  subtype: "Visitor",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: 1,
  tags: ["Art Rework", "Art OK", "Art Owned"],
  imageNumber: 2275146333,
  artOwned: false,
  cardNumber: 42,
  art: { x: -0.319, y: 0.028, scale: 1.47 },
  isStarter: false,
  abilities: () => [triggered(whenMaterialize(characterYouControl({ figment: false })), gainSpark(triggeringCard(), thisCharacterSpark()))],
  verifiedText: "t678xho6hg",
});
