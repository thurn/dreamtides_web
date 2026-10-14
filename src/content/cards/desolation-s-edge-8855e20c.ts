import { abandonSelfCost, activated, all, anyCharacter, exhaustSelf, storedCounters } from "../../engine/dsl/builders";
import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import { dissolve, storeCounters } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Desolation's Edge",
  mtgName: "Ratchet Bomb",
  id: "8855e20c-e23f-4499-a5e8-a7a46ff81d2b",
  renderedText:
    "☾: Store 1⧗.\n\nAbandon this character: Dissolve each character with cost less than or equal to the stored ⧗.",
  energyCost: 2,
  cardType: "Character",
  subtype: "Warrior",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 2,
  tags: [],
  imageNumber: 776481895,
  artOwned: false,
  cardNumber: 44,
  isStarter: false,
  abilities: () => [
    activated([exhaustSelf()], storeCounters(1)),
    activated([abandonSelfCost()], dissolve(all(anyCharacter({ costAtMost: storedCounters() })))),
  ],
  verifiedText: expectedVerifiedText(
    "☾: Store 1⧗.\n\nAbandon this character: Dissolve each character with cost less than or equal to the stored ⧗.",
  ),
});
