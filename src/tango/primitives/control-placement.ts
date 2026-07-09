// Named placement contexts for translucent Tango controls.
//
// A glass control needs a different material balance when it sits directly on
// scene media than when it sits on an existing glass surface. Call sites name
// that relationship; the component keeps ownership of the concrete recipe.

/** The surface immediately beneath a glass control. */
export type GlassControlPlacement = "onMedia" | "onGlass";
