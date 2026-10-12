import { self } from "../../engine/dsl/builders";
import { onDawn, onDissolved, triggered } from "../../engine/dsl/triggers";
import { thisCharacterSpark } from "../../engine/dsl/values";
import { gainSpark, materializeFigments } from "../../engine/effects/primitives";
import { parseFigmentId } from "../../engine/state/ids";
import warrior from "../figments/warrior-bb1a5acd";
import { card } from "../define";

export default card({
  name: "Inferno's Herald",
  mtgName: "Hangarback Walker",
  id: "01a8482b-5b4f-4c49-8791-2702cb5dfd3d",
  renderedText:
    "▸Dawn: This character gains +1✦.\n\n▸Dissolved: Materialize a 1✦ warrior figment for each ✦ this character has.",
  amplifiedText:
    "▸Dawn: This character gains +2✦.\n\n▸Dissolved: Materialize a 1✦ warrior figment for each ✦ this character has.",
  energyCost: 2,
  cardType: "Character",
  subtype: "Warrior",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: 1,
  tags: ["Figment Maker"],
  imageNumber: 485518048,
  artOwned: false,
  cardNumber: 400,
  isStarter: false,
  abilities: (variant) => [
    triggered(onDawn(), gainSpark(self(), variant.amplified ? 2 : 1)),
    // The Dissolved reward reads departure spark for the last in-play controller (RD460-1, RD342-1).
    triggered(onDissolved(), materializeFigments(parseFigmentId(warrior.id), thisCharacterSpark(), { spark: 1 })),
  ],
  verifiedText: "1rchgr2njfr",
});
