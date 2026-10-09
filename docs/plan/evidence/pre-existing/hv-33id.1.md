# hv-33id.1 pre-existing issues

Seen at staging `2f7ef3f2e` during the tutorial baseline walk
(`docs/plan/evidence/measurements/hv-33id.1.md`).

- **The mobile Purge panel squeezes its header into a narrow column.** At
  390×844 the Purge site's panel header (`HEADER`, 202 px wide) gives the
  "Purge Cards" title and the description a column of about 16 px of text
  width, so the description wraps one word per line. The Decline button sits
  on top of that text. The state is steady: it holds 5 s after load, both on
  the tutorial walk (beat 37, `37-purge-first-visit-mobile.png`) and in a
  fresh `?goto=purge&seed=1` game. Desktop is unaffected.
- **Dreamscape site buttons can ignore pointer clicks after a site exit.**
  After declining the Wilderveil Augury offer, the dreamscape screen element
  (`[data-journey-screen=dreamscape]`) still had `pointer-events: none`.
  Three Playwright pointer clicks on Draft 5x over about 12 s did not open
  the site; a DOM `click()` did. It did not reproduce on every run, and the
  capture scripts use DOM clicks for site buttons.
