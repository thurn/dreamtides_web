import { CharacterDialogue } from "../../components/overlay/CharacterDialogue";
import { artRef } from "../../primitives/art";
import type { CumulusComponent } from "../registry";

function CharacterDialogueDemo(args: Record<string, unknown>) {
  const speakerName =
    typeof args.speakerName === "string" ? args.speakerName : "Mira";
  const text = typeof args.text === "string" ? args.text : "Welcome, Dreamer.";
  const visible = typeof args.visible === "boolean" ? args.visible : true;
  const size =
    args.size === "prominent"
      ? "prominent"
      : args.size === "wide"
        ? "wide"
        : "compact";

  return (
    <CharacterDialogue
      dialogue={{
        portrait: artRef.characterPortrait("mira"),
        portraitAlt: "Mira",
        speakerName,
        text,
      }}
      size={size}
      visible={visible}
    />
  );
}

export const characterDialogueDemo: CumulusComponent = {
  id: "character-dialogue",
  title: "Character Dialogue",
  blurb:
    "A character portrait in the canonical round frame, paired with SpeechBubble and presented as one fadeable guide-dialogue object in compact, wide, or prominent scale.",
  callout:
    "Use it for character-led scene dialogue. The component owns its named portrait and bubble scales, centered pointer with clear portrait-frame separation, crop, frame, pairing layout, and fade transition; callers provide typed art, accessible portrait copy, the speaker name, the spoken line, and visibility.",
  group: "Components",
  docName: "CharacterDialogue",
  Component: CharacterDialogueDemo,
  usage: [
    {
      note: "Toggle visible to fade the complete portrait-and-bubble pairing in or out.",
      code: `import { CharacterDialogue } from "src/cumulus/components/overlay/CharacterDialogue";
import { artRef } from "src/cumulus/primitives/art";

<CharacterDialogue
  dialogue={{
    portrait: artRef.characterPortrait("mira"),
    portraitAlt: "Mira",
    speakerName: "Mira",
    text: "Welcome, Dreamer.",
  }}
  visible
/>`,
    },
  ],
  demo: {
    defaultArgs: {
      size: "compact",
      speakerName: "Mira",
      text: "Welcome, Dreamer.",
      visible: true,
    },
  },
};
