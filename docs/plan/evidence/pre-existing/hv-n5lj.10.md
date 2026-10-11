# hv-n5lj.10 issues outside the Phase 4 gate

- **Greedy never repositions, so it never challenges or scores.**
  `src/engine/policy/greedy.ts` orders `pass` first and scores each candidate
  one ply ahead, where a reposition into the front rank changes nothing the
  evaluation reads until the Challenge; the tie keeps `pass`. Every real
  battle of the gate's Greedy journeys ended 10–0 or 25–0 (0 repositions in
  88 AI decisions per pass). Phase 7.2 (hv-fy5h.3) replaces the evaluation
  with one that projects challenge outcomes.
- **A real Apollyon battle went silent once (development build, desktop).**
  The page logged nothing after the enemy's two Day plays and its pass, and
  the QA call's response was lost past 300 s. Three later runs that played
  Apollyon for real did not reproduce it; the gate's journey scenario now
  carries a watchdog that captures the state if it recurs.
- **Performance traces in the shared Playwright MCP Chromium include other
  sessions' pages.** A production page's trace carried `/@vite/client`
  samples and a 173 ms `Commit` from another session's development page on
  the same renderer main thread, so absolute timings taken while another
  session serves a dev page are contaminated. `qa.trace` does not flag
  foreign-script samples.
- **Older QA captures are missing from the primary checkout.**
  `artifacts/qa/` holds only recent bead directories; the Phase 6.0 tutorial
  baseline `artifacts/qa/hv-33id.1/` (84 captures and its walk scripts) that
  `measurements/hv-33id.1.md` references is gone, so 6.1 and 6.2 cannot
  pixel-compare against it.
