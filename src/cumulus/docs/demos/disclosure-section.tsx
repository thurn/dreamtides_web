import { useState, type ReactNode } from "react";
import { DisclosureSection } from "../../components/controls/DisclosureSection";
import type { CumulusComponent } from "../registry";

function Demo({ title = "AI Analysis", summary = "Optional details", children = "Detailed content" }: { title?: string; summary?: string; children?: ReactNode }) { const [expanded, setExpanded] = useState(false); return <DisclosureSection title={title} summary={summary} expanded={expanded} onExpandedChange={setExpanded}>{children}</DisclosureSection>; }
export const disclosureSectionDemo: CumulusComponent = { id: "disclosure-section", title: "DisclosureSection", blurb: "A controlled Cumulus section for progressively revealing dense secondary information.", group: "Components", docName: "DisclosureSection", Component: Demo, usage: [{ code: `<DisclosureSection title="AI Analysis" expanded={open} onExpandedChange={setOpen}>…</DisclosureSection>` }], demo: { defaultArgs: { title: "AI Analysis", summary: "Optional details" }, sampleContent: { children: "Detailed content" } } };
