import { useEffect, useRef, useState, type PointerEvent, type ReactElement } from "react";
import { PoolViewerAdapter } from "../../screens/cumulus_adapters/PoolViewerAdapter";
import type { PoolViewerAdapterInput } from "../../screens/cumulus_adapters/pool-viewer-view-model";

/** Battle-owned local drag shell around the shared Cumulus pool viewer. */
export function PoolViewerFloatingController(props: PoolViewerAdapterInput): ReactElement | null {
  const panelRef = useRef<HTMLDivElement>(null);
  const dragOffset = useRef<{ x: number; y: number } | null>(null);
  const [position, setPosition] = useState({ x: 24, y: 24 });
  useEffect(() => {
    function move(event: globalThis.PointerEvent): void { const offset = dragOffset.current; const panel = panelRef.current; if (offset === null || panel === null) return; setPosition({ x: Math.max(8, Math.min(event.clientX - offset.x, window.innerWidth - panel.offsetWidth - 8)), y: Math.max(8, Math.min(event.clientY - offset.y, window.innerHeight - panel.offsetHeight - 8)) }); }
    function end(): void { dragOffset.current = null; }
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", end); window.addEventListener("pointercancel", end);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", end); window.removeEventListener("pointercancel", end); };
  }, []);
  if (!props.isOpen) return null;
  function beginDrag(event: PointerEvent<HTMLDivElement>): void { const target = event.target instanceof HTMLElement ? event.target : null; if (target?.closest("button, input, [data-gallery-entry-id]") !== null) return; const panel = panelRef.current; if (panel === null) return; const bounds = panel.getBoundingClientRect(); dragOffset.current = { x: event.clientX - bounds.left, y: event.clientY - bounds.top }; }
  return <div ref={panelRef} data-pool-viewer-floating-panel="" onPointerDown={beginDrag} style={{ position: "fixed", zIndex: 58, left: position.x, top: position.y, width: "min(820px, calc(100vw - 24px))", maxHeight: "min(76vh, 720px)", overflow: "auto" }}><PoolViewerAdapter {...props} variant="floating" /></div>;
}
