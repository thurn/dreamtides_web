// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { loadTestDreamGuides } from "../__test-helpers__/atlas-fixtures";
import type { QuestContextValue } from "../state/quest-context";
import { useQuest } from "../state/quest-context";
import type { DreamGuideContent } from "../types/content";
import type { SiteState } from "../types/quest";
import { DreamGuideFrame } from "./DreamGuideFrame";

vi.mock("../state/quest-context", () => ({
  useQuest: vi.fn(),
}));

const mockedUseQuest = vi.mocked(useQuest);

// The frame reads only `questContent.guides` from the context, so the rest of
// the value is a thin stub the type narrows over.
function provideGuides(guides: readonly DreamGuideContent[]): void {
  mockedUseQuest.mockReturnValue({
    questContent: { guides },
  } as unknown as QuestContextValue);
}

function makeSite(type: SiteState["type"], isEnhanced: boolean): SiteState {
  return { id: "site-x", type, isEnhanced, isVisited: false };
}

let container: HTMLDivElement;
let root: Root;

function render(element: ReactElement): void {
  act(() => {
    root.render(element);
  });
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.clearAllMocks();
});

describe("DreamGuideFrame", () => {
  it("presents the guide that tends the site type, with their name and dialog", () => {
    const guides = loadTestDreamGuides();
    expect(guides.length).toBeGreaterThan(0);
    const guide = guides[0];
    provideGuides(guides);

    render(<DreamGuideFrame site={makeSite(guide.siteType, false)} />);

    const frame = container.querySelector<HTMLElement>(
      "[data-dream-guide-frame]",
    );
    expect(frame).not.toBeNull();
    expect(frame?.getAttribute("data-guide-id")).toBe(guide.id);
    expect(frame?.textContent ?? "").toContain(guide.name);
    if (guide.dialog.length > 0) {
      // Some dialog line from the guide's set is shown.
      const shown = guide.dialog.some((line) =>
        (frame?.textContent ?? "").includes(line),
      );
      expect(shown).toBe(true);
    }
  });

  it("surfaces the guide's home specialty when the site is enhanced", () => {
    const guides = loadTestDreamGuides();
    const guide = guides[0];
    provideGuides(guides);

    render(<DreamGuideFrame site={makeSite(guide.siteType, true)} />);

    const frame = container.querySelector<HTMLElement>(
      "[data-dream-guide-frame]",
    );
    expect(frame?.getAttribute("data-guide-enhanced")).toBe("true");
    const specialty = container.querySelector<HTMLElement>(
      "[data-guide-home-specialty]",
    );
    expect(specialty).not.toBeNull();
    expect(specialty?.textContent ?? "").toContain(guide.homeSpecialty);
  });

  it("omits the home specialty when the site is not enhanced", () => {
    const guides = loadTestDreamGuides();
    const guide = guides[0];
    provideGuides(guides);

    render(<DreamGuideFrame site={makeSite(guide.siteType, false)} />);

    const frame = container.querySelector<HTMLElement>(
      "[data-dream-guide-frame]",
    );
    expect(frame?.getAttribute("data-guide-enhanced")).toBe("false");
    expect(
      container.querySelector("[data-guide-home-specialty]"),
    ).toBeNull();
  });

  it("renders nothing for a site type no guide tends", () => {
    const guides = loadTestDreamGuides();
    provideGuides(guides);

    // Battle is never a guide's signature site, so no frame should render.
    render(<DreamGuideFrame site={makeSite("Battle", false)} />);

    expect(container.querySelector("[data-dream-guide-frame]")).toBeNull();
  });
});
