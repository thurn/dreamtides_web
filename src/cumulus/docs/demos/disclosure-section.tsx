import { localizationTodo } from "@trox/runtime";
import { useState, type ReactNode } from "react";
import { DisclosureSection } from "../../components/controls/DisclosureSection";
import type { GlassControlPlacement } from "../../primitives/control-placement";
import type { CumulusComponent } from "../registry";

function Demo({
  title = "AI Analysis",
  summary = "Optional details",
  placement = "onMedia",
  children = "Detailed content",
}: {
  title?: string;
  summary?: string;
  placement?: GlassControlPlacement;
  children?: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <DisclosureSection
      title={localizationTodo(title)}
      summary={localizationTodo(summary)}
      expanded={expanded}
      onExpandedChange={setExpanded}
      placement={placement}
    >
      {children}
    </DisclosureSection>
  );
}
export const disclosureSectionDemo: CumulusComponent = {
  id: "disclosure-section",
  title: "DisclosureSection",
  blurb:
    "A controlled, surface-aware Cumulus section for progressively revealing dense secondary information.",
  callout: "Use the default on scene media and dark standalone surfaces.",
  details: [
    "Set placement to onGlass inside GlassPanel, GlassDialog, or DeveloperRail so the section uses its lighter nested-glass treatment.",
  ],
  group: "Components",
  docName: "DisclosureSection",
  Component: Demo,
  usage: [
    {
      code: `<DisclosureSection title="AI Analysis" expanded={open} onExpandedChange={setOpen}>…</DisclosureSection>`,
    },
    {
      code: `<DisclosureSection title="AI Analysis" expanded={open} onExpandedChange={setOpen} placement="onGlass">…</DisclosureSection>`,
    },
  ],
  demo: {
    defaultArgs: {
      title: "AI Analysis",
      summary: "Optional details",
      placement: "onMedia",
    },
    sampleContent: { children: "Detailed content" },
  },
};
