# hv-umm2.343: stolen own Dissolved browser acceptance

Final Witness `a526fa7b-5cef-4da9-a3f2-27ee0bd9b481` is controlled by its last in-play controller as its own Dissolved ability resolves. The physical card enters its owner’s void and is controlled by its owner there.

The declared lab stages authored Cosmic Puppeteer `4ef8b2e7-3525-4c25-aa30-f751467f182f` and Molten Duel `6044f6da-cf71-4dbb-9feb-f71ae66a4f5b`. Puppeteer pays its immutable 3+X costs with observed X=3; Witness has printed cost3 and spark2, making it a legal target of base Molten Duel’s spark≤3 effect. Human controls and the declared enemy script submit normal logged play and answer intents.

| Viewport | Game | Last controller | Source → owner void | Trigger draw → hand | Full export rows |
| --- | --- | --- | --- | --- | --- |
| Desktop1440×900 | qkmxce | player | i11 → enemy | i3 → player | 54 |
| Desktop1440×900 | b9cssx | enemy | i1 → player | i13 → enemy | 57 |
| Mobile390×844 | w4e5xx | player | i11 → enemy | i3 → player | 54 |
| Mobile390×844 | m6j6vo | enemy | i1 → player | i13 → enemy | 57 |

Physical IDs are scoped to their game. The inverse uses a declared enemy play+Challenge script, actual normal-host X3/target choices, and a legal human Dusk Fast window. A second distinct affordable Molten copy keeps that window available after the first removal. These observations establish the accepted workflow, rather than prescribing future AI choices.

The raw report `judged.result.json` in invocation `run-w1N2xX` retains all four full persisted exports, publications, initial/stolen/final states, plain rendered logs, card-gallery and hit geometry, and exact settled reload comparisons. Standalone `accepted-desktop-forward.jsonl`, `accepted-desktop-inverse.jsonl`, `accepted-mobile-forward.jsonl`, and `accepted-mobile-inverse.jsonl` preserve those exports. Every accepted game has exactly one changed-action draw, for its own trigger’s controller, with source UUID/physical ability0 provenance. The displayed owner void, hand counts and human drawn card agree with committed state. Error buffers are empty.

Representative captures are `desktop-player-stolen.png`, `desktop-player-final.png`, `mobile-player-final.png`, and `desktop-enemy-plain-log.png`. All fourteen retained captures have verified PNG headers and dimensions: desktop2880×1800 and mobile780×1688 at2× density. The parent independently audits all four games and views representative captures.

The standard runner owns native browser slot0, port5174, server process group567 and MCP session `b30383b4-7569-41f9-a6a8-5bd536a6e872` using protocol2025-11-25. The ignored collector retains single raw-byte ownership images and exact process identities. Terminal exit0 confirms standard cleanup; matching owner/server records are absent, every recorded own PID is absent and the recorded port is free. D17’s native browser lease applies without a heavy slot. Browser timing is observational: lease wait7ms, serve3185ms, scenario77979ms, runner total81228ms.

The measurement JSON carries original audit dispatch, parent admission, pre-admission caller corrections, exact hashes, validation timings, source/commit guards and the inclusive automatic-date commit window. Product and test bodies remain byte-identical to the base.
