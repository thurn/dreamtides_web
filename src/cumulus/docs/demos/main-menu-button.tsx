import { MainMenuButton } from "../../components/controls/MainMenuButton";
import type { CumulusComponent } from "../registry";

function MainMenuButtonDemo() {
  return (
    <div style={{ width: 280 }}>
      <MainMenuButton label="New Journey" onPress={() => {}} />
    </div>
  );
}

export const mainMenuButtonDemo: CumulusComponent = {
  id: "main-menu-button",
  title: "Main Menu Button",
  blurb:
    "The text-first action for the Dreamtides main menu: outlined white at rest, showing the shared Cumulus liquid-glass material on hover or focus.",
  callout:
    "Use only on the full-bleed main-menu scene; labeled actions elsewhere use GlassButton.",
  group: "Components",
  docName: "MainMenuButton",
  Component: MainMenuButtonDemo,
  usage: [
    {
      note: "Use the standard neutral liquid-glass hover treatment on the full-bleed main menu.",
      code: `<MainMenuButton
  label="New Journey"
  onPress={startJourney}
/>`,
    },
  ],
  demo: {
    defaultArgs: {},
  },
};
