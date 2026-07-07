import { DreamcallerPortrait } from "../../components/hud/DreamcallerPortrait";
import type { TangoComponent } from "../registry";

const sampleDreamcaller = {
  imageNumber: "0025",
  name: "Seld Rakor",
  title: "Ashen Memory",
};

function DreamcallerPortraitDemo(args: Record<string, unknown>) {
  return (
    <DreamcallerPortrait
      dreamcaller={sampleDreamcaller}
      variant={
        args.variant === "hero" || args.variant === "thumb" ? args.variant : "panel"
      }
      size={typeof args.size === "number" ? args.size : 160}
    />
  );
}

export const dreamcallerPortraitDemo: TangoComponent = {
  id: "dreamcaller-portrait",
  title: "Dreamcaller Portrait",
  blurb:
    "The framed Dreamcaller character-art component: hero, panel, and thumb crops over the shared tinted portrait backdrop with a monogram fallback.",
  group: "Components",
  docName: "DreamcallerPortrait",
  Component: DreamcallerPortraitDemo,
  usage: [
    {
      code: `import { DreamcallerPortrait } from "src/tango/components/hud/DreamcallerPortrait";

<DreamcallerPortrait dreamcaller={dreamcaller} variant="panel" size={160} />`,
    },
  ],
  demo: {
    defaultArgs: {
      variant: "panel",
      size: 160,
    },
  },
};
