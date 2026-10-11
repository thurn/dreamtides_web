# hv-umm2.72 pre-existing observations

`npm install` at base `d4d4cbcc422ae07d6bae9f56a5a9887fb509f508`
reported 17 dependency audit findings: 9 moderate, 7 high and 1 critical.
Dependency updates are outside this content bead's areas.

The QA event helper accepts `{ match, limit }` as its second argument. An
incorrect top-level filter object is silently accepted with an empty match,
so an observation can include unrelated events. Parent-filed `hv-ojiu`
validates the helper arguments under the existing QA contracts. This bead
uses the documented nested match and preserves its failed observations.

The development debug opener overlaps the mobile battle-log close button at
(347, 44), as the native hit test confirms. This is the debug-only overlap
recorded in `hv-umm2.313` and `hv-umm2.114`. Scoring and the loss log are
observable; this bead navigates to each next declared fixture after recording
it. Root-filed `hv-31uz` owns the opener/overlay hit-geometry repair.
