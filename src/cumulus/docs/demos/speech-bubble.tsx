import { SpeechBubble } from "../../components/overlay/SpeechBubble";
import type { CumulusComponent } from "../registry";

function SpeechBubbleDemo(args: Record<string, unknown>) {
  const speakerName =
    typeof args.speakerName === "string" ? args.speakerName : "Sigrún";
  const text =
    typeof args.text === "string"
      ? args.text
      : "The frost reveals what is hidden.";
  const size = args.size === "prominent" ? "prominent" : "standard";
  const pointerAlignment =
    args.pointerAlignment === "center" ? "center" : "lower";
  return (
    <SpeechBubble
      pointerAlignment={pointerAlignment}
      size={size}
      speakerName={speakerName}
      text={text}
    />
  );
}

export const speechBubbleDemo: CumulusComponent = {
  id: "speech-bubble",
  title: "Speech Bubble",
  blurb:
    "A guide-dialog bubble for character-led site screens: the same frosted information material as an InfoCard, with a left arrow that points back to the speaker.",
  callout:
    "Use it to the right of character art, not as a general text container. The component owns its glass material, white on-glass name treatment, quote voice, named display scales, and pointer geometry; use centered pointer alignment beside circular portraits.",
  group: "Components",
  docName: "SpeechBubble",
  Component: SpeechBubbleDemo,
  usage: [
    {
      note: "The bubble sits to the right of the character, so the arrow points left.",
      code: `import { SpeechBubble } from "src/cumulus/components/overlay/SpeechBubble";

<SpeechBubble
  speakerName="Sigrún"
  text="The frost reveals what is hidden."
/>`,
    },
  ],
  demo: {
    defaultArgs: {
      pointerAlignment: "lower",
      size: "standard",
      speakerName: "Sigrún",
      text: "The frost reveals what is hidden.",
    },
  },
};
