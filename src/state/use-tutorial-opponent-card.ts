import { useEffect, useState } from "react";
import {
  loadTutorialOpponentCard,
  TUTORIAL_OPPONENT_CARD_ID,
} from "../data/tutorial-opponent-card";
import { logEvent } from "../logging";
import type { CardData } from "../types/cards";

/** Load the UUID-backed card used by the standalone tutorial battle. */
export function useTutorialOpponentCard(): CardData | null {
  const [card, setCard] = useState<CardData | null>(null);
  useEffect(() => {
    let active = true;
    void loadTutorialOpponentCard().then(
      (loaded) => {
        if (active) setCard(loaded);
      },
      (error: unknown) => {
        logEvent("tutorial_card_load_failed", {
          cardId: TUTORIAL_OPPONENT_CARD_ID,
          message: error instanceof Error ? error.message : String(error),
        });
      },
    );
    return () => {
      active = false;
    };
  }, []);
  return card;
}
