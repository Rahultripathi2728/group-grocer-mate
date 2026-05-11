import { Component, ReactNode, useEffect, useState } from "react";

type ErrEntry = { id: number; type: string; message: string; stack?: string; time: string };

let listeners: ((e: ErrEntry) => void)[] = [];
let counter = 0;
const pushError = (type: string, message: string, stack?: string) => {
  const entry: ErrEntry = {
    id: ++counter,
    type,
    message: String(message ?? "Unknown error"),
    stack,
    time: new Date().toLocaleTimeString(),
  };
  listeners.forEach((l) => l(entry));
};

if (typeof window !== "undefined" && !(window as any).__debugOverlayInstalled) {
  (window as any).__debugOverlayInstalled = true;
  window.addEventListener("error", (e) => {
    pushError("error", e.message || String(e.error), e.error?.stack);
  });
  window.addEventListener("unhandledrejection", (e: PromiseRejectionEvent) => {
    const reason: any = e.reason;
    pushError("unhandledrejection", reason?.message || String(reason), reason?.stack);
  });
}

export function DebugErrorOverlay() {
  const [errors, setErrors] = useState<ErrEntry[]>([]);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const l = (e: ErrEntry) => setErrors((prev) => [...prev, e].slice(-20));
    listeners.push(l);
    return () => {
      listeners = listeners.filter((x) => x !== l);
    };
  }, []);

  if (errors.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 2147483647,
        maxHeight: "50vh",
        overflow: "auto",
        background: "rgba(127,29,29,0.97)",
        color: "#fff",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 12,
        padding: 12,
        borderTop: "2px solid #f87171",
        boxShadow: "0 -4px 12px rgba(0,0,0,0.4)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <strong>⚠️ Debug Overlay — {errors.length} error{errors.length > 1 ? "s" : ""}</strong>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setOpen((o) => !o)}
            style={{ background: "transparent", color: "#fff", border: "1px solid #fff", padding: "2px 8px", cursor: "pointer", borderRadius: 4 }}
          >
            {open ? "Hide" : "Show"}
          </button>
          <button
            onClick={() => setErrors([])}
            style={{ background: "transparent", color: "#fff", border: "1px solid #fff", padding: "2px 8px", cursor: "pointer", borderRadius: 4 }}
          >
            Clear
          </button>
        </div>
      </div>
      {open &&
        errors.map((e) => (
          <div key={e.id} style={{ borderTop: "1px solid rgba(255,255,255,0.2)", padding: "6px 0" }}>
            <div style={{ opacity: 0.8 }}>
              [{e.time}] {e.type}
            </div>
            <div style={{ fontWeight: 600 }}>{e.message}</div>
            {e.stack && (
              <pre style={{ whiteSpace: "pre-wrap", margin: "4px 0 0", opacity: 0.85 }}>{e.stack}</pre>
            )}
          </div>
        ))}
    </div>
  );
}

interface BoundaryProps {
  children: ReactNode;
}
interface BoundaryState {
  hasError: boolean;
  error?: Error;
}

export class DebugErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { hasError: false };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    pushError("react", error.message, error.stack + "\n\nComponent stack:" + info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, fontFamily: "ui-monospace, monospace", color: "#fff", background: "#171717", minHeight: "100vh" }}>
          <h2 style={{ color: "#f87171" }}>App crashed</h2>
          <p>{this.state.error?.message}</p>
          <p style={{ opacity: 0.7, fontSize: 12 }}>See debug overlay below for details.</p>
          <DebugErrorOverlay />
        </div>
      );
    }
    return (
      <>
        {this.props.children}
        <DebugErrorOverlay />
      </>
    );
  }
}