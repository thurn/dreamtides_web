import { token } from "./tokens";

/** Raised circular core shared by battle moments and radial announcements. */
export const RADIAL_DISC_BACKGROUND =
  `radial-gradient(circle at 38% 28%, ${token("--surface-raised")} 0%, ${token("--surface-card")} 56%, ${token("--bg-sunken")} 100%)`;
