# hv-umm2.395 measurements

The QA observer recognizes an inline activated target choice only when the
player owns a chooseTargets protocol, the corresponding prompt banner is
rendered with the same prompt ID, and at least one legal candidate is an
enabled, uncovered battlefield button inside a rank. Its actionable candidate
list follows those rendered controls. The source-card stage, gallery, board
and other existing surface arms retain their precedence.

This is development QA observation. It changes no game rules, UI components,
styles, content catalogs, AI policy, production game flow or event logging.
The tracked workflow reuses the existing synthetic prompt-lab-costs fixture
and its discard-to-dissolve activation. No engine fixture or hub edit is
needed.

## Validation

| Check | Exit | Wrapper seconds |
| --- | --- | --- |
| negative-review-corrected | 2 | 6.848 |
| negative-review-settled | 0 | 6.344 |
| negative-knip | 0 | 2.967 |
| focused | 0 | 2.32 |
| review | 0 | 12.26 |
| knip | 0 | 2.618 |
| full | 0 | 61.319 |


Focused: 33 cases in two files. Related review: 57 cases in five files.
Full: 3318 cases in 327 files, Vitest 39.19 s, including the production module
exclusion check. Full ran once under the shared heavy lock. All preparation
and local-asset restoration settled before final browser startup.

Test delta: one Node file, 96 lines, three cases. Public battle.state
contracts cover a visible matching inline choice, non-actionable protocol/
DOM combinations (including hidden, covered, disabled, passive, unranked,
wrong-owner, wrong-banner and wrong-kind choices), and the existing source
play/gallery/board surfaces. The latter use chooseCards for gallery/board.
Tests use synthetic DOM and protocol fixtures, without production catalog
or policy choices, timing thresholds or UI copy assertions.

The initial new scenario typecheck required narrowing the driver's string
candidate against actual minted target IDs and capturing a nullable prompt's
candidate before the callback. These harness corrections settled before
baseline QA. The baseline observer stayed byte-identical to the base commit
until its browser resources were closed and the exact report was archived.

## Frozen negative baseline

Unchanged prelude SHA256:
da9a7674920ac9b1a0fa9bb7c80aa135b199048d80175df5130a925415532d6d.
Baseline scenario SHA256:
13f6e875fc115fdccb893942b7ee3479d4f4e4ce52abfa1da2c53e7797f9ac86.
Preserved report inline-activation-targets.baseline.result.json, SHA256
aa50d58f68b36738b4c9efc7cb58cbdb84f3bc8f64d4460cc62b3c0323ceb7f6.

Both desktop and mobile exposed player chooseTargets prompt 0:1:0 for source
physical i2, printing UUID 5e5e5e5e-0000-4000-8000-000000000139.
The matching visible banner and two legal physical target buttons i16/i17
were asserted; the play-source stage was absent. Each target had a centre
hit and positive geometry (89.5×89.5 desktop, 53.859375×53.859375 mobile).
The unchanged driver reported surface null and answerable false. A direct
normal target tap then moved i16 to the void, demonstrating the actual UI
effect despite the observer's false-negative. The baseline is an expected
negative observation, not a product-effect failure.

Baseline captures: inline-target-baseline-desktop.png and
inline-target-baseline-mobile.png. These show the banner and highlighted
target buttons. The mobile debug opener overlaps part of the Cancel
accessory's right edge, recorded in this bead's pre-existing file.
Hand cards are partially cropped; no settled-hand claim is made.

Baseline wall times: {"browserLeaseWait": 43, "serve": 1262, "scenario": 11360, "total": 12689};
wrapper 17.948 s,
host load 3.0166015625.
Own port 5174 and server group 22359. The context, RPC calls, provider and
SDK transport drained; the owned server stopped, port was free, lease
released and exact owner record absent. A fresh process query found group
22359 absent. Both baseline hashes matched after cleanup before the edit.

## Final normal UI workflow

Final report inline-activation-targets.result.json, SHA256
cc3e24cb771e14993a16171330712f28bc09cefa488c3f856a8e202dbe0b9551.
Both viewports exposed the same initial source i2 and prompt 0:1:0 with
surface target, answerable true and legal candidate IDs i16/i17. Normal
Cancel cleared the prompt/in-flight activation and preserved all five hand
cards, energy and both targets. A fresh activation was answered through the
normal QA driver. Its one discard cost removed physical i5 (hand five to
four), and exactly one dissolved event identified i16, printing
5e5e5e5e-0000-4000-8000-000000000003, at committed intent seq 6/index 6.
The other target stayed in play. These are actual observed engine event
keys, not engine.action log sequence numbers.

The two target-control geometry records retain their positive dimensions,
enemy-back ranks, button roles and centre hits. Cancel was 88.375×42 at
(826.625,20.75) desktop or (269.125,20.75) mobile, inside the viewport with
an actionable centre. This proves the normal cancellation interaction;
it does not claim the whole mobile button is unobscured. Both caps assertions
passed and the report's error-document list is empty.

Final captures: inline-target-final-desktop.png and
inline-target-final-mobile.png. The target controls and banner are visible;
hand cards are partially cropped and presentation may be in motion.

Final wall times: {"browserLeaseWait": 44, "serve": 1254, "scenario": 12889, "total": 14212};
wrapper 19.447 s,
host load 4.41455078125.
Own server process group 40280 on port 5174 was stopped and freshly verified
absent; port was free. Context/RPC/provider/SDK cleanup and browser lease
release completed, with the exact owner record absent. No peer resources
were touched. No executable edit, check or preparation ran during serving.
All three final hashes matched after cleanup:

- scripts/qa/prelude.mjs: SHA256 17ce30c4d689ed4a5bf421bf3687ceea0a5640278ea5b4b0fe810c0e6a4ab3e6
- scripts/qa/prelude-inline-targets.test.mjs: SHA256 42d8eb8a3ca638806b690c41adc5e0c9886a628936acb25b2aafc142993443e6
- scripts/qa/scenarios/inline-activation-targets.mjs: SHA256 599c64027a8aeafa46913da8fec025ea76ec03910c6b3b74ddf8db56c76256f5
