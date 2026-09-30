import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import { loadLocal } from "./lib/storage.js";
import { init } from "./lib/telegram.js";
import { applyTheme } from "./lib/theme.js";
import "./styles.css";

init();
// Before the first render: a frame of the wrong palette is worse than a
// slightly later start, and the stored preference is read synchronously.
applyTheme(loadLocal().theme);

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
