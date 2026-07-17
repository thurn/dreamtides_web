import {
  MainMenuButton,
  type MainMenuButtonVariant,
} from "../../components/controls/MainMenuButton";
import type { CumulusComponent } from "../registry";

interface MainMenuButtonDemoArgs {
  variant?: MainMenuButtonVariant;
}

function MainMenuButtonDemo({ variant = "accent" }: MainMenuButtonDemoArgs) {
  return (
    <div style={{ width: 320 }}>
      <MainMenuButton
        label="New Journey"
        variant={variant}
        onPress={() => {}}
      />
    </div>
  );
}

export const mainMenuButtonDemo: CumulusComponent = {
  id: "main-menu-button",
  title: "Main Menu Button",
  blurb:
    "The text-first action for the Dreamtides main menu: outlined white at rest, revealing the shared Cumulus liquid-glass material from the right on hover or focus.",
  callout:
    "Use only on the full-bleed main-menu scene; labeled actions elsewhere use GlassButton.",
  group: "Components",
  docName: "MainMenuButton",
  Component: MainMenuButtonDemo,
  usage: [
    {
      note: "Choose neutral frost, purple accent, or the warmer reveal tint while the menu design is being tuned; every option uses the shared liquid-glass recipe.",
      code: `<MainMenuButton
  label="New Journey"
  variant="accent"
  onPress={startJourney}
/>`,
    },
  ],
  demo: {
    defaultArgs: { variant: "accent" },
  },
};
