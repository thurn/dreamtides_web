/**
 * Vitest setup shared by every test file. In DOM (jsdom) files it marks the
 * React act environment, fills the jsdom gap for `window.matchMedia` with a
 * non-matching query list (individual tests may still replace it to simulate
 * a viewport or input modality), and tears down `renderInCumulus` renders
 * after each test.
 */
import { afterEach } from "vitest";
import { runRenderCleanups } from "../cumulus/testing/render-cleanup";

if (typeof window !== "undefined") {
  afterEach(runRenderCleanups);

  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  if (typeof window.matchMedia !== "function") {
    window.matchMedia = (query: string): MediaQueryList => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    });
  }
}
