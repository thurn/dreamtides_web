import { turnOf } from "../../engine/dsl/builders";
import { triggered, triggeringCard, whenDraw } from "../../engine/dsl/triggers";
import { expectedVerifiedText } from "../../engine/dsl/verified-text";
import { gainTriggeringCardSpark } from "../../engine/effects/primitives/gain-triggering-card-spark";
import { changeCardCost } from "../../engine/effects/primitives/modify-card-cost";
import { sequence } from "../../engine/effects/primitives/sequence";
import { dreamsign } from "../define";

export default dreamsign({
  id: "1dfa4d90-8270-4b7c-87be-d95ab6201e00",
  name: "Blue Feather",
  imageName: "blue_feather.png",
  imageAlt:
    "pale cyan feather with soft translucent barbs on a white background",
  effectDescription:
    "If the first card you draw during your turn is a warrior, reduce its cost by 1● and it gains +2✦.",
  rarity: "Uncommon",
  tideIds: [
    "254054e3-1a7c-4bf4-8c30-491fdeeab40c",
    "4b01b6c1-ccca-4e19-848a-d799d46088b2",
    "833ba3dd-498a-42ce-9a03-32f6636acea1",
  ],
  tags: ["Tag OK"],
  abilities: () => [triggered(
    whenDraw("you", 1, { subtype: "Warrior" }),
    sequence(changeCardCost(triggeringCard(), { reduce: 1 }), gainTriggeringCardSpark(triggeringCard(), 2)),
    { condition: turnOf("you") },
  )],
  verifiedText: expectedVerifiedText("If the first card you draw during your turn is a warrior, reduce its cost by 1● and it gains +2✦."),
});
