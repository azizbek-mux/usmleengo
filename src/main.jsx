import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { init } from "./lib/telegram.js";
import "./styles.css";

init();

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
