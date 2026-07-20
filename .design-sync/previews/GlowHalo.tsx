import { GlowHalo } from "@azula/design-system";

export function ShareCode() {
  return (
    <div style={{ maxWidth: 360 }}>
      <GlowHalo>
        <div style={{ textAlign: "center", padding: "8px 0" }}>
          <div
            style={{
              fontFamily: "var(--font-mono, monospace)",
              fontSize: 24,
              fontWeight: 700,
              letterSpacing: "0.06em",
            }}
          >
            k7-fox-ember
          </div>
          <div style={{ marginTop: 8, fontSize: 13, color: "var(--content-muted)" }}>
            share this code — it expires in 10 minutes
          </div>
        </div>
      </GlowHalo>
    </div>
  );
}

export function ActiveInvite() {
  return (
    <div style={{ maxWidth: 360 }}>
      <GlowHalo>
        <div
          style={{
            fontFamily: "var(--font-mono, monospace)",
            fontSize: 13,
            color: "var(--content-muted)",
          }}
        >
          waiting for a peer…
        </div>
        <div
          style={{
            fontFamily: "var(--font-mono, monospace)",
            fontSize: 20,
            fontWeight: 700,
            marginTop: 6,
          }}
        >
          r2-owl-cinder
        </div>
      </GlowHalo>
    </div>
  );
}
