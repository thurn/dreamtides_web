// Shared helpers for the overlay component tests.
import { act } from "react";

/** Every query matches when `desktop`, so `useIsDesktop` follows the flag. */
export function stubMatchMedia(desktop: boolean): void {
  window.matchMedia = (media: string) => ({
    matches: desktop,
    media,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
}

export function click(element: HTMLElement | null | undefined): void {
  act(() => element?.click());
}
