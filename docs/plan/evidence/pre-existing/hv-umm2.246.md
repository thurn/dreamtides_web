# Pre-existing observation for hv-umm2.246

R2 invocation `run-K461u6`, log `green-herbs-judged-r2-desktop.jsonl`, event `battle_engine_notice_shown` at log seq 130 records `notice.kind = noLegalTarget` and a display `notice.sourceName` without a source UUID. `src/battle/components/EngineBattleScreen.tsx:384` logs `presentation.notice.notice`; `src/battle/components/presentation-items.ts:460` projects the no-legal-target source into display copy. This diagnostic violates the repository UUID-only logging invariant.

Those existing UI/presentation/logging bodies are read-only outside this bead's two-leaf writer partition. The parent owns deduplication and a bounded diagnostic-identity followup at its next native boundary; this bead makes no runtime repair. This is a display-name diagnostic observation, not an asserted name-keyed map or equality identity bug.

QA caller and diagnostic failures, the R2 optional setup's unknown cause, and the completed source-specific effect judgments are retained separately in this bead's measurements.
