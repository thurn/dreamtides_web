# hv-7x4l.8 issues outside zones and special mechanics

- **Payable effects keep ceased cards.** `PayableEffect.affects`
  (`src/engine/state/types.ts`, registered by `rules/payable.ts`) keeps the
  instance IDs of cards that later cease to exist, such as a figment under an
  "until the opponent pays N●" change that is dissolved. The view filters the
  list by visibility, so nothing reads a missing instance today, but nothing
  prunes the list either, and the payer can still pay to end an effect whose
  every affected card is gone.
