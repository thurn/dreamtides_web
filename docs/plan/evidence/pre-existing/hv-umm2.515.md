# hv-umm2.515 observations

Base inspected: `60ecedf564e05245d771bab38c79fa6da27c46b6`.

The development debug opener overlaps the right edge of the mobile payment
banner's Cancel control in `mobile-deck-top-payment.png` from native QA
invocation `run-Xpbq8J`. Cancel remains operable and the workflow completes
with Caps[]. The opener uses the existing fixed top-right position in
`src/battle/components/EngineDebugPanel.tsx:130`; this file and the prompt
layout are unchanged by this bead. The observation is limited to `debug=1`
and is retained for a bounded debug-layout follow-up. The production deck
pile, deeper-card privacy, and payment state contracts passed.

The earlier mobile baseline art fallback is a local QA scheduling error:
the helper's focused-test asset prepare/restore overlapped the browser load.
The stable native repeat `run-I9O2ty` restores card art and avatar portraits.
It is recorded in measurements and the QA ledger as a repaired local
validation failure, rather than a renderer issue.
