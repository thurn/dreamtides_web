import { useEffect, useState } from "react";

export const SITE_TUTORIAL_APPEARANCE_DELAY_MS = 1_000;

/** Reveal one site tutorial after its screen has remained mounted for one second. */
export function useDelayedSiteTutorialVisibility(
  tutorialId: string | undefined,
): boolean {
  const [visibleId, setVisibleId] = useState<string | null>(null);

  useEffect(() => {
    if (tutorialId === undefined) return undefined;
    const timeout = window.setTimeout(() => {
      setVisibleId(tutorialId);
    }, SITE_TUTORIAL_APPEARANCE_DELAY_MS);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [tutorialId]);

  return tutorialId !== undefined && visibleId === tutorialId;
}
