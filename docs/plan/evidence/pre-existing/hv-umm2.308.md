# hv-umm2.308 pre-existing issues

Observed at base `1f4706bd59f9f8016c6a5bd4e2146342b8bd9631`.

- The debug-panel Zone first click follows UUID-input blur, which resets
  that input's horizontal scroll from 34 to 0. The Select capture listener
  treats this unrelated scroll as a moving anchor. The deterministic browser
  diagnosis records the event target and closed menu in
  `qa-helpers-diagnose.result.json`. The bounded ancestor-scroll fix is in this
  bead's authorized shared-control area.
- A persisted card-lab reload resumes the battle and engine probe while the
  scene's published `__cardLab` metadata is absent. The diagnosis records
  this state. The runner retains only the exact published observation for an
  unchanged persisted game/request; application state remains in its event log.
- `controls.test.tsx` already contains 536 lines at this base. Its existing
  Select scroll contract gains 12 net lines in the same synthetic module;
  splitting it would add another DOM import cost for this bounded regression.

## Failure and recovery paths

- An application exception during an observation propagates. Synthetic tests
  distinguish real exceptions from destroyed navigation contexts. Host-side
  errors survive replaced documents and fail the sweep verdict and runner.
- A reload during the active async predicate is forced by the browser
  regression. Exact lab metadata and all six staged instances survive; the
  committed battle is compared before and after the saved-game reload.
- Add Card submits one ordinary logged debug intent. Persistence atomicity is
  the existing local-game repository contract; this helper creates no new
  application writes. It does not retry a submission after an uncertain
  outcome, and its timeout tells the caller to inspect committed state.
- Invalid zone/side/UUID input is rejected before UI operations. Stale
  game/request metadata misses the observation cache for every tuple field.
  Unknown catalog cards and rejected zone additions remain bounded waits for
  a committed instance, with the actual debug-intent outcome in the log.
- The helper compares battle identity, state version, and instances before
  submission, then verifies a unique matching new UUID/owner/zone instance
  and a single version advance. Concurrent state changes fail explicitly;
  simultaneous human/QA mutations are outside a judged setup's serialized
  operation and receive no automatic retry.
