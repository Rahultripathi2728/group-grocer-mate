import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { DebugErrorBoundary } from "./components/DebugErrorOverlay";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("App root element was not found.");
}

createRoot(rootElement).render(
  <DebugErrorBoundary>
    <App />
  </DebugErrorBoundary>
);