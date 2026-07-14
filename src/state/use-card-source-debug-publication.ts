import { useEffect, useId, useRef } from "react";
import type { CardSourceDebugState } from "../types/quest";
import type { QuestMutations } from "./quest-context";

/**
 * Publishes client-local card provenance once per logical mounted surface.
 * Deferred generation-aware cleanup absorbs StrictMode's setup replay, while
 * the publication id prevents a departed surface from clearing its successor.
 */
export function useCardSourceDebugPublication(
  publish: QuestMutations["setCardSourceDebug"],
  state: CardSourceDebugState | null,
  shownSource: string,
  hiddenSource: string,
): void {
  const publicationId = useId();
  const generationRef = useRef(0);
  const publishedStateRef = useRef<CardSourceDebugState | null | undefined>(
    undefined,
  );

  useEffect(() => {
    generationRef.current += 1;
    const generation = generationRef.current;
    if (publishedStateRef.current !== state) {
      publishedStateRef.current = state;
      publish(state, shownSource, publicationId);
    }

    return () => {
      queueMicrotask(() => {
        if (generationRef.current !== generation) {
          return;
        }
        publishedStateRef.current = undefined;
        publish(null, hiddenSource, publicationId);
      });
    };
  }, [hiddenSource, publicationId, publish, shownSource, state]);
}
