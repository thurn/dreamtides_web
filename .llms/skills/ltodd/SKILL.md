---
name: ltodd
description: >-
  Author and revise the Living Tome of Dreamtides Design in the repository's
  top-level ltodd directory. Use only when the user explicitly invokes $ltodd to
  create chapters, propagate a game-design change through every affected
  chapter, or change canonical terminology or models across the book. Never
  invoke this skill implicitly and never edit LToDD without explicit invocation.
---

# Living Tome of Dreamtides Design

The Living Tome of Dreamtides Design, or LToDD, is the canonical,
several-hundred-page book whose primary purpose is to explain Dreamtides'
algorithms: the inputs and rules that select content, resolve outcomes,
transform hidden state, coordinate UI behavior, and produce what the player
sees. Precisely documenting screen presentation or animation choreography is
not LToDD's goal. It records only enough about each screen, interaction, and
outcome to orient the reader, while fully explaining non-obvious UI algorithms.
LToDD also records the game rules and design rationale needed to understand
those algorithms. It supplements hands-on use of the prototype and the Cumulus
component documentation. Together, those resources should let an expert
developer or implementation LLM unfamiliar with the repository reimplement
Dreamtides correctly without reading TypeScript source.

Write the canonical, implementation-grade account of what cannot be learned
reliably by playing the prototype. Preserve the production game's intended
behavior while presenting its rules, algorithms, state, and rationale as a
coherent clean design rather than an account of the current codebase. Give
screens, interactions, and outcomes enough concise coverage to orient the
reader, but leave detailed presentation and ordinary component behavior to the
prototype and Cumulus documentation.

## Load the authoring guidance

Read [references/writing-guide.md](references/writing-guide.md) completely
before researching or editing LToDD.

Read [references/content-patterns.md](references/content-patterns.md) before
creating a chapter, substantially reorganizing one, or publishing a chapter
image. Use its patterns as examples, not templates.

Read [references/source-part-map.md](references/source-part-map.md) when
deciding which part owns a subject or when routing source research across the
book. Treat it as nonbinding discovery guidance: `ltodd/index.md` remains
authoritative, and observed production behavior remains stronger evidence than
source location. Run `scripts/estimate-part-loc.mjs` when a rough comparison of
the parts' current source footprints would help.

When the subject includes a screen or interaction, read the project-local
`.llms/skills/cumulus/SKILL.md` and the references needed to identify every
Cumulus component on the screen and distinguish standard component behavior
from screen-specific UI algorithms. Do not reproduce component APIs. When the
subject includes battle rules, read `docs/battle_rules/battle_rules.md` as a
trusted secondary source.

## Authoring workflow

### 1. Establish the book and requested change

Work only in the top-level `ltodd/` directory. Keep `index.md` and `glossary.md`
at the book root. Place every ordinary chapter exactly one level down at
`ltodd/<part>/<chapter>.md`. Name part directories and chapters with stable
lowercase underscore names.

If the book does not exist when the first chapter is requested, create these
files as part of that authoring request:

- `ltodd/index.md`, containing a short “How to read this book” passage and the
  authoritative chapter catalog grouped into ordered parts;
- `ltodd/glossary.md`, containing the alphabetical canonical terminology
  catalog; and
- the requested part directory and chapter.

Do not create the book merely to install or test this skill.

Treat one invocation as one coherent design change, not as one chapter. Update
every affected chapter, index entry, glossary definition, and cross-reference.
Avoid unrelated editorial cleanup.

### 2. Discover relevant chapters

Read `ltodd/index.md` first. Use its part descriptions and chapter scope
statements to identify candidates. Search the corpus for relevant titles,
opening scope paragraphs, headings, links, user-facing terms, rules, and
duplicated constraints. Fully read every primary or plausibly affected chapter
before editing it.

Do not load the entire book by default. Use the index and search results as
routing metadata, then follow relevant chapter links. After editing, repeat the
corpus search to find stale terms or repeated rules that also need revision.

### 3. Research the design

Resolve facts in this order:

1. Play the relevant production game flow locally to establish the screen,
   interaction, outcome, and terminology that readers can observe themselves.
2. Inspect production data and code for hidden rules, ordering, state, exact
   gameplay behavior, and non-obvious UI algorithms.
3. Inspect `logs/journey-log.jsonl` when reconstructing an algorithmic decision
   from a production game is useful.
4. Treat existing LToDD chapters as canonical except where the requested change
   revises them.
5. Use `docs/battle_rules/battle_rules.md` as a trusted secondary source for
   battle.
6. Treat every other Markdown document as a lead that requires verification.
7. Ask the user to resolve contradictions, design intent, or rationale that the
   artifacts cannot establish.

Use production routes and player behavior as research evidence. Research the
observable flow so the book can supplement it rather than transcribe it. Do not
turn debug entry points, test fixtures, editor tools, or source organization
into book content.

### 4. Interview before writing

Complete the discoverable research first. Then ask one batch of three to five
intent-dependent questions before writing. Prefer questions about:

- the intended player experience or design objective;
- which behavior is canonical when evidence conflicts;
- the rationale or tradeoff behind a consequential decision;
- edge cases that materially change the design; and
- clean terminology or modeling choices required for a rewrite.

Include the evidence behind each question and a recommended answer. Ask fewer
questions, or none, when a small change is already fully specified. Never ask
for facts that the running game, data, code, logs, or existing LToDD can answer.

After the user answers, state a compact writing plan and proceed. Pause again
only when a material choice remains unresolved.

### 5. Write the canonical design

Preserve exact intended behavior while replacing incidental source structure
with a clean, internally coherent model. Use user-facing terminology. Define a
new implementation-neutral term only when the UI provides none and the concept
is necessary to explain the design.

Write around decisions and keep each decision beside its rationale and
consequences. Specify algorithms as exact, implementation-neutral contracts at
a high level: identify their inputs, outputs, ordering, formulas, constants,
invariants, edge cases, and rationale when those details are consequential. Do
not translate them into pseudocode or recite current source structure.

Treat the prototype and Cumulus documentation as companion references:

- Give every meaningful screen or screen family one or two sentences that
  explain its role, interaction, and handoff.
- Briefly name every Cumulus component visible on the screen, then delegate its
  standard appearance, behavior, and API to Cumulus documentation.
- Give every distinct player choice or outcome a short description of its
  semantic result and durable consequences; one sentence is usually enough.
- State the governing animation and choreography philosophy once near the start
  of the relevant flow. Do not provide shot-by-shot animation, timing, easing,
  or routine transition specifications.
- Fully explain non-obvious UI algorithms, including their decision rules and
  rationale. Safe-area avoidance, responsive selection, object positioning,
  reveal coordination, collision handling, priority, and interruption policy
  are in scope when applicable.

Exclude normal React component behavior and details that a reader can learn by
using the prototype or consulting a Cumulus component API. Include concise
screen and outcome coverage even when the observable behavior needs no deeper
explanation.

Do not leave TODOs, alternatives, uncertainty, speculative explanations, or
image placeholders in a chapter.

If a chapter approaches the 500-line limit, remove bloat first. Split it only
when its genuine subject contains multiple coherent scopes. Update the index and
every affected link in the same change.

### 6. Capture and publish prototype images

Capture live prototype evidence while the relevant state is available during
research. Publish a representative image when it materially helps the reader
recognize a screen, flow, spatial relationship, or non-obvious UI algorithm.
Use images selectively; do not capture every outcome, transient state,
responsive branch, or animation key moment. The prototype remains the detailed
visual reference.

Follow `docs/journey_prototype/qa_tooling.md` to start the prototype on a
non-default port and manage an isolated `agent-browser` session. Reach the
canonical state through the normal player workflow. A registered `?goto=` scene
may stage a difficult state, but the captured frame must contain only canonical
player-facing presentation. Exclude debug controls, annotations, browser chrome,
pointer highlights, and authoring tools.

Before each capture:

1. Set the intended desktop or narrow viewport at 2x device scale.
2. Assert `location.href`, `window.innerWidth`, and the visible game state.
3. Confirm `window.__caps` exists and contains no render errors, unhandled
   rejections, or console errors.
4. Capture the full viewport or a deliberately selected game region to a PNG or
   JPEG outside the repository, such as `/tmp/ltodd-<subject>.png`.
5. Check the pixel dimensions with `file`, inspect the image visually, and
   recapture it if important content is clipped, obscured, illegible, or in an
   unintended transient state.

A representative desktop capture uses these commands after the state is staged:

```bash
/opt/homebrew/bin/agent-browser --session ltodd-<subject> \
  set viewport 1440 900 2
/opt/homebrew/bin/agent-browser --session ltodd-<subject> \
  eval '({url: location.href, width: innerWidth, errors: window.__caps})'
/opt/homebrew/bin/agent-browser --session ltodd-<subject> \
  screenshot /tmp/ltodd-<subject>.png
file /tmp/ltodd-<subject>.png
```

Use `npx agent-browser` when the Homebrew binary is unavailable. Use a unique
session name for each authoring run and close that exact session after capture.

Publish the inspected image with the helper from the repository root:

```bash
npm run publish-ltodd-image -- \
  --file /tmp/ltodd-destination-choice.png \
  --part sites --chapter site_arrival --slug destination-choice \
  --alt "One destination awaiting the player's choice" \
  --caption "The available destination holds visual focus before commitment."
```

The helper validates the image, gives its bytes a content-addressed name under
`ltodd/<part>/<chapter>/`, uploads it to the project's public Google Cloud
Storage bucket with immutable caching, verifies the public response, and prints
reference-style Markdown. Paste that Markdown beside the prose it supports.
Keep the generated URL reference in the same chapter. Never add the local image
binary to Git, overwrite a published object, invent a URL, or use `--dry-run`
output in the book.

If `gcloud` cannot access the bucket, run `gcloud auth login` and select the
`redacted-firebase-project` project. If a suitable canonical state cannot be
captured, omit the image and report the blocker rather than leaving a
placeholder. Close the isolated browser session and stop only the development
server started for the capture after the needed images are published.

### 7. Format and validate

Run the formatter, then the checker from the repository root:

```bash
node .llms/skills/ltodd/scripts/format-markdown.mjs --write
node .llms/skills/ltodd/scripts/format-markdown.mjs --check
```

Resolve every error. Inspect and resolve every implementation-leakage warning;
do not ignore warnings merely because they are non-fatal. Review the formatted
diff for factual accuracy, local completeness, information density, link
quality, and accidental changes outside the requested design.

Finish only when the affected rules and algorithms are consistent across the
corpus, concise screen and outcome coverage is present, the index and glossary
are current, every included image is live and useful, no material question
remains, and the checker passes.
