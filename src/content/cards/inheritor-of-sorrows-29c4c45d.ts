import { conditionCardCounts, self, staticAbility } from "../../engine/dsl/builders";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Inheritor of Sorrows",
  mtgName: "Dragon's Rage Channeler",
  id: "29c4c45d-33df-42ac-bf28-387eb00264aa",
  renderedText:
    "If there are 3 or more events in your void, this character has +4✦ and gains awakened.",
  amplifiedText:
    "If there are 2 or more events in your void, this character has +4✦ and gains awakened.",
  energyCost: 1,
  cardType: "Character",
  subtype: "Synth",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 1,
  tags: ["Art OK"],
  imageNumber: 678431950,
  artOwned: false,
  cardNumber: 28,
  isStarter: false,
  abilities: (variant) => {
    const events = conditionCardCounts("void", variant.amplified ? 2 : 3, { filter: { cardType: "event" } });
    // Awakened acts only as it enters play: it enters ready if the condition holds then (RD-hv-umm2.169-1).
    return [staticAbility(p.sparkModifier(self(), 4), { while: events }), staticAbility(p.grant(self(), "awakened"), { while: events })];
  },
  verifiedText: "1lxlsp0c00q",
});
