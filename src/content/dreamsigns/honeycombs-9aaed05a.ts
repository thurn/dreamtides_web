import { whenDiscard, triggered } from "../../engine/dsl/triggers";
import { gainEnergy } from "../../engine/effects/primitives";
import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import { dreamsign } from "../define";

export default dreamsign({
  id: "9aaed05a-2223-42f2-9b9d-81a53eab811c",
  name: "Honeycombs",
  imageName: "honeycombs.png",
  imageAlt: "Three amber gem shards set in pale cream honeycomb frames.",
  effectDescription: "Once per turn, when you discard a card, gain 1●.",
  rarity: "Uncommon",
  tideIds: [
    "77765ea3-16fb-4ab7-9f4f-4610f2f04d9f",
    "ab89d262-45d4-438d-8670-79d91f6e944f",
    "e95b00e1-dbff-453d-bdd6-f92034988107",
  ],
  tags: ["J11", "Tag OK"],
  abilities: () => [triggered(whenDiscard(), gainEnergy(1), { oncePerTurn: true })],
  verifiedText: expectedVerifiedText("Once per turn, when you discard a card, gain 1●."),
});
