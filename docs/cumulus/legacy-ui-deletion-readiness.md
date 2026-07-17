# Legacy UI Deletion Readiness

Audited July 16, 2026 at `9bdde28c4`. **Verdict: not ready.** Two ordinary
player states can block forward progress on the Cumulus path.

1. [ ] **Blocker — resolve Dreamsign Reward at the collection cap.** The inline
   Cumulus reward submits `acceptRewardSite(siteId)` without a replacement slot
   (`DreamscapeScreenAdapter.tsx:94-107`), while the quest reducer rejects a
   Dreamsign reward at `maxDreamsigns` without `purgeIndex`
   (`rules/quest/sites.ts:360-397`). The Reward stays unvisited and the guardian
   Battle stays locked. Add a replacement or decline path and cover the at-cap
   flow; the legacy picker is the behavior reference (`RewardSiteScreen.tsx:59-150`).
2. [ ] **Blocker — make authoritative Foresee dismissible with an empty deck.**
   Skypath (`f9b479cf-02cb-40e1-bb64-70b29977bf15`) can open a Foresee prompt
   when Fatigue has emptied the deck. Cumulus disables its only action for zero
   cards and supplies no close action (`BattleForeseeOverlay.tsx:193-308`), while
   the pending prompt rejects every unrelated battle intent (`rules/reducer.ts:73-84`).
   Permit a zero-card resolution and add a regression test.
3. [x] **Ordinary gameplay routes have Cumulus coverage.** Every non-site
   `Screen` variant is registered; every `SiteType` is registered, handled by
   the Cumulus Battle route, or intentionally collected inline on Dreamscape.
   Focused routing, site, prompt, and result tests pass, and desktop/mobile
   browser smoke checks reached Draft and advanced Battle phase with empty error
   buffers.
4. [ ] **Choose compatibility for rooms and saves paused on legacy Essence or
   Reward screens.** Cumulus collects these sites inline, but legacy sessions can
   persist `screen.type === "site"` for them. Migrate those states back to
   Dreamscape or explicitly declare old in-flight sessions unsupported before
   deleting the fallback screens.
5. [ ] **Confirm the remaining player-facing omissions as intentional
   simplifications.** These are informational rather than progress gates: the
   standalone Glossary modal (contextual term reveals remain), visible Battle
   turn/phase labels, in-battle Dreamcaller/Dreamsign inspection, victory-board
   inspection, and the Quest Complete inline final-deck expander (View Deck
   remains available).
6. [x] **Retain debug/operator surfaces as scoped exceptions.** Pool and package
   inspection, quest editing, Battle Inspector, logs/history, Figment creation,
   card notes/context actions, and manual zone tools do not gate ordinary play
   and can keep their current implementations.
7. [ ] **Define whether “exclusive Cumulus” includes application shell states.**
   Room creation/joining, compatibility/configuration failures, and app
   loading/error screens sit outside the gameplay design-system tier. Either
   exempt that shell explicitly or migrate it before making a literal all-UI
   claim.
8. [ ] **Delete the selection and fallback plumbing after the gates above.**
   Remove `?ui=legacy`, legacy router and Battle branches, legacy HUD fallback,
   and unused imports/files; replace fallback-oriented registry tests with an
   exhaustive assertion that every gameplay type has a Cumulus disposition.
   Update or archive the superseded parity documents, including the currently
   over-broad completion claim in `dreamwell-prompt-remaining-work.md`.
