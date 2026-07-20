import { Avatar } from "@azula/design-system";

export function Sizes() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <Avatar name="zuko" size={24} />
      <Avatar name="mai" size={40} />
      <Avatar name="ty lee" size={64} />
    </div>
  );
}

export function PeerRow() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <Avatar name="zuko" />
      <div>
        <div style={{ fontWeight: 600 }}>zuko</div>
        <div style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 12, color: "var(--content-muted)" }}>
          direct · 12ms · e2e
        </div>
      </div>
    </div>
  );
}
