import { characterYouControl } from "../../engine/dsl/builders";
import { triggered, whenDissolved } from "../../engine/dsl/triggers";
import { draw } from "../../engine/effects/primitives";
import { dreamsign } from "../define";

export default dreamsign({
  id: "6b5c0f18-198c-44e7-92e8-d639298b8cf6",
  name: "Sealed Scroll",
  imageName: "scroll_3.png",
  imageAlt: "Beige scroll sealed with red ribbon and gold wax medal.",
  effectDescription:
    "Once per turn, when a spirit animal you control is dissolved, draw a card.",
  rarity: "Uncommon",
  tideIds: [
    "80e3d33f-6b21-4739-9050-be8d28de28a6",
    "fc729d2b-bf04-4b69-8050-00b30b296330",
    "e03f4d87-bc6c-46f9-9c08-bef7b59a9f70",
  ],
  tags: ["Tag OK", "Ally Audit"],
  abilities: () => [triggered(whenDissolved(characterYouControl({ subtype: "Spirit Animal" })), draw(1), { oncePerTurn: true })],
  verifiedText: "11r7kl2qnm",
});
