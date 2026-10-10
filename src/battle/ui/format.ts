import type { BattlePhase, BattleSide } from "../types";

export function formatSideLabel(side: BattleSide): string {
  return side === "player" ? "Player" : "Enemy";
}

export function formatPhaseLabel(phase: BattlePhase): string {
  switch (phase) {
    case "dreamwell":
      return "Dreamwell";
    case "draw":
      return "Draw";
    case "dawn":
      return "Dawn";
    case "day":
      return "Day";
    case "dusk":
      return "Dusk";
    case "night":
      return "Night";
    case "challenge":
      return "Challenge";
    case "ending":
      return "Ending";
  }
}
