// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { CumulusRoot } from "../../CumulusRoot";
import { TidesInfoLabel } from "./TidesInfoLabel";
import { GLOSSARY_IDS, requireGlossaryEntry } from "../../../data/glossary";

const TIDES = requireGlossaryEntry(GLOSSARY_IDS.tides);

afterEach(() => {
  document.body.innerHTML = "";
});

describe("TidesInfoLabel", () => {
  it("renders a leading info glyph and owns the canonical Tides reveal", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() =>
      root.render(
        <CumulusRoot>
          <TidesInfoLabel />
        </CumulusRoot>,
      ),
    );

    const source = container.querySelector<HTMLElement>(
      "[data-tides-info-label]",
    );
    expect(source?.textContent).toContain(TIDES.term);
    expect(source?.getAttribute("aria-label")).toBeTruthy();
    expect(source?.tabIndex).toBe(0);
    expect(source?.dataset.revealFeedback).toBe("stationary");
    expect(source?.dataset.revealPrimaryVariant).toBe("text");
    expect(source?.dataset.revealSecondaryTitles).toBe("");

    const glyphGroup = source?.querySelector<HTMLElement>(
      "[data-tides-info-glyph]",
    );
    const glyph = source?.querySelector<HTMLElement>("[data-inline-glyph]");
    expect(source?.firstElementChild).toBe(glyphGroup);
    expect(glyphGroup?.firstElementChild).toBe(glyph);
    expect(glyph?.querySelector("i")?.className).toBe("bxf bx-info-circle");

    const description = document.getElementById(
      source?.getAttribute("aria-describedby") ?? "",
    );
    expect(description?.textContent).toContain(TIDES.term);
    expect(description?.textContent).toContain(TIDES.definition);

    act(() => source?.focus());
    expect(source?.dataset.revealActive).toBe("true");

    act(() => root.unmount());
    container.remove();
  });
});
