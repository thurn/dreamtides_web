# hv-n5lj.60 measurements (bounded presentation snapshots, shared fold memo)

Base `2bb44cdd5` (A) against this bead's change (B).

## perf:ab (engine workloads)

`npm run perf:ab -- 2bb44cdd5 --workload fuzz,bench --rounds 5`, under the
heavy slot, 1-minute load 3.8–8.9 during the rounds. Neither workload folds
through the presentation feed; they show the lazy event snapshot in
`StepContext.emit` costs nothing when no observer is set.

```text
fuzz summary (5 rounds each):
  A CPU  median 13.89 s (13.82–13.94, spread 0.9%)
  B CPU  median 13.88 s (13.72–13.90, spread 1.3%)
  A wall median 12.00 s (11.93–12.06, spread 1.1%)
  B wall median 11.96 s (11.86–12.01, spread 1.2%)
  A load median 5.84, B load median 5.29
  B vs A: wall -0.3%, CPU -0.1%

bench summary (5 rounds each):
  A CPU  median 5.80 s (5.74–5.88, spread 2.3%)
  B CPU  median 5.79 s (5.72–5.81, spread 1.6%)
  A wall median 4.54 s (4.51–4.59, spread 1.7%)
  B wall median 4.53 s (4.48–4.54, spread 1.3%)
  A load median 4.03, B load median 4.07
  B vs A: wall -0.2%, CPU -0.2%
```

Both sides' 50-game fuzz rounds report the same 25548 steps, 436 prompts,
results, and 0 failures. `npm run fuzz:engine -- --games 200` on B: 104737
steps, 1819 prompts, 0 failures.

## A long repeatLoop batch

One `repeatLoop` of 2000 iterations of `LOOP.bouncer` (synthetic loop
fixture; 16002 published events, about 8 per iteration), folded by the
shared reducer adapter, then read by the presentation feed. Five rounds per
side in one vitest process, host load 5.3 (B) and 6.3 (A). Clones count
`cloneState` calls; contexts count step contexts (step runs and
feasibility searches). A scratch harness, not committed, made the counts;
at A it read the feed through `presentationAdapterFor`.

| | A (base) | B (this bead) |
| --- | --- | --- |
| Reducer fold CPU, median | 745 ms | 737 ms |
| Feed read CPU, median | 2196 ms | 3 ms |
| Reducer plus feed CPU, median | 2938 ms | 739 ms |
| Reducer clones (an unobserved fold makes 12002) | 12002 | 12066 |
| Feed clones | 28004 (12002 re-run, 16002 snapshots) | 0 |
| Feed step contexts | 12002 | 0 |
| State snapshots retained for the batch | 16002 | 64 |

B's reducer takes the 64 copies (`maxObservedEventStates`) at the first 64
presented events; its other observed events share one of those or the
batch's starting state, and the 15873 events after the limit have none.
The feed's read hits the shared adapter's memoized runs and legality memo,
so it runs no step or search. The committed test
`copies at most its limit of presented states in a long repeatLoop batch`
(`src/engine/fold/fold.test.ts`) asserts the bound on a synthetic limit, and
`reads each applied intent's observed states without running a step or
search again` (`src/battle/components/battle-presentation.test.tsx`) asserts
the feed's zero step contexts.

## Presented-only snapshots against snapshots at every event

40 seeded synthetic fuzz games (`SYNTHETIC_FUZZ_POOL`) replayed through
three adapters: one observing every event (A's states), one observing
presented kinds with no limit, and `PRESENTATION_OBSERVATION`. The items for
both sides were compared batch by batch.

- 6973 batches, 28594 events, 9517 presented (33%), so the reducer copies a
  third of the states the base feed copied.
- Presented events per batch: at most 13; none reached the limit of 64.
- Items identical in 6971 batches. In 2, a card that left the stack before
  an unpresented event (`abilityResolved`) settles into its void at the next
  presented event's list order instead of that event's, for the items
  between its announcement and that event.
