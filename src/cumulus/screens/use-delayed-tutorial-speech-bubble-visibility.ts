import { useEffect, useState } from "react";

/** Reveal the active tutorial speech bubble after its authored delay. */
export function useDelayedTutorialSpeechBubbleVisibility(
  speechBubbleId: string | undefined,
  delaySeconds: number | undefined,
): boolean {
  const [visibleId, setVisibleId] = useState<string | null>(null);

  useEffect(() => {
    if (
      speechBubbleId === undefined ||
      delaySeconds === undefined ||
      delaySeconds === 0
    ) {
      return undefined;
    }
    const timeout = window.setTimeout(() => {
      setVisibleId(speechBubbleId);
    }, delaySeconds * 1_000);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [delaySeconds, speechBubbleId]);

  return (
    speechBubbleId !== undefined &&
    (delaySeconds === 0 || visibleId === speechBubbleId)
  );
}
