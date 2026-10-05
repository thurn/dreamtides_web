/**
 * Renders a React tree inside CumulusRoot for DOM tests. Every render is
 * unmounted and detached after each test by `src/testing/setup-dom.ts`, so
 * tests only call `unmount` when the unmount itself is under test.
 */
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CumulusRoot } from "../CumulusRoot";
import { registerRenderCleanup } from "./render-cleanup";

export interface CumulusRender {
  /** Host element appended to `document.body`. */
  readonly container: HTMLDivElement;
  /** The underlying React root, for tests that drive renders directly. */
  readonly root: Root;
  /** Replaces the rendered tree, again wrapped in CumulusRoot. */
  readonly rerender: (element: ReactElement) => void;
  /** Unmounts and detaches the host now; safe to call more than once. */
  readonly unmount: () => void;
}

export function renderInCumulus(element: ReactElement): CumulusRender {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(<CumulusRoot>{element}</CumulusRoot>);
  });
  const unmount = (): void => {
    act(() => {
      root.unmount();
    });
    container.remove();
  };
  const unregister = registerRenderCleanup(unmount);
  return {
    container,
    root,
    rerender: (next) => {
      act(() => {
        root.render(<CumulusRoot>{next}</CumulusRoot>);
      });
    },
    unmount: () => {
      unregister();
      unmount();
    },
  };
}
