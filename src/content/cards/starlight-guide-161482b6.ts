import { characterYouControl, target, upTo } from "../../engine/dsl/builders";
import { onChallenge, triggered } from "../../engine/dsl/triggers";
import { rematerialize } from "../../engine/effects/primitives/rematerialize";
import { card } from "../define";

export default card({
  name: "Starlight Guide",
  mtgName: "Phelia, Exuberant Shepherd",
  id: "161482b6-af07-4d9e-822d-8c738672beb9",
  renderedText: "▸Challenge: Rematerialize a character you control.",
  amplifiedText: "▸Challenge: Rematerialize up to two characters you control.",
  energyCost: 2,
  cardType: "Character",
  subtype: "Guide",
  rarity: "Uncommon",
  isFast: true,
  isInterrupt: false,
  spark: 2,
  tags: ["Ally Audit", "Art Owned"],
  imageNumber: 2022594419,
  artOwned: false,
  cardNumber: 2,
  isStarter: false,
  abilities: (variant) => [triggered(onChallenge(), rematerialize(variant.amplified ? upTo(characterYouControl(), 2) : target(characterYouControl())))],
  verifiedText: "mo1vhw2frb",
});
