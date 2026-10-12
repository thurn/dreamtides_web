import { all, characterYouControl, event } from "../../engine/dsl/builders";
import { awaken, sequence, triggerAbility } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Surge of Fury",
  mtgName: "Turnabout",
  id: "c06b993d-a1f4-42ad-85a9-ebf611d9a129",
  renderedText:
    "Trigger the '▸Dawn' ability of each character you control. Awaken each character you control.",
  energyCost: 4,
  cardType: "Event",
  subtype: "",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: null,
  tags: ["Ally Audit", "Art Owned"],
  imageNumber: 1968259702,
  artOwned: false,
  cardNumber: 251,
  isStarter: false,
  abilities: () => [
    event(sequence(triggerAbility(all(characterYouControl()), "dawn"), awaken(all(characterYouControl())))),
  ],
  verifiedText: "5vwfiavdek",
});
