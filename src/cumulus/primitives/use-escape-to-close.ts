// useEscapeToClose — a dismissible overlay closes on Escape, and when it
// unmounts focus returns to whatever held it when the overlay opened (the
// control that opened it), so keyboard users land where they were.

import { useEffect, useRef } from "react";

/** Close on Escape while mounted; restore the opener's focus on unmount. */
export function useEscapeToClose(onClose: () => void): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onCloseRef.current();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (opener !== null && opener.isConnected) opener.focus();
    };
  }, []);
}
