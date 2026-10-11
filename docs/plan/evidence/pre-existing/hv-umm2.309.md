# Native conflict recovery evidence — hv-umm2.309

The workflow recovery guidance and the observed Tollgate rollback boundary
require the same native ownership. The following exact handles demonstrate
the clean source rollback, temporary parking checkpoint, owning-session update,
and combined final source:

| Bead | Terminal conflict candidate | Parking checkpoint | Native update result | Final source |
| --- | --- | --- | --- | --- |
| hv-umm2.54 | 01a1285c-345f-7b72-a191-954d6dea47e6 | 29b452cd0ef248b6016cd2a1344307f5c3a8def5 | ab1868cca8fa9e80720e8129e52370cc70574d33 | a47d6c04e5d4a2131e5ff57ddc540e9a22fbd9f4 |
| hv-umm2.55 | 01a1288d-bac4-7773-8fe2-7121e01397dc | 6acde4145ab42cbdca4fc3ea7dfea5cae029e216 | c04c73e7b37d78ebc4d6262568e49ed403620ee1 | 4e81a680e7eff6ef6f1b312d2a169a6d7ade4b42 |
| hv-umm2.308 | 01a128a7-8bae-7582-a96e-e4f9bec8e7ed | d3cc03555677c24e30f6d6699508ea94c2711c1e | 2a936e6ec18f8ada72dff9b619bd0e18bb142bec | 9086cfeb5b5c049fa505bc18767fd2d45aeb3ed8 |

The conflicting paths are respectively the card primitive test group,
engine catalog, and append-only introspection ledger. Each native update
failure restores a clean original source with no conflict markers. Each
successful update has the then-current staging OID as its parent and a
healthy doctor. The final source retains the owned delta and landed peer
changes. Native Beads notes hold validation, review-range, and promotion
provenance; the parking checkpoints receive no candidate submissions.

The fresh install reports 17 dependency vulnerabilities (9 moderate, 7 high,
1 critical). Dependency upgrades are outside this documentation bead.
