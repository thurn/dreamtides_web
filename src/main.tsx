import { createRoot } from "react-dom/client";
import "./vendor/boxicons/boxicons.css";
import "./vendor/boxicons/boxicons-filled.css";
import "./vendor/boxicons/boxicons-logos.css";
// Font Awesome solid glyphs. The Dream Atlas leans on Boxicons 3 for site
// iconography, but a few marks (the Transfiguration hammer, the starter flag,
// the boss skull, completion checks) come from Font Awesome where Boxicons has
// no matching glyph. Self-hosted via the bundled package, not a CDN.
import "@fortawesome/fontawesome-free/css/all.min.css";
import "./index.css";
// Cumulus design tokens ship on every entry so named components and the root
// entity-reveal coordinator resolve the same semantic surface vocabulary.
import "./cumulus/primitives/cumulus-tokens.css";
import "./cumulus/primitives/legibility.css";
import { applyDeviceFrameFromSearch } from "./runtime/device-frame";
import { renderRootRoute } from "./root-router";

// Screenshot mock-ups load the app in an iframe with no physical display
// cutout, so `env(safe-area-inset-*)` reads 0. When the device-screenshot tool
// injects a `deviceFrame` param, republish its simulated insets + cutout box as
// CSS custom properties before first paint (a no-op on real hardware). Runs for
// every route, since any screen can be captured.
applyDeviceFrameFromSearch(window.location.search);

const root = createRoot(document.getElementById("root")!);
await renderRootRoute(root);
