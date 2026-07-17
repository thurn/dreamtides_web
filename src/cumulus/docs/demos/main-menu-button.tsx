import {
  MainMenuButton,
  type MainMenuButtonVariant,
} from "../../components/controls/MainMenuButton";
import type { CumulusComponent } from "../registry";

interface MainMenuButtonDemoArgs {
  variant?: MainMenuButtonVariant;
}

function MainMenuButtonDemo({ variant = "mist" }: MainMenuButtonDemoArgs) {
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
    "The text-first action for the Dreamtides main menu: outlined white at rest, with a deep purple AAA-contrast field and ethereal right-edge glow on hover or focus.",
  callout:
    "Use only on the full-bleed main-menu scene; labeled actions elsewhere use GlassButton.",
  group: "Components",
  docName: "MainMenuButton",
  Component: MainMenuButtonDemo,
  usage: [
    {
      note: "Choose one of the four named right-origin motion treatments while the menu design is being tuned.",
      code: `<MainMenuButton
  label="New Journey"
  variant="mist"
  onPress={startJourney}
/>`,
    },
  ],
  demo: {
    defaultArgs: { variant: "mist" },
  },
};
