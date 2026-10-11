# hv-umm2.92 observations

## Content inventory probes (hv-umm2.401)

Read-only diagnostic `inventory-probe-diagnostic.json` shows the existing returnCost probe returns false: it expects `cost: "returnToHand"`, while the typed member is `cost: "return"`. The existing banishXCost probe also returns false: it expects a combined numeric/`"x"` count union rather than the current separate union members. Parent filed the bounded inventory repair as hv-umm2.401, serialized after this bead. This bead changes only its authorized banishFromAnyVoidCost probe, which reports true for the typed `banishFromAnyVoid` member and explicit player field. The diagnostic does not mutate generated inventories or the other probe entries.

## Installation advisory

The fresh-worktree install reported 17 dependency advisories (9 moderate, 7 high, 1 critical). Dependency updates are outside this payment-form scope; package and lockfile are unchanged.
