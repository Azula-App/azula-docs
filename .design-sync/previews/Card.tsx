import { Button, Card, InlineCode } from "@azula/design-system";

export function Raised() {
  return (
    <div style={{ maxWidth: 380 }}>
      <Card title="Session with zuko">
        <p style={{ margin: "0 0 12px", color: "var(--content-muted)", lineHeight: 1.5 }}>
          Direct path, end-to-end encrypted. Falls back to a relay, then upgrades to
          direct — no server in the middle.
        </p>
        <Button variant="primary">Open chat</Button>
      </Card>
    </div>
  );
}

export function Nested() {
  return (
    <div style={{ maxWidth: 380 }}>
      <Card title="Relay policy">
        <p style={{ margin: "0 0 12px", color: "var(--content-muted)", lineHeight: 1.5 }}>
          A nested card stays distinct with an outline — no depth tracking, no color math.
        </p>
        <Card variant="nested">
          Keep a backup relay on standby; encrypted packets only, metadata visible to the
          relay operator.
        </Card>
      </Card>
    </div>
  );
}

export function MutedPanel() {
  return (
    <div style={{ maxWidth: 380 }}>
      <Card variant="muted" title="peer chat">
        <p style={{ margin: 0, color: "var(--content-dim)" }}>
          Paste a friend's code — like <InlineCode>k7-fox-ember</InlineCode> — and you're
          talking over a direct, encrypted link. No account.
        </p>
      </Card>
    </div>
  );
}
