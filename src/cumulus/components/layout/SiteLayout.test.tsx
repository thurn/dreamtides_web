// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { artRef } from "../../primitives/art";
import { mountCumulus } from "../../test-helpers/component-test-fixtures";
import {
  calculateGuideSpeechTarget,
  SiteLayout,
  type SiteLayoutComposition,
} from "./SiteLayout";
import { parseSiteId } from "../../../types/identifiers";
import { testDreamscapeId, testGuideId } from "../../../types/test-identities";

const compositions: readonly SiteLayoutComposition[] = [
  "balanced-gallery",
  "content-led-gallery",
  "balanced-revelation",
  "content-led-revelation",
  "balanced-expanded-revelation",
  "content-led-expanded-revelation",
  "balanced-dual-dialogue-revelation",
];

afterEach(() => {
  document.body.innerHTML = "";
});
beforeEach(() => {
  globalThis.ResizeObserver = class {
    observe(): void {}
    disconnect(): void {}
  } as unknown as typeof ResizeObserver;
  installMatchMedia(390);
});

function installMatchMedia(width: number): void {
  window.matchMedia = vi.fn().mockImplementation((query: string) => {
    const minimum = /min-width:\s*(\d+)px/.exec(query)?.[1];
    const maximum = /max-width:\s*(\d+)px/.exec(query)?.[1];
    return {
      matches:
        (minimum === undefined || width >= Number(minimum)) &&
        (maximum === undefined || width <= Number(maximum)),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
  });
}

describe("SiteLayout", () => {
  it("maps the authored head focus through contained-image geometry", () => {
    const target = calculateGuideSpeechTarget({
      containerLeft: 64,
      containerTop: 83,
      imageLeft: 14,
      imageTop: 27,
      imageWidth: 364,
      imageHeight: 720,
      naturalWidth: 1024,
      naturalHeight: 1536,
      objectPositionY: "bottom",
      focusX: 0.608,
      focusY: 0.22,
    });
    expect(target?.x).toBeCloseTo(171.312);
    expect(target?.y).toBeCloseTo(238.12);
  });

  it("mounts every named recipe at desktop and narrow widths with one semantic content region", () => {
    for (const width of [390, 1440])
      for (const composition of compositions) {
        installMatchMedia(width);
        const { container, root } = mountCumulus(
          <SiteLayout
            siteId={parseSiteId(composition)}
            scene={null}
            moteTint="warm"
            guide={{
              id: testGuideId("guide"),
              name: "Guide",
              line: "Line",
              art: artRef.dreamGuide(testGuideId("guide")),
              presence: "speaking",
            }}
            composition={composition}
          >
            <div data-site-body="" />
          </SiteLayout>,
        );
        expect(
          container.querySelectorAll("[data-site-layout-content-region]"),
        ).toHaveLength(1);
        expect(
          container.querySelector("[data-site-layout-fallback-scene]"),
        ).not.toBeNull();
        expect(
          container.querySelector("[data-site-layout-speech-anchor]"),
        ).not.toBeNull();
        const layout =
          container.querySelector<HTMLElement>("[data-site-layout]");
        const stage = container.querySelector<HTMLElement>(
          "[data-site-layout-stage]",
        );
        const content = container.querySelector<HTMLElement>(
          "[data-site-layout-content-region]",
        );
        expect(layout?.dataset.siteLayoutViewport).toBe(
          width >= 900 ? "desktop" : "narrow",
        );
        expect(stage?.style.bottom).not.toBe("");
        if (width >= 900) {
          expect(content?.style.top).toBe("0px");
          expect(content?.style.left).not.toBe("0px");
        } else {
          expect(content?.style.left).toBe("0px");
          expect(content?.style.top).not.toBe("");
        }
        act(() => root.unmount());
      }
  });

  it("keeps portrait-only guides free of speech and resolves a scene independently", () => {
    const { container, root } = mountCumulus(
      <SiteLayout
        siteId={parseSiteId("fixture")}
        scene={artRef.dreamscapeScene(testDreamscapeId("fixture"))}
        moteTint="violet"
        guide={{
          id: testGuideId("guide"),
          name: "Guide",
          line: "Line",
          art: artRef.dreamGuide(testGuideId("guide")),
          presence: "portrait-only",
        }}
        composition="balanced-gallery"
      >
        <div />
      </SiteLayout>,
    );
    expect(container.querySelector("[data-site-layout-scene]")).not.toBeNull();
    expect(
      container.querySelector("[data-site-layout-speech-anchor]"),
    ).toBeNull();
    act(() => root.unmount());
  });

});
