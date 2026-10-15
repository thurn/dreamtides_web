import { dreamsign } from "../define";
import { playedThisTurn, thisTurn } from "../../engine/dsl/builders";
import { onNight, triggered } from "../../engine/dsl/triggers";
import { gainEnergy } from "../../engine/effects/primitives";
import { expectedVerifiedText } from "../../engine/dsl/verified-text";

export default dreamsign({
  id: "fdd2ffe4-40f4-49cf-bc2e-2496e1042f76",
  name: "Poppy Flower",
  imageName: "maquis.png",
  imageAlt:
    "orange poppy-like flower with dark purple center and soft glowing petals",
  effectDescription: "▸Night: If you have played no cards this turn, gain 2●.",
  rarity: "Common",
  tideIds: ["d923b6e9-8572-4b27-b456-e70e69e80b31"],
  tags: ["J15", "Tag OK"],
  abilities: () => [triggered(onNight(), gainEnergy(2), { condition: thisTurn(playedThisTurn(), 0, 0) })],
  verifiedText: expectedVerifiedText("▸Night: If you have played no cards this turn, gain 2●."),
});
