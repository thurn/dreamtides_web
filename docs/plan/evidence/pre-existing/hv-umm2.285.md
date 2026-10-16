# hv-umm2.285 pre-existing observations

Source epoch: fbe58551464bd7aa3c6fb6841863ea9ec0b64586.

- `src/data/journey-content.ts:134` describes `RunPoolContext` as holding a card-name to card-number index, and its provenance comment at line295 refers to a name index. The declared `idIndex` at line150 is `ReadonlyMap<CardId, number>`; the adjacent identity documentation correctly specifies stable UUIDs, and `buildAvatarTides4Provenance` resolves branded card IDs with `ctx.idIndex.get`. These two comments misdescribe the current UUID index. This is a documentation observation; no name-key behavior defect is inferred. Source remains unchanged in this evidence-only bead.

The failed first producer caller imported a browser-bound QA module under ordinary Node. Its retained import failure belongs to the execution measurements and is not classified as a product defect.
