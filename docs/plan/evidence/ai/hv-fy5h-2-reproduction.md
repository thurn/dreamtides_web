# hv-fy5h.2 reproduction acceptance

The Random-versus-Greedy harness acceptance passed: two complete 200-game
runs on the same frozen pool, seed, iteration budgets and runtime source
produced identical results for all 200 ordinals. Both runs have 115 Random
wins, 85 Greedy wins and zero draws or failed games. This is harness evidence;
policy tuning follows the Phase 5 gate.

- [Baseline report](hv-fy5h-2-random-greedy.md)
- [Same-seed repeat report](hv-fy5h-2-random-greedy-repeat.md)
- Outcomes SHA-256: `5316f8332953d03c7d0b77b7fef3f62c66561a7143e99293c474174a1f8051d2`.
- Pool byte SHA-256: `5d484ac84fe58fd18e40fe32d55ddfad4f548fe1d29e88f8792108074cd2fa48`.
- Runtime source SHA-256: `2487549ff3288e94cb2b4e0f1a1fb0c3f60076bc82c47ac8956c72ea2bac4b4f`.
- Deterministic configuration fingerprint: `d4aaea88653045bec4d8a6e9dda6340d5dc8f7a8549f4baa616cf7eb9a0724e5`.

The comparison checks the scheduled specs, results, final-state hashes,
recorded startup answers, actions and their answers, decision counts, and
all engine logs and policy traces after excluding measured milliseconds.
There were zero mismatched ordinals. Log timestamps, decision time and host
load describe the actual executions and are excluded from gameplay equality.
The final-state SHA-256 wraps the engine's structural `stateHash`.

Both commands ran under the machine-wide heavy lock with two workers and
`JOURNEY_TEST_WORKERS=2`, with no concurrent heavy command owned by this
helper. Each actual worker batch finished within 30 minutes.

| Run | Wrapper start/end (UTC) | Actual worker batch | Wrapper seconds | PID / PG |
| --- | --- | ---: | ---: | --- |
| Baseline | 2026-10-12T20:17:32.966650+00:00 / 2026-10-12T20:27:04.321490+00:00 | 568.804 s | 571.355 | 41862 / 41862 |
| Repeat | 2026-10-12T20:28:01.112749+00:00 / 2026-10-12T20:38:12.728125+00:00 | 564.190 s | 611.611 | 97572 / 97572 |

The repeat wrapper's pre-output interval includes the shared-slot wait and
startup. Reports retain the actual batch host-load and memory samples. A
post-baseline `memory_pressure -Q` reported 65% free; after the repeat it
reported 66% free. These are recorded observations, not thresholds or gates.

The frozen pool contains 56 unique deck identities, eight for each Atlas
layer 0–6, each built through `buildTideOpponentDeck` with the production
catalog, Avatar selection, affiliation context, Dreamsigns and layer
progression. The deliberate regeneration reason and production generator
reconstruction records are retained in ignored tournament generation JSONL.
Its log identifies the dependent `hv-umm2.295` Apollyon-incarnation addition.

The coordinating session independently checked all baseline journal
checksums, scheduled specs, configuration and source-file hashes, and
replayed one serialized game from each layer through `replayGame` without
policy execution. All seven final-state hashes matched and the journal
bytes remained unchanged within that audit. This read-only protocol audit took 2.570 s
according to its own process receipt.

Synthetic CI contracts cover paired seats and first move, UUID input
validation, recorded-answer replay, a genuine same-step mandatory discard
followed by an optional prompt, one-leg interruption/resume equivalence,
worker shutdown/failure, corrupt or partial journals, and lock ownership.
The old mutable-work callback fails the refined synthetic prompt check with
visible hand count 5 versus actual count 4; the snapshot callback passes.
No frozen production outcome is a CI expectation.

Completed CLI resume also passed on the settled baseline: 200 games retained,
zero new games and zero workers. It added lifecycle metadata and refreshed
the report while retaining the outcome digest. The coordinating session's
final read-only audit validated 205 baseline records and 203 repeat records,
all checksums, absent run locks and the unchanged runtime snapshot.
