// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertLocalized } from "@trox/runtime";
import { artRef } from "../../primitives/art";
import { mountCumulus } from "../../test-helpers/component-test-fixtures";
import { SiteLayout, type SiteLayoutComposition } from "./SiteLayout";

const compositions: readonly SiteLayoutComposition[] = [
  "balanced-gallery",
  "content-led-gallery",
  "balanced-revelation",
  "content-led-revelation",
  "balanced-expanded-revelation",
  "content-led-expanded-revelation",
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
  it("mounts every named recipe at desktop and narrow widths with one semantic content region", () => {
    for (const width of [390, 1440])
      for (const composition of compositions) {
        installMatchMedia(width);
        const { container, root } = mountCumulus(
          <SiteLayout
            siteId={composition}
            scene={null}
            moteTint="warm"
            guide={{
              id: "guide",
              name: assertLocalized("Guide"),
              line: assertLocalized("Line"),
              art: artRef.dreamGuide("guide"),
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
        siteId="fixture"
        scene={artRef.dreamscapeScene("fixture")}
        moteTint="violet"
        guide={{
          id: "guide",
          name: assertLocalized("Guide"),
          line: assertLocalized("Line"),
          art: artRef.dreamGuide("guide"),
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

  it("uses the compact speaking relationship at intermediate desktop widths", () => {
    installMatchMedia(1000);
    const { container, root } = mountCumulus(
      <SiteLayout
        siteId="intermediate"
        scene={null}
        moteTint="warm"
        guide={{
          id: "guide",
          name: assertLocalized("Guide"),
          line: assertLocalized("Line"),
          art: artRef.dreamGuide("guide"),
          presence: "speaking",
        }}
        composition="content-led-gallery"
      >
        <div data-only-child="" />
      </SiteLayout>,
    );
    const speech = container.querySelector<HTMLElement>(
      "[data-site-layout-speech-anchor]",
    );
    expect(speech?.style.top).toBe("0px");
    expect(speech?.style.left).toBe("42%");
    expect(container.querySelectorAll("[data-only-child]")).toHaveLength(1);
    act(() => root.unmount());
  });
});
