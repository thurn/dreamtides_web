import {
  DreamAvatarAbilityText,
  type DreamAvatarAbilityTextProps,
} from "../../components/hud/DreamAvatarAbilityText";
import type { CumulusComponent } from "../registry";

const SAMPLE_DREAM_AVATAR_ID = "11111111-1111-4111-8111-111111111111";
const SAMPLE_ABILITY = [
  "❖ – Draw a card.",
  "❖❖ – 2●, ☾: Return a card from your void.",
  "▸Night: Draw a card.",
].join("\n");

interface DreamAvatarAbilityTextDemoArgs {
  dreamAvatarId?: string;
  text?: string;
  presentation?: DreamAvatarAbilityTextProps["presentation"];
}

function DreamAvatarAbilityTextDemo({
  dreamAvatarId = SAMPLE_DREAM_AVATAR_ID,
  text = SAMPLE_ABILITY,
  presentation = "natural",
}: DreamAvatarAbilityTextDemoArgs) {
  return (
    <DreamAvatarAbilityText
      dreamAvatarId={dreamAvatarId}
      text={text}
      presentation={presentation}
    />
  );
}

export const dreamAvatarAbilityTextDemo: CumulusComponent = {
  id: "dream-avatar-ability-text",
  title: "DreamAvatar Ability Text",
  blurb:
    "The complete DreamAvatar rules-text source: hovering, focusing, or touch-holding anywhere in the ability reveals one compact title-free card containing every defined term in rules-text occurrence order, using DreamAvatar-specific exhaust guidance.",
  group: "Components",
  docName: "DreamAvatarAbilityText",
  Component: DreamAvatarAbilityTextDemo,
  usage: [
    {
      note: "Pass the DreamAvatar UUID and complete rendered rules text. The stationary source keeps the default text cursor and explains exhaust as a once-per-turn DreamAvatar ability. Use the selection-card presentation for the aligned desktop offer triptych.",
      code: `import { DreamAvatarAbilityText } from "src/cumulus/components/hud/DreamAvatarAbilityText";

<DreamAvatarAbilityText
  dreamAvatarId={dreamAvatar.id}
  text={dreamAvatar.renderedText}
  presentation="selectionCard"
/>`,
    },
  ],
  demo: {
    defaultArgs: {
      dreamAvatarId: SAMPLE_DREAM_AVATAR_ID,
      text: SAMPLE_ABILITY,
      presentation: "natural",
    },
  },
};
