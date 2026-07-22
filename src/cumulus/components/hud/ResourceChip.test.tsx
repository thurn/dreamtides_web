// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { CumulusRoot } from "../../CumulusRoot";
import { ResourceChip } from "./ResourceChip";
import { GLOSSARY_IDS } from "../../../data/glossary";

describe("ResourceChip semantic source", () => {
  it("derives an icon InfoCard from resource domain data", () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement("div"); document.body.append(container); const root = createRoot(container);
    act(() => root.render(<CumulusRoot><ResourceChip kind="essence" value={120} entity={{ id: "quest-start-caller", glossaryId: GLOSSARY_IDS.startingEssence }} /></CumulusRoot>));
    const source = container.querySelector<HTMLElement>("[data-resource-source]")!;
    expect(source.dataset.revealFeedback).toBe("measured");
    expect(source.dataset.revealEntityType).toBe("resource-essence");
    expect(source.dataset.revealEntityId).toMatch(/^[0-9a-f-]{36}$/);
    expect(source.dataset.revealPrimaryVariant).toBe("icon");
    expect(source.dataset.revealSecondaryTitles).toBe("");
    const description = document.getElementById(source.getAttribute("aria-describedby") ?? "");
    expect(description?.textContent).toContain("Starting Essence");
    expect(description?.textContent).toContain("begins the quest with");
    act(() => root.unmount()); container.remove();
  });
});
