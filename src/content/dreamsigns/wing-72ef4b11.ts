import { triggered, whenDraw } from "../../engine/dsl/triggers";
import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import { gainMaxEnergy } from "../../engine/effects/primitives/gain-max-energy";
import { dreamsign } from "../define";

export default dreamsign({
  id: "72ef4b11-5366-4798-aab0-09e5ffbb1ed8",
  name: "Wing",
  imageName: "wing.png",
  imageAlt: "Bright blue feather fan with green leaves at the base",
  effectDescription:
    "When you draw your second card each turn, gain 1 maximum ●.",
  rarity: "Rare",
  tideIds: ["1a075e25-0344-4103-997c-dd8f8a57c84e"],
  tags: ["J12", "Tag OK"],
  abilities: () => [triggered(whenDraw("you", 2), gainMaxEnergy(1))],
  verifiedText: expectedVerifiedText("When you draw your second card each turn, gain 1 maximum ●."),
});
