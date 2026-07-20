import { InlineCode } from "@azula/design-system";

export function InProse() {
  return (
    <p style={{ maxWidth: 440, margin: 0, fontSize: 14, lineHeight: 1.6 }}>
      Run <InlineCode>azula pair</InlineCode> on the first device, then open{" "}
      <InlineCode>https://azula.app/s/k7-fox-ember</InlineCode> on the second to
      finish the handshake.
    </p>
  );
}
