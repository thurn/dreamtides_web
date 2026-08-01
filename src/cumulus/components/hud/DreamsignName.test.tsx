// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GLOSSARY, type GlossaryEntry } from "../../../data/glossary";
import { extractGlossaryTerms } from "../../../data/glossary-terms";
import { CumulusRoot } from "../../CumulusRoot";
import { DreamsignName } from "./DreamsignName";

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("DreamsignName", () => {
  it("shows only the underlined name and owns the full semantic reveal", () => {
    const pickGlossaryFixture = (): {
      entry: GlossaryEntry;
      effect: string;
      definitionWord: string;
    } => {
      for (const entry of GLOSSARY) {
        const effect = `A dreamsign that lets you ${entry.term} things.`;
        if (!extractGlossaryTerms(effect).includes(entry)) continue;
        const effectWords = new Set(
          effect.toLowerCase().match(/[a-z]+/g) ?? [],
        );
        const definitionWord = (
          entry.definition.match(/[A-Za-z]{4,}/g) ?? []
        ).find((word) => !effectWords.has(word.toLowerCase()));
        if (definitionWord !== undefined) {
          return { entry, effect, definitionWord };
        }
      }
      throw new Error("No glossary entry yielded a usable definition fixture");
    };
    const { effect, definitionWord } = pickGlossaryFixture();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <CumulusRoot>
          <DreamsignName
            dreamsign={{
              id: "00000000-0000-4000-8000-000000000032",
              name: "Quiet Compass",
              imageName: "quiet-compass.png",
              effectDescription: effect,
              isBane: false,
            }}
          />
        </CumulusRoot>,
      );
    });

    const name = container.querySelector<HTMLElement>("[data-dreamsign-name]");
    expect(name?.textContent).toBe("Quiet Compass");
    expect(name?.style.textDecoration).toContain("underline");
    expect(name?.dataset.revealEntityType).toBe("dreamsign");
    expect(name?.dataset.revealPrimaryVariant).toBe("object");
    expect(
      document.getElementById(name?.getAttribute("aria-describedby") ?? "")
        ?.textContent,
    ).toContain(definitionWord);

    act(() => root.unmount());
  });
});
