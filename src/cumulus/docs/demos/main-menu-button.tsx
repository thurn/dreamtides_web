import { MainMenuButton } from "../../components/controls/MainMenuButton";
import type { CumulusComponent } from "../registry";

function MainMenuButtonDemo(args: Record<string, unknown>) {
  return (
    <div style={{ width: 280 }}>
      <MainMenuButton
        label="New Journey"
        size={args.size === "hero" ? "hero" : "standard"}
        onPress={() => {}}
      />
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
      label: "Standard action",
      note: "Use the standard hierarchy for secondary main-menu actions.",
      code: `<MainMenuButton
  label="New Journey"
  onPress={startJourney}
/>`,
    },
    {
      label: "Hero action",
      note: "Use the hero hierarchy for the primary full-bleed scene actions.",
      code: `<MainMenuButton
  label="New Journey"
  size="hero"
  onPress={startJourney}
/>`,
    },
  ],
  demo: {
    defaultArgs: { size: "standard" },
  },
};
