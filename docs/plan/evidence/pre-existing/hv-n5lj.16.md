# Pre-existing issues found in hv-n5lj.16

## The name lint guard sees only direct name expressions

- **Where:** `eslint-rules/no-name-keyed-cards.js`.
- **What:** the rule flags a card or Avatar name (`card.name`,
  `avatar.name`, `cardName`, `avatarName`, also case-folded or trimmed)
  used as a lookup key or in an equality comparison. It does not follow
  data flow, so a name copied into a variable with another name
  (`const fullName = avatar.name.toLowerCase(); x === fullName`) still
  passes, and so does a name read from an object whose name says neither
  "card" nor "avatar" (`enemyDescriptor.name`).
- **Fix direction:** a type-aware rule that flags equality and key use of
  any value typed as a display name (for example a branded `DisplayName`
  type on `name` fields) would close the gap; that needs the name fields
  branded first.

## The test pool corpus keys card numbers by card name

- **Where:** `buildTestNameIndex` and `idForName` in
  `src/testing/pool-context.ts`.
- **What:** the synthetic decklist corpus is authored as card names and
  mapped to card numbers through a `Map` keyed by name. The names are unique
  by construction (`Alpha Card 1` ...), so nothing collides today, but it is
  the name-keyed shape AGENTS.md forbids.
- **Fix direction:** author the corpus decklists as synthetic ids and
  derive the display names from them.
