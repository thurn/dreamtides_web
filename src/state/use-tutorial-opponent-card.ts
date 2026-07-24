import { useEffect, useState } from "react";
import {
  loadTutorialCards,
  TUTORIAL_DREAMWELL_CARD_ID,
  TUTORIAL_OPPONENT_CARD_ID,
  TUTORIAL_PLAYER_CARD_ID,
  TUTORIAL_RUNEBOUND_CHAMPION_CARD_ID,
  type TutorialCards,
} from "../data/tutorial-opponent-card";
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
          cardIds: [
            TUTORIAL_OPPONENT_CARD_ID,
            TUTORIAL_RUNEBOUND_CHAMPION_CARD_ID,
            TUTORIAL_PLAYER_CARD_ID,
            TUTORIAL_DREAMWELL_CARD_ID,
          ],
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
