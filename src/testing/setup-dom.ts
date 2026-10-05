/**
 * Vitest setup shared by every test file, run before each file loads.
 *
 * The suite runs with `isolate: false`, so a worker reuses its module runner
 * and jsdom window across files. Each file therefore starts by resetting the
 * module registry (source modules evaluate afresh; `vi.mock` registrations
 * are per file), real timers, and stubbed globals and envs. Vitest restores
 * spies after every file itself.
 *
 * In DOM (jsdom) files it also restores the jsdom globals (see
 * `dom-globals.ts`), marks the React act environment, fills the jsdom gap for
 * `window.matchMedia` with a non-matching query list (individual tests may
 * still replace it to simulate a viewport or input modality), and tears down
 * `renderInCumulus` renders after each test.
 */
import { afterEach, vi } from "vitest";
import { restoreDomGlobals } from "./dom-globals";

vi.resetModules();
vi.useRealTimers();
vi.unstubAllGlobals();
vi.unstubAllEnvs();

// Imported after the reset so the drained registry is the instance that the
// test file's renders register with.
const { runRenderCleanups } = await import("../cumulus/testing/render-cleanup");

if (typeof window !== "undefined") {
  restoreDomGlobals();
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
