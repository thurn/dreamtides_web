import { localizationTodo } from "@trox/runtime";
import { MainMenuButton } from "../../components/controls/MainMenuButton";
import type { CumulusComponent } from "../registry";

function MainMenuButtonDemo() {
  return (
    <div style={{ width: 280 }}>
      <MainMenuButton label={localizationTodo("New Journey")} onPress={() => {}} />
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
      label: "Main-menu action",
      note: "Use this hierarchy for full-bleed main-menu actions.",
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
