# Pre-existing issues found by hv-rtga.15

- **Challenger and guardian dialogue is never shown.** `useD97Encounter`
  registers the challenger and guardian interactions to open the encounter
  preview directly, so a battle resident's `dialogueId` is never opened,
  although `startChallenge` is a legal effect for those speakers and the
  conversation adapter handles it. The first dream's five challengers and
  its guardian carry greeting dialogues that wait on this wiring
  (`src/screens/cumulus_adapters/d97/use-d97-encounter.ts`,
  `D97OverworldScreenAdapter.tsx`).
- **An Avatar guardian's look and lines follow its first Avatar.** A
  guardian resident names one character recipe and one dialogue module, but
  fights as the first of its Avatars the player is not playing. When the
  player plays the first Avatar, the fallback Avatar fights while the first
  Avatar's sprite (and, once shown, its dialogue speaker) stands in the door.
- **The LPC `child` body has no idle sheets** for any torso or legs in the
  local generator, so a child recipe resolves to a capsule. Children draw on
  the `teen` body for now.
- **Long scenario runs end with "browser RPC transport rejected".** Two
  `residents` runs for this bead completed their desktop steps (captures
  through the last encounter preview) and then lost the final MCP call;
  each left its browser slot's owner record `call-unconfirmed`
  (`artifacts/qa/.browser-qa.slot-1.lock.owner.json`,
  `artifacts/browser-qa.lock.owner.json`), which needs reconciliation before
  those slots admit another run.
