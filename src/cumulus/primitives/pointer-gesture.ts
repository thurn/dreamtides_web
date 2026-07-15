/**
 * Pointer travel tolerated before a press becomes movement. Drag gestures and
 * press reveals share this boundary so a card cannot be both revealed and
 * dragged at the same time.
 */
export const POINTER_MOVEMENT_SLOP_PX = 10;

/** Maximum pause between taps that still resolves as one double-tap gesture. */
export const DOUBLE_TAP_WINDOW_MS = 280;

/** Inclusive hold duration after which a touch is a long press, not a tap. */
export const LONG_PRESS_THRESHOLD_MS = 300;
