# Full-Screen Card Gallery Scrim

## Context

Card-gallery experiences use two geometries with different material needs. A
bounded gallery is a floating object over the quest scene and uses Cumulus's
liquid-glass surface. A gallery that fills the viewport is the screen's focus
layer and uses the standard dark alpha scrim so the scene remains sharp and
quiet behind the cards.

The full-screen experiences in scope are:

- View Deck on desktop.
- View Deck on mobile.
- Starting Deck on mobile.

Starting Deck on desktop is a bounded gallery and remains a floating glass
panel. The purge gallery is also bounded and remains glass.

## Decision

`CardGalleryPanel` derives its material from its existing `frame` contract:

- `floating` uses the liquid-glass recipe and places header accessories on
  glass.
- `fullBleed` uses `--scrim-gallery` as its background, applies no backdrop filter,
  rim, or glass shadow, and places header accessories on media.

This keeps geometry and material coupled without adding a caller-controlled
appearance prop. A full-screen gallery cannot accidentally request glass, and a
bounded gallery cannot accidentally request the scrim treatment.

The mobile `StartingDeckOverlay` relies on its full-bleed `CardGalleryPanel` as
the screen-filling scrim surface. Its overlay wrapper owns positioning,
animation, and dialog semantics. The desktop branch continues to select the
floating frame.

The desktop and mobile deck viewers keep their dedicated full-screen layout and
their shared `DeckViewerBackdrop`. That backdrop and the full-bleed
`CardGalleryPanel` both resolve through the same semantic `--scrim-gallery` token and
apply no backdrop blur.

## Alternatives Considered

An explicit material prop on `CardGalleryPanel` would make the material
independent from frame geometry, but it would add an avoidable design-system
knob and allow visually inconsistent combinations.

A Starting Deck-only wrapper could darken the scene while leaving the
full-bleed panel glass. The panel itself covers the viewport on mobile, so its
backdrop filter would still blur the scene and the requested behavior would not
be achieved.

Changing every `CardGalleryPanel` to use a scrim would also affect bounded
selection surfaces such as purge, where a floating glass object remains the
appropriate material.

## Validation

Component tests assert that a floating gallery retains the glass backdrop and
`onGlass` accessory placement. They also assert that a full-bleed gallery uses
`var(--scrim-gallery)`, emits no `backdrop-filter`, and uses `onMedia` accessory
placement.

Starting Deck tests cover the responsive frame selection: mobile renders the
full-bleed scrim gallery, while desktop renders the floating glass gallery.

Browser QA uses the registered `startingdeck` and `deckviewer` scenes at mobile
and desktop widths. The computed backdrop style must resolve to the scrim color
with `backdrop-filter: none`; cards, title, close action, scrolling, and mobile
press preview must remain usable. The error, rejection, and console-error
buffers must remain empty.
