# hv-umm2.621 validation observation

The second aggregate review timed out after 15000 ms in the existing tournament worker test. Its test and production source are unchanged in this bead. The prior aggregate ran that test successfully; the exact focused test and one unchanged aggregate retry subsequently passed. No timeout, worker setting, configuration, or test assertion was changed for recovery. Resource contention is a hypothesis, not an established cause.

Immutable raw receipts/logs: `receipts/review-v01.json`, `receipts/review-v02.json`, `receipts/tournament-focused-v01.json`, `receipts/review-v03.json` under the bead QA directory. `review-v02-group-settlement.json` qualifies the missing pre-isolated-launch process-group observation; `before-review-v03-groups.json` records settlement before the unchanged aggregate retry.
