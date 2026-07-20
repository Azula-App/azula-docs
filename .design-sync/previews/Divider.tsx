import { Divider } from "@azula/design-system";

export function Horizontal() {
  return (
    <div style={{ maxWidth: 440, display: "flex", flexDirection: "column", gap: 14 }}>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: "var(--content-muted)" }}>
        Sessions are end-to-end encrypted between your devices.
      </p>
      <Divider />
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: "var(--content-muted)" }}>
        When a direct path fails, traffic falls back to the nearest relay.
      </p>
    </div>
  );
}

export function Vertical() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        fontFamily: "var(--font-mono, monospace)",
        fontSize: 12,
        color: "var(--content-muted)",
      }}
    >
      <span>direct</span>
      <Divider axis="vertical" />
      <span>12ms</span>
      <Divider axis="vertical" />
      <span>e2e</span>
    </div>
  );
}
