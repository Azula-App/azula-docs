import { Tabs } from "@azula/design-system";

const sessionTabs = [
  {
    title: "Overview",
    content: (
      <p style={{ margin: 0, color: "var(--content-muted)", lineHeight: 1.5 }}>
        Session <span style={{ fontFamily: "var(--font-mono, monospace)" }}>k7-fox-ember</span> —
        direct · 12ms · e2e. Peer-to-peer over iroh, no server in the middle.
      </p>
    ),
  },
  {
    title: "Peers",
    content: (
      <ul style={{ margin: 0, paddingLeft: 18, color: "var(--content-muted)", lineHeight: 1.7 }}>
        <li>zuko — direct · 12ms</li>
        <li>mai — relay ams · 88ms</li>
        <li>ty lee — relay tok · 141ms</li>
      </ul>
    ),
  },
  {
    title: "Logs",
    content: (
      <pre
        style={{
          margin: 0,
          fontFamily: "var(--font-mono, monospace)",
          fontSize: 12,
          color: "var(--content-muted)",
          lineHeight: 1.6,
        }}
      >
        {"12:04:11 relay sfo connected (12ms)\n12:04:12 holepunch ok → direct\n12:04:12 path upgraded: direct · e2e"}
      </pre>
    ),
  },
];

export function SessionTabs() {
  return (
    <div style={{ maxWidth: 440 }}>
      <Tabs tabs={sessionTabs} defaultIndex={0} />
    </div>
  );
}

export function PeersSelected() {
  return (
    <div style={{ maxWidth: 440 }}>
      <Tabs tabs={sessionTabs} defaultIndex={1} />
    </div>
  );
}
