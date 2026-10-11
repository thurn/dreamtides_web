# hv-umm2.413 verification

Base: `af246c115b8ca85d86b886b89d81a4bd49de9fa4`.

The synthetic witness has a printed 2-energy card, 2 available energy and a
floating increase of 1. Its authoritative cost is 3 and playing it is illegal.
Eight cases cover both viewers, hidden and ceased sources, and global and
card-specific cost changes. The view retains the complete effect with source
`null`; samples agree on cost and legal actions. Swapping hidden printed UUIDs
preserves the view and seeded sample. Two cases preserve hidden changed-card
and expiry identity boundaries. A deliberately lossy engine reports both the
missing effect and extra legal play through the fidelity oracle.

## Commands

| Scope | Exit | Wall seconds | Starting 1-minute load | PID |
| --- | ---: | ---: | ---: | ---: |
| install | 0 | 2.444981 | 32.607421875 | 24978 |
| baseline | 0 | 4.175930 | 30.79931640625 | 27676 |
| negative | 1 | 3.968668 | 24.7607421875 | 28611 |
| focused | 0 | 3.827256 | 30.6083984375 | 36176 |
| review | 1 | 26.638157 | 32.3388671875 | 37981 |
| review-final | 0 | 22.200862 | 29.251953125 | 43206 |
| knip | 0 | 3.381702 | 32.27490234375 | 44944 |

The unchanged production baseline passed 24 cases. The test-only negative
failed eight cases at sampled cost 2 versus authoritative cost 3; 26 cases
passed, including both privacy controls. Production SHA-256 values were frozen
in scratch negative-production-manifest.json before probing. The final focused
run passed 34 cases. The first review passed both type checks, import cycles and
1,839 related cases across 115 files; a test-call newline failed lint. A cases
declaration corrected that formatting. The final review passed all checks and
the same 1,839 cases. Knip ran sequentially after that success.

The production scope is two visibility predicates and current contract comments:
14 changed non-test lines (7 additions and 7 deletions). The existing test file
gains 66 lines and 10 cases and has 481 lines. The existing anonymous source
fallback, changed-card visibility and expiry visibility supply the applicable
contracts. Focused checks and related review exercise this internal projection;
browser, fuzz and full-suite runs add no distinct risk evidence for this bead.

## Time and resources

Parent dispatch: `2026-10-11T20:25:33.459Z`, recovered from root rollout toolcall
`call_adfe704132b04ba1bb73cd1ceb0779c9` and retained in
`parent413-exact-dispatch.json`. Helper first persistent observation:
`2026-10-11T20:25:50.298381+00:00`. Preparation before parent commit approval:
`2026-10-11T20:30:13.376465+00:00`. These observations are preserved; the final timestamp is recorded
immediately before commit and includes all coordination and approval waiting.

All 35 recorded command and observed descendant PIDs are absent. The
final `lsof` scan finds no worktree-current-directory process beyond the
transient audit commands. No server, browser or provider was started.

Starting three-value host-load samples by command:

- install: `[32.607421875, 19.5048828125, 15.35986328125]`.
- baseline: `[30.79931640625, 20.32763671875, 15.8017578125]`.
- negative: `[24.7607421875, 19.72705078125, 15.7138671875]`.
- focused: `[30.6083984375, 22.1533203125, 16.84423828125]`.
- review: `[32.3388671875, 23.12353515625, 17.31689453125]`.
- review-final: `[29.251953125, 23.56396484375, 17.72265625]`.
- knip: `[32.27490234375, 24.71044921875, 18.3037109375]`.

Canonical friction-record validation exits 0 in 0.103344 s
(PID 53487, starting load 28.2548828125). Its raw samples are
`[28.2548828125, 25.1787109375, 19.0810546875]`. Existing audited historical unknowns are reported.

Final preparation after parent COMMIT ACK: `2026-10-11T20:31:35.824938+00:00`.
Dispatch-to-final-preparation wall time: 6.039432300000 minutes. This window
includes research, coordination, verification and parent approval waiting.
The commit command starts immediately after staging these two temporal files;
its actual start/end and exit are retained in scratch commit.json.
