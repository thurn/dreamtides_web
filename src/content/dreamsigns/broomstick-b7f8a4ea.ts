import { dreamsign } from "../define";
import { onDawn, triggered } from "../../engine/dsl/triggers";
import { draw, loseEnergy, sequence } from "../../engine/effects/primitives";

export default dreamsign({
  id: "b7f8a4ea-c067-47ed-b251-2876b609108c",
  name: "Broomstick",
  imageName: "broomstick.png",
  imageAlt: "brown broom with red band and glowing yellow-green bristles",
  effectDescription: "▸Dawn: Lose 1●. Draw a card.",
  rarity: "Uncommon",
  tideIds: ["1a075e25-0344-4103-997c-dd8f8a57c84e"],
  tags: ["J10", "Tag OK"],
  abilities: () => [triggered(onDawn(), sequence(loseEnergy(1), draw(1)))],
  verifiedText: "z2li9tmewl",
});
