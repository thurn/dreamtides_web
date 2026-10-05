import { useMemo } from "react";
import {
  loadTutorialCards,
  type TutorialCards,
} from "../data/tutorial-cards";

/** The UUID-backed cards used by the standalone tutorial battle. */
export function useTutorialCards(): TutorialCards {
  return useMemo(loadTutorialCards, []);
}
