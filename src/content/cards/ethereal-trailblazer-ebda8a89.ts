import { characterYouControl, controls, ofSubtype } from "../../engine/dsl/builders";
import { either, onDawn, onMaterialized, triggered } from "../../engine/dsl/triggers";
import { gainEnergy, ifThen } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Ethereal Trailblazer",
  mtgName: "Mox Opal",
  id: "ebda8a89-9cc7-4fcd-96bd-0e022bb88a49",
  renderedText:
    "▸Materialized, Dawn: If you control 3 or more warriors, gain 1●.",
  amplifiedText:
    "▸Materialized, Dawn: If you control 2 or more warriors, gain 1●.",
  energyCost: 0,
  cardType: "Character",
  subtype: "Warrior",
  rarity: "Rare",
  isFast: false,
  isInterrupt: false,
  spark: 0,
  tags: ["Art Rework", "Art OK", "Ally Audit", "tutorial", "Art Owned"],
  imageNumber: 1047769090,
  artOwned: false,
  cardNumber: 15,
  art: { x: -0.294, y: 1, scale: 1.17 },
  isStarter: false,
  abilities: (variant) => [
    triggered(either(onMaterialized(), onDawn()), ifThen(
      controls(characterYouControl(ofSubtype("Warrior")), variant.amplified ? 2 : 3),
      gainEnergy(1),
    )),
  ],
  verifiedText: "2f7cffxadyv",
});
