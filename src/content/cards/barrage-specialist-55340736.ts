import { all, anyCharacter } from "../../engine/dsl/builders";
import { onChallenge, triggered } from "../../engine/dsl/triggers";
import { gainSpark } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "Barrage Specialist",
  mtgName: "Signal Pest",
  id: "55340736-7fc5-4555-8f47-081d770a6e8d",
  renderedText: "▸Challenge: Each other challenging character gains +1✦.",
  amplifiedText: "▸Challenge: Each other challenging character gains +2✦.",
  energyCost: 1,
  cardType: "Character",
  subtype: "Warrior",
  rarity: "Common",
  isFast: false,
  isInterrupt: false,
  spark: 1,
  tags: ["Art Rework", "Art OK", "Ally Audit", "tutorial"],
  imageNumber: 450347140,
  artOwned: false,
  cardNumber: 443,
  art: { x: -0.689, y: 1, scale: 1.37 },
  isStarter: false,
  abilities: (variant) => [
    triggered(onChallenge(), gainSpark(all(anyCharacter({ challenging: true, another: true })), variant.amplified ? 2 : 1)),
  ],
  verifiedText: "p58ij5c7h",
});
