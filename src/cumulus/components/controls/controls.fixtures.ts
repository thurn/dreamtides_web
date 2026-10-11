// Shared interaction helpers for the control tests.
import { act } from "react";

export function click(element: Element | null | undefined): void {
  act(() => {
    (element as HTMLElement | null | undefined)?.click();
  });
}

export function keydown(element: Element | null | undefined, key: string): void {
  act(() => {
    element?.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true }),
    );
  });
}
