# hv-umm2.667

The development-only public probe in `src/battle/components/EngineDebugPanel.tsx:99` is installed by a React effect and its cleanup deletes the matching probe on every render. A polling observation can occur while it is absent during turn presentation: private QA invocation `run-PghJVU` failed in its expiry predicate after normal pass records v10/v11, with empty Caps and no retained battleEnded record. The bounded private caller returns false for transient absence while the native battle driver retains its result, stall and deadline checks; final physical-state assertions remain strict. This records an observation lifecycle condition, not a product defect or UI repair.

Other private caller mistakes and the initial leaf import correction are retained in the measurement file with failed raw receipts.

Existing `src/battle/components/EngineBattleScreen.tsx:384` writes presentation notices to `battle_engine_notice_shown`, including `notice.sourceName`. All12 final exported games contain one such presentation name field (Advance Gunner or Riftwalker). Mechanical proof correlates printed UUIDs, physical instance IDs, source/controller and exact effect IDs; raw exports are preserved and are not described as wholly nameless. The UI/logging bodies are read-only for this source-only bead; no logging repair is claimed.
