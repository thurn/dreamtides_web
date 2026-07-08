import { SpeechBubble } from "../../components/overlay/SpeechBubble";
import type { TangoComponent } from "../registry";

function SpeechBubbleDemo(args: Record<string, unknown>) {
  const speakerName =
    typeof args.speakerName === "string" ? args.speakerName : "Sigrún";
  const text =
    typeof args.text === "string"
      ? args.text
      : "The frost reveals what is hidden.";
  const arrowSide = args.arrowSide === "right" ? "right" : "left";
  return (
    <SpeechBubble speakerName={speakerName} text={text} arrowSide={arrowSide} />
  );
}

export const speechBubbleDemo: TangoComponent = {
  id: "speech-bubble",
  title: "Speech Bubble",
  blurb:
    "A guide-dialog bubble for character-led site screens: the same frosted information material as an InfoCard, with a strict left-or-right arrow that points back to the speaker.",
  callout:
    "Use it beside character art, not as a general text container. The component owns its glass material, name treatment, quote voice, and arrow geometry; the caller supplies only the speaker name, spoken line, and which side faces the character.",
  group: "Components",
  docName: "SpeechBubble",
  Component: SpeechBubbleDemo,
  usage: [
    {
      label: "Left arrow",
      note: "The bubble sits to the right of the character, so the arrow points left.",
      code: `import { SpeechBubble } from "src/tango/components/overlay/SpeechBubble";

<SpeechBubble
  speakerName="Sigrún"
  text="The frost reveals what is hidden."
  arrowSide="left"
/>`,
    },
    {
      label: "Right arrow",
      note: "The bubble sits to the left of the character, so the arrow points right.",
      code: `<SpeechBubble
  speakerName="Amunet"
  text="The sands remember all dreams."
  arrowSide="right"
/>`,
    },
  ],
  demo: {
    defaultArgs: {
      speakerName: "Sigrún",
      text: "The frost reveals what is hidden.",
      arrowSide: "left",
    },
  },
};
