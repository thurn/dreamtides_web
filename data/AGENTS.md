# RON formatting

Begin each RON file with a one-sentence `//` comment, followed by `#![enable(implicit_some)]`, then either a flat list of entries like `cards.ron` or a named top-level struct like `TransfigurationCatalog` in `transfiguration.ron`.

Comment fields whose purpose is not obvious, especially fields that drive internal algorithms rather than direct UI behavior, and place each field's comment above its first instance in the file.

Keep enum variant names concise within their enum namespace; do not repeat the enum type name in each variant.
