import { Pill } from "@azula/design-system";

export function Tones() {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <Pill tone="success">◉ direct · 12ms · e2e</Pill>
      <Pill tone="warning">⚠ relay fallback</Pill>
      <Pill tone="danger">✕ disconnected</Pill>
      <Pill tone="accent">ℹ v0.9.1</Pill>
      <Pill tone="neutral">idle</Pill>
    </div>
  );
}
