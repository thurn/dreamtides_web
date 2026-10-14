import { characterYouControl, controls } from "../../engine/dsl/builders";
import { onDawn, triggered } from "../../engine/dsl/triggers";
import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import { gainEnergy } from "../../engine/effects/primitives";
import { dreamsign } from "../define";

export default dreamsign({
  id: "4dc47625-73bd-4518-a4ef-29dda2171594",
  name: "Rune Sack",
  imageName: "runes.png",
  imageAlt: "Reddish-orange sack spilling pale rune-marked stones or shells.",
  effectDescription: "▸Dawn: If you control 3 or more figments, gain 2●.",
  rarity: "Uncommon",
  tideIds: [
    "a182f025-8a15-44e1-be26-74766a3b0b85",
    "ee5e7dd2-0c11-4349-94e1-ec1ae35b20af",
    "69d696b6-c7aa-460a-8868-a5fa70930c45",
  ],
  tags: ["J10", "Tag OK", "Ally Audit"],
  abilities: () => [
    triggered(onDawn(), gainEnergy(2), {
      condition: controls(characterYouControl({ figment: true }), 3),
    }),
  ],
  verifiedText: expectedVerifiedText(
    "▸Dawn: If you control 3 or more figments, gain 2●.",
  ),
});
