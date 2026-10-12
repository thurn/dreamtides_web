import { characterYouControl, controls, ofSubtype } from "../../engine/dsl/builders";
import { onDawn, triggered } from "../../engine/dsl/triggers";
import { gainEnergy, ifThen } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Luminwings",
  mtgName: "Arbor Elf",
  id: "14ac6804-ed1d-4148-aad7-11796b6fff6c",
  renderedText:
    "▸Dawn: Gain 1●. If you control 3 or more spirit animals, gain 2● instead.",
  amplifiedText:
    "▸Dawn: Gain 2●. If you control 3 or more spirit animals, gain 3● instead.",
  energyCost: 1,
  cardType: "Character",
  subtype: "Spirit Animal",
  rarity: "Uncommon",
  isFast: false,
  isInterrupt: false,
  spark: 0,
  tags: ["Elves", "Art Rework", "Art OK", "Ally Audit", "Art Owned"],
  imageNumber: 529374502,
  artOwned: false,
  cardNumber: 230,
  art: { x: 0.06, y: 0.369, scale: 1.57 },
  isStarter: false,
  abilities: (variant) => [
    triggered(onDawn(), ifThen(
      controls(characterYouControl(ofSubtype("Spirit Animal")), 3),
      gainEnergy(variant.amplified ? 3 : 2),
      gainEnergy(variant.amplified ? 2 : 1),
    )),
  ],
  verifiedText: "ahssmzqpvo",
});
