import { activated, characterYouControl, count, exhaustSelf, ofSubtype, staticAbility, supported } from "../../engine/dsl/builders";
import { gainEnergy, sparkModifier } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Ghostlight Wolves",
  mtgName: "Elvish Archdruid",
  id: "c8579b20-95ff-4b1d-b4c6-6bd049fc4760",
  renderedText:
    "Support – Supported spirit animals have +2✦.\n\n☾: Gain 1● for each spirit animal you control.",
  energyCost: 3,
  cardType: "Character",
  subtype: "Spirit Animal",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 2,
  tags: ["Spirit Lord", "Ally Audit", "Art Owned"],
  imageNumber: 2127752129,
  artOwned: false,
  cardNumber: 48,
  art: { x: 0.084, y: 1, scale: 1.17 },
  isStarter: false,
  abilities: () => [
    staticAbility(sparkModifier(supported(ofSubtype("Spirit Animal")), 2)),
    activated([exhaustSelf()], gainEnergy(count(characterYouControl(ofSubtype("Spirit Animal"))))),
  ],
  verifiedText: "1iv18luhkdh",
});
