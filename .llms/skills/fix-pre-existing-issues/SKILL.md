---
name: fix-pre-existing-issues
description: Read pre-existing-issues.txt, fix the issues it documents, verify the fixes, and clear the file. Use when the user asks to work through, address, or clean up pre-existing issues. Triggers on pre-existing issues, pre-existing-issues.txt, fix pre-existing issues, clear pre-existing issues.
---

# Fix Pre-Existing Issues

`pre-existing-issues.txt` (repo root) accumulates problems found during earlier
work that were out of scope at the time. Per `AGENTS.md`, contributors append a
description of any pre-existing issue they hit rather than fixing it inline. This
skill drains that backlog: read it, fix each entry, verify, and clear the file.

## Steps

1. **Read** [pre-existing-issues.txt](../../../pre-existing-issues.txt). If it is
   empty or missing, tell the user there is nothing to do and stop.

2. **Parse the entries.** The file is free-form text, usually one block per
   issue with a title, the failing test or symptom, and (often) a suggested fix.
   Treat each block as a separate task.

3. **Fix each issue.** For every entry:
   - Reproduce it first when possible (run the named test, hit the symptom) so
     you know the fix is real and not already resolved on `master`.
   - Apply the smallest correct fix. Follow the suggested fix when it is sound,
     but verify it — suggestions in the file are out-of-scope guesses, not
     vetted solutions.
   - If an issue turns out to be already fixed or no longer reproducible, note
     that and treat it as resolved (it still gets removed from the file).
   - Respect `AGENTS.md`: do not write tests that fail when TOML game-design
     data or default algorithm choices change. Disposable runtime artifacts are
     refreshed by ordinary review commands; tracked bake outputs use the
     specific `npm run bake-*` command named in the entry.

4. **Verify.** Run the diff-aware review from the repository root:

   ```bash
   npm run review
   ```

   Re-run the specific test named in each entry to confirm it now passes. If any
   issue genuinely cannot be fixed, leave only that entry in the file (with an
   updated note) rather than clearing the whole file.

5. **Clear the file.** Once every issue is resolved, empty
   `pre-existing-issues.txt` (write an empty file — keep the file present so the
   `AGENTS.md` workflow still has somewhere to append). If a subset remains
   unresolved, remove only the resolved entries.

6. **Commit and push.** Per `AGENTS.md`, commit with a detailed description of
   each fix and `git push` immediately. Do not print a summary of changes.

## Notes

- Identify cards by UUID, never by name.
- All new behavior should have logging that explains algorithm decisions.
- If fixing one issue surfaces a new, unrelated pre-existing problem, append a
  description of it to `pre-existing-issues.txt` rather than expanding scope.
