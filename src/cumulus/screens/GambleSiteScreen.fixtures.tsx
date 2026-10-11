// Shared fixtures for the GambleSiteScreen tests: the site and its guide,
// and a render harness that supplies every gamble's callbacks.
import { act } from "react";
import { expect, vi } from "vitest";
import { artRef } from "../primitives/art";
import { GambleSiteScreen, type GambleSiteScreenProps } from "./GambleSiteScreen";
import { parseSiteId } from "../../types/identifiers";
import { testGuideArtKey, testGuideId } from "../../types/test-identities";
import { renderInCumulus } from "../testing/render";

export const SITE = {
  siteId: parseSiteId("fixture-gamble-site"),
  scene: null,
  isFarpoint: false,
  runtimeReady: true,
  guide: {
    id: testGuideId("fixture-guide"),
    name: "Fixture Guide",
    line: "A fixture gamble.",
    art: artRef.dreamGuide(testGuideArtKey("fixture-guide")),
    headTargetX: 0.6,
  },
} as const;

type View = GambleSiteScreenProps["view"];
type Callbacks = Omit<GambleSiteScreenProps, "view">;

export const tid = (marker: string) => `[data-testid="${marker}"]`;

export function renderGamble(view: View, callbacks: Partial<Callbacks> = {}) {
  const props: Callbacks = {
    onChooseGate: () => undefined,
    onLeave: () => undefined,
    onOutcomeShown: () => undefined,
    onPlayAgain: () => undefined,
    onDrawLadder: () => undefined,
    onLadderOutcomeShown: () => undefined,
    onReplaceDreamsign: () => undefined,
    ...callbacks,
  };
  const rendered = renderInCumulus(<GambleSiteScreen view={view} {...props} />);
  const query = (selector: string) =>
    rendered.container.querySelector<HTMLElement>(selector);
  return {
    ...rendered,
    query,
    count: (selector: string) =>
      rendered.container.querySelectorAll(selector).length,
    tap: (selector: string) => {
      const button = query(selector);
      expect(button).not.toBeNull();
      act(() => button?.click());
    },
    show: (next: View) => {
      rendered.rerender(<GambleSiteScreen view={next} {...props} />);
    },
  };
}

export function advance(ms = 10_000): void {
  void act(() => vi.advanceTimersByTime(ms));
}
