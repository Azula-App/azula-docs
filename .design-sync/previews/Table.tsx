import { Table } from "@azula/design-system";

export function Peers() {
  return (
    <div style={{ maxWidth: 520 }}>
      <Table
        head={["peer", "path", "latency", "status"]}
        rows={[
          ["zuko", "direct", "12ms", "connected"],
          ["mai", "relay ams", "88ms", "connected"],
          ["ty lee", "—", "—", "offline"],
        ]}
      />
    </div>
  );
}
