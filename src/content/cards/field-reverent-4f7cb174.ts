import {
  activated,
  all,
  characterYouControl,
  energyX,
  x,
} from "../../engine/dsl/builders";
import { setBaseSpark } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Field Reverent",
  mtgName: "Mirror Entity",
  id: "4f7cb174-6324-46a8-9973-44adfa7fef9f",
  renderedText:
    "X●: The ✦ of each character you control becomes X until end of turn.",
  energyCost: 3,
  cardType: "Character",
  subtype: "Visitor",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 1,
  tags: ["Art Rework", "Art OK", "Ally Audit"],
  imageNumber: 1213574257,
  artOwned: false,
  cardNumber: 428,
  isStarter: false,
  abilities: () => [
    activated(
      [energyX(0)],
      setBaseSpark(all(characterYouControl()), x(), "untilEndOfTurn"),
    ),
  ],
  verifiedText: "1q7bzo6mxp8",
});
