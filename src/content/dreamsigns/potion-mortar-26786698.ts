import { dreamsign } from "../define";
import { randomIn } from "../../engine/dsl/builders";
import { onDawn, triggered, untilEndOfTurn } from "../../engine/dsl/triggers";
import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import { changeCardCost } from "../../engine/effects/primitives";

export default dreamsign({
  id: "26786698-fdf2-493d-905b-4273a20586c9",
  name: "Potion Mortar",
  imageName: "bowl.png",
  imageAlt:
    "dark gray mortar holding bright yellow-green potion with a gold pestle",
  effectDescription: "▸Dawn: A random card in your hand costs 1● this turn.",
  rarity: "Common",
  tideIds: ["d923b6e9-8572-4b27-b456-e70e69e80b31"],
  tags: ["J10", "Tag OK"],
  abilities: () => [triggered(onDawn(), changeCardCost(randomIn("hand", 1), { set: 1 }, { duration: untilEndOfTurn() }))],
  verifiedText: expectedVerifiedText("▸Dawn: A random card in your hand costs 1● this turn."),
});
