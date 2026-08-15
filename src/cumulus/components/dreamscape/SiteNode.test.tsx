import { assertLocalized } from "@trox/runtime";
// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { CumulusRoot } from "../../CumulusRoot";
import { glyph } from "../../primitives/glyph";
import { SiteNode, type DreamscapeSiteModel } from "./SiteNode";
import { parseSiteId } from "../../../types/identifiers";

const MODEL: DreamscapeSiteModel = {
  id: parseSiteId("00000000-0000-4000-8000-000000000041"),
  type: "Battle",
  isVisited: false,
  pos: { x: 50, y: 50 },
  index: 0,
  isBattle: true,
  isLocked: true,
  isInteractive: false,
  label: assertLocalized("Guardian Battle"),
  lockedGuidance: assertLocalized("Visit the other sites first."),
  blurb: assertLocalized("Defeat the guardian."),
  icon: glyph("bxf bx-shield"),
};

describe("SiteNode", () => {
  it("keeps an unavailable site focusable and descriptive while suppressing activation", () => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    const activate = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() =>
      root.render(
        <CumulusRoot>
          <SiteNode model={MODEL} motion={false} onSelect={activate} />
        </CumulusRoot>,
      ),
    );
    const source =
      container.querySelector<HTMLButtonElement>("[data-site-id]")!;
    expect(source.tabIndex).toBe(0);
    expect(source.style.touchAction).toBe("pan-x pan-y");
    expect(source.dataset.revealFeedback).toBe("measured");
    expect(source.dataset.revealEntityType).toBe("site");
    expect(source.dataset.revealEntityId).toBe(MODEL.id);
    expect(source.dataset.revealPrimaryVariant).toBe("icon");
    expect(source.dataset.revealSecondaryTitles).toBe("");
    expect(source.getAttribute("aria-disabled")).toBe("true");
    const description = document.getElementById(
      source.getAttribute("aria-describedby") ?? "",
    );
    expect(description?.textContent).toContain("Guardian Battle");
    expect(description?.textContent).toContain("Visit the other sites first.");
    act(() => source.click());
    expect(activate).not.toHaveBeenCalled();
    act(() => root.unmount());
    container.remove();
  });

  it("owns distinct scene and reward presentation sizes", () => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() =>
      root.render(
        <CumulusRoot>
          <SiteNode
            model={MODEL}
            motion={false}
            presentation="reward"
            onSelect={() => undefined}
          />
        </CumulusRoot>,
      ),
    );
    const source = container.querySelector<HTMLElement>("[data-site-id]");
    expect(source?.dataset.siteNodePresentation).toBe("reward");
    expect(source?.style.width).toBe("160px");
    expect(source?.style.height).toBe("160px");
    act(() => root.unmount());
    container.remove();
  });
});
