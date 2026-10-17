// Where interacting with a battle resident (a challenger or a guardian) leads
// (decision P17, Appendix B §B5). A resident with a dialogue speaks first,
// beaten or not: its greeting's challenge choice opens the encounter preview,
// and its dialogue's entries branch on `anchorBeaten` for what a beaten
// opponent says. A resident without one opens its preview at once while
// unbeaten, and does nothing once beaten. A challenge never reopens a beaten
// opponent's fight, whichever way it is asked for.
//
// The guardian chokepoint routes the same way: walking toward anything an
// unbeaten guardian closes off walks to the guardian and interacts with it
// (./chokepoint.ts, ./overworld-scene.ts), so a guardian with a dialogue
// speaks before its preview there too, exactly as when the player talks to it.

/** What interacting with a battle resident opens. */
export type BattleResidentRoute = "conversation" | "preview" | "none";

export function routeBattleResident(resident: {
  readonly hasDialogue: boolean;
  readonly beaten: boolean;
}): BattleResidentRoute {
  if (resident.hasDialogue) return "conversation";
  return resident.beaten ? "none" : "preview";
}

/** What a challenge (a dialogue's `startChallenge`) at an opponent opens. */
export function routeChallenge(opponent: { readonly beaten: boolean }): "preview" | "none" {
  return opponent.beaten ? "none" : "preview";
}
