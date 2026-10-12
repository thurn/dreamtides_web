# Seeded determinization continuation and unknown loop recordings

The broad determinization sampling test resumes states generated from the
synthetic fuzz pool. Its selected samples change when that pool gains a
fixture. With the deck-bottom Prevent fixture, random continuation reaches
an offered loop whose determinized recording is unknown and attempts to
repeat it. The engine deliberately raises `UnknownLoopRecording` for that
public unsupported exploration boundary (`src/engine/loops/replay.ts` and
`src/engine/view/determinize.ts`). The dedicated known/unknown loop contracts
in `src/engine/view/determinize-loops.test.ts` assert this behavior.

The first final focused run had 1 failure and 1,984 passing cases across
8 files. A bounded baseline witness restored exactly the four changed
engine/fixture source files from `d82b1404246632762c0619150b56f1f997d08c57`
and ran only `src/engine/view/determinize.test.ts`: 38 cases passed. The
witness restored all four task-source files in `finally`; their before and
after SHA-256 values match in the measurement JSON and retained raw receipt.

The parent admitted the exact owning-test path before its bounded repair.
The sampling continuation stops at an offer only when the loop owner's own
public view lacks its recording. An opponent's hidden view of a recording
that its owner knows permits continuation. The existing legal-state,
decision, progression and invariant assertions, and the dedicated loop
contracts, remain in place. Production loop, view and fuzz logic retain
their current contracts.
