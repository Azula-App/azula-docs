import { AudioBar } from "@azula/design-system";

export function Playing() {
  return (
    <div style={{ maxWidth: 420 }}>
      <AudioBar progress={0.25} time="0:12 / 0:48" />
    </div>
  );
}

export function Done() {
  return (
    <div style={{ maxWidth: 420 }}>
      <AudioBar progress={1} time="0:48 / 0:48" />
    </div>
  );
}
