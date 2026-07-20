import { BrandLockup } from "@azula/design-system";

export function LargeWithTagline() {
  return <BrandLockup size="lg" tagline="p2p over iroh" />;
}

export function Small() {
  return <BrandLockup size="sm" />;
}

export function NoCursor() {
  return <BrandLockup size="lg" cursor={false} />;
}
