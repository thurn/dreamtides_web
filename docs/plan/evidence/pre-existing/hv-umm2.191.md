# Observations encountered during hv-umm2.191

In vaultbreaker-chooser-mobile.png (run-ZsBaKp), the long activation label extends above/below the existing button border. Full text remains visible inside the panel/viewport; all three controls pass actual hit/geometry and interaction checks. Root viewed the capture; parent-vaultbreaker-visual-state-review.json records this qualification. The unchanged chooser renderer has the same observation recorded in hv-umm2.627.md. No UI repair is included.

Actual native run-ZsBaKp exports (m26ufp and 8tarmr) contain battle_engine_notice_shown seq13 with notice.sourceName and no sourceUUID inside notice. presentation-items.ts:446–453 resolves the name, and EngineBattleScreen.tsx:384–388 logs that notice object. The underlying engine.action/engine.revealed rows retain physical source/cardUUID. This is a pre-existing log-format observation, not a name-key comparison defect.

The same exports and run-vgL8nR exports contain atlas_node_revealed dreamscapeName alongside dreamscapeId (seq10/12/15/18). src/atlas/atlas-generator.ts:962–974 emits the field; prior hv-umm2.184.md and hv-umm2.627.md record it. Exact export hashes are in this bead measurement; no atlas/logging source change or identity-map bug is claimed.

Read-only producer SHA-256: src/battle/components/presentation-items.ts: d47abd92475ffef40047f774dee95096d1d8e16f6506c9ffa42498332662705b; src/battle/components/EngineBattleScreen.tsx: 6e96d5cfa10da65c27f18f63ca2c432b6ba3351241df6a813d72b91319bf703b; src/atlas/atlas-generator.ts: 7c9d2d78a6227ca4382d93d7c4fbe813a19240529bd5aef847a9156096c0088c.
