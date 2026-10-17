# Pre-existing issues found in hv-rtga.26

- **Glass buttons are 42px tall, 2px under `--touch-min`.** `GlassButton`'s
  standard and compact sizes are 42px tall on every Cumulus surface, so
  every D97 action button (the HUD's Deck, Quests and Menu, dialogue
  choices, Abandon, Resume, Fight, Not now, Done, Sell Cards) measures
  42px on a 390×844 phone. The size is shared with the journey, which must
  render unchanged here; raising the standard height to 44px, or adding a
  touch size, belongs to a Cumulus-wide change.
- **Hover on glass buttons is a 3% scale and nothing else.** Every
  `Pressable` enlarges on a fine-pointer hover by a size-proportional factor
  clamped to 1.01–1.03 (`src/cumulus/primitives/press-feedback.ts`); a
  HUD button measures `scale(1.03)` while hovered, with no change to its
  glass fill, rim or text. On a 42px pill that reads as no change. A
  hover treatment for the glass material (a brighter rim or sheen) is a
  Cumulus-wide decision shared with the journey.
- **Card panels centre their header action on the title block, not the
  title.** `GlassPanel` centres a trailing accessory against its whole
  header copy, so a card panel with an instruction subtitle (the deck
  editor, the sell panel and the phone shop) sits its Done or close disc
  between the title and the subtitle: 12px below the title's centre with
  one subtitle line, more as it wraps. Title-only panels align exactly.
- **On phones the card panels take the full-bleed gallery frame.**
  `CardBrowserPanel` and `CardPickerPanel` in their overlay presentation
  switch to `GlassPanel`'s full-bleed frame below the desktop breakpoint,
  whose fill is the 80% black `--scrim-gallery` with no blur, not the
  liquid glass of the popup panels. D97's deck editor, shop and sell panel inherit it; a
  floating phone frame for card overlays is a shared-component change.
