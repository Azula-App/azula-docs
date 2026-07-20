import { BrandLockup, Screen } from "@azula/design-system";

export function AppGround() {
  return (
    <Screen style={{ minHeight: 260 }}>
      <BrandLockup size="lg" tagline="p2p over iroh" />
      <p style={{ margin: "20px 0 0", maxWidth: 420, color: "var(--content-muted)", lineHeight: 1.6 }}>
        Every azula screen sits on this ground: near-black with a faint magenta
        radial wash. Peer-to-peer over iroh — no server in the middle.
      </p>
    </Screen>
  );
}
