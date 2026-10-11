# hv-2i5z resolution payment review follow-up

Base: `b97f0aba1dc42f82d166ea1cc98e8e7d6a1d5948`. Native claim: 2026-10-11 13:36:07 UTC.
Commit timestamp: 2026-10-11T14:02:56+00:00; native claim-to-commit 1609 s
(26.817 min). This includes semantic research, checks, browser queue and
evidence. The exact commit date is set to this final timestamp immediately
before the commit command.

## Review and rule disposition

Original Claude Opus 5.5 review of hv-umm2.79 source
`98d837a196d83df34d318e25c5ed467ba4302141` against
`c7645d9833bb7f6bd2428334431eff67a1b368e8` is retained as
`review-hv-umm2.79.md` in the root review scratch directory.

Finding 1's neutral-copy issue is addressed by the existing optionalPayment
heading, “Pay the energy cost?”. It describes single/plural/foreign-owned
sources without an ownership or destination claim. Cumulus's first rung uses
the existing prompt host and controls unchanged. No composable payment wrapper
is introduced: one present implementation does not justify future abstraction.

Finding 2's claim that resolution costs, payer and owner destination lack rules
is rejected: Costs while resolving, Zones and Where triggered abilities work
already establish these. The separate eligibility question is clarified by
RD-hv-2i5z-1 after exact D10 research. Rungs 1–3 supply no applicable payment
behavior; the primary MTG analogy has a materially different separate-payment
sentence. Rung 5 selects the narrow combined optional-return reading. Root
accepted the conclusion before final delivery. The existing primitive and its
11 synthetic contracts remain byte-identical to the base; no tests mirror copy.

## Checks and provenance

| Check | Result | Wrapper wall |
| --- | --- | --- |
| Fresh npm install | Completed | npm reported 2 s |
| Focused existing primitive contracts, role surfaces, battle controls | 434 cases, 3 runners | 7.666 s |
| npm run review | 194 cases, 15 runners; lint, both typechecks, cycles | 23.968 s |
| npm run knip | Pass | 3.308 s |
| Human desktop/mobile paid and decline QA | All four cases pass, caps empty | 20.997 s scenario |

Checks used JOURNEY_TEST_WORKERS=2, host load 5.77; QA load
5.186. No local full, fuzz or new tests are warranted by copy and
additive rule documentation. Raw check logs/timing records are in
`/tmp/hv-2i5z-checks/`. Review/knip ran once after final executable copy edit;
the later changes are additive documentation/evidence only.

Final UI file SHA-256: `46e4de9c6a3e77ea4c4a7e0f461404c8ddd81b2df08cb726c99093e839c0f03b`.
Unchanged primitive SHA-256: `5eb5ea5e45737f8b7a0a3e501cb4f38f13f2037cbee497d535607b1ab1dead13`.
QA ran this worktree with the final executable copy; no source/preparation/check
mutation occurred during serving. It adapted only the original79 human scenario
into this bead's own ignored capture directory.

## Browser evidence and closure

`payment.result.json` SHA-256:
`bffaf79f50889cf98036994c86f08adf92b8cbad2a685e6be1937afbbb03ce68`.
`payment.raw.log` SHA-256:
`4cb0bb7d752d13c4a7104a7c9bb869e16f603e00cbc33ccd70474fbf027bb73f`.

Exact runner timing: browser lease 64.320 s, serve 1.254 s, scenario 20.997 s,
total 86.597 s. Outer observer 91.919 s includes runner process startup/cleanup.
No heavy lock held. Strict port 5175, owned server PID/process group 41837.
Runner exit 0 and report ok=true/caps[]; it drained calls, closed its browser
context/provider/SDK transport, cleared its exact lease record, stopped its own
process group and reported the port free. Fresh ps shows no 41837 members;
subsequent owner is peer hv-umm2.81 and is untouched.

In each same-game evidence chain, physical source i2 has printing
4733876a-d6b1-48d2-b322-5f71aee9f3d6, target i11 has printing
5e5e5e5e-0000-4000-8000-000000000002. Both paid/decline cases show the source's
leftPlay/enteredVoid/abandoned/dissolved events. Paid adds exactly one
returnedToHand and energy 2→1; decline adds none and keeps energy 2. The original
selected target returns exactly once in both cases. The actual settled DOM HUD
is 1/2 paid and 2/2 declined. Durable event seq 4/5 are recorded independently;
no engine.action sequence numbers are joined to them. Individual game URLs,
printing maps and durable event records are in the actual report and ledger.

Desktop controls: x1047.625/1147.828125, y597, widths92.203125/92.671875,
height42. Mobile: x189.125/289.328125, y522.828125, same sizes. All centers hit
only the enabled intended button and all bounds fit the 1440×900/390×844
viewports. Banner bounds are desktop 512,4,416,75.5 and
mobile 19.5,4,351,75.5. The heading and source card preview are clear.

Captures (filenames only): `payment-prompt-desktop.png`,
`payment-prompt-mobile.png`, `payment-paid-mobile.png`. The paid mobile frame
shows the return card in motion; it establishes the changed interaction/HUD,
not settled hand-card geometry. Both implementer and root cold-viewed all
three. Dimensions verified. No image or generated materialization is committed.
Mechanical fallout: none. Test delta: zero files/lines/cases/jsdom files.
