// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GlossaryCatalogEntry } from "../data/glossary";
import GlossaryEditorApp from "./GlossaryEditorApp";

const ENTRIES: readonly GlossaryCatalogEntry[] = [
  {
    id: "spark",
    category: "Resources",
    term: "Spark",
    definition: "A character's combat power.",
    matchesRulesText: true,
    variants: [],
  },
  {
    id: "site-draft",
    category: "Sites",
    term: "Draft",
    definition: "Choose cards for your deck.",
    matchesRulesText: false,
    variants: [],
  },
];

function mount(): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.append(container);
  return { container, root: createRoot(container) };
}

function setTextareaValue(textarea: HTMLTextAreaElement, value: string): void {
  const descriptor = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  );
  if (descriptor?.set === undefined) throw new Error("Missing value setter");
  descriptor.set.call(textarea, value);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("GlossaryEditorApp", () => {
  it("previews and persists edited Info Card copy by stable id", async () => {
    const loadEntries = vi.fn().mockResolvedValue(ENTRIES);
    const saveEntry = vi.fn().mockImplementation(
      (
        edit: Pick<
          GlossaryCatalogEntry,
          "id" | "term" | "definition" | "variants"
        >,
      ) => Promise.resolve({ ...ENTRIES[0], ...edit }),
    );
    const { container, root } = mount();

    await act(async () => {
      root.render(
        <GlossaryEditorApp
          loadEntries={loadEntries}
          saveEntry={saveEntry}
        />,
      );
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Info Card Glossary");
    expect(
      container.querySelector("[data-testid='glossary-preview']")?.textContent,
    ).toContain("A character's combat power.");

    const textarea = container.querySelector<HTMLTextAreaElement>(
      "[data-testid='glossary-definition-input']",
    );
    expect(textarea).not.toBeNull();
    act(() => setTextareaValue(textarea!, "Power used during a challenge."));

    expect(
      container.querySelector("[data-testid='glossary-preview']")?.textContent,
    ).toContain("Power used during a challenge.");

    const saveButton = container.querySelector<HTMLButtonElement>(
      "[data-testid='glossary-save']",
    );
    await act(async () => {
      saveButton?.click();
      await Promise.resolve();
    });

    expect(saveEntry).toHaveBeenCalledWith({
      id: "spark",
      term: "Spark",
      definition: "Power used during a challenge.",
      variants: [],
    });
    expect(container.textContent).toContain("Saved to glossary.toml");

    act(() => root.unmount());
  });
});
