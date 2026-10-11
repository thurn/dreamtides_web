import { energy, enemyCharacter, event, target, thisCardIn } from "../../engine/dsl/builders";
import { triggered, whenDiscardSelf } from "../../engine/dsl/triggers";
import * as p from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Annihilation from Below",
  mtgName: "Blast from the Past",
  id: "9d14885c-a757-40cc-b43e-87dbec7ec379",
  renderedText:
    "Dissolve a ≤2✦ enemy.\n\nWhen you discard this card, it gains reclaim 0●.\n",
  amplifiedText:
    "Dissolve a ≤3✦ enemy.\n\nWhen you discard this card, it gains reclaim 0●.\n",
  energyCost: 2,
  cardType: "Event",
  subtype: "",
  rarity: "Common",
  isFast: true,
  isInterrupt: false,
  spark: null,
  tags: ["Removal", "Art Rework", "Art OK", "Art Owned"],
  imageNumber: 1722480805,
  artOwned: false,
  cardNumber: 368,
  art: { x: -0.047, y: 1, scale: 1.1 },
  isStarter: false,
  abilities: (v) => [
    event(p.dissolve(target(enemyCharacter({ sparkAtMost: v.amplified ? 3 : 2 })))),
    triggered(whenDiscardSelf(), p.grantReclaim(thisCardIn("void"), { costs: [energy(0)] }), { zone: "void" }),
  ],
  verifiedText: "1wa1svt778f",
});
