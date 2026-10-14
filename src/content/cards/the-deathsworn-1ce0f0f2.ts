import { characterYouControl, thisCardIn } from "../../engine/dsl/builders";
import { triggered, whenMaterialize } from "../../engine/dsl/triggers";
import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import { materialize } from "../../engine/effects/primitives";
import { card } from "../define";

export default card({
  name: "The Deathsworn",
  mtgName: "Sword of the Meek",
  id: "1ce0f0f2-4b1a-483d-b93b-74c36e946a08",
  renderedText:
    "When you materialize a character with 1✦, materialize this character from your void.",
  amplifiedText:
    "When you materialize a ≤1✦ character, materialize this character from your void.",
  energyCost: 2,
  cardType: "Character",
  subtype: "Warrior",
  rarity: "Rare",
  isFast: false,
  isInterrupt: false,
  spark: 2,
  tags: ["tutorial"],
  imageNumber: 1562815903,
  artOwned: false,
  cardNumber: 10,
  isStarter: false,
  abilities: (variant) => [
    triggered(
      whenMaterialize(characterYouControl({ sparkAtMost: 1, ...(variant.amplified ? {} : { sparkAtLeast: 1 }) })),
      materialize(thisCardIn("void")),
      { zone: "void" },
    ),
  ],
  verifiedText: expectedVerifiedText("When you materialize a character with 1✦, materialize this character from your void.", "When you materialize a ≤1✦ character, materialize this character from your void."),
});
