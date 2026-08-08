import React from "react";
import ReactDOM from "react-dom/client";
import { CumulusRoot } from "../../src/cumulus/CumulusRoot";
import "../../src/index.css";
import "../../src/vendor/boxicons/boxicons.css";
import "../../src/vendor/boxicons/boxicons-filled.css";
import "@fortawesome/fontawesome-free/css/all.min.css";
import "../../src/cumulus/primitives/cumulus-base.css";
import "../../src/cumulus/primitives/cumulus-tokens.css";
import "../../src/cumulus/primitives/legibility.css";
import "../../src/cumulus/assets/phosphor.css";
import "./styles.css";
import { App } from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><CumulusRoot><App /></CumulusRoot></React.StrictMode>);
