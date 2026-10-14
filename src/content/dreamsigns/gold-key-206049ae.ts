import { triggered, whenYouPlay } from "../../engine/dsl/triggers";
import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import { gainEnergy } from "../../engine/effects/primitives";
import { dreamsign } from "../define";

export default dreamsign({
  id: "206049ae-9f28-4a90-9f75-63d9ee5f4a27",
  name: "Gold Key",
  imageName: "key_3.png",
  imageAlt:
    "golden ornate key with curled filigree bow and bright polished shaft",
  effectDescription: "When you play your third character each turn, gain 2●.",
  rarity: "Uncommon",
  tideIds: [
    "568c305c-6884-4dff-b1ec-c08f387a6527",
    "b2b1b0da-6d48-40cb-9d44-f0a94f0615f5",
  ],
  tags: ["J12", "Tag OK"],
  abilities: () => [triggered(whenYouPlay({ cardType: "character" }, 3), gainEnergy(2))],
  verifiedText: expectedVerifiedText("When you play your third character each turn, gain 2●."),
});
