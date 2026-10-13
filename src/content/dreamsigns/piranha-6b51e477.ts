import { dreamsign } from "../define";
import { characterYouControl } from "../../engine/dsl/builders";
import { triggered, whenScores } from "../../engine/dsl/triggers";
import { gainPoints } from "../../engine/effects/primitives/gain-points";

export default dreamsign({
  id: "6b51e477-352c-489b-8d5f-049bc378fde9",
  name: "Piranha",
  imageName: "piranha.png",
  imageAlt:
    "Blue-green fish with orange belly, sharp teeth, and speckled scales.",
  effectDescription:
    "When a character you control scores ⍟ in a challenge, it scores 1 additional ⍟.",
  rarity: "Uncommon",
  tideIds: ["0b873395-ad12-4a9f-ab50-5820fc92dd19"],
  tags: ["J12", "Tag OK", "Ally Audit"],
  abilities: () => [triggered(whenScores(characterYouControl()), gainPoints(1))],
  verifiedText: "uyt3sac9h8",
});
