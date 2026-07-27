import { useEffect, useState } from "react";
import {
  loadTutorialCards,
  type TutorialCards,
} from "../data/tutorial-cards";
import { logEvent } from "../logging";

/** Load the UUID-backed cards used by the standalone tutorial battle. */
export function useTutorialCards(): TutorialCards | null {
  const [cards, setCards] = useState<TutorialCards | null>(null);
  useEffect(() => {
    let active = true;
    void loadTutorialCards().then(
      (loaded) => {
        if (active) setCards(loaded);
      },
      (error: unknown) => {
        logEvent("tutorial_cards_load_failed", {
          sources: ["/card-data.json", "/dreamwell-data.json"],
          message: error instanceof Error ? error.message : String(error),
        });
      },
    );
    return () => {
      active = false;
    };
  }, []);
  return cards;
}
