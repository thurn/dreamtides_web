# hv-umm2.359 verification evidence

Final integration base: `d4d4cbcc422ae07d6bae9f56a5a9887fb509f508`. Original validated source: `07b47dfe3fd575d8804c3626de475ee8ddb9f4b2`, based on `75d315c46e4a4c620491b215ab7b9455ca213858`. Initial review report source: `d0f45c`.
The primitive, redaction detector, and log builder match the reviewed source byte for byte before this bead. `negative-manifest.json` retains their SHA256s and the exact test-only source hashes.

## Confirmed negatives and stable contracts

| Failure path | Contract and evidence |
| --- | --- |
| An unknown filtered deck mover shifts another known card's index | `forgets uncertain deck positions after an opaque relocation (…6309)` fails with `i3/index0` before implementation. Both viewers retain other-deck memory and omit ambiguous local ranks after implementation. |
| Known and unknown matching deck movers form one opaque group | Corresponding `…630a` case fails with `i3/index1`. Final positional knowledge is forgotten while the event retains original movement seers. |
| Multiple filtered references reverse the source void | `uses original source-zone order (…630b)` fails with `[i10,i9]` rather than `[i9,i10]`. Source-zone buckets snapshot order before any move. |
| A runtime self reference resolves to a stack card | `skips resolved references still on the stack (subject: false)` fails with a stack-origin `cardsPlaced`. The ineligible reference emits `noLegalTarget`; ordinary resolution continues. |
| A play trigger's subject is still on the stack | Corresponding `subject: true` independently fails with stack-origin placement. The same local restriction applies. |
| A future private look masks an earlier hidden payload | `judges event-local visibility (beforeLook)` inserts an explicitly malformed public payload into the actual look/shuffle event batch. The negative finds one violation rather than both viewers' violations. |
| A prior transient look masks a payload after shuffle | Corresponding `afterShuffle` negative independently fails one instead of two. Ordered observed exposure ends at shuffle. |
| Committed deck tracking masks a payload after shuffle | Corresponding `knownBeforeShuffle` negative independently fails one instead of two. Earlier boundary tracking is invalidated for subsequent hidden deck payloads. |
| Authorized placement ID survives a same-batch shuffle but its log name is absent | `retains event-authorized physical printing and variant through shuffle for player/enemy` independently fails on missing printing/Amplified metadata after actual placement/shuffle and hidden boundary-view guards pass. The final contract also observes `battleLogTurns` calling `nameOf` with the exact UUID/variant for both placement and shuffle, and no callback for opponent-private placement or shuffled-hand UUIDs. `negative-shuffle-log.log` retains two additional viewer failures on the initial placement-only implementation; the real source shuffles both the public void card and a private hand card. |
| Corrupt shuffle visibility metadata | The existing `shuffleInto` mutation contract remains unchanged. Final event-order tracking verifies its payload against earlier actual draw/look/placement exposure; shuffle metadata does not authorize itself. |

The final primitive contract module is 446 lines. Eight primitive/detector negatives and two log negatives are retained in `negative-final-contracts.log` and `negative-final-ui.log` with actual exit 1. The explicit malformed-payload tests verify the detector rather than claiming a legal card emits that payload.

## Positive boundaries and recovery

- Exact unfiltered top-prefix movement retains both viewers' inferable positions. Public void insertion retains both viewers' known cards and indices in the existing real-domain contract.
- Reversed target answers already satisfy source-zone order in the current target resolver; the positive contract records that boundary.
- RD-hv-umm2.63-2 and rules.md authorize the player's ordering within a looked-at destination. The reversed multi-card arrangement is a positive contract.
- The existing failure contract expands to both `knownTo` sets, complete views, deck indices, and fresh JSON pending-slice replay. Its current-base positive reflects prerequisite hv-umm2.353's committed-deck recovery guard.
- The suspended arrangement keeps committed gameplay state fixed. Existing contracts cover foreign, stale, concurrent and illegal answers, non-cancellable resolution prompts, and duplicate post-resolution answers. This bead adds no prompt kind or persistence boundary.
- Existing created/reclaimed card replacements and empty/short deck contracts remain green. Content metadata, resources, and RNG semantics use the existing observable contracts.

## Current visibility semantics

Generic event-redaction identification uses the established before-or-after boundary-state contract. Observed transient draw/look/placement visibility follows event order until shuffle. A shuffle is judged against earlier observed visibility, then invalidates deck tracking. Placement event redaction reads its typed `seenBy` fields. The detector independently authorizes public movement facts (entering void or leaving stack/play/void/banished); hidden movement uses earlier actual observations or boundary knowledge. Metadata under test cannot authorize its own payload or seed the observed cache. The detector does not claim a complete event-time reconstruction for every generic payload.

The UI name fallback serves only redacted `cardsPlaced` and `shuffledIntoDeck` IDs and copies event-authorized physical printing and immutable variant when both boundary views hide it. It has no effective characteristics or fabricated `InstanceView`, and resolves names in the UI through the same UUID/dealt-variant lookup as visible models.

## Checks and browser proof

Updated-base focused: 284 tests in two files. Final related review: 2,330 tests in 157 files. Final full: 2,969 tests in 216 files and a production bundle. Knip passes. Check JSON records separate queue wait, execution, host load, process ID and actual exit. Full and the 300-game fuzz run use the heavy lease and two workers.

Updated-base fuzz: 300 games, 153,879 steps, 2,937 prompts, 301 interactive reruns, zero failures, seed `hv-umm2.359-updated`. The original07b47 run retains its separate300-game/147,070-step proof. Current engine/checker verification comes from the new-base focused/full/fuzz checks rather than a claim that every peer engine byte is unchanged.

The earlier chooser-positive desktop/mobile QA retains unchanged arrangement interaction and reload history; its captures precede the narrow shuffle-name extension. Final opponent captures exercise both name paths. The changed opponent workflow is independently proven by `put-in-deck-opponent-log.result.json`: human boundary knowledge is empty, actual public `i9`/printing `…0003` is named in its placement line, private `i8`/printing `…0002` has a redacted null ID and its exact generic placement row, the authorized shuffle row names `i9`, and canonical reload preserves deck order, printing and rendered history. Both reports have empty caps.

Captures: `put-in-deck-log-arrange-desktop.png`, `put-in-deck-log-desktop.png`, `put-in-deck-log-mobile.png`, `put-in-deck-opponent-log-desktop.png`, `put-in-deck-opponent-log-mobile.png`. Desktop captures are 1440×900; mobile captures are 390×844, the scenario runner's documented CSS scale. The opponent log bounds are desktop `(283,450.39,874,81.72)` and mobile `(12,112.25,366,81.72)`.

Two draft browser failures are retained separately: the prompt-object predicate and the reload route dropping the game query. Each retry follows actual runner exit, provider cleanup and owned-server shutdown. Successful server groups 14910 (chooser), 21633 (earlier placement-only opponent proof), and 60788 (final placement-and-shuffle opponent proof) exited; failed groups 84529 and 6732 exited. The shared provider remains available to peers.


## Native update and mandatory review repair

Candidate `01a12a8b-1993-72b3-b840-bf6a6f30bf0d` terminated with `merge-conflict-with-adopted-base`. Parent native update exited5 and restored clean original07b47; the conflicting presentation test was parked at its captured base while all other12 files stayed byte-identical. Checkpoint `bd9acc250c7d726f45de4a0171d9d061fc8b69eb` was explicitly unvalidated and never a candidate. Parent native update produced checkpoint `a77ce45d38c572c4e5c719ccb640e09054d3c5fd` on final base d4d4. Reapplying only the saved owned block/imports preserves every landed peer test/import; removing those additions reconstructs the peer file byte-for-byte.

Other-family review of07b47 identified placement `seenBy` self-authorization. `rejects placement metadata that widens a private identity (shuffle: false/true)` independently fails0 versus1/2 after valid untouched-batch/private deck/source/seer guards pass. `negative-review-placement-metadata.log` and its manifest retain actual exit1, two failures and1.27 seconds. The repaired checker authorizes typed public movement facts rather than the same `seenBy` field being tested; malformed metadata cannot populate its ordered observed cache. Existing mixed known-mover, private look, public void, and corrupt-shuffle positive/negative boundaries pass.

Retained UI QA is tied to07b47, with exact report-byte SHA256 `e273d959155a462daea05215d8e458dadbbe73ffcbdef184f349a5b512c075a0`. The log model, card model, log overlay, GlassDialog, MobileBattleScreen and putInDeck primitive hashes match that source. The newbase extracts shuffleDeck to a shared helper; its body compares byte-for-byte after removing the ctx.state binding, and the call supplies the same state. No semantic presentation merge occurs. These bounded retained paths justify retaining the original desktop/mobile UI proof; other peer engine changes are covered by current checks.
