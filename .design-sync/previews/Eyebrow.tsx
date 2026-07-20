import { Eyebrow } from "@azula/design-system";

export function WithIndex() {
  return (
    <div style={{ width: 420 }}>
      <Eyebrow index="01">content</Eyebrow>
    </div>
  );
}

export function LabelOnly() {
  return (
    <div style={{ width: 420 }}>
      <Eyebrow>connection</Eyebrow>
    </div>
  );
}
