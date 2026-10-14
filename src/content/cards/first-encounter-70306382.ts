import { discardedIn, energy, event, thisCardIn } from "../../engine/dsl/builders";
import { triggered, whenDiscardSelf } from "../../engine/dsl/triggers";
import { grantReclaim } from "../../engine/effects/primitives/grant-reclaim";
import { materialize } from "../../engine/effects/primitives/materialize";
import { card } from "../define";

export default card({
  name: "First Encounter",
  mtgName: "Faith's Reward",
  id: "70306382-ac0d-4b08-843a-23efb3835c94",
  renderedText:
    "Materialize all characters in your void which were discarded this turn.\n\nWhen you discard this card, it gains reclaim 0●.",
  energyCost: 2,
  cardType: "Event",
  subtype: "",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: null,
  tags: ["Art Rework", "Art OK"],
  imageNumber: 1302572584,
  artOwned: false,
  cardNumber: 237,
  isStarter: false,
  abilities: () => [
    event(materialize(discardedIn("void", { cardType: "character" }))),
    triggered(whenDiscardSelf(), grantReclaim(thisCardIn("void"), { costs: [energy(0)] }), { zone: "void" }),
  ],
  verifiedText: "15c449fyx3b",
});
