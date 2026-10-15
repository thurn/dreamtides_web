import { discardedThisTurn, staticAbility, thisTurn } from "../../engine/dsl/builders";
import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import { costModifierNth } from "../../engine/effects/primitives/cost-modifier";
import { dreamsign } from "../define";

export default dreamsign({
  id: "5190a8b8-25a0-4c60-a4de-2e2c5a73af77",
  name: "Cactus",
  imageName: "cactus .png",
  imageAlt: "green spiky cactus with small offshoots and pale thorns",
  effectDescription:
    "If you have discarded a card this turn, the first card you play from your void costs 1● less.",
  rarity: "Uncommon",
  tideIds: ["51903b9a-825b-4d9a-8a6d-071670c3caaa"],
  tags: ["J11", "Tag OK"],
  abilities: () => [staticAbility(costModifierNth("you", {}, 1, { reduce: 1 }, { from: "void" }), { while: thisTurn(discardedThisTurn()) })],
  verifiedText: expectedVerifiedText("If you have discarded a card this turn, the first card you play from your void costs 1● less."),
});
