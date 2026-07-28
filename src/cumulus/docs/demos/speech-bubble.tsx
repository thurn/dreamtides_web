import { SpeechBubble } from "../../components/overlay/SpeechBubble";
import type { CumulusComponent } from "../registry";

function SpeechBubbleDemo(args: Record<string, unknown>) {
  const speakerName =
    typeof args.speakerName === "string" ? args.speakerName : "Sigrún";
  const text =
    typeof args.text === "string"
      ? args.text
      : "An [purple]event[purple] resolves once. Gain ⍟ equal to your [yellow]spark ✦[/yellow].";
  const size = args.size === "prominent" ? "prominent" : "standard";
  const pointerPlacement =
    args.pointerPlacement === "left-center" ||
    args.pointerPlacement === "top-left" ||
    args.pointerPlacement === "bottom-left"
      ? args.pointerPlacement
      : "left-lower";
  return (
    <SpeechBubble
      pointerPlacement={pointerPlacement}
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
    "A guide-dialog bubble for character-led screens: the same frosted information material as an InfoCard, with a strict left, top-left, or bottom-left pointer toward the speaker and shared tutorial instruction formatting backed by the canonical inline rules-glyph renderer.",
  callout:
    "Use it beside character art or attached above/below a battle portrait, not as a general text container. The component owns its glass material, white on-glass name treatment, quote voice, named display scales, pointer geometry, yellow and event-frame purple highlights, and canonical inline rules glyphs. Top-left and bottom-left pointer bases stay clear of the rounded corners.",
  group: "Components",
  docName: "SpeechBubble",
  Component: SpeechBubbleDemo,
  usage: [
    {
      note: "The default bubble sits to the right of the character, so the arrow points left.",
      code: `import { SpeechBubble } from "src/cumulus/components/overlay/SpeechBubble";

<SpeechBubble
  speakerName="Sigrún"
  text="An [purple]event[purple] resolves once. Gain ⍟ equal to your [yellow]spark ✦[/yellow]."
/>`,
    },
  ],
  demo: {
    defaultArgs: {
      pointerPlacement: "left-lower",
      size: "standard",
      speakerName: "Sigrún",
      text:
        "An [purple]event[purple] resolves once. Gain ⍟ equal to your [yellow]spark ✦[/yellow].",
    },
  },
};
