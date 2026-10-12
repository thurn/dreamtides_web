import { activated, characterYouControl, count, energy, exhaustSelf, ofSubtype } from "../../engine/dsl/builders";
import { onDawn, triggered } from "../../engine/dsl/triggers";
import { gainEnergy, materializeFigments } from "../../engine/effects/primitives";
import { parseFigmentId } from "../../engine/state/ids";
import { card } from "../define";
import warrior from "../figments/warrior-bb1a5acd";

export default card({
  name: "Crescendo Channeler",
  mtgName: "Urza, Lord High Artificer",
  id: "867b98cf-171b-497b-9252-9af5dcf70726",
  renderedText:
    "▸Dawn: Materialize a 1✦ warrior figment.\n\n2●, ☾: Gain 1● for each warrior you control.",
  amplifiedText:
    "▸Dawn: Materialize a 2✦ warrior figment.\n\n2●, ☾: Gain 1● for each warrior you control.",
  energyCost: 4,
  cardType: "Character",
  subtype: "Warrior",
  rarity: "Rare",
  isFast: false,
  isInterrupt: false,
  spark: 3,
  tags: ["Figment Maker", "Ally Audit"],
  imageNumber: 2544257339,
  artOwned: false,
  cardNumber: 220,
  art: { x: 0, y: -0.264, scale: 1.67 },
  isStarter: false,
  abilities: (variant) => [
    triggered(onDawn(), materializeFigments(parseFigmentId(warrior.id), 1, { spark: variant.amplified ? 2 : 1 })),
    activated([energy(2), exhaustSelf()], gainEnergy(count(characterYouControl(ofSubtype("Warrior"))))),
  ],
  verifiedText: "1j4qtcpjtdg",
});
