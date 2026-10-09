# hv-7x4l.39 pre-existing issues

- **C15 and rules § Objective treat Terminus as a card in play.** Decision
  C15 (`docs/plan/decisions.md`) says card
  `6e2188f8-580e-4a66-a3e3-267d509de903` is checked by the state-based
  victory check "while the card is in play", and `docs/rules.md` § Objective
  gives its text as the example of "a card in play that says 'you win the
  game'". The card is an Event (`src/content/cards/terminus-6e2188f8.ts`),
  so it is never in play: under a literal reading it would never win. The
  engine offers both forms. `winCondition(condition)` covers the text on a
  card in play or an emblem. `p.winTheGame()` covers a resolving effect:
  Terminus reads `event(p.ifThen(noCardsIn("deck"), p.winTheGame()))`, which
  checks the condition as the event resolves and lets that step's victory
  check apply the win, so the opponent reaching the threshold in the same
  check still draws. A rules decision should confirm the resolving reading
  for an event, and the rules example should say so, before Phase 5 authors
  Terminus.
