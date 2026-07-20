import type { CSSProperties } from "react";
import { StatusDot } from "@azula/design-system";

const caption: CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 11,
  color: "var(--content-muted)",
};

function LabeledDot({ label, tone, pulse }: { label: string; tone?: "success" | "warning" | "danger" | "neutral"; pulse?: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <StatusDot tone={tone} pulse={pulse} />
      <span style={caption}>{label}</span>
    </span>
  );
}

export function Tones() {
  return (
    <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
      <LabeledDot tone="success" label="connected" />
      <LabeledDot tone="success" pulse label="live · zuko" />
      <LabeledDot tone="warning" label="relay fallback" />
      <LabeledDot tone="danger" label="disconnected" />
      <LabeledDot tone="neutral" label="idle" />
    </div>
  );
}
