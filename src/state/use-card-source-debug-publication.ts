import { useEffect, useId, useRef } from "react";
import type { CardSourceDebugState } from "../types/journey";
import type {
  JourneyMutationSource,
  JourneyMutations,
} from "./journey-context";
import { parsePublicationId } from "../types/identifiers";

/**
 * Publishes client-local card provenance once per logical mounted surface.
 * Deferred generation-aware cleanup absorbs StrictMode's setup replay, while
 * the publication id prevents a departed surface from clearing its successor.
 */
export function useCardSourceDebugPublication(
  publish: JourneyMutations["setCardSourceDebug"],
  state: CardSourceDebugState | null,
  shownSource: JourneyMutationSource,
  hiddenSource: JourneyMutationSource,
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
      publish(state, shownSource, parsePublicationId(publicationId));
    }

    return () => {
      queueMicrotask(() => {
        if (generationRef.current !== generation) {
          return;
        }
        publishedStateRef.current = undefined;
        publish(null, hiddenSource, parsePublicationId(publicationId));
      });
    };
  }, [hiddenSource, publicationId, publish, shownSource, state]);
}
