import type { BattlePhase, BattleResult, BattleSide, BattleZoneId, BrowseableZone } from "../types";

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

export function formatResultLabel(result: BattleResult | null): string {
  if (result === null) {
    return "In Progress";
  }
  switch (result) {
    case "victory":
      return "Victory";
    case "defeat":
      return "Defeat";
    case "draw":
      return "Draw";
  }
}

export function formatZoneLabel(zone: BattleZoneId): string {
  switch (zone) {
    case "deck":
      return "Deck";
    case "hand":
      return "Hand";
    case "void":
      return "Void";
    case "banished":
      return "Banished";
    case "backRank":
      return "Back Rank";
    case "frontRank":
      return "Front Rank";
  }
}

export function formatBrowseableZoneLabel(zone: BrowseableZone): string {
  return formatZoneLabel(zone);
}
