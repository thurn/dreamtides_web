# Pre-existing issues found in hv-n5lj.4

## The production build crashes at load

- **Where:** the engine primitives (`src/engine/effects/primitives/`), at
  staging `102db8bfd`.
- **What:** `vite build` succeeds, but the bundle throws
  `ReferenceError: Cannot access 'sparkModifierPrimitive' before
  initialization` when the page loads, so a production build never leaves
  the loading screen. The base commit's own build fails the same way. It
  looks like a circular import among the primitive modules that the dev
  server's per-module loading hides.
- **Fix direction:** break the cycle (or register the primitive lazily) and
  add a production-bundle load smoke.

## The enemy Avatar lookup falls back to matching names

- **Where:** `findEnemySourceAvatar` in
  `src/battle/components/enemy-avatar-summary.ts` (moved unchanged from
  `PlayableBattleScreen.tsx`).
- **What:** when the enemy descriptor's id does not name a content Avatar, the
  Avatar is found by comparing lower-cased names, which are not identities.
- **Fix direction:** resolve the Avatar by its UUID only, and treat a missing
  one as an error the battle init reports.
