import { characterYouControl, count, self, staticAbility } from "../../engine/dsl/builders";
import { sparkModifier } from "../../engine/effects/primitives/spark-modifier";
import { figment } from "../define";

export default figment({
  name: "Legionnaire",
  id: "e757b306-5bab-4a5a-8493-28c0f3aa6440",
  subtype: "Warrior",
  spark: 1,
  keyword: "",
  renderedText: "This character has +1✦ for each other warrior you control.",
  tags: [],
  imageNumber: 653554603,
  artOwned: false,
  art: { x: 0, y: 0.399, scale: 1 },
  abilities: () => [staticAbility(sparkModifier(self(), count(characterYouControl({ subtype: "Warrior", another: true }))))],
  verifiedText: "n7c5gxe3j6",
});
