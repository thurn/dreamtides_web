import { activated, characterYouControl, countersCost, fromVoid } from "../../engine/dsl/builders";
import { triggered, whenMaterialize } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Void Claimant",
  mtgName: "Samwise Gamgee",
  id: "920ef495-5560-4fa6-9a95-b9584ef6a4cf",
  renderedText:
    "When you materialize a non-figment character, store 1⧗.\n\n3⧗: Return a character from your void to your hand.",
  amplifiedText:
    "When you materialize a non-figment character, store 2⧗.\n\n3⧗: Return a character from your void to your hand.",
  energyCost: 2,
  cardType: "Character",
  subtype: "Warrior",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 2,
  tags: ["Art Rework", "Art OK"],
  imageNumber: 2299755785,
  artOwned: false,
  cardNumber: 271,
  art: { x: 0, y: 1, scale: 1.27 },
  isStarter: false,
  abilities: (variant) => [
    triggered(whenMaterialize(characterYouControl({ figment: false })), p.storeCounters(variant.amplified ? 2 : 1)),
    activated([countersCost(3)], p.returnFromVoid(fromVoid({ cardType: "character" }), { toYourHand: true })),
  ],
  verifiedText: "192ownbpvkv",
});
